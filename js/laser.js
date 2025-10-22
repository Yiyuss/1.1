// 雷射光束：從玩家位置朝最近敵人方向，延伸至世界邊界，持續造成傷害
class LaserBeam extends Entity {
    constructor(player, angle, damage, widthPx, durationMs, tickIntervalMs) {
        // 使用極細的碰撞包圍盒，不依賴圓形碰撞；實際碰撞用線段距離計算
        super(player.x, player.y, 1, 1);
        this.player = player;
        this.angle = angle;
        this.damage = damage;
        this.width = widthPx; // 畫面線寬（像素）
        this.duration = durationMs;
        this.tickIntervalMs = tickIntervalMs;
        this.tickAccumulator = 0;
        this.startTime = Date.now();
        this.weaponType = 'LASER';
        // 預先計算端點
        const pts = this.computeEndpoints();
        this.startX = pts.startX;
        this.startY = pts.startY;
        this.endX = pts.endX;
        this.endY = pts.endY;
        // 視覺用脈動相位（不影響碰撞與傷害）
        this.pulsePhase = 0;
    }

    computeEndpoints() {
        const sx = this.player.x;
        const sy = this.player.y;
        const dx = Math.cos(this.angle);
        const dy = Math.sin(this.angle);
        const worldW = Game.worldWidth || Game.canvas.width;
        const worldH = Game.worldHeight || Game.canvas.height;

        // 邊界t（最近前向邊界）
        const edgeCandidates = [];
        if (dx > 0) {
            edgeCandidates.push((worldW - sx) / dx);
        } else if (dx < 0) {
            edgeCandidates.push((0 - sx) / dx);
        }
        if (dy > 0) {
            edgeCandidates.push((worldH - sy) / dy);
        } else if (dy < 0) {
            edgeCandidates.push((0 - sy) / dy);
        }
        const positiveEdges = edgeCandidates.filter(t => t > 0);
        let closestT = positiveEdges.length ? Math.min(...positiveEdges) : 0;

        // 障礙物阻擋：找出最小正交點t
        for (const obs of Game.obstacles || []) {
            const halfW = obs.width / 2;
            const halfH = obs.height / 2;
            const left = obs.x - halfW;
            const right = obs.x + halfW;
            const top = obs.y - halfH;
            const bottom = obs.y + halfH;
            const tHit = Utils.rayAABBIntersection(sx, sy, dx, dy, left, top, right, bottom);
            if (tHit !== Infinity && tHit > 0 && tHit < closestT) {
                closestT = tHit;
            }
        }

        const ex = sx + dx * closestT;
        const ey = sy + dy * closestT;
        return { startX: sx, startY: sy, endX: ex, endY: ey };
    }

    // 點到線段距離（世界座標），用於碰撞近似
    pointSegmentDistance(px, py, x1, y1, x2, y2) {
        const vx = x2 - x1;
        const vy = y2 - y1;
        const len2 = vx * vx + vy * vy;
        if (len2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * vx + (py - y1) * vy) / len2;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * vx;
        const projY = y1 + t * vy;
        return Math.hypot(px - projX, py - projY);
    }

    update(deltaTime) {
        // 追隨玩家位置（方向固定），重新計算端點
        const pts = this.computeEndpoints();
        this.startX = pts.startX;
        this.startY = pts.startY;
        this.endX = pts.endX;
        this.endY = pts.endY;

        // 固定時間間隔對穿過的敵人造成傷害（不衰減，使用原傷害）
        this.tickAccumulator += deltaTime;
        // 視覺脈動相位推進
        this.pulsePhase += deltaTime;
        if (this.tickAccumulator >= this.tickIntervalMs) {
            const half = this.width / 2;
            for (const enemy of Game.enemies) {
                const d = this.pointSegmentDistance(enemy.x, enemy.y, this.startX, this.startY, this.endX, this.endY);
                if (d <= half + enemy.collisionRadius) {
                    if (typeof DamageSystem !== 'undefined') {
                        const result = DamageSystem.computeHit(this.damage, enemy, { weaponType: this.weaponType, critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0) });
                        enemy.takeDamage(result.amount);
                        if (typeof DamageNumbers !== 'undefined') {
                            // 顯示層：傳入 enemyId 用於每敵人節流（僅影響顯示密度）
                            DamageNumbers.show(result.amount, enemy.x, enemy.y - (enemy.height||0)/2, result.isCrit, { dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), enemyId: enemy.id });
                        }
                    } else {
                        enemy.takeDamage(this.damage);
                    }
                }
            }
            this.tickAccumulator = 0;
        }

        // 到期銷毀
        if (Date.now() - this.startTime >= this.duration) {
            this.destroy();
        }
    }

    draw(ctx) {
        ctx.save();
        // 脈動寬度（僅視覺），不影響碰撞與傷害半徑
        const t = (this.pulsePhase || 0) / 1000;
        const pulse = 1 + 0.2 * Math.sin(t * 10);
        const drawWidth = this.width * pulse;

        // 使用線性漸層作為核心
        const core = ctx.createLinearGradient(this.startX, this.startY, this.endX, this.endY);
        core.addColorStop(0, '#0ff');
        core.addColorStop(0.5, '#fff');
        core.addColorStop(1, '#0ff');
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = core;
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = drawWidth;
        ctx.beginPath();
        ctx.moveTo(this.startX, this.startY);
        ctx.lineTo(this.endX, this.endY);
        ctx.stroke();

        // 疊加光暈層（疊加模式）
        ctx.globalCompositeOperation = 'lighter';
        // 內層光暈
        ctx.strokeStyle = '#bff';
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = drawWidth * 1.35;
        ctx.beginPath();
        ctx.moveTo(this.startX, this.startY);
        ctx.lineTo(this.endX, this.endY);
        ctx.stroke();
        // 外層光暈
        ctx.strokeStyle = '#9ff';
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = drawWidth * 1.9;
        ctx.beginPath();
        ctx.moveTo(this.startX, this.startY);
        ctx.lineTo(this.endX, this.endY);
        ctx.stroke();

        // 端點閃光（半徑隨脈動）
        const radius = Math.max(6, drawWidth * 0.6);
        const drawGlow = (x, y) => {
            const rg = ctx.createRadialGradient(x, y, 0, x, y, radius);
            rg.addColorStop(0, 'rgba(255,255,255,0.9)');
            rg.addColorStop(0.3, 'rgba(0,255,255,0.6)');
            rg.addColorStop(1, 'rgba(0,255,255,0)');
            ctx.fillStyle = rg;
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        };
        drawGlow(this.startX, this.startY);
        drawGlow(this.endX, this.endY);

        ctx.restore();
    }
}
