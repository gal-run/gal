# Stratus Deployment — GitOps Ownership

## Source of truth

The live deployment manifest lives in a separate GitOps repo:

```
StratusCloudLabs/argocdgitops
  └── clusters/stratus/workloads/gal-dashboard/deployment.yaml
```

ArgoCD watches that file and reconciles the cluster state automatically.

## How the image digest gets there

On every push to `main`, CI:

1. Builds the Docker image and pushes it to Artifact Registry with both a `:latest` tag and a `:<git-sha>` tag.
2. Inspects the pushed manifest to obtain the immutable `sha256:` digest.
3. Checks out `StratusCloudLabs/argocdgitops`, patches the `image:` line in `clusters/stratus/workloads/gal-dashboard/deployment.yaml` to use the digest, and commits + pushes.
4. ArgoCD detects the change and rolls out the new image.

No manual steps are needed for a normal production deploy.

## Manual rollback procedure

1. Find the GitOps commit you want to revert to (the commit message format is `[gal-dashboard] deploy <sha>`).
2. In `StratusCloudLabs/argocdgitops`, revert that commit or manually restore the previous `image:` digest line.
3. Push to main. ArgoCD will roll back automatically.

## Secrets required by CI

| Secret name | Purpose |
|---|---|
| `GAL_REPO_READ_TOKEN` | GitHub PAT — private submodule + package registry access (already exists) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | GCP Workload Identity Federation provider string |
| `GCP_SERVICE_ACCOUNT` | GCP service account email with Artifact Registry write role |
| `GAL_GITOPS_WRITE_TOKEN` | GitHub PAT with write access to `StratusCloudLabs/argocdgitops` |

Secrets are configured in the repository's **Settings → Secrets and variables → Actions**.

## This directory

`deployment.yaml` in this directory is a tombstone — it is intentionally not valid YAML so it cannot be accidentally applied. Do not restore the old content here.
