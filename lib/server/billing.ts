import {createHmac,timingSafeEqual} from 'node:crypto';
import {hostedEnabled,hostedUuid,supabase} from './hosted.ts';
export const billingConfigured=()=>hostedEnabled()&&Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PRICE_ID&&process.env.STRIPE_WEBHOOK_SECRET);
export async function stripe(path:string,body?:Record<string,string>,fetcher:typeof fetch=fetch,idempotencyKey?:string){
 const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error('Billing is not configured');
 const response=await fetcher('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{}),...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:body?new URLSearchParams(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)throw new Error('Billing service unavailable. No subscription was activated.');return response.json();
}
export async function subscription(id:string){const rows=await supabase('/rest/v1/subscriptions?user_id=eq.'+hostedUuid(id)+'&select=status,customer_id,subscription_id,price_id,access_until',{},true);return rows[0]||null;}
export async function billingStatus(id:string){
 if(!billingConfigured())return {configured:false,status:'not_configured',active:false,expiresAt:null as number|null};
 const row=await subscription(id),expires=Number(row?.access_until),validPeriod=Number.isSafeInteger(expires)&&expires>Date.now()/1000;
 const priceMatches=row?.price_id===process.env.STRIPE_PRICE_ID;
 const status=row?.status==='active'&&!priceMatches?'plan_mismatch':row?.status==='active'&&!validPeriod?'awaiting_renewal_verification':row?.status||'inactive';
 return {configured:true,status,active:status==='active'&&priceMatches&&validPeriod,expiresAt:validPeriod?expires*1000:null};
}
export async function requireTradingPlan(id:string){if(hostedEnabled()){const user=await supabase('/auth/v1/admin/users/'+hostedUuid(id),{},true);if(user.banned_until&&Date.parse(user.banned_until)>Date.now())throw new Error('Account access is suspended; new entries are disabled');}if(process.env.PENGUIN_REQUIRE_SUBSCRIPTION==='1'&&!(await billingStatus(id)).active)throw new Error('An active subscription is required to start new demo entries. Position protection and closing remain available.');}
export function verifyStripeSignature(body:string,header:string,secret:string,now=Date.now()){
 const parts=header.split(','),timestamp=parts.find(v=>v.startsWith('t='))?.slice(2),signatures=parts.filter(v=>v.startsWith('v1=')).map(v=>v.slice(3));
 if(!timestamp||!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)throw new Error('Invalid webhook timestamp');
 const expected=createHmac('sha256',secret).update(timestamp+'.'+body).digest();
 if(!signatures.some(sig=>/^[a-f\d]{64}$/.test(sig)&&timingSafeEqual(expected,Buffer.from(sig,'hex'))))throw new Error('Invalid webhook signature');
}
export async function applyBillingEvent(event:{id:string;created:number;type:string;data:{object:{id:string}}},fetcher:typeof fetch=fetch){
 if(!/^evt_[A-Za-z0-9]+$/.test(event.id)||!Number.isSafeInteger(event.created))throw new Error('Invalid event');
 if(!['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type))return;
 const id=event.data.object.id;if(!/^sub_[A-Za-z0-9]+$/.test(id))throw new Error('Invalid subscription');
 // Fetch authoritative current state rather than trusting stale event payloads.
 const current=await stripe('subscriptions/'+id,undefined,fetcher),user=current.metadata?.penguin_user;
 if(typeof user!=='string'||!/^([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/.test(user))throw new Error('Subscription is not linked to a Penguin account');
 const price=current.items?.data?.length===1?current.items.data[0]?.price?.id:null;
 await supabase('/rest/v1/rpc/apply_subscription_event',{method:'POST',body:JSON.stringify({p_event:event.id,p_created:event.created,p_user:user,p_customer:current.customer,p_subscription:id,p_status:current.status,p_price:price||'',p_subscription_created:current.created,p_access_until:Number.isSafeInteger(current.items?.data?.[0]?.current_period_end)?current.items.data[0].current_period_end:Number.isSafeInteger(current.current_period_end)?current.current_period_end:0})},true,fetcher);
}
