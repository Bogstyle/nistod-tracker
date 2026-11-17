**Subject: Addon policy review request — NisToD Tracker (Ashita4 / VanaCore)**

Hello CatsEyeXI staff,

I would like to request a policy review before using an in-game addon associated with **NisToD Tracker**. My in-game character is **Nisroch**.

The project currently has two **separate** parts:

1. **Discord bot v0.2.0 (already operational):** players manually report NM/HNM death times in Discord; the bot displays estimated respawn windows, lottery cooldown information, optional DM reminders and an audit log. **It does not interact with the FFXI game client or server.**
2. **Ashita4/VanaCore prototype v0.0.1 (not live-tested or connected):** a local ImGui mockup listing 37 NMs with simulated “seen alive” and “death observed” buttons. The demonstration has **no network access, packet reading, target scanning, or gameplay actions**; nothing is transmitted or recorded.

**Future functionality, only if approved:** use unambiguous combat information already visible to the local player to suggest a death; require the player's explicit confirmation of the NM/time/zone; then send a minimal authenticated HTTPS report to our external Discord Worker. There would be **no unattended gameplay, automated claim/target/attack/movement, hidden-entity access or game-server packet injection**. This connected feature is **not implemented yet**.

Could staff advise (a) whether the local prototype is considered T0/T2 and can be tested, (b) which sources of visible game information may be used, and (c) whether manually confirmed HTTPS sharing of ToDs with a Discord tracker is allowed? We will submit the final connected code for further review before using it in game.

**Full source and technical description:** https://github.com/Bogstyle/nistod-tracker

Thank you for reviewing this project. We will follow the staff's classification and restrictions.
