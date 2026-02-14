// 地圖障礙物：固定不動、可碰撞，阻擋玩家、敵人、投射物與雷射
class Obstacle extends Entity {
    constructor(x, y, imageKey = 'S1', size = 150) {
        super(x, y, size, size);
        this.imageKey = imageKey; // 'S1' 或 'S2'
        this.width = size;
        this.height = size;
        this.collisionRadius = Math.max(this.width, this.height) / 2; // 僅作為近似，主要用矩形碰撞
        this.isStatic = true;
        this.weaponType = 'OBSTACLE';
    }

    update(deltaTime) {
        // 障礙物不移動、不更新
    }

    draw(ctx) {
        ctx.save();
        let canvas = null, scaleX = 1, scaleY = 1, camX = 0, camY = 0, vw = 0, vh = 0;
        try {
            const vm = (typeof Game !== 'undefined') ? Game.viewMetrics : null;
            canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : document.getElementById('game-canvas');
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                scaleX = vm ? vm.scaleX : (rect.width / canvas.width);
                scaleY = vm ? vm.scaleY : (rect.height / canvas.height);
                camX = vm ? vm.camX : ((typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0);
                camY = vm ? vm.camY : ((typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0);
                vw = canvas.width * scaleX;
                vh = canvas.height * scaleY;
            }
        } catch (_) {}
        const margin = 128;
        if (canvas) {
            let sx = (this.x - camX) * scaleX;
            let sy = (this.y - camY) * scaleY;
            const left = sx - this.width / 2;
            const right = sx + this.width / 2;
            const top = sy - this.height / 2;
            const bottom = sy + this.height / 2;
            if (right < -margin || bottom < -margin || left > vw + margin || top > vh + margin) {
                ctx.restore();
                return;
            }
        }
        const img = Game.images && Game.images[this.imageKey];
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        const drawX = this.x - halfW;
        const drawY = this.y - halfH;
        if (img) {
            ctx.drawImage(img, drawX, drawY, this.width, this.height);
        } else {
            // 回退：畫出實心方塊
            ctx.fillStyle = this.imageKey === 'S2' ? '#8b5' : '#b85';
            ctx.fillRect(drawX, drawY, this.width, this.height);
        }
        ctx.restore();
    }
}

// 供其他模組使用的輔助：判斷圓是否與障礙物矩形相交
Obstacle.collidesCircle = function(cx, cy, r, obstacle) {
    return Utils.circleRectCollision(cx, cy, r, obstacle.x, obstacle.y, obstacle.width, obstacle.height);
};

// ✅ 讓 ES module（例如 survival_online.js）可以從 globalThis 取得建構子
try {
    if (typeof window !== 'undefined') {
        window.Obstacle = Obstacle;
    }
} catch (_) { }
