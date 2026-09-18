import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useBoard } from '../lib/board.js';
import { fmtDateLong } from '../lib/util.js';
import { getUiScale, applyUiScale } from '../lib/prefs.js';
import Preferences from './Preferences.jsx';
import PersonnageJoueur from './views/PersonnageJoueur.jsx';

const STATUS_TEXT = {
  loading: 'Chargement…',
  ready: 'Synchronisé',
  saving: 'Enregistrement…',
  offline: 'Hors ligne — reconnexion…'
};
const STATUS_ON = { ready: '1', saving: 'saving', loading: 'saving', offline: '0' };

export default function PlayerDashboard({ session }) {
  const { state, status, mutate } = useBoard(session);
  const [prefsOpen, setPrefsOpen] = useState(false);

  useEffect(() => { applyUiScale(getUiScale()); }, []);

  if (!state) {
    return <div className="auth__boot">Chargement du repaire…</div>;
  }

  return (
    <main className="page">
      <header className="head">
        <div className="headrow">
          <div className="headrow__left">
            <p className="eyebrow">Tableau de bord · Animation JdR</p>
            <h1>Les Contes Malveillants</h1>
            <p className="lede">Fiche de personnage — {(session.user.email || '').split('@')[0]}</p>
          </div>
          <div className="topright">
            <span className="status" data-on={STATUS_ON[status] || '0'}>
              <i />
              <span>{STATUS_TEXT[status] || status}</span>
              <button className="status__logout" type="button" onClick={() => setPrefsOpen(true)}>
                Préférences
              </button>
              <button className="status__logout" type="button" onClick={() => supabase.auth.signOut()}>
                Quitter
              </button>
            </span>
          </div>
        </div>
        <div className="divider"><i /></div>
      </header>

      <div className="viewbar">
        <button type="button" className="viewbtn" data-v="personnage" aria-current="true">
          Personnage
        </button>
      </div>

      <div className="view view--personnage">
        <PersonnageJoueur state={state} mutate={mutate} userId={session.user.id} />
      </div>

      {prefsOpen && <Preferences onClose={() => setPrefsOpen(false)} />}

      <footer className="foot">
        Dernière mise à jour · {state.updated ? fmtDateLong(state.updated) : '—'} — enregistrée à chaque modification.
      </footer>
    </main>
  );
}
