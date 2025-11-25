// 幼妲天使特效：幼妲光輝的超級加強版
// 更華麗的聖光特效，從上往下快速照射，照射後維持更長時間
class FrenzyYoungDadaGloryEffect extends Entity {
    constructor(player, durationMs) {
        super(player.x, player.y, 1, 1);
        this.player = player;
        this.duration = durationMs || 3000; // 持續時間3秒（比幼妲光輝更長）
        this.startTime = Date.now();
        this.weaponType = 'FRENZY_YOUNG_DADA_GLORY';
        
        // 特效參數（比幼妲光輝更大更華麗）
        this.maxHeight = 400; // 光芒最大高度（比幼妲光輝的270更大）
        this.topWidth = 30; // 頂部寬度（比幼妲光輝的20更寬）
        this.baseWidth = 120; // 底部寬度（比幼妲光輝的80更寬）
        this.dropDuration = 200; // 快速照射時間（毫秒），稍微慢一點以顯示更華麗的效果
        this.particles = []; // 粒子效果（更多粒子）
        this.outerParticles = []; // 外層粒子效果
        
        // 初始化主體粒子（比幼妲光輝更多）
        for (let i = 0; i < 40; i++) {
            this.particles.push({
                x: (Math.random() - 0.5) * this.baseWidth, // 初始化时设置x位置
                y: 0,
                baseY: -this.maxHeight * (0.5 + Math.random() * 0.5), // 保存基础y位置
                size: Math.random() * 12 + 6,
                baseAlpha: Math.random() * 0.6 + 0.4, // 保存基础透明度
                speed: Math.random() * 4 + 3,
                rotation: Math.random() * Math.PI * 2,
                dropProgress: Math.random() // 保存下降进度偏移
            });
        }
        
        // 初始化外層光暈粒子
        for (let i = 0; i < 30; i++) {
            this.outerParticles.push({
                x: 0,
                y: 0,
                size: Math.random() * 8 + 4,
                baseAlpha: Math.random() * 0.4 + 0.2, // 保存基础透明度
                speed: Math.random() * 2 + 1,
                rotation: Math.random() * Math.PI * 2,
                distance: Math.random() * 60 + 40
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
        
        // 更新主體粒子
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (dropProgress < 1) {
                // 快速下降階段：使用保存的dropProgress偏移来计算y位置
                const effectiveProgress = Math.min(1, dropProgress + p.dropProgress * 0.3);
                p.y = -this.maxHeight + this.maxHeight * effectiveProgress;
            } else {
                // 維持階段：粒子位置固定（使用保存的baseY），但有輕微旋轉動畫
                p.y = p.baseY;
                p.rotation += 0.02 * (deltaTime / 16.67); // 基于deltaTime的旋转
            }
            // x位置在初始化时已设置，不需要每帧重新随机
            // p.x 保持不变
            // alpha基于保存的baseAlpha计算
            p.alpha = (1 - maintainProgress * 0.5) * p.baseAlpha;
        }
        
        // 更新外層光暈粒子（圍繞玩家旋轉）
        for (let i = 0; i < this.outerParticles.length; i++) {
            const p = this.outerParticles[i];
            p.rotation += 0.01 * (deltaTime / 16.67); // 基于deltaTime的旋转
            p.x = Math.cos(p.rotation) * p.distance;
            p.y = Math.sin(p.rotation) * p.distance - this.maxHeight * 0.3;
            // alpha基于保存的baseAlpha计算
            p.alpha = (1 - maintainProgress * 0.3) * p.baseAlpha;
        }
        
        if (elapsed >= this.duration) {
            this.destroy();
        }
    }

    draw(ctx) {
        const elapsed = Date.now() - this.startTime;
        const dropProgress = Math.min(1, elapsed / this.dropDuration);
        const isMaintaining = elapsed >= this.dropDuration;
        const maintainProgress = Math.max(0, (elapsed - this.dropDuration) / (this.duration - this.dropDuration));
        
        ctx.save();
        
        // 計算光芒位置（從上往下）
        const topY = this.player.y - (this.player.height || 20) / 2 - this.maxHeight;
        const baseY = this.player.y + (this.player.height || 20) / 2;
        
        let currentHeight;
        if (isMaintaining) {
            currentHeight = this.maxHeight;
        } else {
            currentHeight = this.maxHeight * dropProgress;
        }
        
        const currentTopY = baseY - currentHeight;
        const currentBaseWidth = this.topWidth + (this.baseWidth - this.topWidth) * (isMaintaining ? 1 : dropProgress);
        
        // 延伸到底部下方，用於羽化邊緣
        const extendedBaseY = baseY + 30;
        const extendedBaseWidth = currentBaseWidth + 30;
        
        // 繪製最外層光暈（新增：超級加強版特有的外層光環）
        const outerRingGradient = ctx.createRadialGradient(
            this.x, baseY, 0,
            this.x, baseY, this.baseWidth + 50
        );
        outerRingGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        outerRingGradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.15)');
        outerRingGradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.08)');
        outerRingGradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.03)');
        outerRingGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = outerRingGradient;
        ctx.beginPath();
        ctx.arc(this.x, baseY, this.baseWidth + 50, 0, Math.PI * 2);
        ctx.fill();
        
        // 繪製主體光芒（比幼妲光輝更亮更飽和）
        const gradient = ctx.createLinearGradient(
            this.x, currentTopY,
            this.x, extendedBaseY
        );
        gradient.addColorStop(0, 'rgba(255, 255, 100, 0.15)'); // 頂部：更亮
        gradient.addColorStop(0.2, 'rgba(255, 255, 150, 0.5)');
        gradient.addColorStop(0.4, 'rgba(255, 255, 200, 0.7)');
        gradient.addColorStop(0.6, 'rgba(255, 255, 220, 0.75)');
        gradient.addColorStop(0.75, 'rgba(255, 255, 240, 0.7)');
        gradient.addColorStop(0.85, 'rgba(255, 255, 250, 0.55)');
        gradient.addColorStop(0.92, 'rgba(255, 255, 250, 0.35)');
        gradient.addColorStop(0.96, 'rgba(255, 255, 250, 0.18)');
        gradient.addColorStop(0.98, 'rgba(255, 255, 250, 0.08)');
        gradient.addColorStop(1, 'rgba(255, 255, 250, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(this.x - this.topWidth / 2, currentTopY);
        ctx.lineTo(this.x + this.topWidth / 2, currentTopY);
        ctx.lineTo(this.x + extendedBaseWidth / 2, extendedBaseY);
        ctx.lineTo(this.x - extendedBaseWidth / 2, extendedBaseY);
        ctx.closePath();
        ctx.fill();
        
        // 繪製中層光暈（新增：超級加強版特有的中層光環）
        const midRingGradient = ctx.createLinearGradient(
            this.x, currentTopY,
            this.x, extendedBaseY
        );
        midRingGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        midRingGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.3)');
        midRingGradient.addColorStop(0.85, 'rgba(255, 255, 255, 0.2)');
        midRingGradient.addColorStop(0.92, 'rgba(255, 255, 255, 0.12)');
        midRingGradient.addColorStop(0.96, 'rgba(255, 255, 255, 0.05)');
        midRingGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = midRingGradient;
        ctx.beginPath();
        ctx.moveTo(this.x - this.topWidth / 2 - 15, currentTopY);
        ctx.lineTo(this.x + this.topWidth / 2 + 15, currentTopY);
        ctx.lineTo(this.x + extendedBaseWidth / 2 + 20, extendedBaseY);
        ctx.lineTo(this.x - extendedBaseWidth / 2 - 20, extendedBaseY);
        ctx.closePath();
        ctx.fill();
        
        // 繪製內層光暈（新增：超級加強版特有的內層光環）
        const innerRingGradient = ctx.createLinearGradient(
            this.x, currentTopY,
            this.x, extendedBaseY
        );
        innerRingGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        innerRingGradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.4)');
        innerRingGradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.25)');
        innerRingGradient.addColorStop(0.95, 'rgba(255, 255, 255, 0.1)');
        innerRingGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = innerRingGradient;
        ctx.beginPath();
        ctx.moveTo(this.x - this.topWidth / 2 - 5, currentTopY);
        ctx.lineTo(this.x + this.topWidth / 2 + 5, currentTopY);
        ctx.lineTo(this.x + extendedBaseWidth / 2 + 8, extendedBaseY);
        ctx.lineTo(this.x - extendedBaseWidth / 2 - 8, extendedBaseY);
        ctx.closePath();
        ctx.fill();
        
        // 繪製多層底部羽化邊緣（比幼妲光輝更大更柔和）
        // 第一層：超大徑向漸變
        const featherRadius1 = 150;
        const featherGradient1 = ctx.createRadialGradient(
            this.x, baseY, 0,
            this.x, baseY, featherRadius1
        );
        featherGradient1.addColorStop(0, 'rgba(255, 255, 200, 0.35)');
        featherGradient1.addColorStop(0.2, 'rgba(255, 255, 200, 0.18)');
        featherGradient1.addColorStop(0.4, 'rgba(255, 255, 200, 0.1)');
        featherGradient1.addColorStop(0.6, 'rgba(255, 255, 200, 0.05)');
        featherGradient1.addColorStop(0.8, 'rgba(255, 255, 200, 0.015)');
        featherGradient1.addColorStop(1, 'rgba(255, 255, 200, 0)');
        
        ctx.fillStyle = featherGradient1;
        ctx.beginPath();
        ctx.arc(this.x, baseY, featherRadius1, 0, Math.PI * 2);
        ctx.fill();
        
        // 第二層：大徑向漸變
        const featherRadius2 = 100;
        const featherGradient2 = ctx.createRadialGradient(
            this.x, baseY, 0,
            this.x, baseY, featherRadius2
        );
        featherGradient2.addColorStop(0, 'rgba(255, 255, 200, 0.3)');
        featherGradient2.addColorStop(0.3, 'rgba(255, 255, 200, 0.15)');
        featherGradient2.addColorStop(0.5, 'rgba(255, 255, 200, 0.08)');
        featherGradient2.addColorStop(0.7, 'rgba(255, 255, 200, 0.04)');
        featherGradient2.addColorStop(0.85, 'rgba(255, 255, 200, 0.015)');
        featherGradient2.addColorStop(1, 'rgba(255, 255, 200, 0)');
        
        ctx.fillStyle = featherGradient2;
        ctx.beginPath();
        ctx.arc(this.x, baseY, featherRadius2, 0, Math.PI * 2);
        ctx.fill();
        
        // 第三層：中等徑向漸變
        const featherRadius3 = 70;
        const featherGradient3 = ctx.createRadialGradient(
            this.x, baseY, 0,
            this.x, baseY, featherRadius3
        );
        featherGradient3.addColorStop(0, 'rgba(255, 255, 200, 0.25)');
        featherGradient3.addColorStop(0.4, 'rgba(255, 255, 200, 0.12)');
        featherGradient3.addColorStop(0.65, 'rgba(255, 255, 200, 0.06)');
        featherGradient3.addColorStop(0.8, 'rgba(255, 255, 200, 0.02)');
        featherGradient3.addColorStop(1, 'rgba(255, 255, 200, 0)');
        
        ctx.fillStyle = featherGradient3;
        ctx.beginPath();
        ctx.arc(this.x, baseY, featherRadius3, 0, Math.PI * 2);
        ctx.fill();
        
        // 第四層：小徑向漸變（新增：超級加強版特有的第四層）
        const featherRadius4 = 50;
        const featherGradient4 = ctx.createRadialGradient(
            this.x, baseY, 0,
            this.x, baseY, featherRadius4
        );
        featherGradient4.addColorStop(0, 'rgba(255, 255, 200, 0.2)');
        featherGradient4.addColorStop(0.5, 'rgba(255, 255, 200, 0.08)');
        featherGradient4.addColorStop(0.75, 'rgba(255, 255, 200, 0.03)');
        featherGradient4.addColorStop(1, 'rgba(255, 255, 200, 0)');
        
        ctx.fillStyle = featherGradient4;
        ctx.beginPath();
        ctx.arc(this.x, baseY, featherRadius4, 0, Math.PI * 2);
        ctx.fill();
        
        // 繪製主體粒子效果（比幼妲光輝更亮更大）
        ctx.globalAlpha = 1;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = 'rgba(255, 255, 200, 0.9)';
            ctx.beginPath();
            ctx.arc(
                this.x + p.x,
                baseY + p.y,
                p.size,
                0,
                Math.PI * 2
            );
            ctx.fill();
            
            // 添加光暈效果（新增：超級加強版特有的粒子光暈）
            ctx.globalAlpha = p.alpha * 0.5;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(
                this.x + p.x,
                baseY + p.y,
                p.size * 1.5,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
        
        // 繪製外層光暈粒子（新增：超級加強版特有的外層旋轉粒子）
        for (let i = 0; i < this.outerParticles.length; i++) {
            const p = this.outerParticles[i];
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
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
        
        // 繪製中心光點（新增：超級加強版特有的中心強光）
        const centerPulse = 0.8 + Math.sin(elapsed * 0.005) * 0.2;
        ctx.globalAlpha = centerPulse * (1 - maintainProgress * 0.3);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(this.x, baseY, 8 * centerPulse, 0, Math.PI * 2);
        ctx.fill();
        
        // 中心外層光暈
        ctx.globalAlpha = centerPulse * 0.6 * (1 - maintainProgress * 0.3);
        ctx.fillStyle = 'rgba(255, 255, 200, 0.8)';
        ctx.beginPath();
        ctx.arc(this.x, baseY, 15 * centerPulse, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    destroy() {
        this.markedForDeletion = true;
    }
}

// 导出到全局
window.FrenzyYoungDadaGloryEffect = FrenzyYoungDadaGloryEffect;

