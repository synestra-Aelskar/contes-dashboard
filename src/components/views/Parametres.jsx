import { useEffect, useState } from 'react';
import { uid, fmtDateLong } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { supabase } from '../../supabase';
import {
  ROLES, VIEW_LABEL, listContainers, moveViewToContainer, addCategory, addSubcategory,
  renameNode, setNodeVisibility, removeNode, moveSibling
} from '../../lib/menu.js';

const TABS = [['ordremenu', 'Ordre menu'], ['temps', 'Temps'], ['comptes', 'Comptes']];

function TimeTypeRow({ row, mutate }) {
  const [name, setName, nameRef] = useSyncedField(row.name);
  const patch = (fn) =>
    mutate((s) => { const t = s.settings.timeTypes.find((x) => x.id === row.id); if (t) fn(t); });
  return (
    <div className="paramline">
      <input
        className="paramline__color" type="color" value={row.color || '#9a7330'}
        onChange={(e) => patch((t) => { t.color = e.target.value; })}
        aria-label="Couleur du type"
      />
      <input
        ref={nameRef} className="finput" type="text" placeholder="Nom du type (ex. Voyage, Repos, Enquête…)"
        value={name}
        onChange={(e) => { const v = e.target.value; setName(v); patch((t) => { t.name = v; }); }}
        onBlur={() => patch((t) => { t.name = name.trim(); })}
      />
      <button
        className="tbtn" type="button" aria-label="retirer ce type"
        onClick={() => mutate((s) => { s.settings.timeTypes = s.settings.timeTypes.filter((x) => x.id !== row.id); })}
      >
        ×
      </button>
    </div>
  );
}

function TempsPane({ state, mutate }) {
  const types = (state.settings && state.settings.timeTypes) || [];
  return (
    <div className="zone-pane">
      <div className="zone-pane__head">
        <span className="card__label">Temps</span>
      </div>
      <h3 className="ssn-h">Types d’évènement temporel</h3>
      <p className="dd-hint">
        Utilisés pour colorer les blocs de la barre de temps d’une séance (nom + couleur libre).
      </p>
      <div className="paramlist">
        {types.map((t) => <TimeTypeRow key={t.id} row={t} mutate={mutate} />)}
      </div>
      <button
        className="tbtn" type="button"
        onClick={() => mutate((s) => {
          s.settings = s.settings || { timeTypes: [] };
          s.settings.timeTypes = s.settings.timeTypes || [];
          s.settings.timeTypes.push({ id: uid(), name: '', color: '#9a7330' });
        })}
      >
        ＋ ajouter un type
      </button>
    </div>
  );
}

/** Appelle l'Edge Function generate-account-link (voir supabase/functions/) —
 * seul point d'accès à l'API admin Supabase (invite/recovery/list/delete),
 * la clé service_role restant entièrement côté fonction. */
async function callAccountsFn(body) {
  const { data, error } = await supabase.functions.invoke('generate-account-link', { body });
  if (error) {
    const detail = error.context && typeof error.context.json === 'function'
      ? await error.context.json().catch(() => null)
      : null;
    throw new Error((detail && detail.error) || error.message || 'Échec de la requête.');
  }
  return data;
}

/** Lien à copier-coller — jamais persisté dans l'état partagé (il donne un
 * accès complet au compte visé), juste tenu en mémoire le temps de la copie. */
function CopyLink({ link }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="account__link">
      <input className="finput field--mono" type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
      <button
        className="tbtn" type="button"
        onClick={async () => {
          try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
          catch (_) { /* copie manuelle via le champ ci-dessus si l'API presse-papier est refusée */ }
        }}
      >
        {copied ? 'copié !' : 'copier'}
      </button>
    </div>
  );
}

function AccountRow({ user, mutate, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState('');
  const isAdmin = user.role === 'admin';

  async function resend() {
    setBusy(true);
    setMsg('');
    setLink('');
    try {
      const { link: newLink } = await callAccountsFn({ action: 'recovery', email: user.email });
      setLink(newLink || '');
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm('Supprimer définitivement le compte « ' + user.email + ' » ? Cette action est irréversible.')) return;
    setBusy(true);
    setMsg('');
    try {
      await callAccountsFn({ action: 'delete', userId: user.id });
      mutate((s) => { s.settings.accounts = (s.settings.accounts || []).filter((a) => a.userId !== user.id); });
      onChanged();
    } catch (e) {
      setMsg(e.message);
      setBusy(false);
    }
  }

  return (
    <div className={'paramline--account' + (isAdmin ? ' paramline--account-admin' : '')}>
      <div className="paramline paramline--account-row">
        <div className="account__id">
          <span className="account__email">{user.email}</span>
          <span className="account__meta">
            {(ROLES.find((r) => r[0] === user.role) || [, user.role])[1]}
            {user.createdAt ? ' · créé le ' + fmtDateLong(user.createdAt.slice(0, 10)) : ''}
            {isAdmin && ' · rôle protégé'}
          </span>
          {msg && <span className="account__msg">{msg}</span>}
        </div>
        <button className="tbtn" type="button" disabled={busy} onClick={resend}>
          {busy ? '…' : 'générer un lien'}
        </button>
        {isAdmin ? (
          <span className="account__locked" title="Compte admin : ni rôle ni compte modifiable depuis ce répertoire">🔒</span>
        ) : (
          <button className="tbtn" type="button" aria-label="supprimer le compte" disabled={busy} onClick={remove}>
            ×
          </button>
        )}
      </div>
      {link && <CopyLink link={link} />}
    </div>
  );
}

function ComptesPane({ state, mutate }) {
  const [users, setUsers] = useState(null); // null = chargement
  const [loadErr, setLoadErr] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('player');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState('');

  async function refresh() {
    setLoadErr('');
    try {
      const { users: list } = await callAccountsFn({ action: 'list' });
      setUsers(list || []);
      // Synchronise le répertoire local (utilisé par le sommaire par compte
      // de la vue Personnages) avec la liste réelle — plus besoin de les
      // ajouter à la main : userId/role viennent toujours de Supabase.
      mutate((s) => {
        s.settings.accounts = s.settings.accounts || [];
        (list || []).forEach((u) => {
          const existing = s.settings.accounts.find((a) => a.userId === u.id || a.email === u.email);
          if (existing) {
            existing.userId = u.id; existing.email = u.email; existing.role = u.role;
            if (!existing.createdAt) existing.createdAt = u.createdAt.slice(0, 10);
          } else {
            s.settings.accounts.push({ id: uid(), email: u.email, role: u.role, label: '', userId: u.id, createdAt: u.createdAt.slice(0, 10) });
          }
        });
      });
    } catch (e) {
      setLoadErr(e.message);
      setUsers([]);
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createAccount(e) {
    e.preventDefault();
    const clean = email.trim();
    if (!clean) return;
    setLink('');
    setBusy(true);
    setMsg('');
    try {
      const { link: newLink } = await callAccountsFn({ action: 'invite', email: clean, role });
      setLink(newLink || '');
      setMsg('Compte créé pour ' + clean + '.');
      setEmail('');
      await refresh();
    } catch (e2) {
      setMsg(e2.message);
    }
    setBusy(false);
  }

  return (
    <div className="zone-pane">
      <div className="zone-pane__head">
        <span className="card__label">Comptes</span>
      </div>
      <h3 className="ssn-h">Créer un compte</h3>
      <p className="dd-hint">
        Crée le compte Supabase et génère un lien magique à copier-coller (ou à transmettre par
        n’importe quel canal) pour qu’il/elle choisisse son propre mot de passe.
      </p>
      <form className="account__form" onSubmit={createAccount}>
        <input
          className="finput" type="email" placeholder="email@exemple.com" required
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <select className="field account__role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="tbtn" type="submit" disabled={busy}>
          {busy ? '…' : '＋ créer le compte'}
        </button>
      </form>
      {msg && <p className="dd-hint account__status">{msg}</p>}
      {link && <CopyLink link={link} />}

      <h3 className="ssn-h">Comptes existants</h3>
      {users === null ? (
        <p className="empty">Chargement…</p>
      ) : loadErr ? (
        <p className="dd-hint account__status">{loadErr}</p>
      ) : users.length ? (
        <div className="paramlist">
          {users.map((u) => <AccountRow key={u.id} user={u} mutate={mutate} onChanged={refresh} />)}
        </div>
      ) : (
        <p className="empty">Aucun compte pour l’instant.</p>
      )}
      <p className="dd-hint">
        Liste tirée en direct de Supabase (Authentication) — toujours à jour, rien à ajouter à la
        main. Chaque lien généré est sensible (accès complet au compte visé) : il n’est jamais
        enregistré, seulement affiché le temps de la copie.
      </p>
    </div>
  );
}

function VisibilityEditor({ node, onSet }) {
  const custom = !!node.visibility;
  return (
    <div className="menuedit__vis">
      <select
        className="field menuedit__vissel"
        value={custom ? 'custom' : 'inherit'}
        onChange={(e) => onSet(e.target.value === 'custom' ? ['admin'] : null)}
      >
        <option value="inherit">Hérite</option>
        <option value="custom">Personnalisé</option>
      </select>
      {custom && ROLES.map(([v, l]) => (
        <label key={v} className="menuedit__vischk">
          <input
            type="checkbox"
            checked={node.visibility.includes(v)}
            onChange={(e) => {
              const next = e.target.checked
                ? [...node.visibility, v]
                : node.visibility.filter((r) => r !== v);
              onSet(next);
            }}
          />
          {l}
        </label>
      ))}
    </div>
  );
}

function ViewNodeRow({ node, mutate, containers, depth, currentContainer, isFirst, isLast }) {
  const label = VIEW_LABEL[node.viewKey] || node.viewKey;
  return (
    <div className="menuedit__row" style={{ marginLeft: depth * 18 }}>
      <div className="menuedit__reorder">
        <button className="tbtn" type="button" disabled={isFirst} onClick={() => mutate((s) => { s.settings.menu = moveSibling(s.settings.menu, node.id, -1); })}>▲</button>
        <button className="tbtn" type="button" disabled={isLast} onClick={() => mutate((s) => { s.settings.menu = moveSibling(s.settings.menu, node.id, 1); })}>▼</button>
      </div>
      <span className="menuedit__name">{label}</span>
      <select
        className="field menuedit__container"
        value={currentContainer || ''}
        onChange={(e) => mutate((s) => { s.settings.menu = moveViewToContainer(s.settings.menu, node.id, e.target.value || null); })}
      >
        <option value="">— racine —</option>
        {containers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <VisibilityEditor node={node} onSet={(roles) => mutate((s) => { s.settings.menu = setNodeVisibility(s.settings.menu, node.id, roles); })} />
    </div>
  );
}

function GroupNodeRow({ node, mutate, depth, isFirst, isLast }) {
  const [name, setName, nameRef] = useSyncedField(node.name);
  const patchName = (v) => mutate((s) => { s.settings.menu = renameNode(s.settings.menu, node.id, v); });
  return (
    <div className={'menuedit__row menuedit__row--' + node.type} style={{ marginLeft: depth * 18 }}>
      <div className="menuedit__reorder">
        <button className="tbtn" type="button" disabled={isFirst} onClick={() => mutate((s) => { s.settings.menu = moveSibling(s.settings.menu, node.id, -1); })}>▲</button>
        <button className="tbtn" type="button" disabled={isLast} onClick={() => mutate((s) => { s.settings.menu = moveSibling(s.settings.menu, node.id, 1); })}>▼</button>
      </div>
      <input
        ref={nameRef} className="finput menuedit__nameinput" type="text"
        placeholder={node.type === 'category' ? 'Nom de la catégorie' : 'Nom de la sous-catégorie'}
        value={name}
        onChange={(e) => { const v = e.target.value; setName(v); patchName(v); }}
        onBlur={() => patchName(name.trim())}
      />
      <VisibilityEditor node={node} onSet={(roles) => mutate((s) => { s.settings.menu = setNodeVisibility(s.settings.menu, node.id, roles); })} />
      {node.type === 'category' && (
        <button
          className="tbtn" type="button"
          onClick={() => mutate((s) => { s.settings.menu = addSubcategory(s.settings.menu, node.id, 'Nouvelle sous-catégorie'); })}
        >
          ＋ sous-catégorie
        </button>
      )}
      <button
        className="tbtn" type="button" aria-label="supprimer"
        onClick={() => {
          if (!window.confirm('Supprimer « ' + (node.name || '') + ' » ? Son contenu remonte au niveau au-dessus.')) return;
          mutate((s) => { s.settings.menu = removeNode(s.settings.menu, node.id); });
        }}
      >
        ×
      </button>
    </div>
  );
}

function OrdreMenuPane({ state, mutate }) {
  const tree = state.settings.menu || [];
  const containers = listContainers(tree);

  function renderNodes(nodes, depth, containerId) {
    return nodes.map((n, i) => {
      const isFirst = i === 0, isLast = i === nodes.length - 1;
      if (n.type === 'view') {
        return (
          <ViewNodeRow
            key={n.id} node={n} mutate={mutate} containers={containers} depth={depth}
            currentContainer={containerId} isFirst={isFirst} isLast={isLast}
          />
        );
      }
      return (
        <div key={n.id}>
          <GroupNodeRow node={n} mutate={mutate} depth={depth} isFirst={isFirst} isLast={isLast} />
          {n.children && n.children.length > 0 && renderNodes(n.children, depth + 1, n.id)}
        </div>
      );
    });
  }

  return (
    <div className="zone-pane">
      <div className="zone-pane__head">
        <span className="card__label">Ordre menu</span>
      </div>
      <h3 className="ssn-h">Organisation du menu</h3>
      <p className="dd-hint">
        Réordonne (▲▼), regroupe en catégories/sous-catégories (« ranger dans »), et choisis qui
        voit quoi. Une visibilité définie sur une catégorie prend le pas sur ses sous-catégories et
        leurs vues ; une visibilité de sous-catégorie prend le pas sur ses vues.
      </p>
      <div className="menuedit">
        {renderNodes(tree, 0, null)}
      </div>
      <button
        className="tbtn" type="button"
        onClick={() => mutate((s) => { s.settings.menu = addCategory(s.settings.menu, 'Nouvelle catégorie'); })}
      >
        ＋ nouvelle catégorie
      </button>
    </div>
  );
}

export default function Parametres({ state, mutate }) {
  const [tab, setTab] = useState(TABS[0][0]);
  return (
    <section className="chapter">
      <div className="chapter__head"><h2>Paramètres</h2></div>
      <div className="zones">
        <div className="zone-tree">
          {TABS.map(([key, label]) => (
            <div key={key} className="zone-node">
              <div className={'zone-node__row' + (tab === key ? ' is-sel' : '')}>
                <span className="zone-node__chev" style={{ visibility: 'hidden' }} />
                <button className="zone-node__label" type="button" onClick={() => setTab(key)}>
                  {label}
                </button>
              </div>
            </div>
          ))}
        </div>
        {tab === 'ordremenu' && <OrdreMenuPane state={state} mutate={mutate} />}
        {tab === 'temps' && <TempsPane state={state} mutate={mutate} />}
        {tab === 'comptes' && <ComptesPane state={state} mutate={mutate} />}
      </div>
    </section>
  );
}
