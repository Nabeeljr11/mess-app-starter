import React, { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  addDoc,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { deleteUser } from "firebase/auth";
import "./ModernAdminPage.css";

function ModernAdminPage({ onLogout, goToPointSystem }) {
  const [activeTab, setActiveTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [mealCounts, setMealCounts] = useState({});
  const [monthlyUsers, setMonthlyUsers] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  
  // Points and reports state
  const [userPoints, setUserPoints] = useState({});
  const [userMarks, setUserMarks] = useState({});
  const [generated, setGenerated] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fromDay, setFromDay] = useState(1);
  const [toDay, setToDay] = useState(1);
  const [dailyDay, setDailyDay] = useState(new Date().getDate());
  const [generatedRange, setGeneratedRange] = useState({ from: "", to: "" });
  
  // Point system
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

  // Export today's per-user meal markings for monthly users only
  const exportTodaysMarkingsCSV = () => {
    const today = new Date().toISOString().split("T")[0];
    const header = ["Name", "Email", "Breakfast", "Lunch", "Supper", "MarkKey"]; // MarkKey like X, B/L, 0
    const rows = [header];
    allUsers.forEach((user) => {
      if (!monthlyUsers.includes(user.email)) return;
      const name = user.name || user.email || "Unknown";
      const meals = (user.meals || {})[today];
      let b = false, l = false, s = false;
      if (meals) {
        b = !!meals.breakfast; l = !!meals.lunch; s = !!meals.supper;
      } else {
        // No explicit marking -> treat as unmarked (no meals)
        b = false; l = false; s = false;
      }
      const arr = [];
      if (b) arr.push("B");
      if (l) arr.push("L");
      if (s) arr.push("S");
      const key = arr.length === 3 ? "X" : (arr.length === 0 ? "0" : arr.join("/"));
      rows.push([name, user.email || "", b ? 1 : 0, l ? 1 : 0, s ? 1 : 0, key]);
    });
    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", `todays_markings_${today}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  const [pointSystem, setPointSystem] = useState(defaultSystem);
  
  // Exception management
  const [exceptionUser, setExceptionUser] = useState("");
  const [exceptionFrom, setExceptionFrom] = useState("");
  const [exceptionTo, setExceptionTo] = useState("");
  
  // New features state
  const [suggestions, setSuggestions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [newNotification, setNewNotification] = useState("");
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showSuggestionsHistory, setShowSuggestionsHistory] = useState(false);
  const [showNotificationSender, setShowNotificationSender] = useState(false);
  const [menuData, setMenuData] = useState({});
  const [showMealEditor, setShowMealEditor] = useState(false);
  const [selectedWeekday, setSelectedWeekday] = useState("");
  const [selectedMeal, setSelectedMeal] = useState("");
  const [mealItem, setMealItem] = useState("");

  // Fees management state
  const [showFeesManager, setShowFeesManager] = useState(false);
  const [selectedFeeUserId, setSelectedFeeUserId] = useState("");
  const [feeMonth, setFeeMonth] = useState(new Date().getMonth() + 1);
  const [feeYear, setFeeYear] = useState(new Date().getFullYear());
  const [feeAmount, setFeeAmount] = useState("");
  const [feePaid, setFeePaid] = useState("");
  const [showTransactions, setShowTransactions] = useState(false);
  const [txUserId, setTxUserId] = useState("");

  // Mess Bunch details state
  const [showBunchEditor, setShowBunchEditor] = useState(false);
  const [bunchDetails, setBunchDetails] = useState({
    cmd: "",
    acmd: "",
    juniorAcmd: "",
    artsSports: "",
    libraryCoordinator: ""
  });
  
  const todayStr = new Date().toISOString().split("T")[0];
  const currentKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

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
          const userMeals = user.meals || {};
          nextDays.forEach((day) => {
            const meals = userMeals[day];
            if (meals) {
              // Count only explicit markings
              ["breakfast", "lunch", "supper"].forEach((meal) => {
                if (meals[meal]) counts[day][meal] += 1;
              });
            }
          });
        });

        setMealCounts(counts);
      };

      recalculateMealCounts();
    }
  }, [allUsers, monthlyUsers]);

  // Load admin data
  useEffect(() => {
    const loadAdminData = async () => {
      try {
        // Load point system settings
        const settingsRef = doc(db, "settings", "points");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          setPointSystem(settingsSnap.data());
        } else {
          await setDoc(settingsRef, defaultSystem);
        }

        // Load users
        const usersRef = collection(db, "users");
        const querySnapshot = await getDocs(usersRef);
        const users = [];
        querySnapshot.forEach((docSnap) => {
          users.push({ id: docSnap.id, ...docSnap.data() });
        });
        setAllUsers(users);

        // Initialize empty meal counts - will be calculated by useEffect
        setMealCounts({});

        // Load monthly users
        const monthlyRef = doc(db, "monthlyUsers", currentKey);
        const monthlySnap = await getDoc(monthlyRef);
        if (monthlySnap.exists()) {
          setMonthlyUsers(monthlySnap.data().users || []);
        }

        // Load exceptions
        const exceptionsRef = doc(db, "monthlyExceptions", currentKey);
        const exceptionsSnap = await getDoc(exceptionsRef);
        if (exceptionsSnap.exists()) {
          setExceptions(exceptionsSnap.data().exceptions || []);
        }

      } catch (err) {
        console.error("Admin data error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadAdminData();
  }, [currentMonth, currentYear, currentKey]);

  // Update user status
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

      setAllUsers((prev) =>
        prev.map((u) => (u.email === email ? { ...u, status: newStatus } : u))
      );

      alert(`✅ User ${email} marked as ${newStatus}`);
    } catch (err) {
      console.error("Error updating status:", err);
      alert("⚠️ Error updating user status. See console.");
    }
  };

  // Toggle user for current month
  const toggleUserForMonth = async (email) => {
    try {
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

  // Exception management
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
      if (!monthlyUsers.includes(exceptionUser)) {
        alert("⚠️ Add the user to Monthly Users before creating an exception for them.");
        return;
      }
      const newEx = { email: exceptionUser, from: exceptionFrom, to: exceptionTo };

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

  // Helper functions
  const buildDaysArray = (from, to) => {
    const arr = [];
    const s = new Date(from);
    const e = new Date(to);
    for (let d = new Date(s.getTime()); d.getTime() <= e.getTime(); d.setDate(d.getDate() + 1)) {
      arr.push(d.toISOString().split("T")[0]);
    }
    return arr;
  };

  const getAllowedDaysSet = (userEmail, reportFrom, reportTo) => {
    const userEx = exceptions.filter((ex) => ex.email === userEmail);
    if (!userEx || userEx.length === 0) return null;
    const allowed = new Set();
    userEx.forEach((ex) => {
      const start = new Date(ex.from) > new Date(reportFrom) ? new Date(ex.from) : new Date(reportFrom);
      const end = new Date(ex.to) < new Date(reportTo) ? new Date(ex.to) : new Date(reportTo);
      if (start.getTime() > end.getTime()) return;
      for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
        allowed.add(d.toISOString().split("T")[0]);
      }
    });
    return allowed;
  };

  // Generate report
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
      if (!monthlyUsers.includes(user.email)) return;

      const email = user.email || "Unknown";
      const displayName = user.name || email;
      const userMeals = user.meals || {};
      let totalPoints = 0;
      const userMarkings = {};

      const mealDates = Object.keys(userMeals).sort();
      const firstMealDate = mealDates.length > 0 ? mealDates[0] : todayStr;

      const allowedSet = getAllowedDaysSet(email, from, to);

      days.forEach((day) => {
        if (allowedSet && !allowedSet.has(day)) {
          userMarkings[day] = "0";
          return;
        }

        let meals = userMeals[day];
        if (!meals) {
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

  // Export CSV
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

  // Download monthly users CSV
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

  // Delete user function (both Firestore and Auth)
  const deleteUserAccount = async (userId, userEmail) => {
    try {
      // Delete from Firestore
      await deleteDoc(doc(db, "users", userId));
      
      // Update local state
      setAllUsers(prev => prev.filter(user => user.id !== userId));
      
      alert(`✅ User ${userEmail} deleted successfully`);
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("⚠️ Error deleting user. See console for details.");
    }
  };

  // Send notification to all users
  const sendNotification = async () => {
    if (!newNotification.trim()) {
      alert("⚠️ Please enter a notification message");
      return;
    }

    try {
      const notification = {
        message: newNotification,
        timestamp: new Date(),
        // Set TTL: 7 days from now. Enable Firestore TTL on `expiresAt` in console to auto-delete.
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        type: "admin_alert"
      };

      // Add to notifications collection
      await addDoc(collection(db, "notifications"), notification);
      
      setNewNotification("");
      alert("✅ Notification sent to all users");
    } catch (error) {
      console.error("Error sending notification:", error);
      alert("⚠️ Error sending notification");
    }
  };

  const deleteNotificationById = async (id) => {
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (e) {
      console.error("deleteNotification error", e);
      alert("⚠️ Failed to delete notification");
    }
  };

  const fmt = (d) => {
    try {
      const dt = (d?.toDate?.() || d);
      return new Date(dt).toLocaleString();
    } catch {
      return "";
    }
  };

  // Load suggestions
  useEffect(() => {
    const loadSuggestions = () => {
      const suggestionsRef = collection(db, "suggestions");
      const q = query(suggestionsRef, orderBy("timestamp", "desc"));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const suggestionsData = [];
        snapshot.forEach((doc) => {
          suggestionsData.push({ id: doc.id, ...doc.data() });
        });
        setSuggestions(suggestionsData);
      });

      return unsubscribe;
    };

    const unsubscribe = loadSuggestions();
    return () => unsubscribe();
  }, []);

  // Load notifications with live updates
  useEffect(() => {
    const notificationsRef = collection(db, "notifications");
    const qn = query(notificationsRef, orderBy("timestamp", "desc"));
    const unsub = onSnapshot(qn, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setNotifications(list);
    });
    return () => unsub();
  }, []);

  // Removed 'mark all notifications read' per requirement

  // Load menu data (weekday-based)
  useEffect(() => {
    const loadMenuData = async () => {
      try {
        const menuRef = doc(db, "weekdayMenu", "default");
        const menuSnap = await getDoc(menuRef);
        
        if (menuSnap.exists()) {
          setMenuData(menuSnap.data());
        }
      } catch (error) {
        console.error("Error loading menu data:", error);
      }
    };

    loadMenuData();
  }, [currentKey]);

  // Save meal item (weekday-based)
  const saveMealItem = async () => {
    if (!selectedWeekday || !selectedMeal || !mealItem.trim()) {
      alert("Please fill all fields");
      return;
    }

    try {
      const menuRef = doc(db, "weekdayMenu", "default");
      const updatedMenu = {
        ...menuData,
        [selectedWeekday]: {
          ...(menuData[selectedWeekday] || {}),
          [selectedMeal]: mealItem
        }
      };

      await setDoc(menuRef, updatedMenu, { merge: true });
      setMenuData(updatedMenu);
      setShowMealEditor(false);
      setSelectedWeekday("");
      setSelectedMeal("");
      setMealItem("");
      alert("✅ Meal item saved successfully!");
    } catch (error) {
      console.error("Error saving meal item:", error);
      alert("❌ Error saving meal item");
    }
  };

  // Save monthly fee for a user and update pending total
  const saveMonthlyFee = async () => {
    try {
      if (!selectedFeeUserId || !feeAmount) {
        alert("⚠️ Select a user and enter fee amount");
        return;
      }
      const monthKey = `${feeYear}-${String(feeMonth).padStart(2, "0")}`;
      const feesRef = doc(db, "fees", selectedFeeUserId);
      const feesSnap = await getDoc(feesRef);
      const existing = feesSnap.exists() ? feesSnap.data() : {};
      const months = existing.months || {};
      const paidNum = Number(feePaid || 0);
      const feeNum = Number(feeAmount || 0);
      const updatedMonths = {
        ...months,
        [monthKey]: {
          fee: feeNum,
          paid: paidNum,
          pending: Math.max(feeNum - paidNum, 0)
        }
      };
      // Pending rule: previous pending + current month due
      const oldCurrentPending = Math.max(((months[monthKey]?.fee || 0) - (months[monthKey]?.paid || 0)), 0);
      const previousPending = Math.max((existing.pendingTotal || 0) - oldCurrentPending, 0);
      const pendingTotal = previousPending + Math.max(feeNum - paidNum, 0);
      await setDoc(feesRef, { months: updatedMonths, pendingTotal }, { merge: true });
      alert("✅ Fee saved and pending updated");
      setFeeAmount("");
      setFeePaid("");
    } catch (err) {
      console.error("Error saving fee:", err);
      alert("❌ Error saving fee");
    }
  };

  // Save Mess Bunch details
  const saveBunchDetails = async () => {
    try {
      await setDoc(doc(db, "messBunch", "contacts"), bunchDetails, { merge: true });
      alert("✅ Mess Bunch details saved");
      setShowBunchEditor(false);
    } catch (err) {
      console.error("Error saving bunch details:", err);
      alert("❌ Error saving details");
    }
  };

  // Get statistics
  const getStats = () => {
    const pendingUsers = allUsers.filter(u => u.status === "pending").length;
    const approvedUsers = allUsers.filter(u => u.status === "approved").length;
    // Total users should count only approved users as requested
    const totalUsers = approvedUsers;
    const todayMeals = mealCounts[new Date().toISOString().split("T")[0]] || { breakfast: 0, lunch: 0, supper: 0 };
    
    return {
      pendingUsers,
      approvedUsers,
      totalUsers,
      todayMeals: todayMeals,
      totalTodayMeals: todayMeals.breakfast + todayMeals.lunch + todayMeals.supper
    };
  };

  if (loading) {
    return (
      <div className="modern-admin-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading admin data...</p>
        </div>
      </div>
    );
  }

  const stats = getStats();

  return (
    <div className="modern-admin-container">
      {/* Main Content Area */}
      <div className="main-content">
        {activeTab !== "home" && (
          <div className="back-bar">
            <button className="back-to-home-btn" onClick={() => setActiveTab("home")}>
              ← Back to Dashboard
            </button>
          </div>
        )}

      {/* Transaction History Modal */}
      {showTransactions && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Transaction History</h2>
              <button className="close-btn" onClick={() => setShowTransactions(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="meal-editor-form">
                <div className="form-group">
                  <label>Select User:</label>
                  <select className="form-select" value={txUserId} onChange={(e) => setTxUserId(e.target.value)}>
                    <option value="">-- Choose user --</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name || u.email}</option>
                    ))}
                  </select>
                </div>
              </div>

              {txUserId && (
                <TxHistory userId={txUserId} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inline component for fees history */}
      {(() => {
        function TxHistory({ userId }) {
          const [data, setData] = React.useState(null);
          React.useEffect(() => {
            const load = async () => {
              const ref = doc(db, "fees", userId);
              const snap = await getDoc(ref);
              setData(snap.exists() ? snap.data() : { months: {}, pendingTotal: 0 });
            };
            load();
          }, [userId]);
          const months = Object.entries(data?.months || {}).sort(([a],[b]) => a.localeCompare(b));
          return (
            <div className="generated-report">
              <h4>All Transactions</h4>
              <div className="report-table">
                <div className="report-header"><span>Month</span><span>Fee</span><span>Paid</span><span>Pending</span></div>
                {months.map(([k,v]) => (
                  <div key={k} className="report-row"><span>{k}</span><span>₹{v.fee||0}</span><span>₹{v.paid||0}</span><span>₹{Math.max((v.fee||0)-(v.paid||0),0)}</span></div>
                ))}
              </div>
              <div className="report-actions">
                <button className="export-btn" onClick={() => {
                  const rows = [["Month","Fee","Paid","Pending"], ...months.map(([k,v]) => [k, v.fee||0, v.paid||0, Math.max((v.fee||0)-(v.paid||0),0)])];
                  const csv = rows.map(r=>r.join(",")).join("\n");
                  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
                  const url = URL.createObjectURL(blob);
                  const a=document.createElement('a');
                  a.href=url; a.setAttribute('download', 'transaction_history_'+userId+'.csv');
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                }}>⬇️ Export CSV</button>
                <div style={{marginLeft:'auto', fontWeight:600}}>Pending Total: ₹{data?.pendingTotal||0}</div>
              </div>
            </div>
          );
        }
        return null;
      })()}
        {activeTab === "home" && (
          <div className="tab-content">
            <div className="welcome-section">
              <h1 className="app-title">Admin Dashboard</h1>
              <p className="welcome-subtitle">Manage your mess system efficiently</p>
            </div>

            {/* Today's Meal Count Highlight (moved to top) */}
            <div className="meal-count-highlight">
              <h3>🍽️ Today's Meal Count</h3>
              <div className="meal-count-grid">
                <div className="meal-count-item breakfast">
                  <div className="meal-icon">🍳</div>
                  <div className="meal-info">
                    <span className="meal-name">Breakfast</span>
                    <span className="meal-count">{stats.todayMeals.breakfast || 0}</span>
                  </div>
                </div>
                <div className="meal-count-item lunch">
                  <div className="meal-icon">🥗</div>
                  <div className="meal-info">
                    <span className="meal-name">Lunch</span>
                    <span className="meal-count">{stats.todayMeals.lunch || 0}</span>
                  </div>
                </div>
                <div className="meal-count-item supper">
                  <div className="meal-icon">🍛</div>
                  <div className="meal-info">
                    <span className="meal-name">Supper</span>
                    <span className="meal-count">{stats.todayMeals.supper || 0}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
              <div className="stat-card clickable" onClick={() => setShowAllUsers(true)}>
                <div className="stat-icon">👥</div>
                <div className="stat-info">
                  <h3>{stats.totalUsers}</h3>
                  <p>Total Users</p>
                </div>
              </div>
              
              <div className="stat-card clickable" onClick={() => setShowRequests(true)}>
                <div className="stat-icon">✅</div>
                <div className="stat-info">
                  <h3>{stats.pendingUsers}</h3>
                  <p>Approve Requests</p>
                </div>
              </div>
              
              <div className="stat-card clickable" onClick={() => setShowSuggestions(true)}>
                <div className="stat-icon">💡</div>
                <div className="stat-info">
                  <h3>View</h3>
                  <p>Suggestions</p>
                </div>
              </div>

              <div className="stat-card clickable" onClick={() => setActiveTab("reports")}>
                <div className="stat-icon">📊</div>
                <div className="stat-info">
                  <h3>Open</h3>
                  <p>Reports</p>
                </div>
              </div>

              <div className="stat-card clickable" onClick={() => setShowTransactions(true)}>
                <div className="stat-icon">💳</div>
                <div className="stat-info">
                  <h3>View</h3>
                  <p>Transaction History</p>
                </div>
              </div>
              
              <div className="stat-card clickable" onClick={() => setShowNotificationSender(true)}>
                <div className="stat-icon">📢</div>
                <div className="stat-info">
                  <h3>Send</h3>
                  <p>Notification</p>
                </div>
              </div>
              
              <div className="stat-card clickable" onClick={() => setShowMealEditor(true)}>
                <div className="stat-icon">🍽️</div>
                <div className="stat-info">
                  <h3>Edit</h3>
                  <p>Meal Menu</p>
                </div>
              </div>

              <div className="stat-card clickable" onClick={() => setShowFeesManager(true)}>
                <div className="stat-icon">💰</div>
                <div className="stat-info">
                  <h3>Fees</h3>
                  <p>Manage Monthly</p>
                </div>
              </div>

              <div className="stat-card clickable" onClick={() => setShowBunchEditor(true)}>
                <div className="stat-icon">👥</div>
                <div className="stat-info">
                  <h3>MEA</h3>
                  <p>Mess Bunch</p>
                </div>
              </div>
            </div>

            

            {/* Quick Actions */}
            <div className="quick-actions">
              <h3>Quick Actions</h3>
              <div className="action-grid">
                <button className="action-btn" onClick={() => setActiveTab("users")}>
                  <span className="action-icon">👥</span>
                  Manage Users
                </button>
                
                <button className="action-btn" onClick={() => setActiveTab("reports")}>
                  <span className="action-icon">📊</span>
                  View Reports
                </button>
                
                <button className="action-btn" onClick={goToPointSystem}>
                  <span className="action-icon">⚙️</span>
                  Point System
                </button>
                
                <button className="action-btn" onClick={() => setActiveTab("settings")}>
                  <span className="action-icon">🔧</span>
                  Settings
                </button>
              </div>
            </div>

          </div>
        )}

        {activeTab === "users" && (
          <div className="tab-content">
            <div className="section-header">
              <h2>User Management</h2>
              <p>Approve, reject, and manage student accounts</p>
            </div>

            {/* Pending Users */}
            <div className="users-section">
              <h3>Pending Approvals ({stats.pendingUsers})</h3>
              <div className="users-list">
                {allUsers.filter(u => u.status === "pending").map((user) => (
                  <div key={user.id} className="user-card">
                    <div className="user-info">
                      <div className="user-avatar">
                        {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="user-details">
                        <h4>{user.name || 'Unknown'}</h4>
                        <p>{user.email}</p>
                        <p>{user.department || user.branch} • {user.year}</p>
                      </div>
                    </div>
                    <div className="user-actions">
                      <button 
                        className="approve-btn"
                        onClick={() => updateUserStatus(user.email, "approved")}
                      >
                        ✅ Approve
                      </button>
                      <button
                        className="reject-btn"
                        onClick={() => updateUserStatus(user.email, "rejected")}
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                ))}
                {allUsers.filter(u => u.status === "pending").length === 0 && (
                  <p className="no-pending">No pending requests</p>
                )}
              </div>
            </div>

            {/* Monthly Users */}
            <div className="users-section">
              <div className="monthly-users-header">
                <h3>Monthly Users ({monthlyUsers.length})</h3>
                <div className="month-selector">
                  <label>Select Month:</label>
                  <select 
                    value={currentMonth} 
                    onChange={(e) => setCurrentMonth(Number(e.target.value))}
                    className="month-select"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(0, i).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                  <select 
                    value={currentYear} 
                    onChange={(e) => setCurrentYear(Number(e.target.value))}
                    className="year-select"
                  >
                    {Array.from({ length: 10 }, (_, i) => (
                      <option key={2020 + i} value={2020 + i}>
                        {2020 + i}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="users-list">
                {allUsers.filter(u => u.status === "approved").map((user) => (
                  <div key={user.id} className="user-card">
                    <div className="user-info">
                      <div className="user-avatar">
                        {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="user-details">
                        <h4>{user.name || 'Unknown'}</h4>
                        <p>{user.email}</p>
                      </div>
                    </div>
                    <div className="user-actions">
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={monthlyUsers.includes(user.email)}
                          onChange={() => toggleUserForMonth(user.email)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "reports" && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Reports & Analytics</h2>
              <p>Generate points for <strong>monthly users only</strong>, and export CSVs</p>
            </div>

            {/* Report Generation */}
            <div className="reports-section">
              <h3>Generate Points Report</h3>
              <div className="report-filters">
                <div className="filter-group">
                  <label>Month:</label>
                  <select value={currentMonth} onChange={(e) => setCurrentMonth(Number(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(0, i).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>Year:</label>
                  <select value={currentYear} onChange={(e) => setCurrentYear(Number(e.target.value))}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <option key={2020 + i} value={2020 + i}>
                        {2020 + i}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filter-group">
                  <label>From Day:</label>
                  <select value={fromDay} onChange={(e) => setFromDay(Number(e.target.value))}>
                    {Array.from({ length: new Date(currentYear, currentMonth, 0).getDate() }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>

                <div className="filter-group">
                  <label>To Day:</label>
                  <select value={toDay} onChange={(e) => setToDay(Number(e.target.value))}>
                    {Array.from({ length: new Date(currentYear, currentMonth, 0).getDate() }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>

                <button 
                  className="generate-btn"
                  onClick={() => {
                    let fDay = fromDay;
                    let tDay = toDay;
                    if (fromDay > toDay) {
                      fDay = toDay;
                      tDay = fromDay;
                      setFromDay(fDay);
                      setToDay(tDay);
                    }
                    const f = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(fDay).padStart(2, "0")}`;
                    const t = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(tDay).padStart(2, "0")}`;
                    generateReport(f, t);
                  }}
                >
                  Generate Report
                </button>
              </div>

              <div className="reports-actions">
                <button className="report-btn" onClick={exportCSV}>
                  <span className="btn-icon">⬇️</span>
                  Export Points CSV (Monthly Only)
                </button>
                <button className="report-btn" onClick={exportTodaysMarkingsCSV}>
                  <span className="btn-icon">📅</span>
                  Download Today's Markings (CSV)
                </button>
                <button className="report-btn" onClick={downloadMonthlyUsers}>
                  <span className="btn-icon">👥</span>
                  Download This Month's Users
                </button>
              </div>

              {/* Exception Management */}
              <div className="exception-section">
                <h4>Exception Ranges</h4>
                <div className="exception-controls">
                  <select value={exceptionUser} onChange={(e) => setExceptionUser(e.target.value)}>
                    <option value="">-- Select Monthly User --</option>
                    {allUsers.filter(u => monthlyUsers.includes(u.email)).map(u => (
                      <option key={u.email} value={u.email}>{u.name || u.email}</option>
                    ))}
                  </select>
                  <input type="date" value={exceptionFrom} onChange={(e) => setExceptionFrom(e.target.value)} />
                  <input type="date" value={exceptionTo} onChange={(e) => setExceptionTo(e.target.value)} />
                  <button onClick={addException}>Add Exception</button>
                </div>
                {exceptions.length > 0 && (
                  <div className="exceptions-list">
                    {exceptions.map((ex, i) => (
                      <div key={i} className="exception-item">
                        <span><strong>{ex.email}</strong> — {ex.from} → {ex.to}</span>
                        <button onClick={() => removeException(i)}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Generated Report */}
              {generated && (
                <div className="generated-report">
                  <h4>Generated Report</h4>
                  <div className="report-table">
                    <div className="report-header">
                      <span>Name</span>
                      <span>Total Points</span>
                    </div>
                    {Object.entries(userPoints).map(([name, points]) => (
                      <div key={name} className="report-row">
                        <span>{name}</span>
                        <span>{points}</span>
                      </div>
                    ))}
                  </div>
                  <div className="report-actions">
                    <button className="export-btn" onClick={exportCSV}>
                      📊 Export CSV
                    </button>
                    <button className="export-btn" onClick={downloadMonthlyUsers}>
                      👥 Download Monthly Users
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Meal Counts Table */}
            <div className="reports-section">
              <h3>Upcoming Meal Counts</h3>
              <div className="meal-counts-table">
                {Object.entries(mealCounts).map(([date, meals]) => (
                  <div key={date} className="meal-count-row">
                    <div className="date-info">
                      <span className="date">{new Date(date).toLocaleDateString()}</span>
                      <span className="day">{new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    </div>
                    <div className="meal-counts">
                      <span className="count">B: {meals.breakfast}</span>
                      <span className="count">L: {meals.lunch}</span>
                      <span className="count">S: {meals.supper}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Settings</h2>
              <p>Configure system settings and preferences</p>
            </div>

            <div className="settings-section">
              <div className="setting-item">
                <h4>Month & Year</h4>
                <div className="setting-controls">
                  <select 
                    value={currentMonth} 
                    onChange={(e) => setCurrentMonth(Number(e.target.value))}
                    className="setting-select"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(0, i).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                  <select 
                    value={currentYear} 
                    onChange={(e) => setCurrentYear(Number(e.target.value))}
                    className="setting-select"
                  >
                    {Array.from({ length: 10 }, (_, i) => (
                      <option key={2020 + i} value={2020 + i}>
                        {2020 + i}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="setting-item">
                <h4>System Actions</h4>
                <div className="setting-actions">
                  <button className="setting-btn">
                    <span className="btn-icon">🔄</span>
                    Refresh Data
                  </button>
                  <button className="setting-btn">
                    <span className="btn-icon">💾</span>
                    Backup Data
                  </button>
                </div>
              </div>
              
              <div className="setting-item">
                <h4>Account</h4>
                <div className="setting-actions">
                  <button className="logout-btn" onClick={onLogout}>
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fixed Bottom Navigation */}
      <div className="bottom-nav">
        <button
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Home</span>
        </button>
        
        <button
          className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <span className="nav-icon">👥</span>
          <span className="nav-label">Users</span>
        </button>
        
        <button
          className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <span className="nav-icon">📊</span>
          <span className="nav-label">Reports</span>
        </button>
        
        <button
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">Settings</span>
        </button>
      </div>

      {/* All Users Modal */}
      {showAllUsers && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>All Users</h2>
              <button className="close-btn" onClick={() => setShowAllUsers(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="users-list">
                {allUsers.map((user) => (
                  <div key={user.id || user.email} className="user-card">
                    <div className="user-info">
                      <div className="user-avatar">
                        {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="user-details">
                        <h4>{user.name || 'Unknown'}</h4>
                        <p>{user.email}</p>
                        <span className={`status-badge ${user.status || 'pending'}`}>
                          {user.status || 'pending'}
                        </span>
                      </div>
                    </div>
                    <div className="user-actions">
                      <button 
                        className="delete-btn"
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete ${user.email}?`)) {
                            deleteUserAccount(user.id || user.email, user.email);
                          }
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Requests (Pending Approvals) Modal */}
      {showRequests && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Approve Requests</h2>
              <button className="close-btn" onClick={() => setShowRequests(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="users-list">
                {allUsers.filter(u => (u.status || 'pending') === 'pending').map((user) => (
                  <div key={user.id || user.email} className="user-card">
                    <div className="user-info">
                      <div className="user-avatar">
                        {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="user-details">
                        <h4>{user.name || 'Unknown'}</h4>
                        <p>{user.email}</p>
                        {(user.department || user.branch || user.year) && (
                          <p>{user.department || user.branch} {user.year ? `• ${user.year}` : ''}</p>
                        )}
                        <span className={`status-badge ${user.status || 'pending'}`}>
                          {user.status || 'pending'}
                        </span>
                      </div>
                    </div>
                    <div className="user-actions">
                      <button
                        className="approve-btn"
                        onClick={() => updateUserStatus(user.email, 'approved')}
                      >
                        ✅ Approve
                      </button>
                      <button
                        className="reject-btn"
                        onClick={() => updateUserStatus(user.email, 'rejected')}
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                ))}
                {allUsers.filter(u => (u.status || 'pending') === 'pending').length === 0 && (
                  <div className="no-requests">No pending requests</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      

      {/* Suggestions Modal - Unread only */}
      {showSuggestions && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>User Suggestions</h2>
              <button className="close-btn" onClick={() => setShowSuggestions(false)}>×</button>
            </div>
            <div className="modal-body">
              {(() => {
                const unread = suggestions.filter((s) => !s.read);
                const markSuggestionRead = async (id) => {
                  try {
                    await updateDoc(doc(db, "suggestions", id), { read: true, readAt: new Date() });
                  } catch (e) {
                    console.error("markSuggestionRead error", e);
                    alert("⚠️ Failed to mark as read");
                  }
                };
                return (
                  <div>
                    <h3 style={{margin: 0, marginBottom: 8}}>Unread</h3>
                    <div className="suggestions-list">
                      {unread.map((s) => (
                        <div key={s.id} className="suggestion-card">
                          <div className="suggestion-header">
                            <h4>{s.userName || 'Anonymous'}</h4>
                            <span className="suggestion-time">{new Date((s.timestamp?.toDate?.() || s.timestamp)).toLocaleString()}</span>
                          </div>
                          <p className="suggestion-text">{s.suggestion}</p>
                          <div style={{display:'flex', justifyContent:'flex-end'}}>
                            <button className="approve-btn" onClick={() => markSuggestionRead(s.id)}>Mark as read</button>
                          </div>
                        </div>
                      ))}
                      {unread.length === 0 && (<p className="no-suggestions">No unread suggestions</p>)}
                    </div>
                    <div style={{marginTop: 16, display:'flex', gap: 8}}>
                      <button className="report-btn" onClick={() => setShowSuggestionsHistory(true)}>History</button>
                      <button className="cancel-btn" onClick={() => { setShowSuggestions(false); setActiveTab('home'); }}>Back to Dashboard</button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Suggestions History Modal - Read items with delete */}
      {showSuggestionsHistory && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Suggestions History</h2>
              <button className="close-btn" onClick={() => setShowSuggestionsHistory(false)}>×</button>
            </div>
            <div className="modal-body">
              {(() => {
                const read = suggestions.filter((s) => !!s.read);
                const deleteSuggestionById = async (id) => {
                  try {
                    await deleteDoc(doc(db, "suggestions", id));
                  } catch (e) {
                    console.error("deleteSuggestion error", e);
                    alert("⚠️ Failed to delete suggestion");
                  }
                };
                return (
                  <div className="suggestions-list">
                    {read.map((s) => (
                      <div key={s.id} className="suggestion-card read" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <div>
                          <div className="suggestion-header">
                            <h4>{s.userName || 'Anonymous'}</h4>
                            <span className="suggestion-time">{new Date((s.timestamp?.toDate?.() || s.timestamp)).toLocaleString()}</span>
                          </div>
                          <p className="suggestion-text">{s.suggestion}</p>
                        </div>
                        <button className="export-btn" onClick={() => deleteSuggestionById(s.id)}>🗑️ Delete</button>
                      </div>
                    ))}
                    {read.length === 0 && (<p className="no-suggestions">No read suggestions</p>)}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Notification Sender Modal */}
      {showNotificationSender && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Send Notification</h2>
              <button className="close-btn" onClick={() => setShowNotificationSender(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="notification-form">
                <textarea
                  value={newNotification}
                  onChange={(e) => setNewNotification(e.target.value)}
                  placeholder="Enter your notification message..."
                  className="notification-input"
                  rows="4"
                />
                <button 
                  className="send-notification-btn"
                  onClick={sendNotification}
                >
                  📢 Send to All Users
                </button>
              </div>

              {/* Existing Notifications with Delete */}
              <div className="notifications-list" style={{ marginTop: 16 }}>
                {notifications.map((n) => (
                  <div key={n.id} className="notification-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className="notification-message">{n.message}</div>
                      <small style={{ color: '#cbd5e1' }}>Created: {fmt(n.timestamp)}{n.expiresAt ? ` • Expires: ${fmt(n.expiresAt)}` : ''}</small>
                    </div>
                    <button className="export-btn" onClick={() => deleteNotificationById(n.id)}>🗑️ Delete</button>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <div className="no-requests" style={{ marginTop: 8 }}>No notifications yet</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meal Editor Modal (Weekday-based) */}
      {showMealEditor && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Edit Weekday Menu</h2>
              <button className="close-btn" onClick={() => setShowMealEditor(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="meal-editor-form">
                <div className="form-group">
                  <label>Select Weekday:</label>
                  <select
                    value={selectedWeekday}
                    onChange={(e) => setSelectedWeekday(e.target.value)}
                    className="form-select"
                  >
                    <option value="">Choose weekday</option>
                    {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Select Meal:</label>
                  <select
                    value={selectedMeal}
                    onChange={(e) => setSelectedMeal(e.target.value)}
                    className="form-select"
                  >
                    <option value="">Choose meal type</option>
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="supper">Supper</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Meal Item:</label>
                  <input
                    type="text"
                    value={mealItem}
                    onChange={(e) => setMealItem(e.target.value)}
                    placeholder="Enter meal item (e.g., Rice, Dal, Chicken Curry)"
                    className="form-input"
                  />
                </div>
                
                <button 
                  className="save-meal-btn"
                  onClick={saveMealItem}
                >
                  💾 Save Meal Item
                </button>
              </div>
              
              {/* Current Menu Display */}
              <div className="current-menu">
                <h4>Current Menu for {selectedWeekday || 'Select a weekday'}</h4>
                {selectedWeekday && (
                  <div className="menu-items">
                    {['breakfast', 'lunch', 'supper'].map((meal) => (
                      <div key={meal} className="menu-item">
                        <span className="meal-type">{meal.charAt(0).toUpperCase() + meal.slice(1)}:</span>
                        <span className="meal-content">
                          {menuData[selectedWeekday]?.[meal] || "Not added yet"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fees Manager Modal */}
      {showFeesManager && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Manage Monthly Fees</h2>
              <button className="close-btn" onClick={() => setShowFeesManager(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="meal-editor-form">
                <div className="form-group">
                  <label>Select User:</label>
                  <select className="form-select" value={selectedFeeUserId} onChange={(e) => setSelectedFeeUserId(e.target.value)}>
                    <option value="">-- Choose user --</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name || u.email}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Month/Year:</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <select className="form-select" value={feeMonth} onChange={(e) => setFeeMonth(Number(e.target.value))}>
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </select>
                    <select className="form-select" value={feeYear} onChange={(e) => setFeeYear(Number(e.target.value))}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <option key={currentYear - 2 + i} value={currentYear - 2 + i}>{currentYear - 2 + i}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Fee Amount (₹):</label>
                  <input className="form-input" type="number" min="0" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Amount Paid (₹):</label>
                  <input className="form-input" type="number" min="0" value={feePaid} onChange={(e) => setFeePaid(e.target.value)} />
                </div>
                <button className="save-meal-btn" onClick={saveMonthlyFee}>💾 Save Fee</button>
              </div>
              <p style={{ marginTop: 12, color: '#a0a0a0' }}>Pending total is calculated as the sum of (fee - paid) for each month.</p>
            </div>
          </div>
        </div>
      )}

      {/* Mess Bunch Editor Modal */}
      {showBunchEditor && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>MEA Mess Bunch Details</h2>
              <button className="close-btn" onClick={() => setShowBunchEditor(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="meal-editor-form">
                {[
                  { key: 'cmd', label: 'CMD (Chief Mess Director)' },
                  { key: 'acmd', label: 'ACMD (Assistant CMD)' },
                  { key: 'juniorAcmd', label: 'Junior ACMD' },
                  { key: 'artsSports', label: 'Arts & Sports Secretary' },
                  { key: 'libraryCoordinator', label: 'Library Coordinator' },
                ].map((f) => (
                  <div className="form-group" key={f.key}>
                    <label>{f.label}</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Name and phone (optional)"
                      value={bunchDetails[f.key]}
                      onChange={(e) => setBunchDetails((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <button className="save-meal-btn" onClick={saveBunchDetails}>💾 Save Details</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModernAdminPage;
