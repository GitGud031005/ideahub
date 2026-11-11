"use client";
import dynamic from "next/dynamic";
const Fixture=dynamic(()=>import("../../../scripts/qa/shared-status"),{ssr:false});
export default function Preview(){return <Fixture/>;}
