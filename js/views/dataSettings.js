import { Store } from "../store.js";
import { toast, openModal } from "../ui.js";
import {
  readWorkbook, fileToArrayBuffer, inspectWorkbookForActuals, parseGlExportRows,
  parseActualsWithMapping, REQUIRED_FIELDS, inspectWorkbookForBudgetTemplate,
  parseBudgetTemplateSheet, buildWorkbook, downloadWorkbook, parseBudgetBridgeWorkbook,
} from "../parsers.js";
import { slugify } from "../calc.js";

let tab = null; // resolved to a role-appropriate default on first render

const ADMIN_TABS = [
  { key: "import", label: "Import actuals" },
  { key: "structure", label: "Cost item groups & cost items" },
  { key: "access", label: "Users & access" },
  { key: "backup", label: "Backup" },
  { key: "account", label: "My account" },
];
const MANAGER_TABS = [
  { key: "structure", label: "My cost items" },
  { key: "account", label: "My account" },
];

export function render(root) {
  const s = Store.state;
  const tabs = Store.isAdmin ? ADMIN_TABS : MANAGER_TABS;
  if (!tab || !tabs.some((t) => t.key === tab)) tab = tabs[0].key;

  root.innerHTML = `
    <div class="view-head">
      <h1>Data &amp; Settings</h1>
      <p class="lead">${Store.isAdmin
        ? "Bring in your actuals export, manage the cost item / cost item group list, and control who can edit what."
        : "Manage the cost items in your cost item group(s), and your own account."}</p>
    </div>
    <div class="tabbar">
      ${tabs.map((t) => `<button data-tab="${t.key}" class="${tab === t.key ? "active" : ""}">${t.label}</button>`).join("")}
    </div>
    <div id="tab-body"></div>
  `;
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.getAttribute("data-tab"); render(root); }));
  const body = root.querySelector("#tab-body");
  if (tab === "import") renderImport(body, root);
  else if (tab === "backup") renderBackup(body, root);
  else if (tab === "structure") renderStructure(body, root);
  else if (tab === "access") renderAccess(body, root);
  else renderAccount(body, root);
}

function rerender() { render(document.getElementById("view-root")); }

// ---------------------------------------------------------------- import (admin)
function renderImport(body) {
  body.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <h3>Actuals / GL export</h3>
      <p class="hint">Drop the export from your ERP or accounting system (.xlsx or .csv). Recognized column headers (like <code>Gl Accounts</code>, <code>Accounted Net</code>, <code>Gl Period</code>) import automatically; anything else opens a quick column-mapping step. Re-importing the same file is safe — matching lines are updated in place, not duplicated.</p>
      <div class="dropzone" id="dz-actuals">Drop a file here, or click to choose one<br><span class="hint">.xlsx or .csv</span></div>
      <input type="file" id="file-actuals" accept=".xlsx,.xls,.csv" style="display:none" />
    </div>
    <div class="card" style="margin-bottom:16px">
      <h3>Budget planning template</h3>
      <p class="hint">Optional: import an existing cost item group / quarter budget grid (a sheet with <code>DESCRIPTION</code>, <code>Q1</code>–<code>Q4</code> columns) to seed the Planning view instead of typing it in from scratch.</p>
      <div class="dropzone" id="dz-template">Drop a budget template here, or click to choose one<br><span class="hint">.xlsx</span></div>
      <input type="file" id="file-template" accept=".xlsx,.xls" style="display:none" />
    </div>
    <div class="card">
      <h3>Import history</h3>
      ${renderBatchTable()}
    </div>
  `;
  wireDropzone(body.querySelector("#dz-actuals"), body.querySelector("#file-actuals"), (file) => handleActualsFile(body, file));
  wireDropzone(body.querySelector("#dz-template"), body.querySelector("#file-template"), (file) => handleTemplateFile(body, file));
  body.querySelectorAll("[data-remove-batch]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Remove all transactions from this import batch?")) return;
    await Store.deleteBatch(b.getAttribute("data-remove-batch"));
    rerender();
  }));
}

function renderBatchTable() {
  const batches = Store.state.importBatches;
  if (!batches.length) return `<p class="hint">No imports yet.</p>`;
  return `<div class="table-scroll"><table class="data-table">
    <thead><tr><th>Date</th><th>File</th><th>Rows</th><th></th></tr></thead>
    <tbody>${batches.slice().reverse().map((b) => `<tr>
      <td>${new Date(b.date).toLocaleString()}</td><td>${b.filename || "—"}</td><td class="num">${b.rowCount}</td>
      <td><button class="btn btn-sm btn-danger" data-remove-batch="${b.id}">Remove</button></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function wireDropzone(zone, input, onFile) {
  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => { if (input.files[0]) onFile(input.files[0]); });
  ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("drag"); }));
  zone.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) onFile(f); });
}

async function readAnyWorkbook(file) {
  const buf = await fileToArrayBuffer(file);
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = new TextDecoder().decode(buf);
    return window.XLSX.read(text, { type: "string" });
  }
  return readWorkbook(buf);
}

async function handleActualsFile(body, file) {
  try {
    const wb = await readAnyWorkbook(file);
    const found = inspectWorkbookForActuals(wb);
    if (!found) return toast("Couldn't find a data table in that file", "err");
    if (found.autoFormat === "gl-export") {
      const rows = parseGlExportRows(found.header, found.rows);
      if (!rows.length) return toast("No non-zero transaction rows found", "err");
      await Store.importTransactions(rows, { filename: file.name, type: "gl-export" });
      toast(`Imported ${rows.length.toLocaleString()} transaction line(s) from ${file.name}`, "ok");
      rerender();
    } else {
      openMappingModal(found, file);
    }
  } catch (err) {
    console.error(err);
    toast("Couldn't read that file: " + err.message, "err");
  }
}

function guessColumn(header, keywords) {
  const lower = header.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h.includes(kw));
    if (idx >= 0) return header[idx];
  }
  return "";
}

function openMappingModal(found, file) {
  const guesses = {
    project: guessColumn(found.header, ["cost item", "project", "cost element", "code", "ci"]),
    amount: guessColumn(found.header, ["amount", "net", "actual", "spend"]),
    date: guessColumn(found.header, ["date", "period"]),
    type: guessColumn(found.header, ["type", "balance type"]),
    vendor: guessColumn(found.header, ["vendor", "payee", "supplier"]),
    description: guessColumn(found.header, ["desc", "memo", "narrative"]),
    docNo: guessColumn(found.header, ["doc no", "invoice no", "invoice number", "reference", "doc #"]),
    docType: guessColumn(found.header, ["doc type", "document type", "sub doc type", "transaction type"]),
    category: guessColumn(found.header, ["ferc", "natural account", "expense category"]),
  };
  const optionsHtml = (selected) => `<option value="">—</option>` + found.header.filter(Boolean).map((h) => `<option value="${h}" ${h === selected ? "selected" : ""}>${h}</option>`).join("");
  openModal(`
    <h2>Match your columns</h2>
    <p class="hint">Sheet "<b>${found.sheetName}</b>" — match each field to a column from your file.</p>
    <div class="stack" style="gap:10px;margin-top:10px">
      ${REQUIRED_FIELDS.map((f) => `
        <div class="field-row" style="justify-content:space-between">
          <label style="min-width:220px">${f.label}${f.required ? " *" : ""}</label>
          <select data-map="${f.key}" style="flex:1">${optionsHtml(guesses[f.key])}</select>
        </div>`).join("")}
    </div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="do-import">Import</button></div>
  `, {
    onMount: (modal, close) => {
      modal.querySelector("[data-close]").addEventListener("click", close);
      modal.querySelector("#do-import").addEventListener("click", async () => {
        const mapping = {};
        modal.querySelectorAll("[data-map]").forEach((sel) => { mapping[sel.dataset.map] = sel.value || null; });
        if (!mapping.project || !mapping.amount || !mapping.date) return toast("Cost item, amount and date are required", "err");
        const rows = parseActualsWithMapping(found.header, found.rows, mapping);
        if (!rows.length) return toast("No usable rows found with that mapping", "err");
        await Store.importTransactions(rows, { filename: file.name, type: "mapped" });
        toast(`Imported ${rows.length.toLocaleString()} transaction line(s)`, "ok");
        close();
        rerender();
      });
    },
  });
}

async function handleTemplateFile(body, file) {
  try {
    const wb = await readAnyWorkbook(file);
    const sheets = inspectWorkbookForBudgetTemplate(wb);
    if (!sheets.length) return toast("Couldn't find a cost item group/quarter grid in that file", "err");
    openModal(`
      <h2>Import budget template</h2>
      <p class="hint">Found ${sheets.length} matching sheet(s). Choose a fiscal year to import into.</p>
      <div class="field"><label>Sheet(s) to import</label>
        ${sheets.map((s, i) => `<div><label><input type="checkbox" value="${i}" checked /> ${s.sheetName}</label></div>`).join("")}
      </div>
      <div class="field" style="margin-top:10px"><label>Fiscal year</label><input type="number" id="tmpl-fy" value="${Store.state.fiscalYear}" /></div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="do-template-import">Import</button></div>
    `, {
      onMount: (modal, close) => {
        modal.querySelector("[data-close]").addEventListener("click", close);
        modal.querySelector("#do-template-import").addEventListener("click", async () => {
          const fy = Number(modal.querySelector("#tmpl-fy").value) || Store.state.fiscalYear;
          const checked = [...modal.querySelectorAll('input[type="checkbox"]:checked')].map((c) => Number(c.value));
          let catCount = 0, projCount = 0;
          const lines = [];
          for (const si of checked) {
            const sheet = sheets[si];
            const cats = parseBudgetTemplateSheet(sheet.rawHeader, sheet.rows);
            const catId = slugify(sheet.sheetName);
            await Store.upsertCategory({ id: catId, name: sheet.sheetName });
            catCount++;
            for (const cat of cats) {
              const code = slugify(cat.name).toUpperCase().slice(0, 24);
              await Store.upsertProject({ code, name: cat.name, categoryId: catId });
              projCount++;
              const qmap = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
              ["q1", "q2", "q3", "q4"].forEach((q, qi) => {
                const perMonth = Math.round(((cat[q] || 0) / 3) * 100) / 100;
                qmap[qi].forEach((m) => lines.push({ id: `${fy}:${code}:${m + 1}`, fiscalYear: fy, projectCode: code, month: m + 1, amount: perMonth }));
              });
            }
          }
          await Store.bulkSetBudgetLines(lines);
          toast(`Imported ${catCount} cost item group${catCount === 1 ? "" : "s"}, ${projCount} cost item${projCount === 1 ? "" : "s"}, FY${fy}`, "ok");
          close();
          rerender();
        });
      },
    });
  } catch (err) {
    console.error(err);
    toast("Couldn't read that file: " + err.message, "err");
  }
}

// ---------------------------------------------------------------- backup (admin) — download only + danger zone
function renderBackup(body) {
  const s = Store.state;
  body.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <h3>Download a backup</h3>
      <p class="hint">This server's shared database (<code>data/budgetbridge.db</code>) is already the one copy everyone works from — there's nothing to "sync" here. This button is just an offline snapshot: a single .xlsx of the current cost item groups, cost items, budget plan and notes (optionally every transaction), useful for a point-in-time backup, an audit trail, or sharing a read-only copy with someone who doesn't use BudgetBridge.</p>
      <label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="inc-tx" /> Include full transaction detail <span class="hint">(bigger file)</span></label>
      <button class="btn btn-primary" id="export-wb">Download backup (.xlsx)</button>
    </div>
    <div class="card">
      <h3>Danger zone</h3>
      <div class="stack">
        <div>
          <button class="btn btn-danger" id="clear-tx">Clear transactions only</button>
          <p class="hint">Removes imported actuals/encumbrances for everyone but keeps cost item groups, cost items and the budget plan.</p>
        </div>
        <div>
          <button class="btn btn-danger" id="wipe-all">Erase everything</button>
          <p class="hint">Deletes all cost item groups, cost items, budget lines, notes and transactions for the whole team. Cannot be undone — download a backup first. (People's accounts are not affected.)</p>
        </div>
      </div>
    </div>
  `;
  body.querySelector("#export-wb").addEventListener("click", () => {
    const includeTx = body.querySelector("#inc-tx").checked;
    const wb = buildWorkbook({ categories: s.categories, projects: s.projects, budgetLines: s.budgetLines, transactions: s.transactions, planNotes: s.planNotes, meta: { exportedAt: new Date().toISOString(), fiscalYear: s.fiscalYear } }, includeTx);
    downloadWorkbook(wb, `budgetbridge-backup-FY${s.fiscalYear}.xlsx`);
    toast("Backup downloaded", "ok");
  });
  body.querySelector("#clear-tx").addEventListener("click", async () => {
    if (!confirm("Remove all imported transactions for everyone?")) return;
    await Store.clearTransactions();
    toast("Transactions cleared", "ok");
    rerender();
  });
  body.querySelector("#wipe-all").addEventListener("click", async () => {
    if (!confirm("This deletes everything for the whole team. This cannot be undone. Continue?")) return;
    await Store.wipeAll();
    toast("All data erased", "ok");
    rerender();
  });
}

// ---------------------------------------------------------------- structure (cost item groups & cost items)
function renderStructure(body) {
  const s = Store.state;
  const admin = Store.isAdmin;
  const myCategoryIds = new Set(admin ? s.categories.map((c) => c.id) : s.me.assignedCategoryIds);
  const visibleCategories = admin ? s.categories : s.categories.filter((c) => myCategoryIds.has(c.id));

  body.innerHTML = `
    ${admin ? `
    <div class="card" style="margin-bottom:16px">
      <div class="field-row" style="justify-content:space-between">
        <h3 style="margin:0">Cost item groups</h3>
        <button class="btn btn-sm" id="add-cat">+ Add cost item group</button>
      </div>
      <div class="table-scroll" style="margin-top:10px"><table class="data-table">
        <thead><tr><th>Name</th><th># Cost items</th><th></th></tr></thead>
        <tbody>${s.categories.map((c) => `<tr>
          <td><input type="text" value="${escapeHtml(c.name)}" data-rename-cat="${c.id}" /></td>
          <td class="num">${s.projects.filter((p) => p.categoryId === c.id).length}</td>
          <td><button class="btn btn-sm btn-danger" data-del-cat="${c.id}">Delete</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>` : `
    <div class="card" style="margin-bottom:16px">
      <p class="hint">You manage: <b>${[...myCategoryIds].map((id) => s.categories.find((c) => c.id === id)?.name).filter(Boolean).join(", ") || "no cost item groups yet — ask an admin to assign you one"}</b>. You can add, rename or remove cost items within those groups below. Everyone can see the whole rollup on the Dashboard and Budget vs. Actual — you just can't edit outside your own group(s).</p>
    </div>`}
    <div class="card">
      <div class="field-row" style="justify-content:space-between">
        <h3 style="margin:0">Cost items</h3>
        ${!admin && visibleCategories.length ? `<button class="btn btn-sm" id="add-proj-mgr">+ Add cost item</button>` : ""}
      </div>
      <div class="table-scroll" style="margin-top:10px"><table class="data-table">
        <thead><tr><th>Name</th><th>Code</th><th>Cost item group</th><th></th></tr></thead>
        <tbody>${s.projects.map((p) => {
          const canEdit = Store.canEditCategory(p.categoryId);
          return `<tr>
          <td><input type="text" value="${escapeHtml(p.name)}" data-rename-proj="${p.code}" ${canEdit ? "" : "disabled title=\"Managed by another user\""} /></td>
          <td class="badge-soft">${p.code}</td>
          <td>${admin
            ? `<select data-recat="${p.code}">${s.categories.map((c) => `<option value="${c.id}" ${c.id === p.categoryId ? "selected" : ""}>${c.name}</option>`).join("")}</select>`
            : escapeHtml(s.categories.find((c) => c.id === p.categoryId)?.name || "—")}</td>
          <td>${canEdit ? `<button class="btn btn-sm btn-danger" data-del-proj="${p.code}">Delete</button>` : ""}</td>
        </tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>
  `;
  body.querySelector("#add-cat")?.addEventListener("click", () => addCategoryModal());
  body.querySelector("#add-proj-mgr")?.addEventListener("click", () => addProjectPrompt(visibleCategories));
  body.querySelectorAll("[data-rename-cat]").forEach((inp) => inp.addEventListener("change", async () => {
    await Store.renameCategory(inp.dataset.renameCat, inp.value.trim());
    toast("Saved", "ok");
  }));
  body.querySelectorAll("[data-del-cat]").forEach((b) => b.addEventListener("click", async () => {
    try { await Store.deleteCategory(b.dataset.delCat); rerender(); }
    catch (e) { toast(e.message, "err"); }
  }));
  body.querySelectorAll("[data-rename-proj]").forEach((inp) => inp.addEventListener("change", async () => {
    try { await Store.updateProject(inp.dataset.renameProj, { name: inp.value.trim() }); toast("Saved", "ok"); }
    catch (e) { toast(e.message, "err"); }
  }));
  body.querySelectorAll("[data-recat]").forEach((sel) => sel.addEventListener("change", async () => {
    try { await Store.updateProject(sel.dataset.recat, { categoryId: sel.value }); toast("Saved", "ok"); }
    catch (e) { toast(e.message, "err"); }
  }));
  body.querySelectorAll("[data-del-proj]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Delete this cost item and its budget lines?")) return;
    try { await Store.deleteProject(b.dataset.delProj); rerender(); }
    catch (e) { toast(e.message, "err"); }
  }));
}

function addCategoryModal() {
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
        close(); rerender();
      });
    },
  });
}

function addProjectPrompt(categories) {
  const catOptions = categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  openModal(`
    <h2>Add cost item</h2>
    <div class="field"><label>Name</label><input type="text" id="new-proj-name" placeholder="e.g. Radio Sponsorships" /></div>
    <div class="field" style="margin-top:8px"><label>Code (unique)</label><input type="text" id="new-proj-code" placeholder="e.g. RAD-100" /></div>
    ${categories.length > 1 ? `<div class="field" style="margin-top:8px"><label>Cost item group</label><select id="new-proj-cat">${catOptions}</select></div>` : ""}
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="save-proj">Add cost item</button></div>
  `, {
    onMount: (modal, close) => {
      modal.querySelector("[data-close]").addEventListener("click", close);
      modal.querySelector("#save-proj").addEventListener("click", async () => {
        const name = modal.querySelector("#new-proj-name").value.trim();
        let code = modal.querySelector("#new-proj-code").value.trim();
        const categoryId = categories.length > 1 ? modal.querySelector("#new-proj-cat").value : categories[0].id;
        if (!name) return toast("Enter a name", "err");
        if (!code) code = slugify(name).toUpperCase();
        if (Store.state.projects.some((p) => p.code === code)) return toast("That code is already in use", "err");
        try { await Store.upsertProject({ code, name, categoryId }); close(); rerender(); }
        catch (e) { toast(e.message, "err"); }
      });
    },
  });
}

// ---------------------------------------------------------------- users & access (admin)
async function renderAccess(body) {
  body.innerHTML = `<p class="hint">Loading…</p>`;
  const users = await Store.loadUsers();
  const cats = Store.state.categories;
  body.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="field-row" style="justify-content:space-between">
        <h3 style="margin:0">People</h3>
        <button class="btn btn-sm" id="add-user">+ Add person</button>
      </div>
      <p class="hint">An <b>admin</b> can edit anything and manage people. A <b>manager</b> can only edit the cost item group(s) assigned to them below, but can see the full consolidated rollup like everyone else.</p>
      <div class="table-scroll" style="margin-top:10px"><table class="data-table">
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Manages</th><th>Active</th><th></th></tr></thead>
        <tbody>${users.map((u) => `<tr>
          <td>${escapeHtml(u.name)}</td>
          <td class="badge-soft">${escapeHtml(u.username)}</td>
          <td><select data-role="${u.id}" ${u.id === Store.state.me.id ? "disabled title=\"You can't change your own role\"" : ""}>
            <option value="manager" ${u.role === "manager" ? "selected" : ""}>Manager</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
          </select></td>
          <td>${u.role === "admin" ? `<span class="hint">everything</span>` : `<button class="btn btn-sm" data-assign="${u.id}">${u.assignedCategoryIds.length ? `${u.assignedCategoryIds.length} group(s)` : "None — assign"}</button>`}</td>
          <td><input type="checkbox" data-active="${u.id}" ${u.active ? "checked" : ""} ${u.id === Store.state.me.id ? "disabled" : ""} /></td>
          <td><button class="btn btn-sm" data-reset="${u.id}">Reset password</button>${u.id === Store.state.me.id ? "" : ` <button class="btn btn-sm btn-danger" data-del-user="${u.id}">Delete</button>`}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  `;
  body.querySelector("#add-user").addEventListener("click", () => addUserModal());
  body.querySelectorAll("[data-role]").forEach((sel) => sel.addEventListener("change", async () => {
    await Store.updateUser(sel.dataset.role, { role: sel.value });
    toast("Saved", "ok"); rerender();
  }));
  body.querySelectorAll("[data-active]").forEach((cb) => cb.addEventListener("change", async () => {
    await Store.updateUser(cb.dataset.active, { active: cb.checked });
    toast(cb.checked ? "Account re-enabled" : "Account disabled", "ok");
  }));
  body.querySelectorAll("[data-assign]").forEach((b) => b.addEventListener("click", () => assignmentsModal(b.dataset.assign, users, cats)));
  body.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => resetPasswordModal(b.dataset.reset, users)));
  body.querySelectorAll("[data-del-user]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Delete this person's account? They will no longer be able to sign in.")) return;
    await Store.deleteUser(b.dataset.delUser);
    rerender();
  }));
}

function addUserModal() {
  openModal(`
    <h2>Add a person</h2>
    <div class="field"><label>Full name</label><input type="text" id="u-name" placeholder="e.g. Kim Brown" /></div>
    <div class="field" style="margin-top:8px"><label>Username</label><input type="text" id="u-username" placeholder="e.g. kbrown" /></div>
    <div class="field" style="margin-top:8px"><label>Temporary password</label><input type="text" id="u-password" placeholder="At least 6 characters" /></div>
    <div class="field" style="margin-top:8px"><label>Role</label><select id="u-role"><option value="manager">Manager</option><option value="admin">Admin</option></select></div>
    <p class="hint" style="margin-top:8px">Give this password to them directly — they can change it themselves under My Account after signing in.</p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="save-user">Add person</button></div>
  `, {
    onMount: (modal, close) => {
      modal.querySelector("[data-close]").addEventListener("click", close);
      modal.querySelector("#save-user").addEventListener("click", async () => {
        const name = modal.querySelector("#u-name").value.trim();
        const username = modal.querySelector("#u-username").value.trim();
        const password = modal.querySelector("#u-password").value;
        const role = modal.querySelector("#u-role").value;
        if (!name || !username || !password) return toast("Fill in every field", "err");
        try { await Store.createUser({ name, username, password, role }); close(); rerender(); }
        catch (e) { toast(e.message, "err"); }
      });
    },
  });
}

function assignmentsModal(userId, users, categories) {
  const user = users.find((u) => u.id === userId);
  openModal(`
    <h2>Cost item groups for ${escapeHtml(user.name)}</h2>
    <p class="hint">${escapeHtml(user.name)} will be able to edit budget, notes and cost items only in the groups checked below.</p>
    <div class="stack" style="gap:6px;margin-top:10px">
      ${categories.map((c) => `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" value="${c.id}" ${user.assignedCategoryIds.includes(c.id) ? "checked" : ""} /> ${escapeHtml(c.name)}</label>`).join("") || `<p class="hint">No cost item groups exist yet.</p>`}
    </div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="save-assign">Save</button></div>
  `, {
    onMount: (modal, close) => {
      modal.querySelector("[data-close]").addEventListener("click", close);
      modal.querySelector("#save-assign").addEventListener("click", async () => {
        const categoryIds = [...modal.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);
        await Store.setUserAssignments(userId, categoryIds);
        toast("Saved", "ok");
        close(); rerender();
      });
    },
  });
}

function resetPasswordModal(userId, users) {
  const user = users.find((u) => u.id === userId);
  openModal(`
    <h2>Reset password for ${escapeHtml(user.name)}</h2>
    <div class="field"><label>New password</label><input type="text" id="new-pw" placeholder="At least 6 characters" /></div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="do-reset">Reset</button></div>
  `, {
    onMount: (modal, close) => {
      modal.querySelector("[data-close]").addEventListener("click", close);
      modal.querySelector("#do-reset").addEventListener("click", async () => {
        const pw = modal.querySelector("#new-pw").value;
        if (pw.length < 6) return toast("Password must be at least 6 characters", "err");
        await Store.updateUser(userId, { password: pw });
        toast("Password reset", "ok");
        close();
      });
    },
  });
}

// ---------------------------------------------------------------- my account (everyone)
function renderAccount(body) {
  const me = Store.state.me;
  body.innerHTML = `
    <div class="card" style="max-width:440px">
      <h3>Signed in as ${escapeHtml(me.name)}</h3>
      <p class="hint">Username <span class="badge-soft">${escapeHtml(me.username)}</span> · Role <span class="badge-soft">${me.role === "admin" ? "Admin" : "Manager"}</span></p>
      <hr class="hr" />
      <h3>Change your password</h3>
      <div class="field"><label>Current password</label><input type="password" id="old-pw" /></div>
      <div class="field" style="margin-top:8px"><label>New password</label><input type="password" id="new-pw" placeholder="At least 6 characters" /></div>
      <button class="btn btn-primary" style="margin-top:12px" id="change-pw">Update password</button>
      <hr class="hr" />
      <button class="btn btn-danger" id="do-logout">Log out</button>
    </div>
  `;
  body.querySelector("#change-pw").addEventListener("click", async () => {
    const oldPassword = body.querySelector("#old-pw").value;
    const newPassword = body.querySelector("#new-pw").value;
    try {
      await Store.changeOwnPassword(oldPassword, newPassword);
      toast("Password updated", "ok");
      body.querySelector("#old-pw").value = ""; body.querySelector("#new-pw").value = "";
    } catch (e) { toast(e.message, "err"); }
  });
  body.querySelector("#do-logout").addEventListener("click", async () => {
    await Store.logout();
  });
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
