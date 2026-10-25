import { useRef, useState } from 'react';
import { scanVault, prepareImport } from '../lib/wikiImport.js';
import { uploadScreenshot } from '../lib/board.js';

/* Importer un vault Obsidian : on choisit le dossier, on voit ce qui sera pris
 * (dossiers cochables), puis notes et images partent en une fois. Les images
 * déjà envoyées lors d'un import précédent ne sont pas renvoyées. */

const CONCURRENCY = 3;

export default function WikiImportModal({ wiki, onClose }) {
  const input = useRef(null);
  const [scan, setScan] = useState(null);
  const [checked, setChecked] = useState([]);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState([]);
  const [done, setDone] = useState(false);

  const say = (line) => setLog((l) => [...l, line]);
  const prep = scan ? prepareImport(scan, checked) : null;

  async function onPick(e) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setBusy('Lecture du dossier…');
    try {
      const s = await scanVault(files);
      setScan(s);
      setChecked(s.folders.filter((f) => f.checked).map((f) => f.name));
    } finally { setBusy(''); }
  }

  async function run() {
    if (!prep) return;
    setLog([]);
    try {
      setBusy('Notes…');
      const { written, skipped } = await wiki.importNotes(prep.notes, { overwrite }, (n, total) => setBusy(`Notes… ${n} / ${total}`));
      say(`${written} note${written > 1 ? 's' : ''} importée${written > 1 ? 's' : ''}` + (skipped ? `, ${skipped} déjà présente${skipped > 1 ? 's' : ''} (conservée${skipped > 1 ? 's' : ''})` : '') + '.');

      const todo = prep.found.filter((k) => !wiki.media[k]);
      const files = {}; let failed = 0; let n = 0;
      const queue = todo.slice();
      const worker = async () => {
        while (queue.length) {
          const key = queue.shift();
          try { files[key] = await uploadScreenshot(scan.images.get(key)); } catch (_) { failed++; }
          n++; setBusy(`Images… ${n} / ${todo.length}`);
        }
      };
      if (todo.length) {
        setBusy(`Images… 0 / ${todo.length}`);
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
        if (Object.keys(files).length) await wiki.addMedia(files);
      }
      say(`${Object.keys(files).length} image${Object.keys(files).length > 1 ? 's' : ''} envoyée${Object.keys(files).length > 1 ? 's' : ''}` + (prep.found.length - todo.length ? `, ${prep.found.length - todo.length} déjà en ligne` : '') + (failed ? `, ${failed} en échec` : '') + '.');
      if (prep.missing.length) say(`Introuvables dans le dossier : ${prep.missing.join(', ')}.`);
      setDone(true);
    } catch (e) {
      say('Échec : ' + ((e && e.message) || 'erreur inconnue') + ' — relancer l’import reprend sans doublon.');
    } finally { setBusy(''); }
  }

  const toggle = (name) => setChecked((c) => (c.includes(name) ? c.filter((x) => x !== name) : [...c, name]));

  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={busy ? undefined : onClose}>
      <div className="modal__card wiki-import" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Importer un vault Obsidian</h3>
        <p className="modal__note">
          Choisis le dossier du vault (celui qui contient <code>.obsidian</code>). Les notes gardent leur Markdown et
          leurs propriétés tels quels ; seules les images réellement utilisées sont envoyées.
        </p>

        <input
          ref={input} type="file" webkitdirectory="" directory="" multiple hidden onChange={onPick}
        />
        <button className="tbtn" type="button" disabled={!!busy} onClick={() => input.current && input.current.click()}>
          {scan ? 'Choisir un autre dossier' : 'Choisir le dossier du vault…'}
        </button>

        {scan && prep && (
          <>
            <div className="wiki-import__folders">
              <span className="card__label">Dossiers à importer</span>
              {scan.folders.map((f) => (
                <label key={f.name} className="secret-modal__row">
                  <input type="checkbox" checked={checked.includes(f.name)} onChange={() => toggle(f.name)} disabled={!!busy} />
                  <span>{f.name}</span>
                  <span className="chr__muted">{f.count} note{f.count > 1 ? 's' : ''}{f.empty ? ` · ${f.empty} vide${f.empty > 1 ? 's' : ''}` : ''}</span>
                </label>
              ))}
              <p className="chr__muted">Les dossiers « X - … » (templates, assets) et les notes « Nouveau dossier » / « Sans titre » sont toujours écartés.</p>
            </div>

            <div className="wiki-import__sum">
              <b>{prep.stats.notes}</b> notes ({prep.stats.empty} vides à écrire) · <b>{prep.stats.images}</b> images · {prep.stats.kb} Ko de texte
              {prep.stats.missing > 0 && <> · <span className="wiki-import__warn">{prep.stats.missing} image(s) introuvable(s)</span></>}
              {prep.strip && <div className="chr__muted">Le dossier « {prep.strip.slice(0, -1)} » est retiré des chemins.</div>}
            </div>

            <label className="secret-modal__row">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} disabled={!!busy} />
              <span>Remplacer les notes déjà présentes (sinon elles sont conservées, avec leurs modifications)</span>
            </label>
          </>
        )}

        {busy && <p className="wiki-import__busy">{busy}</p>}
        {log.length > 0 && <ul className="wiki-import__log">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}

        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onClose} disabled={!!busy}>{done ? 'fermer' : 'annuler'}</button>
          {prep && !done && (
            <button className="btn-primary" type="button" onClick={run} disabled={!!busy || !prep.stats.notes}>
              Importer {prep.stats.notes} notes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
