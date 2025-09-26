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

// Send push notification to all users with fcmToken saved
// data: { message: string, title?: string }
exports.sendPushToAll = onCall(async (request) => {
  const { auth, data } = request;
  if (!auth) throw new Error("UNAUTHENTICATED");

  const message = (data?.message || "").trim();
  const title = (data?.title || "MEA Mess").trim();
  if (!message) throw new Error("INVALID_ARGUMENT: message");

  // Optional: check that caller is admin
  try {
    const caller = await db.collection("users").doc(auth.uid).get();
    if (!caller.exists || caller.data().role !== 'admin') {
      throw new Error("PERMISSION_DENIED");
    }
  } catch (e) {
    throw new Error("PERMISSION_DENIED");
  }

  // Collect tokens
  const usersSnap = await db.collection("users").get();
  const tokens = [];
  usersSnap.forEach((doc) => {
    const t = doc.data().fcmToken;
    if (t && typeof t === 'string') tokens.push(t);
  });

  if (tokens.length === 0) {
    return { success: 0, failure: 0, total: 0 };
  }

  const chunkSize = 500; // FCM limit per request
  let success = 0, failure = 0;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: chunk,
      notification: { title, body: message },
      webpush: {
        notification: {
          title,
          body: message,
          icon: '/logo3.png',
          badge: '/favicon.svg',
          data: { click_action: '/', origin: 'mea-mess' },
        },
        fcmOptions: { link: '/' },
      },
      data: {
        title,
        body: message,
        click_action: '/',
      },
    });
    success += res.successCount;
    failure += res.failureCount;
  }

  return { success, failure, total: tokens.length };
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

  // Trusted 'today' in IST
  const now = new Date();
  const tz = "Asia/Kolkata";
  const today = dayjs(now).tz(tz).format("YYYY-MM-DD");
  if (date <= today) {
    return { status: "forbidden", reason: "locked_or_past", today, date };
  }

  // Compute YYYY-MM for monthly docs
  const d = dayjs(date + "T00:00:00Z");
  const y = d.year();
  const m = String(d.month() + 1).padStart(2, "0");
  const monthKey = `${y}-${m}`;

  // Validate membership against monthlyUsers (stores emails) and exceptions
  let userEmail = null;
  try {
    const rec = await admin.auth().getUser(userId);
    userEmail = (rec.email || "").toLowerCase();
  } catch (_) {
    // fallback to users doc if email not available from auth
    const uDoc = await db.collection("users").doc(userId).get();
    userEmail = (uDoc.exists && (uDoc.data().email || "")).toLowerCase();
  }
  if (!userEmail) {
    throw new Error("PERMISSION_DENIED");
  }

  // Monthly users check
  const muSnap = await db.collection("monthlyUsers").doc(monthKey).get();
  const muUsers = muSnap.exists ? (muSnap.data().users || []) : [];
  const muLower = muUsers.map((x) => String(x));
  const included = muLower.map((x) => x.toLowerCase()).includes(userEmail) || muLower.includes(userId);
  if (!included) {
    return { status: "forbidden", reason: "not_in_monthly_list", date };
  }

  // Exceptions check (skip/deny dates in exception ranges for this user)
  const exSnap = await db.collection("monthlyExceptions").doc(monthKey).get();
  if (exSnap.exists) {
    const exList = exSnap.data().exceptions || [];
    const denied = exList.some((ex) => {
      const exUser = String(ex.user || "").toLowerCase();
      if (exUser !== userEmail) return false;
      const from = ex.from || date;
      const to = ex.to || date;
      return date >= from && date <= to;
    });
    if (denied) {
      return { status: "forbidden", reason: "exception_block", date };
    }
  }

  // Toggle per-meal value in aggregated meals doc (by date)
  const mealsRef = db.collection("meals").doc(monthKey);
  const snap = await mealsRef.get();
  const dataObj = snap.exists ? snap.data() : {};
  const existingForDay = dataObj[date] || { breakfast: true, lunch: true, supper: true };
  const newValue = !existingForDay[mealType];
  const newForDay = { ...existingForDay, [mealType]: newValue };
  await mealsRef.set({ [date]: newForDay, _lastWriteAt: FieldValue.serverTimestamp() }, { merge: true });

  // Mirror to user's doc so UI/admin stays consistent
  const userRef = db.collection("users").doc(userId);
  const userSnap = await userRef.get();
  const userMeals = userSnap.exists ? (userSnap.data().meals || {}) : {};
  const userDay = userMeals[date] || { breakfast: false, lunch: false, supper: false };
  const userUpdatedDay = { ...userDay, [mealType]: newValue, lastUpdated: FieldValue.serverTimestamp() };
  await userRef.set({ meals: { [date]: userUpdatedDay } }, { merge: true });

  return { status: "ok", date, mealType, value: newValue };
});
