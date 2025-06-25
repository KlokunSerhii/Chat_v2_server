import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  text: { type: String, required: false },
  username: { type: String, required: true },
  avatar: { type: String },
  image: { type: String },
  audio: { type: String, default: null },
  video: { type: String, default: null },
  timestamp: { type: Date, default: Date.now },
  reactions: [
    {
      emoji: String,
      username: String,
    },
  ],
});

export default mongoose.model("Message", messageSchema);