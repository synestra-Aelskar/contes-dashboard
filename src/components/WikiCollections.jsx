import { useMemo, useState } from 'react';
import { propertyStats, propValues, folderOf, looseKey } from '../lib/wiki.js';
import { lsGet, lsSet } from '../lib/util.js';

/* Collections : les notes vues par leurs propriétés YAML (tous les lieux, tous
 * les personnages vivants d'une région…) — l'équivalent sans script des index
 * Dataview. Un filtre = une propriété + une valeur ; les filtres s'additionnent. */

const PREF = 'ccm.wiki.coll';
const SKIP = new Set(['image', 'banner', 'banner-y', 'banner_y', 'cssclasses', 'cssclass', 'title', 'aliases', 'alias', 'resume', 'résumé', 'summary']);
const propLabel = (k) => { const s = String(k).replace(/[_-]+/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };

function loadPref() {
  try { const p = JSON.parse(lsGet(PREF) || '{}'); return { filters: Array.isArray(p.filters) ? p.filters : [], cols: Array.isArray(p.cols) ? p.cols : [] }; } catch (_) { return { filters: [], cols: [] }; }
}

export default function WikiCollections({ notes, go }) {
  const stats = useMemo(() => propertyStats(notes, SKIP), [notes]);
  const [pref, setPref] = useState(loadPref);
  const [sort, setSort] = useState({ col: '', dir: 1 });
  const [pick, setPick] = useState('');
  const save = (p) => { setPref(p); lsSet(PREF, JSON.stringify(p)); };
  const { filters, cols } = pref;

  const matches = useMemo(() => notes.filter((n) => filters.every((f) => {
    const wanted = looseKey(f.value);
    return propValues(n, f.key).some((v) => looseKey(v) === wanted);
  })), [notes, filters]);

  // colonnes : celles choisies, sinon les 3 propriétés les plus remplies parmi les résultats
  const auto = useMemo(() => {
    const counts = new Map();
    matches.forEach((n) => Object.keys(n.front || {}).forEach((k) => { if (!SKIP.has(k.toLowerCase()) && propValues(n, k).length) counts.set(k, (counts.get(k) || 0) + 1); }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => !filters.some((f) => looseKey(f.key) === looseKey(k))).slice(0, 3);
  }, [matches, filters]);
  const shownCols = cols.length ? cols : auto;

  const rows = useMemo(() => {
    const get = (n, c) => (c === '__title' ? n.title : c === '__folder' ? folderOf(n.path) : propValues(n, c).join(', '));
    const r = matches.slice();
    const c = sort.col || '__title';
    r.sort((a, b) => get(a, c).localeCompare(get(b, c), 'fr', { numeric: true }) * sort.dir);
    return r.map((n) => ({ n, cells: shownCols.map((k) => propValues(n, k)) }));
  }, [matches, sort, shownCols]);

  const stat = stats.find((s) => looseKey(s.key) === looseKey(pick));
  const toggleCol = (k) => save({ ...pref, cols: (cols.length ? cols : auto).includes(k) ? (cols.length ? cols : auto).filter((x) => x !== k) : [...(cols.length ? cols : auto), k] });
  const sortBy = (c) => setSort((s) => (s.col === c ? { col: c, dir: -s.dir } : { col: c, dir: 1 }));
  const arrow = (c) => (sort.col === c || (!sort.col && c === '__title') ? (sort.dir > 0 ? ' ▴' : ' ▾') : '');

  return (
    <article className="wiki-note wiki-coll">
      <header className="wiki-note__head"><h1 className="wiki-note__title">Collections</h1></header>
      <p className="lib__intro">Les notes triées par leurs propriétés. Ajoute des filtres pour dresser la liste de tous les lieux, des personnages d’une faction, etc.</p>

      <div className="wiki-coll__filters">
        {filters.map((f, i) => (
          <span key={i} className="wiki-chip wiki-chip--filter">
            <i>{propLabel(f.key)}</i> = {f.value}
            <button type="button" aria-label="Retirer ce filtre" onClick={() => save({ ...pref, filters: filters.filter((_, j) => j !== i) })}>×</button>
          </span>
        ))}
        {filters.length > 0 && <button className="tbtn" type="button" onClick={() => save({ ...pref, filters: [] })}>Tout retirer</button>}
      </div>

      <div className="wiki-coll__add">
        <select className="finput" aria-label="Propriété" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Filtrer par propriété…</option>
          {stats.map((s) => <option key={s.key} value={s.key}>{propLabel(s.key)} ({s.count})</option>)}
        </select>
        {stat && (
          <div className="wiki-coll__vals">
            {stat.values.slice(0, 60).map((v) => (
              <button key={v.value} type="button" className="wiki-chip wiki-chip--btn"
                title={v.variants.length > 1 ? 'Graphies : ' + v.variants.join(' · ') : undefined}
                onClick={() => { save({ ...pref, filters: [...filters, { key: stat.key, value: v.value }] }); setPick(''); }}>
                {v.value} <b>{v.count}</b>{v.variants.length > 1 ? ' ≈' : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      <h4 className="chr__h">{matches.length} note{matches.length > 1 ? 's' : ''}</h4>
      <div className="wiki-coll__tablewrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th><button type="button" onClick={() => sortBy('__title')}>Note{arrow('__title')}</button></th>
              <th><button type="button" onClick={() => sortBy('__folder')}>Dossier{arrow('__folder')}</button></th>
              {shownCols.map((k) => <th key={k}><button type="button" onClick={() => sortBy(k)}>{propLabel(k)}{arrow(k)}</button></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 400).map(({ n, cells }) => (
              <tr key={n.path}>
                <td><a href="#" className="wiki-link" onClick={(e) => { e.preventDefault(); go('note:' + n.path); }}>{n.title}</a></td>
                <td className="chr__muted">{folderOf(n.path).split('/').slice(-1)[0] || '—'}</td>
                {cells.map((c, i) => <td key={i}>{c.join(', ')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 400 && <p className="chr__muted">400 premières lignes sur {rows.length} — ajoute un filtre.</p>}
        {!rows.length && <p className="empty">Aucune note ne correspond à ces filtres.</p>}
      </div>

      <details className="wiki-coll__cols">
        <summary>Colonnes affichées</summary>
        <div className="wiki-coll__vals">
          {stats.slice(0, 40).map((s) => (
            <label key={s.key} className="wiki-chip wiki-chip--btn">
              <input type="checkbox" checked={shownCols.includes(s.key)} onChange={() => toggleCol(s.key)} /> {propLabel(s.key)}
            </label>
          ))}
        </div>
      </details>

      {stats.some((s) => s.values.some((v) => v.variants.length > 1)) && (
        <details className="wiki-coll__cols">
          <summary>Valeurs écrites de plusieurs façons</summary>
          <p className="chr__muted">Ces valeurs sont regroupées ici (casse et accents ignorés) mais écrites différemment selon les notes — à uniformiser en les éditant.</p>
          <ul className="wiki-back__list">
            {stats.flatMap((s) => s.values.filter((v) => v.variants.length > 1).map((v) => (
              <li key={s.key + v.value}><b>{propLabel(s.key)}</b> : {v.variants.join(' · ')}</li>
            )))}
          </ul>
        </details>
      )}
    </article>
  );
}
