import React, { createContext, useContext, useState, useEffect } from 'react';

// Create the auth context
const AuthContext = createContext(null);

// Custom hook to use the auth context
export const useAuth = () => {
  return useContext(AuthContext);
};

// Provider component
export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      
      if (token) {
        try {
          // Verify token with server
          const response = await fetch("http://localhost:5000/verify-token", {
            method: "GET",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            }
          });
          
          const data = await response.json();
          if (response.ok) {
            setIsAuthenticated(true);
            // Ensure user_id is included in user object
            setUser(data.user); // data.user should contain user_id
          } else {
            // Token invalid or expired
            localStorage.removeItem('token');
            setIsAuthenticated(false);
            setUser(null);
          }
        } catch (error) {
          console.error("Token verification error:", error);
          setIsAuthenticated(false);
          setUser(null);
        }
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  // Login function
  const login = async (email, password) => {
    try {
      const response = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (response.ok) {
        // Save only token in local storage
        localStorage.setItem("token", data.token);
        
        // Set user data from server response (should include user_id)
        setIsAuthenticated(true);
        setUser(data.user); // data.user should contain user_id
        return { success: true };
      } else {
        return { success: false, message: data.message || "Login failed" };
      }
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, message: "Login failed. Please try again." };
    }
  };

  // Signup function
  const signup = async (username, email, password) => {
    try {
      const response = await fetch("http://localhost:5000/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();
      // Optionally, set user state here if you want to auto-login after signup
      // setUser(data.user); // data.user should contain user_id
      return {
        success: response.ok,
        message: data.message || (response.ok ? "Signup successful" : "Signup failed"),
        user: data.user // expose user object with user_id if needed
      };
    } catch (error) {
      console.error("Signup error:", error);
      return { success: false, message: "Signup failed. Please try again." };
    }
  };

  // Logout function
  const logout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        // Notify server about logout
        await fetch("http://localhost:5000/logout", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Remove token from local storage
      localStorage.removeItem('token');
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  const value = {
    isAuthenticated,
    user,
    loading,
    login,
    signup,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;