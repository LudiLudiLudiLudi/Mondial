// מונדיאל 2026 — לוגיקת לקוח.
// שלב זה: ללא Firebase / Auth / Firestore. רק ולידציה + שמירת זיהוי בסיסי ב-localStorage.
// ב-localStorage שומרים אך ורק: displayName, inviteCode. בלי role / join_code / auth.

"use strict";

const SESSION_KEY = "mondial2026.session";

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch (e) {
    return null;
  }
}

function saveSession(displayName) {
  // נשמר רק displayName. הקוד המשפחתי מאומת אך לא נשמר בשלב זה.
  localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName: displayName }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ---------- מסך כניסה (index.html) ----------
const form = document.getElementById("login-form");
if (form) {
  const nameInput = document.getElementById("name");
  const codeInput = document.getElementById("code");
  const errorEl = document.getElementById("error");
  const successEl = document.getElementById("success");

  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };
  const clearError = () => {
    errorEl.textContent = "";
    errorEl.hidden = true;
  };

  const validate = (name, code) => {
    if (name.length < 2) return "נא להזין שם (לפחות 2 תווים).";
    if (code.length < 3) return "נא להזין קוד משפחתי תקין.";
    return null;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearError();

    const name = nameInput.value.trim();
    const code = codeInput.value.trim().toUpperCase();

    const problem = validate(name, code);
    if (problem) {
      showError(problem);
      return;
    }

    saveSession(name);

    // בלי redirect אוטומטי. מציגים הצלחה ומשאירים את המשתמש במסך.
    form.hidden = true;
    successEl.hidden = false;
  });
}

// ---------- מסך placeholder (predictions.html) ----------
const greetingEl = document.getElementById("greeting");
if (greetingEl) {
  const session = loadSession();
  const name = session && session.displayName ? session.displayName : "אורח";
  greetingEl.textContent = "שלום " + name;

  const logoutBtn = document.getElementById("logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearSession();
      window.location.href = "index.html";
    });
  }
}
