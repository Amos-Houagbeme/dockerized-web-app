# Pense-bête : application web

Petite application web de notes (ajouter, cocher, supprimer), écrite en Node.js 22 avec PostgreSQL. Elle sert de charge de travail pour le lab Docker : elle est volontairement simple, le sujet du lab est son exploitation.

## Fonctionnement

- Serveur HTTP Node.js sans framework, une seule dépendance : `pg` (client PostgreSQL)
- Interface web embarquée dans `src/ui.js` (HTML, CSS et JavaScript, aucun fichier statique à copier)
- Au démarrage, l'appli crée elle-même la table `notes` si elle n'existe pas, et réessaie jusqu'à 10 fois (2 s d'intervalle) si la base n'est pas encore prête
- Arrêt propre à la réception de `SIGTERM` / `SIGINT`
- Journaux : une ligne JSON par requête sur la sortie standard (les appels `/health` ne sont pas journalisés)

## Contenu

```
app/
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example
├── package.json
├── package-lock.json
└── src/
    ├── server.js        # serveur HTTP et accès à la base
    ├── ui.js            # page web (HTML/CSS/JS) exportée sous forme de texte
    └── server.test.js   # tests automatiques (sans base de données)
```

## Variables d'environnement

| Variable | Rôle | Valeur par défaut |
|---|---|---|
| `PORT` | Port d'écoute de l'appli | `3000` |
| `DB_HOST` | Hôte PostgreSQL | `localhost` |
| `DB_PORT` | Port PostgreSQL | `5432` |
| `DB_USER` | Utilisateur PostgreSQL | aucune (obligatoire) |
| `DB_PASSWORD` | Mot de passe | aucune (obligatoire) |
| `DB_NAME` | Nom de la base | aucune (obligatoire) |

## Points d'accès (API)

| Méthode | Chemin | Rôle | Réponses |
|---|---|---|---|
| GET | `/` | Page web | 200 |
| GET | `/health` | Santé : exécute `SELECT 1` en base | 200 si la base répond, 503 sinon |
| GET | `/api/info` | Nom du conteneur, durée d'activité, état de la base | 200 |
| GET | `/api/notes` | Liste des notes (la plus récente en premier) | 200 |
| POST | `/api/notes` | Crée une note, corps JSON `{"text": "..."}` (1 à 200 caractères) | 201, 400 |
| PATCH | `/api/notes/:id` | Inverse l'état « fait » d'une note | 200, 404 |
| DELETE | `/api/notes/:id` | Supprime une note | 204, 404 |

Exemple :

```bash
curl -X POST http://localhost:3000/api/notes \
  -H 'Content-Type: application/json' \
  -d '{"text":"Écrire mon Dockerfile"}'
```

## Lancer l'appli (hors Docker)

Prérequis : Node.js 22 et une base PostgreSQL accessible.

```bash
cd app
npm ci
DB_HOST=localhost DB_USER=appuser DB_PASSWORD=secret DB_NAME=appdb npm start
```

L'appli répond alors sur `http://localhost:3000`.

## Tests

```bash
cd app
npm ci
npm test
```

Les 6 tests utilisent une fausse base en mémoire : ils ne demandent ni PostgreSQL ni Docker. Ils couvrent `/health` (200 et 503), la page d'accueil, `/api/info`, le cycle créer / cocher / supprimer, la validation (400) et les routes inconnues (404).

## Informations d'exécution

- **Version de Node.js :** 22
- **Installation des dépendances :** `npm ci` (versions figées par `package-lock.json`)
- **Commande de lancement :** `node src/server.js`
- **Port d'écoute :** 3000 (l'appli écoute sur `0.0.0.0`)
- **Fichiers nécessaires à l'exécution :** `package.json`, `node_modules/` et `src/` (les tests `*.test.js` ne servent pas en production)
- **Écriture sur disque :** aucune. L'appli n'écrit rien en dehors de la base, un système de fichiers en lecture seule convient
- **Santé :** `GET /health` convient pour un healthcheck. La base doit être prête avant l'appli, mais l'appli réessaie quelques secondes si besoin
- **Arrêt :** l'appli gère `SIGTERM` elle-même, elle doit donc être lancée directement par `node` pour le recevoir
