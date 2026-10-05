const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const parser=require('@babel/parser');
const traverse=require('@babel/traverse').default;
const postcss=require('postcss');
const files=[];
function scan(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const name=path.join(folder,entry.name);if(entry.isDirectory())scan(name);else if(/\.(jsx|css)$/.test(name))files.push(name);}}
scan('src');
scan('preview');
const tokenSource=fs.readFileSync('node_modules/@sgdm/design/dist/tokens.css','utf8');
const tokens=new Set([...tokenSource.matchAll(/(--sd-[a-z0-9-]+)\s*:/g)].map(match=>match[1]));
const violations=[];
let components=0;
for(const file of files){
 const source=fs.readFileSync(file,'utf8');
 if(file.endsWith('.css')){
  const root=postcss.parse(source);
  root.walkDecls(decl=>{
   if(decl.prop.startsWith('--sd-'))violations.push(`${file}: SGDM token override ${decl.prop}`);
   if(/#[a-f\d]{3,8}\b/i.test(decl.value))violations.push(`${file}: fixed color ${decl.value}`);
   for(const match of decl.value.matchAll(/var\((--sd-[a-z0-9-]+)/g))if(!tokens.has(match[1]))violations.push(`${file}: unknown token ${match[1]}`);
  });
  root.walkRules(rule=>{if(/\.(card|btn-primary|btn-secondary|input|nav-item|stat-card|focus-ring|modal)(?=[\s.>:#\[]|$)/.test(rule.selector))violations.push(`${file}: overrides package selector ${rule.selector}`);});
  continue;
 }
 const ast=parser.parse(source,{sourceType:'module',plugins:['jsx']});
 const official=new Set(ast.program.body.filter(n=>n.type==='ImportDeclaration'&&n.source.value==='@sgdm/design').flatMap(n=>n.specifiers.map(s=>s.local.name)));
 traverse(ast,{JSXOpeningElement(p){const n=p.node,name=n.name.name;
  if(official.has(name)){components++;for(const a of n.attributes)if(['className','style'].includes(a.name?.name))violations.push(`${file}:${n.loc.start.line}: visual prop on ${name}`);}
  if(['button','input','select','textarea','table','fieldset'].includes(name))violations.push(`${file}:${n.loc.start.line}: native ${name} instead of SGDM component`);
 }});
}
assert.deepEqual(violations,[],violations.join('\n'));
assert.match(fs.readFileSync('src/main.jsx','utf8'),/@sgdm\/design\/tokens.css/);
assert.match(fs.readFileSync('tailwind.config.js','utf8'),/@sgdm\/design\/tailwind-preset/);
console.log(`SGDM audit passed: ${files.length} files; ${components} official component uses; no visual props, token overrides, fixed colors, unknown tokens, native controls or package CSS overrides.`);
