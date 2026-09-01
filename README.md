# SAHYOG

SAHYOG is a worker-first cooperative marketplace for household and community services. This implementation turns the supplied Google Stitch export into a runnable full-stack foundation with server-side authentication, RBAC, persisted data, job matching, fair wage calculation, settings, SOS incidents, disputes, payments architecture, notifications, analytics, and a role-aware assistant.

## Tech Stack

- Runtime: Node.js ESM with built-in HTTP server, crypto, and test runner
- Frontend: Stitch-faithful responsive HTML/CSS/vanilla JS using the exported design system
- Development data: persisted JSON database at `SAHYOG_DB_PATH`
- Production database architecture: PostgreSQL with Prisma schema and migration SQL in `prisma/`
- Auth: signed HTTP-only session cookies, PBKDF2 password hashing, server-side RBAC, CSRF token for authenticated writes
- Tests: `node:test`

## Local Development

```bash
npm run seed
npm run dev
```

Open `http://localhost:3000`.

Demo users are development seed data only:

- Worker: `worker@sahyog.local` / `Password123!`
- Customer: `customer@sahyog.local` / `Password123!`
- Cooperative admin: `coop@sahyog.local` / `Password123!`
- Federation admin: `federation@sahyog.local` / `Password123!`
- Super admin: `admin@sahyog.local` / `Password123!`

## Verification Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Architecture

The application uses a service-oriented API under `/api/*`. All protected endpoints resolve the session on the server and enforce role permissions before returning data. Tenant-like boundaries are enforced for cooperative and federation reads in `src/domain.js`.

Important APIs:

- `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- `/api/services`, `/api/workers`, `/api/jobs`, `/api/jobs/:id/transition`
- `/api/matching/jobs/:id`, `/api/wages/estimate`
- `/api/settings`, `/api/notifications`
- `/api/payments`, `/api/welfare`, `/api/training`
- `/api/sos`, `/api/disputes`, `/api/reviews`
- `/api/messages/conversations`, `/api/analytics/summary`
- `/api/ai/conversations`

## Database

Development data is stored in a JSON file so the app runs without installing external services. The production data model is represented in:

- `prisma/schema.prisma`
- `prisma/migrations/0001_init/migration.sql`

For production, provision PostgreSQL, set `DATABASE_URL`, install Prisma in the deployment pipeline, run migrations, and swap the repository adapter behind the service layer to Prisma.

## External Configuration

External services are deliberately configuration-gated:

- AI requires `OPENAI_API_KEY`
- Real payments require `PAYMENT_PROVIDER` and provider secrets
- Maps require `MAP_PROVIDER` and `MAP_PROVIDER_API_KEY`
- Private file storage requires `STORAGE_PROVIDER` configuration

When these are absent, the app exposes sandbox/configuration states and does not pretend external operations succeeded.

## Deployment

1. Set environment variables from `.env.example`.
2. Provision PostgreSQL and file storage.
3. Run database migrations from `prisma/migrations`.
4. Configure AI, payment, map, and storage providers.
5. Run `npm run build`.
6. Start with `npm start` behind HTTPS and a reverse proxy.

## Known Limitations

This pass provides a comprehensive production foundation and demo-ready workflows. Payment capture, emergency dispatch, maps, AI model calls, email delivery, and private object storage are provider abstractions until external credentials are configured.
