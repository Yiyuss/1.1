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
    this.wave = 1;
    this.waveStartTime = Date.now();
    this.lastEnemySpawnTime = 0;
    this.enemySpawnRate = 2000; // 初始生成间隔（毫秒）
    this.isGameOver = false;
    this.isVictory = false;
    this.gameTime = 0;
    this.lastUpdateTime = Date.now();
    this.config = null; // CONFIG数据（从客户端同步）
  }

  // 添加玩家
  addPlayer(uid, playerData) {
    const player = {
      uid,
      x: playerData.x || 1920 / 2,
      y: playerData.y || 1080 / 2,
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
        
        // 边界检查
        const worldWidth = 1920;
        const worldHeight = 1080;
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

    const projectile = {
      id: `projectile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      playerUid: uid,
      x: input.x || player.x,
      y: input.y || player.y,
      angle: input.angle || player.facing,
      weaponType: input.weaponType || 'DAGGER',
      damage: input.damage || 10,
      speed: input.speed || 5,
      size: input.size || 20,
      homing: input.homing || false,
      turnRatePerSec: input.turnRatePerSec || 0,
      assignedTargetId: input.assignedTargetId || null,
      maxDistance: input.maxDistance || 1000, // 最大飞行距离
      distance: 0, // 已飞行距离
      createdAt: Date.now()
    };
    
    this.projectiles.push(projectile);
    return projectile;
  }

  // 处理大招
  handleUltimate(uid, input) {
    const player = this.players.get(uid);
    if (!player) return;
    
    // 根据角色类型处理不同的大招
    // 这里需要根据实际游戏逻辑实现
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

    // 生成敌人（服务器权威）
    this.spawnEnemies(now, this.config);

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
      
      // 检查边界
      if (proj.x < -100 || proj.x > 2020 || proj.y < -100 || proj.y > 1180) {
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
      
      // 在世界边缘生成
      const edge = Math.floor(Math.random() * 4);
      let x, y;
      switch (edge) {
        case 0: x = Math.random() * 1920; y = -50; break;
        case 1: x = 1970; y = Math.random() * 1080; break;
        case 2: x = Math.random() * 1920; y = 1130; break;
        case 3: x = -50; y = Math.random() * 1080; break;
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
      wave: this.wave,
      isGameOver: this.isGameOver,
      isVictory: this.isVictory,
      gameTime: this.gameTime
    };
  }
}

module.exports = { GameState };

