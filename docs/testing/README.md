# Testing

Plan: [../plans/2026-10-04-1129-test-migration-safety-net-plan.md](../plans/2026-10-04-1129-test-migration-safety-net-plan.md). Diagram: [../diagrams/test-strategy.md](../diagrams/test-strategy.md).

The suite exists so that nothing is lost when the backend moves from Supabase to Express and PostgreSQL. It has three layers.

## Commands

| Command | What runs | Needs |
|---|---|---|
| `npm test` | Unit tests (`src/**/*.test.ts`) and backend-contract tests (`tests/contract/`) | nothing |
| `npm run test:e2e:mock` | Playwright: admin and write flows on the mock backend (`e2e/mock/`) plus the public flows on the mock backend (project `public-mock`, files in `e2e/live/`) | Chromium (`npx playwright install chromium`) |
| `npm run test:e2e:live` | Playwright: the public read-only flows against the live Supabase project (`e2e/live/`). Skips cleanly without credentials | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` |
| `npm run check:prod-bundle` | Builds with `VITE_HOUSING_BACKEND=mock` and fails if any mock backend code is in the production bundle | nothing |
| `npm run test:all` | `i18n-check`, `npm test`, `check:prod-bundle`, `test:e2e:mock` | Chromium |
| `npm run dev:mock` | The app on the mock backend, for manual checks. Admin login: see `MOCK_ADMIN` in `src/features/housing/backend/mock/fixtures.ts` | nothing |

## Rules

- **Live Supabase is read-only.** Serial counters never go down, so any create on live permanently skips a real serial number, and every admin login or logout adds activity-log rows. Live runs therefore cover only public read flows. The live contract runner (`tests/contract/supabase.readonly.contract.test.ts`) also blocks any request that could write, so a mistake fails the test instead of changing data.
- **Assert relationships, not data.** Tests check that filters narrow results, a detail view matches its row and totals add up. They never hard-code names or counts from real records.
- **Playwright servers use their own ports (5183 live, 5184 mock) and are never reused**, so a stray dev server cannot answer for the wrong backend. Live specs also block any non-read request to Supabase in the browser (`e2e/support/test.ts`).
- **Each Playwright test starts from the seed data.** Every test gets a fresh browser context, and the mock seeds itself per context, so tests do not depend on each other.

## The mock backend

`VITE_HOUSING_BACKEND=mock` selects an in-memory backend (`src/features/housing/backend/mock/`). It implements the same three interfaces as Supabase and follows [../api/API_CONTRACT.md](../api/API_CONTRACT.md): per-project serial counters that never decrease, admin-only writes, activity log, photo paths by serial. It works only in dev and test; a production build contains none of its code. Photo bytes are not stored; the dev server answers `/__mock-photos/...` with a placeholder image.

The mock keeps its state across page reloads inside one browser context. `window.__housingMock.reset()` restores the seed and logs out.

## Re-pointing the suite at the new backend

1. Write the REST `HousingApi` and `ImageStorage` adapters (`src/features/housing/backend/rest/index.ts` is a stub today; only the REST auth adapter exists) and build the Express server from the contract.
2. Add a contract runner next to `tests/contract/mock.contract.test.ts` that builds a harness (`tests/contract/harness.ts`) around the REST adapter, a test admin and a test non-admin, and call `runHousingApiContract(..., { writes: true })`. The same assertions then check the new server in full. Use a dedicated test database.
3. Run the browser specs against it: set `VITE_HOUSING_BACKEND=rest` and `VITE_API_BASE_URL` for a Playwright project, and replace the mock reset hook (`e2e/support/data.ts`) with a database reset or reseed. That reset is the only backend-specific seam in the specs.
4. A failing test names the lost behavior. Do not edit a test to make it pass unless the contract itself changed.

## Checked only on the mock today

These rules are encoded from reading the SQL, and nothing on the live project verifies them. They get a real check only once Express exists:

- Serial numbers are immutable and never reused; change-serial moves photos and conflicts on a used serial.
- Only admins can write; a non-admin account is refused at login.
- Every write is logged with before and after values.
- Bulk insert and bulk update validation.

## Behaviors the specs recorded

- The public list has no sort control; it is always ordered by serial. Sorting by other fields exists only in the API.
- CSV export is an admin feature (`/housing/admin/semi-pucca`), so its spec is in `e2e/mock/`.
- The bulk import wizard validates in the browser and sends only valid rows. A file with an invalid row imports the valid rows and reports the invalid one. The all-or-nothing rule applies to one batch sent to the API and is checked in the contract suite.
- The Supabase adapter splits a bulk insert into chunks of 200 and can stop after earlier chunks were saved. The contract in section 4.9 says one transaction. Decide which behavior the Express server should have.
- On the map, the caption counts only records whose district and upazila exist in the map data, so it can be lower than the stat card total.
