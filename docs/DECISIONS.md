# Decisions

Defaults chosen where the spec was silent or later instructions overrode it. Update this file in the same PR as the change.

## Vehicle kind (2026-10-19)

Vehicles are `new | km0 | used` (`vehicle_kind`). The spec’s “auto usate” wording is superseded. Plate, stock, filters, and seed must cover all three kinds.

## Schema isolation (2026-10-19)

All dealer-management tables live in Postgres schema `etidealcrm` on project `moyfkdwsghidkcifesrg`. Schemas `public` and `etideal` are not dropped or altered. Storage buckets are in `storage` because the spec requires them.

## Extra enums (2026-10-19)

The spec lists some columns as parenthetical unions. They are Postgres enums:

- `vehicle_work_kind`: bodywork, mechanical, cleaning, documents
- `vehicle_work_status`: planned, in_progress, done
- `purchase_type`: cash, financing, trade_in
- `urgency`: low, medium, high
- `actor_kind`: user, system, ai
- `message_direction`: in, out
- `deal_item_kind`: revenue, cost
- `conclusion_type`: on_premises, distance, off_premises
- `import_kind`: vehicles, leads, customers, suppliers
- `import_job_status`: pending, preview, importing, done, failed
- `import_row_status`: pending, valid, skipped, duplicate, error
- `lost_reason`: the eight reasons from spec §5

## Device binding off (2026-10-22)

Paolo: authorized devices are not needed today. Binding stays off until Paolo turns it back on. The `device` table, enum, and Dispositivi page stay but are not a login or RLS gate. Do not drop `device`.

- Repo schema name remains `etidealcrm`. `is_device_authorized()` is `is_active_user()` only.
- Live project `moyfkdwsghidkcifesrg` currently stores dealer data in `dealercrm` (`drop_etidealcrm` 2026-10-20). There, `my_role()` / `my_dealership()` call `device_ok()`. `device_ok()` now returns true for an active profile. `dealercrm.is_device_authorized()` is the same alias.
- App: no “In attesa di approvazione”; no device insert on login; Dispositivi is hidden from nav and inert if opened.

Turn the check back on with a new migration when Paolo asks.

## Admin bootstrap for devices (2026-10-19)

Superseded 2026-10-22: device approval is off. Previously an `admin` could open Dispositivi while pending so the first install could be approved.

## Device RLS (2026-10-19)

Superseded 2026-10-22. Helpers still call `is_device_authorized()`, which now only requires an active profile.

## Cost columns (2026-10-19)

`purchase_cost` is on `vehicle`. `reconditioning_cost` is computed in `vehicle_stock`. Roles that must not see costs (`salesperson`, `reconditioning`, `yard`, `marketing`) cannot SELECT `vehicle`; they use `vehicle_public`. Yard position updates go through `set_vehicle_yard_position()`.

## Assign lead (2026-10-19)

`assign_lead()` uses `setting.assignment_weights`, `assignment_params`, `value_bands`, `profile.enabled_bands`, continuity, median close-rate for band C, top-N for band D, min share 8%, max hot share 25%. Reason is stored in `assignment_reason`.

## Lead timers (2026-10-19)

`change_lead_status` sets `status_deadline_at` as wall-clock minutes from `setting.lead_timers`. `process_lead_timers()` escalates assigned leads at 15/30/60 minutes, auto-assigns qualified, auto-loses after 30 days. Working-hours arithmetic is still wall-clock plus the `work_hours` JSON in settings (not yet skipping nights). `pg_cron` is scheduled when the extension exists.

## Shared Auth / demo users (2026-10-19)

Auth is shared with other products on this Supabase project. Demo accounts use `*@demo.test` only. Paolo’s admin is not created. Password default `Demo!2026crm` (override with `DEMO_PASSWORD` / `app.demo_password`). `auth.identities.email` is generated: inserts omit that column.

## Demo vehicles (2026-10-19)

Spec §9 table has no `new` plate. ZZ104AA (Mercedes GLC) is `km0`; the others are `used`.

## Plate format (2026-10-19)

Plates are normalized to uppercase without spaces and must match `^[A-Z]{2}[0-9]{3}[A-Z]{2}$`.

## Storage buckets (2026-10-19)

Private buckets: `vehicle-photos`, `documents`, `imports`, `call-audio`. Policies still call `is_device_authorized()`, which currently means an active user.

## Feature flags (2026-10-19)

`FEATURE_PORTALS_REAL` and `FEATURE_MESSAGING_REAL` default false. No paid connectors are enabled. Outbox worker marks pending rows sent and withdraws listings (mock).

## Contract PDF (2026-10-19)

Edge Function `generate-contract` writes HTML into `documents` if Deno PDF libs are unavailable. The browser can also print from the Pratica screen. Template file is `templates/contratto-vendita.md`.
