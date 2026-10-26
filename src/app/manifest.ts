import type {MetadataRoute} from "next";
export default function manifest():MetadataRoute.Manifest{return {name:"IdeaHub",short_name:"ideahub",description:"Cùng nhau phát triển ý tưởng",start_url:"/",display:"standalone",background_color:"#fff",theme_color:"#111",icons:[{src:"/icon-192.png",sizes:"192x192",type:"image/png"},{src:"/icon-512.png",sizes:"512x512",type:"image/png"}]};}
