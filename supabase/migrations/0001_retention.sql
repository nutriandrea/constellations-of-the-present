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
