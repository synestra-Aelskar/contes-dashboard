import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { uid } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { campaignDate } from '../../lib/campaign.js';
import { aelValid, aelTextLine1 } from '../../lib/aelskar.js';
import { makeTimeBlock, blockHours, blocksTotalHours, fmtDuration } from '../../lib/timeblocks.js';
import { resolveBlockXp, sessionTotal, BRANCH_LABELS, BRANCH_KIND_VAR, BRANCH_ORDER } from '../../lib/prepsession.js';
import { levelForXp } from '../../lib/xpCalibreur.js';
import AelPicker from '../AelPicker.jsx';

const clone = (x) => JSON.parse(JSON.stringify(x));

/* --- lignes réutilisables ---------------------------------------- */
/* Chaque champ enregistre à CHAQUE frappe (pas seulement au blur) :
   avec deux personnes qui remplissent la même séance en direct, l'autre
   doit voir le texte arriver sans attendre qu'on clique ailleurs. */

/** Petit pop-up de sélection multiple des participants d'une ligne d'XP. */
function XpParticipantsPicker({ chars, charIds, pos, onToggle, onToggleAll, onClose }) {
  const allOn = chars.length > 0 && chars.every((c) => charIds.indexOf(c.id) >= 0);
  const someOn = chars.some((c) => charIds.indexOf(c.id) >= 0);
  return createPortal(
    <>
      <div className="ssnparticipants__menu-backdrop" onClick={onClose} />
      <div className="xp-picker" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
        <label className="xp-picker__all">
          <SelectAllCheckbox allOn={allOn} someOn={someOn} onToggle={onToggleAll} />
          <span>{allOn ? 'Tout décocher' : 'Tout cocher'}</span>
        </label>
        <ul className="xp-picker__list">
          {chars.map((c) => (
            <li key={c.id}>
              <label className="evtbuilder__charrow">
                <input type="checkbox" checked={charIds.indexOf(c.id) >= 0} onChange={() => onToggle(c.id)} />
                <span>{c.name || 'Sans nom'}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </>,
    document.body
  );
}

function XpLine({ row, chars, mutate }) {
  const [amount, setAmount, aRef] = useSyncedField(row.amount);
  const [reason, setReason, rRef] = useSyncedField(row.reason);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const patch = (fn) =>
    mutate((s) => { const r = s.sessionDraft.xp.find((x) => x.id === row.id); if (r) fn(r); });
  const toggleChar = (cid) =>
    patch((r) => {
      r.charIds = r.charIds || [];
      const i = r.charIds.indexOf(cid);
      if (i >= 0) r.charIds.splice(i, 1); else r.charIds.push(cid);
    });
  const toggleAllChars = () =>
    patch((r) => {
      const allOn = chars.length > 0 && chars.every((c) => (r.charIds || []).indexOf(c.id) >= 0);
      r.charIds = allOn ? [] : chars.map((c) => c.id);
    });
  const charIds = row.charIds || [];
  const names = charIds.map((cid) => (chars.find((c) => c.id === cid) || {}).name).filter(Boolean);

  const openPicker = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
    setPickerOpen(true);
  };

  return (
    <div className="xprow xprow--session">
      <textarea
        ref={rRef} className="field field--area field--area-sm" rows={1} placeholder="Raison du gain"
        value={reason}
        onChange={(e) => { const v = e.target.value; setReason(v); patch((r) => { r.reason = v; }); }}
        onBlur={() => patch((r) => { r.reason = reason.trim(); })}
      />
      <select
        className="field" value={row.branchKey || ''}
        onChange={(e) => patch((r) => { r.branchKey = e.target.value || null; })}
      >
        <option value="">— catégorie —</option>
        {BRANCH_ORDER.map((key) => <option key={key} value={key}>{BRANCH_LABELS[key]}</option>)}
      </select>
      <input
        ref={aRef} className="field field--xp" type="text" inputMode="numeric" placeholder="XP"
        value={amount}
        onChange={(e) => { const v = e.target.value; setAmount(v); patch((r) => { r.amount = v; }); }}
        onBlur={() => patch((r) => { r.amount = amount.trim(); })}
      />
      <button
        ref={btnRef} type="button"
        className={'evtline__chars xprow__participants-btn' + (names.length ? ' evtline__chars--hoverable' : '')}
        data-chars={names.length ? names.map((n) => '• ' + n).join('\n') : undefined}
        onClick={openPicker}
      >
        {'Participants (' + names.length + ')'}
      </button>
      {pickerOpen && pos && (
        <XpParticipantsPicker
          chars={chars} charIds={charIds} pos={pos}
          onToggle={toggleChar} onToggleAll={toggleAllChars} onClose={() => setPickerOpen(false)}
        />
      )}
      <button
        className="tbtn" type="button" aria-label="retirer"
        onClick={() => mutate((s) => { s.sessionDraft.xp = s.sessionDraft.xp.filter((x) => x.id !== row.id); })}
      >
        ×
      </button>
    </div>
  );
}

/** Ligne de listing en lecture — description, personnages liés, conséquence(s) liée(s) le cas échéant. */
function EventListRow({ row, chars, consequences, mutate }) {
  const names = (row.charIds || [])
    .map((cid) => (chars.find((c) => c.id === cid) || {}).name)
    .filter(Boolean);
  const linkedConseqs = (consequences || []).filter((c) => c.eventId === row.id);
  return (
    <li className="evtline" id={'evt-' + row.id}>
      <span className="evtline__desc">{row.description || 'Sans description'}</span>
      <span
        className={'evtline__chars' + (names.length ? ' evtline__chars--hoverable' : '')}
        data-chars={names.length ? names.map((n) => '• ' + n).join('\n') : undefined}
      >
        {names.length ? 'Participants (' + names.length + ')' : '—'}
      </span>
      <span className="evtline__conseq">
        {linkedConseqs.length ? (
          linkedConseqs.map((c) => (
            <a key={c.id} className="ssn-evtlink" href={'#conseq-' + c.id}>
              {(c.effect || c.trigger || 'Conséquence').slice(0, 40)}{(c.effect || c.trigger || '').length > 40 ? '…' : ''}
            </a>
          ))
        ) : (
          <span className="evtline__conseq--empty">—</span>
        )}
      </span>
      <button
        className="evtline__remove" type="button" aria-label="retirer l’événement"
        onClick={() => mutate((s) => { s.sessionDraft.events = s.sessionDraft.events.filter((x) => x.id !== row.id); })}
      >
        ×
      </button>
    </li>
  );
}

/** Ligne de listing en lecture — description, personnages, événement lié — même modèle que les événements. */
function ConseqListRow({ row, chars, events, mutate }) {
  const names = (row.charIds || [])
    .map((cid) => (chars.find((c) => c.id === cid) || {}).name)
    .filter(Boolean);
  const linkedEvent = row.eventId ? (events || []).find((e) => e.id === row.eventId) : null;
  return (
    <li className="evtline" id={'conseq-' + row.id}>
      <span className="evtline__desc">{row.effect || row.trigger || 'Sans description'}</span>
      <span
        className={'evtline__chars' + (names.length ? ' evtline__chars--hoverable' : '')}
        data-chars={names.length ? names.map((n) => '• ' + n).join('\n') : undefined}
      >
        {names.length ? 'Participants (' + names.length + ')' : '—'}
      </span>
      <span className="evtline__conseq">
        {linkedEvent ? (
          <a className="ssn-evtlink" href={'#evt-' + linkedEvent.id}>
            {(linkedEvent.description || 'Sans description').slice(0, 40)}
            {(linkedEvent.description || '').length > 40 ? '…' : ''}
          </a>
        ) : (
          <span className="evtline__conseq--empty">—</span>
        )}
      </span>
      <button
        className="evtline__remove" type="button" aria-label="retirer la conséquence"
        onClick={() => mutate((s) => { s.sessionDraft.consequences = s.sessionDraft.consequences.filter((x) => x.id !== row.id); })}
      >
        ×
      </button>
    </li>
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

function TimeBlockRow({ row, types, mutate }) {
  const [name, setName, nameRef] = useSyncedField(row.name);
  const patch = (fn) =>
    mutate((s) => { const b = s.sessionDraft.timeBlocks.find((x) => x.id === row.id); if (b) fn(b); });
  const type = types.find((t) => t.id === row.typeId);
  const numField = (key, label) => (
    <input
      className="finput timeblock__dur" type="number" min="0" step="1" placeholder={label}
      value={row[key] || ''}
      onChange={(e) => patch((b) => { b[key] = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0); })}
    />
  );
  return (
    <div className="timeblock" style={{ '--tb-color': type ? type.color : 'var(--rule)' }}>
      <input
        ref={nameRef} className="finput timeblock__name" type="text" placeholder="Nom du bloc"
        value={name}
        onChange={(e) => { const v = e.target.value; setName(v); patch((b) => { b.name = v; }); }}
        onBlur={() => patch((b) => { b.name = name.trim(); })}
      />
      <div className="timeblock__durs">
        {numField('h', 'h')}
        {numField('d', 'j')}
        {numField('w', 'sem')}
      </div>
      <div className="timeblock__foot">
        <select
          className="field timeblock__type" value={row.typeId || ''}
          onChange={(e) => patch((b) => { b.typeId = e.target.value; })}
        >
          <option value="">— type —</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name || 'Sans nom'}</option>)}
        </select>
        <span className="timeblock__hrs">{fmtDuration(blockHours(row))}</span>
        <button
          className="tbtn" type="button" aria-label="retirer ce bloc de temps"
          onClick={() => mutate((s) => { s.sessionDraft.timeBlocks = s.sessionDraft.timeBlocks.filter((x) => x.id !== row.id); })}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function TimeBlocksModal({ blocks, types, mutate, onClose }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card timeblocks__card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Blocs de temps</h3>
        {blocks.length > 0 ? (
          <div className="timeblocks__editlist">
            {blocks.map((b) => <TimeBlockRow key={b.id} row={b} types={types} mutate={mutate} />)}
          </div>
        ) : (
          <p className="empty">Aucun bloc de temps pour l’instant.</p>
        )}
        <button
          className="tbtn" type="button"
          onClick={() => mutate((s) => { s.sessionDraft.timeBlocks.push(makeTimeBlock()); })}
        >
          ＋ ajouter bloc de temps
        </button>
        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function TimePie({ recap, total }) {
  const cx = 45, cy = 45, r = 42, labelR = 26;
  let angle = 0;
  const slices = recap.map((r2) => {
    const frac = total ? r2.hrs / total : 0;
    const start = angle;
    const end = angle + frac * 360;
    angle = end;
    return { ...r2, start, end, pct: Math.round(frac * 100) };
  });
  return (
    <svg className="timepie" width="90" height="90" viewBox="0 0 90 90" role="img" aria-label="Répartition du temps par type d’évènement">
      {slices.length === 1 ? (
        <circle cx={cx} cy={cy} r={r} fill={slices[0].type ? slices[0].type.color : 'var(--rule)'} />
      ) : (
        slices.map((s) => {
          const [x1, y1] = polar(cx, cy, r, s.start);
          const [x2, y2] = polar(cx, cy, r, s.end);
          const large = s.end - s.start > 180 ? 1 : 0;
          const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
          return <path key={s.typeId || 'none'} d={d} fill={s.type ? s.type.color : 'var(--rule)'} stroke="var(--bg)" strokeWidth="1" />;
        })
      )}
      {slices.map((s) => {
        const mid = (s.start + s.end) / 2;
        const [lx, ly] = polar(cx, cy, slices.length === 1 ? 0 : labelR, mid);
        if (!s.pct) return null;
        return (
          <text key={(s.typeId || 'none') + '-label'} className="timepie__label" x={slices.length === 1 ? cx : lx} y={slices.length === 1 ? cy : ly}>
            {s.pct}%
          </text>
        );
      })}
    </svg>
  );
}

/** Mini camembert à une seule part : la part du type (couleur), le reste en gris neutre. */
function TimeTypeGauge({ name, color, pct }) {
  const cx = 25, cy = 25, r = 22;
  const end = pct * 3.6;
  return (
    <div className="timegauge">
      <span className="timegauge__name">{name}</span>
      <svg width="50" height="50" viewBox="0 0 50 50" role="img" aria-label={name + ' — ' + pct + '%'}>
        <circle cx={cx} cy={cy} r={r} fill="var(--rule)" />
        {pct > 0 && (
          pct >= 100 ? (
            <circle cx={cx} cy={cy} r={r} fill={color} />
          ) : (
            (() => {
              const [x1, y1] = polar(cx, cy, r, 0);
              const [x2, y2] = polar(cx, cy, r, end);
              const large = end > 180 ? 1 : 0;
              const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
              return <path d={d} fill={color} />;
            })()
          )
        )}
        <text x={cx} y={cy} className="timepie__label">{pct}%</text>
      </svg>
    </div>
  );
}

function TimeBar({ state, mutate }) {
  const d = state.sessionDraft;
  const types = (state.settings && state.settings.timeTypes) || [];
  const blocks = d.timeBlocks || [];
  const total = blocksTotalHours(blocks);
  const [manageOpen, setManageOpen] = useState(false);
  const carry = Number(state.aelCarryHours) || 0;
  const withCarry = total + carry;
  const days = Math.floor(withCarry / 24);
  const nextCarry = withCarry - days * 24;

  const byType = new Map();
  blocks.forEach((b) => {
    const hrs = blockHours(b);
    if (!hrs) return;
    const key = b.typeId || '';
    byType.set(key, (byType.get(key) || 0) + hrs);
  });
  const recap = [...byType.entries()]
    .map(([typeId, hrs]) => ({ typeId, hrs, type: types.find((t) => t.id === typeId) }))
    .sort((a, b) => b.hrs - a.hrs);

  return (
    <div className="ssn-block">
      <h3 className="ssn-h">Temps écoulé pendant la séance</h3>
      <div className="timebar-layout">
        <div className="timebar-list">
          {blocks.length > 0 ? (
            <div className="timebar-summary">
              {blocks.map((b) => {
                const type = types.find((t) => t.id === b.typeId);
                return (
                  <div key={b.id} className="timebar-summary__row" style={{ '--tb-color': type ? type.color : 'var(--rule)' }}>
                    <span className="timebar-summary__swatch" />
                    <span className="timebar-summary__name">{b.name || type?.name || 'Bloc sans nom'}</span>
                    <span className="timebar-summary__hrs">{fmtDuration(blockHours(b))}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty">Aucun bloc de temps.</p>
          )}
          <button className="tbtn" type="button" onClick={() => setManageOpen(true)}>
            ＋ ajouter / gérer les blocs
          </button>
        </div>

        <div className="timebar-main">
          <div className="timebar-headrow">
            <div className="prep-total">
              <span className="prep-total__label">Temps total cumulé</span>
              <span className="prep-total__value">{fmtDuration(total)}</span>
            </div>
            {recap.length > 0 && <TimePie recap={recap} total={total} />}
            {recap.length > 0 && (
              <div className="timegauge-row">
                {recap.map((r) => (
                  <TimeTypeGauge
                    key={r.typeId || 'none'}
                    name={r.type ? (r.type.name || 'Sans nom') : 'Sans type'}
                    color={r.type ? r.type.color : 'var(--rule)'}
                    pct={total ? Math.round((r.hrs / total) * 100) : 0}
                  />
                ))}
              </div>
            )}
          </div>

          {blocks.length > 0 ? (
            <div className="timebar">
              {blocks.map((b) => {
                const hrs = blockHours(b);
                if (!hrs) return null;
                const type = types.find((t) => t.id === b.typeId);
                const pct = total ? (hrs / total) * 100 : 0;
                return (
                  <div
                    key={b.id} className="timebar__seg"
                    style={{ width: pct + '%', '--tb-color': type ? type.color : 'var(--rule)' }}
                    title={(b.name || type?.name || 'Bloc') + ' — ' + fmtDuration(hrs)}
                  >
                    <span className="timebar__seg-label">{b.name || type?.name || ''}</span>
                    <span className="timebar__seg-dur">{fmtDuration(hrs)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty">Aucun bloc de temps pour l’instant.</p>
          )}

          <p className="dd-hint timebar__total">
            {carry > 0 && <>+ {fmtDuration(carry)} reporté{carry !== 1 ? 's' : ''} des séances précédentes — </>}
            fera avancer le calendrier en jeu de{' '}
            <b>{days} jour{days > 1 ? 's' : ''}</b> à la clôture
            {nextCarry > 0 && <>, {fmtDuration(nextCarry)} reporté{nextCarry !== 1 ? 's' : ''} sur la suite</>}.
          </p>
        </div>
      </div>

      {manageOpen && (
        <TimeBlocksModal blocks={blocks} types={types} mutate={mutate} onClose={() => setManageOpen(false)} />
      )}
    </div>
  );
}

/* --- accès aux préparations de séance ----------------------------- */

function linkKey(queteId, sessionId) { return queteId + '::' + sessionId; }

function resolvePrepLink(state) {
  const d = state.sessionDraft;
  const quetes = state.prepSessions || [];
  const link = d.prepLink;
  const selQuete = link ? quetes.find((q) => q.id === link.queteId) : null;
  const selSession = selQuete ? (selQuete.sessions || []).find((s) => s.id === link.sessionId) : null;
  return { quetes, link, selSession };
}

const PREP_SUMMARY_HEADER = 'Parmi les objectifs décidés, ils ont réussi à :';
const EVENTS_SUMMARY_HEADER = 'Événements :';
// « Événement : » (singulier) : ancien format, reconnu pour nettoyer les résumés déjà générés avec.
const AUTO_SUMMARY_HEADERS = [PREP_SUMMARY_HEADER, EVENTS_SUMMARY_HEADER, 'Événement :'];

/** Texte écrit à la main par le MJ, sans aucun des blocs auto (peu importe où ils traînent encore). */
function manualSummaryText(summary) {
  const base = summary || '';
  let idx = -1;
  AUTO_SUMMARY_HEADERS.forEach((h) => {
    const i = base.indexOf(h);
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  });
  return (idx >= 0 ? base.slice(0, idx) : base).replace(/\s+$/, '');
}

function prepBlockText(dr, sess) {
  const checked = sess ? (sess.xpBlocks || []).filter((b) => dr.prepChecks && dr.prepChecks[b.id]) : [];
  if (!checked.length) return '';
  const list = checked.map((b) => '- ' + (b.titre || (BRANCH_LABELS[b.branchKey] || 'Bloc'))).join('\n');
  return PREP_SUMMARY_HEADER + '\n' + list;
}

function eventsBlockText(events) {
  if (!events || !events.length) return '';
  const list = events.map((e) => '- [[evt:' + e.id + '|' + (e.description || 'Sans description') + ']]').join('\n');
  return EVENTS_SUMMARY_HEADER + '\n' + list;
}

/**
 * Reconstruit le résumé en entier : texte manuel du MJ, puis, toujours dans
 * cet ordre fixe, le bloc « Objectifs » puis le bloc « Événements ». Chaque
 * bloc est régénéré au complet à chaque appel, donc jamais de doublon ni de
 * désordre même après plusieurs ajouts successifs.
 */
function rebuildSummary(dr, sess) {
  const manual = manualSummaryText(dr.summary);
  const blocks = [prepBlockText(dr, sess), eventsBlockText(dr.events)].filter(Boolean);
  dr.summary = [manual, ...blocks].filter(Boolean).join('\n\n');
}

/**
 * Synchronise « Attribution d'XP » avec les objectifs prévus cochés : une
 * ligne par objectif validé (raison + catégorie + XP déjà remplis, reste les
 * participants à choisir), retirée automatiquement si décoché. Ne touche
 * jamais aux lignes ajoutées à la main (repérées par prepBlockId absent).
 */
function syncPrepXpRows(dr, sess, xpCalibreur) {
  dr.xp = dr.xp || [];
  dr.xp = dr.xp.filter((r) => !r.prepBlockId || (dr.prepChecks && dr.prepChecks[r.prepBlockId]));
  const blocks = sess ? (sess.xpBlocks || []) : [];
  blocks.forEach((b) => {
    if (!dr.prepChecks || !dr.prepChecks[b.id]) return;
    if (dr.xp.some((r) => r.prepBlockId === b.id)) return;
    dr.xp.push({
      id: uid(), prepBlockId: b.id,
      reason: b.titre || (BRANCH_LABELS[b.branchKey] || 'Objectif'),
      branchKey: b.branchKey || null,
      amount: String(resolveBlockXp(b, xpCalibreur)),
      charIds: []
    });
  });
}

/** Sélecteur + total — reste court, à côté de l'identité. */
function PrepAccess({ state, mutate }) {
  const { quetes, link, selSession } = resolvePrepLink(state);

  const setLink = (v) => mutate((s) => {
    if (!v) { s.sessionDraft.prepLink = null; return; }
    const [queteId, sessionId] = v.split('::');
    s.sessionDraft.prepLink = { queteId, sessionId };
  });

  const total = selSession ? sessionTotal(selSession, state.xpCalibreur) : 0;
  const checks = state.sessionDraft.prepChecks || {};
  const earned = selSession
    ? (selSession.xpBlocks || []).reduce((n, b) => n + (checks[b.id] ? resolveBlockXp(b, state.xpCalibreur) : 0), 0)
    : 0;

  return (
    <div className="ssn-prep">
      <span className="flabel">Séance préparée</span>
      <select
        className="finput"
        value={link ? linkKey(link.queteId, link.sessionId) : ''}
        onChange={(e) => setLink(e.target.value)}
      >
        <option value="">— aucune —</option>
        {quetes.map((q) => (
          <optgroup key={q.id} label={q.name || 'Sans nom'}>
            {(q.sessions || []).map((s) => (
              <option key={s.id} value={linkKey(q.id, s.id)}>{s.title || 'Sans titre'}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {link && !selSession && (
        <p className="empty">Cette séance préparée n’existe plus.</p>
      )}

      {selSession && (
        <div className="prep-total prep-total--inline">
          <span className="prep-total__label">Total XP prévu</span>
          <span className="prep-total__sep" />
          <span className="prep-total__value">{earned} / {total}</span>
        </div>
      )}
    </div>
  );
}

/** Une ligne cochable (objectif prévu). */
function PrepBlockRow({ b, checked, onToggle, xpCalibreur }) {
  const branchColor = BRANCH_KIND_VAR[b.branchKey];
  return (
    <li
      className={'ssn-prepblocks__row' + (checked ? ' is-checked' : '')}
      style={branchColor ? { '--prep-branch': branchColor } : undefined}
    >
      <label className="ssn-prepblocks__check">
        <input
          type="checkbox" checked={checked}
          onChange={onToggle}
          className="ssn-prepblocks__checkinput"
        />
        <span
          className="ssn-prepblocks__box"
          style={branchColor ? { '--prep-branch': branchColor } : undefined}
        />
      </label>
      <span className="ssn-prepblocks__title">{b.titre || (BRANCH_LABELS[b.branchKey] || 'Bloc')}</span>
      <span className="ssn-prepblocks__xp">{resolveBlockXp(b, xpCalibreur)} XP</span>
    </li>
  );
}

/** Liste des blocs prévus — pleine largeur, sous les deux colonnes ; groupée par branche, dépliable, cochable en direct. */
function PrepBlocksFull({ state, mutate }) {
  const { selSession } = resolvePrepLink(state);
  const [closedMap, setClosedMap] = useState({});
  if (!selSession) return null;
  const checks = state.sessionDraft.prepChecks || {};
  const toggle = (id) => mutate((s) => {
    const dr = s.sessionDraft;
    dr.prepChecks = dr.prepChecks || {};
    dr.prepChecks[id] = !dr.prepChecks[id];
    const link = dr.prepLink;
    const q = link && (s.prepSessions || []).find((x) => x.id === link.queteId);
    const sess = q && (q.sessions || []).find((x) => x.id === link.sessionId);
    rebuildSummary(dr, sess);
    syncPrepXpRows(dr, sess, s.xpCalibreur);
  });
  const toggleGroup = (key) => setClosedMap((m) => ({ ...m, [key]: !m[key] }));

  const blocks = selSession.xpBlocks || [];
  const groups = BRANCH_ORDER
    .map((key) => ({ key, label: BRANCH_LABELS[key], color: BRANCH_KIND_VAR[key], items: blocks.filter((b) => b.branchKey === key) }))
    .filter((g) => g.items.length > 0);
  const rest = blocks.filter((b) => !BRANCH_ORDER.includes(b.branchKey));
  if (rest.length) groups.push({ key: '__none', label: 'Sans catégorie', color: null, items: rest });

  return (
    <div className="ssn-prepblocks">
      {selSession.description && <p className="ssn-prepblocks__desc">{selSession.description}</p>}
      {groups.length > 0 ? (
        groups.map((g) => {
          const open = !closedMap[g.key];
          return (
            <div key={g.key} className="ssn-prepgroup" style={g.color ? { '--prep-branch': g.color } : undefined}>
              <button
                type="button" className="ssn-prepgroup__head"
                onClick={() => toggleGroup(g.key)} aria-expanded={open}
              >
                <span className={'ssn-prepgroup__chev' + (open ? ' is-open' : '')}>▸</span>
                <span className="ssn-prepgroup__label">{g.label}</span>
                <span className="ssn-prepgroup__count">{g.items.length}</span>
              </button>
              {open && (
                <ul className="ssn-prepblocks__list">
                  {g.items.map((b) => (
                    <PrepBlockRow
                      key={b.id} b={b} checked={!!checks[b.id]}
                      onToggle={() => toggle(b.id)} xpCalibreur={state.xpCalibreur}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })
      ) : (
        <p className="empty">Aucun bloc d’XP prévu.</p>
      )}
    </div>
  );
}

/* --- résumé MJ : aperçu avec vrais liens, édition en texte brut ---- */

const EVT_LINK_RE = /\[\[evt:([^|]+)\|([^\]]*)\]\]/g;

function parseSummaryParts(text, events, chars) {
  const parts = [];
  let last = 0, m, i = 0;
  EVT_LINK_RE.lastIndex = 0;
  const namesFor = (evId) => {
    const ev = (events || []).find((e) => e.id === evId);
    if (!ev) return '';
    return (ev.charIds || [])
      .map((cid) => (chars.find((c) => c.id === cid) || {}).name)
      .filter(Boolean)
      .join(', ');
  };
  while ((m = EVT_LINK_RE.exec(text || ''))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const evId = m[1];
    const names = namesFor(evId);
    parts.push(
      <a
        key={'evtlink-' + i++} className="ssn-evtlink" href={'#evt-' + evId}
        data-chars={names || 'Aucun personnage lié'}
        onClick={(e) => e.stopPropagation()}
      >
        {m[2]}
      </a>
    );
    last = EVT_LINK_RE.lastIndex;
  }
  if (last < (text || '').length) parts.push((text || '').slice(last));
  return parts;
}

/**
 * Résumé MJ : par défaut un aperçu en lecture où les lignes d'événements
 * injectées automatiquement apparaissent comme de vrais liens cliquables
 * (vers l'événement correspondant, plus bas dans la séance), avec un survol
 * listant les personnages concernés. Cliquer dedans bascule sur un textarea
 * classique pour éditer le texte brut.
 */
function SummaryField({ value, onChange, onCommit, events, chars }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal, ref] = useSyncedField(value);
  const hasContent = (value || '').trim().length > 0;
  const placeholder = 'Ce qui a été fait, décidé, découvert ; PNJ rencontrés ; fils laissés en suspens…';

  if (editing) {
    return (
      <textarea
        ref={ref} className="notes" autoFocus
        placeholder={placeholder}
        value={local}
        onChange={(e) => { const v = e.target.value; setLocal(v); onChange(v); }}
        onBlur={() => { onCommit(local); setEditing(false); }}
      />
    );
  }
  return (
    <div
      className={'notes notes--preview' + (hasContent ? '' : ' notes--empty')}
      tabIndex={0} role="textbox" aria-label="Résumé MJ de la séance"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true); }}
    >
      {hasContent ? parseSummaryParts(value, events, chars) : placeholder}
    </div>
  );
}

/* --- vue principale --------------------------------------------- */

function Workspace({ state, mutate, onFinish }) {
  const d = state.sessionDraft;
  const chars = state.characters || [];
  const [title, setTitle, titleRef] = useSyncedField(d.title);
  const [date, setDate, dateRef] = useSyncedField(d.date);
  const [pickOpen, setPickOpen] = useState(false);
  const [eventBuilderOpen, setEventBuilderOpen] = useState(false);
  const [conseqBuilderOpen, setConseqBuilderOpen] = useState(false);

  const set = (fn) => mutate((s) => fn(s.sessionDraft));

  return (
    <div className="ssn">
      <div className="ssn__bar">
        <span className="ssn__live">Séance en cours</span>
        <button className="btn-primary btn-primary--stop" type="button" onClick={onFinish}>
          ⏹ Terminer la séance
        </button>
      </div>

      <div className="ssn-headrow">
        <div className="ssn-idheader">
          <label className="flabel ssn-idheader__field">
            Titre
            <input
              ref={titleRef} className="finput" type="text"
              value={title}
              onChange={(e) => { const v = e.target.value; setTitle(v); set((dr) => { dr.title = v; }); }}
              onBlur={() => set((dr) => { dr.title = title.trim(); })}
            />
          </label>
          <label className="flabel ssn-idheader__field">
            Date réelle
            <input
              ref={dateRef} className="finput" type="text"
              value={date}
              onChange={(e) => { const v = e.target.value; setDate(v); set((dr) => { dr.date = v; }); }}
              onBlur={() => set((dr) => { dr.date = date.trim(); })}
            />
          </label>
          <div className="ssn-idheader__field ssn-idheader__field--wide">
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

        <div className="ssn-headrow__sep" />

        <PrepAccess state={state} mutate={mutate} />
      </div>

      <PrepBlocksFull state={state} mutate={mutate} />

      <TimeBar state={state} mutate={mutate} />

      <div className="ssn-block">
        <h3 className="ssn-h">Résumé MJ de la séance</h3>
        <SummaryField
          value={d.summary}
          events={d.events}
          chars={chars}
          onChange={(v) => set((dr) => { dr.summary = v; })}
          onCommit={(v) => set((dr) => { dr.summary = v; })}
        />
      </div>

      <div className="ssn-block">
        <h3 className="ssn-h">Attribution d’XP</h3>
        <div className="xptable xptable--session">
          <div className="xptable__head"><span>Raison</span><span>Catégorie</span><span>XP</span><span>Participants</span><span /></div>
          {(d.xp || []).map((r) => (
            <XpLine key={r.id} row={r} chars={chars} mutate={mutate} />
          ))}
          <button
            className="tbtn" type="button"
            onClick={() => set((dr) => { dr.xp.push({ id: uid(), reason: '', branchKey: null, amount: '', charIds: [] }); })}
          >
            ＋ ligne
          </button>
        </div>
      </div>

      <div className="ssn-block">
        <h3 className="ssn-h">Événements de la séance</h3>
        {(d.events || []).length > 0 ? (
          <div className="evtlist">
            <div className="evtlist__head">
              <span>Description</span>
              <span>Personnages</span>
              <span>Conséquence</span>
              <span />
            </div>
            <ul className="evtlist__rows">
              {d.events.map((r) => (
                <EventListRow key={r.id} row={r} chars={chars} consequences={d.consequences} mutate={mutate} />
              ))}
            </ul>
          </div>
        ) : (
          <p className="empty">Aucun événement pour l’instant.</p>
        )}
        <button className="tbtn" type="button" onClick={() => setEventBuilderOpen(true)}>
          ＋ événement
        </button>
        {eventBuilderOpen && (
          <EventBuilderModal
            state={state} mutate={mutate} defaultCharId={null}
            onClose={() => setEventBuilderOpen(false)}
          />
        )}
      </div>

      <div className="ssn-block">
        <h3 className="ssn-h">Conséquences</h3>
        {(d.consequences || []).length > 0 ? (
          <div className="evtlist">
            <div className="evtlist__head">
              <span>Description</span>
              <span>Personnages</span>
              <span>Événement</span>
              <span />
            </div>
            <ul className="evtlist__rows">
              {d.consequences.map((r) => (
                <ConseqListRow key={r.id} row={r} chars={chars} events={d.events} mutate={mutate} />
              ))}
            </ul>
          </div>
        ) : (
          <p className="empty">Aucune conséquence pour l’instant.</p>
        )}
        <button className="tbtn" type="button" onClick={() => setConseqBuilderOpen(true)}>
          ＋ conséquence
        </button>
        {conseqBuilderOpen && (
          <ConsequenceBuilderModal
            state={state} mutate={mutate} defaultCharId={null}
            onClose={() => setConseqBuilderOpen(false)}
          />
        )}
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

/* --- panneau orphelin des participants / EXP ----------------------- */

function charXpTotal(charId, xpRows) {
  return (xpRows || []).reduce(
    (n, r) => ((r.charIds || []).indexOf(charId) >= 0 ? n + (parseFloat(r.amount) || 0) : n), 0
  );
}

/** Garantit une ligne d'XP (à 0) pour ce personnage — confirme sa présence sans écraser une ligne déjà saisie. */
function ensureXpRow(dr, charId) {
  dr.xp = dr.xp || [];
  if (!dr.xp.some((r) => (r.charIds || []).indexOf(charId) >= 0)) {
    dr.xp.push({ id: uid(), reason: '', branchKey: null, amount: '0', charIds: [charId] });
  }
}

/**
 * Case à 3 états, posée dans l'en-tête de colonne (au-dessus des cases de
 * chaque ligne) : sa position seule indique qu'elle coche/décoche tout.
 * Vide → coche tout ; indéterminé (partiel) → coche tout ; plein → décoche tout.
 */
function SelectAllCheckbox({ allOn, someOn, onToggle }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = someOn && !allOn; }, [someOn, allOn]);
  return (
    <input
      ref={ref} type="checkbox" checked={allOn} onChange={onToggle}
      className="ssnparticipants__headcheck"
      title={allOn ? 'Tout décocher' : 'Tout cocher'}
      aria-label={allOn ? 'Tout décocher' : 'Tout cocher'}
    />
  );
}

const TRAIT_STATUS_LABEL = {
  draft: 'Brouillon', pending: 'En attente', creating: 'En création', accepted: 'Créé', refused: 'Refusé'
};

/**
 * Builder d'événement : choix des personnages concernés (le déclencheur est
 * pré-coché), texte de ce qui s'est passé, et une conséquence optionnelle
 * dont le déclencheur (« X ont fait… ») est déduit automatiquement — le MJ
 * n'écrit que le « donc ». À la validation : pousse l'événement (et la
 * conséquence si présente) dans la séance, et ajoute une ligne dans le
 * résumé MJ.
 */
function EventBuilderModal({ state, mutate, defaultCharId, onClose }) {
  const chars = [...(state.characters || [])].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' })
  );
  const [charIds, setCharIds] = useState(defaultCharId ? [defaultCharId] : []);
  const [description, setDescription] = useState('');
  const [addConseq, setAddConseq] = useState(false);
  const [conseqEffect, setConseqEffect] = useState('');

  const toggleChar = (cid) =>
    setCharIds((ids) => (ids.indexOf(cid) >= 0 ? ids.filter((x) => x !== cid) : [...ids, cid]));

  const names = charIds
    .map((id) => (chars.find((c) => c.id === id) || {}).name)
    .filter(Boolean)
    .join(', ') || '—';

  const canSubmit = charIds.length > 0 && description.trim();

  const submit = () => {
    if (!canSubmit) return;
    mutate((s) => {
      const dr = s.sessionDraft;
      const desc = description.trim();
      const eid = uid();
      dr.events = dr.events || [];
      dr.events.push({ id: eid, description: desc, charIds: [...charIds] });

      if (addConseq && conseqEffect.trim()) {
        dr.consequences = dr.consequences || [];
        dr.consequences.push({
          id: uid(), trigger: names + ' ont fait : ' + desc,
          effect: conseqEffect.trim(), charIds: [...charIds], eventId: eid
        });
      }

      const { selSession } = resolvePrepLink(s);
      rebuildSummary(dr, selSession);
    });
    onClose();
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card evtbuilder" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Ajouter un événement</h3>

        <div className="evtbuilder__body">
          <div className="evtbuilder__chars">
            <span className="flabel">Personnages concernés</span>
            <ul className="evtbuilder__charlist">
              {chars.map((c) => (
                <li key={c.id}>
                  <label className="evtbuilder__charrow">
                    <input
                      type="checkbox" checked={charIds.indexOf(c.id) >= 0}
                      onChange={() => toggleChar(c.id)}
                    />
                    <span>{c.name || 'Sans nom'}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="evtbuilder__main">
            <label className="flabel">
              Ce qui s’est passé
              <textarea
                className="finput finput--area evtbuilder__desc" autoFocus
                placeholder="Ce que ces personnages ont fait…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            {!addConseq ? (
              <button className="tbtn" type="button" onClick={() => setAddConseq(true)}>
                ＋ conséquence
              </button>
            ) : (
              <div className="evtbuilder__conseq">
                <p className="evtbuilder__conseq-trigger">{names} ont fait : {description.trim() || '…'}</p>
                <label className="flabel">
                  Donc…
                  <textarea
                    className="finput finput--area" placeholder="Ce que ça déclenchera…"
                    value={conseqEffect}
                    onChange={(e) => setConseqEffect(e.target.value)}
                  />
                </label>
                <button
                  className="tbtn" type="button"
                  onClick={() => { setAddConseq(false); setConseqEffect(''); }}
                >
                  retirer la conséquence
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onClose}>Annuler</button>
          <button className="btn-primary" type="button" disabled={!canSubmit} onClick={submit}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Builder de conséquence : même modèle que le builder d'événement — liste de
 * personnages à cocher à gauche (au plus un, la conséquence ne lie qu'un seul
 * personnage), champs Si / Alors à droite.
 */
function ConsequenceBuilderModal({ state, mutate, defaultCharId, onClose }) {
  const chars = [...(state.characters || [])].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' })
  );
  const existingEvents = state.sessionDraft.events || [];
  const [charIds, setCharIds] = useState(defaultCharId ? [defaultCharId] : []);
  const [triggerMode, setTriggerMode] = useState(existingEvents.length ? 'existing' : 'new');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [effect, setEffect] = useState('');

  const toggleChar = (cid) =>
    setCharIds((ids) => (ids.indexOf(cid) >= 0 ? ids.filter((x) => x !== cid) : [...ids, cid]));

  const selectEvent = (evId) => {
    setSelectedEventId(evId);
    const ev = existingEvents.find((e) => e.id === evId);
    if (ev) setCharIds([...(ev.charIds || [])]);
  };

  const canSubmit = effect.trim()
    || (triggerMode === 'existing' ? !!selectedEventId : newEventDesc.trim());

  const submit = () => {
    if (!canSubmit) return;
    mutate((s) => {
      const dr = s.sessionDraft;
      let eventId = null;
      let triggerText = '';

      if (triggerMode === 'existing' && selectedEventId) {
        const ev = (dr.events || []).find((e) => e.id === selectedEventId);
        eventId = selectedEventId;
        triggerText = ev ? ev.description : '';
      } else if (triggerMode === 'new' && newEventDesc.trim()) {
        eventId = uid();
        dr.events = dr.events || [];
        dr.events.push({ id: eventId, description: newEventDesc.trim(), charIds: [...charIds] });
        triggerText = newEventDesc.trim();
      }

      dr.consequences = dr.consequences || [];
      dr.consequences.push({
        id: uid(), trigger: triggerText, effect: effect.trim(), charIds: [...charIds], eventId
      });
    });
    onClose();
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card evtbuilder" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Ajouter une conséquence</h3>

        <div className="evtbuilder__body">
          <div className="evtbuilder__chars">
            <span className="flabel">Personnages concernés</span>
            <ul className="evtbuilder__charlist">
              {chars.map((c) => (
                <li key={c.id}>
                  <label className="evtbuilder__charrow">
                    <input type="checkbox" checked={charIds.indexOf(c.id) >= 0} onChange={() => toggleChar(c.id)} />
                    <span>{c.name || 'Sans nom'}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="evtbuilder__main">
            <div className="flabel">
              Si — ce que les joueur·euses ont fait…
              <div className="cnsbuilder__trigtabs">
                <button
                  type="button" className={'cnsbuilder__trigtab' + (triggerMode === 'existing' ? ' is-active' : '')}
                  onClick={() => setTriggerMode('existing')}
                >
                  Événement déjà survenu
                </button>
                <button
                  type="button" className={'cnsbuilder__trigtab' + (triggerMode === 'new' ? ' is-active' : '')}
                  onClick={() => setTriggerMode('new')}
                >
                  Nouvel événement
                </button>
              </div>
              {triggerMode === 'existing' ? (
                existingEvents.length > 0 ? (
                  <select
                    className="finput" value={selectedEventId}
                    onChange={(e) => selectEvent(e.target.value)}
                  >
                    <option value="">— choisir un événement —</option>
                    {existingEvents.map((e) => (
                      <option key={e.id} value={e.id}>{e.description || 'Sans description'}</option>
                    ))}
                  </select>
                ) : (
                  <p className="empty">Aucun événement pour l’instant — passe par « Nouvel événement ».</p>
                )
              ) : (
                <textarea
                  className="finput finput--area evtbuilder__desc" autoFocus
                  placeholder="Ce qui a déclenché…"
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                />
              )}
            </div>
            <label className="flabel">
              Alors — ce que ça déclenchera…
              <textarea
                className="finput finput--area" placeholder="Ce qui va se passer…"
                value={effect}
                onChange={(e) => setEffect(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onClose}>Annuler</button>
          <button className="btn-primary" type="button" disabled={!canSubmit} onClick={submit}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Le bouton + orphelin d'un participant : ouvre un petit panneau à sa droite
 * avec « Consulter » (infos gameplay en lecture seule) et « Ajouter » (crée
 * et pré-lie un événement / une conséquence / un secret à ce personnage).
 */
function CharQuickMenu({ state, mutate, char, open, onToggle, onClose }) {
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [eventBuilderOpen, setEventBuilderOpen] = useState(false);
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.top, left: r.right + 8 });
  }, [open]);

  const totalXp = (char.xp || []).reduce((n, r) => n + (parseInt(r.amount, 10) || 0), 0);
  const level = levelForXp(state.xpCalibreur, totalXp);
  const traits = char.traits || [];

  const openEventBuilder = () => { setEventBuilderOpen(true); onClose(); };
  const addConsequence = () => {
    mutate((s) => {
      s.sessionDraft.consequences = s.sessionDraft.consequences || [];
      s.sessionDraft.consequences.push({ id: uid(), trigger: '', effect: '', charIds: [char.id] });
    });
    onClose();
  };
  const addSecret = () => {
    mutate((s) => {
      s.secrets = s.secrets || [];
      s.secrets.push({ id: uid(), title: '', tags: [], blocks: [{ id: uid(), text: '', revealedTo: [char.id] }] });
    });
    onClose();
  };

  return (
    <div className="ssnparticipants__quick">
      <button
        ref={btnRef}
        type="button" className="ssnparticipants__addbtn" onClick={onToggle}
        aria-label={'Actions pour ' + (char.name || 'ce personnage')} aria-expanded={open}
      >
        +
      </button>
      {open && pos && createPortal(
        <>
          <div className="ssnparticipants__menu-backdrop" onClick={onClose} />
          <div className="ssnparticipants__menu" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
            <div className="ssnparticipants__menu-label">Consulter :</div>
            <div className="ssnparticipants__menu-consult">
              <div className="ssnparticipants__menu-row"><span>Niveau</span><span>{level}</span></div>
              <div className="ssnparticipants__menu-row"><span>XP total</span><span>{totalXp}</span></div>
              {char.race && <div className="ssnparticipants__menu-row"><span>Race</span><span>{char.race}</span></div>}

              <div className="ssnparticipants__menu-subhead">Note MJ</div>
              <p className="ssnparticipants__menu-note">{(char.mjNote || '').trim() || 'Aucune note.'}</p>

              <div className="ssnparticipants__menu-subhead">Traits<span className="count"> ({traits.length})</span></div>
              {traits.length > 0 ? (
                <div className="ssnparticipants__menu-traits">
                  {traits.map((t) => (
                    <div key={t.id} className="ssnparticipants__menu-trait">
                      <span>{t.name || 'Sans nom'}</span>
                      <span className={'pj__traitstatus pj__traitstatus--' + t.status}>
                        {TRAIT_STATUS_LABEL[t.status] || t.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">Aucun trait.</p>
              )}
            </div>

            <div className="ssnparticipants__menu-label">Ajouter :</div>
            <div className="ssnparticipants__menu-add">
              <button type="button" onClick={openEventBuilder}>Événement</button>
              <button type="button" onClick={addConsequence}>Conséquence</button>
              <button type="button" onClick={addSecret}>Secret</button>
            </div>
          </div>
        </>,
        document.body
      )}
      {eventBuilderOpen && createPortal(
        <EventBuilderModal
          state={state} mutate={mutate} defaultCharId={char.id}
          onClose={() => setEventBuilderOpen(false)}
        />,
        document.body
      )}
    </div>
  );
}

function ParticipantsPanel({ state, mutate }) {
  const d = state.sessionDraft;
  const [menuFor, setMenuFor] = useState(null);
  const chars = [...(state.characters || [])].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' })
  );
  const participants = d.participants || [];
  const allOn = chars.length > 0 && chars.every((c) => participants.indexOf(c.id) >= 0);
  const someOn = chars.some((c) => participants.indexOf(c.id) >= 0);

  const toggle = (cid) => mutate((s) => {
    const dr = s.sessionDraft;
    dr.participants = dr.participants || [];
    const i = dr.participants.indexOf(cid);
    if (i >= 0) { dr.participants.splice(i, 1); } else { dr.participants.push(cid); ensureXpRow(dr, cid); }
  });

  const toggleAll = () => mutate((s) => {
    const dr = s.sessionDraft;
    if (allOn) { dr.participants = []; return; }
    dr.participants = chars.map((c) => c.id);
    chars.forEach((c) => ensureXpRow(dr, c.id));
  });

  return (
    <div className="ssnparticipants">
      <h3 className="ssnparticipants__title">Participants<span className="count"> ({participants.length})</span></h3>

      {chars.length > 0 ? (
        <>
          <div className="ssnparticipants__exphead">
            <SelectAllCheckbox allOn={allOn} someOn={someOn} onToggle={toggleAll} />
            <span className="ssnparticipants__name">Personnage</span>
            <span>EXP gagnée</span>
          </div>

          <ul className="ssnparticipants__list">
            {chars.map((c) => {
              const checked = participants.indexOf(c.id) >= 0;
              return (
                <li key={c.id}>
                  <label className="ssnparticipants__row">
                    <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} />
                    <span className="ssnparticipants__name">{c.name || 'Sans nom'}</span>
                    <span className="ssnparticipants__xp">{charXpTotal(c.id, d.xp)}</span>
                  </label>
                  <CharQuickMenu
                    state={state} mutate={mutate} char={c}
                    open={menuFor === c.id}
                    onToggle={() => setMenuFor((m) => (m === c.id ? null : c.id))}
                    onClose={() => setMenuFor(null)}
                  />
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="empty">Aucun personnage — crée-les dans l’onglet « Personnages ».</p>
      )}
    </div>
  );
}

export default function SessionEnCours({ state, mutate, onFinish, onClose }) {
  const d = state.sessionDraft;
  if (!d) return null;
  return (
    <div className="ssnpanel" role="dialog" aria-modal="true">
      <ParticipantsPanel state={state} mutate={mutate} />
      <div className="ssnpanel__card">
        <div className="ssnpanel__head">
          <h2 className="ssnpanel__title">{d.title || 'Séance en cours'}</h2>
          <button className="ssnpanel__close" type="button" onClick={onClose} aria-label="Fermer le panneau">×</button>
        </div>
        <div className="ssnpanel__body">
          <Workspace state={state} mutate={mutate} onFinish={onFinish} />
        </div>
      </div>
    </div>
  );
}
