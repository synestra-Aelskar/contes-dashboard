import { useState } from 'react';
import { lsGet, lsSet } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import {
  makeQuete, makeSession, makeXpBlock, allBaremeOptions, resolveBlockXp, sessionTotal, BRANCH_KIND_VAR
} from '../../lib/prepsession.js';

const LOCAL_KEY = 'ccm.prep';

/* --- sommaire (arbre) --------------------------------------------- */

function QueteTreeNode({ quete, selKey, onSelect }) {
  const [open, setOpen] = useState(true);
  const kids = quete.sessions || [];
  const isQueteSel = selKey === 'q:' + quete.id;
  return (
    <div className="zone-node">
      <div className={'zone-node__row' + (isQueteSel ? ' is-sel' : '')}>
        <button
          className="zone-node__chev" type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ visibility: kids.length ? 'visible' : 'hidden' }}
          aria-label={open ? 'replier' : 'déplier'}
        >
          {open ? '▾' : '▸'}
        </button>
        <button className="zone-node__label" type="button" onClick={() => onSelect('q:' + quete.id)}>
          {quete.name || 'Sans nom'}
        </button>
      </div>
      {open && kids.length > 0 && (
        <div className="zone-node__kids">
          {kids.map((s) => {
            const key = 's:' + quete.id + ':' + s.id;
            return (
              <div key={s.id} className="zone-node">
                <div className={'zone-node__row' + (selKey === key ? ' is-sel' : '')}>
                  <span className="zone-node__chev" style={{ visibility: 'hidden' }} />
                  <button className="zone-node__label" type="button" onClick={() => onSelect(key)}>
                    {s.title || 'Sans titre'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --- bloc d'XP (dans une séance) ----------------------------------- */

function XpBlockRow({ quete, session, block, mutate, options, xpCalibreur }) {
  const [titre, setTitre, titreRef] = useSyncedField(block.titre);
  const [desc, setDesc, descRef] = useSyncedField(block.description);
  const patch = (fn) =>
    mutate((s) => {
      const q = s.prepSessions.find((x) => x.id === quete.id);
      const sess = q && q.sessions.find((x) => x.id === session.id);
      const b = sess && sess.xpBlocks.find((x) => x.id === block.id);
      if (b) fn(b);
    });

  const selIdx = options.findIndex((o) => o.branchKey === block.branchKey && o.itemName === block.itemName);
  const value = resolveBlockXp(block, xpCalibreur);
  const branchColor = BRANCH_KIND_VAR[block.branchKey];

  return (
    <div className="prep-block" style={branchColor ? { '--prep-branch': branchColor } : undefined}>
      <input
        ref={titreRef} className="finput" type="text" placeholder="Intitulé du bloc"
        value={titre}
        onChange={(e) => { const v = e.target.value; setTitre(v); patch((b) => { b.titre = v; }); }}
        onBlur={() => patch((b) => { b.titre = titre.trim(); })}
      />
      <textarea
        ref={descRef} className="finput finput--area prep-block__desc" placeholder="Description…"
        value={desc}
        onChange={(e) => { const v = e.target.value; setDesc(v); patch((b) => { b.description = v; }); }}
        onBlur={() => patch((b) => { b.description = desc; })}
      />
      <div className="prep-block__row">
        <select
          className="field" value={selIdx >= 0 ? String(selIdx) : ''}
          onChange={(e) => {
            const opt = options[parseInt(e.target.value, 10)];
            patch((b) => {
              b.branchKey = opt ? opt.branchKey : '';
              b.itemName = opt ? opt.itemName : '';
              b.xpSnapshot = opt ? opt.xp : 0;
            });
          }}
        >
          <option value="">— catégorie —</option>
          {options.map((o, i) => <option key={o.branchKey + '_' + o.itemName + '_' + i} value={i}>{o.label}</option>)}
        </select>
        <span className="prep-block__xp">{value} XP</span>
        <button
          className="tbtn" type="button" aria-label="retirer ce bloc"
          onClick={() =>
            mutate((s) => {
              const q = s.prepSessions.find((x) => x.id === quete.id);
              const sess = q && q.sessions.find((x) => x.id === session.id);
              if (sess) sess.xpBlocks = sess.xpBlocks.filter((x) => x.id !== block.id);
            })
          }
        >
          ×
        </button>
      </div>
    </div>
  );
}

/* --- fiche d'une séance ---------------------------------------------- */

function SessionPane({ quete, session, mutate, xpCalibreur, onSelect }) {
  const [title, setTitle, titleRef] = useSyncedField(session.title);
  const [desc, setDesc, descRef] = useSyncedField(session.description);
  const patch = (fn) =>
    mutate((s) => {
      const q = s.prepSessions.find((x) => x.id === quete.id);
      const sess = q && q.sessions.find((x) => x.id === session.id);
      if (sess) fn(sess);
    });

  const total = sessionTotal(session, xpCalibreur);
  const options = allBaremeOptions(xpCalibreur);

  return (
    <div className="zone-pane">
      <div className="zone-pane__crumb">
        <button className="zone-crumb__link" type="button" onClick={() => onSelect('q:' + quete.id)}>
          {quete.name || 'Sans nom'}
        </button>
        {' › '}{session.title || 'Sans titre'}
      </div>

      <div className="zone-pane__head">
        <span className="card__label">Session</span>
        <input
          ref={titleRef} className="field zone-pane__name" type="text" placeholder="Titre de la session"
          value={title}
          onChange={(e) => { const v = e.target.value; setTitle(v); patch((s) => { s.title = v; }); }}
          onBlur={() => patch((s) => { s.title = title.trim(); })}
        />
        <div className="zone-pane__actions">
          <button
            className="tbtn" type="button"
            onClick={() => {
              if (!window.confirm('Supprimer « ' + (session.title || '') + ' » ?')) return;
              mutate((s) => {
                const q = s.prepSessions.find((x) => x.id === quete.id);
                if (q) q.sessions = q.sessions.filter((x) => x.id !== session.id);
              });
              onSelect('q:' + quete.id);
            }}
          >
            supprimer
          </button>
        </div>
      </div>

      <div className="prep-stack">
        <label className="flabel">
          Description
          <textarea
            ref={descRef} className="notes" placeholder="Ce qui se passe dans cette séance…"
            value={desc}
            onChange={(e) => { const v = e.target.value; setDesc(v); patch((s) => { s.description = v; }); }}
            onBlur={() => patch((s) => { s.description = desc; })}
          />
        </label>

        <div className="prep-xpzone">
          <div className="prep-total">
            <span className="prep-total__label">Total XP de la séance</span>
            <span className="prep-total__value">{total}</span>
          </div>
          <div className="prep-blockgrid">
            {session.xpBlocks.map((b) => (
              <XpBlockRow
                key={b.id} quete={quete} session={session} block={b} mutate={mutate}
                options={options} xpCalibreur={xpCalibreur}
              />
            ))}
          </div>
          <button
            className="tbtn" type="button"
            onClick={() => patch((s) => { s.xpBlocks.push(makeXpBlock()); })}
          >
            ＋ ajouter un bloc
          </button>
        </div>
      </div>
    </div>
  );
}

/* --- fiche d'une quête ------------------------------------------------ */

function QuetePane({ quete, mutate, xpCalibreur, onSelect }) {
  const [name, setName, nameRef] = useSyncedField(quete.name);
  const patch = (fn) =>
    mutate((s) => { const q = s.prepSessions.find((x) => x.id === quete.id); if (q) fn(q); });

  const totalAll = (quete.sessions || []).reduce((n, s) => n + sessionTotal(s, xpCalibreur), 0);

  function addSession() {
    const sNew = makeSession(quete);
    patch((q) => { q.sessions.push(sNew); });
    onSelect('s:' + quete.id + ':' + sNew.id);
  }

  return (
    <div className="zone-pane">
      <div className="zone-pane__head">
        <span className="card__label">Quête</span>
        <input
          ref={nameRef} className="field zone-pane__name" type="text" placeholder="Nom de la quête"
          value={name}
          onChange={(e) => { const v = e.target.value; setName(v); patch((q) => { q.name = v; }); }}
          onBlur={() => patch((q) => { q.name = name.trim(); })}
        />
        <div className="zone-pane__actions">
          <button className="tbtn" type="button" onClick={addSession}>＋ nouvelle session</button>
          <button
            className="tbtn" type="button"
            onClick={() => {
              if (!window.confirm('Supprimer « ' + (quete.name || '') + ' » et toutes ses séances ?')) return;
              mutate((s) => { s.prepSessions = s.prepSessions.filter((x) => x.id !== quete.id); });
              onSelect(null);
            }}
          >
            supprimer
          </button>
        </div>
      </div>

      <p className="dd-hint">XP total cumulé de la quête : <b>{totalAll}</b></p>

      {quete.sessions && quete.sessions.length > 0 ? (
        <div className="zone-pane__kids">
          <h4 className="chr__h">Sessions<span className="count"> ({quete.sessions.length})</span></h4>
          <div className="chips">
            {quete.sessions.map((s) => (
              <button key={s.id} type="button" className="chip" onClick={() => onSelect('s:' + quete.id + ':' + s.id)}>
                {s.title || 'Sans titre'}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="empty">Aucune séance pour l’instant.</p>
      )}
    </div>
  );
}

/* --- vue principale --------------------------------------------------- */

export default function PrepSession({ state, mutate }) {
  const questes = state.prepSessions || [];
  const [selKey, setSelKey] = useState(lsGet(LOCAL_KEY) || null);

  function select(key) { setSelKey(key); lsSet(LOCAL_KEY, key || ''); }

  function addQuete() {
    const q = makeQuete();
    mutate((s) => { s.prepSessions.push(q); });
    select('q:' + q.id);
  }

  let selQuete = null, selSession = null;
  if (selKey && selKey.indexOf('q:') === 0) {
    selQuete = questes.find((q) => q.id === selKey.slice(2));
  } else if (selKey && selKey.indexOf('s:') === 0) {
    const [, qid, sid] = selKey.split(':');
    selQuete = questes.find((q) => q.id === qid);
    selSession = selQuete && selQuete.sessions.find((s) => s.id === sid);
  }

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Prep Session<span className="count"> ({questes.length})</span></h2>
        <button className="tbtn" type="button" onClick={addQuete}>＋ nouvelle quête</button>
      </div>

      {!questes.length ? (
        <p className="empty">
          Aucune quête pour l’instant. Chaque quête regroupe ses séances ; chaque séance a sa
          description et son calculateur d’XP (blocs classés par type d’événement du Calibreur d’XP).
        </p>
      ) : (
        <div className="zones">
          <div className="zone-tree">
            {questes.map((q) => <QueteTreeNode key={q.id} quete={q} selKey={selKey} onSelect={select} />)}
          </div>
          {selSession ? (
            <SessionPane
              quete={selQuete} session={selSession} mutate={mutate}
              xpCalibreur={state.xpCalibreur} onSelect={select}
            />
          ) : selQuete ? (
            <QuetePane quete={selQuete} mutate={mutate} xpCalibreur={state.xpCalibreur} onSelect={select} />
          ) : (
            <p className="empty">Sélectionne une quête ou une séance dans le sommaire à gauche.</p>
          )}
        </div>
      )}
    </section>
  );
}
