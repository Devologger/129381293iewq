'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import '@/components/terminal/terminal.css';
export default function ConfirmEmail(){
 const [link,setLink]=useState<{tokenHash:string;type:string}|null>(null),[message,setMessage]=useState('Reading your confirmation link…'),[busy,setBusy]=useState(false);
 useEffect(()=>{const params=new URLSearchParams(window.location.hash.slice(1));const tokenHash=params.get('token_hash'),type=params.get('type');window.history.replaceState(null,'','/auth/confirm');const timer=setTimeout(()=>{if(tokenHash&&['signup','recovery'].includes(type||'')){setLink({tokenHash,type:type!});setMessage(type==='recovery'?'Continue to choose a new password.':'Confirm your email, then sign in with your password.');}else setMessage('This confirmation link is missing or expired. Return to Account to request a fresh email.');},0);return()=>clearTimeout(timer);},[]);
 async function confirm(){if(!link||busy)return;setBusy(true);try{const r=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'confirm',...link})}),data=await r.json();if(!r.ok)throw new Error(data.error);setLink(null);window.location.replace(data.recoveryReady?'/account?reset=1':'/account?confirmed=1');}catch(e){setMessage(e instanceof Error?e.message:'Confirmation failed');}finally{setBusy(false);}}
 return <main className="penguin-account-page penguin-account-professional"><Link href="/" className="penguin-account-brand">◈ PENGUIN</Link><section className="penguin-account-card"><h1>{link?.type==='recovery'?'Reset your password':'Confirm your email'}</h1><p role="status">{message}</p>{link&&<button className="ot-primary" disabled={busy} onClick={()=>void confirm()}>{busy?'Confirming…':link.type==='recovery'?'Continue to reset':'Confirm email'}</button>}<p><Link href="/account">Return to sign in →</Link></p></section></main>;
}
