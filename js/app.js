import { Store } from "./store.js";
import { MONTH_NAMES_FULL } from "./calc.js";
import * as dashboard from "./views/dashboard.js";
import * as comparison from "./views/comparison.js";
import * as runrate from "./views/runrate.js";
import * as drilldown from "./views/drilldown.js";
import * as planning from "./views/planning.js";
import * as dataSettings from "./views/dataSettings.js";
import { destroyAll } from "./charts.js";
import { captureFocus, restoreFocus } from "./ui.js";
import { icon } from "./icons.js";

const VIEWS = {
  dashboard: { mod: dashboard, label: "Dashboard", icon: "dashboard", group: "Overview" },
  comparison: { mod: comparison, label: "Budget vs. Actual", icon: "scale", group: "Overview" },
  runrate: { mod: runrate, label: "Run Rate & Forecast", icon: "trend", group: "Overview" },
  drilldown: { mod: drilldown, label: "Drill-Down", icon: "search", group: "Explore" },
  planning: { mod: planning, label: "Planning", icon: "edit", group: "Explore" },
  data: { mod: dataSettings, label: "Data & Settings", icon: "settings", group: "Manage" },
};

function renderShell() {
  document.getElementById("app").innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">${icon("chart", { size: 18, strokeWidth: 2.4 })}</div>
          <div class="brand-text"><div class="name">BudgetBridge</div><div class="tag">Marketing budget &amp; planning</div></div>
        </div>
        <nav class="nav" id="nav"></nav>
        <div class="sidebar-footer" id="sidebar-footer"></div>
      </aside>
      <div class="main">
        <div class="topbar" id="topbar"></div>
        <div class="view" id="view-root"></div>
      </div>
    </div>
    <div id="toast-host"></div>
  `;
}

function renderNav() {
  const nav = document.getElementById("nav");
  let lastGroup = null;
  let html = "";
  for (const [key, v] of Object.entries(VIEWS)) {
    if (v.group !== lastGroup) { html += `<div class="nav-section-label">${v.group}</div>`; lastGroup = v.group; }
    html += `<button class="nav-item ${Store.state.route === key ? "active" : ""}" data-route="${key}"><span class="ic">${icon(v.icon, { size: 17, strokeWidth: 2 })}</span>${v.label}</button>`;
  }
  nav.innerHTML = html;
  nav.querySelectorAll("[data-route]").forEach((b) => b.addEventListener("click", () => Store.setRoute(b.getAttribute("data-route"))));

  document.getElementById("sidebar-footer").innerHTML = `
    Data stored in this browser only.<br/>See Data &amp; Settings to share.
  `;
}

function renderTopbar() {
  const s = Store.state;
  const years = Store.availableFiscalYears();
  if (!years.includes(s.fiscalYear)) years.push(s.fiscalYear);
  const view = VIEWS[s.route];
  const topbar = document.getElementById("topbar");
  topbar.innerHTML = `
    <div>
      <h1>${view.label}</h1>
    </div>
    <div class="topbar-spacer"></div>
    <div class="topbar-controls">
      <div class="field" style="min-width:0">
        <label style="font-size:10.5px">Fiscal year</label>
        <select id="tb-fy">${years.sort((a, b) => a - b).map((y) => `<option value="${y}" ${y === s.fiscalYear ? "selected" : ""}>FY${y}</option>`).join("")}</select>
      </div>
      <div class="field" style="min-width:0">
        <label style="font-size:10.5px">As of</label>
        <select id="tb-asof">${MONTH_NAMES_FULL.map((m, i) => `<option value="${i + 1}" ${i + 1 === s.asOfMonth ? "selected" : ""}>${m}</option>`).join("")}</select>
      </div>
      <button class="btn btn-sm" id="tb-theme" title="Toggle color theme">${themeIcon(s.theme)}</button>
    </div>
  `;
  topbar.querySelector("#tb-fy").addEventListener("change", (e) => { Store.setFiscalYear(Number(e.target.value)); });
  topbar.querySelector("#tb-asof").addEventListener("change", (e) => { Store.setAsOfMonth(Number(e.target.value)); });
  topbar.querySelector("#tb-theme").addEventListener("click", () => {
    const order = ["system", "light", "dark"];
    const next = order[(order.indexOf(s.theme) + 1) % order.length];
    Store.setTheme(next);
  });
}

function themeIcon(theme) {
  return { system: "🖥 Auto", light: "☀ Light", dark: "☾ Dark" }[theme] || "🖥 Auto";
}

function renderView() {
  const view = VIEWS[Store.state.route];
  destroyAll();
  view.mod.render(document.getElementById("view-root"));
}

let booted = false;
let lastRouteKey = null;
function fullRender() {
  if (!booted) { renderShell(); booted = true; }
  const routeKey = Store.state.route === "drilldown"
    ? `drilldown:${Store.state.drill.categoryId || ""}:${Store.state.drill.projectCode || ""}`
    : Store.state.route;
  const sameView = lastRouteKey === routeKey;
  const scrollY = window.scrollY;
  const focusSnap = sameView ? captureFocus() : null;
  renderNav();
  renderTopbar();
  renderView();
  if (sameView) { restoreFocus(focusSnap); window.scrollTo(0, scrollY); }
  else window.scrollTo(0, 0);
  lastRouteKey = routeKey;
}

async function boot() {
  renderShell();
  document.getElementById("view-root").innerHTML = `<div class="empty-state">Loading…</div>`;
  await Store.loadAll();
  booted = true;
  Store.subscribe(fullRender);
  fullRender();
}

boot();
