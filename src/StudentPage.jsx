import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import "./StudentPage.css";

function StudentPage({ currentUser, onLogout }) {
  const [mealData, setMealData] = useState({});
  const [loading, setLoading] = useState(true);

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

      <div className="logout-wrapper">
        <button className="logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}

export default StudentPage;
