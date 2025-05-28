const express = require("express");
const router = express.Router();
const User = require("../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "thinkbrief_secret_key"; // Move this to .env in production

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
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

// Signup Route
router.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });
    if (existingUser) {
      const field = existingUser.email === email ? "Email" : "Username";
      return res.status(400).json({ message: `${field} already registered` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();

    // Return user data (including the auto-generated user_id)
    return res.status(201).json({
      success: true,
      user: {
        user_id: user.user_id, // <-- auto-incremented user_id
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
      },
      message: "User created successfully"
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ message: "Signup error" });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Search by email or username
    const user = await User.findOne({
      $or: [{ email: email }, { username: email }],
    });

    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    // Create token
    const token = jwt.sign({ id: user._id }, SECRET, { expiresIn: "1d" });
    
    // Return user data (excluding password) along with token
    const userData = {
      _id: user._id,
      username: user.username,
      email: user.email
    };

    return res.status(200).json({ token, user: userData });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Login error" });
  }
});

// Verify Token Route
router.get("/verify-token", authenticateToken, (req, res) => {
  // User is already attached to req by the middleware
  res.status(200).json({ user: req.user });
});

// Logout Route
router.post("/logout", authenticateToken, async (req, res) => {
  // In a more advanced implementation, you could add the token to a blacklist in MongoDB
  // For simplicity, we're just confirming the logout was successful
  // Client-side will remove the token from localStorage
  
  res.status(200).json({ message: "Logged out successfully" });
});

// Get User Profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    // User is already attached to the request by middleware
    res.status(200).json({ user: req.user });
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ message: "Error fetching profile" });
  }
});

// Update User Profile
router.put("/profile", authenticateToken, async (req, res) => {
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
        return res.status(400).json({ message: `${field} already in use` });
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
    res.status(500).json({ message: "Error updating profile" });
  }
});

// Change Password
router.put("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Get user with password
    const user = await User.findById(req.user._id);
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    user.password = hashedPassword;
    await user.save();
    
    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({ message: "Error changing password" });
  }
});

// Export only the router
module.exports = router;

// Export the middleware separately if needed elsewhere
// If you need to use authenticateToken in other files, create a separate middleware.js file
// and export it from there, or restructure your imports