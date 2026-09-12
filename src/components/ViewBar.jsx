export const VIEWS = [
  ['liens', 'Liens'],
  ['journal', 'Journal de campagne'],
  ['consequences', 'Conséquences'],
  ['horloges', 'Horloges & fronts'],
  ['secrets', 'Secrets'],
  ['oublis', 'À ne pas oublier'],
  ['epreuves', 'Épreuves & infos'],
  ['personnages', 'Personnages'],
  ['zones', 'Zone']
];

export default function ViewBar({ view, setView, hasDraft, onFinish }) {
  return (
    <div className="viewbar">
      <button
        type="button"
        className={'viewbtn viewbtn--session' + (hasDraft ? ' is-live' : '')}
        data-v="session"
        aria-current={view === 'session'}
        onClick={() => setView('session')}
      >
        {hasDraft ? '● Séance en cours' : 'Débuter la session'}
      </button>

      {VIEWS.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className="viewbtn"
          data-v={v}
          aria-current={v === view}
          onClick={() => setView(v)}
        >
          {label}
        </button>
      ))}

      <button
        type="button"
        className="viewbtn viewbtn--terminer"
        onClick={onFinish}
        disabled={!hasDraft}
        title={hasDraft ? 'Clôturer la séance en cours' : 'Aucune séance en cours'}
      >
        Terminer la session
      </button>
    </div>
  );
}
