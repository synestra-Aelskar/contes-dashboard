import { useState } from 'react';
import { WIKI_TEMPLATES } from '../lib/wikiTemplates.js';

/* Création d'une note : nom, dossier (existant ou nouveau) et modèle de départ. */

export default function WikiNewNote({ folders, initialFolder = '', initialName = '', onCreate, onClose }) {
  const [name, setName] = useState(initialName);
  const [folder, setFolder] = useState(initialFolder);
  const [tpl, setTpl] = useState('vide');
  const ok = name.replace(/[\\/:*?"<>|]/g, ' ').trim().length > 0;

  function submit(e) {
    e.preventDefault();
    if (ok) onCreate({ name, folder: folder.replace(/^\/+|\/+$/g, '').trim(), template: WIKI_TEMPLATES.find((t) => t.id === tpl) });
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <form className="modal__card wiki-import" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 className="modal__title">Nouvelle note</h3>
        <label className="flabel">
          Nom
          <input className="finput" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la note" />
        </label>
        <label className="flabel">
          Dossier
          <input className="finput" list="wiki-folders" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="(racine) — ou un nouveau dossier" />
          <datalist id="wiki-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
        </label>
        <div className="wiki-tpls" role="radiogroup" aria-label="Modèle">
          {WIKI_TEMPLATES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tpl === t.id} className={'wiki-tpl' + (tpl === t.id ? ' is-on' : '')} onClick={() => setTpl(t.id)}>
              <b>{t.label}</b><span>{t.desc}</span>
            </button>
          ))}
        </div>
        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onClose}>Annuler</button>
          <button className="btn-primary" type="submit" disabled={!ok}>Créer</button>
        </div>
      </form>
    </div>
  );
}
