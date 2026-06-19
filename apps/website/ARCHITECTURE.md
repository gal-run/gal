# Website Architecture

## Separation of Concerns (SOC)

This marketing website follows Clean Architecture principles adapted for React:

```
src/
├── config/         # Configuration constants (URLs, feature flags)
├── components/     # Reusable UI components
├── sections/       # Page sections (Hero, Features, Pricing)
├── layout/         # Layout components (Header, Footer)
├── widgets/        # Third-party integrations (Intercom)
├── hooks/          # Custom React hooks
├── App.tsx         # Composition root
└── main.tsx        # Entry point
```

## Layer Responsibilities

### Config Layer (`config/`)
- Environment-aware configuration
- External service URLs (dashboard, API)
- Feature flags
- Static data (pricing tiers, nav links)

**Rule:** Components NEVER read `import.meta.env` directly.

### Components Layer (`components/`)
- Reusable UI elements
- No business logic
- Props-driven rendering
- Can be used across multiple sections

### Sections Layer (`sections/`)
- Full-width page sections
- Self-contained content blocks
- May compose multiple components
- Handle section-specific state

### Layout Layer (`layout/`)
- Page structure (Header, Footer)
- Navigation logic
- Responsive behavior
- Site-wide state (mobile menu)

### Widgets Layer (`widgets/`)
- Third-party integrations
- Script loading
- External service initialization
- Side-effect components

### Hooks Layer (`hooks/`)
- Custom React hooks
- Shared stateful logic
- Side-effect encapsulation

## Migration Status

The App.tsx file (1780 lines) contains many inline components that should be extracted:

### ✅ Extracted
- `Header` → `layout/Header.tsx`
- `IntercomWidget` → `widgets/IntercomWidget.tsx`
- Configuration → `config/index.ts`

### 🔄 To Extract (Future Work)
- `Footer` → `layout/Footer.tsx`
- `HeroSection` → `sections/HeroSection.tsx`
- `FeaturesSection` → `sections/FeaturesSection.tsx`
- `PricingSection` → `sections/PricingSection.tsx`
- `SandboxVisualization` → `components/SandboxVisualization.tsx`
- `HeroIntegrationDiagram` → `components/HeroIntegrationDiagram.tsx`
- (11 more sections...)

## Benefits

1. **Testability** - Components can be tested in isolation
2. **Maintainability** - Changes are localized
3. **Reusability** - Components can be shared
4. **Scalability** - Easy to add new sections
5. **Code Review** - Smaller, focused files

## Guidelines

1. **Import from barrel files** (`from './layout'` not `from './layout/Header'`)
2. **Config for all URLs** - Never hardcode dashboard/API URLs
3. **Comments are production docs** - Every file has a JSDoc header
4. **One concern per file** - Split if doing too much
