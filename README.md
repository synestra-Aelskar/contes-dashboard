# Repaire des Contes Malveillants

Tableau de bord partagé (2 meneur·euses) pour l'animation JdR — porté de l'artefact
Claude vers une app **Vite + React** avec persistance **Supabase** (base + auth +
temps réel + stockage des captures), déployable sur **Vercel**.

Vues : Liens · Journal de campagne · Conséquences · Horloges & fronts · Secrets ·
À ne pas oublier · Épreuves & infos. Notes marginales (post-its) rétractables.
Calendrier d'Aelskar comme source unique des dates (sauf date réelle de séance).

---

## 1. Supabase (base de données)

1. Crée un projet gratuit sur https://supabase.com (garde le mot de passe DB).
2. **SQL Editor → New query** → colle le contenu de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Ça crée la table `board`, les policies RLS, le temps réel et le bucket `screenshots`.
3. **Authentication → Users → Add user** → crée **vos deux comptes** (e-mail +
   mot de passe, coche *Auto Confirm User*). Il n'y a pas d'écran d'inscription.
4. **Project Settings → API** → note :
   - `Project URL`  → `VITE_SUPABASE_URL`
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`

> La clé `anon` est publique par conception : tout est protégé par les policies RLS
> (seuls les comptes connectés lisent/écrivent).

## 2. Lancer en local

```bash
npm install
cp .env.example .env.local     # puis renseigne les 2 valeurs
npm run dev
```

Ouvre http://localhost:5173 et connecte-toi avec un des comptes créés.

## 3. Déployer sur Vercel

1. Pousse ce dossier sur un dépôt GitHub.
2. Sur https://vercel.com → **Add New → Project** → importe le dépôt.
   Framework détecté : *Vite* (build `npm run build`, output `dist`).
3. **Settings → Environment Variables** → ajoute pour *Production* + *Preview* :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Deploy**. L'URL `*.vercel.app` est votre repaire — partage-la à ton binôme,
   il se connecte avec son compte.

## Notes

- **Temps réel** : chaque modif d'un côté apparaît chez l'autre en ~1 s, sans
  rechargement. En cas d'édition simultanée, les modifs locales non encore
  enregistrées sont rejouées sur l'état reçu (dernier bloc gagnant sinon).
- **Captures d'écran** : collées ou choisies → redimensionnées (≤ 1400 px, JPEG)
  → envoyées dans le bucket `screenshots` ; seule l'URL est stockée dans l'état.
- **Sauvegarde** : différée ~1 s après la dernière frappe ; filet au changement
  d'onglet / fermeture.
- Préférences par personne (vue courante, onglet musique/épreuve, notes repliées)
  en `localStorage`.
