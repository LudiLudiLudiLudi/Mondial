// מונדיאל 2026 — מסך כניסה.
// בשלב הזה: ללא Firebase / Auth / Firestore. רק ולידציה + שמירת session ב-localStorage.

"use strict";

const SESSION_KEY = "mondial2026.session";
const PREDICTIONS_URL = "predictions.html"; // מסך הניחושים — ייבנה בשלב הבא

const form = document.getElementById("login-form");
const nameInput = document.getElementById("name");
const codeInput = document.getElementById("code");
const errorEl = document.getElementById("error");

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.textContent = "";
  errorEl.hidden = true;
}

function validate(name, code) {
  if (name.length < 2) {
    return "נא להזין שם (לפחות 2 תווים).";
  }
  if (code.length < 3) {
    return "נא להזין קוד משפחתי תקין.";
  }
  return null;
}

function saveSession(name, code) {
  const session = {
    name: name,
    familyCode: code,
    joinedAt: new Date().toISOString(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

form.addEventListener("submit", function (event) {
  event.preventDefault();
  clearError();

  const name = nameInput.value.trim();
  const code = codeInput.value.trim().toUpperCase();

  const problem = validate(name, code);
  if (problem) {
    showError(problem);
    return;
  }

  saveSession(name, code);

  // redirect עתידי למסך הניחושים (הקובץ ייווצר בשלב הבא).
  window.location.href = PREDICTIONS_URL;
});
