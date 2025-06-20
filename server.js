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
  avatar: String,
});

const Message = mongoose.model("Message", messageSchema);
const users = new Map();

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

io.on("connection", async (socket) => {
  const username = socket.handshake.query.username || "Гість";
  const avatar = `https://api.dicebear.com/7.x/thumbs/svg?seed=${username}`;
  users.set(socket.id, { username, avatar });

  const lastMessages = await Message.find()
    .sort({ timestamp: -1 })
    .limit(50);
  lastMessages.reverse();
  socket.emit("last-messages", lastMessages);

  socket.broadcast.emit("user-joined", username);

  io.emit("online-users", Array.from(users.values()));

  socket.on("message", async (data) => {
    const userData = users.get(socket.id);

    socket.broadcast.emit("user-typing", userData.username);

    setTimeout(async () => {
      const savedMsg = new Message({
        sender: "user",
        text: data.text,
        timestamp: new Date(),
        username: userData.username,
        avatar: userData.avatar,
      });
      await savedMsg.save();

      io.emit("message", {
        sender: "user",
        text: data.text,
        timestamp: savedMsg.timestamp,
        username: userData.username,
        avatar: userData.avatar,
      });
    }, 1000);
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      io.emit("user-left", user.username);
    }
    users.delete(socket.id);
    io.emit("online-users", Array.from(users.values()));
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
