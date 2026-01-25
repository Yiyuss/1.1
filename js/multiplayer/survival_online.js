// 生存模式組隊（測試版）
// 目標：
// - 僅在生存模式流程中啟用（不影響其他模式）
// - 使用 Firebase（匿名登入 + Firestore）做 signaling / 房間大廳
// - 使用 WebSocket 服務器進行遊戲數據傳輸，保護隱私，不暴露 IP
// - 提供完整的多人同步：玩家位置、狀態、敵人、技能效果等
//
// 安全/隱私備註：
// - apiKey 不是密碼，可公開；但 Firestore 規則與匿名登入必須正確設定以避免被濫用。
// - 重要：Firebase 中繼會暴露 IP，因此使用 WebSocket 服務器中繼，不暴露玩家 IP 地址。
// - 所有遊戲數據通過 WebSocket 服務器中繼，不暴露玩家 IP 地址。
// - WebSocket 服務器：ws.yiyuss-ws.com:8080（Vultr VPS，自建，使用 Let's Encrypt 證書）
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

// ✅ ES Module 與傳統 script 的全域差異：
// - 很多遊戲類別（class/let/const）在 script 中不會成為「可被 module 直接用識別字存取」的 global
// - 但會（或應該）掛在 window/globalThis 上
// 因此多人模組一律從 globalThis 取建構子，避免出現「只能移動圖片，世界物件全空」。
function _getGlobalCtor(name) {
  try {
    if (typeof globalThis !== "undefined" && globalThis && globalThis[name]) return globalThis[name];
  } catch (_) { }
  try {
    if (typeof window !== "undefined" && window && window[name]) return window[name];
  } catch (_) { }
  return undefined;
}

// 你的 Firebase Web 設定（由使用者提供）
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCjAVvO_zSTy6XYzPPibioDpvmBZTlW-s4",
  authDomain: "github-e71d1.firebaseapp.com",
  projectId: "github-e71d1",
  storageBucket: "github-e71d1.firebasestorage.app",
  messagingSenderId: "513407424654",
  appId: "1:513407424654:web:95d3246d5afeb6dccd11df",
};

// WebSocket 服務器配置（使用 WSS 以支持 HTTPS 頁面）
// 注意：部分網路環境會封鎖非 443 連線（例如 8080），會造成瀏覽器一直卡在 CONNECTING（readyState=0）
// 因此提供候選清單：先試 8080，失敗/超時就自動切換到 443 方案（需 VPS 有配置對應入口）。
const WEBSOCKET_SERVER_URL = "wss://ws.yiyuss-ws.com:8080";
const WEBSOCKET_CANDIDATE_URLS = [
  WEBSOCKET_SERVER_URL,
  "wss://ws.yiyuss-ws.com",       // 443（若有反代/直聽）
  "wss://ws.yiyuss-ws.com/ws",    // 443 路徑（若有反代）
];
const WS_CONNECT_TIMEOUT_MS = 6000;

// ✅ 啟動線可觀測性（不是「報告」，是讓系統自己判斷卡在哪一段）
// - 你目前的症狀是「WS 已連線/已加入，但世界是空的」：
//   這通常代表：沒有收到 game-state / 或 state 內容一直為空 / 或無法建構 Enemy/Projectile 類
const _netStats = {
  wsUrl: null,
  joinedAt: 0,
  gameStateCount: 0,
  lastGameStateAt: 0,
  lastStateSizes: null,
};

function _updateNetStatusLine(extra) {
  try {
    // ✅ 預設不把 debug counters 顯示在組隊大廳（避免你說的「遊戲結束回大廳還在跑數字」）
    if (!SURVIVAL_ONLINE_DEBUG) return;
    if (typeof document === "undefined") return;
    const ws = _ws;
    const wsState = ws ? ws.readyState : null;
    const wsStateName = (wsState === 0) ? "CONNECTING" : (wsState === 1) ? "OPEN" : (wsState === 2) ? "CLOSING" : (wsState === 3) ? "CLOSED" : "null";
    const last = _netStats.lastGameStateAt ? `${Date.now() - _netStats.lastGameStateAt}ms` : "never";
    const sizes = _netStats.lastStateSizes
      ? `p=${_netStats.lastStateSizes.players}, e=${_netStats.lastStateSizes.enemies}, pr=${_netStats.lastStateSizes.projectiles}, orb=${_netStats.lastStateSizes.orbs}`
      : "no-state";
    const url = _netStats.wsUrl ? _netStats.wsUrl : (ws && ws.url ? ws.url : "");
    const msg = `WS:${wsStateName} ${url} | gs#${_netStats.gameStateCount} last:${last} ${sizes}${extra ? " | " + extra : ""}`;
    _setText("survival-online-status", msg);
  } catch (_) { }
}

const MAX_PLAYERS = 5;
const ROOM_TTL_MS = 1000 * 60 * 60; // 1小時（僅用於前端清理提示；真正清理由規則/人為）
const MEMBER_HEARTBEAT_MS = 15000; // 15s：更新 lastSeenAt（避免關頁/斷線殘留）
const MEMBER_STALE_MS = 45000; // 45s：超過視為離線/殘留
const START_COUNTDOWN_MS = 3000; // M1：開始倒數（收到 starting 後倒數）

// 玩家名稱驗證和處理
const PLAYER_NAME_MAX_LENGTH = 5; // 最大長度：5個字符（中文字、英文字、數字）
const PLAYER_NAME_MIN_LENGTH = 1; // 最小長度
const PLAYER_NAME_STORAGE_KEY = "survival_player_nickname"; // localStorage 鍵名
const PLAYER_NAME_INSTANCE_KEY_PREFIX = "survival_player_nickname__"; // sessionStorage per instance

// ✅ 多開/多裝置唯一識別（每個分頁一個 instanceId）
// - authUid: Firebase 匿名登入 uid（用於 Firestore 權限）
// - netUid : `${authUid}:${instanceId}`（用於 WebSocket/GameState 唯一識別，避免名字覆蓋/血量共用/看不到隊友）
const SURVIVAL_ONLINE_INSTANCE_KEY = "survival_online_instance_id"; // sessionStorage

function _getOrCreateInstanceId() {
  try {
    if (typeof sessionStorage === "undefined") return "no-session";
    let v = sessionStorage.getItem(SURVIVAL_ONLINE_INSTANCE_KEY);
    if (v && typeof v === "string" && v.length >= 4) return v;
    v = Math.random().toString(36).slice(2, 8) + "-" + Date.now().toString(36).slice(-4);
    sessionStorage.setItem(SURVIVAL_ONLINE_INSTANCE_KEY, v);
    return v;
  } catch (_) {
    return "no-session";
  }
}

function _getInstanceNicknameKey() {
  const iid = _instanceId || _getOrCreateInstanceId();
  return PLAYER_NAME_INSTANCE_KEY_PREFIX + String(iid || "no-session");
}

// 名稱驗證和清理函數
// ✅ 限制：1~5個字符（中文字、英文字、數字），可交叉搭配，不能有其他(例如空白鍵、符號)
function sanitizePlayerName(name) {
  if (!name || typeof name !== "string") return null;

  // 移除首尾空白
  name = name.trim();

  // 檢查長度：1~5個字符
  if (name.length < PLAYER_NAME_MIN_LENGTH || name.length > PLAYER_NAME_MAX_LENGTH) {
    return null;
  }

  // 只允許中文字、英文字、數字
  // 中文字：\u4e00-\u9fff（CJK統一漢字）
  // 英文字：a-zA-Z
  // 數字：0-9
  const validPattern = /^[\u4e00-\u9fffa-zA-Z0-9]+$/;
  if (!validPattern.test(name)) {
    return null;
  }

  // 移除危險字符（HTML 標籤、腳本等）- 雖然已經通過正則驗證，但為了安全還是移除
  name = name.replace(/[<>\"'&]/g, "");

  // 移除控制字符
  name = name.replace(/[\x00-\x1F\x7F]/g, "");

  // 再次檢查長度（移除字符後可能變短）
  if (name.length < PLAYER_NAME_MIN_LENGTH) {
    return null;
  }

  return name;
}

// 獲取玩家暱稱（從 localStorage 或生成默認值）
function getPlayerNickname() {
  try {
    // ✅ 多開相容：同一台電腦開兩個分頁測試時，localStorage 會共用，會造成「兩人同名/互蓋」。
    // 因此組隊暱稱優先讀 sessionStorage（每分頁唯一），再回退 localStorage（跨次保存）。
    try {
      if (typeof sessionStorage !== "undefined") {
        const v2 = sessionStorage.getItem(_getInstanceNicknameKey());
        if (v2) {
          const s2 = sanitizePlayerName(v2);
          if (s2) return s2;
        }
      }
    } catch (_) { }

    const saved = localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
    if (saved) {
      const sanitized = sanitizePlayerName(saved);
      if (sanitized) {
        return sanitized;
      }
    }
  } catch (_) { }

  // 如果沒有保存的暱稱或驗證失敗，返回默認值
  return `玩家-${_uid ? _uid.slice(0, 4) : "0000"}`;
}

// 保存玩家暱稱到 localStorage
function savePlayerNickname(name) {
  const sanitized = sanitizePlayerName(name);
  if (!sanitized) return false;

  try {
    // ✅ 優先寫入 sessionStorage（每分頁），避免多開互蓋
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(_getInstanceNicknameKey(), sanitized);
      }
    } catch (_) { }
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, sanitized);
    return true;
  } catch (_) {
    return false;
  }
}

let _app = null;
let _auth = null;
let _db = null;
let _uid = null;
let _instanceId = null;
let _netUid = null;

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

// WebSocket
let _ws = null; // WebSocket 連接
let _wsReconnectAttempts = 0; // 重連嘗試次數
let _wsJoinedAck = false; // 收到 server 的 joined 後才允許送 game-data
const _wsPendingQueue = []; // queued inner data objects (will be wrapped as game-data)

function _enqueueWsData(obj) {
  if (!obj || typeof obj !== "object") return;
  const t = obj.type || obj.t || null;
  const coalesceTypes = new Set(["config", "map", "world-size", "obstacles", "decorations"]);
  if (t && coalesceTypes.has(t)) {
    const idx = _wsPendingQueue.findIndex(x => x && (x.type || x.t) === t);
    if (idx >= 0) {
      _wsPendingQueue[idx] = obj;
      return;
    }
  }
  if (_wsPendingQueue.length > 200) _wsPendingQueue.shift();
  _wsPendingQueue.push(obj);
}

function _flushWsQueue() {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  if (!_wsJoinedAck) return;
  while (_wsPendingQueue.length) {
    const obj = _wsPendingQueue.shift();
    try { _sendViaWebSocket(obj); } catch (_) { }
  }
}

async function _waitForWsJoined(timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (_ws && _ws.readyState === WebSocket.OPEN && _wsJoinedAck) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}
// ✅ 權威伺服器 game-state 節流：避免 60Hz 大包造成卡頓/閃現感
let _lastServerGameStateAt = 0;
// ✅ 除錯開關（多人同步熱路徑避免大量 log 造成卡頓/延遲/「閃現感」）
const SURVIVAL_ONLINE_DEBUG = false;
try { if (typeof window !== "undefined") window.SURVIVAL_ONLINE_DEBUG = SURVIVAL_ONLINE_DEBUG; } catch (_) { }
let _sanityLogged = false;
let _lastCounterSessionId = null;
let _sessionCountersPrimed = false;
let _lastSessionCoins = 0;
let _lastSessionExp = 0;
let _didServerPosSync = false;
let _lastSkipGameOverLogTime = 0; // ⚠️ 修复：节流"新游戏已开始"日志

function _multiplayerSanityOnce() {
  try {
    if (_sanityLogged) return;
    if (typeof Game === "undefined" || !Game.multiplayer || !Game.multiplayer.enabled) return;
    _sanityLogged = true;
    const sid = Game.multiplayer.sessionId || null;
    const role = Game.multiplayer.role || null;
    const hasWs = !!(_ws && _ws.readyState === WebSocket.OPEN);
    console.log("[SurvivalOnline][Sanity]", {
      role,
      sessionId: sid,
      wsOpen: hasWs,
      serverGameStateThrottledHz: 30,
      clientEventSpawnsDisabled: true,
      enemyClientAIAndDamageDisabled: true,
      projectileClientDamageDisabled: true
    });
  } catch (_) { }
}

// 自動重連機制
let _reconnectAttempts = 0;
let _reconnectTimer = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000; // 3 秒

// M4：室長端遠程玩家管理（完整的 Player 對象，支援武器和戰鬥）
const RemotePlayerManager = (() => {
  const remotePlayers = new Map(); // uid -> Player

  // ✅ 遠端玩家貼圖保底：確保 spriteImageKey 對應的圖片已載入
  // 目的：修復「看不到隊友角色貼圖」但其實 remote Player 物件已存在的情況（Game.images[key] 未載入/未就緒）
  function _ensureSpriteLoaded(spriteKey) {
    try {
      if (!spriteKey) return;
      if (typeof Game !== 'undefined' && Game.images && Game.images[spriteKey] && Game.images[spriteKey].complete) return;

      // 優先使用 ResourceLoader 的映射表（能正確分辨 png/gif）
      if (typeof ResourceLoader !== 'undefined' && ResourceLoader && typeof ResourceLoader.getImageList === 'function' && typeof ResourceLoader.loadImage === 'function') {
        const list = ResourceLoader.getImageList();
        const item = Array.isArray(list) ? list.find(x => x && x.name === spriteKey && x.src) : null;
        if (item && item.src) {
          ResourceLoader.loadImage(spriteKey, item.src);
          return;
        }
      }
    } catch (_) { }
  }

  // M4：使用完整的 Player 類（而不是簡化的 RemotePlayer）
  // 這樣遠程玩家也能有武器、造成傷害、收集經驗等
  function getOrCreate(uid, startX, startY, characterId, talentLevels = null) {
    // 防止創建自己的遠程玩家（隊員端不應該創建自己的遠程玩家）
    if (typeof window !== "undefined" && window.SurvivalOnlineRuntime) {
      const rt = window.SurvivalOnlineRuntime;
      if (rt._uid && uid === rt._uid) {
        console.warn(`[SurvivalOnline] RemotePlayerManager.getOrCreate: 嘗試創建自己的遠程玩家 ${uid}，跳過`);
        return null;
      }
    }

    const existingPlayer = remotePlayers.get(uid);

    // 如果遠程玩家已存在，檢查角色是否需要更新（僅在遊戲開始前，避免影響遊戲進行中的玩家）
    if (existingPlayer && characterId) {
      const currentCharId = (existingPlayer._remoteCharacter && existingPlayer._remoteCharacter.id) ? existingPlayer._remoteCharacter.id : null;
      // 如果角色ID不同，且遊戲尚未開始（通過檢查 Game.multiplayer.enabled 或 Game.isPaused 等狀態）
      // 注意：這裡只檢查角色ID是否變化，不強制更新（因為遊戲進行中不應該切換角色）
      if (currentCharId !== characterId) {
        // 只有在遊戲尚未真正開始時才更新角色（例如：還在組隊大廳）
        const isGameActive = (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled && !Game.isPaused && !Game.isGameOver);
        if (!isGameActive) {
          // 更新角色（重新應用角色屬性和天賦）
          try {
            if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS) {
              const char = CONFIG.CHARACTERS.find(c => c && c.id === characterId);
              if (char) {
                existingPlayer._remoteCharacter = char;
                // 重新應用角色屬性
                const baseMax = (typeof CONFIG !== "undefined" && CONFIG.PLAYER && CONFIG.PLAYER.MAX_HEALTH) ? CONFIG.PLAYER.MAX_HEALTH : 100;
                const hpMul = char.hpMultiplier != null ? char.hpMultiplier : 1.0;
                const hpBonus = char.hpBonus != null ? char.hpBonus : 0;
                const charBaseMax = Math.max(1, Math.floor(baseMax * hpMul + hpBonus));
                existingPlayer.baseMaxHealth = charBaseMax;
                existingPlayer.maxHealth = charBaseMax;
                if (char.speedMultiplier) existingPlayer.speed = ((typeof CONFIG !== "undefined" && CONFIG.PLAYER && CONFIG.PLAYER.SPEED) ? CONFIG.PLAYER.SPEED : 200) * char.speedMultiplier;
                if (char.dodgeChanceBonusPct) existingPlayer._characterBaseDodgeRate = char.dodgeChanceBonusPct;
                if (char.critChanceBonusPct) existingPlayer._characterBaseCritBonusPct = char.critChanceBonusPct;
                if (char.canUseUltimate === false) existingPlayer.canUseUltimate = false;
                existingPlayer.spriteImageKey = char.spriteImageKey || 'player';
                _ensureSpriteLoaded(existingPlayer.spriteImageKey);

                // 重新應用天賦效果
                if (talentLevels && typeof talentLevels === "object") {
                  // ✅ 保存天賦等級到遠程玩家對象（用於AI強化天賦等）
                  existingPlayer._talentLevels = talentLevels;
                  if (typeof BuffSystem !== "undefined" && BuffSystem.applyBuffsFromTalentLevels) {
                    BuffSystem.applyBuffsFromTalentLevels(existingPlayer, talentLevels);
                  }
                }
              }
            }
          } catch (e) {
            console.warn("[SurvivalOnline] 更新遠程玩家角色失敗:", e);
          }
        }
      }
      return existingPlayer;
    }

    // 創建新的遠程玩家
    if (!existingPlayer) {
      try {
        // 創建完整的 Player 對象（ES module 需從 globalThis/window 取 ctor）
        const PlayerCtor = _getGlobalCtor("Player");
        if (PlayerCtor) {
          const player = new PlayerCtor(startX || 0, startY || 0);
          // 標記為遠程玩家（用於區分本地玩家）
          player._isRemotePlayer = true;
          player._remoteUid = uid;
          // 設置角色（如果提供）
          if (characterId && typeof CONFIG !== "undefined" && CONFIG.CHARACTERS) {
            const char = CONFIG.CHARACTERS.find(c => c && c.id === characterId);
            if (char) {
              player._remoteCharacter = char;
              // 應用角色屬性（血量、速度等）
              const baseMax = (typeof CONFIG !== "undefined" && CONFIG.PLAYER && CONFIG.PLAYER.MAX_HEALTH) ? CONFIG.PLAYER.MAX_HEALTH : 100;
              const hpMul = char.hpMultiplier != null ? char.hpMultiplier : 1.0;
              const hpBonus = char.hpBonus != null ? char.hpBonus : 0;
              const charBaseMax = Math.max(1, Math.floor(baseMax * hpMul + hpBonus));
              player.baseMaxHealth = charBaseMax;
              player.maxHealth = charBaseMax;
              if (char.speedMultiplier) player.speed = ((typeof CONFIG !== "undefined" && CONFIG.PLAYER && CONFIG.PLAYER.SPEED) ? CONFIG.PLAYER.SPEED : 200) * char.speedMultiplier;
              if (char.dodgeChanceBonusPct) player._characterBaseDodgeRate = char.dodgeChanceBonusPct;
              if (char.critChanceBonusPct) player._characterBaseCritBonusPct = char.critChanceBonusPct;
              if (char.canUseUltimate === false) player.canUseUltimate = false;
              player.spriteImageKey = char.spriteImageKey || 'player';
              _ensureSpriteLoaded(player.spriteImageKey);
              player.health = player.maxHealth;

              // 應用天賦效果（使用該玩家自己的天賦等級，而不是本地天賦數據）
              try {
                if (talentLevels && typeof talentLevels === "object") {
                  // ✅ 保存天賦等級到遠程玩家對象（用於AI強化天賦等）
                  player._talentLevels = talentLevels;
                  // 使用遠程玩家的天賦等級
                  if (typeof BuffSystem !== "undefined" && BuffSystem.applyBuffsFromTalentLevels) {
                    BuffSystem.applyBuffsFromTalentLevels(player, talentLevels);
                  } else {
                    // 後備方案：臨時替換 TalentSystem.getTalentLevel 來使用遠程玩家的天賦
                    const originalGetTalentLevel = (typeof TalentSystem !== "undefined" && TalentSystem.getTalentLevel) ? TalentSystem.getTalentLevel.bind(TalentSystem) : null;
                    if (originalGetTalentLevel && typeof TalentSystem !== "undefined") {
                      TalentSystem.getTalentLevel = function (id) {
                        const level = (talentLevels && typeof talentLevels[id] === "number") ? talentLevels[id] : 0;
                        const cfg = this.tieredTalents[id];
                        if (!cfg) return 0;
                        return Math.max(0, Math.min(level, cfg.levels.length));
                      }.bind(TalentSystem);
                    }
                    if (typeof TalentSystem !== "undefined" && typeof TalentSystem.applyTalentEffects === "function") {
                      TalentSystem.applyTalentEffects(player);
                    } else if (typeof applyTalentEffects === "function") {
                      applyTalentEffects(player);
                    }
                    // 恢復原始函數
                    if (originalGetTalentLevel && typeof TalentSystem !== "undefined") {
                      TalentSystem.getTalentLevel = originalGetTalentLevel;
                    }
                  }
                } else {
                  // 如果沒有提供天賦等級，使用本地天賦（向後兼容）
                  if (typeof TalentSystem !== "undefined" && typeof TalentSystem.applyTalentEffects === "function") {
                    TalentSystem.applyTalentEffects(player);
                  } else if (typeof applyTalentEffects === "function") {
                    applyTalentEffects(player);
                  }
                }
              } catch (e) {
                console.warn("[SurvivalOnline] 遠程玩家應用天賦失敗:", e);
              }
            }
          }
          // 將遠程玩家添加到 Game.remotePlayers（如果存在，避免重複添加）
          if (typeof Game !== "undefined") {
            if (!Game.remotePlayers) Game.remotePlayers = [];
            // 檢查是否已經存在（避免重複添加）
            const existingIndex = Game.remotePlayers.findIndex(p => p && p._remoteUid === uid);
            if (existingIndex >= 0) {
              // 如果已存在，替換它（避免重複）
              Game.remotePlayers[existingIndex] = player;
            } else {
              // 如果不存在，才添加
              Game.remotePlayers.push(player);
            }
          }
          remotePlayers.set(uid, player);
          return player;
        }
      } catch (e) {
        console.warn("[SurvivalOnline] M4 創建遠程玩家失敗:", e);
      }
      return null;
    }

    return existingPlayer;
  }

  function remove(uid) {
    const player = remotePlayers.get(uid);
    if (player) {
      // 從 Game.remotePlayers 中移除
      try {
        if (typeof Game !== "undefined" && Array.isArray(Game.remotePlayers)) {
          const idx = Game.remotePlayers.indexOf(player);
          if (idx >= 0) Game.remotePlayers.splice(idx, 1);
        }
      } catch (_) { }
      // 清理玩家的武器
      try {
        if (player.weapons && Array.isArray(player.weapons)) {
          for (const weapon of player.weapons) {
            if (weapon && typeof weapon.destroy === "function") {
              try { weapon.destroy(); } catch (_) { }
            }
          }
        }
      } catch (_) { }
    }
    remotePlayers.delete(uid);
  }

  function updateAll(deltaTime) {
    for (const player of remotePlayers.values()) {
      if (player && typeof player.update === "function") {
        // M4：使用完整的 Player.update，包括武器更新、回血等
        // 注意：死亡時 update() 會自動跳過移動和武器更新，只處理復活邏輯

        // ✅ 修復：遠端玩家位置必須跟隨 server state（我們用 _netTargetX/_netTargetY 作為目標）
        // 否則就會出現「看得到隊友攻擊，但人站著不動」。
        try {
          if (player._isRemotePlayer && typeof player._netTargetX === "number" && typeof player._netTargetY === "number") {
            const dx = player._netTargetX - player.x;
            const dy = player._netTargetY - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // 大跳直接瞬移（避免拉扯）
            if (dist > 600) {
              player.x = player._netTargetX;
              player.y = player._netTargetY;
            } else if (dist > 0.5) {
              // 依 dt 自適應 lerp
              const t = Math.max(0.08, Math.min(0.35, (deltaTime / 16.67) * 0.18));
              player.x += dx * t;
              player.y += dy * t;
            }
          }
        } catch (_) { }

        // ✅ 修復：不要同時做「target lerp」與「速度外推」
        // 兩者疊加會造成你看到的「先大幅度亂跳，再回到正確位置」。
        // 這裡統一使用 target lerp（上面那段），保持穩定與一致。

        player.update(deltaTime);
      }
    }
  }

  function getAllStates() {
    const states = {};
    for (const [uid, player] of remotePlayers.entries()) {
      if (player) {
        states[uid] = {
          x: player.x || 0,
          y: player.y || 0,
          hp: player.health || 0,
          maxHp: player.maxHealth || 100,
          energy: player.energy || 0,
          maxEnergy: player.maxEnergy || 100,
          level: player.level || 1,
          exp: player.experience || 0,
          expToNext: player.experienceToNextLevel || 100,
          facingRight: player.facingRight !== false,
          facingAngle: player.facingAngle || 0,
          // 死亡和復活狀態
          _isDead: (typeof player._isDead === "boolean") ? player._isDead : false,
          _resurrectionProgress: (typeof player._resurrectionProgress === "number") ? player._resurrectionProgress : 0
        };
      }
    }
    return states;
  }

  function getAllPlayers() {
    return Array.from(remotePlayers.values());
  }

  function get(uid) {
    return remotePlayers.get(uid) || null;
  }

  function clear() {
    // 清理所有遠程玩家
    for (const [uid, player] of remotePlayers.entries()) {
      try {
        if (typeof Game !== "undefined" && Array.isArray(Game.remotePlayers)) {
          const idx = Game.remotePlayers.indexOf(player);
          if (idx >= 0) Game.remotePlayers.splice(idx, 1);
        }
        if (player && player.weapons && Array.isArray(player.weapons)) {
          for (const weapon of player.weapons) {
            if (weapon && typeof weapon.destroy === "function") {
              try { weapon.destroy(); } catch (_) { }
            }
          }
        }
      } catch (_) { }
    }
    remotePlayers.clear();
  }

  return {
    getOrCreate,
    remove,
    updateAll,
    getAllStates,
    getAllPlayers,
    get,
    clear
  };
})();

// In-game presence
const Runtime = (() => {
  let enabled = false;
  let lastSendAt = 0;
  let lastInputAt = 0;
  let _tickCalled = false; // 用于诊断
  const remotePlayers = new Map(); // uid -> { x, y, name, updatedAt }
  let _netHeartbeatTimer = null;

  function _startNetHeartbeat() {
    try { if (_netHeartbeatTimer) return; } catch (_) { }
    // ✅ 預設不在控制台刷心跳（避免你說的污染與心理壓力）；需要時再手動開 debug
    if (!SURVIVAL_ONLINE_DEBUG) return;
    _netHeartbeatTimer = setInterval(() => {
      try {
        if (!enabled) return;
        if (typeof Game === "undefined" || !Game.multiplayer || !Game.multiplayer.enabled) return;
        // 每 2 秒打印一次「啟動線硬指標」：不用你猜/不用你自己測
        const ws = _ws;
        const wsState = ws ? ws.readyState : null;
        const wsStateName = (wsState === 0) ? "CONNECTING" : (wsState === 1) ? "OPEN" : (wsState === 2) ? "CLOSING" : (wsState === 3) ? "CLOSED" : "null";
        const sinceGs = _netStats.lastGameStateAt ? (Date.now() - _netStats.lastGameStateAt) : null;
        const sizes = _netStats.lastStateSizes || null;
        const localCounts = {
          enemies: (typeof Game !== "undefined" && Array.isArray(Game.enemies)) ? Game.enemies.length : null,
          projectiles: (typeof Game !== "undefined" && Array.isArray(Game.projectiles)) ? Game.projectiles.length : null,
          orbs: (typeof Game !== "undefined" && Array.isArray(Game.experienceOrbs)) ? Game.experienceOrbs.length : null,
          chests: (typeof Game !== "undefined" && Array.isArray(Game.chests)) ? Game.chests.length : null,
        };
        console.log("[SurvivalOnline][Boot]", {
          ws: wsStateName,
          url: _netStats.wsUrl || (ws && ws.url) || null,
          joinedMsAgo: _netStats.joinedAt ? (Date.now() - _netStats.joinedAt) : null,
          gameStateCount: _netStats.gameStateCount,
          lastGameStateMsAgo: sinceGs,
          stateSizes: sizes,
          localCounts
        });
        // ✅ 再補一條「不會被 ... 折疊」的純文字，讓你不用展開物件也能直接看卡點
        try {
          const s = sizes || {};
          const lc = localCounts || {};
          console.log(
            `[SurvivalOnline][BootLine] ws=${wsStateName} gs=${_netStats.gameStateCount} lastGs=${sinceGs === null ? "null" : sinceGs + "ms"} ` +
            `state(p=${s.players ?? "?"},e=${s.enemies ?? "?"},pr=${s.projectiles ?? "?"},orb=${s.orbs ?? "?"}) ` +
            `local(e=${lc.enemies ?? "?"},pr=${lc.projectiles ?? "?"},orb=${lc.orbs ?? "?"},ch=${lc.chests ?? "?"})`
          );
        } catch (_) { }
      } catch (_) { }
    }, 2000);
  }

  function _stopNetHeartbeat() {
    try {
      if (_netHeartbeatTimer) clearInterval(_netHeartbeatTimer);
    } catch (_) { }
    _netHeartbeatTimer = null;
  }

  function setEnabled(v) {
    const wasEnabled = enabled;
    enabled = !!v;
    console.log(`[SurvivalOnline] Runtime.setEnabled(${v}), wasEnabled=${wasEnabled}, nowEnabled=${enabled}, isHost=${_isHost}`);
    if (!enabled) {
      remotePlayers.clear();
      console.log(`[SurvivalOnline] Runtime.setEnabled: 已清除遠程玩家列表`);
      _stopNetHeartbeat();
    } else {
      _startNetHeartbeat();
    }
  }
  
  function isEnabled() {
    return enabled;
  }

  function onStateMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.t !== "state") return;
    // ✅ 權威伺服器模式：忽略舊的 t:"state"（避免與 server game-state 的玩家位置/狀態互打）
    try {
      if (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
        return;
      }
    } catch (_) { }
    if (!enabled) {
      console.warn("[SurvivalOnline] onStateMessage: Runtime未啟用，忽略狀態消息");
      return;
    }
    const now = Date.now();
    const players = payload.players || {};

    if (SURVIVAL_ONLINE_DEBUG) {
      console.log(`[SurvivalOnline] onStateMessage: 收到狀態消息，玩家數量=${Object.keys(players).length}, enabled=${enabled}, isHost=${_isHost}`);
    }

    // 所有端（包括隊長和隊員）：根據接收到的狀態創建/更新遠程玩家對象
    for (const [uid, p] of Object.entries(players)) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") {
        console.warn(`[SurvivalOnline] onStateMessage: 跳過無效玩家 ${uid}`, p);
        continue;
      }
      if (_uid && uid === _uid) {
        console.log(`[SurvivalOnline] onStateMessage: 跳過自己 ${uid}`);
        continue; // 不覆蓋自己
      }

      // 獲取成員數據（角色ID、天賦等級、名字）- 優先從狀態消息獲取，其次從 _membersState 獲取
      const member = _membersState ? _membersState.get(uid) : null;
      const characterId = ((typeof p.characterId === "string") ? p.characterId : null) || (member && member.characterId) || null;
      const talentLevels = (member && member.talentLevels) ? member.talentLevels : null;
      // ✅ 修復：定義 playerName 變量（確保在作用域內可用）
      const playerName = (typeof p.name === "string" && p.name.trim()) ? p.name : (member && typeof member.name === "string" && member.name.trim()) ? member.name : uid.slice(0, 6);

      if (SURVIVAL_ONLINE_DEBUG) {
        console.log(`[SurvivalOnline] onStateMessage: 處理玩家 ${uid}, 位置=(${p.x}, ${p.y}), characterId=${characterId}, name=${playerName}`);
      }

      // 創建或更新遠程玩家對象
      try {
        if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.getOrCreate === "function") {
          const remotePlayer = RemotePlayerManager.getOrCreate(uid, p.x, p.y, characterId, talentLevels);
          if (remotePlayer) {
            if (SURVIVAL_ONLINE_DEBUG) {
              console.log(`[SurvivalOnline] onStateMessage: 成功創建/更新遠程玩家 ${uid}`);
            }
            // ✅ 修復：保存名字到遠程玩家對象（確保繪製時能獲取到正確的名字）
            remotePlayer._remotePlayerName = playerName;
            // ✅ 標準連線遊戲移動同步：使用速度外推 + 平滑插值
            // 這是所有連線遊戲（包括不到10MB的小遊戲）的標準做法
            const targetX = p.x;
            const targetY = p.y;
            if (typeof targetX === "number" && typeof targetY === "number") {
              const dx = targetX - remotePlayer.x;
              const dy = targetY - remotePlayer.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              // 初始化速度追蹤
              if (!remotePlayer._lastStateTime) {
                remotePlayer._lastStateTime = now;
                remotePlayer._lastStateX = targetX;
                remotePlayer._lastStateY = targetY;
                remotePlayer._velocityX = 0;
                remotePlayer._velocityY = 0;
              }

              // 如果距離很大，直接跳轉（網絡延遲或重連）
              if (distance > 150) {
                remotePlayer.x = targetX;
                remotePlayer.y = targetY;
                remotePlayer._velocityX = 0;
                remotePlayer._velocityY = 0;
                remotePlayer._lastStateTime = now;
                remotePlayer._lastStateX = targetX;
                remotePlayer._lastStateY = targetY;
                remotePlayer._remoteInput = null;
              } else if (distance > 0.5) {
                // ✅ 標準做法：計算速度並使用速度外推
                const timeDelta = Math.max(1, now - remotePlayer._lastStateTime); // 毫秒
                const newVelocityX = (targetX - remotePlayer._lastStateX) / timeDelta * 1000; // 像素/秒
                const newVelocityY = (targetY - remotePlayer._lastStateY) / timeDelta * 1000;

                // 平滑速度（避免突然變化）
                const velocityLerp = 0.3; // 速度平滑係數
                remotePlayer._velocityX = remotePlayer._velocityX * (1 - velocityLerp) + newVelocityX * velocityLerp;
                remotePlayer._velocityY = remotePlayer._velocityY * (1 - velocityLerp) + newVelocityY * velocityLerp;

                // ✅ 標準做法：使用很小的插值係數（0.1-0.2），讓移動更直接、不飄
                // 這是所有連線遊戲的標準做法
                const lerpFactor = Math.min(0.2, Math.max(0.1, distance / 50)); // 很小的插值係數
                remotePlayer.x = remotePlayer.x + (targetX - remotePlayer.x) * lerpFactor;
                remotePlayer.y = remotePlayer.y + (targetY - remotePlayer.y) * lerpFactor;

                // 更新狀態追蹤
                remotePlayer._lastStateTime = now;
                remotePlayer._lastStateX = targetX;
                remotePlayer._lastStateY = targetY;
              } else {
                // 距離很小，直接設置（避免微小抖動）
                remotePlayer.x = targetX;
                remotePlayer.y = targetY;
                remotePlayer._velocityX = 0;
                remotePlayer._velocityY = 0;
                remotePlayer._lastStateTime = now;
                remotePlayer._lastStateX = targetX;
                remotePlayer._lastStateY = targetY;
              }
            }
            // ✅ 修復：更新其他狀態（確保血量正確同步）
            if (typeof p.health === "number") {
              remotePlayer.health = Math.max(0, Math.min(p.health, p.maxHealth || remotePlayer.maxHealth || 100));
            }
            if (typeof p.maxHealth === "number") remotePlayer.maxHealth = p.maxHealth;
            if (typeof p.energy === "number") remotePlayer.energy = p.energy;
            if (typeof p.maxEnergy === "number") remotePlayer.maxEnergy = p.maxEnergy;
            if (typeof p.level === "number") remotePlayer.level = p.level;
            if (typeof p.exp === "number") remotePlayer.experience = p.exp;
            // ✅ 修复：遠程玩家的 experienceToNextLevel 可以從服務器同步（不影響本地玩家）
            // 注意：本地玩家的 experienceToNextLevel 由客户端管理，不受服务器影响
            if (typeof p.expToNext === "number" && remotePlayer !== Game.player) {
              remotePlayer.experienceToNextLevel = p.expToNext;
            }
            if (typeof p._isDead === "boolean") remotePlayer._isDead = p._isDead;
            if (typeof p._resurrectionProgress === "number") remotePlayer._resurrectionProgress = p._resurrectionProgress;
            if (typeof p.isUltimateActive === "boolean") remotePlayer.isUltimateActive = p.isUltimateActive;
            if (typeof p.ultimateImageKey === "string" && p.ultimateImageKey) remotePlayer._ultimateImageKey = p.ultimateImageKey;
            if (typeof p.ultimateEndTime === "number") remotePlayer.ultimateEndTime = p.ultimateEndTime;
            if (typeof p.width === "number" && p.width > 0) remotePlayer.width = p.width;
            if (typeof p.height === "number" && p.height > 0) remotePlayer.height = p.height;
            if (typeof p.collisionRadius === "number" && p.collisionRadius > 0) remotePlayer.collisionRadius = p.collisionRadius;
            // ✅ MMORPG 架構：同步玩家朝向（確保遠程玩家朝向正確）
            if (typeof p.facingRight === "boolean") remotePlayer.facingRight = p.facingRight;
            if (typeof p.facingAngle === "number") remotePlayer.facingAngle = p.facingAngle;

            // ✅ 單機元素：玩家受傷紅閃不應同步到遠程玩家（只對本地玩家顯示）
            // 根據 master plan，玩家受傷紅閃是單機元素，不應透過網路廣播
            // 遠程玩家的受傷視覺效果應該由伺服器 hitEvents 或其他多人元素處理

            // ✅ MMORPG 架構：同步共享的金幣和經驗值到本地玩家
            // ⚠️ 注意：這是 LEGACY 代碼（M3 架構），權威多人已由伺服器 game-state 取代
            // 但為了兼容性，仍然保留這個邏輯，只在 session 初始化時同步
            // 經驗值同步應該由 handleServerGameState 處理（使用 gainExperience），這裡不應該直接設置
            if (typeof p.coins === "number" && typeof Game !== "undefined") {
              // 使用其他玩家的金幣數量（因為金幣是共享的）
              Game.coins = Math.max(0, Math.floor(p.coins));
              // 更新金幣顯示
              if (typeof UI !== "undefined" && UI.updateCoinsDisplay) {
                UI.updateCoinsDisplay(Game.coins);
              }
            }
            // ⚠️ 修復：經驗值同步應該由 handleServerGameState 處理（使用 gainExperience），這裡不應該直接設置
            // 直接設置 Game.player.experience 會繞過 gainExperience 的升級檢查和音效播放
            // 只有在 session 初始化時才同步 experienceToNextLevel（如果還沒有被 handleServerGameState 處理）
            if (typeof Game !== "undefined" && Game.player && typeof p.exp === "number") {
              // ✅ 修復：只有在 session 初始化時才同步 experienceToNextLevel
              // 之後完全由客戶端管理（通過 gainExperience 和 levelUp()），與單機一致
              // ⚠️ 注意：經驗值同步應該由 handleServerGameState 處理，這裡不應該直接設置 Game.player.experience
              if (!_sessionCountersPrimed && typeof p.expToNext === "number") {
                Game.player.experienceToNextLevel = p.expToNext;
              }
              // ⚠️ 不應該直接設置 Game.player.experience，應該由 handleServerGameState 處理
              // Game.player.experience = p.exp; // 已移除，由 handleServerGameState 處理
            }

            // 確保角色圖片正確設置（如果角色ID存在但圖片未設置）
            if (characterId && !remotePlayer.spriteImageKey) {
              try {
                if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS) {
                  const char = CONFIG.CHARACTERS.find(c => c && c.id === characterId);
                  if (char && char.spriteImageKey) {
                    remotePlayer.spriteImageKey = char.spriteImageKey;
                    console.log(`[SurvivalOnline] onStateMessage: 設置遠程玩家 ${uid} 的角色圖片為 ${char.spriteImageKey}`);
                  }
                }
              } catch (e) {
                console.warn(`[SurvivalOnline] onStateMessage: 設置角色圖片失敗:`, e);
              }
            }
          } else {
            console.error(`[SurvivalOnline] onStateMessage: RemotePlayerManager.getOrCreate 返回 null 或 undefined for ${uid}`);
          }
        } else {
          console.error(`[SurvivalOnline] onStateMessage: RemotePlayerManager 或 getOrCreate 不可用`);
        }
      } catch (e) {
        console.error(`[SurvivalOnline] 創建/更新遠程玩家失敗:`, e);
      }
    }

    // 保存位置信息（用於其他用途）
    for (const [uid, p] of Object.entries(players)) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      if (_uid && uid === _uid) continue; // 不覆蓋自己
      remotePlayers.set(uid, {
        x: p.x,
        y: p.y,
        name: typeof p.name === "string" ? p.name : uid.slice(0, 6),
        characterId: (typeof p.characterId === "string") ? p.characterId : null, // 保存角色ID
        // 大招狀態同步
        isUltimateActive: (typeof p.isUltimateActive === "boolean") ? p.isUltimateActive : false,
        ultimateImageKey: (typeof p.ultimateImageKey === "string" && p.ultimateImageKey) ? p.ultimateImageKey : null,
        ultimateEndTime: (typeof p.ultimateEndTime === "number") ? p.ultimateEndTime : 0,
        width: (typeof p.width === "number" && p.width > 0) ? p.width : null,
        height: (typeof p.height === "number" && p.height > 0) ? p.height : null,
        collisionRadius: (typeof p.collisionRadius === "number" && p.collisionRadius > 0) ? p.collisionRadius : null,
        // 死亡和復活狀態同步
        _isDead: (typeof p._isDead === "boolean") ? p._isDead : false,
        health: (typeof p.health === "number") ? p.health : 100,
        maxHealth: (typeof p.maxHealth === "number") ? p.maxHealth : 100,
        _resurrectionProgress: (typeof p._resurrectionProgress === "number") ? p._resurrectionProgress : 0,
        updatedAt: now,
      });
    }
    // 清掉過期（避免斷線殘留）
    for (const [uid, p] of remotePlayers) {
      if (now - (p.updatedAt || 0) > 8000) {
        remotePlayers.delete(uid);
        // 移除遠程玩家對象
        try {
          if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.remove === "function") {
            RemotePlayerManager.remove(uid);
          }
        } catch (_) { }
        // 隱藏對應的GIF覆蓋層
        try {
          if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.hide === 'function') {
            window.GifOverlay.hide(`remote-player-${uid}`);
          }
        } catch (_) { }
      }
    }
  }

  // M2：處理事件（客戶端接收室長廣播的事件）
  function onEventMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.t !== "event") return;
    const eventType = payload.type;
    const eventData = payload.data || {};

    try {
      // ✅ 權威伺服器模式：多人進行中（multiplayer.enabled）時，禁止用 event 生成/更新「世界實體」
      // 這些實體（敵人/經驗球/寶箱/標準投射物/BOSS投射物/波次）應由 server game-state 統一權威下發，
      // 否則會與 updateEnemiesFromServer/updateProjectilesFromServer 等路徑互打，導致「越修越多 bug」。
      // ⚠️ 修復：projectile_spawn 事件應該被允許，因為它用於視覺效果（雷射、連鎖閃電、斬擊等），不是世界實體
      try {
        const isServerAuthoritative = (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled);
        if (isServerAuthoritative) {
          if (
            eventType === "wave_start" ||
            eventType === "enemy_spawn" ||
            eventType === "boss_spawn" ||
            eventType === "exp_orb_spawn" ||
            eventType === "chest_spawn" ||
            eventType === "boss_projectile_spawn" ||
            // ⚠️ 修復：projectile_spawn 不應該被阻止，因為它用於視覺效果（雷射、連鎖閃電、斬擊等）
            // 這些視覺效果不是世界實體，不需要伺服器權威，只需要同步給其他玩家看
            // eventType === "projectile_spawn" || // ❌ 移除：允許 projectile_spawn 事件
            // ✅ 伺服器權威：粒子/鏡頭效果也不走 event（避免各端不同步/刷流量）
            eventType === "explosion_particles" ||
            eventType === "screen_effect" ||
            // ✅ 伺服器權威：勝利/失敗/出口/經驗球被撿取，改走 state.isVictory/state.isGameOver/state.exit/state.experienceOrbs
            // 避免舊 event 通道復活造成互打與循環。
            // ⚠️ 修復：game_over 事件不應該被過濾，因為它需要觸發 UI.showGameOverScreen()
            // 雖然 state.isGameOver 也會觸發 Game.gameOver()，但 event 通道是備用路徑，確保遊戲結束畫面一定會顯示
            eventType === "exit_spawn" ||
            eventType === "game_victory" ||
            // eventType === "game_over" || // ❌ 移除：允許 game_over 事件通過，確保遊戲結束畫面一定會顯示
            eventType === "exp_orb_collected" ||
            eventType === "ultimate_pineapple_spawn" ||
            eventType === "obstacles_spawn" ||
            eventType === "decorations_spawn"
          ) {
            return;
          }
        }
      } catch (_) { }

      // 根據事件類型執行輕量模擬
      if (eventType === "wave_start") {
        // ✅ 真正的MMORPG：波次開始 - 同步波次開始時間，確保所有客戶端在同一時間生成相同的敵人
        if (typeof WaveSystem !== "undefined" && WaveSystem.currentWave !== undefined) {
          const syncedWave = eventData.wave || 1;
          // ✅ 真正的MMORPG：優先使用 eventData.timestamp（從 wave_start 事件傳遞），其次使用 payload.timestamp
          const syncedStartTime = (eventData.timestamp && typeof eventData.timestamp === "number")
            ? eventData.timestamp
            : (payload.timestamp && typeof payload.timestamp === "number")
              ? payload.timestamp
              : Date.now();
          console.log(`[SurvivalOnline] 同步波次開始: wave=${syncedWave}, startTime=${syncedStartTime}, 本地時間=${Date.now()}, 時間差=${Date.now() - syncedStartTime}ms`);
          WaveSystem.currentWave = syncedWave;
          WaveSystem.waveStartTime = syncedStartTime; // ✅ 使用同步的時間，而不是本地時間
          WaveSystem.lastEnemySpawnTime = syncedStartTime; // ✅ 重置敵人生成時間，確保從波次開始時間計算
          if (typeof UI !== "undefined" && UI.updateWaveInfo) {
            UI.updateWaveInfo(WaveSystem.currentWave);
          }
        }
      } else if (eventType === "enemy_spawn") {
        // 客戶端生成敵人（與單機一致，客戶端也應該能看到和攻擊敵人）
        try {
          const EnemyCtor = _getGlobalCtor("Enemy");
          if (typeof Game !== "undefined" && EnemyCtor && eventData.type && eventData.x !== undefined && eventData.y !== undefined) {
            // 檢查是否已存在相同ID的敵人（避免重複生成）
            const enemyId = eventData.id || `enemy_${Date.now()}_${Math.random()}`;
            const existingEnemy = Game.enemies.find(e => e.id === enemyId);
            if (!existingEnemy) {
              const enemy = new EnemyCtor(eventData.x, eventData.y, eventData.type);
              enemy.id = enemyId; // 使用室長端提供的ID，確保同步
              Game.enemies.push(enemy);
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 客戶端生成敵人失敗:", e);
        }
      } else if (eventType === "boss_spawn") {
        // 隊員生成BOSS（與單機一致，隊員也應該能看到和攻擊BOSS）
        try {
          const EnemyCtor = _getGlobalCtor("Enemy");
          if (typeof Game !== "undefined" && EnemyCtor && eventData.type && eventData.x !== undefined && eventData.y !== undefined) {
            const boss = new EnemyCtor(eventData.x, eventData.y, eventData.type);
            boss.id = eventData.id || `boss_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            Game.enemies.push(boss);
            Game.boss = boss; // 設置BOSS引用
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 隊員生成BOSS失敗:", e);
        }
      } else if (eventType === "exp_orb_spawn") {
        // 隊員生成經驗球（與單機一致，隊員也應該能看到和收集經驗球）
        try {
          const ExperienceOrbCtor = _getGlobalCtor("ExperienceOrb");
          if (typeof Game !== "undefined" && ExperienceOrbCtor && eventData.x !== undefined && eventData.y !== undefined) {
            const value = (typeof eventData.value === "number") ? eventData.value : (typeof CONFIG !== "undefined" && CONFIG.EXPERIENCE && CONFIG.EXPERIENCE.VALUE) ? CONFIG.EXPERIENCE.VALUE : 10;
            const orb = new ExperienceOrbCtor(eventData.x, eventData.y, value);
            Game.experienceOrbs.push(orb);
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 隊員生成經驗球失敗:", e);
        }
      } else if (eventType === "chest_spawn") {
        // ✅ LEGACY：此邏輯應已被權威伺服器模式禁用（line 933 會 return）
        // 權威伺服器模式下，寶箱由 server game-state 的 state.chests 同步，不應通過 event 生成
        // 保留此邏輯僅為向後兼容（非權威模式），但實際上應該不會被執行
        try {
          const ChestCtor = _getGlobalCtor("Chest");
          if (typeof Game !== "undefined" && ChestCtor && eventData.x !== undefined && eventData.y !== undefined) {
            const chest = new ChestCtor(eventData.x, eventData.y);
            Game.chests.push(chest);
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 生成寶箱失敗:", e);
        }
      } else if (eventType === "chest_collected") {
        // ✅ C：寶箱屬於競技（誰撿到誰拿）
        // - 所有人：移除寶箱（避免重複撿取/殘留）
        // - 只有撿到的人：NORMAL → 開升級選單；PINEAPPLE → 回報 award_exp（共享經驗，所以誰撿到都沒差）
        try {
          if (typeof Game === "undefined") return;

          const myUid = _getLocalNetUid ? _getLocalNetUid() : _uid;
          const collectorUid = (eventData && typeof eventData.collectorUid === "string") ? eventData.collectorUid : null;
          const chestId = (eventData && typeof eventData.chestId === "string") ? eventData.chestId : null;
          const chestType = (eventData && typeof eventData.chestType === "string") ? eventData.chestType : "NORMAL";
          const isPineapple = (chestType === "PINEAPPLE");

          // 1) 所有人：移除寶箱（優先用 id；向後相容用座標容差）
          const list = isPineapple ? Game.pineappleUltimatePickups : Game.chests;
          if (Array.isArray(list)) {
            let removed = false;
            if (chestId) {
              for (let i = list.length - 1; i >= 0; i--) {
                const c = list[i];
                if (c && c.id === chestId) {
                  try { if (typeof c.destroy === "function") c.destroy(); } catch (_) { }
                  list.splice(i, 1);
                  removed = true;
                  break;
                }
              }
            }
            if (!removed && typeof eventData.x === "number" && typeof eventData.y === "number") {
              const tolerance = 50;
              for (let i = list.length - 1; i >= 0; i--) {
                const c = list[i];
                if (!c) continue;
                const dx = (c.x || 0) - eventData.x;
                const dy = (c.y || 0) - eventData.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= tolerance) {
                  try { if (typeof c.destroy === "function") c.destroy(); } catch (_) { }
                  list.splice(i, 1);
                  break;
                }
              }
            }
          }

          // 2) 只有撿到的人拿獎勵（含音效）：多人下音效視為單機元素 → 必須明確是自己才允許
          const isCollector = (collectorUid && collectorUid === myUid);
          if (!isCollector) return;

          if (isPineapple) {
            // ✅ 鳳梨掉落：共享經驗（伺服器權威 counter）；回報 amount（與單機同源：50 + 30% 當下所需升級經驗）
            // ✅ 確保只在生存模式且多人模式下發送
            try {
              let isSurvivalMode = false;
              try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                  ? GameModeManager.getCurrent()
                  : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                      ? ModeManager.getActiveModeId()
                      : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null);
              } catch (_) { }
              const p = Game.player;
              if (p && isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled && typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === "function") {
                const base = 50;
                let needNow = 0;
                try {
                  if (typeof p.experienceToNextLevel === "number" && typeof p.experience === "number") {
                    needNow = Math.max(0, Math.floor(p.experienceToNextLevel - p.experience));
                  }
                } catch (_) { }
                const bonus = Math.max(0, Math.floor(needNow * 0.30));
                const amount = base + bonus;
                window.SurvivalOnlineRuntime.sendToNet({ type: "award_exp", amount, chestId });
              }
            } catch (_) { }
          } else {
            // ✅ NORMAL 寶箱：只讓撿到的人開升級選單（候選技能仍走單機 UI.getUpgradeOptions → 自動套用成就/解鎖）
            // ✅ 修復：寶箱升級也需要經過隊列系統，避免與經驗升級重疊
            try { if (typeof AudioManager !== "undefined" && AudioManager.playSound) AudioManager.playSound("level_up"); } catch (_) { }
            try { 
              if (typeof UI !== "undefined" && UI.showLevelUpMenu) {
                // ✅ 修復：showLevelUpMenu 會檢查隊列，如果菜單正在顯示，會加入隊列
                // 這樣可以確保寶箱升級和經驗升級都不會重疊
                // ⚠️ 關鍵：寶箱升級直接調用 showLevelUpMenu，會自動加入隊列（如果菜單正在顯示）
                // 如果菜單未顯示，會直接顯示菜單
                UI.showLevelUpMenu();
              }
            } catch (_) { }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 處理寶箱被撿取事件失敗:", e);
        }
      } else if (eventType === "explosion_particles") {
        // ✅ MMORPG 架構：所有玩家都能看到爆炸粒子效果
        try {
          if (typeof Game !== "undefined" && Array.isArray(eventData.particles)) {
            if (!Game.explosionParticles) Game.explosionParticles = [];
            for (const particleData of eventData.particles) {
              if (particleData.x !== undefined && particleData.y !== undefined) {
                Game.explosionParticles.push({
                  x: particleData.x,
                  y: particleData.y,
                  vx: particleData.vx || 0,
                  vy: particleData.vy || 0,
                  life: particleData.life || 1000,
                  maxLife: particleData.maxLife || 1000,
                  size: particleData.size || 3,
                  color: particleData.color || '#ff0000',
                  source: particleData.source || null
                });
              }
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 生成爆炸粒子失敗:", e);
        }
      } else if (eventType === "enemy_death") {
        // ✅ MMORPG 架構：所有玩家都能看到敵人死亡動畫
        try {
          if (typeof Game !== "undefined" && eventData.enemyId && Array.isArray(Game.enemies)) {
            const enemy = Game.enemies.find(e => e && e.id === eventData.enemyId);
            if (enemy && !enemy.isDying) {
              // 觸發敵人死亡動畫
              enemy.isDying = true;
              enemy.deathElapsed = 0;
              enemy.collisionRadius = 0;
              if (typeof eventData.deathVelX === 'number') enemy.deathVelX = eventData.deathVelX;
              if (typeof eventData.deathVelY === 'number') enemy.deathVelY = eventData.deathVelY;
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 處理敵人死亡事件失敗:", e);
        }
      } else if (eventType === "screen_effect") {
        // ✅ LEGACY：此邏輯應已被權威伺服器模式禁用（line 946 會 return）
        // 但為了安全起見，這裡也添加 playerUid 檢查，確保相機震動只對自己生效
        try {
          if (typeof Game !== "undefined" && eventData.type) {
            // 處理屏幕閃光（多人元素：所有人都能看到）
            if (eventData.screenFlash && typeof eventData.screenFlash === 'object') {
              if (!Game.screenFlash) {
                Game.screenFlash = { active: false, intensity: 0, duration: 0 };
              }
              Game.screenFlash.active = eventData.screenFlash.active || false;
              Game.screenFlash.intensity = eventData.screenFlash.intensity || 0.3;
              Game.screenFlash.duration = eventData.screenFlash.duration || 150;
            }

            // ✅ 單機元素：相機震動只對自己生效（根據 master plan）
            if (eventData.cameraShake && typeof eventData.cameraShake === 'object') {
              const me = _getLocalNetUid ? _getLocalNetUid() : _uid;
              // 只處理自己的相機震動（playerUid === me）
              if (eventData.playerUid && eventData.playerUid === me) {
                if (!Game.cameraShake) {
                  Game.cameraShake = { active: false, intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
                }
                Game.cameraShake.active = eventData.cameraShake.active || false;
                Game.cameraShake.intensity = eventData.cameraShake.intensity || 8;
                Game.cameraShake.duration = eventData.cameraShake.duration || 200;
              }
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 處理屏幕效果失敗:", e);
        }
      } else if (eventType === "obstacles_spawn") {
        // ✅ MMORPG 架構：所有玩家都能看到相同的障礙物
        try {
          const ObstacleCtor = _getGlobalCtor("Obstacle");
          if (typeof Game !== "undefined" && Array.isArray(eventData.obstacles) && ObstacleCtor) {
            // 清除現有障礙物（避免重複）
            Game.obstacles = [];

            // 生成障礙物
            for (const obsData of eventData.obstacles) {
              if (obsData.x !== undefined && obsData.y !== undefined && obsData.imageKey) {
                const obstacle = new ObstacleCtor(obsData.x, obsData.y, obsData.imageKey, obsData.size || 150);
                Game.obstacles.push(obstacle);
              }
            }

            // 標記為已生成，避免重複生成
            if (Game._obstaclesAndDecorationsSpawned !== undefined) {
              Game._obstaclesAndDecorationsSpawned = true;
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 生成障礙物失敗:", e);
        }
      } else if (eventType === "decorations_spawn") {
        // ✅ MMORPG 架構：所有玩家都能看到相同的地圖裝飾
        try {
          if (typeof Game !== "undefined" && Array.isArray(eventData.decorations)) {
            // 清除現有裝飾（避免重複）
            Game.decorations = [];

            // 生成裝飾
            for (const decoData of eventData.decorations) {
              if (decoData.x !== undefined && decoData.y !== undefined && decoData.imageKey) {
                Game.decorations.push({
                  x: decoData.x,
                  y: decoData.y,
                  width: decoData.width || 100,
                  height: decoData.height || 100,
                  imageKey: decoData.imageKey
                });
              }
            }

            // 標記為已生成，避免重複生成
            if (Game._obstaclesAndDecorationsSpawned !== undefined) {
              Game._obstaclesAndDecorationsSpawned = true;
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 生成地圖裝飾失敗:", e);
        }
      } else if (eventType === "boss_projectile_spawn") {
        // ✅ MMORPG 架構：所有玩家都能看到BOSS遠程攻擊投射物
        try {
          if (typeof Game !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            if (eventData.type === 'BOTTLE' && typeof BottleProjectile !== 'undefined') {
              // 路口 HUMAN2：拋物線投擲瓶子
              const p = new BottleProjectile(
                eventData.x,
                eventData.y,
                eventData.targetX || eventData.x,
                eventData.targetY || eventData.y,
                eventData.speed || 5,
                eventData.damage || 10,
                eventData.width || 10,
                eventData.height || 14
              );
              if (!Game.bossProjectiles) Game.bossProjectiles = [];
              Game.bossProjectiles.push(p);
            } else if (eventData.type === 'BOSS_PROJECTILE' && typeof BossProjectile !== 'undefined') {
              // BOSS 火彈投射物
              const projectile = new BossProjectile(
                eventData.x,
                eventData.y,
                eventData.angle || 0,
                eventData.speed || 5,
                eventData.damage || 10,
                eventData.size || 20,
                eventData.homing || false,
                eventData.turnRate || 0
              );
              if (!Game.bossProjectiles) Game.bossProjectiles = [];
              Game.bossProjectiles.push(projectile);
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 生成BOSS投射物失敗:", e);
        }
      } else if (eventType === "chest_spawn") {
        // ✅ LEGACY：此邏輯應已被權威伺服器模式禁用（line 933 會 return）
        // 權威伺服器模式下，寶箱由 server game-state 的 state.chests 同步，不應通過 event 生成
        // 保留此邏輯僅為向後兼容（非權威模式），但實際上應該不會被執行
        // 注意：此處理與 line 1015 的重複，但使用 eventData.id（更完整）
        try {
          if (typeof Game !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            const chest = new Chest(eventData.x, eventData.y, eventData.id); // 使用傳入的ID
            if (!Game.chests) Game.chests = [];
            Game.chests.push(chest);
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 生成寶箱失敗:", e);
        }
      } else if (eventType === "ultimate_pineapple_spawn") {
        // ✅ MMORPG 架構：所有玩家都能生成鳳梨大絕掉落物（由主機通知，帶唯一ID）
        try {
          if (typeof Game !== "undefined" && typeof Game.spawnPineappleUltimatePickup === "function" && eventData.x !== undefined && eventData.y !== undefined) {
            const opts = eventData.opts || {};
            if (eventData.id) opts.id = eventData.id; // 確保ID傳遞
            Game.spawnPineappleUltimatePickup(eventData.x, eventData.y, opts);
          }
        } catch (_) { }
      } else if (eventType === "pineapple_pickup_collected") {
        // 舊版事件兼容（如果服務器還在發送舊事件，轉發給 chest_collected 邏輯或忽略）
        // 由於我們更新了服務器發送 chest_collected，這裡應該不會再收到，但保留為空以防萬一
      } else if (eventType === "exp_orb_collected") {
        // ✅ MMORPG 架構：所有玩家都能處理經驗球被撿取事件，移除經驗球
        try {
          if (typeof Game !== "undefined" && Array.isArray(Game.experienceOrbs) && eventData.x !== undefined && eventData.y !== undefined) {
            // 找到最接近的經驗球並移除（容差：50像素）
            const tolerance = 50;
            for (let i = Game.experienceOrbs.length - 1; i >= 0; i--) {
              const orb = Game.experienceOrbs[i];
              if (orb && !orb.markedForDeletion) {
                const dist = Math.sqrt(Math.pow(orb.x - eventData.x, 2) + Math.pow(orb.y - eventData.y, 2));
                if (dist <= tolerance) {
                  orb.destroy();
                  Game.experienceOrbs.splice(i, 1);
                  break;
                }
              }
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 處理經驗球被撿取事件失敗:", e);
        }
      } else if (eventType === "damage_number") {
        // ✅ 腫瘤切除：傷害數字改走伺服器 hitEvents（server/game-state.js），不再處理 damage_number 事件
        // 這個事件處理已廢棄，傷害數字現在由 handleServerGameState 中的 hitEvents 統一處理
      } else if (eventType === "projectile_spawn") {
        // ✅ 真正的MMORPG：所有玩家都能看到其他玩家的技能特效
        // 隊員端生成投射物視覺效果（僅視覺，不影響傷害計算）
        console.log(`[SurvivalOnline] onEventMessage: 收到投射物生成事件, weaponType=${eventData.weaponType}, x=${eventData.x}, y=${eventData.y}`);
        try {
          if (typeof Game !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            // ⚠️ 修復：檢查是否已存在相同ID或相同類型的持續效果（避免重複生成導致圖層重疊）
            const projectileId = eventData.id || `projectile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const weaponType = eventData.weaponType || "UNKNOWN";
            const playerUid = eventData.playerUid || null;
            
            // ⚠️ 修復：區分持續效果和一次性效果
            // 持續效果（AURA_FIELD、ORBIT等）：應該只創建一次，之後更新
            // 一次性效果（SLASH、LASER、CHAIN_LIGHTNING、INVINCIBLE等）：每次 fire() 都創建新的（與單機一致）
            // ✅ 修復：INVINCIBLE 是一次性效果（持續幾秒後消失，然後又持續幾秒後消失，很像是變長的斬擊）
            // 守護領域是永久常駐，無敵是持續幾秒後消失，所以無敵應該像斬擊一樣，每次施放都創建新的效果
            const isPersistentEffect = (
              weaponType === 'AURA_FIELD' || weaponType === 'GRAVITY_WAVE' || weaponType === 'ORBIT' ||
              weaponType === 'CHICKEN_BLESSING' || weaponType === 'ROTATING_MUFFIN' || weaponType === 'HEART_COMPANION' ||
              weaponType === 'PINEAPPLE_ORBIT' || weaponType === 'RADIANT_GLORY' || weaponType === 'MIND_MAGIC'
            );
            // ⚠️ 修復：LASER、CHAIN_LIGHTNING、SLASH、INVINCIBLE 是一次性效果，每次 fire() 都創建新的（與單機一致）
            // 不應該被標記為持續效果，否則會導致去重邏輯錯誤
            
            let existingProjectile = null;
            if (isPersistentEffect && playerUid) {
              // ⚠️ 修復：對於持續效果，檢查是否已存在相同類型和玩家的效果
              // 需要檢查本地玩家（playerUid === Game.multiplayer.uid）和遠程玩家
              const isLocalPlayer = (playerUid === (Game.multiplayer && Game.multiplayer.uid));
              existingProjectile = Game.projectiles.find(p => {
                if (p.weaponType !== weaponType) return false;
                // 檢查是否是同一個玩家的效果
                if (isLocalPlayer) {
                  // 本地玩家：檢查是否是本地玩家創建的效果（沒有 _remotePlayerUid 或 player === Game.player）
                  return (!p._remotePlayerUid && p.player === Game.player) || 
                         (p._remotePlayerUid === playerUid) || 
                         (p.player && p.player === Game.player);
                } else {
                  // 遠程玩家：檢查 _remotePlayerUid 或 player._remoteUid
                  return (p._remotePlayerUid === playerUid) || 
                         (p.player && p.player._remoteUid === playerUid);
                }
              });
            } else {
              // ⚠️ 修復：對於一次性效果（SLASH、LASER、CHAIN_LIGHTNING、INVINCIBLE），不應該檢查ID
              // 因為每次 fire() 都會創建新的效果，即使 ID 相同也應該創建新的（與單機一致）
              // 只對持續效果檢查 ID（避免重複創建）
              // ✅ 修復：INVINCIBLE 是一次性效果（持續幾秒後消失），應該像斬擊一樣，每次施放都創建新的
              const isOneTimeEffect = (
                weaponType === 'SLASH' || weaponType === 'FRENZY_SLASH' ||
                weaponType === 'LASER' || weaponType === 'CHAIN_LIGHTNING' || weaponType === 'FRENZY_LIGHTNING' ||
                weaponType === 'INVINCIBLE' // ✅ 修復：無敵技能是一次性效果，每次施放都創建新的（像斬擊一樣）
              );
              if (!isOneTimeEffect) {
                // 對於非一次性效果，檢查ID
                existingProjectile = Game.projectiles.find(p => p.id === projectileId);
              }
              // 對於一次性效果，不檢查 existingProjectile，允許創建新的
            }
            
            // ⚠️ 修復：如果已存在持續效果，更新它而不是創建新的（避免重複疊加）
            // 注意：一次性效果（SLASH、LASER、CHAIN_LIGHTNING、INVINCIBLE）不應該更新，應該創建新的（與單機一致）
            // ✅ 修復：INVINCIBLE 是一次性效果，每次施放都創建新的（像斬擊一樣），不應該更新現有效果
            if (existingProjectile && isPersistentEffect) {
              // 更新現有效果的屬性（位置、角度、半徑等）
              try {
                if (typeof eventData.x === "number") existingProjectile.x = eventData.x;
                if (typeof eventData.y === "number") existingProjectile.y = eventData.y;
                if (typeof eventData.angle === "number") existingProjectile.angle = eventData.angle;
                if (typeof eventData.radius === "number") existingProjectile.radius = eventData.radius;
                if (typeof eventData.duration === "number") existingProjectile.duration = eventData.duration;
                if (typeof eventData.durationMs === "number") existingProjectile.durationMs = eventData.durationMs;
                // 更新玩家引用（確保位置正確）
                if (eventData.playerUid) {
                  const isLocalPlayer = (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid));
                  if (isLocalPlayer && Game.player) {
                    existingProjectile.player = Game.player;
                  } else {
                    const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                    if (rt && rt.RemotePlayerManager && typeof rt.RemotePlayerManager.get === 'function') {
                      const remotePlayer = rt.RemotePlayerManager.get(eventData.playerUid);
                      if (remotePlayer) {
                        existingProjectile.player = remotePlayer;
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn('[SurvivalOnline] 更新現有持續效果失敗:', e);
              }
              // 已更新現有效果，不需要創建新的
              return;
            }
            
            if (!existingProjectile) {
              // 根據武器類型創建對應的投射物
              if (weaponType === "ORBIT" || weaponType === "CHICKEN_BLESSING" || weaponType === "ROTATING_MUFFIN" || weaponType === "HEART_COMPANION" || weaponType === "PINEAPPLE_ORBIT") {
                // 環繞投射物：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // 使用 RemotePlayerManager 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer && typeof OrbitBall !== "undefined") {
                  const imageKey = (weaponType === "CHICKEN_BLESSING") ? "chicken" :
                    (weaponType === "ROTATING_MUFFIN") ? "muffin" :
                      (weaponType === "HEART_COMPANION") ? "heart" :
                        (weaponType === "PINEAPPLE_ORBIT") ? "pineapple" : "lightning";
                  const initialAngle = eventData.angle || 0;
                  // ✅ 修復：使用從單機模式廣播的 radius、angularSpeed、size、duration，確保與單機模式一致
                  // 單機模式中，這些值會根據等級動態計算（radius、size 隨等級增長，angularSpeed 隨等級線性增長）
                  const radius = eventData.radius || 60;
                  const angularSpeed = eventData.angularSpeed || 6.283;
                  const size = eventData.size || 20;
                  const duration = eventData.duration || 3000;
                  const orb = new OrbitBall(
                    targetPlayer,
                    initialAngle,
                    radius,
                    0, // 傷害設為0（僅視覺）
                    size,
                    duration,
                    angularSpeed,
                    imageKey
                  );
                  orb.id = projectileId;
                  orb._isVisualOnly = true;
                  orb._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(orb);
                }
              } else if (weaponType === "LASER" && typeof LaserBeam !== "undefined") {
                // 雷射：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // 使用 RemotePlayerManager 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ⚠️ 修復：檢查是否已經存在相同 ID 的雷射，避免重複添加導致圖層重疊
                  const existingBeam = Game.projectiles.find(p => p.id === projectileId && p.weaponType === 'LASER');
                  if (!existingBeam) {
                    // ⚠️ 修復：使用與單機一致的默認值（CONFIG.LASER.DURATION = 2000）
                    // 單機模式：使用 this.config.DURATION（預設 2000ms）
                    const beam = new LaserBeam(
                      targetPlayer,
                      eventData.angle || 0,
                      0, // 傷害設為0（僅視覺）
                      eventData.width || 8,
                      eventData.duration || 2000, // ✅ 與單機一致：使用 CONFIG.LASER.DURATION（2000ms）
                      eventData.tickInterval || 120 // ✅ 與單機一致：使用 CONFIG.LASER.TICK_INTERVAL_MS（120ms）
                    );
                    beam.id = projectileId;
                    beam._isVisualOnly = true;
                    beam._remotePlayerUid = eventData.playerUid;
                    Game.projectiles.push(beam);
                  } else {
                    // 如果已存在，更新位置和角度（避免重複創建）
                    existingBeam.player = targetPlayer;
                    existingBeam.angle = eventData.angle || 0;
                  }
                }
              } else if (weaponType === "MIND_MAGIC" && typeof ShockwaveEffect !== "undefined") {
                // 震波：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // 使用 RemotePlayerManager 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ 修復：使用與單機一致的默認值（CONFIG.MIND_MAGIC.DURATION = 2000）
                  const shockwave = new ShockwaveEffect(
                    targetPlayer,
                    0, // 傷害設為0（僅視覺）
                    eventData.duration || 2000, // ✅ 與單機一致：使用 CONFIG.MIND_MAGIC.DURATION（2000ms）
                    eventData.maxRadius || 220,
                    eventData.ringWidth || 18,
                    eventData.palette || null
                  );
                  shockwave.id = projectileId;
                  shockwave._isVisualOnly = true;
                  shockwave._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(shockwave);
                }
              } else if (weaponType === "SUMMON_AI" && typeof AICompanion !== "undefined") {
                // 召喚AI：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // 使用 RemotePlayerManager 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // 檢查是否已存在該玩家的 AICompanion（避免重複創建）
                  const existingAI = Game.projectiles.find(p =>
                    p && p.constructor && p.constructor.name === 'AICompanion' &&
                    p._remotePlayerUid === eventData.playerUid
                  );

                  if (!existingAI) {
                    const ai = new AICompanion(
                      targetPlayer,
                      eventData.x || targetPlayer.x,
                      eventData.y || targetPlayer.y,
                      eventData.summonAILevel || 1
                    );
                    ai.id = projectileId;
                    // ✅ MMORPG架构：远程玩家的AI也应该造成伤害（每个玩家的AI独立计算伤害）
                    // 不标记为_isVisualOnly，让每个玩家的AI都能独立计算伤害并叠加
                    ai._remotePlayerUid = eventData.playerUid;
                    // ✅ 修复：确保AI的player引用正确设置
                    ai.player = targetPlayer;
                    Game.projectiles.push(ai);
                    console.log('[SurvivalOnline] AI创建成功:', {
                      playerUid: eventData.playerUid,
                      aiId: ai.id,
                      x: ai.x,
                      y: ai.y,
                      summonAILevel: ai.summonAILevel
                    });
                  } else {
                    // 更新現有 AI 的位置和等級
                    existingAI.x = eventData.x || existingAI.x;
                    existingAI.y = eventData.y || existingAI.y;
                    if (typeof eventData.summonAILevel === "number") {
                      existingAI.summonAILevel = eventData.summonAILevel;
                    }
                    // ✅ 修复：确保AI的player引用始终是最新的
                    existingAI.player = targetPlayer;
                  }
                } else {
                  console.warn('[SurvivalOnline] AI创建失败: targetPlayer为null', {
                    playerUid: eventData.playerUid,
                    eventData: eventData
                  });
                }
              } else if ((weaponType === "CHAIN_LIGHTNING" || weaponType === "FRENZY_LIGHTNING") && typeof ChainLightningEffect !== "undefined") {
                // 連鎖閃電：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復：優先使用 RemotePlayerManager 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，嘗試使用 getRemotePlayers
                  if (!targetPlayer) {
                    const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                    if (rt && typeof rt.getRemotePlayers === 'function') {
                      const remotePlayers = rt.getRemotePlayers() || [];
                      const remotePlayer = remotePlayers.find(p => 
                        (p.uid === eventData.playerUid) || 
                        (p._remoteUid === eventData.playerUid) ||
                        (p._isRemotePlayer && p._remoteUid === eventData.playerUid)
                      );
                      if (remotePlayer) {
                        targetPlayer = remotePlayer;
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  if (weaponType === "CHAIN_LIGHTNING") {
                    // ⚠️ 修復：檢查是否已經存在相同 ID 的連鎖閃電，避免重複添加導致圖層重疊
                    const existingEffect = Game.projectiles.find(p => p.id === projectileId && (p.weaponType === 'CHAIN_LIGHTNING' || p.constructor && p.constructor.name === 'ChainLightningEffect'));
                    if (!existingEffect) {
                      // ✅ 單機同源：連鎖閃電是視覺效果，應該標記為 _isVisualOnly（傷害由伺服器權威處理）
                      // ⚠️ 修復：使用與單機一致的默認值（CONFIG.CHAIN_LIGHTNING.DURATION = 1000, CHAIN_RADIUS = 220）
                      // 單機模式：使用 this.config.DURATION || 1000 和 this.config.CHAIN_RADIUS || 220
                      const effect = new ChainLightningEffect(
                        targetPlayer,
                        0, // 傷害設為0（僅視覺，傷害由伺服器權威處理）
                        eventData.duration || 1000, // ✅ 與單機一致：使用 CONFIG.CHAIN_LIGHTNING.DURATION（1000ms）
                        eventData.maxChains || 0,
                        eventData.chainRadius || 220, // ✅ 與單機一致：使用 CONFIG.CHAIN_LIGHTNING.CHAIN_RADIUS（220）
                        eventData.palette || null
                      );
                      effect.id = projectileId;
                      effect._isVisualOnly = true; // ✅ 修復：標記為僅視覺，避免客戶端計算傷害
                      effect._remotePlayerUid = eventData.playerUid;
                      Game.projectiles.push(effect);
                    } else {
                      // 如果已存在，更新玩家引用（避免重複創建）
                      existingEffect.player = targetPlayer;
                    }
                  } else if (weaponType === "FRENZY_LIGHTNING" && typeof FrenzyLightningEffect !== "undefined") {
                    // ⚠️ 修復：檢查是否已經存在相同 ID 的狂熱雷擊，避免重複添加導致圖層重疊
                    const existingEffect = Game.projectiles.find(p => p.id === projectileId && (p.weaponType === 'FRENZY_LIGHTNING' || p.constructor && p.constructor.name === 'FrenzyLightningEffect'));
                    if (!existingEffect) {
                      // ✅ 單機同源：狂熱雷擊是視覺效果，應該標記為 _isVisualOnly（傷害由伺服器權威處理）
                      // ✅ 修復：使用與單機一致的默認值（CONFIG.FRENZY_LIGHTNING.CHAIN_RADIUS = 300）
                      const effect = new FrenzyLightningEffect(
                        targetPlayer,
                        0, // 傷害設為0（僅視覺，傷害由伺服器權威處理）
                        eventData.duration || 1000, // ✅ 與單機一致：使用 CONFIG.FRENZY_LIGHTNING.DURATION（1000ms）
                        eventData.branchCount || 10,
                        eventData.chainsPerBranch || 10,
                        eventData.chainRadius || 300, // ✅ 與單機一致：使用 CONFIG.FRENZY_LIGHTNING.CHAIN_RADIUS（300）
                        eventData.palette || null
                      );
                      effect.id = projectileId;
                      effect._isVisualOnly = true; // ✅ 修復：標記為僅視覺，避免客戶端計算傷害
                      effect._remotePlayerUid = eventData.playerUid;
                      Game.projectiles.push(effect);
                    } else {
                      // 如果已存在，更新玩家引用（避免重複創建）
                      existingEffect.player = targetPlayer;
                    }
                  }
                }
              } else if (weaponType === "SLASH" && typeof SlashEffect !== "undefined") {
                // 斬擊：需要找到對應的玩家（使用完整的 Player 對象，以便正確更新位置）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復：優先使用 RemotePlayerManager 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，嘗試使用 getRemotePlayers
                  if (!targetPlayer) {
                    const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                    if (rt && typeof rt.getRemotePlayers === 'function') {
                      const remotePlayers = rt.getRemotePlayers() || [];
                      const remotePlayer = remotePlayers.find(p => 
                        (p.uid === eventData.playerUid) || 
                        (p._remoteUid === eventData.playerUid) ||
                        (p._isRemotePlayer && p._remoteUid === eventData.playerUid)
                      );
                      if (remotePlayer) {
                        targetPlayer = remotePlayer;
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ 修復：使用與單機一致的默認值（CONFIG.SLASH）
                  const effect = new SlashEffect(
                    targetPlayer, // ✅ 修復：使用完整的 Player 對象，而不是只有 x, y
                    eventData.angle || 0,
                    0, // 傷害設為0（僅視覺）
                    eventData.radius || 252, // ✅ 與單機一致：使用 CONFIG.SLASH.RADIUS_BASE（252）
                    eventData.arcDeg || 365, // ✅ 與單機一致：使用 CONFIG.SLASH.ARC_DEG_BASE（365）
                    eventData.duration || 1200 // ✅ 與單機一致：使用 CONFIG.SLASH.DURATION（1200ms）
                  );
                  effect.id = projectileId;
                  effect._isVisualOnly = true;
                  effect._remotePlayerUid = eventData.playerUid;
                  // ✅ 修復：使用與單機一致的默認值（CONFIG.SLASH.VISUAL_SCALE = 1.8）
                  effect.visualScale = (typeof eventData.visualScale === "number") ? eventData.visualScale : 1.8;
                  // ⚠️ 修復：已經在1356行之前檢查過了，這裡不需要再次檢查（避免重複添加）
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "JUDGMENT" && typeof JudgmentEffect !== "undefined") {
                // 裁決：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的裁决也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  // ✅ 修復：使用與單機一致的默認值（CONFIG.JUDGMENT）
                  // ✅ 修復：使用與單機一致的默認值（CONFIG.JUDGMENT）
                  const effect = new JudgmentEffect(
                    targetPlayer, // ✅ 修復：使用完整的 Player 對象，而不是只有 x, y
                    eventData.damage || 0, // 使用实际伤害值，不是0
                    eventData.swordCount || 1, // ✅ 與單機一致：由 `Weapon.fire()` 計算，通常為 1（單次攻擊）
                    eventData.detectRadius || 400, // ✅ 與單機一致：使用 CONFIG.JUDGMENT.DETECT_RADIUS（400）
                    eventData.aoeRadius || 100, // ✅ 與單機一致：使用 CONFIG.JUDGMENT.BASE_AOE_RADIUS（100）
                    eventData.swordImageWidth || 83, // ✅ 與單機一致：使用 CONFIG.JUDGMENT.SWORD_IMAGE_WIDTH（83）
                    eventData.swordImageHeight || 200, // ✅ 與單機一致：使用 CONFIG.JUDGMENT.SWORD_IMAGE_HEIGHT（200）
                    eventData.fallDurationMs || 250, // ✅ 與單機一致：使用 CONFIG.JUDGMENT.FALL_DURATION_MS（250ms）
                    eventData.fadeOutDurationMs || 300 // ✅ 與單機一致：使用 CONFIG.JUDGMENT.FADE_OUT_DURATION_MS（300ms）
                  );
                  effect.id = projectileId;
                  // 不标记为_isVisualOnly，让每个玩家的裁决都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "EXPLOSION" && typeof ExplosionEffect !== "undefined") {
                // 爆炸效果：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.RemotePlayerManager !== 'undefined' && typeof rt.RemotePlayerManager.get === 'function') {
                    // ✅ 修復：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象
                    const remotePlayer = rt.RemotePlayerManager.get(eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = remotePlayer;
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的爆炸也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  const effect = new ExplosionEffect(
                    targetPlayer,
                    eventData.x || targetPlayer.x,
                    eventData.y || targetPlayer.y
                  );
                  effect.id = projectileId;
                  // 不标记为_isVisualOnly，让每个玩家的爆炸都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  // ✅ 修復：初始化 hitEnemies 數組，以便在 hitEvents 中收集命中敵人
                  if (!effect.hitEnemies) effect.hitEnemies = [];
                  Game.projectiles.push(effect);
                }
              } else if ((weaponType === "DEATHLINE_WARRIOR" || weaponType === "DEATHLINE_SUPERMAN") && typeof DeathlineWarriorEffect !== "undefined") {
                // 死線戰士/死線超人：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的死线战士/死线超人也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  // ✅ 修復：使用與單機一致的默認值（CONFIG.DEATHLINE_WARRIOR / DEATHLINE_SUPERMAN）
                  const isSuperman = (weaponType === "DEATHLINE_SUPERMAN");
                  const effect = new DeathlineWarriorEffect(
                    targetPlayer, // ✅ 修復：使用完整的 Player 對象，而不是只有 x, y
                    eventData.damage || 0, // 使用实际伤害值，不是0
                    eventData.detectRadius || 600,
                    eventData.totalHits || (isSuperman ? 6 : 3), // ✅ 與單機一致：DEATHLINE_SUPERMAN 為 6，DEATHLINE_WARRIOR 為 3
                    eventData.totalDurationMs || 1200,
                    eventData.minTeleportDistance || 300,
                    weaponType,
                    eventData.aoeRadius || (isSuperman ? 200 : 0), // ✅ 與單機一致：DEATHLINE_SUPERMAN 為 200，DEATHLINE_WARRIOR 為 0
                    eventData.displayScale || (isSuperman ? 1.0 : 0.5) // ✅ 與單機一致：DEATHLINE_SUPERMAN 為 1.0，DEATHLINE_WARRIOR 為 0.5
                  );
                  effect.id = projectileId;
                  // 不标记为_isVisualOnly，让每个玩家的死线战士/死线超人都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "DIVINE_JUDGMENT" && typeof DivineJudgmentEffect !== "undefined") {
                // 神裁：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的神界裁决也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  // ✅ 修復：使用與單機一致的默認值（CONFIG.DIVINE_JUDGMENT）
                  const effect = new DivineJudgmentEffect(targetPlayer, { // ✅ 修復：使用完整的 Player 對象，而不是只有 x, y
                    damage: eventData.damage || 0, // 使用实际伤害值，不是0
                    detectRadius: eventData.detectRadius || 400, // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.DETECT_RADIUS_BASE（400）
                    aoeRadius: eventData.aoeRadius || 100, // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.AOE_RADIUS_BASE（100）
                    fallDurationMs: eventData.fallDurationMs || 250, // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.FALL_DURATION_MS（250ms）
                    moveDurationMs: eventData.moveDurationMs || 600, // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.MOVE_DURATION_MS（600ms）
                    headWaitMs: eventData.headWaitMs || 100, // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.HEAD_WAIT_MS（100ms）
                    holdOnEnemyMs: eventData.holdOnEnemyMs || 200, // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.HOLD_ON_ENEMY_MS（200ms）
                    swordImageWidth: eventData.swordImageWidth || 83, // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.SWORD_IMAGE_WIDTH（83）
                    swordImageHeight: eventData.swordImageHeight || 200, // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.SWORD_IMAGE_HEIGHT（200）
                    patrolSpeedFactor: eventData.patrolSpeedFactor || 0.35 // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.PATROL_SPEED_FACTOR（0.35）
                  });
                  effect.id = projectileId;
                  // 不标记为_isVisualOnly，让每个玩家的神界裁决都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.visualScale === "number") effect.visualScale = eventData.visualScale;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "AURA_FIELD" && typeof AuraField !== "undefined") {
                // 光環領域：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的守护领域也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  // ✅ 修復：使用與單機一致的默認值（CONFIG.AURA_FIELD.FIELD_RADIUS = 60）
                  const effect = new AuraField(
                    targetPlayer, // ✅ 修復：使用完整的 Player 對象，而不是只有 x, y
                    eventData.radius || 60, // ✅ 與單機一致：使用 CONFIG.AURA_FIELD.FIELD_RADIUS（60）
                    eventData.damage || 0 // 使用实际伤害值，不是0
                  );
                  effect.id = projectileId;
                  // 不标记为_isVisualOnly，让每个玩家的守护领域都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.visualScale === "number") effect.visualScale = eventData.visualScale;
                  // ⚠️ 修復：已經在1356行之前檢查過了，這裡不需要再次檢查（避免重複添加）
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "GRAVITY_WAVE" && typeof GravityWaveField !== "undefined") {
                // 重力波：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.RemotePlayerManager !== 'undefined' && typeof rt.RemotePlayerManager.get === 'function') {
                    // ✅ 修復：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象
                    const remotePlayer = rt.RemotePlayerManager.get(eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = remotePlayer;
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的引力波也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  const effect = new GravityWaveField(
                    targetPlayer,
                    eventData.radius || 150,
                    eventData.damage || 0, // 使用实际伤害值，不是0
                    eventData.pushMultiplier || 0
                  );
                  effect.id = projectileId;
                  // 不标记为_isVisualOnly，让每个玩家的引力波都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.visualScale === "number") effect.visualScale = eventData.visualScale;
                  Game.projectiles.push(effect);
                }
              } else if ((weaponType === "BIG_ICE_BALL" || weaponType === "FRENZY_ICE_BALL") && typeof IceBallProjectile !== "undefined") {
                // 大冰球：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer && eventData.targetX !== undefined && eventData.targetY !== undefined) {
                  const effect = new IceBallProjectile(
                    eventData.x || targetPlayer.x,
                    eventData.y || targetPlayer.y,
                    eventData.targetX,
                    eventData.targetY,
                    eventData.flightTimeMs || 1000,
                    eventData.weaponLevel || 1,
                    targetPlayer, // ✅ 修復：使用完整的 Player 對象，而不是只有 x, y
                    eventData.isFrenzyIceBall || false
                  );
                  effect.id = projectileId;
                  effect._isVisualOnly = true;
                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "YOUNG_DADA_GLORY" && typeof YoungDadaGloryEffect !== "undefined") {
                // 幼妲光輝：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  const effect = new YoungDadaGloryEffect(
                    targetPlayer, // ✅ 修復：使用完整的 Player 對象，而不是只有 x, y
                    eventData.duration || 2000
                  );
                  effect.id = projectileId;
                  effect._isVisualOnly = true;
                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "FRENZY_YOUNG_DADA_GLORY" && typeof FrenzyYoungDadaGloryEffect !== "undefined") {
                // 幼妲天使：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  const effect = new FrenzyYoungDadaGloryEffect(
                    targetPlayer, // ✅ 修復：使用完整的 Player 對象，而不是只有 x, y
                    eventData.duration || 3000
                  );
                  effect.id = projectileId;
                  effect._isVisualOnly = true;
                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "RADIANT_GLORY" && typeof RadiantGloryEffect !== "undefined") {
                // 光芒萬丈：需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的光芒万丈也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  // ✅ 修復：使用與單機一致的默認值（CONFIG.RADIANT_GLORY）
                  const effect = new RadiantGloryEffect(
                    targetPlayer,
                    eventData.damage || 0, // 使用实际伤害值，不是0
                    eventData.width || 8,
                    eventData.duration || 2000, // ✅ 與單機一致：使用 CONFIG.RADIANT_GLORY.DURATION（2000ms）
                    eventData.tickInterval || 120,
                    eventData.beamCount || 10,
                    eventData.rotationSpeed || 1.0 // ✅ 與單機一致：使用 CONFIG.RADIANT_GLORY.ROTATION_SPEED（1.0）
                  );
                  effect.id = projectileId;
                  // 不标记为_isVisualOnly，让每个玩家的光芒万丈都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "FRENZY_SLASH" && typeof SlashEffect !== "undefined") {
                // 狂熱斬擊：使用SlashEffect（與SLASH相同），需要找到對應的玩家（使用完整的 Player 對象）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的狂热斩击也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  // ✅ 修復：使用與單機一致的默認值（CONFIG.FRENZY_SLASH）
                  const effect = new SlashEffect(
                    targetPlayer, // ✅ 修復：使用完整的 Player 對象，而不是只有 x, y
                    eventData.angle || 0,
                    eventData.damage || 0, // 使用实际伤害值，不是0
                    eventData.radius || 280, // ✅ 與單機一致：使用 CONFIG.FRENZY_SLASH.RADIUS_BASE（280）
                    eventData.arcDeg || 365, // ✅ 與單機一致：使用 CONFIG.FRENZY_SLASH.ARC_DEG_BASE（365）
                    eventData.duration || 1200 // ✅ 與單機一致：使用 CONFIG.FRENZY_SLASH.DURATION（1200ms）
                  );
                  effect.id = projectileId;
                  effect.weaponType = 'FRENZY_SLASH'; // ✅ 设置正确的weaponType
                  // 不标记为_isVisualOnly，让每个玩家的狂热斩击都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  // ✅ 修復：使用與單機一致的默認值（CONFIG.FRENZY_SLASH.VISUAL_SCALE = 2.0）
                  effect.visualScale = (typeof eventData.visualScale === "number") ? eventData.visualScale : 2.0;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "SING" && typeof SingEffect !== "undefined") {
                // 唱歌：需要找到對應的玩家（使用完整的 Player 對象，以便正確更新位置）
                // ✅ 修復：唱歌是一次性效果（COOLDOWN: 5000），每次施放都創建新的效果（與單機一致）
                // 參考無敵技能的處理方式：每次施放都創建新的效果，即使舊的效果還在（與單機一致）
                // 但需要先清理同一個玩家的舊唱歌效果，避免疊加（參考無敵的清理邏輯）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復1：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象（參考無敵技能）
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // ✅ 修復：使用完整的 Player 對象，而不是只有 x, y
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ 修復2：先清理同一個玩家的舊唱歌效果，避免疊加（參考無敵的清理邏輯）
                  // ⚠️ 重要：確保完全清理所有同玩家的SING效果，包括本地玩家創建的效果
                  if (eventData.playerUid && Array.isArray(Game.projectiles)) {
                    try {
                      // ✅ 修復：使用與無敵相同的清理邏輯，確保完全清理舊效果
                      // 清理遠程玩家創建的視覺效果（_isVisualOnly）和本地玩家創建的效果
                      const isLocalPlayer = (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid));
                      for (let i = Game.projectiles.length - 1; i >= 0; i--) {
                        const proj = Game.projectiles[i];
                        if (proj && proj.weaponType === "SING") {
                          // ✅ 修復：清理所有同玩家的SING效果
                          const isRemotePlayerEffect = (proj._isVisualOnly && proj._remotePlayerUid === eventData.playerUid);
                          const isLocalPlayerEffect = (isLocalPlayer && proj.player === Game.player && !proj._isVisualOnly);
                          if (isRemotePlayerEffect || isLocalPlayerEffect) {
                            // ✅ 修復：完全清理舊的唱歌效果 DOM 元素（參考無敵）
                            if (proj.el && proj.el.parentNode) {
                              proj.el.parentNode.removeChild(proj.el);
                            }
                            proj.el = null;
                            proj.markedForDeletion = true;
                            Game.projectiles.splice(i, 1);
                          }
                        }
                      }
                    } catch (_) {}
                  }
                  
                  // ✅ 修復3：每次施放都創建新的效果（像無敵一樣），與單機一致
                  // ✅ 修復4：確保參數與單機一致（size: 500, offsetY: -250, duration: 2000）
                  const effect = new SingEffect(
                    targetPlayer, // ✅ 修復：使用完整的 Player 對象，而不是只有 x, y
                    eventData.duration || 2000 // ✅ 修復：與單機一致（CONFIG.SING.DURATION: 2000）
                  );
                  effect.id = projectileId;
                  effect._isVisualOnly = true;
                  effect._remotePlayerUid = eventData.playerUid;
                  // ✅ 修復5：確保參數與單機一致（參考 sing.js Line 10-11）
                  effect.size = (typeof eventData.size === "number") ? eventData.size : 500; // 與單機一致
                  effect.offsetY = (typeof eventData.offsetY === "number") ? eventData.offsetY : -250; // 與單機一致
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "INVINCIBLE" && typeof InvincibleEffect !== "undefined") {
                // 無敵：需要找到對應的玩家（使用完整的 Player 對象，以便正確更新位置）
                // ✅ 修復：無敵技能是一次性效果（持續幾秒後消失，然後又持續幾秒後消失，很像是變長的斬擊）
                // 參考斬擊的處理方式：每次施放都創建新的效果，即使舊的效果還在（與單機一致）
                // 但需要先清理同一個玩家的舊無敵效果，避免疊加（參考守護領域的清理邏輯）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // ✅ 修復：優先使用 RemotePlayerManager.get 獲取完整的 Player 對象（參考守護領域和斬擊）
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 使用完整的 Player 對象
                      }
                    }
                  }
                  // 如果找不到遠程玩家，檢查是否是本地玩家
                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }
                
                if (targetPlayer) {
                  // ✅ 修復：無敵技能是一次性效果，每次施放都創建新的（像斬擊一樣）
                  // 但在創建前，先清理同一個玩家的舊無敵效果，避免疊加（參考守護領域的清理邏輯）
                  if (eventData.playerUid) {
                    try {
                      // ✅ 修復：使用與守護領域相同的清理邏輯，確保完全清理舊效果
                      for (let i = Game.projectiles.length - 1; i >= 0; i--) {
                        const proj = Game.projectiles[i];
                        if (proj && proj.weaponType === "INVINCIBLE" && proj._remotePlayerUid === eventData.playerUid) {
                          // ✅ 修復：完全清理舊的無敵效果 DOM 元素（參考守護領域）
                          if (proj.el && proj.el.parentNode) {
                            proj.el.parentNode.removeChild(proj.el);
                          }
                          proj.el = null;
                          // ✅ 修復：標記為刪除，確保不會被其他地方引用
                          proj.markedForDeletion = true;
                          Game.projectiles.splice(i, 1);
                        }
                      }
                    } catch (_) {}
                  }
                  
                  // ✅ 修復：每次施放都創建新的效果（像斬擊一樣），與單機一致
                  const effect = new InvincibleEffect(
                    targetPlayer, // ✅ 修復：使用完整的 Player 對象，而不是只有 x, y
                    eventData.duration || 2000
                  );
                  effect.id = projectileId;
                  effect._isVisualOnly = true;
                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.size === "number") effect.size = eventData.size;
                  if (typeof eventData.offsetY === "number") effect.offsetY = eventData.offsetY;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "INTERSECTION_CAR" && typeof CarHazard !== "undefined") {
                // 路口車輛：環境危險物（不需要玩家關聯）
                const car = new CarHazard({
                  x: eventData.x || 0,
                  y: eventData.y || 0,
                  vx: eventData.vx || 0,
                  vy: eventData.vy || 0,
                  width: eventData.width || 200,
                  height: eventData.height || 100,
                  imageKey: eventData.imageKey || "car",
                  damage: eventData.damage || 100,
                  despawnPad: eventData.despawnPad || 400
                });
                car.id = projectileId;
                car._isVisualOnly = true; // 標記為僅視覺（隊員端不進行傷害計算）
                Game.projectiles.push(car);
              } else if (typeof Projectile !== "undefined") {
                // 普通投射物
                try {
                  // ✅ 修復：確保 size 有合理的默認值（如果為 0 或未定義，使用武器配置的默認值）
                  let projectileSize = eventData.size;
                  if (!projectileSize || projectileSize <= 0) {
                    // 如果 size 為 0 或未定義，嘗試從武器配置獲取默認值
                    const weaponConfig = (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS[weaponType]) || {};
                    projectileSize = weaponConfig.PROJECTILE_SIZE || 20; // 默認 20
                  }
                  const projectile = new Projectile(
                    eventData.x || 0,
                    eventData.y || 0,
                    eventData.angle || 0,
                    weaponType,
                    0, // 傷害設為0（僅視覺，傷害已在隊長端計算）
                    eventData.speed || 0,
                    projectileSize // ✅ 修復：使用正確計算的 size
                  );
                  projectile.id = projectileId;
                  projectile.homing = eventData.homing || false;
                  projectile.turnRatePerSec = eventData.turnRatePerSec || 0;
                  projectile.assignedTargetId = eventData.assignedTargetId || null;
                  // ✅ 修復：同步 maxDistance 屬性（用於投射物最大飛行距離）
                  if (typeof eventData.maxDistance === 'number' && eventData.maxDistance > 0) {
                    projectile.maxDistance = eventData.maxDistance;
                  }
                  projectile._isVisualOnly = true; // 標記為僅視覺投射物
                  projectile.player = null; // 不關聯玩家（避免碰撞檢測）
                  Game.projectiles.push(projectile);
                  if (SURVIVAL_ONLINE_DEBUG) {
                    console.log(`[SurvivalOnline] ✅ 成功創建遠程投射物: weaponType=${weaponType}, id=${projectileId}, x=${eventData.x}, y=${eventData.y}`);
                  }
                } catch (e) {
                  console.error(`[SurvivalOnline] ❌ 創建遠程投射物失敗:`, e, `weaponType=${weaponType}`);
                }
              } else {
                console.warn(`[SurvivalOnline] ⚠️ Projectile 类未定义，无法创建远程投射物: weaponType=${weaponType}`);
              }
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 隊員端生成投射物視覺效果失敗:", e);
        }
      } else if (eventType === "game_over") {
        // ✅ MMORPG 架構：所有玩家都能處理遊戲結束事件（所有玩家都死亡）
        console.log('[SurvivalOnline] onEventMessage: 收到 game_over 事件');
        try {
          // 防止重複觸發
          if (typeof Game !== "undefined") {
            // ⚠️ 修复：如果新游戏已开始，忽略服务器残留的 game_over 事件
            if (Game._newGameStarted) {
              console.log('[SurvivalOnline] onEventMessage: 新游戏已开始，忽略服务器残留的 game_over 事件');
              return; // 忽略上一局的残留事件
            }
            
            if (Game._gameOverEventSent) {
              console.warn('[SurvivalOnline] onEventMessage: Game._gameOverEventSent 已为 true，跳过');
              return; // 已經處理過了
            }
            console.log('[SurvivalOnline] onEventMessage: 处理 game_over 事件');
            Game._gameOverEventSent = true; // 標記為已處理

            // ✅ 修復：直接調用遊戲結束邏輯，不再次調用 Game.gameOver()（避免循環）
            // 因為 Game.gameOver() 會再次廣播事件，導致循環
            Game.isGameOver = true;
            
            // ⚠️ 修复：游戏结束时完全清理所有游戏数据，确保重新进入游戏时是全新状态
            // 与单机模式一致：完完全全清理掉游戏的任何资料，只保留大厅的资讯
            try {
              // 停止所有音效（包括路口地图的车子音效）
              if (typeof AudioManager !== 'undefined') {
                try {
                  if (AudioManager.stopAllMusic) AudioManager.stopAllMusic();
                  if (AudioManager.stopAllSounds) AudioManager.stopAllSounds();
                } catch (_) { }
              }
              
              // ⚠️ 修复：不要在显示游戏结束画面之前调用 reset()，因为 reset() 可能会影响视频播放
              // 完全重置游戏状态会在 _returnToStartFrom 中调用（视频播放完成后）
              
              // 停用 Runtime（停止狀態同步）
              if (typeof Runtime !== "undefined" && typeof Runtime.setEnabled === "function") {
                Runtime.setEnabled(false);
              }
              // 清理遠程玩家
              if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.clear === "function") {
                RemotePlayerManager.clear();
              }
              // 清理 Game.remotePlayers
              if (typeof Game !== "undefined" && Array.isArray(Game.remotePlayers)) {
                Game.remotePlayers.length = 0;
              }
            } catch (e) {
              console.warn('[SurvivalOnline] onEventMessage: 清理游戏状态失败:', e);
            }
            
            // ✅ 正常結束：更新房間狀態為 lobby（回到大廳狀態），不離開房間
            // ⚠️ 修复：不要在这里显示房间大厅，应该只调用 UI.showGameOverScreen()
            // 房间大厅的显示逻辑应该在 _returnToStartFrom 中处理（视频播放完成后）
            if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.updateRoomStatusToLobby === 'function') {
              window.SurvivalOnlineUI.updateRoomStatusToLobby().catch(() => { });
            }
            // ⚠️ 修复：只显示游戏结束画面，不要先显示房间大厅
            // 游戏结束画面会在视频播放完成后自动调用 _returnToStartFrom，然后显示房间大厅
            if (typeof UI !== 'undefined' && typeof UI.showGameOverScreen === 'function') {
              console.log('[SurvivalOnline] onEventMessage: 调用 UI.showGameOverScreen()');
              UI.showGameOverScreen();
            } else {
              console.error('[SurvivalOnline] onEventMessage: UI 或 UI.showGameOverScreen 不存在！', typeof UI, typeof UI?.showGameOverScreen);
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 處理遊戲結束事件失敗:", e);
        }
      } else if (eventType === "exit_spawn") {
        // 隊員端生成出口（第20波BOSS死亡後）
        try {
          if (typeof Game !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            Game.exit = {
              x: eventData.x,
              y: eventData.y,
              width: eventData.width || 300,
              height: eventData.height || 242
            };
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 隊員端生成出口失敗:", e);
        }
      } else if (eventType === "game_victory") {
        // ✅ MMORPG 架構：所有玩家都能處理遊戲勝利事件（到達出口）
        try {
          // 防止重複觸發
          if (typeof Game !== "undefined") {
            if (Game._victoryEventSent) return; // 已經處理過了
            Game._victoryEventSent = true; // 標記為已處理

            // ✅ 修復：直接調用勝利邏輯，不再次調用 Game.victory()（避免循環）
            // 因為 Game.victory() 會再次廣播事件，導致循環
            Game.isGameOver = true;
            
            // ⚠️ 修复：游戏结束时完全清理所有游戏数据，确保重新进入游戏时是全新状态
            // 与单机模式一致：完完全全清理掉游戏的任何资料，只保留大厅的资讯
            try {
              // 停止所有音效（包括路口地图的车子音效）
              if (typeof AudioManager !== 'undefined') {
                try {
                  if (AudioManager.stopAllMusic) AudioManager.stopAllMusic();
                  if (AudioManager.stopAllSounds) AudioManager.stopAllSounds();
                } catch (_) { }
              }
              
              // ⚠️ 修复：不要在显示胜利画面之前调用 reset()，因为 reset() 可能会影响视频播放
              // 完全重置游戏状态会在 _returnToStartFrom 中调用（视频播放完成后）
              
              // 停用 Runtime（停止狀態同步）
              if (typeof Runtime !== "undefined" && typeof Runtime.setEnabled === "function") {
                Runtime.setEnabled(false);
              }
              // 清理遠程玩家
              if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.clear === "function") {
                RemotePlayerManager.clear();
              }
              // 清理 Game.remotePlayers
              if (typeof Game !== "undefined" && Array.isArray(Game.remotePlayers)) {
                Game.remotePlayers.length = 0;
              }
            } catch (e) {
              console.warn('[SurvivalOnline] onEventMessage: 清理游戏状态失败:', e);
            }
            
            // ✅ 正常結束：更新房間狀態為 lobby（回到大廳狀態），不離開房間
            if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.updateRoomStatusToLobby === 'function') {
              window.SurvivalOnlineUI.updateRoomStatusToLobby().catch(() => { });
            }
            // 先顯示開始畫面（作為背景），然後顯示房間大廳覆蓋層
            try {
              const startScreen = document.getElementById('start-screen');
              if (startScreen) startScreen.classList.remove('hidden');
            } catch (_) { }
            // 回到房間大廳（覆蓋層）
            if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.openLobbyScreen === 'function') {
              window.SurvivalOnlineUI.openLobbyScreen();
            }
            // 顯示勝利畫面
            if (typeof UI !== 'undefined' && typeof UI.showVictoryScreen === 'function') {
              UI.showVictoryScreen();
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 處理遊戲勝利事件失敗:", e);
        }
      }
    } catch (e) {
      console.warn("[SurvivalOnline] M2 事件處理失敗:", e);
    }
  }

  // M5：處理全量快照（重連恢復）
  function onFullSnapshotMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.t !== "full_snapshot") return;
    // ✅ LEGACY：權威多人已由伺服器 game-state 取代（避免舊重連恢復邏輯回魂）
    try { if (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) return; } catch (_) { }

    try {
      console.log("[SurvivalOnline] M5: 收到全量快照，開始恢復遊戲狀態");

      // 恢復 sessionId
      if (payload.sessionId && typeof Game !== "undefined" && Game.multiplayer) {
        Game.multiplayer.sessionId = payload.sessionId;
      }

      // 恢復遊戲時間
      if (typeof payload.gameTime === "number" && typeof Game !== "undefined") {
        Game.gameTime = payload.gameTime;
      }

      // 恢復波次
      if (typeof payload.currentWave === "number" && typeof WaveSystem !== "undefined") {
        WaveSystem.currentWave = payload.currentWave;
        if (typeof UI !== "undefined" && UI.updateWaveInfo) {
          UI.updateWaveInfo(WaveSystem.currentWave);
        }
      }

      // 先處理玩家狀態（使用 M3 的邏輯）
      onSnapshotMessage(payload);

      // 恢復敵人（僅在室長端，客戶端不生成敵人）
      // 注意：客戶端不應該真正生成敵人，只是記錄用於視覺效果
      // 實際的敵人生成和戰鬥邏輯由室長處理

      // 恢復經驗球和寶箱（同樣，客戶端只做記錄）

      console.log("[SurvivalOnline] M5: 遊戲狀態恢復完成");
    } catch (e) {
      console.warn("[SurvivalOnline] M5: 全量快照處理失敗:", e);
    }
  }

  // M3：處理狀態快照（客戶端接收室長廣播的快照）
  function onSnapshotMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.t !== "snapshot") return;
    // ✅ LEGACY：權威多人已由伺服器 game-state 取代
    try { if (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) return; } catch (_) { }

    try {
      // MMO 架構：不再校正位置，只同步關鍵狀態
      // 每個玩家都是獨立的，位置由客戶端自己控制，不被服務器校正
      if (payload.players && _uid && payload.players[_uid]) {
        const myState = payload.players[_uid];
        if (typeof Game !== "undefined" && Game.player) {
          const player = Game.player;

          // ✅ MMO 架構：不再校正位置，只同步關鍵狀態（血量、能量、等級等）
          // 位置由客戶端自己控制，不被服務器校正，確保每個玩家都是獨立的

          // 血量/能量/等級/經驗：硬覆蓋保一致
          if (typeof myState.hp === "number") player.health = Math.max(0, Math.min(myState.hp, player.maxHealth || 100));
          if (typeof myState.maxHp === "number") player.maxHealth = myState.maxHp;
          if (typeof myState.energy === "number") player.energy = Math.max(0, Math.min(myState.energy, player.maxEnergy || 100));
          if (typeof myState.maxEnergy === "number") player.maxEnergy = myState.maxEnergy;
          if (typeof myState.level === "number") player.level = myState.level;
          if (typeof myState.exp === "number") player.experience = myState.exp;
          // ✅ 修復：只有在 session 初始化時才同步 experienceToNextLevel
          // 之後完全由客戶端管理（通過 gainExperience 和 levelUp()），與單機一致
          // ⚠️ 注意：這是 LEGACY 代碼（M3 架構），權威多人已由伺服器 game-state 取代
          // 但為了兼容性，仍然保留這個邏輯，只在 session 初始化時同步
          // 這裡不做任何事，因為 experienceToNextLevel 已經由 gainExperience 和 levelUp() 管理

          // 金幣同步（組隊模式共享金幣）
          if (typeof myState.coins === "number" && typeof Game !== "undefined") {
            Game.coins = Math.max(0, Math.floor(myState.coins));
            // 更新金幣顯示
            if (typeof UI !== "undefined" && UI.updateCoinsDisplay) {
              UI.updateCoinsDisplay(Game.coins);
            }
          }

          // ✅ 多人元素：大招動畫狀態同步（讓所有客戶端能看到其他玩家的大招變身效果）
          // 注意：大招功能本身是單機元素（武器變化、屬性加成等），只在本地執行
          // 但大招動畫（isUltimateActive、ultimateImageKey、體型變化）是多人元素，需要同步
          if (typeof myState.isUltimateActive === "boolean") {
            const wasUltimateActive = player.isUltimateActive;
            player.isUltimateActive = myState.isUltimateActive;
            
            // ✅ 單機元素：如果伺服器通知大招結束，本地執行 deactivateUltimate（恢復武器、屬性等）
            // 但只執行功能恢復，不執行視覺恢復（視覺由伺服器同步）
            if (wasUltimateActive && !myState.isUltimateActive && typeof player.deactivateUltimate === 'function') {
              // ✅ 修復：調用完整的 deactivateUltimate，但跳過體型恢復（體型由伺服器同步）
              try {
                // 臨時標記，讓 deactivateUltimate 知道不要恢復體型
                const wasRemotePlayer = player._isRemotePlayer;
                const skipSizeRestore = true;
                
                // 調用完整的 deactivateUltimate（會清理守護領域、能量等）
                // 但需要確保體型恢復被跳過（因為由伺服器同步）
                const backup = player._ultimateBackup;
                if (backup && backup.weapons) {
                  // 恢復武器
                  const WeaponCtor = _getGlobalCtor("Weapon");
                  if (WeaponCtor) {
                    player.weapons = backup.weapons.map(info => {
                      const w = new WeaponCtor(player, info.type);
                      w.level = info.level;
                      w.projectileCount = w.config.LEVELS[w.level - 1].COUNT;
                      return w;
                    });
                  }
                }
                
                // 恢復額外防禦
                if (player._ultimateExtraDefense > 0) {
                  const currentDefense = player.baseDefense || 1;
                  player.baseDefense = Math.max(1, currentDefense - player._ultimateExtraDefense);
                }
                player._ultimateExtraDefense = 0;
                
                // ✅ 修復：清理守護領域等持續效果（與單機模式一致）
                if (typeof Game !== 'undefined' && Array.isArray(Game.projectiles)) {
                  for (const p of Game.projectiles) {
                    if (p && p.weaponType === 'AURA_FIELD' && p.player === player && !p.markedForDeletion) {
                      if (typeof p.destroy === 'function') p.destroy(); else p.markedForDeletion = true;
                    }
                  }
                }
                
                // ✅ 修復：清理能量（與單機模式一致）
                player.energy = 0;
                if (typeof UI !== 'undefined' && typeof UI.updateEnergyBar === 'function') {
                  UI.updateEnergyBar(player.energy, player.maxEnergy);
                }
                
                // ✅ 修復：清理第二位角色大絕結束時的GIF z-index（與單機模式一致）
                const wasDadaUltimate = (player._ultimateImageKey === 'playerN2');
                if (wasDadaUltimate) {
                  try {
                    const playerGifEl = document.getElementById('gif-overlay-player');
                    if (playerGifEl) {
                      playerGifEl.style.zIndex = '3'; // 恢復預設值
                    }
                  } catch (_) {}
                }
                
                // 清理備份和狀態
                player._ultimateBackup = null;
                player.ultimateEndTime = 0;
                player._ultimateImageKey = null;
              } catch (e) {
                console.warn('[SurvivalOnline] 大招結束清理失敗:', e);
              }
            }
          }
          if (typeof myState.ultimateImageKey === "string" && myState.ultimateImageKey) {
            player._ultimateImageKey = myState.ultimateImageKey;
          } else if (myState.isUltimateActive === false) {
            player._ultimateImageKey = null;
          }
          if (typeof myState.ultimateEndTime === "number") {
            player.ultimateEndTime = myState.ultimateEndTime;
          }
          // ✅ 多人元素：體型同步（大招變身時的視覺效果）
          // ✅ 修复：大招结束时，服务器会恢复体积，需要同步（即使值为原始值，也要同步）
          if (typeof myState.width === "number") {
            // 允许同步原始体积（可能小于或等于当前值）
            player.width = myState.width;
          }
          if (typeof myState.height === "number") {
            // 允许同步原始体积（可能小于或等于当前值）
            player.height = myState.height;
          }
          if (typeof myState.collisionRadius === "number") {
            // 允许同步原始碰撞半径（可能小于或等于当前值）
            player.collisionRadius = myState.collisionRadius;
          }

          // 死亡和復活狀態同步
          if (typeof myState._isDead === "boolean") {
            player._isDead = myState._isDead;
            // 如果死亡，清除武器
            if (myState._isDead && player.clearWeapons && typeof player.clearWeapons === 'function') {
              player.clearWeapons();
            }
            // 如果復活，恢復初始武器
            if (!myState._isDead && player._isDead && player.weapons && player.weapons.length === 0) {
              player.addWeapon('DAGGER');
            }
          }
          if (typeof myState._resurrectionProgress === "number") {
            player._resurrectionProgress = myState._resurrectionProgress;
          }

          // ✅ 單機元素：UI 更新應該只由本地玩家更新，不應該在組隊模式下執行
          // 注意：onSnapshotMessage 應該已經在組隊模式下被停用（第2191行），但為了安全起見，這裡再次檢查
          // 在組隊模式下，UI 更新應該由 handleServerGameState 處理，而不是這裡
          if (typeof UI !== "undefined") {
            // ✅ 確保只在非組隊模式下更新 UI（避免 HUD 跳到其他玩家身上）
            try {
              const isMultiplayer = (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled);
              if (!isMultiplayer) {
                if (UI.updateHealthBar) UI.updateHealthBar(player.health, player.maxHealth);
                if (UI.updateEnergyBar) UI.updateEnergyBar(player.energy, player.maxEnergy);
                if (UI.updateLevel) UI.updateLevel(player.level);
                if (UI.updateExpBar) UI.updateExpBar(player.experience, player.experienceToNextLevel);
              }
            } catch (_) {}
          }
        }
      }

      // 處理 BOSS 狀態（如果存在）
      if (payload.boss && typeof Game !== "undefined" && Game.boss) {
        const boss = Game.boss;
        const bossState = payload.boss;
        // BOSS 位置插值
        if (typeof bossState.x === "number" && typeof bossState.y === "number") {
          const dx = bossState.x - boss.x;
          const dy = bossState.y - boss.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 50) {
            const lerp = 0.3;
            boss.x += dx * lerp;
            boss.y += dy * lerp;
          } else {
            boss.x = bossState.x;
            boss.y = bossState.y;
          }
        }
        // BOSS 血量硬覆蓋
        if (typeof bossState.hp === "number") boss.health = Math.max(0, bossState.hp);
        if (typeof bossState.maxHp === "number") boss.maxHealth = bossState.maxHp;
      }

      // 處理出口狀態（如果存在）
      if (payload.exit && typeof Game !== "undefined") {
        if (!Game.exit && payload.exit.x !== undefined && payload.exit.y !== undefined) {
          // 出口尚未生成，但快照中有，可以顯示提示（實際生成由室長處理）
        } else if (Game.exit) {
          // 出口已存在，同步位置
          Game.exit.x = payload.exit.x || Game.exit.x;
          Game.exit.y = payload.exit.y || Game.exit.y;
        }
      }

      // ✅ MMO 架構：不再同步敵人，每個客戶端自己生成
      // 使用確定性生成確保所有客戶端生成相同的敵人
      // 敵人同步已移除，每個客戶端自己生成和更新敵人
    } catch (e) {
      console.warn("[SurvivalOnline] M3 快照處理失敗:", e);
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

    // ✅ 修復：組隊模式下離開分頁或失去焦點時，停止發送輸入到服務器，避免狀態不一致
    // 組隊模式不能暫停遊戲（Game.pause），因為其他人還在繼續遊戲
    // 但離開分頁或失去焦點時應該停止發送輸入，只接收服務器狀態，切回來時會自動同步
    if (typeof document !== "undefined" && document.hidden) {
      // 頁面隱藏時，不發送輸入，但保持連接（WebSocket 保持開啟）
      // 遊戲循環繼續運行，只接收服務器狀態，避免切回來時狀態不一致
      return;
    }
    
    // ✅ 修復：檢查窗口是否失去焦點（blur 事件）
    // 組隊模式下，即使窗口失去焦點，也不應該暫停遊戲，但應該停止發送輸入
    // 使用 document.hasFocus() 檢查窗口焦點狀態
    if (typeof document !== "undefined" && typeof document.hasFocus === "function" && !document.hasFocus()) {
      // 窗口失去焦點時，不發送輸入，但保持連接（WebSocket 保持開啟）
      // 遊戲循環繼續運行，只接收服務器狀態，避免切回來時狀態不一致
      return;
    }

    // 限制發送頻率 (~30Hz / 33ms)
    const now = Date.now();
    if (now - lastSendAt < 33) return;

    if (typeof Game === "undefined" || !Game.player) return;
    // ✅ 未連線成功（OPEN）時不要送任何封包（避免空耗與刷屏）
    if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
    // ✅ watchdog：WS OPEN 但長時間沒有收到 game-state，代表「伺服器沒廣播/被擋/房間沒掛上」
    try {
      const sinceOpen = _netStats.joinedAt ? (Date.now() - _netStats.joinedAt) : 0;
      if (sinceOpen > 5000 && !_netStats.lastGameStateAt) {
        _updateNetStatusLine("NO game-state >5s (server not broadcasting?)");
      }
    } catch (_) { }

    // ✅ 權威伺服器架構：發送「移動輸入」給伺服器（server/game-state.js 只吃 data.type='move'）
    // 重要：之前送 t:'pos' 伺服器不處理，會導致伺服器端玩家位置不動 → 站樁被打 → 客戶端被覆寫成狂扣血/死亡/清武器
    // 這裡用「位置差分」估算速度，保持不侵入 Player/Input 的既有邏輯（不影響單機）
    if (typeof tick._lastSentX !== "number") tick._lastSentX = Game.player.x;
    if (typeof tick._lastSentY !== "number") tick._lastSentY = Game.player.y;
    if (typeof tick._lastSentAt !== "number") tick._lastSentAt = now;

    const dt = Math.max(1, now - tick._lastSentAt); // ms
    const dx = (typeof Game.player.x === "number") ? (Game.player.x - tick._lastSentX) : 0;
    const dy = (typeof Game.player.y === "number") ? (Game.player.y - tick._lastSentY) : 0;
    // 轉成「像素/16.67ms」的速度，使 server 端 x += vx * dt/16.67 約等於 dx
    const vx = dx * 16.67 / dt;
    const vy = dy * 16.67 / dt;

    _sendViaWebSocket({
      type: "move",
      vx,
      vy,
      deltaTime: dt
    });

    // ✅ B：戰鬥/防禦同源（一次補齊最致命的「迴避/防禦/受傷無敵」）
    // 每 500ms 或數值變更時同步到伺服器，伺服器用於碰撞扣血判定。
    try {
      if (!tick._lastMetaAt) tick._lastMetaAt = 0;
      const metaDue = (now - tick._lastMetaAt) >= 500;
      if (metaDue && typeof Game !== "undefined" && Game.player) {
        const p = Game.player;
        // 依單機 takeDamage 的公式計算「最終迴避率」（含：技能 ABSTRACTION/SIXTH_SENSE + 天賦 + 角色基礎 + 模式上限）
        let weaponDodgeRate = 0;
        try {
          if (p.weapons && Array.isArray(p.weapons)) {
            const passiveDodgeTypes = ["ABSTRACTION", "SIXTH_SENSE"];
            for (const t of passiveDodgeTypes) {
              const wpn = p.weapons.find(w => w && w.type === t);
              if (wpn && wpn.config && Array.isArray(wpn.config.DODGE_RATES)) {
                const level = wpn.level || 1;
                weaponDodgeRate += wpn.config.DODGE_RATES[level - 1] || 0;
              }
            }
          }
        } catch (_) { }
        const talentDodgeRate = p.dodgeTalentRate || 0;
        const characterDodgeRate = p._characterBaseDodgeRate || 0;
        const totalDodgeRate = weaponDodgeRate + talentDodgeRate + characterDodgeRate;
        let finalDodgeRate = totalDodgeRate;
        try {
          const isSurvival = (typeof Game !== "undefined" && Game.mode === "survival");
          const isDada = !!(p.character && p.character.id === "dada");
          if (isSurvival) {
            finalDodgeRate = isDada ? Math.min(0.40, totalDodgeRate) : Math.min(0.15, talentDodgeRate + characterDodgeRate);
          } else {
            finalDodgeRate = Math.min(0.15, talentDodgeRate + characterDodgeRate);
          }
        } catch (_) {
          finalDodgeRate = Math.min(0.15, talentDodgeRate + characterDodgeRate);
        }

        const baseDef = p.baseDefense || 0;
        const talentDef = p.damageReductionFlat || 0;
        const reduction = Math.max(0, Math.floor(baseDef + talentDef));
        const invulnMs = (typeof p.invulnerabilityDuration === "number") ? Math.max(0, Math.floor(p.invulnerabilityDuration)) : 1000;
        // ✅ 技能無敵（INVINCIBLE）：即使是重擊 ignoreInvulnerability=true 也必須尊重
        // 送「絕對時間戳」給伺服器，伺服器用 skillInvulnerableUntil 最高優先擋傷害
        let skillInvulnerableUntil = 0;
        try {
          if (p.isInvulnerable && p.invulnerabilitySource === "INVINCIBLE") {
            const dur = (typeof p.invulnerabilityDuration === "number") ? p.invulnerabilityDuration : 0;
            const t = (typeof p.invulnerabilityTime === "number") ? p.invulnerabilityTime : 0;
            const remain = Math.max(0, Math.floor(dur - t));
            skillInvulnerableUntil = Date.now() + remain;
          }
        } catch (_) { }

        // ✅ 爆擊率同步（天賦 + 升級 + 角色基礎）
        let critChanceBonusPct = 0;
        try {
          // 天賦爆擊率
          const critTalentPct = p.critChanceBonusPct || 0;
          // 升級爆擊率
          const critUpgradePct = p.critChanceUpgradeBonusPct || 0;
          // 角色基礎爆擊率
          const charBaseCritPct = p._characterBaseCritBonusPct || 0;
          critChanceBonusPct = critTalentPct + critUpgradePct + charBaseCritPct;
        } catch (_) { }

        // ✅ B：天賦/角色加成同源（例：不獸控制吸血）
        // 伺服器權威命中後需要回復血量，不能留在客戶端（避免不同步/作弊）。
        let lifesteal = null;
        try {
          if (p.weapons && Array.isArray(p.weapons)) {
            const wpn = p.weapons.find(w => w && w.type === "UNCONTROLLABLE_BEAST");
            const cfg = wpn && wpn.config ? wpn.config : null;
            if (cfg) {
              const level = wpn.level || 1;
              const basePct = (typeof cfg.LIFESTEAL_BASE_PCT === "number") ? cfg.LIFESTEAL_BASE_PCT : 0.001;
              const perLevelPct = (typeof cfg.LIFESTEAL_PER_LEVEL === "number") ? cfg.LIFESTEAL_PER_LEVEL : 0.001;
              const cooldownMs = (typeof cfg.LIFESTEAL_COOLDOWN_MS === "number") ? cfg.LIFESTEAL_COOLDOWN_MS : 100;
              const minHeal = (typeof cfg.MIN_HEAL === "number") ? cfg.MIN_HEAL : 1;
              const pct = basePct + (perLevelPct * (Math.max(1, level) - 1));
              lifesteal = {
                pct: Math.max(0, pct),
                cooldownMs: Math.max(0, Math.floor(cooldownMs)),
                minHeal: Math.max(0, Math.floor(minHeal))
              };
            }
          }
        } catch (_) { }

        const meta = {
          type: "player-meta",
          dodgeRate: Math.max(0, Math.min(0.95, finalDodgeRate)),
          damageReductionFlat: reduction,
          invulnerabilityDurationMs: invulnMs,
          skillInvulnerableUntil,
          critChanceBonusPct: Math.max(0, critChanceBonusPct), // ✅ 新增：爆擊率同步
          lifesteal,
          maxHealth: (typeof p.maxHealth === 'number' && p.maxHealth > 0) ? Math.floor(p.maxHealth) : null, // ✅ 新增：maxHealth 同步（多人元素，影響復活）
          // ⚠️ 修復：同步回血速度倍率（基礎回血、天賦回血、武器技能回血等）
          healthRegenSpeedMultiplier: (typeof p.healthRegenSpeedMultiplier === 'number' && p.healthRegenSpeedMultiplier > 0) ? p.healthRegenSpeedMultiplier : 1.0,
          // ⚠️ 修復：同步回血間隔（與單機一致：5000ms）
          healthRegenIntervalMs: (typeof p.healthRegenIntervalMs === 'number' && p.healthRegenIntervalMs > 0) ? Math.floor(p.healthRegenIntervalMs) : 5000
        };
        const sig = JSON.stringify(meta);
        if (sig !== tick._lastMetaSig) {
          tick._lastMetaSig = sig;
          _sendViaWebSocket(meta);
        } else {
          // 仍每隔一段時間送一次，避免伺服器重啟後吃不到
          _sendViaWebSocket(meta);
        }
        tick._lastMetaAt = now;
      }
    } catch (_) { }

    tick._lastSentX = Game.player.x;
    tick._lastSentY = Game.player.y;
    tick._lastSentAt = now;
    lastSendAt = now;
  }

  function getRemotePlayers() {
    return Array.from(remotePlayers.entries()).map(([uid, p]) => ({ uid, ...p }));
  }

  // M3：收集完整狀態快照（僅室長端）
  let lastSnapshotAt = 0;
  const SNAPSHOT_INTERVAL_MS = 300; // 每 300ms 發送一次快照（約 3.3Hz）

  function collectSnapshot() {
  // ✅ LEGACY：舊 host 快照系統（M3）— 權威多人已由伺服器 game-state 取代
  try { if (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) return null; } catch (_) { }
    if (!_isHost) return null;
    try {
      const snapshot = {
        players: {},
        boss: null,
        exit: null,
        enemies: [], // 添加敵人信息
        timestamp: Date.now()
      };

      // 收集所有玩家狀態（含 host 自己）
      try {
        if (typeof Game !== "undefined" && Game.player) {
          const p = Game.player;
          const hostMember = _membersState ? _membersState.get(_uid) : null;
          const hostCharacterId = (hostMember && hostMember.characterId) ? hostMember.characterId : (Game.selectedCharacter && Game.selectedCharacter.id) ? Game.selectedCharacter.id : null;
          snapshot.players[_uid] = {
            x: p.x || 0,
            y: p.y || 0,
            hp: p.health || 0,
            maxHp: p.maxHealth || 100,
            energy: p.energy || 0,
            maxEnergy: p.maxEnergy || 100,
            level: p.level || 1,
            exp: p.experience || 0,
            expToNext: p.experienceToNextLevel || 100,
            coins: Game.coins || 0, // 添加金幣字段
            name: getPlayerNickname(),
            characterId: hostCharacterId, // 添加角色ID，用於隊員端渲染完整角色外觀
            // 死亡和復活狀態同步
            _isDead: (typeof p._isDead === "boolean") ? p._isDead : false,
            _resurrectionProgress: (typeof p._resurrectionProgress === "number") ? p._resurrectionProgress : 0,
            // 大招狀態同步
            isUltimateActive: p.isUltimateActive || false,
            ultimateImageKey: p._ultimateImageKey || null,
            ultimateEndTime: p.ultimateEndTime || 0,
            width: p.width || CONFIG.PLAYER.SIZE,
            height: p.height || CONFIG.PLAYER.SIZE,
            collisionRadius: p.collisionRadius || (CONFIG.PLAYER.SIZE / 2)
          };
        }
      } catch (_) { }

      // 收集遠程玩家狀態
      try {
        const remoteStates = RemotePlayerManager.getAllStates();
        for (const [uid, state] of Object.entries(remoteStates)) {
          const member = _membersState ? _membersState.get(uid) : null;
          const name = (member && typeof member.name === "string") ? member.name : uid.slice(0, 6);
          // M4：遠程玩家已有完整的 Player 對象，使用真實狀態
          const remotePlayer = RemotePlayerManager.get(uid);
          const characterId = (member && member.characterId) ? member.characterId : null;
          if (remotePlayer) {
            snapshot.players[uid] = {
              x: remotePlayer.x || 0,
              y: remotePlayer.y || 0,
              hp: remotePlayer.health || 0,
              maxHp: remotePlayer.maxHealth || 100,
              energy: remotePlayer.energy || 0,
              maxEnergy: remotePlayer.maxEnergy || 100,
              level: remotePlayer.level || 1,
              exp: remotePlayer.experience || 0,
              expToNext: remotePlayer.experienceToNextLevel || 100,
              coins: Game.coins || 0, // 添加金幣字段（組隊模式共享金幣）
              name: name,
              characterId: characterId, // 添加角色ID，用於隊員端渲染完整角色外觀
              // 死亡和復活狀態同步
              _isDead: (typeof remotePlayer._isDead === "boolean") ? remotePlayer._isDead : false,
              _resurrectionProgress: (typeof remotePlayer._resurrectionProgress === "number") ? remotePlayer._resurrectionProgress : 0,
              // 大招狀態同步
              isUltimateActive: remotePlayer.isUltimateActive || false,
              ultimateImageKey: remotePlayer._ultimateImageKey || null,
              ultimateEndTime: remotePlayer.ultimateEndTime || 0,
              width: remotePlayer.width || CONFIG.PLAYER.SIZE,
              height: remotePlayer.height || CONFIG.PLAYER.SIZE,
              collisionRadius: remotePlayer.collisionRadius || (CONFIG.PLAYER.SIZE / 2)
            };
          } else {
            // 後備：如果遠程玩家對象不存在，使用簡化狀態
            snapshot.players[uid] = {
              x: state.x || 0,
              y: state.y || 0,
              hp: 100,
              maxHp: 100,
              energy: 0,
              maxEnergy: 100,
              level: 1,
              exp: 0,
              expToNext: 100,
              coins: Game.coins || 0, // 添加金幣字段（組隊模式共享金幣）
              name: name,
              characterId: characterId // 添加角色ID，用於隊員端渲染完整角色外觀
            };
          }
        }
      } catch (_) { }

      // 收集 BOSS 狀態
      try {
        if (typeof Game !== "undefined" && Game.boss) {
          const boss = Game.boss;
          snapshot.boss = {
            x: boss.x || 0,
            y: boss.y || 0,
            hp: boss.health || 0,
            maxHp: boss.maxHealth || 0,
            type: boss.type || "BOSS"
          };
        }
      } catch (_) { }

      // 收集出口狀態
      try {
        if (typeof Game !== "undefined" && Game.exit) {
          const exit = Game.exit;
          snapshot.exit = {
            x: exit.x || 0,
            y: exit.y || 0,
            width: exit.width || 0,
            height: exit.height || 0
          };
        }
      } catch (_) { }

      // ✅ MMO 架構：不再同步敵人，每個客戶端自己生成
      // 使用確定性生成確保所有客戶端生成相同的敵人
      // 敵人同步已移除，每個客戶端自己生成和更新敵人
      // snapshot.enemies 不再使用

      return snapshot;
    } catch (_) {
      return null;
    }
  }

  // M2：更新遠程玩家（僅室長端調用）
  // MMO 架構：每個玩家都更新遠程玩家，不依賴隊長端
  function updateRemotePlayers(deltaTime) {
    // ✅ MMO 架構：每個玩家都執行，更新遠程玩家的武器和攻擊效果
    try {
      // 更新所有遠程玩家的武器和攻擊效果
      RemotePlayerManager.updateAll(deltaTime);

      // 注意：狀態同步已由 tick 函數處理，這裡只更新遠程玩家的邏輯
      // 不再需要隊長端廣播，每個玩家都發送自己的狀態
    } catch (_) { }
  }

  // MMO 架構：每個玩家都可以清理遠程玩家（遊戲結束時）
  function clearRemotePlayers() {
    // ✅ MMO 架構：每個玩家都可以清理遠程玩家，不依賴隊長端
    try {
      RemotePlayerManager.clear();
    } catch (_) { }
  }

  // MMO 架構：每個玩家都廣播事件，不依賴隊長端
  function broadcastEventFromRuntime(eventType, eventData) {
    // ✅ MMO 架構：每個玩家都廣播自己的事件（攻擊、技能等），不依賴隊長端
    try {
      // 調用全局 broadcastEvent 函數
      if (typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
        window.SurvivalOnlineBroadcastEvent(eventType, eventData);
      }
    } catch (_) { }
  }

  // MMO 架構：每個玩家都直接發送消息，不依賴隊長端
  function sendToNet(obj) {
    if (!obj) return;
    // ✅ MMO 架構：每個玩家都直接通過 WebSocket 發送消息，不依賴隊長端
    // 注意：狀態同步已由 tick 函數處理，這裡主要用於發送事件（攻擊、技能等）
    _sendViaWebSocket(obj);
  }

  return { setEnabled, isEnabled, onStateMessage, onEventMessage, onSnapshotMessage, onFullSnapshotMessage, tick, getRemotePlayers, updateRemotePlayers, clearRemotePlayers, broadcastEvent: broadcastEventFromRuntime, sendToNet };
})();

// M2：全局事件廣播函數（供其他模組調用）
window.SurvivalOnlineBroadcastEvent = function (eventType, eventData) {
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

// ❌ 已刪除：_candidateIsRelay 函數（WebRTC 相關，不再需要）

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
        try {
          _instanceId = _getOrCreateInstanceId();
          _netUid = `${_uid}:${_instanceId}`;
        } catch (_) { }
        try { unsub(); } catch (_) { }
        resolve();
      }
    });
    // 若還沒登入，先匿名登入
    signInAnonymously(_auth).catch((e) => {
      // 常見原因：Authorized domains 沒加入、或瀏覽器阻擋第三方 cookie/存儲
      try { console.warn("[SurvivalOnline] signInAnonymously failed:", e); } catch (_) { }
    });
  });
  return _uid;
}

function _getLocalNetUid() {
  return (_netUid && typeof _netUid === "string") ? _netUid : _uid;
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
      // 獲取本地玩家的天賦等級
      let talentLevels = {};
      try {
        if (typeof TalentSystem !== "undefined" && typeof TalentSystem.getTalentLevels === "function") {
          talentLevels = TalentSystem.getTalentLevels();
        }
      } catch (_) { }

      // 獲取角色ID：優先使用 _pendingStartParams，其次使用 Game.selectedCharacter，最後使用默認角色
      let characterId = null;
      if (_pendingStartParams && _pendingStartParams.selectedCharacter && _pendingStartParams.selectedCharacter.id) {
        characterId = _pendingStartParams.selectedCharacter.id;
      } else if (typeof Game !== "undefined" && Game.selectedCharacter && Game.selectedCharacter.id) {
        characterId = Game.selectedCharacter.id;
      } else {
        // 如果沒有選擇角色，使用默認角色（第一位角色：margaret）
        if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS) && CONFIG.CHARACTERS.length > 0) {
          const defaultChar = CONFIG.CHARACTERS.find(c => c && c.id === 'margaret') || CONFIG.CHARACTERS[0];
          if (defaultChar && defaultChar.id) {
            characterId = defaultChar.id;
          }
        }
      }

      const iid = _instanceId || _getOrCreateInstanceId();
      await setDoc(memberDocRef(roomId, _uid), {
        uid: _uid,
        role: "host",
        ready: false,
        joinedAt: createdAt,
        lastSeenAt: createdAt,
        name: getPlayerNickname(),
        characterId: characterId,
        talentLevels: talentLevels, // 保存天賦等級
        hostInstanceId: iid,
        instances: {
          [iid]: {
            instanceId: iid,
            role: "host",
            ready: false,
            joinedAt: createdAt,
            lastSeenAt: createdAt,
            name: getPlayerNickname(),
            characterId: characterId,
            talentLevels: talentLevels
          }
        }
      }, { merge: true });

      // 啟動自動清理機制（主機端）
      startAutoCleanup();

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
  // 獲取本地玩家的天賦等級
  let talentLevels = {};
  try {
    if (typeof TalentSystem !== "undefined" && typeof TalentSystem.getTalentLevels === "function") {
      talentLevels = TalentSystem.getTalentLevels();
    }
  } catch (_) { }

  // 獲取角色ID：優先使用 _pendingStartParams，其次使用 Game.selectedCharacter，最後使用默認角色
  let characterId = null;
  if (_pendingStartParams && _pendingStartParams.selectedCharacter && _pendingStartParams.selectedCharacter.id) {
    characterId = _pendingStartParams.selectedCharacter.id;
  } else if (typeof Game !== "undefined" && Game.selectedCharacter && Game.selectedCharacter.id) {
    characterId = Game.selectedCharacter.id;
  } else {
    // 如果沒有選擇角色，使用默認角色（第一位角色：margaret）
    if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS) && CONFIG.CHARACTERS.length > 0) {
      const defaultChar = CONFIG.CHARACTERS.find(c => c && c.id === 'margaret') || CONFIG.CHARACTERS[0];
      if (defaultChar && defaultChar.id) {
        characterId = defaultChar.id;
      }
    }
  }

  try {
    const iid = _instanceId || _getOrCreateInstanceId();
    await setDoc(memberDocRef(roomId, _uid), {
      uid: _uid,
      role: "guest",
      ready: false,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      name: getPlayerNickname(),
      characterId: characterId,
      talentLevels: talentLevels, // 保存天賦等級
      instances: {
        [iid]: {
          instanceId: iid,
          role: "guest",
          ready: false,
          joinedAt: serverTimestamp(),
          lastSeenAt: serverTimestamp(),
          name: getPlayerNickname(),
          characterId: characterId,
          talentLevels: talentLevels
        }
      }
    }, { merge: true });
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
    } catch (_) { }
    // 小延遲避免剛寫入 member 後規則判定尚未就緒
    await new Promise((r) => setTimeout(r, 120));
  }
  const hostUid = data && data.hostUid ? data.hostUid : null;
  return { roomId, hostUid, mapId: data ? data.mapId : null, diffId: data ? data.diffId : null };
}

async function leaveRoom() {
  try {
    if (_activeRoomUnsub) { try { _activeRoomUnsub(); } catch (_) { } }
    if (_membersUnsub) { try { _membersUnsub(); } catch (_) { } }
    if (_signalsUnsub) { try { _signalsUnsub(); } catch (_) { } }
  } finally {
    _activeRoomUnsub = null;
    _membersUnsub = null;
    _signalsUnsub = null;
  }

  // ✅ 清理邏輯：清理遠程玩家
  try {
    if (typeof RemotePlayerManager !== "undefined" && RemotePlayerManager.clear) {
      RemotePlayerManager.clear();
    }
  } catch (_) { }

  // ✅ 清理邏輯：清理 Game.remotePlayers（避免殘留）
  try {
    if (typeof Game !== "undefined" && Array.isArray(Game.remotePlayers)) {
      Game.remotePlayers.length = 0;
    }
  } catch (_) { }

  // ✅ 清理邏輯：清理 Runtime 中的遠程玩家
  try {
    if (typeof Runtime !== "undefined" && typeof Runtime.setEnabled === "function") {
      Runtime.setEnabled(false);
    }
  } catch (_) { }

  // ✅ 清理邏輯：關閉 WebSocket 連接
  try {
    if (_ws) {
      _ws.onmessage = null;
      _ws.onopen = null;
      _ws.onclose = null;
      _ws.onerror = null;
      _ws.close();
    }
  } catch (_) { }
  _ws = null;
  _wsReconnectAttempts = 0;

  // ✅ 清理邏輯：停止自動清理
  stopAutoCleanup();

  // ✅ 清理邏輯：清理速率限制追蹤
  _rateLimitTracker.clear();

  Runtime.setEnabled(false);

  // ✅ 清理邏輯：移除成員
  try {
    if (_activeRoomId && _uid) {
      await deleteDoc(memberDocRef(_activeRoomId, _uid));
    }
  } catch (_) { }

  // ✅ 清理邏輯：若我是室長：嘗試關房（無後端下無法保證；規則允許就關）
  try {
    if (_isHost && _activeRoomId) {
      await updateDoc(roomDocRef(_activeRoomId), { status: "closed", updatedAt: serverTimestamp() });
    }
  } catch (_) { }

  // ✅ 清理邏輯：重置所有狀態變量
  _activeRoomId = null;
  _isHost = false;
  _hostUid = null;
  _roomState = null;
  _membersState = new Map();

  // ✅ 清理邏輯：停止心跳
  try { if (_memberHeartbeatTimer) clearInterval(_memberHeartbeatTimer); } catch (_) { }
  _memberHeartbeatTimer = null;

  // ✅ 清理邏輯：停止開局倒數（避免離開後誤觸發進入遊戲）
  try { if (_startTimer) clearTimeout(_startTimer); } catch (_) { }
  _startTimer = null;
  _startSessionId = null;

  // ✅ 清理邏輯：清理重連計時器
  try { if (_reconnectTimer) clearTimeout(_reconnectTimer); } catch (_) { }
  _reconnectTimer = null;
  _reconnectAttempts = 0;

  // ✅ 清理邏輯：離開房間時清理暱稱（避免跨房間污染）
  // ✅ 修復：不要清掉暱稱（會導致開局/重連時名字回退，甚至兩端看起來同名）
  // 暱稱屬於玩家偏好，應保留；多開衝突已用 sessionStorage per-instance 解決。
}

async function setReady(ready) {
  if (!_activeRoomId) return;
  await ensureAuth();
  const iid = _instanceId || _getOrCreateInstanceId();
  await updateDoc(memberDocRef(_activeRoomId, _uid), {
    ready: !!ready,
    lastSeenAt: serverTimestamp(),
    [`instances.${iid}.ready`]: !!ready,
    [`instances.${iid}.lastSeenAt`]: serverTimestamp(),
    [`instances.${iid}.name`]: getPlayerNickname(),
  });
}

function _startMemberHeartbeat() {
  try { if (_memberHeartbeatTimer) clearInterval(_memberHeartbeatTimer); } catch (_) { }
  _memberHeartbeatTimer = null;
  if (!_activeRoomId) return;
  _memberHeartbeatTimer = setInterval(async () => {
    try {
      if (!_activeRoomId || !_uid) return;
      // 只更新自己的 lastSeenAt（不影響 SaveCode/localStorage）
      const iid = _instanceId || _getOrCreateInstanceId();
      await updateDoc(memberDocRef(_activeRoomId, _uid), {
        lastSeenAt: serverTimestamp(),
        [`instances.${iid}.lastSeenAt`]: serverTimestamp(),
        [`instances.${iid}.name`]: getPlayerNickname(),
      });
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
  } catch (_) { }
  return 0;
}

async function hostUpdateSettings({ mapId, diffId }) {
  if (!_activeRoomId || !_isHost) return;
  const patch = { updatedAt: serverTimestamp() };
  if (mapId) patch.mapId = mapId;
  if (diffId) patch.diffId = diffId;
  await updateDoc(roomDocRef(_activeRoomId), patch);

  // 更新房間狀態以延長過期時間
  if (_roomState) {
    _roomState.updatedAt = Date.now();
    _roomState._lastUpdateMs = Date.now();
  }
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

  // 更新房間狀態以延長過期時間
  if (_roomState) {
    _roomState.updatedAt = Date.now();
    _roomState._lastUpdateMs = Date.now();
    _roomState.status = "starting";
  }
}

async function sendSignal(payload) {
  if (!_activeRoomId) {
    console.warn(`[SurvivalOnline] sendSignal: 跳過，activeRoomId 為空`);
    return;
  }
  try {
    // 注意：sendSignal 現在只用於房間管理信令（如 starting 狀態），不再用於 WebRTC
    await addDoc(signalsColRef(_activeRoomId), { ...payload, createdAt: serverTimestamp() });
    console.log(`[SurvivalOnline] sendSignal: 已發送信號 type=${payload.type}, toUid=${payload.toUid}`);
  } catch (e) {
    console.error(`[SurvivalOnline] sendSignal: 發送失敗 type=${payload.type}, toUid=${payload.toUid}:`, e);
    throw e; // 重新拋出以便調用者處理
  }
}

function listenRoom(roomId) {
  if (_activeRoomUnsub) { try { _activeRoomUnsub(); } catch (_) { } }
  _activeRoomUnsub = onSnapshot(
    roomDocRef(roomId),
    (snap) => {
      _roomState = snap.exists() ? (snap.data() || null) : null;
      const oldHostUid = _hostUid;
      if (_roomState && _roomState.hostUid) {
        _hostUid = _roomState.hostUid;
        // ⚠️ 修复：只在 hostUid 真正改变时输出日志，避免频繁输出
        if (_hostUid !== oldHostUid) {
          console.log(`[SurvivalOnline] listenRoom: 設置 hostUid=${_hostUid}, 舊值=${oldHostUid}`);
        }
        // ✅ 重要：不要在「大廳/未開局」就連 WebSocket
        // 原因：
        // - 連線失敗會觸發重連/清理流程，可能把玩家誤導到遊戲失敗或離開流程
        // - Runtime 若被啟用，可能在非生存模式也開始送同步封包（流量污染）
        // WebSocket 連線會在 status=starting → tryStartSurvivalFromRoom → startGame 時確保建立
      }

      // 更新本地 updatedAt 時間戳（用於過期檢查）
      if (_roomState && _roomState.updatedAt) {
        try {
          const updatedAt = _roomState.updatedAt;
          if (updatedAt && typeof updatedAt.toMillis === "function") {
            _roomState._lastUpdateMs = updatedAt.toMillis();
          } else if (typeof updatedAt === "number") {
            _roomState._lastUpdateMs = updatedAt;
          }
        } catch (_) { }
      }

      // 同步 host 的下拉（避免用輪詢）
      _syncHostSelectsFromRoom();
      updateLobbyUI();

      // 房間被室長解散/關閉：所有人自動離開回到遊戲開始畫面
      if (_roomState && _roomState.status === "closed") {
        _setText("survival-online-status", "隊伍已解散");
        leaveRoom().catch(() => { });
        closeLobbyToStart(); // ✅ 離開房間後回到遊戲開始畫面
        return;
      }

      // 若開始遊戲，觸發進入
      if (_roomState && _roomState.status === "starting") {
        // 主機端：啟動自動清理機制
        if (_isHost) {
          startAutoCleanup();
        }
        tryStartSurvivalFromRoom();
      }
    },
    (err) => {
      // 被踢出隊伍後，Rules 會使 isMember=false，room read 會 permission-denied
      try {
        const code = err && err.code ? String(err.code) : "";
        if (code.includes("permission-denied")) {
          _setText("survival-online-status", "你已被室長移出隊伍");
          leaveRoom().catch(() => { });
          closeLobbyToStart(); // ✅ 離開房間後回到遊戲開始畫面
          return;
        }
        const msg = (err && err.message) ? String(err.message) : "房間監聽錯誤";
        _setText("survival-online-status", `房間監聽錯誤：${msg}`);
        console.warn("[SurvivalOnline] room listener error:", err);
      } catch (_) { }
    }
  );
}

function listenMembers(roomId) {
  if (_membersUnsub) { try { _membersUnsub(); } catch (_) { } }
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
          } catch (_) { }
        }
      }
      _membersState = m;

      // ✅ 室長側：檢查房間是否為空，如果為空則自動刪除房間
      try {
        if (_isHost && _activeRoomId) {
          const memberCount = _membersState.size;
          // 如果房間為空（沒有成員），自動刪除房間
          if (memberCount === 0) {
            console.log(`[SurvivalOnline] 房間 ${_activeRoomId} 已空，自動刪除`);
            const roomIdToDelete = _activeRoomId;
            // 清理本地狀態（先清理，避免後續操作）
            _activeRoomId = null;
            _isHost = false;
            _hostUid = null;
            _roomState = null;
            stopAutoCleanup();
            // 異步刪除房間文檔（不等待，避免阻塞）
            (async () => {
              try {
                // 刪除房間文檔（Firestore 會自動刪除子集合）
                await deleteDoc(roomDocRef(roomIdToDelete));
              } catch (e) {
                console.warn(`[SurvivalOnline] 刪除空房間失敗:`, e);
                // 如果刪除失敗，至少設置為 closed 狀態
                try {
                  await updateDoc(roomDocRef(roomIdToDelete), { status: "closed", updatedAt: serverTimestamp() });
                } catch (_) { }
              }
            })().catch(() => { });
            return; // 不再更新 UI，因為房間已不存在
          }
        }
      } catch (e) {
        console.warn("[SurvivalOnline] 檢查空房間失敗:", e);
      }

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
              hostKickMember(extras[i].uid).catch(() => { });
            }
          }
        }
      } catch (_) { }

      updateLobbyUI();
    },
    (err) => {
      try {
        const code = err && err.code ? String(err.code) : "";
        if (code.includes("permission-denied")) {
          _setText("survival-online-status", "你已被室長移出隊伍");
          leaveRoom().catch(() => { });
          closeLobbyToStart(); // ✅ 離開房間後回到遊戲開始畫面
          return;
        }
        const msg = (err && err.message) ? String(err.message) : "成員監聽錯誤";
        _setText("survival-online-status", `成員監聽錯誤：${msg}`);
        console.warn("[SurvivalOnline] members listener error:", err);
      } catch (_) { }
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
    } catch (_) { }
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
  } catch (_) { }
  await leaveRoom().catch(() => { });
  closeLobbyToStart(); // ✅ 離開房間後回到遊戲開始畫面
  _setText("survival-online-status", "隊伍已解散");
}

function listenSignals(roomId) {
  // ✅ 權威伺服器模式：不再使用 Firebase signaling 通道
  // 避免「舊組隊系統」被誤啟用後，與 WebSocket game-state 權威互打。
  try {
    if (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) return;
  } catch (_) { }
  if (_signalsUnsub) { try { _signalsUnsub(); } catch (_) { } }
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
      console.log(`[SurvivalOnline] listenSignals: 收到 ${snap.docChanges().length} 個信號變更`);
      // 關鍵：使用 for...of 循環確保異步操作按順序執行
      (async () => {
        for (const ch of snap.docChanges()) {
          if (ch.type !== "added") {
            console.log(`[SurvivalOnline] listenSignals: 跳過非 added 變更 type=${ch.type}`);
            continue;
          }
          const sig = ch.doc.data() || {};
          const sid = ch.doc.id;
          console.log(`[SurvivalOnline] listenSignals: 處理信號 sid=${sid}, type=${sig.type}, fromUid=${sig.fromUid}, toUid=${sig.toUid}`);
          try {
            await handleSignal(sig);
          } catch (e) {
            console.error(`[SurvivalOnline] listenSignals: 處理信號失敗:`, e);
          }
          // 消費後刪除，避免重播
          try {
            await deleteDoc(doc(_db, "rooms", roomId, "signals", sid));
            console.log(`[SurvivalOnline] listenSignals: 已刪除信號 sid=${sid}`);
          } catch (e) {
            console.error(`[SurvivalOnline] listenSignals: 刪除信號失敗:`, e);
          }
        }
      })();
    },
    (err) => {
      // 避免「Uncaught Error in snapshot listener」導致整個監聽器掛掉而無提示
      try {
        const msg = (err && err.message) ? String(err.message) : "監聽器錯誤";
        _setText("survival-online-status", `信令監聽錯誤：${msg}`);
        console.warn("[SurvivalOnline] signals listener error:", err);
      } catch (_) { }
    }
  );
}

// 連接 WebSocket 服務器
async function connectWebSocket() {
  if (!_activeRoomId || !_uid) {
    console.log(`[SurvivalOnline] connectWebSocket: 跳過，activeRoomId=${_activeRoomId}, uid=${_uid}`);
    return;
  }
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    console.log(`[SurvivalOnline] connectWebSocket: WebSocket 已連接，跳過`);
    return;
  }
  if (_ws) {
    // 關閉舊連接
    try {
      _ws.close();
    } catch (_) { }
  }

  console.log(`[SurvivalOnline] connectWebSocket: 開始連接，activeRoomId=${_activeRoomId}, uid=${_uid}, isHost=${_isHost}`);

  // ✅ 多端點 + 連線超時：避免 readyState=0 永久卡住導致「只能移動圖片」
  const urls = Array.isArray(WEBSOCKET_CANDIDATE_URLS) && WEBSOCKET_CANDIDATE_URLS.length
    ? WEBSOCKET_CANDIDATE_URLS
    : [WEBSOCKET_SERVER_URL];

  let lastErr = null;
  for (const url of urls) {
    try {
      _setText("survival-online-status", `連線中... (${url})`);
      console.log(`[SurvivalOnline] connectWebSocket: 嘗試 ${url}`);

      _ws = new WebSocket(url);
      const wsRef = _ws;
      _netStats.wsUrl = url;
      _wsJoinedAck = false;

      // 連線超時計時器（CONNECTING 卡住時，onerror/onclose 可能不會觸發）
      let timeoutId = null;
      timeoutId = setTimeout(() => {
        try {
          if (wsRef && wsRef.readyState === WebSocket.CONNECTING) {
            console.warn(`[SurvivalOnline] connectWebSocket: 連線超時，關閉並切換下一個 URL: ${url}`);
            try { wsRef.close(); } catch (_) { }
          }
        } catch (_) { }
      }, WS_CONNECT_TIMEOUT_MS);

      const opened = await new Promise((resolve, reject) => {
        wsRef.onopen = () => resolve(true);
        wsRef.onerror = (e) => reject(e || new Error("ws error"));
        wsRef.onclose = () => reject(new Error("ws closed"));
      });
      try { if (timeoutId) clearTimeout(timeoutId); } catch (_) { }
      if (!opened) throw new Error("ws not opened");

      console.log(`[SurvivalOnline] connectWebSocket: WebSocket 已打開 url=${url}`);
      _wsReconnectAttempts = 0;
      _netStats.joinedAt = Date.now();
      _updateNetStatusLine("opened");

      // 發送加入房間消息
      // ✅ 計算本地玩家的 maxHealth（包含角色屬性和天賦效果）
      // 注意：此時 Game.player 可能還未創建，所以先發送默認值，後續在 new-session 時會更新
      let initialMaxHealth = 200; // 默認值
      if (typeof Game !== 'undefined' && Game.player && typeof Game.player.maxHealth === 'number') {
        initialMaxHealth = Game.player.maxHealth;
      }
      wsRef.send(JSON.stringify({
        type: 'join',
        roomId: _activeRoomId,
        uid: _getLocalNetUid(),
        authUid: _uid,
        instanceId: (_instanceId || _getOrCreateInstanceId()),
        isHost: _isHost,
        // ✅ 讓伺服器知道角色/暱稱，否則隊友端可能看不到正確貼圖（或全部變同一隻）
        characterId: (typeof Game !== 'undefined' && Game.selectedCharacter && Game.selectedCharacter.id) ? Game.selectedCharacter.id : 'pineapple',
        nickname: (typeof getPlayerNickname === 'function') ? getPlayerNickname() : '玩家',
        // ✅ 發送初始 maxHealth（如果已計算）
        maxHealth: initialMaxHealth
      }));

      // ✅ 权威服务器：发送CONFIG数据到服务器（用于敌人生成）
      if (typeof CONFIG !== 'undefined') {
        // 只发送必要的CONFIG数据（减少流量）
        // ✅ 修复：添加 DIFFICULTY 和 BULLET_SYSTEM，服务器需要这些配置来检查难度设置
        const configData = {
          WAVES: CONFIG.WAVES || null,
          ENEMIES: CONFIG.ENEMIES || null,
          OPTIMIZATION: CONFIG.OPTIMIZATION || null,
          TUNING: CONFIG.TUNING || null,
          DIFFICULTY: CONFIG.DIFFICULTY || null,
          BULLET_SYSTEM: CONFIG.BULLET_SYSTEM || null
        };

        setTimeout(() => {
          if (wsRef && wsRef.readyState === WebSocket.OPEN) {
            // ⚠️ 修復：_sendViaWebSocket 會自動包一層 {type:'game-data', data: obj}
            // 這裡只需要送內層 data，避免變成 data.type='game-data' 導致服務器忽略
            _sendViaWebSocket({
              type: 'config',
              config: configData,
              diffId: (typeof Game !== 'undefined' && Game.selectedDifficultyId) ? Game.selectedDifficultyId : 'EASY',
              mapId: (typeof Game !== 'undefined' && Game.selectedMap && Game.selectedMap.id) ? Game.selectedMap.id : null
            });
          }
        }, 100); // 延迟100ms确保连接已建立
      }

      // ✅ 权威服务器：发送地图信息到服务器（用于路口车辆生成等）
      if (typeof Game !== 'undefined' && Game.selectedMap) {
        setTimeout(() => {
          if (wsRef && wsRef.readyState === WebSocket.OPEN) {
            _sendViaWebSocket({
              type: 'map',
              map: {
                id: Game.selectedMap.id || null,
                name: Game.selectedMap.name || null
              }
            });
          }
        }, 200); // 延迟200ms确保CONFIG已发送
      }

      // ✅ 权威服务器：发送世界大小到服务器（确保与客户端一致）
      // 720P九宫格：3840x2160 (1280*3 x 720*3)
      // 4K模式：根据实际配置
      if (typeof Game !== 'undefined' && typeof Game.worldWidth === 'number' && typeof Game.worldHeight === 'number') {
        setTimeout(() => {
          if (wsRef && wsRef.readyState === WebSocket.OPEN) {
            _sendViaWebSocket({
              type: 'world-size',
              worldWidth: Game.worldWidth,
              worldHeight: Game.worldHeight
            });
          }
        }, 300); // 延迟300ms确保地图信息已发送
      }

      _setText("survival-online-status", "已連線（WebSocket）");

      wsRef.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);

        if (msg.type === 'joined') {
          console.log(`[SurvivalOnline] connectWebSocket: 已加入房間`);
          _wsJoinedAck = true;
          try { _flushWsQueue(); } catch (_) { }
          _updateNetStatusLine("joined");
        } else if (msg.type === 'game-state') {
          // ✅ 权威服务器：接收服务器游戏状态（節流處理，避免 60Hz 壓垮前端）
          const now = Date.now();
          if (now - _lastServerGameStateAt >= 33) { // ~30Hz
            _lastServerGameStateAt = now;
            _netStats.gameStateCount++;
            _netStats.lastGameStateAt = now;
            try {
              const s = msg.state || {};
              _netStats.lastStateSizes = {
                players: Array.isArray(s.players) ? s.players.length : 0,
                enemies: Array.isArray(s.enemies) ? s.enemies.length : 0,
                projectiles: Array.isArray(s.projectiles) ? s.projectiles.length : 0,
                orbs: Array.isArray(s.experienceOrbs) ? s.experienceOrbs.length : 0,
              };
              // 如果一直是空世界，這裡會直接顯示出來（e=0, pr=0）
              _updateNetStatusLine();
            } catch (_) { }
            handleServerGameState(msg.state, msg.timestamp);
          }
        } else if (msg.type === 'game-data') {
          // 處理遊戲數據
          const data = msg.data;
          // ✅ sessionId 防串房/防舊局封包：若 sessionId 不一致，直接丟棄
          try {
            const curSid = (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.sessionId) ? Game.multiplayer.sessionId : null;
            if (curSid && data && typeof data === "object" && data.sessionId && data.sessionId !== curSid) {
              return;
            }
          } catch (_) { }
          // 優先使用 fromUid（WebSocket 消息格式），其次使用 uid
          const senderUid = (msg.fromUid && typeof msg.fromUid === "string") ? msg.fromUid : (msg.uid && typeof msg.uid === "string") ? msg.uid : null;

          // ✅ 權威伺服器模式：兼容 server 發的「data.type」（非 data.t）
          // 例如：websocket-server.js 會廣播 { data: { type: 'chest_collected', ... } }
          try {
            if (data && typeof data === "object" && typeof data.type === "string") {
              if (data.type === "chest_collected") {
                Runtime.onEventMessage({ t: "event", type: "chest_collected", data });
                return;
              }
            }
          } catch (_) { }

          if (data.t === "state") {
            Runtime.onStateMessage(data);
          } else if (data.t === "event") {
            Runtime.onEventMessage(data);
          } else if (data.t === "snapshot") {
            Runtime.onSnapshotMessage(data);
          } else if (data.t === "full_snapshot") {
            Runtime.onFullSnapshotMessage(data);
          } else if (data.t === "enemy_damage") {
            // ✅ 腫瘤切除：傷害數字改走伺服器 hitEvents（server/game-state.js），不再處理 enemy_damage 消息
            // _handleEnemyDamageMessage 已廢棄，傷害計算完全由伺服器權威處理
          } else if (data.t === "ultimate_pineapple") {
            // ✅ MMORPG 架構：所有玩家都處理 ultimate_pineapple 消息，同步鳳梨大絕掉落物
            _handleUltimatePineappleMessage(senderUid, data);
          } else if (data.t === "weapon_upgrade") {
            // ✅ MMORPG 架構：所有玩家都處理 weapon_upgrade 消息，同步武器升級
            _handleWeaponUpgradeMessage(senderUid, data);
          } else if (data.t === "input") {
            // ✅ MMORPG 架構：所有玩家都處理 input 消息，同步遠程玩家移動
            _handleInputMessage(senderUid, data);
          } else if (data.t === "vfx") {
            // ✅ 多人元素（視覺特效）：VFX 事件（WS 轉發）— 所有人都看得到
            _applyVfxEvent(data.eventType, data.eventData);
          }
        } else if (msg.type === 'user-joined' || msg.type === 'user-left') {
          // 用戶加入/離開通知（可選）
          console.log(`[SurvivalOnline] connectWebSocket: ${msg.type}, uid=${msg.uid}`);
        }
      } catch (e) {
        console.error(`[SurvivalOnline] connectWebSocket: 處理消息失敗:`, e);
      }
    };

      wsRef.onclose = () => {
      console.log(`[SurvivalOnline] connectWebSocket: WebSocket 已關閉`);
      Runtime.setEnabled(false);
      _setText("survival-online-status", "連線已中斷");
        _updateNetStatusLine("closed");

      // 自動重連機制
      if (_wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        _wsReconnectAttempts++;
        _setText("survival-online-status", `重新連線中... (${_wsReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        console.log(`[SurvivalOnline] 自動重連嘗試 ${_wsReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

        setTimeout(() => {
          connectWebSocket().catch((e) => {
            console.warn("[SurvivalOnline] 自動重連失敗:", e);
          });
        }, RECONNECT_DELAY_MS);
      } else {
        console.log("[SurvivalOnline] 自動重連失敗次數過多，返回大廳");
        _setText("survival-online-status", "連線失敗，返回大廳");
        _wsReconnectAttempts = 0;
        setTimeout(() => {
          // ✅ 修復：連線失敗不應觸發 Game.gameOver()
          // 連線中斷 ≠ 遊戲失敗；這裡只做「離開房間 + 回到開始畫面」避免誤判敗北
          leaveRoom().catch(() => { });
          closeLobbyToStart(); // ✅ 離開房間後回到遊戲開始畫面
        }, 1000);
      }
    };

      wsRef.onerror = (err) => {
      console.error(`[SurvivalOnline] connectWebSocket: WebSocket 錯誤:`, err);
      // 检查是否是证书错误（Firefox 和 Chrome 的错误信息不同）
      const errorMsg = err.message || err.toString() || '';
      const isCertError = errorMsg.includes('CERT_AUTHORITY_INVALID') ||
        errorMsg.includes('SEC_ERROR_UNKNOWN_ISSUER') ||
        errorMsg.includes('SSL_ERROR_BAD_CERT_DOMAIN') ||
        errorMsg.includes('证书') ||
        errorMsg.includes('certificate');

      if (isCertError) {
        // Firefox 需要单独访问 HTTPS 页面接受证书
        const browser = navigator.userAgent.includes('Firefox') ? 'Firefox' : '浏览器';
        _setText("survival-online-status", `連線失敗：WebSocket 錯誤（請檢查網絡連接）`);
        console.warn(`[SurvivalOnline] 证书错误：WebSocket 連接失敗，請檢查網絡連接`);
      } else {
        _setText("survival-online-status", "連線失敗：WebSocket 錯誤");
      }
    };

      // 成功建立並掛好 handler 後，直接返回
      return;
    } catch (e) {
      lastErr = e;
      console.warn(`[SurvivalOnline] connectWebSocket: ${url} 失敗/超時，嘗試下一個`, e);
      try { if (_ws) _ws.close(); } catch (_) { }
      _ws = null;
    }
  }

  console.error(`[SurvivalOnline] connectWebSocket: 全部候選 URL 皆失敗`, lastErr);
  _setText("survival-online-status", "連線失敗：WebSocket 無法連上（可能是 8080 被封鎖/未配置 443）");
  throw (lastErr || new Error("WebSocket connect failed"));
}

// ❌ 已刪除：舊的 WebRTC 函數（connectClientToHost, hostAcceptOffer）
// 系統已切換到 WebSocket，不再需要 WebRTC 相關代碼

// 通過 WebSocket 發送消息
function _sendViaWebSocket(obj) {
  // ✅ 權威伺服器模式：硬斷路舊通道封包（避免殘留 LEGACY 邏輯送包吃流量/干擾）
  // 這些 t:"state/snapshot/full_snapshot/pos" 都屬於舊 host/client 權威同步，不應在多人權威房間出現。
  try {
    if (
      typeof Game !== "undefined" &&
      Game.multiplayer &&
      Game.multiplayer.enabled &&
      obj &&
      typeof obj === "object" &&
      typeof obj.t === "string"
    ) {
      const legacyT = obj.t;
      if (legacyT === "state" || legacyT === "snapshot" || legacyT === "full_snapshot" || legacyT === "pos") {
        return;
      }
    }
  } catch (_) { }
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    try {
      // ✅ sessionId 防串房/防舊局封包：若目前有 sessionId，盡量附在 data 內
      // 注意：只影響組隊系統；單機不會呼叫 _sendViaWebSocket
      let payloadObj = obj;
      try {
        const sid = (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.sessionId) ? Game.multiplayer.sessionId : null;
        if (sid && payloadObj && typeof payloadObj === "object" && !payloadObj.sessionId) {
          payloadObj = { ...payloadObj, sessionId: sid };
        }
      } catch (_) { }
      // ✅ 啟動線可靠：join 前先排隊，避免 server 忽略 game-data
      if (!_wsJoinedAck) {
        _enqueueWsData(payloadObj);
        return;
      }
      _ws.send(JSON.stringify({
        type: 'game-data',
        roomId: _activeRoomId,
        uid: _getLocalNetUid(),
        data: payloadObj
      }));
      // 添加日志以确认发送（仅对 pos 消息，避免日志过多）
      // （已停用 pos 廣播；保留 debug 訊息開關）
      if (SURVIVAL_ONLINE_DEBUG && obj && (obj.t || obj.type)) {
        console.log(`[SurvivalOnline] _sendViaWebSocket: sent ${(obj.t || obj.type)}, isHost=${_isHost}, uid=${_uid}`);
      }
    } catch (e) {
      console.error(`[SurvivalOnline] _sendViaWebSocket: 發送失敗:`, e);
    }
  } else {
    // ✅ ws 尚未 OPEN：排隊（例如 reset 早於 onopen 的 obstacles/decorations）
    try { _enqueueWsData(obj); } catch (_) { }
    // ✅ 節流：ws 未連上時不要每 33ms 刷屏
    const now = Date.now();
    if (!_sendViaWebSocket._lastWarnAt || (now - _sendViaWebSocket._lastWarnAt > 1500)) {
      _sendViaWebSocket._lastWarnAt = now;
      console.warn(`[SurvivalOnline] _sendViaWebSocket: WebSocket 不可用，消息未發送`, {
        wsReadyState: _ws ? _ws.readyState : 'null',
        messageType: obj ? (obj.t || obj.type) : undefined
      });
    }
  }
}

// ✅ 多人元素（視覺特效）：VFX 套用（所有人都看得到）
function _applyVfxEvent(eventType, eventData) {
  try {
    if (typeof Game === "undefined") return;
    if (eventType === "explosion_particles") {
      if (eventData && Array.isArray(eventData.particles)) {
        if (!Game.explosionParticles) Game.explosionParticles = [];
        // ✅ 防卡：一次最多處理 350 顆
        const list = eventData.particles.slice(0, 350);
        for (const particleData of list) {
          if (particleData && particleData.x !== undefined && particleData.y !== undefined) {
            Game.explosionParticles.push({
              x: particleData.x,
              y: particleData.y,
              vx: particleData.vx || 0,
              vy: particleData.vy || 0,
              life: particleData.life || 1000,
              maxLife: particleData.maxLife || 1000,
              size: particleData.size || 3,
              color: particleData.color || "#ff0000",
              source: particleData.source || null
            });
          }
        }
      }
    } else if (eventType === "screen_effect") {
      if (eventData && typeof eventData === "object") {
        // ✅ 開放世界感：距離過遠的爆炸不應震動/閃光（避免全圖抖動）
        try {
          if (typeof eventData.x === "number" && typeof eventData.y === "number" && Game.player) {
            const dx = (Game.player.x || 0) - eventData.x;
            const dy = (Game.player.y || 0) - eventData.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // 1200px 內才套用（可視距/地圖大小的保守值）
            if (dist > 1200) return;
          }
        } catch (_) { }
        if (eventData.screenFlash && typeof eventData.screenFlash === "object") {
          if (!Game.screenFlash) Game.screenFlash = { active: false, intensity: 0, duration: 0 };
          Game.screenFlash.active = eventData.screenFlash.active || false;
          Game.screenFlash.intensity = eventData.screenFlash.intensity || 0.3;
          Game.screenFlash.duration = eventData.screenFlash.duration || 150;
        }
        if (eventData.cameraShake && typeof eventData.cameraShake === "object") {
          // ✅ 震動屬於單機元素：只允許「自己角色」觸發鏡頭震動
          // eventData.playerUid 由發送端（client vfx）或伺服器 vfxEvents（命中玩家）提供
          const me = _getLocalNetUid ? _getLocalNetUid() : _uid;
          if (eventData.playerUid && eventData.playerUid === me) {
            if (!Game.cameraShake) Game.cameraShake = { active: false, intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
            Game.cameraShake.active = eventData.cameraShake.active || false;
            Game.cameraShake.intensity = eventData.cameraShake.intensity || 8;
            Game.cameraShake.duration = eventData.cameraShake.duration || 200;
          }
        }
      }
    }
  } catch (_) { }
}

// 通過 Firebase 發送消息（替代 WebRTC DataChannel）
async function sendMessageViaFirebase(toUid, message) {
  if (!_activeRoomId || !_uid || !toUid) return;
  try {
    await addDoc(collection(_db, "rooms", _activeRoomId, "messages"), {
      fromUid: _uid,
      toUid: toUid,
      message: message,
      createdAt: serverTimestamp(),
      consumed: false
    });
  } catch (e) {
    console.error(`[SurvivalOnline] sendMessageViaFirebase: 發送失敗:`, e);
    throw e;
  }
}

// 監聽 Firebase 消息（替代 WebRTC DataChannel）
let _messagesUnsub = null;
function listenMessages(roomId) {
  // ✅ 權威伺服器模式：不再使用 Firebase messages 通道
  // 避免舊 client-authoritative 同步復活造成互打/空世界/重複生成。
  try {
    if (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) return;
  } catch (_) { }
  if (_messagesUnsub) { try { _messagesUnsub(); } catch (_) { } }
  const q = query(
    collection(_db, "rooms", roomId, "messages"),
    where("toUid", "==", _uid),
    where("consumed", "==", false),
    orderBy("createdAt", "asc"),
    limit(100)
  );
  _messagesUnsub = onSnapshot(
    q,
    (snap) => {
      (async () => {
        for (const ch of snap.docChanges()) {
          if (ch.type !== "added") continue;
          const msgDoc = ch.doc;
          const data = msgDoc.data() || {};
          const fromUid = data.fromUid;
          const message = data.message;

          if (!fromUid || !message) continue;

          // 處理消息
          try {
            if (_isHost) {
              handleHostDataMessage(fromUid, message);
            } else {
              // 隊員端處理來自 host 的消息
              if (message.t === "state") {
                Runtime.onStateMessage(message);
              } else if (message.t === "event") {
                Runtime.onEventMessage(message);
              } else if (message.t === "snapshot") {
                Runtime.onSnapshotMessage(message);
              }
            }
          } catch (e) {
            console.error(`[SurvivalOnline] listenMessages: 處理消息失敗:`, e);
          }

          // 標記為已消費並刪除
          try {
            await updateDoc(msgDoc.ref, { consumed: true });
            await deleteDoc(msgDoc.ref);
          } catch (e) {
            console.error(`[SurvivalOnline] listenMessages: 標記消息失敗:`, e);
          }
        }
      })();
    },
    (err) => {
      console.error(`[SurvivalOnline] listenMessages: 監聽錯誤:`, err);
    }
  );
}

// M5：發送全量快照給指定隊員（用於重連恢復）
function sendFullSnapshotToClient(targetUid) {
  // ✅ LEGACY：舊重連全量快照（M5）— 權威多人已由伺服器 state 全量同步取代
  try { if (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) return; } catch (_) { }
  if (!_isHost || !targetUid) return;
  try {
    const snapshot = collectSnapshot();
    if (!snapshot) return;

    // 添加額外的全量信息（敵人、掉落物等）
    const fullSnapshot = {
      ...snapshot,
      t: "full_snapshot", // 標記為全量快照
      sessionId: (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.sessionId) ? Game.multiplayer.sessionId : null,
      gameTime: (typeof Game !== "undefined" && typeof Game.gameTime === "number") ? Game.gameTime : 0,
      currentWave: (typeof WaveSystem !== "undefined" && typeof WaveSystem.currentWave === "number") ? WaveSystem.currentWave : 1,
      enemies: [],
      experienceOrbs: [],
      chests: [],
      projectiles: []
    };

    // 收集所有敵人狀態
    try {
      if (typeof Game !== "undefined" && Array.isArray(Game.enemies)) {
        for (const enemy of Game.enemies) {
          if (enemy && !enemy.markedForDeletion) {
            fullSnapshot.enemies.push({
              id: enemy.id || `enemy_${Date.now()}_${Math.random()}`,
              type: enemy.type || "ENEMY",
              x: enemy.x || 0,
              y: enemy.y || 0,
              hp: enemy.health || 0,
              maxHp: enemy.maxHealth || 0
            });
          }
        }
      }
    } catch (_) { }

    // 收集所有經驗球狀態
    try {
      if (typeof Game !== "undefined" && Array.isArray(Game.experienceOrbs)) {
        for (const orb of Game.experienceOrbs) {
          if (orb && !orb.markedForDeletion) {
            fullSnapshot.experienceOrbs.push({
              x: orb.x || 0,
              y: orb.y || 0,
              value: orb.value || 0
            });
          }
        }
      }
    } catch (_) { }

    // 收集所有寶箱狀態
    try {
      if (typeof Game !== "undefined" && Array.isArray(Game.chests)) {
        for (const chest of Game.chests) {
          if (chest && !chest.markedForDeletion) {
            fullSnapshot.chests.push({
              x: chest.x || 0,
              y: chest.y || 0
            });
          }
        }
      }
    } catch (_) { }

    // 發送給指定隊員（通過 WebSocket 廣播，服務器會轉發給目標用戶）
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _sendViaWebSocket(fullSnapshot);
      if (SURVIVAL_ONLINE_DEBUG) {
        console.log(`[SurvivalOnline] M5: 已發送全量快照給隊員 ${targetUid}`);
      }
    }
  } catch (e) {
    console.warn("[SurvivalOnline] M5: 發送全量快照失敗:", e);
  }
}

// MMO 架構：事件廣播系統（每個玩家都廣播自己的事件）
function broadcastEvent(eventType, eventData) {
  // ✅ MMO 架構：每個玩家都廣播自己的事件，不依賴隊長端
  if (!_activeRoomId) return;
  // ✅ 權威伺服器模式：多人進行中時，禁止廣播「世界權威事件」
  // 這些應完全由 server game-state 驅動，避免權威打架與流量浪費。
  try {
    if (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
      // ✅ 多人元素（視覺特效）：粒子/鏡頭效果走專用 vfx 通道（只轉發，不進入權威 state）
      // 音效已被定義為單機元素：不在此處播放/同步音效。
      if (eventType === "explosion_particles" || eventType === "screen_effect") {
        // ✅ 高頻保護：爆炸粒子可能每幀產生，需合併/限速，否則流量爆炸
        if (!broadcastEvent._vfx) broadcastEvent._vfx = { pendingParticles: [], lastSendAt: 0, flushTimer: null };
        const vfx = broadcastEvent._vfx;

        if (eventType === "explosion_particles") {
          const particles = (eventData && Array.isArray(eventData.particles)) ? eventData.particles : [];
          if (particles.length) {
            // 合併進待發送隊列（只保留最新一段，避免累積過大）
            // 上限：最多 350 顆（再多也看不出差異，反而會卡）
            const capped = particles.slice(0, 350);
            vfx.pendingParticles.push(...capped);
            if (vfx.pendingParticles.length > 350) {
              vfx.pendingParticles = vfx.pendingParticles.slice(vfx.pendingParticles.length - 350);
            }
          }

          const now = Date.now();
          const intervalMs = 100; // 10Hz
          const sendNow = (now - (vfx.lastSendAt || 0)) >= intervalMs;

          const flush = () => {
            vfx.flushTimer = null;
            if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
            if (!_wsJoinedAck) return;
            if (!vfx.pendingParticles.length) return;
            const out = vfx.pendingParticles.slice(0, 350);
            vfx.pendingParticles = [];
            vfx.lastSendAt = Date.now();
            _sendViaWebSocket({ type: "vfx", eventType: "explosion_particles", eventData: { particles: out } });
          };

          if (sendNow) {
            flush();
          } else if (!vfx.flushTimer) {
            vfx.flushTimer = setTimeout(flush, intervalMs);
          }
        } else {
          // screen_effect：低頻，直接送（仍加上 playerUid 供「只震自己」判斷）
          if (_ws && _ws.readyState === WebSocket.OPEN) {
            let ed = (eventData && typeof eventData === "object") ? eventData : {};
            try {
              if (!ed.playerUid) {
                const me = _getLocalNetUid ? _getLocalNetUid() : _uid;
                ed = { ...ed, playerUid: me };
              }
            } catch (_) { }
            _sendViaWebSocket({ type: "vfx", eventType, eventData: ed });
          }
        }
        return;
      }
      if (
        eventType === "wave_start" ||
        eventType === "enemy_spawn" ||
        eventType === "boss_spawn" ||
        eventType === "exp_orb_spawn" ||
        eventType === "exp_orb_collected" ||
        eventType === "chest_spawn" ||
        eventType === "chest_collected" ||
        eventType === "boss_projectile_spawn" ||
        eventType === "projectile_spawn" ||
        eventType === "obstacles_spawn" ||
        eventType === "decorations_spawn" ||
        eventType === "exit_spawn" ||
        eventType === "game_victory" ||
        eventType === "game_over"
      ) {
        return;
      }
    }
  } catch (_) { }
  const event = {
    t: "event",
    type: eventType,
    data: eventData,
    timestamp: Date.now()
  };
  // 使用 WebSocket 廣播給所有 client（通過服務器中繼，不暴露 IP）
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _sendViaWebSocket(event);
  }
}

// 速率限制追蹤（防止 DDoS 和濫用）
const _rateLimitTracker = new Map(); // uid -> { lastResetTime, counts: { damage, input, upgrade, lifesteal } }

function _checkRateLimit(uid, type, maxPerSecond) {
  const now = Date.now();
  if (!_rateLimitTracker.has(uid)) {
    _rateLimitTracker.set(uid, { lastResetTime: now, counts: {} });
  }
  const tracker = _rateLimitTracker.get(uid);

  // 每秒重置計數
  if (now - tracker.lastResetTime >= 1000) {
    tracker.counts = {};
    tracker.lastResetTime = now;
  }

  // 初始化計數
  if (!tracker.counts[type]) {
    tracker.counts[type] = 0;
  }

  // 檢查是否超過限制
  tracker.counts[type]++;
  if (tracker.counts[type] > maxPerSecond) {
    return false; // 超過限制
  }
  return true; // 允許
}

function _cleanupRateLimitTracker() {
  const now = Date.now();
  for (const [uid, tracker] of _rateLimitTracker.entries()) {
    // 清理超過 5 秒沒有活動的追蹤
    if (now - tracker.lastResetTime > 5000) {
      _rateLimitTracker.delete(uid);
    }
  }
}

// ✅ 权威服务器：处理服务器游戏状态
// ✅ 不影响单机：只在多人模式下执行（通过 Runtime.setEnabled 控制）
function handleServerGameState(state, timestamp) {
  if (!state || typeof state !== 'object') return;

  // ✅ 安全检查：只在多人模式下执行
  if (typeof Game === 'undefined' || !Game.multiplayer) return;
  
  // ⚠️ 修复：如果 Runtime 已停用（回到大厅后），不再处理服务器状态，节省流量
  // Runtime.setEnabled(false) 表示游戏已结束，回到大厅，不需要继续接收游戏状态
  if (typeof Runtime !== 'undefined' && typeof Runtime.isEnabled === 'function') {
    if (!Runtime.isEnabled()) {
      // Runtime 已停用，说明已经回到大厅，不再处理服务器状态，节省流量
      return;
    }
  }

  // ✅ 已移除清理相关代码（采用页面刷新方案，不再需要清理逻辑）

  // ⚠️ 修复：优先检查游戏结束状态，确保游戏结束画面一定会显示
  // 必须在所有其他逻辑之前检查，避免被其他逻辑提前返回而跳过
   
  // ⚠️ 修复：如果新游戏已开始，检查服务器是否已重置 isGameOver
  let shouldSkipGameOver = false; // 标记是否应该跳过游戏结束处理
  if (typeof Game !== 'undefined' && Game._newGameStarted) {
    if (!state.isGameOver) {
      // 服务器已重置 isGameOver = false，新游戏正式开始
      console.log('[SurvivalOnline] handleServerGameState: 服务器已重置 isGameOver = false，新游戏正式开始');
      // ⚠️ 修复：服务器已确认 isGameOver = false，现在可以安全地重置 _gameOverEventSent
      // 这样新游戏就可以正常触发游戏结束事件了
      Game._gameOverEventSent = false;
      Game._newGameStarted = false;
    } else {
      // 新游戏已开始，但服务器还在发送上一局的 isGameOver = true，忽略它
      // ⚠️ 修复：添加节流，避免频繁输出日志
      if (!_lastSkipGameOverLogTime) {
        _lastSkipGameOverLogTime = 0;
      }
      const now = Date.now();
      if (now - _lastSkipGameOverLogTime > 5000) { // 每5秒最多一次
        _lastSkipGameOverLogTime = now;
        // console.log('[SurvivalOnline] handleServerGameState: 新游戏已开始，忽略服务器残留的 isGameOver = true');
      }
      // ⚠️ 修复：保持 _gameOverEventSent = true，防止服务器残留状态触发游戏结束
      // 不需要显式设置，因为 _gameOverEventSent 在 startGame 中应该保持为 true
      shouldSkipGameOver = true; // 标记跳过游戏结束处理，但继续执行后续状态更新
    }
  }
  
  if (typeof Game !== 'undefined' && state.isGameOver && !shouldSkipGameOver) {
    // ⚠️ 修复：如果已经处理过游戏结束，直接跳过，避免循环
    // 服务器可能会持续发送 isGameOver = true，但客户端只需要处理一次
    if (Game._gameOverEventSent) {
      // 静默跳过，不需要日志，因为这是正常的（服务器持续发送状态）
      // ⚠️ 重要：不要 return，继续执行后续状态更新
    } else {
    
      // ⚠️ 修复：不要检查 Game.isGameOver，因为这是我们要设置的状态
      // 如果 _gameOverEventSent = false 且 state.isGameOver = true，说明服务器检测到游戏结束
      // 应该立即触发游戏结束，不管 Game.isGameOver 的当前值是什么
      
      console.log('[SurvivalOnline] handleServerGameState: 检测到 state.isGameOver = true');
      // ✅ 權威伺服器模式：遊戲結束由伺服器 state.isGameOver 觸發
      // ⚠️ 修复：不要在这里设置 _gameOverEventSent，让 Game.gameOver() 自己设置
      // 否则会导致 Game.gameOver() 内部的检查失败，直接返回而不执行后续逻辑
      Game.isGameOver = true;
      if (typeof Game.gameOver === 'function') {
        console.log('[SurvivalOnline] handleServerGameState: 调用 Game.gameOver()');
        Game.gameOver();
      } else {
        console.error('[SurvivalOnline] handleServerGameState: Game.gameOver 不是函数！');
      }
    }
  }

  try {
    _multiplayerSanityOnce();
    // 更新玩家状态
    if (Array.isArray(state.players)) {
      // ✅ 多人元素：提供給「遊戲內 HUD」使用（純顯示，不影響單機/升級選單）
      try { _setHudPlayersFromServer(state.players); } catch (_) { }
      for (const playerState of state.players) {
        if (playerState.uid === _getLocalNetUid()) {
          // 本地玩家：只同步关键状态（血量、能量等），位置由输入控制
          if (typeof Game !== 'undefined' && Game.player) {
            // ✅ session 切換：重置 delta 計數器，避免把舊場次收益重放一次
            try {
              const sid = (Game.multiplayer && Game.multiplayer.sessionId) ? Game.multiplayer.sessionId : null;
              if (sid && _lastCounterSessionId !== sid) {
                _lastCounterSessionId = sid;
                _sessionCountersPrimed = false;
                _lastSessionCoins = 0;
                _lastSessionExp = 0;
                // ⚠️ 修复：新 session 开始时，重置位置同步标志，确保使用服务器的新位置
                // 这很重要，因为客户端在 Game.reset() 中创建了新玩家在世界中心
                // 第一次收到服务器状态时，需要同步到服务器的位置（可能是上一局的位置，需要客户端立即发送移动输入来更新）
                _didServerPosSync = false;
                // ⚠️ 修复：新 session 开始时，重置 _lastHealth，避免继承上一局的血量
                handleServerGameState._lastHealth = undefined;
              }
            } catch (_) { }

            // ✅ 致命啟動線修復：第一次收到 server 的本地玩家座標，強制對齊一次
            // 否則會出現：怪在追伺服器座標，你的鏡頭跟著本地座標 → 看起來「沒有怪/沒有追蹤/只是移動圖片」
            // ✅ 修復：頁面恢復時也需要強制對齊，避免位置偏離（離開分頁太久後回來時）
            try {
              const shouldForceSync = !_didServerPosSync || 
                (typeof playerState.x === "number" && typeof playerState.y === "number" && 
                 typeof Game.player.x === "number" && typeof Game.player.y === "number" &&
                 (Math.abs(playerState.x - Game.player.x) > 300 || Math.abs(playerState.y - Game.player.y) > 300));
              
              if (shouldForceSync && typeof playerState.x === "number" && typeof playerState.y === "number") {
                Game.player.x = playerState.x;
                Game.player.y = playerState.y;
                // 重置 move 差分基準，避免下一幀送出巨量 vx/vy
                try {
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.Runtime && window.SurvivalOnlineRuntime.Runtime.tick) {
                    window.SurvivalOnlineRuntime.Runtime.tick._lastSentX = Game.player.x;
                    window.SurvivalOnlineRuntime.Runtime.tick._lastSentY = Game.player.y;
                    window.SurvivalOnlineRuntime.Runtime.tick._lastSentAt = Date.now();
                  }
                } catch (_) { }
                _didServerPosSync = true;
              }
            } catch (_) { }

            // ⚠️ 修復：不可用 `||`，否則 0 會被當成 false 導致不同步（例如死亡/清零）
            // ✅ 單機同源：檢測血量變化，觸發受傷紅閃效果（單機元素）
            // ⚠️ 修復：同步 maxHealth 時，如果 maxHealth 增加，也要同步增加 health
            // ⚠️ 修復：避免血条闪烁 - 只在 maxHealth 真的改变时才更新
            // ⚠️ 修復：先同步 maxHealth，再同步 health，避免 maxHealth 變化導致的 health 調整被誤判為受傷
            // ⚠️ 修复：新 session 开始时，强制同步 maxHealth 和 health，确保使用服务器的新状态
            if (typeof playerState.maxHealth === "number") {
              const sid = (Game.multiplayer && Game.multiplayer.sessionId) ? Game.multiplayer.sessionId : null;
              const isNewSession = (sid && _lastCounterSessionId !== sid);
              
              const prevMaxHealth = Game.player.maxHealth || 200;
              const newMaxHealth = playerState.maxHealth;
              
              // ✅ 修復：組隊模式下生命值加乘卡住的BUG + 忽略人物基礎屬性加成的BUG
              // 在組隊模式下，如果客戶端剛升級了生命值（healthUpgradeLevel 增加），
              // 客戶端已經計算了正確的 maxHealth，不應該被伺服器同步的舊值覆蓋
              // 只有在伺服器的 maxHealth 真的比客戶端大時才更新（表示伺服器有新的升級）
              const isHealthUpgradeActive = (Game.player && typeof Game.player.healthUpgradeLevel === 'number' && Game.player.healthUpgradeLevel > 0);
              const shouldUpdateMaxHealth = isNewSession || (Math.abs(newMaxHealth - prevMaxHealth) > 0.5 && (!isHealthUpgradeActive || newMaxHealth >= prevMaxHealth));
              
              if (shouldUpdateMaxHealth) {
                // ✅ 修復：確保 baseMaxHealth 被正確設置（包含角色基礎屬性加成）
                // 如果 baseMaxHealth 沒有被正確設置，重新應用角色屬性
                if (!Game.player.baseMaxHealth || Game.player.baseMaxHealth === CONFIG.PLAYER.MAX_HEALTH) {
                  if (Game.selectedCharacter) {
                    const sc = Game.selectedCharacter;
                    const baseMax = CONFIG.PLAYER.MAX_HEALTH;
                    const hpMul = sc.hpMultiplier != null ? sc.hpMultiplier : 1.0;
                    const hpBonus = sc.hpBonus != null ? sc.hpBonus : 0;
                    const charBaseMax = Math.max(1, Math.floor(baseMax * hpMul + hpBonus));
                    Game.player.baseMaxHealth = charBaseMax;
                  }
                }
                
                Game.player.maxHealth = newMaxHealth;
                // 如果 maxHealth 增加了，按比例增加 health（避免開場就被扣血）
                if (newMaxHealth > prevMaxHealth) {
                  if (Game.player.health >= prevMaxHealth) {
                    // 如果當前血量等於或超過舊的 maxHealth（滿血狀態），直接設為新的 maxHealth
                    Game.player.health = newMaxHealth;
                  } else {
                    // 如果當前血量不是滿血，按比例調整
                    const healthPercent = Game.player.health / prevMaxHealth;
                    Game.player.health = Math.min(newMaxHealth, Math.floor(newMaxHealth * healthPercent));
                  }
                } else if (Game.player.health > newMaxHealth) {
                  // 如果 maxHealth 減少了，確保 health 不超過新的 maxHealth
                  Game.player.health = newMaxHealth;
                }
              } else {
                // ✅ 修復：如果客戶端剛升級了生命值，重新應用屬性升級以確保 maxHealth 正確
                // 這可以防止伺服器同步的舊值覆蓋客戶端剛計算的新值
                // ✅ 修復：同時確保 baseMaxHealth 被正確設置（包含角色基礎屬性加成）
                if (!Game.player.baseMaxHealth || Game.player.baseMaxHealth === CONFIG.PLAYER.MAX_HEALTH) {
                  if (Game.selectedCharacter) {
                    const sc = Game.selectedCharacter;
                    const baseMax = CONFIG.PLAYER.MAX_HEALTH;
                    const hpMul = sc.hpMultiplier != null ? sc.hpMultiplier : 1.0;
                    const hpBonus = sc.hpBonus != null ? sc.hpBonus : 0;
                    const charBaseMax = Math.max(1, Math.floor(baseMax * hpMul + hpBonus));
                    Game.player.baseMaxHealth = charBaseMax;
                  }
                }
                if (isHealthUpgradeActive && typeof BuffSystem !== 'undefined' && BuffSystem.applyAttributeUpgrades) {
                  BuffSystem.applyAttributeUpgrades(Game.player);
                }
              }
            }
            
            // ✅ 單機同源：檢測血量變化，觸發受傷紅閃效果（單機元素）
            // ⚠️ 修復：使用 _lastHealth 來跟踪上一次的血量，避免初始化時誤判為受傷
            // ⚠️ 修復：排除 maxHealth 變化導致的 health 調整（因為已經在上面處理了）
            // ⚠️ 修复：新 session 开始时，强制同步 health，确保使用服务器的新状态
            if (typeof playerState.health === "number") {
              const sid = (Game.multiplayer && Game.multiplayer.sessionId) ? Game.multiplayer.sessionId : null;
              const isNewSession = (sid && _lastCounterSessionId !== sid);
              
              // 新 session 开始时，重置 _lastHealth，避免继承上一局的血量
              if (isNewSession) {
                handleServerGameState._lastHealth = playerState.health;
              }
              
              // 初始化 _lastHealth（如果不存在）
              if (typeof handleServerGameState._lastHealth !== "number") {
                handleServerGameState._lastHealth = playerState.health;
              }
              
              const prevHealth = handleServerGameState._lastHealth;
              const newHealth = playerState.health;
              
              // ⚠️ 修复：新 session 开始时，强制同步 health（避免继承上一局的状态）
              if (isNewSession) {
                Game.player.health = newHealth;
                handleServerGameState._lastHealth = newHealth;
              }
              
              // ⚠️ 修復：只在血量真的減少時觸發紅閃（排除 maxHealth 變化導致的 health 調整）
              // 並且要排除無敵狀態（無敵時不應該受傷，也不應該觸發紅閃）
              // 還要排除初始化時的情況（prevHealth 可能是 0 或 maxHealth，導致誤判）
              const isInitializing = (prevHealth === 0 || prevHealth === (Game.player.maxHealth || 200));
              const isInvulnerable = (Game.player.isInvulnerable && Game.player.invulnerabilitySource === 'INVINCIBLE');
              const isHealthDecreased = (newHealth < prevHealth && newHealth > 0 && prevHealth > 0);
              
              // ⚠️ 修复：只有在非新 session 时才更新 health（新 session 已经在上面强制同步了）
              // ✅ 修复：补血/回血是单机元素，如果客户端血量高于服务器同步的血量（表示客户端刚补血/回血），保留客户端血量
              // 这样可以防止服务器状态覆盖客户端的补血（YOUNG_DADA_GLORY、FRENZY_YOUNG_DADA_GLORY、MIND_MAGIC）和被动技能回血
              // ⚠️ 修复：但如果服务器在扣血（newHealth < prevHealth），必须同步服务器血量（服务器权威）
              if (!isNewSession) {
                // 判断服务器是否在扣血（服务器权威）
                const isServerDamaging = (newHealth < prevHealth && newHealth > 0 && prevHealth > 0);
                
                if (isServerDamaging) {
                  // 服务器在扣血，必须同步服务器血量（服务器权威，不能保留客户端血量）
                  Game.player.health = newHealth;
                } else if (Game.player.health > newHealth) {
                  // 服务器血量低于客户端，但不是因为服务器扣血（可能是客户端补血/回血）
                  // 保留客户端血量（防止补血/回血被覆盖，不影响被动技能）
                  // 但需要确保不超过 maxHealth
                  Game.player.health = Math.min(Game.player.maxHealth, Game.player.health);
                } else if (newHealth > prevHealth) {
                  // 服务器血量高于上一次同步的血量（服务器补血/回血），使用服务器血量
                  Game.player.health = newHealth;
                } else {
                  // 服务器血量等于上一次同步的血量（服务器没动），保留客户端血量
                  // 这样可以防止客户端补血被覆盖（差值校正/reconciliation 问题）
                  // 如果客户端补血后，服务器状态没变，不应该覆盖客户端补血
                  Game.player.health = Math.min(Game.player.maxHealth, Game.player.health);
                }
              }
              
              // 只在血量真的減少、不是初始化、不是無敵狀態時觸發紅閃
              if (isHealthDecreased && !isInitializing && !isInvulnerable && !Game.player._isDead) {
                try {
                  Game.player.hitFlashTime = Game.player.hitFlashDuration || 150;
                  if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.flash === 'function') {
                    window.GifOverlay.flash('player', { color: '#ff0000', durationMs: Game.player.hitFlashDuration || 150, opacity: 0.8 });
                  }
                } catch (_) {}
              }
              
              // ✅ 修复：_lastHealth 应该只在服务器血量真的变化时更新
              // 问题：如果服务器没动（newHealth === prevHealth），不应该更新 _lastHealth
              // 这样可以确保 _lastHealth 代表服务器已确认的血量，避免在服务器没动时更新
              // 根据 GPT 建议：_lastHealth 只能代表 server 已确认的血量，不能在「server 没动」的 tick 更新
              if (newHealth !== prevHealth) {
                // 服务器血量真的变化了，更新 _lastHealth
                handleServerGameState._lastHealth = newHealth;
              }
              // 如果服务器没动（newHealth === prevHealth），不更新 _lastHealth
            }
            if (typeof playerState.energy === "number") Game.player.energy = playerState.energy;
            if (typeof playerState.maxEnergy === "number") Game.player.maxEnergy = playerState.maxEnergy;
            // ⚠️ 修復：不應該直接設置 Game.player.level，應該讓客戶端的 levelUp() 來管理 level
            // 直接設置 level 會導致客戶端的 experience 和 experienceToNextLevel 不同步
            // 如果服務器端的 level 比客戶端的 level 高，應該觸發客戶端的升級流程
            // if (typeof playerState.level === "number") Game.player.level = playerState.level; // 已移除
            
            // ✅ 經驗共享（伺服器權威）：伺服器的 experience 是「本場累積獲得量」
            // 客戶端用 delta 驅動 gainExperience，保持原本升級/UI/天賦流程不變。
            if (typeof playerState.experience === "number") {
              if (!_sessionCountersPrimed) {
                _lastSessionExp = Math.max(0, Math.floor(playerState.experience || 0));
                // ✅ 修复：只在 session 初始化时同步一次 experienceToNextLevel 和 level，之后完全由客户端管理
                // 注意：这里只在 _sessionCountersPrimed 为 false 时同步一次，之后不再同步
                if (typeof playerState.experienceToNextLevel === "number" && Game.player) {
                  Game.player.experienceToNextLevel = playerState.experienceToNextLevel;
                }
                if (typeof playerState.level === "number" && Game.player) {
                  Game.player.level = playerState.level;
                }
                _sessionCountersPrimed = true; // 标记为已初始化，防止后续覆盖
              } else {
                const nowExp = Math.max(0, Math.floor(playerState.experience || 0));
                const deltaExp = nowExp - (_lastSessionExp || 0);
                if (deltaExp > 0 && typeof Game.player.gainExperience === "function") {
                  // ✅ 修复：直接调用 gainExperience，它会自动处理升级和 experienceToNextLevel 的更新
                  // gainExperience 会检查是否升级，如果升级则调用 levelUp()，levelUp() 会重新计算 experienceToNextLevel
                  // 与单机模式完全一致：experienceToNextLevel 只在升级时改变（通过 levelUp()）
                  Game.player.gainExperience(deltaExp);
                  // ✅ 修复：无论是否升级，都不应该被服务器的 experienceToNextLevel 覆盖
                  // 客户端的 experienceToNextLevel 由 levelUp() 管理，与单机一致
                }
                // ✅ 修复：如果服务器端的 level 比客户端的 level 高，说明服务器端已经升级了
                // 但客户端的 level 应该由 levelUp() 管理，不应该直接覆盖
                // 如果客户端的 level 与服务器端的 level 不一致，可能是升级流程没有正确触发
                // 这种情况下，应该让客户端的 gainExperience 和 levelUp() 来处理，而不是直接覆盖
                _lastSessionExp = nowExp;
              }
            }
            
            // ✅ 單機元素：左上角 HUD（血量/經驗/能量/等級）只顯示本地玩家狀態
            // 在組隊模式下，使用伺服器同步的本地玩家狀態更新 HUD
            // ⚠️ 修復：避免血条闪烁 - 只在血量真的改变时才更新 UI
            if (typeof UI !== "undefined") {
              try {
                // 記錄上一次的血量值，只在真的改變時才更新 UI
                if (!handleServerGameState._lastHealth) handleServerGameState._lastHealth = Game.player.health || 0;
                if (!handleServerGameState._lastMaxHealth) handleServerGameState._lastMaxHealth = Game.player.maxHealth || 200;
                
                const healthChanged = Math.abs((Game.player.health || 0) - handleServerGameState._lastHealth) > 0.5;
                const maxHealthChanged = Math.abs((Game.player.maxHealth || 200) - handleServerGameState._lastMaxHealth) > 0.5;
                
                if (healthChanged || maxHealthChanged) {
                  if (UI.updateHealthBar && typeof Game.player.health === "number" && typeof Game.player.maxHealth === "number") {
                    UI.updateHealthBar(Game.player.health, Game.player.maxHealth);
                  }
                  handleServerGameState._lastHealth = Game.player.health || 0;
                  handleServerGameState._lastMaxHealth = Game.player.maxHealth || 200;
                }
                if (UI.updateEnergyBar && typeof Game.player.energy === "number" && typeof Game.player.maxEnergy === "number") {
                  UI.updateEnergyBar(Game.player.energy, Game.player.maxEnergy);
                }
                if (UI.updateLevel && typeof Game.player.level === "number") {
                  UI.updateLevel(Game.player.level);
                }
                // 經驗條由 gainExperience() 中的 UI.updateExpBar 更新，這裡不需要重複更新
              } catch (_) {}
            }
            
            // ⚠️ 修復：確保 experienceToNextLevel 不會被伺服器每幀覆蓋
            // 與單機一致：experienceToNextLevel 只在升級時改變（通過 levelUp()）
            // 只有在 session 初始化時才同步伺服器的值，之後完全由客戶端管理
            // 不應該在每次收到伺服器狀態時都同步這個值
            // ⚠️ 重要：只有在 session 初始化時才同步 experienceToNextLevel，之後完全由客戶端管理
            if (_sessionCountersPrimed && typeof playerState.experienceToNextLevel === "number" && Game.player) {
              // 不要同步伺服器的 experienceToNextLevel，因為它可能與客戶端的值不一致
              // 客戶端的 experienceToNextLevel 由 levelUp() 管理，與單機一致
            }

            // ✅ 金幣共享（伺服器權威）：sessionCoins 用 delta 寫回 Game.addCoins（不改存檔碼鍵名）
            if (typeof playerState.sessionCoins === "number") {
              if (!_sessionCountersPrimed) {
                _lastSessionCoins = Math.max(0, Math.floor(playerState.sessionCoins || 0));
              } else {
                const nowCoins = Math.max(0, Math.floor(playerState.sessionCoins || 0));
                const deltaCoins = nowCoins - (_lastSessionCoins || 0);
                if (deltaCoins > 0 && typeof Game.addCoins === "function") {
                  Game.addCoins(deltaCoins);
                }
                _lastSessionCoins = nowCoins;
              }
            }

            // prime after first local state in this session
            if (!_sessionCountersPrimed) _sessionCountersPrimed = true;

            // ✅ 死亡/復活：以伺服器 isDead 權威驅動本地狀態（避免客戶端自判/廣播互打）
            try {
              if (typeof playerState.isDead === "boolean") {
                if (playerState.isDead) {
                  if (!Game.player._isDead && typeof Game.player.die === "function") {
                    Game.player.die();
                  }
                } else {
                  if (Game.player._isDead && typeof Game.player.resurrect === "function") {
                    Game.player.resurrect({ fromServer: true });
                  }
                }
              } else {
                // 向後相容：若未帶 isDead，使用 health 判斷
                if (typeof playerState.health === "number" && playerState.health <= 0) {
                  if (!Game.player._isDead && typeof Game.player.die === "function") {
                    Game.player.die();
                  }
                }
              }
            } catch (_) { }

            // ✅ 多人元素：救援進度（伺服器權威）— 只做 UI 顯示
            try {
              if (typeof playerState.resurrectionProgress === "number") {
                Game.player._resurrectionProgress = Math.max(0, Math.min(100, playerState.resurrectionProgress));
              }
            } catch (_) { }
            
            // ✅ 多人元素：大招動畫狀態同步（讓所有客戶端能看到其他玩家的大招變身效果）
            // 注意：大招功能本身是單機元素（武器變化、屬性加成等），只在本地執行
            // 但大招動畫（isUltimateActive、ultimateImageKey、體型變化）是多人元素，需要同步
            try {
              if (typeof playerState.isUltimateActive === "boolean") {
                const wasUltimateActive = Game.player.isUltimateActive;
                const isNowUltimateActive = playerState.isUltimateActive;
                
                // ✅ 修復：如果本地玩家正在大招狀態，確保武器被正確設置為LV10
                // 這可以防止組隊模式下武器只放一次就沒了的問題
                if (isNowUltimateActive) {
                  // 檢查武器是否正確設置為LV10
                  const needsReactivate = !Game.player._ultimateBackup || 
                    !Game.player.weapons || 
                    Game.player.weapons.length === 0 ||
                    Game.player.weapons.some(w => !w || w.level !== CONFIG.ULTIMATE.ULTIMATE_LEVEL);
                  
                  if (needsReactivate) {
                    // 武器沒有被正確設置，重新執行 activateUltimate
                    console.warn('[SurvivalOnline] 檢測到武器等級不正確，重新執行 activateUltimate', {
                      hasBackup: !!Game.player._ultimateBackup,
                      weaponsLength: Game.player.weapons ? Game.player.weapons.length : 0,
                      weaponsLevels: Game.player.weapons ? Game.player.weapons.map(w => w ? w.level : 'null') : []
                    });
                    if (typeof Game.player.activateUltimate === 'function') {
                      Game.player.activateUltimate();
                    }
                  }
                }
                
                Game.player.isUltimateActive = isNowUltimateActive;
                
                // ✅ 單機元素：如果伺服器通知大招結束，本地執行 deactivateUltimate（恢復武器、屬性等）
                // 但只執行功能恢復，不執行視覺恢復（視覺由伺服器同步）
                if (wasUltimateActive && !isNowUltimateActive && typeof Game.player.deactivateUltimate === 'function') {
                  // ✅ 修復：調用完整的清理邏輯，確保與單機模式一致
                  try {
                    const backup = Game.player._ultimateBackup;
                    if (backup && backup.weapons) {
                      // 恢復武器
                      const WeaponCtor = _getGlobalCtor("Weapon");
                      if (WeaponCtor) {
                        Game.player.weapons = backup.weapons.map(info => {
                          const w = new WeaponCtor(Game.player, info.type);
                          w.level = info.level;
                          w.projectileCount = w.config.LEVELS[w.level - 1].COUNT;
                          return w;
                        });
                      }
                    }
                    
                    // 恢復額外防禦
                    if (Game.player._ultimateExtraDefense > 0) {
                      const currentDefense = Game.player.baseDefense || 1;
                      Game.player.baseDefense = Math.max(1, currentDefense - Game.player._ultimateExtraDefense);
                    }
                    Game.player._ultimateExtraDefense = 0;
                    
                    // ✅ 修復：清理守護領域等持續效果（與單機模式一致）
                    if (typeof Game !== 'undefined' && Array.isArray(Game.projectiles)) {
                      for (const p of Game.projectiles) {
                        if (p && p.weaponType === 'AURA_FIELD' && p.player === Game.player && !p.markedForDeletion) {
                          if (typeof p.destroy === 'function') p.destroy(); else p.markedForDeletion = true;
                        }
                      }
                    }
                    
                    // ✅ 修復：清理能量（與單機模式一致）
                    Game.player.energy = 0;
                    if (typeof UI !== 'undefined' && typeof UI.updateEnergyBar === 'function') {
                      UI.updateEnergyBar(Game.player.energy, Game.player.maxEnergy);
                    }
                    
                    // ✅ 修復：清理第二位角色大絕結束時的GIF z-index（與單機模式一致）
                    const wasDadaUltimate = (Game.player._ultimateImageKey === 'playerN2');
                    if (wasDadaUltimate) {
                      try {
                        const playerGifEl = document.getElementById('gif-overlay-player');
                        if (playerGifEl) {
                          playerGifEl.style.zIndex = '3'; // 恢復預設值
                        }
                      } catch (_) {}
                    }
                    
                    // 清理備份和狀態
                    Game.player._ultimateBackup = null;
                    Game.player.ultimateEndTime = 0;
                    Game.player._ultimateImageKey = null;
                  } catch (e) {
                    console.warn('[SurvivalOnline] 大招結束清理失敗:', e);
                  }
                }
              }
              if (typeof playerState.ultimateImageKey === "string" && playerState.ultimateImageKey) {
                Game.player._ultimateImageKey = playerState.ultimateImageKey;
              } else if (playerState.isUltimateActive === false) {
                Game.player._ultimateImageKey = null;
              }
              if (typeof playerState.ultimateEndTime === "number") {
                Game.player.ultimateEndTime = playerState.ultimateEndTime;
              }
              
              // ✅ 多人元素：體型同步（大招變身時的視覺效果）
              // ✅ 修复：大招结束时，服务器会恢复体积，需要同步（即使值为原始值，也要同步）
              if (typeof playerState.width === "number") {
                // 允许同步原始体积（可能小于或等于当前值）
                Game.player.width = playerState.width;
              }
              if (typeof playerState.height === "number") {
                // 允许同步原始体积（可能小于或等于当前值）
                Game.player.height = playerState.height;
              }
              if (typeof playerState.collisionRadius === "number") {
                // 允许同步原始碰撞半径（可能小于或等于当前值）
                Game.player.collisionRadius = playerState.collisionRadius;
              }
            } catch (_) { }
          }
        } else {
          // 远程玩家：更新位置和状态
          updateRemotePlayerFromServer(playerState);
        }
      }
    }

    // 更新敌人（服务器权威）
    if (Array.isArray(state.enemies)) {
      updateEnemiesFromServer(state.enemies);
    }

    // 更新投射物（服务器权威）
    if (Array.isArray(state.projectiles)) {
      updateProjectilesFromServer(state.projectiles);
    }

    // ✅ B：BOSS/HUMAN2 遠程投射物（伺服器權威；客戶端只顯示）
    if (Array.isArray(state.bossProjectiles)) {
      updateBossProjectilesFromServer(state.bossProjectiles);
    }

    // ✅ B：修羅彈幕（伺服器權威；客戶端只渲染）
    if (Array.isArray(state.bullets)) {
      updateBulletsFromServer(state.bullets);
    }

    // ✅ 命中事件（伺服器權威）：用於顯示傷害數字/爆擊標記（不靠本地 takeDamage）
    try {
      if (Array.isArray(state.hitEvents) && typeof DamageNumbers !== "undefined" && typeof DamageNumbers.show === "function") {
        for (const ev of state.hitEvents) {
          if (!ev) continue;
          const dmg = (typeof ev.damage === "number") ? ev.damage : 0;
          if (dmg <= 0) continue;
          const x = (typeof ev.x === "number") ? ev.x : 0;
          const y = (typeof ev.y === "number") ? ev.y : 0;
          const h = (typeof ev.h === "number") ? ev.h : 0;
          DamageNumbers.show(Math.round(dmg), x, y - h / 2, ev.isCrit === true, { enemyId: ev.enemyId || null });
          
          // ✅ 修復：根據武器類型創建對應的特殊視覺效果（多人元素）
          const weaponType = ev.weaponType || null;
          
          // ✅ 修復：投射物命中敵人時的 bo 音效（單機元素）
          // 音效是單機元素，只對本地玩家播放
          // 使用 hitEvents 中的 playerUid 判斷是否是本地玩家的投射物
          const isLocalPlayer = (ev.playerUid && Game.multiplayer && Game.multiplayer.uid && ev.playerUid === Game.multiplayer.uid);
          if (isLocalPlayer && (weaponType === 'LIGHTNING' || weaponType === 'MUFFIN_THROW' || 
              weaponType === 'HEART_TRANSMISSION' || weaponType === 'BAGUETTE_THROW') &&
              typeof AudioManager !== 'undefined') {
            AudioManager.playSound('bo');
          }
          
          // ✅ 修復：所有需要粒子特效的技能（追蹤綿羊、鬆餅投擲、法棍投擲、心意傳遞）
          // 這些技能在命中時都會產生白色粒子特效
          if (weaponType === 'LIGHTNING' || weaponType === 'MUFFIN_THROW' || 
              weaponType === 'BAGUETTE_THROW' || weaponType === 'HEART_TRANSMISSION') {
            try {
              const particleCount = 18; // 與單機模式一致
              if (!Game.explosionParticles) Game.explosionParticles = [];
              for (let i = 0; i < particleCount; i++) {
                const ang = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 4;
                const p = {
                  x: x + (Math.random() - 0.5) * 10,
                  y: y + (Math.random() - 0.5) * 10,
                  vx: Math.cos(ang) * speed,
                  vy: Math.sin(ang) * speed,
                  life: 520 + Math.random() * 280,
                  maxLife: 520 + Math.random() * 280,
                  size: 5 + Math.random() * 3,
                  color: '#ffffff', // 白色粒子，與單機模式一致
                  source: weaponType // 標記來源，用於繪製時的特殊處理
                };
                Game.explosionParticles.push(p);
              }
            } catch (e) {
              console.warn('[SurvivalOnline] 粒子特效創建失敗:', e);
            }
          }
          
          if (weaponType === 'HEART_TRANSMISSION') {
            // 心意傳遞命中時顯示效果圖片（A36.png，310x290比例）
            const cfg = (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS.HEART_TRANSMISSION) || {};
            const effectWidth = cfg.EFFECT_IMAGE_WIDTH || 310;
            const effectHeight = cfg.EFFECT_IMAGE_HEIGHT || 290;
            const effectDuration = 300; // 效果持續300毫秒
            if (!Game.heartTransmissionEffects) Game.heartTransmissionEffects = [];
            Game.heartTransmissionEffects.push({
              x: x,
              y: y,
              width: effectWidth,
              height: effectHeight,
              life: effectDuration,
              maxLife: effectDuration
            });
          } else if (weaponType === 'FIREBALL') {
            // ✅ 修復：紳士綿羊（FIREBALL）命中時的緩速特效（多人元素）
            // 緩速效果由伺服器權威處理，客戶端只顯示視覺效果（藍色覆蓋）
            const enemyId = ev.enemyId || null;
            if (enemyId && typeof Game !== 'undefined' && Array.isArray(Game.enemies)) {
              const enemy = Game.enemies.find(e => e && e.id === enemyId);
              if (enemy && typeof enemy.applySlow === 'function') {
                const cfg = (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS.FIREBALL) || {};
                const slowMs = (typeof cfg.SLOW_DURATION_MS === 'number') ? cfg.SLOW_DURATION_MS : 1000;
                const slowFactor = (typeof cfg.SLOW_FACTOR === 'number') ? cfg.SLOW_FACTOR : 0.5;
                // ✅ 修復：在組隊模式下，緩速效果由伺服器權威處理，客戶端只顯示視覺效果
                // 但為了確保視覺效果正確，我們仍然調用 applySlow（只影響視覺，不影響實際速度）
                enemy.applySlow(slowMs, slowFactor);
              }
            }
          } else if (weaponType === 'EXPLOSION') {
            // ✅ 修復：艾比大絕的特殊傷害數字顯示（放大2倍，紅色特效）
            // 使用 ExplosionEffect 的 _showSpecialDamageNumber 方法顯示特殊傷害數字
            if (typeof ExplosionEffect !== 'undefined' && typeof ExplosionEffect.prototype._showSpecialDamageNumber === 'function') {
              // 創建臨時 ExplosionEffect 實例來調用 _showSpecialDamageNumber
              const tempExplosion = Object.create(ExplosionEffect.prototype);
              tempExplosion._showSpecialDamageNumber(dmg, x, y - h / 2);
            }
            
            // ✅ 修復：艾比大絕的 knife2.gif 覆蓋層特效（多人元素）
            // 需要在所有命中的敵人位置顯示 knife2.gif 覆蓋層
            // 查找對應的 ExplosionEffect 實例，如果存在則添加命中敵人
            if (typeof Game !== 'undefined' && Array.isArray(Game.projectiles)) {
              const explosionEffect = Game.projectiles.find(p => 
                p && p.constructor && p.constructor.name === 'ExplosionEffect' && 
                p.weaponType === 'EXPLOSION' && 
                !p.damageApplied && 
                !p.markedForDeletion
              );
              if (explosionEffect && Array.isArray(explosionEffect.hitEnemies)) {
                // 檢查是否已存在該敵人（避免重複）
                const enemyId = ev.enemyId || null;
                const existingHit = explosionEffect.hitEnemies.find(h => h.enemyId === enemyId);
                if (!existingHit) {
                  explosionEffect.hitEnemies.push({
                    enemy: null, // 敵人可能已經死亡，只保存位置
                    x: x,
                    y: y,
                    enemyId: enemyId
                  });
                }
                // 如果還沒有創建覆蓋層，現在創建
                if (!explosionEffect._hitOverlaysCreated && typeof explosionEffect._createHitOverlays === 'function') {
                  explosionEffect._createHitOverlays();
                  explosionEffect._hitOverlaysCreated = true;
                }
              }
            }
            
            // 後備方案：如果找不到 ExplosionEffect 實例，直接創建 knife2.gif 覆蓋層
            if (typeof ExplosionEffect === 'undefined' || typeof ExplosionEffect.prototype._showSpecialDamageNumber !== 'function') {
              // 後備方案：直接創建特殊傷害數字（與 ExplosionEffect._showSpecialDamageNumber 相同邏輯）
              let layer = null;
              try {
                if (typeof DamageNumbers !== 'undefined' && DamageNumbers.ensureLayer) {
                  layer = DamageNumbers.ensureLayer();
                } else if (typeof DamageNumbers !== 'undefined' && DamageNumbers._layer) {
                  layer = DamageNumbers._layer;
                }
              } catch (_) {}
              if (layer) {
                const canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : document.getElementById('game-canvas');
                if (canvas) {
                  const rect = canvas.getBoundingClientRect();
                  const scaleX = rect.width / canvas.width;
                  const scaleY = rect.height / canvas.height;
                  const camX = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0;
                  const camY = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0;
                  const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
                  
                  let sx = x - camX;
                  let sy = y - camY;
                  if (!rotatedPortrait) {
                    sx *= scaleX;
                    sy *= scaleY;
                  }
                  
                  const el = document.createElement('div');
                  el.textContent = String(Math.round(dmg));
                  el.style.position = 'absolute';
                  el.style.left = Math.round(sx) + 'px';
                  el.style.top = Math.round(sy) + 'px';
                  el.style.transform = 'translate(-50%, -50%)';
                  el.style.fontFamily = 'GenSenRounded-H, sans-serif';
                  el.style.fontWeight = '800';
                  
                  try {
                    const isMobile = (typeof window !== 'undefined') && (
                      (window.matchMedia && (window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches))
                    );
                    const baseSize = 56; // 28 * 2
                    const size = isMobile ? Math.round(baseSize * 0.75) : baseSize;
                    el.style.fontSize = size + 'px';
                  } catch (_) {
                    el.style.fontSize = '56px';
                  }
                  
                  el.style.color = '#ff0000';
                  el.style.webkitTextStroke = '2px #ffffff';
                  el.style.textShadow = '0 0 20px rgba(255, 0, 0, 1), 0 0 10px rgba(255, 255, 255, 0.8), 0 0 4px #000, 3px 0 0 #000, -3px 0 0 #000, 0 3px 0 #000, 0 -3px 0 #000';
                  el.style.willChange = 'transform, opacity';
                  
                  layer.appendChild(el);
                  
                  const duration = 3400; // 1700 * 2
                  const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
                  const mag = 72; // 36 * 2
                  const dx = 0;
                  const dy = -mag;
                  
                  const anim = el.animate([
                    { transform: 'translate(-50%, -50%)', opacity: 1 },
                    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`, opacity: 0 }
                  ], { duration, easing, fill: 'forwards' });
                  
                  anim.onfinish = () => {
                    if (el && el.parentNode) el.parentNode.removeChild(el);
                  };
                }
              }
            }
          }
        }
      }
    } catch (_) { }

    // ✅ 流量優化：音效是單機元素，不需要通過伺服器發送 sfxEvents（節省流量）
    // 所有音效都在客戶端本地播放（與單機一致）

    // ✅ 多人元素（視覺特效）：伺服器權威 VFX（例如：BOSS 投射物命中）
    try {
      if (Array.isArray(state.vfxEvents)) {
        for (const v of state.vfxEvents) {
          if (!v || typeof v.type !== "string") continue;
          // ✅ 修复：处理车辆生成音效事件（音效是单机元素）
          if (v.type === 'car_spawn') {
            try {
              // 音效是单机元素，所有客户端都播放
              if (typeof AudioManager !== 'undefined' && typeof AudioManager.playSound === 'function') {
                AudioManager.playSound('car');
              }
            } catch (_) {}
          }
          // ✅ 修复：处理BOSS投射物爆炸事件（音效+特效+相机震动）
          else if (v.type === 'screen_effect' && v.data && v.data.type === 'boss_projectile_explosion') {
            const eventData = v.data;
            try {
              // ✅ 修复：获取本地玩家UID（使用多种方式确保正确）
              const localPlayerUid = (Game.multiplayer && Game.multiplayer.uid) 
                ? Game.multiplayer.uid 
                : (typeof _getLocalNetUid === 'function' ? _getLocalNetUid() : (_netUid || _uid || null));
              
              // ✅ 修复：更严格的比较逻辑（确保类型一致，支持字符串和数字）
              const eventPlayerUid = (eventData && (typeof eventData.playerUid === 'string' || typeof eventData.playerUid === 'number')) 
                ? String(eventData.playerUid) 
                : null;
              const localPlayerUidStr = localPlayerUid ? String(localPlayerUid) : null;
              const isLocalPlayer = (eventPlayerUid && localPlayerUidStr && eventPlayerUid === localPlayerUidStr);
              
              // 音效是单机元素，只对本地玩家播放
              if (isLocalPlayer) {
                if (typeof AudioManager !== 'undefined' && typeof AudioManager.playSound === 'function') {
                  AudioManager.playSound('bo');
                }
              }
              
              // 屏幕闪光和相机震动是单机元素，只对本地玩家触发
              if (isLocalPlayer) {
                if (typeof Game !== 'undefined') {
                  // ✅ 修复：屏幕闪光参数与单机一致（intensity: 0.3, duration: 150）
                  if (eventData.screenFlash && typeof eventData.screenFlash === 'object') {
                    Game.screenFlash = {
                      active: eventData.screenFlash.active || false,
                      intensity: eventData.screenFlash.intensity || 0.3,
                      duration: eventData.screenFlash.duration || 150
                    };
                  }
                  
                  // ✅ 修复：相机震动参数与单机一致（intensity: 8, duration: 200）
                  if (eventData.cameraShake && typeof eventData.cameraShake === 'object') {
                    if (!Game.cameraShake) {
                      Game.cameraShake = { active: false, intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
                    }
                    Game.cameraShake.active = eventData.cameraShake.active || false;
                    Game.cameraShake.intensity = eventData.cameraShake.intensity || 8;
                    Game.cameraShake.duration = eventData.cameraShake.duration || 200;
                  }
                }
              }
              
              // 爆炸粒子是多人元素，需要同步（如果服务器发送了）
              if (typeof eventData.x === 'number' && typeof eventData.y === 'number') {
                if (!Game.explosionParticles) Game.explosionParticles = [];
                // 创建爆炸粒子（与单机一致：25个粒子）
                for (let i = 0; i < 25; i++) {
                  const angle = (Math.PI * 2 * i) / 25 + (Math.random() - 0.5) * 0.5;
                  const speed = 2 + Math.random() * 6;
                  Game.explosionParticles.push({
                    x: eventData.x + (Math.random() - 0.5) * 10,
                    y: eventData.y + (Math.random() - 0.5) * 10,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 500 + Math.random() * 500,
                    maxLife: 1000,
                    size: 3 + Math.random() * 4,
                    color: ['#ff0000', '#ff3300', '#ff6600', '#ff9900', '#ffcc00', '#ff4400'][Math.floor(Math.random() * 6)]
                  });
                }
              }
            } catch (e) {
              console.warn('[SurvivalOnline] 处理BOSS投射物爆炸事件失败:', e);
            }
          }
          // ✅ 修复：处理车辆撞击事件（音效+特效+相机震动）
          else if (v.type === 'car_hit') {
            // ✅ 修复：兼容两种格式：v.data 或直接 v
            const eventData = v.data || v;
            try {
              // ✅ 修复：获取本地玩家UID（使用多种方式确保正确）
              // 注意：服务器端 player.uid 是 netUid（格式：`${authUid}:${instanceId}`）
              // 客户端 Game.multiplayer.uid 也应该是 netUid
              const localPlayerUid = (Game.multiplayer && Game.multiplayer.uid) 
                ? Game.multiplayer.uid 
                : (typeof _getLocalNetUid === 'function' ? _getLocalNetUid() : (_netUid || _uid || null));
              
              // ✅ 修复：更严格的比较逻辑（确保类型一致，支持字符串和数字）
              const eventPlayerUid = (eventData && (typeof eventData.playerUid === 'string' || typeof eventData.playerUid === 'number')) 
                ? String(eventData.playerUid) 
                : null;
              const localPlayerUidStr = localPlayerUid ? String(localPlayerUid) : null;
              const isLocalPlayer = (eventPlayerUid && localPlayerUidStr && eventPlayerUid === localPlayerUidStr);
              
              // ⚠️ 调试：如果音效没有播放，记录日志
              if (SURVIVAL_ONLINE_DEBUG && eventPlayerUid) {
                console.log(`[SurvivalOnline] car_hit事件: eventPlayerUid=${eventPlayerUid}, localPlayerUid=${localPlayerUid}, isLocalPlayer=${isLocalPlayer}`);
              }
              
              // 音效是单机元素，只对本地玩家播放
              if (isLocalPlayer) {
                if (typeof AudioManager !== 'undefined' && typeof AudioManager.playSound === 'function') {
                  AudioManager.playSound('bo');
                  if (SURVIVAL_ONLINE_DEBUG) {
                    console.log(`[SurvivalOnline] ✅ 播放车辆撞击音效: playerUid=${eventPlayerUid}`);
                  }
                } else if (SURVIVAL_ONLINE_DEBUG) {
                  console.warn(`[SurvivalOnline] ⚠️ AudioManager不可用，无法播放音效`);
                }
              } else if (SURVIVAL_ONLINE_DEBUG && eventPlayerUid) {
                console.log(`[SurvivalOnline] ⚠️ 跳过音效: 不是本地玩家 (eventPlayerUid=${eventPlayerUid}, localPlayerUid=${localPlayerUid})`);
              }
              
              // 特效是多人元素，需要同步（爆炸粒子、屏幕白闪）
              if (typeof eventData.x === 'number' && typeof eventData.y === 'number') {
                // 屏幕白闪：仅本地玩家触发
                if (isLocalPlayer) {
                  if (typeof Game !== 'undefined') {
                    Game.screenFlash = { active: true, duration: 140, intensity: 0.28 };
                  }
                }
                // ✅ 修复：相机震动是单机元素，只对本地玩家触发
                if (isLocalPlayer) {
                  if (typeof Game !== 'undefined') {
                    if (!Game.cameraShake) {
                      Game.cameraShake = { active: false, intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
                    }
                    // ✅ 修复：即使 eventData.cameraShake 不存在，也要触发相机震动（与单机模式一致）
                    const cameraShake = eventData.cameraShake || { active: true, intensity: 8, duration: 200 };
                    Game.cameraShake.active = cameraShake.active !== false; // 默认 true
                    Game.cameraShake.intensity = cameraShake.intensity || 8;
                    Game.cameraShake.duration = cameraShake.duration || 200;
                    if (SURVIVAL_ONLINE_DEBUG) {
                      console.log(`[SurvivalOnline] ✅ 触发相机震动: intensity=${Game.cameraShake.intensity}, duration=${Game.cameraShake.duration}`);
                    }
                  }
                }
                // 爆炸粒子：需要同步
                if (typeof Game !== 'undefined') {
                  if (!Game.explosionParticles) Game.explosionParticles = [];
                  const count = 18;
                  for (let i = 0; i < count; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const spd = 2.5 + Math.random() * 5.5;
                    const particle = {
                      x: eventData.x + (Math.random() - 0.5) * 8,
                      y: eventData.y + (Math.random() - 0.5) * 8,
                      vx: Math.cos(ang) * spd,
                      vy: Math.sin(ang) * spd,
                      life: 320 + Math.random() * 220,
                      maxLife: 320 + Math.random() * 220,
                      size: 5 + Math.random() * 4,
                      color: (i % 3 === 0) ? '#ffffff' : '#ff6666',
                      source: 'CAR_HIT'
                    };
                    Game.explosionParticles.push(particle);
                  }
                }
              }
            } catch (_) {}
          } else {
            _applyVfxEvent(v.type, v.data);
          }
        }
      }
    } catch (_) { }

    // 更新经验球（服务器权威）
    if (Array.isArray(state.experienceOrbs)) {
      updateExperienceOrbsFromServer(state.experienceOrbs);
    }

    // ✅ 更新寶箱（服务器权威）
    if (Array.isArray(state.chests)) {
      updateChestsFromServer(state.chests);
    }

    // ✅ 更新路口车辆（服务器权威）
    // ⚠️ 修复：无论服务器发送的是空数组还是有数据，都要处理
    // 如果服务器发送空数组，说明新地图不是路口，需要清理所有车辆
    if (Array.isArray(state.carHazards)) {
      if (state.carHazards.length === 0) {
        // ⚠️ 修复：如果服务器发送空数组，清理客户端所有车辆
        // 这样可以确保从路口地图切换到其他地图时，车辆不会残留
        if (typeof Game !== 'undefined' && Array.isArray(Game.projectiles)) {
          for (let i = Game.projectiles.length - 1; i >= 0; i--) {
            const proj = Game.projectiles[i];
            if (proj && (proj.weaponType === 'INTERSECTION_CAR' || (proj.constructor && proj.constructor.name === 'CarHazard'))) {
              try {
                if (typeof proj.destroy === 'function') {
                  proj.destroy();
                }
              } catch (_) { }
              Game.projectiles.splice(i, 1);
            }
          }
        }
      } else {
        updateCarHazardsFromServer(state.carHazards);
      }
    }

    // ✅ 修复：始终从服务器状态更新障碍物和装饰物（服务器权威）
    // ⚠️ 重要：只在多人模式下更新，确保不影响单机模式
    // 注意：服务器现在始终发送 obstacles 和 decorations（即使为空数组），确保客户端始终能看到它们
    // ✅ 修复：移除 return 语句，确保后续代码（如出口、波次等）能够继续执行
    try {
      // ✅ 双重检查：确保只在多人模式下执行（防止影响单机）
      if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
        const ObstacleCtor = _getGlobalCtor("Obstacle");
        // ✅ 修复：始终处理障碍物（服务器现在始终发送，即使为空数组）
        // ⚠️ 注意：只在多人模式下执行，单机模式不会执行到这里
        if (Array.isArray(state.obstacles)) {
          Game.obstacles = [];
          if (state.obstacles.length > 0 && ObstacleCtor) {
            for (const o of state.obstacles) {
              if (!o) continue;
              const ox = (typeof o.x === 'number') ? o.x : 0;
              const oy = (typeof o.y === 'number') ? o.y : 0;
              const imageKey = o.imageKey || 'S1';
              const size = (typeof o.size === 'number') ? o.size : (typeof o.width === 'number' ? o.width : 150);
              Game.obstacles.push(new ObstacleCtor(ox, oy, imageKey, size));
            }
          }
        }
        // ✅ 修复：始终处理装饰物（服务器现在始终发送，即使为空数组）
        // ⚠️ 注意：只在多人模式下执行，单机模式不会执行到这里
        if (Array.isArray(state.decorations)) {
          Game.decorations = [];
          if (state.decorations.length > 0) {
            for (const d of state.decorations) {
              if (!d) continue;
              if (typeof d.x !== 'number' || typeof d.y !== 'number' || !d.imageKey) continue;
              Game.decorations.push({
                x: d.x,
                y: d.y,
                width: (typeof d.width === 'number') ? d.width : 100,
                height: (typeof d.height === 'number') ? d.height : 100,
                imageKey: d.imageKey
              });
            }
          }
        }
      }
      // ⚠️ 注意：单机模式下，障碍物和装饰物由 Game.spawnObstacles 和 Game.spawnDecorations 生成
      // 这里不处理，让后续代码继续执行（如出口、波次等）
    } catch (_) { }

    // ✅ 更新出口（服务器权威）
    try {
      if (typeof Game !== 'undefined') {
        if (state.exit && typeof state.exit === 'object') {
          if (!Game.exit) Game.exit = { x: 0, y: 0, width: 0, height: 0 };
          if (typeof state.exit.x === 'number') Game.exit.x = state.exit.x;
          if (typeof state.exit.y === 'number') Game.exit.y = state.exit.y;
          if (typeof state.exit.width === 'number') Game.exit.width = state.exit.width;
          if (typeof state.exit.height === 'number') Game.exit.height = state.exit.height;
        } else if (state.exit === null) {
          Game.exit = null;
        }
      }
    } catch (_) { }

    // ✅ 單機同源：波次更新（與單機一致，只更新 UI，沒有音效）
    // 檢測波次變化，同步到 WaveSystem（與單機 wave.js nextWave() 一致）
    if (typeof state.wave === 'number' && typeof WaveSystem !== 'undefined') {
      const prevWave = WaveSystem.currentWave || 1;
      if (state.wave !== prevWave) {
        WaveSystem.currentWave = state.wave;
        // ✅ 與單機一致：波次更新時同步 waveStartTime（伺服器權威）
        if (typeof state.waveStartTime === 'number') {
          WaveSystem.waveStartTime = state.waveStartTime;
        }
        // 更新 UI（與單機一致）
        if (typeof UI !== 'undefined' && UI.updateWaveInfo) {
          UI.updateWaveInfo(state.wave);
        }
      }
    }

    // ✅ 更新游戏状态（服务器权威）
    if (typeof Game !== 'undefined') {
      if (typeof state.gameTime === "number") Game.gameTime = state.gameTime;
      // ⚠️ 修复：游戏结束状态检查已移到函数开头，确保优先处理
      // if (state.isGameOver) { ... } // 已移到函数开头
      if (state.isVictory) {
        console.log('[SurvivalOnline] handleServerGameState: 检测到 state.isVictory = true');
        // ✅ 權威伺服器模式：遊戲勝利由伺服器 state.isVictory 觸發
        // ⚠️ 修复：不要在这里设置 _victoryEventSent，让 Game.victory() 自己设置
        // 否则会导致 Game.victory() 内部的检查失败，直接返回而不执行后续逻辑
        if (!Game._victoryEventSent) {
          console.log('[SurvivalOnline] handleServerGameState: 调用 Game.victory()');
          if (typeof Game.victory === 'function') {
            Game.victory();
          } else {
            console.error('[SurvivalOnline] handleServerGameState: Game.victory 不是函数！');
          }
        } else {
          console.warn('[SurvivalOnline] handleServerGameState: Game._victoryEventSent 已为 true，跳过');
        }
      }
    }
  } catch (e) {
    console.error('[SurvivalOnline] 处理服务器游戏状态失败:', e);
  }
}

// ✅ 宝箱同步（服务器权威）
function updateChestsFromServer(chests) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.chests) return;
  const ChestCtor = _getGlobalCtor("Chest");
  if (!ChestCtor) return;

  // ✅ 分流：NORMAL 寶箱走 Game.chests；PINEAPPLE 掉落物走 Game.pineappleUltimatePickups
  if (!Array.isArray(Game.pineappleUltimatePickups)) Game.pineappleUltimatePickups = [];

  const serverMap = new Map(); // id -> chestState
  for (const c of chests) {
    if (c && c.id) serverMap.set(c.id, c);
  }

  // 移除服务器不存在的物件（兩個清單都要清）
  const pruneList = (list) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const local = list[i];
      if (!local || !local.id || !serverMap.has(local.id)) {
        try { if (local && typeof local.destroy === 'function') local.destroy(); } catch (_) { }
        list.splice(i, 1);
      }
    }
  };
  pruneList(Game.chests);
  pruneList(Game.pineappleUltimatePickups);

  // 创建/更新
  for (const chestState of chests) {
    if (!chestState || !chestState.id) continue;
    const isPine = (chestState.type === 'PINEAPPLE');
    const list = isPine ? Game.pineappleUltimatePickups : Game.chests;

    let local = list.find(x => x && x.id === chestState.id);
    if (!local) {
      if (isPine && typeof PineappleUltimatePickup !== 'undefined') {
        const opts = {
          id: chestState.id,
          spawnX: (typeof chestState.spawnX === 'number') ? chestState.spawnX : (chestState.x || 0),
          spawnY: (typeof chestState.spawnY === 'number') ? chestState.spawnY : (chestState.y || 0),
          flyDurationMs: (typeof chestState.flyDurationMs === 'number') ? chestState.flyDurationMs : 600,
          expValue: 0
        };
        local = new PineappleUltimatePickup(chestState.x || 0, chestState.y || 0, opts);
      } else {
        local = new ChestCtor(chestState.x || 0, chestState.y || 0, chestState.id);
      }
      list.push(local);
    } else {
      // 平滑：靜態為主，直接同步
      if (typeof chestState.x === 'number') local.x = chestState.x;
      if (typeof chestState.y === 'number') local.y = chestState.y;
    }
  }
}

// ✅ 不影响单机：只在多人模式下执行
// ✅ 修復「看不到隊友」：舊版 updateRemotePlayerFromServer 依賴不存在的 RemotePlayerManager.create()，導致遠端玩家根本沒被建立
function updateRemotePlayerFromServer(playerState) {
  try {
    if (typeof Game === 'undefined' || !Game.multiplayer || !Game.multiplayer.enabled) return;
    if (!playerState || typeof playerState !== 'object') return;
    if (typeof RemotePlayerManager === 'undefined' || typeof RemotePlayerManager.getOrCreate !== 'function') return;

    const uid = playerState.uid;
    if (!uid) return;

    const startX = (typeof playerState.x === 'number') ? playerState.x : 0;
    const startY = (typeof playerState.y === 'number') ? playerState.y : 0;
    const characterId = (typeof playerState.characterId === 'string') ? playerState.characterId : null;
    const talentLevels = (playerState.talentLevels && typeof playerState.talentLevels === 'object') ? playerState.talentLevels : null;

    const remotePlayer = RemotePlayerManager.getOrCreate(uid, startX, startY, characterId, talentLevels);
    if (!remotePlayer) return;

    // 位置：用與 RemotePlayerManager.updateAll 同源的插值（只設 target）
    if (typeof playerState.x === 'number') {
      // 速度估計（供外推）：用兩次狀態差分
      try {
        const now = Date.now();
        if (typeof remotePlayer._netTargetX === 'number' && typeof remotePlayer._lastStateTime === 'number') {
          const dt = Math.max(1, now - remotePlayer._lastStateTime);
          remotePlayer._velocityX = (playerState.x - remotePlayer._netTargetX) / (dt / 1000);
        }
        remotePlayer._lastStateTime = now;
      } catch (_) { }
      remotePlayer._netTargetX = playerState.x;
    }
    if (typeof playerState.y === 'number') {
      try {
        const now = Date.now();
        if (typeof remotePlayer._netTargetY === 'number' && typeof remotePlayer._lastStateTime === 'number') {
          const dt = Math.max(1, now - remotePlayer._lastStateTime);
          remotePlayer._velocityY = (playerState.y - remotePlayer._netTargetY) / (dt / 1000);
        }
        remotePlayer._lastStateTime = now;
      } catch (_) { }
      remotePlayer._netTargetY = playerState.y;
    }
    if (typeof remotePlayer.x !== 'number' && typeof remotePlayer._netTargetX === 'number') remotePlayer.x = remotePlayer._netTargetX;
    if (typeof remotePlayer.y !== 'number' && typeof remotePlayer._netTargetY === 'number') remotePlayer.y = remotePlayer._netTargetY;

    // 狀態：不可用 `||`（0 會被吃掉）
    if (typeof playerState.health === 'number') remotePlayer.health = playerState.health;
    if (typeof playerState.maxHealth === 'number') remotePlayer.maxHealth = playerState.maxHealth;
    if (typeof playerState.energy === 'number') remotePlayer.energy = playerState.energy;
    if (typeof playerState.maxEnergy === 'number') remotePlayer.maxEnergy = playerState.maxEnergy;
    if (typeof playerState.level === 'number') remotePlayer.level = playerState.level;
    if (typeof playerState.facing === 'number') remotePlayer.facing = playerState.facing;
    if (typeof playerState.isDead === 'boolean') remotePlayer._isDead = playerState.isDead;
    if (typeof playerState.resurrectionProgress === 'number') remotePlayer._resurrectionProgress = playerState.resurrectionProgress;
    if (typeof playerState.nickname === 'string') remotePlayer._remotePlayerName = playerState.nickname;
    
    // ✅ 單機元素：大招狀態只同步到對應的遠程玩家，不會讓所有玩家一起放大
    // 大招是單機元素，每個玩家獨立，不會互相影響
    if (typeof playerState.isUltimateActive === 'boolean') {
      remotePlayer.isUltimateActive = playerState.isUltimateActive;
    }
    if (typeof playerState.ultimateImageKey === 'string' && playerState.ultimateImageKey) {
      remotePlayer._ultimateImageKey = playerState.ultimateImageKey;
    } else if (playerState.isUltimateActive === false) {
      remotePlayer._ultimateImageKey = null;
    }
    if (typeof playerState.ultimateEndTime === 'number') {
      remotePlayer.ultimateEndTime = playerState.ultimateEndTime;
    }
    // 體型同步（大招變身）
    // ✅ 修复：大招结束时，服务器会恢复体积，需要同步（即使值为原始值，也要同步）
    if (typeof playerState.width === 'number') {
      // 允许同步原始体积（可能小于或等于当前值）
      remotePlayer.width = playerState.width;
    }
    if (typeof playerState.height === 'number') {
      // 允许同步原始体积（可能小于或等于当前值）
      remotePlayer.height = playerState.height;
    }
    if (typeof playerState.collisionRadius === 'number') {
      // 允许同步原始碰撞半径（可能小于或等于当前值）
      remotePlayer.collisionRadius = playerState.collisionRadius;
    }
  } catch (_) { }
}

// ✅ 不影响单机：只在多人模式下执行
function updateEnemiesFromServer(enemies) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.enemies) return;
  // ✅ 修復：防止 enemies 不是數組導致整個系統崩潰
  if (!Array.isArray(enemies)) return;

  const EnemyCtor = _getGlobalCtor("Enemy");
  const isBossType = (t) => (
    t === 'MINI_BOSS' || t === 'BOSS' ||
    t === 'ELF_MINI_BOSS' || t === 'ELF_BOSS' ||
    t === 'HUMAN_MINI_BOSS' || t === 'HUMAN_BOSS'
  );

  // 创建敌人ID映射
  // ✅ 修復：過濾掉 null/undefined 元素，防止 e.id 訪問錯誤
  const serverEnemyIds = new Set(enemies.filter(e => e && e.id).map(e => e.id));
  const localEnemyIds = new Set(Game.enemies.filter(e => e && e.id).map(e => e.id));

  // 移除服务器不存在的敌人
  for (let i = Game.enemies.length - 1; i >= 0; i--) {
    const enemy = Game.enemies[i];
    // ✅ 修復：防止 enemy 為 null/undefined 或沒有 id 導致崩潰
    if (!enemy || !enemy.id || !serverEnemyIds.has(enemy.id)) {
      Game.enemies.splice(i, 1);
    }
  }

  // 更新或创建敌人
  for (const enemyState of enemies) {
    // ✅ 修復：跳過無效的敵人狀態，防止整個系統崩潰
    if (!enemyState || !enemyState.id) continue;
    let enemy = Game.enemies.find(e => e && e.id === enemyState.id);
    if (!enemy && EnemyCtor) {
      // 创建新敌人
      enemy = new EnemyCtor(enemyState.x, enemyState.y, enemyState.type);
      enemy.id = enemyState.id;
      // ✅ 權威多人：敵人 AI/攻擊/遠程投射物由伺服器權威處理；客戶端敵人只做顯示（避免本地生成火彈/瓶子）
      try { enemy._netSimulated = true; } catch (_) { }
      Game.enemies.push(enemy);
    }
    if (enemy) {
      // ✅ 多人視覺回饋：傷害數字統一改用 server hitEvents（含爆擊標記）
      // 避免「health delta」顯示與 hitEvents 疊加，造成顏色/大小混亂與節流誤判

      // ✅ 網路插值：記錄目標位置，交由 Enemy.update 在多人模式下平滑追幀
      if (typeof enemyState.x === 'number') enemy._netTargetX = enemyState.x;
      if (typeof enemyState.y === 'number') enemy._netTargetY = enemyState.y;
      if (typeof enemyState.health === 'number') enemy.health = enemyState.health;
      if (typeof enemyState.maxHealth === 'number') enemy.maxHealth = enemyState.maxHealth;
      // ✅ 同步敵人屬性（否則某些怪/王會看起來「不追蹤/移動怪怪的」）
      if (typeof enemyState.type === 'string') enemy.type = enemyState.type;
      if (typeof enemyState.speed === 'number') enemy.speed = enemyState.speed;
      if (typeof enemyState.size === 'number') {
        try {
          enemy.size = enemyState.size;
          // ✅ 修復：不要把 BOSS/小BOSS 的非等比尺寸覆蓋成正方形（會造成圖片變形）
          // - 若該敵人有 config.WIDTH/HEIGHT 或屬於 BOSS 類，就維持原本 width/height
          const t = (typeof enemyState.type === 'string') ? enemyState.type : enemy.type;
          const cfg = (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.ENEMIES) ? CONFIG.ENEMIES[t] : null;
          const hasWH = cfg && typeof cfg.WIDTH === 'number' && typeof cfg.HEIGHT === 'number';
          if (!isBossType(t) && !hasWH) {
            if (typeof enemy.width === 'number') enemy.width = enemyState.size;
            if (typeof enemy.height === 'number') enemy.height = enemyState.size;
          }
        } catch (_) { }
      }
      if (typeof enemy.x !== 'number' && typeof enemy._netTargetX === 'number') enemy.x = enemy._netTargetX;
      if (typeof enemy.y !== 'number' && typeof enemy._netTargetY === 'number') enemy.y = enemy._netTargetY;

      // ✅ MMORPG 架構：同步敵人死亡狀態，讓所有玩家都能看到死亡動畫
      // ✅ 單機元素：音效是單機元素，只在本地播放
      if (typeof enemyState.isDying === 'boolean') {
        const wasDying = enemy.isDying;
        enemy.isDying = enemyState.isDying;
        // ✅ 修復：當敵人從非死亡狀態變為死亡狀態時，只在本地玩家是擊殺者時播放死亡音效
        // 音效是單機元素，應該像其他音效一樣在客戶端直接播放，但只對本地玩家播放
        if (!wasDying && enemyState.isDying) {
          try {
            const isLocalPlayerKill = (enemyState.killerUid && Game.multiplayer && Game.multiplayer.uid && enemyState.killerUid === Game.multiplayer.uid);
            if (isLocalPlayerKill && typeof AudioManager !== 'undefined') {
              AudioManager.playSound('enemy_death');
            }
          } catch (e) {
            console.warn('[SurvivalOnline] 怪物死亡音效播放失敗:', e);
          }
        }
      }
      if (typeof enemyState.deathElapsed === 'number') {
        enemy.deathElapsed = enemyState.deathElapsed;
      }
      if (typeof enemyState.deathVelX === 'number') {
        enemy.deathVelX = enemyState.deathVelX;
      }
      if (typeof enemyState.deathVelY === 'number') {
        enemy.deathVelY = enemyState.deathVelY;
      }

      // ✅ MMORPG 架構：同步敵人受傷紅閃，讓所有玩家都能看到
      if (typeof enemyState.hitFlashTime === 'number') {
        enemy.hitFlashTime = enemyState.hitFlashTime;
      }

      if (enemyState.isDead) {
        enemy.health = 0;
        // ✅ 伺服器權威：不要在客戶端先行刪除
        // 伺服器會先跑 isDying 動畫，完成後才把該 enemy 從 state.enemies 移除。
        // 若這裡標記刪除，會導致死亡動畫消失/閃爍與不同步。
      }
    }
  }
}

// ✅ 不影响单机：只在多人模式下执行
function updateProjectilesFromServer(projectiles) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.projectiles) return;
  // ✅ 修復：防止 projectiles 不是數組導致整個系統崩潰
  if (!Array.isArray(projectiles)) return;

  const ProjectileCtor = _getGlobalCtor("Projectile");

  // 创建投射物ID映射
  // ✅ 修復：過濾掉 null/undefined 元素，防止 p.id 訪問錯誤
  const serverProjectileIds = new Set(projectiles.filter(p => p && p.id).map(p => p.id));
  const localProjectileIds = new Set(Game.projectiles.filter(p => p && p.id).map(p => p.id));

  // ⚠️ 修復：移除服务器不存在的投射物，但排除通過 projectile_spawn 事件創建的特殊視覺效果
  // 這些特殊視覺效果（雷射、連鎖閃電、斬擊、鳳梨環繞等）不在服務器的 projectiles 中，
  // 它們是通過事件廣播的，不應該被清理邏輯刪除
  const isSpecialVisualEffect = (proj) => {
    if (!proj) return false;
    // 檢查是否是通過 projectile_spawn 事件創建的特殊視覺效果
    const weaponType = proj.weaponType;
    const constructorName = proj.constructor && proj.constructor.name;
    return (
      // 一次性視覺效果（每次 fire() 都創建新的）
      weaponType === 'LASER' || weaponType === 'CHAIN_LIGHTNING' || weaponType === 'FRENZY_LIGHTNING' ||
      weaponType === 'SLASH' || weaponType === 'FRENZY_SLASH' || weaponType === 'INVINCIBLE' || weaponType === 'SING' ||
      // 持續視覺效果（通過事件廣播的）
      weaponType === 'AURA_FIELD' || weaponType === 'GRAVITY_WAVE' ||
      weaponType === 'ORBIT' || weaponType === 'CHICKEN_BLESSING' || weaponType === 'ROTATING_MUFFIN' ||
      weaponType === 'HEART_COMPANION' || weaponType === 'PINEAPPLE_ORBIT' ||
      weaponType === 'RADIANT_GLORY' || weaponType === 'MIND_MAGIC' ||
      weaponType === 'BIG_ICE_BALL' || weaponType === 'FRENZY_ICE_BALL' ||
      weaponType === 'YOUNG_DADA_GLORY' || weaponType === 'FRENZY_YOUNG_DADA_GLORY' ||
      weaponType === 'DEATHLINE_WARRIOR' || weaponType === 'DEATHLINE_SUPERMAN' ||
      weaponType === 'JUDGMENT' || weaponType === 'DIVINE_JUDGMENT' || weaponType === 'EXPLOSION' ||
      // 通過構造函數名稱檢查
      constructorName === 'LaserBeam' || constructorName === 'ChainLightningEffect' || constructorName === 'FrenzyLightningEffect' ||
      constructorName === 'SlashEffect' || constructorName === 'InvincibleEffect' || constructorName === 'SingEffect' || constructorName === 'AuraField' || constructorName === 'GravityWaveField' ||
      constructorName === 'OrbitBall' || constructorName === 'RadiantGloryEffect' || constructorName === 'ShockwaveEffect' ||
      constructorName === 'IceFieldEffect' || constructorName === 'YoungDadaGloryEffect' || constructorName === 'FrenzyYoungDadaGloryEffect' ||
      constructorName === 'DeathlineWarriorEffect' || constructorName === 'JudgmentEffect' || constructorName === 'DivineJudgmentEffect' ||
      constructorName === 'ExplosionEffect' ||
      // 檢查是否有 _remotePlayerUid（通過事件創建的標記）
      (proj._remotePlayerUid && proj._isVisualOnly)
    );
  };
  
  // 移除服务器不存在的投射物（但排除特殊視覺效果）
  for (let i = Game.projectiles.length - 1; i >= 0; i--) {
    const proj = Game.projectiles[i];
    // ✅ 修復：防止 proj 為 null/undefined 或沒有 id 導致崩潰
    // ⚠️ 修復：不要刪除特殊視覺效果（它們不在服務器的 projectiles 中）
    if (!proj || !proj.id) {
      // 沒有 ID 的投射物，如果不是特殊視覺效果，則刪除
      if (!isSpecialVisualEffect(proj)) {
        Game.projectiles.splice(i, 1);
      }
    } else if (!serverProjectileIds.has(proj.id)) {
      // 不在服務器列表中的投射物，如果是特殊視覺效果，則保留（它們通過事件廣播）
      if (!isSpecialVisualEffect(proj)) {
        Game.projectiles.splice(i, 1);
      }
    }
  }

  // 更新或创建投射物
  for (const projState of projectiles) {
    // ✅ 修復：跳過無效的投射物狀態，防止整個系統崩潰
    if (!projState || !projState.id) continue;
    let proj = Game.projectiles.find(p => p && p.id === projState.id);
    if (!proj && ProjectileCtor) {
      // 创建新投射物（仅视觉）
      proj = new ProjectileCtor(projState.x, projState.y, projState.angle, projState.weaponType, 0, projState.speed, projState.size);
      proj.id = projState.id;
      proj._isVisualOnly = true; // 仅视觉，伤害由服务器计算
      Game.projectiles.push(proj);
    }
    if (proj) {
      // ✅ 網路插值：記錄目標位置，避免每 33ms 硬跳造成閃現
      if (typeof projState.x === 'number') proj._netTargetX = projState.x;
      if (typeof projState.y === 'number') proj._netTargetY = projState.y;
      if (typeof projState.angle === 'number') proj.angle = projState.angle;
      // ✅ 同步投射物屬性（否則追蹤/特殊子彈會失效，看起來像「技能不出/不追蹤」）
      if (typeof projState.weaponType === 'string') proj.weaponType = projState.weaponType;
      if (typeof projState.speed === 'number') proj.speed = projState.speed;
      if (typeof projState.size === 'number') {
        proj.size = projState.size;
        // ✅ 修復：同步 width/height 和 collisionRadius，確保投射物體積正確顯示
        try {
          if (typeof proj.width === 'number') proj.width = projState.size;
          if (typeof proj.height === 'number') proj.height = projState.size;
          // ✅ 修復：同步碰撞半徑（用於碰撞檢測和擴散傷害計算）
          if (typeof proj.collisionRadius === 'number') {
            proj.collisionRadius = projState.size / 2;
          }
        } catch (_) { }
      }
      if (typeof projState.homing === 'boolean') proj.homing = projState.homing;
      if (typeof projState.turnRatePerSec === 'number') proj.turnRatePerSec = projState.turnRatePerSec;
      if (typeof projState.assignedTargetId === 'string' || projState.assignedTargetId === null) proj.assignedTargetId = projState.assignedTargetId;
      // ✅ 修復：同步 maxDistance 屬性（用於投射物最大飛行距離）
      if (typeof projState.maxDistance === 'number' && projState.maxDistance > 0) {
        proj.maxDistance = projState.maxDistance;
      }
      // 保險：多人權威投射物一定是視覺投射物
      proj._isVisualOnly = true;
      if (typeof proj.x !== 'number' && typeof proj._netTargetX === 'number') proj.x = proj._netTargetX;
      if (typeof proj.y !== 'number' && typeof proj._netTargetY === 'number') proj.y = proj._netTargetY;
    }
  }
}

// ✅ 不影响单机：只在多人模式下执行（伺服器權威的 BOSS/HUMAN2 遠程投射物）
function updateBossProjectilesFromServer(bossProjectiles) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.multiplayer.enabled) return;
  if (!Array.isArray(Game.bossProjectiles)) Game.bossProjectiles = [];

  const BossProjectileCtor = _getGlobalCtor("BossProjectile");
  const BottleProjectileCtor = _getGlobalCtor("BottleProjectile");

  const serverIds = new Set(bossProjectiles.map(p => p && p.id).filter(Boolean));
  for (let i = Game.bossProjectiles.length - 1; i >= 0; i--) {
    const p = Game.bossProjectiles[i];
    if (!p || !serverIds.has(p.id)) {
      try { if (p && typeof p.destroy === 'function') p.destroy(); } catch (_) { }
      Game.bossProjectiles.splice(i, 1);
    }
  }

  for (const st of bossProjectiles) {
    if (!st || !st.id) continue;
    let p = Game.bossProjectiles.find(x => x && x.id === st.id);

    if (!p) {
      // 只做視覺：不讓本地跑碰撞/扣血
      if (st.kind === 'BOTTLE' && BottleProjectileCtor) {
        const w = (typeof st.width === 'number') ? st.width : 12;
        const h = (typeof st.height === 'number') ? st.height : 16;
        // ✅ 修复：与单机一致 - 使用服务器端的位置和速度创建瓶子投射物
        p = new BottleProjectileCtor(st.x || 0, st.y || 0, st.x || 0, st.y || 0, 1, st.damage || 10, w, h);
        // ✅ 修复：同步服务器端的 vx 和 vy（瓶子投射物使用抛物线运动）
        if (typeof st.vx === 'number') p.vx = st.vx;
        if (typeof st.vy === 'number') p.vy = st.vy;
        if (typeof st.g === 'number') p.g = st.g;
      } else if (BossProjectileCtor) {
        const size = (typeof st.size === 'number') ? st.size : 18;
        p = new BossProjectileCtor(st.x || 0, st.y || 0, st.angle || 0, st.speed || 5, st.damage || 10, size, !!st.homing, st.turnRate || 0);
      }
      if (p) {
        p.id = st.id;
        // ✅ 修复：立即设置初始位置，确保投射物在正确的位置创建
        // 原因：Entity 构造函数会设置 x 和 y，但我们需要确保它们与服务器状态一致
        if (typeof st.x === 'number') {
          p.x = st.x;
          p._netTargetX = st.x;
        }
        if (typeof st.y === 'number') {
          p.y = st.y;
          p._netTargetY = st.y;
        }
        // ✅ 修复：立即设置角度，确保投射物朝向正确
        if (typeof st.angle === 'number') {
          p.angle = st.angle;
          p._netAngle = st.angle;
        }
        p._isVisualOnly = true;
        Game.bossProjectiles.push(p);
      }
    }

    if (p) {
      // ✅ 修复：持续更新网络目标位置和角度，确保投射物正确移动
      if (typeof st.x === 'number') p._netTargetX = st.x;
      if (typeof st.y === 'number') p._netTargetY = st.y;
      if (typeof st.angle === 'number') p._netAngle = st.angle;
      if (typeof st.speed === 'number') p.speed = st.speed;
      if (typeof st.damage === 'number') p.damage = st.damage;
      if (typeof st.size === 'number') {
        try { p.size = st.size; p.width = st.size; p.height = st.size; } catch (_) { }
      }
      if (typeof st.homing === 'boolean') p.homing = st.homing;
      if (typeof st.turnRate === 'number') p.turnRate = st.turnRate;
      if (typeof st.width === 'number') p.width = st.width;
      if (typeof st.height === 'number') p.height = st.height;
      // ✅ 修复：与单机一致 - 同步瓶子投射物的 vx、vy 和 g（抛物线运动）
      if (st.kind === 'BOTTLE') {
        if (typeof st.vx === 'number') p.vx = st.vx;
        if (typeof st.vy === 'number') p.vy = st.vy;
        if (typeof st.g === 'number') p.g = st.g;
      }
      p._isVisualOnly = true;
    }
  }
}

// ✅ 不影响单机：只在多人模式下执行（伺服器權威的修羅彈幕 bullets）
function updateBulletsFromServer(bullets) {
  try {
    if (typeof Game === 'undefined' || !Game.multiplayer || !Game.multiplayer.enabled) return;
    if (typeof BulletSystem === 'undefined') return;

    // ✅ 修复：确保 BulletSystem 已初始化，特别是图片加载
    // 原因：BulletSystem.init() 只在 Game.init() 时调用一次，但在多人模式下可能图片还没加载完成
    // 如果图片未加载，弹幕会使用备用的圆形绘制，但用户期望看到雪碧图
    if (!BulletSystem.bulletImageReady && typeof BulletSystem.init === 'function') {
      BulletSystem.init();
    }

    // 客戶端只渲染：覆蓋 bullets，清空 emitters，避免本地生成
    BulletSystem.enabled = true;
    BulletSystem.emitters = [];
    BulletSystem.bullets = [];

    for (const b of bullets) {
      if (!b) continue;
      // ✅ 修复：与单机一致 - 正确同步弹幕的速度（vx 和 vy），否则弹幕不会移动
      BulletSystem.bullets.push({
        x: (typeof b.x === 'number') ? b.x : 0,
        y: (typeof b.y === 'number') ? b.y : 0,
        vx: (typeof b.vx === 'number') ? b.vx : 0, // ✅ 修复：同步 vx
        vy: (typeof b.vy === 'number') ? b.vy : 0, // ✅ 修复：同步 vy
        life: (typeof b.life === 'number') ? b.life : 0,
        maxLife: (typeof b.maxLife === 'number') ? b.maxLife : ((typeof b.life === 'number') ? b.life : 0),
        size: (typeof b.size === 'number') ? b.size : 12,
        color: (typeof b.color === 'string') ? b.color : '#ffcc66',
        damage: (typeof b.damage === 'number') ? b.damage : 0
      });
    }
  } catch (_) { }
}

// ✅ 不影响单机：只在多人模式下执行
function updateCarHazardsFromServer(carHazards) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.projectiles) return;
  const CarHazardCtor = _getGlobalCtor("CarHazard");
  if (!CarHazardCtor) return;

  // 创建车辆ID映射
  const serverCarIds = new Set(carHazards.map(c => c.id));

  // 移除服务器不存在的车辆（从projectiles数组中移除）
  for (let i = Game.projectiles.length - 1; i >= 0; i--) {
    const proj = Game.projectiles[i];
    if (proj && (proj.weaponType === 'INTERSECTION_CAR' || (proj.constructor && proj.constructor.name === 'CarHazard'))) {
      if (!serverCarIds.has(proj.id)) {
        Game.projectiles.splice(i, 1);
      }
    }
  }

  // 更新或创建车辆
  for (const carState of carHazards) {
    let car = Game.projectiles.find(p => p.id === carState.id && (p.weaponType === 'INTERSECTION_CAR' || (p.constructor && p.constructor.name === 'CarHazard')));
    if (!car) {
      // 创建新车辆（仅视觉，伤害由服务器计算）
      car = new CarHazardCtor({
        x: carState.x || 0,
        y: carState.y || 0,
        vx: carState.vx || 0,
        vy: carState.vy || 0,
        width: carState.width || 200,
        height: carState.height || 100,
        imageKey: carState.imageKey || 'car',
        damage: carState.damage || 100,
        despawnPad: carState.despawnPad || 400
      });
      car.id = carState.id;
      car._isVisualOnly = true; // 仅视觉，伤害由服务器计算
      Game.projectiles.push(car);
    }
    if (car) {
      // ✅ 網路插值：車輛用目標位置 + 速度，避免瞬移
      if (typeof carState.x === 'number') car._netTargetX = carState.x;
      if (typeof carState.y === 'number') car._netTargetY = carState.y;
      if (typeof carState.vx === 'number') car.vx = carState.vx;
      if (typeof carState.vy === 'number') car.vy = carState.vy;
      car.hitPlayer = carState.hitPlayer || false;
    }
  }
}

// ✅ 不影响单机：只在多人模式下执行
function updateExperienceOrbsFromServer(orbs) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.experienceOrbs) return;

  const ExperienceOrbCtor = _getGlobalCtor("ExperienceOrb");

  // 创建经验球ID映射
  const serverOrbIds = new Set(orbs.map(o => o.id));

  // 移除服务器不存在的经验球
  for (let i = Game.experienceOrbs.length - 1; i >= 0; i--) {
    if (!serverOrbIds.has(Game.experienceOrbs[i].id)) {
      Game.experienceOrbs.splice(i, 1);
    }
  }

  // 更新或创建经验球
  for (const orbState of orbs) {
    let orb = Game.experienceOrbs.find(o => o.id === orbState.id);
    if (!orb && ExperienceOrbCtor) {
      orb = new ExperienceOrbCtor(orbState.x, orbState.y, orbState.value);
      orb.id = orbState.id;
      Game.experienceOrbs.push(orb);
    }
    if (orb) {
      // ✅ 網路插值：記錄目標位置，避免硬跳/吸附造成不同步
      if (typeof orbState.x === 'number') orb._netTargetX = orbState.x;
      if (typeof orbState.y === 'number') orb._netTargetY = orbState.y;
      if (typeof orb.x !== 'number' && typeof orb._netTargetX === 'number') orb.x = orb._netTargetX;
      if (typeof orb.y !== 'number' && typeof orb._netTargetY === 'number') orb.y = orb._netTargetY;
      // value 以伺服器為準（避免不同版本）
      if (typeof orbState.value === 'number') orb.value = orbState.value;
    }
  }
}

// ❌ 腫瘤切除：此函數已廢棄，傷害計算完全由伺服器權威處理
// 傷害數字和敵人血量更新都通過 state.hitEvents 和 state.enemies 同步
// 保留此函數僅為向後兼容，但不會被調用（handleHostDataMessage 在權威伺服器模式下已被禁用）
function _handleEnemyDamageMessage(fromUid, msg) {
  // ✅ 腫瘤切除：不再處理 enemy_damage 消息，傷害由伺服器 hitEvents 統一處理
  // 此函數保留僅為向後兼容，實際不會執行任何邏輯
  return;
}

// ✅ MMORPG 架構：處理 weapon_upgrade 消息（所有玩家都可以調用）
function _handleWeaponUpgradeMessage(fromUid, msg) {
  if (!msg || typeof msg !== "object") return;
  if (!fromUid || typeof fromUid !== "string") {
    console.warn("[SurvivalOnline] _handleWeaponUpgradeMessage: fromUid 無效", fromUid);
    return;
  }

  // 速率限制：每秒最多 10 次武器升級（防止濫用）
  if (!_checkRateLimit(fromUid, "upgrade", 10)) {
    console.warn("[SurvivalOnline] 武器升級速率過高，忽略:", fromUid);
    return;
  }

  const weaponType = typeof msg.weaponType === "string" ? msg.weaponType : null;
  if (!weaponType) {
    console.warn("[SurvivalOnline] _handleWeaponUpgradeMessage: weaponType 無效", weaponType);
    return;
  }

  // 跳過自己的武器升級消息（因為已經在本地處理過了）
  if (fromUid === _uid) {
    return;
  }

  // ✅ 真正的MMORPG：找到對應的遠程玩家並應用武器升級
  console.log(`[SurvivalOnline] _handleWeaponUpgradeMessage: 處理武器升級, fromUid=${fromUid}, weaponType=${weaponType}`);
  try {
    let remotePlayer = null;
    if (typeof RemotePlayerManager !== 'undefined' && typeof RemotePlayerManager.get === 'function') {
      remotePlayer = RemotePlayerManager.get(fromUid);
    }

    if (remotePlayer && typeof remotePlayer.addWeapon === 'function') {
      // 檢查是否已有此武器
      const existingWeapon = remotePlayer.weapons ? remotePlayer.weapons.find(w => w && w.type === weaponType) : null;

      if (existingWeapon) {
        // 如果已有此武器，則升級
        console.log(`[SurvivalOnline] _handleWeaponUpgradeMessage: 升級現有武器 ${weaponType}, 當前等級=${existingWeapon.level || 1}`);
        if (typeof remotePlayer.upgradeWeapon === 'function') {
          remotePlayer.upgradeWeapon(weaponType);
        } else if (existingWeapon.levelUp && typeof existingWeapon.levelUp === 'function') {
          existingWeapon.levelUp();
        }
      } else {
        // 否則添加新武器
        console.log(`[SurvivalOnline] _handleWeaponUpgradeMessage: 添加新武器 ${weaponType}`);
        remotePlayer.addWeapon(weaponType);
      }
      console.log(`[SurvivalOnline] _handleWeaponUpgradeMessage: 遠程玩家 ${fromUid} 的武器列表:`, remotePlayer.weapons ? remotePlayer.weapons.map(w => `${w.type}(Lv${w.level || 1})`) : []);
    } else {
      console.warn("[SurvivalOnline] _handleWeaponUpgradeMessage: 找不到遠程玩家", fromUid);
    }
  } catch (e) {
    console.warn("[SurvivalOnline] 同步武器升級失敗:", e);
  }
}

// ✅ MMORPG 架構：處理 input 消息（所有玩家都可以調用）
function _handleInputMessage(fromUid, msg) {
  if (!msg || typeof msg !== "object") return;
  if (!fromUid || typeof fromUid !== "string") {
    console.warn("[SurvivalOnline] _handleInputMessage: fromUid 無效", fromUid);
    return;
  }

  // 速率限制：每秒最多 60 次輸入（防止濫用，但允許正常移動）
  if (!_checkRateLimit(fromUid, "input", 60)) {
    // 輸入速率過高時忽略，但不影響其他功能
    return;
  }

  const inputX = typeof msg.x === "number" ? msg.x : 0;
  const inputY = typeof msg.y === "number" ? msg.y : 0;

  // 跳過自己的輸入消息（因為已經在本地處理過了）
  if (fromUid === _uid) {
    return;
  }

  // 找到對應的遠程玩家並更新輸入
  try {
    let remotePlayer = null;
    if (typeof RemotePlayerManager !== 'undefined' && typeof RemotePlayerManager.get === 'function') {
      remotePlayer = RemotePlayerManager.get(fromUid);
    }

    if (remotePlayer) {
      // 更新遠程玩家的輸入
      remotePlayer._remoteInput = { x: inputX, y: inputY };
      remotePlayer._lastRemoteInputTime = Date.now();
    }
  } catch (e) {
    console.warn("[SurvivalOnline] 同步輸入失敗:", e);
  }
}

// ✅ MMORPG 架構：處理 ultimate_pineapple 消息（所有玩家都可以調用）
function _handleUltimatePineappleMessage(fromUid, msg) {
  if (!msg || typeof msg !== "object") return;
  if (!fromUid || typeof fromUid !== "string") {
    console.warn("[SurvivalOnline] _handleUltimatePineappleMessage: fromUid 無效", fromUid);
    return;
  }

  // 速率限制：每秒最多 5 次鳳梨大絕（防止濫用）
  if (!_checkRateLimit(fromUid, "ultimate", 5)) {
    console.warn("[SurvivalOnline] 鳳梨大絕速率過高，忽略:", fromUid);
    return;
  }

  const x = typeof msg.x === "number" ? msg.x : 0;
  const y = typeof msg.y === "number" ? msg.y : 0;

  // 跳過自己的鳳梨大絕消息（因為已經在本地處理過了）
  if (fromUid === _uid) {
    return;
  }

  // 找到對應的遠程玩家並生成鳳梨掉落物
  try {
    let remotePlayer = null;
    if (typeof RemotePlayerManager !== 'undefined' && typeof RemotePlayerManager.get === 'function') {
      remotePlayer = RemotePlayerManager.get(fromUid);
    }

    // 使用遠程玩家的位置（如果可用），否則使用消息中的位置
    const spawnX = (remotePlayer && typeof remotePlayer.x === "number") ? remotePlayer.x : x;
    const spawnY = (remotePlayer && typeof remotePlayer.y === "number") ? remotePlayer.y : y;

    // 生成鳳梨掉落物（所有玩家都能看到）
    if (typeof Game !== "undefined" && typeof Game.spawnPineappleUltimatePickup === "function") {
      Game.spawnPineappleUltimatePickup(spawnX, spawnY, {});
    }
  } catch (e) {
    console.warn("[SurvivalOnline] 同步鳳梨大絕失敗:", e);
  }
}

function handleHostDataMessage(fromUid, msg) {
  if (!msg || typeof msg !== "object") return;
  if (!fromUid || typeof fromUid !== "string") {
    console.warn("[SurvivalOnline] handleHostDataMessage: fromUid 無效", fromUid);
    return;
  }
  // ✅ 權威伺服器模式：禁止舊 host 聚合/轉發通道（pos/state/snapshot...）
  // 這條通道會把 client-side 狀態當成權威再廣播，是「舊權威系統衝突」的核心來源之一。
  try {
    if (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
      return;
    }
  } catch (_) { }
  if (msg.t === "reconnect_request") {
    // M5：隊員請求全量快照（重連恢復）
    // ✅ LEGACY：權威多人下已停用
    return;
  } else if (msg.t === "pos") {
    // 收到玩家位置，室長彙總後廣播
    // 再次檢查 fromUid（防止緩存問題）
    if (!fromUid || typeof fromUid !== "string") {
      console.warn("[SurvivalOnline] handleHostDataMessage: pos 消息 fromUid 無效", fromUid);
      return;
    }
    const player = _membersState ? (_membersState.get(fromUid) || {}) : {};
    const name = typeof player.name === "string" ? player.name : (fromUid && typeof fromUid.slice === "function" ? fromUid.slice(0, 6) : "unknown");
    const x = typeof msg.x === "number" ? msg.x : 0;
    const y = typeof msg.y === "number" ? msg.y : 0;

    // 獲取成員的角色ID和天賦等級
    const member = _membersState ? _membersState.get(fromUid) : null;
    const characterId = (member && member.characterId) ? member.characterId : null;
    const talentLevels = (member && member.talentLevels && typeof member.talentLevels === 'object') ? member.talentLevels : null;

    // 獲取遠程玩家對象（如果已存在）以獲取完整狀態
    let remotePlayer = null;
    try {
      if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.get === "function") {
        remotePlayer = RemotePlayerManager.get(fromUid);
      }
    } catch (_) { }

    // 在 host 端也顯示（讓 host 看得到別人）- 包含完整狀態信息
    Runtime.onStateMessage({
      t: "state",
      players: {
        [fromUid]: {
          x,
          y,
          name,
          characterId: characterId,
          // 添加更多狀態信息（如果遠程玩家對象已存在）
          health: (remotePlayer && typeof remotePlayer.health === "number") ? remotePlayer.health : 100,
          maxHealth: (remotePlayer && typeof remotePlayer.maxHealth === "number") ? remotePlayer.maxHealth : 100,
          _isDead: (remotePlayer && typeof remotePlayer._isDead === "boolean") ? remotePlayer._isDead : false,
          _resurrectionProgress: (remotePlayer && typeof remotePlayer._resurrectionProgress === "number") ? remotePlayer._resurrectionProgress : 0,
          isUltimateActive: (remotePlayer && typeof remotePlayer.isUltimateActive === "boolean") ? remotePlayer.isUltimateActive : false,
          ultimateImageKey: (remotePlayer && remotePlayer._ultimateImageKey) ? remotePlayer._ultimateImageKey : null,
          ultimateEndTime: (remotePlayer && typeof remotePlayer.ultimateEndTime === "number") ? remotePlayer.ultimateEndTime : 0,
          width: (remotePlayer && typeof remotePlayer.width === "number" && remotePlayer.width > 0) ? remotePlayer.width : null,
          height: (remotePlayer && typeof remotePlayer.height === "number" && remotePlayer.height > 0) ? remotePlayer.height : null,
          collisionRadius: (remotePlayer && typeof remotePlayer.collisionRadius === "number" && remotePlayer.collisionRadius > 0) ? remotePlayer.collisionRadius : null
        }
      }
    });

    // 彙總全員狀態（含 host 自己）
    const players = {};
    try {
      // host 自己
      if (typeof Game !== "undefined" && Game.player) {
        const hostMember = _membersState ? _membersState.get(_uid) : null;
        const hostCharacterId = (hostMember && hostMember.characterId) ? hostMember.characterId : (Game.selectedCharacter && Game.selectedCharacter.id) ? Game.selectedCharacter.id : null;
        const hostPlayer = Game.player;
        players[_uid] = {
          x: Game.player.x,
          y: Game.player.y,
          name: getPlayerNickname(),
          characterId: hostCharacterId, // 添加角色ID
          // 添加更多狀態信息
          health: (hostPlayer && typeof hostPlayer.health === "number") ? hostPlayer.health : 100,
          maxHealth: (hostPlayer && typeof hostPlayer.maxHealth === "number") ? hostPlayer.maxHealth : 100,
          _isDead: (hostPlayer && typeof hostPlayer._isDead === "boolean") ? hostPlayer._isDead : false,
          _resurrectionProgress: (hostPlayer && typeof hostPlayer._resurrectionProgress === "number") ? hostPlayer._resurrectionProgress : 0,
          isUltimateActive: (hostPlayer && typeof hostPlayer.isUltimateActive === "boolean") ? hostPlayer.isUltimateActive : false,
          ultimateImageKey: (hostPlayer && hostPlayer._ultimateImageKey) ? hostPlayer._ultimateImageKey : null,
          ultimateEndTime: (hostPlayer && typeof hostPlayer.ultimateEndTime === "number") ? hostPlayer.ultimateEndTime : 0,
          width: (hostPlayer && typeof hostPlayer.width === "number" && hostPlayer.width > 0) ? hostPlayer.width : null,
          height: (hostPlayer && typeof hostPlayer.height === "number" && hostPlayer.height > 0) ? hostPlayer.height : null,
          collisionRadius: (hostPlayer && typeof hostPlayer.collisionRadius === "number" && hostPlayer.collisionRadius > 0) ? hostPlayer.collisionRadius : null
        };
      }
    } catch (_) { }
    // 已知其他人（Runtime 內 + 這次）
    // 使用 Set 來追蹤已處理的 UID，避免重複
    const processedUids = new Set();
    for (const p of Runtime.getRemotePlayers()) {
      if (processedUids.has(p.uid)) continue; // 跳過已處理的
      processedUids.add(p.uid);

      const member = _membersState ? _membersState.get(p.uid) : null;
      const characterId = (member && member.characterId) ? member.characterId : (p.characterId) ? p.characterId : null;

      // 獲取遠程玩家對象（如果已存在）以獲取完整狀態
      let remotePlayer = null;
      try {
        if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.get === "function") {
          remotePlayer = RemotePlayerManager.get(p.uid);
        }
      } catch (_) { }

      players[p.uid] = {
        x: p.x,
        y: p.y,
        name: p.name,
        characterId: characterId, // 添加角色ID
        // 添加更多狀態信息（如果遠程玩家對象已存在）
        health: (remotePlayer && typeof remotePlayer.health === "number") ? remotePlayer.health : 100,
        maxHealth: (remotePlayer && typeof remotePlayer.maxHealth === "number") ? remotePlayer.maxHealth : 100,
        _isDead: (remotePlayer && typeof remotePlayer._isDead === "boolean") ? remotePlayer._isDead : false,
        _resurrectionProgress: (remotePlayer && typeof remotePlayer._resurrectionProgress === "number") ? remotePlayer._resurrectionProgress : 0,
        isUltimateActive: (remotePlayer && typeof remotePlayer.isUltimateActive === "boolean") ? remotePlayer.isUltimateActive : false,
        ultimateImageKey: (remotePlayer && remotePlayer._ultimateImageKey) ? remotePlayer._ultimateImageKey : null,
        ultimateEndTime: (remotePlayer && typeof remotePlayer.ultimateEndTime === "number") ? remotePlayer.ultimateEndTime : 0,
        width: (remotePlayer && typeof remotePlayer.width === "number" && remotePlayer.width > 0) ? remotePlayer.width : null,
        height: (remotePlayer && typeof remotePlayer.height === "number" && remotePlayer.height > 0) ? remotePlayer.height : null,
        collisionRadius: (remotePlayer && typeof remotePlayer.collisionRadius === "number" && remotePlayer.collisionRadius > 0) ? remotePlayer.collisionRadius : null
      };
    }
    // 添加這次的 fromUid（如果還沒處理）
    if (!processedUids.has(fromUid)) {
      const fromMember = _membersState ? _membersState.get(fromUid) : null;
      const fromCharacterId = (fromMember && fromMember.characterId) ? fromMember.characterId : null;
      // 獲取遠程玩家對象（如果已存在）以獲取完整狀態
      let fromRemotePlayer = null;
      try {
        if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.get === "function") {
          fromRemotePlayer = RemotePlayerManager.get(fromUid);
        }
      } catch (_) { }
      players[fromUid] = {
        x,
        y,
        name: name,
        characterId: fromCharacterId, // 添加角色ID
        // 添加更多狀態信息（如果遠程玩家對象已存在）
        health: (fromRemotePlayer && typeof fromRemotePlayer.health === "number") ? fromRemotePlayer.health : 100,
        maxHealth: (fromRemotePlayer && typeof fromRemotePlayer.maxHealth === "number") ? fromRemotePlayer.maxHealth : 100,
        _isDead: (fromRemotePlayer && typeof fromRemotePlayer._isDead === "boolean") ? fromRemotePlayer._isDead : false,
        _resurrectionProgress: (fromRemotePlayer && typeof fromRemotePlayer._resurrectionProgress === "number") ? fromRemotePlayer._resurrectionProgress : 0,
        isUltimateActive: (fromRemotePlayer && typeof fromRemotePlayer.isUltimateActive === "boolean") ? fromRemotePlayer.isUltimateActive : false,
        ultimateImageKey: (fromRemotePlayer && fromRemotePlayer._ultimateImageKey) ? fromRemotePlayer._ultimateImageKey : null,
        ultimateEndTime: (fromRemotePlayer && typeof fromRemotePlayer.ultimateEndTime === "number") ? fromRemotePlayer.ultimateEndTime : 0,
        width: (fromRemotePlayer && typeof fromRemotePlayer.width === "number" && fromRemotePlayer.width > 0) ? fromRemotePlayer.width : null,
        height: (fromRemotePlayer && typeof fromRemotePlayer.height === "number" && fromRemotePlayer.height > 0) ? fromRemotePlayer.height : null,
        collisionRadius: (fromRemotePlayer && typeof fromRemotePlayer.collisionRadius === "number" && fromRemotePlayer.collisionRadius > 0) ? fromRemotePlayer.collisionRadius : null
      };
    }

    // 廣播給所有 client（通過 WebSocket）
    // ✅ 優化：限制同步頻率為 10Hz（100ms），避免流量過大
    // 但要確保數據已更新（上面的代碼已經更新了 players）
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      const now = Date.now();
      if (now - lastSendAt >= 100) { // 100ms = 10Hz
        _sendViaWebSocket({ t: "state", players });
        lastSendAt = now;
      }
    }
    return;
  }
  if (msg.t === "ultimate_pineapple") {
    // ✅ MMORPG 架構：所有玩家都能處理鳳梨大絕掉落物生成，不依賴隊長端
    _handleUltimatePineappleMessage(fromUid, msg);
    return;
  }

  if (msg.t === "weapon_upgrade") {
    // ✅ MMORPG 架構：所有玩家都能處理武器升級，不依賴隊長端
    _handleWeaponUpgradeMessage(fromUid, msg);
    return;
  }

  if (msg.t === "enemy_damage") {
    // ✅ 腫瘤切除：傷害數字改走伺服器 hitEvents（server/game-state.js），不再處理 enemy_damage 消息
    // _handleEnemyDamageMessage 已廢棄，傷害計算完全由伺服器權威處理
    // 傷害數字和敵人血量更新都通過 state.hitEvents 和 state.enemies 同步
    return;
  }

  if (msg.t === "input") {
    // ✅ MMORPG 架構：所有玩家都能處理輸入消息，不依賴隊長端
    _handleInputMessage(fromUid, msg);
    return;
  }
}

// ❌ 舊架構殘留：此函數已被 Runtime.sendToNet 取代，保留僅為向後兼容
// 注意：此函數使用舊的 Host-Client 架構，不應再使用
// 請使用 Runtime.sendToNet 或直接使用 _sendViaWebSocket
function sendToNet(obj) {
  if (!obj) return;
  // ⚠️ 警告：此函數使用舊的 Host-Client 架構
  // ✅ MMO 架構：直接通過 WebSocket 發送，不依賴隊長端
  _sendViaWebSocket(obj);
}

// ❌ 已簡化：handleSignal 函數（WebRTC 相關代碼已刪除）
// 注意：此函數現在只用於房間管理信令（如 starting 狀態），不再用於 WebRTC
// 如果不再需要，可以完全刪除此函數和 listenSignals
async function handleSignal(sig) {
  if (!sig || typeof sig !== "object") {
    console.warn(`[SurvivalOnline] handleSignal: 無效信號`, sig);
    return;
  }
  // 注意：WebRTC 相關信令（offer, answer, candidate）已不再處理
  // 此函數現在只用於房間管理信令（如果有的話）
  console.log(`[SurvivalOnline] handleSignal: 收到信號 type=${sig.type}, fromUid=${sig.fromUid}, toUid=${sig.toUid}, isHost=${_isHost}`);
  // 可以在此處添加房間管理相關的信令處理（如果需要）
}

async function reconnectClient() {
  if (!_activeRoomId || !_uid) return;

  // 清除舊的重連定時器
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }

  try {
    _setText("survival-online-status", "重新連線中…");
  } catch (_) { }

  // 清理舊 WebSocket 連接
  try {
    if (_ws) {
      _ws.onclose = null; // 避免觸發自動重連循環
      _ws.close();
    }
  } catch (_) { }
  _ws = null;
  Runtime.setEnabled(false);

  // 等待房間信息就緒
  if (!_activeRoomId) {
    for (let i = 0; i < 20; i++) {
      if (_activeRoomId) break;
      await new Promise(r => setTimeout(r, 100));
    }
  }
  if (!_activeRoomId) {
    _setText("survival-online-status", "無法重新連線：找不到房間");
    return;
  }

  try {
    await connectWebSocket();
  } catch (e) {
    console.warn("[SurvivalOnline] 重連失敗:", e);
    throw e;
  }
}

// 自動清理定時器
let _autoCleanupTimer = null;

function startAutoCleanup() {
  if (!_isHost || _autoCleanupTimer) return;

  // 每 5 分鐘自動清理一次離線成員
  _autoCleanupTimer = setInterval(async () => {
    if (!_isHost || !_activeRoomId) {
      stopAutoCleanup();
      return;
    }

    try {
      const stale = Array.from(_membersState.values())
        .filter(m => m && m.uid && m.uid !== _uid && m.role !== "host" && _isMemberStale(m));

      for (const m of stale) {
        try {
          await hostKickMember(m.uid);
        } catch (e) {
          console.warn("[SurvivalOnline] 自動清理成員失敗:", m.uid, e);
        }
      }

      // 清理速率限制追蹤器
      _cleanupRateLimitTracker();

      // 檢查房間是否過期（超過 2 小時未更新）
      try {
        if (_roomState && _roomState.updatedAt) {
          let lastUpdateMs = 0;
          const updatedAt = _roomState.updatedAt;
          if (updatedAt && typeof updatedAt.toMillis === "function") {
            lastUpdateMs = updatedAt.toMillis();
          } else if (typeof updatedAt === "number") {
            lastUpdateMs = updatedAt;
          } else if (_roomState._lastUpdateMs) {
            lastUpdateMs = _roomState._lastUpdateMs;
          }

          const ROOM_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 小時
          if (lastUpdateMs > 0 && (Date.now() - lastUpdateMs) > ROOM_EXPIRY_MS) {
            console.warn("[SurvivalOnline] 房間已過期（超過 2 小時未更新），建議解散");
            // 注意：這裡只是警告，不自動解散（因為遊戲可能還在進行）
            // 如果需要自動解散，可以取消下面的註釋
            // await hostDisbandTeam();
          }
        }
      } catch (e) {
        console.warn("[SurvivalOnline] 檢查房間過期失敗:", e);
      }
    } catch (e) {
      console.warn("[SurvivalOnline] 自動清理過程出錯:", e);
    }
  }, 5 * 60 * 1000); // 5 分鐘
}

function stopAutoCleanup() {
  if (_autoCleanupTimer) {
    clearInterval(_autoCleanupTimer);
    _autoCleanupTimer = null;
  }
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
      if (!_isHost && _ws && _ws.readyState === WebSocket.OPEN) s = "已連線（WebSocket）";
      if (_isHost && _ws && _ws.readyState === WebSocket.OPEN) s = "已連線（WebSocket）";
    }
    stEl.textContent = s;
  }

  _setText("survival-online-room-code-display", _activeRoomId || "-");

  // host 設定控制
  const selMap = _qs("survival-online-host-map");
  const selDiff = _qs("survival-online-host-diff");
  if (selMap) selMap.disabled = !_isHost;
  if (selDiff) selDiff.disabled = !_isHost;

  // 角色選擇下拉框：初始化並更新選項（僅顯示已解鎖的角色）
  const selChar = _qs("survival-online-character-select");
  if (selChar && _activeRoomId) {
    // 獲取已解鎖的角色列表
    const CHAR_UNLOCK_KEY = 'unlocked_characters';
    const loadUnlockedCharacters = () => {
      try {
        const raw = localStorage.getItem(CHAR_UNLOCK_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return ['margaret'];
        if (!arr.includes('margaret')) arr.push('margaret');
        return arr;
      } catch (_) {
        return ['margaret'];
      }
    };
    const unlockedSet = new Set(loadUnlockedCharacters());

    // 獲取當前選擇的角色ID（優先使用成員數據，其次使用_pendingStartParams，最後使用Game.selectedCharacter）
    let currentCharacterId = null;
    if (_membersState && _membersState.has(_uid)) {
      const myMember = _membersState.get(_uid);
      if (myMember && myMember.characterId) {
        currentCharacterId = myMember.characterId;
      }
    }
    if (!currentCharacterId && _pendingStartParams && _pendingStartParams.selectedCharacter && _pendingStartParams.selectedCharacter.id) {
      currentCharacterId = _pendingStartParams.selectedCharacter.id;
    }
    if (!currentCharacterId && typeof Game !== "undefined" && Game.selectedCharacter && Game.selectedCharacter.id) {
      currentCharacterId = Game.selectedCharacter.id;
    }
    if (!currentCharacterId) {
      // 如果沒有選擇角色，使用默認角色（第一位角色：margaret）
      if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS) && CONFIG.CHARACTERS.length > 0) {
        const defaultChar = CONFIG.CHARACTERS.find(c => c && c.id === 'margaret') || CONFIG.CHARACTERS[0];
        if (defaultChar && defaultChar.id) {
          currentCharacterId = defaultChar.id;
        }
      }
    }

    // 檢查是否需要更新選項（避免重複清空導致事件綁定丟失）
    const existingOptions = Array.from(selChar.options).map(opt => opt.value);
    const shouldUpdate = existingOptions.length === 0 || existingOptions.some(id => !unlockedSet.has(id));

    if (shouldUpdate) {
      // 清空現有選項
      selChar.innerHTML = "";

      // 獲取所有角色配置
      const characters = (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS)) ? CONFIG.CHARACTERS : [];

      // 只添加已解鎖的角色
      for (const char of characters) {
        if (!char || !char.id) continue;
        const isUnlocked = (char.unlockCost === undefined || char.unlockCost <= 0) || unlockedSet.has(char.id);
        if (isUnlocked) {
          const opt = document.createElement("option");
          opt.value = char.id;
          opt.textContent = char.name || char.id;
          if (char.id === currentCharacterId) {
            opt.selected = true;
          }
          selChar.appendChild(opt);
        }
      }
    } else {
      // 只更新選中狀態
      if (currentCharacterId) {
        selChar.value = currentCharacterId;
      }
    }

    // 如果當前選擇的角色不在已解鎖列表中，強制選擇默認角色
    if (currentCharacterId && !unlockedSet.has(currentCharacterId)) {
      const defaultOpt = selChar.querySelector('option[value="margaret"]');
      if (defaultOpt) {
        defaultOpt.selected = true;
        currentCharacterId = 'margaret';
      }
    }

    // 檢查準備狀態：如果已準備，禁用角色選擇下拉框
    let isReady = false;
    if (_membersState && _membersState.has(_uid)) {
      const myMember = _membersState.get(_uid);
      if (myMember && myMember.ready === true) {
        isReady = true;
      }
    }
    selChar.disabled = isReady;
  }

  // 成員列表
  const list = _qs("survival-online-members");
  if (list) {
    list.innerHTML = "";
    const raw = Array.from(_membersState.values());
    // ✅ 多開顯示：若同一 uid 有多個 instances，展開為多列（避免「隊員進來蓋掉室長名字」）
    const rows = [];
    for (const m of raw) {
      if (!m || !m.uid) continue;
      const instances = (m.instances && typeof m.instances === "object") ? m.instances : null;
      if (instances) {
        for (const [iid, inst] of Object.entries(instances)) {
          if (!iid) continue;
          rows.push({ member: m, inst: inst || {}, instanceId: iid });
        }
      } else {
        rows.push({ member: m, inst: null, instanceId: null });
      }
    }

    const _isHostRow = (r) => {
      try {
        if (!r || !r.member) return false;
        if (_hostUid && r.member.uid && r.member.uid === _hostUid) {
          // 若有 hostInstanceId，僅該 instance 顯示室長；否則同 uid 都當作室長（向後相容）
          if (r.member.hostInstanceId && r.instanceId) return r.member.hostInstanceId === r.instanceId;
          return true;
        }
        if (r.inst && r.inst.role === "host") return true;
        if (r.member.role === "host") return true;
      } catch (_) { }
      return false;
    };

    const _staleRow = (r) => {
      try {
        // instance 有 lastSeenAt 時，優先用 instance；否則 fallback member
        const inst = r && r.inst ? r.inst : null;
        if (inst && inst.lastSeenAt) return _isMemberStale(inst);
        return _isMemberStale(r ? r.member : null);
      } catch (_) { }
      return false;
    };

    // 排序：室長 instance 置頂，其次依 joinedAt
    rows.sort((a, b) => {
      const ah = _isHostRow(a) ? 0 : 1;
      const bh = _isHostRow(b) ? 0 : 1;
      if (ah !== bh) return ah - bh;
      const aj = _joinedAtMs((a && a.inst) ? a.inst : (a ? a.member : null));
      const bj = _joinedAtMs((b && b.inst) ? b.inst : (b ? b.member : null));
      return aj - bj;
    });

    for (const r of rows) {
      const m = r.member;
      const inst = r.inst;
      const stale = _staleRow(r);
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
      const roleLabel = _isHostRow(r) ? "室長" : "玩家";
      const nm = (inst && typeof inst.name === "string" && inst.name.trim())
        ? inst.name.trim()
        : (m && typeof m.name === "string" && m.name.trim())
          ? m.name.trim()
          : ((m.uid || "").slice(0, 6));
      left.textContent = `${roleLabel}：${nm}${stale ? "（離線）" : ""}`;
      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "8px";
      right.style.opacity = "0.95";
      const status = document.createElement("div");
      // stale 視為未準備（避免卡住室長開始條件）
      const ready = (!stale && ((inst && inst.ready) || (!inst && m.ready)));
      status.textContent = ready ? "已準備" : "未準備";
      status.style.opacity = "0.9";
      right.appendChild(status);

      // 室長操作：踢人（僅對非室長、非自己）
      // 注意：Firestore rules 下只能刪除「整個 member doc」，因此踢人仍以 uid 為單位（多開測試時同 uid 視為同一帳號）
      if (_isHost && m && m.uid && m.uid !== _uid && m.role !== "host" && !_isHostRow(r)) {
        const btnKick = document.createElement("button");
        btnKick.className = "ghost";
        btnKick.textContent = "移出";
        btnKick.style.padding = "4px 10px";
        btnKick.style.fontSize = "12px";
        btnKick.addEventListener("click", async () => {
          const ok = window.confirm(`要把「${nm}」移出隊伍嗎？`);
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
      // ✅ 多開：把 members.instances 展開後做 ready 判定
      const raw = Array.from(_membersState.values());
      const rows = [];
      for (const m of raw) {
        if (!m || !m.uid) continue;
        const instances = (m.instances && typeof m.instances === "object") ? m.instances : null;
        if (instances) {
          for (const [iid, inst] of Object.entries(instances)) {
            rows.push({ member: m, inst: inst || {}, instanceId: iid });
          }
        } else {
          rows.push({ member: m, inst: null, instanceId: null });
        }
      }

      const isHostRow = (r) => {
        if (!r || !r.member) return false;
        if (_hostUid && r.member.uid && r.member.uid === _hostUid) {
          if (r.member.hostInstanceId && r.instanceId) return r.member.hostInstanceId === r.instanceId;
          return true;
        }
        if (r.inst && r.inst.role === "host") return true;
        if (r.member.role === "host") return true;
        return false;
      };
      const isStaleRow = (r) => {
        const inst = r && r.inst ? r.inst : null;
        if (inst && inst.lastSeenAt) return _isMemberStale(inst);
        return _isMemberStale(r ? r.member : null);
      };

      // 規則：
      // - 展開後人數 1~5
      // - 非 host instance 必須 ready 且不 stale；stale 一律視為未準備
      can = rows.length > 0 && rows.length <= MAX_PLAYERS && rows.every((r) => {
        if (!r || !r.member || !r.member.uid) return false;
        if (isHostRow(r)) return true;
        if (isStaleRow(r)) return false;
        return !!(r.inst ? r.inst.ready : r.member.ready);
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

// 根據地圖動態更新難度選項（僅宇宙地圖可選修羅難度）
function _updateDifficultyOptions() {
  const selMap = _qs("survival-online-host-map");
  const selDiff = _qs("survival-online-host-diff");
  if (!selMap || !selDiff) return;

  const mapId = selMap.value;
  const currentDiff = selDiff.value;

  // 清空現有選項
  selDiff.innerHTML = "";

  // 添加簡單和困難（所有地圖都有）
  const easyOpt = document.createElement("option");
  easyOpt.value = "EASY";
  easyOpt.textContent = "簡單";
  selDiff.appendChild(easyOpt);

  const hardOpt = document.createElement("option");
  hardOpt.value = "HARD";
  hardOpt.textContent = "困難";
  selDiff.appendChild(hardOpt);

  // 僅宇宙地圖添加修羅難度
  if (mapId === "desert") {
    const asuraOpt = document.createElement("option");
    asuraOpt.value = "ASURA";
    asuraOpt.textContent = "修羅";
    selDiff.appendChild(asuraOpt);
  }

  // 如果當前選擇的是修羅難度，但地圖不是宇宙，則切換到困難
  if (currentDiff === "ASURA" && mapId !== "desert") {
    selDiff.value = "HARD";
    // 同步更新房間設置
    if (_isHost && _activeRoomId) {
      hostUpdateSettings({ diffId: "HARD" }).catch(() => { });
    }
  } else if (currentDiff && ["EASY", "HARD", "ASURA"].includes(currentDiff)) {
    // 保持當前選擇（如果有效）
    selDiff.value = currentDiff;
  } else {
    // 預設選擇困難
    selDiff.value = "HARD";
  }
}

function _syncHostSelectsFromRoom() {
  const selMap = _qs("survival-online-host-map");
  const selDiff = _qs("survival-online-host-diff");
  if (_roomState) {
    if (selMap && _roomState.mapId) {
      selMap.value = _roomState.mapId;
      // 地圖改變後，更新難度選項
      _updateDifficultyOptions();
    }
    if (selDiff && _roomState.diffId) {
      // 驗證難度是否有效（非宇宙地圖不能選修羅）
      const mapId = selMap ? selMap.value : null;
      if (_roomState.diffId === "ASURA" && mapId !== "desert") {
        // 如果房間設置了修羅但地圖不是宇宙，強制改為困難
        selDiff.value = "HARD";
        if (_isHost && _activeRoomId) {
          hostUpdateSettings({ diffId: "HARD" }).catch(() => { });
        }
      } else {
        selDiff.value = _roomState.diffId;
      }
    }
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
  // 移除 listenSignals（不再需要 WebRTC 信令）
  // ✅ 重要：不要在大廳就連 WebSocket / 啟用 Runtime（避免流量與狀態污染）
  // WebSocket 與 Runtime 會在房間狀態變為 starting → startGame 時建立/啟用
  _syncHostSelectsFromRoom();
  _startMemberHeartbeat();
}

async function enterLobbyAsGuest(roomId) {
  const r = await joinRoom(roomId);
  _activeRoomId = r.roomId;
  _isHost = false;
  _hostUid = r.hostUid;
  console.log(`[SurvivalOnline] enterLobbyAsGuest: 已加入房間，hostUid=${_hostUid}`);
  _setText("survival-online-status", "已加入房間，準備連線…");
  await ensureFirebase();
  listenRoom(_activeRoomId);
  listenMembers(_activeRoomId);
  // 移除 listenSignals（不再需要 WebRTC 信令）
  // ✅ 重要：不要在大廳就連 WebSocket（避免連線抖動誤觸清理/失敗流程）
  // WebSocket 會在房間狀態變為 starting → startGame 時建立
  _startMemberHeartbeat();
}

let _pendingStartParams = null; // { selectedDifficultyId, selectedCharacter, selectedMap }

function openSelectScreen(params) {
  _pendingStartParams = params;
  _hide("difficulty-select-screen");
  _hide("desert-difficulty-select-screen");
  _show("survival-online-select-screen");

  // 載入保存的暱稱
  const nicknameInput = _qs("survival-online-nickname");
  if (nicknameInput) {
    const saved = getPlayerNickname();
    if (saved && !saved.startsWith("玩家-")) {
      nicknameInput.value = saved;
    } else {
      nicknameInput.value = "";
    }
  }
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

// ✅ 離開房間後回到遊戲開始畫面
function closeLobbyToStart() {
  _hide("survival-online-lobby-screen");
  _hide("survival-online-select-screen");
  // 顯示遊戲開始畫面
  try {
    const startScreen = document.getElementById("start-screen");
    if (startScreen) {
      startScreen.classList.remove("hidden");
    }
    // 隱藏其他可能顯示的畫面
    const charSel = document.getElementById("character-select-screen");
    if (charSel) charSel.classList.add("hidden");
    const mapSel = document.getElementById("map-select-screen");
    if (mapSel) mapSel.classList.add("hidden");
  } catch (_) { }
}

function closeLobbyOverlayKeepRoom() {
  // ESC 在大廳：只關閉「大廳介面」回到組隊選擇，不自動離開房間（避免影響後續介面/狀態）
  _hide("survival-online-lobby-screen");
  _show("survival-online-select-screen");
  try {
    if (_activeRoomId) {
      _setText("survival-online-status", "已在隊伍中（介面已關閉）");
    }
  } catch (_) { }
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
  } catch (_) { }

  const useId = params && params.selectedDifficultyId ? params.selectedDifficultyId : (typeof Game !== "undefined" ? (Game.selectedDifficultyId || "EASY") : "EASY");
  try { if (typeof Game !== "undefined") Game.selectedDifficultyId = useId; } catch (_) { }

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
        uid: _getLocalNetUid(), // ✅ 修复：使用 netUid（格式：`${authUid}:${instanceId}`），与服务器端 player.uid 一致
        sessionId: (params && params.sessionId) ? params.sessionId : (_roomState && _roomState.sessionId ? _roomState.sessionId : null)
      } : null,
    });

    // ✅ MMORPG 架構：綁定傷害廣播監聽器
    // ✅ 腫瘤切除：傷害數字改走伺服器 hitEvents（server/game-state.js），不再需要 damage_enemy 監聽器
    // 移除舊的 damage_enemy 監聽器（如果存在）
    setTimeout(() => {
      if (typeof Game !== "undefined" && Game.events && typeof Game.events.off === "function" && Game._damageBroadcastListener) {
        Game.events.off('damage_enemy', Game._damageBroadcastListener);
        Game._damageBroadcastListener = null;
      }
    }, 1000);

    return;
  }
  // 回退（極端情況）
  try { if (typeof Game !== "undefined" && typeof Game.startNewGame === "function") Game.startNewGame(); } catch (_) { }
  try { _show("game-screen"); } catch (_) { }
}

function tryStartSurvivalFromRoom() {
  if (!_roomState || _roomState.status !== "starting") return;
  if (!_pendingStartParams) return;

  // M1：避免 snapshot 多次觸發重複 start
  try {
    const sid = _roomState.sessionId || null;
    if (sid && _startSessionId && sid === _startSessionId) return;
    _startSessionId = sid || _startSessionId || "NO_SESSION";
  } catch (_) { }
  if (_startTimer) return;

  // 套用 host 的 map/diff（室長優先權）
  try {
    if (typeof Game !== "undefined") {
      Game.selectedDifficultyId = _roomState.diffId || Game.selectedDifficultyId;
      const maps = (typeof CONFIG !== "undefined" && Array.isArray(CONFIG.MAPS)) ? CONFIG.MAPS : [];
      const mapCfg = maps.find((m) => m && m.id === _roomState.mapId);
      if (mapCfg) Game.selectedMap = mapCfg;
    }
  } catch (_) { }

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

    const startGame = async () => {
      if (hasStarted) return;
      hasStarted = true;
      
      // ⚠️ 重构：组队模式专用 - 设置状态为 'starting'（单机模式不受影响）
      if (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
        // ⚠️ 重构：取消 _returnToStartFrom 的延迟清理，防止覆盖新游戏状态
        if (Game._returnToStartFromCleanupTimer) {
          clearTimeout(Game._returnToStartFromCleanupTimer);
          Game._returnToStartFromCleanupTimer = null;
          console.log('[SurvivalOnline] startGame: 组队模式，取消延迟清理定时器');
        }
        // ✅ 已移除状态机（采用页面刷新方案，不再需要）
      }
    if (countdownInterval) clearInterval(countdownInterval);
    if (_startTimer) {
      clearTimeout(_startTimer);
      _startTimer = null;
    }
    if (overlayEl) overlayEl.classList.add("hidden");

    // 獲取當前選擇的角色（優先使用下拉框選擇，其次使用_pendingStartParams，最後使用Game.selectedCharacter）
    let selectedCharacter = null;
    const selChar = _qs("survival-online-character-select");
    if (selChar && selChar.value) {
      const selectedCharId = selChar.value;
      if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS)) {
        selectedCharacter = CONFIG.CHARACTERS.find(c => c && c.id === selectedCharId);
      }
    }
    if (!selectedCharacter && _pendingStartParams && _pendingStartParams.selectedCharacter) {
      selectedCharacter = _pendingStartParams.selectedCharacter;
    }
    if (!selectedCharacter && typeof Game !== "undefined" && Game.selectedCharacter) {
      selectedCharacter = Game.selectedCharacter;
    }

    // 室長更新房間狀態為 playing（遊戲開始）
    if (_isHost && _activeRoomId) {
      updateDoc(roomDocRef(_activeRoomId), {
        status: "playing",
        updatedAt: serverTimestamp()
      }).catch((e) => {
        console.warn("[SurvivalOnline] 更新房間狀態為 playing 失敗:", e);
      });
      // 更新本地狀態
      if (_roomState) {
        _roomState.status = "playing";
      }
    }

    // ✅ 啟動線硬保證：進入 survival 之前，必須 WS OPEN + JOINED
    if (!_ws || _ws.readyState !== WebSocket.OPEN || !_wsJoinedAck) {
      console.log(`[SurvivalOnline] startGame: WebSocket 未連接/未 joined，嘗試連接...`);
      try {
        await connectWebSocket();
        const ok = await _waitForWsJoined(3500);
        if (!ok) {
          _setText("survival-online-status", "連線建立但未加入房間（joined 超時）");
          return;
        }
      } catch (e) {
        console.error(`[SurvivalOnline] startGame: WebSocket 連接失敗:`, e);
        _setText("survival-online-status", "WebSocket 連線失敗，無法開始");
        return;
      }
    }

    // ✅ 清理邏輯：重新開始遊戲前，確保清理上一局的狀態
    try {
      // ⚠️ 修复：完全清理上一局的所有状态，确保新游戏是全新状态
      if (typeof Game !== "undefined") {
        // ⚠️ 修复：先标记新游戏已开始，防止服务器残留的 state.isGameOver = true 立即触发游戏结束
        Game._newGameStarted = true; // 标记新游戏已开始
        // ⚠️ 修复：保持 _gameOverEventSent = true，直到服务器确认 isGameOver = false
        // 这样可以防止服务器残留的 state.isGameOver = true 立即触发游戏结束
        // _gameOverEventSent 会在服务器确认 isGameOver = false 后重置（在 handleServerGameState 中）
        // 如果 _gameOverEventSent 不是 true，设置为 true（防止服务器残留状态触发游戏结束）
        if (!Game._gameOverEventSent) {
          Game._gameOverEventSent = true;
        }
        Game._victoryEventSent = false;
        Game.isGameOver = false;
        Game.isPaused = false; // 确保游戏可以开始
        
        // ⚠️ 修复：确保玩家状态被完全清理（如果还有残留）
        if (Game.player) {
          try {
            // 清理玩家武器
            if (Game.player.weapons && Array.isArray(Game.player.weapons)) {
              for (const weapon of Game.player.weapons) {
                if (weapon && typeof weapon.destroy === 'function') {
                  try { weapon.destroy(); } catch (_) { }
                }
              }
              Game.player.weapons = [];
            }
          } catch (_) { }
        }
      }
      
      // ⚠️ 修复：清理遠程玩家（避免上一局的殘留）
      if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.clear === "function") {
        RemotePlayerManager.clear();
      }
      // 清理 Game.remotePlayers
      if (typeof Game !== "undefined" && Array.isArray(Game.remotePlayers)) {
        Game.remotePlayers.length = 0;
      }
      
      // ⚠️ 修复：清理地图特定的元素，确保切换地图时不会残留
      // 这些元素是地图特定的，新游戏开始时必须清理，让新地图重新生成
      if (typeof Game !== "undefined") {
        // 清理障碍物和装饰（地图特定）
        if (Array.isArray(Game.obstacles)) {
          Game.obstacles = [];
        }
        if (Array.isArray(Game.decorations)) {
          Game.decorations = [];
        }
        // 重置生成标记，让新地图可以重新生成
        Game._obstaclesAndDecorationsSpawned = false;
        
        // 清理车辆（路口地图特定）
        if (Array.isArray(Game.projectiles)) {
          for (let i = Game.projectiles.length - 1; i >= 0; i--) {
            const proj = Game.projectiles[i];
            if (proj && (proj.weaponType === 'INTERSECTION_CAR' || (proj.constructor && proj.constructor.name === 'CarHazard'))) {
              try {
                if (typeof proj.destroy === 'function') {
                  proj.destroy();
                }
              } catch (_) { }
              Game.projectiles.splice(i, 1);
            }
          }
        }
      }
      
      // ⚠️ 修复：停止所有音效，确保新游戏开始时没有残留音效
      try {
        if (typeof AudioManager !== 'undefined') {
          if (AudioManager.stopAllMusic) AudioManager.stopAllMusic();
          if (AudioManager.stopAllSounds) AudioManager.stopAllSounds();
        }
      } catch (_) { }
    } catch (e) {
      console.warn('[SurvivalOnline] startGame: 清理上一局状态失败:', e);
    }

    // 確保 Runtime 啟用（遊戲開始時啟用狀態同步）
    if (typeof Runtime !== "undefined" && typeof Runtime.setEnabled === "function") {
      Runtime.setEnabled(true);
    }

    // ✅ 新一局：通知伺服器重置本場狀態（避免上一局殘留造成開場怪血量異常）
    // ⚠️ 修復：等待 Game.player 創建完成後再發送 new-session
    // 因為 startSurvivalNow 會調用 GameModeManager.start，而 Game.init 是在 GameModeManager.start 之後才執行
    // 使用輪詢機制等待 Game.player 創建完成，最多等待 3 秒
    // ⚠️ 修复：标记 new-session 已发送，用于 spawnObstacles 和 spawnDecorations 检查
    // ✅ 已移除 _newSessionSent 相关逻辑（采用页面刷新方案，不再需要）
    
    const sendNewSession = () => {
      try {
        const sid = sessionId || null;
        if (!sid) return;
        
        // ✅ 已移除清理逻辑（采用页面刷新方案，不再需要清理）
        
        // 計算本地玩家的 maxHealth（包含角色屬性和天賦效果）
        let playerMaxHealth = 200; // 默認值
        if (typeof Game !== "undefined" && Game.player) {
          // 在 Game.init 中已經計算了角色的 maxHealth 和天賦效果
          playerMaxHealth = Game.player.maxHealth || 200;
          console.log(`[SurvivalOnline] 發送 new-session: maxHealth=${playerMaxHealth}, baseMaxHealth=${Game.player.baseMaxHealth || 'N/A'}`);
        } else {
          console.warn(`[SurvivalOnline] Game.player 不存在，使用默認 maxHealth=200`);
        }
        
        if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === "function") {
          window.SurvivalOnlineRuntime.sendToNet({ 
            type: "new-session", 
            sessionId: sid,
            maxHealth: playerMaxHealth // ✅ 發送計算好的 maxHealth
          });
        } else {
          // fallback
          try { _sendViaWebSocket({ type: "new-session", sessionId: sid, maxHealth: playerMaxHealth }); } catch (_) { }
        }
        
        // ✅ 记录 sessionId（用于防串房等基本功能）
        if (typeof Game !== "undefined" && Game.multiplayer) {
          Game.multiplayer.sessionId = sid;
        }
      } catch (e) {
        console.error(`[SurvivalOnline] 發送 new-session 失敗:`, e);
      }
    };
    
    // ⚠️ 修復：使用輪詢機制等待 Game.player 創建完成
    // 最多等待 3 秒，每 100ms 檢查一次
    let waitCount = 0;
    const maxWaitCount = 30; // 3 秒 = 30 * 100ms
    const waitForPlayer = () => {
      if (typeof Game !== "undefined" && Game.player) {
        // Game.player 已創建，發送 new-session
        sendNewSession();
      } else if (waitCount < maxWaitCount) {
        // 繼續等待
        waitCount++;
        setTimeout(waitForPlayer, 100);
      } else {
        // 超時，使用默認值發送
        console.warn(`[SurvivalOnline] 等待 Game.player 創建超時，使用默認 maxHealth=200`);
        sendNewSession();
      }
    };
    
    // 開始等待（先延遲 200ms，給 GameModeManager.start 一些時間）
    setTimeout(waitForPlayer, 200);

    // 確保角色不為 null（如果為 null，使用默認角色）
    if (!selectedCharacter) {
      if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS) && CONFIG.CHARACTERS.length > 0) {
        selectedCharacter = CONFIG.CHARACTERS.find(c => c && c.id === 'margaret') || CONFIG.CHARACTERS[0];
      }
    }

    // 更新 Game.selectedCharacter 確保一致性
    if (selectedCharacter && typeof Game !== "undefined") {
      Game.selectedCharacter = selectedCharacter;
    }

    // ⚠️ 100%重构：在调用 startSurvivalNow 之前，确保 sessionId 已经设置到 Game.multiplayer
    // 这样在 handleServerGameState 中，sessionId 就已经存在了
    if (typeof Game !== "undefined" && Game.multiplayer && sessionId) {
      Game.multiplayer.sessionId = sessionId;
      console.log(`[SurvivalOnline] startGame: 设置 sessionId=${sessionId} 到 Game.multiplayer`);
    }

    startSurvivalNow({
      selectedDifficultyId: _roomState.diffId || _pendingStartParams.selectedDifficultyId,
      selectedCharacter: selectedCharacter,
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
  const selChar = _qs("survival-online-character-select");

  // 角色選擇變更事件：更新到Firestore並更新_pendingStartParams
  if (selChar) {
    selChar.addEventListener("change", async () => {
      if (!_activeRoomId || !_uid) return;
      const selectedCharId = selChar.value;
      if (!selectedCharId) return;

      // 獲取角色配置
      let selectedCharacter = null;
      if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS)) {
        selectedCharacter = CONFIG.CHARACTERS.find(c => c && c.id === selectedCharId);
      }

      // 更新到Firestore
      try {
        await ensureAuth();
        await updateDoc(memberDocRef(_activeRoomId, _uid), {
          characterId: selectedCharId,
          lastSeenAt: serverTimestamp()
        });
      } catch (e) {
        console.warn("[SurvivalOnline] 更新角色失敗:", e);
      }

      // 更新_pendingStartParams和Game.selectedCharacter
      if (selectedCharacter) {
        if (!_pendingStartParams) _pendingStartParams = {};
        _pendingStartParams.selectedCharacter = selectedCharacter;
        if (typeof Game !== "undefined") {
          Game.selectedCharacter = selectedCharacter;
        }
      }
    });
  }

  // ✅ 暱稱輸入框：限制為5個字符（中文字、英文字、數字），防止空白鍵、符號等
  const nicknameInput = _qs("survival-online-nickname");
  if (nicknameInput) {
    // 阻止所有鍵盤事件傳播到遊戲主體
    nicknameInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
    }, true);
    nicknameInput.addEventListener("keyup", (e) => {
      e.stopPropagation();
    }, true);

    // ✅ 輸入驗證：只允許中文字、英文字、數字，不允許空白鍵、符號等
    nicknameInput.addEventListener("input", (e) => {
      const value = e.target.value;
      // 只保留中文字、英文字、數字
      const validPattern = /[\u4e00-\u9fffa-zA-Z0-9]/g;
      const validChars = value.match(validPattern) || [];
      const newValue = validChars.slice(0, 5).join(""); // 限制為5個字符
      if (newValue !== value) {
        e.target.value = newValue;
      }
    });

    // ✅ 阻止空白鍵和符號輸入
    nicknameInput.addEventListener("keydown", (e) => {
      // 允許的鍵：中文字（通過輸入事件處理）、英文字、數字、退格、刪除、方向鍵等
      const allowedKeys = [
        "Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
        "Home", "End", "Tab"
      ];
      const key = e.key;
      const code = e.code;

      // 如果是空白鍵或符號，阻止輸入
      if (key === " " || key === "Space" || code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 如果是符號（非中文字、非英文字、非數字），阻止輸入
      if (!/[\u4e00-\u9fffa-zA-Z0-9]/.test(key) && !allowedKeys.includes(key) && key.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    });

    // 載入時載入上次保存的暱稱
    try {
      const saved = localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
      if (saved) {
        const sanitized = sanitizePlayerName(saved);
        if (sanitized) {
          nicknameInput.value = sanitized;
        }
      }
    } catch (_) { }
  }

  // 同樣處理房間碼輸入框
  if (inpCode) {
    inpCode.addEventListener("keydown", (e) => {
      e.stopPropagation();
    }, true);
    inpCode.addEventListener("keyup", (e) => {
      e.stopPropagation();
    }, true);
    inpCode.addEventListener("keydown", (e) => {
      if (e.key === " " || e.code === "Space" || e.keyCode === 32) {
        e.stopPropagation();
      }
    });
  }

  if (btnBack) btnBack.addEventListener("click", () => {
    closeSelectScreenBackToDifficulty();
  });
  if (btnSolo) btnSolo.addEventListener("click", () => {
    // 單人：確保離開任何房間/連線
    leaveRoom().catch(() => { });
    startSurvivalNow(_pendingStartParams || {});
  });
  if (btnOnline) btnOnline.addEventListener("click", () => {
    openLobbyScreen();
  });

  if (btnCreate) btnCreate.addEventListener("click", async () => {
    try {
      // 保存暱稱
      const nicknameInput = _qs("survival-online-nickname");
      if (nicknameInput && nicknameInput.value.trim()) {
        const nickname = nicknameInput.value.trim();
        if (sanitizePlayerName(nickname)) {
          savePlayerNickname(nickname);
        }
      }

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
      try { console.warn("[SurvivalOnline] create room failed:", e); } catch (_) { }
    }
  });
  if (btnJoin) btnJoin.addEventListener("click", async () => {
    const code = (inpCode && inpCode.value ? inpCode.value.trim().toUpperCase() : "");
    if (!code) {
      _setText("survival-online-status", "請輸入房間碼");
      return;
    }
    try {
      // 保存暱稱
      const nicknameInput = _qs("survival-online-nickname");
      if (nicknameInput && nicknameInput.value.trim()) {
        const nickname = nicknameInput.value.trim();
        if (sanitizePlayerName(nickname)) {
          savePlayerNickname(nickname);
        }
      }

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
      try { console.warn("[SurvivalOnline] join room failed:", e); } catch (_) { }
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
      } catch (_) { }
    }
  });

  let _ready = false;
  if (btnReady) btnReady.addEventListener("click", async () => {
    if (!_activeRoomId) return;
    _ready = !_ready;
    try {
      await setReady(_ready);
      btnReady.textContent = _ready ? "取消準備" : "準備";
      // 更新角色選擇下拉框的禁用狀態
      const selChar = _qs("survival-online-character-select");
      if (selChar) {
        selChar.disabled = _ready;
      }
    } catch (_) { }
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
    await leaveRoom().catch(() => { });
    closeLobbyToStart(); // ✅ 離開房間後回到遊戲開始畫面
    _setText("survival-online-status", "已離開房間");
    updateLobbyUI();
  });

  if (btnDisband) btnDisband.addEventListener("click", async () => {
    if (!_isHost || !_activeRoomId) return;
    // 低風險確認（避免誤觸）
    const ok = window.confirm("要解散隊伍嗎？所有隊員都會被退出。");
    if (!ok) return;
    await hostDisbandTeam().catch(() => { });
  });

  if (btnReconnect) btnReconnect.addEventListener("click", async () => {
    await reconnectClient().catch(() => { });
  });

  if (btnCleanup) btnCleanup.addEventListener("click", async () => {
    await hostCleanupStale().catch(() => { });
  });

  if (selMap) selMap.addEventListener("change", async () => {
    if (!_isHost) return;
    const mapId = selMap.value;
    // 地圖改變時，更新難度選項
    _updateDifficultyOptions();
    try { await hostUpdateSettings({ mapId }); } catch (_) { }
  });
  if (selDiff) selDiff.addEventListener("change", async () => {
    if (!_isHost) return;
    const diffId = selDiff.value;
    try { await hostUpdateSettings({ diffId }); } catch (_) { }
  });

  // 初始化難度選項（根據當前地圖）
  _updateDifficultyOptions();

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

// 獲取成員狀態（用於HUD顯示）
function getMembersState() {
  if (!_membersState) return [];
  return Array.from(_membersState.values()).map(m => ({
    uid: m.uid,
    name: m.name || (m.uid ? m.uid.slice(0, 6) : '未知'),
    role: m.role || 'guest',
    ready: m.ready || false
  }));
}

// ✅ 多人元素：提供「遊戲內 HUD」用的玩家狀態（來自權威 game-state）
let _lastHudPlayers = [];
function _setHudPlayersFromServer(players) {
  try {
    if (!Array.isArray(players)) return;
    const byUid = new Map();
    for (const p of players) {
      if (!p || !p.uid) continue;
      byUid.set(p.uid, {
        uid: p.uid,
        nickname: (typeof p.nickname === 'string') ? p.nickname : null,
        characterId: (typeof p.characterId === 'string') ? p.characterId : null,
        health: (typeof p.health === 'number') ? p.health : 0,
        maxHealth: (typeof p.maxHealth === 'number') ? p.maxHealth : 0,
        isDead: (typeof p.isDead === 'boolean') ? p.isDead : false
      });
    }
    // 依 members 順序輸出（體感更穩定）
    const out = [];
    if (_membersState) {
      for (const m of _membersState.values()) {
        const uid = m && m.uid;
        const st = uid ? byUid.get(uid) : null;
        if (st) out.push(st);
      }
    }
    // 若 members 還沒到，退回 server 的原順序
    if (!out.length) _lastHudPlayers = Array.from(byUid.values());
    else _lastHudPlayers = out;
  } catch (_) { }
}

function getHudPlayers() {
  // ✅ 單機元素：如果HUD只顯示一個玩家，應該只顯示本地玩家的血條/經驗條/能量條
  // 用戶要求：HUD應該只顯示本地玩家狀態（單機元素），而不是所有玩家的狀態
  // 如果未來需要顯示多個玩家，可以改回返回所有玩家
  try {
    const me = _getLocalNetUid ? _getLocalNetUid() : _uid;
    if (typeof Game !== 'undefined' && Game.player && me) {
      // 只返回本地玩家
      return [{
        uid: me,
        nickname: getPlayerNickname(),
        characterId: (Game.selectedCharacter && Game.selectedCharacter.id) ? Game.selectedCharacter.id : null,
        health: Game.player.health || 0,
        maxHealth: Game.player.maxHealth || 0,
        energy: Game.player.energy || 0,
        maxEnergy: Game.player.maxEnergy || 0,
        isDead: (typeof Game.player._isDead === 'boolean') ? Game.player._isDead : false
      }];
    }
  } catch (_) { }
  // 後備：如果無法獲取本地玩家，返回空數組
  return [];
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
  } catch (_) { }
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
          try { e.stopImmediatePropagation(); } catch (_) { }
          try { e.stopPropagation(); } catch (_) { }
        }
      } catch (_) { }
    },
    true // capture
  );
} catch (_) { }

// 更新房間狀態為 closed（供 game.js 調用）
// ✅ 更新房間狀態為 lobby（正常結束遊戲時回到大廳）
async function updateRoomStatusToLobby() {
  if (!_isHost || !_activeRoomId) return;
  try {
    await ensureAuth();
    await updateDoc(roomDocRef(_activeRoomId), {
      status: "lobby",
      updatedAt: serverTimestamp()
    });
    if (_roomState) {
      _roomState.status = "lobby";
    }
  } catch (e) {
    console.warn("[SurvivalOnline] 更新房間狀態為 lobby 失敗:", e);
  }
}

async function updateRoomStatusToClosed() {
  try {
    if (!_isHost || !_activeRoomId) return;
    await updateDoc(roomDocRef(_activeRoomId), {
      status: "closed",
      updatedAt: serverTimestamp()
    });
    // 更新本地狀態
    if (_roomState) {
      _roomState.status = "closed";
    }
  } catch (e) {
    console.warn("[SurvivalOnline] 更新房間狀態為 closed 失敗:", e);
  }
}

// 將 API 暴露到 window，供非 module 的 main.js / game.js 呼叫
window.SurvivalOnlineUI = {
  startFlowFromMain,
  leaveRoom,
  getRuntime,
  handleEscape,
  updateRoomStatusToClosed,
  updateRoomStatusToLobby,
  openLobbyScreen,
};

// 提供給 game.js 的 runtime bridge（避免 game.js import）
window.SurvivalOnlineRuntime = {
  Runtime: Runtime,
  RemotePlayerManager: RemotePlayerManager,
  updateRemotePlayers: Runtime.updateRemotePlayers, // 直接暴露 updateRemotePlayers
  // ✅ 關鍵：許多檔案（game.js/player.js/chest.js...）使用 window.SurvivalOnlineRuntime.sendToNet
  // 但 sendToNet 實際在 Runtime 內；若不在這裡暴露，攻擊/大招/復活等封包會「完全送不出去」
  // 導致 BootLine 永遠 pr=0（看不到任何攻擊）。
  sendToNet: Runtime.sendToNet,
  broadcastEvent: Runtime.broadcastEvent,
  getMembersState: getMembersState,
  getHudPlayers: getHudPlayers,
  getPlayerNickname: getPlayerNickname,
  sanitizePlayerName: sanitizePlayerName,
  savePlayerNickname: savePlayerNickname
};

// ✅ 清理邏輯：頁面關閉/刷新/F5：盡力離開房間並清理所有資源（不保證完成，仍以心跳/超時判定為主）
try {
  window.addEventListener("beforeunload", () => {
    try {
      // 清理遠程玩家
      if (typeof RemotePlayerManager !== "undefined" && RemotePlayerManager.clear) {
        RemotePlayerManager.clear();
      }
      // 清理 Game.remotePlayers
      if (typeof Game !== "undefined" && Array.isArray(Game.remotePlayers)) {
        Game.remotePlayers.length = 0;
      }
      // 關閉 WebSocket
      if (_ws) {
        try {
          _ws.onmessage = null;
          _ws.onopen = null;
          _ws.onclose = null;
          _ws.onerror = null;
          _ws.close();
        } catch (_) { }
        _ws = null;
      }
      // 停止所有計時器
      try { if (_memberHeartbeatTimer) clearInterval(_memberHeartbeatTimer); } catch (_) { }
      try { if (_startTimer) clearTimeout(_startTimer); } catch (_) { }
      try { if (_reconnectTimer) clearTimeout(_reconnectTimer); } catch (_) { }
      try { if (_autoCleanupTimer) clearInterval(_autoCleanupTimer); } catch (_) { }
      // 離開房間
      if (window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.leaveRoom === "function") {
        window.SurvivalOnlineUI.leaveRoom().catch(() => { });
      }
    } catch (_) { }
  });

  // ✅ 清理邏輯：頁面可見性變化時也清理（切換標籤頁等）
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // 頁面隱藏時不清理，只在完全關閉時清理
    }
  });
} catch (_) { }



// ❌ 舊代碼已註解：此處為重複代碼，實際使用的函數在 3384 行 (handleServerGameState) 和 3500 行 (updateEnemiesFromServer)
// function handleServerGameState(state, timestamp) {
// if (!state || !state.enemies) return;
//
// // 1. 同步敌人
// syncEnemies(state.enemies);
//
// // 2. 同步游戏时间/波次（可选，避免频繁跳变）
// if (state.wave && typeof WaveSystem !== 'undefined') {
//   if (WaveSystem.currentWave !== state.wave) {
//     console.log(`[SurvivalOnline] 同步波次: ${WaveSystem.currentWave} -> ${state.wave}`);
//     WaveSystem.currentWave = state.wave;
//     // 更新UI
//     if (typeof UI !== 'undefined' && UI.updateWaveInfo) {
//       UI.updateWaveInfo(WaveSystem.currentWave);
//     }
//   }
// }
// }
//
// // 同步敵人列表（核心邏輯）
// function syncEnemies(serverEnemies) {
//   if (typeof Game === 'undefined') return;
//   if (!Game.enemies) Game.enemies = [];
//
//   const serverIds = new Set();
//
//   // A. 更新或創建敵人
//   serverEnemies.forEach(sEnemy => {
//     serverIds.add(sEnemy.id);
//
//     // 查找本地是否存在
//     const localEnemy = Game.enemies.find(e => e.id === sEnemy.id);
//
//     if (localEnemy) {
//       // --- 存在：更新狀態 (插值平滑) ---
//       // 位置平滑插值 (Lerp)
//       const t = 0.3; // 插值係數
//       localEnemy.x = localEnemy.x + (sEnemy.x - localEnemy.x) * t;
//       localEnemy.y = localEnemy.y + (sEnemy.y - localEnemy.y) * t;
//
//       // 直接同步血量（避免血條跳動，可做緩動但直接同步最準）
//       // 注意：如果本地預測了傷害，這裡會被服務器覆蓋，這是正確的（最終一致性）
//       localEnemy.health = sEnemy.health;
//       localEnemy.maxHealth = sEnemy.maxHealth;
//
//       // 同步死亡狀態
//       if (sEnemy.isDead && !localEnemy.isDead) {
//         localEnemy.health = 0;
//         localEnemy.isDead = true;
//         // 觸發死亡邏輯? or let server handle removal
//         // 服務器過一會兒會移除該敵人，這時本地也會移除
//       }
//
//     } else {
//       // --- 不存在：創建新敵人 ---
//       // 確保 Enemy 類可用
//       if (typeof Enemy !== 'undefined') {
//         // 創建實例 (位置 x,y, 類型 type)
//         // 注意：Enemy 構造函數通常會生成隨機 ID，我們必須覆蓋它
//         const newEnemy = new Enemy(sEnemy.x, sEnemy.y, sEnemy.type);
//
//         // 🚨 關鍵：覆蓋 ID 為服務器 ID 🚨
//         newEnemy.id = sEnemy.id;
//
//         // 同步屬性
//         newEnemy.health = sEnemy.health;
//         newEnemy.maxHealth = sEnemy.maxHealth;
//         newEnemy.speed = sEnemy.speed;
//
//         // 加入遊戲循環
//         Game.enemies.push(newEnemy);
//         console.log(`[SurvivalOnline] 同步創建敵人: ${sEnemy.type} (ID: ${sEnemy.id})`);
//       }
//     }
//   });
//
//   // B. 移除本地多餘敵人（服務器已刪除，本地也該刪除）
//   for (let i = Game.enemies.length - 1; i >= 0; i--) {
//     const localEnemy = Game.enemies[i];
//     // 如果本地敵人ID不在服務器列表中，且不是死亡動畫中（可選保留屍體），則移除
//     // 簡單起見：嚴格同步，不在服務器列表就移除
//     if (!serverIds.has(localEnemy.id)) {
//       // console.log(`[SurvivalOnline] 同步移除敵人: ${localEnemy.id}`);
//       Game.enemies.splice(i, 1);
//     }
//   }
// }

