// ===========================================================
// BudgetBridge — API client for the local-network server.
// Every call talks to the same-origin /api/* endpoints over
// your local network; the server (server/server.js) is the one
// shared source of truth every manager's browser reads from.
// ===========================================================

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  return data;
}

export const api = {
  login: (username, password) => call("POST", "/api/login", { username, password }),
  logout: () => call("POST", "/api/logout"),
  me: () => call("GET", "/api/me"),
  changeOwnPassword: (oldPassword, newPassword) => call("POST", "/api/me/password", { oldPassword, newPassword }),

  bootstrap: () => call("GET", "/api/bootstrap"),

  upsertCategory: (cat) => call("POST", "/api/categories", cat),
  renameCategory: (id, name) => call("PATCH", `/api/categories/${encodeURIComponent(id)}`, { name }),
  deleteCategory: (id) => call("DELETE", `/api/categories/${encodeURIComponent(id)}`),

  upsertProject: (proj) => call("POST", "/api/projects", proj),
  updateProject: (code, patch) => call("PATCH", `/api/projects/${encodeURIComponent(code)}`, patch),
  deleteProject: (code) => call("DELETE", `/api/projects/${encodeURIComponent(code)}`),

  setBudgetAmount: (fiscalYear, projectCode, month, amount) => call("POST", "/api/budget-lines", { fiscalYear, projectCode, month, amount }),
  bulkSetBudgetLines: (lines) => call("POST", "/api/budget-lines/bulk", { lines }),

  setPlanNote: (fiscalYear, projectCode, text) => call("POST", "/api/plan-notes", { fiscalYear, projectCode, text }),

  importTransactions: (rows, meta) => call("POST", "/api/transactions/import", { rows, ...meta }),
  deleteBatch: (id) => call("DELETE", `/api/transactions/batch/${encodeURIComponent(id)}`),

  clearTransactions: () => call("POST", "/api/admin/clear-transactions"),
  wipeAll: () => call("POST", "/api/admin/wipe-all"),

  adminListUsers: () => call("GET", "/api/admin/users"),
  adminCreateUser: (user) => call("POST", "/api/admin/users", user),
  adminUpdateUser: (id, patch) => call("PATCH", `/api/admin/users/${encodeURIComponent(id)}`, patch),
  adminDeleteUser: (id) => call("DELETE", `/api/admin/users/${encodeURIComponent(id)}`),
  adminSetAssignments: (id, categoryIds) => call("PUT", `/api/admin/users/${encodeURIComponent(id)}/assignments`, { categoryIds }),

  ApiError,
};
