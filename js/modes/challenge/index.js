// 挑戰模式（Challenge Mode）骨架 - 使用 GameModeManager
// 目標：示範以隔離上下文（ctx）開發新模式，避免污染生存模式或全域狀態。
// 注意：不改動既有生存模式與主程式；此檔僅註冊新模式供未來啟用。

// -------------- 安全播放輔助 --------------
let _needResumeShura = false;          // 被瀏覽器阻擋後，等待使用者互動補播
// 守衛：僅在挑戰模式活動且非結束畫面時才允許播放 BGM
function shouldPlayChallengeBGM(){
  try {
    const current = (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.getCurrent === 'function')
      ? window.GameModeManager.getCurrent()
      : ((typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.getActiveModeId === 'function')
        ? window.ModeManager.getActiveModeId()
        : null);
    if (current !== 'challenge') return false;
    if (typeof Game !== 'undefined' && Game.isGameOver) return false;
    if (typeof UI !== 'undefined' && UI.isScreenVisible) {
      if (UI.isScreenVisible('victory-screen') || UI.isScreenVisible('game-over-screen')) return false;
    }
    // 若存在本地挑戰結束覆蓋層，也不播放
    try { const ceo = document.getElementById('challenge-end-overlay'); if (ceo) return false; } catch(_){}
    return true;
  } catch(_) { return false; }
}
function safePlayShura(ctx) {
  if (!shouldPlayChallengeBGM()) return;
  try {
    ctx.audio.unmuteAndPlay('shura_music', { loop: true });
    _needResumeShura = false;            // 成功播放就關閉補播旗標
  } catch (err) {
    // 只處理 AbortError（用戶尚未互動導致）
    if ((err && err.name === 'AbortError') || (err && String(err.message||'').includes('play'))) {
      _needResumeShura = true;
    }
    // 其餘錯誤也吃掉，避免中斷遊戲迴圈
  }
}
// -------------- 安全播放結束 --------------
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
          { key: 'challenge_avatar', src: 'assets/images/player1-2.png' },
          { key: 'challenge_boss_gif', src: 'assets/images/challengeBOSS-1.gif' }
        ],
        audio: [
          { name: 'shura_music', src: 'assets/audio/Shura.mp3', loop: true },
          { name: 'challenge_laser', src: 'assets/audio/challenge_laser.mp3', loop: false }
        ],
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
      // 進入挑戰模式前先清除全域 GifOverlay（生存/舞台/防禦）殘留，避免雙重玩家圖污染
      try { if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.clearAll === 'function') window.GifOverlay.clearAll(); } catch(_){}
      // 敵人彈幕上層畫布（分層）：確保敵彈在玩家圖層之上、擦邊特效之下
      let enemyBulletCanvas = null;
      let enemyBulletCtx = null;

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

      // 音樂：先確保停止其他 BGM，再安全播放挑戰 BGM（避免重疊與 AbortError）
      try { ctx.audio.stopAllMusic(); } catch(_){}
      safePlayShura(ctx);
      // 挑戰模式專用音效動態註冊：避免全域音效清單污染其他模式
      try {
        if (typeof AudioManager !== 'undefined' && AudioManager.sounds && !AudioManager.sounds['challenge_laser']) {
          const a = new Audio();
          a.src = 'assets/audio/challenge_laser.mp3';
          a.volume = (typeof AudioManager.soundVolume === 'number') ? AudioManager.soundVolume : 0.7;
          a.onerror = () => { console.warn('無法加載音效: challenge_laser'); };
          AudioManager.sounds['challenge_laser'] = a;
        }
      } catch(_){}
      // 進入模式時，重置挑戰專屬經驗系統，避免殘留
      try { if (window.ChallengeExperience) window.ChallengeExperience.reset(); } catch(_){}

      // 進入挑戰模式時：執行存檔結構升級（若需要），保持 SaveCode 向下相容
      try {
        if (typeof SaveService !== 'undefined' && typeof SaveService.upgradeSchemaIfNeeded === 'function') {
          SaveService.upgradeSchemaIfNeeded();
        }
      } catch(_){}

      // 畫布採固定基準解析度，交由主程式/UI 等比縮放
      const baseW = (typeof CONFIG !== 'undefined' && CONFIG.CANVAS_WIDTH) ? CONFIG.CANVAS_WIDTH : 1280;
      const baseH = (typeof CONFIG !== 'undefined' && CONFIG.CANVAS_HEIGHT) ? CONFIG.CANVAS_HEIGHT : 720;
      canvas.width = baseW;
      canvas.height = baseH;

      // 建立上層彈幕 canvas 並插入 viewport（位置與主 canvas 對齊）
      try {
        const vp = document.getElementById('viewport');
        if (vp) {
          enemyBulletCanvas = document.createElement('canvas');
          enemyBulletCanvas.id = 'challenge-bullets-top';
          enemyBulletCanvas.width = baseW; enemyBulletCanvas.height = baseH;
          const st = enemyBulletCanvas.style;
          st.position = 'absolute'; st.top = '0'; st.left = '0';
          st.width = '100%'; st.height = '100%';
          st.zIndex = '4'; // 層級：BOSS圖(6) > 擦邊(5) > 敵彈(4) > 玩家圖(3) > 玩家彈幕(同層1)
          st.pointerEvents = 'none'; st.imageRendering = 'pixelated';
          vp.appendChild(enemyBulletCanvas);
          enemyBulletCtx = enemyBulletCanvas.getContext('2d');
          try { enemyBulletCtx.imageSmoothingEnabled = false; } catch(_){}
        }
      } catch(_){}

      // 顯示左上角玩家頭像（沿用現有 UI 元素，不變更生存模式）
      try {
        const avatarEl = document.getElementById('player-avatar-img');
        const avatarImg = ctx.resources.getImage('challenge_avatar');
        if (avatarEl) avatarEl.src = avatarImg ? avatarImg.src : 'assets/images/player1-2.png';
      } catch(_){}

      // 基本玩家狀態（示範：點擊移動）；渲染改為 GIF 圖片覆蓋於 canvas
      const size = (typeof CONFIG !== 'undefined' && CONFIG.PLAYER && CONFIG.PLAYER.SIZE) ? CONFIG.PLAYER.SIZE : 48;
      const visualScale = (typeof CONFIG !== 'undefined' && CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') ? CONFIG.PLAYER.VISUAL_SCALE : 1.0;
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
      const keys = { up:false, down:false, left:false, right:false, fire:false, dash:false, shift:false };
      let shootAcc = 0;
      const shootRateMs = 90;
      let sfxShootAcc = 0;
      const sfxShootRateMs = 180;

      // 玩家 GIF 覆蓋：改用共用 GifOverlay，隨 UI 縮放自動對齊
      const actorImg = ctx.resources.getImage('challenge_player');
      const actorSrc = actorImg ? actorImg.src : 'assets/images/player.gif';
      // 與生存模式一致：以玩家基準尺寸乘以 VISUAL_SCALE 決定渲染尺寸（避免過大）
      const actorSizeDesired = Math.max(1, Math.floor(size * visualScale));
      const actorSize = (typeof window.CHALLENGE_PLAYER_VISUAL_SIZE_BASE === 'number' && window.CHALLENGE_PLAYER_VISUAL_SIZE_BASE > 0)
        ? Math.floor(window.CHALLENGE_PLAYER_VISUAL_SIZE_BASE)
        : actorSizeDesired;
      try { window.CHALLENGE_PLAYER_VISUAL_SIZE_BASE = actorSize; } catch(_){}
      // 供彈幕系統使用的玩家碰撞回退（圓形近似）：半徑略小於渲染尺寸
      // 玩家受擊判定：比玩家視覺圖小 30%（圓形近似）
      const playerCollisionRadius = Math.max(6, Math.floor(actorSize * 0.10));
      // 掛載全域回退（僅挑戰模式用；不污染其他模式）
      try { window.CHALLENGE_PLAYER = { x: player.x, y: player.y, collisionRadius: playerCollisionRadius }; } catch(_){}
      // 擴充 CHALLENGE_PLAYER 欄位：graze 緩衝與衝刺無敵標記（保持向下相容）
      try {
        const _gb = Math.max(6, Math.floor(actorSize * 0.28));
        window.CHALLENGE_PLAYER = Object.assign({}, window.CHALLENGE_PLAYER||{}, {
          invulnerabilitySource: null,
          grazeBuffer: _gb,
          isDashing: false
        });
      } catch(_){}

      // ALT+TAB / 可見性恢復：若因瀏覽器策略導致播放失敗，掛一次性互動恢復
      function ensureShuraPlaying(){
        try {
          // 僅在挑戰模式活動且未顯示結束畫面時恢復 BGM
          if (!shouldPlayChallengeBGM()) return;
          safePlayShura(ctx);
          const track = (typeof AudioManager !== 'undefined' && AudioManager.music) ? AudioManager.music['shura_music'] : null;
          // 若仍未播放，於下一次使用者互動恢復（使用 ctx.events 註冊，確保離開模式時自動清理）
          if (track && track.paused !== false) {
            const onceHandler = function(){
              try {
                if (!shouldPlayChallengeBGM()) return;
                ctx.audio.unmuteAndPlay('shura_music', { loop: true });
              } catch(_){}
            };
            if (ctx && ctx.events && typeof ctx.events.on === 'function') {
              ctx.events.on(document, 'click', onceHandler, { capture: true, once: true });
              ctx.events.on(document, 'touchstart', onceHandler, { capture: true, once: true });
            } else {
              document.addEventListener('click', onceHandler, { capture: true, once: true });
              document.addEventListener('touchstart', onceHandler, { capture: true, once: true });
            }
          }
          // 衝刺邏輯移至主迴圈，避免與音訊恢復耦合
        } catch(_){}
      }

      // 點擊設定移動目標（使用 ctx.events 以便退出時自動清理）
      ctx.events.on(canvas, 'click', (e) => {
        try {
          const rect = canvas.getBoundingClientRect();
          const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
          let x, y;
          if (rotatedPortrait) {
            // 與 input.js 一致的直立旋轉映射：CW 90°
            const u = ((e.clientX != null ? e.clientX : e.pageX) - rect.left) / rect.width;  // [0,1]
            const v = ((e.clientY != null ? e.clientY : e.pageY) - rect.top) / rect.height; // [0,1]
            x = v * canvas.width;
            y = (1 - u) * canvas.height;
          } else {
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            x = (((e.clientX != null ? e.clientX : e.pageX) - rect.left) * scaleX);
            y = (((e.clientY != null ? e.clientY : e.pageY) - rect.top) * scaleY);
          }
          clickTarget = { x, y };
          // 若被瀏覽器阻擋，第一次互動補播或已被自動靜音，嘗試恢復
          if (_needResumeShura) { safePlayShura(ctx); } else { ensureShuraPlaying(); }
        } catch(_){}
      }, { capture: true });

      // 鍵盤移動（WASD / ↑↓←→）
      const setKey = (codeOrKey, val) => {
        const k = String(codeOrKey || '').toLowerCase();
        switch(k){
          case 'keyw': case 'arrowup': case 'w': keys.up = val; break;
          case 'keys': case 'arrowdown': case 's': keys.down = val; break;
          case 'keya': case 'arrowleft': case 'a': keys.left = val; break;
          case 'keyd': case 'arrowright': case 'd': keys.right = val; break;
          case 'keyz': case 'z': keys.fire = val; break;
          case 'keyx': case 'x': keys.dash = val; break;
          case 'shiftleft': case 'shiftright': case 'shift': keys.shift = val; break;
        }
      };
      ctx.events.on(document, 'keydown', (e) => {
        try {
          setKey(e.code || e.key, true);
          // 有鍵盤輸入即取消點擊目標，改為即時位移
          clickTarget = null;
          // 防止方向鍵捲動頁面
          const kk = String(e.key || e.code).toLowerCase();
          if ([ 'arrowup','arrowdown','arrowleft','arrowright','keyz','keyx','z','x','shiftleft','shiftright','shift' ].includes(kk)) e.preventDefault();
        } catch(_){}
      }, { capture: true });
      ctx.events.on(document, 'keyup', (e) => { try { setKey(e.code || e.key, false); } catch(_){} }, { capture: true });

      // 追加一次性衝刺觸發：在原 keydown 之外，專門針對 X 鍵做單次觸發
      ctx.events.on(document, 'keydown', (e) => {
        try {
          const kk = String(e.key || e.code).toLowerCase();
          if ((kk === 'x' || kk === 'keyx') && !e.repeat) {
            applyDashIfTriggered();
          }
        } catch(_){}
      }, { capture: true });

      // 分頁可見性/焦點：隱藏或失焦時暫停主迴圈；回焦/可見時在無菜單與無覆蓋層下恢復
      ctx.events.on(document, 'visibilitychange', () => {
        try {
          if (document.hidden) {
            // 分頁隱藏：暫停主迴圈
            paused = true;
          } else {
            // 分頁回可見：僅在未開啟挑戰菜單、未處於勝利/失敗覆蓋層時恢復
            const m = document.getElementById('challenge-menu');
            const isOpen = m && !m.classList.contains('hidden');
            if (!isOpen && !Game.isGameOver) {
              try {
                if (typeof UI !== 'undefined' && UI.isScreenVisible) {
                  if (!UI.isScreenVisible('victory-screen') && !UI.isScreenVisible('game-over-screen')) {
                    paused = false;
                  }
                } else {
                  paused = false;
                }
              } catch(_) { paused = false; }
              try { ensureShuraPlaying(); } catch(_){}
            }
          }
        } catch(_){}
      }, { capture: true });
      ctx.events.on(window, 'blur', () => {
        try { paused = true; } catch(_){}
      }, { capture: true });
      ctx.events.on(window, 'focus', () => {
        try {
          const m = document.getElementById('challenge-menu');
          const isOpen = m && !m.classList.contains('hidden');
          if (!isOpen && !Game.isGameOver) {
            try {
              if (typeof UI !== 'undefined' && UI.isScreenVisible) {
                if (!UI.isScreenVisible('victory-screen') && !UI.isScreenVisible('game-over-screen')) {
                  paused = false;
                }
              } else {
                paused = false;
              }
            } catch(_) { paused = false; }
            try { ensureShuraPlaying(); } catch(_){}
          }
        } catch(_){}
      }, { capture: true });

      // 注意：Bars 的暫停交由 ChallengeUI 內管理；此處只控制主迴圈暫停/恢復，避免污染其他模式。

      // BOSS 物件暫存於作用域
      let boss = null;
      // 玩家置頂保持時間戳：玩家與 BOSS 互動時短暫置頂以避免閃爍（僅挑戰模式）
      let _playerTopHoldUntil = 0;
      // 勝利狀態旗標：避免重複觸發勝利流程（僅挑戰模式）
      let _victoryHandled = false;

      // 簡易渲染：鋪背景並同步玩家 GIF 位置（不在 canvas 內重畫白方塊）
      function render(){
        ctx2d.clearRect(0,0,canvas.width,canvas.height);
        if (enemyBulletCtx) enemyBulletCtx.clearRect(0,0,baseW,baseH);
        const bg = ctx.resources.getImage('challenge_bg4');
        if (bg) {
          ctx2d.drawImage(bg, 0, 0, canvas.width, canvas.height);
        } else {
          ctx2d.fillStyle = '#000';
          ctx2d.fillRect(0,0,canvas.width,canvas.height);
        }
        // 分層：先畫玩家彈幕（同層 base canvas，位於玩家圖層下方）
        try { if (window.ChallengeBulletSystem) window.ChallengeBulletSystem.drawFriendly(ctx2d); } catch(_){}
        // 畫經驗球（挑戰模式專屬，不使用 Game.experienceOrbs）
        try {
          if (window.ChallengeExperience) {
            window.ChallengeExperience.draw(ctx2d);
          }
        } catch(_){}
        // 繪製 dash 殘影（同層 base canvas，在玩家彈幕之上）
        try {
          if (player.dash && player.dash.trail && player.dash.trail.length) {
            const r = Math.max(6, Math.floor(actorSize * 0.28));
            for (const t of player.dash.trail) {
              const a = Math.max(0, Math.min(1, t.alpha || 0.5));
              const grd = ctx2d.createRadialGradient(t.x, t.y, r*0.1, t.x, t.y, r);
              grd.addColorStop(0, `rgba(255,255,255,${0.35*a})`);
              grd.addColorStop(1, 'rgba(255,255,255,0)');
              ctx2d.fillStyle = grd;
              ctx2d.beginPath();
              ctx2d.arc(t.x, t.y, r, 0, Math.PI*2);
              ctx2d.fill();
            }
          }
        } catch(_){ }
        // BOSS 血條等（同層 base canvas）；真正的 BOSS 圖用 GifOverlay 疊在最上層
        try { if (boss) boss.draw(ctx2d); } catch(_){}
        // 重疊檢測：玩家與 BOSS 互動時讓玩家圖層暫時置於 BOSS 之上（避免穿插視覺不自然）
        try {
          const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          let onTop = false;
          if (boss && boss.alive) {
            const prBase = Math.max(6, playerCollisionRadius);
            const gb = (window.CHALLENGE_PLAYER && typeof window.CHALLENGE_PLAYER.grazeBuffer === 'number') ? window.CHALLENGE_PLAYER.grazeBuffer : Math.max(6, Math.floor(actorSize * 0.28));
            const pr = prBase + Math.floor(gb * 0.25); // 擦彈緩衝的 25% 作為互動近似範圍
            const br = Math.max(28, Math.floor((boss.size || 120) * 0.6)); // 以 BOSS 尺寸的 60% 近似半徑
            const dx = player.x - boss.x, dy = player.y - boss.y;
            const d = Math.hypot(dx, dy) || 9999;
            if (d <= (pr + br)) {
              onTop = true;
              _playerTopHoldUntil = now + 140; // 保持 ~140ms，避免邊緣抖動
            }
          }
          if (!onTop && now <= _playerTopHoldUntil) onTop = true;
          try { window.CHALLENGE_PLAYER_ON_TOP = onTop; } catch(_){}
        } catch(_){}
        // 使用 GifOverlay 將玩家 GIF 疊於畫面（依 --ui-scale 自動縮放對位）
        try { if (typeof window.ChallengeGifOverlay !== 'undefined') { window.ChallengeGifOverlay.showOrUpdate('challenge-player', actorSrc, player.x, player.y, actorSize); } } catch(_){}
        // 上層：敵人彈幕（完全不透明，中心白＋漸層＋深色外框）
        try { if (window.ChallengeBulletSystem && enemyBulletCtx) window.ChallengeBulletSystem.drawEnemy(enemyBulletCtx); } catch(_){}
      }

      // 簡易主迴圈：只跑本模式的 raf，離開時由 ctx.timers 清掉
      // 單次觸發的衝刺（X）：消耗 20 能量，依當前方向短距位移
      function applyDashIfTriggered(){
        try {
          if (!keys || player.dead) return;
          if (keys.dash && !player._dashLatch) {
            player._dashLatch = true;
            const ok = (typeof window.ChallengeUI !== 'undefined' && typeof window.ChallengeUI.trySpendEnergy === 'function')
              ? window.ChallengeUI.trySpendEnergy(20) : false;
            if (ok) {
              // 方向：有方向鍵用方向鍵，否則用最近移動方向，預設向上
              let dx = 0, dy = -1;
              if (keys.left || keys.right || keys.up || keys.down) {
                dx = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
                dy = (keys.up ? -1 : 0) + (keys.down ? 1 : 0);
                const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
              } else if (typeof player.lastMoveX === 'number' || typeof player.lastMoveY === 'number') {
                const l = Math.hypot(player.lastMoveX || 0, player.lastMoveY || 0) || 1;
                dx = (player.lastMoveX || 0) / l;
                dy = (player.lastMoveY || -1) / l;
              }
              // 改為逐幀衝刺動畫：在固定時間內以速度推進，並產生殘影
              const duration = 180; // 毫秒
              const distance = Math.max(36, Math.floor(actorSize * 0.5));
              const speed = distance / duration; // 每毫秒位移量
              player.dash = {
                active: true,
                time: 0,
                duration,
                vx: dx * speed,
                vy: dy * speed,
                trail: []
              };
              // 衝刺期間給予短暫無敵，僅挑戰模式使用
              try { window.CHALLENGE_PLAYER.invulnerabilitySource = 'dash'; window.CHALLENGE_PLAYER.isDashing = true; } catch(_){}
              // 輕微白閃以提示衝刺開始
              try { if (typeof window.ChallengeGifOverlay !== 'undefined' && typeof window.ChallengeGifOverlay.flash === 'function') { window.ChallengeGifOverlay.flash('challenge-player', { color: '#ffffff', durationMs: 80, opacity: 0.5 }); } } catch(_){}
              // 播音效（若音效系統存在）
              try { if (typeof AudioManager !== 'undefined' && AudioManager.playSound) AudioManager.playSound('button_click2'); } catch(_){ }
            }
          } else if (!keys.dash && player._dashLatch) {
            player._dashLatch = false;
          }
        } catch(_){ }
      }

      let _prevTs = performance.now();
      let _failHandled = false;
      function loop(ts){
        const dt = Math.max(0, (typeof ts === 'number' ? ts : performance.now()) - _prevTs);
        _prevTs = (typeof ts === 'number' ? ts : performance.now());
        // 失敗時：立即停止更新並清理彈幕/發射器（僅執行一次）
        try {
          if (window.ChallengeUI && typeof window.ChallengeUI.isFailed === 'function' && window.ChallengeUI.isFailed()) {
            if (!_failHandled) {
              paused = true;
              try { if (window.ChallengeBulletSystem) window.ChallengeBulletSystem.reset(); } catch(_){}
              try { if (boss && typeof boss.stopAllEmitters === 'function') boss.stopAllEmitters(); } catch(_){}
              try { ctx.audio.stopAllMusic(); } catch(_){}
              try { if (typeof AudioManager !== 'undefined' && AudioManager.stopAllMusic) AudioManager.stopAllMusic(); } catch(_){}
              try {
                if (typeof window !== 'undefined' && window.ChallengeUI && typeof window.ChallengeUI.showSurvivalSettlement === 'function') {
                  window.ChallengeUI.showSurvivalSettlement('failure');
                }
              } catch(_){}
              // 立即停止挑戰模式，清除事件以避免返回選單時誤播 BGM
              // 不在此處停止挑戰模式；讓結算覆蓋層的返回按鈕或影片結束時執行停止與返回主選單，避免覆蓋層被清理
              _failHandled = true;
            }
            // 失敗後停止主迴圈排程；由本地覆蓋層影片或按鈕返回主選單
            return;
          }
        } catch(_){}
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
              // Shift 集中模式：降速移動（約 45% 速度）
              const s = keys.shift ? (player.speed * 0.45) : player.speed;
              player.x += (mx / len) * s;
              player.y += (my / len) * s;
              // 記錄最近移動方向供衝刺使用
              player.lastMoveX = mx / len;
              player.lastMoveY = my / len;
            }
          }
          // 在主迴圈中處理衝刺，確保即時性
          applyDashIfTriggered();
          // 逐幀衝刺位移 + 殘影與淡出
          if (player.dash && player.dash.active) {
            const dtMs = dt;
            player.dash.time += dtMs;
            player.x += (player.dash.vx || 0) * dtMs;
            player.y += (player.dash.vy || 0) * dtMs;
            // trail push（限制段數，alpha 線性淡出）
            const alphaStart = 0.6;
            player.dash.trail = player.dash.trail || [];
            player.dash.trail.push({ x: player.x, y: player.y, alpha: alphaStart });
            if (player.dash.trail.length > 16) player.dash.trail.shift();
            for (const t of player.dash.trail) { t.alpha = Math.max(0, t.alpha - dtMs / 240); }
            if (player.dash.time >= (player.dash.duration || 180)) {
              player.dash.active = false;
              try { window.CHALLENGE_PLAYER.invulnerabilitySource = null; window.CHALLENGE_PLAYER.isDashing = false; } catch(_){}
            }
          } else if (player.dash && player.dash.trail && player.dash.trail.length) {
            // 非衝刺期間逐步清理殘影
            for (const t of player.dash.trail) { t.alpha = Math.max(0, t.alpha - dt / 240); }
            while (player.dash.trail.length && player.dash.trail[0].alpha <= 0.02) player.dash.trail.shift();
          }
          // 邊界限制（避免超出畫布）：以基準解析度為準，配合 GifOverlay 縮放
          const half = actorSize / 2; // 與生存模式一致：以渲染尺寸的一半限制邊界
          player.x = Math.max(half, Math.min(baseW - half, player.x));
          player.y = Math.max(half, Math.min(baseH - half, player.y));
          // 更新全域玩家回退座標與判定半徑、擦彈寬容（供彈幕瞄準與碰撞）
          try {
            window.CHALLENGE_PLAYER.x = player.x;
            window.CHALLENGE_PLAYER.y = player.y;
            window.CHALLENGE_PLAYER.collisionRadius = playerCollisionRadius;
            window.CHALLENGE_PLAYER.grazeBuffer = Math.max(6, Math.floor(actorSize * 0.28));
          } catch(_){}
          // 玩家射擊（Z 持續射擊）：一般雙發；按住 Shift 切換為集中單發（速度略快，顏色不同）
          try {
            if (keys.fire && window.ChallengeBulletSystem) {
              shootAcc += dt;
              while (shootAcc >= shootRateMs) {
                shootAcc -= shootRateMs;
                const BS = window.ChallengeBulletSystem;
                const life = 1600;
                if (keys.shift) {
                  const speedFocus = 12.6;
                  const sizeFocus = 7;
                  const colorFocus = '#66ccff';
                  BS.addFriendlyBullet(player.x, player.y - (actorSize/2), 0, -speedFocus, life, sizeFocus, colorFocus);
                } else {
                  const speed = 10.8;
                  const sizeFriendly = 7;
                  const colorFriendly = '#99ff99';
                  const offset = Math.max(6, Math.floor(actorSize * 0.14));
                  // 基本兩發（直線）
                  BS.addFriendlyBullet(player.x - offset, player.y - (actorSize/2), 0, -speed, life, sizeFriendly, colorFriendly);
                  BS.addFriendlyBullet(player.x + offset, player.y - (actorSize/2), 0, -speed, life, sizeFriendly, colorFriendly);
                  // 依等級擴散：LV2~LV5 每級左右各加一條斜線（最大 4 級擴散）
                  try {
                    const lv = (window.ChallengeUI && typeof window.ChallengeUI.getLevel === 'function') ? window.ChallengeUI.getLevel() : 1;
                    const extraPairs = Math.min(Math.max(0, (lv - 1)), 4);
                    for (let i = 1; i <= extraPairs; i++) {
                      const deg = 10 + (i-1) * 6; // 10°,16°,22°,28°
                      const rad = deg * Math.PI / 180;
                      const vx = Math.sin(rad) * speed;
                      const vy = -Math.cos(rad) * speed;
                      BS.addFriendlyBullet(player.x - offset*1.05, player.y - (actorSize/2), -vx, vy, life, sizeFriendly, colorFriendly);
                      BS.addFriendlyBullet(player.x + offset*1.05, player.y - (actorSize/2), vx, vy, life, sizeFriendly, colorFriendly);
                    }
                    // LV4+：中心補兩顆輕度追蹤彈（往 BOSS 漸轉追蹤）
                    if (lv >= 4) {
                      const speedH = 9.8;
                      const sizeH = 6;
                      const colorH = '#aaffdd';
                      const b1 = BS.addFriendlyBullet(player.x, player.y - (actorSize/2), 0, -speedH, life, sizeH, colorH);
                      const b2 = BS.addFriendlyBullet(player.x, player.y - (actorSize/2), 0, -speedH, life, sizeH, colorH);
                      if (b1) b1.homing = true;
                      if (b2) b2.homing = true;
                    }
                  } catch(_){ }
                }
              }
              sfxShootAcc += dt;
              if (sfxShootAcc >= sfxShootRateMs) {
                sfxShootAcc -= sfxShootRateMs;
                try {
                  if (typeof AudioManager !== 'undefined' && AudioManager.playSound && !AudioManager.isMuted) {
                    AudioManager.playSound('dagger_shoot');
                  }
                } catch(_){}
              }
            } else {
              shootAcc = 0;
              sfxShootAcc = 0;
            }
          } catch(_){ }
          // BOSS 與彈幕更新
          try { if (boss && boss.alive) boss.update(dt); } catch(_){}
          // 勝利判定：BOSS 死亡時播放勝利影片並顯示結算畫面（邏輯同失敗）
          try {
            if (boss && !boss.alive) {
              if (!_victoryHandled) {
                paused = true;
                try { if (window.ChallengeBulletSystem) window.ChallengeBulletSystem.reset(); } catch(_){}
                try { if (boss && typeof boss.stopAllEmitters === 'function') boss.stopAllEmitters(); } catch(_){}
                try { ctx.audio.stopAllMusic(); } catch(_){}
                try { if (typeof AudioManager !== 'undefined' && AudioManager.stopAllMusic) AudioManager.stopAllMusic(); } catch(_){}
                _victoryHandled = true;
                // 使用挑戰模式的結算覆蓋層，避免與生存模式互相污染
                try {
                  if (typeof window !== 'undefined' && window.ChallengeUI && typeof window.ChallengeUI.showSurvivalSettlement === 'function') {
                    window.ChallengeUI.showSurvivalSettlement('victory');
                  }
                } catch(_){}
                // 立即停止挑戰模式，清除事件以避免返回選單時誤播 BGM
              // 不在此處停止挑戰模式；讓結算覆蓋層掌控返回
              }
              // 停止主迴圈排程；讓 UI 管理返回首頁
              return;
            }
          } catch(_){}
          try { if (window.ChallengeBulletSystem) window.ChallengeBulletSystem.update(dt); } catch(_){}
          // 更新與清理經驗球（挑戰模式專屬）
          try {
            if (window.ChallengeExperience) {
              window.ChallengeExperience.update(dt);
            }
          } catch(_){}
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

      // 視窗尺寸變更時：不改 canvas 解析度（交由 UI/main.js 縮放），此處無需處理

      // 初始化挑戰 UI 模組（音量、天賦清單、計時器）
      try {
        if (typeof window.ChallengeUI !== 'undefined') {
          window.ChallengeUI.init(ctx, {
            onPauseChange: (p) => {
              // ESC 菜單開啟時暫停；關閉時若分頁仍隱藏則保持暫停
              paused = !!p || !!document.hidden || (document.visibilityState !== 'visible');
              if (!p) {
                try {
                  // 勝利/失敗期間或返回主選單時不恢復挑戰 BGM，避免重疊污染
                  if (typeof Game !== 'undefined' && Game.isGameOver) return;
                  if (typeof UI !== 'undefined' && UI.isScreenVisible) {
                    if (UI.isScreenVisible('victory-screen') || UI.isScreenVisible('game-over-screen')) return;
                  }
                  // 分頁仍隱藏時不恢復主迴圈與音樂
                  if (document.hidden || (document.visibilityState !== 'visible')) return;
                  try { const ceo = document.getElementById('challenge-end-overlay'); if (ceo) return; } catch(_){}
                  ensureShuraPlaying();
                } catch(_){}
              }
            }
          });
          window.ChallengeUI.refreshTalentsList();
        }
      } catch(_){}

      // 初始化挑戰彈幕系統與 BOSS（獨立於生存模式）
      try {
        if (typeof window.ChallengeBulletSystem !== 'undefined') {
          window.ChallengeBulletSystem.init({ canvas, defaultDamage: 20 });
        }
        const bossGif = ctx.resources.getImage('challenge_boss_gif');
        const gw = bossGif && bossGif.naturalWidth ? bossGif.naturalWidth : 223;
        const gh = bossGif && bossGif.naturalHeight ? bossGif.naturalHeight : 320;
        const halfGifSize = { width: Math.floor(gw * 0.5), height: Math.floor(gh * 0.5) };
        boss = (typeof window.ChallengeBoss !== 'undefined' && window.ChallengeBoss.create)
          ? window.ChallengeBoss.create(ctx, { maxHealth: 100000, gifUrl: bossGif ? bossGif.src : 'assets/images/challengeBOSS-1.gif', gifSize: halfGifSize })
          : null;
        // 生成於畫面「中間的上方」
        if (boss) {
          boss.x = canvas.width * 0.5;
          boss.y = canvas.height * 0.25;
          boss.beamX = boss.x;
          // 測試用：公開挑戰模式 BOSS 參考以便於 Console 切換階段驗證彈幕
          try { window.CHALLENGE_BOSS = boss; } catch(_){}
          // 立即建立第一階段的發射器
          try { boss.onPhaseChanged(); } catch(_){}
        }
      } catch(_){}
    },
    // 退出模式：主要依靠 ctx.dispose 清理事件與計時器；可選擇 UI 還原
    exit(ctx){
      try { if (ctx && typeof ctx.dispose === 'function') ctx.dispose(); } catch(_){ }
      // 清理 GIF 覆蓋元素（避免殘留）
      try { if (typeof window.ChallengeGifOverlay !== 'undefined') window.ChallengeGifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.ChallengeBulletSystem !== 'undefined') window.ChallengeBulletSystem.reset(); } catch(_){}
      // 移除上層彈幕 canvas
      try {
        const c = document.getElementById('challenge-bullets-top');
        if (c && c.parentNode) c.parentNode.removeChild(c);
      } catch(_){}
      try { const gameUI = document.getElementById('game-ui'); if (gameUI) gameUI.style.display = ''; } catch(_){}
      try { if (typeof window.ChallengeUI !== 'undefined') window.ChallengeUI.dispose(); } catch(_){}
      try { const cHUD = document.getElementById('challenge-ui'); if (cHUD) cHUD.style.display = 'none'; } catch(_){}
    }
  };

  // 註冊到 GameModeManager（不影響既有 ModeManager）
  if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.register === 'function') {
    window.GameModeManager.register(ChallengeMode.id, ChallengeMode);
  } else {
    console.warn('[ChallengeMode] GameModeManager 尚未就绪，无法注册挑战模式');
  }
})();