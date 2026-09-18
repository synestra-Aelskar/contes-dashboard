import { useState } from 'react';
import { uid, lsGet, lsSet } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { levelForXp } from '../../lib/xpCalibreur.js';
import { uploadScreenshot } from '../../lib/board.js';
import { toast } from '../../lib/toast.js';
import SessionLink from '../SessionLink.jsx';

const TABS = [
  ['info', 'Informations'],
  ['xp', 'Suivi XP'],
  ['journal', 'Journal'],
  ['traits', 'Traits'],
  ['backstage', 'Backstage']
];

const TRAIT_STATUS_LABEL = {
  draft: 'Brouillon',
  pending: 'En attente de validation',
  accepted: 'Acceptée',
  refused: 'Refusé'
};

/* ------------------------------- Panneau artwork (droite) ------------- */

function ArtPanel({ char, patch, level }) {
  const [name, setName, nameRef] = useSyncedField(char.name);
  const [art, setArt, artRef] = useSyncedField(char.artUrl);
  const [race, setRace, raceRef] = useSyncedField(char.race);

  return (
    <div className="chr__side">
      {char.artUrl ? (
        <a className="chr__artlink" href={char.artUrl} target="_blank" rel="noopener noreferrer">
          <img className="chr__art" src={char.artUrl} alt={char.name || ''} />
        </a>
      ) : (
        <div className="chr__art chr__art--placeholder">POUVOIR DE L’IMAGINATION</div>
      )}
      <label className="flabel">
        URL d’artwork
        <input
          ref={artRef} className="field field--mono" type="text" placeholder="https://…"
          value={art}
          onChange={(e) => { const v = e.target.value; setArt(v); patch((c) => { c.artUrl = v.trim(); }); }}
          onBlur={() => patch((c) => { c.artUrl = art.trim(); })}
        />
      </label>

      <div className="pj__idblock">
        <label className="flabel">
          Nom
          <input
            ref={nameRef} className="field" type="text" placeholder="Nom du personnage"
            value={name}
            onChange={(e) => { const v = e.target.value; setName(v); patch((c) => { c.name = v; }); }}
            onBlur={() => patch((c) => { c.name = name.trim(); })}
          />
        </label>
        <div className="flabel">
          Niveau
          <div className="pj__level">{level}</div>
        </div>
        <label className="flabel">
          Race
          <input
            ref={raceRef} className="field" type="text" placeholder="Race"
            value={race}
            onChange={(e) => { const v = e.target.value; setRace(v); patch((c) => { c.race = v; }); }}
            onBlur={() => patch((c) => { c.race = race.trim(); })}
          />
        </label>
      </div>
    </div>
  );
}

/* ------------------------------- Informations --------------------------- */

function InfoTab({ char, patch }) {
  const [description, setDescription, descRef] = useSyncedField(char.description);
  const [qualite, setQualite, qRef] = useSyncedField(char.qualite);
  const [defaut, setDefaut, dRef] = useSyncedField(char.defaut);
  const [peurs, setPeurs, pRef] = useSyncedField(char.peurs);

  return (
    <div className="chr__main">
      <label className="flabel">
        Description
        <textarea
          ref={descRef} className="notes pj__descarea" placeholder="Qui est ce personnage ? Apparence, histoire, personnalité…"
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
    </div>
  );
}

/* ------------------------------- Suivi XP ------------------------------- */

function XpTab({ state, char, goToSession }) {
  const xp = char.xp || [];
  const totalXp = xp.reduce((n, r) => n + (parseInt(r.amount, 10) || 0), 0);
  return (
    <div className="chr__main">
      <div className="chr__block">
        <h4 className="chr__h">XP<span className="count"> (total {totalXp})</span></h4>
        {xp.length ? (
          <ul className="chr__list">
            {xp.map((r) => (
              <li key={r.id}>
                <b>{r.amount || 0} XP</b> — {r.reason || '—'}{' '}
                <SessionLink sessions={state.sessions} sessionId={r.sessionId} goToSession={goToSession} />
              </li>
            ))}
          </ul>
        ) : <p className="chr__muted">Pas encore d’XP.</p>}
      </div>
    </div>
  );
}

/* ------------------------------- Journal -------------------------------- */

function JournalScreenshot({ shot, onCaption, onRemove }) {
  const [caption, setCaption, ref] = useSyncedField(shot.caption);
  return (
    <div className="pj__shot">
      <a href={shot.url} target="_blank" rel="noopener noreferrer">
        <img className="pj__shotimg" src={shot.url} alt="" />
      </a>
      <input
        ref={ref} className="field" type="text" placeholder="Commentaire…"
        value={caption}
        onChange={(e) => { const v = e.target.value; setCaption(v); onCaption(v); }}
        onBlur={() => onCaption(caption.trim())}
      />
      <button className="tbtn chr__x" type="button" onClick={onRemove} aria-label="retirer la capture">×</button>
    </div>
  );
}

function JournalEntry({ char, entry, mutate }) {
  const [title, setTitle, titleRef] = useSyncedField(entry.title);
  const [category, setCategory, catRef] = useSyncedField(entry.category);
  const [text, setText, textRef] = useSyncedField(entry.text);
  const [uploading, setUploading] = useState(false);

  const patch = (fn) =>
    mutate((s) => {
      const c = s.characters.find((x) => x.id === char.id);
      const j = c && (c.journal || []).find((x) => x.id === entry.id);
      if (j) fn(j);
    });

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadScreenshot(file);
      patch((j) => { j.screenshots = j.screenshots || []; j.screenshots.push({ id: uid(), url, caption: '' }); });
    } catch (_) {
      toast('Image illisible / envoi impossible');
    } finally {
      setUploading(false);
    }
  }

  function onPaste(ev) {
    const items = (ev.clipboardData && ev.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') === 0) {
        ev.preventDefault();
        handleFile(items[i].getAsFile());
        return;
      }
    }
  }

  return (
    <div className="pj__entry" onPaste={onPaste}>
      <div className="pj__entryhead">
        <input
          ref={titleRef} className="field" type="text" placeholder="Titre de la note"
          value={title}
          onChange={(e) => { const v = e.target.value; setTitle(v); patch((j) => { j.title = v; }); }}
          onBlur={() => patch((j) => { j.title = title.trim(); })}
        />
        <input
          ref={catRef} className="field" type="text" list="pj-journal-cats" placeholder="Catégorie"
          value={category}
          onChange={(e) => { const v = e.target.value; setCategory(v); patch((j) => { j.category = v; }); }}
          onBlur={() => patch((j) => { j.category = category.trim(); })}
        />
        <button
          className="tbtn chr__x" type="button" aria-label="supprimer la note"
          onClick={() => mutate((s) => {
            const c = s.characters.find((x) => x.id === char.id);
            if (c) c.journal = (c.journal || []).filter((x) => x.id !== entry.id);
          })}
        >
          ×
        </button>
      </div>
      <textarea
        ref={textRef} className="notes" placeholder="Récit, réflexions… (colle une capture d’écran directement ici)"
        value={text}
        onChange={(e) => { const v = e.target.value; setText(v); patch((j) => { j.text = v; }); }}
        onBlur={() => patch((j) => { j.text = text; })}
      />
      {(entry.screenshots || []).length > 0 && (
        <div className="pj__shots">
          {entry.screenshots.map((shot) => (
            <JournalScreenshot
              key={shot.id} shot={shot}
              onCaption={(v) => patch((j) => { const s = (j.screenshots || []).find((x) => x.id === shot.id); if (s) s.caption = v; })}
              onRemove={() => patch((j) => { j.screenshots = (j.screenshots || []).filter((x) => x.id !== shot.id); })}
            />
          ))}
        </div>
      )}
      {uploading && <p className="chr__muted">Envoi de l’image…</p>}
    </div>
  );
}

function JournalTab({ char, mutate }) {
  const entries = char.journal || [];
  const categories = Array.from(new Set(entries.map((e) => e.category).filter(Boolean)));

  function addEntry() {
    mutate((s) => {
      const c = s.characters.find((x) => x.id === char.id);
      if (c) {
        c.journal = c.journal || [];
        c.journal.push({ id: uid(), title: '', category: '', text: '', screenshots: [], createdAt: new Date().toISOString() });
      }
    });
  }

  return (
    <div className="chr__main">
      <div className="chapter__head">
        <h4 className="chr__h">Journal d’aventure<span className="count"> ({entries.length})</span></h4>
        <button className="tbtn" type="button" onClick={addEntry}>＋ nouvelle note</button>
      </div>
      <datalist id="pj-journal-cats">
        {categories.map((c) => <option key={c} value={c} />)}
      </datalist>
      {entries.length ? (
        <div className="pj__entries">
          {entries.slice().reverse().map((entry) => (
            <JournalEntry key={entry.id} char={char} entry={entry} mutate={mutate} />
          ))}
        </div>
      ) : <p className="empty">Aucune note de journal. Consigne les événements marquants vécus par ton personnage.</p>}
    </div>
  );
}

/* ------------------------------- Traits --------------------------------- */

function TraitBlock({ char, trait, mutate }) {
  const editable = trait.status === 'draft' || trait.status === 'refused';
  const [name, setName, nameRef] = useSyncedField(trait.name);
  const [narrativeDesc, setNarrativeDesc, narRef] = useSyncedField(trait.narrativeDesc);
  const [technicalDesc, setTechnicalDesc, techRef] = useSyncedField(trait.technicalDesc);

  const patch = (fn) =>
    mutate((s) => {
      const c = s.characters.find((x) => x.id === char.id);
      const t = c && (c.traits || []).find((x) => x.id === trait.id);
      if (t) fn(t);
    });

  function submit() {
    if (!name.trim() || !narrativeDesc.trim() || !technicalDesc.trim()) {
      toast('Nom, description narrative et description technique requis');
      return;
    }
    patch((t) => { t.status = 'pending'; });
  }

  return (
    <div className={'pj__trait pj__trait--' + trait.status}>
      <div className="pj__traithead">
        <span className={'pj__traitstatus pj__traitstatus--' + trait.status}>{TRAIT_STATUS_LABEL[trait.status]}</span>
        {editable && (
          <button
            className="tbtn chr__x" type="button" aria-label="supprimer le trait"
            onClick={() => mutate((s) => {
              const c = s.characters.find((x) => x.id === char.id);
              if (c) c.traits = (c.traits || []).filter((x) => x.id !== trait.id);
            })}
          >
            ×
          </button>
        )}
      </div>

      {editable ? (
        <>
          <label className="flabel">
            Nom du trait
            <input
              ref={nameRef} className="field" type="text" placeholder="Nom du trait"
              value={name}
              onChange={(e) => { const v = e.target.value; setName(v); patch((t) => { t.name = v; }); }}
              onBlur={() => patch((t) => { t.name = name.trim(); })}
            />
          </label>
          <label className="flabel">
            Description narrative
            <textarea
              ref={narRef} className="notes" placeholder="Description narrative."
              value={narrativeDesc}
              onChange={(e) => { const v = e.target.value; setNarrativeDesc(v); patch((t) => { t.narrativeDesc = v; }); }}
              onBlur={() => patch((t) => { t.narrativeDesc = narrativeDesc; })}
            />
          </label>
          <label className="flabel">
            Description technique
            <textarea
              ref={techRef} className="notes" placeholder="Qu’est-ce que ce trait apporte en gameplay ?"
              value={technicalDesc}
              onChange={(e) => { const v = e.target.value; setTechnicalDesc(v); patch((t) => { t.technicalDesc = v; }); }}
              onBlur={() => patch((t) => { t.technicalDesc = technicalDesc; })}
            />
          </label>
          {trait.status === 'refused' && trait.mjNote && (
            <p className="chr__muted">Raison du refus : {trait.mjNote}</p>
          )}
          <div className="card__actions">
            <button className="btn-primary" type="button" onClick={submit}>Envoyer à validation</button>
          </div>
        </>
      ) : (
        <>
          <p><b>{trait.name}</b></p>
          <p className="chr__recaptxt">{trait.narrativeDesc}</p>
          <p className="chr__recaptxt"><i>{trait.technicalDesc}</i></p>
        </>
      )}
    </div>
  );
}

function TraitsTab({ char, mutate }) {
  const traits = char.traits || [];

  function addTrait() {
    mutate((s) => {
      const c = s.characters.find((x) => x.id === char.id);
      if (c) {
        c.traits = c.traits || [];
        c.traits.push({ id: uid(), name: '', narrativeDesc: '', technicalDesc: '', status: 'draft', mjNote: '' });
      }
    });
  }

  return (
    <div className="chr__main">
      <div className="chapter__head">
        <h4 className="chr__h">Traits<span className="count"> ({traits.length})</span></h4>
        <button className="tbtn" type="button" onClick={addTrait}>＋ nouveau trait</button>
      </div>
      {traits.length ? (
        <div className="pj__traits">
          {traits.map((trait) => <TraitBlock key={trait.id} char={char} trait={trait} mutate={mutate} />)}
        </div>
      ) : <p className="empty">Aucun trait proposé. Un trait décrit une capacité ou particularité propre à ton personnage, à faire valider par le MJ.</p>}
    </div>
  );
}

/* ------------------------------- Backstage ------------------------------ */

function ThreadMessages({ thread, mutate, char }) {
  const [text, setText] = useState('');

  function send() {
    const t = text.trim();
    if (!t) return;
    mutate((s) => {
      const th = (s.threads || []).find((x) => x.id === thread.id);
      if (th) {
        th.messages = th.messages || [];
        th.messages.push({ id: uid(), authorId: char.id, authorName: char.name || 'Joueur', text: t, createdAt: new Date().toISOString() });
      }
    });
    setText('');
  }

  return (
    <div className="pj__thread">
      <div className="pj__threadmsgs">
        {(thread.messages || []).map((m) => (
          <div key={m.id} className={'pj__msg' + (m.authorId === char.id ? ' pj__msg--mine' : '')}>
            <div className="pj__msghead">
              <b>{m.authorName || '—'}</b>
              <span className="chr__muted">{m.createdAt ? new Date(m.createdAt).toLocaleString('fr-FR') : ''}</span>
            </div>
            <p className="pj__msgtext">{m.text}</p>
          </div>
        ))}
        {!((thread.messages || []).length) && <p className="chr__muted">Aucun message pour l’instant.</p>}
      </div>
      <div className="pj__threadcompose">
        <textarea
          className="notes" placeholder="Écrire un message…" rows={3}
          value={text} onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary" type="button" onClick={send}>Envoyer</button>
      </div>
    </div>
  );
}

function BackstageTab({ state, char, mutate }) {
  const allThreads = state.threads || [];
  const otherChars = (state.characters || []).filter((c) => c.id !== char.id && c.ownerId);
  const mine = allThreads.filter((t) => t.participantIds.includes(char.id) || t.createdBy === char.id);
  const [selId, setSelId] = useState(lsGet('ccm.pjThread') || (mine[0] && mine[0].id) || null);
  const sel = mine.find((t) => t.id === selId) || mine[0] || null;
  const [title, setTitle] = useState('');
  const [invited, setInvited] = useState([]);

  function select(id) { setSelId(id); lsSet('ccm.pjThread', id); }

  function toggleInvite(id) {
    setInvited((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function createThread() {
    const t = title.trim();
    if (!t) { toast('Titre du thread requis'); return; }
    const thread = { id: uid(), title: t, participantIds: [char.id, ...invited], messages: [], createdBy: char.id, createdAt: new Date().toISOString() };
    mutate((s) => { s.threads = s.threads || []; s.threads.push(thread); });
    setTitle(''); setInvited([]);
    select(thread.id);
  }

  return (
    <div className="chr__main">
      <div className="pj__backstage">
        <div className="pj__threadrail">
          {mine.map((t) => (
            <button
              key={t.id} type="button"
              className={'journal__item' + (sel && sel.id === t.id ? ' is-active' : '')}
              onClick={() => select(t.id)}
            >
              <span className="journal__title">{t.title || 'Sans titre'}</span>
            </button>
          ))}
          <div className="pj__newthread">
            <input
              className="field" type="text" placeholder="Titre du nouveau thread"
              value={title} onChange={(e) => setTitle(e.target.value)}
            />
            {otherChars.length > 0 && (
              <div className="pj__invitelist">
                <span className="chr__muted">Inviter :</span>
                {otherChars.map((c) => (
                  <label key={c.id} className="pj__invitechip">
                    <input type="checkbox" checked={invited.includes(c.id)} onChange={() => toggleInvite(c.id)} />
                    {c.name || 'Sans nom'}
                  </label>
                ))}
              </div>
            )}
            <button className="tbtn" type="button" onClick={createThread}>＋ créer le thread</button>
          </div>
        </div>
        {sel ? (
          <ThreadMessages key={sel.id} thread={sel} mutate={mutate} char={char} />
        ) : (
          <p className="empty">Aucun thread. Crée-en un pour ouvrir une narration hors-jeu avec le MJ (et d’autres joueurs si tu le souhaites).</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Vue « joueur » de l'onglet Personnage : un joueur ne voit et ne peut
 * éditer que SON personnage (rattaché par char.ownerId === son user id
 * Supabase). XP / événements / résumés MJ restent en lecture seule (ce
 * sont des enregistrements du MJ) ; la Note MJ n'est jamais exposée ici.
 */
export default function PersonnageJoueur({ state, mutate, userId, goToSession }) {
  const chars = state.characters || [];
  const mine = chars.find((c) => c.ownerId === userId);
  const [tab, setTab] = useState(lsGet('ccm.pjTab') || 'info');

  function createMine() {
    const c = {
      id: uid(), name: 'Nouveau personnage', artUrl: '', mjNote: '', race: '', description: '', qualite: '', defaut: '', peurs: '',
      xp: [], events: [], recaps: [], journal: [], traits: [], ownerId: userId
    };
    mutate((s) => { s.characters.push(c); });
  }

  if (!mine) {
    return (
      <section className="chapter">
        <div className="chapter__head"><h2>Personnage</h2></div>
        <p className="empty">Tu n’as pas encore de personnage.</p>
        <button className="btn-primary" type="button" onClick={createMine}>＋ créer mon personnage</button>
      </section>
    );
  }

  const patch = (fn) => mutate((s) => { const c = s.characters.find((x) => x.id === mine.id); if (c) fn(c); });
  const totalXp = (mine.xp || []).reduce((n, r) => n + (parseInt(r.amount, 10) || 0), 0);
  const level = levelForXp(state.xpCalibreur, totalXp);

  function setTabAndSave(t) { setTab(t); lsSet('ccm.pjTab', t); }

  let content;
  if (tab === 'xp') content = <XpTab state={state} char={mine} goToSession={goToSession} />;
  else if (tab === 'journal') content = <JournalTab char={mine} mutate={mutate} />;
  else if (tab === 'traits') content = <TraitsTab char={mine} mutate={mutate} />;
  else if (tab === 'backstage') content = <BackstageTab state={state} char={mine} mutate={mutate} />;
  else content = <InfoTab char={mine} patch={patch} />;

  return (
    <section className="chapter">
      <div className="chapter__head"><h2>{mine.name || 'Personnage'}</h2></div>
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
        <ArtPanel char={mine} patch={patch} level={level} />
      </div>
    </section>
  );
}
