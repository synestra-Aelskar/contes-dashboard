import BookCover from '../BookCover.jsx';
import { coverAppearance } from '../../lib/documentAppearance.js';
import { useEffect, useState } from 'react';
import { uid, lsGet, lsSet, fmtDateLong } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { storyHTML } from '../../lib/scriptorium.js';
import { newBook, bookTitle, bindingIndex, spineWidth, bookStats, idVariant } from '../../lib/bibliotheque.js';

/* Bibliothèque — les récits rangés comme des livres sur des étagères
 * (state.bibliotheque, partagé). On y crée/renomme/retire les étagères,
 * on déplace les livres par glisser-déposer, on les lit, et on les ouvre
 * dans le Scriptorium (outil d'édition) pour les écrire. */
const SEL_KEY = 'ccm.bibliotheque.sel';
const DRAG_TYPE = 'text/x-ccm-book';

function ShelfName({ shelf, mutate, readOnly }) {
  const [name, setName, ref] = useSyncedField(shelf.name);
  const patch = (fn) => mutate((s) => { const x = s.bibliotheque.shelves.find((y) => y.id === shelf.id); if (x) fn(x); });
  return (
    <input
      ref={ref} className="lib-plaque" value={name} placeholder="Étagère sans nom" readOnly={readOnly}
      aria-label="Nom de l'étagère"
      onChange={(e) => { const v = e.target.value; setName(v); patch((x) => { x.name = v; }); }}
      onBlur={() => patch((x) => { x.name = name.trim(); })}
    />
  );
}

function Spine({ book, selected, canEdit, onSelect, onDropBefore, lying }) {
  const [over, setOver] = useState(false);
  const { document: doc, kind, material } = coverAppearance(book.document);
  const cls = 'lib-book lib-book--c' + bindingIndex(book.id)
    + ' lib-book--format-' + kind + ' scr-material--' + material
    + ' lib-book--v' + idVariant(book.id + ':ornament', 6)
    + (lying ? ' lib-book--lying' : ' lib-book--h' + idVariant(book.id, 4))
    + (!lying && idVariant(book.id + '~', 9) === 0 ? ' lib-book--lean' : '')
    + (selected ? ' is-selected' : '') + (over ? ' is-dropbefore' : '');
  return (
    <button
      type="button" className={cls} style={{ '--w': spineWidth(book) + 'px' }}
      title={bookTitle(book)} aria-pressed={selected} draggable={canEdit}
      onClick={onSelect}
      onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, book.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(e) => { if (canEdit && e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(DRAG_TYPE);
        setOver(false);
        if (!id) return;
        e.preventDefault(); e.stopPropagation();
        if (id !== book.id) onDropBefore(id);
      }}
    >
      <span className="lib-book__ornament" aria-hidden="true">{kind === 'dossier' ? '§' : kind === 'tablet' ? '◇' : kind === 'folio' ? '❧' : ['✦', '❧', '◇', '☽', '✧', '❦'][idVariant(book.id + ':ornament', 6)]}</span>
      <span className="lib-book__title">{bookTitle(book)}</span>
      <span className="lib-book__foot" aria-hidden="true">{doc.reference || '◆'}</span>
    </button>
  );
}

function Reader({ book, onClose }) {
  const { kind } = coverAppearance(book.document);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal lib-reader" role="dialog" aria-modal="true" aria-label={'Lecture : ' + bookTitle(book)} onClick={onClose}>
      <div className="lib-reader__card" onClick={(e) => e.stopPropagation()}>
        <div className={'lib-reader__opening lib-reader__opening--' + kind + ' lib-book--c' + bindingIndex(book.id)} aria-hidden="true">
          <div className="lib-reader__volume">
            <div className="lib-reader__pages"><span>✦</span></div>
            <div className="lib-reader__leaf" />
            <BookCover book={book} className="lib-reader__cover" />
          </div>
        </div>
        <div className="lib-reader__bar">
          <span className="lib-reader__title">{bookTitle(book)}</span>
          <button className="scr-btn" type="button" onClick={onClose}>Refermer le livre</button>
        </div>
        <iframe className="lib-reader__frame" title={'Lecture : ' + bookTitle(book)} srcDoc={storyHTML(book, false)} />
      </div>
    </div>
  );
}

export default function Bibliotheque({ state, mutate, setView, canEdit }) {
  const lib = state.bibliotheque;
  const [selId, setSelIdRaw] = useState(() => lsGet(SEL_KEY) || '');
  const [reading, setReading] = useState(null);
  const [newShelf, setNewShelf] = useState('');
  const [dropShelf, setDropShelf] = useState(null);
  const [query, setQuery] = useState('');
  const matches = (book) => [bookTitle(book), book.surtitre, book.document?.reference, book.document?.author, book.document?.institution].filter(Boolean).join(' ').toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr'));
  const setSelId = (id) => { setSelIdRaw(id); lsSet(SEL_KEY, id); };

  const selected = lib.books.find((b) => b.id === selId) || null;
  const readingBook = reading && lib.books.find((b) => b.id === reading);
  const shelfIds = new Set(lib.shelves.map((s) => s.id));
  const loose = lib.books.filter((b) => !shelfIds.has(b.shelfId) && matches(b));

  /** Range le livre `id` sur `shelfId`, juste avant `beforeId` (ou en bout d'étagère). */
  function placeBook(id, shelfId, beforeId) {
    mutate((s) => {
      const books = s.bibliotheque.books;
      const i = books.findIndex((b) => b.id === id);
      if (i < 0) return;
      const [bk] = books.splice(i, 1);
      bk.shelfId = shelfId;
      let j = beforeId ? books.findIndex((b) => b.id === beforeId) : -1;
      if (j < 0) {
        let last = -1;
        books.forEach((b, k) => { if (b.shelfId === shelfId) last = k; });
        j = last < 0 ? books.length : last + 1;
      }
      books.splice(j, 0, bk);
    });
  }
  function openInScriptorium(id) {
    lsSet('ccm.scriptorium.book', id);
    if (setView) setView('scriptorium');
  }
  function writeOn(shelf) {
    const nb = newBook(shelf);
    mutate((s) => { s.bibliotheque.books.push(nb); });
    openInScriptorium(nb.id);
  }
  function addShelf(e) {
    e.preventDefault();
    const shelf = { id: uid(), name: newShelf.trim() || 'Nouvelle étagère' };
    mutate((s) => { s.bibliotheque.shelves.push(shelf); });
    setNewShelf('');
  }
  function moveShelf(id, dir) {
    mutate((s) => {
      const arr = s.bibliotheque.shelves;
      const i = arr.findIndex((x) => x.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    });
  }
  function removeShelf(shelf, count) {
    const label = shelf.name.trim() || 'sans nom';
    const msg = count
      ? `Retirer l'étagère « ${label} » ? Ses ${count} livre${count > 1 ? 's' : ''} iront sur la pile des non rangés.`
      : `Retirer l'étagère « ${label} » ?`;
    if (!window.confirm(msg)) return;
    mutate((s) => {
      s.bibliotheque.shelves = s.bibliotheque.shelves.filter((x) => x.id !== shelf.id);
      s.bibliotheque.books.forEach((b) => { if (b.shelfId === shelf.id) b.shelfId = null; });
    });
  }
  function deleteBook(b) {
    if (!window.confirm(`Brûler « ${bookTitle(b)} » ? Le récit sera définitivement supprimé.`)) return;
    mutate((s) => { s.bibliotheque.books = s.bibliotheque.books.filter((x) => x.id !== b.id); });
    setSelId('');
  }

  const rowDrop = (shelfId) => ({
    onDragOver: (e) => { if (canEdit && e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setDropShelf(shelfId); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropShelf(null); },
    onDrop: (e) => {
      const id = e.dataTransfer.getData(DRAG_TYPE);
      setDropShelf(null);
      if (!id) return;
      e.preventDefault();
      placeBook(id, shelfId, null);
    }
  });
  const spine = (b, shelfId, lying) => (
    <Spine
      key={b.id} book={b} lying={lying} canEdit={canEdit} selected={b.id === selId}
      onSelect={() => setSelId(b.id === selId ? '' : b.id)}
      onDropBefore={(id) => placeBook(id, shelfId, b.id)}
    />
  );

  const stats = selected ? bookStats(selected) : null;
  const total = lib.books.length;

  return (
    <section className="chapter lib">
      <div className="lib__hero">
        <div><p className="lib__eyebrow">Les archives du Repaire</p><h2>Bibliothèque</h2>
          <p className="lib__intro">Chaque reliure renferme une histoire. Laquelle ouvrirez-vous ?</p></div>
        {canEdit && <button className="scr-btn scr-btn--on" type="button" onClick={() => writeOn(null)}>+ Nouveau récit</button>}
      </div>
      <div className="lib__toolbar">
        <span className="lib__inventory">{total} récit{total > 1 ? 's' : ''} <span aria-hidden="true"> / </span> {lib.shelves.length} étagère{lib.shelves.length > 1 ? 's' : ''}</span>
        <input type="search" className="finput lib__search" aria-label="Rechercher un récit" placeholder="Rechercher un récit…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {query.trim() && !lib.books.some(matches) && <p role="status" className="lib__noresult">Aucun récit ne correspond à « {query} ».</p>}

      <div className="lib__layout">
        <div className="lib__case">
          {lib.shelves.map((shelf, i) => {
            const allBooks = lib.books.filter((b) => b.shelfId === shelf.id);
            const books = allBooks.filter(matches);
            if (query.trim() && !books.length) return null;
            return (
              <section key={shelf.id} className="lib-shelf">
                <header className="lib-shelf__head">
                  <span className="lib-shelf__number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <ShelfName shelf={shelf} mutate={mutate} readOnly={!canEdit} />
                  <span className="lib-shelf__count">{books.length} livre{books.length > 1 ? 's' : ''}</span>
                  {canEdit && (
                    <span className="lib-shelf__tools">
                      <button className="tbtn" type="button" onClick={() => writeOn(shelf)}>+ Écrire ici</button>
                      <span className="scr-tools">
                        <button type="button" title="Monter l'étagère" aria-label="Monter l'étagère" disabled={i === 0} onClick={() => moveShelf(shelf.id, -1)}>↑</button>
                        <button type="button" title="Descendre l'étagère" aria-label="Descendre l'étagère" disabled={i === lib.shelves.length - 1} onClick={() => moveShelf(shelf.id, 1)}>↓</button>
                        <button type="button" className="scr-tools__del" title="Retirer l'étagère" aria-label="Retirer l'étagère" onClick={() => removeShelf(shelf, allBooks.length)}>×</button>
                      </span>
                    </span>
                  )}
                </header>
                <div className={'lib-shelf__row' + (dropShelf === shelf.id ? ' is-dropping' : '')} {...rowDrop(shelf.id)}>
                  <span className="lib-bookend" aria-hidden="true" />
                  {books.map((b) => spine(b, shelf.id, false))}
                  {!books.length && <span className="lib-shelf__empty">{canEdit ? 'Étagère vide — glissez-y un livre' : 'Étagère vide'}</span>}
                  <span className="lib-bookend lib-bookend--r" aria-hidden="true" />
                </div>
              </section>
            );
          })}

          {loose.length > 0 && (
            <section className="lib-pile">
              <header className="lib-shelf__head">
                <span className="lib-pile__label">Pile des non rangés</span>
                <span className="lib-shelf__count">{loose.length} livre{loose.length > 1 ? 's' : ''}</span>
              </header>
              <div className="lib-pile__stack">{loose.map((b) => spine(b, null, true))}</div>
            </section>
          )}

          {canEdit && (
            <form className="lib-newshelf" onSubmit={addShelf}>
              <input className="finput" aria-label="Nom de la nouvelle étagère" value={newShelf} placeholder="Nom de la nouvelle étagère (ex. Contes d'hiver)" onChange={(e) => setNewShelf(e.target.value)} />
              <button className="scr-btn" type="submit">+ Ajouter une étagère</button>
            </form>
          )}
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
              {(selected.document?.reference || selected.document?.author) && <p className="lib-lectern__identity">
                {selected.document.reference && <span>Document numéro {selected.document.reference}</span>}
                {selected.document.author && <span>Par {selected.document.author}</span>}
              </p>}
              <dl className="lib-lectern__meta">
                <div><dt>Actes</dt><dd>{stats.acts}</dd></div>
                <div><dt>Mots</dt><dd>{stats.words.toLocaleString('fr-FR')}</dd></div>
                <div><dt>Lecture</dt><dd>~{stats.minutes} min</dd></div>
              </dl>
              {selected.updatedAt && <p className="lib-lectern__date">Retouché le {fmtDateLong(selected.updatedAt)}</p>}
              <div className="lib-lectern__actions">
                <button className="scr-btn scr-btn--on" type="button" onClick={() => setReading(selected.id)}>Lire</button>
                {canEdit && <button className="scr-btn" type="button" onClick={() => openInScriptorium(selected.id)}>Ouvrir au Scriptorium</button>}
              </div>
              {canEdit && (
                <>
                  <label className="scr-fld">
                    <span className="scr-lbl">Ranger sur</span>
                    <select className="finput" value={shelfIds.has(selected.shelfId) ? selected.shelfId : ''} onChange={(e) => placeBook(selected.id, e.target.value || null, null)}>
                      {lib.shelves.map((s) => <option key={s.id} value={s.id}>{s.name || 'Sans nom'}</option>)}
                      <option value="">Pile des non rangés</option>
                    </select>
                  </label>
                  <button className="tbtn lib-lectern__burn" type="button" onClick={() => deleteBook(selected)}>Brûler ce récit</button>
                </>
              )}
            </>
          ) : (
            <div className="lib-lectern__idle"><span className="lib-lectern__sigil" aria-hidden="true">❧</span><h3>Le pupitre vous attend</h3><p>Sélectionnez un livre pour découvrir son récit et en commencer la lecture.</p></div>
          )}
        </aside>
      </div>

      {readingBook && <Reader book={readingBook} onClose={() => setReading(null)} />}
    </section>
  );
}
