// Single module for the entire Go services surface (governance, auth,
// gateway, mcp-gateway, dispatch, repo, sdlc, team, swarm, gal-rag).
// One go.mod + go.work, one binary per service under cmd/<svc>.
module github.com/gal-run/gal/services

go 1.23
