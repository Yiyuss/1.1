// 武器類
class Weapon {
    constructor(player, type) {
        this.player = player;
        this.type = type;
        this.config = CONFIG.WEAPONS[type];
        this.level = 1;
        this.lastFireTime = 0;
        this.projectileCount = this.config.LEVELS[0].COUNT;
    }
    
    update(deltaTime) {
        const currentTime = Date.now();
        
        // 檢查是否可以發射
        if (currentTime - this.lastFireTime >= this.config.COOLDOWN) {
            this.fire();
            this.lastFireTime = currentTime;
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
                    case 'ORBIT':
                        // 可選：為旋球加入音效
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
    // 狂熱雷擊：每等 +3 基礎傷害（LV10 累計 +30）
    const frenzyExtra = (this.type === 'FRENZY_LIGHTNING') ? (3 * Math.max(1, this.level)) : 0;
    const specFlat = (this.player && this.player.damageSpecializationFlat) ? this.player.damageSpecializationFlat : 0;
    const talentPct = (this.player && this.player.damageTalentBaseBonusPct) ? this.player.damageTalentBaseBonusPct : 0;
    const attrPct = (this.player && this.player.damageAttributeBonusPct) ? this.player.damageAttributeBonusPct : 0; // 升級屬性加成（每級+10%）
    const attrFlat = (this.player && this.player.attackPowerUpgradeFlat) ? this.player.attackPowerUpgradeFlat : 0; // 新增：攻擊力上升（每級+2，單純加法）
    const lvPct = Math.max(0, (levelMul || 1) - 1);
    const percentSum = lvPct + talentPct + attrPct;
    const baseFlat = base + frenzyExtra + specFlat + attrFlat; // 單純加法：先加再乘百分比
    const value = baseFlat * (1 + percentSum);
    return value;
};
