// ===========================================================
// BudgetBridge — small shared UI helpers (toasts, modals, chips)
// ===========================================================
import { fmtMoney, fmtPct, STATUS_LABEL } from "./calc.js";
import { icon, STATUS_ICON } from "./icons.js";

export function toast(message, kind = "") {
  const host = document.getElementById("toast-host");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

export function openModal(innerHtml, { onMount } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${innerHtml}</div>`;
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
  document.body.appendChild(backdrop);
  function close() { backdrop.remove(); }
  if (onMount) onMount(backdrop.querySelector(".modal"), close);
  return close;
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function statusChip(status) {
  return `<span class="chip ${status}">${icon(STATUS_ICON[status] || "minusCircle", { size: 12, strokeWidth: 2.4 })}${STATUS_LABEL[status] || status}</span>`;
}

export function meterBar(pct, status) {
  const clamped = pct == null ? 0 : Math.max(0, Math.min(1.4, pct));
  const width = Math.min(100, clamped * 100);
  const colorVar = { good: "var(--status-good)", warning: "var(--status-warning)", serious: "var(--status-serious)", critical: "var(--status-critical)", unbudgeted: "var(--baseline)" }[status] || "var(--baseline)";
  return `<div class="meter" title="${pct == null ? "No budget set" : fmtPct(pct)}"><span style="width:${width}%; background:${colorVar}"></span></div>`;
}

export function kpiCard({ label, value, sub, deltaText, deltaGood, icon: iconName, iconColor = "var(--accent)", sparkline }) {
  return `
  <div class="card kpi">
    ${iconName ? `<div class="kpi-icon" style="background:color-mix(in srgb, ${iconColor} 16%, transparent); color:${iconColor}">${icon(iconName, { size: 16, strokeWidth: 2.2 })}</div>` : ""}
    <div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ""}
    ${deltaText ? `<div class="kpi-delta ${deltaGood ? "delta-up good" : "delta-up bad"}">${deltaText}</div>` : ""}
    ${sparkline && sparkline.length > 1 ? `<div class="kpi-spark">${sparklineSvg(sparkline, iconColor)}</div>` : ""}
  </div>`;
}

/** A tiny 12-point trend line for a KPI card — no chart library needed. */
export function sparklineSvg(values, color = "var(--accent)", w = 64, h = 22) {
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`).join(" ");
  const lastX = ((values.length - 1) * step).toFixed(1);
  const lastY = (h - ((values[values.length - 1] - min) / span) * (h - 4) - 2).toFixed(1);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
    <polyline points="${pts}" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
    <circle cx="${lastX}" cy="${lastY}" r="2.2" fill="${color}"/>
  </svg>`;
}

export function moneyCell(n, opts) { return fmtMoney(n, opts); }

/**
 * Full-innerHTML re-renders (this app doesn't use a virtual DOM) would
 * otherwise steal focus/cursor position out from under whoever is typing.
 * Capture the focused element's identity before a re-render, restore it after.
 */
export function captureFocus(scope = document) {
  const active = document.activeElement;
  if (!active || active === document.body) return null;
  if (scope !== document && !scope.contains(active)) return null;
  let selector = null;
  if (active.id) selector = `#${CSS.escape(active.id)}`;
  else if (active.dataset && active.dataset.code != null && active.dataset.period != null) {
    selector = `input[data-code="${CSS.escape(active.dataset.code)}"][data-period="${CSS.escape(active.dataset.period)}"]`;
  }
  if (!selector) return null;
  return { selector, start: active.selectionStart, end: active.selectionEnd };
}

export function restoreFocus(snap) {
  if (!snap) return;
  const el = document.querySelector(snap.selector);
  if (!el) return;
  el.focus();
  if (typeof snap.start === "number" && el.setSelectionRange) {
    try { el.setSelectionRange(snap.start, snap.end); } catch { /* not a text-selectable input */ }
  }
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function downloadTextFile(filename, text, mime = "text/csv") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function toCsv(headers, rows) {
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

export function sortIndicatorHandler(table, getRows, renderRows) {
  let sortKey = null, sortDir = 1;
  table.querySelectorAll("thead th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-sort");
      if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
      table.querySelectorAll("thead th").forEach((h) => h.classList.remove("sorted"));
      th.classList.add("sorted");
      const rows = getRows().slice().sort((a, b) => {
        const av = a[key], bv = b[key];
        if (typeof av === "string") return sortDir * av.localeCompare(bv);
        return sortDir * ((av ?? -Infinity) - (bv ?? -Infinity));
      });
      renderRows(rows);
    });
  });
}
