# Contributing to gal-studio

## Development Setup

gal-studio lives in the gal monorepo at `tools/gal-studio`.

```bash
# Clone the monorepo
git clone https://github.com/gal-run/gal.git
cd gal

# Install workspace dependencies (from the repo root)
npm install

# Build just this package
npm run build --workspace @gal-run/gal-studio

# Run tests
npm test --workspace @gal-run/gal-studio

# Type check
npm run typecheck --workspace @gal-run/gal-studio
```

## Project Structure

```
src/
├── core/           # Core functionality (recording engine)
├── effects/        # Video effects (zoom, cursor, overlays)
├── timeline/       # Timeline editor
├── renderer/       # Video rendering pipeline
├── tts/            # Text-to-speech integration
├── mcp/            # MCP server for AI agent control
└── cli/            # Command-line interface
```

## Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Run tests: `npm test`
4. Run type check: `npm run typecheck`
5. Submit a pull request

## Code Style

- TypeScript strict mode
- ES modules (ESM)
- No comments unless requested
- Follow existing patterns

## Testing

- Unit tests use Vitest
- Place tests in `src/__tests__/` directory
- Name test files `*.test.ts`

## MCP Tools

When adding new MCP tools:
1. Add tool definition in `src/mcp/server.ts`
2. Add handler in the `CallToolRequestSchema` handler
3. Document in `skill/SKILL.md`

## Questions?

Open an issue on GitHub.
