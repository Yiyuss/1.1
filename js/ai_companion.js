// AI生命體（召喚AI技能專用）
// 功能：跟隨玩家，使用LV10連鎖閃電或LV10狂熱雷擊攻擊敵人
// 注意：僅在生存模式使用，不污染其他模式

class AICompanion extends Entity {
    constructor(player, x, y, summonAILevel = 1) {
        super(x, y, CONFIG.PLAYER.SIZE, CONFIG.PLAYER.SIZE);
        this.player = player;
        this.targetDistance = 150; // 目標距離
        this.followDistance = 200; // 超出此距離才會跟上
        this.speed = CONFIG.PLAYER.SPEED || 3; // 與玩家初始移動速度相同
        
        // 圖片資源（往左：AI2.png，往右：AI3.png）
        this.imageLeft = null;
        this.imageRight = null;
        this.facingRight = true; // 面向右側
        this._loadImages();
        
        // 召喚AI等級（決定使用哪個技能）
        this.summonAILevel = summonAILevel || 1;
        
        // 連鎖閃電相關（LV10配置，僅在召喚AI LV1時使用）
        this.chainLightningCooldown = 0;
        this.chainLightningCooldownMax = 1500; // 1.5秒冷卻
        this.chainLightningLevel = 10; // 固定LV10
        this.chainLightningMaxChains = 10; // LV10的連鎖次數
        
        // 狂熱雷擊相關（LV10配置，僅在召喚AI LV2時使用）
        this.frenzyLightningCooldown = 0;
        this.frenzyLightningCooldownMax = 1500; // 1.5秒冷卻
        this.frenzyLightningLevel = 10; // 固定LV10
        
        // 無血量，不會受傷
        this.health = Infinity;
        this.maxHealth = Infinity;
        
        // 基礎爆擊率10%（與玩家相同）
        this.critChanceBonusPct = 0.10;
    }
    
    // 設置技能等級（用於合成後更新）
    setSkillLevel(level) {
        this.summonAILevel = level || 1;
    }
    
    _loadImages() {
        // 載入AI圖片（往左和往右）
        try {
            if (typeof Game !== 'undefined' && Game.images) {
                if (Game.images['AI2']) {
                    this.imageLeft = Game.images['AI2'];
                }
                if (Game.images['AI3']) {
                    this.imageRight = Game.images['AI3'];
                }
            }
            // 如果Game.images中沒有，嘗試直接載入
            if (!this.imageLeft) {
                const imgLeft = new Image();
                imgLeft.src = 'assets/images/AI2.png';
                imgLeft.onload = () => { this.imageLeft = imgLeft; };
                this.imageLeft = imgLeft;
            }
            if (!this.imageRight) {
                const imgRight = new Image();
                imgRight.src = 'assets/images/AI3.png';
                imgRight.onload = () => { this.imageRight = imgRight; };
                this.imageRight = imgRight;
            }
        } catch(_) {}
    }
    
    // 清理方法（遊戲結束時調用）
    cleanup() {
        try {
            if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.hide === 'function') {
                window.GifOverlay.hide('ai-companion');
            }
        } catch(_) {}
    }
    
    update(deltaTime) {
        if (!Game || Game.isGameOver) return;
        
        // ✅ 組隊模式：遠程玩家的AI需要更新位置並使用最新的遠程玩家對象（包含天賦加成）
        // ✅ 單機模式：不會進入此分支（this._remotePlayerUid 在單機模式下不會被設置）
        if (this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            // 優先使用 RemotePlayerManager.get（獲取完整的 Player 對象，包含天賦加成）
            if (rt && typeof rt.RemotePlayerManager !== 'undefined' && typeof rt.RemotePlayerManager.get === 'function') {
                const remotePlayer = rt.RemotePlayerManager.get(this._remotePlayerUid);
                if (remotePlayer) {
                    // ✅ 修復：確保 this.player 引用的是最新的遠程玩家對象（包含天賦加成）
                    // 這樣AI才能正確使用遠程玩家的天賦屬性（damageTalentBaseBonusPct、critChanceBonusPct等）
                    this.player = remotePlayer;
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    // 如果是本地玩家
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.player = Game.player;
                    }
                } else {
                    // ✅ 修復：如果找不到對應的玩家，暫時保留 this.player，不立即刪除
                    // 因為玩家可能暫時離線或還在連接中
                    if (!this.player) {
                        // 只有在 this.player 為 null 時才標記為刪除
                        this.markedForDeletion = true;
                        return;
                    }
                    // 如果 this.player 存在，繼續使用它（可能是緩存的引用）
                }
            } else if (rt && typeof rt.getRemotePlayers === 'function') {
                // 後備方案：使用 getRemotePlayers（較舊的方法）
                const remotePlayers = rt.getRemotePlayers() || [];
                const remotePlayer = remotePlayers.find(p => p && p.uid === this._remotePlayerUid);
                if (remotePlayer) {
                    // ✅ 修復：確保 this.player 引用的是遠程玩家對象（包含天賦加成）
                    this.player = remotePlayer;
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    // 如果是本地玩家
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.player = Game.player;
                    }
                } else {
                    // ✅ 修復：如果找不到對應的玩家，暫時保留 this.player，不立即刪除
                    if (!this.player) {
                        this.markedForDeletion = true;
                        return;
                    }
                }
            } else {
                // ✅ 修復：如果 Runtime 不存在，但 this.player 存在，繼續使用它
                if (!this.player) {
                    this.markedForDeletion = true;
                    return;
                }
            }
        }
        
        // ✅ 修復：在更新 player 引用後，再次檢查 this.player 是否存在
        if (!this.player) {
            // 如果 this.player 仍然為 null，跳過本次更新（但不刪除，等待下次更新）
            return;
        }
        
        // ✅ MMORPG架构：所有AI（本地和远程）都应该造成伤害
        // 每个玩家的AI独立计算伤害，伤害叠加（真正的MMORPG体验）
        {
            // 正常模式：根據召喚AI等級決定使用哪個技能
            if (this.summonAILevel >= 2) {
                // 召喚AI LV2：使用狂熱雷擊
                this.frenzyLightningCooldown += deltaTime;
                if (this.frenzyLightningCooldown >= this.frenzyLightningCooldownMax) {
                    this._castFrenzyLightning();
                    this.frenzyLightningCooldown = 0;
                }
            } else {
                // 召喚AI LV1：使用連鎖閃電
                this.chainLightningCooldown += deltaTime;
                if (this.chainLightningCooldown >= this.chainLightningCooldownMax) {
                    this._castChainLightning();
                    this.chainLightningCooldown = 0;
                }
            }
        }
        
        // 跟隨玩家邏輯
        const dx = this.player.x - this.x;
        const dy = this.player.y - this.y;
        const distance = Math.hypot(dx, dy);
        
        // 更新面向方向（根據移動方向判斷左右）
        if (distance > 0.1) {
            // 如果正在移動，根據移動方向判斷面向
            if (Math.abs(dx) > 0.1) {
                this.facingRight = dx > 0;
            }
        }
        
        // 計算移動速度（考慮deltaTime）
        const moveSpeed = this.speed * (deltaTime / 16.67); // 標準化到60FPS
        
        // 如果距離超過200，則跟上玩家
        if (distance > this.followDistance) {
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * moveSpeed;
            this.y += Math.sin(angle) * moveSpeed;
        } else if (distance < this.targetDistance - 10) {
            // 如果距離小於目標距離-10，稍微遠離（避免完全重疊）
            const angle = Math.atan2(dy, dx);
            this.x -= Math.cos(angle) * moveSpeed * 0.3;
            this.y -= Math.sin(angle) * moveSpeed * 0.3;
        } else {
            // 在目標距離附近，保持位置（不移動）
        }
        
        // 邊界限制（使用世界座標）
        const margin = this.width / 2;
        const worldWidth = (Game.worldWidth || CONFIG.CANVAS_WIDTH);
        const worldHeight = (Game.worldHeight || CONFIG.CANVAS_HEIGHT);
        this.x = Math.max(margin, Math.min(worldWidth - margin, this.x));
        this.y = Math.max(margin, Math.min(worldHeight - margin, this.y));
    }
    
    _castChainLightning() {
        // 使用LV10連鎖閃電（僅在召喚AI LV1時使用）
        try {
            if (typeof ChainLightningEffect === 'undefined') return;
            
            // 計算傷害（LV10的傷害，與玩家相同的計算方式）
            const baseDamage = (CONFIG.WEAPONS && CONFIG.WEAPONS.CHAIN_LIGHTNING && CONFIG.WEAPONS.CHAIN_LIGHTNING.DAMAGE) ? CONFIG.WEAPONS.CHAIN_LIGHTNING.DAMAGE : 15;
            const levelMul = (typeof DamageSystem !== 'undefined' && DamageSystem.levelMultiplier) 
                ? DamageSystem.levelMultiplier(this.chainLightningLevel) 
                : (1 + 0.05 * Math.max(0, this.chainLightningLevel - 1));
            
            // 應用玩家的傷害倍率（與玩家相同）
            let damage = baseDamage;
            if (this.player) {
                // 傷害強化天賦（百分比加成）
                const talentPct = (this.player.damageTalentBaseBonusPct != null) ? this.player.damageTalentBaseBonusPct : 0;
                // 升級屬性加成（每級+10%）
                const attrPct = (this.player.damageAttributeBonusPct != null) ? this.player.damageAttributeBonusPct : 0;
                // 傷害特化（固定值）
                const specFlat = (this.player.damageSpecializationFlat != null) ? this.player.damageSpecializationFlat : 0;
                // 攻擊力上升（每級+2，單純加法）
                const attrFlat = (this.player.attackPowerUpgradeFlat != null) ? this.player.attackPowerUpgradeFlat : 0;
                
                // 先加固定值，再乘百分比（與玩家計算方式一致）
                const lvPct = Math.max(0, (levelMul || 1) - 1);
                const percentSum = lvPct + talentPct + attrPct;
                const baseFlat = baseDamage + specFlat + attrFlat;
                damage = baseFlat * (1 + percentSum);
            } else {
                // 如果沒有玩家引用，使用基礎計算
                damage = baseDamage * levelMul;
            }
            
            // 應用AI強化天賦（只影響AI傷害，不影響玩家）
            // 改為加算：將倍率轉換為加成百分比，以便未來多個來源可以相加
            if (typeof TalentSystem !== 'undefined' && TalentSystem.tieredTalents && TalentSystem.tieredTalents.ai_boost) {
                let aiBoostLevel = 0;
                // ✅ 組隊模式：遠程玩家的AI使用遠程玩家的 ai_boost 天賦等級
                // ✅ 單機模式：使用本地玩家的 ai_boost 天賦等級
                if (this._remotePlayerUid && this.player && this.player._talentLevels) {
                    // 組隊模式：從遠程玩家對象獲取 ai_boost 天賦等級
                    aiBoostLevel = (typeof this.player._talentLevels.ai_boost === 'number') ? this.player._talentLevels.ai_boost : 0;
                } else {
                    // 單機模式或本地玩家的AI：使用本地玩家的 ai_boost 天賦等級
                    if (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel) {
                        aiBoostLevel = TalentSystem.getTalentLevel('ai_boost') || 0;
                    }
                }
                
                if (aiBoostLevel > 0) {
                    const effect = TalentSystem.tieredTalents.ai_boost.levels[aiBoostLevel - 1];
                    if (effect && typeof effect.multiplier === 'number') {
                        // 將倍率轉換為加成百分比（例如 2.0 → +100%）
                        const aiBoost = effect.multiplier - 1.0;
                        damage = damage * (1.0 + aiBoost);
                    }
                }
            }
            
            // 更新AI的爆擊率（基礎10% + 玩家的爆擊加成）
            if (this.player && this.player.critChanceBonusPct != null) {
                this.critChanceBonusPct = 0.10 + this.player.critChanceBonusPct;
            }
            
            // 創建連鎖閃電效果（從AI位置發出）
            const durationMs = (CONFIG.WEAPONS && CONFIG.WEAPONS.CHAIN_LIGHTNING && CONFIG.WEAPONS.CHAIN_LIGHTNING.DURATION) 
                ? CONFIG.WEAPONS.CHAIN_LIGHTNING.DURATION 
                : 1000;
            const chainRadius = (CONFIG.WEAPONS && CONFIG.WEAPONS.CHAIN_LIGHTNING && CONFIG.WEAPONS.CHAIN_LIGHTNING.CHAIN_RADIUS) 
                ? CONFIG.WEAPONS.CHAIN_LIGHTNING.CHAIN_RADIUS 
                : 220;
            
            // 創建連鎖閃電效果，使用AI作為"玩家"（這樣會從AI位置開始連鎖）
            // ✅ MMORPG架构：传递正确的player信息，让技能效果能正确识别是远程玩家的AI
            const effect = new ChainLightningEffect(this, damage, durationMs, this.chainLightningMaxChains, chainRadius);
            
            // 如果AI属于远程玩家，传递远程玩家信息给技能效果
            if (this._remotePlayerUid && this.player) {
                // 确保技能效果知道这是远程玩家的AI创建的
                effect._remotePlayerUid = this._remotePlayerUid;
                // 使用真正的Player对象，而不是AICompanion（用于识别远程玩家投射物）
                effect._aiCompanion = this; // 保存AI引用，用于位置更新
            }
            
            // 添加到遊戲投射物列表
            if (typeof Game !== 'undefined' && Game.addProjectile) {
                Game.addProjectile(effect);
            }
        } catch(e) {
            console.warn('AI連鎖閃電施放失敗:', e);
        }
    }
    
    _castFrenzyLightning() {
        // 使用LV10狂熱雷擊（僅在召喚AI LV2時使用）
        try {
            if (typeof FrenzyLightningEffect === 'undefined') return;
            
            // 計算傷害（LV10的傷害，與玩家相同的計算方式）
            const baseDamage = (CONFIG.WEAPONS && CONFIG.WEAPONS.FRENZY_LIGHTNING && CONFIG.WEAPONS.FRENZY_LIGHTNING.DAMAGE) ? CONFIG.WEAPONS.FRENZY_LIGHTNING.DAMAGE : 15;
            const levelMul = (typeof DamageSystem !== 'undefined' && DamageSystem.levelMultiplier) 
                ? DamageSystem.levelMultiplier(this.frenzyLightningLevel) 
                : (1 + 0.05 * Math.max(0, this.frenzyLightningLevel - 1));
            
            // 狂熱雷擊：每級+3基礎傷害（LV10累計+30）
            const frenzyExtra = 3 * Math.max(1, this.frenzyLightningLevel);
            
            // 應用玩家的傷害倍率（與玩家相同）
            let damage = baseDamage;
            if (this.player) {
                // 傷害強化天賦（百分比加成）
                const talentPct = (this.player.damageTalentBaseBonusPct != null) ? this.player.damageTalentBaseBonusPct : 0;
                // 升級屬性加成（每級+10%）
                const attrPct = (this.player.damageAttributeBonusPct != null) ? this.player.damageAttributeBonusPct : 0;
                // 傷害特化（固定值）
                const specFlat = (this.player.damageSpecializationFlat != null) ? this.player.damageSpecializationFlat : 0;
                // 攻擊力上升（每級+2，單純加法）
                const attrFlat = (this.player.attackPowerUpgradeFlat != null) ? this.player.attackPowerUpgradeFlat : 0;
                
                // 先加固定值，再乘百分比（與玩家計算方式一致）
                const lvPct = Math.max(0, (levelMul || 1) - 1);
                const percentSum = lvPct + talentPct + attrPct;
                const baseFlat = baseDamage + frenzyExtra + specFlat + attrFlat;
                damage = baseFlat * (1 + percentSum);
            } else {
                // 如果沒有玩家引用，使用基礎計算
                damage = (baseDamage + frenzyExtra) * levelMul;
            }
            
            // 應用AI強化天賦（只影響AI傷害，不影響玩家）
            // 改為加算：將倍率轉換為加成百分比，以便未來多個來源可以相加
            if (typeof TalentSystem !== 'undefined' && TalentSystem.tieredTalents && TalentSystem.tieredTalents.ai_boost) {
                let aiBoostLevel = 0;
                // ✅ 組隊模式：遠程玩家的AI使用遠程玩家的 ai_boost 天賦等級
                // ✅ 單機模式：使用本地玩家的 ai_boost 天賦等級
                if (this._remotePlayerUid && this.player && this.player._talentLevels) {
                    // 組隊模式：從遠程玩家對象獲取 ai_boost 天賦等級
                    aiBoostLevel = (typeof this.player._talentLevels.ai_boost === 'number') ? this.player._talentLevels.ai_boost : 0;
                } else {
                    // 單機模式或本地玩家的AI：使用本地玩家的 ai_boost 天賦等級
                    if (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel) {
                        aiBoostLevel = TalentSystem.getTalentLevel('ai_boost') || 0;
                    }
                }
                
                if (aiBoostLevel > 0) {
                    const effect = TalentSystem.tieredTalents.ai_boost.levels[aiBoostLevel - 1];
                    if (effect && typeof effect.multiplier === 'number') {
                        // 將倍率轉換為加成百分比（例如 2.0 → +100%）
                        const aiBoost = effect.multiplier - 1.0;
                        damage = damage * (1.0 + aiBoost);
                    }
                }
            }
            
            // 更新AI的爆擊率（基礎10% + 玩家的爆擊加成）
            if (this.player && this.player.critChanceBonusPct != null) {
                this.critChanceBonusPct = 0.10 + this.player.critChanceBonusPct;
            }
            
            // 創建狂熱雷擊效果（從AI位置發出）
            const durationMs = (CONFIG.WEAPONS && CONFIG.WEAPONS.FRENZY_LIGHTNING && CONFIG.WEAPONS.FRENZY_LIGHTNING.DURATION) 
                ? CONFIG.WEAPONS.FRENZY_LIGHTNING.DURATION 
                : 1000;
            const chainRadius = (CONFIG.WEAPONS && CONFIG.WEAPONS.FRENZY_LIGHTNING && CONFIG.WEAPONS.FRENZY_LIGHTNING.CHAIN_RADIUS) 
                ? CONFIG.WEAPONS.FRENZY_LIGHTNING.CHAIN_RADIUS 
                : 220;
            
            // 狂熱雷擊配置：10條分支，每條10次連鎖
            const branchCount = 10;
            const chainsPerBranch = 10;
            
            // 創建狂熱雷擊效果，使用AI作為"玩家"（這樣會從AI位置開始連鎖）
            // ✅ MMORPG架构：传递正确的player信息，让技能效果能正确识别是远程玩家的AI
            const effect = new FrenzyLightningEffect(this, damage, durationMs, branchCount, chainsPerBranch, chainRadius);
            
            // 如果AI属于远程玩家，传递远程玩家信息给技能效果
            if (this._remotePlayerUid && this.player) {
                // 确保技能效果知道这是远程玩家的AI创建的
                effect._remotePlayerUid = this._remotePlayerUid;
                // 使用真正的Player对象，而不是AICompanion（用于识别远程玩家投射物）
                effect._aiCompanion = this; // 保存AI引用，用于位置更新
            }
            
            // 添加到遊戲投射物列表
            if (typeof Game !== 'undefined' && Game.addProjectile) {
                Game.addProjectile(effect);
            }
        } catch(e) {
            console.warn('AI狂熱雷擊施放失敗:', e);
        }
    }
    
    draw(ctx) {
        // 使用GifOverlay顯示AI（與玩家使用相同的圖層系統）
        if (!this.player || !Game || Game.isGameOver) {
            // 如果遊戲結束，隱藏AI
            try {
                if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.hide === 'function') {
                    window.GifOverlay.hide('ai-companion');
                }
            } catch(_) {}
            return;
        }
        
        try {
            // 選擇對應的圖片（往左或往右）
            const img = this.facingRight ? this.imageRight : this.imageLeft;
            if (!img) {
                // 如果圖片未載入，嘗試載入
                this._loadImages();
                return;
            }
            
            // 獲取圖片源和圖片對象
            let imgSrc = null;
            let imgObj = null;
            if (img && img.src) {
                imgSrc = img.src;
                imgObj = img;
            } else if (typeof Game !== 'undefined' && Game.images) {
                const key = this.facingRight ? 'AI3' : 'AI2';
                imgObj = Game.images[key];
                if (imgObj && imgObj.src) {
                    imgSrc = imgObj.src;
                }
            }
            
            if (!imgSrc) {
                // 後備：使用相對路徑
                imgSrc = this.facingRight ? 'assets/images/AI3.png' : 'assets/images/AI2.png';
            }
            
            // 計算顯示大小（保持原比例148x250，縮放到玩家大小）
            const baseSize = CONFIG.PLAYER.SIZE || 48;
            const visualScale = (CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') 
                ? CONFIG.PLAYER.VISUAL_SCALE 
                : 1.0;
            
            // AI圖片比例：148x250
            const aiImageWidth = 148;
            const aiImageHeight = 250;
            const aiAspectRatio = aiImageWidth / aiImageHeight; // 148/250 ≈ 0.592
            
            // 以高度為基準計算顯示尺寸（保持與玩家相近的高度）
            const renderHeight = Math.max(1, Math.floor(baseSize * visualScale));
            const renderWidth = Math.max(1, Math.floor(renderHeight * aiAspectRatio));
            
            // 計算屏幕座標（考慮相機偏移和震動）
            const camX = (Game.camera ? Game.camera.x : 0);
            const camY = (Game.camera ? Game.camera.y : 0);
            const shakeX = (Game.cameraShake && Game.cameraShake.active) ? (Game.cameraShake.offsetX || 0) : 0;
            const shakeY = (Game.cameraShake && Game.cameraShake.active) ? (Game.cameraShake.offsetY || 0) : 0;
            const screenX = this.x - camX - shakeX;
            const screenY = this.y - camY - shakeY;
            
            // 使用GifOverlay顯示AI（與玩家使用相同的圖層，保持原比例）
            if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.showOrUpdate === 'function') {
                window.GifOverlay.showOrUpdate('ai-companion', imgSrc, screenX, screenY, { width: renderWidth, height: renderHeight });
            }
        } catch(e) {
            console.warn('AI顯示失敗:', e);
        }
    }
    
    // AI不會受傷
    takeDamage(amount) {
        return; // 無血量，不會受傷
    }
}

