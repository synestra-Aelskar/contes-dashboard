import { useEffect, useState } from 'react';
import { aelOrdinal } from '../lib/aelskar.js';
import {
  VR, VR_NOCTURNE, vrShift, vrNumeric, vrCycleNames, vrPassage, vrEraLabel, vrYearInEra
} from '../lib/valrazkah.js';

/**
 * Sélecteur Année -> Saison -> Cycle -> Jour du Val'Razkah + navigation.
 * Même contrat que AelPicker : cur (date), onPick(date), onToday(), midLabel, topSlot, eraStart (année absolue de début de l'ère).
 */
export default function ValRazkahPicker({ cur, onPick, onToday, midLabel, topSlot, eraStart }) {
  const [yearText, setYearText] = useState(String(cur.year));
  useEffect(() => { setYearText(String(cur.year)); }, [cur.year]);

  const nocturne = cur.season === VR_NOCTURNE;
  const yPreview = (() => {
    const y = parseInt(yearText, 10);
    return Number.isNaN(y) || y < 0 ? cur.year : y;
  })();

  function commitYear() {
    const y = parseInt(yearText, 10);
    if (Number.isNaN(y) || y < 0) { setYearText(String(cur.year)); return; }
    if (y !== cur.year) onPick({ ...cur, year: y });
  }

  function pickSeason(s) {
    onPick({ ...cur, season: s, cycle: s === VR_NOCTURNE ? 1 : cur.cycle });
  }

  const seasonOpts = VR.GODS.concat(VR.GODS).map((g, i) => ({ label: g + ' ' + vrPassage(i + 1), value: i + 1 }));

  return (
    <div className="aelpick">
      {topSlot}
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
            {yPreview >= eraStart ? aelOrdinal(vrYearInEra(yPreview, eraStart)) + ' année de l’' + VR.ERA : vrEraLabel(yPreview, eraStart)}
          </span>
        </div>
      </div>

      <div className="aelpick__field">
        <span className="aelpick__label">Saison</span>
        <div className="aelpick__grid aelpick__grid--4">
          {seasonOpts.map((o) => (
            <button
              key={o.value} type="button"
              className={'aelpick__opt' + (o.value === cur.season ? ' is-on' : '')}
              onClick={() => pickSeason(o.value)}
            >
              {o.label}
            </button>
          ))}
          <button
            type="button"
            className={'aelpick__opt aelpick__opt--wide' + (nocturne ? ' is-on' : '')}
            onClick={() => pickSeason(VR_NOCTURNE)}
          >
            Nocturne (hors-Saison)
          </button>
        </div>
      </div>

      {!nocturne && (
        <div className="aelpick__field">
          <span className="aelpick__label">Cycle</span>
          <div className="aelpick__grid aelpick__grid--4">
            {vrCycleNames(cur.season).map((nm, i) => (
              <button
                key={nm} type="button"
                className={'aelpick__opt' + (i + 1 === cur.cycle ? ' is-on' : '')}
                onClick={() => onPick({ ...cur, cycle: i + 1 })}
              >
                {nm}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="aelpick__field">
        <span className="aelpick__label">Jour</span>
        <div className="aelpick__grid aelpick__grid--4">
          {VR.DAY.map((nm, i) => (
            <button
              key={nm} type="button"
              className={'aelpick__opt' + (i + 1 === cur.day ? ' is-on' : '')}
              onClick={() => onPick({ ...cur, day: i + 1 })}
            >
              {nm}
            </button>
          ))}
        </div>
      </div>

      <div className="aelpick__nav">
        <button className="tbtn" type="button" onClick={() => onPick(vrShift(cur, -1))}>← Jour précédent</button>
        <button className="tbtn" type="button" onClick={onToday}>{midLabel || 'Aujourd’hui'}</button>
        <button className="tbtn" type="button" onClick={() => onPick(vrShift(cur, 1))}>Jour suivant →</button>
      </div>
      <div className="aelpick__preview">{vrNumeric(cur)}</div>
    </div>
  );
}
