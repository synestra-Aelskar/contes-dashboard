import { useCallback, useMemo, useRef, useState } from 'react';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { BUDGET_BRANCHES, BRANCH_ORDER, XP_DEFAULT_STATE } from '../../lib/xpCalibreur.js';

/**
 * Calibreur d'XP — courbe de progression, barème par branche (glisser-déposer),
 * profils de rythme, calculateur de combat, graphiques. Contenu partagé
 * (state.xpCalibreur), synchronisé en temps réel comme le reste du tableau
 * de bord : chaque champ texte/numérique utilise le motif « brouillon local
 * + patch immédiat » pour rester réactif pendant la frappe.
 *
 * Même architecture visuelle que l'Équilibrage DD (voir Equilibrage.jsx et
 * les classes .xp-* / .dd-* de styles.css) : pas de style isolé ici, tout
 * passe par les jetons partagés du tableau de bord (--kind-xp, --surface,
 * --rule, --f-display/--f-mono…).
 */

const BRANCH_LABELS = { trame: 'Trame', secondaire: 'Secondaire', exploration: 'Exploration', combat: 'Combat', speciale: 'Spéciale' };
// Chaque branche emprunte un jeton de couleur déjà utilisé ailleurs dans le
// tableau de bord, pour rester cohérente avec la palette (et s'adapter au
// thème sombre gratuitement) plutôt que d'inventer de nouvelles teintes.
const BRANCH_VARS = {
  trame: '--kind-xp',
  secondaire: '--kind-oubli',
  exploration: '--kind-zone',
  combat: '--blood',
  speciale: '--kind-secret'
};
const PROFILE_COLOR_VARS = ['--kind-tools', '--kind-music', '--kind-data', '--kind-wip', '--kind-clock', '--kind-epreuve'];

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
      colorVar: PROFILE_COLOR_VARS[idx % PROFILE_COLOR_VARS.length]
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
          className="xp-grip"
          title="Glisser pour réordonner"
          aria-label={`Réordonner ${item.name}`}
          {...dragHandlers}
        >⠿</span>
      </td>
      <td>
        <input
          className="finput" type="text"
          value={name}
          aria-label={`Type d'événement (${branchKey})`}
          onChange={(e) => { const v = e.target.value; setName(v); onChangeItem(idx, 'name', v); }}
        />
      </td>
      <td>
        <input
          className="finput finput--num" type="number"
          min="0" step="1"
          value={xp}
          aria-label={`XP par complétion pour ${item.name}`}
          onChange={(e) => { const v = Number(e.target.value) || 0; setXp(v); onChangeItem(idx, 'xp', v); }}
        />
      </td>
      <td className="num tab-num" title={`${fmt(totalCompletions)} complétions au total`}>
        {fmt(totalCompletions)}
      </td>
      <td>
        <button className="tbtn" type="button" aria-label={`Retirer ${item.name}`} disabled={disabled} onClick={() => onRemove(idx)}>✕</button>
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
      if (r) r.classList.remove('drop-before', 'drop-after');
    });
  }, []);

  const onGripPointerDown = (idx) => (ev) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    ev.preventDefault();
    dragRef.current = { pointerId: ev.pointerId, startIndex: idx, overIndex: idx, before: true };
    const row = rowRefs.current[idx];
    if (row) row.classList.add('is-dragging');
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
    if (target && target !== draggedRow) target.classList.add(before ? 'drop-before' : 'drop-after');
  };

  const endDrag = (idx) => (ev) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== ev.pointerId) return;
    clearIndicators();
    const row = rowRefs.current[drag.startIndex];
    if (row) row.classList.remove('is-dragging');
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
    <div className="xp-bareme-group">
      <div className="xp-bareme-title">
        <span className="xp-swatch" style={{ background: `var(${colorVar})` }}></span>{label}
      </div>
      <div className="xp-table-wrap">
        <table className="xp-table xp-bareme-table">
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
                className="num tab-num"
                title={totalCompl != null ? `${fmt(totalCompl)} fois l'ensemble des types ci-dessus combinés (${fmt(sumXp)} XP) pour boucler toute la courbe` : ''}
              >
                {totalCompl != null ? fmt(totalCompl) : '–'}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button className="tbtn" type="button" onClick={onAdd} disabled={items.length >= 10} style={{ marginTop: 8 }}>+ Ajouter un type</button>
      {footnote ? <p className="xp-hint" style={{ marginTop: 8 }}>{footnote}</p> : null}
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
    <div className="xp-combat-frame" style={{ marginTop: 12 }}>
      <div className="xp-combat-title">Référence — calculateur de combat</div>
      <p className="xp-hint">
        Le mob « supérieur » suit une formule à part (base + écart^exposant) : teste un écart de niveau,
        une constante et un exposant pour voir l'XP que ça donnerait, et compare avec le tableau de référence.
      </p>
      <div className="xp-combat">
        <div>
          <div className="xp-fieldgrid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="flabel xp-field" htmlFor="in-cb-e">
              Écart de niveau (E)
              <input
                className="finput finput--num" type="number" id="in-cb-e" min="0" max="30" step="1" value={E}
                onChange={(e) => { const v = Number(e.target.value) || 0; setE(v); onChangeField('E', v); }}
              />
            </label>
            <label className="flabel xp-field" htmlFor="in-cb-mode">
              Mode
              <select className="finput" id="in-cb-mode" value={combat.mode} onChange={(e) => onChangeField('mode', e.target.value)}>
                <option value="solo">Solo</option>
                <option value="groupe">Groupe (÷2)</option>
              </select>
            </label>
            <label className="flabel xp-field" htmlFor="in-cb-base">
              Constante de base
              <input
                className="finput finput--num" type="number" id="in-cb-base" min="0" step="1" value={base}
                onChange={(e) => { const v = Number(e.target.value) || 0; setBase(v); onChangeField('base', v); }}
              />
            </label>
            <label className="flabel xp-field" htmlFor="in-cb-exp">
              Exposant
              <input
                className="finput finput--num" type="number" id="in-cb-exp" min="1" max="4" step="1" value={exp}
                onChange={(e) => { const v = Number(e.target.value) || 0; setExp(v); onChangeField('exp', v); }}
              />
            </label>
          </div>
          <div className="xp-combat-out">
            <p className="xp-hint" style={{ marginBottom: 2 }}>XP pour ce mob « supérieur »</p>
            <div className="xp-combat-big num tab-num">{fmtUp(out)}</div>
          </div>
        </div>
        <div className="xp-table-wrap">
          <table className="xp-table">
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
  const axisTextStyle = { fill: 'var(--fg-dim)', fontFamily: 'var(--f-mono)' };

  function showTip(t, evt) {
    if (!holderRef.current) return;
    const rect = holderRef.current.getBoundingClientRect();
    setTooltip({ t, left: evt.clientX - rect.left, top: evt.clientY - rect.top });
  }

  const bars = [];
  for (let t = 1; t <= T; t++) {
    const x0 = marginLeft + (t - 1) * (barW + gap);
    const order = [
      { key: 'trame', val: data.branchCost.trame[t], v: BRANCH_VARS.trame },
      { key: 'secondaire', val: data.branchCost.secondaire[t], v: BRANCH_VARS.secondaire },
      { key: 'exploration', val: data.branchCost.exploration[t], v: BRANCH_VARS.exploration },
      { key: 'combat', val: data.branchCost.combat[t], v: BRANCH_VARS.combat }
    ];
    let yCursor = baseY;
    order.forEach((seg, i) => {
      const h = (seg.val / niceMax) * drawH;
      if (h > 0.15) {
        bars.push(<rect key={`${t}-${seg.key}`} x={x0} y={yCursor - h} width={barW} height={h} style={{ fill: `var(${seg.v})` }} rx="2" />);
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
        <text key={`${t}-lbl`} x={x0 + barW / 2} y={marginTop + drawH + 18} textAnchor="middle" fontSize="10" style={axisTextStyle}>
          {t + 1}
        </text>
      );
    }
  }

  return (
    <div className="xp-scroll">
      <div className="xp-chart-holder" ref={holderRef}>
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} role="img" aria-label="Coût XP par palier, réparti par branche">
          {ticks.map((tv) => (
            <g key={`grid-${tv}`}>
              <line x1={marginLeft} y1={yFor(tv)} x2={marginLeft + drawW} y2={yFor(tv)} stroke="var(--rule)" strokeWidth="1" />
              <text x={marginLeft - 8} y={yFor(tv) + 3} textAnchor="end" fontSize="10.5" style={axisTextStyle}>{fmt(tv)}</text>
            </g>
          ))}
          <line x1={marginLeft} y1={baseY} x2={marginLeft + drawW} y2={baseY} stroke="var(--rule)" strokeWidth="1" />
          {bars}
        </svg>
        {tooltip ? (
          <div
            className="xp-chart-tip"
            style={{ left: tooltip.left, top: tooltip.top, transform: 'translate(-50%, calc(-100% - 10px))' }}
          >
            <div className="tt-title">Niveau {tooltip.t} → {tooltip.t + 1} · {fmt(data.cost[tooltip.t])} XP</div>
            <div className="row"><span className="dot" style={{ background: `var(${BRANCH_VARS.trame})` }}></span>Trame {fmt(data.branchCost.trame[tooltip.t])}</div>
            <div className="row"><span className="dot" style={{ background: `var(${BRANCH_VARS.secondaire})` }}></span>Secondaire {fmt(data.branchCost.secondaire[tooltip.t])}</div>
            <div className="row"><span className="dot" style={{ background: `var(${BRANCH_VARS.exploration})` }}></span>Exploration {fmt(data.branchCost.exploration[tooltip.t])}</div>
            <div className="row"><span className="dot" style={{ background: `var(${BRANCH_VARS.combat})` }}></span>Combat {fmt(data.branchCost.combat[tooltip.t])}</div>
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
    <div className="xp-table-wrap">
      <table className="xp-table">
        <thead>
          <tr>
            <th>Niveau</th><th>XP requis</th><th>XP cumulé</th>
            <th className="xp-branch-trame">Trame</th>
            <th className="xp-branch-secondaire">Secondaire</th>
            <th className="xp-branch-exploration">Exploration</th>
            <th className="xp-branch-combat">Combat</th>
            {data.profileResults.map((pr) => <th key={pr.name}>{pr.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t} className={t === data.T ? 'final' : undefined}>
              <td className="num tab-num">{t + 1}</td>
              <td className="num tab-num">{fmt(data.cost[t])}</td>
              <td className="num tab-num">{fmt(data.cum[t])}</td>
              <td className="num tab-num xp-branch-trame">{fmt(data.branchCum.trame[t])}</td>
              <td className="num tab-num xp-branch-secondaire">{fmt(data.branchCum.secondaire[t])}</td>
              <td className="num tab-num xp-branch-exploration">{fmt(data.branchCum.exploration[t])}</td>
              <td className="num tab-num xp-branch-combat">{fmt(data.branchCum.combat[t])}</td>
              {data.profileResults.map((pr) => <td key={pr.name} className="num tab-num">{fmt(pr.sessionsAt[t])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BaremeLevelTable({ data, fromT, toT, capped }) {
  const rows = [];
  for (let t = fromT; t <= toT; t++) rows.push(t);
  return (
    <div className={'xp-table-wrap' + (capped ? ' xp-table-wrap--capped' : '')}>
      <table className="xp-table">
        <thead>
          <tr>
            <th>Niveau</th><th>XP requis</th><th>XP cumulé</th>
            {data.baremeResults.map((br, i) => (
              <th key={i} className={`xp-branch-${br.branch}`} title={`${br.name} — ${fmtUp(br.xp)} XP`}>{br.name}</th>
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
                <td key={i} className={`num tab-num xp-branch-${br.branch}`}>{fmt(br.completionsAt[t])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfileRow({ p, idx, setProfileField, removeProfile, disabled }) {
  const [name, setName] = useSyncedField(p.name);
  const [xpVal, setXpVal] = useSyncedField(p.xp);
  return (
    <div className="xp-profile-row">
      <div className="xp-profile-name">
        <span className="xp-profile-swatch" style={{ background: `var(${PROFILE_COLOR_VARS[idx % PROFILE_COLOR_VARS.length]})` }}></span>
        <input
          className="finput" type="text" value={name} aria-label={`Nom du profil ${idx + 1}`}
          onChange={(e) => { const v = e.target.value; setName(v); setProfileField(idx, 'name', v); }}
        />
      </div>
      <input
        className="finput finput--num" type="number" min="0.1" step="0.5" value={xpVal} aria-label={`XP moyen par session pour ${p.name}`}
        onChange={(e) => { const v = Number(e.target.value) || 0; setXpVal(v); setProfileField(idx, 'xp', v); }}
      />
      <button className="tbtn" disabled={disabled} onClick={() => removeProfile(idx)}>Retirer</button>
    </div>
  );
}

// ---------- composant principal ----------

export default function XpCalibreur({ state, mutate }) {
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

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Calibreur d'XP</h2>
        <span className="xp-sub">
          Total d'XP, forme de croissance et barème par branche : la courbe est découpée automatiquement,
          et le temps de jeu nécessaire estimé selon différents rythmes de session.
        </span>
      </div>

      <div className="xp-grid">
        <section className="xp-card xp-span-2">
          <h3 className="xp-h2">Courbe &amp; budget total</h3>
          <p className="xp-cardsub">Le total est réparti sur les niveaux selon la forme de croissance choisie — la somme des paliers retombe toujours exactement sur ce total.</p>
          <div className="xp-fieldgrid">
            <label className="flabel xp-field" htmlFor="in-total">
              XP total (niveau 1 → niveau max)
              <input
                className="finput finput--num" type="number" id="in-total" min="1" step="1" value={total}
                onChange={(e) => { const v = Number(e.target.value) || 0; setTotal(v); setField('total', v); }}
              />
            </label>
            <label className="flabel xp-field" htmlFor="in-levels">
              Niveau maximum
              <input
                className="finput finput--num" type="number" id="in-levels" min="2" max="60" step="1" value={levels}
                onChange={(e) => { const v = Number(e.target.value) || 25; setLevels(v); setField('levels', v); }}
              />
            </label>
            <label className="flabel xp-field" htmlFor="in-total50">
              XP total visé — niveau 50
              <input
                className="finput finput--num" type="number" id="in-total50" min="1" step="1" value={total50}
                onChange={(e) => { const v = Number(e.target.value) || 0; setTotal50(v); setField('total50', v); }}
              />
            </label>
          </div>
          <p className="xp-hint">Le niveau maximum sépare la progression des joueurs (1 → max) de la suite réservée aux PNJ de lore (max → 50, détaillée plus bas).</p>

          <label className="flabel xp-field" htmlFor="in-exp" style={{ marginTop: 14 }}>
            <span className="xp-labelrow">
              <span>Forme de croissance</span>
              <span className="xp-pill xp-pill--mid">{expLabel(Number(xp.exponent))}</span>
            </span>
            <div className="xp-exp-row">
              <span className="xp-hint num" style={{ margin: 0 }}>0.2</span>
              <input
                type="range" id="in-exp" min="0.2" max="3" step="0.1" value={xp.exponent}
                onChange={(e) => setField('exponent', Number(e.target.value))}
              />
              <span className="xp-hint num" style={{ margin: 0 }}>3.0</span>
            </div>
            <p className="xp-hint">Plus bas = paliers presque égaux du début à la fin. Plus haut = les derniers niveaux coûtent bien plus cher que les premiers.</p>
          </label>
        </section>

        <section className="xp-card xp-span-4 xp-rowspan-4">
          <h3 className="xp-h2">Barème d'XP par type d'événement</h3>
          <p className="xp-cardsub">
            Le détail concret de ce qui rapporte de l'XP dans chaque branche — types librement éditables,
            ajoute ou retire ce qu'il te faut, et fais glisser la poignée à gauche pour les réordonner.
            Chaque type affiche le nombre de complétions nécessaires pour boucler toute la courbe jusqu'au
            niveau maximum configuré ; la ligne « Total » en bas de chaque tableau additionne l'XP de tous
            les types de la branche et indique combien de fois il faudrait combiner un exemplaire de chacun
            pour boucler la courbe.
          </p>
          <div className="xp-bareme-grid">
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

        <section className="xp-card xp-span-2">
          <h3 className="xp-h2">Répartition par branche</h3>
          <p className="xp-cardsub">
            Calculée automatiquement à partir du barème ci-contre : plus les types d'une branche pèsent
            lourd en XP, plus cette branche prend une part importante du budget total. La branche Spéciale
            reste un bonus à part, hors de ce calcul.
          </p>
          <div className="xp-fieldgrid" style={{ gridTemplateColumns: '1fr' }}>
            {BUDGET_BRANCHES.map((key, i) => (
              <div className="xp-field" key={key}>
                <span className="xp-labelrow">
                  <span><span className="xp-swatch" style={{ background: `var(${BRANCH_VARS[key]})` }}></span>{BRANCH_LABELS[key]}</span>
                  <span className="xp-val">{ratio.pcts[i]}%</span>
                </span>
                <div className="xp-meter"><i style={{ width: ratio.pcts[i] + '%', background: `var(${BRANCH_VARS[key]})` }} /></div>
                <span className="xp-hint" style={{ margin: 0 }}>{fmt(ratio.sums[i])} XP de barème</span>
              </div>
            ))}
          </div>
          <div className="xp-actions">
            <span className="xp-pill" style={{ color: `var(${BRANCH_VARS.speciale})`, borderColor: `var(${BRANCH_VARS.speciale})` }}>
              Spéciale — bonus brut, hors budget
            </span>
          </div>
        </section>

        <section className="xp-card xp-span-2">
          <h3 className="xp-h2">Profils de rythme</h3>
          <p className="xp-cardsub">Chaque profil = un rythme de jeu, exprimé en XP moyen gagné par session. Ajoute, renomme ou supprime des profils librement.</p>
          <div className="xp-profiles">
            {xp.profiles.map((p, idx) => (
              <ProfileRow key={idx} p={p} idx={idx} setProfileField={setProfileField} removeProfile={removeProfile} disabled={xp.profiles.length <= 1} />
            ))}
          </div>
          <div className="xp-actions">
            <button className="tbtn" onClick={addProfile} disabled={xp.profiles.length >= 6}>+ Ajouter un profil</button>
            <button className="tbtn" onClick={resetAll}>Réinitialiser tout le calibreur</button>
          </div>
        </section>

        <section className="xp-card xp-span-2">
          <h3 className="xp-h2">Sessions estimées par profil</h3>
          <div className="xp-tiles" style={{ marginTop: 6, gridTemplateColumns: '1fr' }}>
            {data.profileResults.map((pr) => {
              const yearsUp = Math.ceil(pr.years);
              const yearsTxt = pr.years >= 1 ? `${fmtUp(pr.years)} an${yearsUp > 1 ? 's' : ''}` : `${Math.ceil(pr.years * 12)} mois`;
              return (
                <div className="xp-tile" key={pr.name} style={{ '--tile-color': `var(${pr.colorVar})` }}>
                  <div className="xp-tile-label">{pr.name}</div>
                  <div className="xp-tile-value num tab-num">{fmt(pr.totalSessions)} sessions</div>
                  <div className="xp-tile-sub">≈ {yearsTxt} · {fmtUp(pr.xp)} XP / session</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="xp-card xp-span-6">
          <h3 className="xp-h2">Complétions de barème par niveau</h3>
          <p className="xp-cardsub" style={{ marginBottom: 0 }}>
            Pour chaque type du barème ci-dessus, combien de complétions il faut pour passer d'un niveau au
            suivant. Le premier tableau va du niveau 1 au niveau maximum configuré ; le second reprend à
            partir de ce niveau maximum jusqu'au niveau 50.
          </p>
        </section>

        <section className="xp-card xp-span-3">
          <p className="xp-subhead">Niveau 1 → {data.levels}</p>
          <BaremeLevelTable data={data} fromT={1} toT={data.T} capped />
        </section>

        <section className="xp-card xp-span-3">
          <p className="xp-subhead">Niveau {data.levels} → 50</p>
          {data50 ? (
            <BaremeLevelTable data={data50} fromT={data.T + 1} toT={49} capped />
          ) : (
            <p className="xp-hint">Le niveau maximum configuré ci-dessus ({data.levels}) atteint déjà le niveau 50 — pas de suite à afficher.</p>
          )}
        </section>

        <section className="xp-card xp-span-6">
          <h3 className="xp-h2">Projection jusqu'au niveau 50</h3>
          <p className="xp-cardsub">
            Coût XP de chaque palier, détail par branche, et session estimée d'obtention par profil de
            rythme — du niveau 1 au niveau maximum configuré dans « Courbe &amp; budget total » plus haut,
            prolongé jusqu'au niveau 50 (même barème, même forme de croissance, XP total visé réglable là-haut).
          </p>
          {data50 ? (
            <div className="xp-tiles" style={{ marginBottom: 16 }}>
              <div className="xp-tile">
                <div className="xp-tile-label">XP total — niveau 50</div>
                <div className="xp-tile-value num tab-num">{fmt(data50.total)} XP</div>
                <div className="xp-tile-sub">fixé manuellement</div>
              </div>
            </div>
          ) : (
            <p className="xp-hint">Le niveau maximum configuré ci-dessus ({data.levels}) atteint déjà le niveau 50 — pas de prolongement, la courbe s'arrête là.</p>
          )}
          <div className="xp-legend">
            <span className="xp-legend-item"><span className="xp-swatch" style={{ background: `var(${BRANCH_VARS.trame})` }}></span>Trame</span>
            <span className="xp-legend-item"><span className="xp-swatch" style={{ background: `var(${BRANCH_VARS.secondaire})` }}></span>Secondaire</span>
            <span className="xp-legend-item"><span className="xp-swatch" style={{ background: `var(${BRANCH_VARS.exploration})` }}></span>Exploration</span>
            <span className="xp-legend-item"><span className="xp-swatch" style={{ background: `var(${BRANCH_VARS.combat})` }}></span>Combat</span>
          </div>
          <BranchChart data={data50 || data} />
          <div style={{ marginTop: 16 }}>
            <ProgressionTable data={data50 || data} />
          </div>
        </section>
      </div>
    </section>
  );
}
