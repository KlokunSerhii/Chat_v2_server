import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  sender: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
  username: String,
  avatar: String,
  image: { type: String, default: null },
  reactions: {
    type: Map,
    of: [String],
    default: {},
  },
});

export default mongoose.model("Message", messageSchema);
