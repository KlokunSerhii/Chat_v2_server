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

// Користувачі: socketId => { username, avatar }
const users = new Map();

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.once("open", () => {
  console.log("✅ MongoDB connected");
});

io.on("connection", async (socket) => {
  const username = socket.handshake.query.username || "Гість";

  // Генеруємо унікальний аватар на основі username
  const avatar = `https://i.pravatar.cc/150?u=${encodeURIComponent(
    username
  )}`;

  users.set(socket.id, { username, avatar });

  // Віддаємо останні повідомлення
  const lastMessages = await Message.find()
    .sort({ timestamp: -1 })
    .limit(50);
  socket.emit("last-messages", lastMessages.reverse());

  // Повідомлення про нове підключення
  socket.broadcast.emit("user-joined", username);

  // Відправляємо оновлений список онлайн
  io.emit("online-users", Array.from(users.values()));

  socket.on("message", async (data) => {
    const typingUser = users.get(socket.id);

    socket.broadcast.emit(
      "user-typing",
      typingUser?.username || "Користувач"
    );

    setTimeout(async () => {
      const savedMsg = new Message({
        sender: "user",
        text: data.text,
        timestamp: new Date(),
        username: typingUser?.username || "Користувач",
      });
      await savedMsg.save();

      io.emit("message", {
        sender: "user",
        text: data.text,
        timestamp: savedMsg.timestamp,
        username: typingUser?.username || "Користувач",
      });
    }, 1000);
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      io.emit("user-left", user.username);
      users.delete(socket.id);
      io.emit("online-users", Array.from(users.values()));
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});
