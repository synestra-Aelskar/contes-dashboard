import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, BUCKET } from '../supabase';
import { XP_DEFAULT_STATE, normalizeXpState } from './xpCalibreur.js';
import { uid } from './util.js';
import { vrValid } from './valrazkah.js';
import { aelValid } from './aelskar.js';
import { ALL_VIEWS, defaultMenuTree, usedViewKeys } from './menu.js';

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
  characters: [], sessionDraft: null, zones: [], sessionZero: { blocks: [] }, fichesTechniques: [],
  xpCalibreur: XP_DEFAULT_STATE, ddCalc: null, prepSessions: [],
  settings: { timeTypes: [], accounts: [], menu: [] },
  vrLink: null, aelCarryHours: 0, threads: [], campaign: { actNumber: '', actTitle: '' }
};

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

function normalize(raw) {
  const base = clone(EMPTY_STATE);
  const d = raw && typeof raw === 'object' ? raw : {};
  const out = { ...base, ...d };
  if (!Array.isArray(out.sections) || !out.sections.length) out.sections = base.sections;
  out.notes = Array.isArray(out.notes) ? out.notes.filter((x) => x && typeof x === 'object') : [];
  ['sessions', 'consequences', 'clocks', 'secrets', 'reminders', 'epreuves', 'characters', 'zones', 'prepSessions', 'threads'].forEach((k) => {
    if (!Array.isArray(out[k])) out[k] = [];
  });
  out.prepSessions.forEach((q) => {
    if (typeof q.name !== 'string') q.name = '';
    if (!Array.isArray(q.sessions)) q.sessions = [];
    q.sessions.forEach((s) => {
      if (typeof s.title !== 'string') s.title = '';
      if (typeof s.description !== 'string') s.description = '';
      if (!Array.isArray(s.xpBlocks)) s.xpBlocks = [];
    });
  });
  if (!out.sessionDraft || typeof out.sessionDraft !== 'object') out.sessionDraft = null;
  if (out.sessionDraft && !Array.isArray(out.sessionDraft.timeBlocks)) out.sessionDraft.timeBlocks = [];
  if (!out.settings || typeof out.settings !== 'object') out.settings = { timeTypes: [], accounts: [] };
  if (!Array.isArray(out.settings.timeTypes)) out.settings.timeTypes = [];
  if (!Array.isArray(out.settings.accounts)) out.settings.accounts = [];
  if (!out.vrLink || !aelValid(out.vrLink.ael) || !vrValid(out.vrLink.vr)) out.vrLink = null;
  if (out.vrLink && !Number.isFinite(out.vrLink.eraStart)) delete out.vrLink.eraStart;
  if (typeof out.aelCarryHours !== 'number' || !Number.isFinite(out.aelCarryHours)) out.aelCarryHours = 0;
  out.secrets.forEach((sec) => {
    if (typeof sec.title !== 'string') sec.title = '';
    if (!Array.isArray(sec.tags)) sec.tags = [];
    if (!Array.isArray(sec.blocks)) {
      // Ancien format : un seul texte + champs libres. Le texte devient le 1er bloc, cache.
      sec.blocks = [{ id: 'b_' + sec.id, text: typeof sec.secret === 'string' ? sec.secret : '', revealedTo: [], playerTags: {} }];
    }
    sec.blocks.forEach((b) => {
      if (typeof b.text !== 'string') b.text = '';
      if (!Array.isArray(b.revealedTo)) b.revealedTo = [];
      // Tags perso par joueur, DÉPLACÉS du secret (sec.playerTags, obsolète) au
      // bloc : chaque joueur classe ses blocs révélés indépendamment.
      if (!b.playerTags || typeof b.playerTags !== 'object') b.playerTags = {};
      Object.keys(b.playerTags).forEach((uidKey) => {
        if (!Array.isArray(b.playerTags[uidKey])) b.playerTags[uidKey] = [];
      });
    });
  });
  if (!out.campaign || typeof out.campaign !== 'object') out.campaign = { actNumber: '', actTitle: '' };
  if (typeof out.campaign.actNumber !== 'string') out.campaign.actNumber = '';
  if (typeof out.campaign.actTitle !== 'string') out.campaign.actTitle = '';
  if (!Array.isArray(out.settings.menu) || !out.settings.menu.length) {
    out.settings.menu = defaultMenuTree();
  } else {
    const used = usedViewKeys(out.settings.menu);
    ALL_VIEWS.forEach(([key]) => {
      if (!used.has(key)) out.settings.menu.push({ id: uid(), type: 'view', viewKey: key, visibility: ['admin'] });
    });
  }
  out.characters.forEach((c) => {
    if (typeof c.ownerId !== 'string') c.ownerId = null;
    if (typeof c.race !== 'string') c.race = '';
    if (typeof c.description !== 'string') c.description = '';
    if (typeof c.qualite !== 'string') c.qualite = '';
    if (typeof c.defaut !== 'string') c.defaut = '';
    if (typeof c.peurs !== 'string') c.peurs = '';
    if (!Array.isArray(c.journal)) c.journal = [];
    c.journal.forEach((j) => {
      if (typeof j.title !== 'string') j.title = '';
      if (typeof j.category !== 'string') j.category = '';
      if (typeof j.text !== 'string') j.text = '';
      if (!Array.isArray(j.screenshots)) j.screenshots = [];
    });
    if (!Array.isArray(c.traits)) c.traits = [];
    c.traits.forEach((t) => {
      if (typeof t.name !== 'string') t.name = '';
      if (typeof t.narrativeDesc !== 'string') t.narrativeDesc = '';
      if (typeof t.technicalDesc !== 'string') t.technicalDesc = '';
      if (typeof t.status !== 'string') t.status = 'draft';
      if (typeof t.mjNote !== 'string') t.mjNote = '';
    });
  });
  out.threads.forEach((t) => {
    if (typeof t.title !== 'string') t.title = '';
    if (!Array.isArray(t.participantIds)) t.participantIds = [];
    if (!Array.isArray(t.messages)) t.messages = [];
    if (typeof t.closed !== 'boolean') t.closed = false;
    t.messages.forEach((m) => {
      if (typeof m.text !== 'string') m.text = '';
      if (typeof m.authorName !== 'string') m.authorName = '';
    });
  });
  if (!out.sessionZero || typeof out.sessionZero !== 'object') out.sessionZero = { blocks: [] };
  if (!Array.isArray(out.sessionZero.blocks)) out.sessionZero.blocks = [];
  if (!Array.isArray(out.fichesTechniques)) out.fichesTechniques = [];
  out.fichesTechniques.forEach((f) => {
    if (typeof f.nom !== 'string') f.nom = '';
    if (typeof f.sousTitre !== 'string') f.sousTitre = '';
    if (!Array.isArray(f.blocks)) f.blocks = [];
  });
  // Migration ponctuelle : l'ancien document unique « Session Zéro » devient la
  // première fiche technique, pour ne pas perdre le contenu déjà écrit.
  if (!out.fichesTechniques.length && out.sessionZero.blocks.length) {
    out.fichesTechniques = [{
      id: uid(),
      nom: 'Session Zéro',
      sousTitre: 'Les Contes Malveillants — Synstem v.11',
      blocks: out.sessionZero.blocks
    }];
    out.sessionZero = { blocks: [] }; // migré : on vide la source pour ne pas la ressusciter si la fiche est supprimée
  }
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
