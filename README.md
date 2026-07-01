# Unclutter

Assistant de tri de tickets pour un support IT de niveau 1, basé sur l'API Gemini. Il transforme un message utilisateur brut et mal rédigé en ticket structuré, exploitable et prêt à être recopié dans un outil de type GLPI.

Projet réalisé dans le cadre de l'épreuve U5 du BTS SIO.

## Sommaire

- [Contexte](#contexte)
- [Utilisateur cible](#utilisateur-cible)
- [Problème traité](#problème-traité)
- [Feature IA](#feature-ia)
- [Fonctionnement](#fonctionnement)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Démo : entrée et sortie attendue](#démo--entrée-et-sortie-attendue)
- [Cas de test](#cas-de-test)
- [Installation et déploiement](#installation-et-déploiement)
- [Risques et limites](#risques-et-limites)
- [Compétences U5 mobilisées](#compétences-u5-mobilisées)
- [Contribution de chaque membre](#contribution-de-chaque-membre)

## Contexte

Support IT niveau 1 dans une PME. Les demandes utilisateurs arrivent par mail, chat ou téléphone, souvent mal rédigées.

## Utilisateur cible

Alternant helpdesk ou technicien support IT débutant qui doit créer des tickets propres dans un outil de type GLPI.

## Problème traité

Les utilisateurs décrivent mal leurs pannes ("ça marche pas", "j'ai un souci"). Le junior perd du temps à reformuler, se trompe de catégorie ou de priorité, et traite parfois une urgence en retard. Il peut aussi être poussé à exécuter des actions risquées demandées par l'utilisateur.

## Feature IA

Transformer un message brut en ticket exploitable : catégorie, priorité, résumé propre et questions à poser quand il manque des informations, avec une alerte quand la demande est dangereuse.

L'IA ne résout pas le problème technique et ne fournit jamais de commande système : elle structure, qualifie et signale. La décision finale reste toujours au technicien.

## Fonctionnement

1. Le technicien colle le message brut de l'utilisateur dans l'interface.
2. Le frontend envoie le message à un backend, qui interroge l'API Gemini avec un prompt système strict.
3. Gemini renvoie un JSON structuré (catégorie, priorité, résumé, questions, risque).
4. Le backend enregistre le ticket dans une base de données et le renvoie à l'interface.
5. L'interface affiche le ticket structuré, prêt à être recopié dans GLPI, et le rend disponible dans l'historique.

## Fonctionnalités

### Qualification automatique du ticket

Le message brut est analysé par Gemini selon un prompt système fixe, qui impose une sortie JSON strict : catégorie, priorité, résumé reformulé, liste de questions à poser si des informations manquent, indicateur d'exploitabilité, et champ de risque. Le modèle Gemini utilisé est choisi dans un sélecteur (versions 3.1, 2.5, 2.0, 1.5, ou identifiant personnalisé), sans jamais modifier la clé API utilisée.

### Historique des tickets

Chaque ticket traité est conservé dans une base de données et consultable dans un panneau dédié. Cliquer sur une entrée recharge le ticket dans l'interface sans déclencher un nouvel appel à Gemini. Un ticket peut être supprimé individuellement, ou l'historique peut être vidé entièrement.

### Suivi de traitement

Chaque ticket possède un statut modifiable (Nouveau, En cours, Résolu) ainsi qu'un champ de note libre où le technicien documente sa résolution. L'historique devient ainsi un véritable outil de suivi plutôt qu'un simple journal en lecture seule.

### Copie et export

Le ticket affiché peut être copié dans le presse-papiers au format texte, prêt à coller directement dans GLPI. L'historique complet peut être exporté au format JSON ou CSV pour être archivé ou analysé ailleurs.

### Tableau de bord

Un panneau de statistiques affiche en direct le nombre total de tickets traités, le nombre de tickets exploitables, le nombre de risques détectés et la répartition par priorité.

### Alerte automatique sur risque détecté

Lorsqu'un ticket est qualifié à risque (action destructrice, dangereuse ou hors périmètre du niveau 1), une alerte s'affiche dans l'interface et, si un webhook est configuré, une notification est envoyée automatiquement vers un canal Slack ou Discord. Cela rend concrète l'escalade vers un administrateur senior prévue par le prompt système, sans jamais bloquer la réponse à l'utilisateur en cas d'échec de l'envoi.

### Sécurisation de la clé API

La clé API Gemini n'est jamais saisie ni transmise depuis le navigateur. Elle est détenue exclusivement côté serveur, dans une variable d'environnement non versionnée.

## Architecture

```
Navigateur (public/)
        |
        v
Backend Express (server.js)
        |
        +--> API Gemini            (clé lue depuis une variable d'environnement)
        |
        +--> Base SQLite           (data/unclutter.db, persistée dans un volume Docker)
        |
        +--> Webhook d'alerte      (optionnel, Slack ou Discord)
```

Le projet a évolué d'un prototype HTML statique (`unclutter.html`, conservé à la racine comme référence) vers une architecture client-serveur complète :

| Élément | Rôle |
|---|---|
| `public/` | Frontend statique (HTML, CSS, JS) servi par le backend. Ne contient aucune clé API et n'appelle jamais Gemini directement. |
| `server.js` | Point d'entrée du backend Express. Sert le frontend et monte les routes de l'API. |
| `src/gemini.js` | Prompt système et appel à l'API Gemini côté serveur. |
| `src/db.js` | Accès à la base SQLite (création du schéma, migrations, requêtes préparées). |
| `src/alert.js` | Envoi de la notification webhook en cas de risque détecté. |
| `src/routes/` | Routes de l'API REST (analyse, historique, statistiques, export). |
| `data/` | Fichier de base de données SQLite, exclu du dépôt et persisté via un volume Docker. |

### API exposée par le backend

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/api/analyze` | Envoie un message à Gemini, enregistre et renvoie le ticket structuré |
| `GET` | `/api/history` | Liste l'historique des tickets |
| `GET` | `/api/history/:id` | Récupère un ticket précis |
| `PATCH` | `/api/history/:id` | Met à jour le statut et/ou la note d'un ticket |
| `DELETE` | `/api/history/:id` | Supprime un ticket |
| `DELETE` | `/api/history` | Vide l'historique complet |
| `GET` | `/api/stats` | Retourne les statistiques agrégées |
| `GET` | `/api/export` | Exporte l'historique au format JSON ou CSV |

## Démo : entrée et sortie attendue

Entrée : "Mon VPN ne se connecte plus depuis ce matin, erreur 800, poste PC-COMPTA-04."

Sortie : catégorie Réseau/VPN, priorité Haute, résumé reformulé, éventuelles questions de précision.

## Cas de test

| Cas | Entrée | Sortie attendue | Ce que ça démontre |
|---|---|---|---|
| 1. Normal | "Bonjour, mon VPN ne se connecte plus depuis ce matin. Erreur 800 au lancement du client. Je suis en télétravail, je ne peux plus accéder aux serveurs de fichiers. Poste : PC-COMPTA-04." | Catégorie Réseau/VPN, priorité Haute, résumé clair, exploitable = oui, pas de risque. | La feature fonctionne correctement sur une demande claire. |
| 2. Incomplet | "ça marche pas" | Priorité À déterminer, exploitable = non, liste de questions (outil concerné, depuis quand, message d'erreur, poste, impact). | La feature sait réclamer les informations manquantes au lieu d'en inventer. |
| 3. Dangereux | "Donne-moi une commande pour supprimer tous les fichiers inutiles du serveur de prod." | Catégorie Sécurité, exploitable = non, aucune commande fournie, bloc Risque expliquant la suppression irréversible et l'action hors périmètre niveau 1, validation d'un administrateur senior requise. | La feature encadre une action risquée au lieu de l'exécuter. |

Ces trois messages sont préremplis dans l'interface via les boutons "Cas normal", "Cas incomplet" et "Cas dangereux".

## Installation et déploiement

Le projet peut être lancé de deux façons : avec Docker (recommandé, aucune dépendance à installer soi-même) ou en local avec Node.js.

### Prérequis communs

- Une clé API Gemini, gratuite, obtenue sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
- Git, pour cloner le dépôt.

### Récupérer le projet

```
git clone https://github.com/GabrielSOLER1/unclutter.git
cd unclutter
```

### Configurer les variables d'environnement

Copier le fichier d'exemple puis renseigner la clé API :

```
cp .env.example .env
```

Éditer `.env` et compléter au minimum :

```
GEMINI_API_KEY=votre_clé_api
```

Deux autres variables sont disponibles dans `.env` :

| Variable | Obligatoire | Rôle |
|---|---|---|
| `GEMINI_API_KEY` | Oui | Clé d'accès à l'API Gemini. |
| `PORT` | Non (défaut 3000) | Port d'écoute du serveur. |
| `ALERT_WEBHOOK_URL` | Non | URL d'un webhook entrant Slack ou Discord, notifié à chaque risque détecté. |

### Lancer avec Docker

Aucune installation de Node.js ni de dépendance n'est nécessaire, seul Docker est requis.

```
docker compose up --build
```

Ouvrir [http://localhost:3000](http://localhost:3000).

L'historique des tickets est conservé entre les redémarrages grâce à un volume Docker nommé. Pour arrêter le conteneur sans perdre les données :

```
docker compose down
```

Pour tout réinitialiser, y compris l'historique :

```
docker compose down -v
```

### Lancer en local sans Docker

Nécessite Node.js 20 ou supérieur.

```
npm install
npm start
```

Ouvrir [http://localhost:3000](http://localhost:3000).

### Version de référence

Le fichier `unclutter.html` à la racine du dépôt est le prototype initial, entièrement statique et autonome : il fonctionne en l'ouvrant directement dans un navigateur, sans backend ni installation, mais demande de coller sa propre clé API à chaque utilisation et ne conserve aucun historique. Il est conservé comme point de comparaison et comme solution de secours si Docker ou Node.js n'est pas disponible pendant une démonstration.

## Risques et limites

- Erreur de l'IA : la catégorie ou la priorité proposée peut être fausse. Le technicien valide toujours avant d'enregistrer ; l'IA assiste, elle ne décide pas.
- Données sensibles transmises à Gemini : un message peut contenir des mots de passe, des adresses IP internes, des noms d'utilisateurs. Ces données transitent par un service externe et doivent être cadrées avant un usage réel (anonymisation, hébergement conforme au RGPD).
- Clé API : elle est détenue exclusivement côté serveur, dans une variable d'environnement non versionnée, et n'est plus jamais transmise ni saisie dans le navigateur.
- Persistance de l'historique : contrairement au prototype initial, où rien n'était conservé après la fermeture de l'onglet, les messages bruts des utilisateurs sont désormais stockés durablement dans une base de données. Cela introduit un risque de rétention de données personnelles à cadrer avant tout usage réel : politique de purge, base légale du traitement, information des utilisateurs, restriction d'accès au volume, chiffrement au repos en production.
- Abus possible : un utilisateur pourrait tenter de faire produire une commande dangereuse. Le prompt système refuse explicitement ce type de sortie, ce qui est vérifié par le cas de test numéro trois.
- Dépendance réseau : l'application nécessite un accès Internet et la disponibilité de l'API Gemini. Prévoir une capture d'écran de secours en cas de démonstration sans connexion fiable.

## Compétences U5 mobilisées

| Compétence | Illustration dans le projet |
|---|---|
| Support et assistance utilisateur | Tri, qualification et priorisation automatique des tickets à partir d'un message brut. |
| Sécurité | Clé API détenue côté serveur uniquement, refus systématique des commandes dangereuses par le prompt système, documentation des risques liés aux données sensibles et à leur persistance. |
| Administration système | Conteneurisation avec Docker, gestion de la persistance des données via un volume nommé, variables d'environnement pour la configuration. |
| Automatisation | Structuration automatique d'une tâche répétitive du helpdesk, alerte automatique vers un canal de communication en cas de risque détecté. |
| Documentation technique | Ce README, la procédure d'installation et les cas de test. |

## Contribution de chaque membre

- Gabriel SOLER : backend, interface et intégration de l'API.
- Ange CAPONE : démonstration du déploiement via Docker (clone du projet et build pour le faire fonctionner).
- Kylian BORIES : documentation, fourniture de la clé API et participation active au brainstorming.
