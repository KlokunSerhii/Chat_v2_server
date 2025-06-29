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
app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);
app.use("/avatars", express.static("avatars"));
app.use("/api", uploadRoutes);
app.use("/api/auth", authRoutes);

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

  if (!token) {
    socket.disconnect(true);
    return;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    socket.disconnect(true);
    return;
  }

  const { username, avatar, id: userId } = decoded;

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

  const lastMessages = await Message.find()
    .sort({ timestamp: -1 })
    .limit(50);

  socket.emit("last-messages", lastMessages.reverse());

  socket.broadcast.emit("user-joined", {
    username,
    avatar,
    timestamp: new Date().toISOString(),
  });

  socket.on("message", async (data) => {
    const { text, username, avatar, image, video, audio, localId } =
      data;

    try {
      const savedMsg = new Message({
        sender: "user",
        text,
        username,
        avatar,
        image: image || null,
        video: video || null,
        audio: audio || null,
      });

      await savedMsg.save();

      io.emit("message", {
        _id: savedMsg._id,
        sender: "user",
        text: savedMsg.text,
        timestamp: savedMsg.timestamp,
        username: savedMsg.username,
        avatar: savedMsg.avatar,
        image: savedMsg.image,
        video: savedMsg.video,
        audio: savedMsg.audio,
        localId,
      });
    } catch (err) {
      console.error("❌ Помилка збереження повідомлення:", err);
    }
  });

  socket.on("toggle-reaction", async ({ messageId, emoji }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = await Message.findById(messageId);
    if (!message) return;

    const reactions = message.reactions || [];

    const existingIndex = reactions.findIndex(
      (r) => r.emoji === emoji && r.username === user
    );

    if (existingIndex !== -1) {
      // Якщо реакція вже існує — видаляємо
      reactions.splice(existingIndex, 1);
    } else {
      // Якщо немає — додаємо
      reactions.push({ emoji, username: user });
    }

    message.reactions = reactions;
    await message.save();

    io.emit("reaction-update", {
      messageId,
      reactions: message.reactions,
    });
  });

  socket.on("disconnect", () => {
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
    const uniqueUsersMap = new Map();

    for (const user of users.values()) {
      if (!uniqueUsersMap.has(user.username)) {
        uniqueUsersMap.set(user.username, user);
      }
    }

    const uniqueUsers = Array.from(uniqueUsersMap.values());
    io.emit("online-users", uniqueUsers);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});
