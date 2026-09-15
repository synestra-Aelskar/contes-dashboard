import { forwardRef, useEffect, useState } from 'react';
import { uid } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';

/**
 * Fiche Technique — créateur de documents à blocs (PNJ, lieu, créature, règle
 * spéciale, ce que tu veux). Anciennement le créateur « Session Zéro » à
 * document unique ; il gère maintenant une liste de fiches (state.fichesTechniques),
 * chacune avec son nom et ses blocs, créées/éditées/supprimées librement.
 * Contenu partagé, synchronisé en temps réel comme le reste du tableau de
 * bord. Le mode lecture et la modale H.S. restent des préférences
 * d'affichage locales à chaque personne.
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

const LEADERS = ['Mène : MJ A', 'Mène : MJ B', 'Mènent : MJ A + MJ B'];
const ACCENT = '#7a5c2e';

const emptyBlock = (leader) => ({
  id: uid(),
  titre: '',
  objectif: '',
  script: '',
  limite: '',
  meneur: leader,
  points: [{ id: uid(), t: '', on: false }],
  parking: []
});

const emptyFiche = () => ({ id: uid(), nom: '', sousTitre: '', blocks: [] });

const lighten = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#c9a05a';
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.round(c + (255 - c) * 0.42);
  return (
    '#' +
    [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
};

const num = (i) => String(i).padStart(2, '0');

/* ---------- primitives ---------- */

const AutoTextarea = forwardRef(function AutoTextarea({ value, onChange, readOnly, style, ...rest }, forwardedRef) {
  const setRefs = (el) => {
    el && (el.style.height = 'auto', (el.style.height = el.scrollHeight + 'px'));
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  };
  return (
    <textarea
      ref={setRefs}
      rows={1}
      value={value}
      readOnly={readOnly}
      onChange={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; onChange(e.target.value); }}
      style={{
        width: '100%',
        background: 'transparent',
        border: 0,
        outline: 'none',
        resize: 'none',
        overflow: 'hidden',
        font: 'inherit',
        color: 'inherit',
        ...style
      }}
      {...rest}
    />
  );
});

function Checkbox({ on, onToggle, size = 17, title }) {
  return (
    <span
      role="checkbox"
      aria-checked={on}
      title={title}
      onClick={onToggle}
      style={{
        flex: '0 0 auto',
        width: size,
        height: size,
        marginTop: 5,
        border: '1.5px solid var(--sz-acc)',
        borderRadius: 2,
        cursor: 'pointer',
        background: on ? 'var(--sz-acc-ink)' : 'transparent',
        borderColor: on ? 'var(--sz-acc-ink)' : 'var(--sz-acc)',
        boxShadow: on ? `inset 0 0 0 3px ${BG}` : 'none'
      }}
    />
  );
}

const ghostBtn = {
  background: 'transparent',
  border: '1px solid rgba(201,160,90,0.3)',
  borderRadius: 2,
  color: 'var(--sz-acc-ink)',
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  padding: '8px 12px',
  cursor: 'pointer'
};

const label = (color = INK_FAINT) => ({
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color
});

function Rule({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0' }}>
      <span style={{ flex: 1, height: 1, background: 'rgba(201,160,90,0.22)' }} />
      <span style={{ ...label('#6f665a'), fontSize: 10.5, letterSpacing: '0.2em' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'rgba(201,160,90,0.22)' }} />
    </div>
  );
}

/* ---------- ligne (point / question de parking) ---------- */

function ZeroRow({ blockId, listKey, row, mutate, read, size, font, placeholder }) {
  const [text, setText, textRef] = useSyncedField(row.t);
  const findBlock = (s) => {
    const f = s.fichesTechniques.find((x) => x.blocks.some((b) => b.id === blockId));
    return f && f.blocks.find((x) => x.id === blockId);
  };
  const patchRow = (fn) =>
    mutate((s) => {
      const b = findBlock(s);
      const r = b && b[listKey].find((y) => y.id === row.id);
      if (r) fn(r);
    });
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
      <Checkbox on={row.on} size={size} onToggle={() => patchRow((r) => { r.on = !r.on; })} />
      <AutoTextarea
        ref={textRef}
        value={text}
        readOnly={read}
        placeholder={placeholder}
        onChange={(v) => { setText(v); patchRow((r) => { r.t = v; }); }}
        onBlur={() => patchRow((r) => { r.t = text; })}
        style={{ ...font, opacity: row.on ? 0.4 : 1, textDecoration: row.on ? 'line-through' : 'none' }}
      />
      {!read && (
        <button
          onClick={() => mutate((s) => {
            const b = findBlock(s);
            if (b) b[listKey] = b[listKey].filter((y) => y.id !== row.id);
          })}
          title="Supprimer"
          style={{ background: 'transparent', border: 0, color: '#5d564b', fontSize: 16, cursor: 'pointer', padding: '3px 2px' }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ---------- modale question H.S. ---------- */

function HSModal({ blocks, defaultTarget, onSend, onClose }) {
  const [target, setTarget] = useState(defaultTarget);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');

  const send = () => {
    const q = text.trim();
    if (!q) return;
    onSend(target, q);
    const i = blocks.findIndex((b) => b.id === target);
    setText('');
    setNote('→ parking bloc ' + num(i));
    setTimeout(onClose, 1100);
  };

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24, background: 'rgba(8,6,4,0.74)', backdropFilter: 'blur(4px)'
      }}
    >
      <div style={{ width: '100%', maxWidth: 560, background: PANEL, border: '1px solid rgba(201,160,90,0.32)', borderRadius: 4, padding: 34, boxShadow: '0 30px 90px rgba(0,0,0,0.6)' }}>
        <div style={{ ...label('var(--sz-acc-ink)'), letterSpacing: '0.2em', marginBottom: 10 }}>Question hors sujet</div>
        <p style={{ margin: '0 0 26px', fontFamily: DISPLAY, fontSize: 27, lineHeight: 1.25, color: '#f2ead9' }}>
          On la note, on ne la traite pas maintenant.
        </p>

        <div style={{ ...label(), fontSize: 10.5, letterSpacing: '0.14em', marginBottom: 8 }}>Bloc concerné</div>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          style={{ width: '100%', background: BG, border: '1px solid rgba(201,160,90,0.3)', borderRadius: 2, color: INK, fontFamily: SERIF, fontSize: 16, padding: '11px 12px', marginBottom: 20, outline: 'none', cursor: 'pointer' }}
        >
          {blocks.map((b, i) => (
            <option key={b.id} value={b.id}>{`Bloc ${num(i)} — ${b.titre.trim() || 'sans nom'}`}</option>
          ))}
        </select>

        <div style={{ ...label(), fontSize: 10.5, letterSpacing: '0.14em', marginBottom: 8 }}>La question</div>
        <textarea
          rows={3}
          autoFocus
          value={text}
          placeholder="Une ligne suffit…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
          }}
          style={{ width: '100%', background: 'rgba(232,226,214,0.04)', border: '1px solid rgba(201,160,90,0.25)', borderRadius: 2, color: INK, fontFamily: SERIF, fontSize: 17, lineHeight: 1.55, padding: 12, resize: 'vertical', outline: 'none' }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center' }}>
          <button onClick={send} style={{ ...ghostBtn, background: 'var(--sz-acc-ink)', borderColor: 'var(--sz-acc-ink)', color: BG, padding: '11px 18px' }}>
            Valider
          </button>
          <button onClick={onClose} style={{ ...ghostBtn, color: INK_FAINT, padding: '11px 18px' }}>Annuler</button>
          <span style={{ ...label('var(--sz-acc-ink)'), marginLeft: 'auto', fontSize: 10.5, letterSpacing: '0.1em' }}>{note}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- un bloc ---------- */

function Block({ block, index, total, read, mutate, onRemove, onAskHS }) {
  const [titre, setTitre, titreRef] = useSyncedField(block.titre);
  const [objectif, setObjectif, objectifRef] = useSyncedField(block.objectif);
  const [script, setScript, scriptRef] = useSyncedField(block.script);
  const [limite, setLimite, limiteRef] = useSyncedField(block.limite);

  const patch = (fn) => mutate((s) => {
    const f = s.fichesTechniques.find((x) => x.blocks.some((b) => b.id === block.id));
    const b = f && f.blocks.find((x) => x.id === block.id);
    if (b) fn(b);
  });

  const addRow = (listKey) => patch((b) => { b[listKey].push({ id: uid(), t: '', on: false }); });

  return (
    <>
      <article id={`bloc-${block.id}`} style={{ padding: '52px 0 44px', scrollMarginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ ...label('var(--sz-acc-ink)'), fontSize: 12, letterSpacing: '0.18em' }}>BLOC {num(index)}</span>
          <select
            value={block.meneur}
            disabled={read}
            onChange={(e) => patch((b) => { b.meneur = e.target.value; })}
            style={{ ...label(BG), background: 'var(--sz-acc-ink)', border: 0, padding: '5px 9px', borderRadius: 2, cursor: read ? 'default' : 'pointer', appearance: read ? 'none' : undefined, letterSpacing: '0.14em' }}
          >
            {LEADERS.map((l) => <option key={l}>{l}</option>)}
          </select>
          {!read && total > 1 && (
            <button onClick={onRemove} title="Supprimer ce bloc" style={{ marginLeft: 'auto', background: 'transparent', border: 0, color: '#6f665a', fontSize: 20, cursor: 'pointer', padding: '2px 4px' }}>
              ×
            </button>
          )}
        </div>

        <input
          ref={titreRef}
          value={titre}
          readOnly={read}
          placeholder="Entrer un nom"
          onChange={(e) => { const v = e.target.value; setTitre(v); patch((b) => { b.titre = v; }); }}
          onBlur={() => patch((b) => { b.titre = titre.trim(); })}
          style={{ width: '100%', background: 'transparent', border: 0, borderBottom: read ? '1px solid rgba(201,160,90,0.18)' : '1px dashed rgba(201,160,90,0.3)', padding: '0 0 10px', color: INK, fontFamily: DISPLAY, fontWeight: 600, fontSize: 'clamp(30px,4.6vw,46px)', lineHeight: 1.1, outline: 'none' }}
        />

        <AutoTextarea
          ref={objectifRef}
          value={objectif}
          readOnly={read}
          placeholder="Objectif du bloc, en une phrase."
          onChange={(v) => { setObjectif(v); patch((b) => { b.objectif = v; }); }}
          onBlur={() => patch((b) => { b.objectif = objectif; })}
          style={{ margin: '18px 0 28px', color: INK_DIM, fontFamily: SERIF, fontStyle: 'italic', fontSize: 17.5, lineHeight: 1.6, maxWidth: '62ch' }}
        />

        <div style={{ borderLeft: '2px solid var(--sz-acc)', padding: '4px 0 4px 20px', margin: '0 0 34px', maxWidth: '66ch' }}>
          <div style={{ ...label('var(--sz-acc-ink)'), marginBottom: 10 }}>À dire tel quel</div>
          <AutoTextarea
            ref={scriptRef}
            value={script}
            readOnly={read}
            placeholder="La phrase que le meneur lit mot pour mot."
            onChange={(v) => { setScript(v); patch((b) => { b.script = v; }); }}
            onBlur={() => patch((b) => { b.script = script; })}
            style={{ color: '#f2ead9', fontFamily: DISPLAY, fontSize: 22, lineHeight: 1.5 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 28 }}>
          <div>
            <div style={{ ...label(), marginBottom: 14 }}>Points à couvrir</div>
            <div style={{ display: 'grid', gap: 11 }}>
              {block.points.map((p) => (
                <ZeroRow
                  key={p.id} blockId={block.id} listKey="points" row={p} mutate={mutate} read={read}
                  size={17} placeholder="Point à couvrir…"
                  font={{ color: INK_SOFT, fontFamily: SERIF, fontSize: 16.5, lineHeight: 1.55 }}
                />
              ))}
            </div>
            {!read && <button onClick={() => addRow('points')} style={{ ...ghostBtn, marginTop: 14 }}>+ point</button>}
          </div>

          <div>
            <div style={{ background: 'rgba(122,92,46,0.12)', border: '1px solid rgba(201,160,90,0.22)', borderRadius: 3, padding: 20, marginBottom: 16 }}>
              <div style={{ ...label('var(--sz-acc-ink)'), marginBottom: 10 }}>Ne pas s'étendre</div>
              <AutoTextarea
                ref={limiteRef}
                value={limite}
                readOnly={read}
                placeholder="Ce qu'on s'interdit dans ce bloc, et le piège habituel."
                onChange={(v) => { setLimite(v); patch((b) => { b.limite = v; }); }}
                onBlur={() => patch((b) => { b.limite = limite; })}
                style={{ color: INK_SOFT, fontFamily: SERIF, fontSize: 16, lineHeight: 1.6 }}
              />
            </div>

            <div style={{ border: '1px solid rgba(201,160,90,0.18)', borderRadius: 3, padding: 20 }}>
              <div style={{ ...label(), marginBottom: 14 }}>Parking du bloc</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {block.parking.length === 0 ? (
                  <p style={{ margin: 0, fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, color: '#6f665a' }}>
                    Rien au parking pour ce bloc.
                  </p>
                ) : (
                  block.parking.map((q) => (
                    <ZeroRow
                      key={q.id} blockId={block.id} listKey="parking" row={q} mutate={mutate} read={read}
                      size={15} placeholder="La question…"
                      font={{ color: INK_DIM, fontFamily: MONO, fontSize: 14, lineHeight: 1.7 }}
                    />
                  ))
                )}
              </div>
              {!read && <button onClick={() => addRow('parking')} style={{ ...ghostBtn, marginTop: 14, color: INK_FAINT, fontSize: 10.5 }}>+ question</button>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', padding: '44px 0 26px' }}>
          <button
            onClick={onAskHS}
            style={{ ...ghostBtn, width: '100%', maxWidth: 520, background: 'rgba(122,92,46,0.14)', border: '1px solid rgba(201,160,90,0.35)', borderRadius: 3, fontSize: 13, letterSpacing: '0.2em', padding: '20px 24px' }}
          >
            Question H.S.
          </button>
        </div>
      </article>

      <Rule>fin du bloc {num(index)}</Rule>
    </>
  );
}

/* ---------- éditeur d'une fiche ---------- */

function FicheEditor({ fiche, mutate, onBack, onDelete, initialRead }) {
  const blocks = fiche.blocks;
  const [nom, setNom, nomRef] = useSyncedField(fiche.nom);
  const [sousTitre, setSousTitre, sousTitreRef] = useSyncedField(fiche.sousTitre || '');
  const [read, setRead] = useState(!!initialRead);
  const [hsFrom, setHsFrom] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !hsFrom) onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hsFrom, onBack]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const patchFiche = (fn) => mutate((s) => {
    const f = s.fichesTechniques.find((x) => x.id === fiche.id);
    if (f) fn(f);
  });

  const addBlock = () => {
    const b = emptyBlock(LEADERS[0]);
    patchFiche((f) => { f.blocks.push(b); });
    requestAnimationFrame(() => {
      const el = document.getElementById(`bloc-${b.id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.querySelector('input')?.focus({ preventScroll: true });
    });
  };

  const removeBlock = (id) => {
    if (!window.confirm('Supprimer ce bloc et son contenu ?')) return;
    patchFiche((f) => { f.blocks = f.blocks.filter((b) => b.id !== id); });
  };

  const sendHS = (targetId, q) =>
    patchFiche((f) => {
      const b = f.blocks.find((x) => x.id === targetId);
      if (b) b.parking.push({ id: uid(), t: q, on: false });
    });

  const list = blocks;
  let total = 0, done = 0;
  list.forEach((b) => b.points.forEach((p) => { if (p.t.trim()) { total++; if (p.on) done++; } }));
  const progress = `${done} / ${total} traité${done > 1 ? 's' : ''}`;

  const goTo = (e, id) => {
    e.preventDefault();
    document.getElementById(`bloc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const vars = { '--sz-acc': ACCENT, '--sz-acc-ink': lighten(ACCENT) };

  return (
    <>
      {/* Bouton fermer : rendu hors du panneau (backdrop-filter + overflow
          plus haut créent un nouveau containing block pour `position: fixed`,
          ce qui ferait défiler la croix avec le contenu si elle était dedans). */}
      <button
        onClick={onBack}
        title="Fermer la fiche"
        aria-label="Fermer la fiche"
        style={{
          position: 'fixed', top: 22, right: 22, zIndex: 56,
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(20,17,13,0.6)', border: '1px solid rgba(201,160,90,0.35)', borderRadius: '50%',
          color: INK_SOFT, fontSize: 20, lineHeight: 1, cursor: 'pointer'
        }}
      >
        ×
      </button>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 55,
          background: 'rgba(8,6,4,0.74)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center',
          padding: '28px 16px', overflowY: 'auto'
        }}
      >
      <div
        style={{
          ...vars,
          width: '100%', maxWidth: 1040, height: 'fit-content', margin: 'auto 0',
          background: `radial-gradient(120% 80% at 50% 0%, #1d1913 0%, ${BG} 60%)`,
          color: INK,
          fontFamily: SERIF,
          WebkitFontSmoothing: 'antialiased',
          borderRadius: 8,
          border: '1px solid rgba(201,160,90,0.25)',
          boxShadow: '0 40px 120px rgba(0,0,0,0.65)',
          padding: '0 32px 60px'
        }}
      >
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <header style={{ padding: '32px 0 40px', borderBottom: '1px solid rgba(201,160,90,0.22)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
            <button onClick={onBack} style={{ ...ghostBtn, padding: '9px 14px' }}>← Fiche Technique</button>
            <button onClick={onDelete} style={{ ...ghostBtn, color: '#c9857e', borderColor: 'rgba(201,133,126,0.4)' }}>Supprimer cette fiche</button>
          </div>
          <div style={{ ...label('var(--sz-acc-ink)'), fontSize: 12, letterSpacing: '0.22em', marginBottom: 22 }}>
            Fiche technique
          </div>
          <input
            ref={nomRef}
            value={nom}
            readOnly={read}
            placeholder="Nom de la fiche"
            onChange={(e) => { const v = e.target.value; setNom(v); patchFiche((f) => { f.nom = v; }); }}
            onBlur={() => patchFiche((f) => { f.nom = nom.trim(); })}
            style={{
              width: '100%', background: 'transparent', border: 0, outline: 'none', padding: 0,
              color: INK, fontFamily: DISPLAY, fontWeight: 600, fontSize: 'clamp(40px,7vw,74px)', lineHeight: 1.02,
              letterSpacing: '-0.01em', borderBottom: read ? 'none' : '1px dashed rgba(201,160,90,0.3)'
            }}
          />
          <input
            ref={sousTitreRef}
            value={sousTitre}
            readOnly={read}
            placeholder="Sous-titre (optionnel)"
            onChange={(e) => { const v = e.target.value; setSousTitre(v); patchFiche((f) => { f.sousTitre = v; }); }}
            onBlur={() => patchFiche((f) => { f.sousTitre = sousTitre.trim(); })}
            style={{
              width: '100%', background: 'transparent', border: 0, outline: 'none', padding: 0, marginTop: 10,
              color: INK_DIM, fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 'clamp(18px,2.4vw,24px)', lineHeight: 1.3
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
            <span style={{ ...label(BG), fontSize: 11.5, letterSpacing: '0.1em', background: 'var(--sz-acc-ink)', border: '1px solid var(--sz-acc-ink)', borderRadius: 2, padding: '7px 12px' }}>
              {progress}
            </span>
          </div>
        </header>

        {list.length > 0 && (
          <nav style={{ padding: '40px 0 0' }}>
            <h2 style={{ ...label('var(--sz-acc-ink)'), fontSize: 11.5, letterSpacing: '0.2em', margin: '0 0 20px', fontWeight: 500 }}>
              Sommaire
            </h2>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
              {list.map((b, i) => (
                <li key={b.id} style={{ display: 'flex', alignItems: 'baseline', gap: 16, padding: '13px 0', borderTop: '1px solid rgba(201,160,90,0.14)' }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--sz-acc-ink)', minWidth: 26 }}>{num(i)}</span>
                  <a href={`#bloc-${b.id}`} onClick={(e) => goTo(e, b.id)} style={{ fontFamily: DISPLAY, fontSize: 23, color: INK, textDecoration: 'none' }}>
                    {b.titre.trim() || 'Bloc sans nom'}
                  </a>
                  <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11.5, color: INK_FAINT }}>{b.meneur}</span>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {!list.length && (
          <p className="empty" style={{ color: INK_DIM, fontFamily: SERIF, margin: '40px 0' }}>
            Aucun bloc pour l'instant — commence par en ajouter un.
          </p>
        )}

        {list.map((b, i) => (
          <Block
            key={b.id}
            block={b}
            index={i}
            total={list.length}
            read={read}
            mutate={mutate}
            onRemove={() => removeBlock(b.id)}
            onAskHS={() => setHsFrom(b.id)}
          />
        ))}

        {!read && (
          <div style={{ padding: '30px 0 6px', display: 'flex', justifyContent: 'center' }}>
            <button onClick={addBlock} style={{ ...ghostBtn, border: '1px solid var(--sz-acc-ink)', fontSize: 12, letterSpacing: '0.18em', padding: '14px 26px' }}>
              Nouveau bloc
            </button>
          </div>
        )}

        {list.length > 0 && <Rule>fin de la fiche</Rule>}

        {list.length > 0 && (
          <div style={{ padding: '10px 0 0', display: 'flex', justifyContent: 'center' }}>
            <button onClick={() => setRead((r) => !r)} style={{ ...ghostBtn, color: INK_DIM, fontSize: 11, letterSpacing: '0.18em', padding: '13px 22px' }}>
              {read ? 'Repasser en édition' : 'En mode lecture'}
            </button>
          </div>
        )}

        <p style={{ margin: '28px 0 0', fontSize: 15, color: INK_FAINT, fontStyle: 'italic', textAlign: 'center' }}>
          Cette fiche est partagée entre les deux MJ : les modifications de l'un apparaissent chez l'autre en direct.
        </p>
      </div>

      {hsFrom && (
        <HSModal blocks={list} defaultTarget={hsFrom} onSend={sendHS} onClose={() => setHsFrom(null)} />
      )}
      </div>
    </div>
    </>
  );
}

/* ---------- vue principale : liste des fiches ---------- */

function DeleteConfirm({ nom, onConfirm, onCancel }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Supprimer « {nom || 'Sans nom'} » ?</h3>
        <p className="modal__lead">Voulez-vous vraiment supprimer cette fiche technique ? Tout son contenu (blocs, points, notes) sera perdu.</p>
        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onCancel}>Non</button>
          <button className="btn-primary btn-primary--stop" type="button" onClick={onConfirm}>Oui, supprimer</button>
        </div>
      </div>
    </div>
  );
}

export default function FicheTechnique({ state, mutate }) {
  const fiches = state.fichesTechniques || [];
  // { id, mode: 'read' | 'edit' } — le bouton « Lecture » ou « Édition » de la
  // liste fixe l'état d'ouverture ; le bouton en bas du panneau permet ensuite
  // de basculer librement de l'un à l'autre sans refermer la fiche.
  const [openState, setOpenState] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const open = (openState && fiches.find((f) => f.id === openState.id)) || null;
  const toDelete = fiches.find((f) => f.id === deleteId) || null;

  const createFiche = () => {
    const f = emptyFiche();
    mutate((s) => { s.fichesTechniques.push(f); });
    setOpenState({ id: f.id, mode: 'edit' });
  };

  const deleteFiche = (id) => {
    mutate((s) => { s.fichesTechniques = s.fichesTechniques.filter((f) => f.id !== id); });
    setDeleteId(null);
    if (openState && openState.id === id) setOpenState(null);
  };

  if (open) {
    return (
      <>
        <FicheEditor
          key={open.id}
          fiche={open}
          mutate={mutate}
          initialRead={openState.mode === 'read'}
          onBack={() => setOpenState(null)}
          onDelete={() => setDeleteId(open.id)}
        />
        {toDelete && (
          <DeleteConfirm
            nom={toDelete.nom.trim()}
            onConfirm={() => deleteFiche(toDelete.id)}
            onCancel={() => setDeleteId(null)}
          />
        )}
      </>
    );
  }

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Fiche Technique<span className="count"> ({fiches.length})</span></h2>
      </div>

      {!fiches.length ? (
        <p className="empty">
          Aucune fiche technique pour l'instant — PNJ, lieu, créature, règle spéciale… Crée-en une pour
          commencer : elle s'ouvre en plein cadre, avec un nom et des blocs libres, modifiables et
          supprimables à volonté.
        </p>
      ) : (
        <div className="fiche-list">
          {fiches.map((f) => (
            <div key={f.id} className="fiche-row">
              <button type="button" className="fiche-row__name" onClick={() => setOpenState({ id: f.id, mode: 'edit' })}>
                {f.nom.trim() || 'Sans nom'}
                <span className="count"> · {f.blocks.length} bloc{f.blocks.length > 1 ? 's' : ''}</span>
              </button>
              <div className="fiche-row__group">
                <div className="fiche-row__actions">
                  <button type="button" onClick={() => setOpenState({ id: f.id, mode: 'read' })}>Lecture</button>
                  <button type="button" onClick={() => setOpenState({ id: f.id, mode: 'edit' })}>Édition</button>
                </div>
                <button
                  className="fiche-row__del" type="button" title="Supprimer"
                  aria-label={`Supprimer ${f.nom.trim() || 'cette fiche'}`}
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
          ＋ Nouvelle fiche technique
        </button>
      </div>

      {toDelete && (
        <DeleteConfirm
          nom={toDelete.nom.trim()}
          onConfirm={() => deleteFiche(toDelete.id)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </section>
  );
}
