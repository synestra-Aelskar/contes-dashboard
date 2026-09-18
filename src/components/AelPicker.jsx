import { useEffect, useState } from 'react';
import {
  AEL, aelShift, aelNumeric, aelKhestil, aelEra, aelYearInEra, aelOrdinal
} from '../lib/aelskar.js';

/**
 * Sélecteur Année -> Saison -> Cycle -> Jour + navigation.
 * props: cur (date), onPick(date), onToday(), midLabel
 */
export default function AelPicker({ cur, onPick, onToday, midLabel }) {
  const [yearText, setYearText] = useState(String(cur.year));
  useEffect(() => { setYearText(String(cur.year)); }, [cur.year]);

  const yPreview = (() => {
    const y = parseInt(yearText, 10);
    return Number.isNaN(y) || y < 0 ? cur.year : y;
  })();

  function commitYear() {
    const y = parseInt(yearText, 10);
    if (Number.isNaN(y) || y < 0) { setYearText(String(cur.year)); return; }
    if (y !== cur.year) onPick({ year: y, season: cur.season, cycle: cur.cycle, day: cur.day });
  }

  function chooser(label, names, curVal, key) {
    return (
      <div className="aelpick__field">
        <span className="aelpick__label">{label}</span>
        <div className="aelpick__grid">
          {names.map((nm, i) => (
            <button
              key={nm}
              type="button"
              className={'aelpick__opt' + (i + 1 === curVal ? ' is-on' : '')}
              onClick={() => onPick({ ...cur, [key]: i + 1 })}
            >
              {nm}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="aelpick">
      <div className="aelpick__field">
        <span className="aelpick__label">Année</span>
        <div className="aelpick__yrow">
          <input
            className="finput aelpick__year"
            type="number" min="0" step="1"
            value={yearText}
            onChange={(e) => setYearText(e.target.value)}
            onBlur={commitYear}
            onKeyDown={(e) => { if (e.key === 'Enter') commitYear(); }}
          />
          <span className="aelpick__yinfo">
            Khestil {aelKhestil(yPreview)} · {aelOrdinal(aelYearInEra(yPreview))} année de l’{aelEra(yPreview).name}
          </span>
        </div>
      </div>

      {chooser('Saison', AEL.SEASON, cur.season, 'season')}
      {chooser('Cycle', AEL.CYCLE, cur.cycle, 'cycle')}
      {chooser('Jour', AEL.DAY, cur.day, 'day')}

      <div className="aelpick__nav">
        <button className="tbtn" type="button" onClick={() => onPick(aelShift(cur, -1))}>← Jour précédent</button>
        <button className="tbtn" type="button" onClick={onToday}>{midLabel || 'Aujourd’hui'}</button>
        <button className="tbtn" type="button" onClick={() => onPick(aelShift(cur, 1))}>Jour suivant →</button>
      </div>
      <div className="aelpick__preview">{aelNumeric(cur)}</div>
    </div>
  );
}
