import { useState } from 'react';
import AelPicker from './AelPicker.jsx';
import { aelCompare, aelToday, aelTextLine1, aelTextLine2, aelNumeric } from '../lib/aelskar.js';
import { campaignDate, lastSessionAel } from '../lib/campaign.js';

export { campaignDate, lastSessionAel };

export default function WorldDate({ state, mutate }) {
  const [open, setOpen] = useState(false);
  const shown = campaignDate(state);
  const realDrift = aelCompare(shown, aelToday()) !== 0;

  const setDate = (d) =>
    mutate((s) => { s.aelPin = { year: d.year, season: d.season, cycle: d.cycle, day: d.day }; });

  return (
    <div className={'aelskar' + (open ? ' is-open' : '')}>
      <button
        className="aelskar__face" type="button" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="aelskar__eyebrow">
          {realDrift ? 'Présent de la campagne' : 'Présent de la campagne · temps réel'}
        </span>
        <span className="aelskar__main">{aelTextLine1(shown)}</span>
        <span className="aelskar__sub">{aelTextLine2(shown)}</span>
        <span className="aelskar__num">{aelNumeric(shown)}</span>
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
  );
}
