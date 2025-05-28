const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const UserHistory = require("../models/UserHistory");

// Secret key - consider moving to .env
const SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// User Schema
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  created: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
// Your upload route handlers go here
// For example:
router.post("/api/save-history", async (req, res) => {
  try {
    const { documentId, documentTitle, summary, advantages, limitations } = req.body;
    
    // Create new history entry
    const newHistory = new UserHistory({
      userId: req.user._id,
      documentId,
      documentTitle,
      summary,
      advantages,
      limitations
    });
    
    await newHistory.save();
    
    return res.status(200).json({ message: "History saved successfully", history: newHistory });
  } catch (error) {
    console.error("Error saving history:", error);
    return res.status(500).json({ error: "Failed to save history" });
  }
});

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.header('x-auth-token') || 
                 (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
    
    if (!token) return res.status(401).json({ error: "Authentication required" });
    
    const decoded = jwt.verify(token, SECRET);
    
    // Find the user in database to ensure they still exist and get latest data
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(403).json({ error: "Invalid token" });
  }
};

// Register User
router.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? "Email" : "Username";
      return res.status(400).json({ error: `${field} already registered` });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword
    });
    
    await newUser.save();
    
    // Create JWT token
    const token = jwt.sign(
      { id: newUser._id },
      SECRET,
      { expiresIn: '24h' }
    );
    
    return res.status(201).json({
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// Login User
router.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email or username
    const user = await User.findOne({
      $or: [{ email: email }, { username: email }]
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { id: user._id },
      SECRET,
      { expiresIn: '24h' }
    );
    
    return res.status(200).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// Validate token route
router.get('/api/auth/validate', authenticateToken, (req, res) => {
  // User is already attached to req by the middleware
  return res.status(200).json({ valid: true, userId: req.user._id, user: req.user });
});

// Verify Token Route (alternative naming from old implementation)
router.get('/api/verify-token', authenticateToken, (req, res) => {
  // User is already attached to req by the middleware
  res.status(200).json({ user: req.user });
});

// Logout Route
router.post('/api/logout', authenticateToken, async (req, res) => {
  // In a more advanced implementation, you could add the token to a blacklist in MongoDB
  // For simplicity, we're just confirming the logout was successful
  // Client-side will remove the token from localStorage
  
  res.status(200).json({ message: "Logged out successfully" });
});

// Get User Profile
router.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    // User is already attached to the request by middleware
    res.status(200).json({ user: req.user });
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ error: "Error fetching profile" });
  }
});

// Update User Profile
router.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { username, email } = req.body;
    const updates = {};
    
    if (username) updates.username = username;
    if (email) updates.email = email;
    
    // Check if email or username already exists
    if (email || username) {
      const existingUser = await User.findOne({
        _id: { $ne: req.user._id },
        $or: [
          ...(email ? [{ email }] : []),
          ...(username ? [{ username }] : [])
        ]
      });
      
      if (existingUser) {
        const field = existingUser.email === email ? "Email" : "Username";
        return res.status(400).json({ error: `${field} already in use` });
      }
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id, 
      updates,
      { new: true }
    ).select('-password');
    
    res.status(200).json({ user: updatedUser, message: "Profile updated successfully" });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Error updating profile" });
  }
});

// Change Password
router.put('/api/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Get user with password
    const user = await User.findById(req.user._id);
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password
    user.password = hashedPassword;
    await user.save();
    
    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({ error: "Error changing password" });
  }
});

module.exports = router;