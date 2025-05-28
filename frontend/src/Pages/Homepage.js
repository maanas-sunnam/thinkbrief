import React, { useState, useEffect, useRef } from "react";
import { FaUpload, FaPaperPlane, FaImage, FaRobot, FaUser, FaHistory, FaArrowRight } from 'react-icons/fa';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from "../auth/AuthContext"; // Auth context import
import imgLogo from "./imglogo.jpg";
import './Homepage.css';

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// API base URLs - centralized for consistency
const API_BASE_URL = "http://localhost:5005"; // Main API server
const AUTH_API_URL = "http://localhost:5000"; // Auth server

// Local storage key for history
const LOCAL_STORAGE_HISTORY_KEY = "thinkbrief_history";

const Homepage = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [warning, setWarning] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [advantages, setAdvantages] = useState([]);
  const [limitations, setLimitations] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeDocId, setActiveDocId] = useState(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [historyCount, setHistoryCount] = useState(0);
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' or 'chat'
  const [scrollPosition, setScrollPosition] = useState(0);
  const { isAuthenticated, user, logout } = useAuth(); // Using auth context
  const messagesEndRef = useRef(null); // For scrolling

  // Track scroll position
  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);


  // Added debugging useEffect to log activeDocId changes
  useEffect(() => {
    console.log("activeDocId updated:", activeDocId);
  }, [activeDocId]);

  // Fetch history count from MongoDB
  const fetchHistoryCount = async () => {
    try {
      const response = await fetch(`${AUTH_API_URL}/history`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include"
      });
      
      if (response.ok) {
        const data = await response.json();
        setHistoryCount(data.history.length);
      } else {
        console.error("Failed to fetch history count");
      }
    } catch (error) {
      console.error("Error fetching history count:", error);
    }
  };

  // Added useEffect for welcome message
  useEffect(() => {
    // Welcome message if no messages exist
    if (messages.length === 0) {
      setMessages([
        {
          text: "Welcome to ThinkBrief! Upload a document to get started with AI-powered analysis.",
          sender: "bot"
        }
      ]);
    }
  }, [messages.length]);

  // Auto-scroll to the bottom of messages container when new messages are added
  useEffect(() => {
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleFileUpload = (event) => {
    const uploadedFiles = Array.from(event.target.files);
    const validFiles = [];
    let sizeWarning = "";
    uploadedFiles.forEach((file) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        sizeWarning = `File ${file.name} exceeds the maximum size of ${MAX_FILE_SIZE_MB}MB.`;
      } else {
        validFiles.push(file);
      }
    });
    setFiles(validFiles);
    setWarning(sizeWarning);
    setUploadMessage("");
  };

  const handleImageUpload = async (event) => {
    const imageFile = event.target.files[0];
    if (!imageFile) return;
    setIsLoading(true);
    const formData = new FormData();
    formData.append("image", imageFile); // Changed to "image" as per server.js route

    try {
      const response = await fetch(`${AUTH_API_URL}/upload/image`, { // Updated to match server route
        method: "POST",
        body: formData,
        credentials: "include"
      });
      
      const data = await response.json();
      if (response.ok) {
        const imageUrl = `data:${imageFile.type};base64,${await toBase64(imageFile)}`;
        const userImageMsg = { type: "image", imageUrl, sender: "user" };
        setMessages((prevMessages) => [...prevMessages, userImageMsg]);
        const botMsg = { text: "Image uploaded and stored successfully!", sender: "bot" };
        setMessages((prevMessages) => [...prevMessages, botMsg]);
        setWarning("");
      } else {
        setWarning(data.message || "Image upload failed.");
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      setWarning("Error uploading image.");
    } finally {
      setIsLoading(false);
    }
  };

  const toBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      setWarning("No file uploaded or file size exceeded. Please upload a valid file.");
      return;
    }
    setIsLoading(true);
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("file", file);
    });

    try {
      // Debug: log files being sent
      console.log("Sending files to /summarize endpoint:", files.map(f => f.name));

      const response = await fetch(`${API_BASE_URL}/summarize`, {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      // Debug: log response status
      console.log("Response status:", response.status);

      const data = await response.json();
      // Debug: log full response data
      console.log("API response data:", data);

      if (response.ok) {
        setUploadMessage("Files uploaded successfully!");

        // Add user message showing what files were uploaded
        const fileNames = files.map(file => file.name).join(", ");
        const userMessage = { text: `Uploaded files: ${fileNames}`, sender: "user" };
        setMessages((prevMessages) => [...prevMessages, userMessage]);

        // Check if doc_id exists in response and log it
        console.log("Document ID from response:", data.doc_id);

        // Store the document ID for later queries - improved error handling
        if (data.doc_id) {
          console.log("Setting active document ID:", data.doc_id);
          setActiveDocId(data.doc_id);
          setDocumentTitle(data.source || files[0].name || "Document");

          // Add a system message to indicate the document is active
          const systemMsg = {
            text: `Document "${data.source || files[0].name}" is now active. You can ask questions about it.`,
            sender: "system"
          };
          setMessages((prevMessages) => [...prevMessages, systemMsg]);

          // History is now handled on the server side for authenticated users
          if (isAuthenticated) {
            // Just update the history count as the server already saved the record
            fetchHistoryCount();
          }
        } else {
          console.error("No doc_id received from API. Full response:", data);
          // Don't show error yet - we still got a summary, so continue
        }

        // Add the summary to the messages if available
        if (data.summary) {
          const botMessage = {
            text: `Summary: ${data.summary}`,
            sender: "bot"
          };
          setMessages((prevMessages) => [...prevMessages, botMessage]);

          // If we have a summary but no doc_id, create a temporary ID
          if (!data.doc_id && data.summary) {
            // Generate a temporary ID based on the summary
            const tempId = `temp_${Date.now()}`;
            console.log("Creating temporary document ID:", tempId);
            setActiveDocId(tempId);
            setDocumentTitle(data.source || files[0].name || "Document");

            // Add a system message with a softer warning
            const systemMsg = {
              text: `Warning: Document ID not received from server. Some functionality may be limited.`,
              sender: "system"
            };
            setMessages((prevMessages) => [...prevMessages, systemMsg]);
          }
        } else if (!data.summary && !data.doc_id) {
          // Both summary and doc_id are missing - this is a real error
          const errorMsg = {
            text: "Error: Could not process document. Please try uploading again.",
            sender: "system"
          };
          setMessages((prevMessages) => [...prevMessages, errorMsg]);
        }

        // Set advantages and limitations if available
        if ((data.advantages && data.advantages.length > 0) ||
            (data.limitations && data.limitations.length > 0)) {
          setAdvantages(data.advantages || []);
          setLimitations(data.limitations || []);
          setShowResults(true);
        }

        // Add a completed message only if we have a summary
        if (data.summary) {
          const completedMsg = {
            text: "Analysis complete! You can now ask specific questions about the document.",
            sender: "system"
          };
          setMessages((prevMessages) => [...prevMessages, completedMsg]);
        }

        setFiles([]);
        setWarning("");

        // Automatically switch to chat tab after successful upload if we have a document ID or summary
        if (data.doc_id || (data.summary && !data.doc_id)) {
          setActiveTab('chat');
        }

        // Save to history (both MongoDB and localStorage)
        if (data.doc_id) {
          const historyItem = {
            doc_id: data.doc_id,
            documentTitle: data.source || files[0].name,
            summary: data.summary,
            advantages: data.advantages || [],
            limitations: data.limitations || [],
            timestamp: new Date().toISOString(),
            queries: [],
            userId: user?.id // Include user ID if authenticated
          };

          // Save to both storages
          await saveHistory(historyItem);
          console.log("Document saved to history:", historyItem);
        }
      } else {
        setWarning(data.message || "File upload failed.");
        console.error("API error response:", data);
      }
    } catch (error) {
      console.error("Error uploading files:", error);
      setWarning("Error uploading files. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (input.trim() === "") return;

    // Add user message to chat
    const userMessage = { text: input, sender: "user" };
    setMessages((prevMessages) => [...prevMessages, userMessage]);

    // Temporarily store input and clear the input field
    const question = input;
    setInput("");
    setIsLoading(true);

    if (activeDocId) {
      // If we have an active document, send the question to the backend
      try {
        console.log("Sending question about document:", activeDocId);

        // Check if we're using a temporary ID
        if (activeDocId.startsWith("temp_")) {
          // Handle temporary ID situation (no backend doc_id)
          console.log("Using temporary document ID - handling locally");

          // Create a generic response based on the question
          setTimeout(() => {
            let botResponse = "I don't have specific information from this document stored on the server. ";
            botResponse += "I can only provide general information based on your question. ";
            botResponse += "Try uploading the document again to enable full functionality.";

            const botMessage = {
              text: botResponse,
              sender: "bot"
            };
            setMessages((prevMessages) => [...prevMessages, botMessage]);
            setIsLoading(false);
          }, 1000);

          return;
        }

        const response = await fetch(`${API_BASE_URL}/ask`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question,
            doc_id: activeDocId
          }),
          credentials: "include"
        });

        const data = await response.json();
        if (response.ok) {
          // Add AI's response to chat
          const botMessage = {
            text: data.answer,
            sender: "bot"
          };
          setMessages((prevMessages) => [...prevMessages, botMessage]);

          // Update history with new question/answer
          const localHistory = getLocalHistory();
          const currentDoc = localHistory.find(item => item.doc_id === activeDocId);
          
          if (currentDoc) {
            currentDoc.queries = currentDoc.queries || [];
            currentDoc.queries.push({
              question: question,
              answer: data.answer,
              timestamp: new Date().toISOString()
            });
            
            // Save updated history
            await saveHistory(currentDoc);
          }
        } else {
          // Handle errors
          console.error("API error:", data);
          const errorMsg = {
            text: `Error: ${data.error || "Failed to get an answer."} Try uploading the document again.`,
            sender: "system"
          };
          setMessages((prevMessages) => [...prevMessages, errorMsg]);
        }
      } catch (error) {
        console.error("Error sending message:", error);
        const errorMsg = {
          text: "Error connecting to the server. Please try again.",
          sender: "system"
        };
        setMessages((prevMessages) => [...prevMessages, errorMsg]);
      }
    } else {
      // If no document is active, inform the user
      const systemMsg = {
        text: "Please upload a document first before asking questions.",
        sender: "system"
      };
      setMessages((prevMessages) => [...prevMessages, systemMsg]);
    }

    setIsLoading(false);
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  // Navigate to history page
  const goToHistory = () => {
    navigate('/history');
  };

  // Handle logout
  const handleLogout = (e) => {
    e.preventDefault();
    logout();
    window.location.href = '/';
  };

  // Local storage functions for history management
  const getLocalHistory = () => {
    try {
      const localHistory = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
      return localHistory ? JSON.parse(localHistory) : [];
    } catch (error) {
      console.error("Error reading history from local storage:", error);
      return [];
    }
  };

  const saveToLocalHistory = (historyItem) => {
    try {
      const currentHistory = getLocalHistory();
      
      // Check if an item with same doc_id already exists
      const existingIndex = currentHistory.findIndex(item => item.doc_id === historyItem.doc_id);
      
      if (existingIndex >= 0) {
        // Update existing item
        currentHistory[existingIndex] = {
          ...currentHistory[existingIndex],
          ...historyItem,
          last_accessed: new Date().toISOString()
        };
      } else {
        // Add new item
        currentHistory.push({
          ...historyItem,
          created_at: new Date().toISOString(),
          last_accessed: new Date().toISOString()
        });
      }
      
      // Limit history size to prevent localStorage issues
      const limitedHistory = currentHistory.slice(-100);
      
      localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(limitedHistory));
      return limitedHistory.length;
    } catch (error) {
      console.error("Error saving to local history:", error);
      return 0;
    }
  };

  // Sync MongoDB history to local storage
  const syncHistoryToLocalStorage = (mongoHistory) => {
    try {
      const localHistory = getLocalHistory();
      
      // Create a map of existing doc_ids in local storage
      const localDocIds = new Set(localHistory.map(item => item.doc_id));
      
      // Find items in MongoDB that aren't in local storage
      const newItems = mongoHistory.filter(item => !localDocIds.has(item.doc_id));
      
      if (newItems.length > 0) {
        // Add new MongoDB items to local storage
        const updatedHistory = [...localHistory, ...newItems];
        localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(updatedHistory));
        console.log(`Synced ${newItems.length} new items from MongoDB to local storage`);
      }
    } catch (error) {
      console.error("Error syncing MongoDB history to local storage:", error);
    }
  };

  // Save history to both MongoDB (if authenticated) and local storage
  const saveHistory = async (historyItem) => {
    // Always save to local storage first
    const localCount = saveToLocalHistory(historyItem);
    
    // If authenticated, also save to MongoDB
    if (isAuthenticated && user) {
      try {
        const response = await fetch(`${AUTH_API_URL}/history`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...historyItem,
            user_id: user.id // Make sure user ID is included
          }),
          credentials: "include"
        });
        
        if (!response.ok) {
          console.error("Failed to save history to MongoDB:", await response.text());
        }
      } catch (error) {
        console.error("Error saving history to MongoDB:", error);
      }
    }
    
    // Update history count in state
    setHistoryCount(localCount);
  };

  // Add this useEffect to monitor localStorage
  useEffect(() => {
    const checkStorage = () => {
      const localHistory = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
      console.log("Current localStorage history:", localHistory ? JSON.parse(localHistory) : "No history");
    };

    checkStorage();
    // Check storage whenever historyCount changes
  }, [historyCount]);

  return (
    <div className="homepage-container">
      {/* Navbar with auth */}
      <nav className={`navbar ${scrollPosition > 20 ? 'navbar-scrolled' : ''}`}>
        <div className="nav-container">
          <div className="nav-logo">
            <img src={imgLogo} alt="ThinkBrief Logo" className="logo" />
            <h2>ThinkBrief</h2>
          </div>
          <div className="nav-links">
            <a href="/" className="active">Home</a>
            <a href="/chat">Chat</a>
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
      {/* Hero section to match AboutUs.js style */}
      <section className="hero-section">
        <div className="hero-content">
          <h1>Understand Any Document in Seconds</h1>
          <p className="hero-subtitle">Upload your documents for instant AI-powered summarization and insights.</p>
          {!isAuthenticated && (
            <button className="hero-cta" onClick={() => document.getElementById('file-upload').click()}>
              Get Started <FaArrowRight className="arrow-icon" />
            </button>
          )}
        </div>
        <div className="gradient-sphere sphere-1"></div>
        <div className="gradient-sphere sphere-2"></div>
      </section>
      <main className="content-container">
        <div className="section-container">
          <div className="section-header">
          <div className="tab-buttons">
            <button 
              className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <FaUpload /> Upload & Analyze
            </button>
            <button 
              className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <FaRobot /> Ask Questions
            </button>
            
          </div>
            <div className="section-divider"></div>
          </div>
                      
          <div className="tab-content">
            <div className={`upload-section ${activeTab === 'upload' ? 'active' : ''}`}>
              <div className="upload-interface">
                <div className="upload-box">
                  <input 
                    type="file"
                    multiple
                    accept=".pdf,.docx,.txt,.doc,.ppt,.pptx"
                    onChange={handleFileUpload}
                    className="file-input"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="upload-label">
                    <div className="upload-icon-container">
                      <FaUpload className="upload-icon" />
                    </div>
                    <h3>Drag files here or click to upload</h3>
                    <p className="upload-hint">PDF, DOCX, PPT, or TXT (Max: {MAX_FILE_SIZE_MB}MB)</p>
                  </label>
                  {warning && <div className="alert warning-message">{warning}</div>}
                  {uploadMessage && <div className="alert success-message">{uploadMessage}</div>}
                </div>
                {files.length > 0 && (
                  <div className="files-list">
                    <h3>Selected Files</h3>
                    <ul className="file-cards">
                      {files.map((file, index) => (
                        <li key={index} className="file-card">
                          <div className="file-icon">
                            {file.name.endsWith('.pdf') ? 'PDF' :
                              file.name.endsWith('.docx') || file.name.endsWith('.doc') ? 'DOC' :
                             file.name.endsWith('.ppt') || file.name.endsWith('.pptx') ? 'PPT' : 'TXT'}
                          </div>
                          <div className="file-details">
                            <span className="file-name">{file.name}</span>
                            <span className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    
                    <button 
                      onClick={handleSubmit}
                      className={`process-btn ${isLoading ? 'loading' : ''}`}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Processing...' : 'Summarize Documents'}
                    </button>
                  </div>
                )}
              </div>
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
              {/* Summary Results Section with updated styling */}
              {showResults && (
                <div className="summary-results">
                  <div className="section-header">
                    <h2>Document Analysis</h2>
                    <div className="section-divider"></div>
                  </div>
                  
                  <div className="results-grid">
                    {advantages.length > 0 && (
                      <div className="result-card advantages-section">
                        <div className="card-header">
                          <h3>Advantages</h3>
                        </div>
                        <ul className="advantages-list">
                          {advantages.map((adv, idx) => (
                            <li key={idx}>
                              <span className="advantage-bullet">✓</span>
                              <span className="advantage-text">{adv}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {limitations.length > 0 && (
                      <div className="result-card limitations-section">
                        <div className="card-header">
                          <h3>Limitations</h3>
                        </div>
                        <ul className="limitations-list">
                          {limitations.map((lim, idx) => (
                            <li key={idx}>
                              <span className="limitation-bullet">⚠</span>
                              <span className="limitation-text">{lim}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  
                  {advantages.length === 0 && limitations.length === 0 && (
                    <p className="no-results-message">No advantages or limitations available for this document.</p>
                  )}
                  
                  <button className="btn-primary" onClick={() => setActiveTab('chat')}>
                    Ask Questions About This Document <FaArrowRight />
                  </button>
                </div>
              )}
            </div>
            <div className={`chat-section ${activeTab === 'chat' ? 'active' : ''}`}>
              <div className="chat-interface">
                <div className="chat-header">
                  <h2>{activeDocId ? `Questions About: ${documentTitle}` : "ThinkBrief Assistant"}</h2>
                  {activeDocId && (
                    <div className="active-document-badge">{documentTitle} (ID: {activeDocId.substring(0, 8)}...)</div>
                  )}
                </div>
                
                <div className="messages-container" id="messages">
                  {messages.length === 0 ? (
                    <div className="empty-chat">
                      <div className="empty-chat-icon">
                        <FaRobot />
                      </div>
                      <h3>No Conversations Yet</h3>
                      <p>{activeDocId ? "Start asking questions about your document" : "Upload a document to start asking questions"}</p>
                      {!activeDocId && (
                        <button className="btn-primary" onClick={() => setActiveTab('upload')}>
                          Upload Document <FaArrowRight />
                        </button>
                      )}
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
                          }`}
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
                              {msg.type === "image" ? (
                                <img src={msg.imageUrl} alt="Uploaded" className="message-image" />
                              ) : (
                                msg.text
                              )}
                            </div>
                          </div>
                          <div className="message-timestamp">
                            {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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
                    placeholder={
                      activeDocId
                        ? "Ask a question about the document..."
                        : "Upload a document first to ask questions"
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    disabled={isLoading || !activeDocId}
                  />
                  
                  <div className="input-actions">
                    <label htmlFor="image-upload" className="action-button upload-image-button" title="Upload an image">
                      <FaImage />
                    </label>
                    <input 
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      className="file-input"
                      onChange={handleImageUpload}
                    />
                    
                    <button
                      onClick={handleSendMessage}
                      className="action-button send-button"
                      disabled={input.trim() === "" || isLoading || !activeDocId}
                      title="Send message"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      {/* Features section with updated styling */}
      <section className="features-section">
        <div className="section-container">
          <div className="section-header">
            <h2>How ThinkBrief Works</h2>
            <div className="section-divider"></div>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">1</div>
              <h3>Upload Documents</h3>
              <p>Upload any document format including PDFs, Word, PowerPoint, or text files.</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">2</div>
              <h3>AI Analysis</h3>
              <p>Our AI engine automatically summarizes and extracts key insights from your documents.</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">3</div>
              <h3>Ask Questions</h3>
              <p>Have a conversation with our AI to understand your document better or extract specific information.</p>
            </div>
          </div>
        </div>
      </section>
      {/* CTA Section like in AboutUs.js - modified based on login status */}
      <section className="cta-section">
        <div className="section-container">
          {!isAuthenticated ? (
            <>
              <h2>Ready to simplify your research?</h2>
              <p>Upload your first paper and experience the power of AI-driven summarization.</p>
              <div className="cta-buttons">
                <a href="/chat" className="btn-primary">Try ThinkBrief</a>
                <a href="/login" className="btn-secondary">Sign Up Free</a>
              </div>
            </>
          ) : (
            <>
              <h2>Need more advanced features?</h2>
              <p>Explore our premium options for enhanced document analysis.</p>
              <div className="cta-buttons">
                <a href="/profile" className="btn-primary">View Your Profile</a>
              </div>
            </>
          )}
        </div>
      </section>
      {/* Footer with updated styling */}
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
export default Homepage;