// 挑戰模式 UI 模組：獨立於生存模式 UI，提供 HUD 與 ESC 菜單
// 職責：
// - 顯示左上頭像/HP/EXP/能量、右上時間/金幣
// - ESC 菜單：音量控制（音樂/音效）、顯示目前天賦、暫停/繼續
// - 僅在挑戰模式 enter/exit 期間掛載與清理，不污染其他模式
(function(){
  const $ = (sel) => document.querySelector(sel);

  function clamp01(v){ return Math.max(0, Math.min(1, v)); }
  function fmtTime(sec){
    sec = Math.max(0, Math.floor(sec||0));
    const m = String(Math.floor(sec/60)).padStart(2,'0');
    const s = String(sec%60).padStart(2,'0');
    return `${m}:${s}`;
  }

  const ChallengeUI = {
    _ctx: null,
    _callbacks: {},
    _startTs: 0,
    _timerId: null,
    _timerPauseStart: 0,
    _timerPaused: false,
    _timerHasStarted: false,
    _startCoins: 0,
    _barsTimer: null,
    _barsPaused: false,
    _hasAdvancedBars: false,
    _lastBarsTs: 0,
    _playerGhost: null,
    _failed: false,
    _state: {
      hp: 0, hpMax: 0,
      exp: 0, expMax: 100,
      en: 0, enMax: 0,
      level: 1
    },
    _grazePool: [],
    _grazeLastCleanup: 0,

    // —— 通用查詢介面（僅挑戰模式用，避免污染生存） ——
    isSettlementVisible(){
      try {
        const ceo = document.getElementById('challenge-end-overlay');
        if (ceo) return true;
        if (typeof UI !== 'undefined' && typeof UI.isScreenVisible === 'function') {
          if (UI.isScreenVisible('victory-screen') || UI.isScreenVisible('game-over-screen')) return true;
        }
      } catch(_) {}
      return false;
    },
    getElapsedSeconds(){
      try {
        const now = performance.now();
        let elapsedMs = now - this._startTs;
        if (this._timerPaused && this._timerPauseStart) {
          elapsedMs -= Math.max(0, now - this._timerPauseStart);
        }
        return Math.max(0, Math.floor(elapsedMs/1000));
      } catch(_) { return 0; }
    },
    getGainedCoins(){
      try {
        const coinsStart = Number(this._startCoins||0);
        const coinsNow = (typeof SaveService !== 'undefined' && SaveService.getCoins) ? (SaveService.getCoins()||0) : coinsStart;
        return Math.max(0, coinsNow - coinsStart);
      } catch(_) { return 0; }
    },

    init(ctx, options){
      this._ctx = ctx;
      this._callbacks = options||{};
      // 進入挑戰模式時重置等級/經驗，避免上一輪殘留導致高等級延續
      try {
        this._state.level = 1;
        this._state.exp = 0;
        this._state.expMax = 100;
        // 同步 CHALLENGE_PLAYER 供射擊擴散讀取
        if (typeof window !== 'undefined') {
          window.CHALLENGE_PLAYER = Object.assign({}, window.CHALLENGE_PLAYER||{}, { level: 1 });
        }
      } catch(_) {}
      // 記錄進入挑戰模式時的金幣，用於結算顯示「獲得金幣」
      try { this._startCoins = (typeof SaveService !== 'undefined' && SaveService.getCoins) ? (SaveService.getCoins()||0) : 0; } catch(_) { this._startCoins = 0; }
      // 重置失敗旗標與清理殘留覆蓋層，避免重新進入後立即觸發失敗
      try { this._failed = false; } catch(_){}
      try { const ov = document.getElementById('challenge-end-overlay'); if (ov) ov.remove(); } catch(_){}
      try { const ov2 = document.getElementById('challenge-failure-overlay'); if (ov2) ov2.remove(); } catch(_){}

      // 進入挑戰模式時預設啟動 Bars（頁面可見且菜單關閉）
      try { this._barsPaused = !!document.hidden; } catch(_) { this._barsPaused = false; }
      // 計時暫停旗標（若進入時已隱藏，則標記暫停起點）
      try {
        if (document.hidden) {
          this._timerPaused = true;
          this._timerPauseStart = performance.now();
        } else {
          this._timerPaused = false;
          this._timerPauseStart = 0;
        }
      } catch(_) {}

      // HUD 初始值：沿用 CONFIG 或預設（並套用天賦加成，不更動任何公式）
      try {
        const hpBase = (typeof CONFIG !== 'undefined' && CONFIG.PLAYER && CONFIG.PLAYER.MAX_HEALTH) ? CONFIG.PLAYER.MAX_HEALTH : 100;
        const enMax = (typeof CONFIG !== 'undefined' && CONFIG.ENERGY && CONFIG.ENERGY.MAX) ? CONFIG.ENERGY.MAX : 100;
        const expBase = 100; // 挑戰模式固定 100
        // 建立 ghost 玩家以便套用 BuffSystem（不影響生存模式與公式）
        this._playerGhost = {
          maxHealth: hpBase,
          health: hpBase,
          speed: (typeof CONFIG !== 'undefined' && CONFIG.PLAYER && CONFIG.PLAYER.SPEED) ? CONFIG.PLAYER.SPEED : 3,
          damageReductionFlat: 0,
          pickupRangeMultiplier: 1.0,
          healthRegenSpeedMultiplier: 1.0,
          experienceGainMultiplier: 1.0
        };
        try { if (typeof BuffSystem !== 'undefined' && BuffSystem.initPlayerBuffs) BuffSystem.initPlayerBuffs(this._playerGhost); } catch(_){ }
        try { if (typeof BuffSystem !== 'undefined' && BuffSystem.applyBuffsFromTalents) BuffSystem.applyBuffsFromTalents(this._playerGhost); } catch(_){ }
        // 套用後的最大生命值
        const hpMax = this._playerGhost.maxHealth || hpBase;
        this._state.hpMax = hpMax; this._state.hp = hpMax;
        this._state.enMax = enMax; this._state.en = 0; // 初始能量與生存一致：0 開始累積
        this._state.exp = 0; this._state.expMax = 100; // 固定 100
      } catch(_) {}

      // 設定頭像圖片（使用挑戰模式資源）
      try {
        const img = ctx && ctx.resources ? ctx.resources.getImage('challenge_avatar') : null;
        const avatarEl = $('#challenge-avatar');
        if (avatarEl) avatarEl.src = img ? img.src : 'assets/images/player1-2.png';
      } catch(_) {}

      // 初始化音量 slider 與事件
      const music = $('#challenge-music-volume');
      const sound = $('#challenge-sound-volume');
      if (music) {
        music.value = (typeof AudioManager !== 'undefined' ? AudioManager.musicVolume : 0.5);
        music.addEventListener('input', (e) => {
          const v = clamp01(parseFloat(e.target.value)||0);
          if (typeof AudioManager !== 'undefined' && AudioManager.setMusicVolume) AudioManager.setMusicVolume(v);
        });
      }
      if (sound) {
        sound.value = (typeof AudioManager !== 'undefined' ? AudioManager.soundVolume : 0.7);
        sound.addEventListener('input', (e) => {
          const v = clamp01(parseFloat(e.target.value)||0);
          if (typeof AudioManager !== 'undefined' && AudioManager.setSoundVolume) AudioManager.setSoundVolume(v);
        });
      }

      // 移除不存在的 resume 按鈕綁定，避免死碼（現行 UI 無此元素）

      // 鍵盤 ESC 切換菜單（僅於挑戰模式註冊，離開後清理）
      if (ctx && ctx.events && typeof ctx.events.on === 'function') {
        ctx.events.on(document, 'keydown', (e) => {
          try {
            const key = e.key || e.code;
            if (key === 'Escape') {
              const m = $('#challenge-menu');
              const isOpen = m && !m.classList.contains('hidden');
              if (isOpen) this.closeMenu(); else this.openMenu();
              e.preventDefault();
              // 阻斷事件傳遞以避免與全域 ESC 處理器（選單/技能/升級）互相干擾
              try { e.stopPropagation(); } catch(_) {}
              try { e.stopImmediatePropagation(); } catch(_) {}
            }
          } catch(_) {}
        }, { capture: true });
      }

      // 視窗可見性與焦點：離開分頁或視窗失焦時暫停能量與回血與 HUD 計時
      if (ctx && ctx.events && typeof ctx.events.on === 'function') {
        ctx.events.on(document, 'visibilitychange', () => {
          try {
            if (document.hidden) {
              this._barsPaused = true;
              // 計時暫停：標記起點
              if (!this._timerPaused) {
                try { this._timerPauseStart = performance.now(); } catch(_) {}
                this._timerPaused = true;
              }
            } else {
              const m = $('#challenge-menu');
              const isOpen = m && !m.classList.contains('hidden');
              // 若結算畫面可見，保持暫停（避免污染返回流程）
              const ended = this.isSettlementVisible();
              if (!isOpen && !ended) {
                this._barsPaused = false;
                // 恢復計時：抵消暫停期間，僅在菜單關閉時恢復
                if (this._timerPaused && this._timerPauseStart) {
                  const now = performance.now();
                  const delta = Math.max(0, now - this._timerPauseStart);
                  this._startTs += delta;
                  this._timerPauseStart = 0;
                  this._timerPaused = false;
                }
              }
            }
          } catch(_) {}
        }, { capture: true });
        // 失焦事件：僅在 Bars 已經開始更新後才允許因 blur 暫停，避免初載未聚焦導致能量不動
        ctx.events.on(window, 'blur', () => {
          try {
            if (this._hasAdvancedBars) this._barsPaused = true;
            if (this._timerHasStarted && !this._timerPaused) {
              try { this._timerPauseStart = performance.now(); } catch(_) {}
              this._timerPaused = true;
            }
          } catch(_) {}
        }, { capture: true });
        ctx.events.on(window, 'focus', () => {
          try {
            const m = $('#challenge-menu');
            const isOpen = m && !m.classList.contains('hidden');
            const ended = this.isSettlementVisible();
            if (!isOpen && !ended) {
              this._barsPaused = false;
              // 恢復計時：僅在頁面可視且菜單關閉時抵消暫停時間
              if (!document.hidden && this._timerPaused && this._timerPauseStart) {
                const now = performance.now();
                const delta = Math.max(0, now - this._timerPauseStart);
                this._startTs += delta;
                this._timerPauseStart = 0;
                this._timerPaused = false;
              }
            }
          } catch(_) {}
        }, { capture: true });
      }

      this.showHUD();
      // 確保進入時選單為關閉，Bars 不被暫停（避免首次載入需按 ESC 才開始）
      try {
        const m = document.getElementById('challenge-menu');
        if (m) {
          m.classList.add('hidden');
          // 保險清除殘留 inline display，確保僅由 class 控制顯示
          m.style.display = '';
        }
        this._barsPaused = false;
        this._lastBarsTs = performance.now();
      } catch(_) {}
      this._startTs = performance.now();
      this._startTimer();
      this.updateCoins();
      this._renderBars();
    },

    showHUD(){ const hud = $('#challenge-ui'); if (hud) hud.style.display = ''; },
    hideHUD(){ const hud = $('#challenge-ui'); if (hud) hud.style.display = 'none'; },

    openMenu(){
      const menu = $('#challenge-menu'); if (menu) menu.classList.remove('hidden');
      // 點擊音效
      try { if (typeof AudioManager !== 'undefined' && AudioManager.playSound) { AudioManager.playSound('button_click'); } } catch(_) {}
      // 計時器暫停補償：標記暫停起點
      try { this._pauseStart = performance.now(); } catch(_) {}
      // HUD 計時暫停（與菜單一致）
      try {
        if (!this._timerPaused) {
          this._timerPauseStart = performance.now();
          this._timerPaused = true;
        }
      } catch(_) {}
      // 進入菜單時刷新清單
      try { this.refreshTalentsList(); } catch(_) {}
      // 暫停 Bars 更新（與遊戲暫停一致）
      this._barsPaused = true;
      if (this._callbacks.onPauseChange) try { this._callbacks.onPauseChange(true); } catch(_) {}
    },
    closeMenu(){
      const menu = $('#challenge-menu'); if (menu) menu.classList.add('hidden');
      // 點擊音效
      try { if (typeof AudioManager !== 'undefined' && AudioManager.playSound) { AudioManager.playSound('button_click'); } } catch(_) {}
      // 解除暫停：結算期間不恢復（避免污染返回流程）
      try {
        const ended = this.isSettlementVisible();
        if (!ended) {
          if (!document.hidden && this._timerPaused && this._timerPauseStart) {
            const now = performance.now();
            const delta = Math.max(0, now - this._timerPauseStart);
            this._startTs += delta;
          }
          this._timerPauseStart = 0;
          this._timerPaused = !!document.hidden; // 若仍隱藏，維持暫停狀態
          // 解除 Bars 暫停
          this._barsPaused = false;
        } else {
          // 結算期間保持暫停（HUD 與 Bars 均不恢復）
          this._timerPaused = true;
          try { this._timerPauseStart = performance.now(); } catch(_) {}
          this._barsPaused = true;
        }
        this._pauseStart = 0;
      } catch(_) {}
      if (this._callbacks.onPauseChange) try { this._callbacks.onPauseChange(false); } catch(_) {}
    },

    updateCoins(){
      try {
        const n = (typeof SaveService !== 'undefined' && SaveService.getCoins) ? SaveService.getCoins() : 0;
        const t = $('#challenge-coins-text'); if (t) t.textContent = String(n);
      } catch(_) {}
    },

    setBars({ hp, hpMax, exp, expMax, en, enMax }){
      if (Number.isFinite(hp)) this._state.hp = hp;
      if (Number.isFinite(hpMax)) this._state.hpMax = hpMax;
      if (Number.isFinite(exp)) this._state.exp = exp;
      if (Number.isFinite(expMax)) this._state.expMax = expMax;
      if (Number.isFinite(en)) this._state.en = en;
      if (Number.isFinite(enMax)) this._state.enMax = enMax;
      this._renderBars();
    },

    // 受到傷害：僅標記失敗，結束流程由挑戰主循環統一觸發本地覆蓋層
    applyDamage(amount){
      try {
        const dmg = Math.max(0, Math.floor(amount||0));
        // 扣除平坦減傷（若有天賦 BuffSystem 設定）
        const flat = (this._playerGhost && Number.isFinite(this._playerGhost.damageReductionFlat)) ? Math.max(0, this._playerGhost.damageReductionFlat) : 0;
        const final = Math.max(0, dmg - flat);
        this._state.hp = Math.max(0, Math.floor(this._state.hp) - final);
        // 挑戰模式專用：玩家 GIF 紅閃，不沿用生存模式的邏輯
        try {
          if (typeof window.ChallengeGifOverlay !== 'undefined' && typeof window.ChallengeGifOverlay.flash === 'function') {
            window.ChallengeGifOverlay.flash('challenge-player', { color: '#ff0000', durationMs: 160, opacity: 0.85 });
          }
        } catch(_){}
        this._renderBars();
        if (this._state.hp <= 0) {
          // 僅標記失敗狀態，讓主循環接管結束流程（避免污染其他模式/全域 UI）
          this._failed = true;
        } else {
          // 可選：受傷音效
          try { if (typeof AudioManager !== 'undefined' && AudioManager.playSound) AudioManager.playSound('hurt'); } catch(_){}
        }
      } catch(_) {}
    },

    isFailed(){ return !!this._failed; },
    isEnded(){ try { return !!this._failed || this.isSettlementVisible(); } catch(_) { return !!this._failed; } },

    // （已移除）原 showEndOverlay；請改用 showSurvivalSettlement

    /**
     * 顯示「生存樣式」結算覆蓋層但使用挑戰數據，避免污染生存流程
     * type = 'victory' | 'failure'
     * 樣式來源：index.html 的 #victory-screen / #game-over-screen 與 css/style.css
     * 行為：播放影片，結束後自動返回主選單；不顯示返回按鈕；不呼叫生存 UI 的統計函式
     */
    showSurvivalSettlement(type){
      try {
        // 若生存結算畫面已顯示則不重複
        if (this.isSettlementVisible()) return;

        // 停止挑戰音樂與避免重疊
        try { if (typeof AudioManager !== 'undefined' && AudioManager.stopAllMusic) AudioManager.stopAllMusic(); } catch(_){}
        try { if (this._ctx && this._ctx.audio && this._ctx.audio.stopAllMusic) this._ctx.audio.stopAllMusic(); } catch(_){}

        // 切換畫面：隱藏遊戲畫面，顯示對應的勝利/失敗畫面
        const gameScreen = document.getElementById('game-screen');
        if (gameScreen) gameScreen.classList.add('hidden');
        const screenId = (type === 'victory') ? 'victory-screen' : 'game-over-screen';
        const screenEl = document.getElementById(screenId);
        if (!screenEl) return;
        screenEl.classList.remove('hidden');

        // 更新結算數據（使用挑戰模式的查詢介面）
        const sec = this.getElapsedSeconds();
        const lv = this.getLevel();
        const coinsGain = this.getGainedCoins();
        if (type === 'victory') {
          const tEl = document.getElementById('summary-time'); if (tEl) tEl.textContent = sec;
          const lEl = document.getElementById('summary-level'); if (lEl) lEl.textContent = lv;
          const cEl = document.getElementById('summary-coins'); if (cEl) cEl.textContent = coinsGain;
          const wEl = document.getElementById('summary-exp'); if (wEl) wEl.textContent = '—';
        } else {
          const tEl = document.getElementById('game-over-time'); if (tEl) tEl.textContent = sec;
          const lEl = document.getElementById('game-over-level'); if (lEl) lEl.textContent = lv;
          const cEl = document.getElementById('game-over-coins'); if (cEl) cEl.textContent = coinsGain;
          const wEl = document.getElementById('game-over-exp'); if (wEl) wEl.textContent = '—';
        }

        // 寫入持久化存儲供成就系統使用（不改既有鍵名）
        try {
          const lastTimeKey = 'challenge_last_time';
          const lastCoinsKey = 'challenge_last_coins';
          const lastResultKey = 'challenge_last_result';
          const totalTimeKey = 'challenge_total_time';
          const totalCoinsKey = 'challenge_total_coins';
          const bestTimeKey = 'challenge_best_time';
          const bestCoinsKey = 'challenge_best_coins';
          const runsKey = 'challenge_runs';
          const readNum = (k, d=0) => { try { const s = localStorage.getItem(k); const n = parseInt(s,10); return Number.isFinite(n) ? n : d; } catch(_) { return d; } };
          const writeNum = (k, n) => { try { localStorage.setItem(k, String(Math.max(0, Math.floor(n||0)))); } catch(_){} };
          // 更新 last
          writeNum(lastTimeKey, sec);
          writeNum(lastCoinsKey, coinsGain);
          try { localStorage.setItem(lastResultKey, type); } catch(_){}
          // 累計 total 與最佳紀錄
          writeNum(totalTimeKey, readNum(totalTimeKey, 0) + sec);
          writeNum(totalCoinsKey, readNum(totalCoinsKey, 0) + coinsGain);
          const bestT = readNum(bestTimeKey, 0); if (sec > bestT) writeNum(bestTimeKey, sec);
          const bestC = readNum(bestCoinsKey, 0); if (coinsGain > bestC) writeNum(bestCoinsKey, coinsGain);
          writeNum(runsKey, readNum(runsKey, 0) + 1);
        } catch(_) {}

        // 影片播放：保持生存樣式（index.html 已配置 src 與 CSS）
        const videoId = (type === 'victory') ? 'victory-video' : 'game-over-video';
        const videoEl = document.getElementById(videoId);
        if (videoEl) {
          try { videoEl.pause(); } catch(_){}
          videoEl.loop = false; videoEl.muted = false; videoEl.currentTime = 0;
          // 播放，若被阻擋則提供一次點擊後備
          try {
            const p = videoEl.play();
            if (p && typeof p.catch === 'function') {
              p.catch(() => {
                const playOnClick = () => { try { videoEl.play(); } catch(_){} document.removeEventListener('click', playOnClick); };
                document.addEventListener('click', playOnClick, { once: true });
              });
            }
          } catch(_){}
          // 結束後自動返回主選單（無返回按鈕）
          videoEl.addEventListener('ended', () => { try { this._returnToMenu(); } catch(_){} }, { once: true });
        }
      } catch(_){}
    },

    // 保留舊介面入口：改為轉呼叫生存樣式結算覆蓋層（使用挑戰數據）
    showFailureScreen(){ try { if (typeof window.ChallengeUI !== 'undefined' && typeof window.ChallengeUI.showSurvivalSettlement === 'function') window.ChallengeUI.showSurvivalSettlement('failure'); } catch(_){} },

    _returnToMenu(){
      // 結束挑戰模式並回到主選單；全程不調用生存模式 UI
      try { if (typeof AudioManager !== 'undefined' && AudioManager.stopAllMusic) AudioManager.stopAllMusic(); } catch(_){}
      try { const ov = document.getElementById('challenge-end-overlay'); if (ov) ov.remove(); } catch(_){}
      // 隱藏生存樣式的結算覆蓋層與影片，避免遮住主選單
      try {
        const vs = document.getElementById('victory-screen'); if (vs) vs.classList.add('hidden');
        const gos = document.getElementById('game-over-screen'); if (gos) gos.classList.add('hidden');
        const vv = document.getElementById('victory-video'); if (vv) { try { vv.pause(); vv.currentTime = 0; } catch(_){} }
        const gv = document.getElementById('game-over-video'); if (gv) { try { gv.pause(); gv.currentTime = 0; } catch(_){} }
        const vo = document.getElementById('victory-overlay'); if (vo) vo.classList.add('hidden');
        const go = document.getElementById('game-over-overlay'); if (go) go.classList.add('hidden');
      } catch(_){}
      // 隱藏挑戰 HUD 與遊戲畫面，顯示開始畫面
      try {
        const hud = document.getElementById('challenge-ui'); if (hud) hud.style.display = 'none';
        const gs = document.getElementById('game-screen'); if (gs) gs.classList.add('hidden');
        const start = document.getElementById('start-screen'); if (start) start.classList.remove('hidden');
      } catch(_){}
      // 釋放挑戰模式（事件、計時器、資源、音樂）
      try {
        if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.stop === 'function') {
          window.GameModeManager.stop();
        }
      } catch(_){}
      // 確保選單音樂
      try {
        if (typeof AudioScene !== 'undefined' && typeof AudioScene.enterMenu === 'function') {
          AudioScene.enterMenu();
        } else if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
          AudioManager.playMusic('menu_music');
        }
      } catch(_){}
    },

    _renderBars(){
      const s = this._state;
      const hpPct = s.hpMax > 0 ? Math.max(0, Math.min(100, Math.round(100 * s.hp / s.hpMax))) : 0;
      const expPct = s.expMax > 0 ? Math.max(0, Math.min(100, Math.round(100 * s.exp / s.expMax))) : 0;
      const enPct = s.enMax > 0 ? Math.max(0, Math.min(100, Math.round(100 * s.en / s.enMax))) : 0;
      const hf = $('#challenge-health-fill'); if (hf) hf.style.width = hpPct + '%';
      const xf = $('#challenge-exp-fill'); if (xf) xf.style.width = expPct + '%';
      const ef = $('#challenge-energy-fill'); if (ef) ef.style.width = enPct + '%';
      const ht = $('#challenge-health-text'); if (ht) ht.textContent = `${Math.max(0, Math.floor(s.hp))}/${Math.max(0, Math.floor(s.hpMax))}`;
      const xt = $('#challenge-exp-text'); if (xt) xt.textContent = `${Math.max(0, Math.floor(s.exp))}/${Math.max(0, Math.floor(s.expMax))}`;
      const et = $('#challenge-energy-text'); if (et) et.textContent = `${Math.max(0, Math.floor(s.en))}/${Math.max(0, Math.floor(s.enMax))}`;
    },

    // 小幅增加能量，並更新 HUD（僅挑戰模式用）
    gainEnergy(amount){
      try {
        const add = Math.max(0, Number(amount)||0);
        this._state.en = Math.min(this._state.enMax, this._state.en + add);
        this._renderBars();
      } catch(_) {}
    },

    // 擦彈提示：在玩家周邊短暫顯示光環粒子效果（正確跟隨視口縮放/旋轉）
    registerGraze(x, y){
      try {
        // 優先使用 #viewport（玩家 GIF 疊加層所在），確保座標系一致
        const viewport = document.getElementById('viewport');
        const root = viewport || document.getElementById('challenge-ui');
        if (!root) return;
        const dot = document.createElement('div');
        dot.className = 'graze-dot';
        // 以畫布邊界換算座標，處理等比縮放與行動裝置旋轉
        const canvas = document.getElementById('game-canvas');
        const rect = canvas ? canvas.getBoundingClientRect() : null;
        const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
        let sx = x, sy = y;
        if (rect && canvas) {
          // 依實際 CSS 尺寸與基準解析度進行縮放換算
          const scaleX = rect.width / canvas.width;
          const scaleY = rect.height / canvas.height;
          if (!rotatedPortrait) {
            sx = x * scaleX;
            sy = y * scaleY;
          } else {
            // 旋轉模式：視口 transform 已處理旋轉與縮放，直接用遊戲座標
            sx = x; sy = y;
          }
          // 以 viewport 為座標原點（left/top 即視口內相對像素）
          dot.style.left = Math.round(sx) + 'px';
          dot.style.top = Math.round(sy) + 'px';
        } else {
          dot.style.left = Math.round(sx) + 'px';
          dot.style.top = Math.round(sy) + 'px';
        }
        // 使用絕對定位疊於視口；zIndex 高於玩家 GIF（GIF 使用 zIndex=3）
        dot.style.position = 'absolute';
        dot.style.zIndex = '5';
        // 擦邊特效範圍加大一些（視覺更明顯）
        dot.style.width = '14px';
        dot.style.height = '14px';
        dot.style.borderRadius = '50%';
        dot.style.pointerEvents = 'none';
        dot.style.background = 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(0,255,200,0.6) 50%, rgba(0,0,0,0) 70%)';
        dot.style.boxShadow = '0 0 26px rgba(0,255,200,0.92)';
        dot.style.opacity = '0.9';
        dot.style.transform = 'translate(-50%, -50%) scale(1)';
        dot.style.transition = 'opacity 240ms ease-out, transform 240ms ease-out';
        root.appendChild(dot);
        // 動畫淡出
        requestAnimationFrame(() => { dot.style.opacity = '0'; dot.style.transform = 'translate(-50%, -50%) scale(2.2)'; });
        // 清理節點
        setTimeout(() => { try { dot.remove(); } catch(_) {} }, 260);
        // 音效（若有鍵）
        try { if (typeof AudioManager !== 'undefined' && AudioManager.playSound) AudioManager.playSound('graze'); } catch(_) {}
      } catch(_) {}
    },

    // 由主迴圈（raf）呼叫，以 dt 毫秒推進能量與回血；更貼近生存模式的作法
    // externallyPaused: 若主迴圈宣告暫停，則同時暫停 Bars，並校正時間基準避免恢復後跳值
    advanceBars(dt, externallyPaused){
      const ENERGY_REGEN = 2.0; // 挑戰模式能量回復速率（每秒 +2）
      const HEALTH_TICK_MS = 5000; // 與生存模式一致：每 5 秒 +1HP（可受倍率影響）
      try {
        const now = performance.now();
        // 若外部暫停或本地暫停，更新時間基準並跳過本次更新
        if (externallyPaused || this._barsPaused) {
          this._lastBarsTs = now;
          return;
        }
        // 至少成功推進過一次後，才允許 blur 暫停
        this._hasAdvancedBars = true;
        // 計算 dt（若呼叫未帶入 dt，則自行以 now - lastBarsTs 推導）
        if (!Number.isFinite(dt)) {
          dt = Math.max(0, now - (this._lastBarsTs || now));
        }
        this._lastBarsTs = now;

        const s = this._state;
        // 能量：每秒 + ENERGY_REGEN，封頂 MAX
        s.en = Math.min(s.enMax, s.en + ENERGY_REGEN * (dt / 1000));

        // 生命：每（5000/回血速度倍率）毫秒 +1，封頂 Max
        const mul = (this._playerGhost && Number.isFinite(this._playerGhost.healthRegenSpeedMultiplier)) ? Math.max(1.0, this._playerGhost.healthRegenSpeedMultiplier) : 1.0;
        if (!this._healthAcc) this._healthAcc = 0;
        if (s.hp < s.hpMax) {
          const effectiveInterval = HEALTH_TICK_MS / mul;
          this._healthAcc += dt;
          if (this._healthAcc >= effectiveInterval) {
            const ticks = Math.floor(this._healthAcc / effectiveInterval);
            this._healthAcc -= ticks * effectiveInterval;
            s.hp = Math.min(s.hpMax, s.hp + ticks);
          }
        } else {
          this._healthAcc = 0;
        }

        this._renderBars();
      } catch(_) {}
    },

    // 消耗能量：足夠時扣除並返回 true，不足返回 false（僅挑戰模式用）
    trySpendEnergy(amount){
      try {
        const s = this._state;
        const need = Math.max(0, Math.floor(amount||0));
        if (s.en >= need) {
          s.en = Math.max(0, s.en - need);
          this._renderBars();
          return true;
        }
        return false;
      } catch(_) { return false; }
    },

    _startTimer(){
      const tick = () => {
        try {
          const now = performance.now();
          let elapsedMs = now - this._startTs;
          // 若目前處於暫停狀態，扣除暫停期間的時間，讓 HUD 時間凍結
          if (this._timerPaused && this._timerPauseStart) {
            elapsedMs -= Math.max(0, now - this._timerPauseStart);
          }
          const sec = Math.floor(elapsedMs / 1000);
          const el = $('#challenge-timer'); if (el) el.textContent = fmtTime(sec);
        } catch(_) {}
      };
      tick();
      if (this._ctx && this._ctx.timers && typeof this._ctx.timers.setInterval === 'function') {
        this._timerId = this._ctx.timers.setInterval(tick, 250);
      } else {
        this._timerId = setInterval(tick, 250);
      }
      this._timerHasStarted = true;
    },

    // 以與生存模式相同的邏輯驅動條形數值（能量/HP），不修改任何公式
    _startBarsDriver(){
      // 挑戰模式：能量回復固定為每秒 +2
      const ENERGY_REGEN = 2.0;
      const HEALTH_TICK_MS = 5000; // Player.healthRegenIntervalMs
      this._lastBarsTs = performance.now();
      const tick = () => {
        try {
          const now = performance.now();
          // 暫停時更新時間基準，避免恢復後一次性補回暫停期間的能量/回血
          if (this._barsPaused) { this._lastBarsTs = now; return; }
          const dt = Math.max(0, now - this._lastBarsTs);
          this._lastBarsTs = now;
          // 能量：每秒 + ENERGY_REGEN，封頂 MAX
          const s = this._state;
          s.en = Math.min(s.enMax, s.en + ENERGY_REGEN * (dt / 1000));
          // 生命：每（5000/回血速度倍率）毫秒 +1，封頂 Max
          const mul = (this._playerGhost && Number.isFinite(this._playerGhost.healthRegenSpeedMultiplier)) ? Math.max(1.0, this._playerGhost.healthRegenSpeedMultiplier) : 1.0;
          if (!this._healthAcc) this._healthAcc = 0;
          if (s.hp < s.hpMax) {
            const effectiveInterval = HEALTH_TICK_MS / mul;
            this._healthAcc += dt;
            if (this._healthAcc >= effectiveInterval) {
              const ticks = Math.floor(this._healthAcc / effectiveInterval);
              this._healthAcc -= ticks * effectiveInterval;
              s.hp = Math.min(s.hpMax, s.hp + ticks);
            }
          } else {
            this._healthAcc = 0;
          }
          this._renderBars();
        } catch(_) {}
      };
      // 計時器：靠 ctx.timers（若存在）以便退出時清理
      if (this._ctx && this._ctx.timers && typeof this._ctx.timers.setInterval === 'function') {
        this._barsTimer = this._ctx.timers.setInterval(tick, 100);
      } else {
        this._barsTimer = setInterval(tick, 100);
      }
    },

    // 與生存模式一致的經驗/升級流程（供挑戰模式內部使用）
    gainExperience(amount){
      try {
        const mul = (this._playerGhost && this._playerGhost.experienceGainMultiplier != null) ? this._playerGhost.experienceGainMultiplier : 1.0;
        const add = Math.max(0, Math.floor((amount||0) * mul));
        this._state.exp = Math.max(0, this._state.exp + add);
        if (this._state.exp >= 100) { // 固定 100 自動升級並歸 0
          this.levelUp();
        } else {
          this._renderBars();
        }
      } catch(_) {}
    },
    levelUp(){
      try {
        if (!Number.isFinite(this._state.level)) this._state.level = 1;
        // 升級：最多到 LV5
        if (this._state.level < 5) {
          this._state.level += 1;
        } else {
          this._state.level = 5;
        }
        // 固定 100，升級後直接歸 0
        this._state.exp = 0;
        this._state.expMax = 100;
        this._renderBars();
        // 僅播放升級音效；不調用生存的 UI 以避免污染
        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
          try { AudioManager.playSound('level_up'); } catch(_) {}
        }
        // 提供給挑戰模式其它模組（例如射擊擴散）讀取等級
        try { if (typeof window !== 'undefined') { window.CHALLENGE_PLAYER = Object.assign({}, window.CHALLENGE_PLAYER||{}, { level: this._state.level }); } } catch(_){}
      } catch(_) {}
    },

    // 讀取目前等級（預設 1）
    getLevel(){ try { return Number.isFinite(this._state.level) ? this._state.level : 1; } catch(_) { return 1; } },

    refreshTalentsList(){
      const list = $('#challenge-talents-list'); if (!list) return;
      list.innerHTML = '';
      try {
        // 與生存模式相同的顯示順序
        const orderedIds = [
          'hp_boost','defense_boost','speed_boost','pickup_range_boost','damage_boost',
          'damage_specialization','crit_enhance','regen_speed_boost','experience_boost','levelup_action_charges'
        ];
        // 僅顯示已解鎖（等級 > 0）之天賦，並沿用最高階描述
        const getLv = (id) => (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel) ? (TalentSystem.getTalentLevel(id) || 0) : 0;
        const getDesc = (id) => {
          if (typeof TalentSystem !== 'undefined' && TalentSystem.getHighestTierDescription) {
            const d = TalentSystem.getHighestTierDescription(id);
            if (d) return d;
          }
          // 後備：讀取 meta.description 或以 id 顯示
          const meta = (typeof TalentSystem !== 'undefined' && TalentSystem.talents) ? TalentSystem.talents : {};
          return (meta[id] && meta[id].description) || id;
        };

        let count = 0;
        orderedIds.forEach(id => {
          const lv = getLv(id);
          if (lv > 0) {
            const li = document.createElement('li');
            const wrapper = document.createElement('div');
            wrapper.className = 'talent-item';
            const row = document.createElement('div');
            row.className = 'talent-row';
            const span = document.createElement('span');
            span.className = 'talent-desc';
            span.textContent = getDesc(id);
            row.appendChild(span);
            wrapper.appendChild(row);
            li.appendChild(wrapper);
            list.appendChild(li);
            count++;
          }
        });

        if (count === 0) {
          const li = document.createElement('li');
          li.textContent = '尚未解鎖天賦';
          list.appendChild(li);
        }
      } catch(_) {
        const li = document.createElement('li'); li.textContent = '天賦資料讀取失敗'; list.appendChild(li);
      }
    },

    dispose(){
      try { this.hideHUD(); } catch(_) {}
      // 移除挑戰失敗覆蓋層
      try { const ov = document.getElementById('challenge-failure-overlay'); if (ov) ov.remove(); } catch(_){}
      try { const ov2 = document.getElementById('challenge-end-overlay'); if (ov2) ov2.remove(); } catch(_){}
        // 統一用 class 控制顯示，避免殘留 inline style 造成二次進入後無法開啟 ESC 菜單
        try {
            const menu = $('#challenge-menu');
            if (menu) {
                menu.classList.add('hidden');
                // 清除可能殘留的 inline display，讓下次進入時僅由 class 控制
                menu.style.display = '';
            }
        } catch(_) {}
      try { if (this._timerId) { (this._ctx && this._ctx.timers && this._ctx.timers.clearInterval) ? this._ctx.timers.clearInterval(this._timerId) : clearInterval(this._timerId); this._timerId = null; } } catch(_) {}
      try { if (this._barsTimer) { (this._ctx && this._ctx.timers && this._ctx.timers.clearInterval) ? this._ctx.timers.clearInterval(this._barsTimer) : clearInterval(this._barsTimer); this._barsTimer = null; } } catch(_) {}
      this._ctx = null; this._callbacks = {};
    }
  };

  window.ChallengeUI = ChallengeUI;
})();