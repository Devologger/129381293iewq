-- Run through Supabase migrations as the database owner. No plaintext secrets.
create table public.integration_secrets (
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (name in ('TRADE_AI_KEY','TEAM_REMOTE_KEY','GROQ_API_KEY','NINE_ROUTER_KEY','DISCORD_PUBLIC_KEY','DISCORD_WEBHOOK_URL','BINANCE_DEMO_API_KEY','BINANCE_DEMO_API_SECRET','BINANCE_LIVE_API_KEY','BINANCE_LIVE_API_SECRET')),
 ciphertext text not null check (length(ciphertext) < 10000),
 updated_at timestamptz not null default now(),
 primary key(user_id,name)
);
alter table public.integration_secrets enable row level security;
-- No user-facing policies: only the private server service role can read ciphertext.
revoke all on public.integration_secrets from anon, authenticated;
grant all on public.integration_secrets to service_role;
create table public.subscriptions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 customer_id text unique not null,
 subscription_id text unique,
 status text not null default 'inactive',
 price_id text,
 subscription_created bigint not null default 0,
 event_created bigint not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon,authenticated;
grant all on public.subscriptions to service_role;
create table public.billing_events(id text primary key,created bigint not null);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon,authenticated;
grant all on public.billing_events to service_role;
-- One transaction makes event handling idempotent. The server fetches the current
-- subscription from Stripe before calling this function; old deliveries cannot
-- overwrite a more recent event.
create function public.apply_subscription_event(p_event text,p_created bigint,p_user uuid,p_customer text,p_subscription text,p_status text,p_price text,p_subscription_created bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.billing_events values(p_event,p_created) on conflict do nothing;
 if not found then return; end if;
 insert into public.subscriptions(user_id,customer_id,subscription_id,status,price_id,event_created,subscription_created)
 values(p_user,p_customer,p_subscription,p_status,p_price,p_created,p_subscription_created)
 on conflict(user_id) do update set customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,status=excluded.status,price_id=excluded.price_id,event_created=excluded.event_created,subscription_created=excluded.subscription_created,updated_at=now()
 where public.subscriptions.customer_id=excluded.customer_id and public.subscriptions.event_created <= excluded.event_created and public.subscriptions.subscription_created <= excluded.subscription_created;
end $$;
revoke all on function public.apply_subscription_event(text,bigint,uuid,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.apply_subscription_event(text,bigint,uuid,text,text,text,text,bigint) to service_role;
