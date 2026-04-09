# DDivine Backend — Complete Master Prompt v1.0
> **v1.0 FINAL — Phase-Locked, Contract-Safe, Zod-First**
> Paste this entire document as the system/context prompt before issuing any build command.
> Then say **"Start Phase 1"** to begin. Never skip phases.
> This document is the single source of truth. If this document and any previous instruction conflict, this document wins.

---

## 1. RULE PRIORITY LEGEND

| Tag | Meaning | Consequence of Breaking |
|---|---|---|
| 🔴 **HARD RULE** | Must never be broken | Reject and rewrite the output |
| 🟡 **SOFT RULE** | Strong default; can bend only with written justification | Flag the deviation |
| 🔵 **GUIDELINE** | Recommended approach | Use judgement |

**When in doubt, treat it as a HARD RULE.**

---

## 2. EXECUTION MODE

### 2.1 The One Rule That Overrides Everything

```text
🔴 HARD RULE:

ASK BEFORE ADDING.

Before adding any feature, abstraction, dependency, or file, ask:
"Is this required for THIS phase checkpoint to pass?"

If YES  -> build it.
If NO   -> do not build it, do not stub it, do not mention it.
```

### 2.2 Phase Priority

```text
Phase 1-2  -> Working beats Perfect
Phase 3-5  -> Correct beats Fast
Phase 6-8  -> Robust beats Done
```

### 2.3 Phase Precedence Rule

```text
🔴 HARD RULE:
If a folder, abstraction, or pattern is not unlocked in the current phase,
treat it as if it does not exist. Do not import from it. Do not reference it.
Do not invent an alternative. Simply defer it.
```

### 2.4 Completion Report Rule

After every phase, output:

- Files created
- Files modified
- Dependencies added and exact reason
- Checkpoint results: pass/fail per item
- Explicitly deferred work and which phase unlocks it

### 2.5 API Versioning

```text
🔴 HARD RULE:
All API routes MUST be prefixed with /api/v1/.

Example: POST /api/v1/auth/login, GET /api/v1/bookings/mine

The frontend's VITE_API_BASE_URL will be set to http://localhost:3000/api/v1.
When Section 8 references an endpoint like POST /auth/login, the actual
registered Fastify route is POST /api/v1/auth/login.
```

---

## 3. NON-NEGOTIABLE ARCHITECTURE DECISIONS

### 3.1 Frontend Contract is Locked

```text
🔴 HARD RULE:
The frontend is already built with committed API schemas.
Every endpoint, every response shape, every error code in Section 8
is LOCKED and cannot be changed.

If a new backend requirement seems to conflict with a locked contract,
flag it immediately. Do not silently change the contract.
```

### 3.2 Zod-First Validation

```text
🔴 HARD RULE:
All incoming request bodies, query params, and route params must be
validated with Zod schemas defined in the module's own .schema.ts file.

No raw `req.body` usage in services or controllers without prior schema parse.
All Prisma output that crosses a module boundary must be mapped through
the module's response schema before being returned.
```

### 3.3 Repository Pattern

```text
🔴 HARD RULE:
Prisma is only used inside *.repository.ts files.
Services never import PrismaClient directly.
Controllers never import PrismaClient.
```

### 3.4 No Circular Imports

```text
🔴 HARD RULE:
Module A must never import from Module B's internal files.
Modules may only share via src/shared/.
No cross-module imports.
```

### 3.5 Error Flow

```text
🔴 HARD RULE:
All errors must be instances of AppError or a subclass.
Errors must never be thrown as plain strings or generic Error objects
from the service layer upward.
The global error handler (errorHandler.ts) is the only place that
converts an AppError into an HTTP response.
```

### 3.6 Auth Middleware

```text
🔴 HARD RULE:
Protected routes must use the auth middleware defined in
src/shared/middleware/auth.middleware.ts.
No inline JWT verification in controllers.
No inline role checks in controllers without going through rbac.middleware.ts.
```

### 3.7 No console.log

```text
🔴 HARD RULE:
Use logger.* (Pino) everywhere from Phase 1 onward.
console.log is never acceptable in any committed file.
```

---

## 4. PRODUCT SUMMARY

**Product Name:** DDivine Training
**Purpose:** Full-stack web platform for sports coaching and wraparound childcare for children aged 5–14
**User Roles:** `parent` | `school` | `admin`
**Core Modules:** Auth, Users, Children, Services, Sessions, Bookings, Payments, Invoices, Refunds, Notifications, Jobs, CMS/Knowledge, League, Schools, Admin
**Frontend Stack:** React 18 + Vite + TypeScript (already built — do not touch)
**Backend serves the frontend's API contract exactly as defined in Section 8**

---

## 5. TECHNOLOGY STACK

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js 20 LTS | |
| Framework | Fastify v4 | Use `fastify-plugin` for all plugins |
| Language | TypeScript 5 strict mode | `strict: true` in tsconfig |
| ORM | Prisma 5 | PostgreSQL dialect |
| Database | PostgreSQL 15 | |
| Cache / Rate Limit | Redis 7 via `ioredis` | |
| Validation | Zod v3 | Request + response validation |
| Auth | JWT (`jsonwebtoken`) + bcryptjs | No httpOnly cookies in v1 |
| Queue (Phase 5+) | BullMQ + Redis | Replaces in-process emitter |
| Payments | Stripe Node SDK | |
| Email | Nodemailer (Phase 5) | SMTP or SendGrid transport |
| PDF (Phase 4) | `@sparticuz/chromium` + Puppeteer OR `pdfkit` | Decision deferred to Phase 4 |
| Logging | Pino | Structured JSON logs |
| Testing | Vitest + `supertest` | Unit + integration |
| Linting | ESLint + Prettier (TypeScript-first) | |
| Environment | Zod env validation at startup | Fail fast if missing vars |

---

## 6. FOLDER STRUCTURE

This is the canonical source of truth. Do not create files outside this shape without updating this section.

```text
ddivine-backend/
│
├── prisma/
│   ├── schema.prisma              # Canonical DB schema — Section 10
│   ├── seed.ts                    # Dev seed data
│   └── migrations/                # Auto-generated by Prisma
│
├── src/
│   ├── server.ts                  # Entry point — creates Fastify app, starts listening
│   ├── app.ts                     # Registers plugins, routes, error handler
│   │
│   ├── config/
│   │   ├── env.ts                 # Zod env schema + parsed export
│   │   └── index.ts               # Barrel
│   │
│   ├── shared/
│   │   │
│   │   ├── infrastructure/
│   │   │   ├── prisma.ts          # PrismaClient singleton
│   │   │   ├── redis.ts           # ioredis client singleton
│   │   │   └── logger.ts          # Pino logger singleton
│   │   │
│   │   ├── middleware/
│   │   │   ├── requestId.ts       # Attach unique requestId to every request
│   │   │   ├── auth.middleware.ts # JWT verify → attach user to request
│   │   │   ├── rbac.middleware.ts # Role assertion factory
│   │   │   ├── rateLimiter.ts     # Redis sliding window rate limiter
│   │   │   └── validate.ts        # Zod request validation helper
│   │   │
│   │   ├── errors/
│   │   │   ├── AppError.ts        # Base typed error class
│   │   │   ├── DomainError.ts     # Base for domain rule violations
│   │   │   └── errorHandler.ts    # Fastify error handler plugin
│   │   │
│   │   ├── schemas/
│   │   │   ├── common.schema.ts   # Envelope, pagination, requestId schemas
│   │   │   └── index.ts
│   │   │
│   │   ├── domain/
│   │   │   ├── value-objects/
│   │   │   │   ├── Email.ts
│   │   │   │   ├── PhoneNumber.ts
│   │   │   │   ├── DateOfBirth.ts
│   │   │   │   └── Postcode.ts
│   │   │   ├── invariants/
│   │   │   │   ├── assertAgeEligible.ts
│   │   │   │   ├── assertCapacityAvailable.ts
│   │   │   │   ├── assertNoOverlap.ts
│   │   │   │   └── assertEmergencyContactExists.ts
│   │   │   └── errors/
│   │   │       ├── CapacityExceededError.ts
│   │   │       ├── AgeIneligibleError.ts
│   │   │       ├── OverlapDetectedError.ts
│   │   │       ├── EmergencyContactMissingError.ts
│   │   │       └── index.ts
│   │   │
│   │   ├── events/
│   │   │   ├── event-bus.ts       # Phase 1: Node EventEmitter. Phase 5: swap to BullMQ
│   │   │   └── event-types.ts     # All event name constants + payload type map
│   │   │
│   │   └── utils/
│   │       ├── transaction.ts     # withRetry(prisma.$transaction) helper
│   │       ├── hash.ts            # bcryptjs hash + compare
│   │       └── token.ts           # JWT sign + verify
│   │
│   └── modules/
│       │
│       ├── auth/
│       │   ├── auth.domain.ts
│       │   ├── auth.schema.ts
│       │   ├── auth.repository.ts
│       │   ├── auth.service.ts
│       │   ├── auth.controller.ts
│       │   ├── auth.routes.ts
│       │   └── __tests__/
│       │       └── auth.service.test.ts
│       │
│       ├── users/
│       │   ├── users.schema.ts
│       │   ├── users.repository.ts
│       │   ├── users.service.ts
│       │   ├── users.controller.ts
│       │   ├── users.routes.ts
│       │   └── __tests__/
│       │       └── users.service.test.ts
│       │
│       ├── children/
│       │   ├── children.domain.ts
│       │   ├── children.schema.ts
│       │   ├── children.repository.ts
│       │   ├── children.service.ts
│       │   ├── children.controller.ts
│       │   ├── children.routes.ts
│       │   └── __tests__/
│       │       └── children.service.test.ts
│       │
│       ├── services/
│       │   ├── services.schema.ts
│       │   ├── services.repository.ts
│       │   ├── services.service.ts
│       │   ├── services.controller.ts
│       │   ├── services.routes.ts
│       │   └── __tests__/
│       │       └── services.service.test.ts
│       │
│       ├── sessions/
│       │   ├── sessions.domain.ts
│       │   ├── sessions.schema.ts
│       │   ├── sessions.repository.ts
│       │   ├── sessions.service.ts
│       │   ├── sessions.controller.ts
│       │   ├── sessions.routes.ts
│       │   └── __tests__/
│       │       └── sessions.service.test.ts
│       │
│       ├── bookings/
│       │   ├── bookings.domain.ts
│       │   ├── bookings.schema.ts
│       │   ├── bookings.repository.ts
│       │   ├── bookings.service.ts
│       │   ├── bookings.controller.ts
│       │   ├── bookings.routes.ts
│       │   └── __tests__/
│       │       └── bookings.service.test.ts
│       │
│       ├── payments/
│       │   ├── payments.domain.ts
│       │   ├── payments.schema.ts
│       │   ├── payments.repository.ts
│       │   ├── payments.service.ts
│       │   ├── payments.controller.ts
│       │   ├── payments.routes.ts
│       │   └── __tests__/
│       │       └── payments.service.test.ts
│       │
│       ├── invoices/
│       │   ├── invoices.schema.ts
│       │   ├── invoices.repository.ts
│       │   ├── invoices.service.ts
│       │   ├── invoices.controller.ts
│       │   ├── invoices.routes.ts
│       │   └── __tests__/
│       │
│       ├── refunds/
│       │   ├── refunds.domain.ts
│       │   ├── refunds.schema.ts
│       │   ├── refunds.repository.ts
│       │   ├── refunds.service.ts
│       │   ├── refunds.controller.ts
│       │   ├── refunds.routes.ts
│       │   └── __tests__/
│       │
│       ├── notifications/
│       │   ├── notifications.schema.ts
│       │   ├── notifications.repository.ts
│       │   ├── notifications.service.ts
│       │   ├── notifications.controller.ts
│       │   ├── notifications.routes.ts
│       │   └── __tests__/
│       │
│       ├── jobs/                   # Unlocks Phase 5
│       │   ├── queues/
│       │   │   ├── email.queue.ts
│       │   │   └── invoice.queue.ts
│       │   ├── workers/
│       │   │   ├── email.worker.ts
│       │   │   └── invoice.worker.ts
│       │   └── processors/
│       │       ├── sendBookingConfirmation.ts
│       │       ├── sendPaymentConfirmation.ts
│       │       └── generateInvoicePdf.ts
│       │
│       ├── knowledge/
│       │   ├── knowledge.schema.ts
│       │   ├── knowledge.repository.ts
│       │   ├── knowledge.service.ts
│       │   ├── knowledge.controller.ts
│       │   ├── knowledge.routes.ts
│       │   └── __tests__/
│       │
│       ├── schools/
│       │   ├── schools.schema.ts
│       │   ├── schools.repository.ts
│       │   ├── schools.service.ts
│       │   ├── schools.controller.ts
│       │   ├── schools.routes.ts
│       │   └── __tests__/
│       │
│       ├── league/
│       │   ├── league.domain.ts
│       │   ├── league.schema.ts
│       │   ├── league.repository.ts
│       │   ├── league.service.ts
│       │   ├── league.controller.ts
│       │   ├── league.routes.ts
│       │   └── __tests__/
│       │
│       └── admin/                  # Unlocks Phase 8
│           ├── admin-auth/
│           ├── dashboard/
│           ├── bookings-mgmt/
│           ├── sessions-mgmt/
│           ├── payments-mgmt/
│           ├── knowledge-mgmt/
│           └── roles/
│
├── tests/
│   ├── setup.ts                   # Vitest global setup
│   └── helpers/
│       ├── db.helper.ts           # Test DB reset, seed helpers
│       └── auth.helper.ts         # Generate test tokens
│
├── .env.example
├── .eslintrc.cjs
├── .prettierrc
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 7. ENVIRONMENT VARIABLES

These are the required env vars. The app must throw a startup error if any required var is missing (Zod validation on startup).

```text
# Server
PORT=3000
NODE_ENV=development | staging | production

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ddivine

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=<min 32 chars>
JWT_EXPIRES_IN=15m

# Bcrypt
BCRYPT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW_SECONDS=60

# Stripe (Phase 4+)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Email (Phase 5+)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@ddivine.co.uk

# Xero (Phase 4+)
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=

# CORS
CORS_ORIGIN=http://localhost:5173
```

---

## 8. API CONTRACT (LOCKED)

```text
🔴 HARD RULE:
This section is derived directly from the frontend's committed Zod schemas.
Every response shape here is what the frontend's parseSingleResponse or
parseCollectionResponse will attempt to parse.
If the backend returns a different shape, the frontend will throw a
RESPONSE_VALIDATION_ERROR. Do not deviate.
```

### 8.1 Auth Endpoints

```text
POST /auth/login
Body:    { email: string, password: string, role: 'parent' | 'school' }
Success: 200 → { accessToken: string, role: 'parent' | 'school', user: { id, email, firstName, lastName, role } }
Errors:  401 INVALID_CREDENTIALS | 422 VALIDATION_ERROR | 429 RATE_LIMITED

POST /auth/signup/parent
Body:    {
           email, password,
           fullName,                  ← frontend sends combined name; backend splits on first space → firstName + lastName
           phoneNumber?,              ← frontend field name; backend stores as phone
           emergencyPhoneNumber?,
           addressLine1?, addressLine2?, town?, county?,
           postCode?,                 ← frontend field name; backend stores as postcode
           childProfile?: {
             childFullName, childDateOfBirth, childSchoolName,
             firstAidPermission, gender, medicalNotes?
           }
         }
Success: 201 → { message: string }
Errors:  409 EMAIL_ALREADY_EXISTS | 422 VALIDATION_ERROR | 429 RATE_LIMITED

POST /auth/signup/school
Body:    {
           adminEmail,                ← frontend field name; backend stores as email
           adminFullName,             ← frontend field name; backend splits → firstName + lastName
           password, schoolName,
           registrationNumber?, schoolType?, website?,
           schoolLogoFileName?, verificationDocumentFileName?
         }
Success: 201 → { message: string }
Errors:  409 EMAIL_ALREADY_EXISTS | 422 VALIDATION_ERROR | 429 RATE_LIMITED

POST /auth/logout
Auth:    Bearer token required
Success: 200 → { message: string }

POST /auth/forgot-password
NOTE: Deferred — OTP flow not yet implemented.
```

### 8.2 User Endpoints

```text
GET /users/me
Auth:    Bearer token required
Success: 200 → {
  id: string,
  email: string,
  firstName: string,
  lastName: string,
  phone?: string,
  addressLine1?: string,
  addressLine2?: string,
  town?: string,
  county?: string,
  postcode?: string
}

PATCH /users/me
Auth:    Bearer token required
Body:    Partial<UserProfile> (same shape, all optional except id/email)
Success: 200 → Same shape as GET /users/me
```

### 8.3 Children Endpoints

```text
GET /users/me/children
Auth:    Bearer token (role: parent only)
Success: 200 → Array of:
  {
    id: string,
    firstName: string,
    lastName: string,
    dateOfBirth: string,     ← ISO 8601 date string "YYYY-MM-DD"
    gender: string,
    yearGroup: string,
    medicalConditions?: string
  }

POST /users/me/children
Auth:    Bearer token (role: parent only)
Body:    { firstName, lastName, dateOfBirth, gender, yearGroup, medicalConditions? }
         + at least one emergency contact
Success: 201 → Child object (same shape as above)

PATCH /users/me/children/:childId
Auth:    Bearer token (role: parent only)
Body:    Partial<Child>
Success: 200 → Updated child object

DELETE /users/me/children/:childId
Auth:    Bearer token (role: parent only)
Success: 204 → No body
```

### 8.4 Bookings Endpoints

```text
GET /bookings/mine
Auth:    Bearer token required
Success: 200 → Array of:
  {
    id: string,
    serviceName: string,
    date: string,            ← ISO 8601 datetime string
    time: string,            ← "HH:MM" format
    location: string,
    status: 'confirmed' | 'pending' | 'cancelled',
    coachName?: string,
    price?: number           ← non-negative number
  }

GET /bookings/:bookingId
Auth:    Bearer token required
Success: 200 → Single booking object (same shape)
Errors:  404 BOOKING_NOT_FOUND

POST /bookings
Auth:    Bearer token required
Body:    { sessionId: string, childId?: string, idempotencyKey?: string }
Success: 201 → Booking object (same shape as above, status: 'pending')
Errors:  409 CAPACITY_EXCEEDED | 422 AGE_INELIGIBLE | 409 BOOKING_OVERLAP

DELETE /bookings/:bookingId
Auth:    Bearer token required
Success: 204 → No body
Errors:  404 BOOKING_NOT_FOUND | 409 BOOKING_ALREADY_CANCELLED
```

### 8.5 Services Endpoints

```text
GET /services
Auth:    None (public)
Success: 200 → Array of:
  {
    id: string,
    key: 'curricular' | 'extraCurricular' | 'holidayCamps' | 'wraparound',
    title: string,
    summary: string,
    imageSrc: string,
    imageAlt: string
  }
```

### 8.6 League Endpoints

```text
GET /league/table
Auth:    None (public)
Success: 200 → Array of:
  {
    teamName: string,
    matchesPlayed: number,   ← non-negative integer
    wins: number,
    draws: number,
    losses: number,
    points: number
  }

GET /league/games
Auth:    None (public)
Success: 200 → Array of match objects (see Section 10 for Match schema)
```

### 8.7 Knowledge Endpoints

```text
GET /knowledge/case-studies
Auth:    None (public)
Success: 200 → Array of:
  { id: string, title: string, body: string, tag?: string }

GET /knowledge/free-activities
Auth:    None (public)
Success: 200 → Array of:
  { id: string, title: string, description: string, downloads: string[] }

GET /faqs
Auth:    None (public)
Success: 200 → Array of:
  { title: string, items: [{ question: string, answer: string }] }
```

### 8.8 Response Collection Format

The frontend's `parseCollectionResponse` accepts EITHER of these two shapes:

```text
Option A (simple array):
[ ...items ]

Option B (paginated envelope):
{
  data: [...items],
  page: number,         ← positive integer
  pageSize: number,     ← positive integer
  total: number,        ← non-negative integer
  totalPages: number    ← positive integer
}
```

For public endpoints (services, league, knowledge), always return Option A (simple array).
For paginated dashboard endpoints, return Option B.

### 8.9 Error Response Envelope (LOCKED)

```text
🔴 HARD RULE:
Every error response must follow this exact shape. The frontend parses
this shape in axios.config.ts. Any deviation will cause silent failures.
```

```json
{
  "code": "BOOKING_NOT_FOUND",
  "message": "Booking not found.",
  "status": 404,
  "errors": [
    { "field": "email", "message": "Email already exists." }
  ],
  "retryAfter": 60
}
```

Rules:
- `code` — one of the locked error codes (Section 8.10)
- `message` — human-readable, safe to display
- `status` — mirrors the HTTP status code
- `errors` — optional, array of field-level validation errors
- `retryAfter` — only present on 429 responses; also set `Retry-After` header

### 8.10 Error Code Registry (LOCKED)

```text
🔴 HARD RULE:
Only use error codes from this list. The frontend has these hardcoded.
Adding new codes is allowed. Changing or removing existing ones is not.
```

| Code | HTTP Status | When to Use |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Wrong email/password or wrong role |
| `TOKEN_EXPIRED` | 401 | JWT has expired |
| `ACCOUNT_NOT_FOUND` | 404 | User lookup failed by ID or email |
| `EMAIL_ALREADY_EXISTS` | 409 | Signup with duplicate email |
| `BOOKING_NOT_FOUND` | 404 | Booking ID does not exist or not owned |
| `BOOKING_ALREADY_CANCELLED` | 409 | Attempt to cancel an already-cancelled booking |
| `VALIDATION_ERROR` | 422 | Zod parse failure on request body |
| `RATE_LIMITED` | 429 | Rate limit exceeded (also set Retry-After header) |
| `SERVER_ERROR` | 500 | Any unhandled internal error |
| `NETWORK_ERROR` | — | Frontend-only. Backend never returns this code. |
| `RESPONSE_VALIDATION_ERROR` | — | Frontend-only. Thrown when backend response shape is wrong. |
| `CAPACITY_EXCEEDED` | 409 | Booking when session is full |
| `AGE_INELIGIBLE` | 422 | Child's age outside session range |
| `BOOKING_OVERLAP` | 409 | Child already booked for that time slot |
| `EMERGENCY_CONTACT_REQUIRED` | 422 | Creating child without emergency contact |

### 8.11 Auth Header

The frontend sends:
```
Authorization: Bearer <accessToken>
```

The `auth.middleware.ts` must:
1. Extract the Bearer token from the `Authorization` header
2. Verify with `jwt.verify(token, JWT_SECRET)`
3. Attach `{ id, email, role }` to `request.user`
4. On failure, return `401` with code `TOKEN_EXPIRED` or `INVALID_CREDENTIALS`

---

## 9. CODING STANDARDS

### 9.1 TypeScript

- `strict: true` always
- No `any`
- No `@ts-ignore` without a written justification comment
- Use `interface` for object shapes, `type` for unions and intersections
- All request/response types must come from Zod schemas using `z.infer<typeof Schema>`
- Do not duplicate types — if the Prisma model and the response shape are the same, write a mapper, not a second interface

### 9.2 File Header Rule

```text
🔴 HARD RULE:
Every .ts file must include a JSDoc file header.
This rule does NOT apply to JSON, .env, markdown, or migration files.
```

Template:

```ts
/**
 * @file filename.ts
 * @description One-line description of this file's responsibility.
 * @module src/path/to/module
 */
```

### 9.3 File Size Guardrails

```text
🔴 HARD RULE:
If a service file exceeds 150 lines, split it.
If a repository file exceeds 200 lines, split it.
If a schema file exceeds 100 lines, split it.
If a route file exceeds 60 lines, split it.
```

### 9.4 Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files | `module.layer.ts` | `auth.service.ts` |
| Classes | PascalCase | `AppError` |
| Functions | camelCase | `createBooking` |
| Constants | SCREAMING_SNAKE | `JWT_SECRET` |
| Zod schemas | PascalCase + Schema suffix | `BookingSchema` |
| Inferred types | PascalCase + I prefix | `IBooking` |
| DB models | PascalCase (Prisma convention) | `User`, `Booking` |
| DB enums | SCREAMING_SNAKE (Prisma convention) | `BOOKING_STATUS` |

### 9.5 Import Rules

- Use absolute imports with `@/` alias pointing to `src/`
- No `../../..` relative paths
- Import from barrel `index.ts` files for shared modules
- No cross-module imports — modules share only via `src/shared/`

### 9.6 Async Rules

- All async functions must return typed Promises
- Never swallow errors silently
- Wrap Prisma calls in try/catch at the repository level
- Re-throw as `AppError` with the appropriate code

### 9.7 Prisma-to-API Mapping Rules

```text
🔴 HARD RULE:
Prisma model objects must NEVER be returned directly from controllers.
They must be mapped to the API response shape through these rules:
```

| Prisma Type | API Type | Mapper |
|---|---|---|
| `Decimal` | `number` | `Number(value)` or `value.toNumber()` |
| `DateTime` | ISO 8601 `string` | `value.toISOString()` |
| Prisma enum (`SCREAMING_SNAKE`) | camelCase string | Explicit mapping function per enum |
| Nullable field not in contract | Omit | Do not include in response |

**ServiceKey enum map (required):**

```ts
const SERVICE_KEY_MAP: Record<ServiceKey, string> = {
  CURRICULAR: 'curricular',
  EXTRA_CURRICULAR: 'extraCurricular',
  HOLIDAY_CAMPS: 'holidayCamps',
  WRAPAROUND: 'wraparound',
};
```

**BookingStatus enum map (required):**

```ts
const BOOKING_STATUS_MAP: Record<BookingStatus, string> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
};
```

These maps live in the respective module's `.schema.ts` file.

### 9.8 Pagination Defaults

```text
🔴 HARD RULE:
Default pageSize: 20
Maximum pageSize: 100
Any request with pageSize > 100 must be clamped to 100, not rejected.
Page numbering starts at 1.
```

---

## 10. DATABASE SCHEMA (PRISMA)

```text
🔴 HARD RULE:
Do not add, rename, or remove Prisma models or fields without explicitly
updating this section. The schema here is the source of truth.
```

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ────────────────────────────────────────────────

enum UserRole {
  PARENT
  SCHOOL
  ADMIN
}

enum BookingStatus {
  PENDING
  CONFIRMED
  CANCELLED
}

enum PaymentStatus {
  PENDING
  PAID
  REFUNDED
  FAILED
}

enum RefundStatus {
  PENDING
  COMPLETED
  FAILED
}

enum MatchStatus {
  SCHEDULED
  COMPLETED
  CANCELLED
}

enum ServiceKey {
  CURRICULAR
  EXTRA_CURRICULAR
  HOLIDAY_CAMPS
  WRAPAROUND
}

enum OtpType {
  SIGNUP
  PASSWORD_RESET
}

// ─── User ─────────────────────────────────────────────────

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  role         UserRole
  firstName    String
  lastName     String
  schoolName   String?          // Only for SCHOOL role; null for PARENT
  phone        String?
  addressLine1 String?
  addressLine2 String?
  town         String?
  county       String?
  postcode     String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  children      Child[]
  bookings      Booking[]
  notifications Notification[]

  @@index([email, role])
}

// ─── Child ────────────────────────────────────────────────

model Child {
  id                String   @id @default(cuid())
  userId            String
  firstName         String
  lastName          String
  dateOfBirth       DateTime
  gender            String
  yearGroup         String
  medicalConditions String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user               User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  emergencyContacts  EmergencyContact[]
  bookings           Booking[]

  @@index([userId])
}

// ─── EmergencyContact ─────────────────────────────────────

model EmergencyContact {
  id           String  @id @default(cuid())
  childId      String
  name         String
  phone        String
  relationship String
  createdAt    DateTime @default(now())

  child Child @relation(fields: [childId], references: [id], onDelete: Cascade)

  @@index([childId])
}

// ─── Service ──────────────────────────────────────────────

model Service {
  id        String     @id @default(cuid())
  key       ServiceKey @unique
  title     String
  summary   String
  imageSrc  String
  imageAlt  String
  isActive  Boolean    @default(true)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  sessions Session[]
}

// ─── Session ──────────────────────────────────────────────

model Session {
  id              String   @id @default(cuid())
  serviceId       String
  date            DateTime
  time            String
  location        String
  coachName       String?
  maxCapacity     Int
  currentCapacity Int      @default(0)
  minAgeYears     Int
  maxAgeYears     Int
  price           Decimal  @db.Decimal(10, 2)
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  service  Service   @relation(fields: [serviceId], references: [id])
  bookings Booking[]

  @@index([serviceId, date])
  @@index([date, isActive])
}

// ─── Booking ──────────────────────────────────────────────

model Booking {
  id          String        @id @default(cuid())
  userId      String
  childId     String?
  sessionId   String
  status      BookingStatus @default(PENDING)
  price       Decimal       @db.Decimal(10, 2)
  cancelledAt DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  user     User      @relation(fields: [userId], references: [id])
  child    Child?    @relation(fields: [childId], references: [id])
  session  Session   @relation(fields: [sessionId], references: [id])
  payment  Payment?

  @@index([userId, status])
  @@index([sessionId])
}

// ─── Payment ──────────────────────────────────────────────

model Payment {
  id                     String        @id @default(cuid())
  bookingId              String        @unique
  stripePaymentIntentId  String        @unique
  amount                 Decimal       @db.Decimal(10, 2)
  currency               String        @default("gbp")
  status                 PaymentStatus @default(PENDING)
  createdAt              DateTime      @default(now())
  updatedAt              DateTime      @updatedAt

  booking  Booking  @relation(fields: [bookingId], references: [id])
  invoice  Invoice?
  refunds  Refund[]

  @@index([stripePaymentIntentId])
}

// ─── Invoice ──────────────────────────────────────────────

model Invoice {
  id             String   @id @default(cuid())
  paymentId      String   @unique
  pdfUrl         String?
  xeroInvoiceId  String?
  createdAt      DateTime @default(now())

  payment Payment @relation(fields: [paymentId], references: [id])
}

// ─── Refund ───────────────────────────────────────────────

model Refund {
  id               String       @id @default(cuid())
  paymentId        String
  stripeRefundId   String?      @unique
  amount           Decimal      @db.Decimal(10, 2)
  reason           String
  status           RefundStatus @default(PENDING)
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  payment Payment @relation(fields: [paymentId], references: [id])
}

// ─── Notification ─────────────────────────────────────────

model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String
  title     String
  body      String
  isRead    Boolean  @default(false)
  metadata  Json?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
}

// ─── OTP ──────────────────────────────────────────────────

model Otp {
  id        String   @id @default(cuid())
  email     String
  code      String
  type      OtpType
  attempts  Int      @default(0)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([email, type])
}

// ─── League ───────────────────────────────────────────────

model Team {
  id        String   @id @default(cuid())
  name      String
  schoolId  String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  homeMatches Match[] @relation("HomeTeam")
  awayMatches Match[] @relation("AwayTeam")
  standing    LeagueStanding?
}

model Match {
  id          String      @id @default(cuid())
  homeTeamId  String
  awayTeamId  String
  homeScore   Int?
  awayScore   Int?
  date        DateTime
  status      MatchStatus @default(SCHEDULED)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  homeTeam Team @relation("HomeTeam", fields: [homeTeamId], references: [id])
  awayTeam Team @relation("AwayTeam", fields: [awayTeamId], references: [id])

  @@index([status, date])
}

model LeagueStanding {
  id             String   @id @default(cuid())
  teamId         String   @unique
  matchesPlayed  Int      @default(0)
  wins           Int      @default(0)
  draws          Int      @default(0)
  losses         Int      @default(0)
  points         Int      @default(0)
  updatedAt      DateTime @updatedAt

  team Team @relation(fields: [teamId], references: [id])
}

// ─── Knowledge ────────────────────────────────────────────

model CaseStudy {
  id        String   @id @default(cuid())
  title     String
  body      String
  tag       String?
  isActive  Boolean  @default(true)
  order     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model FreeActivityGroup {
  id          String   @id @default(cuid())
  title       String
  description String
  isActive    Boolean  @default(true)
  order       Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  downloads FreeActivityDownload[]
}

model FreeActivityDownload {
  id       String @id @default(cuid())
  groupId  String
  url      String

  group FreeActivityGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
}

model FaqGroup {
  id       String    @id @default(cuid())
  title    String
  order    Int       @default(0)
  isActive Boolean   @default(true)

  items FaqItem[]
}

model FaqItem {
  id       String  @id @default(cuid())
  groupId  String
  question String
  answer   String
  order    Int     @default(0)

  group FaqGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
}
```

---

## 11. DOMAIN RULES

### 11.1 Value Objects

Every value object is a pure function or class that wraps a primitive with validation. They live in `src/shared/domain/value-objects/`.

```ts
// Example pattern — do not deviate
export function validateEmail(raw: string): string {
  const result = z.string().email().safeParse(raw);
  if (!result.success) throw new DomainError('INVALID_EMAIL', 'Invalid email format.');
  return result.data.toLowerCase().trim();
}
```

| Value Object | Rule |
|---|---|
| `Email` | Lowercase, trim, must pass Zod email |
| `PhoneNumber` | UK format: `^(\+44\|0)[0-9]{10}$` |
| `DateOfBirth` | Must be in the past; derive age in years |
| `Postcode` | UK postcode pattern |

### 11.2 Invariants

Pure functions that throw `DomainError` if a rule is violated. They live in `src/shared/domain/invariants/`. They have no side effects and do not import Prisma.

| Invariant | Rule |
|---|---|
| `assertAgeEligible(child, session)` | Child's age must be within `session.minAgeYears`–`session.maxAgeYears`. Derive age from `child.dateOfBirth` at time of `session.date`. |
| `assertCapacityAvailable(session)` | `session.currentCapacity < session.maxCapacity` |
| `assertNoOverlap(existingBookings, newSession)` | No confirmed booking for the same child on the same date/time slot |
| `assertEmergencyContactExists(childId, contacts)` | `contacts.length >= 1` |

### 11.3 Domain Errors

Domain errors extend `DomainError` which extends `AppError`. They are the correct way to surface business rule failures.

```ts
// Example AppError
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number,
    public readonly errors?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

| Domain Error | HTTP Status | Code |
|---|---|---|
| `CapacityExceededError` | 409 | `CAPACITY_EXCEEDED` |
| `AgeIneligibleError` | 422 | `AGE_INELIGIBLE` |
| `OverlapDetectedError` | 409 | `BOOKING_OVERLAP` |
| `EmergencyContactMissingError` | 422 | `EMERGENCY_CONTACT_REQUIRED` |

---

## 12. EVENT SYSTEM RULES

### 12.1 Phase 1–4: In-Process EventEmitter

```text
Use Node's built-in EventEmitter wrapped in event-bus.ts.
Do not install BullMQ before Phase 5.
The interface must be identical so the swap in Phase 5 is seamless.
```

```ts
// event-bus.ts interface (Phase 1–4)
eventBus.emit(EventType.BOOKING_CREATED, payload);
eventBus.on(EventType.BOOKING_CREATED, handler);
```

### 12.2 Phase 5+: BullMQ

```text
Swap event-bus.ts to publish to BullMQ queues.
All handlers become BullMQ workers.
The calling code in modules must not change — only event-bus.ts changes.
```

### 12.3 Event Type Registry

All event names live in `event-types.ts`. Never use raw string literals for event names.

```ts
export const EventType = {
  BOOKING_CREATED:    'booking.created',
  BOOKING_CANCELLED:  'booking.cancelled',
  PAYMENT_SUCCEEDED:  'payment.succeeded',
  PAYMENT_FAILED:     'payment.failed',
  REFUND_ISSUED:      'refund.issued',
  USER_SIGNED_UP:     'user.signed_up',
} as const;
```

### 12.4 Event Emission Rule

```text
🔴 HARD RULE:
Events are emitted AFTER the primary transaction is committed.
Never emit events inside a database transaction.
If the transaction rolls back, no event should have been emitted.
```

---

## 13. AUTH RULES

### 13.1 JWT

- Sign with `JWT_SECRET` (min 32 chars, must be in env)
- Set `expiresIn` from `JWT_EXPIRES_IN` env var (default `15m`)
- Payload: `{ sub: userId, email, role, jti: cuid() }`
- Every token MUST include a unique `jti` (JWT ID) for blacklist support
- No refresh tokens in v1

### 13.1.1 Token Blacklist (Logout)

```text
🔴 HARD RULE:
Logout must invalidate the token server-side, not just client-side.
```

On `POST /auth/logout`:
1. Extract the `jti` from the verified token
2. Store it in Redis: `SET token:blacklist:<jti> 1 EX <remainingTTL>`
3. The `auth.middleware.ts` must check `token:blacklist:<jti>` on every request
4. If found, return `401 TOKEN_EXPIRED`

### 13.2 Password

- Hash with `bcryptjs` using `BCRYPT_ROUNDS` (default 12)
- Never log, store, or transmit plain-text passwords anywhere
- Minimum password length: 8 characters (enforced by Zod schema)

### 13.3 OTP

- 6-digit numeric code
- Expires in 10 minutes
- Maximum 5 attempts before the OTP is invalidated
- Rate limited: maximum 3 OTP requests per email per 15 minutes

### 13.4 Role Enforcement

```text
🔴 HARD RULE:
GET /users/me/children — role: PARENT only
POST /users/me/children — role: PARENT only
All /api/v1/admin/* routes — role: ADMIN only (Phase 8)
```

### 13.5 Admin Auth Design

```text
🔴 HARD RULE:
The existing POST /api/v1/auth/login is LOCKED to role: 'parent' | 'school'.
Admin users MUST authenticate via POST /api/v1/admin/auth/login (Phase 8).
Admin login returns the same JWT shape but with role: 'admin'.
Admin users exist in the same User table with role = ADMIN.
The admin panel uses the same backend — same DB, same Redis, separate routes.
```

Admin user creation is seed-only in development. No public admin signup endpoint exists.

### 13.5 Rate Limiting (Auth Endpoints)

Apply `rateLimiter` middleware to:

| Endpoint | Max Requests | Window |
|---|---|---|
| `POST /auth/login` | 10 | 60 seconds |
| `POST /auth/signup/parent` | 5 | 60 seconds |
| `POST /auth/signup/school` | 5 | 60 seconds |
| `POST /auth/forgot-password` | 3 | 15 minutes |

---

## 14. DATE AND TIME STANDARD

```text
🔴 HARD RULE:
All dates stored in PostgreSQL as UTC DateTime.
All dates in API responses as ISO 8601 strings.
Never return formatted date strings from the API.
Use dayjs (deferred — do not add until Phase 3) for date math in domain logic.
In Phase 1 and 2, use native Date only.
```

---

## 15. SECURITY RULES

- CORS: Allow only `CORS_ORIGIN` from env. Never `*` in production.
- Helmet: Use `@fastify/helmet` to set security headers from Phase 1.
- Input sanitisation: Never pass raw user input to Prisma `$queryRaw`. Use parameterised queries only.
- No secrets in logs: Never log passwords, tokens, credit card data, or raw OTPs.
- Stripe webhooks: Verify the `stripe-signature` header with `stripe.webhooks.constructEvent`. Reject without it.

### 15.1 Idempotency for Write Endpoints

```text
🟡 SOFT RULE:
POST endpoints that create resources (bookings, payments) should accept
an optional `Idempotency-Key` header. If present, check Redis for a
cached response. If found, return the cached response. If not, process
the request and cache the response with a 24-hour TTL.

Key format in Redis: idempotency:<endpoint>:<key_value>
```

This prevents double-bookings caused by network retries.

---

## 16. TESTING RULES

### 16.1 Unit Tests

- Every service function must have a unit test
- Every domain invariant must have a unit test
- Every Zod schema must have a test for valid and invalid inputs
- Mock the repository layer in service tests (no real DB calls)

### 16.2 Integration Tests

- Each module has at minimum one happy-path integration test via `supertest`
- Use a real test database (separate `DATABASE_URL_TEST` env var)
- Reset the test DB before each test file using a helper

### 16.3 Testing Rules

```text
🔴 HARD RULE:
Test behaviour, not implementation.
Do not test that prisma.findUnique was called with specific arguments.
Test that the service returns the expected result for a given input.
```

### 16.4 Coverage Targets

| Layer | Minimum Coverage |
|---|---|
| Domain invariants | 100% |
| Service layer | 80% |
| Repository layer | 60% (integration) |
| Controllers | 70% (integration) |

---

## 17. PHASE LOCK TABLE

A folder or feature is unavailable until its phase is unlocked. Treat a locked folder as if it does not exist.

| Feature | Ph1 | Ph2 | Ph3 | Ph4 | Ph5 | Ph6 | Ph7 | Ph8 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Fastify app + server + config | ✅ | | | | | | | |
| Pino logger | ✅ | | | | | | | |
| Prisma setup + migrations | ✅ | | | | | | | |
| Redis client | ✅ | | | | | | | |
| AppError + errorHandler | ✅ | | | | | | | |
| requestId middleware | ✅ | | | | | | | |
| Shared schemas (envelope) | ✅ | | | | | | | |
| Auth middleware + RBAC | ✅ | | | | | | | |
| Rate limiter middleware | ✅ | | | | | | | |
| In-process event bus | ✅ | | | | | | | |
| Domain value objects | ✅ | | | | | | | |
| Domain invariants | ✅ | | | | | | | |
| Domain errors | ✅ | | | | | | | |
| Auth module (signup, login, logout) | | ✅ | | | | | | |
| Users module (/users/me) | | | ✅ | | | | | |
| Children module | | | ✅ | | | | | |
| Services module (public catalog) | | | ✅ | | | | | |
| Sessions module | | | | ✅ | | | | |
| Bookings module | | | | ✅ | | | | |
| Stripe payments | | | | | ✅ | | | |
| Invoices | | | | | ✅ | | | |
| Refunds | | | | | ✅ | | | |
| BullMQ (replaces event emitter) | | | | | | ✅ | | |
| Notifications module | | | | | | ✅ | | |
| Email jobs | | | | | | ✅ | | |
| Knowledge / CMS module | | | | | | | ✅ | |
| Schools module | | | | | | | ✅ | |
| League module | | | | | | | ✅ | |
| Admin auth + modules | | | | | | | | ✅ |

---

## 18. WHAT AI MUST NEVER DO

### Before Phase 5

- Do not add BullMQ
- Do not add Stripe
- Do not add Nodemailer
- Do not add PDF generation
- Do not create the `jobs/` folder

### Before Phase 7

- Do not create the `knowledge/` module
- Do not create the `schools/` module
- Do not create the `league/` module

### Before Phase 8

- Do not create the `admin/` folder
- Do not add admin-specific routes anywhere

### General (All Phases)

Never:

- Use `console.log` (use `logger.*` always)
- Import PrismaClient outside `*.repository.ts` files
- Write raw `req.body` without Zod validation
- Inline JWT verification outside `auth.middleware.ts`
- Inline role checks outside `rbac.middleware.ts`
- Emit events inside a database transaction
- Return Prisma model objects directly from controllers (always map through response schema)
- Hardcode JWT secret, DB URL, or any credential
- Return a 500 error with the raw internal error message (always return a safe `SERVER_ERROR` message)
- Add a dependency without stating the exact reason it is needed in the phase completion report
- Create files outside the folder structure in Section 6

---

## 19. PER-MODULE DEVELOPMENT PATTERN

```text
🔴 HARD RULE:
Every module is built in this exact order. Never skip a step.
Never start with the controller or routes.
```

### Step 1: Define the API contract for this module

Write a comment block at the top of `module.schema.ts` listing every endpoint, its input shape, and its output shape. Match it exactly to Section 8.

### Step 2: Write domain logic (if applicable)

Create `module.domain.ts` with pure functions. No Prisma. No side effects. This is the logic that would break if you got it wrong.

### Step 3: Write Zod schemas

In `module.schema.ts`, define:
- Request body schemas
- Query param schemas
- Response schemas (must match the frontend contract exactly)
- Inferred TypeScript types

### Step 4: Write the repository

In `module.repository.ts`, write all Prisma queries. No business logic. No validation. Pure data access.

### Step 5: Write the service

In `module.service.ts`:
- Call invariants from `src/shared/domain/invariants/`
- Call the repository
- Emit events after transactions
- Throw `AppError` or `DomainError` on failures
- No direct Prisma usage
- No request/response objects

### Step 6: Write the controller

In `module.controller.ts`:
- Validate request with Zod (or use the shared `validate` helper)
- Call the service
- Map the service result through the response schema
- Return the response

### Step 7: Register routes

In `module.routes.ts`:
- Register all routes for this module as a Fastify plugin
- Apply `authMiddleware` and `rbacMiddleware` where needed
- Apply `rateLimiter` where needed

### Step 8: Write tests

In `module/__tests__/module.service.test.ts`:
- Unit tests for service functions (mock the repository)
- Unit tests for domain functions
- Integration tests for the HTTP layer (supertest)

---

## 20. PHASE BUILD PLAN

### Phase 1 — Foundation

**Goal:** The server starts. Requests are logged. Errors are handled. Nothing else.

Build:
- `package.json` with exact dependency list
- `tsconfig.json` with strict mode and `@/` path alias
- `vitest.config.ts`
- `.eslintrc.cjs`
- `.prettierrc`
- `.env.example` with all env vars from Section 7
- `prisma/schema.prisma` — full schema from Section 10
- `src/server.ts` — starts Fastify, connects to DB and Redis
- `src/app.ts` — registers plugins and error handler
- `src/config/env.ts` — Zod env validation, throws on startup if invalid
- `src/shared/infrastructure/prisma.ts` — PrismaClient singleton
- `src/shared/infrastructure/redis.ts` — ioredis singleton
- `src/shared/infrastructure/logger.ts` — Pino logger
- `src/shared/errors/AppError.ts`
- `src/shared/errors/DomainError.ts`
- `src/shared/errors/errorHandler.ts` — Fastify error handler plugin
- `src/shared/middleware/requestId.ts`
- `src/shared/middleware/auth.middleware.ts`
- `src/shared/middleware/rbac.middleware.ts`
- `src/shared/middleware/rateLimiter.ts`
- `src/shared/middleware/validate.ts` — Zod request body/params/query validation helper
- `src/shared/schemas/common.schema.ts`
- `src/shared/domain/value-objects/*`
- `src/shared/domain/invariants/*`
- `src/shared/domain/errors/*`
- `src/shared/events/event-bus.ts` (Node EventEmitter)
- `src/shared/events/event-types.ts`
- `src/shared/utils/transaction.ts`
- `src/shared/utils/hash.ts`
- `src/shared/utils/token.ts`

Do NOT build:
- Any module (auth, users, bookings, etc.)
- BullMQ
- Stripe
- Any routes

Also build (server lifecycle):
- `src/server.ts` must handle `SIGTERM` and `SIGINT` gracefully:
  1. Call `fastify.close()` to stop accepting new connections
  2. Disconnect PrismaClient: `prisma.$disconnect()`
  3. Disconnect Redis: `redis.quit()`
  4. Exit process with code 0
- Request/response logging via a Fastify `onResponse` hook:
  `{ requestId, method, url, statusCode, durationMs }`

Health check endpoints:
- `GET /api/v1/health` → `{ status: 'ok' }` (lightweight, for liveness probes)
- `GET /api/v1/health/ready` → pings PostgreSQL (`SELECT 1`) and Redis (`PING`);
  returns `200 { status: 'ready', db: 'ok', redis: 'ok' }` if both pass,
  or `503 { status: 'degraded', db: 'ok' | 'down', redis: 'ok' | 'down' }` if either fails

Checkpoint:
- `npm run dev` starts without error
- `npm run typecheck` passes
- `npm run lint` passes
- `prisma migrate dev` runs without error
- `GET /api/v1/health` returns `{ status: 'ok' }`
- `GET /api/v1/health/ready` returns `{ status: 'ready', db: 'ok', redis: 'ok' }`
- A deliberate thrown `AppError` is returned in the locked error envelope shape
- `logger.info` writes structured JSON to stdout
- `kill -TERM <pid>` triggers graceful shutdown with log message

---

### Phase 2 — Auth Module

**Goal:** A user can sign up (parent or school) and log in. JWT is returned.

Build:
- `src/modules/auth/auth.domain.ts`
- `src/modules/auth/auth.schema.ts`
- `src/modules/auth/auth.repository.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/auth/auth.controller.ts`
- `src/modules/auth/auth.routes.ts`
- `src/modules/auth/__tests__/auth.service.test.ts`

Endpoints to implement:
- `POST /auth/signup/parent`
- `POST /auth/signup/school`
- `POST /auth/login`
- `POST /auth/logout`

Domain rules:
- `parent` and `school` are distinct signup flows with different required fields
- `login` requires `role` in the body — a parent cannot log in with `role: 'school'`
- Email must be normalised to lowercase before storing or comparing
- Password stored only as bcrypt hash

Rate limiting:
- Apply `rateLimiter` to all auth endpoints (see Section 13.5)

Do NOT build:
- OTP flow
- Password reset
- Any other module

Checkpoint:
- `POST /auth/signup/parent` creates a user, returns `{ message }`
- `POST /auth/signup/school` creates a user, returns `{ message }`
- Duplicate email returns `409 EMAIL_ALREADY_EXISTS`
- `POST /auth/login` returns `{ accessToken, role, user }` (exact shape)
- Wrong password returns `401 INVALID_CREDENTIALS`
- `POST /auth/logout` returns `200 { message }` with valid token
- `POST /auth/login` with wrong role returns `401 INVALID_CREDENTIALS`
- Rate limit hit returns `429 RATE_LIMITED` with `Retry-After` header
- `npm run test` passes for auth module

---

### Phase 3 — Users & Children Modules

**Goal:** Authenticated user can read/update their profile and manage children.

Build:
- `src/modules/users/*`
- `src/modules/children/*`

Endpoints:
- `GET /users/me`
- `PATCH /users/me`
- `GET /users/me/children`
- `POST /users/me/children`
- `PATCH /users/me/children/:childId`
- `DELETE /users/me/children/:childId`

Domain rules for Children:
- Creating a child requires at least one emergency contact in the same request
- `yearGroup` is a required field — it is used in session eligibility
- `dateOfBirth` must be in the past
- Soft delete is preferred over hard delete for children (add `deletedAt?` to model)

Also build:
- `src/modules/services/*` — public read-only service catalog

Endpoints:
- `GET /services` — public, no auth

Checkpoint:
- `GET /users/me` returns exact shape from Section 8.2
- `PATCH /users/me` updates and returns updated profile
- `GET /users/me/children` returns array in Section 8.3 shape
- Creating a child without emergency contact returns `422 EMERGENCY_CONTACT_REQUIRED`
- `GET /services` returns array in Section 8.5 shape
- All endpoints require auth except `GET /services`
- Children endpoints reject `school` role users
- `npm run test` passes for users, children, services modules

---

### Phase 4 — Sessions & Bookings Modules

**Goal:** The core business engine. Sessions are listed. Bookings are created, retrieved, and cancelled.

Build:
- `src/modules/sessions/*`
- `src/modules/bookings/*`

**Sessions Endpoints:**
- `GET /sessions` — list sessions with filters: `?serviceId=`, `?date=`, `?location=`
- `GET /sessions/:sessionId` — session detail

**Bookings Endpoints:**
- `GET /bookings/mine`
- `GET /bookings/:bookingId`
- `DELETE /bookings/:bookingId` — cancel
- `POST /bookings` — create (Phase 4 — no payment yet, status starts as PENDING)

Domain rules for Bookings (all enforced via invariants):
1. `assertCapacityAvailable(session)` — session must not be full
2. `assertAgeEligible(child, session)` — use `child.dateOfBirth` and `child.yearGroup`
3. `assertNoOverlap(existingBookings, session)` — no confirmed booking for same child on same date/time

Transaction rules:
- Booking creation must use `prisma.$transaction`
- Increment `session.currentCapacity` inside the same transaction
- Use `select for update` (or Prisma's `$queryRaw`) to lock the session row during capacity check

Event emission:
- After successful booking creation: `eventBus.emit(EventType.BOOKING_CREATED, { bookingId, userId, sessionId })`
- After successful cancellation: `eventBus.emit(EventType.BOOKING_CANCELLED, { bookingId, userId })`
- Events are emitted AFTER the transaction commits

Do NOT build:
- Payment processing (status is PENDING until Phase 5)
- BullMQ
- Notifications

Checkpoint:
- `GET /bookings/mine` returns array in Section 8.4 shape
- `DELETE /bookings/:bookingId` returns `204`
- Double cancel returns `409 BOOKING_ALREADY_CANCELLED`
- Booking a full session returns `409 CAPACITY_EXCEEDED`
- Booking an ineligible child returns `422 AGE_INELIGIBLE`
- Booking overlapping slot returns `409 BOOKING_OVERLAP`
- `session.currentCapacity` increments correctly
- All within a database transaction
- `npm run test` passes with concurrency tests for capacity

---

### Phase 5 — Payments, Invoices, Refunds

**Goal:** Money flows in and out safely. Stripe is the source of truth.

Build:
- `src/modules/payments/*`
- `src/modules/invoices/*`
- `src/modules/refunds/*`

Rules:
- Payment creation is idempotent: use `stripePaymentIntentId` as the idempotency key
- Payment state machine: `PENDING → PAID → REFUNDED | FAILED`
- Stripe webhook must verify `stripe-signature` before processing — reject without it
- Invoice is created by the `payment.succeeded` event, not directly by the controller
- Refund amount must not exceed the original payment amount
- Refund policy: configurable in service layer, not hardcoded

Events emitted:
- `payment.succeeded` → triggers invoice creation
- `payment.failed` → triggers failure notification (Phase 6)
- `refund.issued` → triggers refund notification (Phase 6)

Checkpoint:
- Stripe checkout session created successfully
- Webhook received + verified, payment status updated
- Duplicate webhook ignored (idempotency)
- Invoice record created on `payment.succeeded`
- Refund processed and status updated
- Refund amount > payment amount rejected

---

### Phase 6 — Jobs & Notifications

**Goal:** Async processing. Swap event emitter for BullMQ. Send real emails.

Build:
- `src/modules/jobs/*` — BullMQ queues and workers
- `src/modules/notifications/*`
- Swap `src/shared/events/event-bus.ts` from EventEmitter to BullMQ publisher

Workers to build:
- `email.worker.ts` — consumes email jobs, sends via Nodemailer
- `invoice.worker.ts` — generates PDF invoice on `payment.succeeded`

Email triggers:
- Booking confirmed → email to parent
- Payment failed → email to parent
- Refund issued → email to parent

Checkpoint:
- Email sent after booking created (check with a test SMTP)
- BullMQ queue visible in Bull Board (add `@bull-board/fastify`)
- Failed jobs retry with exponential backoff
- Notification record created in DB for each triggered notification

---

### Phase 7 — Content Modules (Knowledge, Schools, League)

**Goal:** Public content endpoints and school-specific features.

Build:
- `src/modules/knowledge/*`
- `src/modules/schools/*`
- `src/modules/league/*`

Endpoints implemented must match Section 8.7 exactly.

Checkpoint:
- `GET /knowledge/case-studies` returns locked shape
- `GET /knowledge/free-activities` returns locked shape
- `GET /faqs` returns locked shape
- `GET /league/table` returns locked shape
- `GET /league/games` returns matches array

---

### Phase 8 — Admin System

**Goal:** Internal operators can manage all data.

Build:
- `src/modules/admin/admin-auth/` — separate admin login, admin JWT
- `src/modules/admin/dashboard/` — summary stats
- `src/modules/admin/bookings-mgmt/` — list, filter, update bookings
- `src/modules/admin/sessions-mgmt/` — create, update, delete sessions
- `src/modules/admin/payments-mgmt/` — view payments, trigger refunds
- `src/modules/admin/knowledge-mgmt/` — CRUD for CMS content
- `src/modules/admin/roles/` — manage admin users and roles

Rules:
- Admin routes are prefixed `/admin`
- All admin routes require a separate admin JWT with role `ADMIN`
- Admin users are in a separate table or have `role = ADMIN` (decide at Phase 8 start)
- Admin endpoints are not documented in Section 8 because the frontend admin UI is not yet built — design freely but document each endpoint as you build it

---

## 21. PRODUCTION READINESS CHECKLIST

Before calling any phase production-ready:

- `npm run typecheck` passes with zero errors
- `npm run lint` passes with zero warnings
- `npm run test` passes with coverage targets met (Section 16.4)
- No `any` in any committed file
- No `console.log` anywhere
- No hardcoded secrets or credentials
- All env vars validated at startup
- All Prisma queries inside repository files only
- All incoming request bodies validated with Zod
- All API responses match the locked contract in Section 8
- Error responses always use the locked envelope from Section 8.9
- Error codes always from the registry in Section 8.10
- Auth middleware applied to all non-public routes
- Rate limiter applied to all auth endpoints
- Stripe webhook verifies `stripe-signature` header
- Events emitted only after transaction commits
- No cross-module imports

---

## 22. GENERATION RULES

When instructed to build a module, phase, or file:

1. Only create files at paths defined in Section 6
2. Add the JSDoc file header to every `.ts` file
3. Use `@/` absolute imports
4. Use error codes only from Section 8.10
5. Return response shapes that match Section 8 exactly
6. Use `logger.*` never `console.*`
7. Never use Prisma outside `*.repository.ts`
8. Follow the per-module 8-step order from Section 19
9. Respect the phase lock table from Section 17
10. After each phase, produce the completion report from Section 2.4
11. Do not reference or import from a locked folder
12. Do not mention deferred work in code comments — only in the completion report

---

*End of DDivine Backend Master Prompt — v1.0*
*Paired with: DDivine_Training_Master_Prompt_v4.2.md (frontend)*
*Contract source: src/services/schemas/*.ts in the DDivine frontend*
*If this document and any AI-generated suggestion conflict, this document wins.*
