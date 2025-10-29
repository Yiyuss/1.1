// 投射物類
class Projectile extends Entity {
    constructor(x, y, angle, weaponType, damage, speed, size) {
        super(x, y, size, size);
        this.angle = angle;
        this.weaponType = weaponType;
        this.damage = damage;
        this.speed = speed;
        this.distance = 0;
        this.maxDistance = 1000; // 最大飛行距離
        // 追蹤屬性（僅閃電使用）
        this.homing = false;
        this.turnRatePerSec = 0; // 每秒最大轉向弧度（rad/s）
    }
    
    update(deltaTime) {
        // 閃電追蹤：優先追蹤分配的唯一目標，避免全部鎖定同一敵人
        if (this.homing && Game.enemies && Game.enemies.length) {
            let target = null;
            if (this.assignedTargetId) {
                target = Game.enemies.find(e => e.id === this.assignedTargetId) || null;
            }
            // 若分配目標不存在，退回最近敵人
            if (!target) {
                let minDist = Infinity;
                for (const enemy of Game.enemies) {
                    const d = Utils.distance(this.x, this.y, enemy.x, enemy.y);
                    if (d < minDist) { minDist = d; target = enemy; }
                }
            }
            if (target) {
                const desired = Utils.angle(this.x, this.y, target.x, target.y);
                let delta = desired - this.angle;
                // 將角度差規範化到 [-PI, PI]
                if (delta > Math.PI) delta -= Math.PI * 2;
                if (delta < -Math.PI) delta += Math.PI * 2;
                const maxTurn = (this.turnRatePerSec || 0) * (deltaTime / 1000);
                // 限制每幀最大轉向量
                if (delta > maxTurn) delta = maxTurn;
                if (delta < -maxTurn) delta = -maxTurn;
                this.angle += delta;
            }
        }

        // 移動投射物（先檢查障礙物阻擋）
        const deltaMul = deltaTime / 16.67;
        const dx = Math.cos(this.angle) * this.speed * deltaMul;
        const dy = Math.sin(this.angle) * this.speed * deltaMul;
        const candX = this.x + dx;
        const candY = this.y + dy;

        // 與障礙物相交則銷毀投射物
        for (const obs of Game.obstacles || []) {
            if (Utils.circleRectCollision(candX, candY, this.collisionRadius, obs.x, obs.y, obs.width, obs.height)) {
                this.destroy();
                return;
            }
        }

        // 套用位移
        this.x = candX;
        this.y = candY;
        
        // 計算已飛行距離
        this.distance += Math.sqrt(dx * dx + dy * dy);
        
        // 檢查是否超出最大飛行距離
        if (this.distance >= this.maxDistance) {
            this.destroy();
            return;
        }
        
        // 檢查是否超出世界範圍
        if (Utils.isOutOfWorldBounds(this.x, this.y, (Game.worldWidth || Game.canvas.width), (Game.worldHeight || Game.canvas.height))) {
            this.destroy();
            return;
        }
        
        // 檢查與敵人的碰撞
        for (const enemy of Game.enemies) {
            if (this.isColliding(enemy)) {
                // 使用 DamageSystem 計算浮動與爆擊；若不可用則維持原邏輯
                if (typeof DamageSystem !== 'undefined') {
                    // 維護：加入爆擊加成（基礎10% + 天賦加成），不改畫面文字
                    const result = DamageSystem.computeHit(
                        this.damage,
                        enemy,
                        { weaponType: this.weaponType, critChanceBonusPct: (this.critChanceBonusPct || 0) }
                    );
                    enemy.takeDamage(result.amount);
                    if (typeof DamageNumbers !== 'undefined') {
                        // 顯示層：傳入 enemyId 用於每敵人節流（僅影響顯示密度）
                        DamageNumbers.show(
                          result.amount,
                          enemy.x,
                          enemy.y - (enemy.height||0)/2,
                          result.isCrit,
                          { dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), enemyId: enemy.id }
                        );
                    }
                } else {
                    enemy.takeDamage(this.damage);
                }
                // 紳士綿羊（FIREBALL）命中未被消滅的敵人時施加暫時減速
                if (this.weaponType === 'FIREBALL' && enemy.health > 0 && typeof enemy.applySlow === 'function') {
                    enemy.applySlow(1000, 0.5);
                }

                // 紳士綿羊（FIREBALL）命中時觸發小範圍擴散傷害（不爆擊）
                if (this.weaponType === 'FIREBALL' && typeof Game !== 'undefined' && Array.isArray(Game.enemies)) {
                    try {
                        const splashRadius = Math.max(34, (this.collisionRadius || 12) * 2.6);
                        for (const e of Game.enemies) {
                            if (!e || e.id === enemy.id) continue;
                            const dist = Utils.distance(enemy.x, enemy.y, e.x, e.y);
                            if (dist <= splashRadius) {
                                const splashBase = (this.damage || 0) * 0.6;
                                const splash = (typeof DamageSystem !== 'undefined')
                                    ? DamageSystem.computeHit(splashBase, e, { weaponType: this.weaponType, allowCrit: false })
                                    : { amount: splashBase, isCrit: false };
                                e.takeDamage(splash.amount);
                                if (typeof e.applySlow === 'function') { e.applySlow(1000, 0.5); }
                                if (typeof DamageNumbers !== 'undefined') {
                                    const dirX = (e.x - enemy.x) || 1;
                                    const dirY = (e.y - enemy.y) || 0;
                                    const mag = Math.hypot(dirX, dirY) || 1;
                                    DamageNumbers.show(
                                        splash.amount,
                                        e.x,
                                        e.y - (e.height||0)/2,
                                        false,
                                        { dirX: dirX/mag, dirY: dirY/mag, enemyId: e.id }
                                    );
                                }
                            }
                        }
                    } catch (_) {}
                }

                // 維護註解：追蹤綿羊（LIGHTNING）命中時的爆炸特效與音效
                // 依賴與安全性：
                // - 使用 Game.explosionParticles 現有更新/繪製管線，不新增新型別。
                // - 僅添加視覺粒子與播放 bo.mp3，不更動任何傷害/冷卻/數量等數值。
                // - 若 AudioManager 不存在，靜默跳過；若 explosionParticles 未初始化，按既有格式建立。
                if (this.weaponType === 'LIGHTNING') {
                    try {
                        const particleCount = 18; // 更顯眼，性能仍安全
                        for (let i = 0; i < particleCount; i++) {
                            const ang = Math.random() * Math.PI * 2;
                            const speed = 2 + Math.random() * 4;
                            const p = {
                                x: enemy.x,
                                y: enemy.y,
                                vx: Math.cos(ang) * speed,
                                vy: Math.sin(ang) * speed,
                                life: 520 + Math.random() * 280,
                                maxLife: 520 + Math.random() * 280,
                                size: 5 + Math.random() * 3,
                                color: '#ffffff' // 維護：追蹤綿羊命中爆炸粒子改為白色（純視覺，不影響數值與機制）
                            };
                            // 用於繪製階段提高不透明度與尺寸
                            p.source = 'LIGHTNING';
                            if (!Game.explosionParticles) Game.explosionParticles = [];
                            Game.explosionParticles.push(p);
                        }
                        if (typeof AudioManager !== 'undefined') {
                            AudioManager.playSound('bo');
                        }
                    } catch (_) {}
                }
                this.destroy();
                break;
            }
        }
    }
    
    draw(ctx) {
        ctx.save();
        
        // 優先使用圖片繪製（1:1比例）
        let imageName = null;
        switch(this.weaponType) {
            case 'DAGGER':
                imageName = 'dagger';
                break;
            case 'FIREBALL':
                imageName = 'fireball';
                break;
            case 'LIGHTNING':
                imageName = 'lightning';
                break;
        }
        
        if (imageName && Game.images && Game.images[imageName]) {
            const size = Math.max(this.width, this.height);
            ctx.drawImage(Game.images[imageName], this.x - size / 2, this.y - size / 2, size, size);
        } else {
            // 備用：使用純色圓形
            let color = '#fff';
            if (this.weaponType === 'FIREBALL') color = '#f50';
            if (this.weaponType === 'LIGHTNING') color = '#0ff';
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 繪製尾跡效果（避免蓋在圖片上：LIGHTNING/紳士綿羊(FIREBALL)/應援棒(DAGGER)不畫尾跡）
        const shouldDrawTail = !(
            this.weaponType === 'LIGHTNING' ||
            this.weaponType === 'FIREBALL' ||
            this.weaponType === 'DAGGER'
        );
        if (shouldDrawTail) {
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(this.x - Math.cos(this.angle) * 10, this.y - Math.sin(this.angle) * 10, this.width / 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}
