import { Store } from "../store.js";
import { aggregateActuals, budgetByProject, computeRunRate, fmtMoney, fmtPct, friendlyDocType, MONTH_NAMES } from "../calc.js";
import { statusChip, toCsv, downloadTextFile, captureFocus, restoreFocus, kpiCard } from "../ui.js";
import { budgetActualBarChart } from "../charts.js";

let txSearch = "";
let txSort = { key: "postedDate", dir: -1 };
let txPage = 1;
const PAGE_SIZE = 50;
let vendorFilter = "";
let typeFilter = "";
let docTypeFilter = "";

export function render(root) {
  const s = Store.state;
  if (!s.categories.length) { root.innerHTML = `<div class="view-head"><h1>Drill-Down</h1></div><div class="card empty-state">Load data from <b>Data &amp; Settings</b> first.</div>`; return; }

  const { categoryId, projectCode } = s.drill;
  if (projectCode) return renderProject(root, s, categoryId, projectCode);
  if (categoryId) return renderCategory(root, s, categoryId);
  return renderCategoryPicker(root, s);
}

function crumbs(parts) {
  return `<div class="crumbs">${parts.map((p, i) => `${i > 0 ? '<span class="sep">/</span>' : ""}${p.action ? `<button data-crumb="${p.action}">${p.label}</button>` : `<span>${p.label}</span>`}`).join("")}</div>`;
}

function renderCategoryPicker(root, s) {
  const fy = s.fiscalYear, asOf = s.asOfMonth;
  const actualsByProject = aggregateActuals(s.transactions, fy);
  const budgetMap = budgetByProject(s.budgetLines, fy);
  root.innerHTML = `
    <div class="view-head"><h1>Drill-Down</h1><p class="lead">Pick a cost item group to explore its cost items, then a cost item to see every underlying transaction.</p></div>
    ${crumbs([{ label: "All cost item groups" }])}
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
      ${s.categories.map((c) => {
        const projs = s.projects.filter((p) => p.categoryId === c.id);
        const budget = projs.reduce((sum, p) => sum + (budgetMap.get(p.code)?.total || 0), 0);
        const actual = projs.reduce((sum, p) => sum + (actualsByProject.get(p.code)?.actual || 0), 0);
        return `<div class="card" data-cat="${c.id}" style="cursor:pointer">
          <div style="font-weight:700;font-size:14px;margin-bottom:6px">${c.name}</div>
          <div class="hint">${projs.length} cost item${projs.length === 1 ? "" : "s"}</div>
          <div style="margin-top:10px;font-size:13px">$${fmtMoney(actual, { compact: true })} <span class="hint">actual of</span> $${fmtMoney(budget, { compact: true })}</div>
        </div>`;
      }).join("")}
    </div>
  `;
  root.querySelectorAll("[data-cat]").forEach((el) => el.addEventListener("click", () => Store.setRoute("drilldown", { categoryId: el.getAttribute("data-cat"), projectCode: null })));
}

function renderCategory(root, s, categoryId) {
  const cat = s.categories.find((c) => c.id === categoryId);
  const fy = s.fiscalYear, asOf = s.asOfMonth;
  const projects = s.projects.filter((p) => p.categoryId === categoryId);
  const actualsByProject = aggregateActuals(s.transactions, fy);
  const budgetMap = budgetByProject(s.budgetLines, fy);

  root.innerHTML = `
    <div class="view-head"><h1>${cat ? cat.name : "Cost Item Group"}</h1></div>
    ${crumbs([{ label: "All cost item groups", action: "root" }, { label: cat ? cat.name : "" }])}
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Cost Item</th><th>Budget</th><th>Actual</th><th>Encumbered</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody>
          ${projects.map((p) => {
            const a = actualsByProject.get(p.code) || { actual: 0, encumbrance: 0, actualByMonth: Array(12).fill(0), encumbranceByMonth: Array(12).fill(0) };
            const b = budgetMap.get(p.code) || { total: 0 };
            const rr = computeRunRate(a.actualByMonth, a.encumbranceByMonth, b.total, s.asOfMonth);
            return `<tr class="row-clickable" data-code="${p.code}">
              <td class="name-cell">${p.name} <span class="badge-soft">${p.code}</span></td>
              <td class="num">$${fmtMoney(b.total, { compact: true })}</td>
              <td class="num">$${fmtMoney(a.actual, { compact: true })}</td>
              <td class="num">$${fmtMoney(a.encumbrance, { compact: true })}</td>
              <td class="num">$${fmtMoney(b.total - a.actual - a.encumbrance, { compact: true })}</td>
              <td>${statusChip(rr.status)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
  root.querySelector('[data-crumb="root"]').addEventListener("click", () => Store.setRoute("drilldown", { categoryId: null, projectCode: null }));
  root.querySelectorAll("[data-code]").forEach((el) => el.addEventListener("click", () => Store.setRoute("drilldown", { categoryId, projectCode: el.getAttribute("data-code") })));
}

function renderProject(root, s, categoryId, projectCode) {
  const cat = s.categories.find((c) => c.id === categoryId);
  const proj = s.projects.find((p) => p.code === projectCode);
  const fy = s.fiscalYear, asOf = s.asOfMonth;
  const actualsByProject = aggregateActuals(s.transactions, fy);
  const budgetMap = budgetByProject(s.budgetLines, fy);
  const a = actualsByProject.get(projectCode) || { actual: 0, encumbrance: 0, actualByMonth: Array(12).fill(0), encumbranceByMonth: Array(12).fill(0) };
  const b = budgetMap.get(projectCode) || { total: 0, byMonth: Array(12).fill(0) };
  const rr = computeRunRate(a.actualByMonth, a.encumbranceByMonth, b.total, asOf);

  let txs = s.transactions.filter((t) => t.project === projectCode && t.year === fy);
  const vendors = [...new Set(txs.map((t) => t.vendor).filter(Boolean))].sort();
  const docTypes = [...new Set(txs.map((t) => friendlyDocType(t.docType)))].sort();

  if (vendorFilter) txs = txs.filter((t) => t.vendor === vendorFilter);
  if (typeFilter) txs = txs.filter((t) => t.balanceType === typeFilter);
  if (docTypeFilter) txs = txs.filter((t) => friendlyDocType(t.docType) === docTypeFilter);
  if (txSearch.trim()) {
    const q = txSearch.trim().toLowerCase();
    txs = txs.filter((t) => [t.desc, t.vendor, t.docNo].some((v) => v && String(v).toLowerCase().includes(q)));
  }
  txs = txs.slice().sort((x, y) => {
    const av = x[txSort.key], bv = y[txSort.key];
    if (typeof av === "string" || typeof bv === "string") return txSort.dir * String(av || "").localeCompare(String(bv || ""));
    return txSort.dir * ((av ?? 0) - (bv ?? 0));
  });
  const totalPages = Math.max(1, Math.ceil(txs.length / PAGE_SIZE));
  txPage = Math.min(txPage, totalPages);
  const pageRows = txs.slice((txPage - 1) * PAGE_SIZE, txPage * PAGE_SIZE);

  root.innerHTML = `
    <div class="view-head"><h1>${proj ? proj.name : "Cost Item"} <span class="badge-soft">${projectCode}</span></h1></div>
    ${crumbs([{ label: "All cost item groups", action: "root" }, { label: cat ? cat.name : "", action: "cat" }, { label: proj ? proj.name : "" }])}

    <div class="grid kpi-row">
      ${kpiCard({ label: `FY${fy} budget`, value: "$" + fmtMoney(b.total, { compact: true }), icon: "layers", iconColor: "var(--series-1)" })}
      ${kpiCard({ label: "Actual", value: "$" + fmtMoney(a.actual, { compact: true }), icon: "trend", iconColor: "var(--series-3)" })}
      ${kpiCard({ label: "Encumbered", value: "$" + fmtMoney(a.encumbrance, { compact: true }), icon: "inbox", iconColor: "var(--series-2)" })}
      ${kpiCard({ label: "Balance", value: "$" + fmtMoney(b.total - a.actual - a.encumbrance, { compact: true }), icon: "scale", iconColor: "var(--series-6)" })}
      ${kpiCard({ label: "Projected year-end", value: "$" + fmtMoney(rr.projectedAnnual, { compact: true }), sub: statusChip(rr.status), icon: "chart" })}
    </div>

    <div class="card chart-card">
      <div class="chart-head"><div><h3>Monthly budget vs. actual vs. encumbered</h3></div>
        <button class="table-toggle" data-action="rr">See run-rate detail →</button></div>
      <div class="chart-wrap" style="height:260px"><canvas id="chart-project-months"></canvas></div>
    </div>

    <div class="section-title"><h2>Transactions</h2><span class="hint">${txs.length.toLocaleString()} matching line${txs.length === 1 ? "" : "s"}</span></div>
    <div class="filter-bar">
      <div class="field grow"><label>Search vendor, description or doc #</label><input type="search" id="tx-search" value="${escapeHtml(txSearch)}" placeholder="e.g. invoice number, vendor name…" /></div>
      <div class="field"><label>Vendor</label>
        <select id="tx-vendor"><option value="">All vendors</option>${vendors.map((v) => `<option ${vendorFilter === v ? "selected" : ""}>${v}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Document type</label>
        <select id="tx-doctype"><option value="">All document types</option>${docTypes.map((d) => `<option ${docTypeFilter === d ? "selected" : ""}>${d}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Basis</label>
        <select id="tx-type"><option value="">All</option><option value="A" ${typeFilter === "A" ? "selected" : ""}>Actual</option><option value="E" ${typeFilter === "E" ? "selected" : ""}>Encumbrance</option></select>
      </div>
      <div class="field-row" style="margin-left:auto"><button class="btn btn-sm" id="tx-export">Export CSV</button></div>
    </div>
    <div class="table-scroll">
      <table class="data-table" id="tx-table">
        <thead><tr>
          <th data-sort="postedDate" class="${txSort.key === "postedDate" ? "sorted" : ""}">Date</th>
          <th data-sort="vendor" class="${txSort.key === "vendor" ? "sorted" : ""}">Vendor</th>
          <th data-sort="desc" class="${txSort.key === "desc" ? "sorted" : ""}">Description</th>
          <th data-sort="docNo" class="${txSort.key === "docNo" ? "sorted" : ""}">Doc #</th>
          <th>Document type</th>
          <th>Basis</th>
          <th data-sort="amount" class="${txSort.key === "amount" ? "sorted" : ""}">Amount</th>
        </tr></thead>
        <tbody>
          ${pageRows.map((t) => `<tr>
            <td>${t.postedDate || "—"}</td>
            <td>${t.vendor || "—"}</td>
            <td>${t.desc || "—"}</td>
            <td>${t.docNo || "—"}</td>
            <td><span class="badge-soft">${friendlyDocType(t.docType)}</span></td>
            <td><span class="badge-soft">${t.balanceType === "E" ? "Encumbrance" : "Actual"}</span></td>
            <td class="num">$${fmtMoney(t.amount)}</td>
          </tr>`).join("") || `<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No transactions match these filters.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="field-row" style="justify-content:center;margin-top:10px">
      <button class="btn btn-sm" id="tx-prev" ${txPage <= 1 ? "disabled" : ""}>← Prev</button>
      <span class="hint">Page ${txPage} of ${totalPages}</span>
      <button class="btn btn-sm" id="tx-next" ${txPage >= totalPages ? "disabled" : ""}>Next →</button>
    </div>
  `;

  root.querySelector('[data-crumb="root"]').addEventListener("click", () => Store.setRoute("drilldown", { categoryId: null, projectCode: null }));
  root.querySelector('[data-crumb="cat"]').addEventListener("click", () => Store.setRoute("drilldown", { categoryId, projectCode: null }));
  root.querySelector('[data-action="rr"]').addEventListener("click", () => Store.setRoute("runrate"));

  root.querySelector("#tx-search").addEventListener("input", (e) => { txSearch = e.target.value; txPage = 1; const snap = captureFocus(root); render(root); restoreFocus(snap); });
  root.querySelector("#tx-vendor").addEventListener("change", (e) => { vendorFilter = e.target.value; txPage = 1; render(root); });
  root.querySelector("#tx-doctype").addEventListener("change", (e) => { docTypeFilter = e.target.value; txPage = 1; render(root); });
  root.querySelector("#tx-type").addEventListener("change", (e) => { typeFilter = e.target.value; txPage = 1; render(root); });
  root.querySelector("#tx-export").addEventListener("click", () => {
    const csv = toCsv(["Date", "Vendor", "Description", "Doc No", "Document Type", "Basis", "Amount"], txs.map((t) => [t.postedDate, t.vendor, t.desc, t.docNo, friendlyDocType(t.docType), t.balanceType === "E" ? "Encumbrance" : "Actual", t.amount]));
    downloadTextFile(`${projectCode}-transactions-FY${fy}.csv`, csv);
  });
  root.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
    const key = th.getAttribute("data-sort");
    txSort = { key, dir: txSort.key === key ? -txSort.dir : 1 };
    render(root);
  }));
  root.querySelector("#tx-prev")?.addEventListener("click", () => { txPage--; render(root); });
  root.querySelector("#tx-next")?.addEventListener("click", () => { txPage++; render(root); });

  budgetActualBarChart(document.getElementById("chart-project-months"), {
    labels: MONTH_NAMES,
    budget: b.byMonth,
    actual: a.actualByMonth,
    encumbrance: a.encumbranceByMonth,
  });
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
