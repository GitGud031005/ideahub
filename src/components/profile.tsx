"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { Account, Session } from "@/lib/domain";
import { api } from "@/lib/api-client";
import { profileSchema, passwordChangeFormSchema } from "@/lib/auth-validation";
import { AvatarPicker } from "./avatar";
import { AccountMenu } from "./account-menu";
import { useAuth, useSession } from "./providers";
import { ErrorState, LoadingState } from "./status";

function PasswordField({id,label,value,onChange,error,disabled,autoComplete}:{id:string;label:string;value:string;onChange:(value:string)=>void;error?:string;disabled:boolean;autoComplete:string}) {
  const [show,setShow]=useState(false);
  return <><label htmlFor={id} className="ih-field-label">{label}</label><div className="ih-password"><input id={id} name={id} className="ih-field" type={show?"text":"password"} autoComplete={autoComplete} maxLength={128} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} aria-invalid={!!error} aria-describedby={error?`${id}-error`:undefined}/><button className="ih-password-toggle" type="button" disabled={disabled} aria-label={`${show?"Ẩn":"Hiện"} ${label.toLowerCase()}`} onClick={()=>setShow(!show)}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>{error&&<p id={`${id}-error`} className="ih-field-error" role="alert">{error}</p>}</>;
}

function ProfileForm({user}:{user:Account}) {
  const {updateProfile}=useAuth(), [name,setName]=useState(user.name),[nameError,setNameError]=useState(""),[savedName,setSavedName]=useState(false);
  const [file,setFile]=useState<File|null>(null),[savedAvatar,setSavedAvatar]=useState(false),[passwords,setPasswords]=useState({currentPassword:"",newPassword:"",confirmPassword:""});
  const [passwordErrors,setPasswordErrors]=useState<Record<string,string>>({}),[savedPassword,setSavedPassword]=useState(false),passwordForm=useRef<HTMLFormElement>(null);
  const config=useQuery({queryKey:["auth-config"],queryFn:({signal})=>api<{avatarUpload:boolean;google:boolean}>("/auth/config",{signal}),staleTime:300000});
  const details=useMutation({mutationFn:(next:string)=>api<Session>("/auth/profile",{method:"POST",body:JSON.stringify({name:next})}),onSuccess:async next=>{await updateProfile(next);setName(next.user!.name);setSavedName(true);}});
  const photo=useMutation({mutationFn:()=>{const body=new FormData();body.set("avatar",file!);return api<Session>("/auth/avatar",{method:"POST",body});},onSuccess:async next=>{await updateProfile(next);setFile(null);setSavedAvatar(true);}});
  const password=useMutation({mutationFn:(input:{currentPassword:string;newPassword:string})=>api<Session>("/auth/password",{method:"POST",body:JSON.stringify(input)}),onSuccess:async next=>{setPasswords({currentPassword:"",newPassword:"",confirmPassword:""});await updateProfile(next);setSavedPassword(true);}});
  const busy=details.isPending||photo.isPending||password.isPending;
  function saveName(event:FormEvent) {
    event.preventDefault();if(busy)return;setSavedName(false);
    const result=profileSchema.safeParse({name});
    if(!result.success){setNameError(result.error.issues[0].message);return;}
    setNameError("");details.mutate(result.data.name);
  }
  function savePassword(event:FormEvent) {
    event.preventDefault();if(busy)return;setSavedPassword(false);
    const result=passwordChangeFormSchema.safeParse(passwords);
    if(!result.success){const fields:Record<string,string>={};for(const issue of result.error.issues)fields[String(issue.path[0])]??=issue.message;setPasswordErrors(fields);passwordForm.current?.querySelector<HTMLInputElement>(`[name="${Object.keys(fields)[0]}"]`)?.focus();return;}
    setPasswordErrors({});password.mutate({currentPassword:result.data.currentPassword,newPassword:result.data.newPassword});
  }
  return <div className="ih-profile-layout">
    <section className="ih-profile-card ih-profile-photo" aria-labelledby="profile-avatar-title"><span className="ih-profile-section-icon"><UserRound size={18} aria-hidden="true"/></span><h2 id="profile-avatar-title">Ảnh đại diện</h2><p>Một hình ảnh để mọi người nhận ra bạn</p>
      <AvatarPicker file={file} onChange={next=>{setFile(next);setSavedAvatar(false);photo.reset();}} initial={user.initial} avatarUrl={user.avatarUrl} disabled={busy||!config.data?.avatarUpload}/>
      {config.isPending?<p className="ih-profile-hint">Đang kết nối ảnh đại diện...</p>:config.error?<p className="ih-form-error" role="alert">Chưa tải được cấu hình ảnh <button className="ih-text-button" onClick={()=>config.refetch()}>Thử lại</button></p>:!config.data?.avatarUpload&&<p className="ih-profile-hint">Tải ảnh đang tạm ngưng</p>}
      {photo.error&&<p className="ih-form-error" role="alert">{photo.error.message}</p>}{savedAvatar&&<p className="ih-profile-success" role="status"><Check size={14}/>Đã cập nhật ảnh đại diện</p>}
      <button type="button" className="ih-primary" disabled={busy||!file||!config.data?.avatarUpload} onClick={()=>photo.mutate()}>{photo.isPending?"Đang lưu ảnh...":"Lưu ảnh đại diện"}</button>
      <div className="ih-profile-account-type"><span>Phương thức đăng nhập</span><strong>{user.provider==="google"?"Google":`Username · @${user.username}`}</strong></div>
    </section>
    <div className="ih-profile-forms"><section className="ih-profile-card" aria-labelledby="profile-name-title"><h2 id="profile-name-title">Thông tin hiển thị</h2><p>Tên của bạn xuất hiện trên ý tưởng và bình luận</p><form noValidate onSubmit={saveName} aria-busy={details.isPending}>
      <label htmlFor="profile-name" className="ih-field-label">Tên hiển thị</label><input id="profile-name" name="name" className="ih-field" autoComplete="name" maxLength={80} value={name} disabled={busy} aria-invalid={!!nameError} aria-describedby={nameError?"profile-name-error":"profile-name-hint"} onChange={e=>{setName(e.target.value);setNameError("");setSavedName(false);details.reset();}}/>
      {nameError?<p id="profile-name-error" className="ih-field-error" role="alert">{nameError}</p>:<p id="profile-name-hint" className="ih-profile-hint">Từ 2 đến 80 ký tự</p>}
      {details.error&&<p className="ih-form-error" role="alert">{details.error.message}</p>}{savedName&&<p className="ih-profile-success" role="status"><Check size={14}/>Đã lưu tên hiển thị</p>}
      <div className="ih-form-footer"><button className="ih-primary" disabled={busy||name.trim()===user.name} type="submit">{details.isPending?"Đang lưu...":"Lưu thay đổi"}</button></div>
    </form></section>
    {user.provider!=="google"&&<section className="ih-profile-card" aria-labelledby="profile-password-title"><span className="ih-profile-section-icon"><LockKeyhole size={18} aria-hidden="true"/></span><h2 id="profile-password-title">Đổi mật khẩu</h2><p>Dùng ít nhất 8 ký tự. Các phiên đăng nhập khác sẽ được đăng xuất sau khi đổi</p><form ref={passwordForm} noValidate onSubmit={savePassword} aria-busy={password.isPending}>
      {([{key:"currentPassword",label:"Mật khẩu hiện tại",autoComplete:"current-password"},{key:"newPassword",label:"Mật khẩu mới",autoComplete:"new-password"},{key:"confirmPassword",label:"Nhập lại mật khẩu mới",autoComplete:"new-password"}] as const).map(field=><PasswordField key={field.key} id={field.key} label={field.label} value={passwords[field.key]} autoComplete={field.autoComplete} disabled={busy} error={passwordErrors[field.key]} onChange={value=>{setPasswords(current=>({...current,[field.key]:value}));setPasswordErrors(current=>({...current,[field.key]:""}));setSavedPassword(false);password.reset();}}/>)}
      {password.error&&<p className="ih-form-error" role="alert">{password.error.message}</p>}{savedPassword&&<p className="ih-profile-success" role="status"><Check size={14}/>Đã đổi mật khẩu</p>}
      <div className="ih-form-footer"><button type="submit" className="ih-primary" disabled={busy||!passwords.currentPassword||!passwords.newPassword||!passwords.confirmPassword}>{password.isPending?"Đang cập nhật...":"Đổi mật khẩu"}</button></div>
    </form></section>}
    </div>
  </div>;
}

export function Profile() {
  const session=useSession(),{user,requestLogin}=useAuth();
  return <><header className="ih-header ih-profile-header"><Link className="ih-logo" href="/" aria-label="IdeaHub — trang chủ">ideahub<span>.</span></Link><Link href="/" className="ih-profile-back"><ArrowLeft size={15} aria-hidden="true"/>Bảng ý tưởng</Link><div className="ih-header-actions"><AccountMenu/></div></header>
    <main className="ih-profile-main"><div className="ih-profile-title"><span className="ih-eyebrow">GÓC CỦA BẠN</span><h1>Hồ sơ cá nhân</h1><p>Một vài điều để mọi người biết đến bạn</p></div>
    {session.isPending?<LoadingState label="Đang mở hồ sơ..."/>:session.error?<ErrorState error={session.error} retry={()=>{session.refetch();}}/>:user?<ProfileForm key={user.id} user={user}/>:<section className="ih-profile-card ih-profile-guest"><h2>Đăng nhập để chỉnh sửa hồ sơ</h2><p>Ảnh đại diện và tên hiển thị của bạn sẽ được lưu ở đây</p><button type="button" className="ih-primary" onClick={()=>requestLogin(undefined,"/profile")}>Đăng nhập</button></section>}
    </main></>;
}
