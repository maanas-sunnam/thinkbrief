import React, { useState, useRef, useEffect } from "react";
import { useNavigate ,Link } from "react-router-dom";
import { FaUser, FaLock, FaEnvelope, FaEye, FaEyeSlash } from "react-icons/fa";
import { useAuth } from '../auth/AuthContext'; 
import imgLogo from "./imglogo.jpg";
import "./Login.css";

const Login = () => {
  const [view, setView] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();
  const { isAuthenticated, login, signup } = useAuth();

  const emailRef = useRef();
  const passwordRef = useRef();
  const usernameRef = useRef();
  const confirmPasswordRef = useRef();

  // Check if user is already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const validateEmail = (email) =>
    email.includes("@") && email.includes(".");

  const validateFields = () => {
    const newErrors = {};
    if (!email || !validateEmail(email)) newErrors.email = "Enter valid email address";
    if (!password || password.length < 8) newErrors.password = "Minimum 8 characters required";
    if (view === "signup") {
      if (!username) newErrors.username = "Username required";
      if (!confirmPassword) newErrors.confirmPassword = "Please confirm your password";
      if (password !== confirmPassword) newErrors.confirmPassword = "Passwords do not match";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateFields()) return;

    const result = await login(email, password);
    if (result.success) {
      navigate("/");
    } else {
      alert(result.message || "Login failed. Please check your credentials.");
    }
  };

  const handleSignup = async () => {
    if (!validateFields()) return;

    const result = await signup(username, email, password);
    if (result.success) {
      setView("login");
      alert("Signup successful! Please login.");
      // Clear the signup form
      setUsername("");
      setPassword("");
      setConfirmPassword("");
    } else {
      alert(result.message || "Signup failed. Please try a different email or username.");
    }
  };

  const handleForgotPassword = async () => {
    if (!email || !validateEmail(email)) {
      setErrors({ email: "Enter valid email address" });
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (response.ok) {
        alert("Password reset link has been sent to your email.");
        setView("login");
      } else {
        alert(data.message || "Failed to send reset link. Please try again.");
      }
    } catch (error) {
      console.error("Password reset error:", error);
      alert("Failed to send reset link. Please try again.");
    }
  };

  const handleKeyDown = (e, nextRef, isFinal = false, action = () => {}) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isFinal) {
        action();
      } else {
        nextRef.current?.focus();
      }
    }
  };

  const handleGoogleLogin = () => {
    // Implement Google OAuth login
    // This is a placeholder - you would need to implement Google OAuth
    alert("Google login functionality will be implemented here");
  };

  return (
    <div className="pitch-container">
      <div className="pitch-sidebar">
        <div className="sidebar-content">
          <img src={imgLogo} alt="ThinkBrief Logo" className="sidebar-logo" />
          <h1 className="sidebar-title">ThinkBrief</h1>
          <p className="sidebar-description">
            Transform documents into clear, concise summaries in seconds
          </p>
        </div>
      </div>

      <div className="pitch-main">
        <nav className="pitch-top-nav">
          <div className="nav-links">
            <a href="/">Home</a>
            <a href="/chat">Chat</a>
             {isAuthenticated &&(<Link to="/history">History</Link>)}
            <a href="/about">About</a>
          </div>
        </nav>

        <div className="pitch-auth-container">
          {view === "login" && (
            <div className="pitch-auth-form">
              <h2>Welcome back</h2>
              <p className="auth-subtitle">Log in to continue to ThinkBrief</p>
              
              <button className="google-btn" onClick={handleGoogleLogin}>
                <img src="https://cdn-icons-png.flaticon.com/512/281/281764.png" alt="Google" className="btn-icon" />
                Continue with Google
              </button>
              
              <div className="pitch-divider">
                <span>or continue with email</span>
              </div>
              
              <div className={`pitch-input-group ${errors.email ? "has-error" : ""}`}>
                <label htmlFor="email">Email</label>
                <div className="pitch-input-container">
                  <FaEnvelope className="pitch-input-icon" />
                  <input
                    id="email"
                    ref={emailRef}
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, passwordRef)}
                  />
                </div>
                {errors.email && <p className="pitch-error">{errors.email}</p>}
              </div>

              <div className={`pitch-input-group ${errors.password ? "has-error" : ""}`}>
                <label htmlFor="password">Password</label>
                <div className="pitch-input-container">
                  <FaLock className="pitch-input-icon" />
                  <input
                    id="password"
                    ref={passwordRef}
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, null, true, handleLogin)}
                  />
                  <span className="pitch-eye-icon" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <FaEye /> : <FaEyeSlash />}
                  </span>
                </div>
                {errors.password && <p className="pitch-error">{errors.password}</p>}
              </div>

              <div className="pitch-remember-forgot">
                <label className="pitch-remember-me">
                  <input type="checkbox" />
                  <span>Remember me</span>
                </label>
                <span className="pitch-link" onClick={() => setView("forgot")}>Forgot password?</span>
              </div>

              <button className="pitch-primary-btn" onClick={handleLogin}>Log in</button>
              
              <p className="pitch-switch-mode">
                Don't have an account? <span className="pitch-link" onClick={() => setView("signup")}>Sign up</span>
              </p>
            </div>
          )}

          {view === "signup" && (
            <div className="pitch-auth-form">
              <h2>Join ThinkBrief</h2>
              <p className="auth-subtitle">Create your account to get started</p>
              
              <button className="google-btn" onClick={handleGoogleLogin}>
                <img src="https://cdn-icons-png.flaticon.com/512/281/281764.png" alt="Google" className="btn-icon" />
                Sign up with Google
              </button>
              
              <div className="pitch-divider">
                <span>or sign up with email</span>
              </div>
              
              <div className={`pitch-input-group ${errors.username ? "has-error" : ""}`}>
                <label htmlFor="username">Username</label>
                <div className="pitch-input-container">
                  <FaUser className="pitch-input-icon" />
                  <input
                    id="username"
                    ref={usernameRef}
                    type="text"
                    placeholder="Your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, emailRef)}
                  />
                </div>
                {errors.username && <p className="pitch-error">{errors.username}</p>}
              </div>

              <div className={`pitch-input-group ${errors.email ? "has-error" : ""}`}>
                <label htmlFor="signup-email">Email</label>
                <div className="pitch-input-container">
                  <FaEnvelope className="pitch-input-icon" />
                  <input
                    id="signup-email"
                    ref={emailRef}
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, passwordRef)}
                  />
                </div>
                {errors.email && <p className="pitch-error">{errors.email}</p>}
              </div>

              <div className={`pitch-input-group ${errors.password ? "has-error" : ""}`}>
                <label htmlFor="signup-password">Password</label>
                <div className="pitch-input-container">
                  <FaLock className="pitch-input-icon" />
                  <input
                    id="signup-password"
                    ref={passwordRef}
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, confirmPasswordRef)}
                  />
                  <span className="pitch-eye-icon" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <FaEye /> : <FaEyeSlash />}
                  </span>
                </div>
                {errors.password && <p className="pitch-error">{errors.password}</p>}
              </div>

              <div className={`pitch-input-group ${errors.confirmPassword ? "has-error" : ""}`}>
                <label htmlFor="confirm-password">Confirm password</label>
                <div className="pitch-input-container">
                  <FaLock className="pitch-input-icon" />
                  <input
                    id="confirm-password"
                    ref={confirmPasswordRef}
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, null, true, handleSignup)}
                  />
                  <span className="pitch-eye-icon" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                    {showConfirmPassword ? <FaEye /> : <FaEyeSlash />}
                  </span>
                </div>
                {errors.confirmPassword && <p className="pitch-error">{errors.confirmPassword}</p>}
              </div>

              <div className="pitch-terms">
                <input type="checkbox" id="terms" />
                <label htmlFor="terms">I agree to the <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a></label>
              </div>

              <button className="pitch-primary-btn" onClick={handleSignup}>Create account</button>
              
              <p className="pitch-switch-mode">
                Already have an account? <span className="pitch-link" onClick={() => setView("login")}>Log in</span>
              </p>
            </div>
          )}

          {view === "forgot" && (
            <div className="pitch-auth-form">
              <h2>Reset password</h2>
              <p className="auth-subtitle">We'll send a password reset link to your email</p>
              
              <div className={`pitch-input-group ${errors.email ? "has-error" : ""}`}>
                <label htmlFor="reset-email">Email</label>
                <div className="pitch-input-container">
                  <FaEnvelope className="pitch-input-icon" />
                  <input 
                    id="reset-email"
                    type="email" 
                    placeholder="you@example.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, null, true, handleForgotPassword)}
                  />
                </div>
                {errors.email && <p className="pitch-error">{errors.email}</p>}
              </div>
              
              <button className="pitch-primary-btn" onClick={handleForgotPassword}>Send reset link</button>
              
              <p className="pitch-back-link">
                <span className="pitch-link" onClick={() => setView("login")}>Back to login</span>
              </p>
            </div>
          )}
        </div>

        <footer className="pitch-footer">
          <p>&copy; 2025 ThinkBrief. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export default Login;