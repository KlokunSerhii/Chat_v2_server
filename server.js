import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";

const PORT = 3001;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/chatdb"; // можеш винести в .env

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const messageSchema = new mongoose.Schema({
  sender: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
  username: String,
});

const Message = mongoose.model("Message", messageSchema);
const users = new Map();

// 📌 Підключення до MongoDB, запуск серверу ПІСЛЯ підключення
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error:", err);
});

mongoose.connection.once("open", () => {
  console.log("✅ MongoDB connected");

  io.on("connection", async (socket) => {
    const username = socket.handshake.query.username || "Гість";
    users.set(socket.id, username);

    try {
      const lastMessages = await Message.find()
        .sort({ timestamp: -1 })
        .limit(50);
      lastMessages.reverse();

      socket.emit("last-messages", lastMessages);
    } catch (err) {
      console.error("❌ Error fetching messages:", err.message);
    }

    socket.broadcast.emit("user-joined", username);

    socket.on("message", async (data) => {
      const typingUser = users.get(socket.id);

      socket.broadcast.emit("user-typing", typingUser);

      setTimeout(async () => {
        try {
          const savedMsg = new Message({
            sender: "user",
            text: data.text,
            timestamp: new Date(),
            username: typingUser,
          });
          await savedMsg.save();

          io.emit("message", {
            sender: "user",
            text: data.text,
            timestamp: savedMsg.timestamp,
            username: typingUser,
          });
        } catch (err) {
          console.error("❌ Failed to save message:", err.message);
        }
      }, 1000);
    });

    socket.on("disconnect", () => {
      io.emit("user-left", users.get(socket.id));
      users.delete(socket.id);
    });
  });

  // Запускаємо сервер тільки після успішного підключення до бази
  server.listen(PORT, () => {
    console.log(`🚀 Socket.IO server running on port ${PORT}`);
  });
});
