import { useState } from 'react';
import { lsGet, lsSet, fmtDateLong } from '../../lib/util.js';
import BookCover from '../BookCover.jsx';
import { booksSharedWith, bookTitle, bookStats } from '../../lib/bibliotheque.js';
import { Spine, Reader } from './Bibliotheque.jsx';

/* Bibliothèque personnelle d'un joueur : seulement les livres que le MJ a
 * partagés avec l'un de ses personnages (book.sharedWith). Lecture seule —
 * aucun rangement, aucune édition. */
const SEL_KEY = 'ccm.mabibliotheque.sel';

export default function MaBibliotheque({ state, userId }) {
  const books = booksSharedWith(state, userId);
  const [selId, setSelIdRaw] = useState(() => lsGet(SEL_KEY) || '');
  const [reading, setReading] = useState(null);
  const setSelId = (id) => { setSelIdRaw(id); lsSet(SEL_KEY, id); };
  const selected = books.find((b) => b.id === selId) || null;
  const readingBook = reading && books.find((b) => b.id === reading);
  const stats = selected ? bookStats(selected) : null;

  return (
    <section className="chapter lib">
      <div className="lib__hero">
        <div>
          <p className="lib__eyebrow">Vos livres</p>
          <h2>Ma bibliothèque</h2>
          <p className="lib__intro">Les récits que le MJ a confiés à vos personnages.</p>
        </div>
      </div>

      {!books.length ? (
        <p className="empty">Aucun livre ne vous a été confié pour l’instant.</p>
      ) : (
        <div className="lib__layout">
          <div className="lib__case">
            <section className="lib-shelf">
              <header className="lib-shelf__head">
                <span className="lib-shelf__number" aria-hidden="true">01</span>
                <span className="lib-plaque">Livres reçus</span>
                <span className="lib-shelf__count">{books.length} livre{books.length > 1 ? 's' : ''}</span>
              </header>
              <div className="lib-shelf__row">
                <span className="lib-bookend" aria-hidden="true" />
                {books.map((b) => (
                  <Spine
                    key={b.id} book={b} lying={false} canEdit={false} selected={b.id === selId}
                    onSelect={() => setSelId(b.id === selId ? '' : b.id)}
                  />
                ))}
                <span className="lib-bookend lib-bookend--r" aria-hidden="true" />
              </div>
            </section>
          </div>

          <aside className={'lib-lectern' + (selected ? ' is-open' : '')} aria-label="Pupitre">
            {selected ? (
              <>
                <BookCover book={selected} />
                <p className="lib-lectern__sur">{selected.surtitre || 'Récit'}</p>
                <h3 className="lib-lectern__title">
                  <span>{selected.titre1 || (selected.titre2 ? '' : 'Sans titre')}</span>
                  {selected.titre2 && <em>{selected.titre2}</em>}
                </h3>
                <dl className="lib-lectern__meta">
                  <div><dt>Actes</dt><dd>{stats.acts}</dd></div>
                  <div><dt>Mots</dt><dd>{stats.words.toLocaleString('fr-FR')}</dd></div>
                  <div><dt>Lecture</dt><dd>~{stats.minutes} min</dd></div>
                </dl>
                {selected.updatedAt && <p className="lib-lectern__date">Retouché le {fmtDateLong(selected.updatedAt)}</p>}
                <div className="lib-lectern__actions">
                  <button className="scr-btn scr-btn--on" type="button" onClick={() => setReading(selected.id)}>Lire</button>
                </div>
              </>
            ) : (
              <div className="lib-lectern__idle"><span className="lib-lectern__sigil" aria-hidden="true">❧</span><h3>Le pupitre vous attend</h3><p>Sélectionnez un livre pour en commencer la lecture.</p></div>
            )}
          </aside>
        </div>
      )}

      {readingBook && <Reader book={readingBook} onClose={() => setReading(null)} />}
    </section>
  );
}
