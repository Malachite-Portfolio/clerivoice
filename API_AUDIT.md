# API URL Audit

## Scope

- Frontend 1: Expo app at repo root
  - User flow
  - Listener flow
- Frontend 2: `admin-panel`
- Note: there is not a third separate listener-web codebase in this repo. Listener auth is implemented inside the Expo app and switched by `EXPO_PUBLIC_APP_MODE`.

## Canonical backend shape

- Backend API prefix: `/api/v1`
  - Source: `backend/.env`
  - Source: `backend/src/app.js`
- Canonical auth routes exposed by the backend:
  - User OTP send: `POST /api/v1/auth/send-otp`
  - User OTP verify/login: `POST /api/v1/auth/verify-otp`
  - Listener login: `POST /api/v1/auth/login-listener`
  - Admin login: `POST /api/v1/admin/auth/login`
  - Admin refresh: `POST /api/v1/admin/auth/refresh`
  - Admin logout: `POST /api/v1/admin/auth/logout`
  - Admin me: `GET /api/v1/admin/me`

## A. API URLs found

### Expo app: user + listener

- Base URL source:
  - `.env.example`
  - `constants/api.js`
- Socket URL source:
  - `.env.example`
  - `constants/api.js`
- Auth endpoints used after fix:
  - `/auth/send-otp`
  - `/auth/verify-otp`
  - `/auth/login-listener`
- Other network endpoints centralized in `constants/api.js`:
  - `/listeners`
  - `/listeners/me/availability`
  - `/listeners/:id/availability`
  - `/call/request`
  - `/call/accept`
  - `/call/reject`
  - `/call/sessions`
  - `/call/:sessionId/end`
  - `/call/:sessionId/token`
  - `/chat/request`
  - `/chat/accept`
  - `/chat/reject`
  - `/chat/sessions`
  - `/chat/:sessionId/end`
  - `/chat/:sessionId/token`
  - `/chat/:sessionId/messages`
  - `/wallet/summary`
  - `/agora/rtc-token`
  - `/agora/chat-token`

### Admin panel

- Base URL source:
  - `admin-panel/.env.example`
  - `admin-panel/.env.local`
  - `admin-panel/.env.production`
  - `admin-panel/src/constants/api.ts`
- Socket URL source:
  - `admin-panel/.env.example`
  - `admin-panel/.env.local`
  - `admin-panel/.env.production`
  - `admin-panel/src/constants/api.ts`
- Auth endpoints used after fix:
  - `/admin/auth/login`
  - `/admin/auth/refresh`
  - `/admin/auth/logout`
  - `/admin/me`
- Other request paths are now centralized in `admin-panel/src/constants/api.ts`.

## B. Mismatches found between frontends

### Fixed

- Expo `.env.example` used a different placeholder host than `admin-panel`.
- `admin-panel/.env.local` pointed to `http://localhost:8080` while production/example envs pointed to Railway.
- Expo user auth verified OTP through `/auth/login-user` instead of the canonical `/auth/verify-otp`.
- Admin auth service could silently fall back from `/admin/auth/*` to `/auth/*`.
- Admin refresh flow could silently fall back from `/admin/auth/refresh` to `/auth/refresh`.
- Expo phone screen bypassed the backend entirely by creating a local fake session.
- Expo navigator had the OTP screen removed, breaking the OTP flow.

### Still mismatched against backend contract

These are not auth/base-URL problems anymore, but they are still API-contract mismatches in the admin panel:

- `admin-panel/src/services/app.service.ts`
  - current frontend path: `/admin/app/sidebar`
  - backend route file exposes `/app/sidebar`
- `admin-panel/src/services/dashboard.service.ts`
  - frontend expects `/admin/dashboard/*`
  - no matching backend routes found
- `admin-panel/src/services/hosts.service.ts`
  - frontend expects `/admin/hosts*`
  - backend exposes `/admin/listeners*`
- `admin-panel/src/services/referrals.service.ts`
  - frontend expects `/admin/referrals` and `/admin/referral-settings`
  - backend exposes `/admin/referral-rule`
- `admin-panel/src/services/sessions.service.ts`
  - frontend expects `/admin/sessions/live`, `/admin/sessions/calls`, `/admin/sessions/chats`
  - backend exposes `/admin/sessions/call` and `/admin/sessions/chat`
- `admin-panel/src/services/settings.service.ts`
  - frontend expects `/admin/settings`
  - backend exposes `/settings`
- `admin-panel/src/services/support.service.ts`
  - frontend expects admin ticket listing/update routes
  - backend only exposes `/support/ticket`
- `admin-panel/src/services/wallet.service.ts`
  - frontend expects `/admin/wallet/overview`, `/transactions`, `/manual-adjustment`
  - backend exposes `/admin/wallet/ledger` and `/admin/wallet/adjust`

## C. Localhost or outdated URLs

### Fixed

- `admin-panel/.env.local`
  - was: `http://localhost:8080/api/v1`
  - now: `https://your-backend.up.railway.app/api/v1`
- `admin-panel/.env.local`
  - was: `http://localhost:8080`
  - now: `https://your-backend.up.railway.app`
- `.env.example`
  - was: `https://your-live-backend.example.com/*`
  - now aligned to `https://your-backend.up.railway.app/*`

### Remaining non-frontend references

- Backend local dev env and docs still mention localhost for local development.
- Postman collections still include localhost dev URLs.

## D. Exact files where wrong URLs were used

### Fixed files

- `.env.example`
- `constants/api.js`
- `services/authApi.js`
- `services/agoraApi.js`
- `services/listenerApi.js`
- `services/listenersApi.js`
- `services/sessionApi.js`
- `screens/PhoneNumberScreen.js`
- `navigation/AppNavigator.js`
- `admin-panel/.env.local`
- `admin-panel/src/constants/api.ts`
- `admin-panel/src/constants/app.ts`
- `admin-panel/src/components/layout/env-config-banner.tsx`
- `admin-panel/src/services/http.ts`
- `admin-panel/src/services/socket.ts`
- `admin-panel/src/services/auth.service.ts`
- `admin-panel/src/services/app.service.ts`
- `admin-panel/src/services/dashboard.service.ts`
- `admin-panel/src/services/hosts.service.ts`
- `admin-panel/src/services/referrals.service.ts`
- `admin-panel/src/services/sessions.service.ts`
- `admin-panel/src/services/settings.service.ts`
- `admin-panel/src/services/support.service.ts`
- `admin-panel/src/services/users.service.ts`
- `admin-panel/src/services/wallet.service.ts`

### Backend route references used for verification

- `backend/src/app.js`
- `backend/src/routes/index.js`
- `backend/src/routes/authRoutes.js`
- `backend/src/modules/auth/auth.routes.js`
- `backend/src/modules/adminAuth/adminAuth.routes.js`
- `backend/src/modules/admin/admin.routes.js`

## E. Corrected version of each file

The corrected implementations are now in the files above. The key behavior changes are:

- `constants/api.js`
  - normalizes `EXPO_PUBLIC_API_BASE_URL`
  - derives socket host safely
  - centralizes Expo endpoints
- `services/authApi.js`
  - uses canonical OTP verify route
- `screens/PhoneNumberScreen.js`
  - sends OTP to backend instead of creating a fake local session
- `navigation/AppNavigator.js`
  - restores the OTP screen route
- `admin-panel/src/constants/api.ts`
  - centralizes admin base URL, socket URL, and request paths
- `admin-panel/src/services/auth.service.ts`
  - uses only admin auth endpoints
- `admin-panel/src/services/http.ts`
  - refreshes only through admin auth endpoint

## F. Recommended centralized API config approach

- Keep one API config per frontend codebase:
  - Expo app: `constants/api.js`
  - Admin panel: `admin-panel/src/constants/api.ts`
- Keep host values in env vars only.
- Normalize every env base URL before creating clients.
- Derive socket host from API host when socket env is omitted.
- Keep endpoint strings in config objects, not inline in screens or services.
- Keep auth routes role-specific:
  - user/listener public auth under `/auth/*`
  - admin auth under `/admin/auth/*`
- Avoid silent fallback between role-specific auth namespaces.
