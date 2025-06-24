import express from "express";
import Message from "../models/Message.js";

const router = express.Router();

// PATCH /api/messages/:id/react
router.patch("/:id/react", async (req, res) => {
  const { emoji, username, isRemoving } = req.body;

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
