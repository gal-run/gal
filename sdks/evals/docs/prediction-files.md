# Prediction Files

Prediction files connect real candidate behavior to stable evaluation suites.

They are intentionally simple:

- one `suiteId`;
- one `caseId` per prediction;
- one `output` object matching the suite's expected output paths;
- optional subject and metadata.

Schema: `schemas/gal-evals-predictions.schema.json`

## Why They Exist

`gal-evals` should not deploy agents, own credentials, or call live product
systems. Workers and runtime repos do that. A prediction file is the contract
between those runtime systems and this evaluation repo.

## Example

```json
{
  "schemaVersion": "gal.evals.predictions.v1",
  "suiteId": "gal.ops-triage.email.v1",
  "predictions": [
    {
      "caseId": "email-platform-action",
      "output": {
        "label": "platform",
        "createTask": true,
        "archive": false
      }
    }
  ]
}
```

## CLI

```bash
gal-evals \
  --suite suites/email-triage.json \
  --adapter prediction-file \
  --predictions predictions.json \
  --output report.json
```

The CLI fails when:

- `suiteId` does not match;
- the prediction file contains unknown case IDs;
- a suite case has no prediction;
- report gates fail.

## API Submission

Workers can submit the generated report back to a queued managed-agent eval run:

```bash
GAL_EVAL_SUBMIT_TOKEN="$RUNNER_TOKEN" gal-evals \
  --suite suites/email-triage.json \
  --adapter prediction-file \
  --predictions predictions.json \
  --submit-api-url https://api.gal.run \
  --submit-org example-org \
  --submit-agent gal.ops-triage \
  --submit-version 2026-05-16.1 \
  --submit-run-id eval-123
```

Use `--submit-token-env <ENV_NAME>` when the runner token lives in a different
environment variable. The token is only used as an HTTP bearer token; `gal-evals`
still does not fetch live mailbox data or own connector credentials.

Runtime workers can also import `claimEvaluationRun` from `@gal-run/gal-evals`
before executing the candidate. Claiming moves the API eval run to `running` and
returns a `gal.managed_agents.eval_work_packet.v1` work packet with agent
metadata, version runtime refs, execution target refs, runner refs, connector
refs, vault ref IDs, suite ID, and the report submission endpoint.

## Managed-Agent Worker Runner

When a worker uses the `@gal-run/gal-agents` managed-agent worker wrapper, it can
wrap a prediction file as a structural runner. The worker resolves deployment
resources and handles claim/report submission; the runner only scores
already-produced predictions:

```ts
import { createPredictionFileManagedAgentRunner } from '@gal-run/gal-evals'

const runner = createPredictionFileManagedAgentRunner({
  suite,
  predictionFile,
  taskTypes: ['ops.email.triage'],
})
```

The runner validates that the work packet suite, eval suite, and prediction file
suite all match before scoring. It does not open Gmail, load OAuth credentials,
or mutate mailbox state.
