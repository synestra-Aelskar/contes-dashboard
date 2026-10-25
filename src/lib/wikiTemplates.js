/* Compendium — modèles de notes intégrés. `{{titre}}` est remplacé par le nom de
 * la note. Les propriétés sont volontairement peu nombreuses et stables
 * (`type`, `statut`, `region`…) : ce sont elles qui alimentent les Collections. */

export const WIKI_TEMPLATES = [
  { id: 'vide', label: 'Note vide', desc: 'Une page blanche.', fm: '', body: '' },
  {
    id: 'personnage', label: 'Personnage', desc: 'PNJ, figure marquante, ennemi récurrent.',
    fm: 'type: personnage\nstatut: vivant\nrace: \nfonction: \nfaction: \nlieu: ',
    body: '## Résumé\n\n## Apparence\n\n## Personnalité\n\n## Histoire\n\n## Relations\n\n## Accroches\n\n'
  },
  {
    id: 'lieu', label: 'Lieu', desc: 'Ville, ruine, région, bâtiment.',
    fm: 'type: lieu\ncategorie: \nregion: \ndirigeant: ',
    body: '## Aperçu\n\n## Ambiance\n\n## Points d’intérêt\n\n## Habitants\n\n## Histoire\n\n## Accroches\n\n'
  },
  {
    id: 'faction', label: 'Faction', desc: 'Ordre, guilde, culte, maison.',
    fm: 'type: faction\nalignement: \nchef: \nsiege: ',
    body: '## Aperçu\n\n## Buts\n\n## Structure\n\n## Membres notables\n\n## Alliés et ennemis\n\n'
  },
  {
    id: 'entite', label: 'Entité divine', desc: 'Divinité, esprit, être primordial.',
    fm: 'type: entité divine\ndomaine: \nnature: ',
    body: '## Nature\n\n## Domaine\n\n## Légendes\n\n## Culte\n\n## Manifestations\n\n'
  },
  {
    id: 'creature', label: 'Créature', desc: 'Bestiaire : monstre, espèce, peuple.',
    fm: 'type: créature\nmilieu: \ndanger: ',
    body: '## Description\n\n## Comportement\n\n## Habitat\n\n## Capacités\n\n## Récits\n\n'
  },
  {
    id: 'objet', label: 'Objet', desc: 'Relique, artefact, arme remarquable.',
    fm: 'type: objet\nraretee: \nporteur: \nlieu: ',
    body: '## Description\n\n## Pouvoirs\n\n## Histoire\n\n## Où le trouver\n\n'
  },
  {
    id: 'evenement', label: 'Événement', desc: 'Bataille, cataclysme, rituel, date clé.',
    fm: 'type: événement\ndate: \nlieu: ',
    body: '## Que s’est-il passé ?\n\n## Causes\n\n## Conséquences\n\n## Protagonistes\n\n'
  }
];

export function applyTemplate(tpl, title) {
  const fill = (s) => String(s || '').replace(/\{\{titre\}\}/g, title);
  return { fm: fill(tpl.fm), body: fill(tpl.body) };
}
