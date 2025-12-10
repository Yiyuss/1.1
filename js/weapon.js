// 武器類
class Weapon {
    constructor(player, type) {
        this.player = player;
        this.type = type;
        this.config = CONFIG.WEAPONS[type];
        this.level = 1;
        this.lastFireTime = 0;
        // 初始化為COOLDOWN值，確保新武器可以立即發射（升級時初次選新技能後立即生效）
        this.cooldownAccumulator = this.config.COOLDOWN || 0;
        this._updateFrame = 0; // 追蹤更新幀數，避免雙次更新導致冷卻時間累積兩次
        this.projectileCount = this.config.LEVELS[0].COUNT;
    }
    
    update(deltaTime) {
        // 抽象化是被動技能，不需要發射
        if (this.type === 'ABSTRACTION') {
            return;
        }
        
        // 檢查遊戲是否暫停，如果暫停則不更新冷卻時間（修復ESC暫停取消BUG）
        if (typeof Game !== 'undefined' && Game.isPaused) {
            return;
        }
        
        // 追蹤更新幀數：由於武器更新被調用兩次（保留歷史節奏），只在第一次更新時累積冷卻時間
        // 這樣可以避免冷卻時間被累積兩次導致攻擊速度變成2倍
        this._updateFrame++;
        const isFirstUpdate = (this._updateFrame % 2 === 1);
        
        // 只在第一次更新時累積冷卻時間
        if (isFirstUpdate) {
            // 使用累積時間而非絕對時間，確保暫停時冷卻時間不會繼續計時
            this.cooldownAccumulator += deltaTime;
        }
        
        // 檢查是否可以發射（兩次更新都檢查，但只在第一次累積時間）
        if (this.cooldownAccumulator >= this.config.COOLDOWN) {
            this.fire();
            this.cooldownAccumulator = 0; // 重置累積時間
        }
    }
    
    // 發射投射物
    fire() {
        const levelMul = (typeof DamageSystem !== 'undefined')
            ? DamageSystem.levelMultiplier(this.level)
            : (1 + 0.05 * Math.max(0, this.level - 1));
        // 特殊技能：無敵（不造成傷害，給予玩家短暫無敵並顯示護盾特效）
        if (this.type === 'INVINCIBLE') {
            const seconds = 2.0 + 0.2 * Math.max(0, this.level - 1);
            const durationMs = Math.round(seconds * 1000);
            try {
                if (this.player && typeof this.player.applyInvincibility === 'function') {
                    this.player.applyInvincibility(durationMs);
                } else if (this.player) {
                    // 後備：直接設定玩家無敵並產生視覺覆蓋
                    this.player.isInvulnerable = true;
                    this.player.invulnerabilityTime = 0;
                    this.player.invulnerabilityDuration = durationMs;
                    this.player.invulnerabilitySource = 'INVINCIBLE';
                    if (typeof InvincibleEffect !== 'undefined') {
                        const effect = new InvincibleEffect(this.player, durationMs);
                        Game.addProjectile(effect);
                    }
                }
            } catch (_) {}
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound('invincible_activate');
            }
            return;
        }
        // 特殊技能：唱歌（不造成傷害，恢復HP並產生音符特效）
        if (this.type === 'SING') {
            const heal = this.level;
            this.player.health = Math.min(this.player.maxHealth, this.player.health + heal);
            if (typeof UI !== 'undefined') {
                UI.updateHealthBar(this.player.health, this.player.maxHealth);
            }
            const effect = new SingEffect(this.player, this.config.DURATION || 1000);
            Game.addProjectile(effect);
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound('sing_cast');
            }
            return;
        }
        // 特殊技能：幼妲光輝（不造成傷害，恢復HP並產生聖光特效）
        if (this.type === 'YOUNG_DADA_GLORY') {
            const heal = this.level;
            this.player.health = Math.min(this.player.maxHealth, this.player.health + heal);
            if (typeof UI !== 'undefined') {
                UI.updateHealthBar(this.player.health, this.player.maxHealth);
            }
            const effect = new YoungDadaGloryEffect(this.player, this.config.DURATION || 2000);
            Game.addProjectile(effect);
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound('sing_cast'); // 使用與唱歌相同的音效
            }
            return;
        }

        // 融合技能：幼妲天使（超級加強版，每5秒補血並產生華麗聖光特效）
        if (this.type === 'FRENZY_YOUNG_DADA_GLORY') {
            // 根據等級獲取補血量（LV1~LV10：12, 14, 16, 18, 20, 22, 24, 26, 28, 30）
            const healAmounts = this.config.HEAL_AMOUNTS || [12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
            const heal = healAmounts[Math.min(this.level - 1, healAmounts.length - 1)] || 12;
            
            this.player.health = Math.min(this.player.maxHealth, this.player.health + heal);
            if (typeof UI !== 'undefined') {
                UI.updateHealthBar(this.player.health, this.player.maxHealth);
            }
            
            // 創建超級加強版聖光特效
            const effect = new FrenzyYoungDadaGloryEffect(this.player, this.config.DURATION || 3000);
            Game.addProjectile(effect);
            
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound('sing_cast'); // 使用與唱歌相同的音效
            }
            return;
        }
        // 特殊技能：旋球
        if (this.type === 'ORBIT') {
            const count = this.projectileCount;
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const baseRadius = this.config.ORBIT_RADIUS;
                const perLevel = this.config.ORBIT_RADIUS_PER_LEVEL || 0;
                const dynamicRadius = baseRadius + perLevel * (this.level - 1);
                const baseSize = this.config.PROJECTILE_SIZE;
                const sizePerLevel = this.config.PROJECTILE_SIZE_PER_LEVEL || 0;
                const dynamicSize = baseSize + sizePerLevel * (this.level - 1);
                const orb = new OrbitBall(
                    this.player,
                    angle,
                    dynamicRadius,
                    this._computeFinalDamage(levelMul),
                    dynamicSize,
                    this.config.DURATION,
                    this.config.ANGULAR_SPEED
                );
                Game.addProjectile(orb);
            }
            // 旋球技能不需要追蹤敵人角度，直接返回
            return;
        }
        // 特殊技能：雞腿庇佑（與綿羊護體邏輯相同，但使用不同圖片）
        if (this.type === 'CHICKEN_BLESSING') {
            const count = this.projectileCount;
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const baseRadius = this.config.ORBIT_RADIUS;
                const perLevel = this.config.ORBIT_RADIUS_PER_LEVEL || 0;
                const dynamicRadius = baseRadius + perLevel * (this.level - 1);
                const baseSize = this.config.PROJECTILE_SIZE;
                const sizePerLevel = this.config.PROJECTILE_SIZE_PER_LEVEL || 0;
                const dynamicSize = baseSize + sizePerLevel * (this.level - 1);
                const orb = new OrbitBall(
                    this.player,
                    angle,
                    dynamicRadius,
                    this._computeFinalDamage(levelMul),
                    dynamicSize,
                    this.config.DURATION,
                    this.config.ANGULAR_SPEED,
                    'chicken' // 使用 chicken.png 作為外觀
                );
                Game.addProjectile(orb);
            }
            // 雞腿庇佑技能不需要追蹤敵人角度，直接返回
            return;
        }

        // 特殊技能：旋轉鬆餅（與綿羊護體邏輯相同，但使用不同圖片）
        if (this.type === 'ROTATING_MUFFIN') {
            const count = this.projectileCount;
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const baseRadius = this.config.ORBIT_RADIUS;
                const perLevel = this.config.ORBIT_RADIUS_PER_LEVEL || 0;
                const dynamicRadius = baseRadius + perLevel * (this.level - 1);
                const baseSize = this.config.PROJECTILE_SIZE;
                const sizePerLevel = this.config.PROJECTILE_SIZE_PER_LEVEL || 0;
                const dynamicSize = baseSize + sizePerLevel * (this.level - 1);
                const orb = new OrbitBall(
                    this.player,
                    angle,
                    dynamicRadius,
                    this._computeFinalDamage(levelMul),
                    dynamicSize,
                    this.config.DURATION,
                    this.config.ANGULAR_SPEED,
                    'muffin' // 使用 muffin.png 作為外觀
                );
                Game.addProjectile(orb);
            }
            // 旋轉鬆餅技能不需要追蹤敵人角度，直接返回
            return;
        }

        // 特殊技能：守護領域（常駐場域）
        if (this.type === 'AURA_FIELD') {
            const baseRadius = this.config.FIELD_RADIUS || 60;
            const perLevel = this.config.FIELD_RADIUS_PER_LEVEL || 0;
            const dynamicRadius = baseRadius + perLevel * (this.level - 1);
            const dmg = this._computeFinalDamage(levelMul);
            // 僅首次生成；升級時在 fire 內同步半徑與傷害
            if (!this._auraEntity || this._auraEntity.markedForDeletion) {
                this._auraEntity = new AuraField(this.player, dynamicRadius, dmg);
                Game.addProjectile(this._auraEntity);
            } else {
                // 升級或定期同步最新數值
                this._auraEntity.radius = dynamicRadius;
                this._auraEntity.damage = dmg;
                this._auraEntity.tickDamage = Math.max(1, Math.round(dmg));
            }
            return;
        }

        // 特殊技能：引力波（常駐場域，帶推怪功能）
        if (this.type === 'GRAVITY_WAVE') {
            const baseRadius = this.config.FIELD_RADIUS || 150;
            const perLevel = this.config.FIELD_RADIUS_PER_LEVEL || 0;
            const dynamicRadius = baseRadius + perLevel * (this.level - 1);
            const dmg = this._computeFinalDamage(levelMul);
            // 僅首次生成；升級時在 fire 內同步半徑與傷害
            if (!this._auraEntity || this._auraEntity.markedForDeletion) {
                this._auraEntity = new GravityWaveField(this.player, dynamicRadius, dmg);
                Game.addProjectile(this._auraEntity);
            } else {
                // 升級或定期同步最新數值
                this._auraEntity.radius = dynamicRadius;
                this._auraEntity.damage = dmg;
                this._auraEntity.tickDamage = Math.max(1, Math.round(dmg));
            }
            return;
        }

        // 特殊技能：大波球（灰妲專屬）
        if (this.type === 'BIG_ICE_BALL') {
            // 获取玩家当前画面范围
            const canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : null;
            if (!canvas) return;
            
            const camX = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0;
            const camY = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0;
            const viewportWidth = canvas.width;
            const viewportHeight = canvas.height;
            
            // 计算画面边界（世界坐标）
            const viewportLeft = camX;
            const viewportRight = camX + viewportWidth;
            const viewportTop = camY;
            const viewportBottom = camY + viewportHeight;
            
            // 在玩家附近随机生成目标位置（不超出当前画面）
            const minDistance = 50; // 最小距离
            const maxDistance = Math.min(viewportWidth, viewportHeight) * 0.4; // 最大距离（画面尺寸的40%）
            const angle = Math.random() * Math.PI * 2;
            const distance = minDistance + Math.random() * (maxDistance - minDistance);
            
            let targetX = this.player.x + Math.cos(angle) * distance;
            let targetY = this.player.y + Math.sin(angle) * distance;
            
            // 确保目标位置在画面范围内
            targetX = Math.max(viewportLeft + 50, Math.min(viewportRight - 50, targetX));
            targetY = Math.max(viewportTop + 50, Math.min(viewportBottom - 50, targetY));
            
            // 创建冰弹投射物（从玩家位置发射到目标位置）
            const flightTimeMs = this.config.PROJECTILE_FLIGHT_TIME || 1000;
            const iceBall = new IceBallProjectile(
                this.player.x,
                this.player.y,
                targetX,
                targetY,
                flightTimeMs,
                this.level,
                this.player
            );
            Game.addProjectile(iceBall);
            
            return;
        }

        // 融合技能：狂熱大波（一次丟出5顆，隨機距離加長）
        if (this.type === 'FRENZY_ICE_BALL') {
            // 获取玩家当前画面范围
            const canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : null;
            if (!canvas) return;
            
            const camX = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0;
            const camY = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0;
            const viewportWidth = canvas.width;
            const viewportHeight = canvas.height;
            
            // 计算画面边界（世界坐标）
            const viewportLeft = camX;
            const viewportRight = camX + viewportWidth;
            const viewportTop = camY;
            const viewportBottom = camY + viewportHeight;
            
            // 一次丟出5顆
            const projectileCount = this.config.PROJECTILE_COUNT || 5;
            const flightTimeMs = this.config.PROJECTILE_FLIGHT_TIME || 1000;
            
            for (let i = 0; i < projectileCount; i++) {
                // 随机距离加长：有机会投到更远的地方
                // 基础最大距离是画面尺寸的40%，但有机会达到60%或80%
                const distanceRoll = Math.random();
                let maxDistanceMultiplier = 0.4; // 默认40%
                if (distanceRoll < 0.1) {
                    maxDistanceMultiplier = 0.8; // 10%概率达到80%
                } else if (distanceRoll < 0.4) {
                    maxDistanceMultiplier = 0.6; // 30%概率达到60%（0.1到0.4之间）
                }
                
                const minDistance = 50; // 最小距离
                const maxDistance = Math.min(viewportWidth, viewportHeight) * maxDistanceMultiplier;
                const angle = Math.random() * Math.PI * 2;
                const distance = minDistance + Math.random() * (maxDistance - minDistance);
                
                let targetX = this.player.x + Math.cos(angle) * distance;
                let targetY = this.player.y + Math.sin(angle) * distance;
                
                // 确保目标位置在画面范围内（允许稍微超出以支持更远距离）
                const padding = 100; // 增加padding以支持更远距离
                targetX = Math.max(viewportLeft - padding, Math.min(viewportRight + padding, targetX));
                targetY = Math.max(viewportTop - padding, Math.min(viewportBottom + padding, targetY));
                
                // 创建冰弹投射物（从玩家位置发射到目标位置）
                // 使用固定范围（大波球LV10的156px）
                const iceBall = new IceBallProjectile(
                    this.player.x,
                    this.player.y,
                    targetX,
                    targetY,
                    flightTimeMs,
                    this.level,
                    this.player,
                    true // 标记为狂熱大波，使用固定范围
                );
                Game.addProjectile(iceBall);
            }
            
            return;
        }

        // 特殊技能：雷射
        if (this.type === 'LASER') {
            // 朝最近敵人方向；若無敵人則向右
            const nearestEnemy = this.findNearestEnemy();
            const angle = nearestEnemy ? Utils.angle(this.player.x, this.player.y, nearestEnemy.x, nearestEnemy.y) : 0;
            const baseWidth = this.config.BEAM_WIDTH_BASE || 8;
            const perLevel = this.config.BEAM_WIDTH_PER_LEVEL || 2;
            const widthPx = baseWidth + perLevel * (this.level - 1);
            // LV5: 2條；LV10: 3條
            let beamCount = 1;
            if (this.level >= 10) {
                beamCount = 3;
            } else if (this.level >= 5) {
                beamCount = 2;
            }
            const offsetStep = 0.12; // 約6.9度偏移，避免完全重疊
            const startIndex = -(Math.floor((beamCount - 1) / 2));
            for (let b = 0; b < beamCount; b++) {
                const offset = (b + startIndex) * offsetStep;
                const beam = new LaserBeam(
                    this.player,
                    angle + offset,
                    this._computeFinalDamage(levelMul),
                    widthPx,
                    this.config.DURATION,
                    this.config.TICK_INTERVAL_MS || 120
                );
                Game.addProjectile(beam);
            }
            // 播放雷射音效
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound('laser_shoot');
            }
            return;
        }

        // 特殊技能：斬擊（扇形瞬時傷害，短暫演出）
        if (this.type === 'SLASH') {
            // 改為依玩家朝向施放（不再自動瞄準最近敵人）
            const baseAngle = (this.player && typeof this.player.facingAngle === 'number') ? this.player.facingAngle : 0;
            const baseRadius = this.config.RADIUS_BASE || 72;
            const perLevel = this.config.RADIUS_PER_LEVEL || 0;
            const dynamicRadius = baseRadius + perLevel * (this.level - 1);
            const arcDeg = (this.config.ARC_DEG_BASE || 80) + (this.config.ARC_DEG_PER_LEVEL || 0) * (this.level - 1);
            const durationMs = this.config.DURATION || 800; // 使用配置：0.8秒
            const dmg = this._computeFinalDamage(levelMul);

            // 目前一次生成一個斬擊效果；之後若需要可加入小幅扇形分散
            const effect = new SlashEffect(this.player, baseAngle, dmg, dynamicRadius, arcDeg, durationMs);
            // 放大視覺尺寸但不影響傷害邏輯
            if (typeof this.config.VISUAL_SCALE === 'number') {
                effect.visualScale = this.config.VISUAL_SCALE;
            }
            // 普通斬擊不顯示濺血（僅狂熱斬擊使用濺血疊層）
            effect.hitOverlayImageKey = null;
            Game.addProjectile(effect);
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound('knife');
            }
            return;
        }

        // 融合技能：狂熱斬擊（雙段斬擊：0.5秒間隔，第一段使用普通斬擊範圍、第二段使用狂熱斬擊範圍）
        if (this.type === 'FRENZY_SLASH') {
            const baseAngle = (this.player && typeof this.player.facingAngle === 'number') ? this.player.facingAngle : 0;
            const durationMs = this.config.DURATION || 1200;
            const dmg = this._computeFinalDamage(levelMul);

            // 第一段：使用普通斬擊的範圍（不依等級變化）
            const cfgS = (CONFIG && CONFIG.WEAPONS) ? CONFIG.WEAPONS['SLASH'] : null;
            const radius1 = cfgS ? (cfgS.RADIUS_BASE || 72) : 72;
            const arc1 = cfgS ? (cfgS.ARC_DEG_BASE || 80) : 80;
            const vis1 = cfgS && typeof cfgS.VISUAL_SCALE === 'number' ? cfgS.VISUAL_SCALE : 1.0;
            const effect1 = new SlashEffect(this.player, baseAngle, dmg, radius1, arc1, durationMs);
            effect1.visualScale = vis1;
            // 前景斬擊圖：knife；命中濺血：knife2（SlashEffect 預設）
            effect1.overlayImageKey = 'knife';
            effect1.hitOverlayImageKey = 'knife2';
            Game.addProjectile(effect1);
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound('knife');
            }

            // 第二段：0.5秒後，使用狂熱斬擊的範圍（升級不增範圍）
            // 調整為第一刀的兩倍範圍（半徑與視覺尺寸加倍，角度保持）
            const dynamicRadius2 = radius1 * 2;
            const arcDeg2 = arc1;
            const vis2 = vis1 * 2;
            setTimeout(() => {
                try {
                    const effect2 = new SlashEffect(this.player, baseAngle, dmg, dynamicRadius2, arcDeg2, durationMs);
                    effect2.visualScale = vis2;
                    effect2.overlayImageKey = 'knife';
                    effect2.hitOverlayImageKey = 'knife2';
                    Game.addProjectile(effect2);
                    if (typeof AudioManager !== 'undefined') {
                        AudioManager.playSound('knife');
                    }
                } catch (_) {}
            }, 500);
            return;
        }

        // 特殊技能：心靈魔法（唱歌進階版：治療 + 心靈震波）
        if (this.type === 'MIND_MAGIC') {
            // 1) 立即治療：LV1~LV10 = +12, +14, ..., +30（公式：10 + 2*LV）
            const heal = 10 + 2 * Math.max(1, this.level);
            this.player.health = Math.min(this.player.maxHealth, this.player.health + heal);
            if (typeof UI !== 'undefined') {
                UI.updateHealthBar(this.player.health, this.player.maxHealth);
            }

            // 2) 播放唱歌視覺特效（沿用 SingEffect），持續與唱歌一致
            const singDuration = this.config.DURATION || 2000;
            try {
                const singEffect = new SingEffect(this.player, singDuration);
                Game.addProjectile(singEffect);
            } catch (_) {}

            // 3) 施放心靈震波（範圍沿用現有邏輯），命中自帶緩速在 shockwave.js
            const baseRadius = this.config.WAVE_MAX_RADIUS_BASE || 220;
            const perLevel = this.config.WAVE_RADIUS_PER_LEVEL || 0;
            const dynamicRadius = baseRadius + perLevel * (this.level - 1);
            const ringWidth = this.config.WAVE_THICKNESS || 18;
            const durationMs = this.config.DURATION || 2000;
            const dmg = this._computeFinalDamage(levelMul);
            const wave = new ShockwaveEffect(this.player, dmg, durationMs, dynamicRadius, ringWidth);
            Game.addProjectile(wave);

            // 4) 音效：沿用唱歌音效（避免重複，震波不再自行播放）
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound('sing_cast');
            }
            return;
        }

        // 特殊技能：連鎖閃電（1秒內依序連鎖 N 次）
        if (this.type === 'CHAIN_LIGHTNING') {
            const chainCount = this.projectileCount; // 依照等級的 COUNT 當作連鎖次數
            const effect = new ChainLightningEffect(
                this.player,
                this._computeFinalDamage(levelMul),
                this.config.DURATION || 1000,
                chainCount,
                this.config.CHAIN_RADIUS || 220
            );
            Game.addProjectile(effect);
            // 音效在效果物件中觸發一次（zaps）
            return;
        }
        // 融合：狂熱雷擊（同時間分散 10 條分支，每條保留 LV10 連鎖）
        if (this.type === 'FRENZY_LIGHTNING') {
            const branchCount = this.projectileCount; // 設定檔固定為 10
            const durationMs = this.config.DURATION || 1000;
            const chainRadius = this.config.CHAIN_RADIUS || 220; // 縮短觸發半徑，避免電到螢幕外
            const chainsPerBranch = 10; // LV10 的連鎖段數（含第一段）
            const dmg = this._computeFinalDamage(levelMul);
            // 狂熱雷擊專用：紅色調色盤，不影響原本連鎖閃電藍色
            const frenzyPalette = { halo: '#ff6b6b', mid: '#ff4444', core: '#ffffff', particle: '#ff4444' };
            // 就近觸發：若半徑內沒有敵人，則不釋放效果
            let nearest = null; let bestDist = Infinity;
            for (const enemy of (Game.enemies || [])) {
                if (!enemy || enemy.markedForDeletion || enemy.health <= 0) continue;
                const d = Utils.distance(this.player.x, this.player.y, enemy.x, enemy.y);
                if (d < bestDist) { bestDist = d; nearest = enemy; }
            }
            if (!nearest || bestDist > chainRadius) {
                return; // 無近距離目標：不施放
            }
            const effect = new FrenzyLightningEffect(
                this.player,
                dmg,
                durationMs,
                branchCount,
                chainsPerBranch,
                chainRadius,
                frenzyPalette
            );
            Game.addProjectile(effect);
            return;
        }
        // 閃電（追蹤且分配唯一目標，避免重疊）
        if (this.type === 'LIGHTNING') {
            const count = this.projectileCount;
            const baseSize = this.config.PROJECTILE_SIZE;
            const sizePerLevel = this.config.PROJECTILE_SIZE_PER_LEVEL || 0;
            const dynamicSize = baseSize + sizePerLevel * (this.level - 1);

            // 取距離玩家最近的前 count 名敵人作為目標
            const sorted = [...(Game.enemies || [])].sort((a, b) => {
                const da = Utils.distance(this.player.x, this.player.y, a.x, a.y);
                const db = Utils.distance(this.player.x, this.player.y, b.x, b.y);
                return da - db;
            });
            const targets = sorted.slice(0, count);

            for (let i = 0; i < count; i++) {
                const target = targets[i] || null;
                let angle;
                if (target) {
                    const baseAngle = Utils.angle(this.player.x, this.player.y, target.x, target.y);
                    // 為每道閃電加入微小抖動，避免軌跡完全重疊
                    const jitter = (Math.random() - 0.5) * 0.20; // ±0.1rad
                    angle = baseAngle + jitter;
                } else {
                    // 沒有足夠目標時，平均分布在360度
                    angle = (i / Math.max(1, count)) * Math.PI * 2;
                }

                // 起始位置稍作偏移，避免完全疊在玩家身上
                const spawnOffset = 12;
                const sx = this.player.x + Math.cos(angle) * spawnOffset;
                const sy = this.player.y + Math.sin(angle) * spawnOffset;
                const projectile = new Projectile(
                    sx,
                    sy,
                    angle,
                    this.type,
                    this._computeFinalDamage(levelMul),
                    this.config.PROJECTILE_SPEED,
                    dynamicSize
                );
                projectile.homing = true;
                projectile.turnRatePerSec = this.level >= 10 ? 6.0 : 3.5; // rad/s
                if (target) {
                    projectile.assignedTargetId = target.id;
                }
                Game.addProjectile(projectile);

                // 音效（發射一次）
                if (i === 0 && typeof AudioManager !== 'undefined') {
                    AudioManager.playSound('lightning_shoot');
                }
            }
            return;
        }

        // 鬆餅投擲（與追蹤綿羊邏輯相同，但使用不同圖片）
        if (this.type === 'MUFFIN_THROW') {
            const count = this.projectileCount;
            const baseSize = this.config.PROJECTILE_SIZE;
            const sizePerLevel = this.config.PROJECTILE_SIZE_PER_LEVEL || 0;
            const dynamicSize = baseSize + sizePerLevel * (this.level - 1);

            // 取距離玩家最近的前 count 名敵人作為目標
            const sorted = [...(Game.enemies || [])].sort((a, b) => {
                const da = Utils.distance(this.player.x, this.player.y, a.x, a.y);
                const db = Utils.distance(this.player.x, this.player.y, b.x, b.y);
                return da - db;
            });
            const targets = sorted.slice(0, count);

            for (let i = 0; i < count; i++) {
                const target = targets[i] || null;
                let angle;
                if (target) {
                    const baseAngle = Utils.angle(this.player.x, this.player.y, target.x, target.y);
                    // 為每個鬆餅加入微小抖動，避免軌跡完全重疊
                    const jitter = (Math.random() - 0.5) * 0.20; // ±0.1rad
                    angle = baseAngle + jitter;
                } else {
                    // 沒有足夠目標時，平均分布在360度
                    angle = (i / Math.max(1, count)) * Math.PI * 2;
                }

                // 起始位置稍作偏移，避免完全疊在玩家身上
                const spawnOffset = 12;
                const sx = this.player.x + Math.cos(angle) * spawnOffset;
                const sy = this.player.y + Math.sin(angle) * spawnOffset;
                const projectile = new Projectile(
                    sx,
                    sy,
                    angle,
                    this.type,
                    this._computeFinalDamage(levelMul),
                    this.config.PROJECTILE_SPEED,
                    dynamicSize
                );
                projectile.homing = true;
                projectile.turnRatePerSec = this.level >= 10 ? 6.0 : 3.5; // rad/s
                if (target) {
                    projectile.assignedTargetId = target.id;
                }
                Game.addProjectile(projectile);

                // 音效（發射一次，使用與追蹤綿羊相同的音效）
                if (i === 0 && typeof AudioManager !== 'undefined') {
                    AudioManager.playSound('lightning_shoot');
                }
            }
            return;
        }

        // 一般投射武器：根據武器等級發射不同數量的投射物
        for (let i = 0; i < this.projectileCount; i++) {
            let angle;
            
            // 找到最近的敵人
            const nearestEnemy = this.findNearestEnemy();
            
            // 無論投射物數量如何，都優先追蹤敵人
            if (nearestEnemy) {
                // 基礎角度是朝向最近敵人的方向
                const baseAngle = Utils.angle(this.player.x, this.player.y, nearestEnemy.x, nearestEnemy.y);
                
                if (this.projectileCount === 1) {
                    // 單個投射物直接朝敵人發射
                    angle = baseAngle;
                } else {
                    // 多個投射物也朝敵人方向發射，但有小角度差異
                    const spreadAngle = Math.PI / 6; // 30度扇形，比原來小一些
                    const startAngle = baseAngle - spreadAngle / 2;
                    angle = startAngle + (spreadAngle / (this.projectileCount - 1)) * i;
                }
            } else {
                // 如果沒有敵人，則向右發射，或者呈扇形發射
                if (this.projectileCount === 1) {
                    angle = 0; // 向右
                } else {
                    const spreadAngle = Math.PI / 4; // 45度扇形
                    const startAngle = -spreadAngle / 2;
                    angle = startAngle + (spreadAngle / (this.projectileCount - 1)) * i;
                }
            }
            
            // 創建投射物
            const baseSize = this.config.PROJECTILE_SIZE;
            const sizePerLevel = this.config.PROJECTILE_SIZE_PER_LEVEL || 0;
            const dynamicSize = baseSize + sizePerLevel * (this.level - 1);
            // 起始位置小偏移，避免完全重疊
            const spawnOffset = 8;
            const sx = this.player.x + Math.cos(angle) * spawnOffset;
            const sy = this.player.y + Math.sin(angle) * spawnOffset;
            const projectile = new Projectile(
                sx,
                sy,
                angle,
                this.type,
                this._computeFinalDamage(levelMul),
                this.config.PROJECTILE_SPEED,
                dynamicSize
            );
            // 新增：把玩家的爆擊加成帶到投射物，避免在計算時拿不到玩家
            projectile.critChanceBonusPct = ((this.player && this.player.critChanceBonusPct) || 0);
            Game.addProjectile(projectile);

            // 觸發音效（每次發射只播放一次即可）
            if (i === 0 && typeof AudioManager !== 'undefined') {
                switch (this.type) {
                    case 'DAGGER':
                        AudioManager.playSound('dagger_shoot');
                        break;
                    case 'FIREBALL':
                        AudioManager.playSound('fireball_shoot');
                        break;
                    case 'LIGHTNING':
                        // 閃電在專用邏輯中已播放
                        break;
                    case 'MUFFIN_THROW':
                        // 鬆餅投擲在專用邏輯中已播放
                        break;
                    case 'ORBIT':
                        // 可選：為旋球加入音效
                        break;
                    case 'CHICKEN_BLESSING':
                        // 可選：為雞腿庇佑加入音效
                        break;
                    case 'ROTATING_MUFFIN':
                        // 可選：為旋轉鬆餅加入音效
                        break;
                }
            }
        }
    }
    
    // 尋找最近的敵人
    findNearestEnemy() {
        let nearestEnemy = null;
        let minDistance = Infinity;
        
        for (const enemy of Game.enemies) {
            const distance = Utils.distance(this.player.x, this.player.y, enemy.x, enemy.y);
            if (distance < minDistance) {
                minDistance = distance;
                nearestEnemy = enemy;
            }
        }
        
        return nearestEnemy;
    }
    
    // 升級武器
    levelUp() {
        if (this.level < this.config.LEVELS.length) {
            this.level++;
            this.projectileCount = this.config.LEVELS[this.level - 1].COUNT;
        }
    }
    
    // 獲取武器描述
    getDescription() {
        return {
            name: this.config.NAME,
            level: this.level,
            description: this.config.LEVELS[this.level - 1].DESCRIPTION
        };
    }
    
    // 獲取下一級描述（用於升級選單）
    getNextLevelDescription() {
        if (this.level < this.config.LEVELS.length) {
            return {
                name: this.config.NAME,
                level: this.level + 1,
                description: this.config.LEVELS[this.level].DESCRIPTION
            };
        }
        return null;
    }
}

// 在類內新增：根據「基礎值 +（等級5%）+（天賦基礎%）+（特化+2/4/6）」計算最終基礎傷害
Weapon.prototype._computeFinalDamage = function(levelMul){
    const base = (this.config && this.config.DAMAGE) ? this.config.DAMAGE : 0;
    // 狂熱類：每等 +3 基礎傷害（LV10 累計 +30）
    const frenzyExtra = (this.type === 'FRENZY_LIGHTNING' || this.type === 'FRENZY_SLASH')
        ? (3 * Math.max(1, this.level))
        : 0;
    // 狂熱大波：每等 +1 基礎傷害（LV10 累計 +10）
    const frenzyIceBallExtra = (this.type === 'FRENZY_ICE_BALL')
        ? (1 * Math.max(1, this.level))
        : 0;
    // 引力波：每等 +1 基礎傷害（LV10 累計 +10）
    const gravityWaveExtra = (this.type === 'GRAVITY_WAVE')
        ? (1 * Math.max(1, this.level))
        : 0;
    const specFlat = (this.player && this.player.damageSpecializationFlat) ? this.player.damageSpecializationFlat : 0;
    const talentPct = (this.player && this.player.damageTalentBaseBonusPct) ? this.player.damageTalentBaseBonusPct : 0;
    const attrPct = (this.player && this.player.damageAttributeBonusPct) ? this.player.damageAttributeBonusPct : 0; // 升級屬性加成（每級+10%）
    const attrFlat = (this.player && this.player.attackPowerUpgradeFlat) ? this.player.attackPowerUpgradeFlat : 0; // 新增：攻擊力上升（每級+2，單純加法）
    
    // 新增：雞腿強化（僅對雞腿庇佑生效，直接增加基礎攻擊）
    let chickenBlessingFlat = 0;
    if (this.type === 'CHICKEN_BLESSING' && typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel) {
        const chickenBoostLevel = TalentSystem.getTalentLevel('chicken_blessing_boost') || 0;
        if (chickenBoostLevel > 0 && TalentSystem.tieredTalents && TalentSystem.tieredTalents.chicken_blessing_boost) {
            const effect = TalentSystem.tieredTalents.chicken_blessing_boost.levels[chickenBoostLevel - 1];
            if (effect && typeof effect.flat === 'number') {
                chickenBlessingFlat = effect.flat;
            }
        }
    }
    
    // 新增：綿羊護體強化（僅對綿羊護體生效，直接增加基礎攻擊）
    let sheepGuardFlat = 0;
    if (this.type === 'ORBIT' && typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel) {
        const sheepBoostLevel = TalentSystem.getTalentLevel('sheep_guard_boost') || 0;
        if (sheepBoostLevel > 0 && TalentSystem.tieredTalents && TalentSystem.tieredTalents.sheep_guard_boost) {
            const effect = TalentSystem.tieredTalents.sheep_guard_boost.levels[sheepBoostLevel - 1];
            if (effect && typeof effect.flat === 'number') {
                sheepGuardFlat = effect.flat;
            }
        }
    }
    
    const lvPct = Math.max(0, (levelMul || 1) - 1);
    const percentSum = lvPct + talentPct + attrPct;
    const baseFlat = base + frenzyExtra + frenzyIceBallExtra + gravityWaveExtra + specFlat + attrFlat + chickenBlessingFlat + sheepGuardFlat; // 單純加法：先加再乘百分比
    const value = baseFlat * (1 + percentSum);
    return value;
};
