"use strict";

const ADMIN_API_URL = "https://script.google.com/macros/s/AKfycbxI4Ipy5_29hvX05kEhbPb4d8GEc-G3BP7V0POXdjL5Z37Oq6TcSNKqw_OvHwSWfQjjqw/exec";
const LOCAL_PREVIEW = !ADMIN_API_URL || ADMIN_API_URL.includes("REPLACE_WITH");

const reviewState = {
  token: sessionStorage.getItem("rslAdminToken") || "",
  user: null,
  submissions: []
};

const reviewEls = {
  setupNotice: document.getElementById("setupNotice"),
  loginPanel: document.getElementById("loginPanel"),
  loginEmail: document.getElementById("loginEmail"),
  loginCode: document.getElementById("loginCode"),
  loginBtn: document.getElementById("loginBtn"),
  loginStatus: document.getElementById("loginStatus"),
  dashboard: document.getElementById("dashboard"),
  roleChip: document.getElementById("roleChip"),
  signedInAs: document.getElementById("signedInAs"),
  logoutBtn: document.getElementById("logoutBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  statusFilter: document.getElementById("statusFilter"),
  submissionsList: document.getElementById("submissionsList")
};

reviewEls.loginBtn.addEventListener("click", login);
reviewEls.loginCode.addEventListener("keydown", event => {
  if (event.key === "Enter") login();
});
reviewEls.logoutBtn.addEventListener("click", logout);
reviewEls.refreshBtn.addEventListener("click", loadSubmissions);
reviewEls.statusFilter.addEventListener("change", renderSubmissions);

reviewEls.setupNotice.hidden = !LOCAL_PREVIEW;
if (!LOCAL_PREVIEW && reviewState.token) restoreSession();

async function adminApi(action, payload = {}) {
  if (LOCAL_PREVIEW) return localAdminApi(action, payload);
  const response = await fetch(ADMIN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, token: reviewState.token, ...payload })
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Request failed");
  return result;
}

function localAdminApi(action, payload) {
  const key = "rslPreviewSubmissions";
  const rows = JSON.parse(localStorage.getItem(key) || "[]");
  if (action === "login") {
    return Promise.resolve({ ok: true, token: "preview-token", user: { email: payload.email || "preview@example.com", role: "owner" } });
  }
  if (action === "session") return Promise.resolve({ ok: true, user: { email: "preview@example.com", role: "owner" } });
  if (action === "list") return Promise.resolve({ ok: true, submissions: rows });
  if (action === "status") {
    const row = rows.find(item => item.id === payload.id);
    if (row) row.status = payload.status;
    localStorage.setItem(key, JSON.stringify(rows));
    return Promise.resolve({ ok: true });
  }
  throw new Error("Unsupported preview action");
}

async function login() {
  const email = reviewEls.loginEmail.value.trim();
  const code = reviewEls.loginCode.value;
  if (!email || !code) {
    reviewEls.loginStatus.textContent = "Enter the owner email and access code.";
    return;
  }

  reviewEls.loginBtn.disabled = true;
  reviewEls.loginStatus.textContent = "Signing in…";
  try {
    const result = await adminApi("login", { email, code });
    if (result.user.role !== "owner") throw new Error("This account cannot approve submissions.");
    reviewState.token = result.token;
    reviewState.user = result.user;
    sessionStorage.setItem("rslAdminToken", reviewState.token);
    showDashboard();
    await loadSubmissions();
  } catch (error) {
    reviewEls.loginStatus.textContent = error.message;
  } finally {
    reviewEls.loginBtn.disabled = false;
  }
}

async function restoreSession() {
  try {
    const result = await adminApi("session");
    if (result.user.role !== "owner") throw new Error("Owner access required.");
    reviewState.user = result.user;
    showDashboard();
    await loadSubmissions();
  } catch {
    logout();
  }
}

function showDashboard() {
  reviewEls.loginPanel.hidden = true;
  reviewEls.dashboard.hidden = false;
  reviewEls.roleChip.textContent = reviewState.user.role;
  reviewEls.signedInAs.textContent = reviewState.user.email;
  reviewEls.loginCode.value = "";
}

function logout() {
  reviewState.token = "";
  reviewState.user = null;
  sessionStorage.removeItem("rslAdminToken");
  reviewEls.dashboard.hidden = true;
  reviewEls.loginPanel.hidden = false;
  reviewEls.loginStatus.textContent = "Signed out.";
}

async function loadSubmissions() {
  reviewEls.submissionsList.innerHTML = "<p class='help'>Loading submissions…</p>";
  try {
    const result = await adminApi("list");
    reviewState.submissions = result.submissions || [];
    renderSubmissions();
  } catch (error) {
    reviewEls.submissionsList.innerHTML = `<p class="help">${escapeReviewHtml(error.message)}</p>`;
  }
}

function renderSubmissions() {
  const filter = reviewEls.statusFilter.value;
  const rows = reviewState.submissions.filter(row => filter === "all" || normalizedStatus(row.status) === filter);

  if (!rows.length) {
    reviewEls.submissionsList.innerHTML = "<p class='help'>No matching submissions.</p>";
    return;
  }

  reviewEls.submissionsList.innerHTML = "";
  rows.forEach(row => {
    const item = document.createElement("article");
    item.className = "submission-item";

    const links = [];
    addReviewLink(links, row.dataFileUrl, "Open survey data");
    addReviewLink(links, row.supportFileUrl, "Open supporting file");
    addReviewLink(links, row.folderUrl, "Open private Drive folder");

    item.innerHTML = `
      <div class="submission-top">
        <div>
          <h3 class="submission-title">${escapeReviewHtml(row.name || "Untitled project")}</h3>
          <div class="submission-meta">
            <strong>${escapeReviewHtml(methodLabel(row.type))}</strong> · ${escapeReviewHtml(formatReviewDate(row.date))}<br>
            Observer: ${escapeReviewHtml(row.observer || "Not supplied")}<br>
            Instrument: ${escapeReviewHtml(row.detectorModel || "Not supplied")}${row.detectorHeight ? ` · ${escapeReviewHtml(row.detectorHeight)}` : ""}<br>
            Location: ${escapeReviewHtml(row.location || "Not supplied")}<br>
            Data source: ${escapeReviewHtml(row.dataSource || "Not supplied")}<br>
            Submitted: ${escapeReviewHtml(formatReviewDateTime(row.createdAt))}<br>
            Contact: ${escapeReviewHtml(row.submitterEmail || row.uploader || "Not supplied")}${row.submitterPhone ? ` · ${escapeReviewHtml(row.submitterPhone)}` : ""}<br>
            Data file: ${escapeReviewHtml(row.dataFileName || "—")}${row.supportFileName ? `<br>Supporting file: ${escapeReviewHtml(row.supportFileName)}` : ""}
          </div>
        </div>
        <span class="status-badge">${escapeReviewHtml(statusLabel(row.status))}</span>
      </div>
      ${row.notes ? `<div class="review-notes"><strong>Method and notes</strong><p>${escapeReviewHtml(row.notes)}</p></div>` : ""}
      ${links.length ? `<div class="private-links">${links.join("")}</div>` : ""}
      <div class="submission-actions">
        <button class="primary" data-status="published">Approve & publish</button>
        <button data-status="hidden">Keep hidden</button>
        <button data-status="rejected">Reject</button>
      </div>`;

    item.querySelectorAll("[data-status]").forEach(button => {
      button.addEventListener("click", () => changeStatus(row.id, button.dataset.status, row.name));
    });
    reviewEls.submissionsList.appendChild(item);
  });
}

function addReviewLink(links, value, label) {
  const url = safeHttpUrl(value);
  if (url) links.push(`<a href="${escapeReviewHtml(url)}" target="_blank" rel="noopener">${escapeReviewHtml(label)}</a>`);
}

async function changeStatus(id, status, name) {
  const action = status === "published" ? "publish" : status === "hidden" ? "keep hidden" : "reject";
  if (!window.confirm(`Confirm: ${action} “${name || "this project"}”?`)) return;

  try {
    await adminApi("status", { id, status });
    await loadSubmissions();
  } catch (error) {
    alert(error.message);
  }
}

function normalizedStatus(value) {
  const status = String(value || "submitted").toLowerCase();
  return status === "draft" ? "submitted" : status;
}

function statusLabel(value) {
  const status = normalizedStatus(value);
  return status === "submitted" ? "Awaiting review" : status === "published" ? "Published" : status;
}

function methodLabel(value) {
  const labels = {
    walking: "Walking GPS survey",
    vehicle: "Vehicle GPS survey",
    drone: "Drone-mounted survey",
    stationary: "Stationary point readings",
    manual: "Hand-entered/community log",
    other: "Other method"
  };
  return labels[String(value || "").toLowerCase()] || String(value || "Other method");
}

function formatReviewDate(value) {
  const text = String(value || "");
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text || "No date";
}

function formatReviewDateTime(value) {
  if (!value) return "Not supplied";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function escapeReviewHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[character]));
}
