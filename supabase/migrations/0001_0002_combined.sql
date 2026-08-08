-- Constellations of the Present - retention setup (0001+0002) --
-- W3: Technical retention layer (no user-facing flag).
-- Anonymous moment seed retention only. The nonce/code are never stored.

create table if not exists public.stars (
  hash text not null,
  ts timestamptz not null default now(),
  emotion text not null,
  confidence real not null,
  age_band text null,
  geo_optin boolean not null default false,
  constraint stars_confidence_range check (confidence >= 0 and confidence <= 1),
  constraint stars_hash_format check (hash ~ '^[0-9a-f]{64}$'),
  constraint stars_emotion_check check (emotion in ('joy', 'calm', 'sadness', 'anger', 'surprise', 'neutral')),
  constraint stars_age_band_length check (age_band is null or (length(age_band) between 1 and 16))
);

create index if not exists stars_ts_idx on public.stars (ts);
create index if not exists stars_emotion_idx on public.stars (emotion);

create or replace function public.log_star(
  p_hash text,
  p_emotion text,
  p_confidence real,
  p_age_band text default null,
  p_geo_optin boolean default false,
  p_ts timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid hash';
  end if;
  if p_confidence < 0 or p_confidence > 1 then
    raise exception 'invalid confidence';
  end if;
  if p_emotion !~ '^(joy|calm|sadness|anger|surprise|neutral)$' then
    raise exception 'invalid emotion';
  end if;
  if p_age_band is not null and (length(p_age_band) < 1 or length(p_age_band) > 16) then
    raise exception 'invalid age band';
  end if;
  if p_ts is not null and (p_ts > now() + interval '5 minutes' or p_ts < now() - interval '1 day') then
    raise exception 'invalid timestamp';
  end if;
  if (select count(*) from public.stars where ts > now() - interval '5 seconds') >= 20 then
    raise exception 'rate limit exceeded';
  end if;
  insert into public.stars (hash, ts, emotion, confidence, age_band, geo_optin)
  values (p_hash, coalesce(p_ts, now()), p_emotion, p_confidence, p_age_band, p_geo_optin);
end;
$$;

revoke all on table public.stars from anon, authenticated;
revoke all on function public.log_star(text, text, real, text, boolean, timestamptz) from anon, authenticated;
grant execute on function public.log_star(text, text, real, text, boolean, timestamptz) to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- ==== 0002 ==== --
-- W6: Fix retention layer.
-- 1) Rate limit per-hash (non più globale): ogni momento-hash può loggare un
--    massimo di N seed in finestra, così più visitatori simultanei (es. mostra)
--    non si bloccano a vicenda. Resta una soglia globale alta come tetto anti-flood.
-- 2) Purge automatico dei dati vecchi via pg_cron (i log oltre la retention
--    dichiarata vengono eliminati periodicamente).

create extension if not exists pg_cron;

-- Soglie: per-hash 10 seed/5s (un client può generare più stati quantizzati ma
-- il gate client è già >=5s); globale 2000/5s (tetto anti-flood, non collo di
-- bottiglia per una folla reale).
create or replace function public.log_star(
  p_hash text,
  p_emotion text,
  p_confidence real,
  p_age_band text default null,
  p_geo_optin boolean default false,
  p_ts timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := now() - interval '5 seconds';
begin
  if p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid hash';
  end if;
  if p_confidence < 0 or p_confidence > 1 then
    raise exception 'invalid confidence';
  end if;
  if p_emotion !~ '^(joy|calm|sadness|anger|surprise|neutral)$' then
    raise exception 'invalid emotion';
  end if;
  if p_age_band is not null and (length(p_age_band) < 1 or length(p_age_band) > 16) then
    raise exception 'invalid age band';
  end if;
  if p_ts is not null and (p_ts > now() + interval '5 minutes' or p_ts < now() - interval '1 day') then
    raise exception 'invalid timestamp';
  end if;
  -- Rate limit per-hash: ogni momento-hash al massimo 10 seed per finestra.
  if (select count(*) from public.stars where hash = p_hash and ts > v_window) >= 10 then
    raise exception 'rate limit exceeded for hash';
  end if;
  -- Tetto globale anti-flood: 2000 seed/5s.
  if (select count(*) from public.stars where ts > v_window) >= 2000 then
    raise exception 'global rate limit exceeded';
  end if;
  insert into public.stars (hash, ts, emotion, confidence, age_band, geo_optin)
  values (p_hash, coalesce(p_ts, now()), p_emotion, p_confidence, p_age_band, p_geo_optin);
end;
$$;

revoke all on table public.stars from anon, authenticated;
revoke all on function public.log_star(text, text, real, text, boolean, timestamptz) from anon, authenticated;
grant execute on function public.log_star(text, text, real, text, boolean, timestamptz) to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Purge dei dati oltre la retention dichiarata (30 giorni).
-- Eseguito ogni giorno alle 03:30 UTC. Idempotente via DELETE.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'stars-retention-purge') then
    perform cron.unschedule('stars-retention-purge');
  end if;
  perform cron.schedule(
    'stars-retention-purge',
    '30 3 * * *',
    $purge$
      delete from public.stars where ts < now() - interval '30 days';
    $purge$
  );
end;
$$;
