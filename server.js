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
  avatar: String, // додали поле для аватара
});

const Message = mongoose.model("Message", messageSchema);

// Map зберігатиме user info, не просто username
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
  // Створюємо avatar URL з username (seed)
  const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
    username
  )}`;

  // Зберігаємо в users обʼєкт із username + avatar
  users.set(socket.id, { username, avatar });

  // Віддаємо масив обʼєктів користувачів
  const usersArray = Array.from(users.values());

  // Надсилаємо останні повідомлення
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
      avatar: msg.avatar, // має бути тут
    }))
  );
  socket.emit("online-users", usersArray);
  socket.broadcast.emit("user-joined", username);

  socket.on("message", async (data) => {
    // data має містити text, username, avatar
    const savedMsg = new Message({
      sender: "user",
      text: data.text,
      timestamp: new Date(),
      username: data.username,
      avatar: data.avatar,
    });
    await savedMsg.save();

    io.emit("message", {
      sender: "user",
      text: data.text,
      timestamp: savedMsg.timestamp,
      username: data.username,
      avatar: data.avatar,
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
  console.log(`Socket.IO server running on port ${PORT}`);
});
