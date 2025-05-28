import React, { useState, useEffect } from "react";
import { FaUser, FaLock, FaTrash, FaPen, FaSignOutAlt, FaArrowLeft, FaHistory } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from "../auth/AuthContext";
import imgLogo from "./imglogo.jpg";
import './ProfilePage.css';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout, updateUserProfile } = useAuth();
  const [activeSection, setActiveSection] = useState('profile');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState({ text: '', type: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [docsAnalyzed, setDocsAnalyzed] = useState(0);
  const [queriesAsked, setQueriesAsked] = useState(0);
  const [scrollPosition, setScrollPosition] = useState(0);

  // Track scroll position for navbar effects
  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Load user data
  useEffect(() => {
    if (user) {
      setFormData({
        ...formData,
        username: user.username || '',
        email: user.email || '',
      });
      
      // Calculate statistics from localStorage history
      try {
        const history = JSON.parse(localStorage.getItem('thinkbriefHistory') || '[]');
        setDocsAnalyzed(history.length);
        
        // Count total queries across all documents
        const totalQueries = history.reduce((sum, doc) => sum + (doc.queries?.length || 0), 0);
        setQueriesAsked(totalQueries);
      } catch (error) {
        console.error("Error loading user stats:", error);
      }
    }
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleEditProfile = () => {
    setIsEditing(true);
    setMessage({ text: '', type: '' });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    // Reset form data to current user data
    if (user) {
      setFormData({
        ...formData,
        username: user.username || '',
        email: user.email || '',
      });
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });
    
    try {
      // Call API to update profile
      const response = await fetch('http://localhost:5000/api/users/update-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user._id,
          username: formData.username,
          email: formData.email,
        }),
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Update local user data
        updateUserProfile({
          ...user,
          username: formData.username,
          email: formData.email,
        });
        
        setMessage({ text: 'Profile updated successfully!', type: 'success' });
        setIsEditing(false);
      } else {
        setMessage({ text: data.message || 'Error updating profile', type: 'error' });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ text: 'Server error. Please try again later.', type: 'error' });
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });
    
    // Validate passwords
    if (formData.newPassword !== formData.confirmPassword) {
      setMessage({ text: 'New passwords do not match', type: 'error' });
      return;
    }
    
    if (formData.newPassword.length < 6) {
      setMessage({ text: 'Password must be at least 6 characters', type: 'error' });
      return;
    }
    
    try {
      // Call API to change password
      const response = await fetch('http://localhost:5000/api/users/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user._id,
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage({ text: 'Password changed successfully!', type: 'success' });
        setIsChangingPassword(false);
        // Clear password fields
        setFormData({
          ...formData,
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
      } else {
        setMessage({ text: data.message || 'Error changing password', type: 'error' });
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setMessage({ text: 'Server error. Please try again later.', type: 'error' });
    }
  };

  const handleDeleteAccount = async () => {
    if (!isDeleting) {
      setIsDeleting(true);
      return;
    }
    
    try {
      // Call API to delete account
      const response = await fetch(`http://localhost:5000/api/users/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user._id,
        }),
        credentials: 'include',
      });
      
      if (response.ok) {
        // Clear local storage
        localStorage.removeItem('thinkbriefHistory');
        
        // Log out the user
        logout();
        
        // Redirect to home page
        navigate('/');
      } else {
        const data = await response.json();
        setMessage({ text: data.message || 'Error deleting account', type: 'error' });
        setIsDeleting(false);
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      setMessage({ text: 'Server error. Please try again later.', type: 'error' });
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setIsDeleting(false);
  };

  const handleLogout = (e) => {
    e.preventDefault();
    logout();
    navigate('/');
  };

  // Format date for joined date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (!isAuthenticated || !user) {
    return <div className="loading-container">Loading user profile...</div>;
  }

  return (
    <div className="profile-page-container">
      {/* Navbar - similar to Homepage */}
      <nav className={`navbar ${scrollPosition > 20 ? 'navbar-scrolled' : ''}`}>
        <div className="nav-container">
          <div className="nav-logo">
            <img src={imgLogo} alt="ThinkBrief Logo" className="logo" />
            <h2>ThinkBrief</h2>
          </div>
          <div className="nav-links">
            <a href="/">Home</a>
            <a href="/chat">Chat</a>
            <Link to="/history">History</Link>
            <a href="/about">About</a>
            <a href="/profile" className="active">Profile</a>
            <a href="/" onClick={handleLogout} className="login-btn">Logout</a>
          </div>
        </div>
      </nav>
        
      {/* Hero section with user info */}
      <section className="profile-hero-section">
        <div className="profile-hero-content">
          <div className="profile-avatar">
            <FaUser />
          </div>
          <h1>{user.username}</h1>
          <p>Member since {formatDate(user.createdAt)}</p>
        </div>
        <div className="gradient-sphere sphere-1"></div>
        <div className="gradient-sphere sphere-2"></div>
      </section>

      <main className="profile-content-container">
        <div className="profile-section-container">
          {/* Profile navigation */}
          <div className="profile-nav">
            <button 
              className={`profile-nav-button ${activeSection === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveSection('profile')}
            >
              <FaUser /> Profile
            </button>
            <button 
              className={`profile-nav-button ${activeSection === 'security' ? 'active' : ''}`}
              onClick={() => setActiveSection('security')}
            >
              <FaLock /> Security
            </button>
            <button 
              className={`profile-nav-button ${activeSection === 'history' ? 'active' : ''}`}
              onClick={() => navigate('/history')}
            >
              <FaHistory /> History
            </button>
            <button 
              className="profile-nav-button danger"
              onClick={handleLogout}
            >
              <FaSignOutAlt /> Logout
            </button>
          </div>

          <div className="profile-main-content">
            {/* Profile section */}
            {activeSection === 'profile' && (
              <div className="profile-section">
                <div className="section-header">
                  <h2>Profile Information</h2>
                  {!isEditing && (
                    <button className="edit-button" onClick={handleEditProfile}>
                      <FaPen /> Edit
                    </button>
                  )}
                </div>
                <div className="section-divider"></div>

                {message.text && (
                  <div className={`alert ${message.type === 'success' ? 'success-message' : 'warning-message'}`}>
                    {message.text}
                  </div>
                )}

                {isEditing ? (
                  <form onSubmit={handleSaveProfile} className="profile-form">
                    <div className="form-group">
                      <label htmlFor="username">Username</label>
                      <input
                        type="text"
                        id="username"
                        name="username"
                        value={formData.username}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="email">Email</label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    <div className="form-buttons">
                      <button type="button" className="btn-secondary" onClick={handleCancelEdit}>
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary">
                        Save Changes
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="profile-info">
                    <div className="info-group">
                      <span className="info-label">Username:</span>
                      <span className="info-value">{user.username}</span>
                    </div>
                    <div className="info-group">
                      <span className="info-label">Email:</span>
                      <span className="info-value">{user.email}</span>
                    </div>
                    <div className="info-group">
                      <span className="info-label">Member Since:</span>
                      <span className="info-value">{formatDate(user.createdAt)}</span>
                    </div>
                  </div>
                )}

                {/* User Stats */}
                <div className="user-stats">
                  <div className="section-header">
                    <h3>Activity Statistics</h3>
                  </div>
                  <div className="section-divider"></div>
                  
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{docsAnalyzed}</div>
                      <div className="stat-label">Documents Analyzed</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{queriesAsked}</div>
                      <div className="stat-label">Questions Asked</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Security section */}
            {activeSection === 'security' && (
              <div className="profile-section">
                <div className="section-header">
                  <h2>Security Settings</h2>
                </div>
                <div className="section-divider"></div>

                {message.text && (
                  <div className={`alert ${message.type === 'success' ? 'success-message' : 'warning-message'}`}>
                    {message.text}
                  </div>
                )}

                <div className="security-options">
                  {/* Change password section */}
                  <div className="security-card">
                    <div className="security-card-header">
                      <h3>Password</h3>
                      <button 
                        className="btn-text" 
                        onClick={() => setIsChangingPassword(!isChangingPassword)}
                      >
                        {isChangingPassword ? 'Cancel' : 'Change Password'}
                      </button>
                    </div>
                    
                    {isChangingPassword && (
                      <form onSubmit={handleChangePassword} className="profile-form">
                        <div className="form-group">
                          <label htmlFor="currentPassword">Current Password</label>
                          <input
                            type="password"
                            id="currentPassword"
                            name="currentPassword"
                            value={formData.currentPassword}
                            onChange={handleInputChange}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="newPassword">New Password</label>
                          <input
                            type="password"
                            id="newPassword"
                            name="newPassword"
                            value={formData.newPassword}
                            onChange={handleInputChange}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="confirmPassword">Confirm New Password</label>
                          <input
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleInputChange}
                            required
                          />
                        </div>
                        <div className="form-buttons">
                          <button type="submit" className="btn-primary">
                            Update Password
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Delete account section */}
                  <div className="security-card danger-zone">
                    <div className="security-card-header">
                      <h3>Delete Account</h3>
                      <button 
                        className="btn-danger" 
                        onClick={isDeleting ? handleCancelDelete : () => setIsDeleting(true)}
                      >
                        {isDeleting ? 'Cancel' : 'Delete Account'}
                      </button>
                    </div>
                    
                    {isDeleting && (
                      <div className="delete-confirmation">
                        <p className="warning-text">
                          This action cannot be undone. All your data will be permanently deleted.
                        </p>
                        <button className="btn-danger confirm" onClick={handleDeleteAccount}>
                          <FaTrash /> Confirm Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Other sections can be added here */}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-logo">
            <img src={imgLogo} alt="ThinkBrief Logo" className="logo" />
            <h2>ThinkBrief</h2>
            <p>Making research accessible</p>
          </div>
          <div className="footer-links">
            <div className="footer-column">
              <h4>Navigation</h4>
              <a href="/">Home</a>
              <a href="/chat">Chat</a>
              <a href="/history">History</a>
              <a href="/about">About</a>
            </div>
            <div className="footer-column">
              <h4>Product</h4>
              <a href="/features">Features</a>
              <a href="/pricing">Pricing</a>
              <a href="/enterprise">Enterprise</a>
            </div>
            <div className="footer-column">
              <h4>Legal</h4>
              <a href="/privacy">Privacy Policy</a>
              <a href="/terms">Terms of Service</a>
              <a href="/security">Security</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2025 ThinkBrief. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default ProfilePage;