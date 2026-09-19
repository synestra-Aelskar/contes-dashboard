import { uid } from './util.js';
import { campaignDate } from './campaign.js';
import { aelShift } from './aelskar.js';
import { blocksTotalHours } from './timeblocks.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Titre de la prochaine séance (avant même que le brouillon existe). */
export function nextSessionTitle(state) {
  return 'Séance ' + ((state.sessions || []).length + 1);
}

/** Nouveau brouillon de séance en cours. */
export function makeDraft(state) {
  return {
    id: uid(),
    title: nextSessionTitle(state),
    date: new Date().toLocaleDateString('fr-FR'),
    aelDate: clone(campaignDate(state)),
    summary: '',
    participants: [],
    xp: [],                 // { id, reason, branchKey, amount, charIds: [] }
    eventsTitle: 'Événements de la séance',
    events: [],             // { id, description, charIds: [] }
    consequences: [],       // { id, trigger, effect, charIds: [], eventId }
    clocks: [],             // { id, title, kind, size, filled, note, deadlineAel }
    reminders: [],          // { id, text, kind }
    timeBlocks: [],         // { id, name, typeId, h, d, w } — durée réelle, convertie en jours à la clôture
    prepLink: null,         // { queteId, sessionId } — séance préparée liée, pour le condensé
    prepChecks: {}          // { [xpBlockId]: bool } — objectifs prévus cochés en direct
  };
}

/** Liste ce qui n'est pas rempli avant clôture (pour la confirmation). */
export function sessionGaps(d) {
  const g = [];
  if (!d) return g;
  if (!(d.title || '').trim()) g.push('Titre de la séance');
  if (!(d.summary || '').trim()) g.push('Résumé MJ de la séance');
  if (!(d.participants || []).length) g.push('Aucun participant coché');

  (d.xp || []).forEach((r, i) => {
    const empty = !(r.reason || '').trim() && !(r.charIds || []).length && !String(r.amount ?? '').trim();
    if (empty) return;
    if (!(r.charIds || []).length) g.push('Attribution XP, ligne ' + (i + 1) + ' : aucun participant choisi');
    if (!String(r.amount ?? '').trim()) g.push('Attribution XP, ligne ' + (i + 1) + ' : montant vide');
    if (!(r.reason || '').trim()) g.push('Attribution XP, ligne ' + (i + 1) + ' : raison vide');
  });

  (d.events || []).forEach((e, i) => {
    if (!(e.description || '').trim()) g.push('Événement ' + (i + 1) + ' : description vide');
  });

  return g;
}

/**
 * Mutation de clôture : pousse le brouillon dans le journal + sur les onglets
 * personnages + conséquences / horloges / à ne pas oublier, puis vide le brouillon.
 * Renvoie l'id de la séance créée (via le paramètre `out`).
 */
export function finishDraft(s, out) {
  const d = s.sessionDraft;
  if (!d) return;
  const sid = d.id;
  const findChar = (id) => (s.characters || []).find((c) => c.id === id);

  // 1) séance dans le journal de campagne
  s.sessions.push({
    id: sid,
    date: d.date || '',
    aelDate: d.aelDate ? clone(d.aelDate) : null,
    title: (d.title || '').trim() || 'Séance ' + (s.sessions.length + 1),
    summary: d.summary || '',
    participants: (d.participants || []).slice(),
    events: (d.events || [])
      .filter((e) => (e.description || '').trim() || (e.charIds || []).length)
      .map((e) => ({ id: uid(), description: e.description || '', charIds: (e.charIds || []).slice() })),
    fromDraft: true
  });

  // 2) XP -> personnages (une ligne peut être partagée par plusieurs participants)
  (d.xp || []).forEach((r) => {
    if (!String(r.amount ?? '').trim() && !(r.charIds || []).length) return;
    const reason = (r.reason || '').trim();
    (r.charIds || []).forEach((cid) => {
      const c = findChar(cid);
      if (!c) return;
      c.xp = c.xp || [];
      c.xp.push({
        id: uid(), amount: String(r.amount ?? '').trim(), reason, branchKey: r.branchKey || null, sessionId: sid
      });
    });
  });

  // 3) événements -> personnages liés
  (d.events || []).forEach((e) => {
    if (!(e.description || '').trim()) return;
    (e.charIds || []).forEach((cid) => {
      const c = findChar(cid);
      if (!c) return;
      c.events = c.events || [];
      c.events.push({ id: uid(), description: e.description || '', sessionId: sid });
    });
  });

  // 4) rappel du résumé MJ -> chaque participant
  (d.participants || []).forEach((cid) => {
    const c = findChar(cid);
    if (!c) return;
    c.recaps = c.recaps || [];
    c.recaps.push({ id: uid(), summary: d.summary || '', sessionId: sid });
  });

  // 5) conséquences / horloges / à ne pas oublier
  (d.consequences || []).forEach((x) => {
    if (!(x.trigger || '').trim() && !(x.effect || '').trim() && !(x.charIds || []).length) return;
    s.consequences.push({
      id: uid(), trigger: (x.trigger || '').trim(), effect: (x.effect || '').trim(),
      done: false, sessionId: sid, charIds: (x.charIds || []).slice()
    });
  });
  (d.clocks || []).forEach((x) => {
    if (!(x.title || '').trim() && !(x.note || '').trim()) return;
    s.clocks.push({
      id: uid(), title: (x.title || '').trim(), kind: x.kind || 'timer',
      size: x.size || 6, filled: x.filled || 0, note: x.note || '',
      deadline: '', deadlineAel: x.deadlineAel || null, expired: false, sessionId: sid
    });
  });
  (d.reminders || []).forEach((x) => {
    if (!(x.text || '').trim()) return;
    s.reminders.push({ id: uid(), text: (x.text || '').trim(), kind: (x.kind || '').trim() || 'Divers', sessionId: sid });
  });

  // 6) avance le calendrier en jeu du temps réellement écoulé pendant la séance
  //    (barre de temps → heures, +report des heures non converties en jour
  //    entier des séances précédentes — une journée fait 24h quel que soit
  //    le calendrier, donc rien n'est perdu, juste reporté sur la suite).
  const totalHours = blocksTotalHours(d.timeBlocks) + (Number(s.aelCarryHours) || 0);
  const days = Math.floor(totalHours / 24);
  s.aelCarryHours = totalHours - days * 24;
  if (days > 0) s.aelPin = aelShift(campaignDate(s), days);

  // 7) clôture
  s.sessionDraft = null;
  if (out) out.sessionId = sid;
}
