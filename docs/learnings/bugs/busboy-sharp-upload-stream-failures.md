---
title: A busboy upload streamed through sharp hangs or leaks files unless every failure path drains instead of destroying
date: 2026-10-05
type: bug
module: server/photos (upload pipeline)
severity: high
tags: [busboy, sharp, streams, multipart, upload, abortsignal, aws-sdk, timeout]
applies_when: streaming a multipart file from busboy into a transform (sharp or similar) and on to storage
---

# Drain busboy's file stream on failure; never destroy it

## What happened
The photo upload pipes busboy's `photo` stream through a magic-byte gate and sharp (two clones: the full image and the thumb) into `storage.put`. Every early failure first made the request hang until the test timed out: a refused signature, the 5 MB limit, or a bad field. The review then found that a field error just before the `photo` part left two orphan files in storage.

## What didn't work
- **`pipeline(input, gate, decoder)`:** when the gate failed, `pipeline` destroyed busboy's file stream. busboy then waited forever for that stream to read, and `close` never fired.
- **`stream.destroy()` on busboy's `limit` event:** same stall.
- **`encoded.once('error')` on the sharp clones:** a second error emission had no listener. It threw inside the loop that was destroying the other clone, so that clone's `put` waited forever.

## What to do
All of this is in `server/src/photos/process.ts`:
1. **Pipe the file stream in; never hand it to `pipeline`.** On failure, unpipe it and `resume()` it so busboy can finish parsing:
   ```ts
   input.pipe(gate);
   const feeding = pipeline(gate, decoder).catch((err) => {
     input.unpipe(gate);
     input.resume();
     for (const encoder of encoders) encoder.destroy(err);
   });
   ```
2. **Ignore parts that arrive after a failure.** busboy keeps emitting events from the chunk it is in. So the `file` handler checks the `settled` flag and drains (`if (settled) { stream.resume(); return; }`). Also, a listener added to an `AbortSignal` that has already aborted never fires, so check `signal.aborted` first.
3. **Give the body you hand to a driver its own `error` listener.** The NAS driver `await`s `mkdir` before it attaches to the stream. A body destroyed before then otherwise surfaces as an unhandled stream error.
4. **Record where a failure started.** Use `pipe` (not `pipeline`) from each sharp clone into its counter, and set `imageError` in the clone's `error` handler and in the feed's `catch`. Otherwise a storage failure tears the encoder down and looks like a bad image (400), and a bad image breaks the storage body and looks like a storage error (500).
5. **Set `defParamCharset: 'utf8'` on busboy,** or UTF-8 file names (Bangla) arrive decoded as Latin-1.

Related: `@aws-sdk/client-s3`'s `NodeHttpHandler` only logs a warning when `requestTimeout` passes. Without `throwOnRequestTimeout: true` the request hangs (`server/src/storage/drivers/s3.ts`).

## Why
busboy applies backpressure through each file stream: if a file stream stops reading, the whole parse stops. sharp's clones each wait for the decoder's pixels and only end when the decoder ends or they are destroyed. So any path that stops reading the input without ending both sides stalls the request.

## How to prevent it
`server/test/photos/process.test.ts` covers the failure paths, each with a short timeout:
- every refused input and the late-part cases ("… before the photo, answered without hanging") assert that storage is left empty;
- the drain-window test sends a body that never ends and expects a 413 and a closed socket.

`server/test/storage/s3.test.ts` checks that a stalled endpoint fails within its timeout. Add a case like these for any new early-exit branch.

## Files
- `server/src/photos/process.ts`
- `server/src/photos/sniff.ts`
- `server/src/storage/drivers/nas.ts`
- `server/src/storage/drivers/s3.ts`
- `server/test/photos/process.test.ts`
