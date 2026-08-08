# Plan: W2 — Realtime Shared Sky (Presence-only)

Task: cielo condiviso in tempo reale. Due browser che aprono la stessa pagina vedono le stelle effimere l'uno dell'altro; si formano connessioni solo tra chi è online nello stesso istante. In rete viaggiano SOLO moment-hash anonimi (bucket quantizzati). Nessuna UI di persistenza visibile; degrado grazioso senza rete.

## Architettura (approvata: Opzione A — Presence-only)
La stella di un client è il suo stato di **presence** su un canale Realtime pubblico `sky`: join/leave/update automatici, "solo presenti" per costruzione, nessuna tabella in W2 (la retention `stars` resta W3, senza toccare l'interfaccia `StarChannel`).

## File to change
- `package.json` — add `@supabase/supabase-js`
- `.env.example` (nuovo) — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `src/net/StarChannel.ts` (nuovo) — astrazione canale + factory + implementazioni
- `src/net/StarChannel.test.ts` (nuovo)
- `src/sky/remotePosition.ts` (nuovo, puro) — hash→posizione sferica deterministica
- `src/sky/presence.ts` (nuovo, puro) — heartbeat + prune TTL
- `src/sky/connections.ts` (nuovo, puro) — linee tra stelle live (cap K, maxDist)
- `src/sky/remotePosition.test.ts`, `presence.test.ts`, `connections.test.ts` (nuovi)
- `src/sky/scene.ts` — refactor: helper stella singola riusabile, pool stelle remote (Map<hash, mesh>), LineSegments connessioni, materiali condivisi per bucket emozione
- `src/main.ts` — glue: factory canale → gate di publish → set stelle remote; overlay UX (contatore presenti, pallino connessione)
- `index.html` / `src/style.css` — stato connessione + contatore sobrio

## Step-by-Step Tasks

### 1. Astrazione rete + moduli puri (TDD)
1. `StarChannel` interface: `onStars(cb)`, `publish(star)`, `dispose()`; payload minimo `{ id, hash, emotion, confidence, birthTime }` (id = `crypto.randomUUID()` per sessione, MAI l'hash come id).
2. `createSupabaseChannel(url, key)` — `createClient`, `channel('sky')`, `presence.track(...)`, `presence.onSync` → snapshot+join/leave/update; `untrack` su `beforeunload` (best-effort).
3. `createNoopChannel()` e `createBroadcastChannel()` (dev multi-tab, zero credenziali); factory `createStarChannel(env)` sceglie in base a env presenti.
4. Moduli puri: `remotePosition.ts` (PRNG seedato da prime 8 byte hash → angoli sferici → raggio ~3.2), `presence.ts` (`applyHeartbeat`, `prune(now, ttl)`), `connections.ts` (`buildLines(stars, maxDist, k)`).
5. Test unitari (vitest): determinismo posizione (stesso hash→stessa pos, hash diversi→pos diverse, su sfera), heartbeat/update/prune TTL, connessioni (cap K, maxDist, solo stelle live), StarChannel con `FakeStarChannel` in-memory.

### 2. Scene: stelle remote + connessioni
1. Refactor `scene.ts`: estrarre renderer stella singola riusabile (locale+remota); pool di mesh `Map<hash, {star, glow}>` con **6 materiali condivisi per bucket** (star+glow).
2. API `SkyHandles`: `setStar` (propria), `setRemoteStars(map)`, `removeRemote(hash)`, update pruna stelle remote in `update(now)` con fade-out.
3. `THREE.LineSegments` + `LineBasicMaterial` trasparente, `AdditiveBlending`, colore `#8fa0d8`, opacity `(1 - d/maxDist)`, cap **K=4** vicini, **maxDist ≈ 2.5**; linee solo tra stelle live.
4. Anti-narcisismo: la propria stella partecipa come le altre; sottile anello discreto per identificarla (non più luminosa).
5. Congelamento posizione al primo arrivo (l'emozione cambia seed → niente salto).

### 3. Glue + UX
1. `main.ts`: `createStarChannel(env)`; gate di publish (solo su cambio stato quantizzato, min ~5s); feed remote stars in scena.
2. Overlay: contatore `N stelle presenti` (mono, accanto a #status, omesso a 0) + pallino connessione 6px (verde/neutro/off).
3. Degrado grazioso: senza credenziali o rete → `NoopChannel`/`BroadcastChannel`, cielo locale (W1 invariato), zero log.

### 4. Milestone due-tab (dev)
1. Con `BroadcastChannel` (senza credenziali): due tab → stesso cielo, stelle reciproche, linee tra presenti, rimozione a TTL/chiusura.
2. Con Supabase (se credenziali presenti): stessa verifica tra due browser.

## Validation Commands
- `npm run typecheck`
- `npm test` (nuovi test verdi + 14 esistenti)
- `npm run build`
- Manuale: due tab dev → stesso cielo; chiusura tab → stella sparisce; senza env → solo cielo locale.

## Non-goals (in questo task)
- Tabella Postgres `stars`/retention (W3).
- Playwright E2E due-browser: rimandato a W4 (scopo e deps qui minimi).
- Suono ambientale reattivo, mobile/polish (W4).
- Qualsiasi UI di persistenza visibile all'utente.

## Accept
- Due browser vedono la stessa stella nella stessa posizione (deterministico da hash).
- Connessioni solo tra stelle live; cap K e maxDist rispettati.
- Payload trasmesso = solo campi anonimi quantizzati; id sessione non-derivabile da hash.
- `typecheck` + `test` + `build` verdi; dev due-tab funzionante.
