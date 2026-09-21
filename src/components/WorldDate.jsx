import { useState } from 'react';
import AelPicker from './AelPicker.jsx';
import ValRazkahPicker from './ValRazkahPicker.jsx';
import WorldClock from './WorldClock.jsx';
import { aelCompare, aelToday, aelShift, aelDayCycle, aelSeasonLine, aelTextLine2, aelNumeric } from '../lib/aelskar.js';
import { campaignDate, lastSessionAel } from '../lib/campaign.js';
import { blocksTotalHours } from '../lib/timeblocks.js';
import { vrFromAel, aelFromVr, vrLinkOf, vrEraStart, vrDayCycle, vrSeasonLine, vrTextLine2, vrNumeric } from '../lib/valrazkah.js';
import { lsGet, lsSet } from '../lib/util.js';

const CALENDARS = [['aelskar', 'Aelskar'], ['valrazkah', 'Val’Razkah']];

export { campaignDate, lastSessionAel };

export default function WorldDate({ state, mutate, readOnly = false }) {
  const [open, setOpen] = useState(false);
  // Calendrier affiché : préférence locale à ce navigateur (la date partagée
  // reste celle d'Aelskar, Val'Razkah s'en déduit).
  const [calendar, setCalendarState] = useState(() => (lsGet('ccm.calendar') === 'valrazkah' ? 'valrazkah' : 'aelskar'));
  const setCalendar = (c) => { setCalendarState(c); lsSet('ccm.calendar', c); };
  const isVr = calendar === 'valrazkah';
  // Brouillon de synchronisation { ael, vr } : tant qu'on n'a pas cliqué
  // « Resynchroniser », rien n'est enregistré ni déplacé.
  const [sync, setSync] = useState(null);
  const link = vrLinkOf(state);
  const toVr = (a) => vrFromAel(a, link);
  const eraStart = vrEraStart(link);
  const shown = campaignDate(state);
  const realDrift = aelCompare(shown, aelToday()) !== 0;

  // Aperçu en direct : heure/jour « courants » = dernier état enregistré + le
  // temps des blocs de la séance en cours (pas encore clôturée), recalculé à
  // chaque ajout/suppression d'un bloc — même conversion qu'à la clôture,
  // juste sans rien persister tant qu'on n'a pas terminé la séance.
  const baseHour = Number(state.aelCarryHours) || 0;
  const pendingHours = state.sessionDraft ? blocksTotalHours(state.sessionDraft.timeBlocks) : 0;
  const liveTotal = baseHour + pendingHours;
  const extraDays = Math.floor(liveTotal / 24);
  const liveHour = liveTotal - extraDays * 24;
  const displayDate = extraDays > 0 ? aelShift(shown, extraDays) : shown;

  const act = state.campaign || {};
  const actNumber = (act.actNumber || '').trim();
  const actTitle = (act.actTitle || '').trim();
  const actLine = (actNumber || actTitle) ? (
    <span className="aelskar__act">
      {actNumber && <strong className="aelskar__act-num">{actNumber}</strong>}
      {actNumber && actTitle && <span className="aelskar__act-sep"> : </span>}
      {actTitle && <em className="aelskar__act-title">{actTitle}</em>}
    </span>
  ) : null;

  const setDate = (d) =>
    mutate((s) => { s.aelPin = { year: d.year, season: d.season, cycle: d.cycle, day: d.day }; });

  const vrShown = toVr(displayDate);
  const face = isVr
    ? { main: vrDayCycle(vrShown) + ', ' + vrSeasonLine(vrShown), sub: vrTextLine2(vrShown, eraStart), num: vrNumeric(vrShown) }
    : { main: aelDayCycle(displayDate) + ', ' + aelSeasonLine(displayDate), sub: aelTextLine2(displayDate), num: aelNumeric(displayDate) };

  const pickDate = (d) => ({ year: d.year, season: d.season, cycle: d.cycle, day: d.day });
  const startSync = () => setSync({ ael: shown, vr: toVr(shown) });
  const applySync = () => {
    mutate((st) => {
      st.vrLink = { ael: pickDate(sync.ael), vr: pickDate(sync.vr) };
      st.aelPin = pickDate(sync.ael);
    });
    setSync(null);
  };
  const closePanel = () => { setOpen(false); setSync(null); };

  const calendarSwitch = (
    <div className="aelpick__grid aelpick__grid--2" role="group" aria-label="Calendrier">
      {CALENDARS.map(([key, label]) => (
        <button
          key={key} type="button"
          className={'aelpick__opt' + (key === calendar ? ' is-on' : '')}
          onClick={() => setCalendar(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const syncSlot = sync ? (
    <>
      {calendarSwitch}
      <div className="aelpick__sync">
        <p className="aelpick__hint">
          Règle la date d’Aelskar et celle du Val’Razkah qui désignent le même jour
          (bascule d’un calendrier à l’autre ci-dessus), puis resynchronise.
        </p>
        <div className={'aelpick__syncrow' + (!isVr ? ' is-on' : '')}>
          <span className="aelpick__label">Aelskar</span>
          <span>{aelDayCycle(sync.ael)}, {aelSeasonLine(sync.ael)} · An {sync.ael.year}</span>
        </div>
        <div className={'aelpick__syncrow' + (isVr ? ' is-on' : '')}>
          <span className="aelpick__label">Val’Razkah</span>
          <span>{vrDayCycle(sync.vr)}, {vrSeasonLine(sync.vr)} · An {sync.vr.year}</span>
        </div>
        <div className="aelpick__nav">
          <button className="tbtn" type="button" onClick={applySync}>Resynchroniser</button>
          <button className="tbtn" type="button" onClick={() => setSync(null)}>Annuler</button>
        </div>
      </div>
    </>
  ) : (
    <>
      {calendarSwitch}
      <button className="tbtn aelpick__syncbtn" type="button" onClick={startSync}>Synchroniser les calendriers…</button>
    </>
  );

  // Joueurs : même horloge et même date du présent de la campagne, sans
  // sélecteur — seule la table MJ déplace le temps.
  if (readOnly) {
    return (
      <div className="aelskar-row">
        <div className="aelskar aelskar--readonly">
          <div className="aelskar__face aelskar__face--static">
            <span className="aelskar__main aelskar__main--small">{face.main}</span>
            <span className="aelskar__sub aelskar__sub--small">{face.sub}</span>
            {actLine}
          </div>
        </div>
        <WorldClock hours={liveHour} />
      </div>
    );
  }

  return (
    <div className="aelskar-row">
      <div className={'aelskar' + (open ? ' is-open' : '')}>
        <button
          className="aelskar__face" type="button" aria-expanded={open}
          onClick={() => (open ? closePanel() : setOpen(true))}
        >
          <span className="aelskar__main aelskar__main--small" title={face.num + (realDrift || isVr ? '' : ' · temps réel')}>
            {face.main}
          </span>
          <span className="aelskar__sub aelskar__sub--small">{face.sub}</span>
          {actLine}
        </button>
        {open && (isVr ? (
          <ValRazkahPicker
            eraStart={eraStart}
            cur={sync ? sync.vr : toVr(shown)}
            onPick={sync ? (d) => setSync((x) => ({ ...x, vr: d })) : (d) => setDate(aelFromVr(d, link))}
            onToday={sync ? () => setSync((x) => ({ ...x, vr: toVr(shown) })) : () => setDate(lastSessionAel(state))}
            midLabel={sync ? 'Date actuelle' : 'Dernière séance'}
            topSlot={syncSlot}
          />
        ) : (
          <AelPicker
            cur={sync ? sync.ael : shown}
            onPick={sync ? (d) => setSync((x) => ({ ...x, ael: d })) : setDate}
            onToday={sync ? () => setSync((x) => ({ ...x, ael: shown })) : () => setDate(lastSessionAel(state))}
            midLabel={sync ? 'Date actuelle' : 'Dernière séance'}
            topSlot={syncSlot}
          />
        ))}
      </div>
      <WorldClock hours={liveHour} />
    </div>
  );
}
