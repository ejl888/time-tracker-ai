# Data model

The contract between the web app, the backend (phase 2) and the mobile app. Change it in the same PR as any model
change. Business rules live in [requirements.md](requirements.md) and the [specs](../specs); this document describes
what is stored.

## Value types

| Type | Format | Example | Java |
|---|---|---|---|
| Id | UUID v4, generated on the device | `"0b6f5a1e-…"` | `UUID` |
| Instant | UTC, ISO 8601 with milliseconds | `"2026-11-18T08:00:00.000Z"` | `Instant` |
| Time zone | IANA name | `"Europe/Amsterdam"` | `ZoneId` |
| Date | ISO 8601 calendar date | `"2026-11-18"` | `LocalDate` |
| Minutes | Whole minutes, may be negative where noted | `2160` (= 36:00) | `int` |

Durations and hour amounts are always whole minutes, never fractions of hours, and are shown as `H:MM`.

## Common fields

Every record has:

| Field | Type | Notes |
|---|---|---|
| `id` | Id | Generated on the device, so records can be created offline without conflicts |
| `createdAt` | Instant | |
| `updatedAt` | Instant | Set on every change; used by sync to detect changes |
| `deleted` | boolean | Soft delete: deleted records are kept, so sync can pass deletions on |

## Records

### Label

| Field | Type | Notes |
|---|---|---|
| `name` | string | Trimmed; unique among labels that are not deleted, ignoring case |
| `billable` | boolean | Fixed once an entry that is not deleted uses the label |

### Entry

| Field | Type | Notes |
|---|---|---|
| `start` | Instant | |
| `end` | Instant | After `start`; at most the start of the next day in `timeZone` (shown as `24:00`) |
| `timeZone` | Time zone | The zone the entry was entered in; the device's zone when created |
| `description` | string | May be empty |
| `labelId` | Id | Required; may point to a deleted label, which is still shown |

An entry is always shown in its own `timeZone`, not the device's, so its times do not shift when travelling.
The **date** of an entry is the local date of `start` in its `timeZone`; it is derived, not stored.
The **duration** is `end − start`, so it is correct on the nights the clocks change.

Converting a local date and time to an instant follows Java's `ZonedDateTime` behaviour (`compatible` in the
`Temporal` API): a time that does not exist (clocks go forward) moves forward by the gap; a time that occurs twice
(clocks go back) uses the earlier one.

### Contract

| Field | Type | Notes |
|---|---|---|
| `startDate` | Date | |
| `endDate` | Date or `null` | Last day of the contract; `null` while it is ongoing |
| `billingCycle` | `"week"` or `"month"` | Weeks run Monday to Sunday |
| `billableLimit` | Minutes | Maximum billed per period |
| `startingBalance` | Minutes | Default 0; may be negative |

Contracts never overlap. An entry belongs to the contract whose dates include the entry's date.

### ExpectedHours

| Field | Type | Notes |
|---|---|---|
| `contractId` | Id | |
| `periodStart` | Date | Monday of the week or first day of the month, matching the contract's billing cycle |
| `expected` | Minutes | Expected billable hours for the period |

At most one record per contract and period that is not deleted. Without one, the billed hours of the period are 0.

## Derived, never stored

Billing periods, worked hours, billed hours, balance and hours left to work are calculated from the records above
(see [requirements.md](requirements.md)).

## Storage in phase 1

The browser's localStorage holds one key per record type, each with a JSON array of records:
`timetracker.labels`, `timetracker.entries`, `timetracker.contracts`, `timetracker.expectedHours`.
`timetracker.schemaVersion` holds the model version (now `1`), so later model changes can convert stored data.
Only the repository implementation reads or writes these keys.

## Not yet in the model

Added together with their stories: Client and Project (US-12), 4-week blocks (open question 1 in the requirements).
