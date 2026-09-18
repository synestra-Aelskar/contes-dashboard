/** Comptes joueur : pas d'email réel, juste Nom + Code. En coulisses ça reste
 * un vrai compte Supabase Auth (email synthétique + mot de passe = le code)
 * pour que la sécurité RLS existante s'applique sans rien changer d'autre.
 * Le slug doit produire EXACTEMENT le même résultat ici et dans l'Edge
 * Function (supabase/functions/generate-account-link/index.ts) — dupliqué
 * volontairement, les deux tournent dans des runtimes différents. */
export const PLAYER_EMAIL_DOMAIN = '@joueurs.local';

export function slugifyName(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function playerEmailFor(name) {
  const slug = slugifyName(name);
  return slug ? slug + PLAYER_EMAIL_DOMAIN : '';
}
