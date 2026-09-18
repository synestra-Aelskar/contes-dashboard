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

const ROLES = [['mj', 'MJ'], ['player', 'Joueur']];

/** Mot de passe temporaire, jamais utilisé : le compte n'est utilisable
 * qu'après avoir suivi le lien magique pour en choisir un vrai. */
function throwawayPassword() {
  return uid() + uid();
}

function AccountRow({ row, mutate }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function resend() {
    setBusy(true);
    setMsg('');
    const { error } = await supabase.auth.resetPasswordForEmail(row.email, {
      redirectTo: window.location.origin
    });
    setBusy(false);
    setMsg(error ? (error.message || 'Échec de l’envoi.') : 'Lien envoyé.');
  }

  return (
    <div className="paramline paramline--account">
      <div className="account__id">
        <span className="account__email">{row.email}</span>
        <span className="account__meta">
          {(ROLES.find((r) => r[0] === row.role) || [, row.role])[1]}
          {row.label ? ' · ' + row.label : ''}
          {row.createdAt ? ' · créé le ' + fmtDateLong(row.createdAt) : ''}
        </span>
        {msg && <span className="account__msg">{msg}</span>}
      </div>
      <button className="tbtn" type="button" disabled={busy} onClick={resend}>
        {busy ? '…' : 'renvoyer un lien'}
      </button>
      <button
        className="tbtn" type="button" aria-label="retirer du répertoire"
        onClick={() => {
          if (!window.confirm('Retirer « ' + row.email + ' » du répertoire ? (Le compte Supabase lui-même n’est pas supprimé.)')) return;
          mutate((s) => { s.settings.accounts = s.settings.accounts.filter((x) => x.id !== row.id); });
        }}
      >
        ×
      </button>
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

    if (existing) {
      addToRoster(clean, null);
      setMsg(clean + ' ajouté au répertoire (compte déjà existant, rien envoyé — le lien avec ses personnages ne pourra pas se faire automatiquement).');
      return;
    }

    setBusy(true);
    setMsg('');
    const { data: suData, error: suErr } = await supabase.auth.signUp({
      email: clean,
      password: throwawayPassword(),
      options: { data: { role } }
    });
    if (suErr) {
      setBusy(false);
      setMsg(suErr.message || 'Échec de la création.');
      return;
    }
    const { error: rpErr } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: window.location.origin
    });
    setBusy(false);
    if (rpErr) { setMsg(rpErr.message || 'Compte créé, mais l’envoi du lien a échoué.'); return; }
    addToRoster(clean, suData?.user?.id);
    setMsg('Compte créé, lien magique envoyé à ' + clean + '.');
  }

  return (
    <div className="zone-pane">
      <div className="zone-pane__head">
        <span className="card__label">Comptes</span>
      </div>
      <h3 className="ssn-h">Créer un compte</h3>
      <p className="dd-hint">
        Crée le compte Supabase et lui envoie un lien magique pour qu’il/elle choisisse
        son propre mot de passe (rien n’est communiqué manuellement).
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
          compte déjà créé (juste le référencer, sans rien envoyer)
        </label>
        <button className="tbtn" type="submit" disabled={busy}>
          {busy ? '…' : (existing ? '＋ ajouter au répertoire' : '＋ créer + envoyer le lien')}
        </button>
      </form>
      {msg && <p className="dd-hint account__status">{msg}</p>}

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
        ajoute-les ici manuellement si besoin.
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
