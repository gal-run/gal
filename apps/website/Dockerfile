FROM node:24-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ curl
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

ARG NEXT_PUBLIC_API_URL=https://api.gal.run
ARG NEXT_PUBLIC_ENVIRONMENT=production
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

RUN test -d .next/standalone
RUN cp -r .next/static .next/standalone/.next/static && \
    cp -r public .next/standalone/public

FROM node:24-alpine
WORKDIR /app

RUN apk add --no-cache wget
COPY --from=builder /app/.next/standalone ./

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/ || exit 1

CMD ["node", "server.js"]
