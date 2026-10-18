// LogNeedle · 真实浏览器端到端验证 + 生成 README 截图
// 用 Edge/Chrome 的 headless + CDP：真实加载页面、真实选择示例日志目录、真实点「提取」，
// 校验渲染/编码/自动折行/清空，并输出截图。零依赖（只用 Node 内置模块 + 内置 WebSocket）。
//
// 用法: node tools/screenshot.mjs [html路径] [示例日志目录] [输出目录]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const repoRoot = resolve(import.meta.dirname, '..');
const HTML = resolve(process.argv[2] || join(repoRoot, 'logneedle.html'));
const DEMO = resolve(process.argv[3] || join(repoRoot, 'examples', 'sample-logs'));
const OUT = resolve(process.argv[4] || join(repoRoot, 'docs'));
const PORT = 9333 + (process.pid % 400);

const BROWSERS = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const browser = BROWSERS.find(p => existsSync(p));
if (!browser) {
  console.error('找不到 Edge/Chrome，可用 EDGE_PATH 环境变量指定。');
  process.exit(2);
}
if (!existsSync(HTML)) { console.error('找不到 ' + HTML); process.exit(2); }
if (!existsSync(DEMO)) { console.error('找不到示例日志目录 ' + DEMO); process.exit(2); }

let FAIL = 0, PASS = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { PASS++; console.log('  PASS  ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
};

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result);
      } else {
        this.events.push(m);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function waitForTarget(port) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  return null;
}

function makeTempDir() {
  for (const base of [tmpdir(), repoRoot, process.cwd()]) {
    try { return mkdtempSync(join(base, 'logneedle-cdp-')); } catch { /* 换下一个候选目录 */ }
  }
  throw new Error('无法创建临时目录（系统临时目录与仓库目录都不可写）');
}

const userDataDir = makeTempDir();
const url = 'file:///' + HTML.replace(/\\/g, '/');
let proc = null;

async function launch(headlessFlag) {
  proc = spawn(browser, [
    headlessFlag, '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync', '--hide-scrollbars',
    '--force-device-scale-factor=2', '--window-size=1440,900',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: 'ignore' });
  return waitForTarget(PORT);
}

let page = await launch('--headless=new');
if (!page) {
  console.log('  （--headless=new 未就绪，改用 --headless 重试）');
  try { proc.kill(); } catch { /* ignore */ }
  await sleep(1200);
  page = await launch('--headless');
}
if (!page) { console.error('浏览器 CDP 端点未就绪，放弃。'); process.exit(2); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')));
});
const cdp = new CDP(ws);
const ev = async (expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('页面脚本异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

try {
  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.navigate', { url });
  for (let i = 0; i < 60 && !cdp.events.some(e => e.method === 'Page.loadEventFired'); i++) await sleep(120);
  ok('页面加载', true, url);

  // 1) 真实「选择文件夹」：通过 CDP 给 webkitdirectory 输入框喂一个真实目录
  const doc = await cdp.send('DOM.getDocument', { depth: 1 });
  const q = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#fileInput' });
  let uploaded = 0;
  try {
    await cdp.send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [DEMO] });
    uploaded = await ev(`document.getElementById('fileInput').files.length`);
  } catch (e) { console.log('  目录上传失败: ' + e.message); }
  if (!uploaded) {
    await cdp.send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: walk(DEMO) });
    uploaded = await ev(`document.getElementById('fileInput').files.length`);
  }
  await ev(`document.getElementById('fileInput').dispatchEvent(new Event('change'))`);
  await sleep(400);
  const loaded = await ev(`document.getElementById('dirName').textContent`);
  ok('选择目录后载入文件', uploaded > 0, uploaded + ' 个文件 / ' + loaded);

  async function run(keyword) {
    await ev(`(() => { const k = document.getElementById('keyword'); k.value = ${JSON.stringify(keyword)}; document.getElementById('runBtn').click(); return true; })()`);
    for (let i = 0; i < 300; i++) {
      const busy = await ev(`document.getElementById('runBtn').disabled`);
      const hasSummary = await ev(`!document.getElementById('summary').classList.contains('hidden')`);
      if (!busy && hasSummary) return true;
      await sleep(100);
    }
    return false;
  }
  async function stats() {
    return JSON.parse(await ev(`JSON.stringify({
      cards: document.querySelectorAll('.card').length,
      lines: document.querySelectorAll('.ln').length,
      marks: document.querySelectorAll('mark').length,
      wrapped: document.querySelectorAll('.card.wrap').length,
      paths: Array.from(document.querySelectorAll('.card .path')).map(e => e.textContent),
      metas: Array.from(document.querySelectorAll('.card .meta')).map(e => e.textContent),
      summary: document.getElementById('summaryText').textContent,
      wrapStat: document.getElementById('wrapStat').textContent
    })`));
  }
  async function shot(file) {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }

  // 2) 英文关键词：渲染 + 截图
  mkdirSync(OUT, { recursive: true });
  ok('提取 ERROR 完成', await run('ERROR'));
  let s = await stats();
  ok('结果按文件分块渲染', s.cards >= 2 && s.paths.length === s.cards, s.cards + ' 块: ' + s.paths.join(', '));
  ok('命中行高亮', s.marks > 0, s.marks + ' 处高亮 / ' + s.lines + ' 行');
  ok('汇总信息包含用时', /用时\s[\d.]+s/.test(s.summary), s.summary);
  ok('二进制文件被跳过', /跳过二进制\s1/.test(s.summary), s.summary);
  const hero = await shot(join(OUT, 'screenshot.png'));
  console.log('  截图: ' + hero);

  // 3) 中文关键词：验证真实浏览器里的 GBK 解码
  ok('提取 超时 完成', await run('超时'));
  s = await stats();
  const gbkCard = s.metas.findIndex(m => /gbk|gb18030/i.test(m));
  const gbkPath = gbkCard >= 0 ? s.paths[gbkCard] : '';
  const gbkText = await ev(`(() => { const c = Array.from(document.querySelectorAll('.card')).find(x => /gbk|gb18030/i.test(x.querySelector('.meta').textContent)); return c ? c.querySelector('.card-body').textContent : ''; })()`);
  ok('GBK 日志在浏览器里正确解码', gbkCard >= 0 && gbkText.includes('超时') && gbkText.includes('订单号'),
    gbkPath + ' · 编码标记 ' + (s.metas[gbkCard] || ''));
  ok('GBK 卡片中文无乱码', !/�/.test(gbkText), (gbkText.split('\n')[0] || '').slice(0, 60));
  const gbkShot = await shot(join(OUT, 'screenshot-gbk.png'));
  console.log('  截图: ' + gbkShot);

  // 4) 自动折行：三态切换必须真实生效
  const autoWrapped = s.wrapped;
  await ev(`(() => { const e = document.getElementById('optWrap'); e.value = 'on'; e.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(150);
  const onWrapped = await ev(`document.querySelectorAll('.card.wrap').length`);
  await ev(`(() => { const e = document.getElementById('optWrap'); e.value = 'off'; e.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(150);
  const offWrapped = await ev(`document.querySelectorAll('.card.wrap').length`);
  await ev(`(() => { const e = document.getElementById('optWrap'); e.value = 'auto'; e.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(200);
  const backAuto = await ev(`document.querySelectorAll('.card.wrap').length`);
  ok('「始终换行」全部块折行', onWrapped === s.cards, onWrapped + '/' + s.cards);
  ok('「不换行」全部块不折行', offWrapped === 0, String(offWrapped));
  ok('回到「自动」重新测量', backAuto <= s.cards, '自动=' + backAuto + ' 手动前=' + autoWrapped + ' 共 ' + s.cards + ' 块');

  // 5) 清空后可以接着查下一个关键词
  await ev(`document.getElementById('clearBtn').click()`);
  await sleep(200);
  const afterClear = JSON.parse(await ev(`JSON.stringify({ cards: document.querySelectorAll('.card').length, kw: document.getElementById('keyword').value, hidden: document.getElementById('summary').classList.contains('hidden') })`));
  ok('清空后结果与汇总清空', afterClear.cards === 0 && afterClear.kw === '' && afterClear.hidden,
    'cards=' + afterClear.cards + ' keyword="' + afterClear.kw + '"');
  ok('清空后关键词框获得焦点', await ev(`document.activeElement && document.activeElement.id === 'keyword'`));

  // 6) 页面内自检按钮
  await ev(`document.getElementById('selftestBtn').click()`);
  await sleep(900);
  const st = await ev(`document.getElementById('selftestStat').textContent`);
  ok('页面内「自检」全部通过', /失败 0/.test(st), st);

  // 7) 控制台不能有任何错误
  const errors = cdp.events.filter(e =>
    e.method === 'Runtime.exceptionThrown' ||
    (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'));
  ok('运行期间无控制台错误 / 未捕获异常', errors.length === 0,
    errors.length ? errors.map(e => (e.params.entry || e.params.exceptionDetails || {}).text || '?').slice(0, 3).join(' | ') : '0 条');
} catch (e) {
  FAIL++;
  console.log('  FAIL  端到端流程异常: ' + (e && e.message ? e.message : e));
} finally {
  try { ws.close(); } catch { /* ignore */ }
  try { if (proc && proc.pid) spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* ignore */ }
  await sleep(300);
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log('\n==============================');
console.log('PASS=' + PASS + ' FAIL=' + FAIL);
process.exit(FAIL ? 1 : 0);
