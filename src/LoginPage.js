import { useState } from "react";

import { auth, signInWithEmailAndPassword } from "./firebase";
import "./loginpage.css";

function LoginPage({ onLoginSuccess, goToSignup, goToReset }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onLoginSuccess();
    } catch (err) {
      alert("⚠️ " + err.message);
    }
  };

  return (
    <div className="login-container">
      <form className="login-box" onSubmit={handleLogin}>
        <img src="/logo3.png" alt="Logo" className="login-logo" />
        <h2 className="login-title1">MEA MESS</h2>
        <h2 className="login-title2">Login</h2>

        <input
          type="email"
          className="input-field"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="input-field"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit" className="btn">Login</button>

        <p className="link" onClick={goToReset}>Forgot Password?</p>
        <p className="link">
          Don’t have an account?{" "}
          <span onClick={goToSignup}>Sign up</span>
        </p>
      </form>
    </div>
  );
}

export default LoginPage;
