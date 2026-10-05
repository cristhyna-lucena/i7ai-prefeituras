const {createCanvas}=require('@napi-rs/canvas');
const {deflateSync}=require('node:zlib');
function scannedPdfFixture({digitalPage=false}={}) {
 const width=1200,height=600;const canvas=createCanvas(width,height);const ctx=canvas.getContext('2d');
 ctx.fillStyle='white';ctx.fillRect(0,0,width,height);ctx.fillStyle='black';ctx.font='48px Arial';
 ctx.fillText('GESTAO DOCUMENTAL MUNICIPAL',60,130);
 ctx.fillText('O prazo de publicacao e de 30 dias.',60,240);
 ctx.fillText('Prefeitura: teste de OCR local.',60,350);
 const rgba=ctx.getImageData(0,0,width,height).data;const rgb=Buffer.alloc(width*height*3);
 for(let i=0,j=0;i<rgba.length;i+=4){rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2];}
 const image=deflateSync(rgb);const commands=Buffer.from('q 600 0 0 300 0 0 cm /Scan Do Q');
 const stream=(dictionary,data)=>Buffer.concat([Buffer.from(dictionary+' /Length '+data.length+' >>\nstream\n'),data,Buffer.from('\nendstream')]);
 const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from(digitalPage ? '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>' : '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
 Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 300] /Resources << /XObject << /Scan 4 0 R >> >> /Contents 5 0 R >>'),
 stream('<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode',image),stream('<<',commands)];
 if(digitalPage) objects.push(Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 300] /Resources << /Font << /F1 8 0 R >> >> /Contents 7 0 R >>'),stream('<<',Buffer.from('BT /F1 20 Tf 40 200 Td (Digital page preserved) Tj ET')),Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
 const parts=[Buffer.from('%PDF-1.4\n')];const offsets=[];let offset=parts[0].length;
 objects.forEach((object,index)=>{offsets.push(offset);const part=Buffer.concat([Buffer.from((index+1)+' 0 obj\n'),object,Buffer.from('\nendobj\n')]);parts.push(part);offset+=part.length;});
 const size=objects.length+1;
 const xref='xref\n0 '+size+'\n0000000000 65535 f \n'+offsets.map(value=>String(value).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+size+' /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF';
 return Buffer.concat([...parts,Buffer.from(xref)]);
}
module.exports={scannedPdfFixture};
