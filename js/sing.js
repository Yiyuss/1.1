class SingEffect extends Entity {
    constructor(player, durationMs) {
        super(player.x, player.y, 1, 1);
        this.player = player;
        this.duration = durationMs || 1000;
        this.startTime = Date.now();
        this.weaponType = 'SING';
        this.notes = this._generateNotes();
    }

    _generateNotes() {
        const sizes = [14, 20, 26, 32];
        const spread = 46;
        const arr = [];
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.4;
            const r = spread + (Math.random() * 10 - 5);
            const nx = Math.cos(angle) * r;
            const ny = Math.sin(angle) * r;
            arr.push({ dx: nx, dy: ny, size: sizes[i] });
        }
        return arr;
    }

    update(deltaTime) {
        this.x = this.player.x;
        this.y = this.player.y;
        if (Date.now() - this.startTime >= this.duration) {
            this.destroy();
        }
    }

    draw(ctx) {
        ctx.save();
        const t = (Date.now() - this.startTime) / this.duration;
        const flicker = 0.5 + Math.sin(t * Math.PI * 6) * 0.4;
        for (const n of this.notes) {
            const px = this.x + n.dx;
            const py = this.y + n.dy;
            const s = n.size;
            ctx.globalAlpha = flicker;
            ctx.fillStyle = '#ff66cc';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1, s * 0.06);
            // 音符形狀：圓 + 棒 + 旗
            ctx.beginPath();
            ctx.arc(px, py, s * 0.32, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(px + s * 0.18, py - s * 0.05);
            ctx.lineTo(px + s * 0.18, py - s * 0.75);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px + s * 0.18, py - s * 0.75);
            ctx.quadraticCurveTo(px + s * 0.55, py - s * 0.65, px + s * 0.18, py - s * 0.55);
            ctx.stroke();
        }
        ctx.restore();
    }
}