"use client";
import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {Minus,Plus} from 'lucide-react';
import type {PDFDocumentProxy,PDFDocumentLoadingTask,RenderTask} from 'pdfjs-dist/types/src/display/api';
import {clampPdfZoom,previewCanvasSize} from '@/lib/attachment-preview';
import styles from './attachment-preview.module.css';

export function PdfPreview({bytes,onError}:{bytes:Uint8Array;onError:()=>void}){
 const [doc,setDoc]=useState<PDFDocumentProxy|null>(null),[pages,setPages]=useState<{width:number;height:number}[]>([]),[zoom,setZoom]=useState(1),[width,setWidth]=useState(0);
 const stage=useRef<HTMLDivElement>(null),zoomRef=useRef(1),anchor=useRef<{page:string;rx:number;ry:number;x:number;y:number}|null>(null),fail=useRef(onError);fail.current=onError;
 useEffect(()=>{
  let disposed=false,task:PDFDocumentLoadingTask|undefined;
  const timer=setTimeout(()=>{if(!disposed)fail.current();},25000);
  void (async()=>{
   const pdf=await import('pdfjs-dist/legacy/build/pdf.mjs');if(disposed)return;
   const assets=`/pdfjs/${pdf.version}/`;
   pdf.GlobalWorkerOptions.workerSrc=`${assets}pdf.worker.min.mjs`;
   task=pdf.getDocument({data:bytes.slice(),cMapUrl:`${assets}cmaps/`,cMapPacked:true,standardFontDataUrl:`${assets}standard_fonts/`,wasmUrl:`${assets}wasm/`,iccUrl:`${assets}iccs/`,isOffscreenCanvasSupported:false});
   const loaded=await task.promise,dimensions=[];
   for(let i=1;i<=loaded.numPages;i++){if(disposed)return;const page=await loaded.getPage(i),view=page.getViewport({scale:1});dimensions.push({width:view.width,height:view.height});}
   clearTimeout(timer);if(!disposed){setPages(dimensions);setDoc(loaded);}
  })().catch(()=>{clearTimeout(timer);if(!disposed)fail.current();});
  return()=>{disposed=true;clearTimeout(timer);void task?.destroy();};
 },[bytes]);
 useEffect(()=>{
  const el=stage.current;if(!el)return;
  const measure=()=>setWidth(Math.max(1,Math.floor(el.clientWidth-24)));
  const observer=new ResizeObserver(measure);observer.observe(el);measure();return()=>observer.disconnect();
 },[]);
 useLayoutEffect(()=>{
  const el=stage.current,a=anchor.current;if(!el||!a)return;
  const page=el.querySelector<HTMLElement>(`[data-pdf-page="${a.page}"]`);anchor.current=null;if(!page)return;
  const r=page.getBoundingClientRect(),box=el.getBoundingClientRect();
  el.scrollLeft+=r.left+a.rx*r.width-box.left-a.x;
  el.scrollTop+=r.top+a.ry*r.height-box.top-a.y;
 },[zoom]);
 function changeZoom(next:number,clientX?:number,clientY?:number){
  const el=stage.current;if(!el)return;const value=clampPdfZoom(next);if(value===zoomRef.current)return;
  const box=el.getBoundingClientRect(),x=clientX??box.left+el.clientWidth/2,y=clientY??box.top+el.clientHeight/2;
  const pages=[...el.querySelectorAll<HTMLElement>('[data-pdf-page]')];
  const page=pages.find(p=>p.getBoundingClientRect().bottom>=y)??pages.at(-1);
  if(page){const r=page.getBoundingClientRect();anchor.current={page:page.dataset.pdfPage!,rx:(x-r.left)/r.width,ry:(y-r.top)/r.height,x:x-box.left,y:y-box.top};}
  zoomRef.current=value;setZoom(value);
 }
 const zoomAction=useRef(changeZoom);zoomAction.current=changeZoom;
 useEffect(()=>{
  const el=stage.current;if(!el)return;
  const wheel=(e:WheelEvent)=>{if(!e.ctrlKey)return;e.preventDefault();if(!e.deltaY)return;zoomAction.current(zoomRef.current+(e.deltaY<0?.1:-.1),e.clientX,e.clientY);};
  el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);
 },[]);
 return <div className={styles.pdf}>
  <div ref={stage} className={styles.pdfStage} aria-label="Nội dung PDF" tabIndex={0}>{!doc&&<p className={styles.loading} role="status">Đang mở PDF…</p>}<div className={styles.surface}>{doc&&pages.map((size,i)=><PdfPage key={i} doc={doc} number={i+1} size={size} width={Math.min(width,1200)*zoom} stage={stage} onError={onError}/>)}</div></div>
  <div className={styles.tools} aria-label="Điều khiển PDF">
   <span>{doc?`${doc.numPages} trang`:'PDF'}</span><span className={styles.toolSpacer}/>
   <button type="button" aria-label="Thu nhỏ PDF" disabled={!doc||zoom<=.25} onClick={()=>changeZoom(zoom-.25)}><Minus size={17}/></button>
   <button type="button" className={styles.zoom} aria-label="Đặt lại zoom PDF về 100%" disabled={!doc} onClick={()=>changeZoom(1)}>{Math.round(zoom*100)}%</button>
   <button type="button" aria-label="Phóng to PDF" disabled={!doc||zoom>=3} onClick={()=>changeZoom(zoom+.25)}><Plus size={17}/></button>
  </div>
 </div>;
}

function PdfPage({doc,number,size,width,stage,onError}:{doc:PDFDocumentProxy;number:number;size:{width:number;height:number};width:number;stage:RefObject<HTMLDivElement|null>;onError:()=>void}){
 const holder=useRef<HTMLDivElement>(null),[active,setActive]=useState(false),[rendering,setRendering]=useState(true),fail=useRef(onError);fail.current=onError;
 useEffect(()=>{const el=holder.current;if(!el)return;const observer=new IntersectionObserver(([entry])=>setActive(entry.isIntersecting),{root:stage.current,rootMargin:'600px 0px'});observer.observe(el);return()=>observer.disconnect();},[stage]);
 useEffect(()=>{
  const el=holder.current;if(!el||!active||!width)return;
  let disposed=false,render:RenderTask|undefined;const canvas=document.createElement('canvas');el.append(canvas);setRendering(true);
  const timer=setTimeout(()=>{if(!disposed)fail.current();},25000);
  void (async()=>{
   const page=await doc.getPage(number);if(disposed)return;
   const viewport=page.getViewport({scale:width/size.width}),allocation=previewCanvasSize(viewport.width,viewport.height,window.devicePixelRatio||1);
   canvas.width=allocation.width;canvas.height=allocation.height;canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
   canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`Trang ${number} / ${doc.numPages}`);
   render=page.render({canvas,viewport,transform:allocation.ratio===1?undefined:[allocation.ratio,0,0,allocation.ratio,0,0]});
   await render.promise;clearTimeout(timer);if(!disposed)setRendering(false);
  })().catch(error=>{clearTimeout(timer);if(!disposed&&error?.name!=='RenderingCancelledException')fail.current();});
  return()=>{disposed=true;clearTimeout(timer);render?.cancel();canvas.remove();canvas.width=canvas.height=0;};
 },[doc,number,active,width,size]);
 return <div ref={holder} className={styles.pdfPage} data-pdf-page={number} style={{width:width||1,height:width?width*size.height/size.width:1}}>{(rendering||!active)&&<span className={styles.pagePlaceholder}>Trang {number}</span>}</div>;
}
