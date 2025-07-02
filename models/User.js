import mongoose from "mongoose";
import { type } from "os";

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  avatar: { type: String, required: true },
});

// Додаємо віртуальне поле id, яке повертає _id як рядок
userSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

userSchema.set("toJSON", {
  virtuals: true,
});

const User = mongoose.model("User", userSchema);

export default User;
