import {convertDocx} from '../lib/docx-conversion';
self.onmessage=async(event:MessageEvent<Uint8Array>)=>{
 try{self.postMessage({html:await convertDocx(event.data)});}
 catch{self.postMessage({error:true});}
};
