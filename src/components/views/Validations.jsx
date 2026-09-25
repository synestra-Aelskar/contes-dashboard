import { useState } from 'react';
import { lsGet, lsSet } from '../../lib/util.js';
import TraitAdminBlock from '../TraitAdminBlock.jsx';

function accountKeyFor(char, accounts) {
  const acc = accounts.find((a) => a.userId && a.userId === char.ownerId);
  return acc ? acc.userId : 'unlinked';
}
function accountLabelFor(char, accounts) {
  const acc = accounts.find((a) => a.userId && a.userId === char.ownerId);
  return acc ? (acc.label || acc.email) : 'Sans compte lié';
}

/** Quatre pastilles de comptage : accepté (vert), en cours de création
 * (orange), en attente (bleu), refusé (rouge) — masquées quand à zéro. */
function StatusPills({ accepted, creating, pending, refused }) {
  return (
    <span className="pj__pills">
      {accepted > 0 && <span className="pj__pill pj__pill--accepted">{accepted}</span>}
      {creating > 0 && <span className="pj__pill pj__pill--creating">{creating}</span>}
      {pending > 0 && <span className="pj__pill pj__pill--pending">{pending}</span>}
      {refused > 0 && <span className="pj__pill pj__pill--refused">{refused}</span>}
    </span>
  );
}

/** Recap MJ des traits qui attendent une action : à valider/refuser, ou déjà
 * validés et à créer en jeu (Necronicon) avant confirmation finale.
 * Onglet par compte, puis onglet par personnage — sinon la liste plate
 * devient illisible dès qu'un personnage a plusieurs traits en attente. */
export default function Validations({ state, mutate }) {
  const chars = state.characters || [];
  const accounts = (state.settings && state.settings.accounts) || [];

  const charEntries = chars
    .map((c) => {
      const pending = (c.traits || []).filter((t) => t.status === 'pending');
      const creating = (c.traits || []).filter((t) => t.status === 'creating');
      const accepted = (c.traits || []).filter((t) => t.status === 'accepted');
      const refused = (c.traits || []).filter((t) => t.status === 'refused');
      return { char: c, pending, creating, accepted, refused, total: pending.length + creating.length };
    })
    .filter((e) => e.total > 0);
  const total = charEntries.reduce((n, e) => n + e.total, 0);

  const accountMap = new Map();
  charEntries.forEach((e) => {
    const key = accountKeyFor(e.char, accounts);
    if (!accountMap.has(key)) accountMap.set(key, { key, label: accountLabelFor(e.char, accounts), entries: [] });
    accountMap.get(key).entries.push(e);
  });
  const accountGroups = Array.from(accountMap.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((g) => ({ ...g, entries: g.entries.sort((a, b) => (a.char.name || '').localeCompare(b.char.name || '')) }));

  const [accKey, setAccKey] = useState(lsGet('ccm.valAcc'));
  const selAccGroup = accountGroups.find((g) => g.key === accKey) || accountGroups[0] || null;

  const [charId, setCharId] = useState(lsGet('ccm.valChar'));
  const selEntry = selAccGroup
    ? (selAccGroup.entries.find((e) => e.char.id === charId) || selAccGroup.entries[0])
    : null;

  function selectAcc(key) { setAccKey(key); lsSet('ccm.valAcc', key); setCharId(null); lsSet('ccm.valChar', ''); }
  function selectChar(id) { setCharId(id); lsSet('ccm.valChar', id); }

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Validations<span className="count"> ({total})</span></h2>
      </div>

      {!total ? (
        <p className="empty">Rien en attente — tous les traits proposés par les joueurs ont été traités.</p>
      ) : (
        <>
          <nav className="pj__nav pj__nav--row">
            {accountGroups.map((g) => (
              <button
                key={g.key} type="button"
                className={'pj__navbtn' + (selAccGroup && selAccGroup.key === g.key ? ' is-active' : '')}
                onClick={() => selectAcc(g.key)}
              >
                {g.label}<span className="count"> ({g.entries.reduce((n, e) => n + e.total, 0)})</span>
              </button>
            ))}
          </nav>

          {selAccGroup && (
            <nav className="pj__nav pj__nav--row pj__nav--sub">
              {selAccGroup.entries.map((e) => (
                <button
                  key={e.char.id} type="button"
                  className={'pj__navbtn' + (selEntry && selEntry.char.id === e.char.id ? ' is-active' : '')}
                  onClick={() => selectChar(e.char.id)}
                >
                  {e.char.name || 'Sans nom'}
                  <StatusPills
                    accepted={e.accepted.length} creating={e.creating.length}
                    pending={e.pending.length} refused={e.refused.length}
                  />
                </button>
              ))}
            </nav>
          )}

          {selEntry && (
            <div className="pj__body">
              {selEntry.pending.length > 0 && (
                <div className="chr__block">
                  <h4 className="chr__h">En attente de validation<span className="count"> ({selEntry.pending.length})</span></h4>
                  <div className="pj__traits">
                    {selEntry.pending.map((trait) => (
                      <TraitAdminBlock key={trait.id} char={selEntry.char} trait={trait} mutate={mutate} />
                    ))}
                  </div>
                </div>
              )}
              {selEntry.creating.length > 0 && (
                <div className="chr__block">
                  <h4 className="chr__h">Validés, à créer en jeu<span className="count"> ({selEntry.creating.length})</span></h4>
                  <div className="pj__traits">
                    {selEntry.creating.map((trait) => (
                      <TraitAdminBlock key={trait.id} char={selEntry.char} trait={trait} mutate={mutate} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
