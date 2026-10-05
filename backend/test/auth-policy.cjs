const test=require('node:test'),assert=require('node:assert/strict');
const {validClaims,permitted}=require('../dist/auth/auth-policy');
test('rejects missing or invalid tenant and user claims',()=>{
  assert.equal(validClaims({sub:'x',tenantId:undefined}),false);
  assert.equal(validClaims({sub:'00000000-0000-0000-0000-000000000001',tenantId:'wrong'}),false);
  assert.equal(validClaims({sub:'00000000-0000-0000-0000-000000000001',tenantId:'00000000-0000-0000-0000-000000000002'}),true);
});
test('permissions deny absent grants and unrelated resources',()=>{
  assert.equal(permitted([],'agents:write'),false);
  assert.equal(permitted(['agents:read'],'agents:write'),false);
  assert.equal(permitted(['agents:*'],'users:write'),false);
  assert.equal(permitted(['agents:*'],'agents:write'),true);
  assert.equal(permitted(['*'],'agents:write'),true);
});
