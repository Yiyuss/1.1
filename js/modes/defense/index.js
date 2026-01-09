// 防禦塔TD遊戲模式 - 使用 GameModeManager
// 完整的塔防遊戲實現，包含30波敵人、多種防禦塔、玩家角色建造系統

// 添加全局錯誤處理
window.addEventListener('error', function(e) {
    console.error('全局錯誤捕獲:', e.error);
    console.error('錯誤訊息:', e.message);
    console.error('錯誤檔案:', e.filename);
    console.error('錯誤行號:', e.lineno);
    console.error('錯誤列號:', e.colno);
});

// -------------- 安全播放輔助 --------------
let _needResumeGameMusic_defense = false;
function safePlayDefense(ctx) {
  try {
    ctx.audio.unmuteAndPlay('game_music', { loop: true });
    _needResumeGameMusic_defense = false;
  } catch (err) {
    if (err.name === 'AbortError' || (err.message||'').includes('play')) {
      _needResumeGameMusic_defense = true;
    }
  }
}
// -------------- 安全播放結束 --------------
(function(){
  const MODE_ID = 'defense';

  const DefenseMode = {
    id: MODE_ID,
    getManifest(params){
      const selectedMap = (params && params.selectedMap) || null;
      const bgKey = (selectedMap && selectedMap.backgroundKey) || 'background4';
      // 目前防禦戰場使用 background4.png，美術層級交由 TDGame 繪製在世界底層
      const bgSrc = `assets/images/${bgKey}.png`;
      return {
        images: [
          // 動態背景鍵，與主體 CONFIG.MAPS 保持一致
          { key: bgKey, src: bgSrc },
          // 兼容舊代碼：保留防禦背景別名鍵
          { key: 'defense_bg4', src: bgSrc },
          // 玩家主體與 HUD 頭像實際會根據選角角色決定圖像，本地資源僅作預載
          { key: 'player', src: 'assets/images/player.gif' },
          { key: 'player2', src: 'assets/images/player2.png' },
          { key: 'player2-1', src: 'assets/images/player2-1.png' },
          { key: 'player3', src: 'assets/images/player3.gif' },
          { key: 'player3-2', src: 'assets/images/player3-2.png' },
          { key: 'player4', src: 'assets/images/player4.png' },
          { key: 'player4-2', src: 'assets/images/player4-2.png' },
          { key: 'player5', src: 'assets/images/player5.png' },
          { key: 'player5-2', src: 'assets/images/player5-2.png' },
          { key: 'player6', src: 'assets/images/player6.gif' },
          { key: 'player6-2', src: 'assets/images/player6-2.png' },
          { key: 'defense_avatar', src: 'assets/images/player1-2.png' },
          { key: 'zombie', src: 'assets/images/zombie.png' },
          { key: 'zombie2', src: 'assets/images/zombie2.png' },
          { key: 'zombie3', src: 'assets/images/zombie3.png' },
          { key: 'mini_boss', src: 'assets/images/mini_boss.png' },
          { key: 'bullet', src: 'assets/images/bullet.png' },
          { key: 'fireball', src: 'assets/images/fireball.png' },
          { key: 'lightning', src: 'assets/images/lightning.png' },
          // 冰凍塔 / 元素塔 / 狙擊塔 專用 GIF 與 HUD 圖示
          { key: 'ICE', src: 'assets/images/ICE.gif' },
          { key: 'ICE2', src: 'assets/images/ICE2.png' },
          { key: 'element', src: 'assets/images/element.gif' },
          { key: 'element2', src: 'assets/images/element2.png' },
          { key: 'sniper', src: 'assets/images/sniper.png' },
          { key: 'sniper2', src: 'assets/images/sniper2.png' },
          // 玩家攻擊匕首
          { key: 'dagger', src: 'assets/images/dagger.png' },
          // 主堡圖片改用 Nexus.png（鍵名沿用 BOX 以相容既有程式）
          { key: 'BOX', src: 'assets/images/Nexus.png' }
        ],
        audio: [ 
          { name: 'shura_music', src: 'assets/audio/Shura.mp3', loop: true },
          { name: 'game_music', src: 'assets/audio/game_music.mp3', loop: true },
          { name: 'button_click2', src: 'assets/audio/button_click2.mp3' },
          { name: 'enemy_death', src: 'assets/audio/enemy_death.mp3' },
          { name: 'level_up', src: 'assets/audio/level_up.mp3' },
          { name: 'bo', src: 'assets/audio/bo.mp3' },
          { name: 'collect_exp', src: 'assets/audio/collect_exp.mp3' }
        ],
        json: []
      };
    },
    enter(params, ctx){
      const canvas = ctx.dom.canvas;
      const ctx2d = canvas ? canvas.getContext('2d') : null;
      if (!canvas || !ctx2d) return;
      try { ctx2d.imageSmoothingEnabled = false; } catch(_){}

      // 進入防禦模式前先清除全域 GifOverlay（生存/挑戰/主線模式）殘留，避免玩家圖污染
      try { if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.clearAll === 'function') window.GifOverlay.clearAll(); } catch(_){}
      // 也清理挑戰模式的 GIF 圖層（以防萬一）
      try { if (typeof window.ChallengeGifOverlay !== 'undefined' && typeof window.ChallengeGifOverlay.clearAll === 'function') window.ChallengeGifOverlay.clearAll(); } catch(_){}

      ctx.dom.show('game-screen');
      ctx.dom.hide('difficulty-select-screen');
      ctx.dom.hide('desert-difficulty-select-screen');
      ctx.dom.hide('map-select-screen');
      ctx.dom.hide('character-select-screen');
      try { const gameUI = document.getElementById('game-ui'); if (gameUI) gameUI.style.display = 'none'; } catch(_){}
      try { const hud = document.getElementById('defense-ui'); if (hud) hud.style.display = ''; } catch(_){}

      // 關鍵：立即開始TD遊戲，不要等待背景或其他元素
      console.log('防禦模式進入 - 立即啟動TD遊戲系統');
      console.log('當前TD組件狀態（進入時）:');
      console.log('- TD_CONFIG:', typeof TD_CONFIG);
      console.log('- TDMap:', typeof TDMap);
      console.log('- TDPlayer:', typeof TDPlayer);
      console.log('- TDEnemyManager:', typeof TDEnemyManager);
      console.log('- TDTowerManager:', typeof TDTowerManager);
      console.log('- TDGame:', typeof TDGame);
      console.log('- TDEnhancedUI:', typeof TDEnhancedUI);
      
      // 強制測試TD組件可用性
      console.log('=== 強制TD組件測試 ===');
      if (typeof TD_CONFIG !== 'undefined') {
        console.log('✓ TD_CONFIG 可用:', TD_CONFIG.BASE.X, TD_CONFIG.BASE.Y);
      } else {
        console.log('✗ TD_CONFIG 不可用');
      }
      
      if (typeof TDMap !== 'undefined') {
        console.log('✓ TDMap 可用:', TDMap.name || 'TDMap');
      } else {
        console.log('✗ TDMap 不可用');
      }
      
      // 添加延遲檢查，確保TD腳本有時間加載
      setTimeout(() => {
        console.log('延遲檢查TD組件狀態（1秒後）:');
        console.log('- TD_CONFIG:', typeof TD_CONFIG);
        console.log('- TDMap:', typeof TDMap);
        console.log('- TDPlayer:', typeof TDPlayer);
        console.log('- TDEnemyManager:', typeof TDEnemyManager);
        console.log('- TDTowerManager:', typeof TDTowerManager);
        console.log('- TDGame:', typeof TDGame);
        console.log('- TDEnhancedUI:', typeof TDEnhancedUI);
      }, 1000);
      
      // 停止所有音樂並播放防禦模式音樂（使用game_music）
      try { ctx.audio.stopAllMusic(); } catch(_){}
      safePlayDefense(ctx);

      const baseW = (typeof CONFIG !== 'undefined' && CONFIG.CANVAS_WIDTH) ? CONFIG.CANVAS_WIDTH : 1280;
      const baseH = (typeof CONFIG !== 'undefined' && CONFIG.CANVAS_HEIGHT) ? CONFIG.CANVAS_HEIGHT : 720;
      canvas.width = baseW;
      canvas.height = baseH;

      try {
        const avatarEl = document.getElementById('defense-avatar');
        const avatarImg = ctx.resources.getImage('defense_avatar');
        if (avatarEl) avatarEl.src = avatarImg ? avatarImg.src : 'assets/images/player1-2.png';
      } catch(_){}

      // TD模式不需要玩家移動，只需要TD遊戲
      let paused = false;
      let tdGame = null;
      let tdUI = null;
      
      // 檢查TD組件是否已經預載入 - 使用延遲檢查確保腳本載入完成
      function checkTDComponents() {
        // TDEnhancedUI是可選的，遊戲可以在沒有UI的情況下運行
        return typeof TDGame !== 'undefined' && typeof TDMap !== 'undefined' && typeof TDPlayer !== 'undefined' &&
               typeof TDEnemyManager !== 'undefined' && typeof TDTowerManager !== 'undefined' &&
               typeof TD_CONFIG !== 'undefined';
      }
      
      // 等待TD組件載入完成
      function waitForTDComponents(maxAttempts = 50, attempt = 0) {
        if (checkTDComponents()) {
          initializeTDGame();
          return;
        }
        
        if (attempt >= maxAttempts) {
          console.error('TD組件載入超時，無法初始化防禦模式');
          console.error('當前組件狀態:', {
            TD_CONFIG: typeof TD_CONFIG,
            TDMap: typeof TDMap,
            TDPlayer: typeof TDPlayer,
            TDEnemyManager: typeof TDEnemyManager,
            TDTowerManager: typeof TDTowerManager,
            TDGame: typeof TDGame,
            TDEnhancedUI: typeof TDEnhancedUI
          });
          
          // 顯示錯誤訊息給玩家
          ctx2d.fillStyle = '#ff0000';
          ctx2d.font = '20px Arial';
          ctx2d.textAlign = 'center';
          ctx2d.fillText('防禦模式載入失敗', canvas.width / 2, canvas.height / 2 - 20);
          ctx2d.font = '16px Arial';
          ctx2d.fillText('請重新整理頁面重試', canvas.width / 2, canvas.height / 2 + 20);
          
          return;
        }
        setTimeout(() => waitForTDComponents(maxAttempts, attempt + 1), 200);
      }
      
      // 立即檢查一次TD組件並嘗試初始化；若未準備好則進入等待流程
      if (typeof TDGame !== 'undefined' && typeof TDMap !== 'undefined' && 
          typeof TDPlayer !== 'undefined' && typeof TDEnemyManager !== 'undefined' && 
          typeof TDTowerManager !== 'undefined' && typeof TD_CONFIG !== 'undefined') {
        initializeTDGame();
      } else {
        waitForTDComponents();
      }

      function ensureGameMusicPlaying(){
        try {
          safePlayDefense(ctx);
          const track = (typeof AudioManager !== 'undefined' && AudioManager.music) ? AudioManager.music['game_music'] : null;
          if (track && track.paused !== false) {
            const onceHandler = function(){ try { ctx.audio.unmuteAndPlay('game_music', { loop: true }); } catch(_){} };
            if (ctx && ctx.events && typeof ctx.events.on === 'function') {
              ctx.events.on(document, 'click', onceHandler, { capture: true, once: true });
              ctx.events.on(document, 'touchstart', onceHandler, { capture: true, once: true });
            } else {
              document.addEventListener('click', onceHandler, { capture: true, once: true });
              document.addEventListener('touchstart', onceHandler, { capture: true, once: true });
            }
          }
        } catch(_){}
      }

      function initializeTDGame() {
        try {
          console.log('開始初始化TD遊戲...');
          console.log('畫布尺寸:', canvas.width, 'x', canvas.height);
          console.log('當前tdGame值:', tdGame); // 檢查當前值
          
          // 再次檢查所有必需的TD組件
          const requiredComponents = {
            TD_CONFIG: typeof TD_CONFIG,
            TDMap: typeof TDMap,
            TDPlayer: typeof TDPlayer,
            TDEnemyManager: typeof TDEnemyManager,
            TDTowerManager: typeof TDTowerManager,
            TDGame: typeof TDGame,
            TDEnhancedUI: typeof TDEnhancedUI
          };
          
          console.log('TD組件狀態:', requiredComponents);
          
          // 檢查是否有任何組件缺失
          const missingComponents = Object.entries(requiredComponents)
            .filter(([name, type]) => type === 'undefined')
            .map(([name]) => name);
            
          if (missingComponents.length > 0) {
            console.error('TD遊戲初始化失敗 - 缺少必要組件:', missingComponents);
            renderFallback();
            try {
              ctx2d.fillStyle = '#ff4444';
              ctx2d.font = '18px Arial';
              ctx2d.textAlign = 'center';
              ctx2d.fillText('缺少必要TD組件', canvas.width / 2, canvas.height / 2 - 10);
              ctx2d.font = '14px Arial';
              ctx2d.fillText(String(missingComponents.join(', ')), canvas.width / 2, canvas.height / 2 + 18);
            } catch(_) {}
            return;
          }
          
          if (typeof TDGame === 'undefined') {
            console.error('TDGame類別未定義，無法初始化');
            return;
          }
          
          // 創建TD遊戲實例
          console.log('創建TDGame實例...');
          try {
            tdGame = new TDGame(canvas, ctx2d, ctx.resources, ctx.audio);
            // 傳遞選定地圖資訊，確保背景鍵一致（不影響 SaveCode）
            try {
              tdGame.selectedMap = params && params.selectedMap ? params.selectedMap : null;
              tdGame.backgroundKey = tdGame.selectedMap && tdGame.selectedMap.backgroundKey ? tdGame.selectedMap.backgroundKey : 'background4';
            } catch(_){}
            console.log('TDGame實例創建成功，tdGame現在是:', tdGame);
            
            // 將tdGame設置為全局變量以便調試
            window.debugTDGame = tdGame;
            console.log('已設置window.debugTDGame:', window.debugTDGame);
            
          } catch (gameError) {
            console.error('TDGame實例創建失敗:', gameError);
            console.error('TDGame構造函數錯誤堆疊:', gameError.stack);
            throw gameError;
          }
          
          if (typeof TDEnhancedUI === 'undefined') {
            console.error('TDEnhancedUI類別未定義，無法初始化UI');
          } else {
            console.log('創建TDEnhancedUI實例...');
            try {
              tdUI = new TDEnhancedUI(tdGame, ctx2d);
              console.log('TDEnhancedUI實例創建成功');
            } catch (uiError) {
              console.error('TDEnhancedUI實例創建失敗:', uiError);
              console.error('TDEnhancedUI構造函數錯誤堆疊:', uiError.stack);
              // UI創建失敗不應該阻止遊戲運行
              console.warn('將在沒有UI的情況下繼續運行遊戲');
            }
          }
          
          console.log('防禦塔TD遊戲初始化完成');
          if (tdGame) {
            console.log('TD遊戲配置:', tdGame.config ? tdGame.config.MAP : 'config未定義');
            console.log('玩家初始位置:', tdGame.player ? `${tdGame.player.x}, ${tdGame.player.y}` : 'player未定義');
            console.log('相機初始位置:', tdGame.camera ? `${tdGame.camera.x}, ${tdGame.camera.y}` : 'camera未定義');
            
            // 啟動TD遊戲！
            console.log('開始啟動TD遊戲...');
            try {
              tdGame.start();
              console.log('TD遊戲啟動成功！');
              
              // 額外調試 - 確認遊戲狀態
              console.log('TD遊戲狀態檢查:');
              console.log('- 遊戲是否暫停:', tdGame.isPaused);
              console.log('- 遊戲是否結束:', tdGame.isGameOver);
              console.log('- 遊戲是否獲勝:', tdGame.isGameWon);
              console.log('- 當前波次:', tdGame.gameState ? tdGame.gameState.wave : '未定義');
              console.log('- 波次是否活躍:', tdGame.gameState ? tdGame.gameState.isWaveActive : '未定義');
              
            } catch (startError) {
              console.error('TD遊戲啟動失敗:', startError);
              throw startError;
            }
          }
        } catch (error) {
          console.error('TD遊戲初始化失敗:', error);
          console.error('錯誤堆疊:', error.stack);
          console.error('錯誤名稱:', error.name);
          console.error('錯誤訊息:', error.message);
          
          // 清理已創建的實例
          if (tdGame) {
            try {
              if (typeof tdGame.cleanup === 'function') {
                tdGame.cleanup();
              }
            } catch (cleanupError) {
              console.error('清理TDGame實例時出錯:', cleanupError);
            }
            tdGame = null;
          }
          
          if (tdUI) {
            try {
              if (typeof tdUI.cleanup === 'function') {
                tdUI.cleanup();
              }
            } catch (cleanupError) {
              console.error('清理TDUI實例時出錯:', cleanupError);
            }
            tdUI = null;
          }
          
          // 顯示錯誤訊息給玩家
          ctx2d.fillStyle = '#ff0000';
          ctx2d.font = '20px Arial';
          ctx2d.textAlign = 'center';
          ctx2d.fillText('TD遊戲初始化失敗', canvas.width / 2, canvas.height / 2 - 20);
          ctx2d.font = '16px Arial';
          ctx2d.fillText('錯誤: ' + error.message, canvas.width / 2, canvas.height / 2 + 20);
        }
      }
      
      ctx.events.on(canvas, 'click', (e) => {
        try {
          // 只處理左鍵點擊
          if (e.button !== 0 && e.button !== undefined) return;
          
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
          
          // 處理TD遊戲點擊
          if (tdGame && typeof tdGame.handleClick === 'function') {
            try {
              if (tdUI && typeof tdUI.handleClick === 'function') {
                if (!tdUI.handleClick(x, y)) {
                  tdGame.handleClick(x, y);
                }
              } else {
                tdGame.handleClick(x, y);
              }
            } catch (error) {
              console.error('TD遊戲點擊處理錯誤:', error);
            }
          }
          
          if (_needResumeGameMusic_defense) { safePlayDefense(ctx); } else { ensureGameMusicPlaying(); }
        } catch(_){}
      }, { capture: true });
      
      // 添加右鍵事件處理：取消蓋塔
      ctx.events.on(canvas, 'contextmenu', (e) => {
        try {
          e.preventDefault();
          if (tdGame && typeof tdGame.handleRightClick === 'function') {
            tdGame.handleRightClick();
          }
        } catch(_){}
      }, { capture: true });

      ctx.events.on(window, 'focus', () => {
        try {
          if (!paused && !(window.TDDefenseSettlement && window.TDDefenseSettlement.isVisible)) {
            ensureGameMusicPlaying();
          }
        } catch(_) {}
      }, { capture: true });
      ctx.events.on(document, 'visibilitychange', () => {
        try {
          const hidden = document.visibilityState === 'hidden';
          paused = !!hidden;
          if (tdGame) {
            tdGame.isPaused = !!hidden;
          }
          if (!hidden && !(window.TDDefenseSettlement && window.TDDefenseSettlement.isVisible)) {
            ensureGameMusicPlaying();
          }
        } catch(_) {}
      }, { capture: true });

      function render(){
        // TD遊戲是防禦模式的核心，始終優先使用TD遊戲渲染
        if (tdGame && typeof tdGame.render === 'function') {
          try {
            tdGame.render();
          } catch (error) {
            console.error('TD遊戲渲染錯誤:', error);
            // 只有TD渲染失敗時才使用後備渲染
            renderFallback();
          }
        } else {
          // TD遊戲尚未載入，顯示載入中畫面
          renderFallback();
        }
      }
      
      function renderFallback(){
        ctx2d.clearRect(0,0,canvas.width,canvas.height);
        const dynamicKey = (params && params.selectedMap && params.selectedMap.backgroundKey) ? params.selectedMap.backgroundKey : 'defense_bg4';
        const bg = ctx.resources.getImage(dynamicKey) || ctx.resources.getImage('defense_bg4');
        if (bg) { 
          ctx2d.drawImage(bg, 0, 0, canvas.width, canvas.height); 
        } else { 
          ctx2d.fillStyle = '#001122';
          ctx2d.fillRect(0,0,canvas.width,canvas.height); 
        }
        
        // 顯示載入中訊息
        if (!tdGame) {
          ctx2d.fillStyle = '#ffffff';
          ctx2d.font = 'bold 24px Arial';
          ctx2d.textAlign = 'center';
          ctx2d.fillText('正在載入TD防禦模式...', canvas.width / 2, canvas.height / 2 - 20);
          ctx2d.font = '16px Arial';
          ctx2d.fillText('請稍候', canvas.width / 2, canvas.height / 2 + 20);
        }
      }

      // 滑鼠移動事件
      ctx.events.on(canvas, 'mousemove', (e) => {
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
          
          // 處理TD遊戲滑鼠移動
          if (tdGame && typeof tdGame.handleMouseMove === 'function') {
            try {
              tdGame.handleMouseMove(x, y);
            } catch (error) {
              console.error('TD遊戲滑鼠移動錯誤:', error);
            }
          }
          if (tdUI && typeof tdUI.update === 'function') {
            try {
              tdUI.update(x, y);
            } catch (error) {
              console.error('TD UI更新錯誤:', error);
            }
          }
        } catch(_) {}
      }, { capture: true });

      let _prevTs = performance.now();
      function loop(ts){
        const nowTs = (typeof ts === 'number' ? ts : performance.now());
        const dt = Math.max(0, nowTs - _prevTs);
        _prevTs = nowTs;
        try {
          if (tdGame) {
            // 一律呼叫 update，由 TDGame 內部根據 isPaused 控制是否推進遊戲邏輯
            if (typeof tdGame.update === 'function') {
              tdGame.update();
            }
            if (typeof tdGame.render === 'function') {
              tdGame.render();
            }
            if (tdUI && typeof tdUI.render === 'function') {
              tdUI.render();
            }
          } else {
            // TD遊戲尚未載入或初始化失敗，顯示後備畫面（背景＋載入提示／錯誤）
            renderFallback();
          }
        } catch (error) {
          console.error('TD遊戲更新/渲染錯誤:', error);
          renderFallback();
        }
        try {
          if (typeof window.DefenseUI !== 'undefined' && typeof window.DefenseUI.advanceBars === 'function') {
            window.DefenseUI.advanceBars(dt, paused);
          }
        } catch(_){}
        ctx.timers.requestAnimationFrame(loop);
      }
      ctx.timers.requestAnimationFrame(loop);

      try {
        if (typeof window.DefenseUI !== 'undefined') {
          window.DefenseUI.init(ctx, { onPauseChange: (p) => {
            try {
              paused = !!p;
              if (tdGame) {
                tdGame.isPaused = !!p;
                if (p) { if (typeof tdGame.pauseMusic === 'function') tdGame.pauseMusic(); }
                else { if (typeof tdGame.resumeMusic === 'function') tdGame.resumeMusic(); }
              }
              if (!p) { try { ctx.audio.unmuteAndPlay('game_music'); } catch(_){} }
            } catch(_) {}
          } });
          window.DefenseUI.refreshTalentsList();
          
          // 監聽金幣變化事件，確保右上角金幣即時更新
          if (typeof EventSystem !== 'undefined' && typeof GameEvents !== 'undefined' && EventSystem.on) {
            EventSystem.on(GameEvents.COINS_CHANGED, () => {
              try {
                if (typeof window.DefenseUI !== 'undefined' && typeof window.DefenseUI.updateCoins === 'function') {
                  window.DefenseUI.updateCoins();
                }
              } catch(_) {}
            });
          }
        }
        // 初始化防禦模式 DOM UI（頂部 HUD + 建塔面板 + 塔資訊）
        if (typeof window.TDDefenseDomUI !== 'undefined' && typeof window.TDDefenseDomUI.init === 'function' && tdGame) {
          window.TDDefenseDomUI.init(tdGame);
        }
      } catch(_){}
      
      // 清理函數
      window.cleanupTDGame = function() {
        try {
          if (tdGame) {
            // 清理TD遊戲資源
            if (typeof tdGame.cleanup === 'function') {
              tdGame.cleanup();
            }
            tdGame = null;
          }
        } catch (error) {
          console.error('清理TDGame實例時出錯:', error);
          tdGame = null;
        }
        
        try {
          if (tdUI) {
            // 清理UI資源
            if (typeof tdUI.cleanup === 'function') {
              tdUI.cleanup();
            }
            tdUI = null;
          }
        } catch (error) {
          console.error('清理TDUI實例時出錯:', error);
          tdUI = null;
        }
      };
    },
    exit(ctx){
      try { 
        // 清理TD遊戲
        if (typeof window.cleanupTDGame === 'function') {
          window.cleanupTDGame();
        }
      } catch(_) {}
      try { if (ctx && typeof ctx.dispose === 'function') ctx.dispose(); } catch(_){}
      // 清理所有GIF圖層（全域和防禦專用）
      try { if (typeof window.GifOverlay !== 'undefined') window.GifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.TDGifOverlay !== 'undefined' && typeof window.TDGifOverlay.clearAll === 'function') window.TDGifOverlay.clearAll(); } catch(_){}
      // 清理防禦模式傷害數字層（避免跨模式污染）
      try { if (typeof window.TDDamageNumbers !== 'undefined' && typeof window.TDDamageNumbers.clear === 'function') window.TDDamageNumbers.clear(); } catch(_){}
      // 清理調試變量
      try { if (typeof window.debugTDGame !== 'undefined') window.debugTDGame = null; } catch(_){}
      // 清理UI
      try { const gameUI = document.getElementById('game-ui'); if (gameUI) gameUI.style.display = ''; } catch(_){}
      try { if (typeof window.DefenseUI !== 'undefined') window.DefenseUI.dispose(); } catch(_){}
      try { const hud = document.getElementById('defense-ui'); if (hud) hud.style.display = 'none'; } catch(_){}
      // 清理防禦模式結算畫面（確保沒有殘留）
      try {
        const vs = document.getElementById('defense-victory-screen');
        const fs = document.getElementById('defense-gameover-screen');
        if (vs) vs.classList.add('hidden');
        if (fs) fs.classList.add('hidden');
        const vv = document.getElementById('defense-victory-video');
        const gv = document.getElementById('defense-gameover-video');
        if (vv) { try { vv.pause(); vv.currentTime = 0; } catch(_){} }
        if (gv) { try { gv.pause(); gv.currentTime = 0; } catch(_){} }
      } catch(_){}
    }
  };

  if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.register === 'function') {
    window.GameModeManager.register(DefenseMode.id, DefenseMode);
  } else {
    console.warn('[DefenseMode] GameModeManager 尚未就緒，無法註冊防禦模式');
  }
})();
