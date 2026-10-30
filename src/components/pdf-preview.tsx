"use client";
import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Minus,Plus} from 'lucide-react';
import type {PDFDocumentProxy,PDFDocumentLoadingTask,RenderTask} from 'pdfjs-dist/types/src/display/api';
import {previewCanvasSize} from '@/lib/attachment-preview';
import styles from './attachment-preview.module.css';

export function PdfPreview({bytes,onError}:{bytes:Uint8Array;onError:()=>void}){
 const [doc,setDoc]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[zoom,setZoom]=useState(1),[width,setWidth]=useState(0),[rendering,setRendering]=useState(true);
 const stage=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null),fail=useRef(onError);fail.current=onError;
 useEffect(()=>{
  let disposed=false,task:PDFDocumentLoadingTask|undefined;
  const timer=setTimeout(()=>{if(!disposed)fail.current();},25000);
  void (async()=>{
   const pdf=await import('pdfjs-dist/legacy/build/pdf.mjs');if(disposed)return;
   const assets=`/pdfjs/${pdf.version}/`;
   pdf.GlobalWorkerOptions.workerSrc=`${assets}pdf.worker.min.mjs`;
   task=pdf.getDocument({data:bytes.slice(),cMapUrl:`${assets}cmaps/`,cMapPacked:true,standardFontDataUrl:`${assets}standard_fonts/`,wasmUrl:`${assets}wasm/`,iccUrl:`${assets}iccs/`,isOffscreenCanvasSupported:false});
   const loaded=await task.promise;clearTimeout(timer);if(!disposed)setDoc(loaded);
  })().catch(()=>{clearTimeout(timer);if(!disposed)fail.current();});
  return()=>{disposed=true;clearTimeout(timer);void task?.destroy();};
 },[bytes]);
 useEffect(()=>{
  const el=stage.current;if(!el)return;
  const measure=()=>setWidth(Math.max(1,Math.floor(el.clientWidth-24)));
  const observer=new ResizeObserver(measure);observer.observe(el);measure();return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!doc||!width||!surface.current)return;
  let disposed=false,render:RenderTask|undefined;const canvas=document.createElement('canvas');
  surface.current.replaceChildren(canvas);setRendering(true);
  const timer=setTimeout(()=>{if(!disposed)fail.current();},25000);
  void (async()=>{
   const pdfPage=await doc.getPage(page);if(disposed)return;
   const base=pdfPage.getViewport({scale:1}),viewport=pdfPage.getViewport({scale:Math.min(width,1200)/base.width*zoom});
   const size=previewCanvasSize(viewport.width,viewport.height,window.devicePixelRatio||1);
   canvas.width=size.width;canvas.height=size.height;canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
   canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`Trang ${page} / ${doc.numPages}`);
   render=pdfPage.render({canvas,viewport,transform:size.ratio===1?undefined:[size.ratio,0,0,size.ratio,0,0]});
   await render.promise;clearTimeout(timer);if(!disposed){setRendering(false);stage.current?.scrollTo({top:0,left:0,behavior:'instant'});}
  })().catch(error=>{clearTimeout(timer);if(!disposed&&error?.name!=='RenderingCancelledException')fail.current();});
  return()=>{disposed=true;clearTimeout(timer);render?.cancel();canvas.remove();};
 },[doc,page,width,zoom]);
 return <div className={styles.pdf}>
  <div ref={stage} className={styles.pdfStage} aria-busy={rendering}>{rendering&&<p className={styles.loading} role="status">Đang hiển thị PDF…</p>}<div ref={surface} className={styles.surface}/></div>
  <div className={styles.tools} aria-label="Điều khiển PDF">
   <button type="button" aria-label="Trang trước" disabled={!doc||page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={18}/></button><span aria-live="polite">{doc?`${page} / ${doc.numPages}`:'PDF'}</span><button type="button" aria-label="Trang sau" disabled={!doc||page>=doc.numPages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={18}/></button>
   <span className={styles.toolSpacer}/><button type="button" aria-label="Thu nhỏ PDF" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z-.25))}><Minus size={17}/></button><button type="button" className={styles.zoom} aria-label="Vừa chiều rộng" onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button type="button" aria-label="Phóng to PDF" disabled={zoom>=2} onClick={()=>setZoom(z=>Math.min(2,z+.25))}><Plus size={17}/></button>
  </div>
 </div>;
}
