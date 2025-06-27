import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET;


export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id: ..., username: ... }
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid token" });
  }
};