# NisToD Tracker — v0.3.1 beta

**CatsEyeXI community NM/HNM ToD tracker** — [GitHub repository](https://github.com/Bogstyle/nistod-tracker).

## Current components

- `discord-worker/` — Cloudflare Worker, Discord UI, D1, subscriptions, mod audit, authenticated addon API.
- `addon/nistod/` — Ashita4/VanaCore Lua addon. **Automatically observes exact NPC deaths using incoming read-only action-message packets `0x029`**; no chat text dependency. Does not send any gameplay action or modify a packet.
- `relay/` — local Node.js server listening **only on `127.0.0.1:38461`**, reliably queues events and forwards via HTTPS with a revocable Discord-linked token. No Discord bot token in the addon.

Production Discord bot was confirmed functional at v0.2.0. **v0.3.1 code is a beta, not deployed or tested in a real VanaCore client by this project.** Follow [`DEPLOIEMENT-v0.3.1-FR.md`](DEPLOIEMENT-v0.3.1-FR.md) before any voluntary deployment.

## Automatic detection, not chat filtering

Ashita4 `packet_in` receives unmodified incoming packets. We use **message IDs 6 and 20 from `0x029`**, followed by checks that the dying entity's **full server ID and exact name** match a member of the 37-NM catalog. The event is queued for the local relay with no player interaction; the addon only prints **`[NisToD] ToD TRANSMIS et accepte` after the Cloudflare Worker has accepted it**. Duplicate deaths of the same entity are suppressed for 10 minutes. Name or ID unknown? Ignore instead of risking a false report.

The packet path does not require `text_in`, and so should be independent of UI chat filters. It cannot detect deaths the **client never receives**, and cannot know a name after the entity has already been removed from the client entity table; such events are deliberately skipped. These cases require real-game testing.

**Automatic sending starts when the relay configuration file `nistod_local.lua` exists.** `/nistod auto off`, `/nistod stop`, stopping the relay, or `/nistod-delier` can disable it. No auto-target/claim/attack/movement, no outgoing game packets.

## Safe end-to-end simulation

`/nistod sim behemoth` sends an authenticated `SIMULATION` event through the same addon→local relay→Worker path. The Worker stores it only in `addon_simulations` (migration `0007`), **never** in `tod_events`, `current_tods`, reminders or `#log`, and never updates the public panel. On confirmation the addon prints **`SIMULATION RECUE par Cloudflare ... aucun ToD publie`**. Requires pairing and running relay; does not pretend that a packet was received.

The regular button for *manual death declarations* remains available with human confirmation and UTC time adjustment. It is not required when an explicit packet death is recognized.

## Tests (without FFXI)

```bash
cd discord-worker && npm install && npm test   # 66 JS tests
cd ../relay && npm test                          # 7 relay & full API+SQLite integration tests
cd .. && texlua addon/test-offline.lua addon/nistod # 31 Lua tests
```

Tests verify packet decoding, filter-independent matching, exact entity ID/name verification, forged packet rejection, rate-limited dedup, delivered-only chat notification, simulation with zero real ToD, registration, token pairing, and historic Worker behavior. A test suite cannot prove specific CatsEyeXI packet delivery/format in game.

## Staff policy

The [CatsEyeXI addon policy](https://catseyexi.com/addon-policy) distinguishes information addons from gameplay automation, but the staff has paused reviews of new addons indefinitely (as reported by the owner). **A paused review is not permission.** The new automatic reporting behavior has **not** been approved. The source is public for inspection and can be disabled/revoked.

Project-specific security notes: [`SECURITY-AND-DATA-FLOW.md`](SECURITY-AND-DATA-FLOW.md). No production secrets or populated `wrangler.toml` are in this repository.
