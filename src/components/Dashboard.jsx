import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useBoard } from '../lib/board.js';
import { fmtDateLong, lsGet, lsSet } from '../lib/util.js';
import { makeDraft, finishDraft } from '../lib/session.js';
import { getUiScale, applyUiScale } from '../lib/prefs.js';
import { pruneForRole, firstViewKey, treeHasView } from '../lib/menu.js';
import WorldDate from './WorldDate.jsx';
import Sidebar from './Sidebar.jsx';
import Notes from './Notes.jsx';
import FinishModal from './FinishModal.jsx';
import Preferences from './Preferences.jsx';
import Liens from './views/Liens.jsx';
import Journal from './views/Journal.jsx';
import Consequences from './views/Consequences.jsx';
import Horloges from './views/Horloges.jsx';
import Secrets from './views/Secrets.jsx';
import Oublis from './views/Oublis.jsx';
import Epreuves from './views/Epreuves.jsx';
import Personnages from './views/Personnages.jsx';
import PersonnageJoueur from './views/PersonnageJoueur.jsx';
import Zones from './views/Zones.jsx';
import FicheTechnique from './views/FicheTechnique.jsx';
import XpCalibreur from './views/XpCalibreur.jsx';
import Equilibrage from './views/Equilibrage.jsx';
import PrepSession from './views/PrepSession.jsx';
import BackstageMJ from './views/BackstageMJ.jsx';
import Parametres from './views/Parametres.jsx';
import SessionEnCours from './views/SessionEnCours.jsx';

const STATUS_TEXT = {
  loading: 'Chargement…',
  ready: 'Synchronisé',
  saving: 'Enregistrement…',
  offline: 'Hors ligne — reconnexion…'
};
const STATUS_ON = { ready: '1', saving: 'saving', loading: 'saving', offline: '0' };

const VIEW_COMPONENTS = {
  liens: Liens, journal: Journal, consequences: Consequences, horloges: Horloges,
  secrets: Secrets, oublis: Oublis, epreuves: Epreuves, zones: Zones,
  fichetechnique: FicheTechnique, xpcalibreur: XpCalibreur, equilibrage: Equilibrage, prepsession: PrepSession,
  'backstage-mj': BackstageMJ
};

export default function Dashboard({ session }) {
  const role = session.user.user_metadata?.role === 'player' ? 'player' : 'admin';
  const { state, status, mutate } = useBoard(session);
  const [view, setViewRaw] = useState(lsGet('ccm.view') || '');
  const [finishOpen, setFinishOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const setView = (v) => { setViewRaw(v); lsSet('ccm.view', v); };

  useEffect(() => { applyUiScale(getUiScale()); }, []);

  if (!state) {
    return <div className="auth__boot">Chargement du repaire…</div>;
  }

  const tree = pruneForRole(state.settings.menu || [], role);
  const isAdminOnlyView = view === 'session' || view === 'parametres';
  const activeView = ((isAdminOnlyView && role === 'admin') || treeHasView(tree, view))
    ? view
    : (firstViewKey(tree) || '');

  const goToSession = (id) => { lsSet('ccm.session', id); if (treeHasView(tree, 'journal')) setView('journal'); };
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

  const shared = { state, mutate, goToSession };
  let ViewComp = null;
  if (activeView === 'personnages') ViewComp = role === 'player' ? PersonnageJoueur : Personnages;
  else if (activeView === 'parametres') ViewComp = Parametres;
  else ViewComp = VIEW_COMPONENTS[activeView] || null;

  const footerItems = role === 'admin'
    ? [{ key: 'parametres', label: 'Paramètres', active: activeView === 'parametres', onClick: () => setView('parametres') }]
    : [];

  const statusBar = (
    <span className="status" data-on={STATUS_ON[status] || '0'}>
      <i />
      <span>{STATUS_TEXT[status] || status}</span>
      {role === 'admin' && <span className="status__user"> · {(session.user.email || '').split('@')[0]}</span>}
      <button className="status__logout" type="button" onClick={() => setPrefsOpen(true)}>
        Préférences
      </button>
      <button className="status__logout" type="button" onClick={() => supabase.auth.signOut()}>
        Quitter
      </button>
    </span>
  );

  return (
    <main className="page">
      <header className="head">
        <div className="headrow">
          <div className="headrow__left">
            <p className="eyebrow">Tableau de bord · Animation JdR</p>
            <h1>Les Contes Malveillants</h1>
            {statusBar}
            {role === 'admin' ? (
              <>
                <p className="lede">
                  L’abîme n’est que rarement chose absolue, car maints récits tenus pour funestes ne
                  furent, en leur genèse, que des justices sans témoins, dont le passé maudit,
                  dépourvu d’encre et de mémoire, ne sut jamais être rapporté avec la fidélité qui
                  leur eût rendu couleurs et légitimité.
                </p>
                <p className="lede">Ainsi vont les tragédies ; ainsi vont les contes malveillants.</p>
              </>
            ) : (
              <p className="lede">Fiche de personnage — {(session.user.email || '').split('@')[0]}</p>
            )}
          </div>
          <div className="topright">
            {role === 'admin' && (
              <button
                className={'btn-primary btn-primary--session' + (hasDraft ? ' btn-primary--stop' : '')}
                type="button"
                onClick={hasDraft ? () => { setView('session'); setFinishOpen(true); } : startSession}
              >
                {hasDraft ? '⏹ Terminer la session' : '▶ Débuter la session'}
              </button>
            )}
            <WorldDate state={state} mutate={mutate} readOnly={role !== 'admin'} />
          </div>
        </div>
        <div className="divider"><i /></div>
      </header>

      {role === 'admin' && (
        <div className="margins">
          <Notes state={state} mutate={mutate} />
        </div>
      )}

      <div className="dash-body">
        <Sidebar tree={tree} view={activeView} setView={setView} footerItems={footerItems} />
        <div className={'dash-main view view--' + (activeView || 'empty')}>
          {view === 'session'
            ? <SessionEnCours state={state} mutate={mutate} onFinish={() => setFinishOpen(true)} />
            : ViewComp
              ? (activeView === 'personnages' && role === 'player'
                ? <ViewComp state={state} mutate={mutate} userId={session.user.id} goToSession={goToSession} />
                : <ViewComp {...shared} />)
              : <p className="empty">Aucune vue accessible pour l’instant.</p>}
        </div>
      </div>

      {finishOpen && hasDraft && (
        <FinishModal
          draft={state.sessionDraft}
          onConfirm={confirmFinish}
          onCancel={() => setFinishOpen(false)}
        />
      )}

      {prefsOpen && <Preferences onClose={() => setPrefsOpen(false)} />}

      <footer className="foot">
        Dernière mise à jour · {state.updated ? fmtDateLong(state.updated) : '—'} — enregistrée à chaque modification.
      </footer>
    </main>
  );
}
