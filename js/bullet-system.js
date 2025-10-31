// 彈幕系統骨架（可選模組）
// 設計目標：
// - 預設停用，不影響現有遊戲邏輯與畫面
// - 啟用時集中管理發射器（Emitter）與彈幕（Bullet）的更新/繪製
// - 與 Game.update/draw 以安全的存在檢查方式整合
// - 不依賴 UI/事件；僅依賴 CONFIG 與 Game 的世界座標上下文

(function (global) {
  const BulletSystem = {
    enabled: false,
    emitters: [],
    bullets: [],
    bulletImage: null,
    bulletImageReady: false,

    init() {
      try {
        // 兼容從全域常量（CONFIG）或 global 物件讀取設定：
        // 註：在瀏覽器一般 script 中，頂層 const 並不掛載到 window 屬性，
        // 因此需優先使用直接可見的 CONFIG，再回退到 global.CONFIG。
        const cfgObj = (typeof CONFIG !== 'undefined') ? CONFIG : (global && global.CONFIG ? global.CONFIG : null);
        const cfgEnabled = !!(cfgObj && cfgObj.BULLET_SYSTEM && cfgObj.BULLET_SYSTEM.ENABLED);
        this.enabled = cfgEnabled;
        this.emitters = [];
        this.bullets = [];
        // 載入彈幕圖片（bullet.gif），失敗則使用圈形備援
        this.bulletImage = null;
        this.bulletImageReady = false;
        try {
          const img = new Image();
          img.onload = () => { this.bulletImage = img; this.bulletImageReady = true; };
          img.onerror = () => { this.bulletImage = null; this.bulletImageReady = false; };
          img.src = 'assets/images/bullet.gif';
        } catch (_) {
          this.bulletImage = null;
          this.bulletImageReady = false;
        }
        // 僅用於維護調試；不影響效能與使用者介面
        console.log('[BulletSystem] 初始化：', this.enabled ? '啟用' : '停用');
      } catch (_) {
        // 若發生錯誤，保持停用狀態並不影響遊戲
        this.enabled = false;
      }
    },

    reset() {
      // 重置所有暫存；不更動外部狀態
      this.emitters = [];
      this.bullets = [];
    },

    setEnabled(value) {
      this.enabled = !!value;
    },

    /**
     * 建立發射器骨架（預留）：
     * options: { x, y, rateMs, lifeMs, patternFn }
     * - 預設不自動加入任何彈幕，僅保存結構
     */
    createEmitter(options) {
      if (!this.enabled) return null;
      const now = Date.now();
      const emitter = {
        x: options?.x || 0,
        y: options?.y || 0,
        rateMs: Math.max(0, options?.rateMs || 0),
        lifeMs: Math.max(0, options?.lifeMs || 0),
        lastEmitAt: now,
        createdAt: now,
        active: true,
        patternFn: typeof options?.patternFn === 'function' ? options.patternFn : null,
      };
      this.emitters.push(emitter);
      return emitter;
    },

    stopEmitter(emitter) {
      if (!emitter) return;
      emitter.active = false;
    },

    /** 更新（停用時不做任何事） */
    update(deltaTime) {
      if (!this.enabled) return;

      const now = Date.now();

      // 更新發射器（骨架：僅維護生命週期，預設不生成彈幕）
      for (let i = this.emitters.length - 1; i >= 0; i--) {
        const e = this.emitters[i];
        if (!e.active) { this.emitters.splice(i, 1); continue; }
        if (e.lifeMs > 0 && now - e.createdAt >= e.lifeMs) {
          e.active = false;
          this.emitters.splice(i, 1);
          continue;
        }
        // 預留：若需要，透過 patternFn(e, this) 生成彈幕（只有建立發射器時才會運作）
        if (e.patternFn && now - e.lastEmitAt >= e.rateMs) {
          try { e.patternFn(e, this); } catch (_) {}
          e.lastEmitAt = now;
        }
      }

      // 更新彈幕（骨架：簡單物理與生命週期）
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.x += (b.vx || 0) * (deltaTime / 16.67);
        b.y += (b.vy || 0) * (deltaTime / 16.67);
        b.life -= deltaTime;
        if (b.life <= 0) { this.bullets.splice(i, 1); continue; }

        // 新增：與玩家碰撞則造成傷害並移除彈幕
        try {
          const player = (typeof Game !== 'undefined') ? Game.player : null;
          if (player) {
            const pr = (player.collisionRadius != null) ? player.collisionRadius : ((typeof CONFIG !== 'undefined' && CONFIG.PLAYER && CONFIG.PLAYER.COLLISION_RADIUS) ? CONFIG.PLAYER.COLLISION_RADIUS : 16);
            const br = b.size || 4;
            const dx = (player.x - b.x);
            const dy = (player.y - b.y);
            const distSq = dx * dx + dy * dy;
            const rad = pr + br;
            if (distSq <= rad * rad) {
              // 以既有管線扣血；彈幕屬於重擊來源，忽略無敵判定
              if (typeof player.takeDamage === 'function') {
                const hitDamage = (typeof b.damage === 'number') ? b.damage : this._computeWaveDamage(30);
                player.takeDamage(hitDamage, { ignoreInvulnerability: true, source: 'bullet_system' });
              } else if (typeof Game !== 'undefined' && Game.player) {
                // 後備：直接扣血
                const hitDamage = (typeof b.damage === 'number') ? b.damage : this._computeWaveDamage(30);
                Game.player.health = Math.max(0, (Game.player.health || 0) - hitDamage);
                if (typeof UI !== 'undefined' && UI.updateHealthBar) {
                  try { UI.updateHealthBar(Game.player.health, Game.player.maxHealth || Game.player.health); } catch (_) {}
                }
              }

              // 命中感：鏡頭震動、螢幕閃光、粒子與音效
              try {
                if (!Game.cameraShake) {
                  Game.cameraShake = { active: false, intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
                }
                Game.cameraShake.active = true;
                Game.cameraShake.intensity = 6; // 輕微震動
                Game.cameraShake.duration = 120; // 毫秒
              } catch (_) {}

              // 已移除：螢幕閃光，避免與玩家技能閃光重疊導致混亂

              try {
                if (!Game.explosionParticles) Game.explosionParticles = [];
                // 火花粒子（快速擴散、壽命短）
                for (let k = 0; k < 6; k++) {
                  const ang = Math.random() * Math.PI * 2;
                  const spd = 0.8 + Math.random() * 1.2;
                  Game.explosionParticles.push({
                    x: b.x,
                    y: b.y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    life: 180 + Math.random() * 120,
                    maxLife: 180 + Math.random() * 120,
                    size: 2 + Math.random() * 2,
                    color: '#ffcc55'
                  });
                }
                // 煙霧粒子（向上飄散、壽命略長）
                for (let k = 0; k < 3; k++) {
                  const ang2 = Math.random() * Math.PI * 2;
                  const spd2 = 0.5 + Math.random() * 1.0;
                  Game.explosionParticles.push({
                    x: b.x + (Math.random() - 0.5) * 8,
                    y: b.y + (Math.random() - 0.5) * 8,
                    vx: Math.cos(ang2) * spd2 * 0.5,
                    vy: Math.sin(ang2) * spd2 * 0.5 - 0.6,
                    life: 250 + Math.random() * 150,
                    maxLife: 250 + Math.random() * 150,
                    size: 5 + Math.random() * 3,
                    color: '#cc6666'
                  });
                }
              } catch (_) {}

              // 已移除：命中音效 'zaps'，避免與玩家技能音效重疊

              // 命中後移除彈幕，避免連續傷害
              this.bullets.splice(i, 1);
              continue;
            }
          }
        } catch (_) {}
      }
    },

    /** 繪製（停用或無彈幕時不輸出任何圖形） */
    draw(ctx) {
      if (!this.enabled || !this.bullets.length) return;
      try {
        for (const b of this.bullets) {
          const size = b.size || 4;
          if (this.bulletImageReady && this.bulletImage) {
            const w = size * 2;
            const h = size * 2;
            ctx.drawImage(this.bulletImage, b.x - w / 2, b.y - h / 2, w, h);
          } else {
            ctx.save();
            ctx.fillStyle = b.color || '#fff';
            ctx.beginPath();
            ctx.arc(b.x, b.y, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      } catch (_) {
        // 防呆：任何繪製錯誤都不影響外部管線
      }
    },

    // 依波次計算傷害：基礎30 + 每波+1（例：第30波=60）
    _computeWaveDamage(base = 30) {
      try {
        const w = (typeof WaveSystem !== 'undefined' && WaveSystem && typeof WaveSystem.currentWave === 'number')
          ? WaveSystem.currentWave
          : (typeof Game !== 'undefined' && typeof Game.currentWave === 'number' ? Game.currentWave : 1);
        return base + w;
      } catch (_) { return base + 1; }
    },

    /** 加入單一彈幕（供未來使用） */
    addBullet(x, y, vx, vy, lifeMs, size = 4, color = '#fff', damage) {
      if (!this.enabled) return;
      const dmg = (typeof damage === 'number') ? damage : this._computeWaveDamage(30);
      this.bullets.push({ x, y, vx, vy, life: lifeMs, maxLife: lifeMs, size, color, damage: dmg });
    },
  };

  global.BulletSystem = BulletSystem;
})(this);
