// 主線模式（Main Story Mode）
// 玩法骨架：
// - 不分難度，從地圖進入後可探索並與 NPC 互動。
// - 點擊 NPC 後，角色自動靠近並在接近時觸發對話。
// - 地圖資源：map.json（Tiled 格式）與 spritesheet.png（素材集）。
(function(){
  const MODE_ID = 'main';

  const MainMode = {
    id: MODE_ID,
    // 宣告模式資源（若檔案不存在則顯示後備提示，不影響其他模式）
    getManifest(){
      return {
        images: [
          { key: 'main_spritesheet', src: 'assets/images/spritesheet.png' }
        ],
        audio: [],
        json: [
          { key: 'main_map', src: 'assets/maps/map.json' }
        ]
      };
    },
    enter(params, ctx){
      try {
        // 隱藏所有覆蓋視窗與前置畫面
        const diffScreen = document.getElementById('difficulty-select-screen');
        const desertDiffScreen = document.getElementById('desert-difficulty-select-screen');
        const mapScreen = document.getElementById('map-select-screen');
        const charScreen = document.getElementById('character-select-screen');
        if (diffScreen) diffScreen.classList.add('hidden');
        if (desertDiffScreen) desertDiffScreen.classList.add('hidden');
        if (mapScreen) mapScreen.classList.add('hidden');
        if (charScreen) charScreen.classList.add('hidden');

        // 顯示遊戲畫面並隱藏生存模式的 HUD（主線僅保留畫布與簡易對話）
        const gameScreen = document.getElementById('game-screen');
        const gameUI = document.getElementById('game-ui');
        if (gameScreen) gameScreen.classList.remove('hidden');
        if (gameUI) gameUI.style.display = 'none';
      } catch(_){}

      // 進入主線模式時，確保生存迴圈不更新且音樂停止
      try { if (typeof Game !== 'undefined' && Game.pause) Game.pause(true); } catch(_){}
      try { if (typeof AudioManager !== 'undefined' && AudioManager.stopAllMusic) AudioManager.stopAllMusic(); } catch(_){}

      const canvas = document.getElementById('game-canvas');
      const ctx2d = canvas ? canvas.getContext('2d') : null;
      if (!canvas || !ctx2d) return;
      // 減少圖塊邊緣縫隙與模糊
      try { ctx2d.imageSmoothingEnabled = false; } catch(_){}

      // 設定畫布尺寸（沿用既有 CONFIG）
      try {
        if (typeof CONFIG !== 'undefined') {
          canvas.width = CONFIG.CANVAS_WIDTH || 1280;
          canvas.height = CONFIG.CANVAS_HEIGHT || 720;
        } else {
          canvas.width = 1280;
          canvas.height = 720;
        }
      } catch(_) {
        canvas.width = 1280; canvas.height = 720;
      }

      // 動態資源存取：優先使用 GameModeManager 的模式資源，回退至舊 ResourceLoader
      function getResource(name){
        // 1) 新管理器資源（隔離 Bucket）
        try {
          if (ctx && ctx.resources) {
            if (name === 'map') return ctx.resources.getJson('main_map');
            if (name === 'sheet') return ctx.resources.getImage('main_spritesheet');
          }
        } catch(_) {}
        // 2) 舊資源快取（全域共用）
        const cache = (window.ResourceLoader && window.ResourceLoader.cache) ? window.ResourceLoader.cache : { images: new Map(), json: new Map() };
        if (name === 'map') return cache.json.get('main_map');
        if (name === 'sheet') return cache.images.get('main_spritesheet');
        return null;
      }

      // 取得地圖尺寸（支援 Tiled 與 SpriteFusion）
      function getMapInfo(){
        const mapData = getResource('map');
        if (!mapData) return { tw:32, th:32, tilesW:40, tilesH:22, pixelW:1280, pixelH:720, type:'unknown' };
        // Tiled
        if (Array.isArray(mapData.layers) && (mapData.tilewidth || mapData.tileheight)){
          const tw = mapData.tilewidth || 32;
          const th = mapData.tileheight || 32;
          const tilesW = mapData.width || Math.floor(canvas.width/tw);
          const tilesH = mapData.height || Math.floor(canvas.height/th);
          return { tw, th, tilesW, tilesH, pixelW: tilesW*tw, pixelH: tilesH*th, type:'tiled' };
        }
        // SpriteFusion
        if (typeof mapData.tileSize === 'number'){
          const tw = mapData.tileSize; const th = mapData.tileSize;
          const tilesW = Number(mapData.mapWidth) || Math.floor(canvas.width/tw);
          const tilesH = Number(mapData.mapHeight) || Math.floor(canvas.height/th);
          return { tw, th, tilesW, tilesH, pixelW: tilesW*tw, pixelH: tilesH*th, type:'spritefusion' };
        }
        return { tw:32, th:32, tilesW:40, tilesH:22, pixelW:1280, pixelH:720, type:'unknown' };
      }

      // 簡易 NPC 配置（示範用）
      const npcs = [
        { id: 'npc1', name: 'NPC-1', x: 160, y: 160, dialogues: ['你好，這是主線模式的測試用地圖。', '點擊我，角色會靠近並顯示對話。'] },
        { id: 'npc2', name: 'NPC-2', x: 460, y: 240, dialogues: ['未來這裡會加入角色故事與介紹。', '也可能有一些互動小遊戲。'] }
      ];

      // 玩家初始位置與簡易點擊移動（依選角角色決定外觀）
      const sc = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
      let imgKey = 'player';
      if (sc && sc.spriteImageKey) {
        imgKey = sc.spriteImageKey;
      } else if (sc && sc.id === 'dada') {
        imgKey = 'player2';
      }
      const imgObj = (typeof Game !== 'undefined' && Game.images) ? Game.images[imgKey] : null;
      const player = {
        x: 96,
        y: 96,
        speed: 2.2,
        targetX: null,
        targetY: null,
        imgKey,
        img: imgObj || ((typeof Game !== 'undefined' && Game.images) ? Game.images['player'] : null)
      };

      // 鏡頭（跟隨玩家）
      const camera = { x: 0, y: 0 };
      function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
      function centerCameraOnPlayer(){
        const info = getMapInfo();
        const maxX = Math.max(0, info.pixelW - canvas.width);
        const maxY = Math.max(0, info.pixelH - canvas.height);
        // 取整避免子像素取樣導致格線縫隙
        camera.x = Math.floor(clamp(player.x - canvas.width/2, 0, maxX));
        camera.y = Math.floor(clamp(player.y - canvas.height/2, 0, maxY));
      }

      // 螢幕座標轉世界座標（含鏡頭偏移＋手機旋轉對應）
      function screenToCanvas(e){
        const rect = canvas.getBoundingClientRect();
        const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
        if (rotatedPortrait) {
          const u = (e.clientX - rect.left) / rect.width;
          const v = (e.clientY - rect.top) / rect.height;
          const x = v * canvas.width + camera.x;
          const y = (1 - u) * canvas.height + camera.y;
          return { x, y };
        } else {
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const x = (e.clientX - rect.left) * scaleX + camera.x;
          const y = (e.clientY - rect.top) * scaleY + camera.y;
          return { x, y };
        }
      }

      // —— 碰撞格（僅針對 SpriteFusion 的 collider:true 層）——
      let collisionReady = false;
      let collisionSet = new Set();
      // 依圖層分組的碰撞格（保留來源圖層以便高地忽略特定碰撞）
      let collisionsByLayer = new Map(); // key: canonical layer name, value: Set("gx,gy")
      // 樓梯白名單：在這些格子上忽略底層碰撞（允許行走）
      let rampOverrideSet = new Set();
      // 圖層高度：優先讀取 layer.height，否則依名稱推斷
      // 物理規則（依名稱推斷時）：
      // - Rocks/Bridge => 高度 2（二樓可走，與一樓互相碰撞）
      // - Cliff/Sand/Grass/Background => 高度 1（一樓）
      let layerHeights = new Map();
      // 非僅碰撞的高度圖（包含非 collider 層），用於「不同樓層互相阻擋」
      let tileHeights = new Map(); // key:"gx,gy" -> height number
      let heightReady = false;
      // 目前先只修障礙物：關閉高度阻擋（之後再依 Auto tile rules 啟用）
      let enableHeightBlocking = true;

      function canonLayerName(name){
        const n = String(name || '').toLowerCase();
        // 先匹配 small rocks，避免被一般 rocks 擷取到
        if (n.includes('small rocks')) return 'small-rocks';
        if (n.includes('bridge - horizontal') || n.includes('bridge horizontal')) return 'bridge-h';
        if (n.includes('bridge - vertical') || n.includes('bridge vertical')) return 'bridge-v';
        if (n.includes('rocks')) return 'rocks';
        if (n.includes('cliff')) return 'cliff';
        if (n.includes('buildings')) return 'buildings';
        if (n.includes('stairs')) return 'stairs';
        return n;
      }
      // 高度/通行/碰撞配置（以圖片為主）：
      // height: 1..7；walkable: 在該高度可站立；
      // colliderHandling: 'none' | 'absolute' | 'height_aware'
      function getLayerConfig(lname){
        switch(lname){
          case 'background': return { height: 1, walkable: true,  colliderHandling: 'none' };
          case 'sand':       return { height: 1, walkable: true,  colliderHandling: 'none' };
          case 'grass':      return { height: 4, walkable: true,  colliderHandling: 'none' };
          case 'rocks':      return { height: 3, walkable: true,  colliderHandling: 'height_aware' };
          case 'small-rocks':return { height: 0, walkable: false, colliderHandling: 'none' }; // 裝飾，無碰撞
          case 'bridge-h':   return { height: 6, walkable: true,  colliderHandling: 'height_aware' };
          case 'bridge-v':   return { height: 5, walkable: true,  colliderHandling: 'height_aware' };
          case 'stairs':     return { height: 7, walkable: true,  colliderHandling: 'none' };
          case 'buildings':  return { height: 0, walkable: false, colliderHandling: 'absolute' };
          case 'cliff':      return { height: 2, walkable: false, colliderHandling: 'absolute' };
          default:           return { height: 0, walkable: false, colliderHandling: 'none' };
        }
      }
      // （移除）allowedElevatedLayers：改用 layerHeights 直接判斷高度

      // 蒐集樓梯座標（只保留樓梯為通行白名單；橋梁不再列入）
      function buildRampOverrideSet(){
        const mapData = getResource('map');
        const set = new Set();
        if (!mapData || !Array.isArray(mapData.layers)) return set;

        // 從自定義規則讀取 baseIds（若存在）
        const baseIds = new Set();
        if (Array.isArray(mapData.autotileRules)) {
          for (const rule of mapData.autotileRules) {
            const lname = String(rule.layer || rule.name || '').toLowerCase();
            if (lname.includes('stairs')) {
              const ids = Array.isArray(rule.baseIds) ? rule.baseIds : (Array.isArray(rule.ids) ? rule.ids : []);
              for (const id of ids) baseIds.add(Number(id) || 0);
            }
          }
        }

        // 從圖層收集樓梯格座標（橋面不加入白名單）
        for (const layer of mapData.layers) {
          const name = String(layer && layer.name || '').toLowerCase();
          const tiles = Array.isArray(layer && layer.tiles) ? layer.tiles : [];
          if (name.includes('stairs')) {
            for (const t of tiles) {
              const gx = Number(t.x) || 0; const gy = Number(t.y) || 0;
              set.add(`${gx},${gy}`);
            }
          } else if (baseIds.size && tiles.length) {
            for (const t of tiles) {
              const id = Number(t.id) || 0;
              if (baseIds.has(id)) {
                const gx = Number(t.x) || 0; const gy = Number(t.y) || 0;
                set.add(`${gx},${gy}`);
              }
            }
          }
        }
        return set;
      }

      function buildCollisionGrid(){
        const mapData = getResource('map');
        if (!mapData || typeof mapData.tileSize !== 'number' || !Array.isArray(mapData.layers)) return false;
        // 先建立樓梯／橋面白名單（用於可通行覆蓋）
        rampOverrideSet = buildRampOverrideSet();

        // 目前僅保留最單純的障礙物：按圖示紅圈層（Buildings、Cliff）。
        const set = new Set();
        collisionsByLayer = new Map();
        const obstacleNames = new Set(['buildings','cliff','bridge-h','bridge-v','rocks']);
        for (const layer of mapData.layers) {
          if (!layer) continue;
          const lname = canonLayerName(layer.name);
          const tiles = Array.isArray(layer.tiles) ? layer.tiles : [];
          // 以圖片為主的高度配置
          const cfg = getLayerConfig(lname);
          layerHeights.set(lname, cfg.height || 0);
          const isColliderLayer = cfg.colliderHandling !== 'none' && obstacleNames.has(lname);
          if (!collisionsByLayer.has(lname)) collisionsByLayer.set(lname, new Set());
          if (!isColliderLayer) {
            // 僅收集 ramp 覆蓋集合已由 buildRampOverrideSet 完成，這裡略過
            continue;
          }
          for (const t of tiles) {
            const gx = Number(t.x) || 0; const gy = Number(t.y) || 0; const k = `${gx},${gy}`;
            set.add(k);
            collisionsByLayer.get(lname).add(k);
          }
        }

        collisionSet = set;
        collisionReady = true;
        return true;
      }

      // 建立高度圖（僅走面層）：用於「不同樓層間互相阻擋」判定
      function buildHeightGrid(){
        const mapData = getResource('map');
        const grid = new Map();
        if (!mapData || !Array.isArray(mapData.layers)) { tileHeights = grid; heightReady = true; return; }
        const isWalkSurface = (nm)=>{
          const lname = canonLayerName(nm);
          const cfg = getLayerConfig(lname);
          return !!cfg.walkable;
        };
        const layerHeight = (nm)=>{
          const lname = canonLayerName(nm);
          const cfg = getLayerConfig(lname);
          return cfg.height || 0;
        };
        for (const layer of mapData.layers) {
          if (!isWalkSurface(layer && layer.name)) continue;
          const tiles = Array.isArray(layer && layer.tiles) ? layer.tiles : [];
          const h = layerHeight(layer && layer.name);
          for (const t of tiles) {
            const gx = Number(t.x)||0; const gy = Number(t.y)||0; const k = `${gx},${gy}`;
            const prev = grid.has(k) ? grid.get(k) : 0;
            grid.set(k, Math.max(prev, h));
          }
        }
        tileHeights = grid; heightReady = true;
      }
      function isBlocked(px, py){
        const info = getMapInfo();
        if (!collisionReady) buildCollisionGrid();
        if (enableHeightBlocking && !heightReady) buildHeightGrid();
        // 角色半徑：略小於 16，給 1 格寬通道一些餘裕
        const r = 14; // 角色半寬/半高（32px 視覺；碰撞留邊）
        const tx = (x)=> Math.floor(x / info.tw);
        const ty = (y)=> Math.floor(y / info.th);
        const key = (x,y)=> `${tx(x)},${ty(y)}`;
        // 樓梯（7）作為高度切換接口
        const currentKey = key(player.x, player.y);
        const currentHeight = tileHeights.has(currentKey) ? tileHeights.get(currentKey) : 1;
        const onStairsNow = rampOverrideSet.has(currentKey);
        // 蒐集四角鍵
        const cornerKeys = [
          key(px - r, py - r),
          key(px + r, py - r),
          key(px - r, py + r),
          key(px + r, py + r)
        ];
        function canTransition(hFrom, hTo){
          if (hFrom === hTo) return true;
          // 樓梯（7）允許任何高度互通
          if (hFrom === 7 || hTo === 7) return true;
          // 橋（5/6）↔ 草地（4）；允許雙向
          const bridgeSide = (hFrom===5||hFrom===6) && hTo===4;
          const grassSide  = (hFrom===4) && (hTo===5||hTo===6);
          return bridgeSide || grassSide;
        }
        function heightAt(k){ return tileHeights.has(k) ? tileHeights.get(k) : 0; }
        // 先做高度規則：只允許合法的高度切換
        for (const k of cornerKeys) {
          const targetH = heightAt(k) || currentHeight; // 無高度則視同當前高度（避免空白格誤阻擋）
          const onStairsTarget = rampOverrideSet.has(k);
          const ok = canTransition(currentHeight, targetH) || onStairsNow || onStairsTarget;
          if (!ok) return true; // 不符合高度互通規則：阻擋
        }
        // 再做碰撞規則：
        for (const k of cornerKeys) {
          // 絕對障礙：建築物；懸崖在橋/合法高度切換時可忽略
          const bld = collisionsByLayer.get('buildings');
          const clf = collisionsByLayer.get('cliff');
          if (bld && bld.has(k)) return true;
          if (clf && clf.has(k)) {
            const targetH = heightAt(k) || currentHeight;
            const cliffH = layerHeights.get('cliff') || 2;
            const ok = (targetH > cliffH) && (canTransition(currentHeight, targetH) || onStairsNow || rampOverrideSet.has(k));
            if (!ok) return true; // 未在高於懸崖的合法高度：阻擋
          }
          // 高度感知障礙：岩石、橋（在非合法高度切換時阻擋；在正確高度可站）
          const onRock = collisionsByLayer.get('rocks') && collisionsByLayer.get('rocks').has(k);
          const onBridgeH = collisionsByLayer.get('bridge-h') && collisionsByLayer.get('bridge-h').has(k);
          const onBridgeV = collisionsByLayer.get('bridge-v') && collisionsByLayer.get('bridge-v').has(k);
          if (onRock || onBridgeH || onBridgeV) {
            const targetH = heightAt(k) || currentHeight;
            const ok = canTransition(currentHeight, targetH) || onStairsNow || rampOverrideSet.has(k);
            if (!ok) return true; // 不在合法高度：阻擋
          }
        }
        return false;
      }

      function distance(ax, ay, bx, by){
        const dx = ax - bx; const dy = ay - by; return Math.sqrt(dx*dx + dy*dy);
      }

      // 點擊：設定移動目標；若點到 NPC，目標為 NPC 位置（主線模式優先捕獲，阻斷生存輸入）
      const onCanvasClick = (e) => {
        const p = screenToCanvas(e);
        let target = p;
        for (const npc of npcs) {
          if (distance(p.x, p.y, npc.x, npc.y) <= 32) { target = { x: npc.x, y: npc.y }; break; }
        }
        player.targetX = target.x; player.targetY = target.y;
        try { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } catch(_) {}
      };
      canvas.addEventListener('click', onCanvasClick, { capture: true });
      this._onCanvasClick = onCanvasClick;

      // 主線模式對話覆蓋層（簡易）
      let dialogEl = null;
      function showDialog(lines){
        try {
          const host = document.getElementById('game-screen');
          if (!host) return;
          if (!dialogEl) {
            dialogEl = document.createElement('div');
            dialogEl.id = 'story-dialog';
            dialogEl.style.position = 'absolute';
            dialogEl.style.left = '50%';
            dialogEl.style.bottom = '24px';
            dialogEl.style.transform = 'translateX(-50%)';
            dialogEl.style.background = 'rgba(0,0,0,0.7)';
            dialogEl.style.color = '#fff';
            dialogEl.style.padding = '12px 16px';
            dialogEl.style.borderRadius = '8px';
            dialogEl.style.maxWidth = '80%';
            dialogEl.style.fontSize = '16px';
            dialogEl.style.lineHeight = '1.6';
            dialogEl.style.zIndex = '1000';
            host.appendChild(dialogEl);
          }
          dialogEl.innerHTML = Array.isArray(lines) ? lines.map(l => `<div>${l}</div>`).join('') : `<div>${String(lines || '')}</div>`;
          dialogEl.onclick = () => { if (dialogEl) dialogEl.remove(); dialogEl = null; };
        } catch(_){}
      }

      // 地圖繪製：支援 Tiled JSON 與 SpriteFusion JSON（僅渲染視窗範圍）
      function drawTileMap(){
        const mapData = getResource('map');
        const sheetImg = getResource('sheet');
        if (!mapData || !sheetImg) return false;
        const info = getMapInfo();

        // 分支 1：Tiled JSON（tilelayer + data）
        if (Array.isArray(mapData.layers) && mapData.layers.some(l => l.type === 'tilelayer' && Array.isArray(l.data))) {
          const tw = info.tw; const th = info.th; const cols = info.tilesW; const rows = info.tilesH;
          const ts = (Array.isArray(mapData.tilesets) && mapData.tilesets[0]) ? mapData.tilesets[0] : { firstgid: 1 };
          const firstgid = ts.firstgid || 1;
          const sheetCols = Math.floor(sheetImg.width / tw);
          const tileLayers = mapData.layers.filter(l => l.type === 'tilelayer');
          const minX = Math.max(0, Math.floor(camera.x / tw));
          const minY = Math.max(0, Math.floor(camera.y / th));
          const maxX = Math.min(cols-1, Math.floor((camera.x + canvas.width) / tw));
          const maxY = Math.min(rows-1, Math.floor((camera.y + canvas.height) / th));
          for (const layer of tileLayers) {
            const data = Array.isArray(layer.data) ? layer.data : null; if (!data) continue;
            for (let ty = minY; ty <= maxY; ty++) {
              for (let tx = minX; tx <= maxX; tx++) {
                const idx = ty * cols + tx;
                const gid = data[idx]; if (!gid || gid === 0) continue;
                const tileIndex = gid - firstgid; if (tileIndex < 0) continue;
                const sx = (tileIndex % sheetCols) * tw;
                const sy = Math.floor(tileIndex / sheetCols) * th;
                const dx = tx * tw - camera.x; const dy = ty * th - camera.y;
                ctx2d.drawImage(sheetImg, sx, sy, tw, th, dx, dy, tw, th);
              }
            }
          }
          return true;
        }

        // 分支 2：SpriteFusion JSON（tileSize + layers[].tiles[{id,x,y}]）
        if (typeof mapData.tileSize === 'number' && Array.isArray(mapData.layers)) {
          const tw = info.tw; const th = info.th;
          const sheetCols = Math.floor(sheetImg.width / tw);
          // 明確層序（由下到上）：Background → 沙子 → Cliff → Rocks → Grass → Bridge-vertical → Bridge-horizontal → Stairs → Shadows → Small rocks → Trees back → Buildings → Trees front → Miscs
          const order = [
            'background', 'sand', '沙', 'cliff', 'rocks', 'grass',
            'bridge - vertical', 'bridge vertical',
            'bridge - horizontal', 'bridge horizontal',
            'stairs', 'shadows', 'small rocks',
            'trees back', 'buildings', 'trees front', 'miscs'
          ];
          const rank = (name) => {
            const n = String(name || '').toLowerCase();
            for (let i = 0; i < order.length; i++) {
              const key = order[i];
              if (key === '沙') { if (n.includes('沙')) return i; }
              else if (n.includes(key)) return i;
            }
            return order.length + 5;
          };
          const ordered = [...mapData.layers].sort((a,b) => rank(a.name) - rank(b.name));
          for (const layer of ordered) {
            const tiles = Array.isArray(layer.tiles) ? layer.tiles : [];
            for (const t of tiles) {
              const id = Number(t.id) || 0; const gx = Number(t.x) || 0; const gy = Number(t.y) || 0;
              const sx = (id % sheetCols) * tw;
              const sy = Math.floor(id / sheetCols) * th;
              const worldX = gx * tw; const worldY = gy * th;
              if (worldX + tw < camera.x || worldX > camera.x + canvas.width || worldY + th < camera.y || worldY > camera.y + canvas.height) continue;
              const dx = worldX - camera.x; const dy = worldY - camera.y;
              ctx2d.drawImage(sheetImg, sx, sy, tw, th, dx, dy, tw, th);
            }
          }
          return true;
        }

        return false;
      }

      function drawNPCs(){
        ctx2d.fillStyle = 'rgba(255,255,255,0.9)';
        ctx2d.strokeStyle = '#333';
        npcs.forEach(npc => {
          ctx2d.beginPath();
          ctx2d.arc(npc.x - camera.x, npc.y - camera.y, 12, 0, Math.PI*2);
          ctx2d.fill(); ctx2d.stroke();
          ctx2d.fillStyle = '#000';
          ctx2d.font = '14px sans-serif';
          ctx2d.fillText(npc.name, npc.x - camera.x + 16, npc.y - camera.y + 4);
          ctx2d.fillStyle = 'rgba(255,255,255,0.9)';
        });
      }

      // —— 調試：碰撞與高度覆蓋層 ——
      let debugShowColliders = false;
      let debugShowHeights = false;
      window.addEventListener('keydown', (e)=>{
        if (e.key.toLowerCase() === 'c') debugShowColliders = !debugShowColliders; // 切換障礙格顯示
        if (e.key.toLowerCase() === 'h') debugShowHeights = !debugShowHeights;     // 切換高度圖顯示
      });
      function drawDebugOverlays(){
        const info = getMapInfo(); const tw = info.tw; const th = info.th;
        // 高度圖（走面層）：1..7 不同顏色
        if (debugShowHeights) {
          for (const [k, h] of tileHeights.entries()) {
            const [gx, gy] = k.split(',').map(Number);
            const dx = gx * tw - camera.x; const dy = gy * th - camera.y;
            if (dx + tw < 0 || dy + th < 0 || dx > canvas.width || dy > canvas.height) continue;
            const palette = {
              1: 'rgba(0,128,255,0.25)',
              2: 'rgba(128,0,128,0.25)',
              3: 'rgba(0,200,0,0.25)',
              4: 'rgba(0,150,0,0.25)',
              5: 'rgba(255,215,0,0.25)',
              6: 'rgba(255,165,0,0.25)',
              7: 'rgba(255,0,255,0.25)'
            };
            ctx2d.fillStyle = palette[h] || 'rgba(200,200,200,0.2)';
            ctx2d.fillRect(dx, dy, tw, th);
          }
        }
        // 障礙格：紅色透明方塊
        if (debugShowColliders) {
          for (const k of collisionSet) {
            const [gx, gy] = k.split(',').map(Number);
            const dx = gx * tw - camera.x; const dy = gy * th - camera.y;
            if (dx + tw < 0 || dy + th < 0 || dx > canvas.width || dy > canvas.height) continue;
            ctx2d.fillStyle = 'rgba(255,0,0,0.35)';
            ctx2d.fillRect(dx, dy, tw, th);
          }
          // 樓梯／橋面覆蓋：綠框
          ctx2d.strokeStyle = 'rgba(0,200,0,0.7)';
          for (const k of rampOverrideSet) {
            const [gx, gy] = k.split(',').map(Number);
            const dx = gx * tw - camera.x; const dy = gy * th - camera.y;
            if (dx + tw < 0 || dy + th < 0 || dx > canvas.width || dy > canvas.height) continue;
            ctx2d.strokeRect(dx+1, dy+1, tw-2, th-2);
          }
          // 玩家四角：白點
          function dot(x,y){ ctx2d.fillStyle = '#fff'; ctx2d.beginPath(); ctx2d.arc(x, y, 2, 0, Math.PI*2); ctx2d.fill(); }
          const r = 14;
          dot(player.x - r - camera.x, player.y - r - camera.y);
          dot(player.x + r - camera.x, player.y - r - camera.y);
          dot(player.x - r - camera.x, player.y + r - camera.y);
          dot(player.x + r - camera.x, player.y + r - camera.y);
        }
      }

      // 鍵盤移動方向（WASD 與方向鍵），主線模式本地玩家用
      function getKeyboardDirection(){
        const dir = { x: 0, y: 0 };
        try {
          const K = (typeof Input !== 'undefined' && Input && typeof Input.isKeyDown === 'function') ? Input : null;
          if (!K) return dir;
          if (K.isKeyDown('ArrowUp') || K.isKeyDown('w') || K.isKeyDown('W')) dir.y = -1;
          if (K.isKeyDown('ArrowDown') || K.isKeyDown('s') || K.isKeyDown('S')) dir.y = 1;
          if (K.isKeyDown('ArrowLeft') || K.isKeyDown('a') || K.isKeyDown('A')) dir.x = -1;
          if (K.isKeyDown('ArrowRight') || K.isKeyDown('d') || K.isKeyDown('D')) dir.x = 1;
          if (dir.x !== 0 && dir.y !== 0) {
            const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
            if (len > 0) { dir.x /= len; dir.y /= len; }
          }
        } catch(_) {}
        return dir;
      }

      function drawPlayer(){
        if (player.img) {
          var baseSize = 32;
          try { if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.PLAYER && typeof CONFIG.PLAYER.SIZE === 'number') baseSize = CONFIG.PLAYER.SIZE; } catch(_) {}
          var scale = 1.0;
          try { if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') scale = CONFIG.PLAYER.VISUAL_SCALE; } catch(_) {}
          const size = Math.max(1, Math.floor(baseSize * scale));
          if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.showOrUpdate === 'function') {
            const src = (player.img && player.img.src) ? player.img.src : null;
            window.GifOverlay.showOrUpdate('main-player', src, player.x - camera.x, player.y - camera.y, size);
          } else {
            ctx2d.drawImage(player.img, player.x - size/2 - camera.x, player.y - size/2 - camera.y, size, size);
          }
        } else {
          ctx2d.fillStyle = '#4fc3f7';
          var scale = 1.0;
          try { if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') scale = CONFIG.PLAYER.VISUAL_SCALE; } catch(_) {}
          ctx2d.beginPath(); ctx2d.arc(player.x - camera.x, player.y - camera.y, Math.floor(14 * scale), 0, Math.PI*2); ctx2d.fill();
        }
      }

      function update(){
        // 先處理鍵盤移動；若有按鍵則優先於點擊目標
        const kd = getKeyboardDirection();
        if (kd.x !== 0 || kd.y !== 0) {
          // 取消點擊跟隨，改為鍵盤自由移動
          player.targetX = null; player.targetY = null;
          const info = getMapInfo();
          const stepX = kd.x * player.speed;
          const stepY = kd.y * player.speed;
          const tryX = player.x + stepX;
          const tryY = player.y;
          if (!isBlocked(tryX, tryY)) player.x = tryX;
          const tryY2 = player.y + stepY;
          if (!isBlocked(player.x, tryY2)) player.y = tryY2;
          const half = 16;
          player.x = clamp(player.x, half, info.pixelW - half);
          player.y = clamp(player.y, half, info.pixelH - half);
        } else if (player.targetX != null && player.targetY != null) {
          const dx = player.targetX - player.x;
          const dy = player.targetY - player.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 2) { player.targetX = null; player.targetY = null; }
          else {
            const nx = dx / dist; const ny = dy / dist;
            const info = getMapInfo();
            const stepX = nx * player.speed;
            const stepY = ny * player.speed;
            // 嘗試 X、Y 軸滑動避免卡角
            const tryX = player.x + stepX;
            const tryY = player.y;
            if (!isBlocked(tryX, tryY)) player.x = tryX;
            const tryY2 = player.y + stepY;
            if (!isBlocked(player.x, tryY2)) player.y = tryY2;
            // 邊界限制（避免走出地圖）
            const half = 16;
            player.x = clamp(player.x, half, info.pixelW - half);
            player.y = clamp(player.y, half, info.pixelH - half);

            // 不維持玩家高度狀態：避免離開樓梯後持續忽略邊界碰撞
          }
        }
        // 鏡頭跟隨
        centerCameraOnPlayer();
        // 接近NPC時觸發對話
        for (const npc of npcs) {
          if (distance(player.x, player.y, npc.x, npc.y) <= 24) {
            showDialog(npc.dialogues);
          }
        }
      }

      function render(){
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        if (!drawTileMap()) {
          // 後備：若地圖或素材未就緒，顯示提示文字
          ctx2d.fillStyle = '#222';
          ctx2d.fillRect(0,0,canvas.width,canvas.height);
          ctx2d.fillStyle = '#fff';
          ctx2d.font = '20px sans-serif';
          ctx2d.fillText('主線模式：地圖資源未就緒（map.json / spritesheet.png）', 40, 60);
        }
        drawNPCs();
        drawPlayer();
        drawDebugOverlays();
      }

      // 簡易主循環（獨立於生存模式的 Game.gameLoop）
      let rafId = null;
      function loop(){ update(); render(); rafId = requestAnimationFrame(loop); }
      loop();

      // 儲存 cleanup 入口
      this._cleanup = () => {
        if (rafId) cancelAnimationFrame(rafId); rafId = null;
        if (dialogEl) { try { dialogEl.remove(); } catch(_){} dialogEl = null; }
        try { if (window.GifOverlay && typeof window.GifOverlay.hide === 'function') window.GifOverlay.hide('main-player'); } catch(_) {}
      };
    },
    exit(ctx){
      try { if (typeof this._cleanup === 'function') this._cleanup(); } catch(_){}
      // 恢復 HUD 顯示（若離開主線模式返回生存）
      try { const gameUI = document.getElementById('game-ui'); if (gameUI) gameUI.style.display = ''; } catch(_){}
      // 解除主線模式的 canvas 點擊捕獲，避免影響生存模式輸入
      try {
        const canvas = document.getElementById('game-canvas');
        if (canvas && typeof this._onCanvasClick === 'function') {
          canvas.removeEventListener('click', this._onCanvasClick, { capture: true });
          this._onCanvasClick = null;
        }
      } catch(_){}
    }
  };

  // 優先註冊到隔離化 GameModeManager；若不可用則回退到舊 ModeManager
  if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.register === 'function') {
    window.GameModeManager.register(MODE_ID, MainMode);
  } else if (typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.register === 'function') {
    window.ModeManager.register(MODE_ID, MainMode);
  } else {
    console.warn('[MainMode] 找不到可用的模式管理器，無法註冊主線模式');
  }
})();
      // （清理）舊的分類輔助函式已不再使用，改由 collisionsByLayer + getLayerConfig 控制
