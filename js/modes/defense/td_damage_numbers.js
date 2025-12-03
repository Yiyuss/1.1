/**
 * 防禦模式專用傷害數字系統
 * 
 * 維護說明：
 * - 獨立於生存模式的 DamageNumbers，避免跨模式污染
 * - 使用與生存模式相同的視覺風格，但完全獨立實現
 * - 座標轉換考慮防禦模式的相機系統（TDGame.camera）
 * - 支持爆擊顯示和方向性動畫
 * 
 * 依賴：
 * - TDGame.camera（相機系統）
 * - #game-canvas（畫布元素）
 * - #viewport（視口容器）
 * - GenSenRounded-H 字體（可選，回退至系統字體）
 */

(function(global) {
  const TDDamageNumbers = {
    _layer: null,
    _fontLoaded: false,
    // 節流與上限，避免大量命中造成 DOM 膨脹
    _throttleMs: 120,
    _maxElements: 60,
    _lastShowByEnemy: new Map(),

    ensureLayer() {
      if (this._layer && this._layer.isConnected) return this._layer;
      const viewport = document.getElementById('viewport');
      if (!viewport) return null;
      const layer = document.createElement('div');
      layer.id = 'td-damage-numbers-layer';
      layer.style.position = 'absolute';
      layer.style.left = '0';
      layer.style.top = '0';
      layer.style.width = '100%';
      layer.style.height = '100%';
      layer.style.pointerEvents = 'none';
      layer.style.zIndex = '6'; // 高於畫布、低於主 UI
      viewport.appendChild(layer);
      this._layer = layer;
      return layer;
    },

    async ensureFont() {
      if (this._fontLoaded) return true;
      try {
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
     * 顯示傷害數字（防禦模式專用）
     * @param {number} value - 傷害值（整數）
     * @param {number} worldX - 世界座標X（敵人位置）
     * @param {number} worldY - 世界座標Y
     * @param {boolean} isCrit - 是否爆擊
     * @param {Object} [opts] - 額外選項
     * @param {number} [opts.dirX] - 攻擊方向X分量
     * @param {number} [opts.dirY] - 攻擊方向Y分量
     * @param {string|number} [opts.enemyId] - 敵人唯一ID（用於節流）
     * @param {Object} [opts.camera] - TDGame 相機對象（用於座標轉換）
     */
    async show(value, worldX, worldY, isCrit, opts) {
      const layer = this.ensureLayer();
      if (!layer) return;
      await this.ensureFont();

      // 每敵人節流
      try {
        const enemyId = opts && opts.enemyId != null ? opts.enemyId : null;
        if (enemyId !== null) {
          const now = Date.now();
          const last = this._lastShowByEnemy.get(enemyId) || 0;
          if (now - last < this._throttleMs) return;
          this._lastShowByEnemy.set(enemyId, now);
        }
      } catch (_) {}

      // 世界→螢幕座標映射（考慮防禦模式相機）
      let screenX = worldX, screenY = worldY;
      try {
        const canvas = document.getElementById('game-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        
        // 使用傳入的相機或從全局獲取
        let camera = opts && opts.camera;
        if (!camera && typeof window !== 'undefined' && window.debugTDGame) {
          camera = window.debugTDGame.camera;
        }
        
        const camX = camera ? camera.x : 0;
        const camY = camera ? camera.y : 0;
        
        const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
        if (rotatedPortrait) {
          const xPrime = worldX - camX;
          const yPrime = worldY - camY;
          screenX = xPrime;
          screenY = yPrime;
        } else {
          screenX = (worldX - camX) * scaleX;
          screenY = (worldY - camY) * scaleY;
        }
        
        // 檢查是否在可視範圍內
        const vw = layer.clientWidth || rect.width;
        const vh = layer.clientHeight || rect.height;
        if (screenX < 0 || screenY < 0 || screenX > vw || screenY > vh) return;
      } catch (_) {}

      // 控制元素總量上限
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
      el.style.left = Math.round(screenX) + 'px';
      el.style.top = Math.round(screenY) + 'px';
      el.style.transform = 'translate(-50%, -50%)';
      el.style.fontFamily = this._fontLoaded ? 'GenSenRounded-H, sans-serif' : 'sans-serif';
      el.style.fontWeight = isCrit ? '800' : '600';
      
      // 字體大小（手機適配）
      try {
        const isMobile = (typeof window !== 'undefined') && (
          (window.matchMedia && (window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches))
        );
        const baseSize = isCrit ? 34 : 28;
        const size = isMobile ? Math.round(baseSize * 0.75) : baseSize;
        el.style.fontSize = size + 'px';
      } catch (_) {
        el.style.fontSize = isCrit ? '34px' : '28px';
      }
      
      el.style.color = isCrit ? '#ffeb3b' : '#ffffff';
      el.style.webkitTextStroke = isCrit ? '1.4px #ffffff' : '1.2px #ffffff';
      const baseShadow = isCrit
        ? '0 0 12px rgba(255, 235, 59, 0.85), 0 0 5px rgba(255, 255, 255, 0.7)'
        : '0 0 9px rgba(255, 255, 255, 0.65)';
      const borderShadow = ', 0 0 2px #000, 1.5px 0 0 #000, -1.5px 0 0 #000, 0 1.5px 0 #000, 0 -1.5px 0 #000';
      el.style.textShadow = baseShadow + borderShadow;
      el.style.willChange = 'transform, opacity';
      
      layer.appendChild(el);

      // 方向性動畫
      const vx = opts && typeof opts.dirX === 'number' ? opts.dirX : 0;
      const vy = opts && typeof opts.dirY === 'number' ? opts.dirY : -1;
      const len = Math.hypot(vx, vy) || 1;
      const nx = vx / len;
      const ny = vy / len;
      const mag = isCrit ? 46 : 36;
      const dx = nx * mag;
      const dy = ny * mag;
      const duration = isCrit ? 2100 : 1700;
      const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';

      const anim = el.animate([
        { transform: 'translate(-50%, -50%)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`, opacity: 0 }
      ], { duration, easing, fill: 'forwards' });

      anim.onfinish = () => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      };
    },

    /**
     * 清理所有傷害數字（用於模式切換時）
     */
    clear() {
      if (this._layer) {
        while (this._layer.firstChild) {
          this._layer.removeChild(this._layer.firstChild);
        }
      }
      this._lastShowByEnemy.clear();
    }
  };

  // 對外暴露
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TDDamageNumbers;
  } else {
    window.TDDamageNumbers = TDDamageNumbers;
  }
})(typeof window !== 'undefined' ? window : this);

