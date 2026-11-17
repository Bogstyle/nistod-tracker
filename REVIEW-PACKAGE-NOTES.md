# Review package notes — NisToD v0.3.1 beta

- Code of the Discord Worker, Ashita4 addon and localhost relay included; 37 catalog NMs.
- Added `addon/nistod/packet_detector.lua` using read-only 0x029 message IDs 6/20, target server ID and exact name checks; no chat filter dependency.
- Automatic transmission of exact packet deaths; local chat notification after confirmed Cloudflare delivery, with deduplication and offline retry behavior.
- Added `/nistod sim behemoth` and `addon_simulations` table in additive `0007_addon_simulations.sql`: no production ToD, DM or `#log` mutation.
- Existing manual declaration path still available with confirmation.
- Static source uses no production credentials. `wrangler.toml.example` and `.dev.vars.example` are placeholders. Local `nistod_local.lua` and relay `.nistod-state.json` must not be committed.
- Tests: 66 Worker, 7 Relay (including Worker/D1 integration), 31 Lua: **104/104** tests, all in simulation only. No packet trace from CatsEyeXI client has been validated.
- Staff has paused addon reviews. This release does not imply staff acceptance.
