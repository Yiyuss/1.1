// 幼妲光輝特效：從上往下快速照射聖光，照射後維持到時間結束
// 效果與唱歌相同，但使用 Canvas 繪製聖光特效而非貼圖
class YoungDadaGloryEffect extends Entity {
    constructor(player, durationMs) {
        super(player.x, player.y, 1, 1);
        this.player = player;
        this.duration = durationMs || 2000; // 與唱歌相同的持續時間
        this.startTime = Date.now();
        this.weaponType = 'YOUNG_DADA_GLORY';
        
        // 特效參數
        this.maxHeight = 270; // 光芒最大高度（縮短以減少超出玩家的部分）
        this.topWidth = 20; // 頂部寬度（從上往下，頂部較窄）
        this.baseWidth = 80; // 底部寬度（從上往下，底部較寬）
        this.dropDuration = 150; // 快速照射時間（毫秒），馬上照下來
        this.particles = []; // 粒子效果
        
        // 初始化粒子
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: 0,
                y: 0,
                size: Math.random() * 8 + 4,
                alpha: Math.random() * 0.5 + 0.3,
                speed: Math.random() * 3 + 2
            });
        }
    }

    update(deltaTime) {
        this.x = this.player.x;
        this.y = this.player.y;
        
        const elapsed = Date.now() - this.startTime;
        
        // 更新粒子位置（從上往下）
        const dropProgress = Math.min(1, elapsed / this.dropDuration);
        const maintainProgress = Math.max(0, (elapsed - this.dropDuration) / (this.duration - this.dropDuration));
        
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (dropProgress < 1) {
                // 快速下降階段
                p.y = -this.maxHeight + this.maxHeight * dropProgress * (0.5 + Math.random() * 0.5);
            } else {
                // 維持階段：粒子位置固定
                p.y = -this.maxHeight * (0.5 + Math.random() * 0.5);
            }
            p.x = (Math.random() - 0.5) * this.baseWidth;
            p.alpha = (1 - maintainProgress) * (0.3 + Math.random() * 0.5);
        }
        
        if (elapsed >= this.duration) {
            this.destroy();
        }
    }

    draw(ctx) {
        const elapsed = Date.now() - this.startTime;
        const dropProgress = Math.min(1, elapsed / this.dropDuration); // 快速照射進度
        const isMaintaining = elapsed >= this.dropDuration; // 是否進入維持階段
        
        ctx.save();
        
        // 計算光芒位置（從上往下）
        const topY = this.player.y - (this.player.height || 20) / 2 - this.maxHeight; // 玩家頭頂上方
        const baseY = this.player.y + (this.player.height || 20) / 2; // 玩家腳底
        
        let currentHeight;
        if (isMaintaining) {
            // 維持階段：完全展開
            currentHeight = this.maxHeight;
        } else {
            // 快速照射階段：快速展開
            currentHeight = this.maxHeight * dropProgress;
        }
        
        const currentTopY = baseY - currentHeight;
        const currentBaseWidth = this.topWidth + (this.baseWidth - this.topWidth) * (isMaintaining ? 1 : dropProgress);
        
        // 延伸到底部下方一點點，僅用於羽化邊緣（兩層共用）
        const extendedBaseY = baseY + 20; // 只延伸20px用於羽化，不再延伸太多
        const extendedBaseWidth = currentBaseWidth + 20; // 底部稍微加寬以容納羽化
        
        // 繪製主體光芒（漸變錐形，從上往下，底部逐漸變透明以實現柔和過渡）
        const gradient = ctx.createLinearGradient(
            this.x, currentTopY,
            this.x, extendedBaseY // 延伸到底部下方，讓漸變更長
        );
        gradient.addColorStop(0, 'rgba(255, 255, 50, 0.1)'); // 頂部：較暗
        gradient.addColorStop(0.3, 'rgba(255, 255, 100, 0.4)');
        gradient.addColorStop(0.6, 'rgba(255, 255, 150, 0.6)');
        gradient.addColorStop(0.75, 'rgba(255, 255, 180, 0.65)'); // 開始逐漸變淡
        gradient.addColorStop(0.85, 'rgba(255, 255, 200, 0.5)'); // 更透明
        gradient.addColorStop(0.92, 'rgba(255, 255, 200, 0.3)'); // 繼續變淡
        gradient.addColorStop(0.96, 'rgba(255, 255, 200, 0.15)'); // 接近透明
        gradient.addColorStop(0.98, 'rgba(255, 255, 200, 0.05)'); // 幾乎透明
        gradient.addColorStop(1, 'rgba(255, 255, 200, 0)'); // 完全透明
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(this.x - this.topWidth / 2, currentTopY);
        ctx.lineTo(this.x + this.topWidth / 2, currentTopY);
        ctx.lineTo(this.x + extendedBaseWidth / 2, extendedBaseY);
        ctx.lineTo(this.x - extendedBaseWidth / 2, extendedBaseY);
        ctx.closePath();
        ctx.fill();
        
        // 繪製外層光暈（更透明，底部也要羽化）
        const outerGradient = ctx.createLinearGradient(
            this.x, currentTopY,
            this.x, extendedBaseY // 與主體延伸相同的距離
        );
        outerGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        outerGradient.addColorStop(0.85, 'rgba(255, 255, 255, 0.25)'); // 開始變淡
        outerGradient.addColorStop(0.92, 'rgba(255, 255, 255, 0.15)');
        outerGradient.addColorStop(0.96, 'rgba(255, 255, 255, 0.08)');
        outerGradient.addColorStop(0.98, 'rgba(255, 255, 255, 0.03)');
        outerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)'); // 底部完全透明
        
        ctx.fillStyle = outerGradient;
        ctx.beginPath();
        // 與主體使用相同的延伸底部
        ctx.moveTo(this.x - this.topWidth / 2 - 10, currentTopY);
        ctx.lineTo(this.x + this.topWidth / 2 + 10, currentTopY);
        ctx.lineTo(this.x + extendedBaseWidth / 2 + 15, extendedBaseY);
        ctx.lineTo(this.x - extendedBaseWidth / 2 - 15, extendedBaseY);
        ctx.closePath();
        ctx.fill();
        
        // 繪製多層底部羽化邊緣（類似PR的霧狀效果，完全融入背景）
        // 第一層：較大的徑向漸變，創建基礎霧狀效果
        const featherRadius1 = 100; // 更大的羽化半徑
        const featherGradient1 = ctx.createRadialGradient(
            this.x, baseY, 0,
            this.x, baseY, featherRadius1
        );
        featherGradient1.addColorStop(0, 'rgba(255, 255, 200, 0.25)');
        featherGradient1.addColorStop(0.3, 'rgba(255, 255, 200, 0.12)');
        featherGradient1.addColorStop(0.5, 'rgba(255, 255, 200, 0.06)');
        featherGradient1.addColorStop(0.7, 'rgba(255, 255, 200, 0.02)');
        featherGradient1.addColorStop(0.85, 'rgba(255, 255, 200, 0.008)');
        featherGradient1.addColorStop(1, 'rgba(255, 255, 200, 0)');
        
        ctx.fillStyle = featherGradient1;
        ctx.beginPath();
        ctx.arc(this.x, baseY, featherRadius1, 0, Math.PI * 2);
        ctx.fill();
        
        // 第二層：中等大小的徑向漸變，增強過渡
        const featherRadius2 = 70;
        const featherGradient2 = ctx.createRadialGradient(
            this.x, baseY, 0,
            this.x, baseY, featherRadius2
        );
        featherGradient2.addColorStop(0, 'rgba(255, 255, 200, 0.2)');
        featherGradient2.addColorStop(0.4, 'rgba(255, 255, 200, 0.08)');
        featherGradient2.addColorStop(0.65, 'rgba(255, 255, 200, 0.03)');
        featherGradient2.addColorStop(0.8, 'rgba(255, 255, 200, 0.01)');
        featherGradient2.addColorStop(1, 'rgba(255, 255, 200, 0)');
        
        ctx.fillStyle = featherGradient2;
        ctx.beginPath();
        ctx.arc(this.x, baseY, featherRadius2, 0, Math.PI * 2);
        ctx.fill();
        
        // 第三層：較小的徑向漸變，填充中心區域
        const featherRadius3 = 45;
        const featherGradient3 = ctx.createRadialGradient(
            this.x, baseY, 0,
            this.x, baseY, featherRadius3
        );
        featherGradient3.addColorStop(0, 'rgba(255, 255, 200, 0.15)');
        featherGradient3.addColorStop(0.5, 'rgba(255, 255, 200, 0.05)');
        featherGradient3.addColorStop(0.75, 'rgba(255, 255, 200, 0.015)');
        featherGradient3.addColorStop(1, 'rgba(255, 255, 200, 0)');
        
        ctx.fillStyle = featherGradient3;
        ctx.beginPath();
        ctx.arc(this.x, baseY, featherRadius3, 0, Math.PI * 2);
        ctx.fill();
        
        // 繪製粒子效果
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = 'rgba(255, 255, 200, 0.8)';
            ctx.beginPath();
            ctx.arc(
                this.x + p.x,
                baseY + p.y,
                p.size,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
        
        ctx.restore();
    }
}

