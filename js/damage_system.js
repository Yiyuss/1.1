/*
維護註解 — DamageSystem 與 DamageNumbers
目的：
- 提供統一的傷害計算（傷害浮動 ±10%、爆擊率 10%、爆擊倍數 1.75x）。
- 與現有武器/特效類（Projectile、LaserBeam、OrbitBall、ChainLightningEffect）整合，不改動原有 UI 文案與排版。
- 顯示畫面傷害數字（GenSenRounded-H 字體），採用 WAAPI 動畫，方向隨機且不固定。
依賴：
- 需在 index.html 載入於武器與投射物腳本之前（參考 index.html 調整）。
- 依賴 CONFIG（config.js）以便於未來根據難度做更細緻校準。目前採用“統一值”。
- 依賴 #viewport 及 #game-canvas 的座標系；傷害數字層在 #viewport 內絕對定位，不改 CSS 檔。
安全性：
- 若 DamageSystem 不存在，所有原本命中流程仍可工作（各檔案加入保護）。
- 僅新增檔案與有限度改動，不影響既有功能（ESC 菜單、升級視窗、各種武器機制）。
*/

(function(global){
  const DamageSystem = {
    // 統一設定（依初始血量與武器 Damage 校準）
    fluctuationPct: 0.10,      // 傷害浮動 ±10%
    critChanceBase: 0.10,      // 基本爆擊率 10%
    critMultiplier: 1.75,      // 統一爆擊倍數 1.75x

    // 計算武器等級倍率：LV1 為 1.0，每級 +5%，例：LV10 = 1 + 0.05*(10-1) = 1.45
    levelMultiplier(level){
      const lv = Math.max(1, level|0);
      return 1 + 0.05 * (lv - 1);
    },

    // 進行一次命中計算。baseDamage 已包含武器等級與天賦加成者亦可，但非必要。
    // options 可帶入 { allowCrit: true/false, weaponType: 'LASER' | 'ORBIT' | ... }
    computeHit(baseDamage, enemy, options){
      const allowCrit = options && options.allowCrit !== false; // 預設允許爆擊
      // 浮動：在 [0.9, 1.1] 之間乘以
      const f = this.fluctuationPct;
      const rand = 1 + (Math.random() * 2 * f - f);

      let final = baseDamage * rand;
      let isCrit = false;
      // 新增：支援玩家天賦提供的爆擊加成或覆蓋
      const bonusCrit = options && typeof options.critChanceBonusPct === 'number' ? options.critChanceBonusPct : 0;
      const overrideCrit = options && typeof options.critChancePctOverride === 'number' ? options.critChancePctOverride : null;
      const critChance = overrideCrit != null ? overrideCrit : (this.critChanceBase + bonusCrit);
      if (allowCrit && Math.random() < Math.max(0, Math.min(1, critChance))) {
        isCrit = true;
        final *= this.critMultiplier;
      }

      // 避免浮點誤差造成顯示奇怪；對外保留整數
      const amount = Math.max(1, Math.round(final));
      
      // 計算吸血效果（不獸控制技能）
      const lifestealAmount = this._calculateLifesteal(amount, options);
      
      // 應用吸血效果（僅在本地玩家時應用，隊員端會通過enemy_damage同步）
      if (lifestealAmount > 0) {
        this._applyLifesteal(lifestealAmount, options);
      }
      
      return { amount, isCrit, lifestealAmount: lifestealAmount || 0 };
    },
    
    // 計算吸血量（不獸控制技能）
    _calculateLifesteal(damageAmount, options) {
      try {
        // 檢查玩家是否有不獸控制技能
        if (!Game || !Game.player || !Game.player.weapons) return 0;
        
        const uncontrollableBeast = Game.player.weapons.find(w => w.type === 'UNCONTROLLABLE_BEAST');
        if (!uncontrollableBeast) return 0;
        
        const cfg = uncontrollableBeast.config;
        if (!cfg) return 0;
        
        // 檢查冷卻時間（使用技能實例的冷卻追蹤）
        const now = Date.now();
        if (!uncontrollableBeast._lastLifestealTime) {
          uncontrollableBeast._lastLifestealTime = 0;
        }
        const cooldownMs = cfg.LIFESTEAL_COOLDOWN_MS || 100;
        if (now - uncontrollableBeast._lastLifestealTime < cooldownMs) {
          return 0; // 仍在冷卻中
        }
        
        // 計算吸血百分比
        const basePct = cfg.LIFESTEAL_BASE_PCT || 0.001; // 0.1%
        const perLevelPct = cfg.LIFESTEAL_PER_LEVEL || 0.001; // 每級+0.1%
        const level = uncontrollableBeast.level || 1;
        const lifestealPct = basePct + (perLevelPct * (level - 1));
        
        // 計算回復量
        const healAmount = Math.max(
          cfg.MIN_HEAL || 1, // 最低回復1HP
          Math.floor(damageAmount * lifestealPct)
        );
        
        return healAmount;
      } catch (e) {
        // 靜默失敗，不影響遊戲流程
        console.warn('[DamageSystem] Lifesteal calculation error:', e);
        return 0;
      }
    },
    
    // 應用吸血效果（不獸控制技能）
    _applyLifesteal(healAmount, options) {
      try {
        if (!Game || !Game.player || !Game.player.weapons || healAmount <= 0) return;
        
        const uncontrollableBeast = Game.player.weapons.find(w => w.type === 'UNCONTROLLABLE_BEAST');
        if (!uncontrollableBeast) return;
        
        const cfg = uncontrollableBeast.config;
        if (!cfg) return;
        
        // 應用回復
        if (Game.player.health < Game.player.maxHealth) {
          Game.player.health = Math.min(Game.player.maxHealth, Game.player.health + healAmount);
          uncontrollableBeast._lastLifestealTime = Date.now();
          
          // 更新UI
          if (typeof UI !== 'undefined' && UI.updateHealthBar) {
            UI.updateHealthBar(Game.player.health, Game.player.maxHealth);
          }
        }
      } catch (e) {
        // 靜默失敗，不影響遊戲流程
        console.warn('[DamageSystem] Lifesteal apply error:', e);
      }
    }
  };

  // 畫面傷害數字管理器
  const DamageNumbers = {
    _layer: null,
    _fontLoaded: false,
    // 新增：節流與上限，避免升級後大量命中造成 DOM 膨脹與卡頓
    _throttleMs: 120,
    _maxElements: 60,
    _lastShowByEnemy: new Map(),
    _queue: [],
    _rafScheduled: false,
    _elPool: [],

    ensureLayer(){
      if (this._layer && this._layer.isConnected) return this._layer;
      const viewport = document.getElementById('viewport');
      if (!viewport) return null;
      const layer = document.createElement('div');
      layer.id = 'damage-numbers-layer';
      layer.style.position = 'absolute';
      layer.style.left = '0';
      layer.style.top = '0';
      layer.style.width = '100%';
      layer.style.height = '100%';
      layer.style.pointerEvents = 'none';
      layer.style.zIndex = '6'; // 高於畫布、低於主 UI（如需可調整）
      viewport.appendChild(layer);
      this._layer = layer;
      return layer;
    },

    async ensureFont(){
      if (this._fontLoaded) return true;
      try {
        // 僅載入一次字體；優先使用 woff2；若失敗回退至 ttf；仍失敗則回退系統字體
        const ff = new FontFace('GenSenRounded-H', 'url(assets/fonts/GenSenRounded-H.woff2) format("woff2")');
        const loaded = await ff.load();
        document.fonts.add(loaded);
        this._fontLoaded = true;
        return true;
      } catch (e) {
        try {
          const ff2 = new FontFace('GenSenRounded-H', 'url(assets/fonts/GenSenRounded-H.ttf)');
          const loaded2 = await ff2.load();
          document.fonts.add(loaded2);
          this._fontLoaded = true;
          return true;
        } catch (e2) {
          this._fontLoaded = false;
          return false;
        }
      }
    },

    /**
     * 顯示傷害數字（映射世界→螢幕座標，考慮鏡頭與CSS縮放）
     * @param {number} value 顯示傷害值（整數）
     * @param {number} x 世界座標X（通常為敵人中心或其上方）
     * @param {number} y 世界座標Y
     * @param {boolean} isCrit 是否爆擊
     * @param {Object} [opts] 額外選項
     * @param {number} [opts.dirX] 攻擊方向X分量（任意尺度，內部正規化）
     * @param {number} [opts.dirY] 攻擊方向Y分量
     * @param {string|number} [opts.enemyId] 敵人唯一ID（用於節流）
     * 安全性與依賴：
     * - 依賴 Game.camera 與 canvas 解析度/縮放；若不可用，回退直接座標並在視窗外則跳過渲染。
     * - DOM 上限與每敵人節流避免大量同幀命中造成停滯；不影響任何數值與行為，只影響「顯示密度」。
     */
    async show(value, x, y, isCrit, opts){
      this._queue.push({ value, x, y, isCrit, opts });
      if (!this._rafScheduled) {
        this._rafScheduled = true;
        requestAnimationFrame(async () => {
          try {
            const layer = this.ensureLayer();
            if (!layer) { this._queue.length = 0; this._rafScheduled = false; return; }
            await this.ensureFont();
            // flush
            const frag = document.createDocumentFragment();
            const rectCanvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : document.getElementById('game-canvas');
            let rect = null, scaleX = 1, scaleY = 1, camX = 0, camY = 0, rotatedPortrait = false;
            const vm = (typeof Game !== 'undefined') ? Game.viewMetrics : null;
            if (vm && rectCanvas) {
              scaleX = vm.scaleX; scaleY = vm.scaleY; camX = vm.camX; camY = vm.camY; rotatedPortrait = vm.rotatedPortrait;
              rect = rectCanvas.getBoundingClientRect();
            } else if (rectCanvas) {
              rect = rectCanvas.getBoundingClientRect();
              scaleX = rect.width / rectCanvas.width;
              scaleY = rect.height / rectCanvas.height;
              camX = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0;
              camY = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0;
              rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
            }
            const vw = layer.clientWidth || (rect ? rect.width : 0);
            const vh = layer.clientHeight || (rect ? rect.height : 0);
            const now = Date.now();
            // enforce max count before adding
            const max = this._maxElements || 60;
            while (layer.childElementCount >= max) {
              if (layer.firstElementChild) layer.removeChild(layer.firstElementChild); else break;
            }
            for (let i = 0; i < this._queue.length; i++) {
              const item = this._queue[i];
              const enemyId = item.opts && item.opts.enemyId != null ? item.opts.enemyId : null;
              if (enemyId !== null) {
                const last = this._lastShowByEnemy.get(enemyId) || 0;
                if (now - last < this._throttleMs) continue;
                this._lastShowByEnemy.set(enemyId, now);
              }
              let sx = item.x, sy = item.y;
              if (rectCanvas) {
                if (rotatedPortrait) {
                  sx = item.x - camX;
                  sy = item.y - camY;
                } else {
                  sx = (item.x - camX) * scaleX;
                  sy = (item.y - camY) * scaleY;
                }
                if (sx < 0 || sy < 0 || sx > vw || sy > vh) continue;
              }
              const el = this._elPool.pop() || document.createElement('div');
              el.textContent = String(item.value);
              el.style.position = 'absolute';
              el.style.left = Math.round(sx) + 'px';
              el.style.top = Math.round(sy) + 'px';
              el.style.transform = 'translate(-50%, -50%)';
              el.style.fontFamily = this._fontLoaded ? 'GenSenRounded-H, sans-serif' : 'sans-serif';
              el.style.fontWeight = item.isCrit ? '800' : '600';
              try {
                const isMobile = (typeof window !== 'undefined') && (
                  (window.matchMedia && (window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches))
                );
                const baseSize = item.isCrit ? 34 : 28;
                const size = isMobile ? Math.round(baseSize * 0.75) : baseSize;
                el.style.fontSize = size + 'px';
              } catch (_) {
                el.style.fontSize = item.isCrit ? '34px' : '28px';
              }
              el.style.color = item.isCrit ? '#ffeb3b' : '#ffffff';
              el.style.webkitTextStroke = item.isCrit ? '1.4px #ffffff' : '1.2px #ffffff';
              const baseShadow = item.isCrit
                ? '0 0 12px rgba(255, 235, 59, 0.85), 0 0 5px rgba(255, 255, 255, 0.7)'
                : '0 0 9px rgba(255, 255, 255, 0.65)';
              const borderShadow = ', 0 0 2px #000, 1.5px 0 0 #000, -1.5px 0 0 #000, 0 1.5px 0 #000, 0 -1.5px 0 #000';
              el.style.textShadow = baseShadow + borderShadow;
              el.style.willChange = 'transform, opacity';
              frag.appendChild(el);
              const vx = item.opts && typeof item.opts.dirX === 'number' ? item.opts.dirX : 0;
              const vy = item.opts && typeof item.opts.dirY === 'number' ? item.opts.dirY : -1;
              const len = Math.hypot(vx, vy) || 1;
              const nx = vx / len;
              const ny = vy / len;
              const mag = item.isCrit ? 46 : 36;
              const dx = nx * mag;
              const dy = ny * mag;
              const duration = item.isCrit ? 2100 : 1700;
              const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
              const anim = el.animate([
                { transform: 'translate(-50%, -50%)', opacity: 1 },
                { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`, opacity: 0 }
              ], { duration, easing, fill: 'forwards' });
              anim.onfinish = () => {
                if (el && el.parentNode) el.parentNode.removeChild(el);
                this._elPool.push(el);
              };
            }
            layer.appendChild(frag);
          } finally {
            this._queue.length = 0;
            this._rafScheduled = false;
          }
        });
      }
    }
  };

  // 對外暴露
  global.DamageSystem = DamageSystem;
  global.DamageNumbers = DamageNumbers;
})(window);
