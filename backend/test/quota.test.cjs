const test=require('node:test');
const assert=require('node:assert/strict');
require('reflect-metadata');
const {quotaFixture}=require('./helpers/quota-fixture.cjs');
function fixture(limit=10000n) {
 const records={usage:[]};let lock=Promise.resolve();
 const prisma={license:{findFirst:async()=>({status:'ACTIVE',startDate:new Date(Date.now()-86400000),endDate:null,maxTokens:limit})}, aiUsage:{create:async({data})=>{records.usage.push(data);return data;}}};
 prisma.$transaction=operation=>{const run=lock.then(()=>operation(prisma));lock=run.catch(()=>{});return run;};
 const quota=quotaFixture(prisma,records);
 const scope=quota.scope({tenantId:'tenant-a',agentId:'agent-a',modelId:'model-a',inputPrice:1,outputPrice:2});
 return {quota,scope,records,prisma};
}
test('concurrent requests reserve tenant quota before provider execution',async()=>{
 const {quota,scope,records}=fixture(5000n);let calls=0;let release;
 const gate=new Promise(resolve=>release=resolve);
 const operation=record=>{calls++;return gate.then(()=>record({inputTokens:10,outputTokens:5,measured:true}));};
 const first=quota.runRound(scope,{message:'hello'},1000,operation);
 await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(quota.runRound({...scope,runId:'second'}, {message:'hello'},1000,operation),/Saldo/);
 release();await first;
 assert.equal(calls,1);assert.equal(records.reservations[0].reservedTokens,0n);
});
test('interrupted request retains unknown budget and measured failed usage is preserved',async()=>{
 const {quota,scope,records}=fixture();
 await assert.rejects(quota.runRound(scope,{message:'hello'},1000,async()=>{throw Error('disconnected');}));
 await quota.finish(scope,'FAILED');
 assert.equal(records.usage[0].usageMeasured,false);assert.equal(records.usage[0].status,'FAILED');assert.ok(records.reservations[0].reservedTokens>0n);
 await assert.rejects(quota.runRound(scope,{},100,async record=>{await record({inputTokens:20,outputTokens:6,measured:true});throw Error('incomplete');}));
 await quota.finish(scope,'FAILED');
 assert.equal(records.usage[1].inputTokens,20);assert.equal(records.usage[1].status,'FAILED');assert.equal(records.reservations[1].reservedTokens,0n);
});
test('repeated partial or final counters are idempotent and explicit rejection releases reservation',async()=>{
 const {quota,scope,records}=fixture();const reservation=await quota.reserve(scope,1000n);
 const usage={inputTokens:20,outputTokens:5,measured:false};
 await quota.record(scope,reservation.id,usage);await quota.record(scope,reservation.id,usage);
 assert.equal(reservation.reservedTokens,975n);assert.equal(records.usage.length,1);
 await quota.record(scope,reservation.id,{...usage,measured:true});await quota.record(scope,reservation.id,{...usage,measured:true});
 assert.equal(reservation.reservedTokens,0n);assert.equal(records.usage.length,1);
 await assert.rejects(quota.runRound(scope,{},100,async()=>{throw {status:429};}));
 assert.equal(records.reservations[1].status,'REJECTED');assert.equal(records.reservations[1].reservedTokens,0n);
 await assert.rejects(quota.record(scope,reservation.id,{inputTokens:-1,outputTokens:0,measured:true}),/inválidos/);
});
