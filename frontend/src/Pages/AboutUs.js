import React, { useState, useEffect } from "react";
import './AboutUs.css';
import { useAuth } from "../auth/AuthContext";
import { Link } from 'react-router-dom';

const AboutUs = () => {
  const [activeSection, setActiveSection] = useState(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const { isAuthenticated, user, logout } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const teamMembers = [
    { name: "B. Vamshi Deepak", id: "23BD1A05A7", role: "Student" },
    { name: "N. Shruti", id: "23BD1A059B", role: "Student" },
    { name: "S.V.S Ram Maanas", id: "23BD1A05BJ", role: "Student" },
    { name: "K. Niharika", id: "23BD1A662V", role: "Student" },
    { name: "B. Karunya", id: "23BD1A05A6", role: "Student" },
    { name: "Mr. Shankar", role: "Faculty" },
    { name: "Ms. J. Kamal Vijetha", role: "Faculty" }
  ];

  return (
    <div className="about-page">
      {/* Navigation */}
      <nav className={`navbar ${scrollPosition > 20 ? 'navbar-scrolled' : ''}`}>
        <div className="nav-container">
          <div className="nav-logo">
            <h2>ThinkBrief</h2>
          </div>
          <div className="nav-links">
            <a href="/">Home</a>
            <a href="/chat">Chat</a>
             {isAuthenticated &&(<Link to="/history">History</Link>)}
            <a href="/about" className="active">About</a>
            {isAuthenticated ? (
              <>
                <a href="/profile">Profile</a>
                <a href="/" onClick={(e) => {
                  e.preventDefault();
                  logout();
                  window.location.href = '/';
                }} className="login-btn">Logout</a>
              </>
            ) : (
              <a href="/login" className="login-btn">Login</a>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1>Making research accessible to everyone</h1>
          <p className="hero-subtitle">
            We're revolutionizing how people interact with academic research by transforming complex papers into clear, actionable insights.
          </p>
        </div>
        <div className="gradient-sphere sphere-1"></div>
        <div className="gradient-sphere sphere-2"></div>
      </section>

      {/* Mission Section */}
      <section className="mission-section">
        <div className="section-container">
          <div className="section-header">
            <h2>Our Mission</h2>
            <div className="section-divider"></div>
          </div>
          <div className="mission-content">
            <div className="mission-text">
              <p>
                Research papers contain vast information, making it difficult for researchers to extract key insights quickly. 
                We're solving this challenge with an AI-powered Research Paper Summarization system using the RAG Model for 
                accurate summaries.
              </p>
              <p>
                ThinkBrief provides concise, accurate summaries of papers uploaded by users, making complex knowledge more accessible.
              </p>
            </div>
            <div className="tech-stack">
              <h3>Our Technology</h3>
              <div className="tech-items">
                <div className="tech-item">
                  <span className="tech-icon">⚛️</span>
                  <span className="tech-name">React & CSS</span>
                  <span className="tech-label">Frontend</span>
                </div>
                <div className="tech-item">
                  <span className="tech-icon">🔄</span>
                  <span className="tech-name">Flask API</span>
                  <span className="tech-label">Backend</span>
                </div>
                <div className="tech-item">
                  <span className="tech-icon">🗄️</span>
                  <span className="tech-name">MongoDB & ChromaDB</span>
                  <span className="tech-label">Database</span>
                </div>
                <div className="tech-item">
                  <span className="tech-icon">🧠</span>
                  <span className="tech-name">FLAN T5</span>
                  <span className="tech-label">Transformer</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Vision Section with Animated Background */}
      <section className="vision-section">
        <div className="animated-bg"></div>
        <div className="section-container">
          <div className="section-header light">
            <h2>Our Vision</h2>
            <div className="section-divider"></div>
          </div>
          <p className="vision-text">
            Our vision is to revolutionize how people interact with academic research by making complex knowledge universally 
            accessible, understandable, and usable. We aim to become a go-to AI-powered platform that transforms lengthy and 
            technical research papers into meaningful summaries and interactive conversations.
          </p>
          <p className="vision-text">
            By combining state-of-the-art language models with intuitive design, we envision a future where research is not limited 
            by time, complexity, or technical background—empowering users to learn, innovate, and make informed decisions effortlessly.
          </p>
        </div>
      </section>

      {/* Team Section */}
      <section className="team-section">
        <div className="section-container">
          <div className="section-header">
            <h2>Our Team</h2>
            <div className="section-divider"></div>
          </div>
          <p className="team-intro">
            Meet the talented minds behind ThinkBrief from Keshav Memorial Institute of Technology.
          </p>
          <div className="team-grid">
            {teamMembers.map((member, index) => (
              <div className="team-card" key={index}>
                <div className="member-avatar">
                  {member.name.charAt(0)}
                </div>
                <h3>{member.name}</h3>
                {member.id && <p className="member-id">{member.id}</p>}
                <p className="member-role">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="section-container">
          <h2>Ready to simplify your research?</h2>
          <p>Upload your first paper and experience the power of AI-driven summarization.</p>
          <div className="cta-buttons">
            <a href="/chat" className="btn-primary">Try ThinkBrief</a>
            {!isAuthenticated && (
              <a href="/login" className="btn-secondary">Sign Up Free</a>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-logo">
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
              {isAuthenticated && <a href="/profile">Profile</a>}
            </div>
            <div className="footer-column">
              <h4>Legal</h4>
              <a href="/privacy">Privacy Policy</a>
              <a href="/terms">Terms of Service</a>
            </div>
            <div className="footer-column">
              <h4>Connect</h4>
              <a href="mailto:contact@thinkbrief.com">Email Us</a>
              <a href="https://github.com/thinkbrief">GitHub</a>
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

export default AboutUs;