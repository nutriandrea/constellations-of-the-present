# W4 — Polish (scope completo PRP)

## Obiettivo
Il cielo è funzionale ma "glitchy/brutale". W4 rende l'esperienza visiva curata (stelle luminose, non palline), robusta (camera-degraded, mobile, accessibility) e facoltativamente sonora (mic opt-in). Completa le deviazioni PRP: ESLint, code-splitting three.js, semantica geo.

## Diagnosi tecnica (Fase 1 — fatta)
1. Stelle = **sfere MeshBasic** (0.35) + "glow" = seconda sfera trasparente → palline di plastica; niente AdditiveBlending → non brillano.
2. Flicker `Math.sin(now/220)` = periodo 220ms → tremolio percepito come glitch.
3. Nessuno **starfield di fondo** → cielo vuoto con 1–3 stelle.
4. Connessioni monocolore, `opacity` uniforme su entrambi gli estremi della linea (no fade per vertice).
5. `main.ts` nel ramo stabile chiama `applyMoment` ogni frame → publish/log/position ricalcolati inutilmente (i gate li tamponano ma è spreco).

## Design (Fase 2 — decisioni)
- **A. Render stelle**: `THREE.Sprite` con **texture radiale** (canvas 2D radial-gradient) + `AdditiveBlending`. Un solo sprite per stella (il glow è intrinseco alla texture) → niente più mesh glow separate, look luminoso reale. 61 sprite max (1 own + 60 remote) = perf ok.
- **B. Starfield di fondo**: `THREE.Points` ~1200 punti statici su shell sferica, dimensione variabile, bianchi/neutri, rotazione lentissima (parallasse). Posizioni **deterministiche** (PRNG seedato, testabile).
- **C. Flicker**: funzione pura `breathingFlicker(now, confidence, seed)` — bi-phasica lenta (~1.4s + ~4.7s), ampiezza ∝ confidenza invertita. Niente strobing.
- **D. Connessioni**: opacità per distanza **per vertice** (fade all'estremo lontano); keep additive, più dim.
- **E. Own star**: sprite più grande + anello orbitale sottile (mesh Ring, additive) → riconoscibile ma coerente.
- **F. main.ts**: nel ramo stabile solo `sky.setStar` (aggiorna colori live), niente re-publish/re-log per frame; publish/log solo a cambio di `key`.
- **G. Camera-degraded**: se il landmarker non carica → sky comunque attiva (presence-only: stelle remote visibili, own star assente, status chiaro). Attualmente `main()` fa `return` e il cielo muore.
- **H. Mobile**: pixelRatio cap 2 già ok; `powerPreference: 'high-performance'`.
- **I. Accessibility**: `prefers-reduced-motion` → flicker ~statico, niente rotazione starfield; `role="img"` + aria-live sul canvas; bottoni audio accessibili.
- **J. Audio ambientale opt-in**: pulsante "Attiva suono" (gesto utente → AudioContext), mic → AnalyserNode → RMS live → guadagno di un drone morbido (oscillatori+noise). Mai registrato: solo livello istantaneo. Modulo `src/audio/ambient.ts` con parte pura `mapLevelToGain` testabile.
- **K. Geo**: decisione documentata — posizione stella resta guidata dal moment-hash (identità del momento, non luogo); `coarse` resta etichetta di luogo nello status. Nessun cambio posizione.
- **L. ESLint**: flat config typescript-eslint + script `lint` (chiude deviazione PRP).
- **M. Code-splitting**: `three` importato dinamicamente (`await import('./sky/scene')`) → chunk separato ~672KB (fix deviazione PRP, warning build via).

## File
- `src/sky/flicker.ts` (nuovo, puro) + `flicker.test.ts`
- `src/sky/starfield.ts` (nuovo, puro) + `starfield.test.ts`
- `src/sky/scene.ts` (sprite, starfield, lines per-vertex, reduced-motion)
- `src/audio/ambient.ts` (nuovo) + `ambient.test.ts`
- `src/main.ts` (degraded mode, code-splitting, ramo stabile, toggle audio, reduced-motion)
- `index.html` (pulsante suono, ruolo img)
- `src/style.css` (stile bottone, media reduced-motion)
- `eslint.config.js` (nuovo), `package.json` (lint script)
- `src/geo/geo.ts` (invariato; decisione documentata nel PRP)

## Fasi TDD (checkpoint git a ogni GREEN)
1. **Fase A — grafica core**: RED (flicker.test, starfield.test) → GREEN (flicker.ts, starfield.ts) → integrate in scene.ts (sprite+starfield+lines per-vertex+own star) → commit `feat(w4): sprite starfield + breathing flicker`.
2. **Fase B — robustezza**: camera-degraded in main.ts, ramo stabile senza re-publish, code-splitting `await import`, reduced-motion, a11y DOM/CSS → tsc+build → commit.
3. **Fase C — audio**: RED (ambient.test mapLevelToGain) → GREEN (ambient.ts) → glue pulsante in main.ts/index.html/style.css → commit.
4. **Fase D — infrastruttura**: eslint config + `npm run lint` pulito; aggiorna PRP (W4 DONE, deviazioni chiuse); build finale; commit finale.

## Review (fatta — 2026-08-08)
- **Code review** (range 1de88c5..199d578, 7 commit): 0 CRITICAL/0 HIGH. 5/5 item: 1 PASS; 2 PARTIAL → `breathingFlicker` riscritto per respiro simmetrico attorno a 1 (sinusoidi non rettificate, range ~[0.62,1.38], doc+test aggiornati); 3 → starfield passa a `ShaderMaterial` (attributo `size` per-vertice ora consumato, soft-disk via `gl_PointCoord`, additive). M2: rotazione starfield disattivata con reduced-motion. L1: guardia `starting` in `createAmbientAudio` (no doppio avvio/leak). L2: `id="code"` duplicato → `<span id="code-value">`. L3: status degraded non sovrascritto. L4: `.catch()` su `void main()` + listener `webglcontextlost/restored`. L5: commento tinta neutra linee (scelta di design). L6: allocazioni per frame in `buildLines` — accettato (n≤61). L7: commento mix clock in `applyMoment`.
- **Security review**: 0C/0H/3M/4L. M1: rimosso `analyser.connect(gainNode)` (il mic non raggiunge più gli speaker). M2: try/catch in `start()` (stop tracks + close ctx + rethrow su errore parziale). M3: CSP prod via meta (plugin `inject-csp` in `vite.config.ts`). L4: `isValidRemoteStar` applicato a presence emit + broadcast onmessage. Verifiche richieste tutte PASS (nessun recording, nessun sink XSS, retention W3 intatta).
- XSS/Injection: nessun rischio (solo `textContent`).
- Rischi residui accettati: rate-limit per-IP su `log_star` deferito a Edge Function (budget globale 20/5s ok), reversibilità seed già documentata, `npm audit` prima del deploy.

## Test
- `flicker.test.ts`: determinismo per seed, range [0.3, 1.7], respiro simmetrico attorno a 1, alta confidenza→meno flicker, reduced-motion→~costante.
- `starfield.test.ts`: determinismo layout (stessi seed→stessi punti), conteggio punti, tutti entro raggio.
- `ambient.test.ts`: mapping level→gain monotono, satura a maxGain, zero sotto minLevel.
- Esistenti (48) devono restare verdi; atteso ~55+ test totali.

## Validazione (esito finale)
- `npx tsc --noEmit` pulito; `npm run build` pulito (warning chunk lazy three.js residuo accettato/documented nel PRP); `npm test` verde (62/62, 11 file); `npm run lint` verde.
- CSP verificata in `dist/index.html` (meta `Content-Security-Policy` presente solo nel build di produzione).
