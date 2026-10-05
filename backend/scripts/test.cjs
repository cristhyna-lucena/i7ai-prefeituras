const {spawnSync}=require('node:child_process');
const {readdirSync}=require('node:fs');
const files=readdirSync('test').filter(name=>name.endsWith('.cjs')).map(name=>'test/'+name);
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
process.exit(result.status??1);
