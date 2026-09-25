import { useState } from 'react';
import { useSyncedField } from '../lib/useSyncedField.js';

export const TRAIT_STATUS_LABEL = {
  draft: 'Brouillon',
  pending: 'En attente de validation',
  creating: 'En cours de création',
  accepted: 'Créé en jeu',
  refused: 'Refusé'
};

/** Bloc de validation MJ d'un trait proposé par un joueur, replié par
 * défaut (nom + statut seuls) — la flèche déplie le contenu et les actions.
 * Validation en deux temps : « Valider » (pending → creating, à créer en
 * jeu côté Necronicon) puis « Créé en jeu ✓ » (creating → accepted), ou
 * refus. */
export default function TraitAdminBlock({ char, trait, mutate }) {
  const [open, setOpen] = useState(false);
  const [mjNote, setMjNote, mjRef] = useSyncedField(trait.mjNote);
  const patch = (fn) =>
    mutate((s) => {
      const c = s.characters.find((x) => x.id === char.id);
      const t = c && (c.traits || []).find((x) => x.id === trait.id);
      if (t) fn(t);
    });

  return (
    <div className={'pj__trait pj__trait--' + trait.status}>
      <button
        type="button" className="pj__traithead pj__traithead--toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={'pj__traitchev' + (open ? ' is-open' : '')} aria-hidden="true">▸</span>
        <span className={'pj__traitstatus pj__traitstatus--' + trait.status}>{TRAIT_STATUS_LABEL[trait.status]}</span>
        <span className="pj__traitname"><b>{trait.name || 'Sans nom'}</b></span>
      </button>

      {open && (
        <>
          <p className="chr__recaptxt">{trait.narrativeDesc || '—'}</p>
          <p className="chr__recaptxt"><i>{trait.technicalDesc || '—'}</i></p>
          {trait.status === 'pending' && (
            <>
              <label className="flabel">
                Note MJ (motif du refus, si refusé)
                <input
                  ref={mjRef} className="field" type="text" placeholder="Optionnel"
                  value={mjNote}
                  onChange={(e) => { const v = e.target.value; setMjNote(v); patch((t) => { t.mjNote = v; }); }}
                  onBlur={() => patch((t) => { t.mjNote = mjNote.trim(); })}
                />
              </label>
              <div className="card__actions">
                <button className="btn-primary" type="button" onClick={() => patch((t) => { t.status = 'creating'; })}>Valider</button>
                <button className="tbtn" type="button" onClick={() => patch((t) => { t.status = 'refused'; })}>Refuser</button>
              </div>
            </>
          )}
          {trait.status === 'creating' && (
            <>
              <p className="chr__muted">Validé — reste à le créer en jeu (Necronicon), puis à confirmer ici.</p>
              <div className="card__actions">
                <button className="btn-primary" type="button" onClick={() => patch((t) => { t.status = 'accepted'; })}>Créé en jeu ✓</button>
                <button className="tbtn" type="button" onClick={() => patch((t) => { t.status = 'pending'; })}>Repasser en attente</button>
              </div>
            </>
          )}
          {trait.status === 'accepted' && (
            <div className="card__actions">
              <button className="tbtn" type="button" onClick={() => patch((t) => { t.status = 'creating'; })}>Pas encore créé en jeu</button>
              <button className="tbtn" type="button" onClick={() => patch((t) => { t.status = 'pending'; })}>Repasser en attente</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
