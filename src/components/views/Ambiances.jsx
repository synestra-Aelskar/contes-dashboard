import { useState } from 'react';
import { uid, lsGet, lsSet } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { youtubeId } from '../../lib/prepsession.js';
import { collectAmbiances, flattenZones, makeManualAmbiance } from '../../lib/ambiances.js';

/* Page Ambiances (catégorie Trames) : toutes les ambiances sonores au même
 * endroit, triables par catégorie et par zone. Les manuelles vivent dans
 * state.ambiances ; celles des séances de Prep Session sont récupérées
 * automatiquement (et s'éditent ici, à la source). */

const FILTER_KEY = 'ccm.ambiances.filter';

function CategoryManager({ categories, mutate }) {
  const [draft, setDraft] = useState('');
  const patchCat = (id, fn) => mutate((s) => { const c = s.ambiances.categories.find((x) => x.id === id); if (c) fn(c); });
  function add(e) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    mutate((s) => { s.ambiances.categories.push({ id: uid(), name }); });
    setDraft('');
  }
  return (
    <div className="amb-cats">
      <form className="amb-cats__add" onSubmit={add}>
        <input className="finput" value={draft} placeholder="Nouvelle catégorie (Combat, Taverne…)" onChange={(e) => setDraft(e.target.value)} />
        <button className="tbtn" type="submit">＋ ajouter</button>
      </form>
      <div className="amb-cats__list">
        {categories.map((c) => (
          <CatRow key={c.id} cat={c} onRename={(v) => patchCat(c.id, (x) => { x.name = v; })}
            onRemove={() => {
              if (!window.confirm('Retirer la catégorie « ' + (c.name || 'sans nom') + ' » ? Ses ambiances passeront en « Sans catégorie ».')) return;
              mutate((s) => {
                s.ambiances.categories = s.ambiances.categories.filter((x) => x.id !== c.id);
                s.ambiances.items.forEach((i) => { if (i.categoryId === c.id) i.categoryId = ''; });
                (s.prepSessions || []).forEach((q) => q.sessions.forEach((se) => se.ambiances.forEach((i) => { if (i.categoryId === c.id) i.categoryId = ''; })));
              });
            }} />
        ))}
        {!categories.length && <span className="chr__muted">Aucune catégorie pour l’instant.</span>}
      </div>
    </div>
  );
}

function CatRow({ cat, onRename, onRemove }) {
  const [name, setName, ref] = useSyncedField(cat.name);
  return (
    <span className="amb-cat">
      <input ref={ref} className="amb-cat__input" value={name} aria-label="Nom de la catégorie"
        onChange={(e) => { const v = e.target.value; setName(v); onRename(v); }}
        onBlur={() => onRename(name.trim())} />
      <button type="button" className="amb-cat__x" aria-label="Retirer la catégorie" onClick={onRemove}>×</button>
    </span>
  );
}

function AmbCard({ entry, categories, zones, patch, onRemove }) {
  const { item } = entry;
  const [name, setName, nameRef] = useSyncedField(item.name);
  const [url, setUrl, urlRef] = useSyncedField(item.url);
  const [notes, setNotes, notesRef] = useSyncedField(item.notes);
  const vid = youtubeId(item.url);
  const href = /^https?:\/\//i.test(item.url) ? item.url : '';
  return (
    <div className="prep-amb">
      <a className={'prep-amb__thumb' + (vid ? '' : ' is-empty')} href={href || undefined} target="_blank" rel="noopener noreferrer"
        aria-label="Ouvrir le lien" onClick={(e) => { if (!href) e.preventDefault(); }}>
        {vid ? <img src={'https://img.youtube.com/vi/' + vid + '/mqdefault.jpg'} alt="" loading="lazy" /> : <span aria-hidden="true">♪</span>}
        {href && <span className="prep-amb__play" aria-hidden="true">▶</span>}
      </a>
      <div className="prep-amb__body">
        {entry.source === 'session' && <span className="amb-source" title="Récupérée depuis Prep Session">Séance : {entry.where}</span>}
        <input ref={nameRef} className="finput prep-amb__name" type="text" placeholder="Nom de l’ambiance" value={name}
          onChange={(e) => { const v = e.target.value; setName(v); patch((a) => { a.name = v; }); }}
          onBlur={() => patch((a) => { a.name = name.trim(); })} />
        <input ref={urlRef} className="field field--mono" type="text" placeholder="https://www.youtube.com/watch?v=…" value={url}
          onChange={(e) => { const v = e.target.value; setUrl(v); patch((a) => { a.url = v; }); }}
          onBlur={() => patch((a) => { a.url = url.trim(); })} />
        <div className="amb-selects">
          <select className="field" value={item.categoryId} aria-label="Catégorie" onChange={(e) => patch((a) => { a.categoryId = e.target.value; })}>
            <option value="">Sans catégorie</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name || 'Sans nom'}</option>)}
          </select>
          <select className="field" value={item.zoneId} aria-label="Zone" onChange={(e) => patch((a) => { a.zoneId = e.target.value; })}>
            <option value="">Sans zone</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
        </div>
        <textarea ref={notesRef} className="finput finput--area prep-amb__notes" placeholder="Notes" value={notes}
          onChange={(e) => { const v = e.target.value; setNotes(v); patch((a) => { a.notes = v; }); }}
          onBlur={() => patch((a) => { a.notes = notes; })} />
        {onRemove && <button className="tbtn prep-amb__del" type="button" onClick={onRemove}>retirer</button>}
      </div>
    </div>
  );
}

export default function Ambiances({ state, mutate }) {
  const lib = state.ambiances;
  const zones = flattenZones(state.zones);
  const [filter, setFilterRaw] = useState(() => { try { return JSON.parse(lsGet(FILTER_KEY) || '{}'); } catch (_) { return {}; } });
  const setFilter = (patch) => setFilterRaw((f) => { const n = { ...f, ...patch }; lsSet(FILTER_KEY, JSON.stringify(n)); return n; });
  const [query, setQuery] = useState('');
  const [showCats, setShowCats] = useState(false);

  const all = collectAmbiances(state);
  const q = query.trim().toLocaleLowerCase('fr');
  const shown = all.filter(({ item, where }) => {
    if (filter.cat === '__none__' ? item.categoryId : filter.cat && item.categoryId !== filter.cat) return false;
    if (filter.zone === '__none__' ? item.zoneId : filter.zone && item.zoneId !== filter.zone) return false;
    if (filter.source && filter.source !== (where ? 'session' : 'manual')) return false;
    return !q || [item.name, item.notes, item.url, where].filter(Boolean).join(' ').toLocaleLowerCase('fr').includes(q);
  });

  const patchEntry = (entry) => (fn) => mutate((s) => {
    if (entry.source === 'manual') {
      const i = s.ambiances.items.find((x) => x.id === entry.item.id);
      if (i) fn(i);
    } else {
      const qu = s.prepSessions.find((x) => x.id === entry.queteId);
      const se = qu && qu.sessions.find((x) => x.id === entry.sessionId);
      const i = se && se.ambiances.find((x) => x.id === entry.item.id);
      if (i) fn(i);
    }
  });

  // Regroupement par catégorie (dans l'ordre des catégories), « Sans catégorie » en dernier.
  const groups = [
    ...lib.categories.map((c) => ({ id: c.id, name: c.name || 'Sans nom', entries: shown.filter((e) => e.item.categoryId === c.id) })),
    { id: '', name: 'Sans catégorie', entries: shown.filter((e) => !lib.categories.some((c) => c.id === e.item.categoryId)) }
  ].filter((g) => g.entries.length);

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Ambiances<span className="count"> ({all.length})</span></h2>
        <span className="amb-head-actions">
          <button className="tbtn" type="button" onClick={() => setShowCats((v) => !v)}>{showCats ? 'masquer les catégories' : 'catégories'}</button>
          <button className="tbtn" type="button"
            onClick={() => mutate((s) => { s.ambiances.items.push(makeManualAmbiance(filter.cat && filter.cat !== '__none__' ? filter.cat : '', filter.zone && filter.zone !== '__none__' ? filter.zone : '')); })}>
            ＋ nouvelle ambiance
          </button>
        </span>
      </div>

      {showCats && <CategoryManager categories={lib.categories} mutate={mutate} />}

      <div className="amb-filters">
        <input type="search" className="finput amb-filters__search" placeholder="Rechercher…" aria-label="Rechercher une ambiance" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="field" value={filter.cat || ''} aria-label="Filtrer par catégorie" onChange={(e) => setFilter({ cat: e.target.value })}>
          <option value="">Toutes les catégories</option>
          {lib.categories.map((c) => <option key={c.id} value={c.id}>{c.name || 'Sans nom'}</option>)}
          <option value="__none__">Sans catégorie</option>
        </select>
        <select className="field" value={filter.zone || ''} aria-label="Filtrer par zone" onChange={(e) => setFilter({ zone: e.target.value })}>
          <option value="">Toutes les zones</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
          <option value="__none__">Sans zone</option>
        </select>
        <select className="field" value={filter.source || ''} aria-label="Filtrer par origine" onChange={(e) => setFilter({ source: e.target.value })}>
          <option value="">Toutes origines</option>
          <option value="manual">Ajoutées ici</option>
          <option value="session">Issues des séances</option>
        </select>
      </div>

      {!all.length ? (
        <p className="empty">Aucune ambiance. Ajoutes-en ici, ou dans l’onglet Ambiance d’une séance de Prep Session : elles remontent toutes seules sur cette page.</p>
      ) : !shown.length ? (
        <p className="empty">Aucune ambiance ne correspond à ces filtres.</p>
      ) : groups.map((g) => (
        <div key={g.id || 'none'} className="amb-group">
          <h4 className="chr__h">{g.name}<span className="count"> ({g.entries.length})</span></h4>
          <div className="prep-ambgrid">
            {g.entries.map((e) => (
              <AmbCard key={e.key} entry={e} categories={lib.categories} zones={zones} patch={patchEntry(e)}
                onRemove={e.source === 'manual' ? () => mutate((s) => { s.ambiances.items = s.ambiances.items.filter((x) => x.id !== e.item.id); }) : null} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
