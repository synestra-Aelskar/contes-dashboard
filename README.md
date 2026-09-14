# Repaire des Contes Malveillants

Tableau de bord partagé (binôme de MJ) pour l'animation JdR « Les Contes
Malveillants ». Vite + React + Supabase (base, auth, temps réel, stockage),
déployé sur Vercel.

## Dépôt public

Ce dépôt est **public** (nécessaire pour que Vercel Hobby accepte les
déploiements déclenchés par les deux comptes GitHub qui y contribuent — le
plan gratuit ne permet pas la collaboration sur un dépôt privé). Aucun
secret n'y est commité : `.env.local` est ignoré par git, et la clé Supabase
utilisée côté client est la clé `anon`/`publishable`, publique par
conception et protégée par les policies RLS de la base.

## Vues

Liens · Journal de campagne · Conséquences · Horloges & fronts · Secrets ·
À ne pas oublier · Épreuves & infos · Personnages · Zone · Fiche Technique ·
Calibreur d'XP · Équilibrage DD — plus le flux Début/Fin de session.

## Développement

```bash
npm install
cp .env.example .env.local   # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

Le schéma SQL de la base est dans [`supabase/schema.sql`](supabase/schema.sql).
