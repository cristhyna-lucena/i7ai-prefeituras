const test=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');require('reflect-metadata');
const {ToolsService}=require('../dist/tools/tools.service');const {queryInput,searchResults}=require('../dist/tools/query-tools');
test('internal query enforces tenant, linked READY documents and safe projection',async()=>{
 let query;const tool={id:'tool-a',type:'INTERNAL_DATABASE',config:{resource:'documents',maxResults:5},allowedDomains:[],credentials:[]};
 const prisma={agentTool:{findFirst:async({where})=>{assert.equal(where.agent.tenantId,'tenant-a');return {tool};}},document:{findMany:async input=>{query=input;return [{id:'doc',name:'Lei'}];}},auditLog:{create:async()=>{}}};
 const tools=new ToolsService(prisma);const result=await tools.execute('tenant-a','agent-a','tool-a',{query:'Lei',limit:20});
 assert.equal(result.data[0].name,'Lei');assert.equal(query.where.tenantId,'tenant-a');assert.equal(query.where.status,'READY');assert.equal(query.where.knowledgeBase.agents.some.agentId,'agent-a');assert.equal(query.take,5);
 assert.equal(query.select.storageKey,undefined);assert.equal(query.select.passwordHash,undefined);
 await assert.rejects(tools.execute('tenant-a','agent-a','tool-a',{query:'Lei',sql:'select *'}),/Informe query/);
 tool.config.resource='users';await assert.rejects(tools.execute('tenant-a','agent-a','tool-a',{query:'Lei'}),/SQL/);
});
test('external search sends encoded query only to permitted provider and sanitizes bounded results',async t=>{
 const previous=process.env.TOOLS_ALLOW_PRIVATE_NETWORK;process.env.TOOLS_ALLOW_PRIVATE_NETWORK='true';t.after(()=>{if(previous===undefined)delete process.env.TOOLS_ALLOW_PRIVATE_NETWORK;else process.env.TOOLS_ALLOW_PRIVATE_NETWORK=previous;});
 let url;const server=http.createServer((request,response)=>{url=new URL(request.url,'http://localhost');response.setHeader('Content-Type','application/json');response.end(JSON.stringify({web:{results:[{title:'Portal',url:'https://prefeitura.example/lei',description:'Lei pública'},{url:'javascript:alert(1)'},{title:'Outro',url:'https://prefeitura.example/2'}]}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const tool={id:'search-a',type:'EXTERNAL_SEARCH',config:{endpoint:'http://127.0.0.1:'+server.address().port+'/search',queryParam:'q',maxResults:2},allowedDomains:['127.0.0.1'],credentials:[]};
 const service=new ToolsService({agentTool:{findFirst:async()=>({tool})},auditLog:{create:async()=>{}}});
 const result=await service.execute('tenant-a','agent-a','search-a',{query:'lei & gestão',limit:2});
 assert.equal(url.searchParams.get('q'),'lei & gestão');assert.equal(result.data.length,1);assert.equal(result.data[0].title,'Portal');
 assert.throws(()=>searchResults({unexpected:[]},5),/lista/);assert.throws(()=>queryInput({query:'x',limit:21}),/limit/);
});
