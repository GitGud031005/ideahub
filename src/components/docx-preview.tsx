"use client";
import {useEffect,useRef,useState} from 'react';
import DOMPurify from 'dompurify';
import styles from './attachment-preview.module.css';

export function DocxPreview({bytes,onError}:{bytes:Uint8Array;onError:()=>void}){
 const [html,setHtml]=useState<string|null>(null),error=useRef(onError);
 error.current=onError;
 useEffect(()=>{
  let worker:Worker|undefined,disposed=false;
  const fail=()=>{if(!disposed){worker?.terminate();error.current();}};
  const timer=setTimeout(fail,20000);
  try{
   worker=new Worker(new URL('./docx-preview.worker.ts',import.meta.url));
   worker.onerror=fail;
   worker.onmessage=(event:MessageEvent<{html?:string;error?:boolean}>)=>{
    if(disposed)return;
    clearTimeout(timer);worker?.terminate();
    if(event.data.error||typeof event.data.html!=='string'){fail();return;}
    const clean=DOMPurify.sanitize(event.data.html,{
     ALLOWED_TAGS:['p','br','h1','h2','h3','h4','h5','h6','strong','em','u','s','sup','sub','ul','ol','li','table','thead','tbody','tr','td','th','a','img','blockquote','hr'],
     ALLOWED_ATTR:['href','src','alt','colspan','rowspan','start','id'],
     ALLOW_DATA_ATTR:false,ALLOWED_URI_REGEXP:/^(?:https?:|mailto:|#)/i,
    });
    // Only embedded raster images and explicit web/mail/footnote links may survive conversion.
    const template=document.createElement('template');template.innerHTML=clean;
    template.content.querySelectorAll('img').forEach(img=>{if(!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(img.getAttribute('src')||''))img.remove();});
    template.content.querySelectorAll('a[href]').forEach(a=>{if(!a.getAttribute('href')?.startsWith('#')){a.setAttribute('target','_blank');a.setAttribute('rel','noopener noreferrer');}});
    setHtml(template.innerHTML);
   };
   const copy=bytes.slice();worker.postMessage(copy,[copy.buffer]);
  }catch{clearTimeout(timer);fail();}
  return()=>{disposed=true;clearTimeout(timer);worker?.terminate();};
 },[bytes]);
 if(html===null)return <div className={styles.empty} role="status">Đang mở tài liệu Word…</div>;
 return <div className={styles.docx}>
  <p className={styles.docxNotice}>Bản xem trước nội dung · Bố cục có thể khác bản Word gốc</p>
  <div className={styles.docxStage} tabIndex={0} role="region" aria-label="Nội dung tài liệu Word">
   {html?<article className={styles.docxPage} dangerouslySetInnerHTML={{__html:html}}/>:<p className={styles.loading}>Tài liệu không có nội dung để xem trước.</p>}
  </div>
 </div>;
}
