-- Stelle online nelle ultime 24 ore: campione anonimo per il cielo storico.
-- Espone SOLO hash, emozione, confidenza e timestamp. Mai age_band né geo.

create or replace function public.get_recent_stars(
  p_limit int default 200,
  p_max_age_days int default 1
)
returns table (
  hash text,
  emotion text,
  confidence double precision,
  ts timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select hash, emotion, confidence, ts
  from public.stars
  where ts > now() - make_interval(days => p_max_age_days)
  order by random()
  limit p_limit;
$$;

-- Accesso solo via funzione: niente query dirette sulla tabella.
revoke all on table public.stars from anon, authenticated;
revoke all on function public.get_recent_stars from anon, authenticated;
grant execute on function public.get_recent_stars to anon, authenticated;
