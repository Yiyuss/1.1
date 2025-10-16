// 寶箱（拾取後觸發一次免費升級）
class Chest extends Entity {
    constructor(x, y) {
        const size = 48;
        super(x, y, size, size);
        this.collisionRadius = size / 2;
        this.pulse = 0; // 視覺呼吸效果
    }

    update(deltaTime) {
        // 簡單呼吸動畫
        this.pulse += deltaTime * 0.005;
        // 玩家拾取檢查（圓形碰撞）
        const player = Game.player;
        const dx = this.x - player.x;
        const dy = this.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= (this.collisionRadius + player.collisionRadius)) {
            this.collect();
        }

        // 限制在世界邊界內
        this.x = Utils.clamp(this.x, this.width / 2, (Game.worldWidth || Game.canvas.width) - this.width / 2);
        this.y = Utils.clamp(this.y, this.height / 2, (Game.worldHeight || Game.canvas.height) - this.height / 2);
    }

    draw(ctx) {
        ctx.save();
        // 圖像優先
        const img = (Game.images || {})['box'];
        const size = Math.max(this.width, this.height);
        if (img) {
            // 呼吸縮放效果
            const s = size * (1 + Math.sin(this.pulse) * 0.05);
            ctx.drawImage(img, this.x - s / 2, this.y - s / 2, s, s);
        } else {
            // 備用：金色方形
            ctx.fillStyle = '#cfa216';
            const s = size * (1 + Math.sin(this.pulse) * 0.05);
            ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x - s / 2, this.y - s / 2, s, s);
        }
        ctx.restore();
    }

    collect() {
        // 播放開箱音效（使用level_up作為替代）
        if (typeof AudioManager !== 'undefined') {
            AudioManager.playSound('level_up');
        }
        // 觸發一次免費升級（不增加等級/經驗）
        UI.showLevelUpMenu();
        this.destroy();
    }
}
