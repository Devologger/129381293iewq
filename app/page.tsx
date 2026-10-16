import type {Metadata} from 'next';
import {Landing} from '@/components/marketing/landing';
export const metadata:Metadata={title:'Penguin — Research before execution',description:'A focused trading workspace for live market context, advisory AI research and an inspectable knowledge journal. Start with Binance demo.',robots:{index:true,follow:true}};
export default function HomePage(){return <Landing/>;}
