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
 * implicitement participant de chaque thread créé côté joueur, omniscient
 * (pas de fenêtre d'accès), et peut archiver/supprimer un thread. Pastilles :
 * clôturé (vert), dernière réponse MJ (orange), dernière réponse joueur (rouge). */
export default function BackstageMJ({ state, mutate }) {
  const allThreads = state.threads || [];
  const chars = state.characters || [];
  const accounts = (state.settings && state.settings.accounts) || [];
  const nameOf = (id) => (chars.find((c) => c.id === id) || {}).name || 'Sans nom';
  const mjChars = chars.filter((c) => accounts.some((a) => a.role === 'admin' && a.userId === c.ownerId));
  const posterOptions = mjChars.map((c) => ({ id: c.id, name: c.name || 'MJ', url: c.artUrl || '' }));

  const [showArchived, setShowArchived] = useState(false);
  const threads = showArchived ? allThreads : allThreads.filter((t) => !t.archived);
  const archivedCount = allThreads.filter((t) => t.archived).length;

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

  // Onglets par personnage, au sein du compte sélectionné : « Tous » + un
  // onglet par personnage ayant créé ou rejoint au moins un thread ici.
  const accChars = selAccGroup ? chars.filter((c) => c.ownerId === selAccGroup.key) : [];
  const charThreadsOf = (charId) => selAccGroup
    ? selAccGroup.threads.filter((t) => t.createdBy === charId || (t.participantIds || []).includes(charId))
    : [];
  const charTabs = accChars.filter((c) => charThreadsOf(c.id).length > 0);

  const [charKey, setCharKey] = useState(lsGet('ccm.mjThreadChar'));
  const activeCharKey = charTabs.some((c) => c.id === charKey) ? charKey : 'all';
  const visibleThreads = selAccGroup
    ? (activeCharKey === 'all' ? selAccGroup.threads : charThreadsOf(activeCharKey))
    : [];

  const [selId, setSelId] = useState(lsGet('ccm.mjThread'));
  const sel = visibleThreads.find((t) => t.id === selId) || visibleThreads[0] || null;

  function selectAcc(key) {
    setAccKey(key); lsSet('ccm.mjThreadAcc', key);
    setCharKey('all'); lsSet('ccm.mjThreadChar', 'all');
    setSelId(null); lsSet('ccm.mjThread', '');
  }
  function selectChar(key) { setCharKey(key); lsSet('ccm.mjThreadChar', key); setSelId(null); lsSet('ccm.mjThread', ''); }
  function select(id) { setSelId(id); lsSet('ccm.mjThread', id); }

  function toggleArchive(id) {
    mutate((s) => { const t = (s.threads || []).find((x) => x.id === id); if (t) t.archived = !t.archived; });
  }
  function deleteThread(id) {
    if (!window.confirm('Supprimer ce thread et tous ses messages ? Cette action est définitive.')) return;
    mutate((s) => { s.threads = (s.threads || []).filter((x) => x.id !== id); });
    if (selId === id) select(null);
  }

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Backstage (MJ)<span className="count"> ({threads.length})</span></h2>
        {archivedCount > 0 && (
          <button className="tbtn" type="button" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'masquer les archivés' : `voir les archivés (${archivedCount})`}
          </button>
        )}
      </div>
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

          {selAccGroup && charTabs.length > 0 && (
            <nav className="pj__nav pj__nav--row pj__nav--sub">
              <button
                type="button" className={'pj__navbtn' + (activeCharKey === 'all' ? ' is-active' : '')}
                onClick={() => selectChar('all')}
              >
                Tous
              </button>
              {charTabs.map((c) => (
                <button
                  key={c.id} type="button" className={'pj__navbtn' + (activeCharKey === c.id ? ' is-active' : '')}
                  onClick={() => selectChar(c.id)}
                >
                  {c.name || 'Sans nom'}
                </button>
              ))}
            </nav>
          )}

          {selAccGroup && (
            <div className="pj__backstage">
              <div className="pj__threadrail">
                {visibleThreads.map((t) => (
                  <div key={t.id} className="pj__threadrailrow">
                    <button
                      type="button"
                      className={'journal__item' + (sel && sel.id === t.id ? ' is-active' : '')}
                      onClick={() => select(t.id)}
                    >
                      <span className="journal__title">{t.title || 'Sans titre'}</span>
                      <span className="chr__muted">{(t.participantIds || []).map(nameOf).join(', ')}</span>
                      {t.archived && <span className="chr__muted"> (archivé)</span>}
                    </button>
                    <div className="pj__threadrailactions">
                      <button type="button" className="tbtn" onClick={() => toggleArchive(t.id)}>
                        {t.archived ? 'désarchiver' : 'archiver'}
                      </button>
                      <button type="button" className="tbtn chr__x" aria-label="supprimer le thread" onClick={() => deleteThread(t.id)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
              {sel ? (
                <ThreadMessages
                  key={sel.id} thread={sel} mutate={mutate} authorId={MJ_AUTHOR_ID} authorName="MJ"
                  chars={chars} posterOptions={posterOptions} allowCustomAvatar avatarStorageKey="ccm.mjThread.avatar"
                  canManageParticipants canExclude
                />
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
