// מונדיאל 2026 — לוגיקת לקוח (מודול).
// זהות: request.auth.uid. localStorage שומר רק displayName. קוד הטורניר ב-URL.
// מקור אמת יחיד למצב המשתמש: deriveUserState(). אין חישוב מצב מתוך שגיאה.

import { db, auth, authReady } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, deleteDoc, updateDoc, arrayUnion,
  collection, query, where, getDocs, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const NAME_KEY = "mondial2026.displayName";
const ADMINS_KEY = "mondial2026.admins";

// ----- החלטת מוצר (2026-06-10): טורניר יחיד + מנהלים קבועים מראש -----
const DEFAULT_CODE = "CUP2026";
const FIXED_ADMIN_NAMES = ["אלעד", "דוד דין", "דוד יוני"];

const getName = () => (localStorage.getItem(NAME_KEY) || "").trim();

// דגלים לנבחרות (UX בלבד). אין התאמה → שם בלי דגל, בלי לשבור UI.
const TEAM_FLAGS = {
  "אלג'יריה": "🇩🇿",
  "ארגנטינה": "🇦🇷",
  "אוסטרליה": "🇦🇺",
  "אוסטריה": "🇦🇹",
  "בלגיה": "🇧🇪",
  "בוסניה": "🇧🇦",
  "ברזיל": "🇧🇷",
  "כף ורדה": "🇨🇻",
  "קנדה": "🇨🇦",
  "קולומביה": "🇨🇴",
  "קונגו": "🇨🇩",
  "קרואטיה": "🇭🇷",
  "קוראסאו": "🇨🇼",
  "צ'כיה": "🇨🇿",
  "חוף השנהב": "🇨🇮",
  "אקוודור": "🇪🇨",
  "מצרים": "🇪🇬",
  "אנגליה": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "צרפת": "🇫🇷",
  "גרמניה": "🇩🇪",
  "גאנה": "🇬🇭",
  "האיטי": "🇭🇹",
  "איראן": "🇮🇷",
  "עיראק": "🇮🇶",
  "יפן": "🇯🇵",
  "ירדן": "🇯🇴",
  "דרום קוריאה": "🇰🇷",
  "מקסיקו": "🇲🇽",
  "מרוקו": "🇲🇦",
  "הולנד": "🇳🇱",
  "ניו זילנד": "🇳🇿",
  "נורווגיה": "🇳🇴",
  "פנמה": "🇵🇦",
  "פרגוואי": "🇵🇾",
  "פורטוגל": "🇵🇹",
  "קטאר": "🇶🇦",
  "ערב הסעודית": "🇸🇦",
  "סקוטלנד": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "סנגל": "🇸🇳",
  "דרום אפריקה": "🇿🇦",
  "ספרד": "🇪🇸",
  "שוודיה": "🇸🇪",
  "שווייץ": "🇨🇭",
  "תוניסיה": "🇹🇳",
  "טורקיה": "🇹🇷",
  "ארה\"ב": "🇺🇸",
  "אורוגוואי": "🇺🇾",
  "אוזבקיסטן": "🇺🇿",
};
const withFlag = (team) => (TEAM_FLAGS[team] ? TEAM_FLAGS[team] + " " + team : team);
const isFixedAdmin = (name) => FIXED_ADMIN_NAMES.includes((name || "").trim());

const STAGE_HE = { group: "שלב הבתים", r32: "32 האחרונות", r16: "שמינית גמר", qf: "רבע גמר", sf: "חצי גמר", third: "מקום 3", final: "🏆 גמר" };
// תצוגת מועד מקומית מתוך kickoffAt UTC: יום בשבוע + תאריך + שעה + אזור זמן.
// kickoffAt חסר/לא תקין → טקסט מפורש, לעולם לא "Invalid Date".
const fmtKickoff = (iso) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "מועד טרם נקבע";
  try {
    return new Date(t).toLocaleString("he-IL", {
      weekday: "short", day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });
  } catch (e) { return new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC"; }
};

// ----- סיסמאות (מודל כניסה חדש, אין קוד גישה) -----
// סיסמאות מנהלים נשמרות כ-SHA-256 בלבד — לא טקסט גלוי ולא מוצגות ב-UI.
// "מנהל" נקבע רק אחרי אימות סיסמה (session), לעולם לא לפי שם בלבד.
const ADMIN_PASS_SHA256 = {
  "אלעד": "9c60ed79f8f7f126f2ec73de556264c91ddf45fb7b687ecf7a7ac27a56d9d38b",
  "דוד דין": "b514ba76019f4de95b1c34bc45ee812ee773a61ae90029d5220ac764437ecfa1",
};
const ADMIN_SESSION_KEY = "mondial2026.adminSession";
const PART_SESSION_KEY = "mondial2026.participantSession";

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const adminSession = () => sessionStorage.getItem(ADMIN_SESSION_KEY) || "";
const isAdminSession = () => isFixedAdmin(adminSession());
// session משתתף (sessionStorage בלבד — שום hash לא נשמר ב-localStorage)
const getPartSession = () => { try { return JSON.parse(sessionStorage.getItem(PART_SESSION_KEY) || "null"); } catch (e) { return null; } };
const setPartSession = (s) => sessionStorage.setItem(PART_SESSION_KEY, JSON.stringify(s));

// nameKey: trim → צמצום רווחים → NFKC → lowercase (לטיניות). קפוא אחרי אישור.
const nameKey = (name) => (name || "").trim().replace(/\s+/g, " ").normalize("NFKC").toLowerCase();

// איתור לפי שם — קריאת directory בלבד (שם→מזהה). אפס גישה ל-hash.
// מחזיר: participantId / false (אין) / null (לא ידוע)
async function directoryLookup(code, name) {
  try {
    const s = await getDoc(doc(db, "directory", code + "__" + nameKey(name)));
    return s.exists() ? s.data().participantId : false;
  } catch (e) { return null; }
}

const credRef = (partId) => doc(db, "participants", partId, "private", "cred");
const linkRef = (u) => doc(db, "device_links", u);

// verify-by-write: שולחים את ה-hash; ה-rules משווים. הצלחה=סיסמה נכונה.
// הלקוח לא קורא את ה-hash לעולם. כישלון = אפס שינוי state בשרת.
async function loginVerifyWrite(partId, hash, u) {
  await updateDoc(credRef(partId), {
    via: "login", // כוונה מפורשת — ה-rules מתירים login רק מול hash קיים וזהה
    passwordHash: hash, mustReset: false,
    uids: arrayUnion(u), lastLoginAt: serverTimestamp(),
  });
  await setDoc(linkRef(u), { participantId: partId, tournamentCode: partId.split("__")[0] });
}

// set-password (ראשונה / אחרי איפוס): מותר ע"י rules רק כש-hash==null או mustReset.
async function setPasswordWrite(partId, hash, u) {
  await updateDoc(credRef(partId), {
    via: "set", // כוונה מפורשת — קביעת סיסמה מותרת רק כשאין hash או אחרי איפוס
    passwordHash: hash, mustReset: false,
    uids: arrayUnion(u), lastLoginAt: serverTimestamp(),
  });
  await setDoc(linkRef(u), { participantId: partId, tournamentCode: partId.split("__")[0] });
}

const getStoredAdmins = () => {
  try { return JSON.parse(localStorage.getItem(ADMINS_KEY) || "null"); } catch (e) { return null; }
};
// זמני עד חיווט backend: רשימת המנהלים נשמרת מקומית בלבד (לא Firestore, לא קודים).
const setStoredAdmins = (list) => localStorage.setItem(ADMINS_KEY, JSON.stringify(list));
const setName = (n) => localStorage.setItem(NAME_KEY, n);
const param = (k) => new URLSearchParams(location.search).get(k) || "";
const partRef = (code, uid) => doc(db, "participants", code + "__" + uid);
const reqRef = (code, uid) => doc(db, "join_requests", code + "__" + uid);
const predRef = (code, mid, uid) => doc(db, "predictions", code + "__" + mid + "__" + uid);
const goPredictions = (code) => (location.href = "predictions.html?t=" + encodeURIComponent(code));
const goPending = (code) => (location.href = "pending.html?t=" + encodeURIComponent(code));
const authOrNull = (ms = 6000) =>
  Promise.race([authReady.catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

// חותמת זמן של Firestore → מילישניות. חסר/לא תקין → 0 (לעולם לא זורק).
function millis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v.seconds != null) return Number(v.seconds) * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

// טוען את ערכי הניקוד מ-scoring-config (אם נכשל — ברירת מחדל זהה לקונפיג).
async function loadScoring() {
  try { const m = await import("./scoring-config.js"); if (m && m.SCORING) return m.SCORING; } catch (e) {}
  return { HOME: 3, DRAW: 4, AWAY: 3 };
}

// קופסת הסבר ניקוד — דינמית, ידידותית, לכל המשפחה.
function scoringHelpEl(S) {
  const box = el("div", "scoring-help");
  box.appendChild(el("div", "sh-title", "❓ איך עובד הניקוד?"));
  box.appendChild(el("p", "sh-line", "בכל משחק בוחרים מי ינצח: בית · תיקו · חוץ (בנוקאאוט — מי עולה)."));
  box.appendChild(el("p", "sh-line", "ניחשתם נכון → מקבלים נקודות 🎉  ·  לא נכון → 0."));
  const pts = el("div", "sh-points");
  pts.appendChild(el("span", "sh-chip", "🏠 ניצחון בית = " + S.HOME));
  pts.appendChild(el("span", "sh-chip sh-draw", "🤝 תיקו = " + S.DRAW));
  pts.appendChild(el("span", "sh-chip", "✈️ ניצחון חוץ = " + S.AWAY));
  box.appendChild(pts);
  box.appendChild(el("p", "sh-note", "התוצאה המדויקת (למשל 2:1) לא נספרת — חשוב רק מי ניצח. הניקוד שליד כל אדם = סכום כל הניחושים הנכונים שלו."));
  return box;
}

// שמות כל מי שניחש (מקור = predicted_flags, קריא לכל צופה).
// מאפשר לטבלת הניקוד להציג גם מי שניחש רק משחקים עתידיים (עדיין 0 נק'),
// ומשמיט רשומות-משתתף שמעולם לא ניחשו. השם נגזר מ-participantId (CUP2026__שם).
async function fetchPredictorNames(tc) {
  try {
    const pf = await getDocs(query(collection(db, "predicted_flags"), where("tournamentCode", "==", tc)));
    const names = [];
    pf.forEach((d) => {
      const pid = String(d.data().participantId || d.id);
      const n = pid.includes("__") ? pid.split("__").slice(1).join("__") : pid;
      // מזהים טכניים של שחקנים וירטואליים (virtual_*) מדולגים — displayName האמיתי שלהם מגיע מ-scores.
      if (n && !/^virtual_/.test(n)) names.push(n);
    });
    return names;
  } catch (e) { return []; }
}

// ===================== מודל מצבים מאוחד =====================
const STATES = Object.freeze({
  UNKNOWN: "UNKNOWN",
  SIGNED_OUT: "SIGNED_OUT",
  NO_REQUEST: "NO_REQUEST",
  REQUEST_SENT: "REQUEST_SENT",
  APPROVED: "APPROVED",
  ADMIN: "ADMIN",
});
const STATE_ICON = { UNKNOWN: "", SIGNED_OUT: "⚪", NO_REQUEST: "⚪", REQUEST_SENT: "🔵", APPROVED: "🟢", ADMIN: "🟢" };

// אותות גלם בלבד. כל קריאה שנכשלת => null (לא ידוע). לא מסיקים מ-permission-denied.
// joinRequest: true(קיים)/false(לא קיים)/null(לא ידוע)
// participant: {approved,isAdmin}(קיים)/false(לא קיים)/null(לא ידוע)
async function probeSignals(code, uid) {
  const sig = { auth: !!uid, joinRequest: null, participant: null };
  if (!uid) return sig;
  // זהות מכשיר: device_links/uid → participantId → פרופיל (בלי credentials)
  try {
    const link = await getDoc(doc(db, "device_links", uid));
    if (!link.exists()) {
      sig.participant = false;
    } else {
      try {
        const p = await getDoc(doc(db, "participants", link.data().participantId));
        sig.participant = p.exists()
          ? { approved: p.data().status === "approved", isAdmin: p.data().isAdmin === true }
          : false;
      } catch (e) { sig.participant = null; }
    }
  } catch (e) { sig.participant = null; }
  try {
    const s = await getDoc(reqRef(code, uid));
    sig.joinRequest = s.exists();
  } catch (e) { sig.joinRequest = null; }
  return sig;
}

// הפונקציה היחידה שמכריעה מצב. קלט: אותות. פלט: state + טקסט + הרשאות.
function deriveUserState(sig) {
  const mk = (state, statusText, canAccessPredictions, canAccessAdmin) =>
    ({ state, statusText, canAccessPredictions, canAccessAdmin });
  if (!sig.auth) return mk(STATES.SIGNED_OUT, "צריך להיכנס.", false, false);
  const p = sig.participant;
  if (p && typeof p === "object") {
    if (p.approved && p.isAdmin) return mk(STATES.ADMIN, "מנהל הטורניר.", true, true);
    if (p.approved) return mk(STATES.APPROVED, "מאושר.", true, false);
    return mk(STATES.REQUEST_SENT, "בקשת ההצטרפות נשלחה.", false, false);
  }
  if (sig.joinRequest === true) return mk(STATES.REQUEST_SENT, "בקשת ההצטרפות נשלחה.", false, false);
  if (sig.joinRequest === false && p === false) return mk(STATES.NO_REQUEST, "עדיין לא הצטרפת.", false, false);
  return mk(STATES.UNKNOWN, "לא הצלחנו לקבוע מצב.", false, false);
}

// פס סטטוס אנושי — בלי מושגים טכניים.
// 🟢 מחובר · ⏳ ממתין לאישור · 👑 מנהל · ⚠️ בעיית חיבור
function renderStatusBar(barEl, derived) {
  if (!barEl) return;
  let chip = null;
  if (derived.state === STATES.UNKNOWN || derived.state === STATES.SIGNED_OUT) {
    chip = "⚠️ בעיית חיבור";
  } else if (isAdminSession()) {
    chip = "🟢 מחובר כמנהל";
  } else if (derived.state === STATES.ADMIN || derived.state === STATES.APPROVED) {
    chip = "🟢 מחובר";
  } else if (derived.state === STATES.REQUEST_SENT) {
    chip = "⏳ ממתין לאישור";
  }
  barEl.textContent = "";
  if (chip === null) { barEl.hidden = true; return; }
  barEl.hidden = false;
  barEl.appendChild(el("span", "sb-main", chip));
}

// שכבת גישה יחידה לכל המסכים: אותות → מצב.
async function loadState(code, uid) {
  const sig = await probeSignals(code, uid);
  return { sig, derived: deriveUserState(sig) };
}

const barEl = document.getElementById("status-bar");

// ===================== היגיינת session (סבב UX) =====================
// פונקציה יחידה לניקוי כל ה-DOM שתלוי-משתמש. אסור append בלי reset —
// נקראת אחרי login/logout/החלפת משתמש ולפני hydrate.
function resetScreenState() {
  // רשימות משתתפים, טפסים, מונים
  ["participants", "home-people-rows", "leaderboard-rows", "pending-list", "part-list"]
    .forEach((id) => { const n = document.getElementById(id); if (n) n.textContent = ""; });
  const matches = document.getElementById("matches");
  if (matches) {
    // ניחושים מסומנים + תיבות תוצאה — מתאפסים יחד עם הכרטיסים
    matches.querySelectorAll('input[type="radio"]').forEach((r) => { r.checked = false; });
    matches.querySelectorAll('input.score').forEach((i) => { i.value = ""; });
    matches.textContent = "";
    matches.appendChild(el("p", "loading", "טוען משחקים…"));
  }
  // ברכת שלום + badge מנהל + פס סטטוס + באנרים
  const greet = document.getElementById("greeting");
  if (greet) greet.textContent = "שלום";
  const navAdmin = document.getElementById("nav-admin");
  if (navAdmin) navAdmin.hidden = !isAdminSession();
  if (barEl) { barEl.textContent = ""; barEl.hidden = true; }
  const errEl = document.getElementById("error");
  if (errEl) { errEl.textContent = ""; errEl.hidden = true; }
  // מוני בית/עץ → מצב ניטרלי עד hydrate
  ["hs-registered", "hs-predicted", "hs-not-predicted", "cb-participants", "cb-predicted"]
    .forEach((id) => { const n = document.getElementById(id); if (n) n.textContent = "עדיין אין נתונים"; });
}

// יציאה מלאה: signOut + ניקוי session של המשתמש בלבד (לא theme/קונפיג),
// ניקוי DOM, ומעבר ל-index עם replace (Back לא מחזיר משתמש קודם).
async function doLogout(code) {
  try { await signOut(auth); } catch (e) { /* גם בלי auth ממשיכים לנקות */ }
  localStorage.removeItem(NAME_KEY);
  [ADMIN_SESSION_KEY, PART_SESSION_KEY, "mondial2026.setpassFor"]
    .forEach((k) => sessionStorage.removeItem(k));
  resetScreenState();
  location.replace("index.html" + (code ? "?t=" + encodeURIComponent(code) : ""));
}

// ===================== ניווט קבוע (כל המסכים) =====================
const topnav = document.getElementById("topnav");
if (topnav) {
  const navCode = (param("t") || param("code")).toUpperCase();
  const qt = navCode ? "?t=" + encodeURIComponent(navCode) : "";
  const qc = navCode ? "?code=" + encodeURIComponent(navCode) : "";
  const targets = {
    home: "home.html" + qt,
    bracket: "bracket.html" + qt,
    predict: "predictions.html" + qt,
    results: "results.html" + qt,
    help: "instructions.html" + qc,
    admin: "admin.html" + qt,
  };
  topnav.querySelectorAll("a[data-nav]").forEach((a) => {
    if (a.dataset.nav === "back") {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (history.length > 1) history.back();
        else location.href = targets.home;
      });
      return;
    }
    a.href = targets[a.dataset.nav] || "home.html";
  });
  // ⚙️ ניהול — רק אחרי אימות סיסמת מנהל (session). שם בלבד אינו מספיק.
  if (isAdminSession()) {
    const navAdmin = document.getElementById("nav-admin");
    if (navAdmin) navAdmin.hidden = false;
  }
  // 🚪 התנתקות — קבוע בניווט בכל המסכים (מוזרק, בלי לגעת ב-HTML של כל מסך)
  const logoutLink = el("a", "nav-logout", "🚪");
  logoutLink.appendChild(el("span", "nav-label", " התנתקות"));
  logoutLink.href = "#";
  logoutLink.addEventListener("click", (e) => { e.preventDefault(); doLogout(navCode); });
  topnav.appendChild(logoutLink);
}

// ===================== מסך הוראות (instructions.html) =====================
const gotItBtn = document.getElementById("got-it");
if (gotItBtn) {
  gotItBtn.addEventListener("click", () => {
    const code = param("code").toUpperCase();
    location.href = "home.html" + (code ? "?t=" + encodeURIComponent(code) : "");
  });
}

// ===================== עץ טורניר (bracket.html) =====================
// ===================== עץ הטורניר (bracket.html) — נבנה מהלוח האמיתי =====================
const bracketGrid = document.getElementById("bracket-grid");
if (bracketGrid) {
  // P0-2: פס המשתתפים בעץ מתחבר לנתונים אמיתיים (קריאה בלבד; כשל → נשאר הטקסט הקיים).
  (async () => {
    const cbParts = document.getElementById("cb-participants");
    const cbPred = document.getElementById("cb-predicted");
    if (!cbParts && !cbPred) return;
    const user = await authOrNull();
    if (!user) return;
    const tc = (param("t") || param("code")).toUpperCase() || DEFAULT_CODE;
    try {
      const dir = await getDocs(query(collection(db, "directory"), where("tournamentCode", "==", tc)));
      if (cbParts) cbParts.textContent = dir.size ? dir.size + " משתתפים" : "עדיין אין משתתפים";
      const flags = await getDocs(query(collection(db, "predicted_flags"), where("tournamentCode", "==", tc)));
      if (cbPred) cbPred.textContent = flags.size ? flags.size + " כבר ניחשו" : "עדיין אין ניחושים";
    } catch (e) { /* נשאר "עדיין אין נתונים" */ }
  })();

  (async () => {
    try {
      const data = await fetch("matches.json").then((r) => r.json());
      const ms = (data && data.matches) || [];
      bracketGrid.textContent = "";
      // P0-2: אין נתונים → טקסט מפורש, לא מסך ריק.
      if (!ms.length) {
        bracketGrid.appendChild(el("p", "muted", "עדיין אין נתונים"));
        return;
      }

      // תוצאות שמורות מהשרת (קריאה בלבד) — העץ משקף תוצאה קיימת, לא מחשב מנצחות מחדש.
      const sm = {};
      try {
        const user = await authOrNull();
        if (user) {
          const tc = (param("t") || param("code")).toUpperCase() || DEFAULT_CODE;
          const snap = await getDocs(query(collection(db, "matches"), where("tournamentCode", "==", tc)));
          snap.forEach((d) => { const x = d.data(); sm[x.matchId] = x; });
        }
      } catch (e) { /* בלי תוצאות שרת — placeholder כרגיל */ }
      const resultOf = (m) => {
        const s = sm[m.id] || {};
        if (s.status !== "finished" || s.homeScore == null || s.awayScore == null) return null;
        const h = Number(s.homeScore), a = Number(s.awayScore);
        // winner מתוך התוצאה השמורה בלבד: בתים לפי הציון, נוקאאוט לפי advancing.
        const winner = m.stage !== "group" ? (s.advancing || (h === a ? null : (h > a ? "home" : "away"))) : (h > a ? "home" : h < a ? "away" : null);
        return { h, a, winner, tie: h === a };
      };
      // שתי שורות תוצאה למשחק שהסתיים — מנצחת מודגשת עם 🏆; תיקו בנוקאאוט → הערה.
      const appendResultRows = (card, m, res) => {
        const teamRow = (side, name, score) => {
          const win = res.winner === side;
          const row = el("div", "t-row result" + (win ? " winner" : ""));
          row.appendChild(el("span", "rb-team", (win ? "🏆 " : "") + withFlag(name)));
          row.appendChild(el("span", "rb-score", String(score)));
          return row;
        };
        card.appendChild(teamRow("home", m.home, res.h));
        card.appendChild(teamRow("away", m.away, res.a));
        // הערת "הכרעה לא נקבעה" שייכת רק לנוקאאוט עם תיקו בלי advancing.
        // תיקו בשלב הבתים הוא תוצאה תקפה — בלי הערה ובלי 🏆.
        if (res.tie && !res.winner && m.stage !== "group") card.appendChild(el("div", "t-row tie-note", "הכרעה עדיין לא נקבעה"));
      };

      // עמודת שלב הבתים — 12 בתים אמיתיים עם 4 נבחרות
      const groups = {};
      ms.filter((m) => m.stage === "group").forEach((m) => {
        const g = groups[m.group] || (groups[m.group] = new Set());
        g.add(m.home); g.add(m.away);
      });
      const colGroups = el("section", "b-col");
      colGroups.appendChild(el("h2", "round-title", "שלב הבתים"));
      const groupMatches = {};
      ms.filter((m) => m.stage === "group").forEach((m) => { (groupMatches[m.group] = groupMatches[m.group] || []).push(m); });
      Object.keys(groups).sort().forEach((g) => {
        const card = el("div", "b-card open");
        card.appendChild(el("span", "dot", "🟢"));
        card.appendChild(el("div", "t-row", "בית " + g));
        [...groups[g]].forEach((t) => card.appendChild(el("div", "t-row tbd", withFlag(t))));
        // תוצאות שהסתיימו בבית — מוצגות מהשרת בלבד.
        const finishedInGroup = (groupMatches[g] || []).map((m) => [m, resultOf(m)]).filter(([, r]) => r);
        if (finishedInGroup.length) {
          card.appendChild(el("div", "t-row res-sep", "תוצאות"));
          finishedInGroup.forEach(([m, res]) => {
            const line = el("div", "g-result");
            appendResultRows(line, m, res);
            card.appendChild(line);
          });
        }
        colGroups.appendChild(card);
      });
      bracketGrid.appendChild(colGroups);

      // עמודות נוקאאוט — בלי "טרם נקבע": שלבים עמוקים מקבלים "מנצחת משחק X"
      // לפי זיווג סדרתי של מספרי המשחקים מהסיבוב הקודם (placeholder עד הגרלה בפועל).
      const KO = [["r32", "32 האחרונות", "🟡"], ["r16", "שמינית גמר", "⚪"], ["qf", "רבע גמר", "⚪"], ["sf", "חצי גמר", "⚪"], ["third", "מקום 3", "⚪"], ["final", "🏆 גמר", "⚪"]];
      const byStage = {};
      ms.forEach((m) => (byStage[m.stage] = byStage[m.stage] || []).push(m));
      Object.values(byStage).forEach((l) => l.sort((a, b) => a.id.localeCompare(b.id)));
      const FEED = { r16: "r32", qf: "r16", sf: "qf", final: "sf", third: "sf" };
      const mnum = (m) => String(Number(m.id.slice(1)));
      const slotLabel = (stage, i, side) => {
        const prev = byStage[FEED[stage]] || [];
        if (stage === "third") return "מפסידת משחק " + (prev[i * 2 + side] ? mnum(prev[i * 2 + side]) : "");
        const f = prev[i * 2 + side];
        return f ? "מנצחת משחק " + mnum(f) : "";
      };
      for (const [stage, title, dot] of KO) {
        const col = el("section", "b-col");
        col.appendChild(el("h2", "round-title", title));
        (byStage[stage] || []).forEach((m, i) => {
          const res = resultOf(m);
          const card = el("div", "b-card" + (stage === "final" ? " final" : "") + (res ? " finished" : ""));
          card.appendChild(el("span", "dot", res ? "🏁" : dot));
          if (res) {
            // משחק שהסתיים — תוצאה שמורה בלבד, בלי חישוב מנצחת מחדש.
            appendResultRows(card, m, res);
          } else {
            const homeLabel = m.home === "טרם נקבע" ? slotLabel(stage, i, 0) : withFlag(m.home);
            const awayLabel = m.away === "טרם נקבע" ? slotLabel(stage, i, 1) : withFlag(m.away);
            card.appendChild(el("div", "t-row tbd", homeLabel || m.home));
            card.appendChild(el("div", "t-row tbd", awayLabel || m.away));
          }
          col.appendChild(card);
        });
        bracketGrid.appendChild(col);
      }
    } catch (e) {
      bracketGrid.textContent = "";
      bracketGrid.appendChild(el("p", "error", "לא הצלחנו לטעון את הלוח."));
    }
  })();
}

// ===================== מסך תוצאות (results.html) — קריאה בלבד =====================
const resultsLiveEl = document.getElementById("results-live");
if (resultsLiveEl) {
  const code = (param("t") || param("code")).toUpperCase() || DEFAULT_CODE;
  const finalEl = document.getElementById("results-final");
  const lbEl = document.getElementById("results-leaderboard");
  const scoreLine = (m, sm) => {
    const s = sm[m.id] || {};
    const has = s.homeScore != null && s.awayScore != null;
    const isLive = s.status !== "finished" && Date.parse(m.kickoffAt) <= Date.now();
    const row = el("div", "result-row" + (isLive ? " live" : ""));
    row.appendChild(el("span", "rr-id", m.id));
    row.appendChild(el("span", "rr-teams", withFlag(m.home) + " — " + withFlag(m.away)));
    if (s.status === "finished" && has) row.appendChild(el("span", "rr-score", s.homeScore + " : " + s.awayScore));
    else if (isLive) row.appendChild(el("span", "rr-time live", "🔴 חי עכשיו"));
    else row.appendChild(el("span", "rr-time", fmtKickoff(m.kickoffAt)));
    return row;
  };
  (async () => {
    let matches = [];
    try { matches = ((await fetch("matches.json").then((r) => r.json())).matches) || []; }
    catch (e) { resultsLiveEl.textContent = ""; resultsLiveEl.appendChild(el("p", "error", "לא הצלחנו לטעון את הלוח.")); return; }
    matches.sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt));

    // סטטוסי תוצאה מהשרת (אם יש) — קריאה בלבד, ללא חישוב.
    const sm = {};
    const user = await authOrNull();
    if (user) {
      try {
        const snap = await getDocs(query(collection(db, "matches"), where("tournamentCode", "==", code)));
        snap.forEach((d) => { const x = d.data(); sm[x.matchId] = x; });
      } catch (e) { /* בלי תוצאות שרת — נשאר לפי לוח בלבד */ }
    }
    const nowMs = Date.now();
    const finished = matches.filter((m) => (sm[m.id] || {}).status === "finished");
    // חי/קרוב = לא הסתיים וגם בחלון [now - 2.5 שע', now + 72 שע'].
    // הגבול התחתון מונע ממשחקים ישנים שתוצאתם לא הוזנה להיתקע כאן (תוקן הבילבול).
    const LIVE_GRACE = 2.5 * 3600e3;
    const live = matches.filter((m) => {
      const t = Date.parse(m.kickoffAt);
      return (sm[m.id] || {}).status !== "finished" && t >= nowMs - LIVE_GRACE && t <= nowMs + 72 * 3600e3;
    });

    resultsLiveEl.textContent = "";
    if (!live.length) resultsLiveEl.appendChild(el("p", "muted", "אין משחקים קרובים"));
    else live.slice(0, 20).forEach((m) => resultsLiveEl.appendChild(scoreLine(m, sm)));

    // ניקוד — קריאה בלבד מ-scores הקיים, ללא חישוב חדש.
    // sum לטבלה + byMatch ל-breakdown + hits ("פגיעות" = ניחושים נכונים) לכל אדם.
    const byMatch = {};
    if (user) {
      try {
        const scrs = await getDocs(query(collection(db, "scores"), where("tournamentCode", "==", code)));
        const sum = {}, hits = {};
        scrs.forEach((d) => {
          const s = d.data();
          sum[s.displayName] = (sum[s.displayName] || 0) + (s.points || 0);
          if ((s.points || 0) > 0) hits[s.displayName] = (hits[s.displayName] || 0) + 1;
          (byMatch[s.matchId] = byMatch[s.matchId] || []).push({ name: s.displayName, points: s.points || 0 });
        });
        // כל מי שניחש מופיע בטבלה — גם מי שעדיין 0 (ניחש רק משחקים עתידיים).
        (await fetchPredictorNames(code)).forEach((n) => { if (!(n in sum)) sum[n] = 0; });
        if (lbEl && Object.keys(sum).length) {
          lbEl.textContent = "";
          Object.entries(sum)
            .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "he"))
            .forEach(([name, pts], i) => {
              const row = el("div", "participant");
              row.appendChild(el("span", "p-icon", pts > 0 && i === 0 ? "🥇" : pts > 0 && i === 1 ? "🥈" : pts > 0 && i === 2 ? "🥉" : "•"));
              row.appendChild(el("span", "p-name", name));
              const cnt = el("span", "p-count", pts + " נק'");
              const hc = hits[name] || 0; cnt.appendChild(el("span", "p-hits", " · " + hc + (hc === 1 ? " ניחוש נכון" : " ניחושים נכונים")));
              row.appendChild(cnt);
              lbEl.appendChild(row);
            });
        }
      } catch (e) { /* אין טבלה עדיין */ }
    }

    // הסבר ניקוד — ליד טבלת הניקוד, דינמי מ-scoring-config.
    const helpEl = document.getElementById("scoring-help");
    if (helpEl) { const S = await loadScoring(); helpEl.textContent = ""; helpEl.appendChild(scoringHelpEl(S)); }

    // משחקים שהסתיימו: תוצאה + breakdown ניקוד (אם קיים). ללא חישוב חדש.
    if (finalEl) {
      finalEl.textContent = "";
      if (!finished.length) { finalEl.appendChild(el("p", "muted", "עדיין אין תוצאות סופיות")); }
      else finished.forEach((m) => {
        const block = el("div", "final-block");
        block.appendChild(scoreLine(m, sm));
        const brk = byMatch[m.id];
        if (brk && brk.length) {
          const line = el("div", "score-breakdown");
          line.appendChild(el("span", "sb-lead", "🏆 ניקוד: "));
          brk.sort((a, b) => b.points - a.points).forEach((x) => {
            line.appendChild(el("span", "sb-item", x.name + " +" + x.points));
          });
          block.appendChild(line);
        } else {
          block.appendChild(el("div", "score-breakdown muted", "המשחק הסתיים • ניקוד עודכן"));
        }
        finalEl.appendChild(block);
      });
    }

    // קישור עץ — נושא את קוד הטורניר
    const brLink = document.getElementById("results-bracket-link");
    if (brLink) brLink.href = "bracket.html?t=" + encodeURIComponent(code);
  })();
}

// ===================== מסך בית (home.html) =====================
const homeActions = document.querySelector(".home-actions");
if (homeActions) {
  const code = (param("t") || param("code")).toUpperCase();
  const q = code ? "?code=" + encodeURIComponent(code) : "";
  const qt = code ? "?t=" + encodeURIComponent(code) : "";
  const set = (id, href) => { const a = document.getElementById(id); if (a) a.href = href; };
  set("go-predict", "index.html" + q);
  set("go-bracket", "bracket.html" + qt);
  set("go-instructions", "instructions.html" + q);

  // 🔥 המשחקים הבאים — רק מה שעוד לא שוחק ועוד לא הסתיים. בלי תוצאות/היסטוריה/ניקוד.
  (async () => {
    const sec = document.getElementById("next-matches");
    const rowsEl = document.getElementById("next-matches-rows");
    if (!sec || !rowsEl) return;
    let matches = [];
    try { matches = ((await fetch("matches.json").then((r) => r.json())).matches) || []; }
    catch (e) { return; }
    // סטטוס תוצאה מהשרת — כדי לא להציג משחק שכבר הסתיים (קריאה בלבד).
    const sm = {};
    try {
      const user = await authOrNull();
      if (user) {
        const tc = code || DEFAULT_CODE;
        const snap = await getDocs(query(collection(db, "matches"), where("tournamentCode", "==", tc)));
        snap.forEach((d) => { const x = d.data(); sm[x.matchId] = x; });
      }
    } catch (e) { /* בלי סטטוס שרת — מסתמכים על kickoff בלבד */ }
    const nowMs = Date.now();
    // "עכשיו ומה בא": לא להסתמך רק על זמן — משחק חי (התחיל ועוד לא הסתיים) נשאר.
    // מציגים אם status != finished וגם kickoff בתוך חלון [now - 2.5 שע', ∞).
    // החלון מונע ממשחק ישן שתוצאתו טרם הוזנה להישאר תקוע לנצח.
    const LIVE_GRACE = 2.5 * 3600e3;
    const upcoming = matches
      .filter((m) => (sm[m.id] || {}).status !== "finished" && Date.parse(m.kickoffAt) >= nowMs - LIVE_GRACE)
      .sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt))
      .slice(0, 8);
    rowsEl.textContent = "";
    if (!upcoming.length) {
      rowsEl.appendChild(el("p", "muted", "אין משחקים קרובים"));
    } else {
      upcoming.forEach((m) => {
        const live = Date.parse(m.kickoffAt) <= nowMs;
        const row = el("div", "next-match" + (live ? " live" : ""));
        const time = el("div", "nm-time", fmtKickoff(m.kickoffAt));
        if (live) time.appendChild(el("span", "nm-live", " · 🔴 חי עכשיו"));
        row.appendChild(time);
        row.appendChild(el("div", "nm-teams", withFlag(m.home) + " – " + withFlag(m.away)));
        rowsEl.appendChild(row);
      });
    }
    sec.hidden = false;
  })();

  // מוני לכידות + טבלת ניקוד — קריאה בלבד. בלי נתון → "עדיין אין נתונים".
  (async () => {
    resetScreenState(); // לפני hydrate של מוני הבית והרשימות
    const user = await authOrNull();
    if (!user) return;
    const tc = code || DEFAULT_CODE;
    try {
      const dir = await getDocs(query(collection(db, "directory"), where("tournamentCode", "==", tc)));
      if (dir.size === 0) {
        document.querySelector(".home-stats").textContent = "עדיין לא נרשמו משתתפים";
      } else {
        document.getElementById("hs-registered").textContent = String(dir.size) + " משתתפים";
        try {
          const flags = await getDocs(query(collection(db, "predicted_flags"), where("tournamentCode", "==", tc)));
          document.getElementById("hs-predicted").textContent = String(flags.size);
          document.getElementById("hs-not-predicted").textContent = String(Math.max(0, dir.size - flags.size));
        } catch (e) { /* נשאר "עדיין אין נתונים" */ }
      }
    } catch (e) { /* נשאר "עדיין אין נתונים" */ }

    // FAMILY LEARNING MODE: ✨ ניחושים שתוקנו בעזרת מבוגר — חיווי חיובי.
    // נראה רק למי שה-rules מתירים לו לקרוא predictions (מנהל / אחרי שריקה).
    try {
      const preds = await getDocs(query(collection(db, "predictions"), where("tournamentCode", "==", tc)));
      let helped = 0;
      preds.forEach((d) => { if (d.data().updatedBy) helped++; });
      if (helped > 0) {
        const statsEl = document.querySelector(".home-stats");
        if (statsEl) statsEl.appendChild(el("div", "home-stat helped-stat", "🧑‍🧒 " + helped + " ניחושים עודכנו על ידי מבוגר"));
      }
    } catch (e) { /* אין הרשאת קריאה — מדלגים בשקט */ }

    // 👥 מי בפנים — שמות וסטטוס בלבד, לעולם לא ניחושים.
    // participants קריא רק למשתתפים מאושרים; join_requests רק למנהלים — מציגים מה שנגיש.
    // P0-6: צופה שאינו מאושר עדיין רואה את הרשימה דרך directory (שמות בלבד, קריא לכל מחובר).
    const renderPeople = (rowsEl, list) => {
      list.sort((a, b) => (b.isAdmin === true) - (a.isAdmin === true) || String(a.displayName || "").localeCompare(String(b.displayName || ""), "he"));
      list.forEach((p) => {
        const name = p.displayName || "";
        const row = el("div", "participant");
        row.appendChild(el("span", "p-icon", p.isAdmin ? "👑" : "🟢"));
        row.appendChild(el("span", "p-name", name + (p.isAdmin ? " — מנהל" : "")));
        rowsEl.appendChild(row);
      });
    };
    try {
      const parts = await getDocs(query(collection(db, "participants"), where("tournamentCode", "==", tc)));
      const rowsEl = document.getElementById("home-people-rows");
      rowsEl.textContent = "";
      const list = [];
      parts.forEach((d) => list.push(d.data()));
      renderPeople(rowsEl, list);
      try {
        const reqs = await getDocs(query(collection(db, "join_requests"), where("tournamentCode", "==", tc)));
        reqs.forEach((d) => {
          const r = d.data();
          if (r.status !== "pending") return;
          const row = el("div", "participant");
          row.appendChild(el("span", "p-icon", "⏳"));
          row.appendChild(el("span", "p-name", r.displayName + " — ממתין לאישור"));
          rowsEl.appendChild(row);
        });
      } catch (e) { /* לא מנהל — בלי ממתינים */ }
      if (list.length) document.getElementById("home-people").hidden = false;
    } catch (e) {
      // צופה לא מאושר: fallback לרשימת שמות מ-directory. שמות בלבד — אפס ניחושים/סטטוס רגיש.
      try {
        const dir2 = await getDocs(query(collection(db, "directory"), where("tournamentCode", "==", tc)));
        const list = [];
        dir2.forEach((d) => {
          const pid = String(d.data().participantId || d.id);
          const name = pid.includes("__") ? pid.split("__").slice(1).join("__") : pid;
          if (name) list.push({ displayName: name, isAdmin: isFixedAdmin(name) });
        });
        if (list.length) {
          const rowsEl = document.getElementById("home-people-rows");
          rowsEl.textContent = "";
          renderPeople(rowsEl, list);
          document.getElementById("home-people").hidden = false;
        }
      } catch (e2) { /* גם directory חסום — הרשימה נשארת מוסתרת */ }
    }
    try {
      const scrs = await getDocs(query(collection(db, "scores"), where("tournamentCode", "==", tc)));
      const sum = {}, hits = {};
      scrs.forEach((d) => {
        const s = d.data();
        sum[s.displayName] = (sum[s.displayName] || 0) + (s.points || 0);
        if ((s.points || 0) > 0) hits[s.displayName] = (hits[s.displayName] || 0) + 1;
      });
      // כל מי שניחש מופיע בטבלה — גם מי שעדיין 0.
      (await fetchPredictorNames(tc)).forEach((n) => { if (!(n in sum)) sum[n] = 0; });
      if (Object.keys(sum).length) {
        const rowsEl = document.getElementById("leaderboard-rows");
        rowsEl.textContent = "";
        Object.entries(sum)
          .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "he"))
          .forEach(([name, pts], i) => {
            const row = el("div", "participant");
            row.appendChild(el("span", "p-icon", pts > 0 && i === 0 ? "🥇" : pts > 0 && i === 1 ? "🥈" : pts > 0 && i === 2 ? "🥉" : "•"));
            row.appendChild(el("span", "p-name", name));
            const cnt = el("span", "p-count", pts + " נק'");
            const hc = hits[name] || 0; cnt.appendChild(el("span", "p-hits", " · " + hc + (hc === 1 ? " ניחוש נכון" : " ניחושים נכונים")));
            row.appendChild(cnt);
            rowsEl.appendChild(row);
          });
        // הסבר ניקוד מתחת לטבלה בבית
        const lb = document.getElementById("leaderboard");
        if (lb && !lb.querySelector(".scoring-help")) { const S = await loadScoring(); lb.appendChild(scoringHelpEl(S)); }
        lb.hidden = false;
      }
    } catch (e) { /* אין טבלה עדיין */ }
  })();
}

// ===================== מסך כניסה (index.html) =====================
const loginForm = document.getElementById("login-form");
if (loginForm) {
  const nameInput = document.getElementById("name");
  const passInput = document.getElementById("password");
  const stepName = document.getElementById("step-name");
  const stepPass = document.getElementById("step-password");
  const helloEl = document.getElementById("hello-name");
  const errorEl = document.getElementById("error");
  const noLinkEl = document.getElementById("no-link");
  const bannerEl = document.getElementById("tournament-banner");
  const bannerCode = document.getElementById("tournament-code");

  // טורניר יחיד קבוע: אם אין קוד ב-URL — משתמשים בברירת המחדל ומאפשרים כניסה.
  const urlCode = (param("t") || param("code")).toUpperCase() || DEFAULT_CODE;
  if (getName()) nameInput.value = getName();
  bannerCode.textContent = urlCode;
  bannerEl.hidden = false;

  (async () => {
    const user = await authOrNull();
    const { sig, derived } = await loadState(urlCode || "__none__", user ? user.uid : null);
    renderStatusBar(barEl, derived, sig);
  })();

  const showError = (m) => { errorEl.textContent = m; errorEl.hidden = false; };
  const showPasswordStep = (name) => {
    stepName.hidden = true;
    stepPass.hidden = false;
    helloEl.textContent = "שלום " + name;
    passInput.focus();
  };

  let phase = "name"; // name → password
  let foundPartId = null; // string=מזהה / false=אין / null=לא ידוע — מ-directory בלבד

  // קישור "בחר סיסמה חדשה" (אחרי איפוס / אישור) — נחשף רק בכישלון אימות
  const setpassLink = document.createElement("a");
  setpassLink.className = "admin-link";
  setpassLink.textContent = "אושרת עכשיו או שהסיסמה אופסה? בחרו סיסמה חדשה";
  setpassLink.hidden = true;
  errorEl.after(setpassLink);

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const name = nameInput.value.trim();
    const code = urlCode || DEFAULT_CODE;
    if (name.length < 2) return showError("נא להזין שם מלא (לפחות 2 תווים).");
    setName(name);

    // ---- שלב סיסמה ----
    if (phase === "password") {
      const pass = passInput.value;
      if (!pass) return showError("נא להזין סיסמה.");
      const hash = await sha256Hex(pass);
      const user = await authOrNull();
      const u = user ? user.uid : null;
      if (!u) return showError("לא הצלחנו להתחבר לטורניר. נסו שוב.");

      // --- מנהל: לעולם לא לפי שם בלבד ---
      if (isFixedAdmin(name)) {
        // BOOTSTRAP GUARD: unknown/error ≠ bootstrap. חסימה.
        if (foundPartId === null) return showError("לא הצלחנו להתחבר לטורניר. נסו שוב.");

        if (typeof foundPartId === "string") {
          // יש רשומה בשרת — verify-by-write הוא המקור היחיד.
          try {
            await loginVerifyWrite(foundPartId, hash, u);
            sessionStorage.setItem(ADMIN_SESSION_KEY, name);
            resetScreenState(); // אחרי login — מסך נקי למשתמש הנכנס
            return goPredictions(code);
          } catch (e) {
            // אולי כניסה ראשונה (cred ריק) עם הסיסמה הזמנית → בחירת סיסמה חדשה.
            if (hash === ADMIN_PASS_SHA256[name]) {
              sessionStorage.setItem("mondial2026.setpassFor", foundPartId);
              return (location.href = "set-password.html?t=" + encodeURIComponent(code));
            }
            // מנהל בלי bootstrap (למשל דוד יוני): בחירת סיסמה ראשונה דרך הקישור.
            // ה-rules מתירים set רק כשה-hash בשרת באמת ריק — אין סיכון השתלטות.
            setpassLink.href = "set-password.html?t=" + encodeURIComponent(code);
            setpassLink.hidden = false;
            return showError("שם או סיסמה שגויים.");
          }
        }
        // foundPartId === false: מאומת שאין רשומת מנהל בשרת (seed חסר).
        if (hash === ADMIN_PASS_SHA256[name]) {
          return showError("חשבון המנהל טרם הוקם בשרת (חסר seed). פנו למקים המערכת.");
        }
        return showError("שם או סיסמה שגויים.");
      }

      // --- משתתף חוזר: verify-by-write. הלקוח לא קורא hash לעולם. ---
      if (typeof foundPartId !== "string") return showError("לא הצלחנו להתחבר לטורניר. נסו שוב.");
      try {
        await loginVerifyWrite(foundPartId, hash, u);
        setPartSession({ name: name, participantId: foundPartId });
        resetScreenState(); // אחרי login — מסך נקי למשתמש הנכנס
        return goPredictions(code);
      } catch (e) {
        // אותה הודעה לכל כישלון — בלי enumeration.
        setpassLink.href = "set-password.html?t=" + encodeURIComponent(code);
        setpassLink.hidden = false;
        return showError("שם או סיסמה שגויים.\nשכחת סיסמה? פנה למנהל");
      }
    }

    // ---- שלב שם ----
    try { await authReady; } catch (e) { return showError("לא הצלחנו להתחבר לטורניר."); }

    // איתור directory בלבד (שם → מזהה). אפס מידע רגיש.
    foundPartId = await directoryLookup(code, name);

    if (isFixedAdmin(name)) {
      phase = "password";
      return showPasswordStep(name);
    }

    if (typeof foundPartId === "string") {
      // משתתף קיים → סיסמה. (אושר-עכשיו מגיע לבחירת סיסמה דרך מסך ההמתנה.)
      phase = "password";
      return showPasswordStep(name);
    }
    if (foundPartId === null) return showError("לא הצלחנו להתחבר לטורניר. נסו שוב.");

    // אין רשומה → משתמש חדש: בקשת הצטרפות → המתנה.
    const user = await authOrNull();
    const uid = user ? user.uid : null;
    if (!uid) return showError("לא הצלחנו להתחבר לטורניר.");
    try {
      await setDoc(reqRef(code, uid), {
        tournamentCode: code, uid, displayName: name, status: "pending", createdAt: serverTimestamp(),
      });
    } catch (e2) { /* בקשה כבר קיימת או חיבור חסום — מסך ההמתנה יציג מצב */ }
    return goPending(code);
  });
}

// ===================== בחירת סיסמה (set-password.html) =====================
const setpassForm = document.getElementById("setpass-form");
if (setpassForm) {
  const code = param("t").toUpperCase() || DEFAULT_CODE;
  const p1 = document.getElementById("pass1");
  const p2 = document.getElementById("pass2");
  const errorEl = document.getElementById("error");
  const showError = (m) => { errorEl.textContent = m; errorEl.hidden = false; };
  if (!getName()) location.href = "index.html?t=" + encodeURIComponent(code);

  setpassForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    if (p1.value.length < 6) return showError("סיסמה קצרה מדי (לפחות 6 תווים).");
    if (p1.value !== p2.value) return showError("הסיסמאות לא תואמות.");
    const hash = await sha256Hex(p1.value);

    // נשמר בשרת בלבד (hash, לא סיסמה גלויה). ה-rules מתירים רק כש-hash==null או mustReset.
    let partId = sessionStorage.getItem("mondial2026.setpassFor") || "";
    if (!partId) {
      const found = await directoryLookup(code, getName());
      if (typeof found === "string") partId = found;
    }
    if (!partId) return showError("לא הצלחנו להתחבר לטורניר. נסו שוב.");

    const user = await authOrNull();
    const u = user ? user.uid : null;
    if (!u) return showError("לא הצלחנו להתחבר לטורניר. נסו שוב.");

    try {
      await setPasswordWrite(partId, hash, u);
    } catch (e) {
      return showError("השמירה נדחתה. ייתכן שכבר נקבעה סיסמה — נסו להיכנס, או פנו למנהל.");
    }
    sessionStorage.removeItem("mondial2026.setpassFor");
    if (isFixedAdmin(getName())) sessionStorage.setItem(ADMIN_SESSION_KEY, getName());
    else setPartSession({ name: getName(), participantId: partId });
    goPredictions(code);
  });
}

// מנותק מה-UI בהחלטת מוצר (2026-06-10): יצירת טורניר נעשית ידנית ע"י בעל המערכת בלבד.
// הקוד נשמר לשימוש ידני/עתידי ואינו נקרא משום מקום.
async function createTournament_DISABLED_manualOnly(code, uid, name) {
  await setDoc(doc(db, "tournaments", code), {
    code, name: "מונדיאל 2026", createdByUid: uid, createdAt: serverTimestamp(),
  });
  await setDoc(partRef(code, uid), {
    tournamentCode: code, uid, displayName: name, isAdmin: true, status: "approved", joinedAt: serverTimestamp(),
  });
}

// ===================== מסך ממתין (pending.html) =====================
const pendingEl = document.getElementById("pending");
if (pendingEl) {
  const code = param("t").toUpperCase();
  const name = getName();
  const msgEl = document.getElementById("pending-msg");
  if (!code || !name) location.href = "index.html";
  (async () => {
    const user = await authOrNull();
    const uid = user ? user.uid : null;
    let timer = null;
    const refresh = async () => {
      const { sig, derived } = await loadState(code, uid);
      renderStatusBar(barEl, derived, sig);
      if (msgEl) msgEl.textContent = derived.statusText;
      // אושרתי? מופיע ב-directory → בחירת סיסמה ראשונה.
      const pid = await directoryLookup(code, name);
      if (typeof pid === "string") {
        if (timer) clearInterval(timer);
        sessionStorage.setItem("mondial2026.setpassFor", pid);
        location.href = "set-password.html?t=" + encodeURIComponent(code);
      }
    };
    await refresh();
    timer = setInterval(refresh, 4000);
  })();
}

// ===================== מסך מנהל (admin.html) =====================
const adminEl = document.getElementById("admin");
if (adminEl) {
  const code = param("t").toUpperCase() || DEFAULT_CODE;
  const pendingList = document.getElementById("pending-list");
  const partList = document.getElementById("part-list");
  const statusEl = document.getElementById("admin-status");
  const showMsg = (text, cls) => { statusEl.textContent = text; statusEl.className = cls; statusEl.hidden = false; };
  const clearLists = () => { pendingList.textContent = ""; partList.textContent = ""; };

  // חיווי מנהל ליד השם — רק אחרי אימות סיסמה.
  if (isAdminSession()) {
    const h1 = adminEl.querySelector("h1");
    if (h1) h1.textContent = "מסך ניהול — " + getName() + " 👑 מנהל";
  }

  // מסך ניהול — רק עם session מנהל מאומת (שם בלבד אינו מספיק).
  if (!isAdminSession()) {
    clearLists();
    showMsg("מסך הניהול זמין למנהלי הטורניר בלבד.", "disabled-note");
  } else if (!getStoredAdmins() && getName() === "אלעד") {
    // אתחול חד-פעמי: אין עדיין מנהלים מוגדרים ואלעד נכנס → מסך ההגדרה.
    location.href = "setup-admins.html?t=" + encodeURIComponent(code);
  } else (async () => {
    const user = await authOrNull();
    const uid = user ? user.uid : null;
    const { derived } = await loadState(code, uid);
    renderStatusBar(barEl, derived);

    if (!derived.canAccessAdmin) {
      clearLists();
      showMsg(
        derived.state === STATES.UNKNOWN ? "לא הצלחנו להתחבר. הרשימות יטענו כשהחיבור יחזור." : "מסך הניהול ממתין לאישור החיבור — " + derived.statusText,
        derived.state === STATES.UNKNOWN ? "conn-error" : "disabled-note"
      );
      return;
    }

    // אישור: participant (לפי nameKey) + cred ריק + רשומת directory, ומחיקת הבקשה.
    const approve = async (r) => {
      const pid = code + "__" + nameKey(r.displayName);
      await setDoc(doc(db, "participants", pid), {
        tournamentCode: code, displayName: r.displayName, nameKey: nameKey(r.displayName),
        isAdmin: false, status: "approved", joinedAt: serverTimestamp(), uids: [],
      });
      await setDoc(credRef(pid), { passwordHash: null, mustReset: false, lastLoginAt: null, uids: [] });
      await setDoc(doc(db, "directory", pid), { participantId: pid, tournamentCode: code });
      await deleteDoc(reqRef(code, r.uid));
    };
    const reject = (r) => deleteDoc(reqRef(code, r.uid));
    const removePart = (p) => deleteDoc(doc(db, "participants", p.id));

    onSnapshot(query(collection(db, "join_requests"), where("tournamentCode", "==", code)), (snap) => {
      pendingList.textContent = "";
      const reqs = []; snap.forEach((d) => { const r = d.data(); if (r.status === "pending") reqs.push(r); });
      if (!reqs.length) { pendingList.appendChild(el("p", "muted", "אין בקשות ממתינות.")); return; }
      reqs.forEach((r) => {
        const row = el("div", "admin-row");
        row.appendChild(el("span", "p-name", r.displayName));
        const ok = el("button", "mini", "אשר"); ok.onclick = () => approve(r);
        const no = el("button", "mini secondary", "דחה"); no.onclick = () => reject(r);
        row.appendChild(ok); row.appendChild(no); pendingList.appendChild(row);
      });
    });
    onSnapshot(query(collection(db, "participants"), where("tournamentCode", "==", code)), (snap) => {
      partList.textContent = "";
      const parts = []; snap.forEach((d) => parts.push({ id: d.id, ...d.data() }));
      parts.sort((a, b) => (b.isAdmin === true) - (a.isAdmin === true));
      parts.forEach((p) => {
        const row = el("div", "admin-row");
        row.appendChild(el("span", "p-name", p.displayName + (p.isAdmin ? " ⭐" : "")));
        // אין "קדם למנהל" — מנהלים מוגדרים מראש בלבד (החלטת מוצר 2026-06-10).
        // איפוס סיסמה: passwordHash=null + mustReset=true ב-cred → בחירת סיסמה חדשה.
        const rp = el("button", "mini", "🔑 אפס סיסמה");
        rp.onclick = () => updateDoc(credRef(p.id), { passwordHash: null, mustReset: true }).catch(() => {});
        row.appendChild(rp);
        if (p.nameKey !== nameKey(getName())) { const rm = el("button", "mini secondary", "הסר"); rm.onclick = () => removePart(p); row.appendChild(rm); }
        partList.appendChild(row);
      });
    });

    // ===== תוצאות אמת + חישוב ניקוד (V1) =====
    const { SCORING } = await import("./scoring-config.js");
    const resBlock = document.getElementById("results-block");
    const exportBlock = document.getElementById("export-block");
    if (resBlock) resBlock.hidden = false;
    if (exportBlock) exportBlock.hidden = false;

    const matchesData = await fetch("matches.json").then((r) => r.json()).then((d) => d.matches || []);
    const byId = Object.fromEntries(matchesData.map((m) => [m.id, m]));
    const sel = document.getElementById("res-match");
    const advRow = document.getElementById("res-adv-row");
    const openOnly = document.getElementById("res-open-only");

    // סטטוס תוצאה מהשרת — כדי לסנן משחקים שכבר קיבלו תוצאה (לא להזין פעמיים).
    const resStatus = {};
    try {
      const snap = await getDocs(query(collection(db, "matches"), where("tournamentCode", "==", code)));
      snap.forEach((d) => { const x = d.data(); resStatus[x.matchId] = x; });
    } catch (e) { /* בלי סטטוס שרת — מציגים הכול */ }
    // "סגור" = status finished, או יש תוצאה (שני הציונים קיימים).
    const hasResult = (m) => { const s = resStatus[m.id] || {}; return s.status === "finished" || (s.homeScore != null && s.awayScore != null); };

    const optLabel = (m) => m.id + " · "
      // P0-3: אסור undefined ב-UI — לכל שדה חסר יש טקסט מפורש.
      + (m.stage === "group" ? "בית " + (m.group || "?") : (STAGE_HE[m.stage] || "שלב לא ידוע"))
      + " · " + (m.home || "טרם נקבע") + " — " + (m.away || "טרם נקבע")
      + (hasResult(m) ? " · ✅ יש תוצאה" : "");
    const populateResMatch = () => {
      const prev = sel.value;
      const list = (openOnly && openOnly.checked) ? matchesData.filter((m) => !hasResult(m)) : matchesData;
      sel.textContent = "";
      if (!list.length) {
        const o = document.createElement("option");
        o.value = ""; o.textContent = "אין משחקים פתוחים — לכולם יש תוצאה";
        sel.appendChild(o);
        return;
      }
      list.forEach((m) => {
        const o = document.createElement("option");
        o.value = m.id; o.textContent = optLabel(m);
        sel.appendChild(o);
      });
      if (prev && list.some((m) => m.id === prev)) sel.value = prev;
    };
    populateResMatch();
    if (openOnly) openOnly.addEventListener("change", () => { populateResMatch(); syncResForm(); });
    const syncResForm = () => {
      const m = byId[sel.value];
      if (!m) { advRow.hidden = true; return; }
      document.getElementById("res-home-name").textContent = withFlag(m.home);
      document.getElementById("res-away-name").textContent = withFlag(m.away);
      // P0-4: בנוקאאוט "מי עלתה" מציג את שמות הנבחרות, לא "בית"/"חוץ".
      const advHome = document.getElementById("res-adv-home-label");
      const advAway = document.getElementById("res-adv-away-label");
      if (advHome) advHome.textContent = " " + (m.home || "טרם נקבע");
      if (advAway) advAway.textContent = " " + (m.away || "טרם נקבע");
      advRow.hidden = m.stage === "group";
    };
    sel.addEventListener("change", syncResForm);
    syncResForm();

    // winner: בתים → לפי תוצאה; נוקאאוט → מי שעלתה (חובה בתיקו)
    const winnerOf = (m, h, a, adv) => {
      if (m.stage !== "group") return h === a ? adv : (h > a ? "home" : "away");
      return h > a ? "home" : h < a ? "away" : "draw";
    };
    const POINTS = { home: SCORING.HOME, draw: SCORING.DRAW, away: SCORING.AWAY };

    // חישוב ניקוד למשחק — דטרמיניסטי: אותה תוצאה → אותם ניקודים (setDoc idempotent)
    const computeScores = async (mid, winner) => {
      const preds = await getDocs(query(collection(db, "predictions"),
        where("tournamentCode", "==", code), where("matchId", "==", mid)));
      // אותו אדם עלול לנחש מכמה מכשירים: מסמך predictions נפרד לכל ownerUid, אבל
      // אותו participantId. לכן מקבצים לפי זהות המשתתף ובוחרים את הניחוש האחרון בזמן —
      // אחרת הניקוד תלוי בסדר שרירותי של התוצאות כשהמכשירים סותרים.
      const latest = new Map();
      preds.forEach((d) => {
        const p = d.data();
        // מפתח לפי participantId (זהות יציבה) — מונע התנגשות כשכמה אנשים חולקים ownerUid.
        const key = p.participantId || p.ownerUid;
        const ts = millis(p.updatedAt) || millis(p.createdAt) || 0;
        const cur = latest.get(key);
        if (!cur || ts >= cur.ts) latest.set(key, { p, ts });
      });
      let n = 0;
      for (const [key, { p }] of latest) {
        const pts = p.pick === winner ? POINTS[winner] : 0;
        await setDoc(doc(db, "scores", code + "__" + mid + "__" + key), {
          tournamentCode: code, matchId: mid, ownerUid: p.ownerUid, participantId: p.participantId || null,
          displayName: p.displayName, pick: p.pick || null, points: pts,
          computedAt: serverTimestamp(),
        });
        n++;
      }
      return n;
    };

    document.getElementById("res-save").addEventListener("click", async () => {
      const status = document.getElementById("res-status");
      const m = byId[sel.value];
      const h = Number(document.getElementById("res-home").value);
      const a = Number(document.getElementById("res-away").value);
      const adv = document.querySelector('input[name="res-adv"]:checked')?.value || null;
      if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) { status.textContent = "תוצאה לא תקינה."; return; }
      if (m.stage !== "group" && h === a && !adv) { status.textContent = "בנוקאאוט עם תיקו חובה לסמן מי עלתה."; return; }
      status.textContent = "שומר…";
      try {
        await updateDoc(doc(db, "matches", code + "__" + m.id), {
          homeScore: h, awayScore: a, advancing: m.stage === "group" ? null : (adv || (h > a ? "home" : "away")), status: "finished",
        });
        const winner = winnerOf(m, h, a, adv);
        const n = await computeScores(m.id, winner);
        status.textContent = "נשמר. תוצאה " + h + ":" + a + " · ניקוד חושב ל-" + n + " ניחושים.";
        // המשחק קיבל תוצאה — לעדכן את המצב המקומי ולרענן את הרשימה (כדי שלא יוצג שוב כפתוח).
        resStatus[m.id] = { matchId: m.id, status: "finished", homeScore: h, awayScore: a };
        populateResMatch(); syncResForm();
      } catch (e) { status.textContent = "שמירה נכשלה: " + (e.code || ""); }
    });

    // ===== 🎯 הימורים חיים (סבב UX) — מנהל בלבד, קריאה בלבד =====
    // לפני kickoff רק מנהל רואה את התוכן (rules); משתתפים רואים רק הימר/לא-הימר.
    (() => {
      const block = document.getElementById("bets-block");
      if (!block) return;
      block.hidden = false;
      const rowsEl = document.getElementById("bets-rows");
      const sumEl = document.getElementById("bets-summary");
      const scopeSel = document.getElementById("bets-scope");
      const partSel = document.getElementById("bets-participant");
      let partsList = [];   // [{displayName,isAdmin}]
      let predsList = [];   // raw predictions

      const pickLabel = (m, pick) => {
        if (!pick) return "";
        if (m.stage === "group") return { home: "בית", draw: "תיקו", away: "חוץ" }[pick] || pick;
        return pick === "home" ? m.home : m.away;
      };
      const guessLabel = (p) => (p && p.guessHome != null && p.guessAway != null) ? p.guessHome + ":" + p.guessAway : "—";
      const fmtUpd = (p) => (p && p.updatedAt && p.updatedAt.seconds)
        ? new Date(p.updatedAt.seconds * 1000).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

      const render = () => {
        const nowMs = Date.now();
        const scope = scopeSel.value;
        const who = partSel.value;
        const predByKey = {};
        predsList.forEach((p) => { predByKey[p.matchId + "__" + p.displayName] = p; });
        let ms = matchesData.slice().sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt));
        if (scope === "upcoming") {
          ms = ms.filter((m) => { const t = Date.parse(m.kickoffAt); return t > nowMs - 3 * 3600e3 && t < nowMs + 72 * 3600e3; });
        }
        const people = partsList.filter((p) => !who || p.displayName === who);
        rowsEl.textContent = "";
        let done = 0, missing = 0, lockedMatches = new Set();
        const frag = document.createDocumentFragment();
        let helpedCount = 0;
        for (const m of ms) {
          const locked = nowMs >= Date.parse(m.kickoffAt);
          if (locked) lockedMatches.add(m.id);
          for (const person of people) {
            const p = predByKey[m.id + "__" + person.displayName];
            const status = p ? (p.updatedBy ? "🟢 הימר 🧑‍🧒" : "🟢 הימר") : (locked ? "🔒 נעול" : "⚪ חסר");
            if (p) done++; else missing++;
            if (p && p.updatedBy) helpedCount++;
            if (scope === "missing" && p) continue;
            const tr = document.createElement("tr");
            if (!p && !locked) tr.className = "bets-missing";
            const cells = [
              m.id + " · " + m.home + "—" + m.away,
              fmtKickoff(m.kickoffAt),
              person.displayName,
              status,
              p ? pickLabel(m, p.pick) : "—",
              p ? guessLabel(p) : "—",
              fmtUpd(p),
            ];
            for (const c of cells) { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); }
            frag.appendChild(tr);
          }
        }
        rowsEl.appendChild(frag);
        if (!rowsEl.children.length) {
          const tr = document.createElement("tr");
          const td = el("td", "muted", "אין שורות בתצוגה הזו");
          td.colSpan = 7; tr.appendChild(td); rowsEl.appendChild(tr);
        }
        sumEl.textContent = "";
        const chips = [["👥 משתתפים", people.length], ["🟢 השלימו", done], ["⚪ חסרים", missing], ["🔒 נעולים", lockedMatches.size]];
        if (helpedCount) chips.push(["🧑‍🧒 על ידי מבוגר", helpedCount]);
        chips.forEach(([label, n]) => sumEl.appendChild(el("span", "bets-chip", label + ": " + n)));
      };

      // ===== FAMILY ADMIN: 🛠 עריכת ניחושים + 📝 היסטוריית תיקונים =====
      // עצמאי לחלוטין: מנהל מתקן מהמסך, בלי Firestore ידני. audit כפוי ב-rules.
      const editBlock = document.getElementById("edit-bets-block");
      const auditBlock = document.getElementById("audit-block");
      const editRows = document.getElementById("edit-rows");
      const auditRows = document.getElementById("audit-rows");
      const editSearch = document.getElementById("edit-search");
      const editStage = document.getElementById("edit-stage");
      const editState = document.getElementById("edit-state");
      if (editBlock) editBlock.hidden = false;
      if (auditBlock) auditBlock.hidden = false;
      let openEditRow = null;
      let partUidByName = {}; // לשחזור (יצירה בשם ילד): uid מתוך פרופיל המשתתף

      // עורך ייעודי ברוחב מלא (UX redesign). מחליף את הרשימה — לא שורה בתוך טבלה.
      const editPanel = document.getElementById("edit-panel");
      const editListView = document.getElementById("edit-list-view");
      const closeEditor = () => {
        if (editPanel) { editPanel.hidden = true; editPanel.textContent = ""; }
        if (editListView) editListView.hidden = false;
        openEditRow = null;
      };

      // FAMILY MODE — עורך אחד: 🧑‍🧒 עזור לילד. UPSERT WITH ASSISTANCE (יוצר/מעדכן).
      function openEditor(tr, m, person, p) {
        // עורך אחד פתוח בכל רגע — מנקים, מכווצים את הרשימה, מציגים פאנל מלא.
        editPanel.textContent = "";
        editListView.hidden = true;
        editPanel.hidden = false;
        openEditRow = editPanel;
        const form = el("div", "help-form workspace mode-update");

        // שורה 1: משתתף | משחק | מצב
        const locked = Date.now() >= Date.parse(m.kickoffAt);
        const headRow = el("div", "ws-head");
        headRow.appendChild(el("span", "ws-person", "🧑‍🧒 " + person.displayName));
        headRow.appendChild(el("span", "ws-match", withFlag(m.home) + " — " + withFlag(m.away)));
        headRow.appendChild(el("span", "ws-status " + (locked ? "st-locked" : "st-open"),
          locked ? "🔒 נעול" : "🟢 פתוח"));
        form.appendChild(el("div", "ws-title", "עדכון בעזרת מבוגר"));
        form.appendChild(headRow);

        // שורה 2: בורר מקטעים גדול ○בית ○תיקו ○חוץ / שמות בנוקאאוט
        const picks = el("div", "pick-row segmented");
        const pOpts = m.stage === "group"
          ? [["home", "בית"], ["draw", "תיקו"], ["away", "חוץ"]]
          : [["home", m.home], ["away", m.away]];
        for (const [v, l] of pOpts) {
          const lab = el("label", "pick-opt");
          const r = document.createElement("input");
          r.type = "radio"; r.name = "edit-pick"; r.value = v;
          if (p && p.pick === v) r.checked = true;
          lab.appendChild(r); lab.appendChild(el("span", "pick-pill", l));
          picks.appendChild(lab);
        }

        const gh = document.createElement("input"); gh.type = "number"; gh.min = "0"; gh.className = "score";
        const ga = document.createElement("input"); ga.type = "number"; ga.min = "0"; ga.className = "score";
        if (p && p.guessHome != null) gh.value = p.guessHome;
        if (p && p.guessAway != null) ga.value = p.guessAway;

        const saveB = el("button", "ws-cta", "💾 שמור");
        const cancelB = el("button", "ws-cancel secondary", "ביטול");
        saveB.type = "button"; cancelB.type = "button";
        const msg = el("div", "ws-msg muted", "");

        // תוצאה משוערת (אופציונלי) — בלי סיבה, בלי מקור.
        const scoresWrap = el("div", "ws-scores"); scoresWrap.append(gh, el("span", "sep", ":"), ga);
        const row2 = el("div", "ws-field"); row2.append(el("span", "help-lbl", "תוצאה משוערת (אופציונלי):"), scoresWrap);
        form.appendChild(el("div", "ws-seg-label", "הבחירה:"));
        form.append(picks, row2);
        const row4 = el("div", "ws-actions"); row4.append(saveB, cancelB);
        form.append(row4, msg);
        editPanel.appendChild(form);
        editPanel.scrollIntoView({ block: "start" });

        cancelB.addEventListener("click", () => closeEditor());
        saveB.addEventListener("click", async () => {
          const pickVal = form.querySelector('input[name="edit-pick"]:checked')?.value || null;
          // ה-ownerUid של הילד: מהניחוש הקיים (קפוא), או נגזר מניחושיו, או pid.
          const resolvePlayerUid = (name) => {
            const sharedUids = new Set();
            const uidNames = {};
            predsList.forEach((x) => {
              if (!x.ownerUid) return;
              (uidNames[x.ownerUid] = uidNames[x.ownerUid] || new Set()).add(x.displayName);
            });
            Object.entries(uidNames).forEach(([u, names]) => { if (names.size > 1) sharedUids.add(u); });
            const mine = predsList.filter((x) => x.displayName === name && x.ownerUid)
              .sort((a, b) => ((b.updatedAt && b.updatedAt.seconds) || 0) - ((a.updatedAt && a.updatedAt.seconds) || 0));
            const exclusive = mine.find((x) => !sharedUids.has(x.ownerUid));
            return (exclusive && exclusive.ownerUid) || (mine[0] && mine[0].ownerUid) || partUidByName[name] || null;
          };
          const pid = (p && p.participantId) || pidOfPerson(person);
          // הילד נשאר הבעלים: ownerUid קפוא לעדכון; ליצירה — uid ייחודי או pid.
          const effOwnerUid = (p && p.ownerUid) || resolvePlayerUid(person.displayName) || pid;

          // ה-rules מזהים מנהל לפי device_links/<uid הנוכחי>. במכשיר משותף הקישור עלול
          // להידרס → מקשרים מחדש לפני כל כתיבה (מותר רק אם ה-uid ב-cred של המנהל).
          try {
            const adminPid = code + "__" + nameKey(adminSession());
            await setDoc(doc(db, "device_links", uid), { participantId: adminPid, tournamentCode: code });
          } catch (e0) {
            saveB.disabled = false;
            msg.className = "ws-msg error";
            msg.textContent = "⚠️ הדפדפן הזה לא מזוהה כמנהל בשרת — היכנסו מחדש עם סיסמת המנהל ונסו שוב";
            console.log("[ADMIN_SAVE] device_link self-heal failed:", e0.code || e0);
            return;
          }
          console.log("[ADMIN_SAVE]", "player=" + person.displayName, "participantId=" + (pid || "NONE"),
            "existingPrediction=" + !!p, "ownerUid=" + (effOwnerUid || "NONE"), "action=upsert");
          if (!pid || !effOwnerUid) { saveB.disabled = false; msg.className = "ws-msg error"; msg.textContent = "⚠️ לא נמצא משתתף רשום בשם הזה"; return; }

          saveB.disabled = true; msg.className = "ws-msg"; msg.textContent = "שומר…";
          // UPSERT פשוט. audit מינימלי: updatedBy + updatedAt בלבד.
          const payload = {
            tournamentCode: code, matchId: m.id, ownerUid: effOwnerUid,
            displayName: person.displayName, stage: m.stage,
            pick: pickVal,
            guessHome: gh.value === "" ? null : Number(gh.value),
            guessAway: ga.value === "" ? null : Number(ga.value),
            participantId: pid,
            updatedBy: adminSession(),
            updatedAt: serverTimestamp(),
          };
          try {
            if (p && p._docId) {
              await updateDoc(doc(db, "predictions", p._docId), payload);
            } else {
              await setDoc(doc(db, "predictions", code + "__" + m.id + "__" + pid), payload);
            }
            // אם המשחק כבר הסתיים — מחשבים מחדש את הניקוד של הילד הזה לפי הניחוש החדש,
            // כדי שהתוצאות יתחשבו בתיקון. (אותו נוסחה כמו חישוב הניקוד הרגיל.)
            try {
              const mdoc = await getDoc(doc(db, "matches", code + "__" + m.id));
              if (mdoc.exists() && mdoc.data().status === "finished") {
                const md = mdoc.data();
                const h = Number(md.homeScore), a = Number(md.awayScore);
                const winner = m.stage !== "group"
                  ? (h === a ? md.advancing : (h > a ? "home" : "away"))
                  : (h > a ? "home" : h < a ? "away" : "draw");
                const S = await loadScoring();
                const POINTS = { home: S.HOME, draw: S.DRAW, away: S.AWAY };
                const pts = (pickVal && pickVal === winner) ? (POINTS[winner] || 0) : 0;
                // מפתח לפי participantId (זהות יציבה) — מונע התנגשות ב-ownerUid משותף.
                await setDoc(doc(db, "scores", code + "__" + m.id + "__" + pid), {
                  tournamentCode: code, matchId: m.id, ownerUid: effOwnerUid, participantId: pid,
                  displayName: person.displayName, pick: pickVal || null, points: pts,
                  computedAt: serverTimestamp(),
                });
                console.log("[ADMIN_SAVE] rescored finished match:", m.id, person.displayName, "→", pts);
              }
            } catch (eS) { console.log("[ADMIN_SAVE] rescore skipped:", eS.code || eS); }
            msg.className = "ws-msg saved";
            msg.textContent = "✅ נשמר";
            setTimeout(() => closeEditor(), 900);
          } catch (e2) {
            saveB.disabled = false;
            msg.className = "ws-msg error";
            msg.textContent = "❌ לא נשמר";
            console.log("[ADMIN_SAVE] write failed:", e2.code || e2);
          }
        });
      }

      // מזהה יציב של אדם — code__nameKey (לבניית מפתח מסמך ביצירה).
      const pidOfPerson = (person) => (person && person.nameKey ? code + "__" + person.nameKey : null);

      const renderEditTab = () => {
        if (!editRows) return;
        const term = (editSearch && editSearch.value || "").trim();
        const stageF = editStage ? editStage.value : "";
        const stateF = editState ? editState.value : "has";
        const predByKey = {};
        predsList.forEach((p) => { predByKey[p.matchId + "__" + p.displayName] = p; });
        const ms = matchesData.slice().sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt));
        editRows.textContent = "";
        const frag = document.createDocumentFragment();
        let shown = 0;
        for (const m of ms) {
          if (shown >= 200) break;
          if (stageF === "group" && m.stage !== "group") continue;
          if (stageF === "ko" && m.stage === "group") continue;
          const matchText = m.id + " " + m.home + " " + m.away;
          for (const person of partsList) {
            const p = predByKey[m.id + "__" + person.displayName];
            if (stateF === "has" && !p) continue;
            if (stateF === "missing" && p) continue;
            if (term && !(person.displayName.includes(term) || matchText.includes(term))) continue;
            if (shown >= 200) break;
            shown++;
            const locked = Date.now() >= Date.parse(m.kickoffAt);
            const tr = document.createElement("tr");
            if (p && p.updatedBy) tr.className = "bets-edited";
            const cells = [
              person.displayName,
              m.id + " · " + m.home + "—" + m.away,
              fmtKickoff(m.kickoffAt),
              p ? (locked ? "🔒 נעול · עריכת מנהל מותרת" : "🟢 פתוח") : (locked ? "⚪ אין · נעול" : "⚪ אין"),
              p ? pickLabel(m, p.pick) + (p.guessHome != null ? " · " + guessLabel(p) : "") + (p.updatedBy ? " 🧑‍🧒" : "") : "—",
              fmtUpd(p),
            ];
            for (const c of cells) { const tdc = document.createElement("td"); tdc.textContent = c; tr.appendChild(tdc); }
            const act = document.createElement("td");
            // מודל אחד: 🧑‍🧒 עזור לילד — UPSERT (יוצר אם חסר, מעדכן אם קיים).
            const hb = el("button", "mini secondary bets-help-btn", "🧑‍🧒 עזור לילד");
            hb.type = "button";
            hb.addEventListener("click", () => openEditor(tr, m, person, p || null));
            act.appendChild(hb);
            tr.appendChild(act);
            frag.appendChild(tr);
          }
        }
        editRows.appendChild(frag);
        if (!editRows.children.length) {
          const tr = document.createElement("tr");
          const td2 = el("td", "muted", "אין שורות תואמות");
          td2.colSpan = 7; tr.appendChild(td2); editRows.appendChild(tr);
        }
      };

      const renderAudit = () => {
        if (!auditRows) return;
        const edited = predsList.filter((p) => p.updatedBy)
          .sort((a, b) => ((b.updatedAt && b.updatedAt.seconds) || 0) - ((a.updatedAt && a.updatedAt.seconds) || 0));
        auditRows.textContent = "";
        for (const p of edited.slice(0, 50)) {
          const m = byId[p.matchId] || { home: p.matchId, away: "" };
          const stamp = (p.updatedAt && p.updatedAt.seconds) ? p.updatedAt.seconds : null;
          const t = stamp ? new Date(stamp * 1000).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
          const who = p.updatedBy || "—";
          const tr = document.createElement("tr");
          for (const c of [p.matchId + " · " + m.home + "—" + m.away, p.displayName, who, t]) {
            const td3 = document.createElement("td"); td3.textContent = c; tr.appendChild(td3);
          }
          auditRows.appendChild(tr);
        }
        if (!auditRows.children.length) {
          const tr = document.createElement("tr");
          const td4 = el("td", "muted", "עוד לא היו תיקונים 🙂");
          td4.colSpan = 5; tr.appendChild(td4); auditRows.appendChild(tr);
        }
      };

      if (editSearch) editSearch.addEventListener("input", renderEditTab);
      if (editStage) editStage.addEventListener("change", renderEditTab);
      if (editState) editState.addEventListener("change", renderEditTab);

      // משתתפים: רשימה חיה (שמות בלבד); ניחושים: snapshot חי — "מסך הימורים חי"
      onSnapshot(query(collection(db, "participants"), where("tournamentCode", "==", code)), (snap) => {
        partsList = [];
        partUidByName = {};
        snap.forEach((d) => {
          const pd = d.data();
          partsList.push(pd);
          if (Array.isArray(pd.uids) && pd.uids.length) partUidByName[pd.displayName] = pd.uids[0];
        });
        partsList.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "he"));
        partSel.querySelectorAll("option:not(:first-child)").forEach((o) => o.remove());
        partsList.forEach((p) => { const o = document.createElement("option"); o.value = p.displayName; o.textContent = p.displayName; partSel.appendChild(o); });
        render();
        renderEditTab();
      });
      onSnapshot(query(collection(db, "predictions"), where("tournamentCode", "==", code)), (snap) => {
        predsList = [];
        // _docId = המסמך האמיתי — עדכונים נכתבים אליו בלבד, בלי לבנות מפתח מחדש.
        snap.forEach((d) => predsList.push(Object.assign({ _docId: d.id }, d.data())));
        render();
        renderEditTab();
        renderAudit();
      }, () => { /* אין הרשאה/שגיאה — הטבלה נשארת ריקה */ });
      scopeSel.addEventListener("change", render);
      partSel.addEventListener("change", render);
    })();

    // ===== ייצוא CSV + JSON (גיבוי) =====
    const download = (name, text, type) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type }));
      a.download = name; a.click();
    };
    const collectAll = async () => {
      const [parts, preds, scrs] = await Promise.all([
        getDocs(query(collection(db, "participants"), where("tournamentCode", "==", code))),
        getDocs(query(collection(db, "predictions"), where("tournamentCode", "==", code))),
        getDocs(query(collection(db, "scores"), where("tournamentCode", "==", code))),
      ]);
      const j = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
      return { participants: j(parts), predictions: j(preds), scores: j(scrs) };
    };
    window.buildExportCsv = async () => {
      const { predictions, scores } = await collectAll();
      const pts = Object.fromEntries(scores.map((s) => [s.matchId + "__" + s.ownerUid, s.points]));
      const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
      const rows = [["שם", "משחק", "בחירה", "תוצאה משוערת", "נקודות", "זמן"]];
      for (const p of predictions) {
        const guess = p.guessHome != null && p.guessAway != null ? p.guessHome + ":" + p.guessAway : "";
        const ts = p.updatedAt && p.updatedAt.seconds ? new Date(p.updatedAt.seconds * 1000).toISOString() : "";
        rows.push([p.displayName, p.matchId, p.pick || "", guess, pts[p.matchId + "__" + p.ownerUid] ?? "", ts]);
      }
      return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
    };
    window.buildExportJson = async () => JSON.stringify(await collectAll(), null, 1);
    document.getElementById("export-csv").addEventListener("click", async () => {
      document.getElementById("export-status").textContent = "מכין CSV…";
      download("mondial2026-backup.csv", await window.buildExportCsv(), "text/csv;charset=utf-8");
      document.getElementById("export-status").textContent = "CSV הורד.";
    });
    document.getElementById("export-json").addEventListener("click", async () => {
      document.getElementById("export-status").textContent = "מכין JSON…";
      download("mondial2026-backup.json", await window.buildExportJson(), "application/json");
      document.getElementById("export-status").textContent = "JSON הורד.";
    });
  })();
}

// ===================== אתחול מנהלים חד-פעמי (setup-admins.html) =====================
const setupEl = document.getElementById("setup-admins");
if (setupEl) {
  const code = param("t").toUpperCase() || DEFAULT_CODE;
  const form = document.getElementById("setup-form");
  const msg = document.getElementById("setup-msg");

  // מופיע רק אם: אין עדיין מנהלים מוגדרים, והמשתמש הוא אלעד.
  if (getName() !== "אלעד") {
    form.hidden = true;
    msg.textContent = "המסך הזה זמין רק למקים הטורניר.";
    msg.hidden = false;
  } else if (getStoredAdmins()) {
    form.hidden = true;
    msg.textContent = "מנהלי הטורניר כבר הוגדרו: " + getStoredAdmins().join(", ");
    msg.hidden = false;
  } else {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const chosen = [...form.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);
      if (!chosen.length) { msg.textContent = "צריך לבחור לפחות מנהל אחד."; msg.hidden = false; return; }
      // נשמרת רשימת מנהלים בלבד. בלי משתמשים חדשים, בלי קודים.
      setStoredAdmins(chosen);
      location.href = "admin.html?t=" + encodeURIComponent(code);
    });
  }
}

// ===================== מסך ניחושים (predictions.html) =====================
const matchesEl = document.getElementById("matches");
if (matchesEl) {
  const code = param("t").toUpperCase();
  const me = getName();
  if (!code) location.href = "index.html";

  const greetingEl = document.getElementById("greeting");
  const participantsEl = document.getElementById("participants");
  const adminLink = document.getElementById("admin-link");
  const logoutBtn = document.getElementById("logout");
  const applyGreeting = () => {
    if (greetingEl) greetingEl.textContent = "שלום " + (me || "אורח") + (isAdminSession() ? " 👑 מנהל" : "");
  };
  applyGreeting();
  const note = (cls, msg) => { matchesEl.textContent = ""; matchesEl.appendChild(el("p", cls, msg)); };

  function scoreInput(side) {
    const i = document.createElement("input");
    i.className = "score"; i.type = "number"; i.min = "0"; i.inputMode = "numeric"; i.name = side;
    return i;
  }

  // נעילה אוטומטית: עכשיו >= kickoffAt → נעול. אין נעילה ידנית.
  const isLocked = (match) => Date.now() >= Date.parse(match.kickoffAt);

  // תג זמן יחסי — זמן הדפדפן המקומי בלבד, בלי timezone ידני.
  const relTimeLabel = (kickMs, nowMs) => {
    const d = kickMs - nowMs;
    if (d <= 0) return "נסגר";
    const min = Math.round(d / 60000);
    if (min < 60) return "מתחיל בעוד " + min + " דק'";
    const hrs = Math.round(d / 3600000);
    if (hrs < 24) return "מתחיל בעוד " + hrs + " שעות";
    if (new Date(nowMs + 86400000).toDateString() === new Date(kickMs).toDateString()) return "מתחיל מחר";
    return "בעוד " + Math.ceil(d / 86400000) + " ימים";
  };

  // סטטוס תוצאה מהשרת (matches collection): finished → 🏁
  let matchStatusMap = {};
  const statusChip = (match) => {
    if (matchStatusMap[match.id] === "finished") return ["🏁 הסתיים", "finished"];
    return isLocked(match) ? ["🔒 המשחק התחיל", "locked"] : ["🟢 פתוח לניחוש", "open"];
  };

  // כרטיס משחק — מודל V1:
  //   שלב בתים: חובה ○בית/○תיקו/○חוץ; נוקאאוט: חובה "מי עולה" ○בית/○חוץ.
  //   תוצאה משוערת אופציונלית בלבד — לא משפיעה על ניקוד.
  function buildRow(match) {
    const locked = isLocked(match);
    // מבנה ממורכז (סבב UI): שעה+בית → דגלים+נבחרות → בחירת מנצח → תוצאה משוערת
    const head = el("div", "match-head");
    head.appendChild(el("span", "grp", match.stage === "group" ? "בית " + match.group : STAGE_HE[match.stage] || ""));
    const [chipText, chipCls] = statusChip(match);
    head.appendChild(el("span", "status-chip " + chipCls, chipText));
    head.appendChild(el("span", "kickoff", fmtKickoff(match.kickoffAt)));
    // תג זמן יחסי (לפי שעון הדפדפן); למשחק נעול הצ'יפ 🔒 כבר אומר "נסגר"
    if (!locked) head.appendChild(el("span", "rel-chip", relTimeLabel(Date.parse(match.kickoffAt), Date.now())));

    const title = el("div", "match-title");
    title.appendChild(el("span", "team home", withFlag(match.home)));
    title.appendChild(el("span", "sep", "נגד"));
    title.appendChild(el("span", "team away", withFlag(match.away)));

    // בחירת חובה — מודל V1 (P0-4):
    //   שלב בתים: ○בית/○תיקו/○חוץ (שמות הנבחרות בכותרת הכרטיס).
    //   נוקאאוט: שמות הנבחרות עצמן — לעולם לא "בית"/"חוץ".
    const picks = el("div", "pick-row");
    const opts = match.stage === "group"
      ? [["home", "בית"], ["draw", "תיקו"], ["away", "חוץ"]]
      : [["home", withFlag(match.home)], ["away", withFlag(match.away)]];
    if (match.stage !== "group") picks.appendChild(el("span", "pick-q", "מי עולה?"));
    for (const [val, label] of opts) {
      const lab = el("label", "pick-opt");
      const r = document.createElement("input");
      r.type = "radio"; r.name = "pick-" + match.id; r.value = val; r.disabled = locked;
      lab.appendChild(r);
      lab.appendChild(el("span", "pick-pill", label));
      picks.appendChild(lab);
    }

    // תוצאה משוערת — אופציונלי, לא לניקוד. תווית מעל השדות, הכול ממורכז.
    const guess = el("div", "guess-block");
    guess.appendChild(el("div", "guess-label", match.stage === "group" ? "תוצאה משוערת (לא לניקוד)" : "90 דקות (לא לניקוד)"));
    const guessRow = el("div", "guess-row");
    const gh = scoreInput("home"); const ga = scoreInput("away");
    gh.disabled = locked; ga.disabled = locked;
    guessRow.appendChild(gh); guessRow.appendChild(el("span", "sep", ":")); guessRow.appendChild(ga);
    guess.appendChild(guessRow);

    // שמירה מפורשת (HOTFIX P1): אין auto-save שקט — כפתור + שורת חיווי.
    // משחק נעול = קריאה בלבד (אין כפתור; ה-rules ממילא דוחים כתיבה אחרי kickoff).
    const foot = el("div", "save-foot");
    if (!locked) {
      const saveBtn = el("button", "mini save-btn", "💾 שמור ניחוש");
      saveBtn.type = "button";
      foot.appendChild(saveBtn);
    }
    foot.appendChild(el("div", "save-status", ""));

    const wrap = el("div", "match" + (locked ? " locked" : ""));
    wrap.dataset.match = match.id; wrap.dataset.stage = match.stage;
    wrap.appendChild(head); wrap.appendChild(title); wrap.appendChild(picks); wrap.appendChild(guess);
    wrap.appendChild(foot);
    return wrap;
  }

  // DEMO GUARD: ?demo=1 הוא שכבת תצוגה בלבד (UX).
  // לעולם לא: עוקף pending/approval · מעניק ניהול · כותב ל-Firestore · משנה auth.
  // משתמש לא מאושר נשאר חסום/ממתין גם עם demo. רק משתמש מאושר מקבל תוכן תצוגה.
  const demoMode = new URLSearchParams(location.search).has("demo");

  (async () => {
    resetScreenState(); // לפני hydrate — אסור append בלי reset
    applyGreeting();    // הברכה משוחזרת מיד למשתמש הנוכחי
    const user = await authOrNull();
    const uid = user ? user.uid : null;
    const { sig, derived } = await loadState(code, uid);
    renderStatusBar(barEl, derived, sig);

    if (!derived.canAccessPredictions) {
      if (derived.state === STATES.UNKNOWN || derived.state === STATES.NO_REQUEST || derived.state === STATES.SIGNED_OUT) {
        // לא מזוהה במכשיר הזה — רענון לא יעזור; צריך להתחבר עם סיסמה (יוצר את הקישור).
        matchesEl.textContent = "";
        matchesEl.appendChild(el("p", "disabled-note", "כדי לנחש צריך להתחבר במכשיר הזה (שם + סיסמה)."));
        const loginLink = el("a", "btn-link primary-big", "🔑 התחברות");
        loginLink.href = "index.html?t=" + encodeURIComponent(code);
        matchesEl.appendChild(loginLink);
      } else {
        note("disabled-note", "🔒 הניחושים מושבתים. " + derived.statusText);
      }
      return;
    }

    // ⚙️ בניווט נחשף לפי רשימת המנהלים הקבועה (ב-topnav), לא לפי data.

    // DEMO: רק כאן — אחרי שעברנו את שער האישור האמיתי. תוכן תצוגה בלבד:
    // בלי מאזיני שמירה, בלי קריאות/כתיבות Firestore.
    if (demoMode) {
    // סטטוסי תוצאה (🏁) מהשרת — קריאה בלבד; כשל → נשארים לפי שעון בלבד
    try {
      const msnap = await getDocs(query(collection(db, "matches"), where("tournamentCode", "==", code)));
      msnap.forEach((d) => { matchStatusMap[d.data().matchId] = d.data().status; });
    } catch (e) { /* בלי סטטוסים */ }

      const data = await fetch("matches.json").then((r) => r.json());
      matchesEl.textContent = "";
      ((data && data.matches) || []).forEach((m) => matchesEl.appendChild(buildRow(m)));
      matchesEl.querySelectorAll("input").forEach((i) => { i.disabled = true; });
      matchesEl.querySelectorAll(".save-btn").forEach((b) => { b.disabled = true; });
      return;
    }

    // שמירת ניחוש: pick חובה לניקוד; guess אופציונלי ולא לניקוד. נעול → לא שומרים.
    let myPartId = null;
    try { const l = await getDoc(doc(db, "device_links", uid)); if (l.exists()) myPartId = l.data().participantId; } catch (e) {}
    let flagged = false;
    const savePrediction = async (row) => {
      const mid = row.dataset.match;
      if (row.classList.contains("locked")) return;
      const pick = row.querySelector('input[name="pick-' + mid + '"]:checked')?.value || null;
      const gh = row.querySelector('input[name="home"]').value;
      const ga = row.querySelector('input[name="away"]').value;
      await setDoc(predRef(code, mid, uid), {
        tournamentCode: code, matchId: mid, ownerUid: uid, displayName: me,
        // IDENTITY RECOVERY: participantId = הזהות היציבה של האדם (לא ownerUid,
        // שהוא מזהה מכשיר/דפדפן ועלול להיות משותף או מתחלף).
        participantId: myPartId || null,
        stage: row.dataset.stage, pick: pick,
        guessHome: gh === "" ? null : Number(gh), guessAway: ga === "" ? null : Number(ga),
        updatedAt: serverTimestamp(),
      });
      // דגל "כבר ניחש" — פומבי, בלי תוכן הניחוש (למוני הלכידות בבית)
      if (!flagged && myPartId) {
        flagged = true;
        setDoc(doc(db, "predicted_flags", myPartId), {
          participantId: myPartId, tournamentCode: code,
        }).catch(() => {});
      }
    };

    // סטטוסי תוצאה (🏁) מהשרת — קריאה בלבד; כשל → נשארים לפי שעון בלבד
    try {
      const msnap = await getDocs(query(collection(db, "matches"), where("tournamentCode", "==", code)));
      msnap.forEach((d) => { matchStatusMap[d.data().matchId] = d.data().status; });
    } catch (e) { /* בלי סטטוסים */ }

    let openMatches = [];
    let allList = [];
    try {
      const data = await fetch("matches.json").then((r) => r.json());
      const list = ((data && data.matches) || []).slice()
        .sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt));
      allList = list;
      matchesEl.textContent = "";

      // חלוקה לאזורים: 🟢 פתוחים עכשיו (עד 48 שע') · 🟡 בהמשך · 🔒 נסגרו (מוסתר)
      const nowMs = Date.now();
      const OPEN_WINDOW_MS = 48 * 3600e3;
      const open = list.filter((m) => { const t = Date.parse(m.kickoffAt); return t > nowMs && t - nowMs <= OPEN_WINDOW_MS; });
      const later = list.filter((m) => Date.parse(m.kickoffAt) - nowMs > OPEN_WINDOW_MS);
      const closed = list.filter((m) => Date.parse(m.kickoffAt) <= nowMs);
      openMatches = open;

      const addSection = (title, cls, ms) => {
        if (!ms.length) return null;
        const sec = el("section", "match-section " + cls);
        sec.appendChild(el("h2", "section-title", title + " (" + ms.length + ")"));
        ms.forEach((m) => sec.appendChild(buildRow(m)));
        matchesEl.appendChild(sec);
        return sec;
      };
      addSection("🟢 פתוחים עכשיו", "sec-open", open);
      addSection("🟡 בהמשך", "sec-later", later);
      if (closed.length) {
        const btn = el("button", "mini secondary toggle-closed", "🔒 הצג משחקים סגורים (" + closed.length + ")");
        matchesEl.appendChild(btn);
        const sec = addSection("🔒 נסגרו", "sec-closed", closed);
        sec.hidden = true;
        btn.addEventListener("click", () => {
          sec.hidden = !sec.hidden;
          btn.textContent = sec.hidden ? "🔒 הצג משחקים סגורים (" + closed.length + ")" : "🔒 הסתר משחקים סגורים";
        });
      }

      // HOTFIX P1: שינוי לא שומר — רק מסמן. שמירה אך ורק בלחיצה על הכפתור.
      matchesEl.querySelectorAll(".match").forEach((row) => {
        const btn = row.querySelector(".save-btn");
        const status = row.querySelector(".save-status");
        const setStatus = (text, cls) => { if (status) { status.textContent = text; status.className = "save-status" + (cls ? " " + cls : ""); } };
        const markDirty = () => {
          if (btn) { btn.disabled = false; btn.textContent = "💾 שמור שינויים"; }
          setStatus("✏️ יש שינויים שלא נשמרו", "dirty");
          updateSticky();
        };
        row.querySelectorAll("input").forEach((i) => i.addEventListener("change", markDirty));
        if (btn) btn.addEventListener("click", async () => {
          btn.disabled = true;
          btn.textContent = "⏳ שומר...";
          try {
            await savePrediction(row);
            const t = new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
            btn.textContent = "✅ ההימור נשמר";
            setStatus("☁️ נשמר בשרת · " + t, "saved");
            setTimeout(() => { btn.textContent = "💾 שמור ניחוש"; btn.disabled = false; }, 2000);
          } catch (e) {
            btn.disabled = false;
            btn.textContent = "⚠️ השמירה נכשלה - נסה שוב";
            setStatus("⚠️ הנתונים לא התקבלו", "error");
          }
        });
      });
      const mine = await getDocs(query(collection(db, "predictions"),
        where("tournamentCode", "==", code), where("ownerUid", "==", uid)));
      mine.forEach((d) => {
        const p = d.data();
        const row = matchesEl.querySelector('.match[data-match="' + p.matchId + '"]');
        if (!row) return;
        if (p.pick) { const r = row.querySelector('input[name="pick-' + p.matchId + '"][value="' + p.pick + '"]'); if (r) r.checked = true; }
        if (p.guessHome != null) row.querySelector('input[name="home"]').value = p.guessHome;
        if (p.guessAway != null) row.querySelector('input[name="away"]').value = p.guessAway;
        // נטען מהשרת — חיווי "הימור קיים" (השחזור פרוגרמטי, לא מדליק dirty)
        const st = row.querySelector(".save-status");
        if (st) { st.textContent = "✔ הימור קיים"; st.className = "save-status exists"; }
        // FAMILY MODE: עזרת מבוגר תמיד גלויה — לא חיווי שלילי.
        if (p.updatedBy) {
          const note = el("div", "helped-note", "עודכן על ידי מבוגר");
          const foot = row.querySelector(".save-foot");
          if (foot) foot.appendChild(note);
        }
      });
    } catch (e) { note("conn-error", "לא הצלחנו לקבוע מצב — נסו לרענן."); return; }

    // ===== Sticky bar: נותרו X ניחושים פתוחים · המשחק הבא בעוד HH:MM =====
    let sticky = document.getElementById("predict-sticky");
    if (!sticky) {
      sticky = el("div", "predict-sticky");
      sticky.id = "predict-sticky";
      matchesEl.parentNode.insertBefore(sticky, matchesEl);
    }
    function updateSticky() {
      const remaining = openMatches.filter((m) =>
        !matchesEl.querySelector('input[name="pick-' + m.id + '"]:checked')).length;
      const nextT = allList.map((m) => Date.parse(m.kickoffAt)).filter((t) => t > Date.now()).sort((a, b) => a - b)[0];
      sticky.textContent = "";
      sticky.appendChild(el("span", "sticky-chip", "🎯 נותרו " + remaining + " ניחושים פתוחים"));
      if (nextT) {
        const d = nextT - Date.now();
        const hh = String(Math.floor(d / 3600e3)).padStart(2, "0");
        const mm = String(Math.floor((d % 3600e3) / 60000)).padStart(2, "0");
        sticky.appendChild(el("span", "sticky-chip", "⏰ המשחק הבא בעוד " + hh + ":" + mm));
      }
    }
    updateSticky();
    setInterval(updateSticky, 60000);

    // ===== מנהל בלבד: "מי עוד לא הימר" — סטטוס בלבד, בלי תוכן ניחושים =====
    if (derived.canAccessAdmin && isAdminSession()) {
      const missBtn = el("button", "mini secondary missing-btn", "👀 מי עוד לא הימר");
      const panel = el("div", "participants missing-panel");
      panel.hidden = true;
      sticky.after(missBtn, panel);
      let loaded = false;
      missBtn.addEventListener("click", async () => {
        panel.hidden = !panel.hidden;
        if (panel.hidden || loaded) return;
        loaded = true;
        panel.textContent = "טוען…";
        try {
          const [parts, preds] = await Promise.all([
            getDocs(query(collection(db, "participants"), where("tournamentCode", "==", code))),
            getDocs(query(collection(db, "predictions"), where("tournamentCode", "==", code))),
          ]);
          const people = []; parts.forEach((d) => people.push(d.data().displayName));
          people.sort((a, b) => String(a).localeCompare(String(b), "he"));
          const has = new Set(); preds.forEach((d) => { const p = d.data(); has.add(p.matchId + "__" + p.displayName); });
          panel.textContent = "";
          for (const m of openMatches.slice(0, 5)) {
            const box = el("div", "missing-match");
            box.appendChild(el("div", "missing-title", withFlag(m.home) + " — " + withFlag(m.away)));
            people.forEach((name) => {
              const did = has.has(m.id + "__" + name);
              const row = el("div", "participant");
              row.appendChild(el("span", "p-icon", did ? "🟢" : "⚪"));
              row.appendChild(el("span", "p-name", name));
              box.appendChild(row);
            });
            panel.appendChild(box);
          }
          if (!panel.children.length) panel.appendChild(el("p", "muted", "אין משחקים פתוחים כרגע."));
        } catch (e2) { panel.textContent = "לא הצלחנו לטעון את הרשימה."; loaded = false; }
      });
    }

    if (participantsEl) {
      // למשתתף רגיל: רק "הימר / עוד לא" (predicted_flags) — לעולם לא תוכן הניחוש.
      let flaggedIds = new Set();
      const renderParts = (parts) => {
        participantsEl.textContent = "";
        participantsEl.appendChild(el("h2", "panel-title", "👥 משתתפים"));
        parts.sort((a, b) => (b.isAdmin === true) - (a.isAdmin === true));
        parts.forEach((p) => {
          const did = flaggedIds.has(code + "__" + (p.nameKey || ""));
          const row = el("div", "participant");
          row.appendChild(el("span", "p-icon", p.isAdmin ? "⭐" : (did ? "🟢" : "⚪")));
          row.appendChild(el("span", "p-name", p.displayName));
          row.appendChild(el("span", "p-count", did ? "הימר" : "עוד לא הימר"));
          participantsEl.appendChild(row);
        });
      };
      let lastParts = [];
      onSnapshot(query(collection(db, "predicted_flags"), where("tournamentCode", "==", code)), (snap) => {
        flaggedIds = new Set();
        snap.forEach((d) => flaggedIds.add(d.data().participantId));
        renderParts(lastParts.slice());
      }, () => {});
      onSnapshot(query(collection(db, "participants"), where("tournamentCode", "==", code)), (snap) => {
        lastParts = []; snap.forEach((d) => lastParts.push(d.data()));
        renderParts(lastParts.slice());
      });
    }
  })();

  if (logoutBtn) logoutBtn.addEventListener("click", () => doLogout(code));
}
