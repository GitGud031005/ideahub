export function qaPdf(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>','', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(const [index,label] of [[3,'Mobile preview - page 1'],[5,'Landscape page 2']] as const){const data=`BT /F1 22 Tf 24 340 Td (${label}) Tj ET\n0.2 0.5 0.7 rg 24 80 300 140 re f\n`;objects[index]=`<< /Length ${data.length} >>\nstream\n${data}endstream`;}
 let text='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(text.length);text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const start=text.length;text+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
 return new TextEncoder().encode(text);
}
