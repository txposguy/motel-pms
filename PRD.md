# Product Requirements Document
## Simple Motel PMS ("Working title: LodgeDesk")

**Owner:** Alx Patel — Genesis Merchant Solutions
**Version:** 1.0 (MVP spec)
**Status:** Draft for build
**Purpose of this document:** This is the anchor spec for the build. Claude Code should treat this file as the source of truth. When a decision is ambiguous, ask rather than improvise. When a decision is made, update this file.

---

## 1. Vision & Positioning

A dead-simple property management system for small-to-mid independent motels (10–60 rooms), typically owner-operated by a couple with one or two additional staff. The system replaces the paper registration card and the whiteboard room rack — nothing more, nothing less.

**Distribution model:** The software is provided free of charge to properties that process payments through Genesis Merchant Solutions. Revenue comes from payment processing residuals. Paid add-on modules follow later.

**Design north star:** The check-in screen must look like the paper registration card they already use. If a 65-year-old owner who has never used software can't check a guest in within 30 seconds of first seeing the screen, the design has failed.

### What this product is NOT (v1)
- Not a channel manager
- Not a booking engine / website reservations
- Not a revenue management system
- Not an accounting system
- Not a groups/blocks/corporate contracts system
- Not multi-property chain management (single property per tenant; multi-property is a later module)

---

## 2. Users & Roles

| Role | Description | Key needs |
|---|---|---|
| **Owner** | Usually one of the couple. On-site most days. | Everything. Reports, rates, taxes, user management. |
| **Front Desk Clerk** | May be family or a hired clerk, often night shift. | Check-in, check-out, take payment, room status. Nothing else. |
| **Housekeeper** | 1–3 people. Phone only. May have limited English literacy. | See assigned rooms, mark clean/dirty. Big buttons, minimal text. |

**Auth model:** Simple PIN-based login on a shared front-desk browser session. No email/password for clerks. Owner has a full account. Every action writes to an audit log with the user attached.

---

## 3. Core Concepts & Data Model

### 3.1 Entity overview

```
Property
  └── RoomType ── Room
  └── RatePlan
  └── TaxRule
  └── User

Guest ── Reservation ── Stay ── Folio ── FolioLine
                                      └── Payment

Room ── HousekeepingTask
```

### 3.2 Tables

**properties**
- `id`, `name`, `address`, `city`, `state`, `zip`, `phone`, `timezone`
- `check_in_time` (default 15:00), `check_out_time` (default 11:00)
- `cash_discount_enabled` (bool), `cash_discount_percent` (decimal, display-only — see §6)
- `merchant_id`, `terminal_provider` (enum: `valor` | `dejavoo`), `terminal_config` (jsonb)
- `logo_url`, `registration_card_footer_text` (their legal terms, editable)

**room_types**
- `id`, `property_id`, `name` (e.g. "Single Queen", "Double Double"), `default_occupancy`, `max_occupancy`

**rooms**
- `id`, `property_id`, `room_type_id`, `room_number`, `floor`
- `status` (enum: `vacant_clean` | `vacant_dirty` | `occupied` | `out_of_order`)
- `notes` (e.g. "TV remote missing")

**rate_plans**
- `id`, `property_id`, `room_type_id` (nullable = applies to all)
- `name` (e.g. "Daily Walk-In", "4-Hour", "Weekly")
- `unit` (enum: `hourly` | `nightly` | `weekly`)
- `duration_units` (e.g. 4 for a 4-hour block; 1 for nightly; 7 for weekly)
- `base_amount` (this is the **cash price** — see §6)
- `active` (bool)

**guests**
- `id`, `property_id`
- `first_name`, `middle_name`, `last_name`
- `address_line1`, `city`, `state`, `zip`
- `dob`, `phone`, `email`
- `id_type` (enum: `drivers_license` | `state_id` | `passport` | `other`)
- `id_number` (**encrypted at rest**), `id_state`, `id_expiration`
- `id_image_url` (nullable — encrypted bucket, subject to retention policy §10)
- `vehicle_make`, `vehicle_model`, `vehicle_color`, `vehicle_plate`, `vehicle_state`
- `dnr_flag` (do-not-rent), `dnr_reason`, `notes`
- `raw_aamva_payload` (nullable, encrypted — keep for parser debugging, purge on schedule)

**reservations** *(thin in v1 — most business is walk-in)*
- `id`, `property_id`, `guest_id`, `room_type_id`, `rate_plan_id`
- `expected_arrival`, `expected_departure`, `adults`, `children`
- `status` (enum: `booked` | `checked_in` | `no_show` | `cancelled`)
- `source` (enum: `walk_in` | `phone` | `ota` | `web`) — `ota`/`web` reserved for future modules

**stays** *(the actual occupancy record)*
- `id`, `property_id`, `reservation_id` (nullable), `guest_id`, `room_id`, `rate_plan_id`
- `checked_in_at`, `expected_check_out_at`, `checked_out_at` (nullable)
- `adults`, `children`, `additional_guests` (jsonb — names of other occupants)
- `status` (enum: `in_house` | `checked_out` | `walked`)
- `tax_exempt` (bool), `tax_exempt_reason` (enum: `permanent_resident_30day` | `government` | `nonprofit` | `other`), `tax_exempt_cert_number`
- `consecutive_nights_counter` (int — drives the 30-day rule, see §7)
- `checked_in_by_user_id`, `checked_out_by_user_id`

**folios**
- `id`, `stay_id`, `status` (enum: `open` | `closed`), `closed_at`

**folio_lines** — **APPEND ONLY. Never UPDATE, never DELETE.**
- `id`, `folio_id`, `created_at`, `created_by_user_id`
- `type` (enum: `room_charge` | `tax` | `incidental` | `adjustment` | `void`)
- `description`, `amount` (signed decimal — credits are negative)
- `tax_rule_id` (nullable, for tax lines)
- `voids_line_id` (nullable — a void line references the line it reverses)
- `business_date` (the night-audit date this belongs to, not the wall-clock date)

**payments**
- `id`, `folio_id`, `created_at`, `created_by_user_id`
- `method` (enum: `cash` | `card` | `check` | `other`)
- `amount_requested` (what the PMS asked for)
- `amount_settled` (what the terminal actually charged — **may differ under cash discount**, see §6)
- `cash_discount_fee` (decimal, nullable)
- `status` (enum: `pending` | `approved` | `declined` | `voided` | `refunded`)
- `provider` (enum: `valor` | `dejavoo` | `none`)
- `provider_transaction_id`, `provider_rrn`, `auth_code`
- `masked_pan`, `card_brand`, `entry_mode`
- `token` (nullable — for card-on-file / weekly renewals)
- `is_preauth` (bool), `preauth_captured_at` (nullable)
- `raw_response` (jsonb — always store it; you will need it for disputes)

**tax_rules**
- `id`, `property_id`, `name` (e.g. "TX State HOT", "Houston City HOT", "Harris County HOT")
- `rate_percent`, `applies_to` (enum: `room_charge` | `incidental`)
- `exempt_after_consecutive_nights` (int, nullable — set to 30 for HOT)
- `active`, `effective_from`, `effective_to`

**housekeeping_tasks**
- `id`, `property_id`, `room_id`, `business_date`
- `type` (enum: `departure_clean` | `stayover` | `deep_clean` | `inspection`)
- `assigned_to_user_id`, `status` (enum: `pending` | `in_progress` | `done` | `inspected`)
- `started_at`, `completed_at`, `notes`

**users**
- `id`, `property_id`, `name`, `role` (enum: `owner` | `clerk` | `housekeeper`)
- `pin_hash`, `active`

**audit_log**
- `id`, `property_id`, `user_id`, `created_at`, `entity_type`, `entity_id`, `action`, `before` (jsonb), `after` (jsonb)
- Every folio, payment, rate override, and room status change writes here. No exceptions.

**business_dates** *(night audit)*
- `id`, `property_id`, `business_date`, `status` (`open` | `closed`), `closed_at`, `closed_by_user_id`
- Snapshot totals: `rooms_sold`, `room_revenue`, `tax_collected`, `payments_cash`, `payments_card`, `occupancy_percent`, `adr`, `revpar`

---

## 4. Screens & Flows

### 4.1 Room Rack (home screen)

The default screen. A grid of room tiles, one per room, sorted by room number.

Each tile shows: room number, status color, guest last name (if occupied), departure time/date, rate type badge (H/D/W).

**Colors:**
- Green = vacant clean
- Yellow = vacant dirty
- Blue = occupied
- Grey = out of order
- Red border = departing today / overdue

Tap a vacant room → **Check-In**. Tap an occupied room → **Guest Folio**.

Top bar: today's date, occupancy count (e.g. "24/40 occupied"), arrivals due, departures due, a big **CHECK IN** button.

### 4.2 Check-In — "The Registration Card"

**This is the most important screen in the product.** It must visually mirror a paper motel registration card: a bordered card layout, boxed fields, printed-form typography, sections in the same order the paper card uses.

Layout, top to bottom:
1. **Property header** — name, address, phone (styled like a letterhead)
2. **Scan strip** — a persistent, always-focused input with the prompt: *"Scan the back of the driver's license"*. Barcode scanner input lands here and autofills the guest block.
3. **Guest block** — Name / Address / City / State / Zip / DOB / Phone
4. **ID block** — ID type, number, state, expiration (autofilled from scan)
5. **Vehicle block** — Make / Model / Color / Plate / State
6. **Stay block** — Room, Rate plan (Hourly / Daily / Weekly), Check-in datetime, Expected check-out datetime, # of adults, # of children, names of additional occupants
7. **Rate block** — shows **Cash Price** and **Card Price** side by side when cash discount is on (see §6), plus tax and total
8. **Terms footer** — the property's editable legal text
9. **Buttons:** `CHECK IN & TAKE PAYMENT` (primary) · `CHECK IN — BILL LATER` (secondary) · `PRINT REG CARD`

**Behavior notes:**
- The scan strip is focused by default whenever the screen loads. The clerk should be able to walk up, scan, and start typing without clicking anything.
- Every autofilled field is editable. IDs get misread; parsers get it wrong.
- **Duplicate detection:** if the DL number matches an existing guest, show a banner — "Returning guest: [Name], last stayed [date], [N] previous stays" — and offer to load their record. If `dnr_flag` is set, show a loud red warning and require owner PIN to override.
- **Expired ID** → show a warning, do not block.
- **Under 18** → show a warning, do not block (owner's call).
- Selecting an hourly rate plan auto-computes expected check-out (now + duration_units hours). Nightly → tomorrow at property check-out time. Weekly → +7 days.

### 4.3 Driver's License Scan (technical)

- Hardware: any USB 2D barcode scanner in **keyboard-wedge mode** (Zebra DS2208, Honeywell Xenon 1900, or similar). No drivers, no SDK.
- The scanner reads the **PDF417 barcode** on the back of the license.
- Data format: **AAMVA DL/ID Card Design Standard**. The payload is an ANSI-prefixed string with 3-letter element IDs.

**Fields to parse (AAMVA element IDs):**

| Element | Meaning | Maps to |
|---|---|---|
| `DCS` | Family name | `last_name` |
| `DAC` | First name | `first_name` |
| `DAD` | Middle name | `middle_name` |
| `DAG` | Street address | `address_line1` |
| `DAI` | City | `city` |
| `DAJ` | State | `state` |
| `DAK` | Postal code | `zip` |
| `DBB` | Date of birth | `dob` |
| `DAQ` | License number | `id_number` |
| `DBA` | Expiration date | `id_expiration` |
| `DBC` | Sex | (store, don't display) |
| `DCG` | Country | — |

**Implementation requirements:**
- Build the parser as an **isolated, unit-tested module** (`lib/aamva.ts`). Feed it recorded raw strings as fixtures.
- Date formats differ by jurisdiction (`MMDDCCYY` vs `CCYYMMDD`). Handle both; infer from the issuing state / AAMVA version header.
- Some older/edge licenses truncate or omit fields. Parser must **never throw** — return partial data and let the clerk fill the gaps.
- Store the `raw_aamva_payload` for debugging. Purge per retention policy.
- **Do not build for magstripe swipe.** It is not reliably present on modern licenses.

**Passports / foreign IDs:** manual entry only in v1. Add a "No barcode? Enter manually" link.

**ID image:** optional. If a document camera/webcam is present, capture a still and attach to the guest record. If not, the property keeps using the copier. Do not make this required to check in.

### 4.4 Guest Folio

Shows the stay, the running charges, the payments, and the balance.

- Charges list (folio_lines, newest first), with a running balance
- `ADD CHARGE` (incidental — pet fee, damage, extra key, phone)
- `ADD PAYMENT` → payment modal (see §5)
- `EXTEND STAY` → adds nights/hours, posts new room charges + tax
- `MOVE ROOM` → changes `room_id`, logs to audit, flags old room dirty
- `ADJUST` → posts a negative adjustment line (requires owner PIN over a configurable threshold)
- `CHECK OUT` → see 4.5
- `PRINT FOLIO`

### 4.5 Check-Out

1. Show final balance.
2. If balance > 0 → force payment or an explicit "check out with balance" that requires owner PIN and a reason.
3. If an open pre-auth exists → capture it for the actual amount, or void it.
4. Set `stays.checked_out_at`, `status = checked_out`, close the folio.
5. Set room `status = vacant_dirty`.
6. Auto-create a `departure_clean` housekeeping task.
7. Print / email receipt.

### 4.6 Housekeeping

**Owner/clerk view (desktop):** list of rooms, current status, assign housekeepers, mark inspected.

**Housekeeper view (phone, PWA):** a vertical list of assigned room numbers with three enormous buttons per room: **START**, **DONE**, **PROBLEM**. Language toggle (English / Spanish). Nothing else. No navigation menu.

Marking DONE sets the room to `vacant_dirty → vacant_clean` only after inspection if the property has inspection enabled; otherwise straight to `vacant_clean`.

### 4.7 Night Audit

A single button, run once per day (typically after 11pm or before the morning shift). It:

1. Posts room charges + tax for every `in_house` stay on a nightly or weekly plan. (Hourly plans post at check-in, not at audit.)
2. Increments `consecutive_nights_counter` for every in-house stay.
3. **Applies the 30-day tax exemption** where triggered (see §7).
4. Flags overstays (expected checkout in the past, still in house).
5. Snapshots the day's totals into `business_dates`.
6. Closes the business date. **A closed business date is immutable.** Corrections post as adjustments on the next open date.
7. Prints/exports the Night Audit Report.

Night audit must be **idempotent and re-runnable if it fails midway**. Wrap it in a transaction.

### 4.8 Reports (v1 list)

| Report | Contents |
|---|---|
| **Daily Flash** | Rooms sold, occupancy %, room revenue, ADR, RevPAR, tax collected, cash vs card |
| **Shift Report** | Per-user: cash in drawer, card totals, transaction count, over/short |
| **Arrivals / Departures** | Today's expected and actual |
| **In-House** | Every occupied room, guest, rate, balance, departure |
| **Tax Report** | Taxable revenue, exempt revenue, tax collected by rule, for a date range. Must be filing-ready. |
| **Guest Registry Export** | Date range, guest name, address, ID number, vehicle, room, dates. CSV + PDF. Access restricted to owner role and logged in audit_log. |
| **Housekeeping** | Rooms cleaned per housekeeper, average time |
| **Payment Reconciliation** | PMS payments vs. terminal batch — flags mismatches (critical under cash discount) |

---

## 5. Payment Architecture

### 5.1 The rule

**The PMS never sees, stores, or transmits cardholder data.** Semi-integrated only. The PMS sends an amount to the terminal; the terminal handles the card and returns a result. This keeps both Genesis and the merchant out of PCI scope.

### 5.2 The adapter contract

Define one internal interface. Implement it twice (Valor, Dejavoo). All PMS code calls the interface, never the provider directly.

```ts
interface PaymentTerminal {
  sale(req: SaleRequest): Promise<TxnResult>;
  preAuth(req: PreAuthRequest): Promise<TxnResult>;
  capture(req: CaptureRequest): Promise<TxnResult>;   // ticket/completion
  void(req: VoidRequest): Promise<TxnResult>;
  refund(req: RefundRequest): Promise<TxnResult>;
  status(txnId: string): Promise<TxnResult>;          // for timeout recovery
  settle(): Promise<BatchResult>;
  ping(): Promise<boolean>;
}

interface SaleRequest {
  amountCents: number;          // the CARD price if host-calculated CD, else base
  invoiceNumber: string;        // = folio id, max 24 chars — used for reconciliation
  allowPartial?: boolean;
  tokenize?: boolean;           // request a token for card-on-file
  token?: string;               // charge an existing token (weekly renewals)
}

interface TxnResult {
  status: 'approved' | 'declined' | 'voided' | 'error' | 'timeout';
  amountSettled: number;        // may exceed amountRequested under terminal-side CD
  feeApplied?: number;
  authCode?: string;
  rrn?: string;
  transactionId: string;
  maskedPan?: string;
  cardBrand?: string;
  entryMode?: string;
  token?: string;
  raw: unknown;                 // always persist
}
```

### 5.3 Providers

**Valor PayTech — Valor Connect**
- Supports Sale, Auth, Return, Void, Tip Adjust, Ticket (completion), Settlement, Reprint
- Connection types: Cloud, TCP, WebSocket, USB
- Amounts are sent in cent notation (one dollar = `100`)
- Invoice number: max 24 characters usable on the receipt
- **A demo terminal is required to test the integration.** Request one before starting this phase.
- Spec: `ValorPay POS Integration Specification`

**Dejavoo — SPIn (Secure Payment Interface)**
- REST API, JSON and XML supported
- Cloud-based; connects to a single URL rather than per-device IP addresses
- Card data never touches the host system
- UAT/sandbox mode is toggled on the terminal via DVStore
- Docs: `docs.ipospays.com/spin-specification`

Build **Valor first** (primary book of business), Dejavoo second.

### 5.4 The timeout problem — handle this explicitly

A terminal transaction can approve at the processor and then fail to return a response to the PMS (network blip, clerk unplugs it, browser closes). If you naively retry, you double-charge a guest.

**Required behavior:**
1. Write a `payments` row with `status = pending` **before** calling the terminal.
2. On timeout/no response: do **not** auto-retry. Set status to `pending`, show the clerk: *"Payment status unknown. Check the terminal screen."*
3. Provide a **`RECONCILE` button** that calls `status(txnId)` against the provider to resolve it.
4. Night audit flags any `pending` payment older than 30 minutes.

### 5.5 Card-on-file / weekly renewals

Request a token on the first sale for any weekly stay. Store the token (not the card). On renewal, charge the token. Always require the guest's authorization signature captured on the reg card at check-in — the terms footer must include card-on-file consent language.

---

## 6. Cash Discount

### 6.1 How it actually works

The cash discount fee is configured **at the terminal / MID level in the Valor or Dejavoo portal**. Do not re-implement the fee calculation as the source of truth in the PMS. The terminal applies it.

### 6.2 What the PMS must do

1. **Store the cash price as the base price.** `rate_plans.base_amount` is the *cash* price. This is the posted price.
2. **Display both prices everywhere the guest can see them:** the check-in screen rate block, the printed registration card, the folio, and the receipt.
   ```
   Room 114 — Nightly          Cash:  $65.00     Card:  $67.44
   Hotel Occupancy Tax                  $10.53           $10.92
   ─────────────────────────────────────────────────────────────
   TOTAL                       Cash:  $75.53     Card:  $78.36
   ```
3. **Post the folio in cash-price terms.** The card fee is posted as a **separate folio line** (`type: incidental`, description: "Non-Cash Adjustment") when a card payment is taken. This keeps the room revenue and tax figures clean for the owner's tax filing — critical, because the fee is generally not room revenue.
4. **Reconciliation must tolerate `amount_requested ≠ amount_settled`.** This is the single most common source of "the numbers don't tie out" support calls. Test it explicitly.

### 6.3 Two implementation modes — support both

- **Terminal-calculated (default):** PMS sends the cash amount; terminal adds the fee; `amountSettled > amountRequested`. PMS reads back the fee and posts the adjustment line.
- **Host-calculated:** PMS computes the card price and sends both cash and card prices to the terminal. Both Valor and SPIn support passing a host-calculated card price. Use this when the property wants exact control of rounding.

Property-level setting: `cash_discount_mode` (`terminal` | `host` | `off`).

---

## 7. Tax Engine (Texas)

Tax bugs will cost the owner money and cost you the account. Treat this as first-class.

### 7.1 Requirements

- Multiple stacked tax rules per property (state + city + county), each with its own rate.
- Rates are **property-configurable**. Do not hardcode. (Texas state HOT is 6%; local rates vary — Houston properties typically stack city and county on top.)
- Tax is calculated on room charge only by default; `applies_to` allows per-rule override.

### 7.2 The 30-day permanent resident exemption — **do not skip this**

Under Texas law, a guest who stays **30 or more consecutive days** becomes exempt from hotel occupancy tax. This is extremely common at weekly-rate motels.

**Required behavior:**
- `stays.consecutive_nights_counter` increments each night audit.
- The moment it hits the configured threshold (`tax_rules.exempt_after_consecutive_nights`, default 30), the stay flips to `tax_exempt = true` with reason `permanent_resident_30day` and stops accruing tax lines going forward.
- **Retroactive handling:** Texas generally treats the exemption as applying from day one once the 30-day threshold is met. The system must post a **credit adjustment** reversing the tax collected for the prior nights, and flag it on the tax report.
- A "check-out and re-check-in" breaks the consecutive count. Room moves within a continuous stay do **not**. Model this correctly.
- The owner must be able to see, on the tax report, exactly which stays were exempted and why.

> ⚠️ **Flag for the owner:** the exact retroactive-credit mechanics and any local variation should be confirmed with the property's CPA or the Texas Comptroller before go-live. Build it configurable (`retroactive_credit: true | false`) rather than assuming.

### 7.3 Other exemptions
- Government / nonprofit: clerk checks a box, enters the exemption certificate number, attaches to the stay. Certificate number is required for the report.

---

## 8. Technical Stack & Hosting

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Server actions for mutations |
| DB | **PostgreSQL** | Neon or Supabase |
| ORM | **Prisma** | Migrations checked into git |
| Styling | **Tailwind** | Registration card needs custom print CSS |
| Auth | NextAuth for owners; PIN table for clerks | |
| Hosting | **Railway** or **Fly.io** | Vercel also fine; Railway keeps DB + app together |
| File storage | S3-compatible bucket, **encrypted** | ID images only |
| Printing | Browser print + dedicated `@media print` stylesheets | Do not build a native print driver in v1 |
| Errors | Sentry | You will need it |

**Multi-tenancy:** single codebase, single database, `property_id` on every table, enforced at the query layer. Every Prisma query goes through a scoped client. Write a lint rule or a repository layer that makes it impossible to forget.

### 8.1 The offline problem

Motel internet fails. If the front desk can't check a guest in, the property goes back to paper permanently and you lose the account.

**v1 approach:** Accept the dependency. Mitigate by:
- Ship a cheap LTE failover router with every install.
- Provide a printable blank registration card PDF as a documented paper fallback.
- Build a **"Catch-Up Entry"** screen: enter a check-in with a backdated timestamp, so paper fallbacks can be entered into the system afterward without corrupting the audit trail.

**v2 approach:** PWA with IndexedDB cache + queued writes. Read-only room rack works offline; check-ins queue and sync. Do not attempt this in v1.

---

## 9. Hardware — Per-Property Bill of Materials

| Item | Est. cost | Notes |
|---|---|---|
| Front desk PC or mini-PC (or existing) | $0–300 | Chrome only |
| **USB 2D barcode scanner** | $60–150 | Zebra DS2208 / Honeywell Xenon. Keyboard-wedge mode. |
| Valor or Dejavoo terminal | Provided | Must be Ethernet/WiFi capable for semi-integration |
| Receipt printer (optional) | $150–250 | Or just print to their existing laser |
| LTE failover router | $80–150 | Strongly recommended |
| Housekeeper phones | $0 | Use their own; PWA |

---

## 10. Security, Privacy & Legal

- **`id_number` and `raw_aamva_payload` are encrypted at rest** (column-level encryption, not just disk encryption).
- **ID images** live in an encrypted, non-public bucket. Signed URLs only, short TTL.
- **Retention policy:** configurable per property. Default: purge ID images and raw AAMVA payloads after **90 days** unless the stay is flagged for legal hold. Guest name/dates retained for the registry.
- **Registry export is a privileged action.** Owner role only. Every export writes to `audit_log` with the requesting user and date range.
- **Card data:** never stored, never logged. Tokens only. Assert this in code review.
- PIN hashes: bcrypt/argon2. No plaintext.
- Rate limiting on login. Session timeout on the front-desk browser (configurable — clerks will hate a short one).

**Business/legal to-dos (not code, but blocking for launch):**
- Written software license agreement: free use contingent on active processing; terminates on processor change; data ownership and export rights on termination.
- Privacy policy + data processing terms — you are handling regulated PII (driver's license data) for third parties.
- **Have a lawyer review both.** This is not optional given hourly-rate properties and law-enforcement records requests.
- Decide and document your position on law-enforcement data requests before you get one.

---

## 11. Build Plan — Vertical Slices

Each phase must be independently demoable. Do not move on until the previous slice works end to end.

| # | Slice | Definition of done |
|---|---|---|
| 1 | **Foundation** | Property, room types, rooms, users/PINs, audit log. Room rack renders with seeded data. |
| 2 | **Check-in (manual)** | Registration card screen. Manual entry only. Creates guest + stay + folio. Room turns blue. Prints. |
| 3 | **DL scanner** | `lib/aamva.ts` with unit tests. Scan strip autofills. Duplicate + DNR detection. |
| 4 | **Rates, folio & tax** | Rate plans (hourly/nightly/weekly). Folio lines. Tax rules stacked. Incidentals. Extend stay. |
| 5 | **Payment adapter + Valor** | Interface + Valor Connect implementation. Sale, preauth, capture, void, refund, status. Sandbox terminal. Timeout handling. |
| 6 | **Check-out** | Balance settlement, preauth capture, receipt, room → dirty, HK task created. |
| 7 | **Cash discount** | Dual-price display, non-cash adjustment line, reconciliation tolerance. Both modes. |
| 8 | **Housekeeping** | Desktop assignment view + phone PWA with three buttons + Spanish toggle. |
| 9 | **Night audit** | Idempotent, transactional. Posts charges, increments counters, **fires the 30-day exemption**, closes the date. |
| 10 | **Reports** | The eight reports in §4.8. Tax report must be filing-ready. |
| 11 | **Dejavoo adapter** | Second implementation of the same interface. |
| 12 | **Hardening** | Sentry, rate limits, encryption verification, retention job, catch-up entry screen. |

---

## 12. Testing Strategy

### 12.1 Automated
- **AAMVA parser:** fixture-driven unit tests. Collect real (anonymized) barcode strings from at least 10 states — Texas, Louisiana, California, Florida, New York, plus a few edge cases. Test malformed input, truncated input, missing fields. **The parser must never throw.**
- **Tax engine:** unit tests for every scenario. Especially: night 29 → night 30 → night 31, including the retroactive credit. And a stay that breaks and restarts.
- **Folio math:** property-based tests. Sum of lines always equals balance. Voids always net to zero.
- **Night audit:** run it twice in a row — the second run must be a no-op.

### 12.2 "Day in the Life" integration script
An automated end-to-end scenario Claude Code can run on demand:
> 10 walk-in check-ins across 3 rate types → 3 hourly rooms turn over twice → 1 guest extends → 1 room move → 2 incidental charges → 1 void → 1 weekly guest hits night 30 → 4 check-outs with card, 2 with cash → night audit → assert the Daily Flash and Tax Report totals to the penny.

### 12.3 Payment sandbox testing
Get a **Valor demo terminal** (required for API testing) and a **Dejavoo terminal in UAT mode** (toggled via DVStore). Run the full matrix:

approve · decline · partial approval · void · refund · pre-auth + capture · pre-auth + void · timeout (unplug the terminal mid-transaction) · clerk cancels on the terminal · cash discount on · cash discount off · tokenized recharge · batch settlement

### 12.4 Pilot
Pick your **friendliest existing motel client**. Run the PMS **in parallel with their paper registration cards for two weeks.** Do not remove the paper. Do not remove the paper until *they* ask you to. Sit at the front desk for the first two nights and watch the night clerk use it. Everything you got wrong will surface in those two nights.

---

## 13. Future Modules (paid — not in v1)

| Module | Notes |
|---|---|
| Website Booking Engine | Direct reservations, card-on-file deposit |
| OTA / Channel Manager | Booking.com, Expedia, Airbnb. This is the hardest and most valuable one. |
| Multi-Property Dashboard | For owners with 2+ motels — you have several of these prospects already |
| Guest Messaging | SMS confirmations, checkout reminders |
| Accounting Export | QuickBooks |
| Advanced Reporting / Revenue | Pace, comp set, dynamic rates |
| Digital Registration / Kiosk | Guest signs on a tablet, no paper at all |

---

## 14. Known Risks

1. **Support burden.** Free software with a 24-hour front desk means 2am phone calls. Plan for this: a support tier, documented runbooks, or a partner who takes tier-1 calls. This is the risk most likely to sink the project — not the code.
2. **The offline gap.** One bad internet outage during a busy night and the property reverts to paper for good. Ship the LTE failover.
3. **Reconciliation under cash discount.** If the owner's numbers don't tie out, they lose trust in the whole system. Test this harder than anything else.
4. **Tax mistakes.** A wrong HOT filing is a real financial harm to the owner and a real liability for you. Get the 30-day rule right and get it reviewed by a CPA.
5. **The churn trap.** The PMS becomes sticky, then a competitor undercuts your processing rate and they want to keep the PMS. The license agreement must handle this cleanly *before* the first install.

---

## 15. Open Questions

- [ ] Confirm Texas HOT retroactive-credit mechanics with a CPA.
- [ ] Does the pilot property want inspection as a required housekeeping step, or straight dirty→clean?
- [ ] Receipt printer: do we support one, or print to their existing laser in v1?
- [ ] Do any target properties need Spanish for the **front desk**, not just housekeeping?
- [ ] Confirm whether Valor Connect cloud mode or TCP/WebSocket is more reliable on typical motel networks. Test both at the pilot.
- [ ] What's the ID-image retention default the lawyer is comfortable with?
