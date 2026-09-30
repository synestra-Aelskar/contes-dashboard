/** Options fermées : aucune valeur utilisateur n'est interpolée dans le CSS exporté. */
export const SUPPORTS = {
  night: { label: 'Nuit & braise', note: 'Le récit originel, encre claire sur fond sombre', bg: '#0b0a09', ink: '#e7e2d8', accent: '#d2a04a', muted: '#b9b2a5', texture: 'radial-gradient(ellipse at 50% 0, #d2a04a12, transparent 70%)', dark: true },
  parchment: { label: 'Parchemin ancien', note: 'Peau dorée, traces et bords patinés', bg: '#e4cc94', ink: '#392918', accent: '#804026', muted: '#675035', texture: 'radial-gradient(ellipse at 0 15%, #88532755, transparent 50%), radial-gradient(ellipse at 100% 90%, #96662855, transparent 55%), repeating-linear-gradient(14deg, #79552b07 0 1px, transparent 1px 5px)' },
  vellum: { label: 'Vélin ivoire', note: 'Une surface douce pour les lettres et les décrets', bg: '#f0e7d2', ink: '#363129', accent: '#7b4932', muted: '#665f50', texture: 'radial-gradient(ellipse at 20% 30%, #fff8 0, transparent 65%), repeating-linear-gradient(98deg, #796e4e09 0 1px, transparent 1px 6px)' },
  paper: { label: 'Papier de laboratoire', note: 'Feuille claire, sobre et légèrement fibreuse', bg: '#f1f0e9', ink: '#253433', accent: '#39645e', muted: '#586763', texture: 'repeating-linear-gradient(0deg, #3b514b06 0 1px, transparent 1px 4px), radial-gradient(ellipse at 100% 100%, #909a871c, transparent 60%)' },
  archive: { label: 'Papier d’archives', note: 'Feuillet jauni et plis de conservation', bg: '#ddd2b1', ink: '#342f25', accent: '#87432d', muted: '#635844', texture: 'linear-gradient(90deg, transparent 49.5%, #68502c12 50%, #fff3 50.4%, transparent 51%), linear-gradient(0deg, transparent 66%, #68502c12 66.3%, transparent 67%), radial-gradient(ellipse at 0 0, #99703944, transparent 65%)' },
  blueprint: { label: 'Plan d’étude', note: 'Quadrillage fin et encre blanche sur bleu', bg: '#203e54', ink: '#e4eef0', accent: '#bed8d9', muted: '#b4cdd3', texture: 'repeating-linear-gradient(0deg, #d1eaf014 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, #d1eaf014 0 1px, transparent 1px 28px)', dark: true },
  stone: { label: 'Pierre gravée', note: 'Calcaire, grain minéral et strates', bg: '#c4bfb0', ink: '#302e29', accent: '#594c39', muted: '#58534a', texture: 'repeating-linear-gradient(166deg, transparent 0 69px, #524b3514 70px, transparent 72px), radial-gradient(ellipse at 5% 20%, #fff5, transparent 55%), repeating-linear-gradient(37deg, #423b2808 0 2px, transparent 2px 7px)' },
  slate: { label: 'Ardoise noire', note: 'Une inscription claire sur roche sombre', bg: '#2c3437', ink: '#e2e5df', accent: '#c2c9ad', muted: '#bac3bf', texture: 'repeating-linear-gradient(172deg, transparent 0 47px, #0002 48px, #fff1 49px, transparent 51px), radial-gradient(ellipse at 20% 0, #ffffff12, transparent 70%)', dark: true }
};
export const LAYOUTS = { epic: 'Récit immersif', report: 'Dossier & rapport', letter: 'Lettre & manuscrit', inscription: 'Inscription & tablette' };
export const TYPEFACES = { literary: 'Littéraire', classic: 'Classique', typewriter: 'Machine à écrire' };
export const DOCUMENT_FIELDS = { reference: 'Numéro / référence', author: 'Auteur', institution: 'Institution / origine', date: 'Date du document', classification: 'Mention / classification' };
const choice = (obj, value, fallback) => Object.hasOwn(obj, value) ? value : fallback;
export function documentOptions(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const number = (v, fallback, min, max) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    support: choice(SUPPORTS, o.support, 'night'), layout: choice(LAYOUTS, o.layout, 'epic'), font: choice(TYPEFACES, o.font, 'literary'),
    size: number(o.size, 19, 16, 24), spacing: number(o.spacing, 1.9, 1.4, 2.2), texture: number(o.texture, 65, 0, 100),
    ...Object.fromEntries(Object.keys(DOCUMENT_FIELDS).map(k => [k, typeof o[k] === 'string' ? o[k] : '']))
  };
}
export const DOCUMENT_TEMPLATES = [
  { id: 'clinical', label: 'Dossier clinique', note: 'Observation, protocole, résultats et conclusion.', support: 'paper', layout: 'report', font: 'typewriter', surtitre: 'Rapport de recherche', titre1: 'Test clinique sur les Esprits de la guerre', reference: '0098', author: 'Roy Hawkins', institution: 'Département des études spirituelles', classification: 'Diffusion restreinte', sections: ['Objet de l’étude', 'Protocole expérimental', 'Observations', 'Conclusion'], prompts: ['Décrire le sujet, le contexte et l’hypothèse de recherche.', 'Décrire les conditions et les étapes du protocole.', 'Consigner les manifestations observées et leurs effets.', 'Résumer les résultats, les limites et les suites à donner.'] },
  { id: 'letter', label: 'Correspondance', note: 'Une lettre personnelle sur vélin.', support: 'vellum', layout: 'letter', font: 'classic', surtitre: 'Correspondance', titre1: 'À l’attention de…', sections: [''], prompts: ['Écrire ici le message destiné à votre correspondant.'] },
  { id: 'decree', label: 'Décret & proclamation', note: 'Une parole officielle sur parchemin.', support: 'parchment', layout: 'report', font: 'classic', surtitre: 'Décret', titre1: 'Par ordre du Conseil', classification: 'Proclamation publique', sections: ['Préambule', 'Dispositions', 'Entrée en vigueur'], prompts: ['Présenter les motifs de la décision.', 'Énoncer les dispositions du décret.', 'Préciser la date et les conditions d’application.'] },
  { id: 'field', label: 'Journal de terrain', note: 'Notes, découvertes et témoignages archivés.', support: 'archive', layout: 'letter', font: 'literary', surtitre: 'Carnet d’expédition', titre1: 'Au-delà des frontières', sections: ['Lieu & circonstances', 'Observations', 'Pistes à suivre'], prompts: ['Situer cette entrée du journal.', 'Noter les faits et les témoignages recueillis.', 'Lister les questions encore ouvertes.'] },
  { id: 'tablet', label: 'Tablette ancienne', note: 'Une inscription solennelle dans la pierre.', support: 'stone', layout: 'inscription', font: 'classic', surtitre: 'Fragment retrouvé', titre1: 'La mémoire des anciens', sections: ['Inscription'], prompts: ['Graver ici les paroles laissées à ceux qui viendront après nous.'] },
  { id: 'study', label: 'Étude arcanique', note: 'Un dossier technique sur fond quadrillé.', support: 'blueprint', layout: 'report', font: 'typewriter', surtitre: 'Étude arcanique', titre1: 'Anatomie d’un phénomène', sections: ['Description', 'Schéma & mesures', 'Interprétation'], prompts: ['Définir le phénomène étudié.', 'Consigner les mesures et ajouter un schéma.', 'Exposer l’interprétation des observations.'] }
];
/** La pierre prime sur la mise en page ; les autres supports suivent le format. */
export function coverAppearance(raw) {
  const document = documentOptions(raw);
  const kind = ['stone', 'slate'].includes(document.support) || document.layout === 'inscription'
    ? 'tablet' : document.layout === 'report' ? 'dossier' : document.layout === 'letter' ? 'folio' : 'tome';
  return { document, kind, material: document.support === 'night' && kind === 'tablet' ? 'slate' : document.support };
}
