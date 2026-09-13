import { forwardRef, useState } from 'react';
import { uid } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';

/**
 * SessionZero — document de conduite de séance zéro.
 * Contenu partagé (state.sessionZero.blocks), synchronisé en temps réel comme
 * le reste du tableau de bord. Le mode lecture et la modale H.S. restent des
 * préférences d'affichage locales à chaque personne.
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

const TITLE = 'Session Zéro';
const SUBTITLE = 'Les Contes Malveillants — Synstem v.11';
const META = ['8 joueurs', '2 co-MJ', '≈ 2 h 30 d’enveloppe'];
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

function ZeroRow({ blockId, listKey, row, mutate, size, font, read, placeholder }) {
  const [text, setText, textRef] = useSyncedField(row.t);
  const patchRow = (fn) =>
    mutate((s) => {
      const b = s.sessionZero.blocks.find((x) => x.id === blockId);
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
            const b = s.sessionZero.blocks.find((x) => x.id === blockId);
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
    const b = s.sessionZero.blocks.find((x) => x.id === block.id);
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

/* ---------- document ---------- */

export default function SessionZero({ state, mutate }) {
  const blocks = state.sessionZero.blocks.length ? state.sessionZero.blocks : null;
  const [read, setRead] = useState(false);
  const [hsFrom, setHsFrom] = useState(null);

  const addBlock = () => {
    const b = emptyBlock(LEADERS[0]);
    mutate((s) => { s.sessionZero.blocks.push(b); });
    requestAnimationFrame(() => {
      const el = document.getElementById(`bloc-${b.id}`);
      if (!el) return;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24, behavior: 'smooth' });
      el.querySelector('input')?.focus({ preventScroll: true });
    });
  };

  const removeBlock = (id) => {
    if (!window.confirm('Supprimer ce bloc et son contenu ?')) return;
    mutate((s) => { s.sessionZero.blocks = s.sessionZero.blocks.filter((b) => b.id !== id); });
  };

  const sendHS = (targetId, q) =>
    mutate((s) => {
      const b = s.sessionZero.blocks.find((x) => x.id === targetId);
      if (b) b.parking.push({ id: uid(), t: q, on: false });
    });

  const list = blocks || [];
  let total = 0, done = 0;
  list.forEach((b) => b.points.forEach((p) => { if (p.t.trim()) { total++; if (p.on) done++; } }));
  const progress = `${done} / ${total} traité${done > 1 ? 's' : ''}`;

  const goTo = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(`bloc-${id}`);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24, behavior: 'smooth' });
  };

  const vars = { '--sz-acc': ACCENT, '--sz-acc-ink': lighten(ACCENT) };

  return (
    <div
      style={{
        ...vars,
        background: `radial-gradient(120% 80% at 50% 0%, #1d1913 0%, ${BG} 60%)`,
        color: INK,
        fontFamily: SERIF,
        WebkitFontSmoothing: 'antialiased',
        margin: '0 -20px',
        padding: '0 20px 80px'
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <header style={{ padding: '48px 0 40px', borderBottom: '1px solid rgba(201,160,90,0.22)' }}>
          <div style={{ ...label('var(--sz-acc-ink)'), fontSize: 12, letterSpacing: '0.22em', marginBottom: 22 }}>
            Document de conduite de séance · à suivre à la lettre
          </div>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 'clamp(40px,7vw,74px)', lineHeight: 1.02, margin: '0 0 18px', letterSpacing: '-0.01em' }}>
            {TITLE}
          </h1>
          <p style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 'clamp(20px,3vw,28px)', color: INK_DIM, margin: '0 0 30px', lineHeight: 1.3 }}>
            {SUBTITLE}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {META.map((m) => (
              <span key={m} style={{ ...label('#cfc6b4'), fontSize: 11.5, letterSpacing: '0.1em', border: '1px solid rgba(201,160,90,0.3)', borderRadius: 2, padding: '7px 12px' }}>
                {m}
              </span>
            ))}
            <span style={{ ...label(BG), fontSize: 11.5, letterSpacing: '0.1em', background: 'var(--sz-acc-ink)', border: '1px solid var(--sz-acc-ink)', borderRadius: 2, padding: '7px 12px' }}>
              {progress}
            </span>
          </div>
        </header>

        {list.length > 0 && (
          <nav style={{ padding: '40px 0 0' }}>
            <h2 style={{ ...label('var(--sz-acc-ink)'), fontSize: 11.5, letterSpacing: '0.2em', margin: '0 0 20px', fontWeight: 500 }}>
              À l'ordre du jour
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

        {list.length > 0 && <Rule>fin du document</Rule>}

        {list.length > 0 && (
          <div style={{ padding: '38px 0 0', display: 'flex', justifyContent: 'center' }}>
            <button onClick={() => setRead((r) => !r)} style={{ ...ghostBtn, color: INK_DIM, fontSize: 11, letterSpacing: '0.18em', padding: '13px 22px' }}>
              {read ? 'Repasser en édition' : 'En mode lecture'}
            </button>
          </div>
        )}

        <p style={{ margin: '28px 0 0', fontSize: 15, color: INK_FAINT, fontStyle: 'italic', textAlign: 'center' }}>
          Ce document est partagé entre les deux MJ : les modifications de l'un apparaissent chez l'autre en direct.
        </p>
      </div>

      {hsFrom && (
        <HSModal blocks={list} defaultTarget={hsFrom} onSend={sendHS} onClose={() => setHsFrom(null)} />
      )}
    </div>
  );
}
