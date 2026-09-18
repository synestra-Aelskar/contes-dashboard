import { useEffect, useState } from 'react';
import { supabase, configured } from './supabase';
import Login from './components/Login.jsx';
import SetPassword from './components/SetPassword.jsx';
import Dashboard from './components/Dashboard.jsx';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = inconnu, null = déconnecté
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!configured) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <div className="auth">
        <div className="auth__card">
          <p className="auth__eyebrow">Configuration manquante</p>
          <h1 className="auth__title">Repaire des Contes Malveillants</h1>
          <p className="lede">
            Renseigne <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>
            {' '}dans <code>.env.local</code> (dev) ou dans les variables d’environnement Vercel,
            puis recharge.
          </p>
        </div>
      </div>
    );
  }

  if (recovery) return <SetPassword onDone={() => setRecovery(false)} />;

  if (session === undefined) {
    return <div className="auth__boot">Connexion…</div>;
  }
  if (!session) return <Login />;
  if (session.user.user_metadata?.mustChangePassword) {
    return (
      <SetPassword
        onDone={() => {}}
        title="Première connexion"
        lead="Choisis ton propre mot de passe"
      />
    );
  }
  return <Dashboard session={session} />;
}
