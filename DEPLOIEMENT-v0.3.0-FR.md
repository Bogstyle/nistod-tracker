# NisToD v0.3.0 — installation progressive (BÊTA NON DÉPLOYÉE)

**Important :** le staff CatsEyeXI a suspendu la revue des addons. La mise en pause ne constitue **pas une approbation**. La page officielle indique que les addons absents de la liste approuvée nécessitent une revue avant utilisation. L'installation en jeu relève de cette règle ; demander une clarification ou tester hors du serveur tant que la revue est suspendue. Voir <https://catseyexi.com/addon-policy>.

## Ce qui change

- Le bot Discord v0.2.0 reste inchangé sur son tableau, son journal `#log` et sa logique de fenêtre.
- Le Worker v0.3.0 ajoute une API d'observation sécurisée et deux slash commandes : `/nistod-lier` et `/nistod-delier`.
- L'addon v0.3.0 propose une suggestion de ToD lorsqu'une phrase de mort exacte apparaît dans le chat anglais ; il ne l'envoie **jamais** sans confirmation manuelle. La saisie manuelle du NM fonctionne si le message du jeu diffère.
- Un relais Node.js local sur `127.0.0.1:38461` transmet la déclaration au Worker via HTTPS. Pas de token Discord dans l'addon, pas de socket distant dans FFXI.
- Aucun déploiement Cloudflare n'est inclus dans ce ZIP : c'est à faire depuis le PC.

## 1 — Préparer le Worker Cloudflare

1. Télécharger / décompresser cette version dans **un nouveau dossier**.
2. **Conserver et copier** depuis l'ancienne installation v0.2.0 le `wrangler.toml` de production (avec D1, noms de bindings, variables publiques des salons et du serveur) vers `discord-worker/wrangler.toml`. **Ne jamais le publier sur GitHub.** Le fichier `wrangler.toml.example` du dépôt est volontairement neutre.
3. Faire, si possible, une sauvegarde de la D1 avant migration.
4. Dans PowerShell, depuis `discord-worker` :

   ```powershell
   npm install
   npm test
   npm run db:remote
   ```

   **Vérifier la migration `0006_addon_link.sql` : réussite obligatoire avant déploiement.** Les anciennes migrations ne doivent pas être rejouées.

5. Après succès uniquement :

   ```powershell
   npm run deploy
   ```

6. Les nouvelles commandes Discord doivent être enregistrées **une seule fois**. Utiliser les IDs PUBLICS de son application et du serveur, ainsi que le bot token saisi de façon sécurisée localement (ne jamais transmettre le token à ChatGPT) :

   ```powershell
   $env:DISCORD_APPLICATION_ID = "VOTRE_APPLICATION_ID"
   $env:DISCORD_GUILD_ID = "VOTRE_GUILD_ID"
   $secret = Read-Host "Token du bot Discord" -AsSecureString
   $env:DISCORD_BOT_TOKEN = [System.Net.NetworkCredential]::new("", $secret).Password
   npm run register
   Remove-Item Env:DISCORD_BOT_TOKEN
   Remove-Variable secret
   ```

   Attendu : les **6 commandes** (quatre anciennes + `nistod-lier`, `nistod-delier`) apparaissent, sans nouvelle publication de panneau. `/nistod-publier` est inutile.

## 2 — Préparer le relais local Node.js

Node.js **20+** doit être installé (tu l'utilises déjà pour le Worker). Le relais est un processus séparé à démarrer lorsque tu souhaites envoyer des ToD ; il ne modifie rien dans FFXI.

1. Copier les fichiers `addon/nistod/` (`nistod.lua`, `catalog.lua`, `detector.lua`) dans le dossier d'addons VanaCore/Ashita **pour un banc de test autorisé**.
2. Ouvrir PowerShell dans le dossier `relay` de cette archive :

   ```powershell
   node index.mjs setup "https://VOTRE-WORKER.workers.dev" "C:\chemin\vers\VanaCore\addons\nistod"
   ```

   Cette commande écrit `nistod_local.lua` dans l'addon et `.nistod-state.json` dans `relay/`. **Garder ces fichiers privés.**

3. Dans Discord, taper `/nistod-lier` : un code temporaire est affiché uniquement à toi. Dans PowerShell :

   ```powershell
   node index.mjs pair ABCD-1234-ABCD-1234
   ```

   Remplacer par ton code privé. Ne le poster nulle part.

4. Lancer le relais :

   ```powershell
   node index.mjs start
   ```

   Garder cette fenêtre ouverte pendant le test. **Ctrl+C** arrête le relais. Pas de port réseau ouvert sur le LAN ni Internet : 127.0.0.1 uniquement.

5. Pour révoquer l'accès de TOUTES tes installations : `/nistod-delier` dans Discord. L'identité Discord du joueur (et non le nom qu'il saisit) est utilisée pour attribuer une déclaration.

## 3 — Premier essai de l'addon

**Ne pas l'utiliser sur CatsEyeXI tant que sa conformité n'a pas été clarifiée**, conformément à leur page d'autorisation des nouveaux addons. Sur un client Ashita de test, charger via `/addon load nistod`.

L'interface démarre **en simulation**. Sélectionner un NM, cliquer `Déclarer une mort constatée`, puis `SIMULER CONFIRMATION` : aucun envoi n'est effectué. Le scanner de chat ne fait qu'une suggestion locale (en anglais, quatre formes de message de mort). Il ne scanne pas les packets ni les entités cachées.

Pour un **vrai ToD** constaté, après installation autorisée et test du relais, cliquer `Activer envoi manuel`, choisir le NM, confirmer la mort, puis ajuster au besoin l’heure UTC avec les boutons ±1/5 min et cliquer `CONFIRMER ET TRANSMETTRE`. Le relais renvoie d'abord **en attente** ; cliquer `Vérifier le résultat Discord` pour confirmer la réception finale. Si l'envoi échoue, une file d'attente locale réessaie sans bloquer le jeu. Un signalement contradictoire apparaît dans `#log` mais ne remplace pas le ToD en cours.

Commandes : `/nistod show`, `/nistod hide`, `/nistod status`, `/nistod stop` (coupe envoi et suggestions immédiatement), `/nistod start` (relance suggestions, mais **pas l'envoi**), `/addon unload nistod` (désinstaller de la session).

## Sécurité et limites actuelles

- **BÊTA technique :** testé en Node/SQLite et Lua simulé, **pas encore dans un véritable client VanaCore/Ashita4**. Les phrases de mort du chat de CatsEyeXI n'ont pas été capturées et peuvent différer ; la sélection manuelle reste disponible.
- L'addon ne déclenche aucune action de gameplay, n'utilise pas `packet_in`/`packet_out`, n'accède pas à la position, n'autoclaim rien. Il ne lit que les lignes de chat déjà reçues par le joueur, et ne transmet rien sans deux clics explicites.
- Les déclarations apparaissent dans le Discord réel après acceptation : éviter les ToD fictifs si une validation en production n'a pas été annoncée. `/nistod-retirer` est disponible pour un administrateur, avec audit permanent.
- La révocation ne supprime pas les ToD historiques déjà validés.
- Pour les NMs à noms identiques ou multi-spawns (Carmine Dobsonfly/Yilbegan), la v0.3.0 ne crée pas de faux suivi fusionné ; ils ne font pas partie du catalogue actif.
