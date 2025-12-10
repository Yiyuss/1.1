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
      
      // 應用吸血效果（不獸控制技能）
      this._applyLifesteal(amount, options);
      
      return { amount, isCrit };
    },
    
    // 應用吸血效果（不獸控制技能）
    _applyLifesteal(damageAmount, options) {
      try {
        // 檢查玩家是否有不獸控制技能
        if (!Game || !Game.player || !Game.player.weapons) return;
        
        const uncontrollableBeast = Game.player.weapons.find(w => w.type === 'UNCONTROLLABLE_BEAST');
        if (!uncontrollableBeast) return;
        
        const cfg = uncontrollableBeast.config;
        if (!cfg) return;
        
        // 檢查冷卻時間（使用技能實例的冷卻追蹤）
        const now = Date.now();
        if (!uncontrollableBeast._lastLifestealTime) {
          uncontrollableBeast._lastLifestealTime = 0;
        }
        const cooldownMs = cfg.LIFESTEAL_COOLDOWN_MS || 100;
        if (now - uncontrollableBeast._lastLifestealTime < cooldownMs) {
          return; // 仍在冷卻中
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
        
        // 應用回復
        if (healAmount > 0 && Game.player.health < Game.player.maxHealth) {
          Game.player.health = Math.min(Game.player.maxHealth, Game.player.health + healAmount);
          uncontrollableBeast._lastLifestealTime = now;
          
          // 更新UI
          if (typeof UI !== 'undefined' && UI.updateHealthBar) {
            UI.updateHealthBar(Game.player.health, Game.player.maxHealth);
          }
        }
      } catch (e) {
        // 靜默失敗，不影響遊戲流程
        console.warn('[DamageSystem] Lifesteal error:', e);
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
      const layer = this.ensureLayer();
      if (!layer) return;
      await this.ensureFont();

      // 每敵人節流：避免同一敵人瞬間產生過多數字
      try {
        const enemyId = opts && opts.enemyId != null ? opts.enemyId : null;
        if (enemyId !== null) {
          const now = Date.now();
          const last = this._lastShowByEnemy.get(enemyId) || 0;
          if (now - last < this._throttleMs) return;
          this._lastShowByEnemy.set(enemyId, now);
        }
      } catch (_) {}

      // 世界→螢幕座標映射：扣除鏡頭偏移並考慮CSS縮放
      let sx = x, sy = y;
      try {
        const canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : document.getElementById('game-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        const camX = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0;
        const camY = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0;
        const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
        if (rotatedPortrait) {
          // 直立旋轉90°：世界→螢幕座標（與 input.js 的CW映射相反變換）
          const xPrime = x - camX;
          const yPrime = y - camY;
          // 直立旋轉：使用畫布原座標，交由 viewport 的 transform 處理縮放/旋轉
          sx = xPrime;
          sy = yPrime;
        } else {
          // 未旋轉：標準座標換算
          sx = (x - camX) * scaleX;
          sy = (y - camY) * scaleY;
        }
        // 若位於可視範圍之外，略過渲染（避免邊界外跳動）
        const vw = layer.clientWidth || rect.width;
        const vh = layer.clientHeight || rect.height;
        if (sx < 0 || sy < 0 || sx > vw || sy > vh) return;
      } catch (_) {}

      // 控制元素總量上限，避免 DOM 膨脹造成卡頓
      try {
        const max = this._maxElements || 60;
        while (layer.childElementCount >= max) {
          if (layer.firstElementChild) layer.removeChild(layer.firstElementChild);
          else break;
        }
      } catch (_) {}

      const el = document.createElement('div');
      el.textContent = String(value);
      el.style.position = 'absolute';
      el.style.left = Math.round(sx) + 'px';
      el.style.top = Math.round(sy) + 'px';
      el.style.transform = 'translate(-50%, -50%)';
      el.style.fontFamily = this._fontLoaded ? 'GenSenRounded-H, sans-serif' : 'sans-serif';
      el.style.fontWeight = isCrit ? '800' : '600';
      // 字放大：一般 28px、爆擊 34px（手機視覺適度縮小，不影響 PC）
      try {
        const isMobile = (typeof window !== 'undefined') && (
          (window.matchMedia && (window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches))
        );
        const baseSize = isCrit ? 34 : 28;
        // 手機字級再縮小：0.85 -> 0.75（僅影響手機，不動PC）
        const size = isMobile ? Math.round(baseSize * 0.75) : baseSize;
        el.style.fontSize = size + 'px';
      } catch (_) {
        el.style.fontSize = isCrit ? '34px' : '28px';
      }
      el.style.color = isCrit ? '#ffeb3b' : '#ffffff';
      // 維護註解：傷害數字邊框強化 — 先以白色較粗外框提升字重，外層保留原有「黑色細邊框」以維持對比度與可讀性
      // 依賴與安全性：
      // - 使用 `-webkit-text-stroke` 實作白色粗邊；以 `textShadow` 多方向陰影模擬外層黑色細邊框（跨瀏覽器回退）。
      // - 僅更動視覺，不改動文字內容、動畫、計算邏輯與任何數值。
      el.style.webkitTextStroke = isCrit ? '1.4px #ffffff' : '1.2px #ffffff';
      const baseShadow = isCrit
        ? '0 0 12px rgba(255, 235, 59, 0.85), 0 0 5px rgba(255, 255, 255, 0.7)'
        : '0 0 9px rgba(255, 255, 255, 0.65)';
      const borderShadow = ', 0 0 2px #000, 1.5px 0 0 #000, -1.5px 0 0 #000, 0 1.5px 0 #000, 0 -1.5px 0 #000';
      el.style.textShadow = baseShadow + borderShadow;
      el.style.willChange = 'transform, opacity';
      
      layer.appendChild(el);

      // 方向：依照攻擊向量移動；若未提供則向上
      const vx = opts && typeof opts.dirX === 'number' ? opts.dirX : 0;
      const vy = opts && typeof opts.dirY === 'number' ? opts.dirY : -1;
      const len = Math.hypot(vx, vy) || 1;
      const nx = vx / len;
      const ny = vy / len;
      // 位移量：一般 36px、爆擊 46px；不再隨機跳動
      const mag = isCrit ? 46 : 36;
      const dx = nx * mag;
      const dy = ny * mag;
      // 顯示時間加長：一般 1700ms、爆擊 2100ms
      const duration = isCrit ? 2100 : 1700;
      const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';

      const anim = el.animate([
        { transform: 'translate(-50%, -50%)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`, opacity: 0 }
      ], { duration, easing, fill: 'forwards' });

      anim.onfinish = () => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      };
    }
  };

  // 對外暴露
  global.DamageSystem = DamageSystem;
  global.DamageNumbers = DamageNumbers;
})(window);
