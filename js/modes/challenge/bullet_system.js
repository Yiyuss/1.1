// 挑戰模式專屬彈幕系統（僅於挑戰模式載入）
// 功能：管理子彈、發射器、更新/繪製、與玩家碰撞。避免污染生存模式。
(function(global){
  const TAU = Math.PI * 2;

  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  function now(){ return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function hexToRgb(hex){
    try {
      const h = String(hex||'').trim();
      const m = /^#?([0-9a-fA-F]{6})$/.exec(h);
      if (!m) return { r:255, g:255, b:255 };
      const v = parseInt(m[1], 16);
      return { r: (v>>16)&255, g: (v>>8)&255, b: v&255 };
    } catch(_) { return { r:255, g:255, b:255 }; }
  }
  function clampByte(n){ return Math.max(0, Math.min(255, Math.floor(n||0))); }
  function rgbToHex({r,g,b}){ return '#' + clampByte(r).toString(16).padStart(2,'0') + clampByte(g).toString(16).padStart(2,'0') + clampByte(b).toString(16).padStart(2,'0'); }
  function adjustColor(hex, factor){
    const c = hexToRgb(hex);
    const f = Number(factor);
    if (!isFinite(f) || f === 1) return rgbToHex(c);
    // f>1 變亮；f<1 變暗
    const r = clampByte(c.r * f);
    const g = clampByte(c.g * f);
    const b = clampByte(c.b * f);
    return rgbToHex({ r, g, b });
  }

  const BS = {
    enabled: true,
    bullets: [],
    friendlyBullets: [],
    lasers: [],
    emitters: [],
    _acc: 0,
    _canvas: null,
    _defaultDamage: 20,
    // 挑戰模式專用雪碧圖加載（避免污染主遊戲）
    _bulletImage: null,
    _bulletImageReady: false,
    _bulletImageLoading: false,

    init(options){
      const opts = options||{};
      this._canvas = opts.canvas || (global.Game && Game.canvas) || null;
      if (Number.isFinite(opts.defaultDamage)) this._defaultDamage = opts.defaultDamage;
      this.enabled = true;
      this.bullets.length = 0;
      this.friendlyBullets.length = 0;
      this.emitters.length = 0;
      
      // 延遲載入雪碧圖（避免阻塞初始化）
      setTimeout(() => this._ensureBulletImage(), 0);
    },

    // 確保雪碧圖已載入（延遲載入機制）
    _ensureBulletImage(){
      console.log('[ChallengeBulletSystem] _ensureBulletImage called:', {
        hasBulletImage: !!this._bulletImage,
        bulletImageLoading: this._bulletImageLoading,
        bulletImageReady: this._bulletImageReady
      });
      
      if (!this._bulletImage && !this._bulletImageLoading) {
        this._bulletImageLoading = true;
        console.log('[ChallengeBulletSystem] Starting to load bullet.png...');
        try {
          const img = new Image();
          img.onload = () => { 
            console.log('[ChallengeBulletSystem] bullet.png loaded successfully!');
            this._bulletImage = img; 
            this._bulletImageReady = true;
            this._bulletImageLoading = false;
          };
          img.onerror = (err) => { 
            this._bulletImage = null; 
            this._bulletImageReady = false;
            this._bulletImageLoading = false;
            console.warn('[ChallengeBulletSystem] Failed to load bullet.png on demand:', err);
          };
          img.src = 'assets/images/bullet.png';
        } catch (_) {
          this._bulletImage = null;
          this._bulletImageReady = false;
          this._bulletImageLoading = false;
          console.error('[ChallengeBulletSystem] Exception while loading bullet.png');
        }
      } else {
        console.log('[ChallengeBulletSystem] bullet.png already loaded or loading in progress');
      }
    },

    reset(){
      this.bullets.length = 0;
      this.friendlyBullets.length = 0;
      this.lasers.length = 0;
      // 安全停止所有發射器
      for (const e of this.emitters) { e.alive = false; }
      this.emitters.length = 0;
    },

    setEnabled(flag){ this.enabled = !!flag; },

    addBullet(x, y, vx, vy, lifeMs = 6000, size = 5, color = '#ffffff', damage){
      if (!this.enabled) return;
      const bullet = {
        x: x||0, y: y||0,
        vx: vx||0, vy: vy||0,
        age: 0, life: Math.max(1, lifeMs|0),
        size: Math.max(1, size|0), // 用於碰撞與圓形半徑（橢圓時作為最大半徑參考）
        color: String(color||'#ffffff'),
        color2: null,         // 遲滯換色（如 BDSL 的 restyle）
        restyleAt: 0,         // 換色觸發時間（毫秒）
        damage: Number.isFinite(damage) ? damage : this._defaultDamage,
        // 進階行為
        angularVel: 0,      // 子彈曲率（弧度/秒）
        speedAccel: 0,      // 速度加速度（單位/秒，沿速度方向）
        oscAxis: null,      // 'x' 或 'y'：正弦偏移軸
        oscAmp: 0,          // 正弦振幅
        oscFreq: 0,         // 正弦頻率（Hz）
        oscPhase: 0,
        // 外型擴充：支援橢圓彈與方向旋轉
        shape: 'circle',    // 'circle' | 'ellipse'
        rx: Math.max(1, size|0), // 橢圓半徑X（預設=圓半徑）
        ry: Math.max(1, size|0), // 橢圓半徑Y（預設=圓半徑）
        rotation: 0,        // 畫面旋轉（弧度）
        spinVel: 0,         // 自轉速度（弧度/秒）
        orientToVel: false, // 是否面向速度方向（適合細長橢圓）
        // 粒子拖尾（流線）：僅在 trailMax>0 時啟用，避免全彈種負擔
        trail: null,
        trailMax: 0,
        trailAcc: 0,
        trailIntervalMs: 40,
        // 雪碧圖動畫（挑戰模式專用）
        spriteAnimation: null,
        dead: false,
      };
      this.bullets.push(bullet);
      
      // Debug: Log bullet creation (only for micro bullets to avoid spam)
      if (bullet.size >= 10) {
        console.log(`[ChallengeBulletSystem] Bullet created:`, {
          size: bullet.size,
          color: bullet.color,
          hasSpriteAnimation: !!bullet.spriteAnimation,
          bulletIndex: this.bullets.length - 1,
          position: { x: bullet.x, y: bullet.y }
        });
      }
      
      // Debug: Log all bullets with sprite animation
      if (bullet.spriteAnimation && bullet.spriteAnimation.enabled) {
        console.log(`[ChallengeBulletSystem] Sprite bullet created:`, {
          size: bullet.size,
          color: bullet.color,
          spriteAnimation: bullet.spriteAnimation,
          position: { x: bullet.x, y: bullet.y }
        });
      }
      
      return bullet; // Return the bullet so patterns can modify it
    },

    // 友方子彈（玩家射擊）：只在挑戰模式使用，不影響其他模式
    addFriendlyBullet(x, y, vx, vy, lifeMs = 3000, size = 6, color = '#aaffaa', damage){
      if (!this.enabled) return null;
      const fb = {
        x: x||0, y: y||0,
        vx: vx||0, vy: vy||0,
        age: 0, life: Math.max(1, lifeMs|0),
        size: Math.max(1, size|0),
        color: String(color||'#aaffaa'),
        damage: Number.isFinite(damage) ? damage : this._defaultDamage,
        dead: false,
        homing: false,
        homingTurnRate: 0.12, // 弧度/秒
      };
      this.friendlyBullets.push(fb);
      return fb;
    },

    // 雷射（全屏線段）—僅挑戰模式用，不影響其他模式
    // options: { width, lifeMs, color, damage, fadeMs, followEmitter }
    addLaser(cx, cy, ang, options){
      if (!this.enabled) return;
      const opts = Object.assign({ width: 12, lifeMs: 1500, color: '#99bbff', damage: this._defaultDamage, fadeMs: 300, followEmitter: null }, options||{});
      this.lasers.push({
        sx: cx||0, sy: cy||0, ang: ang||0,
        width: Math.max(2, opts.width|0),
        color: String(opts.color||'#99bbff'),
        damage: Number.isFinite(opts.damage) ? opts.damage : this._defaultDamage,
        life: Math.max(1, opts.lifeMs|0),
        fadeMs: Math.max(0, opts.fadeMs|0),
        age: 0,
        dead: false,
        followEmitter: opts.followEmitter || null,
        // 動態端點（於 update 依畫布尺寸重算）
        ex: cx||0, ey: cy||0,
      });
    },

    // 建立發射器：patternFn(e, BS) 於到時被呼叫
    createEmitter({ x=0, y=0, rateMs=120, lifeMs=0, patternFn }){
      if (!this.enabled) return null;
      const e = {
        x, y,
        rate: Math.max(1, rateMs|0),
        life: Math.max(0, lifeMs|0),
        acc: 0,
        alive: true,
        patternFn: typeof patternFn === 'function' ? patternFn : null,
      };
      this.emitters.push(e);
      return e;
    },

    stopEmitter(e){ if (!e) return; e.alive = false; /* 延遲清理於更新階段 */ },

    update(dt){
      if (!this.enabled) return;
      const step = Math.max(0.001, (dt||16) / 16); // 相對於 60FPS 的時間步長
      // 更新發射器
      for (const e of this.emitters) {
        if (!e.alive) continue;
        if (e.life > 0) { e.life -= dt; if (e.life <= 0) { e.alive = false; continue; } }
        e.acc += dt;
        while (e.acc >= e.rate) {
          e.acc -= e.rate;
          try { if (e.patternFn) e.patternFn(e, this); } catch(_){}
        }
      }
      // 清理已停止的發射器
      this.emitters = this.emitters.filter(e => e.alive);

      // 更新子彈
      const bounds = this._canvas || (global.Game && Game.canvas) || null;
      const W = bounds ? bounds.width : 1280;
      const H = bounds ? bounds.height : 720;
      const margin = 64;

      for (const b of this.bullets) {
        if (b.dead) continue;
        b.age += dt;
        if (b.age >= b.life) { b.dead = true; continue; }

        // 遲滯換色：模擬 BDSL 的 restyle 行為
        if (b.color2 && b.restyleAt && b.age >= b.restyleAt) {
          b.color = b.color2; b.color2 = null; b.restyleAt = 0;
        }

        // 速度向量進階：先套用角速度，再套用沿方向加速度
        {
          let sp = Math.hypot(b.vx, b.vy) || 0;
          let ang = Math.atan2(b.vy, b.vx);
          if (b.angularVel) ang += b.angularVel * (dt/1000);
          if (b.speedAccel) sp = Math.max(0, sp + (b.speedAccel * (dt/1000)));
          b.vx = Math.cos(ang) * sp;
          b.vy = Math.sin(ang) * sp;
          // 面向速度方向 + 自轉
          if (b.orientToVel) b.rotation = ang;
          if (b.spinVel) b.rotation += b.spinVel * (dt/1000);
        }

        // 位置更新
        b.x += b.vx * step;
        b.y += b.vy * step;

        // 雪碧圖動畫更新
        if (b.spriteAnimation && b.spriteAnimation.enabled) {
          const sprite = b.spriteAnimation;
          sprite.currentFrame = (sprite.currentFrame || 0) + (sprite.speed || 0.5) * (dt / 16.67); // 標準化到60FPS
          if (sprite.currentFrame >= 60) sprite.currentFrame = 0; // 循環播放
          
          // 如果這是第一個雪碧圖子彈，確保圖片載入
          if (!this._bulletImage && !this._bulletImageLoading && !this._bulletImageReady) {
            this._ensureBulletImage();
          }
        }

        // 拖尾更新：固定取樣間隔，限制長度
        if (b.trailMax && b.trailMax > 0) {
          b.trailAcc = (b.trailAcc || 0) + dt;
          const interval = Math.max(10, b.trailIntervalMs || 40);
          if (b.trailAcc >= interval) {
            b.trailAcc -= interval;
            if (!b.trail) b.trail = [];
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > b.trailMax) b.trail.shift();
          }
        }

        // 正弦偏移：表現蛇形軌跡（不改速度，只加相位位移）
        if (b.oscAxis === 'x' || b.oscAxis === 'y') {
          b.oscPhase += TAU * (b.oscFreq || 0) * (dt/1000);
          const off = Math.sin(b.oscPhase) * (b.oscAmp || 0);
          if (b.oscAxis === 'x') b.x += off; else b.y += off;
        }

        // 出界清理
        if (b.x < -margin || b.x > W + margin || b.y < -margin || b.y > H + margin) {
          b.dead = true; continue;
        }

        // 與玩家碰撞（圓形近似）：使用挑戰模式玩家回退值 CHALLENGE_PLAYER
        try {
          const p = global.CHALLENGE_PLAYER || null;
          if (p && !global.Game?.isGameOver) {
            const dx = b.x - p.x;
            const dy = b.y - p.y;
            const pr = Math.max(6, (p.collisionRadius || 10));
            const gb = Math.max(0, (p.grazeBuffer || 0));
            const d2 = dx*dx + dy*dy;
            const pr2 = pr*pr;
            const gr = pr + gb;
            const gr2 = gr*gr;
            
            // 巨大球型寬容碰撞系統
            if (b.collisionType === 'giantBall' && b.safeRadius && b.warnRadius && b.coreRadius) {
              // 計算相對距離（考慮玩家半徑）
              const actualDist = Math.sqrt(d2);
              const bulletEffectiveRadius = (b.size || 10); // 子彈大小
              
              // 三層碰撞區域判定
              const safeBound = bulletEffectiveRadius * b.safeRadius;    // 外圈：安全（白色）
              const warnBound = bulletEffectiveRadius * b.warnRadius;    // 中圈：警告（金色）
              const coreBound = bulletEffectiveRadius * b.coreRadius;    // 內圈：危險（紫色）
              
              // 寬容碰撞：只有進入核心區域才真正受傷
              if (actualDist <= (coreBound + pr)) {
                // 核心危險區：真正受傷
                if (p.isDashing && p.invulnerabilitySource === 'dash') {
                  // 衝刺無敵：忽略傷害，保留子彈
                } else {
                  if (global.ChallengeUI && typeof global.ChallengeUI.applyDamage === 'function') {
                    try { global.ChallengeUI.applyDamage(b.damage || 1); } catch(_){}
                  }
                  b.dead = true;
                }
              } else if (actualDist <= (warnBound + pr)) {
                // 警告區域：可以擦彈但不會受傷
                const tnow = now();
                if (!b._lastGrazeAt || (tnow - b._lastGrazeAt) > 220) {
                  b._lastGrazeAt = tnow;
                  try {
                    if (global.ChallengeUI) {
                      if (typeof global.ChallengeUI.gainEnergy === 'function') global.ChallengeUI.gainEnergy(0.3); // 較少能量
                      var P = global.CHALLENGE_PLAYER || null;
                      var gx = P ? P.x : b.x;
                      var gy = P ? P.y : b.y;
                      if (typeof global.ChallengeUI.registerGraze === 'function') global.ChallengeUI.registerGraze(gx, gy);
                    }
                  } catch(_){}
                }
              } else if (actualDist <= (safeBound + pr + gb)) {
                // 安全外圈：只擦彈，完全安全
                const tnow = now();
                if (!b._lastGrazeAt || (tnow - b._lastGrazeAt) > 220) {
                  b._lastGrazeAt = tnow;
                  try {
                    if (global.ChallengeUI) {
                      if (typeof global.ChallengeUI.gainEnergy === 'function') global.ChallengeUI.gainEnergy(0.4); // 安全擦彈給較多能量
                      var P = global.CHALLENGE_PLAYER || null;
                      var gx = P ? P.x : b.x;
                      var gy = P ? P.y : b.y;
                      if (typeof global.ChallengeUI.registerGraze === 'function') global.ChallengeUI.registerGraze(gx, gy);
                    }
                  } catch(_){}
                }
              }
              // 如果距離超過安全區域，什麼都不發生（完全安全）
            } else {
              // 普通子彈的原始碰撞邏輯
              if (d2 <= pr2) {
                if (p.isDashing && p.invulnerabilitySource === 'dash') {
                  // 衝刺無敵：忽略傷害，保留子彈以維持密度
                } else {
                  if (global.ChallengeUI && typeof global.ChallengeUI.applyDamage === 'function') {
                    try { global.ChallengeUI.applyDamage(b.damage); } catch(_){}
                  }
                  b.dead = true;
                }
              } else if (d2 <= gr2) {
                // 擦彈：小幅回能量；同一顆子彈在冷卻內只計一次
                const tnow = now();
                if (!b._lastGrazeAt || (tnow - b._lastGrazeAt) > 220) {
                  b._lastGrazeAt = tnow;
                  try {
                    if (global.ChallengeUI) {
                      if (typeof global.ChallengeUI.gainEnergy === 'function') global.ChallengeUI.gainEnergy(0.6);
                      // 擦彈視覺固定於玩家位置，避免粒子漂離至子彈座標
                      var P = global.CHALLENGE_PLAYER || null;
                      var gx = P ? P.x : b.x;
                      var gy = P ? P.y : b.y;
                      if (typeof global.ChallengeUI.registerGraze === 'function') global.ChallengeUI.registerGraze(gx, gy);
                    }
                  } catch(_){}
                }
              }
            }
          }
        } catch(_){}
      }
      // 清理死亡子彈
      this.bullets = this.bullets.filter(b => !b.dead);

      // 更新友方子彈並與 BOSS 碰撞
      for (const f of this.friendlyBullets) {
        if (f.dead) continue;
        f.age += dt;
        if (f.age >= f.life) { f.dead = true; continue; }
        // 追蹤行為（若啟用）：往 BOSS 方向小幅旋轉速度向量
        if (f.homing) {
          try {
            const boss = global.CHALLENGE_BOSS || null;
            if (boss && boss.alive) {
              const ang = Math.atan2(f.vy, f.vx);
              const angTarget = Math.atan2(boss.y - f.y, boss.x - f.x);
              let d = angTarget - ang;
              while (d > Math.PI) d -= Math.PI*2;
              while (d < -Math.PI) d += Math.PI*2;
              const turn = (f.homingTurnRate || 0.12) * (dt/1000);
              const newAng = ang + Math.max(Math.min(d, turn), -turn);
              const sp = Math.hypot(f.vx, f.vy) || 0;
              f.vx = Math.cos(newAng) * sp;
              f.vy = Math.sin(newAng) * sp;
            }
          } catch(_){}
        }
        f.x += f.vx * step;
        f.y += f.vy * step;
        if (f.x < -margin || f.x > W + margin || f.y < -margin || f.y > H + margin) { f.dead = true; continue; }
        try {
          const boss = global.CHALLENGE_BOSS || null;
          if (boss && boss.alive) {
            const dx = f.x - boss.x;
            const dy = f.y - boss.y;
            const rr = (f.size||6) + Math.max(30, Math.floor((boss.size||120) * 0.4));
            if (dx*dx + dy*dy <= rr*rr) {
              if (typeof boss.takeDamage === 'function') {
                try { boss.takeDamage(f.damage); } catch(_){}
              }
              f.dead = true;
            }
          }
        } catch(_){}
      }
      this.friendlyBullets = this.friendlyBullets.filter(f => !f.dead);

      // 更新雷射（全屏線段）
      const segDist = function(px, py, x1, y1, x2, y2){
        const vx = x2 - x1, vy = y2 - y1; const len2 = vx*vx + vy*vy; if (len2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * vx + (py - y1) * vy) / len2; t = Math.max(0, Math.min(1, t));
        const qx = x1 + t*vx, qy = y1 + t*vy; return Math.hypot(px - qx, py - qy);
      };
      const maxLen = Math.sqrt(W*W + H*H) * 1.2;
      for (const L of this.lasers){
        if (L.dead) continue; L.age += dt; if (L.age >= L.life){ L.dead = true; continue; }
        // 追隨來源（例如 BOSS 中心）
        if (L.followEmitter && L.followEmitter.alive){ L.sx = L.followEmitter.x; L.sy = L.followEmitter.y; }
        // 端點重算為全屏長度
        const dx = Math.cos(L.ang), dy = Math.sin(L.ang);
        L.ex = L.sx + dx * maxLen; L.ey = L.sy + dy * maxLen;
        // 與玩家碰撞/擦彈
        try {
          const p = global.CHALLENGE_PLAYER || null;
          if (p && !global.Game?.isGameOver){
            const pr = Math.max(6, (p.collisionRadius || 10));
            const gb = Math.max(0, (p.grazeBuffer || 0));
            const d = segDist(p.x, p.y, L.sx, L.sy, L.ex, L.ey);
            const hitR = pr + (L.width||12)/2; // 線寬視為厚度
            if (d <= hitR){
              if (p.isDashing && p.invulnerabilitySource === 'dash'){
                // 衝刺無敵：忽略傷害
              } else {
                // 雷射傷害冷卻：0.3 秒觸發一次，避免秒殺
                const tnow = now();
                if (!L._lastHitAt || (tnow - L._lastHitAt) >= 300){
                  L._lastHitAt = tnow;
                  if (global.ChallengeUI && typeof global.ChallengeUI.applyDamage === 'function'){
                    try { global.ChallengeUI.applyDamage(L.damage); } catch(_){}
                  }
                }
              }
            } else if (d <= (hitR + gb)){
              const tnow = now();
              if (!L._lastGrazeAt || (tnow - L._lastGrazeAt) > 220){
                L._lastGrazeAt = tnow;
                try {
                  if (global.ChallengeUI){
                    if (typeof global.ChallengeUI.gainEnergy === 'function') global.ChallengeUI.gainEnergy(0.6);
                    const P = global.CHALLENGE_PLAYER || null; const gx = P ? P.x : L.sx; const gy = P ? P.y : L.sy;
                    if (typeof global.ChallengeUI.registerGraze === 'function') global.ChallengeUI.registerGraze(gx, gy);
                  }
                } catch(_){}
              }
            }
          }
        } catch(_){}
      }
      this.lasers = this.lasers.filter(L => !L.dead);
    },

    draw(ctx){
      if (!this.enabled || !ctx) return;
      // 保留舊 API：在單一 ctx 上畫敵人彈幕+雷射，再畫友方彈幕（同層）。
      // 挑戰模式將改用分層：drawEnemy 與 drawFriendly 分別繪製到不同 canvas。
      this.drawEnemy(ctx);
      this.drawFriendly(ctx);
    },

    // 上層：敵人彈幕與雷射（完全不透明、中心白＋漸層＋深色外框）
    drawEnemy(ctx){
      if (!this.enabled || !ctx) return;
      ctx.save();
      // 雷射先畫（位於敵彈下層，但與敵彈在同一上層 canvas）
      for (const L of this.lasers){
        const age = L.age||0, life = L.life||1; const t = Math.max(0, Math.min(1, age / Math.max(1, life)));
        const alpha = 0.9 * (1 - t);
        const w = L.width || 12;
        if (global.ChallengeLaserArt && typeof global.ChallengeLaserArt.draw === 'function'){
          try { global.ChallengeLaserArt.draw(ctx, { sx: L.sx, sy: L.sy, ex: L.ex, ey: L.ey, width: w, color: L.color, alpha: alpha }); } catch(_){ }
        } else {
          ctx.save();
          ctx.globalAlpha = alpha;
          const core = ctx.createLinearGradient(L.sx, L.sy, L.ex, L.ey);
          core.addColorStop(0, '#bfe8ff'); core.addColorStop(0.5, '#ffffff'); core.addColorStop(1, '#bfe8ff');
          ctx.strokeStyle = core; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(L.sx, L.sy); ctx.lineTo(L.ex, L.ey); ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = L.color || '#99bbff'; ctx.globalAlpha = alpha * 0.35; ctx.lineWidth = w * 1.6;
          ctx.beginPath(); ctx.moveTo(L.sx, L.sy); ctx.lineTo(L.ex, L.ey); ctx.stroke();
          const glowR = Math.max(6, w * 0.6);
          const drawGlow = (x, y) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, glowR); rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.3, 'rgba(153,204,255,0.7)'); rg.addColorStop(1, 'rgba(153,204,255,0)'); ctx.fillStyle = rg; ctx.globalAlpha = 1.0 * (alpha*0.9); ctx.beginPath(); ctx.arc(x, y, glowR, 0, TAU); ctx.fill(); };
          drawGlow(L.sx, L.sy); drawGlow(L.ex, L.ey);
          ctx.restore();
        }
      }
      // 敵人彈幕（圓形／橢圓）：中心白更大、往外同色漸層、最外層深色外框；完全不透明
      for (const b of this.bullets) {
        // Debug: Log bullet drawing (for sprite bullets to debug)
        if (b.spriteAnimation && b.spriteAnimation.enabled) {
          console.log(`[ChallengeBulletSystem] Drawing sprite bullet:`, {
            size: b.size,
            color: b.color,
            hasSpriteAnimation: !!(b.spriteAnimation && b.spriteAnimation.enabled),
            position: { x: b.x, y: b.y }
          });
        }
        
        const baseColor = b.color || '#ffffff';
        const borderColor = adjustColor(baseColor, 0.68); // 同色系略深
        const midColor = adjustColor(baseColor, 1.0);
        // 雪碧圖動畫繪製（優先處理）
        let spriteDrawn = false;
        if (b.spriteAnimation && b.spriteAnimation.enabled) {
          // Debug: Log ALL sprite bullets to see if they're being processed
          console.log(`[ChallengeBulletSystem] Processing sprite bullet (ALL):`, {
            size: b.size,
            hasSpriteAnimation: !!b.spriteAnimation,
            enabled: b.spriteAnimation.enabled,
            currentFrame: b.spriteAnimation.currentFrame,
            position: { x: b.x, y: b.y },
            color: b.color,
            bulletImageReady: this._bulletImageReady,
            bulletImage: !!this._bulletImage,
            bulletImageComplete: this._bulletImage ? this._bulletImage.complete : false,
            bulletImageLoading: this._bulletImageLoading
          });
          
          // 確保圖片已載入
          this._ensureBulletImage();
          
          // 如果圖片還沒載入好，嘗試使用主遊戲的作為備用
          let img = null;
          if (this._bulletImageReady && this._bulletImage && this._bulletImage.complete) {
            img = this._bulletImage;
          } else if (typeof Game !== 'undefined' && Game.images && Game.images.bullet && Game.images.bullet.complete) {
            img = Game.images.bullet;
          }
          
          // Log image status for sprite bullets
          console.log(`[ChallengeBulletSystem] Image status:`, {
            img: !!img,
            bulletImageReady: this._bulletImageReady,
            bulletImage: !!this._bulletImage,
            gameImages: !!(typeof Game !== 'undefined' && Game.images),
            gameBulletImage: !!(typeof Game !== 'undefined' && Game.images && Game.images.bullet)
          });
          
          if (img) {
            ctx.save();
            const sprite = b.spriteAnimation;
            const frameWidth = 32;  // 每張圖片寬度
            const frameHeight = 32; // 每張圖片高度
            const framesPerRow = 10; // 每行10張
            
            // 計算當前影格
            const currentFrame = Math.floor(sprite.currentFrame || 0) % 60;
            const row = Math.floor(currentFrame / framesPerRow); // 計算行
            const col = currentFrame % framesPerRow; // 計算列
            
            // 計算來源矩形
            const sx = col * frameWidth;
            const sy = row * frameHeight;
            
            // 計算繪製大小（保持子彈大小）
            const size = b.size || 24;
            const halfSize = size / 2;
            
            console.log(`[ChallengeBulletSystem] Drawing sprite frame:`, {
              currentFrame,
              row,
              col,
              sx,
              sy,
              drawSize: size,
              bulletX: b.x,
              bulletY: b.y,
              drawX: b.x - halfSize,
              drawY: b.y - halfSize,
              imageLoaded: !!img
            });
            
            // 繪製雪碧圖
            ctx.globalAlpha = 1.0;
            
            // 繪製雪碧圖
            ctx.drawImage(
              img,
              sx, sy, frameWidth, frameHeight,
              b.x - halfSize, b.y - halfSize, size, size
            );
            
            ctx.restore();
            
            spriteDrawn = true; // 標記已經使用雪碧圖繪製
          } else {
            // 如果圖片正在載入，可以考慮延遲繪製或顯示佔位符
            if (this._bulletImageLoading) {
              // 可以選擇繪製一個簡單的佔位符
              ctx.save();
              ctx.globalAlpha = 0.5;
              ctx.fillStyle = b.color || '#ffffff';
              ctx.beginPath();
              ctx.arc(b.x, b.y, (b.size || 10) / 2, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
              spriteDrawn = true; // 標記已經使用佔位符繪製
            } else {
              // 如果圖片完全沒有載入（包括不在載入中），則使用常規繪製
              // 這確保即使雪碧圖失效，子彈仍然可見
              console.log(`[ChallengeBulletSystem] Sprite image not available, falling back to regular drawing for size ${b.size} bullet`);
            }
          }
        }
        
        // 如果已經使用雪碧圖繪製，跳過常規繪製
        if (spriteDrawn) {
          continue;
        }
        
        // 拖尾繪製（先畫在下層，形成流線感）
        if (b.trail && b.trail.length) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const n = b.trail.length;
          for (let i = 0; i < n; i++) {
            const t = i / n; // 0..1
            const alpha = 0.35 * (1 - t);
            const px = b.trail[i].x, py = b.trail[i].y;
            const rr = Math.max(2, Math.floor(Math.min(b.rx||b.size||4, b.ry||b.size||4) * 0.8));
            const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.globalAlpha = alpha;
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(px, py, rr, 0, TAU); ctx.fill();
          }
          ctx.restore();
        }
        if (b.shape === 'ellipse') {
          const rx = Math.max(1, b.rx || b.size || 4);
          const ry = Math.max(1, b.ry || b.size || 4);
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(b.rotation || 0);
          // 線性漸層（大軸方向）中間白，兩端回到同色
          const grd = ctx.createLinearGradient(-rx, 0, rx, 0);
          grd.addColorStop(0.0, midColor);
          grd.addColorStop(0.5, '#ffffff');
          grd.addColorStop(1.0, midColor);
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = Math.max(2, Math.floor(Math.max(rx, ry) * 0.18));
          ctx.stroke();
          ctx.restore();
        } else {
          const r = b.size || 4;
          
          // 巨大球型三段色漸層支援
          if (b.collisionType === 'giantBall' && b.color2 && b.color3) {
            // 三段色漸層：外→內（白→彩→黑）或自定義
            const grd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
            
            // 外圈：白色（安全區）
            grd.addColorStop(0.00, b.color3);        // 內核心
            grd.addColorStop(0.20, b.color3);        // 內核心擴大
            grd.addColorStop(0.35, b.color2);        // 中層過渡
            grd.addColorStop(0.50, b.color2);        // 中層主要區域
            grd.addColorStop(0.65, baseColor);       // 外層開始
            grd.addColorStop(0.85, baseColor);       // 外層主要區域
            grd.addColorStop(0.95, adjustColor(baseColor, 1.2)); // 外圈高亮
            grd.addColorStop(1.00, baseColor);       // 最外邊緣
            
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(b.x, b.y, r, 0, TAU);
            ctx.fill();
            
            // 巨大球的外框：更粗更明顯
            ctx.strokeStyle = adjustColor(b.color2, 0.6);
            ctx.lineWidth = Math.max(3, Math.floor(r * 0.15));
            ctx.stroke();
            
            // 巨大球的光暈效果
            if (b.glowEffect && b.glowColor) {
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = 0.4;
              const glowGrd = ctx.createRadialGradient(b.x, b.y, r * 0.8, b.x, b.y, r * 1.4);
              glowGrd.addColorStop(0, b.glowColor);
              glowGrd.addColorStop(1, 'rgba(255,255,255,0)');
              ctx.fillStyle = glowGrd;
              ctx.beginPath();
              ctx.arc(b.x, b.y, r * 1.4, 0, TAU);
              ctx.fill();
              ctx.restore();
            }
          } else {
            // 普通子彈的原始繪製邏輯
            const grd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
            // 擴大白色核心（參考圖）：約 46% 半徑皆為白
            grd.addColorStop(0.00, '#ffffff');
            grd.addColorStop(0.46, '#ffffff');
            // 白外圈形成同色高亮環（略亮於基色）
            grd.addColorStop(0.62, adjustColor(baseColor, 1.10));
            // 外圍回到基色，同時保留厚外框
            grd.addColorStop(0.88, midColor);
            grd.addColorStop(1.00, midColor);
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(b.x, b.y, r, 0, TAU);
            ctx.fill();
            // 外框：加深同色系，避免透明邊緣
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = Math.max(2, Math.floor(r * 0.22));
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    },

    // 下層：友方（玩家）彈幕（半透明，保留原美術以避免視覺打架）
    drawFriendly(ctx){
      if (!this.enabled || !ctx) return;
      ctx.save();
      for (const f of this.friendlyBullets) {
        const r = f.size || 6;
        const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        grd.addColorStop(0, f.color);
        grd.addColorStop(0.65, f.color);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 0.45; // 半透明，避免與敵彈視覺衝突
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },
  };

  global.ChallengeBulletSystem = BS;
})(this);