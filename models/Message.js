import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  text: { type: String, required: false },
  username: { type: String, required: true },
  avatar: { type: String },
  image: { type: String },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model("Message", messageSchema);