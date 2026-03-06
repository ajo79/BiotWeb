# Setup, Build, and Deployment Guide

## 1. Prerequisites

- OS: Windows/macOS/Linux.
- Node.js: 18+ (recommended 20 LTS).
- npm: bundled with Node.js.

## 2. Local Setup

From project root (`BiotWeb`):

1. Install dependencies:
   `npm install`

2. Start dev server:
   `npm run dev`

3. Open:
   `http://localhost:5173`

If `vite` is not recognized:
- Ensure dependencies are installed in this folder (`npm install`).
- Confirm command is run from `BiotWeb` directory.

## 3. Build and Preview

Production build:
- `npm run build`

Preview build:
- `npm run preview`

Build output:
- `dist/`

## 4. Environment Configuration

Optional environment variable:

- `VITE_API_URL`
  - Purpose: override default AWS endpoint.
  - Example:
    `VITE_API_URL=https://your-api-id.execute-api.ap-south-1.amazonaws.com/prod`

Create `.env` (local) or `.env.production` as needed.

## 5. Application Ports

- Dev server default port: `5173` (configured in `vite.config.js`).

## 6. Deployment Model

This is a static frontend app. Deploy `dist/` to:

- S3 + CloudFront
- Netlify
- Vercel
- Nginx/Apache static hosting

Key deployment settings:
- Route rewrite fallback to `index.html` for SPA routes.
- Set correct cache-control headers for assets.
- Set environment variable `VITE_API_URL` in CI/CD if backend endpoint differs.

## 7. CI/CD Recommendation

Minimal pipeline:

1. `npm ci`
2. `npm run build`
3. publish `dist/`

Optional:
- `npm run lint`

## 8. Release Checklist

- Build succeeds with no blocking errors.
- Realtime and history pages load telemetry.
- Same-day history range returns expected data.
- CSV export works.
- Login and protected routes function.

