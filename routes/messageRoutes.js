import express from "express";
import Message from "../models/Message.js";
import mongoose from "mongoose";

const router = express.Router();

// PATCH /api/messages/:id/react
router.patch("/:id/react", async (req, res) => {
  const { id } = req.params;
  const { emoji, username, isRemoving } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid message ID" });
  }
  try {
    const message = await Message.findById(req.params.id);
    if (!message)
      return res.status(404).json({ error: "Message not found" });

    const users = message.reactions.get(emoji) || [];

    const updatedUsers = isRemoving
      ? users.filter((u) => u !== username)
      : [...new Set([...users, username])];

    if (updatedUsers.length > 0) {
      message.reactions.set(emoji, updatedUsers);
    } else {
      message.reactions.delete(emoji); // очищуємо emoji
    }

    await message.save();
    res.json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
