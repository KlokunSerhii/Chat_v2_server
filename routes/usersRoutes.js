import express from "express";
import User from "../models/User.js";

import { authenticateToken } from "../middleware/middleware.js";

const router = express.Router();

router.get("/users", authenticateToken, async (req, res) => {
  const users = await User.find({}, "id username avatar");
});

export default router;
