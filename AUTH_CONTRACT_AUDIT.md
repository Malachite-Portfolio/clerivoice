# Frontend-to-Backend Auth Contract Audit

## Scope

Frontend codebases in this repo:

1. Expo app at repo root
2. Next.js admin panel at `admin-panel`

There is no separate listener frontend codebase. Listener auth lives inside the Expo app and is switched by `EXPO_PUBLIC_APP_MODE`.

## Executive Summary

- The core frontend auth calls now match the live backend auth contract.
- The main contract mismatch that could cause admin login confusion was identifier naming: backend login only supports phone/email identity, while the backend validator and admin UI previously suggested admin ID style login.
- The main remaining auth failures are now backend-behavior failures, not frontend route/base-URL drift:
  - Invalid OTP is usually caused by stale, expired, or incorrect OTP state in the backend.
  - Listener invalid credentials is usually caused by wrong identity/password, non-listener role, or disabled listener profile.
  - Admin invalid credentials is usually caused by using a non-phone/non-email identifier, wrong password, or a non-`ADMIN` account.

## A. Backend Auth Contract

| Flow | Method | Exact Path | Required Payload | Optional Payload | Required Headers | Success Response Shape | Error Response Shape | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| User send OTP | `POST` | `/api/v1/auth/send-otp` | `phone`, `purpose` | none | `Content-Type: application/json` | `{ success: true, message: "OTP sent successfully", data: { otpSent: true, expiresInSeconds, demoOtp? } }` | `{ success: false, code, message, data }` | `phone` must match `^\\+?\\d{10,15}$`; `purpose` is one of `LOGIN`, `SIGNUP`, `VERIFY_PHONE` |
| User verify OTP | `POST` | `/api/v1/auth/verify-otp` | `phone`, `otp` | `displayName`, `referralCode`, `deviceId`, `deviceInfo` | `Content-Type: application/json` | `{ success: true, message: "OTP verified successfully", data: { user: { id, role, phone, displayName, status }, accessToken, refreshToken, demoMode? } }` | `{ success: false, code, message, data }` | Access token payload is signed with `sub`, `role`, `phone` |
| Listener login | `POST` | `/api/v1/auth/login-listener` | one of `listenerId` or `phone` or `email` or `phoneOrEmail`, plus `password` | `deviceId`, `deviceInfo` | `Content-Type: application/json` | `{ success: true, message: "Listener logged in", data: { user: { id, phone, email, displayName, role, status, listenerProfile: { availability, callRatePerMinute, chatRatePerMinute, isEnabled } }, accessToken, refreshToken, demoMode? } }` | Missing identity/password: `{ success: false, message }`; other failures: `{ success: false, code, message }` | Live handler is the compatibility route in `backend/src/routes/authRoutes.js`, not the module controller route |
| Admin login | `POST` | `/api/v1/admin/auth/login` | one of `phoneOrEmail` or `phone` or `email`, plus `password` | `deviceId`, `deviceInfo` | `Content-Type: application/json` | `{ success: true, message: "Admin login successful", data: { user: { id, phone, displayName, role, status }, accessToken, refreshToken } }` | `{ success: false, code, message, data }` | Backend only accepts phone/email identity; it does not authenticate by `adminId` or `username` |
| Admin refresh | `POST` | `/api/v1/admin/auth/refresh` | `refreshToken` | none | `Content-Type: application/json` | `{ success: true, message: "Admin token refreshed", data: { accessToken } }` | `{ success: false, code, message, data }` | Refreshed token must decode to `role === "ADMIN"` |
| Admin logout | `POST` | `/api/v1/admin/auth/logout` | none | `refreshToken` | `Content-Type: application/json` | `{ success: true, message: "Admin logged out successfully", data: { revoked: true } }` | `{ success: false, code, message, data }` | Route is not protected by `authMiddleware`; frontend still sends bearer token when available |
| Admin current user | `GET` | `/api/v1/admin/me` | none | none | `Authorization: Bearer <accessToken>` | `{ success: true, message: "OK", data: { id, displayName, email, phone, role, status, profileImageUrl } }` | `{ success: false, code, message, data }` | Requires valid access token and backend role `ADMIN` |

### Backend Validation and Token Rules

- Access header format is exactly `Authorization: Bearer <JWT>`.
- Access token auth middleware rejects missing or non-Bearer headers.
- Refresh tokens are passed in JSON body, not in cookies.
- Shared success wrapper comes from `backend/src/utils/apiResponse.js`.
- Shared error wrapper comes from `backend/src/utils/apiResponse.js` plus `backend/src/middleware/errorHandler.js`.
- Validation errors use:
  - HTTP `400`
  - `code: "VALIDATION_ERROR"`
  - `message: "Validation failed"`
  - `data: error.flatten()`
- Prisma role enum only supports `USER`, `LISTENER`, `ADMIN`.

## B. Frontend Usage

| Frontend | Flow | File(s) | Method + Path Used | Payload Sent | Response Parsing | Storage / Header Handling | Contract Match |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Expo | Send OTP | `services/authApi.js`, `screens/PhoneNumberScreen.js` | `POST /auth/send-otp` | `{ phone: "+91xxxxxxxxxx", purpose: "LOGIN" }` | `response.data.data` | No auth header | Yes |
| Expo | Verify OTP | `services/authApi.js`, `screens/OtpScreen.js` | `POST /auth/verify-otp` | `{ phone, otp, displayName }` | `response.data.data.user/accessToken/refreshToken` | Saves to `clarivoice_mobile_session`; request interceptor sends `Authorization: Bearer <accessToken>` for later calls | Yes |
| Expo | Listener login | `services/authApi.js`, `screens/ListenerLoginScreen.js` | `POST /auth/login-listener` | `{ phoneOrEmail, password }` | `response.data.data.user/accessToken/refreshToken` | Saves to `clarivoice_mobile_session`; bearer header used later | Yes |
| Admin | Login | `admin-panel/src/services/auth.service.ts`, `admin-panel/src/app/(auth)/login/page.tsx` | `POST /admin/auth/login` | `{ phoneOrEmail, password }` | `response.data.data` | Saves to `clarivoice_admin_auth`; stores access token in cookie `clarivoice_admin_token`; axios request interceptor sends bearer token | Yes |
| Admin | Refresh | `admin-panel/src/services/http.ts` | `POST /admin/auth/refresh` | `{ refreshToken }` | `response.data.data.accessToken` | Updates stored session and retries queued requests with fresh bearer token | Yes |
| Admin | Logout | `admin-panel/src/services/auth.service.ts` | `POST /admin/auth/logout` | `{ refreshToken }` | Does not require response body beyond success | Clears `clarivoice_admin_auth` and cookie | Yes |
| Admin | Me | `admin-panel/src/services/auth.service.ts` | `GET /admin/me` | none | `response.data.data.id/displayName/email/role` | Request interceptor attaches `Authorization: Bearer <accessToken>` | Yes |

## C. Exact Mismatches Found

### Fixed mismatches

1. Backend login validator advertised unsupported identifiers.
   - File: `backend/src/modules/auth/auth.validator.js`
   - Problem: validation allowed/advertised `username` and `adminId` style identity, but `authService.loginWithPassword` only ever looked up phone or email.
   - Impact: admin login could fail with `INVALID_CREDENTIALS` even when frontend copy implied `admin25` style login should work.
   - Fix: login schema now only accepts `phoneOrEmail`, `phone`, or `email`.

2. Admin frontend was masking the real backend contract.
   - Files: `admin-panel/src/services/auth.service.ts`, `admin-panel/src/app/(auth)/login/page.tsx`
   - Problem: the service contained a dev/demo admin bypass and the login screen copy suggested admin ID style login.
   - Impact: local success could hide backend failures; real users could try identifiers the backend never supported.
   - Fix: removed demo admin login bypass and changed login copy to `Email / Phone`.

3. Unsafe auth logging exposed raw auth payloads.
   - Files: `backend/src/routes/authRoutes.js`, `backend/src/modules/auth/auth.service.js`
   - Problem: raw payload and OTP-bearing debug logs were printed with `console.log`.
   - Impact: debugging was unsafe and not compliant with the requirement to avoid logging secrets.
   - Fix: replaced raw logs with redacted structured logging.

### Important contract nuances that are not current frontend mismatches

1. `/api/v1/auth/login-listener` is served by the compatibility router first.
   - File: `backend/src/routes/authRoutes.js`
   - Impact: the live message/error behavior for listener login comes from the compatibility route, not just `backend/src/modules/auth/auth.controller.js`.

2. Admin roles in the frontend are broader than backend roles.
   - Files: `admin-panel/src/types/index.ts`, `backend/prisma/schema.prisma`
   - Impact: frontend types mention `super_admin` and `support_manager`, but backend role enum only contains `ADMIN`.
   - Runtime effect today: admin auth still works for real `ADMIN` users; there is no current backend support for other admin-like roles.

3. Expo stores refresh tokens but does not yet auto-refresh access tokens.
   - Files: `context/AuthContext.js`, `services/apiClient.js`
   - Impact: not a login contract bug, but mobile protected calls can still fail after access token expiry until a refresh flow is added.

## D. Exact Files Needing Change

### Changed in this contract audit

- `backend/src/modules/auth/auth.validator.js`
- `backend/src/modules/auth/auth.controller.js`
- `backend/src/modules/adminAuth/adminAuth.controller.js`
- `backend/src/middleware/auth.js`
- `backend/src/modules/auth/auth.service.js`
- `backend/src/routes/authRoutes.js`
- `services/authApi.js`
- `admin-panel/src/services/auth.service.ts`
- `admin-panel/src/services/http.ts`
- `admin-panel/src/app/(auth)/login/page.tsx`

### Already changed before this contract pass, but still relevant to auth stability

- `constants/api.js`
- `admin-panel/src/constants/api.ts`
- `screens/PhoneNumberScreen.js`
- `navigation/AppNavigator.js`

## E. Corrected Code Changes, File by File

| File | Correction |
| --- | --- |
| `backend/src/modules/auth/auth.validator.js` | Removed unsupported `adminId` / `username` assumptions from password login validation and narrowed identity contract to phone/email inputs actually supported by the service. |
| `backend/src/modules/auth/auth.controller.js` | Added redacted request logging for send OTP, verify OTP, password login, listener login, refresh, and logout. |
| `backend/src/modules/adminAuth/adminAuth.controller.js` | Added redacted login/refresh/logout/me debug logging and explicit admin role trace points. |
| `backend/src/middleware/auth.js` | Added redacted middleware logging for missing auth header, token verification success, and invalid token failures. |
| `backend/src/modules/auth/auth.service.js` | Added redacted logging for OTP lifecycle, lookup, compare result, refresh, logout, and login-user OTP flow. |
| `backend/src/routes/authRoutes.js` | Replaced raw console auth logs with redacted structured logs in compatibility routes for `login-user` and `login-listener`. |
| `services/authApi.js` | Added Expo-side auth request/response/error logs for send OTP, verify OTP, and listener login, with tokens/passwords/OTP redacted. |
| `admin-panel/src/services/auth.service.ts` | Removed dev/demo admin login bypass and added redacted logging for login, me, and logout. |
| `admin-panel/src/services/http.ts` | Added redacted logging around refresh-token requests and responses. |
| `admin-panel/src/app/(auth)/login/page.tsx` | Updated login field copy to match real backend contract: `Email / Phone` instead of admin-ID-style wording. |
| `constants/api.js` | Already centralized Expo auth endpoints and base URL normalization. |
| `admin-panel/src/constants/api.ts` | Already centralized admin auth endpoints and base URL normalization. |
| `screens/PhoneNumberScreen.js` | Already restored real OTP send flow instead of fake local auth. |
| `navigation/AppNavigator.js` | Already restored the OTP route into the Expo auth navigation stack. |

## F. Root Cause Summary

### Invalid OTP

Current likely root causes are backend state and OTP lifecycle, not frontend contract mismatch:

- Every resend expires previous pending OTP rows for that phone, so an older OTP becomes invalid immediately.
- OTP lookup only accepts the latest pending OTP record for the phone.
- OTP can fail due to expiry, attempt limits, or bcrypt compare failure.
- Expo is now calling the correct route with the correct payload shape.

### Listener invalid credentials

Current likely root causes are backend account state and listener lookup, not route mismatch:

- Backend only authenticates users with `role === "LISTENER"`.
- Identity must match listener `id`, `phone`, or `email`.
- Account must have a `passwordHash`.
- Listener account must not be blocked/deleted.
- Listener profile must exist and be enabled.
- Expo listener login payload now matches the accepted backend contract.

### Admin invalid credentials

The main contract confusion here was identifier expectation:

- Backend admin login only authenticates by phone/email identity plus password.
- Backend also rejects any successful password login whose resulting role is not exactly `ADMIN`.
- Prisma schema only supports `ADMIN` as the admin role today.
- The old frontend copy/demo path could make it look like `adminId`-style login should work; that mismatch has now been corrected.

## Verification

- `node --check backend/src/routes/authRoutes.js`
- `node --check backend/src/modules/auth/auth.service.js`
- `node --check backend/src/modules/auth/auth.controller.js`
- `npm run lint` in `admin-panel`

## Bottom Line

- Expo user OTP auth: contract matches backend.
- Expo listener login: contract matches backend.
- Admin login/refresh/logout/me: contract matches backend.
- The auth system is no longer failing because of API base URL drift or current frontend auth route shape drift.
- Remaining auth failures should now be debugged as backend state/credential/data issues using the redacted logs added in this pass.
