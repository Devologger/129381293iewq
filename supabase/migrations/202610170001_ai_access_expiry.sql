-- Apply after 202610160001_hosted.sql. Old active rows fail closed until refreshed
-- by a verified Stripe subscription event carrying the current paid period.
alter table public.subscriptions add column access_until bigint not null default 0;
drop function public.apply_subscription_event(text,bigint,uuid,text,text,text,text,bigint);
create function public.apply_subscription_event(p_event text,p_created bigint,p_user uuid,p_customer text,p_subscription text,p_status text,p_price text,p_subscription_created bigint,p_access_until bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.billing_events values(p_event,p_created) on conflict do nothing;
 if not found then return; end if;
 insert into public.subscriptions(user_id,customer_id,subscription_id,status,price_id,event_created,subscription_created,access_until)
 values(p_user,p_customer,p_subscription,p_status,p_price,p_created,p_subscription_created,p_access_until)
 on conflict(user_id) do update set customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,status=excluded.status,price_id=excluded.price_id,event_created=excluded.event_created,subscription_created=excluded.subscription_created,access_until=excluded.access_until,updated_at=now()
 where public.subscriptions.customer_id=excluded.customer_id and public.subscriptions.event_created <= excluded.event_created and public.subscriptions.subscription_created <= excluded.subscription_created;
end $$;
revoke all on function public.apply_subscription_event(text,bigint,uuid,text,text,text,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.apply_subscription_event(text,bigint,uuid,text,text,text,text,bigint,bigint) to service_role;
