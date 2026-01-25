// 玩家類
class Player extends Entity {
    constructor(x, y) {
        super(x, y, CONFIG.PLAYER.SIZE, CONFIG.PLAYER.SIZE);
        this.speed = CONFIG.PLAYER.SPEED;
        
        // 基礎屬性
        // baseMaxHealth：角色基礎最大血量（含角色加成，不含天賦/局內升級），供 BuffSystem 參考
        this.baseMaxHealth = CONFIG.PLAYER.MAX_HEALTH;
        this.maxHealth = this.baseMaxHealth;
        this.health = this.maxHealth;
        console.log(`玩家初始血量: ${this.health}/${this.maxHealth}`);
        this.collisionRadius = CONFIG.PLAYER.COLLISION_RADIUS;
        this.level = 1;
        this.experience = 0;
        this.experienceToNextLevel = Player.computeExperienceToNextLevel(1);
        this.weapons = [];
        this.isInvulnerable = false;
        this.invulnerabilityTime = 0;
        this.invulnerabilityDuration = 1000; // 受傷後1秒無敵時間
        // 新增：無敵來源（'INVINCIBLE' | 'HIT_FLASH' | null）用於區分技能無敵與受傷短暫無敵
        this.invulnerabilitySource = null;
        
        // 增益系統 - 存儲所有持續性增益效果
        this.buffs = {
            hp_boost: false,  // 生命強化
            // 未來可以添加更多增益
        };
        // 防禦平減（由防禦強化天賦設定）
        this.damageReductionFlat = 0;
        // 新增：基礎防禦（常駐，不納入 SaveCode；維持相容）
        this.baseDefense = 1;

        // 受傷紅閃效果（與敵人一致：150ms，alpha 0.35，沿 PNG alpha 遮罩）
        this.hitFlashTime = 0;
        this.hitFlashDuration = 150; // 毫秒
        
        // 能量與大招狀態
        this.energy = 0;
        this.maxEnergy = CONFIG.ENERGY.MAX;
        this.energyRegenRate = CONFIG.ENERGY.REGEN_PER_SEC;
        this.isUltimateActive = false;
        this.ultimateEndTime = 0;
        this._ultimateBackup = null;
        this.ultimateKeyHeld = false;
        // 是否允許使用大絕（預設為 true，可由選角資料覆寫：CONFIG.CHARACTERS[*].canUseUltimate）
        this.canUseUltimate = true;
        // 大招期間的額外防禦（角色特定配置）
        this._ultimateExtraDefense = 0;
        // 大招期間播放的音效實例（用於結束時停止）
        this._ultimateAudioInstance = null;
        // 大招期間保存的BGM狀態（僅第二位角色使用）
        this._ultimateBgmBackup = null;

        // 玩家朝向（以移動方向為基準；停止時保留上一朝向）
        this.facingAngle = 0;
        // 玩家面向（左右）：true=右，false=左
        this.facingRight = true;

        // 生命自然恢復：每5秒回1HP（不溢出，上限100）
        this.healthRegenIntervalMs = 5000;
        this.healthRegenAccumulator = 0;
        
        // 初始武器 - 飛鏢
        this.addWeapon('DAGGER');
        
        // 組隊模式：死亡和復活狀態
        this._isDead = false;
        this._resurrectionProgress = 0; // 復活進度 0-100
        this._resurrectionLastUpdate = 0; // 上次復活進度更新時間
        this._resurrectionRescuer = null; // 正在復活此玩家的玩家引用
    }

    /**
     * 計算「目前等級 level -> 下一級」所需經驗
     * 需求：Lv1~SOFTCAP_LEVEL 完全沿用舊公式，避免影響前期手感；Lv20+ 後放緩增長避免後期跨太誇張。
     */
    static computeExperienceToNextLevel(level) {
        const cfg = (typeof CONFIG !== 'undefined' && CONFIG.EXPERIENCE) ? CONFIG.EXPERIENCE : null;
        const base = cfg ? (cfg.LEVEL_UP_BASE || 80) : 80;
        const mult = cfg ? (cfg.LEVEL_UP_MULTIPLIER || 1.12) : 1.12;
        const softcap = cfg ? (cfg.SOFTCAP_LEVEL || 20) : 20;
        const lateMult = cfg ? (cfg.LEVEL_UP_MULTIPLIER_LATE || 1.07) : 1.07;
        const lateLinear = cfg ? (cfg.LEVEL_UP_LINEAR_LATE || 30) : 30;

        const lv = Math.max(1, Math.floor(level || 1));

        // 1) 前期：完全沿用舊公式（確保 1~20 手感不變）
        if (lv <= softcap) {
            return Math.floor(base * Math.pow(mult, lv - 1));
        }

        // 2) 後期：以 softcap 當錨點，改用較緩的倍率 + 線性補償（仍會越來越難，但不再指數爆炸）
        const xpAtSoftcap = Math.floor(base * Math.pow(mult, softcap - 1));
        const n = lv - softcap; // 從 softcap 後第 n 級開始
        const value = xpAtSoftcap * Math.pow(lateMult, n) + lateLinear * n;
        // 保底至少比 softcap 時更高，且至少 1
        return Math.max(1, Math.floor(value));
    }
    
    update(deltaTime) {
        // 組隊模式：死亡時不更新移動和武器
        if (this._isDead) {
            // 處理復活邏輯
            this._updateResurrection(deltaTime);
            // 死亡時不更新其他邏輯（移動、武器等）
            return;
        }
        
        // 處理移動（套用deltaTime，以60FPS為基準）
        const deltaMul = deltaTime / 16.67;
        // M4：遠程玩家使用 _remoteInput，本地玩家使用 Input
        // ✅ 修復：遠程玩家的位置主要由狀態消息同步，輸入消息僅作為輔助
        // 這樣可以減少抖動，因為狀態消息的位置是權威的
        let direction = { x: 0, y: 0 };
        if (this._isRemotePlayer) {
          // ✅ 真正的MMORPG：遠程玩家的位置完全由狀態消息同步，不使用輸入預測
          // 這樣可以避免輸入消息和狀態消息衝突，讓移動更自然、不飄
          // 位置更新在 onStateMessage 中處理，這裡不進行移動
          direction = { x: 0, y: 0 };
        } else {
          // 本地玩家：使用 Input 系統
          direction = Input.getMovementDirection();
        }
        // 嘗試分軸移動，並以障礙物進行阻擋
        const tryMove = (newX, newY) => {
            for (const obs of Game.obstacles || []) {
                if (Utils.circleRectCollision(newX, newY, this.collisionRadius, obs.x, obs.y, obs.width, obs.height)) {
                    return false;
                }
            }
            return true;
        };
        // X軸
        const candX = this.x + direction.x * this.speed * deltaMul;
        if (tryMove(candX, this.y)) {
            this.x = candX;
        }
        // Y軸
        const candY = this.y + direction.y * this.speed * deltaMul;
        if (tryMove(this.x, candY)) {
            this.y = candY;
        }

        // 更新玩家朝向角度：只有在實際存在移動輸入時才更新
        if (direction.x !== 0 || direction.y !== 0) {
            this.facingAngle = Math.atan2(direction.y, direction.x);
            // 更新面向（左右）：根據X軸方向判斷
            if (Math.abs(direction.x) > 0.1) {
                this.facingRight = direction.x > 0;
            }
        }
        
        // 限制玩家在世界範圍內（透明牆：距離邊界一定距離）
        {
            const worldW = (Game.worldWidth || CONFIG.CANVAS_WIDTH);
            const worldH = (Game.worldHeight || CONFIG.CANVAS_HEIGHT);
            const margin = CONFIG.PLAYER.BORDER_MARGIN || 0;
            const minX = this.width / 2 + margin;
            const maxX = worldW - this.width / 2 - margin;
            const minY = this.height / 2 + margin;
            const maxY = worldH - this.height / 2 - margin;
            this.x = Utils.clamp(this.x, minX, Math.max(minX, maxX));
            this.y = Utils.clamp(this.y, minY, Math.max(minY, maxY));
        }
        
        // 能量自然恢復（每秒+1，封頂100）
        this.energy = Math.min(this.maxEnergy, this.energy + this.energyRegenRate * (deltaTime / 1000));
        UI.updateEnergyBar(this.energy, this.maxEnergy);

        // 生命自然恢復：每5秒+1（上限100）
        // ✅ 權威伺服器模式：組隊模式下，回血由伺服器權威處理，客戶端只顯示（避免雙重計算導致跳動）
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
        if (!isMultiplayer) {
            // 單機模式：客戶端處理回血（完全正確，0 BUG）
            if (this.health < this.maxHealth) {
                this.healthRegenAccumulator += deltaTime;
                const regenMul = this.healthRegenSpeedMultiplier || 1.0;
                const effectiveInterval = this.healthRegenIntervalMs / Math.max(1.0, regenMul);
                if (this.healthRegenAccumulator >= effectiveInterval) {
                    const ticks = Math.floor(this.healthRegenAccumulator / effectiveInterval);
                    this.healthRegenAccumulator -= ticks * effectiveInterval;
                    this.health = Math.min(this.maxHealth, this.health + ticks);
                    UI.updateHealthBar(this.health, this.maxHealth);
                }
            } else {
                // 滿血時維持計時器但不回復；避免溢出
                this.healthRegenAccumulator = 0;
            }
        }
        // 組隊模式：回血由伺服器權威處理（server/game-state.js updatePlayers），客戶端只更新UI顯示
        // 伺服器同步的 health 會在 handleServerGameState 中更新，這裡只更新UI
        if (isMultiplayer) {
            UI.updateHealthBar(this.health, this.maxHealth);
        }

        // 監聽大招觸發（Q鍵）— 僅當角色允許使用大絕時才處理
        const qDown = Input.isKeyDown('q') || Input.isKeyDown('Q');
        if (this.canUseUltimate && qDown && !this.ultimateKeyHeld) {
            this.tryActivateUltimate();
        }
        this.ultimateKeyHeld = qDown;

        // 大招結束判定
        if (this.isUltimateActive && Date.now() >= this.ultimateEndTime) {
            this.deactivateUltimate();
        }

        // 更新無敵狀態
        if (this.isInvulnerable) {
            this.invulnerabilityTime += deltaTime;
            if (this.invulnerabilityTime >= this.invulnerabilityDuration) {
                this.isInvulnerable = false;
                this.invulnerabilityTime = 0;
                this.invulnerabilitySource = null; // 到期清空無敵來源
            }
        }

        // 更新受傷紅閃計時
        if (this.hitFlashTime > 0) {
            this.hitFlashTime = Math.max(0, this.hitFlashTime - deltaTime);
        }
    }
    
    // 更新復活邏輯
    _updateResurrection(deltaTime) {
        if (!this._isDead) return;
        
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer);
        if (!isMultiplayer) return;

        // ✅ 多人元素（伺服器權威）：救援進度/成功由伺服器統一判定
        // 這裡只保留 UI 顯示（_resurrectionProgress 會由 survival_online.js 的 game-state 同步覆蓋）
        try {
            if (Game.multiplayer && Game.multiplayer.enabled) {
                return;
            }
        } catch (_) {}
        
        // 檢查是否有其他玩家接觸（復活範圍：碰撞半徑的2倍）
        const resurrectionRadius = (this.collisionRadius || 26) * 2;
        let nearestRescuer = null;
        let minDistance = Infinity;
        
        // 檢查本地玩家（如果不是自己）
        if (typeof Game !== 'undefined' && Game.player && Game.player !== this && !Game.player._isDead) {
            const dx = Game.player.x - this.x;
            const dy = Game.player.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= resurrectionRadius && dist < minDistance) {
                minDistance = dist;
                nearestRescuer = Game.player;
            }
        }
        
        // ✅ MMORPG 架構：使用 RemotePlayerManager 獲取遠程玩家（所有端都可以）
        // 檢查遠程玩家
        if (typeof Game !== 'undefined' && Game.multiplayer) {
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
                            if (!remotePlayer || remotePlayer === this || remotePlayer._isDead) continue;
                            const dx = remotePlayer.x - this.x;
                            const dy = remotePlayer.y - this.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist <= resurrectionRadius && dist < minDistance) {
                                minDistance = dist;
                                nearestRescuer = remotePlayer;
                            }
                        }
                    }
                }
            } catch (_) {}
        }
        
        // 檢查通過 Runtime 獲取的遠程玩家
        if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.getRemotePlayers === 'function') {
            const remotePlayers = window.SurvivalOnlineRuntime.getRemotePlayers() || [];
            for (const remotePlayer of remotePlayers) {
                if (!remotePlayer || remotePlayer._isDead) continue;
                // 跳過自己
                if (typeof Game !== 'undefined' && Game.multiplayer && remotePlayer.uid === Game.multiplayer.uid) continue;
                const dx = remotePlayer.x - this.x;
                const dy = remotePlayer.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= resurrectionRadius && dist < minDistance) {
                    minDistance = dist;
                    // 創建一個臨時對象用於復活檢查
                    nearestRescuer = { x: remotePlayer.x, y: remotePlayer.y, _isRemotePlayer: true };
                }
            }
        }
        
        // 如果有救援者，增加復活進度
        if (nearestRescuer) {
            this._resurrectionRescuer = nearestRescuer;
            // 每秒+10%（每100ms+1%）
            const progressPerMs = 1.0 / 1000; // 每秒1.0，即100%
            this._resurrectionProgress = Math.min(100, this._resurrectionProgress + progressPerMs * deltaTime);
            
            // 如果達到100%，復活
            if (this._resurrectionProgress >= 100) {
                this.resurrect();
            }
        } else {
            // 沒有救援者，保持當前進度
            this._resurrectionRescuer = null;
        }
    }
    
    draw(ctx) {
        // 繪製玩家
        ctx.save();
        
        // 無敵狀態閃爍效果
        if (this.isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }
        
        // 使用玩家圖片（大招期間使用角色特定圖片或預設 playerN）；改用 GIF 覆蓋層以保證動畫
        let baseKey = (this.spriteImageKey && Game.images && Game.images[this.spriteImageKey])
            ? this.spriteImageKey
            : 'player';
        
        // 特殊處理：player2根據移動方向切換圖片（左邊player2.png，右邊player2-1.png）
        if (baseKey === 'player2' && !this.isUltimateActive) {
            baseKey = this.facingRight ? 'player2-1' : 'player2';
        }
        
        // 使用角色特定的大招圖片鍵（若存在），否則使用預設
        const ultimateImgKey = (this.isUltimateActive && this._ultimateImageKey && Game.images && Game.images[this._ultimateImageKey])
            ? this._ultimateImageKey
            : (this.isUltimateActive && Game.images && Game.images[CONFIG.ULTIMATE.IMAGE_KEY])
                ? CONFIG.ULTIMATE.IMAGE_KEY
                : null;
        const imgKey = ultimateImgKey || baseKey;
        const imgObj = (Game.images && Game.images[imgKey]) ? Game.images[imgKey] : null;
        if (imgObj) {
            const baseSize = Math.max(this.width, this.height);
            const visualScale = (CONFIG && CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') ? CONFIG.PLAYER.VISUAL_SCALE : 1.0;
            const camX = (typeof Game !== 'undefined' && Game && Game.camera) ? Game.camera.x : 0;
            const camY = (typeof Game !== 'undefined' && Game && Game.camera) ? Game.camera.y : 0;
            const shakeX = (typeof Game !== 'undefined' && Game && Game.cameraShake && Game.cameraShake.active) ? (Game.cameraShake.offsetX || 0) : 0;
            const shakeY = (typeof Game !== 'undefined' && Game && Game.cameraShake && Game.cameraShake.active) ? (Game.cameraShake.offsetY || 0) : 0;
            const screenX = this.x - camX - shakeX;
            const screenY = this.y - camY - shakeY;
            if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.showOrUpdate === 'function') {
                // 為遠程玩家使用唯一的ID（避免與本地玩家衝突）
                const overlayId = this._isRemotePlayer && this._remoteUid 
                    ? `remote-player-${this._remoteUid}` 
                    : 'player';
                
                // 特殊處理：player4.png 需要保持 500:627 的寬高比
                // 特殊處理：player5.png 需要保持 500:467 的寬高比
                // 特殊處理：playerN3.png 需要保持 267:300 的寬高比
                // 特殊處理：player3.gif 需要保持原比例（與冒險模式一致）
                // 特殊處理：player6.gif 需要保持 242:320 的寬高比
                if (imgKey === 'player4' && imgObj.complete) {
                    const imgWidth = imgObj.naturalWidth || imgObj.width || 500;
                    const imgHeight = imgObj.naturalHeight || imgObj.height || 627;
                    const aspectRatio = imgWidth / imgHeight; // 500/627 ≈ 0.798
                    // 以高度為基準計算顯示尺寸（保持與其他角色相近的高度）
                    const renderHeight = Math.max(1, Math.floor(baseSize * visualScale));
                    const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                    window.GifOverlay.showOrUpdate(overlayId, imgObj.src, screenX, screenY, { width: renderWidth, height: renderHeight });
                } else if (imgKey === 'player5' && imgObj.complete) {
                    // player5.png 保持寬高比 (500:467)
                    const imgWidth = imgObj.naturalWidth || imgObj.width || 500;
                    const imgHeight = imgObj.naturalHeight || imgObj.height || 467;
                    const aspectRatio = imgWidth / imgHeight; // 500/467 ≈ 1.071
                    // 以高度為基準計算顯示尺寸（保持與其他角色相近的高度）
                    const renderHeight = Math.max(1, Math.floor(baseSize * visualScale));
                    const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                    window.GifOverlay.showOrUpdate(overlayId, imgObj.src, screenX, screenY, { width: renderWidth, height: renderHeight });
                } else if (imgKey === 'playerN3' && imgObj.complete) {
                    const imgWidth = imgObj.naturalWidth || imgObj.width || 267;
                    const imgHeight = imgObj.naturalHeight || imgObj.height || 300;
                    const aspectRatio = imgWidth / imgHeight; // 267/300 = 0.89
                    // 以高度為基準計算顯示尺寸（保持與其他角色相近的高度）
                    const renderHeight = Math.max(1, Math.floor(baseSize * visualScale));
                    const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                    window.GifOverlay.showOrUpdate(overlayId, imgObj.src, screenX, screenY, { width: renderWidth, height: renderHeight });
                } else if (imgKey === 'player3' && imgObj.complete) {
                    // player3.gif 保持原比例（1:1），使用模式原有的尺寸計算
                    const imgWidth = imgObj.naturalWidth || imgObj.width || 320;
                    const imgHeight = imgObj.naturalHeight || imgObj.height || 320;
                    const aspectRatio = imgWidth / imgHeight; // 320/320 = 1.0
                    // 使用模式原有的尺寸計算方式，保持原比例
                    const renderHeight = Math.max(1, Math.floor(baseSize * visualScale));
                    const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                    window.GifOverlay.showOrUpdate(overlayId, imgObj.src, screenX, screenY, { width: renderWidth, height: renderHeight });
                } else if (imgKey === 'player6' && imgObj.complete) {
                    // player6.gif 保持寬高比 (242:320)
                    const imgWidth = imgObj.naturalWidth || imgObj.width || 242;
                    const imgHeight = imgObj.naturalHeight || imgObj.height || 320;
                    const aspectRatio = imgWidth / imgHeight; // 242/320 ≈ 0.756
                    const renderHeight = Math.max(1, Math.floor(baseSize * visualScale));
                    const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                    window.GifOverlay.showOrUpdate(overlayId, imgObj.src, screenX, screenY, { width: renderWidth, height: renderHeight });
                } else if (imgKey === 'player' && imgObj.complete) {
                    // player.gif 保持原比例（1:1），使用模式原有的尺寸計算
                    const imgWidth = imgObj.naturalWidth || imgObj.width || 320;
                    const imgHeight = imgObj.naturalHeight || imgObj.height || 320;
                    const aspectRatio = imgWidth / imgHeight; // 320/320 = 1.0
                    // 使用模式原有的尺寸計算方式，保持原比例
                    const renderHeight = Math.max(1, Math.floor(baseSize * visualScale));
                    const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                    window.GifOverlay.showOrUpdate(overlayId, imgObj.src, screenX, screenY, { width: renderWidth, height: renderHeight });
                } else if ((imgKey === 'player2' || imgKey === 'player2-1') && imgObj.complete) {
                    // player2.png / player2-1.png 保持原比例（290x242），使用模式原有的尺寸計算
                    const imgWidth = imgObj.naturalWidth || imgObj.width || 290;
                    const imgHeight = imgObj.naturalHeight || imgObj.height || 242;
                    const aspectRatio = imgWidth / imgHeight; // 290/242 ≈ 1.198
                    // 使用模式原有的尺寸計算方式，保持原比例
                    const renderHeight = Math.max(1, Math.floor(baseSize * visualScale));
                    const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                    window.GifOverlay.showOrUpdate(overlayId, imgObj.src, screenX, screenY, { width: renderWidth, height: renderHeight });
                } else {
                    // 其他角色使用正方形顯示（保持原有行為）
                    const renderSize = Math.max(1, Math.floor(baseSize * visualScale));
                    window.GifOverlay.showOrUpdate(overlayId, imgObj.src, screenX, screenY, renderSize);
                }
                // 第二位角色大絕期間：將玩家GIF置於守護領域之上（z-index 5 > 4）
                // 注意：遠程玩家使用不同的ID，需要根據overlayId來獲取元素
                if (this.isUltimateActive && this._ultimateImageKey === 'playerN2') {
                    try {
                        const playerGifEl = document.getElementById(`gif-overlay-${overlayId}`);
                        if (playerGifEl) {
                            playerGifEl.style.zIndex = '5'; // 高於守護領域的 z-index 4
                        }
                    } catch (_) {}
                } else {
                    // 非第二位角色大絕時，恢復預設 z-index
                    try {
                        const playerGifEl = document.getElementById(`gif-overlay-${overlayId}`);
                        if (playerGifEl) {
                            playerGifEl.style.zIndex = '3'; // 恢復預設值
                        }
                    } catch (_) {}
                }
            } else {
                // 後備方案：僅在 GifOverlay 不可用時才使用 Canvas 繪製（會導致畫質降低，應避免）
                // 正常情況下應使用 GifOverlay 以保持最佳畫質
                const renderSize = Math.max(1, Math.floor(baseSize * visualScale));
                ctx.drawImage(imgObj, this.x - renderSize / 2, this.y - renderSize / 2, renderSize, renderSize);
            }
        } else {
            // 備用：使用純色球體（同樣僅視覺放大）
            const visualScale = (CONFIG && CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') ? CONFIG.PLAYER.VISUAL_SCALE : 1.0;
            const radius = (this.width / 2) * visualScale;
            ctx.fillStyle = '#00f';
            ctx.beginPath();
            ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // 繪製方向指示器
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 3, this.y - this.height / 3, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        // 受傷紅閃（簡單圖片閃）：若有 DOM 閃功能，效果在 takeDamage 觸發；否則使用 Canvas 後備
        if (this.hitFlashTime > 0 && !this._isDead) {
            const alpha = 0.35;
            const baseSize = Math.max(this.width, this.height);
            const visualScale = (CONFIG && CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') ? CONFIG.PLAYER.VISUAL_SCALE : 1.0;
            const renderSize = Math.max(1, Math.floor(baseSize * visualScale));
            const camX = (typeof Game !== 'undefined' && Game && Game.camera) ? Game.camera.x : 0;
            const camY = (typeof Game !== 'undefined' && Game && Game.camera) ? Game.camera.y : 0;
            const shakeX = (typeof Game !== 'undefined' && Game && Game.cameraShake && Game.cameraShake.active) ? (Game.cameraShake.offsetX || 0) : 0;
            const shakeY = (typeof Game !== 'undefined' && Game && Game.cameraShake && Game.cameraShake.active) ? (Game.cameraShake.offsetY || 0) : 0;
            const screenX = this.x - camX - shakeX;
            const screenY = this.y - camY - shakeY;
            // 若有簡單 DOM 閃功能，於 takeDamage 已觸發；這裡不重複疊加
            if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.flash === 'function') {
                // no-op: DOM 閃已處理
            } else {
                // 後備：以紅色半透明圓形簡化顯示（不使用遮罩與快取）
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(this.x, this.y, renderSize / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        } else {
            // 純圖片閃已在 DOM 層自動復原，無需額外隱藏呼叫
        }
        
        ctx.restore();
        
        // 組隊模式：繪製血條（在角色上方）
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer);
        if (isMultiplayer) {
            this._drawHealthBar(ctx);
        }
    }
    
    // 繪製血條（組隊模式）
    _drawHealthBar(ctx) {
        if (!ctx) return;
        
        // 注意：畫布已經被 translate(-cameraOffsetX, -cameraOffsetY) 平移了
        // 所以這裡直接使用世界座標即可，不需要再減去相機位置
        // 血條位置：角色上方
        const barWidth = 40;
        const barHeight = 4;
        // 使用視覺尺寸計算位置（考慮 VISUAL_SCALE）
        const visualScale = (CONFIG && CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') ? CONFIG.PLAYER.VISUAL_SCALE : 1.0;
        const baseSize = Math.max(this.width, this.height);
        const visualSize = baseSize * visualScale;
        const barOffsetY = -visualSize / 2 - 8; // 角色上方8像素
        const barX = this.x - barWidth / 2;
        const barY = this.y + barOffsetY;
        
        // 死亡時血條顯示為0
        const healthPercent = this._isDead ? 0 : (this.health / this.maxHealth);
        
        // 繪製血條背景（深紅色）
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
        
        // 繪製血條（紅色到綠色漸變）
        if (healthPercent > 0) {
            const healthWidth = barWidth * healthPercent;
            // 根據血量百分比決定顏色（0-30%紅色，30-70%黃色，70-100%綠色）
            let healthColor = '#ff0000';
            if (healthPercent > 0.7) {
                healthColor = '#00ff00';
            } else if (healthPercent > 0.3) {
                healthColor = '#ffff00';
            }
            ctx.fillStyle = healthColor;
            ctx.fillRect(barX, barY, healthWidth, barHeight);
        }
        
        // 如果正在復活，繪製復活進度條（在血條下方）
        if (this._isDead && this._resurrectionProgress > 0) {
            const resBarHeight = 3;
            const resBarY = barY + barHeight + 1;
            const resBarWidth = barWidth * (this._resurrectionProgress / 100);
            
            // 復活進度條背景
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(barX - 1, resBarY - 1, barWidth + 2, resBarHeight + 2);
            
            // 復活進度條（藍色）
            ctx.fillStyle = '#00aaff';
            ctx.fillRect(barX, resBarY, resBarWidth, resBarHeight);
        }
    }
    
    // 受到傷害
    takeDamage(amount, options = {}) {
        // options.ignoreInvulnerability: 略過無敵判定（彈幕/火焰彈等重擊）
        const ignoreInvulnerability = !!(options && options.ignoreInvulnerability);
        if (this.invulnerabilitySource === 'INVINCIBLE') return;
        if (this.isInvulnerable) {
            // 若攻擊不要求忽略無敵，直接免疫
            if (!ignoreInvulnerability) return;
            // 若為技能無敵（INVINCIBLE），即便攻擊要求忽略無敵也需尊重技能無敵
            if (this.invulnerabilitySource === 'INVINCIBLE') return;
            // 其餘情況（受傷短暫無敵），允許忽略並造成傷害
        }
        
        // options.ignoreDodge: 略過迴避判定（地圖陷阱/環境傷害等）
        const ignoreDodge = !!(options && options.ignoreDodge);
        if (!ignoreDodge) {
            // 被動回避技能：抽象化 / 第六感（適用於所有傷害來源，包括小BOSS火焰彈和彈幕）
            let weaponDodgeRate = 0;
            if (this.weapons && Array.isArray(this.weapons)) {
                // 抽象化（灰妲）與第六感（鳳梨）邏輯相同：讀取各自 DODGE_RATES
                const passiveDodgeTypes = ['ABSTRACTION', 'SIXTH_SENSE'];
                passiveDodgeTypes.forEach(t => {
                    const wpn = this.weapons.find(w => w && w.type === t);
                    if (wpn && wpn.config && Array.isArray(wpn.config.DODGE_RATES)) {
                        const level = wpn.level || 1;
                        weaponDodgeRate += wpn.config.DODGE_RATES[level - 1] || 0;
                    }
                });
            }
            
            // 迴避強化天賦：與抽象化疊加
            const talentDodgeRate = this.dodgeTalentRate || 0;
            // 角色基礎迴避率（例如：鳳梨不咬舌初始 10%）
            const characterDodgeRate = this._characterBaseDodgeRate || 0;
            const totalDodgeRate = weaponDodgeRate + talentDodgeRate + characterDodgeRate;
            
            // 計算總迴避率（生存模式：灰妲最高40%，其他角色15%；其他模式：所有角色15%）
            // 注意：抽象化技能只在生存模式存在，所以其他模式只會有天賦迴避
            let finalDodgeRate = totalDodgeRate;
            if (typeof Game !== 'undefined' && Game.mode === 'survival') {
                // 生存模式：灰妲最高40%（25%抽象化+15%天賦），其他角色15%（天賦）
                const isDada = (this.character && this.character.id === 'dada');
                if (isDada) {
                    finalDodgeRate = Math.min(0.40, totalDodgeRate);
                } else {
                    finalDodgeRate = Math.min(0.15, talentDodgeRate + characterDodgeRate);
                }
            } else {
                // 其他模式：所有角色最高15%（天賦 + 角色基礎迴避）
                finalDodgeRate = Math.min(0.15, talentDodgeRate + characterDodgeRate);
            }
            
            if (finalDodgeRate > 0 && Math.random() < finalDodgeRate) {
                // 回避成功，不造成傷害
                return;
            }
        }
        
        // 防禦：基礎防禦 + 天賦平減（不為負）
        const baseDef = this.baseDefense || 0;
        const talentDef = this.damageReductionFlat || 0;
        const reduction = baseDef + talentDef;
        const effective = Math.max(0, amount - reduction);
        
        this.health -= effective;
        if (this.health <= 0) {
            this.health = 0;
            this.die();
        } else {
            // 受傷後短暫無敵（即便忽略無敵判定，仍啟動受傷視覺與短暫保護，避免連擊過度懲罰）
            this.isInvulnerable = true;
            this.invulnerabilityTime = 0;
            this.invulnerabilitySource = 'HIT_FLASH';
            // 啟動紅閃
            this.hitFlashTime = this.hitFlashDuration;
            // 觸發簡單圖片閃：在玩家 GIF 上套用紅色光暈與透明度
            try {
                if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.flash === 'function') {
                    window.GifOverlay.flash('player', { color: '#ff0000', durationMs: this.hitFlashDuration, opacity: 0.8 });
                }
            } catch (_) {}
        }
        
        // 更新UI
        UI.updateHealthBar(this.health, this.maxHealth);
    }

    // 施加技能無敵：在指定毫秒內免疫傷害（BOSS/彈幕亦尊重此技能無敵）
    applyInvincibility(durationMs) {
        const d = Math.max(0, Math.floor(durationMs || 0));
        this.isInvulnerable = true;
        this.invulnerabilityTime = 0;
        this.invulnerabilityDuration = d > 0 ? d : this.invulnerabilityDuration;
        this.invulnerabilitySource = 'INVINCIBLE';
        // ✅ 修复：不在这里创建 InvincibleEffect，因为 weapon.js 的 fire() 方法已经创建了
        // 如果这里也创建，会导致重复创建，造成重叠问题
        // 这里只设置无敌状态，视觉效果由 weapon.js 的 fire() 方法处理
    }
    
    // 死亡
     die() {
         if (Game.isGameOver || this._isDead) return;
         this._isDead = true;
         // 清理大招狀態（包括音效、額外防禦、BGM備份等）
         if (this.isUltimateActive) {
             this.deactivateUltimate();
         } else if (this._ultimateBgmBackup) {
             // 如果大招已結束但BGM備份還在，清理它
             this._ultimateBgmBackup = null;
         }
         
        // 組隊模式：死亡時停止攻擊和移動，但不結束遊戲
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer);
        const isServerAuthoritative = !!(isMultiplayer && Game.multiplayer && Game.multiplayer.enabled);
        if (isMultiplayer) {
             // 清除所有武器（停止攻擊）
             this.clearWeapons();
             // 血量歸0
             this.health = 0;
             // 復活進度重置
             this._resurrectionProgress = 0;
             this._resurrectionRescuer = null;

            // ✅ 權威伺服器模式：死亡/全滅判定由伺服器 state.isDead/state.isGameOver 統一權威
            // 避免客戶端廣播 player_death/game_over 造成互打與循環。
            if (!isServerAuthoritative) {
                // 舊模式（非 enabled）才保留事件廣播（隔離：只允許 survival）
                let isSurvivalMode = false;
                try {
                    const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                    isSurvivalMode = (activeId === 'survival' || activeId === null);
                } catch (_) { }
                if (isSurvivalMode && typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                    window.SurvivalOnlineBroadcastEvent("player_death", {
                        playerUid: (Game.multiplayer && Game.multiplayer.uid) ? Game.multiplayer.uid : null
                    });
                }
                this._checkAllPlayersDead();
            }
         } else {
             // 單人模式：直接結束遊戲
             Game.gameOver();
         }
     }
     
     // 復活
     resurrect(opts = {}) {
         if (!this._isDead) return;
         this._isDead = false;
         this.health = this.maxHealth;
         this._resurrectionProgress = 0;
         this._resurrectionRescuer = null;
         // 恢復初始武器
         this.addWeapon('DAGGER');
         // ✅ 權威伺服器模式：復活狀態由伺服器權威；本地行為僅在 server 回傳時套用
         try {
             if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                 const fromServer = !!(opts && opts.fromServer);
                 // ✅ 切腫瘤：禁止客戶端主動送 resurrect（會變成自救外掛/繞過救援機制）
                 // 權威多人只允許伺服器在救援成功時回傳狀態來復活（fromServer:true）。
                 if (!fromServer) {
                     // 回到死亡狀態（保持安全），等待伺服器救援完成
                     this._isDead = true;
                     this.health = 0;
                 }
                 return;
             }
         } catch (_) { }
        // 舊模式：廣播復活狀態（隔離：只允許 survival）
        if (typeof Game !== 'undefined' && Game.multiplayer && typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null);
            } catch (_) { }
            if (isSurvivalMode) {
                window.SurvivalOnlineBroadcastEvent("player_resurrect", {
                    playerUid: (Game.multiplayer && Game.multiplayer.uid) ? Game.multiplayer.uid : null
                });
            }
        }
     }
     
    // ✅ MMORPG 架構：所有玩家都能檢查遊戲失敗，不依賴隊長端
    _checkAllPlayersDead() {
        if (!Game || !Game.multiplayer) return;
        // ✅ 權威伺服器模式：全滅判定由伺服器 checkGameOver 統一權威
        if (Game.multiplayer && Game.multiplayer.enabled) return;
         if (Game.isGameOver) return; // 已經結束了
         
         try {
             // ✅ 修復：檢查所有玩家（本地+遠程）是否都死亡，不管本地玩家是否死亡
             // 先檢查本地玩家是否死亡
             const localPlayerDead = this._isDead;
             
            // 檢查所有遠程玩家是否都死亡
             let allRemotePlayersDead = true;
             
            // 通過 RemotePlayerManager 獲取遠程玩家（完整的 Player 對象）
            if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                if (typeof rm.getAllPlayers === 'function') {
                    const remotePlayers = rm.getAllPlayers();
                    if (remotePlayers && remotePlayers.length > 0) {
                        for (const remotePlayer of remotePlayers) {
                            // 檢查完整的 Player 對象的死亡狀態
                            if (remotePlayer && typeof remotePlayer._isDead === "boolean" && !remotePlayer._isDead) {
                                allRemotePlayersDead = false;
                                break;
                            }
                        }
                    } else {
                        // ✅ 修復：如果房間其實有其他隊員，但遠端玩家物件尚未建立，不要直接判定「全死」
                        // 這能避免剛進房/剛重連時，因遠端列表尚未就緒導致誤觸 game_over
                        try {
                            if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.getMembersState === 'function') {
                                const members = window.SurvivalOnlineRuntime.getMembersState() || [];
                                const aliveOthersExist = Array.isArray(members) && members.some(m => m && m.uid && m.uid !== (Game.multiplayer && Game.multiplayer.uid));
                                if (aliveOthersExist) {
                                    allRemotePlayersDead = false;
                                } else {
                                    allRemotePlayersDead = true;
                                }
                            } else {
                                allRemotePlayersDead = true;
                            }
                        } catch (_) { allRemotePlayersDead = true; }
                    }
                } else {
                    // 如果 RemotePlayerManager 不可用，嘗試通過 Runtime 獲取（簡化狀態）
                    if (typeof window.SurvivalOnlineRuntime.getRemotePlayers === 'function') {
                        const remotePlayers = window.SurvivalOnlineRuntime.getRemotePlayers() || [];
                        if (remotePlayers.length > 0) {
                            for (const remotePlayer of remotePlayers) {
                                // 檢查簡化狀態的死亡標記
                                if (remotePlayer && typeof remotePlayer._isDead === "boolean" && !remotePlayer._isDead) {
                                    allRemotePlayersDead = false;
                                    break;
                                }
                            }
                        } else {
                            // ✅ 同上：遠端狀態尚未就緒時避免誤判全死
                            try {
                                if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.getMembersState === 'function') {
                                    const members = window.SurvivalOnlineRuntime.getMembersState() || [];
                                    const aliveOthersExist = Array.isArray(members) && members.some(m => m && m.uid && m.uid !== (Game.multiplayer && Game.multiplayer.uid));
                                    if (aliveOthersExist) {
                                        allRemotePlayersDead = false;
                                    } else {
                                        allRemotePlayersDead = true;
                                    }
                                } else {
                                    allRemotePlayersDead = true;
                                }
                            } catch (_) { allRemotePlayersDead = true; }
                        }
                    } else {
                        // 無法獲取遠程玩家信息，假設只有本地玩家
                        allRemotePlayersDead = true;
                    }
                }
            } else {
                // 無法獲取遠程玩家信息，假設只有本地玩家
                allRemotePlayersDead = true;
            }
             
            // ✅ MMORPG 架構：如果所有玩家都死亡，觸發遊戲結束
            // 使用防重複機制：第一個檢測到的玩家廣播 game_over 事件
            // ✅ 修復：只有當本地玩家和所有遠程玩家都死亡時，才觸發遊戲結束
            if (localPlayerDead && allRemotePlayersDead) {
                // 先檢查是否已經有 game_over 事件在處理中（防止重複觸發）
                if (Game._gameOverEventSent) return; // 已經有其他玩家觸發了
                Game._gameOverEventSent = true; // 標記為已觸發
                
                // 廣播遊戲結束事件（舊模式；隔離：只允許 survival）
                if (typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                    let isSurvivalMode = false;
                    try {
                        const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                            ? GameModeManager.getCurrent()
                            : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                                ? ModeManager.getActiveModeId()
                                : null);
                        isSurvivalMode = (activeId === 'survival' || activeId === null);
                    } catch (_) { }
                    if (isSurvivalMode) {
                        window.SurvivalOnlineBroadcastEvent("game_over", {
                            reason: "all_players_dead"
                        });
                    }
                }
                 Game.gameOver();
             }
         } catch (e) {
             console.warn("[Player] 檢查所有玩家死亡狀態失敗:", e);
         }
     }
     
     // 清除所有武器
     clearWeapons() {
         if (this.weapons && Array.isArray(this.weapons)) {
             for (const weapon of this.weapons) {
                 if (weapon && typeof weapon.destroy === 'function') {
                     try {
                         weapon.destroy();
                     } catch (_) {}
                 }
             }
             this.weapons = [];
         }
     }
    
    // 獲得經驗
    gainExperience(amount, options = {}) {
        // options.ignoreMultiplier: 管理員/測試用途，直接增加固定經驗（不吃天賦/加成）
        const ignoreMultiplier = !!(options && options.ignoreMultiplier);
        const mul = ignoreMultiplier ? 1.0 : ((this.experienceGainMultiplier != null) ? this.experienceGainMultiplier : 1.0);
        const finalAmount = Math.max(0, Math.floor((amount || 0) * mul));
        
        // ✅ 單機元素：音效是單機元素，只在本地播放
        // 在組隊模式下，經驗由伺服器同步，需要在 gainExperience 中播放音效
        // 在單機模式下，經驗球收集時會播放音效，這裡不需要重複播放
        if (finalAmount > 0 && typeof AudioManager !== 'undefined') {
            const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
            // 組隊模式下：經驗由伺服器同步，在這裡播放音效
            // 單機模式下：經驗球收集時會在 experience.js 中播放音效，這裡不播放（避免重複）
            // ✅ 修復：音效是單機元素，只在本地玩家播放
            if (isMultiplayer && !this._isRemotePlayer) {
                // 尊重 EXP 音效開關
                if (AudioManager.expSoundEnabled !== false) {
                    AudioManager.playSound('collect_exp');
                }
            }
            // 單機模式下，如果 options.silent 為 false 或未設置，則不播放音效（由 experience.js 播放）
            // 如果 options.silent 為 true，則不播放音效（由調用者控制，例如從其他來源獲得經驗時）
        }
        
        this.experience += finalAmount;
        
        // ✅ 组队模式：如果升级菜单正在显示，延迟处理升级（避免覆盖菜单）
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
        if (isMultiplayer && typeof UI !== 'undefined' && UI.levelUpMenu && !UI.levelUpMenu.classList.contains('hidden')) {
            // 菜单正在显示，检查是否需要将升级加入队列
            // 计算可以升级的次数
            let pendingUpgrades = 0;
            let tempExp = this.experience;
            let tempExpToNext = this.experienceToNextLevel;
            let tempLevel = this.level;
            while (tempExp >= tempExpToNext) {
                pendingUpgrades++;
                tempExp -= tempExpToNext;
                tempLevel++;
                tempExpToNext = Player.computeExperienceToNextLevel(tempLevel);
            }
            // 将待处理的升级加入队列（避免重复添加）
            if (pendingUpgrades > 0 && UI._pendingLevelUps) {
                // 只添加一次，因为 hideLevelUpMenu 会处理所有待升级的等级
                // ⚠️ 修复：使用字符串标记，便于区分经验升级和宝箱升级
                if (UI._pendingLevelUps.length === 0) {
                    UI._pendingLevelUps.push('exp'); // 标记为经验升级
                }
            }
            // 更新UI
            UI.updateExpBar(this.experience, this.experienceToNextLevel);
            return;
        }
        
        // 檢查是否升級（单机模式或菜单未显示时）
        // ✅ 单机模式：只调用一次 levelUp()，后续升级由 hideLevelUpMenu() 处理（因为游戏会暂停）
        // ✅ 组队模式：也只调用一次 levelUp()，后续升级由 hideLevelUpMenu() 的队列系统处理（因为游戏不会暂停）
        if (this.experience >= this.experienceToNextLevel) {
            this.levelUp();
        }
        
        // 更新UI
        UI.updateExpBar(this.experience, this.experienceToNextLevel);
    }
    
    // 升級
    levelUp() {
        this.level++;
        this.experience -= this.experienceToNextLevel;
        this.experienceToNextLevel = Player.computeExperienceToNextLevel(this.level);
        
        // 更新UI（僅本地玩家更新UI，遠程玩家由室長端處理）
        if (!this._isRemotePlayer) {
            UI.updateLevel(this.level);
            UI.updateExpBar(this.experience, this.experienceToNextLevel);
            
            // 顯示升級選單（僅本地玩家顯示）
            // ✅ 组队模式：如果当前有菜单显示，showLevelUpMenu 会将升级加入队列
            UI.showLevelUpMenu();
        }

        // 播放升級音效（僅本地玩家播放）
        if (!this._isRemotePlayer && typeof AudioManager !== 'undefined') {
            AudioManager.playSound('level_up');
        }
    }
    
    // 添加武器
    addWeapon(weaponType) {
        // 檢查是否已有此武器
        const existingWeapon = this.weapons.find(w => w.type === weaponType);
        
        // 組隊模式：驗證專屬武器過濾（防止遠程玩家獲得不應該獲得的專屬武器）
        if (this._isRemotePlayer && this._remoteCharacter) {
            const char = this._remoteCharacter;
            // 檢查是否為其他角色的專屬武器
            if (CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS)) {
                for (const otherChar of CONFIG.CHARACTERS) {
                    if (otherChar && otherChar.id !== char.id && Array.isArray(otherChar.exclusiveWeapons)) {
                        if (otherChar.exclusiveWeapons.includes(weaponType)) {
                            // 這是其他角色的專屬武器，不應該添加
                            console.warn(`[SurvivalOnline] 遠程玩家 ${this._remoteUid} 嘗試添加其他角色的專屬武器 ${weaponType}，已阻止`);
                            return;
                        }
                    }
                }
            }
            // 檢查是否為當前角色的禁用武器
            if (Array.isArray(char.disabledWeapons) && char.disabledWeapons.includes(weaponType)) {
                console.warn(`[SurvivalOnline] 遠程玩家 ${this._remoteUid} 嘗試添加禁用武器 ${weaponType}，已阻止`);
                return;
            }
        }
        
        if (existingWeapon) {
            // 如果已有此武器，則升級
            existingWeapon.levelUp();
        } else {
            // 否則添加新武器
            const newWeapon = new Weapon(this, weaponType);
            this.weapons.push(newWeapon);
        }
        
        // 如果添加的是心意相通/腎上腺素技能，需要重新應用buff以更新回血速度
        if ((weaponType === 'HEART_CONNECTION' || weaponType === 'ADRENALINE') && typeof BuffSystem !== 'undefined' && typeof BuffSystem.applyBuffsFromTalents === 'function') {
            BuffSystem.applyBuffsFromTalents(this);
        }
    }
    
    // 升級武器
    upgradeWeapon(weaponType) {
        const weapon = this.weapons.find(w => w.type === weaponType);
        if (weapon) {
            weapon.levelUp();
            // 如果升級的是心意相通/腎上腺素技能，需要重新應用buff以更新回血速度
            if ((weaponType === 'HEART_CONNECTION' || weaponType === 'ADRENALINE') && typeof BuffSystem !== 'undefined' && typeof BuffSystem.applyBuffsFromTalents === 'function') {
                BuffSystem.applyBuffsFromTalents(this);
            }
        }
    }

    // 嘗試啟動大招
    tryActivateUltimate() {
        if (this.isUltimateActive) return;
        if (Math.floor(this.energy) < this.maxEnergy) return; // 需要100能量
        // ✅ 組隊模式（權威伺服器）：同步大招輸入到伺服器，避免「本地變身了但伺服器不承認/狀態亂跳」
        // 注意：不影響單機；只在 multiplayer.enabled 且不是遠程玩家時發送
        // ✅ 防污染：只在生存模式下發送大招輸入
        try {
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null);
            } catch (_) { }
            
            if (!this._isRemotePlayer && isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled &&
                typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function') {
                // ✅ 多人元素：發送大招動畫狀態到伺服器（讓其他客戶端能看到變身效果）
                // 注意：大招功能本身是單機元素，會在本地執行 activateUltimate()
                // 但大招動畫（isUltimateActive、ultimateImageKey、體型變化）是多人元素，需要同步
                const charUltimate = (Game.selectedCharacter && CONFIG.CHARACTER_ULTIMATES && CONFIG.CHARACTER_ULTIMATES[Game.selectedCharacter.id]) 
                    ? CONFIG.CHARACTER_ULTIMATES[Game.selectedCharacter.id] 
                    : null;
                const ultimateImageKey = (charUltimate && charUltimate.IMAGE_KEY) 
                    ? charUltimate.IMAGE_KEY 
                    : CONFIG.ULTIMATE.IMAGE_KEY;
                const sizeMultiplier = (charUltimate && typeof charUltimate.PLAYER_SIZE_MULTIPLIER === 'number')
                    ? charUltimate.PLAYER_SIZE_MULTIPLIER
                    : CONFIG.ULTIMATE.PLAYER_SIZE_MULTIPLIER;
                
                window.SurvivalOnlineRuntime.sendToNet({
                    type: 'use_ultimate',
                    timestamp: Date.now(),
                    ultimateImageKey: ultimateImageKey,
                    durationMs: CONFIG.ULTIMATE.DURATION_MS,
                    sizeMultiplier: sizeMultiplier
                });
            }
        } catch (_) { }
        this.activateUltimate();
    }

    // 啟動大招：變身、體型變大、四技能LV10、能量消耗
    activateUltimate() {
        // 取得角色特定的大招配置（若存在）
        // 修復：遠程玩家使用自己的角色，本地玩家使用 Game.selectedCharacter
        let characterId = null;
        try {
            if (this._isRemotePlayer && this._remoteCharacter) {
                // 遠程玩家：使用自己的角色
                characterId = this._remoteCharacter.id;
            } else if (typeof Game !== 'undefined' && Game.selectedCharacter) {
                // 本地玩家：使用 Game.selectedCharacter
                characterId = Game.selectedCharacter.id;
            }
        } catch (_) {}
        
        const charUltimate = (characterId && CONFIG.CHARACTER_ULTIMATES && CONFIG.CHARACTER_ULTIMATES[characterId]) 
            ? CONFIG.CHARACTER_ULTIMATES[characterId] 
            : null;
        
        // 艾比大绝：不变身，直接施放全地图爆炸
        if (charUltimate && charUltimate.IS_EXPLOSION_ULTIMATE) {
            this._activateExplosionUltimate(charUltimate);
            return;
        }

        // 鳳梨不咬舌：不變身，噴出大鳳梨（特殊經驗物件；需碰觸、不會吸）
        if (characterId === 'pineapple') {
            this._activatePineappleDropUltimate();
            return;
        }

        // 保存必要的玩家狀態（僅變身型大招需要）
        this._ultimateBackup = {
            width: this.width,
            height: this.height,
            collisionRadius: this.collisionRadius,
            weapons: this.weapons.map(w => ({ type: w.type, level: w.level })),
            health: this.health, // 保存變身前的血量
            maxHealth: this.maxHealth // 保存變身前的最大血量
        };
        
        // 使用角色特定配置或預設配置
        const ultimateImageKey = (charUltimate && charUltimate.IMAGE_KEY) 
            ? charUltimate.IMAGE_KEY 
            : CONFIG.ULTIMATE.IMAGE_KEY;
        const ultimateWeapons = (charUltimate && charUltimate.ULTIMATE_WEAPONS) 
            ? charUltimate.ULTIMATE_WEAPONS 
            : CONFIG.ULTIMATE.ULTIMATE_WEAPONS;
        const extraDefense = (charUltimate && typeof charUltimate.EXTRA_DEFENSE === 'number') 
            ? charUltimate.EXTRA_DEFENSE 
            : 0;
        const audioKey = (charUltimate && charUltimate.AUDIO_KEY) 
            ? charUltimate.AUDIO_KEY 
            : null;
        const sizeMultiplier = (charUltimate && typeof charUltimate.PLAYER_SIZE_MULTIPLIER === 'number')
            ? charUltimate.PLAYER_SIZE_MULTIPLIER
            : CONFIG.ULTIMATE.PLAYER_SIZE_MULTIPLIER;
        const extraHp = (charUltimate && typeof charUltimate.EXTRA_HP === 'number')
            ? charUltimate.EXTRA_HP
            : 0;
        
        // 變身狀態
        this.isUltimateActive = true;
        this.ultimateEndTime = Date.now() + CONFIG.ULTIMATE.DURATION_MS;
        this._ultimateImageKey = ultimateImageKey; // 儲存角色特定圖片鍵
        this._ultimateExtraDefense = extraDefense; // 儲存額外防禦
        
        // 洛可洛斯特：大絕期間HP暫時+600
        if (extraHp > 0) {
            this.maxHealth += extraHp;
            this.health += extraHp;
            if (typeof UI !== 'undefined' && UI.updateHealthBar) {
                UI.updateHealthBar(this.health, this.maxHealth);
            }
        }
        
        // 體型變大（使用角色特定倍率或預設倍率）
        this.width = Math.floor(this.width * sizeMultiplier);
        this.height = Math.floor(this.height * sizeMultiplier);
        this.collisionRadius = Math.max(this.width, this.height) / 2;
        
        // 啟用武器，全部LV10（使用角色特定配置或預設配置）
        this.weapons = ultimateWeapons.map(type => {
            const w = new Weapon(this, type);
            w.level = CONFIG.ULTIMATE.ULTIMATE_LEVEL;
            w.projectileCount = w.config.LEVELS[w.level - 1].COUNT;
            return w;
        });
        
        // 應用額外防禦（角色特定配置）
        if (extraDefense > 0) {
            const originalDefense = this.baseDefense || 1; // 預設基礎防禦為1
            this.baseDefense = originalDefense + extraDefense;
        }
        
        // 第二位角色：大絕期間暫停BGM（僅第二位角色）
        if (characterId === 'dada' && typeof AudioManager !== 'undefined' && AudioManager.music) {
            try {
                // 查找當前正在播放的BGM
                let currentBgmName = null;
                let currentBgmTime = 0;
                for (const key in AudioManager.music) {
                    if (AudioManager.music.hasOwnProperty(key)) {
                        const track = AudioManager.music[key];
                        try {
                            if (track && !track.paused && track.currentTime > 0) {
                                currentBgmName = key;
                                currentBgmTime = track.currentTime;
                                // 暫停BGM
                                track.pause();
                                break;
                            }
                        } catch (_) {}
                    }
                }
                // 保存BGM狀態以便恢復
                if (currentBgmName) {
                    this._ultimateBgmBackup = {
                        name: currentBgmName,
                        time: currentBgmTime
                    };
                }
            } catch (e) {
                console.warn('保存BGM狀態失敗:', e);
            }
        }
        
        // 播放角色特定音效（若存在）
        if (audioKey && typeof AudioManager !== 'undefined' && AudioManager.sounds && AudioManager.sounds[audioKey]) {
            try {
                const audio = AudioManager.sounds[audioKey];
                // 克隆音效以允許重疊播放
                this._ultimateAudioInstance = audio.cloneNode();
                this._ultimateAudioInstance.volume = AudioManager.soundVolume;
                this._ultimateAudioInstance.loop = false; // 大絕期間只播放一次
                this._ultimateAudioInstance.play().catch(e => {
                    console.warn('播放大絕音效失敗:', e);
                    this._ultimateAudioInstance = null;
                });
            } catch (e) {
                console.warn('初始化大絕音效失敗:', e);
                this._ultimateAudioInstance = null;
            }
        }
        
        // 消耗能量
        this.energy = 0;
        UI.updateEnergyBar(this.energy, this.maxEnergy);

        // 維護註解：大招啟動瞬間觸發鏡頭震動（沿用既有機制）
        // 依賴與安全性：
        // - 使用 Game.cameraShake 既有結構（boss_projectile.js 中已使用並由 Game.update/draw 處理）。
        // - 僅新增視覺效果，不改動數值、武器、能量、UI 文案與排版。
        // - 若 cameraShake 尚未初始化，按既有格式建立。
        try {
            if (!Game.cameraShake) {
                Game.cameraShake = { active: false, intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
            }
            Game.cameraShake.active = true;
            Game.cameraShake.intensity = 8; // 與 BOSS 爆炸一致的強度
            Game.cameraShake.duration = 200; // 毫秒
            
            // ✅ 單機元素：鏡頭震動是單人元素，只在本地處理，不廣播給其他玩家
            // 注意：震動不應該通過 screen_effect 事件廣播，每個玩家應該獨立處理自己的震動
        } catch (_) {}
    }

    // 鳳梨大絕：噴出 5 顆大鳳梨，玩家碰觸獲得固定經驗
    _activatePineappleDropUltimate() {
        // 消耗能量
        this.energy = 0;
        try { if (typeof UI !== 'undefined' && UI.updateEnergyBar) UI.updateEnergyBar(this.energy, this.maxEnergy); } catch (_) {}

        // ✅ 修復：音效是單機元素，只在本地玩家播放
        // 音效：大招噴出瞬間（使用 fireball_shoot.mp3）
        try {
            if (!this._isRemotePlayer && typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                AudioManager.playSound('fireball_shoot');
            }
        } catch (_) {}

        // ✅ 權威伺服器模式：多人進行中時，鳳梨掉落物由伺服器生成並透過 state.chests(type=PINEAPPLE) 同步
        // 這裡只保留能量消耗/音效/鏡頭震動等本地視覺，避免本地生成與伺服器權威打架。
        try {
            if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                // 視覺：沿用大招啟動的鏡頭震動
                try {
                    if (!Game.cameraShake) {
                        Game.cameraShake = { active: false, intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
                    }
                    Game.cameraShake.active = true;
                    Game.cameraShake.intensity = 8;
                    Game.cameraShake.duration = 200;
                } catch (_) {}
                return;
            }
        } catch (_) {}

        // 室長端或單人模式：正常生成掉落物
        // 生成：200~800 像素距離，隨機角度
        const count = 5;
        const minD = 200;
        const maxD = 800;
        // 經驗由 PineappleUltimatePickup 收集時計算（純30%當下所需升級經驗），這裡不再提供固定值
        const expValue = 0;
        // 噴出速度（由玩家位置飛到落點的插值動畫時間）；數值越大越慢
        const flyDurationMs = 600;
        const worldW = (typeof Game !== 'undefined' && Game.worldWidth) ? Game.worldWidth : (CONFIG && CONFIG.CANVAS_WIDTH) || 1280;
        const worldH = (typeof Game !== 'undefined' && Game.worldHeight) ? Game.worldHeight : (CONFIG && CONFIG.CANVAS_HEIGHT) || 720;
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const dist = minD + Math.random() * (maxD - minD);
            let tx = this.x + Math.cos(ang) * dist;
            let ty = this.y + Math.sin(ang) * dist;
            // 以 A45(53x100) 尺寸做邊界裁切
            tx = Utils.clamp(tx, 53 / 2, worldW - 53 / 2);
            ty = Utils.clamp(ty, 100 / 2, worldH - 100 / 2);
            try {
                if (typeof Game !== 'undefined' && typeof Game.spawnPineappleUltimatePickup === 'function') {
                    Game.spawnPineappleUltimatePickup(tx, ty, { spawnX: this.x, spawnY: this.y, expValue, flyDurationMs });
                }
            } catch (_) {}
        }

        // 視覺：沿用大招啟動的鏡頭震動
        try {
            if (!Game.cameraShake) {
                Game.cameraShake = { active: false, intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
            }
            Game.cameraShake.active = true;
            Game.cameraShake.intensity = 8;
            Game.cameraShake.duration = 200;
        } catch (_) {}
    }

    // 結束大招：恢復原始狀態與武器、能量歸零
    deactivateUltimate() {
        if (!this.isUltimateActive || !this._ultimateBackup) return;
        this.isUltimateActive = false;
        
        // 停止角色特定音效（若存在）
        if (this._ultimateAudioInstance) {
            try {
                this._ultimateAudioInstance.pause();
                this._ultimateAudioInstance.currentTime = 0;
            } catch (_) {}
            this._ultimateAudioInstance = null;
        }
        
        // 第二位角色：恢復BGM（僅第二位角色）
        if (this._ultimateBgmBackup && typeof AudioManager !== 'undefined' && AudioManager.music) {
            try {
                const bgmName = this._ultimateBgmBackup.name;
                const bgmTime = this._ultimateBgmBackup.time;
                const track = AudioManager.music[bgmName];
                if (track) {
                    // 恢復BGM播放位置並繼續播放
                    track.currentTime = bgmTime;
                    track.volume = AudioManager.musicVolume;
                    track.loop = true;
                    if (!AudioManager.isMuted) {
                        track.play().catch(e => {
                            console.warn('恢復BGM失敗:', e);
                        });
                    }
                }
            } catch (e) {
                console.warn('恢復BGM狀態失敗:', e);
            }
            this._ultimateBgmBackup = null;
        }
        
        // 移除額外防禦（角色特定配置）
        if (this._ultimateExtraDefense > 0) {
            // 恢復到原始防禦值（至少為1）
            const currentDefense = this.baseDefense || 1;
            this.baseDefense = Math.max(1, currentDefense - this._ultimateExtraDefense);
        }
        this._ultimateExtraDefense = 0;
        
        // ✅ 多人元素：體型恢復由伺服器同步（不在此處恢復，避免與伺服器狀態衝突）
        // 單機模式下才在此處恢復體型
        const isMultiplayerMode = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
        if (!isMultiplayerMode) {
            // 恢復尺寸與碰撞半徑（單機模式）
            this.width = this._ultimateBackup.width;
            this.height = this._ultimateBackup.height;
            this.collisionRadius = this._ultimateBackup.collisionRadius;
        }
        // 組隊模式下，體型由伺服器同步（handleServerGameState 會處理）
        
        // 恢復原本武器與等級
        this.weapons = this._ultimateBackup.weapons.map(info => {
            const w = new Weapon(this, info.type);
            w.level = info.level;
            w.projectileCount = w.config.LEVELS[w.level - 1].COUNT;
            return w;
        });
        
        // 洛可洛斯特：恢復變身前的血量（只要不死亡）
        if (this._ultimateBackup.health !== undefined && this._ultimateBackup.maxHealth !== undefined) {
            // 檢查是否死亡
            if (this.health > 0) {
                // 未死亡：恢復變身前的血量
                this.maxHealth = this._ultimateBackup.maxHealth;
                this.health = Math.min(this.maxHealth, this._ultimateBackup.health);
            } else {
                // 已死亡：恢復最大血量，但血量保持為0（由die()處理）
                this.maxHealth = this._ultimateBackup.maxHealth;
            }
            if (typeof UI !== 'undefined' && UI.updateHealthBar) {
                UI.updateHealthBar(this.health, this.maxHealth);
            }
        }

        // 大招結束後：移除玩家名下的所有「守護領域」常駐場域
        // 理由：守護領域為常駐效果，避免大招期間的臨時LV10場域在結束後殘留。
        // ✅ 單機元素：只清理本地玩家的守護領域（不影響遠程玩家）
        const isMultiplayerMode2 = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
        if (!isMultiplayerMode2 || !this._isRemotePlayer) {
            try {
                if (typeof Game !== 'undefined' && Array.isArray(Game.projectiles)) {
                    for (const p of Game.projectiles) {
                        if (p && p.weaponType === 'AURA_FIELD' && p.player === this && !p.markedForDeletion) {
                            if (typeof p.destroy === 'function') p.destroy(); else p.markedForDeletion = true;
                        }
                    }
                }
            } catch (_) {}
        }
        
        // 能量歸零
        this.energy = 0;
        UI.updateEnergyBar(this.energy, this.maxEnergy);
        
        // 第二位角色大絕結束：恢復玩家GIF的z-index（在清理前檢查）
        const wasDadaUltimate = (this._ultimateImageKey === 'playerN2');
        if (wasDadaUltimate) {
            try {
                const playerGifEl = document.getElementById('gif-overlay-player');
                if (playerGifEl) {
                    playerGifEl.style.zIndex = '3'; // 恢復預設值
                }
            } catch (_) {}
        }
        
        // 清理備份與角色特定配置
        this._ultimateBackup = null;
        this.ultimateEndTime = 0;
        this._ultimateImageKey = null;
    }
    
    // 艾比大绝：不变身，直接施放全地图爆炸
    _activateExplosionUltimate(charUltimate) {
        // 消耗能量
        this.energy = 0;
        UI.updateEnergyBar(this.energy, this.maxEnergy);
        
        // ✅ 修復：音效是單機元素，只在本地玩家播放
        // 播放爆炸音效
        const audioKey = (charUltimate && charUltimate.AUDIO_KEY) ? charUltimate.AUDIO_KEY : 'Explosion';
        if (!this._isRemotePlayer && typeof AudioManager !== 'undefined' && AudioManager.sounds && AudioManager.sounds[audioKey]) {
            try {
                AudioManager.playSound(audioKey);
            } catch (e) {
                console.warn('播放爆炸音效失敗:', e);
            }
        }
        
        // 创建爆炸效果（在玩家中心位置）
        if (typeof ExplosionEffect !== 'undefined' && typeof Game !== 'undefined' && Game.addProjectile) {
            const explosion = new ExplosionEffect(this, this.x, this.y);
            Game.addProjectile(explosion);
        }
        
        // 镜头震动
        try {
            if (!Game.cameraShake) {
                Game.cameraShake = { active: false, intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
            }
            Game.cameraShake.active = true;
            Game.cameraShake.intensity = 10; // 比普通大绝更强的震动
            Game.cameraShake.duration = 300; // 300毫秒
            
            // ✅ 單機元素：鏡頭震動是單人元素，只在本地處理，不廣播給其他玩家
            // 注意：震動不應該通過 screen_effect 事件廣播，每個玩家應該獨立處理自己的震動
        } catch (_) {}
    }
}

// ✅ ES Module 相容：讓多人模組（`js/multiplayer/survival_online.js`）能透過 globalThis/window 取得 Player ctor
// 不影響單機邏輯，只是額外暴露建構子供多人使用。
try {
    if (typeof window !== 'undefined') {
        window.Player = Player;
    }
} catch (_) { }
