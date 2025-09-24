// AdminPage.js
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import "./AdminPage.css";

function AdminPage({ onLogout, goToPointSystem }) {
  const [mealCounts, setMealCounts] = useState({});
  const [userPoints, setUserPoints] = useState({});
  const [userMarks, setUserMarks] = useState({});
  const [loading, setLoading] = useState(true);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [generated, setGenerated] = useState(false);

  const [allUsers, setAllUsers] = useState([]);
  const [view, setView] = useState("dashboard"); // dashboard | requests | points | meals | monthly

  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [fromDay, setFromDay] = useState(1);
  const [toDay, setToDay] = useState(1);

  const [dailyDay, setDailyDay] = useState(new Date().getDate());

  const defaultSystem = {
    X: 1,
    "0": 0,
    B: 0.25,
    L: 0.35,
    S: 0.45,
    "B/L": 0.65,
    "B/S": 0.75,
    "L/S": 0.85,
  };
  const [pointSystem, setPointSystem] = useState(defaultSystem);

  const [generatedRange, setGeneratedRange] = useState({ from: "", to: "" });

  const todayStr = new Date().toISOString().split("T")[0];

  // --- monthly users state ---
  const [monthlyUsers, setMonthlyUsers] = useState([]); // array of emails
  const currentKey = `${year}-${String(month).padStart(2, "0")}`;

  // --- exceptions state (persisted per month) ---
  const [exceptions, setExceptions] = useState([]); // [{ email, from, to }]
  const [exceptionUser, setExceptionUser] = useState("");
  const [exceptionFrom, setExceptionFrom] = useState("");
  const [exceptionTo, setExceptionTo] = useState("");

  // fetch settings + users + meal counts
  useEffect(() => {
    const fetchAll = async () => {
      try {
        // load point system settings (if exists)
        const settingsRef = doc(db, "settings", "points");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          setPointSystem(settingsSnap.data());
        } else {
          // create default if missing
          await setDoc(settingsRef, defaultSystem);
        }

        // load users
        const usersRef = collection(db, "users");
        const querySnapshot = await getDocs(usersRef);

        const all = [];
        // meal counts for next 8 days
        const counts = {};
        const today = new Date();

        const nextDays = [];
        for (let i = 0; i < 8; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() + i);
          const dateStr = d.toISOString().split("T")[0];
          nextDays.push(dateStr);
          counts[dateStr] = { breakfast: 0, lunch: 0, supper: 0 };
        }

        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          all.push(data);

          const userMeals = data.meals || {};
          nextDays.forEach((day) => {
            const meals = userMeals[day];
            if (meals) {
              // User has explicitly marked meals
              ["breakfast", "lunch", "supper"].forEach((meal) => {
                if (meals[meal]) counts[day][meal] += 1;
              });
            } else if (day > todayStr) {
              // future days default to assuming they will take meal (legacy behavior)
              counts[day].breakfast += 1;
              counts[day].lunch += 1;
              counts[day].supper += 1;
            }
          });
        });

        setAllUsers(all);
        setMealCounts(counts);
      } catch (err) {
        console.error("Admin data error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []); // run once

  // load monthly users whenever currentKey changes
  useEffect(() => {
    const loadMonthlyUsers = async () => {
      try {
        const ref = doc(db, "monthlyUsers", currentKey);
        const snap = await getDoc(ref);
        if (snap.exists()) setMonthlyUsers(snap.data().users || []);
        else setMonthlyUsers([]);
      } catch (err) {
        console.error("Error loading monthly users:", err);
        setMonthlyUsers([]);
      }
    };
    loadMonthlyUsers();
  }, [currentKey]);

  // load exceptions for current month
  useEffect(() => {
    const loadExceptions = async () => {
      try {
        const ref = doc(db, "monthlyExceptions", currentKey);
        const snap = await getDoc(ref);
        if (snap.exists()) setExceptions(snap.data().exceptions || []);
        else setExceptions([]);
      } catch (err) {
        console.error("Error loading exceptions:", err);
        setExceptions([]);
      }
    };
    loadExceptions();
  }, [currentKey]);

  // Recalculate meal counts when monthly users change
  useEffect(() => {
    if (allUsers.length > 0) {
      const recalculateMealCounts = () => {
        const counts = {};
        const today = new Date();
        const nextDays = [];
        
        for (let i = 0; i < 8; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() + i);
          const dateStr = d.toISOString().split("T")[0];
          nextDays.push(dateStr);
          counts[dateStr] = { breakfast: 0, lunch: 0, supper: 0 };
        }

        allUsers.forEach((user) => {
          const isMonthlyUser = monthlyUsers.includes(user.email);
          if (!isMonthlyUser) return; // Only count added monthly users

          const userMeals = user.meals || {};
          nextDays.forEach((day) => {
            const meals = userMeals[day];
            if (meals) {
              ["breakfast", "lunch", "supper"].forEach((meal) => {
                if (meals[meal]) counts[day][meal] += 1;
              });
            } else {
              // Monthly user without explicit marking - assume they take all meals
              counts[day].breakfast += 1;
              counts[day].lunch += 1;
              counts[day].supper += 1;
            }
          });
        });

        setMealCounts(counts);
      };

      recalculateMealCounts();
    }
  }, [allUsers, monthlyUsers]);

  // --- update user status (approve/reject) ---
  // uses query to find the user doc(s) with matching email and updates them
  const updateUserStatus = async (email, newStatus) => {
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", email));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        alert(`⚠️ User with email ${email} not found.`);
        return;
      }

      const updates = [];
      snapshot.forEach((docSnap) => {
        updates.push(updateDoc(doc(db, "users", docSnap.id), { status: newStatus }));
      });
      await Promise.all(updates);

      // update local list
      setAllUsers((prev) =>
        prev.map((u) => (u.email === email ? { ...u, status: newStatus } : u))
      );

      alert(`✅ User ${email} marked as ${newStatus}`);
    } catch (err) {
      console.error("Error updating status:", err);
      alert("⚠️ Error updating user status. See console.");
    }
  };

  // --- Add or toggle an approved user for the current month (manage monthly list) ---
  const toggleUserForMonth = async (email) => {
    try {
      // ensure only approved users can be toggled (defensive)
      const user = allUsers.find((u) => u.email === email);
      if (!user || (user.status && user.status !== "approved")) {
        alert("⚠️ Only approved users can be added to the monthly list.");
        return;
      }

      const ref = doc(db, "monthlyUsers", currentKey);
      const snap = await getDoc(ref);
      let users = snap.exists() ? snap.data().users || [] : [];

      if (users.includes(email)) {
        users = users.filter((u) => u !== email);
      } else {
        users.push(email);
      }

      await setDoc(ref, { users });
      setMonthlyUsers(users);
    } catch (err) {
      console.error("Error updating monthly users:", err);
      alert("⚠️ Could not update monthly users. See console.");
    }
  };

  // --- Download monthly users as CSV ---
  const downloadMonthlyUsers = async () => {
    try {
      const ref = doc(db, "monthlyUsers", currentKey);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        alert("⚠️ No users found for this month");
        return;
      }
      const users = snap.data().users || [];
      const rows = [["Email"]];
      users.forEach((u) => rows.push([u]));
      const csvContent = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", `monthly_users_${currentKey}.csv`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Error downloading monthly users:", err);
      alert("⚠️ Could not download monthly users. See console.");
    }
  };

  // --- Exceptions management (persisted) ---
  const addException = async () => {
    try {
      if (!exceptionUser || !exceptionFrom || !exceptionTo) {
        alert("⚠️ Please choose user and both from/to dates.");
        return;
      }
      if (exceptionFrom > exceptionTo) {
        alert("⚠️ 'From' date must be on or before 'To' date.");
        return;
      }
      // only allow exception for monthlyUsers (defensive)
      if (!monthlyUsers.includes(exceptionUser)) {
        alert("⚠️ Add the user to Monthly Users before creating an exception for them.");
        return;
      }
      const newEx = { email: exceptionUser, from: exceptionFrom, to: exceptionTo };

      // avoid exact duplicates
      const exists = exceptions.some(
        (e) => e.email === newEx.email && e.from === newEx.from && e.to === newEx.to
      );
      if (exists) {
        alert("⚠️ This exception already exists.");
        return;
      }

      const updated = [...exceptions, newEx];
      const ref = doc(db, "monthlyExceptions", currentKey);
      await setDoc(ref, { exceptions: updated });
      setExceptions(updated);
      setExceptionUser("");
      setExceptionFrom("");
      setExceptionTo("");
    } catch (err) {
      console.error("Error adding exception:", err);
      alert("⚠️ Could not add exception. See console.");
    }
  };

  const removeException = async (index) => {
    try {
      const updated = exceptions.filter((_, i) => i !== index);
      const ref = doc(db, "monthlyExceptions", currentKey);
      await setDoc(ref, { exceptions: updated });
      setExceptions(updated);
    } catch (err) {
      console.error("Error removing exception:", err);
      alert("⚠️ Could not remove exception. See console.");
    }
  };

  // --- helpers ---
  const buildDaysArray = (from, to) => {
    const arr = [];
    const s = new Date(from);
    const e = new Date(to);
    for (let d = new Date(s.getTime()); d.getTime() <= e.getTime(); d.setDate(d.getDate() + 1)) {
      arr.push(d.toISOString().split("T")[0]);
    }
    return arr;
  };

  // returns a Set of ISO day strings that are allowed for this user (union of their exception ranges intersected with report range).
  // returns null if the user has NO exceptions (meaning full range allowed)
  const getAllowedDaysSet = (userEmail, reportFrom, reportTo) => {
    const userEx = exceptions.filter((ex) => ex.email === userEmail);
    if (!userEx || userEx.length === 0) return null;
    const allowed = new Set();
    userEx.forEach((ex) => {
      // determine intersection between ex.from..ex.to and reportFrom..reportTo
      const start = new Date(ex.from) > new Date(reportFrom) ? new Date(ex.from) : new Date(reportFrom);
      const end = new Date(ex.to) < new Date(reportTo) ? new Date(ex.to) : new Date(reportTo);
      if (start.getTime() > end.getTime()) return; // no intersection
      for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
        allowed.add(d.toISOString().split("T")[0]);
      }
    });
    return allowed;
  };

  // --- Generate report: only users present in monthlyUsers for currentKey; for users with exceptions compute only in exception days ---
  const generateReport = (f, t) => {
    const from = f || fromDate;
    const to = t || toDate;

    if (!from || !to) {
      alert("⚠️ Please select both From and To dates!");
      return;
    }

    if (!monthlyUsers || monthlyUsers.length === 0) {
      alert("⚠️ No users added for this month. Use Manage Monthly Users to add approved users.");
      return;
    }

    const points = {};
    const markings = {};
    const days = buildDaysArray(from, to);

    allUsers.forEach((user) => {
      // only include users who are in this month's list
      if (!monthlyUsers.includes(user.email)) return;

      const email = user.email || "Unknown";
      const displayName = user.name || email;
      const userMeals = user.meals || {};
      let totalPoints = 0;
      const userMarkings = {};

      // fallback logic: earliest meal date
      const mealDates = Object.keys(userMeals).sort();
      const firstMealDate = mealDates.length > 0 ? mealDates[0] : todayStr;

      // allowed days set for this user (null => no restriction)
      const allowedSet = getAllowedDaysSet(email, from, to);

      days.forEach((day) => {
        // if there is an allowedSet and this day is not in it => mark as 0
        if (allowedSet && !allowedSet.has(day)) {
          userMarkings[day] = "0";
          return; // next day
        }

        let meals = userMeals[day];
        if (!meals) {
          // Only apply the previous fallback behavior when day is allowed
          if (day > todayStr || day >= firstMealDate) {
            meals = { breakfast: true, lunch: true, supper: true };
          } else {
            userMarkings[day] = "0";
            return;
          }
        }

        const arr = [];
        if (meals.breakfast) arr.push("B");
        if (meals.lunch) arr.push("L");
        if (meals.supper) arr.push("S");

        let key;
        if (arr.length === 3) key = "X";
        else if (arr.length === 0) key = "0";
        else key = arr.join("/");

        totalPoints += pointSystem[key] ?? 0;
        userMarkings[day] = key;
      });

      points[displayName] = totalPoints.toFixed(2);
      markings[displayName] = userMarkings;
    });

    setUserPoints(points);
    setUserMarks(markings);
    setGenerated(true);
    setFromDate(from);
    setToDate(to);
    setGeneratedRange({ from, to });
  };

  // --- Export CSV (range) ---
  const exportCSV = () => {
    const from = generatedRange.from || fromDate;
    const to = generatedRange.to || toDate;
    if (!from || !to) {
      alert("⚠️ Please generate a report first.");
      return;
    }
    const days = buildDaysArray(from, to);
    const header = ["Name", ...days, "Total Points"];
    const rows = [header];
    Object.entries(userPoints).forEach(([name, pts]) => {
      const marks = userMarks[name] || {};
      const row = [name];
      days.forEach((day) => row.push(marks[day] || "0"));
      row.push(pts);
      rows.push(row);
    });
    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", `points_${from}_to_${to}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- Export single-day marking CSV (only monthly users; respects exceptions) ---
  const exportDailyMarkingCSV = () => {
    const day = String(dailyDay).padStart(2, "0");
    const mon = String(month).padStart(2, "0");
    const selectedDate = `${year}-${mon}-${day}`;

    const rows = [["Name", "Marking"]];

    allUsers.forEach((user) => {
      if (!monthlyUsers.includes(user.email)) return; // only monthly users

      const displayName = user.name || user.email || "Unknown";

      // compute allowed days for this user (intersection of exceptions with selectedDate)
      const allowedSet = getAllowedDaysSet(user.email, selectedDate, selectedDate);

      // If allowedSet exists and selectedDate is not allowed -> key = "0"
      if (allowedSet && !allowedSet.has(selectedDate)) {
        rows.push([displayName, "0"]);
        return;
      }

      const meals = user.meals?.[selectedDate];
      let key;
      if (!meals) {
        key = selectedDate > todayStr ? "X" : "0";
      } else {
        const arr = [];
        if (meals.breakfast) arr.push("B");
        if (meals.lunch) arr.push("L");
        if (meals.supper) arr.push("S");
        if (arr.length === 3) key = "X";
        else if (arr.length === 0) key = "0";
        else key = arr.join("/");
      }
      rows.push([displayName, key]);
    });

    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", `daily_marking_${selectedDate}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading) return <h2 className="loading">Loading data...</h2>;

  // ---------- Requests view ----------
  if (view === "requests") {
    return (
      <div className="admin-container">
        <h2 className="title">🆕 Pending User Requests</h2>
        <table className="meal-table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Year</th><th>Branch</th><th>Phone</th><th>Hostel</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.filter((u) => u.status === "pending").map((user) => (
              <tr key={user.email}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.year}</td>
                <td>{user.branch}</td>
                <td>{user.phone}</td>
                <td>{user.mea}</td>
                <td>
                  <button className="btn approve-btn" onClick={() => updateUserStatus(user.email, "approved")}>✅ Approve</button>
                  <button className="btn reject-btn" onClick={() => updateUserStatus(user.email, "rejected")}>❌ Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="admin-actions">
          <button className="btn" onClick={() => setView("dashboard")}>⬅️ Back</button>
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </div>
    );
  }

  // ---------- Manage Monthly Users view (ONLY approved users are shown to be toggled) ----------
  if (view === "monthly") {
    return (
      <div className="admin-container">
        <h2 className="title">👥 Manage Monthly Users ({currentKey})</h2>

        <div className="report-filters" style={{ justifyContent: "flex-start", gap: 12 }}>
          <label>
            Month:
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {[
                "January","February","March","April","May","June",
                "July","August","September","October","November","December"
              ].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </label>

          <label>
            Year:
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {Array.from({ length: 6 }, (_, i) => 2023 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>

        <table className="meal-table" style={{ marginTop: 14 }}>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Include for month?</th></tr>
          </thead>
          <tbody>
            {allUsers.filter((u) => u.status === "approved").map((user) => (
              <tr key={user.email}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={monthlyUsers.includes(user.email)}
                      onChange={() => toggleUserForMonth(user.email)}
                    />
                    <span className="small-muted">{monthlyUsers.includes(user.email) ? "Included" : "Not included"}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="admin-actions">
          <button className="btn export-btn" onClick={downloadMonthlyUsers}>⬇️ Download Monthly Users</button>
          <button className="btn" onClick={() => setView("dashboard")}>⬅️ Back</button>
        </div>
      </div>
    );
  }

  // ---------- Points view (with Exception section) ----------
  if (view === "points") {
    const daysInMonth = new Date(year, month, 0).getDate();

    return (
      <div className="admin-container">
        <h2 className="title">📑 Generate Points Report ({currentKey})</h2>

        <div className="report-filters">
          <label>
            Month:
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {[
                "January","February","March","April","May","June",
                "July","August","September","October","November","December"
              ].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </label>

          <label>
            Year:
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {Array.from({ length: 6 }, (_, i) => 2023 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>

          <label>
            From:
            <select value={fromDay} onChange={(e) => setFromDay(Number(e.target.value))}>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>

          <label>
            To:
            <select value={toDay} onChange={(e) => setToDay(Number(e.target.value))}>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>

          <button
            className="btn generate-btn"
            onClick={() => {
              let fDay = fromDay;
              let tDay = toDay;
              if (fromDay > toDay) {
                fDay = toDay;
                tDay = fromDay;
                setFromDay(fDay);
                setToDay(tDay);
              }
              const f = `${year}-${String(month).padStart(2, "0")}-${String(fDay).padStart(2, "0")}`;
              const t = `${year}-${String(month).padStart(2, "0")}-${String(tDay).padStart(2, "0")}`;
              generateReport(f, t);
            }}
          >
            Generate
          </button>
        </div>

        {/* Exception section */}
        <div className="exception-section" style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
          <h3 style={{ margin: "0 0 8px 0" }}>⚠️ Exception Ranges (per user)</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select value={exceptionUser} onChange={(e) => setExceptionUser(e.target.value)}>
              <option value="">-- Select Monthly User --</option>
              {allUsers.filter(u => monthlyUsers.includes(u.email)).map(u => (
                <option key={u.email} value={u.email}>{u.name || u.email}</option>
              ))}
            </select>

            <input type="date" value={exceptionFrom} onChange={(e) => setExceptionFrom(e.target.value)} />
            <input type="date" value={exceptionTo} onChange={(e) => setExceptionTo(e.target.value)} />
            <button
              className="btn"
              onClick={addException}
            >
              ➕ Add Exception
            </button>
          </div>

          {exceptions.length > 0 && (
            <ul style={{ marginTop: 12 }}>
              {exceptions.map((ex, i) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  <strong>{ex.email}</strong> — {ex.from} → {ex.to}
                  <button className="btn reject-btn" style={{ marginLeft: 10 }} onClick={() => removeException(i)}>❌ Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {generated && (
          <>
            <table className="meal-table" style={{ marginTop: 12 }}>
              <thead>
                <tr><th>Name</th><th>Total Points</th></tr>
              </thead>
              <tbody>
                {Object.entries(userPoints).map(([name, points]) => (
                  <tr key={name}><td>{name}</td><td>{points}</td></tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
              <button className="btn export-btn" onClick={exportCSV}>⬇️ Download Range CSV</button>
              <button className="btn export-btn" onClick={downloadMonthlyUsers}>⬇️ Download Monthly Users</button>
            </div>
          </>
        )}

        <div style={{ marginTop: 18, borderTop: "1px solid #ddd", paddingTop: 12 }}>
          <h3>📅 Export Single-Day Markings</h3>
          <label className="single-day-label">
            Day:
            <select className="single-day-date" value={dailyDay} onChange={(e) => setDailyDay(Number(e.target.value))}>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <button className="btn export-btn" onClick={exportDailyMarkingCSV} style={{ marginLeft: 10 }}>
            ⬇️ Download todays Marking
          </button>
        </div>

        <div className="admin-actions" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => setView("dashboard")}>⬅️ Back</button>
        </div>
      </div>
    );
  }

  // ---------- Meals page ----------
  if (view === "meals") {
    return (
      <div className="admin-container">
        <h2 className="title">🥘 Meal Counts (Next 8 Days)</h2>
        <table className="meal-table">
          <thead><tr><th>Date</th><th>Breakfast</th><th>Lunch</th><th>Supper</th></tr></thead>
          <tbody>
            {Object.entries(mealCounts).map(([day, meals]) => (
              <tr key={day}>
                <td className="date-col">{day}</td>
                <td className={day === todayStr ? "today-col" : ""}>{meals.breakfast}</td>
                <td className={day === todayStr ? "today-col" : ""}>{meals.lunch}</td>
                <td className={day === todayStr ? "today-col" : ""}>{meals.supper}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="admin-actions">
          <button className="btn" onClick={() => setView("dashboard")}>⬅️ Back</button>
        </div>
      </div>
    );
  }

  // ---------- Dashboard ----------
  const todayMeals = mealCounts[todayStr] || { breakfast: 0, lunch: 0, supper: 0 };

  return (
    <div className="admin-container">
      <h2 className="title">📊 Admin Dashboard</h2>

      <h3>🍽️ Today’s Meal Count</h3>
      <div className="today-meals">
        <p>🍳 Breakfast: <strong>{todayMeals.breakfast}</strong></p>
        <p>🥗 Lunch: <strong>{todayMeals.lunch}</strong></p>
        <p>🍛 Supper: <strong>{todayMeals.supper}</strong></p>
      </div>

      <div className="admin-actions">
        <button className="btn points-btn" onClick={goToPointSystem}>⚙️ Point System</button>
        <button className="btn points-btn" onClick={() => setView("points")}>📑 Points Report</button>
        <button className="btn points-btn" onClick={() => setView("requests")}>👥 User Requests</button>
        <button className="btn points-btn" onClick={() => setView("monthly")}>👤 Manage Monthly Users</button>
        <button className="btn points-btn" onClick={() => setView("meals")}>🥘 Meal Counts</button>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </div>
    </div>
  );
}

export default AdminPage;
