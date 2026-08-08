-- Hardening: la tabella stars non deve mai essere leggibile/scrivibile via Data API.
-- I privilegi sono già revocati; RLS attiva chiude anche il canale PostgREST
-- e silenzia il warning "RLS disabled in public" del linter.
-- La scrittura avviene solo tramite la funzione security definer public.log_star().

alter table public.stars enable row level security;
