// BOSS 火彈投射物類別
class BossProjectile extends Entity {
    constructor(x, y, angle, speed, damage, size, homing, turnRate) {
        super(x, y, size, size);
        
        this.angle = angle;
        this.speed = speed;
        this.damage = damage;
        this.homing = homing;
        this.turnRate = turnRate;
        this.lifeTime = 5000; // 5秒後自動消失
        this.createdTime = Date.now();
        
        // 視覺效果
        this.glowSize = size * 1.5;
        this.pulsePhase = Math.random() * Math.PI * 2;
        
        // 粒子效果
        this.particles = [];
        this.particleSpawnTimer = 0;
        this.particleSpawnInterval = 50; // 每50ms生成一個粒子
    }
    
    update(deltaTime) {
        // ✅ 權威多人：此類投射物由伺服器權威模擬與扣血；客戶端只做插值顯示
        try {
            if (this._isVisualOnly && typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                if (typeof this._netTargetX === 'number' && typeof this._netTargetY === 'number') {
                    const dx = this._netTargetX - this.x;
                    const dy = this._netTargetY - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 600) { this.x = this._netTargetX; this.y = this._netTargetY; }
                    else { const lerp = 0.35; this.x += dx * lerp; this.y += dy * lerp; }
                }
                if (typeof this._netAngle === 'number') this.angle = this._netAngle;
                return;
            }
        } catch (_) { }
        const currentTime = Date.now();
        
        // 檢查生命週期
        if (currentTime - this.createdTime > this.lifeTime) {
            this.destroy();
            return;
        }
        
        // ✅ MMORPG 架構：追蹤邏輯，追蹤最近的玩家（本地+遠程），不依賴室長端
        let targetPlayer = Game.player;
        if (this.homing) {
            // ✅ MMORPG 架構：使用 RemotePlayerManager 獲取遠程玩家（所有端都可以）
            // 找到最近的活著的玩家作為目標（本地玩家或遠程玩家）
            if (Game.multiplayer) {
                try {
                    let isSurvivalMode = false;
                    try {
                        const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                            ? GameModeManager.getCurrent()
                            : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                                ? ModeManager.getActiveModeId()
                                : null);
                        isSurvivalMode = (activeId === 'survival' || activeId === null);
                    } catch (_) {}
                    
                    if (isSurvivalMode && typeof window !== 'undefined' && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                        const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                        if (typeof rm.getAllPlayers === 'function') {
                            const remotePlayers = rm.getAllPlayers();
                            let nearestPlayer = Game.player;
                            let nearestDist = Infinity;
                            if (Game.player && !Game.player._isDead) {
                                const dist = Utils.distance(this.x, this.y, Game.player.x, Game.player.y);
                                if (dist < nearestDist) {
                                    nearestDist = dist;
                                    nearestPlayer = Game.player;
                                }
                            }
                            for (const remotePlayer of remotePlayers) {
                                if (remotePlayer && !remotePlayer.markedForDeletion && !remotePlayer._isDead) {
                                    const dist = Utils.distance(this.x, this.y, remotePlayer.x, remotePlayer.y);
                                    if (dist < nearestDist) {
                                        nearestDist = dist;
                                        nearestPlayer = remotePlayer;
                                    }
                                }
                            }
                            targetPlayer = nearestPlayer;
                        }
                    }
                } catch (_) {}
            }
            
            if (targetPlayer) {
                const targetAngle = Utils.angle(this.x, this.y, targetPlayer.x, targetPlayer.y);
                let angleDiff = targetAngle - this.angle;
                
                // 正規化角度差
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                
                // 限制轉向速度
                const maxTurn = this.turnRate * (deltaTime / 16.67);
                angleDiff = Utils.clamp(angleDiff, -maxTurn, maxTurn);
                
                this.angle += angleDiff;
            }
        }
        
        // 移動
        const deltaMul = deltaTime / 16.67;
        this.x += Math.cos(this.angle) * this.speed * deltaMul;
        this.y += Math.sin(this.angle) * this.speed * deltaMul;
        
        // ✅ MMORPG 架構：檢查與所有玩家碰撞（本地+遠程），不依賴室長端
        const allPlayers = [];
        if (Game.player) allPlayers.push(Game.player);
        // ✅ MMORPG 架構：使用 RemotePlayerManager 獲取遠程玩家（所有端都可以）
        if (Game.multiplayer) {
            try {
                let isSurvivalMode = false;
                try {
                    const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                    isSurvivalMode = (activeId === 'survival' || activeId === null);
                } catch (_) {}
                
                if (isSurvivalMode && typeof window !== 'undefined' && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.getAllPlayers === 'function') {
                        const remotePlayers = rm.getAllPlayers();
                        for (const remotePlayer of remotePlayers) {
                            if (remotePlayer && !remotePlayer.markedForDeletion && !remotePlayer._isDead) {
                                allPlayers.push(remotePlayer);
                            }
                        }
                    }
                }
            } catch (_) {}
        }
        
        for (const p of allPlayers) {
            if (p && this.isColliding(p)) {
                // 技能無敵時完全免疫火彈傷害（即便為重擊類型）
                try {
                    if (p && p.invulnerabilitySource === 'INVINCIBLE') {
                        // 仍保留命中特效以維持手感，但不扣血
                        if (typeof AudioManager !== 'undefined') {
                            AudioManager.playSound('bo');
                        }
                        this.createExplosionEffect();
                        this.destroy();
                        return;
                    }
                } catch (_) {}
                // ✅ 元素分類：
                // - **多人元素（伺服器權威）**：玩家扣血/死亡判定
                // - **單機元素（本地）**：BossProjectile 直接呼叫 takeDamage
                // 權威多人時，避免「本地扣血 + 伺服器扣血」造成莫名狂扣血。
                const isServerAuthoritative = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
                if (!isServerAuthoritative) {
                    // 對玩家造成傷害：忽略一般無敵（受傷短暫無敵），但尊重技能無敵
                    // 抽象化技能會在 takeDamage 內部處理回避判定
                    p.takeDamage(this.damage, { ignoreInvulnerability: true, source: 'boss_projectile' });
                }
                // 新增：命中玩家時播放bo音效
                if (typeof AudioManager !== 'undefined') {
                    AudioManager.playSound('bo');
                }
                // 創建爆炸特效
                this.createExplosionEffect();
                // 銷毀投射物
                this.destroy();
                return;
            }
        }
        
        // 檢查邊界
        const margin = 100;
        if (this.x < -margin || this.x > (Game.worldWidth || Game.canvas.width) + margin ||
            this.y < -margin || this.y > (Game.worldHeight || Game.canvas.height) + margin) {
            this.destroy();
            return;
        }
        
        // 更新粒子效果
        this.updateParticles(deltaTime);
        
        // 生成拖尾粒子
        this.particleSpawnTimer += deltaTime;
        if (this.particleSpawnTimer >= this.particleSpawnInterval) {
            this.spawnTrailParticle();
            this.particleSpawnTimer = 0;
        }
        
        // 更新脈衝效果
        this.pulsePhase += deltaTime * 0.01;
    }
    
    draw(ctx) {
        ctx.save();
        
        // 繪製拖尾粒子
        this.drawParticles(ctx);
        
        // 繪製外層光暈
        const pulseScale = 1 + Math.sin(this.pulsePhase) * 0.2;
        const glowRadius = this.glowSize * pulseScale * 0.5;
        
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowRadius);
        gradient.addColorStop(0, 'rgba(255, 100, 0, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 50, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // 繪製火彈核心
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // 繪製內層高亮
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    // 生成拖尾粒子
    spawnTrailParticle() {
        const particle = {
            x: this.x + (Math.random() - 0.5) * this.width,
            y: this.y + (Math.random() - 0.5) * this.width,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            life: 300 + Math.random() * 200,
            maxLife: 300 + Math.random() * 200,
            size: 2 + Math.random() * 3
        };
        
        this.particles.push(particle);
        
        // 限制粒子數量
        if (this.particles.length > 20) {
            this.particles.shift();
        }
    }
    
    // 更新粒子
    updateParticles(deltaTime) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            
            particle.x += particle.vx * (deltaTime / 16.67);
            particle.y += particle.vy * (deltaTime / 16.67);
            particle.life -= deltaTime;
            
            if (particle.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }
    
    // 繪製粒子
    drawParticles(ctx) {
        ctx.save();
        
        for (const particle of this.particles) {
            const alpha = particle.life / particle.maxLife;
            const size = particle.size * alpha;
            
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = '#ff4400';
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    // 創建爆炸特效
    createExplosionEffect() {
        // 創建爆炸粒子 - 增加數量和多樣性
        for (let i = 0; i < 25; i++) {
            const angle = (Math.PI * 2 * i) / 25 + (Math.random() - 0.5) * 0.5;
            const speed = 2 + Math.random() * 6;
            
            const explosionParticle = {
                x: this.x + (Math.random() - 0.5) * 10,
                y: this.y + (Math.random() - 0.5) * 10,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 300 + Math.random() * 400,
                maxLife: 300 + Math.random() * 400,
                size: 2 + Math.random() * 6,
                color: this.getRandomExplosionColor()
            };
            
            // 添加到全域爆炸粒子陣列
            if (!Game.explosionParticles) {
                Game.explosionParticles = [];
            }
            Game.explosionParticles.push(explosionParticle);
            
            // 組隊模式：標記為待廣播的粒子
            try {
                let isSurvivalMode = false;
                try {
                    const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                    isSurvivalMode = (activeId === 'survival' || activeId === null);
                } catch (_) {}
                
                // ✅ MMORPG 架構：所有玩家都能廣播爆炸粒子，不依賴室長端
                if (isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer) {
                    if (!Game._pendingExplosionParticles) Game._pendingExplosionParticles = [];
                    Game._pendingExplosionParticles.push({
                        x: explosionParticle.x,
                        y: explosionParticle.y,
                        vx: explosionParticle.vx,
                        vy: explosionParticle.vy,
                        life: explosionParticle.life,
                        maxLife: explosionParticle.maxLife,
                        size: explosionParticle.size,
                        color: explosionParticle.color,
                        source: 'BOSS_PROJECTILE'
                    });
                }
            } catch (_) {}
        }
        
        // 創建火花粒子
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 4 + Math.random() * 8;
            
            const sparkParticle = {
                x: this.x,
                y: this.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 200 + Math.random() * 300,
                maxLife: 200 + Math.random() * 300,
                size: 1 + Math.random() * 2,
                color: '#ffff00'
            };
            
            Game.explosionParticles.push(sparkParticle);
            
            // 組隊模式：標記為待廣播的粒子
            try {
                let isSurvivalMode = false;
                try {
                    const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                    isSurvivalMode = (activeId === 'survival' || activeId === null);
                } catch (_) {}
                
                // ✅ MMORPG 架構：所有玩家都能廣播爆炸粒子，不依賴室長端
                if (isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer) {
                    if (!Game._pendingExplosionParticles) Game._pendingExplosionParticles = [];
                    Game._pendingExplosionParticles.push({
                        x: sparkParticle.x,
                        y: sparkParticle.y,
                        vx: sparkParticle.vx,
                        vy: sparkParticle.vy,
                        life: sparkParticle.life,
                        maxLife: sparkParticle.maxLife,
                        size: sparkParticle.size,
                        color: sparkParticle.color,
                        source: 'BOSS_PROJECTILE_SPARK'
                    });
                }
            } catch (_) {}
        }
        
        // 創建煙霧粒子
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 2;
            
            const smokeParticle = {
                x: this.x + (Math.random() - 0.5) * 20,
                y: this.y + (Math.random() - 0.5) * 20,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1, // 向上飄散
                life: 800 + Math.random() * 600,
                maxLife: 800 + Math.random() * 600,
                size: 8 + Math.random() * 12,
                color: '#666666'
            };
            
            Game.explosionParticles.push(smokeParticle);
            
            // 組隊模式：標記為待廣播的粒子
            try {
                let isSurvivalMode = false;
                try {
                    const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                    isSurvivalMode = (activeId === 'survival' || activeId === null);
                } catch (_) {}
                
                // ✅ MMORPG 架構：所有玩家都能廣播爆炸粒子，不依賴室長端
                if (isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer) {
                    if (!Game._pendingExplosionParticles) Game._pendingExplosionParticles = [];
                    Game._pendingExplosionParticles.push({
                        x: smokeParticle.x,
                        y: smokeParticle.y,
                        vx: smokeParticle.vx,
                        vy: smokeParticle.vy,
                        life: smokeParticle.life,
                        maxLife: smokeParticle.maxLife,
                        size: smokeParticle.size,
                        color: smokeParticle.color,
                        source: 'BOSS_PROJECTILE_SMOKE'
                    });
                }
            } catch (_) {}
        }
        
        // 創建螢幕閃光效果
        this.createScreenFlash();
        
        // 創建鏡頭震動效果
        this.createCameraShake();
        
        // ✅ 隔離：只允許「組隊 survival（enabled）」送多人封包（避免污染單機/其他模式）
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled === true);
        if (isMultiplayer) {
            try {
                let isSurvivalMode = false;
                try {
                    const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                    isSurvivalMode = (activeId === 'survival' || activeId === null);
                } catch (_) {}
                
                if (isSurvivalMode && typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                    window.SurvivalOnlineBroadcastEvent("screen_effect", {
                        type: 'boss_projectile_explosion',
                        x: this.x,
                        y: this.y,
                        screenFlash: { active: true, intensity: 0.3, duration: 150 },
                        cameraShake: { active: true, intensity: 8, duration: 200 }
                    });
                }
            } catch (_) {}
        }
        
        // 播放爆炸音效（使用既有 'bo' 音效，避免未載入的 'explosion' 名稱）
        if (typeof AudioManager !== 'undefined') {
            AudioManager.playSound('bo');
        }
    }
    
    // 獲取隨機爆炸顏色
    getRandomExplosionColor() {
        const colors = ['#ff0000', '#ff3300', '#ff6600', '#ff9900', '#ffcc00', '#ff4400'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    // 創建螢幕閃光效果
    createScreenFlash() {
        if (!Game.screenFlash) {
            Game.screenFlash = {
                active: false,
                intensity: 0,
                duration: 0
            };
        }
        
        Game.screenFlash.active = true;
        Game.screenFlash.intensity = 0.3; // 閃光強度
        Game.screenFlash.duration = 150; // 持續時間（毫秒）
    }
    
    // 創建鏡頭震動效果
    createCameraShake() {
        if (!Game.cameraShake) {
            Game.cameraShake = {
                active: false,
                intensity: 0,
                duration: 0,
                offsetX: 0,
                offsetY: 0
            };
        }
        
        Game.cameraShake.active = true;
        Game.cameraShake.intensity = 8; // 震動強度
        Game.cameraShake.duration = 200; // 持續時間（毫秒）
    }
}

// ✅ 讓 ES module（例如 survival_online.js）可以從 globalThis 取得建構子
try { if (typeof window !== 'undefined') window.BossProjectile = BossProjectile; } catch (_) {}
