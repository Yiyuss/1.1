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
const WEBSOCKET_SERVER_URL = "wss://ws.yiyuss-ws.com:8080";

const MAX_PLAYERS = 5;
const ROOM_TTL_MS = 1000 * 60 * 60; // 1小時（僅用於前端清理提示；真正清理由規則/人為）
const MEMBER_HEARTBEAT_MS = 15000; // 15s：更新 lastSeenAt（避免關頁/斷線殘留）
const MEMBER_STALE_MS = 45000; // 45s：超過視為離線/殘留
const START_COUNTDOWN_MS = 3000; // M1：開始倒數（收到 starting 後倒數）

// 玩家名稱驗證和處理
const PLAYER_NAME_MAX_LENGTH = 5; // 最大長度：5個字符（中文字、英文字、數字）
const PLAYER_NAME_MIN_LENGTH = 1; // 最小長度
const PLAYER_NAME_STORAGE_KEY = "survival_player_nickname"; // localStorage 鍵名

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

// 自動重連機制
let _reconnectAttempts = 0;
let _reconnectTimer = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000; // 3 秒

// M4：室長端遠程玩家管理（完整的 Player 對象，支援武器和戰鬥）
const RemotePlayerManager = (() => {
  const remotePlayers = new Map(); // uid -> Player

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
                if (char.dodgeChanceBonusPct) existingPlayer._characterBaseDodgeBonusPct = char.dodgeChanceBonusPct;
                if (char.critChanceBonusPct) existingPlayer._characterBaseCritBonusPct = char.critChanceBonusPct;
                if (char.canUseUltimate === false) existingPlayer.canUseUltimate = false;
                existingPlayer.spriteImageKey = char.spriteImageKey || 'player';

                // 重新應用天賦效果
                if (talentLevels && typeof talentLevels === "object") {
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
        // 創建完整的 Player 對象
        if (typeof Player !== "undefined") {
          const player = new Player(startX || 0, startY || 0);
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
              if (char.dodgeChanceBonusPct) player._characterBaseDodgeBonusPct = char.dodgeChanceBonusPct;
              if (char.critChanceBonusPct) player._characterBaseCritBonusPct = char.critChanceBonusPct;
              if (char.canUseUltimate === false) player.canUseUltimate = false;
              player.spriteImageKey = char.spriteImageKey || 'player';
              player.health = player.maxHealth;

              // 應用天賦效果（使用該玩家自己的天賦等級，而不是本地天賦數據）
              try {
                if (talentLevels && typeof talentLevels === "object") {
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

        // ✅ 標準連線遊戲：使用速度外推預測位置（在收到新狀態之前）
        if (player._isRemotePlayer && player._velocityX !== undefined && player._velocityY !== undefined) {
          const now = Date.now();
          const timeSinceLastState = Math.max(0, now - (player._lastStateTime || now));
          // 只在短時間內使用速度外推（避免長時間預測導致錯誤）
          if (timeSinceLastState < 100 && (Math.abs(player._velocityX) > 0.1 || Math.abs(player._velocityY) > 0.1)) {
            const extrapolationFactor = Math.min(1.0, timeSinceLastState / 50); // 最多外推50ms
            const deltaSeconds = deltaTime / 1000;
            player.x += player._velocityX * deltaSeconds * extrapolationFactor;
            player.y += player._velocityY * deltaSeconds * extrapolationFactor;
          }
        }

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

  function setEnabled(v) {
    const wasEnabled = enabled;
    enabled = !!v;
    console.log(`[SurvivalOnline] Runtime.setEnabled(${v}), wasEnabled=${wasEnabled}, nowEnabled=${enabled}, isHost=${_isHost}`);
    if (!enabled) {
      remotePlayers.clear();
      console.log(`[SurvivalOnline] Runtime.setEnabled: 已清除遠程玩家列表`);
    }
  }

  function onStateMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.t !== "state") return;
    if (!enabled) {
      console.warn("[SurvivalOnline] onStateMessage: Runtime未啟用，忽略狀態消息");
      return;
    }
    const now = Date.now();
    const players = payload.players || {};

    console.log(`[SurvivalOnline] onStateMessage: 收到狀態消息，玩家數量=${Object.keys(players).length}, enabled=${enabled}, isHost=${_isHost}`);

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

      console.log(`[SurvivalOnline] onStateMessage: 處理玩家 ${uid}, 位置=(${p.x}, ${p.y}), characterId=${characterId}, name=${playerName}`);

      // 創建或更新遠程玩家對象
      try {
        if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.getOrCreate === "function") {
          const remotePlayer = RemotePlayerManager.getOrCreate(uid, p.x, p.y, characterId, talentLevels);
          if (remotePlayer) {
            console.log(`[SurvivalOnline] onStateMessage: 成功創建/更新遠程玩家 ${uid}`);
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
            if (typeof p.expToNext === "number") remotePlayer.experienceToNextLevel = p.expToNext;
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

            // ✅ MMORPG 架構：同步玩家受傷紅閃效果（確保所有玩家都能看到其他玩家受傷的視覺效果）
            if (typeof p.hitFlashTime === "number" && p.hitFlashTime > 0) {
              remotePlayer.hitFlashTime = p.hitFlashTime;
              // 觸發簡單圖片閃：在遠程玩家 GIF 上套用紅色光暈與透明度
              try {
                if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.flash === 'function') {
                  const remotePlayerId = `remote-player-${uid}`;
                  window.GifOverlay.flash(remotePlayerId, { color: '#ff0000', durationMs: remotePlayer.hitFlashDuration || 150, opacity: 0.8 });
                }
              } catch (_) { }
            }

            // ✅ MMORPG 架構：同步共享的金幣和經驗值到本地玩家
            // 金幣和經驗是共享的，所以當其他玩家獲得金幣/經驗時，本地玩家也應該同步
            if (typeof p.coins === "number" && typeof Game !== "undefined") {
              // 使用其他玩家的金幣數量（因為金幣是共享的）
              Game.coins = Math.max(0, Math.floor(p.coins));
              // 更新金幣顯示
              if (typeof UI !== "undefined" && UI.updateCoinsDisplay) {
                UI.updateCoinsDisplay(Game.coins);
              }
            }
            // 經驗值也是共享的，同步到本地玩家
            if (typeof Game !== "undefined" && Game.player && typeof p.exp === "number") {
              Game.player.experience = p.exp;
              if (typeof p.expToNext === "number") {
                Game.player.experienceToNextLevel = p.expToNext;
              }
              if (typeof p.level === "number") {
                Game.player.level = p.level;
              }
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
          if (typeof Game !== "undefined" && typeof Enemy !== "undefined" && eventData.type && eventData.x !== undefined && eventData.y !== undefined) {
            // 檢查是否已存在相同ID的敵人（避免重複生成）
            const enemyId = eventData.id || `enemy_${Date.now()}_${Math.random()}`;
            const existingEnemy = Game.enemies.find(e => e.id === enemyId);
            if (!existingEnemy) {
              const enemy = new Enemy(eventData.x, eventData.y, eventData.type);
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
          if (typeof Game !== "undefined" && typeof Enemy !== "undefined" && eventData.type && eventData.x !== undefined && eventData.y !== undefined) {
            const boss = new Enemy(eventData.x, eventData.y, eventData.type);
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
          if (typeof Game !== "undefined" && typeof ExperienceOrb !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            const value = (typeof eventData.value === "number") ? eventData.value : (typeof CONFIG !== "undefined" && CONFIG.EXPERIENCE && CONFIG.EXPERIENCE.VALUE) ? CONFIG.EXPERIENCE.VALUE : 10;
            const orb = new ExperienceOrb(eventData.x, eventData.y, value);
            Game.experienceOrbs.push(orb);
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 隊員生成經驗球失敗:", e);
        }
      } else if (eventType === "chest_spawn") {
        // ✅ MMORPG 架構：所有玩家都能生成寶箱，不依賴室長端
        try {
          if (typeof Game !== "undefined" && typeof Chest !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            const chest = new Chest(eventData.x, eventData.y);
            Game.chests.push(chest);
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 生成寶箱失敗:", e);
        }
      } else if (eventType === "chest_collected") {
        // ✅ MMORPG 架構：所有玩家都能處理寶箱被撿取事件，移除寶箱
        try {
          if (typeof Game !== "undefined" && Array.isArray(Game.chests) && eventData.x !== undefined && eventData.y !== undefined) {
            // 找到最接近的寶箱並移除（容差：50像素）
            const tolerance = 50;
            for (let i = Game.chests.length - 1; i >= 0; i--) {
              const chest = Game.chests[i];
              if (chest && !chest.markedForDeletion) {
                const dist = Math.sqrt(Math.pow(chest.x - eventData.x, 2) + Math.pow(chest.y - eventData.y, 2));
                if (dist <= tolerance) {
                  chest.destroy();
                  Game.chests.splice(i, 1);
                  break;
                }
              }
            }
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
        // ✅ MMORPG 架構：所有玩家都能看到屏幕效果（閃光和震動）
        try {
          if (typeof Game !== "undefined" && eventData.type) {
            // 處理屏幕閃光
            if (eventData.screenFlash && typeof eventData.screenFlash === 'object') {
              if (!Game.screenFlash) {
                Game.screenFlash = { active: false, intensity: 0, duration: 0 };
              }
              Game.screenFlash.active = eventData.screenFlash.active || false;
              Game.screenFlash.intensity = eventData.screenFlash.intensity || 0.3;
              Game.screenFlash.duration = eventData.screenFlash.duration || 150;
            }

            // 處理鏡頭震動
            if (eventData.cameraShake && typeof eventData.cameraShake === 'object') {
              if (!Game.cameraShake) {
                Game.cameraShake = { active: false, intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
              }
              Game.cameraShake.active = eventData.cameraShake.active || false;
              Game.cameraShake.intensity = eventData.cameraShake.intensity || 8;
              Game.cameraShake.duration = eventData.cameraShake.duration || 200;
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 處理屏幕效果失敗:", e);
        }
      } else if (eventType === "obstacles_spawn") {
        // ✅ MMORPG 架構：所有玩家都能看到相同的障礙物
        try {
          if (typeof Game !== "undefined" && Array.isArray(eventData.obstacles) && typeof Obstacle !== "undefined") {
            // 清除現有障礙物（避免重複）
            Game.obstacles = [];

            // 生成障礙物
            for (const obsData of eventData.obstacles) {
              if (obsData.x !== undefined && obsData.y !== undefined && obsData.imageKey) {
                const obstacle = new Obstacle(obsData.x, obsData.y, obsData.imageKey, obsData.size || 150);
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
        // ✅ MMORPG 架構：所有玩家都能生成寶箱（由主機通知，帶唯一ID）
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
      } else if (eventType === "chest_collected") {
        // ✅ MMORPG 架構：處理寶箱/鳳梨被收集事件（統一處理）
        try {
          if (typeof Game !== "undefined") {
            const isPineapple = (eventData.chestType === 'PINEAPPLE');
            const list = isPineapple ? Game.pineappleUltimatePickups : Game.chests;

            // 根據ID查找（比距離更準確）
            let chestIndex = -1;
            if (list) {
              chestIndex = list.findIndex(c => c.id === eventData.chestId);
            }

            // 如果找不到ID但有座標（兼容舊版或ID未同步），則嘗試用距離
            if (chestIndex === -1 && eventData.x !== undefined && eventData.y !== undefined) {
              const tolerance = 50;
              for (let i = list.length - 1; i >= 0; i--) {
                const item = list[i];
                if (Math.abs(item.x - eventData.x) < tolerance && Math.abs(item.y - eventData.y) < tolerance) {
                  chestIndex = i;
                  break;
                }
              }
            }

            if (chestIndex !== -1) {
              const chest = list[chestIndex];

              // 如果是我收集的，觸發獎勵
              if (eventData.collectorUid === (Game.multiplayer && Game.multiplayer.uid)) {
                if (isPineapple) {
                  // 鳳梨獎勵逻辑
                  if (typeof AudioManager !== 'undefined' && AudioManager.expSoundEnabled !== false) {
                    AudioManager.playSound('collect_exp');
                  }
                  const player = Game.player;
                  if (player && typeof player.gainExperience === 'function') {
                    const base = 50;
                    let needNow = 0;
                    try {
                      if (typeof player.experienceToNextLevel === 'number' && typeof player.experience === 'number') {
                        needNow = Math.max(0, Math.floor(player.experienceToNextLevel - player.experience));
                      }
                    } catch (_) { }
                    const bonus = Math.max(0, Math.floor(needNow * 0.30));
                    player.gainExperience(base + bonus);
                  }
                } else {
                  // 普通寶箱獎勵逻辑
                  if (typeof AudioManager !== 'undefined') {
                    AudioManager.playSound('level_up');
                  }
                  if (typeof UI !== 'undefined' && UI.showLevelUpMenu) {
                    UI.showLevelUpMenu();
                  }
                }
              }

              // 移除物件
              if (chest && typeof chest.destroy === 'function') chest.destroy();
              list.splice(chestIndex, 1);
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 處理寶箱收集事件失敗:", e);
        }
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
        // 隊員端顯示傷害數字（僅視覺，不影響傷害計算）
        try {
          if (typeof DamageNumbers !== "undefined" && typeof DamageNumbers.show === "function" && eventData.enemyId && typeof eventData.damage === "number") {
            const enemyX = eventData.enemyX || 0;
            const enemyY = eventData.enemyY || 0;
            const enemyHeight = eventData.enemyHeight || 0;
            const damage = eventData.damage || 0;
            const isCrit = (eventData.isCrit === true);
            const dirX = typeof eventData.dirX === "number" ? eventData.dirX : 0;
            const dirY = typeof eventData.dirY === "number" ? eventData.dirY : -1;
            const enemyId = eventData.enemyId;

            // 顯示傷害數字
            DamageNumbers.show(damage, enemyX, enemyY - enemyHeight / 2, isCrit, {
              dirX: dirX,
              dirY: dirY,
              enemyId: enemyId
            });
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 隊員端顯示傷害數字失敗:", e);
        }
      } else if (eventType === "projectile_spawn") {
        // ✅ 真正的MMORPG：所有玩家都能看到其他玩家的技能特效
        // 隊員端生成投射物視覺效果（僅視覺，不影響傷害計算）
        console.log(`[SurvivalOnline] onEventMessage: 收到投射物生成事件, weaponType=${eventData.weaponType}, x=${eventData.x}, y=${eventData.y}`);
        try {
          if (typeof Game !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            // 檢查是否已存在相同ID的投射物（避免重複生成）
            const projectileId = eventData.id || `projectile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const existingProjectile = Game.projectiles.find(p => p.id === projectileId);
            if (!existingProjectile) {
              const weaponType = eventData.weaponType || "UNKNOWN";

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
                        (weaponType === "PINEAPPLE_ORBIT") ? "A45" : "lightning";
                  const initialAngle = eventData.angle || 0;
                  const radius = eventData.radius || 60;
                  const orb = new OrbitBall(
                    targetPlayer,
                    initialAngle,
                    radius,
                    0, // 傷害設為0（僅視覺）
                    eventData.size || 20,
                    eventData.duration || 3000,
                    eventData.angularSpeed || 6.283,
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
                  const beam = new LaserBeam(
                    targetPlayer,
                    eventData.angle || 0,
                    0, // 傷害設為0（僅視覺）
                    eventData.width || 8,
                    eventData.duration || 1000,
                    eventData.tickInterval || 120
                  );
                  beam.id = projectileId;
                  beam._isVisualOnly = true;
                  beam._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(beam);
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
                  const shockwave = new ShockwaveEffect(
                    targetPlayer,
                    0, // 傷害設為0（僅視覺）
                    eventData.duration || 1000,
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
                    Game.projectiles.push(ai);
                  } else {
                    // 更新現有 AI 的位置和等級
                    existingAI.x = eventData.x || existingAI.x;
                    existingAI.y = eventData.y || existingAI.y;
                    if (typeof eventData.summonAILevel === "number") {
                      existingAI.summonAILevel = eventData.summonAILevel;
                    }
                  }
                }
              } else if ((weaponType === "CHAIN_LIGHTNING" || weaponType === "FRENZY_LIGHTNING") && typeof ChainLightningEffect !== "undefined") {
                // 連鎖閃電：需要找到對應的玩家（使用完整的 Player 對象）
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
                  if (weaponType === "CHAIN_LIGHTNING") {
                    // ✅ MMORPG架构：远程玩家的连锁闪电也应该造成伤害（每个玩家的伤害独立计算并叠加）
                    const effect = new ChainLightningEffect(
                      targetPlayer,
                      eventData.damage || 0, // 使用实际伤害值，不是0
                      eventData.duration || 1000,
                      eventData.maxChains || 0,
                      eventData.chainRadius || 220,
                      eventData.palette || null
                    );
                    effect.id = projectileId;
                    // 不标记为_isVisualOnly，让每个玩家的连锁闪电都能独立计算伤害
                    effect._remotePlayerUid = eventData.playerUid;
                    Game.projectiles.push(effect);
                  } else if (weaponType === "FRENZY_LIGHTNING" && typeof FrenzyLightningEffect !== "undefined") {
                    // ✅ MMORPG架构：远程玩家的狂热雷击也应该造成伤害（每个玩家的伤害独立计算并叠加）
                    const effect = new FrenzyLightningEffect(
                      targetPlayer,
                      eventData.damage || 0, // 使用实际伤害值，不是0
                      eventData.duration || 1000,
                      eventData.branchCount || 10,
                      eventData.chainsPerBranch || 10,
                      eventData.chainRadius || 220,
                      eventData.palette || null
                    );
                    effect.id = projectileId;
                    // 不标记为_isVisualOnly，让每个玩家的狂热雷击都能独立计算伤害
                    effect._remotePlayerUid = eventData.playerUid;
                    Game.projectiles.push(effect);
                  }
                }
              } else if (weaponType === "SLASH" && typeof SlashEffect !== "undefined") {
                // 斬擊：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  const effect = new SlashEffect(
                    targetPlayer,
                    eventData.angle || 0,
                    0, // 傷害設為0（僅視覺）
                    eventData.radius || 60,
                    eventData.arcDeg || 80,
                    eventData.duration || 1000
                  );
                  effect.id = projectileId;
                  effect._isVisualOnly = true;
                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.visualScale === "number") effect.visualScale = eventData.visualScale;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "JUDGMENT" && typeof JudgmentEffect !== "undefined") {
                // 裁決：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的裁决也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  const effect = new JudgmentEffect(
                    targetPlayer,
                    eventData.damage || 0, // 使用实际伤害值，不是0
                    eventData.swordCount || 1,
                    eventData.detectRadius || 400,
                    eventData.aoeRadius || 100,
                    eventData.swordImageWidth || 550,
                    eventData.swordImageHeight || 1320,
                    eventData.fallDurationMs || 500,
                    eventData.fadeOutDurationMs || 300
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
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
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
                  Game.projectiles.push(effect);
                }
              } else if ((weaponType === "DEATHLINE_WARRIOR" || weaponType === "DEATHLINE_SUPERMAN") && typeof DeathlineWarriorEffect !== "undefined") {
                // 死線戰士/死線超人：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的死线战士/死线超人也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  const effect = new DeathlineWarriorEffect(
                    targetPlayer,
                    eventData.damage || 0, // 使用实际伤害值，不是0
                    eventData.detectRadius || 600,
                    eventData.totalHits || 3,
                    eventData.totalDurationMs || 1200,
                    eventData.minTeleportDistance || 300,
                    weaponType,
                    eventData.aoeRadius || 0,
                    eventData.displayScale || 0.5
                  );
                  effect.id = projectileId;
                  // 不标记为_isVisualOnly，让每个玩家的死线战士/死线超人都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "DIVINE_JUDGMENT" && typeof DivineJudgmentEffect !== "undefined") {
                // 神裁：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的神界裁决也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  const effect = new DivineJudgmentEffect(targetPlayer, {
                    damage: eventData.damage || 0, // 使用实际伤害值，不是0
                    detectRadius: eventData.detectRadius || 400,
                    aoeRadius: eventData.aoeRadius || 100,
                    fallDurationMs: eventData.fallDurationMs || 250,
                    moveDurationMs: eventData.moveDurationMs || 2400,
                    headWaitMs: eventData.headWaitMs || 100,
                    holdOnEnemyMs: eventData.holdOnEnemyMs || 200,
                    swordImageWidth: eventData.swordImageWidth || 83,
                    swordImageHeight: eventData.swordImageHeight || 200,
                    patrolSpeedFactor: eventData.patrolSpeedFactor || 0.35
                  });
                  effect.id = projectileId;
                  // 不标记为_isVisualOnly，让每个玩家的神界裁决都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.visualScale === "number") effect.visualScale = eventData.visualScale;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "AURA_FIELD" && typeof AuraField !== "undefined") {
                // 光環領域：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的守护领域也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  const effect = new AuraField(
                    targetPlayer,
                    eventData.radius || 150,
                    eventData.damage || 0 // 使用实际伤害值，不是0
                  );
                  effect.id = projectileId;
                  // 不标记为_isVisualOnly，让每个玩家的守护领域都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.visualScale === "number") effect.visualScale = eventData.visualScale;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "GRAVITY_WAVE" && typeof GravityWaveField !== "undefined") {
                // 重力波：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
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
                // 大冰球：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
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
                    targetPlayer,
                    eventData.isFrenzyIceBall || false
                  );
                  effect.id = projectileId;
                  effect._isVisualOnly = true;
                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "YOUNG_DADA_GLORY" && typeof YoungDadaGloryEffect !== "undefined") {
                // 幼妲光輝：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  const effect = new YoungDadaGloryEffect(
                    targetPlayer,
                    eventData.duration || 2000
                  );
                  effect.id = projectileId;
                  effect._isVisualOnly = true;
                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "FRENZY_YOUNG_DADA_GLORY" && typeof FrenzyYoungDadaGloryEffect !== "undefined") {
                // 幼妲天使：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  const effect = new FrenzyYoungDadaGloryEffect(
                    targetPlayer,
                    eventData.duration || 3000
                  );
                  effect.id = projectileId;
                  effect._isVisualOnly = true;
                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "RADIANT_GLORY" && typeof RadiantGloryEffect !== "undefined") {
                // 光芒萬丈：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的光芒万丈也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  const effect = new RadiantGloryEffect(
                    targetPlayer,
                    eventData.damage || 0, // 使用实际伤害值，不是0
                    eventData.width || 8,
                    eventData.duration || 1000,
                    eventData.tickInterval || 120,
                    eventData.beamCount || 10,
                    eventData.rotationSpeed || 1.0
                  );
                  effect.id = projectileId;
                  // 不标记为_isVisualOnly，让每个玩家的光芒万丈都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "FRENZY_SLASH" && typeof SlashEffect !== "undefined") {
                // 狂熱斬擊：使用SlashEffect（與SLASH相同）
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // ✅ MMORPG架构：远程玩家的狂热斩击也应该造成伤害（每个玩家的伤害独立计算并叠加）
                  const effect = new SlashEffect(
                    targetPlayer,
                    eventData.angle || 0,
                    eventData.damage || 0, // 使用实际伤害值，不是0
                    eventData.radius || 60,
                    eventData.arcDeg || 80,
                    eventData.duration || 1000
                  );
                  effect.id = projectileId;
                  effect.weaponType = 'FRENZY_SLASH'; // ✅ 设置正确的weaponType
                  // 不标记为_isVisualOnly，让每个玩家的狂热斩击都能独立计算伤害
                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.visualScale === "number") effect.visualScale = eventData.visualScale;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "SING" && typeof SingEffect !== "undefined") {
                // 唱歌：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  const effect = new SingEffect(
                    targetPlayer,
                    eventData.duration || 2000
                  );
                  effect.id = projectileId;
                  effect._isVisualOnly = true;
                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.size === "number") effect.size = eventData.size;
                  if (typeof eventData.offsetY === "number") effect.offsetY = eventData.offsetY;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "INVINCIBLE" && typeof InvincibleEffect !== "undefined") {
                // 無敵：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  const effect = new InvincibleEffect(
                    targetPlayer,
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
                  const projectile = new Projectile(
                    eventData.x || 0,
                    eventData.y || 0,
                    eventData.angle || 0,
                    weaponType,
                    0, // 傷害設為0（僅視覺，傷害已在隊長端計算）
                    eventData.speed || 0,
                    eventData.size || 0
                  );
                  projectile.id = projectileId;
                  projectile.homing = eventData.homing || false;
                  projectile.turnRatePerSec = eventData.turnRatePerSec || 0;
                  projectile.assignedTargetId = eventData.assignedTargetId || null;
                  projectile._isVisualOnly = true; // 標記為僅視覺投射物
                  projectile.player = null; // 不關聯玩家（避免碰撞檢測）
                  Game.projectiles.push(projectile);
                  console.log(`[SurvivalOnline] ✅ 成功創建遠程投射物: weaponType=${weaponType}, id=${projectileId}, x=${eventData.x}, y=${eventData.y}`);
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
        try {
          // 防止重複觸發
          if (typeof Game !== "undefined") {
            if (Game._gameOverEventSent) return; // 已經處理過了
            Game._gameOverEventSent = true; // 標記為已處理

            // ✅ 修復：直接調用遊戲結束邏輯，不再次調用 Game.gameOver()（避免循環）
            // 因為 Game.gameOver() 會再次廣播事件，導致循環
            Game.isGameOver = true;
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
            // 顯示遊戲結束畫面
            if (typeof UI !== 'undefined' && typeof UI.showGameOverScreen === 'function') {
              UI.showGameOverScreen();
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
          if (typeof myState.expToNext === "number") player.experienceToNextLevel = myState.expToNext;

          // 金幣同步（組隊模式共享金幣）
          if (typeof myState.coins === "number" && typeof Game !== "undefined") {
            Game.coins = Math.max(0, Math.floor(myState.coins));
            // 更新金幣顯示
            if (typeof UI !== "undefined" && UI.updateCoinsDisplay) {
              UI.updateCoinsDisplay(Game.coins);
            }
          }

          // 大招狀態同步
          if (typeof myState.isUltimateActive === "boolean") {
            player.isUltimateActive = myState.isUltimateActive;
          }
          if (typeof myState.ultimateImageKey === "string" && myState.ultimateImageKey) {
            player._ultimateImageKey = myState.ultimateImageKey;
          } else if (myState.isUltimateActive === false) {
            player._ultimateImageKey = null;
          }
          if (typeof myState.ultimateEndTime === "number") {
            player.ultimateEndTime = myState.ultimateEndTime;
          }
          // 體型同步
          if (typeof myState.width === "number" && myState.width > 0) {
            player.width = myState.width;
          }
          if (typeof myState.height === "number" && myState.height > 0) {
            player.height = myState.height;
          }
          if (typeof myState.collisionRadius === "number" && myState.collisionRadius > 0) {
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

          // 更新 UI
          if (typeof UI !== "undefined") {
            if (UI.updateHealthBar) UI.updateHealthBar(player.health, player.maxHealth);
            if (UI.updateEnergyBar) UI.updateEnergyBar(player.energy, player.maxEnergy);
            if (UI.updateLevel) UI.updateLevel(player.level);
            if (UI.updateExpBar) UI.updateExpBar(player.experience, player.experienceToNextLevel);
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

    // 限制發送頻率 (10Hz / 100ms)
    const now = Date.now();
    if (now - lastSendAt < 100) return;
    lastSendAt = now;

    if (typeof Game === "undefined" || !Game.player) return;

    // 構建位置和狀態消息 (Client-Authoritative)
    const payload = {
      t: "pos",
      x: Game.player.x,
      y: Game.player.y,
      health: Game.player.health,
      maxHealth: Game.player.maxHealth,
      energy: Game.player.energy,
      maxEnergy: Game.player.maxEnergy,
      level: Game.player.level,
      exp: Game.player.experience,
      expToNext: Game.player.experienceToNextLevel,
      facingRight: Game.player.facingRight,
      facingAngle: Game.player.facingAngle,
      _isDead: Game.player._isDead,
      _resurrectionProgress: Game.player._resurrectionProgress,
      isUltimateActive: Game.player.isUltimateActive,
      ultimateImageKey: Game.player._ultimateImageKey,
      ultimateEndTime: Game.player.ultimateEndTime,
      width: Game.player.width,
      height: Game.player.height,
      collisionRadius: Game.player.collisionRadius,
      // 傳遞金幣（共享）
      coins: Game.coins,
      hitFlashTime: Game.player.hitFlashTime || 0
    };

    // 發送
    _sendViaWebSocket(payload);
  }

  function getRemotePlayers() {
    return Array.from(remotePlayers.entries()).map(([uid, p]) => ({ uid, ...p }));
  }

  // M3：收集完整狀態快照（僅室長端）
  let lastSnapshotAt = 0;
  const SNAPSHOT_INTERVAL_MS = 300; // 每 300ms 發送一次快照（約 3.3Hz）

  function collectSnapshot() {
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

  return { setEnabled, onStateMessage, onEventMessage, onSnapshotMessage, onFullSnapshotMessage, tick, getRemotePlayers, updateRemotePlayers, clearRemotePlayers, broadcastEvent: broadcastEventFromRuntime, sendToNet };
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

      await setDoc(memberDocRef(roomId, _uid), {
        uid: _uid,
        role: "host",
        ready: false,
        joinedAt: createdAt,
        lastSeenAt: createdAt,
        name: getPlayerNickname(),
        characterId: characterId,
        talentLevels: talentLevels, // 保存天賦等級
      });

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
    await setDoc(memberDocRef(roomId, _uid), {
      uid: _uid,
      role: "guest",
      ready: false,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      name: getPlayerNickname(),
      characterId: characterId,
      talentLevels: talentLevels, // 保存天賦等級
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
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem) {
      localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
    }
  } catch (_) { }
}

async function setReady(ready) {
  if (!_activeRoomId) return;
  await ensureAuth();
  await updateDoc(memberDocRef(_activeRoomId, _uid), { ready: !!ready, lastSeenAt: serverTimestamp() });
}

function _startMemberHeartbeat() {
  try { if (_memberHeartbeatTimer) clearInterval(_memberHeartbeatTimer); } catch (_) { }
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
        console.log(`[SurvivalOnline] listenRoom: 設置 hostUid=${_hostUid}, 舊值=${oldHostUid}`);
        // 如果 hostUid 剛設置且隊員端還沒有連接，嘗試連接 WebSocket
        if (!_isHost && !oldHostUid && _hostUid && !_ws) {
          console.log(`[SurvivalOnline] listenRoom: hostUid 剛設置，嘗試連接 WebSocket`);
          connectWebSocket().catch((e) => {
            console.error(`[SurvivalOnline] listenRoom: WebSocket 連接失敗:`, e);
          });
        }
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

  try {
    _ws = new WebSocket(WEBSOCKET_SERVER_URL);

    _ws.onopen = () => {
      console.log(`[SurvivalOnline] connectWebSocket: WebSocket 已打開`);
      _wsReconnectAttempts = 0;

      // 發送加入房間消息
      _ws.send(JSON.stringify({
        type: 'join',
        roomId: _activeRoomId,
        uid: _uid,
        isHost: _isHost
      }));

      // ✅ 权威服务器：发送CONFIG数据到服务器（用于敌人生成）
      if (typeof CONFIG !== 'undefined') {
        // 只发送必要的CONFIG数据（减少流量）
        const configData = {
          WAVES: CONFIG.WAVES || null,
          ENEMIES: CONFIG.ENEMIES || null,
          OPTIMIZATION: CONFIG.OPTIMIZATION || null,
          TUNING: CONFIG.TUNING || null
        };

        setTimeout(() => {
          if (_ws && _ws.readyState === WebSocket.OPEN) {
            _sendViaWebSocket({
              type: 'game-data',
              data: {
                type: 'config',
                config: configData
              }
            });
          }
        }, 100); // 延迟100ms确保连接已建立
      }

      // ✅ 权威服务器：发送地图信息到服务器（用于路口车辆生成等）
      if (typeof Game !== 'undefined' && Game.selectedMap) {
        setTimeout(() => {
          if (_ws && _ws.readyState === WebSocket.OPEN) {
            _sendViaWebSocket({
              type: 'game-data',
              data: {
                type: 'map',
                map: {
                  id: Game.selectedMap.id || null,
                  name: Game.selectedMap.name || null
                }
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
          if (_ws && _ws.readyState === WebSocket.OPEN) {
            _sendViaWebSocket({
              type: 'game-data',
              data: {
                type: 'world-size',
                worldWidth: Game.worldWidth,
                worldHeight: Game.worldHeight
              }
            });
          }
        }, 300); // 延迟300ms确保地图信息已发送
      }

      Runtime.setEnabled(true);
      _setText("survival-online-status", "已連線（WebSocket）");
    };

    _ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);

        if (msg.type === 'joined') {
          console.log(`[SurvivalOnline] connectWebSocket: 已加入房間`);
        } else if (msg.type === 'game-data') {
          // 處理遊戲數據
          const data = msg.data;
          // 優先使用 fromUid（WebSocket 消息格式），其次使用 uid
          const senderUid = (msg.fromUid && typeof msg.fromUid === "string") ? msg.fromUid : (msg.uid && typeof msg.uid === "string") ? msg.uid : null;

          if (data.t === "state") {
            Runtime.onStateMessage(data);
          } else if (data.t === "event") {
            Runtime.onEventMessage(data);
          } else if (data.t === "snapshot") {
            Runtime.onSnapshotMessage(data);
          } else if (data.t === "full_snapshot") {
            Runtime.onFullSnapshotMessage(data);
          } else if (data.t === "enemy_damage") {
            // ✅ MMORPG 架構：所有玩家都處理 enemy_damage 消息，同步其他玩家的傷害
            _handleEnemyDamageMessage(senderUid, data);
          } else if (data.t === "ultimate_pineapple") {
            // ✅ MMORPG 架構：所有玩家都處理 ultimate_pineapple 消息，同步鳳梨大絕掉落物
            _handleUltimatePineappleMessage(senderUid, data);
          } else if (data.t === "weapon_upgrade") {
            // ✅ MMORPG 架構：所有玩家都處理 weapon_upgrade 消息，同步武器升級
            _handleWeaponUpgradeMessage(senderUid, data);
          } else if (data.t === "input") {
            // ✅ MMORPG 架構：所有玩家都處理 input 消息，同步遠程玩家移動
            _handleInputMessage(senderUid, data);
          } else if (data.t === "pos") {
            // ✅ MMORPG 架構：處理 pos 消息 (Client-Authoritative)
            // 當收到其他玩家發送的 pos 數據時，更新本地對該玩家的狀態

            // 構造一個符合 onStateMessage 格式的 payload，複用現有邏輯
            const pseudoStateMSG = {
              t: "state",
              players: {
                [senderUid]: data // data 本身包含 x, y, health 等字段
              }
            };
            // 調用 Runtime.onStateMessage 進行更新
            Runtime.onStateMessage(pseudoStateMSG);
          }
        } else if (msg.type === 'game-state') {
          // ✅ 权威服务器：接收服务器游戏状态
          handleServerGameState(msg.state, msg.timestamp);
        } else if (msg.type === 'user-joined' || msg.type === 'user-left') {
          // 用戶加入/離開通知（可選）
          console.log(`[SurvivalOnline] connectWebSocket: ${msg.type}, uid=${msg.uid}`);
        }
      } catch (e) {
        console.error(`[SurvivalOnline] connectWebSocket: 處理消息失敗:`, e);
      }
    };

    _ws.onclose = () => {
      console.log(`[SurvivalOnline] connectWebSocket: WebSocket 已關閉`);
      Runtime.setEnabled(false);
      _setText("survival-online-status", "連線已中斷");

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
          try {
            if (typeof Game !== "undefined" && Game.gameOver) {
              Game.gameOver();
            }
          } catch (_) { }
          leaveRoom().catch(() => { });
          closeLobbyToStart(); // ✅ 離開房間後回到遊戲開始畫面
        }, 1000);
      }
    };

    _ws.onerror = (err) => {
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

  } catch (e) {
    console.error(`[SurvivalOnline] connectWebSocket: 連接失敗:`, e);
    _ws = null;
    throw e;
  }
}

// ❌ 已刪除：舊的 WebRTC 函數（connectClientToHost, hostAcceptOffer）
// 系統已切換到 WebSocket，不再需要 WebRTC 相關代碼

// 通過 WebSocket 發送消息
function _sendViaWebSocket(obj) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    try {
      _ws.send(JSON.stringify({
        type: 'game-data',
        roomId: _activeRoomId,
        uid: _uid,
        data: obj
      }));
      // 添加日志以确认发送（仅对 pos 消息，避免日志过多）
      if (obj.t === "pos") {
        console.log(`[SurvivalOnline] _sendViaWebSocket: 已發送 ${obj.t} 消息, isHost=${_isHost}, uid=${_uid}`);
      }
    } catch (e) {
      console.error(`[SurvivalOnline] _sendViaWebSocket: 發送失敗:`, e);
    }
  } else {
    console.warn(`[SurvivalOnline] _sendViaWebSocket: WebSocket 不可用，消息未發送`, {
      wsReadyState: _ws ? _ws.readyState : 'null',
      messageType: obj.t
    });
  }
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
      console.log(`[SurvivalOnline] M5: 已發送全量快照給隊員 ${targetUid}`);
    }
  } catch (e) {
    console.warn("[SurvivalOnline] M5: 發送全量快照失敗:", e);
  }
}

// MMO 架構：事件廣播系統（每個玩家都廣播自己的事件）
function broadcastEvent(eventType, eventData) {
  // ✅ MMO 架構：每個玩家都廣播自己的事件，不依賴隊長端
  if (!_activeRoomId) return;
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

  try {
    // 更新玩家状态
    if (Array.isArray(state.players)) {
      for (const playerState of state.players) {
        if (playerState.uid === _uid) {
          // 本地玩家：只同步关键状态（血量、能量等），位置由输入控制
          if (typeof Game !== 'undefined' && Game.player) {
            Game.player.health = playerState.health || Game.player.health;
            Game.player.maxHealth = playerState.maxHealth || Game.player.maxHealth;
            Game.player.energy = playerState.energy || Game.player.energy;
            Game.player.maxEnergy = playerState.maxEnergy || Game.player.maxEnergy;
            Game.player.level = playerState.level || Game.player.level;
            Game.player.experience = playerState.experience || Game.player.experience;
            Game.player.gold = playerState.gold || Game.player.gold;
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

    // 更新经验球（服务器权威）
    if (Array.isArray(state.experienceOrbs)) {
      updateExperienceOrbsFromServer(state.experienceOrbs);
    }

    // ✅ 更新路口车辆（服务器权威）
    if (Array.isArray(state.carHazards)) {
      updateCarHazardsFromServer(state.carHazards);
    }

    // 更新波次
    if (typeof state.wave === 'number' && typeof WaveSystem !== 'undefined') {
      WaveSystem.currentWave = state.wave;
      if (typeof UI !== 'undefined' && UI.updateWaveInfo) {
        UI.updateWaveInfo(state.wave);
      }
    }

    // 更新游戏状态
    if (typeof Game !== 'undefined') {
      Game.gameTime = state.gameTime || Game.gameTime;
      if (state.isGameOver) {
        Game.isGameOver = true;
        if (typeof Game.gameOver === 'function') {
          Game.gameOver();
        }
      }
      if (state.isVictory) {
        if (typeof Game.victory === 'function') {
          Game.victory();
        }
      }
    }
  } catch (e) {
    console.error('[SurvivalOnline] 处理服务器游戏状态失败:', e);
  }
}

// ✅ 不影响单机：只在多人模式下执行
function updateRemotePlayerFromServer(playerState) {
  if (typeof Game === 'undefined' || !Game.multiplayer) return;

  // 使用 RemotePlayerManager 更新远程玩家
  if (typeof RemotePlayerManager !== 'undefined' && typeof RemotePlayerManager.get === 'function') {
    let remotePlayer = RemotePlayerManager.get(playerState.uid);
    if (!remotePlayer) {
      // 创建远程玩家
      if (typeof RemotePlayerManager.create === 'function') {
        remotePlayer = RemotePlayerManager.create(playerState.uid, playerState);
      }
    }
    if (remotePlayer) {
      // 更新位置（插值平滑）
      const dx = playerState.x - remotePlayer.x;
      const dy = playerState.y - remotePlayer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        const lerp = 0.3;
        remotePlayer.x += dx * lerp;
        remotePlayer.y += dy * lerp;
      } else {
        remotePlayer.x = playerState.x;
        remotePlayer.y = playerState.y;
      }

      // 更新状态
      remotePlayer.health = playerState.health || remotePlayer.health;
      remotePlayer.maxHealth = playerState.maxHealth || remotePlayer.maxHealth;
      remotePlayer.energy = playerState.energy || remotePlayer.energy;
      remotePlayer.maxEnergy = playerState.maxEnergy || remotePlayer.maxEnergy;
      remotePlayer.level = playerState.level || remotePlayer.level;
      remotePlayer.facing = playerState.facing || remotePlayer.facing;
      remotePlayer.isDead = playerState.isDead || false;
    }
  }
}

// ✅ 不影响单机：只在多人模式下执行
function updateEnemiesFromServer(enemies) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.enemies) return;

  // 创建敌人ID映射
  const serverEnemyIds = new Set(enemies.map(e => e.id));
  const localEnemyIds = new Set(Game.enemies.map(e => e.id));

  // 移除服务器不存在的敌人
  for (let i = Game.enemies.length - 1; i >= 0; i--) {
    if (!serverEnemyIds.has(Game.enemies[i].id)) {
      Game.enemies.splice(i, 1);
    }
  }

  // 更新或创建敌人
  for (const enemyState of enemies) {
    let enemy = Game.enemies.find(e => e.id === enemyState.id);
    if (!enemy && typeof Enemy !== 'undefined') {
      // 创建新敌人
      enemy = new Enemy(enemyState.x, enemyState.y, enemyState.type);
      enemy.id = enemyState.id;
      Game.enemies.push(enemy);
    }
    if (enemy) {
      // 更新位置和状态
      enemy.x = enemyState.x;
      enemy.y = enemyState.y;
      enemy.health = enemyState.health;
      enemy.maxHealth = enemyState.maxHealth;

      // ✅ MMORPG 架構：同步敵人死亡狀態，讓所有玩家都能看到死亡動畫
      if (typeof enemyState.isDying === 'boolean') {
        enemy.isDying = enemyState.isDying;
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
        enemy.markedForDeletion = true;
      }
    }
  }
}

// ✅ 不影响单机：只在多人模式下执行
function updateProjectilesFromServer(projectiles) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.projectiles) return;

  // 创建投射物ID映射
  const serverProjectileIds = new Set(projectiles.map(p => p.id));
  const localProjectileIds = new Set(Game.projectiles.map(p => p.id));

  // 移除服务器不存在的投射物
  for (let i = Game.projectiles.length - 1; i >= 0; i--) {
    if (!serverProjectileIds.has(Game.projectiles[i].id)) {
      Game.projectiles.splice(i, 1);
    }
  }

  // 更新或创建投射物
  for (const projState of projectiles) {
    let proj = Game.projectiles.find(p => p.id === projState.id);
    if (!proj && typeof Projectile !== 'undefined') {
      // 创建新投射物（仅视觉）
      proj = new Projectile(projState.x, projState.y, projState.angle, projState.weaponType, 0, projState.speed, projState.size);
      proj.id = projState.id;
      proj._isVisualOnly = true; // 仅视觉，伤害由服务器计算
      Game.projectiles.push(proj);
    }
    if (proj) {
      // 更新位置
      proj.x = projState.x;
      proj.y = projState.y;
      proj.angle = projState.angle;
    }
  }
}

// ✅ 不影响单机：只在多人模式下执行
function updateCarHazardsFromServer(carHazards) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.projectiles) return;
  if (typeof CarHazard === 'undefined') return;

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
      car = new CarHazard({
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
      // 更新位置和速度
      car.x = carState.x;
      car.y = carState.y;
      car.vx = carState.vx;
      car.vy = carState.vy;
      car.hitPlayer = carState.hitPlayer || false;
    }
  }
}

// ✅ 不影响单机：只在多人模式下执行
function updateExperienceOrbsFromServer(orbs) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.experienceOrbs) return;

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
    if (!orb && typeof ExperienceOrb !== 'undefined') {
      orb = new ExperienceOrb(orbState.x, orbState.y, orbState.value);
      orb.id = orbState.id;
      Game.experienceOrbs.push(orb);
    }
    if (orb) {
      orb.x = orbState.x;
      orb.y = orbState.y;
    }
  }
}

// ✅ MMORPG 架構：處理 enemy_damage 消息（所有玩家都可以調用）
function _handleEnemyDamageMessage(fromUid, msg) {
  if (!msg || typeof msg !== "object") return;
  if (!fromUid || typeof fromUid !== "string") {
    // fromUid 無效，嘗試從 msg 中獲取
    fromUid = (msg.playerUid && typeof msg.playerUid === "string") ? msg.playerUid : null;
    if (!fromUid) {
      console.warn("[SurvivalOnline] _handleEnemyDamageMessage: fromUid 無效", fromUid);
      return;
    }
  }

  // 速率限制：每秒最多 2000 次傷害（防止 DDoS，但允許正常高強度戰鬥）
  // 計算：假設 20 個武器 × 3 次/秒 × 20 個敵人 = 1200 次/秒，加上持續傷害技能約 800 次/秒 = 2000 次/秒
  if (!_checkRateLimit(fromUid, "damage", 2000)) {
    console.warn("[SurvivalOnline] 傷害速率過高，忽略:", fromUid);
    return;
  }

  const enemyId = typeof msg.enemyId === "string" ? msg.enemyId : null;
  const damage = typeof msg.damage === "number" ? Math.max(0, msg.damage) : 0;
  const weaponType = typeof msg.weaponType === "string" ? msg.weaponType : "UNKNOWN";
  const isCrit = (msg.isCrit === true);
  const playerUid = typeof msg.playerUid === "string" ? msg.playerUid : fromUid; // 發送傷害的玩家UID
  const lifesteal = typeof msg.lifesteal === "number" ? Math.max(0, msg.lifesteal) : 0; // 吸血量

  if (!enemyId || damage <= 0) return;

  // ✅ MMORPG 架構：跳過自己的傷害消息（避免重複計算）
  // 因為自己造成的傷害已經在本地計算過了
  if (playerUid === _uid) {
    return; // 跳過自己的傷害消息
  }

  // 找到對應的敵人
  try {
    if (typeof Game !== "undefined" && Array.isArray(Game.enemies)) {
      const enemy = Game.enemies.find(e => e && e.id === enemyId);
      if (enemy && !enemy.markedForDeletion && !enemy.isDying) {
        // ✅ MMORPG 架構：對敵人造成傷害（同步其他玩家的傷害）
        // 注意：這裡不重新計算傷害，因為其他玩家已經計算過了（包括爆擊和天賦）
        enemy.takeDamage(damage, {
          weaponType: weaponType,
          playerUid: playerUid,
          isCrit: isCrit,
          dirX: 0,
          dirY: -1
        });

        // ✅ MMORPG 架構：如果消息包含減速信息，同步減速效果（確保所有玩家都能看到敵人被減速的視覺效果）
        const slowMs = typeof msg.slowMs === "number" ? msg.slowMs : null;
        const slowFactor = typeof msg.slowFactor === "number" ? msg.slowFactor : null;
        if (slowMs !== null && slowFactor !== null && typeof enemy.applySlow === "function") {
          try {
            enemy.applySlow(slowMs, slowFactor);
          } catch (e) {
            console.warn("[SurvivalOnline] 同步敵人減速效果失敗:", e);
          }
        }

        // 顯示傷害數字（所有玩家都能看到其他玩家的傷害）
        if (typeof DamageNumbers !== "undefined" && typeof DamageNumbers.show === "function") {
          DamageNumbers.show(damage, enemy.x, enemy.y - (enemy.height || 0) / 2, isCrit, {
            dirX: 0,
            dirY: -1,
            enemyId: enemyId
          });
        }

        // ✅ MMORPG 架構：同步擊退效果 (Knockback)
        // 這是 "Real Banana" 的關鍵：如果 A 把敵人打飛，B 也必須看到敵人飛出去，否則位置會不同步
        const kbX = typeof msg.knockbackX === "number" ? msg.knockbackX : 0;
        const kbY = typeof msg.knockbackY === "number" ? msg.knockbackY : 0;

        if ((kbX !== 0 || kbY !== 0)) {
          // 直接修改敵人的速度，模擬被擊退
          if (typeof enemy.vx === 'number') enemy.vx = kbX;
          if (typeof enemy.vy === 'number') enemy.vy = kbY;
        }
      }
    }
  } catch (e) {
    console.warn("[SurvivalOnline] 同步敵人傷害失敗:", e);
  }

  // 處理吸血邏輯：將吸血量應用到遠程玩家
  if (lifesteal > 0 && playerUid) {
    // 速率限制：每秒最多 2000 次吸血（與傷害同步）
    if (!_checkRateLimit(fromUid, "lifesteal", 2000)) {
      // 吸血速率過高時忽略，但不影響傷害處理
      return;
    }

    try {
      // 找到對應的遠程玩家
      let remotePlayer = null;
      if (typeof RemotePlayerManager !== 'undefined' && typeof RemotePlayerManager.get === 'function') {
        remotePlayer = RemotePlayerManager.get(playerUid);
      }

      if (remotePlayer && typeof remotePlayer.health === 'number' && typeof remotePlayer.maxHealth === 'number') {
        // 應用吸血回復
        remotePlayer.health = Math.min(remotePlayer.maxHealth, remotePlayer.health + lifesteal);
      }
    } catch (e) {
      console.warn("[SurvivalOnline] 同步吸血失敗:", e);
    }
  }
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
  if (msg.t === "reconnect_request") {
    // M5：隊員請求全量快照（重連恢復）
    if (_isHost && typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
      sendFullSnapshotToClient(fromUid);
    }
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
    // ✅ MMORPG 架構：所有玩家都處理 enemy_damage 消息，同步其他玩家的傷害
    // 注意：這裡使用 handleHostDataMessage 是為了向後兼容，但實際上所有玩家都應該處理
    // 新的實現使用 _handleEnemyDamageMessage 函數，所有玩家都可以調用

    // 如果是自己發出的傷害消息，忽略（因為本地已經預測執行了）
    if (fromUid === _uid) {
      return;
    }

    _handleEnemyDamageMessage(fromUid, msg);
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
  // 连接 WebSocket
  await connectWebSocket();
  Runtime.setEnabled(true);
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
  // 连接 WebSocket（替代 WebRTC）
  await connectWebSocket();
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
        uid: _uid,
        sessionId: (params && params.sessionId) ? params.sessionId : (_roomState && _roomState.sessionId ? _roomState.sessionId : null)
      } : null,
    });

    // ✅ MMORPG 架構：綁定傷害廣播監聽器
    // 當本地發生傷害時，廣播給其他玩家
    setTimeout(() => {
      if (typeof Game !== "undefined" && Game.events && typeof Game.events.on === "function") {
        // 防止重複綁定 (移除舊的如果存在)
        if (Game._damageBroadcastListener) {
          Game.events.off('damage_enemy', Game._damageBroadcastListener);
        }

        // 定義監聽器
        Game._damageBroadcastListener = (data) => {
          // 只廣播本地玩家造成的傷害 (data.playerUid === _uid)
          if (data && data.playerUid && data.playerUid === _uid) {
            if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.Runtime && typeof window.SurvivalOnlineRuntime.Runtime.sendMessage === "function") {
              window.SurvivalOnlineRuntime.Runtime.sendMessage({
                t: 'enemy_damage',
                enemyId: data.enemyId,
                damage: data.damage,
                isCrit: data.isCrit,
                weaponType: data.weaponType
              });
            }
          }
        };

        // 綁定新監聽器
        Game.events.on('damage_enemy', Game._damageBroadcastListener);
        console.log("[SurvivalOnline] 已綁定 damage_enemy 廣播監聽器");
      }
    }, 1000); // 延遲綁定以確保 Game 已完全初始化

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

  const startGame = () => {
    if (hasStarted) return;
    hasStarted = true;
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

    // 確保 WebSocket 已連接（遊戲開始前連接）
    if (!_ws || _ws.readyState !== WebSocket.OPEN) {
      console.log(`[SurvivalOnline] startGame: WebSocket 未連接，嘗試連接...`);
      connectWebSocket().catch((e) => {
        console.error(`[SurvivalOnline] startGame: WebSocket 連接失敗:`, e);
      });
    }

    // 確保 Runtime 啟用（遊戲開始時啟用狀態同步）
    if (typeof Runtime !== "undefined" && typeof Runtime.setEnabled === "function") {
      Runtime.setEnabled(true);
    }

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
  getMembersState: getMembersState,
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


