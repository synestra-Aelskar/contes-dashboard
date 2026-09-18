// Edge Function : génère un lien magique (invite = crée le compte, recovery =
// nouveau lien pour un compte existant) et le renvoie tel quel au front, pour
// pouvoir être copié-collé depuis le tableau de bord sans dépendre de l'email.
//
// Déploiement (Supabase Dashboard > Edge Functions > New function) :
//   nom : generate-account-link — colle ce fichier, Deploy.
// La clé service_role n'est JAMAIS envoyée au navigateur : elle reste dans
// l'environnement de la fonction (SUPABASE_SERVICE_ROLE_KEY, injectée
// automatiquement par Supabase). Seul le lien généré sort de la fonction.
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
    if (callerData.user.user_metadata?.role === 'player') {
      return json({ error: 'Réservé aux comptes MJ.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { action, email, role } = body as { action?: string; email?: string; role?: string };
    if (!email || (action !== 'invite' && action !== 'recovery')) {
      return json({ error: 'Requête invalide (email + action "invite"|"recovery" requis).' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
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
