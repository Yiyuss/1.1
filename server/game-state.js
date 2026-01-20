// 权威服务器游戏状态管理
// 这是游戏状态的唯一真实来源
// 所有游戏逻辑都在这里处理

class GameState {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = new Map(); // uid -> PlayerState
    this.enemies = []; // EnemyState[]
    this.projectiles = []; // ProjectileState[]
    this.experienceOrbs = []; // ExperienceOrbState[]
    this.chests = []; // ChestState[]
    this.obstacles = []; // ObstacleState[] - 障碍物（静态）
    this.decorations = []; // DecorationState[] - 地图装饰（静态）
    this.carHazards = []; // CarHazardState[] - 路口车辆（动态）
    this.exit = null; // { x, y, width, height } - 出口（Boss 波次後生成）
    this.wave = 1;
    this.waveStartTime = Date.now();
    this.lastEnemySpawnTime = 0;
    this.enemySpawnRate = 2000; // 初始生成间隔（毫秒）
    this.lastCarSpawnTime = 0;
    this.carSpawnInterval = 10000; // 路口车辆生成间隔（10秒）
    this.selectedMap = null; // 当前选择的地图
    this.isGameOver = false;
    this.isVictory = false;
    this.gameTime = 0;
    this.lastUpdateTime = Date.now();
    this.config = null; // CONFIG数据（从客户端同步）

    // ✅ session：用於「新一局」重置狀態，避免上一局波次/怪物殘留造成開場幾隻血超多
    this.currentSessionId = null;

    // ✅ transient：本幀命中事件（用於客戶端顯示傷害數字/爆擊標記）
    this.hitEvents = [];

    // ✅ transient：音效/提示事件（用於多人把「單機觸發」補齊，不靠本地生成/碰撞）
    // 格式：{ type: 'shoot'|'enemy_death'|'collect_exp', playerUid?, weaponType?, x?, y? }
    this.sfxEvents = [];

    // ✅ 世界大小（与客户端CONFIG一致）
    // 客户端计算方式：worldWidth = CONFIG.CANVAS_WIDTH * (CONFIG.WORLD?.GRID_X || 3)
    // 720P九宫格模式：1280 * 3 = 3840 (宽度), 720 * 3 = 2160 (高度)
    // 4K模式：如果使用4K，可能是 3840x2160 或其他值
    // 默认使用720P九宫格模式，客户端会同步实际值
    this.worldWidth = 3840; // 默认世界宽度（720P九宫格：1280 * 3）
    this.worldHeight = 2160; // 默认世界高度（720P九宫格：720 * 3）

    // ✅ MMORPG 逻辑：Boss生成跟踪
    this.minibossSpawnedForWave = false;
    this.bossSpawned = false;
    // ✅ 與單機一致：小BOSS 間隔是「從開局開始算」，不能用 0（否則會立刻刷出一隻大血怪）
    this.lastMiniBossSpawnAt = Date.now();

    // ✅ 可玩性保底（預設關閉）：只在你明確要「鏈路斷掉也能射」時才打開
    this.enableAutoFireFailsafe = false;

    // ✅ 伺服器端難度/地圖（從 client 同步；用於 TUNING 與生成規則同源）
    this.diffId = 'EASY';
    this.mapId = null;

    // ✅ 用於避免重複發放（例如：鳳梨掉落物被多次回報 award_exp）
    this._awardedExpChestIds = new Set();
  }

  // 添加玩家
  addPlayer(uid, playerData) {
    const player = {
      uid,
      x: playerData.x || (this.worldWidth / 2),
      y: playerData.y || (this.worldHeight / 2),
      health: playerData.health || 200,
      maxHealth: playerData.maxHealth || 200,
      energy: playerData.energy || 100,
      maxEnergy: playerData.maxEnergy || 100,
      level: playerData.level || 1,
      // ✅ 組隊：experience 在伺服器端用作「本場累積獲得量」（供客戶端用 delta 驅動 gainExperience）
      experience: 0,
      // ✅ 組隊設定：共享金幣（客戶端會用「delta」寫入自己的 localStorage，保留單機存檔碼不變）
      sessionCoins: 0,
      gold: playerData.gold || 0, // 向後相容（舊欄位，勿依賴）
      characterId: playerData.characterId || 'pineapple',
      nickname: playerData.nickname || '玩家',
      facing: playerData.facing || 0, // 面向角度
      vx: 0,
      vy: 0,
      isDead: false,
      weapons: playerData.weapons || [],
      // ✅ 可玩性保底：若客戶端 attack input 鏈路斷掉，伺服器仍能在多人模式提供最低限度的自動攻擊
      lastAttackAt: 0,
      lastAutoFireAt: 0
    };
    this.players.set(uid, player);
    return player;
  }

  // ✅ 新一局：重置所有「本場」狀態（不影響房間/成員存在）
  resetForNewSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return;
    if (this.currentSessionId === sessionId) return;
    this.currentSessionId = sessionId;

    this.enemies = [];
    this.projectiles = [];
    this.experienceOrbs = [];
    this.chests = [];
    this.carHazards = [];
    this.exit = null;
    this.wave = 1;
    this.waveStartTime = Date.now();
    this.lastEnemySpawnTime = 0;
    this.lastCarSpawnTime = 0;
    this.enemySpawnRate = 2000;
    this.isGameOver = false;
    this.isVictory = false;
    this.gameTime = 0;
    this.hitEvents = [];
    // ✅ 修復：避免新局一開始就刷小BOSS
    this.lastMiniBossSpawnAt = Date.now();

    // 玩家：回到安全初始狀態（保守）
    for (const p of this.players.values()) {
      if (!p) continue;
      p.isDead = false;
      p.health = p.maxHealth || 200;
      p.energy = Math.min(p.maxEnergy || 100, Math.max(0, p.energy || 0));
      p.vx = 0; p.vy = 0;
      p.lastAttackAt = 0;
      p.lastAutoFireAt = 0;
      // 注意：experience/sessionCoins 是「本場累積量」，新局要清 0
      p.experience = 0;
      p.sessionCoins = 0;
    }
  }

  _getActiveMapId() {
    return (this.mapId && typeof this.mapId === 'string')
      ? this.mapId
      : (this.selectedMap && this.selectedMap.id) ? this.selectedMap.id : 'city';
  }

  _getActiveDiffId() {
    return (this.diffId && typeof this.diffId === 'string') ? this.diffId : 'EASY';
  }

  _getTotalWaves(config) {
    return (config && config.WAVES && typeof config.WAVES.TOTAL_WAVES === 'number') ? config.WAVES.TOTAL_WAVES : 30;
  }

  _computeEnemyMaxHealth(type, enemyConfig, wave, config) {
    const tuning = (config && config.TUNING) ? config.TUNING : null;
    const mapId = this._getActiveMapId();
    const diffId = this._getActiveDiffId();
    const totalWaves = this._getTotalWaves(config);

    const isMini = (type === 'MINI_BOSS' || type === 'ELF_MINI_BOSS' || type === 'HUMAN_MINI_BOSS');
    const isBoss = (type === 'BOSS' || type === 'ELF_BOSS' || type === 'HUMAN_BOSS');

    const baseHealthCfg = enemyConfig && typeof enemyConfig.HEALTH === 'number' ? enemyConfig.HEALTH : 100;

    try {
      if (tuning && !isMini && !isBoss) {
        const enemyHealthConfig = (((tuning.ENEMY_HEALTH || {})[mapId] || {})[diffId]) || null;
        if (enemyHealthConfig) {
          const baseHealth = baseHealthCfg + (enemyHealthConfig.baseHealth || 0);
          const maxHealthWave30 = enemyHealthConfig.maxHealthWave30 || baseHealth;
          if (wave === 1) return Math.floor(baseHealth);
          if (wave >= totalWaves) {
            const wavesBeyond = wave - totalWaves;
            return Math.floor(maxHealthWave30 * Math.pow(1.3, wavesBeyond));
          }
          const progress = (wave - 1) / Math.max(1, (totalWaves - 1));
          return Math.floor(baseHealth + (maxHealthWave30 - baseHealth) * progress);
        }
      }
      if (tuning && isMini) {
        const miniBossConfig = (((tuning.MINI_BOSS || {})[mapId] || {})[diffId]) || null;
        if (miniBossConfig && miniBossConfig.startWave1 && miniBossConfig.endWave30) {
          const start = miniBossConfig.startWave1;
          const end = miniBossConfig.endWave30;
          if (wave === 1) return Math.floor(start);
          if (wave >= totalWaves) {
            const wavesBeyond = wave - totalWaves;
            return Math.floor(end * Math.pow(1.3, wavesBeyond));
          }
          const perWave = Math.pow(end / start, 1 / Math.max(1, (totalWaves - 1)));
          return Math.floor(start * Math.pow(perWave, Math.max(0, wave - 1)));
        }
      }
      if (tuning && isBoss) {
        const bossConfig = (((tuning.BOSS || {})[mapId] || {})[diffId]) || null;
        const bossWave = (config && config.WAVES && typeof config.WAVES.BOSS_WAVE === 'number') ? config.WAVES.BOSS_WAVE : 20;
        if (bossConfig && (bossConfig.wave20 || bossConfig.wave30) && wave === bossWave) {
          return Math.floor(bossConfig.wave20 || bossConfig.wave30);
        }
      }
    } catch (_) { }

    // fallback：WAVES multiplier
    try {
      const hm = (config && config.WAVES) ? config.WAVES.HEALTH_MULTIPLIER_PER_WAVE : null;
      const mul = (typeof hm === 'number') ? hm : 1.05;
      return Math.floor(baseHealthCfg * Math.pow(mul, Math.max(0, wave - 1)));
    } catch (_) { }
    return Math.floor(baseHealthCfg);
  }

  _pickEdgeSpawn(margin = 50) {
    const worldWidth = this.worldWidth || 3840;
    const worldHeight = this.worldHeight || 2160;
    const edge = Math.floor(Math.random() * 4);
    switch (edge) {
      case 0: return { x: Math.random() * worldWidth, y: -margin };
      case 1: return { x: worldWidth + margin, y: Math.random() * worldHeight };
      case 2: return { x: Math.random() * worldWidth, y: worldHeight + margin };
      default: return { x: -margin, y: Math.random() * worldHeight };
    }
  }

  _computeHit(baseDamage, inputMeta) {
    // 參考 client DamageSystem：浮動±10%，爆擊 10% 基礎 + bonus
    const fluct = 0.10;
    const rand = 1 + (Math.random() * 2 * fluct - fluct);
    let amount = Math.max(1, Math.round((baseDamage || 0) * rand));

    const allowCrit = !(inputMeta && inputMeta.allowCrit === false);
    const bonusCrit = (inputMeta && typeof inputMeta.critChanceBonusPct === 'number') ? inputMeta.critChanceBonusPct : 0;
    const overrideCrit = (inputMeta && typeof inputMeta.critChancePctOverride === 'number') ? inputMeta.critChancePctOverride : null;
    const critChance = overrideCrit != null ? overrideCrit : (0.10 + bonusCrit);
    let isCrit = false;
    if (allowCrit && Math.random() < Math.max(0, Math.min(1, critChance))) {
      isCrit = true;
      amount = Math.max(1, Math.round(amount * 1.75));
    }
    return { amount, isCrit };
  }

  // ✅ 組隊設定：共享金幣發放（每位玩家都累加相同的 sessionCoins）
  awardCoinsToAllPlayers(amount) {
    const inc = Math.max(0, Math.floor(amount || 0));
    if (!inc) return;
    for (const p of this.players.values()) {
      p.sessionCoins = (p.sessionCoins || 0) + inc;
    }
  }

  // 移除玩家
  removePlayer(uid) {
    this.players.delete(uid);
  }

  // 处理玩家输入
  handleInput(uid, input) {
    const player = this.players.get(uid);
    if (!player || player.isDead) return;

    switch (input.type) {
      case 'move':
        // 更新玩家位置（服务器权威）
        const speed = input.speed || 5;
        player.vx = input.vx || 0;
        player.vy = input.vy || 0;
        player.x += player.vx * (input.deltaTime || 16.67) / 16.67;
        player.y += player.vy * (input.deltaTime || 16.67) / 16.67;

        // ✅ 边界检查（使用实例的世界大小）
        const worldWidth = this.worldWidth || 1920;
        const worldHeight = this.worldHeight || 1080;
        player.x = Math.max(0, Math.min(worldWidth, player.x));
        player.y = Math.max(0, Math.min(worldHeight, player.y));

        // 更新面向
        if (player.vx !== 0 || player.vy !== 0) {
          player.facing = Math.atan2(player.vy, player.vx);
        }
        break;

      case 'attack':
        // 服务器创建投射物
        try { player.lastAttackAt = Date.now(); } catch (_) { }
        this.createProjectile(uid, input);
        break;

      case 'aoe_tick':
        // ✅ 服务器权威：持续效果/范围技能 tick（圆形AOE）
        this.applyAoeTick(uid, input);
        break;

      case 'use_ultimate':
        // 服务器处理大招
        this.handleUltimate(uid, input);
        break;

      case 'resurrect':
        // ✅ 服务器权威：复活（与客户端救援/复活 UI 对齐）
        // 注意：仅用于本场，且只影响组队系统。
        player.isDead = false;
        player.health = player.maxHealth || 200;
        // 复活后给一点能量，避免卡死（保持保守）
        player.energy = Math.min(player.maxEnergy || 100, Math.max(0, player.energy || 0));
        break;
    }
  }

  // ✅ 可玩性保底：多人模式下，如果一段時間收不到 attack input，自動發射基礎投射物
  // 目的：先恢復「看得到攻擊、打得死怪」的最低可玩狀態，避免卡在空玩法。
  updateAutoFire(now) {
    // 限制投射物總量，避免失控
    const MAX_SERVER_PROJECTILES = 600;
    if (this.projectiles.length > MAX_SERVER_PROJECTILES) return;

    for (const p of this.players.values()) {
      if (!p || p.isDead || p.health <= 0) continue;
      const lastAtk = p.lastAttackAt || 0;
      // 若最近有正常攻擊輸入，就不啟用保底
      if (now - lastAtk < 1500) continue;
      const lastFire = p.lastAutoFireAt || 0;
      if (now - lastFire < 350) continue; // ~3 shots/sec

      p.lastAutoFireAt = now;
      this.createProjectile(p.uid, {
        type: 'attack',
        weaponType: 'BASIC',
        x: p.x,
        y: p.y,
        angle: (typeof p.facing === 'number') ? p.facing : 0,
        damage: 10,
        speed: 8,
        size: 16,
        maxDistance: 650
      });
    }
  }

  // ✅ 通用：敌人受伤/死亡结算（保证所有伤害来源一致掉落/出出口）
  damageEnemy(enemy, amount) {
    const dmg = Math.max(0, Math.floor(amount || 0));
    if (!enemy || enemy.isDead || enemy.health <= 0 || dmg <= 0) return;
    enemy.health -= dmg;
    enemy.hitFlashTime = 150;
    if (enemy.health <= 0) {
      enemy.health = 0;
      enemy.isDead = true;
      // ✅ 單機同源：敵人死亡音效（由客戶端播放；AudioManager 自帶並發上限）
      try {
        this.sfxEvents.push({ type: 'enemy_death', x: enemy.x, y: enemy.y });
      } catch (_) { }
      this.grantEnemyRewards(enemy);
    }
  }

  grantEnemyRewards(enemy) {
    if (!enemy || enemy._rewardsGranted) return;
    enemy._rewardsGranted = true;

    // 经验球
    this.spawnExperienceOrb(enemy.x, enemy.y, enemy.experienceValue || 5);

    // 金幣共享
    let coinGain = 2;
    if (enemy.type === 'MINI_BOSS' || enemy.type === 'ELF_MINI_BOSS' || enemy.type === 'HUMAN_MINI_BOSS') coinGain = 50;
    else if (enemy.type === 'BOSS' || enemy.type === 'ELF_BOSS' || enemy.type === 'HUMAN_BOSS') coinGain = 500;
    this.awardCoinsToAllPlayers(coinGain);

    // 宝箱
    if (
      enemy.type === 'MINI_BOSS' || enemy.type === 'ELF_MINI_BOSS' || enemy.type === 'HUMAN_MINI_BOSS' ||
      enemy.type === 'BOSS' || enemy.type === 'ELF_BOSS' || enemy.type === 'HUMAN_BOSS'
    ) {
      this.addChest({
        id: `chest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        x: enemy.x,
        y: enemy.y,
        type: 'NORMAL'
      });
    }

    // Boss 波次出口
    try {
      const bossWave = (this.config && this.config.WAVES && this.config.WAVES.BOSS_WAVE) ? this.config.WAVES.BOSS_WAVE : 20;
      if (
        (enemy.type === 'BOSS' || enemy.type === 'ELF_BOSS' || enemy.type === 'HUMAN_BOSS') &&
        this.wave === bossWave
      ) {
        this.exit = {
          x: (this.worldWidth || 3840) / 2,
          y: (this.worldHeight || 2160) / 2,
          width: 300,
          height: 242
        };
      }
    } catch (_) { }
  }

  // ✅ AOE tick：圆形范围伤害（给 Aura/Orbit/Gravity/IceField 等持续效果用）
  applyAoeTick(uid, input) {
    const player = this.players.get(uid);
    if (!player || player.isDead) return;

    const x = (typeof input.x === 'number') ? input.x : player.x;
    const y = (typeof input.y === 'number') ? input.y : player.y;
    const radius = Math.max(10, Math.min(800, Math.floor(input.radius || 120)));
    const damage = Math.max(0, Math.floor(input.damage || 0));
    if (!damage) return;

    const r2 = radius * radius;
    for (const enemy of this.enemies) {
      if (!enemy || enemy.isDead || enemy.health <= 0) continue;
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      if ((dx * dx + dy * dy) <= r2) {
        // ✅ 與單機一致：AOE 也套用浮動/爆擊（並回傳命中事件供前端顯示）
        const hit = this._computeHit(damage, input);
        this.damageEnemy(enemy, hit.amount);
        try {
          this.hitEvents.push({
            enemyId: enemy.id,
            x: enemy.x,
            y: enemy.y,
            h: enemy.size || 32,
            damage: hit.amount,
            isCrit: hit.isCrit
          });
        } catch (_) { }
      }
    }
  }

  // 创建投射物（服务器权威）
  createProjectile(uid, input) {
    const player = this.players.get(uid);
    if (!player) return;

    // ✅ 参数验证和边界检查
    const worldWidth = this.worldWidth || 1920;
    const worldHeight = this.worldHeight || 1080;

    // 验证位置（必须在世界范围内）
    let x = typeof input.x === 'number' ? input.x : player.x;
    let y = typeof input.y === 'number' ? input.y : player.y;
    x = Math.max(0, Math.min(worldWidth, x));
    y = Math.max(0, Math.min(worldHeight, y));

    // 验证伤害（必须为正数）
    const damage = (typeof input.damage === 'number' && input.damage > 0) ? input.damage : 10;

    // 验证速度（必须为正数）
    const speed = (typeof input.speed === 'number' && input.speed > 0) ? input.speed : 5;

    // 验证大小（必须为正数）
    const size = (typeof input.size === 'number' && input.size > 0) ? input.size : 20;

    // 验证最大飞行距离（必须为正数）
    const maxDistance = (typeof input.maxDistance === 'number' && input.maxDistance > 0) ? input.maxDistance : 1000;

    const projectile = {
      id: `projectile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      playerUid: uid,
      x: x,
      y: y,
      angle: typeof input.angle === 'number' ? input.angle : player.facing,
      weaponType: typeof input.weaponType === 'string' ? input.weaponType : 'DAGGER',
      // ✅ damage：視為 baseDamage，伺服器命中時會套用浮動/爆擊（與單機一致）
      damage: damage,
      speed: speed,
      size: size,
      homing: input.homing === true,
      turnRatePerSec: (typeof input.turnRatePerSec === 'number' && input.turnRatePerSec >= 0) ? input.turnRatePerSec : 0,
      assignedTargetId: typeof input.assignedTargetId === 'string' ? input.assignedTargetId : null,
      // meta：供命中計算
      allowCrit: input.allowCrit !== false,
      critChanceBonusPct: (typeof input.critChanceBonusPct === 'number') ? input.critChanceBonusPct : 0,
      critChancePctOverride: (typeof input.critChancePctOverride === 'number') ? input.critChancePctOverride : null,
      maxDistance: maxDistance,
      distance: 0, // 已飞行距离
      createdAt: Date.now()
    };

    this.projectiles.push(projectile);

    // ✅ 單機同源：射擊音效（只讓射擊者本地播放，避免全員一起播）
    try {
      this.sfxEvents.push({
        type: 'shoot',
        playerUid: uid,
        weaponType: projectile.weaponType
      });
    } catch (_) { }
    return projectile;
  }

  // 处理大招
  handleUltimate(uid, input) {
    const player = this.players.get(uid);
    if (!player || player.isDead) return;

    // ✅ 服务器权威：鳳梨不咬舌（pineapple）的大招改由伺服器生成掉落物（PINEAPPLE chest）
    // 目的：避免客戶端事件/本地生成與 state.chests 權威打架，並確保所有端看到一致的掉落物。
    try {
      if (player.characterId === 'pineapple') {
        // 能量門檻：需滿能量；成功施放後歸零
        if (player.energy < (player.maxEnergy || 100)) return;
        player.energy = 0;

        const count = 5;
        const minD = 200;
        const maxD = 800;
        const flyDurationMs = 600;
        const worldW = this.worldWidth || 3840;
        const worldH = this.worldHeight || 2160;
        const spawnX = player.x;
        const spawnY = player.y;

        for (let i = 0; i < count; i++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = minD + Math.random() * (maxD - minD);
          let tx = spawnX + Math.cos(ang) * dist;
          let ty = spawnY + Math.sin(ang) * dist;
          // A45(53x100) 邊界裁切
          const halfW = 53 / 2;
          const halfH = 100 / 2;
          tx = Math.max(halfW, Math.min(worldW - halfW, tx));
          ty = Math.max(halfH, Math.min(worldH - halfH, ty));

          this.addChest({
            id: `pine_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            x: tx,
            y: ty,
            type: 'PINEAPPLE',
            // 給客戶端做飛行動畫
            spawnX,
            spawnY,
            flyDurationMs
          });
        }
        return;
      }
    } catch (_) { }
  }

  // ✅ 共享經驗：用於鳳梨掉落物等特殊獎勵（由客戶端回報 amount，伺服器轉為權威 counter）
  awardExperienceToAllPlayers(amount, chestId = null) {
    const inc = Math.max(0, Math.floor(amount || 0));
    if (!inc) return;
    if (chestId) {
      if (this._awardedExpChestIds.has(chestId)) return;
      this._awardedExpChestIds.add(chestId);
    }
    for (const p of this.players.values()) {
      p.experience = (p.experience || 0) + inc;
    }
  }

  // 更新游戏状态（服务器每帧调用）
  update(deltaTime) {
    const now = Date.now();
    this.gameTime += deltaTime;

    // 更新玩家状态
    this.updatePlayers(deltaTime);

    // 更新投射物
    this.updateProjectiles(deltaTime);

    // 更新敌人
    this.updateEnemies(deltaTime);

    // ✅ 可玩性保底：自動攻擊（預設關閉，避免出現「單機沒有的白色球」）
    // 若要啟用：把 this.enableAutoFireFailsafe 設為 true（只建議 Debug）
    try { if (this.enableAutoFireFailsafe) this.updateAutoFire(now); } catch (_) { }

    // ✅ 服务器权威：经验球收集检测
    this.updateExperienceOrbs(deltaTime);

    // ✅ 服务器权威：宝箱超时自动清除
    this.updateChests(deltaTime);

    // ✅ 服务器权威：更新路口车辆
    this.updateCarHazards(deltaTime);

    // ✅ 服务器权威：出口触碰判定（任何玩家碰到出口即胜利）
    try {
      if (this.exit && !this.isVictory && !this.isGameOver) {
        const ex = this.exit.x;
        const ey = this.exit.y;
        const halfW = (this.exit.width || 0) / 2;
        const halfH = (this.exit.height || 0) / 2;
        for (const p of this.players.values()) {
          if (!p || p.isDead || p.health <= 0) continue;
          const px = p.x, py = p.y;
          const closestX = Math.max(ex - halfW, Math.min(px, ex + halfW));
          const closestY = Math.max(ey - halfH, Math.min(py, ey + halfH));
          const dx = px - closestX;
          const dy = py - closestY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 16) { // 玩家半徑約 16
            this.isVictory = true;
            break;
          }
        }
      }
    } catch (_) { }

    // 生成敌人（服务器权威）
    // ✅ 修復：沒有收到 CONFIG 前不要生成（避免血量/規則不同源，造成「一開始幾隻怪血超多/很怪」）
    if (this.config) this.spawnEnemies(now, this.config);

    // ✅ 服务器权威：生成路口车辆（仅路口地图，仅多人模式）
    // 注意：服务器端只在多人模式下生成车辆，单机模式由客户端生成
    if (this.selectedMap && this.selectedMap.id === 'intersection' && this.players.size > 0) {
      this.spawnCarHazards(now);
    }

    // ✅ 與單機一致：第 1 波固定生成一隻小BOSS；之後每波開始都會生成一隻
    // 單機依據：js/wave.js init() 與 nextWave() 都會呼叫 spawnMiniBoss()
    try {
      if (this.config && this.wave === 1 && this.minibossSpawnedForWave === false) {
        this.spawnMiniBoss(this.config);
        this.minibossSpawnedForWave = true;
      }
    } catch (_) { }

    // ✅ 服务器权威：生成大BOSS (第20波)
    if (this.wave === 20 && !this.bossSpawned && this.config) {
      this.spawnBoss(this.config);
      this.bossSpawned = true;
    }

    // 更新波次（同樣需要 CONFIG 才同源）
    if (this.config) this.updateWave(now);

    // 检查游戏结束条件
    this.checkGameOver();
  }

  // 更新玩家状态
  updatePlayers(deltaTime) {
    for (const player of this.players.values()) {
      // 能量恢复
      if (player.energy < player.maxEnergy) {
        player.energy = Math.min(player.maxEnergy, player.energy + 1 * (deltaTime / 1000));
      }
    }
  }

  // 更新投射物
  updateProjectiles(deltaTime) {
    const deltaMul = deltaTime / 16.67;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];

      // ✅ 服务器权威：追踪目标逻辑（homing）
      if (proj.homing && this.enemies.length > 0) {
        let target = null;

        // 优先追踪分配的目标
        if (proj.assignedTargetId) {
          target = this.enemies.find(e => e.id === proj.assignedTargetId && !e.isDead && e.health > 0);
        }

        // 若分配目标不存在，寻找最近敌人
        if (!target) {
          let minDist = Infinity;
          for (const enemy of this.enemies) {
            if (enemy.isDead || enemy.health <= 0) continue;
            const dx = enemy.x - proj.x;
            const dy = enemy.y - proj.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
              minDist = dist;
              target = enemy;
            }
          }
        }

        // 更新投射物角度（追踪目标）
        if (target) {
          const desiredAngle = Math.atan2(target.y - proj.y, target.x - proj.x);
          let delta = desiredAngle - proj.angle;

          // 规范化角度差到 [-π, π]
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;

          // 限制每帧最大转向量
          const maxTurn = (proj.turnRatePerSec || 0) * (deltaTime / 1000);
          if (delta > maxTurn) delta = maxTurn;
          if (delta < -maxTurn) delta = -maxTurn;

          proj.angle += delta;
        }
      }

      // 移动投射物
      proj.x += Math.cos(proj.angle) * proj.speed * deltaMul;
      proj.y += Math.sin(proj.angle) * proj.speed * deltaMul;

      // 初始化投射物距离（如果不存在）
      if (proj.distance === undefined) {
        proj.distance = 0;
      }
      if (proj.maxDistance === undefined) {
        proj.maxDistance = 1000; // 默认最大飞行距离
      }

      // 计算已飞行距离
      const dx = Math.cos(proj.angle) * proj.speed * deltaMul;
      const dy = Math.sin(proj.angle) * proj.speed * deltaMul;
      proj.distance += Math.sqrt(dx * dx + dy * dy);

      // 检查最大飞行距离
      if (proj.distance >= proj.maxDistance) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // ✅ 检查边界（使用实例的世界大小）
      const worldWidth = this.worldWidth || 1920;
      const worldHeight = this.worldHeight || 1080;
      const margin = 100; // 允许投射物稍微超出边界
      if (proj.x < -margin || proj.x > worldWidth + margin || proj.y < -margin || proj.y > worldHeight + margin) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // ✅ 服务器权威：检查与障碍物碰撞
      // 注意：障碍物是静态的，存储在 this.obstacles 中
      let hitObstacle = false;
      for (const obstacle of this.obstacles) {
        const obsX = obstacle.x;
        const obsY = obstacle.y;
        const obsW = obstacle.width || obstacle.size || 150;
        const obsH = obstacle.height || obstacle.size || 150;
        const projRadius = (proj.size || 20) / 2;

        // 圆形与矩形碰撞检测
        const rectX = obsX - obsW / 2;
        const rectY = obsY - obsH / 2;
        const closestX = Math.max(rectX, Math.min(proj.x, rectX + obsW));
        const closestY = Math.max(rectY, Math.min(proj.y, rectY + obsH));
        const dx = proj.x - closestX;
        const dy = proj.y - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < projRadius) {
          hitObstacle = true;
          break;
        }
      }

      if (hitObstacle) {
        // 投射物与障碍物碰撞，移除投射物
        this.projectiles.splice(i, 1);
        continue;
      }

      // 检查与敌人碰撞（服务器权威计算伤害）
      for (const enemy of this.enemies) {
        if (enemy.health <= 0 || enemy.isDead) continue;

        const dx = proj.x - enemy.x;
        const dy = proj.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const collisionRadius = (proj.size || 20) / 2 + (enemy.size || 32) / 2;

        if (dist < collisionRadius) {
          // ✅ 服务器计算伤害（浮動/爆擊）+ 统一结算（掉落/出出口）
          const hit = this._computeHit(proj.damage, proj);
          this.damageEnemy(enemy, hit.amount);
          try {
            this.hitEvents.push({
              enemyId: enemy.id,
              x: enemy.x,
              y: enemy.y,
              h: enemy.size || 32,
              damage: hit.amount,
              isCrit: hit.isCrit
            });
          } catch (_) { }

          // 移除投射物（当前不支持穿透，碰撞后立即移除）
          // TODO: 如果需要支持穿透，可以添加 pierce 属性
          this.projectiles.splice(i, 1);
          break;
        }
      }
    }
  }

  // 更新敌人
  updateEnemies(deltaTime) {
    const now = Date.now();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      // ✅ MMORPG 架構：更新敵人死亡動畫狀態
      if (enemy.isDying) {
        const deltaMul = deltaTime / 16.67;
        const deathDuration = enemy.deathDuration || 300; // 默认300ms
        enemy.deathElapsed = (enemy.deathElapsed || 0) + deltaTime;
        enemy.deathElapsed = Math.min(deathDuration, enemy.deathElapsed);
        enemy.x += (enemy.deathVelX || 0) * deltaMul;
        enemy.y += (enemy.deathVelY || 0) * deltaMul;

        // 死亡動畫完成後移除
        if (enemy.deathElapsed >= deathDuration) {
          this.enemies.splice(i, 1);
          continue;
        }
      }

      if (enemy.isDead || enemy.health <= 0) {
        // 如果敵人死亡但還沒有開始死亡動畫，觸發死亡動畫
        if (!enemy.isDying) {
          // 找到最近的玩家作為後退方向
          let nearestPlayer = null;
          let nearestDist = Infinity;
          for (const player of this.players.values()) {
            if (player.isDead || player.health <= 0) continue;
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestPlayer = player;
            }
          }

          if (nearestPlayer) {
            const angle = Math.atan2(nearestPlayer.y - enemy.y, nearestPlayer.x - enemy.x);
            const pushDist = 20;
            const frames = 300 / 16.67; // 300ms死亡動畫
            const pushSpeed = pushDist / frames;
            enemy.deathVelX = -Math.cos(angle) * pushSpeed;
            enemy.deathVelY = -Math.sin(angle) * pushSpeed;
          }

          enemy.isDying = true;
          enemy.deathElapsed = 0;
          enemy.deathDuration = 300;
          enemy.collisionRadius = 0;
        }
        // 不立即移除，等待死亡動畫完成
        continue;
      }

      // ✅ MMORPG 架構：更新敵人受傷紅閃狀態
      if (enemy.hitFlashTime && enemy.hitFlashTime > 0) {
        enemy.hitFlashTime = Math.max(0, enemy.hitFlashTime - deltaTime);
      }

      // 初始化敌人攻击冷却
      if (!enemy.lastAttackTime) {
        enemy.lastAttackTime = 0;
      }
      if (!enemy.attackCooldown) {
        enemy.attackCooldown = 1000; // 默认1秒攻击冷却
      }
      if (!enemy.damage) {
        enemy.damage = 10; // 默认伤害
      }

      // 敌人AI（服务器运行）
      // 找到最近的玩家
      let nearestPlayer = null;
      let nearestDist = Infinity;
      for (const player of this.players.values()) {
        if (player.isDead || player.health <= 0) continue;
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestPlayer = player;
        }
      }

      // 敌人移动（服务器权威）
      if (nearestPlayer) {
        const angle = Math.atan2(nearestPlayer.y - enemy.y, nearestPlayer.x - enemy.x);
        const speed = enemy.speed || 2;
        enemy.x += Math.cos(angle) * speed * (deltaTime / 16.67);
        enemy.y += Math.sin(angle) * speed * (deltaTime / 16.67);

        // ✅ 敌人边界检查（防止敌人移动到世界外）
        const worldWidth = this.worldWidth || 1920;
        const worldHeight = this.worldHeight || 1080;
        const margin = 100; // 允许敌人稍微超出边界（用于生成和移动）
        enemy.x = Math.max(-margin, Math.min(worldWidth + margin, enemy.x));
        enemy.y = Math.max(-margin, Math.min(worldHeight + margin, enemy.y));

        // ✅ 服务器权威：敌人攻击玩家（碰撞检测和伤害计算）
        const enemySize = enemy.size || 32;
        const playerSize = 32; // 默认玩家大小
        const collisionRadius = (enemySize / 2) + (playerSize / 2);

        if (nearestDist < collisionRadius) {
          // 检查攻击冷却
          if (now - enemy.lastAttackTime >= enemy.attackCooldown) {
            // 服务器计算伤害
            nearestPlayer.health = Math.max(0, nearestPlayer.health - enemy.damage);
            enemy.lastAttackTime = now;

            // 检查玩家是否死亡
            if (nearestPlayer.health <= 0) {
              nearestPlayer.health = 0;
              nearestPlayer.isDead = true;
            }
          }
        }
      }
    }
  }

  // 生成敌人（服务器权威）
  // 注意：服务器端需要CONFIG数据，但Node.js无法直接访问客户端CONFIG
  // 解决方案：将CONFIG数据作为参数传入，或从客户端同步
  spawnEnemies(now, config = null) {
    if (now - this.lastEnemySpawnTime < this.enemySpawnRate) return;

    this.lastEnemySpawnTime = now;

    // 如果没有CONFIG，使用简化逻辑
    if (!config || !config.WAVES || !config.ENEMIES) {
      // 简化版：每波生成固定数量的敌人
      const enemyCount = Math.min(5, 20 - this.enemies.length);

      for (let i = 0; i < enemyCount; i++) {
        const edge = Math.floor(Math.random() * 4);
        let x, y;
        switch (edge) {
          case 0: x = Math.random() * 1920; y = -50; break;
          case 1: x = 1970; y = Math.random() * 1080; break;
          case 2: x = Math.random() * 1920; y = 1130; break;
          case 3: x = -50; y = Math.random() * 1080; break;
        }

        this.enemies.push({
          id: `enemy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          x, y,
          type: 'ZOMBIE',
          health: 100,
          maxHealth: 100,
          speed: 2,
          size: 32,
          isDead: false
        });
      }
      return;
    }

    // 完整版：使用CONFIG数据（需要从客户端同步CONFIG）
    const maxEnemies = (config.OPTIMIZATION && config.OPTIMIZATION.MAX_ENEMIES) || 100;
    if (this.enemies.length >= maxEnemies) return;

    // 获取可用的敌人类型
    const availableTypes = (config.WAVES.ENEMY_TYPES || [])
      .filter(entry => entry.WAVE <= this.wave)
      .map(entry => entry.TYPE);

    if (availableTypes.length === 0) return;

    // 计算生成数量
    const sc = (config.WAVES && config.WAVES.SPAWN_COUNT) ? config.WAVES.SPAWN_COUNT : {};
    const base = sc.INITIAL || 3;
    const inc = (this.wave >= 5 && typeof sc.INCREASE_PER_WAVE_LATE === 'number') ? sc.INCREASE_PER_WAVE_LATE : (sc.INCREASE_PER_WAVE || 0.9);
    const max = (this.wave >= 5 && typeof sc.MAXIMUM_LATE === 'number') ? sc.MAXIMUM_LATE : (sc.MAXIMUM || 12);
    const countBase = Math.min(Math.floor(base + (this.wave - 1) * inc), max);
    const count = Math.max(1, countBase);

    for (let i = 0; i < count && this.enemies.length < maxEnemies; i++) {
      // 随机选择敌人类型
      const enemyType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
      const enemyConfig = config.ENEMIES[enemyType] || { SIZE: 32, HEALTH: 100, SPEED: 2 };

      // ✅ 在世界边缘生成（使用实例的世界大小）
      const worldWidth = this.worldWidth || 1920;
      const worldHeight = this.worldHeight || 1080;
      const edge = Math.floor(Math.random() * 4);
      let x, y;
      switch (edge) {
        case 0: x = Math.random() * worldWidth; y = -50; break;
        case 1: x = worldWidth + 50; y = Math.random() * worldHeight; break;
        case 2: x = Math.random() * worldWidth; y = worldHeight + 50; break;
        case 3: x = -50; y = Math.random() * worldHeight; break;
      }

      // ✅ 血量同源：優先用 TUNING（與單機一致），否則回退 WAVES multiplier
      const health = this._computeEnemyMaxHealth(enemyType, enemyConfig, this.wave, config);

      this.enemies.push({
        id: `enemy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        x, y,
        type: enemyType,
        health: health,
        maxHealth: health,
        speed: enemyConfig.SPEED || 2,
        size: enemyConfig.SIZE || 32,
        experienceValue: enemyConfig.EXPERIENCE || 5,
        isDead: false
      });
    }
  }

  // 生成经验球
  spawnExperienceOrb(x, y, value) {
    const orb = {
      id: `orb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      x,
      y,
      value: value || 5,
      size: 20
    };
    this.experienceOrbs.push(orb);
  }

  // ✅ 服务器权威：生成小Boss
  spawnMiniBoss(config) {
    if (!config || !config.ENEMIES) return;

    const wave = this.wave;
    let type = 'MINI_BOSS';

    // 根据地图选择 Boss 类型 (参考 WaveSystem)
    if (this.selectedMap) {
      if (this.selectedMap.id === 'forest') type = 'MINI_BOSS'; // 森林沿用
      else if (this.selectedMap.id === 'garden') type = 'ELF_MINI_BOSS';
      else if (this.selectedMap.id === 'intersection') type = 'HUMAN_MINI_BOSS';
      // 其他地图逻辑...
    }

    const enemyConfig = config.ENEMIES[type] || config.ENEMIES['MINI_BOSS'];
    if (!enemyConfig) return;

    // ✅ 與單機一致：從世界邊緣生成
    const spawn = this._pickEdgeSpawn(80);
    const x = spawn.x;
    const y = spawn.y;

    // ✅ 血量同源（TUNING.MINI_BOSS）
    const health = this._computeEnemyMaxHealth(type, enemyConfig, wave, config);

    this.enemies.push({
      id: `boss_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      x, y,
      type: type,
      health: health,
      maxHealth: health,
      speed: enemyConfig.SPEED || 3,
      size: enemyConfig.SIZE || 64,
      experienceValue: enemyConfig.EXPERIENCE || 5,
      isDead: false,
      damage: 20
    });
    console.log(`[GameState] 生成小BOSS: ${type} (Wave ${wave})`);
  }

  // ✅ 服务器权威：生成大Boss
  spawnBoss(config) {
    if (!config || !config.ENEMIES) return;

    let type = 'BOSS';
    if (this.selectedMap) {
      if (this.selectedMap.id === 'garden') type = 'ELF_BOSS';
      else if (this.selectedMap.id === 'intersection') type = 'HUMAN_BOSS';
    }

    const enemyConfig = config.ENEMIES[type] || config.ENEMIES['BOSS'];
    if (!enemyConfig) return;

    const spawn = this._pickEdgeSpawn(120);
    const worldWidth = this.worldWidth || 3840;
    const worldHeight = this.worldHeight || 2160;

    const health = this._computeEnemyMaxHealth(type, enemyConfig, this.wave, config);

    this.enemies.push({
      id: `final_boss_${Date.now()}`,
      x: spawn.x,
      y: spawn.y,
      type: type,
      health: health,
      maxHealth: health,
      speed: enemyConfig.SPEED || 4,
      size: enemyConfig.SIZE || 128,
      experienceValue: enemyConfig.EXPERIENCE || 5,
      isDead: false,
      damage: 50
    });
    console.log(`[GameState] 生成大BOSS: ${type}`);
  }

  // ✅ 服务器权威：更新经验球（检测玩家收集）
  updateExperienceOrbs(deltaTime) {
    const deltaMul = (deltaTime || 16.67) / 16.67;
    const attractRange = 220; // 與單機體感接近：靠近後會被吸過來
    const attractSpeed = 7.5; // 像素/16.67ms
    for (let i = this.experienceOrbs.length - 1; i >= 0; i--) {
      const orb = this.experienceOrbs[i];

      // ✅ 伺服器權威吸附：朝最近的活著玩家靠近（恢復「經驗可吸」）
      try {
        let nearest = null;
        let nearestDist = Infinity;
        for (const p of this.players.values()) {
          if (!p || p.isDead || p.health <= 0) continue;
          const dx = p.x - orb.x;
          const dy = p.y - orb.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = p;
          }
        }
        if (nearest && nearestDist < attractRange && nearestDist > 0.0001) {
          const dx = nearest.x - orb.x;
          const dy = nearest.y - orb.y;
          const inv = 1 / nearestDist;
          orb.x += dx * inv * attractSpeed * deltaMul;
          orb.y += dy * inv * attractSpeed * deltaMul;
        }
      } catch (_) { }

      // 检查是否被任何玩家收集
      for (const player of this.players.values()) {
        if (player.isDead) continue;

        const dx = player.x - orb.x;
        const dy = player.y - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const collisionRadius = (orb.size || 20) / 2 + 16; // 玩家半径约16

        if (dist < collisionRadius) {
          // ✅ 單機同源：撿到經驗音效（只讓撿到的人播放；多人仍共享經驗數值）
          try {
            this.sfxEvents.push({ type: 'collect_exp', playerUid: player.uid, x: orb.x, y: orb.y });
          } catch (_) { }
          // ✅ 经验共享（服务器权威）：移除经验球，并把经验值发给所有玩家
          const value = Math.max(0, Math.floor(orb.value || 0));
          if (value > 0) {
            for (const p of this.players.values()) {
              p.experience = (p.experience || 0) + value;
            }
          }
          // 移除经验球（只移除一次）
          this.experienceOrbs.splice(i, 1);
          break;
        }
      }
    }
  }

  // ✅ 服务器权威：添加宝箱（由主机通知）
  addChest(chestData) {
    if (!chestData || !chestData.id) return;

    // 检查是否已存在
    if (this.chests.some(c => c.id === chestData.id)) return;

    this.chests.push({
      id: chestData.id,
      x: chestData.x,
      y: chestData.y,
      type: chestData.type || 'NORMAL', // NORMAL, PINEAPPLE
      createdAt: Date.now(),
      ttl: 60000 // 1分钟后过期
    });
    console.log(`[GameState] 添加宝箱: ${chestData.id}`);
  }

  // ✅ 服务器权威：尝试收集宝箱
  collectChest(uid, chestId) {
    const chestIndex = this.chests.findIndex(c => c.id === chestId);
    if (chestIndex === -1) {
      // 宝箱不存在或已被收集
      return false;
    }

    // 移除宝箱
    this.chests.splice(chestIndex, 1);
    console.log(`[GameState] 宝箱被收集: ${chestId} by ${uid}`);
    return true;
  }

  // ✅ 服务器权威：更新宝箱（超时清除）
  updateChests(deltaTime) {
    const now = Date.now();
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const chest = this.chests[i];
      if (now - chest.createdAt > chest.ttl) {
        this.chests.splice(i, 1);
      }
    }
  }

  // 更新波次
  updateWave(now) {
    const waveElapsed = now - this.waveStartTime;
    // ✅ 與單機一致：使用 CONFIG.WAVES.DURATION（缺省 60s）
    const waveDuration = (this.config && this.config.WAVES && typeof this.config.WAVES.DURATION === 'number')
      ? this.config.WAVES.DURATION
      : 60000; // 60秒一波

    if (waveElapsed >= waveDuration) {
      this.wave++;
      this.waveStartTime = now;

      // ✅ 與單機一致：用 CONFIG.WAVES.ENEMY_SPAWN_RATE（初始/每波遞減/最小值）
      try {
        const rateCfg = (this.config && this.config.WAVES && this.config.WAVES.ENEMY_SPAWN_RATE) ? this.config.WAVES.ENEMY_SPAWN_RATE : null;
        const initial = rateCfg && typeof rateCfg.INITIAL === 'number' ? rateCfg.INITIAL : 2000;
        const dec = rateCfg && typeof rateCfg.DECREASE_PER_WAVE === 'number' ? rateCfg.DECREASE_PER_WAVE : 100;
        const min = rateCfg && typeof rateCfg.MINIMUM === 'number' ? rateCfg.MINIMUM : 300;
        this.enemySpawnRate = Math.max(min, initial - (this.wave - 1) * dec);
      } catch (_) { }

      // ✅ 與單機一致：每一波固定生成一隻小BOSS（由 nextWave 觸發）
      this.minibossSpawnedForWave = false;
      try {
        if (this.config) {
          this.spawnMiniBoss(this.config);
          this.minibossSpawnedForWave = true;
        }
      } catch (_) { }
    }
  }

  // 检查游戏结束
  checkGameOver() {
    // 检查所有玩家是否死亡
    let allDead = true;
    for (const player of this.players.values()) {
      if (!player.isDead && player.health > 0) {
        allDead = false;
        break;
      }
    }

    if (allDead && this.players.size > 0) {
      this.isGameOver = true;
    }
  }

  // 设置障碍物（从客户端同步）
  setObstacles(obstacles) {
    this.obstacles = obstacles.map(obs => ({
      x: obs.x,
      y: obs.y,
      imageKey: obs.imageKey,
      size: obs.size || 150,
      width: obs.size || 150,
      height: obs.size || 150
    }));
  }

  // 设置地图装饰（从客户端同步）
  setDecorations(decorations) {
    this.decorations = decorations.map(deco => ({
      x: deco.x,
      y: deco.y,
      width: deco.width || 100,
      height: deco.height || 100,
      imageKey: deco.imageKey
    }));
  }

  // 设置地图信息
  setMap(mapData) {
    this.selectedMap = mapData;
  }

  // ✅ 设置世界大小（从客户端同步）
  setWorldSize(worldWidth, worldHeight) {
    if (typeof worldWidth === 'number' && worldWidth > 0) {
      this.worldWidth = worldWidth;
    }
    if (typeof worldHeight === 'number' && worldHeight > 0) {
      this.worldHeight = worldHeight;
    }
    console.log(`[GameState] 世界大小已更新: ${this.worldWidth}x${this.worldHeight}`);
  }

  // ✅ 服务器权威：更新路口车辆
  updateCarHazards(deltaTime) {
    const deltaMul = deltaTime / 16.67;
    const worldWidth = this.worldWidth || 1920;
    const worldHeight = this.worldHeight || 1080;
    const despawnPad = 400;

    for (let i = this.carHazards.length - 1; i >= 0; i--) {
      const car = this.carHazards[i];

      // 移动车辆
      car.x += car.vx * deltaMul;
      car.y += car.vy * deltaMul;

      // 检查与玩家碰撞（服务器权威计算伤害）
      if (!car.hitPlayer) {
        for (const player of this.players.values()) {
          if (player.isDead) continue;

          // 矩形与圆形碰撞检测
          const rectX = car.x - car.width / 2;
          const rectY = car.y - car.height / 2;
          const playerRadius = 16; // 玩家半径约16

          // 计算矩形中心到圆心的最近点
          const closestX = Math.max(rectX, Math.min(player.x, rectX + car.width));
          const closestY = Math.max(rectY, Math.min(player.y, rectY + car.height));
          const dx = player.x - closestX;
          const dy = player.y - closestY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < playerRadius) {
            // 服务器计算伤害
            player.health = Math.max(0, player.health - (car.damage || 100));
            car.hitPlayer = true;

            // 检查玩家是否死亡
            if (player.health <= 0) {
              player.health = 0;
              player.isDead = true;
            }

            // 每台车只打一次
            break;
          }
        }
      }

      // 检查出界
      if (
        car.x < -despawnPad ||
        car.y < -despawnPad ||
        car.x > worldWidth + despawnPad ||
        car.y > worldHeight + despawnPad
      ) {
        this.carHazards.splice(i, 1);
      }
    }
  }

  // ✅ 服务器权威：生成路口车辆
  spawnCarHazards(now) {
    if (now - this.lastCarSpawnTime < this.carSpawnInterval) return;

    this.lastCarSpawnTime = now;

    const worldWidth = this.worldWidth || 1920;
    const worldHeight = this.worldHeight || 1080;
    const carSpeed = 15; // 固定速度
    const count = 4; // 每批生成4台
    const damage = 100;

    // 生成点打散：同批次车子的起点要分开
    const used = []; // { side: 'left'|'right', y }
    const minSepY = 180;

    const pickSpawn = (side) => {
      let x, y, vx, vy;
      if (side === 'left') {
        x = -100; // 从左侧边界外生成
        y = Math.random() * worldHeight;
        vx = carSpeed;
        vy = 0;
      } else {
        x = worldWidth + 100; // 从右侧边界外生成
        y = Math.random() * worldHeight;
        vx = -carSpeed;
        vy = 0;
      }
      return { x, y, vx, vy, side };
    };

    // 生成侧边：保持完全随机，但保证左右都有
    const sides = [];
    if (count === 1) {
      sides.push(Math.random() < 0.5 ? 'left' : 'right');
    } else {
      sides.push('left');
      sides.push('right');
      for (let i = 2; i < count; i++) {
        sides.push(Math.random() < 0.5 ? 'left' : 'right');
      }
      // Fisher–Yates shuffle
      for (let i = sides.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = sides[i];
        sides[i] = sides[j];
        sides[j] = tmp;
      }
    }

    for (let i = 0; i < count; i++) {
      const side = sides[i] || (Math.random() < 0.5 ? 'left' : 'right');
      let spawn = null;

      // 尝试找到不重叠的生成点
      for (let tries = 0; tries < 60; tries++) {
        const cand = pickSpawn(side);
        let ok = true;
        for (const p of used) {
          if (p.side === cand.side && Math.abs(cand.y - p.y) < minSepY) {
            ok = false;
            break;
          }
        }
        if (ok) {
          spawn = cand;
          break;
        }
      }

      if (!spawn) {
        spawn = pickSpawn(side);
      }

      used.push({ side: spawn.side, y: spawn.y });

      // 车辆尺寸（简化版，使用固定尺寸）
      const width = 185; // 约 385 * 0.48
      const height = 109; // 约 227 * 0.48

      // 随机选择车辆图片键
      const carKeys = ['car', 'car2', 'car3', 'car4', 'car5', 'car6', 'car7', 'car8', 'car9'];
      const baseKey = carKeys[Math.floor(Math.random() * carKeys.length)];
      const desiredFacing = spawn.vx >= 0 ? 'right' : 'left';
      const baseFacing = 'left'; // 默认base图朝左
      const altKey = baseKey === 'car' ? 'car-2' : baseKey + '-2';
      const imageKey = baseFacing !== desiredFacing ? altKey : baseKey;

      this.carHazards.push({
        id: `car_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        x: spawn.x,
        y: spawn.y,
        vx: spawn.vx,
        vy: spawn.vy,
        width: width,
        height: height,
        imageKey: imageKey,
        damage: damage,
        hitPlayer: false,
        despawnPad: 400
      });
    }
  }

  // 获取完整游戏状态（用于广播）
  getState() {
    const state = {
      players: Array.from(this.players.entries()).map(([uid, player]) => ({
        uid,
        ...player
      })),
      enemies: this.enemies,
      projectiles: this.projectiles,
      experienceOrbs: this.experienceOrbs,
      chests: this.chests,
      obstacles: this.obstacles,
      decorations: this.decorations,
      carHazards: this.carHazards,
      exit: this.exit,
      wave: this.wave,
      isGameOver: this.isGameOver,
      isVictory: this.isVictory,
      gameTime: this.gameTime,
      hitEvents: this.hitEvents
      ,sfxEvents: this.sfxEvents
    };
    // ✅ transient：broadcast 後清空（下一幀重算）
    this.hitEvents = [];
    this.sfxEvents = [];
    return state;
  }
}

module.exports = { GameState };

