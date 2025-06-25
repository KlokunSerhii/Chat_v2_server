import express from "express";
import multer from "multer";
import fs from "fs";
import util from "util";
import cloudinary from "../utils/cloudinary.js";

const router = express.Router();
const unlinkAsync = util.promisify(fs.unlink);

// ⬇️ Створення директорії avatars/ якщо її немає
const dir = "avatars";
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Multer конфіг
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "avatars/"),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// Завантаження аватарки
router.post(
  "/upload-avatar",
  upload.single("avatar"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ error: "Файл не завантажено" });

    try {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "avatars",
      });
      await unlinkAsync(req.file.path);
      res.json({ avatarUrl: result.secure_url });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: "Помилка при завантаженні аватарки" });
    }
  }
);

// Завантаження зображення з чату
router.post("/send-file", upload.single("file"), async (req, res) => {
  if (!req.file)
    return res.status(400).json({ error: "Файл не завантажено" });

  try {
    let resourceType = "image";
    if (req.file.mimetype.startsWith("video/")) {
      resourceType = "video";
    } else if (req.file.mimetype.startsWith("audio/")) {
      resourceType = "video"; // для Cloudinary аудіо — це теж video
    } else {
      resourceType = "auto";
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "chat-uploads",
      resource_type: resourceType,
    });

    await unlinkAsync(req.file.path);
    res.json({
      url: result.secure_url,
      type: req.file.mimetype,
    });
  } catch (err) {
    console.error("Upload error:", err.message, err);
    res
      .status(500)
      .json({ error: "Помилка при завантаженні зображення" });
  }
});

export default router;
