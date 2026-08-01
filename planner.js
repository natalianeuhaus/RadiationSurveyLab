"use strict";

const FT_TO_M = 0.3048;
const MPH_TO_MPS = 0.44704;
const EARTH_R = 6378137;

const map = L.map("map", { zoomControl: false, preferCanvas: true, zoomSnap: 0.25 })
  .setView([43.1117, -79.0396], 13);
L.control.zoom({ position: "bottomright" }).addTo(map);

const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 20,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);
const satellite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxNativeZoom: 19, maxZoom: 21, attribution: "Esri World Imagery" }
);
const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  maxZoom: 17,
  attribution: "OpenTopoMap"
});
const layerControl = L.control.layers({ Streets: street, Satellite: satellite, Topographic: topo }, {}, { position: "topright" }).addTo(map);

const drawnItems = new L.FeatureGroup().addTo(map);
const routeLayer = new L.FeatureGroup().addTo(map);
const drawControl = new L.Control.Draw({
  draw: { polygon: { allowIntersection: false, showArea: true }, polyline: false, rectangle: false, circle: false, circlemarker: false, marker: false },
  edit: { featureGroup: drawnItems, remove: true }
});
map.addControl(drawControl);

let surveyPolygon = null;
let routeLatLngs = [];
let passCount = 0;
let searchMarker = null;
let importedSurveyCounter = 0;
const importedSurveys = new Map();

const els = {
  locationSearch: document.getElementById("locationSearch"),
  locationSearchBtn: document.getElementById("locationSearchBtn"),
  searchStatus: document.getElementById("searchStatus"),
  drawAreaBtn: document.getElementById("drawAreaBtn"),
  clearBtn: document.getElementById("clearBtn"),
  generateBtn: document.getElementById("generateBtn"),
  missionName: document.getElementById("missionName"),
  altitude: document.getElementById("altitude"),
  speed: document.getElementById("speed"),
  spacing: document.getElementById("spacing"),
  angle: document.getElementById("angle"),
  showWaypoints: document.getElementById("showWaypoints"),
  distanceStat: document.getElementById("distanceStat"),
  timeStat: document.getElementById("timeStat"),
  passesStat: document.getElementById("passesStat"),
  waypointsStat: document.getElementById("waypointsStat"),
  batteryNote: document.getElementById("batteryNote"),
  exportButtons: [...document.querySelectorAll("[data-export]")],
  communitySurveyName: document.getElementById("communitySurveyName"),
  communityObserver: document.getElementById("communityObserver"),
  communitySurveyType: document.getElementById("communitySurveyType"),
  communityDetector: document.getElementById("communityDetector"),
  communityDate: document.getElementById("communityDate"),
  communityNotes: document.getElementById("communityNotes"),
  communityFile: document.getElementById("communityFile"),
  importCommunityBtn: document.getElementById("importCommunityBtn"),
  communityStatus: document.getElementById("communityStatus"),
  communitySurveyList: document.getElementById("communitySurveyList")
};

els.locationSearchBtn.addEventListener("click", searchLocation);
els.locationSearch.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchLocation();
  }
});
els.drawAreaBtn.addEventListener("click", () => new L.Draw.Polygon(map, drawControl.options.draw.polygon).enable());
els.clearBtn.addEventListener("click", clearAll);
els.generateBtn.addEventListener("click", generateRoute);
els.showWaypoints.addEventListener("change", renderRoute);
els.exportButtons.forEach(btn => btn.addEventListener("click", () => exportRoute(btn.dataset.export)));
els.importCommunityBtn.addEventListener("click", importCommunitySurveys);


function parseCoordinates(value) {
  const match = value.trim().match(/^\s*([+-]?\d+(?:\.\d+)?)\s*[, ]\s*([+-]?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function placeSearchMarker(lat, lng, label) {
  if (searchMarker) map.removeLayer(searchMarker);
  searchMarker = L.marker([lat, lng]).addTo(map).bindPopup(label);
  map.setView([lat, lng], Math.max(map.getZoom(), 18));
  searchMarker.openPopup();
}

async function searchLocation() {
  const query = els.locationSearch.value.trim();
  if (!query) {
    els.searchStatus.textContent = "Enter an address or latitude, longitude.";
    return;
  }

  const coords = parseCoordinates(query);
  if (coords) {
    placeSearchMarker(coords.lat, coords.lng, `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
    els.searchStatus.textContent = `Centered on ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}.`;
    return;
  }

  els.locationSearchBtn.disabled = true;
  els.searchStatus.textContent = "Searching address…";
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error(`Search failed (${response.status})`);
    const results = await response.json();
    if (!results.length) {
      els.searchStatus.textContent = "No address match found. Try including city, state, and ZIP.";
      return;
    }
    const result = results[0];
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    placeSearchMarker(lat, lng, result.display_name);
    els.searchStatus.textContent = result.display_name;
  } catch (error) {
    console.error(error);
    els.searchStatus.textContent = "Address search could not connect. Coordinates will still work offline.";
  } finally {
    els.locationSearchBtn.disabled = false;
  }
}

map.on(L.Draw.Event.CREATED, event => {
  drawnItems.clearLayers();
  routeLayer.clearLayers();
  surveyPolygon = event.layer;
  drawnItems.addLayer(surveyPolygon);
  map.fitBounds(surveyPolygon.getBounds(), { padding: [40, 40] });
  resetStats("Survey area ready. Choose settings and generate the path.");
});

map.on(L.Draw.Event.EDITED, event => {
  event.layers.eachLayer(layer => { surveyPolygon = layer; });
  routeLayer.clearLayers();
  routeLatLngs = [];
  resetStats("Area changed. Generate the flight path again.");
});

map.on(L.Draw.Event.DELETED, clearAll);

function clearAll() {
  drawnItems.clearLayers();
  routeLayer.clearLayers();
  surveyPolygon = null;
  routeLatLngs = [];
  passCount = 0;
  resetStats("Draw an area to begin.");
}

function resetStats(message) {
  els.distanceStat.textContent = "—";
  els.timeStat.textContent = "—";
  els.passesStat.textContent = "—";
  els.waypointsStat.textContent = "—";
  els.batteryNote.textContent = message;
  els.exportButtons.forEach(button => { button.disabled = true; });
}

function getRing() {
  if (!surveyPolygon) return null;
  const nested = surveyPolygon.getLatLngs();
  return nested[0].map(p => ({ lat: p.lat, lng: p.lng }));
}

function project(lat, lng, origin) {
  const x = (lng - origin.lng) * Math.PI / 180 * EARTH_R * Math.cos(origin.lat * Math.PI / 180);
  const y = (lat - origin.lat) * Math.PI / 180 * EARTH_R;
  return { x, y };
}
function unproject(x, y, origin) {
  return {
    lat: origin.lat + (y / EARTH_R) * 180 / Math.PI,
    lng: origin.lng + (x / (EARTH_R * Math.cos(origin.lat * Math.PI / 180))) * 180 / Math.PI
  };
}
function rotate(point, radians) {
  const c = Math.cos(radians), s = Math.sin(radians);
  return { x: point.x * c - point.y * s, y: point.x * s + point.y * c };
}

function horizontalIntersections(points, y) {
  const xs = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      const t = (y - a.y) / (b.y - a.y);
      xs.push(a.x + t * (b.x - a.x));
    }
  }
  return xs.sort((a, b) => a - b);
}

function generateRoute() {
  const ring = getRing();
  if (!ring || ring.length < 3) {
    els.batteryNote.textContent = "Draw a survey polygon first.";
    return;
  }
  const spacingM = Number(els.spacing.value) * FT_TO_M;
  const speedMps = Number(els.speed.value) * MPH_TO_MPS;
  const altitudeFt = Number(els.altitude.value);
  const angleDeg = Number(els.angle.value);
  if (!(spacingM > 0 && speedMps > 0 && altitudeFt > 0)) {
    els.batteryNote.textContent = "Enter valid positive flight settings.";
    return;
  }

  const origin = {
    lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length,
    lng: ring.reduce((s, p) => s + p.lng, 0) / ring.length
  };
  const theta = angleDeg * Math.PI / 180;
  const rotated = ring.map(p => rotate(project(p.lat, p.lng, origin), -theta));
  const ys = rotated.map(p => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const lines = [];
  let lineIndex = 0;

  for (let y = minY + spacingM / 2; y <= maxY - spacingM / 4; y += spacingM) {
    const xs = horizontalIntersections(rotated, y);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      let segment = [{ x: xs[i], y }, { x: xs[i + 1], y }];
      if (lineIndex % 2 === 1) segment.reverse();
      lines.push(segment);
      lineIndex++;
    }
  }

  if (!lines.length) {
    els.batteryNote.textContent = "The spacing is wider than the survey area. Reduce line spacing.";
    return;
  }

  routeLatLngs = [];
  lines.forEach(segment => segment.forEach(point => {
    const restored = rotate(point, theta);
    routeLatLngs.push(unproject(restored.x, restored.y, origin));
  }));
  passCount = lines.length;
  renderRoute();

  const distanceM = pathDistance(routeLatLngs);
  const seconds = distanceM / speedMps;
  els.distanceStat.textContent = formatDistance(distanceM);
  els.timeStat.textContent = formatDuration(seconds);
  els.passesStat.textContent = String(passCount);
  els.waypointsStat.textContent = String(routeLatLngs.length);
  els.batteryNote.textContent = seconds > 1200
    ? "Estimated route exceeds 20 minutes. Split it into smaller missions and preserve a safe battery reserve."
    : "Estimate excludes takeoff, landing, turns, wind correction, obstacle avoidance, and battery reserve.";
  els.exportButtons.forEach(button => { button.disabled = false; });
}

function renderRoute() {
  routeLayer.clearLayers();
  if (!routeLatLngs.length) return;
  const polyline = L.polyline(routeLatLngs, { color: "#651418", weight: 4, opacity: 0.95 }).addTo(routeLayer);
  if (els.showWaypoints.checked) {
    routeLatLngs.forEach((p, index) => {
      const icon = L.divIcon({ className: "waypoint-icon", html: String(index + 1), iconSize: [24, 24] });
      L.marker(p, { icon, interactive: false }).addTo(routeLayer);
    });
  }
  map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
}

function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const lat1 = a.lat * rad, lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
function pathDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i]);
  return total;
}
function formatDistance(m) {
  const ft = m / FT_TO_M;
  return ft < 5280 ? `${Math.round(ft).toLocaleString()} ft` : `${(ft / 5280).toFixed(2)} mi`;
}
function formatDuration(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}m ${String(sec).padStart(2, "0")}s`;
}
function safeName() {
  return (els.missionName.value.trim() || "survey_mission").replace(/[^a-z0-9_-]+/gi, "_");
}
function downloadBlob(content, type, extension) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName()}.${extension}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function routeFeatureCollection() {
  const altitudeFt = Number(els.altitude.value);
  const speedMph = Number(els.speed.value);
  return {
    type: "FeatureCollection",
    properties: { missionName: els.missionName.value, altitudeFt, speedMph, spacingFt: Number(els.spacing.value), angleDeg: Number(els.angle.value) },
    features: [
      {
        type: "Feature",
        properties: { featureType: "planned-flight-path", altitudeFt, speedMph, passes: passCount },
        geometry: { type: "LineString", coordinates: routeLatLngs.map(p => [p.lng, p.lat, altitudeFt * FT_TO_M]) }
      },
      ...routeLatLngs.map((p, i) => ({
        type: "Feature",
        properties: { featureType: "waypoint", waypoint: i + 1, altitudeFt, speedMph },
        geometry: { type: "Point", coordinates: [p.lng, p.lat, altitudeFt * FT_TO_M] }
      }))
    ]
  };
}

async function exportRoute(format) {
  if (!routeLatLngs.length) return;
  if (format === "geojson") {
    downloadBlob(JSON.stringify(routeFeatureCollection(), null, 2), "application/geo+json", "geojson");
  } else if (format === "csv") {
    const alt = Number(els.altitude.value);
    const speed = Number(els.speed.value);
    const rows = ["waypoint,latitude,longitude,altitude_ft,speed_mph"];
    routeLatLngs.forEach((p, i) => rows.push(`${i + 1},${p.lat.toFixed(8)},${p.lng.toFixed(8)},${alt},${speed}`));
    downloadBlob(rows.join("\n"), "text/csv", "csv");
  } else if (format === "kml") {
    downloadBlob(buildKml(), "application/vnd.google-earth.kml+xml", "kml");
  } else if (format === "kmz") {
    try {
      const blob = await buildDjiKmz();
      downloadBlob(blob, "application/vnd.google-earth.kmz", "kmz");
    } catch (error) {
      console.error(error);
      alert("The experimental KMZ could not be created in this browser. GeoJSON, KML and CSV remain available.");
    }
  }
}

function xmlEscape(value) {
  return String(value).replace(/[<>&'\"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '\"': "&quot;" }[c]));
}
function buildKml() {
  const name = xmlEscape(els.missionName.value || "Survey mission");
  const altitudeM = Number(els.altitude.value) * FT_TO_M;
  const coords = routeLatLngs.map(p => `${p.lng},${p.lat},${altitudeM.toFixed(2)}`).join(" ");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document><name>${name}</name>\n<Placemark><name>Planned flight path</name><LineString><altitudeMode>relativeToGround</altitudeMode><coordinates>${coords}</coordinates></LineString></Placemark>\n${routeLatLngs.map((p,i)=>`<Placemark><name>WP ${i+1}</name><Point><altitudeMode>relativeToGround</altitudeMode><coordinates>${p.lng},${p.lat},${altitudeM.toFixed(2)}</coordinates></Point></Placemark>`).join("\n")}\n</Document></kml>`;
}

async function buildDjiKmz() {
  if (typeof JSZip === "undefined") throw new Error("JSZip not loaded");
  const zip = new JSZip();
  const folder = zip.folder("wpmz");
  const name = xmlEscape(els.missionName.value || "Survey mission");
  const altitudeM = Number(els.altitude.value) * FT_TO_M;
  const speedMps = Number(els.speed.value) * MPH_TO_MPS;
  const now = Date.now();
  const placemarks = routeLatLngs.map((p, i) => `
    <Placemark>
      <Point><coordinates>${p.lng},${p.lat}</coordinates></Point>
      <wpml:index>${i}</wpml:index>
      <wpml:executeHeight>${altitudeM.toFixed(2)}</wpml:executeHeight>
      <wpml:waypointSpeed>${speedMps.toFixed(2)}</wpml:waypointSpeed>
      <wpml:waypointHeadingParam><wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode></wpml:waypointHeadingParam>
      <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode><wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist></wpml:waypointTurnParam>
      <wpml:useStraightLine>1</wpml:useStraightLine>
    </Placemark>`).join("");

  const template = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
<Document><wpml:author>Natalia Neuhaus</wpml:author><wpml:createTime>${now}</wpml:createTime><wpml:updateTime>${now}</wpml:updateTime>
<wpml:missionConfig><wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode><wpml:finishAction>goHome</wpml:finishAction><wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost><wpml:executeRCLostAction>goBack</wpml:executeRCLostAction><wpml:globalTransitionalSpeed>${speedMps.toFixed(2)}</wpml:globalTransitionalSpeed><wpml:droneInfo><wpml:droneEnumValue>68</wpml:droneEnumValue><wpml:droneSubEnumValue>0</wpml:droneSubEnumValue></wpml:droneInfo></wpml:missionConfig>
<Folder><wpml:templateType>waypoint</wpml:templateType><wpml:templateId>0</wpml:templateId><wpml:waylineCoordinateSysParam><wpml:coordinateMode>WGS84</wpml:coordinateMode><wpml:heightMode>relativeToStartPoint</wpml:heightMode></wpml:waylineCoordinateSysParam><wpml:autoFlightSpeed>${speedMps.toFixed(2)}</wpml:autoFlightSpeed><wpml:globalHeight>${altitudeM.toFixed(2)}</wpml:globalHeight><name>${name}</name>${placemarks}</Folder>
</Document></kml>`;

  const waylines = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
<Document><wpml:missionConfig><wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode><wpml:finishAction>goHome</wpml:finishAction><wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost><wpml:executeRCLostAction>goBack</wpml:executeRCLostAction><wpml:globalTransitionalSpeed>${speedMps.toFixed(2)}</wpml:globalTransitionalSpeed><wpml:droneInfo><wpml:droneEnumValue>68</wpml:droneEnumValue><wpml:droneSubEnumValue>0</wpml:droneSubEnumValue></wpml:droneInfo></wpml:missionConfig>
<Folder><wpml:templateId>0</wpml:templateId><wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode><wpml:waylineId>0</wpml:waylineId><wpml:distance>${pathDistance(routeLatLngs).toFixed(2)}</wpml:distance><wpml:duration>${(pathDistance(routeLatLngs)/speedMps).toFixed(2)}</wpml:duration><wpml:autoFlightSpeed>${speedMps.toFixed(2)}</wpml:autoFlightSpeed>${placemarks}</Folder>
</Document></kml>`;

  folder.file("template.kml", template);
  folder.file("waylines.wpml", waylines);
  folder.file("README.txt", "EXPERIMENTAL DJI WPML/KMZ export. Validate in a compatible mission viewer/installer and conduct a short test over an empty controlled area before operational use. Do not rely on this file without verification.");
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}


function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_.-]+/g, "");
}

function parseCsvRows(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = "";
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = "";
      if (row.some(value => String(value).trim() !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some(value => String(value).trim() !== "")) rows.push(row);
  return rows;
}

function firstMatchingIndex(headers, names) {
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex(header => names.includes(header));
}

function parseCsvSurvey(text) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error("CSV contains no data rows.");
  const headers = rows[0];
  const latIndex = firstMatchingIndex(headers, ["lat", "latitude", "gpslatitude"]);
  const lngIndex = firstMatchingIndex(headers, ["lon", "lng", "long", "longitude", "gpslongitude"]);
  if (latIndex < 0 || lngIndex < 0) throw new Error("CSV needs latitude and longitude columns.");
  const cpmIndex = firstMatchingIndex(headers, ["cpm", "countsperminute", "countratecpm"]);
  const cpsIndex = firstMatchingIndex(headers, ["cps", "countspersecond", "countratecps"]);
  const doseIndex = firstMatchingIndex(headers, ["dose", "doserate", "usvh", "µsvh", "microsieverthour"]);
  const timeIndex = firstMatchingIndex(headers, ["timestamp", "datetime", "dateandtime", "time"]);
  const points = [];
  rows.slice(1).forEach(row => {
    const lat = Number(row[latIndex]);
    const lng = Number(row[lngIndex]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    points.push({
      lat, lng,
      cpm: cpmIndex >= 0 ? Number(row[cpmIndex]) : null,
      cps: cpsIndex >= 0 ? Number(row[cpsIndex]) : null,
      doseRate: doseIndex >= 0 ? Number(row[doseIndex]) : null,
      timestamp: timeIndex >= 0 ? row[timeIndex] : null
    });
  });
  if (!points.length) throw new Error("No valid coordinates were found in the CSV.");
  return points;
}

function collectGeoJsonPoints(input) {
  const points = [];
  function addPoint(coords, props = {}) {
    if (!Array.isArray(coords) || coords.length < 2) return;
    const lng = Number(coords[0]), lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    points.push({ lat, lng, cpm: Number(props.cpm ?? props.CPM) || null, cps: Number(props.cps ?? props.CPS) || null, doseRate: Number(props.dose_rate ?? props.doseRate ?? props.usvh) || null, timestamp: props.timestamp ?? props.time ?? null });
  }
  function walk(feature) {
    if (!feature) return;
    if (feature.type === "FeatureCollection") return feature.features.forEach(walk);
    if (feature.type === "Feature") {
      const g = feature.geometry || {};
      if (g.type === "Point") addPoint(g.coordinates, feature.properties || {});
      else if (g.type === "LineString") g.coordinates.forEach(c => addPoint(c, feature.properties || {}));
      else if (g.type === "MultiPoint") g.coordinates.forEach(c => addPoint(c, feature.properties || {}));
      else if (g.type === "MultiLineString") g.coordinates.flat().forEach(c => addPoint(c, feature.properties || {}));
      return;
    }
    if (input.type && input.coordinates) walk({ type: "Feature", geometry: input, properties: {} });
  }
  walk(input);
  if (!points.length) throw new Error("No point or line coordinates found in GeoJSON.");
  return points;
}

function parseGpxSurvey(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("GPX file could not be read.");
  const nodes = [...xml.querySelectorAll("trkpt, rtept, wpt")];
  const points = nodes.map(node => ({
    lat: Number(node.getAttribute("lat")),
    lng: Number(node.getAttribute("lon")),
    timestamp: node.querySelector("time")?.textContent || null,
    cpm: null, cps: null, doseRate: null
  })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!points.length) throw new Error("No GPS points found in GPX.");
  return points;
}

async function readSurveyFile(file) {
  const text = await file.text();
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "gpx") return parseGpxSurvey(text);
  if (extension === "json" || extension === "geojson") return collectGeoJsonPoints(JSON.parse(text));
  return parseCsvSurvey(text);
}

function measurementLabel(point) {
  const parts = [];
  if (Number.isFinite(point.cpm)) parts.push(`${point.cpm.toLocaleString()} CPM`);
  if (Number.isFinite(point.cps)) parts.push(`${point.cps.toLocaleString()} CPS`);
  if (Number.isFinite(point.doseRate)) parts.push(`${point.doseRate} µSv/h`);
  if (point.timestamp) parts.push(String(point.timestamp));
  return parts.join(" · ") || "GPS survey point";
}

function renderImportedSurvey(id, metadata, points) {
  const group = L.featureGroup();
  if (points.length > 1) {
    L.polyline(points.map(p => [p.lat, p.lng]), { color: "#651418", weight: 3, opacity: 0.78, dashArray: metadata.type === "walking" ? "7 5" : null }).addTo(group);
  }
  const step = Math.max(1, Math.ceil(points.length / 700));
  points.forEach((point, index) => {
    if (index % step !== 0 && index !== points.length - 1) return;
    L.circleMarker([point.lat, point.lng], { radius: 4, color: "#450c0f", weight: 1, fillColor: "#651418", fillOpacity: 0.82 })
      .bindPopup(`<strong>${xmlEscape(metadata.name)}</strong><br>${xmlEscape(measurementLabel(point))}<br><small>${xmlEscape(metadata.observer || "Observer not entered")} · ${xmlEscape(metadata.detector || "Detector not entered")}</small>`)
      .addTo(group);
  });
  group.addTo(map);
  layerControl.addOverlay(group, metadata.name);
  importedSurveys.set(id, { group, metadata, points });
  map.fitBounds(group.getBounds(), { padding: [35, 35] });
}

function refreshCommunitySurveyList() {
  els.communitySurveyList.innerHTML = "";
  importedSurveys.forEach((survey, id) => {
    const item = document.createElement("div");
    item.className = "survey-item";
    const head = document.createElement("div");
    head.className = "survey-item-head";
    const title = document.createElement("strong");
    title.textContent = survey.metadata.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeImportedSurvey(id));
    head.append(title, remove);
    const details = document.createElement("p");
    details.textContent = `${survey.metadata.type} · ${survey.points.length.toLocaleString()} points · ${survey.metadata.observer || "observer not entered"} · ${survey.metadata.detector || "detector not entered"}`;
    item.append(head, details);
    els.communitySurveyList.appendChild(item);
  });
}

function removeImportedSurvey(id) {
  const survey = importedSurveys.get(id);
  if (!survey) return;
  map.removeLayer(survey.group);
  layerControl.removeLayer(survey.group);
  importedSurveys.delete(id);
  refreshCommunitySurveyList();
  els.communityStatus.textContent = "Survey removed. Original uploaded file was not changed.";
}

async function importCommunitySurveys() {
  const files = [...els.communityFile.files];
  if (!files.length) {
    els.communityStatus.textContent = "Choose at least one CSV, GeoJSON, JSON, or GPX file.";
    return;
  }
  els.importCommunityBtn.disabled = true;
  let added = 0;
  const errors = [];
  for (const file of files) {
    try {
      const points = await readSurveyFile(file);
      const id = `community-${++importedSurveyCounter}`;
      const baseName = els.communitySurveyName.value.trim() || file.name.replace(/\.[^.]+$/, "");
      const metadata = {
        name: files.length > 1 ? `${baseName} — ${file.name}` : baseName,
        observer: els.communityObserver.value.trim(),
        type: els.communitySurveyType.value,
        detector: els.communityDetector.value.trim(),
        date: els.communityDate.value,
        notes: els.communityNotes.value.trim(),
        sourceFile: file.name
      };
      renderImportedSurvey(id, metadata, points);
      added++;
    } catch (error) {
      console.error(error);
      errors.push(`${file.name}: ${error.message}`);
    }
  }
  refreshCommunitySurveyList();
  els.communityStatus.textContent = added
    ? `Added ${added} survey file${added === 1 ? "" : "s"}.${errors.length ? ` Could not read: ${errors.join("; ")}` : ""}`
    : `No surveys added. ${errors.join("; ")}`;
  els.importCommunityBtn.disabled = false;
}
