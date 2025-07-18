import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Message from "./models/Message.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import jwt from "jsonwebtoken";
import metadata from "url-metadata";
import messageRoutes from "./routes/messageRoutes.js";
import userRoutes from "./routes/usersRoutes.js";
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3001;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/chatdb";
const JWT_SECRET = process.env.JWT_SECRET;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cors({ origin: "*", credentials: true }));
app.use("/avatars", express.static("avatars"));
app.use("/api", uploadRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api", userRoutes);

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.once("open", () => {
  console.log("✅ MongoDB connected");
});

const users = new Map();

io.on("connection", async (socket) => {
  const token = socket.handshake.auth?.token;
  if (!token) return socket.disconnect(true);

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return socket.disconnect(true);
  }

  const { username, avatar, id: userId } = decoded;
  socket.data.userId = userId;
  socket.data.username = username;
  socket.data.avatar = avatar;

  if (!users.has(userId)) {
    users.set(userId, {
      username,
      avatar,
      sockets: new Set([socket.id]),
    });
  } else {
    users.get(userId).sockets.add(socket.id);
  }

  emitOnlineUsers();

  const lastMessages = await Message.find({
    $or: [
      { recipientId: null },
      { recipientId: userId },
      { senderId: userId },
    ],
  })
    .sort({ timestamp: -1 })
    .limit(100)
    .populate({
      path: "replyTo",
      select: "username text",
    });

  socket.emit("last-messages", lastMessages.reverse());

  socket.broadcast.emit("user-joined", {
    username,
    avatar,
    timestamp: new Date().toISOString(),
  });

  socket.on("message", async (data) => {
    const {
      text,
      image,
      video,
      audio,
      localId,
      recipientId,
      replyTo,
    } = data;

    const senderId = socket.data.userId;
    const username = socket.data.username;
    const avatar = socket.data.avatar;

    if (!senderId) return;
    let linkPreview = null;

    // Знайти перше посилання у тексті
    const urlMatch = text?.match(/https?:\/\/[^\s]+/);
    if (urlMatch && urlMatch[0]) {
      const url = urlMatch[0];

      // 🧠 Витягнення YouTube ID
      function extractYouTubeId(link) {
        const patterns = [
          /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^\s&?/]+)/, // звичайні відео
          /youtube\.com\/embed\/([^\s&?/]+)/, // embed
          /youtube\.com\/shorts\/([^\s&?/]+)/, // shorts
          /youtube\.com\/live\/([^\s&?/]+)/, // live
        ];

        for (const pattern of patterns) {
          const match = link.match(pattern);
          if (match) return match[1];
        }

        return null;
      }

      const ytId = extractYouTubeId(url);

      if (ytId) {
        // ✅ Спеціальний хак для YouTube прев’ю
        linkPreview = {
          title: "YouTube Video",
          description: "Watch this video on YouTube",
          image: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
          url,
        };
      } else {
        try {
          const meta = await metadata(url);

          // Перевірка на зображення
          let imageUrl =
            meta.image || meta["og:image"] || meta["twitter:image"];
          if (imageUrl?.startsWith("http:")) {
            imageUrl = imageUrl.replace(/^http:/, "https:");
          }

          linkPreview = {
            title: meta.title || url,
            description: meta.description || "",
            image: imageUrl || null,
            url: meta.url || url,
          };

          // Якщо посилання є, але немає картинки — краще не показувати прев’ю
          if (!linkPreview.image) {
            linkPreview = null;
          }
        } catch (err) {
          console.warn(
            "⚠️ Неможливо отримати мета-дані:",
            err.message
          );
        }
      }
    }

    try {
      const savedMsg = new Message({
        sender: "user",
        text,
        username,
        avatar,
        image: image || null,
        video: video || null,
        audio: audio || null,
        recipientId: recipientId || null,
        senderId,
        localId,
        replyTo:
          replyTo && typeof replyTo === "object"
            ? replyTo.id
            : replyTo || null,
        linkPreview,
      });

      await savedMsg.save();

      const fullMessage = {
        _id: savedMsg._id,
        sender: "user",
        text: savedMsg.text,
        timestamp: savedMsg.timestamp,
        username,
        avatar,
        image: savedMsg.image,
        video: savedMsg.video,
        audio: savedMsg.audio,
        localId,
        recipientId,
        senderId,
        replyTo: savedMsg.replyTo,
        linkPreview: savedMsg.linkPreview,
      };

      const sender = users.get(senderId);
      const recipient = recipientId ? users.get(recipientId) : null;

      if (sender) {
        for (const socketId of sender.sockets) {
          io.to(socketId).emit("message", fullMessage);
        }
      }

      if (recipient) {
        for (const socketId of recipient.sockets) {
          io.to(socketId).emit("message", fullMessage);
        }
      }

      if (!recipientId) {
        socket.broadcast.emit("message", fullMessage);
      }
    } catch (err) {
      console.error("❌ Помилка збереження повідомлення:", err);
    }
  });

  socket.on("typing", ({ recipientId }) => {
    // const { username, userId } = socket.data;
    if (!username) return;

    if (recipientId) {
      const recipient = users.get(recipientId);
      if (recipient) {
        for (const sid of recipient.sockets) {
          io.to(sid).emit("user-typing", socket.data);
        }
      }
    } else {
      socket.broadcast.emit("user-typing", socket.data);
    }
  });

  socket.on("toggle-reaction", async ({ messageId, emoji }) => {
    const username = socket.data.username;
    if (!username) return;

    let message;
    if (mongoose.Types.ObjectId.isValid(messageId)) {
      message = await Message.findById(messageId);
    } else {
      message = await Message.findOne({ localId: messageId });
    }
    if (!message) return;

    const reactions = message.reactions || [];
    const existingIndex = reactions.findIndex(
      (r) => r.emoji === emoji && r.username === username
    );

    if (existingIndex !== -1) {
      reactions.splice(existingIndex, 1);
    } else {
      reactions.push({ emoji, username });
    }

    message.reactions = reactions;
    await message.save();

    const fullMessage = message.toObject();
    fullMessage.localId = message.localId; // <- Додати це

    io.emit("reaction-update", fullMessage);
  });

  socket.on("delete-message", async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) return;

    try {
      await Message.findByIdAndDelete(id);
      io.emit("message-deleted", { id }); // повідомляємо всіх клієнтів
    } catch (e) {
      console.error(e);
    }
  });

  socket.on("disconnect", () => {
    const userId = socket.data.userId;
    if (users.has(userId)) {
      const user = users.get(userId);
      user.sockets.delete(socket.id);
      if (user.sockets.size === 0) {
        users.delete(userId);
        io.emit("user-left", {
          username: user.username,
          avatar: user.avatar,
          timestamp: new Date().toISOString(),
        });
      }
    }
    emitOnlineUsers();
    socket.removeAllListeners();
  });

  function emitOnlineUsers() {
    const uniqueUsers = [];

    for (const [userId, userData] of users.entries()) {
      uniqueUsers.push({
        id: userId,
        username: userData.username,
        avatar: userData.avatar,
      });
    }

    io.emit("online-users", uniqueUsers);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});
