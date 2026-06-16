# Data And Privacy

`gal-evals` is not a data lake and not a mailbox archive.

Allowed data:

- synthetic cases;
- generated examples;
- anonymized patterns with all identifiers removed;
- expected outputs and scoring metadata;
- aggregate reports with no raw private content.

Disallowed data:

- real email bodies;
- real personal sender addresses;
- customer documents;
- legal or finance source documents;
- production browser session captures;
- OAuth tokens, API keys, cookies, or vault material.

If an evaluation needs production-like evidence, store a redacted artifact in the
owning product system and reference it from the API report. Do not commit the raw
artifact here.
