// ResetPage.js
import { useState } from "react";
import { auth } from "./firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import "./loginpage.css";

function ResetPage({ goToLogin }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    if (!email) {
      alert("⚠️ Please enter your email.");
      return;
    }

    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, email);
      alert("📩 Password reset email sent! Check your inbox.");
      goToLogin();
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        alert("❌ No account found with this email.");
      } else if (err.code === "auth/invalid-email") {
        alert("⚠️ Invalid email address.");
      } else {
        alert("⚠️ " + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form className="login-box" onSubmit={handleReset}>
        <img src="/logo3.png" alt="Logo" className="login-logo" />
        <h2 className="login-title1">MEA MESS</h2>
        <h2 className="login-title2">Reset Password</h2>

        <input
          type="email"
          className="input-field"
          placeholder="Enter your registered email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Sending..." : "Submit"}
        </button>

        <p className="link" onClick={goToLogin}>
          🔙 Back to Login
        </p>
      </form>
    </div>
  );
}

export default ResetPage;
