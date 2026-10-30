"use client";
import {Download,File,RefreshCw,X} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import type {Attachment} from '@/lib/domain';
import {fileSize,ATTACHMENT_MAX_BYTES} from '@/lib/shared-content';
import {attachmentDownloadUrl,attachmentPreview} from '@/lib/attachment-preview';
import styles from './attachment-preview.module.css';
const PdfPreview=dynamic(()=>import('./pdf-preview').then(m=>m.PdfPreview),{ssr:false,loading:()=> <p className={styles.loading} role="status">Đang mở PDF…</p>});

export function AttachmentViewer({attachment,onClose}:{attachment:Attachment;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),close=useRef<HTMLButtonElement>(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const d=ref.current,opener=document.activeElement as HTMLElement|null,previous=document.body.style.overflow;d?.showModal();close.current?.focus({preventScroll:true});document.body.style.overflow='hidden';return()=>{d?.close();document.body.style.overflow=previous;if(opener?.isConnected)opener.focus({preventScroll:true});};},[]);
 return <dialog ref={ref} className={styles.dialog} aria-label={`Xem tệp ${attachment.name}`} onCancel={e=>{e.preventDefault();onClose();}}>
  <header className={styles.header}><div><strong title={attachment.name}>{attachment.name}</strong><small>{fileSize(attachment.size)}</small></div><a href={attachmentDownloadUrl(attachment.url)} download={attachment.name} aria-label="Tải tệp xuống" title="Tải tệp xuống"><Download size={19}/></a><button ref={close} type="button" aria-label="Đóng xem trước" onClick={onClose}><X size={21}/></button></header>
  <PreviewContent key={`${attachment.id}:${attempt}`} attachment={attachment} retry={()=>setAttempt(n=>n+1)}/>
 </dialog>;
}
function PreviewContent({attachment,retry}:{attachment:Attachment;retry:()=>void}){
 const kind=attachmentPreview(attachment),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[bytes,setBytes]=useState<Uint8Array|null>(null),[text,setText]=useState('');
 useEffect(()=>{
  if(kind==='unsupported'||kind==='image')return;
  const controller=new AbortController();let disposed=false;
  const timer=setTimeout(()=>{if(!disposed){setStatus('error');controller.abort();}},25000);
  void (async()=>{
   const r=await fetch(attachment.url,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(!r.ok||!r.body)throw Error();
   const reader=r.body.getReader(),chunks:Uint8Array[]=[];let total=0;
   for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>ATTACHMENT_MAX_BYTES){await reader.cancel();throw Error();}chunks.push(value);}
   const data=new Uint8Array(total);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
   if(disposed)return;
   if(kind==='text')setText(new TextDecoder('utf-8',{fatal:true}).decode(data));else setBytes(data);
   clearTimeout(timer);setStatus('ready');
  })().catch(()=>{if(!disposed){clearTimeout(timer);setStatus('error');}});
  return()=>{disposed=true;clearTimeout(timer);controller.abort();};
 },[attachment,kind]);
 useEffect(()=>{if(kind!=='image'||status!=='loading')return;const timer=setTimeout(()=>setStatus('error'),25000);return()=>clearTimeout(timer);},[kind,status]);
 if(kind==='unsupported')return <div className={styles.empty}><File size={34}/><strong>Chưa hỗ trợ xem trước định dạng này</strong><p>Bạn có thể tải tệp xuống và mở bằng ứng dụng phù hợp.</p><a className="ih-primary" href={attachmentDownloadUrl(attachment.url)} download={attachment.name}>Tải tệp xuống</a></div>;
 if(status==='error')return <div className={styles.empty} role="alert"><File size={34}/><strong>Chưa hiển thị được tệp</strong><p>Tệp có thể bị lỗi, được bảo vệ bằng mật khẩu hoặc kết nối bị gián đoạn. Thử lại hoặc tải tệp xuống để mở.</p><button type="button" className="ih-secondary" onClick={retry}><RefreshCw size={16}/>Thử lại</button></div>;
 if(kind==='image')return <div className={styles.imageStage} aria-busy={status==='loading'}>{status==='loading'&&<p className={styles.loading} role="status">Đang tải ảnh…</p>}<img src={attachment.url} alt={attachment.name} onLoad={()=>setStatus('ready')} onError={()=>setStatus('error')}/></div>;
 if(status==='loading')return <div className={styles.empty} role="status">Đang tải xem trước…</div>;
 if(kind==='pdf'&&bytes)return <PdfPreview bytes={bytes} onError={()=>setStatus('error')}/>;
 return <div className={styles.textStage}>{text.length>100000&&<p className={styles.notice}>Đang hiển thị 100.000 ký tự đầu. Tải xuống để đọc toàn bộ tệp.</p>}<pre>{text.slice(0,100000)}</pre></div>;
}
export {AttachmentList} from "./attachment-list";
