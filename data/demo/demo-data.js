// ===========================================================
// BudgetBridge — synthetic demo dataset generator.
// Entirely fabricated numbers/names so the app is fully explorable
// without needing a real export first. Structure (categories, a
// GL-style project code, monthly actuals + encumbrances, a
// current-year budget and a next-year plan in progress) mirrors
// what a corporate-communications / marketing budget export
// typically looks like, but no figures here come from any real
// organization's data.
// ===========================================================

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORY_DEFS = [
  { id: "advertising-media", name: "Advertising & Media Placement", projects: [
    { code: "ADV-100", name: "Advertising Production & Placement", annual: 14_000_000 },
    { code: "ADV-110", name: "Digital & Social Media Boosting", annual: 4_200_000 },
  ]},
  { id: "third-party", name: "Third-Party Production Services", projects: [
    { code: "TPS-200", name: "Third Party Services", annual: 9_500_000 },
    { code: "TPS-210", name: "Agency & Facilitator Support", annual: 3_600_000 },
  ]},
  { id: "photo-video", name: "Photography & Videography", projects: [
    { code: "PHV-300", name: "Photography & Videography", annual: 5_100_000 },
  ]},
  { id: "sponsorships", name: "Sponsorships & Partnerships", projects: [
    { code: "SPN-400", name: "Strategic Partnerships & Sponsorships", annual: 8_000_000 },
    { code: "SPN-410", name: "Industry Association Memberships", annual: 1_200_000 },
  ]},
  { id: "events", name: "Corporate & Community Events", projects: [
    { code: "EVT-500", name: "Sponsored Community Events", annual: 6_400_000 },
    { code: "EVT-510", name: "Internal Corporate Events", annual: 2_100_000 },
  ]},
  { id: "brand-campaigns", name: "Brand Campaigns", projects: [
    { code: "BRC-600", name: "Corporate Brand Campaign", annual: 10_000_000 },
  ]},
  { id: "customer-education", name: "Customer Education & Engagement", projects: [
    { code: "CED-700", name: "Customer Education Content", annual: 3_800_000 },
    { code: "CED-710", name: "Brochures & Field Collateral", annual: 1_400_000 },
  ]},
  { id: "media-relations", name: "Media Relations & Briefings", projects: [
    { code: "MED-800", name: "Media Briefings", annual: 1_600_000 },
  ]},
  { id: "training", name: "Training & Team Engagement", projects: [
    { code: "TRN-900", name: "Training & Development", annual: 2_800_000 },
    { code: "TRN-910", name: "Team Engagement Activities", annual: 1_100_000 },
  ]},
  { id: "digital-content", name: "Digital & Content Production", projects: [
    { code: "DIG-1000", name: "Website & Digital Content", annual: 2_600_000 },
  ]},
];

const VENDORS = [
  "Northshore Media Group", "Bluewave Productions", "Stratus Advertising Co.",
  "Coral Bay Studios", "Meridian Print & Design", "Harborlight Films",
  "Signal Tree Agency", "Fieldstone Creative", "Panorama Events Ltd.",
  "Lighthouse PR Partners", "Oakmoor Productions", "Cedarline Graphics",
];

const DESCRIPTIONS = [
  "Monthly retainer", "Production services", "Media placement — radio",
  "Media placement — TV", "Print production run", "Event logistics support",
  "Content shoot & editing", "Sponsorship activation", "Design & artwork",
  "Talent & facilitation fees", "Venue & rentals", "Digital ad boosting",
];

function seasonalWeight(month) {
  // slight ramp toward year-end (campaigns, holiday sponsorships)
  const weights = [0.8, 0.85, 0.95, 0.9, 0.95, 1.0, 0.95, 1.0, 1.05, 1.1, 1.2, 1.3];
  return weights[month - 1];
}

export function generateDemoData({ fiscalYear = 2026, asOfMonth = 9 } = {}) {
  const rng = mulberry32(20260101);
  const categories = CATEGORY_DEFS.map((c, i) => ({ id: c.id, name: c.name, sortOrder: i }));
  const projects = [];
  const budgetLines = [];
  const transactions = [];
  let txSeq = 0;

  for (const cat of CATEGORY_DEFS) {
    for (const p of cat.projects) {
      projects.push({ code: p.code, name: p.name, categoryId: cat.id, active: true });

      // ---- Current fiscal year budget, spread with seasonal weighting ----
      const weights = Array.from({ length: 12 }, (_, m) => seasonalWeight(m + 1));
      const weightSum = weights.reduce((a, b) => a + b, 0);
      for (let m = 1; m <= 12; m++) {
        const amount = Math.round((p.annual * weights[m - 1]) / weightSum);
        budgetLines.push({ id: `${fiscalYear}:${p.code}:${m}`, fiscalYear, projectCode: p.code, month: m, amount, notes: "" });
      }

      // ---- Next fiscal year plan — deliberately partial (planning in progress) ----
      const nextYear = fiscalYear + 1;
      const growth = 1 + (rng() * 0.16 - 0.03); // -3%..+13%
      const nextAnnual = Math.round(p.annual * growth);
      const q1Amount = Math.round(nextAnnual * 0.25);
      for (let m = 1; m <= 3; m++) {
        budgetLines.push({ id: `${nextYear}:${p.code}:${m}`, fiscalYear: nextYear, projectCode: p.code, month: m, amount: Math.round(q1Amount / 3), notes: "" });
      }

      // ---- Actual transactions, Jan..asOfMonth of the current fiscal year ----
      const monthlyTarget = p.annual / 12;
      for (let m = 1; m <= asOfMonth; m++) {
        const pace = 0.85 + rng() * 0.35; // some months run hot, some cold
        const monthActualTotal = monthlyTarget * seasonalWeight(m) * pace * (12 / weights.reduce((a, b) => a + b, 0) * weightSum / 12);
        const lineCount = 2 + Math.floor(rng() * 4);
        let remaining = monthActualTotal;
        for (let li = 0; li < lineCount; li++) {
          const isLast = li === lineCount - 1;
          const amount = isLast ? remaining : remaining * (0.2 + rng() * 0.4);
          remaining -= amount;
          txSeq++;
          // mostly invoices, with the occasional credit memo or manual journal
          // so the drill-down's document-type filter has real variety
          const roll = rng();
          const docType = roll > 0.93 ? "GL_JRNL_MAN" : roll > 0.88 ? "AP_INV_CDTINV" : "AP_INV_STDINV";
          const docPrefix = docType === "GL_JRNL_MAN" ? "JE" : docType === "AP_INV_CDTINV" ? "CM" : "INV";
          transactions.push({
            id: `demo-${p.code}-${fiscalYear}-${m}-${li}`,
            project: p.code, ferc: null,
            year: fiscalYear, month: m, balanceType: "A",
            docType, docNo: `${docPrefix}-${String(txSeq).padStart(5, "0")}`,
            desc: DESCRIPTIONS[Math.floor(rng() * DESCRIPTIONS.length)],
            vendor: VENDORS[Math.floor(rng() * VENDORS.length)],
            amount: Math.round(Math.max(amount, 0) * 100) / 100,
            postedDate: `${fiscalYear}-${String(m).padStart(2, "0")}-${String(5 + Math.floor(rng() * 20)).padStart(2, "0")}`,
            batchId: "demo-seed",
          });
        }
        // occasional open encumbrance (committed PO not yet invoiced)
        if (rng() > 0.6) {
          txSeq++;
          const encAmount = monthlyTarget * (0.05 + rng() * 0.2);
          transactions.push({
            id: `demo-${p.code}-${fiscalYear}-${m}-enc`,
            project: p.code, ferc: null,
            year: fiscalYear, month: m, balanceType: "E",
            docType: "PO_PO_STD", docNo: `PO-${String(txSeq).padStart(5, "0")}`,
            desc: "Open purchase order",
            vendor: VENDORS[Math.floor(rng() * VENDORS.length)],
            amount: Math.round(encAmount * 100) / 100,
            postedDate: `${fiscalYear}-${String(m).padStart(2, "0")}-15`,
            batchId: "demo-seed",
          });
        }
      }
    }
  }

  return { categories, projects, budgetLines, transactions, fiscalYear, asOfMonth };
}
