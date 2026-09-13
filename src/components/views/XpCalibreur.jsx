import { useCallback, useMemo, useRef, useState } from 'react';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { BUDGET_BRANCHES, BRANCH_ORDER, XP_DEFAULT_STATE } from '../../lib/xpCalibreur.js';

/**
 * Calibreur d'XP — courbe de progression, barème par branche (glisser-déposer),
 * profils de rythme, calculateur de combat, graphiques. Contenu partagé
 * (state.xpCalibreur), synchronisé en temps réel comme le reste du tableau
 * de bord : chaque champ texte/numérique utilise le motif « brouillon local
 * + patch immédiat » pour rester réactif pendant la frappe.
 */

const PROFILE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];
const BRANCH_LABELS = { trame: 'Trame', secondaire: 'Secondaire', exploration: 'Exploration', combat: 'Combat', speciale: 'Spéciale' };
const BRANCH_VARS = {
  trame: '--branch-trame',
  secondaire: '--branch-secondaire',
  exploration: '--branch-exploration',
  combat: '--branch-combat',
  speciale: '--branch-speciale'
};

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function fmt(n) {
  if (!isFinite(n)) return '–';
  return Math.round(n).toLocaleString('fr-FR');
}
function fmtUp(n) {
  if (!isFinite(n)) return '–';
  return Math.ceil(n).toLocaleString('fr-FR');
}

function niceStep(maxVal, ticks) {
  if (maxVal <= 0) return 1;
  const rough = maxVal / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step;
  if (norm < 1.5) step = 1; else if (norm < 3) step = 2; else if (norm < 7) step = 5; else step = 10;
  return step * mag;
}

function branchXpSum(st, key) {
  let sum = 0;
  (st.bareme && st.bareme[key] || []).forEach((item) => {
    sum += Math.max(0, Number(item.xp) || 0);
  });
  return sum;
}

function expLabel(e) {
  if (e < 0.55) return 'très douce';
  if (e < 0.85) return 'douce';
  if (e <= 1.15) return 'linéaire';
  if (e <= 1.8) return 'progressive';
  if (e <= 2.4) return 'marquée';
  return 'explosive';
}

// ---------- calcul ----------

function deriveResults(st, levels, T, cost, cum, total) {
  // La répartition par branche découle automatiquement du poids XP de
  // chaque branche dans le barème (somme des types Trame / Secondaire /
  // Exploration / Combat). Spéciale reste hors de ce calcul.
  const n = BUDGET_BRANCHES.length;
  const rawSums = BUDGET_BRANCHES.map((key) => branchXpSum(st, key));
  const sumR = rawSums.reduce((a, b) => a + b, 0);
  const ratios = sumR > 0
    ? rawSums.map((v) => v / sumR)
    : rawSums.map(() => 1 / n);

  const branchCost = {}, branchCum = {};
  BUDGET_BRANCHES.forEach((key) => {
    branchCost[key] = new Array(T + 1).fill(0);
    branchCum[key] = new Array(T + 1).fill(0);
  });

  for (let t = 1; t <= T; t++) {
    const C = cost[t];
    const raw = ratios.map((r) => C * r);
    const floors = raw.map(Math.floor);
    const used = floors.reduce((a, b) => a + b, 0);
    const remainder = C - used;
    const fracs = raw.map((v, i) => ({ i, f: v - floors[i] }));
    fracs.sort((a, b) => b.f - a.f);
    const add = new Array(n).fill(0);
    for (let k = 0; k < remainder; k++) add[fracs[k % n].i]++;
    BUDGET_BRANCHES.forEach((key, i) => {
      const val = floors[i] + add[i];
      branchCost[key][t] = val;
      branchCum[key][t] = branchCum[key][t - 1] + val;
    });
  }

  const profileResults = (st.profiles || []).map((p, idx) => {
    const xp = Math.max(0.01, Number(p.xp) || 0.01);
    const sessionsAt = new Array(T + 1).fill(0);
    for (let tt = 1; tt <= T; tt++) sessionsAt[tt] = Math.ceil(cum[tt] / xp);
    const totalSessions = sessionsAt[T];
    return {
      name: p.name || `Profil ${idx + 1}`,
      xp,
      sessionsAt,
      totalSessions,
      years: totalSessions / 52,
      color: PROFILE_COLORS[idx % PROFILE_COLORS.length]
    };
  });

  const baremeResults = [];
  BRANCH_ORDER.forEach((branchKey) => {
    (st.bareme && st.bareme[branchKey] || []).forEach((item) => {
      const xp = Math.max(0.01, Number(item.xp) || 0.01);
      const completionsAt = new Array(T + 1).fill(0);
      for (let tt = 1; tt <= T; tt++) completionsAt[tt] = Math.ceil(cost[tt] / xp);
      baremeResults.push({
        branch: branchKey,
        name: item.name || 'Type',
        xp,
        completionsAt,
        totalCompletions: Math.ceil(cum[T] / xp)
      });
    });
  });

  return { levels, total, T, cost, cum, branchCost, branchCum, profileResults, baremeResults };
}

function computeAll(st) {
  const levels = clamp(Math.round(Number(st.levels) || 25), 2, 60);
  const total = Math.max(0, Math.round(Number(st.total) || 0));
  const exponent = clamp(Number(st.exponent) || 1, 0.1, 4);
  const T = levels - 1;

  const weights = new Array(T + 1).fill(0);
  for (let t = 1; t <= T; t++) weights[t] = Math.pow(t, exponent);
  const prefix = new Array(T + 1).fill(0);
  for (let t = 1; t <= T; t++) prefix[t] = prefix[t - 1] + weights[t];
  const sumAll = prefix[T] || 1;

  const cum = new Array(T + 1).fill(0);
  for (let t = 1; t <= T; t++) cum[t] = Math.round(total * prefix[t] / sumAll);
  cum[T] = total;

  const cost = new Array(T + 1).fill(0);
  for (let t = 1; t <= T; t++) cost[t] = cum[t] - cum[t - 1];

  return deriveResults(st, levels, T, cost, cum, total);
}

// Prolonge la courbe du niveau max configuré jusqu'au niveau 50. Les niveaux
// 1..max gardent exactement les valeurs de computeAll(state) (aucun changement
// rétroactif) ; le segment max+1..50 est réparti selon la même forme de
// croissance (exponent) mais normalisé sur ce seul segment, de façon à tomber
// pile sur le total visé "state.total50" fixé par l'utilisateur.
function computeExtendedTo50(state) {
  const levels = clamp(Math.round(Number(state.levels) || 25), 2, 60);
  if (levels >= 50) return null;
  const T = levels - 1;
  const exponent = clamp(Number(state.exponent) || 1, 0.1, 4);
  const T2 = 49;

  const base = computeAll(state);
  const total = base.total;

  const w = new Array(T2 + 1).fill(0);
  for (let t = 1; t <= T2; t++) w[t] = Math.pow(t, exponent);
  const prefix = new Array(T2 + 1).fill(0);
  for (let t = 1; t <= T2; t++) prefix[t] = prefix[t - 1] + w[t];
  const segWeight = prefix[T2] - prefix[T];

  const total50Raw = Math.round(Number(state.total50) || 0);
  const total50 = Math.max(total + 1, total50Raw);
  const remaining = total50 - total;

  const cum = new Array(T2 + 1).fill(0);
  for (let t = 0; t <= T; t++) cum[t] = base.cum[t];
  for (let t = T + 1; t <= T2; t++) {
    cum[t] = segWeight > 0
      ? total + Math.round(remaining * (prefix[t] - prefix[T]) / segWeight)
      : total + Math.round(remaining * (t - T) / (T2 - T));
  }
  cum[T2] = total50;

  const cost = new Array(T2 + 1).fill(0);
  for (let t = 1; t <= T2; t++) cost[t] = cum[t] - cum[t - 1];

  return deriveResults(state, 50, T2, cost, cum, total50);
}

// ---------- styles (scopés sous .xp-calibreur-root, aucun effet de bord) ----------

const XP_CALIBREUR_CSS = `
.xp-calibreur-root{
  color-scheme: light;
  --page:#f8f7f4;
  --surface:#ffffff;
  --surface-2:#fcfcfb;
  --ink:#14130f;
  --ink-secondary:#52514e;
  --ink-muted:#898781;
  --border: rgba(20,19,15,0.10);
  --border-strong: rgba(20,19,15,0.16);
  --gridline:#e1e0d9;
  --accent:#2a78d6;
  --accent-ink:#ffffff;
  --branch-trame:#2a78d6;
  --branch-exploration:#eb6834;
  --branch-combat:#1baf7a;
  --branch-secondaire:#eda100;
  --branch-speciale:#4a3aa7;
  --warn:#fab219;
  --warn-ink:#5c4300;
  --good:#0ca30c;
  --shadow: 0 1px 2px rgba(20,19,15,0.05), 0 1px 1px rgba(20,19,15,0.04);
  background:var(--page);
  color:var(--ink);
  font-family: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 28px 16px 64px;
}
@media (prefers-color-scheme: dark){
  .xp-calibreur-root:not([data-theme="light"]){
    color-scheme: dark;
    --page:#0d0d0c;
    --surface:#171715;
    --surface-2:#1a1a19;
    --ink:#ffffff;
    --ink-secondary:#c3c2b7;
    --ink-muted:#898781;
    --border: rgba(255,255,255,0.10);
    --border-strong: rgba(255,255,255,0.16);
    --gridline:#2c2c2a;
    --accent:#3987e5;
    --accent-ink:#ffffff;
    --branch-trame:#3987e5;
    --branch-exploration:#d95926;
    --branch-combat:#199e70;
    --branch-secondaire:#c98500;
    --branch-speciale:#9085e9;
    --warn:#fab219;
    --warn-ink:#2b1f00;
    --good:#0ca30c;
    --shadow: 0 1px 2px rgba(0,0,0,0.35), 0 1px 1px rgba(0,0,0,0.3);
  }
}
.xp-calibreur-root[data-theme="dark"]{
  color-scheme: dark;
  --page:#0d0d0c;
  --surface:#171715;
  --surface-2:#1a1a19;
  --ink:#ffffff;
  --ink-secondary:#c3c2b7;
  --ink-muted:#898781;
  --border: rgba(255,255,255,0.10);
  --border-strong: rgba(255,255,255,0.16);
  --gridline:#2c2c2a;
  --accent:#3987e5;
  --accent-ink:#ffffff;
  --branch-trame:#3987e5;
  --branch-exploration:#d95926;
  --branch-combat:#199e70;
  --branch-secondaire:#c98500;
  --branch-speciale:#9085e9;
  --warn:#fab219;
  --warn-ink:#2b1f00;
  --good:#0ca30c;
  --shadow: 0 1px 2px rgba(0,0,0,0.35), 0 1px 1px rgba(0,0,0,0.3);
}

.xp-calibreur-root *{ box-sizing:border-box; }

.xp-calibreur-root .wrap{ max-width: 1080px; margin:0 auto; display:flex; flex-direction:column; gap:22px; }

.xp-calibreur-root .num{ font-family:"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
.xp-calibreur-root .tab-num{ font-variant-numeric: tabular-nums; }

.xp-calibreur-root header.top{ display:flex; flex-direction:column; gap:6px; }
.xp-calibreur-root header.top h1{
  margin:0; font-size: 1.7rem; font-weight:700; letter-spacing:-0.01em;
  text-wrap: balance;
}
.xp-calibreur-root header.top p{ margin:0; color:var(--ink-secondary); font-size:0.94rem; max-width:62ch; line-height:1.5; }

.xp-calibreur-root .panel{
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:14px;
  padding:18px 20px;
  box-shadow: var(--shadow);
}
.xp-calibreur-root .panel h2{
  margin:0 0 3px; font-size:0.78rem; font-weight:600;
  text-transform:uppercase; letter-spacing:0.06em; color:var(--ink-muted);
}
.xp-calibreur-root .panel .sub{ margin:0 0 14px; font-size:0.85rem; color:var(--ink-secondary); }

.xp-calibreur-root .grid2{ display:grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap:16px; }
.xp-calibreur-root .curve-fields-stack{ display:flex; flex-direction:column; gap:16px; max-width:420px; }
.xp-calibreur-root .field{ display:flex; flex-direction:column; gap:6px; }
.xp-calibreur-root .field label{ font-size:0.8rem; color:var(--ink-secondary); font-weight:500; }
.xp-calibreur-root .field .hint{ font-size:0.74rem; color:var(--ink-muted); }
.xp-calibreur-root input[type="number"], .xp-calibreur-root input[type="text"]{
  font: inherit; font-size:0.95rem; color:var(--ink);
  background:var(--page); border:1px solid var(--border-strong); border-radius:8px;
  padding:8px 10px; width:100%;
}
.xp-calibreur-root input[type="number"]{ font-family:"IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.xp-calibreur-root input:focus-visible, .xp-calibreur-root button:focus-visible, .xp-calibreur-root select:focus-visible{
  outline: 2px solid var(--accent); outline-offset:2px;
}
.xp-calibreur-root input[type="range"]{ width:100%; accent-color:var(--accent); }

.xp-calibreur-root .exp-row{ display:flex; align-items:center; gap:12px; }
.xp-calibreur-root .exp-row .exp-badge{
  font-size:0.78rem; font-weight:600; color:var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  padding:3px 9px; border-radius:999px; white-space:nowrap;
}

.xp-calibreur-root .ratio-row{ display:flex; gap:14px; flex-wrap:wrap; align-items:stretch; }
.xp-calibreur-root .ratio-field{ flex:1 1 140px; }
.xp-calibreur-root .ratio-swatch{ display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:6px; }
.xp-calibreur-root .ratio-auto-box{
  background:var(--page); border:1px solid var(--border-strong); border-radius:8px;
  padding:8px 10px;
}
.xp-calibreur-root .ratio-auto-pct{ display:block; font-size:1.15rem; font-weight:700; color:var(--ink); }
.xp-calibreur-root .ratio-auto-sub{ display:block; font-size:0.72rem; color:var(--ink-muted); margin-top:2px; }
.xp-calibreur-root .btn{
  font: inherit; font-size:0.82rem; font-weight:600; cursor:pointer;
  border-radius:8px; padding:8px 13px; border:1px solid var(--border-strong);
  background:var(--surface); color:var(--ink);
}
.xp-calibreur-root .btn:hover{ background:var(--page); }
.xp-calibreur-root .btn.primary{ background:var(--accent); color:var(--accent-ink); border-color:transparent; }
.xp-calibreur-root .btn.primary:hover{ filter:brightness(1.06); }
.xp-calibreur-root .btn.ghost{ border-color:transparent; color:var(--ink-secondary); }
.xp-calibreur-root .btn.small{ padding:5px 9px; font-size:0.76rem; }
.xp-calibreur-root .actions-row{ display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; align-items:center; }

.xp-calibreur-root .bareme-grid{ display:flex; flex-direction:column; gap:16px; }
.xp-calibreur-root .bareme-group{ border:1px solid var(--border); border-radius:12px; padding:14px 16px; background:var(--page); }
.xp-calibreur-root .bareme-group-title{ display:flex; align-items:center; gap:7px; font-weight:600; font-size:0.9rem; margin-bottom:10px; }
.xp-calibreur-root table.results.bareme-table{ font-size:0.82rem; min-width:0; table-layout:fixed; width:100%; }
.xp-calibreur-root table.results.bareme-table th, .xp-calibreur-root table.results.bareme-table td{ padding:6px 6px; white-space:normal; overflow-wrap:break-word; }
.xp-calibreur-root table.results.bareme-table td:nth-child(1), .xp-calibreur-root table.results.bareme-table th:nth-child(1){ position:static; box-shadow:none; background:transparent; }
.xp-calibreur-root table.results.bareme-table th:nth-child(1), .xp-calibreur-root table.results.bareme-table td:nth-child(1){ width:24px; text-align:center; padding-left:2px; padding-right:2px; }
.xp-calibreur-root table.results.bareme-table th:nth-child(2), .xp-calibreur-root table.results.bareme-table td:nth-child(2){ width:auto; text-align:left; }
.xp-calibreur-root table.results.bareme-table th:nth-child(3), .xp-calibreur-root table.results.bareme-table td:nth-child(3){ width:58px; text-align:left; }
.xp-calibreur-root table.results.bareme-table th:nth-child(4), .xp-calibreur-root table.results.bareme-table td:nth-child(4){ width:64px; text-align:right; }
.xp-calibreur-root table.results.bareme-table th:nth-child(5), .xp-calibreur-root table.results.bareme-table td:nth-child(5){ width:34px; text-align:center; padding-left:2px; padding-right:2px; }
.xp-calibreur-root table.results.bareme-table input[type="text"], .xp-calibreur-root table.results.bareme-table input[type="number"]{ font-size:0.82rem; padding:6px 6px; width:100%; box-sizing:border-box; }
.xp-calibreur-root table.results.bareme-table .completions-cell{ font-family:"IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space:nowrap; }
.xp-calibreur-root table.results.bareme-table .btn.small{ padding:5px 6px; }
.xp-calibreur-root .bareme-grip{ display:block; cursor:grab; touch-action:none; user-select:none; -webkit-user-select:none; color:var(--ink-muted); font-size:1rem; line-height:1; text-align:center; }
.xp-calibreur-root .bareme-grip:active{ cursor:grabbing; }
.xp-calibreur-root table.results.bareme-table tbody tr.bareme-row-dragging{ opacity:0.35; }
.xp-calibreur-root table.results.bareme-table tbody tr.bareme-drop-before td{ box-shadow: inset 0 2px 0 0 var(--accent); }
.xp-calibreur-root table.results.bareme-table tbody tr.bareme-drop-after td{ box-shadow: inset 0 -2px 0 0 var(--accent); }
.xp-calibreur-root table.results.bareme-table tfoot td{ border-top:2px solid var(--border-strong); border-bottom:none; }
.xp-calibreur-root table.results.bareme-table tfoot td:nth-child(3){ text-align:right; }

.xp-calibreur-root .profiles-list{ display:flex; flex-direction:column; gap:10px; }
.xp-calibreur-root .profile-row{
  display:grid; grid-template-columns: 1fr 120px auto; gap:10px; align-items:center;
}
.xp-calibreur-root .profile-swatch{ width:12px; height:12px; border-radius:50%; flex:0 0 auto; }
.xp-calibreur-root .profile-name-wrap{ display:flex; align-items:center; gap:8px; }

.xp-calibreur-root .stat-tiles{ display:grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap:14px; }
.xp-calibreur-root .stat-tile{
  background:var(--surface); border:1px solid var(--border); border-radius:14px;
  padding:16px 18px; box-shadow:var(--shadow); border-top:3px solid var(--tile-color, var(--accent));
}
.xp-calibreur-root .stat-tile .label{ font-size:0.78rem; color:var(--ink-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.05em; }
.xp-calibreur-root .stat-tile .value{ font-size:1.55rem; font-weight:700; margin-top:6px; letter-spacing:-0.01em; }
.xp-calibreur-root .stat-tile .sub{ font-size:0.82rem; color:var(--ink-secondary); margin-top:2px; }

.xp-calibreur-root .legend{ display:flex; gap:16px; flex-wrap:wrap; margin-bottom:10px; }
.xp-calibreur-root .legend-item{ display:flex; align-items:center; gap:7px; font-size:0.82rem; color:var(--ink-secondary); }
.xp-calibreur-root .legend-swatch{ width:12px; height:12px; border-radius:3px; flex:0 0 auto; }

.xp-calibreur-root .chart-scroll{ overflow-x:auto; padding-bottom:4px; }
.xp-calibreur-root .chart-holder{ position:relative; }
.xp-calibreur-root svg.chart{ display:block; }
.xp-calibreur-root .chart-tooltip{
  position:absolute; pointer-events:none; background:var(--ink); color:var(--page);
  font-size:0.78rem; padding:8px 10px; border-radius:8px; line-height:1.5;
  white-space:nowrap; box-shadow:0 4px 14px rgba(0,0,0,0.25); z-index:5;
}
.xp-calibreur-root .chart-tooltip .row{ display:flex; align-items:center; gap:6px; }
.xp-calibreur-root .chart-tooltip .dot{ width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
.xp-calibreur-root .chart-tooltip .tt-title{ font-weight:600; margin-bottom:3px; }

.xp-calibreur-root .table-wrap{ overflow-x:auto; border:1px solid var(--border); border-radius:12px; }
.xp-calibreur-root table.results{ border-collapse:collapse; width:100%; font-size:0.85rem; min-width:640px; }
.xp-calibreur-root table.results th, .xp-calibreur-root table.results td{
  padding:8px 12px; text-align:right; border-bottom:1px solid var(--border); white-space:nowrap;
}
.xp-calibreur-root table.results th:first-child, .xp-calibreur-root table.results td:first-child{ text-align:left; }
.xp-calibreur-root table.results thead th{
  position:sticky; top:0; background:var(--surface-2); font-size:0.72rem; text-transform:uppercase;
  letter-spacing:0.04em; color:var(--ink-muted); font-weight:600; border-bottom:1px solid var(--border-strong);
  z-index:2;
}
.xp-calibreur-root table.results th:first-child, .xp-calibreur-root table.results td:first-child{
  position:sticky; left:0; z-index:1; box-shadow: 1px 0 0 var(--border-strong);
}
.xp-calibreur-root table.results td:first-child{ background:var(--surface); font-weight:600; }
.xp-calibreur-root table.results th:first-child{ z-index:3; }
.xp-calibreur-root table.results tbody tr:hover{ background: color-mix(in srgb, var(--accent) 6%, transparent); }
.xp-calibreur-root table.results tbody tr:hover td:first-child{ background: color-mix(in srgb, var(--accent) 14%, var(--surface)); }
.xp-calibreur-root table.results td.branch-trame{ color:var(--branch-trame); }
.xp-calibreur-root table.results td.branch-exploration{ color:var(--branch-exploration); }
.xp-calibreur-root table.results td.branch-combat{ color:var(--branch-combat); }
.xp-calibreur-root table.results td.branch-secondaire{ color:var(--branch-secondaire); }
.xp-calibreur-root table.results td.branch-speciale{ color:var(--branch-speciale); }
.xp-calibreur-root table.results th.branch-trame{ color:var(--branch-trame); }
.xp-calibreur-root table.results th.branch-exploration{ color:var(--branch-exploration); }
.xp-calibreur-root table.results th.branch-combat{ color:var(--branch-combat); }
.xp-calibreur-root table.results th.branch-secondaire{ color:var(--branch-secondaire); }
.xp-calibreur-root table.results th.branch-speciale{ color:var(--branch-speciale); }
.xp-calibreur-root table.results tr.final td{ font-weight:700; }

.xp-calibreur-root .combat-grid{ display:grid; grid-template-columns: minmax(220px,1fr) 2fr; gap:20px; align-items:start; }
.xp-calibreur-root .combat-out{ display:flex; flex-direction:column; gap:8px; }
.xp-calibreur-root .combat-out .big{ font-size:1.7rem; font-weight:700; }
.xp-calibreur-root .ref-table{ width:100%; border-collapse:collapse; font-size:0.82rem; }
.xp-calibreur-root .ref-table th, .xp-calibreur-root .ref-table td{ padding:6px 10px; border-bottom:1px solid var(--border); text-align:right; }
.xp-calibreur-root .ref-table th:first-child, .xp-calibreur-root .ref-table td:first-child{ text-align:left; }
.xp-calibreur-root .ref-table thead th{ color:var(--ink-muted); font-weight:600; font-size:0.72rem; text-transform:uppercase; }
.xp-calibreur-root .combat-calc-frame{ border:1px solid var(--border-strong); border-radius:10px; padding:14px 16px; margin-top:14px; background:var(--surface); }
.xp-calibreur-root .combat-calc-title{ font-weight:600; font-size:0.85rem; margin-bottom:4px; }
.xp-calibreur-root .combat-calc-frame .hint{ margin-bottom:10px; }

.xp-calibreur-root select{
  font: inherit; font-size:0.9rem; background:var(--page); color:var(--ink);
  border:1px solid var(--border-strong); border-radius:8px; padding:7px 9px;
}

.xp-calibreur-root .badge-speciale{
  display:inline-flex; align-items:center; gap:6px; font-size:0.8rem; color:var(--branch-speciale);
  background: color-mix(in srgb, var(--branch-speciale) 14%, transparent); padding:5px 10px; border-radius:999px;
}

.xp-calibreur-root footer.note{ font-size:0.78rem; color:var(--ink-muted); text-align:center; padding-top:6px; }

@media (max-width:560px){
  .xp-calibreur-root .profile-row{ grid-template-columns: 1fr; }
  .xp-calibreur-root .combat-grid{ grid-template-columns: 1fr; }
  .xp-calibreur-root table.results th, .xp-calibreur-root table.results td{ padding:7px 8px; }
}
`;

// ---------- sous-composants ----------

function BaremeItemRow({ item, idx, branchKey, cumTotal, onChangeItem, onRemove, disabled, rowRef, dragHandlers }) {
  const [name, setName] = useSyncedField(item.name);
  const [xp, setXp] = useSyncedField(item.xp);
  const xpNum = Math.max(0.01, Number(item.xp) || 0.01);
  const totalCompletions = Math.ceil(cumTotal / xpNum);

  return (
    <tr ref={rowRef}>
      <td>
        <span
          className="bareme-grip"
          title="Glisser pour réordonner"
          aria-label={`Réordonner ${item.name}`}
          {...dragHandlers}
        >⠿</span>
      </td>
      <td>
        <input
          type="text"
          value={name}
          aria-label={`Type d'événement (${branchKey})`}
          onChange={(e) => { const v = e.target.value; setName(v); onChangeItem(idx, 'name', v); }}
        />
      </td>
      <td>
        <input
          type="number"
          min="0"
          step="1"
          value={xp}
          aria-label={`XP par complétion pour ${item.name}`}
          onChange={(e) => { const v = Number(e.target.value) || 0; setXp(v); onChangeItem(idx, 'xp', v); }}
        />
      </td>
      <td className="num tab-num completions-cell" title={`${fmt(totalCompletions)} complétions au total`}>
        {fmt(totalCompletions)}
      </td>
      <td>
        <button className="btn small ghost" aria-label={`Retirer ${item.name}`} disabled={disabled} onClick={() => onRemove(idx)}>✕</button>
      </td>
    </tr>
  );
}

function BaremeTable({ branchKey, label, colorVar, items, cumTotal, onChangeItem, onAdd, onRemove, onReorder, footnote, extra }) {
  const rowRefs = useRef([]);
  rowRefs.current = [];
  const dragRef = useRef(null);

  const setRowRef = (idx) => (el) => { rowRefs.current[idx] = el; };

  const clearIndicators = useCallback(() => {
    rowRefs.current.forEach((r) => {
      if (r) r.classList.remove('bareme-drop-before', 'bareme-drop-after');
    });
  }, []);

  const onGripPointerDown = (idx) => (ev) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    ev.preventDefault();
    dragRef.current = { pointerId: ev.pointerId, startIndex: idx, overIndex: idx, before: true };
    const row = rowRefs.current[idx];
    if (row) row.classList.add('bareme-row-dragging');
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch (e) {}
  };

  const onGripPointerMove = (idx) => (ev) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== ev.pointerId) return;
    clearIndicators();
    const rows = rowRefs.current;
    let targetIdx = -1;
    let before = false;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const rect = r.getBoundingClientRect();
      if (ev.clientY < rect.top + rect.height / 2) { targetIdx = i; before = true; break; }
    }
    if (targetIdx === -1) {
      targetIdx = rows.length - 1;
      before = false;
    }
    drag.overIndex = targetIdx;
    drag.before = before;
    const target = rows[targetIdx];
    const draggedRow = rows[drag.startIndex];
    if (target && target !== draggedRow) target.classList.add(before ? 'bareme-drop-before' : 'bareme-drop-after');
  };

  const endDrag = (idx) => (ev) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== ev.pointerId) return;
    clearIndicators();
    const row = rowRefs.current[drag.startIndex];
    if (row) row.classList.remove('bareme-row-dragging');
    try { ev.currentTarget.releasePointerCapture(ev.pointerId); } catch (e) {}

    const from = drag.startIndex, to = drag.overIndex, before = drag.before;
    dragRef.current = null;
    if (from < 0 || to < 0) return;
    let insertAt = before ? to : to + 1;
    if (insertAt > from) insertAt--;
    if (insertAt === from) return;
    onReorder(from, insertAt);
  };

  const sumXp = items.reduce((a, it) => a + Math.max(0, Number(it.xp) || 0), 0);
  const totalCompl = sumXp > 0 ? Math.ceil(cumTotal / sumXp) : null;

  return (
    <div className="bareme-group">
      <div className="bareme-group-title">
        <span className="ratio-swatch" style={{ background: `var(${colorVar})` }}></span>{label}
      </div>
      <div className="table-wrap">
        <table className="results bareme-table">
          <thead>
            <tr>
              <th></th>
              <th>Type</th>
              <th>XP</th>
              <th title="Complétions nécessaires pour atteindre le niveau maximum configuré">Compl.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <BaremeItemRow
                key={idx}
                item={item}
                idx={idx}
                branchKey={branchKey}
                cumTotal={cumTotal}
                onChangeItem={onChangeItem}
                onRemove={onRemove}
                disabled={items.length <= 1}
                rowRef={setRowRef(idx)}
                dragHandlers={{
                  onPointerDown: onGripPointerDown(idx),
                  onPointerMove: onGripPointerMove(idx),
                  onPointerUp: endDrag(idx),
                  onPointerCancel: endDrag(idx)
                }}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="final">
              <td></td>
              <td>Total</td>
              <td className="num tab-num">{fmt(sumXp)}</td>
              <td
                className="num tab-num completions-cell"
                title={totalCompl != null ? `${fmt(totalCompl)} fois l'ensemble des types ci-dessus combinés (${fmt(sumXp)} XP) pour boucler toute la courbe` : ''}
              >
                {totalCompl != null ? fmt(totalCompl) : '–'}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button className="btn small ghost" onClick={onAdd} disabled={items.length >= 10}>+ Ajouter un type</button>
      {footnote ? <p className="hint" style={{ marginTop: 8 }}>{footnote}</p> : null}
      {extra || null}
    </div>
  );
}

function CombatCalcFrame({ combat, onChangeField }) {
  const [E, setE] = useSyncedField(combat.E);
  const [base, setBase] = useSyncedField(combat.base);
  const [exp, setExp] = useSyncedField(combat.exp);

  const En = Number(combat.E) || 0;
  const baseN = Number(combat.base) || 0;
  const expN = Number(combat.exp) || 2;
  const calc = (e) => baseN + Math.pow(e, expN);
  const soloVal = calc(En);
  const out = combat.mode === 'groupe' ? soloVal / 2 : soloVal;

  return (
    <div className="combat-calc-frame">
      <div className="combat-calc-title">Référence — calculateur de combat</div>
      <p className="hint">
        Le mob "supérieur" suit une formule à part (2 + écart²) : teste un écart de niveau, une constante
        et un exposant pour voir l'XP que ça donnerait, et compare avec le tableau de référence.
      </p>
      <div className="combat-grid">
        <div>
          <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field">
              <label htmlFor="in-cb-e">Écart de niveau (E)</label>
              <input
                type="number" id="in-cb-e" min="0" max="30" step="1" value={E}
                onChange={(e) => { const v = Number(e.target.value) || 0; setE(v); onChangeField('E', v); }}
              />
            </div>
            <div className="field">
              <label htmlFor="in-cb-mode">Mode</label>
              <select id="in-cb-mode" value={combat.mode} onChange={(e) => onChangeField('mode', e.target.value)}>
                <option value="solo">Solo</option>
                <option value="groupe">Groupe (÷2)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="in-cb-base">Constante de base</label>
              <input
                type="number" id="in-cb-base" min="0" step="1" value={base}
                onChange={(e) => { const v = Number(e.target.value) || 0; setBase(v); onChangeField('base', v); }}
              />
            </div>
            <div className="field">
              <label htmlFor="in-cb-exp">Exposant</label>
              <input
                type="number" id="in-cb-exp" min="1" max="4" step="1" value={exp}
                onChange={(e) => { const v = Number(e.target.value) || 0; setExp(v); onChangeField('exp', v); }}
              />
            </div>
          </div>
          <div className="combat-out">
            <div>
              <div className="hint">XP pour ce mob "supérieur"</div>
              <div className="big num tab-num">{fmtUp(out)}</div>
            </div>
          </div>
        </div>
        <div>
          <table className="ref-table">
            <thead><tr><th>Type de mob</th><th>XP solo</th><th>XP groupe</th></tr></thead>
            <tbody>
              <tr><td>Niveau inférieur</td><td className="num tab-num">1</td><td className="num tab-num">1</td></tr>
              <tr><td>Niveau équivalent</td><td className="num tab-num">2</td><td className="num tab-num">1</td></tr>
              <tr><td>Niveau supérieur, écart 1</td><td className="num tab-num">{fmtUp(calc(1))}</td><td className="num tab-num">{fmtUp(calc(1) / 2)}</td></tr>
              <tr><td>Niveau supérieur, écart 3</td><td className="num tab-num">{fmtUp(calc(3))}</td><td className="num tab-num">{fmtUp(calc(3) / 2)}</td></tr>
              <tr><td>Niveau supérieur, écart 5</td><td className="num tab-num">{fmtUp(calc(5))}</td><td className="num tab-num">{fmtUp(calc(5) / 2)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BranchChart({ data }) {
  const holderRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const T = data.T;
  const barW = 20, gap = 10;
  const marginLeft = 52, marginRight = 16, marginTop = 14, marginBottom = 28;
  const drawH = 220;
  const drawW = T * (barW + gap);
  const svgW = marginLeft + marginRight + drawW;
  const svgH = marginTop + marginBottom + drawH;

  let maxVal = 1;
  for (let t = 1; t <= T; t++) maxVal = Math.max(maxVal, data.cost[t]);
  const step = niceStep(maxVal, 4);
  let niceMax = Math.ceil(maxVal / step) * step;
  if (niceMax <= 0) niceMax = step;
  const yFor = (v) => marginTop + drawH - (v / niceMax) * drawH;

  const ticks = [];
  for (let v = 0; v <= niceMax + 0.001; v += step) ticks.push(Math.round(v));

  const baseY = yFor(0);
  const labelStep = T <= 25 ? 1 : (T <= 50 ? 5 : 10);

  function showTip(t, evt) {
    if (!holderRef.current) return;
    const rect = holderRef.current.getBoundingClientRect();
    setTooltip({ t, left: evt.clientX - rect.left, top: evt.clientY - rect.top });
  }

  const bars = [];
  for (let t = 1; t <= T; t++) {
    const x0 = marginLeft + (t - 1) * (barW + gap);
    const order = [
      { key: 'trame', val: data.branchCost.trame[t], v: '--branch-trame' },
      { key: 'secondaire', val: data.branchCost.secondaire[t], v: '--branch-secondaire' },
      { key: 'exploration', val: data.branchCost.exploration[t], v: '--branch-exploration' },
      { key: 'combat', val: data.branchCost.combat[t], v: '--branch-combat' }
    ];
    let yCursor = baseY;
    order.forEach((seg, i) => {
      const h = (seg.val / niceMax) * drawH;
      if (h > 0.15) {
        bars.push(<rect key={`${t}-${seg.key}`} x={x0} y={yCursor - h} width={barW} height={h} fill={`var(${seg.v})`} rx="2" />);
        yCursor -= h;
        if (i < order.length - 1) yCursor -= 2;
      }
    });
    bars.push(
      <rect
        key={`${t}-hit`} x={x0} y={marginTop} width={barW} height={drawH} fill="transparent"
        onMouseMove={(e) => showTip(t, e)}
        onMouseLeave={() => setTooltip(null)}
        onTouchStart={(e) => { const touch = e.touches[0]; if (touch) showTip(t, touch); }}
      />
    );
    if (t % labelStep === 0 || t === T || t === 1) {
      bars.push(
        <text key={`${t}-lbl`} x={x0 + barW / 2} y={marginTop + drawH + 18} textAnchor="middle" fontSize="10" fill="var(--ink-muted)" fontFamily="IBM Plex Mono, monospace">
          {t + 1}
        </text>
      );
    }
  }

  return (
    <div className="chart-scroll">
      <div className="chart-holder" ref={holderRef}>
        <svg className="chart" width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} role="img" aria-label="Coût XP par palier, réparti par branche">
          {ticks.map((tv) => (
            <g key={`grid-${tv}`}>
              <line x1={marginLeft} y1={yFor(tv)} x2={marginLeft + drawW} y2={yFor(tv)} stroke="var(--gridline)" strokeWidth="1" />
              <text x={marginLeft - 8} y={yFor(tv) + 3} textAnchor="end" fontSize="10.5" fill="var(--ink-muted)" fontFamily="IBM Plex Mono, monospace">{fmt(tv)}</text>
            </g>
          ))}
          <line x1={marginLeft} y1={baseY} x2={marginLeft + drawW} y2={baseY} stroke="var(--border-strong)" strokeWidth="1" />
          {bars}
        </svg>
        {tooltip ? (
          <div
            className="chart-tooltip"
            style={{ left: tooltip.left, top: tooltip.top, opacity: 1, transform: 'translate(-50%, calc(-100% - 10px))' }}
          >
            <div className="tt-title">Niveau {tooltip.t} → {tooltip.t + 1} · {fmt(data.cost[tooltip.t])} XP</div>
            <div className="row"><span className="dot" style={{ background: 'var(--branch-trame)' }}></span>Trame {fmt(data.branchCost.trame[tooltip.t])}</div>
            <div className="row"><span className="dot" style={{ background: 'var(--branch-secondaire)' }}></span>Secondaire {fmt(data.branchCost.secondaire[tooltip.t])}</div>
            <div className="row"><span className="dot" style={{ background: 'var(--branch-exploration)' }}></span>Exploration {fmt(data.branchCost.exploration[tooltip.t])}</div>
            <div className="row"><span className="dot" style={{ background: 'var(--branch-combat)' }}></span>Combat {fmt(data.branchCost.combat[tooltip.t])}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProgressionTable({ data }) {
  const rows = [];
  for (let t = 1; t <= data.T; t++) rows.push(t);
  return (
    <div className="table-wrap">
      <table className="results">
        <thead>
          <tr>
            <th>Niveau</th><th>XP requis</th><th>XP cumulé</th>
            <th>Trame</th><th>Secondaire</th><th>Exploration</th><th>Combat</th>
            {data.profileResults.map((pr) => <th key={pr.name}>{pr.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t} className={t === data.T ? 'final' : undefined}>
              <td className="num tab-num">{t + 1}</td>
              <td className="num tab-num">{fmt(data.cost[t])}</td>
              <td className="num tab-num">{fmt(data.cum[t])}</td>
              <td className="num tab-num branch-trame">{fmt(data.branchCum.trame[t])}</td>
              <td className="num tab-num branch-secondaire">{fmt(data.branchCum.secondaire[t])}</td>
              <td className="num tab-num branch-exploration">{fmt(data.branchCum.exploration[t])}</td>
              <td className="num tab-num branch-combat">{fmt(data.branchCum.combat[t])}</td>
              {data.profileResults.map((pr) => <td key={pr.name} className="num tab-num">{fmt(pr.sessionsAt[t])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BaremeLevelTable({ data, fromT, toT }) {
  const rows = [];
  for (let t = fromT; t <= toT; t++) rows.push(t);
  return (
    <div className="table-wrap">
      <table className="results">
        <thead>
          <tr>
            <th>Niveau</th><th>XP requis</th><th>XP cumulé</th>
            {data.baremeResults.map((br, i) => (
              <th key={i} className={`branch-${br.branch}`} title={`${br.name} — ${fmtUp(br.xp)} XP`}>{br.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t} className={t === toT ? 'final' : undefined}>
              <td className="num tab-num">{t + 1}</td>
              <td className="num tab-num">{fmt(data.cost[t])}</td>
              <td className="num tab-num">{fmt(data.cum[t])}</td>
              {data.baremeResults.map((br, i) => (
                <td key={i} className={`num tab-num branch-${br.branch}`}>{fmt(br.completionsAt[t])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- composant principal ----------

export default function XpCalibreur({ state, mutate, theme }) {
  const xp = state.xpCalibreur;

  const [total, setTotal] = useSyncedField(xp.total);
  const [levels, setLevels] = useSyncedField(xp.levels);
  const [total50, setTotal50] = useSyncedField(xp.total50);

  const data = useMemo(() => computeAll(xp), [xp]);
  const data50 = useMemo(() => computeExtendedTo50(xp), [xp]);

  const setField = (key, value) => mutate((s) => { s.xpCalibreur[key] = value; });
  const setCombatField = (key, value) => mutate((s) => { s.xpCalibreur.combat[key] = value; });

  const setBaremeField = (branchKey, idx, field, value) => mutate((s) => {
    s.xpCalibreur.bareme[branchKey][idx][field] = value;
  });

  const addBaremeItem = (branchKey) => mutate((s) => {
    const arr = s.xpCalibreur.bareme[branchKey];
    if (arr.length < 10) arr.push({ name: 'Nouveau type', xp: 1 });
  });

  const removeBaremeItem = (branchKey, idx) => mutate((s) => {
    const arr = s.xpCalibreur.bareme[branchKey];
    if (arr.length > 1) arr.splice(idx, 1);
  });

  const reorderBareme = (branchKey, from, to) => mutate((s) => {
    const arr = s.xpCalibreur.bareme[branchKey];
    const moved = arr.splice(from, 1)[0];
    arr.splice(to, 0, moved);
  });

  const addProfile = () => mutate((s) => {
    const p = s.xpCalibreur.profiles;
    if (p.length < 6) p.push({ name: `Profil ${p.length + 1}`, xp: 15 });
  });

  const removeProfile = (idx) => mutate((s) => {
    const p = s.xpCalibreur.profiles;
    if (p.length > 1) p.splice(idx, 1);
  });

  const setProfileField = (idx, field, value) => mutate((s) => {
    s.xpCalibreur.profiles[idx][field] = value;
  });

  const resetAll = () => {
    if (!window.confirm("Réinitialiser tous les réglages du calibreur ?")) return;
    mutate((s) => { s.xpCalibreur = deepClone(XP_DEFAULT_STATE); });
  };

  const ratio = useMemo(() => {
    const sums = BUDGET_BRANCHES.map((key) => branchXpSum(xp, key));
    const sumR = sums.reduce((a, b) => a + b, 0);
    let pcts;
    if (sumR > 0) {
      pcts = sums.map((v) => Math.round((v / sumR) * 100));
      const usedExceptLast = pcts.slice(0, -1).reduce((a, b) => a + b, 0);
      pcts[pcts.length - 1] = 100 - usedExceptLast;
    } else {
      pcts = BUDGET_BRANCHES.map(() => 0);
    }
    return { sums, pcts };
  }, [xp]);

  const cumTotal = data.cum[data.T];

  const rootProps = { className: 'xp-calibreur-root' };
  if (theme === 'light' || theme === 'dark') rootProps['data-theme'] = theme;

  return (
    <div {...rootProps}>
      <style>{XP_CALIBREUR_CSS}</style>

      <div className="wrap">
        <header className="top">
          <h1>Calibreur d'XP</h1>
          <p>
            Fixe un total d'XP pour le niveau 25, une forme de croissance et une répartition par branche :
            le calibreur découpe automatiquement la courbe, et estime le temps de jeu nécessaire selon
            différents rythmes de session.
          </p>
        </header>

        <section className="panel">
          <h2>Courbe &amp; budget total</h2>
          <p className="sub">Le total est réparti sur les niveaux selon la forme de croissance choisie — la somme des paliers retombe toujours exactement sur ce total.</p>
          <div className="curve-fields-stack">
            <div className="field">
              <label htmlFor="in-total">XP total (niveau 1 → niveau max)</label>
              <input
                type="number" id="in-total" min="1" step="1" value={total}
                onChange={(e) => { const v = Number(e.target.value) || 0; setTotal(v); setField('total', v); }}
              />
            </div>
            <div className="field">
              <label htmlFor="in-levels">Niveau maximum</label>
              <input
                type="number" id="in-levels" min="2" max="60" step="1" value={levels}
                onChange={(e) => { const v = Number(e.target.value) || 25; setLevels(v); setField('levels', v); }}
              />
            </div>
            <div className="field">
              <label htmlFor="in-total50">XP total visé — niveau 50</label>
              <input
                type="number" id="in-total50" min="1" step="1" value={total50}
                onChange={(e) => { const v = Number(e.target.value) || 0; setTotal50(v); setField('total50', v); }}
              />
              <p className="hint">Le niveau maximum sépare la progression des joueurs (1 → max) de la suite réservée aux PNJ de lore (max → 50, détaillée plus bas).</p>
            </div>
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="in-exp">Forme de croissance <span className="num exp-badge">{expLabel(Number(xp.exponent))}</span></label>
            <div className="exp-row">
              <span className="hint num">0.2</span>
              <input
                type="range" id="in-exp" min="0.2" max="3" step="0.1" value={xp.exponent}
                onChange={(e) => setField('exponent', Number(e.target.value))}
              />
              <span className="hint num">3.0</span>
            </div>
            <p className="hint">Plus bas = paliers presque égaux du début à la fin. Plus haut = les derniers niveaux coûtent bien plus cher que les premiers.</p>
          </div>
        </section>

        <section className="panel">
          <h2>Barème d'XP par type d'événement</h2>
          <p className="sub">
            Le détail concret de ce qui rapporte de l'XP dans chaque branche — types librement éditables,
            ajoute ou retire ce qu'il te faut, et fais glisser la poignée à gauche pour les réordonner.
            Chaque type affiche le nombre de complétions nécessaires pour boucler toute la courbe jusqu'au
            niveau maximum configuré ; la ligne "Total" en bas de chaque tableau additionne l'XP de tous
            les types de la branche et indique combien de fois il faudrait combiner un exemplaire de chacun
            pour boucler la courbe.
          </p>
          <div className="bareme-grid">
            <BaremeTable
              branchKey="trame" label={BRANCH_LABELS.trame} colorVar={BRANCH_VARS.trame}
              items={xp.bareme.trame} cumTotal={cumTotal}
              onChangeItem={(idx, field, value) => setBaremeField('trame', idx, field, value)}
              onAdd={() => addBaremeItem('trame')}
              onRemove={(idx) => removeBaremeItem('trame', idx)}
              onReorder={(from, to) => reorderBareme('trame', from, to)}
            />
            <BaremeTable
              branchKey="secondaire" label={BRANCH_LABELS.secondaire} colorVar={BRANCH_VARS.secondaire}
              items={xp.bareme.secondaire} cumTotal={cumTotal}
              onChangeItem={(idx, field, value) => setBaremeField('secondaire', idx, field, value)}
              onAdd={() => addBaremeItem('secondaire')}
              onRemove={(idx) => removeBaremeItem('secondaire', idx)}
              onReorder={(from, to) => reorderBareme('secondaire', from, to)}
              footnote="Objectifs et quêtes secondaires — au choix du MJ, en dehors de la trame principale."
            />
            <BaremeTable
              branchKey="exploration" label={BRANCH_LABELS.exploration} colorVar={BRANCH_VARS.exploration}
              items={xp.bareme.exploration} cumTotal={cumTotal}
              onChangeItem={(idx, field, value) => setBaremeField('exploration', idx, field, value)}
              onAdd={() => addBaremeItem('exploration')}
              onRemove={(idx) => removeBaremeItem('exploration', idx)}
              onReorder={(from, to) => reorderBareme('exploration', from, to)}
            />
            <BaremeTable
              branchKey="combat" label={BRANCH_LABELS.combat} colorVar={BRANCH_VARS.combat}
              items={xp.bareme.combat} cumTotal={cumTotal}
              onChangeItem={(idx, field, value) => setBaremeField('combat', idx, field, value)}
              onAdd={() => addBaremeItem('combat')}
              onRemove={(idx) => removeBaremeItem('combat', idx)}
              onReorder={(from, to) => reorderBareme('combat', from, to)}
              extra={<CombatCalcFrame combat={xp.combat} onChangeField={setCombatField} />}
            />
            <BaremeTable
              branchKey="speciale" label={BRANCH_LABELS.speciale} colorVar={BRANCH_VARS.speciale}
              items={xp.bareme.speciale} cumTotal={cumTotal}
              onChangeItem={(idx, field, value) => setBaremeField('speciale', idx, field, value)}
              onAdd={() => addBaremeItem('speciale')}
              onRemove={(idx) => removeBaremeItem('speciale', idx)}
              onReorder={(from, to) => reorderBareme('speciale', from, to)}
            />
          </div>
        </section>

        <section className="panel">
          <h2>Complétions de barème par niveau</h2>
          <p className="sub">
            Pour chaque type du barème ci-dessus, combien de complétions il faut pour passer d'un niveau au
            suivant. Le premier tableau va du niveau 1 au niveau maximum configuré ; le second reprend à
            partir de ce niveau maximum jusqu'au niveau 50.
          </p>
          <div className="bareme-group-title">Niveau 1 → {data.levels}</div>
          <BaremeLevelTable data={data} fromT={1} toT={data.T} />
          <div className="bareme-group-title" style={{ marginTop: 20 }}>Niveau {data.levels} → 50</div>
          {data50 ? (
            <BaremeLevelTable data={data50} fromT={data.T + 1} toT={49} />
          ) : (
            <p className="hint">Le niveau maximum configuré ci-dessus ({data.levels}) atteint déjà le niveau 50 — pas de suite à afficher.</p>
          )}
        </section>

        <section className="panel">
          <h2>Répartition par branche</h2>
          <p className="sub">
            Calculée automatiquement à partir du barème ci-dessus : plus les types d'une branche pèsent
            lourd en XP, plus cette branche prend une part importante du budget total. La branche Spéciale
            reste un bonus à part, hors de ce calcul.
          </p>
          <div className="ratio-row">
            {BUDGET_BRANCHES.map((key, i) => (
              <div className="field ratio-field" key={key}>
                <label><span className="ratio-swatch" style={{ background: `var(${BRANCH_VARS[key]})` }}></span>{BRANCH_LABELS[key]}</label>
                <div className="ratio-auto-box">
                  <span className="ratio-auto-pct num tab-num">{ratio.pcts[i]}%</span>
                  <span className="ratio-auto-sub">{fmt(ratio.sums[i])} XP de barème</span>
                </div>
              </div>
            ))}
          </div>
          <div className="actions-row">
            <span className="badge-speciale">Spéciale — bonus brut, hors budget</span>
          </div>
        </section>

        <section className="panel">
          <h2>Profils de rythme</h2>
          <p className="sub">Chaque profil = un rythme de jeu, exprimé en XP moyen gagné par session. Ajoute, renomme ou supprime des profils librement.</p>
          <div className="profiles-list">
            {xp.profiles.map((p, idx) => (
              <ProfileRow key={idx} p={p} idx={idx} setProfileField={setProfileField} removeProfile={removeProfile} disabled={xp.profiles.length <= 1} />
            ))}
          </div>
          <div className="actions-row">
            <button className="btn small" onClick={addProfile} disabled={xp.profiles.length >= 6}>+ Ajouter un profil</button>
            <button className="btn small ghost" onClick={resetAll}>Réinitialiser tout le calibreur</button>
          </div>
        </section>

        <section className="stat-tiles">
          {data.profileResults.map((pr) => {
            const yearsUp = Math.ceil(pr.years);
            const yearsTxt = pr.years >= 1 ? `${fmtUp(pr.years)} an${yearsUp > 1 ? 's' : ''}` : `${Math.ceil(pr.years * 12)} mois`;
            return (
              <div className="stat-tile" key={pr.name} style={{ '--tile-color': pr.color }}>
                <div className="label">{pr.name}</div>
                <div className="value num tab-num">{fmt(pr.totalSessions)} sessions</div>
                <div className="sub">≈ {yearsTxt} · {fmtUp(pr.xp)} XP / session</div>
              </div>
            );
          })}
        </section>

        <section className="panel">
          <h2>Composition de la courbe par branche</h2>
          <p className="sub">Coût XP de chaque palier, empilé par branche. Survole une barre pour le détail.</p>
          <div className="legend">
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--branch-trame)' }}></span>Trame</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--branch-secondaire)' }}></span>Secondaire</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--branch-exploration)' }}></span>Exploration</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--branch-combat)' }}></span>Combat</span>
          </div>
          <BranchChart data={data} />
        </section>

        <section className="panel">
          <h2>Progression niveau par niveau</h2>
          <p className="sub">XP requis et cumulé par palier, détail par branche, et session estimée d'obtention par profil de rythme.</p>
          <ProgressionTable data={data} />
        </section>

        <section className="panel">
          <h2>Projection jusqu'au niveau 50</h2>
          <p className="sub">
            Au-delà du niveau maximum configuré dans "Courbe &amp; budget total" plus haut, mêmes ratios de
            branche, mêmes profils et barème — le total d'XP visé au niveau 50 (réglable là-haut) est réparti
            sur ce segment selon la même forme de croissance.
          </p>
          {!data50 ? (
            <p className="hint">Le niveau maximum configuré ci-dessus ({data.levels}) atteint déjà le niveau 50 — pas de prolongement à afficher.</p>
          ) : (
            <div>
              <div className="stat-tiles" style={{ marginBottom: 16 }}>
                <div className="stat-tile">
                  <div className="label">XP total — niveau 50</div>
                  <div className="value num tab-num">{fmt(data50.total)} XP</div>
                  <div className="sub">fixé manuellement</div>
                </div>
              </div>
              <div className="legend">
                <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--branch-trame)' }}></span>Trame</span>
                <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--branch-secondaire)' }}></span>Secondaire</span>
                <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--branch-exploration)' }}></span>Exploration</span>
                <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--branch-combat)' }}></span>Combat</span>
              </div>
              <BranchChart data={data50} />
              <div style={{ marginTop: 16 }}>
                <ProgressionTable data={data50} />
              </div>
            </div>
          )}
        </section>

        <footer className="note">Tout est recalculé en direct et partagé entre les deux MJ.</footer>
      </div>
    </div>
  );
}

function ProfileRow({ p, idx, setProfileField, removeProfile, disabled }) {
  const [name, setName] = useSyncedField(p.name);
  const [xpVal, setXpVal] = useSyncedField(p.xp);
  return (
    <div className="profile-row">
      <div className="profile-name-wrap">
        <span className="profile-swatch" style={{ background: PROFILE_COLORS[idx % PROFILE_COLORS.length] }}></span>
        <input
          type="text" value={name} aria-label={`Nom du profil ${idx + 1}`}
          onChange={(e) => { const v = e.target.value; setName(v); setProfileField(idx, 'name', v); }}
        />
      </div>
      <input
        type="number" min="0.1" step="0.5" value={xpVal} aria-label={`XP moyen par session pour ${p.name}`}
        onChange={(e) => { const v = Number(e.target.value) || 0; setXpVal(v); setProfileField(idx, 'xp', v); }}
      />
      <button className="btn small ghost" disabled={disabled} onClick={() => removeProfile(idx)}>Retirer</button>
    </div>
  );
}
