import {verifyStripeSignature,applyBillingEvent} from '@/lib/server/billing';
export const runtime='nodejs';
export async function POST(request:Request){
 const secret=process.env.STRIPE_WEBHOOK_SECRET;if(!secret)return Response.json({error:'Webhook unavailable'},{status:503});
 const body=await request.text();if(body.length>262144)return Response.json({error:'Payload too large'},{status:413});
 try{verifyStripeSignature(body,request.headers.get('stripe-signature')||'',secret);}catch{return Response.json({error:'Invalid signature'},{status:400});}
 try{await applyBillingEvent(JSON.parse(body));return Response.json({received:true});}catch{return Response.json({error:'Webhook processing failed; retry delivery'},{status:503});}
}
