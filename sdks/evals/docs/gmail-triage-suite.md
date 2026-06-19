# Gmail Triage Suite

Suite: `suites/email-triage.json`

Subject:

- Agent: `gal.ops-triage`
- Task type: `ops.email.triage`

## What It Measures

- Sender/company label selection.
- Whether an email should create a task.
- Whether an email should be archived after labeling.

## Why It Exists

Inbox triage will make many mistakes without measurement. This suite is the
first guardrail before a live Gmail agent can mutate labels, archive messages,
or trigger follow-up work.

## Data Policy

All cases are synthetic. Do not add real subject lines, real bodies, real sender
addresses, customer content, personal content, or production mailbox exports.

When a live run finds a mistake, reduce it to a generic synthetic pattern before
adding it here.

## Deployment Gate

The initial gate is intentionally modest:

- overall >= 0.85
- label >= 0.85
- createTask >= 0.85
- archive >= 0.85

Raise these gates as the suite grows.
