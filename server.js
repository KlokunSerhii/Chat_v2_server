import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";

const PORT = 3001;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/chatdb";

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

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.once("open", () => {
  console.log("MongoDB connected");
});

io.on("connection", async (socket) => {
  const username = socket.handshake.query.username || "Гість";
  users.set(socket.id, username);

  const lastMessages = await Message.find()
    .sort({ timestamp: -1 })
    .limit(50);
  lastMessages.reverse();

  socket.emit("last-messages", lastMessages);
  socket.broadcast.emit("user-joined", username);

  // Оновлюємо список онлайн користувачів для всіх
  io.emit("online-users", Array.from(users.values()));

  socket.on("message", async (data) => {
    const typingUser = users.get(socket.id);

    // Повідомляємо інших, що користувач друкує
    socket.broadcast.emit("user-typing", typingUser);

    // Імітація затримки перед надсиланням
    setTimeout(async () => {
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
    }, 1000); // 1 секунда затримки
  });

  socket.on("disconnect", () => {
    io.emit("user-left", users.get(socket.id));
    users.delete(socket.id);

    // Оновлюємо список онлайн користувачів після відключення
    io.emit("online-users", Array.from(users.values()));
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
