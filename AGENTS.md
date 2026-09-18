# AGENTS.md — Repaire des Contes Malveillants

Doc technique pour tout agent de code (Codex, etc.) qui travaille sur ce
dépôt. Objectif : pouvoir reproduire exactement les mêmes conventions,
le même workflow git et la même méthode de vérification que ce qui a été
utilisé jusqu'ici sur ce projet (avec Claude Code).

## 1. Contexte du projet

Tableau de bord web partagé pour l'animation d'un JdR en binôme (deux MJ).
Historique : d'abord un artefact Claude (HTML monofichier), **porté** vers
une vraie app le 2026-09-11 car un artefact public est figé sur une version
épinglée et ne permettait pas au binôme d'écrire dessus. Les anciennes
données de l'artefact n'ont **pas** été migrées (considérées comme du test).

- **Stack** : Vite + React 18 (SPA, pas de routeur, pas de SSR) + Supabase
  (Postgres, Auth email/mot de passe, Realtime, Storage) + déploiement
  Vercel (auto-redeploy sur `git push` vers `main`).
- **Dossier local** : `C:\Users\Synestra\projects\contes-dashboard`
- **GitHub** : `github.com/synestra-Aelskar/contes-dashboard` — **dépôt
  public**. Raison : Vercel Hobby (gratuit) refuse les déploiements
  déclenchés par un commit d'un compte GitHub qui n'a pas accès au projet
  Vercel quand le dépôt est privé (« collaboration on private repos » non
  supporté par le plan gratuit). Passer le dépôt en public contourne ce
  blocage. Aucun secret n'est commité : `.env.local` est gitignore, et la
  clé Supabase utilisée côté client (`VITE_SUPABASE_ANON_KEY`) est la clé
  `anon`/`publishable`, publique par conception et protégée par RLS.
- **Supabase project ref** : `pkrgaquggomjssyjgilq`
- **Vars d'env Vercel/local** (`.env.local`, jamais commité) :
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Schéma SQL** : [`supabase/schema.sql`](supabase/schema.sql) — table
  unique `public.board` (une seule ligne `id='main'`, colonne `data jsonb`
  qui contient tout l'état de l'app), RLS restreinte à `authenticated`,
  Realtime activé sur cette table, bucket Storage `screenshots` (lecture
  publique, écriture authentifiée) pour les captures collées dans les
  notes.

### Développement local

```bash
npm install
cp .env.example .env.local   # renseigner VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
npm run build                # vérifie que ça compile avant de commit/push
```

Pas de suite de tests automatisés, pas de linter configuré dans ce repo :
la vérification passe par `npm run build` (zéro erreur) + un test manuel
dans le navigateur (voir §4).

## 2. Travail à deux agents sur le même dépôt (IMPORTANT)

Deux personnes développent en parallèle sur `main`, chacune avec son propre
agent de code :

- **Synestra** (repo/Vercel owner) — historiquement via Claude Code, gère
  surtout l'addon WoW à part et n'avancera plus que ponctuellement sur ce
  site.
- **Akriaxx** (git author `lorkkya@gmail.com`) — va utiliser Codex, avance
  sur le site.

Il n'y a **pas de branches de feature** : tout le monde pousse directement
sur `main`. Règle absolue, à appliquer **avant chaque `git push`** :

```bash
git fetch
git log --oneline origin/main -5   # vérifier s'il y a du nouveau
git rebase origin/main             # ou `git merge --ff-only origin/main` si pas de divergence locale
```

Ne jamais pousser sans avoir vérifié l'état distant d'abord. En cas de
conflit, les fichiers qui reviennent le plus souvent en conflit sont ceux
où **chaque agent ajoute sa propre vue** :

- `src/components/Dashboard.jsx` (import + entrée dans le `if/else if` qui
  choisit `ViewComp`)
- `src/components/ViewBar.jsx` (entrée dans le tableau `VIEWS`)
- `src/lib/board.js` (nouvelle clé dans `EMPTY_STATE` + normalisation dans
  `normalize()`)

Dans ces trois fichiers, un conflit se résout **toujours en gardant les
deux ajouts** (jamais en écrasant l'un par l'autre) : ce sont des listes
où chaque entrée est indépendante des autres.

## 3. Architecture et conventions de code

### État partagé vs état local

Tout l'état de campagne partagé vit dans **un seul objet JS** (le blob
`data` de la ligne `board`), défini par `EMPTY_STATE` dans
[`src/lib/board.js`](src/lib/board.js). Trois façons de stocker une donnée,
à choisir selon sa portée :

1. **Partagé, synchronisé temps réel** → passe par `mutate(fn)` (retourné
   par `useBoard(session)`, lui-même appelé une seule fois dans
   `Dashboard.jsx` puis redescendu en prop à toutes les vues). `mutate`
   clone l'état, applique `fn(draft)`, sauvegarde en base après un debounce
   de 1s (`SAVE_DEBOUNCE`), et diffuse aux autres clients via Supabase
   Realtime (`postgres_changes` sur la table `board`). Si une sauvegarde
   distante arrive pendant qu'on a des mutations locales non encore
   sauvegardées, elles sont **rejouées** (rebase) sur l'état distant reçu
   — voir `useBoard` pour le détail. **Ne jamais** muter `state` en place :
   toujours passer par `mutate`.
2. **Par-champ, "brouillon local tant qu'on tape"** → hook
   [`useSyncedField(value)`](src/lib/useSyncedField.js) sur *chaque* input
   texte/textarea. Il garde une valeur locale, et n'adopte la valeur distante
   (venue de l'autre MJ) que si le champ n'a pas le focus. Corrige le cas où
   la frappe de l'autre n'apparaissait qu'après un refresh, et évite que
   deux personnes qui tapent en même temps dans le même champ ne s'écrasent
   à chaque frappe. Pattern à chaque champ texte :
   ```jsx
   const [titre, setTitre, titreRef] = useSyncedField(item.titre);
   // ...
   <input
     ref={titreRef} value={titre}
     onChange={(e) => { const v = e.target.value; setTitre(v); patch((x) => { x.titre = v; }); }}
     onBlur={() => patch((x) => { x.titre = titre.trim(); })}
   />
   ```
   (`onChange` met à jour l'état partagé à chaque frappe pour la synchro
   temps réel, `onBlur` trim/finalise.)
3. **Purement local à ce navigateur** (sélection dans un arbre, onglet actif,
   filtre UI…) → `localStorage` via `lsGet(key)` / `lsSet(key, value)`
   ([`src/lib/util.js`](src/lib/util.js)), sous des clés préfixées
   `ccm.<vue>` (ex. `ccm.view`, `ccm.prep`, `ccm.session`). Ne **jamais**
   mettre ce genre de donnée dans l'état partagé.

### Ajouter une nouvelle vue

1. Créer `src/components/views/MaVue.jsx`, recevant `{ state, mutate }`
   (parfois `goToSession`, voir `Dashboard.jsx`).
2. L'enregistrer dans **les trois endroits** listés au §2 (`ViewBar.jsx`,
   `Dashboard.jsx`, et si la vue a son propre état partagé, une nouvelle clé
   dans `EMPTY_STATE` + normalisation dans `normalize()` de `board.js`).
3. Si la vue a une couleur d'accent dédiée, ajouter un token `--kind-xxx`
   dans les **trois** blocs de thème de `styles.css` (voir §5) et une règle
   `.viewbtn[data-v="xxx"]{--vk:var(--kind-xxx)}` +
   `.view--xxx{--kind:var(--kind-xxx)}`.

### Patterns UI réutilisables déjà en place

- **Arbre + fiche à deux niveaux** (sommaire cliquable à gauche, détail à
  droite) : pattern né avec la vue Zone
  (`src/components/views/Zones.jsx` → classes `.zone-tree`, `.zone-node`,
  `.zone-node__row/__chev/__label/__kids`, `.zone-pane`,
  `.zone-pane__head/__name/__actions`, `.zone-crumb__link` pour le fil
  d'Ariane, `.chips`/`.chip` pour lister des enfants). Réutilisé tel quel
  par `PrepSession.jsx` (Quête → Session).
- **Résolution "vivante" avec repli** : un bloc qui référence une catégorie
  d'une autre vue par son *nom* (pas d'ID stable) relit la valeur courante
  au rendu, et retombe sur un instantané capturé à la sélection si la
  catégorie a été renommée/supprimée depuis. Exemple concret :
  `resolveBlockXp()` dans [`src/lib/prepsession.js`](src/lib/prepsession.js),
  qui relit `state.xpCalibreur.bareme[branchKey]` par `itemName` et retombe
  sur `block.xpSnapshot` sinon.
- **Champ "notes/description" long** : classe `.notes` ou
  `.finput.finput--area` pour un textarea redimensionnable
  (`resize:vertical`).

## 4. Méthode de vérification avant de livrer une fonctionnalité

Pour chaque changement livré (même petit), la méthode suivie jusqu'ici est :

1. `npm run build` → doit compiler sans erreur.
2. Test manuel dans le navigateur en contournant l'écran de login (voir
   ci-dessous), sur le flux concerné, jusqu'à confirmer visuellement/
   fonctionnellement que ça marche.
3. Vérifier la console navigateur : zéro erreur JS. (Des `400` réseau sur
   les requêtes Supabase sont **normaux** avec le bypass ci-dessous, car
   l'utilisateur "dev" n'est pas réellement authentifié auprès de Supabase
   → RLS refuse l'écriture. Ce n'est pas un bug du code.)
4. Nettoyer le bypass de dev (ne jamais le committer).
5. `git fetch` / rebase-or-ff (voir §2), commit, push.

### Bypass de login pour tester sans compte

`src/App.jsx` gère la session via Supabase Auth (`Login.jsx` si pas de
session). Pour tester une vue sans passer par un vrai login, ajouter
**temporairement** en tout début de `App()` :

```jsx
export default function App() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1') {
    return <Dashboard session={{ user: { id: 'dev', email: 'ton-email@example.com' } }} />;
  }
  const [session, setSession] = useState(undefined);
  // ...
```

Puis ouvrir `http://localhost:5173/?preview=1`. Ce faux `session` suffit
pour que l'UI se rende (elle ne lit que `session.user.email/id`), et la
**lecture** de l'état partagé fonctionne (RLS autorise `select` à
`authenticated`, mais la connexion Supabase réelle du client JS, elle,
n'est pas authentifiée — donc l'écriture (`mutate` → upsert) échouera avec
un 400/403, ce qui est attendu et sans rapport avec le code testé). Pour
tester un flux d'écriture bout-en-bout, se connecter avec un vrai compte
Supabase (`Authentication > Users` côté Supabase) à la place du bypass.

**Toujours retirer ce bloc avant de commit.** Ne jamais le laisser dans une
PR/commit — c'est un contournement de dev uniquement.

## 5. Système de design (styles.css)

Un seul fichier [`src/styles.css`](src/styles.css), pas de CSS Modules ni
de styled-components. Tout passe par des **custom properties CSS** définies
sur `:root`, redéfinies dans **trois blocs** pour gérer le thème sombre :

```css
:root { --bg:#e9e0cd; /* ... valeurs "clair" ... */ }
@media (prefers-color-scheme:dark){ :root:not([data-theme="light"]){ /* valeurs "sombre" */ } }
:root[data-theme="dark"]{ /* valeurs "sombre", override manuel */ }
```

En ajoutant un nouveau token de couleur, **toujours** l'ajouter dans les
trois blocs (clair par défaut, auto sombre via `prefers-color-scheme`,
override manuel `data-theme="dark"`).

Tokens principaux : `--surface`, `--rule` (bordures), `--fg`/`--fg-dim`,
`--bg`, `--gilt`, `--blood`, polices `--f-display`/`--f-body`/`--f-mono`.
Chaque vue/catégorie a son token d'accent `--kind-xxx` (ex. `--kind-zone`,
`--kind-xp`, `--kind-prep`), consommé via `var(--kind, var(--gilt))` dans
les composants partagés (permet un repli neutre si aucun accent n'est
défini pour le contexte).

**Ne jamais** faire de style isolé par vue (`<style>` inline, CSS-in-JS,
fichier CSS séparé) : tout va dans `styles.css`, en réutilisant les tokens
existants avant d'en inventer de nouveaux. Convention de nommage BEM-like
déjà en place : `.bloc`, `.bloc__partie`, `.bloc--variante`.

## 6. Fichiers clés (carte rapide)

| Fichier | Rôle |
|---|---|
| `src/components/Dashboard.jsx` | Racine de l'app connectée : header, `ViewBar`, sélection de la vue active, `FinishModal` |
| `src/components/ViewBar.jsx` | Barre d'onglets — tableau `VIEWS` = liste ordonnée `[clé, libellé]` |
| `src/lib/board.js` | `EMPTY_STATE`, `normalize()`, hook `useBoard()` (chargement + `mutate` + temps réel + rebase) |
| `src/lib/useSyncedField.js` | Hook de champ texte "brouillon local + adoption distante hors focus" |
| `src/lib/util.js` | Helpers génériques : `uid()`, `lsGet`/`lsSet`, formatage de date, normalisation d'URL |
| `src/supabase.js` | Client Supabase (`configured` = `false` si vars d'env absentes → écran d'avertissement) |
| `src/lib/aelskar.js` | Calendrier fictif de la campagne (module pur, ancre 10/09/2026 = An 5984 — **ne pas modifier l'ancre**) |
| `src/lib/session.js` | Flux "séance en cours" : `makeDraft`, `sessionGaps`, `finishDraft` (clôture → pousse au Journal + XP/événements sur les persos) |
| `src/lib/zones.js` | Arbre récursif Pays > Région > Zone > Lieu |
| `src/lib/xpCalibreur.js` | Barème d'XP par branche (Trame/Secondaire/Exploration/Combat/Spéciale) + jalons de progression |
| `src/lib/prepsession.js` | Logique de la vue Prep Session (Quête > Session > blocs d'XP), voir `BRANCH_KIND_VAR` pour le mapping couleur |
| `src/lib/ddcalc.js` | Calculateur de résolution d'action (vue Équilibrage DD) |
| `supabase/schema.sql` | Schéma complet à rejouer dans Supabase SQL Editor si la base est recréée |

## 7. Ce qui n'est volontairement PAS fait

- Pas de routeur (une seule route, la vue active est un `useState` + clé
  `localStorage`, pas d'URL par vue).
- Pas de gestion de comptes/inscription dans l'UI : les comptes sont créés
  à la main côté Supabase (`Authentication > Users`, "Auto Confirm User").
- Pas de migration automatique de schéma : `normalize()` dans `board.js`
  fait office de migration douce à la lecture (valeurs par défaut si champ
  manquant), pas de script de migration séparé.
- Pas de tests automatisés ni de CI — la vérification est manuelle (§4).
