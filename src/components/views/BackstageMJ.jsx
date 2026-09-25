import { useState } from 'react';
import { lsGet, lsSet } from '../../lib/util.js';
import { ThreadMessages } from '../ThreadBoard.jsx';

const MJ_AUTHOR_ID = 'mj';

function accountKeyFor(thread, chars, accounts) {
  const creator = chars.find((c) => c.id === thread.createdBy);
  const acc = creator && accounts.find((a) => a.userId && a.userId === creator.ownerId);
  return acc ? acc.userId : 'unlinked';
}
function accountLabelFor(thread, chars, accounts) {
  const creator = chars.find((c) => c.id === thread.createdBy);
  const acc = creator && accounts.find((a) => a.userId && a.userId === creator.ownerId);
  return acc ? (acc.label || acc.email) : 'Sans compte lié';
}

function threadCategory(t) {
  if (t.closed) return 'closed';
  const last = (t.messages || [])[t.messages.length - 1];
  return last && last.authorId === MJ_AUTHOR_ID ? 'mj' : 'player';
}

function StatusPills({ closed, mj, player }) {
  return (
    <span className="pj__pills">
      {closed > 0 && <span className="pj__pill pj__pill--accepted">{closed}</span>}
      {mj > 0 && <span className="pj__pill pj__pill--creating">{mj}</span>}
      {player > 0 && <span className="pj__pill pj__pill--refused">{player}</span>}
    </span>
  );
}

/** Vue MJ : tous les threads Backstage, triés par compte — le MJ est
 * implicitement participant de chaque thread créé côté joueur. Pastilles :
 * clôturé (vert), dernière réponse MJ (orange), dernière réponse joueur (rouge). */
export default function BackstageMJ({ state, mutate }) {
  const threads = state.threads || [];
  const chars = state.characters || [];
  const accounts = (state.settings && state.settings.accounts) || [];
  const nameOf = (id) => (chars.find((c) => c.id === id) || {}).name || 'Sans nom';

  const accountMap = new Map();
  threads.forEach((t) => {
    const key = accountKeyFor(t, chars, accounts);
    if (!accountMap.has(key)) accountMap.set(key, { key, label: accountLabelFor(t, chars, accounts), threads: [] });
    accountMap.get(key).threads.push(t);
  });
  const accountGroups = Array.from(accountMap.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((g) => ({ ...g, threads: g.threads.slice().sort((a, b) => (a.title || '').localeCompare(b.title || '')) }));

  const [accKey, setAccKey] = useState(lsGet('ccm.mjThreadAcc'));
  const selAccGroup = accountGroups.find((g) => g.key === accKey) || accountGroups[0] || null;

  const [selId, setSelId] = useState(lsGet('ccm.mjThread'));
  const sel = selAccGroup
    ? (selAccGroup.threads.find((t) => t.id === selId) || selAccGroup.threads[0])
    : null;

  function selectAcc(key) { setAccKey(key); lsSet('ccm.mjThreadAcc', key); setSelId(null); lsSet('ccm.mjThread', ''); }
  function select(id) { setSelId(id); lsSet('ccm.mjThread', id); }

  return (
    <section className="chapter">
      <div className="chapter__head"><h2>Backstage (MJ)<span className="count"> ({threads.length})</span></h2></div>
      {!threads.length ? (
        <p className="empty">Aucun thread créé par les joueurs pour l’instant.</p>
      ) : (
        <>
          <nav className="pj__nav pj__nav--row">
            {accountGroups.map((g) => {
              const counts = { closed: 0, mj: 0, player: 0 };
              g.threads.forEach((t) => { counts[threadCategory(t)] += 1; });
              return (
                <button
                  key={g.key} type="button"
                  className={'pj__navbtn' + (selAccGroup && selAccGroup.key === g.key ? ' is-active' : '')}
                  onClick={() => selectAcc(g.key)}
                >
                  {g.label}
                  <StatusPills closed={counts.closed} mj={counts.mj} player={counts.player} />
                </button>
              );
            })}
          </nav>

          {selAccGroup && (
            <div className="pj__backstage">
              <div className="pj__threadrail">
                {selAccGroup.threads.map((t) => (
                  <button
                    key={t.id} type="button"
                    className={'journal__item' + (sel && sel.id === t.id ? ' is-active' : '')}
                    onClick={() => select(t.id)}
                  >
                    <span className="journal__title">{t.title || 'Sans titre'}</span>
                    <span className="chr__muted">{(t.participantIds || []).map(nameOf).join(', ')}</span>
                  </button>
                ))}
              </div>
              {sel ? (
                <ThreadMessages key={sel.id} thread={sel} mutate={mutate} authorId={MJ_AUTHOR_ID} authorName="MJ" />
              ) : (
                <p className="empty">Sélectionne un thread.</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
