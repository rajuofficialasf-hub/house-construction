# P8 walkthrough checklist (R13)

> **Historical record.** This describes the work as it was done, against the Supabase version that has since been removed. The current API is `docs/api/PROJECTS_API_CONTRACT.md`; what was removed, and where to restore it from, is in [README.md](README.md).

The Chrome walkthrough of the local stack on the REST backend, drawn from M-steps 1–15 in `docs/MULTI_PROJECT_PLAN.md` §৮. Plan: `docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md`, P8 (U41–U45). P9 starts only once every row here is checked.

## How to read this file

- **Cells:** `✅` means passed, `❌ D<n>` means a defect (see Defects), and `—` means the row doesn't apply to that role. Visitor rows use the Main column only.
- **Every row passes on three counts:** the expected result is seen, there are no console errors, and there are no unexpected failed requests (read on `localhost:3001`, summarised as method, path and status, never pasted).
- **Roles:**
  - **Main** is `p8-main@example.test` (`main_admin`).
  - **Plain** is `p8-admin@example.test` (`admin`).
  - **Visitor** is a logged-out tab.

**Expected failed requests** (not defects):
- `GET /api/v1/auth/me` 401 while logged out.
- The 404 a visitor gets for a draft's URL, stats, records or cover.
- The seed's `https://example.com/photos/…` image URLs (the 20 seed records carry fake photo sources).
- The 403s and 401s from the probe rows (A9, V2.5).

**Known difference** (not a defect): the merged `main` UI keeps three things from a plain admin that the server allows any admin to do (P6 decisions). The Plain cells check that each control is hidden or locked:
- serial change: "লক করা — সিরিয়াল বদলাতে পারেন শুধু মূল এডমিন" shows instead of the button
- replacing an existing photo: the record form's slot is locked, and bulk photos marks the match locked
- the import "(মুছুন)" token

## Run

| | |
|---|---|
| Date | 2026-10-07 |
| Commit walked | `7065432`, re-checked after the D1 fix `541f53c` |
| Stack | `docker compose up -d db`; server `db:migrate`, `db:seed`, `dev` (127.0.0.1:3001); `npm run dev -- --host 127.0.0.1` (5173, REST) |
| GIFs | In Chrome's Downloads, not committed: `p8-v1-public-visitor.gif`, `p8-a-main-admin-settings-records.gif`, `p8-a-main-admin-import-photos-pass2.gif`, `p8-plain-admin-ae1.gif` |
| Notes | **S3:** `.env.local` was missing. The README's `cp .env.example .env.local` step was skipped at first, so home showed "ব্যাকএন্ড সংযোগ কনফিগার করা হয়নি". This was a setup gap, not a defect. **Width:** the Chrome window wouldn't go past a 768 px viewport, so the 360/1024 px checks load the page in a fixed-width iframe and compare `scrollWidth` with `clientWidth`. **Dev doubles:** React `StrictMode` (`src/main.tsx`) runs effects twice in dev, so calls are counted as distinct requests. **Admins:** the walk admins share a throwaway password, created by piping it to the CLI (the user chose to have the session type it). It is in no file. **Tool quirk:** the Chrome extension's network reader reports some `204 No Content` responses as `503` (`PUT /projects/order`, `PUT /projects/:key/fields/order`). The app's own `fetch` saw 204 and the server logged 204, so every 503 is cross-checked against the API log. **Sessions:** both Chrome tabs share cookies, so visitor rows run logged out, and in-page visitor probes use `credentials: 'omit'`. |

## S. Setup

| # | Where | Steps | Expected | Main | Plain |
|---|---|---|---|---|---|
| S1 | terminal | `docker compose down -v`, `up -d db`, `db:migrate`, `db:seed` | Migrations are clean, and the seed loads 20 records plus `demo` (6 records, a draft) | ✅ | — |
| S2 | terminal | The user creates the two admins with the CLI | `admin list` shows `p8-main` as `main_admin` and `p8-admin` as `admin` | ✅ | — |
| S3 | terminal | Start both servers; `curl localhost:3001/api/v1/projects` | Lists `housing`, `semi_pucca` and `tin`, not `demo` | ✅ | — |

## V1. Public, visitor pass 1 (before any admin row)

| # | Where | Steps | Expected | M-step | Main |
|---|---|---|---|---|---|
| V1.1 | `/` | Open the home page | The hero shows total projects, beneficiaries and districts. Cards show the published projects only (`housing` with its sub-project chips), and no `demo`. At most 2 API calls | 15 | ✅ |
| V1.2 | header | Open the "প্রকল্পসমূহ" menu; resize to 360 and 768 px | The menu lists published projects from the registry, and the header doesn't overflow | 6 | ✅ |
| V1.3 | `/housing` and `/housing/` | Open both | The group landing shows the সেমিপাকা and টিন cards, as in `main` | 6, 15 | ✅ |
| V1.4 | `/housing/semi-pucca` | Open it | Stat cards, distribution chart and map are shown. The table at 1024 px, the cards at 360 px, and no horizontal scroll at 1024 px in both languages | 13 | ✅ |
| V1.5 | `/housing/semi-pucca` | Filter by year, division → district → upazila → union, and name | Each filter narrows the rows and sets its URL parameter (`year`, `division`, `district`, `upazila`, `union`, `q`). Reloading the URL keeps the filters | 13 | ✅ (union checked after serial 13 got a union) |
| V1.6 | `/housing/semi-pucca/1?year=2024` | Open the deep link | The detail modal opens with no 404 flash. Its photo section is laid out before-after. The seed's fake photo URLs fail quietly | 6, 14 | ✅ |
| V1.7 | detail modal | Press ←/→ and close | It pages to the neighbouring records, then returns to the list with the filters kept | 14 | ✅ |
| V1.8 | language switch | Switch to English on home, the landing, the list and the detail | Labels, numbers and money are in English. Names stay as written. Switching back restores Bangla | 5খ, 14 | ✅ |
| V1.9 | `/housing/admin/semi-pucca` | Open the old admin link | Redirects to `/admin/records/semi_pucca`, then to the login page | 6 | ✅ |
| V1.10 | `/no-such-project` | Open it | The 404 page (after the registry loads, with no flash on valid URLs) | 6 | ✅ |
| V1.11 | `/demo` and the API | Open `/demo`; fetch `/api/v1/projects/demo`, `/stats` and `/cover` in the page | The page shows not-found, and each API call is 404 | 7 | ✅ |

## A. Admin (each row walked as Main, then as Plain)

| # | Where | Steps | Expected | M-step | Main | Plain |
|---|---|---|---|---|---|---|
| A1.1 | `/admin/login` | A wrong password, then the right one | The wrong one shows the server's one login-failure message. The right one lands on `/admin`. In-page `/auth/me` gives the right `role` | 6 | ✅ | ✅ |
| A1.2 | admin layout | Check the sidebar at desktop width and the drawer at 360 px | Desktop has a left sidebar. Phone has a drawer with 44 px targets. "ইউজার" is shown only to Main | 7 | ✅ | ✅ |
| A1.3 | logout | Log out | Lands on `/`. `/admin` then asks for login | 6 | ✅ | ✅ |
| A2.1 | `/admin` | Open the dashboard | Per-project cards (drafts included) show records, money, photos missing and publish state, matching `GET /projects/overview?drafts=1`, plus the last 10 log entries | 7 | ✅ | ✅ |
| A3.1 | `/admin/projects` | View the list; move a project ↑↓ | Grouped list, and the order is saved after a reload | 7 | ✅ | ✅ |
| A3.2 | `/admin/projects` | Turn off "প্রকাশ" on `housing`, then **cancel** | The confirm dialog shows the record count and the URLs to be hidden, and asks for the name. Cancel changes nothing | 7 | ✅ | ✅ |
| A4.1 | `/admin/projects/new` | Pick the "অনুদান/উপকরণ" template and a single-project position; try the slugs `admin`, `123` and `semi-pucca` | Each slug is refused with its own message. The URL preview updates | 7 | ✅ | ✅ |
| A4.2 | wizard | Create with a fresh slug (Main `p8-main-leaf`, Plain `p8-plain-leaf`) | The toast says draft, and settings open. Its URL is 404 in the visitor tab | 7 | ✅ | ✅ |
| A5.1 | settings → সাধারণ | Edit the description and save | Saved, and kept after a reload | 7 | ✅ | ✅ |
| A5.2 | settings, two tabs | Save in tab 1, then save a different edit in tab 2 | Tab 2 shows the conflict text and reloads. A taken slug shows the slug message, not the conflict | 7 | ✅ | ✅ |
| A5.3 | settings → ফিল্ড | Add a category field, archive it, restore it, reorder | Each change is saved. The badges show required, table, card, filter and admin-only | 8 | ✅ | ✅ |
| A5.4 | settings → ফিল্ড (`demo`) | Open `trade`, which holds values | Key, type and visibility are locked. Delete offers archive ("…রেকর্ডে মান আছে"). Plain sees no field delete | 8 | ✅ | ✅ |
| A5.5 | settings → স্ট্যাট | Add a sum card on `amount` | The live preview shows the seeded total in ৳. At most 3 on home and 8 in all | 8 | ✅ | ✅ |
| A5.6 | settings → ছবি (`semi_pucca`) | Try before-after → after-only | Refused, with the number of records holding before photos | 7 | ✅ (after D1) | ✅ |
| A5.7 | settings → প্রদর্শন | Toggle the map and the address columns; save | Saved, and the public list follows | 7, 13 | ✅ | ✅ |
| A5.8 | settings → cover (`demo` for Main, the leaf for Plain) | Upload a JPEG, then delete it | The upload shows in the preview. Main deletes it. Plain sees no delete control | 15 | ✅ | ✅ |
| A5.9 | settings → publish (`demo` for Main, the leaf for Plain) | Publish through the checklist | Disabled until both names and a stat card exist. Then published, and visible to the visitor | 7 | ✅ | ✅ |
| A6.1 | `/admin/records/demo` | View the list; filter by `trade`; read the page money total | Config-driven columns, the filter works, and the money total adds up | 10 | ✅ | ✅ |
| A6.2 | record form → new | Add a record with money "১,২০,০০০", a `trade` from the suggestions, a phone, and a union | Saved with the next serial and back to the list (as at `a8e2154`, `RecordFormPage.tsx:59`), and photos picked in the form upload on save. The money preview shows "৳ ১,২০,০০০" with `inputMode=numeric`. The trade field suggests existing values. The phone is under "🔒 শুধু এডমিন তথ্য" and saved through `PUT /records/:id/private` | 9, 10 | ✅ | ✅ |
| A6.3 | record form → edit | Change the money to "১২০০০০/-" and save | Saved, and the list shows ৳ 1,20,000 | 10 | ✅ | ✅ |
| A6.4 | record form → serial | Change the serial with the dialog | Main: changed, and the URL follows. Plain: "লক করা — সিরিয়াল বদলাতে পারেন শুধু মূল এডমিন" and no button (known difference) | 10 | ✅ | ✅ (known difference: locked) |
| A6.5 | record form → photo | Upload `demo_0001.jpg` to the after slot, then try to replace it | Uploaded, and the thumb is shown. Main can replace it. For Plain the slot is locked (known difference) | 10 | ✅ | ✅ |
| A6.6 | record form → photo (AE3) | Upload a before photo to a `demo` record (via API if the slot isn't offered) | Refused as a validation error, and nothing is stored | 10 | ✅ | ✅ |
| A6.7 | records → delete | Delete one record, then bulk-delete two | Main: deleted, with photos. Plain: no row "ডিলেট" and no bulk "মুছুন" (AE1) | 10 | ✅ | ✅ |
| A6.8 | records → CSV | Export without, then with, private columns | Without: no `phone`. With: a confirm step, a name ending `-private`, and a `phone` header. Both start with a UTF-8 BOM and use Bangla labels as headers | 10 | ✅ | ✅ |
| A6.9 | records → CSV formula | Add a record named `=1+1`, then export | The cell is written as `'=1+1` | 10 | ✅ | ✅ |
| A6.10 | records → category | Make a near spelling (one record's `trade` set to `দর্জী`), then merge with "এক বানানে আনুন". The panel offers a merge only for near spellings, as at `a8e2154` | Confirmed, then the count moves, the public stats show the merged spelling, and the log has the `category_merge` row | 10 | ✅ | ✅ |
| A7.1 | `/admin/import?project=demo` | Insert a BOM CSV with custom, category and private columns, plus one bad money row | Headers map by themselves. The bad row is red. A category is fixed in the review panel. Inserted rows show the private phone in the form | 11 | ✅ | ✅ |
| A7.2 | import → update | Update by serial with only a money column, and one "(মুছুন)" cell | Main: only that value is cleared, nothing else changes, and failed rows can be downloaded as CSV. Plain: the "(মুছুন)" row is an error (known difference) | 11 | ✅ | ✅ (known difference: row error) |
| A7.3 | import → re-import | Import a CSV exported in A6.8 | Every header maps by itself | 11 | ✅ | ✅ |
| A8.1 | `/admin/photos?project=demo` | Drop `demo_0001.jpg` and `demo_0001_prev.jpg` | The first matches. `_prev` on the after-only project is red | 12 | ✅ | ✅ |
| A8.2 | `/admin/photos?project=semi_pucca` | Drop `semi_0001_prev.jpg`, then **cancel** | Main: an "ওভাররাইট" badge and a confirm, then cancel. Plain: the match is locked (known difference) | 12 | ✅ | ✅ (known difference: locked, shown on `demo` serial 1) |
| A9.1 | in-page probes, as Plain | `fetch` DELETE on a record, bulk delete, a field delete and a cover delete | Each is 403 with the main-admin message, and nothing is gone (AE1) | — | — | ✅ |
| A10.1 | `/admin/activity` | View the log; filter by project | Field labels (raw key when unknown), money as "৳ … → ৳ …", the rename row, and config events. The filter lists projects from the server | 12 | ✅ | ✅ |
| A11.1 | `/demo` as admin | Open the draft while it's unpublished | The preview opens with the draft banner. The visitor tab gets 404 | 6, 13 | ✅ | ✅ |
| A12.1 | settings → unpublish | Unpublish `demo` (Main) or the leaf (Plain) through the dialog | Unpublished, and gone from the visitor's home and menu | 7 | ✅ | ✅ |
| A12.2 | cleanup, as Main | Delete both walk leaves (`DELETE /projects/:key` from the page; no page has a project delete, as at `a8e2154`) | 204 for each, then 404, with the unused fields gone. The deleted leaf's settings URL shows the 404 page | 7 | ✅ (through the API: no page deletes a project, as at `a8e2154`) | — |

## V2. Public, visitor pass 2 (after A5.9 has published `demo` with photos and a cover)

| # | Where | Steps | Expected | M-step | Main |
|---|---|---|---|---|---|
| V2.1 | `/` | Open home | The `demo` card shows its cover and money stat (৳). There are still at most 2 API calls | 15 | ✅ |
| V2.2 | `/demo` | Open the list; filter by `trade` | Stat cards show the total ৳ and the category count, and the `trade` filter shows counts. There is no `phone` column. (`main` removed the category chart after `a8e2154` in `378f6ac`, so there is no chart, and the display tab has no chart field.) | 13 | ✅ |
| V2.3 | `/demo/<serial>` | Open a record with an uploaded photo | A single photo (no slider and no "তুলনা সম্ভব নয়"), with zoom and fullscreen working. Custom fields in order, and money and category in the highlight card. In English, the category stays as written | 14 | ✅ (fullscreen checked by the user by hand, because Chrome refuses fullscreen from an automated click) |
| V2.4 | in-page fetch | `GET /api/v1/projects/demo/records`, one record, `/projects/demo/stats`, `/projects/overview` | No `phone` or other admin-only key anywhere, and no draft project listed (R7, AE2) | — | ✅ |
| V2.5 | in-page fetch | `GET /api/v1/projects?drafts=1&include=fields`; POST a record, PATCH a record and PUT a photo with no session | Drafts are ignored or refused, and no `demo` field marked admin-only appears. Each write is 401 | — | ✅ |
| V2.6 | after A12.1 | Repeat V2.1, V2.4 and V1.11 | `demo` is gone from home and the menu. Its URL, records, stats and detail are 404. The overview and list don't include it | 7 | ✅ |

## Defects

| D# | Row | What happened | Fix commit | Test |
|---|---|---|---|---|
| D1 | A5.6 | The photo-mode refusal is right (400, mode unchanged) but has lost its record count. `0015` uses `exists` and says "আগের ছবিসহ রেকর্ড আছে — …", while `a8e2154`'s `10b_project_guards.sql` says "% টি রেকর্ডে আগের ছবি আছে — …" (and "% টি রেকর্ডে ছবি আছে — …" for `none`). The settings tab's help text promises the count. | `541f53c` (`0017`) | `server/test/db/project-guards.test.ts` "says how many records hold the photos the photo mode still needs" (fails on `0015`) |

## Later (not defects)

Wishes for new behaviour seen during the walk. These are not built in P8 (Scope Boundaries).

- **`/admin/users` on REST:** the main admin's "ইউজার" link opens a page that says "ইউজার-তালিকা আনা যায়নি — এই ব্যাকএন্ড অ্যাডাপ্টারে এখনো তৈরি হয়নি" (the agreed `NOT_IMPLEMENTED`; user management is after `a8e2154`), yet still shows the add form with Supabase instructions. P9 decides whether to hide the link and page or build the feature.
- **A5.6 data:** no seed record has a stored photo, so the photo-mode guard has nothing to refuse until a `semi_pucca` record gets a before photo. A5.6 was walked after a `semi_pucca` record (serial 13, union দলদলিয়া) got a before photo.
- **Serial dialog text:** the serial-change warning names the old link as `/housing/…/<serial>` for every project (`RecordForm.tsx:612`), so it's wrong for `/demo`. It is the same at `a8e2154` (`RecordForm.tsx:587`), so it's parity, not a P8 defect.
