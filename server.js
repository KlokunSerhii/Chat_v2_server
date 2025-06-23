import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import moment from "moment";
import cloudinary from "cloudinary";
import util from "util"; // Для видалення локальних файлів після завантаження на Cloudinary

const PORT = 3001;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/chatdb";

const app = express();
app.use(
  cors({
    origin: "*", // Дозволяє запити з усіх доменів
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Налаштування Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // Ваш Cloudinary Cloud Name
  api_key: process.env.CLOUDINARY_API_KEY, // Ваш API Key
  api_secret: process.env.CLOUDINARY_API_SECRET, // Ваш API Secret
});

// Оновлена схема — додано поле image (Base64-рядок або null)
const messageSchema = new mongoose.Schema({
  sender: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
  username: String,
  avatar: String,
  image: { type: String, default: null },
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
      image: msg.image || null,
    }))
  );

  socket.emit("online-users", usersArray);

  socket.broadcast.emit("user-joined", username);

  socket.on("message", async (data) => {
    const { text, username: name, avatar, image } = data;
    const savedMsg = new Message({
      sender: "user",
      text,
      timestamp: new Date(),
      username: name,
      avatar,
      image: image || null,
    });
    await savedMsg.save();

    io.emit("message", {
      sender: "user",
      text,
      timestamp: savedMsg.timestamp,
      username: name,
      avatar,
      image: image || null,
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

// Multer storage для локального збереження
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Зберігаємо в папці "uploads"
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname); // Генерація унікального імені файлу
  },
});

const upload = multer({ storage });

// Статичний доступ до файлів
app.use("/uploads", express.static("uploads"));

// POST /upload-avatar (завантаження на Cloudinary)
app.post(
  "/upload-avatar",
  upload.single("avatar"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Файл не завантажено" });
    }

    try {
      // Завантаження файлу на Cloudinary
      const result = await cloudinary.v2.uploader.upload(
        req.file.path,
        {
          folder: "avatars", // Вказуємо папку в Cloudinary
        }
      );

      // Повертаємо URL аватарки з Cloudinary
      const avatarUrl = result.secure_url;

      // Видалення локального файлу після завантаження на Cloudinary
      const unlinkAsync = util.promisify(fs.unlink);
      await unlinkAsync(req.file.path);

      res.json({ avatarUrl }); // Відправляємо URL аватарки
    } catch (err) {
      res
        .status(500)
        .json({ error: "Помилка завантаження на Cloudinary" });
      console.error(err);
    }
  }
);

// POST /send-message (завантаження зображення для повідомлень)
app.post(
  "/send-message",
  upload.single("image"),
  async (req, res) => {
    try {
      const { text, username, avatar } = req.body;
      let imageUrl = null;

      // Якщо є зображення, завантажуємо на Cloudinary
      if (req.file) {
        const result = await cloudinary.v2.uploader.upload(
          req.file.path,
          {
            folder: "chat-images", // Вказуємо папку на Cloudinary для зображень
          }
        );

        imageUrl = result.secure_url;

        // Видалення локального файлу після завантаження на Cloudinary
        const unlinkAsync = util.promisify(fs.unlink);
        await unlinkAsync(req.file.path);
      }

      // Створення повідомлення з текстом та URL зображення
      const newMessage = new Message({
        sender: username,
        text,
        avatar,
        image: imageUrl,
      });

      // Збереження повідомлення в базі даних
      await newMessage.save();

      // Надсилаємо нове повідомлення всім клієнтам
      io.emit("message", {
        sender: username,
        text,
        avatar,
        image: imageUrl,
        timestamp: new Date(),
      });

      res
        .status(200)
        .send({ message: "Message sent successfully", imageUrl });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Error while sending message" });
    }
  }
);

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
