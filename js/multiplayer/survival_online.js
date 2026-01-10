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

// M4：室長端遠程玩家管理（完整的 Player 對象，支援武器和戰鬥）
const RemotePlayerManager = (() => {
  const remotePlayers = new Map(); // uid -> Player

  // M4：使用完整的 Player 類（而不是簡化的 RemotePlayer）
  // 這樣遠程玩家也能有武器、造成傷害、收集經驗等
  function getOrCreate(uid, startX, startY, characterId) {
    if (!remotePlayers.has(uid)) {
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
              
              // 應用天賦效果（遠程玩家也應該應用天賦，但使用本地天賦數據）
              // 注意：這裡使用本地天賦數據，因為天賦是全局的，不是每個玩家獨立的
              try {
                if (typeof TalentSystem !== "undefined" && typeof TalentSystem.applyTalentEffects === "function") {
                  TalentSystem.applyTalentEffects(player);
                } else if (typeof applyTalentEffects === "function") {
                  applyTalentEffects(player);
                }
              } catch (e) {
                console.warn("[SurvivalOnline] 遠程玩家應用天賦失敗:", e);
              }
            }
          }
          // 將遠程玩家添加到 Game.remotePlayers（如果存在）
          if (typeof Game !== "undefined") {
            if (!Game.remotePlayers) Game.remotePlayers = [];
            Game.remotePlayers.push(player);
          }
          remotePlayers.set(uid, player);
          return player;
        }
      } catch (e) {
        console.warn("[SurvivalOnline] M4 創建遠程玩家失敗:", e);
      }
      return null;
    }
    return remotePlayers.get(uid);
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
      } catch (_) {}
      // 清理玩家的武器
      try {
        if (player.weapons && Array.isArray(player.weapons)) {
          for (const weapon of player.weapons) {
            if (weapon && typeof weapon.destroy === "function") {
              try { weapon.destroy(); } catch (_) {}
            }
          }
        }
      } catch (_) {}
    }
    remotePlayers.delete(uid);
  }

  function updateAll(deltaTime) {
    for (const player of remotePlayers.values()) {
      if (player && typeof player.update === "function") {
        // M4：使用完整的 Player.update，包括武器更新、回血等
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
          facingAngle: player.facingAngle || 0
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
              try { weapon.destroy(); } catch (_) {}
            }
          }
        }
      } catch (_) {}
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
        characterId: (typeof p.characterId === "string") ? p.characterId : null, // 保存角色ID
        // 大招狀態同步
        isUltimateActive: (typeof p.isUltimateActive === "boolean") ? p.isUltimateActive : false,
        ultimateImageKey: (typeof p.ultimateImageKey === "string" && p.ultimateImageKey) ? p.ultimateImageKey : null,
        ultimateEndTime: (typeof p.ultimateEndTime === "number") ? p.ultimateEndTime : 0,
        width: (typeof p.width === "number" && p.width > 0) ? p.width : null,
        height: (typeof p.height === "number" && p.height > 0) ? p.height : null,
        collisionRadius: (typeof p.collisionRadius === "number" && p.collisionRadius > 0) ? p.collisionRadius : null,
        updatedAt: now,
      });
    }
    // 清掉過期（避免斷線殘留）
    for (const [uid, p] of remotePlayers) {
      if (now - (p.updatedAt || 0) > 8000) {
        remotePlayers.delete(uid);
        // 隱藏對應的GIF覆蓋層
        try {
          if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.hide === 'function') {
            window.GifOverlay.hide(`remote-player-${uid}`);
          }
        } catch (_) {}
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
        // 波次開始
        if (typeof WaveSystem !== "undefined" && WaveSystem.currentWave !== undefined) {
          WaveSystem.currentWave = eventData.wave || 1;
          WaveSystem.waveStartTime = payload.timestamp || Date.now();
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
        // 隊員生成寶箱（與單機一致，隊員也應該能看到和打開寶箱）
        try {
          if (typeof Game !== "undefined" && typeof Chest !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            const chest = new Chest(eventData.x, eventData.y);
            Game.chests.push(chest);
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 隊員生成寶箱失敗:", e);
        }
      } else if (eventType === "ultimate_pineapple_spawn") {
        // 鳳梨大絕掉落物生成（客戶端生成視覺效果，但不影響遊戲邏輯）
        // 經驗共享已在室長端處理，客戶端只需要視覺顯示
        try {
          if (typeof Game !== "undefined" && typeof Game.spawnPineappleUltimatePickup === "function" && eventData.x !== undefined && eventData.y !== undefined) {
            const opts = eventData.opts || {};
            Game.spawnPineappleUltimatePickup(eventData.x, eventData.y, opts);
          }
        } catch (_) {}
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
        // 隊員端生成投射物視覺效果（僅視覺，不影響傷害計算）
        try {
          if (typeof Game !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            // 檢查是否已存在相同ID的投射物（避免重複生成）
            const projectileId = eventData.id || `projectile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const existingProjectile = Game.projectiles.find(p => p.id === projectileId);
            if (!existingProjectile) {
              const weaponType = eventData.weaponType || "UNKNOWN";
              
              // 根據武器類型創建對應的投射物
              if (weaponType === "ORBIT" || weaponType === "CHICKEN_BLESSING" || weaponType === "ROTATING_MUFFIN" || weaponType === "HEART_COMPANION" || weaponType === "PINEAPPLE_ORBIT") {
                // 環繞投射物：需要找到對應的玩家
                let targetPlayer = null;
                if (eventData.playerUid) {
                  // 嘗試找到對應的遠程玩家
                  const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                  if (rt && typeof rt.getRemotePlayers === 'function') {
                    const remotePlayers = rt.getRemotePlayers() || [];
                    const remotePlayer = remotePlayers.find(p => p.uid === eventData.playerUid);
                    if (remotePlayer) {
                      // 創建一個臨時的玩家對象用於環繞（僅用於視覺）
                      targetPlayer = { x: remotePlayer.x, y: remotePlayer.y };
                    } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                      // 如果是本地玩家
                      targetPlayer = Game.player;
                    }
                  } else if (eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
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
                // 雷射：需要找到對應的玩家
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
                // 震波：需要找到對應的玩家
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
              } else if (typeof Projectile !== "undefined") {
                // 普通投射物
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
              }
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 隊員端生成投射物視覺效果失敗:", e);
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
      // 只處理自己的狀態（其他玩家的狀態由 onStateMessage 處理）
      if (payload.players && _uid && payload.players[_uid]) {
        const myState = payload.players[_uid];
        if (typeof Game !== "undefined" && Game.player) {
          const player = Game.player;
          
          // 位置：使用插值平滑過渡（不硬跳）
          const targetX = myState.x || player.x;
          const targetY = myState.y || player.y;
          const dx = targetX - player.x;
          const dy = targetY - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // 如果距離較大（>50px），使用插值；否則直接設置
          if (dist > 50) {
            const lerp = 0.3; // 插值係數
            player.x += dx * lerp;
            player.y += dy * lerp;
          } else {
            player.x = targetX;
            player.y = targetY;
          }
          
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

      // 處理敵人狀態（同步敵人的位置和血量）
      if (payload.enemies && Array.isArray(payload.enemies) && typeof Game !== "undefined" && Array.isArray(Game.enemies)) {
        // 建立敵人ID映射
        const enemyMap = new Map();
        for (const enemy of Game.enemies) {
          if (enemy && enemy.id) {
            enemyMap.set(enemy.id, enemy);
          }
        }
        
        // 同步敵人狀態
        for (const enemyState of payload.enemies) {
          if (!enemyState.id) continue;
          const enemy = enemyMap.get(enemyState.id);
          if (enemy) {
            // 同步位置（使用插值）
            if (typeof enemyState.x === "number" && typeof enemyState.y === "number") {
              const dx = enemyState.x - enemy.x;
              const dy = enemyState.y - enemy.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > 50) {
                const lerp = 0.3;
                enemy.x += dx * lerp;
                enemy.y += dy * lerp;
              } else {
                enemy.x = enemyState.x;
                enemy.y = enemyState.y;
              }
            }
            // 同步血量
            if (typeof enemyState.hp === "number") enemy.health = Math.max(0, enemyState.hp);
            if (typeof enemyState.maxHp === "number") enemy.maxHealth = enemyState.maxHp;
          }
        }
        
        // 移除已死亡的敵人（室長端已標記為刪除的敵人）
        const aliveEnemyIds = new Set(payload.enemies.map(e => e.id).filter(id => id));
        for (let i = Game.enemies.length - 1; i >= 0; i--) {
          const enemy = Game.enemies[i];
          if (enemy && enemy.id && !aliveEnemyIds.has(enemy.id)) {
            // 室長端已刪除此敵人，客戶端也應該刪除
            enemy.markedForDeletion = true;
          }
        }
      }
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
            name: `玩家-${_uid.slice(0, 4)}`,
            characterId: hostCharacterId, // 添加角色ID，用於隊員端渲染完整角色外觀
            // 大招狀態同步
            isUltimateActive: p.isUltimateActive || false,
            ultimateImageKey: p._ultimateImageKey || null,
            ultimateEndTime: p.ultimateEndTime || 0,
            width: p.width || CONFIG.PLAYER.SIZE,
            height: p.height || CONFIG.PLAYER.SIZE,
            collisionRadius: p.collisionRadius || (CONFIG.PLAYER.SIZE / 2)
          };
        }
      } catch (_) {}

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
      } catch (_) {}

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
      } catch (_) {}

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
      } catch (_) {}

      // 收集敵人狀態（用於客戶端同步）
      try {
        if (typeof Game !== "undefined" && Array.isArray(Game.enemies)) {
          for (const enemy of Game.enemies) {
            if (enemy && !enemy.markedForDeletion) {
              snapshot.enemies.push({
                id: enemy.id || `enemy_${Date.now()}_${Math.random()}`,
                type: enemy.type || "UNKNOWN",
                x: enemy.x || 0,
                y: enemy.y || 0,
                hp: enemy.health || 0,
                maxHp: enemy.maxHealth || 0
              });
            }
          }
        }
      } catch (_) {}

      return snapshot;
    } catch (_) {
      return null;
    }
  }

  // M2：更新遠程玩家（僅室長端調用）
  function updateRemotePlayers(deltaTime) {
    if (!_isHost) return;
    try {
      RemotePlayerManager.updateAll(deltaTime);
      const now = Date.now();
      
      // 定期廣播遠程玩家位置（10Hz，用於即時顯示）
      if (now - lastSendAt >= 100) {
        lastSendAt = now;
        const remoteStates = RemotePlayerManager.getAllStates();
        const players = {};
        // 加上 host 自己
        try {
          if (typeof Game !== "undefined" && Game.player) {
            const hostMember = _membersState ? _membersState.get(_uid) : null;
            const hostCharacterId = (hostMember && hostMember.characterId) ? hostMember.characterId : (Game.selectedCharacter && Game.selectedCharacter.id) ? Game.selectedCharacter.id : null;
            players[_uid] = { 
              x: Game.player.x, 
              y: Game.player.y, 
              name: `玩家-${_uid.slice(0, 4)}`,
              characterId: hostCharacterId // 添加角色ID
            };
          }
        } catch (_) {}
        // 加上所有遠程玩家
        for (const [uid, state] of Object.entries(remoteStates)) {
          const member = _membersState ? _membersState.get(uid) : null;
          const name = (member && typeof member.name === "string") ? member.name : uid.slice(0, 6);
          const characterId = (member && member.characterId) ? member.characterId : null;
          players[uid] = { 
            x: state.x, 
            y: state.y, 
            name: name,
            characterId: characterId // 添加角色ID
          };
        }
        // 廣播給所有 client
        for (const [uid, it] of _pcsHost.entries()) {
          const ch = (it && it.channel) ? it.channel : null;
          _sendToChannel(ch, { t: "state", players });
        }
      }

      // M3：定期發送完整狀態快照（約 3.3Hz，用於收斂一致性）
      if (now - lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
        lastSnapshotAt = now;
        const snapshot = collectSnapshot();
        if (snapshot) {
          // 廣播快照給所有 client
          for (const [uid, it] of _pcsHost.entries()) {
            const ch = (it && it.channel) ? it.channel : null;
            _sendToChannel(ch, { t: "snapshot", ...snapshot });
          }
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

  // 客戶端發送消息到室長端
  function sendToNet(obj) {
    if (!obj) return;
    if (_isHost) {
      // host 本地：直接合成 state 並發給 client（避免 host 也要走 dc）
      if (obj.t === "pos") {
        const x = obj.x, y = obj.y;
        const players = {};
        const hostMember = _membersState ? _membersState.get(_uid) : null;
        const hostCharacterId = (hostMember && hostMember.characterId) ? hostMember.characterId : (typeof Game !== "undefined" && Game.selectedCharacter && Game.selectedCharacter.id) ? Game.selectedCharacter.id : null;
        const hostPlayer = (typeof Game !== "undefined" && Game.player) ? Game.player : null;
        players[_uid] = { 
          x, 
          y, 
          name: `玩家-${_uid.slice(0, 4)}`,
          characterId: hostCharacterId,
          // 大招狀態同步
          isUltimateActive: (hostPlayer && hostPlayer.isUltimateActive) || false,
          ultimateImageKey: (hostPlayer && hostPlayer._ultimateImageKey) || null,
          ultimateEndTime: (hostPlayer && hostPlayer.ultimateEndTime) || 0,
          width: (hostPlayer && hostPlayer.width) || null,
          height: (hostPlayer && hostPlayer.height) || null,
          collisionRadius: (hostPlayer && hostPlayer.collisionRadius) || null
        };
        // 加上目前已知 remote（host 看得到）
        for (const p of Runtime.getRemotePlayers()) {
          const member = _membersState ? _membersState.get(p.uid) : null;
          const characterId = (member && member.characterId) ? member.characterId : (p.characterId) ? p.characterId : null;
          players[p.uid] = { 
            x: p.x, 
            y: p.y, 
            name: p.name,
            characterId: characterId,
            // 大招狀態同步
            isUltimateActive: (typeof p.isUltimateActive === "boolean") ? p.isUltimateActive : false,
            ultimateImageKey: (typeof p.ultimateImageKey === "string" && p.ultimateImageKey) ? p.ultimateImageKey : null,
            ultimateEndTime: (typeof p.ultimateEndTime === "number") ? p.ultimateEndTime : 0,
            width: (typeof p.width === "number" && p.width > 0) ? p.width : null,
            height: (typeof p.height === "number" && p.height > 0) ? p.height : null,
            collisionRadius: (typeof p.collisionRadius === "number" && p.collisionRadius > 0) ? p.collisionRadius : null
          };
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

  return { setEnabled, onStateMessage, onEventMessage, onSnapshotMessage, onFullSnapshotMessage, tick, getRemotePlayers, updateRemotePlayers, clearRemotePlayers, broadcastEvent: broadcastEventFromRuntime, sendToNet };
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
    // M5：隊員重新連接時，請求室長發送全量快照
    if (!_isHost && typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
      // 發送重連請求
      try {
        _sendToChannel(_dc, { t: "reconnect_request" });
      } catch (_) {}
    }
  };
  _dc.onclose = () => {
    Runtime.setEnabled(false);
    _setText("survival-online-status", "連線已中斷");
    // M5：檢測室長斷線（僅在遊戲進行中）
    if (!_isHost && typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
      // 室長斷線：自動返回大廳
      console.log("[SurvivalOnline] M5: 室長斷線，返回大廳");
      _setText("survival-online-status", "室長斷線，返回大廳");
      setTimeout(() => {
        try {
          if (typeof Game !== "undefined" && Game.gameOver) {
            Game.gameOver(); // 觸發遊戲結束
          }
        } catch (_) {}
        leaveRoom().catch(() => {});
        closeLobbyToSelect();
      }, 1000);
    }
  };
  _dc.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.t === "state") {
        Runtime.onStateMessage(msg);
      } else if (msg.t === "event") {
        // M2：處理室長廣播的事件
        Runtime.onEventMessage(msg);
      } else if (msg.t === "snapshot") {
        // M3：處理室長廣播的狀態快照
        Runtime.onSnapshotMessage(msg);
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
      // M5：檢測室長斷線（僅在遊戲進行中）
      if (!_isHost && typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
        console.log("[SurvivalOnline] M5: 與室長連接失敗，返回大廳");
        _setText("survival-online-status", "與室長連接失敗，返回大廳");
        setTimeout(() => {
          try {
            if (typeof Game !== "undefined" && Game.gameOver) {
              Game.gameOver();
            }
          } catch (_) {}
          leaveRoom().catch(() => {});
          closeLobbyToSelect();
        }, 1000);
      }
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
      // M5：隊員重新連接時，室長發送全量快照
      if (_isHost && typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
        // 延遲一小段時間確保連接穩定
        setTimeout(() => {
          sendFullSnapshotToClient(fromUid);
        }, 500);
      }
    };
    channel.onclose = () => {
      updateLobbyUI();
      // M5：檢測斷線（僅在遊戲進行中）
      if (_isHost && typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
        // 標記該隊員為斷線（但不立即移除，等待重連）
        console.log(`[SurvivalOnline] M5: 隊員 ${fromUid} 斷線`);
      }
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
    if (st === "failed" || st === "disconnected") {
      // M5：檢測連接失敗或斷線
      updateLobbyUI();
      // 如果是室長且遊戲進行中，通知所有隊員
      if (_isHost && typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
        console.log(`[SurvivalOnline] M5: 與隊員 ${fromUid} 連接失敗`);
      }
      // 如果是隊員且遊戲進行中，檢測室長斷線
      if (!_isHost && typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
        if (st === "disconnected" || st === "failed") {
          console.log("[SurvivalOnline] M5: 與室長連接失敗，返回大廳");
          _setText("survival-online-status", "與室長連接失敗，返回大廳");
          setTimeout(() => {
            try {
              if (typeof Game !== "undefined" && Game.gameOver) {
                Game.gameOver();
              }
            } catch (_) {}
            leaveRoom().catch(() => {});
            closeLobbyToSelect();
          }, 1000);
        }
      }
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
    } catch (_) {}
    
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
    } catch (_) {}
    
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
    } catch (_) {}
    
    // 發送給指定隊員
    const it = _pcsHost.get(targetUid);
    if (it && it.channel) {
      _sendToChannel(it.channel, fullSnapshot);
      console.log(`[SurvivalOnline] M5: 已發送全量快照給隊員 ${targetUid}`);
    }
  } catch (e) {
    console.warn("[SurvivalOnline] M5: 發送全量快照失敗:", e);
  }
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
  if (msg.t === "reconnect_request") {
    // M5：隊員請求全量快照（重連恢復）
    if (_isHost && typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
      sendFullSnapshotToClient(fromUid);
    }
    return;
  } else if (msg.t === "pos") {
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
        const hostMember = _membersState ? _membersState.get(_uid) : null;
        const hostCharacterId = (hostMember && hostMember.characterId) ? hostMember.characterId : (Game.selectedCharacter && Game.selectedCharacter.id) ? Game.selectedCharacter.id : null;
        players[_uid] = { 
          x: Game.player.x, 
          y: Game.player.y, 
          name: `玩家-${_uid.slice(0, 4)}`,
          characterId: hostCharacterId // 添加角色ID
        };
      }
    } catch (_) {}
    // 已知其他人（Runtime 內 + 這次）
    for (const p of Runtime.getRemotePlayers()) {
      const member = _membersState ? _membersState.get(p.uid) : null;
      const characterId = (member && member.characterId) ? member.characterId : (p.characterId) ? p.characterId : null;
      players[p.uid] = { 
        x: p.x, 
        y: p.y, 
        name: p.name,
        characterId: characterId // 添加角色ID
      };
    }
    const fromMember = _membersState ? _membersState.get(fromUid) : null;
    const fromCharacterId = (fromMember && fromMember.characterId) ? fromMember.characterId : null;
    players[fromUid] = { 
      x, 
      y, 
      name: name,
      characterId: fromCharacterId // 添加角色ID
    };

    // 廣播給所有 client
    for (const [uid, it] of _pcsHost.entries()) {
      const ch = (it && it.channel) ? it.channel : null;
      _sendToChannel(ch, { t: "state", players });
    }
    return;
  }
  if (msg.t === "ultimate_pineapple") {
    // 客戶端使用鳳梨大絕：為遠程玩家生成掉落物
    if (!_isHost) return;
    const x = typeof msg.x === "number" ? msg.x : 0;
    const y = typeof msg.y === "number" ? msg.y : 0;
    
    // 找到對應的遠程玩家（應該是鳳梨角色）
    const remotePlayer = RemotePlayerManager.get(fromUid);
    if (remotePlayer && remotePlayer._remoteCharacter && remotePlayer._remoteCharacter.id === 'pineapple') {
      // 為遠程玩家生成鳳梨掉落物
      const count = 5;
      const minD = 200;
      const maxD = 800;
      const flyDurationMs = 600;
      const worldW = (typeof Game !== "undefined" && Game.worldWidth) ? Game.worldWidth : 1280;
      const worldH = (typeof Game !== "undefined" && Game.worldHeight) ? Game.worldHeight : 720;
      
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = minD + Math.random() * (maxD - minD);
        let tx = x + Math.cos(ang) * dist;
        let ty = y + Math.sin(ang) * dist;
        // 以 A45(53x100) 尺寸做邊界裁切
        tx = Math.max(53 / 2, Math.min(tx, worldW - 53 / 2));
        ty = Math.max(100 / 2, Math.min(ty, worldH - 100 / 2));
        
        try {
          if (typeof Game !== "undefined" && typeof Game.spawnPineappleUltimatePickup === "function") {
            Game.spawnPineappleUltimatePickup(tx, ty, { spawnX: x, spawnY: y, expValue: 0, flyDurationMs });
          }
        } catch (_) {}
      }
    }
    return;
  }
  
  if (msg.t === "weapon_upgrade") {
    // 客戶端選擇武器升級：同步到室長端的遠程玩家
    if (!_isHost) return;
    const weaponType = typeof msg.weaponType === "string" ? msg.weaponType : null;
    if (!weaponType) return;
    
    // 找到對應的遠程玩家
    const remotePlayer = RemotePlayerManager.get(fromUid);
    if (remotePlayer && typeof remotePlayer.addWeapon === "function") {
      try {
        // 檢查是否已有此武器
        const existingWeapon = remotePlayer.weapons.find(w => w && w.type === weaponType);
        if (existingWeapon) {
          // 如果已有此武器，則升級
          if (typeof remotePlayer.upgradeWeapon === "function") {
            remotePlayer.upgradeWeapon(weaponType);
          }
        } else {
          // 否則添加新武器
          remotePlayer.addWeapon(weaponType);
        }
      } catch (e) {
        console.warn("[SurvivalOnline] 同步武器升級失敗:", e);
      }
    }
    return;
  }
  
  if (msg.t === "enemy_damage") {
    // 隊員的投射物攻擊敵人：同步傷害到隊長端
    if (!_isHost) return;
    const enemyId = typeof msg.enemyId === "string" ? msg.enemyId : null;
    const damage = typeof msg.damage === "number" ? Math.max(0, msg.damage) : 0;
    const weaponType = typeof msg.weaponType === "string" ? msg.weaponType : "UNKNOWN";
    const isCrit = (msg.isCrit === true);
    const playerUid = typeof msg.playerUid === "string" ? msg.playerUid : fromUid; // 發送傷害的玩家UID
    
    if (!enemyId || damage <= 0) return;
    
    // 找到對應的敵人
    try {
      if (typeof Game !== "undefined" && Array.isArray(Game.enemies)) {
        const enemy = Game.enemies.find(e => e && e.id === enemyId);
        if (enemy && !enemy.markedForDeletion && !enemy.isDying) {
          // 對敵人造成傷害（使用 DamageSystem 計算，但這裡已經計算過了，直接應用）
          // 注意：這裡不重新計算傷害，因為隊員端已經計算過了（包括爆擊）
          // 傳遞 playerUid 和 isCrit 以便 enemy.takeDamage 可以廣播傷害數字
          enemy.takeDamage(damage, { 
            weaponType: weaponType,
            playerUid: playerUid,
            isCrit: isCrit,
            dirX: 0,
            dirY: -1
          });
          
          // 顯示傷害數字（隊長端）
          if (typeof DamageNumbers !== "undefined" && typeof DamageNumbers.show === "function") {
            DamageNumbers.show(damage, enemy.x, enemy.y - (enemy.height || 0) / 2, isCrit, { 
              dirX: 0, 
              dirY: -1, 
              enemyId: enemyId 
            });
          }
        }
      }
    } catch (e) {
      console.warn("[SurvivalOnline] 同步敵人傷害失敗:", e);
    }
    return;
  }
  
  if (msg.t === "input") {
    // M4：將輸入套用到遠程玩家（完整的 Player 對象）
    if (!_isHost) return;
    const mx = typeof msg.mx === "number" ? msg.mx : 0;
    const my = typeof msg.my === "number" ? msg.my : 0;
    
    // 獲取或創建遠程玩家對象（完整的 Player）
    try {
      // 嘗試從 Game 獲取世界中心作為起始位置
      let startX = 1920;
      let startY = 1080;
      if (typeof Game !== "undefined") {
        if (Game.worldWidth && Game.worldHeight) {
          startX = Game.worldWidth / 2;
          startY = Game.worldHeight / 2;
        } else if (Game.player) {
          startX = Game.player.x;
          startY = Game.player.y;
        }
      }
      // 獲取成員的角色ID
      const member = _membersState ? _membersState.get(fromUid) : null;
      const characterId = (member && member.characterId) ? member.characterId : null;
      const remotePlayer = RemotePlayerManager.getOrCreate(fromUid, startX, startY, characterId);
      if (remotePlayer) {
        // M4：直接設置移動方向（Player.update 會處理移動）
        // 創建一個臨時的 Input 對象來模擬輸入
        if (!remotePlayer._remoteInput) {
          remotePlayer._remoteInput = { x: 0, y: 0 };
        }
        remotePlayer._remoteInput.x = mx;
        remotePlayer._remoteInput.y = my;
        remotePlayer._lastRemoteInputTime = Date.now();
      }
    } catch (e) {
      console.warn("[SurvivalOnline] M4 輸入處理失敗:", e);
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
      const hostMember = _membersState ? _membersState.get(_uid) : null;
      const hostCharacterId = (hostMember && hostMember.characterId) ? hostMember.characterId : (typeof Game !== "undefined" && Game.selectedCharacter && Game.selectedCharacter.id) ? Game.selectedCharacter.id : null;
      const hostPlayer = (typeof Game !== "undefined" && Game.player) ? Game.player : null;
      players[_uid] = { 
        x, 
        y, 
        name: `玩家-${_uid.slice(0, 4)}`,
        characterId: hostCharacterId,
        // 大招狀態同步
        isUltimateActive: (hostPlayer && hostPlayer.isUltimateActive) || false,
        ultimateImageKey: (hostPlayer && hostPlayer._ultimateImageKey) || null,
        ultimateEndTime: (hostPlayer && hostPlayer.ultimateEndTime) || 0,
        width: (hostPlayer && hostPlayer.width) || null,
        height: (hostPlayer && hostPlayer.height) || null,
        collisionRadius: (hostPlayer && hostPlayer.collisionRadius) || null
      };
      // 加上目前已知 remote（host 看得到）
      for (const p of Runtime.getRemotePlayers()) {
        const member = _membersState ? _membersState.get(p.uid) : null;
        const characterId = (member && member.characterId) ? member.characterId : (p.characterId) ? p.characterId : null;
        players[p.uid] = { 
          x: p.x, 
          y: p.y, 
          name: p.name,
          characterId: characterId,
          // 大招狀態同步
          isUltimateActive: (typeof p.isUltimateActive === "boolean") ? p.isUltimateActive : false,
          ultimateImageKey: (typeof p.ultimateImageKey === "string" && p.ultimateImageKey) ? p.ultimateImageKey : null,
          ultimateEndTime: (typeof p.ultimateEndTime === "number") ? p.ultimateEndTime : 0,
          width: (typeof p.width === "number" && p.width > 0) ? p.width : null,
          height: (typeof p.height === "number" && p.height > 0) ? p.height : null,
          collisionRadius: (typeof p.collisionRadius === "number" && p.collisionRadius > 0) ? p.collisionRadius : null
        };
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


