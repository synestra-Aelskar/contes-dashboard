export default function StartSessionModal({ title, onConfirm, onCancel }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Voulez-vous démarrer « {title} » ?</h3>
        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onCancel}>Non</button>
          <button className="btn-primary" type="button" onClick={onConfirm}>Oui</button>
        </div>
      </div>
    </div>
  );
}
