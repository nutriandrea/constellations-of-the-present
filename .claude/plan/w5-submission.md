# W5 — Submission package (ISEA2026)

> Stato: **completata per la parte eseguibile senza credenziali.** Restano azioni bloccate da input utente: deploy Vercel (login), invio email organizzatori, conferma finale.

## Obiettivo
Produrre il pacchetto di candidatura per ISEA2026 Digital Arts Student Competition (tema *ELYAH — Constellating Place, Data, Identity*, scadenza 2026-09-13): concept statement ≤250w, bio ≤75w + istituzione, portfolio page, URL pubblico del deploy, demo video 30–60s, conferma con gli organizzatori sul formato "interactive web".

## Deliverable prodotti (commit `331cd55` + successivi)
| Deliverable | File | Verifica |
| --- | --- | --- |
| Concept statement | `docs/submission/concept-statement.md` | 237/250 parole |
| Bio | `docs/submission/bio.md` | 66/75 parole |
| Bozza email organizzatori | `docs/submission/organizer-email.md` | pronta da inviare |
| Demo video | `docs/submission/demo-constellations.webm` | 58s, 1280×720 WebM, 2.7MB |
| Portfolio page | `public/portfolio.html` | linkata dall'opera via `#about-link` |
| README tecnico | `README.md` | privacy model + runbook deploy |
| Security headers Vercel | `vercel.json` | testato con build |

## Come è stato fatto il video demo
1. Skill `ui-demo` (Discover → Rehearse → Record): Playwright headless con `--use-fake-device-for-media-stream` (la camera fake rende l'app "Cielo aperto" con stella locale).
2. Scoperta chiave: con camera fake l'espressione non cambia mai, quindi il gate publish (5s) sopprime l'unico moment-hash per tab → nessuna stella incrociata reale tra tab.
3. Soluzione: i "visitatori online" sono simulati postando sul canale `copt-sky` i messaggi `RemoteStar` che l'app già valida con `isValidRemoteStar` (id, hash hex64, emotion whitelist, confidence range). Refresh periodico ~7s per modellare utenti che restano (TTL 10s).
4. Flusso mostrato: apertura cielo → stella locale + moment-hash → 3 stelle remote online → connessioni → toggle suono ambientale (opt-in) → portfolio page. Sottotitoli inglesi iniettati.
5. Verifica frame: PNG estratti 1280×720 non neri (175–190KB), valori pixel coerenti con cielo scuro + contenuto.

## Decisioni
- **Portfolio come pagina statica** in `public/` (nessun routing aggiuntivo): al deploy sarà `/portfolio.html`.
- **Deploy**: repo GitHub pubblico creato e pushato. Vercel CLI installata ma **non autenticata** → il deploy richiede `vercel login` da parte dell'utente.
- **Supabase**: nessun `.env` reale → deploy senza credenziali userà BroadcastChannel (multi-tab same-origin). Sincronizzazione cross-device solo con credenziali.

## Rimasto (bloccato)
- [ ] `vercel login` + deploy (richiede input utente)
- [ ] Variabili Supabase su Vercel (opzionali)
- [ ] Invio email organizzatori (bozza pronta)
- [ ] `npm audit` prima del deploy (rischio residuo W4)
- [ ] Conferma finale contenuti personali nel form di submission
