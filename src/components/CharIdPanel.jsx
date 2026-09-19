import { useSyncedField } from '../lib/useSyncedField.js';

/**
 * Panneau artwork partagé (joueur + MJ) : artwork, puis Nom / Niveau / Race
 * en lignes compactes « label : valeur » plutôt qu'en champs empilés.
 * Le niveau est calculé, jamais saisi.
 */
export default function CharIdPanel({ char, patch, level }) {
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
        <div className="pj__idrow">
          <span className="pj__idlabel">Nom</span>
          <input
            ref={nameRef} className="pj__idinput" type="text" placeholder="Nom"
            value={name}
            onChange={(e) => { const v = e.target.value; setName(v); patch((c) => { c.name = v; }); }}
            onBlur={() => patch((c) => { c.name = name.trim(); })}
          />
        </div>
        <div className="pj__idrow">
          <span className="pj__idlabel">Niveau</span>
          <span className="pj__idlevel">{level}</span>
        </div>
        <div className="pj__idrow">
          <span className="pj__idlabel">Race</span>
          <input
            ref={raceRef} className="pj__idinput" type="text" placeholder="Race"
            value={race}
            onChange={(e) => { const v = e.target.value; setRace(v); patch((c) => { c.race = v; }); }}
            onBlur={() => patch((c) => { c.race = race.trim(); })}
          />
        </div>
      </div>
    </div>
  );
}
