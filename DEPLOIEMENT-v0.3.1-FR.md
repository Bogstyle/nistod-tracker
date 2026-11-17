# NisToD v0.3.1 bêta — Installation étape par étape

**Statut :** code développé et testé hors jeu ; **aucun déploiement Cloudflare ni test réel sous VanaCore effectué par l'assistant**. Le staff CatsEyeXI a suspendu la revue des addons ; cela ne constitue pas une autorisation. Voir https://catseyexi.com/addon-policy.

## Ce qui change

- La lecture automatique passe de `text_in` aux paquets entrants `0x029` (codes 6/20), pour ne pas dépendre de la visibilité du chat.
- À la réception d'une mort explicite dont l'identifiant de cible ET le nom de NM sont vérifiés, le ToD est envoyé **sans clic** au relais local, puis au Worker.
- Le chat affiche `[NisToD] ToD TRANSMIS et accepte` **uniquement après accusé distant**. En cas de conflit, un message distinct apparaît.
- `/nistod sim behemoth` teste le circuit réseau et l'appairage **sans écrire de ToD actif ni notifier le serveur Discord**.
- Le Worker utilise les migrations `0006_addon_link.sql` et `0007_addon_simulations.sql`, et deux nouvelles slash commandes `/nistod-lier` et `/nistod-delier`.
- L'interface Discord, `#log`, la modération, le Cron et les 37 NM restent inchangés.

## Phase 1 — Worker

1. Décompresser dans un **nouveau dossier**. Ne pas écraser le dossier actuellement en production avant validation.
2. Copier `discord-worker/wrangler.toml` **depuis le dossier de déploiement v0.2.0 sur ton PC** vers ce nouveau `discord-worker/`. Le fichier versionné `wrangler.toml.example` est volontairement neutre. **Ne pas publier le vrai fichier.**
3. Sauvegarder D1 si possible. PowerShell ouvert dans `discord-worker` :

```powershell
npm install
npm test
npm run db:remote
```

Les migrations précédentes sont reconnues par Wrangler et seules `0006`/`0007` non encore appliquées doivent s'exécuter. Si la migration échoue, **arrêter** avant de déployer.

4. Après succès de la migration :

```powershell
npm run deploy
```

5. Enregistrer les deux nouvelles commandes (sans republier le panneau) en utilisant les IDs publics **de ton propre projet** et ton jeton Discord uniquement dans PowerShell :

```powershell
$env:DISCORD_APPLICATION_ID = "TON_APPLICATION_ID"
$env:DISCORD_GUILD_ID = "TON_GUILD_ID"
$secret = Read-Host "Token du bot Discord" -AsSecureString
$env:DISCORD_BOT_TOKEN = [System.Net.NetworkCredential]::new("", $secret).Password
npm run register
Remove-Item Env:DISCORD_BOT_TOKEN
Remove-Variable secret
```

Si les commandes sont déjà enregistrées d'une bêta v0.3.0, leur réenregistrement est facultatif. Ne pas lancer `/nistod-publier`.

## Phase 2 — Addon et relais local

Copier `addon/nistod/nistod.lua`, `catalog.lua` et `packet_detector.lua` dans `<VanaCore>/addons/nistod/`. Ne pas utiliser l'ancien détecteur `detector.lua` basé sur le chat.

Dans le dossier `relay`, lancer :

```powershell
node index.mjs setup "https://nistod-tracker.bogoverworld.workers.dev" "C:\chemin\vers\VanaCore\addons\nistod"
```

Cette commande écrit le fichier secret `nistod_local.lua` à côté du Lua. Ensuite, dans Discord : `/nistod-lier` (code éphémère privé). Dans PowerShell :

```powershell
node index.mjs pair TON-CODE-PRIVE
node index.mjs start
```

Laisser le relais ouvert (port local **127.0.0.1:38461**, pas de serveur LAN). Le jeton n'est jamais donné à l'addon ni mis sur GitHub.

## Phase 3 — Test de simulation sans faux ToD

Avec l'addon chargé sur le client de test `/addon load nistod`, et **le relais appairé et démarré**, saisir :

```text
/nistod sim behemoth
```

Dans le chat, l'addon indique que la simulation est demandée, puis doit afficher **`SIMULATION RECUE par Cloudflare ... aucun ToD publie`** après acceptation distante. Le panneau Discord et `#log` doivent rester inchangés. En cas de problème : `/nistod status`, la fenêtre de console du relais et `#log` (ce dernier ne doit pas recevoir de simulation).

## Phase 4 — Détection réelle (uniquement lorsque l'usage est permis)

Au chargement, si le relais est configuré, `Auto ToD` est **actif par défaut**. Pas de confirmation par mort. L'addon ignore silencieusement tout événement dont le paquet, l'identifiant de cible ou le nom exact n'est pas vérifiable. Il est normal que certains décès ne soient pas détectés si le client ne dispose plus de l'entité.

- `/nistod auto off` : suspend l'envoi automatique.
- `/nistod auto on` : réactive la détection et l'envoi.
- `/nistod stop` : coupe l'ensemble des transmissions de cet addon.
- `/nistod start` : réactive après arrêt.
- `/nistod hide`, `/nistod show`, `/nistod status` : affichage/état.
- `/addon unload nistod` : décharge l'addon.
- Ctrl+C : arrête le relais ; `/nistod-delier` : révoque les autorisations de l'utilisateur.

Un vrai ToD enregis­tré peut être invalidé avec `/nistod-retirer` par un administrateur ; l'historique `#log` est conservé. Les décès détectés hors portée du client, et certains NM aux noms/espaces de spawn ambigus, ne peuvent pas être garantis.

## Limites et contrôles

Tests : **104 réussis (66 Worker + 7 relais + 31 Lua simulés)**. Ils ne prouvent ni la forme exacte des paquets CatsEyeXI en jeu, ni la compatibilité de LuaSocket de ton installation VanaCore. Une requête HTTP locale est bornée à 120 ms, mais pourrait provoquer une petite latence de frame si le relais bloque. Si le relais est indisponible, la file d'attente de l'addon reste uniquement **en mémoire** jusqu'à acceptation locale ; fermer le jeu avant cette acceptation perd ces déclarations. La file du relais est persistante une fois le dépôt local reçu.
