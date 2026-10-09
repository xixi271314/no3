/* ============================================================
 * 火箭运输决策局 —— 三种数据交换技术模拟
 * 节点网络：工厂(你) + 货运站(竞争) -> 中转节点 -> 发射场
 * ============================================================ */

// ---------- 网络拓扑 ----------
const NODES = {
  S_me:    { x: 95,  y: 190, label: "火箭工厂", sub: "发送端(你)", type: "source" },
  S_rival: { x: 95,  y: 430, label: "货运站",   sub: "竞争列车", type: "source" },
  A: { x: 285, y: 110, label: "A" },
  B: { x: 285, y: 300, label: "B" },
  C: { x: 285, y: 470, label: "C" },
  D: { x: 490, y: 80,  label: "D" },
  E: { x: 490, y: 290, label: "E" },
  F: { x: 490, y: 480, label: "F" },
  G: { x: 710, y: 170, label: "G" },
  H: { x: 710, y: 410, label: "H" },
  R: { x: 915, y: 290, label: "发射场", sub: "接收端", type: "sink" },
};

// 边：单向 toward R
const EDGES = [
  { k: "S_me-A",    from: "S_me", to: "A" },
  { k: "S_me-B",    from: "S_me", to: "B" },
  { k: "S_rival-B", from: "S_rival", to: "B" },
  { k: "S_rival-C", from: "S_rival", to: "C" },
  { k: "A-D", from: "A", to: "D" },
  { k: "A-E", from: "A", to: "E" },
  { k: "B-E", from: "B", to: "E" },
  { k: "B-F", from: "B", to: "F" },
  { k: "C-E", from: "C", to: "E" },
  { k: "C-F", from: "C", to: "F" },
  { k: "D-G", from: "D", to: "G" },
  { k: "E-G", from: "E", to: "G" },
  { k: "E-H", from: "E", to: "H" },
  { k: "F-H", from: "F", to: "H" },
  { k: "G-R", from: "G", to: "R" },
  { k: "H-R", from: "H", to: "R" },
];
const edgeByKey = Object.fromEntries(EDGES.map(e => [e.k, e]));

// 每个节点朝向 R 的出边（用于选路）
const FORWARD = {
  S_me: ["S_me-A", "S_me-B"],
  S_rival: ["S_rival-B", "S_rival-C"],
  A: ["A-D", "A-E"],
  B: ["B-E", "B-F"],
  C: ["C-E", "C-F"],
  D: ["D-G"],
  E: ["E-G", "E-H"],
  F: ["F-H"],
  G: ["G-R"],
  H: ["H-R"],
};
// 到 R 的跳数（选路用）
const DIST = { R:0, G:1, H:1, D:2, E:2, F:2, A:3, B:3, C:3, S_me:4, S_rival:4 };

// ---------- 三种方案 ----------
const MODES = {
  circuit: {
    key: "circuit",
    name: "专线传输",
    sub: "电路交换 · 全程独占",
    title: "建立一条专属线路，全程独占",
    tag: "像包下一列专列火车：先把整条线路拉通，再发车",
    verdict: "实时性最高——专线一旦打通，数据像在专属轨道上直达，延迟最低。但这条线被你独占期间，货运站的列车只能在旁边干等，线路利用率低，而且即便你不发车，通道也一直占着。",
    pros: "实时性好、延迟低",
    cons: "独占线路、利用率低",
    ordered: true,
  },
  message: {
    key: "message",
    name: "存储转发",
    sub: "报文交换 · 整件交接",
    title: "整枚火箭当一件大件，逐站交接",
    tag: "每到一站，必须等整件卸完，才发往下一站",
    verdict: "整枚火箭是一整件，每到一个中转站都要停下来等整件接收完毕，才能发往下一站——每跳都有存储转发的延时。好处是线路不必全程独占，货运站的车能在空闲时段穿插通行。",
    pros: "不必独占线路",
    cons: "逐站等待、延时长",
    ordered: true,
  },
  packet: {
    key: "packet",
    name: "分包传输",
    sub: "分组交换 · 小包并行",
    title: "火箭拆成 6 个模块，各走各的路",
    tag: "模块小、可并行、路线自由，但可能乱序到达",
    verdict: "火箭拆成 6 个小模块，每个模块自己选一条空闲线路、同时前进，利用并行最快送达；不同模块可能走不同路线、乱序到达发射场，到站后再按编号重新拼装。互联网正是用这种方式传输数据。",
    pros: "并行高效、线路利用率高",
    cons: "可能乱序、需重组",
    ordered: false,
  },
};

// ---------- DOM 引用 ----------
const $ = id => document.getElementById(id);
const views = { home: $("view-home"), board: $("view-board"), result: $("view-result"), compare: $("view-compare") };
const edgesLayer = document.getElementById("edges-layer");
const nodesLayer = document.getElementById("nodes-layer");
const tokensLayer = document.getElementById("tokens-layer");
const logEl = document.getElementById("log");
const clockEl = document.getElementById("clock");

// ---------- SVG 构建 ----------
function buildBoard() {
  edgesLayer.innerHTML = "";
  nodesLayer.innerHTML = "";
  tokensLayer.innerHTML = "";
  EDGES.forEach(e => {
    const a = NODES[e.from], b = NODES[e.to];
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
    line.setAttribute("class", "edge");
    line.setAttribute("id", "edge-" + e.k);
    edgesLayer.appendChild(line);
  });
  Object.entries(NODES).forEach(([id, n]) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "node" + (n.type ? " " + n.type : ""));
    g.setAttribute("transform", `translate(${n.x},${n.y})`);
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("class", "core");
    c.setAttribute("r", n.type === "source" || n.type === "sink" ? 20 : 14);
    g.appendChild(c);
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("y", 4);
    t.textContent = n.label;
    g.appendChild(t);
    if (n.sub) {
      const s = document.createElementNS("http://www.w3.org/2000/svg", "text");
      s.setAttribute("class", "sub");
      s.setAttribute("y", 34);
      s.textContent = n.sub;
      g.appendChild(s);
    }
    nodesLayer.appendChild(g);
  });
}

function setEdgeState(key, state) {
  const line = document.getElementById("edge-" + key);
  if (!line) return;
  line.classList.remove("busy", "locked");
  if (state === "locked") line.classList.add("locked");
  else if (state === "busy") line.classList.add("busy");
}

// ---------- 游戏状态 ----------
const SPEED = 130; // px/sec
let state = null;

function newState(modeKey) {
  return {
    mode: MODES[modeKey],
    running: false,
    paused: false,
    t: 0,
    rafId: null,
    lastTs: null,
    tokens: [],          // 所有在途车厢
    edgeBusy: {},        // edgeKey -> token
    deliveredMe: [],     // 我的模块到达顺序
    doneCount: 0,
    finished: false,
    lockPath: modeKey === "circuit" ? ["S_me-A", "A-D", "D-G", "G-R"] : [],
    spawnQueueMe: 0,     // 待发模块数
    spawnTimerMe: 0,
    rivalSchedule: [
      { at: 1.2, node: "S_rival" },
      { at: 4.0, node: "S_rival" },
      { at: 6.8, node: "S_rival" },
    ],
    rivalIdx: 0,
    peakParallel: 0,
    completeAt: null,
    targetMe: modeKey === "message" ? 1 : 6,
    awaitClick: null,      // 等待学生点选路线的 token
    circuitPicked: modeKey === "circuit" ? false : true,
  };
}

function log(msg, cls) {
  const div = document.createElement("div");
  div.innerHTML = `<span class="t">T+${state.t.toFixed(1)}s</span><span class="${cls || ""}">${msg}</span>`;
  logEl.insertBefore(div, logEl.firstChild);
  while (logEl.children.length > 40) logEl.removeChild(logEl.lastChild);
}

// ---------- Token ----------
function makeToken(opts) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "token" + (opts.big ? " token-big" : ""));
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("r", opts.big ? 13 : 8);
  c.setAttribute("fill", opts.color);
  g.appendChild(c);
  if (opts.label) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("dy", 3.5);
    t.textContent = opts.label;
    g.appendChild(t);
  }
  tokensLayer.appendChild(g);
  return {
    id: opts.id,
    who: opts.who,        // 'me' | 'rival'
    module: opts.module,  // 1..6 for me
    big: !!opts.big,
    node: opts.node,      // 当前所在节点 id
    edge: null,           // 正在走的 edge key
    from: null, to: null, // 正在走边的端点
    px: NODES[opts.node].x, py: NODES[opts.node].y,
    wait: 0,              // 存储转发停留计时
    el: g,
    delivered: false,
  };
}

// 选下一条边（分包/存储转发用贪心：挑空闲且距离短的）
function effDist(node) {
  // 专线模式下 G-R 被锁死，G 等同不可达，避免竞争列车走进死路
  if (state.mode.key === "circuit" && node === "G") return 99;
  return DIST[node];
}
function chooseEdge(token) {
  const candidates = FORWARD[token.node] || [];
  const free = candidates.filter(k =>
    !state.edgeBusy[k] && !state.lockPath.includes(k) && effDist(edgeByKey[k].to) < 90
  );
  if (free.length === 0) return null;
  // 距离优先，并列随机
  free.sort((a, b) => (effDist(edgeByKey[a].to) - effDist(edgeByKey[b].to)) || Math.random() - 0.5);
  return free[0];
}

function startEdge(token, edgeKey) {
  const e = edgeByKey[edgeKey];
  token.edge = edgeKey;
  token.from = e.from;
  token.to = e.to;
  state.edgeBusy[edgeKey] = token;
  setEdgeState(edgeKey, state.lockPath.includes(edgeKey) ? "locked" : "busy");
}

// ---------- 主循环 ----------
function frame(ts) {
  if (!state || !state.running || state.paused) return;
  if (state.lastTs == null) state.lastTs = ts;
  const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
  state.lastTs = ts;

  state.t += dt;
  clockEl.textContent = "T+ " + state.t.toFixed(1) + "s";

  // 生成竞争列车
  while (state.rivalIdx < state.rivalSchedule.length && state.t >= state.rivalSchedule[state.rivalIdx].at) {
    const s = state.rivalSchedule[state.rivalIdx++];
    const tok = makeToken({ id: "rv" + state.rivalIdx, who: "rival", node: s.node, color: "#60a5fa" });
    state.tokens.push(tok);
    log("货运站发出一列竞争列车", "ev-rival");
  }

  // 生成我的车厢
  if (state.mode.key === "circuit") {
    // 建链后依次发 6 节
    if (state.lockPath.length && state.spawnQueueMe < 6) {
      state.spawnTimerMe -= dt;
      if (state.spawnTimerMe <= 0) {
        spawnMePacket();
        state.spawnTimerMe = 0.45;
      }
    }
  } else if (state.mode.key === "message") {
    if (state.spawnQueueMe === 0 && !state.tokens.some(t => t.who === "me")) {
      spawnMeBig();
      state.spawnQueueMe = 1;
    }
  } else { // packet
    if (state.spawnQueueMe < 6) {
      state.spawnTimerMe -= dt;
      if (state.spawnTimerMe <= 0) {
        spawnMePacket();
        state.spawnTimerMe = 0.5;
      }
    }
  }

  // 更新每个 token
  let onRoad = 0;
  state.tokens.forEach(tok => {
    if (tok.delivered) return;
    if (tok.edge) {
      // 正在走边
      onRoad++;
      const a = NODES[tok.from], b = NODES[tok.to];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      tok.px += (dx / dist) * SPEED * dt;
      tok.py += (dy / dist) * SPEED * dt;
      // 到达节点
      const remain = Math.hypot(b.x - tok.px, b.y - tok.py);
      if (remain < SPEED * dt) {
        tok.px = b.x; tok.py = b.y;
        // 释放边
        const finishedEdge = tok.edge;
        state.edgeBusy[finishedEdge] = null;
        setEdgeState(finishedEdge, state.lockPath.includes(finishedEdge) ? "locked" : (isEdgeUsed(finishedEdge) ? "busy" : "idle"));
        tok.edge = null;
        tok.node = tok.to;
        tok.from = tok.to = null;

        if (tok.node === "R") {
          deliverToken(tok);
        } else if (state.mode.key === "message" && tok.who === "me") {
          tok.wait = 2.2; // 存储转发停留
          log(`整件抵达 ${tok.node}，等待接收完整件…`, "ev-me");
        }
      }
    } else {
      // 停在节点上，决定下一步
      if (tok.wait > 0) {
        tok.wait -= dt;
        if (tok.wait <= 0 && tok.node !== "R") {
          log(`整件校验完毕，停在 ${tok.node}，请决定下一站`, "ev-me");
          routeTick(tok);
        }
      } else if (tok.node !== "R") {
        routeTick(tok);
      }
    }
    // 渲染位置
    tok.el.setAttribute("transform", `translate(${tok.px},${tok.py})`);
  });

  state.peakParallel = Math.max(state.peakParallel, onRoad);
  $("stat-parallel").textContent = state.peakParallel;
  $("stat-done").textContent = state.doneCount + "/" + state.targetMe;
  $("stat-time").textContent = state.t.toFixed(1);

  // 完成判定
  if (!state.finished && state.doneCount >= state.targetMe) {
    state.finished = true;
    state.completeAt = state.t;
    finishRun();
  }

  state.rafId = requestAnimationFrame(frame);
}

function isEdgeUsed(key) {
  return !!state.edgeBusy[key];
}

// 停在节点上的 token：决定自动走、等待、还是请学生点选
function routeTick(tok) {
  // 专线模式：我的车厢沿锁定路径自动跟随
  if (state.mode.key === "circuit" && tok.who === "me") {
    const next = state.lockPath.find(k => edgeByKey[k].from === tok.node);
    if (next && !state.edgeBusy[next]) startEdge(tok, next);
    return;
  }
  // 非我的 token（货运站列车）自动选路
  if (tok.who !== "me") {
    const next = chooseEdge(tok);
    if (next) startEdge(tok, next);
    return;
  }
  // 我的模块/整件：由学生决策
  const opts = (FORWARD[tok.node] || []).filter(k =>
    !state.edgeBusy[k] && !state.lockPath.includes(k) && effDist(edgeByKey[k].to) < 90
  );
  if (opts.length === 0) { clearAwait(); return; } // 拥堵，等下帧
  if (opts.length === 1) { clearAwait(); startEdge(tok, opts[0]); return; }
  setAwait(tok, opts); // 多个选择，亮线等学生点
}

function setAwait(tok, opts) {
  const cur = state.awaitClick;
  if (!cur || cur.tok !== tok) {
    log(`模块${tok.module} 到达 ${tok.node}，请点亮一条线路`, "ev-me");
  }
  state.awaitClick = { tok, opts };
  document.querySelectorAll(".edge.pickme").forEach(el => el.classList.remove("pickme"));
  opts.forEach(k => document.getElementById("edge-" + k)?.classList.add("pickme"));
  const nodeG = nodesLayer.querySelector(`[transform="translate(${NODES[tok.node].x},${NODES[tok.node].y})"]`);
  nodeG?.classList.add("awaiting");
}
function clearAwait() {
  if (!state.awaitClick) return;
  document.querySelectorAll(".edge.pickme").forEach(el => el.classList.remove("pickme"));
  nodesLayer.querySelectorAll(".node.awaiting").forEach(el => el.classList.remove("awaiting"));
  state.awaitClick = null;
}

function spawnMePacket() {
  const mod = state.spawnQueueMe + 1;
  state.spawnQueueMe++;
  const tok = makeToken({ id: "m" + mod, who: "me", module: mod, node: "S_me", color: "#ff7a45", label: mod });
  state.tokens.push(tok);
  log(`火箭模块 ${mod} 从工厂发车`, "ev-me");
}
function spawnMeBig() {
  const tok = makeToken({ id: "mbig", who: "me", module: 1, node: "S_me", color: "#ff7a45", label: "整箭", big: true });
  state.tokens.push(tok);
  log("整枚火箭作为一整件开始发运", "ev-me");
}

function deliverToken(tok) {
  tok.delivered = true;
  tok.el.remove();
  if (tok.who === "me") {
    state.deliveredMe.push(tok.module);
    state.doneCount++;
    log(`模块 ${tok.module} 抵达发射场`, "ev-me");
    updateReassemble();
  } else {
    log("一列竞争列车抵达终点", "ev-rival");
  }
}

// ---------- 接收台 ----------
function renderReassemble() {
  const box = $("reassemble-slots");
  box.innerHTML = "";
  const n = state.targetMe;
  for (let i = 1; i <= n; i++) {
    const s = document.createElement("div");
    s.className = "slot";
    s.id = "slot-" + i;
    s.textContent = n === 1 ? "箭" : "?";
    box.appendChild(s);
  }
}
function updateReassemble() {
  // 按到达顺序显示
  state.deliveredMe.forEach((mod, idx) => {
    const s = document.getElementById("slot-" + (idx + 1));
    if (s) { s.textContent = mod; s.classList.add("filled"); if (mod !== idx + 1) s.classList.add("bad"); }
  });
}

// ---------- 流程控制 ----------
let completedModes = {}; // key -> stats

function startMode(modeKey) {
  state = newState(modeKey);
  buildBoard();
  renderReassemble();
  logEl.innerHTML = "";
  const m = MODES[modeKey];
  $("board-mode-tag").textContent = m.name + " · " + m.sub;
  $("board-title").textContent = m.title;
  $("stat-time").textContent = "0.0";
  $("stat-parallel").textContent = "0";
  $("stat-done").textContent = "0/" + state.targetMe;
  showView("board");

  const picker = $("route-picker");
  const runBtn = $("btn-run");

  if (modeKey === "circuit") {
    // 让学生先选独占哪条专线
    state.lockPath = [];
    picker.style.display = "flex";
    runBtn.disabled = true;
    runBtn.style.opacity = .5;
    const opts = $("route-opts");
    opts.innerHTML = "";
    const paths = [
      { name: "北线 A-D-G", edges: ["S_me-A", "A-D", "D-G", "G-R"] },
      { name: "南线 B-E-H", edges: ["S_me-B", "B-E", "E-H", "H-R"] },
    ];
    paths.forEach(p => {
      const b = document.createElement("button");
      b.className = "route-opt";
      b.textContent = p.name;
      b.addEventListener("click", () => {
        state.lockPath = p.edges;
        state.circuitPicked = true;
        p.edges.forEach(k => setEdgeState(k, "locked"));
        opts.querySelectorAll(".route-opt").forEach(x => x.classList.remove("sel"));
        b.classList.add("sel");
        log(`你已选定专线：${p.name}，整条线路被独占`, "ev-sys");
        runBtn.disabled = false;
        runBtn.style.opacity = 1;
        state.spawnTimerMe = 0.4;
      });
      opts.appendChild(b);
    });
  } else {
    picker.style.display = "none";
    runBtn.disabled = false;
    runBtn.style.opacity = 1;
    if (modeKey === "message") {
      log("整枚火箭即将作为一整件发运；到达每个岔口，请你点一条空闲线路", "ev-sys");
      state.spawnTimerMe = 0.8;
    } else {
      log("火箭拆成 6 个模块；每个模块到岔口都会停下，等你点一条线路再走", "ev-sys");
      state.spawnTimerMe = 0.5;
    }
  }
}

function beginRun() {
  if (!state || state.running) return;
  state.running = true;
  state.paused = false;
  state.lastTs = null;
  $("btn-pause").textContent = "暂停";
  state.rafId = requestAnimationFrame(frame);
}
function togglePause() {
  if (!state || !state.running) return;
  state.paused = !state.paused;
  $("btn-pause").textContent = state.paused ? "继续" : "暂停";
  if (!state.paused) { state.lastTs = null; state.rafId = requestAnimationFrame(frame); }
}

function finishRun() {
  cancelAnimationFrame(state.rafId);
  state.running = false;
  const elapsed = state.completeAt;
  const ordered = state.mode.key === "packet"
    ? state.deliveredMe.join(",") === "1,2,3,4,5,6"
    : true;
  const stats = {
    time: elapsed,
    parallel: state.peakParallel,
    order: state.deliveredMe.slice(),
    ordered,
  };
  completedModes[state.mode.key] = stats;
  showResult(stats);
}

function starRating(modeKey, t) {
  const ref = { circuit: [7, 9], message: [13, 17], packet: [9, 13] }[modeKey];
  return t <= ref[0] ? 3 : t <= ref[1] ? 2 : 1;
}
function showResult(stats) {
  const m = state.mode;
  $("result-mode-tag").textContent = m.name;
  $("result-title").textContent = m.title;
  const stars = starRating(m.key, stats.time);
  let orderTxt;
  if (m.key === "message") orderTxt = "整箭一次送达";
  else if (stats.ordered) orderTxt = "按 1→6 顺序到达";
  else orderTxt = "乱序到达：" + stats.order.join(" → ");
  $("result-stats").innerHTML = `
    <div class="rstat"><div class="v">${stats.time.toFixed(1)}s</div><div class="k">总用时</div></div>
    <div class="rstat"><div class="v"><span class="score-stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span></div><div class="k">调度评分</div></div>
    <div class="rstat"><div class="v" style="font-size:15px">${orderTxt}</div><div class="k">到达顺序</div></div>
  `;
  $("result-verdict").innerHTML = `<b>决策小结：</b>${m.verdict}`;
  showView("result");
}

function showCompare() {
  const body = document.querySelector("#compare-table tbody");
  body.innerHTML = "";
  const rows = ["circuit", "message", "packet"].map(k => {
    const s = completedModes[k];
    if (!s) return null;
    const m = MODES[k];
    const realtime = k === "circuit" ? "极高" : k === "message" ? "低" : "较高";
    const util = k === "circuit" ? "低（独占）" : k === "message" ? "中" : "高（并行）";
    return { k, s, m, realtime, util };
  }).filter(Boolean);
  const best = rows.reduce((a, b) => (b.s.time < a.s.time ? b : a), rows[0]);
  rows.forEach(r => {
    const tr = document.createElement("tr");
    if (r.k === best.k) tr.className = "best";
    tr.innerHTML = `<td>${r.m.name}</td>
      <td>${r.s.time.toFixed(1)}s</td>
      <td>${r.realtime}</td>
      <td>${r.util}</td>
      <td>${r.s.ordered ? "否" : "是"}</td>
      <td>${r.m.cons}</td>`;
    body.appendChild(tr);
  });
  $("conclusion").innerHTML = `
    <b>结论：</b>互联网传输实际采用的是第三种「分包（分组交换）」——把数据拆成许多小“包”，
    每个包独立选路、并行传输，既能利用多条线路同时跑、又能自动绕开拥堵；
    即使到达顺序乱了，接收端再按编号重新拼装即可。<br>
    专线实时但浪费、存储转发可靠但慢——分包在效率与健壮性之间取得了最好的平衡。`;
  showView("compare");
}

// ---------- 视图切换 ----------
function showView(name) {
  Object.values(views).forEach(v => v.classList.add("hidden"));
  views[name].classList.remove("hidden");
}

// ---------- 模式卡片 ----------
function renderModeCards() {
  const wrap = $("mode-cards");
  wrap.innerHTML = "";
  Object.values(MODES).forEach(m => {
    const card = document.createElement("div");
    card.className = "mode-card";
    const done = completedModes[m.key];
    card.innerHTML = `
      <span class="mc-tag ${done ? "done" : ""}">${done ? "已试玩" : "待体验"}</span>
      <div class="mc-icon">${m.key === "circuit" ? "▮▮" : m.key === "message" ? "▣" : "❘❘❘"}</div>
      <h3>${m.name}</h3>
      <div class="mc-sub">${m.sub}</div>
      <p>${m.tag}</p>
    `;
    card.addEventListener("click", () => startMode(m.key));
    wrap.appendChild(card);
  });
}

// ---------- 事件绑定 ----------
// 学生点击线路，手动给等待中的模块选路
edgesLayer.addEventListener("click", (e) => {
  const line = e.target.closest("line.edge");
  if (!line || !state || !state.awaitClick) return;
  const key = line.id.replace("edge-", "");
  const { tok, opts } = state.awaitClick;
  if (opts.includes(key) && !state.edgeBusy[key]) {
    log(`你为模块${tok.module} 选择 ${tok.node} → ${edgeByKey[key].to}`, "ev-me");
    clearAwait();
    startEdge(tok, key);
  }
});
$("btn-run").addEventListener("click", beginRun);
$("btn-pause").addEventListener("click", togglePause);
$("btn-home").addEventListener("click", () => {
  if (state && state.rafId) cancelAnimationFrame(state.rafId);
  renderModeCards();
  showView("home");
});
$("btn-retry").addEventListener("click", () => startMode(state.mode.key));
$("btn-next-mode").addEventListener("click", () => {
  const keys = ["circuit", "message", "packet"];
  const next = keys.find(k => !completedModes[k]);
  if (next) startMode(next);
  else showCompare();
});
$("btn-restart").addEventListener("click", () => {
  completedModes = {};
  renderModeCards();
  showView("home");
});

// 切后台自动暂停
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state && state.running && !state.paused) togglePause();
});

// 初始
buildBoard();
renderModeCards();
