// 生存模式組隊（測試版）
// 目標：
// - 僅在生存模式流程中啟用（不影響其他模式）
// - 使用 Firebase（匿名登入 + Firestore）做 signaling / 房間大廳
// - 使用 WebRTC DataChannel 且強制 relay-only（避免玩家互相看到 IP）
// - 初版僅提供：房間/大廳 + 進入遊戲後的「多人位置顯示」（不做完整共同世界同步）
//
// 安全/隱私備註：
// - apiKey 不是密碼，可公開；但 Firestore 規則與匿名登入必須正確設定以避免被濫用。
// - relay-only 需要 TURN；此處使用 Open Relay Project（公共 TURN），不保證穩定。
//
// 維護備註：
// - 不修改 SaveCode/localStorage 結構，不新增任何會進入引繼碼的存檔欄位。

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// 你的 Firebase Web 設定（由使用者提供）
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCjAVvO_zSTy6XYzPPibioDpvmBZTlW-s4",
  authDomain: "github-e71d1.firebaseapp.com",
  projectId: "github-e71d1",
  storageBucket: "github-e71d1.firebasestorage.app",
  messagingSenderId: "513407424654",
  appId: "1:513407424654:web:95d3246d5afeb6dccd11df",
};

// Open Relay Project（公共 TURN）
// 常見配置（由 openrelay.metered.ca 提供）；此為公共資源，可能變動/限流。
const ICE_SERVERS_OPEN_RELAY = [
  {
    urls: [
      "stun:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

const MAX_PLAYERS = 5;
const ROOM_TTL_MS = 1000 * 60 * 60; // 1小時（僅用於前端清理提示；真正清理由規則/人為）
const MEMBER_HEARTBEAT_MS = 15000; // 15s：更新 lastSeenAt（避免關頁/斷線殘留）
const MEMBER_STALE_MS = 45000; // 45s：超過視為離線/殘留
const START_COUNTDOWN_MS = 3000; // M1：開始倒數（收到 starting 後倒數）

let _app = null;
let _auth = null;
let _db = null;
let _uid = null;

// 房間狀態
let _activeRoomId = null;
let _activeRoomUnsub = null;
let _membersUnsub = null;
let _signalsUnsub = null;
let _isHost = false;
let _hostUid = null;
let _roomState = null;
let _membersState = new Map();
let _memberHeartbeatTimer = null;
let _startTimer = null;
let _startSessionId = null;

// WebRTC
let _pc = null; // 初版：client 只連 host；host 對每個 client 建一條 pc（下方用 map）
let _pcsHost = new Map(); // host: remoteUid -> { pc, channel }
let _dc = null; // client: datachannel

// M2：室長端遠程玩家管理（根據輸入更新位置）
const RemotePlayerManager = (() => {
  const remotePlayers = new Map(); // uid -> RemotePlayer

  // 簡化的遠程玩家類（只處理移動和位置）
  class RemotePlayer {
    constructor(uid, startX, startY) {
      this.uid = uid;
      this.x = startX || 0;
      this.y = startY || 0;
      this.speed = (typeof CONFIG !== "undefined" && CONFIG.PLAYER && typeof CONFIG.PLAYER.SPEED === "number") 
        ? CONFIG.PLAYER.SPEED 
        : 200; // 預設速度
      this.lastInputTime = Date.now();
      this.currentInput = { mx: 0, my: 0 }; // 當前輸入方向
      this.facingRight = true;
      this.facingAngle = 0;
    }

    update(deltaTime) {
      const deltaMul = deltaTime / 16.67; // 正規化到 60FPS
      const now = Date.now();
      
      // 如果超過 500ms 沒有收到輸入，停止移動（避免斷線殘留）
      if (now - this.lastInputTime > 500) {
        this.currentInput = { mx: 0, my: 0 };
      }

      // 根據輸入移動
      const dx = this.currentInput.mx * this.speed * deltaMul;
      const dy = this.currentInput.my * this.speed * deltaMul;

      // 嘗試移動（需要檢查障礙物和邊界）
      const newX = this.x + dx;
      const newY = this.y + dy;

      // 檢查障礙物碰撞（與本地玩家相同的邏輯）
      let canMoveX = true;
      let canMoveY = true;
      try {
        if (typeof Game !== "undefined" && Array.isArray(Game.obstacles)) {
          const collisionRadius = (typeof CONFIG !== "undefined" && CONFIG.PLAYER && typeof CONFIG.PLAYER.COLLISION_RADIUS === "number")
            ? CONFIG.PLAYER.COLLISION_RADIUS
            : 20;
          for (const obs of Game.obstacles) {
            if (typeof Utils !== "undefined" && typeof Utils.circleRectCollision === "function") {
              if (Utils.circleRectCollision(newX, this.y, collisionRadius, obs.x, obs.y, obs.width, obs.height)) {
                canMoveX = false;
              }
              if (Utils.circleRectCollision(this.x, newY, collisionRadius, obs.x, obs.y, obs.width, obs.height)) {
                canMoveY = false;
              }
            }
          }
        }
      } catch (_) {}

        // 應用移動
        if (canMoveX) this.x = newX;
        if (canMoveY) this.y = newY;

        // 限制在世界範圍內
        try {
          if (typeof Game !== "undefined") {
            const worldW = Game.worldWidth || 3840;
            const worldH = Game.worldHeight || 2160;
            const margin = (typeof CONFIG !== "undefined" && CONFIG.PLAYER && typeof CONFIG.PLAYER.BORDER_MARGIN === "number")
              ? CONFIG.PLAYER.BORDER_MARGIN
              : 0;
            const size = (typeof CONFIG !== "undefined" && CONFIG.PLAYER && typeof CONFIG.PLAYER.SIZE === "number")
              ? CONFIG.PLAYER.SIZE
              : 40;
            const minX = size / 2 + margin;
            const maxX = worldW - size / 2 - margin;
            const minY = size / 2 + margin;
            const maxY = worldH - size / 2 - margin;
            this.x = Math.max(minX, Math.min(maxX, this.x));
            this.y = Math.max(minY, Math.min(maxY, this.y));
          }
        } catch (_) {}

        // 更新朝向
        if (this.currentInput.mx !== 0 || this.currentInput.my !== 0) {
          this.facingAngle = Math.atan2(this.currentInput.my, this.currentInput.mx);
          if (Math.abs(this.currentInput.mx) > 0.1) {
            this.facingRight = this.currentInput.mx > 0;
          }
        }
    }

    applyInput(mx, my) {
      this.currentInput = { mx: mx || 0, my: my || 0 };
      this.lastInputTime = Date.now();
    }

    getState() {
      return {
        x: this.x,
        y: this.y,
        facingRight: this.facingRight,
        facingAngle: this.facingAngle
      };
    }
  }

    function getOrCreate(uid, startX, startY) {
      if (!remotePlayers.has(uid)) {
        remotePlayers.set(uid, new RemotePlayer(uid, startX, startY));
      }
      return remotePlayers.get(uid);
    }

    function remove(uid) {
      remotePlayers.delete(uid);
    }

    function updateAll(deltaTime) {
      for (const player of remotePlayers.values()) {
        player.update(deltaTime);
      }
    }

    function getAllStates() {
      const states = {};
      for (const [uid, player] of remotePlayers.entries()) {
        states[uid] = player.getState();
      }
      return states;
    }

    function clear() {
      remotePlayers.clear();
    }

    return {
      getOrCreate,
      remove,
      updateAll,
      getAllStates,
      clear
    };
  })();

// In-game presence
const Runtime = (() => {
  let enabled = false;
  let lastSendAt = 0;
  let lastInputAt = 0;
  const remotePlayers = new Map(); // uid -> { x, y, name, updatedAt }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) remotePlayers.clear();
  }

  function onStateMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.t !== "state") return;
    const now = Date.now();
    const players = payload.players || {};
    for (const [uid, p] of Object.entries(players)) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      if (_uid && uid === _uid) continue; // 不覆蓋自己
      remotePlayers.set(uid, {
        x: p.x,
        y: p.y,
        name: typeof p.name === "string" ? p.name : uid.slice(0, 6),
        updatedAt: now,
      });
    }
    // 清掉過期（避免斷線殘留）
    for (const [uid, p] of remotePlayers) {
      if (now - (p.updatedAt || 0) > 8000) remotePlayers.delete(uid);
    }
  }

  // M2：處理事件（客戶端接收室長廣播的事件）
  function onEventMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.t !== "event") return;
    const eventType = payload.type;
    const eventData = payload.data || {};
    
    try {
      // 根據事件類型執行輕量模擬
      if (eventType === "wave_start") {
        // 波次開始
        if (typeof WaveSystem !== "undefined" && WaveSystem.currentWave !== undefined) {
          WaveSystem.currentWave = eventData.wave || 1;
          WaveSystem.waveStartTime = payload.timestamp || Date.now();
          if (typeof UI !== "undefined" && UI.updateWaveInfo) {
            UI.updateWaveInfo(WaveSystem.currentWave);
          }
        }
      } else if (eventType === "enemy_spawn") {
        // 敵人生成（客戶端只做渲染，不影響遊戲邏輯）
        // 注意：客戶端不應該真正生成敵人，只是記錄用於視覺效果
        // 實際的敵人生成和戰鬥邏輯由室長處理
      } else if (eventType === "boss_spawn") {
        // BOSS 生成
        if (typeof Game !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
          // 客戶端可以顯示 BOSS 出現特效，但實際 BOSS 對象由室長管理
        }
      } else if (eventType === "exp_orb_spawn") {
        // 經驗球生成（客戶端可以顯示，但不影響遊戲邏輯）
      } else if (eventType === "chest_spawn") {
        // 寶箱生成（客戶端可以顯示，但不影響遊戲邏輯）
      }
    } catch (e) {
      console.warn("[SurvivalOnline] M2 事件處理失敗:", e);
    }
  }

  function collectLocalState(game) {
    try {
      const player = game && game.player ? game.player : null;
      if (!player) return null;
      return { x: player.x, y: player.y };
    } catch (_) {
      return null;
    }
  }

  function tick(game, deltaTime) {
    if (!enabled) return;
    const now = Date.now();
    if (now - lastSendAt < 100) return; // 10Hz
    lastSendAt = now;
    const st = collectLocalState(game);
    if (!st) return;
    sendToNet({ t: "pos", x: st.x, y: st.y });

    // M1：基礎輸入通道（先建立格式；M2 才會由室長權威真正套用）
    try {
      if (now - lastInputAt >= 100) {
        lastInputAt = now;
        let dir = null;
        try {
          if (typeof Input !== "undefined" && Input.getMovementDirection) {
            dir = Input.getMovementDirection();
          }
        } catch (_) {}
        const mx = dir && typeof dir.x === "number" ? dir.x : 0;
        const my = dir && typeof dir.y === "number" ? dir.y : 0;
        sendToNet({ t: "input", mx, my, at: now });
      }
    } catch (_) {}
  }

  function getRemotePlayers() {
    return Array.from(remotePlayers.entries()).map(([uid, p]) => ({ uid, ...p }));
  }

  // M2：更新遠程玩家（僅室長端調用）
  function updateRemotePlayers(deltaTime) {
    if (!_isHost) return;
    try {
      RemotePlayerManager.updateAll(deltaTime);
      // 定期廣播遠程玩家位置（10Hz）
      const now = Date.now();
      if (now - lastSendAt >= 100) {
        lastSendAt = now;
        const remoteStates = RemotePlayerManager.getAllStates();
        const players = {};
        // 加上 host 自己
        try {
          if (typeof Game !== "undefined" && Game.player) {
            players[_uid] = { x: Game.player.x, y: Game.player.y, name: `玩家-${_uid.slice(0, 4)}` };
          }
        } catch (_) {}
        // 加上所有遠程玩家
        for (const [uid, state] of Object.entries(remoteStates)) {
          const member = _membersState ? _membersState.get(uid) : null;
          const name = (member && typeof member.name === "string") ? member.name : uid.slice(0, 6);
          players[uid] = { x: state.x, y: state.y, name };
        }
        // 廣播給所有 client
        for (const [uid, it] of _pcsHost.entries()) {
          const ch = (it && it.channel) ? it.channel : null;
          _sendToChannel(ch, { t: "state", players });
        }
      }
    } catch (_) {}
  }

  // M2：清理遠程玩家（僅室長端調用）
  function clearRemotePlayers() {
    if (!_isHost) return;
    try {
      RemotePlayerManager.clear();
    } catch (_) {}
  }

  // M2：廣播事件（僅室長端調用）
  function broadcastEventFromRuntime(eventType, eventData) {
    if (!_isHost) return;
    try {
      // 調用全局 broadcastEvent 函數
      if (typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
        window.SurvivalOnlineBroadcastEvent(eventType, eventData);
      }
    } catch (_) {}
  }

  return { setEnabled, onStateMessage, onEventMessage, tick, getRemotePlayers, updateRemotePlayers, clearRemotePlayers, broadcastEvent: broadcastEventFromRuntime };
})();

// M2：全局事件廣播函數（供其他模組調用）
window.SurvivalOnlineBroadcastEvent = function(eventType, eventData) {
  if (typeof broadcastEvent === "function") {
    broadcastEvent(eventType, eventData);
  }
};

function _qs(id) {
  return document.getElementById(id);
}
function _show(id) {
  const el = _qs(id);
  if (el) el.classList.remove("hidden");
}
function _hide(id) {
  const el = _qs(id);
  if (el) el.classList.add("hidden");
}
function _setText(id, text) {
  const el = _qs(id);
  if (el) el.textContent = text;
}

function _nowIso() {
  try {
    return new Date().toISOString();
  } catch (_) {
    return "" + Date.now();
  }
}

function _randRoomCode(len = 7) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆字
  let s = "";
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

function _randSessionId() {
  // 短 session id（不涉存檔）
  return (Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36)).toUpperCase();
}

function _candidateIsRelay(cand) {
  try {
    const c = cand && cand.candidate ? cand.candidate : "";
    // 某些瀏覽器候選字串格式略不同，做寬鬆判斷（仍僅接受 relay）
    return typeof c === "string" && (c.includes(" typ relay ") || c.includes(" typ relay"));
  } catch (_) {
    return false;
  }
}

async function ensureFirebase() {
  if (_app && _auth && _db) return;
  _app = initializeApp(FIREBASE_CONFIG);
  _auth = getAuth(_app);
  _db = getFirestore(_app);
}

async function ensureAuth() {
  await ensureFirebase();
  if (_uid) return _uid;
  // 等待 auth ready
  await new Promise((resolve) => {
    const unsub = onAuthStateChanged(_auth, (user) => {
      if (user) {
        _uid = user.uid;
        try { unsub(); } catch (_) {}
        resolve();
      }
    });
    // 若還沒登入，先匿名登入
    signInAnonymously(_auth).catch((e) => {
      // 常見原因：Authorized domains 沒加入、或瀏覽器阻擋第三方 cookie/存儲
      try { console.warn("[SurvivalOnline] signInAnonymously failed:", e); } catch (_) {}
    });
  });
  return _uid;
}

function roomDocRef(roomId) {
  return doc(_db, "rooms", roomId);
}
function memberDocRef(roomId, uid) {
  return doc(_db, "rooms", roomId, "members", uid);
}
function signalsColRef(roomId) {
  return collection(_db, "rooms", roomId, "signals");
}

async function createRoom(initial) {
  await ensureAuth();
  if (!_uid) throw new Error("匿名登入失敗（request.auth 為空），請確認 Firebase Auth 匿名已啟用且 Authorized domains 已加入 yiyuss.github.io");
  // 重要：不要在 create 前用 getDoc 探測 roomId（會被嚴格 Rules 擋掉，導致 permission-denied）
  // 改為「直接嘗試建立」，並在 Rules 端用 !exists(roomPath(roomId)) 防止覆寫既有房間。
  let roomId = null;
  let lastErr = null;
  for (let i = 0; i < 8; i++) {
    const code = _randRoomCode(7);
    const createdAt = serverTimestamp();
    const mapId = initial && initial.mapId ? initial.mapId : (typeof Game !== "undefined" && Game.selectedMap ? Game.selectedMap.id : "city");
    const diffId = initial && initial.diffId ? initial.diffId : (typeof Game !== "undefined" && Game.selectedDifficultyId ? Game.selectedDifficultyId : "EASY");
    try {
      await setDoc(roomDocRef(code), {
        v: 1,
        hostUid: _uid,
        status: "lobby",
        createdAt,
        updatedAt: createdAt,
        mapId,
        diffId,
        maxPlayers: MAX_PLAYERS,
      });
      // 成功建立 room
      roomId = code;
      // 建立室長 member（建立後才算 member，之後才有 read 權限）
      await setDoc(memberDocRef(roomId, _uid), {
        uid: _uid,
        role: "host",
        ready: false,
        joinedAt: createdAt,
        lastSeenAt: createdAt,
        name: `玩家-${_uid.slice(0, 4)}`,
        characterId: (typeof Game !== "undefined" && Game.selectedCharacter && Game.selectedCharacter.id) ? Game.selectedCharacter.id : null,
      });
      return { roomId, hostUid: _uid, mapId, diffId };
    } catch (e) {
      lastErr = e;
      // 若 Rules 有加「!exists(roomPath(roomId))」，房間碼撞到會 permission-denied（視同碰撞重試）
      const codeStr = e && e.code ? String(e.code) : "";
      if (codeStr.includes("permission-denied")) {
        continue;
      }
      break;
    }
  }
  // 走到這裡代表仍失敗
  if (lastErr) {
    const c = lastErr && lastErr.code ? String(lastErr.code) : "";
    const msg = lastErr && lastErr.message ? String(lastErr.message) : "unknown";
    throw new Error(`建立失敗：${msg}${c ? ` [${c}]` : ""}`);
  }
  throw new Error("無法建立房間（請重試）");

}

async function joinRoom(roomId) {
  await ensureAuth();
  if (!_uid) throw new Error("匿名登入失敗（request.auth 為空），請確認 Firebase Auth 匿名已啟用且 Authorized domains 已加入 yiyuss.github.io");

  // 重要：不要在加入前讀取 room（嚴格 Rules 下非成員無 read 權限）
  // 改成直接寫入 members；Rules 會檢查 room 是否存在且 status 是否為 lobby。
  try {
    await setDoc(memberDocRef(roomId, _uid), {
      uid: _uid,
      role: "guest",
      ready: false,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      name: `玩家-${_uid.slice(0, 4)}`,
      characterId: (typeof Game !== "undefined" && Game.selectedCharacter && Game.selectedCharacter.id) ? Game.selectedCharacter.id : null,
    });
  } catch (e) {
    const c = e && e.code ? String(e.code) : "";
    const msg = e && e.message ? String(e.message) : "unknown";
    // 通常代表：房間不存在 / 已開始 / 已關閉 / 沒有權限
    throw new Error(`加入失敗：房間不存在或已開始/已關閉（${msg}${c ? ` [${c}]` : ""}）`);
  }

  // 成為 member 後，再讀 room 取得 host/map/diff（此時 read 應該允許）
  let data = null;
  for (let i = 0; i < 3; i++) {
    try {
      const snap = await getDoc(roomDocRef(roomId));
      if (snap.exists()) {
        data = snap.data() || {};
        break;
      }
    } catch (_) {}
    // 小延遲避免剛寫入 member 後規則判定尚未就緒
    await new Promise((r) => setTimeout(r, 120));
  }
  const hostUid = data && data.hostUid ? data.hostUid : null;
  return { roomId, hostUid, mapId: data ? data.mapId : null, diffId: data ? data.diffId : null };
}

async function leaveRoom() {
  try {
    if (_activeRoomUnsub) { try { _activeRoomUnsub(); } catch (_) {} }
    if (_membersUnsub) { try { _membersUnsub(); } catch (_) {} }
    if (_signalsUnsub) { try { _signalsUnsub(); } catch (_) {} }
  } finally {
    _activeRoomUnsub = null;
    _membersUnsub = null;
    _signalsUnsub = null;
  }

  // M2：清理遠程玩家
  try {
    if (typeof RemotePlayerManager !== "undefined" && RemotePlayerManager.clear) {
      RemotePlayerManager.clear();
    }
  } catch (_) {}

  // 關閉連線
  try { if (_dc) _dc.close(); } catch (_) {}
  _dc = null;
  try { if (_pc) _pc.close(); } catch (_) {}
  _pc = null;
  for (const { pc, channel } of _pcsHost.values()) {
    try { if (channel) channel.close(); } catch (_) {}
    try { if (pc) pc.close(); } catch (_) {}
  }
  _pcsHost.clear();

  Runtime.setEnabled(false);

  // 移除成員
  try {
    if (_activeRoomId && _uid) {
      await deleteDoc(memberDocRef(_activeRoomId, _uid));
    }
  } catch (_) {}

  // 若我是室長：嘗試關房（無後端下無法保證；規則允許就關）
  try {
    if (_isHost && _activeRoomId) {
      await updateDoc(roomDocRef(_activeRoomId), { status: "closed", updatedAt: serverTimestamp() });
    }
  } catch (_) {}

  _activeRoomId = null;
  _isHost = false;
  _hostUid = null;
  _roomState = null;
  _membersState = new Map();

  // 停止心跳
  try { if (_memberHeartbeatTimer) clearInterval(_memberHeartbeatTimer); } catch (_) {}
  _memberHeartbeatTimer = null;

  // 停止開局倒數（避免離開後誤觸發進入遊戲）
  try { if (_startTimer) clearTimeout(_startTimer); } catch (_) {}
  _startTimer = null;
  _startSessionId = null;
}

async function setReady(ready) {
  if (!_activeRoomId) return;
  await ensureAuth();
  await updateDoc(memberDocRef(_activeRoomId, _uid), { ready: !!ready, lastSeenAt: serverTimestamp() });
}

function _startMemberHeartbeat() {
  try { if (_memberHeartbeatTimer) clearInterval(_memberHeartbeatTimer); } catch (_) {}
  _memberHeartbeatTimer = null;
  if (!_activeRoomId) return;
  _memberHeartbeatTimer = setInterval(async () => {
    try {
      if (!_activeRoomId || !_uid) return;
      // 只更新自己的 lastSeenAt（不影響 SaveCode/localStorage）
      await updateDoc(memberDocRef(_activeRoomId, _uid), { lastSeenAt: serverTimestamp() });
    } catch (_) {
      // 心跳失敗不致命（可能是離線、權限、或暫時限流）
    }
  }, MEMBER_HEARTBEAT_MS);
}

function _isMemberStale(member) {
  // lastSeenAt 可能是 Timestamp 或 serverTimestamp 未落地（null）
  try {
    if (!member) return true;
    const t = member.lastSeenAt;
    let ms = 0;
    if (t && typeof t.toMillis === "function") ms = t.toMillis();
    else if (typeof t === "number") ms = t;
    if (!ms) return false; // 沒資料時先不要判 stale（避免剛加入立即被判離線）
    return (Date.now() - ms) > MEMBER_STALE_MS;
  } catch (_) {
    return false;
  }
}

function _joinedAtMs(member) {
  try {
    const t = member && member.joinedAt ? member.joinedAt : null;
    if (t && typeof t.toMillis === "function") return t.toMillis();
    if (typeof t === "number") return t;
  } catch (_) {}
  return 0;
}

async function hostUpdateSettings({ mapId, diffId }) {
  if (!_activeRoomId || !_isHost) return;
  const patch = { updatedAt: serverTimestamp() };
  if (mapId) patch.mapId = mapId;
  if (diffId) patch.diffId = diffId;
  await updateDoc(roomDocRef(_activeRoomId), patch);
}

async function hostStartGame() {
  if (!_activeRoomId || !_isHost) return;
  // M1：寫入 sessionId + 倒數設定，讓隊員做一致的「開局」流程
  const sessionId = _randSessionId();
  await updateDoc(roomDocRef(_activeRoomId), {
    status: "starting",
    sessionId,
    startDelayMs: START_COUNTDOWN_MS,
    startAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

async function sendSignal(payload) {
  if (!_activeRoomId) return;
  await addDoc(signalsColRef(_activeRoomId), { ...payload, createdAt: serverTimestamp() });
}

function listenRoom(roomId) {
  if (_activeRoomUnsub) { try { _activeRoomUnsub(); } catch (_) {} }
  _activeRoomUnsub = onSnapshot(
    roomDocRef(roomId),
    (snap) => {
      _roomState = snap.exists() ? (snap.data() || null) : null;
      if (_roomState && _roomState.hostUid) _hostUid = _roomState.hostUid;
      // 同步 host 的下拉（避免用輪詢）
      _syncHostSelectsFromRoom();
      updateLobbyUI();

      // 房間被室長解散/關閉：所有人自動離開回到組隊選擇
      if (_roomState && _roomState.status === "closed") {
        _setText("survival-online-status", "隊伍已解散");
        leaveRoom().catch(() => {});
        closeLobbyToSelect();
        return;
      }

      // 若開始遊戲，觸發進入
      if (_roomState && _roomState.status === "starting") {
        tryStartSurvivalFromRoom();
      }
    },
    (err) => {
      // 被踢出隊伍後，Rules 會使 isMember=false，room read 會 permission-denied
      try {
        const code = err && err.code ? String(err.code) : "";
        if (code.includes("permission-denied")) {
          _setText("survival-online-status", "你已被室長移出隊伍");
          leaveRoom().catch(() => {});
          closeLobbyToSelect();
          return;
        }
        const msg = (err && err.message) ? String(err.message) : "房間監聽錯誤";
        _setText("survival-online-status", `房間監聽錯誤：${msg}`);
        console.warn("[SurvivalOnline] room listener error:", err);
      } catch (_) {}
    }
  );
}

function listenMembers(roomId) {
  if (_membersUnsub) { try { _membersUnsub(); } catch (_) {} }
  const col = collection(_db, "rooms", roomId, "members");
  _membersUnsub = onSnapshot(
    col,
    (snap) => {
      const oldUids = new Set(_membersState.keys());
      const m = new Map();
      snap.forEach((d) => {
        const data = d.data() || {};
        if (data && data.uid) {
          m.set(data.uid, data);
          oldUids.delete(data.uid); // 仍在房間的成員
        }
      });
      // M2：清理已離開的成員的遠程玩家對象
      if (_isHost) {
        for (const leftUid of oldUids) {
          try {
            if (typeof RemotePlayerManager !== "undefined" && RemotePlayerManager.remove) {
              RemotePlayerManager.remove(leftUid);
            }
          } catch (_) {}
        }
      }
      _membersState = m;

      // 室長側保險：人數超過上限時，移出最新加入的非室長成員
      try {
        if (_isHost) {
          const arr = Array.from(_membersState.values()).filter(x => x && x.uid);
          if (arr.length > MAX_PLAYERS) {
            const extras = arr
              .filter(x => x.role !== "host" && x.uid !== _uid)
              .sort((a, b) => _joinedAtMs(b) - _joinedAtMs(a)); // 最新的優先移出
            const needKick = Math.max(0, arr.length - MAX_PLAYERS);
            for (let i = 0; i < needKick && i < extras.length; i++) {
              hostKickMember(extras[i].uid).catch(() => {});
            }
          }
        }
      } catch (_) {}

      updateLobbyUI();
    },
    (err) => {
      try {
        const code = err && err.code ? String(err.code) : "";
        if (code.includes("permission-denied")) {
          _setText("survival-online-status", "你已被室長移出隊伍");
          leaveRoom().catch(() => {});
          closeLobbyToSelect();
          return;
        }
        const msg = (err && err.message) ? String(err.message) : "成員監聽錯誤";
        _setText("survival-online-status", `成員監聽錯誤：${msg}`);
        console.warn("[SurvivalOnline] members listener error:", err);
      } catch (_) {}
    }
  );
}

async function hostKickMember(targetUid) {
  if (!_activeRoomId || !_isHost) return;
  if (!targetUid || targetUid === _uid) return;
  // 安全：只踢非室長
  const m = _membersState.get(targetUid);
  if (m && m.role === "host") return;
  try {
    await deleteDoc(memberDocRef(_activeRoomId, targetUid));
    // M2：清理被踢玩家的遠程對象
    try {
      if (typeof RemotePlayerManager !== "undefined" && RemotePlayerManager.remove) {
        RemotePlayerManager.remove(targetUid);
      }
    } catch (_) {}
    _setText("survival-online-status", "已移出隊伍成員");
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : "移出失敗";
    _setText("survival-online-status", `移出失敗：${msg}`);
  }
}

async function hostDisbandTeam() {
  if (!_activeRoomId || !_isHost) return;
  // 軟解散：把 room status 設為 closed，所有人 listener 會自動離開
  try {
    await updateDoc(roomDocRef(_activeRoomId), { status: "closed", updatedAt: serverTimestamp() });
  } catch (_) {}
  await leaveRoom().catch(() => {});
  closeLobbyToSelect();
  _setText("survival-online-status", "隊伍已解散");
}

function listenSignals(roomId) {
  if (_signalsUnsub) { try { _signalsUnsub(); } catch (_) {} }
  // 注意：where + orderBy(createdAt) 會要求複合索引；為了「免建索引、少麻煩」
  // 這裡改成只用 where(toUid==me) + limit，然後逐筆消費刪除即可（順序在本設計不重要）。
  const q = query(
    signalsColRef(roomId),
    where("toUid", "==", _uid),
    limit(50)
  );
  _signalsUnsub = onSnapshot(
    q,
    (snap) => {
      snap.docChanges().forEach(async (ch) => {
        if (ch.type !== "added") return;
        const sig = ch.doc.data() || {};
        const sid = ch.doc.id;
        try {
          await handleSignal(sig);
        } catch (_) {}
        // 消費後刪除，避免重播
        try { await deleteDoc(doc(_db, "rooms", roomId, "signals", sid)); } catch (_) {}
      });
    },
    (err) => {
      // 避免「Uncaught Error in snapshot listener」導致整個監聽器掛掉而無提示
      try {
        const msg = (err && err.message) ? String(err.message) : "監聽器錯誤";
        _setText("survival-online-status", `信令監聽錯誤：${msg}`);
        console.warn("[SurvivalOnline] signals listener error:", err);
      } catch (_) {}
    }
  );
}

function createPeerConnectionCommon() {
  return new RTCPeerConnection({
    iceServers: ICE_SERVERS_OPEN_RELAY,
    iceTransportPolicy: "relay", // 關鍵：只走 relay，避免暴露 IP
  });
}

async function connectClientToHost() {
  if (!_activeRoomId || !_hostUid || _isHost) return;
  if (_pc) return;
  _pc = createPeerConnectionCommon();
  _dc = _pc.createDataChannel("game", { ordered: true });

  _dc.onopen = () => {
    Runtime.setEnabled(true);
    _setText("survival-online-status", "已連線（relay）");
  };
  _dc.onclose = () => {
    Runtime.setEnabled(false);
    _setText("survival-online-status", "連線已中斷");
  };
  _dc.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.t === "state") {
        Runtime.onStateMessage(msg);
      } else if (msg.t === "event") {
        // M2：處理室長廣播的事件
        Runtime.onEventMessage(msg);
      }
    } catch (_) {}
  };

  _pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    // relay-only：只傳 relay candidate，避免 host/srflx 內容外洩
    if (!_candidateIsRelay(ev.candidate)) return;
    sendSignal({
      type: "candidate",
      fromUid: _uid,
      toUid: _hostUid,
      candidate: ev.candidate,
    });
  };

  _pc.onconnectionstatechange = () => {
    const st = _pc.connectionState;
    if (st === "failed" || st === "disconnected") {
      Runtime.setEnabled(false);
      _setText("survival-online-status", "連線失敗（TURN 不可用或被限流）");
    }
  };

  // 建立 offer
  const offer = await _pc.createOffer();
  await _pc.setLocalDescription(offer);
  await sendSignal({
    type: "offer",
    fromUid: _uid,
    toUid: _hostUid,
    sdp: offer,
  });
}

async function hostAcceptOffer(fromUid, sdp) {
  if (!_activeRoomId || !_isHost) return;
  if (!fromUid || !sdp) return;
  if (_pcsHost.has(fromUid)) return; // 已存在
  const pc = createPeerConnectionCommon();
  let channel = null;

  pc.ondatachannel = (ev) => {
    channel = ev.channel;
    // 重要：把 channel 存回 map，讓 host 能廣播給所有 client
    try {
      const cur = _pcsHost.get(fromUid);
      if (cur && cur.pc === pc) {
        _pcsHost.set(fromUid, { pc, channel });
      } else {
        _pcsHost.set(fromUid, { pc, channel });
      }
    } catch (_) {}
    channel.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleHostDataMessage(fromUid, msg);
      } catch (_) {}
    };
    channel.onopen = () => {
      Runtime.setEnabled(true);
      updateLobbyUI();
    };
    channel.onclose = () => {
      updateLobbyUI();
    };
  };

  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    if (!_candidateIsRelay(ev.candidate)) return;
    sendSignal({
      type: "candidate",
      fromUid: _uid,
      toUid: fromUid,
      candidate: ev.candidate,
    });
  };

  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === "failed") {
      // 可能是 TURN 不可用
      updateLobbyUI();
    }
  };

  await pc.setRemoteDescription(sdp);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  // 先放入（channel 會在 ondatachannel 時補上）
  _pcsHost.set(fromUid, { pc, channel: null });

  await sendSignal({
    type: "answer",
    fromUid: _uid,
    toUid: fromUid,
    sdp: answer,
  });
}

function _sendToChannel(ch, obj) {
  if (!ch || ch.readyState !== "open") return;
  try { ch.send(JSON.stringify(obj)); } catch (_) {}
}

// M2：事件廣播系統（室長權威）
function broadcastEvent(eventType, eventData) {
  if (!_isHost || !_activeRoomId) return;
  const event = {
    t: "event",
    type: eventType,
    data: eventData,
    timestamp: Date.now()
  };
  // 廣播給所有 client
  for (const [uid, it] of _pcsHost.entries()) {
    const ch = (it && it.channel) ? it.channel : null;
    _sendToChannel(ch, event);
  }
}

function handleHostDataMessage(fromUid, msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.t === "pos") {
    // 收到玩家位置，室長彙總後廣播
    const player = _membersState.get(fromUid) || {};
    const name = typeof player.name === "string" ? player.name : fromUid.slice(0, 6);
    const x = typeof msg.x === "number" ? msg.x : 0;
    const y = typeof msg.y === "number" ? msg.y : 0;
    // 在 host 端也顯示（讓 host 看得到別人）
    Runtime.onStateMessage({ t: "state", players: { [fromUid]: { x, y, name } } });

    // 彙總全員狀態（含 host 自己）
    const players = {};
    try {
      // host 自己
      if (typeof Game !== "undefined" && Game.player) {
        players[_uid] = { x: Game.player.x, y: Game.player.y, name: `玩家-${_uid.slice(0, 4)}` };
      }
    } catch (_) {}
    // 已知其他人（Runtime 內 + 這次）
    for (const p of Runtime.getRemotePlayers()) {
      players[p.uid] = { x: p.x, y: p.y, name: p.name };
    }
    players[fromUid] = { x, y, name };

    // 廣播給所有 client
    for (const [uid, it] of _pcsHost.entries()) {
      const ch = (it && it.channel) ? it.channel : null;
      _sendToChannel(ch, { t: "state", players });
    }
    return;
  }
  if (msg.t === "input") {
    // M2：將輸入套用到遠程玩家（室長權威）
    if (!_isHost) return;
    const mx = typeof msg.mx === "number" ? msg.mx : 0;
    const my = typeof msg.my === "number" ? msg.my : 0;
    
    // 獲取或創建遠程玩家對象
    try {
      // 嘗試從 Game 獲取世界中心作為起始位置（如果玩家尚未創建，使用預設值）
      let startX = 1920;
      let startY = 1080;
      if (typeof Game !== "undefined") {
        if (Game.worldWidth && Game.worldHeight) {
          startX = Game.worldWidth / 2;
          startY = Game.worldHeight / 2;
        } else if (Game.player) {
          // 如果玩家已存在，使用玩家位置作為參考
          startX = Game.player.x;
          startY = Game.player.y;
        }
      }
      const remotePlayer = RemotePlayerManager.getOrCreate(fromUid, startX, startY);
      remotePlayer.applyInput(mx, my);
    } catch (e) {
      console.warn("[SurvivalOnline] M2 輸入處理失敗:", e);
    }
    return;
  }
}

function sendToNet(obj) {
  if (!obj) return;
  if (_isHost) {
    // host 本地：直接合成 state 並發給 client（避免 host 也要走 dc）
    if (obj.t === "pos") {
      const x = obj.x, y = obj.y;
      const players = {};
      players[_uid] = { x, y, name: `玩家-${_uid.slice(0, 4)}` };
      // 加上目前已知 remote（host 看得到）
      for (const p of Runtime.getRemotePlayers()) {
        players[p.uid] = { x: p.x, y: p.y, name: p.name };
      }
      for (const [uid, it] of _pcsHost.entries()) {
        const ch = (it && it.channel) ? it.channel : null;
        _sendToChannel(ch, { t: "state", players });
      }
    }
    return;
  }
  // client：送到 host
  _sendToChannel(_dc, obj);
}

async function handleSignal(sig) {
  if (!sig || typeof sig !== "object") return;
  if (sig.type === "offer" && _isHost) {
    await hostAcceptOffer(sig.fromUid, sig.sdp);
    return;
  }
  if (sig.type === "answer" && !_isHost) {
    if (_pc && sig.sdp) {
      await _pc.setRemoteDescription(sig.sdp);
      Runtime.setEnabled(true);
      _setText("survival-online-status", "已連線（relay）");
    }
    return;
  }
  if (sig.type === "candidate") {
    const cand = sig.candidate;
    if (!cand) return;
    // relay-only：只接受 relay candidates
    if (!_candidateIsRelay(cand)) return;
    if (_isHost) {
      const fromUid = sig.fromUid;
      const it = _pcsHost.get(fromUid);
      if (it && it.pc) {
        try { await it.pc.addIceCandidate(cand); } catch (_) {}
      }
    } else {
      if (_pc) {
        try { await _pc.addIceCandidate(cand); } catch (_) {}
      }
    }
  }
}

async function reconnectClient() {
  if (_isHost) return;
  if (!_activeRoomId) return;
  try {
    _setText("survival-online-status", "重新連線中…");
  } catch (_) {}
  try { if (_dc) _dc.close(); } catch (_) {}
  _dc = null;
  try { if (_pc) _pc.close(); } catch (_) {}
  _pc = null;
  Runtime.setEnabled(false);
  // hostUid 若尚未就緒，等一下 room snapshot
  if (!_hostUid) {
    for (let i = 0; i < 20; i++) {
      if (_hostUid) break;
      await new Promise(r => setTimeout(r, 100));
    }
  }
  if (!_hostUid) {
    _setText("survival-online-status", "無法重新連線：找不到室長");
    return;
  }
  await connectClientToHost();
}

async function hostCleanupStale() {
  if (!_isHost || !_activeRoomId) return;
  const stale = Array.from(_membersState.values())
    .filter(m => m && m.uid && m.uid !== _uid && m.role !== "host" && _isMemberStale(m));
  if (!stale.length) {
    _setText("survival-online-status", "沒有離線成員需要清理");
    return;
  }
  const ok = window.confirm(`要清理 ${stale.length} 位離線成員嗎？`);
  if (!ok) return;
  for (const m of stale) {
    await hostKickMember(m.uid);
  }
}

function updateLobbyUI() {
  // 狀態文字
  const stEl = _qs("survival-online-status");
  if (stEl) {
    let s = "尚未連線";
    if (_activeRoomId) {
      s = _isHost ? "已建立房間" : "已加入房間";
      if (!_isHost && _pc && _pc.connectionState === "connected") s = "已連線（relay）";
    }
    stEl.textContent = s;
  }

  _setText("survival-online-room-code-display", _activeRoomId || "-");

  // host 設定控制
  const selMap = _qs("survival-online-host-map");
  const selDiff = _qs("survival-online-host-diff");
  if (selMap) selMap.disabled = !_isHost;
  if (selDiff) selDiff.disabled = !_isHost;

  // 成員列表
  const list = _qs("survival-online-members");
  if (list) {
    list.innerHTML = "";
    const arr = Array.from(_membersState.values());
    arr.sort((a, b) => (a.role === "host" ? -1 : 1) - (b.role === "host" ? -1 : 1));
    for (const m of arr) {
      const stale = _isMemberStale(m);
      const div = document.createElement("div");
      div.style.display = "flex";
      div.style.justifyContent = "space-between";
      div.style.gap = "10px";
      div.style.alignItems = "center";
      div.style.padding = "6px 8px";
      div.style.borderRadius = "10px";
      div.style.border = "1px solid rgba(255,255,255,0.12)";
      div.style.background = stale ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.25)";
      div.style.opacity = stale ? "0.6" : "1";
      const left = document.createElement("div");
      const roleLabel = (m.role === "host") ? "室長" : "玩家";
      const name = m.name || (m.uid || "").slice(0, 6);
      left.textContent = `${roleLabel}：${name}${stale ? "（離線）" : ""}`;
      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "8px";
      right.style.opacity = "0.95";
      const status = document.createElement("div");
      // stale 視為未準備（避免卡住室長開始條件）
      status.textContent = (!stale && m.ready) ? "已準備" : "未準備";
      status.style.opacity = "0.9";
      right.appendChild(status);

      // 室長操作：踢人（僅對非室長、非自己）
      if (_isHost && m && m.uid && m.uid !== _uid && m.role !== "host") {
        const btnKick = document.createElement("button");
        btnKick.className = "ghost";
        btnKick.textContent = "移出";
        btnKick.style.padding = "4px 10px";
        btnKick.style.fontSize = "12px";
        btnKick.addEventListener("click", async () => {
          const ok = window.confirm(`要把「${name}」移出隊伍嗎？`);
          if (!ok) return;
          await hostKickMember(m.uid);
          updateLobbyUI();
        });
        right.appendChild(btnKick);
      }
      div.appendChild(left);
      div.appendChild(right);
      list.appendChild(div);
    }
  }

  // 開始按鈕：僅 host 可用，且全員準備
  const btnStart = _qs("survival-online-start");
  if (btnStart) {
    let can = !!_isHost && _activeRoomId;
    if (can) {
      const ms = Array.from(_membersState.values());
      // 規則：
      // - 人數 1~5
      // - 非 host 成員必須 ready 且不 stale；stale 一律視為未準備（避免殘留占位卡死）
      can = ms.length > 0 && ms.length <= MAX_PLAYERS && ms.every((m) => {
        if (!m || !m.uid) return false;
        if (m.role === "host") return true;
        if (_isMemberStale(m)) return false;
        return !!m.ready;
      });
    }
    btnStart.disabled = !can;
  }

  // 解散按鈕：僅室長可用
  const btnDisband = _qs("survival-online-disband");
  if (btnDisband) {
    btnDisband.disabled = !(_isHost && !!_activeRoomId);
    btnDisband.style.display = (_isHost ? "" : "none");
  }

  // 重新連線：僅客戶端可用
  const btnRe = _qs("survival-online-reconnect");
  if (btnRe) {
    btnRe.style.display = (_isHost ? "none" : "");
    btnRe.disabled = !(!_isHost && !!_activeRoomId);
  }

  // 清理離線：僅室長可用
  const btnCleanup = _qs("survival-online-cleanup");
  if (btnCleanup) {
    btnCleanup.style.display = (_isHost ? "" : "none");
    btnCleanup.disabled = !(_isHost && !!_activeRoomId);
  }
}

function _fillMapOptions() {
  const sel = _qs("survival-online-host-map");
  if (!sel) return;
  sel.innerHTML = "";
  const maps = (typeof CONFIG !== "undefined" && Array.isArray(CONFIG.MAPS)) ? CONFIG.MAPS : [];
  const survivalMaps = maps.filter((m) => m && typeof m.id === "string" && ["city", "forest", "desert", "garden", "intersection"].includes(m.id));
  for (const m of survivalMaps) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name || m.id;
    sel.appendChild(opt);
  }
}

function _syncHostSelectsFromRoom() {
  const selMap = _qs("survival-online-host-map");
  const selDiff = _qs("survival-online-host-diff");
  if (_roomState) {
    if (selMap && _roomState.mapId) selMap.value = _roomState.mapId;
    if (selDiff && _roomState.diffId) selDiff.value = _roomState.diffId;
  }
}

async function enterLobbyAsHost(initialParams) {
  const r = await createRoom({ mapId: initialParams.selectedMap?.id, diffId: initialParams.selectedDifficultyId });
  _activeRoomId = r.roomId;
  _isHost = true;
  _hostUid = r.hostUid;
  _setText("survival-online-status", "已建立房間");
  await ensureFirebase();
  listenRoom(_activeRoomId);
  listenMembers(_activeRoomId);
  listenSignals(_activeRoomId);
  Runtime.setEnabled(true);
  _syncHostSelectsFromRoom();
  _startMemberHeartbeat();
}

async function enterLobbyAsGuest(roomId) {
  const r = await joinRoom(roomId);
  _activeRoomId = r.roomId;
  _isHost = false;
  _hostUid = r.hostUid;
  _setText("survival-online-status", "已加入房間，準備連線…");
  await ensureFirebase();
  listenRoom(_activeRoomId);
  listenMembers(_activeRoomId);
  listenSignals(_activeRoomId);
  // 連到 host（relay-only）
  await connectClientToHost();
  _startMemberHeartbeat();
}

let _pendingStartParams = null; // { selectedDifficultyId, selectedCharacter, selectedMap }

function openSelectScreen(params) {
  _pendingStartParams = params;
  _hide("difficulty-select-screen");
  _hide("desert-difficulty-select-screen");
  _show("survival-online-select-screen");
}

function closeSelectScreenBackToDifficulty() {
  _hide("survival-online-select-screen");
  // 回到對應難度視窗（依地圖）
  const mapId = (typeof Game !== "undefined" && Game.selectedMap && Game.selectedMap.id) ? Game.selectedMap.id : null;
  if (mapId === "desert") _show("desert-difficulty-select-screen");
  else _show("difficulty-select-screen");
}

function openLobbyScreen() {
  _hide("survival-online-select-screen");
  _show("survival-online-lobby-screen");
  updateLobbyUI();
}

function closeLobbyToSelect() {
  _hide("survival-online-lobby-screen");
  _show("survival-online-select-screen");
}

function closeLobbyOverlayKeepRoom() {
  // ESC 在大廳：只關閉「大廳介面」回到組隊選擇，不自動離開房間（避免影響後續介面/狀態）
  _hide("survival-online-lobby-screen");
  _show("survival-online-select-screen");
  try {
    if (_activeRoomId) {
      _setText("survival-online-status", "已在隊伍中（介面已關閉）");
    }
  } catch (_) {}
}

function startSurvivalNow(params) {
  // 與 main.js 既有流程保持一致：隱藏覆蓋視窗與選角畫面，進入生存模式
  try {
    _hide("difficulty-select-screen");
    _hide("desert-difficulty-select-screen");
    _hide("map-select-screen");
    _hide("character-select-screen");
    _hide("survival-online-select-screen");
    _hide("survival-online-lobby-screen");
  } catch (_) {}

  const useId = params && params.selectedDifficultyId ? params.selectedDifficultyId : (typeof Game !== "undefined" ? (Game.selectedDifficultyId || "EASY") : "EASY");
  try { if (typeof Game !== "undefined") Game.selectedDifficultyId = useId; } catch (_) {}

  // 透過 GameModeManager 啟動生存模式
  if (typeof window !== "undefined" && window.GameModeManager && typeof window.GameModeManager.start === "function") {
    window.GameModeManager.start("survival", {
      selectedDifficultyId: useId,
      selectedCharacter: params && params.selectedCharacter ? params.selectedCharacter : (typeof Game !== "undefined" ? Game.selectedCharacter : null),
      selectedMap: params && params.selectedMap ? params.selectedMap : (typeof Game !== "undefined" ? Game.selectedMap : null),
      // multiplayer hint（生存模式以外不讀）
      multiplayer: _activeRoomId ? {
        roomId: _activeRoomId,
        role: _isHost ? "host" : "guest",
        uid: _uid,
        sessionId: (params && params.sessionId) ? params.sessionId : (_roomState && _roomState.sessionId ? _roomState.sessionId : null)
      } : null,
    });
    return;
  }
  // 回退（極端情況）
  try { if (typeof Game !== "undefined" && typeof Game.startNewGame === "function") Game.startNewGame(); } catch (_) {}
  try { _show("game-screen"); } catch (_) {}
}

function tryStartSurvivalFromRoom() {
  if (!_roomState || _roomState.status !== "starting") return;
  if (!_pendingStartParams) return;

  // M1：避免 snapshot 多次觸發重複 start
  try {
    const sid = _roomState.sessionId || null;
    if (sid && _startSessionId && sid === _startSessionId) return;
    _startSessionId = sid || _startSessionId || "NO_SESSION";
  } catch (_) {}
  if (_startTimer) return;

  // 套用 host 的 map/diff（室長優先權）
  try {
    if (typeof Game !== "undefined") {
      Game.selectedDifficultyId = _roomState.diffId || Game.selectedDifficultyId;
      const maps = (typeof CONFIG !== "undefined" && Array.isArray(CONFIG.MAPS)) ? CONFIG.MAPS : [];
      const mapCfg = maps.find((m) => m && m.id === _roomState.mapId);
      if (mapCfg) Game.selectedMap = mapCfg;
    }
  } catch (_) {}

  // M1：倒數後啟動（讓全員「差不多同一時間」進入）
  const delay = (typeof _roomState.startDelayMs === "number") ? Math.max(0, Math.floor(_roomState.startDelayMs)) : START_COUNTDOWN_MS;
  const sessionId = _roomState.sessionId || null;

  // 顯示倒數覆蓋層
  const overlayEl = _qs("survival-online-countdown-overlay");
  const textEl = _qs("survival-online-countdown-text");
  if (overlayEl) overlayEl.classList.remove("hidden");
  if (textEl) textEl.textContent = `即將開始：${Math.ceil(delay / 1000)}`;

  // 每秒更新倒數
  let countdown = Math.ceil(delay / 1000);
  let countdownInterval = null;
  let hasStarted = false; // 防止重複啟動

  const startGame = () => {
    if (hasStarted) return;
    hasStarted = true;
    if (countdownInterval) clearInterval(countdownInterval);
    if (_startTimer) {
      clearTimeout(_startTimer);
      _startTimer = null;
    }
    if (overlayEl) overlayEl.classList.add("hidden");
    startSurvivalNow({
      selectedDifficultyId: _roomState.diffId || _pendingStartParams.selectedDifficultyId,
      selectedCharacter: _pendingStartParams.selectedCharacter,
      selectedMap: (typeof Game !== "undefined" ? Game.selectedMap : _pendingStartParams.selectedMap),
      sessionId: sessionId
    });
  };

  // 每秒更新倒數文字
  countdownInterval = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      if (textEl) textEl.textContent = "開始！";
      // 延遲一小段後啟動遊戲
      setTimeout(startGame, 300);
    } else {
      if (textEl) textEl.textContent = `即將開始：${countdown}`;
    }
  }, 1000);

  // 設定總延遲（安全網：確保倒數完成後才啟動，即使 interval 出問題）
  _startTimer = setTimeout(() => {
    startGame();
  }, delay);
}

function bindUI() {
  _fillMapOptions();

  const btnSolo = _qs("survival-online-btn-solo");
  const btnOnline = _qs("survival-online-btn-online");
  const btnBack = _qs("survival-online-btn-back");
  const btnCreate = _qs("survival-online-create-room");
  const btnJoin = _qs("survival-online-join-room");
  const inpCode = _qs("survival-online-room-code");
  const btnCopy = _qs("survival-online-copy-room-code");
  const btnReady = _qs("survival-online-ready");
  const btnStart = _qs("survival-online-start");
  const btnLeave = _qs("survival-online-leave");
  const btnDisband = _qs("survival-online-disband");
  const btnReconnect = _qs("survival-online-reconnect");
  const btnCleanup = _qs("survival-online-cleanup");
  const selMap = _qs("survival-online-host-map");
  const selDiff = _qs("survival-online-host-diff");

  if (btnBack) btnBack.addEventListener("click", () => {
    closeSelectScreenBackToDifficulty();
  });
  if (btnSolo) btnSolo.addEventListener("click", () => {
    // 單人：確保離開任何房間/連線
    leaveRoom().catch(() => {});
    startSurvivalNow(_pendingStartParams || {});
  });
  if (btnOnline) btnOnline.addEventListener("click", () => {
    openLobbyScreen();
  });

  if (btnCreate) btnCreate.addEventListener("click", async () => {
    try {
      _setText("survival-online-status", "建立房間中…");
      await enterLobbyAsHost(_pendingStartParams || {});
      updateLobbyUI();
    } catch (e) {
      const code = (e && (e.code || e.name)) ? String(e.code || e.name) : "";
      const msg = (e && e.message) ? String(e.message) : "未知錯誤";
      // 針對權限錯誤給出更具體提示（常見：Firestore rules 尚未發布/仍為鎖死、或匿名登入/網域未允許）
      const hint = (code.includes("permission") || msg.toLowerCase().includes("insufficient permissions"))
        ? "（請確認：Firestore 已建立、Rules 已發布且允許 request.auth != null、Authentication 匿名已啟用、Authorized domains 已加入 yiyuss.github.io）"
        : "";
      _setText("survival-online-status", `建立失敗：${msg}${hint}${code ? ` [${code}]` : ""}`);
      try { console.warn("[SurvivalOnline] create room failed:", e); } catch (_) {}
    }
  });
  if (btnJoin) btnJoin.addEventListener("click", async () => {
    const code = (inpCode && inpCode.value ? inpCode.value.trim().toUpperCase() : "");
    if (!code) {
      _setText("survival-online-status", "請輸入房間碼");
      return;
    }
    try {
      _setText("survival-online-status", "加入房間中…");
      await enterLobbyAsGuest(code);
      updateLobbyUI();
    } catch (e) {
      const c = (e && (e.code || e.name)) ? String(e.code || e.name) : "";
      const msg = (e && e.message) ? String(e.message) : "未知錯誤";
      const hint = (c.includes("permission") || msg.toLowerCase().includes("insufficient permissions"))
        ? "（請確認 Firestore Rules/匿名登入/Authorized domains）"
        : "";
      _setText("survival-online-status", `加入失敗：${msg}${hint}${c ? ` [${c}]` : ""}`);
      try { console.warn("[SurvivalOnline] join room failed:", e); } catch (_) {}
    }
  });

  if (btnCopy) btnCopy.addEventListener("click", async () => {
    const code = _activeRoomId || "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      _setText("survival-online-status", "已複製房間碼");
    } catch (_) {
      // fallback
      try {
        const tmp = document.createElement("textarea");
        tmp.value = code;
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand("copy");
        document.body.removeChild(tmp);
        _setText("survival-online-status", "已複製房間碼");
      } catch (_) {}
    }
  });

  let _ready = false;
  if (btnReady) btnReady.addEventListener("click", async () => {
    if (!_activeRoomId) return;
    _ready = !_ready;
    try {
      await setReady(_ready);
      btnReady.textContent = _ready ? "取消準備" : "準備";
    } catch (_) {}
  });

  if (btnStart) btnStart.addEventListener("click", async () => {
    if (!_isHost || !_activeRoomId) return;
    try {
      await hostStartGame();
      _setText("survival-online-status", "開始中…");
    } catch (e) {
      _setText("survival-online-status", `開始失敗：${e && e.message ? e.message : "未知錯誤"}`);
    }
  });

  if (btnLeave) btnLeave.addEventListener("click", async () => {
    await leaveRoom().catch(() => {});
    closeLobbyToSelect();
    _setText("survival-online-status", "已離開房間");
    updateLobbyUI();
  });

  if (btnDisband) btnDisband.addEventListener("click", async () => {
    if (!_isHost || !_activeRoomId) return;
    // 低風險確認（避免誤觸）
    const ok = window.confirm("要解散隊伍嗎？所有隊員都會被退出。");
    if (!ok) return;
    await hostDisbandTeam().catch(() => {});
  });

  if (btnReconnect) btnReconnect.addEventListener("click", async () => {
    await reconnectClient().catch(() => {});
  });

  if (btnCleanup) btnCleanup.addEventListener("click", async () => {
    await hostCleanupStale().catch(() => {});
  });

  if (selMap) selMap.addEventListener("change", async () => {
    if (!_isHost) return;
    const mapId = selMap.value;
    try { await hostUpdateSettings({ mapId }); } catch (_) {}
  });
  if (selDiff) selDiff.addEventListener("change", async () => {
    if (!_isHost) return;
    const diffId = selDiff.value;
    try { await hostUpdateSettings({ diffId }); } catch (_) {}
  });

  // lobby screen 的返回：回到選擇（但保留房間，玩家可再回來）
  // 初版不提供此按鈕，避免狀態混亂（要返回用「離開」）

  // 不再使用輪詢同步下拉，改由 listenRoom 的 onSnapshot 觸發（更省配額）
}

// 對外：由 main.js 呼叫（取代原本直接 start survival）
function startFlowFromMain(params) {
  // 只在生存模式難度選擇階段使用
  openSelectScreen(params || {});
}

// 對外：提供給 Game.update/draw 取用
function getRuntime() {
  return Runtime;
}

function handleEscape() {
  // 只在組隊介面可見時處理 ESC；回傳 true 代表已處理（外部可 stopPropagation）
  try {
    const isVisible = (id) => {
      const el = _qs(id);
      return !!(el && !el.classList.contains("hidden"));
    };
    if (isVisible("survival-online-lobby-screen")) {
      closeLobbyOverlayKeepRoom();
      return true;
    }
    if (isVisible("survival-online-select-screen")) {
      closeSelectScreenBackToDifficulty();
      return true;
    }
  } catch (_) {}
  return false;
}

// 綁定：DOM ready 後初始化 UI
try {
  // index.html 在底部載入，通常 DOM 已就緒
  bindUI();
} catch (e) {
  console.warn("[SurvivalOnline] UI 綁定失敗：", e);
}

// 關鍵：ESC 攔截（capture phase）
// - 必須在 main.js / KeyboardRouter 的 ESC 邏輯之前吃掉事件，避免「一次 ESC 觸發多處」造成背景跳回主選單但組隊 UI 仍在前面。
// - 只在組隊介面可見時處理。
try {
  document.addEventListener(
    "keydown",
    (e) => {
      try {
        if (!e || e.key !== "Escape") return;
        if (handleEscape()) {
          e.preventDefault();
          try { e.stopImmediatePropagation(); } catch (_) {}
          try { e.stopPropagation(); } catch (_) {}
        }
      } catch (_) {}
    },
    true // capture
  );
} catch (_) {}

// 將 API 暴露到 window，供非 module 的 main.js / game.js 呼叫
window.SurvivalOnlineUI = {
  startFlowFromMain,
  leaveRoom,
  getRuntime,
  handleEscape,
};

// 提供給 game.js 的 runtime bridge（避免 game.js import）
window.SurvivalOnlineRuntime = Runtime;

// 頁面關閉/刷新：盡力離開房間（不保證完成，仍以心跳/超時判定為主）
try {
  window.addEventListener("beforeunload", () => {
    try {
      if (window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.leaveRoom === "function") {
        window.SurvivalOnlineUI.leaveRoom().catch(() => {});
      }
    } catch (_) {}
  });
} catch (_) {}


