// 挑戰模式 BOSS 控制器（僅挑戰模式使用，不污染其他模式）
// 職責：維護 BOSS 狀態（位置、HP、階段）、建立/切換發射器、繪製參考光柱等視覺
(function (global) {
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  const DEFAULTS = {
    maxHealth: 100000,
    size: 140,
    moveSpeed: 1.0,
    beamWidth: 46,
    gifScale: 1.2,
    gifSize: null, // 可選：若提供 { width, height } 則以此尺寸顯示 GIF（避免變形）
    gifUrl: null, // 若提供則用 GifOverlay 疊加 BOSS 參考圖
    // 新增：挑戰模式專用 BOSS 血條設定（僅視覺，不影響其他模式）
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
      phase: 0, // 10 段：0..9（每 -10% 變更一次），<0 表示終結
      emitters: [],
      beamX: canvas.width * 0.5,
      beamWidth: cfg.beamWidth,
      gifUrl: cfg.gifUrl,
      alive: true,
      ticks: 0,
      _cooldownEffectShown: false,
      _lastOrbSpawnPhase: null,
      _gateExpSpawn: null,

      // 以百分比回傳血量
      hpPct() { return clamp((this.health / this.maxHealth) * 100, 0, 100); },

      // 依 HP 自動轉換階段（每 -10% 切換一次），加入 5 秒過渡冷卻
      updatePhase() {
        const p = this.hpPct();
        // p: 100..91 => 0, 90..81 => 1, ..., 10..1 => 9, 0 => -1
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
          // 若尚未排程或下一目標不同，重新排程並立即停用現有發射器
          if (this._pendingNextPhase !== next) {
            this._pendingNextPhase = next;
            this._phaseGateUntil = nowTs + 5000; // 5 秒過渡
            this.stopAllEmitters();
            // 冷卻期開始：觸發震動與全螢幕特效；並在此刻一次性噴出經驗球（第0階段不噴）
            if (!this._cooldownEffectShown) {
              this._cooldownEffectShown = true;
              // 只在下一階段 >= 0 時播放特效與音效（HP=0 時 next=-1，跳過）
              if (next >= 0) {
                try {
                  if (global.ChallengeGifOverlay) {
                    global.ChallengeGifOverlay.shakeViewport(18, 700);
                    global.ChallengeGifOverlay.showFullscreenCover('challenge-phase-banner', 'assets/images/challengeBOSS-1-2.gif', { opacity: 0.5, fadeInMs: 300, holdMs: 3900, fadeOutMs: 300 });
                  }
                  if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                    AudioManager.playSound('boss_cooldown');
                  }
                } catch(_) {}
              }
              // 一次性爆發：僅在下一階段 > 0 時噴出，並記錄避免重複
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
              // 移除分批噴出機制（一次性爆發）
              try { this._gateExpSpawn = null; } catch(_) {}
            }
          }
          // 過了冷卻才真正切換階段並重建發射器
          if (nowTs >= (this._phaseGateUntil || 0)) {
            this.phase = this._pendingNextPhase;
            this._pendingNextPhase = null;
            this._phaseGateUntil = 0;
            this._cooldownEffectShown = false; // 下一次切換時允許再次顯示特效
            this.onPhaseChanged();
          }
        }
      },

      // 切換階段時重建發射器（取消輪替：改為 10 段，依 HP 觸發；每段之間 5 秒 gate 已於 updatePhase() 控制）
      onPhaseChanged() {
        this.stopAllEmitters();
        const BS = global.ChallengeBulletSystem;
        if (!BS || !BS.enabled) return;

        // 保險機制：若在過渡期未成功噴球，於階段確定時補噴一次（每段最多一次；第0段不噴）
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

        // 過渡起點：用於移動平滑（避免瞬移）
        try {
          const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          this._phaseTransStartX = this.x;
          this._phaseTransStartY = this.y;
          this._phaseTransTs = nowTs;
        } catch(_) {}

        // 特效已在冷卻期開始時觸發（updatePhase 中），這裡不重複顯示

        const getPlayer = () => (global.CHALLENGE_PLAYER || null);

        // 10 段彈幕配置：前四段為基準，之後逐段放大並降低密度；最後兩段使用現有重奏模式
        if (this.phase === 0) {
          // 第0階段：EclipseRosette（月蝕花陣）——提高橢圓彈比例、縮減圓形彈比例
          const p = global.ChallengeBossPatterns.eclipseRosette({
            beatSec: 0.92,
            // 減少圓形彈數量（外/中環保留、內環取消）
            outerCount: 72,
            midCount: 50,
            innerCount: 0,
            outerSpeed: 2.7,
            midSpeed: 2.55,
            innerSpeed: 2.4,
            life: 7600,
            outerSize: 9,
            midSize: 8,
            innerSize: 7,
            rotateStepRad: 0.22
          });
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 95, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

          // 美術加強：BOSS 周圍 5 個白色光圈環繞，從光圈口吐出細長橢圓彈與最小圓彈
          const bossRef = this;
          const haloShot = function(e2, BS2){
            try {
              const dx = e2.x - bossRef.x; const dy = e2.y - bossRef.y; const base = Math.atan2(dy, dx);
              const jitter = ((Math.random() - 0.5) * 0.28);
              const ang = base + jitter;
              const sp = 2.95;
              const vx = Math.cos(ang) * sp; const vy = Math.sin(ang) * sp;
              // 兩發細長橢圓彈（提高橢圓比例）
              for (let k=0;k<2;k++){
                BS2.addBullet(e2.x, e2.y, vx, vy, 5200, 6, '#ffffff');
                const b = BS2.bullets[BS2.bullets.length - 1];
                if (b){
                  b.shape = 'ellipse'; b.rx = 16; b.ry = 3; b.orientToVel = true; b.color2 = '#e6f3ff'; b.restyleAt = 800;
                  // 粒子拖尾（流線）
                  b.trailMax = 10; b.trailIntervalMs = 42;
                }
              }
              // 同步從光圈繞射最小圓形彈（不再從BOSS中心）
              BS2.addBullet(e2.x, e2.y, vx, vy, 5000, 7, '#bfe8ff');
            } catch(_){ }
          };
          const haloCount = 5; const radius = Math.floor(Math.max(52, Math.floor(this.size * 0.42)) * 2.5);
          const orbitSpeed = 0.9; // 弧度/秒
          for (let i=0;i<haloCount;i++){
            const em2 = BS.createEmitter({ x: this.x, y: this.y, rateMs: 100, lifeMs: 0, patternFn: haloShot });
            if (em2){ em2.followBossOrbit = { radius, speed: orbitSpeed, angle0: (i/haloCount) * Math.PI * 2 }; this.emitters.push(em2); }
          }
          this._orbitStartTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();


        } else if (this.phase === 1) {
          // ======================================================
          // 立體迷宮彈幕（stereoMaze）- 從左右兩側生成，創造3D迷宮效果
          // ======================================================
          const p = global.ChallengeBossPatterns.stereoMaze({
            spawnIntervalSec: 0.92,           // 生成間隔（秒），與EclipseRosette相同
            baseSpeed: 2.4,                   // 基礎速度（較慢，參考EclipseRosette內層速度）
            life: 12000,                      // 生命周期，與EclipseRosette相同
            leftSpawnCount: 15,               // 左側同時生成數量（控制密度）
            rightSpawnCount: 15,              // 右側同時生成數量（控制密度）
            crossPattern: true,               // 是否啟用交叉模式
            crossAngle: Math.PI / 8,          // 交叉角度（22.5度）
            mazeComplexity: 3,                // 迷宮複雜度（層次數量）
            verticalOscAmp: 40,               // 垂直振盪幅度
            verticalOscFreq: 0.0018,          // 垂直振盪頻率
            horizontalDrift: 0.8,            // 水平漂移速度
            colorLeft: '#ff6b6b',            // 左側彈幕顏色
            colorRight: '#4ecdc4',           // 右側彈幕顏色
            glowIntensity: 0.6,              // 發光強度
            pulseFreq: 0.0022,               // 脈動頻率
            pulseAmp: 0.3,                   // 脈動幅度
            trailMax: 8,                     // 軌跡最大長度
            trailInterval: 60,               // 軌跡間隔
            size: 12,                        // 基礎大小
            restyleAt: 3000,                 // 換色時機
            restyleColor: '#ffffff'          // 換色目標
          });
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 120, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 2) {
          const p = global.ChallengeBossPatterns.lissajousWeave({
            count: 12, baseSpeed: 2.6, life: 8000, size: 10, color: '#66e6ff', rotateSpeed: 0.08,
            A: 48, B: 34, freqX: 0.9, freqY: 1.2, phaseY: Math.PI/3, restyleAt: 2600, restyleColor: '#ffe9a3'
          });
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 100, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);
        } else if (this.phase === 3) {
          const p = global.ChallengeBossPatterns.amuletBursts({
            burstCount: 12, baseSpeed: 2.7, life: 7500, size: 10,
            colorA: '#ff5555', colorB: '#aa66ff', oscAmpA: 22, oscAmpB: 28, oscFreqA: 0.0020, oscFreqB: 0.0016, rotateSpeed: 0.10
          });
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 110, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 4) {
         // 第4階段：RhythmLaserMaze（節奏雷射迷宮）
          const p = global.ChallengeBossPatterns.rhythmLaserMaze(getPlayer, {
            beatSec: 1.0, beamActiveSec: 1.6, rayCount: 8, ringCount: 88,
            ringGapCount: 6, ringGapWidth: 0.24, ringSpeed: 2.4, ringLife: 7000,
            ringSize: 14, beamWidth: 18, beamDamage: 26, beamColor: '#9fc7ff'
          });
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 110, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

          
        } else if (this.phase === 5) {
          // 第5階段：extremeContrastArtillery（極端反差藝術彈幕）
          const p = global.ChallengeBossPatterns.extremeContrastArtillery({
            giantBallsCount: 10,
            giantBallBaseSize: 50,
            giantBallSpeed: 1.2,
            giantBallLife: 12000,
            giantBallOuterColor: '#ffffff',
            giantBallMidColor: '#ff4444',
            giantBallInnerColor: '#000000',
            giantBallSafeRadius: 0.75,
            giantBallWarnRadius: 0.85,
            giantBallCoreRadius: 0.95,
            microBulletCount: 24,
            microBulletSize: 40,
            microBulletSpeed: 3.8,
            microBulletLife: 6800,
            microBulletColor: '#ffd700',
            microBulletColor2: '#fff8dc',
            satelliteCount: 8,
            satelliteSize: 6,
            satelliteSpeed: 3.2,
            satelliteLife: 8200,
            satelliteColor: '#87ceeb',
            satelliteColor2: '#f0f8ff',
            sparkleCount: 12,
            sparkleSize: 2,
            sparkleLife: 3000,
            sparkleColor: '#ffffff',
            rotateSpeed: 0.08,
            breatheFreq: 0.003,
            breatheAmp: 8,
            microTrailMax: 6,
            microTrailInterval: 50,
            satelliteTrailMax: 4,
            satelliteTrailInterval: 70,
            restyleAt: 3200,
            restyleColor: '#ff69b4'
          });
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 500, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 6) {
          // 第6階段：Stardust Kagura（星塵神樂）
          const p = global.ChallengeBossPatterns.stardustKagura({
            beatSec: 0.82,
            stardustArms: 2,
            stardustCount: 10,
            stardustSpeed: 2.8,
            stardustLife: 7800,
            stardustSize: 9,
            stardustColor: '#e6e6fa',
            stardustColor2: '#ffffff',
            bellCount: 6,
            bellSpeed: 3.4,
            bellLife: 6200,
            bellSize: 7,
            bellColor: '#ffd700',
            bellColor2: '#fff8dc',
            moonRingCount: 2,
            moonRingLayers: 2,
            moonRingSpeed: 2.2,
            moonRingLife: 8400,
            moonRingSize: 8,
            moonRingColor: '#87ceeb',
            moonRingColor2: '#f0f8ff',
            meteorCount: 3,
            meteorSpeed: 4.2,
            meteorLife: 5200,
            meteorSize: 12,
            meteorColor: '#b0c4de',
            meteorColor2: '#ffffff',
            rotateSpeed: 0.10,
            stardustOscAmp: 24,
            stardustOscFreq: 0.0018,
            bellOscAmp: 20,
            bellOscFreq: 0.0014,
            moonOscAmp: 16,
            moonOscFreq: 0.0010,
            restyleAt: 2600,
            restyleColor: '#ffffff',
            trailMax: 6,
            trailIntervalMs: 80,
            angularVelBase: 0.05
          });
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 150, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 7) {
          // 第7階段：SakuraStorm（櫻花風暴）
          const p = global.ChallengeBossPatterns.sakuraStorm({
            beatSec: 0.88,
            petalLayers: 3,
            petalCount: 24,
            petalSpeed: 2.6,
            petalLife: 8200,
            petalSize: 8,
            petalColor: '#ffb7c5',
            petalColor2: '#ffe4e1',
            windBladeCount: 12,
            windBladeSpeed: 3.2,
            windBladeLife: 6800,
            windBladeSize: 6,
            windBladeColor: '#87ceeb',
            windBladeColor2: '#f0f8ff',
            scatterCount: 8,
            scatterSpeed: 1.8,
            scatterLife: 5400,
            scatterSize: 5,
            scatterColor: '#ffc0cb',
            rotateSpeed: 0.12,
            petalOscAmp: 28,
            petalOscFreq: 0.0022,
            windOscAmp: 22,
            windOscFreq: 0.0018,
            scatterOscAmp: 16,
            scatterOscFreq: 0.0026,
            restyleAt: 2800,
            restyleColor: '#ffffff'
          });
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 90, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 8) {
          const p = global.ChallengeBossPatterns.amuletBursts({
            burstCount: 12, baseSpeed: 2.7, life: 7500, size: 10,
            colorA: '#ff5555', colorB: '#aa66ff', oscAmpA: 22, oscAmpB: 28, oscFreqA: 0.0020, oscFreqB: 0.0016, rotateSpeed: 0.10
          });
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 110, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else if (this.phase === 9) {
          // 第9階段：RhythmLaserMaze（節奏雷射迷宮）
          const p = global.ChallengeBossPatterns.rhythmLaserMaze(getPlayer, {
            beatSec: 1.0, beamActiveSec: 1.6, rayCount: 8, ringCount: 48,
            ringGapCount: 6, ringGapWidth: 0.24, ringSpeed: 2.4, ringLife: 7000,
            ringSize: 14, beamWidth: 18, beamDamage: 26, beamColor: '#9fc7ff'
          });
          const em = BS.createEmitter({ x: this.x, y: this.y, rateMs: 110, lifeMs: 0, patternFn: p });
          if (em) em.followBoss = true; this.emitters.push(em);

        } else {
          // 0%：停止攻擊（保留清場）
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
        // 移動行為：每階段使用固定路線；onPhaseChanged() 記錄過渡起點，這裡做 1.2s 線性過渡避免瞬移
        const W = canvas.width, H = canvas.height;
        const margX = 80, margY = 60;
        const t = this.ticks / 1000;
        // 路線定義（與原先輪替時的四條路線風格一致；後段擴大幅度）
        let rx = this.x, ry = this.y;
        switch (this.phase) {
          case 0: {
            const rX = 80, rY = 46; rx = W*0.5 + Math.cos(t*0.9)*rX; ry = H*0.38 + Math.sin(t*0.9)*rY; break;
          }
          case 1: {
            rx = W*0.5 + Math.sin(t*0.7)*140; ry = H*0.30 + Math.cos(t*0.35)*28; break;
          }
          case 2: {
            const rX = 120, rY = 38; rx = W*0.5 + Math.sin(t*0.8)*rX; ry = H*0.34 + Math.sin(t*1.2)*rY; break;
          }
          case 3: {
            const amp = 160; const tri = (x)=>{ const k=(x%(2*amp)); return k<amp?(k-amp/2):((2*amp-k)-amp/2); };
            rx = W*0.5 + tri(Math.floor(t*80)); ry = H*0.36 + Math.sin(t*0.6)*24; break;
          }
          case 4: {
            const rX = 100, rY = 56; rx = W*0.5 + Math.cos(t*0.85)*rX; ry = H*0.38 + Math.sin(t*0.85)*rY; break;
          }
          case 5: {
            rx = W*0.5 + Math.sin(t*0.65)*160; ry = H*0.30 + Math.cos(t*0.35)*32; break;
          }
          case 6: {
            const rX = 140, rY = 48; rx = W*0.5 + Math.sin(t*0.75)*rX; ry = H*0.34 + Math.sin(t*1.10)*rY; break;
          }
          case 7: {
            const amp = 180; const tri = (x)=>{ const k=(x%(2*amp)); return k<amp?(k-amp/2):((2*amp-k)-amp/2); };
            rx = W*0.5 + tri(Math.floor(t*70)); ry = H*0.36 + Math.sin(t*0.55)*26; break;
          }
          case 8: {
            const rX = 120, rY = 60; rx = W*0.5 + Math.cos(t*0.95)*rX; ry = H*0.40 + Math.sin(t*0.95)*rY; break;
          }
          case 9: {
            rx = W*0.5 + Math.sin(t*0.90)*180; ry = H*0.33 + Math.sin(t*1.25)*40; break;
          }
          default: {
            // 終段：保持原地，不再移動
            rx = this.x; ry = this.y; break;
          }
        }
        // 過渡（1.2 秒），避免換階段瞬移
        const transMs = 1200;
        const nowTs2 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const s = Math.max(0, Math.min(1, (nowTs2 - (this._phaseTransTs||nowTs2)) / transMs));
        const sx = (this._phaseTransStartX!=null?this._phaseTransStartX:this.x);
        const sy = (this._phaseTransStartY!=null?this._phaseTransStartY:this.y);
        this.x = sx * (1 - s) + rx * s;
        this.y = sy * (1 - s) + ry * s;
        this.beamX = this.x; // 光柱跟隨中心
        // 邊界保護（避免出畫面）
        this.x = clamp(this.x, margX, W - margX);
        this.y = clamp(this.y, margY, H - margY);

        // GIF 疊加（作為美術參考）：
        try {
          if (this.gifUrl && global.ChallengeGifOverlay) {
            const sz = cfg.gifSize ? cfg.gifSize : Math.floor(this.size * cfg.gifScale);
            global.ChallengeGifOverlay.showOrUpdate('challenge-boss', this.gifUrl, this.x, this.y, sz);
          }
        } catch (_) { }

        // 階段判定（若未連結傷害，仍可透過外部接口手動減血觸發）
        this.updatePhase();

        // 已移除冷卻期分批噴出邏輯（改為冷卻開始時一次性噴出）
        // 讓發射器跟隨 BOSS（僅標記 followBoss 的發射器）
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
                // 光圈與發射器繞行半徑放大 2.5 倍
                const r = e.followBossOrbit.radius || Math.floor(Math.max(52, Math.floor(this.size * 0.42)) * 2.5);
                e.x = this.x + Math.cos(a) * r;
                e.y = this.y + Math.sin(a) * r;
              }
            }
          }
        } catch(_) {}
      },

      draw(ctx2d) {
        // 已移除舊的「中心縱向光柱」視覺，改以上方居中的 BOSS 血條顯示生命值
        ctx2d.save();
        const barW = cfg.hpBarWidth;
        const barH = cfg.hpBarHeight;
        const marginTop = cfg.hpBarMarginTop;
        const cx = ctx2d.canvas.width * 0.5;
        const x = Math.floor(cx - barW / 2);
        const y = Math.floor(marginTop);
        // 背板
        ctx2d.fillStyle = 'rgba(30,30,30,0.65)';
        ctx2d.fillRect(x - 2, y - 2, barW + 4, barH + 4);
        // 邊框
        ctx2d.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx2d.lineWidth = 2;
        ctx2d.strokeRect(x - 2, y - 2, barW + 4, barH + 4);
        // 血量
        const pct = clamp(this.health / this.maxHealth, 0, 1);
        const grd = ctx2d.createLinearGradient(x, y, x + barW, y);
        grd.addColorStop(0, '#ff718a');
        grd.addColorStop(1, '#ffd1a3');
        ctx2d.fillStyle = grd;
        ctx2d.fillRect(x, y, Math.floor(barW * pct), barH);
        // 空白部分
        ctx2d.fillStyle = 'rgba(255,255,255,0.12)';
        ctx2d.fillRect(x + Math.floor(barW * pct), y, Math.floor(barW * (1 - pct)), barH);
        // 文字（簡潔，不遮擋）
        try {
          ctx2d.font = '14px sans-serif';
          ctx2d.fillStyle = 'rgba(255,255,255,0.92)';
          const txt = 'BOSS';
          const tw = ctx2d.measureText(txt).width;
          ctx2d.fillText(txt, cx - tw/2, y + barH + 14);
        } catch(_) {}
        ctx2d.restore();

        // BOSS 簡易圓形輪廓（若未疊 GIF）
        if (!this.gifUrl) {
          ctx2d.save();
          ctx2d.fillStyle = 'rgba(255,180,220,0.6)';
          ctx2d.beginPath();
          ctx2d.arc(this.x, this.y, this.size * 0.45, 0, Math.PI * 2);
          ctx2d.fill();
          ctx2d.restore();
        }

        // 白色光圈美術：五個環繞 BOSS 的光圈（與發射器軌道一致），子彈從此吐出
        try {
          const haloCount = 5; const radius = Math.floor(Math.max(52, Math.floor(this.size * 0.42)) * 2.5);
          const orbitSpeed = 0.9;
          const t0 = this._orbitStartTs || ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
          const nowT = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const dtSec = Math.max(0, (nowT - t0) / 1000);
          for (let i=0;i<haloCount;i++){
            const a = (i/haloCount) * Math.PI * 2 + orbitSpeed * dtSec;
            const hx = this.x + Math.cos(a) * radius;
            const hy = this.y + Math.sin(a) * radius;
            // 光圈視覺半徑放大 2.5 倍（原 12 → 30）
            const rg = ctx2d.createRadialGradient(hx, hy, 0, hx, hy, 30);
            rg.addColorStop(0, 'rgba(255,255,255,1)');
            rg.addColorStop(0.5, 'rgba(255,255,255,0.85)');
            rg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx2d.save();
            ctx2d.globalCompositeOperation = 'lighter';
            ctx2d.fillStyle = rg;
            ctx2d.beginPath(); ctx2d.arc(hx, hy, 30, 0, Math.PI*2); ctx2d.fill();
            ctx2d.restore();
          }
        } catch(_){ }
      },

      // 外部傷害接口（之後接玩家攻擊時呼叫）
      takeDamage(amount) {
        if (!this.alive) return;
        this.health = clamp(this.health - Math.max(0, amount || 0), 0, this.maxHealth);
        this.updatePhase();
        if (this.health <= 0) this.alive = false;
      },
    };

    return boss;
  }

  const ChallengeBoss = { create };
  global.ChallengeBoss = ChallengeBoss;
})(this);
