import {currentAccount} from './account-context.ts';
import {hostedEnabled} from './hosted.ts';
import {billingStatus} from './billing.ts';
import {isAdmin} from './admin.ts';
export class AiSubscriptionError extends Error{status:number;constructor(message='An active subscription is required for AI features.',status=402){super(message);this.name='AiSubscriptionError';this.status=status;}}
export async function aiAccess(){
 const account=currentAccount();
 if(!account)return {allowed:!hostedEnabled(),reason:hostedEnabled()?'Sign in to use AI features.':'Local owner workspace',admin:false};
 if(isAdmin(account))return {allowed:true,reason:'Administrator access',admin:true};
 const plan=await billingStatus(account.id);
 const reason=plan.active?'Active subscription':!plan.configured?'A subscription service is not configured by the operator yet. AI remains locked.':plan.status==='awaiting_renewal_verification'?'Your current billing period needs verification. Check Account or contact support.':plan.status==='past_due'||plan.status==='unpaid'?'Update your payment in Account to restore AI access.':'Activate a subscription in Account to use AI features.';
 return {allowed:plan.active,reason,admin:false};
}
export async function requireAiAccess(){let result;try{result=await aiAccess();}catch{throw new AiSubscriptionError('Subscription verification is unavailable. No AI request was made.',503);}if(!result.allowed)throw new AiSubscriptionError(result.reason,currentAccount()?402:401);}
export function aiAccessResponse(error:unknown){return error instanceof AiSubscriptionError?Response.json({error:error.message,subscriptionRequired:error.status===402},{status:error.status}):null;}
