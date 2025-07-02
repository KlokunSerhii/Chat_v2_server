import express from "express";
import User from "../models/User.js";

import { authenticateToken } from "../middleware/middleware.js";

const router = express.Router();

router.get("/users", authenticateToken, async (req, res) => {
  try {
    const users = await User.find({}, "id username avatar");
    res.json({ users }); // <-- ось що потрібно
  } catch (error) {
    console.error("Помилка при отриманні користувачів:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

export default router;
