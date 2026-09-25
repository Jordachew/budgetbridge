// ===========================================================
// BudgetBridge — aggregation, comparison & run-rate math
// ===========================================================

export const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const MONTH_NAMES_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function fmtMoney(n, { compact = false, currency = "" } = {}) {
  if (n == null || isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (compact) {
    if (abs >= 1e9) return sign + currency + (abs / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (abs >= 1e6) return sign + currency + (abs / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (abs >= 1e3) return sign + currency + (abs / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return sign + currency + abs.toFixed(0);
  }
  return sign + currency + abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function fmtPct(n, digits = 0) {
  if (n == null || isNaN(n)) return "—";
  return (n * 100).toFixed(digits) + "%";
}

/** Aggregate raw transactions into per-project, per-month actual & encumbrance totals for a fiscal year. */
export function aggregateActuals(transactions, fiscalYear) {
  const byProject = new Map();
  for (const t of transactions) {
    if (t.year !== fiscalYear) continue;
    if (!byProject.has(t.project)) {
      byProject.set(t.project, {
        actualByMonth: Array(12).fill(0),
        encumbranceByMonth: Array(12).fill(0),
        actual: 0, encumbrance: 0,
      });
    }
    const bucket = byProject.get(t.project);
    const mi = t.month - 1;
    if (mi < 0 || mi > 11) continue;
    if (t.balanceType === "E") {
      bucket.encumbranceByMonth[mi] += t.amount;
      bucket.encumbrance += t.amount;
    } else {
      bucket.actualByMonth[mi] += t.amount;
      bucket.actual += t.amount;
    }
  }
  return byProject;
}

export function budgetByProject(budgetLines, fiscalYear) {
  const map = new Map();
  for (const b of budgetLines) {
    if (b.fiscalYear !== fiscalYear) continue;
    if (!map.has(b.projectCode)) map.set(b.projectCode, { total: 0, byMonth: Array(12).fill(0) });
    const bucket = map.get(b.projectCode);
    bucket.byMonth[b.month - 1] = (bucket.byMonth[b.month - 1] || 0) + b.amount;
    bucket.total += b.amount;
  }
  return map;
}

/**
 * Status classification comparing projected year-end spend to budget,
 * and current pace to time elapsed. Uses the shared status palette:
 * good / warning / serious / critical (never color alone — always paired
 * with a label in the UI).
 */
export function statusFromVariance(projectedVariancePct, hasBudget) {
  if (!hasBudget) return "unbudgeted";
  if (projectedVariancePct <= 0.02) return "good";
  if (projectedVariancePct <= 0.10) return "warning";
  if (projectedVariancePct <= 0.25) return "serious";
  return "critical";
}

export const STATUS_LABEL = {
  good: "On track",
  warning: "Watch",
  serious: "At risk",
  critical: "Over budget",
  unbudgeted: "No budget",
};

/**
 * Run-rate projection for a project/category given monthly actuals and
 * the "as of" month (1-12) within the fiscal year.
 */
export function computeRunRate(actualByMonth, encumbranceByMonth, budgetTotal, asOfMonth) {
  const monthsElapsed = Math.max(1, asOfMonth);
  const ytdActual = actualByMonth.slice(0, monthsElapsed).reduce((a, b) => a + b, 0);
  const ytdEncumbrance = (encumbranceByMonth || []).slice(0, monthsElapsed).reduce((a, b) => a + b, 0);
  const avgMonthly = ytdActual / monthsElapsed;

  const last3Start = Math.max(0, monthsElapsed - 3);
  const last3Slice = actualByMonth.slice(last3Start, monthsElapsed);
  const avgMonthlyTrend = last3Slice.length ? last3Slice.reduce((a, b) => a + b, 0) / last3Slice.length : avgMonthly;

  const remainingMonths = Math.max(0, 12 - monthsElapsed);
  const projectedAnnual = ytdActual + avgMonthly * remainingMonths;
  const projectedAnnualTrend = ytdActual + avgMonthlyTrend * remainingMonths;

  const hasBudget = budgetTotal > 0;
  const projectedVariance = hasBudget ? projectedAnnual - budgetTotal : projectedAnnual;
  const projectedVariancePct = hasBudget ? projectedVariance / budgetTotal : null;
  const status = statusFromVariance(hasBudget ? projectedVariancePct : 0, hasBudget);

  const paceExpected = monthsElapsed / 12;
  const paceActual = hasBudget ? ytdActual / budgetTotal : null;

  return {
    monthsElapsed, ytdActual, ytdEncumbrance, avgMonthly, avgMonthlyTrend,
    remainingMonths, projectedAnnual, projectedAnnualTrend,
    hasBudget, projectedVariance, projectedVariancePct, status,
    paceExpected, paceActual,
  };
}

/**
 * Build the hierarchical comparison table: category -> projects, each row
 * carrying budget / actual / encumbrance / committed / balance / status.
 */
export function buildComparisonRows({ categories, projects, actualsByProject, budgetByProjectMap, asOfMonth }) {
  const catList = [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const rows = [];
  for (const cat of catList) {
    const catProjects = projects.filter((p) => p.categoryId === cat.id);
    const projRows = [];
    for (const p of catProjects) {
      const a = actualsByProject.get(p.code) || { actual: 0, encumbrance: 0, actualByMonth: Array(12).fill(0), encumbranceByMonth: Array(12).fill(0) };
      const b = budgetByProjectMap.get(p.code) || { total: 0, byMonth: Array(12).fill(0) };
      const committed = a.actual + a.encumbrance;
      const balance = b.total - committed;
      const pctUsed = b.total > 0 ? committed / b.total : null;
      const runRate = computeRunRate(a.actualByMonth, a.encumbranceByMonth, b.total, asOfMonth);
      projRows.push({
        code: p.code, name: p.name, categoryId: cat.id,
        budget: b.total, actual: a.actual, encumbrance: a.encumbrance,
        committed, balance, pctUsed, runRate,
        byMonth: { actual: a.actualByMonth, encumbrance: a.encumbranceByMonth, budget: b.byMonth },
      });
    }
    const sum = (key) => projRows.reduce((s, r) => s + r[key], 0);
    const catBudget = sum("budget"), catActual = sum("actual"), catEnc = sum("encumbrance");
    const catCommitted = catActual + catEnc;
    const catByMonthActual = Array(12).fill(0), catByMonthEnc = Array(12).fill(0), catByMonthBudget = Array(12).fill(0);
    for (const r of projRows) {
      for (let i = 0; i < 12; i++) {
        catByMonthActual[i] += r.byMonth.actual[i] || 0;
        catByMonthEnc[i] += r.byMonth.encumbrance[i] || 0;
        catByMonthBudget[i] += r.byMonth.budget[i] || 0;
      }
    }
    rows.push({
      id: cat.id, name: cat.name, isCategory: true,
      budget: catBudget, actual: catActual, encumbrance: catEnc, committed: catCommitted,
      balance: catBudget - catCommitted,
      pctUsed: catBudget > 0 ? catCommitted / catBudget : null,
      runRate: computeRunRate(catByMonthActual, catByMonthEnc, catBudget, asOfMonth),
      byMonth: { actual: catByMonthActual, encumbrance: catByMonthEnc, budget: catByMonthBudget },
      projects: projRows,
    });
  }
  return rows;
}

export function grandTotal(rows) {
  const t = { budget: 0, actual: 0, encumbrance: 0, committed: 0, balance: 0, byMonth: { actual: Array(12).fill(0), encumbrance: Array(12).fill(0), budget: Array(12).fill(0) } };
  for (const r of rows) {
    t.budget += r.budget; t.actual += r.actual; t.encumbrance += r.encumbrance;
    t.committed += r.committed; t.balance += r.balance;
    for (let i = 0; i < 12; i++) {
      t.byMonth.actual[i] += r.byMonth.actual[i] || 0;
      t.byMonth.encumbrance[i] += r.byMonth.encumbrance[i] || 0;
      t.byMonth.budget[i] += r.byMonth.budget[i] || 0;
    }
  }
  return t;
}

export function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
}
