# BIOT Web Documentation

Last updated: 2026-06-26

Branch covered: `NewUI_withMeter`

This folder contains complete software documentation for the BIOT Web application in this repository.

## Document Index

1. `01-product-requirements.md`
   Functional and non-functional requirements, acceptance criteria, scope, assumptions.

2. `02-system-architecture.md`
   Frontend architecture, module layout, routing, auth flow, query/polling design.

3. `03-data-extraction-and-api.md`
   AWS endpoint contract handling, normalization, schema detection, realtime and history extraction logic.

4. `04-setup-build-deploy.md`
   Local setup, run/build commands, environment variables, deployment approach.

5. `05-operations-runbook.md`
   Operational guidance, troubleshooting, known risks and maintenance notes.

6. `06-testing-checklist.md`
   End-to-end manual test checklist for release validation.

## Quick Start

1. Install dependencies:
   `npm install`

2. Run development server:
   `npm run dev`

3. Build production bundle:
   `npm run build`

4. Optional preview:
   `npm run preview`

## Project Context

- Stack: React 18, TypeScript, Vite 5, React Router, TanStack Query, Recharts, Framer Motion, Tailwind CSS.
- Data source: single AWS API Gateway endpoint (`/prod`) returning Lambda-style JSON payloads, plus alarm ACK posts to `/prod/alarms/ack`.
- Primary domain: multi-site realtime and historical BIOT telemetry with site-scoped access control, decoded parameter display, energy-meter KPI views, numeric metric charting, shift production summaries, and offline/alarm health states.
