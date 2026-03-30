# Database and Auth Record Integrity Audit

## Executive Summary

- The backend data model uses a single `User` table with role-based auth. There are no separate `admins` or `listeners` tables.
- The local backend is currently configured to use PostgreSQL at `localhost:5432/clarivoice`, but that database is not reachable from this workspace right now.
- Because the database is offline, the actual presence of `admin25`, the listener seed user, and any live OTP rows cannot be verified in the connected DB.
- Seeded auth records are defined in `backend/prisma/seed.js`, but seeds are manual and are not run automatically at startup.
- There is a real seeded-vs-demo credential mismatch for listener login:
  - seeded listener credentials are `+910000000101` / `Admin@123`
  - demo listener bypass credentials are `000000101` / `12345678`
  - the demo bypass only works when `DEMO_LISTENER_LOGIN_BYPASS=true`
- OTP storage is bcrypt-hashed and stored in `OtpCode`, and I fixed OTP verification to filter by `purpose` so it reads the correct pending OTP record for login.

## 1. Models / Tables / Queries

### Auth-related Prisma models

Defined in `backend/prisma/schema.prisma`:

- `User`
  - holds admin, listener, and normal-user identities
  - key fields: `id`, `phone`, `email`, `passwordHash`, `role`, `status`, `isPhoneVerified`
- `ListenerProfile`
  - linked by `userId`
  - required for a listener account to be operational
- `OtpCode`
  - key fields: `phone`, `codeHash`, `purpose`, `status`, `attempts`, `expiresAt`, `verifiedAt`
- `AuthSession`
  - stores refresh-token session hashes

### There are no separate auth tables for

- `admins`
- `listeners`
- OTP verification sessions by verification ID

Admin and listener auth both query `User`, then rely on:

- `role === 'ADMIN'` for admin login/me
- `role === 'LISTENER'` plus `listenerProfile.isEnabled` for listener login

## 2. Seed / Bootstrap Audit

### Seed entrypoint

- `backend/package.json`
  - `npm run prisma:seed`
  - Prisma seed is `node prisma/seed.js`

### Seed behavior

Defined in `backend/prisma/seed.js`:

- Admin seed row:
  - `phone: +910000000001`
  - `email: admin25`
  - `role: ADMIN`
  - `status: ACTIVE`
  - password hash generated from `Admin@123`
- Listener seed row:
  - `phone: +910000000101`
  - `role: LISTENER`
  - `status: ACTIVE`
  - password hash generated from `Admin@123`
  - linked `ListenerProfile` with `availability: ONLINE` and `isEnabled: true`
- User seed row:
  - `phone: +910000000201`

### Important seed integrity observations

1. Seeds are manual, not automatic.
   - Startup does not run migrations or seeds.
   - If the DB was recreated or never initialized, required auth rows will not exist until `npm run prisma:seed` is run.

2. `admin25` is seeded into the `email` column, not a dedicated admin ID field.
   - Current login logic still accepts it because `loginWithPassword` compares `phoneOrEmail` against the raw `email` column.
   - This works today, but it is semantically muddy because `admin25` is not actually an email address.

3. Seeded listener credentials do not match demo listener credentials.
   - Seeded listener uses `Admin@123`.
   - Demo listener bypass uses `000000101` / `12345678`.
   - The real listener DB row does not have ID `000000101`; its `id` is a Prisma-generated CUID unless a DB migration or custom seed changed it.

## 3. Environment / Startup Audit

### Current backend env shape

Observed from `backend/.env` and runtime parsing:

- `DATABASE_URL` is present
- `REDIS_URL` is present
- `JWT_ACCESS_SECRET` is present
- `JWT_REFRESH_SECRET` is present
- `DEMO_OTP_MODE=true`
- `DEMO_LOGIN_PHONE` is present
- `DEMO_LOGIN_OTP` is present
- `DEMO_USER_OTP_BYPASS` is not present in the checked local `.env` file
- `DEMO_LISTENER_LOGIN_BYPASS` is not present in the checked local `.env` file

### Actual database target

- protocol: `postgresql`
- host: `localhost`
- port: `5432`
- database: `clarivoice`

### Reachability result

- `Test-NetConnection localhost -Port 5432` returned `TcpTestSucceeded = False`
- Prisma query attempt failed with:
  - `Can't reach database server at localhost:5432`

### Startup behavior

- `backend/src/server.js` does not run migrations or seeds
- `backend/README.md` expects manual setup:
  - `npx prisma migrate dev --name init`
  - `npm run prisma:seed`

## 4. Live DB Verification Result

## A. Whether required auth records exist

- Connected DB verification: `Not verifiable because the configured database is offline/unreachable`
- Seed definitions say these records should exist after a successful seed:
  - admin: `admin25` / `+910000000001`
  - listener: `+910000000101`
  - user: `+910000000201`

## B. Whether seed scripts ran correctly

- Code-level answer: seed script is valid and defines the expected records.
- Runtime answer: cannot prove the seed ran against the connected DB because Prisma cannot connect to the configured database.
- Startup does not run seed automatically, so if the DB was recreated or never initialized, the seed likely did not run unless someone executed it manually.

## C. Whether password/hash format is valid

- Seeded passwords use `bcrypt.hash(..., 10)`
- Backend login uses `bcrypt.compare(...)`
- OTP codes are also stored as bcrypt hashes and verified with `bcrypt.compare(...)`
- Hash format expected by login logic is bcrypt-compatible

## D. Whether DB queries are targeting the right tables/collections

- Admin login query:
  - targets `User`
  - looks up `phone` or `email`
  - correct table for this schema
- Listener login query:
  - targets `User`
  - requires `role: 'LISTENER'`
  - includes `listenerProfile`
  - correct table for this schema
- Admin `/me` query:
  - targets `User`
  - correct table for this schema
- OTP send:
  - writes to `OtpCode`
  - correct table for this schema
- OTP verify:
  - targets `OtpCode`
  - correct table for this schema
  - and now correctly filters by `purpose`

## E. Exact Root Causes

### Proven root cause

1. The configured database is unreachable.
   - Evidence:
     - Prisma query failure against `localhost:5432`
     - local TCP probe to `localhost:5432` failed
     - backend dev logs already contain the same Prisma initialization error
   - Impact:
     - auth record existence cannot be confirmed
     - protected requests can fail with server errors when Prisma reads are attempted

### Very likely auth-data root causes once DB is restored

2. Seeded records may still be missing because seed execution is manual.
   - If migrations/seeds were never run on the active DB, `admin25` and the seeded listener simply do not exist.

3. Listener invalid credentials can be caused by seed/demo drift.
   - Seeded listener login is `+910000000101` with password `Admin@123`
   - Demo listener login is `000000101` with password `12345678`
   - Demo listener bypass is disabled unless `DEMO_LISTENER_LOGIN_BYPASS=true`
   - Result: trying `000000101` / `12345678` against the seeded DB user will fail

4. `admin25` is modeled as a pseudo-email, not a dedicated admin ID.
   - This is not necessarily broken with current code, but it is fragile and easy to misinterpret

5. Invalid OTP could be caused by OTP record selection drift.
   - Before this pass, verification read the latest pending OTP for a phone without filtering by `purpose`
   - That could produce false invalid-OTP failures if multiple OTP purposes existed for the same phone
   - This has now been fixed

## F. Exact File-by-File Fixes Needed

### Fixed in this pass

| File | Fix |
| --- | --- |
| `backend/src/modules/auth/auth.validator.js` | Added `purpose` to OTP verification schema with default `LOGIN` |
| `backend/src/modules/auth/auth.service.js` | OTP verification now queries `OtpCode` by `phone + purpose + status` instead of only `phone + status` |
| `services/authApi.js` | Expo OTP verification request now explicitly sends `purpose: 'LOGIN'` |
| `backend/README.md` | Clarified that demo listener bypass credentials only work when `DEMO_LISTENER_LOGIN_BYPASS=true` |

### Still needed in environment / data setup

| File / Area | Needed fix |
| --- | --- |
| `backend/.env` or deployment env | Point `DATABASE_URL` to a reachable PostgreSQL instance, or start Postgres locally on `localhost:5432` |
| database initialization process | Run Prisma migrations on the active DB |
| seed execution process | Run `npm run prisma:seed` on the active DB so required auth rows exist |

### Recommended cleanup fixes

| File | Recommended improvement |
| --- | --- |
| `backend/prisma/seed.js` | Replace `email: 'admin25'` with either a real email address or a clearly named dedicated login alias field if one is ever added |
| `backend/prisma/seed.js` | Align seeded listener credentials with documented/demo listener credentials, or document the distinction everywhere they appear |
| backend deployment/runbook | Add an explicit DB health check and seed/migration step to the startup or deployment process so missing auth rows are caught early |

## Bottom Line

- I could not truthfully confirm that `admin25` or the listener seed row exists in the connected DB, because the configured DB is offline.
- The codebase does define those auth rows in the seed script, but they only exist if migrations and seeding were actually run.
- The strongest current integrity problem is infrastructure/configuration: the backend cannot reach its configured Postgres.
- The strongest data/credential mismatch problem is the listener seed vs demo credential split.
- The OTP record lookup integrity issue has been fixed in code.

## Verification Performed

- attempted Prisma DB audit query from backend runtime context
- confirmed Prisma failure to reach `localhost:5432`
- confirmed TCP failure to `localhost:5432`
- inspected Prisma schema, seed script, env config, startup flow, and backend logs
- `node --check backend/src/modules/auth/auth.service.js`
- `node --check backend/src/modules/auth/auth.validator.js`
