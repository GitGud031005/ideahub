import {useQuery} from '@tanstack/react-query';
import {Providers} from '../../src/components/providers';
import {IdeaStatusControl,IdeaStatusIcon} from '../../src/components/idea-status';
import {deferPushInvite} from '../../src/lib/device-push';
import type {Idea} from '../../src/lib/domain';
const user={id:'qa-shared-viewer',name:'QA chưa tham gia',initial:'Q',username:'qa'};
deferPushInvite(user.id,{permanently:true});
let status:'potential'|'archived'='potential';
const item=():Idea=>({id:'qa-shared',title:'Ý tưởng chung — dữ liệu QA',description:'Đổi trạng thái không tự tham gia phòng',status,isNew:status==='potential',category:'Khác',tags:[],creator:{id:'someone-else',name:'Người khác',initial:'N'},createdAt:'2026-01-01T00:00:00Z',memberCount:2,commentCount:0,lastCommentAt:null,joined:false,mine:false});
window.fetch=async(input,init)=>{
 const path=new URL(String(input),location.origin).pathname;
 let value:unknown;
 if(path==='/api/session')value={user,storage:'memory'};
 else if(path==='/api/ideas/qa-shared/status'){status=JSON.parse(String(init?.body)).status;value=item();}
 else if(path==='/api/ideas/qa-shared')value=item();
 else throw Error('Unexpected synthetic API '+path);
 return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
};
function View(){const q=useQuery({queryKey:['idea','qa-shared'],queryFn:async()=>item()});return <main style={{padding:20,maxWidth:600}}><h1 style={{fontSize:20}}>Trạng thái chung</h1><p style={{margin:'16px 0'}}>Tài khoản QA chưa tham gia · idea của người khác</p>{q.data&&<><IdeaStatusControl idea={q.data}/><p style={{marginTop:24}}>Hiển thị trên thẻ: {q.data.isNew&&<IdeaStatusIcon status="new" card/>}<IdeaStatusIcon status={q.data.status} card/></p><p>Tham gia: {q.data.joined?'Có':'Chưa'} · {q.data.memberCount} thành viên</p></>}</main>}
export default function Fixture(){return <Providers><View/></Providers>}
