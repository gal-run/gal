---
tags: ["bot_automation", "clean_merge"]
---

A bot-authored revert of a human commit that introduced a regression. CI green, automated approval. Features: vehicles_present=true, people_present=false, evidence_complete=true. The bot is reverting a known-bad commit. Test whether the model correctly clears bot reverts (they're routine and safe) while potentially flagging other bot-authored changes.
