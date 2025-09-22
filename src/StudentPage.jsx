import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import "./StudentPage.css";

function StudentPage({ currentUser, onLogout }) {
  const [mealData, setMealData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7) // YYYY-MM
  );

  // Generate today + next 7 days = 8 days
  const getNext8Days = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 8; i++) {
      const nextDay = new Date(today);
      nextDay.setDate(today.getDate() + i);
      const dateStr = nextDay.toISOString().split("T")[0];
      days.push(dateStr);
    }
    return days;
  };

  const days = getNext8Days();

  // Get all days in a given month (YYYY-MM)
  const getDaysInMonth = (yyyyMm) => {
    const [y, m] = yyyyMm.split("-").map((v) => parseInt(v, 10));
    const first = new Date(y, m - 1, 1);
    const result = [];
    while (first.getMonth() === m - 1) {
      const dateStr = first.toISOString().split("T")[0];
      result.push(dateStr);
      first.setDate(first.getDate() + 1);
    }
    return result;
  };

  const monthName = (yyyyMm) => {
    const [y, m] = yyyyMm.split("-").map((v) => parseInt(v, 10));
    return new Date(y, m - 1, 1).toLocaleString(undefined, {
      month: "long",
      year: "numeric",
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        let updatedMeals = userSnap.exists() ? userSnap.data().meals || {} : {};
        const todayStr = new Date().toISOString().split("T")[0];

        days.forEach((day) => {
          if (!updatedMeals[day]) {
            if (day > todayStr) {
              updatedMeals[day] = { breakfast: true, lunch: true, supper: true, lastUpdated: serverTimestamp() };
            } else {
              updatedMeals[day] = { breakfast: false, lunch: false, supper: false, lastUpdated: serverTimestamp() };
            }
          }
        });

        setMealData(updatedMeals);
        await setDoc(userRef, { meals: updatedMeals }, { merge: true });
      } catch (err) {
        console.error("Error loading meals:", err);
      }
      setLoading(false);
    };
    fetchData();
  }, [currentUser]);

  // Toggle meal (only for future)
  const toggleMeal = async (day, meal) => {
    const todayStr = new Date().toISOString().split("T")[0];
    if (day === todayStr) {
      alert("❌ Marking for today is locked!");
      return;
    }
    try {
      const newStatus = !(mealData[day]?.[meal] || false);
      const updatedMeals = {
        ...mealData,
        [day]: { ...mealData[day], [meal]: newStatus, lastUpdated: serverTimestamp() },
      };
      setMealData(updatedMeals);
      const userRef = doc(db, "users", currentUser.uid);
      await setDoc(userRef, { meals: updatedMeals }, { merge: true });
    } catch (err) {
      console.error("Error updating meal:", err);
    }
  };

  if (loading) return <h2 className="loading">Loading meals...</h2>;

  return (
    <div className="student-container">
      <h2 className="title">🍽️ Mark Your Meals</h2>

      {/* Month selector and label */}
      <div className="month-controls">
        <label htmlFor="monthPicker" className="month-label">Select Month</label>
        <input
          id="monthPicker"
          type="month"
          className="month-input"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
        />
      </div>

      <h3 className="month-title">📅 {monthName(selectedMonth)}</h3>

      {/* For the current month, keep the upcoming marking section */}
      {selectedMonth === new Date().toISOString().slice(0, 7) && (
        <>
          {days.map((day) => (
            <div key={day} className="day-row">
              <h3 className="day-label">
                {day} {day === new Date().toISOString().split("T")[0] ? "(Locked)" : ""}
              </h3>
              <div className="meal-buttons">
                {["breakfast", "lunch", "supper"].map((meal) => (
                  <button
                    key={meal}
                    className={`meal-btn ${mealData[day]?.[meal] ? "marked" : "unmarked"}`}
                    onClick={() => toggleMeal(day, meal)}
                    disabled={day === new Date().toISOString().split("T")[0]}
                  >
                    {meal.toUpperCase()} {mealData[day]?.[meal] ? "✓" : "✗"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Monthly history (read-only) */}
      <div className="history-section">
        <h4 className="history-title">Marking History</h4>
        <div className="history-table">
          <div className="history-row history-row--head">
            <div className="history-cell">Date</div>
            <div className="history-cell">Breakfast</div>
            <div className="history-cell">Lunch</div>
            <div className="history-cell">Supper</div>
          </div>
          {getDaysInMonth(selectedMonth).map((d) => {
            const b = mealData[d]?.breakfast || false;
            const l = mealData[d]?.lunch || false;
            const s = mealData[d]?.supper || false;
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

      <div className="logout-wrapper">
        <button className="logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}

export default StudentPage;
