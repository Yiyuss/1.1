// 連鎖閃電效果（非一般投射物，屬於持續型效果）
class ChainLightningEffect extends Entity {
    constructor(player, damage, durationMs, maxChains, chainRadius) {
        super(player.x, player.y, 2, 2);
        this.player = player;
        this.damage = damage;
        this.durationMs = durationMs || 500;
        this.chainRadius = chainRadius || 220;
        this.maxChains = Math.max(0, maxChains || 0); // 次數：1代表主目標後再連1次
        this.startTime = Date.now();
        this.segments = []; // 依序揭示的電弧段
        this.particles = []; // 火花粒子
        this.weaponType = 'CHAIN_LIGHTNING';
        this.revealedCount = 0;
        this._buildChain();
        // 音效
        try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('zaps'); } catch (_) {}
    }

    _findNearestEnemy(x, y, excludeIds = new Set(), withinRadius = null) {
        let best = null;
        let bestDist = Infinity;
        for (const enemy of (Game.enemies || [])) {
            if (!enemy || enemy.markedForDeletion || enemy.health <= 0) continue;
            if (excludeIds.has(enemy.id)) continue;
            const d = Utils.distance(x, y, enemy.x, enemy.y);
            if (withinRadius != null && d > withinRadius) continue;
            if (d < bestDist) { bestDist = d; best = enemy; }
        }
        return best;
    }

    _buildChain() {
        // 主目標：以玩家為起點，找最近敵人
        const exclude = new Set();
        const primary = this._findNearestEnemy(this.player.x, this.player.y, exclude, null);
        if (!primary) {
            this.segments = [];
            return;
        }
        exclude.add(primary.id);
        this.segments.push({ fromType: 'player', to: primary, applied: false, revealAt: 0 });
        // 後續連鎖：在半徑內找最近、未被擊中的敵人
        let last = primary;
        for (let i = 0; i < this.maxChains; i++) {
            const next = this._findNearestEnemy(last.x, last.y, exclude, this.chainRadius);
            if (!next) break;
            exclude.add(next.id);
            this.segments.push({ fromType: 'enemy', fromEnemy: last, to: next, applied: false, revealAt: 0 });
            last = next;
        }
        // 將段落均勻分配在持續時間內揭示
        const segCount = this.segments.length;
        const interval = segCount > 0 ? (this.durationMs / segCount) : this.durationMs;
        let t = 0;
        for (const s of this.segments) {
            s.revealAt = t;
            t += interval;
        }
    }

    update(deltaTime) {
        // 生命期管理
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.durationMs) {
            this.markedForDeletion = true;
            return;
        }
        // 更新粒子
        this._updateParticles(deltaTime);
        // 在對應時間點對段落目標施加傷害（只施加一次）
        for (const seg of this.segments) {
            if (seg.applied) continue;
            if (elapsed >= seg.revealAt) {
                const target = seg.to;
                if (target && !target.markedForDeletion && target.health > 0) {
                    target.takeDamage(this.damage);
                    this._spawnSegmentSparks(seg);
                }
                seg.applied = true;
            }
        }
    }

    _updateParticles(deltaTime) {
        const toRemove = [];
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.life -= deltaTime;
            if (p.life <= 0) { toRemove.push(i); continue; }
            p.x += p.vx * (deltaTime / 16.67);
            p.y += p.vy * (deltaTime / 16.67);
        }
        for (let i = toRemove.length - 1; i >= 0; i--) {
            this.particles.splice(toRemove[i], 1);
        }
    }

    _spawnSegmentSparks(seg) {
        const { fx, fy, tx, ty } = this._segmentEndpoints(seg);
        const dx = tx - fx;
        const dy = ty - fy;
        const len = Math.sqrt(dx * dx + dy * dy);
        const dirX = dx / (len || 1);
        const dirY = dy / (len || 1);
        const count = 12;
        for (let i = 0; i < count; i++) {
            const t = Math.random();
            const px = fx + dx * t + (Math.random() - 0.5) * 8;
            const py = fy + dy * t + (Math.random() - 0.5) * 8;
            const speed = 1 + Math.random() * 3;
            const angle = Math.random() * Math.PI * 2;
            this.particles.push({
                x: px,
                y: py,
                vx: Math.cos(angle) * speed + dirX * 0.5,
                vy: Math.sin(angle) * speed + dirY * 0.5,
                life: 200 + Math.random() * 250,
                size: 2 + Math.random() * 2,
                color: '#66ccff'
            });
        }
    }

    _segmentEndpoints(seg) {
        // 起點：玩家當前位置或上一段的敵人當前位置（跟隨移動）
        let fx, fy;
        if (seg.fromType === 'player') {
            fx = this.player.x; fy = this.player.y;
        } else {
            fx = seg.fromEnemy ? seg.fromEnemy.x : this.player.x;
            fy = seg.fromEnemy ? seg.fromEnemy.y : this.player.y;
        }
        const tx = seg.to ? seg.to.x : fx;
        const ty = seg.to ? seg.to.y : fy;
        return { fx, fy, tx, ty };
    }

    draw(ctx) {
        ctx.save();
        // 繪製已揭示段落的電弧（抖動多段）
        const elapsed = Date.now() - this.startTime;
        for (const seg of this.segments) {
            if (elapsed < seg.revealAt) continue;
            const { fx, fy, tx, ty } = this._segmentEndpoints(seg);
            this._drawElectricArc(ctx, fx, fy, tx, ty);
        }
        // 繪製粒子
        for (const p of this.particles) {
            ctx.globalAlpha = Math.max(0.05, Math.min(1, p.life / 250));
            ctx.fillStyle = p.color || '#66ccff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _drawElectricArc(ctx, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(8, Math.floor(dist / 16));
        const jitterAmp = Math.min(10, dist / 12);
        const angle = Math.atan2(dy, dx);
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const points = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const bx = x1 + dx * t;
            const by = y1 + dy * t;
            const jitter = (Math.random() - 0.5) * jitterAmp;
            points.push({ x: bx + nx * jitter, y: by + ny * jitter });
        }
        // 外層光暈（加粗）
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#66ccff';
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        // 中層（加粗）
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#aaddff';
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        // 核心亮線（加粗）
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }
}
