import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import "./UserProfilePage.css";

function UserProfilePage({ currentUser, onLogout, onBack }) {
  const [userData, setUserData] = useState({
    name: '',
    department: '',
    phone: '',
    email: ''
  });
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");

  // Load user data
  useEffect(() => {
    const loadUserData = async () => {
      if (!currentUser) return;
      
      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const data = userSnap.data();
          setUserData({
            name: data.name || '',
            department: data.department || data.branch || '',
            phone: data.phone || '',
            email: data.email || currentUser.email || ''
          });
          setAvatarUrl(data.photoURL || currentUser?.photoURL || "");
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [currentUser]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        name: userData.name,
        department: userData.department,
        phone: userData.phone
      });
      
      setIsEditing(false);
      alert('Profile updated successfully!');
    } catch (error) {
      console.error("Error updating profile:", error);
      alert('Error updating profile. Please try again.');
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await onLogout();
    } catch (error) {
      console.error("Error logging out:", error);
      alert('Error logging out. Please try again.');
    }
  };

  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setUserData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (loading) {
    return (
      <div className="profile-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-content">
        {/* Back to Dashboard (prominent) */}
        {onBack && (
          <div className="back-bar">
            <button className="back-to-home-btn" onClick={onBack}>
              ← Back to Dashboard
            </button>
          </div>
        )}
        {/* Header */}
        <div className="profile-header" style={{display:'flex', alignItems:'center', justifyContent:'center', gap:12}}>
          <h1 className="profile-title">User Profile</h1>
        </div>

        {/* Avatar Section */}
        <div className="avatar-section">
          <div className="avatar-circle">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="avatar-img" />
            ) : (
              (userData.name ? userData.name.charAt(0).toUpperCase() : 'U')
            )}
          </div>
        </div>

        {/* Profile Form */}
        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name" className="form-label">Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={userData.name}
              onChange={handleInputChange}
              className="form-input"
              placeholder="Enter your full name"
              disabled={!isEditing}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="department" className="form-label">Department</label>
            <input
              type="text"
              id="department"
              name="department"
              value={userData.department}
              onChange={handleInputChange}
              className="form-input"
              placeholder="Enter your department"
              disabled={!isEditing}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="phone" className="form-label">Phone</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={userData.phone}
              onChange={handleInputChange}
              className="form-input"
              placeholder="Enter your phone number"
              disabled={!isEditing}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={userData.email}
              className="form-input"
              placeholder="Enter your email"
              disabled
            />
          </div>

          {/* Action Buttons */}
          <div className="form-actions">
            {!isEditing ? (
              <button
                type="button"
                className="edit-btn"
                onClick={() => setIsEditing(true)}
              >
                Edit Profile
              </button>
            ) : (
              <div className="edit-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="save-btn"
                >
                  Save Changes
                </button>
              </div>
            )}
          </div>
        </form>

        {/* Logout Button */}
        <div className="logout-section">
          <button
            className="logout-btn"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default UserProfilePage;
