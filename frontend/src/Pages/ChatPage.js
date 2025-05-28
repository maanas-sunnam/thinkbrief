import React, { useState, useRef, useEffect } from "react";
import { FaUpload, FaPaperPlane, FaImage, FaRobot, FaUser, FaHistory, FaArrowRight } from 'react-icons/fa';
import { useNavigate ,Link } from 'react-router-dom';
import { useAuth } from "../auth/AuthContext"; 
import axios from "axios";
import imgLogo from "./imglogo.jpg";
import "./ChatPage.css"; 

const API_BASE_URL = "http://localhost:5000";

const ChatPage = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeDocId, setActiveDocId] = useState(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [historyCount, setHistoryCount] = useState(0);
  const [scrollPosition, setScrollPosition] = useState(0);
  const { isAuthenticated, user, logout } = useAuth(); 
  const messagesEndRef = useRef(null);

  // Track scroll position
  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Load history count on component mount - only if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      try {
        const existingHistory = JSON.parse(localStorage.getItem('thinkbriefHistory') || '[]');
        setHistoryCount(existingHistory.length);
      } catch (error) {
        console.error("Error loading history count:", error);
      }
    }
  }, [isAuthenticated]);

  // Added useEffect for welcome message
  useEffect(() => {
    // Welcome message if no messages exist
    if (messages.length === 0) {
      setMessages([
        { 
          text: "Welcome to ThinkBrief Chat! Ask questions about your documents or upload a new one to get started.", 
          sender: "bot",
          timestamp: new Date()
        }
      ]);
    }
  }, [messages.length]);

  // This function is kept but will only be used when explicitly called
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    const isImage = file.type.startsWith("image/");
    formData.append(isImage ? "image" : "file", file);

    // Show "uploading" status message
    const tempId = Date.now();
    const uploadingMsg = {
      id: tempId,
      text: `Uploading ${file.name}...`,
      sender: "user",
      timestamp: new Date(),
      isUploading: true
    };
    setMessages((prev) => [...prev, uploadingMsg]);
    setIsLoading(true);

    try {
      const uploadUrl = isImage ? "/upload/image" : "/upload";
      const response = await axios.post(`${API_BASE_URL}${uploadUrl}`, formData);
      
      // Remove the uploading message
      setMessages((prev) => prev.filter(msg => msg.id !== tempId));

      const fileMessage = {
        sender: "user",
        timestamp: new Date()
      };

      if (isImage) {
        fileMessage.image = response.data.file?.url;
        fileMessage.text = file.name;
      } else {
        fileMessage.fileUrl = response.data.file?.url;
        fileMessage.text = file.name;
        
        // Set active document if it's a file upload
        if (response.data.doc_id) {
          setActiveDocId(response.data.doc_id);
          setDocumentTitle(response.data.source || file.name);
          
          // Save to history only if authenticated
          if (isAuthenticated) {
            saveToHistory(response.data);
            updateHistoryCount();
          }
        }
      }
      
      setMessages((prev) => [...prev, fileMessage]);
      
      // Get summary from the response
      const summary = response.data.summary || 
                     `Summary: This is a document about ${file.name}`;
      
      const botMessage = {
        text: summary,
        sender: "bot",
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Upload failed", error);
      setMessages((prev) => [...prev, {
        text: `Failed to upload ${file.name}. Please try again.`,
        sender: "bot",
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (input.trim() === "") return;
    
    // Add user message to chat
    const userMessage = { 
      text: input, 
      sender: "user",
      timestamp: new Date() 
    };
    setMessages((prev) => [...prev, userMessage]);
    
    // Store input and clear the field
    const question = input;
    setInput("");
    setIsLoading(true);
    
    try {
      let botMsg = {};
      
      if (activeDocId) {
        // If we have an active document, send the question to the backend
        const response = await axios.post(`http://localhost:5005/ask`, {
          question,
          doc_id: activeDocId
        });
        
        botMsg = {
          text: response.data.answer,
          sender: "bot",
          timestamp: new Date()
        };
        
        // Update history with this Q&A only if authenticated
        if (isAuthenticated) {
          updateHistoryWithQuery(question, response.data.answer);
        }
      } else {
        // Handle text summarization for large inputs
        const wordCount = question.trim().split(/\s+/).length;
        
        if (wordCount > 100) {
          const response = await axios.post(`http://localhost:5005/summarize_text`, {
            text: question
          });
          
          botMsg = {
            text: response.data.summary,
            sender: "bot",
            timestamp: new Date(),
            metaInfo: `Summarized from ${wordCount} words to ${response.data.summary.split(/\s+/).length} words`
          };
        } else {
          // Simple response for short inputs without active document
          botMsg = {
            text: "To get more detailed answers, please upload a document first. I can analyze documents and help you understand them better.",
            sender: "bot",
            timestamp: new Date()
          };
        }
      }
      
      setMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      console.error("Error processing message:", error);
      const errorMsg = {
        text: "Sorry, I encountered an error processing your message. Please try again.",
        sender: "bot",
        timestamp: new Date(),
        isError: true
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  // Format time for display
  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Navigate to history page - only available for authenticated users
  const goToHistory = () => {
    if (isAuthenticated) {
      navigate('/history');
    } else {
      // Add a message to the chat about needing to login
      setMessages((prev) => [...prev, {
        text: "You need to login to access your chat history. Please login or create an account.",
        sender: "bot",
        timestamp: new Date()
      }]);
    }
  };

  // Update history count - only for authenticated users
  const updateHistoryCount = () => {
    if (!isAuthenticated) return;
    
    try {
      const existingHistory = JSON.parse(localStorage.getItem('thinkbriefHistory') || '[]');
      setHistoryCount(existingHistory.length);
    } catch (error) {
      console.error("Error updating history count:", error);
    }
  };

  // Save to history - only for authenticated users
  const saveToHistory = (docData) => {
    if (!isAuthenticated) return;
    
    try {
      // Get existing history or initialize empty array
      const existingHistory = JSON.parse(localStorage.getItem('thinkbriefHistory') || '[]');
      
      // Create history item
      const historyItem = {
        documentId: docData.doc_id,
        documentTitle: docData.source || "Document",
        timestamp: new Date().toISOString(),
        summary: docData.summary || "",
        advantages: docData.advantages || [],
        limitations: docData.limitations || [],
        queries: [] // Will be populated as questions are asked
      };
      
      // Add to history (at the beginning so newest is first)
      existingHistory.unshift(historyItem);
      
      // Save back to localStorage
      localStorage.setItem('thinkbriefHistory', JSON.stringify(existingHistory));
      
      // Update the history count
      updateHistoryCount();
    } catch (error) {
      console.error("Error saving to history:", error);
    }
  };

  // Update history when a question is asked and answered - only for authenticated users
  const updateHistoryWithQuery = (question, answer) => {
    if (!activeDocId || !isAuthenticated) return;
    
    try {
      // Get existing history
      const existingHistory = JSON.parse(localStorage.getItem('thinkbriefHistory') || '[]');
      
      // Find the document in history
      const docIndex = existingHistory.findIndex(item => item.documentId === activeDocId);
      
      if (docIndex !== -1) {
        // Add the query to the document's queries array
        existingHistory[docIndex].queries.push({
          question,
          answer,
          timestamp: new Date().toISOString()
        });
        
        // Save back to localStorage
        localStorage.setItem('thinkbriefHistory', JSON.stringify(existingHistory));
      }
    } catch (error) {
      console.error("Error updating history with query:", error);
    }
  };

  // Handle logout
  const handleLogout = (e) => {
    e.preventDefault();
    logout();
    window.location.href = '/';
  };

  // Added manual scroll function for a scroll button if needed
  const handleManualScroll = () => {
    scrollToBottom();
  };

  return (
    <div className="homepage-container">
      {/* Updated navbar with auth - only show History link if authenticated */}
      <nav className={`navbar ${scrollPosition > 20 ? 'navbar-scrolled' : ''}`}>
        <div className="nav-container">
          <div className="nav-logo">
            <img src={imgLogo} alt="ThinkBrief Logo" className="logo" />
            <h2>ThinkBrief</h2>
          </div>
          <div className="nav-links">
            <a href="/">Home</a>
            <a href="/chat" className="active">Chat</a>
            {isAuthenticated &&(<Link to="/history">History</Link>)}
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

      {/* Hero section - simplified for chat page */}
      <section className="hero-section">
        <div className="hero-content">
          <h1>ThinkBrief Chat Assistant</h1>
          <p className="hero-subtitle">Generate Summaries to your Text...</p>
        </div>
        <div className="gradient-sphere sphere-1"></div>
        <div className="gradient-sphere sphere-2"></div>
      </section>

      <main className="content-container">
        <div className="section-container">
          <div className="section-header">
            <div className="tab-buttons">
              <button className="tab-button">
                <FaRobot /> Chat Assistant
              </button>
              {/* Only show History button to authenticated users */}
              {isAuthenticated && (
                <button className="tab-button" onClick={goToHistory}>
                  <FaHistory /> History ({historyCount})
                </button>
              )}
            </div>
            <div className="section-divider"></div>
          </div>

          {/* Chat Interface Section */}
          <div className="chat-interface">
            {activeDocId && (
              <div className="active-document-indicator">
                <div className="active-document-icon">
                  <FaRobot />
                </div>
                <div className="active-document-info">
                  <h4>Active Document</h4>
                  <p>{documentTitle}</p>
                </div>
              </div>
            )}
            
            <div className="messages-container" id="messages">
              {messages.length === 0 ? (
                <div className="empty-chat">
                  <div className="empty-chat-icon">
                    <FaRobot />
                  </div>
                  <h3>No Conversations Yet</h3>
                  <p>Start a conversation or upload a document to analyze</p>
                </div> 
              ) : (
                <div className="messages-list">
                  {messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`message ${
                        msg.sender === "user" 
                          ? "user-message" 
                          : msg.sender === "bot" 
                            ? "bot-message" 
                            : "system-message"
                      } ${msg.isError ? "error-message" : ""}`}
                    >
                      <div className="message-bubble">
                        <div className="message-avatar">
                          {msg.sender === "user" ? (
                            <FaUser />
                          ) : msg.sender === "bot" ? (
                            <FaRobot />
                          ) : null}
                        </div>
                        <div className="message-content">
                          {msg.image ? (
                            <img src={msg.image} alt="Uploaded" className="message-image" />
                          ) : msg.fileUrl ? (
                            <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="file-link">
                              📄 {msg.text}
                            </a>
                          ) : msg.isUploading ? (
                            <em>{msg.text}</em>
                          ) : (
                            msg.text
                          )}
                          {msg.metaInfo && <div className="meta-info"><em>{msg.metaInfo}</em></div>}
                        </div>
                      </div>
                      <div className="message-timestamp">
                        {formatTime(msg.timestamp)}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="message bot-message loading-message">
                      <div className="message-bubble">
                        <div className="message-avatar">
                          <FaRobot />
                        </div>
                        <div className="typing-indicator">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-container">
              <textarea
                className="text-input"
                placeholder="Ask a question or upload a document..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={isLoading}
              />
              
              <div className="input-actions">
                <label htmlFor="file-upload" className="action-button upload-button" title="Upload a document">
                  <FaUpload />
                </label>
                <input 
                  id="file-upload" 
                  type="file"
                  accept=".pdf,.docx,.txt,.doc,.ppt,.pptx,image/*"
                  className="file-input" 
                  onChange={handleFileUpload}
                />
                
                <button 
                  onClick={handleSendMessage} 
                  className="action-button send-button" 
                  disabled={input.trim() === "" || isLoading}
                  title="Send message"
                >  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer with updated styling - same as homepage */}
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
              {/* Only show History link if authenticated */}
              {isAuthenticated && <a href="/history">History</a>}
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

export default ChatPage;