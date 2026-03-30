# Clarivoice Backend

Production-style Node.js backend for Clarivoice using Express, PostgreSQL, Prisma, Redis, JWT auth, and Socket.IO.

## Stack
- Node.js + Express
- PostgreSQL + Prisma ORM
- Redis (session/cache ready)
- Socket.IO (chat/call signaling + realtime wallet events)
- JWT access/refresh tokens + bcrypt
- Zod validation, Helmet, CORS, rate limiting
- Payment provider abstraction (Mock/Razorpay/Stripe-ready)

## Features Implemented
- Role system: `USER`, `LISTENER`, `ADMIN`
- OTP auth architecture with demo OTP mode
- Refresh-token session model in `AuthSession`
- Strong wallet ledger model (`Wallet` + `WalletTransaction`)
- Atomic wallet credit/debit with DB transaction + row lock
- Recharge order + verification flow
- Coupon evaluation flow
- Referral code apply + qualification + rewards
- Chat request/accept/reject/end + realtime messages + read receipts
- Call request/accept/reject/end + WebRTC signal relay events
- Per-minute billing for chat and call
- Auto warning + auto-end on insufficient wallet balance
- Usage summary API
- Sidebar payload API for drawer screen
- Support ticket and user settings scaffolds
- Admin APIs for rates/plans/rules/ledger/manual adjustments

## Core Business Guardrails
- User cannot start chat/call without minimum required balance
- Listener must be enabled and online to accept sessions
- Billing starts only when chat/call becomes `ACTIVE`
- Wallet debit is interval-based (per minute)
- Billing uses idempotency keys (`chat:<session>:<minute>`, `call:<session>:<minute>`)
- If balance cannot cover next cycle:
  - emits low-balance warning
  - auto-ends session
  - persists `endReason = INSUFFICIENT_BALANCE`
- Payment credit happens only after verification success
- Referral reward unlocks only after qualifying verified recharge
- Self referral and repeated code application are blocked

## Folder Structure
```text
backend/
  prisma/
    schema.prisma
    seed.js
  postman/
    clarivoice.postman_collection.json
  src/
    app.js
    server.js
    config/
      env.js
      logger.js
      prisma.js
      redis.js
    constants/
      errors.js
      roles.js
    middleware/
      auth.js
      roles.js
      validate.js
      sanitize.js
      rateLimiter.js
      notFound.js
      errorHandler.js
    routes/
      index.js
    services/
      wallet.service.js
      sessionGuard.service.js
      payment/
        paymentProviderFactory.js
        providers/
          base.provider.js
          mock.provider.js
          razorpay.provider.js
          stripe.provider.js
    jobs/
      sessionBillingManager.js
    socket/
      index.js
    modules/
      auth/
      profile/
      listeners/
      wallet/
      referral/
      chat/
      call/
      usage/
      support/
      settings/
      app/
      admin/
```

## Environment
1. Copy `.env.example` to `.env`
2. Fill required values

Important vars:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `DEMO_OTP_MODE=true` for local demo OTP
- `PAYMENT_PROVIDER=mock|razorpay|stripe`

## Setup
```bash
cd backend
npm install
npx prisma migrate dev --name init
npx prisma generate
npm run prisma:seed
npm run dev
```

Server starts on `PORT` (default `8080`) and API base path `API_PREFIX` (default `/api/v1`).

### Required Agora Environment
Set these before startup (local `.env` or Railway Variables):
- `AGORA_APP_ID=d693b2cf2b9649d08f667a3d7a25011f`
- `AGORA_APP_CERTIFICATE=<your rotated certificate>`
- `AGORA_TOKEN_EXPIRE_SECONDS=3600`
- `AGORA_CHAT_APP_KEY=<your agora chat app key>` (required for Agora Chat SDK clients)

If `AGORA_APP_ID` or `AGORA_APP_CERTIFICATE` is missing, startup fails with:
`Missing Agora configuration. Please set AGORA_APP_ID and AGORA_APP_CERTIFICATE.`

## Seeded Demo Data
- Admin login ID: `admin25`
- Admin phone: `+910000000001`
- Listener phone: `+910000000101`
- User phone: `+910000000201`
- Password for seeded admin/listener: `Admin@123`
- Demo OTP (when enabled): `123456`
- Demo listener bypass ID/password: `000000101` / `12345678` only when `DEMO_LISTENER_LOGIN_BYPASS=true`
- Recharge plans: `159`, `249`, `449`
- Coupon: `FLAT200`

## Key REST Endpoints
### Auth
- `POST /api/v1/auth/send-otp`
- `POST /api/v1/auth/verify-otp`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

### Admin Auth
- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/refresh`
- `POST /api/v1/admin/auth/logout`
- `GET /api/v1/admin/me`

### Profile
- `GET /api/v1/me`
- `PATCH /api/v1/me`
- `DELETE /api/v1/me`

### Listeners
- `GET /api/v1/listeners`
- `GET /api/v1/listeners/:id`
- `GET /api/v1/listeners/:id/availability`

### Wallet
- `GET /api/v1/wallet/summary`
- `GET /api/v1/wallet/history`
- `GET /api/v1/wallet/plans`
- `POST /api/v1/wallet/create-order`
- `POST /api/v1/wallet/verify-payment`
- `POST /api/v1/wallet/apply-coupon`

### Referral
- `GET /api/v1/referral/me`
- `POST /api/v1/referral/apply-code`
- `GET /api/v1/referral/history`
- `GET /api/v1/referral/faq`

### Chat
- `POST /api/v1/chat/request`
- `POST /api/v1/chat/:sessionId/end`
- `GET /api/v1/chat/sessions`
- `GET /api/v1/chat/:sessionId/messages`

### Call
- `POST /api/v1/call/request`
- `POST /api/v1/call/:sessionId/accept`
- `POST /api/v1/call/:sessionId/reject`
- `POST /api/v1/call/:sessionId/end`
- `GET /api/v1/call/sessions`

### Agora (Auth Required)
- `POST /api/v1/agora/rtc-token`
  - Body: `{ "sessionId": "<approved-call-session-id>", "role": "publisher" }`
- `POST /api/v1/agora/chat-token`
  - Body: `{ "sessionId": "<approved-chat-session-id>" }`

Compatibility aliases are also exposed at:
- `POST /api/agora/rtc-token`
- `POST /api/agora/chat-token`

Token endpoints never expose `AGORA_APP_CERTIFICATE`, always generate tokens on backend only, and require an already-approved backend session.

On failed pre-checks they return:
```json
{
  "success": false,
  "code": "INSUFFICIENT_BALANCE_OR_HOST_UNAVAILABLE",
  "message": "You do not have sufficient balance or this host is currently unavailable."
}
```

### Usage / Support / Settings / App
- `GET /api/v1/usage/summary`
- `POST /api/v1/support/ticket`
- `GET /api/v1/settings`
- `PATCH /api/v1/settings`
- `GET /api/v1/app/sidebar`

### Admin (Admin role only)
- `GET /api/v1/admin/users`
- `GET /api/v1/admin/listeners`
- `PATCH /api/v1/admin/listeners/:id/rates`
- `PATCH /api/v1/admin/listeners/:id/status`
- `PATCH /api/v1/admin/listeners/:id/visibility`
- `POST /api/v1/admin/listeners/:id/remove`
- `GET /api/v1/admin/wallet/ledger`
- `POST /api/v1/admin/wallet/adjust`
- `GET /api/v1/admin/sessions/chat`
- `GET /api/v1/admin/sessions/call`
- `GET /api/v1/admin/recharge-plans`
- `POST /api/v1/admin/recharge-plans`
- `PATCH /api/v1/admin/recharge-plans/:id`
- `GET /api/v1/admin/referral-rule`
- `PATCH /api/v1/admin/referral-rule`

## Socket.IO Events
Supported event patterns:
- Sync: `host_updated`, `host_deleted`, `host_status_changed`, `pricing_updated`, `referral_updated`, `wallet_updated`
- Presence: `user_online`, `user_offline`, `listener_online`, `listener_offline`, `listener_busy`, `listener_status_changed`
- Chat: `chat_request`, `chat_accepted`, `chat_rejected`, `chat_message`, `chat_read`, `chat_low_balance_warning`, `chat_ended`
- Call: `call_request`, `call_ringing`, `call_accepted`, `call_rejected`, `call_signal`, `call_low_balance_warning`, `call_ended`

## Real-Time Consistency Rules
- Listener list is always DB-backed and filtered by `isEnabled = true`, `user.status = ACTIVE`, `deletedAt = null`.
- Admin host removal uses soft delete (`User.status = DELETED`, `deletedAt`, `ListenerProfile.isEnabled = false`, `availability = OFFLINE`).
- `POST /chat/request` and `POST /call/request` always re-check host state + wallet from DB.
- `POST /call/:sessionId/accept` and chat accept flow re-check DB state again before session activation.
- If host or wallet state changed during pending state, session activation is blocked and session is cancelled safely.
- Billing timer emits low balance warning, debits wallet atomically, and auto-ends session on insufficient balance.
- Host status and wallet updates are pushed over sockets and should be paired with API re-fetch on screen focus in mobile clients.

## Frontend Error Format Example
Insufficient balance responses use this structure:
```json
{
  "success": false,
  "code": "INSUFFICIENT_BALANCE",
  "message": "You do not have sufficient balance. Please recharge your wallet to continue.",
  "data": {
    "currentBalance": 12,
    "requiredBalance": 30,
    "suggestedRechargePlans": [159, 249, 449]
  }
}
```

## Notes
- Payment providers `Razorpay` and `Stripe` are pluggable through `paymentProviderFactory`; mock provider is enabled by default.
- Redis is wired and ready; the current billing loop uses server timers and can be moved to distributed workers later.
- Financial records are kept immutable through `WalletTransaction` ledger entries.

## Railway Deployment Notes
In Railway service variables, set:
- `AGORA_APP_ID=d693b2cf2b9649d08f667a3d7a25011f`
- `AGORA_APP_CERTIFICATE=MY_ROTATED_CERTIFICATE`
- `AGORA_TOKEN_EXPIRE_SECONDS=3600`

Also set your existing:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CLIENT_ORIGIN=https://admin-panel-ivory-eight-58.vercel.app,http://localhost:3000,http://localhost:19006`

Do not commit `.env` files with secrets.
