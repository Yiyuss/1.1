// 挑戰模式第4張地圖「LV4.黑洞」專用彈幕樣式庫（完全獨立，零汙染）
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

  // 第0階段：EventHorizon（事件視界）- 黑洞邊界模式
  function eventHorizon(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      horizonRings: 4,          // 視界環數量 (建議值: 3-6)
      horizonParticles: 12,     // 每環粒子數 (建議值: 8-16)
      ringSpread: 0.3,          // 環擴散角度 (建議值: 0.2-0.5)
      
      // ===== 發射頻率控制 =====
      ringInterval: 180,        // 環間隔毫秒 (建議值: 150-250)
      particleDensity: 1.0,     // 粒子密度倍率 (建議值: 0.8-1.3)
      
      // ===== 基礎屬性 =====
      horizonSpeed: 2.8,        // 視界速度 (建議值: 2.2-3.5)
      particleLife: 8200,       // 生命周期 (建議值: 7500-9000)
      particleSize: 11,         // 粒子大小 (建議值: 8-15)
      gravitationalPull: 0.08,  // 引力強度 (建議值: 0.06-0.12)
      horizonTightness: 0.16,   // 視界緊密度 (建議值: 0.12-0.22)
      
      // ===== 顏色配置 =====
      horizonColor: '#1a1a2e',  // 視界深藍 (主色)
      voidColor: '#16213e',     // 虛空藍 (延遲換色)
      singularityColor: '#0f3460', // 奇點藍 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.14,        // 旋轉速度 (建議值: 0.10-0.20)
      collapseSpeed: 0.06,      // 坍縮速度 (建議值: 0.04-0.10)
      
      // ===== 擺動效果 =====
      horizonOscAmp: 26,        // 視界擺動幅度 (建議值: 20-34)
      horizonOscFreq: 0.0018,   // 視界擺動頻率 (建議值: 0.0014-0.0024)
      voidOscAmp: 18,           // 虛空擺動幅度 (建議值: 14-24)
      voidOscFreq: 0.0025,      // 虛空擺動頻率 (建議值: 0.0020-0.0032)
      
      // ===== 軌跡效果 =====
      trailMax: 8,              // 軌跡長度 (建議值: 6-12)
      trailIntervalMs: 45,       // 軌跡間隔毫秒 (建議值: 35-60)
      horizonTrail: true,       // 視界軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 0.8,        // 空間密度倍率 (建議值: 0.7-1.1)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 添加詳細屬性調整區，優化黑洞視界效果
      // 優化重點: 事件視界的螺旋環結構和引力坍縮視覺
      // 性能考量: 控制總子彈數量 < 55 個/幀 (4環 × 12粒子)
      // 平衡性: 多層次螺旋攻擊，可調節引力強度和密度
    }, options || {});
    
    let theta = 0;
    let horizonPhase = 0;
    let ringTimer = 0;
    
    return function(e, BS) {
      try {
        horizonPhase = Math.sin(theta * 0.3);
        
        // 控制環形發射頻率
        ringTimer += 16;
        if (ringTimer >= opts.ringInterval) {
          ringTimer = 0;
          
          for (let ring = 0; ring < opts.horizonRings; ring++) {
            const ringAngle = (ring * TAU) / opts.horizonRings;
            
            for (let particle = 0; particle < opts.horizonParticles; particle++) {
              const particleProgress = particle / opts.horizonParticles;
              const gravitationalEffect = opts.gravitationalPull * (1 + particleProgress * 0.6);
              const spiralRadius = 3 + particleProgress * (65 / Math.max(0.1, opts.spaceDensity)) * (1 + horizonPhase * 0.25);
              const spiralAngle = ringAngle + particleProgress * opts.horizonTightness * TAU + theta * 0.6;
              
              const horizonSpeed = opts.horizonSpeed * (1 + gravitationalEffect * 0.7) * (1 + particleProgress * 0.3);
              
              const a = spiralAngle + horizonPhase * 0.4;
              const vx = Math.cos(a) * horizonSpeed;
              const vy = Math.sin(a) * horizonSpeed;
              
              const currentColor = particleProgress > 0.6 ? opts.voidColor : opts.horizonColor;
              const currentSize = opts.particleSize * (0.85 + particleProgress * 0.5) * (1 + gravitationalEffect * 0.3);
              
              const px = e.x + Math.cos(spiralAngle) * spiralRadius;
              const py = e.y + Math.sin(spiralAngle) * spiralRadius;
              
              BS.addBullet(px, py, vx, vy, opts.particleLife, currentSize, currentColor);
              const b = BS.bullets[BS.bullets.length - 1];
              if (b) {
                b.shape = particleProgress > 0.7 ? 'ellipse' : 'circle';
                b.rx = currentSize;
                b.ry = currentSize * (1 - particleProgress * 0.12);
                b.orientToVel = particleProgress > 0.5;
                
                b.color2 = opts.singularityColor;
                b.restyleAt = opts.particleLife * (0.4 + particleProgress * 0.3);
                
                b.oscAxis = (ring % 2 === 0) ? 'x' : 'y';
                b.oscAmp = opts.horizonOscAmp * (1 + gravitationalEffect * 0.9) * (1 + particleProgress * 0.4);
                b.oscFreq = opts.horizonOscFreq + (ring * 0.00015) + (particle * 0.0002) + (gravitationalEffect * 0.0004);
                b.angularVel = opts.rotateSpeed * ((ring % 3 === 0) ? 1 : -1) * (0.6 + gravitationalEffect) * (0.7 + particleProgress * 0.2);
                
                if (particleProgress > 0.4 && particle % 2 === 0) {
                  b.trailMax = opts.trailMax;
                  b.trailIntervalMs = opts.trailIntervalMs;
                  b.trailColor = currentColor;
                  b.trailIntensity = gravitationalEffect + particleProgress;
                  b.horizonTrail = true;
                  b.eventHorizonTrail = true;
                }
                
                b.glowEffect = true;
                b.glowSize = currentSize * (2.2 + gravitationalEffect * 2.8) * (1 + particleProgress * 1.8);
                b.glowColor = currentColor;
                b.glowIntensity = 0.3 + gravitationalEffect * 0.8 + particleProgress * 0.4;
                
                if (gravitationalEffect > 0.5) {
                  b.horizonParticle = true;
                  b.gravitationalMass = gravitationalEffect;
                  b.eventHorizon = true;
                  b.spacetimeDistortion = gravitationalEffect * 1.5;
                }
              }
            }
          }
        }
        
        // 偶發性的引力坍縮（特殊效果）
        if (Math.random() < 0.03 && Math.abs(horizonPhase) > 0.85) {
          const collapseCount = 16;
          const collapseDirection = Math.random() * TAU;
          for (let collapse = 0; collapse < collapseCount; collapse++) {
            const angle = collapseDirection + (collapse - collapseCount/2) * 0.15;
            const speed = opts.horizonSpeed * (1.1 + Math.random() * 0.4);
            const size = opts.particleSize * (0.9 + Math.random() * 0.3);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            BS.addBullet(e.x, e.y, vx, vy, opts.particleLife, size, opts.singularityColor);
            const collapseBullet = BS.bullets[BS.bullets.length - 1];
            if (collapseBullet) {
              collapseBullet.shape = 'ellipse';
              collapseBullet.rx = size * 1.8;
              collapseBullet.ry = size * 0.9;
              collapseBullet.orientToVel = true;
              collapseBullet.gravitationalCollapse = true;
              collapseBullet.collapseIntensity = Math.abs(horizonPhase);
              collapseBullet.eventHorizonCollapse = true;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第1階段：SingularityPulse（奇點脈衝）- 脈衝發射模式
  function singularityPulse(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      pulseBeams: 16,           // 脈衝束數量 (建議值: 10-20)
      singularityBursts: 8,     // 奇點爆發數 (建議值: 6-12)
      pulseSpread: 0.25,        // 脈衝擴散角度 (建議值: 0.15-0.35)
      
      // ===== 發射頻率控制 =====
      pulseRate: 140,         // 脈衝間隔毫秒 (建議值: 120-180)
      burstDelay: 200,          // 爆發延遲毫秒 (建議值: 170-250)
      
      // ===== 基礎屬性 =====
      pulseSpeed: 3.5,          // 脈衝速度 (建議值: 2.8-4.2)
      singularitySpeed: 4.2,    // 奇點速度 (建議值: 3.5-5.0)
      pulseLife: 7800,          // 脈衝生命周期 (建議值: 7000-8500)
      singularityLife: 6200,    // 奇點生命周期 (建議值: 5500-7000)
      pulseSize: 13,            // 脈衝大小 (建議值: 10-16)
      singularitySize: 16,      // 奇點大小 (建議值: 12-20)
      
      // ===== 顏色配置 =====
      pulseColor: '#0f3460',    // 脈衝深藍 (主色)
      singularityColor: '#16213e', // 奇點藍黑 (副色)
      voidColor: '#1a1a2e',     // 虛空藍 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.16,        // 旋轉速度 (建議值: 0.12-0.22)
      pulseIntensity: 0.09,     // 脈衝強度 (建議值: 0.07-0.14)
      
      // ===== 擺動效果 =====
      pulseOscAmp: 30,          // 脈衝擺動幅度 (建議值: 24-38)
      pulseOscFreq: 0.0022,     // 脈衝擺動頻率 (建議值: 0.0018-0.0028)
      singularityOscAmp: 24,    // 奇點擺動幅度 (建議值: 18-32)
      singularityOscFreq: 0.0030, // 奇點擺動頻率 (建議值: 0.0024-0.0040)
      
      // ===== 軌跡效果 =====
      trailMax: 7,              // 軌跡長度 (建議值: 5-10)
      trailIntervalMs: 35,      // 軌跡間隔毫秒 (建議值: 25-50)
      pulseTrail: true,         // 脈衝軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,        // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 添加詳細屬性調整區，優化奇點脈衝效果
      // 優化重點: 黑洞奇點的脈衝式能量釋放和引力波動
      // 性能考量: 控制總子彈數量 < 60 個/幀 (脈衝+奇點)
      // 平衡性: 雙重攻擊模式，脈衝規律性和奇點隨機性結合
    }, options || {});
    
    let theta = 0;
    let pulsePhase = 0;
    let pulseTimer = 0;
    let burstTimer = 0;
    
    return function(e, BS) {
      try {
        pulsePhase = Math.sin(theta * 0.4);
        
        // 主要脈衝發射 - 規律性攻擊
        pulseTimer += 16;
        if (pulseTimer >= opts.pulseRate) {
          pulseTimer = 0;
          
          // 生成脈衝束 - 多重角度同時發射
          for (let pulse = 0; pulse < opts.pulseBeams; pulse++) {
            const baseAngle = (pulse * TAU) / opts.pulseBeams;
            
            // 脈衝強度效果
            const pulseIntensity = 1 + Math.sin(pulse + theta * 0.12) * opts.pulseIntensity;
            const pulseSpeed = opts.pulseSpeed * pulseIntensity;
            const pulseAngle = baseAngle + theta * 0.35 + pulsePhase * 0.2;
            const pulseVx = Math.cos(pulseAngle) * pulseSpeed;
            const pulseVy = Math.sin(pulseAngle) * pulseSpeed;
            
            // 從BOSS中心射出
            const px = e.x;
            const py = e.y;
            
            BS.addBullet(px, py, pulseVx, pulseVy, opts.pulseLife, opts.pulseSize, opts.pulseColor);
            const pulseBullet = BS.bullets[BS.bullets.length - 1];
            if (pulseBullet) {
              pulseBullet.shape = 'ellipse';
              pulseBullet.rx = opts.pulseSize * 1.4;
              pulseBullet.ry = opts.pulseSize * 0.8;
              pulseBullet.orientToVel = true;
              
              // 脈衝特性
              pulseBullet.pulseIntensity = pulseIntensity;
              pulseBullet.gravitationalPulse = true;
              pulseBullet.pulsePhase = pulsePhase;
              
              // 顏色漸變
              pulseBullet.color2 = opts.singularityColor;
              pulseBullet.restyleAt = opts.pulseLife * (0.2 + pulseIntensity * 0.3);
              
              // 擺動效果
              pulseBullet.oscAxis = (pulse % 2 === 0) ? 'x' : 'y';
              pulseBullet.oscAmp = opts.pulseOscAmp * (1 + Math.abs(pulsePhase) * 0.5) * (1 + pulseIntensity * 0.4);
              pulseBullet.oscFreq = opts.pulseOscFreq + (pulse * 0.00012) + (Math.abs(pulsePhase) * 0.0002);
              pulseBullet.angularVel = opts.rotateSpeed * ((pulse % 3 === 0) ? 1 : -1) * (0.7 + pulseIntensity * 0.3);
              
              // 軌跡效果
              if (pulse % 2 === 0) {
                pulseBullet.trailMax = opts.trailMax;
                pulseBullet.trailIntervalMs = opts.trailIntervalMs;
                pulseBullet.trailColor = opts.pulseColor;
                pulseBullet.trailIntensity = pulseIntensity;
                pulseBullet.pulseTrail = true;
                pulseBullet.gravitationalTrail = true;
              }
              
              // 發光效果
              pulseBullet.glowEffect = true;
              pulseBullet.glowSize = opts.pulseSize * (2.5 + pulseIntensity * 2);
              pulseBullet.glowColor = opts.pulseColor;
              pulseBullet.glowIntensity = 0.4 + Math.abs(pulsePhase) * 0.4 + pulseIntensity * 0.3;
              
              pulseBullet.beamType = 'gravitational_pulse';
              pulseBullet.energyLevel = pulseIntensity;
            }
            
            // 次級奇點爆發 - 擴散角度發射
            for (let burst = 0; burst < opts.singularityBursts; burst++) {
              const spreadAngle = pulseAngle + (burst - opts.singularityBursts/2) * opts.pulseSpread;
              const burstSpeed = opts.singularitySpeed * 0.8;
              const burstVx = Math.cos(spreadAngle) * burstSpeed;
              const burstVy = Math.sin(spreadAngle) * burstSpeed;
              
              const burstSize = opts.singularitySize * 0.7;
              const burstLife = opts.singularityLife * 0.8;
              
              BS.addBullet(px, py, burstVx, burstVy, burstLife, burstSize, opts.singularityColor);
              const burstBullet = BS.bullets[BS.bullets.length - 1];
              if (burstBullet) {
                burstBullet.shape = 'circle';
                burstBullet.color2 = opts.voidColor;
                burstBullet.restyleAt = burstLife * 0.5;
                
                burstBullet.singularityBurst = true;
                burstBullet.gravitationalBurst = true;
                burstBullet.parentPulse = pulse;
                burstBullet.spreadAngle = spreadAngle;
                
                // 較弱的擺動
                burstBullet.oscAxis = (burst % 2 === 0) ? 'x' : 'y';
                burstBullet.oscAmp = opts.singularityOscAmp * 0.6;
                burstBullet.oscFreq = opts.singularityOscFreq * 1.2;
              }
            }
          }
        }
        
        // 控制奇點爆發頻率
        burstTimer += 16;
        if (burstTimer >= opts.burstDelay) {
          burstTimer = 0;
          
          // 特殊奇點能量爆發（偶爾觸發）
          if (Math.random() < 0.25 && Math.abs(pulsePhase) > 0.7) {
            const specialCount = 6;
            const specialDirection = Math.random() * TAU;
            for (let special = 0; special < specialCount; special++) {
              const angle = specialDirection + (special - specialCount/2) * 0.4;
              const speed = opts.singularitySpeed * 1.3;
              const size = opts.singularitySize * 1.1;
              const vx = Math.cos(angle) * speed;
              const vy = Math.sin(angle) * speed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.singularityLife, size, opts.voidColor);
              const specialBullet = BS.bullets[BS.bullets.length - 1];
              if (specialBullet) {
                specialBullet.shape = 'ellipse';
                specialBullet.rx = size * 1.8;
                specialBullet.ry = size * 0.9;
                specialBullet.orientToVel = true;
                specialBullet.voidBurst = true;
                specialBullet.singularityEnergy = Math.abs(pulsePhase) + 1;
                specialBullet.gravitationalSingularity = true;
              }
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第2階段：GravitationalWaves（引力波）- 波動發射模式
  function gravitationalWaves(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      waveBeams: 30,            // 引力波束數量 (建議值: 10-18)
      wavePackets: 20,           // 波包數量 (建議值: 6-12)
      gravitationalRipples: 20,  // 引力漣漪數 (建議值: 4-10)
      
      // ===== 發射頻率控制 =====
      waveInterval: 160,         // 引力波間隔毫秒 (建議值: 140-200)
      packetRate: 120,          // 波包發射間隔毫秒 (建議值: 100-160)
      rippleProbability: 0.18,  // 漣漪概率 (建議值: 0.12-0.25)
      
      // ===== 基礎屬性 =====
      waveSpeed: 3.2,           // 引力波速度 (建議值: 2.6-4.0)
      packetSpeed: 4.0,         // 波包速度 (建議值: 3.2-4.8)
      rippleSpeed: 2.6,         // 漣漪速度 (建議值: 2.0-3.2)
      waveLife: 8600,           // 引力波生命周期 (建議值: 7800-9400)
      packetLife: 6800,         // 波包生命周期 (建議值: 6200-7400)
      rippleLife: 5400,         // 漣漪生命周期 (建議值: 4800-6000)
      waveSize: 12,             // 引力波大小 (建議值: 9-15)
      packetSize: 15,           // 波包大小 (建議值: 12-18)
      rippleSize: 9,            // 漣漪大小 (建議值: 6-12)
      waveAmplitude: 0.10,      // 波幅 (建議值: 0.08-0.16)
      waveFrequency: 0.0035,    // 波頻 (建議值: 0.0028-0.0045)
      
      // ===== 顏色配置 =====
      waveColor: '#16213e',     // 引力波藍黑 (主色)
      packetColor: '#0f3460',   // 波包深藍 (副色)
      rippleColor: '#1a1a2e',   // 漣漪深藍 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.12,        // 旋轉速度 (建議值: 0.09-0.17)
      wavePhaseSpeed: 0.08,     // 波相速度 (建議值: 0.06-0.12)
      
      // ===== 擺動效果 =====
      waveOscAmp: 32,           // 引力波擺動幅度 (建議值: 26-40)
      waveOscFreq: 0.0020,      // 引力波擺動頻率 (建議值: 0.0016-0.0026)
      packetOscAmp: 28,         // 波包擺動幅度 (建議值: 22-36)
      packetOscFreq: 0.0028,    // 波包擺動頻率 (建議值: 0.0022-0.0036)
      
      // ===== 軌跡效果 =====
      trailMax: 9,              // 軌跡長度 (建議值: 7-13)
      trailIntervalMs: 40,      // 軌跡間隔毫秒 (建議值: 30-55)
      waveTrail: true,          // 引力波軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.0,        // 空間密度倍率 (建議值: 0.8-1.3)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 添加詳細屬性調整區，優化引力波動效果
      // 優化重點: 黑洞引力波的波動傳播和空間扭曲視覺
      // 性能考量: 控制總子彈數量 < 65 個/幀 (多層次波動)
      // 平衡性: 三種不同速度的波動模式，形成立體引力場
    }, options || {});
    
    let theta = 0;
    let wavePhase = 0;
    let waveTimer = 0;
    let packetTimer = 0;
    
    return function(e, BS) {
      try {
        wavePhase = Math.sin(theta * 0.5);
        
        // 主要引力波發射 - 規律性波動
        waveTimer += 16;
        if (waveTimer >= opts.waveInterval) {
          waveTimer = 0;
          
          // 生成引力波束 - 波動式發射
          for (let wave = 0; wave < opts.waveBeams; wave++) {
            const baseAngle = (wave * TAU) / opts.waveBeams;
            
            // 波動效果
            const waveEffect = Math.sin(wave * 0.7 + theta * 0.3) * opts.waveAmplitude;
            const gravitationalEffect = Math.cos(wave * 1.2 + theta * 0.2) * opts.waveFrequency * 50;
            const waveSpeed = opts.waveSpeed * (1 + Math.abs(wavePhase) * 0.6 + Math.abs(waveEffect) * 2);
            
            const waveAngle = baseAngle + theta * 0.4 + waveEffect * 2.5 + gravitationalEffect * 0.02;
            const waveVx = Math.cos(waveAngle) * waveSpeed;
            const waveVy = Math.sin(waveAngle) * waveSpeed;
            
            // 從BOSS中心射出
            const px = e.x;
            const py = e.y;
            
            BS.addBullet(px, py, waveVx, waveVy, opts.waveLife, opts.waveSize, opts.waveColor);
            const waveBullet = BS.bullets[BS.bullets.length - 1];
            if (waveBullet) {
              waveBullet.shape = 'ellipse';
              waveBullet.rx = opts.waveSize * 1.5;
              waveBullet.ry = opts.waveSize * 0.8;
              waveBullet.orientToVel = true;
              
              // 波動特性
              waveBullet.waveEffect = waveEffect;
              waveBullet.gravitationalWave = true;
              waveBullet.waveAmplitude = opts.waveAmplitude;
              waveBullet.waveFrequency = opts.waveFrequency;
              waveBullet.wavePhase = wavePhase;
              
              // 顏色漸變
              waveBullet.color2 = opts.packetColor;
              waveBullet.restyleAt = opts.waveLife * (0.25 + Math.abs(waveEffect) * 0.35 + Math.abs(wavePhase) * 0.2);
              
              // 擺動效果（波動特徵）
              waveBullet.oscAxis = (wave % 2 === 0) ? 'x' : 'y';
              waveBullet.oscAmp = opts.waveOscAmp * (1 + Math.abs(wavePhase) * 0.8 + Math.abs(waveEffect) * 1.2) * (1 + Math.abs(gravitationalEffect) * 0.5);
              waveBullet.oscFreq = opts.waveOscFreq + (wave * 0.00018) + (Math.abs(wavePhase) * 0.0003) + (Math.abs(waveEffect) * 0.0005) + (Math.abs(gravitationalEffect) * 0.00008);
              waveBullet.angularVel = opts.rotateSpeed * ((wave % 3 === 0) ? 1 : -1) * (0.7 + Math.abs(waveEffect) * 0.5 + Math.abs(wavePhase) * 0.3);
              
              // 軌跡效果（波動軌跡）
              if (wave % 2 === 0) {
                waveBullet.trailMax = opts.trailMax;
                waveBullet.trailIntervalMs = opts.trailIntervalMs;
                waveBullet.trailColor = opts.waveColor;
                waveBullet.trailIntensity = Math.abs(waveEffect) + Math.abs(wavePhase) + 0.6;
                waveBullet.waveTrail = true;
                waveBullet.gravitationalTrail = true;
                waveBullet.trailWaveEffect = waveEffect;
              }
              
              // 發光效果（引力發光）
              waveBullet.glowEffect = true;
              waveBullet.glowSize = opts.waveSize * (2.5 + Math.abs(wavePhase) * 2 + Math.abs(waveEffect) * 3.5) * (1 + Math.abs(gravitationalEffect) * 0.8);
              waveBullet.glowColor = opts.waveColor;
              waveBullet.glowIntensity = 0.3 + Math.abs(wavePhase) * 0.6 + Math.abs(waveEffect) * 0.9 + Math.abs(gravitationalEffect) * 0.1;
              waveBullet.gravitationalGlow = true;
              waveBullet.waveGlow = true;
              
              waveBullet.beamType = 'gravitational_wave';
              waveBullet.energyLevel = Math.abs(waveEffect) + Math.abs(wavePhase);
              waveBullet.spacetimeDistortion = Math.abs(waveEffect) * 2;
            }
          }
        }
        
        // 波包發射 - 更頻繁的小規模發射
        packetTimer += 16;
        if (packetTimer >= opts.packetRate) {
          packetTimer = 0;
          
          const packetDirection = Math.random() * TAU;
          for (let packet = 0; packet < opts.wavePackets; packet++) {
            const angleOffset = (packet - opts.wavePackets/2) * 0.6;
            const packetAngle = packetDirection + angleOffset;
            
            // 波包特性
            const packetEffect = Math.cos(packet * 1.1 + theta * 0.4) * opts.waveAmplitude * 1.5;
            const packetSpeed = opts.packetSpeed * (1 + Math.abs(wavePhase) * 0.4 + Math.abs(packetEffect) * 2);
            const packetVx = Math.cos(packetAngle) * packetSpeed;
            const packetVy = Math.sin(packetAngle) * packetSpeed;
            
            const currentPacketSize = opts.packetSize * (0.9 + Math.abs(packetEffect) * 0.4);
            
            BS.addBullet(e.x, e.y, packetVx, packetVy, opts.packetLife, currentPacketSize, opts.packetColor);
            const packetBullet = BS.bullets[BS.bullets.length - 1];
            if (packetBullet) {
              packetBullet.shape = 'ellipse';
              packetBullet.rx = currentPacketSize * 1.3;
              packetBullet.ry = currentPacketSize * 0.7;
              packetBullet.orientToVel = true;
              
              packetBullet.packetEffect = packetEffect;
              packetBullet.wavePacket = true;
              packetBullet.gravitationalPacket = true;
              packetBullet.packetSpeed = packetSpeed;
              
              // 顏色漸變
              packetBullet.color2 = opts.rippleColor;
              packetBullet.restyleAt = opts.packetLife * 0.4;
              
              // 更強的擺動（高速波包）
              packetBullet.oscAxis = 'both';
              packetBullet.oscAmp = opts.packetOscAmp * (1 + Math.abs(wavePhase) * 0.6 + Math.abs(packetEffect) * 1.2);
              packetBullet.oscFreq = opts.packetOscFreq * (1.2 + Math.abs(packetEffect));
              packetBullet.angularVel = opts.rotateSpeed * 1.8 * (Math.random() > 0.5 ? 1 : -1);
              
              // 強化軌跡
              packetBullet.trailMax = opts.trailMax + 1;
              packetBullet.trailIntervalMs = opts.trailIntervalMs - 5;
              packetBullet.trailColor = opts.packetColor;
              packetBullet.trailIntensity = 0.8 + Math.abs(packetEffect) + Math.abs(wavePhase);
              packetBullet.packetTrail = true;
              packetBullet.wavePacketTrail = true;
              
              // 強化發光
              packetBullet.glowEffect = true;
              packetBullet.glowSize = currentPacketSize * 3.2;
              packetBullet.glowColor = opts.packetColor;
              packetBullet.glowIntensity = 0.5 + Math.abs(wavePhase) * 0.4 + Math.abs(packetEffect) * 0.6;
            }
          }
        }
        
        // 引力漣漪 - 隨機散射發射
        if (Math.random() < opts.rippleProbability && Math.abs(wavePhase) > 0.6) {
          const rippleCount = opts.gravitationalRipples;
          const rippleDirection = Math.random() * TAU;
          for (let ripple = 0; ripple < rippleCount; ripple++) {
            const randomOffset = (Math.random() - 0.5) * 0.8;
            const rippleAngle = rippleDirection + ripple * 0.4 + randomOffset;
            
            // 隨機速度變化
            const speedVariation = Math.random() * 0.4 + 0.7;
            const rippleSpeed = opts.rippleSpeed * speedVariation;
            const rippleVx = Math.cos(rippleAngle) * rippleSpeed;
            const rippleVy = Math.sin(rippleAngle) * rippleSpeed;
            
            const currentRippleSize = opts.rippleSize * (0.7 + Math.random() * 0.6);
            
            BS.addBullet(e.x, e.y, rippleVx, rippleVy, opts.rippleLife, currentRippleSize, opts.rippleColor);
            const rippleBullet = BS.bullets[BS.bullets.length - 1];
            if (rippleBullet) {
              rippleBullet.shape = 'circle';
              rippleBullet.rippleEffect = speedVariation;
              rippleBullet.gravitationalRipple = true;
              rippleBullet.randomOffset = randomOffset;
              rippleBullet.rippleSpeed = rippleSpeed;
              
              // 顏色漸變
              rippleBullet.color2 = opts.waveColor;
              rippleBullet.restyleAt = opts.rippleLife * 0.6;
              
              // 隨機擺動
              rippleBullet.oscAxis = Math.random() > 0.5 ? 'x' : 'y';
              rippleBullet.oscAmp = opts.waveOscAmp * (0.4 + Math.random() * 0.4);
              rippleBullet.oscFreq = opts.waveOscFreq * (0.8 + Math.random() * 0.4);
              rippleBullet.angularVel = opts.rotateSpeed * (Math.random() - 0.5) * 2.5;
              
              // 簡單軌跡
              if (Math.random() < 0.4) {
                rippleBullet.trailMax = Math.floor(opts.trailMax * 0.8);
                rippleBullet.trailIntervalMs = opts.trailIntervalMs + 15;
                rippleBullet.trailColor = opts.rippleColor;
                rippleBullet.trailIntensity = 0.5 + speedVariation * 0.3;
                rippleBullet.rippleTrail = true;
              }
              
              // 微弱發光
              rippleBullet.glowEffect = true;
              rippleBullet.glowSize = currentRippleSize * 1.8;
              rippleBullet.glowColor = opts.rippleColor;
              rippleBullet.glowIntensity = 0.25 + speedVariation * 0.2;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第3階段：DarkMatterSwirl（暗物質旋渦）- 旋渦發射模式
  function darkMatterSwirl(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      darkMatterStreams: 20,    // 暗物質流數量 (建議值: 12-20)
      swirlArms: 8,             // 旋渦臂數量 (建議值: 4-8)
      matterClusters: 16,       // 物質團數量 (建議值: 8-16)
      
      // ===== 發射頻率控制 =====
      streamInterval: 130,      // 暗物質流間隔毫秒 (建議值: 110-170)
      swirlRate: 200,           // 旋渦發射間隔毫秒 (建議值: 170-250)
      clusterProbability: 0.20, // 團簇概率 (建議值: 0.15-0.30)
      
      // ===== 基礎屬性 =====
      streamSpeed: 3.0,         // 暗物質流速度 (建議值: 2.4-3.6)
      swirlSpeed: 3.8,          // 旋渦速度 (建議值: 3.0-4.5)
      clusterSpeed: 2.4,        // 團簇速度 (建議值: 1.8-3.0)
      streamLife: 8000,         // 暗物質流生命周期 (建議值: 7200-8800)
      swirlLife: 6400,          // 旋渦生命周期 (建議值: 5800-7000)
      clusterLife: 5200,        // 團簇生命周期 (建議值: 4600-5800)
      streamSize: 14,           // 暗物質流大小 (建議值: 11-17)
      swirlSize: 18,            // 旋渦大小 (建議值: 14-22)
      clusterSize: 11,          // 團簇大小 (建議值: 8-14)
      darkMatterDensity: 0.09,  // 暗物質密度 (建議值: 0.07-0.13)
      swirlIntensity: 0.12,     // 旋渦強度 (建議值: 0.09-0.16)
      
      // ===== 顏色配置 =====
      darkMatterColor: '#1c1c1c', // 暗物質黑 (主色)
      swirlColor: '#2f2f4f',    // 旋渦紫 (副色)
      voidColor: '#0a0a0a',     // 虛空黑 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.15,        // 旋轉速度 (建議值: 0.12-0.20)
      spiralSpeed: 0.09,        // 螺旋速度 (建議值: 0.07-0.13)
      
      // ===== 擺動效果 =====
      darkMatterOscAmp: 28,     // 暗物質擺動幅度 (建議值: 22-36)
      darkMatterOscFreq: 0.0022, // 暗物質擺動頻率 (建議值: 0.0018-0.0028)
      swirlOscAmp: 34,          // 旋渦擺動幅度 (建議值: 28-42)
      swirlOscFreq: 0.0016,     // 旋渦擺動頻率 (建議值: 0.0012-0.0022)
      
      // ===== 軌跡效果 =====
      trailMax: 8,              // 軌跡長度 (建議值: 6-12)
      trailIntervalMs: 50,      // 軌跡間隔毫秒 (建議值: 40-65)
      darkMatterTrail: true,    // 暗物質軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 0.9,        // 空間密度倍率 (建議值: 0.8-1.2)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 添加詳細屬性調整區，優化暗物質旋渦效果
      // 優化重點: 黑洞周圍暗物質的螺旋運動和引力聚集
      // 性能考量: 控制總子彈數量 < 70 個/幀 (多層次旋渦)
      // 平衡性: 三種不同密度的攻擊模式，形成立體暗物質雲
    }, options || {});
    
    let theta = 0;
    let darkMatterPhase = 0;
    let streamTimer = 0;
    let swirlTimer = 0;
    
    return function(e, BS) {
      try {
        darkMatterPhase = Math.sin(theta * 0.35);
        
        // 主要暗物質流發射 - 持續性攻擊
        streamTimer += 16;
        if (streamTimer >= opts.streamInterval) {
          streamTimer = 0;
          
          for (let stream = 0; stream < opts.darkMatterStreams; stream++) {
            const streamAngle = (stream * TAU) / opts.darkMatterStreams;
            
            // 暗物質密度效果
            const densityEffect = Math.sin(stream * 0.9 + theta * 0.2) * opts.darkMatterDensity;
            const streamSpeed = opts.streamSpeed * (1 + Math.abs(darkMatterPhase) * 0.5 + Math.abs(densityEffect) * 2);
            
            // 螺旋運動
            const spiralEffect = Math.sin(stream * opts.spiralSpeed + theta * 0.6) * 0.2;
            const finalStreamAngle = streamAngle + theta * 0.5 + spiralEffect + darkMatterPhase * 0.15;
            const streamVx = Math.cos(finalStreamAngle) * streamSpeed;
            const streamVy = Math.sin(finalStreamAngle) * streamSpeed;
            
            // 從BOSS中心射出
            const px = e.x;
            const py = e.y;
            
            BS.addBullet(px, py, streamVx, streamVy, opts.streamLife, opts.streamSize, opts.darkMatterColor);
            const streamBullet = BS.bullets[BS.bullets.length - 1];
            if (streamBullet) {
              streamBullet.shape = 'ellipse';
              streamBullet.rx = opts.streamSize * 1.2;
              streamBullet.ry = opts.streamSize * 0.8;
              streamBullet.orientToVel = true;
              
              // 暗物質特性
              streamBullet.densityEffect = densityEffect;
              streamBullet.darkMatterStream = true;
              streamBullet.gravitationalStream = true;
              streamBullet.darkMatterPhase = darkMatterPhase;
              streamBullet.spiralEffect = spiralEffect;
              
              // 顏色漸變
              streamBullet.color2 = opts.swirlColor;
              streamBullet.restyleAt = opts.streamLife * (0.15 + Math.abs(darkMatterPhase) * 0.25 + Math.abs(densityEffect) * 0.3);
              
              // 擺動效果
              streamBullet.oscAxis = (stream % 2 === 0) ? 'x' : 'y';
              streamBullet.oscAmp = opts.darkMatterOscAmp * (1 + Math.abs(darkMatterPhase) * 0.7) * (1 + Math.abs(densityEffect) * 1.0);
              streamBullet.oscFreq = opts.darkMatterOscFreq + (stream * 0.00015) + (Math.abs(darkMatterPhase) * 0.00025) + (Math.abs(densityEffect) * 0.0004);
              streamBullet.angularVel = opts.rotateSpeed * ((stream % 3 === 0) ? 1 : -1) * (0.8 + Math.abs(darkMatterPhase) * 0.4 + Math.abs(densityEffect) * 0.6);
              
              // 軌跡效果
              if (stream % 2 === 0) {
                streamBullet.trailMax = opts.trailMax;
                streamBullet.trailIntervalMs = opts.trailIntervalMs;
                streamBullet.trailColor = opts.darkMatterColor;
                streamBullet.trailIntensity = Math.abs(densityEffect) + 0.6;
                streamBullet.darkMatterTrail = true;
                streamBullet.gravitationalTrail = true;
              }
              
              // 發光效果（很弱，保持暗物質特性）
              streamBullet.glowEffect = true;
              streamBullet.glowSize = opts.streamSize * (1.5 + Math.abs(darkMatterPhase) * 1 + Math.abs(densityEffect) * 1.5);
              streamBullet.glowColor = opts.darkMatterColor;
              streamBullet.glowIntensity = (1 - Math.abs(densityEffect)) * 0.15 + Math.abs(darkMatterPhase) * 0.1;
              streamBullet.darkMatterGlow = true;
              
              streamBullet.streamType = 'dark_matter';
              streamBullet.energyLevel = Math.abs(densityEffect) + 0.5;
              streamBullet.invisibleMass = Math.abs(densityEffect) * 2;
            }
          }
        }
        
        // 旋渦發射 - 周期性大規模攻擊
        swirlTimer += 16;
        if (swirlTimer >= opts.swirlRate) {
          swirlTimer = 0;
          
          for (let swirl = 0; swirl < opts.swirlArms; swirl++) {
            const swirlAngle = (swirl * TAU) / opts.swirlArms;
            
            for (let cluster = 0; cluster < opts.matterClusters; cluster++) {
              const clusterProgress = cluster / opts.matterClusters;
              const swirlIntensity = opts.swirlIntensity * (1 + clusterProgress * 0.7);
              const spiralRadius = 3 + clusterProgress * (75 / Math.max(0.1, opts.spaceDensity)) * (1 + darkMatterPhase * 0.3);
              const spiralAngle = swirlAngle + clusterProgress * 0.3 * TAU + theta * 0.8;
              
              const swirlSpeed = opts.swirlSpeed * (1 + swirlIntensity * 0.8) * (1 + clusterProgress * 0.4);
              
              const a = spiralAngle + darkMatterPhase * 0.5;
              const vx = Math.cos(a) * swirlSpeed;
              const vy = Math.sin(a) * swirlSpeed;
              
              const currentColor = clusterProgress > 0.65 ? opts.voidColor : opts.swirlColor;
              const currentSize = opts.swirlSize * (0.9 + clusterProgress * 0.4) * (1 + swirlIntensity * 0.5);
              
              const px = e.x + Math.cos(spiralAngle) * spiralRadius;
              const py = e.y + Math.sin(spiralAngle) * spiralRadius;
              
              BS.addBullet(px, py, vx, vy, opts.swirlLife, currentSize, currentColor);
              const b = BS.bullets[BS.bullets.length - 1];
              if (b) {
                b.shape = clusterProgress > 0.7 ? 'ellipse' : 'circle';
                b.rx = currentSize;
                b.ry = currentSize * (1 - clusterProgress * 0.1);
                b.orientToVel = clusterProgress > 0.6;
                
                b.color2 = opts.voidColor;
                b.restyleAt = opts.swirlLife * (0.3 + clusterProgress * 0.3);
                
                b.oscAxis = (swirl % 2 === 0) ? 'x' : 'y';
                b.oscAmp = opts.swirlOscAmp * (1 + swirlIntensity * 1.0) * (1 + Math.abs(darkMatterPhase) * 0.6);
                b.oscFreq = opts.swirlOscFreq + (swirl * 0.0002) + (cluster * 0.00015) + (swirlIntensity * 0.0003);
                b.angularVel = opts.rotateSpeed * ((swirl % 3 === 0) ? 1 : -1) * (0.9 + swirlIntensity) * (0.8 + clusterProgress * 0.2);
                
                if (clusterProgress > 0.5 && cluster % 2 === 0) {
                  b.trailMax = opts.trailMax;
                  b.trailIntervalMs = opts.trailIntervalMs;
                  b.trailColor = currentColor;
                  b.trailIntensity = swirlIntensity + clusterProgress;
                  b.swirlTrail = true;
                  b.darkMatterSwirlTrail = true;
                }
                
                b.glowEffect = true;
                b.glowSize = currentSize * (2.8 + swirlIntensity * 3.5) * (1 + clusterProgress * 2.2);
                b.glowColor = currentColor;
                b.glowIntensity = 0.25 + swirlIntensity * 0.7 + clusterProgress * 0.3;
                
                if (swirlIntensity > 0.6) {
                  b.swirlParticle = true;
                  b.darkMatterSwirl = true;
                  b.gravitationalVortex = swirlIntensity;
                  b.spacetimeVortex = swirlIntensity * 2;
                }
              }
            }
          }
        }
        
        // 暗物質團簇 - 隨機高密度攻擊
        if (Math.random() < opts.clusterProbability && Math.abs(darkMatterPhase) > 0.7) {
          const clusterCount = 8;
          const clusterDirection = Math.random() * TAU;
          for (let cluster = 0; cluster < clusterCount; cluster++) {
            const angle = clusterDirection + (cluster - clusterCount/2) * 0.3;
            const speed = opts.clusterSpeed * (0.8 + Math.random() * 0.4);
            const size = opts.clusterSize * (0.8 + Math.random() * 0.4);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            BS.addBullet(e.x, e.y, vx, vy, opts.clusterLife, size, opts.voidColor);
            const clusterBullet = BS.bullets[BS.bullets.length - 1];
            if (clusterBullet) {
              clusterBullet.shape = 'circle';
              clusterBullet.clusterType = 'dark_matter';
              clusterBullet.darkMatterCluster = true;
              clusterBullet.gravitationalCluster = true;
              clusterBullet.clusterDensity = Math.abs(darkMatterPhase);
              clusterBullet.voidCluster = true;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第4階段：BlackHoleStorm（黑洞風暴）- 風暴發射模式
  function blackHoleStorm(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      stormBeams: 26,           // 風暴束數量 (建議值: 14-22)
      stormParticles: 23,       // 風暴粒子數 (建議值: 10-18)
      gravitationalWaves: 20,   // 引力波數量 (建議值: 6-14)
      
      // ===== 發射頻率控制 =====
      stormInterval: 110,       // 風暴間隔毫秒 (建議值: 90-140)
      particleRate: 160,        // 粒子發射間隔毫秒 (建議值: 140-200)
      waveProbability: 0.22,    // 引力波概率 (建議值: 0.16-0.30)
      
      // ===== 基礎屬性 =====
      stormSpeed: 4.2,          // 風暴速度 (建議值: 3.5-5.0)
      particleSpeed: 3.5,       // 粒子速度 (建議值: 2.8-4.2)
      waveSpeed: 2.8,           // 引力波速度 (建議值: 2.2-3.5)
      stormLife: 7400,          // 風暴生命周期 (建議值: 6800-8000)
      particleLife: 6200,       // 粒子生命周期 (建議值: 5600-6800)
      waveLife: 8600,           // 引力波生命周期 (建議值: 8000-9200)
      stormSize: 16,            // 風暴大小 (建議值: 12-20)
      particleSize: 12,         // 粒子大小 (建議值: 9-15)
      waveSize: 14,             // 引力波大小 (建議值: 11-17)
      stormIntensity: 0.15,     // 風暴強度 (建議值: 0.12-0.20)
      blackHolePower: 0.11,     // 黑洞力量 (建議值: 0.08-0.15)
      
      // ===== 顏色配置 =====
      stormColor: '#0f3460',    // 風暴深藍 (主色)
      particleColor: '#16213e', // 粒子藍黑 (副色)
      waveColor: '#1a1a2e',     // 引力波深藍 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.18,        // 旋轉速度 (建議值: 0.14-0.24)
      stormRotation: 0.10,    // 風暴旋轉速度 (建議值: 0.08-0.14)
      
      // ===== 擺動效果 =====
      stormOscAmp: 36,          // 風暴擺動幅度 (建議值: 30-44)
      stormOscFreq: 0.0026,     // 風暴擺動頻率 (建議值: 0.0020-0.0032)
      particleOscAmp: 28,       // 粒子擺動幅度 (建議值: 22-34)
      particleOscFreq: 0.0032,   // 粒子擺動頻率 (建議值: 0.0026-0.0040)
      
      // ===== 軌跡效果 =====
      trailMax: 10,             // 軌跡長度 (建議值: 8-14)
      trailIntervalMs: 30,      // 軌跡間隔毫秒 (建議值: 25-40)
      stormTrail: true,         // 風暴軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.1,        // 空間密度倍率 (建議值: 0.9-1.4)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 添加詳細屬性調整區，優化黑洞風暴效果
      // 優化重點: 黑洞周圍的風暴式能量釋放和粒子噴流
      // 性能考量: 控制總子彈數量 < 75 個/幀 (終極風暴)
      // 平衡性: 三種不同速度的攻擊模式，形成黑洞風暴雲
    }, options || {});
    
    let theta = 0;
    let stormPhase = 0;
    let stormTimer = 0;
    let particleTimer = 0;
    
    return function(e, BS) {
      try {
        stormPhase = Math.sin(theta * 0.45);
        
        // 主要風暴束發射 - 高頻率攻擊
        stormTimer += 16;
        if (stormTimer >= opts.stormInterval) {
          stormTimer = 0;
          
          // 生成風暴束 - 多重角度風暴式發射
          for (let storm = 0; storm < opts.stormBeams; storm++) {
            const baseAngle = (storm * TAU) / opts.stormBeams;
            
            // 風暴強度效果
            const stormIntensity = 1 + Math.sin(storm + theta * 0.18) * opts.stormIntensity;
            const blackHolePower = Math.cos(storm * 1.3 + theta * 0.25) * opts.blackHolePower;
            const stormSpeed = opts.stormSpeed * (1 + Math.abs(stormPhase) * 0.7 + stormIntensity * 0.6);
            
            const stormAngle = baseAngle + theta * 0.6 + stormPhase * 0.3 + blackHolePower * 1.5;
            const stormVx = Math.cos(stormAngle) * stormSpeed;
            const stormVy = Math.sin(stormAngle) * stormSpeed;
            
            // 從BOSS中心射出
            const px = e.x;
            const py = e.y;
            
            BS.addBullet(px, py, stormVx, stormVy, opts.stormLife, opts.stormSize, opts.stormColor);
            const stormBullet = BS.bullets[BS.bullets.length - 1];
            if (stormBullet) {
              stormBullet.shape = 'ellipse';
              stormBullet.rx = opts.stormSize * 1.6;
              stormBullet.ry = opts.stormSize * 0.8;
              stormBullet.orientToVel = true;
              
              // 風暴特性
              stormBullet.stormIntensity = stormIntensity;
              stormBullet.blackHolePower = blackHolePower;
              stormBullet.gravitationalStorm = true;
              stormBullet.blackHoleStorm = true;
              stormBullet.stormPhase = stormPhase;
              
              // 顏色漸變
              stormBullet.color2 = opts.particleColor;
              stormBullet.restyleAt = opts.stormLife * (0.2 + stormIntensity * 0.25 + Math.abs(stormPhase) * 0.15);
              
              // 擺動效果（風暴特徵）
              stormBullet.oscAxis = (storm % 2 === 0) ? 'x' : 'y';
              stormBullet.oscAmp = opts.stormOscAmp * (1 + stormIntensity * 1.0) * (1 + Math.abs(stormPhase) * 0.8) * (1 + Math.abs(blackHolePower) * 1.2);
              stormBullet.oscFreq = opts.stormOscFreq + (storm * 0.0002) + (Math.abs(stormPhase) * 0.0003) + (stormIntensity * 0.0004) + (Math.abs(blackHolePower) * 0.0006);
              stormBullet.angularVel = opts.rotateSpeed * ((storm % 3 === 0) ? 1 : -1) * (1.0 + stormIntensity * 0.5 + Math.abs(stormPhase) * 0.3 + Math.abs(blackHolePower) * 0.7);
              
              // 強化軌跡（風暴軌跡）
              if (storm % 2 === 0) {
                stormBullet.trailMax = opts.trailMax;
                stormBullet.trailIntervalMs = opts.trailIntervalMs;
                stormBullet.trailColor = opts.stormColor;
                stormBullet.trailIntensity = stormIntensity + Math.abs(stormPhase) + Math.abs(blackHolePower) + 0.8;
                stormBullet.stormTrail = true;
                stormBullet.blackHoleTrail = true;
                stormBullet.gravitationalStormTrail = true;
              }
              
              // 強力發光（黑洞風暴發光）
              stormBullet.glowEffect = true;
              stormBullet.glowSize = opts.stormSize * (3.5 + stormIntensity * 4 + Math.abs(stormPhase) * 2.5 + Math.abs(blackHolePower) * 6);
              stormBullet.glowColor = opts.stormColor;
              stormBullet.glowIntensity = 0.4 + stormIntensity * 0.7 + Math.abs(stormPhase) * 0.5 + Math.abs(blackHolePower) * 1.0;
              stormBullet.blackHoleGlow = true;
              stormBullet.stormGlow = true;
              stormBullet.gravitationalStormGlow = true;
              
              stormBullet.beamType = 'black_hole_storm';
              stormBullet.energyLevel = stormIntensity + Math.abs(blackHolePower);
              stormBullet.spacetimeStorm = stormIntensity * 2;
              stormBullet.blackHoleEnergy = Math.abs(blackHolePower) * 3;
            }
            
            // 次級粒子噴流（每個主束附帶）
            for (let sub = 0; sub < 3; sub++) {
              const subAngleOffset = (sub - 1) * 0.4 * stormIntensity;
              const subAngle = stormAngle + subAngleOffset;
              const subSpeed = stormSpeed * 0.75;
              const subVx = Math.cos(subAngle) * subSpeed;
              const subVy = Math.sin(subAngle) * subSpeed;
              
              const subSize = opts.particleSize * (0.8 + sub * 0.1);
              const subLife = opts.stormLife * 0.85;
              
              BS.addBullet(px, py, subVx, subVy, subLife, subSize, opts.particleColor);
              const subBullet = BS.bullets[BS.bullets.length - 1];
              if (subBullet) {
                subBullet.shape = 'ellipse';
                subBullet.rx = subSize * 1.2;
                subBullet.ry = subSize * 0.7;
                subBullet.orientToVel = true;
                subBullet.subStorm = true;
                subBullet.parentStorm = storm;
                subBullet.stormIntensity = stormIntensity * 0.8;
                subBullet.subAngleOffset = subAngleOffset;
                
                subBullet.color2 = opts.waveColor;
                subBullet.restyleAt = subLife * 0.5;
                
                subBullet.particleJet = true;
                subBullet.jetIntensity = stormIntensity * 0.6;
                subBullet.gravitationalJet = true;
              }
            }
          }
        }
        
        // 粒子發射 - 中等頻率攻擊
        particleTimer += 16;
        if (particleTimer >= opts.particleRate) {
          particleTimer = 0;
          
          const particleDirection = Math.random() * TAU;
          for (let particle = 0; particle < opts.stormParticles; particle++) {
            const angleOffset = (particle - opts.stormParticles/2) * 0.6;
            const particleAngle = particleDirection + angleOffset;
            
            // 速度變化
            const speedVariation = Math.random() * 0.5 + 0.8;
            const particleSpeed = opts.particleSpeed * speedVariation;
            const particleVx = Math.cos(particleAngle) * particleSpeed;
            const particleVy = Math.sin(particleAngle) * particleSpeed;
            
            const currentParticleSize = opts.particleSize * (0.9 + Math.random() * 0.4);
            
            BS.addBullet(e.x, e.y, particleVx, particleVy, opts.particleLife, currentParticleSize, opts.particleColor);
            const particleBullet = BS.bullets[BS.bullets.length - 1];
            if (particleBullet) {
              particleBullet.shape = 'ellipse';
              particleBullet.rx = currentParticleSize * 1.3;
              particleBullet.ry = currentParticleSize * 0.6;
              particleBullet.orientToVel = true;
              
              particleBullet.particleType = 'storm';
              particleBullet.speedVariation = speedVariation;
              particleBullet.angleOffset = angleOffset;
              particleBullet.stormParticle = true;
              particleBullet.blackHoleParticle = true;
              
              // 顏色漸變
              particleBullet.color2 = opts.waveColor;
              particleBullet.restyleAt = opts.particleLife * 0.4;
              
              // 強化擺動
              particleBullet.oscAxis = 'both';
              particleBullet.oscAmp = opts.particleOscAmp * 0.9;
              particleBullet.oscFreq = opts.particleOscFreq * 1.2;
              particleBullet.angularVel = opts.rotateSpeed * 1.8 * (Math.random() > 0.5 ? 1 : -1);
              
              // 強化軌跡
              particleBullet.trailMax = opts.trailMax + 1;
              particleBullet.trailIntervalMs = opts.trailIntervalMs - 5;
              particleBullet.trailColor = opts.particleColor;
              particleBullet.trailIntensity = 0.7 + speedVariation * 0.4;
              particleBullet.particleTrail = true;
              particleBullet.blackHoleTrail = true;
              
              // 強化發光
              particleBullet.glowEffect = true;
              particleBullet.glowSize = currentParticleSize * 2.8;
              particleBullet.glowColor = opts.particleColor;
              particleBullet.glowIntensity = 0.35 + speedVariation * 0.3;
            }
          }
        }
        
        // 引力波爆發 - 低頻率高威力攻擊
        if (Math.random() < opts.waveProbability && Math.abs(stormPhase) > 0.75) {
          const waveCount = opts.gravitationalWaves;
          const waveDirection = Math.random() * TAU;
          for (let wave = 0; wave < waveCount; wave++) {
            const precisionAngle = waveDirection + (wave - waveCount/2) * 0.25;
            
            // 高精度引力波
            const waveSpeed = opts.waveSpeed * (0.95 + Math.random() * 0.1);
            const waveVx = Math.cos(precisionAngle) * waveSpeed;
            const waveVy = Math.sin(precisionAngle) * waveSpeed;
            
            const currentWaveSize = opts.waveSize * (0.9 + Math.random() * 0.2);
            
            BS.addBullet(e.x, e.y, waveVx, waveVy, opts.waveLife, currentWaveSize, opts.waveColor);
            const waveBullet = BS.bullets[BS.bullets.length - 1];
            if (waveBullet) {
              waveBullet.shape = 'ellipse';
              waveBullet.rx = currentWaveSize * 1.8;
              waveBullet.ry = currentWaveSize * 0.7;
              waveBullet.orientToVel = true;
              
              waveBullet.waveType = 'gravitational';
              waveBullet.precisionAngle = precisionAngle;
              waveBullet.waveSpeed = waveSpeed;
              waveBullet.gravitationalWave = true;
              waveBullet.blackHoleWave = true;
              waveBullet.stormPhase = stormPhase;
              
              // 顏色漸變
              waveBullet.color2 = opts.stormColor;
              waveBullet.restyleAt = opts.waveLife * 0.3;
              
              // 極小擺動（高精度）
              waveBullet.oscAxis = (wave % 2 === 0) ? 'x' : 'y';
              waveBullet.oscAmp = opts.stormOscAmp * 0.4;
              waveBullet.oscFreq = opts.stormOscFreq * 0.9;
              waveBullet.angularVel = opts.rotateSpeed * 0.6 * (wave % 2 === 0 ? 1 : -1);
              
              // 特殊軌跡
              waveBullet.trailMax = opts.trailMax + 2;
              waveBullet.trailIntervalMs = opts.trailIntervalMs - 10;
              waveBullet.trailColor = opts.waveColor;
              waveBullet.trailIntensity = 0.9;
              waveBullet.gravitationalWaveTrail = true;
              waveBullet.precisionTrail = true;
              
              // 強力發光
              waveBullet.glowEffect = true;
              waveBullet.glowSize = currentWaveSize * 3.5;
              waveBullet.glowColor = opts.waveColor;
              waveBullet.glowIntensity = 0.6;
              waveBullet.gravitationalWaveGlow = true;
              waveBullet.blackHoleWaveGlow = true;
            }
          }
        }
        
        // 偶發性的超大規模黑洞風暴（特殊效果）
        if (Math.random() < 0.015 && Math.abs(stormPhase) > 0.9) { // 1.5%概率
          const megaStormCount = 25;
          const megaStormDirection = Math.random() * TAU;
          for (let mega = 0; mega < megaStormCount; mega++) {
            const angle = megaStormDirection + (mega - megaStormCount/2) * 0.08;
            const speed = opts.stormSpeed * (1.4 + Math.random() * 0.6);
            const size = opts.stormSize * (0.7 + Math.random() * 0.5);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            BS.addBullet(e.x, e.y, vx, vy, opts.stormLife, size, opts.stormColor);
            const megaBullet = BS.bullets[BS.bullets.length - 1];
            if (megaBullet) {
              megaBullet.shape = 'ellipse';
              megaBullet.rx = size * 2.2;
              megaBullet.ry = size * 1.1;
              megaBullet.orientToVel = true;
              megaBullet.megaStorm = true;
              megaBullet.blackHoleMegaStorm = true;
              megaBullet.cosmicStorm = true;
              megaBullet.stormIntensity = 2.5;
              megaBullet.blackHoleEnergy = 4;
              megaBullet.spacetimeStorm = true;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第5階段：QuantumCollapse（量子坍縮）- 量子層級彈幕模式
  function quantumCollapse(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      quantumBeams: 20,           // 量子束數量 (建議值: 16-24)
      quantumParticles: 16,       // 量子粒子數 (建議值: 12-20)
      quantumWaves: 12,           // 量子波數量 (建議值: 8-16)
      
      // ===== 發射頻率控制 =====
      quantumInterval: 100,       // 量子間隔毫秒 (建議值: 85-125)
      collapseRate: 180,          // 坍縮間隔毫秒 (建議值: 150-220)
      waveProbability: 0.25,      // 量子波概率 (建議值: 0.18-0.32)
      
      // ===== 基礎屬性 =====
      quantumSpeed: 4.8,          // 量子速度 (建議值: 4.0-5.5)
      collapseSpeed: 5.5,         // 坍縮速度 (建議值: 4.5-6.5)
      waveSpeed: 3.2,             // 量子波速度 (建議值: 2.6-4.0)
      quantumLife: 6800,          // 量子生命周期 (建議值: 6200-7400)
      collapseLife: 5200,         // 坍縮生命周期 (建議值: 4600-5800)
      waveLife: 7800,             // 量子波生命周期 (建議值: 7200-8400)
      quantumSize: 14,            // 量子大小 (建議值: 11-17)
      collapseSize: 18,           // 坍縮大小 (建議值: 14-22)
      waveSize: 12,               // 量子波大小 (建議值: 9-15)
      quantumUncertainty: 0.13,   // 量子不確定性 (建議值: 0.10-0.18)
      collapseIntensity: 0.16,    // 坍縮強度 (建議值: 0.12-0.20)
      
      // ===== 顏色配置 =====
      quantumColor: '#0a0a0a',    // 量子黑 (主色)
      collapseColor: '#1a1a2e',   // 坍縮深藍 (副色)
      waveColor: '#16213e',       // 量子波藍黑 (特效色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.22,          // 旋轉速度 (建議值: 0.18-0.28)
      uncertaintySpeed: 0.14,     // 不確定性速度 (建議值: 0.11-0.18)
      
      // ===== 擺動效果 =====
      quantumOscAmp: 42,          // 量子擺動幅度 (建議值: 36-48)
      quantumOscFreq: 0.0030,     // 量子擺動頻率 (建議值: 0.0024-0.0036)
      collapseOscAmp: 38,         // 坍縮擺動幅度 (建議值: 32-44)
      collapseOscFreq: 0.0038,    // 坍縮擺動頻率 (建議值: 0.0030-0.0045)
      
      // ===== 軌跡效果 =====
      trailMax: 11,               // 軌跡長度 (建議值: 9-15)
      trailIntervalMs: 25,        // 軌跡間隔毫秒 (建議值: 20-35)
      quantumTrail: true,         // 量子軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.2,          // 空間密度倍率 (建議值: 1.0-1.5)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 添加詳細屬性調整區，優化量子坍縮效果
      // 優化重點: 黑洞量子層級的坍縮效應和不確定性原理
      // 性能考量: 控制總子彈數量 < 80 個/幀 (量子多層次)
      // 平衡性: 三種不同量子態的攻擊模式，體現量子不確定性
    }, options || {});
    
    let theta = 0;
    let quantumPhase = 0;
    let quantumTimer = 0;
    let collapseTimer = 0;
    
    return function(e, BS) {
      try {
        quantumPhase = Math.sin(theta * 0.6);
        
        // 主要量子束發射 - 高頻率不確定性攻擊
        quantumTimer += 16;
        if (quantumTimer >= opts.quantumInterval) {
          quantumTimer = 0;
          
          // 生成量子束 - 多重角度量子態發射
          for (let quantum = 0; quantum < opts.quantumBeams; quantum++) {
            const baseAngle = (quantum * TAU) / opts.quantumBeams;
            
            // 量子不確定性效果
            const uncertainty = Math.sin(quantum * 2.3 + theta * 0.4) * opts.quantumUncertainty;
            const collapseEffect = Math.cos(quantum * 1.7 + theta * 0.3) * opts.collapseIntensity;
            const quantumSpeed = opts.quantumSpeed * (1 + Math.abs(quantumPhase) * 0.8 + Math.abs(uncertainty) * 3);
            
            // 量子角度包含不確定性
            const quantumAngle = baseAngle + theta * 0.8 + uncertainty * 2.0 + collapseEffect * 1.2;
            const quantumVx = Math.cos(quantumAngle) * quantumSpeed;
            const quantumVy = Math.sin(quantumAngle) * quantumSpeed;
            
            // 從BOSS中心射出
            const px = e.x;
            const py = e.y;
            
            BS.addBullet(px, py, quantumVx, quantumVy, opts.quantumLife, opts.quantumSize, opts.quantumColor);
            const quantumBullet = BS.bullets[BS.bullets.length - 1];
            if (quantumBullet) {
              quantumBullet.shape = 'ellipse';
              quantumBullet.rx = opts.quantumSize * 1.5;
              quantumBullet.ry = opts.quantumSize * 0.9;
              quantumBullet.orientToVel = true;
              
              // 量子特性
              quantumBullet.quantumUncertainty = uncertainty;
              quantumBullet.quantumState = true;
              quantumBullet.quantumMechanics = true;
              quantumBullet.quantumPhase = quantumPhase;
              quantumBullet.uncertaintyLevel = Math.abs(uncertainty);
              
              // 顏色漸變
              quantumBullet.color2 = opts.collapseColor;
              quantumBullet.restyleAt = opts.quantumLife * (0.15 + Math.abs(uncertainty) * 0.35 + Math.abs(quantumPhase) * 0.25);
              
              // 量子擺動（不確定性特徵）
              quantumBullet.oscAxis = (quantum % 3 === 0) ? 'x' : ((quantum % 3 === 1) ? 'y' : 'both');
              quantumBullet.oscAmp = opts.quantumOscAmp * (1 + Math.abs(uncertainty) * 2.0) * (1 + Math.abs(quantumPhase) * 1.2) * (1 + Math.abs(collapseEffect) * 1.5);
              quantumBullet.oscFreq = opts.quantumOscFreq + (quantum * 0.00025) + (Math.abs(uncertainty) * 0.0008) + (Math.abs(quantumPhase) * 0.0004) + (Math.abs(collapseEffect) * 0.0006);
              quantumBullet.angularVel = opts.rotateSpeed * ((quantum % 4 === 0) ? 1 : -1) * (1.2 + Math.abs(uncertainty) * 0.8 + Math.abs(quantumPhase) * 0.5 + Math.abs(collapseEffect) * 0.7);
              
              // 量子軌跡
              if (quantum % 2 === 0) {
                quantumBullet.trailMax = opts.trailMax;
                quantumBullet.trailIntervalMs = opts.trailIntervalMs;
                quantumBullet.trailColor = opts.quantumColor;
                quantumBullet.trailIntensity = Math.abs(uncertainty) + Math.abs(quantumPhase) + 0.8;
                quantumBullet.quantumTrail = true;
                quantumBullet.uncertaintyTrail = true;
              }
              
              // 量子發光
              quantumBullet.glowEffect = true;
              quantumBullet.glowSize = opts.quantumSize * (3.0 + Math.abs(uncertainty) * 4 + Math.abs(quantumPhase) * 2.5 + Math.abs(collapseEffect) * 3.5);
              quantumBullet.glowColor = opts.quantumColor;
              quantumBullet.glowIntensity = 0.2 + Math.abs(uncertainty) * 0.8 + Math.abs(quantumPhase) * 0.6 + Math.abs(collapseEffect) * 0.9;
              quantumBullet.quantumGlow = true;
              quantumBullet.uncertaintyGlow = true;
              
              quantumBullet.beamType = 'quantum_collapse';
              quantumBullet.energyLevel = Math.abs(uncertainty) + Math.abs(quantumPhase) + Math.abs(collapseEffect);
              quantumBullet.quantumEnergy = Math.abs(uncertainty) * 2;
              quantumBullet.spacetimeUncertainty = Math.abs(uncertainty) * 1.5;
            }
            
            // 次級量子粒子 - 擴散角度發射
            for (let particle = 0; particle < opts.quantumParticles; particle++) {
              const particleOffset = (particle - opts.quantumParticles/2) * 0.4;
              const particleAngle = quantumAngle + particleOffset;
              const particleSpeed = opts.quantumSpeed * 0.7;
              const particleVx = Math.cos(particleAngle) * particleSpeed;
              const particleVy = Math.sin(particleAngle) * particleSpeed;
              
              const particleSize = opts.quantumSize * 0.6;
              const particleLife = opts.quantumLife * 0.8;
              
              BS.addBullet(px, py, particleVx, particleVy, particleLife, particleSize, opts.quantumColor);
              const particleBullet = BS.bullets[BS.bullets.length - 1];
              if (particleBullet) {
                particleBullet.shape = 'circle';
                particleBullet.quantumParticle = true;
                particleBullet.parentQuantum = quantum;
                particleBullet.particleOffset = particleOffset;
                particleBullet.quantumUncertainty = uncertainty * 0.7;
                particleBullet.subQuantumState = true;
                
                // 較弱的量子特性
                particleBullet.color2 = opts.waveColor;
                particleBullet.restyleAt = particleLife * 0.6;
                
                // 較弱的擺動
                particleBullet.oscAxis = (particle % 2 === 0) ? 'x' : 'y';
                particleBullet.oscAmp = opts.quantumOscAmp * 0.5;
                particleBullet.oscFreq = opts.quantumOscFreq * 1.3;
              }
            }
          }
        }
        
        // 量子坍縮發射 - 周期性大規模坍縮
        collapseTimer += 16;
        if (collapseTimer >= opts.collapseRate) {
          collapseTimer = 0;
          
          // 特殊量子坍縮（偶爾觸發）
          if (Math.random() < 0.3 && Math.abs(quantumPhase) > 0.8) {
            const collapseCount = 12;
            const collapseDirection = Math.random() * TAU;
            for (let collapse = 0; collapse < collapseCount; collapse++) {
              const angle = collapseDirection + (collapse - collapseCount/2) * 0.2;
              const speed = opts.collapseSpeed * (1.2 + Math.random() * 0.6);
              const size = opts.collapseSize * (0.8 + Math.random() * 0.4);
              const vx = Math.cos(angle) * speed;
              const vy = Math.sin(angle) * speed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.collapseLife, size, opts.collapseColor);
              const collapseBullet = BS.bullets[BS.bullets.length - 1];
              if (collapseBullet) {
                collapseBullet.shape = 'ellipse';
                collapseBullet.rx = size * 1.8;
                collapseBullet.ry = size * 0.8;
                collapseBullet.orientToVel = true;
                collapseBullet.quantumCollapse = true;
                collapseBullet.spacetimeCollapse = true;
                collapseBullet.cosmicCollapse = true;
                collapseBullet.collapseIntensity = Math.abs(quantumPhase) + 1;
                collapseBullet.quantumCollapseEnergy = 3;
              }
            }
          }
        }
        
        // 量子波爆發 - 低頻率高威力攻擊
        if (Math.random() < opts.waveProbability && Math.abs(quantumPhase) > 0.7) {
          const waveCount = opts.quantumWaves;
          const waveDirection = Math.random() * TAU;
          for (let wave = 0; wave < waveCount; wave++) {
            const precisionAngle = waveDirection + (wave - waveCount/2) * 0.3;
            
            // 高精度量子波
            const waveSpeed = opts.waveSpeed * (0.9 + Math.random() * 0.2);
            const waveVx = Math.cos(precisionAngle) * waveSpeed;
            const waveVy = Math.sin(precisionAngle) * waveSpeed;
            
            const currentWaveSize = opts.waveSize * (0.8 + Math.random() * 0.4);
            
            BS.addBullet(e.x, e.y, waveVx, waveVy, opts.waveLife, currentWaveSize, opts.waveColor);
            const waveBullet = BS.bullets[BS.bullets.length - 1];
            if (waveBullet) {
              waveBullet.shape = 'ellipse';
              waveBullet.rx = currentWaveSize * 1.4;
              waveBullet.ry = currentWaveSize * 0.7;
              waveBullet.orientToVel = true;
              
              waveBullet.waveType = 'quantum';
              waveBullet.quantumWave = true;
              waveBullet.uncertaintyWave = true;
              waveBullet.quantumPhase = quantumPhase;
              
              // 顏色漸變
              waveBullet.color2 = opts.quantumColor;
              waveBullet.restyleAt = opts.waveLife * 0.4;
              
              // 極小擺動（高精度）
              waveBullet.oscAxis = (wave % 2 === 0) ? 'x' : 'y';
              waveBullet.oscAmp = opts.quantumOscAmp * 0.3;
              waveBullet.oscFreq = opts.quantumOscFreq * 0.8;
              waveBullet.angularVel = opts.rotateSpeed * 0.4 * (wave % 2 === 0 ? 1 : -1);
              
              // 特殊軌跡
              waveBullet.trailMax = opts.trailMax + 2;
              waveBullet.trailIntervalMs = opts.trailIntervalMs - 8;
              waveBullet.trailColor = opts.waveColor;
              waveBullet.trailIntensity = 0.7;
              waveBullet.quantumWaveTrail = true;
              waveBullet.uncertaintyTrail = true;
              
              // 強力發光
              waveBullet.glowEffect = true;
              waveBullet.glowSize = currentWaveSize * 4.0;
              waveBullet.glowColor = opts.waveColor;
              waveBullet.glowIntensity = 0.5 + Math.abs(quantumPhase) * 0.4;
              waveBullet.quantumWaveGlow = true;
              waveBullet.uncertaintyGlow = true;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第6階段：VoidEruption（虛空爆發）- 虛空能量彈幕模式
  function voidEruption(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      starPoints: 6,              // 星形頂點數量 (建議值: 6-10)
      outerStarBullets: 20,       // 外層星形子彈數 (建議值: 20-28)
      innerStarBullets: 12,       // 內層星形子彈數 (建議值: 12-20)
      starLayers: 3,              // 星形層數 (建議值: 2-4)
      fillParticles: 8,          // 填充粒子數 (建議值: 8-16)
      
      // ===== 發射頻率控制 =====
      starInterval: 100,          // 星形間隔毫秒 (建議值: 85-120)
      fillRate: 180,              // 填充間隔毫秒 (建議值: 150-220)
      burstProbability: 0.25,     // 爆發概率 (建議值: 0.20-0.32)
      
      // ===== 基礎屬性 =====
      outerSpeed: 4.8,            // 外層速度 (建議值: 4.0-5.5)
      innerSpeed: 3.5,            // 內層速度 (建議值: 3.0-4.2)
      fillSpeed: 2.8,             // 填充速度 (建議值: 2.4-3.4)
      outerLife: 6500,            // 外層生命周期 (建議值: 6000-7000)
      innerLife: 7000,            // 內層生命周期 (建議值: 6500-7500)
      fillLife: 6000,             // 填充生命周期 (建議值: 5500-6500)
      outerSize: 14,              // 外層大小 (建議值: 12-16)
      innerSize: 12,              // 內層大小 (建議值: 10-14)
      fillSize: 10,               // 填充大小 (建議值: 8-12)
      starRotation: 0.20,         // 星形旋轉速度 (建議值: 0.16-0.26)
      starSpread: 0.15,           // 星形擴散度 (建議值: 0.12-0.20)
      
      // ===== 顏色配置 =====
      outerColor: '#FFFFFF',      // 外層白色 (主色)
      innerColor: '#4169E1',      // 內層藍色 (副色)
      fillColor: '#9370DB',       // 填充紫色 (特效色)
      voidColor: '#000000',       // 虛空純黑 (背景色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.22,          // 旋轉速度 (建議值: 0.18-0.28)
      starPhaseSpeed: 0.15,       // 星形相位速度 (建議值: 0.12-0.20)
      
      // ===== 擺動效果 =====
      outerOscAmp: 32,            // 外層擺動幅度 (建議值: 26-40)
      outerOscFreq: 0.0028,       // 外層擺動頻率 (建議值: 0.0022-0.0036)
      innerOscAmp: 28,            // 內層擺動幅度 (建議值: 22-36)
      innerOscFreq: 0.0032,       // 內層擺動頻率 (建議值: 0.0026-0.0040)
      
      // ===== 軌跡效果 =====
      trailMax: 10,               // 軌跡長度 (建議值: 8-14)
      trailIntervalMs: 25,         // 軌跡間隔毫秒 (建議值: 20-35)
      starTrail: true,            // 星形軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.2,          // 空間密度倍率 (建議值: 1.0-1.5)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為東方Project風格星形爆發彈幕
      // 優化重點: 多層嵌套星形圖案，外層白色內層藍紫色，形成視覺層次
      // 性能考量: 控制總子彈數量 < 80 個/幀 (星形多層次)
      // 平衡性: 星形對稱攻擊模式，體現虛空爆發的幾何美感
    }, options || {});
    
    let theta = 0;
    let starPhase = 0;
    let starTimer = 0;
    let fillTimer = 0;
    
    return function(e, BS) {
      try {
        starPhase = Math.sin(theta * opts.starPhaseSpeed);
        
        // 主要星形爆發發射 - 東方Project風格多層星形
        starTimer += 16;
        if (starTimer >= opts.starInterval) {
          starTimer = 0;
          
          const baseRotation = theta * opts.starRotation;
          
          // 生成多層星形
          for (let layer = 0; layer < opts.starLayers; layer++) {
            const layerOffset = (layer * TAU) / (opts.starLayers * opts.starPoints);
            const layerScale = 0.6 + layer * 0.2;
            
            // 外層星形 - 白色子彈形成星形輪廓
            for (let point = 0; point < opts.starPoints; point++) {
              const pointAngle = (point * TAU) / opts.starPoints + baseRotation + layerOffset;
              
              // 星形頂點發射
              for (let bullet = 0; bullet < opts.outerStarBullets; bullet++) {
                const bulletProgress = bullet / opts.outerStarBullets;
                const spreadAngle = pointAngle + (bulletProgress - 0.5) * opts.starSpread;
                const speed = opts.outerSpeed * layerScale * (1 + bulletProgress * 0.3);
                const vx = Math.cos(spreadAngle) * speed;
                const vy = Math.sin(spreadAngle) * speed;
                
                BS.addBullet(e.x, e.y, vx, vy, opts.outerLife, opts.outerSize, opts.outerColor);
                const outerBullet = BS.bullets[BS.bullets.length - 1];
                if (outerBullet) {
                  outerBullet.shape = 'circle';
                  outerBullet.voidEruption = true;
                  outerBullet.starLayer = layer;
                  outerBullet.starPoint = point;
                  
                  // 顏色漸變
                  outerBullet.color2 = opts.innerColor;
                  outerBullet.restyleAt = opts.outerLife * (0.3 + bulletProgress * 0.4);
                  
                  // 擺動效果
                  outerBullet.oscAxis = (point % 2 === 0) ? 'x' : 'y';
                  outerBullet.oscAmp = opts.outerOscAmp * (1 + Math.abs(starPhase) * 0.5) * layerScale;
                  outerBullet.oscFreq = opts.outerOscFreq + (point * 0.0002) + (layer * 0.00015);
                  outerBullet.angularVel = opts.rotateSpeed * ((point % 2 === 0) ? 1 : -1) * layerScale;
                  
                  // 軌跡效果
                  if (bullet % 3 === 0) {
                    outerBullet.trailMax = opts.trailMax;
                    outerBullet.trailIntervalMs = opts.trailIntervalMs;
                    outerBullet.trailColor = opts.outerColor;
                    outerBullet.trailIntensity = 0.6 + bulletProgress;
                    outerBullet.starTrail = true;
                  }
                  
                  // 發光效果
                  outerBullet.glowEffect = true;
                  outerBullet.glowSize = opts.outerSize * (2.0 + bulletProgress * 1.5);
                  outerBullet.glowColor = opts.outerColor;
                  outerBullet.glowIntensity = 0.4 + bulletProgress * 0.3;
                }
              }
            }
            
            // 內層星形 - 藍紫色子彈形成密集星形
            for (let point = 0; point < opts.starPoints; point++) {
              const pointAngle = (point * TAU) / opts.starPoints + baseRotation + layerOffset + TAU / (opts.starPoints * 2);
              
              for (let bullet = 0; bullet < opts.innerStarBullets; bullet++) {
                const bulletProgress = bullet / opts.innerStarBullets;
                const spreadAngle = pointAngle + (bulletProgress - 0.5) * opts.starSpread * 0.6;
                const speed = opts.innerSpeed * layerScale * (1 + bulletProgress * 0.25);
                const vx = Math.cos(spreadAngle) * speed;
                const vy = Math.sin(spreadAngle) * speed;
                
                BS.addBullet(e.x, e.y, vx, vy, opts.innerLife, opts.innerSize, opts.innerColor);
                const innerBullet = BS.bullets[BS.bullets.length - 1];
                if (innerBullet) {
                  innerBullet.shape = 'circle';
                  innerBullet.voidEruption = true;
                  innerBullet.starLayer = layer;
                  innerBullet.isInnerStar = true;
                  
                  // 顏色漸變
                  innerBullet.color2 = opts.fillColor;
                  innerBullet.restyleAt = opts.innerLife * (0.4 + bulletProgress * 0.3);
                  
                  // 擺動效果
                  innerBullet.oscAxis = (point % 2 === 0) ? 'y' : 'x';
                  innerBullet.oscAmp = opts.innerOscAmp * (1 + Math.abs(starPhase) * 0.4) * layerScale;
                  innerBullet.oscFreq = opts.innerOscFreq + (point * 0.00025) + (layer * 0.0002);
                  innerBullet.angularVel = opts.rotateSpeed * ((point % 2 === 0) ? -1 : 1) * layerScale * 0.8;
                  
                  // 發光效果
                  innerBullet.glowEffect = true;
                  innerBullet.glowSize = opts.innerSize * (2.5 + bulletProgress * 1.2);
                  innerBullet.glowColor = opts.innerColor;
                  innerBullet.glowIntensity = 0.5 + bulletProgress * 0.4;
                }
              }
            }
          }
        }
        
        // 填充粒子發射 - 紫色粒子填充星形間隙
        fillTimer += 16;
        if (fillTimer >= opts.fillRate) {
          fillTimer = 0;
          
          if (Math.random() < opts.burstProbability) {
            const fillDirection = Math.random() * TAU;
            for (let fill = 0; fill < opts.fillParticles; fill++) {
              const fillAngle = fillDirection + (fill - opts.fillParticles/2) * 0.3;
              const speed = opts.fillSpeed * (0.9 + Math.random() * 0.3);
              const vx = Math.cos(fillAngle) * speed;
              const vy = Math.sin(fillAngle) * speed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.fillLife, opts.fillSize, opts.fillColor);
              const fillBullet = BS.bullets[BS.bullets.length - 1];
              if (fillBullet) {
                fillBullet.shape = 'circle';
                fillBullet.voidEruption = true;
                fillBullet.isFillParticle = true;
                
                // 顏色漸變
                fillBullet.color2 = opts.innerColor;
                fillBullet.restyleAt = opts.fillLife * 0.5;
                
                // 輕微擺動
                fillBullet.oscAxis = (fill % 2 === 0) ? 'x' : 'y';
                fillBullet.oscAmp = opts.innerOscAmp * 0.4;
                fillBullet.oscFreq = opts.innerOscFreq * 1.1;
                
                // 發光效果
                fillBullet.glowEffect = true;
                fillBullet.glowSize = opts.fillSize * 2.0;
                fillBullet.glowColor = opts.fillColor;
                fillBullet.glowIntensity = 0.3;
              }
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第7階段：SpacetimeRift（時空裂縫）- 時空扭曲彈幕模式
  function spacetimeRift(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      spiralArms: 4,              // 螺旋臂數量 (建議值: 4-8)
      spiralBullets: 10,          // 每臂子彈數 (建議值: 16-24)
      spiralLayers: 3,            // 螺旋層數 (建議值: 3-5)
      riftParticles: 5,          // 裂縫粒子數 (建議值: 10-18)
      
      // ===== 發射頻率控制 =====
      spiralInterval: 90,        // 螺旋間隔毫秒 (建議值: 75-110)
      riftRate: 200,              // 裂縫間隔毫秒 (建議值: 170-240)
      burstProbability: 0.30,      // 爆發概率 (建議值: 0.24-0.38)
      
      // ===== 基礎屬性 =====
      spiralSpeed: 4.5,           // 螺旋速度 (建議值: 3.8-5.2)
      riftSpeed: 5.8,             // 裂縫速度 (建議值: 5.0-6.5)
      particleSpeed: 3.2,         // 粒子速度 (建議值: 2.8-3.8)
      spiralLife: 6000,           // 螺旋生命周期 (建議值: 5500-6500)
      riftLife: 5500,             // 裂縫生命周期 (建議值: 5000-6000)
      particleLife: 5800,          // 粒子生命周期 (建議值: 5300-6300)
      spiralSize: 15,             // 螺旋大小 (建議值: 13-17)
      riftSize: 17,               // 裂縫大小 (建議值: 15-19)
      particleSize: 13,           // 粒子大小 (建議值: 11-15)
      spiralTightness: 0.18,      // 螺旋緊密度 (建議值: 0.14-0.24)
      spiralSpread: 0.12,         // 螺旋擴散度 (建議值: 0.10-0.16)
      
      // ===== 顏色配置 =====
      spiralColor: '#1a1a2e',     // 螺旋深藍 (主色)
      riftColor: '#0f3460',       // 裂縫深藍 (副色)
      particleColor: '#4169E1',   // 粒子藍色 (特效色)
      voidColor: '#000000',       // 虛空純黑 (背景色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.26,          // 旋轉速度 (建議值: 0.22-0.32)
      spiralRotation: 0.16,      // 螺旋旋轉速度 (建議值: 0.13-0.21)
      
      // ===== 擺動效果 =====
      spiralOscAmp: 38,           // 螺旋擺動幅度 (建議值: 32-46)
      spiralOscFreq: 0.0030,      // 螺旋擺動頻率 (建議值: 0.0025-0.0038)
      riftOscAmp: 42,             // 裂縫擺動幅度 (建議值: 36-50)
      riftOscFreq: 0.0034,        // 裂縫擺動頻率 (建議值: 0.0028-0.0042)
      
      // ===== 軌跡效果 =====
      trailMax: 12,               // 軌跡長度 (建議值: 10-16)
      trailIntervalMs: 22,        // 軌跡間隔毫秒 (建議值: 18-30)
      spiralTrail: true,          // 螺旋軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.3,          // 空間密度倍率 (建議值: 1.1-1.6)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為東方Project風格螺旋裂縫彈幕
      // 優化重點: 多層螺旋結構，形成時空扭曲的視覺效果
      // 性能考量: 控制總子彈數量 < 85 個/幀 (螺旋多層次)
      // 平衡性: 螺旋對稱攻擊模式，體現時空裂縫的動態美感
    }, options || {});
    
    let theta = 0;
    let spiralPhase = 0;
    let spiralTimer = 0;
    let riftTimer = 0;
    
    return function(e, BS) {
      try {
        spiralPhase = Math.sin(theta * opts.spiralRotation);
        
        // 主要螺旋發射 - 東方Project風格多層螺旋
        spiralTimer += 16;
        if (spiralTimer >= opts.spiralInterval) {
          spiralTimer = 0;
          
          const baseRotation = theta * opts.rotateSpeed;
          
          // 生成多層螺旋
          for (let layer = 0; layer < opts.spiralLayers; layer++) {
            const layerOffset = (layer * TAU) / (opts.spiralLayers * opts.spiralArms);
            const layerScale = 0.7 + layer * 0.15;
            
            // 螺旋臂發射
            for (let arm = 0; arm < opts.spiralArms; arm++) {
              const armAngle = (arm * TAU) / opts.spiralArms + baseRotation + layerOffset;
              
              // 沿螺旋臂發射子彈
              for (let bullet = 0; bullet < opts.spiralBullets; bullet++) {
                const bulletProgress = bullet / opts.spiralBullets;
                const spiralAngle = armAngle + bulletProgress * opts.spiralTightness * TAU + spiralPhase * 0.3;
                const speed = opts.spiralSpeed * layerScale * (1 + bulletProgress * 0.4);
                const vx = Math.cos(spiralAngle) * speed;
                const vy = Math.sin(spiralAngle) * speed;
                
                BS.addBullet(e.x, e.y, vx, vy, opts.spiralLife, opts.spiralSize, opts.spiralColor);
                const spiralBullet = BS.bullets[BS.bullets.length - 1];
                if (spiralBullet) {
                  spiralBullet.shape = 'ellipse';
                  spiralBullet.rx = opts.spiralSize * 1.3;
                  spiralBullet.ry = opts.spiralSize * 0.8;
                  spiralBullet.orientToVel = true;
                  spiralBullet.spacetimeRift = true;
                  spiralBullet.spiralLayer = layer;
                  spiralBullet.spiralArm = arm;
                  
                  // 顏色漸變
                  spiralBullet.color2 = opts.riftColor;
                  spiralBullet.restyleAt = opts.spiralLife * (0.2 + bulletProgress * 0.5);
                  
                  // 擺動效果
                  spiralBullet.oscAxis = (arm % 2 === 0) ? 'x' : 'y';
                  spiralBullet.oscAmp = opts.spiralOscAmp * (1 + Math.abs(spiralPhase) * 0.6) * layerScale;
                  spiralBullet.oscFreq = opts.spiralOscFreq + (arm * 0.0003) + (layer * 0.0002);
                  spiralBullet.angularVel = opts.rotateSpeed * ((arm % 2 === 0) ? 1 : -1) * layerScale;
                  
                  // 軌跡效果
                  if (bullet % 4 === 0) {
                    spiralBullet.trailMax = opts.trailMax;
                    spiralBullet.trailIntervalMs = opts.trailIntervalMs;
                    spiralBullet.trailColor = opts.spiralColor;
                    spiralBullet.trailIntensity = 0.7 + bulletProgress;
                    spiralBullet.spiralTrail = true;
                  }
                  
                  // 發光效果
                  spiralBullet.glowEffect = true;
                  spiralBullet.glowSize = opts.spiralSize * (2.2 + bulletProgress * 1.8);
                  spiralBullet.glowColor = opts.spiralColor;
                  spiralBullet.glowIntensity = 0.4 + bulletProgress * 0.4;
                }
              }
            }
          }
        }
        
        // 裂縫粒子發射 - 填充螺旋間隙
        riftTimer += 16;
        if (riftTimer >= opts.riftRate) {
          riftTimer = 0;
          
          if (Math.random() < opts.burstProbability) {
            const riftDirection = Math.random() * TAU;
            for (let rift = 0; rift < opts.riftParticles; rift++) {
              const riftAngle = riftDirection + (rift - opts.riftParticles/2) * 0.25;
              const speed = opts.riftSpeed * (0.95 + Math.random() * 0.2);
              const vx = Math.cos(riftAngle) * speed;
              const vy = Math.sin(riftAngle) * speed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.riftLife, opts.riftSize, opts.riftColor);
              const riftBullet = BS.bullets[BS.bullets.length - 1];
              if (riftBullet) {
                riftBullet.shape = 'ellipse';
                riftBullet.rx = opts.riftSize * 1.5;
                riftBullet.ry = opts.riftSize * 0.9;
                riftBullet.orientToVel = true;
                riftBullet.spacetimeRift = true;
                riftBullet.isRiftParticle = true;
                
                // 顏色漸變
                riftBullet.color2 = opts.particleColor;
                riftBullet.restyleAt = opts.riftLife * 0.4;
                
                // 擺動效果
                riftBullet.oscAxis = (rift % 2 === 0) ? 'x' : 'y';
                riftBullet.oscAmp = opts.riftOscAmp * 0.5;
                riftBullet.oscFreq = opts.riftOscFreq * 1.2;
                
                // 發光效果
                riftBullet.glowEffect = true;
                riftBullet.glowSize = opts.riftSize * 2.5;
                riftBullet.glowColor = opts.riftColor;
                riftBullet.glowIntensity = 0.5;
              }
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第8階段：NebulaCollapse（星雲坍縮）- 星雲坍縮彈幕模式
  function nebulaCollapse(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      ringCount: 4,               // 環形數量 (建議值: 4-6)
      ringBullets: 24,            // 每環子彈數 (建議值: 24-32)
      ringLayers: 2,              // 環形層數 (建議值: 2-4)
      collapseParticles: 12,      // 坍縮粒子數 (建議值: 12-20)
      
      // ===== 發射頻率控制 =====
      ringInterval: 80,           // 環形間隔毫秒 (建議值: 70-95)
      collapseRate: 250,          // 坍縮間隔毫秒 (建議值: 220-300)
      burstProbability: 0.28,     // 爆發概率 (建議值: 0.22-0.35)
      
      // ===== 基礎屬性 =====
      ringSpeed: 4.2,             // 環形速度 (建議值: 3.6-4.8)
      collapseSpeed: 5.5,         // 坍縮速度 (建議值: 4.8-6.2)
      particleSpeed: 3.5,         // 粒子速度 (建議值: 3.0-4.2)
      ringLife: 5800,            // 環形生命周期 (建議值: 5300-6300)
      collapseLife: 5000,         // 坍縮生命周期 (建議值: 4500-5500)
      particleLife: 5600,         // 粒子生命周期 (建議值: 5100-6100)
      ringSize: 16,               // 環形大小 (建議值: 14-18)
      collapseSize: 19,           // 坍縮大小 (建議值: 17-21)
      particleSize: 14,           // 粒子大小 (建議值: 12-16)
      ringGap: 0.08,              // 環形間隙 (建議值: 0.06-0.12)
      collapseIntensity: 0.20,    // 坍縮強度 (建議值: 0.16-0.26)
      
      // ===== 顏色配置 =====
      ringColor: '#16213e',       // 環形藍黑 (主色)
      collapseColor: '#0f3460',   // 坍縮深藍 (副色)
      particleColor: '#4169E1',   // 粒子藍色 (特效色)
      voidColor: '#000000',       // 虛空純黑 (背景色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.30,          // 旋轉速度 (建議值: 0.26-0.36)
      ringRotation: 0.18,         // 環形旋轉速度 (建議值: 0.15-0.23)
      
      // ===== 擺動效果 =====
      ringOscAmp: 44,             // 環形擺動幅度 (建議值: 38-52)
      ringOscFreq: 0.0036,        // 環形擺動頻率 (建議值: 0.0030-0.0044)
      collapseOscAmp: 50,         // 坍縮擺動幅度 (建議值: 44-58)
      collapseOscFreq: 0.0042,   // 坍縮擺動頻率 (建議值: 0.0036-0.0050)
      
      // ===== 軌跡效果 =====
      trailMax: 14,               // 軌跡長度 (建議值: 12-18)
      trailIntervalMs: 20,        // 軌跡間隔毫秒 (建議值: 16-28)
      ringTrail: true,            // 環形軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.4,          // 空間密度倍率 (建議值: 1.2-1.7)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為東方Project風格多層環形坍縮彈幕
      // 優化重點: 同心圓環結構，形成星雲坍縮的視覺效果
      // 性能考量: 控制總子彈數量 < 90 個/幀 (環形多層次)
      // 平衡性: 環形對稱攻擊模式，體現星雲坍縮的幾何美感
    }, options || {});
    
    let theta = 0;
    let ringPhase = 0;
    let ringTimer = 0;
    let collapseTimer = 0;
    
    return function(e, BS) {
      try {
        ringPhase = Math.sin(theta * opts.ringRotation);
        
        // 主要環形發射 - 東方Project風格多層同心圓
        ringTimer += 16;
        if (ringTimer >= opts.ringInterval) {
          ringTimer = 0;
          
          const baseRotation = theta * opts.rotateSpeed;
          
          // 生成多層環形
          for (let layer = 0; layer < opts.ringLayers; layer++) {
            const layerOffset = (layer * TAU) / (opts.ringLayers * opts.ringCount);
            const layerScale = 0.65 + layer * 0.2;
            
            // 環形發射
            for (let ring = 0; ring < opts.ringCount; ring++) {
              const ringAngle = (ring * TAU) / opts.ringCount + baseRotation + layerOffset;
              
              // 沿環形發射子彈
              for (let bullet = 0; bullet < opts.ringBullets; bullet++) {
                const bulletProgress = bullet / opts.ringBullets;
                const gapSkip = Math.floor(bulletProgress * opts.ringBullets / (opts.ringBullets * opts.ringGap));
                if (gapSkip % 2 === 0) continue; // 留出間隙
                
                const bulletAngle = ringAngle + bulletProgress * TAU;
                const speed = opts.ringSpeed * layerScale * (1 + Math.abs(ringPhase) * 0.3);
                const vx = Math.cos(bulletAngle) * speed;
                const vy = Math.sin(bulletAngle) * speed;
                
                BS.addBullet(e.x, e.y, vx, vy, opts.ringLife, opts.ringSize, opts.ringColor);
                const ringBullet = BS.bullets[BS.bullets.length - 1];
                if (ringBullet) {
                  ringBullet.shape = 'circle';
                  ringBullet.nebulaCollapse = true;
                  ringBullet.ringLayer = layer;
                  ringBullet.ringIndex = ring;
                  
                  // 顏色漸變
                  ringBullet.color2 = opts.collapseColor;
                  ringBullet.restyleAt = opts.ringLife * (0.3 + bulletProgress * 0.4);
                  
                  // 擺動效果
                  ringBullet.oscAxis = (ring % 2 === 0) ? 'x' : 'y';
                  ringBullet.oscAmp = opts.ringOscAmp * (1 + Math.abs(ringPhase) * 0.5) * layerScale;
                  ringBullet.oscFreq = opts.ringOscFreq + (ring * 0.00025) + (layer * 0.00018);
                  ringBullet.angularVel = opts.rotateSpeed * ((ring % 2 === 0) ? 1 : -1) * layerScale;
                  
                  // 軌跡效果
                  if (bullet % 5 === 0) {
                    ringBullet.trailMax = opts.trailMax;
                    ringBullet.trailIntervalMs = opts.trailIntervalMs;
                    ringBullet.trailColor = opts.ringColor;
                    ringBullet.trailIntensity = 0.8 + bulletProgress;
                    ringBullet.ringTrail = true;
                  }
                  
                  // 發光效果
                  ringBullet.glowEffect = true;
                  ringBullet.glowSize = opts.ringSize * (2.5 + bulletProgress * 1.5);
                  ringBullet.glowColor = opts.ringColor;
                  ringBullet.glowIntensity = 0.5 + bulletProgress * 0.3;
                }
              }
            }
          }
        }
        
        // 坍縮粒子發射 - 填充環形間隙
        collapseTimer += 16;
        if (collapseTimer >= opts.collapseRate) {
          collapseTimer = 0;
          
          if (Math.random() < opts.burstProbability) {
            const collapseDirection = Math.random() * TAU;
            for (let collapse = 0; collapse < opts.collapseParticles; collapse++) {
              const collapseAngle = collapseDirection + (collapse - opts.collapseParticles/2) * 0.22;
              const speed = opts.collapseSpeed * (0.9 + Math.random() * 0.25);
              const vx = Math.cos(collapseAngle) * speed;
              const vy = Math.sin(collapseAngle) * speed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.collapseLife, opts.collapseSize, opts.collapseColor);
              const collapseBullet = BS.bullets[BS.bullets.length - 1];
              if (collapseBullet) {
                collapseBullet.shape = 'ellipse';
                collapseBullet.rx = opts.collapseSize * 1.4;
                collapseBullet.ry = opts.collapseSize * 0.9;
                collapseBullet.orientToVel = true;
                collapseBullet.nebulaCollapse = true;
                collapseBullet.isCollapseParticle = true;
                
                // 顏色漸變
                collapseBullet.color2 = opts.particleColor;
                collapseBullet.restyleAt = opts.collapseLife * 0.45;
                
                // 擺動效果
                collapseBullet.oscAxis = (collapse % 2 === 0) ? 'x' : 'y';
                collapseBullet.oscAmp = opts.collapseOscAmp * 0.6;
                collapseBullet.oscFreq = opts.collapseOscFreq * 1.1;
                
                // 發光效果
                collapseBullet.glowEffect = true;
                collapseBullet.glowSize = opts.collapseSize * 3.0;
                collapseBullet.glowColor = opts.collapseColor;
                collapseBullet.glowIntensity = 0.6;
              }
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 第9階段：CosmicDevourer（宇宙吞噬者）- 終極黑洞彈幕模式
  function cosmicDevourer(options) {
    const opts = Object.assign({
      // ===== 子彈密度調整區 =====
      patternArms: 4,            // 圖案臂數量 (建議值: 8-12)
      patternBullets: 8,          // 每臂子彈數 (建議值: 28-36)
      patternLayers: 2,            // 圖案層數 (建議值: 3-5)
      interweaveBullets: 6,       // 交織子彈數 (建議值: 14-22)
      fillDensity: 8,            // 填充密度 (建議值: 16-24)
      
      // ===== 發射頻率控制 =====
      patternInterval: 70,        // 圖案間隔毫秒 (建議值: 60-85)
      interweaveRate: 160,        // 交織間隔毫秒 (建議值: 140-190)
      fillProbability: 0.32,       // 填充概率 (建議值: 0.26-0.40)
      
      // ===== 基礎屬性 =====
      patternSpeed: 5.2,           // 圖案速度 (建議值: 4.6-5.8)
      interweaveSpeed: 4.8,       // 交織速度 (建議值: 4.2-5.4)
      fillSpeed: 3.8,             // 填充速度 (建議值: 3.4-4.4)
      patternLife: 5200,          // 圖案生命周期 (建議值: 4800-5600)
      interweaveLife: 5000,       // 交織生命周期 (建議值: 4600-5400)
      fillLife: 4800,             // 填充生命周期 (建議值: 4400-5200)
      patternSize: 18,            // 圖案大小 (建議值: 16-20)
      interweaveSize: 16,          // 交織大小 (建議值: 14-18)
      fillSize: 14,               // 填充大小 (建議值: 12-16)
      patternComplexity: 0.24,    // 圖案複雜度 (建議值: 0.20-0.30)
      interweaveIntensity: 0.22,  // 交織強度 (建議值: 0.18-0.28)
      
      // ===== 顏色配置 =====
      patternColor: '#000000',    // 圖案純黑 (主色)
      interweaveColor: '#1a1a2e', // 交織深藍 (副色)
      fillColor: '#4169E1',       // 填充藍色 (特效色)
      voidColor: '#0a0a0a',       // 虛空深黑 (背景色)
      
      // ===== 運動參數 =====
      rotateSpeed: 0.35,          // 旋轉速度 (建議值: 0.30-0.42)
      patternRotation: 0.20,      // 圖案旋轉速度 (建議值: 0.17-0.25)
      
      // ===== 擺動效果 =====
      patternOscAmp: 52,          // 圖案擺動幅度 (建議值: 46-60)
      patternOscFreq: 0.0044,     // 圖案擺動頻率 (建議值: 0.0038-0.0052)
      interweaveOscAmp: 48,       // 交織擺動幅度 (建議值: 42-56)
      interweaveOscFreq: 0.0048,  // 交織擺動頻率 (建議值: 0.0042-0.0056)
      
      // ===== 軌跡效果 =====
      trailMax: 16,               // 軌跡長度 (建議值: 14-20)
      trailIntervalMs: 18,        // 軌跡間隔毫秒 (建議值: 15-25)
      patternTrail: true,         // 圖案軌跡開關
      
      // ===== 空間密度 =====
      spaceDensity: 1.6,          // 空間密度倍率 (建議值: 1.4-1.9)
      
      // ===== 維護備註 =====
      // 維護日誌:
      // 2025-01-17: 重新設計為東方Project風格終極複雜圖案彈幕
      // 優化重點: 多層交織圖案，結合星形、螺旋、環形形成終極彈幕藝術
      // 性能考量: 控制總子彈數量 < 100 個/幀 (終極多層次)
      // 平衡性: 複雜交織攻擊模式，體現宇宙吞噬者的終極美感
    }, options || {});
    
    let theta = 0;
    let patternPhase = 0;
    let patternTimer = 0;
    let interweaveTimer = 0;
    
    return function(e, BS) {
      try {
        patternPhase = Math.sin(theta * opts.patternRotation);
        
        // 主要複雜圖案發射 - 東方Project風格終極交織彈幕
        patternTimer += 16;
        if (patternTimer >= opts.patternInterval) {
          patternTimer = 0;
          
          const baseRotation = theta * opts.rotateSpeed;
          
          // 生成多層複雜圖案
          for (let layer = 0; layer < opts.patternLayers; layer++) {
            const layerOffset = (layer * TAU) / (opts.patternLayers * opts.patternArms);
            const layerScale = 0.6 + layer * 0.18;
            
            // 複雜圖案臂發射
            for (let arm = 0; arm < opts.patternArms; arm++) {
              const armAngle = (arm * TAU) / opts.patternArms + baseRotation + layerOffset;
              
              // 沿圖案臂發射子彈 - 結合星形、螺旋、環形
              for (let bullet = 0; bullet < opts.patternBullets; bullet++) {
                const bulletProgress = bullet / opts.patternBullets;
                
                // 複雜角度計算 - 結合多種模式
                const starAngle = armAngle + bulletProgress * TAU * 0.5;
                const spiralAngle = armAngle + bulletProgress * opts.patternComplexity * TAU + patternPhase * 0.4;
                const ringAngle = armAngle + Math.floor(bulletProgress * 4) * TAU / 4;
                
                // 混合角度
                const mixedAngle = starAngle * 0.4 + spiralAngle * 0.4 + ringAngle * 0.2;
                const speed = opts.patternSpeed * layerScale * (1 + Math.abs(patternPhase) * 0.4 + bulletProgress * 0.3);
                const vx = Math.cos(mixedAngle) * speed;
                const vy = Math.sin(mixedAngle) * speed;
                
                BS.addBullet(e.x, e.y, vx, vy, opts.patternLife, opts.patternSize, opts.patternColor);
                const patternBullet = BS.bullets[BS.bullets.length - 1];
                if (patternBullet) {
                  patternBullet.shape = bulletProgress > 0.5 ? 'ellipse' : 'circle';
                  patternBullet.rx = opts.patternSize * (1.2 + bulletProgress * 0.6);
                  patternBullet.ry = opts.patternSize * (0.8 + bulletProgress * 0.3);
                  patternBullet.orientToVel = bulletProgress > 0.3;
                  patternBullet.cosmicDevourer = true;
                  patternBullet.patternLayer = layer;
                  patternBullet.patternArm = arm;
                  
                  // 顏色漸變
                  patternBullet.color2 = opts.interweaveColor;
                  patternBullet.restyleAt = opts.patternLife * (0.2 + bulletProgress * 0.5);
                  
                  // 擺動效果
                  patternBullet.oscAxis = (arm % 3 === 0) ? 'x' : ((arm % 3 === 1) ? 'y' : 'both');
                  patternBullet.oscAmp = opts.patternOscAmp * (1 + Math.abs(patternPhase) * 0.7) * layerScale;
                  patternBullet.oscFreq = opts.patternOscFreq + (arm * 0.0004) + (layer * 0.0003);
                  patternBullet.angularVel = opts.rotateSpeed * ((arm % 2 === 0) ? 1 : -1) * layerScale * 1.2;
                  
                  // 軌跡效果
                  if (bullet % 3 === 0) {
                    patternBullet.trailMax = opts.trailMax;
                    patternBullet.trailIntervalMs = opts.trailIntervalMs;
                    patternBullet.trailColor = opts.patternColor;
                    patternBullet.trailIntensity = 0.9 + bulletProgress;
                    patternBullet.patternTrail = true;
                  }
                  
                  // 發光效果
                  patternBullet.glowEffect = true;
                  patternBullet.glowSize = opts.patternSize * (2.8 + bulletProgress * 2.0);
                  patternBullet.glowColor = opts.patternColor;
                  patternBullet.glowIntensity = 0.5 + bulletProgress * 0.5;
                }
              }
            }
          }
        }
        
        // 交織子彈發射 - 填充圖案間隙
        interweaveTimer += 16;
        if (interweaveTimer >= opts.interweaveRate) {
          interweaveTimer = 0;
          
          const interweaveDirection = Math.random() * TAU;
          for (let interweave = 0; interweave < opts.interweaveBullets; interweave++) {
            const interweaveAngle = interweaveDirection + (interweave - opts.interweaveBullets/2) * 0.2;
            const speed = opts.interweaveSpeed * (0.92 + Math.random() * 0.2);
            const vx = Math.cos(interweaveAngle) * speed;
            const vy = Math.sin(interweaveAngle) * speed;
            
            BS.addBullet(e.x, e.y, vx, vy, opts.interweaveLife, opts.interweaveSize, opts.interweaveColor);
            const interweaveBullet = BS.bullets[BS.bullets.length - 1];
            if (interweaveBullet) {
              interweaveBullet.shape = 'ellipse';
              interweaveBullet.rx = opts.interweaveSize * 1.3;
              interweaveBullet.ry = opts.interweaveSize * 0.85;
              interweaveBullet.orientToVel = true;
              interweaveBullet.cosmicDevourer = true;
              interweaveBullet.isInterweave = true;
              
              // 顏色漸變
              interweaveBullet.color2 = opts.fillColor;
              interweaveBullet.restyleAt = opts.interweaveLife * 0.4;
              
              // 擺動效果
              interweaveBullet.oscAxis = (interweave % 2 === 0) ? 'x' : 'y';
              interweaveBullet.oscAmp = opts.interweaveOscAmp * 0.6;
              interweaveBullet.oscFreq = opts.interweaveOscFreq * 1.1;
              
              // 發光效果
              interweaveBullet.glowEffect = true;
              interweaveBullet.glowSize = opts.interweaveSize * 2.8;
              interweaveBullet.glowColor = opts.interweaveColor;
              interweaveBullet.glowIntensity = 0.6;
            }
          }
        }
        
        // 填充粒子發射 - 隨機填充
        if (Math.random() < opts.fillProbability) {
          const fillDirection = Math.random() * TAU;
          for (let fill = 0; fill < opts.fillDensity; fill++) {
            const fillAngle = fillDirection + (fill - opts.fillDensity/2) * 0.28;
            const speed = opts.fillSpeed * (0.88 + Math.random() * 0.3);
            const vx = Math.cos(fillAngle) * speed;
            const vy = Math.sin(fillAngle) * speed;
            
            BS.addBullet(e.x, e.y, vx, vy, opts.fillLife, opts.fillSize, opts.fillColor);
            const fillBullet = BS.bullets[BS.bullets.length - 1];
            if (fillBullet) {
              fillBullet.shape = 'circle';
              fillBullet.cosmicDevourer = true;
              fillBullet.isFillParticle = true;
              
              // 顏色漸變
              fillBullet.color2 = opts.interweaveColor;
              fillBullet.restyleAt = opts.fillLife * 0.5;
              
              // 輕微擺動
              fillBullet.oscAxis = (fill % 2 === 0) ? 'x' : 'y';
              fillBullet.oscAmp = opts.patternOscAmp * 0.35;
              fillBullet.oscFreq = opts.patternOscFreq * 1.2;
              
              // 發光效果
              fillBullet.glowEffect = true;
              fillBullet.glowSize = opts.fillSize * 2.2;
              fillBullet.glowColor = opts.fillColor;
              fillBullet.glowIntensity = 0.4;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  const BossPatterns4 = {
    spawnRing,
    // 第0階段：事件視界
    eventHorizon,
    // 第1階段：奇點脈衝
    singularityPulse,
    // 第2階段：引力波
    gravitationalWaves,
    // 第3階段：暗物質旋渦
    darkMatterSwirl,
    // 第4階段：黑洞風暴
    blackHoleStorm,
    // 第5階段：量子坍縮
    quantumCollapse,
    // 第6階段：虛空爆發
    voidEruption,
    // 第7階段：時空裂縫
    spacetimeRift,
    // 第8階段：星雲坍縮
    nebulaCollapse,
    // 第9階段：宇宙吞噬者
    cosmicDevourer,
  };

  global.ChallengeBossPatterns4 = BossPatterns4;
})(this);