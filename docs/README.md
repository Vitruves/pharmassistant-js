# Documentation de pharmassistant

Client JavaScript et TypeScript officiel de l'API PharmAssistant. Chaque page traite un sujet de bout en bout, avec des exemples prêts à copier.

## Guides

| Page | Pour |
|---|---|
| [Démarrage](demarrage.md) | installer, poser une clé, première question en trente secondes |
| [Poser une question](questions.md) | toutes les options d'`ask`, lire la réponse, demande de précision |
| [Sources et citations](citations.md) | références par base, repères `[S1]` dans le texte, extraits qui portent chaque phrase |
| [Réponse en flux](flux.md) | afficher la réponse au fil de la rédaction, suivre chaque étape, annuler |
| [Conversations](conversations.md) | poursuivre un échange, historique chez vous ou gardé par le serveur |
| [Erreurs, quotas et nouveaux essais](erreurs.md) | chaque exception, chaque code, ce qui est décompté, ce qui est réessayé |
| [Configuration](configuration.md) | délais, annulation, journal, `fetch` fourni, proxy |
| [Environnements](environnements.md) | Node.js, Deno, Bun, Cloudflare Workers, Next.js ; jamais le navigateur |

## Pour aller plus loin

| Page | Pour |
|---|---|
| [Recettes](recettes.md) | Express, Next.js, Cloudflare Workers, traitement par lots, rendu HTML des citations, tests sans réseau |
| [Référence](reference.md) | chaque classe, méthode, type et attribut public |
| [Venir du fichier unique](fichier-unique.md) | passer du `curl -O` au paquet sans rien réécrire |
| [Données patient](confidentialite.md) | ce qui ne doit jamais partir vers l'API |

Le contrat HTTP complet (routes, schémas, en-têtes) est décrit sur [api.pharmassistant.fr/docs](https://api.pharmassistant.fr/docs). Le même client existe en Python : [pharmassistant-python](https://github.com/Vitruves/pharmassistant-python).
