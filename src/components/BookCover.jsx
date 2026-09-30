import { bookTitle, bindingIndex, idVariant } from '../lib/bibliotheque.js';
import { coverAppearance } from '../lib/documentAppearance.js';

/** Même couverture au pupitre et à l'ouverture, dérivée des réglages du document. */
export default function BookCover({ book, className = '' }) {
  const { document: d, kind, material } = coverAppearance(book.document);
  return <div className={'lib-cover lib-cover--' + kind + ' lib-book--c' + bindingIndex(book.id) + ' scr-material--' + material + ' ' + className} aria-hidden="true">
    <span className="lib-cover__origin">{d.institution || book.surtitre || (kind === 'tome' ? 'Les contes du Repaire' : 'Archives du Repaire')}</span>
    {d.reference && <span className="lib-cover__reference">N° {d.reference}</span>}
    <b className="lib-cover__name">{bookTitle(book)}</b>
    {d.author && <span className="lib-cover__author">Par {d.author}</span>}
    {d.classification ? <span className="lib-cover__stamp">{d.classification}</span> : <i className="lib-cover__seal">{kind === 'dossier' ? '§' : kind === 'tablet' ? '◇' : ['✦', '❧', '◇', '☽', '✧', '❦'][idVariant(book.id + ':ornament', 6)]}</i>}
  </div>;
}
