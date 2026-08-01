"use strict";

// Paste the /exec URL from the deployed Google Apps Script web app here.
const ADMIN_API_URL = "https://script.google.com/macros/s/AKfycbxI4Ipy5_29hvX05kEhbPb4d8GEc-G3BP7V0POXdjL5Z37Oq6TcSNKqw_OvHwSWfQjjqw/exec";
const LOCAL_PREVIEW = !ADMIN_API_URL;

const state = { token: sessionStorage.getItem("rslAdminToken") || "", user: null, submissions: [], editingId: "" };
const $ = id => document.getElementById(id);
const els = {
  setupNotice: $("setupNotice"), loginPanel: $("loginPanel"), dashboard: $("dashboard"),
  loginEmail: $("loginEmail"), loginCode: $("loginCode"), loginBtn: $("loginBtn"), loginStatus: $("loginStatus"),
  roleChip: $("roleChip"), signedInAs: $("signedInAs"), logoutBtn: $("logoutBtn"),
  surveyName: $("surveyName"), surveyType: $("surveyType"), surveyDate: $("surveyDate"), observer: $("observer"),
  detectorModel: $("detectorModel"), detectorId: $("detectorId"), detectorHeight: $("detectorHeight"),
  locationName: $("locationName"), surveyNotes: $("surveyNotes"), surveyFile: $("surveyFile"), supportFile: $("supportFile"),
  uploadBtn: $("uploadBtn"), cancelEditBtn: $("cancelEditBtn"), uploadFormTitle: $("uploadFormTitle"), uploadStatus: $("uploadStatus"), refreshBtn: $("refreshBtn"),
  statusFilter: $("statusFilter"), submissionsList: $("submissionsList")
};

els.loginBtn.addEventListener("click", login);
els.loginCode.addEventListener("keydown", e => { if (e.key === "Enter") login(); });
els.logoutBtn.addEventListener("click", logout);
els.uploadBtn.addEventListener("click", saveSurvey);
els.cancelEditBtn.addEventListener("click", cancelEdit);
els.refreshBtn.addEventListener("click", loadSubmissions);
els.statusFilter.addEventListener("change", renderSubmissions);

if (LOCAL_PREVIEW) {
  els.setupNotice.hidden = false;
} else {
  els.setupNotice.hidden = true;
  if (state.token) restoreSession();
}

async function api(action, payload = {}) {
  if (LOCAL_PREVIEW) return localApi(action, payload);
  const response = await fetch(ADMIN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, token: state.token, ...payload })
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Request failed");
  return result;
}

function localApi(action, payload) {
  const key = "rslPreviewSubmissions";
  const rows = JSON.parse(localStorage.getItem(key) || "[]");
  if (action === "login") {
    const email = (payload.email || "preview@example.com").trim();
    return Promise.resolve({ ok: true, token: "preview-token", user: { email, role: "owner" } });
  }
  if (action === "session") return Promise.resolve({ ok: true, user: { email: "preview@example.com", role: "owner" } });
  if (action === "list") return Promise.resolve({ ok: true, submissions: rows });
  if (action === "upload") {
    const row = { ...payload.metadata, id: `PREVIEW-${Date.now()}`, uploader: state.user.email, status: "submitted", createdAt: new Date().toISOString(), dataFileName: payload.dataFile?.name || "", supportFileName: payload.supportFile?.name || "" };
    rows.unshift(row); localStorage.setItem(key, JSON.stringify(rows));
    return Promise.resolve({ ok: true, submission: row });
  }
  if (action === "update") {
    const row = rows.find(x => x.id === payload.id);
    if (!row) throw new Error("Submission not found");
    Object.assign(row, payload.metadata || {});
    localStorage.setItem(key, JSON.stringify(rows)); return Promise.resolve({ ok: true });
  }
  if (action === "status") {
    const row = rows.find(x => x.id === payload.id); if (row) row.status = payload.status;
    localStorage.setItem(key, JSON.stringify(rows)); return Promise.resolve({ ok: true });
  }
  throw new Error("Unsupported preview action");
}

async function login() {
  const email = els.loginEmail.value.trim();
  const code = els.loginCode.value;
  if (!email || !code) { els.loginStatus.textContent = "Enter your approved email and access code."; return; }
  els.loginBtn.disabled = true; els.loginStatus.textContent = "Signing in…";
  try {
    const result = await api("login", { email, code });
    state.token = result.token; state.user = result.user;
    sessionStorage.setItem("rslAdminToken", state.token);
    showDashboard(); await loadSubmissions();
  } catch (error) { els.loginStatus.textContent = error.message; }
  finally { els.loginBtn.disabled = false; }
}

async function restoreSession() {
  try { const result = await api("session"); state.user = result.user; showDashboard(); await loadSubmissions(); }
  catch { logout(); }
}

function showDashboard() {
  els.loginPanel.hidden = true; els.dashboard.hidden = false;
  els.roleChip.textContent = state.user.role; els.signedInAs.textContent = state.user.email;
  els.loginCode.value = "";
}

function logout() {
  state.token = ""; state.user = null; sessionStorage.removeItem("rslAdminToken");
  els.dashboard.hidden = true; els.loginPanel.hidden = false; els.loginStatus.textContent = "Signed out.";
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", base64: String(reader.result).split(",")[1] });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function saveSurvey() {
  const file = els.surveyFile.files[0];
  if (!els.surveyName.value.trim() || (!state.editingId && !file)) { els.uploadStatus.textContent = state.editingId ? "Survey name is required." : "Survey name and a data file are required."; return; }
  els.uploadBtn.disabled = true; els.uploadStatus.textContent = "Preparing upload…";
  try {
    const metadata = {
      name: els.surveyName.value.trim(), type: els.surveyType.value, date: els.surveyDate.value,
      observer: els.observer.value.trim(), detectorModel: els.detectorModel.value.trim(), detectorId: els.detectorId.value.trim(),
      detectorHeight: els.detectorHeight.value.trim(), location: els.locationName.value.trim(), notes: els.surveyNotes.value.trim()
    };
    if (state.editingId) {
      await api("update", { id: state.editingId, metadata });
      els.uploadStatus.textContent = "Survey details updated.";
    } else {
      const [dataFile, supportFile] = await Promise.all([readFile(file), readFile(els.supportFile.files[0])]);
      await api("upload", { metadata, dataFile, supportFile });
      els.uploadStatus.textContent = "Survey saved.";
    }
    clearUploadForm(); await loadSubmissions();
  } catch (error) { els.uploadStatus.textContent = error.message; }
  finally { els.uploadBtn.disabled = false; }
}

function clearUploadForm() {
  state.editingId = "";
  [els.surveyName, els.observer, els.detectorModel, els.detectorId, els.detectorHeight, els.locationName, els.surveyNotes].forEach(el => el.value = "");
  els.surveyType.value = "walking"; els.surveyDate.value = "";
  els.surveyFile.value = ""; els.supportFile.value = "";
  els.uploadFormTitle.textContent = "Upload survey";
  els.uploadBtn.textContent = "Save survey";
  els.cancelEditBtn.hidden = true;
  els.surveyFile.closest("label").hidden = false;
  els.supportFile.closest("label").hidden = false;
}

function startEdit(row) {
  state.editingId = row.id;
  els.surveyName.value = row.name || ""; els.surveyType.value = row.type || "walking"; els.surveyDate.value = formatDateInput(row.date);
  els.observer.value = row.observer || ""; els.detectorModel.value = row.detectorModel || ""; els.detectorId.value = row.detectorId || "";
  els.detectorHeight.value = row.detectorHeight || ""; els.locationName.value = row.location || ""; els.surveyNotes.value = row.notes || "";
  els.uploadFormTitle.textContent = "Edit survey details"; els.uploadBtn.textContent = "Save changes"; els.cancelEditBtn.hidden = false;
  els.surveyFile.closest("label").hidden = true; els.supportFile.closest("label").hidden = true;
  els.uploadStatus.textContent = state.user.role === "owner" ? "Editing survey details. Original files remain unchanged." : "Editing your unpublished survey. Original files remain unchanged.";
  window.scrollTo({top:0,behavior:"smooth"});
}
function cancelEdit(){ clearUploadForm(); els.uploadStatus.textContent = "Editing canceled."; }
function formatDateInput(value){ const s=String(value||""); const m=s.match(/\d{4}-\d{2}-\d{2}/); return m ? m[0] : ""; }

async function loadSubmissions() {
  els.submissionsList.innerHTML = "<p class='help'>Loading…</p>";
  try { const result = await api("list"); state.submissions = result.submissions || []; renderSubmissions(); }
  catch (error) { els.submissionsList.innerHTML = `<p class="help">${escapeHtml(error.message)}</p>`; }
}

function renderSubmissions() {
  const filter = els.statusFilter.value;
  const rows = state.submissions.filter(row => filter === "all" || row.status === filter);
  if (!rows.length) { els.submissionsList.innerHTML = "<p class='help'>No matching submissions.</p>"; return; }
  els.submissionsList.innerHTML = "";
  rows.forEach(row => {
    const item = document.createElement("article"); item.className = "submission-item";
    const isOwner = state.user.role === "owner";
    const ownsRow = String(row.uploader || "").toLowerCase() === String(state.user.email || "").toLowerCase();
    const canEdit = isOwner || (ownsRow && !["published","hidden","rejected"].includes(String(row.status || "").toLowerCase()));
    const ownerActions = isOwner ? `<button data-status="published">Publish</button><button data-status="hidden">Hide</button><button data-status="rejected">Reject</button>` : "";
    const editAction = canEdit ? `<button data-edit="${escapeHtml(row.id)}">${isOwner && !ownsRow ? "Edit survey" : "Edit my survey"}</button>` : "";
    item.innerHTML = `<div class="submission-top"><div><h3 class="submission-title">${escapeHtml(row.name || "Untitled survey")}</h3>
      <div class="submission-meta">${escapeHtml(row.type || "Other")} · ${escapeHtml(row.date || "No date")}<br>
      ${escapeHtml(row.observer || row.uploader || "Unknown observer")} · ${escapeHtml(row.detectorModel || "Detector not listed")}<br>
      ${escapeHtml(row.location || "Location not listed")}<br>File: ${escapeHtml(row.dataFileName || "—")}</div></div>
      <span class="status-badge">${escapeHtml(row.status || "submitted")}</span></div>
      ${row.notes ? `<p class="help">${escapeHtml(row.notes)}</p>` : ""}
      <div class="submission-actions">${editAction}${ownerActions}</div>`;
    item.querySelectorAll("[data-status]").forEach(btn => btn.addEventListener("click", () => changeStatus(row.id, btn.dataset.status)));
    const editBtn = item.querySelector("[data-edit]"); if (editBtn) editBtn.addEventListener("click", () => startEdit(row));
    els.submissionsList.appendChild(item);
  });
}

async function changeStatus(id, status) {
  try { await api("status", { id, status }); await loadSubmissions(); }
  catch (error) { alert(error.message); }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
