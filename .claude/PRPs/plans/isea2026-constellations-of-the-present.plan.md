# Plan: ISEA2026 — "Constellations of the Present"

## Summary
Interactive web artwork for the ISEA2026 "Connecting Futures" Digital Arts Student Competition (deadline 2026-09-13). Theme: ELYAH — Constellating Place, Data, Identity.

The sky is a shared online constellation built from **moment-hashes**: each viewer's presence is sensed on-device (camera/expression/age/gaze), quantized, and reduced to a non-reversible code. The code seeds a star. Stars are ephemeral (live only while watched). Connection lines form only between people online at the same moment. No raw data ever leaves the device; nothing user-visible is retained. Retention/timestamping is a technical-layer capability only (backend analytics, never a user-facing interaction).

Double value: the work is both the artwork and the technical proof that a collective can be built without capturing anyone ("A Sky Without Capture" thesis). Submission package = public interactive piece + technical documentation.

## Art + Tech mapping (theme-centered)
| Pillar | Art layer | Tech layer |
|---|---|---|
| Place | star born where you are (map-as-sky) | geolocation opt-in, geo→sky projection |
| Data | star light = moment-hash | on-device sensing → quantize → hash |
| Identity | identity as present, not profile | privacy-by-design, non-reversible code |

## Patterns to Mirror
- Vanilla TypeScript + Vite (no framework bloat) for a fast, deployable creative web app.
- Three.js for the 3D sky/particles; minimal DOM overlay for status UI.
- MediaPipe Tasks Vision (FaceLandmarker) for on-device face/expression signals.
- Model assets vendored under `public/models/` (no runtime CDN dependency).
- Immutable state updates; small focused modules under `src/lib/`, `src/sky/`, `src/sensing/`.

## Tech stack (decided)
- Vite + TypeScript (vanilla)
- Three.js (r16x) for sky rendering
- @mediapipe/tasks-vision (FaceLandmarker)
- Supabase (Realtime for live stars; Postgres `stars` table for technical retention/analytics)
- Deploy: Vercel

## Files to Change
- `package.json`, `vite.config.ts`, `tsconfig.json`
- `index.html`, `src/main.ts`, `src/style.css`
- `src/sensing/face.ts` — camera + FaceLandmarker wrapper
- `src/sensing/expression.ts` — landmark→expression buckets (smile, brow, mouth-open, energy, confidence)
- `src/moment/hash.ts` — quantize + SHA-256 moment-hash (WebCrypto)
- `src/sky/star.ts` — star model (hue=emotion, size=duration, flicker=confidence)
- `src/sky/scene.ts` — Three.js scene, particle star renderer, ephemeral TTL
- `src/geo/geo.ts` — geolocation opt-in + coarse place
- `src/net/realtime.ts` — Supabase Realtime channel (W2+)
- `public/models/face_landmarker.task`

## Step-by-Step Tasks

### W1 — Core sensing → star (DONE)
1. Scaffold Vite + TS + Three.js project (npm).
2. Camera access + MediaPipe FaceLandmarker wrapper (`src/sensing/face.ts`).
3. Expression buckets from landmarks (`src/sensing/expression.ts`): smile, brow, mouth-open, energy, confidence.
4. Moment-hash module using WebCrypto SHA-256 (`src/moment/hash.ts`).
5. Three.js star renderer: hue from emotion, flicker from confidence, size grows with time watched (`src/sky/`).
6. Glue in `src/main.ts`: camera → sensing → hash → star. Status overlay minimal.
7. Geo opt-in stub (`src/geo/geo.ts`) — logs coarse coords, star stays centered this phase.
8. Vendor `face_landmarker.task` model into `public/models/`.
9. Validate: type-check, build, lint.

Status 2026-08-08: 1–8 completed. 14 Vitest tests pass (hash determinism/non-reversibility/quantization, expression fixtures joy/surprise/anger/calm/neutral, star size/flicker/hue). `npm run build` clean (tsc + vite). Preview smoke: index 200, model 200. Chunk-size warning (three.js 672 KB) accepted for now; defer code-splitting to W4. No eslint config yet → lint not configured (documented). Git: project not yet initialized as its own repo (parent repo in ~).

**W1 acceptance**: opening the app with camera grants → my smile turns the star gold; star flickers at low confidence; star grows while I watch; type-check + build pass.

### W2 — Realtime shared sky (DONE)
1. Supabase project + Realtime channel; ephemeral stars broadcast live.
2. Two-browser same-sky milestone.
3. Moment-hash transmitted only; no raw data.

Status 2026-08-08: completed. `@supabase/supabase-js` installed; `src/net/StarChannel.ts` + `src/net/channel.ts` (presence channel "sky", BroadcastChannel fallback "copt-sky" zero-credenziali, noop); moduli puri `src/sky/remotePosition.ts` (hash→posizione sferica), `src/sky/presence.ts` (registry+prune, REMOTE_TTL 10s > publish 5s), `src/sky/connections.ts` (buildLines K=4, maxDist 2.5); scene refactor (pool remote mesh, 6 materiali per bucket, LineSegments 0x8fa0d8 additive, buffer riusati); main glue (gate publish a intervallo minimo 5s anti-spam, prune timer, presence counter, conn dot). 38 Vitest tests (7 file). tsc + build clean. WASM MediaPipe self-hosted in `public/wasm/` (fix 404 CDN 0.10.22 → 1.0.1 locale). Due-tab BroadcastChannel verificato. Star locale stabile (hash rigenerato solo su cambio stato quantizzato).
Debito grafico (→ W4): il cielo è funzionale ma "glitchy/brutale" — migliorare resa visiva della stella locale, glow, connessioni e composizione generale.

**W2 acceptance**: shared sky across 2 clients; only hashes transmitted; connessioni solo tra stelle live (K, maxDist); tsc+test+build verdi.

### W3 — Technical retention layer (no user-facing flag) (DONE)
1. Postgres `stars` table (hash, timestamp, emotion bucket, age band, confidence, coarse geo opt-in).
2. Anonymous logging only; rate-limited; nonce discarded; not exposed in UI.

Status 2026-08-08: completed (Opzione C — schema+API pronti, wiring differito finché non ci sono credenziali). `supabase/migrations/0001_retention.sql` (tabella `stars` + RPC `log_star()` SECURITY DEFINER insert-only: whitelist emotion, range confidence, regexp hex64, length cap age_band, guard finestra `p_ts`, budget insert globale 20/5s); `src/retention/retention.ts`+test (RetentionSink supabase/noop, gate 5s condiviso, logga SOLO il seed — mai code/nonce; `p_ts` in ISO-8601); glue in `main.ts` (sink nel ramo "nuovo momento", dispose su unload). Review code+security: fix H1/M1/M2/M-2/M4/S1/S2 integrati; M-3 (seed brute-force reversibile) accettato e documentato (emotion+confidence già pubblici via presenza). 48 Vitest tests (8 file). tsc+build puliti. Zero UI, zero rete senza credenziali.

**W3 acceptance**: retention solo seed+bucket anonimi, gated, mai nonce/code; senza credenziali app invariata; test+typecheck+build verdi.

### W4 — Polish
1. Full sky scene: particle system, constellation lines, uncertainty flicker balance.
2. Optional reactive ambient sound (mic opt-in).
3. Mobile + accessibility; graceful camera-degraded mode (presence-only stars).

### W5 — Submission
1. Concept statement (≤250w), bio (≤75w) + institution, portfolio page.
2. Public deploy URL; demo video (30–60s).
3. Contact organizers to confirm "other digital formats" includes interactive web.

## Validation Commands
- Type-check: `npx tsc --noEmit`
- Lint: `npx eslint .` (or omit if not configured → document)
- Build: `npm run build`
- Dev server smoke: `npm run dev` + manual camera check

## Testing Strategy
- Unit tests (Vitest): `src/moment/hash.ts` (determinism, non-reversibility, quantization buckets), `src/sensing/expression.ts` (landmark fixtures → expected buckets), `src/sky/star.ts` (hue/size/flicker mapping).
- Manual/E2E: camera grant → star color; two tabs live sky (W2); flag-free UI check (no persistence affordance visible).

## Acceptance Criteria
- W1: smile→gold star; flicker@low confidence; growth with time; tsc + build pass.
- W2: shared sky across 2 clients; only hashes transmitted.
- W3: retention table populated anonymously; zero user-facing persistence UI.
- W4: polished mobile-friendly sky.
- W5: submission package + URL + organizer confirmation.

## Deviations
- No ESLint configured (not installed at scaffold); lint validation deferred → add in W4 polish or remove from checklist.
- three.js bundle 672 KB min / 176 KB gzip triggers Vite chunk-size warning; accepted for W1, plan code-splitting (dynamic import) in W4.
- `src/geo/geo.ts` uses coarse `lat,lon` only (1 decimal), displayed in status text; revisit in W4 for sky-projection semantics.
