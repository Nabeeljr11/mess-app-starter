import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import "./PointSystemPage.css";

function PointSystemPage({ goBack }) {
  const rulesOrder = ["X", "0", "B", "L", "S", "B/L", "B/S", "L/S"];
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const defaultDaySystem = {
    X: 1,
    "0": 0,
    B: 0.25,
    L: 0.35,
    S: 0.45,
    "B/L": 0.65,
    "B/S": 0.75,
    "L/S": 0.85,
  };

  const defaultSystem = weekdays.reduce((acc, day) => {
    acc[day] = { ...defaultDaySystem };
    return acc;
  }, {});

  const [pointSystem, setPointSystem] = useState(defaultSystem);
  const [loading, setLoading] = useState(true);
  const [openDay, setOpenDay] = useState(null); // track which day is expanded

  useEffect(() => {
    const fetchPoints = async () => {
      const ref = doc(db, "settings", "points");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setPointSystem({ ...defaultSystem, ...snap.data() });
      } else {
        await setDoc(ref, defaultSystem);
      }
      setLoading(false);
    };
    fetchPoints();
  }, []);

  const saveSystem = async () => {
    try {
      await setDoc(doc(db, "settings", "points"), pointSystem);
      alert("✅ Point system updated!");
    } catch (err) {
      alert("⚠️ " + err.message);
    }
  };

  if (loading) return <h2 className="points-loading">Loading point system...</h2>;

  return (
    <div className="points-container">
      <h2 className="points-title">⚙️ Manage Weekly Point System</h2>
      <p className="points-sub">
        Click a weekday to expand and edit its point values.
      </p>

      {weekdays.map((day) => (
        <div key={day} className="day-block">
          <div
            className={`day-header ${openDay === day ? "open" : ""}`}
            onClick={() => setOpenDay(openDay === day ? null : day)}
          >
            <h3>{day}</h3>
            <span>{openDay === day ? "▲" : "▼"}</span>
          </div>

          {openDay === day && (
            <table className="points-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {rulesOrder.map((rule) => (
                  <tr key={rule}>
                    <td className="rule-key">{rule}</td>
                    <td>
                      <input
                        className="rule-input"
                        type="number"
                        step="0.01"
                        value={pointSystem[day]?.[rule] ?? ""}
                        onChange={(e) =>
                          setPointSystem({
                            ...pointSystem,
                            [day]: {
                              ...pointSystem[day],
                              [rule]: parseFloat(e.target.value),
                            },
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      <div className="points-actions">
        <button className="btn save-btn" onClick={saveSystem}>
          Save
        </button>
        <button className="btn back-btn" onClick={goBack}>
          ⬅ Back to Dashboard
        </button>
      </div>
    </div>
  );
}

export default PointSystemPage;
