// Run after npm run build. Remove public/__qa_* before the final production commit.
import { build } from 'esbuild';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { basename } from 'node:path';
await build({ entryPoints:['tests/ui/preview.tsx'], outfile:'public/__qa_bundle.js', bundle:true, minify:true, jsx:'automatic', define:{'process.env.NODE_ENV':'"production"'}, plugins:[{name:'next-fixtures',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path.endsWith('navigation')?'export function useRouter(){return {push:p=>window.__qaNavigate(p)}}':'import React from "react"; export default function Link({href,onClick,scroll,...props}){return <a href={href} {...props} onClick={e=>{onClick?.(e);if(!e.defaultPrevented){e.preventDefault();window.__qaNavigate(href)}}}/>}'}));
}}] });
const cssFiles=await readdir('.next/static/css');
let css=(await Promise.all(cssFiles.filter(f=>f.endsWith('.css')).map(f=>readFile('.next/static/css/'+f,'utf8')))).join('\n');
// Inline fonts so local and Vercel asset hashes cannot invalidate responsive QA.
for (const match of [...css.matchAll(/url\((\/_next\/static\/media\/[^)]+\.woff2)\)/g)]) {
 const bytes=await readFile('.next/static/media/'+basename(match[1]));
 css=css.replaceAll(match[1],'data:font/woff2;base64,'+bytes.toString('base64'));
}
css+='html{scrollbar-width:none}html::-webkit-scrollbar{display:none}';
const documentHtml='<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'+css+'</style><body><div id="root"></div><script>window.__qaScene=SCENE_PLACEHOLDER;</script><script src="/__qa_bundle.js"></script></body></html>';
const serialized=JSON.stringify(documentHtml).replaceAll("<", "\\u003c");
const html=`<!doctype html><html><head><meta name="robots" content="noindex,nofollow"><title>IdeaHub responsive QA</title><style>body{font:14px system-ui;margin:20px;background:#e4e4e4}header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px}button,select{padding:8px}iframe{display:block;margin:0 auto;border:1px solid #bbb;background:#fbfbfa;max-width:none}main{overflow:auto;max-width:100%}</style></head><body><header><strong>Isolated UI fixtures</strong><button onclick="resize(320)">320 px</button><button onclick="resize(390)">390 px</button><button onclick="resize(768)">768 px</button><button onclick="resize(1440)">1440 px</button><button onclick="scene('guest')">Guest</button><button onclick="scene('user')">Account</button><button onclick="scene('discussion')">Discussion</button></header><main><iframe title="Responsive preview" width="390" height="844"></iframe></main><script>const template=${serialized},frame=document.querySelector('iframe');let targetWidth=390;function resize(w){targetWidth=w;frame.width=w}function scene(s){frame.srcdoc=template.replace('SCENE_PLACEHOLDER',JSON.stringify(s))}scene('guest');</script></body></html>`;
await writeFile('public/__qa_mobile.html',html);
console.log('Generated isolated responsive fixture page and bundle');
