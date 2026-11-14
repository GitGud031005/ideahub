import mammoth from 'mammoth/mammoth.browser';
import {unzipSync} from 'fflate';

/** Limit expansion before handing the package to the Word converter. Runs in a disposable worker. */
export async function convertDocx(bytes:Uint8Array){
 let expanded=0,entries=0;
 const files=unzipSync(bytes,{filter:file=>{
  expanded+=file.originalSize;
  if(++entries>2000||file.originalSize>16*1024*1024||expanded>40*1024*1024)throw Error('Document too large');
  // Only validate the package here; Mammoth reads the selected entries itself.
  return false;
 }});
 void files;
 if(!entries)throw Error('Empty package');
 const result=await mammoth.convertToHtml({arrayBuffer:bytes.slice().buffer},{
  externalFileAccess:false,includeEmbeddedStyleMap:false,idPrefix:'docx-',
  convertImage:mammoth.images.imgElement(async image=>({src:/^image\/(png|jpeg|gif|webp)$/i.test(image.contentType)?`data:${image.contentType};base64,${await image.readAsBase64String()}`:''})),
 });
 if(result.value.length>5_000_000)throw Error('Preview too large');
 return result.value;
}
