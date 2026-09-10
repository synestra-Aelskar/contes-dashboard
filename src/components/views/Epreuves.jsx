import { Fragment, useState } from 'react';
import { uid, lsGet, lsSet } from '../../lib/util.js';
import { toast } from '../../lib/toast.js';
import { uploadScreenshot } from '../../lib/board.js';

function catsOf(state) {
  const out = [];
  (state.epreuves || []).forEach((e) => {
    const c = e.cat || 'Sans lieu';
    if (out.indexOf(c) < 0) out.push(c);
  });
  return out;
}

/* ------------------------------------------------------------------ */

function EpreuveForm({ state, entry, onDone, mutate }) {
  const [cat, setCat] = useState(entry ? entry.cat || '' : lsGet('ccm.epreuveTab') || '');
  const [title, setTitle] = useState(entry ? entry.title || '' : '');
  const [desc, setDesc] = useState(entry ? entry.desc || '' : '');
  const [img, setImg] = useState(entry ? entry.img || '' : '');
  const [success, setSuccess] = useState(entry ? entry.success || '' : '');
  const [fail, setFail] = useState(entry ? entry.fail || '' : '');
  const [checks, setChecks] = useState(
    entry && Array.isArray(entry.checks) && entry.checks.length
      ? entry.checks.map((c) => ({ name: c.name || '', value: c.value || '' }))
      : [{ name: '', value: '' }]
  );
  const [uploading, setUploading] = useState(false);

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadScreenshot(file);
      setImg(url);
      toast('Capture ajoutée');
    } catch (e) {
      toast('Image illisible / envoi impossible');
    } finally {
      setUploading(false);
    }
  }

  function onPaste(ev) {
    const items = (ev.clipboardData && ev.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') === 0) {
        ev.preventDefault();
        handleFile(items[i].getAsFile());
        return;
      }
    }
  }

  function setCheck(i, key, val) {
    setChecks((cs) => cs.map((c, j) => (j === i ? { ...c, [key]: val } : c)));
  }
  function addCheck() { setChecks((cs) => [...cs, { name: '', value: '' }]); }
  function removeCheck(i) {
    setChecks((cs) => {
      const next = cs.filter((_, j) => j !== i);
      return next.length ? next : [{ name: '', value: '' }];
    });
  }

  function save() {
    const t = title.trim();
    if (!t) { toast('Nom de l’épreuve requis'); return; }
    const cleanChecks = checks
      .map((c) => ({ name: (c.name || '').trim(), value: (c.value || '').trim() }))
      .filter((c) => c.name || c.value);
    const c = cat.trim() || 'Sans lieu';
    mutate((s) => {
      if (entry) {
        const e = s.epreuves.find((x) => x.id === entry.id);
        if (e) {
          e.cat = c; e.title = t; e.desc = desc.trim(); e.img = img;
          e.checks = cleanChecks; e.success = success.trim(); e.fail = fail.trim();
        }
      } else {
        s.epreuves.push({
          id: uid(), cat: c, title: t, desc: desc.trim(), img,
          checks: cleanChecks, success: success.trim(), fail: fail.trim()
        });
      }
    });
    lsSet('ccm.epreuveTab', c);
    onDone();
  }

  return (
    <div className="form" onPaste={onPaste}>
      <label className="flabel">
        Lieu
        <input
          className="field" type="text" list="epr-cats"
          placeholder="Lieu (Donjon de la tour, Plaine du silence…)"
          value={cat} onChange={(e) => setCat(e.target.value)}
        />
      </label>
      <datalist id="epr-cats">
        {catsOf(state).filter((x) => x !== 'Sans lieu').map((x) => <option key={x} value={x} />)}
      </datalist>

      <label className="flabel">
        Nom de l’épreuve
        <input
          className="field" type="text" placeholder="Nom de l’épreuve (Ravin glissant…)"
          value={title} onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <div className="flabel">
        <span>Capture d’écran</span>
        <div className="epr-drop" tabIndex={0}>
          <div className="epr-drop__preview">
            {uploading ? (
              <span className="epr-drop__hint">Envoi de l’image…</span>
            ) : img ? (
              <>
                <img className="epr-drop__img" src={img} alt="" />
                <button className="tbtn" type="button" onClick={() => setImg('')}>retirer l’image</button>
              </>
            ) : (
              <>
                <span className="epr-drop__hint">Colle une capture (Ctrl+V / Cmd+V) — ou :</span>
                <input
                  className="epr-drop__file" type="file" accept="image/*"
                  onChange={(e) => handleFile(e.target.files && e.target.files[0])}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <label className="flabel">
        Description
        <textarea
          className="notes notes--sm"
          placeholder="Description : ce que voient les joueur·euses, l’enjeu…"
          value={desc} onChange={(e) => setDesc(e.target.value)}
        />
      </label>

      <div className="flabel">
        <span>Résolutions possibles</span>
        <div className="epr-checks">
          {checks.map((c, i) => (
            <div key={i} className="epr-check">
              <input
                className="field" type="text" placeholder="Compétence (Escalade…)"
                value={c.name} onChange={(e) => setCheck(i, 'name', e.target.value)}
              />
              <input
                className="field" type="text" placeholder="Seuil (20)"
                value={c.value} onChange={(e) => setCheck(i, 'value', e.target.value)}
              />
              <button className="tbtn" type="button" aria-label="retirer cette résolution" onClick={() => removeCheck(i)}>×</button>
            </div>
          ))}
          <button className="tbtn" type="button" onClick={addCheck}>＋ autre résolution</button>
        </div>
      </div>

      <label className="flabel">
        En cas de réussite
        <textarea
          className="notes notes--sm" placeholder="Ce qui se passe si l’épreuve est réussie…"
          value={success} onChange={(e) => setSuccess(e.target.value)}
        />
      </label>
      <label className="flabel">
        En cas d’échec
        <textarea
          className="notes notes--sm" placeholder="Ce qui se passe en cas d’échec…"
          value={fail} onChange={(e) => setFail(e.target.value)}
        />
      </label>

      <div className="form__actions">
        <button className="btn-primary" type="button" onClick={save} disabled={uploading}>
          {entry ? 'Enregistrer' : 'Ajouter'}
        </button>
        <button className="tbtn" type="button" onClick={onDone}>annuler</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EpreuveCard({ e, mutate, onEdit }) {
  return (
    <div className="card epr-card">
      <span className="card__label">{e.cat || 'Sans lieu'}</span>
      {e.img && (
        <a className="epr-card__imglink" href={e.img} target="_blank" rel="noopener noreferrer">
          <img className="epr-card__img" src={e.img} alt={e.title || ''} />
        </a>
      )}
      <h3 className="epr-card__title">{e.title || '—'}</h3>
      {e.desc && <p className="card__text">{e.desc}</p>}

      {Array.isArray(e.checks) && e.checks.length > 0 && (
        <div className="epr-card__checks">
          {e.checks.map((ck, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="epr-card__or">ou</span>}
              <span className="epr-chip">
                <span className="epr-chip__name">{ck.name || '—'}</span>
                {ck.value && <span className="epr-chip__val">{ck.value}</span>}
              </span>
            </Fragment>
          ))}
        </div>
      )}

      {(e.success || e.fail) && (
        <div className="epr-card__outcomes">
          {e.success && (
            <div className="epr-outcome epr-outcome--ok">
              <span className="epr-outcome__lbl">En cas de réussite</span>
              <p className="epr-outcome__txt">{e.success}</p>
            </div>
          )}
          {e.fail && (
            <div className="epr-outcome epr-outcome--ko">
              <span className="epr-outcome__lbl">En cas d’échec</span>
              <p className="epr-outcome__txt">{e.fail}</p>
            </div>
          )}
        </div>
      )}

      <div className="card__actions">
        <button className="tbtn" type="button" onClick={onEdit}>modifier</button>
        <button
          className="tbtn" type="button"
          onClick={() => {
            if (!window.confirm('Retirer « ' + (e.title || '') + ' » ?')) return;
            mutate((s) => { s.epreuves = s.epreuves.filter((x) => x.id !== e.id); });
          }}
        >
          retirer
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function Epreuves({ state, mutate }) {
  const epreuves = state.epreuves || [];
  const [openId, setOpenId] = useState(undefined); // undefined | null (ajout) | id (edit)
  const [tab, setTab] = useState(lsGet('ccm.epreuveTab'));
  const adding = openId === null;

  const cats = catsOf(state);
  const current = tab && cats.indexOf(tab) >= 0 ? tab : cats[0];

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Épreuves &amp; infos<span className="count"> ({epreuves.length})</span></h2>
        <button className="tbtn" type="button" onClick={() => setOpenId(adding ? undefined : null)}>
          {adding ? '✕ fermer' : '＋ nouvelle épreuve'}
        </button>
      </div>

      {adding && (
        <EpreuveForm state={state} entry={null} onDone={() => setOpenId(undefined)} mutate={mutate} />
      )}

      {!epreuves.length ? (
        !adding && (
          <p className="empty">
            Consigne les obstacles et infos de terrain, rangés par lieu. Une capture d’écran
            (colle-la directement), une description, autant de façons de résoudre que tu veux, et
            les issues en cas de réussite / d’échec.
          </p>
        )
      ) : (
        <>
          {(cats.length > 1 || cats[0] !== 'Sans lieu') && (
            <div className="tabs" role="tablist">
              {cats.map((c) => {
                const n = epreuves.filter((e) => (e.cat || 'Sans lieu') === c).length;
                return (
                  <button
                    key={c} type="button" role="tab" className="tab" aria-selected={c === current}
                    onClick={() => { setTab(c); lsSet('ccm.epreuveTab', c); }}
                  >
                    {c}<b>{n}</b>
                  </button>
                );
              })}
            </div>
          )}
          <div className="cards">
            {epreuves
              .filter((e) => (e.cat || 'Sans lieu') === current)
              .map((e) =>
                openId === e.id ? (
                  <EpreuveForm
                    key={e.id} state={state} entry={e}
                    onDone={() => setOpenId(undefined)} mutate={mutate}
                  />
                ) : (
                  <EpreuveCard key={e.id} e={e} mutate={mutate} onEdit={() => setOpenId(e.id)} />
                )
              )}
          </div>
        </>
      )}
    </section>
  );
}
