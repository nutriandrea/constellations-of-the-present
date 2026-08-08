# Plan: W3 — Technical Retention Layer (no user-facing flag)

Task: retention tecnica anonima dei momenti. Nessuna UI, nessun dato riconducibile, rate-limit, nonce mai registrato. Wiring runtime differito finché non ci sono credenziali Supabase (Opzione C).

## Architettura (approvata: Opzione C — schema + API pronti, wiring differito)
La retention è un modulo puro + sink che eredita il gate di publish già esistente (≥5s). L'hash registrato è il **seed** (deterministico dallo stato quantizzato, aggregabile per analytics) — **mai** il `code` (contiene nonce) né il nonce grezzo. La tabella `stars` e la RPC `log_star()` vivono in SQL versionato; il client le chiama solo quando `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` sono presenti, altrimenti `noop` (zero rete, zero log).

## File to change
- `supabase/migrations/0001_retention.sql` (nuovo) — tabella `stars` + RPC `log_star()` (SECURITY DEFINER, insert-only, validation, niente update/delete dall'anon)
- `src/retention/retention.ts` (nuovo) — tipi `RetentionRecord`, interfaccia `RetentionSink`, factory `createRetentionSink(env, client?)` → `supabase` | `noop`, gate client-side
- `src/retention/retention.test.ts` (nuovo) — TDD: factory pick, sink supabase (fake client), sink noop, gate rate-limit, record mai con nonce/code
- `src/main.ts` — nel blocco publish esistente, `sink.log(record)` costruito da seed+bucket; `age_band`/`geo_optin` passati da geo; dispose su `beforeunload`

## Step-by-Step Tasks

### 1. SQL (versionato, deployabile in futuro)
1. `supabase/migrations/0001_retention.sql`:
   - `create table public.stars (hash text not null, ts timestamptz not null default now(), emotion text not null, confidence real not null, age_band text null, geo_optin boolean not null default false)`
   - index su `ts` (analytics diurna) + `emotion`.
   - `create function public.log_star(...)` SECURITY DEFINER con `set search_path = public`, `returns void`, INSERT-only, check `confidence between 0 and 1` e `hash ~ '^[0-9a-f]{64}$'`.
   - `revoke` update/delete/truncate su `stars` dall'anon; `grant execute` sulla RPC.
   - Rate-limit server-side per-IP rimandato all'Edge Function (quando credenziali reali, W3→A); qui gate client-side + RPC validante.

### 2. Modulo retention (TDD)
1. `RetentionRecord`: `{ hashSeed: string; emotion: EmotionBucket; confidence: number; ageBand: string | null; geoOptIn: boolean; ts: number }` — niente id sessione, niente nonce.
2. `RetentionSink`: `{ kind: 'supabase' | 'noop'; log(record): void; dispose(): void }`.
3. `createRetentionSink(env, client?)` — con credenziali → sink supabase che chiama `rpc('log_star', {...})`; senza → `noop` (nessun log, zero rete).
4. Gate client-side: `createRetentionGate(minIntervalMs = 5_000)` — wrapper che passa solo se intervallo minimo rispettato (stesso ritmo del publish).
5. Test vitest: pick sink senza credenziali→noop; con credenziali→supabase; noop non tocca il client; rpc chiamata con record mappato; gate blocca/rilascia; record costruito da factory senza nonce/code.

### 3. Glue (main.ts)
1. Inizializzo `sink = createRetentionSink(env)` e gate accanto al publish.
2. In `applyMoment`, recupero il **seed** da `makeMomentHash` (ritorno già `{seed, nonce, code}`) → `sink.log({ hashSeed: moment.seed, emotion, confidence, ageBand: null, geoOptIn: geo.coarse !== 'unknown', ts: Date.now() })` (gated).
3. `beforeunload` → `sink.dispose()`.
4. Zero UI: nessun elemento DOM, nessun log console.

### 4. Validate
1. `npm run typecheck` + `npm test` (nuovi verdi + 38 esistenti).
2. `npm run build`.
3. Manuale: nessuna credenziale → `noop` (nessuna richiesta di rete, app invariata).

## Validation Commands
- `npm run typecheck`
- `npm test`
- `npm run build`
- Manuale: con `.env` assente il cielo funziona identico, zero chiamate di rete extra.

## Non-goals (in questo task)
- Edge Function con rate-limit per-IP (→ W3 quando credenziali reali).
- Qualsiasi UI/visualizzazione della retention.
- Modifica a `StarChannel`/payload rete (la retention non tocca la presenza).
- Seed persistito in forma riconducibile a sessione/device (mai).

## Accept
- Tabella+RPC in SQL versionato; il client logga solo seed+bucket anonimi, gated, mai nonce/code.
- Senza credenziali → zero rete, app invariata; test+typecheck+build verdi.

## Review (2026-08-08) — fix integrati
- H1/H-1: `p_ts` convertito in ISO-8601 (`new Date(record.ts).toISOString()`) — un epoch ms numerico falliva il cast `timestamptz`; budget insert globale nella RPC (max 20 righe/5s) come rate-limit server-side prima di andare live.
- M1: `createRetentionGate(PUBLISH_INTERVAL_MS)` ora usato in `main.ts` (rimosso il timer hand-rolled `5_000`); il gate modulare lascia passare il primo log (baseline voluta), poi solo ogni ≥5s.
- M2/M-1: `emotion` validata server-side (whitelist `joy|calm|sadness|anger|surprise|neutral` nel CHECK + RPC); `age_band` con length cap 1..16.
- M-2: `p_ts` non più fidato ciecamente — guard `now()-1day <= p_ts <= now()+5min` e `coalesce(p_ts, now())`.
- M4: errori RPC tracciati in `DEV` (`.catch` su `Promise.resolve(...)`, PostgREST builder non ha `.catch`).
- S1: fake tipizzato `Pick<SupabaseClient, 'rpc'>`; S2: `createRetentionSink` delega a `pickRetentionKind`.
- M-3 (nota): il seed è unsalted SHA-256 di stato quantizzato → brute-force reversibile verso (emotion, confidence, durata). Accettato: emotion+confidence sono già pubblici via presenza W2; il seed è l'identificatore di una *classe* di momenti (dedup condiviso), non un identificatore unlinkabile. Documentato per la submission.

Stato: 48 test verdi (8 file), `typecheck`+`build` puliti (solo warning chunk three.js noto).
