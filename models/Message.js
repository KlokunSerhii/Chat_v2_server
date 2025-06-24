import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
   _id: {
    type: String,
    default: () => uuidv4(),
  },
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
