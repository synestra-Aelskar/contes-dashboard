import { forwardRef, useEffect, useState } from 'react';
import { uid } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { uploadScreenshot } from '../../lib/board.js';
import { toast } from '../../lib/toast.js';
import { getUiScale, applyUiScale } from '../../lib/prefs.js';

/**
 * Fiche narrative — créateur de narration en défilement continu : un grand
 * titre (avec sa deuxième ligne accentuée), puis des chapitres (numérotés en
 * chiffres romains, calculés automatiquement) contenant des paragraphes, des
 * titres d'emphase, des citations et des images légendées. Même architecture
 * que Fiche Technique (state.fichesNarratives, éditeur plein cadre, lecture
 * forcée hors rôle MJ), esthétique différente — inspirée du prologue « Les
 * Contes Malveillants ».
 */

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const SERIF = "'Spectral', Georgia, serif";
const DISPLAY = "'Cormorant Garamond', Georgia, serif";

const INK = '#e8e2d6';
const INK_SOFT = '#d6cfc0';
const INK_DIM = '#bdb3a1';
const INK_FAINT = '#8c8375';
const BG = '#14110d';
const PANEL = '#1b1710';
const ACCENT = '#9a7330';

const emptyFiche = () => ({ id: uid(), eyebrow: 'PROLOGUE', titre: '', titreAccent: '', blocks: [] });

function emptyBlock(kind) {
  const base = { id: uid(), kind };
  if (kind === 'chapter') return { ...base, titre: '' };
  if (kind === 'image') return { ...base, url: '', caption: '' };
  return { ...base, text: '' };
}

const lighten = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#c9a05a';
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.round(c + (255 - c) * 0.42);
  return '#' + [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
};

function toRoman(n) {
  const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  table.forEach(([v, s]) => { while (n >= v) { out += s; n -= v; } });
  return out || 'I';
}

const ghostBtn = {
  background: 'transparent', border: '1px solid rgba(201,160,90,0.3)', borderRadius: 2,
  color: 'var(--nr-acc-ink)', fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em',
  textTransform: 'uppercase', padding: '8px 12px', cursor: 'pointer'
};
const label = (color = INK_FAINT) => ({ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color });

const AutoTextarea = forwardRef(function AutoTextarea({ value, onChange, readOnly, style, ...rest }, forwardedRef) {
  const setRefs = (el) => {
    el && (el.style.height = 'auto', (el.style.height = el.scrollHeight + 'px'));
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  };
  return (
    <textarea
      ref={setRefs} rows={1} value={value} readOnly={readOnly}
      onChange={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; onChange(e.target.value); }}
      style={{ width: '100%', background: 'transparent', border: 0, outline: 'none', resize: 'none', overflow: 'hidden', font: 'inherit', color: 'inherit', ...style }}
      {...rest}
    />
  );
});

/* ---------- blocs ---------- */

function ChapterMarker({ block, index, read, patch }) {
  const [titre, setTitre, ref] = useSyncedField(block.titre);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, margin: '52px 0 22px' }}>
      <span style={{ ...label('var(--nr-acc-ink)'), fontSize: 13 }}>{toRoman(index + 1)}</span>
      <span style={{ flex: 1, height: 1, background: 'rgba(201,160,90,0.28)' }} />
      <input
        ref={ref} value={titre} readOnly={read} placeholder="Titre du chapitre"
        onChange={(e) => { const v = e.target.value; setTitre(v); patch((b) => { b.titre = v; }); }}
        onBlur={() => patch((b) => { b.titre = titre.trim(); })}
        style={{
          textAlign: 'right', background: 'transparent', border: 0, outline: 'none', width: 240,
          ...label(read ? INK_DIM : 'var(--nr-acc-ink)'), fontSize: 12
        }}
      />
    </div>
  );
}

function HeadingBlock({ block, read, patch }) {
  const [text, setText, ref] = useSyncedField(block.text);
  return (
    <AutoTextarea
      ref={ref} value={text} readOnly={read} placeholder="Phrase d’ouverture, mise en avant…"
      onChange={(v) => { setText(v); patch((b) => { b.text = v; }); }}
      onBlur={() => patch((b) => { b.text = text; })}
      style={{ margin: '18px 0', color: INK, fontFamily: DISPLAY, fontWeight: 500, fontSize: 'clamp(21px,2.6vw,29px)', lineHeight: 1.4 }}
    />
  );
}

function ParagraphBlock({ block, read, patch }) {
  const [text, setText, ref] = useSyncedField(block.text);
  return (
    <AutoTextarea
      ref={ref} value={text} readOnly={read} placeholder="Paragraphe…"
      onChange={(v) => { setText(v); patch((b) => { b.text = v; }); }}
      onBlur={() => patch((b) => { b.text = text; })}
      style={{ margin: '18px 0', color: INK_SOFT, fontFamily: SERIF, fontSize: 17, lineHeight: 1.75 }}
    />
  );
}

function QuoteBlock({ block, read, patch }) {
  const [text, setText, ref] = useSyncedField(block.text);
  return (
    <div style={{ borderLeft: '2px solid var(--nr-acc)', padding: '2px 0 2px 22px', margin: '26px 0' }}>
      <AutoTextarea
        ref={ref} value={text} readOnly={read} placeholder="Citation, réplique, ligne mise en emphase…"
        onChange={(v) => { setText(v); patch((b) => { b.text = v; }); }}
        onBlur={() => patch((b) => { b.text = text; })}
        style={{ color: 'var(--nr-acc-ink)', fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 21, lineHeight: 1.5 }}
      />
    </div>
  );
}

function ImageBlock({ block, read, patch }) {
  const [url, setUrl, urlRef] = useSyncedField(block.url);
  const [caption, setCaption, capRef] = useSyncedField(block.caption);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const u = await uploadScreenshot(file);
      setUrl(u);
      patch((b) => { b.url = u; });
    } catch (_) {
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

  return (
    <figure style={{ margin: '30px 0' }} onPaste={onPaste}>
      {url ? (
        <img src={url} alt={caption || ''} style={{ width: '100%', display: 'block', borderRadius: 3, border: '1px solid rgba(201,160,90,0.18)' }} />
      ) : !read ? (
        <div style={{ padding: '30px 14px', textAlign: 'center', border: '1px dashed rgba(201,160,90,0.3)', borderRadius: 3, color: INK_FAINT, fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em' }}>
          {uploading ? 'ENVOI…' : 'COLLE UNE IMAGE OU COLLE UN LIEN CI-DESSOUS'}
        </div>
      ) : null}
      {!read && (
        <input
          ref={urlRef} value={url} placeholder="https://…" type="text"
          onChange={(e) => { const v = e.target.value; setUrl(v); patch((b) => { b.url = v; }); }}
          onBlur={() => patch((b) => { b.url = url.trim(); })}
          style={{ width: '100%', marginTop: 8, background: 'transparent', border: 0, borderBottom: '1px dashed rgba(201,160,90,0.3)', outline: 'none', padding: '4px 0', color: INK_DIM, fontFamily: MONO, fontSize: 12 }}
        />
      )}
      <figcaption style={{ marginTop: 8 }}>
        <input
          ref={capRef} value={caption} readOnly={read} placeholder="Légende de l’image"
          onChange={(e) => { const v = e.target.value; setCaption(v); patch((b) => { b.caption = v; }); }}
          onBlur={() => patch((b) => { b.caption = caption.trim(); })}
          style={{ width: '100%', textAlign: 'center', background: 'transparent', border: 0, outline: 'none', ...label(), fontSize: 10.5 }}
        />
      </figcaption>
    </figure>
  );
}

const BLOCK_COMPONENTS = { chapter: ChapterMarker, heading: HeadingBlock, paragraph: ParagraphBlock, quote: QuoteBlock, image: ImageBlock };

/* ---------- éditeur d'une fiche narrative ---------- */

export function FicheNarrativeEditor({ fiche, mutate, onBack, onDelete, initialRead, canEdit = true, backLabel = '← Fiches narratives' }) {
  const [eyebrow, setEyebrow, eyebrowRef] = useSyncedField(fiche.eyebrow);
  const [titre, setTitre, titreRef] = useSyncedField(fiche.titre);
  const [titreAccent, setTitreAccent, titreAccentRef] = useSyncedField(fiche.titreAccent);
  const [read, setRead] = useState(canEdit ? !!initialRead : true);
  const blocks = fiche.blocks;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Cet éditeur est en position:fixed plein écran ; sous un zoom CSS ≠ 100%
    // (préférence Taille d'affichage), les clics sur les boutons fixes (×,
    // Retour) atterrissent visuellement décalés de leur vraie cible dans
    // certaines versions de Chromium — on neutralise le zoom pendant que
    // l'éditeur est ouvert et on restaure la préférence en sortant.
    document.documentElement.style.zoom = '1';
    return () => {
      document.body.style.overflow = prev;
      applyUiScale(getUiScale());
    };
  }, []);

  const patchFiche = (fn) => mutate((s) => {
    const f = s.fichesNarratives.find((x) => x.id === fiche.id);
    if (f) fn(f);
  });

  function addBlock(kind) {
    const b = emptyBlock(kind);
    patchFiche((f) => { f.blocks.push(b); });
    requestAnimationFrame(() => {
      document.getElementById('nr-' + b.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function removeBlock(id) {
    if (!window.confirm('Retirer ce bloc ?')) return;
    patchFiche((f) => { f.blocks = f.blocks.filter((b) => b.id !== id); });
  }

  function scrollToFirstChapter() {
    const el = document.getElementById('nr-first-chapter');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  let chapterCount = -1;
  const vars = { '--nr-acc': ACCENT, '--nr-acc-ink': lighten(ACCENT) };
  const cardEdgeGap = 'max(10px, calc((100vw - min(880px, 100vw - 32px)) / 2 - 46px))';

  return (
    <>
      <button
        onClick={onBack} title="Fermer" aria-label="Fermer"
        style={{
          position: 'fixed', top: 22, right: cardEdgeGap, zIndex: 56,
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(20,17,13,0.75)', border: '1px solid rgba(201,160,90,0.35)', borderRadius: '50%',
          color: INK_SOFT, fontSize: 20, lineHeight: 1, cursor: 'pointer'
        }}
      >
        ×
      </button>
      <div style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(8,6,4,0.74)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', padding: '28px 16px', overflowY: 'auto' }}>
        <div style={{ ...vars, width: '100%', maxWidth: 880, height: 'fit-content', margin: 'auto 0', background: `radial-gradient(120% 60% at 50% 0%, #1d1913 0%, ${BG} 60%)`, color: INK, fontFamily: SERIF, WebkitFontSmoothing: 'antialiased', borderRadius: 8, border: '1px solid rgba(201,160,90,0.25)', boxShadow: '0 40px 120px rgba(0,0,0,0.65)', padding: '0 32px 60px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '24px 0 0' }}>
              <button onClick={onBack} style={{ ...ghostBtn, padding: '9px 14px' }}>{backLabel}</button>
              {canEdit && (
                <button onClick={onDelete} style={{ ...ghostBtn, color: '#c9857e', borderColor: 'rgba(201,133,126,0.4)' }}>Supprimer cette fiche</button>
              )}
            </div>

            {/* --- hero --- */}
            <header style={{ padding: '54px 0 60px', textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 30 }}>
                <span style={{ flex: 1, height: 1, background: 'rgba(201,160,90,0.3)' }} />
                <input
                  ref={eyebrowRef} value={eyebrow} readOnly={read} placeholder="ACTE / PROLOGUE"
                  onChange={(e) => { const v = e.target.value; setEyebrow(v); patchFiche((f) => { f.eyebrow = v; }); }}
                  onBlur={() => patchFiche((f) => { f.eyebrow = eyebrow.trim(); })}
                  style={{ textAlign: 'center', width: 220, background: 'transparent', border: 0, outline: 'none', ...label('var(--nr-acc-ink)'), fontSize: 12 }}
                />
                <span style={{ flex: 1, height: 1, background: 'rgba(201,160,90,0.3)' }} />
              </div>
              <input
                ref={titreRef} value={titre} readOnly={read} placeholder="Grand titre"
                onChange={(e) => { const v = e.target.value; setTitre(v); patchFiche((f) => { f.titre = v; }); }}
                onBlur={() => patchFiche((f) => { f.titre = titre.trim(); })}
                style={{ width: '100%', textAlign: 'center', background: 'transparent', border: 0, outline: 'none', color: INK, fontFamily: DISPLAY, fontWeight: 500, fontSize: 'clamp(38px,6vw,58px)', lineHeight: 1.08 }}
              />
              <input
                ref={titreAccentRef} value={titreAccent} readOnly={read} placeholder="…second ligne, accentuée (optionnel)"
                onChange={(e) => { const v = e.target.value; setTitreAccent(v); patchFiche((f) => { f.titreAccent = v; }); }}
                onBlur={() => patchFiche((f) => { f.titreAccent = titreAccent.trim(); })}
                style={{ width: '100%', textAlign: 'center', background: 'transparent', border: 0, outline: 'none', marginTop: 4, color: 'var(--nr-acc-ink)', fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 500, fontSize: 'clamp(38px,6vw,58px)', lineHeight: 1.08 }}
              />
              {blocks.some((b) => b.kind === 'chapter') && (
                <button
                  type="button" onClick={scrollToFirstChapter}
                  style={{ marginTop: 46, background: 'none', border: 0, cursor: 'pointer', ...label(), fontSize: 10 }}
                >
                  Descendre
                  <span style={{ display: 'block', width: 1, height: 26, margin: '10px auto 0', background: 'rgba(201,160,90,0.4)' }} />
                </button>
              )}
            </header>

            {!blocks.length && (
              <p className="empty" style={{ color: INK_DIM, fontFamily: SERIF, margin: '20px 0 40px' }}>
                Aucun bloc pour l’instant — commence par un chapitre, puis ajoute paragraphes, citations et images.
              </p>
            )}

            {blocks.map((b) => {
              const Comp = BLOCK_COMPONENTS[b.kind];
              if (!Comp) return null;
              if (b.kind === 'chapter') chapterCount += 1;
              const patch = (fn) => patchFiche((f) => { const blk = f.blocks.find((x) => x.id === b.id); if (blk) fn(blk); });
              const isFirstChapter = b.kind === 'chapter' && chapterCount === 0;
              return (
                <div key={b.id} id={isFirstChapter ? 'nr-first-chapter' : 'nr-' + b.id} style={{ position: 'relative' }}>
                  <Comp block={b} index={chapterCount} read={read} patch={patch} />
                  {!read && (
                    <button
                      onClick={() => removeBlock(b.id)} title="Retirer ce bloc" aria-label="Retirer ce bloc"
                      style={{ position: 'absolute', right: -30, top: 4, background: 'transparent', border: 0, color: '#6f665a', fontSize: 16, cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}

            {!read && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', padding: '40px 0 6px' }}>
                <button onClick={() => addBlock('chapter')} style={ghostBtn}>＋ chapitre</button>
                <button onClick={() => addBlock('heading')} style={ghostBtn}>＋ titre d’emphase</button>
                <button onClick={() => addBlock('paragraph')} style={ghostBtn}>＋ paragraphe</button>
                <button onClick={() => addBlock('quote')} style={ghostBtn}>＋ citation</button>
                <button onClick={() => addBlock('image')} style={ghostBtn}>＋ image</button>
              </div>
            )}

            {canEdit && blocks.length > 0 && (
              <div style={{ padding: '18px 0 0', display: 'flex', justifyContent: 'center' }}>
                <button onClick={() => setRead((r) => !r)} style={{ ...ghostBtn, color: INK_DIM, fontSize: 11, letterSpacing: '0.18em', padding: '13px 22px' }}>
                  {read ? 'Repasser en édition' : 'En mode lecture'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- vue principale : liste des fiches narratives ---------- */

function DeleteConfirm({ nom, onConfirm, onCancel }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Supprimer « {nom || 'Sans nom'} » ?</h3>
        <p className="modal__lead">Voulez-vous vraiment supprimer cette fiche narrative ? Tout son contenu sera perdu.</p>
        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onCancel}>Non</button>
          <button className="btn-primary btn-primary--stop" type="button" onClick={onConfirm}>Oui, supprimer</button>
        </div>
      </div>
    </div>
  );
}

export default function FicheNarrative({ state, mutate }) {
  const fiches = state.fichesNarratives || [];
  const [openState, setOpenState] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const open = (openState && fiches.find((f) => f.id === openState.id)) || null;
  const toDelete = fiches.find((f) => f.id === deleteId) || null;

  const createFiche = () => {
    const f = emptyFiche();
    mutate((s) => { s.fichesNarratives.push(f); });
    setOpenState({ id: f.id, mode: 'edit' });
  };

  const deleteFiche = (id) => {
    mutate((s) => { s.fichesNarratives = s.fichesNarratives.filter((f) => f.id !== id); });
    setDeleteId(null);
    if (openState && openState.id === id) setOpenState(null);
  };

  if (open) {
    return (
      <>
        <FicheNarrativeEditor
          key={open.id} fiche={open} mutate={mutate}
          initialRead={openState.mode === 'read'}
          onBack={() => setOpenState(null)}
          onDelete={() => setDeleteId(open.id)}
        />
        {toDelete && (
          <DeleteConfirm nom={toDelete.titre.trim()} onConfirm={() => deleteFiche(toDelete.id)} onCancel={() => setDeleteId(null)} />
        )}
      </>
    );
  }

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Créateur de narration<span className="count"> ({fiches.length})</span></h2>
      </div>

      {!fiches.length ? (
        <p className="empty">
          Aucune fiche narrative pour l’instant — prologue, interlude, scène de campagne… Crée-en une :
          grand titre, puis chapitres en défilement avec paragraphes, citations et images légendées.
        </p>
      ) : (
        <div className="fiche-list">
          {fiches.map((f) => (
            <div key={f.id} className="fiche-row">
              <button type="button" className="fiche-row__name" onClick={() => setOpenState({ id: f.id, mode: 'edit' })}>
                {f.titre.trim() || 'Sans titre'}
                <span className="count"> · {f.blocks.filter((b) => b.kind === 'chapter').length} chapitre{f.blocks.filter((b) => b.kind === 'chapter').length > 1 ? 's' : ''}</span>
              </button>
              <div className="fiche-row__group">
                <div className="fiche-row__actions">
                  <button type="button" onClick={() => setOpenState({ id: f.id, mode: 'read' })}>Lecture</button>
                  <button type="button" onClick={() => setOpenState({ id: f.id, mode: 'edit' })}>Édition</button>
                </div>
                <button
                  className="fiche-row__del" type="button" title="Supprimer"
                  aria-label={`Supprimer ${f.titre.trim() || 'cette fiche'}`}
                  onClick={() => setDeleteId(f.id)}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: fiches.length ? 22 : 6 }}>
        <button className="btn-primary" type="button" onClick={createFiche} style={{ fontSize: 13, padding: '16px 30px' }}>
          ＋ Nouvelle fiche narrative
        </button>
      </div>

      {toDelete && (
        <DeleteConfirm nom={toDelete.titre.trim()} onConfirm={() => deleteFiche(toDelete.id)} onCancel={() => setDeleteId(null)} />
      )}
    </section>
  );
}
