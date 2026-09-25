(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // js/db.js
  var DB_NAME = "budgetbridge";
  var DB_VERSION = 2;
  var _db = null;
  function openDb() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db2 = req.result;
        if (!db2.objectStoreNames.contains("meta")) {
          db2.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db2.objectStoreNames.contains("categories")) {
          db2.createObjectStore("categories", { keyPath: "id" });
        }
        if (!db2.objectStoreNames.contains("projects")) {
          db2.createObjectStore("projects", { keyPath: "code" });
        }
        if (!db2.objectStoreNames.contains("budgetLines")) {
          const s = db2.createObjectStore("budgetLines", { keyPath: "id" });
          s.createIndex("byFyProject", ["fiscalYear", "projectCode"], { unique: false });
          s.createIndex("byFy", "fiscalYear", { unique: false });
        }
        if (!db2.objectStoreNames.contains("transactions")) {
          const s = db2.createObjectStore("transactions", { keyPath: "id" });
          s.createIndex("byProject", "project", { unique: false });
          s.createIndex("byYear", "year", { unique: false });
          s.createIndex("byBatch", "batchId", { unique: false });
        }
        if (!db2.objectStoreNames.contains("importBatches")) {
          db2.createObjectStore("importBatches", { keyPath: "id" });
        }
        if (!db2.objectStoreNames.contains("planNotes")) {
          const s = db2.createObjectStore("planNotes", { keyPath: "id" });
          s.createIndex("byFyProject", ["fiscalYear", "projectCode"], { unique: false });
        }
      };
      req.onsuccess = () => {
        _db = req.result;
        resolve(_db);
      };
      req.onerror = () => reject(req.error);
    });
  }
  function tx(storeNames, mode, fn) {
    return openDb().then((db2) => new Promise((resolve, reject) => {
      const t = db2.transaction(storeNames, mode);
      const stores = {};
      for (const n of [].concat(storeNames)) stores[n] = t.objectStore(n);
      let result;
      Promise.resolve(fn(stores, t)).then((r) => {
        result = r;
      }).catch(reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("transaction aborted"));
    }));
  }
  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  var db = {
    async getAll(store) {
      return tx(store, "readonly", (s) => reqToPromise(s[store].getAll()));
    },
    async get(store, key) {
      return tx(store, "readonly", (s) => reqToPromise(s[store].get(key)));
    },
    async put(store, value) {
      return tx(store, "readwrite", (s) => reqToPromise(s[store].put(value)));
    },
    async bulkPut(store, values) {
      return tx(store, "readwrite", (s) => {
        for (const v of values) s[store].put(v);
      });
    },
    async delete(store, key) {
      return tx(store, "readwrite", (s) => reqToPromise(s[store].delete(key)));
    },
    async clear(store) {
      return tx(store, "readwrite", (s) => reqToPromise(s[store].clear()));
    },
    async count(store) {
      return tx(store, "readonly", (s) => reqToPromise(s[store].count()));
    },
    async deleteByIndex(store, indexName, value) {
      return tx(store, "readwrite", (s) => new Promise((resolve, reject) => {
        const idx = s[store].index(indexName);
        const req = idx.openCursor(IDBKeyRange.only(value));
        req.onsuccess = () => {
          const cur = req.result;
          if (cur) {
            cur.delete();
            cur.continue();
          } else resolve();
        };
        req.onerror = () => reject(req.error);
      }));
    },
    async wipeAll() {
      return tx(["meta", "categories", "projects", "budgetLines", "transactions", "importBatches", "planNotes"], "readwrite", (s) => {
        for (const n of Object.keys(s)) s[n].clear();
      });
    }
  };
  async function getMeta(key, fallback = null) {
    const row = await db.get("meta", key);
    return row ? row.value : fallback;
  }
  async function setMeta(key, value) {
    return db.put("meta", { key, value });
  }
  async function estimateUsage() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        return await navigator.storage.estimate();
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // js/calc.js
  var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTH_NAMES_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function fmtMoney(n, { compact = false, currency = "" } = {}) {
    if (n == null || isNaN(n)) return "\u2014";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    if (compact) {
      if (abs >= 1e9) return sign + currency + (abs / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
      if (abs >= 1e6) return sign + currency + (abs / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
      if (abs >= 1e3) return sign + currency + (abs / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
      return sign + currency + abs.toFixed(0);
    }
    return sign + currency + abs.toLocaleString(void 0, { maximumFractionDigits: 0 });
  }
  var DOC_TYPE_MAP = [
    [/^AP_INV_CDTINV/i, "Credit Memo"],
    [/^AP_INV/i, "Invoice"],
    [/^PO_REQ/i, "Requisition"],
    [/^PO_/i, "Purchase Order"],
    [/^GL_JRNL_PAYROLL/i, "Payroll Journal"],
    [/^GL_JRNL/i, "Journal Entry"],
    [/^FA_DEPR/i, "Depreciation"],
    [/^EXP_/i, "Expense Report"]
  ];
  function friendlyDocType(raw) {
    if (!raw) return "Other";
    const hit = DOC_TYPE_MAP.find(([re]) => re.test(raw));
    if (hit) return hit[1];
    if (/inv/i.test(raw)) return "Invoice";
    if (/\bpo\b/i.test(raw)) return "Purchase Order";
    if (/jrnl|journal/i.test(raw)) return "Journal Entry";
    if (/depr/i.test(raw)) return "Depreciation";
    return String(raw).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  function fmtPct(n, digits = 0) {
    if (n == null || isNaN(n)) return "\u2014";
    return (n * 100).toFixed(digits) + "%";
  }
  function aggregateActuals(transactions, fiscalYear) {
    const byProject = /* @__PURE__ */ new Map();
    for (const t of transactions) {
      if (t.year !== fiscalYear) continue;
      if (!byProject.has(t.project)) {
        byProject.set(t.project, {
          actualByMonth: Array(12).fill(0),
          encumbranceByMonth: Array(12).fill(0),
          actual: 0,
          encumbrance: 0
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
  function budgetByProject(budgetLines, fiscalYear) {
    const map = /* @__PURE__ */ new Map();
    for (const b of budgetLines) {
      if (b.fiscalYear !== fiscalYear) continue;
      if (!map.has(b.projectCode)) map.set(b.projectCode, { total: 0, byMonth: Array(12).fill(0) });
      const bucket = map.get(b.projectCode);
      bucket.byMonth[b.month - 1] = (bucket.byMonth[b.month - 1] || 0) + b.amount;
      bucket.total += b.amount;
    }
    return map;
  }
  function statusFromVariance(projectedVariancePct, hasBudget) {
    if (!hasBudget) return "unbudgeted";
    if (projectedVariancePct <= 0.02) return "good";
    if (projectedVariancePct <= 0.1) return "warning";
    if (projectedVariancePct <= 0.25) return "serious";
    return "critical";
  }
  var STATUS_LABEL = {
    good: "On track",
    warning: "Watch",
    serious: "At risk",
    critical: "Over budget",
    unbudgeted: "No budget"
  };
  function computeRunRate(actualByMonth, encumbranceByMonth, budgetTotal, asOfMonth) {
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
      monthsElapsed,
      ytdActual,
      ytdEncumbrance,
      avgMonthly,
      avgMonthlyTrend,
      remainingMonths,
      projectedAnnual,
      projectedAnnualTrend,
      hasBudget,
      projectedVariance,
      projectedVariancePct,
      status,
      paceExpected,
      paceActual
    };
  }
  function buildComparisonRows({ categories, projects, actualsByProject, budgetByProjectMap, asOfMonth }) {
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
          code: p.code,
          name: p.name,
          categoryId: cat.id,
          budget: b.total,
          actual: a.actual,
          encumbrance: a.encumbrance,
          committed,
          balance,
          pctUsed,
          runRate,
          byMonth: { actual: a.actualByMonth, encumbrance: a.encumbranceByMonth, budget: b.byMonth }
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
        id: cat.id,
        name: cat.name,
        isCategory: true,
        budget: catBudget,
        actual: catActual,
        encumbrance: catEnc,
        committed: catCommitted,
        balance: catBudget - catCommitted,
        pctUsed: catBudget > 0 ? catCommitted / catBudget : null,
        runRate: computeRunRate(catByMonthActual, catByMonthEnc, catBudget, asOfMonth),
        byMonth: { actual: catByMonthActual, encumbrance: catByMonthEnc, budget: catByMonthBudget },
        projects: projRows
      });
    }
    return rows;
  }
  function grandTotal(rows) {
    const t = { budget: 0, actual: 0, encumbrance: 0, committed: 0, balance: 0, byMonth: { actual: Array(12).fill(0), encumbrance: Array(12).fill(0), budget: Array(12).fill(0) } };
    for (const r of rows) {
      t.budget += r.budget;
      t.actual += r.actual;
      t.encumbrance += r.encumbrance;
      t.committed += r.committed;
      t.balance += r.balance;
      for (let i = 0; i < 12; i++) {
        t.byMonth.actual[i] += r.byMonth.actual[i] || 0;
        t.byMonth.encumbrance[i] += r.byMonth.encumbrance[i] || 0;
        t.byMonth.budget[i] += r.byMonth.budget[i] || 0;
      }
    }
    return t;
  }
  function slugify(s) {
    return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
  }

  // js/store.js
  function nowIso() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  var StoreImpl = class {
    constructor() {
      this.state = {
        ready: false,
        categories: [],
        projects: [],
        budgetLines: [],
        transactions: [],
        importBatches: [],
        fiscalYear: (/* @__PURE__ */ new Date()).getFullYear(),
        asOfMonth: (/* @__PURE__ */ new Date()).getMonth() + 1,
        theme: "system",
        route: "dashboard",
        drill: { categoryId: null, projectCode: null },
        planNotes: []
      };
      this._listeners = /* @__PURE__ */ new Set();
    }
    subscribe(fn) {
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }
    _notify() {
      for (const fn of this._listeners) fn(this.state);
    }
    setState(patch) {
      Object.assign(this.state, patch);
      this._notify();
    }
    availableFiscalYears() {
      const years = /* @__PURE__ */ new Set();
      for (const b of this.state.budgetLines) years.add(b.fiscalYear);
      for (const t of this.state.transactions) years.add(t.year);
      years.add(this.state.fiscalYear);
      return [...years].sort((a, b) => a - b);
    }
    async loadAll() {
      const [categories, projects, budgetLines, transactions, importBatches, planNotes] = await Promise.all([
        db.getAll("categories"),
        db.getAll("projects"),
        db.getAll("budgetLines"),
        db.getAll("transactions"),
        db.getAll("importBatches"),
        db.getAll("planNotes")
      ]);
      const savedFy = await getMeta("fiscalYear", null);
      const savedAsOf = await getMeta("asOfMonth", null);
      const theme = await getMeta("theme", "system");
      let fiscalYear = savedFy;
      if (!fiscalYear) {
        const years = /* @__PURE__ */ new Set([...budgetLines.map((b) => b.fiscalYear), ...transactions.map((t) => t.year)]);
        fiscalYear = years.size ? Math.max(...years) : (/* @__PURE__ */ new Date()).getFullYear();
      }
      this.setState({
        categories,
        projects,
        budgetLines,
        transactions,
        importBatches,
        planNotes,
        fiscalYear,
        asOfMonth: savedAsOf || (/* @__PURE__ */ new Date()).getMonth() + 1,
        theme,
        ready: true
      });
      this._applyTheme();
    }
    _applyTheme() {
      const t = this.state.theme;
      if (t === "light") document.documentElement.setAttribute("data-theme", "light");
      else if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
      else document.documentElement.removeAttribute("data-theme");
    }
    async setTheme(theme) {
      await setMeta("theme", theme);
      this.setState({ theme });
      this._applyTheme();
    }
    async setFiscalYear(fy) {
      await setMeta("fiscalYear", fy);
      this.setState({ fiscalYear: fy });
    }
    async setAsOfMonth(m) {
      await setMeta("asOfMonth", m);
      this.setState({ asOfMonth: m });
    }
    setRoute(route, drill = {}) {
      this.setState({ route, drill: { ...this.state.drill, ...drill } });
    }
    // ---------- categories ----------
    async upsertCategory(cat) {
      var _a;
      const id = cat.id || slugify(cat.name);
      const record = { id, name: cat.name, sortOrder: (_a = cat.sortOrder) != null ? _a : this.state.categories.length };
      await db.put("categories", record);
      const categories = [...this.state.categories.filter((c) => c.id !== id), record];
      this.setState({ categories });
      return record;
    }
    async deleteCategory(id) {
      const inUse = this.state.projects.some((p) => p.categoryId === id);
      if (inUse) throw new Error("Category still has projects assigned. Reassign them first.");
      await db.delete("categories", id);
      this.setState({ categories: this.state.categories.filter((c) => c.id !== id) });
    }
    // ---------- projects ----------
    async upsertProject(proj) {
      const record = { code: proj.code.trim(), name: proj.name.trim(), categoryId: proj.categoryId, active: proj.active !== false };
      await db.put("projects", record);
      const projects = [...this.state.projects.filter((p) => p.code !== record.code), record];
      this.setState({ projects });
      return record;
    }
    async deleteProject(code) {
      await db.delete("projects", code);
      const budgetLines = this.state.budgetLines.filter((b) => b.projectCode !== code);
      for (const b of this.state.budgetLines.filter((b2) => b2.projectCode === code)) await db.delete("budgetLines", b.id);
      const planNotes = this.state.planNotes.filter((n) => n.projectCode !== code);
      for (const n of this.state.planNotes.filter((n2) => n2.projectCode === code)) await db.delete("planNotes", n.id);
      this.setState({ projects: this.state.projects.filter((p) => p.code !== code), budgetLines, planNotes });
    }
    // ---------- budget lines ----------
    async setBudgetAmount(fiscalYear, projectCode, month, amount) {
      const id = `${fiscalYear}:${projectCode}:${month}`;
      const record = { id, fiscalYear, projectCode, month, amount: Number(amount) || 0, updatedAt: nowIso() };
      await db.put("budgetLines", record);
      const budgetLines = [...this.state.budgetLines.filter((b) => b.id !== id), record];
      this.setState({ budgetLines });
    }
    async bulkSetBudgetLines(lines) {
      await db.bulkPut("budgetLines", lines);
      const byId = new Map(this.state.budgetLines.map((b) => [b.id, b]));
      for (const l of lines) byId.set(l.id, l);
      this.setState({ budgetLines: [...byId.values()] });
    }
    // ---------- transactions / imports ----------
    async importTransactions(rows, meta) {
      const batchId = `batch-${Date.now()}`;
      const withBatch = rows.map((r) => ({ ...r, batchId: r.batchId || batchId }));
      await db.bulkPut("transactions", withBatch);
      const batchRecord = { id: batchId, date: nowIso(), rowCount: withBatch.length, ...meta };
      await db.put("importBatches", batchRecord);
      const byId = new Map(this.state.transactions.map((t) => [t.id, t]));
      for (const t of withBatch) byId.set(t.id, t);
      this.setState({ transactions: [...byId.values()], importBatches: [...this.state.importBatches, batchRecord] });
      return batchRecord;
    }
    async clearTransactions() {
      await db.clear("transactions");
      await db.clear("importBatches");
      this.setState({ transactions: [], importBatches: [] });
    }
    // ---------- plan notes (one per cost item per fiscal year) ----------
    async setPlanNote(fiscalYear, projectCode, text) {
      const id = `${fiscalYear}:${projectCode}`;
      const trimmed = (text || "").trim();
      if (!trimmed) {
        await db.delete("planNotes", id);
        this.setState({ planNotes: this.state.planNotes.filter((n) => n.id !== id) });
        return;
      }
      const record = { id, fiscalYear, projectCode, text: trimmed, updatedAt: nowIso() };
      await db.put("planNotes", record);
      this.setState({ planNotes: [...this.state.planNotes.filter((n) => n.id !== id), record] });
    }
    async wipeAll() {
      await db.wipeAll();
      this.setState({ categories: [], projects: [], budgetLines: [], transactions: [], importBatches: [], planNotes: [] });
    }
    async importWorkbookData(parsed) {
      var _a, _b;
      await db.wipeAll();
      await db.bulkPut("categories", parsed.categories);
      await db.bulkPut("projects", parsed.projects);
      await db.bulkPut("budgetLines", parsed.budgetLines);
      if ((_a = parsed.transactions) == null ? void 0 : _a.length) await db.bulkPut("transactions", parsed.transactions);
      if ((_b = parsed.planNotes) == null ? void 0 : _b.length) await db.bulkPut("planNotes", parsed.planNotes);
      this.setState({
        categories: parsed.categories,
        projects: parsed.projects,
        budgetLines: parsed.budgetLines,
        transactions: parsed.transactions || [],
        planNotes: parsed.planNotes || []
      });
    }
  };
  var Store = new StoreImpl();

  // js/views/dashboard.js
  var dashboard_exports = {};
  __export(dashboard_exports, {
    render: () => render
  });

  // js/icons.js
  var ICONS = {
    dashboard: '<path d="M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-4H4v4Z"/>',
    scale: '<path d="M12 3v18M7 7l-4 8a4 4 0 0 0 8 0l-4-8Zm10 0l-4 8a4 4 0 0 0 8 0l-4-8ZM5 7h14"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8M21 7v6M21 7h-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    chart: '<path d="M4 19V9M10 19V4M16 19v-7M4 19h16"/>',
    chevronRight: '<path d="M9 18l6-6-6-6"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.2 2.2L16 9.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    alertTriangle: '<path d="M10.6 3.9 2.4 18a1.6 1.6 0 0 0 1.4 2.4h16.4a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z"/><path d="M12 9v4"/><path d="M12 16.5h.01"/>',
    alertOctagon: '<path d="M7.9 3h8.2L21 7.9v8.2L16.1 21H7.9L3 16.1V7.9L7.9 3Z"/><path d="M12 8v5"/><path d="M12 15.5h.01"/>',
    minusCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7l3.5-7Z"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 19h16"/>',
    layers: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
    note: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'
  };
  function icon(name, { size = 18, strokeWidth = 2 } = {}) {
    const body = ICONS[name] || ICONS.chart;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
  var STATUS_ICON = {
    good: "checkCircle",
    warning: "clock",
    serious: "alertTriangle",
    critical: "alertOctagon",
    unbudgeted: "minusCircle"
  };

  // js/ui.js
  function toast(message, kind = "") {
    const host = document.getElementById("toast-host");
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
  function openModal(innerHtml, { onMount } = {}) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${innerHtml}</div>`;
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) close();
    });
    document.body.appendChild(backdrop);
    function close() {
      backdrop.remove();
    }
    if (onMount) onMount(backdrop.querySelector(".modal"), close);
    return close;
  }
  function statusChip(status) {
    return `<span class="chip ${status}">${icon(STATUS_ICON[status] || "minusCircle", { size: 12, strokeWidth: 2.4 })}${STATUS_LABEL[status] || status}</span>`;
  }
  function meterBar(pct, status) {
    const clamped = pct == null ? 0 : Math.max(0, Math.min(1.4, pct));
    const width = Math.min(100, clamped * 100);
    const colorVar = { good: "var(--status-good)", warning: "var(--status-warning)", serious: "var(--status-serious)", critical: "var(--status-critical)", unbudgeted: "var(--baseline)" }[status] || "var(--baseline)";
    return `<div class="meter" title="${pct == null ? "No budget set" : fmtPct(pct)}"><span style="width:${width}%; background:${colorVar}"></span></div>`;
  }
  function kpiCard({ label, value, sub, deltaText, deltaGood, icon: iconName, iconColor = "var(--accent)", sparkline }) {
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
  function sparklineSvg(values, color = "var(--accent)", w = 64, h = 22) {
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const step = w / (values.length - 1);
    const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v - min) / span * (h - 4) - 2).toFixed(1)}`).join(" ");
    const lastX = ((values.length - 1) * step).toFixed(1);
    const lastY = (h - (values[values.length - 1] - min) / span * (h - 4) - 2).toFixed(1);
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
    <polyline points="${pts}" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
    <circle cx="${lastX}" cy="${lastY}" r="2.2" fill="${color}"/>
  </svg>`;
  }
  function captureFocus(scope = document) {
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
  function restoreFocus(snap) {
    if (!snap) return;
    const el = document.querySelector(snap.selector);
    if (!el) return;
    el.focus();
    if (typeof snap.start === "number" && el.setSelectionRange) {
      try {
        el.setSelectionRange(snap.start, snap.end);
      } catch (e) {
      }
    }
  }
  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }
  function downloadTextFile(filename, text, mime = "text/csv") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2e3);
  }
  function toCsv(headers, rows) {
    const esc = (v) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  }

  // js/charts.js
  var registry = /* @__PURE__ */ new Map();
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function seriesColor(i) {
    return cssVar(`--series-${i % 8 + 1}`);
  }
  function chrome() {
    return {
      grid: cssVar("--gridline"),
      baseline: cssVar("--baseline"),
      textMuted: cssVar("--text-muted"),
      textSecondary: cssVar("--text-secondary"),
      surface: cssVar("--surface-1"),
      textPrimary: cssVar("--text-primary")
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
      boxPadding: 4
    };
  }
  function destroy(canvas) {
    const existing = registry.get(canvas);
    if (existing) {
      existing.destroy();
      registry.delete(canvas);
    }
  }
  function register(canvas, chart) {
    registry.set(canvas, chart);
    return chart;
  }
  function destroyAll() {
    for (const c of registry.values()) c.destroy();
    registry.clear();
  }
  function budgetActualBarChart(canvas, { labels, budget, actual, encumbrance }) {
    destroy(canvas);
    const c = chrome();
    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Budget", data: budget, backgroundColor: c.baseline, borderRadius: 4, maxBarThickness: 22, order: 3 },
          { label: "Actual", data: actual, backgroundColor: seriesColor(0), borderRadius: 4, maxBarThickness: 22, order: 1 },
          { label: "Encumbered", data: encumbrance, backgroundColor: seriesColor(1), borderRadius: 4, maxBarThickness: 22, order: 2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", align: "start", labels: { color: c.textSecondary, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "rectRounded", font: baseFont() } },
          tooltip: { ...tooltipBase(), callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y, { compact: true, currency: "$" })}` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.textMuted, font: baseFont() } },
          y: {
            beginAtZero: true,
            grid: { color: c.grid, drawTicks: false },
            border: { display: false },
            ticks: { color: c.textMuted, font: baseFont(), callback: (v) => fmtMoney(v, { compact: true, currency: "$" }) }
          }
        }
      }
    });
    return register(canvas, chart);
  }
  function monthlyTrendChart(canvas, { labels, cumulativeBudget, cumulativeActual, cumulativeCommitted, asOfIndex }) {
    destroy(canvas);
    const c = chrome();
    const actualSolid = cumulativeCommitted.map((v, i) => i <= asOfIndex ? v : null);
    const actualProjectedDashed = cumulativeCommitted.map((v, i) => i >= asOfIndex ? v : null);
    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Budget (pro-rated)",
            data: cumulativeBudget,
            borderColor: c.baseline,
            borderWidth: 2,
            borderDash: [4, 3],
            pointRadius: 0,
            fill: false,
            tension: 0
          },
          {
            label: "Actual + committed",
            data: actualSolid,
            borderColor: seriesColor(0),
            backgroundColor: seriesColor(0) + "1a",
            borderWidth: 2,
            pointRadius: (ctx) => ctx.dataIndex === asOfIndex ? 4 : 0,
            pointBackgroundColor: seriesColor(0),
            pointBorderColor: c.surface,
            pointBorderWidth: 2,
            fill: true,
            tension: 0.15
          },
          {
            label: "Projected",
            data: actualProjectedDashed,
            borderColor: seriesColor(0),
            borderWidth: 2,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false,
            tension: 0.15
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", align: "start", labels: { color: c.textSecondary, boxWidth: 10, boxHeight: 10, usePointStyle: true, font: baseFont(), filter: (item) => item.text !== "Projected" } },
          tooltip: { ...tooltipBase(), callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y, { compact: true, currency: "$" })}` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.textMuted, font: baseFont() } },
          y: {
            beginAtZero: true,
            grid: { color: c.grid, drawTicks: false },
            border: { display: false },
            ticks: { color: c.textMuted, font: baseFont(), callback: (v) => fmtMoney(v, { compact: true, currency: "$" }) }
          }
        }
      }
    });
    return register(canvas, chart);
  }
  function runRateChart(canvas, { labels, actualByMonth, projectedByMonth, budgetLine }) {
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
            label: "Budget line (monthly avg)",
            type: "line",
            data: Array(labels.length).fill(budgetLine),
            borderColor: c.baseline,
            borderDash: [4, 3],
            borderWidth: 2,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", align: "start", labels: { color: c.textSecondary, boxWidth: 10, boxHeight: 10, usePointStyle: true, font: baseFont() } },
          tooltip: { ...tooltipBase(), callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y, { compact: true, currency: "$" })}` } }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: c.textMuted, font: baseFont() } },
          y: { stacked: true, beginAtZero: true, grid: { color: c.grid, drawTicks: false }, border: { display: false }, ticks: { color: c.textMuted, font: baseFont(), callback: (v) => fmtMoney(v, { compact: true, currency: "$" }) } }
        }
      }
    });
    return register(canvas, chart);
  }

  // js/views/dashboard.js
  function render(root) {
    var _a;
    const s = Store.state;
    const fy = s.fiscalYear, asOf = s.asOfMonth;
    const actualsByProject = aggregateActuals(s.transactions, fy);
    const budgetMap = budgetByProject(s.budgetLines, fy);
    const rows = buildComparisonRows({ categories: s.categories, projects: s.projects, actualsByProject, budgetByProjectMap: budgetMap, asOfMonth: asOf });
    const total = grandTotal(rows);
    if (!s.categories.length) {
      root.innerHTML = emptyState();
      (_a = root.querySelector("#go-data-btn")) == null ? void 0 : _a.addEventListener("click", () => Store.setRoute("data"));
      return;
    }
    const rr = computePortfolioRunRate(rows);
    const pctUsed = total.budget > 0 ? total.committed / total.budget : null;
    const paceExpected = asOf / 12;
    const monthlyActualToDate = total.byMonth.actual.slice(0, asOf);
    const cumCommittedToDate = [];
    {
      let run = 0;
      for (let i = 0; i < asOf; i++) {
        run += (total.byMonth.actual[i] || 0) + (total.byMonth.encumbrance[i] || 0);
        cumCommittedToDate.push(run);
      }
    }
    const projectedStatusColor = { good: "var(--status-good)", warning: "var(--status-warning)", serious: "var(--status-serious)", critical: "var(--status-critical)", unbudgeted: "var(--baseline)" }[rr.status];
    root.innerHTML = `
    <div class="view-head">
      <h1>Dashboard</h1>
      <p class="lead">Portfolio snapshot for FY${fy}, through ${MONTH_NAMES[asOf - 1]}. Budget, actual spend, open commitments and the projected year-end position across every marketing / corporate-communications line.</p>
    </div>

    <div class="grid kpi-row">
      ${kpiCard({ label: "Total budget", value: "$" + fmtMoney(total.budget, { compact: true }), sub: `FY${fy} plan`, icon: "layers", iconColor: "var(--series-1)" })}
      ${kpiCard({ label: "Actual spend (YTD)", value: "$" + fmtMoney(total.actual, { compact: true }), sub: `Through ${MONTH_NAMES[asOf - 1]} \xB7 ${fmtPct(paceExpected)} of year elapsed`, icon: "trend", iconColor: "var(--series-3)", sparkline: monthlyActualToDate.length > 1 ? monthlyActualToDate : null })}
      ${kpiCard({ label: "Encumbered / committed", value: "$" + fmtMoney(total.encumbrance, { compact: true }), sub: "Open POs & obligations", icon: "inbox", iconColor: "var(--series-2)" })}
      ${kpiCard({ label: "Remaining balance", value: "$" + fmtMoney(total.balance, { compact: true }), sub: pctUsed != null ? `${fmtPct(pctUsed)} of budget committed` : "No budget set", icon: "scale", iconColor: "var(--series-6)" })}
      ${kpiCard({ label: "Projected year-end spend", value: "$" + fmtMoney(rr.projectedAnnual, { compact: true }), sub: rr.hasBudget ? `${rr.projectedVariancePct >= 0 ? "+" : ""}${fmtPct(rr.projectedVariancePct)} vs budget at current run-rate` : "No budget set", deltaText: rr.hasBudget ? STATUS_LABEL[rr.status] : null, deltaGood: rr.status === "good", icon: "chart", iconColor: projectedStatusColor, sparkline: cumCommittedToDate.length > 1 ? cumCommittedToDate : null })}
    </div>

    <div class="grid two-col">
      <div class="card chart-card">
        <div class="chart-head">
          <div><h3>Cumulative spend vs. budget pace</h3><div class="chart-cap">Actual + committed, all categories \xB7 FY${fy}</div></div>
          <button class="table-toggle" data-action="goto-comparison">View full comparison \u2192</button>
        </div>
        <div class="chart-wrap" style="height:280px"><canvas id="chart-trend"></canvas></div>
      </div>
      <div class="card chart-card">
        <div class="chart-head">
          <div><h3>Cost item groups to watch</h3><div class="chart-cap">Ranked by projected year-end variance</div></div>
        </div>
        ${watchList(rows)}
      </div>
    </div>

    <div class="card chart-card" style="margin-top:14px">
      <div class="chart-head">
        <div><h3>Budget vs. actual vs. encumbered, by cost item group</h3><div class="chart-cap">FY${fy} full-year budget compared to spend to date</div></div>
        <button class="table-toggle" data-action="goto-comparison">View as table \u2192</button>
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
    const cumBudget = [];
    const cumActual = [];
    let runB = 0, runA = 0;
    for (let i = 0; i < 12; i++) {
      runB += total.byMonth.budget[i] || 0;
      runA += (total.byMonth.actual[i] || 0) + (total.byMonth.encumbrance[i] || 0);
      cumBudget.push(runB);
      cumActual.push(runA);
    }
    monthlyTrendChart(document.getElementById("chart-trend"), {
      labels,
      cumulativeBudget: cumBudget,
      cumulativeCommitted: cumActual,
      asOfIndex: asOf - 1
    });
    budgetActualBarChart(document.getElementById("chart-category"), {
      labels: rows.map((r) => r.name),
      budget: rows.map((r) => r.budget),
      actual: rows.map((r) => r.actual),
      encumbrance: rows.map((r) => r.encumbrance)
    });
  }
  function computePortfolioRunRate(rows) {
    let ytdActual = 0, projectedAnnual = 0, budget = 0;
    for (const r of rows) {
      ytdActual += r.runRate.ytdActual;
      projectedAnnual += r.runRate.projectedAnnual;
      budget += r.budget;
    }
    const hasBudget = budget > 0;
    const projectedVariancePct = hasBudget ? (projectedAnnual - budget) / budget : null;
    const status = hasBudget ? projectedVariancePct <= 0.02 ? "good" : projectedVariancePct <= 0.1 ? "warning" : projectedVariancePct <= 0.25 ? "serious" : "critical" : "unbudgeted";
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
    ${hasOrphanTransactions ? `<p>${s.transactions.length.toLocaleString()} transaction line(s) are imported, but there are no cost item groups or cost items to group them under yet. Add matching cost item codes in <b>Data &amp; Settings \u2192 Cost Item Groups &amp; Cost Items</b> (or import a budget template) so they show up here.</p>` : `<p>Head to <b>Data &amp; Settings</b> to import your budget and actuals.</p>`}
    <div class="field-row" style="justify-content:center;margin-top:14px">
      <button class="btn btn-primary" id="go-data-btn">Go to Data &amp; Settings</button>
    </div>
  </div>`;
  }

  // js/views/comparison.js
  var comparison_exports = {};
  __export(comparison_exports, {
    render: () => render2
  });
  var expanded = /* @__PURE__ */ new Set();
  var search = "";
  var categoryFilter = "";
  function render2(root) {
    const s = Store.state;
    if (!s.categories.length) {
      root.innerHTML = `<div class="view-head"><h1>Budget vs. Actual</h1></div><div class="card empty-state">Load data from <b>Data &amp; Settings</b> first.</div>`;
      return;
    }
    if (!expanded.size) expanded = new Set(s.categories.map((c) => c.id));
    const fy = s.fiscalYear, asOf = s.asOfMonth;
    const actualsByProject = aggregateActuals(s.transactions, fy);
    const budgetMap = budgetByProject(s.budgetLines, fy);
    let rows = buildComparisonRows({ categories: s.categories, projects: s.projects, actualsByProject, budgetByProjectMap: budgetMap, asOfMonth: asOf });
    if (categoryFilter) rows = rows.filter((r) => r.id === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.map((r) => ({ ...r, projects: r.projects.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) })).filter((r) => r.name.toLowerCase().includes(q) || r.projects.length);
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
        <input type="search" id="cmp-search" placeholder="e.g. Advertising, ADV-100\u2026" value="${escapeHtml(search)}" />
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
            <td class="num">${total.budget > 0 ? fmtPct(total.committed / total.budget) : "\u2014"}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
    root.querySelector("#cmp-search").addEventListener("input", (e) => {
      search = e.target.value;
      const snap = captureFocus(root);
      render2(root);
      restoreFocus(snap);
    });
    root.querySelector("#cmp-category").addEventListener("change", (e) => {
      categoryFilter = e.target.value;
      render2(root);
    });
    root.querySelector("#expand-all").addEventListener("click", () => {
      expanded = new Set(s.categories.map((c) => c.id));
      render2(root);
    });
    root.querySelector("#collapse-all").addEventListener("click", () => {
      expanded = /* @__PURE__ */ new Set();
      render2(root);
    });
    root.querySelector("#export-csv").addEventListener("click", () => exportCsv(rows, fy));
    root.querySelectorAll("tr.row-category").forEach((tr) => tr.addEventListener("click", () => {
      const id = tr.getAttribute("data-cat");
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      render2(root);
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
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // js/views/runrate.js
  var runrate_exports = {};
  __export(runrate_exports, {
    render: () => render3
  });
  var focus = "";
  function render3(root) {
    const s = Store.state;
    if (!s.categories.length) {
      root.innerHTML = `<div class="view-head"><h1>Run Rate &amp; Forecast</h1></div><div class="card empty-state">Load data from <b>Data &amp; Settings</b> first.</div>`;
      return;
    }
    const fy = s.fiscalYear, asOf = s.asOfMonth;
    const actualsByProject = aggregateActuals(s.transactions, fy);
    const budgetMap = budgetByProject(s.budgetLines, fy);
    const rows = buildComparisonRows({ categories: s.categories, projects: s.projects, actualsByProject, budgetByProjectMap: budgetMap, asOfMonth: asOf });
    const flatList = [];
    for (const cat of rows) {
      flatList.push({ key: `cat:${cat.id}`, label: cat.name, isCat: true, row: cat });
      for (const p of cat.projects) flatList.push({ key: `proj:${p.code}`, label: `\u2014 ${p.name}`, isCat: false, row: p, catName: cat.name });
    }
    const selected = focus ? flatList.find((f) => f.key === focus) : null;
    const scopeLabel = selected ? selected.label.replace(/^— /, "") : "Entire portfolio";
    const scopeRow = selected ? selected.row : portfolioRollup(rows);
    root.innerHTML = `
    <div class="view-head">
      <h1>Run Rate &amp; Forecast</h1>
      <p class="lead">Projected year-end spend = year-to-date actual + (average monthly actual \xD7 remaining months). Compared against each cost item's FY${fy} budget to flag pace issues before year-end.</p>
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

    <div class="section-title"><h2>All lines \u2014 projected year-end position</h2></div>
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
              <td class="num">${rr.hasBudget ? "$" + fmtMoney(f.row.budget, { compact: true }) : "\u2014"}</td>
              <td class="num">${rr.hasBudget ? (rr.projectedVariance >= 0 ? "+" : "") + "$" + fmtMoney(rr.projectedVariance, { compact: true }) + " (" + fmtPct(rr.projectedVariancePct) + ")" : "\u2014"}</td>
              <td>${statusChip(rr.status)}</td>
            </tr>`;
    }).join("")}
        </tbody>
      </table>
    </div>
  `;
    root.querySelector("#rr-focus").addEventListener("change", (e) => {
      focus = e.target.value;
      render3(root);
    });
    root.querySelectorAll("tr[data-key]").forEach((tr) => tr.addEventListener("click", () => {
      focus = tr.getAttribute("data-key");
      render3(root);
    }));
    const labels = MONTH_NAMES.slice(0, 12);
    const actualByMonth = scopeRow.byMonth.actual.map((v, i) => i < asOf ? v : null);
    const avg = scopeRow.runRate.avgMonthly;
    const projectedByMonth = scopeRow.byMonth.actual.map((v, i) => i === asOf - 1 ? 0 : i >= asOf ? avg : null);
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
      runRate: computeRunRate(byMonthActual, byMonthEnc, budget, asOf)
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

  // js/views/drilldown.js
  var drilldown_exports = {};
  __export(drilldown_exports, {
    render: () => render4
  });
  var txSearch = "";
  var txSort = { key: "postedDate", dir: -1 };
  var txPage = 1;
  var PAGE_SIZE = 50;
  var vendorFilter = "";
  var typeFilter = "";
  var docTypeFilter = "";
  function render4(root) {
    const s = Store.state;
    if (!s.categories.length) {
      root.innerHTML = `<div class="view-head"><h1>Drill-Down</h1></div><div class="card empty-state">Load data from <b>Data &amp; Settings</b> first.</div>`;
      return;
    }
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
      const budget = projs.reduce((sum, p) => {
        var _a;
        return sum + (((_a = budgetMap.get(p.code)) == null ? void 0 : _a.total) || 0);
      }, 0);
      const actual = projs.reduce((sum, p) => {
        var _a;
        return sum + (((_a = actualsByProject.get(p.code)) == null ? void 0 : _a.actual) || 0);
      }, 0);
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
    var _a, _b;
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
      return txSort.dir * ((av != null ? av : 0) - (bv != null ? bv : 0));
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
        <button class="table-toggle" data-action="rr">See run-rate detail \u2192</button></div>
      <div class="chart-wrap" style="height:260px"><canvas id="chart-project-months"></canvas></div>
    </div>

    <div class="section-title"><h2>Transactions</h2><span class="hint">${txs.length.toLocaleString()} matching line${txs.length === 1 ? "" : "s"}</span></div>
    <div class="filter-bar">
      <div class="field grow"><label>Search vendor, description or doc #</label><input type="search" id="tx-search" value="${escapeHtml2(txSearch)}" placeholder="e.g. invoice number, vendor name\u2026" /></div>
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
            <td>${t.postedDate || "\u2014"}</td>
            <td>${t.vendor || "\u2014"}</td>
            <td>${t.desc || "\u2014"}</td>
            <td>${t.docNo || "\u2014"}</td>
            <td><span class="badge-soft">${friendlyDocType(t.docType)}</span></td>
            <td><span class="badge-soft">${t.balanceType === "E" ? "Encumbrance" : "Actual"}</span></td>
            <td class="num">$${fmtMoney(t.amount)}</td>
          </tr>`).join("") || `<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No transactions match these filters.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="field-row" style="justify-content:center;margin-top:10px">
      <button class="btn btn-sm" id="tx-prev" ${txPage <= 1 ? "disabled" : ""}>\u2190 Prev</button>
      <span class="hint">Page ${txPage} of ${totalPages}</span>
      <button class="btn btn-sm" id="tx-next" ${txPage >= totalPages ? "disabled" : ""}>Next \u2192</button>
    </div>
  `;
    root.querySelector('[data-crumb="root"]').addEventListener("click", () => Store.setRoute("drilldown", { categoryId: null, projectCode: null }));
    root.querySelector('[data-crumb="cat"]').addEventListener("click", () => Store.setRoute("drilldown", { categoryId, projectCode: null }));
    root.querySelector('[data-action="rr"]').addEventListener("click", () => Store.setRoute("runrate"));
    root.querySelector("#tx-search").addEventListener("input", (e) => {
      txSearch = e.target.value;
      txPage = 1;
      const snap = captureFocus(root);
      render4(root);
      restoreFocus(snap);
    });
    root.querySelector("#tx-vendor").addEventListener("change", (e) => {
      vendorFilter = e.target.value;
      txPage = 1;
      render4(root);
    });
    root.querySelector("#tx-doctype").addEventListener("change", (e) => {
      docTypeFilter = e.target.value;
      txPage = 1;
      render4(root);
    });
    root.querySelector("#tx-type").addEventListener("change", (e) => {
      typeFilter = e.target.value;
      txPage = 1;
      render4(root);
    });
    root.querySelector("#tx-export").addEventListener("click", () => {
      const csv = toCsv(["Date", "Vendor", "Description", "Doc No", "Document Type", "Basis", "Amount"], txs.map((t) => [t.postedDate, t.vendor, t.desc, t.docNo, friendlyDocType(t.docType), t.balanceType === "E" ? "Encumbrance" : "Actual", t.amount]));
      downloadTextFile(`${projectCode}-transactions-FY${fy}.csv`, csv);
    });
    root.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
      const key = th.getAttribute("data-sort");
      txSort = { key, dir: txSort.key === key ? -txSort.dir : 1 };
      render4(root);
    }));
    (_a = root.querySelector("#tx-prev")) == null ? void 0 : _a.addEventListener("click", () => {
      txPage--;
      render4(root);
    });
    (_b = root.querySelector("#tx-next")) == null ? void 0 : _b.addEventListener("click", () => {
      txPage++;
      render4(root);
    });
    budgetActualBarChart(document.getElementById("chart-project-months"), {
      labels: MONTH_NAMES,
      budget: b.byMonth,
      actual: a.actualByMonth,
      encumbrance: a.encumbranceByMonth
    });
  }
  function escapeHtml2(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // js/views/planning.js
  var planning_exports = {};
  __export(planning_exports, {
    render: () => render5
  });
  var planFy = null;
  var periodMode = "quarter";
  var QUARTERS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
  var commit = debounce((fy, code, month, amount) => Store.setBudgetAmount(fy, code, month, amount), 350);
  function render5(root) {
    const s = Store.state;
    if (!planFy) planFy = s.fiscalYear;
    if (!s.categories.length) {
      root.innerHTML = `<div class="view-head"><h1>Planning</h1></div><div class="card empty-state">Load data from <b>Data &amp; Settings</b> first, or add a cost item group below to start from scratch.
      <div style="margin-top:12px"><button class="btn btn-primary" id="add-cat-empty">Add first cost item group</button></div></div>`;
      root.querySelector("#add-cat-empty").addEventListener("click", () => addCategoryModal(root));
      return;
    }
    const budgetMap = budgetByProject(s.budgetLines, planFy);
    const years = new Set(Store.availableFiscalYears());
    years.add(planFy);
    years.add(planFy + 1);
    const yearList = [...years].sort((a, b) => a - b);
    root.innerHTML = `
    <div class="view-head">
      <h1>Planning</h1>
      <p class="lead">Enter the budget for each cost item by month or by quarter. Changes save automatically to this browser. Use <b>Data &amp; Settings \u2192 Export workbook</b> to share the plan with the rest of the team.</p>
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
        <button class="btn btn-sm" id="copy-fy">Copy from another year\u2026</button>
        <button class="btn btn-sm" id="add-cat">+ Cost item group</button>
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
    root.querySelector("#plan-fy").addEventListener("change", (e) => {
      planFy = Number(e.target.value);
      render5(root);
    });
    root.querySelectorAll(".pill-select button").forEach((b) => b.addEventListener("click", () => {
      periodMode = b.getAttribute("data-mode");
      render5(root);
    }));
    root.querySelector("#add-cat").addEventListener("click", () => addCategoryModal(root));
    root.querySelector("#copy-fy").addEventListener("click", () => copyFromYearModal(root, yearList));
    root.querySelectorAll("input.cell-input").forEach((input) => {
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
      render5(root);
    }));
    root.querySelectorAll("[data-notes]").forEach((b) => b.addEventListener("click", () => notesModal(root, b.getAttribute("data-notes"))));
  }
  function periodCols() {
    return periodMode === "quarter" ? ["Q1", "Q2", "Q3", "Q4"] : MONTH_NAMES;
  }
  function monthsForPeriod(i) {
    return periodMode === "quarter" ? QUARTERS[i] : [i];
  }
  function periodValue(budgetMap, code, i) {
    const bucket = budgetMap.get(code);
    if (!bucket) return 0;
    return monthsForPeriod(i).reduce((sum, m) => sum + (bucket.byMonth[m] || 0), 0);
  }
  function applyPeriodValue(root, code, periodIndex, value) {
    const months = monthsForPeriod(periodIndex);
    const per = Math.round(value / months.length * 100) / 100;
    for (const m of months) commit(planFy, code, m + 1, per);
    requestAnimationFrame(() => refreshTotals(root, code));
  }
  function refreshTotals(root, code) {
    const row = root.querySelector(`tr[data-project="${cssEscape(code)}"]`);
    if (row) {
      let total = 0;
      row.querySelectorAll("input.cell-input").forEach((inp) => {
        total += Number(inp.value) || 0;
      });
      const totalCell = row.querySelector(".row-total-value");
      if (totalCell) totalCell.textContent = "$" + fmtMoney(total, { compact: true });
    }
    const nPeriods = periodCols().length;
    const grandPeriodSums = Array(nPeriods).fill(0);
    let grandTotal2 = 0;
    root.querySelectorAll("tr[data-category]").forEach((catRow) => {
      const catId = catRow.getAttribute("data-category");
      const memberRows = root.querySelectorAll(`tr[data-category-member="${cssEscape(catId)}"]`);
      const periodSums = Array(nPeriods).fill(0);
      let catTotal = 0;
      memberRows.forEach((r) => {
        r.querySelectorAll("input.cell-input").forEach((inp) => {
          const p = Number(inp.dataset.period);
          const v = Number(inp.value) || 0;
          periodSums[p] += v;
          catTotal += v;
        });
      });
      periodSums.forEach((v, i) => {
        const cell = catRow.querySelector(`[data-period-total="${i}"]`);
        if (cell) cell.textContent = "$" + fmtMoney(v, { compact: true });
        grandPeriodSums[i] += v;
      });
      const catTotalCell = catRow.querySelector("[data-cat-total-value]");
      if (catTotalCell) catTotalCell.textContent = "$" + fmtMoney(catTotal, { compact: true });
      grandTotal2 += catTotal;
    });
    const grandRow = root.querySelector("[data-grand-total]");
    if (grandRow) {
      grandPeriodSums.forEach((v, i) => {
        const cell = grandRow.querySelector(`[data-period-total="${i}"]`);
        if (cell) cell.textContent = "$" + fmtMoney(v, { compact: true });
      });
      const gv = grandRow.querySelector("[data-grand-total-value]");
      if (gv) gv.textContent = "$" + fmtMoney(grandTotal2, { compact: true });
    }
  }
  function cssEscape(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "_");
  }
  function renderCategoryBlock(cat, s, budgetMap) {
    const projects = s.projects.filter((p) => p.categoryId === cat.id);
    const catTotal = projects.reduce((sum, p) => sum + periodColsTotal(budgetMap, p.code), 0);
    const fy = planFy;
    return `
    <tr class="category-row" data-category="${cat.id}"><td class="label-cell">${cat.name}</td>
      ${periodCols().map((_, i) => `<td class="total-cell" data-period-total="${i}">$${fmtMoney(projects.reduce((s2, p) => s2 + periodValue(budgetMap, p.code, i), 0), { compact: true })}</td>`).join("")}
      <td class="total-cell" data-cat-total-value>$${fmtMoney(catTotal, { compact: true })}</td>
      <td style="text-align:center"><button class="btn btn-sm" data-add-project="${cat.id}" title="Add cost item">+</button></td>
    </tr>
    ${projects.map((p) => {
      const hasNote = s.planNotes.some((n) => n.fiscalYear === fy && n.projectCode === p.code && n.text);
      return `
      <tr data-project="${cssEscape(p.code)}" data-category-member="${cat.id}">
        <td class="sub-label-cell">${p.name} <span class="badge-soft">${p.code}</span></td>
        ${periodCols().map((_, i) => `<td><input class="cell-input" type="number" step="1" min="0" data-code="${p.code}" data-period="${i}" value="${round0(periodValue(budgetMap, p.code, i))}" /></td>`).join("")}
        <td class="total-cell row-total-value">$${fmtMoney(periodColsTotal(budgetMap, p.code), { compact: true })}</td>
        <td style="text-align:center;white-space:nowrap">
          <button class="btn btn-sm ${hasNote ? "btn-has-note" : ""}" data-notes="${p.code}" title="${hasNote ? "View/edit note" : "Add note"}">${icon("note", { size: 13, strokeWidth: 2 })}</button>
          <button class="btn btn-sm btn-danger" data-del-project="${p.code}" title="Remove cost item">\xD7</button>
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
  function round0(n) {
    return Math.round(n);
  }
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
          close();
          render5(root);
        });
      }
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
          close();
          render5(root);
        });
      }
    });
  }
  function notesModal(root, code) {
    const proj = Store.state.projects.find((p) => p.code === code);
    const existing = Store.state.planNotes.find((n) => n.fiscalYear === planFy && n.projectCode === code);
    openModal(`
    <h2>Note \u2014 ${proj ? proj.name : code} <span class="badge-soft">FY${planFy}</span></h2>
    <p class="hint">Context for this cost item's plan \u2014 an assumption, a rationale, a flag for next review. Visible to anyone who opens this workbook.</p>
    <div class="field" style="margin-top:8px"><textarea id="note-text" rows="5" style="width:100%;resize:vertical;font:inherit" placeholder="e.g. Includes the Q3 campaign refresh; pending sign-off from brand team.">${existing ? escapeHtml3(existing.text) : ""}</textarea></div>
    <div class="modal-actions">
      ${existing ? `<button class="btn btn-danger" id="note-delete" style="margin-right:auto">Delete note</button>` : ""}
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="note-save">Save note</button>
    </div>
  `, {
      onMount: (modal, close) => {
        var _a;
        modal.querySelector("[data-close]").addEventListener("click", close);
        modal.querySelector("#note-save").addEventListener("click", async () => {
          await Store.setPlanNote(planFy, code, modal.querySelector("#note-text").value);
          close();
          render5(root);
        });
        (_a = modal.querySelector("#note-delete")) == null ? void 0 : _a.addEventListener("click", async () => {
          await Store.setPlanNote(planFy, code, "");
          close();
          render5(root);
        });
      }
    });
  }
  function escapeHtml3(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
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
            id: `${planFy}:${b.projectCode}:${b.month}`,
            fiscalYear: planFy,
            projectCode: b.projectCode,
            month: b.month,
            amount: Math.round(b.amount * growth * 100) / 100
          }));
          await Store.bulkSetBudgetLines(lines);
          toast(`Copied ${lines.length} line(s) from FY${source}`, "ok");
          close();
          render5(root);
        });
      }
    });
  }

  // js/views/dataSettings.js
  var dataSettings_exports = {};
  __export(dataSettings_exports, {
    render: () => render6
  });

  // js/parsers.js
  var MONTHS = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12
  };
  function readWorkbook(arrayBuffer) {
    return window.XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  }
  function fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });
  }
  function sheetToRows(ws) {
    return window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  }
  function parsePeriodLabel(label) {
    if (!label) return { year: null, month: null };
    const s = String(label).trim();
    const m = s.match(/^([A-Za-z]+)[\s-]+(\d{2,4})$/);
    if (m) {
      const mon = MONTHS[m[1].toLowerCase()];
      let yr = parseInt(m[2], 10);
      if (yr < 100) yr += 2e3;
      if (mon) return { year: yr, month: mon };
    }
    const m2 = s.match(/^(\d{4})-(\d{2})/);
    if (m2) return { year: parseInt(m2[1], 10), month: parseInt(m2[2], 10) };
    return { year: null, month: null };
  }
  function excelDateToParts(v) {
    if (v instanceof Date && !isNaN(v)) return { year: v.getFullYear(), month: v.getMonth() + 1, date: v };
    return { year: null, month: null, date: null };
  }
  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return (h >>> 0).toString(36);
  }
  var GL_HEADER_SIGNATURE = ["gl accounts", "accounted net", "gl period"];
  var REQUIRED_FIELDS = [
    { key: "project", label: "Cost item code", required: true },
    { key: "amount", label: "Amount", required: true },
    { key: "date", label: "Date or period", required: true },
    { key: "type", label: "Actual vs. encumbrance", required: false },
    { key: "vendor", label: "Vendor / payee", required: false },
    { key: "description", label: "Description", required: false },
    { key: "docNo", label: "Document / invoice number", required: false },
    { key: "docType", label: "Document type (e.g. Invoice, PO, Credit Memo)", required: false },
    { key: "category", label: "Expense category code (e.g. FERC/GL natural account)", required: false }
  ];
  function looksLikeHeaderRow(rawRow) {
    const nonEmpty = rawRow.filter((c) => c != null && String(c).trim() !== "");
    if (nonEmpty.length < 4) return false;
    const textLike = nonEmpty.filter((c) => typeof c === "string" && isNaN(Number(c)));
    return textLike.length / nonEmpty.length >= 0.7;
  }
  function inspectWorkbookForActuals(wb) {
    for (const sheetName of wb.SheetNames) {
      const rows = sheetToRows(wb.Sheets[sheetName]);
      if (!rows.length) continue;
      for (let hIdx = 0; hIdx < Math.min(5, rows.length); hIdx++) {
        const header = (rows[hIdx] || []).map((h) => h == null ? "" : String(h).trim());
        const lower = header.map((h) => h.toLowerCase());
        const isGl = GL_HEADER_SIGNATURE.every((sig) => lower.includes(sig));
        if (isGl) {
          return {
            sheetName,
            headerRowIndex: hIdx,
            header,
            rows: rows.slice(hIdx + 1),
            autoFormat: "gl-export"
          };
        }
        if (looksLikeHeaderRow(rows[hIdx] || [])) {
          return { sheetName, headerRowIndex: hIdx, header, rows: rows.slice(hIdx + 1), autoFormat: null };
        }
      }
      return { sheetName, headerRowIndex: 0, header: (rows[0] || []).map((h) => h == null ? "" : String(h)), rows: rows.slice(1), autoFormat: null };
    }
    return null;
  }
  function parseGlExportRows(header, rows) {
    const lower = header.map((h) => h.toLowerCase());
    const idx = (name) => lower.indexOf(name);
    const iAccounts = idx("gl accounts");
    const iPeriod = idx("gl period");
    const iEnddate = idx("gl period enddate");
    const iNet = idx("accounted net");
    const iVendor = idx("resource name");
    const iDesc = idx("doc desc");
    const iItemName = idx("item name");
    const iDocNo = idx("doc no");
    const iBalType = idx("balance type");
    const iDocType = idx("sub doc type");
    const iLine = idx("transact line num");
    const iPosted = idx("posted date");
    const out = [];
    for (const row of rows) {
      const net = Number(row[iNet]);
      if (!net) continue;
      const accounts = String(row[iAccounts] || "").split(".");
      const project = accounts[2] || null;
      const ferc = accounts[3] || null;
      if (!project) continue;
      let { year, month } = excelDateToParts(row[iEnddate]);
      if (!year) ({ year, month } = parsePeriodLabel(row[iPeriod]));
      if (!year) continue;
      const posted = row[iPosted] instanceof Date ? row[iPosted] : null;
      const docNo = row[iDocNo] != null ? String(row[iDocNo]) : "";
      const line = row[iLine] != null ? String(row[iLine]) : "";
      const key = simpleHash(["gl", project, ferc, docNo, line, net, year, month].join("|"));
      out.push({
        id: key,
        project,
        ferc,
        year,
        month,
        balanceType: row[iBalType] === "E" ? "E" : "A",
        docType: row[iDocType] || null,
        docNo: docNo || null,
        desc: row[iDesc] || row[iItemName] || "" || null,
        vendor: row[iVendor] || null,
        amount: Math.round(net * 100) / 100,
        postedDate: posted ? posted.toISOString().slice(0, 10) : null
      });
    }
    return out;
  }
  function parseActualsWithMapping(header, rows, mapping, batchId) {
    const idx = (key) => header.indexOf(mapping[key]);
    const iProject = idx("project");
    const iAmount = idx("amount");
    const iDate = idx("date");
    const iType = mapping.type ? idx("type") : -1;
    const iVendor = mapping.vendor ? idx("vendor") : -1;
    const iDesc = mapping.description ? idx("description") : -1;
    const iDocNo = mapping.docNo ? idx("docNo") : -1;
    const iDocType = mapping.docType ? idx("docType") : -1;
    const iCategory = mapping.category ? idx("category") : -1;
    const out = [];
    for (const row of rows) {
      const amount = Number(row[iAmount]);
      if (!amount) continue;
      const project = row[iProject] != null ? String(row[iProject]).trim() : "";
      if (!project) continue;
      let year = null, month = null, dateStr = null;
      const rawDate = row[iDate];
      if (rawDate instanceof Date) {
        year = rawDate.getFullYear();
        month = rawDate.getMonth() + 1;
        dateStr = rawDate.toISOString().slice(0, 10);
      } else {
        const parsed = parsePeriodLabel(rawDate);
        year = parsed.year;
        month = parsed.month;
      }
      if (!year || !month) continue;
      const typeRaw = iType >= 0 ? String(row[iType] || "").toLowerCase() : "";
      const balanceType = typeRaw.startsWith("enc") || typeRaw === "e" ? "E" : "A";
      const docNo = iDocNo >= 0 && row[iDocNo] != null ? String(row[iDocNo]) : "";
      const key = simpleHash(["map", project, docNo, amount, year, month, out.length].join("|"));
      out.push({
        id: key,
        project,
        ferc: iCategory >= 0 ? row[iCategory] != null ? String(row[iCategory]) : null : null,
        year,
        month,
        balanceType,
        docType: iDocType >= 0 && row[iDocType] != null ? String(row[iDocType]) : null,
        docNo: docNo || null,
        desc: iDesc >= 0 ? row[iDesc] : null,
        vendor: iVendor >= 0 ? row[iVendor] : null,
        amount: Math.round(amount * 100) / 100,
        postedDate: dateStr,
        batchId
      });
    }
    return out;
  }
  function inspectWorkbookForBudgetTemplate(wb) {
    const results = [];
    for (const sheetName of wb.SheetNames) {
      const rows = sheetToRows(wb.Sheets[sheetName]);
      for (let hIdx = 0; hIdx < Math.min(6, rows.length); hIdx++) {
        const header = (rows[hIdx] || []).map((h) => h == null ? "" : String(h).trim().toLowerCase());
        if (header.some((h) => h.includes("description")) && header.some((h) => h === "q1" || h.includes("q1"))) {
          results.push({ sheetName, headerRowIndex: hIdx, rawHeader: rows[hIdx], rows: rows.slice(hIdx + 1) });
          break;
        }
      }
    }
    return results;
  }
  function parseBudgetTemplateSheet(rawHeader, rows) {
    const header = rawHeader.map((h) => h == null ? "" : String(h).trim().toLowerCase());
    const find = (pred) => header.findIndex(pred);
    const iNum = 0;
    const iName = find((h) => h.includes("project") || h === "") >= 0 ? find((h) => h !== "" && !h.includes("description") && !h.includes("total") && !h.startsWith("q")) : 1;
    const iDesc = find((h) => h.includes("description"));
    const iTotal = find((h) => h.includes("total"));
    const iQ1 = find((h) => h === "q1" || h.includes("q1"));
    const iQ2 = find((h) => h === "q2" || h.includes("q2"));
    const iQ3 = find((h) => h === "q3" || h.includes("q3"));
    const iQ4 = find((h) => h === "q4" || h.includes("q4"));
    const categories = [];
    let current = null;
    for (const row of rows) {
      const num = row[iNum];
      const name = row[iName];
      if (!name && num == null) continue;
      const entry = {
        name: name != null ? String(name).trim() : "",
        description: iDesc >= 0 ? row[iDesc] : null,
        totalBudget: iTotal >= 0 ? Number(row[iTotal]) || 0 : 0,
        q1: iQ1 >= 0 ? Number(row[iQ1]) || 0 : 0,
        q2: iQ2 >= 0 ? Number(row[iQ2]) || 0 : 0,
        q3: iQ3 >= 0 ? Number(row[iQ3]) || 0 : 0,
        q4: iQ4 >= 0 ? Number(row[iQ4]) || 0 : 0
      };
      if (typeof num === "number") {
        current = { ...entry, subItems: [] };
        categories.push(current);
      } else if (current && entry.name) {
        current.subItems.push(entry);
      }
    }
    return categories;
  }
  function buildWorkbook({ categories, projects, budgetLines, meta, transactions, planNotes }, includeTransactions) {
    const wb = window.XLSX.utils.book_new();
    const metaRows = [["key", "value"], ...Object.entries(meta || {}).map(([k, v]) => [k, JSON.stringify(v)])];
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(metaRows), "Meta");
    const catRows = [["id", "name", "sortOrder"], ...categories.map((c) => [c.id, c.name, c.sortOrder])];
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(catRows), "CostItemGroups");
    const projRows = [["code", "name", "costItemGroupId", "active"], ...projects.map((p) => [p.code, p.name, p.categoryId, p.active ? 1 : 0])];
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(projRows), "CostItems");
    const blRows = [
      ["fiscalYear", "costItemCode", "month", "amount"],
      ...budgetLines.map((b) => [b.fiscalYear, b.projectCode, b.month, b.amount])
    ];
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(blRows), "BudgetLines");
    const noteRows = [["fiscalYear", "costItemCode", "text"], ...(planNotes || []).map((n) => [n.fiscalYear, n.projectCode, n.text])];
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(noteRows), "Notes");
    if (includeTransactions) {
      const txRows = [
        ["id", "costItemCode", "ferc", "year", "month", "balanceType", "docType", "docNo", "desc", "vendor", "amount", "postedDate", "batchId"],
        ...transactions.map((t) => [t.id, t.project, t.ferc, t.year, t.month, t.balanceType, t.docType, t.docNo, t.desc, t.vendor, t.amount, t.postedDate, t.batchId])
      ];
      window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(txRows), "Transactions");
    }
    return wb;
  }
  function downloadWorkbook(wb, filename) {
    window.XLSX.writeFile(wb, filename);
  }
  function parseBudgetBridgeWorkbook(wb) {
    const sheetRows = (name) => wb.Sheets[name] ? window.XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }) : [];
    const hasOwnFormat = ["CostItemGroups", "CostItems", "BudgetLines"].every((s) => wb.SheetNames.includes(s));
    if (!hasOwnFormat) return null;
    const categories = sheetRows("CostItemGroups").map((r) => ({ id: String(r.id), name: r.name, sortOrder: Number(r.sortOrder) || 0 }));
    const projects = sheetRows("CostItems").map((r) => ({ code: String(r.code), name: r.name, categoryId: r.costItemGroupId != null ? String(r.costItemGroupId) : null, active: r.active !== 0 }));
    const budgetLines = sheetRows("BudgetLines").map((r) => ({
      id: `${r.fiscalYear}:${r.costItemCode}:${r.month}`,
      fiscalYear: Number(r.fiscalYear),
      projectCode: String(r.costItemCode),
      month: Number(r.month),
      amount: Number(r.amount) || 0
    }));
    const planNotes = sheetRows("Notes").filter((r) => r.text).map((r) => ({
      id: `${r.fiscalYear}:${r.costItemCode}`,
      fiscalYear: Number(r.fiscalYear),
      projectCode: String(r.costItemCode),
      text: String(r.text)
    }));
    const metaRows = sheetRows("Meta");
    const meta = {};
    for (const r of metaRows) {
      try {
        meta[r.key] = JSON.parse(r.value);
      } catch (e) {
        meta[r.key] = r.value;
      }
    }
    const transactions = sheetRows("Transactions").map((r) => ({
      id: String(r.id),
      project: String(r.costItemCode),
      ferc: r.ferc != null ? String(r.ferc) : null,
      year: Number(r.year),
      month: Number(r.month),
      balanceType: r.balanceType || "A",
      docType: r.docType || null,
      docNo: r.docNo,
      desc: r.desc,
      vendor: r.vendor,
      amount: Number(r.amount) || 0,
      postedDate: r.postedDate,
      batchId: r.batchId || "imported-workbook"
    }));
    return { categories, projects, budgetLines, meta, transactions, planNotes };
  }

  // js/views/dataSettings.js
  var tab = "import";
  function render6(root) {
    root.innerHTML = `
    <div class="view-head">
      <h1>Data &amp; Settings</h1>
      <p class="lead">Bring in your actuals export, manage the cost item / cost item group list, and control how this tool's data is stored and shared.</p>
    </div>
    <div class="tabbar">
      <button data-tab="import" class="${tab === "import" ? "active" : ""}">Import actuals</button>
      <button data-tab="workbook" class="${tab === "workbook" ? "active" : ""}">Share workbook</button>
      <button data-tab="structure" class="${tab === "structure" ? "active" : ""}">Cost item groups &amp; cost items</button>
      <button data-tab="storage" class="${tab === "storage" ? "active" : ""}">Storage &amp; danger zone</button>
    </div>
    <div id="tab-body"></div>
  `;
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
      tab = b.getAttribute("data-tab");
      render6(root);
    }));
    const body = root.querySelector("#tab-body");
    if (tab === "import") renderImport(body, root);
    else if (tab === "workbook") renderWorkbook(body, root);
    else if (tab === "structure") renderStructure(body, root);
    else renderStorage(body, root);
  }
  function renderImport(body) {
    body.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <h3>Actuals / GL export</h3>
      <p class="hint">Drop the export from your ERP or accounting system (.xlsx or .csv). Recognized column headers (like <code>Gl Accounts</code>, <code>Accounted Net</code>, <code>Gl Period</code>) import automatically; anything else opens a quick column-mapping step. Re-importing the same file is safe \u2014 matching lines are updated in place, not duplicated.</p>
      <div class="dropzone" id="dz-actuals">Drop a file here, or click to choose one<br><span class="hint">.xlsx or .csv</span></div>
      <input type="file" id="file-actuals" accept=".xlsx,.xls,.csv" style="display:none" />
    </div>
    <div class="card" style="margin-bottom:16px">
      <h3>Budget planning template</h3>
      <p class="hint">Optional: import an existing cost item group / quarter budget grid (a sheet with <code>DESCRIPTION</code>, <code>Q1</code>\u2013<code>Q4</code> columns) to seed the Planning view instead of typing it in from scratch.</p>
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
      render6(document.getElementById("view-root"));
    }));
  }
  function renderBatchTable() {
    const batches = Store.state.importBatches;
    if (!batches.length) return `<p class="hint">No imports yet.</p>`;
    return `<div class="table-scroll"><table class="data-table">
    <thead><tr><th>Date</th><th>File</th><th>Rows</th><th></th></tr></thead>
    <tbody>${batches.slice().reverse().map((b) => `<tr>
      <td>${new Date(b.date).toLocaleString()}</td><td>${b.filename || "\u2014"}</td><td class="num">${b.rowCount}</td>
      <td><button class="btn btn-sm btn-danger" data-remove-batch="${b.id}">Remove</button></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
  }
  function wireDropzone(zone, input, onFile) {
    zone.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      if (input.files[0]) onFile(input.files[0]);
    });
    ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add("drag");
    }));
    ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove("drag");
    }));
    zone.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    });
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
        openModal(`<h2>This looks like a BudgetBridge workbook</h2><p>Use <b>Share workbook \u2192 Import workbook</b> instead so cost item groups, cost items and budget lines come in correctly.</p><div class="modal-actions"><button class="btn btn-primary" data-close>OK</button></div>`, {
          onMount: (m, close) => m.querySelector("[data-close]").addEventListener("click", close)
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
        render6(document.getElementById("view-root"));
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
      category: guessColumn(found.header, ["ferc", "natural account", "expense category"])
    };
    const optionsHtml = (selected) => `<option value="">\u2014</option>` + found.header.filter(Boolean).map((h) => `<option value="${h}" ${h === selected ? "selected" : ""}>${h}</option>`).join("");
    openModal(`
    <h2>Match your columns</h2>
    <p class="hint">Sheet "<b>${found.sheetName}</b>" \u2014 match each field to a column from your file.</p>
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
          modal.querySelectorAll("[data-map]").forEach((sel) => {
            mapping[sel.dataset.map] = sel.value || null;
          });
          if (!mapping.project || !mapping.amount || !mapping.date) return toast("Cost item, amount and date are required", "err");
          const rows = parseActualsWithMapping(found.header, found.rows, mapping);
          if (!rows.length) return toast("No usable rows found with that mapping", "err");
          await Store.importTransactions(rows, { filename: file.name, type: "mapped" });
          toast(`Imported ${rows.length.toLocaleString()} transaction line(s)`, "ok");
          close();
          render6(document.getElementById("view-root"));
        });
      }
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
                  const perMonth = Math.round((cat[q] || 0) / 3 * 100) / 100;
                  qmap[qi].forEach((m) => lines.push({ id: `${fy}:${code}:${m + 1}`, fiscalYear: fy, projectCode: code, month: m + 1, amount: perMonth }));
                });
              }
            }
            lineCount = lines.length;
            await Store.bulkSetBudgetLines(lines);
            toast(`Imported ${catCount} cost item group${catCount === 1 ? "" : "s"}, ${projCount} cost item${projCount === 1 ? "" : "s"}, FY${fy}`, "ok");
            close();
            render6(document.getElementById("view-root"));
          });
        }
      });
    } catch (err) {
      console.error(err);
      toast("Couldn't read that file: " + err.message, "err");
    }
  }
  function renderWorkbook(body) {
    const s = Store.state;
    body.innerHTML = `
    <div class="grid two-col">
      <div class="card">
        <h3>Export workbook</h3>
        <p class="hint">Creates a single .xlsx with your cost item groups, cost items and budget plan (and, optionally, every transaction). Save it into a shared Google Drive / OneDrive / SharePoint folder so teammates can pick up your latest numbers with <b>Import workbook</b> below.</p>
        <label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="inc-tx" /> Include full transaction detail <span class="hint">(bigger file; needed for others to see drill-down detail)</span></label>
        <button class="btn btn-primary" id="export-wb">Export workbook (.xlsx)</button>
      </div>
      <div class="card">
        <h3>Import workbook</h3>
        <p class="hint">Loads a BudgetBridge workbook \u2014 your own export, or a teammate's \u2014 replacing what's in this browser. Use this each time you open the tool to pick up the latest shared version.</p>
        <div class="dropzone" id="dz-wb">Drop a BudgetBridge workbook here, or click to choose one</div>
        <input type="file" id="file-wb" accept=".xlsx" style="display:none" />
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>How teams share this</h3>
      <p class="hint">Everything in BudgetBridge lives only in this browser (no server, no login). For a team, the shared <b>.xlsx</b> on your drive is the source of truth \u2014 one person exports after editing the plan, everyone else imports to view the latest numbers. It's the same model as a shared Excel workbook: simple and works anywhere, but not real-time \u2014 two people editing the plan at the same moment can overwrite each other, so it works best with one budget owner per cycle. See the README for the full explanation and the upgrade path to a live-shared backend if you outgrow this.</p>
    </div>
  `;
    body.querySelector("#export-wb").addEventListener("click", () => {
      const includeTx = body.querySelector("#inc-tx").checked;
      const wb = buildWorkbook({ categories: s.categories, projects: s.projects, budgetLines: s.budgetLines, transactions: s.transactions, planNotes: s.planNotes, meta: { exportedAt: (/* @__PURE__ */ new Date()).toISOString(), fiscalYear: s.fiscalYear } }, includeTx);
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
        render6(document.getElementById("view-root"));
      } catch (err) {
        console.error(err);
        toast("Couldn't read that workbook: " + err.message, "err");
      }
    });
  }
  function renderStructure(body) {
    const s = Store.state;
    body.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="field-row" style="justify-content:space-between">
        <h3 style="margin:0">Cost item groups</h3>
        <button class="btn btn-sm" id="add-cat">+ Add cost item group</button>
      </div>
      <div class="table-scroll" style="margin-top:10px"><table class="data-table">
        <thead><tr><th>Name</th><th># Cost items</th><th></th></tr></thead>
        <tbody>${s.categories.map((c) => `<tr>
          <td><input type="text" value="${escapeHtml4(c.name)}" data-rename-cat="${c.id}" /></td>
          <td class="num">${s.projects.filter((p) => p.categoryId === c.id).length}</td>
          <td><button class="btn btn-sm btn-danger" data-del-cat="${c.id}">Delete</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
    <div class="card">
      <h3>Cost items</h3>
      <div class="table-scroll" style="margin-top:10px"><table class="data-table">
        <thead><tr><th>Name</th><th>Code</th><th>Cost item group</th><th></th></tr></thead>
        <tbody>${s.projects.map((p) => `<tr>
          <td><input type="text" value="${escapeHtml4(p.name)}" data-rename-proj="${p.code}" /></td>
          <td class="badge-soft">${p.code}</td>
          <td><select data-recat="${p.code}">${s.categories.map((c) => `<option value="${c.id}" ${c.id === p.categoryId ? "selected" : ""}>${c.name}</option>`).join("")}</select></td>
          <td><button class="btn btn-sm btn-danger" data-del-proj="${p.code}">Delete</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  `;
    body.querySelector("#add-cat").addEventListener("click", () => {
      const name = prompt("Cost item group name?");
      if (name && name.trim()) Store.upsertCategory({ name: name.trim() }).then(() => render6(document.getElementById("view-root")));
    });
    body.querySelectorAll("[data-rename-cat]").forEach((inp) => inp.addEventListener("change", async () => {
      await Store.upsertCategory({ id: inp.dataset.renameCat, name: inp.value.trim() });
      toast("Saved", "ok");
    }));
    body.querySelectorAll("[data-del-cat]").forEach((b) => b.addEventListener("click", async () => {
      try {
        await Store.deleteCategory(b.dataset.delCat);
        render6(document.getElementById("view-root"));
      } catch (e) {
        toast(e.message, "err");
      }
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
      if (!confirm("Delete this cost item and its budget lines?")) return;
      await Store.deleteProject(b.dataset.delProj);
      render6(document.getElementById("view-root"));
    }));
  }
  async function renderStorage(body) {
    const s = Store.state;
    const usage = await estimateUsage();
    body.innerHTML = `
    <div class="grid two-col">
      <div class="card">
        <h3>What's in this browser right now</h3>
        <table class="data-table" style="margin-top:8px">
          <tbody>
            <tr><td>Cost item groups</td><td class="num">${s.categories.length}</td></tr>
            <tr><td>Cost items</td><td class="num">${s.projects.length}</td></tr>
            <tr><td>Budget line entries</td><td class="num">${s.budgetLines.length}</td></tr>
            <tr><td>Transaction lines</td><td class="num">${s.transactions.length.toLocaleString()}</td></tr>
            ${usage ? `<tr><td>Estimated browser storage used</td><td class="num">${formatBytes(usage.usage || 0)}</td></tr>` : ""}
          </tbody>
        </table>
        <p class="hint" style="margin-top:10px">All of this lives in this browser's local database (IndexedDB) \u2014 it isn't sent anywhere. Clearing your browser's site data for this page, or using a different browser/device, starts empty. Export a workbook regularly if you want a backup outside the browser.</p>
      </div>
      <div class="card">
        <h3>Danger zone</h3>
        <div class="stack">
          <div>
            <button class="btn btn-danger" id="clear-tx">Clear transactions only</button>
            <p class="hint">Removes imported actuals/encumbrances but keeps your cost item groups, cost items and budget plan.</p>
          </div>
          <div>
            <button class="btn btn-danger" id="wipe-all">Erase everything</button>
            <p class="hint">Deletes all cost item groups, cost items, budget lines and transactions from this browser. Cannot be undone \u2014 export a workbook first if you want a copy.</p>
          </div>
        </div>
      </div>
    </div>
  `;
    body.querySelector("#clear-tx").addEventListener("click", async () => {
      if (!confirm("Remove all imported transactions?")) return;
      await Store.clearTransactions();
      toast("Transactions cleared", "ok");
      render6(document.getElementById("view-root"));
    });
    body.querySelector("#wipe-all").addEventListener("click", async () => {
      if (!confirm("This deletes everything in this browser. This cannot be undone. Continue?")) return;
      await Store.wipeAll();
      toast("All data erased", "ok");
      render6(document.getElementById("view-root"));
    });
  }
  function escapeHtml4(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  // js/app.js
  var VIEWS = {
    dashboard: { mod: dashboard_exports, label: "Dashboard", icon: "dashboard", group: "Overview" },
    comparison: { mod: comparison_exports, label: "Budget vs. Actual", icon: "scale", group: "Overview" },
    runrate: { mod: runrate_exports, label: "Run Rate & Forecast", icon: "trend", group: "Overview" },
    drilldown: { mod: drilldown_exports, label: "Drill-Down", icon: "search", group: "Explore" },
    planning: { mod: planning_exports, label: "Planning", icon: "edit", group: "Explore" },
    data: { mod: dataSettings_exports, label: "Data & Settings", icon: "settings", group: "Manage" }
  };
  function renderShell() {
    document.getElementById("app").innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">${icon("chart", { size: 18, strokeWidth: 2.4 })}</div>
          <div class="brand-text"><div class="name">BudgetBridge</div><div class="tag">Marketing budget &amp; planning</div></div>
        </div>
        <nav class="nav" id="nav"></nav>
        <div class="sidebar-footer" id="sidebar-footer"></div>
      </aside>
      <div class="main">
        <div class="topbar" id="topbar"></div>
        <div class="view" id="view-root"></div>
      </div>
    </div>
    <div id="toast-host"></div>
  `;
  }
  function renderNav() {
    const nav = document.getElementById("nav");
    let lastGroup = null;
    let html = "";
    for (const [key, v] of Object.entries(VIEWS)) {
      if (v.group !== lastGroup) {
        html += `<div class="nav-section-label">${v.group}</div>`;
        lastGroup = v.group;
      }
      html += `<button class="nav-item ${Store.state.route === key ? "active" : ""}" data-route="${key}"><span class="ic">${icon(v.icon, { size: 17, strokeWidth: 2 })}</span>${v.label}</button>`;
    }
    nav.innerHTML = html;
    nav.querySelectorAll("[data-route]").forEach((b) => b.addEventListener("click", () => Store.setRoute(b.getAttribute("data-route"))));
    document.getElementById("sidebar-footer").innerHTML = `
    Data stored in this browser only.<br/>See Data &amp; Settings to share.
  `;
  }
  function renderTopbar() {
    const s = Store.state;
    const years = Store.availableFiscalYears();
    if (!years.includes(s.fiscalYear)) years.push(s.fiscalYear);
    const view = VIEWS[s.route];
    const topbar = document.getElementById("topbar");
    topbar.innerHTML = `
    <div>
      <h1>${view.label}</h1>
    </div>
    <div class="topbar-spacer"></div>
    <div class="topbar-controls">
      <div class="field" style="min-width:0">
        <label style="font-size:10.5px">Fiscal year</label>
        <select id="tb-fy">${years.sort((a, b) => a - b).map((y) => `<option value="${y}" ${y === s.fiscalYear ? "selected" : ""}>FY${y}</option>`).join("")}</select>
      </div>
      <div class="field" style="min-width:0">
        <label style="font-size:10.5px">As of</label>
        <select id="tb-asof">${MONTH_NAMES_FULL.map((m, i) => `<option value="${i + 1}" ${i + 1 === s.asOfMonth ? "selected" : ""}>${m}</option>`).join("")}</select>
      </div>
      <button class="btn btn-sm" id="tb-theme" title="Toggle color theme">${themeIcon(s.theme)}</button>
    </div>
  `;
    topbar.querySelector("#tb-fy").addEventListener("change", (e) => {
      Store.setFiscalYear(Number(e.target.value));
    });
    topbar.querySelector("#tb-asof").addEventListener("change", (e) => {
      Store.setAsOfMonth(Number(e.target.value));
    });
    topbar.querySelector("#tb-theme").addEventListener("click", () => {
      const order = ["system", "light", "dark"];
      const next = order[(order.indexOf(s.theme) + 1) % order.length];
      Store.setTheme(next);
    });
  }
  function themeIcon(theme) {
    return { system: "\u{1F5A5} Auto", light: "\u2600 Light", dark: "\u263E Dark" }[theme] || "\u{1F5A5} Auto";
  }
  function renderView() {
    const view = VIEWS[Store.state.route];
    destroyAll();
    view.mod.render(document.getElementById("view-root"));
  }
  var booted = false;
  var lastRouteKey = null;
  function fullRender() {
    if (!booted) {
      renderShell();
      booted = true;
    }
    const routeKey = Store.state.route === "drilldown" ? `drilldown:${Store.state.drill.categoryId || ""}:${Store.state.drill.projectCode || ""}` : Store.state.route;
    const sameView = lastRouteKey === routeKey;
    const scrollY = window.scrollY;
    const focusSnap = sameView ? captureFocus() : null;
    renderNav();
    renderTopbar();
    renderView();
    if (sameView) {
      restoreFocus(focusSnap);
      window.scrollTo(0, scrollY);
    } else window.scrollTo(0, 0);
    lastRouteKey = routeKey;
  }
  async function boot() {
    renderShell();
    document.getElementById("view-root").innerHTML = `<div class="empty-state">Loading\u2026</div>`;
    await Store.loadAll();
    booted = true;
    Store.subscribe(fullRender);
    fullRender();
  }
  boot();
})();
