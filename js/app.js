/* ============================================================
   毎日ナンプレ — app.js
   
   構成:
     1. Sudoku エンジン (生成・ソルバー)
     2. ストレージ (localStorage ラッパー)
     3. アプリ設定定数
     4. アプリ状態
     5. ナビゲーション
     6. 問題一覧画面
     7. デイリー画面
     8. ゲーム画面
     9. ゲーム操作
    10. 初期化
   ============================================================ */

'use strict';

/* ============================================================
   1. SUDOKU ENGINE
   ============================================================ */

/**
 * 配列をシャッフル (Fisher–Yates)
 */
function shuffle(arr) {
  arr = [...arr];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 各マスの「同じ行・列・ボックス」のインデックスセット (事前計算)
 */
const PEERS = Array.from({ length: 81 }, (_, pos) => {
  const peers = new Set();
  const row = Math.floor(pos / 9), col = pos % 9;
  const br  = Math.floor(row / 3) * 3;
  const bc  = Math.floor(col / 3) * 3;
  for (let i = 0; i < 9; i++) {
    peers.add(row * 9 + i);          // 同じ行
    peers.add(i * 9 + col);          // 同じ列
    peers.add((br + Math.floor(i / 3)) * 9 + (bc + i % 3)); // 同じボックス
  }
  peers.delete(pos);
  return peers;
});

/**
 * pos に num を置けるか確認
 */
function canPlace(board, pos, num) {
  for (const p of PEERS[pos]) {
    if (board[p] === num) return false;
  }
  return true;
}

/**
 * バックトラッキングでボードを埋める
 * @param {number[]} board - 81要素の配列 (0=空き)
 * @param {boolean}  randomize - 数字順をランダムにするか
 */
function solveBoard(board, randomize = false) {
  // 候補が最も少ない空きマスから埋める。生成・一意解チェックを高速化する。
  let bestPos = -1;
  let bestNums = null;

  for (let pos = 0; pos < 81; pos++) {
    if (board[pos] !== 0) continue;

    const nums = [];
    const base = randomize ? shuffle([1,2,3,4,5,6,7,8,9]) : [1,2,3,4,5,6,7,8,9];
    for (const n of base) {
      if (canPlace(board, pos, n)) nums.push(n);
    }
    if (nums.length === 0) return false;
    if (!bestNums || nums.length < bestNums.length) {
      bestPos = pos;
      bestNums = nums;
      if (nums.length === 1) break;
    }
  }

  if (bestPos < 0) return true; // 完成

  for (const n of bestNums) {
    board[bestPos] = n;
    if (solveBoard(board, randomize)) return true;
    board[bestPos] = 0;
  }
  return false; // バックトラック
}

/**
 * 解の個数を数える。limit に達したら打ち切る。
 * ナンプレとして公開するため、生成問題が「一意解」か確認する用途。
 */
function countSolutions(board, limit = 2) {
  let bestPos = -1;
  let bestNums = null;

  for (let pos = 0; pos < 81; pos++) {
    if (board[pos] !== 0) continue;

    const nums = [];
    for (let n = 1; n <= 9; n++) {
      if (canPlace(board, pos, n)) nums.push(n);
    }
    if (nums.length === 0) return 0;
    if (!bestNums || nums.length < bestNums.length) {
      bestPos = pos;
      bestNums = nums;
      if (nums.length === 1) break;
    }
  }

  if (bestPos < 0) return 1;

  let count = 0;
  for (const n of bestNums) {
    board[bestPos] = n;
    count += countSolutions(board, limit - count);
    board[bestPos] = 0;
    if (count >= limit) return count;
  }
  return count;
}

/**
 * 難易度ごとの最小ヒント数 (空白 = 81 - ヒント数)
 * 値を大きくすると簡単になる
 */
const CLUES = { easy: 45, medium: 35, hard: 25 };

/**
 * パズルを生成する
 * @param {'easy'|'medium'|'hard'} difficulty
 * @returns {{ puzzle: number[], solution: number[] }}
 */
function generatePuzzle(difficulty) {
  const solution = Array(81).fill(0);
  solveBoard(solution, true);

  const puzzle = [...solution];
  const targetClues = CLUES[difficulty];
  const positions = shuffle(Array.from({ length: 81 }, (_, i) => i));

  // 数字を1つずつ消し、解が1つだけ残る場合のみ採用する。
  // これにより、ランダム生成でも「複数解のある問題」を避ける。
  for (const pos of positions) {
    const filled = puzzle.filter(v => v !== 0).length;
    if (filled <= targetClues) break;

    const backup = puzzle[pos];
    puzzle[pos] = 0;

    if (countSolutions([...puzzle], 2) !== 1) {
      puzzle[pos] = backup;
    }
  }

  return { puzzle, solution };
}

/* ============================================================
   2. STORAGE (localStorage ラッパー)
   React Native に移植するときは AsyncStorage に置き換える
   ============================================================ */

const NS = 'np:'; // namespace prefix

const Storage = {
  get(key) {
    try {
      const v = localStorage.getItem(NS + key);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  },

  set(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch { return false; }
  },

  del(key) {
    try {
      localStorage.removeItem(NS + key);
      return true;
    } catch { return false; }
  },

  /** prefix で始まるキーの一覧 (NS を除いたキーを返す) */
  keys(prefix) {
    const result = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS + prefix)) {
        result.push(k.slice(NS.length));
      }
    }
    return result;
  }
};

/* ============================================================
   3. アプリ設定定数
   ============================================================ */

const PROBLEM_COUNT = 10;   // 問題一覧の問題数
const AD_EVERY      = 3;    // 何回クリアごとに広告を表示するか
const HINT_MAX      = 3;    // 1問あたりのヒント回数

const DLBL = { easy: '初級', medium: '中級', hard: '上級' };

/* ============================================================
   4. アプリ状態
   ============================================================ */

let SCREEN    = 'home';   // 'home' | 'list' | 'daily' | 'game'

// ── 問題一覧タブ ──
let HOME_DIFF  = 'easy';
/** @type {{ puzzle:number[], solution:number[], pg:any|null }[]|null} */
let HOME_PROBS = { easy: null, medium: null, hard: null };
let HOME_LOADING = { easy: false, medium: false, hard: false };

// ── デイリータブ ──
let CAL_YEAR  = new Date().getFullYear();
let CAL_MONTH = new Date().getMonth();   // 0-indexed
let SEL_DATE  = todayStr();
let DAILY_DIFF = 'medium';

// ── ゲーム状態 ──
/**
 * GZ: ゲーム中の全状態を格納するオブジェクト
 * - puzzle    : number[]     元の問題 (0=空き)
 * - solution  : number[]     解答
 * - cells     : number[]     現在の盤面
 * - notes     : number[][]   メモ (各マスの候補数字)
 * - sel       : number|null  選択中のマスインデックス
 * - noteMode  : boolean      メモモードか
 * - hints     : number       残りヒント回数
 * - wrong     : Set<number>  ミスマスのインデックス
 * - done      : boolean      クリア済みか
 * - pgKey     : string       進捗のストレージキー
 * - title     : string       ゲーム画面タイトル
 * - backTo    : string       戻り先画面 ('home'|'daily')
 */
let GZ = {};

let MENU_OPEN  = false;
let SOLVE_COUNT = Storage.get('solveCount') || 0;

/* ============================================================
   5. ユーティリティ
   ============================================================ */

/** YYYY-MM-DD 形式の今日の日付 */
function todayStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function progressLabel(pg) {
  if (!pg) return { icon: '⚪', label: '未プレイ', cls: 'status-new' };
  if (pg.done) {
    const time = pg.elapsedMs ? `（${formatTime(pg.elapsedMs)}）` : '';
    return { icon: '✅', label: `クリア済み${time}`, cls: 'status-done' };
  }
  return { icon: '🔵', label: '進行中', cls: 'status-progress' };
}

/** デイリー問題を選択できる最も古い日付 (今日から2ヶ月前) を YYYY-MM-DD で返す */
function dailyFloorDate() {
  const now = new Date();
  return todayStr(new Date(now.getFullYear(), now.getMonth() - 2, now.getDate()));
}

/** デイリー問題を選択できる最も古い年月 { y, m } (0-indexed month) を返す */
function dailyFloorMonth() {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() - 2;
  if (m < 0) { m += 12; y -= 1; }
  return { y, m };
}

function dailyProgress(date, diff) {
  return Storage.get(`dpg:${date}:${diff}`);
}

function isDailyDone(date, diff) {
  return !!dailyProgress(date, diff)?.done;
}

function isDailyAnyDone(date) {
  return ['easy', 'medium', 'hard'].some(d => isDailyDone(date, d));
}

/* ============================================================
   6. ナビゲーション
   ============================================================ */

function nav(screen) {
  SCREEN    = screen;
  MENU_OPEN = false;

  const app = document.getElementById('app');
  const mc  = document.getElementById('mc');
  const tabH = document.getElementById('tab-h');
  const tabD = document.getElementById('tab-d');

  app.classList.toggle('game-mode', screen === 'game');
  mc.classList.toggle('no-scroll', screen === 'game');
  tabH.classList.toggle('on', screen === 'home' || screen === 'list');
  tabD.classList.toggle('on', screen === 'daily');

  if (screen === 'home')  renderHome();
  else if (screen === 'list') renderProblemList();
  else if (screen === 'daily') renderDaily();
  // 'game' は enterGame() から直接 renderGame() を呼ぶ
}

/* ============================================================
   7. 問題一覧画面
   ============================================================ */

/** 難易度の問題をすべてロード（なければ生成して保存） */
function loadProblems(diff) {
  if (HOME_LOADING[diff]) return;

  HOME_LOADING[diff] = true;
  HOME_PROBS[diff] = [];
  if (SCREEN === 'list' && HOME_DIFF === diff) renderProblemList();

  const arr = [];
  const loadNext = i => {
    if (i >= PROBLEM_COUNT) {
      HOME_PROBS[diff] = arr;
      HOME_LOADING[diff] = false;
      if (SCREEN === 'list' && HOME_DIFF === diff) renderProblemList();
      return;
    }

    let pd = Storage.get(`lp:${diff}:${i}`);
    if (!pd) {
      pd = generatePuzzle(diff);
      Storage.set(`lp:${diff}:${i}`, pd);
    }
    const pg = Storage.get(`lpg:${diff}:${i}`);
    arr.push({ ...pd, pg });
    HOME_PROBS[diff] = [...arr];

    if (SCREEN === 'list' && HOME_DIFF === diff) renderProblemList();
    setTimeout(() => loadNext(i + 1), 0);
  };

  setTimeout(() => loadNext(0), 0);
}

function renderHome() {
  const mc = document.getElementById('mc');
  const today = todayStr();
  const dailyDone = ['easy', 'medium', 'hard'].filter(d => isDailyDone(today, d));
  const diffItems = ['easy', 'medium', 'hard'].map(d => `
    <button class="home-list-item" data-a="openList" data-v="${d}">
      <span>
        <strong>${DLBL[d]}</strong>
        <small>${PROBLEM_COUNT}問の一覧を見る</small>
      </span>
      <span class="home-list-arrow">›</span>
    </button>
  `).join('');

  mc.innerHTML = `
    <div class="screen home-screen">
      <div class="hero-card">
        <p class="eyebrow">毎日ナンプレ</p>
        <h1>今日も1問、気軽に脳トレ。</h1>
        <p>ホームからデイリー問題や難易度別の問題一覧を選べます。</p>
      </div>

      <section class="home-section">
        <div class="section-head">
          <h2>デイリー問題</h2>
          ${dailyDone.length ? `<span class="done-badge">${dailyDone.map(d => DLBL[d]).join('・')} クリア済み</span>` : ''}
        </div>
        <button class="daily-card" data-a="goDaily">
          <span>
            <strong>${today} の問題</strong>
            <small>${dailyDone.length ? '別の難易度にも挑戦できます' : '日付と難易度を選んで挑戦'}</small>
          </span>
          <span class="home-list-arrow">›</span>
        </button>
      </section>

      <section class="home-section">
        <div class="section-head"><h2>難易度別の問題一覧</h2></div>
        <div class="home-list">${diffItems}</div>
      </section>

      <p class="home-footer-link"><a href="./privacy.html">プライバシーポリシー</a></p>
    </div>`;
}

function problemListItems(probs, diff) {
  return probs.map((p, i) => {
    const status = progressLabel(p.pg);
    return `
      <div class="pitm ${status.cls}" data-a="playL" data-diff="${diff}" data-i="${i}">
        <div>
          <div class="problem-title">問題 ${i + 1}</div>
          <div class="problem-status">${status.label}</div>
        </div>
        <div class="problem-meta">
          <span class="problem-icon">${status.icon}</span>
          <i class="ti ti-chevron-right" aria-hidden="true"></i>
        </div>
      </div>`;
  }).join('');
}

function renderProblemList() {
  const mc    = document.getElementById('mc');
  const diff  = HOME_DIFF;
  const probs = HOME_PROBS[diff];
  const loading = HOME_LOADING[diff];

  let body = '';
  if (probs === null) {
    // 未ロード → まず読み込み画面を描画し、次フレームで生成を開始する
    body = `
      <div class="loading-panel">
        <div class="loading-spinner" aria-hidden="true"></div>
        <p>問題を読み込んでいます...</p>
      </div>`;
    requestAnimationFrame(() => loadProblems(diff));
  } else if (probs.length === 0) {
    body = `
      <div class="loading-panel">
        <div class="loading-spinner" aria-hidden="true"></div>
        <p>${DLBL[diff]}の問題を生成中...</p>
      </div>`;
  } else {
    const progress = loading ? `
      <div class="loading-inline">
        <div class="loading-spinner small" aria-hidden="true"></div>
        <span>${probs.length} / ${PROBLEM_COUNT} 問を読み込みました。残りを生成中...</span>
      </div>` : '';
    body = progress + problemListItems(probs, diff);
  }

  mc.innerHTML = `
    <div class="screen">
      <button class="back-line" data-a="goHome">‹ 難易度リストへ戻る</button>
      <h1 class="screen-title">${DLBL[diff]}の問題一覧</h1>
      <p class="screen-lead">問題を選択してナンプレを開始してください。</p>
      ${body}
    </div>`;
}

/* ============================================================
   8. デイリー画面
   ============================================================ */

function renderDaily() {
  const mc     = document.getElementById('mc');
  const MONTHS = '1月 2月 3月 4月 5月 6月 7月 8月 9月 10月 11月 12月'.split(' ');
  const DAYS   = '日 月 火 水 木 金 土'.split(' ');
  const today  = todayStr();
  const now    = new Date();
  const isNow  = CAL_YEAR === now.getFullYear() && CAL_MONTH === now.getMonth();
  const floorM = dailyFloorMonth();
  const floorDate = dailyFloorDate();
  const isAtFloor = CAL_YEAR === floorM.y && CAL_MONTH === floorM.m;

  const firstDay    = new Date(CAL_YEAR, CAL_MONTH, 1).getDay();
  const daysInMonth = new Date(CAL_YEAR, CAL_MONTH + 1, 0).getDate();

  // カレンダー行を生成
  let rows = '';
  let day  = 1;
  for (let r = 0; r < 6; r++) {
    if (day > daysInMonth) break;
    let row = '<tr>';
    for (let c = 0; c < 7; c++) {
      if ((r === 0 && c < firstDay) || day > daysInMonth) {
        row += '<td></td>';
        continue;
      }
      const ds     = `${CAL_YEAR}-${String(CAL_MONTH + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isTd   = ds === today;
      const isSel  = ds === SEL_DATE;
      const isFut  = ds > today;
      const isOld  = ds < floorDate;
      let cls      = 'cal-day';
      if (isSel)       cls += ' sel';
      else if (isTd)   cls += ' today';
      else if (isFut || isOld) cls += ' future';
      if (isDailyAnyDone(ds)) cls += ' done';

      const att = (!isFut && !isOld) ? `data-a="selDt" data-date="${ds}"` : '';
      row += `<td style="text-align:center"><div class="${cls}" ${att}>${day}${isDailyAnyDone(ds) ? '<span class="cal-dot">✓</span>' : ''}</div></td>`;
      day++;
    }
    rows += row + '</tr>';
  }

  const diffTabs = ['easy', 'medium', 'hard'].map(d =>
    `<button class="sdkd${d === DAILY_DIFF ? ' on' : ''}" data-a="setDD" data-v="${d}">${DLBL[d]}</button>`
  ).join('');

  const selectedPg = SEL_DATE ? dailyProgress(SEL_DATE, DAILY_DIFF) : null;
  const selectedStatus = progressLabel(selectedPg);
  const selectedBlock = (SEL_DATE && SEL_DATE <= today) ? `
    <div class="daily-selected">
      <div class="daily-selected-head">
        <span>${SEL_DATE}${SEL_DATE === today ? ' （今日）' : ''}</span>
        ${selectedPg?.done ? `<span class="done-badge">クリア済み ${selectedPg.elapsedMs ? formatTime(selectedPg.elapsedMs) : ''}</span>` : ''}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px">${diffTabs}</div>
      <div class="problem-status daily-status">${selectedStatus.icon} ${selectedStatus.label}</div>
      <button class="primary-action" data-a="playD">
        ${selectedPg?.done ? 'もう一度見る' : 'この問題を解く'}
      </button>
    </div>` :
    '<p style="margin-top:14px;font-size:13px;color:var(--text3)">日付を選択してください</p>';

  mc.innerHTML = `
    <div class="screen">
      <h1 style="font-size:18px;font-weight:500;color:var(--text);margin-bottom:14px">デイリー</h1>

      <!-- 月ナビゲーション -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <button data-a="calP"
          style="padding:5px 12px;border:0.5px solid var(--border);border-radius:8px;background:transparent;cursor:pointer;color:var(--text2);font-size:13px;font-family:inherit;opacity:${isAtFloor ? 0.3 : 1}"
          ${isAtFloor ? 'disabled' : ''}>◀</button>
        <span style="font-size:15px;font-weight:500;color:var(--text)">${CAL_YEAR}年 ${MONTHS[CAL_MONTH]}</span>
        <button data-a="calN"
          style="padding:5px 12px;border:0.5px solid var(--border);border-radius:8px;background:transparent;cursor:pointer;color:var(--text2);font-size:13px;font-family:inherit;opacity:${isNow ? 0.3 : 1}"
          ${isNow ? 'disabled' : ''}>▶</button>
      </div>

      <!-- カレンダー -->
      <table class="cal-table">
        <tr>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr>
        ${rows}
      </table>

      ${selectedBlock}
    </div>`;
}

/* ============================================================
   9. ゲームエントリ
   ============================================================ */

function playList(diff, i) {
  const pd = (HOME_PROBS[diff]?.[i]) || Storage.get(`lp:${diff}:${i}`) || generatePuzzle(diff);
  enterGame(pd, `lpg:${diff}:${i}`, `${DLBL[diff]} — 問題 ${i + 1}`, 'list');
}

function playDaily(date, diff) {
  let pd = Storage.get(`dp:${date}:${diff}`);
  if (!pd) {
    pd = generatePuzzle(diff);
    Storage.set(`dp:${date}:${diff}`, pd);
  }
  enterGame(pd, `dpg:${date}:${diff}`, `デイリー ${date} / ${DLBL[diff]}`, 'daily');
}

function enterGame(pd, pgKey, title, backTo) {
  const pg = Storage.get(pgKey);
  GZ = {
    puzzle:   pd.puzzle,
    solution: pd.solution,
    cells:    pg ? pg.cells : [...pd.puzzle],
    notes:    pg ? (pg.notes || []).map(n => n || []) : Array(81).fill(null).map(() => []),
    sel:      null,
    noteMode: false,
    hints:    pg ? (pg.hints ?? HINT_MAX) : HINT_MAX,
    wrong:    new Set(pg ? (pg.wrong || []) : []),
    done:     pg ? (pg.done || false) : false,
    startedAt: pg?.startedAt || Date.now(),
    elapsedMs: pg?.elapsedMs || 0,
    completedAt: pg?.completedAt || null,
    showErrors: false,
    lastCheck: null,
    pgKey, title, backTo,
  };
  SCREEN    = 'game';
  MENU_OPEN = false;

  const app  = document.getElementById('app');
  const mc   = document.getElementById('mc');
  const tabH = document.getElementById('tab-h');
  const tabD = document.getElementById('tab-d');
  app.classList.add('game-mode');
  mc.classList.add('no-scroll');
  tabH.classList.remove('on');
  tabD.classList.remove('on');

  renderGame();
}

function saveGame() {
  Storage.set(GZ.pgKey, {
    cells: GZ.cells,
    notes: GZ.notes,
    hints: GZ.hints,
    wrong: [...GZ.wrong],
    done:  GZ.done,
    startedAt: GZ.startedAt,
    elapsedMs: GZ.elapsedMs || (GZ.done ? Date.now() - GZ.startedAt : 0),
    completedAt: GZ.completedAt,
  });
}

function backFromGame() {
  // 問題一覧の進捗を更新
  if (GZ.backTo === 'list' && GZ.pgKey?.startsWith('lpg:')) {
    const [, diff, idx] = GZ.pgKey.split(':');
    if (HOME_PROBS[diff]?.[+idx]) {
      HOME_PROBS[diff][+idx].pg = Storage.get(GZ.pgKey);
    }
  }
  nav(GZ.backTo || 'home');
}

/* ============================================================
   10. ゲーム画面
   ============================================================ */

function renderGame() {
  const mc = document.getElementById('mc');

  mc.innerHTML = `
  <div style="display:flex;flex-direction:column;height:100%;position:relative">

    <!-- ヘッダー -->
    <div style="display:flex;align-items:center;justify-content:space-between;
         padding:6px 10px;border-bottom:0.5px solid var(--border2);flex-shrink:0;min-height:45px">
      <button data-a="menuT"
        style="padding:5px 8px;background:transparent;border:none;cursor:pointer;color:var(--text)"
        aria-label="メニュー">
        <i class="ti ti-menu-2" style="font-size:22px" aria-hidden="true"></i>
      </button>
      <span style="font-size:13px;font-weight:500;color:var(--text);flex:1;text-align:center;
            padding:0 8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
        ${GZ.title}
      </span>
      <button data-a="back"
        style="padding:5px 8px;background:transparent;border:none;cursor:pointer;
               color:var(--text2);font-size:13px;font-family:inherit">
        戻る
      </button>
    </div>

    <!-- ☰ ハンバーガーメニュー (position:absolute) -->
    <div id="hmenu">
      <div class="hmenu-section">
        <div class="hmenu-label">メニュー</div>
        <button class="btn-hint" data-a="gHint">
          <i class="ti ti-bulb" aria-hidden="true"></i>
          <span>ヒントを使う（残り <strong id="hl">${GZ.hints}</strong> 回）</span>
        </button>
        <button class="btn-menu" data-a="gCheck">
          <i class="ti ti-check" aria-hidden="true"></i> エラーチェック
        </button>
        <button class="btn-menu" data-a="showHow">
          <i class="ti ti-help" aria-hidden="true"></i> 遊び方
        </button>
        <button class="btn-reset" data-a="gReset">
          <i class="ti ti-refresh" aria-hidden="true"></i> リセット
        </button>
      </div>
    </div>

    <!-- ゲームエリア -->
    <div class="game-area">

      <!-- 盤面 -->
      <div class="sdk-board game-board" id="brd"></div>

      <!-- ステータス行 -->
      <div class="game-status-row">
        <div id="serr" style="font-size:12px;color:var(--text3)">未チェック</div>
        <div style="display:flex;align-items:center;gap:2px">
          <span id="h0" style="font-size:14px">●</span>
          <span id="h1" style="font-size:14px">●</span>
          <span id="h2" style="font-size:14px">●</span>
        </div>
      </div>

      <!-- コントロール行 -->
      <div class="game-controls">
        <button class="sdk-ctrl" data-a="gErase">
          <i class="ti ti-eraser" style="font-size:15px" aria-hidden="true"></i>
          <span>消す</span>
        </button>
        <button class="sdk-ctrl" id="nbtn" data-a="gNote">
          <i class="ti ti-pencil" style="font-size:15px" aria-hidden="true"></i>
          <span id="nlbl">メモ</span>
        </button>
        <div style="flex:1"></div>
      </div>

      <!-- 数字パッド -->
      <div class="number-pad" id="pad"></div>
    </div>

    <!-- クリアオーバーレイ -->
    <div class="overlay" id="cov" style="align-items:center;justify-content:center">
      <div class="modal-card">
        <div style="font-size:44px;margin-bottom:8px">🎉</div>
        <div style="font-size:20px;font-weight:500;color:var(--text);margin-bottom:6px">クリア！</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">${GZ.title}</div>
        <div class="clear-time">クリア時間：<strong id="clearTime">${formatTime(GZ.elapsedMs)}</strong></div>
        <div style="display:flex;gap:8px">
          <button data-a="closeOv"
            style="flex:1;padding:10px 0;background:var(--bg2);border:0.5px solid var(--border);
                   border-radius:8px;font-size:13px;cursor:pointer;color:var(--text2);font-family:inherit">
            閉じる
          </button>
          <button data-a="back"
            style="flex:1;padding:10px 0;background:var(--text);border:none;border-radius:8px;
                   font-size:13px;cursor:pointer;color:var(--bg);font-weight:500;font-family:inherit">
            一覧へ戻る
          </button>
        </div>
      </div>
    </div>

    <!-- ヒント前広告オーバーレイ -->
    <div class="overlay" id="hintov" style="align-items:center;justify-content:center">
      <div class="modal-card hint-card">
        <div style="font-size:20px;font-weight:600;margin-bottom:8px">ヒントを使う</div>
        <p class="hint-copy">広告を確認してから、選択中のマスにヒントを入力します。</p>
        <div class="ad-banner popup-ad" aria-label="広告">
          <span style="font-size:10px">広告</span>
          <span>広告スペース</span>
          <span style="font-size:10px">PR</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button data-a="closeHint"
            style="flex:1;padding:10px 0;background:var(--bg2);border:0.5px solid var(--border);
                   border-radius:8px;font-size:13px;cursor:pointer;color:var(--text2);font-family:inherit">
            キャンセル
          </button>
          <button data-a="useHint"
            style="flex:1;padding:10px 0;background:var(--text);border:none;border-radius:8px;
                   font-size:13px;cursor:pointer;color:var(--bg);font-weight:500;font-family:inherit">
            ヒント実行
          </button>
        </div>
      </div>
    </div>

    <!-- エラーチェック前広告オーバーレイ -->
    <div class="overlay" id="checkov" style="align-items:center;justify-content:center">
      <div class="modal-card hint-card">
        <div style="font-size:20px;font-weight:600;margin-bottom:8px">エラーチェック</div>
        <p class="hint-copy">広告を確認してから、現在の入力にミスがないか確認します。</p>
        <div class="ad-banner popup-ad" aria-label="広告">
          <span style="font-size:10px">広告</span>
          <span>広告スペース</span>
          <span style="font-size:10px">PR</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button data-a="closeCheck"
            style="flex:1;padding:10px 0;background:var(--bg2);border:0.5px solid var(--border);
                   border-radius:8px;font-size:13px;cursor:pointer;color:var(--text2);font-family:inherit">
            キャンセル
          </button>
          <button data-a="runCheck"
            style="flex:1;padding:10px 0;background:var(--text);border:none;border-radius:8px;
                   font-size:13px;cursor:pointer;color:var(--bg);font-weight:500;font-family:inherit">
            チェック実行
          </button>
        </div>
      </div>
    </div>

    <!-- 遊び方オーバーレイ -->
    <div class="overlay" id="howto" style="align-items:center;justify-content:center">
      <div class="modal-card howto-card">
        <div style="font-size:20px;font-weight:600;margin-bottom:10px">遊び方</div>
        <ul class="howto-list">
          <li>空いているマスを選び、下の数字で入力します。</li>
          <li>メモを押すと候補数字を小さく記録できます。</li>
          <li>ヒントとエラーチェックは左上の☰メニューから実行します。</li>
          <li>すべて正しい数字で埋めるとクリア時間が保存されます。</li>
        </ul>
        <button class="primary-action" data-a="closeHow">閉じる</button>
      </div>
    </div>

  </div>`;

  // 盤面セルを生成
  const brd = document.getElementById('brd');
  for (let i = 0; i < 81; i++) {
    const el = document.createElement('div');
    el.id = 'c' + i;
    el.className = 'sdk-cell';
    el.dataset.a = 'gClick';
    el.dataset.i = i;
    brd.appendChild(el);
  }

  // 数字パッドを生成
  const pad = document.getElementById('pad');
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement('button');
    b.id = 'npad' + n;
    b.className = 'sdk-npad';
    b.dataset.a = 'gEnter';
    b.dataset.n  = n;
    b.textContent = n;
    pad.appendChild(b);
  }
  const bk = document.createElement('button');
  bk.className = 'sdk-npad';
  bk.dataset.a = 'gErase';
  bk.style.fontSize = '14px';
  bk.innerHTML = '<i class="ti ti-backspace" aria-hidden="true"></i>';
  pad.appendChild(bk);

  updateAllCells();
  updateStatus();
  updatePad();
  if (GZ.done) showOverlay('cov');
}

/* ============================================================
   11. セルレンダリング
   ============================================================ */

function cellContent(i) {
  const val   = GZ.cells[i];
  const notes = GZ.notes[i] || [];
  if (val === 0 && notes.length > 0) {
    return '<div class="sdkmn">' +
      [1,2,3,4,5,6,7,8,9].map(n =>
        `<span>${notes.includes(n) ? n : ''}</span>`
      ).join('') +
      '</div>';
  }
  return val > 0 ? String(val) : '';
}

function updateCell(i) {
  const el = document.getElementById('c' + i);
  if (!el || !GZ.puzzle) return;

  const isGiven = GZ.puzzle[i] !== 0;
  const isSel   = i === GZ.sel;
  const isErr   = GZ.showErrors && GZ.wrong.has(i);

  let isRel = false, isSame = false;
  if (GZ.sel !== null && !isSel) {
    const sr = Math.floor(GZ.sel / 9), sc = GZ.sel % 9;
    const sb = Math.floor(sr / 3) * 3 + Math.floor(sc / 3);
    const r  = Math.floor(i / 9), c = i % 9;
    const b  = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    isRel  = (r === sr || c === sc || b === sb);
    const sv = GZ.cells[GZ.sel];
    isSame = !isRel && sv !== 0 && GZ.cells[i] === sv;
  }

  const co = i % 9, ro = Math.floor(i / 9);
  el.className = [
    'sdk-cell',
    (co === 2 || co === 5) ? 'rb' : '',
    (ro === 2 || ro === 5) ? 'bb' : '',
    isSel  ? 'sel'  : '',
    (!isSel && isRel)  ? 'rel'  : '',
    (!isSel && !isRel && isSame) ? 'same' : '',
    isErr ? 'err' : (isGiven ? 'given' : 'user'),
  ].filter(Boolean).join(' ');

  el.innerHTML = cellContent(i);
}

function updateAllCells() {
  for (let i = 0; i < 81; i++) updateCell(i);
}

function updateStatus() {
  const GOLD = 'var(--warn)';
  const GRAY = 'var(--border)';
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById('h' + i);
    if (el) el.style.color = i < GZ.hints ? GOLD : GRAY;
  }
  const hl = document.getElementById('hl');
  if (hl) hl.textContent = GZ.hints;

  const es = document.getElementById('serr');
  if (!es) return;
  if (GZ.done) {
    es.textContent = `✅ クリア済み ${formatTime(GZ.elapsedMs)}`; es.style.color = 'var(--ok)';
  } else if (GZ.lastCheck) {
    es.textContent = GZ.lastCheck;
    es.style.color = GZ.wrong.size > 0 ? 'var(--error)' : 'var(--ok)';
  } else {
    es.textContent = 'エラー未チェック'; es.style.color = 'var(--text3)';
  }
}

/** 盤面に9個すべて入力済みの数字は、数字パッドで選択できないようにする */
function updatePad() {
  for (let n = 1; n <= 9; n++) {
    const btn = document.getElementById('npad' + n);
    if (!btn) continue;
    const full = GZ.cells.filter(v => v === n).length >= 9;
    btn.classList.toggle('full', full);
    btn.disabled = full;
  }
}

function showOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}
function hideOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
function closeMenu() {
  MENU_OPEN = false;
  const m = document.getElementById('hmenu');
  if (m) m.style.display = 'none';
}

/* ============================================================
   12. ゲーム操作
   ============================================================ */


function finalizeClear() {
  GZ.done = true;
  if (!GZ.elapsedMs) GZ.elapsedMs = Date.now() - GZ.startedAt;
  if (!GZ.completedAt) GZ.completedAt = new Date().toISOString();
  GZ.showErrors = false;
  GZ.lastCheck = null;
  saveGame();
  updateAllCells();
  updateStatus();
  updatePad();
  const ct = document.getElementById('clearTime');
  if (ct) ct.textContent = formatTime(GZ.elapsedMs);
  SOLVE_COUNT++;
  Storage.set('solveCount', SOLVE_COUNT);
  // ★ 広告: AD_EVERY 回に1回インタースティシャル
  if (SOLVE_COUNT % AD_EVERY === 0) {
    console.log('[広告] インタースティシャル広告を表示するタイミング');
    // PWA版では AdSense 等のWeb広告を使用する。初期リリースでは未実装。
  }
  showOverlay('cov');
}

function gCheck() {
  closeMenu();
  if (!GZ.puzzle || GZ.done) return;
  showOverlay('checkov');
}

function runCheck() {
  hideOverlay('checkov');
  if (!GZ.puzzle || GZ.done) return;
  GZ.showErrors = true;
  GZ.lastCheck = GZ.wrong.size > 0 ? `ミス: ${GZ.wrong.size}箇所` : '現在の入力にエラーはありません';
  updateAllCells();
  updateStatus();
}

function gClick(i) {
  if (GZ.done) return;
  GZ.sel = (GZ.sel === i) ? null : i;
  closeMenu();
  updateAllCells();
}

function gEnter(n) {
  if (GZ.sel === null || !GZ.puzzle || GZ.done) return;
  if (GZ.puzzle[GZ.sel] !== 0) return; // 初期値マスは変更不可

  // メモモード
  if (GZ.noteMode && n > 0) {
    const arr = GZ.notes[GZ.sel];
    const idx = arr.indexOf(n);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(n);
    updateCell(GZ.sel);
    saveGame();
    return;
  }

  // 通常入力 (同じ数字を押すとトグルで消去)
  const newVal = (GZ.cells[GZ.sel] === n) ? 0 : n;
  GZ.cells[GZ.sel] = newVal;

  if (newVal !== 0 && GZ.solution[GZ.sel] !== newVal) {
    GZ.wrong.add(GZ.sel);
  } else {
    GZ.wrong.delete(GZ.sel);
  }

  GZ.notes[GZ.sel] = [];
  GZ.showErrors = false;
  GZ.lastCheck = null;

  // クリア判定
  const isDone = GZ.wrong.size === 0 && GZ.cells.every((v, i) => v === GZ.solution[i]);
  if (isDone) {
    finalizeClear();
    return;
  }

  updateAllCells();
  updateStatus();
  updatePad();
  saveGame();
}

function gErase() {
  if (GZ.sel === null || !GZ.puzzle || GZ.done) return;
  if (GZ.puzzle[GZ.sel] !== 0) return;
  GZ.cells[GZ.sel] = 0;
  GZ.wrong.delete(GZ.sel);
  GZ.notes[GZ.sel] = [];
  GZ.showErrors = false;
  GZ.lastCheck = null;
  updateCell(GZ.sel);
  updateStatus();
  updatePad();
  saveGame();
}

function gNote() {
  GZ.noteMode = !GZ.noteMode;
  const btn = document.getElementById('nbtn');
  const lbl = document.getElementById('nlbl');
  if (btn) btn.classList.toggle('on', GZ.noteMode);
  if (lbl) lbl.textContent = GZ.noteMode ? 'メモ中' : 'メモ';
}

function gHint() {
  closeMenu();
  if (!GZ.puzzle || GZ.done) return;
  if (GZ.hints <= 0) {
    alert('ヒントの残り回数がありません。');
    return;
  }
  // 選択中のマスがない・確定済み・初期値マスの場合は、未解決のマスを自動選択する
  if (GZ.sel === null || GZ.puzzle[GZ.sel] !== 0 || GZ.cells[GZ.sel] === GZ.solution[GZ.sel]) {
    const idx = GZ.cells.findIndex((v, i) => GZ.puzzle[i] === 0 && v !== GZ.solution[i]);
    if (idx === -1) return; // 残りのマスがすべて正解済み
    GZ.sel = idx;
    updateAllCells();
  }
  showOverlay('hintov');
}

function useHint() {
  hideOverlay('hintov');
  if (GZ.hints <= 0 || GZ.sel === null || GZ.done) return;
  if (GZ.puzzle[GZ.sel] !== 0) return;
  GZ.cells[GZ.sel] = GZ.solution[GZ.sel];
  GZ.wrong.delete(GZ.sel);
  GZ.notes[GZ.sel] = [];
  GZ.hints--;
  GZ.showErrors = false;
  GZ.lastCheck = null;
  closeMenu();

  const isDone = GZ.wrong.size === 0 && GZ.cells.every((v, i) => v === GZ.solution[i]);
  if (isDone) {
    finalizeClear();
    return;
  }
  updateAllCells();
  updateStatus();
  updatePad();
  saveGame();
}

function gReset() {
  GZ.cells    = [...GZ.puzzle];
  GZ.notes    = Array(81).fill(null).map(() => []);
  GZ.wrong    = new Set();
  GZ.done     = false;
  GZ.hints    = HINT_MAX;
  GZ.sel      = null;
  GZ.noteMode = false;
  GZ.elapsedMs = 0;
  GZ.completedAt = null;
  GZ.startedAt = Date.now();
  GZ.showErrors = false;
  GZ.lastCheck = null;
  closeMenu();
  const btn = document.getElementById('nbtn');
  const lbl = document.getElementById('nlbl');
  if (btn) btn.classList.remove('on');
  if (lbl) lbl.textContent = 'メモ';
  updateAllCells();
  updateStatus();
  updatePad();
  saveGame();
}

/* ============================================================
   13. イベントディスパッチャー
   ============================================================ */

function dispatch(action, data) {
  const ACTIONS = {
    // ホーム・問題一覧
    goHome: () => nav('home'),
    goDaily:() => nav('daily'),
    openList: () => { HOME_DIFF = data.v; nav('list'); },
    setHD:  () => { HOME_DIFF = data.v; renderProblemList(); },
    playL:  () => playList(data.diff, +data.i),
    // デイリー
    setDD:  () => { DAILY_DIFF = data.v; renderDaily(); },
    selDt:  () => { SEL_DATE = data.date; renderDaily(); },
    calP:   () => {
      const floor = dailyFloorMonth();
      if (CAL_YEAR === floor.y && CAL_MONTH === floor.m) return;
      CAL_MONTH--;
      if (CAL_MONTH < 0) { CAL_MONTH = 11; CAL_YEAR--; }
      if (CAL_YEAR < floor.y || (CAL_YEAR === floor.y && CAL_MONTH < floor.m)) {
        CAL_YEAR = floor.y; CAL_MONTH = floor.m;
      }
      renderDaily();
    },
    calN:   () => {
      const now = new Date();
      if (CAL_YEAR > now.getFullYear() ||
         (CAL_YEAR === now.getFullYear() && CAL_MONTH >= now.getMonth())) return;
      CAL_MONTH++;
      if (CAL_MONTH > 11) { CAL_MONTH = 0; CAL_YEAR++; }
      renderDaily();
    },
    playD:  () => playDaily(SEL_DATE, DAILY_DIFF),
    // ゲーム
    menuT:  () => {
      MENU_OPEN = !MENU_OPEN;
      const m = document.getElementById('hmenu');
      if (m) m.style.display = MENU_OPEN ? 'block' : 'none';
    },
    back:   () => backFromGame(),
    gHint:  () => gHint(),
    useHint:() => useHint(),
    closeHint:() => hideOverlay('hintov'),
    gCheck: () => gCheck(),
    runCheck:() => runCheck(),
    closeCheck:() => hideOverlay('checkov'),
    showHow:() => { closeMenu(); showOverlay('howto'); },
    closeHow:() => hideOverlay('howto'),
    gReset: () => gReset(),
    gErase: () => gErase(),
    gNote:  () => gNote(),
    gClick: () => gClick(+data.i),
    gEnter: () => gEnter(+data.n),
    closeOv:() => hideOverlay('cov'),
  };
  const fn = ACTIONS[action];
  if (fn) fn();
}

/* ============================================================
   14. 初期化
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const mc   = document.getElementById('mc');
  const tabH = document.getElementById('tab-h');
  const tabD = document.getElementById('tab-d');

  // タブクリック
  tabH.addEventListener('click', () => nav('home'));
  tabD.addEventListener('click', () => nav('daily'));

  // クリックイベント委譲 (data-a 属性で判別)
  mc.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el || el.tagName === 'INPUT') return;
    dispatch(el.dataset.a, el.dataset);
  });

  // キーボード操作 (デスクトップ向け)
  document.addEventListener('keydown', e => {
    if (SCREEN !== 'game') return;
    if (e.key >= '1' && e.key <= '9') {
      gEnter(+e.key);
    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      gErase();
    } else if (e.key === 'm' || e.key === 'M') {
      gNote();
    } else if (GZ.sel !== null) {
      const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
      const delta = moves[e.key];
      if (delta !== undefined) {
        const next = GZ.sel + delta;
        if (next >= 0 && next < 81) gClick(next);
        e.preventDefault();
      }
    }
  });

  // 初期表示
  nav('home');
});
