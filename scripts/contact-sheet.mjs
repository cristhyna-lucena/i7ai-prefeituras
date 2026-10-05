import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
const folder='output/verification/sgdm/screenshots-embedded';
const browser=await chromium.launch({channel:'msedge'});
for(const width of [1440,390]){
 for(const suffix of ['','-bottom','host']){
  const files=fs.readdirSync(folder).filter(f=>suffix==='host'?f.startsWith('host-')&&f.endsWith(`-${width}.png`):!f.startsWith('host-')&&f.endsWith(`-${width}${suffix}.png`)).sort();
  const cards=files.map(file=>`<article><p>${file}</p><a href="screenshots-embedded/${file}"><img src="screenshots-embedded/${file}"/></a></article>`).join('');
  const html=`<style>*{box-sizing:border-box}body{margin:0;background:#fff;font:14px Arial}main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:12px}p{margin:0 0 8px}img{width:100%;display:block}article{border:1px solid #ccc;padding:6px}</style><main>${cards}</main>`;
  const file=path.resolve(`output/verification/sgdm/contact-embedded-${width}${suffix==='host'?'-host':suffix}.html`);fs.writeFileSync(file,html);
  const page=await browser.newPage({viewport:{width:width===1440?1600:1000,height:1000}});
  await page.goto(pathToFileURL(file).href);await page.screenshot({path:file.replace('.html','.png'),fullPage:true});await page.close();
 }
}
await browser.close();
const links=fs.readdirSync(folder).filter(file=>file.endsWith('.png')).sort().map(file=>`<a href="screenshots-embedded/${file}">${file}</a>`).join('');
fs.writeFileSync('output/verification/sgdm/index.html',`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>i7Ai — Validação SGDM</title><style>body{font:16px Arial;background:#f1f5f9;color:#0f172a;max-width:1100px;margin:32px auto;padding:20px}nav,.captures{display:flex;flex-wrap:wrap;gap:12px}a{display:block;padding:12px;background:white;color:#1e40af;border-radius:8px;text-decoration:none}.captures a{font-size:13px}</style><h1>i7Ai dentro do SGDM</h1><p>Versão sem login próprio, validada com o design system oficial e dados fictícios.</p><p><a href="http://127.0.0.1:5180/preview/sgdm.html">Abrir prévia navegável</a></p><nav><a href="contact-embedded-1440-host.html">Desktop dentro do host</a><a href="contact-embedded-390-host.html">Celular dentro do host</a><a href="contact-embedded-1440.html">Telas do módulo</a><a href="contact-embedded-390.html">Telas do módulo em celular</a><a href="playwright-report/index.html">Relatório dos testes</a></nav><h2>Capturas atuais</h2><div class="captures">${links}</div></html>`);
