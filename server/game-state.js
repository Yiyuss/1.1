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
      
      // 移动投射物
      proj.x += Math.cos(proj.angle) * proj.speed * deltaMul;
      proj.y += Math.sin(proj.angle) * proj.speed * deltaMul;
      
      // 检查边界
      if (proj.x < -100 || proj.x > 2020 || proj.y < -100 || proj.y > 1180) {
        this.projectiles.splice(i, 1);
        continue;
      }
      
      // 检查与敌人碰撞（服务器权威计算伤害）
      for (const enemy of this.enemies) {
        if (enemy.health <= 0) continue;
        
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
          
          // 移除投射物
          this.projectiles.splice(i, 1);
          break;
        }
      }
    }
  }

  // 更新敌人
  updateEnemies(deltaTime) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      
      if (enemy.isDead || enemy.health <= 0) {
        this.enemies.splice(i, 1);
        continue;
      }
      
      // 敌人AI（服务器运行）
      // 找到最近的玩家
      let nearestPlayer = null;
      let nearestDist = Infinity;
      for (const player of this.players.values()) {
        if (player.isDead) continue;
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

