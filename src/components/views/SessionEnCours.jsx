import { useState } from 'react';
import { uid } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { makeDraft } from '../../lib/session.js';
import { campaignDate } from '../../lib/campaign.js';
import { aelValid, aelTextLine1 } from '../../lib/aelskar.js';
import AelPicker from '../AelPicker.jsx';
import CharToggles from '../CharToggles.jsx';

const clone = (x) => JSON.parse(JSON.stringify(x));

/* --- lignes réutilisables ---------------------------------------- */
/* Chaque champ enregistre à CHAQUE frappe (pas seulement au blur) :
   avec deux personnes qui remplissent la même séance en direct, l'autre
   doit voir le texte arriver sans attendre qu'on clique ailleurs. */

function XpLine({ row, chars, mutate }) {
  const [amount, setAmount, aRef] = useSyncedField(row.amount);
  const [reason, setReason, rRef] = useSyncedField(row.reason);
  const patch = (fn) =>
    mutate((s) => { const r = s.sessionDraft.xp.find((x) => x.id === row.id); if (r) fn(r); });
  return (
    <div className="xprow xprow--session">
      <select
        className="field" value={row.charId || ''}
        onChange={(e) => patch((r) => { r.charId = e.target.value || null; })}
      >
        <option value="">— personnage —</option>
        {chars.map((c) => <option key={c.id} value={c.id}>{c.name || 'Sans nom'}</option>)}
      </select>
      <input
        ref={aRef} className="field field--xp" type="text" inputMode="numeric" placeholder="XP"
        value={amount}
        onChange={(e) => { const v = e.target.value; setAmount(v); patch((r) => { r.amount = v; }); }}
        onBlur={() => patch((r) => { r.amount = amount.trim(); })}
      />
      <textarea
        ref={rRef} className="field field--area" rows={2} placeholder="Raison du gain"
        value={reason}
        onChange={(e) => { const v = e.target.value; setReason(v); patch((r) => { r.reason = v; }); }}
        onBlur={() => patch((r) => { r.reason = reason.trim(); })}
      />
      <button
        className="tbtn" type="button" aria-label="retirer"
        onClick={() => mutate((s) => { s.sessionDraft.xp = s.sessionDraft.xp.filter((x) => x.id !== row.id); })}
      >
        ×
      </button>
    </div>
  );
}

function EventLine({ row, chars, mutate }) {
  const [desc, setDesc, dRef] = useSyncedField(row.description);
  const patch = (fn) =>
    mutate((s) => { const e = s.sessionDraft.events.find((x) => x.id === row.id); if (e) fn(e); });
  const toggle = (cid) =>
    patch((e) => {
      e.charIds = e.charIds || [];
      const i = e.charIds.indexOf(cid);
      if (i >= 0) e.charIds.splice(i, 1); else e.charIds.push(cid);
    });
  return (
    <div className="evtline">
      <CharToggles characters={chars} selected={row.charIds} onToggle={toggle} />
      <textarea
        ref={dRef} className="finput finput--area" placeholder="Ce qui s’est passé…"
        value={desc}
        onChange={(e) => { const v = e.target.value; setDesc(v); patch((e2) => { e2.description = v; }); }}
        onBlur={() => patch((e2) => { e2.description = desc; })}
      />
      <button
        className="tbtn" type="button"
        onClick={() => mutate((s) => { s.sessionDraft.events = s.sessionDraft.events.filter((x) => x.id !== row.id); })}
      >
        retirer l’événement
      </button>
    </div>
  );
}

function ConseqLine({ row, mutate }) {
  const [a, setA, aRef] = useSyncedField(row.trigger);
  const [b, setB, bRef] = useSyncedField(row.effect);
  const patch = (fn) =>
    mutate((s) => { const c = s.sessionDraft.consequences.find((x) => x.id === row.id); if (c) fn(c); });
  return (
    <div className="stackline">
      <textarea
        ref={aRef} className="finput finput--area" placeholder="Si — ce que les joueur·euses ont fait…"
        value={a}
        onChange={(e) => { const v = e.target.value; setA(v); patch((c) => { c.trigger = v; }); }}
        onBlur={() => patch((c) => { c.trigger = a; })}
      />
      <textarea
        ref={bRef} className="finput finput--area" placeholder="Alors — ce que ça déclenchera…"
        value={b}
        onChange={(e) => { const v = e.target.value; setB(v); patch((c) => { c.effect = v; }); }}
        onBlur={() => patch((c) => { c.effect = b; })}
      />
      <button
        className="tbtn" type="button"
        onClick={() => mutate((s) => { s.sessionDraft.consequences = s.sessionDraft.consequences.filter((x) => x.id !== row.id); })}
      >
        retirer
      </button>
    </div>
  );
}

function ClockLine({ state, row, mutate }) {
  const [title, setTitle, tRef] = useSyncedField(row.title);
  const [note, setNote, nRef] = useSyncedField(row.note);
  const [pick, setPick] = useState(false);
  const patch = (fn) =>
    mutate((s) => { const c = s.sessionDraft.clocks.find((x) => x.id === row.id); if (c) fn(c); });
  const picked = aelValid(row.deadlineAel) ? row.deadlineAel : null;
  return (
    <div className="stackline">
      <input
        ref={tRef} className="finput" type="text" placeholder="Nom de l’horloge / du front"
        value={title}
        onChange={(e) => { const v = e.target.value; setTitle(v); patch((c) => { c.title = v; }); }}
        onBlur={() => patch((c) => { c.title = title.trim(); })}
      />
      <div className="clock__kinds">
        {[['timer', 'Segments'], ['deadline', 'Date butoir']].map(([v, l]) => (
          <button
            key={v} type="button" className={'clock__kindbtn' + (row.kind === v ? ' is-on' : '')}
            onClick={() => patch((c) => { c.kind = v; })}
          >
            {l}
          </button>
        ))}
      </div>
      {row.kind === 'deadline' ? (
        <div className="clock__deadline">
          <button className="finput aelpick-trigger" type="button" onClick={() => setPick((v) => !v)}>
            {picked ? aelTextLine1(picked) + ' — An ' + picked.year : 'Choisir une date…'}
          </button>
          {pick && (
            <AelPicker
              cur={picked || campaignDate(state)}
              onPick={(d) => { patch((c) => { c.deadlineAel = d; }); setPick(false); }}
              onToday={() => { patch((c) => { c.deadlineAel = clone(campaignDate(state)); }); setPick(false); }}
            />
          )}
        </div>
      ) : (
        <select
          className="finput clock__size" value={String(row.size || 6)}
          onChange={(e) => patch((c) => { c.size = parseInt(e.target.value, 10); })}
        >
          {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} segments</option>)}
        </select>
      )}
      <textarea
        ref={nRef} className="finput finput--area" placeholder="Ce qui se déclenche à échéance…"
        value={note}
        onChange={(e) => { const v = e.target.value; setNote(v); patch((c) => { c.note = v; }); }}
        onBlur={() => patch((c) => { c.note = note; })}
      />
      <button
        className="tbtn" type="button"
        onClick={() => mutate((s) => { s.sessionDraft.clocks = s.sessionDraft.clocks.filter((x) => x.id !== row.id); })}
      >
        retirer
      </button>
    </div>
  );
}

const REM_KINDS = ['Promesse de PNJ', 'Objet mystérieux', 'Info glissée en passant', 'PNJ à revoir', 'Lieu à explorer'];

function ReminderLine({ row, mutate }) {
  const [text, setText, tRef] = useSyncedField(row.text);
  const [kind, setKind, kRef] = useSyncedField(row.kind);
  const patch = (fn) =>
    mutate((s) => { const r = s.sessionDraft.reminders.find((x) => x.id === row.id); if (r) fn(r); });
  return (
    <div className="remline">
      <input
        ref={tRef} className="finput" type="text" placeholder="Quoi ne pas oublier…"
        value={text}
        onChange={(e) => { const v = e.target.value; setText(v); patch((r) => { r.text = v; }); }}
        onBlur={() => patch((r) => { r.text = text.trim(); })}
      />
      <input
        ref={kRef} className="finput" type="text" list="ssn-rk" placeholder="Catégorie"
        value={kind}
        onChange={(e) => { const v = e.target.value; setKind(v); patch((r) => { r.kind = v; }); }}
        onBlur={() => patch((r) => { r.kind = kind.trim(); })}
      />
      <button
        className="tbtn" type="button"
        onClick={() => mutate((s) => { s.sessionDraft.reminders = s.sessionDraft.reminders.filter((x) => x.id !== row.id); })}
      >
        ×
      </button>
    </div>
  );
}

/* --- vue principale --------------------------------------------- */

function Workspace({ state, mutate, onFinish }) {
  const d = state.sessionDraft;
  const chars = state.characters || [];
  const [title, setTitle, titleRef] = useSyncedField(d.title);
  const [date, setDate, dateRef] = useSyncedField(d.date);
  const [summary, setSummary, sumRef] = useSyncedField(d.summary);
  const [etitle, setEtitle, etitleRef] = useSyncedField(d.eventsTitle);
  const [pickOpen, setPickOpen] = useState(false);

  const set = (fn) => mutate((s) => fn(s.sessionDraft));
  const toggleParticipant = (cid) =>
    set((dr) => {
      dr.participants = dr.participants || [];
      const i = dr.participants.indexOf(cid);
      if (i >= 0) dr.participants.splice(i, 1); else dr.participants.push(cid);
    });

  return (
    <div className="ssn">
      <div className="ssn__bar">
        <span className="ssn__live">● Séance en cours</span>
        <button className="btn-primary btn-primary--stop" type="button" onClick={onFinish}>
          ⏹ Terminer la séance
        </button>
        <button
          className="tbtn" type="button"
          onClick={() => {
            if (!window.confirm('Abandonner cette séance en cours ? Tout le contenu non clôturé est perdu.')) return;
            mutate((s) => { s.sessionDraft = null; });
          }}
        >
          abandonner
        </button>
      </div>

      <div className="ssn-block">
        <h3 className="ssn-h">Identité</h3>
        <div className="journal__meta">
          <label className="flabel">
            Titre
            <input
              ref={titleRef} className="finput" type="text"
              value={title}
              onChange={(e) => { const v = e.target.value; setTitle(v); set((dr) => { dr.title = v; }); }}
              onBlur={() => set((dr) => { dr.title = title.trim(); })}
            />
          </label>
          <label className="flabel">
            Date réelle
            <input
              ref={dateRef} className="finput" type="text"
              value={date}
              onChange={(e) => { const v = e.target.value; setDate(v); set((dr) => { dr.date = v; }); }}
              onBlur={() => set((dr) => { dr.date = date.trim(); })}
            />
          </label>
        </div>
        <div className="clock__deadline">
          <span className="flabel">Date en jeu (Aelskar)</span>
          <button className="finput aelpick-trigger" type="button" onClick={() => setPickOpen((v) => !v)}>
            {aelValid(d.aelDate) ? aelTextLine1(d.aelDate) + ' — An ' + d.aelDate.year : 'Choisir la date en jeu…'}
          </button>
          {pickOpen && (
            <AelPicker
              cur={aelValid(d.aelDate) ? d.aelDate : campaignDate(state)}
              onPick={(x) => { set((dr) => { dr.aelDate = x; }); setPickOpen(false); }}
              onToday={() => { set((dr) => { dr.aelDate = clone(campaignDate(state)); }); setPickOpen(false); }}
              midLabel="Présent actuel"
            />
          )}
        </div>
      </div>

      <div className="ssn-block">
        <h3 className="ssn-h">Résumé MJ de la séance</h3>
        <textarea
          ref={sumRef} className="notes"
          placeholder="Ce qui a été fait, décidé, découvert ; PNJ rencontrés ; fils laissés en suspens…"
          value={summary}
          onChange={(e) => { const v = e.target.value; setSummary(v); set((dr) => { dr.summary = v; }); }}
          onBlur={() => set((dr) => { dr.summary = summary; })}
        />
      </div>

      <div className="ssn-block">
        <h3 className="ssn-h">Participants<span className="count"> ({(d.participants || []).length})</span></h3>
        <CharToggles characters={chars} selected={d.participants} onToggle={toggleParticipant} />
      </div>

      <div className="ssn-block">
        <h3 className="ssn-h">Attribution d’XP</h3>
        <div className="xptable xptable--session">
          <div className="xptable__head"><span>Personnage</span><span>XP</span><span>Raison</span><span /></div>
          {(d.xp || []).map((r) => (
            <XpLine key={r.id} row={r} chars={chars} mutate={mutate} />
          ))}
          <button
            className="tbtn" type="button"
            onClick={() => set((dr) => { dr.xp.push({ id: uid(), charId: null, amount: '', reason: '' }); })}
          >
            ＋ ligne
          </button>
        </div>
      </div>

      <div className="ssn-block">
        <input
          ref={etitleRef} className="finput ssn-h-input" type="text" placeholder="Titre du bloc événements"
          value={etitle}
          onChange={(e) => { const v = e.target.value; setEtitle(v); set((dr) => { dr.eventsTitle = v; }); }}
          onBlur={() => set((dr) => { dr.eventsTitle = etitle.trim(); })}
        />
        {(d.events || []).map((r) => (
          <EventLine key={r.id} row={r} chars={chars} mutate={mutate} />
        ))}
        <button
          className="tbtn" type="button"
          onClick={() => set((dr) => { dr.events.push({ id: uid(), description: '', charIds: [] }); })}
        >
          ＋ événement
        </button>
      </div>

      <div className="ssn-block">
        <h3 className="ssn-h">Conséquences</h3>
        {(d.consequences || []).map((r) => <ConseqLine key={r.id} row={r} mutate={mutate} />)}
        <button
          className="tbtn" type="button"
          onClick={() => set((dr) => { dr.consequences.push({ id: uid(), trigger: '', effect: '' }); })}
        >
          ＋ conséquence
        </button>
      </div>

      <div className="ssn-block">
        <h3 className="ssn-h">Horloges / fronts</h3>
        {(d.clocks || []).map((r) => <ClockLine key={r.id} state={state} row={r} mutate={mutate} />)}
        <button
          className="tbtn" type="button"
          onClick={() => set((dr) => { dr.clocks.push({ id: uid(), title: '', kind: 'timer', size: 6, filled: 0, note: '', deadlineAel: null }); })}
        >
          ＋ horloge
        </button>
      </div>

      <div className="ssn-block">
        <h3 className="ssn-h">À ne pas oublier</h3>
        <datalist id="ssn-rk">{REM_KINDS.map((k) => <option key={k} value={k} />)}</datalist>
        {(d.reminders || []).map((r) => <ReminderLine key={r.id} row={r} mutate={mutate} />)}
        <button
          className="tbtn" type="button"
          onClick={() => set((dr) => { dr.reminders.push({ id: uid(), text: '', kind: '' }); })}
        >
          ＋ rappel
        </button>
      </div>
    </div>
  );
}

export default function SessionEnCours({ state, mutate, onFinish }) {
  const d = state.sessionDraft;
  if (!d) {
    const n = (state.sessions || []).length + 1;
    return (
      <section className="chapter">
        <div className="chapter__head"><h2>Séance</h2></div>
        <div className="ssn-start">
          <p className="empty">Aucune séance en cours.</p>
          <button
            className="btn-primary" type="button"
            onClick={() => mutate((s) => { s.sessionDraft = makeDraft(s); })}
          >
            ▶ Démarrer la Séance {n}
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="chapter">
      <div className="chapter__head"><h2>{d.title || 'Séance en cours'}</h2></div>
      <Workspace state={state} mutate={mutate} onFinish={onFinish} />
    </section>
  );
}
