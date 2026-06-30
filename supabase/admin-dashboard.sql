create extension if not exists pgcrypto;

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

revoke execute on function public.get_sales_tl_submissions_for_admin(text, int) from public;
grant execute on function public.get_sales_tl_submissions_for_admin(text, int) to anon;
