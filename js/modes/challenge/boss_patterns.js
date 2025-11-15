// 挑戰模式彈幕樣式庫（僅用於挑戰模式，不污染其他模式）
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
      // gap：依角度略過若干扇區
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









  // 雙色蛇形爆裂：以不同正弦軸與色彩交錯，形成層次
  function amuletBursts(options) {
    const opts = Object.assign({
      burstCount: 12,
      baseSpeed: 2.7,
      life: 7500,
      size: 6,
      colorA: '#ff5555',
      colorB: '#aa66ff',
      oscAmpA: 22,
      oscAmpB: 28,
      oscFreqA: 0.0020,
      oscFreqB: 0.0016,
      rotateSpeed: 0.10,
    }, options || {});
    let theta = 0;
    return function (e, BS) {
      try {
        for (let i = 0; i < opts.burstCount; i++) {
          const t = i / opts.burstCount;
          const a = theta + t * TAU;
          const vx = Math.cos(a) * opts.baseSpeed;
          const vy = Math.sin(a) * opts.baseSpeed;
          const color = (i % 2 === 0) ? opts.colorA : opts.colorB;
          BS.addBullet(e.x, e.y, vx, vy, opts.life, opts.size, color);
          const b = BS.bullets[BS.bullets.length - 1];
          if (b) {
            if (i % 2 === 0) {
              b.oscAxis = 'y';
              b.oscAmp = opts.oscAmpA;
              b.oscFreq = opts.oscFreqA;
            } else {
              b.oscAxis = 'x';
              b.oscAmp = opts.oscAmpB;
              b.oscFreq = opts.oscFreqB;
            }
            b.angularVel = (Math.random() < 0.5 ? -1 : 1) * 0.05;
          }
        }
        theta += opts.rotateSpeed;
      } catch (_) { }
    };
  }

  // 節奏式多方位雷射迷宮：
  // - beatSec：每次觸發的間隔秒數
  // - beamActiveSec：雷射維持時間（之後自然淡出）
  // - rayCount：同時啟動的方向數
  // - beamSegCount/beamSegSpacing：雷射由幾節段構成與節距
  // - ringCount/ringGapCount/ringGapWidth：環形子彈與通道空隙設定
  function rhythmLaserMaze(getPlayer, options){
    const opts = Object.assign({
      beatSec: 0.5,
      beamActiveSec: 1.6,
      rayCount: 8,
      beamSegCount: 22,
      beamSegSpacing: 14,
      beamLife: 2200,
      beamSize: 5,
      beamColor: '#99bbff',
      beamWidth: 14,
      beamDamage: 24,
      ringCount: 72,
      ringSpeed: 2.6,
      ringLife: 7000,
      ringSize: 6,
      ringColor: '#ffe6aa',
      ringGapCount: 6,
      ringGapWidth: 0.22,
    }, options || {});
    return function(e, BS){
      try {
        const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const start = e._startTs || (e._startTs = nowTs);
        const tSec = (nowTs - start) / 1000;
        const beatIdx = Math.floor(tSec / opts.beatSec);
        if (e._lastBeat !== beatIdx){
          e._lastBeat = beatIdx;
          // 隨機旋轉一次角度基底，避免節奏型態過於重複
          e._beamBaseAng = (Math.random() * TAU);
          e._beamUntil = nowTs + (opts.beamActiveSec * 1000);
          // 齊射音效：每次節拍觸發一次（BOSS 同時發射多雷射但音效只播放一次）
          try { if (typeof AudioManager !== 'undefined' && AudioManager.playSound) { AudioManager.playSound('challenge_laser'); } } catch(_){}
          // 節拍瞬間：生成環形爆裂並留出通道
          spawnRing(BS, e.x, e.y, opts.ringCount, e._beamBaseAng, opts.ringSpeed, opts.ringLife, opts.ringSize, opts.ringColor, opts.ringGapCount, opts.ringGapWidth);
          // 以真正雷射呈現（全屏線段）：生命期 = beamActiveSec
          for (let k=0;k<opts.rayCount;k++){
            const ang = e._beamBaseAng + (k * TAU / opts.rayCount);
            BS.addLaser(e.x, e.y, ang, { width: opts.beamWidth, lifeMs: opts.beamActiveSec * 1000, color: opts.beamColor, damage: opts.beamDamage, followEmitter: e });
          }
        }
        // 雷射維持期間：可選擇補一些亮點（輕量化，避免噴太多）
        if (e._beamUntil && nowTs < e._beamUntil){
          // 每 tick 於中心再補少量亮點（小尺寸）以加強「發光」感
          const glowSize = Math.max(3, Math.floor(opts.beamSize * 0.8));
          for (let i=0;i<2;i++){
            BS.addBullet(e.x, e.y, 0, 0, 420, glowSize, '#eef6ff');
          }
        }
      } catch(_){ }
    };
  }

  // EclipseRosette（月蝕花陣）
  function eclipseRosette(options){
    const opts = Object.assign({
      beatSec: 0.92,
      // 三層等角環的密度與速度（整體視覺與密度以此為主）
      outerCount: 84,
      midCount: 72,
      innerCount: 56,
      outerSpeed: 2.7,
      midSpeed: 2.55,
      innerSpeed: 2.4,
      life: 7600,
      outerSize: 9,
      midSize: 8,
      innerSize: 7,
      outerColor: '#ff99cc',
      midColor: '#ffe6aa',
      innerColor: '#a8e0ff',
      rotateStepRad: 0.22, // 每拍旋轉相位（弧度），讓花紋不重複
      restyleAt: 2400,
      // 花瓣線（黃色小顆）改為可選，預設停用
      petalsCount: 0,
      petalsSpeed: 2.5,
      petalsSize: 6,
      petalsColor: '#ffd1a3',
      petalsAngularVelJitter: 0.06,
    }, options || {});
    return function(e, BS){
      try{
        const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const start = e._startTs || (e._startTs = nowTs);
        const tSec = (nowTs - start) / 1000;
        const beatIdx = Math.floor(tSec / opts.beatSec);
        if (e._lastBeat !== beatIdx){
          e._lastBeat = beatIdx;
          const phase = (e._phase || 0);
          const baseA = phase;
          // 三層環（外→中→內），相位帶少許偏移，確保角度填充平均
          spawnRing(BS, e.x, e.y, opts.outerCount, baseA, opts.outerSpeed, opts.life, opts.outerSize, opts.outerColor, 0, 0);
          spawnRing(BS, e.x, e.y, opts.midCount, baseA + 0.33, opts.midSpeed, opts.life, opts.midSize, opts.midColor, 0, 0);
          spawnRing(BS, e.x, e.y, opts.innerCount, baseA + 0.66, opts.innerSpeed, opts.life, opts.innerSize, opts.innerColor, 0, 0);
          // 層次：在新拍的前幾個 tick 補少量「花心亮點」以提升光感，但不影響密度均勻
          for(let i=0;i<3;i++){ BS.addBullet(e.x, e.y, 0, 0, 360, 4, '#ffffff'); }
          // 更新相位（持續旋轉）
          e._phase = phase + opts.rotateStepRad;
        }
        // 每 tick 「花瓣編織」（黃色較小顆）—已改為可選；你的要求是取消，預設為 0
        if (opts.petalsCount > 0){
          const petals = opts.petalsCount; const sp = opts.petalsSpeed; const size = opts.petalsSize; const color = opts.petalsColor;
          for(let i=0;i<petals;i++){
            const t = (i / petals);
            const a = (e._phase||0) + t * Math.PI * 2;
            const vx = Math.cos(a) * sp;
            const vy = Math.sin(a) * sp;
            BS.addBullet(e.x, e.y, vx, vy, 3000, size, color);
            const b = BS.bullets[BS.bullets.length - 1];
            if (b) { b.angularVel = (Math.random() * opts.petalsAngularVelJitter) - (opts.petalsAngularVelJitter/2); b.color2 = '#fff2b8'; b.restyleAt = opts.restyleAt; }
          }
        }
      } catch(_){ }
    };
  }

  // 李薩如曲線編織：發射位置沿李薩如路徑小幅擺動，並以旋轉放射角形成疊紋
  function lissajousWeave(options){
    const opts = Object.assign({
      A: 46,
      B: 32,
      freqX: 0.9,
      freqY: 1.2,
      phaseY: Math.PI/3,
      count: 16,
      baseSpeed: 2.7,
      life: 8000,
      size: 6,
      color: '#66e6ff',
      rotateSpeed: 0.09,
      restyleAt: 2600,
      restyleColor: '#ffe9a3',
    }, options || {});
    let theta = 0;
    return function(e, BS){
      try{
        e._t = (e._t || 0) + 0.016; // 約 60Hz 的時間步進（以 raf 近似）
        const ox = opts.A * Math.sin(e._t * opts.freqX);
        const oy = opts.B * Math.sin(e._t * opts.freqY + opts.phaseY);
        const sx = e.x + ox;
        const sy = e.y + oy;
        for(let i=0;i<opts.count;i++){
          const a = theta + (i/opts.count) * TAU;
          const vx = Math.cos(a) * opts.baseSpeed;
          const vy = Math.sin(a) * opts.baseSpeed;
          BS.addBullet(sx, sy, vx, vy, opts.life, opts.size, opts.color);
          const b = BS.bullets[BS.bullets.length - 1];
          if (b){
            b.color2 = opts.restyleColor; b.restyleAt = opts.restyleAt;
            // 輕微角速度與正弦偏移，讓編織更柔和
            b.angularVel = (Math.random() * 0.08) - 0.04;
            b.oscAxis = (Math.random() < 0.5 ? 'x' : 'y');
            b.oscAmp = 18; b.oscFreq = 0.0018;
          }
        }
        theta += opts.rotateSpeed;
      } catch(_){}
    };
  }

  // 櫻花風暴彈幕：結合旋轉花瓣、櫻花散落和風刃軌跡的東方風格彈幕
  // 設計靈感來自東方Project的櫻花主題符卡，具有詩意的美術表現
  function sakuraStorm(options) {
    const opts = Object.assign({
      beatSec: 0.88,
      // 櫻花花瓣層配置
      petalLayers: 3,
      petalCount: 24,
      petalSpeed: 2.6,
      petalLife: 8200,
      petalSize: 8,
      petalColor: '#ffb7c5', // 櫻花粉
      petalColor2: '#ffe4e1', // 淺粉色
      // 風刃軌跡
      windBladeCount: 12,
      windBladeSpeed: 3.2,
      windBladeLife: 6800,
      windBladeSize: 6,
      windBladeColor: '#87ceeb', // 天藍色
      windBladeColor2: '#f0f8ff', // 愛麗絲藍
      // 櫻花散落
      scatterCount: 8,
      scatterSpeed: 1.8,
      scatterLife: 5400,
      scatterSize: 5,
      scatterColor: '#ffc0cb', // 粉紅色
      // 旋轉與擺動參數
      rotateSpeed: 0.12,
      petalOscAmp: 28,
      petalOscFreq: 0.0022,
      windOscAmp: 22,
      windOscFreq: 0.0018,
      scatterOscAmp: 16,
      scatterOscFreq: 0.0026,
      // 延遲換色
      restyleAt: 2800,
      restyleColor: '#ffffff',
    }, options || {});
    
    let theta = 0;
    let phase = 0;
    
    return function(e, BS) {
      try {
        const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const start = e._startTs || (e._startTs = nowTs);
        const tSec = (nowTs - start) / 1000;
        const beatIdx = Math.floor(tSec / opts.beatSec);
        
        if (e._lastBeat !== beatIdx) {
          e._lastBeat = beatIdx;
          phase = (phase + 1) % 3; // 三種模式循環
          
          // 櫻花花瓣層：多層旋轉花瓣
          for (let layer = 0; layer < opts.petalLayers; layer++) {
            const layerOffset = (layer * Math.PI * 2) / opts.petalLayers;
            const layerSpeed = opts.petalSpeed + (layer * 0.2); // 每層速度略有不同
            const layerSize = opts.petalSize + (layer * 2); // 外層更大
            
            for (let i = 0; i < opts.petalCount; i++) {
              const t = i / opts.petalCount;
              const a = theta + layerOffset + t * Math.PI * 2;
              const vx = Math.cos(a) * layerSpeed;
              const vy = Math.sin(a) * layerSpeed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.petalLife, layerSize, opts.petalColor);
              const b = BS.bullets[BS.bullets.length - 1];
              if (b) {
                b.shape = 'ellipse';
                b.rx = layerSize + 4;
                b.ry = layerSize - 2;
                b.orientToVel = true;
                b.color2 = opts.petalColor2;
                b.restyleAt = opts.restyleAt;
                b.oscAxis = (i % 2 === 0) ? 'x' : 'y';
                b.oscAmp = opts.petalOscAmp - (layer * 4);
                b.oscFreq = opts.petalOscFreq + (layer * 0.0002);
                b.angularVel = opts.rotateSpeed * ((i % 2 === 0) ? 1 : -1);
                b.trailMax = 8;
                b.trailIntervalMs = 45;
              }
            }
          }
          
          // 風刃軌跡：藍色風刃，具有優美的曲線
          for (let i = 0; i < opts.windBladeCount; i++) {
            const t = i / opts.windBladeCount;
            const a = theta + t * Math.PI * 2 + Math.PI / 6; // 偏移30度避免重疊
            const vx = Math.cos(a) * opts.windBladeSpeed;
            const vy = Math.sin(a) * opts.windBladeSpeed;
            
            BS.addBullet(e.x, e.y, vx, vy, opts.windBladeLife, opts.windBladeSize, opts.windBladeColor);
            const b = BS.bullets[BS.bullets.length - 1];
            if (b) {
              b.shape = 'ellipse';
              b.rx = opts.windBladeSize + 8;
              b.ry = opts.windBladeSize - 1;
              b.orientToVel = true;
              b.color2 = opts.windBladeColor2;
              b.restyleAt = opts.restyleAt;
              b.oscAxis = 'y';
              b.oscAmp = opts.windOscAmp;
              b.oscFreq = opts.windOscFreq;
              b.angularVel = opts.rotateSpeed * 0.8 * ((i % 2 === 0) ? 1 : -1);
              b.trailMax = 6;
              b.trailIntervalMs = 35;
            }
          }
          
          // 櫻花散落：隨機散落的粉紅色小圓彈
          for (let i = 0; i < opts.scatterCount; i++) {
            const ang = Math.random() * Math.PI * 2;
            const speed = opts.scatterSpeed + (Math.random() * 0.8);
            const vx = Math.cos(ang) * speed;
            const vy = Math.sin(ang) * speed;
            
            BS.addBullet(e.x, e.y, vx, vy, opts.scatterLife, opts.scatterSize, opts.scatterColor);
            const b = BS.bullets[BS.bullets.length - 1];
            if (b) {
              b.shape = 'circle';
              b.color2 = opts.restyleColor;
              b.restyleAt = opts.restyleAt;
              b.oscAxis = (Math.random() < 0.5) ? 'x' : 'y';
              b.oscAmp = opts.scatterOscAmp + (Math.random() * 8);
              b.oscFreq = opts.scatterOscFreq + (Math.random() * 0.0004);
              b.angularVel = (Math.random() - 0.5) * 0.08;
              b.trailMax = 4;
              b.trailIntervalMs = 60;
            }
          }
          
          // 中心光點效果
          for (let i = 0; i < 4; i++) {
            BS.addBullet(e.x, e.y, 0, 0, 480, 3, '#ffffff');
            const b = BS.bullets[BS.bullets.length - 1];
            if (b) {
              b.color2 = '#ffeff7';
              b.restyleAt = 200;
            }
          }
          
          theta += opts.rotateSpeed;
        }
        
      } catch (_) { }
    };
  }

  function stardustKagura(options) {
    const opts = Object.assign({
      beatSec: 0.82,
      // 星塵主臂 - 進一步降低密度
      stardustArms: 2,        // 從4減到2
      stardustCount: 10,      // 從18減到10
      stardustSpeed: 2.8,
      stardustLife: 7800,
      stardustSize: 9,
      stardustColor: '#e6e6fa',
      stardustColor2: '#ffffff',
      // 神樂鈴鐺 - 降低密度
      bellCount: 6,           // 從12減到6
      bellSpeed: 3.4,
      bellLife: 6200,
      bellSize: 7,
      bellColor: '#ffd700',
      bellColor2: '#fff8dc',
      // 月環 - 大幅減少層數
      moonRingCount: 2,       // 從3減到2
      moonRingLayers: 2,      // 從5減到2
      moonRingSpeed: 2.2,
      moonRingLife: 8400,
      moonRingSize: 8,
      moonRingColor: '#87ceeb',
      moonRingColor2: '#f0f8ff',
      // 流星 - 減少數量
      meteorCount: 3,         // 從6減到3
      meteorSpeed: 4.2,
      meteorLife: 5200,
      meteorSize: 12,
      meteorColor: '#b0c4de',
      meteorColor2: '#ffffff',
      // 旋轉與擺動 - 降低強度
      rotateSpeed: 0.10,      // 從0.15減到0.10
      stardustOscAmp: 24,     // 從32減到24
      stardustOscFreq: 0.0018, // 從0.0024減到0.0018
      bellOscAmp: 20,         // 從26減到20
      bellOscFreq: 0.0014,    // 從0.0020減到0.0014
      moonOscAmp: 16,         // 保持20減到16
      moonOscFreq: 0.0010,    // 從0.0016減到0.0010
      // 延遲換色
      restyleAt: 2600,
      restyleColor: '#ffffff',
      // 軌跡特效 - 降低基礎值
      trailMax: 6,            // 從12減到6
      trailIntervalMs: 80,    // 從40增加到80
      angularVelBase: 0.05    // 從0.08減到0.05
    }, options || {});
    
    let theta = 0;
    let frameCount = 0;  // 新增：用於控制間歇性軌跡
    
    return function(e, BS) {
      try {
        const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const start = e._startTs || (e._startTs = nowTs);
        const tSec = (nowTs - start) / 1000;
        const beatIdx = Math.floor(tSec / opts.beatSec);
        
        frameCount++;  // 每幀遞增
        
        // 計算是否要有軌跡特效（每4次中1次有軌跡）
        const hasTrail = (frameCount % 4 === 0);
        
        // 星塵主臂：螺旋星塵 - 進一步優化
        for (let arm = 0; arm < opts.stardustArms; arm++) {
          const armAngle = (arm * Math.PI * 2) / opts.stardustArms;
          for (let i = 0; i < opts.stardustCount; i++) {
            const t = i / opts.stardustCount;
            const a = theta + armAngle + t * Math.PI * 2;
            const vx = Math.cos(a) * opts.stardustSpeed;
            const vy = Math.sin(a) * opts.stardustSpeed;
            
            BS.addBullet(e.x, e.y, vx, vy, opts.stardustLife, opts.stardustSize, opts.stardustColor);
            const b = BS.bullets[BS.bullets.length - 1];
            if (b) {
              b.shape = 'ellipse';
              b.rx = opts.stardustSize + 2;
              b.ry = opts.stardustSize - 1;
              b.orientToVel = true;
              b.color2 = opts.stardustColor2;
              b.restyleAt = opts.restyleAt;
              b.oscAxis = (arm % 2 === 0) ? 'x' : 'y';
              b.oscAmp = opts.stardustOscAmp;
              b.oscFreq = opts.stardustOscFreq;
              b.angularVel = opts.angularVelBase * ((arm % 2 === 0) ? 1 : -1);
              
              // 間歇性軌跡特效
              if (hasTrail) {
                b.trailMax = opts.trailMax;
                b.trailIntervalMs = opts.trailIntervalMs;
              }
            }
          }
        }
        
        // 神樂鈴鐺：金色鈴鐺彈 - 減少數量
        for (let i = 0; i < opts.bellCount; i++) {
          const t = i / opts.bellCount;
          const a = theta + t * Math.PI * 2 + Math.PI / 4;
          const vx = Math.cos(a) * opts.bellSpeed;
          const vy = Math.sin(a) * opts.bellSpeed;
          
          BS.addBullet(e.x, e.y, vx, vy, opts.bellLife, opts.bellSize, opts.bellColor);
          const b = BS.bullets[BS.bullets.length - 1];
          if (b) {
            b.shape = 'circle';
            b.color2 = opts.bellColor2;
            b.restyleAt = opts.restyleAt;
            b.oscAxis = (i % 2 === 0) ? 'x' : 'y';
            b.oscAmp = opts.bellOscAmp;
            b.oscFreq = opts.bellOscFreq;
            b.angularVel = opts.angularVelBase * 0.6 * ((i % 2 === 0) ? 1 : -1);
            
            // 間歇性軌跡（不同步）
            if ((frameCount + 1) % 4 === 0) {
              b.trailMax = 4;  // 較小的軌跡
              b.trailIntervalMs = 100;
            }
          }
        }
        
        // 月環：多層月環 - 大幅減少
        for (let ring = 0; ring < opts.moonRingCount; ring++) {
          const ringOffset = (ring * Math.PI * 2) / opts.moonRingCount;
          for (let layer = 0; layer < opts.moonRingLayers; layer++) {
            const layerSpeed = opts.moonRingSpeed + (layer * 0.3);
            const layerSize = opts.moonRingSize + (layer * 1);
            for (let i = 0; i < 8; i++) {  // 從12減到8
              const t = i / 8;
              const a = theta + ringOffset + t * Math.PI * 2;
              const vx = Math.cos(a) * layerSpeed;
              const vy = Math.sin(a) * layerSpeed;
              
              BS.addBullet(e.x, e.y, vx, vy, opts.moonRingLife, layerSize, opts.moonRingColor);
              const b = BS.bullets[BS.bullets.length - 1];
              if (b) {
                b.shape = 'ellipse';
                b.rx = layerSize + 3;
                b.ry = layerSize - 1;
                b.orientToVel = true;
                b.color2 = opts.moonRingColor2;
                b.restyleAt = opts.restyleAt;
                b.oscAxis = (layer % 2 === 0) ? 'x' : 'y';
                b.oscAmp = opts.moonOscAmp - (layer * 2);
                b.oscFreq = opts.moonOscFreq + (layer * 0.0001);
                b.angularVel = opts.angularVelBase * 0.4 * ((layer % 2 === 0) ? 1 : -1);
                
                // 偶爾的軌跡（每6次中1次）
                if ((frameCount + 2) % 6 === 0) {
                  b.trailMax = 3;
                  b.trailIntervalMs = 120;
                }
              }
            }
          }
        }
        
        // 流星：高速流星彈 - 減少數量
        for (let i = 0; i < opts.meteorCount; i++) {
          const ang = Math.random() * Math.PI * 2;
          const speed = opts.meteorSpeed + (Math.random() * 0.5);
          const vx = Math.cos(ang) * speed;
          const vy = Math.sin(ang) * speed;
          
          BS.addBullet(e.x, e.y, vx, vy, opts.meteorLife, opts.meteorSize, opts.meteorColor);
          const b = BS.bullets[BS.bullets.length - 1];
          if (b) {
            b.shape = 'ellipse';
            b.rx = opts.meteorSize + 6;
            b.ry = opts.meteorSize - 2;
            b.orientToVel = true;
            b.color2 = opts.meteorColor2;
            b.restyleAt = opts.restyleAt;
            b.angularVel = (Math.random() - 0.5) * 0.1;
            
            // 流星有較高機率有軌跡（每3次中1次）
            if ((frameCount + i) % 3 === 0) {
              b.trailMax = 8;  // 流星可以有較明顯的軌跡
              b.trailIntervalMs = 60;
            }
          }
        }
        
        // 中心光點效果 - 減少數量
        for (let i = 0; i < 3; i++) {  // 從6減到3
          BS.addBullet(e.x, e.y, 0, 0, 400, 4, '#ffffff');
          const b = BS.bullets[BS.bullets.length - 1];
          if (b) {
            b.color2 = '#ffeff7';
            b.restyleAt = 150;
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  function extremeContrastArtillery(options) {
    const opts = Object.assign({
      // 巨大球型彈幕 - 核心特色
      giantBallsCount: 10,         // 巨大球數量
      giantBallBaseSize: 50,      // 基礎大小（像素）
      giantBallSpeed: 1.2,        // 巨大球速度（較慢）
      giantBallLife: 12000,       // 較長生命週期
      
      // 多段漸層色彩系統（外→內：白→彩→黑）
      giantBallOuterColor: '#ffffff',   // 外層：白色（無碰撞）
      giantBallMidColor: '#ff4444',     // 中層：彩色（警告區）
      giantBallInnerColor: '#000000',   // 內層：黑色（核心危險）
      
      // 寬容碰撞系統參數
      giantBallSafeRadius: 0.75,  // 安全區域比例（白色外圈）
      giantBallWarnRadius: 0.85,  // 警告區域比例（彩色中圈）
      giantBallCoreRadius: 0.95,  // 核心危險比例（黑色內圈）
      
      // 精緻小彈幕 - 極端反差
      microBulletCount: 24,       // 小彈幕數量
      microBulletSize: 40,         // 體積加大到40
      microBulletSpeed: 3.8,      // 速度降到3.8
      microBulletLife: 6800,
      microBulletColor: '#ffd700', // 金色小彈幕
      microBulletColor2: '#fff8dc',
      
      // 環繞小衛星彈幕
      satelliteCount: 8,          // 衛星數量
      satelliteSize: 6,         // 衛星尺寸
      satelliteSpeed: 3.2,
      satelliteLife: 8200,
      satelliteColor: '#87ceeb', // 天藍色衛星
      satelliteColor2: '#f0f8ff',
      
      // 華麗光點裝飾
      sparkleCount: 12,         // 光點數量
      sparkleSize: 2,           // 極小光點
      sparkleLife: 3000,
      sparkleColor: '#ffffff',   // 白色光點
      
      // 藝術效果參數
      rotateSpeed: 0.08,        // 旋轉速度（較慢，營造莊嚴感）
      breatheFreq: 0.003,       // 呼吸脈動頻率
      breatheAmp: 8,            // 呼吸幅度
      
      // 軌跡特效（僅小彈幕使用，巨大球不需要）
      microTrailMax: 6,
      microTrailInterval: 50,
      satelliteTrailMax: 4,
      satelliteTrailInterval: 70,
      
      // 延遲換色效果
      restyleAt: 3200,
      restyleColor: '#ff69b4'
    }, options || {});
    
    let theta = 0;
    let breathePhase = 0;
    
    return function(e, BS) {
      try {
        // 計算呼吸脈動效果
        breathePhase += opts.breatheFreq;
        const breatheScale = 1 + Math.sin(breathePhase) * (opts.breatheAmp * 0.01);
        
        // 巨大球型彈幕 - 模仿環繞衛星彈幕的形式，低速+巨大版
        for (let i = 0; i < opts.giantBallsCount; i++) {
          const baseAngle = (i * Math.PI * 2) / opts.giantBallsCount;
          const orbitAngle = baseAngle + theta * 0.3; // 非常慢的環繞速度
          const orbitRadius = 120 + (Math.sin(breathePhase + i) * 30); // 較大的軌道半徑，會變化
          const orbitSpeed = opts.giantBallSpeed + (Math.sin(breathePhase * 0.5 + i) * 0.2); // 低速
          
          const targetX = e.x + Math.cos(orbitAngle) * orbitRadius;
          const targetY = e.y + Math.sin(orbitAngle) * orbitRadius;
          const vx = (targetX - e.x) * 0.02; // 非常溫和地朝向軌道位置（低速）
          const vy = (targetY - e.y) * 0.02;
          
          // 基礎大小加上呼吸脈動
          const currentSize = opts.giantBallBaseSize * breatheScale;
          
          BS.addBullet(e.x, e.y, vx, vy, opts.giantBallLife, currentSize, opts.giantBallOuterColor);
          const giantBall = BS.bullets[BS.bullets.length - 1];
          if (giantBall) {
            // 設定多段漸層視覺效果
            giantBall.shape = 'circle';
            giantBall.color2 = opts.giantBallMidColor;
            giantBall.color3 = opts.giantBallInnerColor;
            giantBall.restyleAt = opts.restyleAt;
            
            // 重要：設定寬容碰撞系統參數
            giantBall.collisionType = 'giantBall';  // 特殊碰撞類型
            giantBall.safeRadius = opts.giantBallSafeRadius;  // 白色外圈：安全
            giantBall.warnRadius = opts.giantBallWarnRadius;  // 彩色中圈：警告
            giantBall.coreRadius = opts.giantBallCoreRadius;  // 黑色內圈：危險
            
            // 巨大球的緩慢旋轉
            giantBall.angularVel = opts.rotateSpeed * 0.3 * ((i % 2 === 0) ? 1 : -1);
            
            // 巨大球不需要軌跡，但可以有微妙的光暈效果
            giantBall.glowEffect = true;
            giantBall.glowSize = currentSize * 0.3;
            giantBall.glowColor = opts.giantBallMidColor;
            
            // 巨大球取消雪碧圖動畫
            giantBall.spriteAnimation = {
              enabled: false
            };
          }
        }
        
        // 精緻小彈幕 - 極端反差，快速靈動
        for (let i = 0; i < opts.microBulletCount; i++) {
          const angle = theta * 2 + (i * Math.PI * 2) / opts.microBulletCount; // 更快旋轉
          const speed = opts.microBulletSpeed + (Math.random() * 0.8);
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          
          BS.addBullet(e.x, e.y, vx, vy, opts.microBulletLife, opts.microBulletSize, opts.microBulletColor);
          const microBullet = BS.bullets[BS.bullets.length - 1];
          if (microBullet) {
            microBullet.shape = 'circle';
            microBullet.color2 = opts.microBulletColor2;
            microBullet.restyleAt = opts.restyleAt;
            
            // 小彈幕的快速擺動
            microBullet.oscAxis = (i % 2 === 0) ? 'x' : 'y';
            microBullet.oscAmp = 15 + (Math.random() * 10);
            microBullet.oscFreq = 0.004 + (Math.random() * 0.002);
            microBullet.angularVel = (Math.random() - 0.5) * 0.2;
            
            // 小彈幕的精緻軌跡
            if (i % 3 === 0) { // 每3個中1個有軌跡，避免過度效能負擔
              microBullet.trailMax = opts.microTrailMax;
              microBullet.trailIntervalMs = opts.microTrailInterval;
            }
            
            // 精緻小彈幕使用雪碧圖GIF動畫
            microBullet.spriteAnimation = {
              enabled: true,
              currentFrame: Math.floor(Math.random() * 60), // 隨機起始影格
              speed: 0.4 + Math.random() * 0.3 // 隨機播放速度
            };
            
            // Debug: Log micro bullet creation with sprite animation
            console.log(`[BossPattern] Micro bullet created with sprite animation:`, {
              size: opts.microBulletSize,
              speed: opts.microBulletSpeed,
              spriteAnimation: microBullet.spriteAnimation
            });
          }
        }
        
        // 環繞衛星彈幕 - 中間尺寸，規律環繞
        for (let i = 0; i < opts.satelliteCount; i++) {
          const baseAngle = (i * Math.PI * 2) / opts.satelliteCount;
          const orbitAngle = baseAngle + theta * 1.5; // 中等速度環繞
          const orbitRadius = 60 + (Math.sin(breathePhase + i) * 20); // 軌道半徑會變化
          const orbitSpeed = 2.8 + (Math.sin(breathePhase * 0.7 + i) * 0.5);
          
          const targetX = e.x + Math.cos(orbitAngle) * orbitRadius;
          const targetY = e.y + Math.sin(orbitAngle) * orbitRadius;
          const vx = (targetX - e.x) * 0.05; // 溫和地朝向軌道位置
          const vy = (targetY - e.y) * 0.05;
          
          BS.addBullet(e.x, e.y, vx, vy, opts.satelliteLife, opts.satelliteSize, opts.satelliteColor);
          const satellite = BS.bullets[BS.bullets.length - 1];
          if (satellite) {
            satellite.shape = 'ellipse';
            satellite.rx = opts.satelliteSize + 1;
            satellite.ry = opts.satelliteSize - 1;
            satellite.orientToVel = true;
            satellite.color2 = opts.satelliteColor2;
            satellite.restyleAt = opts.restyleAt;
            
            // 衛星的穩定旋轉
            satellite.angularVel = opts.rotateSpeed * 0.8;
            
            // 衛星的溫和軌跡
            if (i % 2 === 0) { // 每2個中1個有軌跡
              satellite.trailMax = opts.satelliteTrailMax;
              satellite.trailIntervalMs = opts.satelliteTrailInterval;
            }
          }
        }
        
        // 華麗光點裝飾 - 純粹的視覺藝術
        for (let i = 0; i < opts.sparkleCount; i++) {
          if (i % 2 === 0) { // 每2幀生成一次，避免過密
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.2 + (Math.random() * 0.8);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const life = opts.sparkleLife + (Math.random() * 1000);
            
            BS.addBullet(e.x, e.y, vx, vy, life, opts.sparkleSize, opts.sparkleColor);
            const sparkle = BS.bullets[BS.bullets.length - 1];
            if (sparkle) {
              sparkle.shape = 'circle';
              sparkle.color2 = opts.sparkleColor;
              sparkle.restyleAt = life * 0.7;
              sparkle.angularVel = (Math.random() - 0.5) * 0.3;
              sparkle.glowEffect = true;
              sparkle.glowSize = opts.sparkleSize * 2;
              sparkle.glowColor = opts.sparkleColor;
            }
          }
        }
        
        theta += opts.rotateSpeed;
        
      } catch (_) { }
    };
  }

  // 立體迷宮彈幕：從左右兩側慢慢出現並交錯的彈幕
  function stereoMaze(options) {
    const opts = Object.assign({
      // 基礎參數 - 參考EclipseRosette的節奏與密度
      spawnIntervalSec: 0.92,           // 生成間隔（秒），與EclipseRosette相同
      baseSpeed: 2.4,                   // 基礎速度（較慢，參考EclipseRosette內層速度）
      life: 12000,                      // 生命周期
      size: 7,                          // 子彈大小，參考EclipseRosette內層
      color: '#9370db',                 // 中紫色，易於識別
      
      // 左右生成設置
      leftSpawnCount: 15,               // 左側同時生成數量（控制密度）
      rightSpawnCount: 15,              // 右側同時生成數量（控制密度）
      spawnYOffset: 60,                 // 生成位置的垂直偏移
      
      // 移動模式 - 創造迷宮效果
      moveCurveStrength: 0.3,           // 曲線移動強度
      directionChangeInterval: 1800,    // 方向改變間隔（毫秒）
      verticalOscillation: 0.4,         // 垂直振盪強度
      
      // 交錯效果
      staggerDelay: 200,                // 交錯延遲（毫秒）
      crossPattern: true,               // 是否啟用交叉模式
      crossAngle: Math.PI / 8,          // 交叉角度（22.5度）
      
      // 立體效果 - 多層次
      depthLayers: 2,                   // 立體層次數量（控制密度）
      depthSpeedMultiplier: 0.85,       // 深度層次速度倍率
      depthSizeMultiplier: 0.9,         // 深度層次大小倍率
      
      // 藝術效果 - 參考EclipseRosette
      restyleAt: 2400,                  // 延遲換色時間
      trailMax: 4,                      // 軌跡長度（避免效能問題）
      trailIntervalMs: 60,                // 軌跡間隔
      angularVelBase: 0.04,             // 基礎角速度
      
      // 視覺增強
      glowEffect: true,                 // 發光效果
      glowSize: 1.5,                    // 發光大小倍率
      pulseEffect: true,                // 脈動效果
      pulseFreq: 0.003,                 // 脈動頻率
      
      // 安全設計
      safeZoneWidth: 0.12,              // 安全區域寬度比例（螢幕中央）
      warningTime: 400,                 // 警告時間（毫秒）
    }, options || {});
    
    let theta = 0;
    let mazePhase = 0;
    
    return function(e, BS) {
      try {
        const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const start = e._startTs || (e._startTs = nowTs);
        const tSec = (nowTs - start) / 1000;
        const spawnIdx = Math.floor(tSec / opts.spawnIntervalSec);
        
        if (e._lastSpawn !== spawnIdx) {
          e._lastSpawn = spawnIdx;
          
          // 獲取螢幕尺寸
          const W = (BS && BS._canvas) ? BS._canvas.width : 1280;
          const H = (BS && BS._canvas) ? BS._canvas.height : 720;
          
          // 計算脈動效果
          let pulseScale = 1;
          if (opts.pulseEffect) {
            const pulsePhase = nowTs * opts.pulseFreq;
            pulseScale = 1 + Math.sin(pulsePhase) * 0.08;
          }
          
          // 生成左側彈幕
          for (let i = 0; i < opts.leftSpawnCount; i++) {
            const yOffset = (i - (opts.leftSpawnCount - 1) / 2) * opts.spawnYOffset;
            const spawnY = e.y + yOffset;
            
            // 確保在螢幕範圍內
            const clampedY = Math.max(50, Math.min(H - 50, spawnY));
            
            // 計算延遲生成時間
            const delay = i * opts.staggerDelay;
            
            setTimeout(() => {
              // 為每個深度層次生成子彈
              for (let layer = 0; layer < opts.depthLayers; layer++) {
                const layerDelay = layer * 80; // 層次之間的延遲
                
                setTimeout(() => {
                  const speed = opts.baseSpeed * Math.pow(opts.depthSpeedMultiplier, layer);
                  const size = opts.size * Math.pow(opts.depthSizeMultiplier, layer) * pulseScale;
                  
                  // 基礎方向：從左向右
                  let baseAngle = 0;
                  
                  // 根據層次調整角度，創造立體效果
                  if (opts.crossPattern) {
                    const crossOffset = (layer % 2 === 0) ? opts.crossAngle : -opts.crossAngle;
                    baseAngle += crossOffset;
                  }
                  
                  // 計算實際發射位置（從螢幕邊緣開始）
                  const spawnX = 15; // 從左邊緣
                  
                  // 生成主彈幕
                  const vx = Math.cos(baseAngle) * speed;
                  const vy = Math.sin(baseAngle) * speed + (Math.random() - 0.5) * opts.verticalOscillation;
                  
                  BS.addBullet(spawnX, clampedY, vx, vy, opts.life, size, opts.color);
                  const bullet = BS.bullets[BS.bullets.length - 1];
                  if (bullet) {
                    bullet.shape = 'ellipse';
                    bullet.rx = size + 1;
                    bullet.ry = size - 1;
                    bullet.orientToVel = true;
                    bullet.color2 = '#dda0dd'; // 淺紫色延遲換色
                    bullet.restyleAt = opts.restyleAt;
                    
                    // 設定移動行為
                    bullet.moveCurveStrength = opts.moveCurveStrength;
                    bullet.directionChangeTime = nowTs + opts.directionChangeInterval;
                    bullet.originalAngle = baseAngle;
                    bullet.layer = layer;
                    
                    // 軌跡效果（只有最外層有，避免效能問題）
                    if (layer === 0) {
                      bullet.trailMax = opts.trailMax;
                      bullet.trailIntervalMs = opts.trailIntervalMs;
                    }
                    
                    // 發光效果
                    if (opts.glowEffect) {
                      bullet.glowEffect = true;
                      bullet.glowSize = size * opts.glowSize;
                      bullet.glowColor = opts.color;
                    }
                    
                    // 角速度
                    bullet.angularVel = opts.angularVelBase * ((layer % 2 === 0) ? 1 : -1);
                  }
                  
                  // 生成警告子彈（提前顯示，但無傷害）
                  if (opts.warningTime > 0 && layer === 0) {
                    BS.addBullet(spawnX, clampedY, vx, vy, opts.warningTime, size * 0.4, '#ffffff');
                    const warningBullet = BS.bullets[BS.bullets.length - 1];
                    if (warningBullet) {
                      warningBullet.shape = 'circle';
                      warningBullet.alpha = 0.25; // 半透明
                      warningBullet.noCollision = true; // 無碰撞
                      warningBullet.isWarning = true;
                    }
                  }
                }, layerDelay);
              }
            }, delay);
          }
          
          // 生成右側彈幕（鏡像）
          for (let i = 0; i < opts.rightSpawnCount; i++) {
            const yOffset = (i - (opts.rightSpawnCount - 1) / 2) * opts.spawnYOffset;
            const spawnY = e.y + yOffset;
            
            // 確保在螢幕範圍內
            const clampedY = Math.max(50, Math.min(H - 50, spawnY));
            
            // 計算延遲生成時間（與左側交錯）
            const delay = (i + 0.5) * opts.staggerDelay; // 與左側錯開
            
            setTimeout(() => {
              // 為每個深度層次生成子彈
              for (let layer = 0; layer < opts.depthLayers; layer++) {
                const layerDelay = layer * 80; // 層次之間的延遲
                
                setTimeout(() => {
                  const speed = opts.baseSpeed * Math.pow(opts.depthSpeedMultiplier, layer);
                  const size = opts.size * Math.pow(opts.depthSizeMultiplier, layer) * pulseScale;
                  
                  // 基礎方向：從右向左
                  let baseAngle = Math.PI; // 180度，向左
                  
                  // 根據層次調整角度，創造立體效果
                  if (opts.crossPattern) {
                    const crossOffset = (layer % 2 === 0) ? -opts.crossAngle : opts.crossAngle;
                    baseAngle += crossOffset;
                  }
                  
                  // 計算實際發射位置（從螢幕右邊緣開始）
                  const spawnX = W - 15; // 從右邊緣
                  
                  // 生成主彈幕
                  const vx = Math.cos(baseAngle) * speed;
                  const vy = Math.sin(baseAngle) * speed + (Math.random() - 0.5) * opts.verticalOscillation;
                  
                  BS.addBullet(spawnX, clampedY, vx, vy, opts.life, size, opts.color);
                  const bullet = BS.bullets[BS.bullets.length - 1];
                  if (bullet) {
                    bullet.shape = 'ellipse';
                    bullet.rx = size + 1;
                    bullet.ry = size - 1;
                    bullet.orientToVel = true;
                    bullet.color2 = '#98fb98'; // 淺綠色延遲換色（與左側區分）
                    bullet.restyleAt = opts.restyleAt;
                    
                    // 設定移動行為
                    bullet.moveCurveStrength = opts.moveCurveStrength;
                    bullet.directionChangeTime = nowTs + opts.directionChangeInterval;
                    bullet.originalAngle = baseAngle;
                    bullet.layer = layer;
                    
                    // 軌跡效果
                    if (layer === 0) {
                      bullet.trailMax = opts.trailMax;
                      bullet.trailIntervalMs = opts.trailIntervalMs;
                    }
                    
                    // 發光效果
                    if (opts.glowEffect) {
                      bullet.glowEffect = true;
                      bullet.glowSize = size * opts.glowSize;
                      bullet.glowColor = opts.color;
                    }
                    
                    // 角速度（與左側相反）
                    bullet.angularVel = opts.angularVelBase * ((layer % 2 === 0) ? -1 : 1);
                  }
                  
                  // 生成警告子彈（提前顯示，但無傷害）
                  if (opts.warningTime > 0 && layer === 0) {
                    BS.addBullet(spawnX, clampedY, vx, vy, opts.warningTime, size * 0.4, '#ffffff');
                    const warningBullet = BS.bullets[BS.bullets.length - 1];
                    if (warningBullet) {
                      warningBullet.shape = 'circle';
                      warningBullet.alpha = 0.25; // 半透明
                      warningBullet.noCollision = true; // 無碰撞
                      warningBullet.isWarning = true;
                    }
                  }
                }, layerDelay);
              }
            }, delay);
          }
          
          // 更新迷宮相位
          mazePhase += 0.08;
        }
        
        // 更新現有子彈的移動行為（方向改變）
        for (let i = 0; i < BS.bullets.length; i++) {
          const bullet = BS.bullets[i];
          if (bullet && bullet.directionChangeTime && bullet.directionChangeTime <= nowTs) {
            // 更新方向改變時間
            bullet.directionChangeTime = nowTs + opts.directionChangeInterval;
            
            // 計算新的方向（添加曲線效果）
            const curveOffset = Math.sin(mazePhase + bullet.layer * 0.5) * bullet.moveCurveStrength;
            const newAngle = bullet.originalAngle + curveOffset;
            
            // 更新速度
            const currentSpeed = Math.hypot(bullet.vx, bullet.vy);
            bullet.vx = Math.cos(newAngle) * currentSpeed;
            bullet.vy = Math.sin(newAngle) * currentSpeed;
            
            // 更新原始角度（用於下次計算）
            bullet.originalAngle = newAngle;
          }
        }
        
        // 更新旋轉角度
        theta += 0.015;
        
      } catch (_) { }
    };
  }

  const BossPatterns = {
    spawnRing,
    amuletBursts,
    lissajousWeave,
    // 正式名稱與別名：RhythmLaserMaze（節奏雷射迷宮）
    rhythmLaserMaze,
    RhythmLaserMaze: rhythmLaserMaze,
    // 新：EclipseRosette（月蝕花陣）
    eclipseRosette,
    // 新：櫻花風暴彈幕
    sakuraStorm,
    // 新：星塵神樂彈幕
    stardustKagura,
    // 新：極端反差藝術彈幕（巨大球型 + 精緻小彈幕）
    extremeContrastArtillery,
    // 新：立體迷宮彈幕（左右出現交錯型）
    stereoMaze,
  };

  global.ChallengeBossPatterns = BossPatterns;
})(this);