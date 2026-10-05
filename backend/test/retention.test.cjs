const test=require('node:test'); const assert=require('node:assert/strict');require('reflect-metadata');
const {RetentionService,retentionDays}=require('../dist/retention/retention.service');
test('retention stays disabled without an explicit valid tenant policy',async()=>{
 for(const value of [null,{},[],{retentionDays:0},{retentionDays:'30'},{retentionDays:3651},{retentionDays:1.5},{retentionDays:null}]) assert.equal(retentionDays(value),null);
 assert.equal(retentionDays({retentionDays:30}),30);
 const prisma={$queryRaw:async()=>[],tenant:{findUnique:async()=>({status:'ACTIVE',settings:{}})}};prisma.$transaction=fn=>fn(prisma);
 assert.deepEqual(await new RetentionService(prisma).pruneTenant('a'),{conversations:0,executions:0});
});
test('retention scopes date and terminal status, batches cleanup and preserves active conversations',async()=>{
 const queries=[];let active=1;
 const prisma={$queryRaw:async()=>[],tenant:{findUnique:async()=>({status:'ACTIVE',settings:{retentionDays:30}})},aiTokenReservation:{count:async()=>active},
 conversation:{findMany:async input=>{queries.push(input);return [{id:'old'}];},deleteMany:async input=>{queries.push(input);return {count:1};}},
 automationExecution:{findMany:async input=>{queries.push(input);return [{id:'old-execution'}];},updateMany:async input=>{queries.push(input);return {count:1};}},auditLog:{create:async input=>queries.push(input)}};
 prisma.$transaction=fn=>fn(prisma);const service=new RetentionService(prisma);const now=new Date('2026-10-02T12:00:00Z');
 assert.deepEqual(await service.pruneTenant('tenant-a',now),{conversations:0,executions:1});
 assert.deepEqual(queries[0].where.status.in,['SUCCESS','FAILED','CANCELLED']);assert.equal(queries[0].where.finishedAt.lt.toISOString(),'2026-09-02T12:00:00.000Z');
 assert.equal(queries[1].where.tenantId,'tenant-a');assert.equal(queries[1].data.error,null);assert.equal(queries[1].data.dataPurgedAt,now);
 active=0;assert.deepEqual(await service.pruneTenant('tenant-a',now),{conversations:1,executions:1});
 assert.equal(queries[3].take,500);assert.equal(queries[4].where.tenantId,'tenant-a');assert.ok(queries[4].where.updatedAt.lt);
});
