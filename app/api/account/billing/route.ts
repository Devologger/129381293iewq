import {db} from '@/lib/server/store';
import {randomUUID} from 'node:crypto';
import {withAccount} from '@/lib/server/accounts';
import {currentAccount} from '@/lib/server/account-context';
import {hostedUuid} from '@/lib/server/hosted';
import {billingConfigured,billingStatus,subscription,stripe} from '@/lib/server/billing';
import {sameOrigin} from '@/lib/server/session';
export const runtime='nodejs';
export const GET=withAccount(async()=>{const account=currentAccount();if(!account)return Response.json({configured:false,status:'sign_in_required'});try{return Response.json(await billingStatus(account.id),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Billing status unavailable'},{status:503});}});
export const POST=withAccount(async(request:Request)=>{
 try{sameOrigin(request);}catch{return Response.json({error:'Same-origin access required'},{status:403});}
 try{
  const account=currentAccount();if(!account||!billingConfigured())throw new Error('Hosted billing is not configured');
  const origin=process.env.TERMINAL_PUBLIC_ORIGIN;if(!origin||new URL(origin).protocol!=='https:')throw new Error('Configure the public HTTPS origin');
  const text=await request.text();if(text.length>1000)throw new Error('Payload too large');const data=JSON.parse(text),row=await subscription(account.id);
  if(data.action==='portal'){if(!row?.customer_id)throw new Error('No subscription account exists yet');const session=await stripe('billing_portal/sessions',{customer:row.customer_id,return_url:origin+'/account'});return Response.json({url:session.url});}
  if(data.action!=='checkout')throw new Error('Unsupported billing action');
  if(row?.subscription_id&&['active','trialing','past_due','unpaid','incomplete','paused'].includes(row.status))throw new Error('Manage your existing subscription in the billing portal');
  db().exec('CREATE TABLE IF NOT EXISTS billing_checkout(id INTEGER PRIMARY KEY CHECK(id=1),nonce TEXT NOT NULL,expires INTEGER NOT NULL)');
  db().prepare('INSERT INTO billing_checkout VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET nonce=excluded.nonce,expires=excluded.expires WHERE billing_checkout.expires<?').run(randomUUID(),Date.now()+3600000,Date.now());
  const checkout=(db().prepare('SELECT nonce,expires FROM billing_checkout WHERE id=1').get() as {nonce:string;expires:number}),nonce=checkout.nonce;
  const user=hostedUuid(account.id),session=await stripe('checkout/sessions',{mode:'subscription',expires_at:String(Math.floor(checkout.expires/1000)),'line_items[0][price]':process.env.STRIPE_PRICE_ID!,'line_items[0][quantity]':'1',client_reference_id:user,'subscription_data[metadata][penguin_user]':user,success_url:origin+'/account?billing=returned',cancel_url:origin+'/account',...(row?.customer_id?{customer:row.customer_id}:{customer_email:account.email})},fetch,'penguin:'+account.id+':'+nonce);
  return Response.json({url:session.url});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Billing unavailable'},{status:400});}
});
