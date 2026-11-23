const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(process.env.NANPURE_APP_SOURCE || path.join(__dirname, '../js/app.js'), 'utf8');

function fakeClock() {
  let now = 1_000_000;
  let nextID = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay = 0) {
      const id = ++nextID;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    pending: () => timers.size,
    advance(ms) {
      const end = now + ms;
      for (let count = 0; ; count++) {
        if (count > 10_000) throw Error('Timer loop');
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      now = end;
    }
  };
}

function app(options = {}) {
  const data = new Map();
  const elements = new Map();
  const messages = [];
  const clock = fakeClock();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, appendChild() {}, innerHTML: '', textContent: ''
    });
    return elements.get(id);
  }
  const storage = {
    get length() { return data.size; },
    key(i) { return [...data.keys()][i]; },
    getItem(k) { return data.get(k) ?? null; },
    setItem(k, v) { data.set(k, v); },
    removeItem(k) { data.delete(k); }
  };
  const document = {
    getElementById: element, createElement: () => element('created'),
    body: { appendChild() {} }, addEventListener() {}, visibilityState: 'visible'
  };
  const window = { addEventListener() {} };
  if (options.bridge) window.webkit = { messageHandlers: { nativeAd: {
    postMessage(message) {
      messages.push(message);
      if (options.throwBridge) throw Error('bridge unavailable');
    }
  } } };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now()])); }
    static now() { return clock.now(); }
  }
  const context = vm.createContext({
    document, window, localStorage: storage, console, Date: ClockDate,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    requestAnimationFrame: fn => clock.setTimeout(() => fn(clock.now()), 16), alert() {}
  });
  vm.runInContext(source, context);
  return {
    run: code => vm.runInContext(code, context), data, messages, window, clock,
    reply: (index, granted) => window.__nativeAdCallback(messages[index].requestId, granted)
  };
}

const solution = Array.from({ length: 81 }, (_, i) => (Math.floor(i / 9) * 3 + Math.floor(i / 27) + i % 9) % 9 + 1);
const puzzle = solution.map((n, i) => i < 3 ? 0 : n);
function enter(a, key = 'lpg:easy:0') {
  a.run(`enterGame(${JSON.stringify({ puzzle, solution })}, '${key}', 'Test', 'list')`);
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('late hint reward cannot change another puzzle', async () => {
  const a = app({ bridge: true }); enter(a); a.run('GZ.hints=0; gHint()');
  enter(a, 'lpg:easy:1'); a.reply(0, true); await flush();
  assert.equal(a.run('GZ.hints'), 3);
});

test('late error-check reward cannot change another puzzle', async () => {
  const a = app({ bridge: true }); enter(a); a.run('GZ.checkCount=1; runCheck()');
  enter(a, 'lpg:easy:1'); a.reply(0, true); await flush();
  assert.equal(a.run('GZ.checkCount'), 0);
});

test('duplicate hint taps request one ad and duplicate callback cannot grant twice', async () => {
  const a = app({ bridge: true }); enter(a); a.run('GZ.hints=0; gHint(); gHint()');
  assert.equal(a.messages.length, 1);
  a.reply(0, true); await flush(); a.reply(0, true); await flush();
  assert.equal(a.run('GZ.hints'), 1);
  assert.equal(a.clock.pending(), 0);
});

test('reset invalidates an outstanding reward', async () => {
  const a = app({ bridge: true }); enter(a); a.run('GZ.hints=0; gHint(); gReset()');
  a.reply(0, true); await flush();
  assert.equal(a.run('GZ.hints'), 3);
});

test('browser without native ads explains unavailable second check', async () => {
  const a = app(); enter(a); a.run('GZ.checkCount=1; runCheck()'); await flush();
  assert.match(a.run('GZ.lastCheck || ""'), /このブラウザー/);
  assert.equal(a.run('GZ.checkCount'), 1);
  assert.equal(a.run('Boolean(GZ.adPending)'), false);
});

test('throwing native bridge resolves false and clears request and timer', async () => {
  const a = app({ bridge: true, throwBridge: true });
  assert.equal(await a.run('requestRewardedAd()'), false);
  assert.equal(a.run('__pendingAdRequests.size'), 0);
  assert.equal(a.clock.pending(), 0);
});

test('old response after reset does not unlock a newer ad request', async () => {
  const a = app({ bridge: true }); enter(a);
  a.run('GZ.hints=0; gHint(); gReset(); GZ.hints=0; gHint()');
  a.reply(0, true); await flush(); a.run('gHint()');
  assert.equal(a.messages.length, 2);
  assert.equal(a.run('Boolean(GZ.adPending)'), true);
  a.reply(1, false); await flush();
});

test('120-second timeout clears pending state exactly at the boundary', async () => {
  const a = app({ bridge: true }); enter(a); a.run('GZ.checkCount=1; runCheck()');
  a.clock.advance(119_999); await flush();
  assert.equal(a.run('__pendingAdRequests.size'), 1);
  assert.equal(a.run('Boolean(GZ.adPending)'), true);
  a.clock.advance(1); await flush();
  assert.equal(a.run('__pendingAdRequests.size'), 0);
  assert.equal(a.run('Boolean(GZ.adPending)'), false);
  assert.equal(a.run('GZ.checkCount'), 1);
  assert.match(a.run('GZ.lastCheck || ""'), /広告を視聴できませんでした/);
  assert.equal(a.clock.pending(), 0);
});

test('callback after timeout cannot grant or unlock a retry', async () => {
  const a = app({ bridge: true }); enter(a); a.run('GZ.checkCount=1; runCheck()');
  a.clock.advance(120_000); await flush(); a.run('runCheck()');
  a.reply(0, true); await flush(); a.run('runCheck()');
  assert.equal(a.run('GZ.checkCount'), 1);
  assert.equal(a.messages.length, 2);
  assert.equal(a.run('Boolean(GZ.adPending)'), true);
  a.reply(1, true); await flush();
  assert.equal(a.run('GZ.checkCount'), 2);
  assert.equal(a.run('__pendingAdRequests.size'), 0);
  assert.equal(a.clock.pending(), 0);
});

test('old timeout after reset does not unlock a newer ad request', async () => {
  const a = app({ bridge: true }); enter(a); a.run('GZ.hints=0; gHint()');
  a.clock.advance(10_000);
  a.run('gReset(); GZ.hints=0; gHint()');
  a.clock.advance(110_000); await flush(); a.run('gHint()');
  assert.equal(a.messages.length, 2);
  assert.equal(a.run('Boolean(GZ.adPending)'), true);
  assert.equal(a.run('__pendingAdRequests.size'), 1);
  a.reply(1, true); await flush();
  assert.equal(a.run('GZ.hints'), 1);
});

test('navigation home remains possible and invalidates an outstanding check', async () => {
  const a = app({ bridge: true }); enter(a); a.run('GZ.checkCount=1; runCheck(); nav("home")');
  assert.equal(a.run('SCREEN'), 'home');
  a.reply(0, true); await flush();
  assert.equal(a.run('GZ.checkCount'), 1);
  assert.equal(a.run('Boolean(GZ.adPending)'), false);
});

test('leaving and returning to the same game object rejects the old reward', async () => {
  const a = app({ bridge: true }); enter(a);
  a.run('GZ.checkCount=1; runCheck(); nav("home"); nav("game")');
  a.reply(0, true); await flush();
  assert.equal(a.run('SCREEN'), 'game');
  assert.equal(a.run('GZ.checkCount'), 1);
});

test('normal back action still saves progress and leaves the game', () => {
  const a = app(); enter(a); a.run('GZ.cells[0]=1; backFromGame()');
  assert.equal(a.run('SCREEN'), 'list');
  assert.equal(JSON.parse(a.data.get('np:lpg:easy:0')).cells[0], 1);
});

test('hint and check share one in-flight reward request', async () => {
  const a = app({ bridge: true }); enter(a);
  a.run('GZ.checkCount=1; GZ.hints=0; runCheck(); gHint(); runCheck()');
  assert.equal(a.messages.length, 1);
  a.reply(0, true); await flush(); a.reply(0, true); await flush();
  assert.equal(a.run('GZ.checkCount'), 2);
  assert.equal(a.run('GZ.hints'), 0);
});

test('completed puzzle rejects a late earned reward', async () => {
  const a = app({ bridge: true }); enter(a); a.run('GZ.checkCount=1; runCheck()');
  for (let i = 0; i < 3; i++) a.run(`GZ.sel=${i}; gEnter(${solution[i]})`);
  assert.equal(a.run('GZ.done'), true);
  a.reply(0, true); await flush();
  assert.equal(a.run('GZ.checkCount'), 1);
});

test('unearned ad response preserves game state and permits retry', async () => {
  const a = app({ bridge: true }); enter(a); a.run('GZ.hints=0; gHint()');
  a.reply(0, false); await flush();
  assert.equal(a.run('GZ.hints'), 0);
  assert.equal(a.run('Boolean(GZ.adPending)'), false);
  assert.match(a.run('GZ.lastCheck || ""'), /広告/);
  a.run('gHint()'); assert.equal(a.messages.length, 2);
  a.reply(1, false); await flush();
});
