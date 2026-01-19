// ??璅∪?蝯?嚗葫閰衣?嚗?// ?格?嚗?// - ???璅∪?瘚?銝剖??剁?銝蔣?踹隞芋撘?
// - 雿輻 Firebase嚗???+ Firestore嚗? signaling / ?輸?憭批輒
// - 雿輻 WebSocket ???券脰???豢??唾撓嚗?霅琿蝘?銝??IP
// - ??摰??鈭箏?甇伐??拙振雿蔭???鈭箝??賣???
//
// 摰/?梁??酉嚗?// - apiKey 銝撖Ⅳ嚗?祇?嚗? Firestore 閬????亙??迤蝣箄身摰誑?踹?鋡急翰?具?// - ??嚗irebase 銝剔匱???IP嚗?甇支蝙??WebSocket ???其葉蝜潘?銝?脩摰?IP ?啣???// - ????脫?? WebSocket ???其葉蝜潘?銝?脩摰?IP ?啣???// - WebSocket ???剁?ws.yiyuss-ws.com:8080嚗ultr VPS嚗撱綽?雿輻 Let's Encrypt 霅嚗?//
// 蝬剛風?酉嚗?// - 銝耨??SaveCode/localStorage 蝯?嚗??啣?隞颱??脣撘匱蝣潛?摮?甈???
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

// 雿? Firebase Web 閮剖?嚗雿輻??靘?
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCjAVvO_zSTy6XYzPPibioDpvmBZTlW-s4",
  authDomain: "github-e71d1.firebaseapp.com",
  projectId: "github-e71d1",
  storageBucket: "github-e71d1.firebasestorage.app",
  messagingSenderId: "513407424654",
  appId: "1:513407424654:web:95d3246d5afeb6dccd11df",
};

// WebSocket ???券?蝵殷?雿輻 WSS 隞交??HTTPS ?嚗?const WEBSOCKET_SERVER_URL = "wss://ws.yiyuss-ws.com:8080";

const MAX_PLAYERS = 5;
const ROOM_TTL_MS = 1000 * 60 * 60; // 1撠?嚗??冽?垢皜??內嚗?甇???閬?/鈭箇嚗?const MEMBER_HEARTBEAT_MS = 15000; // 15s嚗??lastSeenAt嚗?????瑞?畾?嚗?const MEMBER_STALE_MS = 45000; // 45s嚗????粹蝺?畾?
const START_COUNTDOWN_MS = 3000; // M1嚗?憪嚗??starting 敺嚗?
// ?拙振?迂撽?????const PLAYER_NAME_MAX_LENGTH = 5; // ?憭折摨佗?5??蝚佗?銝剜?摮???摮?
const PLAYER_NAME_MIN_LENGTH = 1; // ?撠摨?const PLAYER_NAME_STORAGE_KEY = "survival_player_nickname"; // localStorage ?萄?

// ?迂撽??????// ???嚗?~5??蝚佗?銝剜?摮???摮?嚗鈭文??剝?嚗??賣??嗡?(靘?蝛箇?萸泵??
function sanitizePlayerName(name) {
  if (!name || typeof name !== "string") return null;

  // 蝘駁擐偏蝛箇
  name = name.trim();

  // 瑼Ｘ?瑕漲嚗?~5??蝚?  if (name.length < PLAYER_NAME_MIN_LENGTH || name.length > PLAYER_NAME_MAX_LENGTH) {
    return null;
  }

  // ?芸?閮曹葉??????摮?  // 銝剜?摮?\u4e00-\u9fff嚗JK蝯曹?瞍Ｗ?嚗?  // ?望?摮?a-zA-Z
  // ?詨?嚗?-9
  const validPattern = /^[\u4e00-\u9fffa-zA-Z0-9]+$/;
  if (!validPattern.test(name)) {
    return null;
  }

  // 蝘駁?梢摮泵嚗TML 璅惜??祉?嚗? ?撌脩???甇??撽?嚗??箔?摰?蝘駁
  name = name.replace(/[<>\"'&]/g, "");

  // 蝘駁?批摮泵
  name = name.replace(/[\x00-\x1F\x7F]/g, "");

  // ?活瑼Ｘ?瑕漲嚗宏?文?蝚血??航霈嚗?  if (name.length < PLAYER_NAME_MIN_LENGTH) {
    return null;
  }

  return name;
}

// ?脣??拙振?梁迂嚗? localStorage ????隤潘?
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

  // 憒?瘝?靽??蝔望?撽?憭望?嚗???隤?  return `?拙振-${_uid ? _uid.slice(0, 4) : "0000"}`;
}

// 靽??拙振?梁迂??localStorage
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

// ?輸????let _activeRoomId = null;
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
let _ws = null; // WebSocket ??
let _wsReconnectAttempts = 0; // ???閰行活??
// ?芸??????let _reconnectAttempts = 0;
let _reconnectTimer = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000; // 3 蝘?
// M4嚗恕?瑞垢???拙振蝞∠?嚗??渡? Player 撠情嚗?湔郎?典??圈洛嚗?const RemotePlayerManager = (() => {
  const remotePlayers = new Map(); // uid -> Player

  // M4嚗蝙?典??渡? Player 憿????舐陛?? RemotePlayer嚗?  // ?見???拙振銋?郎?具??瑕拿???撽?
  function getOrCreate(uid, startX, startY, characterId, talentLevels = null) {
    // ?脫迫?萄遣?芸楛??蝔摰塚??蝡臭??府?萄遣?芸楛??蝔摰塚?
    if (typeof window !== "undefined" && window.SurvivalOnlineRuntime) {
      const rt = window.SurvivalOnlineRuntime;
      if (rt._uid && uid === rt._uid) {
        console.warn(`[SurvivalOnline] RemotePlayerManager.getOrCreate: ?岫?萄遣?芸楛??蝔摰?${uid}嚗歲?);
        return null;
      }
    }

    const existingPlayer = remotePlayers.get(uid);

    // 憒????拙振撌脣??剁?瑼Ｘ閫?臬?閬?堆????????踹?敶梢??脰?銝剔??拙振嚗?    if (existingPlayer && characterId) {
      const currentCharId = (existingPlayer._remoteCharacter && existingPlayer._remoteCharacter.id) ? existingPlayer._remoteCharacter.id : null;
      // 憒?閫ID銝?嚗??撠??嚗?瑼Ｘ Game.multiplayer.enabled ??Game.isPaused 蝑???
      // 瘜冽?嚗ㄐ?芣炎?亥??淌D?臬霈?嚗?撘瑕?湔嚗??粹??脤脰?銝凋??府??閫嚗?      if (currentCharId !== characterId) {
        // ?芣??券??脣??芰?甇??憪???啗??莎?靘?嚗??函??之撱喉?
        const isGameActive = (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled && !Game.isPaused && !Game.isGameOver);
        if (!isGameActive) {
          // ?湔閫嚗??唳??刻??脣惇?批?憭抵釵嚗?          try {
            if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS) {
              const char = CONFIG.CHARACTERS.find(c => c && c.id === characterId);
              if (char) {
                existingPlayer._remoteCharacter = char;
                // ??閫撅祆?                const baseMax = (typeof CONFIG !== "undefined" && CONFIG.PLAYER && CONFIG.PLAYER.MAX_HEALTH) ? CONFIG.PLAYER.MAX_HEALTH : 100;
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

                // ??憭抵釵??
                if (talentLevels && typeof talentLevels === "object") {
                  if (typeof BuffSystem !== "undefined" && BuffSystem.applyBuffsFromTalentLevels) {
                    BuffSystem.applyBuffsFromTalentLevels(existingPlayer, talentLevels);
                  }
                }
              }
            }
          } catch (e) {
            console.warn("[SurvivalOnline] ?湔???拙振閫憭望?:", e);
          }
        }
      }
      return existingPlayer;
    }

    // ?萄遣?啁????拙振
    if (!existingPlayer) {
      try {
        // ?萄遣摰??Player 撠情
        if (typeof Player !== "undefined") {
          const player = new Player(startX || 0, startY || 0);
          // 璅??粹?蝔摰塚??冽???啁摰塚?
          player._isRemotePlayer = true;
          player._remoteUid = uid;
          // 閮剔蔭閫嚗???靘?
          if (characterId && typeof CONFIG !== "undefined" && CONFIG.CHARACTERS) {
            const char = CONFIG.CHARACTERS.find(c => c && c.id === characterId);
            if (char) {
              player._remoteCharacter = char;
              // ?閫撅祆改?銵?漲蝑?
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

              // ?憭抵釵??嚗蝙?刻府?拙振?芸楛?予鞈衣?蝝????舀?啣予鞈行??
              try {
                if (talentLevels && typeof talentLevels === "object") {
                  // 雿輻???拙振?予鞈衣?蝝?                  if (typeof BuffSystem !== "undefined" && BuffSystem.applyBuffsFromTalentLevels) {
                    BuffSystem.applyBuffsFromTalentLevels(player, talentLevels);
                  } else {
                    // 敺??寞?嚗???TalentSystem.getTalentLevel 靘蝙?券?蝔摰嗥?憭抵釵
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
                    // ?Ｗ儔???賣
                    if (originalGetTalentLevel && typeof TalentSystem !== "undefined") {
                      TalentSystem.getTalentLevel = originalGetTalentLevel;
                    }
                  }
                } else {
                  // 憒?瘝???憭抵釵蝑?嚗蝙?冽?啣予鞈佗????澆捆嚗?                  if (typeof TalentSystem !== "undefined" && typeof TalentSystem.applyTalentEffects === "function") {
                    TalentSystem.applyTalentEffects(player);
                  } else if (typeof applyTalentEffects === "function") {
                    applyTalentEffects(player);
                  }
                }
              } catch (e) {
                console.warn("[SurvivalOnline] ???拙振?憭抵釵憭望?:", e);
              }
            }
          }
          // 撠?蝔摰嗆溶? Game.remotePlayers嚗????剁??踹???瘛餃?嚗?          if (typeof Game !== "undefined") {
            if (!Game.remotePlayers) Game.remotePlayers = [];
            // 瑼Ｘ?臬撌脩?摮嚗??銴溶??
            const existingIndex = Game.remotePlayers.findIndex(p => p && p._remoteUid === uid);
            if (existingIndex >= 0) {
              // 憒?撌脣??剁??踵?摰??踹???嚗?              Game.remotePlayers[existingIndex] = player;
            } else {
              // 憒?銝??剁??溶??              Game.remotePlayers.push(player);
            }
          }
          remotePlayers.set(uid, player);
          return player;
        }
      } catch (e) {
        console.warn("[SurvivalOnline] M4 ?萄遣???拙振憭望?:", e);
      }
      return null;
    }

    return existingPlayer;
  }

  function remove(uid) {
    const player = remotePlayers.get(uid);
    if (player) {
      // 敺?Game.remotePlayers 銝剔宏??      try {
        if (typeof Game !== "undefined" && Array.isArray(Game.remotePlayers)) {
          const idx = Game.remotePlayers.indexOf(player);
          if (idx >= 0) Game.remotePlayers.splice(idx, 1);
        }
      } catch (_) { }
      // 皜??拙振?郎??      try {
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
        // M4嚗蝙?典??渡? Player.update嚗??祆郎?冽?啜?銵蝑?        // 瘜冽?嚗香鈭⊥? update() ??歲?宏??甇血?湔嚗??敺拇暑?摩

        // ??璅?????嚗蝙?券漲憭?葫雿蔭嚗?嗅?啁?????
        if (player._isRemotePlayer && player._velocityX !== undefined && player._velocityY !== undefined) {
          const now = Date.now();
          const timeSinceLastState = Math.max(0, now - (player._lastStateTime || now));
          // ?芸?剜??雿輻?漲憭嚗????葫撠?航炊嚗?          if (timeSinceLastState < 100 && (Math.abs(player._velocityX) > 0.1 || Math.abs(player._velocityY) > 0.1)) {
            const extrapolationFactor = Math.min(1.0, timeSinceLastState / 50); // ?憭???0ms
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
          // 甇颱滿?儔瘣餌???          _isDead: (typeof player._isDead === "boolean") ? player._isDead : false,
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
    // 皜????蝔摰?    for (const [uid, player] of remotePlayers.entries()) {
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
  let _tickCalled = false; // ?其?霂
  const remotePlayers = new Map(); // uid -> { x, y, name, updatedAt }

  function setEnabled(v) {
    const wasEnabled = enabled;
    enabled = !!v;
    console.log(`[SurvivalOnline] Runtime.setEnabled(${v}), wasEnabled=${wasEnabled}, nowEnabled=${enabled}, isHost=${_isHost}`);
    if (!enabled) {
      remotePlayers.clear();
      console.log(`[SurvivalOnline] Runtime.setEnabled: 撌脫??日?蝔摰嗅?銵灼);
    }
  }

  function onStateMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.t !== "state") return;
    if (!enabled) {
      console.warn("[SurvivalOnline] onStateMessage: Runtime?芸??剁?敹賜?????);
      return;
    }
    const now = Date.now();
    const players = payload.players || {};

    console.log(`[SurvivalOnline] onStateMessage: ?嗅????荔??拙振?賊?=${Object.keys(players).length}, enabled=${enabled}, isHost=${_isHost}`);

    // ??垢嚗??祇??瑕??嚗??寞??交?啁???撱??湔???拙振撠情
    for (const [uid, p] of Object.entries(players)) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") {
        console.warn(`[SurvivalOnline] onStateMessage: 頝喲??⊥??拙振 ${uid}`, p);
        continue;
      }
      if (_uid && uid === _uid) {
        console.log(`[SurvivalOnline] onStateMessage: 頝喲??芸楛 ${uid}`);
        continue; // 銝??撌?      }

      // ?脣???豢?嚗??淌D?予鞈衣?蝝?摮?- ?芸?敺????舐???嗆活敺?_membersState ?脣?
      const member = _membersState ? _membersState.get(uid) : null;
      const characterId = ((typeof p.characterId === "string") ? p.characterId : null) || (member && member.characterId) || null;
      const talentLevels = (member && member.talentLevels) ? member.talentLevels : null;
      // ??靽桀儔嚗?蝢?playerName 霈?嚗Ⅱ靽雿??舐嚗?      const playerName = (typeof p.name === "string" && p.name.trim()) ? p.name : (member && typeof member.name === "string" && member.name.trim()) ? member.name : uid.slice(0, 6);

      console.log(`[SurvivalOnline] onStateMessage: ???拙振 ${uid}, 雿蔭=(${p.x}, ${p.y}), characterId=${characterId}, name=${playerName}`);

      // ?萄遣??圈?蝔摰嗅?鞊?      try {
        if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.getOrCreate === "function") {
          const remotePlayer = RemotePlayerManager.getOrCreate(uid, p.x, p.y, characterId, talentLevels);
          if (remotePlayer) {
            console.log(`[SurvivalOnline] onStateMessage: ???萄遣/?湔???拙振 ${uid}`);
            // ??靽桀儔嚗?摮?摮???拙振撠情嚗Ⅱ靽鼓鋆賣??賜?甇?Ⅱ??摮?
            remotePlayer._remotePlayerName = playerName;
            // ??璅?????蝘餃??郊嚗蝙?券漲憭 + 撟單???            // ??????嚗??砌???0MB???嚗?璅???
            const targetX = p.x;
            const targetY = p.y;
            if (typeof targetX === "number" && typeof targetY === "number") {
              const dx = targetX - remotePlayer.x;
              const dy = targetY - remotePlayer.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              // ???漲餈質馱
              if (!remotePlayer._lastStateTime) {
                remotePlayer._lastStateTime = now;
                remotePlayer._lastStateX = targetX;
                remotePlayer._lastStateY = targetY;
                remotePlayer._velocityX = 0;
                remotePlayer._velocityY = 0;
              }

              // 憒?頝敺之嚗?亥歲頧?蝬脩窗撱園?????
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
                // ??璅???嚗?蝞漲銝虫蝙?券漲憭
                const timeDelta = Math.max(1, now - remotePlayer._lastStateTime); // 瘥怎?
                const newVelocityX = (targetX - remotePlayer._lastStateX) / timeDelta * 1000; // ??/蝘?                const newVelocityY = (targetY - remotePlayer._lastStateY) / timeDelta * 1000;

                // 撟單??漲嚗???嗉???
                const velocityLerp = 0.3; // ?漲撟單?靽
                remotePlayer._velocityX = remotePlayer._velocityX * (1 - velocityLerp) + newVelocityX * velocityLerp;
                remotePlayer._velocityY = remotePlayer._velocityY * (1 - velocityLerp) + newVelocityY * velocityLerp;

                // ??璅???嚗蝙?典?撠??潔??賂?0.1-0.2嚗?霈宏??湔??憌?                // ????????皞?瘜?                const lerpFactor = Math.min(0.2, Math.max(0.1, distance / 50)); // 敺????潔???                remotePlayer.x = remotePlayer.x + (targetX - remotePlayer.x) * lerpFactor;
                remotePlayer.y = remotePlayer.y + (targetY - remotePlayer.y) * lerpFactor;

                // ?湔??蕭頩?                remotePlayer._lastStateTime = now;
                remotePlayer._lastStateX = targetX;
                remotePlayer._lastStateY = targetY;
              } else {
                // 頝敺?嚗?亥身蝵殷??踹?敺桀???嚗?                remotePlayer.x = targetX;
                remotePlayer.y = targetY;
                remotePlayer._velocityX = 0;
                remotePlayer._velocityY = 0;
                remotePlayer._lastStateTime = now;
                remotePlayer._lastStateX = targetX;
                remotePlayer._lastStateY = targetY;
              }
            }
            // ??靽桀儔嚗?啣隞???蝣箔?銵?迤蝣箏?甇伐?
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
            // ??MMORPG ?嗆?嚗?甇亦摰嗆???蝣箔????拙振??甇?Ⅱ嚗?            if (typeof p.facingRight === "boolean") remotePlayer.facingRight = p.facingRight;
            if (typeof p.facingAngle === "number") remotePlayer.facingAngle = p.facingAngle;

            // ??MMORPG ?嗆?嚗?甇亦摰嗅??瑞?????蝣箔???摰園?賜??啣隞摰嗅??瑞?閬死??嚗?            if (typeof p.hitFlashTime === "number" && p.hitFlashTime > 0) {
              remotePlayer.hitFlashTime = p.hitFlashTime;
              // 閫貊蝪∪?????券?蝔摰?GIF 銝??函??脣?????摨?              try {
                if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.flash === 'function') {
                  const remotePlayerId = `remote-player-${uid}`;
                  window.GifOverlay.flash(remotePlayerId, { color: '#ff0000', durationMs: remotePlayer.hitFlashDuration || 150, opacity: 0.8 });
                }
              } catch (_) { }
            }

            // ??MMORPG ?嗆?嚗?甇亙鈭怎??馳??撽澆?砍?拙振
            // ?馳??撽?曹澈???隞亦?嗡??拙振?脣??馳/蝬????砍?拙振銋?閰脣?甇?            if (typeof p.coins === "number" && typeof Game !== "undefined") {
              // 雿輻?嗡??拙振??撟?????馳?臬鈭怎?嚗?              Game.coins = Math.max(0, Math.floor(p.coins));
              // ?湔?馳憿舐內
              if (typeof UI !== "undefined" && UI.updateCoinsDisplay) {
                UI.updateCoinsDisplay(Game.coins);
              }
            }
            // 蝬??潔??臬鈭怎?嚗?甇亙?砍?拙振
            if (typeof Game !== "undefined" && Game.player && typeof p.exp === "number") {
              Game.player.experience = p.exp;
              if (typeof p.expToNext === "number") {
                Game.player.experienceToNextLevel = p.expToNext;
              }
              if (typeof p.level === "number") {
                Game.player.level = p.level;
              }
            }

            // 蝣箔?閫??甇?Ⅱ閮剔蔭嚗????淌D摮雿??閮剔蔭嚗?            if (characterId && !remotePlayer.spriteImageKey) {
              try {
                if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS) {
                  const char = CONFIG.CHARACTERS.find(c => c && c.id === characterId);
                  if (char && char.spriteImageKey) {
                    remotePlayer.spriteImageKey = char.spriteImageKey;
                    console.log(`[SurvivalOnline] onStateMessage: 閮剔蔭???拙振 ${uid} ???脣?? ${char.spriteImageKey}`);
                  }
                }
              } catch (e) {
                console.warn(`[SurvivalOnline] onStateMessage: 閮剔蔭閫??憭望?:`, e);
              }
            }
          } else {
            console.error(`[SurvivalOnline] onStateMessage: RemotePlayerManager.getOrCreate 餈? null ??undefined for ${uid}`);
          }
        } else {
          console.error(`[SurvivalOnline] onStateMessage: RemotePlayerManager ??getOrCreate 銝?灼);
        }
      } catch (e) {
        console.error(`[SurvivalOnline] ?萄遣/?湔???拙振憭望?:`, e);
      }
    }

    // 靽?雿蔭靽⊥嚗?澆隞??
    for (const [uid, p] of Object.entries(players)) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      if (_uid && uid === _uid) continue; // 銝??撌?      remotePlayers.set(uid, {
        x: p.x,
        y: p.y,
        name: typeof p.name === "string" ? p.name : uid.slice(0, 6),
        characterId: (typeof p.characterId === "string") ? p.characterId : null, // 靽?閫ID
        // 憭扳????甇?        isUltimateActive: (typeof p.isUltimateActive === "boolean") ? p.isUltimateActive : false,
        ultimateImageKey: (typeof p.ultimateImageKey === "string" && p.ultimateImageKey) ? p.ultimateImageKey : null,
        ultimateEndTime: (typeof p.ultimateEndTime === "number") ? p.ultimateEndTime : 0,
        width: (typeof p.width === "number" && p.width > 0) ? p.width : null,
        height: (typeof p.height === "number" && p.height > 0) ? p.height : null,
        collisionRadius: (typeof p.collisionRadius === "number" && p.collisionRadius > 0) ? p.collisionRadius : null,
        // 甇颱滿?儔瘣餌???甇?        _isDead: (typeof p._isDead === "boolean") ? p._isDead : false,
        health: (typeof p.health === "number") ? p.health : 100,
        maxHealth: (typeof p.maxHealth === "number") ? p.maxHealth : 100,
        _resurrectionProgress: (typeof p._resurrectionProgress === "number") ? p._resurrectionProgress : 0,
        updatedAt: now,
      });
    }
    // 皜???嚗?蝺???
    for (const [uid, p] of remotePlayers) {
      if (now - (p.updatedAt || 0) > 8000) {
        remotePlayers.delete(uid);
        // 蝘駁???拙振撠情
        try {
          if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.remove === "function") {
            RemotePlayerManager.remove(uid);
          }
        } catch (_) { }
        // ?梯?撠??IF閬?撅?        try {
          if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.hide === 'function') {
            window.GifOverlay.hide(`remote-player-${uid}`);
          }
        } catch (_) { }
      }
    }
  }

  // M2嚗???隞塚?摰Ｘ蝡舀?嗅恕?瑕誨?剔?鈭辣嚗?  function onEventMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.t !== "event") return;
    const eventType = payload.type;
    const eventData = payload.data || {};

    try {
      // ?寞?鈭辣憿??瑁?頛?璅⊥
      if (eventType === "wave_start") {
        // ???迤?MORPG嚗郭甈⊿?憪?- ?郊瘜Ｘ活????嚗Ⅱ靽??恥?嗥垢?典?銝?????詨??鈭?        if (typeof WaveSystem !== "undefined" && WaveSystem.currentWave !== undefined) {
          const syncedWave = eventData.wave || 1;
          // ???迤?MORPG嚗?蝙??eventData.timestamp嚗? wave_start 鈭辣?喲?嚗??嗆活雿輻 payload.timestamp
          const syncedStartTime = (eventData.timestamp && typeof eventData.timestamp === "number")
            ? eventData.timestamp
            : (payload.timestamp && typeof payload.timestamp === "number")
              ? payload.timestamp
              : Date.now();
          console.log(`[SurvivalOnline] ?郊瘜Ｘ活??: wave=${syncedWave}, startTime=${syncedStartTime}, ?砍??=${Date.now()}, ??撌?${Date.now() - syncedStartTime}ms`);
          WaveSystem.currentWave = syncedWave;
          WaveSystem.waveStartTime = syncedStartTime; // ??雿輻?郊???????舀?唳???          WaveSystem.lastEnemySpawnTime = syncedStartTime; // ???蔭?萎犖????嚗Ⅱ靽?瘜Ｘ活????閮?
          if (typeof UI !== "undefined" && UI.updateWaveInfo) {
            UI.updateWaveInfo(WaveSystem.currentWave);
          }
        }
      } else if (eventType === "enemy_spawn") {
        // 摰Ｘ蝡舐??鈭綽??璈??湛?摰Ｘ蝡臭??府?賜??啣??餅??萎犖嚗?        try {
          if (typeof Game !== "undefined" && typeof Enemy !== "undefined" && eventData.type && eventData.x !== undefined && eventData.y !== undefined) {
            // 瑼Ｘ?臬撌脣??函?D?鈭綽??踹?????嚗?            const enemyId = eventData.id || `enemy_${Date.now()}_${Math.random()}`;
            const existingEnemy = Game.enemies.find(e => e.id === enemyId);
            if (!existingEnemy) {
              const enemy = new Enemy(eventData.x, eventData.y, eventData.type);
              enemy.id = enemyId; // 雿輻摰日蝡舀?靘?ID嚗Ⅱ靽?甇?              Game.enemies.push(enemy);
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] 摰Ｘ蝡舐??鈭箏仃??", e);
        }
      } else if (eventType === "boss_spawn") {
        // ???BOSS嚗??格?銝?湛??銋?閰脰???OSS嚗?        try {
          if (typeof Game !== "undefined" && typeof Enemy !== "undefined" && eventData.type && eventData.x !== undefined && eventData.y !== undefined) {
            const boss = new Enemy(eventData.x, eventData.y, eventData.type);
            boss.id = eventData.id || `boss_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            Game.enemies.push(boss);
            Game.boss = boss; // 閮剔蔭BOSS撘
          }
        } catch (e) {
          console.warn("[SurvivalOnline] ???BOSS憭望?:", e);
        }
      } else if (eventType === "exp_orb_spawn") {
        // ???蝬????璈??湛??銋?閰脰????撽?嚗?        try {
          if (typeof Game !== "undefined" && typeof ExperienceOrb !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            const value = (typeof eventData.value === "number") ? eventData.value : (typeof CONFIG !== "undefined" && CONFIG.EXPERIENCE && CONFIG.EXPERIENCE.VALUE) ? CONFIG.EXPERIENCE.VALUE : 10;
            const orb = new ExperienceOrb(eventData.x, eventData.y, value);
            Game.experienceOrbs.push(orb);
          }
        } catch (e) {
          console.warn("[SurvivalOnline] ???蝬??仃??", e);
        }
      } else if (eventType === "chest_spawn") {
        // ??MMORPG ?嗆?嚗??摰園?賜??窄蝞梧?銝?鞈游恕?瑞垢
        try {
          if (typeof Game !== "undefined" && typeof Chest !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            const chest = new Chest(eventData.x, eventData.y);
            Game.chests.push(chest);
          }
        } catch (e) {
          console.warn("[SurvivalOnline] ??撖嗥拳憭望?:", e);
        }
      } else if (eventType === "chest_collected") {
        // ??MMORPG ?嗆?嚗??摰園?質??窄蝞梯◤?踹?鈭辣嚗宏?文窄蝞?        try {
          if (typeof Game !== "undefined" && Array.isArray(Game.chests) && eventData.x !== undefined && eventData.y !== undefined) {
            // ?曉??亥??窄蝞曹蒂蝘駁嚗捆撌殷?50??嚗?            const tolerance = 50;
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
          console.warn("[SurvivalOnline] ??撖嗥拳鋡急??隞嗅仃??", e);
        }
      } else if (eventType === "explosion_particles") {
        // ??MMORPG ?嗆?嚗??摰園?賜??啁??貊?摮???        try {
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
          console.warn("[SurvivalOnline] ???蝎?憭望?:", e);
        }
      } else if (eventType === "enemy_death") {
        // ??MMORPG ?嗆?嚗??摰園?賜??唳鈭箸香鈭∪???        try {
          if (typeof Game !== "undefined" && eventData.enemyId && Array.isArray(Game.enemies)) {
            const enemy = Game.enemies.find(e => e && e.id === eventData.enemyId);
            if (enemy && !enemy.isDying) {
              // 閫貊?萎犖甇颱滿?
              enemy.isDying = true;
              enemy.deathElapsed = 0;
              enemy.collisionRadius = 0;
              if (typeof eventData.deathVelX === 'number') enemy.deathVelX = eventData.deathVelX;
              if (typeof eventData.deathVelY === 'number') enemy.deathVelY = eventData.deathVelY;
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] ???萎犖甇颱滿鈭辣憭望?:", e);
        }
      } else if (eventType === "screen_effect") {
        // ??MMORPG ?嗆?嚗??摰園?賜??啣?撟?????????
        try {
          if (typeof Game !== "undefined" && eventData.type) {
            // ??撅???
            if (eventData.screenFlash && typeof eventData.screenFlash === 'object') {
              if (!Game.screenFlash) {
                Game.screenFlash = { active: false, intensity: 0, duration: 0 };
              }
              Game.screenFlash.active = eventData.screenFlash.active || false;
              Game.screenFlash.intensity = eventData.screenFlash.intensity || 0.3;
              Game.screenFlash.duration = eventData.screenFlash.duration || 150;
            }

            // ???⊿??
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
          console.warn("[SurvivalOnline] ??撅???憭望?:", e);
        }
      } else if (eventType === "obstacles_spawn") {
        // ??MMORPG ?嗆?嚗??摰園?賜??啁??????        try {
          if (typeof Game !== "undefined" && Array.isArray(eventData.obstacles) && typeof Obstacle !== "undefined") {
            // 皜?暹????抬??踹???嚗?            Game.obstacles = [];

            // ??????            for (const obsData of eventData.obstacles) {
              if (obsData.x !== undefined && obsData.y !== undefined && obsData.imageKey) {
                const obstacle = new Obstacle(obsData.x, obsData.y, obsData.imageKey, obsData.size || 150);
                Game.obstacles.push(obstacle);
              }
            }

            // 璅??箏歇??嚗??銴???            if (Game._obstaclesAndDecorationsSpawned !== undefined) {
              Game._obstaclesAndDecorationsSpawned = true;
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] ?????拙仃??", e);
        }
      } else if (eventType === "decorations_spawn") {
        // ??MMORPG ?嗆?嚗??摰園?賜??啁???啣?鋆ˇ
        try {
          if (typeof Game !== "undefined" && Array.isArray(eventData.decorations)) {
            // 皜?暹?鋆ˇ嚗??銴?
            Game.decorations = [];

            // ??鋆ˇ
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

            // 璅??箏歇??嚗??銴???            if (Game._obstaclesAndDecorationsSpawned !== undefined) {
              Game._obstaclesAndDecorationsSpawned = true;
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] ???啣?鋆ˇ憭望?:", e);
        }
      } else if (eventType === "boss_projectile_spawn") {
        // ??MMORPG ?嗆?嚗??摰園?賜??蚪OSS???餅?????        try {
          if (typeof Game !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            if (eventData.type === 'BOTTLE' && typeof BottleProjectile !== 'undefined') {
              // 頝臬 HUMAN2嚗??拍???嗅?
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
              // BOSS ?怠?????              const projectile = new BossProjectile(
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
          console.warn("[SurvivalOnline] ??BOSS???拙仃??", e);
        }
      } else if (eventType === "chest_spawn") {
        // ??MMORPG ?嗆?嚗??摰園?賜??窄蝞梧??曹蜓璈嚗葆?臭?ID嚗?        try {
          if (typeof Game !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            const chest = new Chest(eventData.x, eventData.y, eventData.id); // 雿輻?喳?D
            if (!Game.chests) Game.chests = [];
            Game.chests.push(chest);
          }
        } catch (e) {
          console.warn("[SurvivalOnline] ??撖嗥拳憭望?:", e);
        }
      } else if (eventType === "ultimate_pineapple_spawn") {
        // ??MMORPG ?嗆?嚗??摰園?賜??陶璇典之蝯??賜嚗銝餅??嚗葆?臭?ID嚗?        try {
          if (typeof Game !== "undefined" && typeof Game.spawnPineappleUltimatePickup === "function" && eventData.x !== undefined && eventData.y !== undefined) {
            const opts = eventData.opts || {};
            if (eventData.id) opts.id = eventData.id; // 蝣箔?ID?喲?
            Game.spawnPineappleUltimatePickup(eventData.x, eventData.y, opts);
          }
        } catch (_) { }
      } else if (eventType === "chest_collected") {
        // ??MMORPG ?嗆?嚗??窄蝞?曈單◢鋡急??隞塚?蝯曹???嚗?        try {
          if (typeof Game !== "undefined") {
            const isPineapple = (eventData.chestType === 'PINEAPPLE');
            const list = isPineapple ? Game.pineappleUltimatePickups : Game.chests;

            // ?寞?ID?交嚗?頝?湔?蝣綽?
            let chestIndex = -1;
            if (list) {
              chestIndex = list.findIndex(c => c.id === eventData.chestId);
            }

            // 憒??曆??衰D雿?摨扳?嚗摰寡???ID?芸?甇伐?嚗??岫?刻???            if (chestIndex === -1 && eventData.x !== undefined && eventData.y !== undefined) {
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

              // 憒??舀??園???閫貊?
              if (eventData.collectorUid === (Game.multiplayer && Game.multiplayer.uid)) {
                if (isPineapple) {
                  // 曈單◢??餉?
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
                  // ?桅窄蝞梁??菟餉?
                  if (typeof AudioManager !== 'undefined') {
                    AudioManager.playSound('level_up');
                  }
                  if (typeof UI !== 'undefined' && UI.showLevelUpMenu) {
                    UI.showLevelUpMenu();
                  }
                }
              }

              // 蝘駁?拐辣
              if (chest && typeof chest.destroy === 'function') chest.destroy();
              list.splice(chestIndex, 1);
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] ??撖嗥拳?園?鈭辣憭望?:", e);
        }
      } else if (eventType === "pineapple_pickup_collected") {
        // ??鈭辣?澆捆嚗??????潮?鈭辣嚗??潛策 chest_collected ?摩?蕭?伐?
        // ?望??唬????函??chest_collected嚗ㄐ?府銝???堆?雿??蝛箔誑?脰銝
      } else if (eventType === "exp_orb_collected") {
        // ??MMORPG ?嗆?嚗??摰園?質???撽?鋡急??隞塚?蝘駁蝬???        try {
          if (typeof Game !== "undefined" && Array.isArray(Game.experienceOrbs) && eventData.x !== undefined && eventData.y !== undefined) {
            // ?曉??亥???撽?銝衣宏?歹?摰孵榆嚗?0??嚗?            const tolerance = 50;
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
          console.warn("[SurvivalOnline] ??蝬??◤?踹?鈭辣憭望?:", e);
        }
      } else if (eventType === "damage_number") {
        // ?蝡舫＊蝷箏摰單摮???閬綽?銝蔣?踹摰唾?蝞?
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

            // 憿舐內?瑕拿?詨?
            DamageNumbers.show(damage, enemyX, enemyY - enemyHeight / 2, isCrit, {
              dirX: dirX,
              dirY: dirY,
              enemyId: enemyId
            });
          }
        } catch (e) {
          console.warn("[SurvivalOnline] ?蝡舫＊蝷箏摰單摮仃??", e);
        }
      } else if (eventType === "projectile_spawn") {
        // ???迤?MORPG嚗??摰園?賜??啣隞摰嗥???賜??        // ?蝡舐???撠閬死??嚗?閬死嚗?敶梢?瑕拿閮?嚗?        console.log(`[SurvivalOnline] onEventMessage: ?嗅???拍???隞? weaponType=${eventData.weaponType}, x=${eventData.x}, y=${eventData.y}`);
        try {
          if (typeof Game !== "undefined" && eventData.x !== undefined && eventData.y !== undefined) {
            // 瑼Ｘ?臬撌脣??函?D??撠嚗??銴???
            const projectileId = eventData.id || `projectile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const existingProjectile = Game.projectiles.find(p => p.id === projectileId);
            if (!existingProjectile) {
              const weaponType = eventData.weaponType || "UNKNOWN";

              // ?寞?甇血憿??萄遣撠???撠
              if (weaponType === "ORBIT" || weaponType === "CHICKEN_BLESSING" || weaponType === "ROTATING_MUFFIN" || weaponType === "HEART_COMPANION" || weaponType === "PINEAPPLE_ORBIT") {
                // ?啁????抬??閬?啣????拙振嚗蝙?典??渡? Player 撠情嚗?                let targetPlayer = null;
                if (eventData.playerUid) {
                  // 雿輻 RemotePlayerManager ?脣?摰??Player 撠情
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 雿輻摰??Player 撠情
                      }
                    }
                  }
                  // 憒??曆??圈?蝔摰塚?瑼Ｘ?臬?舀?啁摰?                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
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
                    0, // ?瑕拿閮剔0嚗?閬死嚗?                    eventData.size || 20,
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
                // ?瑕?嚗?閬?啣????拙振嚗蝙?典??渡? Player 撠情嚗?                let targetPlayer = null;
                if (eventData.playerUid) {
                  // 雿輻 RemotePlayerManager ?脣?摰??Player 撠情
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 雿輻摰??Player 撠情
                      }
                    }
                  }
                  // 憒??曆??圈?蝔摰塚?瑼Ｘ?臬?舀?啁摰?                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  const beam = new LaserBeam(
                    targetPlayer,
                    eventData.angle || 0,
                    0, // ?瑕拿閮剔0嚗?閬死嚗?                    eventData.width || 8,
                    eventData.duration || 1000,
                    eventData.tickInterval || 120
                  );
                  beam.id = projectileId;
                  beam._isVisualOnly = true;
                  beam._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(beam);
                }
              } else if (weaponType === "MIND_MAGIC" && typeof ShockwaveEffect !== "undefined") {
                // ?郭嚗?閬?啣????拙振嚗蝙?典??渡? Player 撠情嚗?                let targetPlayer = null;
                if (eventData.playerUid) {
                  // 雿輻 RemotePlayerManager ?脣?摰??Player 撠情
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 雿輻摰??Player 撠情
                      }
                    }
                  }
                  // 憒??曆??圈?蝔摰塚?瑼Ｘ?臬?舀?啁摰?                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  const shockwave = new ShockwaveEffect(
                    targetPlayer,
                    0, // ?瑕拿閮剔0嚗?閬死嚗?                    eventData.duration || 1000,
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
                // ?砍?AI嚗?閬?啣????拙振嚗蝙?典??渡? Player 撠情嚗?                let targetPlayer = null;
                if (eventData.playerUid) {
                  // 雿輻 RemotePlayerManager ?脣?摰??Player 撠情
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 雿輻摰??Player 撠情
                      }
                    }
                  }
                  // 憒??曆??圈?蝔摰塚?瑼Ｘ?臬?舀?啁摰?                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  // 瑼Ｘ?臬撌脣??刻府?拙振??AICompanion嚗??銴撱綽?
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
                    // ??MMORPG?嗆?嚗?蝔摰嗥?AI銋?霂仿?隡文拿嚗?銝芰摰嗥?AI?祉?霈∠?隡文拿嚗?                    // 銝?霈唬蛹_isVisualOnly嚗悟瘥葵?拙振?I?質?祉?霈∠?隡文拿撟嗅???                    ai._remotePlayerUid = eventData.playerUid;
                    Game.projectiles.push(ai);
                  } else {
                    // ?湔?暹? AI ??蝵桀?蝑?
                    existingAI.x = eventData.x || existingAI.x;
                    existingAI.y = eventData.y || existingAI.y;
                    if (typeof eventData.summonAILevel === "number") {
                      existingAI.summonAILevel = eventData.summonAILevel;
                    }
                  }
                }
              } else if ((weaponType === "CHAIN_LIGHTNING" || weaponType === "FRENZY_LIGHTNING") && typeof ChainLightningEffect !== "undefined") {
                // ????嚗?閬?啣????拙振嚗蝙?典??渡? Player 撠情嚗?                let targetPlayer = null;
                if (eventData.playerUid) {
                  // 雿輻 RemotePlayerManager ?脣?摰??Player 撠情
                  if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.get === "function") {
                      const remotePlayer = rm.get(eventData.playerUid);
                      if (remotePlayer) {
                        targetPlayer = remotePlayer; // 雿輻摰??Player 撠情
                      }
                    }
                  }
                  // 憒??曆??圈?蝔摰塚?瑼Ｘ?臬?舀?啁摰?                  if (!targetPlayer && eventData.playerUid === (Game.multiplayer && Game.multiplayer.uid)) {
                    targetPlayer = Game.player;
                  }
                }

                if (targetPlayer) {
                  if (weaponType === "CHAIN_LIGHTNING") {
                    // ??MMORPG?嗆?嚗?蝔摰嗥?餈??芰銋?霂仿?隡文拿嚗?銝芰摰嗥?隡文拿?祉?霈∠?撟嗅???
                    const effect = new ChainLightningEffect(
                      targetPlayer,
                      eventData.damage || 0, // 雿輻摰?隡文拿?潘?銝0
                      eventData.duration || 1000,
                      eventData.maxChains || 0,
                      eventData.chainRadius || 220,
                      eventData.palette || null
                    );
                    effect.id = projectileId;
                    // 銝?霈唬蛹_isVisualOnly嚗悟瘥葵?拙振????菟?賜蝡恣蝞慾摰?                    effect._remotePlayerUid = eventData.playerUid;
                    Game.projectiles.push(effect);
                  } else if (weaponType === "FRENZY_LIGHTNING" && typeof FrenzyLightningEffect !== "undefined") {
                    // ??MMORPG?嗆?嚗?蝔摰嗥???瑕銋?霂仿?隡文拿嚗?銝芰摰嗥?隡文拿?祉?霈∠?撟嗅???
                    const effect = new FrenzyLightningEffect(
                      targetPlayer,
                      eventData.damage || 0, // 雿輻摰?隡文拿?潘?銝0
                      eventData.duration || 1000,
                      eventData.branchCount || 10,
                      eventData.chainsPerBranch || 10,
                      eventData.chainRadius || 220,
                      eventData.palette || null
                    );
                    effect.id = projectileId;
                    // 銝?霈唬蛹_isVisualOnly嚗悟瘥葵?拙振???剝?駁?賜蝡恣蝞慾摰?                    effect._remotePlayerUid = eventData.playerUid;
                    Game.projectiles.push(effect);
                  }
                }
              } else if (weaponType === "SLASH" && typeof SlashEffect !== "undefined") {
                // ?祆?嚗?閬?啣????拙振
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
                    0, // ?瑕拿閮剔0嚗?閬死嚗?                    eventData.radius || 60,
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
                // 鋆捱嚗?閬?啣????拙振
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
                  // ??MMORPG?嗆?嚗?蝔摰嗥?鋆銋?霂仿?隡文拿嚗?銝芰摰嗥?隡文拿?祉?霈∠?撟嗅???
                  const effect = new JudgmentEffect(
                    targetPlayer,
                    eventData.damage || 0, // 雿輻摰?隡文拿?潘?銝0
                    eventData.swordCount || 1,
                    eventData.detectRadius || 400,
                    eventData.aoeRadius || 100,
                    eventData.swordImageWidth || 550,
                    eventData.swordImageHeight || 1320,
                    eventData.fallDurationMs || 500,
                    eventData.fadeOutDurationMs || 300
                  );
                  effect.id = projectileId;
                  // 銝?霈唬蛹_isVisualOnly嚗悟瘥葵?拙振???喲?賜蝡恣蝞慾摰?                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "EXPLOSION" && typeof ExplosionEffect !== "undefined") {
                // ???嚗?閬?啣????拙振
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
                  // ??MMORPG?嗆?嚗?蝔摰嗥??銋?霂仿?隡文拿嚗?銝芰摰嗥?隡文拿?祉?霈∠?撟嗅???
                  const effect = new ExplosionEffect(
                    targetPlayer,
                    eventData.x || targetPlayer.x,
                    eventData.y || targetPlayer.y
                  );
                  effect.id = projectileId;
                  // 銝?霈唬蛹_isVisualOnly嚗悟瘥葵?拙振???賊?賜蝡恣蝞慾摰?                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if ((weaponType === "DEATHLINE_WARRIOR" || weaponType === "DEATHLINE_SUPERMAN") && typeof DeathlineWarriorEffect !== "undefined") {
                // 甇餌??啣ㄚ/甇餌?頞犖嚗?閬?啣????拙振
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
                  // ??MMORPG?嗆?嚗?蝔摰嗥?甇餌瑪?ㄚ/甇餌瑪頞犖銋?霂仿?隡文拿嚗?銝芰摰嗥?隡文拿?祉?霈∠?撟嗅???
                  const effect = new DeathlineWarriorEffect(
                    targetPlayer,
                    eventData.damage || 0, // 雿輻摰?隡文拿?潘?銝0
                    eventData.detectRadius || 600,
                    eventData.totalHits || 3,
                    eventData.totalDurationMs || 1200,
                    eventData.minTeleportDistance || 300,
                    weaponType,
                    eventData.aoeRadius || 0,
                    eventData.displayScale || 0.5
                  );
                  effect.id = projectileId;
                  // 銝?霈唬蛹_isVisualOnly嚗悟瘥葵?拙振?香蝥踵?憯?甇餌瑪頞犖?質?祉?霈∠?隡文拿
                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "DIVINE_JUDGMENT" && typeof DivineJudgmentEffect !== "undefined") {
                // 蟡?嚗?閬?啣????拙振
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
                  // ??MMORPG?嗆?嚗?蝔摰嗥?蟡?鋆銋?霂仿?隡文拿嚗?銝芰摰嗥?隡文拿?祉?霈∠?撟嗅???
                  const effect = new DivineJudgmentEffect(targetPlayer, {
                    damage: eventData.damage || 0, // 雿輻摰?隡文拿?潘?銝0
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
                  // 銝?霈唬蛹_isVisualOnly嚗悟瘥葵?拙振?????喲?賜蝡恣蝞慾摰?                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.visualScale === "number") effect.visualScale = eventData.visualScale;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "AURA_FIELD" && typeof AuraField !== "undefined") {
                // ???嚗?閬?啣????拙振
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
                  // ??MMORPG?嗆?嚗?蝔摰嗥?摰憸?銋?霂仿?隡文拿嚗?銝芰摰嗥?隡文拿?祉?霈∠?撟嗅???
                  const effect = new AuraField(
                    targetPlayer,
                    eventData.radius || 150,
                    eventData.damage || 0 // 雿輻摰?隡文拿?潘?銝0
                  );
                  effect.id = projectileId;
                  // 銝?霈唬蛹_isVisualOnly嚗悟瘥葵?拙振???日???賜蝡恣蝞慾摰?                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.visualScale === "number") effect.visualScale = eventData.visualScale;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "GRAVITY_WAVE" && typeof GravityWaveField !== "undefined") {
                // ??瘜ｇ??閬?啣????拙振
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
                  // ??MMORPG?嗆?嚗?蝔摰嗥?撘?瘜Ｖ?摨砲??隡文拿嚗?銝芰摰嗥?隡文拿?祉?霈∠?撟嗅???
                  const effect = new GravityWaveField(
                    targetPlayer,
                    eventData.radius || 150,
                    eventData.damage || 0, // 雿輻摰?隡文拿?潘?銝0
                    eventData.pushMultiplier || 0
                  );
                  effect.id = projectileId;
                  // 銝?霈唬蛹_isVisualOnly嚗悟瘥葵?拙振???郭?質?祉?霈∠?隡文拿
                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.visualScale === "number") effect.visualScale = eventData.visualScale;
                  Game.projectiles.push(effect);
                }
              } else if ((weaponType === "BIG_ICE_BALL" || weaponType === "FRENZY_ICE_BALL") && typeof IceBallProjectile !== "undefined") {
                // 憭批???閬?啣????拙振
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
                // 撟澆曳??嚗?閬?啣????拙振
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
                // 撟澆曳憭拐蝙嚗?閬?啣????拙振
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
                // ???砌?嚗?閬?啣????拙振
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
                  // ??MMORPG?嗆?嚗?蝔摰嗥???銝?銋?霂仿?隡文拿嚗?銝芰摰嗥?隡文拿?祉?霈∠?撟嗅???
                  const effect = new RadiantGloryEffect(
                    targetPlayer,
                    eventData.damage || 0, // 雿輻摰?隡文拿?潘?銝0
                    eventData.width || 8,
                    eventData.duration || 1000,
                    eventData.tickInterval || 120,
                    eventData.beamCount || 10,
                    eventData.rotationSpeed || 1.0
                  );
                  effect.id = projectileId;
                  // 銝?霈唬蛹_isVisualOnly嚗悟瘥葵?拙振????銝?賜蝡恣蝞慾摰?                  effect._remotePlayerUid = eventData.playerUid;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "FRENZY_SLASH" && typeof SlashEffect !== "undefined") {
                // ??祆?嚗蝙?沒lashEffect嚗?SLASH?詨?嚗?                let targetPlayer = null;
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
                  // ??MMORPG?嗆?嚗?蝔摰嗥???拙銋?霂仿?隡文拿嚗?銝芰摰嗥?隡文拿?祉?霈∠?撟嗅???
                  const effect = new SlashEffect(
                    targetPlayer,
                    eventData.angle || 0,
                    eventData.damage || 0, // 雿輻摰?隡文拿?潘?銝0
                    eventData.radius || 60,
                    eventData.arcDeg || 80,
                    eventData.duration || 1000
                  );
                  effect.id = projectileId;
                  effect.weaponType = 'FRENZY_SLASH'; // ??霈曄蔭甇?＆?eaponType
                  // 銝?霈唬蛹_isVisualOnly嚗悟瘥葵?拙振???剜?駁?賜蝡恣蝞慾摰?                  effect._remotePlayerUid = eventData.playerUid;
                  if (typeof eventData.visualScale === "number") effect.visualScale = eventData.visualScale;
                  Game.projectiles.push(effect);
                }
              } else if (weaponType === "SING" && typeof SingEffect !== "undefined") {
                // ?望?嚗?閬?啣????拙振
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
                // ?⊥嚗?閬?啣????拙振
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
                // 頝臬頠?嚗憓?芰嚗??閬摰園??荔?
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
                car._isVisualOnly = true; // 璅??箏?閬死嚗??∠垢銝脰??瑕拿閮?嚗?                Game.projectiles.push(car);
              } else if (typeof Projectile !== "undefined") {
                // ?桅?撠
                try {
                  const projectile = new Projectile(
                    eventData.x || 0,
                    eventData.y || 0,
                    eventData.angle || 0,
                    weaponType,
                    0, // ?瑕拿閮剔0嚗?閬死嚗摰喳歇?券??瑞垢閮?嚗?                    eventData.speed || 0,
                    eventData.size || 0
                  );
                  projectile.id = projectileId;
                  projectile.homing = eventData.homing || false;
                  projectile.turnRatePerSec = eventData.turnRatePerSec || 0;
                  projectile.assignedTargetId = eventData.assignedTargetId || null;
                  projectile._isVisualOnly = true; // 璅??箏?閬死????                  projectile.player = null; // 銝??舐摰塚??踹?蝣唳?瑼Ｘ葫嚗?                  Game.projectiles.push(projectile);
                  console.log(`[SurvivalOnline] ?????萄遣?????? weaponType=${weaponType}, id=${projectileId}, x=${eventData.x}, y=${eventData.y}`);
                } catch (e) {
                  console.error(`[SurvivalOnline] ???萄遣?????拙仃??`, e, `weaponType=${weaponType}`);
                }
              } else {
                console.warn(`[SurvivalOnline] ?? Projectile 蝐餅摰?嚗?瘜?撱箄?蝔?撠: weaponType=${weaponType}`);
              }
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] ?蝡舐???撠閬死??憭望?:", e);
        }
      } else if (eventType === "game_over") {
        // ??MMORPG ?嗆?嚗??摰園?質????脩???隞塚???摰園甇颱滿嚗?        try {
          // ?脫迫??閫貊
          if (typeof Game !== "undefined") {
            if (Game._gameOverEventSent) return; // 撌脩?????
            Game._gameOverEventSent = true; // 璅??箏歇??

            // ??靽桀儔嚗?亥矽?券??脩???頛荔?銝?甈∟矽??Game.gameOver()嚗?儐?堆?
            // ? Game.gameOver() ??甈∪誨?凋?隞塚?撠敺芰
            Game.isGameOver = true;
            // ??甇?虜蝯?嚗?唳??? lobby嚗??啣之撱喟???嚗??ａ??輸?
            if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.updateRoomStatusToLobby === 'function') {
              window.SurvivalOnlineUI.updateRoomStatusToLobby().catch(() => { });
            }
            // ?＊蝷粹?憪?ｇ?雿?嚗??嗅?憿舐內?輸?憭批輒閬?撅?            try {
              const startScreen = document.getElementById('start-screen');
              if (startScreen) startScreen.classList.remove('hidden');
            } catch (_) { }
            // ??輸?憭批輒嚗??惜嚗?            if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.openLobbyScreen === 'function') {
              window.SurvivalOnlineUI.openLobbyScreen();
            }
            // 憿舐內?蝯??恍
            if (typeof UI !== 'undefined' && typeof UI.showGameOverScreen === 'function') {
              UI.showGameOverScreen();
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] ???蝯?鈭辣憭望?:", e);
        }
      } else if (eventType === "exit_spawn") {
        // ?蝡舐?????蝚?0瘜﹨OSS甇颱滿敺?
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
          console.warn("[SurvivalOnline] ?蝡舐????仃??", e);
        }
      } else if (eventType === "game_victory") {
        // ??MMORPG ?嗆?嚗??摰園?質????脣??拐?隞塚??圈??箏嚗?        try {
          // ?脫迫??閫貊
          if (typeof Game !== "undefined") {
            if (Game._victoryEventSent) return; // 撌脩?????
            Game._victoryEventSent = true; // 璅??箏歇??

            // ??靽桀儔嚗?亥矽?典??拚?頛荔?銝?甈∟矽??Game.victory()嚗?儐?堆?
            // ? Game.victory() ??甈∪誨?凋?隞塚?撠敺芰
            Game.isGameOver = true;
            // ??甇?虜蝯?嚗?唳??? lobby嚗??啣之撱喟???嚗??ａ??輸?
            if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.updateRoomStatusToLobby === 'function') {
              window.SurvivalOnlineUI.updateRoomStatusToLobby().catch(() => { });
            }
            // ?＊蝷粹?憪?ｇ?雿?嚗??嗅?憿舐內?輸?憭批輒閬?撅?            try {
              const startScreen = document.getElementById('start-screen');
              if (startScreen) startScreen.classList.remove('hidden');
            } catch (_) { }
            // ??輸?憭批輒嚗??惜嚗?            if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.openLobbyScreen === 'function') {
              window.SurvivalOnlineUI.openLobbyScreen();
            }
            // 憿舐內??恍
            if (typeof UI !== 'undefined' && typeof UI.showVictoryScreen === 'function') {
              UI.showVictoryScreen();
            }
          }
        } catch (e) {
          console.warn("[SurvivalOnline] ????鈭辣憭望?:", e);
        }
      }
    } catch (e) {
      console.warn("[SurvivalOnline] M2 鈭辣??憭望?:", e);
    }
  }

  // M5嚗???翰?改???敺抬?
  function onFullSnapshotMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.t !== "full_snapshot") return;

    try {
      console.log("[SurvivalOnline] M5: ?嗅?券?敹怎嚗?憪敺拚??脩???);

      // ?Ｗ儔 sessionId
      if (payload.sessionId && typeof Game !== "undefined" && Game.multiplayer) {
        Game.multiplayer.sessionId = payload.sessionId;
      }

      // ?Ｗ儔???
      if (typeof payload.gameTime === "number" && typeof Game !== "undefined") {
        Game.gameTime = payload.gameTime;
      }

      // ?Ｗ儔瘜Ｘ活
      if (typeof payload.currentWave === "number" && typeof WaveSystem !== "undefined") {
        WaveSystem.currentWave = payload.currentWave;
        if (typeof UI !== "undefined" && UI.updateWaveInfo) {
          UI.updateWaveInfo(WaveSystem.currentWave);
        }
      }

      // ???摰嗥???雿輻 M3 ??頛荔?
      onSnapshotMessage(payload);

      // ?Ｗ儔?萎犖嚗??典恕?瑞垢嚗恥?嗥垢銝??鈭綽?
      // 瘜冽?嚗恥?嗥垢銝?閰脩?甇???鈭綽??芣閮??冽閬死??
      // 撖阡??鈭箇????圈洛?摩?勗恕?瑁???
      // ?Ｗ儔蝬???撖嗥拳嚗?璅??摰Ｘ蝡臬????

      console.log("[SurvivalOnline] M5: ???敺拙???);
    } catch (e) {
      console.warn("[SurvivalOnline] M5: ?券?敹怎??憭望?:", e);
    }
  }

  // M3嚗????翰?改?摰Ｘ蝡舀?嗅恕?瑕誨?剔?敹怎嚗?  function onSnapshotMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.t !== "snapshot") return;

    try {
      // MMO ?嗆?嚗??甇??蝵殷??芸?甇仿??萇???      // 瘥摰園?舐蝡?嚗?蝵桃摰Ｘ蝡航撌望?塚?銝◤???冽甇?      if (payload.players && _uid && payload.players[_uid]) {
        const myState = payload.players[_uid];
        if (typeof Game !== "undefined" && Game.player) {
          const player = Game.player;

          // ??MMO ?嗆?嚗??甇??蝵殷??芸?甇仿??萇???銵???蝝?嚗?          // 雿蔭?勗恥?嗥垢?芸楛?批嚗?鋡急???⊥迤嚗Ⅱ靽??摰園?舐蝡?

          // 銵???賡?/蝑?/蝬?嚗′閬?靽???          if (typeof myState.hp === "number") player.health = Math.max(0, Math.min(myState.hp, player.maxHealth || 100));
          if (typeof myState.maxHp === "number") player.maxHealth = myState.maxHp;
          if (typeof myState.energy === "number") player.energy = Math.max(0, Math.min(myState.energy, player.maxEnergy || 100));
          if (typeof myState.maxEnergy === "number") player.maxEnergy = myState.maxEnergy;
          if (typeof myState.level === "number") player.level = myState.level;
          if (typeof myState.exp === "number") player.experience = myState.exp;
          if (typeof myState.expToNext === "number") player.experienceToNextLevel = myState.expToNext;

          // ?馳?郊嚗??芋撘鈭恍?撟??
          if (typeof myState.coins === "number" && typeof Game !== "undefined") {
            Game.coins = Math.max(0, Math.floor(myState.coins));
            // ?湔?馳憿舐內
            if (typeof UI !== "undefined" && UI.updateCoinsDisplay) {
              UI.updateCoinsDisplay(Game.coins);
            }
          }

          // 憭扳????甇?          if (typeof myState.isUltimateActive === "boolean") {
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
          // 擃??郊
          if (typeof myState.width === "number" && myState.width > 0) {
            player.width = myState.width;
          }
          if (typeof myState.height === "number" && myState.height > 0) {
            player.height = myState.height;
          }
          if (typeof myState.collisionRadius === "number" && myState.collisionRadius > 0) {
            player.collisionRadius = myState.collisionRadius;
          }

          // 甇颱滿?儔瘣餌???甇?          if (typeof myState._isDead === "boolean") {
            player._isDead = myState._isDead;
            // 憒?甇颱滿嚗??斗郎??            if (myState._isDead && player.clearWeapons && typeof player.clearWeapons === 'function') {
              player.clearWeapons();
            }
            // 憒?敺拇暑嚗敺拙?憪郎??            if (!myState._isDead && player._isDead && player.weapons && player.weapons.length === 0) {
              player.addWeapon('DAGGER');
            }
          }
          if (typeof myState._resurrectionProgress === "number") {
            player._resurrectionProgress = myState._resurrectionProgress;
          }

          // ?湔 UI
          if (typeof UI !== "undefined") {
            if (UI.updateHealthBar) UI.updateHealthBar(player.health, player.maxHealth);
            if (UI.updateEnergyBar) UI.updateEnergyBar(player.energy, player.maxEnergy);
            if (UI.updateLevel) UI.updateLevel(player.level);
            if (UI.updateExpBar) UI.updateExpBar(player.experience, player.experienceToNextLevel);
          }
        }
      }

      // ?? BOSS ???憒?摮嚗?      if (payload.boss && typeof Game !== "undefined" && Game.boss) {
        const boss = Game.boss;
        const bossState = payload.boss;
        // BOSS 雿蔭??        if (typeof bossState.x === "number" && typeof bossState.y === "number") {
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
        // BOSS 銵?′閬?
        if (typeof bossState.hp === "number") boss.health = Math.max(0, bossState.hp);
        if (typeof bossState.maxHp === "number") boss.maxHealth = bossState.maxHp;
      }

      // ???箏???憒?摮嚗?      if (payload.exit && typeof Game !== "undefined") {
        if (!Game.exit && payload.exit.x !== undefined && payload.exit.y !== undefined) {
          // ?箏撠??嚗?敹怎銝剜?嚗隞仿＊蝷箸?蝷綽?撖阡????勗恕?瑁???
        } else if (Game.exit) {
          // ?箏撌脣??剁??郊雿蔭
          Game.exit.x = payload.exit.x || Game.exit.x;
          Game.exit.y = payload.exit.y || Game.exit.y;
        }
      }

      // ??MMO ?嗆?嚗???甇交鈭綽?瘥恥?嗥垢?芸楛??
      // 雿輻蝣箏??抒??Ⅱ靽??恥?嗥垢???詨??鈭?      // ?萎犖?郊撌脩宏?歹?瘥恥?嗥垢?芸楛????唳鈭?    } catch (e) {
      console.warn("[SurvivalOnline] M3 敹怎??憭望?:", e);
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

    // ??潮??(10Hz / 100ms)
    const now = Date.now();
    if (now - lastSendAt < 100) return;
    lastSendAt = now;

    if (typeof Game === "undefined" || !Game.player) return;

    // 瑽遣雿蔭??????(Client-Authoritative)
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
      // ?喲??馳嚗鈭恬?
      coins: Game.coins,
      hitFlashTime: Game.player.hitFlashTime || 0
    };

    // ?潮?    _sendViaWebSocket(payload);
  }

  function getRemotePlayers() {
    return Array.from(remotePlayers.entries()).map(([uid, p]) => ({ uid, ...p }));
  }

  // M3嚗???渡??翰?改??恕?瑞垢嚗?  let lastSnapshotAt = 0;
  const SNAPSHOT_INTERVAL_MS = 300; // 瘥?300ms ?潮?甈∪翰?改?蝝?3.3Hz嚗?
  function collectSnapshot() {
    if (!_isHost) return null;
    try {
      const snapshot = {
        players: {},
        boss: null,
        exit: null,
        enemies: [], // 瘛餃??萎犖靽⊥
        timestamp: Date.now()
      };

      // ?園???摰嗥?????host ?芸楛嚗?      try {
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
            coins: Game.coins || 0, // 瘛餃??馳摮挾
            name: getPlayerNickname(),
            characterId: hostCharacterId, // 瘛餃?閫ID嚗?潮??∠垢皜脫?摰閫憭?
            // 甇颱滿?儔瘣餌???甇?            _isDead: (typeof p._isDead === "boolean") ? p._isDead : false,
            _resurrectionProgress: (typeof p._resurrectionProgress === "number") ? p._resurrectionProgress : 0,
            // 憭扳????甇?            isUltimateActive: p.isUltimateActive || false,
            ultimateImageKey: p._ultimateImageKey || null,
            ultimateEndTime: p.ultimateEndTime || 0,
            width: p.width || CONFIG.PLAYER.SIZE,
            height: p.height || CONFIG.PLAYER.SIZE,
            collisionRadius: p.collisionRadius || (CONFIG.PLAYER.SIZE / 2)
          };
        }
      } catch (_) { }

      // ?園????拙振???      try {
        const remoteStates = RemotePlayerManager.getAllStates();
        for (const [uid, state] of Object.entries(remoteStates)) {
          const member = _membersState ? _membersState.get(uid) : null;
          const name = (member && typeof member.name === "string") ? member.name : uid.slice(0, 6);
          // M4嚗?蝔摰嗅歇???渡? Player 撠情嚗蝙?函?撖衣???          const remotePlayer = RemotePlayerManager.get(uid);
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
              coins: Game.coins || 0, // 瘛餃??馳摮挾嚗??芋撘鈭恍?撟??
              name: name,
              characterId: characterId, // 瘛餃?閫ID嚗?潮??∠垢皜脫?摰閫憭?
              // 甇颱滿?儔瘣餌???甇?              _isDead: (typeof remotePlayer._isDead === "boolean") ? remotePlayer._isDead : false,
              _resurrectionProgress: (typeof remotePlayer._resurrectionProgress === "number") ? remotePlayer._resurrectionProgress : 0,
              // 憭扳????甇?              isUltimateActive: remotePlayer.isUltimateActive || false,
              ultimateImageKey: remotePlayer._ultimateImageKey || null,
              ultimateEndTime: remotePlayer.ultimateEndTime || 0,
              width: remotePlayer.width || CONFIG.PLAYER.SIZE,
              height: remotePlayer.height || CONFIG.PLAYER.SIZE,
              collisionRadius: remotePlayer.collisionRadius || (CONFIG.PLAYER.SIZE / 2)
            };
          } else {
            // 敺?嚗???蝔摰嗅?鞊∩?摮嚗蝙?函陛????            snapshot.players[uid] = {
              x: state.x || 0,
              y: state.y || 0,
              hp: 100,
              maxHp: 100,
              energy: 0,
              maxEnergy: 100,
              level: 1,
              exp: 0,
              expToNext: 100,
              coins: Game.coins || 0, // 瘛餃??馳摮挾嚗??芋撘鈭恍?撟??
              name: name,
              characterId: characterId // 瘛餃?閫ID嚗?潮??∠垢皜脫?摰閫憭?
            };
          }
        }
      } catch (_) { }

      // ?園? BOSS ???      try {
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

      // ?園??箏???      try {
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

      // ??MMO ?嗆?嚗???甇交鈭綽?瘥恥?嗥垢?芸楛??
      // 雿輻蝣箏??抒??Ⅱ靽??恥?嗥垢???詨??鈭?      // ?萎犖?郊撌脩宏?歹?瘥恥?嗥垢?芸楛????唳鈭?      // snapshot.enemies 銝?雿輻

      return snapshot;
    } catch (_) {
      return null;
    }
  }

  // M2嚗?圈?蝔摰塚??恕?瑞垢隤輻嚗?  // MMO ?嗆?嚗??摰園?湔???拙振嚗?靘陷?蝡?  function updateRemotePlayers(deltaTime) {
    // ??MMO ?嗆?嚗??摰園?瑁?嚗?圈?蝔摰嗥?甇血?????    try {
      // ?湔???蝔摰嗥?甇血?????      RemotePlayerManager.updateAll(deltaTime);

      // 瘜冽?嚗???甇亙歇??tick ?賣??嚗ㄐ?芣?圈?蝔摰嗥??摩
      // 銝??閬??瑞垢撱?嚗??摰園?潮撌梁????    } catch (_) { }
  }

  // MMO ?嗆?嚗??摰園?臭誑皜????拙振嚗??脩???嚗?  function clearRemotePlayers() {
    // ??MMO ?嗆?嚗??摰園?臭誑皜????拙振嚗?靘陷?蝡?    try {
      RemotePlayerManager.clear();
    } catch (_) { }
  }

  // MMO ?嗆?嚗??摰園撱?鈭辣嚗?靘陷?蝡?  function broadcastEventFromRuntime(eventType, eventData) {
    // ??MMO ?嗆?嚗??摰園撱??芸楛??隞塚??餅????賜?嚗?銝?鞈湧??瑞垢
    try {
      // 隤輻?典? broadcastEvent ?賣
      if (typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
        window.SurvivalOnlineBroadcastEvent(eventType, eventData);
      }
    } catch (_) { }
  }

  // MMO ?嗆?嚗??摰園?湔?潮??荔?銝?鞈湧??瑞垢
  function sendToNet(obj) {
    if (!obj) return;
    // ??MMO ?嗆?嚗??摰園?湔?? WebSocket ?潮??荔?銝?鞈湧??瑞垢
    // 瘜冽?嚗???甇亙歇??tick ?賣??嚗ㄐ銝餉??冽?潮?隞塚??餅????賜?嚗?    _sendViaWebSocket(obj);
  }

  return { setEnabled, onStateMessage, onEventMessage, onSnapshotMessage, onFullSnapshotMessage, tick, getRemotePlayers, updateRemotePlayers, clearRemotePlayers, broadcastEvent: broadcastEventFromRuntime, sendToNet };
})();

// M2嚗撅鈭辣撱??賣嚗??嗡?璅∠?隤輻嚗?window.SurvivalOnlineBroadcastEvent = function (eventType, eventData) {
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
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ?餅??毽瘛?
  let s = "";
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

function _randSessionId() {
  // ??session id嚗?瘨?瑼?
  return (Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36)).toUpperCase();
}

// ??撌脣?歹?_candidateIsRelay ?賣嚗ebRTC ?賊?嚗???閬?

async function ensureFirebase() {
  if (_app && _auth && _db) return;
  _app = initializeApp(FIREBASE_CONFIG);
  _auth = getAuth(_app);
  _db = getFirestore(_app);
}

async function ensureAuth() {
  await ensureFirebase();
  if (_uid) return _uid;
  // 蝑? auth ready
  await new Promise((resolve) => {
    const unsub = onAuthStateChanged(_auth, (user) => {
      if (user) {
        _uid = user.uid;
        try { unsub(); } catch (_) { }
        resolve();
      }
    });
    // ?仿?瘝?伐?????    signInAnonymously(_auth).catch((e) => {
      // 撣貉???嚗uthorized domains 瘝??乓??汗?券?洵銝 cookie/摮
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
  if (!_uid) throw new Error("?踹??餃憭望?嚗equest.auth ?箇征嚗?隢Ⅱ隤?Firebase Auth ?踹?撌脣??其? Authorized domains 撌脣???yiyuss.github.io");
  // ??嚗?閬 create ? getDoc ?Ｘ葫 roomId嚗?鋡怠??Rules ??嚗???permission-denied嚗?  // ?寧??亙?閰血遣蝡?銝血 Rules 蝡舐 !exists(roomPath(roomId)) ?脫迫閬神?Ｘ??輸???  let roomId = null;
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
      // ??撱箇? room
      roomId = code;
      // 撱箇?摰日 member嚗遣蝡??? member嚗?敺???read 甈?嚗?      // ?脣??砍?拙振?予鞈衣?蝝?      let talentLevels = {};
      try {
        if (typeof TalentSystem !== "undefined" && typeof TalentSystem.getTalentLevels === "function") {
          talentLevels = TalentSystem.getTalentLevels();
        }
      } catch (_) { }

      // ?脣?閫ID嚗?蝙??_pendingStartParams嚗甈∩蝙??Game.selectedCharacter嚗?敺蝙?券?隤???      let characterId = null;
      if (_pendingStartParams && _pendingStartParams.selectedCharacter && _pendingStartParams.selectedCharacter.id) {
        characterId = _pendingStartParams.selectedCharacter.id;
      } else if (typeof Game !== "undefined" && Game.selectedCharacter && Game.selectedCharacter.id) {
        characterId = Game.selectedCharacter.id;
      } else {
        // 憒?瘝??豢?閫嚗蝙?券?隤??莎?蝚砌?雿??莎?margaret嚗?        if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS) && CONFIG.CHARACTERS.length > 0) {
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
        talentLevels: talentLevels, // 靽?憭抵釵蝑?
      });

      // ???芸?皜?璈嚗蜓璈垢嚗?      startAutoCleanup();

      return { roomId, hostUid: _uid, mapId, diffId };
    } catch (e) {
      lastErr = e;
      // ??Rules ????exists(roomPath(roomId))???輸?蝣潭??唳? permission-denied嚗??１??閰佗?
      const codeStr = e && e.code ? String(e.code) : "";
      if (codeStr.includes("permission-denied")) {
        continue;
      }
      break;
    }
  }
  // 韏啣?ㄐ隞?”隞仃??  if (lastErr) {
    const c = lastErr && lastErr.code ? String(lastErr.code) : "";
    const msg = lastErr && lastErr.message ? String(lastErr.message) : "unknown";
    throw new Error(`撱箇?憭望?嚗?{msg}${c ? ` [${c}]` : ""}`);
  }
  throw new Error("?⊥?撱箇??輸?嚗??岫嚗?);

}

async function joinRoom(roomId) {
  await ensureAuth();
  if (!_uid) throw new Error("?踹??餃憭望?嚗equest.auth ?箇征嚗?隢Ⅱ隤?Firebase Auth ?踹?撌脣??其? Authorized domains 撌脣???yiyuss.github.io");

  // ??嚗?閬?????room嚗??Rules 銝????read 甈?嚗?  // ?寞??湔撖怠 members嚗ules ?炎??room ?臬摮銝?status ?臬??lobby??  // ?脣??砍?拙振?予鞈衣?蝝?  let talentLevels = {};
  try {
    if (typeof TalentSystem !== "undefined" && typeof TalentSystem.getTalentLevels === "function") {
      talentLevels = TalentSystem.getTalentLevels();
    }
  } catch (_) { }

  // ?脣?閫ID嚗?蝙??_pendingStartParams嚗甈∩蝙??Game.selectedCharacter嚗?敺蝙?券?隤???  let characterId = null;
  if (_pendingStartParams && _pendingStartParams.selectedCharacter && _pendingStartParams.selectedCharacter.id) {
    characterId = _pendingStartParams.selectedCharacter.id;
  } else if (typeof Game !== "undefined" && Game.selectedCharacter && Game.selectedCharacter.id) {
    characterId = Game.selectedCharacter.id;
  } else {
    // 憒?瘝??豢?閫嚗蝙?券?隤??莎?蝚砌?雿??莎?margaret嚗?    if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS) && CONFIG.CHARACTERS.length > 0) {
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
      talentLevels: talentLevels, // 靽?憭抵釵蝑?
    });
  } catch (e) {
    const c = e && e.code ? String(e.code) : "";
    const msg = e && e.message ? String(e.message) : "unknown";
    // ?虜隞?”嚗??摮 / 撌脤?憪?/ 撌脤???/ 瘝?甈?
    throw new Error(`?憭望?嚗??摮?歇??/撌脤???${msg}${c ? ` [${c}]` : ""}嚗);
  }

  // ? member 敺??? room ?? host/map/diff嚗迨??read ?府?迂嚗?  let data = null;
  for (let i = 0; i < 3; i++) {
    try {
      const snap = await getDoc(roomDocRef(roomId));
      if (snap.exists()) {
        data = snap.data() || {};
        break;
      }
    } catch (_) { }
    // 撠辣?脤??撖怠 member 敺??摰??芸停蝺?    await new Promise((r) => setTimeout(r, 120));
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

  // ??皜??摩嚗???蝔摰?  try {
    if (typeof RemotePlayerManager !== "undefined" && RemotePlayerManager.clear) {
      RemotePlayerManager.clear();
    }
  } catch (_) { }

  // ??皜??摩嚗???Game.remotePlayers嚗????
  try {
    if (typeof Game !== "undefined" && Array.isArray(Game.remotePlayers)) {
      Game.remotePlayers.length = 0;
    }
  } catch (_) { }

  // ??皜??摩嚗???Runtime 銝剔????拙振
  try {
    if (typeof Runtime !== "undefined" && typeof Runtime.setEnabled === "function") {
      Runtime.setEnabled(false);
    }
  } catch (_) { }

  // ??皜??摩嚗???WebSocket ??
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

  // ??皜??摩嚗?甇Ｚ????  stopAutoCleanup();

  // ??皜??摩嚗????餈質馱
  _rateLimitTracker.clear();

  Runtime.setEnabled(false);

  // ??皜??摩嚗宏?斗???  try {
    if (_activeRoomId && _uid) {
      await deleteDoc(memberDocRef(_activeRoomId, _uid));
    }
  } catch (_) { }

  // ??皜??摩嚗?摰日嚗?閰阡??選??∪?蝡臭??⊥?靽?嚗???閮勗停??
  try {
    if (_isHost && _activeRoomId) {
      await updateDoc(roomDocRef(_activeRoomId), { status: "closed", updatedAt: serverTimestamp() });
    }
  } catch (_) { }

  // ??皜??摩嚗?蝵格???????  _activeRoomId = null;
  _isHost = false;
  _hostUid = null;
  _roomState = null;
  _membersState = new Map();

  // ??皜??摩嚗?甇Ｗ?頝?  try { if (_memberHeartbeatTimer) clearInterval(_memberHeartbeatTimer); } catch (_) { }
  _memberHeartbeatTimer = null;

  // ??皜??摩嚗?甇ａ?撅?嚗???隤方孛?潮脣?嚗?  try { if (_startTimer) clearTimeout(_startTimer); } catch (_) { }
  _startTimer = null;
  _startSessionId = null;

  // ??皜??摩嚗???????
  try { if (_reconnectTimer) clearTimeout(_reconnectTimer); } catch (_) { }
  _reconnectTimer = null;
  _reconnectAttempts = 0;

  // ??皜??摩嚗???皜??梁迂嚗?楊?輸?瘙⊥?嚗?  try {
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
      // ?芣?啗撌梁? lastSeenAt嚗?敶梢 SaveCode/localStorage嚗?      await updateDoc(memberDocRef(_activeRoomId, _uid), { lastSeenAt: serverTimestamp() });
    } catch (_) {
      // 敹歲憭望?銝?踝??航?舫蝺????急???嚗?    }
  }, MEMBER_HEARTBEAT_MS);
}

function _isMemberStale(member) {
  // lastSeenAt ?航??Timestamp ??serverTimestamp ?芾?堆?null嚗?  try {
    if (!member) return true;
    const t = member.lastSeenAt;
    let ms = 0;
    if (t && typeof t.toMillis === "function") ms = t.toMillis();
    else if (typeof t === "number") ms = t;
    if (!ms) return false; // 瘝?????閬 stale嚗???蝡鋡怠?Ｙ?嚗?    return (Date.now() - ms) > MEMBER_STALE_MS;
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

  // ?湔?輸???誑撱園????
  if (_roomState) {
    _roomState.updatedAt = Date.now();
    _roomState._lastUpdateMs = Date.now();
  }
}

async function hostStartGame() {
  if (!_activeRoomId || !_isHost) return;
  // M1嚗神??sessionId + ?閮剖?嚗?????渡???撅??蝔?  const sessionId = _randSessionId();
  await updateDoc(roomDocRef(_activeRoomId), {
    status: "starting",
    sessionId,
    startDelayMs: START_COUNTDOWN_MS,
    startAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // ?湔?輸???誑撱園????
  if (_roomState) {
    _roomState.updatedAt = Date.now();
    _roomState._lastUpdateMs = Date.now();
    _roomState.status = "starting";
  }
}

async function sendSignal(payload) {
  if (!_activeRoomId) {
    console.warn(`[SurvivalOnline] sendSignal: 頝喲?嚗ctiveRoomId ?箇征`);
    return;
  }
  try {
    // 瘜冽?嚗endSignal ?曉?芰?潭?恣?縑隞歹?憒?starting ???嚗????WebRTC
    await addDoc(signalsColRef(_activeRoomId), { ...payload, createdAt: serverTimestamp() });
    console.log(`[SurvivalOnline] sendSignal: 撌脩?縑??type=${payload.type}, toUid=${payload.toUid}`);
  } catch (e) {
    console.error(`[SurvivalOnline] sendSignal: ?潮仃??type=${payload.type}, toUid=${payload.toUid}:`, e);
    throw e; // ??隞乩噶隤輻????  }
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
        console.log(`[SurvivalOnline] listenRoom: 閮剔蔭 hostUid=${_hostUid}, ??${oldHostUid}`);
        // 憒? hostUid ?身蝵桐??蝡舫?瘝???嚗?閰阡? WebSocket
        if (!_isHost && !oldHostUid && _hostUid && !_ws) {
          console.log(`[SurvivalOnline] listenRoom: hostUid ?身蝵殷??岫?? WebSocket`);
          connectWebSocket().catch((e) => {
            console.error(`[SurvivalOnline] listenRoom: WebSocket ??憭望?:`, e);
          });
        }
      }

      // ?湔?砍 updatedAt ???喉??冽??瑼Ｘ嚗?      if (_roomState && _roomState.updatedAt) {
        try {
          const updatedAt = _roomState.updatedAt;
          if (updatedAt && typeof updatedAt.toMillis === "function") {
            _roomState._lastUpdateMs = updatedAt.toMillis();
          } else if (typeof updatedAt === "number") {
            _roomState._lastUpdateMs = updatedAt;
          }
        } catch (_) { }
      }

      // ?郊 host ?????踹??刻憚閰ｇ?
      _syncHostSelectsFromRoom();
      updateLobbyUI();

      // ?輸?鋡怠恕?瑁圾????嚗??犖?芸??ａ??????恍
      if (_roomState && _roomState.status === "closed") {
        _setText("survival-online-status", "??撌脰圾??);
        leaveRoom().catch(() => { });
        closeLobbyToStart(); // ???ａ??輸?敺??圈??脤?憪??        return;
      }

      // ?仿?憪??莎?閫貊?脣
      if (_roomState && _roomState.status === "starting") {
        // 銝餅?蝡荔????芸?皜?璈
        if (_isHost) {
          startAutoCleanup();
        }
        tryStartSurvivalFromRoom();
      }
    },
    (err) => {
      // 鋡怨腺?粹?隡?嚗ules ?蝙 isMember=false嚗oom read ??permission-denied
      try {
        const code = err && err.code ? String(err.code) : "";
        if (code.includes("permission-denied")) {
          _setText("survival-online-status", "雿歇鋡怠恕?瑞宏?粹?隡?);
          leaveRoom().catch(() => { });
          closeLobbyToStart(); // ???ａ??輸?敺??圈??脤?憪??          return;
        }
        const msg = (err && err.message) ? String(err.message) : "?輸????航炊";
        _setText("survival-online-status", `?輸????航炊嚗?{msg}`);
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
          oldUids.delete(data.uid); // 隞?輸?????        }
      });
      // M2嚗??歇?ａ????∠????拙振撠情
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

      // ??摰日?湛?瑼Ｘ?輸??臬?箇征嚗??蝛箏??芸??芷?輸?
      try {
        if (_isHost && _activeRoomId) {
          const memberCount = _membersState.size;
          // 憒??輸??箇征嚗????∴?嚗??斗??          if (memberCount === 0) {
            console.log(`[SurvivalOnline] ?輸? ${_activeRoomId} 撌脩征嚗??亡);
            const roomIdToDelete = _activeRoomId;
            // 皜??砍????????踹?敺???嚗?            _activeRoomId = null;
            _isHost = false;
            _hostUid = null;
            _roomState = null;
            stopAutoCleanup();
            // ?唳郊?芷?輸???嚗?蝑?嚗?憛?
            (async () => {
              try {
                // ?芷?輸???嚗irestore ???文???嚗?                await deleteDoc(roomDocRef(roomIdToDelete));
              } catch (e) {
                console.warn(`[SurvivalOnline] ?芷蝛箸?仃??`, e);
                // 憒??芷憭望?嚗撠身蝵桃 closed ???                try {
                  await updateDoc(roomDocRef(roomIdToDelete), { status: "closed", updatedAt: serverTimestamp() });
                } catch (_) { }
              }
            })().catch(() => { });
            return; // 銝??湔 UI嚗??箸?歇銝???          }
        }
      } catch (e) {
        console.warn("[SurvivalOnline] 瑼Ｘ蝛箸?仃??", e);
      }

      // 摰日?港??迎?鈭箸頞?銝???蝘餃??啣??亦??恕?瑟???      try {
        if (_isHost) {
          const arr = Array.from(_membersState.values()).filter(x => x && x.uid);
          if (arr.length > MAX_PLAYERS) {
            const extras = arr
              .filter(x => x.role !== "host" && x.uid !== _uid)
              .sort((a, b) => _joinedAtMs(b) - _joinedAtMs(a)); // ??啁??芸?蝘餃
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
          _setText("survival-online-status", "雿歇鋡怠恕?瑞宏?粹?隡?);
          leaveRoom().catch(() => { });
          closeLobbyToStart(); // ???ａ??輸?敺??圈??脤?憪??          return;
        }
        const msg = (err && err.message) ? String(err.message) : "????航炊";
        _setText("survival-online-status", `????航炊嚗?{msg}`);
        console.warn("[SurvivalOnline] members listener error:", err);
      } catch (_) { }
    }
  );
}

async function hostKickMember(targetUid) {
  if (!_activeRoomId || !_isHost) return;
  if (!targetUid || targetUid === _uid) return;
  // 摰嚗頦ａ?摰日
  const m = _membersState.get(targetUid);
  if (m && m.role === "host") return;
  try {
    await deleteDoc(memberDocRef(_activeRoomId, targetUid));
    // M2嚗??◤頦Ｙ摰嗥???撠情
    try {
      if (typeof RemotePlayerManager !== "undefined" && RemotePlayerManager.remove) {
        RemotePlayerManager.remove(targetUid);
      }
    } catch (_) { }
    _setText("survival-online-status", "撌脩宏?粹?隡???);
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : "蝘餃憭望?";
    _setText("survival-online-status", `蝘餃憭望?嚗?{msg}`);
  }
}

async function hostDisbandTeam() {
  if (!_activeRoomId || !_isHost) return;
  // 頠圾?????room status 閮剔 closed嚗??犖 listener ????  try {
    await updateDoc(roomDocRef(_activeRoomId), { status: "closed", updatedAt: serverTimestamp() });
  } catch (_) { }
  await leaveRoom().catch(() => { });
  closeLobbyToStart(); // ???ａ??輸?敺??圈??脤?憪??  _setText("survival-online-status", "??撌脰圾??);
}

function listenSignals(roomId) {
  if (_signalsUnsub) { try { _signalsUnsub(); } catch (_) { } }
  // 瘜冽?嚗here + orderBy(createdAt) ??瘙??揣撘??箔???撱箇揣撘?暻餌??  // ?ㄐ?寞??芰 where(toUid==me) + limit嚗敺?瘨祥?芷?喳嚗?摨?祈身閮???嚗?  const q = query(
    signalsColRef(roomId),
    where("toUid", "==", _uid),
    limit(50)
  );
  _signalsUnsub = onSnapshot(
    q,
    (snap) => {
      console.log(`[SurvivalOnline] listenSignals: ?嗅 ${snap.docChanges().length} ?縑???循);
      // ?嚗蝙??for...of 敺芰蝣箔??唳郊????摨銵?      (async () => {
        for (const ch of snap.docChanges()) {
          if (ch.type !== "added") {
            console.log(`[SurvivalOnline] listenSignals: 頝喲???added 霈 type=${ch.type}`);
            continue;
          }
          const sig = ch.doc.data() || {};
          const sid = ch.doc.id;
          console.log(`[SurvivalOnline] listenSignals: ??靽∟? sid=${sid}, type=${sig.type}, fromUid=${sig.fromUid}, toUid=${sig.toUid}`);
          try {
            await handleSignal(sig);
          } catch (e) {
            console.error(`[SurvivalOnline] listenSignals: ??靽∟?憭望?:`, e);
          }
          // 瘨祥敺?歹??踹??
          try {
            await deleteDoc(doc(_db, "rooms", roomId, "signals", sid));
            console.log(`[SurvivalOnline] listenSignals: 撌脣?支縑??sid=${sid}`);
          } catch (e) {
            console.error(`[SurvivalOnline] listenSignals: ?芷靽∟?憭望?:`, e);
          }
        }
      })();
    },
    (err) => {
      // ?踹??ncaught Error in snapshot listener???湔??賢????內
      try {
        const msg = (err && err.message) ? String(err.message) : "???券隤?;
        _setText("survival-online-status", `靽∩誘???航炊嚗?{msg}`);
        console.warn("[SurvivalOnline] signals listener error:", err);
      } catch (_) { }
    }
  );
}

// ?? WebSocket ????async function connectWebSocket() {
  if (!_activeRoomId || !_uid) {
    console.log(`[SurvivalOnline] connectWebSocket: 頝喲?嚗ctiveRoomId=${_activeRoomId}, uid=${_uid}`);
    return;
  }
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    console.log(`[SurvivalOnline] connectWebSocket: WebSocket 撌脤?嚗歲?);
    return;
  }
  if (_ws) {
    // ????
    try {
      _ws.close();
    } catch (_) { }
  }

  console.log(`[SurvivalOnline] connectWebSocket: ????嚗ctiveRoomId=${_activeRoomId}, uid=${_uid}, isHost=${_isHost}`);

  try {
    _ws = new WebSocket(WEBSOCKET_SERVER_URL);

    _ws.onopen = () => {
      console.log(`[SurvivalOnline] connectWebSocket: WebSocket 撌脫??);
      _wsReconnectAttempts = 0;

      // ?潮??交????      _ws.send(JSON.stringify({
        type: 'join',
        roomId: _activeRoomId,
        uid: _uid,
        isHost: _isHost
      }));

      // ??????剁??ONFIG?唳?唳??∪嚗鈭?鈭箇???
      if (typeof CONFIG !== 'undefined') {
        // ?芸???閬?CONFIG?唳嚗?撠???
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
        }, 100); // 撱嗉?100ms蝖桐?餈撌脣遣蝡?      }

      // ??????剁???曆縑?臬??剁??其?頝臬頧西???蝑?
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
        }, 200); // 撱嗉?200ms蝖桐?CONFIG撌脣???      }

      // ??????剁????之撠??剁?蝖桐?銝恥?瑞垢銝?湛?
      // 720P銋悍?潘?3840x2160 (1280*3 x 720*3)
      // 4K璅∪?嚗?桀???蝵?      if (typeof Game !== 'undefined' && typeof Game.worldWidth === 'number' && typeof Game.worldHeight === 'number') {
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
        }, 300); // 撱嗉?300ms蝖桐??啣靽⊥撌脣???      }

      Runtime.setEnabled(true);
      _setText("survival-online-status", "撌脤??嚗ebSocket嚗?);
    };

    _ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);

        if (msg.type === 'joined') {
          console.log(`[SurvivalOnline] connectWebSocket: 撌脣??交?);
        } else if (msg.type === 'game-data') {
          // ????豢?
          const data = msg.data;
          // ?芸?雿輻 fromUid嚗ebSocket 瘨?澆?嚗??嗆活雿輻 uid
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
            // ??MMORPG ?嗆?嚗??摰園?? enemy_damage 瘨嚗?甇亙隞摰嗥??瑕拿
            _handleEnemyDamageMessage(senderUid, data);
          } else if (data.t === "ultimate_pineapple") {
            // ??MMORPG ?嗆?嚗??摰園?? ultimate_pineapple 瘨嚗?甇仿陶璇典之蝯??賜
            _handleUltimatePineappleMessage(senderUid, data);
          } else if (data.t === "weapon_upgrade") {
            // ??MMORPG ?嗆?嚗??摰園?? weapon_upgrade 瘨嚗?甇交郎?典?蝝?            _handleWeaponUpgradeMessage(senderUid, data);
          } else if (data.t === "input") {
            // ??MMORPG ?嗆?嚗??摰園?? input 瘨嚗?甇仿?蝔摰嗥宏??            _handleInputMessage(senderUid, data);
          } else if (data.t === "pos") {
            // ??MMORPG ?嗆?嚗???pos 瘨 (Client-Authoritative)
            // ?嗆?啣隞摰嗥?? pos ?豢????湔?砍撠府?拙振????
            // 瑽??泵??onStateMessage ?澆???payload嚗??函??頛?            const pseudoStateMSG = {
              t: "state",
              players: {
                [senderUid]: data // data ?祈澈? x, y, health 蝑?畾?              }
            };
            // 隤輻 Runtime.onStateMessage ?脰??湔
            Runtime.onStateMessage(pseudoStateMSG);
          }
        } else if (msg.type === 'game-state') {
          // ??????剁??交??冽虜???          handleServerGameState(msg.state, msg.timestamp);
        } else if (msg.type === 'user-joined' || msg.type === 'user-left') {
          // ?冽?/?ａ??嚗?賂?
          console.log(`[SurvivalOnline] connectWebSocket: ${msg.type}, uid=${msg.uid}`);
        }
      } catch (e) {
        console.error(`[SurvivalOnline] connectWebSocket: ??瘨憭望?:`, e);
      }
    };

    _ws.onclose = () => {
      console.log(`[SurvivalOnline] connectWebSocket: WebSocket 撌脤??);
      Runtime.setEnabled(false);
      _setText("survival-online-status", "???撌脖葉??);

      // ?芸??????      if (_wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        _wsReconnectAttempts++;
        _setText("survival-online-status", `????銝?.. (${_wsReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        console.log(`[SurvivalOnline] ?芸????閰?${_wsReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

        setTimeout(() => {
          connectWebSocket().catch((e) => {
            console.warn("[SurvivalOnline] ?芸???仃??", e);
          });
        }, RECONNECT_DELAY_MS);
      } else {
        console.log("[SurvivalOnline] ?芸???仃?活?賊?憭?餈?憭批輒");
        _setText("survival-online-status", "???憭望?嚗??之撱?);
        _wsReconnectAttempts = 0;
        setTimeout(() => {
          try {
            if (typeof Game !== "undefined" && Game.gameOver) {
              Game.gameOver();
            }
          } catch (_) { }
          leaveRoom().catch(() => { });
          closeLobbyToStart(); // ???ａ??輸?敺??圈??脤?憪??        }, 1000);
      }
    };

    _ws.onerror = (err) => {
      console.error(`[SurvivalOnline] connectWebSocket: WebSocket ?航炊:`, err);
      // 璉?交?行霂髡?秤嚗irefox ??Chrome ??霂臭縑?臭???
      const errorMsg = err.message || err.toString() || '';
      const isCertError = errorMsg.includes('CERT_AUTHORITY_INVALID') ||
        errorMsg.includes('SEC_ERROR_UNKNOWN_ISSUER') ||
        errorMsg.includes('SSL_ERROR_BAD_CERT_DOMAIN') ||
        errorMsg.includes('霂髡') ||
        errorMsg.includes('certificate');

      if (isCertError) {
        // Firefox ?閬??祈挪??HTTPS 憿菟?亙?霂髡
        const browser = navigator.userAgent.includes('Firefox') ? 'Firefox' : '瘚???;
        _setText("survival-online-status", `???憭望?嚗ebSocket ?航炊嚗?瑼Ｘ蝬脩窗??嚗);
        console.warn(`[SurvivalOnline] 霂髡?秤嚗ebSocket ??憭望?嚗?瑼Ｘ蝬脩窗??`);
      } else {
        _setText("survival-online-status", "???憭望?嚗ebSocket ?航炊");
      }
    };

  } catch (e) {
    console.error(`[SurvivalOnline] connectWebSocket: ??憭望?:`, e);
    _ws = null;
    throw e;
  }
}

// ??撌脣?歹??? WebRTC ?賣嚗onnectClientToHost, hostAcceptOffer嚗?// 蝟餌絞撌脣?? WebSocket嚗???閬?WebRTC ?賊?隞?Ⅳ

// ?? WebSocket ?潮???function _sendViaWebSocket(obj) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    try {
      _ws.send(JSON.stringify({
        type: 'game-data',
        roomId: _activeRoomId,
        uid: _uid,
        data: obj
      }));
      // 瘛餃??亙?隞亦＆霈文???隞笆 pos 瘨嚗?敹?憭?
      if (obj.t === "pos") {
        console.log(`[SurvivalOnline] _sendViaWebSocket: 撌脩??${obj.t} 瘨, isHost=${_isHost}, uid=${_uid}`);
      }
    } catch (e) {
      console.error(`[SurvivalOnline] _sendViaWebSocket: ?潮仃??`, e);
    }
  } else {
    console.warn(`[SurvivalOnline] _sendViaWebSocket: WebSocket 銝?剁?瘨?芰?, {
      wsReadyState: _ws ? _ws.readyState : 'null',
      messageType: obj.t
    });
  }
}

// ?? Firebase ?潮??荔??蹂誨 WebRTC DataChannel嚗?async function sendMessageViaFirebase(toUid, message) {
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
    console.error(`[SurvivalOnline] sendMessageViaFirebase: ?潮仃??`, e);
    throw e;
  }
}

// ?? Firebase 瘨嚗隞?WebRTC DataChannel嚗?let _messagesUnsub = null;
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

          // ??瘨
          try {
            if (_isHost) {
              handleHostDataMessage(fromUid, message);
            } else {
              // ?蝡航?????host ????              if (message.t === "state") {
                Runtime.onStateMessage(message);
              } else if (message.t === "event") {
                Runtime.onEventMessage(message);
              } else if (message.t === "snapshot") {
                Runtime.onSnapshotMessage(message);
              }
            }
          } catch (e) {
            console.error(`[SurvivalOnline] listenMessages: ??瘨憭望?:`, e);
          }

          // 璅??箏歇瘨祥銝血??          try {
            await updateDoc(msgDoc.ref, { consumed: true });
            await deleteDoc(msgDoc.ref);
          } catch (e) {
            console.error(`[SurvivalOnline] listenMessages: 璅?瘨憭望?:`, e);
          }
        }
      })();
    },
    (err) => {
      console.error(`[SurvivalOnline] listenMessages: ???航炊:`, err);
    }
  );
}

// M5嚗??翰?抒策???嚗?潮???敺抬?
function sendFullSnapshotToClient(targetUid) {
  if (!_isHost || !targetUid) return;
  try {
    const snapshot = collectSnapshot();
    if (!snapshot) return;

    // 瘛餃?憿???縑?荔??萎犖???賜蝑?
    const fullSnapshot = {
      ...snapshot,
      t: "full_snapshot", // 璅??箏?翰??      sessionId: (typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.sessionId) ? Game.multiplayer.sessionId : null,
      gameTime: (typeof Game !== "undefined" && typeof Game.gameTime === "number") ? Game.gameTime : 0,
      currentWave: (typeof WaveSystem !== "undefined" && typeof WaveSystem.currentWave === "number") ? WaveSystem.currentWave : 1,
      enemies: [],
      experienceOrbs: [],
      chests: [],
      projectiles: []
    };

    // ?園???鈭箇???    try {
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

    // ?園????撽????    try {
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

    // ?園???窄蝞梁???    try {
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

    // ?潮策???嚗? WebSocket 撱?嚗?????潛策?格??冽嚗?    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _sendViaWebSocket(fullSnapshot);
      console.log(`[SurvivalOnline] M5: 撌脩??翰?抒策? ${targetUid}`);
    }
  } catch (e) {
    console.warn("[SurvivalOnline] M5: ?潮?翰?批仃??", e);
  }
}

// MMO ?嗆?嚗?隞嗅誨?剔頂蝯梧?瘥摰園撱??芸楛??隞塚?
function broadcastEvent(eventType, eventData) {
  // ??MMO ?嗆?嚗??摰園撱??芸楛??隞塚?銝?鞈湧??瑞垢
  if (!_activeRoomId) return;
  const event = {
    t: "event",
    type: eventType,
    data: eventData,
    timestamp: Date.now()
  };
  // 雿輻 WebSocket 撱?蝯行???client嚗????其葉蝜潘?銝??IP嚗?  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _sendViaWebSocket(event);
  }
}

// ???餈質馱嚗甇?DDoS ?翰?剁?
const _rateLimitTracker = new Map(); // uid -> { lastResetTime, counts: { damage, input, upgrade, lifesteal } }

function _checkRateLimit(uid, type, maxPerSecond) {
  const now = Date.now();
  if (!_rateLimitTracker.has(uid)) {
    _rateLimitTracker.set(uid, { lastResetTime: now, counts: {} });
  }
  const tracker = _rateLimitTracker.get(uid);

  // 瘥??蔭閮
  if (now - tracker.lastResetTime >= 1000) {
    tracker.counts = {};
    tracker.lastResetTime = now;
  }

  // ??????  if (!tracker.counts[type]) {
    tracker.counts[type] = 0;
  }

  // 瑼Ｘ?臬頞??
  tracker.counts[type]++;
  if (tracker.counts[type] > maxPerSecond) {
    return false; // 頞??
  }
  return true; // ?迂
}

function _cleanupRateLimitTracker() {
  const now = Date.now();
  for (const [uid, tracker] of _rateLimitTracker.entries()) {
    // 皜?頞? 5 蝘??暑??餈質馱
    if (now - tracker.lastResetTime > 5000) {
      _rateLimitTracker.delete(uid);
    }
  }
}

// ??????剁?憭???冽虜???// ??銝蔣???綽??芸憭犖璅∪?銝銵??? Runtime.setEnabled ?批嚗?function handleServerGameState(state, timestamp) {
  if (!state || typeof state !== 'object') return;

  // ??摰璉?伐??芸憭犖璅∪?銝銵?  if (typeof Game === 'undefined' || !Game.multiplayer) return;

  try {
    // ?湔?拙振?嗆?    if (Array.isArray(state.players)) {
      for (const playerState of state.players) {
        if (playerState.uid === _uid) {
          // ?砍?拙振嚗?郊?喲?嗆?銵???嚗?雿蔭?梯??交??          if (typeof Game !== 'undefined' && Game.player) {
            Game.player.health = playerState.health || Game.player.health;
            Game.player.maxHealth = playerState.maxHealth || Game.player.maxHealth;
            Game.player.energy = playerState.energy || Game.player.energy;
            Game.player.maxEnergy = playerState.maxEnergy || Game.player.maxEnergy;
            Game.player.level = playerState.level || Game.player.level;
            Game.player.experience = playerState.experience || Game.player.experience;
            Game.player.gold = playerState.gold || Game.player.gold;
          }
        } else {
          // 餈??拙振嚗?唬?蝵桀??嗆?          updateRemotePlayerFromServer(playerState);
        }
      }
    }

    // ?湔?犖嚗??∪??嚗?    if (Array.isArray(state.enemies)) {
      updateEnemiesFromServer(state.enemies);
    }

    // ?湔???抬???冽?憡?
    if (Array.isArray(state.projectiles)) {
      updateProjectilesFromServer(state.projectiles);
    }

    // ?湔蝏?????冽?憡?
    if (Array.isArray(state.experienceOrbs)) {
      updateExperienceOrbsFromServer(state.experienceOrbs);
    }

    // ???湔頝臬頧西?嚗??∪??嚗?    if (Array.isArray(state.carHazards)) {
      updateCarHazardsFromServer(state.carHazards);
    }

    // ?湔瘜Ｘ活
    if (typeof state.wave === 'number' && typeof WaveSystem !== 'undefined') {
      WaveSystem.currentWave = state.wave;
      if (typeof UI !== 'undefined' && UI.updateWaveInfo) {
        UI.updateWaveInfo(state.wave);
      }
    }

    // ?湔皜豢??嗆?    if (typeof Game !== 'undefined') {
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
    console.error('[SurvivalOnline] 憭???冽虜??仃韐?', e);
  }
}

// ??銝蔣???綽??芸憭犖璅∪?銝銵?function updateRemotePlayerFromServer(playerState) {
  if (typeof Game === 'undefined' || !Game.multiplayer) return;

  // 雿輻 RemotePlayerManager ?湔餈??拙振
  if (typeof RemotePlayerManager !== 'undefined' && typeof RemotePlayerManager.get === 'function') {
    let remotePlayer = RemotePlayerManager.get(playerState.uid);
    if (!remotePlayer) {
      // ?遣餈??拙振
      if (typeof RemotePlayerManager.create === 'function') {
        remotePlayer = RemotePlayerManager.create(playerState.uid, playerState);
      }
    }
    if (remotePlayer) {
      // ?湔雿蔭嚗??澆像皛?
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

      // ?湔?嗆?      remotePlayer.health = playerState.health || remotePlayer.health;
      remotePlayer.maxHealth = playerState.maxHealth || remotePlayer.maxHealth;
      remotePlayer.energy = playerState.energy || remotePlayer.energy;
      remotePlayer.maxEnergy = playerState.maxEnergy || remotePlayer.maxEnergy;
      remotePlayer.level = playerState.level || remotePlayer.level;
      remotePlayer.facing = playerState.facing || remotePlayer.facing;
      remotePlayer.isDead = playerState.isDead || false;
    }
  }
}

// ??銝蔣???綽??芸憭犖璅∪?銝銵?function updateEnemiesFromServer(enemies) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.enemies) return;

  // ?遣?犖ID??
  const serverEnemyIds = new Set(enemies.map(e => e.id));
  const localEnemyIds = new Set(Game.enemies.map(e => e.id));

  // 蝘駁??其?摮??鈭?  for (let i = Game.enemies.length - 1; i >= 0; i--) {
    if (!serverEnemyIds.has(Game.enemies[i].id)) {
      Game.enemies.splice(i, 1);
    }
  }

  // ?湔??撱箸?鈭?  for (const enemyState of enemies) {
    let enemy = Game.enemies.find(e => e.id === enemyState.id);
    if (!enemy && typeof Enemy !== 'undefined') {
      // ?遣?唳?鈭?      enemy = new Enemy(enemyState.x, enemyState.y, enemyState.type);
      enemy.id = enemyState.id;
      Game.enemies.push(enemy);
    }
    if (enemy) {
      // ?湔雿蔭???      enemy.x = enemyState.x;
      enemy.y = enemyState.y;
      enemy.health = enemyState.health;
      enemy.maxHealth = enemyState.maxHealth;

      // ??MMORPG ?嗆?嚗?甇交鈭箸香鈭∠???霈??摰園?賜??唳香鈭∪???      if (typeof enemyState.isDying === 'boolean') {
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

      // ??MMORPG ?嗆?嚗?甇交鈭箏??瑞???霈??摰園?賜???      if (typeof enemyState.hitFlashTime === 'number') {
        enemy.hitFlashTime = enemyState.hitFlashTime;
      }

      if (enemyState.isDead) {
        enemy.health = 0;
        enemy.markedForDeletion = true;
      }
    }
  }
}

// ??銝蔣???綽??芸憭犖璅∪?銝銵?function updateProjectilesFromServer(projectiles) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.projectiles) return;

  // ?遣???呼D??
  const serverProjectileIds = new Set(projectiles.map(p => p.id));
  const localProjectileIds = new Set(Game.projectiles.map(p => p.id));

  // 蝘駁??其?摮??撠
  for (let i = Game.projectiles.length - 1; i >= 0; i--) {
    if (!serverProjectileIds.has(Game.projectiles[i].id)) {
      Game.projectiles.splice(i, 1);
    }
  }

  // ?湔??撱箸?撠
  for (const projState of projectiles) {
    let proj = Game.projectiles.find(p => p.id === projState.id);
    if (!proj && typeof Projectile !== 'undefined') {
      // ?遣?唳?撠嚗?閫?嚗?      proj = new Projectile(projState.x, projState.y, projState.angle, projState.weaponType, 0, projState.speed, projState.size);
      proj.id = projState.id;
      proj._isVisualOnly = true; // 隞?閫?隡文拿?望??∪霈∠?
      Game.projectiles.push(proj);
    }
    if (proj) {
      // ?湔雿蔭
      proj.x = projState.x;
      proj.y = projState.y;
      proj.angle = projState.angle;
    }
  }
}

// ??銝蔣???綽??芸憭犖璅∪?銝銵?function updateCarHazardsFromServer(carHazards) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.projectiles) return;
  if (typeof CarHazard === 'undefined') return;

  // ?遣頧西?ID??
  const serverCarIds = new Set(carHazards.map(c => c.id));

  // 蝘駁??其?摮?膠颲?隞rojectiles?啁?銝剔宏?歹?
  for (let i = Game.projectiles.length - 1; i >= 0; i--) {
    const proj = Game.projectiles[i];
    if (proj && (proj.weaponType === 'INTERSECTION_CAR' || (proj.constructor && proj.constructor.name === 'CarHazard'))) {
      if (!serverCarIds.has(proj.id)) {
        Game.projectiles.splice(i, 1);
      }
    }
  }

  // ?湔??撱箄膠颲?  for (const carState of carHazards) {
    let car = Game.projectiles.find(p => p.id === carState.id && (p.weaponType === 'INTERSECTION_CAR' || (p.constructor && p.constructor.name === 'CarHazard')));
    if (!car) {
      // ?遣?啗膠颲?隞?閫?隡文拿?望??∪霈∠?嚗?      car = new CarHazard({
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
      car._isVisualOnly = true; // 隞?閫?隡文拿?望??∪霈∠?
      Game.projectiles.push(car);
    }
    if (car) {
      // ?湔雿蔭?漲
      car.x = carState.x;
      car.y = carState.y;
      car.vx = carState.vx;
      car.vy = carState.vy;
      car.hitPlayer = carState.hitPlayer || false;
    }
  }
}

// ??銝蔣???綽??芸憭犖璅∪?銝銵?function updateExperienceOrbsFromServer(orbs) {
  if (typeof Game === 'undefined' || !Game.multiplayer || !Game.experienceOrbs) return;

  // ?遣蝏??D??
  const serverOrbIds = new Set(orbs.map(o => o.id));

  // 蝘駁??其?摮??撉?
  for (let i = Game.experienceOrbs.length - 1; i >= 0; i--) {
    if (!serverOrbIds.has(Game.experienceOrbs[i].id)) {
      Game.experienceOrbs.splice(i, 1);
    }
  }

  // ?湔??撱箇?撉?
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

// ??MMORPG ?嗆?嚗???enemy_damage 瘨嚗??摰園?臭誑隤輻嚗?function _handleEnemyDamageMessage(fromUid, msg) {
  if (!msg || typeof msg !== "object") return;
  if (!fromUid || typeof fromUid !== "string") {
    // fromUid ?⊥?嚗?閰血? msg 銝剔??    fromUid = (msg.playerUid && typeof msg.playerUid === "string") ? msg.playerUid : null;
    if (!fromUid) {
      console.warn("[SurvivalOnline] _handleEnemyDamageMessage: fromUid ?⊥?", fromUid);
      return;
    }
  }

  // ???嚗?蝘?憭?2000 甈∪摰喉??脫迫 DDoS嚗??迂甇?虜擃撥摨行擛伐?
  // 閮?嚗?閮?20 ?郎??? 3 甈?蝘?? 20 ?鈭?= 1200 甈?蝘??????瑕拿??賜? 800 甈?蝘?= 2000 甈?蝘?  if (!_checkRateLimit(fromUid, "damage", 2000)) {
    console.warn("[SurvivalOnline] ?瑕拿????嚗蕭??", fromUid);
    return;
  }

  const enemyId = typeof msg.enemyId === "string" ? msg.enemyId : null;
  const damage = typeof msg.damage === "number" ? Math.max(0, msg.damage) : 0;
  const weaponType = typeof msg.weaponType === "string" ? msg.weaponType : "UNKNOWN";
  const isCrit = (msg.isCrit === true);
  const playerUid = typeof msg.playerUid === "string" ? msg.playerUid : fromUid; // ?潮摰喟??拙振UID
  const lifesteal = typeof msg.lifesteal === "number" ? Math.max(0, msg.lifesteal) : 0; // ?貉???
  if (!enemyId || damage <= 0) return;

  // ??MMORPG ?嗆?嚗歲?撌梁??瑕拿瘨嚗??銴?蝞?
  // ??芸楛???摰喳歇蝬?砍閮???
  if (playerUid === _uid) {
    return; // 頝喲??芸楛?摰單???  }

  // ?曉撠??鈭?  try {
    if (typeof Game !== "undefined" && Array.isArray(Game.enemies)) {
      const enemy = Game.enemies.find(e => e && e.id === enemyId);
      if (enemy && !enemy.markedForDeletion && !enemy.isDying) {
        // ??MMORPG ?嗆?嚗??萎犖???瑕拿嚗?甇亙隞摰嗥??瑕拿嚗?        // 瘜冽?嚗ㄐ銝??啗?蝞摰喉???嗡??拙振撌脩?閮???嚗??祉???憭抵釵嚗?        enemy.takeDamage(damage, {
          weaponType: weaponType,
          playerUid: playerUid,
          isCrit: isCrit,
          dirX: 0,
          dirY: -1
        });

        // ??MMORPG ?嗆?嚗????臬??急??縑?荔??郊皜???蝣箔???摰園?賜??唳鈭箄◤皜?閬死??嚗?        const slowMs = typeof msg.slowMs === "number" ? msg.slowMs : null;
        const slowFactor = typeof msg.slowFactor === "number" ? msg.slowFactor : null;
        if (slowMs !== null && slowFactor !== null && typeof enemy.applySlow === "function") {
          try {
            enemy.applySlow(slowMs, slowFactor);
          } catch (e) {
            console.warn("[SurvivalOnline] ?郊?萎犖皜??仃??", e);
          }
        }

        // 憿舐內?瑕拿?詨?嚗??摰園?賜??啣隞摰嗥??瑕拿嚗?        if (typeof DamageNumbers !== "undefined" && typeof DamageNumbers.show === "function") {
          DamageNumbers.show(damage, enemy.x, enemy.y - (enemy.height || 0) / 2, isCrit, {
            dirX: 0,
            dirY: -1,
            enemyId: enemyId
          });
        }

        // ??MMORPG ?嗆?嚗?甇交???? (Knockback)
        // ? "Real Banana" ???蛛?憒? A ?鈭箸?憌?B 銋????唳鈭粹??箏嚗??蝵格?銝?甇?        const kbX = typeof msg.knockbackX === "number" ? msg.knockbackX : 0;
        const kbY = typeof msg.knockbackY === "number" ? msg.knockbackY : 0;

        if ((kbX !== 0 || kbY !== 0)) {
          // ?湔靽格?萎犖?漲嚗芋?祈◤?
          if (typeof enemy.vx === 'number') enemy.vx = kbX;
          if (typeof enemy.vy === 'number') enemy.vy = kbY;
        }
      }
    }
  } catch (e) {
    console.warn("[SurvivalOnline] ?郊?萎犖?瑕拿憭望?:", e);
  }

  // ???貉??摩嚗??貉????典???拙振
  if (lifesteal > 0 && playerUid) {
    // ???嚗?蝘?憭?2000 甈∪銵嚗??瑕拿?郊嚗?    if (!_checkRateLimit(fromUid, "lifesteal", 2000)) {
      // ?貉??????蕭?伐?雿?敶梢?瑕拿??
      return;
    }

    try {
      // ?曉撠???蝔摰?      let remotePlayer = null;
      if (typeof RemotePlayerManager !== 'undefined' && typeof RemotePlayerManager.get === 'function') {
        remotePlayer = RemotePlayerManager.get(playerUid);
      }

      if (remotePlayer && typeof remotePlayer.health === 'number' && typeof remotePlayer.maxHealth === 'number') {
        // ??貉??儔
        remotePlayer.health = Math.min(remotePlayer.maxHealth, remotePlayer.health + lifesteal);
      }
    } catch (e) {
      console.warn("[SurvivalOnline] ?郊?貉?憭望?:", e);
    }
  }
}

// ??MMORPG ?嗆?嚗???weapon_upgrade 瘨嚗??摰園?臭誑隤輻嚗?function _handleWeaponUpgradeMessage(fromUid, msg) {
  if (!msg || typeof msg !== "object") return;
  if (!fromUid || typeof fromUid !== "string") {
    console.warn("[SurvivalOnline] _handleWeaponUpgradeMessage: fromUid ?⊥?", fromUid);
    return;
  }

  // ???嚗?蝘?憭?10 甈⊥郎?典?蝝??脫迫瞈怎嚗?  if (!_checkRateLimit(fromUid, "upgrade", 10)) {
    console.warn("[SurvivalOnline] 甇血??????嚗蕭??", fromUid);
    return;
  }

  const weaponType = typeof msg.weaponType === "string" ? msg.weaponType : null;
  if (!weaponType) {
    console.warn("[SurvivalOnline] _handleWeaponUpgradeMessage: weaponType ?⊥?", weaponType);
    return;
  }

  // 頝喲??芸楛?郎?典?蝝??荔??撌脩??冽?啗???鈭?
  if (fromUid === _uid) {
    return;
  }

  // ???迤?MORPG嚗?啣??????拙振銝行??冽郎?典?蝝?  console.log(`[SurvivalOnline] _handleWeaponUpgradeMessage: ??甇血??, fromUid=${fromUid}, weaponType=${weaponType}`);
  try {
    let remotePlayer = null;
    if (typeof RemotePlayerManager !== 'undefined' && typeof RemotePlayerManager.get === 'function') {
      remotePlayer = RemotePlayerManager.get(fromUid);
    }

    if (remotePlayer && typeof remotePlayer.addWeapon === 'function') {
      // 瑼Ｘ?臬撌脫?甇斗郎??      const existingWeapon = remotePlayer.weapons ? remotePlayer.weapons.find(w => w && w.type === weaponType) : null;

      if (existingWeapon) {
        // 憒?撌脫?甇斗郎?剁???蝝?        console.log(`[SurvivalOnline] _handleWeaponUpgradeMessage: ???暹?甇血 ${weaponType}, ?嗅?蝑?=${existingWeapon.level || 1}`);
        if (typeof remotePlayer.upgradeWeapon === 'function') {
          remotePlayer.upgradeWeapon(weaponType);
        } else if (existingWeapon.levelUp && typeof existingWeapon.levelUp === 'function') {
          existingWeapon.levelUp();
        }
      } else {
        // ?血?瘛餃??唳郎??        console.log(`[SurvivalOnline] _handleWeaponUpgradeMessage: 瘛餃??唳郎??${weaponType}`);
        remotePlayer.addWeapon(weaponType);
      }
      console.log(`[SurvivalOnline] _handleWeaponUpgradeMessage: ???拙振 ${fromUid} ?郎?典?銵?`, remotePlayer.weapons ? remotePlayer.weapons.map(w => `${w.type}(Lv${w.level || 1})`) : []);
    } else {
      console.warn("[SurvivalOnline] _handleWeaponUpgradeMessage: ?曆??圈?蝔摰?, fromUid);
    }
  } catch (e) {
    console.warn("[SurvivalOnline] ?郊甇血??憭望?:", e);
  }
}

// ??MMORPG ?嗆?嚗???input 瘨嚗??摰園?臭誑隤輻嚗?function _handleInputMessage(fromUid, msg) {
  if (!msg || typeof msg !== "object") return;
  if (!fromUid || typeof fromUid !== "string") {
    console.warn("[SurvivalOnline] _handleInputMessage: fromUid ?⊥?", fromUid);
    return;
  }

  // ???嚗?蝘?憭?60 甈∟撓?伐??脫迫瞈怎嚗??迂甇?虜蝘餃?嚗?  if (!_checkRateLimit(fromUid, "input", 60)) {
    // 頛詨?????蕭?伐?雿?敶梢?嗡??
    return;
  }

  const inputX = typeof msg.x === "number" ? msg.x : 0;
  const inputY = typeof msg.y === "number" ? msg.y : 0;

  // 頝喲??芸楛?撓?交??荔??撌脩??冽?啗???鈭?
  if (fromUid === _uid) {
    return;
  }

  // ?曉撠???蝔摰嗡蒂?湔頛詨
  try {
    let remotePlayer = null;
    if (typeof RemotePlayerManager !== 'undefined' && typeof RemotePlayerManager.get === 'function') {
      remotePlayer = RemotePlayerManager.get(fromUid);
    }

    if (remotePlayer) {
      // ?湔???拙振?撓??      remotePlayer._remoteInput = { x: inputX, y: inputY };
      remotePlayer._lastRemoteInputTime = Date.now();
    }
  } catch (e) {
    console.warn("[SurvivalOnline] ?郊頛詨憭望?:", e);
  }
}

// ??MMORPG ?嗆?嚗???ultimate_pineapple 瘨嚗??摰園?臭誑隤輻嚗?function _handleUltimatePineappleMessage(fromUid, msg) {
  if (!msg || typeof msg !== "object") return;
  if (!fromUid || typeof fromUid !== "string") {
    console.warn("[SurvivalOnline] _handleUltimatePineappleMessage: fromUid ?⊥?", fromUid);
    return;
  }

  // ???嚗?蝘?憭?5 甈⊿陶璇典之蝯??脫迫瞈怎嚗?  if (!_checkRateLimit(fromUid, "ultimate", 5)) {
    console.warn("[SurvivalOnline] 曈單◢憭抒?????嚗蕭??", fromUid);
    return;
  }

  const x = typeof msg.x === "number" ? msg.x : 0;
  const y = typeof msg.y === "number" ? msg.y : 0;

  // 頝喲??芸楛?陶璇典之蝯??荔??撌脩??冽?啗???鈭?
  if (fromUid === _uid) {
    return;
  }

  // ?曉撠???蝔摰嗡蒂??曈單◢???  try {
    let remotePlayer = null;
    if (typeof RemotePlayerManager !== 'undefined' && typeof RemotePlayerManager.get === 'function') {
      remotePlayer = RemotePlayerManager.get(fromUid);
    }

    // 雿輻???拙振??蝵殷?憒??舐嚗??血?雿輻瘨銝剔?雿蔭
    const spawnX = (remotePlayer && typeof remotePlayer.x === "number") ? remotePlayer.x : x;
    const spawnY = (remotePlayer && typeof remotePlayer.y === "number") ? remotePlayer.y : y;

    // ??曈單◢??抬???摰園?賜??堆?
    if (typeof Game !== "undefined" && typeof Game.spawnPineappleUltimatePickup === "function") {
      Game.spawnPineappleUltimatePickup(spawnX, spawnY, {});
    }
  } catch (e) {
    console.warn("[SurvivalOnline] ?郊曈單◢憭抒?憭望?:", e);
  }
}

function handleHostDataMessage(fromUid, msg) {
  if (!msg || typeof msg !== "object") return;
  if (!fromUid || typeof fromUid !== "string") {
    console.warn("[SurvivalOnline] handleHostDataMessage: fromUid ?⊥?", fromUid);
    return;
  }
  if (msg.t === "reconnect_request") {
    // M5嚗??∟?瘙?翰?改???敺抬?
    if (_isHost && typeof Game !== "undefined" && Game.multiplayer && Game.multiplayer.enabled) {
      sendFullSnapshotToClient(fromUid);
    }
    return;
  } else if (msg.t === "pos") {
    // ?嗅?拙振雿蔭嚗恕?瑕?蝮賢?撱?
    // ?活瑼Ｘ fromUid嚗甇Ｙ楨摮?憿?
    if (!fromUid || typeof fromUid !== "string") {
      console.warn("[SurvivalOnline] handleHostDataMessage: pos 瘨 fromUid ?⊥?", fromUid);
      return;
    }
    const player = _membersState ? (_membersState.get(fromUid) || {}) : {};
    const name = typeof player.name === "string" ? player.name : (fromUid && typeof fromUid.slice === "function" ? fromUid.slice(0, 6) : "unknown");
    const x = typeof msg.x === "number" ? msg.x : 0;
    const y = typeof msg.y === "number" ? msg.y : 0;

    // ?脣?????淌D?予鞈衣?蝝?    const member = _membersState ? _membersState.get(fromUid) : null;
    const characterId = (member && member.characterId) ? member.characterId : null;
    const talentLevels = (member && member.talentLevels && typeof member.talentLevels === 'object') ? member.talentLevels : null;

    // ?脣????拙振撠情嚗??歇摮嚗誑?脣?摰???    let remotePlayer = null;
    try {
      if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.get === "function") {
        remotePlayer = RemotePlayerManager.get(fromUid);
      }
    } catch (_) { }

    // ??host 蝡臭?憿舐內嚗? host ???啣鈭綽?- ?摰??縑??    Runtime.onStateMessage({
      t: "state",
      players: {
        [fromUid]: {
          x,
          y,
          name,
          characterId: characterId,
          // 瘛餃??游???縑?荔?憒????拙振撠情撌脣??剁?
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

    // 敶蜇?典?????host ?芸楛嚗?    const players = {};
    try {
      // host ?芸楛
      if (typeof Game !== "undefined" && Game.player) {
        const hostMember = _membersState ? _membersState.get(_uid) : null;
        const hostCharacterId = (hostMember && hostMember.characterId) ? hostMember.characterId : (Game.selectedCharacter && Game.selectedCharacter.id) ? Game.selectedCharacter.id : null;
        const hostPlayer = Game.player;
        players[_uid] = {
          x: Game.player.x,
          y: Game.player.y,
          name: getPlayerNickname(),
          characterId: hostCharacterId, // 瘛餃?閫ID
          // 瘛餃??游???縑??          health: (hostPlayer && typeof hostPlayer.health === "number") ? hostPlayer.health : 100,
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
    // 撌脩?嗡?鈭綽?Runtime ??+ ?活嚗?    // 雿輻 Set 靘蕭頩文歇????UID嚗??銴?    const processedUids = new Set();
    for (const p of Runtime.getRemotePlayers()) {
      if (processedUids.has(p.uid)) continue; // 頝喲?撌脰???
      processedUids.add(p.uid);

      const member = _membersState ? _membersState.get(p.uid) : null;
      const characterId = (member && member.characterId) ? member.characterId : (p.characterId) ? p.characterId : null;

      // ?脣????拙振撠情嚗??歇摮嚗誑?脣?摰???      let remotePlayer = null;
      try {
        if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.get === "function") {
          remotePlayer = RemotePlayerManager.get(p.uid);
        }
      } catch (_) { }

      players[p.uid] = {
        x: p.x,
        y: p.y,
        name: p.name,
        characterId: characterId, // 瘛餃?閫ID
        // 瘛餃??游???縑?荔?憒????拙振撠情撌脣??剁?
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
    // 瘛餃??活??fromUid嚗???瘝???
    if (!processedUids.has(fromUid)) {
      const fromMember = _membersState ? _membersState.get(fromUid) : null;
      const fromCharacterId = (fromMember && fromMember.characterId) ? fromMember.characterId : null;
      // ?脣????拙振撠情嚗??歇摮嚗誑?脣?摰???      let fromRemotePlayer = null;
      try {
        if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.get === "function") {
          fromRemotePlayer = RemotePlayerManager.get(fromUid);
        }
      } catch (_) { }
      players[fromUid] = {
        x,
        y,
        name: name,
        characterId: fromCharacterId, // 瘛餃?閫ID
        // 瘛餃??游???縑?荔?憒????拙振撠情撌脣??剁?
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

    // 撱?蝯行???client嚗? WebSocket嚗?    // ???芸?嚗??嗅?甇仿? 10Hz嚗?00ms嚗??踹?瘚??之
    // 雿?蝣箔??豢?撌脫?堆?銝?誨蝣澆歇蝬?唬? players嚗?    if (_ws && _ws.readyState === WebSocket.OPEN) {
      const now = Date.now();
      if (now - lastSendAt >= 100) { // 100ms = 10Hz
        _sendViaWebSocket({ t: "state", players });
        lastSendAt = now;
      }
    }
    return;
  }
  if (msg.t === "ultimate_pineapple") {
    // ??MMORPG ?嗆?嚗??摰園?質??陶璇典之蝯??賜??嚗?靘陷?蝡?    _handleUltimatePineappleMessage(fromUid, msg);
    return;
  }

  if (msg.t === "weapon_upgrade") {
    // ??MMORPG ?嗆?嚗??摰園?質??郎?典?蝝?銝?鞈湧??瑞垢
    _handleWeaponUpgradeMessage(fromUid, msg);
    return;
  }

  if (msg.t === "enemy_damage") {
    // ??MMORPG ?嗆?嚗??摰園?? enemy_damage 瘨嚗?甇亙隞摰嗥??瑕拿
    // 瘜冽?嚗ㄐ雿輻 handleHostDataMessage ?舐鈭?敺摰對?雿祕????摰園?府??
    // ?啁?撖衣雿輻 _handleEnemyDamageMessage ?賣嚗??摰園?臭誑隤輻

    // 憒??航撌梁?箇??瑕拿瘨嚗蕭?伐???砍撌脩??葫?瑁?鈭?
    if (fromUid === _uid) {
      return;
    }

    _handleEnemyDamageMessage(fromUid, msg);
    return;
  }

  if (msg.t === "input") {
    // ??MMORPG ?嗆?嚗??摰園?質??撓?交??荔?銝?鞈湧??瑞垢
    _handleInputMessage(fromUid, msg);
    return;
  }
}

// ???瑽???甇文?詨歇鋡?Runtime.sendToNet ?誨嚗????箏?敺摰?// 瘜冽?嚗迨?賣雿輻?? Host-Client ?嗆?嚗???雿輻
// 隢蝙??Runtime.sendToNet ??乩蝙??_sendViaWebSocket
function sendToNet(obj) {
  if (!obj) return;
  // ?? 霅血?嚗迨?賣雿輻?? Host-Client ?嗆?
  // ??MMO ?嗆?嚗?仿? WebSocket ?潮?銝?鞈湧??瑞垢
  _sendViaWebSocket(obj);
}

// ??撌脩陛??handleSignal ?賣嚗ebRTC ?賊?隞?Ⅳ撌脣?歹?
// 瘜冽?嚗迨?賣?曉?芰?潭?恣?縑隞歹?憒?starting ???嚗????WebRTC
// 憒?銝??閬??臭誑摰?芷甇文?詨? listenSignals
async function handleSignal(sig) {
  if (!sig || typeof sig !== "object") {
    console.warn(`[SurvivalOnline] handleSignal: ?⊥?靽∟?`, sig);
    return;
  }
  // 瘜冽?嚗ebRTC ?賊?靽∩誘嚗ffer, answer, candidate嚗歇銝???
  // 甇文?貊?典?冽?輸?蝞∠?靽∩誘嚗????店嚗?  console.log(`[SurvivalOnline] handleSignal: ?嗅靽∟? type=${sig.type}, fromUid=${sig.fromUid}, toUid=${sig.toUid}, isHost=${_isHost}`);
  // ?臭誑?冽迨?溶??恣???靽∩誘??嚗???閬?
}

async function reconnectClient() {
  if (!_activeRoomId || !_uid) return;

  // 皜??????
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }

  try {
    _setText("survival-online-status", "????銝凌?);
  } catch (_) { }

  // 皜???WebSocket ??
  try {
    if (_ws) {
      _ws.onclose = null; // ?踹?閫貊?芸???儐??      _ws.close();
    }
  } catch (_) { }
  _ws = null;
  Runtime.setEnabled(false);

  // 蝑??輸?靽⊥撠梁?
  if (!_activeRoomId) {
    for (let i = 0; i < 20; i++) {
      if (_activeRoomId) break;
      await new Promise(r => setTimeout(r, 100));
    }
  }
  if (!_activeRoomId) {
    _setText("survival-online-status", "?⊥?????嚗銝?輸?");
    return;
  }

  try {
    await connectWebSocket();
  } catch (e) {
    console.warn("[SurvivalOnline] ??仃??", e);
    throw e;
  }
}

// ?芸?皜?摰???let _autoCleanupTimer = null;

function startAutoCleanup() {
  if (!_isHost || _autoCleanupTimer) return;

  // 瘥?5 ???芸?皜?銝甈⊿蝺???  _autoCleanupTimer = setInterval(async () => {
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
          console.warn("[SurvivalOnline] ?芸?皜??憭望?:", m.uid, e);
        }
      }

      // 皜????餈質馱??      _cleanupRateLimitTracker();

      // 瑼Ｘ?輸??臬??嚗???2 撠??芣?堆?
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

          const ROOM_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 撠?
          if (lastUpdateMs > 0 && (Date.now() - lastUpdateMs) > ROOM_EXPIRY_MS) {
            console.warn("[SurvivalOnline] ?輸?撌脤???頞? 2 撠??芣?堆?嚗遣霅啗圾??);
            // 瘜冽?嚗ㄐ?芣霅血?嚗??芸?閫?嚗??粹??脣?賡??券脰?嚗?            // 憒??閬?圾????臭誑??銝?酉??            // await hostDisbandTeam();
          }
        }
      } catch (e) {
        console.warn("[SurvivalOnline] 瑼Ｘ?輸???憭望?:", e);
      }
    } catch (e) {
      console.warn("[SurvivalOnline] ?芸?皜????粹:", e);
    }
  }, 5 * 60 * 1000); // 5 ??
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
    _setText("survival-online-status", "瘝??Ｙ???閬???);
    return;
  }
  const ok = window.confirm(`閬???${stale.length} 雿蝺??∪?嚗);
  if (!ok) return;
  for (const m of stale) {
    await hostKickMember(m.uid);
  }
}

function updateLobbyUI() {
  // ???摮?  const stEl = _qs("survival-online-status");
  if (stEl) {
    let s = "撠???";
    if (_activeRoomId) {
      s = _isHost ? "撌脣遣蝡?? : "撌脣??交??;
      if (!_isHost && _ws && _ws.readyState === WebSocket.OPEN) s = "撌脤??嚗ebSocket嚗?;
      if (_isHost && _ws && _ws.readyState === WebSocket.OPEN) s = "撌脤??嚗ebSocket嚗?;
    }
    stEl.textContent = s;
  }

  _setText("survival-online-room-code-display", _activeRoomId || "-");

  // host 閮剖??批
  const selMap = _qs("survival-online-host-map");
  const selDiff = _qs("survival-online-host-diff");
  if (selMap) selMap.disabled = !_isHost;
  if (selDiff) selDiff.disabled = !_isHost;

  // 閫?豢?銝?獢????蒂?湔?賊?嚗?憿舐內撌脰圾??閫嚗?  const selChar = _qs("survival-online-character-select");
  if (selChar && _activeRoomId) {
    // ?脣?撌脰圾??閫?”
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

    // ?脣??嗅??豢????淌D嚗?蝙?冽??⊥???嗆活雿輻_pendingStartParams嚗?敺蝙?沁ame.selectedCharacter嚗?    let currentCharacterId = null;
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
      // 憒?瘝??豢?閫嚗蝙?券?隤??莎?蝚砌?雿??莎?margaret嚗?      if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS) && CONFIG.CHARACTERS.length > 0) {
        const defaultChar = CONFIG.CHARACTERS.find(c => c && c.id === 'margaret') || CONFIG.CHARACTERS[0];
        if (defaultChar && defaultChar.id) {
          currentCharacterId = defaultChar.id;
        }
      }
    }

    // 瑼Ｘ?臬?閬?圈???踹???皜征撠鈭辣蝬?銝仃嚗?    const existingOptions = Array.from(selChar.options).map(opt => opt.value);
    const shouldUpdate = existingOptions.length === 0 || existingOptions.some(id => !unlockedSet.has(id));

    if (shouldUpdate) {
      // 皜征?暹??賊?
      selChar.innerHTML = "";

      // ?脣?????脤?蝵?      const characters = (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS)) ? CONFIG.CHARACTERS : [];

      // ?芣溶?歇閫??????      for (const char of characters) {
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
      // ?芣?圈銝剔???      if (currentCharacterId) {
        selChar.value = currentCharacterId;
      }
    }

    // 憒??嗅??豢????脖??典歇閫???”銝哨?撘瑕?豢?暺?閫
    if (currentCharacterId && !unlockedSet.has(currentCharacterId)) {
      const defaultOpt = selChar.querySelector('option[value="margaret"]');
      if (defaultOpt) {
        defaultOpt.selected = true;
        currentCharacterId = 'margaret';
      }
    }

    // 瑼Ｘ皞????憒?撌脫???蝳閫?豢?銝?獢?    let isReady = false;
    if (_membersState && _membersState.has(_uid)) {
      const myMember = _membersState.get(_uid);
      if (myMember && myMember.ready === true) {
        isReady = true;
      }
    }
    selChar.disabled = isReady;
  }

  // ??”
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
      const roleLabel = (m.role === "host") ? "摰日" : "?拙振";
      const name = m.name || (m.uid || "").slice(0, 6);
      left.textContent = `${roleLabel}嚗?{name}${stale ? "嚗蝺?" : ""}`;
      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "8px";
      right.style.opacity = "0.95";
      const status = document.createElement("div");
      // stale 閬?芣????踹??∩?摰日??璇辣嚗?      status.textContent = (!stale && m.ready) ? "撌脫??? : "?芣???;
      status.style.opacity = "0.9";
      right.appendChild(status);

      // 摰日??嚗腺鈭綽????恕?瑯??芸楛嚗?      if (_isHost && m && m.uid && m.uid !== _uid && m.role !== "host") {
        const btnKick = document.createElement("button");
        btnKick.className = "ghost";
        btnKick.textContent = "蝘餃";
        btnKick.style.padding = "4px 10px";
        btnKick.style.fontSize = "12px";
        btnKick.addEventListener("click", async () => {
          const ok = window.confirm(`閬???{name}?宏?粹?隡?嚗);
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

  // ????嚗? host ?舐嚗??典皞?
  const btnStart = _qs("survival-online-start");
  if (btnStart) {
    let can = !!_isHost && _activeRoomId;
    if (can) {
      const ms = Array.from(_membersState.values());
      // 閬?嚗?      // - 鈭箸 1~5
      // - ??host ?敹? ready 銝? stale嚗tale 銝敺??箸皞?嚗????雿甇鳴?
      can = ms.length > 0 && ms.length <= MAX_PLAYERS && ms.every((m) => {
        if (!m || !m.uid) return false;
        if (m.role === "host") return true;
        if (_isMemberStale(m)) return false;
        return !!m.ready;
      });
    }
    btnStart.disabled = !can;
  }

  // 閫???嚗?摰日?舐
  const btnDisband = _qs("survival-online-disband");
  if (btnDisband) {
    btnDisband.disabled = !(_isHost && !!_activeRoomId);
    btnDisband.style.display = (_isHost ? "" : "none");
  }

  // ????嚗?摰Ｘ蝡臬??  const btnRe = _qs("survival-online-reconnect");
  if (btnRe) {
    btnRe.style.display = (_isHost ? "none" : "");
    btnRe.disabled = !(!_isHost && !!_activeRoomId);
  }

  // 皜??Ｙ?嚗?摰日?舐
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

// ?寞??啣????湔??漲?賊?嚗?摰??啣??舫靽桃???漲嚗?function _updateDifficultyOptions() {
  const selMap = _qs("survival-online-host-map");
  const selDiff = _qs("survival-online-host-diff");
  if (!selMap || !selDiff) return;

  const mapId = selMap.value;
  const currentDiff = selDiff.value;

  // 皜征?暹??賊?
  selDiff.innerHTML = "";

  // 瘛餃?蝪∪?????????
  const easyOpt = document.createElement("option");
  easyOpt.value = "EASY";
  easyOpt.textContent = "蝪∪";
  selDiff.appendChild(easyOpt);

  const hardOpt = document.createElement("option");
  hardOpt.value = "HARD";
  hardOpt.textContent = "?圈";
  selDiff.appendChild(hardOpt);

  // ??摰?溶?耨蝢摨?  if (mapId === "desert") {
    const asuraOpt = document.createElement("option");
    asuraOpt.value = "ASURA";
    asuraOpt.textContent = "靽桃?";
    selDiff.appendChild(asuraOpt);
  }

  // 憒??嗅??豢??靽桃???漲嚗??啣?銝摰?嚗????啣??  if (currentDiff === "ASURA" && mapId !== "desert") {
    selDiff.value = "HARD";
    // ?郊?湔?輸?閮剔蔭
    if (_isHost && _activeRoomId) {
      hostUpdateSettings({ diffId: "HARD" }).catch(() => { });
    }
  } else if (currentDiff && ["EASY", "HARD", "ASURA"].includes(currentDiff)) {
    // 靽??嗅??豢?嚗?????
    selDiff.value = currentDiff;
  } else {
    // ?身?豢??圈
    selDiff.value = "HARD";
  }
}

function _syncHostSelectsFromRoom() {
  const selMap = _qs("survival-online-host-map");
  const selDiff = _qs("survival-online-host-diff");
  if (_roomState) {
    if (selMap && _roomState.mapId) {
      selMap.value = _roomState.mapId;
      // ?啣??寡?敺??湔??漲?賊?
      _updateDifficultyOptions();
    }
    if (selDiff && _roomState.diffId) {
      // 撽???漲?臬??嚗?摰??啣?銝?訾耨蝢?
      const mapId = selMap ? selMap.value : null;
      if (_roomState.diffId === "ASURA" && mapId !== "desert") {
        // 憒??輸?閮剔蔭鈭耨蝢??啣?銝摰?嚗撥?嗆?箏??        selDiff.value = "HARD";
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
  _setText("survival-online-status", "撌脣遣蝡??);
  await ensureFirebase();
  listenRoom(_activeRoomId);
  listenMembers(_activeRoomId);
  // 蝘駁 listenSignals嚗???閬?WebRTC 靽∩誘嚗?  // 餈 WebSocket
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
  console.log(`[SurvivalOnline] enterLobbyAsGuest: 撌脣??交??hostUid=${_hostUid}`);
  _setText("survival-online-status", "撌脣??交??皞??????);
  await ensureFirebase();
  listenRoom(_activeRoomId);
  listenMembers(_activeRoomId);
  // 蝘駁 listenSignals嚗???閬?WebRTC 靽∩誘嚗?  // 餈 WebSocket嚗隞?WebRTC嚗?  await connectWebSocket();
  _startMemberHeartbeat();
}

let _pendingStartParams = null; // { selectedDifficultyId, selectedCharacter, selectedMap }

function openSelectScreen(params) {
  _pendingStartParams = params;
  _hide("difficulty-select-screen");
  _hide("desert-difficulty-select-screen");
  _show("survival-online-select-screen");

  // 頛靽??蝔?  const nicknameInput = _qs("survival-online-nickname");
  if (nicknameInput) {
    const saved = getPlayerNickname();
    if (saved && !saved.startsWith("?拙振-")) {
      nicknameInput.value = saved;
    } else {
      nicknameInput.value = "";
    }
  }
}

function closeSelectScreenBackToDifficulty() {
  _hide("survival-online-select-screen");
  // ?撠???漲閬?嚗??啣?嚗?  const mapId = (typeof Game !== "undefined" && Game.selectedMap && Game.selectedMap.id) ? Game.selectedMap.id : null;
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

// ???ａ??輸?敺??圈??脤?憪??function closeLobbyToStart() {
  _hide("survival-online-lobby-screen");
  _hide("survival-online-select-screen");
  // 憿舐內????恍
  try {
    const startScreen = document.getElementById("start-screen");
    if (startScreen) {
      startScreen.classList.remove("hidden");
    }
    // ?梯??嗡??航憿舐內???    const charSel = document.getElementById("character-select-screen");
    if (charSel) charSel.classList.add("hidden");
    const mapSel = document.getElementById("map-select-screen");
    if (mapSel) mapSel.classList.add("hidden");
  } catch (_) { }
}

function closeLobbyOverlayKeepRoom() {
  // ESC ?典之撱喉??芷??之撱喃??Ｕ??啁????銝?????踹?敶梢敺?隞/???
  _hide("survival-online-lobby-screen");
  _show("survival-online-select-screen");
  try {
    if (_activeRoomId) {
      _setText("survival-online-status", "撌脣??銝哨?隞撌脤???");
    }
  } catch (_) { }
}

function startSurvivalNow(params) {
  // ??main.js ?Ｘ?瘚?靽?銝?湛??梯?閬?閬??閫?ｇ??脣??璅∪?
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

  // ?? GameModeManager ????璅∪?
  if (typeof window !== "undefined" && window.GameModeManager && typeof window.GameModeManager.start === "function") {
    window.GameModeManager.start("survival", {
      selectedDifficultyId: useId,
      selectedCharacter: params && params.selectedCharacter ? params.selectedCharacter : (typeof Game !== "undefined" ? Game.selectedCharacter : null),
      selectedMap: params && params.selectedMap ? params.selectedMap : (typeof Game !== "undefined" ? Game.selectedMap : null),
      // multiplayer hint嚗?摮芋撘誑憭?霈嚗?      multiplayer: _activeRoomId ? {
        roomId: _activeRoomId,
        role: _isHost ? "host" : "guest",
        uid: _uid,
        sessionId: (params && params.sessionId) ? params.sessionId : (_roomState && _roomState.sessionId ? _roomState.sessionId : null)
      } : null,
    });

    // ??MMORPG ?嗆?嚗?摰摰喳誨?剔?賢
    // ?嗆?啁?摰單?嚗誨?剔策?嗡??拙振
    setTimeout(() => {
      if (typeof Game !== "undefined" && Game.events && typeof Game.events.on === "function") {
        // ?脫迫??蝬? (蝘駁??憒?摮)
        if (Game._damageBroadcastListener) {
          Game.events.off('damage_enemy', Game._damageBroadcastListener);
        }

        // 摰儔????        Game._damageBroadcastListener = (data) => {
          // ?芸誨?剜?啁摰園??摰?(data.playerUid === _uid)
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

        // 蝬??啁?賢
        Game.events.on('damage_enemy', Game._damageBroadcastListener);
        console.log("[SurvivalOnline] 撌脩?摰?damage_enemy 撱?????);
      }
    }, 1000); // 撱園蝬?隞亦Ⅱ靽?Game 撌脣??典?憪?

    return;
  }
  // ?嚗扔蝡舀?瘜?
  try { if (typeof Game !== "undefined" && typeof Game.startNewGame === "function") Game.startNewGame(); } catch (_) { }
  try { _show("game-screen"); } catch (_) { }
}

function tryStartSurvivalFromRoom() {
  if (!_roomState || _roomState.status !== "starting") return;
  if (!_pendingStartParams) return;

  // M1嚗??snapshot 憭活閫貊?? start
  try {
    const sid = _roomState.sessionId || null;
    if (sid && _startSessionId && sid === _startSessionId) return;
    _startSessionId = sid || _startSessionId || "NO_SESSION";
  } catch (_) { }
  if (_startTimer) return;

  // 憟 host ??map/diff嚗恕?瑕??嚗?  try {
    if (typeof Game !== "undefined") {
      Game.selectedDifficultyId = _roomState.diffId || Game.selectedDifficultyId;
      const maps = (typeof CONFIG !== "undefined" && Array.isArray(CONFIG.MAPS)) ? CONFIG.MAPS : [];
      const mapCfg = maps.find((m) => m && m.id === _roomState.mapId);
      if (mapCfg) Game.selectedMap = mapCfg;
    }
  } catch (_) { }

  // M1嚗敺???霈?～榆銝??????脣嚗?  const delay = (typeof _roomState.startDelayMs === "number") ? Math.max(0, Math.floor(_roomState.startDelayMs)) : START_COUNTDOWN_MS;
  const sessionId = _roomState.sessionId || null;

  // 憿舐內?閬?撅?  const overlayEl = _qs("survival-online-countdown-overlay");
  const textEl = _qs("survival-online-countdown-text");
  if (overlayEl) overlayEl.classList.remove("hidden");
  if (textEl) textEl.textContent = `?喳???嚗?{Math.ceil(delay / 1000)}`;

  // 瘥??湔?
  let countdown = Math.ceil(delay / 1000);
  let countdownInterval = null;
  let hasStarted = false; // ?脫迫????

  const startGame = () => {
    if (hasStarted) return;
    hasStarted = true;
    if (countdownInterval) clearInterval(countdownInterval);
    if (_startTimer) {
      clearTimeout(_startTimer);
      _startTimer = null;
    }
    if (overlayEl) overlayEl.classList.add("hidden");

    // ?脣??嗅??豢????莎??芸?雿輻銝?獢???嗆活雿輻_pendingStartParams嚗?敺蝙?沁ame.selectedCharacter嚗?    let selectedCharacter = null;
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

    // 摰日?湔?輸??? playing嚗??脤?憪?
    if (_isHost && _activeRoomId) {
      updateDoc(roomDocRef(_activeRoomId), {
        status: "playing",
        updatedAt: serverTimestamp()
      }).catch((e) => {
        console.warn("[SurvivalOnline] ?湔?輸??? playing 憭望?:", e);
      });
      // ?湔?砍???      if (_roomState) {
        _roomState.status = "playing";
      }
    }

    // 蝣箔? WebSocket 撌脤?嚗??脤?憪???嚗?    if (!_ws || _ws.readyState !== WebSocket.OPEN) {
      console.log(`[SurvivalOnline] startGame: WebSocket ?芷?嚗?閰阡?...`);
      connectWebSocket().catch((e) => {
        console.error(`[SurvivalOnline] startGame: WebSocket ??憭望?:`, e);
      });
    }

    // 蝣箔? Runtime ?嚗??脤?憪?????甇伐?
    if (typeof Runtime !== "undefined" && typeof Runtime.setEnabled === "function") {
      Runtime.setEnabled(true);
    }

    // 蝣箔?閫銝 null嚗?? null嚗蝙?券?隤??莎?
    if (!selectedCharacter) {
      if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS) && CONFIG.CHARACTERS.length > 0) {
        selectedCharacter = CONFIG.CHARACTERS.find(c => c && c.id === 'margaret') || CONFIG.CHARACTERS[0];
      }
    }

    // ?湔 Game.selectedCharacter 蝣箔?銝?湔?    if (selectedCharacter && typeof Game !== "undefined") {
      Game.selectedCharacter = selectedCharacter;
    }

    startSurvivalNow({
      selectedDifficultyId: _roomState.diffId || _pendingStartParams.selectedDifficultyId,
      selectedCharacter: selectedCharacter,
      selectedMap: (typeof Game !== "undefined" ? Game.selectedMap : _pendingStartParams.selectedMap),
      sessionId: sessionId
    });
  };

  // 瘥??湔???
  countdownInterval = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      if (textEl) textEl.textContent = "??嚗?;
      // 撱園銝撠挾敺?????      setTimeout(startGame, 300);
    } else {
      if (textEl) textEl.textContent = `?喳???嚗?{countdown}`;
    }
  }, 1000);

  // 閮剖?蝮賢辣?莎?摰蝬莎?蝣箔??摰?敺???嚗雿?interval ?箏?憿?
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

  // 閫?豢?霈鈭辣嚗?啣Firestore銝行?起pendingStartParams
  if (selChar) {
    selChar.addEventListener("change", async () => {
      if (!_activeRoomId || !_uid) return;
      const selectedCharId = selChar.value;
      if (!selectedCharId) return;

      // ?脣?閫?蔭
      let selectedCharacter = null;
      if (typeof CONFIG !== "undefined" && CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS)) {
        selectedCharacter = CONFIG.CHARACTERS.find(c => c && c.id === selectedCharId);
      }

      // ?湔?蚌irestore
      try {
        await ensureAuth();
        await updateDoc(memberDocRef(_activeRoomId, _uid), {
          characterId: selectedCharId,
          lastSeenAt: serverTimestamp()
        });
      } catch (e) {
        console.warn("[SurvivalOnline] ?湔閫憭望?:", e);
      }

      // ?湔_pendingStartParams?ame.selectedCharacter
      if (selectedCharacter) {
        if (!_pendingStartParams) _pendingStartParams = {};
        _pendingStartParams.selectedCharacter = selectedCharacter;
        if (typeof Game !== "undefined") {
          Game.selectedCharacter = selectedCharacter;
        }
      }
    });
  }

  // ???梁迂頛詨獢??????蝚佗?銝剜?摮???摮?嚗甇Ｙ征?賡?泵??
  const nicknameInput = _qs("survival-online-nickname");
  if (nicknameInput) {
    // ?餅迫???支?隞嗅?剖?銝駁?
    nicknameInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
    }, true);
    nicknameInput.addEventListener("keyup", (e) => {
      e.stopPropagation();
    }, true);

    // ??頛詨撽?嚗?迂銝剜?摮???摮?銝?閮梁征?賡?泵??
    nicknameInput.addEventListener("input", (e) => {
      const value = e.target.value;
      // ?芯??葉??????摮?      const validPattern = /[\u4e00-\u9fffa-zA-Z0-9]/g;
      const validChars = value.match(validPattern) || [];
      const newValue = validChars.slice(0, 5).join(""); // ?????蝚?      if (newValue !== value) {
        e.target.value = newValue;
      }
    });

    // ???餅迫蝛箇?萄?蝚西?頛詨
    nicknameInput.addEventListener("keydown", (e) => {
      // ?迂?嚗葉??嚗?頛詨鈭辣??嚗???摮?潦?扎?蝑?      const allowedKeys = [
        "Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
        "Home", "End", "Tab"
      ];
      const key = e.key;
      const code = e.code;

      // 憒??舐征?賡?泵???餅迫頛詨
      if (key === " " || key === "Space" || code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 憒??舐泵???葉?????望?摮??詨?嚗??餅迫頛詨
      if (!/[\u4e00-\u9fffa-zA-Z0-9]/.test(key) && !allowedKeys.includes(key) && key.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    });

    // 頛???乩?甈∩?摮??梁迂
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

  // ?見???輸?蝣潸撓?交?
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
    // ?桐犖嚗Ⅱ靽?遙雿?????
    leaveRoom().catch(() => { });
    startSurvivalNow(_pendingStartParams || {});
  });
  if (btnOnline) btnOnline.addEventListener("click", () => {
    openLobbyScreen();
  });

  if (btnCreate) btnCreate.addEventListener("click", async () => {
    try {
      // 靽??梁迂
      const nicknameInput = _qs("survival-online-nickname");
      if (nicknameInput && nicknameInput.value.trim()) {
        const nickname = nicknameInput.value.trim();
        if (sanitizePlayerName(nickname)) {
          savePlayerNickname(nickname);
        }
      }

      _setText("survival-online-status", "撱箇??輸?銝凌?);
      await enterLobbyAsHost(_pendingStartParams || {});
      updateLobbyUI();
    } catch (e) {
      const code = (e && (e.code || e.name)) ? String(e.code || e.name) : "";
      const msg = (e && e.message) ? String(e.message) : "?芰?航炊";
      // ??甈??航炊蝯血?游擃?蝷綽?撣貉?嚗irestore rules 撠?澆?/隞?香???踹??餃/蝬脣??芸?閮梧?
      const hint = (code.includes("permission") || msg.toLowerCase().includes("insufficient permissions"))
        ? "嚗?蝣箄?嚗irestore 撌脣遣蝡ules 撌脩撣??迂 request.auth != null?uthentication ?踹?撌脣??具uthorized domains 撌脣???yiyuss.github.io嚗?
        : "";
      _setText("survival-online-status", `撱箇?憭望?嚗?{msg}${hint}${code ? ` [${code}]` : ""}`);
      try { console.warn("[SurvivalOnline] create room failed:", e); } catch (_) { }
    }
  });
  if (btnJoin) btnJoin.addEventListener("click", async () => {
    const code = (inpCode && inpCode.value ? inpCode.value.trim().toUpperCase() : "");
    if (!code) {
      _setText("survival-online-status", "隢撓?交?Ⅳ");
      return;
    }
    try {
      // 靽??梁迂
      const nicknameInput = _qs("survival-online-nickname");
      if (nicknameInput && nicknameInput.value.trim()) {
        const nickname = nicknameInput.value.trim();
        if (sanitizePlayerName(nickname)) {
          savePlayerNickname(nickname);
        }
      }

      _setText("survival-online-status", "??輸?銝凌?);
      await enterLobbyAsGuest(code);
      updateLobbyUI();
    } catch (e) {
      const c = (e && (e.code || e.name)) ? String(e.code || e.name) : "";
      const msg = (e && e.message) ? String(e.message) : "?芰?航炊";
      const hint = (c.includes("permission") || msg.toLowerCase().includes("insufficient permissions"))
        ? "嚗?蝣箄? Firestore Rules/?踹??餃/Authorized domains嚗?
        : "";
      _setText("survival-online-status", `?憭望?嚗?{msg}${hint}${c ? ` [${c}]` : ""}`);
      try { console.warn("[SurvivalOnline] join room failed:", e); } catch (_) { }
    }
  });

  if (btnCopy) btnCopy.addEventListener("click", async () => {
    const code = _activeRoomId || "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      _setText("survival-online-status", "撌脰?鋆賣?Ⅳ");
    } catch (_) {
      // fallback
      try {
        const tmp = document.createElement("textarea");
        tmp.value = code;
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand("copy");
        document.body.removeChild(tmp);
        _setText("survival-online-status", "撌脰?鋆賣?Ⅳ");
      } catch (_) { }
    }
  });

  let _ready = false;
  if (btnReady) btnReady.addEventListener("click", async () => {
    if (!_activeRoomId) return;
    _ready = !_ready;
    try {
      await setReady(_ready);
      btnReady.textContent = _ready ? "??皞?" : "皞?";
      // ?湔閫?豢?銝?獢?蝳???      const selChar = _qs("survival-online-character-select");
      if (selChar) {
        selChar.disabled = _ready;
      }
    } catch (_) { }
  });

  if (btnStart) btnStart.addEventListener("click", async () => {
    if (!_isHost || !_activeRoomId) return;
    try {
      await hostStartGame();
      _setText("survival-online-status", "??銝凌?);
    } catch (e) {
      _setText("survival-online-status", `??憭望?嚗?{e && e.message ? e.message : "?芰?航炊"}`);
    }
  });

  if (btnLeave) btnLeave.addEventListener("click", async () => {
    await leaveRoom().catch(() => { });
    closeLobbyToStart(); // ???ａ??輸?敺??圈??脤?憪??    _setText("survival-online-status", "撌脤???);
    updateLobbyUI();
  });

  if (btnDisband) btnDisband.addEventListener("click", async () => {
    if (!_isHost || !_activeRoomId) return;
    // 雿◢?芰Ⅱ隤??踹?隤方孛嚗?    const ok = window.confirm("閬圾???隡?嚗????⊿?◤??箝?);
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
    // ?啣??寡????湔??漲?賊?
    _updateDifficultyOptions();
    try { await hostUpdateSettings({ mapId }); } catch (_) { }
  });
  if (selDiff) selDiff.addEventListener("change", async () => {
    if (!_isHost) return;
    const diffId = selDiff.value;
    try { await hostUpdateSettings({ diffId }); } catch (_) { }
  });

  // ???摨阡???寞??嗅??啣?嚗?  _updateDifficultyOptions();

  // lobby screen ??????豢?嚗?靽??輸?嚗摰嗅??靘?
  // ??銝?靘迨??嚗???毽鈭?閬?????

  // 銝?雿輻頛芾岷?郊銝?嚗??listenRoom ??onSnapshot 閫貊嚗??憿?
}

// 撠?嚗 main.js ?澆嚗?隞???祉??start survival嚗?function startFlowFromMain(params) {
  // ?芸??璅∪???漲?豢??挾雿輻
  openSelectScreen(params || {});
}

// 撠?嚗?靘策 Game.update/draw ?
function getRuntime() {
  return Runtime;
}

// ?脣??????冽HUD憿舐內嚗?function getMembersState() {
  if (!_membersState) return [];
  return Array.from(_membersState.values()).map(m => ({
    uid: m.uid,
    name: m.name || (m.uid ? m.uid.slice(0, 6) : '?芰'),
    role: m.role || 'guest',
    ready: m.ready || false
  }));
}

function handleEscape() {
  // ?芸蝯?隞?航?????ESC嚗???true 隞?”撌脰???憭??stopPropagation嚗?  try {
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

// 蝬?嚗OM ready 敺?憪? UI
try {
  // index.html ?典??刻??伐??虜 DOM 撌脣停蝺?  bindUI();
} catch (e) {
  console.warn("[SurvivalOnline] UI 蝬?憭望?嚗?, e);
}

// ?嚗SC ?嚗apture phase嚗?// - 敹???main.js / KeyboardRouter ??ESC ?摩銋???鈭辣嚗??甈?ESC 閫貊憭????頝喳?銝駁?桐?蝯? UI 隞???// - ?芸蝯?隞?航?????try {
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

// ?湔?輸??? closed嚗? game.js 隤輻嚗?// ???湔?輸??? lobby嚗迤撣貊????脫??憭批輒嚗?async function updateRoomStatusToLobby() {
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
    console.warn("[SurvivalOnline] ?湔?輸??? lobby 憭望?:", e);
  }
}

async function updateRoomStatusToClosed() {
  try {
    if (!_isHost || !_activeRoomId) return;
    await updateDoc(roomDocRef(_activeRoomId), {
      status: "closed",
      updatedAt: serverTimestamp()
    });
    // ?湔?砍???    if (_roomState) {
      _roomState.status = "closed";
    }
  } catch (e) {
    console.warn("[SurvivalOnline] ?湔?輸??? closed 憭望?:", e);
  }
}

// 撠?API ?湧??window嚗???module ??main.js / game.js ?澆
window.SurvivalOnlineUI = {
  startFlowFromMain,
  leaveRoom,
  getRuntime,
  handleEscape,
  updateRoomStatusToClosed,
  updateRoomStatusToLobby,
  openLobbyScreen,
};

// ??蝯?game.js ??runtime bridge嚗??game.js import嚗?window.SurvivalOnlineRuntime = {
  Runtime: Runtime,
  RemotePlayerManager: RemotePlayerManager,
  updateRemotePlayers: Runtime.updateRemotePlayers, // ?湔?湧 updateRemotePlayers
  getMembersState: getMembersState,
  getPlayerNickname: getPlayerNickname,
  sanitizePlayerName: sanitizePlayerName,
  savePlayerNickname: savePlayerNickname
};

// ??皜??摩嚗??ａ????瑟/F5嚗???蒂皜????皞?銝?霅???隞誑敹歲/頞??文??箔蜓嚗?try {
  window.addEventListener("beforeunload", () => {
    try {
      // 皜????拙振
      if (typeof RemotePlayerManager !== "undefined" && RemotePlayerManager.clear) {
        RemotePlayerManager.clear();
      }
      // 皜? Game.remotePlayers
      if (typeof Game !== "undefined" && Array.isArray(Game.remotePlayers)) {
        Game.remotePlayers.length = 0;
      }
      // ?? WebSocket
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
      // ?迫????
      try { if (_memberHeartbeatTimer) clearInterval(_memberHeartbeatTimer); } catch (_) { }
      try { if (_startTimer) clearTimeout(_startTimer); } catch (_) { }
      try { if (_reconnectTimer) clearTimeout(_reconnectTimer); } catch (_) { }
      try { if (_autoCleanupTimer) clearInterval(_autoCleanupTimer); } catch (_) { }
      // ?ａ??輸?
      if (window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.leaveRoom === "function") {
        window.SurvivalOnlineUI.leaveRoom().catch(() => { });
      }
    } catch (_) { }
  });

  // ??皜??摩嚗??Ｗ閬扯???銋?????璅惜??嚗?  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // ??梯???皜?嚗?典??券???皜?
    }
  });
} catch (_) { }



// function handleServerGameState(state, timestamp) {
if (!state || !state.enemies) return;

// 1. ?郊?犖
syncEnemies(state.enemies);

// 2. ?郊皜豢??園/瘜Ｘ活嚗???踹?憸?頝喳?嚗?if (state.wave && typeof WaveSystem !== 'undefined') {
  if (WaveSystem.currentWave !== state.wave) {
    console.log(`[SurvivalOnline] ?郊瘜Ｘ活: ${WaveSystem.currentWave} -> ${state.wave}`);
    WaveSystem.currentWave = state.wave;
    // ?湔UI
    if (typeof UI !== 'undefined' && UI.updateWaveInfo) {
      UI.updateWaveInfo(WaveSystem.currentWave);
    }
  }
}
}

// ?郊?萎犖?”嚗敹?頛荔?
function syncEnemies(serverEnemies) {
  if (typeof Game === 'undefined') return;
  if (!Game.enemies) Game.enemies = [];

  const serverIds = new Set();

  // A. ?湔?撱箸鈭?  serverEnemies.forEach(sEnemy => {
    serverIds.add(sEnemy.id);

    // ?交?砍?臬摮
    const localEnemy = Game.enemies.find(e => e.id === sEnemy.id);

    if (localEnemy) {
      // --- 摮嚗?啁???(?澆像皛? ---
      // 雿蔭撟單???(Lerp)
      const t = 0.3; // ?潔???      localEnemy.x = localEnemy.x + (sEnemy.x - localEnemy.x) * t;
      localEnemy.y = localEnemy.y + (sEnemy.y - localEnemy.y) * t;

      // ?湔?郊銵???踹?銵璇歲???臬?蝺拙?雿?亙?甇交?皞?
      // 瘜冽?嚗???圈?皜砌??瑕拿嚗ㄐ?◤???刻????甇?Ⅱ???蝯??湔改?
      localEnemy.health = sEnemy.health;
      localEnemy.maxHealth = sEnemy.maxHealth;

      // ?郊甇颱滿???      if (sEnemy.isDead && !localEnemy.isDead) {
        localEnemy.health = 0;
        localEnemy.isDead = true;
        // 閫貊甇颱滿?摩? or let server handle removal
        // ???券?銝???宏?方府?萎犖嚗??砍銋?蝘駁
      }

    } else {
      // --- 銝??剁??萄遣?唳鈭?---
      // 蝣箔? Enemy 憿??      if (typeof Enemy !== 'undefined') {
        // ?萄遣撖虫? (雿蔭 x,y, 憿? type)
        // 瘜冽?嚗nemy 瑽?賊虜???璈?ID嚗???????
        const newEnemy = new Enemy(sEnemy.x, sEnemy.y, sEnemy.type);

        // ? ?嚗???ID ?箸?? ID ?
        newEnemy.id = sEnemy.id;

        // ?郊撅祆?        newEnemy.health = sEnemy.health;
        newEnemy.maxHealth = sEnemy.maxHealth;
        newEnemy.speed = sEnemy.speed;

        // ??敺芰
        Game.enemies.push(newEnemy);
        console.log(`[SurvivalOnline] ?郊?萄遣?萎犖: ${sEnemy.type} (ID: ${sEnemy.id})`);
      }
    }
  });

  // B. 蝘駁?砍憭??萎犖嚗??撌脣?歹??砍銋府?芷嚗?  for (let i = Game.enemies.length - 1; i >= 0; i--) {
    const localEnemy = Game.enemies[i];
    // 憒??砍?萎犖ID銝???典?銵其葉嚗?銝甇颱滿?銝哨??舫靽?撅?嚗??宏??    // 蝪∪韏瑁?嚗?澆?甇伐?銝???典?銵典停蝘駁
    if (!serverIds.has(localEnemy.id)) {
      // console.log(`[SurvivalOnline] ?郊蝘駁?萎犖: ${localEnemy.id}`);
      Game.enemies.splice(i, 1);
    }
  }
}

