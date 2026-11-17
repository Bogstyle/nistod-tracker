# NisToD Tracker v0.3.1 — Updated CatsEyeXI review dossier

**Owner:** Nisroch / Bogstyle  
**Public source:** https://github.com/Bogstyle/nistod-tracker  
**Approval status:** NOT APPROVED; staff reports addon reviews currently suspended indefinitely. Do not mistake the ability to build or test the code for an authorization to use it on the server.

## Functional description

Existing: Discord bot v0.2.0 with voluntarily reported NM deaths, 37 NM entries, spawn windows/lottery labels, audit logs, reminders and moderation.

Proposed connected beta: Ashita4/VanaCore addon v0.3.1 plus a local Node relay and Cloudflare Worker API. The addon **passively** observes incoming 0x029 action-message packets, selects message IDs 6/20 indicating death, verifies the full server ID and name of a locally visible NM in the catalog, and transmits automatically without the player's per-death confirmation. It never acts in the game world and does not use `text_in` for detection.

## Scope and limits

- No `packet_out`, packet injection or modification; no claiming, attacking, movement, targeting or automation of gameplay.
- Read-only access to incoming 0x029 messages and locally known entity name/ID, not remote/hidden entities.
- The client may lack the packet or entity data; the addon will fail closed and miss such cases.
- Duplicate-suppression by entity and cooldown; backend idempotency by UUID, conflict handling and moderator invalidation.
- No Discord bot token in the addon. A token scoped to the paired user stays in a local Node companion. Events use TLS to the Worker and are attributed to the authenticated account.
- Automatic events are marked `source=packet_death`, include message ID, server entity ID and UTC time. The cloud cannot independently verify that a client genuinely received a packet.
- In-game chat notification only after confirmed delivery to the Worker.
- Safe `SIMULATION` event is persisted only in an isolated D1 table, never as a live ToD, journal item or reminder.

## Questions for future staff review

1. Does purely passive `0x029` read-only packet handling fall within T2 on CatsEyeXI?
2. Does **automatically sharing** that observation with external Discord viewers change the classification despite no gameplay action?
3. Are the locally visible entity ID/name lookups acceptable?
4. Are additional rate limits, staff controls or changes to the automatic reporting behavior needed?

References: https://catseyexi.com/addon-policy and [`SECURITY-AND-DATA-FLOW.md`](SECURITY-AND-DATA-FLOW.md).
