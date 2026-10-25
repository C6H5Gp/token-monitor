'use strict';
/* global document, getComputedStyle, PointerEvent, prepare, rect, check, frame, finish, clicks, els, positionAppUpdatePopover */

// Run with `node scripts/test-footer-actions-ui.cjs`. This uses the installed
// Electron runtime, a temporary profile and an offscreen renderer, not app data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const electron = require('electron');

if (typeof electron === 'string') {
  const { spawn } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [__filename, ...process.argv.slice(2)], { env, stdio: 'inherit' });
  child.on('error', (error) => { console.error(error); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = electron;
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-footer-ui-'));
  app.setPath('userData', runDir);
  const repo = process.env.TOKEN_MONITOR_FOOTER_TEST_REPO || path.resolve(__dirname, '..');
  const renderer = path.join(repo, 'src/electron/renderer');
  const html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(renderer, 'app.js'), 'utf8');
  function functionSource(name, next) {
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf(`function ${next}(`, start);
    if (start < 0 || end < 0) throw new Error(`Missing production function ${name}`);
    return source.slice(start, end);
  }
  const footer = html.match(/<footer class="footer">[\s\S]*?<\/footer>/)[0];
  const popoverStart = html.indexOf('<div id="appUpdatePopover"');
  const popover = html.slice(popoverStart, html.indexOf('</main>', popoverStart));
  const fixture = `<!doctype html><html><head><meta charset="utf-8"><base href="${pathToFileURL(renderer + path.sep)}"><link rel="stylesheet" href="styles.css"><style>.shell{justify-content:flex-end;box-shadow:none}</style></head><body><main class="shell">${footer}${popover}</main><script src="appUpdatePresentation.js"></script><script>
    const els={utilityActions:document.querySelector('#utilityActions'),appUpdatePill:document.querySelector('#appUpdatePill'),appUpdatePopover:document.querySelector('#appUpdatePopover')};
    const appUpdatePresentationApi=window.TokenMonitorAppUpdatePresentation;
    ${functionSource('positionAppUpdatePopover', 'clearAppUpdateCardTimers')}
    ${functionSource('initFooterActionDisclosure', 'applyControlLayout')}
    initFooterActionDisclosure();
    window.clicks={update:0,secondary:0};
    document.querySelector('#appUpdatePillAction').onclick=()=>clicks.update++;
    document.querySelector('#refreshButton').onclick=()=>clicks.secondary++;
    document.querySelector('#settingsButton').onclick=()=>clicks.secondary++;
    window.check=(condition,message)=>{if(!condition)throw new Error(message)};
    window.rect=id=>document.querySelector(id).getBoundingClientRect();
    window.frame=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    window.finish=()=>document.getAnimations().forEach(animation=>animation.finish());
    window.prepare=async ({swapped=false,native=false,reduced=false,update=true}={})=>{
      if(els.appUpdatePopover.matches(':popover-open'))els.appUpdatePopover.hidePopover();
      document.documentElement.classList.toggle('native-liquid-glass',native);
      document.documentElement.dataset.reduceMotion=reduced?'on':'off';
      document.querySelector('.shell').classList.remove('settings-open');
      document.querySelector('.footer-update-actions').classList.remove('is-disclosed');
      els.appUpdatePill.classList.toggle('hidden',!update);
      document.querySelector('#appUpdatePillAction').dataset.status='downloaded';
      document.activeElement?.blur();
      els.utilityActions.classList.toggle('is-swapped',swapped);
      els.utilityActions.append(...(swapped?[document.querySelector('#settingsButton'),document.querySelector('#refreshButton')]:[document.querySelector('#refreshButton'),document.querySelector('#settingsButton')]));
      finish();await frame();finish();await frame();
      const r=rect(swapped?'#refreshButton':'#settingsButton');
      return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
    };
  </script></body></html>`;
  const file = path.join(runDir, 'footer.html');
  fs.writeFileSync(file, fixture);
  let win;
  app.whenReady().then(async () => {
    win = new BrowserWindow({ width: 595, height: 300, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    win.webContents.on('console-message', event => { if (event.level === 'error') console.error('renderer:', event.message); });
    await win.loadFile(file);
    const run = async (fn, ...args) => {
      const result = await win.webContents.executeJavaScript(`(async()=>{try{return await (${fn})(${args.map(value => JSON.stringify(value)).join(',')})}catch(error){return {fixtureError:error.stack}}})()`);
      if (result?.fixtureError) throw new Error(result.fixtureError);
      return result;
    };
    const move = async (point) => {
      win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
      await run(async () => { await frame(); await frame(); });
    };
    const popoverOnly = process.argv.includes('--popover-only');
    for (const swapped of popoverOnly ? [] : [false, true]) {
      await move({ x: 10, y: 10 });
      const primary = await run(async value => prepare({ swapped: value, reduced: true }), swapped);
      // The old ::before hover bridge reached 6px outside the primary button.
      // Enter each gap directly from outside, without ever touching that button.
      for (const offset of [18, 20, 22]) {
        await move({ x: 10, y: 10 });
        await move({ x: primary.x-offset, y: primary.y });
        await run(() => {
          check(!document.querySelector('.footer-update-actions').classList.contains('is-disclosed'), 'Direct gap hover opens the utility actions');
          check(getComputedStyle(document.querySelector('.footer-update-actions')).getPropertyValue('--footer-disclosure-width').trim()==='0px', 'Gap hover reserves disclosure space');
        });
      }
      await move({ x: 10, y: 10 });
      const updatePoint = await run(() => {
        const r=rect('#appUpdatePill');return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
      });
      await move(updatePoint);
      await run(() => check(!document.querySelector('.footer-update-actions').classList.contains('is-disclosed'), 'Direct update hover moves its own button'));
      await move(primary);
      await run(() => check(document.querySelector('.footer-update-actions').classList.contains('is-disclosed'), 'Primary button must disclose'));
      await move({ x: primary.x-20, y: primary.y });
      await run(() => check(document.querySelector('.footer-update-actions').classList.contains('is-disclosed'), 'Gap must keep already-open controls reachable'));
      await move({ x: 10, y: 10 });
      await run(() => check(!document.querySelector('.footer-update-actions').classList.contains('is-disclosed'), 'Leaving all controls must collapse'));
      console.log(JSON.stringify({ test: 'hover trigger boundary', swapped }));
    }
    for (const variant of popoverOnly ? [] : [{}, { swapped: true }, { native: true }, { width: 240 }]) {
      win.setSize(variant.width || 595, 300);
      await move({ x: 10, y: 10 });
      const primary = await run(async options => prepare(options), variant);
      await move(primary);
      const samples = await run(options => {
        const secondary = options.swapped ? '#settingsButton' : '#refreshButton';
        const animations = document.getAnimations();
        animations.forEach(animation => animation.pause());
        const results = [];
        for (const t of [0, 16, 33, 50, 90, 179, 180, 200]) {
          animations.forEach(animation => { animation.currentTime = t; });
          const p = rect('#appUpdatePill'), r = rect(secondary);
          const hit = document.elementFromPoint(p.x+p.width/2,p.y+p.height/2)?.closest('button')?.id;
          check(hit === 'appUpdatePillAction', 'Update intercepted during expansion at '+t+'ms: '+JSON.stringify({hit,p:p.toJSON(),r:r.toJSON(),transition:getComputedStyle(document.querySelector(secondary)).transition,pointer:getComputedStyle(document.querySelector(secondary)).pointerEvents,animations:animations.map(a=>({property:a.transitionProperty,time:a.currentTime,timing:a.effect.getTiming()}))}));
          const visibility = getComputedStyle(document.querySelector(secondary)).visibility;
          check(t < 180 ? visibility === 'hidden' : (t === 180 || visibility === 'visible'), 'Secondary visibility at '+t+'ms: '+visibility);
          results.push({ t, overlap: +Math.max(0, Math.min(p.right,r.right)-Math.max(p.x,r.x)).toFixed(2), hit, visibility });
        }
        animations.forEach(animation => { animation.currentTime = 0; });
        const p = rect('#appUpdatePill');
        return { results, point: { x: Math.round(p.x+p.width/2), y: Math.round(p.y+p.height/2) } };
      }, variant);
      await move(samples.point);
      win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...samples.point });
      win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...samples.point });
      const secondaryPoint = await run(async options => {
        await frame();
        check(clicks.update > 0 && clicks.secondary === 0, 'Real pointer click hit the secondary instead of Update');
        clicks.update = 0;
        finish();
        const r = rect(options.swapped?'#settingsButton':'#refreshButton');
        return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) };
      }, variant);
      await move(secondaryPoint);
      win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...secondaryPoint });
      win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...secondaryPoint });
      await run(async () => {
        await frame();
        check(clicks.secondary === 1 && clicks.update === 0, 'Revealed secondary does not receive real pointer clicks');
        clicks.secondary = 0;
      });
      await move({ x: 10, y: 10 });
      await run(options => {
        const secondary = document.querySelector(options.swapped?'#settingsButton':'#refreshButton');
        const animations = document.getAnimations();
        animations.forEach(animation => animation.pause());
        for (const t of [0, 16, 50, 180]) {
          animations.forEach(animation => { animation.currentTime = t; });
          check(getComputedStyle(secondary).visibility === 'hidden', 'Secondary stays clickable during collapse at '+t+'ms');
          const p = rect('#appUpdatePill');
          check(document.elementFromPoint(p.x+p.width/2,p.y+p.height/2)?.closest('button')?.id==='appUpdatePillAction','Update intercepted during collapse');
        }
        finish();
      }, variant);
      console.log(JSON.stringify({ test: 'pointer motion', variant, samples: samples.results }));
    }
    for (const options of popoverOnly ? [] : [{ reduced: true }, { update: false }]) {
      win.setSize(595, 300);
      await move({ x: 10, y: 10 });
      await move(await run(async config => prepare(config), options));
      await run(async () => {
        await frame();
        check(getComputedStyle(document.querySelector('#refreshButton')).visibility === 'visible', 'Instant/no-update disclosure unnecessarily delays clicks');
      });
      console.log(JSON.stringify({ test: 'instant disclosure', options }));
    }
    for (const reduced of [false, true]) {
      await move({ x: 10, y: 10 });
      await run(async value => {
        await prepare({ reduced: value });
        document.querySelector('.footer-update-actions').classList.add('is-disclosed');
        finish();await frame();finish();await frame();
        positionAppUpdatePopover();els.appUpdatePopover.showPopover();
        await frame();finish();await frame();
        check(Math.abs(rect('#appUpdatePill').right-rect('#appUpdatePopover').right)<1,'Initial card alignment');
        document.querySelector('.footer-update-actions').dispatchEvent(new PointerEvent('pointerleave'));
        let samples=0;
        do {
          await frame();
          check(Math.abs(rect('#appUpdatePill').right-rect('#appUpdatePopover').right)<1,'Card detached from moving update button');
          samples++;
        } while(document.getAnimations().some(animation=>animation.transitionProperty==='margin-right')&&samples<30);
        check(Math.abs(rect('#appUpdatePill').right-539)<1,'Update did not return to rest');
        els.appUpdatePopover.hidePopover();
      }, reduced);
      console.log(JSON.stringify({ test: 'popover follows collapse', reduced }));
    }
    console.log('PASS footer pointer and popover regression checks');
    win.destroy();
    app.quit();
  }).catch(error => { console.error(error.stack); win?.destroy(); app.exit(1); });
  app.on('quit', () => fs.rmSync(runDir, { recursive: true, force: true }));
}
