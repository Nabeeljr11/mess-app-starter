import { useState } from "react";
import { auth, db, createUserWithEmailAndPassword } from "./firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import "./signuppage.css";

function SignupPage({ onSignupSuccess, goToLogin }) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [branch, setBranch] = useState("");
  const [otherBranch, setOtherBranch] = useState("");
  const [phone, setPhone] = useState("");
  const [mea, setHostel] = useState("");
  const [otherMea, setOtherHostel] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Generate next 7 days
  const getNext7Days = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(today);
      nextDay.setDate(today.getDate() + i);
      const dateStr = nextDay.toISOString().split("T")[0];
      days.push(dateStr);
    }
    return days;
  };

  // Create default meal plan
  const createDefaultMeals = () => {
    const meals = {};
    const todayStr = new Date().toISOString().split("T")[0];
    const days = getNext7Days();

    days.forEach((day) => {
      if (day > todayStr) {
        meals[day] = { breakfast: true, lunch: true, supper: true, lastUpdated: serverTimestamp() };
      } else {
        meals[day] = { breakfast: false, lunch: false, supper: false, lastUpdated: serverTimestamp() };
      }
    });

    return meals;
  };

  // Handle Signup
  const handleSignup = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      alert("⚠️ Passwords do not match!");
      return;
    }

    if (!/^\d{10}$/.test(phone)) {
      alert("⚠️ Phone number must be 10 digits!");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      const finalMea = mea === "Other" ? otherMea : mea;
      const finalBranch = branch === "Other" ? otherBranch : branch;

      // Save to Firestore with role + default meals + pending status
      await setDoc(doc(db, "users", userCredential.user.uid), {
        name,
        year,
        branch: finalBranch,
        phone,
        mea: finalMea,
        email,
        role: "student",
        status: "pending", // 🔹 mark new users as pending
        meals: createDefaultMeals(),
        createdAt: serverTimestamp(),
      });

      alert("✅ Signup successful! Please wait for admin approval.");
      if (onSignupSuccess) onSignupSuccess();
    } catch (err) {
      alert("⚠️ " + err.message);
    }
  };

  return (
    <div className="signup-container">
      <form className="signup-box" onSubmit={handleSignup}>
      <img src="/logo3.png" alt="Logo" className="signup-logo" />
      <h2 className="signup-title1">MEA MESS</h2>
      <h2 className="signup-title2">Signup</h2>

        <input type="text" className="input-field" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />

        <select value={year} onChange={(e) => setYear(e.target.value)} className="input-field" required>
          <option value="">Select Year</option>
          <option value="1">1</option><option value="2">2</option>
          <option value="3">3</option><option value="4">4</option>
        </select>

        <select value={branch} onChange={(e) => setBranch(e.target.value)} className="input-field" required>
          <option value="">Select Branch</option>
          <option value="CSE">CSE</option><option value="ECE">ECE</option>
          <option value="ME">ME</option><option value="CE">CE</option>
          <option value="EEE">EEE</option><option value="CHEM">CHE</option>
          <option value="CPS">CPS</option><option value="PE">PE</option>
          <option value="ARCH">ARCH</option><option value="MCA">MCA</option>
          <option value="M.TECH">M.TECH</option><option value="Other">Other</option>
        </select>
        {branch === "Other" && (
          <input type="text" className="input-field" placeholder="Specify Which Branch" value={otherBranch} onChange={(e) => setOtherBranch(e.target.value)} required />
        )}

        <input type="tel" className="input-field" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />

        <select className="input-field" value={mea} onChange={(e) => setHostel(e.target.value)} required>
          <option value="">Select Hostel</option>
          <option value="MEA">MEA</option>
          <option value="Other">Other</option>
        </select>
        {mea === "Other" && (
          <input type="text" className="input-field" placeholder="Specify Which Hostel" value={otherMea} onChange={(e) => setOtherHostel(e.target.value)} required />
        )}

        <input type="email" className="input-field" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" className="input-field" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input type="password" className="input-field" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />

        <button type="submit" className="btn">Signup</button>

        <p className="link">Already have an account? <span onClick={goToLogin}>Login</span></p>
      </form>
    </div>
  );
}

export default SignupPage;
