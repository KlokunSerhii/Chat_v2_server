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
  recipientId: {
    type: String,
    default: null,
  },
  senderId: {
    type: String,
    required: true,
  },
  localId: {
    type: String,
    required: false,
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    default: null,
  },
  linkPreview: {
  title: String,
  description: String,
  image: String,
  url: String,
},
});

export default mongoose.model("Message", messageSchema);
