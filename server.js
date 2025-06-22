import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import multer from "multer";
import fs from "fs";
import moment from "moment";

const PORT = 3001;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/chatdb";

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Оновлена схема — додано поле image (Base64-рядок або null)
const messageSchema = new mongoose.Schema({
  sender: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
  username: String,
  avatar: String,
  image: { type: String, default: null }, // ← додано
});

const Message = mongoose.model("Message", messageSchema);

const users = new Map();

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.once("open", () => {
  console.log("MongoDB connected");
});

io.on("connection", async (socket) => {
  const username = socket.handshake.query.username || "Гість";
  const avatar =
    socket.handshake.query.avatar ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
      username
    )}`;

  users.set(socket.id, { username, avatar });

  const usersArray = Array.from(users.values());

  // Завантажуємо останні повідомлення з урахуванням поля image
  const lastMessages = await Message.find()
    .sort({ timestamp: -1 })
    .limit(50);
  lastMessages.reverse();

  socket.emit(
    "last-messages",
    lastMessages.map((msg) => ({
      text: msg.text,
      sender: msg.sender,
      timestamp: msg.timestamp,
      username: msg.username,
      avatar: msg.avatar,
      image: msg.image || null, // ← додано
    }))
  );

  socket.emit("online-users", usersArray);
  socket.broadcast.emit("user-joined", username);

  socket.on("message", async (data) => {
    // Розпаковуємо поле image
    const { text, username: name, avatar, image } = data;
    console.log("⌨️  отримано data від клієнта:", data);

    // Зберігаємо повідомлення разом з image
    const savedMsg = new Message({
      sender: "user",
      text,
      timestamp: new Date(),
      username: name,
      avatar,
      image: image || null, // ← додано
    });
    await savedMsg.save();

    // Відправляємо повідомлення усім, включаючи image
    io.emit("message", {
      sender: "user",
      text,
      timestamp: savedMsg.timestamp,
      username: name,
      avatar,
      image: image || null, // ← додано
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
// ПАПКА для збереження аватарок
const avatarsDir = path.resolve("avatars");
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir);
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "avatars/");
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// ─────────────────────────────────────────────
// Статичний доступ до файлів
app.use("/avatars", express.static("avatars"));

// ─────────────────────────────────────────────
// POST /upload-avatar
app.post("/upload-avatar", upload.single("avatar"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Файл не завантажено" });
  }
  const avatarUrl = `/avatars/${req.file.filename}`;
  res.json({ avatarUrl });
});

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
