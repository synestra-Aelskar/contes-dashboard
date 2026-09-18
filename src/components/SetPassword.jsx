import { useState } from 'react';
import { supabase } from '../supabase';

/** Écran affiché après avoir cliqué sur un lien magique (création de compte ou
 * réinitialisation) : Supabase ouvre déjà une session « recovery », il ne
 * reste qu'à choisir un mot de passe définitif. */
export default function SetPassword({ onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (pw.length < 8) { setErr('8 caractères minimum.'); return; }
    if (pw !== pw2) { setErr('Les deux mots de passe ne correspondent pas.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(error.message || 'Échec de la mise à jour.'); return; }
    onDone();
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit}>
        <p className="auth__eyebrow">Lien magique</p>
        <h1 className="auth__title">Choisis ton mot de passe</h1>
        <label className="flabel">
          Nouveau mot de passe
          <input
            className="field" type="password" autoComplete="new-password" required minLength={8}
            value={pw} onChange={(e) => setPw(e.target.value)}
          />
        </label>
        <label className="flabel">
          Confirmation
          <input
            className="field" type="password" autoComplete="new-password" required minLength={8}
            value={pw2} onChange={(e) => setPw2(e.target.value)}
          />
        </label>
        {err && <p className="auth__err">{err}</p>}
        <div className="form__actions">
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Valider'}
          </button>
        </div>
      </form>
    </div>
  );
}
