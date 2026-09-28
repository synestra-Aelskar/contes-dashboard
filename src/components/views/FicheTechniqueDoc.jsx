import { FicheEditor } from './FicheTechnique.jsx';

/**
 * Ouvre UNE fiche technique précise, atteinte via son propre nœud dans le
 * menu (placé librement, visibilité de vue ET d'édition définies par nœud,
 * indépendamment — voir Paramètres › Ordre du menu) plutôt que via la liste
 * de gestion. Lecture forcée par défaut pour qui n'a pas le rôle MJ.
 */
export default function FicheTechniqueDoc({ state, mutate, canEdit, ficheId, setView }) {
  const fiche = (state.fichesTechniques || []).find((f) => f.id === ficheId);

  if (!fiche) {
    return (
      <section className="chapter">
        <div className="chapter__head"><h2>Fiche technique</h2></div>
        <p className="empty">Cette fiche n’existe plus.</p>
      </section>
    );
  }

  function handleDelete() {
    if (!window.confirm('Supprimer la fiche « ' + (fiche.nom.trim() || 'Sans nom') + ' » ?')) return;
    mutate((s) => { s.fichesTechniques = s.fichesTechniques.filter((f) => f.id !== fiche.id); });
    setView('');
  }

  return (
    <FicheEditor
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
