import { expect, test } from '../support/test'

// The public specs may run against a real site (production smoke test, docs/operations/runbook.md
// section 19), so in the rest projects the browser must not be able to send any write.
test('the browser sends no write request, on any path', async ({ page }, testInfo) => {
  test.skip(!['public-rest', 'edge-rest'].includes(testInfo.project.name), 'only the rest projects can point at a real site')
  await page.goto('/')
  const outcomes = await page.evaluate(async () =>
    Promise.all(
      [
        ['POST', '/api/v1/housing'],
        ['DELETE', '/api/v1/housing/00000000-0000-4000-8000-000000000000'],
        ['POST', '/api/v1/auth/login'],
        ['PUT', '/not-the-api'],
      ].map(([method, path]) =>
        fetch(path!, { method, body: method === 'DELETE' ? undefined : '{}' }).then(
          (r) => `sent ${r.status}`,
          () => 'blocked',
        ),
      ),
    ),
  )
  expect(outcomes).toEqual(['blocked', 'blocked', 'blocked', 'blocked'])
})
