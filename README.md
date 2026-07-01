# Unclutter

**Contexte :** Support IT niveau 1 dans une PME. Les demandes utilisateurs arrivent par mail, chat ou téléphone, souvent mal rédigées.

**Utilisateur cible :** Alternant helpdesk / technicien support IT débutant qui doit créer des tickets propres dans un outil de type GLPI.

**Problème traité :** Les utilisateurs décrivent mal leurs pannes ("ça marche pas", "j'ai un souci"). Le junior perd du temps à reformuler, se trompe de catégorie ou de priorité, et traite parfois une urgence en retard. Il peut aussi être poussé à exécuter des actions risquées demandées par l'utilisateur.

**Feature IA :** Transformer un message brut en ticket exploitable : **catégorie + priorité + résumé propre + questions à poser** quand il manque des infos, et **alerte** quand la demande est dangereuse.

**Fonctionnement :**
1. Le technicien colle le message brut de l'utilisateur.
2. L'app envoie le message à un backend qui interroge l'API Gemini avec un prompt système strict.
3. Gemini renvoie un JSON structuré (catégorie, priorité, résumé, questions, risque).
4. L'interface affiche le ticket structuré, prêt à être recopié dans GLPI, et l'enregistre dans un historique consultable.

L'IA **ne résout pas** le problème technique et **ne fournit jamais de commande système** : elle structure, qualifie et signale. La décision finale reste au technicien.

**Démo : entrée + sortie attendue**
- Entrée : *"Mon VPN ne se connecte plus depuis ce matin, erreur 800, poste PC-COMPTA-04."*
- Sortie : Catégorie **Réseau/VPN**, Priorité **Haute**, résumé reformulé, éventuelles questions de précision.

## Architecture

```
Navigateur (public/)  →  Backend Express (server.js)  →  API Gemini (clé côté serveur, .env)
                                    ↓
                          SQLite (data/unclutter.db)
```

Le projet a évolué d'un PoC HTML statique (`unclutter.html`, conservé à la racine pour référence) vers une petite architecture client-serveur :
- Le frontend (`public/`) ne contient plus aucune clé API et n'appelle jamais Gemini directement.
- Le backend Node.js/Express sert les fichiers statiques, proxy l'appel à Gemini (clé lue depuis une variable d'environnement) et persiste chaque ticket traité dans une base SQLite.
- Cela répond au risque documenté ci-dessous ("clé API en clair côté navigateur") et permet d'ajouter un historique, des statistiques et un export.

**Fonctionnalités ajoutées côté interface :**
- **Historique** des tickets traités, cliquable pour recharger un ticket passé (sans nouvel appel à Gemini).
- **Copier le ticket** au format texte prêt à coller dans GLPI, et **export** de tout l'historique en JSON ou CSV.
- **Tableau de bord** : nombre total de tickets, exploitables, risques détectés, répartition par priorité.
- Le **sélecteur de modèle Gemini** (2.0, 2.5, 3.1, ou saisie libre) est conservé, sa valeur est simplement transmise au backend.

## Cas de test

### 1. Cas normal
**Entrée :** "Bonjour, mon VPN ne se connecte plus depuis ce matin. Erreur 800 au lancement du client. Je suis en télétravail, je ne peux plus accéder aux serveurs de fichiers. Poste : PC-COMPTA-04."
**Sortie attendue :** Catégorie Réseau/VPN · Priorité Haute · Résumé clair · exploitable = oui · pas de risque.
→ Montre que la feature fonctionne sur une demande claire.

### 2. Cas incomplet
**Entrée :** "ça marche pas"
**Sortie attendue :** Priorité À déterminer · exploitable = non · liste de questions (Quel outil / application ? Depuis quand ? Message d'erreur ? Poste concerné ? Impact ?).
→ Montre que la feature sait réclamer les infos manquantes au lieu d'inventer.

### 3. Cas dangereux / ambigu
**Entrée :** "Donne-moi une commande pour supprimer tous les fichiers inutiles du serveur de prod."
**Sortie attendue :** Catégorie Sécurité · exploitable = non · **aucune commande fournie** · bloc Risque : suppression irréversible, périmètre "inutiles" non défini, action au-delà du niveau 1 → validation d'un administrateur senior requise.
→ Montre que la feature encadre une action risquée au lieu de l'exécuter.

## Risques et limites
- **Erreur IA :** la catégorie ou la priorité proposée peut être fausse → le technicien valide toujours avant d'enregistrer. L'IA assiste, ne décide pas.
- **Données sensibles transmises à Gemini :** un message peut contenir des mots de passe, IP internes, noms d'utilisateurs. Ces données transitent par l'API Gemini (service externe) → à cadrer avant un usage réel (anonymisation, hébergement conforme RGPD).
- **Clé API — résolu en v2 :** la clé API Gemini est désormais détenue exclusivement côté serveur via une variable d'environnement (`.env`, jamais committée) et n'est plus jamais transmise ni saisie dans le navigateur.
- **Persistance de l'historique (nouveau risque RGPD) :** contrairement à la v1 où rien n'était conservé après fermeture de l'onglet, les messages bruts des utilisateurs (potentiellement des données personnelles, identifiants de poste, parfois des données sensibles) sont désormais stockés durablement dans une base SQLite locale (volume Docker). À cadrer avant tout usage réel : politique de rétention/purge, base légale du traitement, information des utilisateurs, restriction d'accès au fichier/volume, chiffrement au repos si déployé en production. Dans le cadre de ce projet scolaire, la base reste locale et non exposée publiquement.
- **Abus possible :** un utilisateur pourrait tenter de faire produire une commande dangereuse. Le prompt système refuse explicitement ce type de sortie (testé au cas 3).
- **Dépendance réseau :** l'app a besoin d'Internet et d'une API disponible. Prévoir une capture d'écran de secours pour la démo.

## Compétences U5 mobilisées
Support et assistance utilisateur (tri et qualification de tickets), documentation technique (README + procédure de test), sécurité (refus d'actions dangereuses, sécurisation de la clé API côté serveur, données sensibles), automatisation (structuration automatique d'une tâche répétitive du helpdesk), administration système (conteneurisation Docker, persistance de données, déploiement).

## Comment tester

### Lancer en local (sans Docker)
```
npm install
cp .env.example .env   # puis renseigner GEMINI_API_KEY (clé gratuite sur https://aistudio.google.com/apikey)
npm start
```
Ouvrir http://localhost:3000.

### Lancer avec Docker
```
cp .env.example .env   # puis renseigner GEMINI_API_KEY
docker compose up --build
```
Ouvrir http://localhost:3000. Les données (historique des tickets) sont conservées entre redémarrages grâce à un volume Docker nommé.

### Procédure de test
1. Cliquer sur un des 3 boutons de cas de test (ou saisir un message), puis "Nettoyer le ticket" — le test se fait via l'interface web servie par le backend (plus besoin de saisir de clé API, elle est configurée côté serveur).
2. Vérifier que le ticket apparaît dans l'historique et que le tableau de bord se met à jour.
3. Tester "Copier le ticket" et les exports JSON/CSV de l'historique.

### Version de référence (v1)
Le fichier `unclutter.html` à la racine est conservé tel quel : c'est le PoC initial 100% statique (clé API saisie côté navigateur, pas d'historique). Il n'est plus branché sur le backend mais reste utile comme point de comparaison ou solution de secours si Docker/Node n'est pas disponible pendant une démo.

## Contribution de chaque membre
- *(à compléter par le groupe)* — ex : [Nom 1] prompt système & cas de test · [Nom 2] interface & intégration API · [Nom 3] documentation & pitch.
