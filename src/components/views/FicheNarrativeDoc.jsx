import { FicheNarrativeEditor } from './FicheNarrative.jsx';

/**
 * Ouvre UNE fiche narrative précise, atteinte via son propre nœud dans le
 * menu (placé librement, visibilité admin/joueur définie par nœud) plutôt
 * que via la liste de gestion. Lecture forcée pour qui n'a pas le rôle MJ.
 */
export default function FicheNarrativeDoc({ state, mutate, role, ficheId, setView }) {
  const fiche = (state.fichesNarratives || []).find((f) => f.id === ficheId);
  const canEdit = role === 'admin';

  if (!fiche) {
    return (
      <section className="chapter">
        <div className="chapter__head"><h2>Fiche narrative</h2></div>
        <p className="empty">Cette fiche n’existe plus.</p>
      </section>
    );
  }

  function handleDelete() {
    if (!window.confirm('Supprimer la fiche « ' + (fiche.titre.trim() || 'Sans titre') + ' » ?')) return;
    mutate((s) => { s.fichesNarratives = s.fichesNarratives.filter((f) => f.id !== fiche.id); });
    setView('');
  }

  return (
    <FicheNarrativeEditor
      fiche={fiche}
      mutate={mutate}
      canEdit={canEdit}
      initialRead={!canEdit}
      backLabel="← Retour"
      onBack={() => setView('')}
      onDelete={canEdit ? handleDelete : undefined}
    />
  );
}
