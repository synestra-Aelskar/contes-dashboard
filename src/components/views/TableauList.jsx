import { useState } from 'react';
import { uid } from '../../lib/util.js';
import { PLAYER_EMAIL_DOMAIN } from '../../lib/playerAuth.js';
import TableauCanvas from '../TableauCanvas.jsx';

/**
 * Tableau d'enquête — tableau blanc infini façon Miro, intégré au dashboard.
 * Trois pots de tableaux, chacun sa propre vue de menu (placement libre,
 * visibilité par nœud comme n'importe quelle vue) : « Mes tableaux »
 * (perso, invitables), « Tableaux de groupe » (pot commun) et « Tableaux
 * MJ » (pot réservé aux comptes admin par défaut).
 */

const SCOPES = {
  perso: { title: 'Mes tableaux', createLabel: '＋ Nouveau tableau', emptyHint: 'Aucun tableau perso pour l’instant.' },
  groupe: { title: 'Tableaux de groupe', createLabel: '＋ Nouveau tableau de groupe', emptyHint: 'Aucun tableau de groupe pour l’instant.' },
  mj: { title: 'Tableaux MJ', createLabel: '＋ Nouveau tableau MJ', emptyHint: 'Aucun tableau MJ pour l’instant.' }
};

function accountLabel(account) {
  if (!account) return '';
  if (account.label && account.label.trim()) return account.label.trim();
  const email = account.email || '';
  return email.endsWith(PLAYER_EMAIL_DOMAIN) ? email.slice(0, -PLAYER_EMAIL_DOMAIN.length) : email.split('@')[0];
}

function groupCharacters(state, excludeId) {
  const accounts = (state.settings && state.settings.accounts) || [];
  const byOwner = new Map();
  accounts.forEach((a) => { if (a.userId) byOwner.set(a.userId, accountLabel(a) || 'Compte'); });
  const groups = new Map();
  (state.characters || []).forEach((c) => {
    if (c.id === excludeId) return;
    const key = c.ownerId && byOwner.has(c.ownerId) ? c.ownerId : '__none__';
    const label = key === '__none__' ? 'Sans joueur' : byOwner.get(key);
    if (!groups.has(key)) groups.set(key, { key, label, chars: [] });
    groups.get(key).chars.push(c);
  });
  const out = Array.from(groups.values());
  out.forEach((g) => g.chars.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')));
  out.sort((a, b) => (a.key === '__none__' ? 1 : b.key === '__none__' ? -1 : a.label.localeCompare(b.label, 'fr')));
  return out;
}

function InviteModal({ state, tableau, mutate, mineId, onClose }) {
  const groups = groupCharacters(state, mineId);
  const invited = new Set(tableau.participantIds || []);
  const toggle = (id) => mutate((s) => {
    const t = s.tableaux.find((x) => x.id === tableau.id);
    if (!t) return;
    t.participantIds = t.participantIds || [];
    t.participantIds = t.participantIds.includes(id) ? t.participantIds.filter((x) => x !== id) : [...t.participantIds, id];
  });
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card secret-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Inviter à « {tableau.titre.trim() || 'Sans titre'} »</h3>
        <p className="modal__note">Coche les personnages qui auront accès à ce tableau.</p>
        {!groups.length ? (
          <p className="empty">Aucun autre personnage pour l’instant.</p>
        ) : groups.map((g) => (
          <div key={g.key} className="secret-modal__group">
            <span className="card__label">{g.label}</span>
            {g.chars.map((c) => (
              <label key={c.id} className="secret-modal__row">
                <input type="checkbox" checked={invited.has(c.id)} onChange={() => toggle(c.id)} />
                <span>{c.name || 'Personnage'}</span>
              </label>
            ))}
          </div>
        ))}
        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onClose}>fermer</button>
        </div>
      </div>
    </div>
  );
}

function BoardRow({ state, tableau, isOwner, canDelete, onOpen, onDelete, onInvite }) {
  const chars = state.characters || [];
  const ownerName = (chars.find((c) => c.id === tableau.ownerId) || {}).name;
  return (
    <div className="fiche-row">
      <button type="button" className="fiche-row__name" onClick={onOpen}>
        {tableau.titre.trim() || 'Sans titre'}
        <span className="count"> · {tableau.elements.length} élément{tableau.elements.length > 1 ? 's' : ''}</span>
      </button>
      {tableau.kind !== 'perso' && ownerName && <span className="chr__muted">par {ownerName}</span>}
      <div className="fiche-row__group">
        {isOwner && (
          <div className="fiche-row__actions">
            <button type="button" onClick={onInvite}>inviter</button>
          </div>
        )}
        {canDelete && (
          <button className="fiche-row__del" type="button" title="Supprimer" aria-label="Supprimer" onClick={onDelete}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default function TableauList({ state, mutate, userId, role, scope }) {
  const chars = state.characters || [];
  const mine = chars.find((c) => c.ownerId === userId);
  const boards = state.tableaux || [];
  const [openId, setOpenId] = useState(null);
  const [inviteId, setInviteId] = useState(null);
  const conf = SCOPES[scope];

  if (!mine) {
    return (
      <section className="chapter">
        <div className="chapter__head"><h2>{conf.title}</h2></div>
        <p className="empty">Il te faut d’abord un personnage pour avoir tes propres tableaux — vois « Mes personnages ».</p>
      </section>
    );
  }

  const list = scope === 'perso'
    ? boards.filter((t) => t.kind === 'perso' && (t.ownerId === mine.id || (t.participantIds || []).includes(mine.id)))
    : boards.filter((t) => t.kind === scope);

  function createBoard() {
    const t = { id: uid(), titre: 'Nouveau tableau', kind: scope, ownerId: mine.id, participantIds: [], elements: [], connections: [] };
    mutate((s) => { s.tableaux.push(t); });
    setOpenId(t.id);
  }

  function deleteBoard(id) {
    if (!window.confirm('Supprimer ce tableau et tout son contenu ?')) return;
    mutate((s) => { s.tableaux = s.tableaux.filter((t) => t.id !== id); });
  }

  const open = boards.find((t) => t.id === openId);
  if (open) {
    return <TableauCanvas tableau={open} mutate={mutate} onBack={() => setOpenId(null)} charId={mine.id} charName={mine.name || 'Personnage'} />;
  }

  const inviteTarget = boards.find((t) => t.id === inviteId);

  return (
    <section className="chapter">
      <div className="chapter__head"><h2>{conf.title}<span className="count"> ({list.length})</span></h2></div>

      {!list.length ? (
        <p className="empty">{conf.emptyHint}</p>
      ) : (
        <div className="fiche-list">
          {list.map((t) => (
            <BoardRow
              key={t.id} state={state} tableau={t} isOwner={t.ownerId === mine.id}
              canDelete={role === 'admin' || t.ownerId === mine.id}
              onOpen={() => setOpenId(t.id)} onDelete={() => deleteBoard(t.id)} onInvite={() => setInviteId(t.id)}
            />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
        <button className="btn-primary" type="button" onClick={createBoard}>{conf.createLabel}</button>
      </div>

      {inviteTarget && (
        <InviteModal state={state} tableau={inviteTarget} mutate={mutate} mineId={mine.id} onClose={() => setInviteId(null)} />
      )}
    </section>
  );
}
