// ===========================================================
// BudgetBridge — central app state + persistence orchestration.
// UI modules read Store.state and call Store methods; nothing
// else talks to the server API directly. The server (not the
// browser) is the shared source of truth every manager's browser
// reads from — this is what makes budgets roll up automatically.
// ===========================================================
import { api } from "./api.js";
import { slugify } from "./calc.js";

function prefGet(key, fallback) {
  try { const v = localStorage.getItem(`bb:${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function prefSet(key, value) {
  try { localStorage.setItem(`bb:${key}`, JSON.stringify(value)); } catch { /* private mode etc. — fine, it's just a UI preference */ }
}

class StoreImpl {
  constructor() {
    this.state = {
      ready: false,
      authed: false,
      me: null, // { id, name, username, role, assignedCategoryIds }
      categories: [],
      projects: [],
      budgetLines: [],
      transactions: [],
      importBatches: [],
      planNotes: [],
      fiscalYear: new Date().getFullYear(),
      asOfMonth: new Date().getMonth() + 1,
      theme: "system",
      route: "dashboard",
      drill: { categoryId: null, projectCode: null },
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

  /** Can the signed-in user edit budget/notes/cost items under this cost item group? */
  canEditCategory(categoryId) {
    const me = this.state.me;
    if (!me) return false;
    if (me.role === "admin") return true;
    return me.assignedCategoryIds.includes(categoryId);
  }
  canEditProject(projectCode) {
    const proj = this.state.projects.find((p) => p.code === projectCode);
    return proj ? this.canEditCategory(proj.categoryId) : false;
  }
  get isAdmin() { return this.state.me?.role === "admin"; }

  /** Call once at boot: checks the session, then loads shared data if signed in. */
  async init() {
    const theme = prefGet("theme", "system");
    const fiscalYear = prefGet("fiscalYear", null);
    const asOfMonth = prefGet("asOfMonth", null);
    this.setState({ theme, ...(fiscalYear ? { fiscalYear } : {}), ...(asOfMonth ? { asOfMonth } : {}) });
    this._applyTheme();

    try {
      await api.me();
    } catch {
      this.setState({ ready: true, authed: false });
      return;
    }
    await this.loadAll();
  }

  async login(username, password) {
    const { user } = await api.login(username, password);
    await this.loadAll();
    return user;
  }
  async logout() {
    await api.logout().catch(() => {});
    this.setState({
      authed: false, me: null, categories: [], projects: [], budgetLines: [],
      transactions: [], importBatches: [], planNotes: [],
    });
  }

  async loadAll() {
    const data = await api.bootstrap();
    let fiscalYear = this.state.fiscalYear;
    if (!prefGet("fiscalYear", null)) {
      const years = new Set([...data.budgetLines.map((b) => b.fiscalYear), ...data.transactions.map((t) => t.year)]);
      fiscalYear = years.size ? Math.max(...years) : new Date().getFullYear();
    }
    this.setState({
      authed: true, me: data.me,
      categories: data.categories, projects: data.projects, budgetLines: data.budgetLines,
      transactions: data.transactions, importBatches: data.importBatches, planNotes: data.planNotes,
      fiscalYear, ready: true,
    });
  }

  _applyTheme() {
    const t = this.state.theme;
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
    else if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }

  setTheme(theme) { prefSet("theme", theme); this.setState({ theme }); this._applyTheme(); }
  setFiscalYear(fy) { prefSet("fiscalYear", fy); this.setState({ fiscalYear: fy }); }
  setAsOfMonth(m) { prefSet("asOfMonth", m); this.setState({ asOfMonth: m }); }

  setRoute(route, drill = {}) { this.setState({ route, drill: { ...this.state.drill, ...drill } }); }

  // ---------- categories (cost item groups) — admin only ----------
  async upsertCategory(cat) {
    const id = cat.id || slugify(cat.name);
    const { category } = await api.upsertCategory({ id, name: cat.name, sortOrder: cat.sortOrder ?? this.state.categories.length });
    this.setState({ categories: [...this.state.categories.filter((c) => c.id !== category.id), category] });
    return category;
  }
  async renameCategory(id, name) {
    await api.renameCategory(id, name);
    this.setState({ categories: this.state.categories.map((c) => (c.id === id ? { ...c, name } : c)) });
  }
  async deleteCategory(id) {
    await api.deleteCategory(id);
    this.setState({ categories: this.state.categories.filter((c) => c.id !== id) });
  }

  // ---------- projects (cost items) — admin, or the manager who owns the group ----------
  async upsertProject(proj) {
    const { project } = await api.upsertProject({ code: proj.code.trim(), name: proj.name.trim(), categoryId: proj.categoryId });
    this.setState({ projects: [...this.state.projects.filter((p) => p.code !== project.code), project] });
    return project;
  }
  async updateProject(code, patch) {
    await api.updateProject(code, patch);
    this.setState({ projects: this.state.projects.map((p) => (p.code === code ? { ...p, ...patch } : p)) });
  }
  async deleteProject(code) {
    await api.deleteProject(code);
    this.setState({
      projects: this.state.projects.filter((p) => p.code !== code),
      budgetLines: this.state.budgetLines.filter((b) => b.projectCode !== code),
      planNotes: this.state.planNotes.filter((n) => n.projectCode !== code),
    });
  }

  // ---------- budget lines ----------
  async setBudgetAmount(fiscalYear, projectCode, month, amount) {
    const id = `${fiscalYear}:${projectCode}:${month}`;
    const value = Number(amount) || 0;
    await api.setBudgetAmount(fiscalYear, projectCode, month, value);
    const record = { id, fiscalYear, projectCode, month, amount: value };
    this.setState({ budgetLines: [...this.state.budgetLines.filter((b) => b.id !== id), record] });
  }

  async bulkSetBudgetLines(lines) {
    const { applied } = await api.bulkSetBudgetLines(lines);
    const byId = new Map(this.state.budgetLines.map((b) => [b.id, b]));
    for (const l of lines) { if (this.canEditProject(l.projectCode)) byId.set(l.id, l); }
    this.setState({ budgetLines: [...byId.values()] });
    return applied;
  }

  // ---------- transactions / imports (admin) ----------
  async importTransactions(rows, meta) {
    const { batch } = await api.importTransactions(rows, meta);
    const byId = new Map(this.state.transactions.map((t) => [t.id, t]));
    for (const r of rows) byId.set(r.id, { ...r, batchId: batch.id });
    this.setState({ transactions: [...byId.values()], importBatches: [...this.state.importBatches, batch] });
    return batch;
  }
  async deleteBatch(id) {
    await api.deleteBatch(id);
    this.setState({
      transactions: this.state.transactions.filter((t) => t.batchId !== id),
      importBatches: this.state.importBatches.filter((b) => b.id !== id),
    });
  }
  async clearTransactions() {
    await api.clearTransactions();
    this.setState({ transactions: [], importBatches: [] });
  }

  // ---------- plan notes (one per cost item per fiscal year) ----------
  async setPlanNote(fiscalYear, projectCode, text) {
    const id = `${fiscalYear}:${projectCode}`;
    const trimmed = (text || "").trim();
    await api.setPlanNote(fiscalYear, projectCode, trimmed);
    if (!trimmed) { this.setState({ planNotes: this.state.planNotes.filter((n) => n.id !== id) }); return; }
    const record = { id, fiscalYear, projectCode, text: trimmed };
    this.setState({ planNotes: [...this.state.planNotes.filter((n) => n.id !== id), record] });
  }

  // ---------- danger zone (admin) ----------
  async wipeAll() {
    await api.wipeAll();
    this.setState({ categories: [], projects: [], budgetLines: [], transactions: [], importBatches: [], planNotes: [] });
  }

  // ---------- users & access (admin) ----------
  // Deliberately NOT part of reactive state (this.state / setState): the
  // user list is only needed by the admin-only "Users & access" tab, and
  // routing it through setState would fire the app-wide re-render
  // subscription on every load — which itself reloads the list — an
  // infinite loop. The view manages its own local copy instead.
  async loadUsers() {
    const { users } = await api.adminListUsers();
    return users;
  }
  async createUser(user) {
    const { user: created } = await api.adminCreateUser(user);
    return created;
  }
  async updateUser(id, patch) {
    await api.adminUpdateUser(id, patch);
  }
  async deleteUser(id) {
    await api.adminDeleteUser(id);
  }
  async setUserAssignments(id, categoryIds) {
    await api.adminSetAssignments(id, categoryIds);
  }
  async changeOwnPassword(oldPassword, newPassword) {
    return api.changeOwnPassword(oldPassword, newPassword);
  }
}

export const Store = new StoreImpl();
