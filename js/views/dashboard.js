import { Store } from "../store.js";
import { aggregateActuals, budgetByProject, buildComparisonRows, grandTotal, fmtMoney, fmtPct, MONTH_NAMES, STATUS_LABEL } from "../calc.js";
import { statusChip, meterBar, kpiCard } from "../ui.js";
import { budgetActualBarChart, monthlyTrendChart, rankedBarChart, statusColor } from "../charts.js";
import { icon } from "../icons.js";

export function render(root) {
  const s = Store.state;
  const fy = s.fiscalYear, asOf = s.asOfMonth;
  const actualsByProject = aggregateActuals(s.transactions, fy);
  const budgetMap = budgetByProject(s.budgetLines, fy);
  const rows = buildComparisonRows({ categories: s.categories, projects: s.projects, actualsByProject, budgetByProjectMap: budgetMap, asOfMonth: asOf });
  const total = grandTotal(rows);

  if (!s.categories.length) {
    root.innerHTML = emptyState();
    root.querySelector("#load-demo-btn")?.addEventListener("click", async () => {
      await Store.loadDemoData();
      render(root);
    });
    root.querySelector("#go-data-btn")?.addEventListener("click", () => Store.setRoute("data"));
    return;
  }

  const rr = computePortfolioRunRate(rows);
  const pctUsed = total.budget > 0 ? total.committed / total.budget : null;
  const paceExpected = asOf / 12;

  const monthlyActualToDate = total.byMonth.actual.slice(0, asOf);
  const cumCommittedToDate = [];
  { let run = 0; for (let i = 0; i < asOf; i++) { run += (total.byMonth.actual[i] || 0) + (total.byMonth.encumbrance[i] || 0); cumCommittedToDate.push(run); } }
  const projectedStatusColor = { good: "var(--status-good)", warning: "var(--status-warning)", serious: "var(--status-serious)", critical: "var(--status-critical)", unbudgeted: "var(--baseline)" }[rr.status];

  root.innerHTML = `
    <div class="view-head">
      <h1>Dashboard</h1>
      <p class="lead">Portfolio snapshot for FY${fy}, through ${MONTH_NAMES[asOf - 1]}. Budget, actual spend, open commitments and the projected year-end position across every marketing / corporate-communications line.</p>
    </div>

    <div class="grid kpi-row">
      ${kpiCard({ label: "Total budget", value: "$" + fmtMoney(total.budget, { compact: true }), sub: `FY${fy} plan`, icon: "layers", iconColor: "var(--series-1)" })}
      ${kpiCard({ label: "Actual spend (YTD)", value: "$" + fmtMoney(total.actual, { compact: true }), sub: `Through ${MONTH_NAMES[asOf - 1]} · ${fmtPct(paceExpected)} of year elapsed`, icon: "trend", iconColor: "var(--series-3)", sparkline: monthlyActualToDate.length > 1 ? monthlyActualToDate : null })}
      ${kpiCard({ label: "Encumbered / committed", value: "$" + fmtMoney(total.encumbrance, { compact: true }), sub: "Open POs & obligations", icon: "inbox", iconColor: "var(--series-2)" })}
      ${kpiCard({ label: "Remaining balance", value: "$" + fmtMoney(total.balance, { compact: true }), sub: pctUsed != null ? `${fmtPct(pctUsed)} of budget committed` : "No budget set", icon: "scale", iconColor: "var(--series-6)" })}
      ${kpiCard({ label: "Projected year-end spend", value: "$" + fmtMoney(rr.projectedAnnual, { compact: true }), sub: rr.hasBudget ? `${rr.projectedVariancePct >= 0 ? "+" : ""}${fmtPct(rr.projectedVariancePct)} vs budget at current run-rate` : "No budget set", deltaText: rr.hasBudget ? STATUS_LABEL[rr.status] : null, deltaGood: rr.status === "good", icon: "chart", iconColor: projectedStatusColor, sparkline: cumCommittedToDate.length > 1 ? cumCommittedToDate : null })}
    </div>

    <div class="grid two-col">
      <div class="card chart-card">
        <div class="chart-head">
          <div><h3>Cumulative spend vs. budget pace</h3><div class="chart-cap">Actual + committed, all categories · FY${fy}</div></div>
          <button class="table-toggle" data-action="goto-comparison">View full comparison →</button>
        </div>
        <div class="chart-wrap" style="height:280px"><canvas id="chart-trend"></canvas></div>
      </div>
      <div class="card chart-card">
        <div class="chart-head">
          <div><h3>Categories to watch</h3><div class="chart-cap">Ranked by projected year-end variance</div></div>
        </div>
        ${watchList(rows)}
      </div>
    </div>

    <div class="card chart-card" style="margin-top:14px">
      <div class="chart-head">
        <div><h3>Budget vs. actual vs. encumbered, by category</h3><div class="chart-cap">FY${fy} full-year budget compared to spend to date</div></div>
        <button class="table-toggle" data-action="goto-comparison">View as table →</button>
      </div>
      <div class="chart-wrap" style="height:320px"><canvas id="chart-category"></canvas></div>
    </div>
  `;

  root.querySelectorAll('[data-action="goto-comparison"]').forEach((b) => b.addEventListener("click", () => Store.setRoute("comparison")));
  root.querySelectorAll("[data-drill]").forEach((b) => b.addEventListener("click", () => {
    const [categoryId, projectCode] = b.getAttribute("data-drill").split("::");
    Store.setRoute("drilldown", { categoryId: categoryId || null, projectCode: projectCode || null });
  }));

  const labels = MONTH_NAMES.slice(0, 12);
  const cumBudget = []; const cumActual = [];
  let runB = 0, runA = 0;
  for (let i = 0; i < 12; i++) {
    runB += total.byMonth.budget[i] || 0;
    runA += (total.byMonth.actual[i] || 0) + (total.byMonth.encumbrance[i] || 0);
    cumBudget.push(runB);
    cumActual.push(runA);
  }
  monthlyTrendChart(document.getElementById("chart-trend"), {
    labels, cumulativeBudget: cumBudget, cumulativeCommitted: cumActual, asOfIndex: asOf - 1,
  });

  budgetActualBarChart(document.getElementById("chart-category"), {
    labels: rows.map((r) => r.name),
    budget: rows.map((r) => r.budget),
    actual: rows.map((r) => r.actual),
    encumbrance: rows.map((r) => r.encumbrance),
  });
}

function computePortfolioRunRate(rows) {
  // aggregate run-rate numbers across all category rows (already computed per-row)
  let ytdActual = 0, projectedAnnual = 0, budget = 0;
  for (const r of rows) { ytdActual += r.runRate.ytdActual; projectedAnnual += r.runRate.projectedAnnual; budget += r.budget; }
  const hasBudget = budget > 0;
  const projectedVariancePct = hasBudget ? (projectedAnnual - budget) / budget : null;
  const status = hasBudget ? (projectedVariancePct <= 0.02 ? "good" : projectedVariancePct <= 0.10 ? "warning" : projectedVariancePct <= 0.25 ? "serious" : "critical") : "unbudgeted";
  return { ytdActual, projectedAnnual, hasBudget, projectedVariancePct, status };
}

function watchList(rows) {
  const flat = [];
  for (const cat of rows) {
    for (const p of cat.projects) {
      if (!p.runRate.hasBudget) continue;
      flat.push({ label: p.name, code: p.code, categoryId: cat.id, pct: p.runRate.projectedVariancePct, status: p.runRate.status, projected: p.runRate.projectedAnnual, budget: p.budget });
    }
  }
  flat.sort((a, b) => b.pct - a.pct);
  const top = flat.filter((f) => f.status !== "good").slice(0, 6);
  const list = top.length ? top : flat.slice(0, 6);
  if (!list.length) return `<p class="hint">Not enough budgeted projects yet to project a run-rate.</p>`;
  return `<div class="stack" style="gap:10px">${list.map((f) => `
    <div class="field-row" style="justify-content:space-between; align-items:center; gap:8px" data-drill="${f.categoryId}::${f.code}" role="button">
      <div style="min-width:0">
        <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.label}</div>
        <div style="font-size:11.5px;color:var(--text-muted)">Projected $${fmtMoney(f.projected, { compact: true })} vs $${fmtMoney(f.budget, { compact: true })} budget</div>
      </div>
      ${statusChip(f.status)}
    </div>`).join("")}</div>`;
}

function emptyState() {
  const s = Store.state;
  const hasOrphanTransactions = s.transactions.length > 0 && s.categories.length === 0;
  return `
  <div class="view-head"><h1>Dashboard</h1></div>
  <div class="card empty-state">
    <div class="big-ic">${icon("dashboard", { size: 44, strokeWidth: 1.6 })}</div>
    <h3>No data yet</h3>
    ${hasOrphanTransactions
      ? `<p>${s.transactions.length.toLocaleString()} transaction line(s) are imported, but there are no categories or projects to group them under yet. Add matching project codes in <b>Data &amp; Settings → Categories &amp; projects</b> (or import a budget template) so they show up here.</p>`
      : `<p>Load the sample dataset to explore the tool, or head to <b>Data &amp; Settings</b> to import your own budget and actuals.</p>`}
    <div class="field-row" style="justify-content:center;margin-top:14px">
      <button class="btn btn-primary" id="load-demo-btn">Load sample data</button>
      <button class="btn" id="go-data-btn">Go to Data &amp; Settings</button>
    </div>
  </div>`;
}
