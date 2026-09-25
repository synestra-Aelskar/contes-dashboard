import TraitAdminBlock from '../TraitAdminBlock.jsx';

/** Recap MJ des traits qui attendent une action : à valider/refuser, ou déjà
 * validés et à créer en jeu (Necronicon) avant confirmation finale. */
export default function Validations({ state, mutate }) {
  const chars = state.characters || [];
  const pending = [];
  const creating = [];
  chars.forEach((c) => (c.traits || []).forEach((t) => {
    if (t.status === 'pending') pending.push({ char: c, trait: t });
    else if (t.status === 'creating') creating.push({ char: c, trait: t });
  }));
  const total = pending.length + creating.length;

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Validations<span className="count"> ({total})</span></h2>
      </div>

      {!total ? (
        <p className="empty">Rien en attente — tous les traits proposés par les joueurs ont été traités.</p>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="chr__block">
              <h4 className="chr__h">Traits en attente de validation<span className="count"> ({pending.length})</span></h4>
              <div className="pj__traits">
                {pending.map(({ char, trait }) => (
                  <div key={trait.id}>
                    <p className="chr__muted">{char.name || 'Sans nom'}</p>
                    <TraitAdminBlock char={char} trait={trait} mutate={mutate} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {creating.length > 0 && (
            <div className="chr__block">
              <h4 className="chr__h">Traits validés, à créer en jeu<span className="count"> ({creating.length})</span></h4>
              <div className="pj__traits">
                {creating.map(({ char, trait }) => (
                  <div key={trait.id}>
                    <p className="chr__muted">{char.name || 'Sans nom'}</p>
                    <TraitAdminBlock char={char} trait={trait} mutate={mutate} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
