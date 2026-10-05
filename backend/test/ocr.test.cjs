const test=require('node:test'); const assert=require('node:assert/strict');
const {scannedPdfFixture}=require('./helpers/scanned-pdf.cjs');
const {extractDocumentText}=require('../dist/knowledge/document-extractor');
test('Portuguese OCR extracts a real image-only PDF with bundled local language data',async()=>{
 const buffer=scannedPdfFixture(); const {PDFParse}=require('pdf-parse');const parser=new PDFParse({data:new Uint8Array(buffer)});
 try { assert.equal((await parser.getText({pageJoiner:''})).text.trim(),''); } finally {await parser.destroy();}
 const text=await extractDocumentText('digitalizacao.pdf',buffer);
 assert.match(text,/GEST[AÃ]O DOCUMENTAL MUNICIPAL/i);assert.match(text,/30 dias/i);assert.match(text,/OCR local/i);
});
test('mixed PDF preserves native text and extracts its scanned page',async()=>{
 const text=await extractDocumentText('misto.pdf',scannedPdfFixture({digitalPage:true}));
 assert.match(text,/30 dias/i);assert.match(text,/Digital page preserved/);assert.equal((text.match(/Digital page preserved/g)||[]).length,1);
});
test('OCR page count is bounded before starting a subprocess',async()=>{
 const {ocrPdfPages}=require('../dist/knowledge/pdf-ocr');
 await assert.rejects(ocrPdfPages({},Array.from({length:21},(_,i)=>({num:i+1,text:''}))),/20 páginas/);
});
