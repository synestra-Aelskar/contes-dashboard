import { useCallback, useMemo, useRef, useState } from 'react';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { BUDGET_BRANCHES, BRANCH_ORDER, XP_DEFAULT_STATE } from '../../lib/xpCalibreur.js';

/**
 * Calibreur d'XP — calibrage par DURÉES CIBLES : on renseigne le niveau de
 * départ, le niveau maximal, le rythme de sessions par an, l'XP moyenne de
 * référence pour la première période et une liste de jalons (niveau cible +
 * session cumulée depuis le départ). Le budget d'XP de chaque montée de
 * niveau, le budget total et l'XP moyenne à distribuer par période sont des
 * RÉSULTATS du calcul, pas des entrées — voir computeCampaignCurve plus bas
 * pour le détail des formules (w(n) = n^exponent, coefficient K calibré sur
 * la seule première période puis appliqué tel quel à toute la courbe).
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
// Affichage à une décimale — les sessions fractionnaires sont conservées en
// calcul (voir section 7 du cahier des charges), seul l'affichage arrondit.
function fmt1(n) {
  if (!isFinite(n)) return '–';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
  // Exploration / Combat). Spéciale reste hors de ce calcul. NB (cahier des
  // charges §5) : cette somme pondère par les valeurs unitaires, pas par
  // leur fréquence réelle en jeu — voir le caveat affiché dans la carte
  // « Répartition par branche ».
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

  // Profils = SIMULATIONS (cahier des charges §6) : lues sur les seuils déjà
  // calculés (cum[]), jamais recalibrées pour chaque profil.
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

// Courbe de campagne calibrée par durées cibles (cahier des charges §1-3).
//
// w(n)  = poids positif de la montée du niveau n vers n+1 = n^exponent
// K     = coefficient unique, calibré UNIQUEMENT sur la première période :
//         K = budgetReference / somme(w(n), n = startLevel..premierJalon-1)
//         avec budgetReference = sessionsPériode1 × refXpPerSession
// cout(n) = K × w(n), appliqué tel quel jusqu'au niveau maximal (et au-delà
//           pour la suite PNJ jusqu'au niveau 50, séparément, sans jamais
//           recalibrer K) — aucune période n'est renormalisée sur son propre
//           budget, aucun jalon ne remet la courbe à zéro.
function computeCampaignCurve(xp) {
  const startLevel = clamp(Math.round(Number(xp.startLevel) || 5), 1, 58);
  const maxLevel = clamp(Math.round(Number(xp.levels) || 25), startLevel + 1, 60);
  const exponent = clamp(Number(xp.exponent) || 1, 0.1, 4);
  const sessionsPerYear = Math.max(1, Number(xp.sessionsPerYear) || 48);
  const refRate = Math.max(0.01, Number(xp.refXpPerSession) || 250);

  const capLevel = Math.max(maxLevel, 50);
  const T = maxLevel - startLevel;
  const Tcap = capLevel - startLevel;

  // w[t] = poids de la montée du niveau (startLevel+t-1) vers (startLevel+t)
  const w = new Array(Tcap + 1).fill(0);
  for (let t = 1; t <= Tcap; t++) w[t] = Math.pow(startLevel + t - 1, exponent);
  const prefix = new Array(Tcap + 1).fill(0);
  for (let t = 1; t <= Tcap; t++) prefix[t] = prefix[t - 1] + w[t];

  const rawJalons = (xp.jalons && xp.jalons.length) ? xp.jalons : [{ targetLevel: maxLevel, cumSessions: sessionsPerYear }];
  const jalons = rawJalons.map((j) => ({
    targetLevel: clamp(Math.round(Number(j.targetLevel) || (startLevel + 1)), startLevel + 1, maxLevel),
    cumSessions: Math.max(0, Number(j.cumSessions) || 0)
  }));
  jalons.sort((a, b) => a.targetLevel - b.targetLevel);
  jalons[jalons.length - 1].targetLevel = maxLevel; // invariant §7 : dernier jalon = niveau maximal

  const firstT = jalons[0].targetLevel - startLevel;
  const period1Sessions = Math.max(1, jalons[0].cumSessions || sessionsPerYear);
  const budgetReference = period1Sessions * refRate;
  const sumW1 = prefix[firstT] || 1;
  const K = budgetReference / sumW1;

  const cum = new Array(Tcap + 1).fill(0);
  for (let t = 1; t <= Tcap; t++) cum[t] = Math.round(K * prefix[t]);
  cum[firstT] = Math.round(budgetReference); // garantit l'exactitude de la 1ère période malgré les arrondis

  const cost = new Array(Tcap + 1).fill(0);
  for (let t = 1; t <= Tcap; t++) cost[t] = Math.max(0, cum[t] - cum[t - 1]);

  let prevT = 0, prevSessions = 0;
  const periods = jalons.map((j, i) => {
    const tCur = j.targetLevel - startLevel;
    const sessions = Math.max(1, j.cumSessions - prevSessions);
    const budget = cum[tCur] - cum[prevT];
    const avgRate = budget / sessions;
    const multiplier = refRate > 0 ? avgRate / refRate : 0;
    const period = {
      idx: i, fromLevel: startLevel + prevT, toLevel: j.targetLevel,
      fromT: prevT, toT: tCur,
      fromSession: prevSessions, toSession: j.cumSessions,
      sessions, budget, avgRate, multiplier
    };
    prevT = tCur; prevSessions = j.cumSessions;
    return period;
  });

  const periodForT = new Array(Tcap + 1).fill(null);
  periods.forEach((p) => {
    for (let t = p.fromT + 1; t <= p.toT; t++) periodForT[t] = p;
  });

  return {
    startLevel, maxLevel, capLevel, T, Tcap, exponent, sessionsPerYear, refRate,
    jalons, periods, periodForT, K, cost, cum,
    total: cum[T],
    total50: capLevel > maxLevel ? cum[Tcap] : null
  };
}

// Tableau niveau par niveau (cahier des charges §4) : XP depuis le
// précédent, XP cumulée, sessions estimées pour cette montée, session
// cumulée estimée d'obtention, durée équivalente en années. Moyenne d'XP
// constante à l'intérieur de chaque période (les coûts, eux, restent issus
// de la courbe globale) ; au-delà du dernier jalon (suite PNJ), pas de
// notion de session.
function buildLevelSchedule(curve, fromT, toT) {
  const rows = [];
  for (let t = fromT; t <= toT; t++) {
    const period = curve.periodForT[t];
    let sessionsForThisLevel = null, sessionCum = null, years = null;
    if (period) {
      sessionsForThisLevel = curve.cost[t] / period.avgRate;
      sessionCum = period.fromSession + (curve.cum[t] - curve.cum[period.fromT]) / period.avgRate;
      years = sessionCum / curve.sessionsPerYear;
    }
    rows.push({
      level: curve.startLevel + t,
      cost: curve.cost[t],
      cum: curve.cum[t],
      sessionsForThisLevel, sessionCum, years,
      isFinal: t === toT
    });
  }
  return rows;
}

// Barème ajusté par période (cahier des charges §5) : les valeurs saisies
// restent la référence de la première période, jamais écrasées ; chaque
// période suivante affiche juste un aperçu = référence × multiplicateur.
function computeBaremeAdjustedPreview(xp) {
  return BRANCH_ORDER.map((key) => ({
    key,
    label: BRANCH_LABELS[key],
    colorVar: BRANCH_VARS[key],
    items: (xp.bareme && xp.bareme[key] || []).map((it) => ({
      name: it.name || 'Type',
      referenceXp: Math.max(0.01, Number(it.xp) || 0.01)
    }))
  }));
}

// XP attendue à un nombre de sessions cumulées donné, en interpolant
// linéairement (rythme constant) à l'intérieur de la période concernée —
// pour le suivi réel optionnel (§6). Au-delà du plan, extrapole avec le
// rythme de la dernière période.
function expectedXpAtSession(curve, sessionCount) {
  const S = Math.max(0, Number(sessionCount) || 0);
  const periods = curve.periods;
  let period = periods.find((p) => S <= p.toSession);
  if (!period) period = periods[periods.length - 1];
  const within = Math.max(0, S - period.fromSession);
  return Math.max(0, curve.cum[period.fromT] + within * period.avgRate);
}

// ---------- sous-composants ----------

function JalonRow({ j, idx, isLast, period, maxLevel, minLevel, onChangeField, onRemove, disabled }) {
  const [level, setLevel] = useSyncedField(j.targetLevel);
  const [cumSessions, setCumSessions] = useSyncedField(j.cumSessions);
  return (
    <tr className={idx === 0 ? 'final' : undefined}>
      <td>
        {isLast ? (
          <input className="finput finput--num" type="number" value={maxLevel} disabled readOnly title="Le dernier jalon est toujours le niveau maximal" aria-label="Niveau cible" />
        ) : (
          <input
            className="finput finput--num" type="number" min={minLevel} max={maxLevel} step="1" value={level}
            aria-label="Niveau cible"
            onChange={(e) => { const v = Number(e.target.value) || minLevel; setLevel(v); onChangeField(idx, 'targetLevel', v); }}
          />
        )}
      </td>
      <td>
        <input
          className="finput finput--num" type="number" min="1" step="1" value={cumSessions}
          aria-label="Session cumulée depuis le départ"
          onChange={(e) => { const v = Number(e.target.value) || 1; setCumSessions(v); onChangeField(idx, 'cumSessions', v); }}
        />
      </td>
      <td className="num tab-num">{period ? fmt(period.sessions) : '–'}</td>
      <td className="num tab-num">{period ? fmt(period.budget) : '–'}</td>
      <td className="num tab-num">{period ? fmtUp(period.avgRate) : '–'}</td>
      <td className="num tab-num">{period ? (idx === 0 ? '— (référence)' : `×${period.multiplier.toFixed(2)}`) : '–'}</td>
      <td>
        <button className="tbtn" type="button" aria-label={`Retirer le jalon niveau ${j.targetLevel}`} disabled={disabled} onClick={() => onRemove(idx)}>✕</button>
      </td>
    </tr>
  );
}

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

function BranchChart({ data, baseLevel = 1 }) {
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
          {baseLevel + t}
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
            <div className="tt-title">Niveau {baseLevel + tooltip.t - 1} → {baseLevel + tooltip.t} · {fmt(data.cost[tooltip.t])} XP</div>
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

function ProgressionTable({ data, baseLevel = 1 }) {
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
              <td className="num tab-num">{baseLevel + t}</td>
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

function BaremeLevelTable({ data, fromT, toT, baseLevel = 1, capped }) {
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
              <td className="num tab-num">{baseLevel + t}</td>
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

function LevelScheduleTable({ rows, capped }) {
  return (
    <div className={'xp-table-wrap' + (capped ? ' xp-table-wrap--capped' : '')}>
      <table className="xp-table">
        <thead>
          <tr>
            <th>Niveau</th><th>XP depuis le précédent</th><th>XP cumulée</th>
            <th>Sessions pour cette montée</th><th>Session cumulée estimée</th><th>Durée (années)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.level} className={r.isFinal ? 'final' : undefined}>
              <td className="num tab-num">{r.level}</td>
              <td className="num tab-num">{fmt(r.cost)}</td>
              <td className="num tab-num">{fmt(r.cum)}</td>
              <td className="num tab-num">{r.sessionsForThisLevel != null ? fmt1(r.sessionsForThisLevel) : '–'}</td>
              <td className="num tab-num">{r.sessionCum != null ? fmt1(r.sessionCum) : '–'}</td>
              <td className="num tab-num">{r.years != null ? r.years.toFixed(2) : '–'}</td>
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

  const [startLevel, setStartLevel] = useSyncedField(xp.startLevel);
  const [levels, setLevels] = useSyncedField(xp.levels);
  const [sessionsPerYear, setSessionsPerYear] = useSyncedField(xp.sessionsPerYear);
  const [refXpPerSession, setRefXpPerSession] = useSyncedField(xp.refXpPerSession);
  const [sessionsSoFar, setSessionsSoFar] = useSyncedField(xp.tracking.sessionsSoFar);
  const [xpSoFar, setXpSoFar] = useSyncedField(xp.tracking.xpSoFar);

  const curve = useMemo(() => computeCampaignCurve(xp), [xp]);
  const data = useMemo(
    () => deriveResults(xp, curve.maxLevel, curve.T, curve.cost, curve.cum, curve.total),
    [xp, curve]
  );
  const data50 = useMemo(
    () => (curve.capLevel > curve.maxLevel
      ? deriveResults(xp, curve.capLevel, curve.Tcap, curve.cost, curve.cum, curve.total50)
      : null),
    [xp, curve]
  );
  const fullData = data50 || data;
  const baremePreview = useMemo(() => computeBaremeAdjustedPreview(xp), [xp]);
  // Mêmes largeurs de colonnes sur les 5 tableaux (un par branche) : calculées
  // une seule fois ici à partir du nombre de périodes, posées en % identiques
  // partout, pour que les colonnes s'alignent d'une branche à l'autre.
  const previewColPct = useMemo(() => {
    const dataCols = Math.max(1, curve.periods.length);
    const first = 42;
    return { first, data: (100 - first) / dataCols };
  }, [curve]);

  const warnings = useMemo(() => {
    const list = [];
    const sl = Number(xp.startLevel) || 0, ml = Number(xp.levels) || 0;
    if (ml <= sl) list.push('Le niveau maximal doit être strictement supérieur au niveau de départ.');
    if ((Number(xp.refXpPerSession) || 0) <= 0) list.push("L'XP moyenne de référence doit être positive.");
    let prevSessions = 0, prevLevel = sl;
    (xp.jalons || []).forEach((j, i) => {
      const s = Number(j.cumSessions) || 0;
      const l = Number(j.targetLevel) || 0;
      if (s <= prevSessions) list.push(`Jalon ${i + 1} : la session cumulée (${s}) doit être strictement supérieure à celle du jalon précédent (${prevSessions}).`);
      if (l <= prevLevel) list.push(`Jalon ${i + 1} : le niveau cible doit être strictement supérieur au jalon précédent.`);
      prevSessions = s; prevLevel = l;
    });
    return list;
  }, [xp]);

  const setField = (key, value) => mutate((s) => { s.xpCalibreur[key] = value; });
  const setCombatField = (key, value) => mutate((s) => { s.xpCalibreur.combat[key] = value; });
  const setTrackingField = (key, value) => mutate((s) => { s.xpCalibreur.tracking[key] = value; });

  const addJalon = () => mutate((s) => {
    const arr = s.xpCalibreur.jalons;
    if (arr.length < 6) {
      const last = arr[arr.length - 1];
      const prevLevel = arr.length >= 2 ? arr[arr.length - 2].targetLevel : Number(s.xpCalibreur.startLevel) || 5;
      const newLevel = clamp(Math.round((prevLevel + last.targetLevel) / 2), prevLevel + 1, last.targetLevel - 1);
      const prevSessions = arr.length >= 2 ? arr[arr.length - 2].cumSessions : 0;
      const newSessions = Math.max(prevSessions + 1, Math.round((prevSessions + last.cumSessions) / 2));
      arr.splice(arr.length - 1, 0, { targetLevel: newLevel, cumSessions: newSessions });
    }
  });
  const removeJalon = (idx) => mutate((s) => {
    const arr = s.xpCalibreur.jalons;
    if (arr.length > 1 && idx < arr.length - 1) arr.splice(idx, 1);
  });
  const setJalonField = (idx, field, value) => mutate((s) => {
    s.xpCalibreur.jalons[idx][field] = value;
  });

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
    if (p.length < 6) p.push({ name: `Profil ${p.length + 1}`, xp: Math.round(Number(s.xpCalibreur.refXpPerSession) || 250) });
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

  const expectedXpSoFar = expectedXpAtSession(curve, Number(sessionsSoFar) || 0);
  const deltaXp = (Number(xpSoFar) || 0) - expectedXpSoFar;

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Calibreur d'XP</h2>
        <span className="xp-sub">
          Calibrage par durées cibles : niveau de départ, niveau maximal, rythme de sessions et jalons — le
          budget d'XP de chaque palier, le budget total et l'XP moyenne par période en sont déduits.
        </span>
      </div>

      <div className="xp-grid">
        <section className="xp-card xp-span-6">
          <h3 className="xp-h2">Objectif de niveau</h3>
          <p className="xp-cardsub">
            Renseigne les durées cibles, pas un budget : le budget d'XP de chaque palier, le budget total et
            l'XP moyenne à distribuer par période sont calculés à partir de ça.
          </p>
          <div className="xp-fieldgrid">
            <label className="flabel xp-field" htmlFor="in-start">
              Niveau de départ
              <input
                className="finput finput--num" type="number" id="in-start" min="1" max="58" step="1" value={startLevel}
                onChange={(e) => { const v = Number(e.target.value) || 1; setStartLevel(v); setField('startLevel', v); }}
              />
            </label>
            <label className="flabel xp-field" htmlFor="in-levels">
              Niveau maximal
              <input
                className="finput finput--num" type="number" id="in-levels" min={Number(startLevel) + 1} max="60" step="1" value={levels}
                onChange={(e) => { const v = Number(e.target.value) || 25; setLevels(v); setField('levels', v); }}
              />
            </label>
            <label className="flabel xp-field" htmlFor="in-spy">
              Sessions jouées par an
              <input
                className="finput finput--num" type="number" id="in-spy" min="1" step="1" value={sessionsPerYear}
                onChange={(e) => { const v = Number(e.target.value) || 48; setSessionsPerYear(v); setField('sessionsPerYear', v); }}
              />
            </label>
            <label className="flabel xp-field" htmlFor="in-refrate">
              XP moyenne/session — 1ère période
              <input
                className="finput finput--num" type="number" id="in-refrate" min="0.1" step="1" value={refXpPerSession}
                onChange={(e) => { const v = Number(e.target.value) || 0.1; setRefXpPerSession(v); setField('refXpPerSession', v); }}
              />
            </label>
          </div>
          <p className="xp-hint">
            Le niveau maximal sépare la progression des joueurs (départ → max) de la suite réservée aux PNJ de
            lore (max → 50, détaillée plus bas, jamais recalibrée).
          </p>

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
            <p className="xp-hint">
              Plus bas = paliers presque égaux du début à la fin (les deux périodes coûteraient alors le même
              budget). Plus haut = les niveaux 15-25 coûtent bien plus cher que les niveaux 5-15.
            </p>
          </label>

          <p className="xp-subhead" style={{ marginTop: 20 }}>Jalons</p>
          <p className="xp-cardsub" style={{ marginTop: 0 }}>
            Niveau cible + session cumulée depuis le départ (pas la durée de la période, calculée juste à
            côté pour éviter toute ambiguïté). Le premier jalon (ligne en gras) calibre tout : son budget
            (sessions × XP moyenne de référence ci-dessus) fixe le coefficient appliqué ensuite, tel quel, à
            toute la courbe. Le dernier jalon est toujours le niveau maximal.
          </p>
          <div className="xp-table-wrap">
            <table className="xp-table">
              <thead>
                <tr>
                  <th>Niveau cible</th><th>Session cumulée</th><th>Durée (sessions)</th>
                  <th>Budget d'XP</th><th>XP moyenne/session</th><th>Multiplicateur</th><th></th>
                </tr>
              </thead>
              <tbody>
                {xp.jalons.map((j, idx) => (
                  <JalonRow
                    key={idx}
                    j={j}
                    idx={idx}
                    isLast={idx === xp.jalons.length - 1}
                    period={curve.periods[idx]}
                    maxLevel={curve.maxLevel}
                    minLevel={curve.startLevel + 1}
                    onChangeField={setJalonField}
                    onRemove={removeJalon}
                    disabled={idx === xp.jalons.length - 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="xp-actions">
            <button className="tbtn" onClick={addJalon} disabled={xp.jalons.length >= 6}>+ Ajouter un jalon</button>
          </div>

          {warnings.length ? (
            <div className="xp-warnbox" style={{ marginTop: 12 }}>
              {warnings.map((w, i) => <p className="xp-hint" key={i} style={{ color: 'var(--blood)', margin: '2px 0' }}>⚠ {w}</p>)}
            </div>
          ) : null}

          <div className="xp-tiles" style={{ marginTop: 16 }}>
            <div className="xp-tile">
              <div className="xp-tile-label">Budget total — niveau {curve.startLevel} → {curve.maxLevel}</div>
              <div className="xp-tile-value num tab-num">{fmt(curve.total)} XP</div>
              <div className="xp-tile-sub">résultat du calcul, pas une entrée</div>
            </div>
            {curve.total50 != null ? (
              <div className="xp-tile">
                <div className="xp-tile-label">XP total — suite PNJ jusqu'au niveau 50</div>
                <div className="xp-tile-value num tab-num">{fmt(curve.total50)} XP</div>
                <div className="xp-tile-sub">même coefficient, séparé du calibrage campagne</div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="xp-card xp-span-6">
          <h3 className="xp-h2">Barème ajusté par période</h3>
          <p className="xp-cardsub">
            Les valeurs saisies dans « Barème d'XP par type d'événement » plus bas restent la référence de la
            première période — jamais écrasées. Pour chaque période suivante, aperçu = référence × multiplicateur
            de la période. Ce multiplicateur donne la moyenne visée <b>si le nombre et la composition des
            événements par session restent similaires</b> à la première période : c'est une aide au calibrage,
            pas une garantie de gains réels.
          </p>
          <div className="xp-bareme-grid">
            {baremePreview.map((group) => (
              <div className="xp-bareme-group" key={group.key}>
                <div className="xp-bareme-title">
                  <span className="xp-swatch" style={{ background: `var(${group.colorVar})` }}></span>{group.label}
                </div>
                <div className="xp-table-wrap">
                  <table className="xp-table xp-preview-table">
                    <thead>
                      <tr>
                        <th style={{ width: `${previewColPct.first}%` }}>Type</th>
                        <th style={{ width: `${previewColPct.data}%` }}>Référence</th>
                        {curve.periods.slice(1).map((p) => (
                          <th key={p.idx} style={{ width: `${previewColPct.data}%` }} title={`Niveau ${p.fromLevel} → ${p.toLevel}`}>
                            Période {p.idx + 1} (×{p.multiplier.toFixed(2)})
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((it, i) => (
                        <tr key={i}>
                          <td>{it.name}</td>
                          <td className="num tab-num">{fmtUp(it.referenceXp)}</td>
                          {curve.periods.slice(1).map((p) => (
                            <td key={p.idx} className="num tab-num">{fmtUp(it.referenceXp * p.multiplier)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="xp-card xp-span-6">
          <h3 className="xp-h2">Progression détaillée — niveau {curve.startLevel} à {curve.maxLevel}</h3>
          <p className="xp-cardsub" style={{ marginBottom: 0 }}>
            Palier par palier : XP depuis le niveau précédent, XP cumulée depuis le niveau {curve.startLevel},
            sessions estimées pour cette montée, session cumulée estimée et durée équivalente en années (au
            rythme de {fmt(curve.sessionsPerYear)} sessions/an configuré ci-dessus). Les jalons retombent
            exactement sur leurs sessions cibles.
          </p>
        </section>
        <section className="xp-card xp-span-6">
          <LevelScheduleTable rows={buildLevelSchedule(curve, 1, curve.T)} capped />
        </section>

        <section className="xp-card xp-span-6">
          <h3 className="xp-h2">Complétions de barème — niveau {curve.startLevel} à {fullData.levels}</h3>
          <p className="xp-cardsub" style={{ marginBottom: 0 }}>
            Pour chaque type du barème, combien de complétions il faut pour passer d'un niveau au suivant, en
            continu du niveau {curve.startLevel} au niveau {fullData.levels} (inclut la suite PNJ jusqu'à 50
            si le niveau maximal configuré est inférieur).
          </p>
        </section>
        <section className="xp-card xp-span-6">
          <BaremeLevelTable data={fullData} fromT={1} toT={fullData.T} baseLevel={curve.startLevel} capped />
        </section>

        <section className="xp-card xp-span-6">
          <h3 className="xp-h2">Projection graphique — niveau {curve.startLevel} à {fullData.levels}</h3>
          <p className="xp-cardsub">
            Coût XP de chaque palier, détail par branche, et session estimée d'obtention par profil de
            simulation (rythmes plus lents/rapides que la référence, lus sur les mêmes seuils sans recalibrer).
          </p>
          <div className="xp-legend">
            <span className="xp-legend-item"><span className="xp-swatch" style={{ background: `var(${BRANCH_VARS.trame})` }}></span>Trame</span>
            <span className="xp-legend-item"><span className="xp-swatch" style={{ background: `var(${BRANCH_VARS.secondaire})` }}></span>Secondaire</span>
            <span className="xp-legend-item"><span className="xp-swatch" style={{ background: `var(${BRANCH_VARS.exploration})` }}></span>Exploration</span>
            <span className="xp-legend-item"><span className="xp-swatch" style={{ background: `var(${BRANCH_VARS.combat})` }}></span>Combat</span>
          </div>
          <BranchChart data={fullData} baseLevel={curve.startLevel} />
          <div style={{ marginTop: 16 }}>
            <ProgressionTable data={fullData} baseLevel={curve.startLevel} />
          </div>
        </section>

        <section className="xp-card xp-span-4 xp-rowspan-4">
          <h3 className="xp-h2">Barème d'XP par type d'événement</h3>
          <p className="xp-cardsub">
            Le détail concret de ce qui rapporte de l'XP dans chaque branche, conservé tel quel — ces valeurs
            sont la référence de la première période (voir « Barème ajusté par période » plus haut). Types
            librement éditables, ajoute ou retire ce qu'il te faut, et fais glisser la poignée à gauche pour
            les réordonner. Chaque type affiche le nombre de complétions nécessaires pour boucler toute la
            courbe jusqu'au niveau maximal configuré ; la ligne « Total » additionne l'XP de tous les types de
            la branche et indique combien de fois il faudrait combiner un exemplaire de chacun pour boucler
            la courbe.
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
            Calculée à partir du barème ci-contre : plus les types d'une branche pèsent lourd en XP, plus
            cette branche prend une part importante ici. La branche Spéciale reste un bonus à part, hors de
            ce calcul.
          </p>
          <p className="xp-hint">
            ⚠ Ceci pondère par les valeurs unitaires du barème, pas par leur fréquence réelle en jeu — une
            branche avec de gros jalons rares peut sembler dominante sans l'être à la table. Une vraie
            prévision demanderait de multiplier chaque récompense par ses occurrences moyennes par session.
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
          <h3 className="xp-h2">Profils de simulation</h3>
          <p className="xp-cardsub">
            Des rythmes plus lents ou plus rapides que la référence — pour VOIR l'avance ou le retard, ils
            sont lus sur les mêmes seuils déjà calculés, jamais recalibrés individuellement.
          </p>
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

        <section className="xp-card xp-span-2">
          <h3 className="xp-h2">Suivi réel (optionnel)</h3>
          <p className="xp-cardsub">Compare, à nombre de sessions égal, l'XP réellement gagnée à l'XP attendue selon le calibrage.</p>
          <div className="xp-fieldgrid" style={{ gridTemplateColumns: '1fr' }}>
            <label className="flabel xp-field" htmlFor="in-track-sessions">
              Sessions jouées à ce jour
              <input
                className="finput finput--num" type="number" id="in-track-sessions" min="0" step="1" value={sessionsSoFar}
                onChange={(e) => { const v = Number(e.target.value) || 0; setSessionsSoFar(v); setTrackingField('sessionsSoFar', v); }}
              />
            </label>
            <label className="flabel xp-field" htmlFor="in-track-xp">
              XP total gagné à ce jour
              <input
                className="finput finput--num" type="number" id="in-track-xp" min="0" step="1" value={xpSoFar}
                onChange={(e) => { const v = Number(e.target.value) || 0; setXpSoFar(v); setTrackingField('xpSoFar', v); }}
              />
            </label>
          </div>
          <div className="xp-tiles" style={{ marginTop: 10 }}>
            <div className="xp-tile">
              <div className="xp-tile-label">XP attendu à ce stade</div>
              <div className="xp-tile-value num tab-num">{fmt(expectedXpSoFar)} XP</div>
            </div>
            <div className="xp-tile">
              <div className="xp-tile-label">Écart</div>
              <div className="xp-tile-value num tab-num" style={{ color: deltaXp >= 0 ? 'var(--kind-data)' : 'var(--blood)' }}>
                {deltaXp >= 0 ? '+' : ''}{fmt(deltaXp)} XP
              </div>
              <div className="xp-tile-sub">{deltaXp >= 0 ? 'avance sur le plan' : 'retard sur le plan'}</div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
