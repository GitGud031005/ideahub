"use client";
import {qaPdf} from "./preview-pdf";
import {useEffect,useState} from 'react';
import type {Attachment} from '../../src/lib/domain';
import {AttachmentList,AttachmentViewer} from '../../src/components/attachment-view';
import {SharedFiles} from '../../src/components/shared-files';
export default function AttachmentsQA(){
 const [items,setItems]=useState<Attachment[]>([]),[selected,setSelected]=useState<Attachment|null>(null);
 useEffect(()=>{
  const urls:string[]=[];const asset=(id:string,name:string,mime:string,data:BlobPart):Attachment=>{const url=URL.createObjectURL(new Blob([data],{type:mime}));urls.push(url);return {id,name,mime,size:new Blob([data]).size,url,kind:'file'};};
  const sample=qaPdf();let failures=0;const original=window.fetch;
  window.fetch=async(input,init)=>String(input).includes('/__qa_retry.pdf')?(failures++===0?new Response('',{status:503}):new Response(sample,{headers:{'content-type':'application/pdf'}})):original(input,init);
  setItems([asset('pdf','Tai lieu QA rat dai de kiem tra ten tep tren mobile.pdf','application/pdf',sample as BlobPart),asset('text','notes.txt','text/plain','Ghi chú QA\n'+('Dòng văn bản dài để kiểm tra cuộn trên điện thoại.\n'.repeat(120))+'\n<script>window.bad=true</script>'),asset('csv','sample.csv','text/csv','name,value\nÝ tưởng,42\nPhản hồi,18'),asset('office','report.docx','application/octet-stream','PK'),asset('bad','broken.pdf','application/pdf','bad PDF'),{id:'retry',name:'retry.pdf',mime:'application/pdf',kind:'file',size:sample.length,url:'/__qa_retry.pdf'},{id:'image',name:'prism.webp',mime:'image/webp',kind:'image',size:50000,url:'/assets/prism-studio.webp'},{id:'bad-image',name:'missing.webp',mime:'image/webp',kind:'image',size:10,url:'/__qa_missing.webp'}]);
  return()=>{urls.forEach(URL.revokeObjectURL);window.fetch=original;};
 },[]);
 const comment={id:'qa-message',ideaId:'qa',parentId:null,text:'',author:{id:'qa',name:'Người QA',initial:'Q'},createdAt:new Date().toISOString(),attachments:items};
 return <main style={{padding:16}}><h1 style={{fontSize:20,marginBottom:20}}>Xem trước tệp — dữ liệu giả</h1><AttachmentList items={items} onImage={setSelected}/><SharedFiles comments={[comment]} onReveal={()=>{}} onImage={setSelected}/>{selected&&<AttachmentViewer key={selected.id} attachment={selected} onClose={()=>setSelected(null)}/>}</main>;
}
