import { useState } from 'react';
import { supabase } from '../supabase';
import { useBoard } from '../lib/board.js';
import { fmtDateLong, lsGet, lsSet } from '../lib/util.js';
import WorldDate from './WorldDate.jsx';
import ViewBar from './ViewBar.jsx';
import Notes from './Notes.jsx';
import Liens from './views/Liens.jsx';
import Journal from './views/Journal.jsx';
import Consequences from './views/Consequences.jsx';
import Horloges from './views/Horloges.jsx';
import Secrets from './views/Secrets.jsx';
import Oublis from './views/Oublis.jsx';
import Epreuves from './views/Epreuves.jsx';

const STATUS_TEXT = {
  loading: 'Chargement…',
  ready: 'Synchronisé',
  saving: 'Enregistrement…',
  offline: 'Hors ligne — reconnexion…'
};
const STATUS_ON = { ready: '1', saving: 'saving', loading: 'saving', offline: '0' };

const VIEW_COMPONENTS = {
  liens: Liens,
  journal: Journal,
  consequences: Consequences,
  horloges: Horloges,
  secrets: Secrets,
  oublis: Oublis,
  epreuves: Epreuves
};

export default function Dashboard({ session }) {
  const { state, status, mutate } = useBoard(session);
  const [view, setViewRaw] = useState(lsGet('ccm.view') || 'liens');
  const setView = (v) => { setViewRaw(v); lsSet('ccm.view', v); };

  if (!state) {
    return <div className="auth__boot">Chargement du repaire…</div>;
  }

  const ViewComp = VIEW_COMPONENTS[view] || Liens;

  return (
    <main className="page">
      <header className="head">
        <div className="headrow">
          <div className="headrow__left">
            <p className="eyebrow">Tableau de bord · Animation JdR</p>
            <h1>Les Contes Malveillants</h1>
            <p className="lede">
              Repaire commun du binôme : liens &amp; outils, journal, conséquences, horloges,
              secrets — la mémoire vivante de la partie.
            </p>
          </div>
          <div className="topright">
            <WorldDate state={state} mutate={mutate} />
            <span className="status" data-on={STATUS_ON[status] || '0'}>
              <i />
              <span>{STATUS_TEXT[status] || status}</span>
              <span className="status__user"> · {(session.user.email || '').split('@')[0]}</span>
              <button
                className="status__logout" type="button"
                onClick={() => supabase.auth.signOut()}
              >
                Quitter
              </button>
            </span>
          </div>
        </div>
        <div className="divider"><i /></div>
      </header>

      <div className="margins">
        <Notes state={state} mutate={mutate} />
      </div>

      <ViewBar view={view} setView={setView} />

      <div className={'view view--' + view}>
        <ViewComp state={state} mutate={mutate} />
      </div>

      <footer className="foot">
        Dernière mise à jour · {state.updated ? fmtDateLong(state.updated) : '—'} — enregistrée à chaque modification.
      </footer>
    </main>
  );
}
