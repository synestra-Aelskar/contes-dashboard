// Edge Function (admin-only) pour la gestion des comptes :
//   - "invite"   : crée un compte + génère son lien magique de première connexion
//   - "recovery" : génère un nouveau lien magique pour un compte existant
//   - "list"     : liste tous les comptes Supabase réels (auth.admin.listUsers)
//   - "delete"   : supprime un compte — uniquement un compte "player" (jamais admin)
// Tous renvoyés tels quels au front pour être copiés-collés / affichés, sans
// dépendre de l'email.
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
    const { action, email, role, userId } = body as {
      action?: string; email?: string; role?: string; userId?: string;
    };

    if (action === 'list') {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (error) return json({ error: error.message }, 400);
      const users = data.users
        .map((u) => ({ id: u.id, email: u.email, role: roleOf(u), createdAt: u.created_at }))
        .sort((a, b) => (a.email || '').localeCompare(b.email || ''));
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

    if (!email || (action !== 'invite' && action !== 'recovery')) {
      return json({ error: 'Requête invalide (email + action "invite"|"recovery"|"list"|"delete" requis).' }, 400);
    }

    const redirectTo = req.headers.get('origin') || undefined;
    const { data, error } = action === 'invite'
      ? await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { data: { role: role || 'player' }, redirectTo }
      })
      : await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });

    if (error) return json({ error: error.message }, 400);

    return json({ link: data.properties?.action_link || null, userId: data.user?.id || null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
