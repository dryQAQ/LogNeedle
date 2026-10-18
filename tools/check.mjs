// LogNeedle · 静态与核心逻辑校验（CI 用，只读不改文件，零依赖）
// 用法: node tools/check.mjs [logneedle.html]
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const htmlPath = process.argv[2] ? resolve(process.argv[2]) : join(repoRoot, 'logneedle.html');

let FAIL = 0, PASS = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { PASS++; console.log('  PASS  ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
};

console.log('node ' + process.version);
console.log('target ' + htmlPath);
const raw = readFileSync(htmlPath);
const html = raw.toString('utf8');

console.log('\n== 1. 文件基本属性 ==');
ok('文件非空', raw.length > 1000, raw.length + ' bytes');
ok('无 UTF-8 BOM', !(raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF));
ok('无 CRLF（写成 LF）', !html.includes('\r\n'));
ok('声明 charset=utf-8', html.includes('<meta charset="utf-8">'));
ok('以 </html> 结尾', html.trimEnd().endsWith('</html>'));
ok('无残留占位符', !html.includes('__GBK_SAMPLE_HEX__') && !html.includes('__BIG5_TEXT_HEX__'));

console.log('\n== 2. 零依赖 / 零外链 ==');
for (const [needle, label] of [
  ['http://', 'http 引用'], ['https://', 'https 引用'], ['<link', 'link 标签'], ['<script src', '外部脚本'],
  ['@import', 'CSS import'], ['url(', 'CSS url()'], ['type="module"', 'ES module'],
  ['new Worker', 'Web Worker'], ['importScripts', 'importScripts'], ['fetch(', 'fetch 调用'],
  ['XMLHttpRequest', 'XHR'], ['WebSocket', 'WebSocket'], ['<img', 'img 标签']
]) ok('不出现 ' + label, !html.includes(needle));
ok('只含 2 个内联 script 块', (html.match(/<script/g) || []).length === 2 && (html.match(/<\/script>/g) || []).length === 2);

console.log('\n== 3. 脚本抽取与语法检查 ==');
const coreM = html.match(/<script id="core">([\s\S]*?)<\/script>/);
const appM = html.match(/<script id="app">([\s\S]*?)<\/script>/);
ok('抽取 core 脚本', !!coreM, coreM ? coreM[1].length + ' chars' : '');
ok('抽取 app 脚本', !!appM, appM ? appM[1].length + ' chars' : '');
let LOGX = null;
try { new Function(coreM[1]); ok('core 语法检查', true); } catch (e) { ok('core 语法检查', false, e.message); }
try { new Function(appM[1]); ok('app 语法检查', true); } catch (e) { ok('app 语法检查', false, e.message); }
try {
  LOGX = new Function('window', coreM[1] + '\n;return window.__LOGX__;')({});
  ok('core 可执行并导出 API', !!LOGX && typeof LOGX.selfTest === 'function');
} catch (e) { ok('core 可执行并导出 API', false, e.message); }

if (LOGX) {
  console.log('  编码可用性: ' + Object.entries(LOGX.availableEncodings()).map(([k, v]) => k + '=' + (v ? 'Y' : 'N')).join(' '));

  console.log('\n== 4. 核心逻辑自检（与页面内「自检」按钮同一套用例）==');
  const results = await LOGX.selfTest();
  for (const r of results) {
    if (!r.pass) FAIL++; else PASS++;
    console.log('  ' + (r.skip ? 'SKIP' : (r.pass ? 'PASS' : 'FAIL')) + '  ' + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
  }
  const fails = results.filter(r => !r.pass);
  ok('自检用例全部通过', fails.length === 0, fails.length ? fails.map(f => f.name).join(' | ') : results.length + ' 项');

  console.log('\n== 5. GBK / Big5 夹具自证 ==');
  ok('GBK 夹具与期望文本一致',
    new TextDecoder('gb18030').decode(Buffer.from(LOGX.FIX.gbkHex, 'hex')) === LOGX.FIX.gbkText,
    Buffer.from(LOGX.FIX.gbkHex, 'hex').length + ' bytes');
  ok('Big5 夹具与期望文本一致',
    new TextDecoder('big5').decode(Buffer.from(LOGX.FIX.big5Hex, 'hex')) === LOGX.FIX.big5Text,
    Buffer.from(LOGX.FIX.big5Hex, 'hex').length + ' bytes');

  console.log('\n== 6. DOM id 契约 ==');
  const declared = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const used = new Set([...appM[1].matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
  for (const m of appM[1].matchAll(/getElementById\('([^']+)'\)/g)) used.add(m[1]);
  const missing = [...used].filter(x => !declared.has(x));
  ok('app 引用的 id 全部存在', missing.length === 0, missing.length ? missing.join(',') : used.size + ' 个 id');

  console.log('\n== 7. 核心 API 契约 ==');
  const apiUsed = new Set([...appM[1].matchAll(/LOGX\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
  const apiMissing = [...apiUsed].filter(x => !(x in LOGX));
  ok('app 使用的 LOGX.* 全部存在', apiMissing.length === 0, apiMissing.length ? apiMissing.join(',') : apiUsed.size + ' 个 API');

  console.log('\n== 8. 性能基准 ==');
  const lines = [];
  for (let i = 0; i < 200000; i++) {
    lines.push(i % 7 === 0
      ? ('2024-05-01 12:00:0' + (i % 10) + ' ERROR 关键字 命中 第' + i + '行')
      : ('2024-05-01 12:00:0' + (i % 10) + ' INFO 普通内容 第' + i + '行'));
  }
  const mb = lines.reduce((a, b) => a + b.length, 0) * 2 / 1024 / 1024;
  const t0 = performance.now();
  const col = new LOGX.HitCollector({ perFileCap: 20000, ctxLines: 0 });
  LOGX.scanLines(lines, LOGX.makeMatcher('关键字', {}).matchers, col, null);
  const dt = performance.now() - t0;
  console.log('  ' + lines.length + ' 行 / ' + mb.toFixed(1) + ' MB(UTF-16) 匹配耗时 ' + dt.toFixed(0) + ' ms → '
    + (mb / (dt / 1000)).toFixed(0) + ' MB/s，命中 ' + col.matched + ' 行');
  ok('匹配吞吐 > 20 MB/s', mb / (dt / 1000) > 20, (mb / (dt / 1000)).toFixed(0) + ' MB/s');
}

console.log('\n== 9. 换行：自动 / 始终 / 不换行 静态契约 ==');
const app = appM ? appM[1] : '';
ok('结果区存在三态换行下拉', /<select id="optWrap">[\s\S]*?value="auto"[\s\S]*?value="on"[\s\S]*?value="off"[\s\S]*?<\/select>/.test(html));
ok('不换行为默认样式（white-space:pre）', /\.ln \.tx\{[^}]*white-space:pre[;\}]/.test(html));
ok('折行样式只由 .card.wrap 触发', (html.match(/white-space:pre-wrap/g) || []).length === 1
  && /\.card\.wrap \.ln \.tx\{white-space:pre-wrap/.test(html));
ok('不折行时行号固定不随横向滚动', /\.ln \.no\{[^}]*position:sticky[^}]*left:0/.test(html));
ok('渲染后按实际溢出宽度决定', /\(b\.scrollWidth - b\.clientWidth\) > 1/.test(app));
ok('同一帧内先量后套，避免闪烁', /c\.classList\.remove\('wrap'\);\s*\n\s*const need = cards\.map/.test(app));
ok('窗口缩放 / 展开折叠后重算', /addEventListener\('resize'/.test(app) && (app.match(/remeasureAll\(\);/g) || []).length >= 3);

console.log('\n== 10. 三种取目录方式的忽略规则一致性 ==');
ok('isIgnoredRelPath 助手存在', /function isIgnoredRelPath\(relPath\)/.test(app));
ok('文件夹选择框按路径段过滤', /isIgnoredRelPath\(p\)/.test(app));
ok('目录选择 API 遍历时过滤', /isIgnoredDir\(name\)/.test(app));
ok('拖拽导入遍历时过滤', /isIgnoredDir\(entry\.name\)/.test(app));

console.log('\n==============================');
console.log('PASS=' + PASS + ' FAIL=' + FAIL);
process.exit(FAIL ? 1 : 0);
