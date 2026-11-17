# Security, information scope and data flow

## Existing production flow (fully external to FFXI)

```
Discord user -> Discord slash command / buttons
             -> Discord signed interaction -> Cloudflare Worker -> D1
                                                         |          |
                                                 #nm-tracker    #log
                                                         |
                                                   optional Discord DM
```

- The bot verifies Discord's Ed25519 signature and restricts to the configured Discord server.
- D1 stores NM catalog, manual ToDs, audit events, user timezone preferences and optional DM subscriptions.
- Admin invalidation removes a current ToD and preserves the event trail.
- Current Worker has no addon endpoint and no connection to any CatsEyeXI infrastructure.
- It checks a Cron schedule for reminders. This does not control the game.

## Current addon mockup

```
Player clicks local ImGui button -> local confirmation -> in-memory preview ONLY
```

No packet parsing, memory scanning, HTTP request, persistent data file, bot connection or remote telemetry. `addon/nistod/nistod.lua` is the whole current UI logic.

## Potential future addon integration — NOT IMPLEMENTED

```
Unambiguous information already visible to player
      -> passive local interpretation (only if approved)
      -> player manually confirms NM + zone + observed time
      -> HTTPS POST to new Worker endpoint (not implemented)
      -> validation, actor authorization, deduplication and moderation
      -> only then update Discord tracker
```

- Only the staff-approved data sources may be read.
- Missing target, Wide Scan disappearance, zone transitions and despawns **must not** prove death.
- Future credentials must be separately paired, scoped and revocable; the Discord bot token is never placed in an addon or repository.
- Store/transmit the minimum needed to make a user-confirmed report: NM slug, relevant zone, UTC time, a request ID to prevent duplicate reports, and an installation authentication subject. No fine location, nearby player identities, complete chat log, inventory or character credentials.
- Prevent duplicates, replay, stale/future clock events, and false reports; retain admin invalidation with audit trail.
- A source-code update that adds any game event reader or network code is a **material behavioral change** to be re-reviewed by staff.

## Policy and status

https://catseyexi.com/addon-policy distinguishes T0 cosmetic, T1 approved attended gameplay action, T2 read-only information, prohibited T3 unattended botting and prohibited T4 cheating. This design is submitted for staff classification. The fact that it intends no gameplay action is not itself a substitute for staff approval.

## Secret-handling for this review package

- Production Discord/Cloudflare tokens and populated `.dev.vars` files are **not included**.
- The production `wrangler.toml` (which contains concrete deployment IDs) was replaced by `wrangler.toml.example` with placeholders.
- Actual code, migrations and tests are provided under `discord-worker/` for audit.
- `.gitignore` excludes runtime secrets, deployment configuration and dependencies.
- **Do not push real credentials or a production database dump to GitHub**.
