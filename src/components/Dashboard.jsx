import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useBoard } from '../lib/board.js';
import { fmtDateLong, lsGet, lsSet } from '../lib/util.js';
import { makeDraft, finishDraft, nextSessionTitle } from '../lib/session.js';
import { getUiScale, applyUiScale } from '../lib/prefs.js';
import { pruneForRole, firstViewKey, treeHasView } from '../lib/menu.js';
import WorldDate from './WorldDate.jsx';
import Sidebar from './Sidebar.jsx';
import TableauDeBord from './views/TableauDeBord.jsx';
import FinishModal from './FinishModal.jsx';
import StartSessionModal from './StartSessionModal.jsx';
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
import Validations from './views/Validations.jsx';
import Zones from './views/Zones.jsx';
import FicheTechnique from './views/FicheTechnique.jsx';
import FicheTechniqueDoc from './views/FicheTechniqueDoc.jsx';
import FicheNarrative from './views/FicheNarrative.jsx';
import FicheNarrativeDoc from './views/FicheNarrativeDoc.jsx';
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
  fichetechnique: FicheTechnique, fichenarrative: FicheNarrative, xpcalibreur: XpCalibreur, equilibrage: Equilibrage, prepsession: PrepSession,
  'backstage-mj': BackstageMJ, 'personnages-joueurs': Personnages, validations: Validations
};

const DOC_COMPONENTS = { fichetechnique: FicheTechniqueDoc, fichenarrative: FicheNarrativeDoc };

function pendingValidationsCount(state) {
  let n = 0;
  (state.characters || []).forEach((c) => (c.traits || []).forEach((t) => {
    if (t.status === 'pending' || t.status === 'creating') n += 1;
  }));
  return n;
}

export default function Dashboard({ session }) {
  const role = session.user.user_metadata?.role === 'player' ? 'player' : 'admin';
  const { state, status, mutate } = useBoard(session);
  const [view, setViewRaw] = useState(lsGet('ccm.view') || '');
  const [finishOpen, setFinishOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [sessionPanelOpen, setSessionPanelOpen] = useState(false);
  const setView = (v) => { setViewRaw(v); lsSet('ccm.view', v); };

  useEffect(() => { applyUiScale(getUiScale()); }, []);

  if (!state) {
    return <div className="auth__boot">Chargement du repaire…</div>;
  }

  const tree = pruneForRole(state.settings.menu || [], role);
  const isAdminOnlyView = view === 'parametres' || view === 'tableaudebord';
  const activeView = ((isAdminOnlyView && role === 'admin') || treeHasView(tree, view))
    ? view
    : (firstViewKey(tree) || '');

  const goToSession = (id) => { lsSet('ccm.session', id); if (treeHasView(tree, 'journal')) setView('journal'); };
  const hasDraft = !!state.sessionDraft;

  function confirmStart() {
    mutate((s) => { if (!s.sessionDraft) s.sessionDraft = makeDraft(s); });
    setStartConfirmOpen(false);
    setSessionPanelOpen(true);
  }

  function confirmFinish() {
    const out = {};
    mutate((s) => finishDraft(s, out));
    setFinishOpen(false);
    setSessionPanelOpen(false);
    if (out.sessionId) goToSession(out.sessionId);
  }

  function abandonSession() {
    mutate((s) => { s.sessionDraft = null; });
    setFinishOpen(false);
    setSessionPanelOpen(false);
  }

  const shared = { state, mutate, goToSession, role, userId: session.user.id };
  const docMatch = /^doc:([^:]+):(.+)$/.exec(activeView);
  const docKind = docMatch ? docMatch[1] : null;
  const docId = docMatch ? docMatch[2] : null;
  let ViewComp = null;
  if (activeView === 'personnages') ViewComp = PersonnageJoueur;
  else if (activeView === 'parametres') ViewComp = Parametres;
  else if (activeView === 'tableaudebord') ViewComp = TableauDeBord;
  else if (docKind) ViewComp = DOC_COMPONENTS[docKind] || null;
  else ViewComp = VIEW_COMPONENTS[activeView] || null;

  const badges = role === 'admin' ? { validations: pendingValidationsCount(state) } : undefined;

  const footerItems = role === 'admin'
    ? [{ key: 'parametres', label: 'Paramètres', active: activeView === 'parametres', onClick: () => setView('parametres') }]
    : [];

  const sessionButton = role === 'admin' ? (
    <>
    <button
      className={'btn-primary btn-primary--session' + (hasDraft ? ' btn-primary--live' : '')}
      type="button"
      onClick={hasDraft ? () => setSessionPanelOpen(true) : () => setStartConfirmOpen(true)}
      data-label={hasDraft ? 'Session en cours…' : 'Débuter la session'}
      aria-label={hasDraft ? 'Session en cours…' : 'Débuter la session'}
    >
      {hasDraft
        ? <><span className="btn-primary__dot" /><span className="sidebar__label">Session en cours…</span></>
        : <>▶<span className="sidebar__label"> Débuter la session</span></>}
    </button>
    <button
      type="button"
      className={'sidebar__item sidebar__item--action' + (activeView === 'tableaudebord' ? ' is-active' : '')}
      onClick={() => setView('tableaudebord')}
      data-label="Tableau de bord" aria-label="Tableau de bord"
    >
      <svg className="sidebar__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 3h8v10H3z" /><path d="M13 3h8v6h-8z" /><path d="M13 13h8v8h-8z" /><path d="M3 17h8v4H3z" />
      </svg>
      <span className="sidebar__label">Tableau de bord</span>
    </button>
    </>
  ) : null;

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
          </div>
          <div className="topright">
            <WorldDate state={state} mutate={mutate} readOnly={role !== 'admin'} />
          </div>
        </div>
        <div className="divider"><i /></div>
      </header>

      <div className="dash-body">
        <Sidebar tree={tree} view={activeView} setView={setView} footerItems={footerItems} topSlot={sessionButton} badges={badges} state={state} />
        <div className={'dash-main view view--' + (activeView || 'empty')}>
          {ViewComp
            ? (activeView === 'personnages'
              ? <ViewComp state={state} mutate={mutate} userId={session.user.id} goToSession={goToSession} />
              : docKind
                ? <ViewComp {...shared} ficheId={docId} setView={setView} />
                : <ViewComp {...shared} />)
            : <p className="empty">Aucune vue accessible pour l’instant.</p>}
        </div>
      </div>

      {startConfirmOpen && (
        <StartSessionModal
          title={nextSessionTitle(state)}
          onConfirm={confirmStart}
          onCancel={() => setStartConfirmOpen(false)}
        />
      )}

      {sessionPanelOpen && hasDraft && (
        <SessionEnCours
          state={state}
          mutate={mutate}
          onFinish={() => setFinishOpen(true)}
          onClose={() => setSessionPanelOpen(false)}
        />
      )}

      {finishOpen && hasDraft && (
        <FinishModal
          draft={state.sessionDraft}
          onConfirm={confirmFinish}
          onCancel={() => setFinishOpen(false)}
          onAbandon={abandonSession}
        />
      )}

      {prefsOpen && <Preferences onClose={() => setPrefsOpen(false)} />}

      <footer className="foot">
        Dernière mise à jour · {state.updated ? fmtDateLong(state.updated) : '—'} — enregistrée à chaque modification.
      </footer>
    </main>
  );
}
