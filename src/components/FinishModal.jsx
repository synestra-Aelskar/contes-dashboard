import { sessionGaps } from '../lib/session.js';

export default function FinishModal({ draft, onConfirm, onCancel, onAbandon }) {
  if (!draft) return null;
  const gaps = sessionGaps(draft);
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Clôturer « {draft.title || 'la séance'} » ?</h3>
        {gaps.length ? (
          <>
            <p className="modal__lead">Ces éléments ne sont pas remplis :</p>
            <ul className="modal__gaps">
              {gaps.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </>
        ) : (
          <p className="modal__lead">Tout est rempli.</p>
        )}
        <p className="modal__note">
          À la clôture : une séance est ajoutée au Journal de campagne ; l’XP, les événements et le
          résumé sont poussés sur les onglets des personnages concernés ; les conséquences, horloges
          et rappels sont poussés dans leurs vues respectives. Chaque élément gardera un lien vers
          cette séance.
        </p>
        <div className="modal__actions modal__actions--split">
          <button className="btn-warn" type="button" onClick={onAbandon}>
            Abandonner — tout effacer
          </button>
          <div className="modal__actions">
            <button className="tbtn" type="button" onClick={onCancel}>Retour</button>
            <button className="btn-primary btn-primary--stop" type="button" onClick={onConfirm}>
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
