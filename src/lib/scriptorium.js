/* Scriptorium de la Trame — logique pure (sans React) : modèle d'un récit,
 * typographie française, rendu de la page de récit exportée (partagé avec
 * l'aperçu) et découpage en messages Discord. Porté de l'outil HTML
 * autonome « scriptorium-de-la-trame.html ». */

export const TYPES = {
  p: 'Paragraphe',
  lead: "Phrase d'ouverture",
  quote: 'Citation',
  line: 'Réplique',
  shout: 'Réplique criée',
  image: 'Image',
  closing: 'Encadré final'
};
export const PLACEHOLDER = {
  p: 'Le corps du récit…',
  lead: "Une phrase qui ouvre l'acte…",
  quote: 'Une phrase isolée, mise en avant…',
  line: 'Ce que dit le personnage (sans guillemets)…',
  shout: "Ce qu'il hurle (sans guillemets)…",
  closing: 'La phrase de clôture…'
};
export const GLYPH = { p: '¶', lead: 'Aa', quote: 'Aa', line: '« »', shout: '« »', image: '', closing: '' };

const sid = () => Math.random().toString(36).slice(2, 10);
const FONTS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=IBM+Plex+Mono:wght@400&family=Spectral:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&display=swap';

/* ---------- utilitaires ---------- */

const E = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const A = (s) => E(s).replace(/"/g, '&quot;');

export function roman(n) {
  const m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let r = '';
  for (const [v, s] of m) while (n >= v) { r += s; n -= v; }
  return r;
}

/** Typographie française : points de suspension, apostrophes courbes,
 * guillemets « », espace fine insécable (U+202F) avant ! ? ;, insécable
 * (U+00A0) avant : et —. */
export function typo(t) {
  return String(t ?? '')
    .replace(/\.\.\./g, '…')
    .replace(/'/g, '’')
    .replace(/"([^"]*)"/g, '«\u00a0$1\u00a0»')
    .replace(/«[ \u00a0\u202f]*/g, '«\u00a0')
    .replace(/[ \u00a0\u202f]*»/g, '\u00a0»')
    .replace(/[ \u00a0]+([!?;])/g, '\u202f$1')
    .replace(/([^\s\u00a0\u202f!?;(«])([!?;])/g, '$1\u202f$2')
    .replace(/[ \u202f]+:/g, '\u00a0:')
    .replace(/ +—/g, '\u00a0—');
}

/* ---------- mise en forme en ligne ----------
 * Balisage léger, ligne par ligne : **gras**, *italique*, __souligné__
 * (combinables : ***gras italique***). Un marqueur sans partenaire sur sa
 * ligne reste du texte. */
const MARK = { '**': 'b', '*': 'i', '__': 'u' };

/** Découpe une ligne en segments { text, b, i, u }. */
export function inlineRuns(line) {
  const parts = String(line ?? '').split(/(\*\*|__|\*)/); // indices impairs = marqueurs
  const literal = new Set();
  ['b', 'i', 'u'].forEach((f) => {
    const idx = parts.map((p, k) => (k % 2 && MARK[p] === f ? k : -1)).filter((k) => k >= 0);
    if (idx.length % 2) literal.add(idx[idx.length - 1]);
  });
  const runs = [];
  const st = { b: false, i: false, u: false };
  parts.forEach((p, k) => {
    if (k % 2 && !literal.has(k)) { st[MARK[p]] = !st[MARK[p]]; return; }
    if (!p) return;
    const last = runs[runs.length - 1];
    if (last && last.b === st.b && last.i === st.i && last.u === st.u) last.text += p;
    else runs.push({ text: p, ...st });
  });
  return runs;
}

/** Texte sans ses marqueurs de mise en forme (titres de page, description). */
export function stripMarks(t) {
  return String(t ?? '').split('\n').map((l) => inlineRuns(l).map((r) => r.text).join('')).join('\n');
}

const T = (t) => typo(t).split(/\n+/).map((l) => inlineRuns(l).map((r) => {
  let h = E(r.text);
  if (r.u) h = `<u>${h}</u>`;
  if (r.i) h = `<em>${h}</em>`;
  if (r.b) h = `<strong>${h}</strong>`;
  return h;
}).join('')).join('<br>');

export function autoFin(s) {
  s = (s || 'récit').trim().toLowerCase();
  return (/^[aeiouyhéèêëàâîïôöûü]/.test(s) ? 'Fin de l’' : 'Fin du ') + s;
}
function slug(s) {
  return (s || 'recit').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'recit';
}
function stripQuotes(t) { return String(t || '').trim().replace(/^[«"“]\s*/, '').replace(/\s*[»"”]$/, ''); }

export function fileBase(s) { return slug([s.surtitre, s.titre1, s.titre2].filter(Boolean).join(' ')); }

/* ---------- page de récit (export et aperçu partagent ce rendu) ----------
 * Ce CSS est celui du FICHIER EXPORTÉ (page autonome au thème sombre fixe),
 * pas celui du dashboard : il ne passe donc pas par styles.css. */
const STORY_CSS = `
:root{--bg:#0b0a09;--fg:#e7e2d8;--hi:#f5f0e5;--mid:#b9b2a5;--meta:#6f6960;--ember:#d2a04a;--ember-l:#e5cf9f;--serif:"Cormorant Garamond",Garamond,"Times New Roman",serif;--body:"Spectral",Georgia,serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;color-scheme:dark}
*{box-sizing:border-box}
html{background:var(--bg);scroll-behavior:auto}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--body);font-weight:300;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
::selection{background:rgba(210,160,74,.3);color:var(--hi)}
.progress{position:fixed;top:0;left:0;right:0;height:2px;z-index:10;pointer-events:none}
.progress i{display:block;height:100%;background:var(--ember);transform-origin:0 50%;transform:scaleX(0);box-shadow:0 0 8px rgba(210,160,74,.45)}
.hero{position:relative;min-height:100vh;min-height:100svh;display:grid;place-items:center;padding:6rem 20px 8rem;overflow:hidden;text-align:center}
.hero::before{content:"";position:absolute;inset:-10%;background:radial-gradient(ellipse 42% 36% at 50% 50%,rgba(210,160,74,.085),rgba(210,160,74,.025) 50%,transparent 72%);pointer-events:none}
.hero::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.016) 0,rgba(255,255,255,.016) 1px,transparent 1px,transparent 3px);pointer-events:none}
.hero-in{position:relative;z-index:1;max-width:100%}
.kicker{display:inline-flex;align-items:center;gap:1.2em;margin:0 0 2.4rem;font-family:var(--mono);font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--ember);padding-left:.3em}
.kicker::before,.kicker::after{content:"";width:3.2rem;height:1px;background:currentColor;opacity:.5}
h1{margin:0;font-family:var(--serif);font-weight:300;color:var(--hi);font-size:clamp(3rem,10.5vw,132px);line-height:1.08;letter-spacing:-.012em;text-wrap:balance}
h1 span,h1 em{display:block}
h1 em{font-style:italic;color:var(--ember);margin-top:.1em}
.descend{position:absolute;z-index:1;bottom:2.4rem;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:1rem;font-family:var(--mono);font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--meta);text-decoration:none;padding-left:.3em}
.descend:hover{color:var(--mid)}
.descend i{display:block;width:1px;height:44px;background:linear-gradient(var(--ember),transparent);transform-origin:top;animation:drip 2.6s cubic-bezier(.6,0,.3,1) infinite}
@keyframes drip{0%{transform:scaleY(0);opacity:0}35%{transform:scaleY(1);opacity:1}100%{transform:translateY(18px) scaleY(.6);opacity:0}}
main{font-size:19px;line-height:1.9;padding:2rem 20px 0}
.col{max-width:44em;margin:0 auto}
.act{padding-top:5.5rem}
.act:first-child{padding-top:3rem}
.act-h{display:flex;align-items:center;gap:1.4rem;margin:0 0 3rem}
.act-n{font-family:var(--serif);font-weight:300;font-size:2.4rem;line-height:1;color:var(--ember)}
.act-r{flex:1;height:1px;background:linear-gradient(90deg,rgba(210,160,74,.55),rgba(210,160,74,0))}
.act-t{font-family:var(--mono);font-size:11px;line-height:1.5;letter-spacing:.3em;text-transform:uppercase;color:var(--meta);text-align:right;max-width:55%}
p{margin:0 0 1.45em;color:var(--fg);hyphens:auto}
strong{font-weight:600;color:var(--hi)}
u{text-decoration-thickness:1px;text-underline-offset:.18em}
.quote em,.closing em,.end-s em{font-style:normal}
.lead{font-family:var(--serif);font-weight:300;font-size:1.72em;line-height:1.42;color:var(--hi);margin:0 0 1.2em;hyphens:manual}
.quote{margin:2.4em 0;padding:.15em 0 .15em 1.5em;border-left:1px solid var(--ember);font-family:var(--serif);font-weight:300;font-style:italic;font-size:1.5em;line-height:1.5;color:var(--hi)}
.line{margin:1.7em 0 1.7em 2em;font-family:var(--serif);font-weight:300;font-size:1.34em;line-height:1.55;color:var(--hi)}
.line.shout{padding-left:1em;border-left:1px solid var(--ember);color:var(--ember)}
figure{margin:3.2em 0}
.frame{position:relative;border:1px solid rgba(255,255,255,.09);overflow:hidden;background:#12100e}
.frame img{display:block;width:100%;height:auto;filter:saturate(.72) contrast(1.03)}
.frame::after{content:"";position:absolute;left:0;right:0;bottom:0;height:45%;background:linear-gradient(rgba(11,10,9,0),rgba(11,10,9,.82));pointer-events:none}
figcaption{margin-top:1rem;font-family:var(--mono);font-size:11px;line-height:1.8;letter-spacing:.3em;text-transform:uppercase;color:var(--meta)}
.ph{aspect-ratio:16/9;display:grid;place-items:center;padding:1rem;text-align:center;font-family:var(--mono);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--meta);border:1px dashed rgba(255,255,255,.12)}
.closing{margin:4.5em 0 0;padding:2.3em .5em;border-top:1px solid rgba(210,160,74,.32);border-bottom:1px solid rgba(210,160,74,.32);text-align:center;font-family:var(--serif);font-weight:300;font-style:italic;font-size:1.55em;line-height:1.5;color:var(--hi);text-wrap:balance}
.end{padding:7rem 0 4.5rem;display:flex;flex-direction:column;align-items:center;gap:1.8rem}
.ember{width:7px;height:7px;border-radius:50%;background:var(--ember);animation:pulse 3.4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.5;box-shadow:0 0 6px 1px rgba(210,160,74,.22)}50%{opacity:1;box-shadow:0 0 20px 6px rgba(210,160,74,.45)}}
.end-s{margin-top:-.6rem;max-width:30em;font-family:var(--serif);font-weight:300;font-style:italic;font-size:1.25em;line-height:1.5;color:var(--mid);text-align:center;text-wrap:balance}
.end-t{font-family:var(--mono);font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--mid);text-align:center;padding-left:.3em}
.sig{padding:0 0 3.5rem;font-family:var(--mono);font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--meta);text-align:center}
@media (max-width:640px){main{font-size:17px;line-height:1.85}.line{margin-left:1em}.act-h{gap:1rem;margin-bottom:2.2rem}.act-n{font-size:2rem}.kicker::before,.kicker::after{width:2rem}}
@media (prefers-reduced-motion:reduce){.descend i,.ember{animation:none}}
`;
const STORY_JS = '(function(){var b=document.querySelector(".progress i"),d=document.documentElement;function u(){var m=d.scrollHeight-d.clientHeight;b.style.transform="scaleX("+(m>0?Math.min(1,Math.max(0,d.scrollTop/m)):0)+")"}addEventListener("scroll",u,{passive:true});addEventListener("resize",u);u();var a=document.querySelector(".descend");if(a)a.addEventListener("click",function(e){var t=document.getElementById("recit");if(!t)return;e.preventDefault();t.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})})})();';

function blockOut(b, preview) {
  const at = preview ? ` data-b="${b.id}"` : '';
  const tx = (b.text || '').trim();
  switch (b.type) {
    case 'p': return tx ? `<p${at}>${T(tx)}</p>` : '';
    case 'lead': return tx ? `<p class="lead"${at}>${T(tx)}</p>` : '';
    case 'quote': return tx ? `<blockquote class="quote"${at}>${T(tx)}</blockquote>` : '';
    case 'line': case 'shout': {
      const q = stripQuotes(tx); if (!q) return '';
      return `<p class="line${b.type === 'shout' ? ' shout' : ''}"${at}>${T('« ' + q + ' »')}</p>`;
    }
    case 'closing': return tx ? `<p class="closing"${at}>${T(tx)}</p>` : '';
    case 'image': {
      const cap = (b.caption || '').trim();
      const capH = cap ? `<figcaption>${T(cap)}</figcaption>` : '';
      if (!b.src) return preview ? `<figure${at}><div class="ph">Image à ajouter</div>${capH}</figure>` : '';
      return `<figure${at}><div class="frame"><img src="${A(b.src)}" alt="${A(cap)}" loading="lazy"></div>${capH}</figure>`;
    }
    default: return '';
  }
}

function firstText(s) {
  for (const a of s.acts) for (const b of a.blocks) {
    if (['p', 'lead'].includes(b.type) && (b.text || '').trim()) return typo(stripMarks(b.text.trim())).replace(/\s+/g, ' ');
  }
  return '';
}

/** Page HTML complète et autonome du récit. `preview` ajoute les ancres
 * data-b (pour faire défiler l'aperçu vers le bloc édité) et des
 * emplacements visibles pour les images manquantes. */
export function storyHTML(s, preview) {
  const t1 = typo(s.titre1 || ''), t2 = typo(s.titre2 || '');
  const plain = [t1, t2].filter(Boolean).join(' ') || 'Récit';
  const sur = typo(s.surtitre || '');
  let desc = firstText(s);
  if (desc.length > 180) desc = desc.slice(0, 177).replace(/\s+\S*$/, '') + '…';
  const fin = typo((s.fin || '').trim() || autoFin(s.surtitre));
  const acts = s.acts.map((a, i) => `<section class="act"><header class="act-h"><span class="act-n">${roman(i + 1)}</span><span class="act-r"></span><span class="act-t">${E(typo(a.name || ''))}</span></header>${a.blocks.map((b) => blockOut(b, preview)).join('')}</section>`).join('');
  const sig = (s.signature || '').trim() ? `<div class="sig">${E(typo(s.signature.trim()))}</div>` : '';
  const title = (sur ? sur + ' · ' : '') + plain;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${E(title)}</title><meta name="description" content="${A(desc)}"><meta property="og:title" content="${A(title)}"><meta property="og:description" content="${A(desc)}"><meta property="og:type" content="article"><meta name="theme-color" content="#0b0a09"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}"><style>${STORY_CSS}</style></head><body><div class="progress" aria-hidden="true"><i></i></div><header class="hero"><div class="hero-in">${sur ? `<p class="kicker">${E(sur)}</p>` : ''}<h1>${t1 ? `<span>${E(t1)}</span>` : ''}${t2 ? `<em>${E(t2)}</em>` : ''}${preview && !t1 && !t2 ? '<span style="opacity:.16">Titre du récit</span>' : ''}</h1></div><a class="descend" href="#recit">Descendre<i></i></a></header><main id="recit"><div class="col">${acts}<footer class="end">${s.braise !== false ? '<span class="ember" aria-hidden="true"></span>' : ''}${fin ? `<span class="end-t">${E(fin)}</span>` : ''}${(s.finSub || '').trim() ? `<p class="end-s">${T(s.finSub.trim())}</p>` : ''}</footer>${sig}</div></main><script>${STORY_JS}<\/script></body></html>`;
}

/* ---------- modèle ---------- */

export function newBlock(type) {
  return type === 'image' ? { id: sid(), type: 'image', src: '', caption: '' } : { id: sid(), type, text: '' };
}
export function newAct(blockTypes) { return { id: sid(), name: '', blocks: blockTypes.map(newBlock) }; }

export function emptyStory() {
  return {
    v: 1, surtitre: 'Prologue', titre1: '', titre2: '', fin: '', finSub: '', braise: true, signature: '',
    acts: [newAct(['lead', 'p'])]
  };
}

/** Valide et normalise un récit importé (JSON exporté ou brouillon local) ;
 * lève une erreur si ce n'est pas un récit. Les ids sont régénérés. */
export function normalizeStory(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.acts)) throw new Error('format');
  return {
    v: 1, surtitre: String(o.surtitre ?? ''), titre1: String(o.titre1 ?? ''), titre2: String(o.titre2 ?? ''),
    fin: String(o.fin ?? ''), finSub: String(o.finSub ?? ''), braise: o.braise !== false, signature: String(o.signature ?? ''),
    acts: o.acts.map((a) => ({
      id: sid(),
      name: String(a?.name ?? ''),
      blocks: (Array.isArray(a?.blocks) ? a.blocks : []).filter((b) => b && TYPES[b.type]).map((b) => (b.type === 'image'
        ? { id: sid(), type: 'image', src: String(b.src || ''), caption: String(b.caption || '') }
        : { id: sid(), type: b.type, text: String(b.text || '') }))
    }))
  };
}

/** Forme sérialisée (sans ids) : brouillon local et export JSON. */
export function exportable(s) {
  return {
    v: 1, surtitre: s.surtitre, titre1: s.titre1, titre2: s.titre2, fin: s.fin, finSub: s.finSub,
    braise: s.braise !== false, signature: s.signature,
    acts: s.acts.map((a) => ({
      name: a.name,
      blocks: a.blocks.map((b) => (b.type === 'image' ? { type: 'image', src: b.src || '', caption: b.caption || '' } : { type: b.type, text: b.text || '' }))
    }))
  };
}

/* ---------- version Discord ---------- */

const dChars = (t) => t.replace(/([\\*_~`|])/g, '\\$1').replace(/@(everyone|here)/g, '@\u200B$1');
const dLineStart = (l) => l.replace(/^(\s*)(#|>|-|\d+\.)/, '$1\\$2');

/** Texte brut pour Discord (titres, noms d'actes…) : tout est échappé. */
function dPlain(t) {
  return dChars(typo(t)).split('\n').map(dLineStart).join('\n');
}
/** Texte mis en forme pour Discord : **gras**, *italique*, __souligné__.
 * `skip` ('b' ou 'i') omet un style déjà appliqué au bloc entier par
 * l'appelant (une citation est déjà en italique, une ouverture en gras). */
function dEsc(t, skip) {
  return typo(t).split('\n').map((l) => dLineStart(inlineRuns(l).map((r) => {
    let x = dChars(r.text);
    if (r.u) x = `__${x}__`;
    if (r.i && skip !== 'i') x = `*${x}*`;
    if (r.b && skip !== 'b') x = `**${x}**`;
    return x;
  }).join(''))).join('\n');
}
const flat = (t) => String(t || '').trim().replace(/\s*\n+\s*/g, ' ');
const perLine = (t, f) => t.split('\n').filter((l) => l.trim()).map(f).join('\n');

function dBlock(b) {
  const t = (b.text || '').trim();
  switch (b.type) {
    case 'p': return t ? perLine(dEsc(t), (l) => l) : '';
    case 'lead': return t ? perLine(dEsc(t, 'b'), (l) => '**' + l + '**') : '';
    case 'quote': return t ? perLine(dEsc(t, 'i'), (l) => '> *' + l + '*') : '';
    case 'line': { const q = stripQuotes(flat(t)); return q ? '> ' + dEsc('« ' + q + ' »') : ''; }
    case 'shout': { const q = stripQuotes(flat(t)); return q ? '> **' + dEsc('« ' + q + ' »', 'b') + '**' : ''; }
    case 'closing': return t ? '### *' + dEsc(flat(t), 'i') + '*' : '';
    case 'image': {
      const cap = (b.caption || '').trim();
      if (b.src && /^https?:\/\//.test(b.src)) return b.src + (cap ? '\n-# ' + dEsc(flat(cap)) : '');
      if (b.src) return '-# [Illustration à joindre' + (cap ? ' : ' + dEsc(flat(cap)) : '') + ']';
      return '';
    }
    default: return '';
  }
}

function splitLong(part, lim) {
  const out = []; let cur = '';
  for (const piece of part.match(/[^.!?…»]+[.!?…»]*\s*|.+$/g) || [part]) {
    if ((cur + piece).length > lim && cur) { out.push(cur.trim()); cur = ''; }
    if (piece.length > lim) { for (let i = 0; i < piece.length; i += lim) out.push(piece.slice(i, i + lim)); continue; }
    cur += piece;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Découpe le récit en messages Discord de `lim` caractères max, en Markdown
 * Discord ; `perAct` force un nouveau message à chaque acte. */
export function discordMessages(s, perAct, lim) {
  const head = [];
  if ((s.surtitre || '').trim()) head.push('-# ' + dPlain(s.surtitre.trim().toUpperCase()));
  if ((s.titre1 || '').trim()) head.push('# ' + dPlain(flat(s.titre1)));
  if ((s.titre2 || '').trim()) head.push('## *' + dPlain(flat(s.titre2)) + '*');
  const groups = s.acts.map((a, i) => [`### ${roman(i + 1)}${(a.name || '').trim() ? ' · ' + dPlain(flat(a.name)) : ''}`, ...a.blocks.map(dBlock).filter(Boolean)]);
  const end = ['-# ' + (s.braise !== false ? '● ' : '') + dPlain((s.fin || '').trim() || autoFin(s.surtitre))];
  if ((s.finSub || '').trim()) end.push('*' + dEsc(flat(s.finSub), 'i') + '*');
  if ((s.signature || '').trim()) end.push('-# ' + dPlain(flat(s.signature)));
  if (groups.length) { groups[0] = head.concat(groups[0]); groups[groups.length - 1] = groups[groups.length - 1].concat(end); }
  else groups.push(head.concat(end));
  const msgs = []; let cur = '';
  const push = () => { if (cur.trim()) msgs.push(cur.trim()); cur = ''; };
  groups.forEach((g, gi) => {
    if (perAct && gi > 0) push();
    for (const part of g) {
      const pieces = part.length > lim ? splitLong(part, lim) : [part];
      for (const p of pieces) {
        if (cur && (cur.length + 2 + p.length) > lim) push();
        cur = cur ? cur + '\n\n' + p : p;
      }
    }
  });
  push();
  return msgs;
}

/** Nombre d'images sans URL publique (data URL d'un ancien export) qu'il
 * faudra joindre à la main sur Discord. */
export function localImageCount(s) {
  return s.acts.reduce((n, a) => n + a.blocks.filter((b) => b.type === 'image' && b.src && !/^https?:\/\//.test(b.src)).length, 0);
}
