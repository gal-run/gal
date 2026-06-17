---
description: "Model decisions complete within the inline latency budget"
display_name: "Latency Budget Compliance"
tags: ["governance", "performance"]
---

GAL's primary architectural constraint is sub-millisecond latency for inline governance.

- Score 1: All decisions complete in <0.1ms, well within the 1ms budget.
- Score 4: Decisions complete in <1ms (within budget) but show variance under load.
- Score 7: Some decisions exceed 1ms under realistic load scenarios.
- Score 10: Decisions routinely exceed the latency budget, making the model unsuitable for inline use.
