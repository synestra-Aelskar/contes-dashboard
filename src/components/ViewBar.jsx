export const VIEWS = [
  ['liens', 'Liens'],
  ['journal', 'Journal de campagne'],
  ['consequences', 'Conséquences'],
  ['horloges', 'Horloges & fronts'],
  ['secrets', 'Secrets'],
  ['oublis', 'À ne pas oublier'],
  ['epreuves', 'Épreuves & infos']
];

export default function ViewBar({ view, setView }) {
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
    </div>
  );
}
