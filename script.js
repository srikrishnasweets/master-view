const API_URL = "https://script.google.com/macros/s/AKfycbyqL3PT6w6oXGEfgqCwG44Ahxu6o9dhm-7T4kPltKlP5OdAv4uYPo1vPM_WOlEmm3is/exec";
const TV_LOGIN_KEY = "tvLoginId";
const SHOW_CURRENT_SCREEN_ONLY = true;
const AUTO_REFRESH_MS = 30000;

let rawData = [];
let productsData = [];
let activeTvId = "";
let autoRefreshTimer = null;
let isRefreshInFlight = false;
let lastRowsFingerprint = "";

const appEl = document.getElementById("app");
const masterHeaderEl = document.getElementById("masterHeader");
const sectionHeaderEl = document.getElementById("sectionHeader");
const sectionListEl = document.getElementById("sectionList");
const prevBtnEl = document.getElementById("prevBtn");
const nextBtnEl = document.getElementById("nextBtn");
const productIndexEl = document.getElementById("productIndex");
const logoutBtnEl = document.getElementById("logoutBtn");
const tvIdBadgeEl = document.getElementById("tvIdBadge");
const tvLoginOverlayEl = document.getElementById("tvLoginOverlay");
const tvLoginFormEl = document.getElementById("tvLoginForm");
const tvIdInputEl = document.getElementById("tvIdInput");
const tvLoginErrorEl = document.getElementById("tvLoginError");

function normalizeTvId(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d+$/.test(text)) return String(Number(text));
  return text;
}

function setLoginError(message) {
  if (!tvLoginErrorEl) return;
  const errorMessage = String(message ?? "").trim();
  if (!errorMessage) {
    tvLoginErrorEl.hidden = true;
    tvLoginErrorEl.textContent = "";
    return;
  }
  tvLoginErrorEl.hidden = false;
  tvLoginErrorEl.textContent = errorMessage;
}

function normalizeKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getRowValue(row, aliases) {
  if (!row || typeof row !== "object") return "";
  const normalizedAliases = aliases.map(normalizeKey);
  const directKey = Object.keys(row).find((key) => normalizedAliases.includes(normalizeKey(key)));
  return directKey ? row[directKey] : "";
}

function getRowTvId(row) {
  return normalizeTvId(getRowValue(row, ["tvid", "tv id", "tv_id"]));
}

function getRowMaster(row) {
  return normalizeTvId(getRowValue(row, ["master"]));
}

function getRowGroup(row) {
  return normalizeTvId(getRowValue(row, ["group"]));
}

function getRowProduct(row) {
  return normalizeTvId(getRowValue(row, ["product"]));
}

function getRowPackFormat(row) {
  return normalizeTvId(getRowValue(row, ["packformat", "pack format", "pack_format"]));
}

function getRowQty(row) {
  return getRowValue(row, ["qty", "quantity"]);
}

function showLoginOverlay() {
  tvLoginOverlayEl.hidden = false;
  setLoginError("");
  window.setTimeout(() => tvIdInputEl.focus(), 0);
}

function hideLoginOverlay() {
  tvLoginOverlayEl.hidden = true;
}

function resetViewForLoggedOut() {
  rawData = [];
  productsData = [];
  lastRowsFingerprint = "";
  stopAutoRefresh();
  updateHeader([]);
  appEl.innerHTML = '<div class="loading-card single-card">Enter TV ID to continue.</div>';
  if (productIndexEl) productIndexEl.textContent = "0 / 0";
  if (prevBtnEl) prevBtnEl.disabled = true;
  if (nextBtnEl) nextBtnEl.disabled = true;
  updateTvIdBadge("");
}

function updateTvIdBadge(tvId) {
  if (!tvIdBadgeEl) return;
  const normalized = normalizeTvId(tvId);
  tvIdBadgeEl.textContent = normalized ? `TV ID: ${normalized}` : "TV ID: -";
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (!activeTvId) return;
  autoRefreshTimer = window.setInterval(() => {
    refreshRowsInBackground();
  }, AUTO_REFRESH_MS);
}

function buildApiUrl(tvId, currentOnly) {
  const normalizedTvId = normalizeTvId(tvId);
  const queryParts = [];
  if (normalizedTvId) queryParts.push(`tvId=${encodeURIComponent(normalizedTvId)}`);
  if (currentOnly) queryParts.push("currentOnly=true");
  if (!queryParts.length) return API_URL;
  const separator = API_URL.includes("?") ? "&" : "?";
  return `${API_URL}${separator}${queryParts.join("&")}`;
}

async function fetchRowsForTvId(tvId) {
  const res = await fetch(buildApiUrl(tvId, SHOW_CURRENT_SCREEN_ONLY));
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

function createRowsFingerprint(rows) {
  if (!Array.isArray(rows)) return "";
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return JSON.stringify(row);
      const sorted = {};
      Object.keys(row)
        .sort()
        .forEach((key) => {
          sorted[key] = row[key];
        });
      return JSON.stringify(sorted);
    })
    .sort()
    .join("|");
}

function applyRows(rows, tvId, options = {}) {
  const { forceRender = false, animate = false } = options;
  activeTvId = normalizeTvId(tvId);
  updateTvIdBadge(activeTvId);
  rawData = Array.isArray(rows) ? rows : [];

  const nextFingerprint = createRowsFingerprint(rawData);
  const changed = forceRender || nextFingerprint !== lastRowsFingerprint;
  if (changed) {
    lastRowsFingerprint = nextFingerprint;
    renderDataView({ animate });
  }

  return { matchCount: rawData.length, changed };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function updateHeader(rows) {
  const masters = [...new Set(rows.map((row) => getRowMaster(row)).filter(Boolean))].sort();
  const sections = [...new Set(rows.map((row) => getRowGroup(row)).filter(Boolean))].sort();

  if (!rows.length) {
    masterHeaderEl.textContent = "Master: -";
    sectionHeaderEl.textContent = "Section: -";
    sectionListEl.innerHTML = "";
    return;
  }

  if (masters.length === 1) {
    masterHeaderEl.textContent = `Master: ${masters[0]}`;
  } else if (masters.length > 1) {
    masterHeaderEl.textContent = `Masters: ${masters.slice(0, 3).join(", ")}${masters.length > 3 ? "..." : ""}`;
  } else {
    masterHeaderEl.textContent = "Master: -";
  }

  if (!sections.length) {
    sectionHeaderEl.textContent = "Section: -";
    sectionListEl.innerHTML = "";
    return;
  }

  if (sections.length === 1) {
    sectionHeaderEl.textContent = `Section: ${sections[0]}`;
    sectionListEl.innerHTML = "";
    return;
  }

  sectionHeaderEl.textContent = `Sections (${sections.length})`;
  sectionListEl.innerHTML = sections
    .map((section) => `<span class="section-pill">${escapeHtml(section)}</span>`)
    .join("");
}

function buildProductData(rows) {
  const map = {};

  rows.forEach((row) => {
    const master = getRowMaster(row);
    const product = getRowProduct(row) || "Unnamed Product";
    const screenKey = `${master || "-"}::${product}`;
    const qty = Number(getRowQty(row)) || 0;
    const format = (getRowPackFormat(row) || "OTHER").toUpperCase();

    if (!map[screenKey]) {
      map[screenKey] = { name: product, formats: {}, totalQty: 0, masters: new Set(), groups: new Set() };
    }

    if (!map[screenKey].formats[format]) {
      map[screenKey].formats[format] = { rows: {}, total: 0 };
    }

    if (!map[screenKey].formats[format].rows[qty]) {
      map[screenKey].formats[format].rows[qty] = { sum: 0, count: 0 };
    }

    map[screenKey].formats[format].rows[qty].sum += qty;
    map[screenKey].formats[format].rows[qty].count += 1;
    map[screenKey].formats[format].total += qty;
    map[screenKey].totalQty += qty;
    const group = getRowGroup(row);
    if (master) map[screenKey].masters.add(master);
    if (group) map[screenKey].groups.add(group);
  });
  return Object.values(map)
    .map((item) => ({
      ...item,
      masters: [...item.masters].sort(),
      groups: [...item.groups].sort()
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatSort(a, b) {
  const order = { ASSORT: 0, TRAY: 1 };
  const aOrder = Object.prototype.hasOwnProperty.call(order, a) ? order[a] : 99;
  const bOrder = Object.prototype.hasOwnProperty.call(order, b) ? order[b] : 99;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.localeCompare(b);
}

function buildProductCardHtml(item, index) {
  const formatKeys = Object.keys(item.formats).sort(formatSort);
  const masterText = item.masters.length ? item.masters.join(", ") : "-";
  const groupText = item.groups.length ? item.groups.join(", ") : "-";

  let html = `
    <article class="product-box single-card">
      <div class="product-screen-label">${escapeHtml(masterText)} | Section: ${escapeHtml(groupText)}</div>
      <div class="product-head">
        <div class="product-title">${escapeHtml(item.name)}</div>
        <div class="product-head-right">
          <div class="product-total">${item.totalQty.toFixed(2)}</div>
        </div>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Qty</th>
            <th>Sum</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
  `;

  formatKeys.forEach((format) => {
    html += `
      <tr class="format-head-row">
        <td colspan="3">${escapeHtml(format)}</td>
      </tr>
    `;

    const qtyKeys = Object.keys(item.formats[format].rows).sort((a, b) => Number(a) - Number(b));
    qtyKeys.forEach((qty) => {
      const row = item.formats[format].rows[qty];
      html += `
        <tr>
          <td>${Number(qty).toFixed(2)}</td>
          <td>${row.sum.toFixed(2)}</td>
          <td>${row.count}</td>
        </tr>
      `;
    });

    html += `
      <tr class="format-row">
        <td>${escapeHtml(format)}</td>
        <td>${item.formats[format].total.toFixed(3)}</td>
        <td></td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </article>
  `;
  return html;
}

function renderSingleCard(options = {}) {
  const { animate = false } = options;
  if (!productsData.length) {
    appEl.innerHTML = '<div class="empty-card single-card">No products found for this master.</div>';
    if (productIndexEl) productIndexEl.textContent = "0 / 0";
    if (prevBtnEl) prevBtnEl.disabled = true;
    if (nextBtnEl) nextBtnEl.disabled = true;
    return;
  }

  updateHeader(rawData);
  const visibleItems = productsData.slice(0, 2);
  const html = `
    <div class="split-view ${visibleItems.length === 1 ? "single" : "double"}">
      ${visibleItems.map((item, index) => buildProductCardHtml(item, index)).join("")}
    </div>
  `;

  appEl.innerHTML = html;
  if (animate) {
    appEl.classList.add("is-refreshing");
    window.requestAnimationFrame(() => {
      appEl.classList.remove("is-refreshing");
    });
  }

  if (productIndexEl) productIndexEl.textContent = `${visibleItems.length} / ${visibleItems.length}`;
  if (prevBtnEl) prevBtnEl.disabled = productsData.length <= 1;
  if (nextBtnEl) nextBtnEl.disabled = productsData.length <= 1;
}

function renderDataView(options = {}) {
  const { animate = false } = options;
  if (!rawData.length) {
    masterHeaderEl.textContent = "Master: -";
    sectionHeaderEl.textContent = "Section: -";
    sectionListEl.innerHTML = "";
    appEl.innerHTML = '<div class="empty-card single-card">No master data found.</div>';
    if (productIndexEl) productIndexEl.textContent = "0 / 0";
    if (prevBtnEl) prevBtnEl.disabled = true;
    if (nextBtnEl) nextBtnEl.disabled = true;
    return;
  }

  productsData = buildProductData(rawData);
  renderSingleCard({ animate });
}

async function refreshRowsInBackground() {
  if (!activeTvId || isRefreshInFlight) return;
  isRefreshInFlight = true;
  try {
    const rows = await fetchRowsForTvId(activeTvId);
    if (!rows.length) return;
    applyRows(rows, activeTvId, { animate: true });
  } catch (error) {
    // Ignore transient network errors and keep the current TV view visible.
  } finally {
    isRefreshInFlight = false;
  }
}

if (prevBtnEl) {
  prevBtnEl.addEventListener("click", () => {
    // Manual previous/next is disabled in split view mode.
  });
}

if (nextBtnEl) {
  nextBtnEl.addEventListener("click", () => {
    // Manual previous/next is disabled in split view mode.
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
  }
});

async function init() {
  const savedTvId = normalizeTvId(localStorage.getItem(TV_LOGIN_KEY));
  if (savedTvId) {
    activeTvId = savedTvId;
    updateTvIdBadge(activeTvId);
    hideLoginOverlay();
  } else {
    showLoginOverlay();
    resetViewForLoggedOut();
  }

  tvLoginFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const enteredTvId = normalizeTvId(tvIdInputEl.value);
    if (!enteredTvId) {
      setLoginError("Please enter TV ID.");
      return;
    }

    appEl.innerHTML = '<div class="loading-card single-card">Loading...</div>';
    try {
      const rows = await fetchRowsForTvId(enteredTvId);
      const { matchCount } = applyRows(rows, enteredTvId, { forceRender: true });
      if (!matchCount) {
        setLoginError(`No data found for TV ID ${enteredTvId}.`);
        resetViewForLoggedOut();
        return;
      }

      setLoginError("");
      localStorage.setItem(TV_LOGIN_KEY, enteredTvId);
      hideLoginOverlay();
      startAutoRefresh();
    } catch (error) {
      setLoginError("Unable to load data. Please try again.");
      resetViewForLoggedOut();
    }
  });

  logoutBtnEl.addEventListener("click", () => {
    localStorage.removeItem(TV_LOGIN_KEY);
    activeTvId = "";
    showLoginOverlay();
    resetViewForLoggedOut();
  });

  try {
    if (activeTvId) {
      const rows = await fetchRowsForTvId(activeTvId);
      const { matchCount } = applyRows(rows, activeTvId, { forceRender: true });
      if (!matchCount) {
        localStorage.removeItem(TV_LOGIN_KEY);
        activeTvId = "";
        resetViewForLoggedOut();
        setLoginError("Saved TV ID has no matching data. Please login again.");
        showLoginOverlay();
      } else {
        startAutoRefresh();
      }
    }
  } catch (error) {
    appEl.innerHTML = '<div class="empty-card single-card">Unable to load data. Please try again.</div>';
  }
}

init();
