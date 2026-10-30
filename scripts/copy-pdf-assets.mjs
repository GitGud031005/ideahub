import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {mkdir,cp,readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),root=dirname(require.resolve('pdfjs-dist/package.json'));
const {version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const target=join(process.cwd(),'public','pdfjs',version);
await mkdir(target,{recursive:true});
await cp(join(root,'legacy/build/pdf.worker.min.mjs'),join(target,'pdf.worker.min.mjs'));
for(const folder of ['cmaps','standard_fonts','wasm','iccs'])await cp(join(root,folder),join(target,folder),{recursive:true});
