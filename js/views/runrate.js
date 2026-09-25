import { Store } from "../store.js";
import { aggregateActuals, budgetByProject, buildComparisonRows, computeRunRate, fmtMoney, fmtPct, MONTH_NAMES } from "../calc.js";
import { statusChip } from "../ui.js";
import { runRateChart } from "../charts.js";

let focus = ""; // "" = whole portfolio, "cat:<id>" or "proj:<code>"

export function render(root) {
  const s = Store.state;
  if (!s.categories.length) { root.innerHTML = `<div class="view-head"><h1>Run Rate &amp; Forecast</h1></div><div class="card empty-state">Load data from <b>Data &amp; Settings</b> first.</div>`; return; }

  const fy = s.fiscalYear, asOf = s.asOfMonth;
  const actualsByProject = aggregateActuals(s.transactions, fy);
  const budgetMap = budgetByProject(s.budgetLines, fy);
  const rows = buildComparisonRows({ categories: s.categories, projects: s.projects, actualsByProject, budgetByProjectMap: budgetMap, asOfMonth: asOf });

  const flatList = [];
  for (const cat of rows) {
    flatList.push({ key: `cat:${cat.id}`, label: cat.name, isCat: true, row: cat });
    for (const p of cat.projects) flatList.push({ key: `proj:${p.code}`, label: `— ${p.name}`, isCat: false, row: p, catName: cat.name });
  }

  const selected = focus ? flatList.find((f) => f.key === focus) : null;
  const scopeLabel = selected ? selected.label.replace(/^— /, "") : "Entire portfolio";
  const scopeRow = selected ? selected.row : portfolioRollup(rows);

  root.innerHTML = `
    <div class="view-head">
      <h1>Run Rate &amp; Forecast</h1>
      <p class="lead">Projected year-end spend = year-to-date actual + (average monthly actual × remaining months). Compared against each cost item's FY${fy} budget to flag pace issues before year-end.</p>
    </div>

    <div class="filter-bar">
      <div class="field grow">
        <label>Focus</label>
        <select id="rr-focus">
          <option value="">Entire portfolio</option>
          ${rows.map((cat) => `
            <optgroup label="${cat.name}">
              <option value="cat:${cat.id}" ${focus === "cat:" + cat.id ? "selected" : ""}>${cat.name} (cost item group total)</option>
              ${cat.projects.map((p) => `<option value="proj:${p.code}" ${focus === "proj:" + p.code ? "selected" : ""}>${p.name}</option>`).join("")}
            </optgroup>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>As of</label>
        <div class="hint" style="padding:7px 0">${MONTH_NAMES[asOf - 1]} FY${fy} <span class="hint">(set in top bar)</span></div>
      </div>
    </div>

    <div class="grid two-col">
      <div class="card chart-card">
        <div class="chart-head"><div><h3>${scopeLabel}</h3><div class="chart-cap">Actual to date vs. projected remainder, monthly budget line shown for reference</div></div></div>
        <div class="chart-wrap" style="height:300px"><canvas id="chart-runrate"></canvas></div>
      </div>
      <div class="stack">
        ${statBlock(scopeRow, fy, asOf)}
      </div>
    </div>

    <div class="section-title"><h2>All lines — projected year-end position</h2></div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>
          <th>Cost Item Group / Cost Item</th><th>Months elapsed</th><th>YTD actual</th><th>Avg / month</th>
          <th>Projected annual</th><th>FY${fy} budget</th><th>Projected variance</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${flatList.filter((f) => f.row.runRate.hasBudget || f.isCat).map((f) => {
            const rr = f.row.runRate;
            return `<tr class="${f.isCat ? "row-category" : "row-clickable"}" data-key="${f.key}">
              <td class="name-cell" style="${f.isCat ? "" : "padding-left:26px"}">${f.label}</td>
              <td class="num">${rr.monthsElapsed}/12</td>
              <td class="num">$${fmtMoney(rr.ytdActual, { compact: true })}</td>
              <td class="num">$${fmtMoney(rr.avgMonthly, { compact: true })}</td>
              <td class="num">$${fmtMoney(rr.projectedAnnual, { compact: true })}</td>
              <td class="num">${rr.hasBudget ? "$" + fmtMoney(f.row.budget, { compact: true }) : "—"}</td>
              <td class="num">${rr.hasBudget ? (rr.projectedVariance >= 0 ? "+" : "") + "$" + fmtMoney(rr.projectedVariance, { compact: true }) + " (" + fmtPct(rr.projectedVariancePct) + ")" : "—"}</td>
              <td>${statusChip(rr.status)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  root.querySelector("#rr-focus").addEventListener("change", (e) => { focus = e.target.value; render(root); });
  root.querySelectorAll("tr[data-key]").forEach((tr) => tr.addEventListener("click", () => { focus = tr.getAttribute("data-key"); render(root); }));

  const labels = MONTH_NAMES.slice(0, 12);
  const actualByMonth = scopeRow.byMonth.actual.map((v, i) => (i < asOf ? v : null));
  const avg = scopeRow.runRate.avgMonthly;
  const projectedByMonth = scopeRow.byMonth.actual.map((v, i) => (i === asOf - 1 ? 0 : i >= asOf ? avg : null));
  const budgetLine = scopeRow.budget > 0 ? scopeRow.budget / 12 : 0;
  runRateChart(document.getElementById("chart-runrate"), { labels, actualByMonth, projectedByMonth, budgetLine });
}

function portfolioRollup(rows) {
  const byMonthActual = Array(12).fill(0), byMonthEnc = Array(12).fill(0), byMonthBudget = Array(12).fill(0);
  let budget = 0;
  for (const r of rows) {
    budget += r.budget;
    for (let i = 0; i < 12; i++) {
      byMonthActual[i] += r.byMonth.actual[i] || 0;
      byMonthEnc[i] += r.byMonth.encumbrance[i] || 0;
      byMonthBudget[i] += r.byMonth.budget[i] || 0;
    }
  }
  const asOf = Store.state.asOfMonth;
  return {
    budget,
    byMonth: { actual: byMonthActual, encumbrance: byMonthEnc, budget: byMonthBudget },
    runRate: computeRunRate(byMonthActual, byMonthEnc, budget, asOf),
  };
}

function statBlock(row, fy, asOf) {
  const rr = row.runRate;
  return `
  <div class="card">
    <div class="kpi-label">Year-to-date actual</div>
    <div class="kpi-value">$${fmtMoney(rr.ytdActual, { compact: true })}</div>
    <div class="kpi-sub">Avg $${fmtMoney(rr.avgMonthly, { compact: true })}/month across ${rr.monthsElapsed} month(s)</div>
  </div>
  <div class="card">
    <div class="kpi-label">Projected FY${fy} total</div>
    <div class="kpi-value">$${fmtMoney(rr.projectedAnnual, { compact: true })}</div>
    <div class="kpi-sub">${rr.hasBudget ? `vs. $${fmtMoney(row.budget, { compact: true })} budget` : "No budget set for this line"}</div>
    ${rr.hasBudget ? `<div style="margin-top:6px">${statusChip(rr.status)}</div>` : ""}
  </div>`;
}
