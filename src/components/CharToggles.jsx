/** Sélecteur de personnages sous forme de puces cliquables. */
export default function CharToggles({ characters, selected, onToggle, single = false }) {
  if (!characters || !characters.length) {
    return <p className="empty">Aucun personnage — crée-les dans l’onglet « Personnages ».</p>;
  }
  return (
    <div className="chips">
      {characters.map((c) => {
        const on = single ? selected === c.id : (selected || []).indexOf(c.id) >= 0;
        return (
          <button
            key={c.id}
            type="button"
            className={'chip' + (on ? ' is-on' : '')}
            onClick={() => onToggle(c.id)}
          >
            {c.name || 'Sans nom'}
          </button>
        );
      })}
    </div>
  );
}
