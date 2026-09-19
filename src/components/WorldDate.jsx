import { useState } from 'react';
import AelPicker from './AelPicker.jsx';
import WorldClock from './WorldClock.jsx';
import { aelCompare, aelToday, aelShift, aelDayCycle, aelSeasonLine, aelTextLine2, aelNumeric } from '../lib/aelskar.js';
import { campaignDate, lastSessionAel } from '../lib/campaign.js';
import { blocksTotalHours } from '../lib/timeblocks.js';

export { campaignDate, lastSessionAel };

export default function WorldDate({ state, mutate, readOnly = false }) {
  const [open, setOpen] = useState(false);
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

  const setDate = (d) =>
    mutate((s) => { s.aelPin = { year: d.year, season: d.season, cycle: d.cycle, day: d.day }; });

  // Joueurs : même horloge et même date du présent de la campagne, sans
  // sélecteur — seule la table MJ déplace le temps.
  if (readOnly) {
    return (
      <div className="aelskar-row">
        <div className="aelskar aelskar--readonly">
          <div className="aelskar__face aelskar__face--static">
            <span className="aelskar__main aelskar__main--small">{aelDayCycle(displayDate)}, {aelSeasonLine(displayDate)}</span>
            <span className="aelskar__sub aelskar__sub--small">{aelTextLine2(displayDate)}</span>
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
          onClick={() => setOpen((v) => !v)}
        >
          <span className="aelskar__main aelskar__main--small" title={aelNumeric(displayDate) + (realDrift ? '' : ' · temps réel')}>
            {aelDayCycle(displayDate)}, {aelSeasonLine(displayDate)}
          </span>
          <span className="aelskar__sub aelskar__sub--small">{aelTextLine2(displayDate)}</span>
        </button>
        {open && (
          <AelPicker
            cur={shown}
            onPick={setDate}
            onToday={() => setDate(lastSessionAel(state))}
            midLabel="Dernière séance"
          />
        )}
      </div>
      <WorldClock hours={liveHour} />
    </div>
  );
}
