import { useEffect, useState } from 'react';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { lsGet, lsSet } from '../../lib/util.js';
import {
  STATS, ABBR, EXP, PALIERS, LEVELS, DEFAULT_DD, RACE_POOL, tip,
  statPool, statCap, presetValue, resolved, statValueAt, statBonus,
  expPool, expCap, faces, need, prob, fmtPct, ressenti, compactLevels, fr, refM
} from '../../lib/ddcalc.js';

const DEFAULT_ECO = { expPoolBase: 26, expPoolLvl: 2, expCapBase: 5, expCapLvl: 1 };
const LOCAL_KEY = 'ccm.ddcalc.local';

function validDdArray(a) { return Array.isArray(a) && a.length === PALIERS.length && a.every((n) => typeof n === 'number'); }

function normEco(ddCalc) {
  const savedDefaultDd = ddCalc && validDdArray(ddCalc.savedDefaultDd) ? ddCalc.savedDefaultDd : null;
  if (!ddCalc || !validDdArray(ddCalc.dd)) {
    return { dd: (savedDefaultDd || DEFAULT_DD).slice(), ...DEFAULT_ECO, savedDefaultDd };
  }
  return {
    dd: ddCalc.dd,
    expPoolBase: typeof ddCalc.expPoolBase === 'number' ? ddCalc.expPoolBase : DEFAULT_ECO.expPoolBase,
    expPoolLvl: typeof ddCalc.expPoolLvl === 'number' ? ddCalc.expPoolLvl : DEFAULT_ECO.expPoolLvl,
    expCapBase: typeof ddCalc.expCapBase === 'number' ? ddCalc.expCapBase : DEFAULT_ECO.expCapBase,
    expCapLvl: typeof ddCalc.expCapLvl === 'number' ? ddCalc.expCapLvl : DEFAULT_ECO.expCapLvl,
    savedDefaultDd
  };
}

function loadLocal() {
  try {
    const s = JSON.parse(lsGet(LOCAL_KEY) || 'null');
    if (s && typeof s === 'object') return s;
  } catch (_) { /* ignore */ }
  return null;
}

/* --- champs partagés (DD + économie), synchronisés en direct --- */

function DDInput({ ddCalc, index, mutate }) {
  const [text, setText, ref] = useSyncedField(String(ddCalc.dd[index]));
  const commit = (v) => {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) mutate((s) => { s.ddCalc = normEco(s.ddCalc); s.ddCalc.dd[index] = n; });
  };
  return (
    <input
      ref={ref} className="ddin" type="number" min="0" max="300"
      value={text}
      onChange={(e) => { const v = e.target.value; setText(v); commit(v); }}
      onBlur={() => commit(text)}
    />
  );
}

function EcoField({ ddCalc, field, mutate, step }) {
  const [text, setText, ref] = useSyncedField(String(ddCalc[field]));
  const commit = (v) => {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) mutate((s) => { s.ddCalc = normEco(s.ddCalc); s.ddCalc[field] = n; });
  };
  return (
    <input
      ref={ref} className="field field--eco" type="number" min="0" step={step || 1}
      value={text}
      onChange={(e) => { const v = e.target.value; setText(v); commit(v); }}
      onBlur={() => commit(text)}
    />
  );
}

/* --- petits composants d'affichage --- */

function Bar({ p }) {
  const w = Math.max(0, Math.min(1, p)) * 100;
  return <div className="dd-bar"><i style={{ width: w.toFixed(1) + '%' }} /><b>{fmtPct(p)}</b></div>;
}
function Pill({ label, kind }) { return <span className={'dd-pill dd-pill--' + kind}>{label}</span>; }
function Cell({ p }) {
  const w = Math.max(0, Math.min(1, p)) * 100;
  return <div className="dd-cell"><i style={{ width: w.toFixed(1) + '%' }} /><b>{fmtPct(p)}</b></div>;
}

/* ================================================================== */

export default function Equilibrage({ state, mutate }) {
  const ddCalc = normEco(state.ddCalc);

  const initial = loadLocal();
  const [level, setLevel] = useState(initial?.level ?? 5);
  const [selIdx, setSelIdx] = useState(initial?.selIdx ?? 0);
  const [statVal, setStatVal] = useState(() => {
    const base = { Force: 0, Mystique: 0, Perception: 0, Adresse: 0, Esprit: 0, Constitution: 0 };
    if (initial?.statVal) return { ...base, ...initial.statVal };
    const v = { ...base };
    STATS.forEach((s) => { v[s] = presetValue('moy', initial?.level ?? 5); });
    return v;
  });
  const [raceVal, setRaceVal] = useState(() => {
    const base = { Force: 2, Mystique: 2, Perception: 2, Adresse: 2, Esprit: 2, Constitution: 2 };
    return initial?.raceVal ? { ...base, ...initial.raceVal } : base;
  });
  const [stuff, setStuff] = useState(initial?.stuff ?? 4);
  const [mode, setMode] = useState(initial?.mode ?? 3);
  const [pctCap, setPctCap] = useState(initial?.pctCap ?? 100);

  useEffect(() => {
    lsSet(LOCAL_KEY, JSON.stringify({ level, selIdx, statVal, raceVal, stuff, mode, pctCap }));
  }, [level, selIdx, statVal, raceVal, stuff, mode, pctCap]);

  const raceUsed = STATS.reduce((n, s) => n + (+raceVal[s] || 0), 0);
  function racePreset(kind) {
    if (kind === 'min') return 0;
    if (kind === 'max') return RACE_POOL;
    return Math.round(RACE_POOL / 6);
  }
  function setRace(s, v) { setRaceVal((old) => ({ ...old, [s]: Math.max(0, v) })); }

  const exp = EXP[selIdx] || EXP[0];
  const f = faces();
  const cur = level;

  const used = STATS.reduce((n, s) => n + (+statVal[s] || 0), 0);
  const pool = Math.round(statPool(level));

  // ---- rappel (formule + décomposition du bonus de stat) ----
  const r = resolved(exp);
  const rawParts = [];
  Object.keys(exp.c).forEach((p) => rawParts.push(ABBR[p] + ' ·' + fr(exp.c[p])));
  if (exp.s) Object.keys(exp.s).forEach((sn) => rawParts.push(sn + ' ·' + fr(exp.s[sn])));

  let bonus = 0;
  const statRows = STATS.filter((s) => r[s]).map((s) => {
    const v = statValueAt(statVal[s] || 0, cur, level) + (+raceVal[s] || 0);
    const part = r[s] * v;
    bonus += part;
    return { s, coeff: r[s], v, part };
  });

  // ---- modificateur M courant ----
  const cap = expCap(ddCalc, level);
  const pctInv = pctCap / 100;
  const pts = Math.round(pctInv * cap);
  const statPart = mode >= 2 ? bonus : 0;
  const stuffPart = mode >= 3 ? stuff : 0;
  const M = pts + statPart + stuffPart;
  const mean = M + (f - 1) / 2;
  const readoutBits = [pts + ' exp (' + pctCap + '% du cap ' + Math.round(cap) + ')'];
  if (mode >= 2) readoutBits.push(fr(bonus.toFixed(1)) + ' stat');
  if (mode >= 3) readoutBits.push(stuff + ' stuff');

  const refMArgs = (L) => ({ exp, statVal, raceVal, eco: ddCalc, cur, L, mode, pctCap, stuff });

  // ---- table des paliers (niveau courant) ----
  const palierRows = PALIERS.map((p, i) => {
    const target = ddCalc.dd[i];
    let reqTxt, pr, res;
    if (!p.roll) { reqTxt = '—'; pr = 1; res = ['Automatique', 'good']; }
    else {
      const n = need(target, M);
      reqTxt = n <= 0 ? 'auto' : (n >= f ? 'impossible' : '≥ ' + n);
      pr = prob(target, M, f);
      res = ressenti(n, f);
    }
    const locked = p.roll && pr <= 0.001;
    return { i, p, target, reqTxt, pr, res, locked };
  });

  // ---- heatmap ----
  const heatRows = PALIERS.map((p, i) => ({
    i, p, dd: ddCalc.dd[i],
    cells: LEVELS.map((L) => prob(ddCalc.dd[i], refM(refMArgs(L)), f))
  }));
  const mRefRow = LEVELS.map((L) => Math.round(refM(refMArgs(L))));
  let live = 0;
  for (let j = 1; j < PALIERS.length; j++) {
    const p50 = prob(ddCalc.dd[j], refM(refMArgs(50)), f);
    if (p50 > 0.02 && p50 < 0.98) live++;
  }

  // ---- analyse ----
  const ALLL = []; for (let l = 5; l <= 50; l++) ALLL.push(l);
  const pat = (i, L) => prob(ddCalc.dd[i], refM(refMArgs(L)), f);
  const firstAt = (i, thr) => { for (let k = 0; k < ALLL.length; k++) { if (pat(i, ALLL[k]) >= thr) return ALLL[k]; } return null; };
  const band = (p) => (p >= 0.95 ? 'auto' : (p <= 0.05 ? 'lock' : 'susp'));

  const win = [], autos = [], oob = [];
  for (let i = 1; i < PALIERS.length; i++) {
    const p = pat(i, level), bd = band(p);
    if (bd === 'susp') win.push(PALIERS[i].name + ' ' + fmtPct(p) + '%');
    else if (bd === 'auto') autos.push(PALIERS[i].name);
    else oob.push(PALIERS[i].name);
  }

  const lifeRows = [];
  for (let j = 1; j < PALIERS.length; j++) {
    const l50 = firstAt(j, 0.5), l95 = firstAt(j, 0.95);
    let span = 0; for (let q = 0; q < ALLL.length; q++) { const pp = pat(j, ALLL[q]); if (pp > 0.05 && pp < 0.95) span++; }
    const p50v = pat(j, 50), st = band(p50v);
    const stTxt = st === 'auto' ? 'auto' : (st === 'lock' ? 'verrou.' : fmtPct(p50v) + '%');
    lifeRows.push({ name: PALIERS[j].name, dd: ddCalc.dd[j], l50, l95, span, stTxt });
  }

  const gaps = [], jumps = [], tights = [];
  for (let g = 1; g < PALIERS.length; g++) {
    const d = ddCalc.dd[g] - ddCalc.dd[g - 1];
    gaps.push(ddCalc.dd[g - 1] + '→' + ddCalc.dd[g] + ' (' + d + ')');
    if (d > 16) jumps.push(PALIERS[g - 1].name + '→' + PALIERS[g].name);
    if (d < 2) tights.push(PALIERS[g - 1].name + '→' + PALIERS[g].name);
  }
  const amp = ddCalc.dd[PALIERS.length - 1] - ddCalc.dd[0];

  let cS = 0, cA = 0, cL = 0, tot = 0; const dead = [];
  for (let w2 = 0; w2 < ALLL.length; w2++) {
    let lvS = 0;
    for (let rr = 1; rr < PALIERS.length; rr++) {
      const bb = band(pat(rr, ALLL[w2])); tot++;
      if (bb === 'susp') { cS++; lvS++; } else if (bb === 'auto') cA++; else cL++;
    }
    if (lvS === 0) dead.push(ALLL[w2]);
  }
  const pc = (n) => Math.round((100 * n) / tot);
  const deadTxt = dead.length ? compactLevels(dead) : 'aucun';

  /* -------------------------------------------------------------- */

  function setStat(s, v) { setStatVal((old) => ({ ...old, [s]: Math.max(0, v) })); }
  function presetStat(s, kind) { setStat(s, presetValue(kind, level)); }

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Équilibrage des expertises</h2>
        <span className="dd-sub">Simulateur de résolution d'action — DD et règles d'économie partagés, exploration personnelle.</span>
      </div>

      <div className="dd-layout">
        {/* ============ CONFIG ============ */}
        <aside className="dd-card dd-cfg">
          <h3 className="dd-h2">Archétype</h3>
          <p className="dd-cardsub">Règles d'économie et profil de stats communs à toutes les expertises.</p>

          <label className="flabel dd-field">
            <span className="dd-labelrow">Niveau <span className="dd-val">{level}</span></span>
            <input type="range" min="5" max="50" step="1" value={level} onChange={(e) => setLevel(+e.target.value)} />
          </label>

          <div className="dd-econ">
            <fieldset className="dd-eco">
              <legend>Pool de points d'expertise</legend>
              <div className="dd-eco-inputs">
                <span>Base</span><EcoField ddCalc={ddCalc} field="expPoolBase" mutate={mutate} />
                <span>/ niv</span><EcoField ddCalc={ddCalc} field="expPoolLvl" mutate={mutate} step="0.5" />
              </div>
              <div className="dd-eco-hint">= {Math.round(expPool(ddCalc, level))} pts au niv {level}</div>
            </fieldset>
            <fieldset className="dd-eco">
              <legend>Plafond par expertise</legend>
              <div className="dd-eco-inputs">
                <span>Base</span><EcoField ddCalc={ddCalc} field="expCapBase" mutate={mutate} />
                <span>/ niv</span><EcoField ddCalc={ddCalc} field="expCapLvl" mutate={mutate} step="0.5" />
              </div>
              <div className="dd-eco-hint">= {Math.round(expCap(ddCalc, level))} / expertise au niv {level}</div>
            </fieldset>
          </div>

          <p className="dd-divlabel">
            Race
            <span className="dd-statspent" style={{ color: raceUsed > RACE_POOL ? 'var(--blood)' : 'var(--gilt)' }}>
              {raceUsed} / {RACE_POOL} pts
            </span>
          </p>
          <div className="dd-statsel">
            {STATS.map((s) => (
              <div key={s} className="dd-ssitem">
                <div className="dd-sstop">{s}</div>
                <div className="dd-sstep">
                  <button type="button" className="dd-stbmp" onClick={() => setRace(s, (+raceVal[s] || 0) - 1)} aria-label={'Diminuer ' + s}>−</button>
                  <input
                    className="dd-stv" type="number" min="0" max="200" step="1"
                    value={raceVal[s]}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); setRace(s, Number.isNaN(v) ? 0 : v); }}
                  />
                  <button type="button" className="dd-stbmp" onClick={() => setRace(s, (+raceVal[s] || 0) + 1)} aria-label={'Augmenter ' + s}>+</button>
                </div>
                <div className="dd-ssbtns">
                  <button type="button" onClick={() => setRace(s, racePreset('min'))}>Min</button>
                  <button type="button" onClick={() => setRace(s, racePreset('moy'))}>Moy</button>
                  <button type="button" onClick={() => setRace(s, racePreset('max'))}>Max</button>
                </div>
              </div>
            ))}
          </div>
          <p className="dd-hint">Les points de race s'ajoutent à la valeur de chaque stat primaire dans les calculs.</p>

          <p className="dd-divlabel">
            Profil de stats primaires
            <span className="dd-statspent" style={{ color: used > pool ? 'var(--blood)' : 'var(--gilt)' }}>
              {used} / {pool} pts
            </span>
          </p>
          <div className="dd-statsel">
            {STATS.map((s) => (
              <div key={s} className="dd-ssitem">
                <div className="dd-sstop">{s}</div>
                <div className="dd-sstep">
                  <button type="button" className="dd-stbmp" onClick={() => setStat(s, (+statVal[s] || 0) - 1)} aria-label={'Diminuer ' + s}>−</button>
                  <input
                    className="dd-stv" type="number" min="0" max="200" step="1"
                    value={statVal[s]}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); setStat(s, Number.isNaN(v) ? 0 : v); }}
                  />
                  <button type="button" className="dd-stbmp" onClick={() => setStat(s, (+statVal[s] || 0) + 1)} aria-label={'Augmenter ' + s}>+</button>
                </div>
                <div className="dd-ssbtns">
                  <button type="button" onClick={() => presetStat(s, 'min')}>Min</button>
                  <button type="button" onClick={() => presetStat(s, 'moy')}>Moy</button>
                  <button type="button" onClick={() => presetStat(s, 'max')}>Max</button>
                </div>
              </div>
            ))}
          </div>

          <div className="dd-lastrow">
            <label className="flabel dd-field">
              <span className="dd-labelrow">Bonus de stuff (fixe) <span className="dd-val">+{stuff}</span></span>
              <input type="range" min="0" max="10" step="1" value={stuff} onChange={(e) => setStuff(+e.target.value)} />
            </label>
            <div className="flabel">
              <span>Ce qui compte dans le jet</span>
              <div className="dd-seg" role="radiogroup" aria-label="Mode de calcul">
                {[[1, 'Expertise seule'], [2, '+ Stat'], [3, '+ Équipement']].map(([v, l]) => (
                  <label key={v} className={mode === v ? 'is-on' : ''}>
                    <input type="radio" name="dd-mode" checked={mode === v} onChange={() => setMode(v)} />
                    {l}
                  </label>
                ))}
              </div>
            </div>
            <label className="flabel dd-field">
              <span className="dd-labelrow">Investissement dans l'expertise <span className="dd-val">{pctCap} % du cap</span></span>
              <input type="range" min="0" max="100" step="5" value={pctCap} onChange={(e) => setPctCap(+e.target.value)} />
            </label>
          </div>
        </aside>

        {/* ============ APP ============ */}
        <section className="dd-card">
          <div className="dd-appgrid">
            <nav className="dd-exnav" aria-label="Expertises">
              {(() => {
                let fam = '';
                return EXP.map((e, i) => {
                  const head = e.fam !== fam ? (fam = e.fam, <p key={'f' + i} className="dd-fam">{e.fam}</p>) : null;
                  return (
                    <span key={e.name} style={{ display: 'contents' }}>
                      {head}
                      <button type="button" aria-current={i === selIdx} onClick={() => setSelIdx(i)}>{e.name}</button>
                    </span>
                  );
                });
              })()}
            </nav>

            <div>
              <div className="dd-exhead">
                <h3>{exp.name}</h3>
                <span className="dd-famtag">{exp.fam}</span>
              </div>

              <div className="dd-rappel">
                <div className="dd-formula"><b>{exp.name}</b> = {rawParts.join('  +  ')}</div>
                {exp.s && (
                  <p className="dd-note">
                    Sens résolus : {Object.keys(exp.s).map((sn) => sn + ' → Perception ·0,33').join(' · ')}
                  </p>
                )}
                <table>
                  <thead><tr><th>Stat primaire</th><th>Coeff. eff.</th><th>Valeur</th><th>Contribution</th></tr></thead>
                  <tbody>
                    {statRows.map((row) => (
                      <tr key={row.s}>
                        <td>{row.s}</td><td>{fr(+row.coeff.toFixed(3))}</td><td>{row.v}</td><td>{fr(row.part.toFixed(2))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td>Bonus de stat</td><td /><td /><td>{fr(bonus.toFixed(2))}</td></tr></tfoot>
                </table>
              </div>

              <dl className="dd-readout">
                <div><dt>Modificateur M</dt><dd>{Math.round(M)} <small>{readoutBits.join('  +  ')}</small></dd></div>
                <div><dt>Dé</dt><dd>d{f} <small>0 – {f - 1} · moy. {((f - 1) / 2).toFixed(1)}</small></dd></div>
                <div><dt>Total moyen</dt><dd>{Math.round(mean)}</dd></div>
                <div><dt>Amplitude</dt><dd>{Math.round(M)} – {Math.round(M + f - 1)}</dd></div>
              </dl>

              <div className="dd-scroll">
                <table className="dd-pal">
                  <thead><tr><th>DD</th><th>Palier</th><th>Jet requis</th><th>Chance</th><th>Ressenti du perso</th></tr></thead>
                  <tbody>
                    {palierRows.map(({ i, p, reqTxt, pr, res, locked }) => (
                      <tr key={i} className={locked ? 'is-locked' : ''}>
                        <td><DDInput ddCalc={ddCalc} index={i} mutate={mutate} /></td>
                        <td className="dd-pname" title={tip(exp.name, i)}>
                          <span className="dd-tt">{p.name}</span>{p.note ? <small>{p.note}</small> : null}
                        </td>
                        <td>{reqTxt}</td>
                        <td><Bar p={pr} /></td>
                        <td><Pill label={res[0]} kind={res[1]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dd-ddactions">
                <button
                  className="tbtn dd-reset" type="button"
                  onClick={() => mutate((s) => {
                    s.ddCalc = normEco(s.ddCalc);
                    s.ddCalc.dd = (s.ddCalc.savedDefaultDd || DEFAULT_DD).slice();
                  })}
                >
                  Réinitialiser les DD
                </button>
                <button
                  className="tbtn dd-reset" type="button"
                  onClick={() => {
                    if (!window.confirm('Enregistrer ces valeurs de DD comme nouvelles valeurs par défaut ?')) return;
                    mutate((s) => {
                      s.ddCalc = normEco(s.ddCalc);
                      s.ddCalc.savedDefaultDd = s.ddCalc.dd.slice();
                    });
                  }}
                >
                  Enregistrer les nouveaux DD
                </button>
                <p className="dd-hint">Nos valeurs remplaceront donc celles par défaut : « Réinitialiser les DD » repartira de là.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ PROGRESSION ============ */}
        <aside className="dd-card dd-prog">
          <p className="dd-subhead">Progression niv 5 → 50 · {exp.name}</p>
          <div className="dd-heatscroll">
            <div className="dd-heat" style={{ gridTemplateColumns: 'minmax(78px,96px) repeat(10,minmax(0,1fr))' }}>
              <div className="dd-hh" />
              {LEVELS.map((L) => <div key={L} className="dd-hh">{L}</div>)}
              {heatRows.map(({ i, p, dd, cells }) => (
                <span key={i} style={{ display: 'contents' }}>
                  <div className="dd-rl" title={tip(exp.name, i)}><b>{p.name}</b><br />DD {dd}</div>
                  {cells.map((pr, ci) => <Cell key={ci} p={pr} />)}
                </span>
              ))}
              <div className="dd-mrl">M réf.</div>
              {mRefRow.map((v, i) => <div key={i} className="dd-mv">{v}</div>)}
            </div>
          </div>
          <p className="dd-caption">
            Spécialiste de référence : expertise à {pctCap} % du cap, profil de stats ci-dessus évalué à chaque niveau.
            Au niveau 50, {live} palier{live > 1 ? 's' : ''} reste{live > 1 ? 'nt' : ''} dans la zone de vrai suspense (2–98 %).
          </p>

          <div className="dd-analysis">
            <div className="dd-anblock">
              <h4>Au niveau {level}</h4>
              <p><b>{win.length}</b> palier(s) en vrai suspense : {win.join(' · ') || '—'}</p>
              <p>Automatiques : {autos.join(', ') || '—'}</p>
              <p>Hors de portée : {oob.join(', ') || '—'}</p>
            </div>

            <div className="dd-anblock">
              <h4>Cycle de vie des paliers</h4>
              <table>
                <thead><tr><th>Palier</th><th>DD</th><th>≥50% dès</th><th>≥95% dès</th><th>niv. utiles</th><th>niv 50</th></tr></thead>
                <tbody>
                  {lifeRows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td><td>{row.dd}</td><td>{row.l50 || '—'}</td><td>{row.l95 || '—'}</td>
                      <td>{row.span}</td><td>{row.stTxt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="dd-anfoot">« niv. utiles » = nombre de niveaux (sur 46) où ce palier est un vrai pari (5–95 %).</p>
            </div>

            <div className="dd-anblock">
              <h4>Diagnostic de la distribution</h4>
              <p className="dd-mono">{gaps.join('  ·  ')}</p>
              <p>
                Amplitude {ddCalc.dd[0]} → {ddCalc.dd[PALIERS.length - 1]} = <b>{amp}</b> pts (≈ {(amp / 16).toFixed(1)} dés) ·
                1 pt de DD ≈ 6,25 % · un cran franchissable ≈ 16 pts.
              </p>
              <p>Sauts &gt; 16 (mur à niveau fixe) : {jumps.length ? <span className="dd-warn">{jumps.join(', ')}</span> : <span className="dd-ok">aucun</span>}</p>
              <p>Paliers &lt; 2 pts d'écart (quasi-redondants) : {tights.length ? <span className="dd-warn">{tights.join(', ')}</span> : <span className="dd-ok">aucun</span>}</p>
              <p>Couverture carrière 5→50 ({PALIERS.length - 1} paliers à jet) : <b>{pc(cS)} %</b> incertitude · {pc(cA)} % auto · {pc(cL)} % hors de portée.</p>
              <p>Niveaux sans aucun palier en suspense : {dead.length ? <span className="dd-warn">{deadTxt}</span> : <span className="dd-ok">aucun</span>}</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
