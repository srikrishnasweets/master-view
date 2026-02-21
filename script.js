const API_URL = "https://script.google.com/macros/s/AKfycbwBUJe0ph0jfBoRCPzR5HH5ByCc9KVgfDoNsvWHtyRwqg5RDEf-XefTrIaiKn4HsJEbuA/exec";

let rawData = [];
let currentMaster = "";
let productsData = [];
let currentProductIndex = 0;

const tabsEl = document.getElementById("tabs");
const appEl = document.getElementById("app");
const masterHeaderEl = document.getElementById("masterHeader");
const sectionHeaderEl = document.getElementById("sectionHeader");
const sectionListEl = document.getElementById("sectionList");
const prevBtnEl = document.getElementById("prevBtn");
const nextBtnEl = document.getElementById("nextBtn");
const productIndexEl = document.getElementById("productIndex");

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
  const sections = [...new Set(rows.map((row) => row.group).filter(Boolean))].sort();

  if (!currentMaster) {
    masterHeaderEl.textContent = "Master: -";
    sectionHeaderEl.textContent = "Section: -";
    sectionListEl.innerHTML = "";
    return;
  }

  masterHeaderEl.textContent = `Master: ${currentMaster}`;

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
    const product = row.product || "Unnamed Product";
    const qty = Number(row.qty) || 0;
    const format = (row.packFormat || "OTHER").toUpperCase();

    if (!map[product]) {
      map[product] = { name: product, formats: {}, totalQty: 0 };
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
  });

  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
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
    productIndexEl.textContent = "0 / 0";
    prevBtnEl.disabled = true;
    nextBtnEl.disabled = true;
    return;
  }

  const item = productsData[currentProductIndex];
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

  productIndexEl.textContent = `${currentProductIndex + 1} / ${productsData.length}`;
  prevBtnEl.disabled = productsData.length <= 1;
  nextBtnEl.disabled = productsData.length <= 1;
}

function setMaster(master, tabButton) {
  currentMaster = master;
  currentProductIndex = 0;
  document.querySelectorAll(".sheet-tab").forEach((tab) => tab.classList.remove("active"));
  if (tabButton) tabButton.classList.add("active");

  const rows = rawData.filter((row) => row.master === currentMaster);
  updateHeader(rows);
  productsData = buildProductData(rows);
  renderSingleCard();
}

function createTabs() {
  const masters = [...new Set(rawData.map((d) => d.master).filter(Boolean))].sort();
  tabsEl.innerHTML = "";

  if (!masters.length) {
    masterHeaderEl.textContent = "No master data found.";
    sectionHeaderEl.textContent = "Section: -";
    sectionListEl.innerHTML = "";
    appEl.innerHTML = '<div class="empty-card single-card">No master data found.</div>';
    return;
  }

  masters.forEach((master, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheet-tab" + (index === 0 ? " active" : "");
    button.textContent = master;
    button.onclick = () => setMaster(master, button);
    tabsEl.appendChild(button);

    if (index === 0) {
      setMaster(master, button);
    }
  });
}

prevBtnEl.addEventListener("click", () => {
  if (!productsData.length) return;
  currentProductIndex = (currentProductIndex - 1 + productsData.length) % productsData.length;
  renderSingleCard();
});

nextBtnEl.addEventListener("click", () => {
  if (!productsData.length) return;
  currentProductIndex = (currentProductIndex + 1) % productsData.length;
  renderSingleCard();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") prevBtnEl.click();
  if (event.key === "ArrowRight") nextBtnEl.click();
});

document.addEventListener("fullscreenchange", () => {
  syncFullscreenButton();
});

async function init() {
  try {
    const res = await fetch(API_URL);
    const json = await res.json();
    rawData = Array.isArray(json?.data) ? json.data : [];
    createTabs();
  } catch (error) {
    appEl.innerHTML = '<div class="empty-card single-card">Unable to load data. Please try again.</div>';
  }
}

init();
