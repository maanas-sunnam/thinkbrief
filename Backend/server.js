const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const axios = require("axios"); // Add axios for making HTTP requests to Flask
const UserHistory = require('./models/UserHistory');
const Counter = require("./models/counters");

// Initialize userId counter in the database
const initDatabase = async () => {
  try {
    // Check if userId counter exists, if not create it starting from 0
    const counter = await Counter.findById("userId");
    if (!counter) {
      await Counter.create({ _id: "userId", seq: 0 });
      console.log("User ID counter initialized successfully");
    } else {
      console.log("User ID counter already exists");
    }
  } catch (error) {
    console.error("Error initializing database:", error);
  }
};

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Configure Flask server URL
const FLASK_SERVER_URL = process.env.FLASK_SERVER_URL || "http://localhost:5005";

// --- Auth + Upload routes ---
// Make sure these routes are properly imported and contain route handlers
const authRoutes = require("./routes/auth");
const uploadRoutes = require("./routes/upload");

// Check if authRoutes and uploadRoutes are valid middleware functions before using them
if (typeof authRoutes === 'function') {
  app.use("/", authRoutes);
} else {
  console.error("authRoutes is not a function. Check your routes/auth.js file.");
}

if (typeof uploadRoutes === 'function') {
  app.use("/", uploadRoutes);
} else {
  console.error("uploadRoutes is not a function. Check your routes/upload.js file.");
}

// --- Ensure 'uploads' folder exists ---
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// --- MongoDB Schema Definitions ---


// Schema for deleted history items
const deletedHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  documentId: {
    type: String,
    required: true
  },
  documentTitle: {
    type: String,
    required: true
  },
  originalTimestamp: {
    type: Date,
    required: true
  },
  deletedAt: {
    type: Date,
    default: Date.now
  },
  summary: String,
  advantages: [String],
  limitations: [String],
  queries: [{
    question: String,
    answer: String,
    timestamp: Date
  }]
});

const DeletedHistory = mongoose.model('DeletedHistory', deletedHistorySchema);

// Authentication middleware
const authMiddleware = (req, res, next) => {
  // This is a placeholder. In a real app, you would validate a token
  // and set req.user based on that token.
  // For testing purposes, setting a dummy user:
  // req.user = { _id: new mongoose.Types.ObjectId() };
  req.user = { userId: new mongoose.Types.ObjectId("64f3e2c15f7c48c39e32a9b0") }; // Use the actual ObjectId from your database for testing
  next();
};

// Place this middleware before your routes
app.use((req, res, next) => {
  req.user = { _id: "64f3e2c15f7c48c39e32a9b0" }; // Use the ID from your MongoDB
  next();
});

// Apply authentication middleware to all API routes
app.use('/api', authMiddleware);

// --- FLASK SERVER PROXY ROUTES ---

// Upload document to Flask
app.post("/api/upload", async (req, res) => {
  try {
    // Create a form data object to send to Flask
    const form = new FormData();
    form.append('file', req.files.file.data, {
      filename: req.files.file.name,
      contentType: req.files.file.mimetype
    });

    // Forward the request to Flask with the user ID in headers
    const response = await axios.post(`${FLASK_SERVER_URL}/upload`, form, {
      headers: {
        ...form.getHeaders(),
        'User-ID': req.user._id.toString()
      }
    });

    // Return Flask's response
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error uploading file to Flask:", error);
    return res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to upload file" });
  }
});

// Generate summary
app.post("/api/generate_summary", async (req, res) => {
  try {
    // Forward the request to Flask with the user ID in headers
    const response = await axios.post(`${FLASK_SERVER_URL}/generate_summary`, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'User-ID': req.user._id.toString()
      }
    });

    // Return Flask's response
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error generating summary:", error);
    return res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to generate summary" });
  }
});

// Ask question
app.post("/api/ask", async (req, res) => {
  try {
    // Forward the request to Flask with the user ID in headers
    const response = await axios.post(`${FLASK_SERVER_URL}/ask`, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'User-ID': req.user._id.toString()
      }
    });

    // Return Flask's response
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error asking question:", error);
    return res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to ask question" });
  }
});

// Summarize text
app.post("/api/summarize_text", async (req, res) => {
  try {
    // Forward the request to Flask
    const response = await axios.post(`${FLASK_SERVER_URL}/summarize_text`, req.body, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Return Flask's response
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error summarizing text:", error);
    return res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to summarize text" });
  }
});

// --- Get User History Route (MongoDB Only) ---
app.get("/api/history", async (req, res) => {
  try {
    console.log("Fetching history...");
    // Get all documents from userhistories collection
    const history = await UserHistory.find({})
      .select('documentId documentTitle timestamp summary advantages limitations queries')
      .sort({ timestamp: -1 })
      .lean();

    console.log("Found history items:", history.length);
    return res.status(200).json(history);
  } catch (error) {
    console.error("Error fetching history:", error);
    return res.status(500).json({ error: "Failed to fetch history" });
  }
});

// Get document details
app.get("/api/document/:docId", async (req, res) => {
  try {
    // Forward the request to Flask with the user ID in headers
    const response = await axios.get(`${FLASK_SERVER_URL}/document/${req.params.docId}`, {
      headers: {
        'User-ID': req.user._id.toString()
      }
    });

    // Return Flask's response
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error fetching document details:", error);
    return res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to fetch document details" });
  }
});

// Delete document
app.delete("/api/document/:docId", async (req, res) => {
  try {
    // Forward the request to Flask with the user ID in headers
    const response = await axios.delete(`${FLASK_SERVER_URL}/delete/${req.params.docId}`, {
      headers: {
        'User-ID': req.user._id.toString()
      }
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error deleting document:", error);
    return res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to delete document" });
  }
});

// --- Delete Single History Item Route ---
app.delete("/api/history/:id", async (req, res) => {
  try {
    // Find the history item to be deleted
    const historyItem = await UserHistory.findOne({ 
      _id: req.params.id,
      userId: req.user._id  // Fixed: using userId instead of userID
    });
    
    if (!historyItem) {
      return res.status(404).json({ error: "History item not found" });
    }
    
    // Create entry in DeletedHistory collection
    const deletedItem = new DeletedHistory({
      userId: historyItem.userId,
      documentId: historyItem.documentId,
      documentTitle: historyItem.documentTitle,
      originalTimestamp: historyItem.timestamp,
      deletedAt: new Date(),
      summary: historyItem.summary,
      advantages: historyItem.advantages,
      limitations: historyItem.limitations,
      queries: historyItem.queries
    });
    
    await deletedItem.save();
    
    // Delete the original history item
    await UserHistory.deleteOne({ _id: req.params.id, userId: req.user._id });
    
    // No need to call Flask for deletion - focusing only on MongoDB
    
    return res.status(200).json({ message: "History item deleted and archived" });
  } catch (error) {
    console.error("Error deleting history item:", error);
    return res.status(500).json({ error: "Failed to delete history item" });
  }
});

// --- Delete All History Items Route ---
app.delete("/api/history-all", async (req, res) => {
  try {
    // Find all history items for this user
    const historyItems = await UserHistory.find({ userId: req.user._id });
    
    // Create entries in DeletedHistory collection for each item
    const deletedItems = historyItems.map(item => ({
      userId: item.userId,
      documentId: item.documentId,
      documentTitle: item.documentTitle,
      originalTimestamp: item.timestamp,
      deletedAt: new Date(),
      summary: item.summary,
      advantages: item.advantages,
      limitations: item.limitations,
      queries: item.queries
    }));
    
    if (deletedItems.length > 0) {
      await DeletedHistory.insertMany(deletedItems);
    }
    
    // Delete all history items for this user
    await UserHistory.deleteMany({ userId: req.user._id });
    
    // No need to call Flask for deletion - focusing only on MongoDB
    
    return res.status(200).json({ message: "All history items deleted and archived" });
  } catch (error) {
    console.error("Error deleting all history items:", error);
    return res.status(500).json({ error: "Failed to delete history items" });
  }
});

// --- Connect MongoDB ---
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/thinkbriefDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("MongoDB connected");
    await initDatabase(); // <-- Call the function after MongoDB connects
    // Check Flask server connectivity
    axios.get(`${FLASK_SERVER_URL}/`)
      .then(() => console.log("Flask server connected"))
      .catch(err => console.warn("Warning: Flask server not reachable:", err.message));
    
    app.listen(process.env.PORT || 5000, () =>
      console.log(`Server running on port ${process.env.PORT || 5000}`)
    );
  })
  .catch((err) => console.error("MongoDB connection error:", err));