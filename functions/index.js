const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = getFirestore();

// Returns trusted server time and effective date in Asia/Kolkata
exports.getServerNow = onCall(async (request) => {
  const now = new Date();
  const tz = "Asia/Kolkata";
  const effectiveDate = dayjs(now).tz(tz).format("YYYY-MM-DD");
  return {
    serverTime: now.toISOString(),
    timezone: tz,
    effectiveDate,
  };
});

// Securely toggle a meal mark for a FUTURE date using trusted server time
// data: { date: 'YYYY-MM-DD', mealType: 'breakfast'|'lunch'|'supper' }
exports.markMeal = onCall(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new Error("UNAUTHENTICATED");
  }
  const userId = auth.uid;
  const { date, mealType } = data || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("INVALID_ARGUMENT: date must be YYYY-MM-DD");
  }
  if (!mealType || !["breakfast", "lunch", "supper"].includes(mealType)) {
    throw new Error("INVALID_ARGUMENT: mealType");
  }

  const now = new Date();
  const tz = "Asia/Kolkata";
  const today = dayjs(now).tz(tz).format("YYYY-MM-DD");

  // Disallow toggling for today or past dates
  if (date <= today) {
    return { status: "forbidden", reason: "locked_or_past", today, date };
  }

  // Compute monthly doc id from the provided date (trusted)
  const d = dayjs(date + "T00:00:00Z");
  const y = d.year();
  const m = String(d.month() + 1).padStart(2, "0");
  const docId = `${y}-${m}`;

  const mealsRef = db.collection("meals").doc(docId);
  const snap = await mealsRef.get();
  const dataObj = snap.exists ? snap.data() : {};
  const existingForDay = dataObj[date] || { breakfast: true, lunch: true, supper: true };
  const newValue = !existingForDay[mealType];
  const newForDay = { ...existingForDay, [mealType]: newValue };

  await mealsRef.set({ [date]: newForDay, _lastWriteAt: FieldValue.serverTimestamp() }, { merge: true });

  return { status: "ok", date, mealType, value: newValue };
});
