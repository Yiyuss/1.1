// 挑戰模式第3張地圖「LV3.星軌」專用彈幕樣式庫（完全獨立，零汙染）
// 用法：在挑戰模式建立發射器時傳入 patternFn（會被 BulletSystem.createEmitter 以 e.patternFn(e, BulletSystem) 呼叫）
// 注意：
// - 僅依賴 BulletSystem 與少量全域（CONFIG）；不接觸生存模式邏輯。
// - pattern 函式設計為無狀態或使用閉包承載少量狀態。
(function (global) {
  const TAU = Math.PI * 2;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // 基本工具：從中心 (cx, cy) 以角度 ang 與速度 spd 生成子彈
  function spawnDir(BS, cx, cy, ang, spd, life, size, color, damage) {
    const vx = Math.cos(ang) * spd;
    const vy = Math.sin(ang) * spd;
    BS.addBullet(cx, cy, vx, vy, life, size, color, damage);
  }

  // 基本工具：環形一次性爆裂（可留空隙）
  function spawnRing(BS, cx, cy, count, baseAng, speed, life, size, color, gapCount = 0, gapWidth = 0.15) {
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const ang = baseAng + t * TAU;
      let skip = false;
      if (gapCount > 0) {
        const step = TAU / gapCount;
        for (let g = 0; g < gapCount; g++) {
          const center = g * step;
          const d = Math.atan2(Math.sin(ang - center), Math.cos(ang - center));
          if (Math.abs(d) <= (step * gapWidth * 0.5)) { skip = true; break; }
        }
      }
      if (!skip) spawnDir(BS, cx, cy, ang, speed, life, size, color);
    }
  }

  // 第0階段：AsteroidBelt（小行星帶）- 軌道環繞模式
  function asteroidBelt(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      asteroidCount: 20,        // 小行星數量 (建議值: 12-20)
      orbitalLayers: 4,         // 軌道層數 (建議值: 2-4)
      beltWidth: 0.4,           // 小行星帶寬度 (建議值: 0.3-0.6)
      
      // ===== 發射頻率控制 =====
      orbitalInterval: 180,     // 軌道間隔毫秒 (建議值: 150-250)
      clusterProbability: 0.25, // 集群概率 (建議值: 0.15-0.35)
      
      // ===== 基礎屬性 =====
      asteroidSpeed: 3.0,       // 小行星速度 (建議值: 2.2-3.5)
      orbitalLife: 7800,        // 生命周期 (建議值: 7500-9000)
      asteroidSize: 12,         // 小行星大小 (建議值: 10-16)
      orbitalTilt: 0.15,        // 軌道傾斜 (建議值: 0.1-0.25)
      baseRadius: 70,         // 基礎半徑 (建議值: 60-80)
      
      // ===== 顏色配置 =====
      asteroidColor: '#8b7355', // 小行星棕 (主色)
      stardustColor: '#d2b48c', // 星塵棕 (延遲換色)
      meteorColor: '#ff6347',   // 流星紅 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.12,        // 旋轉速度 (建議值: 0.08-0.16)
      orbitalDrift: 0.08,       // 軌道漂移 (建議值: 0.05-0.12)
      
      // ===== 擺動效果 =====
      asteroidOscAmp: 28,       // 小行星擺動幅度 (建議值: 22-36)
      asteroidOscFreq: 0.0020,  // 小行星擺動頻率 (建議值: 0.0016-0.0026)
      
      // ===== 軌跡效果 =====
      trailMax: 8,              // 軌跡長度 (建議值: 6-12)
      trailIntervalMs: 45,      // 軌跡間隔毫秒 (建議值: 35-65)
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,        // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，模擬小行星帶軌道運動
      // 優化重點: 多層軌道結構，模擬真實小行星帶分布
      // 性能考量: 控制總子彈數量 < 50 個/幀 (16顆 × 3層)
      // 平衡性: 軌道式攻擊，可預測但密集，考驗走位
    }, options || {});

    let theta = 0;
    let timer = 0;
    return function(e, BS) {
      try {
        const orbitalPhase = Math.sin(theta * 0.4);
        timer += 16;
        if (timer >= opts.orbitalInterval) {
          timer = 0;
          for (let layer = 0; layer < opts.orbitalLayers; layer++) {
            const layerRadius = opts.baseRadius + layer * 28;
            const layerSpeed = opts.asteroidSpeed * (1 - layer * 0.08);
            const layerSize = opts.asteroidSize * (0.9 + layer * 0.1);
            for (let i = 0; i < opts.asteroidCount; i++) {
              const base = (i * TAU) / opts.asteroidCount;
              const tilt = Math.sin(i * opts.orbitalTilt + theta * 0.2) * 0.2;
              const orbitAng = base + theta * (0.6 + layer * 0.1) + tilt;
              const px = e.x + Math.cos(orbitAng) * layerRadius;
              const py = e.y + Math.sin(orbitAng) * layerRadius;
              const emitAng = orbitAng + Math.PI * 0.5;
              const vx = Math.cos(emitAng) * layerSpeed;
              const vy = Math.sin(emitAng) * layerSpeed;
              BS.addBullet(px, py, vx, vy, opts.orbitalLife, layerSize, opts.asteroidColor);
              const b = BS.bullets[BS.bullets.length - 1];
              if (b) {
                // ===== 彈幕命名和分類 =====
                b.asteroidType = 'orbital';
                b.orbitalLayer = layer;
                b.orbitalIndex = i;
                
                // ===== 形狀和外觀 =====
                b.shape = 'ellipse';
                b.rx = layerSize * 1.2;
                b.ry = layerSize * 0.8;
                b.orientToVel = true;
                
                // ===== 顏色漸變效果 =====
                b.color2 = opts.stardustColor;
                b.restyleAt = opts.orbitalLife * 0.4;
                
                // ===== 擺動效果 =====
                b.oscAxis = (i % 2 === 0) ? 'x' : 'y';
                b.oscAmp = opts.asteroidOscAmp + layer * 3;
                b.oscFreq = opts.asteroidOscFreq + i * 0.00008;
                
                // ===== 旋轉運動 =====
                b.angularVel = opts.rotateSpeed * ((i % 3 === 0) ? 1 : -1) * (0.7 + layer * 0.1);
                
                // ===== 軌跡效果 =====
                b.trailMax = opts.trailMax;
                b.trailIntervalMs = opts.trailIntervalMs;
                b.trailColor = opts.asteroidColor;
                b.orbitalTrail = true;
                
                // ===== 特殊效果標記 =====
                b.orbitalDrift = opts.orbitalDrift;
                b.beltWidth = opts.beltWidth;
                b.spaceDensity = opts.spaceDensity;
                
                // ===== 性能優化標記 =====
                b.layerRadius = layerRadius;
                b.layerSpeed = layerSpeed;
                b.tiltEffect = tilt;
              }

              // ===== 集群效果（偶發） =====
              if (Math.random() < opts.clusterProbability && i % 3 === 0) {
                const clusterCount = 3;
                for (let c = 0; c < clusterCount; c++) {
                  const clusterAngle = emitAng + (c - clusterCount / 2) * 0.4;
                  const clusterSpeed = layerSpeed * 0.8;
                  const clusterSize = layerSize * 0.6;
                  const cvx = Math.cos(clusterAngle) * clusterSpeed;
                  const cvy = Math.sin(clusterAngle) * clusterSpeed;
                  BS.addBullet(px, py, cvx, cvy, Math.floor(opts.orbitalLife * 0.7), clusterSize, opts.meteorColor);
                  const cb = BS.bullets[BS.bullets.length - 1];
                  if (cb) {
                    cb.shape = 'circle';
                    cb.clusterType = 'stardust';
                    cb.parentAsteroid = i;
                    cb.clusterIntensity = Math.abs(orbitalPhase);
                  }
                }
              }
            }
          }
        }
        theta += opts.rotateSpeed;
      } catch(_) {}
    };
  }


  // 第1階段：SolarFlare（太陽耀斑）- 爆發式彈幕
  function solarFlare(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      flareBursts: 8,           // 耀斑爆發數量 (建議值: 6-12)
      plasmaWaves: 12,          // 等離子波數量 (建議值: 8-16)
      magneticLoops: 20,         // 磁環數量 (建議值: 4-10)
      
      // ===== 發射頻率控制 =====
      flareInterval: 200,     // 耀斑間隔毫秒 (建議值: 170-260)
      waveInterval: 120,        // 波間隔毫秒 (建議值: 100-180)
      loopProbability: 0.3,   // 磁環概率 (建議值: 0.2-0.4)
      
      // ===== 基礎屬性 =====
      flareSpeed: 4.2,         // 耀斑速度 (建議值: 3.5-5.0)
      waveSpeed: 3.0,          // 波速度 (建議值: 2.5-3.8)
      loopSpeed: 2.5,          // 磁環速度 (建議值: 2.0-3.2)
      flareLife: 6800,         // 耀斑生命周期 (建議值: 6000-7500)
      waveLife: 8400,          // 波生命周期 (建議值: 7800-9000)
      loopLife: 5600,          // 磁環生命周期 (建議值: 5000-6200)
      flareSize: 16,           // 耀斑大小 (建議值: 12-20)
      waveSize: 11,            // 波大小 (建議值: 9-14)
      loopSize: 14,            // 磁環大小 (建議值: 11-17)
      flareIntensity: 0.12,    // 耀斑強度 (建議值: 0.08-0.18)
      
      // ===== 顏色配置 =====
      flareColor: '#ff4500',   // 耀斑橙紅 (主色)
      plasmaColor: '#ff6347',  // 等離子紅 (延遲換色)
      magneticColor: '#ffd700', // 磁性金 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.18,       // 旋轉速度 (建議值: 0.14-0.22)
      magneticRotation: 0.25,  // 磁性旋轉 (建議值: 0.18-0.32)
      
      // ===== 擺動效果 =====
      flareOscAmp: 32,         // 耀斑擺動幅度 (建議值: 26-40)
      flareOscFreq: 0.0024,    // 耀斑擺動頻率 (建議值: 0.0018-0.0030)
      
      // ===== 軌跡效果 =====
      trailMax: 10,            // 軌跡長度 (建議值: 8-14)
      trailIntervalMs: 25,     // 軌跡間隔毫秒 (建議值: 20-35)
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,       // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，模擬太陽耀斑爆發
      // 優化重點: 多階段爆發模式，模擬真實太陽活動
      // 性能考量: 控制總子彈數量 < 55 個/幀 (多層次爆發)
      // 平衡性: 三種攻擊模式，耀斑強度和概率可調
    }, options || {});
    
    let theta = 0;
    let flarePhase = 0;
    let flareTimer = 0;
    let waveTimer = 0;
    
    return function(e, BS) {
      try {
        flarePhase = Math.sin(theta * 0.6);
        
        // 太陽耀斑爆發 - 主要攻擊
        flareTimer += 16;
        if (flareTimer >= opts.flareInterval) {
          flareTimer = 0;
          
          for (let flare = 0; flare < opts.flareBursts; flare++) {
            const baseAngle = (flare * TAU) / opts.flareBursts;
            
            // 耀斑強度效果
            const intensityEffect = Math.sin(flare + theta * 0.3) * opts.flareIntensity;
            const flareSpeed = opts.flareSpeed * (1 + Math.abs(flarePhase) * 0.8 + Math.abs(intensityEffect) * 2);
            
            // 多方向爆發
            for (let burst = 0; burst < 3; burst++) {
              const burstAngle = baseAngle + (burst - 1) * 0.3 + theta * 0.4 + intensityEffect * 1.5;
              const burstSpeed = flareSpeed * (0.8 + burst * 0.2);
              const burstSize = opts.flareSize * (0.7 + burst * 0.2);
              
              const vx = Math.cos(burstAngle) * burstSpeed;
              const vy = Math.sin(burstAngle) * burstSpeed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.flareLife, burstSize, opts.flareColor);
              const flareBullet = BS.bullets[BS.bullets.length - 1];
              if (flareBullet) {
                flareBullet.shape = burst === 1 ? 'circle' : 'ellipse';
                flareBullet.rx = burstSize * 1.3;
                flareBullet.ry = burstSize * 0.7;
                flareBullet.orientToVel = true;
                
                flareBullet.flareType = 'solar';
                flareBullet.intensityEffect = intensityEffect;
                flareBullet.burstLevel = burst;
                flareBullet.flareIntensity = Math.abs(intensityEffect) + Math.abs(flarePhase);
                
                // 顏色漸變
                flareBullet.color2 = opts.plasmaColor;
                flareBullet.restyleAt = opts.flareLife * (0.2 + Math.abs(intensityEffect) * 0.3 + Math.abs(flarePhase) * 0.2);
                
                // 擺動效果
                flareBullet.oscAxis = (flare % 2 === 0) ? 'x' : 'y';
                flareBullet.oscAmp = opts.flareOscAmp * (1 + Math.abs(flarePhase) * 1.2 + Math.abs(intensityEffect) * 1.8);
                flareBullet.oscFreq = opts.flareOscFreq + (flare * 0.0002) + (Math.abs(flarePhase) * 0.0004) + (Math.abs(intensityEffect) * 0.0006);
                flareBullet.angularVel = opts.rotateSpeed * ((flare % 3 === 0) ? 1 : -1) * (1.0 + Math.abs(flarePhase) * 0.6 + Math.abs(intensityEffect));
                
                // 強化軌跡
                flareBullet.trailMax = opts.trailMax;
                flareBullet.trailIntervalMs = opts.trailIntervalMs;
                flareBullet.trailColor = opts.flareColor;
                flareBullet.trailIntensity = Math.abs(intensityEffect) + Math.abs(flarePhase) + 0.5;
                flareBullet.solarTrail = true;
                flareBullet.plasmaTrail = true;
                
                // 強力發光
                flareBullet.glowEffect = true;
                flareBullet.glowSize = burstSize * (2.5 + Math.abs(flarePhase) * 2 + Math.abs(intensityEffect) * 3);
                flareBullet.glowColor = opts.flareColor;
                flareBullet.glowIntensity = 0.4 + Math.abs(flarePhase) * 0.6 + Math.abs(intensityEffect) * 0.8;
                
                // 極端耀斑標記
                if (Math.abs(intensityEffect) > 0.8 * opts.flareIntensity) {
                  flareBullet.extremeFlare = true;
                  flareBullet.coronalMassEjection = true;
                  flareBullet.solarStorm = true;
                  flareBullet.energyOutput = Math.abs(intensityEffect) * 4;
                }
              }
            }
          }
        }
        
        // 等離子波發射 - 持續攻擊
        waveTimer += 16;
        if (waveTimer >= opts.waveInterval) {
          waveTimer = 0;
          
          for (let wave = 0; wave < opts.plasmaWaves; wave++) {
            const waveAngle = (wave * TAU) / opts.plasmaWaves + theta * 0.3;
            
            const waveEffect = Math.sin(wave * 0.7 + theta * 0.2) * 0.4;
            const waveSpeed = opts.waveSpeed * (1 + Math.abs(flarePhase) * 0.5 + Math.abs(waveEffect));
            
            const vx = Math.cos(waveAngle) * waveSpeed;
            const vy = Math.sin(waveAngle) * waveSpeed;
            
            const currentWaveSize = opts.waveSize * (0.8 + Math.abs(waveEffect) * 0.4);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.waveLife, currentWaveSize, opts.plasmaColor);
            const waveBullet = BS.bullets[BS.bullets.length - 1];
            if (waveBullet) {
              waveBullet.shape = 'ellipse';
              waveBullet.rx = currentWaveSize;
              waveBullet.ry = currentWaveSize * 0.8;
              waveBullet.orientToVel = true;
              
              waveBullet.waveType = 'plasma';
              waveBullet.waveEffect = waveEffect;
              waveBullet.plasmaDensity = 1 + Math.abs(waveEffect);
              
              // 顏色漸變
              waveBullet.color2 = opts.magneticColor;
              waveBullet.restyleAt = opts.waveLife * 0.6;
              
              // 較弱擺動
              waveBullet.oscAxis = (wave % 2 === 0) ? 'x' : 'y';
              waveBullet.oscAmp = opts.flareOscAmp * 0.7;
              waveBullet.oscFreq = opts.flareOscFreq * 1.1;
              waveBullet.angularVel = opts.rotateSpeed * ((wave % 3 === 0) ? 1 : -1) * 0.8;
            }
          }
        }
        
        // 磁性環結構（低概率）
        if (Math.random() < opts.loopProbability && Math.abs(flarePhase) > 0.7) {
          const loopCount = opts.magneticLoops;
          const loopDirection = Math.random() * TAU;
          
          for (let loop = 0; loop < loopCount; loop++) {
            const loopAngle = loopDirection + (loop - loopCount/2) * 0.2;
            const loopRadius = 20 + loop * 8;
            
            // 磁環的弧形發射
            for (let arc = 0; arc < 5; arc++) {
              const arcAngle = loopAngle + arc * 0.3;
              const arcSpeed = opts.loopSpeed * (1 - arc * 0.1);
              const arcSize = opts.loopSize * (0.8 + arc * 0.05);
              
              const px = e.x + Math.cos(loopAngle) * loopRadius;
              const py = e.y + Math.sin(loopAngle) * loopRadius;
              const vx = Math.cos(arcAngle) * arcSpeed;
              const vy = Math.sin(arcAngle) * arcSpeed;
              
              BS.addBullet(px, py, vx, vy, opts.loopLife, arcSize, opts.magneticColor);
              const loopBullet = BS.bullets[BS.bullets.length - 1];
              if (loopBullet) {
                loopBullet.shape = 'circle';
                loopBullet.loopType = 'magnetic';
                loopBullet.arcLevel = arc;
                loopBullet.magneticField = Math.abs(flarePhase);
                
                // 顏色漸變
                loopBullet.color2 = opts.flareColor;
                loopBullet.restyleAt = opts.loopLife * 0.3;
                
                // 磁性擺動
                loopBullet.oscAxis = (loop % 2 === 0) ? 'x' : 'y';
                loopBullet.oscAmp = opts.flareOscAmp * 0.5;
                loopBullet.oscFreq = opts.flareOscFreq * 1.5;
                loopBullet.angularVel = opts.magneticRotation * ((loop % 3 === 0) ? 1 : -1);
              }
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第2階段：MeteorShower（流星雨）- 密集傾瀉模式
  function meteorShower(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      meteorStreams: 18,        // 流星流數量 (建議值: 8-14)
      shootingStars: 18,       // 流星數量 (建議值: 12-18)
      cometTrails: 22,           // 彗星尾數量 (建議值: 6-12)
      
      // ===== 發射頻率控制 =====
      showerInterval: 140,      // 流星雨間隔毫秒 (建議值: 120-180)
      streamInterval: 80,       // 流間隔毫秒 (建議值: 60-110)
      cometProbability: 0.2,    // 彗星概率 (建議值: 0.15-0.3)
      
      // ===== 基礎屬性 =====
      meteorSpeed: 5.2,         // 流星速度 (建議值: 4.5-6.0)
      streamSpeed: 3.8,         // 流速度 (建議值: 3.2-4.5)
      cometSpeed: 4.5,          // 彗星速度 (建議值: 3.8-5.2)
      meteorLife: 6200,         // 流星生命周期 (建議值: 5500-7000)
      streamLife: 7800,         // 流生命周期 (建議值: 7200-8400)
      cometLife: 6800,          // 彗星生命周期 (建議值: 6200-7400)
      meteorSize: 9,            // 流星大小 (建議值: 7-12)
      streamSize: 7,            // 流大小 (建議值: 5-9)
      cometSize: 13,            // 彗星大小 (建議值: 11-16)
      showerIntensity: 0.15,    // 流星雨強度 (建議值: 0.1-0.2)
      
      // ===== 顏色配置 =====
      meteorColor: '#ffd700',   // 流星金 (主色)
      shootingColor: '#ffffff', // 流星白 (延遲換色)
      cometColor: '#87ceeb',    // 彗星藍 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.22,        // 旋轉速度 (建議值: 0.18-0.28)
      driftDirection: 0.08,     // 漂移方向 (建議值: 0.06-0.12)
      
      // ===== 擺動效果 =====
      meteorOscAmp: 36,         // 流星擺動幅度 (建議值: 30-44)
      meteorOscFreq: 0.0028,    // 流星擺動頻率 (建議值: 0.0022-0.0034)
      
      // ===== 軌跡效果 =====
      trailMax: 12,             // 軌跡長度 (建議值: 10-16)
      trailIntervalMs: 18,      // 軌跡間隔毫秒 (建議值: 15-25)
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,        // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，模擬流星雨傾瀉效果
      // 優化重點: 多角度流星發射，增強視覺壯觀度
      // 性能考量: 控制總子彈數量 < 65 個/幀 (密集傾瀉)
      // 平衡性: 高速密集但可預測，考驗反應速度
    }, options || {});
    
    let theta = 0;
    let showerPhase = 0;
    let showerTimer = 0;
    let streamTimer = 0;
    
    return function(e, BS) {
      try {
        showerPhase = Math.sin(theta * 0.7);
        
        // 主要流星雨 - 大規模傾瀉
        showerTimer += 16;
        if (showerTimer >= opts.showerInterval) {
          showerTimer = 0;
          
          const showerDirection = Math.random() * TAU;
          
          for (let meteor = 0; meteor < opts.shootingStars; meteor++) {
            // 流星雨特有的角度分布
            const angleSpread = (meteor - opts.shootingStars/2) * 0.2;
            const meteorAngle = showerDirection + angleSpread + theta * 0.2;
            
            // 速度變化範圍大
            const speedVariation = Math.random() * 0.6 + 0.7;
            const meteorSpeed = opts.meteorSpeed * speedVariation;
            
            const vx = Math.cos(meteorAngle) * meteorSpeed;
            const vy = Math.sin(meteorAngle) * meteorSpeed;
            
            const currentMeteorSize = opts.meteorSize * (0.8 + Math.random() * 0.4);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.meteorLife, currentMeteorSize, opts.meteorColor);
            const meteorBullet = BS.bullets[BS.bullets.length - 1];
            if (meteorBullet) {
              meteorBullet.shape = 'ellipse';
              meteorBullet.rx = currentMeteorSize * 1.8;
              meteorBullet.ry = currentMeteorSize * 0.6;
              meteorBullet.orientToVel = true;
              
              meteorBullet.meteorType = 'shooting';
              meteorBullet.speedVariation = speedVariation;
              meteorBullet.angleSpread = angleSpread;
              meteorBullet.showerIntensity = Math.abs(showerPhase) + speedVariation;
              
              // 顏色漸變
              meteorBullet.color2 = opts.shootingColor;
              meteorBullet.restyleAt = opts.meteorLife * 0.3;
              
              // 強化擺動（高速運動）
              meteorBullet.oscAxis = 'both';
              meteorBullet.oscAmp = opts.meteorOscAmp * (1 + Math.abs(showerPhase) * 1.2 + speedVariation * 0.8);
              meteorBullet.oscFreq = opts.meteorOscFreq + (meteor * 0.00015) + (Math.abs(showerPhase) * 0.0003) + (speedVariation * 0.0002);
              meteorBullet.angularVel = opts.rotateSpeed * 1.5 * (Math.random() > 0.5 ? 1 : -1);
              
              // 強化軌跡（極長很壯觀）
              meteorBullet.trailMax = opts.trailMax + Math.floor(speedVariation * 3);
              meteorBullet.trailIntervalMs = opts.trailIntervalMs - Math.floor(speedVariation * 5);
              meteorBullet.trailColor = opts.meteorColor;
              meteorBullet.trailIntensity = 0.8 + speedVariation * 0.5 + Math.abs(showerPhase) * 0.3;
              meteorBullet.meteorTrail = true;
              meteorBullet.brilliantTrail = true;
              
              // 強力發光
              meteorBullet.glowEffect = true;
              meteorBullet.glowSize = currentMeteorSize * (3 + Math.abs(showerPhase) * 2 + speedVariation * 2);
              meteorBullet.glowColor = opts.meteorColor;
              meteorBullet.glowIntensity = 0.5 + Math.abs(showerPhase) * 0.5 + speedVariation * 0.4;
              
              // 極端流星標記
              if (speedVariation > 1.4 || Math.abs(showerPhase) > 0.8) {
                meteorBullet.extremeMeteor = true;
                meteorBullet.fireball = true;
                meteorBullet.cosmicSpectacle = true;
                meteorBullet.energyOutput = speedVariation * 3;
              }
            }
          }
        }
        
        // 流星流 - 持續攻擊
        streamTimer += 16;
        if (streamTimer >= opts.streamInterval) {
          streamTimer = 0;
          
          for (let stream = 0; stream < opts.meteorStreams; stream++) {
            const streamAngle = (stream * TAU) / opts.meteorStreams + theta * 0.4;
            
            const streamEffect = Math.sin(stream * 0.8 + theta * 0.15) * 0.3;
            const streamSpeed = opts.streamSpeed * (1 + Math.abs(showerPhase) * 0.4 + Math.abs(streamEffect));
            
            // 漂移效果
            const driftEffect = Math.sin(stream * opts.driftDirection + theta * 0.1) * 0.2;
            const finalAngle = streamAngle + driftEffect;
            
            const vx = Math.cos(finalAngle) * streamSpeed;
            const vy = Math.sin(finalAngle) * streamSpeed;
            
            const currentStreamSize = opts.streamSize * (0.9 + Math.abs(streamEffect) * 0.3);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.streamLife, currentStreamSize, opts.shootingColor);
            const streamBullet = BS.bullets[BS.bullets.length - 1];
            if (streamBullet) {
              streamBullet.shape = 'circle';
              streamBullet.streamType = 'meteor';
              streamBullet.streamEffect = streamEffect;
              streamBullet.driftEffect = driftEffect;
              
              // 顏色漸變
              streamBullet.color2 = opts.meteorColor;
              streamBullet.restyleAt = opts.streamLife * 0.5;
              
              // 中等擺動
              streamBullet.oscAxis = (stream % 2 === 0) ? 'x' : 'y';
              streamBullet.oscAmp = opts.meteorOscAmp * 0.8;
              streamBullet.oscFreq = opts.meteorOscFreq * 1.2;
              streamBullet.angularVel = opts.rotateSpeed * ((stream % 3 === 0) ? 1 : -1);
            }
          }
        }
        
        // 彗星特效（低概率）
        if (Math.random() < opts.cometProbability && Math.abs(showerPhase) > 0.6) {
          const cometCount = opts.cometTrails;
          const cometDirection = Math.random() * TAU;
          
          for (let comet = 0; comet < cometCount; comet++) {
            const cometAngle = cometDirection + (comet - cometCount/2) * 0.3;
            
            // 彗星特有的長尾效果
            const tailLength = 3 + Math.floor(Math.random() * 3);
            const cometSpeed = opts.cometSpeed * (0.9 + Math.random() * 0.2);
            
            for (let tail = 0; tail < tailLength; tail++) {
              const tailDelay = tail * 100; // 延遲發射
              const tailAngle = cometAngle + tail * 0.1;
              const tailSpeed = cometSpeed * (1 - tail * 0.1);
              const tailSize = opts.cometSize * (1 - tail * 0.15);
              
              // 延遲發射模擬彗星尾
              setTimeout(() => {
                const vx = Math.cos(tailAngle) * tailSpeed;
                const vy = Math.sin(tailAngle) * tailSpeed;
                
                BS.addBullet(e.x, e.y, vx, vy, opts.cometLife * (1 - tail * 0.1), tailSize, opts.cometColor);
                const cometBullet = BS.bullets[BS.bullets.length - 1];
                if (cometBullet) {
                  cometBullet.shape = 'ellipse';
                  cometBullet.rx = tailSize * 2;
                  cometBullet.ry = tailSize * 0.5;
                  cometBullet.orientToVel = true;
                  cometBullet.cometType = 'tail';
                  cometBullet.tailPosition = tail;
                  cometBullet.cometIntensity = Math.abs(showerPhase);
                }
              }, tailDelay);
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第3階段：NebulaPulse（星雲脈衝）- 擴散收縮模式
  function nebulaPulse(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      pulseRings: 12,            // 脈衝環數量 (建議值: 4-8)
      nebulaParticles: 20,      // 星雲粒子數量 (建議值: 10-16)
      stellarWaves: 20,           // 恆星波數量 (建議值: 6-12)
      
      // ===== 發射頻率控制 =====
      pulseInterval: 250,       // 脈衝間隔毫秒 (建議值: 220-320)
      particleInterval: 160,    // 粒子間隔毫秒 (建議值: 140-220)
      waveProbability: 0.35,    // 恆星波概率 (建議值: 0.25-0.45)
      
      // ===== 基礎屬性 =====
      pulseSpeed: 3.5,          // 脈衝速度 (建議值: 2.8-4.2)
      particleSpeed: 2.8,       // 粒子速度 (建議值: 2.2-3.5)
      waveSpeed: 4.2,           // 波速度 (建議值: 3.5-5.0)
      pulseLife: 7600,          // 脈衝生命周期 (建議值: 7000-8200)
      particleLife: 8800,       // 粒子生命周期 (建議值: 8200-9400)
      waveLife: 6400,           // 波生命周期 (建議值: 5800-7000)
      pulseSize: 14,            // 脈衝大小 (建議值: 11-17)
      particleSize: 9,          // 粒子大小 (建議值: 7-12)
      waveSize: 11,             // 波大小 (建議值: 9-14)
      expansionRate: 0.12,      // 擴張速率 (建議值: 0.08-0.18)
      contractionRate: 0.08,    // 收縮速率 (建議值: 0.06-0.12)
      
      // ===== 顏色配置 =====
      nebulaColor: '#9370db',   // 星雲紫 (主色)
      pulseColor: '#dda0dd',    // 脈衝粉紫 (延遲換色)
      stellarColor: '#ffd700',  // 恆星金 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.15,        // 旋轉速度 (建議值: 0.12-0.20)
      pulsePhaseSpeed: 0.09,    // 脈衝相位速度 (建議值: 0.07-0.13)
      
      // ===== 擺動效果 =====
      nebulaOscAmp: 30,         // 星雲擺動幅度 (建議值: 24-38)
      nebulaOscFreq: 0.0022,   // 星雲擺動頻率 (建議值: 0.0018-0.0028)
      
      // ===== 軌跡效果 =====
      trailMax: 9,              // 軌跡長度 (建議值: 7-13)
      trailIntervalMs: 35,      // 軌跡間隔毫秒 (建議值: 30-50)
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,        // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，模擬星雲脈衝擴張收縮
      // 優化重點: 周期性擴張收縮，模擬星雲呼吸節奏
      // 性能考量: 控制總子彈數量 < 60 個/幀 (多層次脈衝)
      // 平衡性: 節奏性攻擊，擴張收縮週期可調
    }, options || {});
    
    let theta = 0;
    let pulsePhase = 0;
    let expansionPhase = 0;
    let pulseTimer = 0;
    let particleTimer = 0;
    
    return function(e, BS) {
      try {
        pulsePhase = Math.sin(theta * 0.5);
        expansionPhase = Math.sin(theta * 0.3); // 擴張收縮相位
        
        // 主要脈衝環 - 週期性擴張
        pulseTimer += 16;
        if (pulseTimer >= opts.pulseInterval) {
          pulseTimer = 0;
          
          for (let ring = 0; ring < opts.pulseRings; ring++) {
            const baseAngle = (ring * TAU) / opts.pulseRings;
            
            // 擴張/收縮效果
            const expansionEffect = Math.sin(ring * 0.8 + theta * 0.4) * opts.expansionRate;
            const contractionEffect = Math.cos(ring * 1.2 + theta * 0.6) * opts.contractionRate;
            
            const pulseRadius = 15 + ring * 12; // 不同半徑的脈衝環
            const pulseSpeed = opts.pulseSpeed * (1 + expansionEffect * 2 - contractionEffect);
            
            // 脈衝環的發射
            for (let pulse = 0; pulse < 8; pulse++) { // 每環8個發射點
              const pulseAngle = baseAngle + pulse * (TAU / 8) + theta * 0.2;
              
              const px = e.x + Math.cos(baseAngle) * pulseRadius / Math.max(0.1, opts.spaceDensity);
              const py = e.y + Math.sin(baseAngle) * pulseRadius / Math.max(0.1, opts.spaceDensity);
              
              // 向外擴張的發射角度
              const expansionAngle = pulseAngle + expansionEffect * 2;
              const vx = Math.cos(expansionAngle) * pulseSpeed;
              const vy = Math.sin(expansionAngle) * pulseSpeed;
              
              const currentPulseSize = opts.pulseSize * (1 + expansionEffect * 0.6);
              
              BS.addBullet(px, py, vx, vy, opts.pulseLife, currentPulseSize, opts.pulseColor);
              const pulseBullet = BS.bullets[BS.bullets.length - 1];
              if (pulseBullet) {
                pulseBullet.shape = 'circle';
                pulseBullet.pulseType = 'expansion';
                pulseBullet.expansionEffect = expansionEffect;
                pulseBullet.contractionEffect = contractionEffect;
                pulseBullet.pulseIntensity = Math.abs(expansionEffect) + Math.abs(contractionEffect);
                
                // 顏色漸變
                pulseBullet.color2 = opts.nebulaColor;
                pulseBullet.restyleAt = opts.pulseLife * (0.3 + Math.abs(expansionEffect) * 0.2 + Math.abs(pulsePhase) * 0.15);
                
                // 擺動效果
                pulseBullet.oscAxis = (ring % 2 === 0) ? 'x' : 'y';
                pulseBullet.oscAmp = opts.nebulaOscAmp * (1 + Math.abs(pulsePhase) * 0.8 + Math.abs(expansionEffect) * 1.2);
                pulseBullet.oscFreq = opts.nebulaOscFreq + (ring * 0.0002) + (Math.abs(pulsePhase) * 0.0003) + (Math.abs(expansionEffect) * 0.0004);
                pulseBullet.angularVel = opts.rotateSpeed * ((ring % 3 === 0) ? 1 : -1) * (0.8 + Math.abs(expansionEffect) * 0.5);
                
                // 特殊軌跡
                pulseBullet.trailMax = opts.trailMax;
                pulseBullet.trailIntervalMs = opts.trailIntervalMs;
                pulseBullet.trailColor = opts.pulseColor;
                pulseBullet.trailIntensity = Math.abs(expansionEffect) + Math.abs(pulsePhase) + 0.4;
                pulseBullet.pulseTrail = true;
                pulseBullet.expansionTrail = true;
                
                // 脈衝發光
                pulseBullet.glowEffect = true;
                pulseBullet.glowSize = currentPulseSize * (2 + Math.abs(pulsePhase) * 1.5 + Math.abs(expansionEffect) * 2.5);
                pulseBullet.glowColor = opts.pulseColor;
                pulseBullet.glowIntensity = 0.4 + Math.abs(pulsePhase) * 0.4 + Math.abs(expansionEffect) * 0.6;
                
                // 極端脈衝標記
                if (Math.abs(expansionEffect) > 0.7 * opts.expansionRate) {
                  pulseBullet.extremePulse = true;
                  pulseBullet.nebulaBurst = true;
                  pulseBullet.stellarExpansion = true;
                  pulseBullet.energyOutput = Math.abs(expansionEffect) * 5;
                }
              }
            }
          }
        }
        
        // 星雲粒子發射 - 持續填充
        particleTimer += 16;
        if (particleTimer >= opts.particleInterval) {
          particleTimer = 0;
          
          for (let particle = 0; particle < opts.nebulaParticles; particle++) {
            const particleAngle = (particle * TAU) / opts.nebulaParticles + theta * 0.3;
            
            const particleEffect = Math.sin(particle * 0.6 + theta * 0.2) * 0.25;
            const particleSpeed = opts.particleSpeed * (1 + Math.abs(pulsePhase) * 0.4 + Math.abs(particleEffect));
            
            // 隨機偏移模擬星雲擴散
            const randomOffset = (Math.random() - 0.5) * 0.3;
            const finalAngle = particleAngle + randomOffset + particleEffect;
            
            const vx = Math.cos(finalAngle) * particleSpeed;
            const vy = Math.sin(finalAngle) * particleSpeed;
            
            const currentParticleSize = opts.particleSize * (0.8 + Math.abs(particleEffect) * 0.6);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.particleLife, currentParticleSize, opts.nebulaColor);
            const particleBullet = BS.bullets[BS.bullets.length - 1];
            if (particleBullet) {
              particleBullet.shape = Math.abs(particleEffect) > 0.15 ? 'ellipse' : 'circle';
              particleBullet.rx = currentParticleSize;
              particleBullet.ry = currentParticleSize * (1 - Math.abs(particleEffect) * 0.2);
              particleBullet.orientToVel = Math.abs(particleEffect) > 0.12;
              
              particleBullet.particleType = 'nebula';
              particleBullet.particleEffect = particleEffect;
              particleBullet.randomOffset = randomOffset;
              particleBullet.nebulaDensity = 1 + Math.abs(particleEffect);
              
              // 顏色漸變
              particleBullet.color2 = opts.pulseColor;
              particleBullet.restyleAt = opts.particleLife * 0.6;
              
              // 較弱擺動
              particleBullet.oscAxis = (particle % 2 === 0) ? 'x' : 'y';
              particleBullet.oscAmp = opts.nebulaOscAmp * 0.7;
              particleBullet.oscFreq = opts.nebulaOscFreq * 1.1;
              particleBullet.angularVel = opts.rotateSpeed * ((particle % 3 === 0) ? 1 : -1) * 0.9;
            }
          }
        }
        
        // 恆星波特效（中等概率）
        if (Math.random() < opts.waveProbability && Math.abs(expansionPhase) > 0.5) {
          const waveCount = opts.stellarWaves;
          const waveDirection = Math.random() * TAU;
          
          for (let wave = 0; wave < waveCount; wave++) {
            const waveAngle = waveDirection + (wave - waveCount/2) * 0.4;
            
            const waveEffect = Math.sin(wave * 1.2 + theta * 0.3) * 0.4;
            const waveSpeed = opts.waveSpeed * (1 + Math.abs(expansionPhase) * 0.6 + Math.abs(waveEffect));
            
            const vx = Math.cos(waveAngle) * waveSpeed;
            const vy = Math.sin(waveAngle) * waveSpeed;
            
            const currentWaveSize = opts.waveSize * (1 + Math.abs(waveEffect) * 0.5);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.waveLife, currentWaveSize, opts.stellarColor);
            const waveBullet = BS.bullets[BS.bullets.length - 1];
            if (waveBullet) {
              waveBullet.shape = 'ellipse';
              waveBullet.rx = currentWaveSize * 1.5;
              waveBullet.ry = currentWaveSize * 0.8;
              waveBullet.orientToVel = true;
              
              waveBullet.waveType = 'stellar';
              waveBullet.waveEffect = waveEffect;
              waveBullet.stellarIntensity = Math.abs(expansionPhase) + Math.abs(waveEffect);
              
              // 顏色漸變
              waveBullet.color2 = opts.pulseColor;
              waveBullet.restyleAt = opts.waveLife * 0.4;
              
              // 強化軌跡
              waveBullet.trailMax = opts.trailMax + 1;
              waveBullet.trailIntervalMs = opts.trailIntervalMs - 5;
              waveBullet.trailColor = opts.stellarColor;
              waveBullet.trailIntensity = 0.7 + Math.abs(waveEffect);
              waveBullet.stellarTrail = true;
              
              // 強化發光
              waveBullet.glowEffect = true;
              waveBullet.glowSize = currentWaveSize * 2.5;
              waveBullet.glowColor = opts.stellarColor;
              waveBullet.glowIntensity = 0.6 + Math.abs(waveEffect) * 0.4;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第4階段：CometTrail（彗星軌跡）- 尾隨追蹤模式
  function cometTrail(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      cometCores: 8,            // 彗星核心數量 (建議值: 4-8)
      tailSegments: 14,         // 尾段數量 (建議值: 8-14)
      orbitalFragments: 16,     // 軌道碎片數量 (建議值: 8-16)
      
      // ===== 發射頻率控制 =====
      cometInterval: 280,       // 彗星間隔毫秒 (建議值: 240-340)
      tailInterval: 60,         // 尾段間隔毫秒 (建議值: 40-80)
      fragmentProbability: 0.4, // 碎片概率 (建議值: 0.3-0.5)
      
      // ===== 基礎屬性 =====
      cometSpeed: 3.8,          // 彗星速度 (建議值: 3.2-4.5)
      tailSpeed: 2.2,           // 尾段速度 (建議值: 1.8-2.8)
      fragmentSpeed: 3.5,       // 碎片速度 (建議值: 2.8-4.2)
      cometLife: 9200,          // 彗星生命周期 (建議值: 8500-10000)
      tailLife: 6800,           // 尾段生命周期 (建議值: 6200-7400)
      fragmentLife: 6500,       // 碎片生命周期 (建議值: 5000-6200)
      cometSize: 20,            // 彗星大小 (建議值: 13-19)
      tailSize: 13,              // 尾段大小 (建議值: 6-10)
      fragmentSize: 15,         // 碎片大小 (建議值: 8-12)
      tailPersistence: 0.95,   // 尾段持久性 (建議值: 0.75-0.95)
      
      // ===== 顏色配置 =====
      cometColor: '#87ceeb',    // 彗星藍 (主色)
      tailColor: '#4169e1',     // 尾段藍 (延遲換色)
      fragmentColor: '#ffd700', // 碎片金 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.16,        // 旋轉速度 (建議值: 0.12-0.20)
      orbitalInclination: 0.18, // 軌道傾角 (建議值: 0.14-0.24)
      
      // ===== 擺動效果 =====
      cometOscAmp: 26,          // 彗星擺動幅度 (建議值: 20-32)
      cometOscFreq: 0.0018,     // 彗星擺動頻率 (建議值: 0.0014-0.0022)
      
      // ===== 軌跡效果 =====
      trailMax: 14,             // 軌跡長度 (建議值: 12-18)
      trailIntervalMs: 15,      // 軌跡間隔毫秒 (建議值: 12-20)
      cometTrail: true,         // 彗星軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,        // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，模擬彗星長尾軌跡
      // 優化重點: 漸進式尾段發射，增強追蹤視覺效果
      // 性能考量: 控制總子彈數量 < 55 個/幀 (尾段漸進)
      // 平衡性: 尾隨式攻擊，持久但可預測軌跡
    }, options || {});
    
    let theta = 0;
    let cometPhase = 0;
    let tailPhase = 0;
    let cometTimer = 0;
    let tailTimer = 0;
    let activeComets = [];
    
    return function(e, BS) {
      try {
        cometPhase = Math.sin(theta * 0.35);
        tailPhase = Math.cos(theta * 0.28);
        
        // 彗星核心發射 - 主要攻擊
        cometTimer += 16;
        if (cometTimer >= opts.cometInterval) {
          cometTimer = 0;
          
          for (let comet = 0; comet < opts.cometCores; comet++) {
            const baseAngle = (comet * TAU) / opts.cometCores;
            
            // 軌道傾角效果
            const inclinationEffect = Math.sin(comet * opts.orbitalInclination + theta * 0.2) * 0.3;
            const cometAngle = baseAngle + theta * 0.4 + inclinationEffect;
            
            // 速度變化
            const speedVariation = Math.sin(comet + theta * 0.15) * 0.25;
            const cometSpeed = opts.cometSpeed * (1 + speedVariation);
            
            const vx = Math.cos(cometAngle) * cometSpeed;
            const vy = Math.sin(cometAngle) * cometSpeed;
            
            const currentCometSize = opts.cometSize * (0.9 + Math.abs(inclinationEffect) * 0.3);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.cometLife, currentCometSize, opts.cometColor);
            const cometBullet = BS.bullets[BS.bullets.length - 1];
            if (cometBullet) {
              cometBullet.shape = 'ellipse';
              cometBullet.rx = currentCometSize * 1.4;
              cometBullet.ry = currentCometSize * 0.8;
              cometBullet.orientToVel = true;
              
              cometBullet.cometType = 'core';
              cometBullet.inclinationEffect = inclinationEffect;
              cometBullet.speedVariation = speedVariation;
              cometBullet.cometIntensity = Math.abs(cometPhase) + Math.abs(inclinationEffect);
              
              // 顏色漸變
              cometBullet.color2 = opts.tailColor;
              cometBullet.restyleAt = opts.cometLife * 0.2;
              
              // 擺動效果
              cometBullet.oscAxis = (comet % 2 === 0) ? 'x' : 'y';
              cometBullet.oscAmp = opts.cometOscAmp * (1 + Math.abs(cometPhase) * 0.6 + Math.abs(inclinationEffect) * 0.8);
              cometBullet.oscFreq = opts.cometOscFreq + (comet * 0.00012) + (Math.abs(cometPhase) * 0.0002) + (Math.abs(inclinationEffect) * 0.00025);
              cometBullet.angularVel = opts.rotateSpeed * ((comet % 3 === 0) ? 1 : -1) * (0.8 + Math.abs(inclinationEffect) * 0.3);
              
              // 超長軌跡（彗星特色）
              cometBullet.trailMax = opts.trailMax;
              cometBullet.trailIntervalMs = opts.trailIntervalMs;
              cometBullet.trailColor = opts.cometColor;
              cometBullet.trailIntensity = 0.8 + Math.abs(inclinationEffect) + Math.abs(cometPhase) * 0.5;
              cometBullet.cometTrail = true;
              cometBullet.persistentTrail = true;
              
              // 強力發光
              cometBullet.glowEffect = true;
              cometBullet.glowSize = currentCometSize * (2.5 + Math.abs(cometPhase) * 1.5 + Math.abs(inclinationEffect) * 2);
              cometBullet.glowColor = opts.cometColor;
              cometBullet.glowIntensity = 0.5 + Math.abs(cometPhase) * 0.4 + Math.abs(inclinationEffect) * 0.3;
              
              // 標記活躍彗星
              cometBullet.activeComet = true;
              cometBullet.cometId = comet;
              cometBullet.tailSegments = [];
              
              // 極端彗星標記
              if (Math.abs(inclinationEffect) > 0.7 * opts.orbitalInclination) {
                cometBullet.extremeComet = true;
                cometBullet.longPeriodComet = true;
                cometBullet.brilliantComet = true;
                cometBullet.energyOutput = Math.abs(inclinationEffect) * 3;
              }
            }
          }
        }
        
        // 尾段漸進發射 - 追蹤效果
        tailTimer += 16;
        if (tailTimer >= opts.tailInterval) {
          tailTimer = 0;
          
          // 為每個活躍彗星生成尾段
          for (let comet = 0; comet < opts.cometCores; comet++) {
            const baseAngle = (comet * TAU) / opts.cometCores + theta * 0.1;
            
            for (let tail = 0; tail < opts.tailSegments; tail++) {
              const tailDelay = tail * 0.1; // 漸進延遲
              const tailAngle = baseAngle + tailDelay + tailPhase * 0.2;
              
              // 尾段速度遞減（模擬尾跡）
              const tailSpeedFactor = Math.pow(opts.tailPersistence, tail + 1);
              const tailSpeed = opts.tailSpeed * tailSpeedFactor;
              
              // 尾段大小遞減
              const tailSizeFactor = Math.pow(0.8, tail);
              const currentTailSize = opts.tailSize * tailSizeFactor;
              
              const vx = Math.cos(tailAngle) * tailSpeed;
              const vy = Math.sin(tailAngle) * tailSpeed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.tailLife * tailSpeedFactor, currentTailSize, opts.tailColor);
              const tailBullet = BS.bullets[BS.bullets.length - 1];
              if (tailBullet) {
                tailBullet.shape = 'circle';
                tailBullet.tailType = 'segment';
                tailBullet.tailPosition = tail;
                tailBullet.tailSpeedFactor = tailSpeedFactor;
                tailBullet.tailPersistence = opts.tailPersistence;
                
                // 顏色漸變（尾段逐漸變淡）
                tailBullet.color2 = opts.fragmentColor;
                tailBullet.restyleAt = opts.tailLife * tailSpeedFactor * 0.4;
                
                // 較弱擺動
                tailBullet.oscAxis = (tail % 2 === 0) ? 'x' : 'y';
                tailBullet.oscAmp = opts.cometOscAmp * 0.6 * (1 - tail * 0.1);
                tailBullet.oscFreq = opts.cometOscFreq * (1 + tail * 0.05);
                tailBullet.angularVel = opts.rotateSpeed * ((tail % 3 === 0) ? 1 : -1) * 0.5 * tailSpeedFactor;
                
                // 尾段軌跡
                tailBullet.trailMax = Math.floor(opts.trailMax * 0.7 * tailSpeedFactor);
                tailBullet.trailIntervalMs = opts.trailIntervalMs + tail * 2;
                tailBullet.trailColor = opts.tailColor;
                tailBullet.trailIntensity = 0.6 * tailSpeedFactor;
                tailBullet.tailTrail = true;
                
                // 尾段發光（逐漸減弱）
                tailBullet.glowEffect = true;
                tailBullet.glowSize = currentTailSize * (1.5 + tailSpeedFactor);
                tailBullet.glowColor = opts.tailColor;
                tailBullet.glowIntensity = 0.3 * tailSpeedFactor * (1 - tail * 0.05);
                
                // 標記尾段
                tailBullet.tailSegment = true;
                tailBullet.parentComet = comet;
                tailBullet.tailIntensity = Math.abs(tailPhase) * tailSpeedFactor;
              }
            }
          }
        }
        
        // 軌道碎片（中等概率）
        if (Math.random() < opts.fragmentProbability && Math.abs(cometPhase) > 0.6) {
          const fragmentCount = opts.orbitalFragments;
          const fragmentDirection = Math.random() * TAU;
          
          for (let fragment = 0; fragment < fragmentCount; fragment++) {
            const fragmentAngle = fragmentDirection + (fragment - fragmentCount/2) * 0.3;
            
            const fragmentEffect = Math.sin(fragment * 0.8 + theta * 0.2) * 0.4;
            const fragmentSpeed = opts.fragmentSpeed * (1 + Math.abs(cometPhase) * 0.3 + Math.abs(fragmentEffect));
            
            const vx = Math.cos(fragmentAngle) * fragmentSpeed;
            const vy = Math.sin(fragmentAngle) * fragmentSpeed;
            
            const currentFragmentSize = opts.fragmentSize * (0.8 + Math.abs(fragmentEffect) * 0.4);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.fragmentLife, currentFragmentSize, opts.fragmentColor);
            const fragmentBullet = BS.bullets[BS.bullets.length - 1];
            if (fragmentBullet) {
              fragmentBullet.shape = 'ellipse';
              fragmentBullet.rx = currentFragmentSize * 1.2;
              fragmentBullet.ry = currentFragmentSize * 0.8;
              fragmentBullet.orientToVel = true;
              
              fragmentBullet.fragmentType = 'orbital';
              fragmentBullet.fragmentEffect = fragmentEffect;
              fragmentBullet.cometFragment = true;
              fragmentBullet.orbitalDebris = true;
              
              // 顏色漸變
              fragmentBullet.color2 = opts.cometColor;
              fragmentBullet.restyleAt = opts.fragmentLife * 0.3;
              
              // 碎片擺動
              fragmentBullet.oscAxis = (fragment % 2 === 0) ? 'x' : 'y';
              fragmentBullet.oscAmp = opts.cometOscAmp * 0.8;
              fragmentBullet.oscFreq = opts.cometOscFreq * 1.3;
              fragmentBullet.angularVel = opts.rotateSpeed * ((fragment % 3 === 0) ? 1 : -1) * 0.7;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第5階段：StellarCollapse（恆星坍縮）- 引力聚集模式
  function stellarCollapse(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      collapsePoints: 20,        // 坍縮點數量 (建議值: 6-12)
      gravitationalWaves: 80,   // 引力波數量 (建議值: 8-14)
      singularityRays: 20,       // 奇點射線數量 (建議值: 4-10)
      
      // ===== 發射頻率控制 =====
      collapseInterval: 320,    // 坍縮間隔毫秒 (建議值: 280-380)
      waveInterval: 180,        // 引力波間隔毫秒 (建議值: 160-240)
      singularityProbability: 0.25, // 奇點概率 (建議值: 0.2-0.35)
      
      // ===== 基礎屬性 =====
      collapseSpeed: 4.5,       // 坍縮速度 (建議值: 3.8-5.2)
      waveSpeed: 3.2,           // 引力波速度 (建議值: 2.8-3.8)
      singularitySpeed: 5.8,    // 奇點射線速度 (建議值: 5.0-6.5)
      collapseLife: 8400,       // 坍縮生命周期 (建議值: 7800-9000)
      waveLife: 7200,           // 引力波生命周期 (建議值: 6600-7800)
      singularityLife: 9800,    // 奇點生命周期 (建議值: 9200-10400)
      collapseSize: 14,         // 坍縮大小 (建議值: 12-18)
      waveSize: 11,             // 引力波大小 (建議值: 9-13)
      singularitySize: 16,      // 奇點大小 (建議值: 14-20)
      gravitationalStrength: 0.15, // 引力強度 (建議值: 0.12-0.2)
      
      // ===== 顏色配置 =====
      collapseColor: '#ff4500', // 坍縮橙紅 (主色)
      gravitationalColor: '#8b0000', // 引力深紅 (延遲換色)
      singularityColor: '#4b0082', // 奇點紫 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.14,        // 旋轉速度 (建議值: 0.11-0.18)
      collapseRate: 0.08,       // 坍縮速率 (建議值: 0.06-0.12)
      
      // ===== 擺動效果 =====
      collapseOscAmp: 34,       // 坍縮擺動幅度 (建議值: 28-42)
      collapseOscFreq: 0.0020,  // 坍縮擺動頻率 (建議值: 0.0016-0.0026)
      
      // ===== 軌跡效果 =====
      trailMax: 11,             // 軌跡長度 (建議值: 9-15)
      trailIntervalMs: 40,      // 軌跡間隔毫秒 (建議值: 35-55)
      gravitationalTrail: true, // 引力軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,        // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，模擬恆星引力坍縮
      // 優化重點: 向心聚集效果，增強引力場視覺
      // 性能考量: 控制總子彈數量 < 60 個/幀 (引力聚集)
      // 平衡性: 聚集式攻擊，引力強度和坍縮速率可調
    }, options || {});
    
    let theta = 0;
    let collapsePhase = 0;
    let gravitationalPhase = 0;
    let collapseTimer = 0;
    let waveTimer = 0;
    
    return function(e, BS) {
      try {
        collapsePhase = Math.sin(theta * 0.4);
        gravitationalPhase = Math.cos(theta * 0.32);
        
        // 主要坍縮點 - 向心聚集
        collapseTimer += 16;
        if (collapseTimer >= opts.collapseInterval) {
          collapseTimer = 0;
          
          for (let collapse = 0; collapse < opts.collapsePoints; collapse++) {
            const baseAngle = (collapse * TAU) / opts.collapsePoints;
            
            // 坍縮強度效果
            const collapseEffect = Math.sin(collapse + theta * 0.25) * opts.collapseRate;
            const gravitationalEffect = Math.cos(collapse * 1.2 + theta * 0.18) * opts.gravitationalStrength;
            
            // 向心角度（指向中心）
            const centripetalAngle = baseAngle + Math.PI; // 指向BOSS中心
            const collapseAngle = centripetalAngle + theta * 0.3 + collapseEffect * 2;
            
            const collapseSpeed = opts.collapseSpeed * (1 + Math.abs(collapsePhase) * 0.6 + Math.abs(gravitationalEffect) * 2);
            
            // 從外圍向中心發射
            const collapseRadius = 60 + collapse * 15; // 不同坍縮半徑
            const px = e.x + Math.cos(baseAngle) * collapseRadius / Math.max(0.1, opts.spaceDensity);
            const py = e.y + Math.sin(baseAngle) * collapseRadius / Math.max(0.1, opts.spaceDensity);
            
            const vx = Math.cos(collapseAngle) * collapseSpeed;
            const vy = Math.sin(collapseAngle) * collapseSpeed;
            
            const currentCollapseSize = opts.collapseSize * (1 + Math.abs(collapseEffect) * 0.5 + Math.abs(gravitationalEffect) * 0.8);
            
            BS.addBullet(px, py, vx, vy, opts.collapseLife, currentCollapseSize, opts.collapseColor);
            const collapseBullet = BS.bullets[BS.bullets.length - 1];
            if (collapseBullet) {
              collapseBullet.shape = 'ellipse';
              collapseBullet.rx = currentCollapseSize * 1.3;
              collapseBullet.ry = currentCollapseSize * 0.8;
              collapseBullet.orientToVel = true;
              
              collapseBullet.collapseType = 'stellar';
              collapseBullet.collapseEffect = collapseEffect;
              collapseBullet.gravitationalEffect = gravitationalEffect;
              collapseBullet.centripetal = true;
              collapseBullet.gravitationalMass = 1 + Math.abs(gravitationalEffect) * 3;
              
              // 顏色漸變
              collapseBullet.color2 = opts.gravitationalColor;
              collapseBullet.restyleAt = opts.collapseLife * (0.2 + Math.abs(collapseEffect) * 0.3 + Math.abs(gravitationalEffect) * 0.2);
              
              // 強化擺動（引力特徵）
              collapseBullet.oscAxis = (collapse % 2 === 0) ? 'x' : 'y';
              collapseBullet.oscAmp = opts.collapseOscAmp * (1 + Math.abs(collapsePhase) * 0.8 + Math.abs(collapseEffect) * 1.2 + Math.abs(gravitationalEffect) * 1.5);
              collapseBullet.oscFreq = opts.collapseOscFreq + (collapse * 0.00015) + (Math.abs(collapsePhase) * 0.00025) + (Math.abs(gravitationalEffect) * 0.0003);
              collapseBullet.angularVel = opts.rotateSpeed * ((collapse % 3 === 0) ? 1 : -1) * (0.9 + Math.abs(gravitationalEffect) * 0.6);
              
              // 特殊引力軌跡
              collapseBullet.trailMax = opts.trailMax;
              collapseBullet.trailIntervalMs = opts.trailIntervalMs;
              collapseBullet.trailColor = opts.collapseColor;
              collapseBullet.trailIntensity = Math.abs(gravitationalEffect) + Math.abs(collapsePhase) * 0.5 + 0.6;
              collapseBullet.gravitationalTrail = true;
              collapseBullet.centripetalTrail = true;
              
              // 強力發光（引力發光）
              collapseBullet.glowEffect = true;
              collapseBullet.glowSize = currentCollapseSize * (2.8 + Math.abs(collapsePhase) * 2 + Math.abs(gravitationalEffect) * 3.5);
              collapseBullet.glowColor = opts.collapseColor;
              collapseBullet.glowIntensity = 0.4 + Math.abs(collapsePhase) * 0.5 + Math.abs(gravitationalEffect) * 0.7;
              collapseBullet.gravitationalGlow = true;
              
              // 極端坍縮標記
              if (Math.abs(gravitationalEffect) > 0.8 * opts.gravitationalStrength) {
                collapseBullet.extremeCollapse = true;
                collapseBullet.gravitationalCollapse = true;
                collapseBullet.stellarImplosion = true;
                collapseBullet.energyOutput = Math.abs(gravitationalEffect) * 4;
              }
            }
          }
        }
        
        // 引力波發射 - 持續干擾
        waveTimer += 16;
        if (waveTimer >= opts.waveInterval) {
          waveTimer = 0;
          
          for (let wave = 0; wave < opts.gravitationalWaves; wave++) {
            const waveAngle = (wave * TAU) / opts.gravitationalWaves + theta * 0.25;
            
            const waveEffect = Math.sin(wave * 0.9 + theta * 0.22) * 0.35;
            const gravitationalWaveEffect = Math.cos(wave * 1.5 + theta * 0.15) * opts.gravitationalStrength * 0.8;
            const waveSpeed = opts.waveSpeed * (1 + Math.abs(collapsePhase) * 0.4 + Math.abs(waveEffect));
            
            // 引力波的螺旋發射
            const spiralAngle = waveAngle + waveEffect * 1.5;
            const vx = Math.cos(spiralAngle) * waveSpeed;
            const vy = Math.sin(spiralAngle) * waveSpeed;
            
            const currentWaveSize = opts.waveSize * (1 + Math.abs(waveEffect) * 0.4 + Math.abs(gravitationalWaveEffect) * 0.6);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.waveLife, currentWaveSize, opts.gravitationalColor);
            const waveBullet = BS.bullets[BS.bullets.length - 1];
            if (waveBullet) {
              waveBullet.shape = 'ellipse';
              waveBullet.rx = currentWaveSize;
              waveBullet.ry = currentWaveSize * 0.7;
              waveBullet.orientToVel = true;
              
              waveBullet.waveType = 'gravitational';
              waveBullet.waveEffect = waveEffect;
              waveBullet.gravitationalWaveEffect = gravitationalWaveEffect;
              waveBullet.spiralWave = true;
              waveBullet.gravitationalAmplitude = Math.abs(gravitationalWaveEffect) + 0.5;
              
              // 顏色漸變
              waveBullet.color2 = opts.singularityColor;
              waveBullet.restyleAt = opts.waveLife * 0.5;
              
              // 引力波擺動
              waveBullet.oscAxis = (wave % 2 === 0) ? 'x' : 'y';
              waveBullet.oscAmp = opts.collapseOscAmp * 0.8 * (1 + Math.abs(waveEffect) * 0.6);
              waveBullet.oscFreq = opts.collapseOscFreq * 1.2;
              waveBullet.angularVel = opts.rotateSpeed * ((wave % 3 === 0) ? 1 : -1) * (0.7 + Math.abs(waveEffect) * 0.4);
              
              // 引力波軌跡
              waveBullet.trailMax = Math.floor(opts.trailMax * 0.8);
              waveBullet.trailIntervalMs = opts.trailIntervalMs + 5;
              waveBullet.trailColor = opts.gravitationalColor;
              waveBullet.trailIntensity = 0.7 + Math.abs(waveEffect) * 0.3;
              waveBullet.gravitationalWaveTrail = true;
              waveBullet.spiralTrail = true;
              
              // 引力波發光
              waveBullet.glowEffect = true;
              waveBullet.glowSize = currentWaveSize * (2.2 + Math.abs(waveEffect) * 1.5);
              waveBullet.glowColor = opts.gravitationalColor;
              waveBullet.glowIntensity = 0.35 + Math.abs(waveEffect) * 0.25;
              waveBullet.waveGlow = true;
            }
          }
        }
        
        // 奇點射線（低概率）
        if (Math.random() < opts.singularityProbability && Math.abs(gravitationalPhase) > 0.7) {
          const singularityCount = opts.singularityRays;
          const singularityDirection = Math.random() * TAU;
          
          for (let singularity = 0; singularity < singularityCount; singularity++) {
            const singularityAngle = singularityDirection + (singularity - singularityCount/2) * 0.25;
            
            const singularityEffect = Math.sin(singularity * 1.3 + theta * 0.3) * 0.4;
            const extremeGravitationalEffect = Math.cos(singularity * 1.8 + theta * 0.25) * opts.gravitationalStrength * 1.5;
            const singularitySpeed = opts.singularitySpeed * (1 + Math.abs(collapsePhase) * 0.5 + Math.abs(singularityEffect));
            
            const vx = Math.cos(singularityAngle) * singularitySpeed;
            const vy = Math.sin(singularityAngle) * singularitySpeed;
            
            const currentSingularitySize = opts.singularitySize * (1 + Math.abs(singularityEffect) * 0.5 + Math.abs(extremeGravitationalEffect));
            
            BS.addBullet(e.x, e.y, vx, vy, opts.singularityLife, currentSingularitySize, opts.singularityColor);
            const singularityBullet = BS.bullets[BS.bullets.length - 1];
            if (singularityBullet) {
              singularityBullet.shape = 'ellipse';
              singularityBullet.rx = currentSingularitySize * 1.6;
              singularityBullet.ry = currentSingularitySize * 0.7;
              singularityBullet.orientToVel = true;
              
              singularityBullet.singularityType = 'extreme';
              singularityBullet.singularityEffect = singularityEffect;
              singularityBullet.extremeGravitationalEffect = extremeGravitationalEffect;
              singularityBullet.eventHorizon = Math.abs(extremeGravitationalEffect) + 0.8;
              singularityBullet.spaceTimeDistortion = Math.abs(extremeGravitationalEffect) * 2.5;
              
              // 顏色漸變
              singularityBullet.color2 = opts.collapseColor;
              singularityBullet.restyleAt = opts.singularityLife * 0.15;
              
              // 奇點擺動
              singularityBullet.oscAxis = (singularity % 2 === 0) ? 'x' : 'y';
              singularityBullet.oscAmp = opts.collapseOscAmp * 0.6;
              singularityBullet.oscFreq = opts.collapseOscFreq * 0.9;
              singularityBullet.angularVel = opts.rotateSpeed * 0.8 * (singularity % 2 === 0 ? 1 : -1);
              
              // 奇點軌跡
              singularityBullet.trailMax = opts.trailMax + 2;
              singularityBullet.trailIntervalMs = opts.trailIntervalMs - 10;
              singularityBullet.trailColor = opts.singularityColor;
              singularityBullet.trailIntensity = 0.9;
              singularityBullet.singularityTrail = true;
              singularityBullet.eventHorizonTrail = true;
              
              // 奇點發光（極端）
              singularityBullet.glowEffect = true;
              singularityBullet.glowSize = currentSingularitySize * 4;
              singularityBullet.glowColor = opts.singularityColor;
              singularityBullet.glowIntensity = 0.7;
              singularityBullet.singularityGlow = true;
              singularityBullet.eventHorizonGlow = true;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第6階段：OrbitalDance（軌道之舞）- 複雜軌道模式
  function orbitalDance(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      danceOrbits: 100,           // 舞蹈軌道數量 (建議值: 4-8)
      orbitalHarmonics: 100,      // 軌道和諧數量 (建議值: 6-12)
      stellarChoreography: 100,   // 星體編舞數量 (建議值: 4-8)
      
      // ===== 發射頻率控制 =====
      danceInterval: 200,       // 舞蹈間隔毫秒 (建議值: 170-260)
      harmonicInterval: 140,    // 和諧間隔毫秒 (建議值: 120-180)
      choreographyProbability: 0.3, // 編舞概率 (建議值: 0.25-0.4)
      
      // ===== 基礎屬性 =====
      danceSpeed: 3.2,          // 舞蹈速度 (建議值: 2.8-3.8)
      harmonicSpeed: 2.8,       // 和諧速度 (建議值: 2.4-3.2)
      choreographySpeed: 4.0,   // 編舞速度 (建議值: 3.5-4.5)
      danceLife: 8600,          // 舞蹈生命周期 (建議值: 8000-9200)
      harmonicLife: 7400,       // 和諧生命周期 (建議值: 7000-7800)
      choreographyLife: 6200,   // 編舞生命周期 (建議值: 5800-6600)
      danceSize: 12,            // 舞蹈大小 (建議值: 10-14)
      harmonicSize: 9,          // 和諧大小 (建議值: 7-11)
      choreographySize: 11,     // 編舞大小 (建議值: 9-13)
      orbitalEccentricity: 0.18, // 軌道偏心率 (建議值: 0.14-0.24)
      
      // ===== 顏色配置 =====
      danceColor: '#ffd700',    // 舞蹈金 (主色)
      harmonicColor: '#ff69b4', // 和諧粉 (延遲換色)
      choreographyColor: '#9370db', // 編舞紫 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.20,        // 旋轉速度 (建議值: 0.16-0.24)
      precessionRate: 0.12,   // 進動速率 (建議值: 0.09-0.16)
      
      // ===== 擺動效果 =====
      danceOscAmp: 28,          // 舞蹈擺動幅度 (建議值: 22-36)
      danceOscFreq: 0.0024,     // 舞蹈擺動頻率 (建議值: 0.0019-0.0030)
      
      // ===== 軌跡效果 =====
      trailMax: 12,             // 軌跡長度 (建議值: 10-16)
      trailIntervalMs: 20,      // 軌跡間隔毫秒 (建議值: 16-26)
      orbitalTrail: true,       // 軌道軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,        // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，模擬複雜軌道舞蹈
      // 優化重點: 橢圓軌道和進動效果，增強天體力學感
      // 性能考量: 控制總子彈數量 < 65 個/幀 (多軌道舞蹈)
      // 平衡性: 複雜軌道但規律性強，考驗預判能力
    }, options || {});
    
    let theta = 0;
    let dancePhase = 0;
    let precessionPhase = 0;
    let danceTimer = 0;
    let harmonicTimer = 0;
    
    return function(e, BS) {
      try {
        dancePhase = Math.sin(theta * 0.45);
        precessionPhase = Math.cos(theta * 0.38);
        
        // 主要舞蹈軌道 - 橢圓運動
        danceTimer += 16;
        if (danceTimer >= opts.danceInterval) {
          danceTimer = 0;
          
          for (let dance = 0; dance < opts.danceOrbits; dance++) {
            const baseAngle = (dance * TAU) / opts.danceOrbits;
            
            // 軌道偏心率效果
            const eccentricityEffect = Math.sin(dance * opts.orbitalEccentricity + theta * 0.3) * 0.4;
            const precessionEffect = Math.cos(dance * 1.1 + theta * 0.22) * opts.precessionRate;
            
            // 橢圓軌道參數
            const semiMajorAxis = 40 + dance * 20; // 半長軸
            const semiMinorAxis = semiMajorAxis * (1 - Math.abs(eccentricityEffect)); // 半短軸
            const orbitalAngle = baseAngle + theta * 0.6 + precessionEffect * 1.5;
            
            // 橢圓軌道位置
            const ellipseX = Math.cos(orbitalAngle) * semiMajorAxis;
            const ellipseY = Math.sin(orbitalAngle) * semiMinorAxis;
            
            // 軌道速度（近日點快，遠日點慢）
            const orbitalSpeed = opts.danceSpeed * (1 + Math.abs(eccentricityEffect) * 0.5 + Math.abs(dancePhase) * 0.3);
            
            // 切線方向發射
            const tangentAngle = orbitalAngle + Math.PI / 2 + eccentricityEffect * 0.5;
            const vx = Math.cos(tangentAngle) * orbitalSpeed;
            const vy = Math.sin(tangentAngle) * orbitalSpeed;
            
            const px = e.x + ellipseX / Math.max(0.1, opts.spaceDensity);
            const py = e.y + ellipseY / Math.max(0.1, opts.spaceDensity);
            
            const currentDanceSize = opts.danceSize * (1 + Math.abs(eccentricityEffect) * 0.2);
            
            BS.addBullet(px, py, vx, vy, opts.danceLife, currentDanceSize, opts.danceColor);
            const danceBullet = BS.bullets[BS.bullets.length - 1];
            if (danceBullet) {
              danceBullet.shape = 'ellipse';
              danceBullet.rx = currentDanceSize;
              danceBullet.ry = currentDanceSize * (1 - Math.abs(eccentricityEffect) * 0.3);
              danceBullet.orientToVel = Math.abs(eccentricityEffect) > 0.2;
              
              danceBullet.danceType = 'orbital';
              danceBullet.eccentricityEffect = eccentricityEffect;
              danceBullet.precessionEffect = precessionEffect;
              danceBullet.semiMajorAxis = semiMajorAxis;
              danceBullet.semiMinorAxis = semiMinorAxis;
              danceBullet.orbitalEccentricity = Math.abs(eccentricityEffect);
              
              // 顏色漸變
              danceBullet.color2 = opts.harmonicColor;
              danceBullet.restyleAt = opts.danceLife * (0.25 + Math.abs(eccentricityEffect) * 0.2 + Math.abs(dancePhase) * 0.15);
              
              // 軌道擺動
              danceBullet.oscAxis = (dance % 2 === 0) ? 'x' : 'y';
              danceBullet.oscAmp = opts.danceOscAmp * (1 + Math.abs(dancePhase) * 0.7 + Math.abs(eccentricityEffect) * 0.9);
              danceBullet.oscFreq = opts.danceOscFreq + (dance * 0.00018) + (Math.abs(dancePhase) * 0.0003) + (Math.abs(eccentricityEffect) * 0.00025);
              danceBullet.angularVel = opts.rotateSpeed * ((dance % 3 === 0) ? 1 : -1) * (0.8 + Math.abs(eccentricityEffect) * 0.4);
              
              // 軌道軌跡
              danceBullet.trailMax = opts.trailMax;
              danceBullet.trailIntervalMs = opts.trailIntervalMs;
              danceBullet.trailColor = opts.danceColor;
              danceBullet.trailIntensity = 0.7 + Math.abs(eccentricityEffect) * 0.3;
              danceBullet.orbitalTrail = true;
              danceBullet.ellipseTrail = true;
              
              // 軌道發光
              danceBullet.glowEffect = true;
              danceBullet.glowSize = currentDanceSize * (2.2 + Math.abs(dancePhase) * 1.5 + Math.abs(eccentricityEffect) * 1.8);
              danceBullet.glowColor = opts.danceColor;
              danceBullet.glowIntensity = 0.4 + Math.abs(dancePhase) * 0.3 + Math.abs(eccentricityEffect) * 0.25;
              danceBullet.orbitalGlow = true;
              
              // 極端軌道標記
              if (Math.abs(eccentricityEffect) > 0.7 * opts.orbitalEccentricity) {
                danceButton.extremeOrbit = true;
                danceButton.highlyEccentric = true;
                danceButton.cometaryOrbit = true;
                danceButton.energyOutput = Math.abs(eccentricityEffect) * 3;
              }
            }
          }
        }
        
        // 軌道和諧 - 持續發射
        harmonicTimer += 16;
        if (harmonicTimer >= opts.harmonicInterval) {
          harmonicTimer = 0;
          
          for (let harmonic = 0; harmonic < opts.orbitalHarmonics; harmonic++) {
            const harmonicAngle = (harmonic * TAU) / opts.orbitalHarmonics + theta * 0.35;
            
            const harmonicEffect = Math.sin(harmonic * 0.8 + theta * 0.28) * 0.3;
            const resonanceEffect = Math.cos(harmonic * 1.3 + theta * 0.2) * 0.25;
            const harmonicSpeed = opts.harmonicSpeed * (1 + Math.abs(dancePhase) * 0.4 + Math.abs(harmonicEffect));
            
            // 和諧共振角度
            const resonanceAngle = harmonicAngle + harmonicEffect * 1.2 + resonanceEffect * 0.8;
            const vx = Math.cos(resonanceAngle) * harmonicSpeed;
            const vy = Math.sin(resonanceAngle) * harmonicSpeed;
            
            const currentHarmonicSize = opts.harmonicSize * (1 + Math.abs(harmonicEffect) * 0.3);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.harmonicLife, currentHarmonicSize, opts.harmonicColor);
            const harmonicBullet = BS.bullets[BS.bullets.length - 1];
            if (harmonicBullet) {
              harmonicBullet.shape = 'circle';
              harmonicBullet.harmonicType = 'resonance';
              harmonicBullet.harmonicEffect = harmonicEffect;
              harmonicBullet.resonanceEffect = resonanceEffect;
              harmonicBullet.harmonicAmplitude = Math.abs(harmonicEffect) + Math.abs(resonanceEffect);
              
              // 顏色漸變
              harmonicBullet.color2 = opts.choreographyColor;
              harmonicBullet.restyleAt = opts.harmonicLife * 0.4;
              
              // 和諧擺動
              harmonicBullet.oscAxis = (harmonic % 2 === 0) ? 'x' : 'y';
              harmonicBullet.oscAmp = opts.danceOscAmp * 0.9 * (1 + Math.abs(harmonicEffect));
              harmonicBullet.oscFreq = opts.danceOscFreq * 1.1;
              harmonicBullet.angularVel = opts.rotateSpeed * ((harmonic % 3 === 0) ? 1 : -1) * 0.7;
              
              // 和諧軌跡
              harmonicBullet.trailMax = Math.floor(opts.trailMax * 0.9);
              harmonicBullet.trailIntervalMs = opts.trailIntervalMs + 3;
              harmonicBullet.trailColor = opts.harmonicColor;
              harmonicBullet.trailIntensity = 0.6 + Math.abs(harmonicEffect) * 0.2;
              harmonicBullet.harmonicTrail = true;
              harmonicBullet.resonanceTrail = true;
              
              // 和諧發光
              harmonicBullet.glowEffect = true;
              harmonicBullet.glowSize = currentHarmonicSize * (1.8 + Math.abs(harmonicEffect) * 1.2);
              harmonicBullet.glowColor = opts.harmonicColor;
              harmonicBullet.glowIntensity = 0.35 + Math.abs(harmonicEffect) * 0.2;
              harmonicBullet.harmonicGlow = true;
            }
          }
        }
        
        // 星體編舞（中等概率）
        if (Math.random() < opts.choreographyProbability && Math.abs(precessionPhase) > 0.6) {
          const choreographyCount = opts.stellarChoreography;
          const choreographyDirection = Math.random() * TAU;
          
          for (let choreography = 0; choreography < choreographyCount; choreography++) {
            const choreographyAngle = choreographyDirection + (choreography - choreographyCount/2) * 0.2;
            
            const choreographyEffect = Math.sin(choreography * 1.1 + theta * 0.4) * 0.5;
            const precessionEffect = Math.cos(choreography * 1.6 + theta * 0.32) * opts.precessionRate * 2;
            const choreographySpeed = opts.choreographySpeed * (1 + Math.abs(precessionPhase) * 0.6 + Math.abs(choreographyEffect));
            
            const vx = Math.cos(choreographyAngle) * choreographySpeed;
            const vy = Math.sin(choreographyAngle) * choreographySpeed;
            
            const currentChoreographySize = opts.choreographySize * (1 + Math.abs(choreographyEffect) * 0.4);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.choreographyLife, currentChoreographySize, opts.choreographyColor);
            const choreographyBullet = BS.bullets[BS.bullets.length - 1];
            if (choreographyBullet) {
              choreographyBullet.shape = 'ellipse';
              choreographyBullet.rx = currentChoreographySize;
              choreographyBullet.ry = currentChoreographySize * 0.8;
              choreographyBullet.orientToVel = true;
              
              choreographyBullet.choreographyType = 'stellar';
              choreographyBullet.choreographyEffect = choreographyEffect;
              choreographyBullet.precessionEffect = precessionEffect;
              choreographyBullet.celestialChoreography = Math.abs(choreographyEffect) + Math.abs(precessionPhase);
              choreographyBullet.orbitalPrecession = Math.abs(precessionEffect);
              
              // 顏色漸變
              choreographyBullet.color2 = opts.danceColor;
              choreographyBullet.restyleAt = opts.choreographyLife * 0.25;
              
              // 編舞擺動
              choreographyBullet.oscAxis = (choreography % 2 === 0) ? 'x' : 'y';
              choreographyBullet.oscAmp = opts.danceOscAmp * 0.7;
              choreographyBullet.oscFreq = opts.danceOscFreq * 0.95;
              choreographyBullet.angularVel = opts.rotateSpeed * 0.9 * (choreography % 2 === 0 ? 1 : -1);
              
              // 編舞軌跡
              choreographyBullet.trailMax = opts.trailMax + 1;
              choreographyBullet.trailIntervalMs = opts.trailIntervalMs - 2;
              choreographyBullet.trailColor = opts.choreographyColor;
              choreographyBullet.trailIntensity = 0.8 + Math.abs(choreographyEffect) * 0.2;
              choreographyBullet.choreographyTrail = true;
              choreographyBullet.precessionTrail = true;
              
              // 編舞發光
              choreographyBullet.glowEffect = true;
              choreographyBullet.glowSize = currentChoreographySize * 2.5;
              choreographyBullet.glowColor = opts.choreographyColor;
              choreographyBullet.glowIntensity = 0.5 + Math.abs(choreographyEffect) * 0.15;
              choreographyBullet.choreographyGlow = true;
              
              // 極端編舞標記
              if (Math.abs(precessionEffect) > 0.7 * opts.precessionRate) {
                choreographyBullet.extremeChoreography = true;
                choreographyBullet.highPrecession = true;
                choreographyBullet.celestialMasterpiece = true;
                choreographyBullet.energyOutput = Math.abs(precessionEffect) * 3.5;
              }
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第7階段：GravityWhip（重力鞭笞）- 加速甩動模式
  function gravityWhip(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      whipCracks: 35,            // 鞭笞破裂數量 (建議值: 6-12)
      gravitationalSlingshots: 40, // 引力彈弓數量 (建議值: 8-14)
      accelerationBursts: 35,    // 加速爆發數量 (建議值: 4-10)
      
      // ===== 發射頻率控制 =====
      whipInterval: 160,      // 鞭笞間隔毫秒 (建議值: 140-200)
      slingshotInterval: 220,   // 彈弓間隔毫秒 (建議值: 190-260)
      burstProbability: 0.35,   // 爆發概率 (建議值: 0.25-0.45)
      
      // ===== 基礎屬性 =====
      whipSpeed: 5.2,           // 鞭笞速度 (建議值: 4.5-5.8)
      slingshotSpeed: 4.5,      // 彈弓速度 (建議值: 4.0-5.0)
      burstSpeed: 6.2,          // 爆發速度 (建議值: 5.5-6.8)
      whipLife: 7200,           // 鞭笞生命周期 (建議值: 6800-7600)
      slingshotLife: 8400,      // 彈弓生命周期 (建議值: 8000-8800)
      burstLife: 5800,          // 爆發生命周期 (建議值: 5400-6200)
      whipSize: 12,             // 鞭笞大小 (建議值: 10-14)
      slingshotSize: 10,        // 彈弓大小 (建議值: 8-12)
      burstSize: 13,            // 爆發大小 (建議值: 11-15)
      accelerationFactor: 0.18, // 加速因子 (建議值: 0.15-0.22)
      
      // ===== 顏色配置 =====
      whipColor: '#ff0000',     // 鞭笞紅 (主色)
      slingshotColor: '#ff6347', // 彈弓橙紅 (延遲換色)
      burstColor: '#ffd700',    // 爆發金 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.24,        // 旋轉速度 (建議值: 0.20-0.28)
      whipAcceleration: 0.12,   // 鞭笞加速度 (建議值: 0.09-0.16)
      
      // ===== 擺動效果 =====
      whipOscAmp: 38,           // 鞭笞擺動幅度 (建議值: 32-46)
      whipOscFreq: 0.0030,      // 鞭笞擺動頻率 (建議值: 0.0024-0.0036)
      
      // ===== 軌跡效果 =====
      trailMax: 13,             // 軌跡長度 (建議值: 11-16)
      trailIntervalMs: 12,      // 軌跡間隔毫秒 (建議值: 10-16)
      accelerationTrail: true,  // 加速軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,        // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，模擬重力加速鞭笞
      // 優化重點: 漸進式加速效果，增強動態視覺衝擊
      // 性能考量: 控制總子彈數量 < 60 個/幀 (高速運動)
      // 平衡性: 高速攻擊但軌跡明顯，考驗即時反應
    }, options || {});
    
    let theta = 0;
    let whipPhase = 0;
    let accelerationPhase = 0;
    let whipTimer = 0;
    let slingshotTimer = 0;
    
    return function(e, BS) {
      try {
        whipPhase = Math.sin(theta * 0.65);
        accelerationPhase = Math.cos(theta * 0.52);
        
        // 主要鞭笞攻擊 - 漸進加速
        whipTimer += 16;
        if (whipTimer >= opts.whipInterval) {
          whipTimer = 0;
          
          for (let whip = 0; whip < opts.whipCracks; whip++) {
            const baseAngle = (whip * TAU) / opts.whipCracks;
            
            // 鞭笞加速度效果
            const accelerationEffect = Math.sin(whip + theta * 0.3) * opts.accelerationFactor;
            const whipAcceleration = Math.cos(whip * 1.3 + theta * 0.25) * opts.whipAcceleration;
            
            // 多階段鞭笞（模擬鞭子破裂）
            for (let crack = 0; crack < 3; crack++) {
              const crackDelay = crack * 0.08; // 漸進延遲
              const crackAngle = baseAngle + crackDelay + theta * 0.4 + accelerationEffect * 1.8;
              
              // 速度遞增（鞭梢效應）
              const speedMultiplier = 1 + crack * 0.3 + Math.abs(accelerationEffect) * 2;
              const crackSpeed = opts.whipSpeed * speedMultiplier * (1 + Math.abs(whipPhase) * 0.5 + Math.abs(whipAcceleration));
              
              const crackSize = opts.whipSize * (0.8 + crack * 0.15) * (1 + Math.abs(accelerationEffect) * 0.3);
              
              const vx = Math.cos(crackAngle) * crackSpeed;
              const vy = Math.sin(crackAngle) * crackSpeed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.whipLife * (1 - crack * 0.1), crackSize, opts.whipColor);
              const whipBullet = BS.bullets[BS.bullets.length - 1];
              if (whipBullet) {
                whipBullet.shape = crack === 2 ? 'ellipse' : 'circle';
                whipBullet.rx = crackSize * 1.2;
                whipBullet.ry = crackSize * 0.7;
                whipBullet.orientToVel = true;
                
                whipBullet.whipType = 'crack';
                whipBullet.crackLevel = crack;
                whipBullet.accelerationEffect = accelerationEffect;
                whipBullet.whipAcceleration = whipAcceleration;
                whipBullet.speedMultiplier = speedMultiplier;
                whipBullet.whipIntensity = Math.abs(accelerationEffect) + Math.abs(whipPhase) + Math.abs(whipAcceleration);
                
                // 顏色漸變
                whipBullet.color2 = opts.slingshotColor;
                whipBullet.restyleAt = opts.whipLife * (0.15 + crack * 0.1 + Math.abs(accelerationEffect) * 0.2 + Math.abs(whipPhase) * 0.15);
                
                // 強化擺動（高速特徵）
                whipBullet.oscAxis = (whip % 2 === 0) ? 'x' : 'y';
                whipBullet.oscAmp = opts.whipOscAmp * (1 + Math.abs(whipPhase) * 1.0 + Math.abs(accelerationEffect) * 1.5 + Math.abs(whipAcceleration) * 1.8);
                whipBullet.oscFreq = opts.whipOscFreq + (whip * 0.0002) + (Math.abs(whipPhase) * 0.0004) + (Math.abs(accelerationEffect) * 0.0006) + (Math.abs(whipAcceleration) * 0.0008);
                whipBullet.angularVel = opts.rotateSpeed * ((whip % 3 === 0) ? 1 : -1) * (1.0 + Math.abs(accelerationEffect) * 0.7 + Math.abs(whipAcceleration));
                
                // 強化軌跡（高速運動）
                whipBullet.trailMax = opts.trailMax;
                whipBullet.trailIntervalMs = opts.trailIntervalMs;
                whipBullet.trailColor = opts.whipColor;
                whipBullet.trailIntensity = Math.abs(accelerationEffect) + Math.abs(whipPhase) + Math.abs(whipAcceleration) + 0.7;
                whipBullet.whipTrail = true;
                whipBullet.accelerationTrail = true;
                whipBullet.highSpeedTrail = true;
                
                // 強力發光（高速發光）
                whipBullet.glowEffect = true;
                whipBullet.glowSize = crackSize * (3 + Math.abs(whipPhase) * 2.5 + Math.abs(accelerationEffect) * 4 + Math.abs(whipAcceleration) * 5);
                whipBullet.glowColor = opts.whipColor;
                whipBullet.glowIntensity = 0.5 + Math.abs(whipPhase) * 0.4 + Math.abs(accelerationEffect) * 0.6 + Math.abs(whipAcceleration) * 0.7;
                whipBullet.whipGlow = true;
                whipBullet.accelerationGlow = true;
                
                // 極端鞭笞標記
              if (Math.abs(accelerationEffect) > 0.8 * opts.accelerationFactor || Math.abs(whipAcceleration) > 0.7 * opts.whipAcceleration) {
                whipBullet.extremeWhip = true;
                whipBullet.supersonicCrack = true;
                whipBullet.gravitationalWhip = true;
                whipBullet.energyOutput = (Math.abs(accelerationEffect) + Math.abs(whipAcceleration)) * 3.5;
              }
              }
            }
          }
        }
        
        // 引力彈弓 - 中等頻率
        slingshotTimer += 16;
        if (slingshotTimer >= opts.slingshotInterval) {
          slingshotTimer = 0;
          
          for (let slingshot = 0; slingshot < opts.gravitationalSlingshots; slingshot++) {
            const slingshotAngle = (slingshot * TAU) / opts.gravitationalSlingshots + theta * 0.3;
            
            const slingshotEffect = Math.sin(slingshot * 1.1 + theta * 0.28) * 0.4;
            const gravitationalBoost = Math.cos(slingshot * 1.4 + theta * 0.22) * opts.accelerationFactor * 0.8;
            const slingshotSpeed = opts.slingshotSpeed * (1 + Math.abs(whipPhase) * 0.5 + Math.abs(slingshotEffect) + Math.abs(gravitationalBoost));
            
            // 彈弓彎曲軌跡
            const bendAngle = slingshotAngle + slingshotEffect * 2 + gravitationalBoost * 1.5;
            const vx = Math.cos(bendAngle) * slingshotSpeed;
            const vy = Math.sin(bendAngle) * slingshotSpeed;
            
            const currentSlingshotSize = opts.slingshotSize * (1 + Math.abs(slingshotEffect) * 0.3 + Math.abs(gravitationalBoost) * 0.4);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.slingshotLife, currentSlingshotSize, opts.slingshotColor);
            const slingshotBullet = BS.bullets[BS.bullets.length - 1];
            if (slingshotBullet) {
              slingshotBullet.shape = 'ellipse';
              slingshotBullet.rx = currentSlingshotSize * 1.3;
              slingshotBullet.ry = currentSlingshotSize * 0.8;
              slingshotBullet.orientToVel = true;
              
              slingshotBullet.slingshotType = 'gravitational';
              slingshotBullet.slingshotEffect = slingshotEffect;
              slingshotBullet.gravitationalBoost = gravitationalBoost;
              slingshotBullet.bendAngle = bendAngle;
              slingshotBullet.slingshotIntensity = Math.abs(slingshotEffect) + Math.abs(gravitationalBoost) + Math.abs(whipPhase);
              
              // 顏色漸變
              slingshotBullet.color2 = opts.burstColor;
              slingshotBullet.restyleAt = opts.slingshotLife * 0.3;
              
              // 彈弓擺動
              slingshotBullet.oscAxis = (slingshot % 2 === 0) ? 'x' : 'y';
              slingshotBullet.oscAmp = opts.whipOscAmp * 0.85 * (1 + Math.abs(slingshotEffect) * 0.6);
              slingshotBullet.oscFreq = opts.whipOscFreq * 1.05;
              slingshotBullet.angularVel = opts.rotateSpeed * ((slingshot % 3 === 0) ? 1 : -1) * (0.85 + Math.abs(slingshotEffect) * 0.3);
              
              // 彈弓軌跡
              slingshotBullet.trailMax = opts.trailMax - 1;
              slingshotBullet.trailIntervalMs = opts.trailIntervalMs + 8;
              slingshotBullet.trailColor = opts.slingshotColor;
              slingshotBullet.trailIntensity = 0.65 + Math.abs(slingshotEffect) * 0.2;
              slingshotBullet.slingshotTrail = true;
              slingshotBullet.gravitationalBendTrail = true;
              
              // 彈弓發光
              slingshotBullet.glowEffect = true;
              slingshotBullet.glowSize = currentSlingshotSize * (2.5 + Math.abs(slingshotEffect) * 1.8);
              slingshotBullet.glowColor = opts.slingshotColor;
              slingshotBullet.glowIntensity = 0.4 + Math.abs(slingshotEffect) * 0.3;
              slingshotBullet.slingshotGlow = true;
            }
          }
        }
        
        // 加速爆發（低概率）
        if (Math.random() < opts.burstProbability && Math.abs(accelerationPhase) > 0.7) {
          const burstCount = opts.accelerationBursts;
          const burstDirection = Math.random() * TAU;
          
          for (let burst = 0; burst < burstCount; burst++) {
            const burstAngle = burstDirection + (burst - burstCount/2) * 0.3;
            
            const burstEffect = Math.sin(burst * 1.2 + theta * 0.35) * 0.4;
            const extremeAccelerationEffect = Math.cos(burst * 1.6 + theta * 0.3) * opts.accelerationFactor * 1.2;
            const burstSpeed = opts.burstSpeed * (1 + Math.abs(whipPhase) * 0.6 + Math.abs(burstEffect) + Math.abs(extremeAccelerationEffect));
            
            const vx = Math.cos(burstAngle) * burstSpeed;
            const vy = Math.sin(burstAngle) * burstSpeed;
            
            const currentBurstSize = opts.burstSize * (1 + Math.abs(burstEffect) * 0.4 + Math.abs(extremeAccelerationEffect) * 0.6);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.burstLife, currentBurstSize, opts.burstColor);
            const burstBullet = BS.bullets[BS.bullets.length - 1];
            if (burstBullet) {
              burstBullet.shape = 'ellipse';
              burstBullet.rx = currentBurstSize * 1.4;
              burstBullet.ry = currentBurstSize * 0.8;
              burstBullet.orientToVel = true;
              
              burstBullet.burstType = 'acceleration';
              burstBullet.burstEffect = burstEffect;
              burstBullet.extremeAccelerationEffect = extremeAccelerationEffect;
              burstBullet.accelerationIntensity = Math.abs(burstEffect) + Math.abs(extremeAccelerationEffect) + Math.abs(whipPhase);
              
              // 顏色漸變
              burstBullet.color2 = opts.whipColor;
              burstBullet.restyleAt = opts.burstLife * 0.2;
              
              // 爆發擺動
              burstBullet.oscAxis = (burst % 2 === 0) ? 'x' : 'y';
              burstBullet.oscAmp = opts.whipOscAmp * 0.7;
              burstBullet.oscFreq = opts.whipOscFreq * 1.15;
              burstBullet.angularVel = opts.rotateSpeed * ((burst % 3 === 0) ? 1 : -1) * 0.9;
              
              // 爆發軌跡
              burstBullet.trailMax = opts.trailMax - 2;
              burstBullet.trailIntervalMs = opts.trailIntervalMs + 6;
              burstBullet.trailColor = opts.burstColor;
              burstBullet.trailIntensity = Math.abs(burstEffect) + Math.abs(extremeAccelerationEffect) + 0.8;
              burstBullet.burstTrail = true;
              burstBullet.accelerationTrail = true;
              
              // 爆發發光
              burstBullet.glowEffect = true;
              burstBullet.glowSize = currentBurstSize * (3.5 + Math.abs(whipPhase) * 2 + Math.abs(burstEffect) * 2.5 + Math.abs(extremeAccelerationEffect) * 3);
              burstBullet.glowColor = opts.burstColor;
              burstBullet.glowIntensity = 0.6 + Math.abs(whipPhase) * 0.4 + Math.abs(burstEffect) * 0.5 + Math.abs(extremeAccelerationEffect) * 0.6;
              burstBullet.burstGlow = true;
              burstBullet.extremeGlow = true;
              
              // 極端爆發標記
              if (Math.abs(extremeAccelerationEffect) > 0.8 * opts.accelerationFactor) {
                burstBullet.extremeBurst = true;
                burstBullet.hypersonicBurst = true;
                burstBullet.gravitationalBurst = true;
                burstBullet.energyOutput = Math.abs(extremeAccelerationEffect) * 4;
              }
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第8階段：NovaBurst（新星爆發）- 散射爆發模式
  function novaBurst(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      novaCores: 40,             // 新星核心數量 (建議值: 6-12)
      explosionRays: 50,        // 爆發射線數量 (建議值: 10-16)
      stellarFragments: 45,     // 星體碎片數量 (建議值: 8-14)
      
      // ===== 發射頻率控制 =====
      novaInterval: 280,        // 新星間隔毫秒 (建議值: 240-340)
      explosionInterval: 140,   // 爆發間隔毫秒 (建議值: 120-180)
      fragmentProbability: 0.3, // 碎片概率 (建議值: 0.25-0.4)
      
      // ===== 基礎屬性 =====
      novaSpeed: 4.8,           // 新星速度 (建議值: 4.2-5.5)
      explosionSpeed: 6.2,      // 爆發速度 (建議值: 5.5-7.0)
      fragmentSpeed: 3.8,       // 碎片速度 (建議值: 3.2-4.5)
      novaLife: 7800,           // 新星生命周期 (建議值: 7200-8400)
      explosionLife: 6200,      // 爆發生命周期 (建議值: 5800-6600)
      fragmentLife: 6800,       // 碎片生命周期 (建議值: 6200-7400)
      novaSize: 14,             // 新星大小 (建議值: 12-18)
      explosionSize: 11,        // 爆發大小 (建議值: 9-14)
      fragmentSize: 13,         // 碎片大小 (建議值: 11-16)
      burstIntensity: 0.18,     // 爆發強度 (建議值: 0.15-0.25)
      
      // ===== 顏色配置 =====
      novaColor: '#ffd700',     // 新星金 (主色)
      explosionColor: '#ff4500', // 爆發橙紅 (延遲換色)
      fragmentColor: '#ff6347', // 碎片紅 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.22,        // 旋轉速度 (建議值: 0.18-0.28)
      expansionRate: 0.15,      // 擴張速率 (建議值: 0.12-0.2)
      
      // ===== 擺動效果 =====
      novaOscAmp: 32,           // 新星擺動幅度 (建議值: 26-40)
      novaOscFreq: 0.0026,      // 新星擺動頻率 (建議值: 0.0020-0.0032)
      
      // ===== 軌跡效果 =====
      trailMax: 10,             // 軌跡長度 (建議值: 8-13)
      trailIntervalMs: 22,      // 軌跡間隔毫秒 (建議值: 18-28)
      novaTrail: true,          // 新星軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,        // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，模擬新星爆發散射
      // 優化重點: 多階段爆發模式，增強視覺震撼效果
      // 性能考量: 控制總子彈數量 < 65 個/幀 (多層次爆發)
      // 平衡性: 爆發式攻擊，強度和擴張速率可調
    }, options || {});
    
    let theta = 0;
    let novaPhase = 0;
    let expansionPhase = 0;
    let novaTimer = 0;
    let explosionTimer = 0;
    
    return function(e, BS) {
      try {
        novaPhase = Math.sin(theta * 0.55);
        expansionPhase = Math.cos(theta * 0.42);
        
        // 主要新星爆發 - 核心攻擊
        novaTimer += 16;
        if (novaTimer >= opts.novaInterval) {
          novaTimer = 0;
          
          for (let nova = 0; nova < opts.novaCores; nova++) {
            const baseAngle = (nova * TAU) / opts.novaCores;
            
            // 爆發強度效果
            const intensityEffect = Math.sin(nova + theta * 0.3) * opts.burstIntensity;
            const expansionEffect = Math.cos(nova * 1.2 + theta * 0.25) * opts.expansionRate;
            
            const novaSpeed = opts.novaSpeed * (1 + Math.abs(novaPhase) * 0.5 + Math.abs(intensityEffect) * 2);
            
            // 多階段爆發
            for (let burst = 0; burst < 2; burst++) {
              const burstDelay = burst * 0.15;
              const novaAngle = baseAngle + burstDelay + theta * 0.3 + expansionEffect * 1.5;
              
              const currentNovaSize = opts.novaSize * (1 + Math.abs(intensityEffect) * 0.4);
              
              const vx = Math.cos(novaAngle) * novaSpeed;
              const vy = Math.sin(novaAngle) * novaSpeed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.novaLife, currentNovaSize, opts.novaColor);
              const novaBullet = BS.bullets[BS.bullets.length - 1];
              if (novaBullet) {
                novaBullet.shape = burst === 0 ? 'circle' : 'ellipse';
                novaBullet.rx = currentNovaSize * 1.2;
                novaBullet.ry = currentNovaSize * 0.8;
                novaBullet.orientToVel = true;
                
                novaBullet.novaType = 'core';
                novaBullet.intensityEffect = intensityEffect;
                novaBullet.expansionEffect = expansionEffect;
                novaBullet.burstIntensity = Math.abs(intensityEffect) + Math.abs(expansionPhase) + Math.abs(novaPhase);
                
                // 顏色漸變
                novaBullet.color2 = opts.explosionColor;
                novaBullet.restyleAt = opts.novaLife * (0.3 + Math.abs(intensityEffect) * 0.2 + Math.abs(expansionPhase) * 0.15);
                
                // 擺動效果
                novaBullet.oscAxis = (nova % 2 === 0) ? 'x' : 'y';
                novaBullet.oscAmp = opts.novaOscAmp * (1 + Math.abs(novaPhase) * 0.8 + Math.abs(intensityEffect) * 1.2);
                novaBullet.oscFreq = opts.novaOscFreq + (nova * 0.00015) + (Math.abs(novaPhase) * 0.00025) + (Math.abs(intensityEffect) * 0.0003);
                novaBullet.angularVel = opts.rotateSpeed * ((nova % 3 === 0) ? 1 : -1) * (0.9 + Math.abs(intensityEffect) * 0.5);
                
                // 新星軌跡
                novaBullet.trailMax = opts.trailMax;
                novaBullet.trailIntervalMs = opts.trailIntervalMs;
                novaBullet.trailColor = opts.novaColor;
                novaBullet.trailIntensity = Math.abs(intensityEffect) + Math.abs(expansionPhase) + 0.6;
                novaBullet.novaTrail = true;
                novaBullet.expansionTrail = true;
                
                // 新星發光
                novaBullet.glowEffect = true;
                novaBullet.glowSize = currentNovaSize * (2.5 + Math.abs(novaPhase) * 1.5 + Math.abs(intensityEffect) * 2 + Math.abs(expansionPhase) * 1.8);
                novaBullet.glowColor = opts.novaColor;
                novaBullet.glowIntensity = 0.5 + Math.abs(novaPhase) * 0.3 + Math.abs(intensityEffect) * 0.4 + Math.abs(expansionPhase) * 0.35;
                novaBullet.novaGlow = true;
                
                // 極端新星標記
                if (Math.abs(intensityEffect) > 0.8 * opts.burstIntensity) {
                  novaBullet.extremeNova = true;
                  novaBullet.supernova = true;
                  novaBullet.stellarBurst = true;
                  novaBullet.energyOutput = Math.abs(intensityEffect) * 3.5;
                }
              }
            }
          }
        }
        
        // 爆發射線 - 持續攻擊
        explosionTimer += 16;
        if (explosionTimer >= opts.explosionInterval) {
          explosionTimer = 0;
          
          for (let explosion = 0; explosion < opts.explosionRays; explosion++) {
            const explosionAngle = (explosion * TAU) / opts.explosionRays + theta * 0.2;
            
            const explosionEffect = Math.sin(explosion * 0.8 + theta * 0.18) * 0.3;
            const stellarEffect = Math.cos(explosion * 1.1 + theta * 0.15) * 0.25;
            const explosionSpeed = opts.explosionSpeed * (1 + Math.abs(novaPhase) * 0.4 + Math.abs(explosionEffect) * 1.5);
            
            const vx = Math.cos(explosionAngle) * explosionSpeed;
            const vy = Math.sin(explosionAngle) * explosionSpeed;
            
            const currentExplosionSize = opts.explosionSize * (1 + Math.abs(explosionEffect) * 0.4);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.explosionLife, currentExplosionSize, opts.explosionColor);
            const explosionBullet = BS.bullets[BS.bullets.length - 1];
            if (explosionBullet) {
              explosionBullet.shape = 'ellipse';
              explosionBullet.rx = currentExplosionSize * 1.5;
              explosionBullet.ry = currentExplosionSize * 0.7;
              explosionBullet.orientToVel = true;
              
              explosionBullet.explosionType = 'ray';
              explosionBullet.explosionEffect = explosionEffect;
              explosionBullet.stellarEffect = stellarEffect;
              explosionBullet.explosionIntensity = Math.abs(explosionEffect) + Math.abs(stellarEffect) + Math.abs(novaPhase);
              
              // 顏色漸變
              explosionBullet.color2 = opts.fragmentColor;
              explosionBullet.restyleAt = opts.explosionLife * 0.4;
              
              // 爆發擺動
              explosionBullet.oscAxis = (explosion % 2 === 0) ? 'x' : 'y';
              explosionBullet.oscAmp = opts.novaOscAmp * 0.8;
              explosionBullet.oscFreq = opts.novaOscFreq * 1.1;
              explosionBullet.angularVel = opts.rotateSpeed * ((explosion % 3 === 0) ? 1 : -1) * 0.8;
              
              // 爆發軌跡
              explosionBullet.trailMax = opts.trailMax + 1;
              explosionBullet.trailIntervalMs = opts.trailIntervalMs - 3;
              explosionBullet.trailColor = opts.explosionColor;
              explosionBullet.trailIntensity = Math.abs(explosionEffect) + Math.abs(novaPhase) * 0.5 + 0.7;
              explosionBullet.explosionTrail = true;
              explosionBullet.rayTrail = true;
              
              // 爆發發光
              explosionBullet.glowEffect = true;
              explosionBullet.glowSize = currentExplosionSize * (2.8 + Math.abs(novaPhase) * 1.8 + Math.abs(explosionEffect) * 2.2);
              explosionBullet.glowColor = opts.explosionColor;
              explosionBullet.glowIntensity = 0.4 + Math.abs(novaPhase) * 0.25 + Math.abs(explosionEffect) * 0.35;
              explosionBullet.explosionGlow = true;
              explosionBullet.rayGlow = true;
            }
          }
        }
        
        // 星體碎片（中等概率）
        if (Math.random() < opts.fragmentProbability && Math.abs(expansionPhase) > 0.6) {
          const fragmentCount = opts.stellarFragments;
          const fragmentDirection = Math.random() * TAU;
          
          for (let fragment = 0; fragment < fragmentCount; fragment++) {
            const fragmentAngle = fragmentDirection + (fragment - fragmentCount/2) * 0.25;
            
            const fragmentEffect = Math.sin(fragment * 0.9 + theta * 0.12) * 0.35;
            const expansionFragmentEffect = Math.cos(fragment * 1.3 + theta * 0.1) * opts.expansionRate * 0.8;
            const fragmentSpeed = opts.fragmentSpeed * (1 + Math.abs(novaPhase) * 0.3 + Math.abs(fragmentEffect));
            
            const vx = Math.cos(fragmentAngle) * fragmentSpeed;
            const vy = Math.sin(fragmentAngle) * fragmentSpeed;
            
            const currentFragmentSize = opts.fragmentSize * (1 + Math.abs(fragmentEffect) * 0.3 + Math.abs(expansionFragmentEffect) * 0.4);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.fragmentLife, currentFragmentSize, opts.fragmentColor);
            const fragmentBullet = BS.bullets[BS.bullets.length - 1];
            if (fragmentBullet) {
              fragmentBullet.shape = 'ellipse';
              fragmentBullet.rx = currentFragmentSize * 1.3;
              fragmentBullet.ry = currentFragmentSize * 0.8;
              fragmentBullet.orientToVel = true;
              
              fragmentBullet.fragmentType = 'stellar';
              fragmentBullet.fragmentEffect = fragmentEffect;
              fragmentBullet.expansionFragmentEffect = expansionFragmentEffect;
              fragmentBullet.stellarFragment = true;
              fragmentBullet.novaFragment = true;
              
              // 顏色漸變
              fragmentBullet.color2 = opts.novaColor;
              fragmentBullet.restyleAt = opts.fragmentLife * 0.3;
              
              // 碎片擺動
              fragmentBullet.oscAxis = (fragment % 2 === 0) ? 'x' : 'y';
              fragmentBullet.oscAmp = opts.novaOscAmp * 0.9;
              fragmentBullet.oscFreq = opts.novaOscFreq * 1.2;
              fragmentBullet.angularVel = opts.rotateSpeed * ((fragment % 3 === 0) ? 1 : -1) * 0.7;
              
              // 碎片軌跡
              fragmentBullet.trailMax = Math.floor(opts.trailMax * 0.8);
              fragmentBullet.trailIntervalMs = opts.trailIntervalMs + 4;
              fragmentBullet.trailColor = opts.fragmentColor;
              fragmentBullet.trailIntensity = Math.abs(fragmentEffect) + Math.abs(expansionPhase) * 0.4 + 0.5;
              fragmentBullet.fragmentTrail = true;
              fragmentBullet.stellarTrail = true;
              
              // 碎片發光
              fragmentBullet.glowEffect = true;
              fragmentBullet.glowSize = currentFragmentSize * (2.2 + Math.abs(novaPhase) * 1.2 + Math.abs(fragmentEffect) * 1.5);
              fragmentBullet.glowColor = opts.fragmentColor;
              fragmentBullet.glowIntensity = 0.35 + Math.abs(novaPhase) * 0.2 + Math.abs(fragmentEffect) * 0.25;
              fragmentBullet.fragmentGlow = true;
              fragmentBullet.stellarGlow = true;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第9階段：CelestialJudgment（天體審判）- 終極華麗模式
  function celestialJudgment(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      judgmentCores: 30,        // 審判核心數量 (建議值: 8-14)
      divineRays: 30,           // 神聖射線數量 (建議值: 14-20)
      celestialOrbs: 30,        // 天體寶珠數量 (建議值: 10-16)
      
      // ===== 發射頻率控制 =====
      judgmentInterval: 320,    // 審判間隔毫秒 (建議值: 280-380)
      divineInterval: 180,      // 神聖間隔毫秒 (建議值: 160-220)
      orbProbability: 0.4,      // 寶珠概率 (建議值: 0.3-0.5)
      
      // ===== 基礎屬性 =====
      judgmentSpeed: 5.5,       // 審判速度 (建議值: 5.0-6.2)
      divineSpeed: 6.8,         // 神聖速度 (建議值: 6.2-7.5)
      orbSpeed: 4.2,            // 寶珠速度 (建議值: 3.8-4.8)
      judgmentLife: 9200,       // 審判生命周期 (建議值: 8600-9800)
      divineLife: 7400,         // 神聖生命周期 (建議值: 7000-7800)
      orbLife: 8600,            // 寶珠生命周期 (建議值: 8000-9200)
      judgmentSize: 16,         // 審判大小 (建議值: 14-20)
      divineSize: 12,           // 神聖大小 (建議值: 10-14)
      orbSize: 14,              // 寶珠大小 (建議值: 12-16)
      divineIntensity: 0.22,    // 神聖強度 (建議值: 0.18-0.28)
      
      // ===== 顏色配置 =====
      judgmentColor: '#ffd700', // 審判金 (主色)
      divineColor: '#ffffff',   // 神聖白 (延遲換色)
      orbColor: '#87ceeb',      // 寶珠藍 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.28,        // 旋轉速度 (建議值: 0.24-0.32)
      celestialHarmony: 0.12,   // 天體和諧 (建議值: 0.09-0.16)
      
      // ===== 擺動效果 =====
      judgmentOscAmp: 36,       // 審判擺動幅度 (建議值: 30-44)
      judgmentOscFreq: 0.0032,  // 審判擺動頻率 (建議值: 0.0026-0.0038)
      
      // ===== 軌跡效果 =====
      trailMax: 14,             // 軌跡長度 (建議值: 12-16)
      trailIntervalMs: 16,      // 軌跡間隔毫秒 (建議值: 14-20)
      divineTrail: true,        // 神聖軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,        // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，模擬天體審判終極模式
      // 優化重點: 終極華麗效果，融合所有先前模式的精華
      // 性能考量: 控制總子彈數量 < 70 個/幀 (終極華麗)
      // 平衡性: 終極模式但保持可玩性，所有參數可調
    }, options || {});
    
    let theta = 0;
    let judgmentPhase = 0;
    let harmonyPhase = 0;
    let judgmentTimer = 0;
    let divineTimer = 0;
    
    return function(e, BS) {
      try {
        judgmentPhase = Math.sin(theta * 0.48);
        harmonyPhase = Math.cos(theta * 0.38);
        
        // 主要審判核心 - 終極攻擊
        judgmentTimer += 16;
        if (judgmentTimer >= opts.judgmentInterval) {
          judgmentTimer = 0;
          
          for (let judgment = 0; judgment < opts.judgmentCores; judgment++) {
            const baseAngle = (judgment * TAU) / opts.judgmentCores;
            
            // 天體和諧效果
            const harmonyEffect = Math.sin(judgment * opts.celestialHarmony + theta * 0.28) * 0.4;
            const divineEffect = Math.cos(judgment * 1.3 + theta * 0.22) * 0.35;
            const judgmentSpeed = opts.judgmentSpeed * (1 + Math.abs(judgmentPhase) * 0.6 + Math.abs(harmonyEffect) * 1.8);
            
            // 終極多階段審判
            for (let phase = 0; phase < 3; phase++) {
              const phaseDelay = phase * 0.2;
              const judgmentAngle = baseAngle + phaseDelay + theta * 0.35 + harmonyEffect * 2;
              
              const currentJudgmentSize = opts.judgmentSize * (1 + Math.abs(harmonyEffect) * 0.5 + Math.abs(divineEffect) * 0.3);
              
              const vx = Math.cos(judgmentAngle) * judgmentSpeed;
              const vy = Math.sin(judgmentAngle) * judgmentSpeed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.judgmentLife, currentJudgmentSize, opts.judgmentColor);
              const judgmentBullet = BS.bullets[BS.bullets.length - 1];
              if (judgmentBullet) {
                judgmentBullet.shape = phase === 1 ? 'ellipse' : 'circle';
                judgmentBullet.rx = currentJudgmentSize * (1.3 + phase * 0.2);
                judgmentBullet.ry = currentJudgmentSize * (0.8 - phase * 0.1);
                judgmentBullet.orientToVel = true;
                
                judgmentBullet.judgmentType = 'core';
                judgmentBullet.harmonyEffect = harmonyEffect;
                judgmentBullet.divineEffect = divineEffect;
                judgmentBullet.judgmentPhase = phase;
                judgmentBullet.celestialHarmony = Math.abs(harmonyEffect) + Math.abs(divineEffect) + Math.abs(judgmentPhase);
                
                // 顏色漸變（終極漸變）
                judgmentBullet.color2 = phase === 0 ? opts.divineColor : opts.orbColor;
                judgmentBullet.restyleAt = opts.judgmentLife * (0.25 + Math.abs(harmonyEffect) * 0.15 + Math.abs(divineEffect) * 0.1 + Math.abs(judgmentPhase) * 0.12);
                
                // 終極擺動
                judgmentBullet.oscAxis = (judgment % 2 === 0) ? 'x' : 'y';
                judgmentBullet.oscAmp = opts.judgmentOscAmp * (1 + Math.abs(judgmentPhase) * 0.9 + Math.abs(harmonyEffect) * 1.3 + Math.abs(divineEffect) * 1.1);
                judgmentBullet.oscFreq = opts.judgmentOscFreq + (judgment * 0.00012) + (Math.abs(judgmentPhase) * 0.0002) + (Math.abs(harmonyEffect) * 0.00028) + (Math.abs(divineEffect) * 0.00025);
                judgmentBullet.angularVel = opts.rotateSpeed * ((judgment % 3 === 0) ? 1 : -1) * (1.0 + Math.abs(harmonyEffect) * 0.6 + Math.abs(divineEffect) * 0.5);
                
                // 終極軌跡
                judgmentBullet.trailMax = opts.trailMax + phase;
                judgmentBullet.trailIntervalMs = opts.trailIntervalMs - phase * 2;
                judgmentBullet.trailColor = phase === 0 ? opts.judgmentColor : (phase === 1 ? opts.divineColor : opts.orbColor);
                judgmentBullet.trailIntensity = Math.abs(harmonyEffect) + Math.abs(divineEffect) + Math.abs(judgmentPhase) + 0.8;
                judgmentBullet.divineTrail = true;
                judgmentBullet.celestialTrail = true;
                judgmentBullet.judgmentTrail = true;
                
                // 終極發光
                judgmentBullet.glowEffect = true;
                judgmentBullet.glowSize = currentJudgmentSize * (3 + Math.abs(judgmentPhase) * 2.5 + Math.abs(harmonyEffect) * 3.5 + Math.abs(divineEffect) * 3.2);
                judgmentBullet.glowColor = phase === 0 ? opts.judgmentColor : (phase === 1 ? opts.divineColor : opts.orbColor);
                judgmentBullet.glowIntensity = 0.6 + Math.abs(judgmentPhase) * 0.5 + Math.abs(harmonyEffect) * 0.7 + Math.abs(divineEffect) * 0.6;
                judgmentBullet.divineGlow = true;
                judgmentBullet.celestialGlow = true;
                judgmentBullet.judgmentGlow = true;
                
                // 終極審判標記
                if (Math.abs(harmonyEffect) > 0.8 * opts.celestialHarmony) {
                  judgmentBullet.extremeJudgment = true;
                  judgmentBullet.divineJudgment = true;
                  judgmentBullet.celestialJudgment = true;
                  judgmentBullet.cosmicJudgment = true;
                  judgmentBullet.energyOutput = Math.abs(harmonyEffect) * 4.5;
                }
              }
            }
          }
        }
        
        // 神聖射線 - 持續攻擊
        divineTimer += 16;
        if (divineTimer >= opts.divineInterval) {
          divineTimer = 0;
          
          for (let divine = 0; divine < opts.divineRays; divine++) {
            const divineAngle = (divine * TAU) / opts.divineRays + theta * 0.25;
            
            const divineEffect = Math.sin(divine * 0.9 + theta * 0.2) * 0.3;
            const celestialEffect = Math.cos(divine * 1.2 + theta * 0.18) * 0.28;
            const divineSpeed = opts.divineSpeed * (1 + Math.abs(judgmentPhase) * 0.4 + Math.abs(divineEffect) * 1.2);
            
            const vx = Math.cos(divineAngle) * divineSpeed;
            const vy = Math.sin(divineAngle) * divineSpeed;
            
            const currentDivineSize = opts.divineSize * (1 + Math.abs(divineEffect) * 0.4 + Math.abs(celestialEffect) * 0.3);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.divineLife, currentDivineSize, opts.divineColor);
            const divineBullet = BS.bullets[BS.bullets.length - 1];
            if (divineBullet) {
              divineBullet.shape = 'ellipse';
              divineBullet.rx = currentDivineSize * 1.8;
              divineBullet.ry = currentDivineSize * 0.6;
              divineBullet.orientToVel = true;
              
              divineBullet.divineType = 'ray';
              divineBullet.divineEffect = divineEffect;
              divineBullet.celestialEffect = celestialEffect;
              divineBullet.divineIntensity = Math.abs(divineEffect) + Math.abs(celestialEffect) + Math.abs(judgmentPhase);
              
              // 顏色漸變
              divineBullet.color2 = opts.orbColor;
              divineBullet.restyleAt = opts.divineLife * 0.5;
              
              // 神聖擺動
              divineBullet.oscAxis = (divine % 2 === 0) ? 'x' : 'y';
              divineBullet.oscAmp = opts.judgmentOscAmp * 0.7 * (1 + Math.abs(divineEffect) * 0.8 + Math.abs(celestialEffect) * 0.6);
              divineBullet.oscFreq = opts.judgmentOscFreq * 1.05;
              divineBullet.angularVel = opts.rotateSpeed * ((divine % 3 === 0) ? 1 : -1) * 0.85;
              
              // 神聖軌跡
              divineBullet.trailMax = opts.trailMax;
              divineBullet.trailIntervalMs = opts.trailIntervalMs + 2;
              divineBullet.trailColor = opts.divineColor;
              divineBullet.trailIntensity = Math.abs(divineEffect) + Math.abs(celestialEffect) + 0.7;
              divineBullet.divineTrail = true;
              divineBullet.rayTrail = true;
              
              // 神聖發光
              divineBullet.glowEffect = true;
              divineBullet.glowSize = currentDivineSize * (2.5 + Math.abs(judgmentPhase) * 1.8 + Math.abs(divineEffect) * 2.2 + Math.abs(celestialEffect) * 2);
              divineBullet.glowColor = opts.divineColor;
              divineBullet.glowIntensity = 0.5 + Math.abs(judgmentPhase) * 0.35 + Math.abs(divineEffect) * 0.45 + Math.abs(celestialEffect) * 0.4;
              divineBullet.divineGlow = true;
              divineBullet.rayGlow = true;
            }
          }
        }
        
        // 天體寶珠（中等概率）
        if (Math.random() < opts.orbProbability && Math.abs(harmonyPhase) > 0.6) {
          const orbCount = opts.celestialOrbs;
          const orbDirection = Math.random() * TAU;
          
          for (let orb = 0; orb < orbCount; orb++) {
            const orbAngle = orbDirection + (orb - orbCount/2) * 0.2;
            
            const orbEffect = Math.sin(orb * 1.1 + theta * 0.32) * 0.4;
            const harmonyOrbEffect = Math.cos(orb * 1.4 + theta * 0.28) * opts.celestialHarmony * 1.5;
            const orbSpeed = opts.orbSpeed * (1 + Math.abs(judgmentPhase) * 0.3 + Math.abs(orbEffect) + Math.abs(harmonyOrbEffect));
            
            const vx = Math.cos(orbAngle) * orbSpeed;
            const vy = Math.sin(orbAngle) * orbSpeed;
            
            const currentOrbSize = opts.orbSize * (1 + Math.abs(orbEffect) * 0.3 + Math.abs(harmonyOrbEffect) * 0.5);
            
            BS.addBullet(e.x, e.y, vx, vy, opts.orbLife, currentOrbSize, opts.orbColor);
            const orbBullet = BS.bullets[BS.bullets.length - 1];
            if (orbBullet) {
              orbBullet.shape = 'circle';
              orbBullet.orbType = 'celestial';
              orbBullet.orbEffect = orbEffect;
              orbBullet.harmonyOrbEffect = harmonyOrbEffect;
              orbBullet.celestialOrb = true;
              orbBullet.divineOrb = true;
              
              // 顏色漸變
              orbBullet.color2 = opts.judgmentColor;
              orbBullet.restyleAt = opts.orbLife * 0.3;
              
              // 寶珠擺動
              orbBullet.oscAxis = (orb % 2 === 0) ? 'x' : 'y';
              orbBullet.oscAmp = opts.judgmentOscAmp * 0.8 * (1 + Math.abs(orbEffect) * 0.7 + Math.abs(harmonyOrbEffect) * 0.9);
              orbBullet.oscFreq = opts.judgmentOscFreq * 0.95;
              orbBullet.angularVel = opts.rotateSpeed * ((orb % 3 === 0) ? 1 : -1) * 0.75;
              
              // 寶珠軌跡
              orbBullet.trailMax = Math.floor(opts.trailMax * 0.9);
              orbBullet.trailIntervalMs = opts.trailIntervalMs + 4;
              orbBullet.trailColor = opts.orbColor;
              orbBullet.trailIntensity = Math.abs(orbEffect) + Math.abs(harmonyOrbEffect) + 0.6;
              orbBullet.orbTrail = true;
              orbBullet.celestialTrail = true;
              
              // 寶珠發光
              orbBullet.glowEffect = true;
              orbBullet.glowSize = currentOrbSize * (2 + Math.abs(judgmentPhase) * 1.2 + Math.abs(orbEffect) * 1.8 + Math.abs(harmonyOrbEffect) * 2.2);
              orbBullet.glowColor = opts.orbColor;
              orbBullet.glowIntensity = 0.4 + Math.abs(judgmentPhase) * 0.25 + Math.abs(orbEffect) * 0.35 + Math.abs(harmonyOrbEffect) * 0.4;
              orbBullet.orbGlow = true;
              orbBullet.celestialGlow = true;
              
              // 極端寶珠標記
              if (Math.abs(harmonyOrbEffect) > 0.8 * opts.celestialHarmony) {
                orbBullet.extremeOrb = true;
                orbBullet.divineOrb = true;
                orbBullet.celestialOrb = true;
                orbBullet.cosmicOrb = true;
                orbBullet.energyOutput = Math.abs(harmonyOrbEffect) * 3.5;
              }
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // ==========================================
  // 掛載到全域物件（零汙染封裝）
  // ==========================================
  const BossPatterns3 = {
    // 第0階段：小行星帶
    asteroidBelt,
    // 第1階段：太陽耀斑
    solarFlare,
    // 第2階段：流星雨
    meteorShower,
    // 第3階段：星雲脈衝
    nebulaPulse,
    // 第4階段：彗星軌跡
    cometTrail,
    // 第5階段：恆星坍縮
    stellarCollapse,
    // 第6階段：軌道之舞
    orbitalDance,
    // 第7階段：引力鞭笞
    gravityWhip,
    // 第8階段：新星爆發
    novaBurst,
    // 第9階段：天體審判
    celestialJudgment,
  };

  global.ChallengeBossPatterns3 = BossPatterns3;
})(this);