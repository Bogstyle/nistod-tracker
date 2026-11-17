# NisToD Tracker — Discord + Ashita4/VanaCore

**Version de développement v0.3.0 — non déployée en production.** Le bot Discord v0.2.0 reste déployé tant que le propriétaire n'applique pas volontairement la migration et le code. Dépôt : https://github.com/Bogstyle/nistod-tracker

- [`discord-worker/`](discord-worker/) : Cloudflare Worker avec 37 NM, calendrier fixe/lottery, suivi ToD, `#log`, rappels et modération. En v0.3.0, nouvelle API appairée (`/api/v1/addon/pair`, `/api/v1/addon/events`) et `/nistod-lier`, `/nistod-delier`.
- [`addon/nistod/`](addon/nistod/) : addon Ashita4 en Lua, panneau ImGui, reconnaissance **indicative** de certaines phrases de mort, sélection manuelle du NM et confirmation humaine obligatoire ; ne contrôle aucune action du jeu.
- [`relay/`](relay/) : petit relais local **Node.js 20+**, sur loopback (`127.0.0.1`) uniquement, qui détient la clé d'accès Worker et envoie les ToD en HTTPS depuis l'extérieur du jeu ; file d'attente avec retries et anti-doublons.
- [`DEPLOIEMENT-v0.3.0-FR.md`](DEPLOIEMENT-v0.3.0-FR.md) : installation étape par étape, sans exposer de secrets et sans affecter la v0.2.0 avant déploiement volontaire.

## Fonctionnement

```text
Message combat visible (ou sélection manuelle)
  -> suggestion locale en jeu
  -> le joueur choisit lui-même le NM, sa date et CONFIRME
  -> Lua : HTTP local sur 127.0.0.1 (avec clé d'installation locale)
  -> relais Node : file persistante + authentification liée à Discord
  -> HTTPS Cloudflare Worker : contrôle de la clé, date, NM, doublons, conflits
  -> D1 / #log / tableau Discord déjà validé
```

Aucun ToD n'est envoyé automatiquement suite à un message de chat ; la personne doit d'abord activer la transmission, puis cliquer sur la confirmation finale. `nistod stop` arrête localement les suggestions et les envois. La détection des phrases de mort est volontairement prudente, à adapter au chat effectif de CatsEyeXI lors des tests.

## Conformité aux règles du serveur

Le staff de CatsEyeXI a signalé une pause indéterminée des reviews. Cette pause n'est **pas une autorisation**. La politique publique classe les addons T0/T2 comme autorisés par défaut mais prévoit explicitement que les **nouveaux addons non listés sont à faire réviser avant usage** : https://catseyexi.com/addon-policy. La branche de développement peut être auditée/testée hors serveur pendant cette période. Le propriétaire garde la possibilité de retirer l'addon immédiatement si le staff le demande.

## Revue et tests

`cd discord-worker && npm test` — Worker + SQLite D1 ; `cd relay && npm test` — validation HTTP locale ; `cd addon && texlua test-offline.lua nistod` — simulateur Lua sans Ashita.

**Ne pas confondre tests unitaires avec validation dans le client FFXI.** Ne jamais committer un vrai `.dev.vars`, `wrangler.toml`, `relay/.nistod-state.json` ou `addon/nistod/nistod_local.lua`.

Voir aussi [`SUBMISSION-CATSEYEXI.md`](SUBMISSION-CATSEYEXI.md) (soumission historique v0.2.0 et maquette v0.0.1), à actualiser pour une nouvelle revue de la v0.3.0.
