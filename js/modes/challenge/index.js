// 挑戰模式（Challenge Mode）骨架 - 使用 GameModeManager
// 目標：示範以隔離上下文（ctx）開發新模式，避免污染生存模式或全域狀態。
// 注意：不改動既有生存模式與主程式；此檔僅註冊新模式供未來啟用。
(function(){
  const MODE_ID = 'challenge';

  const ChallengeMode = {
    id: MODE_ID,
    // 宣告該模式需要的資源（僅在進入模式時載入）
    getManifest(){
      return {
        images: [
          { key: 'challenge_bg4', src: 'assets/images/background4.png' },
          { key: 'challenge_player', src: 'assets/images/player.gif' },
          { key: 'challenge_avatar', src: 'assets/images/player1-2.png' }
        ],
        audio: [ { name: 'shura_music', src: 'assets/audio/Shura.mp3', loop: true } ],
        json: []
      };
    },
    // 進入模式：掛載事件於 ctx.events、計時器於 ctx.timers、音樂透過 ctx.audio
    enter(params, ctx){
      // 維護備註：
      // - 本模式不套用生存模式玩法，只借用全域 AudioManager 與既有 UI 元素（玩家頭像）。
      // - 玩家渲染採用 <img> 覆蓋於 canvas 上，以確保 player.gif 動畫正常顯示；請勿改動 SaveCode 系統。
      const canvas = ctx.dom.canvas;
      const ctx2d = canvas ? canvas.getContext('2d') : null;
      if (!canvas || !ctx2d) return;
      try { ctx2d.imageSmoothingEnabled = false; } catch(_){}

      // 顯示遊戲畫面、隱藏選單（保持薄層，不動生存 HUD）
      ctx.dom.show('game-screen');
      ctx.dom.hide('difficulty-select-screen');
      ctx.dom.hide('desert-difficulty-select-screen');
      ctx.dom.hide('map-select-screen');
      ctx.dom.hide('character-select-screen');
      // 專屬防護：隱藏生存 HUD，避免干擾挑戰模式視覺
      try { const gameUI = document.getElementById('game-ui'); if (gameUI) gameUI.style.display = 'none'; } catch(_){}
      // 顯示挑戰 HUD
      try { const cHUD = document.getElementById('challenge-ui'); if (cHUD) cHUD.style.display = ''; } catch(_){}

      // 音樂：先確保停止其他 BGM，再解除靜音並播放挑戰 BGM（避免重疊）
      try { ctx.audio.stopAllMusic(); } catch(_){}
      ctx.audio.unmuteAndPlay('shura_music', { loop: true });

      // 先取得視窗容器，之後以其實際尺寸為主（避免 CSS 與 canvas 不一致）
      const viewportEl = document.getElementById('viewport') || canvas.parentNode;
      // 畫布尺寸：優先取用 viewport 的實際可見尺寸，回退到 CONFIG 或預設
      try {
        const vw = viewportEl && viewportEl.clientWidth ? viewportEl.clientWidth : ((typeof CONFIG !== 'undefined' && CONFIG.CANVAS_WIDTH) ? CONFIG.CANVAS_WIDTH : 1280);
        const vh = viewportEl && viewportEl.clientHeight ? viewportEl.clientHeight : ((typeof CONFIG !== 'undefined' && CONFIG.CANVAS_HEIGHT) ? CONFIG.CANVAS_HEIGHT : 720);
        canvas.width = vw;
        canvas.height = vh;
      } catch(_) {
        canvas.width = 1280; canvas.height = 720;
      }

      // 顯示左上角玩家頭像（沿用現有 UI 元素，不變更生存模式）
      try {
        const avatarEl = document.getElementById('player-avatar-img');
        const avatarImg = ctx.resources.getImage('challenge_avatar');
        if (avatarEl) avatarEl.src = avatarImg ? avatarImg.src : 'assets/images/player1-2.png';
      } catch(_){}

      // 基本玩家狀態（示範：點擊移動）；渲染改為 GIF 圖片覆蓋於 canvas
      const size = (typeof CONFIG !== 'undefined' && CONFIG.PLAYER && CONFIG.PLAYER.SIZE) ? CONFIG.PLAYER.SIZE : 48;
      const speedBase = (typeof CONFIG !== 'undefined' && CONFIG.PLAYER && CONFIG.PLAYER.SPEED) ? CONFIG.PLAYER.SPEED : 3;
      const EXTRA_SPEED_SCALE = 1.15; // 小幅提速：+15%
      const player = { x: canvas.width/2, y: canvas.height/2, width: size, height: size, speed: speedBase };
      // 套用天賦的移速倍率（speed_boost），再乘上本模式的小幅提速
      try {
        if (typeof BuffSystem !== 'undefined' && BuffSystem.initPlayerBuffs && BuffSystem.applyBuffsFromTalents) {
          BuffSystem.initPlayerBuffs(player);
          BuffSystem.applyBuffsFromTalents(player); // 會將 player.speed 設為 CONFIG.PLAYER.SPEED * talentMultiplier
          player.speed = (player.speed || speedBase) * EXTRA_SPEED_SCALE;
        } else {
          // 若 BuffSystem 不可用，至少應用額外提速
          player.speed = speedBase * EXTRA_SPEED_SCALE;
        }
      } catch(_) {
        player.speed = speedBase * EXTRA_SPEED_SCALE;
      }
      let clickTarget = null;
      let paused = false;
      const keys = { up:false, down:false, left:false, right:false };

      // 建立玩家 GIF 覆蓋元素（確保動畫與像素風格）
      // viewport 已在上方取得；記錄原本 position，退出時還原避免污染
      try { if (viewportEl) { ctx._challengeViewportPrevPos = viewportEl.style.position; viewportEl.style.position = 'relative'; } } catch(_){}
      const actorImg = ctx.resources.getImage('challenge_player');
      const actorEl = new Image();
      actorEl.id = 'challenge-player-actor';
      actorEl.src = actorImg ? actorImg.src : 'assets/images/player.gif';
      actorEl.style.position = 'absolute';
      actorEl.style.imageRendering = 'pixelated';
      const actorSize = size * 2; // 放大約 2 倍
      actorEl.style.width = actorSize + 'px';
      actorEl.style.height = actorSize + 'px';
      actorEl.style.zIndex = '1'; // 畫在 canvas 之上、UI 之下
      actorEl.style.pointerEvents = 'none';
      // 初始定位（避免第一幀前看不到）
      actorEl.style.left = (player.x - actorSize/2) + 'px';
      actorEl.style.top = (player.y - actorSize/2) + 'px';
      try { if (viewportEl) viewportEl.appendChild(actorEl); } catch(_){}
      // 供退出模式時清理
      ctx.playerActorEl = actorEl;

      // 點擊設定移動目標（使用 ctx.events 以便退出時自動清理）
      ctx.events.on(canvas, 'click', (e) => {
        try {
          const rect = canvas.getBoundingClientRect();
          const x = (e.clientX != null ? e.clientX : e.pageX) - rect.left;
          const y = (e.clientY != null ? e.clientY : e.pageY) - rect.top;
          clickTarget = { x, y };
          // 互動可作為恢復播放的觸發
          ctx.audio.unmuteAndPlay('shura_music');
        } catch(_){}
      }, { capture: true });

      // 鍵盤移動（WASD / ↑↓←→）
      const setKey = (code, val) => {
        switch(code){
          case 'KeyW': case 'ArrowUp': keys.up = val; break;
          case 'KeyS': case 'ArrowDown': keys.down = val; break;
          case 'KeyA': case 'ArrowLeft': keys.left = val; break;
          case 'KeyD': case 'ArrowRight': keys.right = val; break;
        }
      };
      ctx.events.on(document, 'keydown', (e) => {
        try {
          setKey(e.code || e.key, true);
          // 有鍵盤輸入即取消點擊目標，改為即時位移
          clickTarget = null;
          // 防止方向鍵捲動頁面
          if ([ 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight' ].includes(e.key || e.code)) e.preventDefault();
        } catch(_){}
      }, { capture: true });
      ctx.events.on(document, 'keyup', (e) => { try { setKey(e.code || e.key, false); } catch(_){} }, { capture: true });

      // 回焦/可見時嘗試恢復挑戰音樂
      ctx.events.on(window, 'focus', () => { try { ctx.audio.unmuteAndPlay('shura_music'); } catch(_){} }, { capture: true });
      ctx.events.on(document, 'visibilitychange', () => {
        try { if (document.visibilityState === 'visible') ctx.audio.unmuteAndPlay('shura_music'); } catch(_){}
      }, { capture: true });

      // （保留音樂恢復事件即可）挑戰模式不強制以分頁隱藏/失焦暫停整個主迴圈，
      // Bars 的暫停交由 ChallengeUI 內的 visibility/blur/focus 管理，避免初入時整體停滯。

      // 簡易渲染：鋪背景並同步玩家 GIF 位置（不在 canvas 內重畫白方塊）
      function render(){
        ctx2d.clearRect(0,0,canvas.width,canvas.height);
        const bg = ctx.resources.getImage('challenge_bg4');
        if (bg) {
          ctx2d.drawImage(bg, 0, 0, canvas.width, canvas.height);
        } else {
          ctx2d.fillStyle = '#000';
          ctx2d.fillRect(0,0,canvas.width,canvas.height);
        }
        // 同步覆蓋元素位置
        try {
          if (actorEl) {
            actorEl.style.left = (player.x - actorSize/2) + 'px';
            actorEl.style.top = (player.y - actorSize/2) + 'px';
          }
        } catch(_){}
      }

      // 簡易主迴圈：只跑本模式的 raf，離開時由 ctx.timers 清掉
      let _prevTs = performance.now();
      function loop(ts){
        const dt = Math.max(0, (typeof ts === 'number' ? ts : performance.now()) - _prevTs);
        _prevTs = (typeof ts === 'number' ? ts : performance.now());
        if (!paused) {
          // 點擊移動（時間校正可依需要加入）
          if (clickTarget) {
            const dx = clickTarget.x - player.x, dy = clickTarget.y - player.y;
            const len = Math.hypot(dx, dy) || 1;
            const s = player.speed * 0.8;
            player.x += (dx / len) * s;
            player.y += (dy / len) * s;
            if (Math.hypot(dx, dy) < Math.max(8, size/3)) clickTarget = null;
          }
          // 鍵盤移動（WASD / ↑↓←→）
          {
            let mx = 0, my = 0;
            if (keys.left) mx -= 1; if (keys.right) mx += 1;
            if (keys.up) my -= 1; if (keys.down) my += 1;
            if (mx !== 0 || my !== 0) {
              const len = Math.hypot(mx, my) || 1;
              const s = player.speed;
              player.x += (mx / len) * s;
              player.y += (my / len) * s;
            }
          }
          // 邊界限制（避免超出畫布）：以 viewport 實際尺寸為準，並考慮角色渲染尺寸
          const vw = viewportEl && viewportEl.clientWidth ? viewportEl.clientWidth : canvas.width;
          const vh = viewportEl && viewportEl.clientHeight ? viewportEl.clientHeight : canvas.height;
          const half = (size * 2) / 2; // actorSize/2（角色渲染一半尺寸）
          player.x = Math.max(half, Math.min(vw - half, player.x));
          player.y = Math.max(half, Math.min(vh - half, player.y));
          render();
        }
        // 以 RAF 推進挑戰 HUD 的能量/回血邏輯（與生存模式一致以 dt 計算）
        try {
          if (typeof window.ChallengeUI !== 'undefined' && typeof window.ChallengeUI.advanceBars === 'function') {
            window.ChallengeUI.advanceBars(dt, paused);
          }
        } catch(_) {}
        ctx.timers.requestAnimationFrame(loop);
      }
      ctx.timers.requestAnimationFrame(loop);

      // 視窗尺寸變更時，同步 canvas 尺寸，避免與 viewport 不一致導致邊界錯誤
      ctx.events.on(window, 'resize', () => {
        try {
          const vw = viewportEl && viewportEl.clientWidth ? viewportEl.clientWidth : canvas.width;
          const vh = viewportEl && viewportEl.clientHeight ? viewportEl.clientHeight : canvas.height;
          canvas.width = vw; canvas.height = vh;
        } catch(_){}
      }, { capture: true });

      // 初始化挑戰 UI 模組（音量、天賦清單、計時器）
      try {
        if (typeof window.ChallengeUI !== 'undefined') {
          window.ChallengeUI.init(ctx, {
            onPauseChange: (p) => { paused = !!p; if (!p) try { ctx.audio.unmuteAndPlay('shura_music'); } catch(_){} }
          });
          window.ChallengeUI.refreshTalentsList();
        }
      } catch(_){}
    },
    // 退出模式：主要依靠 ctx.dispose 清理事件與計時器；可選擇 UI 還原
    exit(ctx){
      try { if (ctx && typeof ctx.dispose === 'function') ctx.dispose(); } catch(_){ }
      // 還原 viewport 位置樣式（避免影響其他模式）
      try {
        const vp = document.getElementById('viewport');
        if (vp && typeof ctx._challengeViewportPrevPos !== 'undefined') {
          vp.style.position = ctx._challengeViewportPrevPos || '';
        }
      } catch(_){ }
      // 清理覆蓋玩家元素
      try { if (ctx && ctx.playerActorEl && ctx.playerActorEl.parentNode) { ctx.playerActorEl.parentNode.removeChild(ctx.playerActorEl); ctx.playerActorEl = null; } } catch(_){}
      try { const gameUI = document.getElementById('game-ui'); if (gameUI) gameUI.style.display = ''; } catch(_){}
      try { if (typeof window.ChallengeUI !== 'undefined') window.ChallengeUI.dispose(); } catch(_){}
      try { const cHUD = document.getElementById('challenge-ui'); if (cHUD) cHUD.style.display = 'none'; } catch(_){}
    }
  };

  // 註冊到 GameModeManager（不影響既有 ModeManager）
  if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.register === 'function') {
    window.GameModeManager.register(ChallengeMode.id, ChallengeMode);
  } else {
    console.warn('[ChallengeMode] GameModeManager 尚未就緒，無法註冊挑戰模式');
  }
})();