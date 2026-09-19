import { useSyncedField } from '../../lib/useSyncedField.js';
import Notes from '../Notes.jsx';

/** Tableau de bord MJ : informations de campagne (acte en cours, affiché en
 * troisième ligne sous la date, pour tout le monde) + notes marginales. */
export default function TableauDeBord({ state, mutate }) {
  const campaign = state.campaign || {};
  const [actNumber, setActNumber, numRef] = useSyncedField(campaign.actNumber);
  const [actTitle, setActTitle, titleRef] = useSyncedField(campaign.actTitle);
  const patch = (fn) => mutate((s) => { s.campaign = s.campaign || {}; fn(s.campaign); });

  return (
    <div className="zone-pane">
      <div className="zone-pane__head">
        <span className="card__label">Tableau de bord</span>
      </div>

      <h3 className="ssn-h">Information de campagne</h3>
      <div className="campaign-info">
        <label className="campaign-info__field">
          <span className="campaign-info__label">Numéro de l’acte</span>
          <input
            ref={numRef} className="finput" type="text" placeholder="Acte I"
            value={actNumber}
            onChange={(e) => { const v = e.target.value; setActNumber(v); patch((c) => { c.actNumber = v; }); }}
            onBlur={() => patch((c) => { c.actNumber = actNumber.trim(); })}
          />
        </label>
        <label className="campaign-info__field campaign-info__field--wide">
          <span className="campaign-info__label">Titre de l’acte</span>
          <input
            ref={titleRef} className="finput" type="text" placeholder="L’évasion"
            value={actTitle}
            onChange={(e) => { const v = e.target.value; setActTitle(v); patch((c) => { c.actTitle = v; }); }}
            onBlur={() => patch((c) => { c.actTitle = actTitle.trim(); })}
          />
        </label>
      </div>
      <p className="dd-hint">
        Affiché sous la date, en haut à droite, pour les MJ comme pour les joueurs :
        <strong> {actNumber.trim() || 'Acte I'}</strong> : <em>{actTitle.trim() || 'L’évasion'}</em>
      </p>

      <h3 className="ssn-h">Notes marginales</h3>
      <div className="margins">
        <Notes state={state} mutate={mutate} />
      </div>
    </div>
  );
}
