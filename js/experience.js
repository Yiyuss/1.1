// 經驗寶石類
class ExperienceOrb extends Entity {
    constructor(x, y, value) {
        super(x, y, CONFIG.EXPERIENCE.SIZE, CONFIG.EXPERIENCE.SIZE);
        this.value = value || CONFIG.EXPERIENCE.VALUE;
        this.collisionRadius = CONFIG.EXPERIENCE.SIZE / 2;
        this.attractionSpeed = 0;
        this.maxAttractionSpeed = 10;
        this.attractionRange = 100;
        this.attractionAcceleration = 0.2;
    }
    
    update(deltaTime) {
        const player = Game.player;
        const distanceToPlayer = Utils.distance(this.x, this.y, player.x, player.y);
        
        // 如果玩家靠近，吸引經驗寶石
        if (distanceToPlayer < this.attractionRange) {
            // 增加吸引速度
            this.attractionSpeed = Math.min(this.attractionSpeed + this.attractionAcceleration, this.maxAttractionSpeed);
            
            // 計算移動方向
            const angle = Utils.angle(this.x, this.y, player.x, player.y);
            this.x += Math.cos(angle) * this.attractionSpeed;
            this.y += Math.sin(angle) * this.attractionSpeed;
        }
        
        // 檢查是否被玩家收集
        if (this.isColliding(player)) {
            // 播放收集音效
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound('collect_exp');
            }
            player.gainExperience(this.value);
            this.destroy();
        }
    }
    
    draw(ctx) {
        ctx.save();
        
        // 優先使用圖片繪製（1:1比例）
        if (Game.images && Game.images.exp_orb) {
            const size = Math.max(this.width, this.height);
            ctx.drawImage(Game.images.exp_orb, this.x - size / 2, this.y - size / 2, size, size);
        } else {
            // 備用：使用純色圓形
            ctx.fillStyle = '#0f0';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 閃爍效果
        const pulseSize = Math.sin(Date.now() / 200) * 2;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2 + pulseSize, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}
