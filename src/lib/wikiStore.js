import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { noteFromStored, buildIndex } from './wiki.js';

/* Stockage du Compendium dans la table `board` existante, SANS migration :
 *   - une ligne par note : id « wiki:<chemin> », data { path, fm, body, mtime, deleted? }
 *   - une ligne « wikimedia » : { files: { nomdefichier(minuscule): url } }
 *
 * Pourquoi une ligne par note plutôt qu'un gros blob : une note se sauve
 * seule (quelques Ko, pas tout le vault à chaque frappe), et deux MJ qui
 * éditent deux notes différentes ne se marchent pas dessus. Une même note
 * éditée des deux côtés est détectée (verrou optimiste sur updated_at) au
 * lieu d'écraser silencieusement.
 *
 * Limites connues :
 *   - la table n'a pas de droit DELETE : supprimer une note la marque
 *     `deleted` (elle disparaît de l'interface, la ligne reste) ;
 *   - la RLS de `board` laisse tout compte connecté LIRE toutes les lignes :
 *     comme pour les secrets, le masquage joueur est une affaire d'interface,
 *     pas un coffre-fort. À durcir (table dédiée + rôle dans app_metadata)
 *     avant d'y mettre du lore réservé au MJ. */

const PREFIX = 'wiki:';
const MEDIA_ID = 'wikimedia';
const SAVE_DEBOUNCE = 900;
const PAGE = 500;
const BATCH = 20;
const STALE_MS = 60_000;

const rowId = (path) => PREFIX + path;

async function fetchAllNotes() {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('board').select('id,data,updated_at').like('id', PREFIX + '%').range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

export function useWiki(enabled, userId) {
  const rowsRef = useRef(new Map());   // path → { note, rev, dirty, ver, timer, conflict, deleted }
  const mediaRef = useRef({ files: {}, rev: null });
  const loadedAt = useRef(0);
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  const refreshSaving = useCallback(() => {
    setSaving([...rowsRef.current.values()].some((r) => r.dirty && !r.conflict));
  }, []);

  /* ---------- chargement ---------- */
  const load = useCallback(async () => {
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    try {
      const [rows, media] = await Promise.all([
        fetchAllNotes(),
        supabase.from('board').select('data,updated_at').eq('id', MEDIA_ID).maybeSingle()
      ]);
      if (media.error) throw media.error;
      const map = rowsRef.current;
      const seen = new Set();
      for (const r of rows) {
        const d = r.data || {};
        const path = typeof d.path === 'string' ? d.path : r.id.slice(PREFIX.length);
        seen.add(path);
        const cur = map.get(path);
        if (cur && cur.dirty) { cur.rev = cur.conflict ? r.updated_at : cur.rev; continue; } // on ne perd jamais une frappe locale
        map.set(path, { note: noteFromStored(path, d), rev: r.updated_at, dirty: false, ver: 0, timer: null, conflict: false, deleted: d.deleted === true });
      }
      for (const [path, r] of map) if (!seen.has(path) && !r.dirty && r.rev) map.delete(path);
      if (media.data) mediaRef.current = { files: (media.data.data && media.data.data.files) || {}, rev: media.data.updated_at };
      loadedAt.current = Date.now();
      setError('');
      setStatus('ready');
      bump();
    } catch (e) {
      setError((e && e.message) || 'chargement impossible');
      setStatus('error');
    }
  }, [bump]);

  useEffect(() => { if (enabled && userId) load(); }, [enabled, userId, load]);

  // retour sur l'onglet : on se met à jour si le dernier chargement date
  useEffect(() => {
    if (!enabled) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt.current > STALE_MS) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, load]);

  /* ---------- écriture d'une note ---------- */
  const flush = useCallback(async (path) => {
    const r = rowsRef.current.get(path);
    if (!r || !r.dirty || r.conflict) return;
    clearTimeout(r.timer); r.timer = null;
    const ver = r.ver;
    const payload = { path, fm: r.note.fm, body: r.note.body, mtime: Date.now(), v: 1 };
    if (r.deleted) payload.deleted = true;
    const now = new Date().toISOString();
    let res;
    if (r.rev) {
      res = await supabase.from('board')
        .update({ data: payload, updated_at: now, updated_by: userId })
        .eq('id', rowId(path)).eq('updated_at', r.rev).select('updated_at');
    } else {
      res = await supabase.from('board')
        .insert({ id: rowId(path), data: payload, updated_at: now, updated_by: userId }).select('updated_at');
    }
    if (res.error) {
      if (res.error.code === '23505') { r.conflict = true; } // la note existe déjà ailleurs
      else { r.timer = setTimeout(() => flush(path), 5000); setError(res.error.message || 'enregistrement impossible'); }
    } else if (!res.data || !res.data.length) {
      r.conflict = true; // modifiée entre-temps par quelqu'un d'autre
    } else {
      r.rev = res.data[0].updated_at;
      if (r.ver === ver) r.dirty = false; else r.timer = setTimeout(() => flush(path), SAVE_DEBOUNCE);
      setError('');
    }
    refreshSaving(); bump();
  }, [userId, bump, refreshSaving]);

  const touch = useCallback((path, mutate) => {
    const r = rowsRef.current.get(path);
    if (!r) return;
    mutate(r);
    r.dirty = true; r.ver += 1;
    clearTimeout(r.timer);
    r.timer = setTimeout(() => flush(path), SAVE_DEBOUNCE);
    refreshSaving(); bump();
  }, [flush, bump, refreshSaving]);

  /** Modifie le YAML brut et/ou le corps d'une note. */
  const saveNote = useCallback((path, patch) => {
    touch(path, (r) => {
      const next = { ...r.note };
      if (typeof patch.body === 'string') next.body = patch.body;
      if (typeof patch.fm === 'string') {
        next.fm = patch.fm;
        // la lecture des propriétés se refait depuis le YAML brut
        next.front = noteFromStored(path, { fm: patch.fm, body: '' }).front;
      }
      r.note = next;
    });
  }, [touch]);

  const createNote = useCallback((path, { fm = '', body = '' } = {}) => {
    const map = rowsRef.current;
    const ex = map.get(path);
    if (ex && !ex.deleted) return false;
    const note = noteFromStored(path, { fm, body });
    map.set(path, { note, rev: ex ? ex.rev : null, dirty: true, ver: 1, timer: null, conflict: false, deleted: false });
    refreshSaving(); bump();
    flush(path);
    return true;
  }, [flush, bump, refreshSaving]);

  const deleteNote = useCallback((path) => {
    touch(path, (r) => { r.deleted = true; });
    flush(path);
  }, [touch, flush]);

  /** Conflit : « remote » reprend la version distante, « local » l'impose. */
  const resolveConflict = useCallback(async (path, choice) => {
    const r = rowsRef.current.get(path);
    if (!r) return;
    const { data, error: err } = await supabase.from('board').select('data,updated_at').eq('id', rowId(path)).maybeSingle();
    if (err) { setError(err.message); return; }
    if (choice === 'remote' && data) {
      Object.assign(r, { note: noteFromStored(path, data.data), rev: data.updated_at, dirty: false, conflict: false, deleted: data.data.deleted === true });
    } else {
      Object.assign(r, { rev: data ? data.updated_at : null, conflict: false });
      touch(path, () => {});
      flush(path);
    }
    refreshSaving(); bump();
  }, [touch, flush, bump, refreshSaving]);

  /* ---------- import en masse ---------- */
  /** items : [{ path, fm, body, mtime }]. Rend { written, skipped }. */
  const importNotes = useCallback(async (items, { overwrite = false } = {}, onProgress) => {
    const map = rowsRef.current;
    const todo = items.filter((it) => overwrite || !map.has(it.path) || map.get(it.path).deleted);
    let written = 0;
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH);
      const now = new Date().toISOString();
      const { data, error: err } = await supabase.from('board').upsert(
        chunk.map((it) => ({ id: rowId(it.path), data: { path: it.path, fm: it.fm, body: it.body, mtime: it.mtime || 0, v: 1 }, updated_at: now, updated_by: userId })),
        { onConflict: 'id' }
      ).select('id,updated_at');
      if (err) throw err;
      const revs = new Map((data || []).map((r) => [r.id, r.updated_at]));
      for (const it of chunk) {
        map.set(it.path, { note: noteFromStored(it.path, it), rev: revs.get(rowId(it.path)) || now, dirty: false, ver: 0, timer: null, conflict: false, deleted: false });
      }
      written += chunk.length;
      bump();
      if (onProgress) onProgress(Math.min(i + BATCH, todo.length), todo.length);
    }
    return { written, skipped: items.length - todo.length };
  }, [userId, bump]);

  /** Fusionne de nouveaux fichiers dans la table des médias. */
  const addMedia = useCallback(async (files) => {
    const { data } = await supabase.from('board').select('data,updated_at').eq('id', MEDIA_ID).maybeSingle();
    const merged = { ...((data && data.data && data.data.files) || {}), ...files };
    const { data: saved, error: err } = await supabase.from('board')
      .upsert({ id: MEDIA_ID, data: { files: merged }, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: 'id' })
      .select('updated_at');
    if (err) throw err;
    mediaRef.current = { files: merged, rev: saved && saved[0] && saved[0].updated_at };
    bump();
  }, [userId, bump]);

  // sauvegarde des notes en attente à la fermeture de l'onglet
  useEffect(() => {
    const onHide = () => { for (const [path, r] of rowsRef.current) if (r.dirty && !r.conflict) flush(path); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  /* ---------- lecture ---------- */
  const notes = useMemo(
    () => [...rowsRef.current.values()].filter((r) => !r.deleted).map((r) => r.note),
    [tick] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const index = useMemo(() => buildIndex(notes), [notes]);
  const conflicts = useMemo(
    () => [...rowsRef.current.entries()].filter(([, r]) => r.conflict).map(([p]) => p),
    [tick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return {
    status, error, saving, notes, index, conflicts,
    media: mediaRef.current.files,
    reload: load, saveNote, createNote, deleteNote, resolveConflict, importNotes, addMedia
  };
}
