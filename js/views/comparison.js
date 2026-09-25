import { Store } from "../store.js";
import { aggregateActuals, budgetByProject, buildComparisonRows, grandTotal, fmtMoney, fmtPct, MONTH_NAMES } from "../calc.js";
import { statusChip, meterBar, toCsv, downloadTextFile, captureFocus, restoreFocus } from "../ui.js";
import { icon } from "../icons.js";

let expanded = new Set();
let search = "";
let categoryFilter = "";

export function render(root) {
  const s = Store.state;
  if (!s.categories.length) { root.innerHTML = `<div class="view-head"><h1>Budget vs. Actual</h1></div><div class="card empty-state">Load data from <b>Data &amp; Settings</b> first.</div>`; return; }
  if (!expanded.size) expanded = new Set(s.categories.map((c) => c.id));

  const fy = s.fiscalYear, asOf = s.asOfMonth;
  const actualsByProject = aggregateActuals(s.transactions, fy);
  const budgetMap = budgetByProject(s.budgetLines, fy);
  let rows = buildComparisonRows({ categories: s.categories, projects: s.projects, actualsByProject, budgetByProjectMap: budgetMap, asOfMonth: asOf });

  if (categoryFilter) rows = rows.filter((r) => r.id === categoryFilter);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.map((r) => ({ ...r, projects: r.projects.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) }))
      .filter((r) => r.name.toLowerCase().includes(q) || r.projects.length);
  }
  const total = grandTotal(rows);

  root.innerHTML = `
    <div class="view-head">
      <h1>Budget vs. Actual</h1>
      <p class="lead">Committed = actual spend + open encumbrances. Balance = FY${fy} budget minus committed. Click a cost item group to expand, or a cost item row to drill into its transactions.</p>
    </div>

    <div class="filter-bar">
      <div class="field grow">
        <label>Search cost item or code</label>
        <input type="search" id="cmp-search" placeholder="e.g. Advertising, ADV-100…" value="${escapeHtml(search)}" />
      </div>
      <div class="field">
        <label>Cost item group</label>
        <select id="cmp-category">
          <option value="">All cost item groups</option>
          ${s.categories.map((c) => `<option value="${c.id}" ${categoryFilter === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
        </select>
      </div>
      <div class="field-row" style="margin-left:auto">
        <button class="btn btn-sm" id="expand-all">Expand all</button>
        <button class="btn btn-sm" id="collapse-all">Collapse all</button>
        <button class="btn btn-sm" id="export-csv">Export CSV</button>
      </div>
    </div>

    <div class="table-scroll">
      <table class="data-table" id="cmp-table">
        <thead>
          <tr>
            <th>Cost Item Group / Cost Item</th>
            <th>Budget</th>
            <th>Actual</th>
            <th>Encumbered</th>
            <th>Committed</th>
            <th>Balance</th>
            <th>% used</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((cat) => renderCategoryRows(cat)).join("")}
        </tbody>
        <tfoot>
          <tr class="row-total">
            <td>Grand total</td>
            <td class="num">$${fmtMoney(total.budget, { compact: true })}</td>
            <td class="num">$${fmtMoney(total.actual, { compact: true })}</td>
            <td class="num">$${fmtMoney(total.encumbrance, { compact: true })}</td>
            <td class="num">$${fmtMoney(total.committed, { compact: true })}</td>
            <td class="num">$${fmtMoney(total.balance, { compact: true })}</td>
            <td class="num">${total.budget > 0 ? fmtPct(total.committed / total.budget) : "—"}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  root.querySelector("#cmp-search").addEventListener("input", (e) => { search = e.target.value; const snap = captureFocus(root); render(root); restoreFocus(snap); });
  root.querySelector("#cmp-category").addEventListener("change", (e) => { categoryFilter = e.target.value; render(root); });
  root.querySelector("#expand-all").addEventListener("click", () => { expanded = new Set(s.categories.map((c) => c.id)); render(root); });
  root.querySelector("#collapse-all").addEventListener("click", () => { expanded = new Set(); render(root); });
  root.querySelector("#export-csv").addEventListener("click", () => exportCsv(rows, fy));

  root.querySelectorAll("tr.row-category").forEach((tr) => tr.addEventListener("click", () => {
    const id = tr.getAttribute("data-cat");
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    render(root);
  }));
  root.querySelectorAll("tr.row-clickable").forEach((tr) => tr.addEventListener("click", () => {
    Store.setRoute("drilldown", { categoryId: tr.getAttribute("data-cat"), projectCode: tr.getAttribute("data-code") });
  }));
}

function renderCategoryRows(cat) {
  const isOpen = expanded.has(cat.id);
  const catRow = `
    <tr class="row-category" data-cat="${cat.id}">
      <td class="name-cell">${icon(isOpen ? "chevronDown" : "chevronRight", { size: 14, strokeWidth: 2.4 })} ${cat.name}</td>
      <td class="num">$${fmtMoney(cat.budget, { compact: true })}</td>
      <td class="num">$${fmtMoney(cat.actual, { compact: true })}</td>
      <td class="num">$${fmtMoney(cat.encumbrance, { compact: true })}</td>
      <td class="num">$${fmtMoney(cat.committed, { compact: true })}</td>
      <td class="num">$${fmtMoney(cat.balance, { compact: true })}</td>
      <td class="num">${meterBar(cat.pctUsed, cat.runRate.status)}</td>
      <td>${statusChip(cat.runRate.status)}</td>
    </tr>`;
  if (!isOpen) return catRow;
  const projRows = cat.projects.map((p) => `
    <tr class="row-clickable" data-cat="${cat.id}" data-code="${p.code}">
      <td class="name-cell" style="padding-left:26px">${p.name} <span class="badge-soft">${p.code}</span></td>
      <td class="num">$${fmtMoney(p.budget, { compact: true })}</td>
      <td class="num">$${fmtMoney(p.actual, { compact: true })}</td>
      <td class="num">$${fmtMoney(p.encumbrance, { compact: true })}</td>
      <td class="num">$${fmtMoney(p.committed, { compact: true })}</td>
      <td class="num">$${fmtMoney(p.balance, { compact: true })}</td>
      <td class="num">${meterBar(p.pctUsed, p.runRate.status)}</td>
      <td>${statusChip(p.runRate.status)}</td>
    </tr>`).join("");
  return catRow + projRows;
}

function exportCsv(rows, fy) {
  const lines = [];
  for (const cat of rows) {
    lines.push([cat.name, cat.budget, cat.actual, cat.encumbrance, cat.committed, cat.balance]);
    for (const p of cat.projects) lines.push([`  ${p.name} (${p.code})`, p.budget, p.actual, p.encumbrance, p.committed, p.balance]);
  }
  const csv = toCsv(["Cost Item Group / Cost Item", "Budget", "Actual", "Encumbered", "Committed", "Balance"], lines);
  downloadTextFile(`budget-vs-actual-FY${fy}.csv`, csv);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
