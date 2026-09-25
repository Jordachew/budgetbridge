// ===========================================================
// BudgetBridge — chart helpers (Chart.js), styled per the
// dataviz palette: fixed categorical order, status colors
// reserved, thin bars, hairline grid, legend for 2+ series.
// ===========================================================
import { fmtMoney } from "./calc.js";

const registry = new Map();

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function seriesColor(i) {
  return cssVar(`--series-${(i % 8) + 1}`);
}
export function statusColor(status) {
  const map = { good: "--status-good", warning: "--status-warning", serious: "--status-serious", critical: "--status-critical", unbudgeted: "--baseline" };
  return cssVar(map[status] || "--baseline");
}
function chrome() {
  return {
    grid: cssVar("--gridline"),
    baseline: cssVar("--baseline"),
    textMuted: cssVar("--text-muted"),
    textSecondary: cssVar("--text-secondary"),
    surface: cssVar("--surface-1"),
    textPrimary: cssVar("--text-primary"),
  };
}

function baseFont() {
  return { family: "system-ui, -apple-system, Segoe UI, sans-serif", size: 11.5 };
}

function tooltipBase() {
  const c = chrome();
  return {
    enabled: true,
    backgroundColor: c.textPrimary,
    titleColor: c.surface,
    bodyColor: c.surface,
    borderWidth: 0,
    padding: 10,
    cornerRadius: 8,
    titleFont: { weight: "600", ...baseFont() },
    bodyFont: baseFont(),
    displayColors: true,
    boxPadding: 4,
  };
}

function destroy(canvas) {
  const existing = registry.get(canvas);
  if (existing) { existing.destroy(); registry.delete(canvas); }
}

function register(canvas, chart) {
  registry.set(canvas, chart);
  return chart;
}

export function destroyAll() {
  for (const c of registry.values()) c.destroy();
  registry.clear();
}

/** Grouped bar: Budget vs Actual vs Encumbered, per category/project. */
export function budgetActualBarChart(canvas, { labels, budget, actual, encumbrance }) {
  destroy(canvas);
  const c = chrome();
  const chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Budget", data: budget, backgroundColor: c.baseline, borderRadius: 4, maxBarThickness: 22, order: 3 },
        { label: "Actual", data: actual, backgroundColor: seriesColor(0), borderRadius: 4, maxBarThickness: 22, order: 1 },
        { label: "Encumbered", data: encumbrance, backgroundColor: seriesColor(1), borderRadius: 4, maxBarThickness: 22, order: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", align: "start", labels: { color: c.textSecondary, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "rectRounded", font: baseFont() } },
        tooltip: { ...tooltipBase(), callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y, { compact: true, currency: "$" })}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.textMuted, font: baseFont() } },
        y: {
          beginAtZero: true,
          grid: { color: c.grid, drawTicks: false },
          border: { display: false },
          ticks: { color: c.textMuted, font: baseFont(), callback: (v) => fmtMoney(v, { compact: true, currency: "$" }) },
        },
      },
    },
  });
  return register(canvas, chart);
}

/** Cumulative monthly trend: budget pace (reference line) vs actual+encumbered spend, single $ axis. */
export function monthlyTrendChart(canvas, { labels, cumulativeBudget, cumulativeActual, cumulativeCommitted, asOfIndex }) {
  destroy(canvas);
  const c = chrome();
  const actualSolid = cumulativeCommitted.map((v, i) => (i <= asOfIndex ? v : null));
  const actualProjectedDashed = cumulativeCommitted.map((v, i) => (i >= asOfIndex ? v : null));
  const chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Budget (pro-rated)", data: cumulativeBudget, borderColor: c.baseline, borderWidth: 2,
          borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0,
        },
        {
          label: "Actual + committed", data: actualSolid, borderColor: seriesColor(0), backgroundColor: seriesColor(0) + "1a",
          borderWidth: 2, pointRadius: (ctx) => (ctx.dataIndex === asOfIndex ? 4 : 0), pointBackgroundColor: seriesColor(0),
          pointBorderColor: c.surface, pointBorderWidth: 2, fill: true, tension: 0.15,
        },
        {
          label: "Projected", data: actualProjectedDashed, borderColor: seriesColor(0), borderWidth: 2, borderDash: [3, 3],
          pointRadius: 0, fill: false, tension: 0.15,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", align: "start", labels: { color: c.textSecondary, boxWidth: 10, boxHeight: 10, usePointStyle: true, font: baseFont(), filter: (item) => item.text !== "Projected" } },
        tooltip: { ...tooltipBase(), callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y, { compact: true, currency: "$" })}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.textMuted, font: baseFont() } },
        y: {
          beginAtZero: true, grid: { color: c.grid, drawTicks: false }, border: { display: false },
          ticks: { color: c.textMuted, font: baseFont(), callback: (v) => fmtMoney(v, { compact: true, currency: "$" }) },
        },
      },
    },
  });
  return register(canvas, chart);
}

/** Horizontal bar ranking (e.g. categories by spend, or projects by variance). */
export function rankedBarChart(canvas, { labels, values, colorFor }) {
  destroy(canvas);
  const c = chrome();
  const colors = labels.map((_, i) => (colorFor ? colorFor(i) : seriesColor(i)));
  const chart = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, maxBarThickness: 20 }] },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltipBase(), callbacks: { label: (ctx) => fmtMoney(ctx.parsed.x, { compact: true, currency: "$" }) } },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: c.grid, drawTicks: false }, border: { display: false }, ticks: { color: c.textMuted, font: baseFont(), callback: (v) => fmtMoney(v, { compact: true, currency: "$" }) } },
        y: { grid: { display: false }, ticks: { color: c.textSecondary, font: baseFont() } },
      },
    },
  });
  return register(canvas, chart);
}

/** Run-rate projection chart for one project/category: bars = actual-to-date + projected remainder, dashed reference = budget. */
export function runRateChart(canvas, { labels, actualByMonth, projectedByMonth, budgetLine }) {
  destroy(canvas);
  const c = chrome();
  const chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Actual", data: actualByMonth, backgroundColor: seriesColor(0), borderRadius: 4, maxBarThickness: 20, stack: "s" },
        { label: "Projected", data: projectedByMonth, backgroundColor: seriesColor(0) + "40", borderRadius: 4, maxBarThickness: 20, stack: "s" },
        {
          label: "Budget line (monthly avg)", type: "line", data: Array(labels.length).fill(budgetLine),
          borderColor: c.baseline, borderDash: [4, 3], borderWidth: 2, pointRadius: 0, fill: false,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", align: "start", labels: { color: c.textSecondary, boxWidth: 10, boxHeight: 10, usePointStyle: true, font: baseFont() } },
        tooltip: { ...tooltipBase(), callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y, { compact: true, currency: "$" })}` } },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: c.textMuted, font: baseFont() } },
        y: { stacked: true, beginAtZero: true, grid: { color: c.grid, drawTicks: false }, border: { display: false }, ticks: { color: c.textMuted, font: baseFont(), callback: (v) => fmtMoney(v, { compact: true, currency: "$" }) } },
      },
    },
  });
  return register(canvas, chart);
}
