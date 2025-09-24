// App.js
import { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { signOut } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import LoginPage from "./LoginPage.jsx";
import PushSetup from "./PushSetup.jsx";
import SignupPage from "./SignupPage.jsx";
import ResetPage from "./ResetPage.jsx";
import AdminPage from "./AdminPage.jsx";
import ModernAdminPage from "./ModernAdminPage.jsx";
import StudentPage from "./StudentPage.jsx";
import ModernStudentPage from "./ModernStudentPage.jsx";
import PointSystemPage from "./PointSystemPage.jsx";

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("login"); // "login" | "signup" | "reset"

  const [adminView, setAdminView] = useState("dashboard");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const userData = docSnap.data();
            const status = (userData.status || "").toLowerCase();

            if (status === "pending") {
              alert("⏳ Your account is pending admin approval.");
              await signOut(auth);
              setCurrentUser(null);
              setUserRole(null);
              setLoading(false);
              return;
            }

            if (status === "rejected") {
              alert("❌ Your account request was rejected by admin.");
              await signOut(auth);
              setCurrentUser(null);
              setUserRole(null);
              setLoading(false);
              return;
            }

            setCurrentUser(user);
            setUserRole(userData.role || "student");
          } else {
            setCurrentUser(null);
            setUserRole(null);
          }
        } catch (err) {
          console.error("Auth state error:", err);
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
        setAdminView("dashboard");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setAdminView("dashboard");
  };

  if (loading) {
    return (
      <div className="corner-loading" aria-label="Loading">
        <div className="corner-spinner"></div>
        <span className="corner-text">Signing you in…</span>
      </div>
    );
  }

  if (!currentUser) {
    if (page === "signup") {
      return (
        <SignupPage
          onSignupSuccess={() => setPage("login")}
          goToLogin={() => setPage("login")}
        />
      );
    }
    if (page === "reset") {
      return (
        <ResetPage
          goToLogin={() => setPage("login")}
          goToSignup={() => setPage("signup")}
        />
      );
    }
    return (
      <LoginPage
        onLoginSuccess={() => {}}
        goToSignup={() => setPage("signup")}
        goToReset={() => setPage("reset")}
      />
    );
  }

  if (userRole === "admin") {
    if (adminView === "points") {
      return <><PushSetup currentUser={currentUser} /><PointSystemPage goBack={() => setAdminView("dashboard")} /></>;
    }
    return (
      <>
        <PushSetup currentUser={currentUser} />
        <ModernAdminPage
          onLogout={handleLogout}
          goToPointSystem={() => setAdminView("points")}
        />
      </>
    );
  }

  return <><PushSetup currentUser={currentUser} /><ModernStudentPage currentUser={currentUser} onLogout={handleLogout} /></>;
}

export default App;
