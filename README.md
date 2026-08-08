# Constellations of the Present

An interactive web artwork. A shared sky built from anonymous moment-hashes — every visitor becomes a star, and nothing raw ever leaves the device.

**Artist:** Andrea Cacioppo — Politecnico di Milano
**Format:** Public single-page web artwork (static build, privacy-by-design)
**ISEA2026** Digital Arts Student Competition — theme *ELYAH: Constellating Place, Data, Identity*

## The work

The sky is the original shared surface. This piece rebuilds that surface for the network age: a collective constellation that exists only in the living present, built from moments instead of profiles.

Each visitor's presence is sensed entirely on their own device:

1. The camera stream runs **on-device** (MediaPipe Face Landmarker). Expression, attention and engagement are read from the face geometry.
2. The reading is quantized into a coarse bucket (emotion, confidence, age band, presence time).
3. A random nonce is added and the whole thing is reduced to a non-reversible **SHA-256 hash** — the "moment-hash".
4. Only that anonymous code leaves the device. It seeds a star in a constellation shared, in real time, by everyone who is looking up at the same moment.
5. Stars flicker, grow while their moment is held, and fade when the person looks away. Connection lines appear only between people present in the same instant.

Nothing raw is ever transmitted, stored, or logged. The artwork is a working proof of its own thesis: **a collective can be built without capturing anyone.**

## Privacy model

| Surface | What leaves the device |
| --- | --- |
| Camera | Nothing. Face geometry is processed locally, frame by frame, then discarded. |
| Microphone | Only a live audio *level* (Web Audio `AnalyserNode`), used to modulate an ambient drone. Optional, opt-in. No signal is recorded or transmitted. |
| Network | The non-reversible moment-hash (`emotion|confidence|age|time` + random nonce → SHA-256) and a star birth timestamp. |
| Storage | Nothing persistent, unless a Supabase retention channel is configured (see below) — and even then, only anonymous hashes in a rate-limited, self-deleting log. |

No profiles. No faces in the cloud. No recordings.

## Stack

- Vite 8 + TypeScript (strict)
- Three.js (WebGL sky rendering)
- MediaPipe Tasks Vision (on-device face landmarking, vendored in `public/wasm` / `public/models`)
- Web Crypto API (SHA-256 hashing)
- BroadcastChannel (multi-tab, same-origin) — always available
- Supabase Realtime + Postgres (optional cross-device sync + retention log)

## Running

```bash
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build → dist/
npm run preview    # serve the production build locally
```

The app works without any environment configuration: it falls back to same-origin BroadcastChannel sync. To enable cross-device sharing:

```bash
cp .env.example .env
# fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

Then run the Supabase migration in `supabase/migrations/0001_retention.sql`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc --noEmit` + Vite production build |
| `npm run preview` | Serve the built app |
| `npm run test` | Vitest unit tests |
| `npm run test:watch` | Vitest watch mode |
| `npm run typecheck` | TypeScript check only |
| `npm run lint` | ESLint |

## Tests

62 unit tests across 11 files cover the core logic: moment-hash derivation, expression reading, star flicker, sky layout, channel message validation, and retention gating. Run with `npm test`.

## Deploy

Static build — deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages). CSP is injected into the production build by `vite.config.ts` (no inline scripts or external hosts allowed in production).

The `vercel.json` in this repo configures security headers for Vercel deployments.

## Documentation

- `docs/submission/` — ISEA2026 submission materials: concept statement, artist bio, organizer contact draft.
- `public/portfolio.html` — public portfolio/about page, reachable at `/portfolio.html` from the live artwork.
