import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Message from "./models/Message.js";
import uploadRoutes from "./routes/uploadRoutes.js";


dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});
const PORT = process.env.PORT || 3001;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/chatdb";


app.use(cors());
app.use("/avatars", express.static("avatars"));
app.use("/", uploadRoutes);

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
  const avatar = socket.handshake.query.avatar || null;

  users.set(socket.id, { username, avatar });

  const lastMessages = await Message.find()
    .sort({ timestamp: -1 })
    .limit(50);


  socket.emit("last-messages", lastMessages.reverse());
  socket.emit("online-users", Array.from(users.values()));
  socket.broadcast.emit("user-joined", username);

  socket.on("message", async (data) => {
  const { text, username, avatar, image } = data;

  try {
    const savedMsg = new Message({
      sender: "user",
      text,
      username,
      avatar,
      image: image || null,
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
    });
  } catch (err) {
    console.error("❌ Помилка збереження повідомлення:", err);
  }
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
