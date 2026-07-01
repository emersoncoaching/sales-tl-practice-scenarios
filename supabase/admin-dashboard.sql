create extension if not exists pgcrypto;

alter table public.sales_tl_scenario_submissions
  add column if not exists review_status text not null default 'open';

alter table public.sales_tl_scenario_submissions
  add column if not exists reviewed_at timestamptz;

update public.sales_tl_scenario_submissions
set review_status = 'open'
where review_status is null;

alter table public.sales_tl_scenario_submissions
  alter column review_status set default 'open';

alter table public.sales_tl_scenario_submissions
  alter column review_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_tl_scenario_submissions_review_status_check'
  ) then
    alter table public.sales_tl_scenario_submissions
      add constraint sales_tl_scenario_submissions_review_status_check
      check (review_status in ('open', 'accepted', 'rejected'));
  end if;
end;
$$;

drop function if exists public.get_sales_tl_submission_for_review(text);

create or replace function public.get_sales_tl_submission_for_review(
  p_review_token text
)
returns table (
  candidate_name text,
  candidate_email text,
  starhire_candidate_id text,
  created_at timestamptz,
  responses jsonb,
  scenario_version text,
  review_status text,
  reviewed_at timestamptz
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
    scenario_version,
    review_status,
    reviewed_at
  from public.sales_tl_scenario_submissions
  where review_token = p_review_token
  limit 1;
$$;

drop function if exists public.get_sales_tl_submissions_for_admin(text, int);

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
  review_token text,
  review_status text,
  reviewed_at timestamptz
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
      submissions.review_token,
      submissions.review_status,
      submissions.reviewed_at
    from public.sales_tl_scenario_submissions as submissions
    order by submissions.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

drop function if exists public.set_sales_tl_submission_review_status(text, text);

create or replace function public.set_sales_tl_submission_review_status(
  p_review_token text,
  p_review_status text
)
returns table (
  candidate_name text,
  candidate_email text,
  starhire_candidate_id text,
  created_at timestamptz,
  responses jsonb,
  scenario_version text,
  review_status text,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review_status text := lower(trim(coalesce(p_review_status, '')));
begin
  if v_review_status not in ('open', 'accepted', 'rejected') then
    raise exception 'Review status must be open, accepted, or rejected.';
  end if;

  return query
    update public.sales_tl_scenario_submissions as submissions
    set
      review_status = v_review_status,
      reviewed_at = case when v_review_status = 'open' then null else now() end
    where submissions.review_token = p_review_token
    returning
      submissions.candidate_name,
      submissions.candidate_email,
      submissions.starhire_candidate_id,
      submissions.created_at,
      submissions.responses,
      submissions.scenario_version,
      submissions.review_status,
      submissions.reviewed_at;

  if not found then
    raise exception 'Review response not found.';
  end if;
end;
$$;

revoke execute on function public.get_sales_tl_submission_for_review(text) from public;
revoke execute on function public.get_sales_tl_submissions_for_admin(text, int) from public;
revoke execute on function public.set_sales_tl_submission_review_status(text, text) from public;

grant execute on function public.get_sales_tl_submission_for_review(text) to anon;
grant execute on function public.get_sales_tl_submissions_for_admin(text, int) to anon;
grant execute on function public.set_sales_tl_submission_review_status(text, text) to anon;
