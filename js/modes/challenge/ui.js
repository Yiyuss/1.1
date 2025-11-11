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
    _barsTimer: null,
    _barsPaused: false,
    _hasAdvancedBars: false,
    _lastBarsTs: 0,
    _playerGhost: null,
    _state: {
      hp: 0, hpMax: 0,
      exp: 0, expMax: 100,
      en: 0, enMax: 0
    },

    init(ctx, options){
      this._ctx = ctx;
      this._callbacks = options||{};

      // 進入挑戰模式時預設啟動 Bars（頁面可見且菜單關閉）
      try { this._barsPaused = !!document.hidden; } catch(_) { this._barsPaused = false; }

      // HUD 初始值：沿用 CONFIG 或預設（並套用天賦加成，不更動任何公式）
      try {
        const hpBase = (typeof CONFIG !== 'undefined' && CONFIG.PLAYER && CONFIG.PLAYER.MAX_HEALTH) ? CONFIG.PLAYER.MAX_HEALTH : 100;
        const enMax = (typeof CONFIG !== 'undefined' && CONFIG.ENERGY && CONFIG.ENERGY.MAX) ? CONFIG.ENERGY.MAX : 100;
        const expBase = (typeof CONFIG !== 'undefined' && CONFIG.EXPERIENCE && CONFIG.EXPERIENCE.LEVEL_UP_BASE) ? CONFIG.EXPERIENCE.LEVEL_UP_BASE : 100;
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
        this._state.exp = 0; this._state.expMax = expBase;
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
            }
          } catch(_) {}
        }, { capture: true });
      }

      // 視窗可見性與焦點：離開分頁或視窗失焦時暫停能量與回血
      if (ctx && ctx.events && typeof ctx.events.on === 'function') {
        ctx.events.on(document, 'visibilitychange', () => {
          try {
            if (document.hidden) {
              this._barsPaused = true;
            } else {
              const m = $('#challenge-menu');
              const isOpen = m && !m.classList.contains('hidden');
              if (!isOpen) this._barsPaused = false;
            }
          } catch(_) {}
        }, { capture: true });
        // 失焦事件：僅在 Bars 已經開始更新後才允許因 blur 暫停，避免初載未聚焦導致能量不動
        ctx.events.on(window, 'blur', () => { try { if (this._hasAdvancedBars) this._barsPaused = true; } catch(_) {} }, { capture: true });
        ctx.events.on(window, 'focus', () => {
          try {
            const m = $('#challenge-menu');
            const isOpen = m && !m.classList.contains('hidden');
            if (!isOpen) this._barsPaused = false;
          } catch(_) {}
        }, { capture: true });
      }

      this.showHUD();
      // 確保進入時選單為關閉，Bars 不被暫停（避免首次載入需按 ESC 才開始）
      try {
        const m = document.getElementById('challenge-menu');
        if (m) m.classList.add('hidden');
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
      // 解除暫停：調整 _startTs 以抵消暫停時間
      try {
        if (this._pauseStart) {
          const now = performance.now();
          const delta = Math.max(0, now - this._pauseStart);
          this._startTs += delta;
          this._pauseStart = 0;
        }
      } catch(_) {}
      // 解除 Bars 暫停
      this._barsPaused = false;
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

    _startTimer(){
      const tick = () => {
        try {
          const now = performance.now();
          const sec = Math.floor((now - this._startTs) / 1000);
          const el = $('#challenge-timer'); if (el) el.textContent = fmtTime(sec);
        } catch(_) {}
      };
      tick();
      if (this._ctx && this._ctx.timers && typeof this._ctx.timers.setInterval === 'function') {
        this._timerId = this._ctx.timers.setInterval(tick, 250);
      } else {
        this._timerId = setInterval(tick, 250);
      }
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
        if (this._state.exp >= this._state.expMax) {
          this.levelUp();
        } else {
          this._renderBars();
        }
      } catch(_) {}
    },
    levelUp(){
      try {
        if (!Number.isFinite(this._state.level)) this._state.level = 1;
        this._state.level += 1;
        this._state.exp -= this._state.expMax;
        const base = (typeof CONFIG !== 'undefined' && CONFIG.EXPERIENCE && CONFIG.EXPERIENCE.LEVEL_UP_BASE) ? CONFIG.EXPERIENCE.LEVEL_UP_BASE : 80;
        const mul = (typeof CONFIG !== 'undefined' && CONFIG.EXPERIENCE && CONFIG.EXPERIENCE.LEVEL_UP_MULTIPLIER) ? CONFIG.EXPERIENCE.LEVEL_UP_MULTIPLIER : 1.12;
        this._state.expMax = Math.floor(base * Math.pow(mul, this._state.level - 1));
        this._renderBars();
        // 僅播放升級音效；不調用生存的 UI 以避免污染
        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
          try { AudioManager.playSound('level_up'); } catch(_) {}
        }
      } catch(_) {}
    },

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
      try { const menu = $('#challenge-menu'); if (menu) menu.style.display = 'none'; } catch(_) {}
      try { if (this._timerId) { (this._ctx && this._ctx.timers && this._ctx.timers.clearInterval) ? this._ctx.timers.clearInterval(this._timerId) : clearInterval(this._timerId); this._timerId = null; } } catch(_) {}
      try { if (this._barsTimer) { (this._ctx && this._ctx.timers && this._ctx.timers.clearInterval) ? this._ctx.timers.clearInterval(this._barsTimer) : clearInterval(this._barsTimer); this._barsTimer = null; } } catch(_) {}
      this._ctx = null; this._callbacks = {};
    }
  };

  window.ChallengeUI = ChallengeUI;
})();