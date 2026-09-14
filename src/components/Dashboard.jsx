import { useState } from 'react';
import { supabase } from '../supabase';
import { useBoard } from '../lib/board.js';
import { fmtDateLong, lsGet, lsSet } from '../lib/util.js';
import { makeDraft, finishDraft } from '../lib/session.js';
import WorldDate from './WorldDate.jsx';
import ViewBar from './ViewBar.jsx';
import Notes from './Notes.jsx';
import FinishModal from './FinishModal.jsx';
import Liens from './views/Liens.jsx';
import Journal from './views/Journal.jsx';
import Consequences from './views/Consequences.jsx';
import Horloges from './views/Horloges.jsx';
import Secrets from './views/Secrets.jsx';
import Oublis from './views/Oublis.jsx';
import Epreuves from './views/Epreuves.jsx';
import Personnages from './views/Personnages.jsx';
import Zones from './views/Zones.jsx';
import FicheTechnique from './views/FicheTechnique.jsx';
import XpCalibreur from './views/XpCalibreur.jsx';
import Equilibrage from './views/Equilibrage.jsx';
import SessionEnCours from './views/SessionEnCours.jsx';

const STATUS_TEXT = {
  loading: 'Chargement…',
  ready: 'Synchronisé',
  saving: 'Enregistrement…',
  offline: 'Hors ligne — reconnexion…'
};
const STATUS_ON = { ready: '1', saving: 'saving', loading: 'saving', offline: '0' };

export default function Dashboard({ session }) {
  const { state, status, mutate } = useBoard(session);
  const [view, setViewRaw] = useState(lsGet('ccm.view') || 'liens');
  const [finishOpen, setFinishOpen] = useState(false);
  const setView = (v) => { setViewRaw(v); lsSet('ccm.view', v); };

  if (!state) {
    return <div className="auth__boot">Chargement du repaire…</div>;
  }

  const goToSession = (id) => { lsSet('ccm.session', id); setView('journal'); };
  const hasDraft = !!state.sessionDraft;

  function startSession() {
    mutate((s) => { if (!s.sessionDraft) s.sessionDraft = makeDraft(s); });
    setView('session');
  }

  function confirmFinish() {
    const out = {};
    mutate((s) => finishDraft(s, out));
    setFinishOpen(false);
    if (out.sessionId) goToSession(out.sessionId);
  }

  let ViewComp = Liens;
  const shared = { state, mutate, goToSession };
  if (view === 'session') ViewComp = SessionEnCours;
  else if (view === 'journal') ViewComp = Journal;
  else if (view === 'consequences') ViewComp = Consequences;
  else if (view === 'horloges') ViewComp = Horloges;
  else if (view === 'secrets') ViewComp = Secrets;
  else if (view === 'oublis') ViewComp = Oublis;
  else if (view === 'epreuves') ViewComp = Epreuves;
  else if (view === 'personnages') ViewComp = Personnages;
  else if (view === 'zones') ViewComp = Zones;
  else if (view === 'fichetechnique') ViewComp = FicheTechnique;
  else if (view === 'xpcalibreur') ViewComp = XpCalibreur;
  else if (view === 'equilibrage') ViewComp = Equilibrage;

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

      <ViewBar
        view={view}
        setView={setView}
        hasDraft={hasDraft}
        onStart={startSession}
        onFinish={() => { setView('session'); setFinishOpen(true); }}
      />

      <div className={'view view--' + view}>
        {view === 'session'
          ? <SessionEnCours state={state} mutate={mutate} onFinish={() => setFinishOpen(true)} />
          : <ViewComp {...shared} />}
      </div>

      {finishOpen && hasDraft && (
        <FinishModal
          draft={state.sessionDraft}
          onConfirm={confirmFinish}
          onCancel={() => setFinishOpen(false)}
        />
      )}

      <footer className="foot">
        Dernière mise à jour · {state.updated ? fmtDateLong(state.updated) : '—'} — enregistrée à chaque modification.
      </footer>
    </main>
  );
}
