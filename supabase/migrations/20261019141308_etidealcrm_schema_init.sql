create schema if not exists etidealcrm;

comment on schema etidealcrm is 'Dedicated subsection for the etidealcrm app. Do not mix with etideal (quotes) or public (univolt/transfr).';

create type etidealcrm.organization_status as enum ('prospect', 'active', 'inactive');
create type etidealcrm.contact_status as enum ('active', 'inactive');
create type etidealcrm.lead_status as enum ('new', 'contacted', 'qualified', 'unqualified', 'converted');
create type etidealcrm.deal_status as enum ('open', 'won', 'lost');
create type etidealcrm.activity_type as enum ('call', 'email', 'meeting', 'task', 'note');

create or replace function etidealcrm.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table etidealcrm.organizations (
  id bigint generated always as identity primary key,
  name text not null,
  vat_number text,
  industry text,
  website text,
  email text,
  phone text,
  address_line text,
  city text,
  province text,
  postal_code text,
  country text not null default 'IT',
  status etidealcrm.organization_status not null default 'prospect',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (length(trim(name)) > 0)
);

create table etidealcrm.pipeline_stages (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order integer not null,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  constraint pipeline_stages_name_not_blank check (length(trim(name)) > 0),
  constraint pipeline_stages_outcome_exclusive check (not (is_won and is_lost))
);

create table etidealcrm.contacts (
  id bigint generated always as identity primary key,
  organization_id bigint references etidealcrm.organizations (id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  job_title text,
  status etidealcrm.contact_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_first_name_not_blank check (length(trim(first_name)) > 0),
  constraint contacts_last_name_not_blank check (length(trim(last_name)) > 0)
);

create table etidealcrm.leads (
  id bigint generated always as identity primary key,
  organization_id bigint references etidealcrm.organizations (id) on delete set null,
  contact_id bigint references etidealcrm.contacts (id) on delete set null,
  title text not null,
  company_name text,
  email text,
  phone text,
  source text,
  status etidealcrm.lead_status not null default 'new',
  estimated_value numeric(12, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_title_not_blank check (length(trim(title)) > 0),
  constraint leads_estimated_value_nonneg check (estimated_value is null or estimated_value >= 0)
);

create table etidealcrm.deals (
  id bigint generated always as identity primary key,
  organization_id bigint references etidealcrm.organizations (id) on delete set null,
  contact_id bigint references etidealcrm.contacts (id) on delete set null,
  lead_id bigint references etidealcrm.leads (id) on delete set null,
  stage_id bigint not null references etidealcrm.pipeline_stages (id),
  title text not null,
  amount numeric(12, 2),
  currency text not null default 'EUR',
  status etidealcrm.deal_status not null default 'open',
  expected_close_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_title_not_blank check (length(trim(title)) > 0),
  constraint deals_amount_nonneg check (amount is null or amount >= 0)
);

create table etidealcrm.activities (
  id bigint generated always as identity primary key,
  organization_id bigint references etidealcrm.organizations (id) on delete cascade,
  contact_id bigint references etidealcrm.contacts (id) on delete cascade,
  lead_id bigint references etidealcrm.leads (id) on delete cascade,
  deal_id bigint references etidealcrm.deals (id) on delete cascade,
  type etidealcrm.activity_type not null,
  subject text not null,
  body text,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_subject_not_blank check (length(trim(subject)) > 0),
  constraint activities_has_parent check (
    organization_id is not null
    or contact_id is not null
    or lead_id is not null
    or deal_id is not null
  )
);

create table etidealcrm.notes (
  id bigint generated always as identity primary key,
  organization_id bigint references etidealcrm.organizations (id) on delete cascade,
  contact_id bigint references etidealcrm.contacts (id) on delete cascade,
  lead_id bigint references etidealcrm.leads (id) on delete cascade,
  deal_id bigint references etidealcrm.deals (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_body_not_blank check (length(trim(body)) > 0),
  constraint notes_has_parent check (
    organization_id is not null
    or contact_id is not null
    or lead_id is not null
    or deal_id is not null
  )
);

create index organizations_status_idx on etidealcrm.organizations (status);
create index organizations_name_idx on etidealcrm.organizations (name);
create index pipeline_stages_sort_order_idx on etidealcrm.pipeline_stages (sort_order);
create index contacts_organization_id_idx on etidealcrm.contacts (organization_id);
create index contacts_email_idx on etidealcrm.contacts (email);
create index contacts_status_idx on etidealcrm.contacts (status);
create index leads_organization_id_idx on etidealcrm.leads (organization_id);
create index leads_contact_id_idx on etidealcrm.leads (contact_id);
create index leads_status_idx on etidealcrm.leads (status);
create index deals_organization_id_idx on etidealcrm.deals (organization_id);
create index deals_contact_id_idx on etidealcrm.deals (contact_id);
create index deals_lead_id_idx on etidealcrm.deals (lead_id);
create index deals_stage_id_idx on etidealcrm.deals (stage_id);
create index deals_status_idx on etidealcrm.deals (status);
create index deals_open_expected_close_idx on etidealcrm.deals (expected_close_date) where status = 'open';
create index activities_organization_id_idx on etidealcrm.activities (organization_id);
create index activities_contact_id_idx on etidealcrm.activities (contact_id);
create index activities_lead_id_idx on etidealcrm.activities (lead_id);
create index activities_deal_id_idx on etidealcrm.activities (deal_id);
create index activities_type_idx on etidealcrm.activities (type);
create index activities_due_at_idx on etidealcrm.activities (due_at);
create index notes_organization_id_idx on etidealcrm.notes (organization_id);
create index notes_contact_id_idx on etidealcrm.notes (contact_id);
create index notes_lead_id_idx on etidealcrm.notes (lead_id);
create index notes_deal_id_idx on etidealcrm.notes (deal_id);

create trigger organizations_set_updated_at
  before update on etidealcrm.organizations
  for each row execute function etidealcrm.set_updated_at();

create trigger contacts_set_updated_at
  before update on etidealcrm.contacts
  for each row execute function etidealcrm.set_updated_at();

create trigger leads_set_updated_at
  before update on etidealcrm.leads
  for each row execute function etidealcrm.set_updated_at();

create trigger deals_set_updated_at
  before update on etidealcrm.deals
  for each row execute function etidealcrm.set_updated_at();

create trigger activities_set_updated_at
  before update on etidealcrm.activities
  for each row execute function etidealcrm.set_updated_at();

create trigger notes_set_updated_at
  before update on etidealcrm.notes
  for each row execute function etidealcrm.set_updated_at();

alter table etidealcrm.organizations enable row level security;
alter table etidealcrm.pipeline_stages enable row level security;
alter table etidealcrm.contacts enable row level security;
alter table etidealcrm.leads enable row level security;
alter table etidealcrm.deals enable row level security;
alter table etidealcrm.activities enable row level security;
alter table etidealcrm.notes enable row level security;

create policy organizations_authenticated_all on etidealcrm.organizations
  for all to authenticated using (true) with check (true);
create policy pipeline_stages_authenticated_all on etidealcrm.pipeline_stages
  for all to authenticated using (true) with check (true);
create policy contacts_authenticated_all on etidealcrm.contacts
  for all to authenticated using (true) with check (true);
create policy leads_authenticated_all on etidealcrm.leads
  for all to authenticated using (true) with check (true);
create policy deals_authenticated_all on etidealcrm.deals
  for all to authenticated using (true) with check (true);
create policy activities_authenticated_all on etidealcrm.activities
  for all to authenticated using (true) with check (true);
create policy notes_authenticated_all on etidealcrm.notes
  for all to authenticated using (true) with check (true);

grant usage on schema etidealcrm to anon, authenticated, service_role;

grant usage on type etidealcrm.organization_status to anon, authenticated, service_role;
grant usage on type etidealcrm.contact_status to anon, authenticated, service_role;
grant usage on type etidealcrm.lead_status to anon, authenticated, service_role;
grant usage on type etidealcrm.deal_status to anon, authenticated, service_role;
grant usage on type etidealcrm.activity_type to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema etidealcrm to authenticated, service_role;
grant all on all sequences in schema etidealcrm to authenticated, service_role;
grant all on all routines in schema etidealcrm to authenticated, service_role;

alter default privileges for role postgres in schema etidealcrm
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges for role postgres in schema etidealcrm
  grant all on sequences to authenticated, service_role;
alter default privileges for role postgres in schema etidealcrm
  grant all on routines to authenticated, service_role;

alter role authenticator set pgrst.db_schemas = 'public, etideal, etidealcrm';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
