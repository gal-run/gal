# Geographic and Cultural Diversity Audit: GitHub PR Training Data

**Date:** 2026-05-28
**Audit scope:** `tmp/github-pr-all-events.jsonl` -- 30 repos, 710 total events

---

## Current Repo Inventory

All 30 repos in the training corpus, categorised by owner geography and governance culture.

| Repo | Region | Governance Culture | Events | Registered in `source_registry.py` |
|---|---|---|---|---|
| angular/angular | US (Google) | Western corporate | 25 | No |
| apache/spark | US (Apache Foundation) | Western foundation | 25 | No |
| denoland/deno | US (Deno Land Inc.) | Western corporate | 25 | No |
| django/django | US (Django Software Foundation) | Western foundation | 10 | Yes |
| elastic/elasticsearch | Netherlands / US (Elastic) | Western corporate | 25 | No |
| envoyproxy/envoy | US (CNCF / Lyft) | Western foundation | 25 | No |
| facebook/react | US (Meta) | Western corporate | 25 | No |
| godotengine/godot | Global (Godot Foundation) | Western foundation | 25 | No |
| golang/go | US (Google) | Western corporate | 25 | Yes |
| grafana/grafana | US (Grafana Labs) | Western corporate | 25 | No |
| hashicorp/terraform | US (HashiCorp) | Western corporate | 25 | No |
| kubernetes/kubernetes | US (CNCF) | Western foundation | 25 | Yes |
| laravel/framework | US (Taylor Otwell) | Western open-source | 25 | No |
| llvm/llvm-project | US (Apple / LLVM Foundation) | Western foundation | 25 | No |
| microsoft/TypeScript | US (Microsoft) | Western corporate | 25 | No |
| microsoft/vscode | US (Microsoft) | Western corporate | 25 | No |
| mozilla/gecko-dev | US (Mozilla Foundation) | Western foundation | 25 | No |
| nodejs/node | US (OpenJS Foundation) | Western foundation | 25 | Yes |
| php/php-src | Global (PHP Foundation) | Western foundation | 25 | No |
| python/cpython | US (Python Software Foundation) | Western foundation | 10 | Yes |
| pytorch/pytorch | US (Meta) | Western corporate | 25 | No |
| rails/rails | US (37signals / Rails Core) | Western open-source | 25 | No |
| redis/redis | Italy / Israel / US (Redis Ltd.) | Western corporate | 25 | No |
| ruby/ruby | Japan origin / global (Ruby Association) | Western-style foundation | 25 | No |
| rust-lang/rust | US (Rust Foundation) | Western foundation | 25 | Yes |
| supabase/supabase | US (Supabase) | Western corporate | 25 | No |
| swiftlang/swift | US (Apple) | Western corporate | 25 | No |
| tauri-apps/tauri | Global (Tauri Programme / NLnet) | Western open-source | 25 | No |
| tensorflow/tensorflow | US (Google) | Western corporate | 25 | Yes |
| vercel/next.js | US (Vercel) | Western corporate | 25 | No |

---

## Summary Statistics

| Metric | Count |
|---|---|
| Total repos | 30 |
| US / Western Europe | 30 (100%) |
| East Asia (China, Japan, Korea) | 0 (0%) |
| South Asia (India) | 0 (0%) |
| South America | 0 (0%) |
| Africa | 0 (0%) |
| Southeast Asia | 0 (0%) |
| Oceania (non-Western governance) | 0 (0%) |
| Registered in `source_registry.py` | 7 of 30 |

The training corpus is 100% Western (primarily US-based corporate and foundation projects). Even **ruby/ruby** (Japanese-origin creator) follows a US-style foundation governance model. There is zero representation from Chinese corporate governance (e.g., Alibaba, Tencent, Baidu), Japanese corporate governance (e.g., Sony, Rakuten), Indian enterprise governance, or any African or South American open-source governance patterns.

This is a critical blind spot: the model is trained exclusively on Western PR review cultures and will systematically misclassify governance signals from other cultural contexts.

---

## Proposed New Repos (Underrepresented Regions)

### Tier 1 -- Strongest candidates

| Repo | Region | Governance Culture | Rationale |
|---|---|---|---|
| pingcap/tidb | China (PingCAP) | Chinese corporate | Distributed SQL database with rigorous code review required by data correctness. Flagship Chinese OSS company with Western-comparable PR discipline. |
| vuejs/core | China / Global | Chinese-origin → global foundation | Creator Evan You is Chinese; the project has a distinct community governance model with heavy Chinese contributor participation while maintaining a global user base. |
| ant-design/ant-design | China (Ant Group) | Chinese corporate | 90k+ stars. The dominant UI framework in Chinese enterprise. PR review patterns reflect Chinese corporate OSS governance at scale. |
| hasura/graphql-engine | India (Hasura) | Indian-origin corporate | India's most successful OSS product. Strong review culture; provides a governance signal from South Asian tech. |
| appsmithorg/appsmith | India (founders) | Indian-origin corporate | Low-code platform with active PR culture. Distinct from Western corporate review patterns. |

### Tier 2 -- Additional diversity candidates

| Repo | Region | Governance Culture | Rationale |
|---|---|---|---|
| apache/dubbo | China → Apache | Chinese origin, foundation-governed | Originally Alibaba's RPC framework. Now Apache, but retains Chinese engineering culture in commit patterns. |
| openmrs/openmrs | Global (Africa focus) | Global health OSS | Open-source medical records system deployed heavily in sub-Saharan Africa. Contributors span multiple continents. |
| nammayatri/nammayatri | India | Indian open-source | Open-source mobility platform built by Indian team for India. Pure Indian governance signal. |
| apache/rocketmq | China (Alibaba → Apache) | Chinese origin, foundation-governed | High-throughput messaging. Shows Chinese-origin corporate discipline migrating to more open governance. |

---

## Integration Plan

Add new repos to `source_registry.py` under `github_pr_reviews["metadata"]["repos"]`:

```python
"repos": [
    # Existing (Western)
    "rust-lang/rust", "python/cpython", "golang/go",
    "kubernetes/kubernetes", "nodejs/node",
    "tensorflow/tensorflow", "django/django",
    # New -- Asia
    "pingcap/tidb", "vuejs/core", "ant-design/ant-design",
    # New -- India
    "hasura/graphql-engine", "appsmithorg/appsmith",
],
```

**Data collection:** Use `github_pr_review_adapter.py` to fetch ~25 closed PRs per new repo (matching the existing per-repo sample size). Current event_id format (`github-pr-{owner}/{repo}-{pr_number}`) supports this naturally.

**Validation:** Verify that PR review patterns from new repos fall within expected feature distributions (especially detection counts, approval patterns) before adding to the training mix. Flag any repo where review culture is substantially different enough to skew the weak supervision labels.
