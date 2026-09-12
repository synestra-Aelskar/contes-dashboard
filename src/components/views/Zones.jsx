import { useState } from 'react';
import { uid, lsGet, lsSet } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import {
  ZONE_LABELS, childKindOf, makeZoneNode, findZonePath, mutateZoneNode, removeZoneNode
} from '../../lib/zones.js';

/* --- sommaire (arbre) --------------------------------------------- */

function ZoneTreeNode({ node, selectedId, onSelect }) {
  const [open, setOpen] = useState(true);
  const kids = node.children || [];
  return (
    <div className="zone-node">
      <div className={'zone-node__row' + (node.id === selectedId ? ' is-sel' : '')}>
        <button
          className="zone-node__chev" type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ visibility: kids.length ? 'visible' : 'hidden' }}
          aria-label={open ? 'replier' : 'déplier'}
        >
          {open ? '▾' : '▸'}
        </button>
        <button className="zone-node__label" type="button" onClick={() => onSelect(node.id)}>
          {node.name || 'Sans nom'}
        </button>
      </div>
      {open && kids.length > 0 && (
        <div className="zone-node__kids">
          {kids.map((c) => (
            <ZoneTreeNode key={c.id} node={c} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

/* --- liste aura / skybox -------------------------------------------- */

function AuraRow({ node, row, mutate }) {
  const [name, setName, nameRef] = useSyncedField(row.name);
  const [value, setValue, valueRef] = useSyncedField(row.value);
  const patch = (fn) =>
    mutate((s) => {
      mutateZoneNode(s.zones, node.id, (n) => {
        const r = (n.auras || []).find((x) => x.id === row.id);
        if (r) fn(r);
      });
    });
  return (
    <div className="aura-row">
      <input
        ref={nameRef} className="finput" type="text" placeholder="Aura, ambiance, skybox…"
        value={name}
        onChange={(e) => { const v = e.target.value; setName(v); patch((r) => { r.name = v; }); }}
        onBlur={() => patch((r) => { r.name = name.trim(); })}
      />
      <input
        ref={valueRef} className="finput aura-row__val" type="text" inputMode="numeric" placeholder="Nombre"
        value={value}
        onChange={(e) => { const v = e.target.value; setValue(v); patch((r) => { r.value = v; }); }}
        onBlur={() => patch((r) => { r.value = value.trim(); })}
      />
      <button
        className="tbtn" type="button" aria-label="retirer"
        onClick={() =>
          mutate((s) => {
            mutateZoneNode(s.zones, node.id, (n) => { n.auras = (n.auras || []).filter((x) => x.id !== row.id); });
          })
        }
      >
        ×
      </button>
    </div>
  );
}

/* --- fiche du nœud sélectionné --------------------------------------- */

function ZonePane({ node, path, mutate, onSelect }) {
  const [name, setName, nameRef] = useSyncedField(node.name);
  const [desc, setDesc, descRef] = useSyncedField(node.description);
  const [meteo, setMeteo, meteoRef] = useSyncedField(node.meteo);
  const patch = (fn) => mutate((s) => { mutateZoneNode(s.zones, node.id, fn); });
  const childKind = childKindOf(node.kind);
  const kids = node.children || [];

  function addChild() {
    const c = makeZoneNode(childKind);
    patch((n) => { n.children = n.children || []; n.children.push(c); });
    onSelect(c.id);
  }

  function removeSelf() {
    if (!window.confirm('Supprimer « ' + (node.name || ZONE_LABELS[node.kind]) + ' » et tout son contenu ?')) return;
    const parentId = path.length > 1 ? path[path.length - 2].id : null;
    mutate((s) => { removeZoneNode(s.zones, node.id); });
    onSelect(parentId);
  }

  return (
    <div className="zone-pane">
      <div className="zone-pane__crumb">
        {path.map((p, i) => (
          <span key={p.id}>
            {i > 0 && ' › '}
            {i === path.length - 1 ? (
              p.name || 'Sans nom'
            ) : (
              <button className="zone-crumb__link" type="button" onClick={() => onSelect(p.id)}>
                {p.name || 'Sans nom'}
              </button>
            )}
          </span>
        ))}
      </div>

      <div className="zone-pane__head">
        <span className="card__label">{ZONE_LABELS[node.kind]}</span>
        <input
          ref={nameRef} className="field zone-pane__name" type="text"
          placeholder={'Nom du ' + ZONE_LABELS[node.kind].toLowerCase()}
          value={name}
          onChange={(e) => { const v = e.target.value; setName(v); patch((n) => { n.name = v; }); }}
          onBlur={() => patch((n) => { n.name = name.trim(); })}
        />
        <div className="zone-pane__actions">
          {childKind && (
            <button className="tbtn" type="button" onClick={addChild}>
              ＋ {ZONE_LABELS[childKind].toLowerCase()}
            </button>
          )}
          <button className="tbtn" type="button" onClick={removeSelf}>supprimer</button>
        </div>
      </div>

      <div className="zone-grid">
        <div className="zone-pane__main">
          <label className="flabel">
            Description
            <textarea
              ref={descRef} className="notes" placeholder="Ce qui caractérise cet endroit…"
              value={desc}
              onChange={(e) => { const v = e.target.value; setDesc(v); patch((n) => { n.description = v; }); }}
              onBlur={() => patch((n) => { n.description = desc; })}
            />
          </label>

          <label className="flabel">
            Météo
            <textarea
              ref={meteoRef} className="notes notes--sm" placeholder="Climat, conditions habituelles ou notables…"
              value={meteo}
              onChange={(e) => { const v = e.target.value; setMeteo(v); patch((n) => { n.meteo = v; }); }}
              onBlur={() => patch((n) => { n.meteo = meteo; })}
            />
          </label>

          {kids.length > 0 && (
            <div className="zone-pane__kids">
              <h4 className="chr__h">{(childKind && ZONE_LABELS[childKind]) || 'Contenu'}<span className="count"> ({kids.length})</span></h4>
              <div className="chips">
                {kids.map((k) => (
                  <button key={k.id} type="button" className="chip" onClick={() => onSelect(k.id)}>
                    {k.name || 'Sans nom'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="zone-pane__side">
          <h4 className="chr__h">Aura / Skybox<span className="count"> ({(node.auras || []).length})</span></h4>
          <div className="auralist">
            {(node.auras || []).map((r) => <AuraRow key={r.id} node={node} row={r} mutate={mutate} />)}
            <button
              className="tbtn" type="button"
              onClick={() => patch((n) => { n.auras = n.auras || []; n.auras.push({ id: uid(), name: '', value: '' }); })}
            >
              ＋ ajouter une entrée
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- vue principale --------------------------------------------------- */

export default function Zones({ state, mutate }) {
  const tree = state.zones || [];
  const [selId, setSelId] = useState(lsGet('ccm.zone') || null);

  function select(id) { setSelId(id); lsSet('ccm.zone', id || ''); }

  function addPays() {
    const c = makeZoneNode('pays');
    mutate((s) => { s.zones.push(c); });
    select(c.id);
  }

  const path = selId ? findZonePath(tree, selId) : null;
  const node = path ? path[path.length - 1] : null;

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Zone<span className="count"> ({tree.length})</span></h2>
        <button className="tbtn" type="button" onClick={addPays}>＋ nouveau pays</button>
      </div>

      {!tree.length ? (
        <p className="empty">
          Aucun pays pour l’instant. La hiérarchie va du pays à la région, à la zone, puis au lieu —
          chacun a sa propre fiche : description, météo, aura / skybox.
        </p>
      ) : (
        <div className="zones">
          <div className="zone-tree">
            {tree.map((n) => <ZoneTreeNode key={n.id} node={n} selectedId={selId} onSelect={select} />)}
          </div>
          {node ? (
            <ZonePane node={node} path={path} mutate={mutate} onSelect={select} />
          ) : (
            <p className="empty">Sélectionne un élément dans le sommaire à gauche.</p>
          )}
        </div>
      )}
    </section>
  );
}
