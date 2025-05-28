import React, { useState, useEffect } from "react";
import { FaRobot, FaUser, FaSearch, FaHistory, FaArrowRight, FaTrash, FaExclamationTriangle } from 'react-icons/fa';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from "../auth/AuthContext";
import imgLogo from "./imglogo.jpg";
import './Homepage.css';
import './History.css';

const LOCAL_STORAGE_HISTORY_KEY = "thinkbrief_history";

const History = () => {
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteType, setDeleteType] = useState(null); // 'single' or 'all'
  const [error, setError] = useState(null);

  // Track scroll position
  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Fetch history items from local storage when component mounts
  useEffect(() => {
    const fetchHistoryFromLocalStorage = () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get history from localStorage
        const storedHistory = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
        const parsedHistory = storedHistory ? JSON.parse(storedHistory) : [];
        
        // Filter history items for current user
        const userHistory = user?.id 
          ? parsedHistory.filter(item => item.userId === user.id)
          : parsedHistory;
        
        // Sort history items by timestamp
        const sortedHistory = userHistory.sort((a, b) => {
          const dateA = new Date(b.timestamp || b.last_accessed || b.created_at);
          const dateB = new Date(a.timestamp || a.last_accessed || a.created_at);
          return dateA - dateB;
        });

        // Transform data to match expected format
        const formattedHistory = sortedHistory.map(item => ({
          _id: item._id || item.doc_id,
          documentTitle: item.documentTitle || item.title,
          summary: item.summary,
          advantages: Array.isArray(item.advantages) ? item.advantages : [],
          limitations: Array.isArray(item.limitations) ? item.limitations : [],
          timestamp: item.timestamp || item.last_accessed || item.created_at,
          queries: Array.isArray(item.queries) ? item.queries : []
        }));

        setHistoryItems(formattedHistory);
      } catch (error) {
        console.error("Error fetching history:", error);
        setError("Failed to load history. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistoryFromLocalStorage();
  }, [user]);

  // Filter history items based on search term
  const filteredHistory = historyItems.filter(item =>
    item.documentTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.summary?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.queries && item.queries.some(q =>
      q.question?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.answer?.toLowerCase().includes(searchTerm.toLowerCase())
    ))
  );

  const handleSelectItem = (item) => {
    setSelectedItem(item === selectedItem ? null : item);
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  // Handle logout
  const handleLogout = (e) => {
    e.preventDefault();
    logout();
    window.location.href = '/';
  };

  // Delete a single history item
  const handleDeleteItem = (e) => {
    e.stopPropagation(); // Prevent triggering the selectItem handler
    if (!selectedItem) return;
    
    setDeleteType('single');
    setShowDeleteModal(true);
  };

  // Delete all history items
  const handleDeleteAll = () => {
    if (historyItems.length === 0) return;
    
    setDeleteType('all');
    setShowDeleteModal(true);
  };

  // Delete item from local storage
  const deleteFromLocalStorage = (docId) => {
    try {
      const storedHistory = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
      if (storedHistory) {
        const currentHistory = JSON.parse(storedHistory);
        const updatedHistory = currentHistory.filter(item => 
          (item._id !== docId) && (item.doc_id !== docId)
        );
        localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(updatedHistory));
      }
    } catch (error) {
      console.error("Error deleting from local storage:", error);
      throw error;
    }
  };

  // Clear all items from local storage
  const clearLocalStorage = () => {
    try {
      // Only clear user's items if user ID is available
      if (user?.id) {
        const storedHistory = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
        if (storedHistory) {
          const currentHistory = JSON.parse(storedHistory);
          const updatedHistory = currentHistory.filter(item => item.userId !== user.id);
          localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(updatedHistory));
        }
      } else {
        // Clear all history if no user ID
        localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify([]));
      }
    } catch (error) {
      console.error("Error clearing local storage:", error);
      throw error;
    }
  };

  // Confirm deletion
  const confirmDelete = async () => {
    try {
      if (deleteType === 'single' && selectedItem) {
        await deleteFromLocalStorage(selectedItem._id);
        setHistoryItems(prev => prev.filter(item => item._id !== selectedItem._id));
        setSelectedItem(null);
      } else if (deleteType === 'all') {
        await clearLocalStorage();
        setHistoryItems([]);
        setSelectedItem(null);
      }
    } catch (error) {
      console.error("Error deleting history:", error);
      setError(deleteType === 'single' 
        ? "Failed to delete history item. Please try again." 
        : "Failed to delete all history items. Please try again.");
    } finally {
      setShowDeleteModal(false);
    }
  };

  return (
    <div className="homepage-container">
      {/* Navbar */}
      <nav className={`navbar ${scrollPosition > 20 ? 'navbar-scrolled' : ''}`}>
        <div className="nav-container">
          <div className="nav-logo">
            <img src={imgLogo} alt="ThinkBrief Logo" className="logo" />
            <h2>ThinkBrief</h2>
          </div>
          <div className="nav-links">
            <a href="/">Home</a>
            <a href="/chat">Chat</a>
            {isAuthenticated && <a href="/history" className="active">History</a>}
            <a href="/about">About</a>
            {isAuthenticated ? (
              <>
                <a href="/profile">Profile</a>
                <a href="/" onClick={handleLogout} className="login-btn">Logout</a>
              </>
            ) : (
              <a href="/login" className="login-btn">Login</a>
            )}
          </div>
        </div>
      </nav>

      {/* Hero section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1>Your Document History</h1>
          <p className="hero-subtitle">Access and review all your previously analyzed documents.</p>
        </div>
        <div className="gradient-sphere sphere-1"></div>
        <div className="gradient-sphere sphere-2"></div>
      </section>

      <main className="content-container">
        <div className="section-container">
          
          <div className="history-actions">
            <div className="search-container">
              <div className="search-input-wrapper">
                <FaSearch className="search-icon" />
                <input 
                  type="text" 
                  placeholder="Search documents and queries..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>
            
            {historyItems.length > 0 && (
              <button 
                className="btn-delete-all" 
                onClick={handleDeleteAll}
                aria-label="Delete all history"
              >
                <FaTrash /> Clear All
              </button>
            )}
          </div>

          {error && (
            <div className="error-message">
              <FaExclamationTriangle /> {error}
            </div>
          )}

          {loading ? (
            <div className="loading-indicator">
              <div className="loading-spinner"></div>
              <p>Loading your history...</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="empty-history">
              <div className="empty-history-icon">
                <FaHistory />
              </div>
              <h3>{searchTerm ? "No results found" : "Your history is empty"}</h3>
              {!searchTerm && (
                <>
                  <p className="empty-history-hint">Upload documents on the homepage to see your history here</p>
                  <button className="btn-primary" onClick={() => navigate('/')}>
                    Upload Documents <FaArrowRight />
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="history-content">
              <div className="history-list">
                {filteredHistory.map((item) => (
                  <div 
                    key={item._id} 
                    className={`history-item ${selectedItem?._id === item._id ? 'selected' : ''}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="history-item-header">
                      <h3 className="document-title">{item.documentTitle}</h3>
                      <span className="document-date">{formatDate(item.timestamp)}</span>
                    </div>
                    <div className="history-item-summary">
                      <p className="summary-preview">{item.summary ? item.summary.substring(0, 100) + '...' : 'No summary available'}</p>
                      {item.queries && (
                        <p className="query-count">{item.queries.length} question{item.queries.length !== 1 ? 's' : ''}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="history-detail">
                {selectedItem ? (
                  <>
                    <div className="detail-header">
                      <h3>{selectedItem.documentTitle}</h3>
                      <span className="document-date">{formatDate(selectedItem.timestamp)}</span>
                      <button 
                        className="btn-delete" 
                        onClick={handleDeleteItem}
                        aria-label="Delete this document"
                      >
                        <FaTrash />
                      </button>
                    </div>
                    
                    <div className="detail-summary">
                      <h4>Document Summary</h4>
                      <p>{selectedItem.summary || 'No summary available'}</p>
                      
                      <div className="results-grid">
                        {selectedItem.advantages && selectedItem.advantages.length > 0 && (
                          <div className="result-card advantages-section">
                            <div className="card-header">
                              <h4>Advantages</h4>
                            </div>
                            <ul className="advantages-list">
                              {selectedItem.advantages.map((adv, idx) => (
                                <li key={idx}>
                                  <span className="advantage-bullet">✓</span>
                                  <span className="advantage-text">{adv}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {selectedItem.limitations && selectedItem.limitations.length > 0 && (
                          <div className="result-card limitations-section">
                            <div className="card-header">
                              <h4>Limitations</h4>
                            </div>
                            <ul className="limitations-list">
                              {selectedItem.limitations.map((lim, idx) => (
                                <li key={idx}>
                                  <span className="limitation-bullet">⚠</span>
                                  <span className="limitation-text">{lim}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {selectedItem.queries && selectedItem.queries.length > 0 && (
                      <div className="detail-queries">
                        <h4>Questions & Answers</h4>
                        <div className="messages-list">
                          {selectedItem.queries.map((query, idx) => (
                            <div key={idx} className="qa-pair">
                              <div className="message user-message">
                                <div className="message-bubble">
                                  <div className="message-avatar">
                                    <FaUser />
                                  </div>
                                  <div className="message-content">
                                    {query.question}
                                  </div>
                                </div>
                                <div className="message-timestamp">
                                  {new Date(query.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </div>
                              </div>
                              <div className="message bot-message">
                                <div className="message-bubble">
                                  <div className="message-avatar">
                                    <FaRobot />
                                  </div>
                                  <div className="message-content">
                                    {query.answer}
                                  </div>
                                </div>
                                <div className="message-timestamp">
                                  {new Date(query.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="no-selection">
                    <div className="no-selection-icon">
                      <FaHistory />
                    </div>
                    <h3>Select a document</h3>
                    <p>Click on a document from the list to view its details</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="delete-modal">
            <div className="modal-header">
              <FaExclamationTriangle className="warning-icon" />
              <h3>Confirm Delete</h3>
            </div>
            <p>
              {deleteType === 'single' 
                ? `Are you sure you want to delete "${selectedItem?.documentTitle}"? This action cannot be undone.` 
                : 'Are you sure you want to delete all history items? This action cannot be undone.'}
            </p>
            <div className="modal-actions">
              <button 
                className="btn-cancel" 
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-confirm-delete" 
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer - matching Homepage */}
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
              {isAuthenticated && (<Link to="/history">History</Link>)}
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

export default History;