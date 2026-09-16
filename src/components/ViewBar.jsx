export const VIEWS = [
  ['liens', 'Liens'],
  ['journal', 'Journal de campagne'],
  ['consequences', 'Conséquences'],
  ['horloges', 'Horloges & fronts'],
  ['secrets', 'Secrets'],
  ['oublis', 'À ne pas oublier'],
  ['epreuves', 'Épreuves & infos'],
  ['personnages', 'Personnages'],
  ['zones', 'Zone'],
  ['fichetechnique', 'Fiche Technique'],
  ['xpcalibreur', "Calibreur d'XP"],
  ['equilibrage', 'Équilibrage DD'],
  ['prepsession', 'Prep Session']
];

export default function ViewBar({ view, setView, hasDraft, onStart, onFinish }) {
  return (
    <div className="viewbar">
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
        className={'viewbtn viewbtn--sessiontoggle' + (hasDraft ? ' viewbtn--terminer' : ' viewbtn--debuter')}
        aria-current={view === 'session'}
        onClick={hasDraft ? onFinish : onStart}
        title={hasDraft ? 'Clôturer la séance en cours' : 'Démarrer une nouvelle séance'}
      >
        {hasDraft ? '⏹ Terminer la session' : '▶ Débuter la session'}
      </button>
    </div>
  );
}
