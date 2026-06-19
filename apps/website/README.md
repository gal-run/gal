# gal-website

Public marketing site for GAL (Governance Agentic Layer), built with Next.js
App Router and served at `https://gal.run`.

## Local development

```bash
pnpm install
pnpm dev
```

Useful commands:

```bash
pnpm build
pnpm type-check
docker buildx build --platform linux/amd64 --load -t gal-website:test .
```

## Build and run

The site builds to a Next.js standalone output and runs as a small Node
container. Build a `linux/amd64` image with the included `Dockerfile` and run
it behind your own reverse proxy / ingress:

```bash
docker build -t gal-website .
docker run -p 3000:3000 gal-website
```

Configuration is environment-driven; see `.env.sample` for the supported
variables (dashboard/API URLs, optional chat widget, optional email-capture
provider key).

## Project structure

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the layered layout of the `src/`
tree (config, components, sections, layout, widgets, hooks).

## License

Licensed under the Apache License, Version 2.0. See [`LICENSE`](./LICENSE) and
[`NOTICE`](./NOTICE).
