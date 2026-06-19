# Contributing to Demo Studio

## Development Setup

```bash
# Clone the repository
git clone https://github.com/gal-run/gal.git
cd demo-studio

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Type check
npm run typecheck
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
