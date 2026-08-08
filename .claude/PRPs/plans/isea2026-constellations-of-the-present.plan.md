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

### W4 — Polish (DONE)
1. Full sky scene: particle system, constellation lines, uncertainty flicker balance.
2. Optional reactive ambient sound (mic opt-in).
3. Mobile + accessibility; graceful camera-degraded mode (presence-only stars).

Status 2026-08-08: completed. Render stelle riscritto: sprite con texture radiale + AdditiveBlending (bagliore reale, non più sfere-plastica); starfield di fondo deterministico (1200 punti, PRNG seedato → stesso cielo per tutti i client); flicker bi-phasico lento `breathingFlicker` (1.4s+4.7s, ampiezza ∝ confidenza invertita, ~1 con reduced-motion); connessioni con fade per vertice (opacità per distanza, estremo lontano dim); own star = sprite dedicato + anello orbitale (materiale clonato, non condiviso coi remote). Camera-degraded: se camera/modello AI non disponibili il cielo resta attivo (presence-only, nessun own star, status chiaro). Code-splitting: `await import('./sky/scene')` → three.js in chunk lazy separato (530KB vs bundle unico 672KB). Ramo stabile `paintStar` (solo aggiornamento colore live, niente re-publish/re-log per frame). Audio ambientale opt-in: pulsante → AudioContext → mic → AnalyserNode → RMS live → `mapLevelToGain` → drone morbido (3 oscillatori + lowpass), mai registrato (il segnale mic NON raggiunge gli speaker: analyser è sink di sola lettura). A11y: `role="img"`+aria-label canvas, aria-label video, pulsante accessibile con `aria-pressed`, `prefers-reduced-motion` (flicker statico + rotazione starfield disattivata). ESLint typescript-eslint flat config aggiunto (script `lint`). 62 Vitest tests (11 file). tsc + build + lint puliti.

**Review W4 (code + security, range 1de88c5..199d578): 0 CRITICAL, 0 HIGH, fix integrati.**
- Code review: 5/5 item verificati (1 PASS sprite material; 2 PARTIAL → `breathingFlicker` ora respira simmetricamente attorno a 1, range reale ~[0.62, 1.38] con doc+test allineati; 3 PASS determinismo/raggio, ma starfield passa a `ShaderMaterial` che consuma l'attributo `size` per-vertice — prima inerte con PointsMaterial; 4 PASS cleanup `stop()`; 5 PASS igiene/errori). Finding aggiuntivi risolti: M2 (rotazione starfield rispetta reduced-motion), L1 (guardia `starting` anti doppio avvio/parziale), L2 (duplicato `id="code"` → `code-value`), L3 (status degraded non sovrascritto), L4 (`.catch()` su `main()` + gestione `webglcontextlost/restored`), L5 (commento tinta neutra linee), L7 (commento mix clock `Date.now()`/`performance.now()`); L6 (allocazioni per frame in `buildLines`) accettato: O(n² log n) con n≤61, informativo.
- Security: 0C/0H/3M/4L. M1 (mic instradato agli speaker: rimosso `analyser.connect(gainNode)`), M2 (leak stream su errore parziale `start()`: try/catch con stop tracks + close ctx + rethrow), M3 (nessuna CSP: aggiunta CSP via meta in build produzione, `vite.config.ts` plugin `inject-csp` — script-src `'self' 'wasm-unsafe-eval'` per MediaPipe; niente inline handlers). L1/L2/L3 risolti come sopra (duplicato id, double-start, camera non fermata su degraded/unload → `stopCamera` in `face.ts` + `beforeunload`). L4 (shape stelle remote non validata): `isValidRemoteStar` in `channel.ts` (regexp hex64 + whitelist emotion + range confidence) applicata a emit presence e broadcast onmessage.
- XSS/Injection: nessun rischio (tutti `textContent`, zero innerHTML/eval).
- Rischi residui accettati (riportati da security review): nessun rate-limit per-IP su `log_star` (budget globale 20/5s, deferito a Edge Function), reversibilità seed per enumerazione (già documentata in W3), `npm audit` da eseguire prima del deploy.

**W4 acceptance**: polished mobile-friendly sky.

### W5 — Submission (DONE)
1. Concept statement (≤250w), bio (≤75w) + institution, portfolio page.
2. Public deploy URL; demo video (30–60s).
3. Contact organizers to confirm "other digital formats" includes interactive web.

Status 2026-08-08: completed (parte deploy resta bloccata: Vercel CLI non autenticato, nessun `.env` Supabase). Deliverable scritti:
- `docs/submission/concept-statement.md` — 237 parole (≤250), byline Andrea Cacioppo, Politecnico di Milano, tema ELYAH.
- `docs/submission/bio.md` — 66 parole (≤75).
- `docs/submission/organizer-email.md` — bozza email agli organizzatori per confermare che il formato "interactive web" sia accettato (pronta da inviare).
- `docs/submission/demo-constellations.webm` — video demo 58s (range 30–60s), 1280×720 WebM, registrato con Playwright (ui-demo skill) su build locale con fake media device; remoto simulato postando i messaggi `RemoteStar` già validati da `isValidRemoteStar` (publish throttling della telecamera fake impedisce stelle incrociate reali). Flusso: apertura cielo → stella locale + moment-hash → stelle remote online → connessioni → toggle suono ambientale opt-in → portfolio page. Sottotitoli in inglese.
- `public/portfolio.html` — portfolio/landing page (concept, privacy, tech, bio) collegata dall'opera via `#about-link` (`?` in basso a destra).
- `README.md` — documentazione tecnica completa (privacy model, stack, runbook deploy).
- `vercel.json` — security headers per deploy Vercel (X-Frame-Options DENY, nosniff, no-referrer, Permissions-Policy camera/mic solo self, COOP same-origin).
- Repo pubblico GitHub: `nutriandrea/constellations-of-the-present` (https://github.com/nutriandrea/constellations-of-the-present), branch `feat/isea2026-constellations`, commit `331cd55` (+ W5 successivi).

Verifica: 62 test verdi (11 file), tsc + build + lint puliti.

**Todo W5 rimanenti (bloccati da input/credenziali utente):**
- Deploy pubblico: `vercel login` (interattivo) + variabili Supabase in Vercel (o deploy senza `.env` → sky broadcast multi-tab same-origin). `npm audit` prima del deploy (rischio residuo W4).
- Invio email organizzatori (bozza pronta in `docs/submission/organizer-email.md`).
- Contenuti personali per la submission finale (email di contatto, eventuale istituzione nel form): confermare con l'artista.

**W5 acceptance**: submission package + URL + organizer confirmation (URL e conferma organizzatori pendenti da input utente).

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
- ESLint: configured in W4 (typescript-eslint flat config, `npm run lint`), deviazione chiusa.
- three.js bundle: code-splitting in W4 (`await import('./sky/scene')`) → chunk lazy separato `scene-*.js` (~530KB min, ~133KB gzip) caricato solo quando il cielo parte; il chunk rimane >500KB → warning Vite residuo accettato (chunk lazy, non critico per il primo paint). Deviazione chiusa.
- `src/geo/geo.ts` usa `lat,lon` coarse a 1 decimale per l'etichetta di luogo nello status. **Decisione W4 documentata**: la posizione della stella resta guidata dal moment-hash (identità del momento, non luogo) — l'arte mappa "place" come luogo di osservazione (etichetta), non come coordinata visiva; il cielo resta una costellazione di momenti. Nessun cambio proiezione. Deviazione chiusa con decisione.
