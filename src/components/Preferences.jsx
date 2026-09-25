import { useState } from 'react';
import { UI_SCALES, getUiScale, setUiScale, applyUiScale } from '../lib/prefs.js';
import { lsGet, lsSet } from '../lib/util.js';

const TABS = [['ui', 'UI']];
const AVATAR_KEY = 'ccm.mjThread.avatar';

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

function AvatarPane({ state }) {
  const chars = state.characters || [];
  const accounts = (state.settings && state.settings.accounts) || [];
  const mjChars = chars.filter((c) => accounts.some((a) => a.role === 'admin' && a.userId === c.ownerId));
  const [avatarUrl, setAvatarUrl] = useState(() => lsGet(AVATAR_KEY) || '');
  const [customDraft, setCustomDraft] = useState('');

  function choose(url) {
    setAvatarUrl(url || '');
    lsSet(AVATAR_KEY, url || '');
  }

  return (
    <>
      <h4 className="ssn-h">Avatar par défaut (Backstage)</h4>
      <p className="dd-hint">
        Propre à ce compte / ce navigateur — l’avatar utilisé par défaut quand tu réponds dans un
        thread Backstage. Tu peux toujours le changer ponctuellement depuis le thread lui-même.
      </p>
      {mjChars.length > 0 && (
        <div className="prefs__avatars">
          {mjChars.map((c) => (
            <button
              key={c.id} type="button" title={c.name || 'Personnage'}
              className={'prefs__avatarbtn' + (avatarUrl === c.artUrl ? ' is-active' : '')}
              onClick={() => choose(c.artUrl)}
            >
              {c.artUrl ? <img src={c.artUrl} alt="" /> : <span>{(c.name || '?')[0]}</span>}
            </button>
          ))}
        </div>
      )}
      <label className="flabel">
        Ou lien d’image
        <input
          className="field field--mono" type="text" placeholder="https://…"
          value={customDraft}
          onChange={(e) => setCustomDraft(e.target.value)}
          onBlur={() => { if (customDraft.trim()) { choose(customDraft.trim()); setCustomDraft(''); } }}
        />
      </label>
      {avatarUrl && (
        <div className="prefs__avatarcur">
          <span className="chr__muted">Actuel :</span>
          <span className="prefs__avatarbtn is-active"><img src={avatarUrl} alt="" /></span>
        </div>
      )}
    </>
  );
}

export default function Preferences({ onClose, state, role }) {
  const tabs = role === 'admin' ? [...TABS, ['avatar', 'Backstage']] : TABS;
  const [tab, setTab] = useState(tabs[0][0]);
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card prefs__card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Préférences</h3>
        <div className="prefs__body">
          <div className="zone-tree prefs__tree">
            {tabs.map(([key, label]) => (
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
            {tab === 'avatar' && role === 'admin' && <AvatarPane state={state} />}
          </div>
        </div>
        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
