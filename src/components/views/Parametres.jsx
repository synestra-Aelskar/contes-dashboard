import { useState } from 'react';
import { uid } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';

const TABS = [['temps', 'Temps']];

function TimeTypeRow({ row, mutate }) {
  const [name, setName, nameRef] = useSyncedField(row.name);
  const patch = (fn) =>
    mutate((s) => { const t = s.settings.timeTypes.find((x) => x.id === row.id); if (t) fn(t); });
  return (
    <div className="paramline">
      <input
        className="paramline__color" type="color" value={row.color || '#9a7330'}
        onChange={(e) => patch((t) => { t.color = e.target.value; })}
        aria-label="Couleur du type"
      />
      <input
        ref={nameRef} className="finput" type="text" placeholder="Nom du type (ex. Voyage, Repos, Enquête…)"
        value={name}
        onChange={(e) => { const v = e.target.value; setName(v); patch((t) => { t.name = v; }); }}
        onBlur={() => patch((t) => { t.name = name.trim(); })}
      />
      <button
        className="tbtn" type="button" aria-label="retirer ce type"
        onClick={() => mutate((s) => { s.settings.timeTypes = s.settings.timeTypes.filter((x) => x.id !== row.id); })}
      >
        ×
      </button>
    </div>
  );
}

function TempsPane({ state, mutate }) {
  const types = (state.settings && state.settings.timeTypes) || [];
  return (
    <div className="zone-pane">
      <div className="zone-pane__head">
        <span className="card__label">Temps</span>
      </div>
      <h3 className="ssn-h">Types d’évènement temporel</h3>
      <p className="dd-hint">
        Utilisés pour colorer les blocs de la barre de temps d’une séance (nom + couleur libre).
      </p>
      <div className="paramlist">
        {types.map((t) => <TimeTypeRow key={t.id} row={t} mutate={mutate} />)}
      </div>
      <button
        className="tbtn" type="button"
        onClick={() => mutate((s) => {
          s.settings = s.settings || { timeTypes: [] };
          s.settings.timeTypes = s.settings.timeTypes || [];
          s.settings.timeTypes.push({ id: uid(), name: '', color: '#9a7330' });
        })}
      >
        ＋ ajouter un type
      </button>
    </div>
  );
}

export default function Parametres({ state, mutate }) {
  const [tab, setTab] = useState(TABS[0][0]);
  return (
    <section className="chapter">
      <div className="chapter__head"><h2>Paramètres</h2></div>
      <div className="zones">
        <div className="zone-tree">
          {TABS.map(([key, label]) => (
            <div key={key} className="zone-node">
              <div className={'zone-node__row' + (tab === key ? ' is-sel' : '')}>
                <span className="zone-node__chev" style={{ visibility: 'hidden' }} />
                <button className="zone-node__label" type="button" onClick={() => setTab(key)}>
                  {label}
                </button>
              </div>
            </div>
          ))}
        </div>
        {tab === 'temps' && <TempsPane state={state} mutate={mutate} />}
      </div>
    </section>
  );
}
