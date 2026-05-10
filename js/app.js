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

let SCREEN    = 'home';   // 'home' | 'daily' | 'game'

// ── 問題一覧タブ ──
let HOME_DIFF  = 'easy';
/** @type {{ puzzle:number[], solution:number[], pg:any|null }[]|null} */
let HOME_PROBS = { easy: null, medium: null, hard: null };

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
let SETTINGS   = Storage.get('settings') || { showErrors: true, autoClear: true };
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

/* ============================================================
   6. ナビゲーション
   ============================================================ */

function nav(screen) {
  SCREEN    = screen;
  MENU_OPEN = false;

  const mc  = document.getElementById('mc');
  const tabH = document.getElementById('tab-h');
  const tabD = document.getElementById('tab-d');

  mc.classList.toggle('no-scroll', screen === 'game');
  tabH.classList.toggle('on', screen === 'home');
  tabD.classList.toggle('on', screen === 'daily');

  if (screen === 'home')  renderHome();
  else if (screen === 'daily') renderDaily();
  // 'game' は enterGame() から直接 renderGame() を呼ぶ
}

/* ============================================================
   7. 問題一覧画面
   ============================================================ */

/** 難易度の問題をすべてロード（なければ生成して保存） */
async function loadProblems(diff) {
  HOME_PROBS[diff] = [];
  if (SCREEN === 'home' && HOME_DIFF === diff) renderHome(); // ローディング表示

  const arr = [];
  for (let i = 0; i < PROBLEM_COUNT; i++) {
    let pd = Storage.get(`lp:${diff}:${i}`);
    if (!pd) {
      pd = generatePuzzle(diff);
      Storage.set(`lp:${diff}:${i}`, pd);
    }
    const pg = Storage.get(`lpg:${diff}:${i}`);
    arr.push({ ...pd, pg });

    // 最初の問題が生成できたら即表示
    if (i === 0) {
      HOME_PROBS[diff] = [...arr];
      if (SCREEN === 'home' && HOME_DIFF === diff) renderHome();
    }
  }
  HOME_PROBS[diff] = arr;
  if (SCREEN === 'home' && HOME_DIFF === diff) renderHome();
}

function renderHome() {
  const mc    = document.getElementById('mc');
  const probs = HOME_PROBS[HOME_DIFF];

  const diffTabs = ['easy', 'medium', 'hard'].map(d =>
    `<button class="sdkd${d === HOME_DIFF ? ' on' : ''}" data-a="setHD" data-v="${d}">${DLBL[d]}</button>`
  ).join('');

  let body = '';
  if (probs === null) {
    // 未ロード → ロード開始
    body = '<p style="padding:40px 0;text-align:center;color:var(--text3);font-size:14px">読み込み中...</p>';
    loadProblems(HOME_DIFF);
  } else if (probs.length === 0) {
    body = '<p style="padding:40px 0;text-align:center;color:var(--text3);font-size:14px">生成中...</p>';
  } else {
    body = probs.map((p, i) => {
      const isDone = p.pg?.done;
      const isIn   = p.pg && !p.pg.done;
      const icon   = isDone ? '✅' : isIn ? '🔵' : '⚪';
      const label  = isDone ? 'クリア済み' : isIn ? '進行中' : '未プレイ';
      return `
        <div class="pitm" data-a="playL" data-diff="${HOME_DIFF}" data-i="${i}">
          <div>
            <div style="font-size:14px;font-weight:500;color:var(--text)">問題 ${i + 1}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${label}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:16px">${icon}</span>
            <i class="ti ti-chevron-right" style="font-size:14px;color:var(--text3)" aria-hidden="true"></i>
          </div>
        </div>`;
    }).join('');
  }

  mc.innerHTML = `
    <div class="screen">
      <h1 style="font-size:18px;font-weight:500;color:var(--text);margin-bottom:12px">問題一覧</h1>
      <div style="display:flex;gap:8px;margin-bottom:14px">${diffTabs}</div>
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
      let cls      = 'cal-day';
      if (isSel)       cls += ' sel';
      else if (isTd)   cls += ' today';
      else if (isFut)  cls += ' future';

      const att = (!isFut) ? `data-a="selDt" data-date="${ds}"` : '';
      row += `<td style="text-align:center"><div class="${cls}" ${att}>${day}</div></td>`;
      day++;
    }
    rows += row + '</tr>';
  }

  const diffTabs = ['easy', 'medium', 'hard'].map(d =>
    `<button class="sdkd${d === DAILY_DIFF ? ' on' : ''}" data-a="setDD" data-v="${d}">${DLBL[d]}</button>`
  ).join('');

  const selectedBlock = (SEL_DATE && SEL_DATE <= today) ? `
    <div style="border-top:0.5px solid var(--border2);padding-top:14px;margin-top:14px">
      <div style="font-size:14px;font-weight:500;color:var(--text);margin-bottom:10px">
        ${SEL_DATE}${SEL_DATE === today ? ' （今日）' : ''}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px">${diffTabs}</div>
      <button data-a="playD"
        style="width:100%;padding:12px;background:var(--text);color:var(--bg);border:none;border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit">
        この問題を解く
      </button>
    </div>` :
    '<p style="margin-top:14px;font-size:13px;color:var(--text3)">日付を選択してください</p>';

  mc.innerHTML = `
    <div class="screen">
      <h1 style="font-size:18px;font-weight:500;color:var(--text);margin-bottom:14px">デイリー</h1>

      <!-- 月ナビゲーション -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <button data-a="calP"
          style="padding:5px 12px;border:0.5px solid var(--border);border-radius:8px;background:transparent;cursor:pointer;color:var(--text2);font-size:13px;font-family:inherit">◀</button>
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
  enterGame(pd, `lpg:${diff}:${i}`, `${DLBL[diff]} — 問題 ${i + 1}`, 'home');
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
    pgKey, title, backTo,
  };
  SCREEN    = 'game';
  MENU_OPEN = false;

  const mc   = document.getElementById('mc');
  const tabH = document.getElementById('tab-h');
  const tabD = document.getElementById('tab-d');
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
  });
}

function backFromGame() {
  // 問題一覧の進捗を更新
  if (GZ.backTo === 'home' && GZ.pgKey?.startsWith('lpg:')) {
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
        <div class="hmenu-label">ヒント残り <strong id="hl">${GZ.hints}</strong> 回</div>
        <button class="btn-hint" data-a="gHint">
          <i class="ti ti-bulb" aria-hidden="true"></i> ヒントを使う
        </button>
        <button class="btn-reset" data-a="gReset">
          <i class="ti ti-refresh" aria-hidden="true"></i> リセット
        </button>
      </div>
      <div class="hmenu-section">
        <div class="hmenu-label">設定</div>
        <label class="setting-row">
          <span>エラーを表示</span>
          <input type="checkbox" data-a="x" data-key="showErrors" ${SETTINGS.showErrors ? 'checked' : ''}>
        </label>
        <label class="setting-row">
          <span>メモを自動消去</span>
          <input type="checkbox" data-a="x" data-key="autoClear" ${SETTINGS.autoClear ? 'checked' : ''}>
        </label>
      </div>
      <div class="hmenu-section">
        <div class="hmenu-label">広告スペース</div>
        <div class="ad-banner" style="margin-top:0">
          <span style="font-size:10px">広告</span>
          <span>広告</span>
          <span style="font-size:10px">✕</span>
        </div>
      </div>
    </div>

    <!-- ゲームエリア -->
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;
         padding:8px 12px 4px;overflow:hidden">

      <!-- 盤面 -->
      <div class="sdk-board" id="brd" style="width:100%;max-width:320px;flex-shrink:0"></div>

      <!-- ステータス行 -->
      <div style="width:100%;max-width:320px;display:flex;justify-content:space-between;
           align-items:center;padding:5px 0;flex-shrink:0">
        <div id="serr" style="font-size:12px;color:var(--text3)">エラーなし</div>
        <div style="display:flex;align-items:center;gap:2px">
          <span id="h0" style="font-size:14px">●</span>
          <span id="h1" style="font-size:14px">●</span>
          <span id="h2" style="font-size:14px">●</span>
        </div>
      </div>

      <!-- コントロール行 -->
      <div style="width:100%;max-width:320px;display:flex;gap:6px;margin-bottom:6px;flex-shrink:0">
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
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;
           width:100%;max-width:320px;flex-shrink:0" id="pad"></div>
    </div>

    <!-- クリアオーバーレイ -->
    <div class="overlay" id="cov" style="align-items:center;justify-content:center">
      <div class="modal-card">
        <div style="font-size:44px;margin-bottom:8px">🎉</div>
        <div style="font-size:20px;font-weight:500;color:var(--text);margin-bottom:6px">クリア！</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:20px">${GZ.title}</div>
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
  const isErr   = SETTINGS.showErrors && GZ.wrong.has(i);

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
    es.textContent = '✅ クリア済み'; es.style.color = 'var(--ok)';
  } else if (GZ.wrong.size > 0) {
    es.textContent = `ミス: ${GZ.wrong.size}箇所`; es.style.color = 'var(--error)';
  } else {
    es.textContent = 'エラーなし'; es.style.color = 'var(--text3)';
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

  if (SETTINGS.autoClear) GZ.notes[GZ.sel] = [];

  // クリア判定
  const isDone = GZ.wrong.size === 0 && GZ.cells.every((v, i) => v === GZ.solution[i]);
  if (isDone) {
    GZ.done = true;
    saveGame();
    updateAllCells();
    updateStatus();
    SOLVE_COUNT++;
    Storage.set('solveCount', SOLVE_COUNT);
    // ★ 広告: AD_EVERY 回に1回インタースティシャル
    if (SOLVE_COUNT % AD_EVERY === 0) {
      console.log('[広告] インタースティシャル広告を表示するタイミング');
      // PWA版では AdSense 等のWeb広告を使用する。初期リリースでは未実装。
    }
    showOverlay('cov');
    return;
  }

  updateAllCells();
  updateStatus();
  saveGame();
}

function gErase() {
  if (GZ.sel === null || !GZ.puzzle || GZ.done) return;
  if (GZ.puzzle[GZ.sel] !== 0) return;
  GZ.cells[GZ.sel] = 0;
  GZ.wrong.delete(GZ.sel);
  GZ.notes[GZ.sel] = [];
  updateCell(GZ.sel);
  updateStatus();
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
  if (GZ.hints <= 0 || GZ.sel === null || GZ.done) return;
  if (GZ.puzzle[GZ.sel] !== 0) return;
  GZ.cells[GZ.sel] = GZ.solution[GZ.sel];
  GZ.wrong.delete(GZ.sel);
  GZ.notes[GZ.sel] = [];
  GZ.hints--;
  closeMenu();

  const isDone = GZ.wrong.size === 0 && GZ.cells.every((v, i) => v === GZ.solution[i]);
  if (isDone) {
    GZ.done = true;
    saveGame();
    updateAllCells();
    updateStatus();
    showOverlay('cov');
    return;
  }
  updateAllCells();
  updateStatus();
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
  closeMenu();
  const btn = document.getElementById('nbtn');
  const lbl = document.getElementById('nlbl');
  if (btn) btn.classList.remove('on');
  if (lbl) lbl.textContent = 'メモ';
  updateAllCells();
  updateStatus();
  saveGame();
}

/* ============================================================
   13. イベントディスパッチャー
   ============================================================ */

function dispatch(action, data) {
  const ACTIONS = {
    // 問題一覧
    setHD:  () => { HOME_DIFF = data.v; renderHome(); },
    playL:  () => playList(data.diff, +data.i),
    // デイリー
    setDD:  () => { DAILY_DIFF = data.v; renderDaily(); },
    selDt:  () => { SEL_DATE = data.date; renderDaily(); },
    calP:   () => {
      CAL_MONTH--;
      if (CAL_MONTH < 0) { CAL_MONTH = 11; CAL_YEAR--; }
      if (CAL_YEAR < 2024) { CAL_YEAR = 2024; CAL_MONTH = 0; }
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

  // チェックボックスのchange (設定)
  mc.addEventListener('change', e => {
    const el = e.target.closest('[data-a]');
    if (!el || el.tagName !== 'INPUT') return;
    SETTINGS[el.dataset.key] = el.checked;
    Storage.set('settings', SETTINGS);
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
