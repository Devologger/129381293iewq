import {withAccount} from '@/lib/server/accounts';
import {isAdmin,ADMIN_EMAIL} from '@/lib/server/admin';
import {billingConfigured} from '@/lib/server/billing';
export const runtime='nodejs';
export const GET=withAccount(async()=>{
 if(!isAdmin())return Response.json({error:'Administrator access required'},{status:403});
 const names=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','PENGUIN_SECRET_MASTER_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_ID','TERMINAL_PUBLIC_ORIGIN'];
 return Response.json({email:ADMIN_EMAIL,mode:'Single durable server',billingConfigured:billingConfigured(),openRegistration:process.env.PENGUIN_OPEN_SIGNUP!=='0',configuration:names.map(name=>({name,configured:Boolean(process.env[name])})),aiPolicy:'Active subscribers and the server-bound administrator only. Provider quotas and spending controls still apply.'},{headers:{'Cache-Control':'no-store'}});
});
