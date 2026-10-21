-- EliteInfotec personal CRM: schema + row-level security.
-- Every row carries user_id = auth.uid(); policies only let that user see or change it.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_name text not null check (length(trim(company_name)) > 0),
  contact_person text, job_title text,
  email text, email_normalized text,
  phone text, website text, linkedin_url text,
  country text, industry text, source text,
  rating text not null default 'Cold' check (rating in ('Hot','Warm','Cold')),
  status text not null default 'New' check (status in
    ('New','To Contact','Contacted','Interested','Follow-up','Proposal Sent','Won','Lost','Not Interested')),
  service_interest text check (service_interest is null or service_interest in
    ('Web Development','Website Design','WordPress','Shopify','SEO','Mobile App','AI Automation','Other')),
  notes text, promising_reason text,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_user_rating on public.leads(user_id, rating);
create index leads_user_status on public.leads(user_id, status);
create index leads_user_email on public.leads(user_id, email_normalized) where email_normalized is not null;

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  due_at timestamptz not null,                       -- any date and time chosen manually
  method text not null check (method in ('Email','WhatsApp','Phone','LinkedIn','Other')),
  next_action text, notes text,
  completed_at timestamptz,                          -- null = still pending
  created_at timestamptz not null default now()
);
create index follow_ups_pending on public.follow_ups(user_id, due_at) where completed_at is null;

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null check (type in ('Note','Email','WhatsApp','Phone','LinkedIn','Other',
    'Status change','Rating change','Follow-up scheduled','Follow-up completed','Converted','Imported')),
  summary text not null,
  details text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index activities_lead_time on public.activities(lead_id, occurred_at desc);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid unique references public.leads(id) on delete set null,  -- notes + history stay on the lead
  company_name text not null, contact_person text, job_title text,
  email text, phone text, website text, linkedin_url text,
  country text, industry text, service_interest text, notes text,
  converted_at timestamptz not null default now()
);

-- Keep updated_at and the lowercase email used for duplicate detection current.
create function public.leads_before_write() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.email_normalized := nullif(lower(trim(new.email)), '');
  return new;
end $$;
create trigger leads_before_write before insert or update on public.leads
  for each row execute function public.leads_before_write();

-- Row-level security: owner-only on every table.
do $$
declare t text;
begin
  foreach t in array array['leads','follow_ups','activities','clients'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s owner select" on public.%1$I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy "%1$s owner insert" on public.%1$I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s owner update" on public.%1$I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s owner delete" on public.%1$I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

-- Atomic Won -> client conversion. SECURITY INVOKER, so RLS still applies.
-- The lead row (notes, activities, follow-ups) is kept; the client links back to it.
create function public.convert_lead_to_client(p_lead_id uuid) returns uuid
language plpgsql security invoker as $$
declare l public.leads; c uuid;
begin
  select * into l from public.leads where id = p_lead_id;
  if not found then raise exception 'Lead not found'; end if;
  select id into c from public.clients where lead_id = p_lead_id;
  if c is not null then return c; end if;   -- already converted
  insert into public.clients(lead_id, company_name, contact_person, job_title, email, phone, website,
      linkedin_url, country, industry, service_interest, notes)
    values (l.id, l.company_name, l.contact_person, l.job_title, l.email, l.phone, l.website,
      l.linkedin_url, l.country, l.industry, l.service_interest, l.notes)
    returning id into c;
  update public.leads set status = 'Won' where id = p_lead_id;
  update public.follow_ups set completed_at = now() where lead_id = p_lead_id and completed_at is null;
  insert into public.activities(lead_id, type, summary) values (p_lead_id, 'Converted', 'Converted to client');
  return c;
end $$;
revoke all on function public.convert_lead_to_client(uuid) from public, anon;
grant execute on function public.convert_lead_to_client(uuid) to authenticated;
