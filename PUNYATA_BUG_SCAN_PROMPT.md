# Task: Full Repo Bug Scan — Punyata (site-making-love)

## What to do

Scan the **entire repo** and find every bug you can, of every kind. This is a **find-and-report task only** — do NOT fix anything, do NOT modify any file. Just document what's wrong.

## Repo scope

Project: `site-making-love` (TanStack Start + React + Supabase/Postgres + Razorpay + Cloudinary, Indian religious-subscription service — recurring pujas/sevas).

Cover the whole codebase:
- `src/routes/**` — all pages and all `src/routes/api/**` server endpoints
- `src/lib/**` — all business logic and `.server.ts` files
- `src/components/**` and `src/hooks/**`
- `supabase/migrations/**` — all SQL migrations, read in filename (date) order since later files alter earlier tables

Skip: `node_modules`, `.git`, `.output`, `.wrangler`, `.tanstack`, generated files (`routeTree.gen.ts`), image/asset binaries, `components/ui/**` (third-party shadcn primitives, low bug yield).

## What counts as a bug — look for all of these

- **Logic errors** — wrong calculations, off-by-one, incorrect conditionals
- **Race conditions / idempotency gaps** — anything that reads-then-writes without a lock/transaction, especially around payments, commissions, batch generation, webhooks
- **Authorization gaps** — a route that should check role/ownership but doesn't (e.g. one telecaller editing another's data), or a DB policy (RLS) that's missing, too permissive, or bypassable
- **Money bugs** — wrong currency units (paise vs rupees), rounding that diverges from what's actually charged, double-payment/double-commission risk, missing amount caps
- **Date/timezone bugs** — IST vs browser-local mismatches, wrong month/period boundaries, invalid date acceptance
- **Data integrity bugs** — stale/duplicate rows, missing cascade/foreign-key behavior, upserts that don't clean up removed items
- **Webhook handling bugs** — wrong retry semantics, out-of-order event handling, signature verification issues
- **Validation gaps** — missing input validation, inconsistent validation logic duplicated across client/server that can diverge
- **React/frontend bugs** — stale state, missing effect cleanup, incorrect conditional rendering, broken responsive/Tailwind classes, client-only auth checks with no server enforcement
- **SQL/schema bugs** — missing constraints (CHECK, UNIQUE, NOT NULL), missing RLS policies, SECURITY DEFINER views/functions without proper guards, missing indexes, inconsistent cascade behavior
- **Error handling bugs** — swallowed errors, wrong HTTP status codes, shared/global state that leaks across concurrent requests
- Anything else genuinely wrong — don't limit yourself to this list

## Output format required

For every bug found, report:
1. **File path**
2. **Line number or function/table name**
3. **Short title**
4. **Severity**: critical / high / medium / low
5. **Description** of the bug
6. **Concrete failure scenario** — the exact inputs/timing/conditions that would trigger it (not vague speculation)

Group findings by area (e.g. Payments/Auth/Webhooks, Telecaller/Commissions/Admin, Frontend, Lib Helpers, SQL Migrations) and by severity within each area. End with a summary table of severity counts.

## Ground rule

Every finding must be something you can point to in code you actually read — no speculation about files you haven't opened. Be exhaustive; err toward more findings rather than fewer, but each one must be real and concrete.
