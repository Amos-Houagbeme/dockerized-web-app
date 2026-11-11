# dockerized-web-app

Conteneurisation d'une application web Node.js avec sa base PostgreSQL, orchestrées par Docker Compose.

## Objectif

Ce lab me permet de mettre en évidence ma compréhension des notions de Docker, pour acquérir plus de compétences à l'avenir dans le monde du cloud. Je l'ai fait pour avoir une preuve concrète et vérifiable de ma connaissance de la conteneurisation d'une application.

## Qui a écrit quoi

- **Fournie :** l'application « Pense-bête » (dossier `app/src/`, ses tests et le README de `app/`). Elle est volontairement simple : le sujet du lab, c'est son exploitation.
- **Écrits par moi :** le `Dockerfile`, le `docker-compose.yml`, la configuration par variables d'environnement (`.env`), et les tests faits à la main sur `srv-app-01`.

## Architecture

```
navigateur ──► :3000 ──► conteneur app (Node 22) ──► conteneur db (PostgreSQL 16)
                              │                              │
                              └────────── réseau net-app ────┘
                                                             │
                                                    volume pgdata (données)
```

L'application et la base sont deux conteneurs distincts sur un même réseau Docker. L'application joint la base par le **nom du service** (`db`), pas par `localhost`.

## Structure du dépôt

```
dockerized-web-app/
├── .gitignore
├── README.md                # ce fichier
└── app/
    ├── Dockerfile
    ├── docker-compose.yml
    ├── .dockerignore
    ├── .env.example         # modèle : à copier en .env
    ├── package.json
    ├── package-lock.json
    ├── README.md            # documentation de l'application
    └── src/
```

## Lancer le projet

Prérequis : Docker avec le plugin Compose.

```bash
cd app
cp .env.example .env        # puis changer DB_PASSWORD
docker compose up -d --build
docker compose ps           # db doit passer à "healthy"
```

Ouvrir ensuite `http://localhost:3000`.

> **Si Docker tourne dans une VM**, `localhost` dans le navigateur désigne ta machine, pas la VM. Utilise l'IP de la VM, ou un tunnel SSH : `ssh -L 3000:localhost:3000 utilisateur@IP_DE_LA_VM`.

Arrêter : `docker compose down` (les données restent). Tout supprimer, données comprises : `docker compose down -v`.

## Le Dockerfile, ligne par ligne

| Ligne | Rôle |
|---|---|
| `FROM node:22-slim` | Image de base qui contient déjà Node.js 22, en version allégée |
| `WORKDIR /app` | Dossier de travail dans le conteneur |
| `COPY package*.json ./` | Copie seulement `package.json` et `package-lock.json` |
| `RUN npm ci` | Installe les dépendances aux versions exactes figées dans `package-lock.json` |
| `COPY . .` | Copie ensuite le reste du code |
| `EXPOSE 3000` | Documente le port d'écoute de l'application |
| `CMD ["node", "src/server.js"]` | Commande lancée au démarrage du conteneur |

**Pourquoi `COPY package*.json` avant `COPY . .` ?** Pour profiter du système de couches (layers) de Docker. Les dépendances changent rarement, le code change souvent. Tant que `package*.json` ne bouge pas, Docker réutilise la couche mise en cache de `npm ci` au lieu de réinstaller les dépendances à chaque modification du code.

**Pourquoi `npm ci` ?** Il installe exactement les versions du `package-lock.json`, donc le même résultat à chaque build. C'est aussi ce que recommande le README de l'application.

## Le docker-compose.yml

- **`app`** : construite depuis le `Dockerfile` (`build: .`) et nommée `mon-app:1.0`. Elle reçoit sa configuration de base de données par variables d'environnement, et attend que `db` soit en bonne santé (`depends_on` avec `condition: service_healthy`).
- **`db`** : image officielle `postgres:16`, configurée par `POSTGRES_USER`, `POSTGRES_PASSWORD` et `POSTGRES_DB`, alimentées par les mêmes valeurs que côté application pour éviter toute incohérence.
- **`DB_HOST=db`** : la base ne se trouve pas sur la machine mais dans un autre conteneur. Pour désigner ce conteneur, on utilise le nom de son service. `localhost`, dans le conteneur de l'application, désignerait l'application elle-même.
- **`healthcheck`** (`pg_isready`) : vérifie que PostgreSQL a bien démarré et peut être utilisé. Un conteneur « démarré » n'est pas forcément prêt à accepter des connexions.
- **Volume `pgdata`** : assure la persistance des données. Sans lui, la base repartirait vide à chaque recréation du conteneur.
- **Réseau `net-app`** : réseau dédié aux deux services.
- **`.env`** : les valeurs (dont le mot de passe) sont hors du code et hors de git. Seul `.env.example`, sans valeur sensible, est versionné.

## Vérifier la persistance

1. Ajouter une note dans l'interface.
2. `docker compose down` puis `docker compose up -d` : la note est toujours là.
3. `docker compose down -v` puis `docker compose up -d` : la base repart vide, car le volume a été supprimé.

## Erreurs rencontrées et ce qu'elles m'ont appris

| Erreur | Cause | Correction | Ce que ça m'apprend |
|---|---|---|---|
| `CMD ["node" "src/server.js"]` | Virgule manquante : Docker ne reconnaît plus la forme tableau | `["node", "src/server.js"]` | La forme JSON du `CMD` est stricte |
| `COPY package*.json .` | Plusieurs fichiers source exigent un dossier comme destination | `COPY package*.json ./` | Le `/` final compte quand il y a plusieurs sources |
| Compose avec `image: node:22-slim` | Docker lançait un Node vierge, sans mon code | Ajouter `build: .` pour utiliser mon Dockerfile | `image:` seul ne construit rien ; `build:` si le dépôt doit marcher chez quelqu'un d'autre |
| `networks:` sous `services:` | Mauvaise indentation : lu comme un service nommé `networks` | Remettre `networks:` au niveau racine | En YAML, l'indentation fait la structure ; `docker compose config` valide avant de lancer |
| Application qui plantait avec `ECONNREFUSED 127.0.0.1:5432` | `localhost` désigne le conteneur lui-même | `DB_HOST=db` | Dans Compose, on joint un service par son nom |
| `.env` : noms de variables et valeurs | Les noms doivent être ceux que lit `server.js` | Vérifier avec `grep process.env`, garder le `.env` hors de git | Un nom de variable faux fait retomber l'appli sur sa valeur par défaut, sans erreur |
| Page introuvable sur `localhost:3000` depuis le navigateur | L'application tourne sur la VM, pas sur ma machine | IP de la VM ou tunnel SSH | Savoir sur quelle machine « localhost » pointe |

## Commandes utiles

```bash
docker compose config        # valider le fichier et voir les variables résolues (affiche le mot de passe : ne pas le partager)
docker compose logs -f app   # suivre les journaux de l'application
docker compose ps            # état des services, dont le healthcheck
docker images                # images locales
```
