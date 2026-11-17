# NisToD Tracker — CatsEyeXI addon review

**Status: request for staff review; this repository is not evidence of approval.**

Repository: https://github.com/Bogstyle/nistod-tracker  
Project owner: Nisroch (CatsEyeXI).  
Source prepared: 17 November 2026. Not affiliated with CatsEyeXI or its staff.

## Two different components

| Component | Version | Current state | Interaction with FFXI |
|---|---|---|---|
| Discord tracker (`discord-worker/`) | v0.2.0 | In use in a community Discord, with **manual** ToD entry | **None** — it does not connect to the game client or game server |
| Ashita4 / VanaCore addon (`addon/nistod/`) | v0.0.1 | **Local UI demonstration only**, not live-tested and not approved | No packet reads, no scanning, no network, no ToD submissions |
| Proposed integration | Not built | **Design submitted for staff guidance** | Would read only locally visible combat evidence, ask the user to confirm, then transmit via HTTPS outside the game |

NisToD helps players **share voluntarily reported NM death times** and view estimated next spawn windows. The Discord tracker currently supports 37 NM entries, differentiated between bounded windows and lottery/cooldown behavior. No claim that a lottery monster is guaranteed to appear.

## Source code for review

- [`SUBMISSION-CATSEYEXI.md`](SUBMISSION-CATSEYEXI.md) — complete scope, guardrails and questions for staff.
- [`GM-TICKET-EN.md`](GM-TICKET-EN.md) — concise text for a GM ticket.
- [`addon/nistod/nistod.lua`](addon/nistod/nistod.lua) — current local ImGui demo.
- [`addon/nistod/catalog.lua`](addon/nistod/catalog.lua) — list of 37 NM names and zones.
- [`discord-worker/src/`](discord-worker/src/) — live v0.2.0 Discord Worker source used as the basis for this review packet.
- [`SECURITY-AND-DATA-FLOW.md`](SECURITY-AND-DATA-FLOW.md) — present architecture and proposed (not implemented) network flow.

## Current addon limits (important)

The demo allows the user to select an NM and locally simulate “Seen alive” and “Death observed”, with a confirmation step. **It has no real death detector and sends nothing anywhere.** It does not query hidden entities, packet streams, health or target state. It has not been tested in a live VanaCore client. The demo source is supplied for inspection only, not installation on CatsEyeXI pending staff guidance.

## Worker implementation notes

The Discord Worker handles user-entered ToDs, private subscriptions/reminders and an admin invalidation log. Its `/discord/interactions` endpoint verifies Discord's interaction signatures. It currently **does not expose an addon-submission API**. The concept in the submission document must not be mistaken for implemented code.

To inspect the Worker locally with Node.js:

```bash
cd discord-worker
npm install
npm test
```

The source archive originally passed 58 tests; live operator subsequently reported the v0.2.0 menu/form working. The addon is not runtime-tested.

`discord-worker/wrangler.toml.example` is a **sanitized example**. No production D1 identifiers or Discord IDs are included in the example, and real tokens are excluded from this package. Do not deploy this review repository as if it were an operational configuration.

## Policy and approval

Official policy: https://catseyexi.com/addon-policy — unlisted addons should be presented to staff via a Discord GM ticket linking their source. Staff must decide whether and under what constraints the proposed addon may be used. A Discord-only bot and an Ashita addon are described separately so the scope is not misleading.

**No license is granted for third-party reuse by this review packet.** The owner can choose a license before public release.
