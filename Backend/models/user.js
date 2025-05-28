const mongoose = require("mongoose");
const Counter = require("./counters");

// Function to get the next sequence value for user_id
const getNextSequence = async (sequenceName) => {
  const counter = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { seq: 1 } },
    { new: true, upsert: true } // Create the counter if it doesn't exist
  );
  return counter.seq;
};

const userSchema = new mongoose.Schema({
  user_id: {
    type: Number,
    unique: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save hook to assign user_id before saving
userSchema.pre("save", async function(next) {
  // Only set user_id if it's a new user (not during updates)
  if (this.isNew) {
    try {
      this.user_id = await getNextSequence("userId");
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

module.exports = mongoose.model("User", userSchema);