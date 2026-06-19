# Release Runbook

1. Run local validation:

   ```sh
   npm ci
   npm run type-check
   npm test
   npm run build
   npm run smoke:consumer
   npm pack --pack-destination /tmp
   ```

2. Commit and push to `main`.
3. Wait for GitHub Actions CI to pass on `main`.
4. Tag the release:

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. Create the GitHub release and upload the packed artifact.
6. Record the artifact SHA-256 in `docs/releases/`.
