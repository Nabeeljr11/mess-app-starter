import React, { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import UserProfilePage from "./UserProfilePage";
import "./ModernStudentPage.css";

function ModernStudentPage({ currentUser, onLogout }) {
  const [activeTab, setActiveTab] = useState("home");
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [meals, setMeals] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [serverEffectiveDate, setServerEffectiveDate] = useState(null); // YYYY-MM-DD from server
  const [serverNowISO, setServerNowISO] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [showSuggestionForm, setShowSuggestionForm] = useState(false);
  const [notifications, setNotifications] = useState([]);
  // Current month bill is derived from fees data
  const [menuData, setMenuData] = useState({});
  const [mealTimes, setMealTimes] = useState({
    breakfast: "7:00 AM - 9:00 AM",
    lunch: "12:00 PM - 2:00 PM",
    supper: "7:00 PM - 9:00 PM",
  });
  const [feesData, setFeesData] = useState({ months: {}, pendingTotal: 0 });
  const [bunchDetails, setBunchDetails] = useState(null);
  // History tab state
  const [historySelectedMonth, setHistorySelectedMonth] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  );
  const [historyMeals, setHistoryMeals] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch trusted server time once
  useEffect(() => {
    const fetchServerNow = async () => {
      try {
        const functions = getFunctions();
        const getServerNow = httpsCallable(functions, "getServerNow");
        const res = await getServerNow();
        const { serverTime, effectiveDate } = res.data || {};
        setServerNowISO(serverTime);
        setServerEffectiveDate(effectiveDate); // YYYY-MM-DD in Asia/Kolkata
      } catch (e) {
        console.error("Failed to fetch server time, falling back to device time", e);
        const fallback = new Date().toISOString().split("T")[0];
        setServerEffectiveDate(fallback);
        setServerNowISO(new Date().toISOString());
      }
    };
    fetchServerNow();
  }, []);

  // Auto-refresh at server midnight (prevents device time tampering)
  useEffect(() => {
    if (!serverEffectiveDate) return;
    let stopped = false;
    const functions = getFunctions();
    const getServerNow = httpsCallable(functions, "getServerNow");

    const checkAndReload = async () => {
      try {
        const res = await getServerNow();
        const nextEffective = res?.data?.effectiveDate;
        if (!stopped && nextEffective && nextEffective !== serverEffectiveDate) {
          // New day started on server (00:00 IST) -> reload app
          window.location.reload();
        }
      } catch (e) {
        // ignore transient failures
      }
    };

    // Check every 60 seconds; light-weight and robust against device time changes
    const id = setInterval(checkAndReload, 60 * 1000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [serverEffectiveDate]);

  // Load user data and meals (wait for serverEffectiveDate)
  useEffect(() => {
    let unsubscribeUser = null;
    const loadUserData = async () => {
      if (!currentUser || !serverEffectiveDate) return;

      try {
        const userRef = doc(db, "users", currentUser.uid);
        unsubscribeUser = onSnapshot(userRef, (snap) => {
          if (snap.exists()) setUserData(snap.data());
        });

        // Load meals for current month
        const mealsRef = doc(
          db,
          "meals",
          `${currentYear}-${String(currentMonth).padStart(2, "0")}`
        );
        const mealsSnap = await getDoc(mealsRef);

        const monthDocExists = mealsSnap.exists();
        const mealsData = monthDocExists ? mealsSnap.data() : {};

        // Build UI-only defaults to guarantee future days are marked for this user
        const today = serverEffectiveDate; // YYYY-MM-DD from server
        const upcomingDays = getUpcomingDays();
        const uiMeals = { ...mealsData };

        upcomingDays.forEach((day) => {
          if (day.date > today) {
            // Always show future dates as marked in the UI
            uiMeals[day.date] = {
              breakfast: true,
              lunch: true,
              supper: true,
            };
          } else if (day.date < today) {
            // Past dates default to unmarked if missing
            if (!uiMeals[day.date]) {
              uiMeals[day.date] = {
                breakfast: false,
                lunch: false,
                supper: false,
              };
            }
          } else {
            // Today defaults to unmarked (and stays locked in UI) if missing
            if (!uiMeals[day.date]) {
              uiMeals[day.date] = {
                breakfast: false,
                lunch: false,
                supper: false,
              };
            }
          }
        });

        setMeals(uiMeals);

        // Persist only when month document did not exist (seed minimal structure)
        if (!monthDocExists) {
          await setDoc(mealsRef, mealsData, { merge: true });
        }

        // Also seed per-user meals in their user document if missing to keep Admin views consistent
        try {
          const userRefNow = doc(db, "users", currentUser.uid);
          const userSnapNow = await getDoc(userRefNow);
          const userMealsExisting = userSnapNow.exists() ? (userSnapNow.data().meals || {}) : {};
          const userMealsSeed = { ...userMealsExisting };
          let hasChange = false;
          upcomingDays.forEach((day) => {
            if (!userMealsSeed[day.date]) {
              if (day.date > today) {
                userMealsSeed[day.date] = { breakfast: true, lunch: true, supper: true, lastUpdated: serverTimestamp() };
              } else if (day.date < today) {
                userMealsSeed[day.date] = { breakfast: false, lunch: false, supper: false, lastUpdated: serverTimestamp() };
              } else {
                userMealsSeed[day.date] = { breakfast: false, lunch: false, supper: false, lastUpdated: serverTimestamp() };
              }
              hasChange = true;
            }
          });
          if (hasChange) {
            await setDoc(userRefNow, { meals: userMealsSeed }, { merge: true });
          }
        } catch (seedingErr) {
          console.warn("User meals seeding skipped:", seedingErr);
        }

        // Load weekday menu data
        const menuRef = doc(db, "weekdayMenu", "default");
        const menuSnap = await getDoc(menuRef);
        if (menuSnap.exists()) setMenuData(menuSnap.data());

        // No separate mess bill; use fees months for current month

        // Load full fees data
        const feesRef = doc(db, "fees", currentUser.uid);
        const feesSnap = await getDoc(feesRef);
        if (feesSnap.exists()) setFeesData(feesSnap.data());

        // Load mess bunch details
        const bunchRef = doc(db, "messBunch", "contacts");
        const bunchSnap = await getDoc(bunchRef);
        if (bunchSnap.exists()) setBunchDetails(bunchSnap.data());
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
    return () => {
      if (unsubscribeUser) unsubscribeUser();
    };
  }, [currentUser, currentMonth, currentYear, serverEffectiveDate]);

  // Load notifications
  useEffect(() => {
    const notificationsRef = collection(db, "notifications");
    const q = query(notificationsRef, orderBy("timestamp", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notificationsData = [];
      snapshot.forEach((doc) => {
        notificationsData.push({ id: doc.id, ...doc.data() });
      });
      setNotifications(notificationsData);
    });

    return () => unsubscribe();
  }, []);

  // Toggle meal selection (uses server-defined today)
  const toggleMeal = async (date, mealType) => {
    if (!currentUser) return;

    const today = serverEffectiveDate || new Date().toISOString().split("T")[0];
    if (date === today) {
      alert("❌ Today's marking is locked!");
      return;
    }

    try {
      const newMeals = { ...meals };

      if (!newMeals[date]) {
        newMeals[date] = { breakfast: true, lunch: true, supper: true };
      }

      newMeals[date][mealType] = !newMeals[date][mealType];

      const mealsRef = doc(
        db,
        "meals",
        `${currentYear}-${String(currentMonth).padStart(2, "0")}`
      );
      await setDoc(mealsRef, newMeals, { merge: true });

      setMeals(newMeals);
    } catch (error) {
      console.error("Error updating meal:", error);
    }
  };

  // ===== Helpers for history tab =====
  const getDaysInMonth = (yyyyMm) => {
    const [y, m] = yyyyMm.split("-").map((v) => parseInt(v, 10));
    const first = new Date(y, m - 1, 1);
    const result = [];
    while (first.getMonth() === m - 1) {
      result.push(first.toISOString().split("T")[0]);
      first.setDate(first.getDate() + 1);
    }
    return result;
  };

  const monthName = (yyyyMm) => {
    const [y, m] = yyyyMm.split("-").map((v) => parseInt(v, 10));
    return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  };

  // Load selected month meals for history tab
  useEffect(() => {
    const loadHistory = async () => {
      const currentKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
      setHistoryLoading(true);
      try {
        if (historySelectedMonth === currentKey) {
          setHistoryMeals(meals || {});
        } else {
          const mealsRef = doc(db, "meals", historySelectedMonth);
          const snap = await getDoc(mealsRef);
          setHistoryMeals(snap.exists() ? snap.data() : {});
        }
      } catch (e) {
        console.error("Failed to load history month:", e);
        setHistoryMeals({});
      } finally {
        setHistoryLoading(false);
      }
    };
    loadHistory();
  }, [historySelectedMonth, meals, currentMonth, currentYear]);

  // Generate upcoming days based on server time
  const getUpcomingDays = () => {
    const days = [];
    const base = serverNowISO ? new Date(serverNowISO) : new Date();

    for (let i = 0; i < 8; i++) {
      const date = new Date(base);
      date.setDate(base.getDate() + i);

      days.push({
        date: date.toISOString().split("T")[0],
        dayName: date.toLocaleDateString("en-US", { weekday: "short" }),
        dayNumber: date.getDate(),
        monthName: date.toLocaleDateString("en-US", { month: "short" }),
      });
    }

    return days;
  };

  // Submit suggestion
  const submitSuggestion = async () => {
    if (!suggestion.trim()) {
      alert("Please enter a suggestion");
      return;
    }

    try {
      await addDoc(collection(db, "suggestions"), {
        suggestion: suggestion,
        userName: userData?.name || currentUser?.email || "Anonymous",
        userEmail: currentUser?.email || "unknown",
        timestamp: serverTimestamp(),
      });

      setSuggestion("");
      setShowSuggestionForm(false);
      alert("✅ Suggestion submitted successfully!");
    } catch (error) {
      console.error("Error submitting suggestion:", error);
      alert("❌ Error submitting suggestion");
    }
  };

  if (loading) {
    return (
      <div className="modern-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (showProfile) {
    return (
      <UserProfilePage
        currentUser={currentUser}
        onLogout={onLogout}
        onBack={() => setShowProfile(false)}
      />
    );
  }

  return (
    <div className="modern-container">
      <div className="main-content">
        {activeTab === "home" && (
          <div className="tab-content">
            <div className="welcome-section">
              <h1 className="app-title">MEA MESS</h1>
              <p className="welcome-subtitle">
                Welcome back, {userData?.name || "Student"}!
              </p>
            </div>

            <div className="profile-card" onClick={() => setShowProfile(true)}>
              <div className="profile-avatar">
                <div className="avatar-circle">
                  {(() => {
                    const photo = userData?.photoURL || currentUser?.photoURL;
                    if (photo) {
                      return <img src={photo} alt="Profile" className="avatar-img" />;
                    }
                    return (userData?.name ? userData.name.charAt(0).toUpperCase() : "U");
                  })()}
                </div>
              </div>
              <div className="profile-info">
                <h3>{userData?.name || "User Name"}</h3>
                <p>{userData?.department || "Department"}</p>
                <button className="profile-btn">View Profile</button>
              </div>
            </div>

            {(() => {
              const monthKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
              const monthData = (feesData?.months || {})[monthKey] || { fee: 0, paid: 0 };
              const thisMonthFee = monthData.fee || 0;
              const thisMonthPending = Math.max((monthData.fee || 0) - (monthData.paid || 0), 0);
              const totalPendingAll = feesData?.pendingTotal || 0;
              const previousPending = Math.max(totalPendingAll - thisMonthPending, 0);
              const totalFee = thisMonthFee + previousPending;
              return (
                <div className="bill-summary">
                  <div className="bill-info">
                    <h3>Current Month Mess Bill</h3>
                    <p className="bill-amount">This Month Fee: ₹{thisMonthFee}</p>
                    <p className="bill-status">Pending Fee: ₹{previousPending}</p>
                    <p className="bill-status">Total Fee: ₹{totalFee}</p>
                  </div>
                  <div className="bill-actions">
                    <button
                      className="view-bills-btn"
                      onClick={() => setActiveTab("fees")}
                    >
                      <span className="btn-icon">📋</span>
                      View Details
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className="feature-grid">
              <div className="feature-card" onClick={() => setActiveTab("meals")}>
                <div className="feature-icon">🍽️</div>
                <h4>Mark Meals</h4>
                <p>Select your meals</p>
              </div>

              <div className="feature-card" onClick={() => setActiveTab("history")}>
                <div className="feature-icon">🗓️</div>
                <h4>Marking History</h4>
                <p>View past months</p>
              </div>

              <div className="feature-card" onClick={() => setActiveTab("suggestions")}>
                <div className="feature-icon">💡</div>
                <h4>Suggestions</h4>
                <p>Send feedback</p>
              </div>

              <div className="feature-card" onClick={() => setActiveTab("admin")}>
                <div className="feature-icon">👨‍💼</div>
                <h4>Contact Admin</h4>
                <p>Get help</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="tab-content">
            <div className="meals-header">
              <h2>Marking History</h2>
              <p>See your selections for any month</p>
            </div>

            <div className="month-controls">
              <label htmlFor="histMonth" className="month-label">Select Month</label>
              <input
                id="histMonth"
                type="month"
                className="month-input"
                value={historySelectedMonth}
                onChange={(e) => setHistorySelectedMonth(e.target.value)}
              />
            </div>

            <h3 className="month-title">📅 {monthName(historySelectedMonth)}</h3>

            {historyLoading ? (
              <div className="loading-spinner"><div className="spinner"></div><p>Loading...</p></div>
            ) : (
              <div className="history-section">
                <h4 className="history-title">Monthly Summary</h4>
                <div className="history-table">
                  <div className="history-row history-row--head">
                    <div className="history-cell">Date</div>
                    <div className="history-cell">Breakfast</div>
                    <div className="history-cell">Lunch</div>
                    <div className="history-cell">Supper</div>
                  </div>
                  {getDaysInMonth(historySelectedMonth).map((d) => {
                    const b = historyMeals?.[d]?.breakfast || false;
                    const l = historyMeals?.[d]?.lunch || false;
                    const s = historyMeals?.[d]?.supper || false;
                    return (
                      <div key={d} className="history-row">
                        <div className="history-cell history-date">{d}</div>
                        <div className={`history-cell ${b ? "ok" : "no"}`}>{b ? "✓" : "✗"}</div>
                        <div className={`history-cell ${l ? "ok" : "no"}`}>{l ? "✓" : "✗"}</div>
                        <div className={`history-cell ${s ? "ok" : "no"}`}>{s ? "✓" : "✗"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab !== "home" && (
          <div className="back-bar">
            <button className="back-to-home-btn" onClick={() => setActiveTab("home")}>
              ← Back to Dashboard
            </button>
          </div>
        )}

        {activeTab === "meals" && (
          <div className="tab-content">
            <div className="meals-header">
              <h2>Meal Marking History</h2>
              <p>Your meal selection history with color coding</p>
            </div>

            <div className="meals-calendar">
              {getUpcomingDays().map((day) => {
                const today = serverEffectiveDate || new Date().toISOString().split("T")[0];
                const isToday = day.date === today;
                const isPast = day.date < today;

                return (
                  <div
                    key={day.date}
                    className={`day-card ${
                      isPast ? "past" : isToday ? "today" : "future"
                    }`}
                  >
                    <div className="day-info">
                      <div className="day-date">
                        <span className="day-number">{day.dayNumber}</span>
                        <span className="day-month">{day.monthName}</span>
                      </div>
                      <div className="day-name">{day.dayName}</div>
                    </div>

                    <div className="meal-buttons">
                      {["breakfast", "lunch", "supper"].map((mealType) => {
                        const isMarked = meals[day.date]?.[mealType];
                        const mealTime = mealTimes[mealType];

                        return (
                          <button
                            key={mealType}
                            className={`meal-btn ${
                              isMarked ? "marked" : "unmarked"
                            } ${isPast ? "past" : ""} ${
                              isToday ? "locked" : ""
                            }`}
                            onClick={() =>
                              !isPast && !isToday && toggleMeal(day.date, mealType)
                            }
                            disabled={isPast || isToday}
                            title={
                              isPast
                                ? "Past date"
                                : isToday
                                ? "Today - Locked"
                                : `${
                                    mealType.charAt(0).toUpperCase() +
                                    mealType.slice(1)
                                  } - ${mealTime}`
                            }
                          >
                            {mealType.charAt(0).toUpperCase() +
                              mealType.slice(1)}
                            {isMarked ? " ✓" : " ✗"}
                            {isToday ? " 🔒" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="legend">
              <h4>Legend:</h4>
              <div className="legend-items">
                <div className="legend-item">
                  <span className="legend-color green"></span>
                  <span>Marked</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color red"></span>
                  <span>Not Marked</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color blue"></span>
                  <span>Today (Locked)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color gray"></span>
                  <span>Past/Future</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="tab-content">
            <div className="notifications-header">
              <h2>Notifications</h2>
              <p>Stay updated with important announcements</p>
            </div>

            <div className="notifications-list">
              {notifications.map((notification) => (
                <div key={notification.id} className="notification-card">
                  <div className="notification-icon">📢</div>
                  <div className="notification-content">
                    <p className="notification-message">
                      {notification.message}
                    </p>
                    <span className="notification-time">
                      {new Date(
                        notification.timestamp?.toDate?.() ||
                          notification.timestamp
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
              {notifications.length === 0 && (
                <div className="no-notifications">
                  <p>No notifications yet</p>
                </div>
              )}
            </div>

            {(() => {
              const monthKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
              const monthData = (feesData?.months || {})[monthKey] || { fee: 0, paid: 0 };
              const thisMonthFee = monthData.fee || 0;
              const thisMonthPending = Math.max((monthData.fee || 0) - (monthData.paid || 0), 0);
              const totalPendingAll = feesData?.pendingTotal || 0;
              const previousPending = Math.max(totalPendingAll - thisMonthPending, 0);
              const totalFee = thisMonthFee + previousPending;
              return (
                <div className="mess-bill-section">
                  <h3>Mess Bill</h3>
                  <div className="bill-card">
                    <div className="bill-info">
                      <h4>Current Month</h4>
                      <p>This Month Fee: ₹{thisMonthFee}</p>
                    </div>
                    <div className="bill-amount">
                      <span className="amount">Pending Fee: ₹{previousPending}</span>
                    </div>
                  </div>
                  <div style={{marginTop: 8}}>
                    <strong>Total Fee:</strong> ₹{totalFee}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === "menu" && (
          <div className="tab-content">
            <div className="menu-header">
              <h2>Weekday Menu</h2>
              <p>Fixed menu for each weekday</p>
            </div>

            <div className="menu-schedule">
              {[
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
              ].map((weekday) => (
                <div key={weekday} className="meal-schedule-item">
                  <div className="meal-time">
                    <span className="meal-icon">📅</span>
                    <div className="meal-details">
                      <h4>{weekday}</h4>
                      <p>Breakfast, Lunch, Supper</p>
                    </div>
                  </div>
                  <div className="menu-item">
                    <div>
                      <strong>Breakfast:</strong>{" "}
                      {menuData[weekday]?.breakfast || "Not added yet"}
                    </div>
                    <div>
                      <strong>Lunch:</strong>{" "}
                      {menuData[weekday]?.lunch || "Not added yet"}
                    </div>
                    <div>
                      <strong>Supper:</strong>{" "}
                      {menuData[weekday]?.supper || "Not added yet"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "suggestions" && (
          <div className="tab-content">
            <div className="suggestions-header">
              <h2>Send Feedback</h2>
              <p>Help us improve the mess experience</p>
            </div>

            <div className="suggestions-form">
              <textarea
                className="feedback-input"
                placeholder="Share your suggestions, complaints, or feedback..."
                rows="6"
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
              />
              <button className="submit-btn" onClick={submitSuggestion}>
                <span className="btn-icon">📤</span>
                Send Feedback
              </button>
            </div>
          </div>
        )}

        {activeTab === "fees" && (
          <div className="tab-content">
            <div className="notifications-header">
              <h2>Fees</h2>
              <p>Your monthly fees: paid and pending</p>
            </div>
            <div className="mess-bill-section">
              <div className="bill-card">
                <div className="bill-info">
                  <h4>Total Pending</h4>
                  <p>Updated monthly</p>
                </div>
                <div className="bill-amount">
                  <span className="amount">₹{feesData?.pendingTotal || 0}</span>
                </div>
              </div>
            </div>
            <div className="notifications-list">
              {Object.entries(feesData?.months || {})
                .sort(([a],[b]) => a.localeCompare(b))
                .map(([monthKey, data]) => (
                  <div key={monthKey} className="notification-card">
                    <div className="notification-icon">📅</div>
                    <div className="notification-content">
                      <p className="notification-message">{monthKey}</p>
                      <span className="notification-time">
                        Fee: ₹{data.fee || 0} • Paid: ₹{data.paid || 0} • Pending: ₹{Math.max((data.fee || 0) - (data.paid || 0), 0)}
                      </span>
                    </div>
                  </div>
                ))}
              {Object.keys(feesData?.months || {}).length === 0 && (
                <div className="no-notifications">
                  <p>No fee records yet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "admin" && (
          <div className="tab-content">
            <div className="notifications-header">
              <h2>Admin Details</h2>
              <p>MEA Mess Bunch</p>
            </div>
            <div className="notifications-list">
              {bunchDetails ? (
                [
                  { key: "cmd", label: "CMD (Chief Mess Director)" },
                  { key: "acmd", label: "ACMD (Assistant CMD)" },
                  { key: "juniorAcmd", label: "Junior ACMD" },
                  { key: "artsSports", label: "Arts & Sports Secretary" },
                  { key: "libraryCoordinator", label: "Library Coordinator" },
                ].map((f) => (
                  <div key={f.key} className="notification-card">
                    <div className="notification-icon">👤</div>
                    <div className="notification-content">
                      <p className="notification-message">{f.label}</p>
                      <span className="notification-time">
                        {bunchDetails?.[f.key] || "Not set"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-notifications">
                  <p>No details available</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fixed Bottom Navigation */}
      <div className="bottom-nav">
        <button
          className={`nav-item ${activeTab === "home" ? "active" : ""}`}
          onClick={() => setActiveTab("home")}
        >
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Home</span>
        </button>

        <button
          className={`nav-item ${activeTab === "meals" ? "active" : ""}`}
          onClick={() => setActiveTab("meals")}
        >
          <span className="nav-icon">🍽️</span>
          <span className="nav-label">Meals</span>
        </button>

        <button
          className={`nav-item ${
            activeTab === "notifications" ? "active" : ""
          }`}
          onClick={() => setActiveTab("notifications")}
        >
          <span className="nav-icon">🔔</span>
          <span className="nav-label">Notifications</span>
        </button>

        <button
          className={`nav-item ${activeTab === "menu" ? "active" : ""}`}
          onClick={() => setActiveTab("menu")}
        >
          <span className="nav-icon">📋</span>
          <span className="nav-label">Menu</span>
        </button>

        <button
          className={`nav-item ${activeTab === "fees" ? "active" : ""}`}
          onClick={() => setActiveTab("fees")}
        >
          <span className="nav-icon">💰</span>
          <span className="nav-label">Fees</span>
        </button>

        <button
          className={`nav-item ${activeTab === "admin" ? "active" : ""}`}
          onClick={() => setActiveTab("admin")}
        >
          <span className="nav-icon">👥</span>
          <span className="nav-label">Admin</span>
        </button>

        <button
          className={`nav-item ${
            activeTab === "suggestions" ? "active" : ""
          }`}
          onClick={() => setActiveTab("suggestions")}
        >
          <span className="nav-icon">💡</span>
          <span className="nav-label">Suggestions</span>
        </button>
      </div>
    </div>
  );
}

export default ModernStudentPage;
