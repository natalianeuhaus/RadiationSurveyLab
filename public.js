"use strict";

const PUBLIC_API_URL = "https://script.google.com/macros/s/AKfycbxI4Ipy5_29hvX05kEhbPb4d8GEc-G3BP7V0POXdjL5Z37Oq6TcSNKqw_OvHwSWfQjjqw/exec";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const publishedSurveyLayers = new Map();
let publishedProjects = [];

const portalEls = {
  refreshBtn: document.getElementById("refreshBtn"),
  libraryStatus: document.getElementById("libraryStatus"),
  surveyList: document.getElementById("surveyList"),
  legendBtn: document.getElementById("legendBtn"),
  legendPanel: document.getElementById("legendPanel"),
  legendClose: document.getElementById("legendClose"),
  submitBtn: document.getElementById("submitSurveyBtn"),
  submitterEmail: document.getElementById("submitterEmail"),
  submitterPhone: document.getElementById("submitterPhone"),
  detectorHeight: document.getElementById("detectorHeight"),
  locationName: document.getElementById("locationName"),
  dataSource: document.getElementById("dataSource"),
  supportFile: document.getElementById("supportFile"),
  publishConsent: document.getElementById("publishConsent"),
  websiteField: document.getElementById("websiteField")
};

portalEls.refreshBtn.addEventListener("click", loadPublishedProjects);
portalEls.legendBtn.addEventListener("click", () => setLegend(portalEls.legendPanel.hidden));
portalEls.legendClose.addEventListener("click", () => setLegend(false));
portalEls.submitBtn.addEventListener("click", submitProject);

function setLegend(open) {
  portalEls.legendPanel.hidden = !open;
  portalEls.legendBtn.setAttribute("aria-expanded", String(open));
}

async function publicApi(action, payload = {}) {
  const response = await fetch(PUBLIC_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload })
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Request failed");
  return result;
}

async function loadPublishedProjects() {
  portalEls.libraryStatus.textContent = "Loading published projects…";
  portalEls.surveyList.innerHTML = "";

  try {
    const result = await publicApi("publicList");
    publishedProjects = result.surveys || [];
    renderPublishedLibrary();
    portalEls.libraryStatus.textContent = publishedProjects.length
      ? `${publishedProjects.length} published project${publishedProjects.length === 1 ? "" : "s"}.`
      : "No projects have been published yet.";
  } catch (error) {
    portalEls.libraryStatus.innerHTML = `<span class="loading-error">${escapePortalHtml(error.message)}</span>`;
  }
}

function renderPublishedLibrary() {
  portalEls.surveyList.innerHTML = "";

  publishedProjects.forEach(project => {
    const item = document.createElement("article");
    item.className = "public-survey-item";
    item.innerHTML = `
      <div class="public-survey-top">
        <label class="survey-toggle">
          <input type="checkbox" data-survey="${escapePortalHtml(project.id)}">
          <span>
            <h3>${escapePortalHtml(project.name || "Untitled project")}</h3>
            <span class="public-survey-meta">
              ${escapePortalHtml(methodLabel(project.type))} · ${escapePortalHtml(formatPortalDate(project.date))}<br>
              ${escapePortalHtml(project.observer || "Observer not listed")} · ${escapePortalHtml(project.detectorModel || "Instrument not listed")}<br>
              ${escapePortalHtml(project.location || "Location not listed")}
            </span>
          </span>
        </label>
        <span class="status-pill">Approved</span>
      </div>`;

    const checkbox = item.querySelector("input");
    checkbox.addEventListener("change", () => togglePublishedProject(project, checkbox.checked, checkbox));
    portalEls.surveyList.appendChild(item);
  });
}

async function togglePublishedProject(project, show, checkbox) {
  let layer = publishedSurveyLayers.get(project.id);

  if (!show) {
    if (layer) map.removeLayer(layer);
    return;
  }

  checkbox.disabled = true;
  try {
    if (!layer) {
      const result = await publicApi("publicData", { id: project.id });
      const points = parsePublishedSurvey(result.fileName, result.text);
      layer = buildPublishedLayer(project, points);
      publishedSurveyLayers.set(project.id, layer);
      layerControl.addOverlay(layer, `Published: ${project.name || "Untitled project"}`);
    }

    layer.addTo(map);
    if (layer.getBounds && layer.getBounds().isValid()) {
      map.fitBounds(layer.getBounds(), { padding: [35, 35] });
    }
  } catch (error) {
    checkbox.checked = false;
    alert(`Could not load ${project.name || "this project"}: ${error.message}`);
  } finally {
    checkbox.disabled = false;
  }
}

function parsePublishedSurvey(fileName, text) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".geojson") || lower.endsWith(".json")) return collectGeoJsonPoints(JSON.parse(text));
  if (lower.endsWith(".gpx")) return parseGpxSurvey(text);
  return parseCsvSurvey(text);
}

function buildPublishedLayer(project, points) {
  const group = L.featureGroup();
  const values = points.map(metricValue).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const latlngs = points.map(point => [point.lat, point.lng]);

  if (latlngs.length > 1 && project.type !== "stationary") {
    L.polyline(latlngs, {
      color: "#4d0f14",
      weight: 3,
      opacity: 0.68,
      dashArray: project.type === "drone" ? "8 5" : null
    }).addTo(group).bindPopup(projectSummaryHtml(project));
  }

  const step = Math.max(1, Math.ceil(points.length / 1200));
  points.forEach((point, index) => {
    if (index % step !== 0 && index !== points.length - 1) return;
    const value = metricValue(point);
    const normalized = Number.isFinite(value) && max > min ? (value - min) / (max - min) : 0.35;
    const radius = project.type === "stationary" ? 7 : 4;

    L.circleMarker([point.lat, point.lng], {
      radius,
      weight: 1,
      color: "#fff",
      fillColor: scaleColor(normalized),
      fillOpacity: 0.9
    }).addTo(group).bindPopup(projectPointHtml(project, point));
  });

  return group;
}

function metricValue(point) {
  for (const value of [point.cpm, point.cps, point.doseRate]) {
    if (Number.isFinite(value)) return value;
  }
  return NaN;
}

function scaleColor(value) {
  if (value < 0.25) return "#d9c8aa";
  if (value < 0.5) return "#b88961";
  if (value < 0.75) return "#6f161c";
  return "#26070a";
}

function projectSummaryHtml(project) {
  return `<div class="survey-tooltip"><strong>${escapePortalHtml(project.name)}</strong><br>
    ${escapePortalHtml(methodLabel(project.type))} · ${escapePortalHtml(formatPortalDate(project.date))}<br>
    ${escapePortalHtml(project.observer || "Observer not listed")}<br>
    ${escapePortalHtml(project.detectorModel || "Instrument not listed")}${project.detectorHeight ? ` · ${escapePortalHtml(project.detectorHeight)}` : ""}
    ${project.dataSource ? `<br>${escapePortalHtml(project.dataSource)}` : ""}
    ${project.notes ? `<br><br>${escapePortalHtml(project.notes)}` : ""}</div>`;
}

function projectPointHtml(project, point) {
  const values = [];
  if (Number.isFinite(point.cpm)) values.push(`${point.cpm} CPM`);
  if (Number.isFinite(point.cps)) values.push(`${point.cps} CPS`);
  if (Number.isFinite(point.doseRate)) values.push(`${point.doseRate} µSv/h`);

  return `<div class="survey-tooltip"><strong>${escapePortalHtml(project.name)}</strong><br>
    ${values.length ? values.join(" · ") : "Measurement point"}
    ${point.timestamp ? `<br>${escapePortalHtml(point.timestamp)}` : ""}<br>
    ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}</div>`;
}

function readFilePayload(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error(`${file.name} is larger than 8 MB. Please export or compress a smaller file.`));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type || "application/octet-stream",
      base64: String(reader.result).split(",")[1]
    });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function submitProject() {
  const dataFile = els.communityFile.files[0];
  const projectName = els.communitySurveyName.value.trim();
  const email = portalEls.submitterEmail.value.trim();

  if (portalEls.websiteField.value) return;
  if (!projectName) {
    els.communityStatus.textContent = "Enter a project name.";
    els.communitySurveyName.focus();
    return;
  }
  if (!email || !portalEls.submitterEmail.checkValidity()) {
    els.communityStatus.textContent = "Enter a valid contact email. It will remain private.";
    portalEls.submitterEmail.focus();
    return;
  }
  if (!dataFile) {
    els.communityStatus.textContent = "Choose a GPS-linked survey data file.";
    els.communityFile.focus();
    return;
  }
  if (!portalEls.publishConsent.checked) {
    els.communityStatus.textContent = "Confirm that you have permission to submit the project for review.";
    portalEls.publishConsent.focus();
    return;
  }

  portalEls.submitBtn.disabled = true;
  els.importCommunityBtn.disabled = true;
  els.communityStatus.textContent = "Preparing your project submission…";

  try {
    const [surveyFile, supportFile] = await Promise.all([
      readFilePayload(dataFile),
      readFilePayload(portalEls.supportFile.files[0])
    ]);

    const metadata = {
      name: projectName,
      type: els.communitySurveyType.value,
      date: els.communityDate.value,
      observer: els.communityObserver.value.trim(),
      detectorModel: els.communityDetector.value.trim(),
      detectorHeight: portalEls.detectorHeight.value.trim(),
      location: portalEls.locationName.value.trim(),
      dataSource: portalEls.dataSource.value.trim(),
      notes: els.communityNotes.value.trim(),
      submitterEmail: email,
      submitterPhone: portalEls.submitterPhone.value.trim(),
      publishConsent: true
    };

    const result = await publicApi("publicSubmit", { metadata, dataFile: surveyFile, supportFile, website: portalEls.websiteField.value });
    els.communityStatus.textContent = `Project submitted for private review. Reference: ${result.id || "received"}. Nothing appears publicly until it is approved.`;
    clearSubmissionForm();
  } catch (error) {
    els.communityStatus.textContent = error.message;
  } finally {
    portalEls.submitBtn.disabled = false;
    els.importCommunityBtn.disabled = false;
  }
}

function clearSubmissionForm() {
  els.communitySurveyName.value = "";
  els.communitySurveyType.value = "walking";
  els.communityDate.value = "";
  els.communityObserver.value = "";
  els.communityDetector.value = "";
  els.communityNotes.value = "";
  els.communityFile.value = "";
  portalEls.submitterEmail.value = "";
  portalEls.submitterPhone.value = "";
  portalEls.detectorHeight.value = "";
  portalEls.locationName.value = "";
  portalEls.dataSource.value = "";
  portalEls.supportFile.value = "";
  portalEls.publishConsent.checked = false;
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

function formatPortalDate(value) {
  const text = String(value || "");
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text || "No date";
}

function escapePortalHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[character]));
}

loadPublishedProjects();
