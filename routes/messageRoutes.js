import express from "express";
import Message from "../models/Message.js";
import mongoose from "mongoose";
import { authenticateToken } from "../middleware/middleware.js";

const router = express.Router();

// PATCH /api/messages/:id/react
router.patch("/:id/react", async (req, res) => {
  const rawId = req.params.id;
  const id = typeof rawId === "object" && rawId.id ? rawId.id : rawId;

  const { emoji, username, isRemoving } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid message ID" });
  }

  try {
    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const users = new Set(message.reactions[emoji] || []);

    const updatedUsers = isRemoving
      ? [...users].filter((u) => u !== username)
      : [...new Set([...users, username])];

    if (updatedUsers.length > 0) {
      message.reactions.set(emoji, updatedUsers);
    } else {
      message.reactions.delete(emoji);
    }

    await message.save();
    res.json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    let message;

    // Перевіряємо, чи валідний id як ObjectId
    if (mongoose.Types.ObjectId.isValid(id)) {
      message = await Message.findById(id);
    }

    // Якщо по ObjectId не знайдено, шукаємо по localId
    if (!message) {
      message = await Message.findOne({ localId: id });
    }

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }
    if (message.username !== req.user.username) {
      return res
        .status(403)
        .json({ error: "Forbidden: cannot delete others' messages" });
    }

    await message.deleteOne();

    res.json({ message: "Message deleted", id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
