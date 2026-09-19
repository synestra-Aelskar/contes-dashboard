import { useState } from 'react';
import { uid, lsGet, lsSet } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { levelForXp } from '../../lib/xpCalibreur.js';
import SessionLink from '../SessionLink.jsx';
import CharIdPanel from '../CharIdPanel.jsx';
import ThreadBoard from '../ThreadBoard.jsx';

const TABS = [
  ['info', 'Informations'],
  ['xp', 'Suivi'],
  ['journal', 'Journal'],
  ['traits', 'Traits'],
  ['backstage', 'Backstage']
];

/* ------------------------------------------------------------------ */

function XpRow({ char, row, mutate, sessions, goToSession }) {
  const [amount, setAmount, amountRef] = useSyncedField(row.amount);
  const [reason, setReason, reasonRef] = useSyncedField(row.reason);

  const patch = (fn) =>
    mutate((s) => {
      const c = s.characters.find((x) => x.id === char.id);
      const r = c && (c.xp || []).find((x) => x.id === row.id);
      if (r) fn(r);
    });

  return (
    <div className="xprow xprow--char">
      <input
        ref={amountRef} className="field field--xp" type="text" inputMode="numeric" placeholder="XP"
        value={amount}
        onChange={(e) => { const v = e.target.value; setAmount(v); patch((r) => { r.amount = v; }); }}
        onBlur={() => patch((r) => { r.amount = amount.trim(); })}
      />
      <textarea
        ref={reasonRef} className="field field--area" rows={2} placeholder="Raison du gain"
        value={reason}
        onChange={(e) => { const v = e.target.value; setReason(v); patch((r) => { r.reason = v; }); }}
        onBlur={() => patch((r) => { r.reason = reason.trim(); })}
      />
      <div className="xprow__date">
        <select
          className="field" value={row.sessionId || ''}
          onChange={(e) => patch((r) => { r.sessionId = e.target.value || null; })}
        >
          <option value="">— séance —</option>
          {(sessions || []).map((s) => <option key={s.id} value={s.id}>{s.title || 'Séance'}</option>)}
        </select>
        <SessionLink sessions={sessions} sessionId={row.sessionId} goToSession={goToSession} />
      </div>
      <button
        className="tbtn" type="button" aria-label="retirer la ligne"
        onClick={() => mutate((s) => {
          const c = s.characters.find((x) => x.id === char.id);
          if (c) c.xp = (c.xp || []).filter((x) => x.id !== row.id);
        })}
      >
        ×
      </button>
    </div>
  );
}

function AdminInfoTab({ char, mutate }) {
  const [description, setDescription, descRef] = useSyncedField(char.description);
  const [qualite, setQualite, qRef] = useSyncedField(char.qualite);
  const [defaut, setDefaut, dRef] = useSyncedField(char.defaut);
  const [peurs, setPeurs, pRef] = useSyncedField(char.peurs);
  const [mjNote, setMjNote, mjRef] = useSyncedField(char.mjNote);

  const patch = (fn) =>
    mutate((s) => { const c = s.characters.find((x) => x.id === char.id); if (c) fn(c); });

  return (
    <div className="chr__main">
      <label className="flabel">
        Description
        <textarea
          ref={descRef} className="notes pj__descarea" placeholder="Qui est ce personnage ?"
          value={description}
          onChange={(e) => { const v = e.target.value; setDescription(v); patch((c) => { c.description = v; }); }}
          onBlur={() => patch((c) => { c.description = description; })}
        />
      </label>
      <label className="flabel">
        Qualité
        <input
          ref={qRef} className="field" type="text" placeholder="Une qualité marquante"
          value={qualite}
          onChange={(e) => { const v = e.target.value; setQualite(v); patch((c) => { c.qualite = v; }); }}
          onBlur={() => patch((c) => { c.qualite = qualite.trim(); })}
        />
      </label>
      <label className="flabel">
        Défaut
        <input
          ref={dRef} className="field" type="text" placeholder="Un défaut marquant"
          value={defaut}
          onChange={(e) => { const v = e.target.value; setDefaut(v); patch((c) => { c.defaut = v; }); }}
          onBlur={() => patch((c) => { c.defaut = defaut.trim(); })}
        />
      </label>
      <label className="flabel">
        Peurs
        <input
          ref={pRef} className="field" type="text" placeholder="Ce qui l’effraie"
          value={peurs}
          onChange={(e) => { const v = e.target.value; setPeurs(v); patch((c) => { c.peurs = v; }); }}
          onBlur={() => patch((c) => { c.peurs = peurs.trim(); })}
        />
      </label>
      <label className="flabel">
        Note MJ
        <textarea
          ref={mjRef} className="notes" placeholder="Tout ce que le MJ garde en tête sur ce personnage…"
          value={mjNote}
          onChange={(e) => { const v = e.target.value; setMjNote(v); patch((c) => { c.mjNote = v; }); }}
          onBlur={() => patch((c) => { c.mjNote = mjNote; })}
        />
      </label>
      <div className="card__actions">
        <button
          className="tbtn" type="button"
          onClick={() => {
            if (!window.confirm('Supprimer le personnage « ' + (char.name || '') + ' » ?')) return;
            mutate((s) => { s.characters = s.characters.filter((x) => x.id !== char.id); });
          }}
        >
          supprimer ce personnage
        </button>
      </div>
    </div>
  );
}

function AdminXpTab({ state, char, mutate, goToSession }) {
  const patch = (fn) =>
    mutate((s) => { const c = s.characters.find((x) => x.id === char.id); if (c) fn(c); });

  const participations = (state.sessions || []).filter(
    (s) => (s.participants || []).indexOf(char.id) >= 0
  );
  const xp = char.xp || [];
  const events = char.events || [];
  const recaps = char.recaps || [];
  const totalXp = xp.reduce((n, r) => n + (parseInt(r.amount, 10) || 0), 0);

  return (
    <div className="chr__main">
      <div className="chr__block">
        <h4 className="chr__h">Participation<span className="count"> ({participations.length})</span></h4>
        {participations.length ? (
          <ul className="chr__list">
            {participations.map((s) => (
              <li key={s.id}>
                <SessionLink sessions={state.sessions} sessionId={s.id} goToSession={goToSession} />
                {s.date ? <span className="chr__muted"> · {s.date}</span> : null}
              </li>
            ))}
          </ul>
        ) : <p className="chr__muted">Aucune séance.</p>}
      </div>

      <div className="chr__block">
        <h4 className="chr__h">XP<span className="count"> (total {totalXp})</span></h4>
        <div className="xptable xptable--char">
          <div className="xptable__head"><span>XP</span><span>Raison</span><span /></div>
          {xp.map((r) => (
            <XpRow
              key={r.id} char={char} row={r} mutate={mutate}
              sessions={state.sessions} goToSession={goToSession}
            />
          ))}
          <button
            className="tbtn" type="button"
            onClick={() => patch((c) => { c.xp = c.xp || []; c.xp.push({ id: uid(), amount: '', reason: '', sessionId: null }); })}
          >
            ＋ ligne
          </button>
        </div>
      </div>

      {events.length > 0 && (
        <div className="chr__block">
          <h4 className="chr__h">Événements<span className="count"> ({events.length})</span></h4>
          <ul className="chr__list">
            {events.map((ev) => (
              <li key={ev.id}>
                <span className="chr__evt">{ev.description || '—'}</span>{' '}
                <SessionLink sessions={state.sessions} sessionId={ev.sessionId} goToSession={goToSession} />
                <button
                  className="tbtn chr__x" type="button" aria-label="retirer"
                  onClick={() => patch((c) => { c.events = (c.events || []).filter((x) => x.id !== ev.id); })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recaps.length > 0 && (
        <div className="chr__block">
          <h4 className="chr__h">Résumés MJ reçus</h4>
          {recaps.map((rc) => (
            <div key={rc.id} className="chr__recap">
              <SessionLink sessions={state.sessions} sessionId={rc.sessionId} goToSession={goToSession} />
              <p className="chr__recaptxt">{rc.summary || '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminJournalTab({ char }) {
  const entries = char.journal || [];
  return (
    <div className="chr__main">
      <h4 className="chr__h">Journal d’aventure<span className="count"> ({entries.length})</span></h4>
      {entries.length ? (
        <div className="pj__entries">
          {entries.slice().reverse().map((entry) => (
            <div key={entry.id} className="pj__entry">
              <div className="pj__entryhead">
                <b>{entry.title || 'Sans titre'}</b>
                {entry.category && <span className="chr__muted">{entry.category}</span>}
              </div>
              {entry.text && <p className="chr__recaptxt">{entry.text}</p>}
              {(entry.screenshots || []).length > 0 && (
                <div className="pj__shots">
                  {entry.screenshots.map((shot) => (
                    <div key={shot.id} className="pj__shot">
                      <a href={shot.url} target="_blank" rel="noopener noreferrer">
                        <img className="pj__shotimg" src={shot.url} alt="" />
                      </a>
                      {shot.caption && <p className="chr__muted">{shot.caption}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : <p className="empty">Ce personnage n’a pas encore de note de journal.</p>}
    </div>
  );
}

function AdminTraitsTab({ char, mutate }) {
  const traits = char.traits || [];
  return (
    <div className="chr__main">
      <h4 className="chr__h">Traits<span className="count"> ({traits.length})</span></h4>
      {traits.length ? (
        <div className="pj__traits">
          {traits.map((trait) => <TraitAdminBlock key={trait.id} char={char} trait={trait} mutate={mutate} />)}
        </div>
      ) : <p className="empty">Aucun trait proposé par ce personnage.</p>}
    </div>
  );
}

function AdminBackstageTab({ state, char, mutate }) {
  return (
    <div className="chr__main">
      <ThreadBoard
        state={state} mutate={mutate}
        scopeCharId={char.id} authorId="mj" authorName="MJ"
        canCreate={false} storageKey={'ccm.mjThread.' + char.id}
      />
    </div>
  );
}

function CharPane({ state, char, mutate, goToSession }) {
  const [tab, setTab] = useState(lsGet('ccm.charTab') || 'info');
  const patch = (fn) =>
    mutate((s) => { const c = s.characters.find((x) => x.id === char.id); if (c) fn(c); });
  const totalXp = (char.xp || []).reduce((n, r) => n + (parseInt(r.amount, 10) || 0), 0);
  const level = levelForXp(state.xpCalibreur, totalXp);

  function setTabAndSave(t) { setTab(t); lsSet('ccm.charTab', t); }

  let content;
  if (tab === 'xp') content = <AdminXpTab state={state} char={char} mutate={mutate} goToSession={goToSession} />;
  else if (tab === 'journal') content = <AdminJournalTab char={char} />;
  else if (tab === 'traits') content = <AdminTraitsTab char={char} mutate={mutate} />;
  else if (tab === 'backstage') content = <AdminBackstageTab state={state} char={char} mutate={mutate} />;
  else content = <AdminInfoTab char={char} mutate={mutate} />;

  return (
    <div className="pj">
      <nav className="pj__nav">
        {TABS.map(([key, label]) => (
          <button
            key={key} type="button"
            className={'pj__navbtn' + (tab === key ? ' is-active' : '')}
            onClick={() => setTabAndSave(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="pj__body">{content}</div>
      <CharIdPanel char={char} patch={patch} level={level} />
    </div>
  );
}

function TraitAdminBlock({ char, trait, mutate }) {
  const [mjNote, setMjNote, mjRef] = useSyncedField(trait.mjNote);
  const patch = (fn) =>
    mutate((s) => {
      const c = s.characters.find((x) => x.id === char.id);
      const t = c && (c.traits || []).find((x) => x.id === trait.id);
      if (t) fn(t);
    });

  return (
    <div className={'pj__trait pj__trait--' + trait.status}>
      <div className="pj__traithead">
        <span className={'pj__traitstatus pj__traitstatus--' + trait.status}>{TRAIT_STATUS_LABEL[trait.status]}</span>
      </div>
      <p><b>{trait.name || 'Sans nom'}</b></p>
      <p className="chr__recaptxt">{trait.narrativeDesc || '—'}</p>
      <p className="chr__recaptxt"><i>{trait.technicalDesc || '—'}</i></p>
      {trait.status === 'pending' && (
        <>
          <label className="flabel">
            Note MJ (motif du refus, si refusé)
            <input
              ref={mjRef} className="field" type="text" placeholder="Optionnel"
              value={mjNote}
              onChange={(e) => { const v = e.target.value; setMjNote(v); patch((t) => { t.mjNote = v; }); }}
              onBlur={() => patch((t) => { t.mjNote = mjNote.trim(); })}
            />
          </label>
          <div className="card__actions">
            <button className="btn-primary" type="button" onClick={() => patch((t) => { t.status = 'creating'; })}>Valider</button>
            <button className="tbtn" type="button" onClick={() => patch((t) => { t.status = 'refused'; })}>Refuser</button>
          </div>
        </>
      )}
      {trait.status === 'creating' && (
        <>
          <p className="chr__muted">Validé — reste à le créer en jeu (Necronicon), puis à confirmer ici.</p>
          <div className="card__actions">
            <button className="btn-primary" type="button" onClick={() => patch((t) => { t.status = 'accepted'; })}>Créé en jeu ✓</button>
            <button className="tbtn" type="button" onClick={() => patch((t) => { t.status = 'pending'; })}>Repasser en attente</button>
          </div>
        </>
      )}
      {trait.status === 'accepted' && (
        <div className="card__actions">
          <button className="tbtn" type="button" onClick={() => patch((t) => { t.status = 'creating'; })}>Pas encore créé en jeu</button>
          <button className="tbtn" type="button" onClick={() => patch((t) => { t.status = 'pending'; })}>Repasser en attente</button>
        </div>
      )}
    </div>
  );
}

const TRAIT_STATUS_LABEL = {
  draft: 'Brouillon',
  pending: 'En attente de validation',
  creating: 'En cours de création',
  accepted: 'Créé en jeu',
  refused: 'Refusé'
};

/* --- sommaire par compte (arbre) ----------------------------------- */

function AccountNode({ account, chars, selId, onSelect }) {
  const [open, setOpen] = useState(true);
  const linked = chars.filter((c) => account.userId && c.ownerId === account.userId);
  return (
    <div className="zone-node">
      <div className="zone-node__row">
        <button
          className="zone-node__chev" type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ visibility: linked.length ? 'visible' : 'hidden' }}
          aria-label={open ? 'replier' : 'déplier'}
        >
          {open ? '▾' : '▸'}
        </button>
        <span className="zone-node__label zone-node__label--static">{account.label || account.email}</span>
      </div>
      {open && linked.length > 0 && (
        <div className="zone-node__kids">
          {linked.map((c) => (
            <div key={c.id} className="zone-node">
              <div className={'zone-node__row' + (selId === c.id ? ' is-sel' : '')}>
                <span className="zone-node__chev" style={{ visibility: 'hidden' }} />
                <button className="zone-node__label" type="button" onClick={() => onSelect(c.id)}>
                  {c.name || 'Sans nom'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && !linked.length && <p className="chr__muted zone-node__empty">Aucun personnage créé.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function Personnages({ state, mutate, goToSession }) {
  const chars = state.characters || [];
  const accounts = (state.settings && state.settings.accounts) || [];
  const [selId, setSelId] = useState(lsGet('ccm.char'));
  const sel = chars.find((c) => c.id === selId);

  const select = (id) => { setSelId(id); lsSet('ccm.char', id); };

  const pending = [];
  const creating = [];
  chars.forEach((c) => (c.traits || []).forEach((t) => {
    if (t.status === 'pending') pending.push({ char: c, trait: t });
    else if (t.status === 'creating') creating.push({ char: c, trait: t });
  }));

  function addChar() {
    const c = {
      id: uid(), name: 'Nouveau personnage', artUrl: '', mjNote: '', race: '', description: '', qualite: '', defaut: '', peurs: '',
      xp: [], events: [], recaps: [], journal: [], traits: [], ownerId: null
    };
    mutate((s) => { s.characters.push(c); });
    select(c.id);
  }

  const linkedAccountIds = new Set(accounts.filter((a) => a.userId).map((a) => a.userId));
  const unlinked = chars.filter((c) => !c.ownerId || !linkedAccountIds.has(c.ownerId));

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Personnages<span className="count"> ({chars.length})</span></h2>
        <button className="tbtn" type="button" onClick={addChar}>＋ nouveau personnage</button>
      </div>

      {pending.length > 0 && (
        <div className="chr__block">
          <h4 className="chr__h">Traits en attente de validation<span className="count"> ({pending.length})</span></h4>
          <ul className="chr__list">
            {pending.map(({ char, trait }) => (
              <li key={trait.id}>
                <button className="tbtn" type="button" onClick={() => select(char.id)}>
                  {char.name || 'Sans nom'} — {trait.name || 'Trait sans nom'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {creating.length > 0 && (
        <div className="chr__block">
          <h4 className="chr__h">Traits validés, à créer en jeu<span className="count"> ({creating.length})</span></h4>
          <ul className="chr__list">
            {creating.map(({ char, trait }) => (
              <li key={trait.id}>
                <button className="tbtn" type="button" onClick={() => select(char.id)}>
                  {char.name || 'Sans nom'} — {trait.name || 'Trait sans nom'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!chars.length ? (
        <p className="empty">
          Aucun personnage. Ajoutes-en un — chaque personnage a son onglet : artwork, note MJ,
          participation aux séances et tableau d’XP.
        </p>
      ) : (
        <div className="zones">
          <div className="zone-tree">
            {accounts.filter((a) => a.userId).map((a) => (
              <AccountNode key={a.id} account={a} chars={chars} selId={selId} onSelect={select} />
            ))}
            {unlinked.length > 0 && (
              <div className="zone-node">
                <div className="zone-node__row">
                  <span className="zone-node__chev" style={{ visibility: 'hidden' }} />
                  <span className="zone-node__label zone-node__label--static">Sans compte lié</span>
                </div>
                <div className="zone-node__kids">
                  {unlinked.map((c) => (
                    <div key={c.id} className="zone-node">
                      <div className={'zone-node__row' + (selId === c.id ? ' is-sel' : '')}>
                        <span className="zone-node__chev" style={{ visibility: 'hidden' }} />
                        <button className="zone-node__label" type="button" onClick={() => select(c.id)}>
                          {c.name || 'Sans nom'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {sel ? (
            <CharPane key={sel.id} state={state} char={sel} mutate={mutate} goToSession={goToSession} />
          ) : (
            <p className="empty">Sélectionne un personnage dans la liste à gauche.</p>
          )}
        </div>
      )}
    </section>
  );
}
