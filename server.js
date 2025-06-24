import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Message from "./models/Message.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import messageRouters from "./routes/messageRoutes.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});
const PORT = process.env.PORT || 3001;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/chatdb";

app.use(express.json());
app.use(cors());
app.use("/avatars", express.static("avatars"));
app.use("/", uploadRoutes);
app.use("/api/messages", messageRouters);

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.once("open", () => {
  console.log("✅ MongoDB connected");
});

const users = new Map();

io.on("connection", async (socket) => {
  const username = socket.handshake.query.username || "Гість";
  const avatar =
    socket.handshake.query.avatar ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
      username
    )}`;

  users.set(socket.id, { username, avatar });

  const lastMessages = await Message.find()
    .sort({ timestamp: -1 })
    .limit(50);
  socket.emit("last-messages", lastMessages.reverse());
  socket.emit("online-users", Array.from(users.values()));
  socket.broadcast.emit("user-joined", username);

  socket.on("message", async (data) => {
    const { text, username: name, avatar, image } = data;

    const savedMsg = new Message({
      sender: "user",
      text,
      username: name,
      avatar,
      image: image || null,
    });
    await savedMsg.save();

    io.emit("message", {
      id: savedMsg._id,
      sender: "user",
      text,
      timestamp: savedMsg.timestamp,
      username: name,
      avatar,
      image: image || null,
    });
  });

  socket.on("react", async ({ messageId, emoji, remove }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = await Message.findOne({ _id: messageId });
    if (!message) return;

    const username = user.username;
    const reactions = message.reactions || {};

    if (!reactions[emoji]) {
      reactions[emoji] = [];
    }

    if (remove) {
      // Видалити реакцію користувача
      reactions[emoji] = reactions[emoji].filter(
        (u) => u !== username
      );
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    } else {
      // Додати реакцію
      if (!reactions[emoji].includes(username)) {
        reactions[emoji].push(username);
      }
    }

    message.reactions = reactions;
    await message.save();
    // io.emit("react", { messageId, emoji, username, remove });
    console.log(
      "🔁 emitting updated reactions for",
      messageId,
      reactions
    );

    io.emit("reaction-updated", {
      messageId,
      reactions: JSON.parse(JSON.stringify(reactions)),
    });
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      io.emit("user-left", user.username);
      users.delete(socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});
