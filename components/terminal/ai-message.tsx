'use client';
import Markdown from 'react-markdown';
export function AiMessage({text}:{text:string}){
 return <div className="penguin-ai-message"><Markdown skipHtml components={{
  h1:({children})=><h4>{children}</h4>,h2:({children})=><h4>{children}</h4>,h3:({children})=><h4>{children}</h4>,
  img:()=>null,
  a:({href,children})=>href&&(/^https:\/\//.test(href)||(/^\/(?!\/)/.test(href)))?<a href={href} target={href.startsWith('https:')?'_blank':undefined} rel="noopener noreferrer nofollow">{children}</a>:<span>{children}</span>,
 }}>{text}</Markdown></div>;
}
