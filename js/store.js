// ===========================================================
// BudgetBridge — central app state + persistence orchestration.
// UI modules read Store.state and call Store methods; nothing
// else touches IndexedDB directly.
// ===========================================================
import { db, getMeta, setMeta } from "./db.js";
import { generateDemoData } from "../data/demo/demo-data.js";
import { slugify } from "./calc.js";

function nowIso() { return new Date().toISOString(); }

class StoreImpl {
  constructor() {
    this.state = {
      ready: false,
      categories: [],
      projects: [],
      budgetLines: [],
      transactions: [],
      importBatches: [],
      fiscalYear: new Date().getFullYear(),
      asOfMonth: new Date().getMonth() + 1,
      theme: "system",
      route: "dashboard",
      drill: { categoryId: null, projectCode: null },
      usingDemoData: false,
    };
    this._listeners = new Set();
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _notify() { for (const fn of this._listeners) fn(this.state); }
  setState(patch) { Object.assign(this.state, patch); this._notify(); }

  availableFiscalYears() {
    const years = new Set();
    for (const b of this.state.budgetLines) years.add(b.fiscalYear);
    for (const t of this.state.transactions) years.add(t.year);
    years.add(this.state.fiscalYear);
    return [...years].sort((a, b) => a - b);
  }

  async loadAll() {
    const [categories, projects, budgetLines, transactions, importBatches] = await Promise.all([
      db.getAll("categories"), db.getAll("projects"), db.getAll("budgetLines"), db.getAll("transactions"), db.getAll("importBatches"),
    ]);
    const savedFy = await getMeta("fiscalYear", null);
    const savedAsOf = await getMeta("asOfMonth", null);
    const theme = await getMeta("theme", "system");
    const usingDemoData = await getMeta("usingDemoData", false);

    let fiscalYear = savedFy;
    if (!fiscalYear) {
      const years = new Set([...budgetLines.map((b) => b.fiscalYear), ...transactions.map((t) => t.year)]);
      fiscalYear = years.size ? Math.max(...years) : new Date().getFullYear();
    }
    this.setState({
      categories, projects, budgetLines, transactions, importBatches,
      fiscalYear, asOfMonth: savedAsOf || new Date().getMonth() + 1,
      theme, usingDemoData, ready: true,
    });
    this._applyTheme();
  }

  _applyTheme() {
    const t = this.state.theme;
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
    else if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }

  async setTheme(theme) { await setMeta("theme", theme); this.setState({ theme }); this._applyTheme(); }
  async setFiscalYear(fy) { await setMeta("fiscalYear", fy); this.setState({ fiscalYear: fy }); }
  async setAsOfMonth(m) { await setMeta("asOfMonth", m); this.setState({ asOfMonth: m }); }

  setRoute(route, drill = {}) { this.setState({ route, drill: { ...this.state.drill, ...drill } }); }

  // ---------- categories ----------
  async upsertCategory(cat) {
    const id = cat.id || slugify(cat.name);
    const record = { id, name: cat.name, sortOrder: cat.sortOrder ?? this.state.categories.length };
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
    await db.deleteByIndex("budgetLines", "byFyProject", undefined).catch(() => {});
    const budgetLines = this.state.budgetLines.filter((b) => b.projectCode !== code);
    for (const b of this.state.budgetLines.filter((b) => b.projectCode === code)) await db.delete("budgetLines", b.id);
    this.setState({ projects: this.state.projects.filter((p) => p.code !== code), budgetLines });
  }

  // ---------- budget lines ----------
  async setBudgetAmount(fiscalYear, projectCode, month, amount) {
    const id = `${fiscalYear}:${projectCode}:${month}`;
    const record = { id, fiscalYear, projectCode, month, amount: Number(amount) || 0, notes: "", updatedAt: nowIso() };
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

  // ---------- demo data ----------
  async loadDemoData() {
    await db.wipeAll();
    const demo = generateDemoData({ fiscalYear: new Date().getFullYear() >= 2026 ? new Date().getFullYear() : 2026, asOfMonth: 9 });
    await db.bulkPut("categories", demo.categories);
    await db.bulkPut("projects", demo.projects);
    await db.bulkPut("budgetLines", demo.budgetLines);
    await db.bulkPut("transactions", demo.transactions);
    await setMeta("usingDemoData", true);
    await setMeta("fiscalYear", demo.fiscalYear);
    await setMeta("asOfMonth", demo.asOfMonth);
    this.setState({
      categories: demo.categories, projects: demo.projects, budgetLines: demo.budgetLines,
      transactions: demo.transactions, importBatches: [], usingDemoData: true,
      fiscalYear: demo.fiscalYear, asOfMonth: demo.asOfMonth,
    });
  }

  async wipeAll() {
    await db.wipeAll();
    await setMeta("usingDemoData", false);
    this.setState({ categories: [], projects: [], budgetLines: [], transactions: [], importBatches: [], usingDemoData: false });
  }

  async importWorkbookData(parsed) {
    await db.wipeAll();
    await db.bulkPut("categories", parsed.categories);
    await db.bulkPut("projects", parsed.projects);
    await db.bulkPut("budgetLines", parsed.budgetLines);
    if (parsed.transactions?.length) await db.bulkPut("transactions", parsed.transactions);
    await setMeta("usingDemoData", false);
    this.setState({
      categories: parsed.categories, projects: parsed.projects, budgetLines: parsed.budgetLines,
      transactions: parsed.transactions || [], usingDemoData: false,
    });
  }
}

export const Store = new StoreImpl();
