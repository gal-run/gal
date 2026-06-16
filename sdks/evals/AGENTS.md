# gal-evals

This repo owns deterministic evaluation contracts, synthetic datasets, scoring
logic, and deployment gates.

Do not store real customer, user, email, finance, legal, source-code, or browser
session data in this repository. Evaluation fixtures must be synthetic,
anonymized, or generated from explicitly approved redaction pipelines.

`gal-evals` defines how evaluation suites and reports are represented and run. It
does not own agent execution, credentials, or runtime deployment, and it does not
mutate any external system: the runner only reads a suite, scores outputs through
an adapter, and writes a report to stdout or a local file.

Scoring must stay deterministic and LLM-free. Provider-specific or
product-specific adapters are allowed only when they are evaluation adapters.
Do not add live mutation logic or model inference here.
