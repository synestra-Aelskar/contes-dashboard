import { useState } from 'react';
import AelPicker from './AelPicker.jsx';
import {
  aelValid, aelToday, aelCompare, aelTextLine1, aelTextLine2, aelNumeric
} from '../lib/aelskar.js';

export function campaignDate(state) {
  return aelValid(state.aelPin) ? state.aelPin : aelToday();
}
export function lastSessionAel(state) {
  const ss = state.sessions || [];
  for (let i = ss.length - 1; i >= 0; i--) if (aelValid(ss[i].aelDate)) return ss[i].aelDate;
  return aelToday();
}

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
