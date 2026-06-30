create extension if not exists pgcrypto;

create table if not exists public.sales_tl_scenario_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  candidate_name text not null check (char_length(candidate_name) between 1 and 200),
  candidate_email text not null check (candidate_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  starhire_candidate_id text,
  scenario_version text not null default '2026-06-v1',
  responses jsonb not null,
  applicant_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  review_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  user_agent text,
  notification_sent_at timestamptz,
  notification_error text
);

alter table public.sales_tl_scenario_submissions enable row level security;

revoke all on public.sales_tl_scenario_submissions from anon, authenticated;

create or replace function public.submit_sales_tl_scenario(
  p_candidate_name text,
  p_candidate_email text,
  p_responses jsonb,
  p_starhire_candidate_id text default null,
  p_user_agent text default null
)
returns table (
  submission_id uuid,
  applicant_token text,
  review_token text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.sales_tl_scenario_submissions;
begin
  if nullif(trim(p_candidate_name), '') is null then
    raise exception 'Name is required.';
  end if;

  if p_candidate_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required.';
  end if;

  if p_responses is null or jsonb_typeof(p_responses) <> 'object' then
    raise exception 'Responses must be a JSON object.';
  end if;

  insert into public.sales_tl_scenario_submissions (
    candidate_name,
    candidate_email,
    starhire_candidate_id,
    responses,
    user_agent
  )
  values (
    trim(p_candidate_name),
    lower(trim(p_candidate_email)),
    nullif(trim(p_starhire_candidate_id), ''),
    p_responses,
    p_user_agent
  )
  returning * into inserted;

  submission_id := inserted.id;
  applicant_token := inserted.applicant_token;
  review_token := inserted.review_token;
  created_at := inserted.created_at;
  return next;
end;
$$;

create or replace function public.get_sales_tl_submission_for_applicant(
  p_applicant_token text
)
returns table (
  candidate_name text,
  created_at timestamptz,
  responses jsonb,
  scenario_version text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    candidate_name,
    created_at,
    responses,
    scenario_version
  from public.sales_tl_scenario_submissions
  where applicant_token = p_applicant_token
  limit 1;
$$;

create or replace function public.get_sales_tl_submission_for_review(
  p_review_token text
)
returns table (
  candidate_name text,
  candidate_email text,
  starhire_candidate_id text,
  created_at timestamptz,
  responses jsonb,
  scenario_version text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    candidate_name,
    candidate_email,
    starhire_candidate_id,
    created_at,
    responses,
    scenario_version
  from public.sales_tl_scenario_submissions
  where review_token = p_review_token
  limit 1;
$$;

create or replace function public.get_sales_tl_submissions_for_admin(
  p_admin_token text,
  p_limit int default 100
)
returns table (
  submission_id uuid,
  candidate_name text,
  candidate_email text,
  starhire_candidate_id text,
  created_at timestamptz,
  responses jsonb,
  scenario_version text,
  applicant_token text,
  review_token text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if encode(extensions.digest(coalesce(p_admin_token, ''), 'sha256'), 'hex') <> '59d1342350ac10f0db054214ea89b17d86b0fb35e6fa109c28e250964d27a850' then
    raise exception 'Invalid admin token.';
  end if;

  return query
    select
      submissions.id as submission_id,
      submissions.candidate_name,
      submissions.candidate_email,
      submissions.starhire_candidate_id,
      submissions.created_at,
      submissions.responses,
      submissions.scenario_version,
      submissions.applicant_token,
      submissions.review_token
    from public.sales_tl_scenario_submissions as submissions
    order by submissions.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke execute on function public.submit_sales_tl_scenario(text, text, jsonb, text, text) from public;
revoke execute on function public.get_sales_tl_submission_for_applicant(text) from public;
revoke execute on function public.get_sales_tl_submission_for_review(text) from public;
revoke execute on function public.get_sales_tl_submissions_for_admin(text, int) from public;

grant execute on function public.submit_sales_tl_scenario(text, text, jsonb, text, text) to anon;
grant execute on function public.get_sales_tl_submission_for_applicant(text) to anon;
grant execute on function public.get_sales_tl_submission_for_review(text) to anon;
grant execute on function public.get_sales_tl_submissions_for_admin(text, int) to anon;
