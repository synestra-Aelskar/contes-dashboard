import { useState } from 'react';
import { supabase } from '../supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setErr(error.message || 'Connexion refusée');
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit}>
        <p className="auth__eyebrow">Tableau de bord · Animation JdR</p>
        <h1 className="auth__title">Repaire des Contes Malveillants</h1>
        <label className="flabel">
          E-mail
          <input
            className="field" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)}
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
