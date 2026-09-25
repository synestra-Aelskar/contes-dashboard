import TraitAdminBlock from '../TraitAdminBlock.jsx';

function accountLabelFor(char, accounts) {
  const acc = accounts.find((a) => a.userId && a.userId === char.ownerId);
  return acc ? (acc.label || acc.email) : 'Sans compte lié';
}

/** Regroupe une liste de {char, trait} par compte puis par personnage,
 * triés par nom, pour que le MJ retrouve vite qui a proposé quoi. */
function groupByAccount(items, accounts) {
  const byAccount = new Map();
  items.forEach(({ char, trait }) => {
    const label = accountLabelFor(char, accounts);
    if (!byAccount.has(label)) byAccount.set(label, new Map());
    const byChar = byAccount.get(label);
    if (!byChar.has(char.id)) byChar.set(char.id, { char, traits: [] });
    byChar.get(char.id).traits.push(trait);
  });
  return Array.from(byAccount.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, byChar]) => ({
      label,
      chars: Array.from(byChar.values()).sort((a, b) => (a.char.name || '').localeCompare(b.char.name || ''))
    }));
}

function TraitSection({ title, items, accounts, mutate }) {
  const groups = groupByAccount(items, accounts);
  return (
    <div className="chr__block">
      <h4 className="chr__h">{title}<span className="count"> ({items.length})</span></h4>
      <div className="pj__valgroups">
        {groups.map((g) => (
          <div key={g.label} className="pj__valaccount">
            <h5 className="pj__valaccounthead">{g.label}</h5>
            {g.chars.map(({ char, traits }) => (
              <div key={char.id} className="pj__valchar">
                <p className="chr__muted">{char.name || 'Sans nom'}</p>
                <div className="pj__traits">
                  {traits.map((trait) => <TraitAdminBlock key={trait.id} char={char} trait={trait} mutate={mutate} />)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Recap MJ des traits qui attendent une action : à valider/refuser, ou déjà
 * validés et à créer en jeu (Necronicon) avant confirmation finale — triés
 * par compte puis par personnage. */
export default function Validations({ state, mutate }) {
  const chars = state.characters || [];
  const accounts = (state.settings && state.settings.accounts) || [];
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
            <TraitSection title="Traits en attente de validation" items={pending} accounts={accounts} mutate={mutate} />
          )}
          {creating.length > 0 && (
            <TraitSection title="Traits validés, à créer en jeu" items={creating} accounts={accounts} mutate={mutate} />
          )}
        </>
      )}
    </section>
  );
}
