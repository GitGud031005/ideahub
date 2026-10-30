import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildCommentForest} from '../src/lib/format';
const c=(id:string,parentId:string|null,day=1)=>({id,parentId,createdAt:`2026-10-${String(day).padStart(2,'0')}T00:00:00Z`});
const ids=(tree:ReturnType<typeof buildCommentForest>,parent:string|null=null)=>(tree.get(parent)??[]).map(c=>c.id);
test('most discussed counts descendants at every depth and applies to each sibling level',()=>{
 const items=[c('older',null),c('recent',null,30),c('plain',null,29),c('deep','older'),c('leaf','deep'),c('a','recent'),c('b','recent'),c('wide','recent'),c('nested','b'),c('nested-leaf','nested')];
 const original=JSON.stringify(items),tree=buildCommentForest(items,'discussed');
 assert.deepEqual(ids(tree),['recent','older','plain']);
 assert.deepEqual(ids(tree,'recent'),['b','wide','a']);
 assert.deepEqual(ids(tree,'b'),['nested']);
 assert.equal(JSON.stringify(items),original);
 // Add a reply deeper than the direct level: ranking updates from the full snapshot.
 const updated=buildCommentForest([...items,c('extra','leaf'),c('extra2','extra'),c('extra3','extra2'),c('extra4','extra3')],'discussed');
 assert.deepEqual(ids(updated),['older','recent','plain']);
});
test('equal discussion counts use newest timestamps and deterministic IDs, and chronological modes stay unchanged',()=>{
 const items=[c('a',null,2),c('b',null,2),c('z',null,1),c('orphan','missing',3)];
 assert.deepEqual(ids(buildCommentForest(items,'discussed')),['orphan','b','a','z']);
 assert.deepEqual(ids(buildCommentForest(items,'new')),['orphan','b','a','z']);
 assert.deepEqual(ids(buildCommentForest(items,'old')),['z','a','b','orphan']);
});
test('discussion ranking handles deep branches without stack overflow and malformed cycles terminate',()=>{
 const items=[c('root',null),c('new',null,30),...Array.from({length:15000},(_,i)=>c(`n${i}`,i===0?'root':`n${i-1}`))];
 assert.deepEqual(ids(buildCommentForest(items,'discussed')),['root','new']);
 assert.doesNotThrow(()=>buildCommentForest([c('a','b'),c('b','a'),c('root',null)],'discussed'));
});
