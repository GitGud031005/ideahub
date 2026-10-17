import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { AuthService, digest, getAuthService } from "./auth";
import { CloudinaryAvatars, isGooglePicture } from "./cloudinary";
import { AppError } from "./errors";
import { getDatabasePool } from "./database";
import type { DatabasePool } from "./postgres-repository";
const FLOW_COOKIE="ideahub_google_flow";
const keys=createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"),{timeoutDuration:5000});
export interface OAuthFlow { verifier:string;nonceHash:string;returnTo:string }
export interface OAuthFlows { save(hash:string,flow:OAuthFlow):Promise<void>;consume(hash:string):Promise<OAuthFlow|null> }
export class PostgresOAuthFlows implements OAuthFlows {
  constructor(private pool:DatabasePool){}
  async save(hash:string,flow:OAuthFlow){
    await this.pool.query("DELETE FROM ideahub_private.oauth_states WHERE state_hash IN (SELECT state_hash FROM ideahub_private.oauth_states WHERE expires_at<=now() LIMIT 100)");
    await this.pool.query("INSERT INTO ideahub_private.oauth_states(state_hash,verifier,nonce_hash,return_to,expires_at) VALUES ($1,$2,$3,$4,now()+interval '10 minutes')",[hash,flow.verifier,flow.nonceHash,flow.returnTo]);
  }
  async consume(hash:string){const row=(await this.pool.query<{verifier:string;nonce_hash:string;return_to:string}>("DELETE FROM ideahub_private.oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING verifier,nonce_hash,return_to",[hash])).rows[0];return row?{verifier:row.verifier,nonceHash:row.nonce_hash,returnTo:row.return_to}:null;}
}
export function safeReturnTo(value:string|null) {
  if(value==="/?new=1")return value;
  return value && /^\/ideas\/[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : "/";
}
export function googleSettings(){return {clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,origin:process.env.APP_URL||"https://ideahub-umber.vercel.app"};}
export function googleConfigured(){const c=googleSettings();return !!(c.clientId&&c.clientSecret);}
export function googleFlowCookie(state="",clear=false){return `${FLOW_COOKIE}=${state}; HttpOnly; Path=/api/auth/google; SameSite=Lax; Max-Age=${clear?0:600}${process.env.NODE_ENV==="production"?"; Secure":""}`;}
function cookie(request:Request){return request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${FLOW_COOKIE}=`))?.slice(FLOW_COOKIE.length+1)||"";}
type Verify=(token:string,audience:string)=>Promise<JWTPayload>;
const verify:Verify=async(token,audience)=>(await jwtVerify(token,keys,{algorithms:["RS256"],issuer:["https://accounts.google.com","accounts.google.com"],audience,maxTokenAge:600,clockTolerance:5,requiredClaims:["exp","iat","sub","nonce"]})).payload;
export class GoogleOAuthService {
  constructor(private flows:OAuthFlows,private auth:AuthService,private avatars:CloudinaryAvatars,
    private config=googleSettings(),private transport:typeof fetch=fetch,private verifyId:Verify=verify){}
  origin(){const u=new URL(this.config.origin);if(u.username||u.password||u.pathname!=="/"||u.search||u.hash||(u.protocol!=="https:"&&!(process.env.NODE_ENV!=="production"&&u.hostname==="localhost")))throw new AppError(503,"GOOGLE_CONFIG","Cấu hình địa chỉ đăng nhập chưa hợp lệ");return u.origin;}
  private configured(){if(!this.config.clientId||!this.config.clientSecret)throw new AppError(503,"GOOGLE_CONFIG","Đăng nhập Google chưa được kết nối");}
  async start(next:string|null){
    this.configured();const state=randomBytes(32).toString("base64url"),nonce=randomBytes(32).toString("base64url"),verifier=randomBytes(32).toString("base64url");
    await this.flows.save(digest(state),{verifier,nonceHash:digest(nonce),returnTo:safeReturnTo(next)});
    const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search=new URLSearchParams({client_id:this.config.clientId!,redirect_uri:`${this.origin()}/api/auth/google/callback`,response_type:"code",scope:"openid profile email",state,nonce,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256",prompt:"select_account"}).toString();
    return {url:url.toString(),state};
  }
  async complete(request:Request,previous:string|null){
    this.configured();const url=new URL(request.url),state=url.searchParams.get("state")||"",stored=cookie(request);
    if(!/^[A-Za-z0-9_-]{43}$/.test(state)||!stored||!timingSafeEqual(Buffer.from(digest(state)),Buffer.from(digest(stored))))throw new AppError(400,"GOOGLE_STATE","Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn");
    const flow=await this.flows.consume(digest(state));if(!flow)throw new AppError(400,"GOOGLE_STATE","Phiên đăng nhập Google đã được dùng hoặc hết hạn");
    if(url.searchParams.has("error"))throw new AppError(400,"GOOGLE_CANCELLED","Bạn đã hủy đăng nhập Google");
    const code=url.searchParams.get("code");if(!code||code.length>4096)throw new AppError(400,"GOOGLE_CODE","Google chưa trả mã đăng nhập hợp lệ");
    let claims:JWTPayload;
    try{
      const response=await this.transport("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:this.config.clientId!,client_secret:this.config.clientSecret!,redirect_uri:`${this.origin()}/api/auth/google/callback`,grant_type:"authorization_code",code_verifier:flow.verifier}),signal:AbortSignal.timeout(10000)});
      if(!response.ok){await response.body?.cancel();throw new Error("Token exchange rejected");}
      const data=await response.json();if(typeof data.id_token!=="string"||data.id_token.length>16000)throw new Error("Missing ID token");
      claims=await this.verifyId(data.id_token,this.config.clientId!);
      if(typeof claims.nonce!=="string"||!timingSafeEqual(Buffer.from(digest(claims.nonce)),Buffer.from(flow.nonceHash))||typeof claims.sub!=="string"||!/^[\x21-\x7e]{1,255}$/.test(claims.sub)||(claims.azp!==undefined&&claims.azp!==this.config.clientId))throw new Error("Invalid ID claims");
    }catch{throw new AppError(401,"GOOGLE_VERIFY","Chưa xác thực được tài khoản Google, hãy thử lại");}
    const name=typeof claims.name==="string"?claims.name.normalize("NFC").replace(/[\p{C}]/gu,"").trim().replace(/\s+/g," ").slice(0,80):"Thành viên Google";
    const identity=await this.auth.google({subject:claims.sub!,name:name||"Thành viên Google",avatarUrl:isGooglePicture(claims.picture)?claims.picture:null});
    let user=identity.user;
    if(user.avatarSource!=="custom"&&isGooglePicture(claims.picture)&&this.avatars.configured()){
      try{user=await this.auth.setAvatar(user.id,await this.avatars.upload(user.id,claims.picture),"google");}catch{ /* Google photo remains a valid fallback if Cloudinary is temporarily unavailable. */ }
    }
    return {...await this.auth.issueSession(user,previous),returnTo:safeReturnTo(flow.returnTo)};
  }
}
export function getGoogleOAuth(){return new GoogleOAuthService(new PostgresOAuthFlows(getDatabasePool()),getAuthService(),new CloudinaryAvatars());}
