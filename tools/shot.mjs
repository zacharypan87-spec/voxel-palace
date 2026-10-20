/* 九重宫阙 · 无头 Chrome 截图 / 冒烟测试（开发用）
   用法：
     node tools/shot.mjs [--tag=final-] [--w=1600] [--h=1000]
                         [--views=overview,main,gate,...] [--night]
                         [--eye=x,y,z --at=x,y,z] [--url=file:///...]
   默认自动启动本地服务器（端口 4173）并截图到 shots/。
*/
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shots');
const CDP_PORT = 9333;
const HTTP_PORT = 4173;
const PROFILE = path.join(OUT, 'profile-lead');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error('找不到 Chrome / Edge 可执行文件，请设置 CHROME_PATH 环境变量。');
  process.exit(1);
}

const argOf = (k, d) => {
  const a = process.argv.find((s) => s.startsWith('--' + k + '='));
  return a ? a.split('=').slice(1).join('=') : d;
};
const W = Number(argOf('w', 1600));
const H = Number(argOf('h', 1000));
const TAG = argOf('tag', 'shot-');
const NIGHT = process.argv.includes('--night');
const VIEWS = argOf('views', 'overview,main,gate,rear,halls,towers,garden').split(',').filter(Boolean);
const EYE = argOf('eye', '');
const AT = argOf('at', '');
const URL_OVERRIDE = argOf('url', '');
const QUERY = argOf('query', '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });

let serverProc = null;
let chrome = null;
const errors = [];

async function startServer() {
  serverProc = spawn(process.execPath, ['server.mjs', `--port=${HTTP_PORT}`], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${HTTP_PORT}/index.html`);
      if (r.ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error('本地服务器启动失败');
}

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome 未就绪');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        (this.handlers.get(msg.method) || []).forEach((h) => h(msg.params));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('timeout: ' + method));
        }
      }, 180000);
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
}

try {
  if (!URL_OVERRIDE) await startServer();
  chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--hide-scrollbars',
      '--mute-audio',
      '--allow-file-access-from-files',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--force-device-scale-factor=1',
      `--window-size=${W},${H}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  const target = await getTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  cdp.on('Runtime.exceptionThrown', (p) => errors.push('EXCEPTION: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'unknown')));
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') errors.push('CONSOLE ERROR: ' + p.args.map((a) => a.value ?? a.description).join(' '));
  });
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error') errors.push('LOG: ' + p.entry.text);
  });

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });
  const url = URL_OVERRIDE || `http://127.0.0.1:${HTTP_PORT}/index.html${QUERY ? '?' + QUERY : ''}`;
  await cdp.send('Page.navigate', { url });

  let ready = false;
  for (let i = 0; i < 120; i++) {
    await sleep(200);
    const r = await cdp.send('Runtime.evaluate', {
      expression: `({ready: !!window.__PALACE_READY__, err: !!document.querySelector('.loader-title') && document.querySelector('.loader-title').textContent === '营造中断'})`,
      returnByValue: true,
    });
    if (r.result.value.ready) {
      ready = true;
      break;
    }
    if (r.result.value.err) break;
  }
  if (!ready) throw new Error('场景未能就绪（可能有脚本错误）');
  await sleep(2600);

  if (NIGHT) {
    await cdp.send('Runtime.evaluate', { expression: `window.__PALACE.setMode('night')` });
    await sleep(2600);
  }

  const stats = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({boxes: window.__PALACE.stats.boxes, buildings: window.__PALACE.stats.buildings, mode: window.__PALACE.themeMode, cam: window.__PALACE.camera.position.toArray().map(n=>+n.toFixed(1)), fov: window.__PALACE.camera.fov, size: [innerWidth, innerHeight]})`,
    returnByValue: true,
  });
  console.log('stats:', stats.result.value);

  const shot = async (name) => {
    await sleep(1200);
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, TAG + name + (NIGHT ? '-night' : '') + '.png');
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('saved:', path.basename(file));
  };

  for (const view of VIEWS) {
    const expr = `(() => {
      const P = window.__PALACE;
      P.focus(${JSON.stringify(view)}, {silent:true});
      const d = ${JSON.stringify(view)} === 'overview' ? P.overview : (P.views[${JSON.stringify(view)}] || P.views.overview);
      if (d && d.view) P.controls.setView(d.view.pos, d.view.target, true);
      P.renderer.render(P.scene, P.camera);
    })()`;
    await cdp.send('Runtime.evaluate', { expression: expr });
    await sleep(1200);
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(OUT, TAG + view + (NIGHT ? '-night' : '') + '.png'), Buffer.from(r.data, 'base64'));
    console.log('saved:', TAG + view + (NIGHT ? '-night' : ''));
  }

  if (EYE && AT) {
    const eye = EYE.split(',').map(Number);
    const at = AT.split(',').map(Number);
    const expr = `window.__PALACE.controls.setView([${eye.join(',')}], [${at.join(',')}], true); window.__PALACE.renderer.render(window.__PALACE.scene, window.__PALACE.camera);`;
    await cdp.send('Runtime.evaluate', { expression: expr });
    await shot('custom');
  }

  console.log('errors:', errors.length ? errors : 'none');
  console.log('OK');
  ws.close();
} catch (err) {
  console.error('ERR:', err.message || err);
  console.log('errors:', errors);
  process.exitCode = 1;
} finally {
  if (chrome) chrome.kill();
  if (serverProc) serverProc.kill();
  await sleep(500);
  try {
    rmSync(PROFILE, { recursive: true, force: true });
  } catch {}
}
