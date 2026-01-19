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

    // ✅ 世界大小（与客户端CONFIG一致）
    // 客户端计算方式：worldWidth = CONFIG.CANVAS_WIDTH * (CONFIG.WORLD?.GRID_X || 3)
    // 720P九宫格模式：1280 * 3 = 3840 (宽度), 720 * 3 = 2160 (高度)
    // 4K模式：如果使用4K，可能是 3840x2160 或其他值
    // 默认使用720P九宫格模式，客户端会同步实际值
    this.worldWidth = 3840; // 默认世界宽度（720P九宫格：1280 * 3）
    this.worldHeight = 2160; // 默认世界高度（720P九宫格：720 * 3）
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
      experience: playerData.experience || 0,
      gold: playerData.gold || 0,
      characterId: playerData.characterId || 'pineapple',
      nickname: playerData.nickname || '玩家',
      facing: playerData.facing || 0, // 面向角度
      vx: 0,
      vy: 0,
      isDead: false,
      weapons: playerData.weapons || []
    };
    this.players.set(uid, player);
    return player;
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
        this.createProjectile(uid, input);
        break;

      case 'use_ultimate':
        // 服务器处理大招
        this.handleUltimate(uid, input);
        break;
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
      damage: damage,
      speed: speed,
      size: size,
      homing: input.homing === true,
      turnRatePerSec: (typeof input.turnRatePerSec === 'number' && input.turnRatePerSec >= 0) ? input.turnRatePerSec : 0,
      assignedTargetId: typeof input.assignedTargetId === 'string' ? input.assignedTargetId : null,
      maxDistance: maxDistance,
      distance: 0, // 已飞行距离
      createdAt: Date.now()
    };

    this.projectiles.push(projectile);
    return projectile;
  }

  // 处理大招
  handleUltimate(uid, input) {
    const player = this.players.get(uid);
    if (!player || player.isDead) return;

    // ✅ 服务器权威：处理玩家大招
    // 注意：大招主要是视觉效果和特殊效果，服务器端只需要同步状态
    // 具体的大招逻辑（如凤梨掉落物、爆炸等）由客户端处理并通过事件广播同步

    // 服务器端只同步大招状态（如果需要）
    // 例如：设置 isUltimateActive 标志（如果需要服务器端验证）
    // 当前实现：大招由客户端处理，服务器端不需要额外逻辑
    // 因为大招不涉及服务器权威的游戏状态（如敌人血量、玩家位置等）
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

    // ✅ 服务器权威：经验球收集检测
    this.updateExperienceOrbs(deltaTime);

    // ✅ 服务器权威：宝箱超时自动清除
    this.updateChests(deltaTime);

    // ✅ 服务器权威：更新路口车辆
    this.updateCarHazards(deltaTime);

    // 生成敌人（服务器权威）
    this.spawnEnemies(now, this.config);

    // ✅ 服务器权威：生成路口车辆（仅路口地图，仅多人模式）
    // 注意：服务器端只在多人模式下生成车辆，单机模式由客户端生成
    if (this.selectedMap && this.selectedMap.id === 'intersection' && this.players.size > 0) {
      this.spawnCarHazards(now);
    }

    // 更新波次
    this.updateWave(now);

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
          // 服务器计算伤害
          enemy.health -= proj.damage;

          // ✅ 服务器权威：设置敌人受伤红闪状态
          enemy.hitFlashTime = 150; // 默认150ms红闪时间（与客户端一致）

          if (enemy.health <= 0) {
            enemy.health = 0;
            enemy.isDead = true;
            // 生成经验球
            this.spawnExperienceOrb(enemy.x, enemy.y, 5);
          }

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
    const base = config.WAVES.SPAWN_COUNT.INITIAL || 3;
    const inc = config.WAVES.SPAWN_COUNT.INCREASE_PER_WAVE || 0.9;
    const max = config.WAVES.SPAWN_COUNT.MAXIMUM || 12;
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

      // 计算血量（根据波次）
      const healthMultiplier = config.WAVES.HEALTH_MULTIPLIER_PER_WAVE || 1.05;
      const baseHealth = enemyConfig.HEALTH || 100;
      const health = Math.floor(baseHealth * Math.pow(healthMultiplier, this.wave - 1));

      this.enemies.push({
        id: `enemy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        x, y,
        type: enemyType,
        health: health,
        maxHealth: health,
        speed: enemyConfig.SPEED || 2,
        size: enemyConfig.SIZE || 32,
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

  // ✅ 服务器权威：更新经验球（检测玩家收集）
  updateExperienceOrbs(deltaTime) {
    for (let i = this.experienceOrbs.length - 1; i >= 0; i--) {
      const orb = this.experienceOrbs[i];

      // 检查是否被任何玩家收集
      for (const player of this.players.values()) {
        if (player.isDead) continue;

        const dx = player.x - orb.x;
        const dy = player.y - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const collisionRadius = (orb.size || 20) / 2 + 16; // 玩家半径约16

        if (dist < collisionRadius) {
          // ✅ 方案1：经验共享 - 所有玩家都获得经验
          // 注意：经验值由客户端计算（因为涉及升级需求等复杂逻辑）
          // 服务器端只负责移除经验球，经验值由客户端通过事件广播同步

          // 移除经验球
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
    const waveDuration = 60000; // 60秒一波

    if (waveElapsed >= waveDuration) {
      this.wave++;
      this.waveStartTime = now;
      this.enemySpawnRate = Math.max(500, 2000 - (this.wave - 1) * 100);
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
    return {
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
      wave: this.wave,
      isGameOver: this.isGameOver,
      isVictory: this.isVictory,
      gameTime: this.gameTime
    };
  }
}

module.exports = { GameState };

