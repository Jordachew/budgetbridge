import { Store } from "../store.js";
import { budgetByProject, fmtMoney, MONTH_NAMES, slugify } from "../calc.js";
import { toast, openModal } from "../ui.js";
import { icon } from "../icons.js";

let planFy = null;
let periodMode = "quarter"; // "month" | "quarter"
const QUARTERS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];

// A quarterly edit fires one commit per underlying month (3 calls). A single
// shared debounce would cancel the first two on every keystroke, so each
// (project, month) pair gets its own independent timer instead.
const commitTimers = new Map();
function commit(fy, code, month, amount) {
  const key = `${fy}:${code}:${month}`;
  clearTimeout(commitTimers.get(key));
  commitTimers.set(key, setTimeout(() => Store.setBudgetAmount(fy, code, month, amount), 350));
}

export function render(root) {
  const s = Store.state;
  if (!planFy) planFy = s.fiscalYear;
  if (!s.categories.length) {
    root.innerHTML = `<div class="view-head"><h1>Planning</h1></div><div class="card empty-state">${Store.isAdmin
      ? `Load data from <b>Data &amp; Settings</b> first, or add a cost item group below to start from scratch.
      <div style="margin-top:12px"><button class="btn btn-primary" id="add-cat-empty">Add first cost item group</button></div>`
      : `There's nothing set up yet — ask an admin to add cost item groups and assign you to one under <b>Data &amp; Settings → Users &amp; access</b>.`}</div>`;
    root.querySelector("#add-cat-empty")?.addEventListener("click", () => addCategoryModal(root));
    return;
  }
  const budgetMap = budgetByProject(s.budgetLines, planFy);
  const years = new Set(Store.availableFiscalYears());
  years.add(planFy); years.add(planFy + 1);
  const yearList = [...years].sort((a, b) => a - b);

  root.innerHTML = `
    <div class="view-head">
      <h1>Planning</h1>
      <p class="lead">Enter the budget for each cost item by month or by quarter. Everyone sees the full rollup; you can only edit the cost item group(s) assigned to you. Changes save immediately for the whole team — nothing to export or share.</p>
    </div>

    <div class="filter-bar">
      <div class="field">
        <label>Fiscal year</label>
        <select id="plan-fy">${yearList.map((y) => `<option value="${y}" ${y === planFy ? "selected" : ""}>FY${y}</option>`).join("")}</select>
      </div>
      <div class="field">
        <label>View</label>
        <div class="pill-select">
          <button data-mode="quarter" class="${periodMode === "quarter" ? "active" : ""}">Quarterly</button>
          <button data-mode="month" class="${periodMode === "month" ? "active" : ""}">Monthly</button>
        </div>
      </div>
      <div class="field-row" style="margin-left:auto">
        <button class="btn btn-sm" id="copy-fy">Copy from another year…</button>
        ${Store.isAdmin ? `<button class="btn btn-sm" id="add-cat">+ Cost item group</button>` : ""}
      </div>
    </div>

    <div class="plan-grid-wrap card" style="padding:0">
      <table class="plan-grid">
        <thead>
          <tr>
            <th style="text-align:left;position:sticky;left:0;z-index:2">Cost Item Group / Cost Item</th>
            ${periodCols().map((c) => `<th>${c}</th>`).join("")}
            <th>FY${planFy} total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${s.categories.map((cat) => renderCategoryBlock(cat, s, budgetMap)).join("")}
        </tbody>
        <tfoot>
          <tr class="category-row" data-grand-total><td class="label-cell">Grand total</td>
            ${periodCols().map((_, i) => `<td class="total-cell" data-period-total="${i}">$${fmtMoney(grandTotalForPeriod(s, budgetMap, i), { compact: true })}</td>`).join("")}
            <td class="total-cell" data-grand-total-value>$${fmtMoney(grandTotalAll(s, budgetMap), { compact: true })}</td><td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  root.querySelector("#plan-fy").addEventListener("change", (e) => { planFy = Number(e.target.value); render(root); });
  root.querySelectorAll(".pill-select button").forEach((b) => b.addEventListener("click", () => { periodMode = b.getAttribute("data-mode"); render(root); }));
  root.querySelector("#add-cat")?.addEventListener("click", () => addCategoryModal(root));
  root.querySelector("#copy-fy").addEventListener("click", () => copyFromYearModal(root, yearList));

  root.querySelectorAll("input.cell-input:not([disabled])").forEach((input) => {
    input.addEventListener("input", () => {
      const code = input.dataset.code;
      const periodIndex = Number(input.dataset.period);
      const value = Number(input.value) || 0;
      applyPeriodValue(root, code, periodIndex, value);
    });
  });
  root.querySelectorAll("[data-add-project]").forEach((b) => b.addEventListener("click", () => addProjectModal(root, b.getAttribute("data-add-project"))));
  root.querySelectorAll("[data-del-project]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Remove this cost item and its budget entries?")) return;
    await Store.deleteProject(b.getAttribute("data-del-project"));
    render(root);
  }));
  root.querySelectorAll("[data-notes]").forEach((b) => b.addEventListener("click", () => notesModal(root, b.getAttribute("data-notes"))));
}

function periodCols() { return periodMode === "quarter" ? ["Q1", "Q2", "Q3", "Q4"] : MONTH_NAMES; }

function monthsForPeriod(i) { return periodMode === "quarter" ? QUARTERS[i] : [i]; }

function periodValue(budgetMap, code, i) {
  const bucket = budgetMap.get(code);
  if (!bucket) return 0;
  return monthsForPeriod(i).reduce((sum, m) => sum + (bucket.byMonth[m] || 0), 0);
}

function applyPeriodValue(root, code, periodIndex, value) {
  const months = monthsForPeriod(periodIndex);
  const per = Math.round((value / months.length) * 100) / 100;
  for (const m of months) commit(planFy, code, m + 1, per);
  // optimistic UI update of totals without full re-render (keeps focus in the input)
  requestAnimationFrame(() => refreshTotals(root, code));
}

function refreshTotals(root, code) {
  // Recompute everything from the live <input> values on screen rather than
  // the store (the write is debounced) or rendered $-text (already rounded
  // and compacted, e.g. "$1.2M", which can't be parsed back to a number).
  const row = root.querySelector(`tr[data-project="${cssEscape(code)}"]`);
  if (row) {
    let total = 0;
    row.querySelectorAll("input.cell-input").forEach((inp) => { total += Number(inp.value) || 0; });
    const totalCell = row.querySelector(".row-total-value");
    if (totalCell) totalCell.textContent = "$" + fmtMoney(total, { compact: true });
  }

  const nPeriods = periodCols().length;
  const grandPeriodSums = Array(nPeriods).fill(0);
  let grandTotal = 0;

  root.querySelectorAll("tr[data-category]").forEach((catRow) => {
    const catId = catRow.getAttribute("data-category");
    const memberRows = root.querySelectorAll(`tr[data-category-member="${cssEscape(catId)}"]`);
    const periodSums = Array(nPeriods).fill(0);
    let catTotal = 0;
    memberRows.forEach((r) => {
      r.querySelectorAll("input.cell-input").forEach((inp) => {
        const p = Number(inp.dataset.period);
        const v = Number(inp.value) || 0;
        periodSums[p] += v; catTotal += v;
      });
    });
    periodSums.forEach((v, i) => {
      const cell = catRow.querySelector(`[data-period-total="${i}"]`);
      if (cell) cell.textContent = "$" + fmtMoney(v, { compact: true });
      grandPeriodSums[i] += v;
    });
    const catTotalCell = catRow.querySelector("[data-cat-total-value]");
    if (catTotalCell) catTotalCell.textContent = "$" + fmtMoney(catTotal, { compact: true });
    grandTotal += catTotal;
  });

  const grandRow = root.querySelector("[data-grand-total]");
  if (grandRow) {
    grandPeriodSums.forEach((v, i) => {
      const cell = grandRow.querySelector(`[data-period-total="${i}"]`);
      if (cell) cell.textContent = "$" + fmtMoney(v, { compact: true });
    });
    const gv = grandRow.querySelector("[data-grand-total-value]");
    if (gv) gv.textContent = "$" + fmtMoney(grandTotal, { compact: true });
  }
}

function cssEscape(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "_"); }

function renderCategoryBlock(cat, s, budgetMap) {
  const projects = s.projects.filter((p) => p.categoryId === cat.id);
  const catTotal = projects.reduce((sum, p) => sum + periodColsTotal(budgetMap, p.code), 0);
  const fy = planFy;
  const canEditCat = Store.canEditCategory(cat.id);
  return `
    <tr class="category-row" data-category="${cat.id}"><td class="label-cell">${cat.name}${canEditCat ? "" : ` <span class="badge-soft">view only</span>`}</td>
      ${periodCols().map((_, i) => `<td class="total-cell" data-period-total="${i}">$${fmtMoney(projects.reduce((s2, p) => s2 + periodValue(budgetMap, p.code, i), 0), { compact: true })}</td>`).join("")}
      <td class="total-cell" data-cat-total-value>$${fmtMoney(catTotal, { compact: true })}</td>
      <td style="text-align:center">${canEditCat ? `<button class="btn btn-sm" data-add-project="${cat.id}" title="Add cost item">+</button>` : ""}</td>
    </tr>
    ${projects.map((p) => {
      const hasNote = s.planNotes.some((n) => n.fiscalYear === fy && n.projectCode === p.code && n.text);
      return `
      <tr data-project="${cssEscape(p.code)}" data-category-member="${cat.id}">
        <td class="sub-label-cell">${p.name} <span class="badge-soft">${p.code}</span></td>
        ${periodCols().map((_, i) => `<td><input class="cell-input" type="number" step="1" min="0" data-code="${p.code}" data-period="${i}" value="${round0(periodValue(budgetMap, p.code, i))}" ${canEditCat ? "" : "disabled"} /></td>`).join("")}
        <td class="total-cell row-total-value">$${fmtMoney(periodColsTotal(budgetMap, p.code), { compact: true })}</td>
        <td style="text-align:center;white-space:nowrap">
          <button class="btn btn-sm ${hasNote ? "btn-has-note" : ""}" data-notes="${p.code}" title="${hasNote ? "View note" : "Add note"}">${icon("note", { size: 13, strokeWidth: 2 })}</button>
          ${canEditCat ? `<button class="btn btn-sm btn-danger" data-del-project="${p.code}" title="Remove cost item">×</button>` : ""}
        </td>
      </tr>
    `;
    }).join("")}
  `;
}

function periodColsTotal(budgetMap, code) {
  let t = 0;
  for (let i = 0; i < periodCols().length; i++) t += periodValue(budgetMap, code, i);
  return t;
}

function grandTotalForPeriod(s, budgetMap, i) {
  return s.projects.reduce((sum, p) => sum + periodValue(budgetMap, p.code, i), 0);
}
function grandTotalAll(s, budgetMap) {
  return s.projects.reduce((sum, p) => sum + periodColsTotal(budgetMap, p.code), 0);
}

function round0(n) { return Math.round(n); }

function addCategoryModal(root) {
  openModal(`
    <h2>Add cost item group</h2>
    <div class="field"><label>Name</label><input type="text" id="new-cat-name" placeholder="e.g. Digital Marketing" /></div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="save-cat">Add cost item group</button></div>
  `, {
    onMount: (modal, close) => {
      modal.querySelector("[data-close]").addEventListener("click", close);
      modal.querySelector("#save-cat").addEventListener("click", async () => {
        const name = modal.querySelector("#new-cat-name").value.trim();
        if (!name) return toast("Enter a name", "err");
        await Store.upsertCategory({ name });
        close(); render(root);
      });
    },
  });
}

function addProjectModal(root, categoryId) {
  openModal(`
    <h2>Add cost item</h2>
    <div class="field"><label>Name</label><input type="text" id="new-proj-name" placeholder="e.g. Radio Sponsorships" /></div>
    <div class="field" style="margin-top:8px"><label>Code (unique)</label><input type="text" id="new-proj-code" placeholder="e.g. RAD-100" /></div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="save-proj">Add cost item</button></div>
  `, {
    onMount: (modal, close) => {
      modal.querySelector("#new-proj-code").value = "";
      modal.querySelector("[data-close]").addEventListener("click", close);
      modal.querySelector("#save-proj").addEventListener("click", async () => {
        const name = modal.querySelector("#new-proj-name").value.trim();
        let code = modal.querySelector("#new-proj-code").value.trim();
        if (!name) return toast("Enter a name", "err");
        if (!code) code = slugify(name).toUpperCase();
        if (Store.state.projects.some((p) => p.code === code)) return toast("That code is already in use", "err");
        await Store.upsertProject({ code, name, categoryId });
        close(); render(root);
      });
    },
  });
}

function notesModal(root, code) {
  const proj = Store.state.projects.find((p) => p.code === code);
  const existing = Store.state.planNotes.find((n) => n.fiscalYear === planFy && n.projectCode === code);
  const canEdit = proj && Store.canEditCategory(proj.categoryId);
  openModal(`
    <h2>Note — ${proj ? proj.name : code} <span class="badge-soft">FY${planFy}</span></h2>
    <p class="hint">Context for this cost item's plan — an assumption, a rationale, a flag for next review. Visible to everyone.</p>
    <div class="field" style="margin-top:8px"><textarea id="note-text" rows="5" style="width:100%;resize:vertical;font:inherit" placeholder="e.g. Includes the Q3 campaign refresh; pending sign-off from brand team." ${canEdit ? "" : "disabled"}>${existing ? escapeHtml(existing.text) : ""}</textarea></div>
    ${canEdit ? "" : `<p class="hint">Only the manager for this cost item group can edit this note.</p>`}
    <div class="modal-actions">
      ${canEdit && existing ? `<button class="btn btn-danger" id="note-delete" style="margin-right:auto">Delete note</button>` : ""}
      <button class="btn" data-close>${canEdit ? "Cancel" : "Close"}</button>
      ${canEdit ? `<button class="btn btn-primary" id="note-save">Save note</button>` : ""}
    </div>
  `, {
    onMount: (modal, close) => {
      modal.querySelector("[data-close]").addEventListener("click", close);
      modal.querySelector("#note-save")?.addEventListener("click", async () => {
        await Store.setPlanNote(planFy, code, modal.querySelector("#note-text").value);
        close(); render(root);
      });
      modal.querySelector("#note-delete")?.addEventListener("click", async () => {
        await Store.setPlanNote(planFy, code, "");
        close(); render(root);
      });
    },
  });
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function copyFromYearModal(root, yearList) {
  const sourceOptions = yearList.filter((y) => y !== planFy);
  openModal(`
    <h2>Copy budget from another year</h2>
    <p class="hint">Copies the monthly split from the source year into FY${planFy} for every cost item, scaled by the growth % below. Existing FY${planFy} amounts will be overwritten.</p>
    <div class="field"><label>Source year</label><select id="copy-source">${sourceOptions.map((y) => `<option value="${y}">FY${y}</option>`).join("")}</select></div>
    <div class="field" style="margin-top:8px"><label>Growth adjustment (%)</label><input type="number" id="copy-growth" value="0" /></div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="copy-run">Copy</button></div>
  `, {
    onMount: (modal, close) => {
      modal.querySelector("[data-close]").addEventListener("click", close);
      modal.querySelector("#copy-run").addEventListener("click", async () => {
        const source = Number(modal.querySelector("#copy-source").value);
        const growth = 1 + (Number(modal.querySelector("#copy-growth").value) || 0) / 100;
        const lines = Store.state.budgetLines.filter((b) => b.fiscalYear === source).map((b) => ({
          id: `${planFy}:${b.projectCode}:${b.month}`, fiscalYear: planFy, projectCode: b.projectCode, month: b.month,
          amount: Math.round(b.amount * growth * 100) / 100,
        }));
        const applied = await Store.bulkSetBudgetLines(lines);
        toast(`Copied ${applied} line(s) from FY${source}${applied < lines.length ? " (some skipped — not your cost item group)" : ""}`, "ok");
        close(); render(root);
      });
    },
  });
}
