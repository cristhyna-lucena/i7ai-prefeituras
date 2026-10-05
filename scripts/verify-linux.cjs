const {spawnSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const {scannedPdfFixture}=require('../backend/test/helpers/scanned-pdf.cjs');
const suffix=randomUUID().slice(0,8);
const backendName='i7ai-ocr-verification-'+suffix;
const frontendName='i7ai-web-verification-'+suffix;
function docker(args,options={}) {
 const result=spawnSync('docker',args,{windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:1024*1024,...options});
 if(result.error || result.status!==0) throw new Error('Linux verification failed: '+args.slice(0,3).join(' ')+'; '+(result.error?.message || result.stderr || '').slice(0,600));
 return result.stdout;
}
try {
 const code=`const assert=require('node:assert/strict');assert.notEqual(process.getuid(),0);const {extractDocumentText}=require('./dist/knowledge/document-extractor');let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',async()=>{try{const text=await extractDocumentText('scan.pdf',Buffer.from(input,'base64'));assert.match(text,/30 dias/i);assert.match(text,/OCR local/i);console.log('Linux OCR OK: non-root, real scanned PDF, local Portuguese model, network disabled.');}catch(error){console.error(error.message);process.exitCode=1;}});`;
 console.log(docker(['run','--rm','--name',backendName,'--network','none','--memory','768m','--pids-limit','64','-i','i7ai-backend:verification-20261002','node','-e',code],{input:scannedPdfFixture().toString('base64')}).trim());
 docker(['run','-d','--rm','--name',frontendName,'--network','none','i7ai-frontend:verification-20261002']);
 assert.notEqual(docker(['exec',frontendName,'id','-u']).trim(),'0');
 const get=path=>docker(['exec',frontendName,'wget','-qO-','http://127.0.0.1:8080'+path]);
 assert.equal(get('/healthz').trim(),'ok');
 const html=get('/');assert.match(html,/id="root"/);
 const js=html.match(/src="([^"]+\.js)"/)[1];const css=html.match(/href="([^"]+\.css)"/)[1];
 const bundle=get(js);assert.ok(!bundle.includes('localhost:3000'));assert.ok(!bundle.includes('fixture-session'));
 assert.ok(get(css).includes('--sd-color-primary'));
 console.log('Linux frontend OK: non-root Nginx, health/index/assets, SGDM tokens and production API path.');
} finally {
 for(const name of [backendName,frontendName]) spawnSync('docker',['rm','-f',name],{windowsHide:true,stdio:'ignore',timeout:10000});
}
