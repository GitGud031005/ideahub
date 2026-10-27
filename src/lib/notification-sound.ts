/** Audio is unlocked only by a real page gesture (required by Safari and Chrome). */
export function notificationSound(){
 let context:AudioContext|undefined,next=0;
 const unlock=()=>{const Audio=window.AudioContext??(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!Audio)return;try{context??=new Audio();void context.resume().catch(()=>{});}catch{}};
 const play=()=>{
  if(!context||context.state!=="running")return;
  const start=Math.max(context.currentTime,next);next=start+.38;
  for(const [offset,frequency] of [[0,880],[.12,1174]]){const tone=context.createOscillator(),gain=context.createGain();tone.frequency.value=frequency;tone.connect(gain);gain.connect(context.destination);gain.gain.setValueAtTime(0,start+offset);gain.gain.linearRampToValueAtTime(.075,start+offset+.01);gain.gain.exponentialRampToValueAtTime(.001,start+offset+.17);tone.start(start+offset);tone.stop(start+offset+.18);}
 };
 window.addEventListener("pointerdown",unlock);window.addEventListener("keydown",unlock);
 return {play,close(){window.removeEventListener("pointerdown",unlock);window.removeEventListener("keydown",unlock);void context?.close().catch(()=>{});}};
}
