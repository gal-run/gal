# syntax=docker/dockerfile:1
# Multi-stage build for the GAL Browser Use Service.
# Pre-installs Playwright browsers so the container is ready to run headfully or headlessly.

# ---------------------------------------------------------------------------
# Builder — compile Python dependencies
# ---------------------------------------------------------------------------
FROM python:3.14-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ---------------------------------------------------------------------------
# Runtime — Playwright + extension + app
# ---------------------------------------------------------------------------
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    BROWSER_USE_DB=/data/browser_use_cache.db \
    CHROME_EXTENSION_PATH=/app/gal-extension \
    PATH="/root/.local/bin:${PATH}"

# System deps for Chromium + Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built wheels from builder
COPY --from=builder /root/.local /root/.local

# Install Playwright browsers (Chromium only to keep image size down)
RUN pip install --no-cache-dir playwright && \
    playwright install chromium && \
    playwright install-deps chromium

WORKDIR /app

# Application code
COPY main.py chrome_bridge.py ./

# Placeholder for the GAL Chrome extension (mounted or copied at build time)
RUN mkdir -p /app/gal-extension

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
