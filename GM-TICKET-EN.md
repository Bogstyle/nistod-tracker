**Subject: NisToD Tracker — review pending, update to automatic read-only combat event detection**

Hello CatsEyeXI staff,

Thank you for explaining that reviews of new addons are paused indefinitely. I understand this is not an approval of NisToD.

For transparency, the public source now contains **a beta Ashita4 addon** that passively reads incoming `0x029` action-message packets, looking only for explicit death codes 6/20 and verifying a visible entity's server ID and exact NM name. It performs **no actions against the game**: no movement, targeting, claims, outgoing packets or commands. Unlike our earlier prototype, it automatically sends a confirmed packet observation to an external Discord tracker without a manual click. The addon shows a local chat confirmation only after the receiving Worker acknowledges it.

The source also contains an authenticated test command (`/nistod sim behemoth`) that does not publish a real ToD.

Source: https://github.com/Bogstyle/nistod-tracker
Technical details: https://github.com/Bogstyle/nistod-tracker/blob/main/SECURITY-AND-DATA-FLOW.md

We would appreciate clarification when reviews resume regarding whether automatic community-sharing of received combat information is permitted. We will disable/revoke the addon if required.

Thank you, Nisroch
