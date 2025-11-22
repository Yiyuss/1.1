// 挑戰模式第2張地圖「LV2.星雲」專用彈幕樣式庫（完全獨立，零汙染）
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

  // 第0階段：NebulaSpiral（星雲螺旋）- 螺旋星塵模式
  function nebulaSpiral(options) {
    const opts = Object.assign({
      spiralArms: 3,          // 螺旋臂數量
      armParticles: 12,       // 每臂粒子數
      armSpeed: 2.8,          // 臂速度
      armLife: 7600,          // 生命周期
      armSize: 9,             // 粒子大小
      nebulaColor: '#e6e6fa', // 星雲紫（主色）
      stardustColor: '#ffffff', // 星塵白（延遲換色）
      spiralTightness: 0.15,  // 螺旋緊密度
      rotateSpeed: 0.12,      // 旋轉速度
      expansionRate: 0.08,    // 擴張速率
      armOscAmp: 24,          // 臂擺動幅度
      armOscFreq: 0.0020,     // 臂擺動頻率
      trailMax: 8,            // 軌跡長度
      trailIntervalMs: 45,   // 軌跡間隔
      spaceDensity: 1,
    }, options || {});
    
    let theta = 0;
    let spiralPhase = 0;
    
    return function(e, BS) {
      try {
        spiralPhase = Math.sin(theta * 0.3);
        
        for (let arm = 0; arm < opts.spiralArms; arm++) {
          const armAngle = (arm * TAU) / opts.spiralArms;
          
          for (let particle = 0; particle < opts.armParticles; particle++) {
            const particleProgress = particle / opts.armParticles;
            const spiralRadius = 3 + (particleProgress * (60 / Math.max(0.1, opts.spaceDensity))) * (1 + spiralPhase * 0.15);
            const spiralAngle = armAngle + particleProgress * opts.spiralTightness * TAU + theta * 0.5;
            
            const expansionEffect = 1 + particleProgress * opts.expansionRate;
            const speed = opts.armSpeed * expansionEffect;
            
            const a = spiralAngle;
            const vx = Math.cos(a) * speed;
            const vy = Math.sin(a) * speed;
            
            const currentColor = particleProgress > 0.7 ? opts.stardustColor : opts.nebulaColor;
            const currentSize = opts.armSize * (0.8 + particleProgress * 0.4);
            
            const px = e.x + Math.cos(spiralAngle) * spiralRadius;
            const py = e.y + Math.sin(spiralAngle) * spiralRadius;
            
            BS.addBullet(px, py, vx, vy, opts.armLife, currentSize, currentColor);
            const b = BS.bullets[BS.bullets.length - 1];
            if (b) {
              b.shape = particleProgress > 0.5 ? 'ellipse' : 'circle';
              b.rx = currentSize;
              b.ry = currentSize * (1 - particleProgress * 0.2);
              b.orientToVel = particleProgress > 0.6;
              
              b.color2 = opts.stardustColor;
              b.restyleAt = opts.armLife * (0.3 + particleProgress * 0.4);
              
              b.oscAxis = (arm % 2 === 0) ? 'x' : 'y';
              b.oscAmp = opts.armOscAmp * (1 + spiralPhase * 0.5) * (1 + particleProgress * 0.3);
              b.oscFreq = opts.armOscFreq + (arm * 0.0001) + (particle * 0.0002);
              b.angularVel = opts.rotateSpeed * ((arm % 3 === 0) ? 1 : -1) * (0.4 + particleProgress * 0.3);
              
              if (particleProgress > 0.4 && particle % 2 === 0) {
                b.trailMax = opts.trailMax;
                b.trailIntervalMs = opts.trailIntervalMs;
                b.trailColor = currentColor;
                b.trailIntensity = particleProgress;
              }
              
              b.glowEffect = true;
              b.glowSize = currentSize * (1.5 + particleProgress * 2);
              b.glowColor = currentColor;
              b.glowIntensity = 0.2 + particleProgress * 0.6;
              
              if (particleProgress > 0.8) {
                b.stardust = true;
                b.formationProbability = particleProgress;
              }
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第1階段：CosmicWeb（宇宙之網）- 發射型彈幕
  function cosmicWeb(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      mainBeams: 15,           // 主射線數量 (建議值: 6-12)
      subBeams: 12,            // 副射線數量 (建議值: 3-8)
      beamSpread: 0.3,        // 射線擴散角度 (建議值: 0.1-0.6)
      
      // ===== 發射頻率控制 =====
      burstCount: 7,          // 每波連發數 (建議值: 2-5)
      burstDelay: 150,        // 連發間隔毫秒 (建議值: 100-300)
      
      // ===== 基礎屬性 =====
      beamSpeed: 3.2,         // 射線速度 (建議值: 2.5-4.0)
      beamLife: 8200,         // 生命周期 (建議值: 7000-9500)
      beamSize: 12,           // 射線大小 (建議值: 8-18)
      
      // ===== 顏色配置 =====
      cosmicColor: '#9370db',     // 宇宙紫 (主色)
      energyColor: '#dda0dd',     // 能量粉 (副色)
      plasmaColor: '#ff69b4',     // 等離子粉紅 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.12,      // 旋轉速度 (建議值: 0.08-0.18)
      pulseFreq: 0.0028,      // 脈動頻率 (建議值: 0.002-0.004)
      pulseAmp: 0.35,         // 脈動幅度 (建議值: 0.2-0.5)
      
      // ===== 擺動效果 =====
      cosmicOscAmp: 28,       // 宇宙擺動幅度 (建議值: 20-40)
      cosmicOscFreq: 0.0020,  // 宇宙擺動頻率 (建議值: 0.0015-0.0025)
      
      // ===== 軌跡效果 =====
      trailMax: 8,            // 軌跡長度 (建議值: 6-12)
      trailIntervalMs: 45,    // 軌跡間隔毫秒 (建議值: 30-70)
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,      // 空間密度倍率 (建議值: 0.7-1.5)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，移除網狀結構
      // 優化重點: 多重射線發射，可調節密度和擴散角度
      // 性能考量: 控制總子彈數量 < 50 個/幀
      // 平衡性: 提供多個可調參數，便於微調難度
    }, options || {});
    
    let theta = 0;
    let cosmicPhase = 0;
    let burstTimer = 0;
    let burstIndex = 0;
    
    return function(e, BS) {
      try {
        cosmicPhase = Math.sin(theta * 0.35);
        
        // 連發控制
        burstTimer += 16; // 假設每幀16ms
        if (burstTimer >= opts.burstDelay) {
          burstTimer = 0;
          burstIndex = (burstIndex + 1) % opts.burstCount;
          
          // 生成主射線 - 多重角度發射
          for (let beam = 0; beam < opts.mainBeams; beam++) {
            const baseAngle = (beam * TAU) / opts.mainBeams;
            
            // 主要射線
            const mainAngle = baseAngle + theta * 0.4 + cosmicPhase * 0.2;
            const mainSpeed = opts.beamSpeed * (1 + Math.sin(beam + theta * 0.1) * 0.2);
            const mainVx = Math.cos(mainAngle) * mainSpeed;
            const mainVy = Math.sin(mainAngle) * mainSpeed;
            
            // 從BOSS中心射出
            const px = e.x;
            const py = e.y;
            
            BS.addBullet(px, py, mainVx, mainVy, opts.beamLife, opts.beamSize, opts.cosmicColor);
            const mainBullet = BS.bullets[BS.bullets.length - 1];
            if (mainBullet) {
              mainBullet.shape = 'ellipse';
              mainBullet.rx = opts.beamSize * 1.5;
              mainBullet.ry = opts.beamSize * 0.7;
              mainBullet.orientToVel = true;
              
              // 脈動效果
              mainBullet.pulsePhase = beam * 0.2;
              mainBullet.pulseFreq = opts.pulseFreq;
              mainBullet.pulseAmp = opts.pulseAmp;
              
              // 顏色漸變
              mainBullet.color2 = opts.energyColor;
              mainBullet.restyleAt = opts.beamLife * 0.3;
              
              // 擺動效果
              mainBullet.oscAxis = (beam % 2 === 0) ? 'x' : 'y';
              mainBullet.oscAmp = opts.cosmicOscAmp * (1 + Math.abs(cosmicPhase) * 0.4);
              mainBullet.oscFreq = opts.cosmicOscFreq + (beam * 0.00015);
              mainBullet.angularVel = opts.rotateSpeed * ((beam % 3 === 0) ? 1 : -1);
              
              // 軌跡效果
              if (beam % 2 === 0) {
                mainBullet.trailMax = opts.trailMax;
                mainBullet.trailIntervalMs = opts.trailIntervalMs;
                mainBullet.trailColor = opts.cosmicColor;
                mainBullet.trailIntensity = 0.7;
                mainBullet.cosmicTrail = true;
              }
              
              // 發光效果
              mainBullet.glowEffect = true;
              mainBullet.glowSize = opts.beamSize * 2.2;
              mainBullet.glowColor = opts.cosmicColor;
              mainBullet.glowIntensity = 0.4 + Math.abs(cosmicPhase) * 0.3;
              
              mainBullet.beamType = 'cosmic';
              mainBullet.energyLevel = Math.abs(cosmicPhase) + 0.5;
            }
            
            // 副射線 - 擴散角度發射
            for (let sub = 0; sub < opts.subBeams; sub++) {
              const spreadAngle = baseAngle + (sub - opts.subBeams/2) * opts.beamSpread;
              const subAngle = spreadAngle + theta * 0.3;
              const subSpeed = mainSpeed * 0.8;
              const subVx = Math.cos(subAngle) * subSpeed;
              const subVy = Math.sin(subAngle) * subSpeed;
              
              const subSize = opts.beamSize * 0.7;
              const subLife = opts.beamLife * 0.8;
              
              BS.addBullet(px, py, subVx, subVy, subLife, subSize, opts.energyColor);
              const subBullet = BS.bullets[BS.bullets.length - 1];
              if (subBullet) {
                subBullet.shape = 'circle';
                subBullet.color2 = opts.plasmaColor;
                subBullet.restyleAt = subLife * 0.5;
                
                subBullet.subBeam = true;
                subBullet.parentBeam = beam;
                subBullet.spreadAngle = spreadAngle;
                
                // 較弱的擺動
                subBullet.oscAxis = (sub % 2 === 0) ? 'x' : 'y';
                subBullet.oscAmp = opts.cosmicOscAmp * 0.6;
                subBullet.oscFreq = opts.cosmicOscFreq * 1.2;
              }
            }
          }
          
          // 特殊能量爆發（偶爾觸發）
          if (burstIndex === 0 && Math.random() < 0.3) {
            const burstCount = 5;
            const burstAngle = Math.random() * TAU;
            for (let burst = 0; burst < burstCount; burst++) {
              const angle = burstAngle + (burst - burstCount/2) * 0.3;
              const speed = opts.beamSpeed * 1.5;
              const size = opts.beamSize * 1.2;
              const vx = Math.cos(angle) * speed;
              const vy = Math.sin(angle) * speed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.beamLife, size, opts.plasmaColor);
              const burstBullet = BS.bullets[BS.bullets.length - 1];
              if (burstBullet) {
                burstBullet.shape = 'ellipse';
                burstBullet.rx = size * 2;
                burstBullet.ry = size * 0.8;
                burstBullet.orientToVel = true;
                burstBullet.energyBurst = true;
                burstBullet.burstIntensity = Math.abs(cosmicPhase) + 1;
              }
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第2階段：StellarNursery（恆星搖籃）- 發射型彈幕
  function stellarNursery(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      stellarBursts: 12,       // 恆星爆發數量 (建議值: 4-10)
      plasmaStreams: 14,       // 等離子流數量 (建議值: 6-12)
      burstSpread: 0.4,         // 爆發擴散角度 (建議值: 0.2-0.7)
      
      // ===== 發射頻率控制 =====
      emissionRate: 120,      // 發射間隔毫秒 (建議值: 80-200)
      streamInterval: 80,       // 流發射間隔毫秒 (建議值: 60-120)
      
      // ===== 基礎屬性 =====
      burstSpeed: 3.5,        // 爆發速度 (建議值: 2.8-4.2)
      streamSpeed: 2.2,       // 流速度 (建議值: 1.8-2.8)
      burstLife: 9000,        // 爆發生命周期 (建議值: 8000-10000)
      streamLife: 6500,       // 流生命周期 (建議值: 5500-7500)
      burstSize: 14,          // 爆發大小 (建議值: 10-18)
      streamSize: 9,          // 流大小 (建議值: 7-12)
      
      // ===== 顏色配置 =====
      stellarColor: '#ffd700',  // 恆星金 (主色)
      plasmaColor: '#ff4500',   // 等離子橙 (副色)
      fusionColor: '#ff69b4',   // 融合粉 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.15,      // 旋轉速度 (建議值: 0.1-0.2)
      birthIntensity: 0.08,   // 誕生強度 (建議值: 0.05-0.12)
      
      // ===== 擺動效果 =====
      stellarOscAmp: 32,      // 恆星擺動幅度 (建議值: 25-40)
      stellarOscFreq: 0.0025, // 恆星擺動頻率 (建議值: 0.002-0.003)
      
      // ===== 軌跡效果 =====
      trailMax: 9,            // 軌跡長度 (建議值: 7-12)
      trailIntervalMs: 35,    // 軌跡間隔毫秒 (建議值: 25-50)
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,      // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，移除原恆星環繞結構
      // 優化重點: 恆星爆發式發射，模擬恆星誕生時的能量釋放
      // 性能考量: 控制總子彈數量 < 60 個/幀
      // 平衡性: 提供多層次發射模式，適應不同難度需求
    }, options || {});
    
    let theta = 0;
    let stellarPhase = 0;
    let emissionTimer = 0;
    let streamTimer = 0;
    
    return function(e, BS) {
      try {
        stellarPhase = Math.sin(theta * 0.45);
        
        // 主要恆星爆發發射
        emissionTimer += 16;
        if (emissionTimer >= opts.emissionRate) {
          emissionTimer = 0;
          
          // 恆星爆發 - 多重角度同時發射
          for (let burst = 0; burst < opts.stellarBursts; burst++) {
            const baseAngle = (burst * TAU) / opts.stellarBursts;
            
            // 主要爆發射線
            const birthEffect = 1 + Math.sin(burst + theta * 0.2) * opts.birthIntensity;
            const burstSpeed = opts.burstSpeed * birthEffect;
            const burstAngle = baseAngle + theta * 0.5 + stellarPhase * 0.3;
            const burstVx = Math.cos(burstAngle) * burstSpeed;
            const burstVy = Math.sin(burstAngle) * burstSpeed;
            
            // 從BOSS中心射出
            const px = e.x;
            const py = e.y;
            
            BS.addBullet(px, py, burstVx, burstVy, opts.burstLife, opts.burstSize, opts.stellarColor);
            const burstBullet = BS.bullets[BS.bullets.length - 1];
            if (burstBullet) {
              burstBullet.shape = 'ellipse';
              burstBullet.rx = opts.burstSize * 1.8;
              burstBullet.ry = opts.burstSize * 0.8;
              burstBullet.orientToVel = true;
              
              // 誕生強度效果
              burstBullet.birthIntensity = birthEffect;
              burstBullet.stellarMass = birthEffect * 2;
              
              // 顏色漸變
              burstBullet.color2 = opts.plasmaColor;
              burstBullet.restyleAt = opts.burstLife * (0.1 + birthEffect * 0.2);
              
              // 擺動效果
              burstBullet.oscAxis = (burst % 2 === 0) ? 'x' : 'y';
              burstBullet.oscAmp = opts.stellarOscAmp * (1 + birthEffect * 0.6) * (1 + Math.abs(stellarPhase) * 0.4);
              burstBullet.oscFreq = opts.stellarOscFreq + (burst * 0.0002) + (birthEffect * 0.0001);
              burstBullet.angularVel = opts.rotateSpeed * ((burst % 3 === 0) ? 1 : -1) * (0.7 + birthEffect * 0.3);
              
              // 軌跡效果
              burstBullet.trailMax = opts.trailMax;
              burstBullet.trailIntervalMs = opts.trailIntervalMs;
              burstBullet.trailColor = opts.stellarColor;
              burstBullet.trailIntensity = birthEffect;
              burstBullet.stellarTrail = true;
              
              // 發光效果
              burstBullet.glowEffect = true;
              burstBullet.glowSize = opts.burstSize * (2.5 + birthEffect * 2);
              burstBullet.glowColor = opts.stellarColor;
              burstBullet.glowIntensity = 0.4 + birthEffect * 0.5;
              
              burstBullet.burstType = 'stellar';
              burstBullet.formationPhase = theta;
            }
            
            // 擴散式副射線 - 模擬恆星風
            for (let spread = 0; spread < 3; spread++) {
              const spreadAngle = burstAngle + (spread - 1) * opts.burstSpread;
              const windSpeed = burstSpeed * 0.7;
              const windVx = Math.cos(spreadAngle) * windSpeed;
              const windVy = Math.sin(spreadAngle) * windSpeed;
              
              const windSize = opts.burstSize * 0.6;
              const windLife = opts.burstLife * 0.8;
              
              BS.addBullet(px, py, windVx, windVy, windLife, windSize, opts.plasmaColor);
              const windBullet = BS.bullets[BS.bullets.length - 1];
              if (windBullet) {
                windBullet.shape = 'circle';
                windBullet.color2 = opts.fusionColor;
                windBullet.restyleAt = windLife * 0.4;
                
                windBullet.stellarWind = true;
                windBullet.windIntensity = birthEffect * 0.8;
                windBullet.parentBurst = burst;
              }
            }
          }
        }
        
        // 等離子流發射 - 更頻繁的小規模發射
        streamTimer += 16;
        if (streamTimer >= opts.streamInterval) {
          streamTimer = 0;
          
          for (let stream = 0; stream < opts.plasmaStreams; stream++) {
            const streamAngle = (stream * TAU) / opts.plasmaStreams + theta * 0.3;
            const streamEffect = Math.sin(stream * 0.8 + theta * 0.15) * 0.3;
            const streamSpeed = opts.streamSpeed * (1 + streamEffect);
            const streamVx = Math.cos(streamAngle) * streamSpeed;
            const streamVy = Math.sin(streamAngle) * streamSpeed;
            
            const currentStreamSize = opts.streamSize * (1 + Math.abs(streamEffect) * 0.5);
            
            BS.addBullet(e.x, e.y, streamVx, streamVy, opts.streamLife, currentStreamSize, opts.plasmaColor);
            const streamBullet = BS.bullets[BS.bullets.length - 1];
            if (streamBullet) {
              streamBullet.shape = 'ellipse';
              streamBullet.rx = currentStreamSize * 1.2;
              streamBullet.ry = currentStreamSize * 0.6;
              streamBullet.orientToVel = true;
              
              streamBullet.streamEffect = streamEffect;
              streamBullet.plasmaDensity = 1 + Math.abs(streamEffect);
              
              streamBullet.color2 = opts.fusionColor;
              streamBullet.restyleAt = opts.streamLife * 0.6;
              
              streamBullet.plasmaStream = true;
              streamBullet.formationTemp = Math.abs(streamEffect) + 0.7;
            }
          }
        }
        
        // 偶發性的大爆發（模擬超新星前身）
        if (Math.random() < 0.05 && Math.abs(stellarPhase) > 0.8) {
          const novaCount = 12;
          const novaAngle = Math.random() * TAU;
          for (let nova = 0; nova < novaCount; nova++) {
            const angle = novaAngle + (nova - novaCount/2) * 0.2;
            const speed = opts.burstSpeed * 1.8;
            const size = opts.burstSize * 1.5;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            BS.addBullet(e.x, e.y, vx, vy, opts.burstLife, size, opts.fusionColor);
            const novaBullet = BS.bullets[BS.bullets.length - 1];
            if (novaBullet) {
              novaBullet.shape = 'ellipse';
              novaBullet.rx = size * 2.5;
              novaBullet.ry = size * 1.2;
              novaBullet.orientToVel = true;
              novaBullet.novaBurst = true;
              novaBullet.formationEnergy = 2.5;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第3階段：StardustOrbit（星塵軌道）- 發射型彈幕
  function stardustOrbit(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      dustStreams: 15,        // 星塵流數量 (建議值: 8-15)
      meteorShowers: 10,       // 流星雨數量 (建議值: 4-10)
      collisionFragments: 16, // 碰撞碎片數量 (建議值: 8-16)
      
      // ===== 發射頻率控制 =====
      streamRate: 90,         // 星塵流發射間隔毫秒 (建議值: 70-130)
      showerRate: 180,        // 流星雨發射間隔毫秒 (建議值: 150-250)
      fragmentRate: 60,       // 碎片發射間隔毫秒 (建議值: 40-80)
      
      // ===== 基礎屬性 =====
      streamSpeed: 3.8,       // 星塵流速度 (建議值: 3.0-4.5)
      showerSpeed: 4.5,       // 流星雨速度 (建議值: 3.8-5.2)
      fragmentSpeed: 2.8,     // 碎片速度 (建議值: 2.2-3.5)
      streamLife: 7800,       // 星塵流生命周期 (建議值: 7000-8500)
      showerLife: 6200,       // 流星雨生命周期 (建議值: 5500-7000)
      fragmentLife: 5200,     // 碎片生命周期 (建議值: 4500-6000)
      streamSize: 20,         // 星塵流大小 (建議值: 8-14)
      showerSize: 14,          // 流星雨大小 (建議值: 5-10)
      fragmentSize: 10,        // 碎片大小 (建議值: 3-7)
      
      // ===== 顏色配置 =====
      stardustColor: '#ffd700', // 星塵金 (主色)
      meteorColor: '#ff6347',   // 流星紅 (副色)
      collisionColor: '#9370db', // 碰撞紫 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.18,      // 旋轉速度 (建議值: 0.12-0.25)
      orbitalTilt: 0.2,       // 軌道傾斜 (建議值: 0.1-0.3)
      
      // ===== 擺動效果 =====
      orbitOscAmp: 26,        // 軌道擺動幅度 (建議值: 20-35)
      orbitOscFreq: 0.0022,   // 軌道擺動頻率 (建議值: 0.0018-0.0028)
      
      // ===== 軌跡效果 =====
      trailMax: 7,            // 軌跡長度 (建議值: 5-10)
      trailIntervalMs: 40,    // 軌跡間隔毫秒 (建議值: 30-55)
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,      // 空間密度倍率 (建議值: 0.8-1.2)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，移除衛星環繞結構
      // 優化重點: 多角度星塵發射，模擬星際物質高速運動
      // 性能考量: 控制總子彈數量 < 70 個/幀
      // 平衡性: 三種不同類型的發射模式，形成立體攻擊網
    }, options || {});
    
    let theta = 0;
    let orbitPhase = 0;
    let streamTimer = 0;
    let showerTimer = 0;
    let fragmentTimer = 0;
    
    return function(e, BS) {
      try {
        orbitPhase = Math.sin(theta * 0.4);
        
        // 星塵流發射 - 主要攻擊模式
        streamTimer += 16;
        if (streamTimer >= opts.streamRate) {
          streamTimer = 0;
          
          for (let stream = 0; stream < opts.dustStreams; stream++) {
            const baseAngle = (stream * TAU) / opts.dustStreams;
            
            // 軌道傾斜效果
            const tiltEffect = Math.sin(stream * opts.orbitalTilt + theta * 0.3) * 0.15;
            const streamAngle = baseAngle + theta * 0.6 + tiltEffect;
            
            // 速度變化
            const speedVariation = Math.sin(stream * 0.7 + theta * 0.1) * 0.2;
            const streamSpeed = opts.streamSpeed * (1 + speedVariation);
            
            const streamVx = Math.cos(streamAngle) * streamSpeed;
            const streamVy = Math.sin(streamAngle) * streamSpeed;
            
            // 從BOSS中心射出
            const px = e.x;
            const py = e.y;
            
            BS.addBullet(px, py, streamVx, streamVy, opts.streamLife, opts.streamSize, opts.stardustColor);
            const streamBullet = BS.bullets[BS.bullets.length - 1];
            if (streamBullet) {
              streamBullet.shape = 'ellipse';
              streamBullet.rx = opts.streamSize * 1.3;
              streamBullet.ry = opts.streamSize * 0.7;
              streamBullet.orientToVel = true;
              
              streamBullet.streamType = 'stardust';
              streamBullet.orbitalTilt = tiltEffect;
              streamBullet.speedVariation = speedVariation;
              
              // 顏色漸變
              streamBullet.color2 = opts.meteorColor;
              streamBullet.restyleAt = opts.streamLife * 0.4;
              
              // 擺動效果
              streamBullet.oscAxis = (stream % 2 === 0) ? 'x' : 'y';
              streamBullet.oscAmp = opts.orbitOscAmp * (1 + Math.abs(orbitPhase) * 0.3);
              streamBullet.oscFreq = opts.orbitOscFreq + (stream * 0.00012);
              streamBullet.angularVel = opts.rotateSpeed * ((stream % 3 === 0) ? 1 : -1) * (0.8 + Math.abs(tiltEffect));
              
              // 軌跡效果
              streamBullet.trailMax = opts.trailMax;
              streamBullet.trailIntervalMs = opts.trailIntervalMs;
              streamBullet.trailColor = opts.stardustColor;
              streamBullet.trailIntensity = 0.6 + Math.abs(speedVariation);
              streamBullet.dustTrail = true;
              
              // 發光效果
              streamBullet.glowEffect = true;
              streamBullet.glowSize = opts.streamSize * 2;
              streamBullet.glowColor = opts.stardustColor;
              streamBullet.glowIntensity = 0.3 + Math.abs(speedVariation) * 0.2;
            }
          }
        }
        
        // 流星雨發射 - 高速密集攻擊
        showerTimer += 16;
        if (showerTimer >= opts.showerRate) {
          showerTimer = 0;
          
          const showerDirection = Math.random() * TAU;
          for (let shower = 0; shower < opts.meteorShowers; shower++) {
            const angleOffset = (shower - opts.meteorShowers/2) * 0.4;
            const showerAngle = showerDirection + angleOffset;
            
            // 速度變化範圍更大
            const speedBoost = Math.random() * 0.5 + 0.8;
            const showerSpeed = opts.showerSpeed * speedBoost;
            const showerVx = Math.cos(showerAngle) * showerSpeed;
            const showerVy = Math.sin(showerAngle) * showerSpeed;
            
            const currentShowerSize = opts.showerSize * (0.8 + Math.random() * 0.4);
            
            BS.addBullet(e.x, e.y, showerVx, showerVy, opts.showerLife, currentShowerSize, opts.meteorColor);
            const showerBullet = BS.bullets[BS.bullets.length - 1];
            if (showerBullet) {
              showerBullet.shape = 'ellipse';
              showerBullet.rx = currentShowerSize * 1.5;
              showerBullet.ry = currentShowerSize * 0.6;
              showerBullet.orientToVel = true;
              
              showerBullet.showerType = 'meteor';
              showerBullet.speedBoost = speedBoost;
              showerBullet.angleOffset = angleOffset;
              
              // 顏色漸變
              showerBullet.color2 = opts.collisionColor;
              showerBullet.restyleAt = opts.showerLife * 0.3;
              
              // 更強的擺動（高速運動）
              showerBullet.oscAxis = 'both';
              showerBullet.oscAmp = opts.orbitOscAmp * 0.8;
              showerBullet.oscFreq = opts.orbitOscFreq * 1.5;
              showerBullet.angularVel = opts.rotateSpeed * 2 * (Math.random() > 0.5 ? 1 : -1);
              
              // 強化軌跡
              showerBullet.trailMax = opts.trailMax + 2;
              showerBullet.trailIntervalMs = opts.trailIntervalMs - 10;
              showerBullet.trailColor = opts.meteorColor;
              showerBullet.trailIntensity = 0.8 + speedBoost * 0.3;
              showerBullet.meteorTrail = true;
              
              // 強化發光
              showerBullet.glowEffect = true;
              showerBullet.glowSize = currentShowerSize * 3;
              showerBullet.glowColor = opts.meteorColor;
              showerBullet.glowIntensity = 0.5 + speedBoost * 0.3;
            }
          }
        }
        
        // 碰撞碎片發射 - 隨機散射攻擊
        fragmentTimer += 16;
        if (fragmentTimer >= opts.fragmentRate) {
          fragmentTimer = 0;
          
          for (let fragment = 0; fragment < opts.collisionFragments; fragment++) {
            const randomAngle = Math.random() * TAU;
            const fragmentAngle = randomAngle + theta * 0.2;
            
            // 隨機速度變化
            const randomSpeed = Math.random() * 0.6 + 0.7;
            const fragmentSpeed = opts.fragmentSpeed * randomSpeed;
            const fragmentVx = Math.cos(fragmentAngle) * fragmentSpeed;
            const fragmentVy = Math.sin(fragmentAngle) * fragmentSpeed;
            
            const currentFragmentSize = opts.fragmentSize * (0.6 + Math.random() * 0.8);
            
            BS.addBullet(e.x, e.y, fragmentVx, fragmentVy, opts.fragmentLife, currentFragmentSize, opts.collisionColor);
            const fragmentBullet = BS.bullets[BS.bullets.length - 1];
            if (fragmentBullet) {
              fragmentBullet.shape = 'circle';
              fragmentBullet.fragmentType = 'collision';
              fragmentBullet.randomSpeed = randomSpeed;
              fragmentBullet.randomAngle = randomAngle;
              
              // 顏色漸變
              fragmentBullet.color2 = opts.stardustColor;
              fragmentBullet.restyleAt = opts.fragmentLife * 0.5;
              
              // 隨機擺動
              fragmentBullet.oscAxis = Math.random() > 0.5 ? 'x' : 'y';
              fragmentBullet.oscAmp = opts.orbitOscAmp * (0.3 + Math.random() * 0.4);
              fragmentBullet.oscFreq = opts.orbitOscFreq * (0.8 + Math.random() * 0.4);
              fragmentBullet.angularVel = opts.rotateSpeed * (Math.random() - 0.5) * 3;
              
              // 簡單軌跡
              if (Math.random() < 0.3) {
                fragmentBullet.trailMax = Math.floor(opts.trailMax * 0.7);
                fragmentBullet.trailIntervalMs = opts.trailIntervalMs + 20;
                fragmentBullet.trailColor = opts.collisionColor;
                fragmentBullet.trailIntensity = 0.4;
                fragmentBullet.fragmentTrail = true;
              }
              
              // 微弱發光
              fragmentBullet.glowEffect = true;
              fragmentBullet.glowSize = currentFragmentSize * 1.5;
              fragmentBullet.glowColor = opts.collisionColor;
              fragmentBullet.glowIntensity = 0.2;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第4階段：GalacticStorm（銀河風暴）- 螺旋臂風暴模式
  function galacticStorm(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      stormArms: 4,           // 風暴臂數量 (建議值: 3-6)
      stormParticles: 10,     // 每臂粒子數 (建議值: 8-15)
      armSpread: 0.4,         // 臂擴散角度 (建議值: 0.2-0.6)
      
      // ===== 發射頻率控制 =====
      armInterval: 160,       // 風暴臂間隔毫秒 (建議值: 140-220)
      particleDensity: 1.0,   // 粒子密度倍率 (建議值: 0.8-1.4)
      
      // ===== 基礎屬性 =====
      armSpeed: 3.0,          // 臂速度 (建議值: 2.5-4.0)
      particleLife: 8400,     // 生命周期 (建議值: 7500-9500)
      particleSize: 10,       // 粒子大小 (建議值: 8-14)
      stormIntensity: 0.09,   // 風暴強度 (建議值: 0.06-0.12)
      spiralTightness: 0.18,  // 螺旋緊密度 (建議值: 0.12-0.25)
      
      // ===== 顏色配置 =====
      stormColor: '#ff4500',  // 風暴橙 (主色)
      galacticColor: '#ff6347', // 星系紅 (延遲換色)
      nebulaColor: '#ffd700', // 星雲金 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.16,      // 旋轉速度 (建議值: 0.12-0.22)
      spiralSpeed: 0.08,      // 螺旋速度 (建議值: 0.06-0.12)
      
      // ===== 擺動效果 =====
      galacticOscAmp: 28,     // 星系擺動幅度 (建議值: 22-36)
      galacticOscFreq: 0.0020, // 星系擺動頻率 (建議值: 0.0016-0.0028)
      stormOscAmp: 16,        // 風暴擺動幅度 (建議值: 12-22)
      stormOscFreq: 0.0035,   // 風暴擺動頻率 (建議值: 0.0028-0.0045)
      
      // ===== 軌跡效果 =====
      trailMax: 9,            // 軌跡長度 (建議值: 7-13)
      trailIntervalMs: 40,    // 軌跡間隔毫秒 (建議值: 35-60)
      spiralTrail: true,      // 螺旋軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 0.7,      // 空間密度倍率 (建議值: 0.6-1.0)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 添加詳細屬性調整區，優化彈幕結構
      // 優化重點: 銀河風暴螺旋臂結構，增強視覺效果
      // 性能考量: 控制總子彈數量 < 60 個/幀 (4臂 × 15粒子)
      // 平衡性: 多層次螺旋攻擊，可調節風暴強度和密度
    }, options || {});
    
    let theta = 0;
    let stormPhase = 0;
    
    return function(e, BS) {
      try {
        stormPhase = Math.sin(theta * 0.35);
        
        for (let arm = 0; arm < opts.stormArms; arm++) {
          const armAngle = (arm * TAU) / opts.stormArms;
          
          for (let particle = 0; particle < opts.stormParticles; particle++) {
            const particleProgress = particle / opts.stormParticles;
            const stormIntensity = opts.stormIntensity * (1 + particleProgress * 0.5);
            const spiralRadius = 3 + particleProgress * (70 / Math.max(0.1, opts.spaceDensity)) * (1 + stormPhase * 0.2);
            const spiralAngle = armAngle + particleProgress * opts.spiralTightness * TAU + theta * 0.7;
            
            const stormSpeed = opts.armSpeed * (1 + stormIntensity * 0.6) * (1 + particleProgress * 0.2);
            
            const a = spiralAngle + stormPhase * 0.5;
            const vx = Math.cos(a) * stormSpeed;
            const vy = Math.sin(a) * stormSpeed;
            
            const currentColor = particleProgress > 0.65 ? opts.galacticColor : opts.stormColor;
            const currentSize = opts.particleSize * (0.9 + particleProgress * 0.6) * (1 + stormIntensity * 0.4);
            
            const px = e.x + Math.cos(spiralAngle) * spiralRadius;
            const py = e.y + Math.sin(spiralAngle) * spiralRadius;
            
            BS.addBullet(px, py, vx, vy, opts.particleLife, currentSize, currentColor);
            const b = BS.bullets[BS.bullets.length - 1];
            if (b) {
              b.shape = particleProgress > 0.7 ? 'ellipse' : 'circle';
              b.rx = currentSize;
              b.ry = currentSize * (1 - particleProgress * 0.15);
              b.orientToVel = particleProgress > 0.5;
              
              b.color2 = opts.galacticColor;
              b.restyleAt = opts.particleLife * (0.35 + particleProgress * 0.3);
              
              b.oscAxis = (arm % 2 === 0) ? 'x' : 'y';
              b.oscAmp = opts.galacticOscAmp * (1 + stormIntensity * 0.8) * (1 + particleProgress * 0.4);
              b.oscFreq = opts.galacticOscFreq + (arm * 0.00012) + (particle * 0.00018) + (stormIntensity * 0.0003);
              b.angularVel = opts.rotateSpeed * ((arm % 3 === 0) ? 1 : -1) * (0.5 + stormIntensity) * (0.6 + particleProgress * 0.3);
              
              if (particleProgress > 0.3 && particle % 2 === 0) {
                b.trailMax = opts.trailMax;
                b.trailIntervalMs = opts.trailIntervalMs;
                b.trailColor = currentColor;
                b.trailIntensity = stormIntensity + particleProgress;
                b.galacticTrail = true;
              }
              
              b.glowEffect = true;
              b.glowSize = currentSize * (2 + stormIntensity * 2.5) * (1 + particleProgress * 1.5);
              b.glowColor = currentColor;
              b.glowIntensity = 0.25 + stormIntensity * 0.7 + particleProgress * 0.3;
              
              if (stormIntensity > 0.6) {
                b.stormParticle = true;
                b.galacticWind = stormIntensity;
                b.spiralArm = arm;
              }
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第5階段：QuantumFission（量子裂變）- 分裂重組模式
  function quantumFission(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      fissionParticles: 10,    // 裂變粒子數 (建議值: 8-16)
      quantumFields: 6,        // 量子場數量 (建議值: 4-10)
      fissionBursts: 3,        // 裂變爆發數 (建議值: 2-5)
      
      // ===== 發射頻率控制 =====
      fissionInterval: 180,    // 裂變間隔毫秒 (建議值: 150-250)
      fieldInterval: 220,      // 量子場間隔毫秒 (建議值: 180-300)
      burstProbability: 0.15,  // 爆發概率 (建議值: 0.1-0.25)
      
      // ===== 基礎屬性 =====
      fissionSpeed: 2.8,       // 裂變速度 (建議值: 2.2-3.6)
      fieldSpeed: 2.2,         // 場速度 (建議值: 1.8-2.8)
      fissionLife: 8000,       // 裂變生命周期 (建議值: 7000-9000)
      fieldLife: 6400,         // 場生命周期 (建議值: 5800-7200)
      fissionSize: 9,          // 裂變大小 (建議值: 7-12)
      fieldSize: 7,            // 場大小 (建議值: 5-10)
      uncertainty: 0.07,       // 不確定性 (建議值: 0.05-0.12)
      superposition: 0.05,     // 疊加態 (建議值: 0.03-0.08)
      
      // ===== 顏色配置 =====
      quantumColor: '#00ff00', // 量子綠 (主色)
      fissionColor: '#adff2f', // 裂變黃綠 (延遲換色)
      uncertaintyColor: '#40e0d0', // 不確定青 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.18,       // 旋轉速度 (建議值: 0.14-0.24)
      quantumPhaseSpeed: 0.12, // 量子相位速度 (建議值: 0.08-0.16)
      
      // ===== 擺動效果 =====
      quantumOscAmp: 32,       // 量子擺動幅度 (建議值: 26-40)
      quantumOscFreq: 0.0024,  // 量子擺動頻率 (建議值: 0.0018-0.0032)
      fissionOscAmp: 24,       // 裂變擺動幅度 (建議值: 18-30)
      fissionOscFreq: 0.0030,  // 裂變擺動頻率 (建議值: 0.0024-0.0040)
      
      // ===== 軌跡效果 =====
      trailMax: 6,             // 軌跡長度 (建議值: 5-9)
      trailIntervalMs: 65,     // 軌跡間隔毫秒 (建議值: 50-80)
      quantumTrail: true,     // 量子軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,      // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 添加詳細屬性調整區，優化量子力學效果
      // 優化重點: 量子裂變和波函數坍縮視覺效果
      // 性能考量: 控制總子彈數量 < 55 個/幀 (粒子+場)
      // 平衡性: 不確定性和疊加態參數可微調，增加變化性
    }, options || {});
    
    let theta = 0;
    let quantumPhase = 0;
    
    return function(e, BS) {
      try {
        quantumPhase = Math.sin(theta * 0.6);
        
        // 生成裂變粒子
        for (let particle = 0; particle < opts.fissionParticles; particle++) {
          const particleAngle = (particle * TAU) / opts.fissionParticles;
          
          const uncertaintyEffect = (Math.random() - 0.5) * opts.uncertainty;
          const superpositionEffect = Math.sin(particle * 0.9 + theta * 0.4) * opts.superposition;
          const fissionRadius = Math.max(0, opts.fissionSize / Math.max(0.1, opts.spaceDensity));
          const fissionSpeed = opts.fissionSpeed * (1 + Math.abs(quantumPhase) * 0.7 + Math.abs(uncertaintyEffect) * 2);
          
          const a = particleAngle + theta * 0.8 + superpositionEffect * 3 + uncertaintyEffect * 2;
          const vx = Math.cos(a) * fissionSpeed;
          const vy = Math.sin(a) * fissionSpeed;
          
          const px = e.x + Math.cos(particleAngle) * fissionRadius;
          const py = e.y + Math.sin(particleAngle) * fissionRadius;
          
          const currentFissionSize = opts.fissionSize * (1 + Math.abs(uncertaintyEffect) * 0.8 + Math.abs(superpositionEffect) * 0.6);
          
          BS.addBullet(px, py, vx, vy, opts.fissionLife, currentFissionSize, opts.quantumColor);
          const b = BS.bullets[BS.bullets.length - 1];
          if (b) {
            b.shape = Math.abs(uncertaintyEffect) > 0.4 ? 'ellipse' : 'circle';
            b.rx = currentFissionSize;
            b.ry = currentFissionSize * (1 - Math.abs(uncertaintyEffect) * 0.3);
            b.orientToVel = Math.abs(uncertaintyEffect) > 0.3;
            
            b.color2 = opts.fissionColor;
            b.restyleAt = opts.fissionLife * (0.2 + Math.abs(quantumPhase) * 0.4 + Math.abs(uncertaintyEffect) * 0.3);
            
            b.oscAxis = (particle % 2 === 0) ? 'x' : 'y';
            b.oscAmp = opts.quantumOscAmp * (1 + Math.abs(quantumPhase) * 1.0 + Math.abs(uncertaintyEffect) * 1.5 + Math.abs(superpositionEffect));
            b.oscFreq = opts.quantumOscFreq + (particle * 0.0002) + (Math.abs(quantumPhase) * 0.0004) + (Math.abs(uncertaintyEffect) * 0.0006);
            b.angularVel = opts.rotateSpeed * ((particle % 3 === 0) ? 1 : -1) * (0.8 + Math.abs(quantumPhase) * 0.5 + Math.abs(uncertaintyEffect));
            
            if (Math.abs(uncertaintyEffect) > 0.3 && particle % 2 === 0) {
              b.trailMax = opts.trailMax;
              b.trailIntervalMs = opts.trailIntervalMs;
              b.trailColor = opts.quantumColor;
              b.trailIntensity = Math.abs(uncertaintyEffect) + Math.abs(quantumPhase);
              b.quantumTrail = true;
            }
            
            b.glowEffect = true;
            b.glowSize = currentFissionSize * (2.5 + Math.abs(quantumPhase) * 2 + Math.abs(uncertaintyEffect) * 3);
            b.glowColor = opts.quantumColor;
            b.glowIntensity = 0.2 + Math.abs(quantumPhase) * 0.6 + Math.abs(uncertaintyEffect) * 0.8;
            
            b.quantumParticle = true;
            b.uncertainty = uncertaintyEffect;
            b.superposition = superpositionEffect;
            b.waveFunction = Math.random();
            b.fissionProbability = Math.abs(uncertaintyEffect) + 0.4;
            
            // 量子裂變效果（高不確定性時）
            if (Math.abs(uncertaintyEffect) > 0.5 * opts.uncertainty) {
              b.fissioning = true;
              b.fissionRate = Math.abs(uncertaintyEffect);
              b.decayProduct = Math.random() < 0.3;
            }
          }
        }
        
        // 生成量子場
        for (let field = 0; field < opts.quantumFields; field++) {
          const fieldAngle = (field * TAU) / opts.quantumFields + theta * 0.6;
          
          const fieldEffect = Math.cos(field * 1.2 + theta * 0.5) * opts.superposition;
          const fieldRadius = Math.max(0, opts.fieldSize / Math.max(0.1, opts.spaceDensity));
          const fieldSpeed = opts.fieldSpeed * (1 + Math.abs(fieldEffect) * 0.8);
          
          const a = fieldAngle + fieldEffect * 2.5;
          const vx = Math.cos(a) * fieldSpeed;
          const vy = Math.sin(a) * fieldSpeed;
          
          const px = e.x + Math.cos(fieldAngle) * fieldRadius;
          const py = e.y + Math.sin(fieldAngle) * fieldRadius;
          
          const currentFieldSize = opts.fieldSize * (1 + Math.abs(fieldEffect) * 0.9);
          
          BS.addBullet(px, py, vx, vy, opts.fieldLife, currentFieldSize, opts.fissionColor);
          const fieldBullet = BS.bullets[BS.bullets.length - 1];
          if (fieldBullet) {
            fieldBullet.shape = 'circle';
            fieldBullet.quantumField = fieldEffect;
            fieldBullet.fieldPotential = Math.abs(fieldEffect) + 0.6;
            
            fieldBullet.color2 = opts.quantumColor;
            fieldBullet.restyleAt = opts.fieldLife * 0.75;
            
            fieldBullet.fieldExcitation = true;
            fieldBullet.vacuumFluctuation = Math.random() * 0.4;
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第6階段：DarkMatterFlow（暗物質流）- 隱形威脅模式
  function darkMatterFlow(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      darkMatterParticles: 12,   // 暗物質粒子數 (建議值: 10-18)
      invisibleStreams: 8,       // 隱形流數量 (建議值: 6-12)
      darkMatterClusters: 4,     // 暗物質團數量 (建議值: 3-7)
      
      // ===== 發射頻率控制 =====
      darkInterval: 200,         // 暗物質間隔毫秒 (建議值: 170-260)
      streamInterval: 280,       // 隱形流間隔毫秒 (建議值: 240-340)
      clusterProbability: 0.12,  // 團簇概率 (建議值: 0.08-0.18)
      
      // ===== 基礎屬性 =====
      darkSpeed: 2.5,            // 暗物質速度 (建議值: 2.0-3.2)
      streamSpeed: 1.9,          // 流速度 (建議值: 1.5-2.5)
      darkLife: 8600,            // 暗物質生命周期 (建議值: 7800-9400)
      streamLife: 6800,          // 流生命周期 (建議值: 6200-7600)
      darkSize: 30,               // 暗物質大小 (建議值: 25-38)
      streamSize: 20,             // 流大小 (建議值: 16-26)
      invisibility: 0.85,        // 隱形度 (建議值: 0.75-0.95)
      gravitationalInfluence: 0.06, // 引力影響 (建議值: 0.04-0.09)
      
      // ===== 顏色配置 =====
      darkColor: '#2f4f4f',      // 暗灰 (主色，接近不可見)
      invisibleColor: '#1c1c1c', // 隱黑色 (延遲換色，幾乎不可見)
      voidColor: '#000000',      // 虛空黑 (特效色，完全隱形)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.11,         // 旋轉速度 (建議值: 0.08-0.15)
      gravitationalRotation: 0.07, // 引力旋轉速度 (建議值: 0.05-0.11)
      
      // ===== 擺動效果 =====
      darkOscAmp: 24,            // 暗物質擺動幅度 (建議值: 18-32)
      darkOscFreq: 0.0014,       // 暗物質擺動頻率 (建議值: 0.0010-0.0018)
      streamOscAmp: 18,          // 隱形流擺動幅度 (建議值: 14-24)
      streamOscFreq: 0.0020,     // 隱形流擺動頻率 (建議值: 0.0016-0.0026)
      
      // ===== 軌跡效果 =====
      trailMax: 4,               // 軌跡長度 (建議值: 3-6，保持隱形)
      trailIntervalMs: 85,       // 軌跡間隔毫秒 (建議值: 70-110)
      invisibleTrail: true,     // 隱形軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 0.5,        // 空間密度倍率 (建議值: 0.4-0.8)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 添加詳細屬性調整區，優化隱形威脅效果
      // 優化重點: 暗物質隱形性和引力影響視覺效果
      // 性能考量: 控制總子彈數量 < 45 個/幀 (保持隱形特性)
      // 平衡性: 高隱形度但降低密度，保持威脅感與可見性平衡
    }, options || {});
    
    let theta = 0;
    let darkPhase = 0;
    
    return function(e, BS) {
      try {
        darkPhase = Math.sin(theta * 0.25);
        
        // 生成暗物質粒子（主要隱形）
        for (let particle = 0; particle < opts.darkMatterParticles; particle++) {
          const particleAngle = (particle * TAU) / opts.darkMatterParticles;
          
          const invisibilityEffect = opts.invisibility + (Math.random() - 0.5) * 0.1;
          const gravitationalEffect = Math.sin(particle * 0.8 + theta * 0.15) * opts.gravitationalInfluence * 0.6;
          const darkRadius = Math.max(0, opts.darkSize / Math.max(0.1, opts.spaceDensity));
          const darkSpeed = opts.darkSpeed * (1 + Math.abs(darkPhase) * 0.4 + Math.abs(gravitationalEffect));
          
          const a = particleAngle + theta * 0.5 + gravitationalEffect * 1.5;
          const vx = Math.cos(a) * darkSpeed;
          const vy = Math.sin(a) * darkSpeed;
          
          const px = e.x + Math.cos(particleAngle) * darkRadius;
          const py = e.y + Math.sin(particleAngle) * darkRadius;
          
          const currentDarkSize = opts.darkSize * (0.7 + Math.abs(gravitationalEffect) * 0.5);
          
          BS.addBullet(px, py, vx, vy, opts.darkLife, currentDarkSize, opts.darkColor);
          const b = BS.bullets[BS.bullets.length - 1];
          if (b) {
            b.shape = 'circle';
            b.invisibility = invisibilityEffect;
            b.gravitationalMass = 1 + Math.abs(gravitationalEffect) * 3;
            b.darkMatter = true;
            b.invisible = invisibilityEffect > 0.8;
            
            b.color2 = opts.invisibleColor;
            b.restyleAt = opts.darkLife * (0.1 + Math.abs(gravitationalEffect) * 0.2);
            
            b.oscAxis = (particle % 2 === 0) ? 'x' : 'y';
            b.oscAmp = opts.darkOscAmp * (1 + Math.abs(darkPhase) * 0.6) * (1 + Math.abs(gravitationalEffect) * 0.8);
            b.oscFreq = opts.darkOscFreq + (particle * 0.0001) + (Math.abs(darkPhase) * 0.0002) + (Math.abs(gravitationalEffect) * 0.0003);
            b.angularVel = opts.rotateSpeed * ((particle % 3 === 0) ? 1 : -1) * (0.4 + Math.abs(darkPhase) * 0.3 + Math.abs(gravitationalEffect) * 0.5);
            
            if (Math.abs(gravitationalEffect) > 0.4 && particle % 3 === 0) {
              b.trailMax = opts.trailMax;
              b.trailIntervalMs = opts.trailIntervalMs;
              b.trailColor = opts.darkColor;
              b.trailIntensity = Math.abs(gravitationalEffect) * 0.3; // 很弱的軌跡
              b.darkTrail = true;
              b.invisibleTrail = true;
            }
            
            b.glowEffect = true;
            b.glowSize = currentDarkSize * (0.5 + Math.abs(gravitationalEffect) * 1); // 很弱的發光
            b.glowColor = opts.darkColor;
            b.glowIntensity = (1 - invisibilityEffect) * 0.2 + Math.abs(gravitationalEffect) * 0.1; // 很弱的光
            
            b.gravitationalInfluence = gravitationalEffect;
            b.darkEnergy = Math.abs(darkPhase) * 0.5;
            b.invisibleMass = Math.abs(gravitationalEffect) * 2;
            
            // 暗物質特有的引力透鏡效應（中等引力影響時）
            if (Math.abs(gravitationalEffect) > 0.5 * opts.gravitationalInfluence) {
              b.lensing = true;
              b.lensingStrength = Math.abs(gravitationalEffect);
              b.spaceTimeDistortion = Math.abs(gravitationalEffect) * 2;
            }
            
            // 完全隱形標記（高隱形度時）
            if (invisibilityEffect > 0.9 * opts.invisibility) {
              b.completelyInvisible = true;
              b.detectionProbability = 1 - invisibilityEffect;
              b.shadowMatter = true;
            }
          }
        }
        
        // 生成隱形流（更加隱形）
        for (let stream = 0; stream < opts.invisibleStreams; stream++) {
          const streamAngle = (stream * TAU) / opts.invisibleStreams + theta * 0.3;
          
          const streamInvisibility = opts.invisibility + 0.1 + (Math.random() - 0.5) * 0.05;
          const streamEffect = Math.sin(stream * 1.1 + theta * 0.2) * opts.gravitationalInfluence * 0.7;
          const streamRadius = Math.max(0, opts.streamSize / Math.max(0.1, opts.spaceDensity));
          const streamSpeed = opts.streamSpeed * (1 + Math.abs(darkPhase) * 0.3 + Math.abs(streamEffect) * 0.8);
          
          const a = streamAngle + theta * 0.4 + streamEffect * 1;
          const vx = Math.cos(a) * streamSpeed;
          const vy = Math.sin(a) * streamSpeed;
          
          const px = e.x + Math.cos(streamAngle) * streamRadius;
          const py = e.y + Math.sin(streamAngle) * streamRadius;
          
          const currentStreamSize = opts.streamSize * (0.6 + Math.abs(streamEffect) * 0.4);
          
          BS.addBullet(px, py, vx, vy, opts.streamLife, currentStreamSize, opts.invisibleColor);
          const streamBullet = BS.bullets[BS.bullets.length - 1];
          if (streamBullet) {
            streamBullet.shape = 'ellipse';
            streamBullet.rx = currentStreamSize * 1.2;
            streamBullet.ry = currentStreamSize * 0.6;
            streamBullet.orientToVel = true;
            
            streamBullet.invisibility = streamInvisibility;
            streamBullet.stream = true;
            streamBullet.shadowStream = true;
            streamBullet.detectionChance = 1 - streamInvisibility;
            
            streamBullet.color2 = opts.darkColor;
            streamBullet.restyleAt = opts.streamLife * 0.05; // 很快換色，保持隱形
            
            streamBullet.invisibleStream = true;
            streamBullet.darkStream = true;
            streamBullet.ghostParticle = true;
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第7階段：SupernovaChain（超新星連鎖）- 連鎖爆炸模式
  function supernovaChain(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      supernovas: 8,             // 超新星數量 (建議值: 6-12)
      chainReactions: 6,         // 連鎖反應數量 (建議值: 4-10)
      stellarFragments: 12,      // 恆星碎片數量 (建議值: 8-16)
      
      // ===== 發射頻率控制 =====
      novaInterval: 140,         // 超新星間隔毫秒 (建議值: 120-180)
      chainInterval: 200,        // 連鎖間隔毫秒 (建議值: 170-250)
      fragmentProbability: 0.25, // 碎片概率 (建議值: 0.15-0.35)
      
      // ===== 基礎屬性 =====
      novaSpeed: 4.0,            // 超新星速度 (建議值: 3.2-4.8)
      chainSpeed: 3.5,           // 連鎖速度 (建議值: 2.8-4.2)
      fragmentSpeed: 5.2,        // 碎片速度 (建議值: 4.2-6.2)
      novaLife: 7200,            // 超新星生命周期 (建議值: 6500-8000)
      chainLife: 5600,           // 連鎖生命周期 (建議值: 5000-6500)
      fragmentLife: 4800,        // 碎片生命周期 (建議值: 4200-5500)
      novaSize: 14,              // 超新星大小 (建議值: 11-17)
      chainSize: 10,             // 連鎖大小 (建議值: 8-13)
      fragmentSize: 7,           // 碎片大小 (建議值: 5-9)
      explosionIntensity: 0.12,  // 爆發強度 (建議值: 0.08-0.18)
      chainProbability: 0.65,    // 連鎖概率 (建議值: 0.5-0.8)
      
      // ===== 顏色配置 =====
      supernovaColor: '#ff0000', // 超新星紅 (主色)
      chainColor: '#ffa500',     // 連鎖橙 (延遲換色)
      fragmentColor: '#ffff00',  // 碎片黃 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.20,         // 旋轉速度 (建議值: 0.16-0.26)
      explosionRotation: 0.15,   // 爆發旋轉速度 (建議值: 0.12-0.20)
      
      // ===== 擺動效果 =====
      supernovaOscAmp: 36,       // 超新星擺動幅度 (建議值: 28-44)
      supernovaOscFreq: 0.0028,  // 超新星擺動頻率 (建議值: 0.0022-0.0036)
      chainOscAmp: 28,           // 連鎖擺動幅度 (建議值: 22-36)
      chainOscFreq: 0.0035,      // 連鎖擺動頻率 (建議值: 0.0028-0.0045)
      
      // ===== 軌跡效果 =====
      trailMax: 12,              // 軌跡長度 (建議值: 9-16，像宇宙射線)
      trailIntervalMs: 20,       // 軌跡間隔毫秒 (建議值: 15-30，很密集)
      explosionTrail: true,      // 爆發軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,        // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 添加詳細屬性調整區，優化連鎖爆發效果
      // 優化重點: 超新星連鎖反應和恆星碎片效果
      // 性能考量: 控制總子彈數量 < 65 個/幀 (多層次爆發)
      // 平衡性: 三階段攻擊模式，連鎖概率和爆發強度可調
    }, options || {});
    
    let theta = 0;
    let supernovaPhase = 0;
    
    return function(e, BS) {
      try {
        supernovaPhase = Math.sin(theta * 0.8);
        
        // 生成超新星（主要爆發）
        for (let nova = 0; nova < opts.supernovas; nova++) {
          const novaAngle = (nova * TAU) / opts.supernovas;
          
          const explosionEffect = Math.sin(nova * 0.8 + theta * 0.6) * opts.explosionIntensity;
          const chainReactionEffect = Math.cos(nova * 1.2 + theta * 0.4) * opts.chainProbability;
          const novaRadius = Math.max(0, opts.novaSize / Math.max(0.1, opts.spaceDensity));
          const novaSpeed = opts.novaSpeed * (1 + Math.abs(supernovaPhase) * 0.8 + Math.abs(explosionEffect) * 2);
          
          const a = novaAngle + theta * 1.0 + explosionEffect * 2 + supernovaPhase * 0.8;
          const vx = Math.cos(a) * novaSpeed;
          const vy = Math.sin(a) * novaSpeed;
          
          const px = e.x + Math.cos(novaAngle) * novaRadius;
          const py = e.y + Math.sin(novaAngle) * novaRadius;
          
          const currentNovaSize = opts.novaSize * (1 + Math.abs(explosionEffect) * 1.2 + Math.abs(supernovaPhase) * 0.6);
          
          BS.addBullet(px, py, vx, vy, opts.novaLife, currentNovaSize, opts.supernovaColor);
          const b = BS.bullets[BS.bullets.length - 1];
          if (b) {
            b.shape = 'circle';
            b.explosion = explosionEffect;
            b.chainReaction = chainReactionEffect;
            b.supernova = true;
            b.novaIntensity = Math.abs(explosionEffect) + Math.abs(supernovaPhase);
            
            b.color2 = opts.chainColor;
            b.restyleAt = opts.novaLife * (0.15 + Math.abs(explosionEffect) * 0.35 + Math.abs(supernovaPhase) * 0.25);
            
            b.oscAxis = (nova % 2 === 0) ? 'x' : 'y';
            b.oscAmp = opts.supernovaOscAmp * (1 + Math.abs(supernovaPhase) * 1.2 + Math.abs(explosionEffect) * 1.8);
            b.oscFreq = opts.supernovaOscFreq + (nova * 0.0003) + (Math.abs(supernovaPhase) * 0.0006) + (Math.abs(explosionEffect) * 0.0008);
            b.angularVel = opts.rotateSpeed * ((nova % 3 === 0) ? 1 : -1) * (1.0 + Math.abs(supernovaPhase) * 0.7 + Math.abs(explosionEffect));
            
            // 超新星特有的爆炸軌跡（高爆發強度時）
            if (Math.abs(explosionEffect) > 0.4 * opts.explosionIntensity) {
              b.trailMax = opts.trailMax;
              b.trailIntervalMs = opts.trailIntervalMs;
              b.trailColor = opts.supernovaColor;
              b.trailIntensity = Math.abs(explosionEffect) + Math.abs(supernovaPhase) + 0.5;
              b.explosionTrail = true;
              b.cosmicRayTrail = true;
              b.radioactiveTrail = true;
            }
            
            b.glowEffect = true;
            b.glowSize = currentNovaSize * (3 + Math.abs(supernovaPhase) * 3 + Math.abs(explosionEffect) * 5);
            b.glowColor = opts.supernovaColor;
            b.glowIntensity = 0.3 + Math.abs(supernovaPhase) * 0.8 + Math.abs(explosionEffect) * 1.2;
            
            // 連鎖反應標記（高連鎖概率時）
            if (Math.abs(chainReactionEffect) > 0.7 * opts.chainProbability) {
              b.chainable = true;
              b.chainReactionProbability = Math.abs(chainReactionEffect);
              b.criticalMass = Math.abs(chainReactionEffect) > 0.8;
              b.fissionable = true;
            }
            
            // 極端爆發標記（極高爆發強度時）
            if (Math.abs(explosionEffect) > 0.8 * opts.explosionIntensity) {
              b.extremeExplosion = true;
              b.gammaRayBurst = true;
              b.cosmicCatastrophe = true;
              b.energyOutput = Math.abs(explosionEffect) * 5;
            }
          }
        }
        
        // 生成連鎖反應（次級爆發）
        for (let chain = 0; chain < opts.chainReactions; chain++) {
          const chainAngle = (chain * TAU) / opts.chainReactions + theta * 0.7;
          
          const chainEffect = Math.cos(chain * 1.5 + theta * 0.5) * opts.chainProbability * 0.8;
          const chainRadius = 0; // 從BOSS中心射出
          const chainSpeed = opts.chainSpeed * (1 + Math.abs(supernovaPhase) * 0.5 + Math.abs(chainEffect));
          
          const a = chainAngle + theta * 0.8 + chainEffect * 1.5;
          const vx = Math.cos(a) * chainSpeed;
          const vy = Math.sin(a) * chainSpeed;
          
          const px = e.x + Math.cos(chainAngle) * chainRadius;
          const py = e.y + Math.sin(chainAngle) * chainRadius;
          
          const currentChainSize = opts.chainSize * (1 + Math.abs(chainEffect) * 0.7);
          
          BS.addBullet(px, py, vx, vy, opts.chainLife, currentChainSize, opts.chainColor);
          const chainBullet = BS.bullets[BS.bullets.length - 1];
          if (chainBullet) {
            chainBullet.shape = 'ellipse';
            chainBullet.rx = currentChainSize;
            chainBullet.ry = currentChainSize * 0.8;
            chainBullet.orientToVel = true;
            
            chainBullet.chainReaction = chainEffect;
            chainBullet.fissionProduct = true;
            chainBullet.radioactive = Math.abs(chainEffect) + 0.3;
            
            chainBullet.color2 = opts.supernovaColor;
            chainBullet.restyleAt = opts.chainLife * 0.6;
            
            chainBullet.chainBullet = true;
            chainBullet.nuclearChain = true;
            chainBullet.decayProduct = true;
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第8階段：GravityWell（重力井）- 發射型彈幕
  function gravityWell(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      gravityBeams: 12,        // 引力束數量 (建議值: 4-10)
      energyBursts: 15,        // 能量爆發數量 (建議值: 6-12)
      singularityRays: 10,   // 奇點射線數量 (建議值: 3-8)
      
      // ===== 發射頻率控制 =====
      beamInterval: 60,      // 引力束間隔毫秒 (建議值: 120-200)
      burstInterval: 90,     // 爆發間隔毫秒 (建議值: 150-280)
      singularityInterval: 120, // 奇點射線間隔毫秒 (建議值: 250-400)
      
      // ===== 基礎屬性 =====
      beamSpeed: 4.2,         // 引力束速度 (建議值: 3.5-5.0)
      burstSpeed: 3.5,        // 爆發速度 (建議值: 2.8-4.2)
      singularitySpeed: 5.5,  // 奇點射線速度 (建議值: 4.5-6.5)
      beamLife: 8500,         // 引力束生命周期 (建議值: 7500-9500)
      burstLife: 6800,        // 爆發生命周期 (建議值: 6000-7500)
      singularityLife: 9200,  // 奇點射線生命周期 (建議值: 8500-10000)
      beamSize: 12,           // 引力束大小 (建議值: 10-16)
      burstSize: 9,           // 爆發大小 (建議值: 7-12)
      singularitySize: 15,    // 奇點射線大小 (建議值: 12-18)
      
      // ===== 顏色配置 =====
      gravityColor: '#800080',   // 引力紫 (主色)
      energyColor: '#ff00ff',    // 能量粉 (副色)
      singularityColor: '#4b0082', // 奇點靛紫 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.08,      // 旋轉速度 (建議值: 0.06-0.12)
      collapseIntensity: 0.06, // 坍縮強度 (建議值: 0.04-0.09)
      
      // ===== 擺動效果 =====
      gravitationalOscAmp: 24, // 引力擺動幅度 (建議值: 18-32)
      gravitationalOscFreq: 0.0012, // 引力擺動頻率 (建議值: 0.0008-0.0016)
      
      // ===== 軌跡效果 =====
      trailMax: 8,            // 軌跡長度 (建議值: 6-12)
      trailIntervalMs: 55,    // 軌跡間隔毫秒 (建議值: 40-75)
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,      // 空間密度倍率 (建議值: 0.9-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為發射型彈幕，移除引力場環繞結構
      // 優化重點: 引力坍縮式發射，模擬黑洞能量噴流
      // 性能考量: 控制總子彈數量 < 50 個/幀
      // 平衡性: 三種不同速度的發射模式，形成層次攻擊
    }, options || {});
    
    let theta = 0;
    let gravityPhase = 0;
    let beamTimer = 0;
    let burstTimer = 0;
    let singularityTimer = 0;
    
    return function(e, BS) {
      try {
        gravityPhase = Math.sin(theta * 0.25);
        
        // 引力束發射 - 主要攻擊模式
        beamTimer += 16;
        if (beamTimer >= opts.beamInterval) {
          beamTimer = 0;
          
          for (let beam = 0; beam < opts.gravityBeams; beam++) {
            const baseAngle = (beam * TAU) / opts.gravityBeams;
            
            // 坍縮強度效果
            const collapseEffect = 1 + Math.sin(beam + theta * 0.15) * opts.collapseIntensity;
            const beamSpeed = opts.beamSpeed * collapseEffect;
            
            // 引力透鏡效應導致的偏轉
            const lensingEffect = Math.sin(beam * 0.5 + theta * 0.2) * 0.1;
            const beamAngle = baseAngle + theta * 0.3 + lensingEffect + gravityPhase * 0.15;
            
            const beamVx = Math.cos(beamAngle) * beamSpeed;
            const beamVy = Math.sin(beamAngle) * beamSpeed;
            
            // 從BOSS中心射出
            const px = e.x;
            const py = e.y;
            
            BS.addBullet(px, py, beamVx, beamVy, opts.beamLife, opts.beamSize, opts.gravityColor);
            const beamBullet = BS.bullets[BS.bullets.length - 1];
            if (beamBullet) {
              beamBullet.shape = 'ellipse';
              beamBullet.rx = opts.beamSize * 1.6;
              beamBullet.ry = opts.beamSize * 0.8;
              beamBullet.orientToVel = true;
              
              // 坍縮效果
              beamBullet.collapseEffect = collapseEffect;
              beamBullet.lensingEffect = lensingEffect;
              beamBullet.gravitationalMass = collapseEffect * 2;
              
              // 顏色漸變
              beamBullet.color2 = opts.energyColor;
              beamBullet.restyleAt = opts.beamLife * (0.2 + collapseEffect * 0.15);
              
              // 擺動效果（引力特徵）
              beamBullet.oscAxis = (beam % 2 === 0) ? 'x' : 'y';
              beamBullet.oscAmp = opts.gravitationalOscAmp * (1 + collapseEffect * 0.8) * (1 + Math.abs(gravityPhase) * 0.4);
              beamBullet.oscFreq = opts.gravitationalOscFreq + (beam * 0.00018) + (Math.abs(gravityPhase) * 0.00025);
              beamBullet.angularVel = opts.rotateSpeed * ((beam % 3 === 0) ? 1 : -1) * (0.6 + collapseEffect * 0.4);
              
              // 軌跡效果（彎曲軌跡）
              beamBullet.trailMax = opts.trailMax;
              beamBullet.trailIntervalMs = opts.trailIntervalMs;
              beamBullet.trailColor = opts.gravityColor;
              beamBullet.trailIntensity = 0.6 + collapseEffect * 0.4;
              beamBullet.gravitationalTrail = true;
              beamBullet.trailCurvature = Math.abs(lensingEffect) * 2;
              
              // 發光效果（引力發光）
              beamBullet.glowEffect = true;
              beamBullet.glowSize = opts.beamSize * (2.2 + collapseEffect * 1.8);
              beamBullet.glowColor = opts.gravityColor;
              beamBullet.glowIntensity = 0.3 + collapseEffect * 0.5;
              beamBullet.gravitationalGlow = true;
              
              beamBullet.beamType = 'gravitational';
              beamBullet.energyLevel = collapseEffect;
            }
            
            // 次級能量噴流（每個主束附帶）
            for (let sub = 0; sub < 2; sub++) {
              const subAngleOffset = (sub === 0 ? -0.3 : 0.3) * collapseEffect;
              const subAngle = beamAngle + subAngleOffset;
              const subSpeed = beamSpeed * 0.7;
              const subVx = Math.cos(subAngle) * subSpeed;
              const subVy = Math.sin(subAngle) * subSpeed;
              
              const subSize = opts.beamSize * 0.6;
              const subLife = opts.beamLife * 0.8;
              
              BS.addBullet(px, py, subVx, subVy, subLife, subSize, opts.energyColor);
              const subBullet = BS.bullets[BS.bullets.length - 1];
              if (subBullet) {
                subBullet.shape = 'circle';
                subBullet.subBeam = true;
                subBullet.parentBeam = beam;
                subBullet.collapseEffect = collapseEffect * 0.8;
                
                subBullet.color2 = opts.singularityColor;
                subBullet.restyleAt = subLife * 0.4;
                
                subBullet.energyJet = true;
                subBullet.jetIntensity = collapseEffect * 0.6;
              }
            }
          }
        }
        
        // 能量爆發發射 - 中等頻率攻擊
        burstTimer += 16;
        if (burstTimer >= opts.burstInterval) {
          burstTimer = 0;
          
          const burstDirection = Math.random() * TAU;
          for (let burst = 0; burst < opts.energyBursts; burst++) {
            const angleOffset = (burst - opts.energyBursts/2) * 0.5;
            const burstAngle = burstDirection + angleOffset;
            
            // 速度變化
            const speedVariation = Math.random() * 0.4 + 0.8;
            const burstSpeed = opts.burstSpeed * speedVariation;
            const burstVx = Math.cos(burstAngle) * burstSpeed;
            const burstVy = Math.sin(burstAngle) * burstSpeed;
            
            const currentBurstSize = opts.burstSize * (0.9 + Math.random() * 0.3);
            
            BS.addBullet(e.x, e.y, burstVx, burstVy, opts.burstLife, currentBurstSize, opts.energyColor);
            const burstBullet = BS.bullets[BS.bullets.length - 1];
            if (burstBullet) {
              burstBullet.shape = 'ellipse';
              burstBullet.rx = currentBurstSize * 1.4;
              burstBullet.ry = currentBurstSize * 0.7;
              burstBullet.orientToVel = true;
              
              burstBullet.burstType = 'energy';
              burstBullet.speedVariation = speedVariation;
              burstBullet.angleOffset = angleOffset;
              
              // 顏色漸變
              burstBullet.color2 = opts.singularityColor;
              burstBullet.restyleAt = opts.burstLife * 0.3;
              
              // 強化擺動
              burstBullet.oscAxis = 'both';
              burstBullet.oscAmp = opts.gravitationalOscAmp * 0.9;
              burstBullet.oscFreq = opts.gravitationalOscFreq * 1.3;
              burstBullet.angularVel = opts.rotateSpeed * 1.5 * (Math.random() > 0.5 ? 1 : -1);
              
              // 強化軌跡
              burstBullet.trailMax = opts.trailMax + 1;
              burstBullet.trailIntervalMs = opts.trailIntervalMs - 10;
              burstBullet.trailColor = opts.energyColor;
              burstBullet.trailIntensity = 0.7 + speedVariation * 0.3;
              burstBullet.energyTrail = true;
              
              // 強化發光
              burstBullet.glowEffect = true;
              burstBullet.glowSize = currentBurstSize * 2.8;
              burstBullet.glowColor = opts.energyColor;
              burstBullet.glowIntensity = 0.4 + speedVariation * 0.4;
            }
          }
        }
        
        // 奇點射線發射 - 低頻率高威力攻擊
        singularityTimer += 16;
        if (singularityTimer >= opts.singularityInterval) {
          singularityTimer = 0;
          
          // 隨機選擇發射方向
          if (Math.random() < 0.4) { // 40%概率觸發
            const singularityDirection = Math.random() * TAU;
            
            for (let sing = 0; sing < opts.singularityRays; sing++) {
              const precisionAngle = singularityDirection + (sing - opts.singularityRays/2) * 0.2;
              
              // 高精度射線
              const singularitySpeed = opts.singularitySpeed * (0.95 + Math.random() * 0.1);
              const singularityVx = Math.cos(precisionAngle) * singularitySpeed;
              const singularityVy = Math.sin(precisionAngle) * singularitySpeed;
              
              const currentSingularitySize = opts.singularitySize * (0.9 + Math.random() * 0.2);
              
              BS.addBullet(e.x, e.y, singularityVx, singularityVy, opts.singularityLife, currentSingularitySize, opts.singularityColor);
              const singularityBullet = BS.bullets[BS.bullets.length - 1];
              if (singularityBullet) {
                singularityBullet.shape = 'ellipse';
                singularityBullet.rx = currentSingularitySize * 2;
                singularityBullet.ry = currentSingularitySize * 0.6;
                singularityBullet.orientToVel = true;
                
                singularityBullet.rayType = 'singularity';
                singularityBullet.precisionAngle = precisionAngle;
                singularityBullet.singularitySpeed = singularitySpeed;
                
                // 顏色漸變
                singularityBullet.color2 = opts.gravityColor;
                singularityBullet.restyleAt = opts.singularityLife * 0.2;
                
                // 極小擺動（高精度）
                singularityBullet.oscAxis = (sing % 2 === 0) ? 'x' : 'y';
                singularityBullet.oscAmp = opts.gravitationalOscAmp * 0.3;
                singularityBullet.oscFreq = opts.gravitationalOscFreq * 0.8;
                singularityBullet.angularVel = opts.rotateSpeed * 0.5 * (sing % 2 === 0 ? 1 : -1);
                
                // 特殊軌跡
                singularityBullet.trailMax = opts.trailMax + 2;
                singularityBullet.trailIntervalMs = opts.trailIntervalMs - 15;
                singularityBullet.trailColor = opts.singularityColor;
                singularityBullet.trailIntensity = 0.9;
                singularityBullet.singularityTrail = true;
                singularityBullet.precisionTrail = true;
                
                // 強力發光
                singularityBullet.glowEffect = true;
                singularityBullet.glowSize = currentSingularitySize * 3.5;
                singularityBullet.glowColor = opts.singularityColor;
                singularityBullet.glowIntensity = 0.6;
                singularityBullet.singularityGlow = true;
              }
            }
          }
        }
        
        // 偶發性的大規模引力坍縮（特殊效果）
        if (Math.random() < 0.02 && Math.abs(gravityPhase) > 0.9) { // 2%概率
          const collapseCount = 20;
          const collapseDirection = Math.random() * TAU;
          for (let collapse = 0; collapse < collapseCount; collapse++) {
            const angle = collapseDirection + (collapse - collapseCount/2) * 0.1;
            const speed = opts.beamSpeed * (1.2 + Math.random() * 0.6);
            const size = opts.beamSize * (0.8 + Math.random() * 0.4);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            BS.addBullet(e.x, e.y, vx, vy, opts.beamLife, size, opts.gravityColor);
            const collapseBullet = BS.bullets[BS.bullets.length - 1];
            if (collapseBullet) {
              collapseBullet.shape = 'ellipse';
              collapseBullet.rx = size * 2;
              collapseBullet.ry = size * 0.8;
              collapseBullet.orientToVel = true;
              collapseBullet.gravitationalCollapse = true;
              collapseBullet.collapseIntensity = Math.abs(gravityPhase);
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第9階段：CelestialDance（天體之舞）- 終極華麗彈幕
  function celestialDance(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      dancePartners: 8,      // 舞蹈夥伴數量 (建議值: 10-16)
      choreography: 4,        // 編舞複雜度 (建議值: 3-6)
      stellarForms: 3,        // 星體形態數量 (建議值: 4-8)
      
      // ===== 發射頻率控制 =====
      danceInterval: 150,     // 舞蹈間隔毫秒 (建議值: 100-150)
      formInterval: 220,      // 形態間隔毫秒 (建議值: 150-220)
      harmonyProbability: 0.20, // 和諧概率 (建議值: 0.15-0.30)
      
      // ===== 基礎屬性 =====
      danceSpeed: 2.4,        // 舞蹈速度 (建議值: 2.4-3.8)
      formSpeed: 1.8,         // 形態速度 (建議值: 1.8-2.8)
      danceLife: 8800,        // 生命周期 (建議值: 8000-9600)
      formLife: 7200,         // 形態生命周期 (建議值: 6600-7800)
      danceSize: 10,          // 舞蹈大小 (建議值: 8-13)
      formSize: 8,            // 形態大小 (建議值: 6-11)
      harmony: 0.18,          // 和諧度 (建議值: 0.12-0.24)
      rhythm: 0.0028,         // 節奏頻率 (建議值: 0.0022-0.0036)
      synchronization: 0.08,    // 同步性 (建議值: 0.06-0.12)
      elegance: 0.05,         // 優雅度 (建議值: 0.03-0.08)
      complexity: 3,          // 複雜度 (建議值: 2-5)
      
      // ===== 顏色配置 =====
      celestialColor: '#ffd700', // 天體金 (主色)
      cosmicColor: '#00ffff',   // 宇宙青 (延遲換色)
      stellarColor: '#ff69b4',   // 星體粉 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.13,      // 旋轉速度 (建議值: 0.10-0.17)
      dancePhaseSpeed: 0.09,  // 舞蹈相位速度 (建議值: 0.07-0.13)
      
      // ===== 擺動效果 =====
      danceOscAmp: 24,        // 舞蹈擺動幅度 (建議值: 18-32)
      danceOscFreq: 0.0032,   // 舞蹈擺動頻率 (建議值: 0.0026-0.0042)
      celestialOscAmp: 32,    // 天體擺動幅度 (建議值: 26-40)
      celestialOscFreq: 0.0022, // 天體擺動頻率 (建議值: 0.0018-0.0028)
      
      // ===== 軌跡效果 =====
      trailMax: 10,           // 華麗軌跡長度 (建議值: 8-14)
      trailIntervalMs: 10,    // 極密集軌跡間隔 (建議值: 8-15)
      celestialTrail: true,   // 天體軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,      // 空間密度倍率 (建議值: 0.9-1.4)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 添加詳細屬性調整區，優化終極華麗效果
      // 優化重點: 天體之舞的多層次編舞和視覺華麗度
      // 性能考量: 控制總子彈數量 < 70 個/幀 (終極階段)
      // 平衡性: 最高複雜度但保持可躲避性，終極挑戰體驗
    }, options || {});
    
    let theta = 0;
    let dancePhase = 0;
    let harmonyPhase = 0;
    
    return function(e, BS) {
      try {
        // 計算舞蹈相和和諧相
        dancePhase = Math.sin(theta * 0.6);
        harmonyPhase = Math.cos(theta * 0.4);
        
        // 生成舞蹈夥伴
        for (let partner = 0; partner < opts.dancePartners; partner++) {
          const partnerAngle = (partner * TAU) / opts.dancePartners;
          
          // 多層編舞結構（模擬不同類型的天體舞蹈）
          for (let choreography = 0; choreography < opts.choreography; choreography++) {
            const choreoRadius = 3 + choreography * 30; // 不同編舞半徑
            const choreoSpeed = opts.danceSpeed * (1 - choreography * 0.1); // 內圈稍快
            const choreoSize = opts.danceSize * (0.8 + choreography * 0.15); // 不同大小
            const choreoLife = opts.danceLife * (0.9 + choreography * 0.05); // 不同生命周期
            
            // 計算和諧度和同步性效果
            const harmonyEffect = Math.sin(harmonyPhase * opts.harmony + partner + choreography * 0.3);
            const syncEffect = Math.cos(dancePhase * opts.synchronization + partner * 0.2);
            const eleganceEffect = Math.sin(theta * opts.elegance + partner + choreography);
            
            // 不同類型的天體舞蹈模式
            let dancePattern, danceAngle, danceRadius;
            switch (choreography % 4) {
              case 0: // 行星軌道舞
                dancePattern = 'orbit';
                danceAngle = partnerAngle + theta * 0.5;
                danceRadius = choreoRadius * (1 + harmonyEffect * 0.2);
                break;
              case 1: // 螺旋星系舞
                dancePattern = 'spiral';
                danceAngle = partnerAngle + theta * 0.8 + (partner * 0.2);
                danceRadius = choreoRadius + theta * 2;
                break;
              case 2: // 雙星互繞舞
                dancePattern = 'binary';
                danceAngle = partnerAngle + Math.sin(theta * 1.2 + partner) * 0.5;
                danceRadius = choreoRadius * (1 + Math.sin(harmonyPhase + partner) * 0.3);
                break;
              case 3: // 星雲膨脹舞
                dancePattern = 'nebula';
                danceAngle = partnerAngle + Math.cos(theta * 0.3 + partner * 0.1) * 0.4;
                danceRadius = choreoRadius * (1 + dancePhase * 0.4);
                break;
            }
            
            const baseAngle = danceAngle;
            const celestialAngle = baseAngle + syncEffect * 0.1; // 同步性微調
            const celestialRadius = (danceRadius + eleganceEffect * 8) / Math.max(0.1, opts.spaceDensity);
            
            const a = theta + celestialAngle;
            const speed = choreoSpeed * (1 + Math.abs(harmonyEffect) * 0.3) * (1 + Math.abs(syncEffect) * 0.2); // 和諧和同步影響速度
            const vx = Math.cos(a) * speed;
            const vy = Math.sin(a) * speed;
            
            // 根據舞蹈類型和和諧度改變顏色（天體顏色）
            const harmonyIntensity = Math.abs(harmonyEffect) + Math.abs(syncEffect) + Math.abs(eleganceEffect);
            let celestialColor;
            switch (choreography % 4) {
              case 0: celestialColor = harmonyIntensity > 0.8 ? '#ffa500' : opts.celestialColor; break; // 行星橙
              case 1: celestialColor = harmonyIntensity > 0.6 ? '#9370db' : opts.cosmicColor; break; // 星系紫
              case 2: celestialColor = harmonyIntensity > 1.0 ? '#ff69b4' : opts.celestialColor; break; // 雙星粉
              case 3: celestialColor = harmonyIntensity > 0.7 ? '#87ceeb' : opts.cosmicColor; break; // 星雲藍
            }
            const currentSize = choreoSize * (1 + harmonyIntensity * 0.2);
            
            // 主舞蹈粒子
            BS.addBullet(e.x + Math.cos(a) * celestialRadius, e.y + Math.sin(a) * celestialRadius, vx, vy, choreoLife, currentSize, celestialColor);
            const b = BS.bullets[BS.bullets.length - 1];
            if (b) {
              b.shape = harmonyIntensity > 0.9 ? 'ellipse' : 'circle'; // 高和諧度變橢圓
              b.rx = currentSize;
              b.ry = currentSize * (1 - harmonyIntensity * 0.1);
              b.orientToVel = harmonyIntensity > 0.7;
              
              // 舞蹈過程中的顏色漸變（天體演化）
              b.color2 = opts.cosmicColor;
              b.restyleAt = choreoLife * (0.15 + choreography * 0.15); // 編舞越複雜越早換色
              
              // 天體特有的和諧擺動（非常優美）
              b.oscAxis = (partner % 2 === 0) ? 'x' : 'y';
              b.oscAmp = opts.danceOscAmp * (1 + harmonyIntensity * 1.5) * (1 + Math.abs(eleganceEffect) * 0.8); // 和諧和優雅增強擺動
              b.oscFreq = opts.danceOscFreq + (partner * 0.0001) + (Math.abs(harmonyEffect) * 0.0006) + (Math.abs(syncEffect) * 0.0004);
              b.angularVel = opts.rotateSpeed * ((partner % 3 === 0) ? 1 : -1) * (0.5 + choreography * 0.2) * (1 + harmonyIntensity);
              
              // 華麗軌跡（極長很優美）
              if (harmonyIntensity > 0.5 && partner % 2 === 0) { // 中等和諧度有軌跡
                b.trailMax = opts.trailMax;
                b.trailIntervalMs = opts.trailIntervalMs;
                b.trailColor = celestialColor;
                b.trailIntensity = harmonyIntensity;
                b.trailElegance = eleganceEffect; // 優雅度影響軌跡
              }
              
              // 天體發光效果（極美麗，隨和諧變化）
              b.glowEffect = true;
              b.glowSize = currentSize * (2 + harmonyIntensity * 2.5) * (1 + Math.abs(eleganceEffect));
              b.glowColor = celestialColor;
              b.glowIntensity = 0.4 + harmonyIntensity * 0.6;
              b.glowHarmony = harmonyIntensity; // 記錄和諧強度
              
              // 同步性標記（完美協調）
              if (Math.abs(syncEffect) > 0.8 * opts.synchronization) {
                b.synchronized = true;
                b.syncPartner = (partner + opts.dancePartners / 2) % opts.dancePartners; // 同步夥伴
                b.syncPhase = syncEffect;
              }
              
              // 優雅度標記（極致優雅）
              if (Math.abs(eleganceEffect) > 0.7 * opts.elegance) {
                b.elegant = true;
                b.eleganceFactor = eleganceEffect;
                b.dancePattern = dancePattern; // 記錄舞蹈模式
              }
              
              // 複雜度標記（多層次）
              b.complexity = choreography;
              b.danceType = choreography % 4; // 記錄舞蹈類型
            }
            
            // 和諧共振特效（極高和諧度時）
            if (harmonyIntensity > 1.2 && Math.random() < 0.3) {
              const resonanceVx = vx * 0.6;
              const resonanceVy = vy * 0.6;
              const resonanceSize = currentSize * 0.7;
              const resonanceLife = choreoLife * 0.8;
              
              BS.addBullet(e.x + Math.cos(a) * celestialRadius * 0.8, e.y + Math.sin(a) * celestialRadius * 0.8, resonanceVx, resonanceVy, resonanceLife, resonanceSize, opts.cosmicColor);
              const resonance = BS.bullets[BS.bullets.length - 1];
              if (resonance) {
                resonance.shape = 'ellipse';
                resonance.rx = resonanceSize * 1.5;
                resonance.ry = resonanceSize * 0.8;
                resonance.orientToVel = true;
                resonance.glowEffect = true;
                resonance.glowSize = resonanceSize * 5;
                resonance.glowColor = opts.cosmicColor;
                resonance.glowIntensity = 0.9;
                resonance.resonance = true; // 標記為共振
                resonance.harmony = harmonyIntensity;
              }
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  const BossPatterns2 = {
    spawnRing,
    // 第0階段：星雲螺旋
    nebulaSpiral,
    // 第1階段：宇宙之網
    cosmicWeb,
    // 第2階段：恆星搖籃
    stellarNursery,
    // 第3階段：星塵環繞
    stardustOrbit,
    // 第4階段：銀河風暴
    galacticStorm,
    // 第5階段：量子裂變
    quantumFission,
    // 第6階段：暗物質流
    darkMatterFlow,
    // 第7階段：超新星連鎖
    supernovaChain,
    // 第8階段：重力井
    gravityWell,
    // 第9階段：天體之舞
    celestialDance,
  };

  global.ChallengeBossPatterns2 = BossPatterns2;
})(this);
