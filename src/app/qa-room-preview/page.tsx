"use client";
import dynamic from "next/dynamic";
const QA=dynamic(()=>import("../../../scripts/qa/attachments"),{ssr:false});
export default function Page(){return <QA/>;}
