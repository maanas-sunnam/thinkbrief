// filepath: c:\Users\Hp\Desktop\EXTRA\Backend\models\userHistory.js
const mongoose = require("mongoose");

const UserHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  documentId: {
    type: String,
    required: true,
  },
  documentTitle: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  summary: String,
  advantages: [String],
  limitations: [String],
  queries: [
    {
      question: String,
      answer: String,
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

const UserHistory = mongoose.models.UserHistory || mongoose.model('UserHistory', UserHistorySchema);

module.exports = UserHistory;