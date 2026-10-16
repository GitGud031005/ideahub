"use client";
import { useEffect, useRef } from "react";
function animatePrism(canvas: HTMLCanvasElement, hero: HTMLElement, heading: HTMLElement, subcopy: HTMLElement) {
 const context=canvas.getContext('2d');if(!context)return ()=>{};
 const ctx: CanvasRenderingContext2D=context;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const prismImage=new Image();let imageLoaded=false;
  let w=0,h=0,rayY=0,frameLeft=0,frameWidth=0,dpr=1,frame=0,started=0,lastPaint=0,inView=true;
  const light=.45;
  function polygon(points: readonly (readonly number[])[]){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();}
  function line(points: readonly (readonly number[])[],style: string | CanvasGradient,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle=style;ctx.lineWidth=width;ctx.stroke();}
  function gradient(x0: number,y0: number,x1: number,y1: number,stops: [number,string][]){const g=ctx.createLinearGradient(x0,y0,x1,y1);stops.forEach(s=>g.addColorStop(s[0],s[1]));return g;}
  function draw(progress=1){
   if(w<=0||h<=0)return;
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   // Anchor the glass to the same bounded frame as the text, even on ultrawide displays.
   const mobile=w<=640;
   const baseSize=mobile?Math.min(160,frameWidth*.44):Math.max(0,Math.min(330,frameWidth*.27,(rayY-26)/.554,(h-rayY-34)/.56));
   const size=baseSize*1.08;
   const baseEdge=rayY+(mobile?4:8)+baseSize*.49875;
   const cx=frameLeft+frameWidth*(mobile?.60:.81),hw=size*.44,cy=baseEdge-size*.4147;
   const A=[cx,cy-size*.56],B=[cx-hw,cy+size*.44],C=[cx+hw,cy+size*.44];
   const depth=[size*.11,-size*.075],add=(p: readonly number[])=>[p[0]+depth[0],p[1]+depth[1]];
   const photoSize=size*1.14,photoX=cx-photoSize*.47,photoY=cy-size*.56-photoSize*.075;
   const entry=[imageLoaded?cx-size*.5073*((rayY-A[1])/(size*.9519)):cx-hw*((rayY-A[1])/size),rayY],exitY=rayY+size*.025;
   const sideRatio=(exitY-photoY-photoSize*.076)/(photoSize*.784);
   const exit=[imageLoaded?photoX+photoSize*(.555+.415*sideRatio):cx+hw*((exitY-A[1])/size),exitY];
   const reach=w-exit[0],spread=Math.min(h*.23,reach*.42),pulse=Math.sin(Math.PI*progress);
   // Ground caustic and a soft contact shadow give the glass volume.
   ctx.save();ctx.filter='blur(12px)';ctx.fillStyle='#31374613';ctx.beginPath();ctx.ellipse(cx+depth[0]*.5,C[1]+size*.03,hw*1.02,size*.04,0,0,Math.PI*2);ctx.fill();ctx.restore();
   // A continuous black incident ray, from the literal left edge.
   line([[0,rayY],entry],'#22221f',1.25);
   if(progress<1){const x=entry[0]*progress;line([[Math.max(0,x-45),rayY],[x,rayY]],gradient(Math.max(0,x-45),0,x+.1,0,[[0,'#22222200'],[1,'#080808']]),2);}
   // Dispersion keeps its color all the way to the literal right edge.
   const colors=[[227,108,114],[235,163,96],[224,196,101],[126,177,146],[115,168,199],[136,141,192],[178,144,190]];
   colors.forEach((rgb,i)=>{
    const top=exitY-spread+(spread*2)*i/7,bottom=exitY-spread+(spread*2)*(i+1)/7;
    ctx.save();polygon([[exit[0]-.5,exitY-.6],[w+1,top],[w+1,bottom],[exit[0]-.5,exitY+.6]]);
    ctx.fillStyle=gradient(exit[0],exitY,w,exitY,[[0,`rgba(${rgb},.92)`],[.2,`rgba(${rgb},.78)`],[1,`rgba(${rgb},.64)`]]);
    ctx.shadowColor=`rgba(${rgb},${.16+pulse*.1})`;ctx.shadowBlur=12+pulse*7;ctx.fill();ctx.restore();
   });
   if(imageLoaded){
    ctx.drawImage(prismImage,photoX,photoY,photoSize,photoSize);
    // Keep the incident light visible through the photographed glass.
    ctx.save();polygon([[cx,cy-size*.56],[cx-size*.5073,cy+size*.3919],[cx+size*.4959,cy+size*.4147]]);ctx.clip();
    line([entry,[cx+size*.03,rayY+size*.012],exit],gradient(entry[0],0,exit[0],0,[[0,'#30343b73'],[.65,'#5c64773d'],[1,'#ffffffc9']]),.9);
    const sweep=cx-size*.7+progress*size*1.5;
    ctx.fillStyle=gradient(sweep-size*.12,0,sweep+size*.12,0,[[0,'#ffffff00'],[.5,`rgba(255,255,255,${pulse*.24})`],[1,'#ffffff00']]);ctx.fillRect(cx-size*.55,cy-size*.6,size*1.1,size*1.1);
    ctx.restore();
   }else{
   // Lightweight fallback while the self-contained image decodes.
   polygon([A,add(A),add(C),C]);ctx.fillStyle=gradient(A[0],A[1],add(C)[0],C[1],[[0,'#ffffffbd'],[.42,'#9aa6b338'],[.63,'#ffffffdb'],[1,'#8e9aa74a']]);ctx.fill();line([A,add(A),add(C),C],'#737d875c',.7);
   polygon([B,C,add(C),add(B)]);ctx.fillStyle=gradient(0,C[1]-depth[1],0,C[1],[[0,'#737f901c'],[.6,'#ffffff80'],[1,'#838d9d38']]);ctx.fill();
   polygon([A,B,C]);ctx.fillStyle=gradient(B[0],A[1],C[0],C[1],[[0,'#ffffffb8'],[.25,'#eef3f646'],[.5,'#b1c1ce24'],[.72,'#ffffffaf'],[1,'#b8c3ce4a']]);ctx.fill();
   // Refracted ray and geometric internal reflections, clipped to glass.
   ctx.save();polygon([A,B,C]);ctx.clip();
   line([entry,[cx+size*.02,rayY+size*.02],exit],gradient(entry[0],0,exit[0],0,[[0,'#42494d8c'],[.7,'#c0c9d471'],[1,'#ffffffd9']]),1);
   line([[A[0]+size*.025,A[1]],[B[0]+size*.07,B[1]],C],'#ffffffb5',1.4);
   line([[cx+size*.03,A[1]+size*.15],[cx-size*.1,C[1]],[cx+size*.25,rayY-size*.04]],'#a2afb729',.8);
   const sweep=cx-size*.65+progress*size*1.4;
   ctx.fillStyle=gradient(sweep-size*.16,0,sweep+size*.16,0,[[0,'#ffffff00'],[.46,'#ffffff00'],[.5,`rgba(255,255,255,${.3+pulse*.35})`],[.57,'#ffffff00'],[1,'#ffffff00']]);ctx.fillRect(B[0],A[1],hw*2,size);
   const highlight=ctx.createRadialGradient(cx-hw*.4+light*hw,rayY-size*.28,1,cx,rayY,size*.65);highlight.addColorStop(0,'#ffffffa6');highlight.addColorStop(.45,'#ffffff19');highlight.addColorStop(1,'#ffffff00');ctx.fillStyle=highlight;ctx.fillRect(B[0],A[1],hw*2,size);
   ctx.restore();
   line([A,B,C,A],'#64727e7a',.8);line([[A[0]-.1,A[1]+2],[B[0]+1.3,B[1]-.8],[C[0]-1.3,C[1]-.8]],'#ffffffea',1);
   line([add(A),add(C)],'#ffffffdf',1.4);
   }
   // A localized flare at the exit face, rather than a floating flat dot.
   const radius=9+pulse*8,flare=ctx.createRadialGradient(exit[0],exitY,0,exit[0],exitY,radius);flare.addColorStop(0,'#ffffffff');flare.addColorStop(.14,'#ffffffed');flare.addColorStop(.4,'#f4e9ff75');flare.addColorStop(1,'#ffffff00');ctx.fillStyle=flare;ctx.fillRect(exit[0]-radius,exitY-radius,radius*2,radius*2);
   line([[exit[0]-4,exitY],[exit[0]+4,exitY]],'#ffffffeb',.8);
  }
  function resize(){
   const rect=hero.getBoundingClientRect(),head=heading.getBoundingClientRect(),copy=subcopy.getBoundingClientRect();
   const content=heading.parentElement!.getBoundingClientRect();
   frameLeft=content.left-rect.left;frameWidth=content.width;
   w=rect.width;h=rect.height;rayY=(head.bottom+copy.top)/2-rect.top;dpr=Math.min(window.devicePixelRatio||1,2);
   canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));draw(1);
  }
  function stop(){cancelAnimationFrame(frame);frame=0;}
  function tick(now: number){if(reduced.matches||document.hidden||!inView){frame=0;return;}const progress=((now-started)%6200)/6200;if(now-lastPaint>=33){draw(progress);lastPaint=now;}frame=requestAnimationFrame(tick);}
  function play(){stop();if(reduced.matches||document.hidden||!inView){draw(1);return;}started=performance.now();lastPaint=0;frame=requestAnimationFrame(tick);}
  reduced.addEventListener('change',play);
  const visibility=()=>{if(document.hidden)stop();else play();};
  document.addEventListener('visibilitychange',visibility);
  const visibilityObserver=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(inView)play();else stop();},{threshold:.01});visibilityObserver.observe(hero);
  const observer=new ResizeObserver(resize);observer.observe(hero);observer.observe(heading);observer.observe(subcopy);
  let disposed=false;
  document.fonts.ready.then(()=>{if(!disposed)resize();});
  prismImage.onload=()=>{imageLoaded=true;resize();};
  prismImage.onerror=()=>{imageLoaded=false;resize();};
  prismImage.src="/assets/prism-studio.webp";
  resize();play();
  return ()=>{disposed=true;stop();observer.disconnect();visibilityObserver.disconnect();reduced.removeEventListener('change',play);document.removeEventListener('visibilitychange',visibility);prismImage.onload=null;prismImage.onerror=null;};
}

export function Hero() {
 const hero=useRef<HTMLElement>(null),canvas=useRef<HTMLCanvasElement>(null),heading=useRef<HTMLHeadingElement>(null),copy=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(hero.current&&canvas.current&&heading.current&&copy.current)return animatePrism(canvas.current,hero.current,heading.current,copy.current);},[]);
 return <section className="ih-intro" ref={hero} aria-label="Nơi những ý tưởng lớn gặp nhau"><canvas ref={canvas} className="ih-hero-optics" aria-hidden="true"/><div className="ih-hero-copy"><h1 ref={heading}>Nơi những ý tưởng lớn<br/><em>gặp nhau</em></h1><div ref={copy} className="ih-hero-subcopy"><p>Hội tụ những tia sáng, mở lối cho ý tưởng</p><p>Cùng nhau biến những ý tưởng của chúng ta thành hiện thực</p></div></div></section>;
}
