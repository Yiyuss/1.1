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

// WebRTC
let _pc = null; // 初版：client 只連 host；host 對每個 client 建一條 pc（下方用 map）
let _pcsHost = new Map(); // host: remoteUid -> { pc, channel }
let _dc = null; // client: datachannel

// In-game presence
const Runtime = (() => {
  let enabled = false;
  let lastSendAt = 0;
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
  }

  function getRemotePlayers() {
    return Array.from(remotePlayers.entries()).map(([uid, p]) => ({ uid, ...p }));
  }

  return { setEnabled, onStateMessage, tick, getRemotePlayers };
})();

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
  const snap = await getDoc(roomDocRef(roomId));
  if (!snap.exists()) throw new Error("找不到房間");
  const data = snap.data() || {};
  if (data.status !== "lobby") throw new Error("房間已開始或已關閉");
  if (!data.hostUid) throw new Error("房間資料不完整");

  // 人數限制：用前端保險（真正限制需 rules/host 驗證）
  // 這裡先直接寫入 member，再由 UI 訂閱 members 顯示
  await setDoc(memberDocRef(roomId, _uid), {
    uid: _uid,
    role: "guest",
    ready: false,
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    name: `玩家-${_uid.slice(0, 4)}`,
    characterId: (typeof Game !== "undefined" && Game.selectedCharacter && Game.selectedCharacter.id) ? Game.selectedCharacter.id : null,
  });

  return { roomId, hostUid: data.hostUid, mapId: data.mapId, diffId: data.diffId };
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

async function hostUpdateSettings({ mapId, diffId }) {
  if (!_activeRoomId || !_isHost) return;
  const patch = { updatedAt: serverTimestamp() };
  if (mapId) patch.mapId = mapId;
  if (diffId) patch.diffId = diffId;
  await updateDoc(roomDocRef(_activeRoomId), patch);
}

async function hostStartGame() {
  if (!_activeRoomId || !_isHost) return;
  await updateDoc(roomDocRef(_activeRoomId), { status: "starting", startAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
      const m = new Map();
      snap.forEach((d) => {
        const data = d.data() || {};
        if (data && data.uid) m.set(data.uid, data);
      });
      _membersState = m;
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
      Runtime.onStateMessage(msg);
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
      multiplayer: _activeRoomId ? { roomId: _activeRoomId, role: _isHost ? "host" : "guest", uid: _uid } : null,
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
  // 套用 host 的 map/diff（室長優先權）
  try {
    if (typeof Game !== "undefined") {
      Game.selectedDifficultyId = _roomState.diffId || Game.selectedDifficultyId;
      const maps = (typeof CONFIG !== "undefined" && Array.isArray(CONFIG.MAPS)) ? CONFIG.MAPS : [];
      const mapCfg = maps.find((m) => m && m.id === _roomState.mapId);
      if (mapCfg) Game.selectedMap = mapCfg;
    }
  } catch (_) {}

  // 啟動
  startSurvivalNow({
    selectedDifficultyId: _roomState.diffId || _pendingStartParams.selectedDifficultyId,
    selectedCharacter: _pendingStartParams.selectedCharacter,
    selectedMap: (typeof Game !== "undefined" ? Game.selectedMap : _pendingStartParams.selectedMap),
  });
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


