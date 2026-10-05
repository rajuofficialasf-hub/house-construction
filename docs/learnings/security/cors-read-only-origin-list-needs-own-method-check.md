---
title: A read-only CORS origin list needs its own method check and an unconditional Vary
date: 2026-10-05
type: security
module: api/cors
severity: medium
tags: [cors, preflight, vary, express, public-api]
applies_when: giving some origins narrower CORS than others (read-only, credential-less, per-path) with the cors package
---

# A read-only CORS origin list needs its own method check and an unconditional Vary

## What happened
C3 added `PUBLIC_READ_ORIGINS`: other apps' origins that may only GET the public reads, without credentials. The first design picked the cors options by origin and path. A plan reviewer ran the `cors` package and found that `{ origin: true, methods: ['GET','HEAD'] }` still answers a preflight for **POST** with `Access-Control-Allow-Origin`. It also found that the `{ origin: false }` branch sends no `Vary: Origin` at all.

## What didn't work
- Relying on `methods: ['GET','HEAD']`. That only fills `Access-Control-Allow-Methods`. The package never compares it with the preflight's `Access-Control-Request-Method`, so the grant goes out anyway, which breaks "no CORS answer for writes". The browser would still refuse the POST, but the API's stated rule is false and a test asserting it fails.
- Expecting cors to always vary on Origin. With an origin array it does. With a delegate that returns `origin: false` it sets no headers. A shared cache could then store a no-grant answer and serve it to an allowed origin.

## What to do
Decide the method yourself before choosing the narrow options, and set `Vary: Origin` before cors runs:

```ts
const isReadRequest = (req: Request) =>
  READ_METHODS.has(req.method) ||
  (req.method === 'OPTIONS' && READ_METHODS.has(String(req.headers['access-control-request-method']).toUpperCase()));

app.use((_req, res, next) => { res.vary('Origin'); next(); });
app.use(cors<Request>((req, callback) => {
  const origin = req.headers.origin;
  if (origin && credentialed.has(origin)) callback(null, site);
  else if (origin && publicRead.has(origin) && isPublicReadPath(req.path) && isReadRequest(req)) callback(null, reader);
  else callback(null, { origin: false });
}));
```

`origin: true` echoes the Origin header. That is safe only because it already matched one list exactly; never return it unchecked (`NE-SEC-02`).

## Why
`cors` is a header writer, not a policy engine. Its `methods` option is advertised, not enforced, and it adds `Vary` only on the branches where it sets an allow-origin.

## How to prevent it
Test each case through the real app (`server/test/http/security.test.ts`, "public-read CORS"):
- a preflight for POST or DELETE from the narrow origin gets no `access-control-allow-origin`
- an auth GET and a health GET from that origin get none either
- the site origin keeps credentials
- `vary` contains `Origin` on every branch, the unknown-origin one included

Config refuses an origin listed in both lists (`server/src/config.ts`), so no origin's role is ambiguous.

## Files
- `server/src/app.ts` (`corsFor`, `isReadRequest`, the `res.vary('Origin')` middleware)
- `server/src/config.ts` (`PUBLIC_READ_ORIGINS`)
- `server/test/http/security.test.ts`
