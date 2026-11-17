# CatsEyeXI addon review request — NisToD Tracker

**Project:** NisToD Tracker  
**Author / CatsEyeXI character:** Nisroch  
**Environment:** CatsEyeXI, FFXI client via VanaCore / Ashita4 (future addon), Discord bot via Cloudflare Workers + D1  
**Submission date:** 17 November 2026  
**Source:** https://github.com/Bogstyle/nistod-tracker  
**Requested status:** Staff review **before use of any connected in-game addon**.

## Purpose

Offer a community, opt-in ToD (time of death) register for notorious monsters and HNMs. Players manually submit a witnessed death time in Discord; the bot calculates an estimated respawn window or, for lottery spawns, an **earliest possible return** rather than a guaranteed spawn. The tracker currently has 37 entries. Any community member using the Discord server can read the shared panel; no game-state detection is currently in use.

## What already exists and is in use

- An **external Discord bot** (v0.2.0), running on Cloudflare Workers and D1; users report ToDs by choosing an NM and entering a date/time. It maintains an auditable `#log`, permits moderator invalidation and optional Discord DMs.
- It **does not log in to FFXI, read game packets, access a character, control input, or contact the CatsEyeXI game server**.
- Its reminders are Discord messages only; they perform no actions on a character.

## What the submitted Ashita4 addon does TODAY

The included v0.0.1 is an **offline, local UI mockup**, not a production addon. Its ImGui panel lists the same 37 NMs and lets a player simulate “seen alive” or “death observed,” review the timestamp, and confirm or cancel locally. There are **no network requests, Discord messages, game packets, entity scans or game commands**. It has not been executed/tested in a live VanaCore client and is not being represented as approved.

## What we would like to build IF staff approves

1. A passive, read-only helper that looks **only at information normally visible to that player** (for example, unambiguous combat messages already shown to the client). We will follow any staff restrictions on which Ashita events/data can be used.
2. It may suggest that a tracked NM died, but it will **never infer death from despawning, disappearance from target or Wide Scan, zoning, or an entity appearing when entering a zone**.
3. The player must **manually confirm** the NM, zone (where relevant) and observed time. Unclear evidence cannot become an automatic ToD.
4. Only after confirmation, an authenticated **HTTPS request to our external Discord Worker**, never a packet to the FFXI server. We will use pairing/revocable installation credentials (not the Discord bot token), minimal data and rate limits. This endpoint and pairing system **do not yet exist**.
5. We may later show upcoming community-reported windows inside a passive UI. No targeting, claiming, attacking, movement, macros, pathfinding, scans of hidden entities, or automatic gameplay actions, attended or unattended.

## Boundaries and anti-abuse controls

- No unattended play, automated claims, auto-targeting, skill usage, movement or actions sent to the game server.
- No visibility into hidden/invisible entities, off-screen information not legitimately available to the client, other players' private information, or server-only data.
- No packet injection, altered client/server timing, or bypass of gameplay restrictions.
- No automatic publication from ambiguous observations. Human-confirmed reports remain attributable and moderators can invalidate erroneous ToDs; the Discord audit trail remains.
- Outgoing data would be minimized (NM identifier, relevant zone, observation time, installation/account authorization, evidence class); no inventory, coordinates, messages by third parties or raw combat-log dumps.
- The fully connected implementation would be submitted for **a new review** before any in-game use; the mockup is not a substitute for reviewing unbuilt code.

## Questions for CatsEyeXI staff

1. Is the **external, manually operated Discord ToD tracker** subject to any CatsEyeXI addon restrictions, given that it has no game-client integration?
2. Would an **on-screen, local-only ImGui NM notebook** (current prototype) fit T0/T2 under the policy, and may it be tested in-game?
3. May an Ashita4 addon read **only combat messages already visible to the player** to suggest an NM death, with an explicit human confirmation? Are there preferred APIs/events or excluded sources?
4. Is a **player-confirmed outbound HTTPS submission to a third-party Discord bot** acceptable? Does sharing community HNM timers raise any separate policy concerns?
5. Which exact changes would require renewed approval, and would staff like a separate ticket when the connected addon code exists?

We are asking for a classification and guardrails, **not claiming the current or future addon is approved**. We will keep the in-game integration disabled until receiving a clear staff verdict, and can adjust the source based on feedback.

## References

- Official CatsEyeXI addon policy: https://catseyexi.com/addon-policy
- Source files: `addon/nistod/`, `discord-worker/src/`, `discord-worker/migrations/`.
