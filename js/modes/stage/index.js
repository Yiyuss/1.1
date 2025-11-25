// 闖關模式（Stage Mode）骨架 - 使用 GameModeManager
// 完整複製挑戰模式的行為與視覺，但採用闖關專用 ID 與 UI，維持模式獨立不污染其他模式。

// -------------- 安全播放輔助 --------------
let _needResumeShura_stage = false;          // 被瀏覽器阻擋後，等待使用者互動補播
function safePlayStage(ctx) {
  try {
    ctx.audio.unmuteAndPlay('shura_music', { loop: true });
    _needResumeShura_stage = false;
  } catch (err) {
    if (err.name === 'AbortError' || (err.message||'').includes('play')) {
      _needResumeShura_stage = true;
    }
  }
}
// -------------- 安全播放結束 --------------
(function(){
  const MODE_ID = 'stage';

  const StageMode = {
    id: MODE_ID,
    getManifest(){
      return {
        images: [
          { key: 'stage_bg4', src: 'assets/images/background4.png' },
          { key: 'stage_player', src: 'assets/images/player.gif' },
          { key: 'stage_avatar', src: 'assets/images/player1-2.png' }
        ],
        audio: [ { name: 'shura_music', src: 'assets/audio/Shura.mp3', loop: true } ],
        json: []
      };
    },
    enter(params, ctx){
      const canvas = ctx.dom.canvas;
      const ctx2d = canvas ? canvas.getContext('2d') : null;
      if (!canvas || !ctx2d) return;
      try { ctx2d.imageSmoothingEnabled = false; } catch(_){}
      // 進入闖關模式前先清除其他模式的 GIF 圖層殘留，避免污染
      try { if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.clearAll === 'function') window.GifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.TDGifOverlay !== 'undefined' && typeof window.TDGifOverlay.clearAll === 'function') window.TDGifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.ChallengeGifOverlay !== 'undefined' && typeof window.ChallengeGifOverlay.clearAll === 'function') window.ChallengeGifOverlay.clearAll(); } catch(_){}

      // 顯示遊戲畫面、隱藏選單（保持薄層，不動生存 HUD）
      ctx.dom.show('game-screen');
      ctx.dom.hide('difficulty-select-screen');
      ctx.dom.hide('desert-difficulty-select-screen');
      ctx.dom.hide('map-select-screen');
      ctx.dom.hide('character-select-screen');
      // 專屬防護：隱藏生存 HUD，避免干擾闖關模式視覺
      try { const gameUI = document.getElementById('game-ui'); if (gameUI) gameUI.style.display = 'none'; } catch(_){}
      // 顯示闖關 HUD
      try { const hud = document.getElementById('stage-ui'); if (hud) hud.style.display = ''; } catch(_){}

      // 音樂：先確保停止其他 BGM，再安全播放挑戰 BGM（沿用資源）
      try { ctx.audio.stopAllMusic(); } catch(_){}
      safePlayStage(ctx);

      // 畫布採固定基準解析度
      const baseW = (typeof CONFIG !== 'undefined' && CONFIG.CANVAS_WIDTH) ? CONFIG.CANVAS_WIDTH : 1280;
      const baseH = (typeof CONFIG !== 'undefined' && CONFIG.CANVAS_HEIGHT) ? CONFIG.CANVAS_HEIGHT : 720;
      canvas.width = baseW;
      canvas.height = baseH;

      // 玩家狀態與移動
      const size = (typeof CONFIG !== 'undefined' && CONFIG.PLAYER && CONFIG.PLAYER.SIZE) ? CONFIG.PLAYER.SIZE : 48;
      const visualScale = (typeof CONFIG !== 'undefined' && CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') ? CONFIG.PLAYER.VISUAL_SCALE : 1.0;
      const speedBase = (typeof CONFIG !== 'undefined' && CONFIG.PLAYER && CONFIG.PLAYER.SPEED) ? CONFIG.PLAYER.SPEED : 3;
      const EXTRA_SPEED_SCALE = 1.15;
      const player = { x: canvas.width/2, y: canvas.height/2, width: size, height: size, speed: speedBase };
      try {
        if (typeof BuffSystem !== 'undefined' && BuffSystem.initPlayerBuffs && BuffSystem.applyBuffsFromTalents) {
          BuffSystem.initPlayerBuffs(player);
          BuffSystem.applyBuffsFromTalents(player);
          player.speed = (player.speed || speedBase) * EXTRA_SPEED_SCALE;
        } else {
          player.speed = speedBase * EXTRA_SPEED_SCALE;
        }
      } catch(_) {
        player.speed = speedBase * EXTRA_SPEED_SCALE;
      }
      let clickTarget = null;
      let paused = false;
      const keys = { up:false, down:false, left:false, right:false };

      // 玩家圖片覆蓋：依選角角色決定外觀（預設使用 player.gif，灰妲為 player2.png）
      let actorSrc;
      try {
        const sc = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
        let key = 'player';
        if (sc && sc.spriteImageKey) {
          key = sc.spriteImageKey;
        } else if (sc && sc.id === 'dada') {
          key = 'player2';
        } else if (sc && sc.id === 'lilylinglan') {
          key = 'player3';
        }
        const imgObj = (Game.images && Game.images[key]) ? Game.images[key] : null;
        if (imgObj && imgObj.src) {
          actorSrc = imgObj.src;
        } else {
          const actorImg = ctx.resources.getImage('stage_player');
          actorSrc = actorImg ? actorImg.src : 'assets/images/player.gif';
        }
      } catch(_) {
        const actorImg = ctx.resources.getImage('stage_player');
        actorSrc = actorImg ? actorImg.src : 'assets/images/player.gif';
      }
      const actorSize = Math.max(1, Math.floor(size * visualScale));

      function ensureShuraPlaying(){
        try {
          safePlayStage(ctx);
          const track = (typeof AudioManager !== 'undefined' && AudioManager.music) ? AudioManager.music['shura_music'] : null;
          if (track && track.paused !== false) {
            const onceHandler = function(){ try { ctx.audio.unmuteAndPlay('shura_music', { loop: true }); } catch(_){} };
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

      // 點擊設定移動目標
      ctx.events.on(canvas, 'click', (e) => {
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
          clickTarget = { x, y };
          if (_needResumeShura_stage) { safePlayStage(ctx); } else { ensureShuraPlaying(); }
        } catch(_){}
      }, { capture: true });

      // 鍵盤移動
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
          clickTarget = null;
          if ([ 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight' ].includes(e.key || e.code)) e.preventDefault();
        } catch(_){}
      }, { capture: true });
      ctx.events.on(document, 'keyup', (e) => { try { setKey(e.code || e.key, false); } catch(_){} }, { capture: true });

      ctx.events.on(window, 'focus', () => { try { ensureShuraPlaying(); } catch(_){} }, { capture: true });
      ctx.events.on(document, 'visibilitychange', () => {
        try { if (document.visibilityState === 'visible') ensureShuraPlaying(); } catch(_){}
      }, { capture: true });

      function render(){
        ctx2d.clearRect(0,0,canvas.width,canvas.height);
        const bg = ctx.resources.getImage('stage_bg4');
        if (bg) { ctx2d.drawImage(bg, 0, 0, canvas.width, canvas.height); }
        else { ctx2d.fillStyle = '#000'; ctx2d.fillRect(0,0,canvas.width,canvas.height); }
        try { if (typeof window.GifOverlay !== 'undefined') { window.GifOverlay.showOrUpdate('stage-player', actorSrc, player.x, player.y, actorSize); } } catch(_){}
      }

      let _prevTs = performance.now();
      function loop(ts){
        const dt = Math.max(0, (typeof ts === 'number' ? ts : performance.now()) - _prevTs);
        _prevTs = (typeof ts === 'number' ? ts : performance.now());
        if (!paused) {
          if (clickTarget) {
            const dx = clickTarget.x - player.x, dy = clickTarget.y - player.y;
            const len = Math.hypot(dx, dy) || 1;
            const s = player.speed * 0.8;
            player.x += (dx / len) * s;
            player.y += (dy / len) * s;
            if (Math.hypot(dx, dy) < Math.max(8, size/3)) clickTarget = null;
          }
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
          const half = actorSize / 2;
          player.x = Math.max(half, Math.min(baseW - half, player.x));
          player.y = Math.max(half, Math.min(baseH - half, player.y));
          render();
        }
        try { if (typeof window.StageUI !== 'undefined' && typeof window.StageUI.advanceBars === 'function') { window.StageUI.advanceBars(dt, paused); } } catch(_) {}
        ctx.timers.requestAnimationFrame(loop);
      }
      ctx.timers.requestAnimationFrame(loop);

      // 初始化闖關 UI 模組
      try {
        if (typeof window.StageUI !== 'undefined') {
          window.StageUI.init(ctx, { onPauseChange: (p) => { paused = !!p; if (!p) try { ctx.audio.unmuteAndPlay('shura_music'); } catch(_){} } });
          window.StageUI.refreshTalentsList();
        }
      } catch(_){}
    },
    exit(ctx){
      try { if (ctx && typeof ctx.dispose === 'function') ctx.dispose(); } catch(_){}
      try { if (typeof window.GifOverlay !== 'undefined') window.GifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.TDGifOverlay !== 'undefined' && typeof window.TDGifOverlay.clearAll === 'function') window.TDGifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.ChallengeGifOverlay !== 'undefined' && typeof window.ChallengeGifOverlay.clearAll === 'function') window.ChallengeGifOverlay.clearAll(); } catch(_){}
      try { const gameUI = document.getElementById('game-ui'); if (gameUI) gameUI.style.display = ''; } catch(_){}
      try { if (typeof window.StageUI !== 'undefined') window.StageUI.dispose(); } catch(_){}
      try { const hud = document.getElementById('stage-ui'); if (hud) hud.style.display = 'none'; } catch(_){}
    }
  };

  if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.register === 'function') {
    window.GameModeManager.register(StageMode.id, StageMode);
  } else {
    console.warn('[StageMode] GameModeManager 尚未就緒，無法註冊闖關模式');
  }
})();
