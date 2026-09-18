import { useState } from 'react';
import { supabase } from '../supabase';
import { playerEmailFor } from '../lib/playerAuth.js';

export default function Login() {
  const [mode, setMode] = useState('mj'); // 'mj' | 'joueur'
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const creds = mode === 'joueur'
      ? { email: playerEmailFor(name), password: code }
      : { email: email.trim(), password: pw };
    const { error } = await supabase.auth.signInWithPassword(creds);
    setBusy(false);
    if (error) setErr(error.message || 'Connexion refusée');
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit}>
        <p className="auth__eyebrow">Tableau de bord · Animation JdR</p>
        <h1 className="auth__title">Repaire des Contes Malveillants</h1>

        <div className="auth__modes">
          <button
            type="button" className={'auth__modebtn' + (mode === 'mj' ? ' is-on' : '')}
            onClick={() => { setMode('mj'); setErr(''); }}
          >
            MJ
          </button>
          <button
            type="button" className={'auth__modebtn' + (mode === 'joueur' ? ' is-on' : '')}
            onClick={() => { setMode('joueur'); setErr(''); }}
          >
            Joueur
          </button>
        </div>

        {mode === 'mj' ? (
          <>
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
          </>
        ) : (
          <>
            <label className="flabel">
              Nom
              <input
                className="field" type="text" autoComplete="username" required
                value={name} onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flabel">
              Code
              <input
                className="field" type="password" autoComplete="current-password" required
                value={code} onChange={(e) => setCode(e.target.value)}
              />
            </label>
          </>
        )}

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
