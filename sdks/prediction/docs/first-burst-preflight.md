# First Burst Preflight

This checklist gates the first paid GAL swarm burst. Prediction owns the
go/no-go decision. Swarm owns the final mechanical interlock before Stratus GPU
providers can provision capacity.

No provider startup is allowed until the checklist is complete, the prediction
readiness result has no blockers, and the swarm preflight result has no
blockers.

## Prediction Readiness

1. Forecast input is generated from live GitHub issue state.
2. Forecast input excludes backlog and triage-only issues.
3. Forecast input includes only concrete release milestones.
4. Forecast input records repository, issue number, title, labels, URL, and milestone.
5. Forecast input is written to a versioned artifact path.
6. Forecast request uses the current schema version.
7. Forecast horizon is capped to the planned burst window.
8. Logical worker cap is explicit.
9. Target utilization is explicit.
10. Throughput profile is explicit.
11. GPU type is explicit.
12. GPU count is explicit.
13. Provider is explicit.
14. Cost profile is explicit.
15. Minimum billable time is explicit.
16. Cold-start time is explicit.
17. Drain time is explicit.
18. Shutdown time is explicit.
19. Every task has a deterministic id.
20. Every task has a repository.
21. Every task has a kind.
22. Every task has token estimates.
23. Every task has base execution minutes.
24. Every task has tool profiles.
25. Every task has blocking probability.
26. Every task has parallelism classification.
27. Human-gated tasks are marked.
28. Legal/admin tasks are marked.
29. Deployment-gated tasks are marked.
30. CI-bound tasks are marked.
31. Dependency edges are loaded when known.
32. Missing dependency edges are treated as a confidence risk.
33. Cycles are rejected.
34. Missing dependencies are rejected.
35. Blocked task count is computed.
36. Runnable task count is computed.
37. Blocked task ratio is under the configured cap.
38. Runnable task count is above the configured floor.
39. Critical path is computed.
40. CI wait minutes are computed.
41. Tool wait minutes are computed.
42. Token capacity is computed.
43. Context-window fit is computed.
44. Cluster capacity is computed.
45. Billable cluster minutes are computed.
46. Projected cluster cost is computed.
47. Projected cluster cost is below the cap.
48. Forecast confidence is computed.
49. Confidence threshold is explicit.
50. Forecast readiness has no blockers.

## Swarm Startup Interlock

51. Swarm plan uses the current schema version.
52. Swarm objective is explicit.
53. Orchestration mode is explicit.
54. Max duration is explicit.
55. Max duration is no more than the first-test cap.
56. Max spend is explicit.
57. Max spend is no more than the first-test cap.
58. Paid compute-unit cap is explicit.
59. Logical lanes are not treated as paid GPU clusters.
60. Logical lanes per compute unit is explicit.
61. Desired paid compute units are computed.
62. Desired paid compute units are under the cap.
63. Provider candidates are explicit.
64. Provider candidate availability is checked.
65. Provider candidate cost is checked.
66. Provider candidate billing floor is checked.
67. Provider candidate startup time is checked.
68. Provider candidate shutdown time is checked.
69. Provider candidate reliability score is checked.
70. Selected provider matches an allowed provider.
71. Selected compute profile exists.
72. Selected compute profile declares GPU type and count.
73. Selected compute profile declares tools.
74. Projected spend matches selected provider estimate.
75. Runtime telemetry is configured.
76. Provider credentials are configured.
77. GitHub credentials are configured.
78. Model registry credentials are configured if needed.
79. Metrics endpoint is configured.
80. GPU utilization telemetry is configured.
81. GPU memory telemetry is configured.
82. Token throughput telemetry is configured.
83. Queue depth telemetry is configured.
84. Queue wait telemetry is configured.
85. Worker busy/idle telemetry is configured.
86. Drain policy is configured.
87. Shutdown policy is configured.
88. Low-utilization threshold is configured.
89. Queue wait target is configured.
90. Deployment permission is disabled for the first test.
91. Allowed repositories are explicit.
92. Allowed repositories are scoped to the first-test slice.
93. Allowed tools are explicit.
94. Allowed secrets are explicit.
95. Allowed networks are explicit.
96. Filesystem access is scoped.
97. Production deploy access is absent.
98. Startup abort path is tested.
99. Drain path is tested.
100. Shutdown path is tested.

## First Paid Test Rule

The first paid test should start with one paid GPU compute unit, an overfilled
machine-runnable queue, no deployment permission, and a hard spend cap. The run
should drain instead of hard-stopping active work, then feed actual token,
tool, CI, utilization, and cost traces back into prediction.
