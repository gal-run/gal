#!/usr/bin/env bash
# backfill-gal-rag.sh — queue all files from every repo tracked by repo-svc
# into gal-rag for initial indexing.
#
# Prerequisites:
#   - kubectl configured to k3s-production context
#   - gh CLI authenticated (gh auth status)
#   - gal-rag pod running (kubectl -n gal-services get pod -l app.kubernetes.io/name=rag)
#
# Run AFTER embedding keys are in place:
#   gcloud secrets create gal-services-openai-api-key --project=stratus-scheduler-systems ...
#   kubectl -n gal-services rollout restart deployment/rag
#
# Usage:
#   ./scripts/backfill-gal-rag.sh                       # all repos for all orgs
#   ./scripts/backfill-gal-rag.sh gal-run               # only repos owned by gal-run
#   ./scripts/backfill-gal-rag.sh gal-run go-services   # single repo
#
# What it does:
#   1. Port-forwards gal-rag to localhost:18091
#   2. Reads the JWT secret from the cluster
#   3. For each tracked repo, fetches the full file tree from GitHub
#   4. POSTs an IngestWebhook to gal-rag for each repo (batched in chunks of 500)
#
set -euo pipefail

NAMESPACE="gal-services"
LOCAL_PORT="18091"
CHUNK=500          # max paths per webhook call
FILTER_ORG="${1:-}"
FILTER_REPO="${2:-}"

# ── preflight ──────────────────────────────────────────────────────────────────
command -v kubectl >/dev/null || { echo "kubectl not found"; exit 1; }
command -v gh >/dev/null      || { echo "gh not found"; exit 1; }
command -v jq >/dev/null      || { echo "jq not found"; exit 1; }

RAG_POD=$(kubectl -n "$NAMESPACE" get pod -l app.kubernetes.io/name=rag --no-headers 2>/dev/null | awk 'NR==1{print $1}')
if [[ -z "$RAG_POD" ]]; then
  echo "No gal-rag pod found in namespace $NAMESPACE"
  exit 1
fi
echo "Using pod: $RAG_POD"

# ── port-forward ───────────────────────────────────────────────────────────────
kubectl -n "$NAMESPACE" port-forward "pod/$RAG_POD" "${LOCAL_PORT}:8080" &
PF_PID=$!
trap "kill $PF_PID 2>/dev/null; exit" INT TERM EXIT
sleep 2

GAL_RAG="http://localhost:${LOCAL_PORT}"
if ! curl -sf "$GAL_RAG/health" >/dev/null; then
  echo "gal-rag health check failed at $GAL_RAG"
  exit 1
fi
echo "gal-rag reachable at $GAL_RAG"

# ── JWT ────────────────────────────────────────────────────────────────────────
JWT_SECRET=$(kubectl -n "$NAMESPACE" get secret gal-services-secrets \
  -o jsonpath='{.data.jwt-secret}' | base64 -d)

# Build a minimal HS256 JWT (header.payload.sig) using Python (available everywhere)
TOKEN=$(python3 - <<PYEOF
import hmac, hashlib, base64, json, time

secret = "$JWT_SECRET".encode()
header = base64.urlsafe_b64encode(json.dumps({"alg":"HS256","typ":"JWT"}).encode()).rstrip(b'=').decode()
payload = base64.urlsafe_b64encode(json.dumps({
    "org_id":"backfill-script",
    "sub":"backfill",
    "exp": int(time.time()) + 3600
}).encode()).rstrip(b'=').decode()

msg = f"{header}.{payload}".encode()
sig = base64.urlsafe_b64encode(hmac.new(secret, msg, hashlib.sha256).digest()).rstrip(b'=').decode()
print(f"{header}.{payload}.{sig}")
PYEOF
)
echo "JWT ready (${#TOKEN} chars)"

# ── list tracked repos from repo-svc ──────────────────────────────────────────
# Port-forward repo-svc to list repos
REPO_SVC_POD=$(kubectl -n "$NAMESPACE" get pod -l app.kubernetes.io/name=repo --no-headers 2>/dev/null | awk 'NR==1{print $1}')
kubectl -n "$NAMESPACE" port-forward "pod/$REPO_SVC_POD" 18092:8080 &
RS_PF_PID=$!
sleep 2

REPOS=$(curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:18092/repos 2>/dev/null \
  | jq -r '.repos[]? | "\(.owner)/\(.name) \(.defaultBranch // "main") \(.installationId // 0)"' 2>/dev/null || echo "")
kill $RS_PF_PID 2>/dev/null

if [[ -z "$REPOS" ]]; then
  echo "No repos found via repo-svc. Trying to list from cluster secrets..."
  # Fallback: list from gh CLI if you have access
  REPOS=$(gh repo list gal-run --limit 100 --json nameWithOwner,defaultBranchRef \
    --jq '.[] | "\(.nameWithOwner) \(.defaultBranchRef.name // "main") 0"' 2>/dev/null || echo "")
fi

if [[ -z "$REPOS" ]]; then
  echo "No repos to backfill. Provide repos as args or check repo-svc."
  exit 0
fi

# ── per-repo ingestion ─────────────────────────────────────────────────────────
TOTAL_REPOS=0
TOTAL_JOBS=0

while IFS= read -r line; do
  FULL_NAME=$(echo "$line" | awk '{print $1}')
  OWNER=$(echo "$FULL_NAME" | cut -d/ -f1)
  REPO=$(echo "$FULL_NAME" | cut -d/ -f2)
  BRANCH=$(echo "$line" | awk '{print $2}')

  # Apply filters
  [[ -n "$FILTER_ORG"  && "$OWNER" != "$FILTER_ORG"  ]] && continue
  [[ -n "$FILTER_REPO" && "$REPO"  != "$FILTER_REPO"  ]] && continue

  echo ""
  echo "── $FULL_NAME @ $BRANCH ──"

  # Fetch file tree from GitHub
  PATHS=$(gh api "repos/$FULL_NAME/git/trees/$BRANCH?recursive=1" \
    --jq '[.tree[] | select(.type=="blob") | .path]' 2>/dev/null || echo "[]")

  FILE_COUNT=$(echo "$PATHS" | jq 'length')
  if [[ "$FILE_COUNT" -eq 0 ]]; then
    echo "  no files found (private repo or tree fetch failed)"
    continue
  fi
  echo "  $FILE_COUNT files — sending in chunks of $CHUNK"

  # Send in chunks
  CHUNK_NUM=0
  echo "$PATHS" | jq -c --argjson chunk "$CHUNK" '
    [range(0; length; $chunk)] | .[] as $i |
    [.[$i:$i+$chunk]]
  ' | while IFS= read -r chunk_paths; do
    CHUNK_NUM=$((CHUNK_NUM + 1))
    CHUNK_SIZE=$(echo "$chunk_paths" | jq 'length')

    BODY=$(jq -n \
      --arg eventId "${FULL_NAME}/${BRANCH}/backfill-${CHUNK_NUM}" \
      --arg orgId   "$OWNER" \
      --arg owner   "$OWNER" \
      --arg repo    "$REPO" \
      --arg ref     "refs/heads/$BRANCH" \
      --argjson paths "$chunk_paths" \
      '{eventId:$eventId,orgId:$orgId,owner:$owner,repo:$repo,ref:$ref,pathsChanged:$paths}')

    STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
      -X POST "$GAL_RAG/webhooks/repo-svc" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "$BODY" 2>/dev/null)

    echo "  chunk $CHUNK_NUM ($CHUNK_SIZE files) → HTTP $STATUS"
    TOTAL_JOBS=$((TOTAL_JOBS + CHUNK_SIZE))
  done

  TOTAL_REPOS=$((TOTAL_REPOS + 1))
done <<< "$REPOS"

echo ""
echo "══ Backfill complete ══"
echo "  Repos processed : $TOTAL_REPOS"
echo "  Files enqueued  : $TOTAL_JOBS"
echo ""
echo "Monitor ingestion:"
echo "  kubectl -n gal-services logs -l app.kubernetes.io/name=rag -f | grep -v health"
