const test=require('node:test'),assert=require('node:assert/strict');
const {JwtService}=require('@nestjs/jwt');
const {tokenVerificationOptions,LOCAL_JWT_ISSUER,LOCAL_JWT_AUDIENCE}=require('../dist/auth/jwt-policy');
const env={NODE_ENV:'production',JWT_SECRET:'fixture-local-secret-32-characters-only',SGDM_JWT_SECRET:'fixture-sgdm-secret-32-characters-only',SGDM_JWT_ISSUER:'fixture-sgdm',SGDM_JWT_AUDIENCE:'fixture-module',STANDALONE_AUTH_ENABLED:'true'};
test('only SGDM signatures are accepted even with the legacy standalone flag',async()=>{
  const jwt=new JwtService();
  const local=jwt.sign({sub:'fixture'},{secret:env.JWT_SECRET,issuer:LOCAL_JWT_ISSUER,audience:LOCAL_JWT_AUDIENCE,expiresIn:'1h'});
  const sgdm=jwt.sign({sub:'fixture'},{secret:env.SGDM_JWT_SECRET,issuer:env.SGDM_JWT_ISSUER,audience:env.SGDM_JWT_AUDIENCE,expiresIn:'1h'});
  assert.throws(()=>tokenVerificationOptions(jwt.decode(local),env),/exclusivamente pelo SGDM/);
  assert.equal((await jwt.verifyAsync(sgdm,tokenVerificationOptions(jwt.decode(sgdm),env))).sub,'fixture');
  const forged=jwt.sign({sub:'fixture'},{secret:env.SGDM_JWT_SECRET,issuer:LOCAL_JWT_ISSUER,audience:LOCAL_JWT_AUDIENCE});
  assert.throws(()=>tokenVerificationOptions(jwt.decode(forged),env));
});
test('local tokens are refused in every environment',()=>{
  assert.throws(()=>tokenVerificationOptions({iss:LOCAL_JWT_ISSUER},{...env,STANDALONE_AUTH_ENABLED:'false'}));
  assert.throws(()=>tokenVerificationOptions({iss:LOCAL_JWT_ISSUER},{...env,JWT_SECRET:undefined}));
  assert.throws(()=>tokenVerificationOptions({iss:LOCAL_JWT_ISSUER},{...env,NODE_ENV:'development'}));
});
test('SGDM tokens require the configured issuer, audience and HS256 algorithm',async()=>{
  const jwt=new JwtService();
  const wrong=jwt.sign({sub:'fixture'},{secret:env.SGDM_JWT_SECRET,issuer:env.SGDM_JWT_ISSUER,audience:'other-module'});
  await assert.rejects(jwt.verifyAsync(wrong,tokenVerificationOptions(jwt.decode(wrong),env)));
  const wrongIssuer=jwt.sign({sub:'fixture'},{secret:env.SGDM_JWT_SECRET,issuer:'other-system',audience:env.SGDM_JWT_AUDIENCE});
  await assert.rejects(jwt.verifyAsync(wrongIssuer,tokenVerificationOptions(jwt.decode(wrongIssuer),env)));
  const wrongAlgorithm=jwt.sign({sub:'fixture'},{secret:env.SGDM_JWT_SECRET,issuer:env.SGDM_JWT_ISSUER,audience:env.SGDM_JWT_AUDIENCE,algorithm:'HS384'});
  await assert.rejects(jwt.verifyAsync(wrongAlgorithm,tokenVerificationOptions(jwt.decode(wrongAlgorithm),env)));
  assert.deepEqual(tokenVerificationOptions({},env).algorithms,['HS256']);
});
