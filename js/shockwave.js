// 心靈震波效果（擴散型環狀傷害）
class ShockwaveEffect extends Entity {
    constructor(player, damage, durationMs, maxRadius, ringWidth, palette) {
        super(player.x, player.y, 2, 2);
        this.player = player;
        // 震波中心在施放當下鎖定於玩家位置（不跟隨移動）
        this.cx = player.x;
        this.cy = player.y;
        this.damage = damage;
        this.durationMs = durationMs || 1000;
        this.maxRadius = Math.max(10, maxRadius || 220);
        this.ringWidth = Math.max(6, ringWidth || 18);
        this.startTime = Date.now();
        this.weaponType = 'MIND_MAGIC';
        this.hitEnemies = new Set(); // 每名敵人僅受一次傷害
        // 調色盤（可覆蓋顏色，不提供則使用預設紫色系）
        this.palette = (palette && typeof palette === 'object') ? palette : {
            halo: '#cc66ff',
            mid: '#ddaaff',
            core: '#ffffff'
        };
        // 聲效改由武器觸發，避免重複播放
        // （心靈魔法沿用唱歌音效，由 weapon.js 統一播放）
    }

    update(deltaTime) {
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.durationMs) {
            this.markedForDeletion = true;
            return;
        }
        const progress = Math.max(0, Math.min(1, elapsed / this.durationMs));
        this.currentRadius = this.maxRadius * progress;

        // 命中判定：距離中心落在當前環寬度範圍內
        const r = this.currentRadius || 0;
        const half = this.ringWidth * 0.5;
        const enemies = (Game && Array.isArray(Game.enemies)) ? Game.enemies : [];
        for (const enemy of enemies) {
            if (!enemy || enemy.markedForDeletion || enemy.health <= 0) continue;
            if (this.hitEnemies.has(enemy.id)) continue;
            const d = Utils.distance(this.cx, this.cy, enemy.x, enemy.y);
            if (d >= (r - half) && d <= (r + half)) {
                if (typeof DamageSystem !== 'undefined') {
                    const result = DamageSystem.computeHit(this.damage, enemy, {
                        weaponType: this.weaponType,
                        critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0)
                    });
                    enemy.takeDamage(result.amount);
                    // 命中後施加暫時緩速：99% 超慢但仍可移動（1.5秒）
                    if (enemy && typeof enemy.applySlow === 'function') {
                        try { enemy.applySlow(1500, 0.01); } catch (_) {}
                    }
                    if (typeof DamageNumbers !== 'undefined') {
                        const dirX = enemy.x - this.cx;
                        const dirY = enemy.y - this.cy;
                        DamageNumbers.show(result.amount, enemy.x, enemy.y - (enemy.height || 0) / 2, result.isCrit, { dirX, dirY, enemyId: enemy.id });
                    }
                } else {
                    enemy.takeDamage(this.damage);
                    // 命中後施加暫時緩速：99% 超慢但仍可移動（1.5秒）
                    if (enemy && typeof enemy.applySlow === 'function') {
                        try { enemy.applySlow(1500, 0.01); } catch (_) {}
                    }
                }
                this.hitEnemies.add(enemy.id);
            }
        }
    }

    draw(ctx) {
        const r = this.currentRadius || 0;
        if (r <= 0) return;
        ctx.save();
        // 使用加色混合提升光環亮度
        ctx.globalCompositeOperation = 'lighter';
        // 外層光暈
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = Math.max(8, this.ringWidth);
        ctx.strokeStyle = this.palette.halo || '#cc66ff';
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
        ctx.stroke();
        // 中層
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = Math.max(4, this.ringWidth * 0.6);
        ctx.strokeStyle = this.palette.mid || '#ddaaff';
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
        ctx.stroke();
        // 核心亮線
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = Math.max(2, this.ringWidth * 0.3);
        ctx.strokeStyle = this.palette.core || '#ffffff';
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}
