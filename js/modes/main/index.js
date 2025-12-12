// 主線模式（Main Story Mode）- 冒險村莊
// 玩法骨架：
// - 不分難度，從地圖進入後可探索並與 NPC 互動。
// - 點擊地面移動，走到門口進入建築物。
// - 地圖資源：使用程序生成的地圖系統，不再依賴 map.json。
(function(){
  const MODE_ID = 'main';

  const MainMode = {
    id: MODE_ID,
    // 宣告模式資源（冒險村莊地圖所需圖片）
    getManifest(){
      return {
        images: [
          { key: 'main_bg', src: 'js/modes/main/03.png' },
          { key: 'main_tree', src: 'js/modes/main/02.png' },
          { key: 'main_home', src: 'js/modes/main/HOME.png' },
          { key: 'main_house1', src: 'js/modes/main/04.png' },
          { key: 'main_house2', src: 'js/modes/main/05.png' },
          { key: 'main_house3', src: 'js/modes/main/06.png' },
          { key: 'main_house4', src: 'js/modes/main/07.png' },
          { key: 'npc_gif', src: 'assets/images/NPC.gif' },
          { key: 'npc_sprite', src: 'assets/images/001.png' }
        ],
        audio: [
          { name: 'main', src: 'assets/audio/main.mp3' }
        ],
        json: []
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

      // 進入主線模式時，確保生存迴圈不更新
      try { if (typeof Game !== 'undefined' && Game.pause) Game.pause(true); } catch(_){}
      
      // 播放主線模式 BGM
      try {
        if (ctx && ctx.audio && typeof ctx.audio.unmuteAndPlay === 'function') {
          ctx.audio.unmuteAndPlay('main', { loop: true });
        }
      } catch(_){}

      // 標籤頁切換時恢復 BGM
      try {
        if (ctx && ctx.events) {
          ctx.events.on(document, 'visibilitychange', function(){
            try {
              if (!document.hidden && ctx && ctx.audio && typeof ctx.audio.unmuteAndPlay === 'function') {
                ctx.audio.unmuteAndPlay('main', { loop: true });
              }
            } catch(_){}
          });
          ctx.events.on(window, 'focus', function(){
            try {
              if (ctx && ctx.audio && typeof ctx.audio.unmuteAndPlay === 'function') {
                ctx.audio.unmuteAndPlay('main', { loop: true });
              }
            } catch(_){}
          });
        }
      } catch(_){}

      // 清除其他模式的 GIF 圖層殘留，避免污染
      try { if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.clearAll === 'function') window.GifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.TDGifOverlay !== 'undefined' && typeof window.TDGifOverlay.clearAll === 'function') window.TDGifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.ChallengeGifOverlay !== 'undefined' && typeof window.ChallengeGifOverlay.clearAll === 'function') window.ChallengeGifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.MainGifOverlay !== 'undefined' && typeof window.MainGifOverlay.clearAll === 'function') window.MainGifOverlay.clearAll(); } catch(_){}

      // 創建右上角 UI 介紹框（固定在 viewport 內，720P 畫布中）
      let mainUIEl = null;
      function createMainUI() {
        try {
          const viewport = document.getElementById('viewport');
          if (!viewport) return;
          mainUIEl = document.createElement('div');
          mainUIEl.id = 'main-mode-ui';
          mainUIEl.style.position = 'absolute';
          mainUIEl.style.top = '20px';
          mainUIEl.style.right = '20px';
          mainUIEl.style.color = '#fff';
          mainUIEl.style.background = 'rgba(0, 0, 0, 0.75)';
          mainUIEl.style.padding = '20px';
          mainUIEl.style.borderRadius = '12px';
          mainUIEl.style.pointerEvents = 'none';
          mainUIEl.style.fontFamily = '"Microsoft JhengHei", sans-serif';
          mainUIEl.style.border = '2px solid #aaa';
          mainUIEl.style.fontSize = '18px';
          mainUIEl.style.zIndex = '10000'; // 確保在最前面，高於所有遊戲物件（遊戲物件最大 z-index 約 100 + 列表長度）
          mainUIEl.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
          mainUIEl.style.width = '250px';
          mainUIEl.innerHTML = `
            <div style="font-size: 22px; margin-bottom: 10px; border-bottom:1px solid #777; padding-bottom:5px;">冒險村莊</div>
            <div>移動: <span style="color: #ffd700; font-weight: bold;">WASD</span> 或 <span style="color: #ffd700; font-weight: bold;">滑鼠左鍵</span></div>
            <div style="font-size: 14px; color: #ccc; margin-top: 5px;">點擊地面移動 / 走到門口進入</div>
            <div style="margin-top: 10px;">位置: <span id="main-location" style="color:#4f4">中央廣場</span></div>
          `;
          viewport.appendChild(mainUIEl);
        } catch(_) {}
      }
      createMainUI();

      // 更新位置顯示
      function updateLocationText(text) {
        try {
          const locationEl = document.getElementById('main-location');
          if (locationEl) locationEl.innerText = text || '中央廣場';
        } catch(_) {}
      }

      // 創建 ESC 菜單
      let mainMenuEl = null;
      let isMenuOpen = false;
      function createMainMenu() {
        try {
          const viewport = document.getElementById('viewport');
          if (!viewport) return;
          
          mainMenuEl = document.createElement('div');
          mainMenuEl.id = 'main-mode-menu';
          mainMenuEl.className = 'main-mode-menu hidden';
          mainMenuEl.innerHTML = `
            <div class="main-menu-overlay"></div>
            <div class="main-menu-card">
              <h2 class="main-menu-title">遊戲選單</h2>
              <div class="main-menu-content">
                <div class="main-menu-section">
                  <label class="main-menu-label">音樂音量</label>
                  <div class="main-menu-slider-container">
                    <input type="range" id="main-music-volume" class="main-menu-slider" min="0" max="100" value="50">
                    <span id="main-music-volume-text" class="main-menu-volume-text">50%</span>
                  </div>
                </div>
                <div class="main-menu-section">
                  <label class="main-menu-label">音效音量</label>
                  <div class="main-menu-slider-container">
                    <input type="range" id="main-sound-volume" class="main-menu-slider" min="0" max="100" value="70">
                    <span id="main-sound-volume-text" class="main-menu-volume-text">70%</span>
                  </div>
                </div>
                <div class="main-menu-buttons">
                  <button id="main-menu-return" class="main-menu-btn primary">返回主選單</button>
                  <button id="main-menu-resume" class="main-menu-btn">繼續遊戲</button>
                </div>
              </div>
            </div>
          `;
          viewport.appendChild(mainMenuEl);

          // 初始化音量滑塊
          const musicSlider = document.getElementById('main-music-volume');
          const musicText = document.getElementById('main-music-volume-text');
          const soundSlider = document.getElementById('main-sound-volume');
          const soundText = document.getElementById('main-sound-volume-text');

          if (musicSlider && musicText) {
            try {
              const initMusicVol = (typeof AudioManager !== 'undefined' && AudioManager.musicVolume !== undefined) 
                ? Math.round(AudioManager.musicVolume * 100) 
                : 50;
              musicSlider.value = initMusicVol;
              musicText.textContent = initMusicVol + '%';
            } catch(_) {}
            
            musicSlider.addEventListener('input', function() {
              const v = parseFloat(musicSlider.value) || 0;
              musicText.textContent = Math.round(v) + '%';
              try {
                // 同時更新 AudioManager 和 ctx.audio 的音量
                if (typeof AudioManager !== 'undefined' && AudioManager.setMusicVolume) {
                  AudioManager.setMusicVolume(v / 100);
                }
                // 同步更新本地音軌的音量（如果使用降級播放）
                if (ctx && ctx.audio && typeof ctx.audio.setMusicVolume === 'function') {
                  ctx.audio.setMusicVolume(v / 100);
                }
              } catch(_) {}
            });
          }

          if (soundSlider && soundText) {
            try {
              const initSoundVol = (typeof AudioManager !== 'undefined' && AudioManager.soundVolume !== undefined) 
                ? Math.round(AudioManager.soundVolume * 100) 
                : 70;
              soundSlider.value = initSoundVol;
              soundText.textContent = initSoundVol + '%';
            } catch(_) {}
            
            soundSlider.addEventListener('input', function() {
              const v = parseFloat(soundSlider.value) || 0;
              soundText.textContent = Math.round(v) + '%';
              try {
                if (typeof AudioManager !== 'undefined' && AudioManager.setSoundVolume) {
                  AudioManager.setSoundVolume(v / 100);
                }
              } catch(_) {}
            });
          }

          // 返回主選單按鈕
          const returnBtn = document.getElementById('main-menu-return');
          if (returnBtn) {
            returnBtn.addEventListener('click', function() {
              try {
                // 播放按鈕點擊音效
                if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                  AudioManager.playSound('button_click2');
                }
                // 先關閉菜單（跳過 ESC 音效，因為已經播放了按鈕音效）
                toggleMainMenu(true);
                // 使用 setTimeout 確保菜單關閉動畫完成後再清理
                setTimeout(() => {
                  try {
                    // 使用 GameModeManager 正確清理資源（會自動調用 exit 和 dispose）
                    if (typeof window.GameModeManager !== 'undefined' && typeof window.GameModeManager.stop === 'function') {
                      window.GameModeManager.stop();
                    }
                    // 隱藏遊戲畫面
                    const gameScreen = document.getElementById('game-screen');
                    if (gameScreen) gameScreen.classList.add('hidden');
                    // 顯示開始畫面
                    const startScreen = document.getElementById('start-screen');
                    if (startScreen) startScreen.classList.remove('hidden');
                    // 播放選單音樂
                    try {
                      if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                        AudioScene.enterMenu();
                      } else if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                        AudioManager.playMusic('menu_music');
                      }
                    } catch(_) {}
                  } catch(e) {
                    console.error('[MainMode] 返回主選單時出錯:', e);
                  }
                }, 100);
              } catch(e) {
                console.error('[MainMode] 返回主選單時出錯:', e);
              }
            });
          }

          // 繼續遊戲按鈕
          const resumeBtn = document.getElementById('main-menu-resume');
          if (resumeBtn) {
            resumeBtn.addEventListener('click', function() {
              try {
                // 播放按鈕點擊音效
                if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                  AudioManager.playSound('button_click2');
                }
              } catch(_) {}
              // 關閉菜單（跳過 ESC 音效，因為已經播放了按鈕音效）
              toggleMainMenu(true);
            });
          }

          // 點擊遮罩關閉菜單
          const overlay = mainMenuEl.querySelector('.main-menu-overlay');
          if (overlay) {
            overlay.addEventListener('click', function() {
              toggleMainMenu();
            });
          }
        } catch(_) {}
      }

      function toggleMainMenu(skipSound) {
        try {
          if (!mainMenuEl) return;
          // 播放 ESC 音效（僅當不是由按鈕觸發時）
          if (!skipSound) {
            try {
              if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                AudioManager.playSound('button_click');
              }
            } catch(_) {}
          }
          isMenuOpen = !isMenuOpen;
          if (isMenuOpen) {
            mainMenuEl.classList.remove('hidden');
          } else {
            mainMenuEl.classList.add('hidden');
          }
        } catch(_) {}
      }

      createMainMenu();

      // ESC 鍵切換菜單
      try {
        if (ctx && ctx.events && typeof ctx.events.on === 'function') {
          ctx.events.on(document, 'keydown', (e) => {
            try {
              const key = e.key || e.code;
              if (key === 'Escape' || key === 'Esc') {
                const gameScreen = document.getElementById('game-screen');
                if (gameScreen && !gameScreen.classList.contains('hidden')) {
                  toggleMainMenu();
                  e.preventDefault();
                  try { e.stopPropagation(); } catch(_) {}
                  try { e.stopImmediatePropagation(); } catch(_) {}
                }
              }
            } catch(_) {}
          }, { capture: true });
        }
      } catch(_) {}

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

      // 資源存取函數
      function getImage(key){
        try {
          if (ctx && ctx.resources) {
            return ctx.resources.getImage(key);
          }
        } catch(_) {}
        // 回退到全域 Game.images（如果可用）
        try {
          if (typeof Game !== 'undefined' && Game.images && Game.images[key]) {
            return Game.images[key];
          }
        } catch(_) {}
        return null;
      }

      // 世界參數
      const TILE = 48; 
      const MAP_W = 3840;
      const MAP_H = 2160;
      const MAP_COLS = MAP_W / TILE; 
      const MAP_ROWS = MAP_H / TILE; 
      
      const CENTER_X = MAP_W / 2;
      const CENTER_Y = MAP_H / 2;

      const PLAYER_W = 48, PLAYER_H = 60;
      const TREE_W = 120, TREE_H = 140; 
      const HOME_W = 500, HOME_H = 403;

      const T_PASSABLE = 0;
      const T_PATH = 1; 
      const T_WALL = 2; 
      const T_FLOOR = 3; 
      const T_EXIT = 4;

      // 固定樹木座標
      const TREE_OFFSETS = [
        {x: -300, y: -400}, {x: -800, y: -200}, {x: -550, y: -650}, {x: -250, y: -600},
        {x: 400, y: -300}, {x: 750, y: -250}, {x: 500, y: -550}, {x: 900, y: -400},
        {x: -450, y: 350}, {x: -800, y: 250}, {x: -600, y: 600}, {x: -300, y: 700}, {x: -900, y: 500},
        {x: 450, y: 350}, {x: 800, y: 100}, {x: 850, y: 700}, {x: 350, y: 700}, {x: 950, y: 550}
      ];

      // 實體類別
      class Entity {
        constructor(type, x, y, w, h) {
          this.type = type; 
          this.x = x;
          this.y = y;
          this.width = w;
          this.height = h;
          this.solid = true;
          this.col = { x: 0, y: h - 20, w: w, h: 20 }; 
          this.door = null; 
        }
        getBounds() {
          return { x: this.x + this.col.x, y: this.y + this.col.y, w: this.col.w, h: this.col.h };
        }
      }

      // 地圖系統
      const MapSystem = {
        current: 'outdoor',
        width: MAP_COLS, height: MAP_ROWS,
        data: [],     
        entities: [], 
        
        load(targetMap) {
          this.current = targetMap;
          this.entities = []; 
          this.data = [];
          
          // 清除所有 DOM 元素（切換地圖時）
          if (typeof window.MainGifOverlay !== 'undefined') {
            window.MainGifOverlay.clearAll();
          } 

          if (targetMap === 'outdoor') {
            this.generateOutdoor();
            updateLocationText('中央廣場');
          } else {
            this.generateIndoor(targetMap);
            updateLocationText((targetMap === 'indoor_home') ? '主屋大廳' : '小屋內部');
          }
        },

        generateOutdoor() {
          this.width = MAP_COLS; this.height = MAP_ROWS; 
          
          for(let y=0; y<this.height; y++) {
            this.data[y] = [];
            for(let x=0; x<this.width; x++) this.data[y][x] = T_PASSABLE;
          }

          // 道路
          const cx = MAP_COLS / 2;
          const cy = MAP_ROWS / 2; 
          const r = 8; 

          for(let y=0; y<this.height; y++) {
            for(let x=0; x<this.width; x++) {
              let dist = Math.sqrt((x-cx)**2 + (y-cy)**2);
              if (dist < r || Math.abs(x-cx) < 1.5 || Math.abs(y-cy) < 1.5) {
                this.data[y][x] = T_PATH;
              }
            }
          }

          // [主屋] HOME.png
          let hx = CENTER_X - (HOME_W / 2);
          let hy = CENTER_Y - 300; 
          let home = new Entity('home', hx, hy, HOME_W, HOME_H);
          
          home.col = { x: 150, y: 220, w: 330, h: 175 }; 
          home.layerId = 'home-main'; // 獨立圖層 ID
          
          home.door = { 
            x: hx + 270, 
            y: hy + 350, 
            w: 60, 
            h: 60,
            target: 'indoor_home',
            returnX: hx + 300, // 門的中心 X
            returnY: hy + 370  // 門的底部稍微前面一點（原本是 420，太遠了）
          };
          this.entities.push(home);

          // [NPC] 放在中間建築物外部右下角（位置上的右下，不是建築物內部）
          // NPC 原始比例 279x320，縮放到接近玩家大小（48x60）
          // 縮放比例 = 60/320 ≈ 0.1875
          const NPC_SCALE = 60 / 320; // 以高度為基準縮放
          const NPC_W = Math.round(279 * NPC_SCALE); // ≈ 52
          const NPC_H = 60; // 與玩家高度一致
          // 建築物外部右下角：建築物右邊界 + 偏移，建築物下邊界 + 偏移
          const npcX = hx + HOME_W + 20; // 建築物右邊界外側，稍微偏移
          const npcY = hy + HOME_H + 10; // 建築物下邊界外側，稍微偏移
          let npc = new Entity('npc', npcX, npcY, NPC_W, NPC_H);
          npc.solid = false; // NPC 不阻擋玩家
          npc.domId = 'main-npc';
          npc.layerId = 'npc';
          npc.spriteSheet = null; // 雪碧圖（001.png），用於滑鼠游標
          npc.spriteFrame = 0; // 當前雪碧圖幀（0-7）
          this.entities.push(npc);

          // [NPC 房子]
          const h1Img = getImage('main_house1');
          const h2Img = getImage('main_house2');
          const h3Img = getImage('main_house3');
          const h4Img = getImage('main_house4');
          if (h1Img) this.addImageHouse(CENTER_X - 750, CENTER_Y - 350, h1Img, 268, 300, 'indoor_A', 'house-A');
          if (h2Img) this.addImageHouse(CENTER_X + 1000, CENTER_Y - 500, h2Img, 266, 300, 'indoor_B', 'house-B');
          if (h3Img) this.addImageHouse(CENTER_X - 600, CENTER_Y + 500, h3Img, 300, 190, 'indoor_C', 'house-C');
          if (h4Img) this.addImageHouse(CENTER_X + 600, CENTER_Y + 500, h4Img, 284, 400, 'indoor_A', 'house-D');

          // 樹木（每棵樹獨立圖層）
          const treeImg = getImage('main_tree');
          const TREE_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
          for (let idx = 0; idx < TREE_OFFSETS.length; idx++) {
            let pos = TREE_OFFSETS[idx];
            let tx = CENTER_X + pos.x;
            let ty = CENTER_Y + pos.y;
            let tree = new Entity('tree', tx, ty, TREE_W, TREE_H);
            tree.col = { x: 45, y: 110, w: 30, h: 20 };
            tree.img = treeImg;
            tree.domId = 'main-tree-' + idx; // DOM ID
            tree.layerId = 'tree-' + (TREE_NAMES[idx] || idx); // 獨立圖層 ID（tree-A, tree-B, ...）
            this.entities.push(tree);
          }
        },

        addImageHouse(x, y, imgAsset, w, h, mapId, layerId) {
          let house = new Entity('img_house', x, y, w, h);
          house.img = imgAsset; 
          
          house.col = { x: 20, y: h - 150, w: w - 40, h: 150 };
          house.layerId = layerId; // 獨立圖層 ID
          
          let doorW = 50;
          let doorX = x + (w / 2) - (doorW / 2);
          let doorY = y + h - 20;

          house.door = {
            x: doorX, y: doorY, w: doorW, h: 40,
            target: mapId,
            returnX: doorX + doorW/2, // 門的中心 X
            returnY: doorY + 10  // 門的底部稍微前面一點（原本是 y + h + 20，太遠了）
          };
          // 為每個房子分配唯一的 DOM ID
          house.domId = 'main-house-' + this.entities.length;
          this.entities.push(house);
        },

        generateIndoor(mapId) {
          let cols, rows;
          if (mapId === 'indoor_home') { cols = 60; rows = 40; } 
          else { cols = 20; rows = 15; }

          this.width = cols; this.height = rows;

          for(let y=0; y<this.height; y++) {
            this.data[y] = [];
            for(let x=0; x<this.width; x++) {
              if (x===0 || x===cols-1 || y===0 || y===rows-1) {
                // 出口對齊中間：減少右邊格子一格（原本是 < 3，現在改為左邊 <= 2，右邊 <= 1）
                const centerX = cols / 2;
                if (y===rows-1 && (x <= centerX + 1 && x >= centerX - 2)) {
                  this.data[y][x] = T_EXIT;
                } else {
                  this.data[y][x] = T_WALL;
                }
              } else {
                this.data[y][x] = T_FLOOR;
              }
            }
          }
        }
      };

      // 玩家與控制
      const player = {
        x: CENTER_X, y: CENTER_Y + 200,
        width: PLAYER_W, height: PLAYER_H,
        speed: 4, // 降低移動速度（原本是8）
        lastDoor: null,
        canExit: true,
        targetX: null, 
        targetY: null,
        facingRight: true // 面向右側（用於 player2 方向切換）
      };

      // 根據選角角色決定玩家圖片（支援 player2 方向切換）
      function getPlayerImage() {
      const sc = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
        let imgKey = 'player'; // 預設瑪格麗特
      if (sc && sc.spriteImageKey) {
        imgKey = sc.spriteImageKey;
      } else if (sc && sc.id === 'dada') {
        imgKey = 'player2';
        } else if (sc && sc.id === 'lilylinglan') {
          imgKey = 'player3';
      } else if (sc && sc.id === 'rokurost') {
        imgKey = 'player4';
      }
        
        // 特殊處理：player2根據移動方向切換圖片（左邊player2.png，右邊player2-1.png）
        if (imgKey === 'player2') {
          imgKey = player.facingRight ? 'player2-1' : 'player2';
        }
        
        // 優先從 Game.images 取得
        if (typeof Game !== 'undefined' && Game.images && Game.images[imgKey]) {
          return Game.images[imgKey];
        }
        return null;
      }

      // 鍵盤控制
      const keys = {};
      const keyHandler = (e, val) => {
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 'arrowup') keys['w'] = val;
        if (k === 's' || k === 'arrowdown') keys['s'] = val;
        if (k === 'a' || k === 'arrowleft') keys['a'] = val;
        if (k === 'd' || k === 'arrowright') keys['d'] = val;
        if (val) player.targetX = null; // 鍵盤移動時取消點擊目標
      };
      ctx.events.on(document, 'keydown', (e) => keyHandler(e, true), { capture: true });
      ctx.events.on(document, 'keyup', (e) => keyHandler(e, false), { capture: true });

      // 點擊移動
      const onCanvasClick = (e) => {
        try {
        const rect = canvas.getBoundingClientRect();
        const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
          let x, y;
        if (rotatedPortrait) {
            const u = ((e.clientX != null ? e.clientX : e.pageX) - rect.left) / rect.width;
            const v = ((e.clientY != null ? e.clientY : e.pageY) - rect.top) / rect.height;
            x = v * canvas.width;
            y = (1 - u) * canvas.height;
        } else {
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
            x = (((e.clientX != null ? e.clientX : e.pageX) - rect.left) * scaleX);
            y = (((e.clientY != null ? e.clientY : e.pageY) - rect.top) * scaleY);
          }
          const cam = getCameraOffset();
          const worldX = x + cam.x;
          const worldY = y + cam.y;
          player.targetX = worldX - PLAYER_W / 2;
          player.targetY = worldY - PLAYER_H / 2;
          try { e.preventDefault(); e.stopPropagation(); } catch(_) {}
        } catch(_){}
      };
      ctx.events.on(canvas, 'click', onCanvasClick, { capture: true });
      this._onCanvasClick = onCanvasClick;

      // 滑鼠移動檢測（用於 NPC 懸停效果，將滑鼠變成雪碧圖）
      let cursorSpriteEl = null;
      let npcHovering = false; // 追蹤是否在NPC上
      const onCanvasMouseMove = (e) => {
        try {
          if (MapSystem.current !== 'outdoor') {
            // 不在戶外地圖時，隱藏滑鼠雪碧圖
            if (cursorSpriteEl) {
              cursorSpriteEl.style.display = 'none';
            }
            return;
          }
          
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const x = ((e.clientX != null ? e.clientX : e.pageX) - rect.left) * scaleX;
          const y = ((e.clientY != null ? e.clientY : e.pageY) - rect.top) * scaleY;
          const cam = getCameraOffset();
          const worldX = x + cam.x;
          const worldY = y + cam.y;
          
          // 檢查滑鼠是否在 NPC 上（使用整個 NPC 區域，不是碰撞區域）
          let npc = MapSystem.entities.find(e => e.type === 'npc');
          if (npc) {
            // 使用整個 NPC 的邊界進行檢測，而不是碰撞區域
            const isHovering = worldX >= npc.x && worldX <= npc.x + npc.width &&
                              worldY >= npc.y && worldY <= npc.y + npc.height;
            
            if (isHovering) {
              npcHovering = true;
              // 載入雪碧圖（如果還沒載入）
              if (!npc.spriteSheet) {
                const spriteImg = getImage('npc_sprite');
                if (spriteImg) {
                  npc.spriteSheet = spriteImg;
                }
              }
              
              // 創建或獲取跟隨滑鼠的雪碧圖元素
              if (!cursorSpriteEl) {
                const viewport = document.getElementById('viewport');
                if (viewport) {
                  cursorSpriteEl = document.createElement('div');
                  cursorSpriteEl.id = 'main-cursor-sprite';
                  cursorSpriteEl.style.position = 'fixed';
                  cursorSpriteEl.style.pointerEvents = 'none';
                  cursorSpriteEl.style.imageRendering = 'pixelated';
                  cursorSpriteEl.style.zIndex = '99999'; // 確保在最上層
                  viewport.appendChild(cursorSpriteEl);
                }
              }
              
              // 如果雪碧圖已載入，顯示在滑鼠位置（使用當前動畫幀）
              if (cursorSpriteEl && npc.spriteSheet && npc.spriteSheet.complete) {
                const spriteW = 32;
                const spriteH = 32;
                const spriteCol = npc.spriteFrame % 8; // 0-7（循環）
                const spriteSrcX = spriteCol * 32; // 每幀32像素寬
                const spriteSrcY = 0; // 只有1行，所以Y始終為0
                
                // 使用滑鼠的螢幕座標（clientX, clientY）
                cursorSpriteEl.style.backgroundImage = `url(${npc.spriteSheet.src})`;
                cursorSpriteEl.style.backgroundPosition = `-${spriteSrcX}px -${spriteSrcY}px`;
                cursorSpriteEl.style.backgroundSize = '256px 32px'; // 總大小：8列*32 = 256，高度32
                cursorSpriteEl.style.left = (e.clientX || e.pageX) + 'px';
                cursorSpriteEl.style.top = (e.clientY || e.pageY) + 'px';
                cursorSpriteEl.style.width = spriteW + 'px';
                cursorSpriteEl.style.height = spriteH + 'px';
                cursorSpriteEl.style.display = '';
                
                // 隱藏原始滑鼠游標
                canvas.style.cursor = 'none';
              }
            } else {
              npcHovering = false;
              // 不在 NPC 上，隱藏雪碧圖並恢復滑鼠游標
              if (cursorSpriteEl) {
                cursorSpriteEl.style.display = 'none';
              }
              canvas.style.cursor = '';
            }
          }
        } catch(_) {}
      };
      ctx.events.on(canvas, 'mousemove', onCanvasMouseMove, { capture: true });
      this._onCanvasMouseMove = onCanvasMouseMove;

      // 鏡頭系統
      function getCameraOffset() {
        let camX, camY;
        if (MapSystem.current === 'outdoor' || MapSystem.current === 'indoor_home') {
          camX = player.x - 1280/2 + PLAYER_W/2;
          camY = player.y - 720/2 + PLAYER_H/2;
          let limitW = (MapSystem.current === 'outdoor') ? MAP_W : MapSystem.width * TILE;
          let limitH = (MapSystem.current === 'outdoor') ? MAP_H : MapSystem.height * TILE;
          camX = Math.max(0, Math.min(camX, limitW - 1280));
          camY = Math.max(0, Math.min(camY, limitH - 720));
        } else {
          camX = - (1280 - MapSystem.width*TILE) / 2;
          camY = - (720 - MapSystem.height*TILE) / 2;
        }
        return {x: camX, y: camY};
      }

      // 碰撞檢測
      function rectIntersect(r1, r2) {
        return !(r2.x > r1.x + r1.w || r2.x + r2.w < r1.x || r2.y > r1.y + r1.h || r2.y + r2.h < r1.y);
      }

      // 更新循環
      let lastFrameTime = 0;
      const SPRITE_FRAME_INTERVAL = 100; // 每100毫秒切換一幀
      function update() {
        // 更新雪碧圖動畫幀（如果NPC存在且滑鼠在NPC上）
        let npc = MapSystem.entities.find(e => e.type === 'npc');
        if (npc && npc.spriteSheet && npc.spriteSheet.complete) {
          const now = Date.now();
          if (now - lastFrameTime >= SPRITE_FRAME_INTERVAL) {
            npc.spriteFrame = (npc.spriteFrame + 1) % 8; // 循環播放 0-7
            lastFrameTime = now;
            
            // 如果滑鼠在NPC上，更新滑鼠雪碧圖的顯示
            if (npcHovering) {
              const cursorSpriteEl = document.getElementById('main-cursor-sprite');
              if (cursorSpriteEl && cursorSpriteEl.style.display !== 'none') {
                const spriteCol = npc.spriteFrame % 8; // 0-7（循環）
                const spriteSrcX = spriteCol * 32; // 每幀32像素寬
                cursorSpriteEl.style.backgroundPosition = `-${spriteSrcX}px 0px`;
              }
            }
          }
        }
        
        let nx = player.x;
        let ny = player.y;
        let moving = false;
        let moveX = 0;
        let moveY = 0;

        // 計算移動方向（參考生存模式）
        if (keys['a'] || keys['ArrowLeft']) { moveX -= 1; }
        if (keys['d'] || keys['ArrowRight']) { moveX += 1; }
        if (keys['w'] || keys['ArrowUp']) { moveY -= 1; }
        if (keys['s'] || keys['ArrowDown']) { moveY += 1; }

        // 正規化移動方向
        if (moveX !== 0 || moveY !== 0) {
          const len = Math.sqrt(moveX * moveX + moveY * moveY) || 1;
          moveX /= len;
          moveY /= len;
          nx += moveX * player.speed;
          ny += moveY * player.speed;
          moving = true;
          
          // 根據鍵盤移動方向更新面向（參考生存模式：優先水平方向）
          if (Math.abs(moveX) > 0.1) {
            player.facingRight = moveX > 0;
          }
        }

        if (!moving && player.targetX !== null) {
          const dx = player.targetX - player.x;
          const dy = player.targetY - player.y;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (dist <= player.speed) {
            nx = player.targetX;
            ny = player.targetY;
            player.targetX = null; 
          } else {
            nx += (dx / dist) * player.speed;
            ny += (dy / dist) * player.speed;
            moving = true;
            // 根據點擊移動方向更新面向（參考生存模式）
            if (Math.abs(dx) > 0.1) {
              player.facingRight = dx > 0;
            }
          }
        }

        if (!moving && player.targetX === null) return;

        // 碰撞矩形（參考 rpg_map.html）
        // 使用固定的碰撞矩形，不因角色或方向改變
        // 注意：player.x 是角色的左上角參考點，碰撞矩形相對於此點計算
        let pRect = { x: nx + 10, y: ny + 40, w: 28, h: 20 }; 
        let hit = false;

        // 檢查物件
        for (let obj of MapSystem.entities) {
          // 優先檢查門 (互動)
          if (obj.door && rectIntersect(pRect, obj.door)) {
            player.lastDoor = obj.door;
            MapSystem.load(obj.door.target);
            
            // 進入室內時，玩家位置更接近門（縮短距離）
            // 原本是 (MapSystem.height - 3) * TILE，現在改為 (MapSystem.height - 2.5) * TILE，讓玩家更接近門
            player.x = (MapSystem.width * TILE) / 2 - PLAYER_W / 2;
            player.y = (MapSystem.height - 2.5) * TILE; 
            player.targetX = null;
            
            player.canExit = false;
            setTimeout(() => player.canExit = true, 500);
            return;
          }
          // 檢查實體碰撞
          if (obj.solid && rectIntersect(pRect, obj.getBounds())) hit = true;
        }

        // 檢查網格
        let gx = Math.floor((nx + PLAYER_W/2) / TILE);
        let gy = Math.floor((ny + PLAYER_H) / TILE);
        
        if (gx>=0 && gx<MapSystem.width && gy>=0 && gy<MapSystem.height) {
          let tile = MapSystem.data[gy][gx];
          if (tile === T_WALL) hit = true;
          
          if (tile === T_EXIT && player.canExit) {
            if (player.lastDoor) {
              MapSystem.load('outdoor');
              player.x = player.lastDoor.returnX;
              player.y = player.lastDoor.returnY;
            } else {
              MapSystem.load('outdoor');
              player.x = CENTER_X; player.y = CENTER_Y;
            }
            player.targetX = null;
            return;
          }
        } else {
          hit = true;
        }

        if (!hit) { 
          player.x = nx; 
          player.y = ny; 
        } else {
          player.targetX = null;
        }
      }

      // 繪製循環
      function draw() {
        ctx2d.fillStyle = "#000"; 
        ctx2d.fillRect(0,0,canvas.width, canvas.height);

        const cam = getCameraOffset();
        const camX = cam.x;
        const camY = cam.y;

        // Layer 0: 背景
        if (MapSystem.current === 'outdoor') {
          const bgImg = getImage('main_bg');
          if (bgImg && bgImg.complete && bgImg.naturalWidth !== 0) {
            for(let r=0; r<3; r++) {
              for(let c=0; c<3; c++) {
                let bgX = c * 1280 - camX;
                let bgY = r * 720 - camY;
                if (bgX + 1280 > 0 && bgX < 1280 && bgY + 720 > 0 && bgY < 720) {
                  ctx2d.drawImage(bgImg, bgX, bgY, 1280, 720);
                }
              }
            }
          } else {
            ctx2d.fillStyle = '#2d5a27'; 
            ctx2d.fillRect(0,0,1280, 720);
          }
        } else {
          ctx2d.fillStyle = '#111'; 
          ctx2d.fillRect(0,0,1280, 720);
        }

        // Layer 1: 地形
        let startCol = Math.floor(camX / TILE);
        let startRow = Math.floor(camY / TILE);
        let cDraw = Math.ceil(1280 / TILE) + 1;
        let rDraw = Math.ceil(720 / TILE) + 1;

        for (let y = startRow; y < startRow + rDraw; y++) {
          for (let x = startCol; x < startCol + cDraw; x++) {
            if (y>=0 && y<MapSystem.height && x>=0 && x<MapSystem.width) {
              let t = MapSystem.data[y][x];
              let px = Math.floor(x*TILE - camX);
              let py = Math.floor(y*TILE - camY);

              if (t === T_PATH) {
                ctx2d.fillStyle = '#eecfa1'; 
                ctx2d.fillRect(px,py,TILE+1,TILE+1);
              } else if (t === T_FLOOR) {
                ctx2d.fillStyle = '#8b5a2b'; 
                ctx2d.fillRect(px,py,TILE+1,TILE+1);
                ctx2d.strokeStyle='#6a4015'; 
                ctx2d.strokeRect(px,py,TILE,TILE);
              } else if (t === T_WALL) {
                ctx2d.fillStyle = '#555'; 
                ctx2d.fillRect(px,py,TILE+1,TILE+1);
              } else if (t === T_EXIT) {
                ctx2d.fillStyle = '#5d3a1a'; 
                ctx2d.fillRect(px,py,TILE+1,TILE+1);
              }
            }
          }
        }

        // 目標點提示
        if (player.targetX !== null) {
          ctx2d.strokeStyle = "rgba(255, 255, 255, 0.5)";
          ctx2d.lineWidth = 2;
          ctx2d.beginPath();
          let tx = player.targetX + PLAYER_W/2 - camX;
          let ty = player.targetY + PLAYER_H/2 - camY;
          ctx2d.arc(tx, ty, 10, 0, Math.PI*2);
          ctx2d.stroke();
        }

        // Layer 2: 物件 (排序，完全按照 rpg_map.html 的邏輯：按 y + height 排序)
        // 注意：必須使用實際渲染高度，而不是固定的 PLAYER_H
        // 計算玩家的實際渲染高度（考慮角色縮放）
        const sc = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
        let playerActualHeight = PLAYER_H;
        if (sc && (sc.id === 'dada' || sc.spriteImageKey === 'player2')) {
          // player2 縮小到 85%
          playerActualHeight = Math.floor(PLAYER_H * 0.85);
        }
        
        // 完全按照 rpg_map.html 的簡單排序邏輯
        let list = [...MapSystem.entities, { type:'player', x:player.x, y:player.y, width:PLAYER_W, height:playerActualHeight }];
        list.sort((a,b) => (a.y + a.height) - (b.y + b.height));
        let playerLayerIndex = 0;
        for (let i = 0; i < list.length; i++) {
          if (list[i].type === 'player') {
            playerLayerIndex = i;
            break;
          }
        }

        // 繪製玩家函數（使用 MainGifOverlay）
        function drawPlayer() {
          const px = Math.round(player.x - camX);
          const py = Math.round(player.y - camY);
          
          if (px+PLAYER_W<0 || px>1280 || py+PLAYER_H<0 || py>720) return;

          // 動態獲取玩家圖片（支援 player2 方向切換）
          const currentPlayerImg = getPlayerImage();
          
          if (currentPlayerImg && currentPlayerImg.complete) {
            const sc = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
            let renderWidth = PLAYER_W;
            let renderHeight = PLAYER_H;
            
            // 特殊處理不同角色的寬高比
            if (sc && (sc.id === 'rokurost' || sc.spriteImageKey === 'player4')) {
              // player4.png 保持寬高比 (500:627)
              const imgWidth = currentPlayerImg.naturalWidth || currentPlayerImg.width || 500;
              const imgHeight = currentPlayerImg.naturalHeight || currentPlayerImg.height || 627;
              const aspectRatio = imgWidth / imgHeight;
              renderHeight = PLAYER_H;
              renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
            } else if (sc && (sc.id === 'lilylinglan' || sc.spriteImageKey === 'player3')) {
              // player3.gif 保持原比例 (1:1)
              const imgWidth = currentPlayerImg.naturalWidth || currentPlayerImg.width || 320;
              const imgHeight = currentPlayerImg.naturalHeight || currentPlayerImg.height || 320;
              const aspectRatio = imgWidth / imgHeight;
              renderHeight = PLAYER_H;
              renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
            } else if ((sc && (sc.id === 'margaret' || sc.spriteImageKey === 'player')) || (!sc || /player\.gif$/i.test(currentPlayerImg.src || ''))) {
              // player.gif 保持原比例 (1:1)
              const imgWidth = currentPlayerImg.naturalWidth || currentPlayerImg.width || 320;
              const imgHeight = currentPlayerImg.naturalHeight || currentPlayerImg.height || 320;
              const aspectRatio = imgWidth / imgHeight;
              renderHeight = PLAYER_H;
              renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
            } else if (sc && (sc.id === 'dada' || sc.spriteImageKey === 'player2')) {
              // player2.png / player2-1.png 保持原比例（參考生存模式：290x242）
              // 主線模式：縮小一點體型（約 85%）
              const imgWidth = currentPlayerImg.naturalWidth || currentPlayerImg.width || 290;
              const imgHeight = currentPlayerImg.naturalHeight || currentPlayerImg.height || 242;
              const aspectRatio = imgWidth / imgHeight;
              renderHeight = Math.floor(PLAYER_H * 0.85); // 縮小到 85%
              renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
            }
            
            // 使用 MainGifOverlay 顯示（支援 GIF 動畫）
            // 注意：player.x 是角色的左上角參考點
            // 為了確保碰撞檢測一致，player2 需要根據實際渲染寬度調整位置
            let renderX = player.x - camX;
            let renderY = player.y - camY;
            
            // player2 特殊處理：如果渲染寬度與 PLAYER_W 不同，需要調整位置以保持碰撞檢測一致
            if (sc && (sc.id === 'dada' || sc.spriteImageKey === 'player2')) {
              // player2 縮小後，渲染寬度可能與 PLAYER_W 不同
              // 為了保持碰撞檢測一致，需要調整渲染位置
              // 確保角色的視覺中心對齊 player.x + PLAYER_W/2
              const centerOffset = (PLAYER_W - renderWidth) / 2;
              renderX = player.x - camX + centerOffset;
            }
            
            if (typeof window.MainGifOverlay !== 'undefined' && typeof window.MainGifOverlay.showOrUpdate === 'function') {
              // 動態計算玩家的 z-index：在碰撞區前方
              // 使用玩家的完整碰撞矩形進行檢測，而不是只檢查中心點
              const playerColRect = { x: player.x + 10, y: player.y + 40, w: 28, h: 20 };
              let playerZIndex = 6; // 預設在碰撞區前方
              
              // 檢查玩家碰撞矩形是否與任何樹的碰撞區重疊
              for (let tree of MapSystem.entities) {
                if (tree.type === 'tree' && tree.col) {
                  const treeColRect = {
                    x: tree.x + tree.col.x,
                    y: tree.y + tree.col.y,
                    w: tree.col.w,
                    h: tree.col.h
                  };
                  // 使用矩形相交檢測
                  if (rectIntersect(playerColRect, treeColRect)) {
                    playerZIndex = 7; // 玩家在樹的碰撞區前方
                    break;
                  }
                }
              }
              
              // 檢查玩家碰撞矩形是否與任何房子的碰撞區重疊
              for (let house of MapSystem.entities) {
                if ((house.type === 'home' || house.type === 'img_house') && house.col) {
                  const houseColRect = {
                    x: house.x + house.col.x,
                    y: house.y + house.col.y,
                    w: house.col.w,
                    h: house.col.h
                  };
                  // 使用矩形相交檢測
                  if (rectIntersect(playerColRect, houseColRect)) {
                    playerZIndex = 7; // 玩家在房子的碰撞區前方
                    break;
                  }
                }
              }
              
              // 使用動態 z-index
              window.MainGifOverlay.showOrUpdate('main-player', currentPlayerImg.src, renderX, renderY, { width: renderWidth, height: renderHeight }, { layerId: 'player', dynamicZIndex: playerZIndex });
            } else {
              // 後備：Canvas 繪製（GIF 不會動）
              const adjustedPx = sc && (sc.id === 'dada' || sc.spriteImageKey === 'player2') 
                ? Math.round(px + (PLAYER_W - renderWidth) / 2)
                : px;
              ctx2d.drawImage(currentPlayerImg, adjustedPx, py, renderWidth, renderHeight);
            }
          } else {
            // 後備方塊人
            ctx2d.fillStyle = '#3498db'; 
            ctx2d.fillRect(px, py, PLAYER_W, PLAYER_H);
            ctx2d.fillStyle = '#f1c40f'; 
            ctx2d.fillRect(px + 4, py + 4, PLAYER_W - 8, 20);
          ctx2d.fillStyle = '#000';
            ctx2d.fillRect(px + 10, py + 10, 4, 4);
            ctx2d.fillRect(px + PLAYER_W - 14, py + 10, 4, 4);
          }
        }

        // 完全按照 rpg_map.html 的 canvas 繪製邏輯：
        // 1. 按 y + height 排序（已完成）
        // 2. 按順序分配 z-index，後繪製的（y + height 更大的）z-index 更高
        // 3. 不再使用碰撞檢測來動態調整 z-index，完全依賴排序順序
        
        // 計算玩家的碰撞矩形（僅用於精確的碰撞檢測，不用於圖層）
        const playerColRect = { x: player.x + 10, y: player.y + 40, w: 28, h: 20 };
        
        // 使用 DOM 元素渲染所有實體（包括玩家、樹木、房子），完全按照排序順序
        // z-index 基於排序順序：排序越後面的（y + height 越大），z-index 越高
        for (let i = 0; i < list.length; i++) {
          let obj = list[i];
          let px = Math.round(obj.x - camX);
          let py = Math.round(obj.y - camY);
          
          if (px+obj.width<0 || px>1280 || py+obj.height<0 || py>720) {
            // 不在視野內，隱藏對應的 DOM 元素
            if (obj.type === 'player') {
              if (typeof window.MainGifOverlay !== 'undefined') {
                window.MainGifOverlay.hide('main-player');
              }
            } else if (obj.type === 'tree') {
              if (typeof window.MainGifOverlay !== 'undefined' && obj.domId) {
                window.MainGifOverlay.hide(obj.domId);
              }
            } else if (obj.type === 'home') {
              if (typeof window.MainGifOverlay !== 'undefined') {
                window.MainGifOverlay.hide('main-home');
              }
            } else if (obj.type === 'img_house') {
              if (typeof window.MainGifOverlay !== 'undefined' && obj.domId) {
                window.MainGifOverlay.hide(obj.domId);
              }
            }
            continue;
          }

          // 根據排序順序分配 z-index（完全模擬 canvas 的繪製順序）
          // 排序越後面的（i 越大），z-index 越高
          // 使用 100 + i 確保有足夠的間隔，且不會與 UI（z-index 10）衝突
          const baseZIndex = 100 + i;

          if (obj.type === 'player') {
            // 玩家使用 MainGifOverlay 顯示（支援 GIF 動畫）
            drawPlayer();
            // 確保玩家的 z-index 正確（完全按照排序順序）
            if (typeof window.MainGifOverlay !== 'undefined') {
              const playerEl = document.getElementById('main-gif-overlay-main-player');
              if (playerEl) {
                playerEl.style.zIndex = String(baseZIndex);
              }
            }
          } else if (obj.type === 'home') {
            // 主屋使用 DOM 元素顯示
            const homeImg = getImage('main_home');
            if (homeImg && homeImg.complete && typeof window.MainGifOverlay !== 'undefined') {
              window.MainGifOverlay.showOrUpdate('main-home', homeImg, px, py, { width: obj.width, height: obj.height }, { layerId: obj.layerId || 'home-main', dynamicZIndex: baseZIndex });
            }
          } else if (obj.type === 'tree') {
            // 樹木使用 DOM 元素顯示
            if (obj.img && obj.img.complete && typeof window.MainGifOverlay !== 'undefined') {
              // 為每棵樹生成唯一的 domId（如果還沒有）
              if (!obj.domId) {
                obj.domId = 'main-tree-' + MapSystem.entities.indexOf(obj);
              }
              window.MainGifOverlay.showOrUpdate(obj.domId, obj.img, px, py, { width: TREE_W, height: TREE_H }, { layerId: obj.layerId || 'default', dynamicZIndex: baseZIndex });
            }
          } else if (obj.type === 'img_house') {
            // NPC 房子使用 DOM 元素顯示
            if (obj.img && obj.img.complete && typeof window.MainGifOverlay !== 'undefined') {
              // 為每個房子生成唯一的 domId（如果還沒有）
              if (!obj.domId) {
                obj.domId = 'main-house-' + MapSystem.entities.indexOf(obj);
              }
              window.MainGifOverlay.showOrUpdate(obj.domId, obj.img, px, py, { width: obj.width, height: obj.height }, { layerId: obj.layerId || 'default', dynamicZIndex: baseZIndex });
            }
          } else if (obj.type === 'npc') {
            // NPC 使用 GIF 動態圖顯示（通過 MainGifOverlay 處理）
            if (typeof window.MainGifOverlay !== 'undefined') {
              // 使用 getImage 載入 NPC.gif，然後傳給 MainGifOverlay
              const npcGifImg = getImage('npc_gif');
              if (npcGifImg) {
                window.MainGifOverlay.showOrUpdate(obj.domId, npcGifImg, px, py, { width: obj.width, height: obj.height }, { layerId: obj.layerId || 'npc', dynamicZIndex: baseZIndex });
              }
            }
          }
        }
      }

      // 初始化地圖
      MapSystem.load('outdoor');

      // 主循環
      let rafId = null;
      function loop(){ 
        update(); 
        draw(); 
        rafId = requestAnimationFrame(loop); 
      }
      loop();

      // 儲存 cleanup 入口
      this._cleanup = () => {
        if (rafId) cancelAnimationFrame(rafId); rafId = null;
        try { if (window.MainGifOverlay && typeof window.MainGifOverlay.hide === 'function') window.MainGifOverlay.hide('main-player'); } catch(_) {}
        try { if (window.MainGifOverlay && typeof window.MainGifOverlay.clearAll === 'function') window.MainGifOverlay.clearAll(); } catch(_) {}
        try { if (mainUIEl && mainUIEl.parentNode) mainUIEl.parentNode.removeChild(mainUIEl); } catch(_) {}
        try { if (mainMenuEl && mainMenuEl.parentNode) mainMenuEl.parentNode.removeChild(mainMenuEl); } catch(_) {}
        // 清理滑鼠雪碧圖元素
        try {
          const cursorSpriteEl = document.getElementById('main-cursor-sprite');
          if (cursorSpriteEl && cursorSpriteEl.parentNode) {
            cursorSpriteEl.parentNode.removeChild(cursorSpriteEl);
          }
          // 恢復滑鼠游標
          const canvas = document.getElementById('game-canvas');
          if (canvas) {
            canvas.style.cursor = '';
          }
        } catch(_) {}
        mainUIEl = null;
        mainMenuEl = null;
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
        if (canvas && typeof this._onCanvasMouseMove === 'function') {
          canvas.removeEventListener('mousemove', this._onCanvasMouseMove, { capture: true });
          this._onCanvasMouseMove = null;
        }
        // 清理滑鼠雪碧圖元素
        const cursorSpriteEl = document.getElementById('main-cursor-sprite');
        if (cursorSpriteEl && cursorSpriteEl.parentNode) {
          cursorSpriteEl.parentNode.removeChild(cursorSpriteEl);
        }
        // 恢復滑鼠游標
        if (canvas) {
          canvas.style.cursor = '';
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
