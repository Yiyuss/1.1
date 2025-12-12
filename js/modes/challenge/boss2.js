// 挑戰模式第2張地圖「LV2.星雲」專用BOSS控制器（完全獨立，零汙染）
// 職責：維護洛可洛斯特狀態、建立/切換發射器、繪製參考光柱等視覺
(function (global) {
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  const DEFAULTS = {
    maxHealth: 130000,
    size: 140,
    moveSpeed: 1.0,
    beamWidth: 46,
    gifScale: 1.2,
    gifSize: null,
    gifUrl: null,
    // 星雲模式專用 BOSS 血條設定（僅視覺，不影響其他模式）
    hpBarWidth: 480,
    hpBarHeight: 18,
    hpBarMarginTop: 12,
  };

  function create(ctx, options) {
    const canvas = ctx.dom.canvas;
    const cfg = Object.assign({}, DEFAULTS, options || {});
    const boss = {
      x: canvas.width * 0.5,
      y: canvas.height * 0.37,
      vx: 0,
      vy: 0,
      size: cfg.size,
      maxHealth: cfg.maxHealth,
      health: cfg.maxHealth,
      phase: 0,
      emitters: [],
      beamX: canvas.width * 0.5,
      beamWidth: cfg.beamWidth,
      gifUrl: cfg.gifUrl,
      alive: true,
      ticks: 0,
      _cooldownEffectShown: false,
      _lastOrbSpawnPhase: null,
      _gateExpSpawn: null,

      hpPct() { return clamp((this.health / this.maxHealth) * 100, 0, 100); },

      updatePhase() {
        const p = this.hpPct();
        let next = 0;
        if (p <= 0) next = -1;
        else if (p <= 10) next = 9;
        else if (p <= 20) next = 8;
        else if (p <= 30) next = 7;
        else if (p <= 40) next = 6;
        else if (p <= 50) next = 5;
        else if (p <= 60) next = 4;
        else if (p <= 70) next = 3;
        else if (p <= 80) next = 2;
        else if (p <= 90) next = 1;
        else next = 0;
        const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (next !== this.phase) {
          if (this._pendingNextPhase !== next) {
            this._pendingNextPhase = next;
            this._phaseGateUntil = nowTs + 5000;
            this.stopAllEmitters();
            if (!this._cooldownEffectShown) {
              this._cooldownEffectShown = true;
              if (next >= 0) {
                try {
                  if (global.ChallengeGifOverlay) {
                    global.ChallengeGifOverlay.shakeViewport(18, 700);
                    // 轉場改用 MP4，檔名相同：challengeBOSS-2-2.mp4
                    global.ChallengeGifOverlay.showFullscreenCover('challenge-phase-banner', 'assets/images/challengeBOSS-2-2.mp4', { opacity: 0.5, fadeInMs: 300, holdMs: 3900, fadeOutMs: 300 });
                  }
                  if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                    AudioManager.playSound('boss_cooldown');
                  }
                } catch(_) {}
              }
              try {
                if (next > 0 && this._lastOrbSpawnPhase !== next) {
                  const W = canvas.width, H = canvas.height;
                  const player = (global.CHALLENGE_PLAYER || null);
                  for (let i = 0; i < 10; i++) {
                    const px = player ? player.x : this.x;
                    const py = player ? player.y : this.y;
                    const jitter = 80;
                    const targetX = Math.max(40, Math.min(W - 40, px + (Math.random() - 0.5) * 2 * jitter));
                    const targetY = Math.max(40, Math.min(H - 40, py + (Math.random() - 0.5) * 2 * jitter));
                    const dx = targetX - this.x;
                    const dy = targetY - this.y;
                    const dist = Math.hypot(dx, dy) || 1;
                    const baseSpeed = 10 + Math.random() * 4;
                    const vx = (dx / dist) * baseSpeed;
                    const vy = (dy / dist) * baseSpeed;
                    const orb = (global.ChallengeExperience && typeof global.ChallengeExperience.spawnOrb === 'function') ? global.ChallengeExperience.spawnOrb(this.x, this.y, 10) : null;
                    if (orb && typeof orb.setLaunch === 'function') {
                      const dur = 520 + Math.random() * 280;
                      const fr = 0.965;
                      orb.setLaunch(vx, vy, dur, fr);
                    }
                  }
                  this._lastOrbSpawnPhase = next;
                }
              } catch(_) {}
              try { this._gateExpSpawn = null; } catch(_) {}
            }
          }
          if (nowTs >= (this._phaseGateUntil || 0)) {
            this.phase = this._pendingNextPhase;
            this._pendingNextPhase = null;
            this._phaseGateUntil = 0;
            this._cooldownEffectShown = false;
            this.onPhaseChanged();
          }
        }
      },

      onPhaseChanged() {
        this.stopAllEmitters();
        const BS = global.ChallengeBulletSystem;
        if (!BS || !BS.enabled) return;

        try {
          if (this.phase >= 1 && this._lastOrbSpawnPhase !== this.phase) {
            const W = canvas.width, H = canvas.height;
            for (let i = 0; i < 10; i++) {
              const targetX = Math.random() * (W - 80) + 40;
              const targetY = Math.random() * (H - 80) + 40;
              const dx = targetX - this.x;
              const dy = targetY - this.y;
              const dist = Math.hypot(dx, dy) || 1;
              const baseSpeed = 10 + Math.random() * 4;
              const vx = (dx / dist) * baseSpeed;
              const vy = (dy / dist) * baseSpeed;
                  const orb = (global.ChallengeExperience && typeof global.ChallengeExperience.spawnOrb === 'function') ? global.ChallengeExperience.spawnOrb(this.x, this.y, 10) : null;
              if (orb && typeof orb.setLaunch === 'function') {
                const dur = 600 + Math.random() * 300;
                const fr = 0.965;
                orb.setLaunch(vx, vy, dur, fr);
              }
            }
            this._lastOrbSpawnPhase = this.phase;
          }
        } catch(_) {}

        try {
          const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          this._phaseTransStartX = this.x;
          this._phaseTransStartY = this.y;
          this._phaseTransTs = nowTs;
        } catch(_) {}

        const getPlayer = () => (global.CHALLENGE_PLAYER || null);

        // 星雲地圖專屬的10種全新彈幕模式
        if (this.phase === 0) {
          // 第0階段：NebulaSpiral（星雲螺旋）- 螺旋狀星塵彈幕
          const p = global.ChallengeBossPatterns2.nebulaSpiral();
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 100, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

          // 星塵環繞特效：5個星塵光環環繞BOSS
          const bossRef = this;
          const dustShot = function(e2, BS2){
            try {
              const dx = e2.x - bossRef.x; const dy = e2.y - bossRef.y; const base = Math.atan2(dy, dx);
              const jitter = ((Math.random() - 0.5) * 0.32);
              const ang = base + jitter;
              const sp = 3.1;
              const vx = Math.cos(ang) * sp; const vy = Math.sin(ang) * sp;
              // 星塵彈
              BS2.addBullet(e2.x, e2.y, vx, vy, 5500, 7, '#f0f8ff');
              const b = BS2.bullets[BS2.bullets.length - 1];
              if (b){
                b.shape = 'ellipse'; b.rx = 14; b.ry = 4; b.orientToVel = true; b.color2 = '#e6f3ff'; b.restyleAt = 900;
                b.trailMax = 8; b.trailIntervalMs = 38;
              }
            } catch(_){ }
          };
          const haloCount = 5; const radius = Math.floor(Math.max(55, Math.floor(this.size * 0.45)) * 2.5);
          const orbitSpeed = 1.0;
          for (let i=0;i<haloCount;i++){
            const em2 = BS.createEmitter({ x: this.x, y: this.y, rateMs: 95, lifeMs: 0, patternFn: dustShot });
            if (em2){ em2.followBossOrbit = { radius, speed: orbitSpeed, angle0: (i/haloCount) * Math.PI * 2 }; this.emitters.push(em2); }
          }
          this._orbitStartTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

        } else if (this.phase === 1) {
          // 第1階段：CosmicWeb（宇宙之網）- 網狀結構彈幕
          const p = global.ChallengeBossPatterns2.cosmicWeb();
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 110, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 2) {
          // 第2階段：StellarNursery（恆星搖籃）- 星辰誕生主題
          const p = global.ChallengeBossPatterns2.stellarNursery();
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 120, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 3) {
          // 第3階段：StardustOrbit（星塵環繞）- 衛星環繞模式
          const p = global.ChallengeBossPatterns2.stardustOrbit();
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 105, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 4) {
          // 第4階段：GalacticStorm（銀河風暴）- 螺旋臂風暴
          const p = global.ChallengeBossPatterns2.galacticStorm();
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 130, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 5) {
          // 第5階段：QuantumFission（量子裂變）- 分裂重組彈幕
          const p = global.ChallengeBossPatterns2.quantumFission();
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 95, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 6) {
          // 第6階段：DarkMatterFlow（暗物質流）- 隱形威脅彈幕
          const p = global.ChallengeBossPatterns2.darkMatterFlow();
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 140, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 7) {
          // 第7階段：SupernovaChain（超新星連鎖）- 連鎖爆炸彈幕
          const p = global.ChallengeBossPatterns2.supernovaChain();
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 115, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 8) {
          // 第8階段：GravityWell（重力井）- 引力場彈幕
          const p = global.ChallengeBossPatterns2.gravityWell();
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 125, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 9) {
          // 第9階段：CelestialDance（天體之舞）- 終極華麗彈幕
          const p = global.ChallengeBossPatterns2.celestialDance();
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 135, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else {
          this.stopAllEmitters();
          this.alive = false;
        }
      },

      stopAllEmitters() {
        const BS = global.ChallengeBulletSystem;
        if (!BS) return;
        for (const e of this.emitters) { try { BS.stopEmitter(e); } catch (_) { } }
        this.emitters.length = 0;
      },

      update(dt) {
        this.ticks += dt;
        const W = canvas.width, H = canvas.height;
        const margX = 80, margY = 60;
        const t = this.ticks / 1000;
        
        let rx = this.x, ry = this.y;
        switch (this.phase) {
          case 0: {
            const rX = 85, rY = 48; rx = W*0.5 + Math.cos(t*0.95)*rX; ry = H*0.38 + Math.sin(t*0.95)*rY; break;
          }
          case 1: {
            rx = W*0.5 + Math.sin(t*0.75)*145; ry = H*0.30 + Math.cos(t*0.38)*32; break;
          }
          case 2: {
            const rX = 125, rY = 42; rx = W*0.5 + Math.sin(t*0.85)*rX; ry = H*0.34 + Math.sin(t*1.25)*rY; break;
          }
          case 3: {
            const amp = 165; const tri = (x)=>{ const k=(x%(2*amp)); return k<amp?(k-amp/2):((2*amp-k)-amp/2); };
            rx = W*0.5 + tri(Math.floor(t*85)); ry = H*0.36 + Math.sin(t*0.65)*28; break;
          }
          case 4: {
            const rX = 105, rY = 58; rx = W*0.5 + Math.cos(t*0.88)*rX; ry = H*0.38 + Math.sin(t*0.88)*rY; break;
          }
          case 5: {
            rx = W*0.5 + Math.sin(t*0.68)*165; ry = H*0.30 + Math.cos(t*0.40)*35; break;
          }
          case 6: {
            const rX = 145, rY = 52; rx = W*0.5 + Math.sin(t*0.78)*rX; ry = H*0.34 + Math.sin(t*1.15)*rY; break;
          }
          case 7: {
            const amp = 185; const tri = (x)=>{ const k=(x%(2*amp)); return k<amp?(k-amp/2):((2*amp-k)-amp/2); };
            rx = W*0.5 + tri(Math.floor(t*75)); ry = H*0.36 + Math.sin(t*0.58)*30; break;
          }
          case 8: {
            const rX = 125, rY = 62; rx = W*0.5 + Math.cos(t*0.98)*rX; ry = H*0.40 + Math.sin(t*0.98)*rY; break;
          }
          case 9: {
            rx = W*0.5 + Math.sin(t*0.92)*185; ry = H*0.33 + Math.sin(t*1.28)*42; break;
          }
          default: {
            rx = this.x; ry = this.y; break;
          }
        }
        
        const transMs = 1200;
        const nowTs2 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const s = Math.max(0, Math.min(1, (nowTs2 - (this._phaseTransTs||nowTs2)) / transMs));
        const sx = (this._phaseTransStartX!=null?this._phaseTransStartX:this.x);
        const sy = (this._phaseTransStartY!=null?this._phaseTransStartY:this.y);
        this.x = sx * (1 - s) + rx * s;
        this.y = sy * (1 - s) + ry * s;
        this.beamX = this.x;
        
        this.x = clamp(this.x, margX, W - margX);
        this.y = clamp(this.y, margY, H - margY);

        try {
          if (this.gifUrl && global.ChallengeGifOverlay) {
            const sz = cfg.gifSize ? cfg.gifSize : Math.floor(this.size * cfg.gifScale);
            global.ChallengeGifOverlay.showOrUpdate('challenge-boss2', this.gifUrl, this.x, this.y, sz);
          }
        } catch (_) { }

        this.updatePhase();

        try {
          const BS2 = global.ChallengeBulletSystem;
          if (BS2 && this.emitters && this.emitters.length) {
            for (const e of this.emitters) {
              if (!e || !e.alive) continue;
              if (e.followBoss) { e.x = this.x; e.y = this.y; }
              else if (e.followBossOrbit){
                const t0 = this._orbitStartTs || ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
                const nowT = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                const dtSec = Math.max(0, (nowT - t0) / 1000);
                const a = (e.followBossOrbit.angle0 || 0) + (e.followBossOrbit.speed || 0.8) * dtSec;
                const r = e.followBossOrbit.radius || Math.floor(Math.max(55, Math.floor(this.size * 0.45)) * 2.5);
                e.x = this.x + Math.cos(a) * r;
                e.y = this.y + Math.sin(a) * r;
              }
            }
          }
        } catch(_) {}
      },

      draw(ctx2d) {
        ctx2d.save();
        const barW = cfg.hpBarWidth;
        const barH = cfg.hpBarHeight;
        const marginTop = cfg.hpBarMarginTop;
        const cx = ctx2d.canvas.width * 0.5;
        const x = Math.floor(cx - barW / 2);
        const y = Math.floor(marginTop);
        
        ctx2d.fillStyle = 'rgba(30,30,30,0.65)';
        ctx2d.fillRect(x - 2, y - 2, barW + 4, barH + 4);
        
        ctx2d.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx2d.lineWidth = 2;
        ctx2d.strokeRect(x - 2, y - 2, barW + 4, barH + 4);
        
        const pct = clamp(this.health / this.maxHealth, 0, 1);
        const grd = ctx2d.createLinearGradient(x, y, x + barW, y);
        grd.addColorStop(0, '#9370db');
        grd.addColorStop(1, '#dda0dd');
        ctx2d.fillStyle = grd;
        ctx2d.fillRect(x, y, Math.floor(barW * pct), barH);
        
        ctx2d.fillStyle = 'rgba(255,255,255,0.12)';
        ctx2d.fillRect(x + Math.floor(barW * pct), y, Math.floor(barW * (1 - pct)), barH);
        
        try {
          ctx2d.font = '14px sans-serif';
          ctx2d.fillStyle = 'rgba(255,255,255,0.92)';
          const txt = 'BOSS';
          const tw = ctx2d.measureText(txt).width;
          ctx2d.fillText(txt, cx - tw/2, y + barH + 14);
        } catch(_) {}
        ctx2d.restore();

        if (!this.gifUrl) {
          ctx2d.save();
          ctx2d.fillStyle = 'rgba(147,112,219,0.6)';
          ctx2d.beginPath();
          ctx2d.arc(this.x, this.y, this.size * 0.45, 0, Math.PI * 2);
          ctx2d.fill();
          ctx2d.restore();
        }

        try {
          const haloCount = 5; const radius = Math.floor(Math.max(55, Math.floor(this.size * 0.45)) * 2.5);
          const orbitSpeed = 1.0;
          const t0 = this._orbitStartTs || ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
          const nowT = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const dtSec = Math.max(0, (nowT - t0) / 1000);
          for (let i=0;i<haloCount;i++){
            const a = (i/haloCount) * Math.PI * 2 + orbitSpeed * dtSec;
            const hx = this.x + Math.cos(a) * radius;
            const hy = this.y + Math.sin(a) * radius;
            const rg = ctx2d.createRadialGradient(hx, hy, 0, hx, hy, 32);
            rg.addColorStop(0, 'rgba(221,160,221,1)');
            rg.addColorStop(0.5, 'rgba(221,160,221,0.85)');
            rg.addColorStop(1, 'rgba(221,160,221,0)');
            ctx2d.save();
            ctx2d.globalCompositeOperation = 'lighter';
            ctx2d.fillStyle = rg;
            ctx2d.beginPath(); ctx2d.arc(hx, hy, 32, 0, Math.PI*2); ctx2d.fill();
            ctx2d.restore();
          }
        } catch(_){ }
      },

      takeDamage(amount) {
        if (!this.alive) return;
        this.health = clamp(this.health - Math.max(0, amount || 0), 0, this.maxHealth);
        this.updatePhase();
        if (this.health <= 0) this.alive = false;
      },
    };

    return boss;
  }

  const ChallengeBoss2 = { create };
  global.ChallengeBoss2 = ChallengeBoss2;
})(this);
