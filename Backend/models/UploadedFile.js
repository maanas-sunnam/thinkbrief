// models/uploadfile.js
const mongoose = require("mongoose");

const uploadedFileSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  mimetype: String,
  path: String,
  url: String, // Public access URL for file or image
  size: Number,
  type: {
    type: String,
    enum: ["document", "image"],
    default: "document",
  },
  summary: {
    type: String,
    default: "",
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("UploadedFile", uploadedFileSchema);
