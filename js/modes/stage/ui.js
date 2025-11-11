// 闖關模式 UI 模組：獨立於生存/挑戰 UI，提供 HUD 與 ESC 菜單
// 說明：完全複製挑戰模式的行為與視覺，但採用闖關專用的 DOM ID。
(function(){
  const $ = (sel) => document.querySelector(sel);

  function clamp01(v){ return Math.max(0, Math.min(1, v)); }
  function fmtTime(sec){
    sec = Math.max(0, Math.floor(sec||0));
    const m = String(Math.floor(sec/60)).padStart(2,'0');
    const s = String(sec%60).padStart(2,'0');
    return `${m}:${s}`;
  }

  const StageUI = {
    _ctx: null,
    _callbacks: {},
    _startTs: 0,
    _timerId: null,
    _barsTimer: null,
    _barsPaused: false,
    _hasAdvancedBars: false,
    _lastBarsTs: 0,
    _playerGhost: null,
    _state: { hp: 0, hpMax: 0, exp: 0, expMax: 100, en: 0, enMax: 0 },

    init(ctx, options){
      this._ctx = ctx;
      this._callbacks = options||{};
      try { this._barsPaused = !!document.hidden; } catch(_) { this._barsPaused = false; }

      try {
        const hpBase = (typeof CONFIG !== 'undefined' && CONFIG.PLAYER && CONFIG.PLAYER.MAX_HEALTH) ? CONFIG.PLAYER.MAX_HEALTH : 100;
        const enMax = (typeof CONFIG !== 'undefined' && CONFIG.ENERGY && CONFIG.ENERGY.MAX) ? CONFIG.ENERGY.MAX : 100;
        const expBase = (typeof CONFIG !== 'undefined' && CONFIG.EXPERIENCE && CONFIG.EXPERIENCE.LEVEL_UP_BASE) ? CONFIG.EXPERIENCE.LEVEL_UP_BASE : 100;
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
        const hpMax = this._playerGhost.maxHealth || hpBase;
        this._state.hpMax = hpMax; this._state.hp = hpMax;
        this._state.enMax = enMax; this._state.en = 0;
        this._state.exp = 0; this._state.expMax = expBase;
      } catch(_) {}

      try {
        const img = ctx && ctx.resources ? ctx.resources.getImage('stage_avatar') : null;
        const avatarEl = $('#stage-avatar');
        if (avatarEl) avatarEl.src = img ? img.src : 'assets/images/player1-2.png';
      } catch(_) {}

      const music = $('#stage-music-volume');
      const sound = $('#stage-sound-volume');
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

      if (ctx && ctx.events && typeof ctx.events.on === 'function') {
        ctx.events.on(document, 'keydown', (e) => {
          try {
            const key = e.key || e.code;
            if (key === 'Escape') {
              const m = $('#stage-menu');
              const isOpen = m && !m.classList.contains('hidden');
              if (isOpen) this.closeMenu(); else this.openMenu();
              e.preventDefault();
            }
          } catch(_) {}
        }, { capture: true });
      }

      if (ctx && ctx.events && typeof ctx.events.on === 'function') {
        ctx.events.on(document, 'visibilitychange', () => {
          try {
            if (document.hidden) {
              this._barsPaused = true;
            } else {
              const m = $('#stage-menu');
              const isOpen = m && !m.classList.contains('hidden');
              if (!isOpen) this._barsPaused = false;
            }
          } catch(_) {}
        }, { capture: true });
        ctx.events.on(window, 'blur', () => { try { if (this._hasAdvancedBars) this._barsPaused = true; } catch(_) {} }, { capture: true });
        ctx.events.on(window, 'focus', () => {
          try {
            const m = $('#stage-menu');
            const isOpen = m && !m.classList.contains('hidden');
            if (!isOpen) this._barsPaused = false;
          } catch(_) {}
        }, { capture: true });
      }

      this.showHUD();
      try {
        const m = document.getElementById('stage-menu');
        if (m) m.classList.add('hidden');
        this._barsPaused = false;
        this._lastBarsTs = performance.now();
      } catch(_) {}
      this._startTs = performance.now();
      this._startTimer();
      this.updateCoins();
      this._renderBars();
    },

    showHUD(){ const hud = $('#stage-ui'); if (hud) hud.style.display = ''; },
    hideHUD(){ const hud = $('#stage-ui'); if (hud) hud.style.display = 'none'; },

    openMenu(){
      const menu = $('#stage-menu'); if (menu) menu.classList.remove('hidden');
      try { if (typeof AudioManager !== 'undefined' && AudioManager.playSound) { AudioManager.playSound('button_click'); } } catch(_) {}
      try { this._pauseStart = performance.now(); } catch(_) {}
      try { this.refreshTalentsList(); } catch(_) {}
      this._barsPaused = true;
      if (this._callbacks.onPauseChange) try { this._callbacks.onPauseChange(true); } catch(_) {}
    },
    closeMenu(){
      const menu = $('#stage-menu'); if (menu) menu.classList.add('hidden');
      try { if (typeof AudioManager !== 'undefined' && AudioManager.playSound) { AudioManager.playSound('button_click'); } } catch(_) {}
      try {
        if (this._pauseStart) {
          const now = performance.now();
          const delta = Math.max(0, now - this._pauseStart);
          this._startTs += delta;
          this._pauseStart = 0;
        }
      } catch(_) {}
      this._barsPaused = false;
      if (this._callbacks.onPauseChange) try { this._callbacks.onPauseChange(false); } catch(_) {}
    },

    updateCoins(){
      try {
        const n = (typeof SaveService !== 'undefined' && SaveService.getCoins) ? SaveService.getCoins() : 0;
        const t = $('#stage-coins-text'); if (t) t.textContent = String(n);
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
      const hf = $('#stage-health-fill'); if (hf) hf.style.width = hpPct + '%';
      const xf = $('#stage-exp-fill'); if (xf) xf.style.width = expPct + '%';
      const ef = $('#stage-energy-fill'); if (ef) ef.style.width = enPct + '%';
      const ht = $('#stage-health-text'); if (ht) ht.textContent = `${Math.max(0, Math.floor(s.hp))}/${Math.max(0, Math.floor(s.hpMax))}`;
      const xt = $('#stage-exp-text'); if (xt) xt.textContent = `${Math.max(0, Math.floor(s.exp))}/${Math.max(0, Math.floor(s.expMax))}`;
      const et = $('#stage-energy-text'); if (et) et.textContent = `${Math.max(0, Math.floor(s.en))}/${Math.max(0, Math.floor(s.enMax))}`;
    },

    advanceBars(dt, externallyPaused){
      const ENERGY_REGEN = 2.0;
      const HEALTH_TICK_MS = 5000;
      try {
        const now = performance.now();
        if (externallyPaused || this._barsPaused) { this._lastBarsTs = now; return; }
        this._hasAdvancedBars = true;
        if (!Number.isFinite(dt)) { dt = Math.max(0, now - (this._lastBarsTs || now)); }
        this._lastBarsTs = now;
        const s = this._state;
        s.en = Math.min(s.enMax, s.en + ENERGY_REGEN * (dt / 1000));
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
          const el = $('#stage-timer'); if (el) el.textContent = fmtTime(sec);
        } catch(_) {}
      };
      tick();
      if (this._ctx && this._ctx.timers && typeof this._ctx.timers.setInterval === 'function') {
        this._timerId = this._ctx.timers.setInterval(tick, 250);
      } else {
        this._timerId = setInterval(tick, 250);
      }
    },

    _startBarsDriver(){
      const ENERGY_REGEN = 2.0;
      const HEALTH_TICK_MS = 5000;
      this._lastBarsTs = performance.now();
      const tick = () => {
        try {
          const now = performance.now();
          if (this._barsPaused) { this._lastBarsTs = now; return; }
          const dt = Math.max(0, now - this._lastBarsTs);
          this._lastBarsTs = now;
          const s = this._state;
          s.en = Math.min(s.enMax, s.en + ENERGY_REGEN * (dt / 1000));
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
      if (this._ctx && this._ctx.timers && typeof this._ctx.timers.setInterval === 'function') {
        this._barsTimer = this._ctx.timers.setInterval(tick, 100);
      } else {
        this._barsTimer = setInterval(tick, 100);
      }
    },

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
        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
          try { AudioManager.playSound('level_up'); } catch(_) {}
        }
      } catch(_) {}
    },

    refreshTalentsList(){
      const list = $('#stage-talents-list'); if (!list) return;
      list.innerHTML = '';
      try {
        const orderedIds = [
          'hp_boost','defense_boost','speed_boost','pickup_range_boost','damage_boost',
          'damage_specialization','crit_enhance','regen_speed_boost','experience_boost','levelup_action_charges'
        ];
        const getLv = (id) => (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel) ? (TalentSystem.getTalentLevel(id) || 0) : 0;
        const getDesc = (id) => {
          if (typeof TalentSystem !== 'undefined' && TalentSystem.getHighestTierDescription) {
            const d = TalentSystem.getHighestTierDescription(id);
            if (d) return d;
          }
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
      try { const menu = $('#stage-menu'); if (menu) menu.style.display = 'none'; } catch(_) {}
      try { if (this._timerId) { (this._ctx && this._ctx.timers && this._ctx.timers.clearInterval) ? this._ctx.timers.clearInterval(this._timerId) : clearInterval(this._timerId); this._timerId = null; } } catch(_) {}
      try { if (this._barsTimer) { (this._ctx && this._ctx.timers && this._ctx.timers.clearInterval) ? this._ctx.timers.clearInterval(this._barsTimer) : clearInterval(this._barsTimer); this._barsTimer = null; } } catch(_) {}
      this._ctx = null; this._callbacks = {};
    }
  };

  window.StageUI = StageUI;
})();