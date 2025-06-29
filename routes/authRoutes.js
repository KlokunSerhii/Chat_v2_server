// routes/authRoutes.js
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { authenticateToken } from "../middleware/middleware.js";

const router = express.Router();
const SECRET = process.env.JWT_SECRET || "mysecret";

// 🔐 Реєстрація або логін
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Ім’я та пароль обов’язкові" });
  }

  try {
    const user = await User.findOne({ username });

    if (!user) {
      return res
        .status(404)
        .json({ message: "Користувача не знайдено" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Невірний пароль" });
    }

    const token = jwt.sign(
      { username: user.username, avatar: user.avatar, id: user._id },
      SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        username: user.username,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Помилка сервера" });
  }
});

router.post("/register", async (req, res) => {
  const { username, password, avatar } = req.body;

  if (!username || !password || !avatar) {
    return res
      .status(400)
      .json({ message: "Ім’я, пароль і аватар обов’язкові" });
  }

  try {
    const existingUser = await User.findOne({ username });

    if (existingUser) {
      return res
        .status(409)
        .json({ message: "Користувач з таким іменем вже існує" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = new User({ username, passwordHash, avatar });
    await newUser.save();

    const token = jwt.sign(
      {
        username: newUser.username,
        avatar: newUser.avatar,
        id: newUser._id,
      },
      SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        username: newUser.username,
        avatar: newUser.avatar,
      },
    });
  } catch (err) {
    console.error("❌ Register error:", err);
    res.status(500).json({ message: "Помилка сервера" });
  }
});

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "username avatar"
    );
    if (!user)
      return res.status(404).json({ message: "User not found" });

    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
