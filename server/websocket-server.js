// WebSocket 遊戲數據中繼服務器（支持 TLS/WSS）
// 用於替代 WebRTC DataChannel，通過 WebSocket 中繼遊戲數據
// 保護隱私：不暴露玩家 IP（通過服務器中繼）

const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const { GameState } = require('./game-state');

const PORT = 8080;
const HOST = '0.0.0.0';

// 讀取證書（如果存在）
let serverOptions = {};
const certPath = '/etc/letsencrypt/live/ws.yiyuss-ws.com/fullchain.pem';
const keyPath = '/etc/letsencrypt/live/ws.yiyuss-ws.com/privkey.pem';

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  serverOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath)
  };
  console.log('[WebSocket] 使用 TLS 證書（WSS）');
} else {
  console.warn('[WebSocket] 未找到證書，使用 HTTP（WS）- HTTPS 頁面無法連接');
}

// 房間管理：roomId -> Set<WebSocket>
const rooms = new Map();

// 用戶管理：ws -> { roomId, uid, isHost }
const users = new Map();

// ✅ 权威服务器：游戏状态管理 roomId -> GameState
const gameStates = new Map();

// ✅ 权威服务器：游戏循环（60Hz = 16.67ms）
const GAME_TICK_INTERVAL = 16.67; // 毫秒
let lastGameUpdate = Date.now();

const server = https.createServer(serverOptions);
const wss = new WebSocket.Server({ server });

// 添加简单的 HTML 页面，帮助浏览器接受证书
server.on('request', (req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>WebSocket 服务器</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .success {
      background: #4CAF50;
      color: white;
      padding: 20px;
      border-radius: 5px;
      margin: 20px 0;
    }
    .info {
      background: #2196F3;
      color: white;
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
    }
    button {
      background: #4CAF50;
      color: white;
      border: none;
      padding: 10px 20px;
      font-size: 16px;
      border-radius: 5px;
      cursor: pointer;
      margin: 10px 5px;
    }
    button:hover {
      background: #45a049;
    }
  </style>
</head>
<body>
  <h1>✅ WebSocket 服务器运行中</h1>
  <div class="success">
    <p><strong>如果你看到这个页面，说明证书已被接受！</strong></p>
    <p>现在可以关闭这个页面，回到游戏页面测试连接。</p>
  </div>
  <div class="info">
    <p><strong>测试 WebSocket 连接：</strong></p>
    <p>在浏览器控制台（F12）运行：</p>
    <pre style="background: #333; color: #0f0; padding: 10px; border-radius: 3px; overflow-x: auto;">
const ws = new WebSocket('wss://45.76.96.207:8080');
ws.onopen = () => {
  console.log('✅ 连接成功！');
  ws.send(JSON.stringify({ type: 'join', roomId: 'TEST', uid: 'test', isHost: true }));
};
ws.onmessage = (e) => {
  console.log('✅ 收到消息:', JSON.parse(e.data));
};
ws.onerror = (err) => console.error('❌ 错误:', err);
    </pre>
  </div>
  <button onclick="testConnection()">测试连接</button>
  <div id="result"></div>
  <script>
    function testConnection() {
      const result = document.getElementById('result');
      result.innerHTML = '<p>测试中...</p>';
      const ws = new WebSocket('wss://45.76.96.207:8080');
      ws.onopen = () => {
        result.innerHTML = '<div class="success"><p>✅ WebSocket 连接成功！</p></div>';
        ws.send(JSON.stringify({ type: 'join', roomId: 'TEST', uid: 'test', isHost: true }));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        result.innerHTML += '<div class="info"><p>✅ 收到消息: ' + JSON.stringify(msg) + '</p></div>';
      };
      ws.onerror = (err) => {
        result.innerHTML = '<div style="background: #f44336; color: white; padding: 15px; border-radius: 5px;"><p>❌ 连接失败。请检查浏览器是否已接受证书。</p></div>';
      };
    }
  </script>
</body>
</html>
    `);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

wss.on('connection', (ws, req) => {
  console.log(`[WebSocket] 新連接: ${req.socket.remoteAddress}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(ws, msg);
    } catch (e) {
      console.error(`[WebSocket] 解析消息失敗:`, e);
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    console.error(`[WebSocket] 錯誤:`, err);
  });
});

function handleMessage(ws, msg) {
  const { type, roomId, uid, isHost, data } = msg;

  switch (type) {
    case 'join':
      handleJoin(ws, roomId, uid, isHost);
      break;
    case 'game-data':
      handleGameData(ws, roomId, uid, data);
      break;
    default:
      console.warn(`[WebSocket] 未知消息類型: ${type}`);
  }
}

function handleJoin(ws, roomId, uid, isHost) {
  console.log(`[WebSocket] 用戶加入: roomId=${roomId}, uid=${uid}, isHost=${isHost}`);

  // 保存用戶信息
  users.set(ws, { roomId, uid, isHost });

  // 加入房間
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(ws);

  // ✅ 权威服务器：初始化或获取游戏状态
  if (!gameStates.has(roomId)) {
    gameStates.set(roomId, new GameState(roomId));
    console.log(`[GameState] 創建新遊戲狀態: roomId=${roomId}`);
  }

  const gameState = gameStates.get(roomId);

  // ✅ 权威服务器：添加玩家到游戏状态
  gameState.addPlayer(uid, {
    x: 1920 / 2,
    y: 1080 / 2,
    health: 200,
    maxHealth: 200,
    energy: 100,
    maxEnergy: 100,
    level: 1,
    experience: 0,
    gold: 0,
    characterId: 'pineapple', // 从客户端获取
    nickname: '玩家' // 从客户端获取
  });

  // 發送確認
  ws.send(JSON.stringify({
    type: 'joined',
    roomId,
    uid,
    isHost
  }));

  // ✅ 权威服务器：立即发送当前游戏状态
  ws.send(JSON.stringify({
    type: 'game-state',
    state: gameState.getState()
  }));

  // 通知房間內其他用戶（可選，用於統計）
  broadcastToRoom(roomId, ws, {
    type: 'user-joined',
    uid,
    isHost
  });
}

function handleGameData(ws, roomId, uid, data) {
  const userInfo = users.get(ws);

  if (!userInfo) {
    console.warn(`[WebSocket] 用戶未加入房間: uid=${uid}`);
    return;
  }

  // 使用用戶信息中的 roomId（更安全）
  const actualRoomId = userInfo.roomId;

  // ✅ 权威服务器：处理CONFIG数据
  const gameState = gameStates.get(actualRoomId);
  if (gameState && data.type === 'config' && data.config) {
    // 保存CONFIG数据到游戏状态
    gameState.config = data.config;
    console.log(`[GameState] 收到CONFIG数据: roomId=${actualRoomId}, uid=${uid}`);
    return;
  }

  // ✅ 权威服务器：处理地图信息
  if (gameState && data.type === 'map' && data.map) {
    // 保存地图信息到游戏状态（用于路口车辆生成等）
    gameState.setMap(data.map);
    console.log(`[GameState] 收到地图信息: roomId=${actualRoomId}, mapId=${data.map.id || 'unknown'}, uid=${uid}`);
    return;
  }

  // ✅ 权威服务器：处理世界大小（从客户端同步）
  if (gameState && data.type === 'world-size' && typeof data.worldWidth === 'number' && typeof data.worldHeight === 'number') {
    // 保存世界大小到游戏状态（确保与客户端一致）
    gameState.setWorldSize(data.worldWidth, data.worldHeight);
    console.log(`[GameState] 收到世界大小: roomId=${actualRoomId}, ${data.worldWidth}x${data.worldHeight}, uid=${uid}`);
    return;
  }

  // ✅ 权威服务器：处理障碍物和装饰数据（可选，用于状态同步）
  if (gameState && data.type === 'obstacles' && Array.isArray(data.obstacles)) {
    gameState.setObstacles(data.obstacles);
    console.log(`[GameState] 收到障碍物数据: roomId=${actualRoomId}, count=${data.obstacles.length}, uid=${uid}`);
    return;
  }

  if (gameState && data.type === 'decorations' && Array.isArray(data.decorations)) {
    gameState.setDecorations(data.decorations);
    console.log(`[GameState] 收到装饰数据: roomId=${actualRoomId}, count=${data.decorations.length}, uid=${uid}`);
    return;
  }

  // ✅ 权威服务器：处理玩家输入（不转发，服务器处理）
  if (gameState && (data.type === 'move' || data.type === 'attack' || data.type === 'use_ultimate')) {
    // 服务器处理输入
    gameState.handleInput(uid, data);
    // 不需要转发，服务器会定期广播状态
    return;
  }

  // ✅ 权威服务器：处理宝箱生成（由主机通知）
  if (gameState && data.type === 'chest_spawn') {
    // 主机决定生成宝箱，服务器记录状态
    gameState.addChest({
      id: data.id,
      x: data.x,
      y: data.y,
      type: data.chestType || 'NORMAL'
    });
    // 继续转发广播给其他玩家
    broadcastToRoom(actualRoomId, ws, {
      type: 'game-data',
      fromUid: uid,
      data
    });
    return;
  }

  // ✅ 权威服务器：处理宝箱收集尝试（解决竞争条件）
  if (gameState && data.type === 'try_collect_chest') {
    const success = gameState.collectChest(uid, data.chestId);
    if (success) {
      // 收集成功，广播给所有人（包括自己）
      broadcastToRoom(actualRoomId, null, {
        type: 'game-data',
        fromUid: uid,
        data: {
          type: 'chest_collected',
          chestId: data.chestId,
          collectorUid: uid,
          chestType: data.chestType // 传递类型以区分普通宝箱和凤梨
        }
      });
    }
    //此消息不需要直接转发，只有成功才广播结果
    return;
  }

  // 其他类型的消息（如聊天）仍然转发
  broadcastToRoom(actualRoomId, ws, {
    type: 'game-data',
    fromUid: uid,
    data
  });
}

function broadcastToRoom(roomId, excludeWs, msg) {
  const room = rooms.get(roomId);
  if (!room) return;

  const msgStr = JSON.stringify(msg);
  let count = 0;

  for (const ws of room) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(msgStr);
      count++;
    }
  }

  if (count > 0) {
    console.log(`[WebSocket] 廣播消息到房間 ${roomId}: ${count} 個用戶`);
  }
}

function handleDisconnect(ws) {
  const userInfo = users.get(ws);
  if (userInfo) {
    const { roomId, uid } = userInfo;
    console.log(`[WebSocket] 用戶斷開: roomId=${roomId}, uid=${uid}`);

    // ✅ 权威服务器：从游戏状态移除玩家
    const gameState = gameStates.get(roomId);
    if (gameState) {
      gameState.removePlayer(uid);
      // 如果房间为空，清理游戏状态
      if (rooms.get(roomId) && rooms.get(roomId).size <= 1) {
        gameStates.delete(roomId);
        console.log(`[GameState] 清理遊戲狀態: roomId=${roomId}`);
      }
    }

    // 從房間移除
    const room = rooms.get(roomId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        rooms.delete(roomId);
        console.log(`[WebSocket] 房間 ${roomId} 已清空`);
      } else {
        // 通知其他用戶
        broadcastToRoom(roomId, null, {
          type: 'user-left',
          uid
        });
      }
    }

    users.delete(ws);
  }
}

// ✅ 权威服务器：游戏循环
function gameLoop() {
  const now = Date.now();
  let deltaTime = now - lastGameUpdate;
  lastGameUpdate = now;

  // ✅ 防止时间跳跃：限制deltaTime最大值（防止服务器暂停或时间异常）
  // 如果deltaTime超过100ms（约6帧），限制为100ms，避免游戏状态异常
  if (deltaTime > 100) {
    deltaTime = 100;
  }

  // 更新所有游戏状态
  for (const [roomId, gameState] of gameStates.entries()) {
    try {
      // 更新游戏状态
      gameState.update(deltaTime);

      // 广播游戏状态给所有客户端
      const state = gameState.getState();
      broadcastToRoom(roomId, null, {
        type: 'game-state',
        state: state,
        timestamp: now
      });
    } catch (error) {
      // ✅ 错误处理：单个房间的错误不影响其他房间
      console.error(`[GameState] 房间 ${roomId} 更新失败:`, error);
      // 可以选择清理该房间的游戏状态，或继续运行
      // 当前实现：记录错误，继续运行其他房间
    }
  }

  // 60Hz 游戏循环
  setTimeout(gameLoop, GAME_TICK_INTERVAL);
}

server.listen(PORT, HOST, () => {
  const protocol = serverOptions.cert ? 'wss' : 'ws';
  console.log(`[WebSocket] 服務器啟動: ${protocol}://${HOST}:${PORT}`);
  console.log(`[GameState] 权威服务器模式已启用，游戏循环: ${1000 / GAME_TICK_INTERVAL}Hz`);

  // ✅ 启动游戏循环
  lastGameUpdate = Date.now();
  gameLoop();
});

// 優雅關閉
process.on('SIGTERM', () => {
  console.log('[WebSocket] 收到 SIGTERM，關閉服務器...');
  wss.close(() => {
    server.close(() => {
      console.log('[WebSocket] 服務器已關閉');
      process.exit(0);
    });
  });
});

