const API_URL = "https://script.google.com/macros/s/AKfycbyqL3PT6w6oXGEfgqCwG44Ahxu6o9dhm-7T4kPltKlP5OdAv4uYPo1vPM_WOlEmm3is/exec";
const TV_LOGIN_KEY = "tvLoginId";
const SHOW_CURRENT_SCREEN_ONLY = true;

let rawData = [];
let currentMaster = "";
let productsData = [];
let currentProductIndex = 0;
let activeTvId = "";
let productRotateTimer = null;

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
  currentMaster = "";
  productsData = [];
  currentProductIndex = 0;
  clearProductRotation();
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

function clearProductRotation() {
  if (productRotateTimer) {
    window.clearInterval(productRotateTimer);
    productRotateTimer = null;
  }
}

function restartProductRotation() {
  clearProductRotation();
  if (productsData.length <= 1) return;
  productRotateTimer = window.setInterval(() => {
    if (!productsData.length) return;
    currentProductIndex = (currentProductIndex + 1) % productsData.length;
    renderSingleCard();
  }, 15000);
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

function applyRows(rows, tvId) {
  activeTvId = normalizeTvId(tvId);
  updateTvIdBadge(activeTvId);
  rawData = Array.isArray(rows) ? rows : [];
  renderDataView();
  return rawData.length;
}

function getFullscreenIconHtml(isFullscreen) {
  return isFullscreen
    ? '<i class="bi bi-fullscreen-exit" aria-hidden="true"></i>'
    : '<i class="bi bi-fullscreen" aria-hidden="true"></i>';
}

async function toggleCardFullscreen() {
  const cardEl = document.querySelector(".product-box.single-card");
  if (!cardEl) return;

  if (document.fullscreenElement === cardEl) {
    await document.exitFullscreen();
    return;
  }

  await cardEl.requestFullscreen();
}

function syncFullscreenButton() {
  const btn = document.getElementById("fullscreenBtn");
  if (!btn) return;
  const isFullscreen = Boolean(document.fullscreenElement);
  btn.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Enter fullscreen");
  btn.innerHTML = getFullscreenIconHtml(isFullscreen);
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

function updateHeaderForProduct(item) {
  if (!item) {
    masterHeaderEl.textContent = "Master: -";
    sectionHeaderEl.textContent = "Section: -";
    sectionListEl.innerHTML = "";
    return;
  }

  const masters = Array.isArray(item.masters) ? item.masters : [];
  const groups = Array.isArray(item.groups) ? item.groups : [];

  if (!masters.length) {
    masterHeaderEl.textContent = "Master: -";
  } else if (masters.length === 1) {
    masterHeaderEl.textContent = `Master: ${masters[0]}`;
  } else {
    masterHeaderEl.textContent = `Masters: ${masters.join(", ")}`;
  }

  if (!groups.length) {
    sectionHeaderEl.textContent = "Section: -";
    sectionListEl.innerHTML = "";
    return;
  }

  if (groups.length === 1) {
    sectionHeaderEl.textContent = `Section: ${groups[0]}`;
    sectionListEl.innerHTML = "";
    return;
  }

  sectionHeaderEl.textContent = `Sections (${groups.length})`;
  sectionListEl.innerHTML = groups
    .map((section) => `<span class="section-pill">${escapeHtml(section)}</span>`)
    .join("");
}

function buildProductData(rows) {
  const map = {};

  rows.forEach((row) => {
    const product = getRowProduct(row) || "Unnamed Product";
    const qty = Number(getRowQty(row)) || 0;
    const format = (getRowPackFormat(row) || "OTHER").toUpperCase();

    if (!map[product]) {
      map[product] = { name: product, formats: {}, totalQty: 0, masters: new Set(), groups: new Set() };
    }

    if (!map[product].formats[format]) {
      map[product].formats[format] = { rows: {}, total: 0 };
    }

    if (!map[product].formats[format].rows[qty]) {
      map[product].formats[format].rows[qty] = { sum: 0, count: 0 };
    }

    map[product].formats[format].rows[qty].sum += qty;
    map[product].formats[format].rows[qty].count += 1;
    map[product].formats[format].total += qty;
    map[product].totalQty += qty;
    const master = getRowMaster(row);
    const group = getRowGroup(row);
    if (master) map[product].masters.add(master);
    if (group) map[product].groups.add(group);
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

function renderSingleCard() {
  if (!productsData.length) {
    appEl.innerHTML = '<div class="empty-card single-card">No products found for this master.</div>';
    if (productIndexEl) productIndexEl.textContent = "0 / 0";
    if (prevBtnEl) prevBtnEl.disabled = true;
    if (nextBtnEl) nextBtnEl.disabled = true;
    return;
  }

  const item = productsData[currentProductIndex];
  updateHeaderForProduct(item);
  const formatKeys = Object.keys(item.formats).sort(formatSort);

  let html = `
    <article class="product-box single-card">
      <div class="product-head">
        <div class="product-title">${escapeHtml(item.name)} BP</div>
        <div class="product-head-right">
          <div class="product-total">${item.totalQty.toFixed(2)}</div>
          <button id="fullscreenBtn" class="fullscreen-btn" type="button" aria-label="${document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen"}">
            ${getFullscreenIconHtml(Boolean(document.fullscreenElement))}
          </button>
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

  appEl.innerHTML = html;
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      toggleCardFullscreen().catch(() => {});
    });
  }
  syncFullscreenButton();

  if (productIndexEl) productIndexEl.textContent = `${currentProductIndex + 1} / ${productsData.length}`;
  if (prevBtnEl) prevBtnEl.disabled = productsData.length <= 1;
  if (nextBtnEl) nextBtnEl.disabled = productsData.length <= 1;
}

function renderDataView() {
  if (!rawData.length) {
    clearProductRotation();
    masterHeaderEl.textContent = "Master: -";
    sectionHeaderEl.textContent = "Section: -";
    sectionListEl.innerHTML = "";
    appEl.innerHTML = '<div class="empty-card single-card">No master data found.</div>';
    if (productIndexEl) productIndexEl.textContent = "0 / 0";
    if (prevBtnEl) prevBtnEl.disabled = true;
    if (nextBtnEl) nextBtnEl.disabled = true;
    return;
  }

  currentMaster = getRowMaster(rawData[0]) || "";
  currentProductIndex = 0;
  productsData = buildProductData(rawData);
  renderSingleCard();
  restartProductRotation();
}

if (prevBtnEl) {
  prevBtnEl.addEventListener("click", () => {
    if (!productsData.length) return;
    currentProductIndex = (currentProductIndex - 1 + productsData.length) % productsData.length;
    renderSingleCard();
  });
}

if (nextBtnEl) {
  nextBtnEl.addEventListener("click", () => {
    if (!productsData.length) return;
    currentProductIndex = (currentProductIndex + 1) % productsData.length;
    renderSingleCard();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" && prevBtnEl) prevBtnEl.click();
  if (event.key === "ArrowRight" && nextBtnEl) nextBtnEl.click();
});

document.addEventListener("fullscreenchange", () => {
  syncFullscreenButton();
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
      const matchCount = applyRows(rows, enteredTvId);
      if (!matchCount) {
        setLoginError(`No data found for TV ID ${enteredTvId}.`);
        resetViewForLoggedOut();
        return;
      }

      setLoginError("");
      localStorage.setItem(TV_LOGIN_KEY, enteredTvId);
      hideLoginOverlay();
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
      const matchCount = applyRows(rows, activeTvId);
      if (!matchCount) {
        localStorage.removeItem(TV_LOGIN_KEY);
        activeTvId = "";
        resetViewForLoggedOut();
        setLoginError("Saved TV ID has no matching data. Please login again.");
        showLoginOverlay();
      }
    }
  } catch (error) {
    appEl.innerHTML = '<div class="empty-card single-card">Unable to load data. Please try again.</div>';
  }
}

init();
