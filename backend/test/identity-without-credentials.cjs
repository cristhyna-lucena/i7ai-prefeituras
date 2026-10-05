require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {ValidationPipe}=require('@nestjs/common');
const {CreateUserDto,UpdateUserDto}=require('../dist/catalog/catalog.dto');
const pipe=new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true});
test('identities accept no local credentials and reject legacy password fields',async()=>{
 const input={name:'Pessoa de Teste',email:'pessoa@example.test'};
 assert.equal((await pipe.transform(input,{type:'body',metatype:CreateUserDto})).email,input.email);
 await assert.rejects(pipe.transform({...input,password:'legacy-test-password'},{type:'body',metatype:CreateUserDto}),/Bad Request/);
 await assert.rejects(pipe.transform({password:'legacy-test-password'},{type:'body',metatype:UpdateUserDto}),/Bad Request/);
});
