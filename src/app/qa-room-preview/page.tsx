"use client";
import dynamic from "next/dynamic";
const Fixture=dynamic(()=>import("../../../scripts/qa/room-live"),{ssr:false});
export default function QaRoom(){return <Fixture/>;}
