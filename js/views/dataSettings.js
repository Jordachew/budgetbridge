import { Store } from "../store.js";
import { toast, openModal, downloadTextFile } from "../ui.js";
import {
  readWorkbook, fileToArrayBuffer, inspectWorkbookForActuals, parseGlExportRows,
  parseActualsWithMapping, REQUIRED_FIELDS, inspectWorkbookForBudgetTemplate,
  parseBudgetTemplateSheet, buildWorkbook, downloadWorkbook, parseBudgetBridgeWorkbook,
} from "../parsers.js";
import { db, estimateUsage } from "../db.js";
import { slugify } from "../calc.js";

let tab = "import";

export function render(root) {
  root.innerHTML = `
    <div class="view-head">
      <h1>Data &amp; Settings</h1>
      <p class="lead">Bring in your actuals export, manage the project/category list, and control how this tool's data is stored and shared.</p>
    </div>
    <div class="tabbar">
      <button data-tab="import" class="${tab === "import" ? "active" : ""}">Import actuals</button>
      <button data-tab="workbook" class="${tab === "workbook" ? "active" : ""}">Share workbook</button>
      <button data-tab="structure" class="${tab === "structure" ? "active" : ""}">Categories &amp; projects</button>
      <button data-tab="storage" class="${tab === "storage" ? "active" : ""}">Storage &amp; danger zone</button>
    </div>
    <div id="tab-body"></div>
  `;
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.getAttribute("data-tab"); render(root); }));
  const body = root.querySelector("#tab-body");
  if (tab === "import") renderImport(body, root);
  else if (tab === "workbook") renderWorkbook(body, root);
  else if (tab === "structure") renderStructure(body, root);
  else renderStorage(body, root);
}

// ---------------------------------------------------------------- import
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
      <p class="hint">Optional: import an existing category / quarter budget grid (a sheet with <code>DESCRIPTION</code>, <code>Q1</code>–<code>Q4</code> columns) to seed the Planning view instead of typing it in from scratch.</p>
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
    const id = b.getAttribute("data-remove-batch");
    await db.deleteByIndex("transactions", "byBatch", id);
    await db.delete("importBatches", id);
    await Store.loadAll();
    render(document.getElementById("view-root"));
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
    const bbWorkbook = parseBudgetBridgeWorkbook(wb);
    if (bbWorkbook) {
      openModal(`<h2>This looks like a BudgetBridge workbook</h2><p>Use <b>Share workbook → Import workbook</b> instead so categories, projects and budget lines come in correctly.</p><div class="modal-actions"><button class="btn btn-primary" data-close>OK</button></div>`, {
        onMount: (m, close) => m.querySelector("[data-close]").addEventListener("click", close),
      });
      return;
    }
    const found = inspectWorkbookForActuals(wb);
    if (!found) return toast("Couldn't find a data table in that file", "err");
    if (found.autoFormat === "gl-export") {
      const rows = parseGlExportRows(found.header, found.rows);
      if (!rows.length) return toast("No non-zero transaction rows found", "err");
      await Store.importTransactions(rows, { filename: file.name, type: "gl-export" });
      toast(`Imported ${rows.length.toLocaleString()} transaction line(s) from ${file.name}`, "ok");
      render(document.getElementById("view-root"));
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
    project: guessColumn(found.header, ["project", "cost element", "code", "ci"]),
    amount: guessColumn(found.header, ["amount", "net", "actual", "spend"]),
    date: guessColumn(found.header, ["date", "period"]),
    type: guessColumn(found.header, ["type", "balance type"]),
    vendor: guessColumn(found.header, ["vendor", "payee", "supplier"]),
    description: guessColumn(found.header, ["desc", "memo", "narrative"]),
    docNo: guessColumn(found.header, ["doc", "invoice", "reference"]),
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
        if (!mapping.project || !mapping.amount || !mapping.date) return toast("Project, amount and date are required", "err");
        const rows = parseActualsWithMapping(found.header, found.rows, mapping);
        if (!rows.length) return toast("No usable rows found with that mapping", "err");
        await Store.importTransactions(rows, { filename: file.name, type: "mapped" });
        toast(`Imported ${rows.length.toLocaleString()} transaction line(s)`, "ok");
        close();
        render(document.getElementById("view-root"));
      });
    },
  });
}

async function handleTemplateFile(body, file) {
  try {
    const wb = await readAnyWorkbook(file);
    const sheets = inspectWorkbookForBudgetTemplate(wb);
    if (!sheets.length) return toast("Couldn't find a category/quarter grid in that file", "err");
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
          let catCount = 0, projCount = 0, lineCount = 0;
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
                qmap[qi].forEach((m) => lines.push({ id: `${fy}:${code}:${m + 1}`, fiscalYear: fy, projectCode: code, month: m + 1, amount: perMonth, notes: "" }));
              });
            }
          }
          lineCount = lines.length;
          await Store.bulkSetBudgetLines(lines);
          toast(`Imported ${catCount} categor${catCount === 1 ? "y" : "ies"}, ${projCount} projects, FY${fy}`, "ok");
          close();
          render(document.getElementById("view-root"));
        });
      },
    });
  } catch (err) {
    console.error(err);
    toast("Couldn't read that file: " + err.message, "err");
  }
}

// ---------------------------------------------------------------- workbook share
function renderWorkbook(body) {
  const s = Store.state;
  body.innerHTML = `
    <div class="grid two-col">
      <div class="card">
        <h3>Export workbook</h3>
        <p class="hint">Creates a single .xlsx with your categories, projects and budget plan (and, optionally, every transaction). Save it into a shared Google Drive / OneDrive / SharePoint folder so teammates can pick up your latest numbers with <b>Import workbook</b> below.</p>
        <label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="inc-tx" /> Include full transaction detail <span class="hint">(bigger file; needed for others to see drill-down detail)</span></label>
        <button class="btn btn-primary" id="export-wb">Export workbook (.xlsx)</button>
      </div>
      <div class="card">
        <h3>Import workbook</h3>
        <p class="hint">Loads a BudgetBridge workbook — your own export, or a teammate's — replacing what's in this browser. Use this each time you open the tool to pick up the latest shared version.</p>
        <div class="dropzone" id="dz-wb">Drop a BudgetBridge workbook here, or click to choose one</div>
        <input type="file" id="file-wb" accept=".xlsx" style="display:none" />
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>How teams share this</h3>
      <p class="hint">Everything in BudgetBridge lives only in this browser (no server, no login). For a team, the shared <b>.xlsx</b> on your drive is the source of truth — one person exports after editing the plan, everyone else imports to view the latest numbers. It's the same model as a shared Excel workbook: simple and works anywhere, but not real-time — two people editing the plan at the same moment can overwrite each other, so it works best with one budget owner per cycle. See the README for the full explanation and the upgrade path to a live-shared backend if you outgrow this.</p>
    </div>
  `;
  body.querySelector("#export-wb").addEventListener("click", () => {
    const includeTx = body.querySelector("#inc-tx").checked;
    const wb = buildWorkbook({ categories: s.categories, projects: s.projects, budgetLines: s.budgetLines, transactions: s.transactions, meta: { exportedAt: new Date().toISOString(), fiscalYear: s.fiscalYear } }, includeTx);
    downloadWorkbook(wb, `budgetbridge-workbook-FY${s.fiscalYear}.xlsx`);
    toast("Workbook downloaded", "ok");
  });
  wireDropzone(body.querySelector("#dz-wb"), body.querySelector("#file-wb"), async (file) => {
    try {
      const wb = await readAnyWorkbook(file);
      const parsed = parseBudgetBridgeWorkbook(wb);
      if (!parsed) return toast("That doesn't look like a BudgetBridge workbook", "err");
      if (!confirm("This replaces everything currently in this browser with the workbook's contents. Continue?")) return;
      await Store.importWorkbookData(parsed);
      toast("Workbook imported", "ok");
      render(document.getElementById("view-root"));
    } catch (err) {
      console.error(err);
      toast("Couldn't read that workbook: " + err.message, "err");
    }
  });
}

// ---------------------------------------------------------------- structure
function renderStructure(body) {
  const s = Store.state;
  body.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="field-row" style="justify-content:space-between">
        <h3 style="margin:0">Categories</h3>
        <button class="btn btn-sm" id="add-cat">+ Add category</button>
      </div>
      <div class="table-scroll" style="margin-top:10px"><table class="data-table">
        <thead><tr><th>Name</th><th># Projects</th><th></th></tr></thead>
        <tbody>${s.categories.map((c) => `<tr>
          <td><input type="text" value="${escapeHtml(c.name)}" data-rename-cat="${c.id}" /></td>
          <td class="num">${s.projects.filter((p) => p.categoryId === c.id).length}</td>
          <td><button class="btn btn-sm btn-danger" data-del-cat="${c.id}">Delete</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
    <div class="card">
      <h3>Projects</h3>
      <div class="table-scroll" style="margin-top:10px"><table class="data-table">
        <thead><tr><th>Name</th><th>Code</th><th>Category</th><th></th></tr></thead>
        <tbody>${s.projects.map((p) => `<tr>
          <td><input type="text" value="${escapeHtml(p.name)}" data-rename-proj="${p.code}" /></td>
          <td class="badge-soft">${p.code}</td>
          <td><select data-recat="${p.code}">${s.categories.map((c) => `<option value="${c.id}" ${c.id === p.categoryId ? "selected" : ""}>${c.name}</option>`).join("")}</select></td>
          <td><button class="btn btn-sm btn-danger" data-del-proj="${p.code}">Delete</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  `;
  body.querySelector("#add-cat").addEventListener("click", () => {
    const name = prompt("Category name?");
    if (name && name.trim()) Store.upsertCategory({ name: name.trim() }).then(() => render(document.getElementById("view-root")));
  });
  body.querySelectorAll("[data-rename-cat]").forEach((inp) => inp.addEventListener("change", async () => {
    await Store.upsertCategory({ id: inp.dataset.renameCat, name: inp.value.trim() });
    toast("Saved", "ok");
  }));
  body.querySelectorAll("[data-del-cat]").forEach((b) => b.addEventListener("click", async () => {
    try { await Store.deleteCategory(b.dataset.delCat); render(document.getElementById("view-root")); }
    catch (e) { toast(e.message, "err"); }
  }));
  body.querySelectorAll("[data-rename-proj]").forEach((inp) => inp.addEventListener("change", async () => {
    const proj = Store.state.projects.find((p) => p.code === inp.dataset.renameProj);
    await Store.upsertProject({ ...proj, name: inp.value.trim() });
    toast("Saved", "ok");
  }));
  body.querySelectorAll("[data-recat]").forEach((sel) => sel.addEventListener("change", async () => {
    const proj = Store.state.projects.find((p) => p.code === sel.dataset.recat);
    await Store.upsertProject({ ...proj, categoryId: sel.value });
    toast("Saved", "ok");
  }));
  body.querySelectorAll("[data-del-proj]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Delete this project and its budget lines?")) return;
    await Store.deleteProject(b.dataset.delProj);
    render(document.getElementById("view-root"));
  }));
}

// ---------------------------------------------------------------- storage / danger zone
async function renderStorage(body) {
  const s = Store.state;
  const usage = await estimateUsage();
  body.innerHTML = `
    <div class="grid two-col">
      <div class="card">
        <h3>What's in this browser right now</h3>
        <table class="data-table" style="margin-top:8px">
          <tbody>
            <tr><td>Categories</td><td class="num">${s.categories.length}</td></tr>
            <tr><td>Projects</td><td class="num">${s.projects.length}</td></tr>
            <tr><td>Budget line entries</td><td class="num">${s.budgetLines.length}</td></tr>
            <tr><td>Transaction lines</td><td class="num">${s.transactions.length.toLocaleString()}</td></tr>
            <tr><td>Data source</td><td>${s.usingDemoData ? '<span class="badge-soft">Sample data</span>' : '<span class="badge-soft">Your imported data</span>'}</td></tr>
            ${usage ? `<tr><td>Estimated browser storage used</td><td class="num">${formatBytes(usage.usage || 0)}</td></tr>` : ""}
          </tbody>
        </table>
        <p class="hint" style="margin-top:10px">All of this lives in this browser's local database (IndexedDB) — it isn't sent anywhere. Clearing your browser's site data for this page, or using a different browser/device, starts empty. Export a workbook regularly if you want a backup outside the browser.</p>
      </div>
      <div class="card">
        <h3>Danger zone</h3>
        <div class="stack">
          <div>
            <button class="btn" id="load-demo">Load sample data</button>
            <p class="hint">Replaces everything currently loaded with a fabricated demo dataset — a fast way to explore the tool.</p>
          </div>
          <div>
            <button class="btn btn-danger" id="clear-tx">Clear transactions only</button>
            <p class="hint">Removes imported actuals/encumbrances but keeps your categories, projects and budget plan.</p>
          </div>
          <div>
            <button class="btn btn-danger" id="wipe-all">Erase everything</button>
            <p class="hint">Deletes all categories, projects, budget lines and transactions from this browser. Cannot be undone — export a workbook first if you want a copy.</p>
          </div>
        </div>
      </div>
    </div>
  `;
  body.querySelector("#load-demo").addEventListener("click", async () => {
    if (s.categories.length && !confirm("Replace current data with sample data?")) return;
    await Store.loadDemoData();
    toast("Sample data loaded", "ok");
    render(document.getElementById("view-root"));
  });
  body.querySelector("#clear-tx").addEventListener("click", async () => {
    if (!confirm("Remove all imported transactions?")) return;
    await Store.clearTransactions();
    toast("Transactions cleared", "ok");
    render(document.getElementById("view-root"));
  });
  body.querySelector("#wipe-all").addEventListener("click", async () => {
    if (!confirm("This deletes everything in this browser. This cannot be undone. Continue?")) return;
    await Store.wipeAll();
    toast("All data erased", "ok");
    render(document.getElementById("view-root"));
  });
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
