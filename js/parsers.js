// ===========================================================
// BudgetBridge — file parsing (Excel / CSV) via SheetJS (window.XLSX)
// Two import types the app understands out of the box:
//   1. GL / ERP actuals export  (auto-detected by header names,
//      falls back to a manual column-mapping wizard)
//   2. A BudgetBridge workbook  (our own export, round-tripped
//      through a shared drive for multi-user use)
// Anything else still imports through the mapping wizard.
// ===========================================================

const MONTHS = {
  jan:1, january:1, feb:2, february:2, mar:3, march:3, apr:4, april:4,
  may:5, jun:6, june:6, jul:7, july:7, aug:8, august:8, sep:9, sept:9,
  september:9, oct:10, october:10, nov:11, november:11, dec:12, december:12,
};

export function readWorkbook(arrayBuffer) {
  return window.XLSX.read(arrayBuffer, { type: "array", cellDates: true });
}

export function fileToArrayBuffer(file) {
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

/** Parse a "Month-YY" / "Month YYYY" style label into {year, month}. */
export function parsePeriodLabel(label) {
  if (!label) return { year: null, month: null };
  const s = String(label).trim();
  const m = s.match(/^([A-Za-z]+)[\s-]+(\d{2,4})$/);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()];
    let yr = parseInt(m[2], 10);
    if (yr < 100) yr += 2000;
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
  for (let i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36);
}

// ---------- 1. GL / ERP actuals export ----------

// Header names this tool recognizes automatically (case-insensitive).
const GL_HEADER_SIGNATURE = ["gl accounts", "accounted net", "gl period"];

export const REQUIRED_FIELDS = [
  { key: "project", label: "Project / cost element code", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "date", label: "Date or period", required: true },
  { key: "type", label: "Actual vs. encumbrance", required: false },
  { key: "vendor", label: "Vendor / payee", required: false },
  { key: "description", label: "Description", required: false },
  { key: "docNo", label: "Document / invoice number", required: false },
  { key: "category", label: "Expense category code (e.g. FERC/GL natural account)", required: false },
];

/** A header row reads as mostly text labels; a data row mixes in numbers/dates. */
function looksLikeHeaderRow(rawRow) {
  const nonEmpty = rawRow.filter((c) => c != null && String(c).trim() !== "");
  if (nonEmpty.length < 4) return false;
  const textLike = nonEmpty.filter((c) => typeof c === "string" && isNaN(Number(c)));
  return textLike.length / nonEmpty.length >= 0.7;
}

export function inspectWorkbookForActuals(wb) {
  for (const sheetName of wb.SheetNames) {
    const rows = sheetToRows(wb.Sheets[sheetName]);
    if (!rows.length) continue;
    // find a header row within the first 5 rows
    for (let hIdx = 0; hIdx < Math.min(5, rows.length); hIdx++) {
      const header = (rows[hIdx] || []).map((h) => (h == null ? "" : String(h).trim()));
      const lower = header.map((h) => h.toLowerCase());
      const isGl = GL_HEADER_SIGNATURE.every((sig) => lower.includes(sig));
      if (isGl) {
        return {
          sheetName, headerRowIndex: hIdx, header, rows: rows.slice(hIdx + 1),
          autoFormat: "gl-export",
        };
      }
      // Heuristic: a row that looks like a header (mostly text labels, several
      // non-empty cells) rather than a title row or a row of data values.
      if (looksLikeHeaderRow(rows[hIdx] || [])) {
        return { sheetName, headerRowIndex: hIdx, header, rows: rows.slice(hIdx + 1), autoFormat: null };
      }
    }
    return { sheetName, headerRowIndex: 0, header: (rows[0] || []).map((h) => (h == null ? "" : String(h))), rows: rows.slice(1), autoFormat: null };
  }
  return null;
}

export function parseGlExportRows(header, rows) {
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
      project, ferc,
      year, month,
      balanceType: row[iBalType] === "E" ? "E" : "A",
      docType: row[iDocType] || null,
      docNo: docNo || null,
      desc: (row[iDesc] || row[iItemName] || "") || null,
      vendor: row[iVendor] || null,
      amount: Math.round(net * 100) / 100,
      postedDate: posted ? posted.toISOString().slice(0, 10) : null,
    });
  }
  return out;
}

export function parseActualsWithMapping(header, rows, mapping, batchId) {
  const idx = (key) => header.indexOf(mapping[key]);
  const iProject = idx("project");
  const iAmount = idx("amount");
  const iDate = idx("date");
  const iType = mapping.type ? idx("type") : -1;
  const iVendor = mapping.vendor ? idx("vendor") : -1;
  const iDesc = mapping.description ? idx("description") : -1;
  const iDocNo = mapping.docNo ? idx("docNo") : -1;
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
      year = rawDate.getFullYear(); month = rawDate.getMonth() + 1;
      dateStr = rawDate.toISOString().slice(0, 10);
    } else {
      const parsed = parsePeriodLabel(rawDate);
      year = parsed.year; month = parsed.month;
    }
    if (!year || !month) continue;
    const typeRaw = iType >= 0 ? String(row[iType] || "").toLowerCase() : "";
    const balanceType = typeRaw.startsWith("enc") || typeRaw === "e" ? "E" : "A";
    const docNo = iDocNo >= 0 && row[iDocNo] != null ? String(row[iDocNo]) : "";
    const key = simpleHash(["map", project, docNo, amount, year, month, out.length].join("|"));
    out.push({
      id: key, project,
      ferc: iCategory >= 0 ? (row[iCategory] != null ? String(row[iCategory]) : null) : null,
      year, month, balanceType,
      docType: null,
      docNo: docNo || null,
      desc: iDesc >= 0 ? row[iDesc] : null,
      vendor: iVendor >= 0 ? row[iVendor] : null,
      amount: Math.round(amount * 100) / 100,
      postedDate: dateStr,
      batchId,
    });
  }
  return out;
}

// ---------- 2. Budget planning template (category / quarter grid) ----------

export function inspectWorkbookForBudgetTemplate(wb) {
  const results = [];
  for (const sheetName of wb.SheetNames) {
    const rows = sheetToRows(wb.Sheets[sheetName]);
    for (let hIdx = 0; hIdx < Math.min(6, rows.length); hIdx++) {
      const header = (rows[hIdx] || []).map((h) => (h == null ? "" : String(h).trim().toLowerCase()));
      if (header.some((h) => h.includes("description")) && header.some((h) => h === "q1" || h.includes("q1"))) {
        results.push({ sheetName, headerRowIndex: hIdx, rawHeader: rows[hIdx], rows: rows.slice(hIdx + 1) });
        break;
      }
    }
  }
  return results;
}

export function parseBudgetTemplateSheet(rawHeader, rows) {
  const header = rawHeader.map((h) => (h == null ? "" : String(h).trim().toLowerCase()));
  const find = (pred) => header.findIndex(pred);
  const iNum = 0;
  const iName = find((h) => h.includes("project") || h === "" ) >= 0 ? find((h) => h !== "" && !h.includes("description") && !h.includes("total") && !h.startsWith("q")) : 1;
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
      q4: iQ4 >= 0 ? Number(row[iQ4]) || 0 : 0,
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

// ---------- Export / import BudgetBridge's own workbook ----------

export function buildWorkbook({ categories, projects, budgetLines, meta, transactions }, includeTransactions) {
  const wb = window.XLSX.utils.book_new();

  const metaRows = [["key", "value"], ...Object.entries(meta || {}).map(([k, v]) => [k, JSON.stringify(v)])];
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(metaRows), "Meta");

  const catRows = [["id", "name", "sortOrder"], ...categories.map((c) => [c.id, c.name, c.sortOrder])];
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(catRows), "Categories");

  const projRows = [["code", "name", "categoryId", "active"], ...projects.map((p) => [p.code, p.name, p.categoryId, p.active ? 1 : 0])];
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(projRows), "Projects");

  const blRows = [["fiscalYear", "projectCode", "month", "amount", "notes"],
    ...budgetLines.map((b) => [b.fiscalYear, b.projectCode, b.month, b.amount, b.notes || ""])];
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(blRows), "BudgetLines");

  if (includeTransactions) {
    const txRows = [["id", "project", "ferc", "year", "month", "balanceType", "docNo", "desc", "vendor", "amount", "postedDate", "batchId"],
      ...transactions.map((t) => [t.id, t.project, t.ferc, t.year, t.month, t.balanceType, t.docNo, t.desc, t.vendor, t.amount, t.postedDate, t.batchId])];
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(txRows), "Transactions");
  }
  return wb;
}

export function downloadWorkbook(wb, filename) {
  window.XLSX.writeFile(wb, filename);
}

export function parseBudgetBridgeWorkbook(wb) {
  const sheetRows = (name) => (wb.Sheets[name] ? window.XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }) : []);
  const hasOwnFormat = ["Categories", "Projects", "BudgetLines"].every((s) => wb.SheetNames.includes(s));
  if (!hasOwnFormat) return null;

  const categories = sheetRows("Categories").map((r) => ({ id: String(r.id), name: r.name, sortOrder: Number(r.sortOrder) || 0 }));
  const projects = sheetRows("Projects").map((r) => ({ code: String(r.code), name: r.name, categoryId: r.categoryId != null ? String(r.categoryId) : null, active: r.active !== 0 }));
  const budgetLines = sheetRows("BudgetLines").map((r) => ({
    id: `${r.fiscalYear}:${r.projectCode}:${r.month}`,
    fiscalYear: Number(r.fiscalYear), projectCode: String(r.projectCode), month: Number(r.month),
    amount: Number(r.amount) || 0, notes: r.notes || "",
  }));
  const metaRows = sheetRows("Meta");
  const meta = {};
  for (const r of metaRows) { try { meta[r.key] = JSON.parse(r.value); } catch { meta[r.key] = r.value; } }
  const transactions = sheetRows("Transactions").map((r) => ({
    id: String(r.id), project: String(r.project), ferc: r.ferc != null ? String(r.ferc) : null,
    year: Number(r.year), month: Number(r.month), balanceType: r.balanceType || "A",
    docNo: r.docNo, desc: r.desc, vendor: r.vendor, amount: Number(r.amount) || 0,
    postedDate: r.postedDate, batchId: r.batchId || "imported-workbook",
  }));
  return { categories, projects, budgetLines, meta, transactions };
}

export { simpleHash };
