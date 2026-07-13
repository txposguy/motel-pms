@AGENTS.md

# LodgeDesk — Standing Rules

This is a motel property management system. **[PRD.md](PRD.md) is the source of truth.** When a decision is ambiguous, ask the owner rather than improvise. When a decision gets made, update PRD.md to reflect it.

The owner (Alx) is not a developer. Explain changes in plain English. Give exact steps whenever something needs to happen outside of Claude Code (a dashboard click, an env var, a signature).

## Design north star
The check-in screen must look and behave like the paper registration card it replaces. If a first-time user can't check a guest in within 30 seconds of seeing the screen, it's wrong. Favor boxed/bordered "form" layouts over modern card/dashboard aesthetics on that screen specifically.

## Non-negotiable technical rules

1. **PCI scope.** The PMS never sees, stores, or transmits cardholder data. All payments go through the `PaymentTerminal` adapter interface (§5.2 of the PRD) — never call a provider SDK directly from app code. Card data is never logged, never stored — tokens only.

2. **Multi-tenancy.** Every table has `property_id`. Every query must be scoped to a property — never write a raw Prisma query against a tenant table without a `property_id` filter. Route all DB access through a scoped repository layer, not ad-hoc `prisma.<model>.findMany()` calls scattered through route handlers/components.

3. **Folio lines are append-only.** Never `UPDATE` or `DELETE` a `folio_lines` row. Corrections are new lines (`type: adjustment` or `type: void`) that reference what they reverse via `voids_line_id`.

4. **Audit log.** Every folio change, payment, rate override, and room status change writes to `audit_log` with the acting user attached. No exceptions, no "just this once."

5. **Encryption at rest.** `guests.id_number` and `guests.raw_aamva_payload` are column-level encrypted, not just relying on disk encryption. ID images live in a private bucket behind short-TTL signed URLs, never public paths.

6. **Tax engine.** Rates are property-configurable, never hardcoded. The 30-day Texas permanent-resident exemption (§7.2) is a first-class, well-tested feature — get it right, including the retroactive credit. A checkout + re-checkin breaks the consecutive-night count; a room move within a continuous stay does not.

7. **Cash discount.** `rate_plans.base_amount` is always the cash price. The card fee is posted as its own `incidental` folio line ("Non-Cash Adjustment"), never blended into room revenue. Reconciliation logic must tolerate `amount_requested ≠ amount_settled`.

8. **Payment timeouts.** Never auto-retry a timed-out terminal transaction (risk of double-charging the guest). Write the `payments` row as `pending` before calling the terminal; surface a `RECONCILE` action that calls `status()` to resolve it.

9. **AAMVA parser.** Lives in an isolated module (`lib/aamva.ts`), fixture/unit-tested, and must never throw — always return partial data on malformed input and let the clerk fill gaps.

## Process rules

- Follow the vertical-slice build plan in PRD.md §11. Don't start the next slice until the current one is demoable end-to-end.
- Don't build ahead of the current slice. No speculative features, no premature abstractions.
- Prisma migrations are checked into git — never edit the database schema by hand outside of a migration.
- `.env` (and any file holding real credentials or a database URL) is gitignored and must never be committed.
