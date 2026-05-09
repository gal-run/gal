# GAL Service Status

This document maps customer-facing GAL components to our status page for service health monitoring.

## Status Page

Check real-time service health at: **[status.gal.run](https://status.gal.run)**

## Service Components

| Component | Description | Status Page ID |
|-----------|-------------|----------------|
| GAL API | Core backend API for configuration management | `gal-api` |
| GAL Dashboard | Web dashboard at app.gal.run | `gal-dashboard` |
| GAL CLI | Command-line interface distribution and updates | `gal-cli` |
| GAL MCP Server | MCP server at api.gal.run/mcp | `gal-mcp` |
| GAL Gateway | API gateway and routing | `gal-gateway` |
| GLM Gateway | GLM model gateway | `glm-gateway` |
| Browser Extension | Chrome extension services | `gal-browser-extension` |
| VS Code Extension | VS Code extension marketplace distribution | `gal-vscode-extension` |

## Status Indicators

- **Operational**: All systems normal
- **Degraded**: Partial functionality affected
- **Partial Outage**: Some users affected
- **Major Outage**: Service unavailable

## Showing Degraded Status in UI

When GAL APIs report degraded state, authenticated UI surfaces should display a banner:

```
⚠️ GAL services are experiencing issues. Check status.gal.run for updates.
```

This messaging:
- Informs users of known issues
- Directs them to the status page
- Avoids implying user misconfiguration

## Incident Communication

During incidents:
1. Status page is updated within 5 minutes of confirmed issues
2. Affected components marked as degraded or down
3. Incident details posted to status page
4. Resolution updates provided until services are restored

## Scheduled Maintenance

Planned maintenance windows are announced on the status page at least 24 hours in advance.

## Support

For service issues not reflected on the status page, contact support@gal.run.
