# NisToD v0.3.1 — Security, audit and data flow

## 1. Current Discord-only production

Player submits a ToD via Discord → signed interaction → Cloudflare Worker → D1 → public panel, mod journal `#log`, opt-in DMs. No access to the CatsEyeXI server.

## 2. New addon beta (not deployed by this code release)

```text
Incoming FFXI packet 0x029 (unaltered, read-only)
  -> explicit death message (6 or 20)
  -> verify target index + full target server ID + name in current client entity table
  -> exact match to one of the 37 NM catalog entries
  -> local in-memory cooldown / queue (no outgoing FFXI packets)
  -> localhost relay (127.0.0.1:38461, local private key)
  -> HTTPS + revocable token (stored in relay, not Lua)
  -> Cloudflare Worker validates event type, timestamp, caller identity and catalog NM
  -> D1 / public ToD / normal mod log
  -> relay polls delivery status
  -> addon displays a confirmation in local in-game chat ONLY after Worker acknowledgement
```

`text_in` is not used for automatic ToDs; filtered or hidden chat text should not prevent reception of the original packet. **If CatsEyeXI/FFXI does not deliver the death packet to the player, or the entity is no longer in the local table, nothing is transmitted.** Only exact ID/name matches are admitted. A client token is not cryptographic proof of packet integrity; the Worker cannot independently inspect a player's game session. Therefore reports can still be wrong or malicious and remain subject to moderation.

No scan of hidden/remote entities, no player coordinates, no entity targeting, no gameplay commands, no packet injection/modification. **The data passed out contains NM slug, UTC observation time, death message ID and target server ID, event UUID, and authenticated account association.** No chat lines, other player names or credentials.

## 3. Simulation: isolated state

```text
/nistod sim behemoth -> local queue -> localhost relay -> HTTPS
    -> paired Worker -> addon_simulations (0007 migration) -> response state=simulation
    -> relay state delivered -> local chat confirmation
```

Simulation is **never** converted to a `tod_events` or `current_tods` row, is not added to `#log`, and triggers no refresh or reminder. Idempotent UUID avoids duplicate simulation records. It is intentionally not a simulation of the actual packet hook; that must be tested separately. Sending `SIMULATION` requires a valid scoped pair token and a valid NM slug.

## 4. Controls and caveats

- Pairing: `/nistod-lier`, short one-time code, local `node index.mjs pair ...`; revoke via `/nistod-delier`.
- Secrets: `.nistod-state.json` (relay) and `nistod_local.lua` are excluded by `.gitignore`; never commit real tokens, database dumps or production `wrangler.toml`.
- Stop: `/nistod auto off` disables automatic packet submissions, `/nistod stop` disables all addon transmissions; shut down relay with Ctrl+C; revoke token on Discord.
- The relay durably queues accepted local submissions, retries temporary failures and exposes keyed local delivery status. If it is offline before acknowledgement, the addon keeps a bounded **in-memory** queue that is lost on addon/client exit.
- Local HTTP calls are short-timeout (120 ms) and made outside the packet callback (in the render tick); they can still briefly affect the game frame if the local relay hangs.
- The staff paused reviews of new addons. Approval for this new feature has not been received. Source remains available for independent inspection.
