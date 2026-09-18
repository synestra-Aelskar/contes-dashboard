import { useState } from 'react';
import { UI_SCALES, getUiScale, setUiScale, applyUiScale } from '../lib/prefs.js';

const TABS = [['ui', 'UI']];

function UiPane() {
  const [scale, setScale] = useState(getUiScale());
  function pick(id) {
    setScale(id);
    setUiScale(id);
    applyUiScale(id);
  }
  return (
    <>
      <h4 className="ssn-h">Taille d’affichage</h4>
      <p className="dd-hint">
        Propre à ce compte / ce navigateur — n’affecte pas l’autre MJ, et reste appliqué à chaque
        connexion.
      </p>
      <div className="prefs__scales">
        {UI_SCALES.map((s) => (
          <button
            key={s.id} type="button"
            className={'clock__kindbtn' + (scale === s.id ? ' is-on' : '')}
            onClick={() => pick(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </>
  );
}

export default function Preferences({ onClose }) {
  const [tab, setTab] = useState(TABS[0][0]);
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card prefs__card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Préférences</h3>
        <div className="prefs__body">
          <div className="zone-tree prefs__tree">
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
          <div className="prefs__pane">
            {tab === 'ui' && <UiPane />}
          </div>
        </div>
        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
