// Edge Function (admin-only) pour la gestion des comptes :
//   - "invite"        : crée un compte ADMIN (email réel) + génère son lien
//                        magique de première connexion
//   - "recovery"       : génère un nouveau lien magique pour un compte admin
//   - "create_player"  : crée un compte JOUEUR — pas d'email réel, juste
//                        Nom + Code. Un email synthétique (<slug>@joueurs.local)
//                        est généré en coulisses avec le code comme mot de
//                        passe directement (pas de lien à générer/envoyer).
//   - "reset_player_code" : change le code (mot de passe) d'un compte joueur
//   - "list"           : liste tous les comptes Supabase réels (listUsers)
//   - "delete"         : supprime un compte — uniquement un compte "player"
//                        (jamais admin), qu'il s'agisse d'un ancien import
//                        "invite" ou d'un "create_player"
//
// Déploiement (Supabase Dashboard > Edge Functions > New function) :
//   nom : generate-account-link — colle ce fichier, Deploy.
// La clé service_role n'est JAMAIS envoyée au navigateur : elle reste dans
// l'environnement de la fonction (SUPABASE_SERVICE_ROLE_KEY, injectée
// automatiquement par Supabase).
//
// Sécurité : seul un compte MJ (user_metadata.role !== "player") authentifié
// peut appeler cette fonction — vérifié via le token du caller ci-dessous.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Doit produire EXACTEMENT le même résultat que src/lib/playerAuth.js
// (dupliqué volontairement : runtimes différents, pas d'import partagé possible).
const PLAYER_EMAIL_DOMAIN = '@joueurs.local';
function slugifyName(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function roleOf(user: { user_metadata?: Record<string, unknown> }): string {
  return user.user_metadata?.role === 'player' ? 'player' : 'admin';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Non authentifié.' }, 401);

    const callerClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser(token);
    if (callerErr || !callerData?.user) return json({ error: 'Non authentifié.' }, 401);
    if (roleOf(callerData.user) === 'player') {
      return json({ error: 'Réservé aux comptes MJ.' }, 403);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const { action, email, role, userId, name, code } = body as {
      action?: string; email?: string; role?: string; userId?: string; name?: string; code?: string;
    };

    if (action === 'list') {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (error) return json({ error: error.message }, 400);
      const users = data.users
        .map((u) => ({
          id: u.id, email: u.email, role: roleOf(u),
          displayName: (u.user_metadata?.displayName as string) || null,
          createdAt: u.created_at
        }))
        .sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));
      return json({ users });
    }

    if (action === 'delete') {
      if (!userId) return json({ error: 'userId requis.' }, 400);
      const { data: target, error: getErr } = await admin.auth.admin.getUserById(userId);
      if (getErr || !target?.user) return json({ error: 'Compte introuvable.' }, 404);
      if (roleOf(target.user) !== 'player') {
        return json({ error: 'Seuls les comptes joueurs peuvent être supprimés depuis cet outil.' }, 403);
      }
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) return json({ error: delErr.message }, 400);
      return json({ ok: true });
    }

    if (action === 'create_player') {
      if (!name || !code) return json({ error: 'Nom et code requis.' }, 400);
      const slug = slugifyName(name);
      if (!slug) return json({ error: 'Nom invalide.' }, 400);
      const playerEmail = slug + PLAYER_EMAIL_DOMAIN;
      const { data, error } = await admin.auth.admin.createUser({
        email: playerEmail,
        password: code,
        email_confirm: true,
        user_metadata: { role: 'player', displayName: name }
      });
      if (error) return json({ error: error.message }, 400);
      return json({ userId: data.user?.id || null, email: playerEmail });
    }

    if (action === 'reset_player_code') {
      if (!userId || !code) return json({ error: 'userId et code requis.' }, 400);
      const { data: target, error: getErr } = await admin.auth.admin.getUserById(userId);
      if (getErr || !target?.user) return json({ error: 'Compte introuvable.' }, 404);
      if (roleOf(target.user) !== 'player') {
        return json({ error: 'Réservé aux comptes joueurs.' }, 403);
      }
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password: code });
      if (updErr) return json({ error: updErr.message }, 400);
      return json({ ok: true });
    }

    if (!email || (action !== 'invite' && action !== 'recovery')) {
      return json({
        error: 'Requête invalide (action "invite"|"recovery"|"create_player"|"reset_player_code"|"list"|"delete").'
      }, 400);
    }

    const redirectTo = req.headers.get('origin') || undefined;
    const { data, error } = action === 'invite'
      ? await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { data: { role: role || 'admin' }, redirectTo }
      })
      : await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });

    if (error) return json({ error: error.message }, 400);

    return json({ link: data.properties?.action_link || null, userId: data.user?.id || null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
