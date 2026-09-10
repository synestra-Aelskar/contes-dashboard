export const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'e' + Date.now() + Math.random().toString(16).slice(2);

export function domain(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); }
  catch (_) { return '—'; }
}

export function normUrl(u) {
  u = (u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

export function fmtDateLong(iso) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(iso));
  } catch (_) { return iso; }
}

export function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
