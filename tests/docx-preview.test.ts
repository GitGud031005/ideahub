import assert from 'node:assert/strict';
import {test} from 'node:test';
import {zipSync,strToU8} from 'fflate';
import {convertDocx} from '../src/lib/docx-conversion';
import {qaDocx} from '../scripts/qa/preview-docx';

test('Word converter preserves Vietnamese, headings, emphasis, tables, embedded images and long content',async()=>{
 const html=await convertDocx(qaDocx());
 assert.match(html,/<h1>Ý tưởng cùng nhau — DOCX<\/h1>/);
 assert.match(html,/<strong>Chữ đậm<\/strong>/);assert.match(html,/<em>chữ nghiêng<\/em>/);
 assert.match(html,/<table>/);assert.match(html,/Người phụ trách/);assert.match(html,/data:image\/png;base64,/);
 assert.match(html,/Góc nhìn 70/);assert.match(html,/KẾT THÚC TÀI LIỆU/);
});
test('Word preview rejects malformed, encrypted/non-zip, missing document and oversized packages',async()=>{
 for(const bytes of [strToU8('not a docx'),zipSync({'notes.txt':strToU8('not Word')}),zipSync({'word/document.xml':new Uint8Array(17*1024*1024)})])await assert.rejects(convertDocx(bytes));
 assert.equal(await convertDocx(qaDocx({empty:true})), '');
});
