import { useState } from 'react';
import { supabase } from '../supabase';
import { playerEmailFor } from '../lib/playerAuth.js';

export default function Login() {
  const [account, setAccount] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const raw = account.trim();
    // Un email réel (MJ) contient un "@" ; sinon on suppose un Nom de joueur
    // et on reconstruit l'email synthétique correspondant.
    const email = raw.includes('@') ? raw : playerEmailFor(raw);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setErr(error.message || 'Connexion refusée');
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit}>
        <p className="auth__eyebrow">Tableau de bord · Animation JdR</p>
        <h1 className="auth__title">Repaire des Contes Malveillants</h1>
        <label className="flabel">
          Compte
          <input
            className="field" type="text" autoComplete="username" required
            value={account} onChange={(e) => setAccount(e.target.value)}
          />
        </label>
        <label className="flabel">
          Mot de passe
          <input
            className="field" type="password" autoComplete="current-password" required
            value={pw} onChange={(e) => setPw(e.target.value)}
          />
        </label>
        {err && <p className="auth__err">{err}</p>}
        <div className="form__actions">
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? 'Connexion…' : 'Entrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
