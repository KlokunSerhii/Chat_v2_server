import express from "express";
import Message from "../models/Message.js";
import mongoose from "mongoose";

const router = express.Router();

// PATCH /api/messages/:id/react
router.patch("/:id/react", async (req, res) => {
  const id = req.params;
  const { emoji, username, isRemoving } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid message ID" });
  }
  try {
    const message = await Message.findById(id);
    if (!message)
      return res.status(404).json({ error: "Message not found" });

    if (!message.reactions) {
      message.reactions = {};
    }

    const currentUsers = new Set(message.reactions[emoji] || []);

    if (isRemoving) {
      currentUsers.delete(username);
    } else {
      currentUsers.add(username);
    }

    if (currentUsers.size > 0) {
      message.reactions[emoji] = Array.from(currentUsers);
    } else {
      delete message.reactions[emoji]; // Remove the emoji key if no users left
    }

    await message.save();
    res.json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
