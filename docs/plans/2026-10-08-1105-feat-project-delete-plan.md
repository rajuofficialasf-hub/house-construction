---
title: Delete an empty project from the admin panel
type: feat
status: in-progress
source: brainstorm
date: 2026-10-08
doc_review: 2026-10-08
---

# Delete an empty project from the admin panel

## Goal
The main admin can remove a project that was created by mistake or for a test, from that project's settings page, after typing the project's name to confirm. Nobody can delete a project by a single click, and a project that holds or ever held records stays protected exactly as the database already demands.

## Problem
The server has had `DELETE /api/v1/projects/:key` (main admin only) since the registry was built, and the UI adapter exposes it as `ProjectsApi.delete`, but no screen offers it. Test projects made with the wizard pile up and can only be removed by hand in the database. The admin guide (`docs/ADMIN_GUIDE.md`, roles table) already promises the main admin can delete a project.

## What exists (don't re-decide)
- **Server:** `DELETE /api/v1/projects/:key` in `server/src/routes/v1/projects-admin.ts`, guarded by `requireMainAdmin`; `deleteProject` in `server/src/projects/writes.ts` removes the row, its fields and its cover file. Tested in `server/test/http/projects-writes.test.ts` and the role tests.
- **Database guard** (`housing_projects_guard`, migration `0015`): refuses, with a fixed Bangla message (`HC400`, mapped to a 400 by `server/src/errors.ts`), the delete of
  - a group that still has sub-projects,
  - a project that has records,
  - a project whose serial counter is above zero (it had records once; the counter row is kept so a re-created key never reissues a serial).
  There is no override, by design. These rules stay as they are.
- **UI adapter:** `ProjectsApi.delete(key)` in `src/backend/interfaces/projectsApi.ts`, implemented in `src/backend/rest/projectsApi.ts`. The mock answers `NOT_IMPLEMENTED`, as the mock never grows.
- **Verification pattern:** `src/features/admin/projects/UnpublishDialog.tsx` enables its button only when the admin types the project's Bangla name exactly (NFC-normalised). The delete dialog follows the same pattern.
- **Shared dialog:** `src/features/housing/components/ConfirmDialog.tsx` (`tone="danger"`, `confirmDisabled`, `busy`).
- **Role check in the UI:** `isMainAdmin` in `src/features/admin/adminUser.ts`; the server stays the authority.
- **Registry store:** `refreshProjects` in `src/features/projects/registry/projectsStore.ts` reloads the project list after a change.

## Requirements
- **R1** On `/admin/projects/:key`, the main admin sees a "danger zone" section at the bottom of the General tab, visually separate from the rest of the settings, holding one "প্রকল্প মুছুন" button.
- **R2** An `admin` or `editor` never sees the section; a direct `DELETE` request from them is still refused by the server with 403, as today.
- **R3** Pressing the button opens a confirmation dialog that names the project, states that the delete cannot be undone and that the project's fields and cover image go with it, and keeps the "মুছুন" button disabled until the admin has typed the project's Bangla name exactly (same matching as the unpublish dialog).
- **R4** The button is shown but disabled, with a one-line explanation beside it, when the UI can already tell the database will refuse. The first matching reason is shown, checked in this order:
  - the project is a group with sub-projects: "«{name}» গ্রুপে উপ-প্রকল্প আছে — আগে সেগুলো সরান",
  - the project has records: "«{name}» প্রকল্পে রেকর্ড আছে — মোছা যাবে না; দরকার হলে অপ্রকাশিত করুন",
  - the project is published: "প্রকাশিত প্রকল্প মোছা যায় না — আগে অপ্রকাশ করুন".
  The first two are the database guard's own text, «name» prefix included (migration `0015`, `housing_projects_guard`), so the UI's explanation and a server refusal read the same (user-decided 2026-10-08). The third is a UI-only rule and uses the page's "অপ্রকাশ করুন" button wording.
- **R5** When the database refuses a delete the UI could not foresee (the project had records once and its counter is above zero), the dialog shows the server's Bangla message and stays open; nothing else changes.
- **R6** After a successful delete the admin lands on `/admin/projects`, sees a success toast, and the project is gone from the admin list, the public site and the registry store without a page reload.
- **R7** While the delete request is in flight the dialog's buttons are disabled and Esc does nothing, as the shared dialog already does for `busy`.
- **R8** Unsaved changes on the General tab block the delete button the same way they block publish and unpublish today (disabled, with "আগে পরিবর্তন সংরক্ষণ করুন" as the tooltip).

## Scope
- In: the danger-zone section and dialog on the project settings page; a pure "why can't this be deleted" rule the page and tests share; the activity log entry the database already writes (`project_delete`); admin end-to-end specs on the `admin-rest` lane; a line in `docs/ADMIN_GUIDE.md` and the openapi/contract doc if the UI reference column changes.
- Out (not now): any change to the server route or the database guard; deleting a project that has or had records; a delete button on the `/admin/projects` list; a "trash" or undo; deleting records in bulk to make a project deletable; changes to the mock backend.

## Key decisions
- **Where:** a danger zone at the bottom of the settings page's General tab, not on the project list (user-decided 2026-10-08). Governs R1.
- **Verification:** type the project's Bangla name, reusing the unpublish dialog's rule, rather than a plain confirm or a fixed word (user-decided 2026-10-08). Governs R3.
- **Blocked projects:** the button stays visible but disabled with an explanation, rather than hidden or failing late on the server (user-decided 2026-10-08). Governs R4.
- **Published projects must be unpublished first:** deleting a live public URL in one step would make the type-the-name check the only barrier between a published page and a 404; the site already requires unpublishing before a slug or parent change, so this follows the same rule. Recommended by the brainstorm, not asked; raise it in "Change something" if unwanted. Governs R4.
- **The server stays the authority:** the UI checks are a courtesy; every refusal the server or database makes is shown as is (R5), never worked around.

## Success criteria
- A main admin can create a test project in the wizard and remove it again from its settings page in under a minute, without touching the database.
- No path in the UI sends `DELETE /api/v1/projects/:key` with fewer than two deliberate actions (open the dialog, then type the name and press the button).

<!-- ae-plan adds everything below -->

## Technical decisions
- **Stack profile unchanged** (`ST-40`, `ST-43`): the profile in `CLAUDE.md` stands (React + Vite UI, Express 5 + postgres.js server, own cookie sessions, storage adapter). This work adds no stack piece: the route, the guard and the adapter method already exist.
- **No server or database change** (brainstorm scope): the UI calls `ProjectsApi.delete` from `src/backend/rest/projectsApi.ts` as it is. Every refusal the server makes is shown as it arrives (`RE-SEC-05`, `NE-SEC-03`); the UI's own checks only explain in advance.
- **One pure rule for "why can't this be deleted"**: `deleteBlocker(project, projects, records): string | null` in `src/features/admin/projects/projectRules.ts`, beside `friendlyProjectError`, following the shape of `publishChecklist` (`src/features/admin/projects/publishChecklist.ts`). The page and its tests share it, so the disabled button, its explanation and the Vitest cases can't drift apart (`TS-10`). Order of checks: group with sub-projects, then records, then published. The first two copy the database guard's text exactly (migration `0015`, `housing_projects_guard`); the third is a UI-only rule and uses the page's own "অপ্রকাশ করুন" wording.
- **Dialog follows `UnpublishDialog`**: a new `DeleteProjectDialog` in `src/features/admin/projects/DeleteProjectDialog.tsx` wraps the shared `ConfirmDialog` (`tone="danger"`) and reuses the same name rule, `typed.trim().normalize('NFC') === project.name_bn.trim().normalize('NFC')`, and the same input label text, so the admin meets one habit in both places. It takes an `error: string | null` prop and renders it as `<p role="alert">` inside the dialog so a server refusal keeps the dialog open (R5); the unpublish flow closes its dialog on error and shows the message inline, which would hide the message behind the closed dialog here.
- **Role check in the UI**: `isMainAdmin(useAdminUser())` from `src/features/admin/adminUser.ts`, the newer admin-panel helper (ImportPage, PhotoBulkPage, AdminRecordsPage use it), not `useAuth()`. It only hides the section; the server's `requireMainAdmin` is the authority (`RE-SEC-05`).
- **After a successful delete**: `await refreshProjects({ includeDrafts: true })`, `toast.success`, then `navigate('/admin/projects')`, the order `ProjectWizardPage.tsx` uses after create. Navigate before any `reload()` of the page's own state, because the page renders `NotFoundPage` once the project is gone from the list.
- **Busy state** (`RE-FX-03`): the page's existing `busy` flag disables the danger-zone button and the dialog; `ConfirmDialog` already ignores Esc and the backdrop while busy (R7).
- **Danger zone placement**: inside the General tab's `<form>`, after `CoverUpload`, as a separate `card` with a red border (`border-red-200`) and a heading, so it reads as a different kind of action. The button is `type="button"` so Enter in a form field never triggers it. No new shared "danger button" style: the single button uses the `secondaryButton` style with red text and border classes added, the way `ConfirmDialog` colours its own danger button.
- **Tests**: a Vitest file for the pure rule (`TS-01`); the page itself has no component-test setup in this repo (no Testing Library), so its behavior is proved end to end on the `admin-rest` lane (`e2e/admin/`, `docs/testing/README.md`), selecting by role and label only (`TS-30`), each spec creating its own throwaway project through the wizard (`TS-14`, `TS-32`) because every spec starts from the reset mock seed, whose `DEMO` project has records and so can't be deleted.
- **Copy**: every new Bangla string goes through `t()` and gets an English entry in `src/i18n/en.ts` keyed by the exact Bangla text; `npm run i18n-check` fails otherwise.
- **Comments** (`ORG-CMT-01`, `ORG-CMT-11`): the rule function's TSDoc says why published projects are refused (a live URL must not vanish in one step) and cites this plan's path with the R-ID; no "added for R4" narration.

## Implementation units

### U1. The delete-blocker rule and its translations
- **Goal:** One pure function tells the page, in the admin's words, why a project can't be deleted right now, or that it can.
- **Requirements:** R4
- **Files:** `src/features/admin/projects/projectRules.ts`, `src/features/admin/projects/projectRules.test.ts`, `src/i18n/en.ts`
- **Approach:** Add `deleteBlocker(project: Project, projects: readonly Project[], records: number): string | null` next to `friendlyProjectError`, built with `t()` and `childrenOf`-style filtering over `projects` (see `publishChecklist.ts` for how it reads children by `parent_key`). Messages, in check order: `«{name}» গ্রুপে উপ-প্রকল্প আছে — আগে সেগুলো সরান` (groups only), `«{name}» প্রকল্পে রেকর্ড আছে — মোছা যাবে না; দরকার হলে অপ্রকাশিত করুন`, `প্রকাশিত প্রকল্প মোছা যায় না — আগে অপ্রকাশ করুন`. Add the three English entries and the dialog/section strings U2 will need (title `«{name}» মুছে ফেলবেন?`, section heading, body text, button `প্রকল্প মুছুন`, toast `«{name}» মুছে ফেলা হয়েছে`) to `en.ts` in this unit so `i18n-check` stays green at every commit.
- **Tests (Vitest, `projectRules.test.ts`):** a draft project with 0 records and no children → `null`; a group with one child → the group message, even when records is 0; a draft project with 3 records → the records message; a published project with 0 records → the published message; a published project with records → the records message (records outranks published); a group with no children and 0 records, unpublished → `null`. Expected strings are literals, never built by calling the function (`TS-11`).
- **Done when:** `npm test` passes with the new cases and `npm run i18n-check` reports no missing key.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. Danger zone and delete dialog on the settings page
- **Goal:** The main admin can delete an empty draft project from its settings page after typing its name, and is told in advance when a project can't be deleted.
- **Requirements:** R1, R2, R3, R4, R5, R6, R7, R8
- **Files:** `src/features/admin/projects/DeleteProjectDialog.tsx` (new), `src/features/admin/pages/ProjectSettingsPage.tsx`, `docs/ADMIN_GUIDE.md`
- **Approach:**
  - `DeleteProjectDialog` copies the structure of `UnpublishDialog.tsx`: props `{ project, busy, error, onConfirm, onCancel }`, local `typed` state, the same NFC name match in `confirmDisabled`, title `«{name}» মুছে ফেলবেন?`, confirm label `মুছুন`, a body paragraph saying the project, its fields and its cover image are removed and this cannot be undone, the labelled `<input autoComplete="off">`, and `{error && <p role="alert" className="text-sm text-red-700">{error}</p>}`.
  - In `ProjectSettingsPage.tsx`: import `useNavigate` from `react-router`, `isMainAdmin`/`useAdminUser` from `../adminUser`, `deleteBlocker` from `../projects/projectRules`, and the new dialog. Add `confirmDelete` and `deleteError` state (one `useState<string | null>` each). The new hook calls (`useNavigate`, `useAdminUser`, both `useState`) go with the page's existing hooks at the top of the component, next to `confirmUnpublish`, because the page returns early (`loadError`, `!all`, `!project || !form`) before `dirty` and `records` are computed, and a hook after those returns breaks the rules of hooks. Only `blocker = deleteBlocker(project, all, records)` is computed after the returns, during render (`RE-FX-04`). After `<CoverUpload … />` in the General tab, when `isMainAdmin(me)`, render a `card` with `border-red-200`, an `<h2>` "বিপজ্জনক অংশ", one sentence of help, the `<button type="button">` "প্রকল্প মুছুন" with `disabled={busy || dirty || blocker !== null}` and `title={dirty ? t('আগে পরিবর্তন সংরক্ষণ করুন') : blocker ?? undefined}`, and, when `blocker` is set, the same text as a visible `<p>` beside the button (not only a tooltip, R4). The handler: `setBusy(true)`, `await getProjectsApi().delete(project.key)`, `await refreshProjects({ includeDrafts: true })`, `toast.success(t('«{name}» মুছে ফেলা হয়েছে', …))`, `navigate('/admin/projects')`; on error `setDeleteError(friendlyProjectError(err))` and leave the dialog open; `finally setBusy(false)`. Render the dialog next to `UnpublishDialog` at the bottom of the page.
  - `docs/ADMIN_GUIDE.md` §৩ "প্রকল্পের সেটিংস": one bullet after "সাধারণ" saying the main admin deletes an empty draft project from the danger zone at the bottom of the General tab by typing its name, and that a project with records (now or ever) or a published project can't be deleted, pointing to §৮ for unpublishing.
- **Tests:** none of their own beyond `npm run build` (typecheck), `npm run lint`, `npm run i18n-check` and a Chrome walkthrough on the compose stack: create a project in the wizard, delete it, see the toast and the list; open `demo`, see the disabled button and its reason. The behavior tests are U3 (`TS-20`).
- **Done when:** on `http://localhost:5173/admin/projects/<new-key>` the main admin deletes a fresh wizard project with the typed name and lands on `/admin/projects` with a toast; on `/admin/projects/demo` the button is disabled with the records message; signed in as the plain admin, the section is absent.
- **Depends on:** U1
- **Size:** M
- **Risk area:** auth
- **Status:** done

### U3. End-to-end specs for the delete flow
- **Goal:** The delete flow, its guards and its role limits are proved on the real server and stay proved.
- **Requirements:** R1, R2, R3, R4, R5, R6, R8
- **Files:** `e2e/admin/project-delete.spec.ts` (new), `e2e/support/projects.ts` (a `createDraftProject(page, nameBn, nameEn)` helper lifted from `e2e/admin/project-wizard.spec.ts` lines 9–18, returning the new key from the URL)
- **Approach:** Import `{ expect, test }` from `../support/backend` and `loginAs`, `MOCK_ADMIN`, `PLAIN_ADMIN`, `inFreshContext` from the support files, as `e2e/admin/project-settings.spec.ts` and `e2e/admin/delete-roles.spec.ts` do. Dialog selectors: `page.getByRole('dialog', { name: '«X» মুছে ফেলবেন?' })`, `dialog.getByLabel('নিশ্চিত করতে প্রকল্পের নাম লিখুন: X')`, `dialog.getByRole('button', { name: 'মুছুন' })`. Toasts via the `toast(page, msg)` helper.
- **Tests:**
  1. main admin creates a draft project, opens its settings, the "মুছুন" button in the dialog is disabled until the exact name is typed (a wrong name keeps it disabled), then deletes: URL becomes `/admin/projects`, toast `«X» মুছে ফেলা হয়েছে`, the project name is absent from the list, and `expectNotFound` on its public path.
  2. on `/admin/projects/demo` (6 records) the "প্রকল্প মুছুন" button is disabled and the records message is visible.
  3. a fresh draft project is published with the `publish` helper; its delete button is disabled with the published message; after unpublishing (type the name in the unpublish dialog) the button is enabled.
  4. the plain admin opens a draft project's settings and sees no "প্রকল্প মুছুন" button; a direct `DELETE /api/v1/projects/<key>` from that session (the `api()` pattern in `delete-roles.spec.ts`) gets 403 with `শুধু মূল এডমিন মুছতে পারেন` (`TS-13`).
  5. R5: the main admin opens a fresh draft's dialog, then in a second context (`inFreshContext`, main admin) adds one record to that project through the records page or API; back in the first tab the typed-name delete is refused by the database, the dialog stays open and shows the server's `প্রকল্পে রেকর্ড আছে` message.
  6. R8: on a fresh draft's General tab, changing the Bangla name without saving disables "প্রকল্প মুছুন" with the title `আগে পরিবর্তন সংরক্ষণ করুন`; saving re-enables it.
  No fixed sleeps (`TS-31`); every wait is a web-first assertion.
- **Done when:** `npm run test:e2e:rest-admin` is green with the new spec, and the existing `project-settings.spec.ts` and `delete-roles.spec.ts` still pass.
- **Depends on:** U2
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** all at once, split at U2 (one by one 0, grouped 4, all at once 9)
- **Signals:** N 3, L 350, R 1, Fd 0, C 3, P 0
- **C1** after U2: risk unit (auth-gated UI) that U3 depends on, so the review runs before the specs copy its wording and selectors
- **C2** after U3: end

## Verification
```bash
npm run build                 # tsc -b && vite build
npm run lint                  # oxlint
npm run i18n-check            # every new Bangla string has an English entry
npm test                      # Vitest, including projectRules.test.ts
docker compose up -d db       # the admin e2e lane resets housing_test
npm run test:e2e:rest-admin   # e2e/admin/**, including project-delete.spec.ts
```
`npm run test:e2e:rest-admin` must not run at the same time as `npm --prefix server test` or `npm run test:contract:rest` (they share `housing_test`).

## Risks and rollback
- **Deleting the wrong project:** the typed name, the disabled-while-busy button and the server's own guards are the barriers; a project with records can't be deleted by anyone, by database rule. An empty project that is deleted is gone with its fields and cover; there is no trash. The activity log keeps a `project_delete` row with the project snapshot (migration `0015`), which is enough to re-create it by hand.
- **Rollback:** UI-only change, no migration; reverting the commits restores the previous page. The route stays as it was in both directions.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

<!-- ae-work adds this while status is in-progress, and removes it at done -->

## Progress
- **Branch:** `dev-raju` (the user's own branch, chosen in chat on 2026-10-08, instead of a `feat/` branch)
- **Updated:** 2026-10-08 12:05
- **Next:** checkpoint C1 (test, simplify, review of U1–U2), then U3 `e2e/admin/project-delete.spec.ts`
- **Reviewed through:** none
- **Uncommitted:** none
- **Notes:** the session has no task tool, so units are tracked in this section only. The host has no `node_modules`; Vitest, oxlint and `tsc -b` run inside the compose `web` container (`docker compose exec -T web npx …`), which bind-mounts the source. `scripts/` is not mounted there, so `node scripts/i18n-check.mjs` runs on the host (built-in modules only). The dialog title `«{name}» মুছে ফেলবেন?` already had an English entry from the field delete.
