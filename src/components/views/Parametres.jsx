import { useState } from 'react';
import { uid, fmtDateLong } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { supabase } from '../../supabase';

const TABS = [['temps', 'Temps'], ['comptes', 'Comptes']];

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

const ROLES = [['admin', 'Admin'], ['player', 'Joueur']];

/** Appelle l'Edge Function generate-account-link (voir supabase/functions/) :
 * seule façon sûre d'obtenir le texte du lien magique côté client, sans
 * jamais exposer la clé service_role dans le navigateur. */
async function generateAccountLink(action, email, role) {
  const { data, error } = await supabase.functions.invoke('generate-account-link', {
    body: { action, email, role }
  });
  if (error) {
    const detail = error.context && typeof error.context.json === 'function'
      ? await error.context.json().catch(() => null)
      : null;
    throw new Error((detail && detail.error) || error.message || 'Échec de la génération du lien.');
  }
  return data; // { link, userId }
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

function AccountRow({ row, mutate }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState('');
  const isAdmin = row.role === 'admin';

  async function resend() {
    setBusy(true);
    setMsg('');
    setLink('');
    try {
      const { link: newLink } = await generateAccountLink('recovery', row.email);
      setLink(newLink || '');
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  return (
    <div className={'paramline--account' + (isAdmin ? ' paramline--account-admin' : '')}>
      <div className="paramline paramline--account-row">
        <div className="account__id">
          <span className="account__email">{row.email}</span>
          <span className="account__meta">
            {(ROLES.find((r) => r[0] === row.role) || [, row.role])[1]}
            {row.label ? ' · ' + row.label : ''}
            {row.createdAt ? ' · créé le ' + fmtDateLong(row.createdAt) : ''}
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
          <button
            className="tbtn" type="button" aria-label="retirer du répertoire"
            onClick={() => {
              if (!window.confirm('Retirer « ' + row.email + ' » du répertoire ? (Le compte Supabase lui-même n’est pas supprimé.)')) return;
              mutate((s) => { s.settings.accounts = s.settings.accounts.filter((x) => x.id !== row.id); });
            }}
          >
            ×
          </button>
        )}
      </div>
      {link && <CopyLink link={link} />}
    </div>
  );
}

function ComptesPane({ state, mutate }) {
  const accounts = (state.settings && state.settings.accounts) || [];
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('player');
  const [label, setLabel] = useState('');
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState('');

  function addToRoster(cleanEmail, userId) {
    mutate((s) => {
      s.settings.accounts = s.settings.accounts || [];
      s.settings.accounts.push({
        id: uid(), email: cleanEmail, role, label: label.trim(), userId: userId || null,
        createdAt: new Date().toISOString().slice(0, 10)
      });
    });
    setEmail(''); setLabel('');
  }

  async function createAccount(e) {
    e.preventDefault();
    const clean = email.trim();
    if (!clean) return;
    setLink('');

    if (existing) {
      addToRoster(clean, null);
      setMsg(clean + ' ajouté au répertoire (compte déjà existant — pas de lien généré ici, ni de rattachement automatique de ses personnages).');
      return;
    }

    setBusy(true);
    setMsg('');
    try {
      const { link: newLink, userId } = await generateAccountLink('invite', clean, role);
      addToRoster(clean, userId);
      setLink(newLink || '');
      setMsg('Compte créé pour ' + clean + '.');
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
        <input
          className="finput" type="text" placeholder="Nom (repère, optionnel)"
          value={label} onChange={(e) => setLabel(e.target.value)}
        />
        <label className="account__existing">
          <input type="checkbox" checked={existing} onChange={(e) => setExisting(e.target.checked)} />
          compte déjà créé (juste le référencer, sans rien générer)
        </label>
        <button className="tbtn" type="submit" disabled={busy}>
          {busy ? '…' : (existing ? '＋ ajouter au répertoire' : '＋ créer le compte')}
        </button>
      </form>
      {msg && <p className="dd-hint account__status">{msg}</p>}
      {link && <CopyLink link={link} />}

      <h3 className="ssn-h">Répertoire</h3>
      {accounts.length ? (
        <div className="paramlist">
          {accounts.map((a) => <AccountRow key={a.id} row={a} mutate={mutate} />)}
        </div>
      ) : (
        <p className="empty">Aucun compte référencé pour l’instant.</p>
      )}
      <p className="dd-hint">
        Ce répertoire est une liste de repère côté app — il ne reflète pas forcément tous les
        comptes créés directement depuis le tableau de bord Supabase (Authentication → Users) :
        ajoute-les ici manuellement si besoin. Chaque lien généré est sensible (accès complet au
        compte visé) : il n’est jamais enregistré, seulement affiché le temps de la copie.
      </p>
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
        {tab === 'temps' && <TempsPane state={state} mutate={mutate} />}
        {tab === 'comptes' && <ComptesPane state={state} mutate={mutate} />}
      </div>
    </section>
  );
}
