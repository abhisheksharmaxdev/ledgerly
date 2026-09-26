# Ledgerly

A personal expense manager for tracking daily spending against a monthly budget.

I built Ledgerly because I wanted one place to record what I spend each day, set a budget for every category at the start of the month, and see at a glance whether I'm on track. It started as a single-user tool and now supports multiple accounts, with an admin who approves new sign-ups. Each person's financial data is kept completely separate.

Amounts are in Indian Rupees (₹) by default and are stored as integer paise, so totals never drift because of floating-point rounding.

---

## Features

- **Daily expense tracking.** Adding an expense takes a few keystrokes: press `N`, type the amount, pick a category, press Enter. The date defaults to today, the last payment method is remembered, and there's a *Save & add another* option for logging several items in a row.
- **Monthly income and budget planning.** Set your income, a budget for each category, and a separate savings target. Each month keeps its own plan, and a new month can start from a copy of the previous one. If the plan adds up to more than your income, you get a warning but can still save it.
- **Category-wise spending.** Eleven default categories, plus your own. Budget progress shows on-track, near-limit (≥ 80 %), over-budget and unbudgeted states. Over-budget bars are hatched, so the state doesn't rely on colour alone.
- **Interactive analytics.** Spending by category, daily spending (daily or cumulative against budget pace), monthly trend, budget vs actual, payment methods, and day of week. Every chart has tooltips and can be switched to a data table.
- **Insights.** Short observations computed from your own data: highest category, categories near or over budget, change vs last month, savings rate, weekend vs weekday spending, largest expense. When there isn't enough data, the app says so instead of guessing.
- **Expense history.** Search, filter by month, category, payment method and date range, sort by date or amount, paginate. Deletes ask for confirmation and can be undone.
- **CSV import/export and JSON backup.** CSV import is validated first: if any row is invalid, nothing is imported and you see which rows to fix.
- **Multi-user accounts with admin approval.** People sign up with email and password, and the admin approves or rejects them. The admin gets an email for each new request.
- **User-specific data.** Plans, budgets, expenses, categories, analytics, history, exports and settings all belong to the signed-in account.
- **Responsive dashboard.** Sidebar on desktop, an icon rail on tablets, and bottom navigation with a floating Add button on phones.
- **3D interface.** Glass cards with pointer tilt and layered depth, plus a lazily loaded three.js background. The background is skipped on low-powered devices, and all motion respects reduced-motion preferences.
- **Themes and preferences.** Dark and light themes, reduced animations, a toggle for the 3D background, and a display currency setting.
- **Demo data** for trying the app out. It's flagged in the database and can be removed in one click.

## Tech stack

| Area | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, TanStack Query (server state), Zustand (UI state), Radix Dialog, Sonner toasts, Lucide icons |
| Visualization | Recharts, three.js (background), Motion (animations), CSS 3D transforms |
| Backend | Node.js, Express 5, Zod validation (schemas shared with the frontend), Helmet, express-rate-limit, Nodemailer |
| Database | SQLite via better-sqlite3, with versioned SQL migrations and no ORM |
| Authentication | Email + password, scrypt password hashing, HMAC-signed HttpOnly session cookie |
| Testing | Vitest, Supertest |
| Deployment | Single Node service (Docker), Render blueprint, Docker Compose |

## Key functionality

**Architecture.** It's one Node service. In development, Vite serves the UI and proxies `/api` to Express. In production, Express serves both the API and the built frontend. Frontend, backend and database therefore deploy together, with no cross-origin setup.

**Expense management.** Expenses are validated with Zod on both sides and stored with an integer amount, a category, an ISO date and an optional description and payment method. Categories are archived rather than deleted, so old expenses keep their meaning.

**Monthly budgeting.** A plan is one row per (user, year, month) plus one budget row per category. Savings/Investments categories have their own `kind`, so money moved to savings is never counted as spending:

| Figure | Formula |
|---|---|
| Money left | income − spent − saved |
| Unallocated | income − planned spending − savings target |
| Budget remaining | planned spending − spent |
| Budget utilisation | spent ÷ planned spending |
| Savings rate | saved ÷ income |

**Analytics.** All totals come from SQL aggregates over integer amounts. The browser sends its local date (`?today=`), so "current month", "spent today" and month-over-month comparisons are correct in the user's timezone.

**Authentication and admin approval.** See [Authentication](#authentication).

**User data isolation.** Every table that holds financial data has a `user_id`. Every repository function takes the signed-in user's id and filters by it, including updates and deletes. A request for another user's expense id returns 404, and budgets or expenses can't reference another user's categories. The API tests check this.

## Project structure

```text
.
├── client/                 Frontend (Vite root)
│   ├── index.html
│   ├── public/             favicon, web manifest, theme-init.js (applies theme before first paint)
│   └── src/
│       ├── api/            fetch client and React Query hooks
│       ├── components/     charts, dashboard, expenses, layout, settings, three (3D), ui
│       ├── hooks/          shared hooks (today, money formatting, tilt, reduced motion…)
│       ├── pages/          Dashboard, Expenses, Analytics, Plan, Settings, Login, Admin
│       ├── store/          Zustand UI store
│       ├── styles/         design tokens, component and page styles
│       └── utils/
├── server/src/             Backend
│   ├── app.ts              Express app: security headers, routing, static hosting
│   ├── index.ts            entry point
│   ├── config.ts           environment configuration
│   ├── auth/               password hashing, sessions, user/admin guards
│   ├── db/                 connection, migrations, maintenance CLI
│   ├── repositories/       SQL data access, always scoped by user
│   ├── routes/             HTTP handlers (validate → service → JSON)
│   ├── services/           summaries, analytics, insights, import/export, demo data, mailer
│   └── utils/
├── shared/                 code used by both sides: constants, Zod schemas, money/date helpers, API types
├── tests/                  API, migration and money/date tests
├── scripts/                server bundler, password hash generator
├── data/                   SQLite database (git-ignored)
├── Dockerfile, docker-compose.yml, render.yaml
└── .env.example
```

## Getting started

You'll need **Node.js 20.12 or newer** (I develop on Node 24). There's no separate database server to install.

```bash
# 1. Clone the repository
git clone <repository-url> ledgerly
cd ledgerly

# 2. Install dependencies
npm install

# 3. Create your environment file (the defaults work for local use)
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env

# 4. Create the admin account (asks for a password; the database is created automatically)
npm run create-admin -- you@example.com

# 5. Start the dev servers
npm run dev
```

Open <http://localhost:5173> and sign in with the admin account. The API runs on <http://localhost:4000>.

The repository's `.npmrc` sets `ignore-scripts=true`. better-sqlite3 ships prebuilt binaries, but npm would otherwise try to compile it from source, which needs a C++ toolchain.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (auto-restarts) and Vite dev server with hot reload |
| `npm run build` | Type-check, build the frontend to `dist/client`, bundle the server to `dist/server` |
| `npm start` | Run the production build |
| `npm test` | API, migration and money/date tests (in-memory SQLite) |
| `npm run typecheck` | Strict TypeScript checks for client and server |
| `npm run create-admin -- you@example.com` | Create the admin, or change its email/password |
| `npm run hash-password -- "password"` | Print an `ADMIN_PASSWORD_HASH` and a `SESSION_SECRET` for server deployments |
| `npm run db:seed [-- user@example.com]` | Add demo data to an account (default: the admin) |
| `npm run db:unseed [-- user@example.com]` | Remove demo data from that account |
| `npm run db:migrate` | Apply migrations (also runs on every start) |
| `npm run db:reset -- --yes` | Delete the database, including all accounts (stop the server first) |

## Environment variables

Everything is read by the server only; nothing here is sent to the browser. [.env.example](.env.example) has every variable with comments. Never commit `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` makes the server also serve `dist/client` and turns on secure cookies |
| `PORT` | `4000` | Port in production (hosting platforms set this) |
| `API_PORT` | `4000` | API port in development (Vite proxies `/api` to it) |
| `HOST` | `127.0.0.1` dev / `0.0.0.0` prod | Interface to bind |
| `DATABASE_PATH` | `data/ledgerly.db` | SQLite file; must be on persistent storage in production |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` | empty | Admin account for server deployments (set both). The hash comes from `npm run hash-password`, never the plain password |
| `SESSION_SECRET` | auto | 32+ random characters for signing sessions. If empty, one is generated once and stored in the database |
| `SESSION_TTL_DAYS` | `7` | Login lifetime |
| `COOKIE_SECURE` | `true` in production | HTTPS-only cookies; set `false` only for plain-HTTP self-hosting |
| `TRUST_PROXY` | `1` in production | Number of reverse proxies in front of the app (used for client IPs in rate limiting) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | empty, `587`, `false` | SMTP server for signup notifications |
| `MAIL_FROM` | empty | Sender address, required when `SMTP_HOST` is set |
| `ADMIN_NOTIFY_EMAIL` | admin's email | Where signup notifications go |
| `APP_URL` | empty | Public URL, used for the admin link in emails |

## Database setup

There's nothing to set up by hand. On start, the server opens (or creates) the SQLite file at `DATABASE_PATH`, turns on WAL mode and foreign keys, and applies any pending migrations from `server/src/db/migrations.ts`. Migrations are append-only and each one runs in a transaction.

Main tables:

- `users`: email (unique, case-insensitive), password hash, role (`admin` or `user`, with a partial unique index so there's only one admin), status (`pending`, `active` or `rejected`), session version.
- `categories`: per user, with a `kind` of `expense` or `savings`.
- `monthly_plans` and `plan_budgets`: one plan per user per month, and one budget per category.
- `expenses`: per user, with a `CHECK` that amounts are positive, and indexes on `(user_id, date)` and `(category_id, date)`.
- `settings`: per-user preferences.

Data created before accounts existed is kept and assigned to the admin the first time the admin is created.

## Authentication

- **Sign-up.** Anyone can request an account with an email and a password (at least 10 characters). The account starts as **pending**. The response is the same whether or not the email is already registered, so the form can't be used to find out who has an account.
- **Approval.** The admin sees each request (email, registration time, status) on the **Admin** page and can approve, reject or delete it. Rejecting or deleting an account bumps its session version, which ends that user's active sessions immediately.
- **Admin account.** There's exactly one. It's created from the server side, either with `npm run create-admin` or with the `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` variables, and never through sign-up.
- **Sessions.** Signing in sets an HMAC-signed, HttpOnly, SameSite=Lax cookie that expires after `SESSION_TTL_DAYS`. On every request the server re-checks that the account is still active and that the session version still matches.
- **Notifications.** New requests trigger an email to the admin through SMTP. Without SMTP configured, the message goes to the server log, and pending requests still appear as a badge in the app header.

Users who forget their password currently have to ask the admin, who can delete the account so they can sign up again. The admin resets their own password with `npm run create-admin`.

## Deployment

Ledgerly deploys as **one service with a persistent disk**. The same Node process serves the API and the frontend, and SQLite stores its data in a single file. Hosts with ephemeral filesystems, such as Vercel or Netlify functions, aren't suitable, because the database would be lost on every deploy.

| | |
|---|---|
| Build command | `npm ci && npm run build` (devDependencies are needed to build) |
| Start command | `npm start` (or `node dist/server/index.js`) |
| Health check | `GET /api/health` |
| Required env | `NODE_ENV=production`, `DATABASE_PATH` on a persistent disk, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` |
| Recommended env | `SESSION_SECRET`, SMTP settings, `APP_URL` |

Generate the admin hash and a session secret locally:

```bash
npm run hash-password -- "a long, unique admin password"
```

### Render (Docker blueprint)

1. Push the repository to GitHub.
2. In Render choose **New → Blueprint** and select the repository. [`render.yaml`](render.yaml) creates a Docker web service with a 1 GB disk mounted at `/data` (disks need a paid instance type).
3. Fill in `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` and, optionally, the SMTP variables and `APP_URL`. `SESSION_SECRET` is generated automatically.
4. Deploy, then sign in with the admin account.

### Any Docker host (Railway, Fly.io, a VPS)

The [`Dockerfile`](Dockerfile) is a two-stage build. The final image contains only the built output and the runtime dependencies, listens on `PORT` (default 8080) and stores data in `/data`.

```bash
docker build -t ledgerly .
docker run -d -p 8080:8080 -v ledgerly-data:/data \
  -e ADMIN_EMAIL="you@example.com" -e ADMIN_PASSWORD_HASH="..." -e SESSION_SECRET="..." \
  ledgerly
```

On Railway or Fly.io, attach a volume at `/data` and set the same variables. The image doesn't include the development tooling, so configure the admin through environment variables rather than `npm run create-admin`.

### Self-hosting with Docker Compose

```bash
docker compose up -d --build     # http://localhost:8080, data stored in ./data
```

The compose file assumes plain HTTP with no proxy in front (`COOKIE_SECURE=false`, `TRUST_PROXY` empty). Change both if you put Caddy or nginx with HTTPS in front of it.

### Backups

Use **Settings → Data → Full JSON backup** for your own account, or copy the database file while the app is stopped.

## Security considerations

- Passwords are hashed with scrypt (N=2¹⁵, r=8, p=1, random salt) and compared in constant time. Plain passwords are never stored or logged.
- Authentication and authorisation happen on the server. All data routes require an active session, admin routes also check the role, and every query is scoped to the signed-in user.
- Login and sign-up are rate-limited. Unknown emails still run a password check, so response times don't reveal which accounts exist.
- CSRF protection: session cookies are SameSite=Lax, and every state-changing request must send a custom `X-Requested-With` header with a JSON body. A cross-site form can't do that without a CORS preflight, and the API never approves one because it doesn't enable CORS at all.
- Helmet sets a strict Content Security Policy (scripts only from the app's own origin), HSTS and related headers.
- Errors returned to the client never include stack traces or SQL. Details are logged on the server only.
- CSV exports neutralise spreadsheet formula injection, and imports are size-limited and validated row by row.
- Secrets (admin hash, session secret, SMTP credentials) live in environment variables. `.env` and database files are git-ignored.

## Testing

```bash
npm test
```

The suite runs against an in-memory database. It covers expense CRUD and validation, summary calculations, import/export, sign-up → approval → login, session revocation, admin-only access, cross-user access attempts, and migrating a pre-accounts database.

## Future improvements

- Self-service password reset by email.
- Recurring expenses (rent, subscriptions) that pre-fill each month.
- Per-category trend charts and year-over-year comparisons.
- An installable offline mode (PWA) for adding expenses without a connection.
- Optional PostgreSQL support for running more than one app instance.

## License

This repository doesn't include a license yet.
