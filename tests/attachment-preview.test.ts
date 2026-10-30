import assert from 'node:assert/strict';
import {test} from 'node:test';
import {attachmentPreview,attachmentDownloadUrl,previewCanvasSize} from '../src/lib/attachment-preview';
test('file previews recognize existing octet-stream receipts without rendering office or archive files as HTML',()=>{
 for(const name of ['notes.PDF','notes.pdf'])assert.equal(attachmentPreview({name,mime:'application/octet-stream',kind:'file'}),'pdf');
 for(const name of ['notes.txt','notes.CSV'])assert.equal(attachmentPreview({name,mime:'application/octet-stream',kind:'file'}),'text');
 for(const name of ['report.docx','sheet.xlsx','deck.pptx','archive.zip','script.html'])assert.equal(attachmentPreview({name,mime:'application/octet-stream',kind:'file'}),'unsupported');
 assert.equal(attachmentPreview({name:'photo.png',mime:'image/png',kind:'image'}),'image');
});
test('download links retain authenticated paths, query parameters, fragments and local outbox blobs',()=>{
 assert.equal(attachmentDownloadUrl('/api/ideas/a/attachments/b'),'/api/ideas/a/attachments/b?download=1');
 assert.equal(attachmentDownloadUrl('/api/file?x=1#page=2'),'/api/file?x=1&download=1#page=2');
 assert.equal(attachmentDownloadUrl('blob:https://ideahub.test/123'),'blob:https://ideahub.test/123');
});
test('PDF canvas memory remains bounded on high-DPR mobile screens, zoom, and unusually tall pages',()=>{
 for(const width of [296,366,800,1200,2400])for(const height of [400,1200,3200,12000])for(const dpr of [1,2,3,4]){
  const size=previewCanvasSize(width,height,dpr);assert(size.width*size.height<=4000000);assert(size.width>=1&&size.height>=1);assert(size.ratio<=2);
 }
});

test('the pinned PDF engine reads and renders portrait/landscape pages and rejects malformed PDFs',async()=>{
 const {qaPdf}=await import('../scripts/qa/preview-pdf');
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const {createCanvas}=await import('@napi-rs/canvas');
 const task=getDocument({data:qaPdf(),standardFontDataUrl:`${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`});
 try{
  const doc=await task.promise;assert.equal(doc.numPages,2);
  for(const number of [1,2]){
   const page=await doc.getPage(number),viewport=page.getViewport({scale:.5}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
   await page.render({canvas:canvas as unknown as HTMLCanvasElement,viewport}).promise;
   const pixel=canvas.getContext('2d').getImageData(25,Math.floor(viewport.height)-55,1,1).data;
   assert(pixel[2]>pixel[0],'blue chart is rasterized');
   assert((await page.getTextContent()).items.length>0);
  }
 }finally{await task.destroy();}
 const broken=getDocument({data:new TextEncoder().encode('not a PDF')});
 try{await assert.rejects(broken.promise);}finally{await broken.destroy();}
});
