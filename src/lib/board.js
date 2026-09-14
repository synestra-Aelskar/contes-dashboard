import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, BUCKET } from '../supabase';
import { XP_DEFAULT_STATE, normalizeXpState } from './xpCalibreur.js';

const ROW_ID = 'main';
const SAVE_DEBOUNCE = 1000;

export const EMPTY_STATE = {
  updated: '',
  worldDate: '',
  notes: [],
  sections: [
    { id: 'wip',   kind: 'wip',   title: 'Chantiers en cours', entries: [] },
    { id: 'tools', kind: 'tools', title: "Outils d'animation",  entries: [] },
    { id: 'music', kind: 'music', title: 'Ambiance sonore',
      cats: ['Exploration', 'Combat', 'Taverne & repos', 'Tension & mystère', 'Révélation', 'Épilogue'], entries: [] },
    { id: 'rules', kind: 'rules', title: 'Règles maison', entries: [] },
    { id: 'data',  kind: 'data',  title: 'Banque de données', entries: [] }
  ],
  sessions: [], consequences: [], clocks: [], secrets: [], reminders: [], epreuves: [],
  characters: [], sessionDraft: null, zones: [], sessionZero: { blocks: [] },
  xpCalibreur: XP_DEFAULT_STATE, ddCalc: null
};

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

function normalize(raw) {
  const base = clone(EMPTY_STATE);
  const d = raw && typeof raw === 'object' ? raw : {};
  const out = { ...base, ...d };
  if (!Array.isArray(out.sections) || !out.sections.length) out.sections = base.sections;
  out.notes = Array.isArray(out.notes) ? out.notes.filter((x) => x && typeof x === 'object') : [];
  ['sessions', 'consequences', 'clocks', 'secrets', 'reminders', 'epreuves', 'characters', 'zones'].forEach((k) => {
    if (!Array.isArray(out[k])) out[k] = [];
  });
  if (!out.sessionDraft || typeof out.sessionDraft !== 'object') out.sessionDraft = null;
  if (!out.sessionZero || typeof out.sessionZero !== 'object') out.sessionZero = { blocks: [] };
  if (!Array.isArray(out.sessionZero.blocks)) out.sessionZero.blocks = [];
  out.xpCalibreur = normalizeXpState(out.xpCalibreur);
  if (typeof out.updated !== 'string') out.updated = '';
  if (typeof out.worldDate !== 'string') out.worldDate = '';
  return out;
}

/* Réduit une image (fichier ou blob collé) et renvoie un Blob JPEG. */
export function downscale(fileOrBlob, maxW = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
      const w = Math.max(1, Math.round((img.naturalWidth || maxW) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || maxW) * scale));
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
    img.src = url;
  });
}

export async function uploadScreenshot(fileOrBlob) {
  const blob = await downscale(fileOrBlob);
  const name = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, blob, {
    contentType: 'image/jpeg',
    upsert: false
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}

/**
 * État partagé du tableau de bord.
 * - chargement initial de la ligne `board`
 * - abonnement temps réel : les changements distants sont appliqués
 * - `mutate(fn)` : applique `fn(draft)` en local + sauvegarde différée
 * - en cas d'édition simultanée, les mutations locales non encore
 *   sauvegardées sont « rejouées » sur l'état distant reçu (rebase).
 */
export function useBoard(session) {
  const userId = session?.user?.id || null;
  const [state, setState] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | saving | offline

  const stateRef = useRef(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef(null);
  const pendingMutators = useRef([]);

  const apply = useCallback((next) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!dirtyRef.current || savingRef.current || !stateRef.current) return;
    savingRef.current = true;
    setStatus('saving');
    const payload = stateRef.current;
    const { error } = await supabase
      .from('board')
      .upsert(
        { id: ROW_ID, data: payload, updated_at: new Date().toISOString(), updated_by: userId },
        { onConflict: 'id' }
      );
    savingRef.current = false;
    if (error) {
      setStatus('offline');
      timerRef.current = setTimeout(flush, 5000);
      return;
    }
    // succès : si de nouvelles mutations sont arrivées entre-temps on reste dirty
    if (eq(payload, stateRef.current)) {
      dirtyRef.current = false;
      pendingMutators.current = [];
      setStatus('ready');
    } else {
      pendingMutators.current = [];
      timerRef.current = setTimeout(flush, SAVE_DEBOUNCE);
    }
  }, [userId]);

  const scheduleSave = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DEBOUNCE);
  }, [flush]);

  const mutate = useCallback((fn) => {
    const base = stateRef.current;
    if (!base) return;
    const next = clone(base);
    fn(next);
    next.updated = new Date().toISOString().slice(0, 10);
    pendingMutators.current.push(fn);
    dirtyRef.current = true;
    apply(next);
    scheduleSave();
  }, [apply, scheduleSave]);

  const flushNow = useCallback(() => { if (dirtyRef.current) flush(); }, [flush]);

  // chargement initial. Garde-fou : au bout de 8 s sans réponse on affiche un
  // état vide « hors ligne » — mais si la requête finit par aboutir et qu'aucune
  // édition locale n'a commencé, on applique quand même les vraies données.
  useEffect(() => {
    let cancelled = false;
    let shown = false;
    supabase
      .from('board')
      .select('data')
      .eq('id', ROW_ID)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { if (!shown) { shown = true; apply(normalize(null)); setStatus('offline'); } return; }
        if (!shown || !dirtyRef.current) { shown = true; apply(normalize(data && data.data)); setStatus('ready'); }
      })
      .catch(() => { if (!cancelled && !shown) { shown = true; apply(normalize(null)); setStatus('offline'); } });
    const t = setTimeout(() => {
      if (cancelled || shown) return;
      shown = true;
      apply(normalize(null));
      setStatus('offline');
    }, 8000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [apply]);

  // temps réel
  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase
      .channel('board-main')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board', filter: `id=eq.${ROW_ID}` },
        (payload) => {
          const row = payload.new;
          if (!row || !row.data) return;
          if (eq(row.data, stateRef.current)) return; // notre propre écho / no-op
          if (!dirtyRef.current) {
            apply(normalize(row.data));
            return;
          }
          // édition en cours : on rebase nos mutations non sauvegardées sur l'état distant
          const rebased = normalize(row.data);
          pendingMutators.current.forEach((fn) => { try { fn(rebased); } catch (_) {} });
          rebased.updated = new Date().toISOString().slice(0, 10);
          apply(rebased);
        }
      )
      .subscribe((st) => {
        if (st === 'SUBSCRIBED') setStatus((s) => (s === 'offline' ? 'ready' : s));
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') setStatus('offline');
      });
    return () => { supabase.removeChannel(channel); };
  }, [userId, apply]);

  // filet : sauver avant fermeture / passage en arrière-plan
  useEffect(() => {
    const onHide = () => { if (dirtyRef.current) flush(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
    });
    return () => { window.removeEventListener('pagehide', onHide); };
  }, [flush]);

  return { state, status, mutate, flushNow };
}
