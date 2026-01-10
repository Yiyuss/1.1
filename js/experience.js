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
        // M4：支援多玩家收集（本地玩家 + 遠程玩家）
        const allPlayers = [];
        if (Game.player) allPlayers.push(Game.player);
        if (Game.multiplayer && Game.multiplayer.role === "host" && Array.isArray(Game.remotePlayers)) {
            for (const remotePlayer of Game.remotePlayers) {
                if (remotePlayer && !remotePlayer.markedForDeletion) {
                    allPlayers.push(remotePlayer);
                }
            }
        }
        
        // 找到最近的玩家（用於吸引）
        let nearestPlayer = null;
        let nearestDist = Infinity;
        for (const p of allPlayers) {
            const dist = Utils.distance(this.x, this.y, p.x, p.y);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestPlayer = p;
            }
        }
        
        if (nearestPlayer) {
            const prMul = (nearestPlayer && nearestPlayer.pickupRangeMultiplier) ? nearestPlayer.pickupRangeMultiplier : 1;
            const effectiveRange = this.attractionRange * prMul;
            if (nearestDist < effectiveRange) {
                // 增加吸引速度（按時間縮放）
                const deltaMul = deltaTime / 16.67;
                this.attractionSpeed = Math.min(this.attractionSpeed + this.attractionAcceleration * deltaMul, this.maxAttractionSpeed);
                
                // 計算移動方向
                const angle = Utils.angle(this.x, this.y, nearestPlayer.x, nearestPlayer.y);
                this.x += Math.cos(angle) * this.attractionSpeed * deltaMul;
                this.y += Math.sin(angle) * this.attractionSpeed * deltaMul;
            }
        }
        
        // 檢查是否被任何玩家收集
        for (const player of allPlayers) {
            if (this.isColliding(player)) {
                if (typeof AudioManager !== 'undefined') {
                    // 尊重 EXP 音效開關
                    if (AudioManager.expSoundEnabled !== false) {
                        AudioManager.playSound('collect_exp');
                    }
                }
                player.gainExperience(this.value);
                this.destroy();
                return;
            }
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
        
        // 閃爍效果（在經驗球數量少於閾值時才顯示）
        const orbCount = (Game.experienceOrbs && Game.experienceOrbs.length) || 0;
        const threshold = (CONFIG.OPTIMIZATION && CONFIG.OPTIMIZATION.ORB_PULSE_DISABLE_THRESHOLD) || 100;
        if (orbCount < threshold) {
            const pulseSize = Math.sin(Date.now() / 200) * 2;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2 + pulseSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}
