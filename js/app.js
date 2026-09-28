import { Store } from "./store.js";
import { MONTH_NAMES_FULL } from "./calc.js";
import * as dashboard from "./views/dashboard.js";
import * as comparison from "./views/comparison.js";
import * as runrate from "./views/runrate.js";
import * as drilldown from "./views/drilldown.js";
import * as planning from "./views/planning.js";
import * as dataSettings from "./views/dataSettings.js";
import { destroyAll } from "./charts.js";
import { captureFocus, restoreFocus, toast } from "./ui.js";
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

  const me = Store.state.me;
  document.getElementById("sidebar-footer").innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div style="min-width:0">
        <div style="font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${me?.name || ""}</div>
        <div>${me?.role === "admin" ? "Admin" : "Manager"} · everyone's numbers roll up here</div>
      </div>
      <button class="btn btn-sm" id="sb-logout" title="Log out">${icon("logout", { size: 14, strokeWidth: 2.2 })}</button>
    </div>
  `;
  document.getElementById("sb-logout").addEventListener("click", () => Store.logout());
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

// ---------------------------------------------------------------- login

function renderLogin() {
  document.getElementById("app").innerHTML = `
    <div class="login-wrap">
      <form class="card login-card" id="login-form">
        <div class="brand" style="border:none;padding:0 0 16px">
          <div class="brand-mark">${icon("chart", { size: 20, strokeWidth: 2.4 })}</div>
          <div class="brand-text"><div class="name">BudgetBridge</div><div class="tag">Marketing budget &amp; planning</div></div>
        </div>
        <p class="hint" style="margin-bottom:16px">Sign in with the username and password your admin gave you.</p>
        <div class="field"><label>Username</label><input type="text" id="login-username" autocomplete="username" autofocus /></div>
        <div class="field" style="margin-top:10px"><label>Password</label><input type="password" id="login-password" autocomplete="current-password" /></div>
        <div id="login-error" class="login-error" hidden></div>
        <button class="btn btn-primary" type="submit" style="margin-top:16px;width:100%;justify-content:center">Sign in</button>
      </form>
    </div>
    <div id="toast-host"></div>
  `;
  const form = document.getElementById("login-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const errorBox = document.getElementById("login-error");
    errorBox.hidden = true;
    if (!username || !password) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await Store.login(username, password);
    } catch (err) {
      errorBox.textContent = err.message || "Couldn't sign in";
      errorBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

let booted = false;
let lastRouteKey = null;
function fullRender() {
  if (!Store.state.authed) { booted = false; renderLogin(); return; }
  if (!booted) { renderShell(); booted = true; lastRouteKey = null; }
  const routeKey = Store.state.route === "drilldown"
    ? `drilldown:${Store.state.drill.categoryId || ""}:${Store.state.drill.projectCode || ""}`
    : Store.state.route;
  const sameView = lastRouteKey === routeKey;
  const scrollY = window.scrollY;
  const focusSnap = sameView ? captureFocus() : null;
  renderNav();
  renderTopbar();
  try {
    renderView();
  } catch (err) {
    console.error(err);
    toast("Something went wrong loading that page — see console for details.", "err");
  }
  if (sameView) { restoreFocus(focusSnap); window.scrollTo(0, scrollY); }
  else window.scrollTo(0, 0);
  lastRouteKey = routeKey;
}

async function boot() {
  document.getElementById("app").innerHTML = `<div class="boot-loading">Loading…</div>`;
  await Store.init();
  Store.subscribe(fullRender);
  fullRender();
}

boot();
