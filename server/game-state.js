// 权威服务器游戏状态管理
// 这是游戏状态的唯一真实来源
// 所有游戏逻辑都在这里处理

class GameState {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = new Map(); // uid -> PlayerState
    this.enemies = []; // EnemyState[]
    this.projectiles = []; // ProjectileState[]
    this.bossProjectiles = []; // BossProjectileState[] (BOSS火彈 / HUMAN2瓶子) - 伺服器權威
    this.bullets = []; // BulletState[] (ASURA 彈幕) - 伺服器權威
    this.bulletEmitters = []; // BulletEmitterState[] - 伺服器權威
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
    this._shouldBroadcastGameOver = false; // ✅ 修复：标记是否需要广播 game_over 事件

    // ✅ session：用於「新一局」重置狀態，避免上一局波次/怪物殘留造成開場幾隻血超多
    this.currentSessionId = null;

    // ✅ transient：本幀命中事件（用於客戶端顯示傷害數字/爆擊標記）
    this.hitEvents = [];

    // ✅ 已移除：sfxEvents（音效是單機元素，不需要通過伺服器發送）
    // 舊的 sfxEvents 系統已被完全移除（survival_team_master_plan.md）
    // this.sfxEvents = []; // 已移除

    // ✅ transient：視覺特效事件（多人元素；所有人都看得到）
    // 格式：{ type: 'screen_effect'|'explosion_particles', data: {...} }
    this.vfxEvents = [];

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

  _isBulletSystemEnabled() {
    try {
      const bs = (this.config && this.config.BULLET_SYSTEM) ? this.config.BULLET_SYSTEM : null;
      if (!bs || bs.ENABLED !== true) return false;
      // 單機同源：修羅難度才會掛載彈幕發射器
      return (this.diffId === 'ASURA');
    } catch (_) { return false; }
  }

  _computeBulletDamage(base = 40) {
    try {
      const w = (typeof this.wave === 'number' && this.wave > 0) ? this.wave : 1;
      return Math.max(1, Math.floor(base + w));
    } catch (_) { return 41; }
  }

  _addBullet(x, y, vx, vy, lifeMs, size = 14, color = '#ffcc66', damage = null) {
    const now = Date.now();
    const life = Math.max(0, Math.floor(lifeMs || 0));
    const dmg = (typeof damage === 'number') ? Math.floor(damage) : this._computeBulletDamage(40);
    const b = {
      id: `b_${now}_${Math.random().toString(36).slice(2, 9)}`,
      x: x || 0,
      y: y || 0,
      vx: vx || 0,
      vy: vy || 0,
      life: life,
      maxLife: life,
      size: Math.max(2, Math.floor(size || 14)),
      color: color || '#ffcc66',
      damage: dmg
    };
    this.bullets.push(b);
  }

  _ensureBulletEmitterForEnemy(enemy, kind) {
    if (!enemy || !enemy.id) return;
    if (!this._isBulletSystemEnabled()) return;
    // 避免重複掛載
    if (this.bulletEmitters.some(e => e && e.anchorEnemyId === enemy.id && e.kind === kind)) return;

    const now = Date.now();
    if (kind === 'MINI_BOSS') {
      this.bulletEmitters.push({
        id: `em_${now}_${Math.random().toString(36).slice(2, 9)}`,
        kind,
        anchorEnemyId: enemy.id,
        rateMs: 600,
        lifeMs: 90000,
        createdAt: now,
        lastEmitAt: now,
        active: true,
        phase: 0
      });
    } else if (kind === 'BOSS') {
      this.bulletEmitters.push({
        id: `em_${now}_${Math.random().toString(36).slice(2, 9)}`,
        kind,
        anchorEnemyId: enemy.id,
        rateMs: 450,
        lifeMs: 120000,
        createdAt: now,
        lastEmitAt: now,
        active: true,
        phase: 0
      });
    }
  }

  updateBullets(deltaTime) {
    if (!this._isBulletSystemEnabled()) {
      // 非修羅：確保乾淨（避免殘留）
      if (this.bullets.length) this.bullets = [];
      if (this.bulletEmitters.length) this.bulletEmitters = [];
      return;
    }

    const now = Date.now();
    const deltaMul = (deltaTime || 16.67) / 16.67;

    // 1) 更新發射器（同源 wave.js patternFn）
    for (let i = this.bulletEmitters.length - 1; i >= 0; i--) {
      const e = this.bulletEmitters[i];
      if (!e || !e.active) { this.bulletEmitters.splice(i, 1); continue; }
      if (e.lifeMs > 0 && now - e.createdAt >= e.lifeMs) { this.bulletEmitters.splice(i, 1); continue; }

      const anchor = this.enemies.find(x => x && x.id === e.anchorEnemyId);
      if (!anchor || anchor.isDead || anchor.health <= 0) { this.bulletEmitters.splice(i, 1); continue; }

      const rate = Math.max(0, e.rateMs || 0);
      if (rate > 0 && now - (e.lastEmitAt || 0) >= rate) {
        const ex = anchor.x;
        const ey = anchor.y;
        const phase = (typeof e.phase === 'number') ? e.phase : 0;

        if (e.kind === 'MINI_BOSS') {
          const count = 12;
          const speed = 3.2;
          const life = 3200;
          const color = '#ffdd77';
          for (let k = 0; k < count; k++) {
            const ang = phase + (k / count) * Math.PI * 2;
            const vx = Math.cos(ang) * speed;
            const vy = Math.sin(ang) * speed;
            this._addBullet(ex, ey, vx, vy, life, 14, color);
          }
          e.phase = phase + 0.22;
        } else if (e.kind === 'BOSS') {
          const count = 18;
          const speed = 3.5;
          const life = 3500;
          const color = '#ffcc66';
          for (let k = 0; k < count; k++) {
            const ang = phase + (k / count) * Math.PI * 2;
            const vx = Math.cos(ang) * speed;
            const vy = Math.sin(ang) * speed;
            this._addBullet(ex, ey, vx, vy, life, 16, color);
          }
          e.phase = phase + 0.25;
        }

        e.lastEmitAt = now;
      }
    }

    // 2) 更新子彈 + 碰撞（單機同源：ignoreInvulnerability=true，但尊重技能無敵；閃避可生效）
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b) { this.bullets.splice(i, 1); continue; }

      b.x += (b.vx || 0) * deltaMul;
      b.y += (b.vy || 0) * deltaMul;
      b.life = (b.life || 0) - (deltaTime || 16.67);
      if (b.life <= 0) { this.bullets.splice(i, 1); continue; }

      const r = (b.size || 8) + 16;
      for (const p of this.players.values()) {
        if (!p || p.isDead || p.health <= 0) continue;
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        if (Math.sqrt(dx * dx + dy * dy) < r) {
          this._applyDamageToPlayer(p, (b.damage || this._computeBulletDamage(40)), { ignoreInvulnerability: true, ignoreDodge: false });
          // 命中後移除（單機同源）
          this.bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  _isBossRangedEnabled() {
    try {
      if (!this.config || !this.config.DIFFICULTY) return false;
      const diff = this.config.DIFFICULTY[this.diffId] || null;
      return !!(diff && diff.bossRangedEnabled);
    } catch (_) { return false; }
  }

  _shouldEnableRanged(enemyType, enemyConfig) {
    try {
      if (!enemyConfig || !enemyConfig.RANGED_ATTACK) return false;
      // 例外：路口 HUMAN2 瓶子投擲常駐
      const alwaysEnable = (this.mapId === 'intersection' && enemyType === 'HUMAN2');
      if (alwaysEnable) return true;
      const enabledFlag = (enemyConfig.RANGED_ATTACK.ENABLED !== false);
      return enabledFlag && this._isBossRangedEnabled();
    } catch (_) { return false; }
  }

  _spawnBossProjectile(enemy, targetPlayer, deltaTime) {
    if (!enemy || !targetPlayer) return;
    const ra = enemy.rangedAttack;
    if (!ra) return;

    const now = Date.now();
    const id = `bp_${now}_${Math.random().toString(36).slice(2, 9)}`;

    // HUMAN2：拋物線瓶子（不追蹤）
    if (enemy.type === 'HUMAN2') {
      try {
        const cfgDagger = (this.config && this.config.WEAPONS && this.config.WEAPONS.DAGGER) ? this.config.WEAPONS.DAGGER : {};
        const baseSize = (typeof cfgDagger.PROJECTILE_SIZE === 'number') ? cfgDagger.PROJECTILE_SIZE : 20;
        const bottleH = Math.max(14, Math.round(baseSize));
        const bottleW = Math.max(10, Math.round(bottleH * (54 / 150)));

        // BottleProjectile 同源解算
        const dx = targetPlayer.x - enemy.x;
        const dy = targetPlayer.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const spd = Math.max(0.01, (typeof ra.PROJECTILE_SPEED === 'number') ? ra.PROJECTILE_SPEED : 5);
        const frames = Math.max(18, Math.min(72, dist / spd));
        const g = 0.08;
        const vx = dx / frames;
        const vy = (dy - 0.5 * g * frames * frames) / frames;

        this.bossProjectiles.push({
          id,
          kind: 'BOTTLE',
          x: enemy.x,
          y: enemy.y,
          vx,
          vy,
          g,
          width: bottleW,
          height: bottleH,
          damage: (typeof ra.PROJECTILE_DAMAGE === 'number') ? ra.PROJECTILE_DAMAGE : 15,
          createdAt: now,
          lifeTime: 5000
        });
      } catch (_) { }
      return;
    }

    // 其他：BOSS 火彈（追蹤可選）
    try {
      const angle = Math.atan2(targetPlayer.y - enemy.y, targetPlayer.x - enemy.x);
      this.bossProjectiles.push({
        id,
        kind: 'BOSS_PROJECTILE',
        x: enemy.x,
        y: enemy.y,
        angle,
        speed: (typeof ra.PROJECTILE_SPEED === 'number') ? ra.PROJECTILE_SPEED : 5,
        damage: (typeof ra.PROJECTILE_DAMAGE === 'number') ? ra.PROJECTILE_DAMAGE : 40,
        size: (typeof ra.PROJECTILE_SIZE === 'number') ? ra.PROJECTILE_SIZE : 18,
        homing: !!ra.HOMING,
        turnRate: (typeof ra.TURN_RATE === 'number') ? ra.TURN_RATE : 0,
        createdAt: now,
        lifeTime: 5000
      });
    } catch (_) { }
  }

  updateBossProjectiles(deltaTime) {
    if (!this.bossProjectiles || !this.bossProjectiles.length) return;
    const now = Date.now();
    const deltaMul = deltaTime / 16.67;

    for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
      const p = this.bossProjectiles[i];
      if (!p) { this.bossProjectiles.splice(i, 1); continue; }

      // 生命週期
      const createdAt = p.createdAt || now;
      const lifeTime = (typeof p.lifeTime === 'number') ? p.lifeTime : 5000;
      if (now - createdAt > lifeTime) {
        this.bossProjectiles.splice(i, 1);
        continue;
      }

      if (p.kind === 'BOTTLE') {
        // 拋物線
        const g = (typeof p.g === 'number') ? p.g : 0.08;
        p.vy = (p.vy || 0) + g * deltaMul;
        p.x += (p.vx || 0) * deltaMul;
        p.y += (p.vy || 0) * deltaMul;

        // 碰撞（rect vs player circle），只打一個人就刪除
        const rectX = p.x - (p.width || 10) / 2;
        const rectY = p.y - (p.height || 14) / 2;
        for (const player of this.players.values()) {
          if (!player || player.isDead || player.health <= 0) continue;
          const pr = 16;
          const closestX = Math.max(rectX, Math.min(player.x, rectX + (p.width || 10)));
          const closestY = Math.max(rectY, Math.min(player.y, rectY + (p.height || 14)));
          const dx = player.x - closestX;
          const dy = player.y - closestY;
          if (Math.sqrt(dx * dx + dy * dy) < pr) {
            // BottleProjectile：不忽略無敵，不忽略閃避（單機同源）
            this._applyDamageToPlayer(player, (p.damage || 15), { ignoreInvulnerability: false, ignoreDodge: false });
            // ✅ VFX（多人元素）：瓶子命中 → 閃光/震動（由客戶端套用距離門檻）
            try {
              this.vfxEvents.push({
                type: 'screen_effect',
                data: {
                  type: 'boss_projectile_explosion',
                  x: p.x,
                  y: p.y,
                  // ✅ 震動屬於單機元素：只讓「被命中的玩家」震動
                  playerUid: player.uid,
                  screenFlash: { active: true, intensity: 0.3, duration: 150 },
                  cameraShake: { active: true, intensity: 8, duration: 200 }
                }
              });
            } catch (_) { }
            this.bossProjectiles.splice(i, 1);
            break;
          }
        }
        continue;
      }

      // BOSS 火彈（可追蹤）
      const homing = !!p.homing;
      if (homing) {
        // 找最近的活人
        let nearest = null;
        let nearestDist = Infinity;
        for (const player of this.players.values()) {
          if (!player || player.isDead || player.health <= 0) continue;
          const dx = player.x - p.x;
          const dy = player.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < nearestDist) { nearestDist = dist; nearest = player; }
        }
        if (nearest) {
          const targetAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
          let angleDiff = targetAngle - (p.angle || 0);
          while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
          while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
          const maxTurn = (p.turnRate || 0) * deltaMul;
          angleDiff = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
          p.angle = (p.angle || 0) + angleDiff;
        }
      }

      p.x += Math.cos(p.angle || 0) * (p.speed || 5) * deltaMul;
      p.y += Math.sin(p.angle || 0) * (p.speed || 5) * deltaMul;

      // 碰撞（circle vs player circle）
      const r = ((p.size || 18) / 2) + 16;
      for (const player of this.players.values()) {
        if (!player || player.isDead || player.health <= 0) continue;
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        if (Math.sqrt(dx * dx + dy * dy) < r) {
          // BossProjectile：忽略受傷短暫無敵，但尊重技能無敵；閃避仍可用（單機同源）
          this._applyDamageToPlayer(player, (p.damage || 40), { ignoreInvulnerability: true, ignoreDodge: false });
          // ✅ VFX（多人元素）：火彈命中 → 閃光/震動
          try {
            this.vfxEvents.push({
              type: 'screen_effect',
              data: {
                type: 'boss_projectile_explosion',
                x: p.x,
                y: p.y,
                // ✅ 震動屬於單機元素：只讓「被命中的玩家」震動
                playerUid: player.uid,
                screenFlash: { active: true, intensity: 0.3, duration: 150 },
                cameraShake: { active: true, intensity: 8, duration: 200 }
              }
            });
          } catch (_) { }
          this.bossProjectiles.splice(i, 1);
          break;
        }
      }
    }
  }

  // 添加玩家
  addPlayer(uid, playerData) {
    const player = {
      uid,
      x: playerData.x || (this.worldWidth / 2),
      y: playerData.y || (this.worldHeight / 2),
      health: playerData.health || 200,
      maxHealth: playerData.maxHealth || 200,
      energy: playerData.energy || 0, // ✅ 單機同源：初始能量為 0，不是 100
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
      // ✅ 多人元素：救援/復活（伺服器權威；客戶端只顯示 UI）
      resurrectionProgress: 0, // 0..100
      resurrectionRescuerUid: null,
      weapons: playerData.weapons || [],
      // ✅ 可玩性保底：若客戶端 attack input 鏈路斷掉，伺服器仍能在多人模式提供最低限度的自動攻擊
      lastAttackAt: 0,
      lastAutoFireAt: 0,

      // ✅ 單機同源：受傷短暫無敵 / 防禦 / 迴避（由 client 提供 meta，伺服器只做權威判定）
      invulnerableUntil: 0,
      // ✅ 單機同源：技能無敵（INVINCIBLE）應永遠優先（即使 ignoreInvulnerability=true 的重擊也要尊重）
      skillInvulnerableUntil: 0,
      meta: {
        dodgeRate: 0,
        damageReductionFlat: 0,
        invulnerabilityDurationMs: 1000,
        // ✅ 單機同源：不獸控制（吸血）等「命中後回復」類效果需在伺服器權威結算
        lifesteal: { pct: 0, cooldownMs: 100, minHeal: 1, lastAt: 0 }
      },
      // ✅ 多人元素：大招動畫狀態（讓所有客戶端能看到其他玩家的大招變身效果）
      isUltimateActive: false,
      ultimateImageKey: null,
      ultimateEndTime: 0,
      // ✅ 多人元素：體型變化（大招變身時的視覺效果）
      width: playerData.width || 32,
      height: playerData.height || 32,
      collisionRadius: playerData.collisionRadius || 16,
      // 保存原始體型（用於大招結束時恢復）
      _originalWidth: playerData.width || 32,
      _originalHeight: playerData.height || 32,
      _originalCollisionRadius: playerData.collisionRadius || 16
    };
    this.players.set(uid, player);
    return player;
  }

  _applyLifesteal(uid, damageAmount) {
    const player = this.players.get(uid);
    if (!player || player.isDead || player.health <= 0) return;
    if (player.health >= (player.maxHealth || 0)) return;
    const now = Date.now();
    try {
      const ls = player.meta && player.meta.lifesteal ? player.meta.lifesteal : null;
      if (!ls) return;
      const pct = (typeof ls.pct === 'number') ? ls.pct : 0;
      if (!(pct > 0)) return;
      const cooldownMs = (typeof ls.cooldownMs === 'number') ? Math.max(0, Math.floor(ls.cooldownMs)) : 100;
      const minHeal = (typeof ls.minHeal === 'number') ? Math.max(0, Math.floor(ls.minHeal)) : 1;
      const lastAt = (typeof ls.lastAt === 'number') ? ls.lastAt : 0;
      if (cooldownMs > 0 && (now - lastAt) < cooldownMs) return;

      const heal = Math.max(minHeal, Math.floor(Math.max(0, damageAmount || 0) * pct));
      if (heal <= 0) return;
      player.health = Math.min(player.maxHealth || player.health, player.health + heal);
      ls.lastAt = now;
    } catch (_) { }
  }

  _applyDamageToPlayer(player, amount, opts = {}) {
    if (!player || player.isDead || player.health <= 0) return;
    const now = Date.now();
    const ignoreInvulnerability = !!opts.ignoreInvulnerability;
    const ignoreDodge = !!opts.ignoreDodge;

    // ✅ 技能無敵（單機 invulnerabilitySource === 'INVINCIBLE'）：永遠優先
    try {
      const untilSkill = player.skillInvulnerableUntil || 0;
      if (untilSkill && now < untilSkill) return;
    } catch (_) { }

    // 無敵判定
    if (!ignoreInvulnerability) {
      const until = player.invulnerableUntil || 0;
      if (until && now < until) return;
    }

    // 迴避判定（由 client 計算最終 dodgeRate 並送到 meta）
    if (!ignoreDodge) {
      const r = player.meta && typeof player.meta.dodgeRate === 'number' ? player.meta.dodgeRate : 0;
      const rate = Math.max(0, Math.min(0.95, r));
      if (rate > 0 && Math.random() < rate) return;
    }

    // 防禦平減（與單機：baseDefense + damageReductionFlat）
    const red = player.meta && typeof player.meta.damageReductionFlat === 'number' ? player.meta.damageReductionFlat : 0;
    const effective = Math.max(0, Math.floor(amount || 0) - Math.max(0, Math.floor(red)));
    if (effective <= 0) return;

    player.health = Math.max(0, (player.health || 0) - effective);
    if (player.health <= 0) {
      player.health = 0;
      player.isDead = true;
      // ✅ 死亡時重置救援進度（避免殘留）
      try {
        player.resurrectionProgress = 0;
        player.resurrectionRescuerUid = null;
      } catch (_) { }
      return;
    }

    // 受傷短暫無敵（單機同源）
    const dur = player.meta && typeof player.meta.invulnerabilityDurationMs === 'number'
      ? Math.max(0, Math.floor(player.meta.invulnerabilityDurationMs))
      : 1000;
    player.invulnerableUntil = now + (dur || 0);
  }

  // ✅ 新一局：重置所有「本場」狀態（不影響房間/成員存在）
  resetForNewSession(sessionId, playerUpdates = null) {
    if (!sessionId || typeof sessionId !== 'string') return;
    if (this.currentSessionId === sessionId) return;
    this.currentSessionId = sessionId;
    // ⚠️ 修复：记录 new-session 的时间，用于时间窗口机制
    // 在收到 new-session 后的 2 秒内，忽略旧的 obstacles 和 decorations 数据
    this._newSessionTime = Date.now();

    this.enemies = [];
    this.projectiles = [];
    this.bossProjectiles = [];
    this.bullets = [];
    this.bulletEmitters = [];
    this.experienceOrbs = [];
    this.chests = [];
    // ⚠️ 修復：重置小BOSS生成標記，確保新session第一波能生成小BOSS
    this.minibossSpawnedForWave = false;
    this.carHazards = [];
    // ⚠️ 修复：清理地图特定的静态元素，确保切换地图时不会残留
    // 障碍物和装饰是地图特定的，新游戏开始时必须清理，让新地图重新生成
    this.obstacles = [];
    this.decorations = [];
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
    // ✅ 修复：重置游戏结束相关标记
    this._shouldBroadcastGameOver = false;
    this._gameOverEventSent = false;

    // 玩家：回到安全初始狀態（保守）
    // ✅ 如果提供了 playerUpdates（Map<uid, {maxHealth, ...}>），更新對應玩家的 maxHealth
    // ⚠️ 修复：新 session 开始时，重置玩家位置和血量，确保全新状态
    for (const p of this.players.values()) {
      if (!p) continue;
      
      // ⚠️ 重要：不要重置玩家位置！
      // 位置应该由客户端的移动输入来更新，服务器端只负责验证和同步位置
      // 重置位置会破坏客户端-服务器同步，导致敌人不追踪玩家
      // 如果需要在游戏开始时重置位置，应该在客户端处理，而不是在服务器端
      
      // ✅ 更新 maxHealth（如果客戶端發送了計算好的值）
      if (playerUpdates && playerUpdates.has(p.uid)) {
        const update = playerUpdates.get(p.uid);
        if (typeof update.maxHealth === 'number' && update.maxHealth > 0) {
          const prevMaxHealth = p.maxHealth || 200;
          const newMaxHealth = update.maxHealth;
          p.maxHealth = newMaxHealth;
          // ⚠️ 修复：新 session 开始时，直接设置为满血（避免继承上一局的血量）
          p.health = newMaxHealth;
          console.log(`[GameState.resetForNewSession] ✅ 更新玩家 ${p.uid} maxHealth: ${prevMaxHealth} -> ${newMaxHealth}, health: ${p.health} (新 session 满血)`);
        } else {
          // ⚠️ 修复：如果没有提供 maxHealth 更新，也重置为满血
          p.health = p.maxHealth || 200;
        }
      } else {
        // ⚠️ 修复：如果没有提供 playerUpdates，也重置为满血
        p.health = p.maxHealth || 200;
      }
      
      p.isDead = false;
      // ⚠️ 修復：確保 health 不超過 maxHealth
      if (p.health > (p.maxHealth || 200)) {
        p.health = p.maxHealth || 200;
      }
      // ✅ 單機同源：新局開始時能量必須重置為 0，不是保留舊值
      p.energy = 0;
      p.vx = 0; p.vy = 0;
      p.lastAttackAt = 0;
      p.lastAutoFireAt = 0;
      p.invulnerableUntil = 0;
      p.skillInvulnerableUntil = 0;
      p.resurrectionProgress = 0;
      p.resurrectionRescuerUid = null;
      // 注意：experience/sessionCoins 是「本場累積量」，新局要清 0
      p.experience = 0;
      p.sessionCoins = 0;
      // ⚠️ 修复：重置玩家等级为 1（新游戏开始）
      p.level = 1;
      // ⚠️ 修复：重置玩家面向（新游戏开始）
      p.facing = 0;
      // ⚠️ 修复：如果没有提供 playerUpdates，确保 maxHealth 被重置为默认值
      if (!playerUpdates || !playerUpdates.has(p.uid)) {
        // 如果没有提供更新，保持当前的 maxHealth（可能是角色属性或天赋加成）
        // 但确保 health 等于 maxHealth（满血状态）
        p.health = p.maxHealth || 200;
      }
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

  /**
   * 計算「目前等級 level -> 下一級」所需經驗（與 js/player.js 的 Player.computeExperienceToNextLevel 完全同源）
   * - 需求：Lv1~SOFTCAP_LEVEL 完全沿用舊公式，避免影響前期手感；
   * - Lv20+ 後放緩增長避免後期成長曲線過於誇張。
   */
  _computeExperienceToNextLevel(level) {
    try {
      const cfg = (this.config && this.config.EXPERIENCE) ? this.config.EXPERIENCE : null;
      const base = cfg ? (cfg.LEVEL_UP_BASE || 80) : 80;
      const mult = cfg ? (cfg.LEVEL_UP_MULTIPLIER || 1.12) : 1.12;
      const softcap = cfg ? (cfg.SOFTCAP_LEVEL || 20) : 20;
      const lateMult = cfg ? (cfg.LEVEL_UP_MULTIPLIER_LATE || 1.07) : 1.07;
      const lateLinear = cfg ? (cfg.LEVEL_UP_LINEAR_LATE || 30) : 30;

      const lv = Math.max(1, Math.floor(level || 1));

      // 1) 前期：完全沿用舊公式（確保 1~20 手感不變）
      if (lv <= softcap) {
        return Math.floor(base * Math.pow(mult, lv - 1));
      }

      // 2) 後期：以 softcap 當錨點，改用較緩的倍率 + 線性補償
      const xpAtSoftcap = Math.floor(base * Math.pow(mult, softcap - 1));
      const n = lv - softcap; // 從 softcap 後第 n 級開始
      const value = xpAtSoftcap * Math.pow(lateMult, n) + lateLinear * n;
      return Math.max(1, Math.floor(value));
    } catch (_) {
      // 出錯時回退到簡單線性成長，避免整個 getState 崩潰
      const lv = Math.max(1, Math.floor(level || 1));
      return 80 + (lv - 1) * 20;
    }
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

  _computeHit(baseDamage, inputMeta, player = null) {
    // 參考 client DamageSystem：浮動±10%，爆擊 10% 基礎 + bonus
    const fluct = 0.10;
    const rand = 1 + (Math.random() * 2 * fluct - fluct);
    let amount = Math.max(1, Math.round((baseDamage || 0) * rand));

    const allowCrit = !(inputMeta && inputMeta.allowCrit === false);
    // ✅ 優先使用 player.meta.critChanceBonusPct（持續同步），其次使用 inputMeta.critChanceBonusPct（攻擊時傳入）
    let bonusCrit = 0;
    if (player && player.meta && typeof player.meta.critChanceBonusPct === 'number') {
      bonusCrit = player.meta.critChanceBonusPct;
    } else if (inputMeta && typeof inputMeta.critChanceBonusPct === 'number') {
      bonusCrit = inputMeta.critChanceBonusPct;
    }
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
        console.log(`[GameState.handleInput] ✅ 收到攻擊輸入: uid=${uid}, weaponType=${input.weaponType || 'UNKNOWN'}, x=${input.x}, y=${input.y}`);
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
        // ✅ 切腫瘤：禁止客戶端 input 直接復活（避免繞過救援機制）
        // 權威多人復活只允許由 updateResurrections() 的救援成功路徑觸發。
        break;

      case 'player-meta':
        // ✅ 單機同源：同步本地玩家的防禦/迴避/無敵/爆擊率等最終值（避免多人「被連打秒死」）
        try {
          if (!player.meta) player.meta = {};
          if (typeof input.dodgeRate === 'number') player.meta.dodgeRate = Math.max(0, Math.min(0.95, input.dodgeRate));
          if (typeof input.damageReductionFlat === 'number') player.meta.damageReductionFlat = Math.max(0, Math.floor(input.damageReductionFlat));
          if (typeof input.invulnerabilityDurationMs === 'number') player.meta.invulnerabilityDurationMs = Math.max(0, Math.floor(input.invulnerabilityDurationMs));
          if (typeof input.skillInvulnerableUntil === 'number') player.skillInvulnerableUntil = Math.max(0, Math.floor(input.skillInvulnerableUntil));
          // ✅ 新增：爆擊率同步（天賦 + 升級 + 角色基礎）
          if (typeof input.critChanceBonusPct === 'number') player.meta.critChanceBonusPct = Math.max(0, input.critChanceBonusPct);
          // ✅ 新增：maxHealth 同步（多人元素，影響復活時的血量）
          if (typeof input.maxHealth === 'number' && input.maxHealth > 0) {
            player.maxHealth = Math.max(100, Math.floor(input.maxHealth)); // 最小值 100，避免異常值
            // 確保當前血量不超過新的最大血量
            if (player.health > player.maxHealth) {
              player.health = player.maxHealth;
            }
          }
          // ⚠️ 修復：同步回血速度倍率（基礎回血、天賦回血、武器技能回血等）
          if (typeof input.healthRegenSpeedMultiplier === 'number' && input.healthRegenSpeedMultiplier > 0) {
            if (!player.meta) player.meta = {};
            player.meta.healthRegenSpeedMultiplier = Math.max(1.0, input.healthRegenSpeedMultiplier);
          }
          // ⚠️ 修復：同步回血間隔（與單機一致：5000ms）
          if (typeof input.healthRegenIntervalMs === 'number' && input.healthRegenIntervalMs > 0) {
            if (!player.meta) player.meta = {};
            player.meta.healthRegenIntervalMs = Math.max(1000, Math.floor(input.healthRegenIntervalMs));
          }
          // ✅ 單機同源：不獸控制（吸血）— 只同步最終參數，伺服器權威結算回復
          if (input.lifesteal && typeof input.lifesteal === 'object') {
            if (!player.meta.lifesteal) player.meta.lifesteal = { pct: 0, cooldownMs: 100, minHeal: 1, lastAt: 0 };
            if (typeof input.lifesteal.pct === 'number') player.meta.lifesteal.pct = Math.max(0, input.lifesteal.pct);
            if (typeof input.lifesteal.cooldownMs === 'number') player.meta.lifesteal.cooldownMs = Math.max(0, Math.floor(input.lifesteal.cooldownMs));
            if (typeof input.lifesteal.minHeal === 'number') player.meta.lifesteal.minHeal = Math.max(0, Math.floor(input.lifesteal.minHeal));
          } else if (input.lifesteal === null) {
            // 允許客戶端明確清空（例如：技能被移除）
            if (player.meta && player.meta.lifesteal) {
              player.meta.lifesteal.pct = 0;
            }
          }
        } catch (_) { }
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
  // opts.sourceUid：造成這次傷害/擊殺的玩家（用於音效等「只播自己」的本地化規則）
  damageEnemy(enemy, amount, opts = {}) {
    const dmg = Math.max(0, Math.floor(amount || 0));
    if (!enemy || enemy.isDead || enemy.health <= 0 || dmg <= 0) return;
    enemy.health -= dmg;
    enemy.hitFlashTime = 150;
    if (enemy.health <= 0) {
      enemy.health = 0;
      enemy.isDead = true;
      // ✅ 流量優化：音效是單機元素，不需要通過伺服器發送（節省流量）
      // 客戶端會在本地播放音效（enemy.js 中已有 AudioManager.playSound('enemy_death')）
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
        // ✅ 使用 player.meta.critChanceBonusPct（持續同步的爆擊率）
        const hit = this._computeHit(damage, input, player);
        this.damageEnemy(enemy, hit.amount, { sourceUid: uid });
        // ✅ 單機同源：命中後吸血（不獸控制）
        this._applyLifesteal(uid, hit.amount);
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
    if (!player) {
      console.warn(`[GameState.createProjectile] ❌ 玩家不存在: uid=${uid}`);
      return;
    }
    console.log(`[GameState.createProjectile] ✅ 創建投射物: uid=${uid}, weaponType=${input.weaponType || 'UNKNOWN'}, projectiles.length=${this.projectiles.length}`);

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

    // ✅ 流量優化：音效是單機元素，不需要通過伺服器發送（節省流量）
    // 客戶端會在本地播放音效（weapon.js 中已有 AudioManager.playSound）
    // 舊的 sfxEvents 系統已被完全移除（survival_team_master_plan.md）
    return projectile;
  }

  // 处理大招
  handleUltimate(uid, input) {
    const player = this.players.get(uid);
    if (!player || player.isDead) return;

    // 能量門檻：需滿能量；成功施放後歸零
    if (player.energy < (player.maxEnergy || 100)) return;
    player.energy = 0;

    // ✅ 服务器权威：鳳梨不咬舌（pineapple）的大招改由伺服器生成掉落物（PINEAPPLE chest）
    // 目的：避免客戶端事件/本地生成與 state.chests 權威打架，並確保所有端看到一致的掉落物。
    try {
      if (player.characterId === 'pineapple') {
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
        // 鳳梨大招不變身，所以不設置 isUltimateActive
        return;
      }
    } catch (_) { }

    // ✅ 多人元素：大招動畫（視覺效果）需要同步到所有客戶端
    // 對於變身型大招（非鳳梨、非爆炸型、非森森鈴蘭），設置大招狀態以便其他客戶端能看到變身效果
    // 注意：大招功能本身是單機元素（武器變化、屬性加成等），只在本地玩家執行
    // 但大招動畫（isUltimateActive、ultimateImageKey、體型變化）是多人元素，需要同步
    // ✅ 不會變身的角色：鳳梨（pineapple）、艾比（rabi/abby，爆炸型大招）、森森鈴蘭（sensen/lilylinglan，未來，目前未實作）
    // 這些角色的大招不設置 isUltimateActive，因為它們不會變身
    const isNonTransformUltimate = (
      player.characterId === 'pineapple' || 
      player.characterId === 'rabi' || // 艾比（爆炸型大招）
      player.characterId === 'abby' || // 艾比（別名）
      player.characterId === 'sensen' || // 森森鈴蘭（未來，目前未實作）
      player.characterId === 'lilylinglan' // 森森鈴蘭（別名）
    );
    
    if (!isNonTransformUltimate) {
      // 只有變身型大招才設置動畫狀態
      try {
        // 從客戶端傳來的 input 中獲取大招配置（如果有的話）
        // 如果沒有，使用預設值（客戶端會自己處理變身邏輯）
        const now = Date.now();
        const ultimateDurationMs = (input && typeof input.durationMs === 'number') ? input.durationMs : 10000; // 預設 10 秒
        
        // 保存原始體型（用於大招結束時恢復）
        if (typeof player._originalWidth !== 'number') {
          player._originalWidth = player.width || 32;
          player._originalHeight = player.height || 32;
          player._originalCollisionRadius = player.collisionRadius || 16;
        }
        
        // 設置大招狀態（多人元素：動畫同步）
        player.isUltimateActive = true;
        player.ultimateEndTime = now + ultimateDurationMs;
        
        // 從 input 獲取 ultimateImageKey（客戶端會在 activateUltimate 時設置）
        if (input && typeof input.ultimateImageKey === 'string') {
          player.ultimateImageKey = input.ultimateImageKey;
        } else {
          // 預設使用 CONFIG.ULTIMATE.IMAGE_KEY（如果客戶端沒有傳）
          // 注意：伺服器端無法直接訪問 CONFIG，所以這裡使用預設值
          player.ultimateImageKey = 'player_ultimate'; // 預設值，客戶端會覆蓋
        }
        
        // 體型變化（從 input 獲取，或使用預設倍率）
        const sizeMultiplier = (input && typeof input.sizeMultiplier === 'number') ? input.sizeMultiplier : 1.5;
        const baseWidth = player._originalWidth || player.width || 32;
        const baseHeight = player._originalHeight || player.height || 32;
        player.width = Math.floor(baseWidth * sizeMultiplier);
        player.height = Math.floor(baseHeight * sizeMultiplier);
        player.collisionRadius = Math.max(player.width, player.height) / 2;
      } catch (_) { }
    }
    // 非變身型大招（鳳梨、艾比、森森鈴蘭）不設置 isUltimateActive，因為它們不會變身
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

    // ✅ 多人元素：救援/復活（伺服器權威；客戶端只顯示）
    this.updateResurrections(deltaTime);

    // ✅ 伺服器權威：BOSS/HUMAN2 遠程投射物（火彈/瓶子）
    this.updateBossProjectiles(deltaTime);

    // ✅ 伺服器權威：修羅彈幕（ASURA）
    this.updateBullets(deltaTime);

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
    if (this.config) {
      this.spawnEnemies(now, this.config);
    } else {
      // ⚠️ 調試：確認為什麼沒有 CONFIG
      if (!this._configWarningShown) {
        this._configWarningShown = true;
        console.warn(`[GameState.update] 沒有 CONFIG，無法生成敵人。players.size=${this.players.size}, wave=${this.wave}`);
      }
    }

    // ✅ 服务器权威：生成路口车辆（仅路口地图，仅多人模式）
    // 注意：服务器端只在多人模式下生成车辆，单机模式由客户端生成
    if (this.selectedMap && this.selectedMap.id === 'intersection' && this.players.size > 0) {
      this.spawnCarHazards(now);
    }

    // ✅ 與單機一致：第 1 波固定生成一隻小BOSS；之後每波開始都會生成一隻
    // 單機依據：js/wave.js init() 與 nextWave() 都會呼叫 spawnMiniBoss()
    // ⚠️ 修復：確保第一波生成小BOSS（在 update 中檢查，確保每次更新都會檢查）
    try {
      if (this.config && this.wave === 1 && this.minibossSpawnedForWave === false) {
        this.spawnMiniBoss(this.config);
        this.minibossSpawnedForWave = true;
        console.log('[GameState.update] ✅ 第一波生成小BOSS');
      }
    } catch (e) {
      console.error('[GameState.update] ❌ 生成第一波小BOSS失敗:', e);
    }

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

  updateResurrections(deltaTime) {
    const dt = Math.max(0, (typeof deltaTime === 'number') ? deltaTime : 16.67);
    const rescueRadius = 52; // 與 client: (collisionRadius||26)*2 同源
    const progressPerMs = 0.01; // +10%/sec（修正舊註解意圖；仍是多人增量功能）

    for (const dead of this.players.values()) {
      if (!dead || !dead.isDead || dead.health > 0) continue;

      let rescuer = null;
      let minDist = Infinity;
      for (const p of this.players.values()) {
        if (!p || p === dead || p.isDead || p.health <= 0) continue;
        const dx = p.x - dead.x;
        const dy = p.y - dead.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= rescueRadius && dist < minDist) {
          minDist = dist;
          rescuer = p;
        }
      }

      if (rescuer) {
        dead.resurrectionRescuerUid = rescuer.uid;
        dead.resurrectionProgress = Math.min(100, (dead.resurrectionProgress || 0) + progressPerMs * dt);
        if (dead.resurrectionProgress >= 100) {
          dead.isDead = false;
          dead.health = dead.maxHealth || 200;
          dead.resurrectionProgress = 0;
          dead.resurrectionRescuerUid = null;
        }
      } else {
        dead.resurrectionRescuerUid = null;
        // 不倒退進度（同 client 舊邏輯：保持當前進度）
        if (typeof dead.resurrectionProgress !== 'number') dead.resurrectionProgress = 0;
      }
    }
  }

  // 更新玩家状态
  updatePlayers(deltaTime) {
    const now = Date.now();
    for (const player of this.players.values()) {
      // 能量恢复
      if (player.energy < player.maxEnergy) {
        player.energy = Math.min(player.maxEnergy, player.energy + 1 * (deltaTime / 1000));
      }
      
      // ⚠️ 修復：生命自然恢復（與單機一致：每5秒+1，受回血速度倍率影響）
      if (player.health < player.maxHealth) {
        if (!player._healthRegenAccumulator) player._healthRegenAccumulator = 0;
        const regenMul = (player.meta && typeof player.meta.healthRegenSpeedMultiplier === 'number') 
          ? player.meta.healthRegenSpeedMultiplier 
          : 1.0;
        const regenInterval = (player.meta && typeof player.meta.healthRegenIntervalMs === 'number')
          ? player.meta.healthRegenIntervalMs
          : 5000; // 默認 5 秒
        const effectiveInterval = regenInterval / Math.max(1.0, regenMul);
        player._healthRegenAccumulator += deltaTime;
        if (player._healthRegenAccumulator >= effectiveInterval) {
          const ticks = Math.floor(player._healthRegenAccumulator / effectiveInterval);
          player._healthRegenAccumulator -= ticks * effectiveInterval;
          player.health = Math.min(player.maxHealth, player.health + ticks);
        }
      } else {
        // 滿血時重置計時器
        player._healthRegenAccumulator = 0;
      }
      
      // ✅ 多人元素：大招結束時清理狀態（讓所有客戶端看到大招結束）
      if (player.isUltimateActive && typeof player.ultimateEndTime === 'number' && now >= player.ultimateEndTime) {
        player.isUltimateActive = false;
        player.ultimateImageKey = null;
        player.ultimateEndTime = 0;
        // 恢復原始體型（從客戶端同步，或使用預設值）
        // 注意：實際的武器恢復、屬性恢復等是單機元素，由客戶端自己處理
        // 這裡只處理多人元素（視覺狀態同步）
        if (typeof player._originalWidth === 'number' && player._originalWidth > 0) {
          player.width = player._originalWidth;
        }
        if (typeof player._originalHeight === 'number' && player._originalHeight > 0) {
          player.height = player._originalHeight;
        }
        if (typeof player._originalCollisionRadius === 'number' && player._originalCollisionRadius > 0) {
          player.collisionRadius = player._originalCollisionRadius;
        }
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
          // ✅ 使用 player.meta.critChanceBonusPct（持續同步的爆擊率）
          const projPlayer = this.players.get(proj.playerUid);
          const hit = this._computeHit(proj.damage, proj, projPlayer);
          this.damageEnemy(enemy, hit.amount, { sourceUid: proj.playerUid });
          // ✅ 單機同源：命中後吸血（不獸控制）
          this._applyLifesteal(proj.playerUid, hit.amount);
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
      const playerCount = this.players.size;
      let alivePlayerCount = 0;
      for (const player of this.players.values()) {
        if (!player) continue;
        if (player.isDead || player.health <= 0) {
          continue;
        }
        alivePlayerCount++;
        // ⚠️ 修复：确保玩家位置有效（不是 NaN 或 undefined）
        if (typeof player.x !== 'number' || typeof player.y !== 'number' || isNaN(player.x) || isNaN(player.y)) {
          console.warn(`[GameState.updateEnemies] ⚠️ 玩家 ${player.uid} 位置无效: x=${player.x}, y=${player.y}`);
          continue;
        }
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestPlayer = player;
        }
      }
      
      // ⚠️ 调试：如果找不到玩家，记录日志
      if (!nearestPlayer && playerCount > 0) {
        if (alivePlayerCount === 0) {
          console.warn(`[GameState.updateEnemies] ⚠️ 敌人 ${enemy.id} 找不到活着的玩家（总玩家数: ${playerCount}，活着: ${alivePlayerCount}）`);
        } else {
          console.warn(`[GameState.updateEnemies] ⚠️ 敌人 ${enemy.id} 找不到玩家（总玩家数: ${playerCount}，活着: ${alivePlayerCount}，但位置可能无效）`);
        }
      }

      // 敌人移动（服务器权威）
      if (nearestPlayer) {
        const angle = Math.atan2(nearestPlayer.y - enemy.y, nearestPlayer.x - enemy.x);
        const speed = enemy.speed || 2;
        const deltaMul = deltaTime / 16.67;
        
        // ⚠️ 修復：計算候選位置（分軸移動，檢查障礙物碰撞）
        const candX = enemy.x + Math.cos(angle) * speed * deltaMul;
        const candY = enemy.y + Math.sin(angle) * speed * deltaMul;
        
        // ✅ 檢查障礙物碰撞（與單機模式一致）
        // ⚠️ 修復：障礙物是中心坐標（obs.x, obs.y 是中心），需要轉換為矩形邊界
        const enemySize = enemy.size || 32;
        const enemyRadius = enemySize / 2;
        const blockedByObs = (nx, ny) => {
          for (const obs of this.obstacles || []) {
            // ⚠️ 修復：障礙物是中心坐標，需要轉換為矩形邊界
            // 單機模式：obstacle.js 中，obs.x, obs.y 是中心，width/height 是尺寸
            const obsHalfW = (obs.width || 150) / 2;
            const obsHalfH = (obs.height || 150) / 2;
            const obsLeft = obs.x - obsHalfW;
            const obsRight = obs.x + obsHalfW;
            const obsTop = obs.y - obsHalfH;
            const obsBottom = obs.y + obsHalfH;
            // 使用圓-矩形碰撞檢測（與單機模式一致）
            const dx = Math.max(obsLeft, Math.min(nx, obsRight)) - nx;
            const dy = Math.max(obsTop, Math.min(ny, obsBottom)) - ny;
            if ((dx * dx + dy * dy) < (enemyRadius * enemyRadius)) {
              return true;
            }
          }
          return false;
        };
        
        // 嘗試X軸位移（僅檢查障礙物）
        if (!blockedByObs(candX, enemy.y)) {
          enemy.x = candX;
        }
        // 嘗試Y軸位移（僅檢查障礙物）
        if (!blockedByObs(enemy.x, candY)) {
          enemy.y = candY;
        }

        // ✅ 敌人边界检查（防止敌人移动到世界外）
        const worldWidth = this.worldWidth || 1920;
        const worldHeight = this.worldHeight || 1080;
        const margin = 100; // 允许敌人稍微超出边界（用于生成和移动）
        enemy.x = Math.max(-margin, Math.min(worldWidth + margin, enemy.x));
        enemy.y = Math.max(-margin, Math.min(worldHeight + margin, enemy.y));

        // ✅ 服务器权威：敌人攻击玩家（碰撞检测和伤害计算）
        const enemySizeForCollision = enemy.size || 32;
        const playerSize = 32; // 默认玩家大小
        const collisionRadius = (enemySizeForCollision / 2) + (playerSize / 2);

        if (nearestDist < collisionRadius) {
          // 检查攻击冷却
          if (now - enemy.lastAttackTime >= enemy.attackCooldown) {
            // ✅ 單機同源：受傷無敵/迴避/防禦（由 player-meta 提供最終值）
            this._applyDamageToPlayer(nearestPlayer, enemy.damage, { ignoreDodge: false, ignoreInvulnerability: false });
            enemy.lastAttackTime = now;

            // 检查玩家是否死亡
            if (nearestPlayer.health <= 0) {
              nearestPlayer.health = 0;
              nearestPlayer.isDead = true;
              // ✅ 死亡時重置救援進度（避免殘留）
              try {
                nearestPlayer.resurrectionProgress = 0;
                nearestPlayer.resurrectionRescuerUid = null;
              } catch (_) { }
            }
          }
        }

        // ✅ 伺服器權威：遠程攻擊（火彈/瓶子）— 與單機 Enemy.updateRangedAttack 同源
        try {
          if (enemy.rangedAttack && nearestDist <= (enemy.rangedAttack.RANGE || 0)) {
            if (!enemy.lastRangedAttackAt) enemy.lastRangedAttackAt = 0;
            const cd = enemy.rangedAttack.COOLDOWN || 0;
            if (cd > 0 && now - enemy.lastRangedAttackAt >= cd) {
              this._spawnBossProjectile(enemy, nearestPlayer, deltaTime);
              enemy.lastRangedAttackAt = now;
            }
          }
        } catch (_) { }
      }
    }
  }

  // 生成敌人（服务器权威）
  // 注意：服务器端需要CONFIG数据，但Node.js无法直接访问客户端CONFIG
  // 解决方案：将CONFIG数据作为参数传入，或从客户端同步
  spawnEnemies(now, config = null) {
    // ⚠️ 調試：檢查敵人生成條件
    if (!this.lastEnemySpawnTime) {
      this.lastEnemySpawnTime = now; // 初始化
      console.log(`[GameState.spawnEnemies] 初始化 lastEnemySpawnTime=${now}, enemySpawnRate=${this.enemySpawnRate}`);
    }
    
    const timeSinceLastSpawn = now - this.lastEnemySpawnTime;
    if (timeSinceLastSpawn < this.enemySpawnRate) {
      // ⚠️ 調試：確認為什麼不生成敵人
      if (this.enemies.length === 0 && timeSinceLastSpawn > 1000) {
        console.log(`[GameState.spawnEnemies] 等待生成敵人: timeSinceLastSpawn=${timeSinceLastSpawn}ms, enemySpawnRate=${this.enemySpawnRate}ms, enemies.length=${this.enemies.length}`);
      }
      return;
    }

    this.lastEnemySpawnTime = now;
    console.log(`[GameState.spawnEnemies] 準備生成敵人: config=${!!config}, enemies.length=${this.enemies.length}`);

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

      // ✅ 同源：遠程攻擊（困難以上/特殊例外）由伺服器權威處理
      const rangedAttack = this._shouldEnableRanged(enemyType, enemyConfig) ? (enemyConfig.RANGED_ATTACK || null) : null;

      this.enemies.push({
        id: `enemy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        x, y,
        type: enemyType,
        health: health,
        maxHealth: health,
        speed: enemyConfig.SPEED || 2,
        size: enemyConfig.SIZE || 32,
        experienceValue: enemyConfig.EXPERIENCE || 5,
        isDead: false,
        damage: (typeof enemyConfig.DAMAGE === 'number') ? enemyConfig.DAMAGE : 10,
        rangedAttack,
        lastRangedAttackAt: 0
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

    const rangedAttack = this._shouldEnableRanged(type, enemyConfig) ? (enemyConfig.RANGED_ATTACK || null) : null;
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
      damage: (typeof enemyConfig.DAMAGE === 'number') ? enemyConfig.DAMAGE : 20,
      rangedAttack,
      lastRangedAttackAt: 0
    });
    // ✅ 修羅彈幕：為每隻小BOSS掛載彈幕發射器（同源 wave.js）
    try {
      const last = this.enemies[this.enemies.length - 1];
      this._ensureBulletEmitterForEnemy(last, 'MINI_BOSS');
    } catch (_) { }
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

    const rangedAttack = this._shouldEnableRanged(type, enemyConfig) ? (enemyConfig.RANGED_ATTACK || null) : null;
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
      damage: (typeof enemyConfig.DAMAGE === 'number') ? enemyConfig.DAMAGE : 50,
      rangedAttack,
      lastRangedAttackAt: 0
    });
    // ✅ 修羅彈幕：Boss 出現後啟動環狀旋轉彈幕（同源 wave.js）
    try {
      const last = this.enemies[this.enemies.length - 1];
      this._ensureBulletEmitterForEnemy(last, 'BOSS');
    } catch (_) { }
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
          // ✅ 流量優化：音效是單機元素，不需要通過伺服器發送（節省流量）
          // 客戶端會在本地播放音效：當伺服器同步 experience 時，客戶端 handleServerGameState 會調用
          // Game.player.gainExperience(deltaExp)，在 gainExperience() 中播放 collect_exp 音效
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
      // ⚠️ 修復：重置小BOSS生成標記，讓新波次可以生成小BOSS
      this.minibossSpawnedForWave = false;

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
    // ⚠️ 修复：如果没有玩家，直接返回（避免空房间触发游戏结束）
    if (this.players.size === 0) return;

    // 检查所有玩家是否死亡
    let allDead = true;
    for (const player of this.players.values()) {
      if (!player || !player.isDead || player.health > 0) {
        // ⚠️ 修复：检查 player 是否存在，以及 isDead 是否为 true
        // 如果玩家存在且未死亡（isDead 为 false 或 health > 0），则不是全灭
        if (player && (!player.isDead || player.health > 0)) {
          allDead = false;
          break;
        }
      }
    }

    // ✅ 修复：当所有玩家死亡时，设置 isGameOver 并标记需要广播事件
    // ⚠️ 修复：确保至少有一个玩家，且所有玩家都死亡
    if (allDead && this.players.size > 0 && !this.isGameOver) {
      this.isGameOver = true;
      this._shouldBroadcastGameOver = true; // 标记需要广播 game_over 事件
      console.log(`[GameState.checkGameOver] ✅ 游戏结束：所有玩家死亡 (players.size=${this.players.size})`);
    }
  }

  // 设置障碍物（从客户端同步）
  setObstacles(obstacles) {
    // ⚠️ 修复：如果当前 sessionId 为空，说明是新游戏开始前，忽略旧数据
    // 这样可以防止上一局的地图数据污染新游戏
    if (!this.currentSessionId) {
      console.log(`[GameState.setObstacles] 忽略障碍物数据：当前 sessionId 为空，可能是新游戏开始前`);
      return;
    }
    // ⚠️ 修复：时间窗口机制 - 在收到 new-session 后的 2 秒内，忽略旧的 obstacles 数据
    // 这样可以防止上一局的地图数据在 new-session 之后才到达服务器，被误接受
    if (this._newSessionTime && (Date.now() - this._newSessionTime) < 2000) {
      console.log(`[GameState.setObstacles] 忽略障碍物数据：在 new-session 后的 2 秒时间窗口内，可能是上一局的数据`);
      return;
    }
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
    // ⚠️ 修复：如果当前 sessionId 为空，说明是新游戏开始前，忽略旧数据
    // 这样可以防止上一局的地图数据污染新游戏
    if (!this.currentSessionId) {
      console.log(`[GameState.setDecorations] 忽略装饰数据：当前 sessionId 为空，可能是新游戏开始前`);
      return;
    }
    // ⚠️ 修复：时间窗口机制 - 在收到 new-session 后的 2 秒内，忽略旧的 decorations 数据
    // 这样可以防止上一局的地图数据在 new-session 之后才到达服务器，被误接受
    if (this._newSessionTime && (Date.now() - this._newSessionTime) < 2000) {
      console.log(`[GameState.setDecorations] 忽略装饰数据：在 new-session 后的 2 秒时间窗口内，可能是上一局的数据`);
      return;
    }
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
            // ✅ 單機同源：車輛屬於環境重擊
            // - 忽略受傷短暫無敵（HIT_FLASH），避免「撞到但不扣血」
            // - 忽略閃避（抽象化/天賦），避免環境傷害被迴避
            // - 仍尊重技能無敵（INVINCIBLE）由 _applyDamageToPlayer 內部處理
            this._applyDamageToPlayer(player, (car.damage || 100), { ignoreInvulnerability: true, ignoreDodge: true });
            car.hitPlayer = true;

            // ✅ 修复：广播车辆撞击事件（音效+特效是多人元素，需要同步）
            // 音效是单机元素，但特效（爆炸粒子、屏幕白闪）需要同步
            try {
              this.vfxEvents.push({
                type: 'car_hit',
                data: {
                  playerUid: player.uid || null,
                  x: player.x || car.x,
                  y: player.y || car.y,
                  timestamp: Date.now()
                }
              });
            } catch (_) {}

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
    
    // ✅ 修复：广播车辆生成音效事件（音效是单机元素，但需要通知客户端播放）
    // 注意：音效是单机元素，但服务器需要通知客户端在车辆生成时播放音效
    try {
      this.vfxEvents.push({
        type: 'car_spawn',
        timestamp: now
      });
    } catch (_) {}

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
      // ✅ 多人元素（省流量）：只下發客戶端渲染/同步真正需要的欄位
      // - 避免把 server internal/meta/weapons 等一起塞進 game-state，造成流量膨脹與前端負擔
      // - 不影響單機存檔/引繼碼（本檔案僅用於組隊 WS）
      players: Array.from(this.players.entries()).map(([uid, p]) => {
        // ✅ 單機同源：計算 experienceToNextLevel（使用與單機相同的算法）
        const experienceToNextLevel = this._computeExperienceToNextLevel(p.level);
        return {
          uid,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          facing: p.facing,
          health: p.health,
          maxHealth: p.maxHealth,
          energy: p.energy,
          maxEnergy: p.maxEnergy,
          level: p.level,
          experience: p.experience,
          experienceToNextLevel: experienceToNextLevel, // ✅ 新增：同步經驗升級算法
          sessionCoins: p.sessionCoins,
          isDead: p.isDead,
          resurrectionProgress: p.resurrectionProgress,
          resurrectionRescuerUid: p.resurrectionRescuerUid,
          characterId: p.characterId,
          nickname: p.nickname,
          // ✅ 多人元素：大招動畫狀態（讓所有客戶端能看到其他玩家的大招變身效果）
          isUltimateActive: (typeof p.isUltimateActive === 'boolean') ? p.isUltimateActive : false,
          ultimateImageKey: (typeof p.ultimateImageKey === 'string' && p.ultimateImageKey) ? p.ultimateImageKey : null,
          ultimateEndTime: (typeof p.ultimateEndTime === 'number') ? p.ultimateEndTime : 0,
          // ✅ 多人元素：體型變化（大招變身時的視覺效果）
          width: (typeof p.width === 'number' && p.width > 0) ? p.width : null,
          height: (typeof p.height === 'number' && p.height > 0) ? p.height : null,
          collisionRadius: (typeof p.collisionRadius === 'number' && p.collisionRadius > 0) ? p.collisionRadius : null
        };
      }),
      enemies: this.enemies,
      projectiles: this.projectiles,
      bossProjectiles: this.bossProjectiles,
      bullets: this.bullets,
      experienceOrbs: this.experienceOrbs,
      chests: this.chests,
      obstacles: this.obstacles,
      decorations: this.decorations,
      carHazards: this.carHazards,
      exit: this.exit,
      wave: this.wave,
      waveStartTime: this.waveStartTime, // ✅ 單機同源：波次開始時間（用於同步 WaveSystem.waveStartTime）
      isGameOver: this.isGameOver,
      isVictory: this.isVictory,
      gameTime: this.gameTime,
      hitEvents: this.hitEvents
      // ✅ 流量優化：移除 sfxEvents（音效是單機元素，不需要通過伺服器發送）
      ,vfxEvents: this.vfxEvents
    };
    // ✅ transient：broadcast 後清空（下一幀重算）
    this.hitEvents = [];
    // ✅ 流量優化：移除 sfxEvents（音效是單機元素，不需要通過伺服器發送）
    this.vfxEvents = [];
    
    // ✅ 修复：检查是否需要广播 game_over 事件
    const shouldBroadcastGameOver = this._shouldBroadcastGameOver;
    if (this._shouldBroadcastGameOver) {
      this._shouldBroadcastGameOver = false; // 只广播一次
    }
    
    return { state, shouldBroadcastGameOver };
  }
}

module.exports = { GameState };

