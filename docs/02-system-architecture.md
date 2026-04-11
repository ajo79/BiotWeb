# System Architecture

## 1. Technology Stack

- Runtime: Node.js (development/build tooling).
- UI framework: React 18.
- Language: TypeScript.
- Bundler/dev server: Vite 5.
- Router: React Router v6.
- Data fetching/cache: TanStack Query v5.
- HTTP client: Axios.
- Charts: Recharts.
- Motion: Framer Motion.
- Styling: Tailwind CSS + custom CSS utilities.

## 2. High-Level Architecture

UI Layer
- Pages in `src/pages/*`.
- Shared layout in `src/layout/Shell.tsx`.
- Shared components in `src/components/*`.

State and Data Layer
- Query hooks in `src/hooks/queries.ts`.
- API extraction/normalization in `src/api/client.ts`.
- Utility parsing functions in `src/utils/*`.

Session/Auth Layer
- Context provider in `src/auth/auth.tsx`.
- localStorage persistence for auth and local users.

## 3. Routing Model

Entry: `src/main.tsx`
- Creates QueryClient with default polling behavior.

App routes: `src/App.tsx`
- `/login` public route.
- All other routes wrapped by `Protected` guard.
- Protected content rendered under `Shell` layout.

Primary pages:
- `/` Dashboard
- `/devices`
- `/devices/:id`
- `/graph`
- `/alarms`
- `/export`
- `/analytics`
- `/settings`
- `/notifications`
- `/help`
- `/about`

Navigation behavior:
- Left sidebar currently exposes Dashboard/Devices/Graph/Alarms/Export plus Help/About.
- Notifications route exists but is intentionally hidden from the left sidebar.

## 4. Data Flow

1. Page calls hook (`useRealtime`, `useDashboard`, etc.).
2. Hook invokes API function in `client.ts`.
3. `client.ts` fetches endpoint text via Axios.
4. Response is normalized (Lambda body unwrap, Dynamo unmarshal, payload flatten).
5. UI-ready objects returned to hooks.
6. Page renders cards/charts/tables from normalized objects.

## 5. Polling and Query Behavior

Global query defaults (`main.tsx`):
- `refetchInterval: 5000`
- `staleTime: 4000`

Hook-level behavior:
- Realtime/analytics/alarms poll at 5 seconds.
- History query disables interval and focus/reconnect auto refresh.
- Graph/DeviceDetail live mode polls, history mode disables polling.

## 6. Device Health Classification

Implemented in `src/api/client.ts`:
- Per-device in-memory runtime state map.
- Evaluates heartbeat age and missed polls.
- Produces `_onlineStatus`, `_isOnline`, `_missedPolls`, `_lastHeartbeatTs`.
- Applies hysteresis for offline recovery.

Pages consume `_onlineStatus` first and only use timestamp fallback when absent.

## 7. Key Modules

`src/api/client.ts`
- API endpoint handling.
- Multi-format payload normalization.
- Realtime merge logic.
- History pagination and filtering (`limit` support, multi-page cursor loop).
- Online-state machine.

`src/hooks/queries.ts`
- Centralized query hooks and polling options.

`src/utils/metrics.ts`
- Flatten nested payloads.
- Extract env and press metrics.

`src/utils/wifi.ts`
- RSSI normalization and wifi strength labels.

`src/pages/ExportPage.tsx`
- Converts history rows to CSV client-side with fixed IST date boundaries and `Time (IST)` formatting.

`src/utils/siteTime.ts`
- Centralized fixed site timezone utilities (`UTC+05:30`) for date input boundaries and display formatting.

`src/pages/MorePage.tsx`
- Local user CRUD and role assignment.

## 8. Persistence Model

Browser localStorage keys:
- `biot_auth`: current auth state.
- `biot_users_v1`: local user accounts.
- `biot_profile`: profile fields (optional).
- `biot_notifications`: notification list (optional/demo page).

No backend persistence is used for user management in current implementation.

## 9. Security Architecture Notes

- Access control is client-enforced only.
- Credentials and local users are browser-stored.
- Suitable for controlled/demo environments.
- For production hardening, move auth and user management to backend identity services.
