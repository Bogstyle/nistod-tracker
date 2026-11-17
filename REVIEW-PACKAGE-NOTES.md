# Development update — v0.3.0 (17 November 2026)

This repository has advanced beyond the original review archive. The original notes below refer to the **historical v0.2.0 worker and v0.0.1 addon mockup**, not the latest sources on `main`. For the new sources, see `addon/nistod`, `relay`, `discord-worker/src/addon-api.js`, migration `0006_addon_link.sql` and deployment guide `DEPLOIEMENT-v0.3.0-FR.md`. No secret files, production D1 IDs or Discord tokens have been added.

---

# Source inventory and review scope

Prepared from exact locally available project archives:

- `NisToD-Tracker-starter-v0.2.0.zip` — Discord Worker, 58 local tests in previous verification. Production version reported as installed/functional by owner.
- `NisToD-addon-maquette-v0.0.1.zip` — standalone offline UI mockup, not live-tested.

The review package copies the current Worker source, migrations, tests and package metadata. To avoid exposing live deployment IDs, the two `register-commands.mjs` default IDs are removed and replaced by required environment variables, while three public snowflake IDs in two test fixtures are replaced by mock IDs. The addon `nistod.lua` and `catalog.lua`, all Worker `src/` and all migrations are copied unchanged.

Intentionally excluded:

- **Production `wrangler.toml`** with live Discord and D1 IDs, replaced with sanitized example.
- Historical French changelogs and local deployment tutorials that refer to now-obsolete version status, which could confuse staff.
- Secrets, `.dev.vars` with credentials, tokens, Cloudflare database records, Discord user data and logs.

GitHub repository creation and publication is a separate action. A ZIP file being ready for GitHub does not mean it has been published, and the code is not approved by CatsEyeXI.
