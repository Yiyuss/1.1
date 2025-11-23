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
        this.experienceToNextLevel = CONFIG.EXPERIENCE.LEVEL_UP_BASE;
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

        // 生命自然恢復：每5秒回1HP（不溢出，上限100）
        this.healthRegenIntervalMs = 5000;
        this.healthRegenAccumulator = 0;
        
        // 初始武器 - 飛鏢
        this.addWeapon('DAGGER');
    }
    
    update(deltaTime) {
        // 處理移動（套用deltaTime，以60FPS為基準）
        const deltaMul = deltaTime / 16.67;
        const direction = Input.getMovementDirection();
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
    
    draw(ctx) {
        // 繪製玩家
        ctx.save();
        
        // 無敵狀態閃爍效果
        if (this.isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }
        
        // 使用玩家圖片（大招期間使用角色特定圖片或預設 playerN）；改用 GIF 覆蓋層以保證動畫
        const baseKey = (this.spriteImageKey && Game.images && Game.images[this.spriteImageKey])
            ? this.spriteImageKey
            : 'player';
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
            const renderSize = Math.max(1, Math.floor(baseSize * visualScale));
            const camX = (typeof Game !== 'undefined' && Game && Game.camera) ? Game.camera.x : 0;
            const camY = (typeof Game !== 'undefined' && Game && Game.camera) ? Game.camera.y : 0;
            const shakeX = (typeof Game !== 'undefined' && Game && Game.cameraShake && Game.cameraShake.active) ? (Game.cameraShake.offsetX || 0) : 0;
            const shakeY = (typeof Game !== 'undefined' && Game && Game.cameraShake && Game.cameraShake.active) ? (Game.cameraShake.offsetY || 0) : 0;
            const screenX = this.x - camX - shakeX;
            const screenY = this.y - camY - shakeY;
            if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.showOrUpdate === 'function') {
                window.GifOverlay.showOrUpdate('player', imgObj.src, screenX, screenY, renderSize);
            } else {
                // 後備：仍以 Canvas 繪製（GIF 可能不動，但不影響功能）
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
        // 視覺覆蓋（DOM 護盾），與武器中一致；此處作為冗餘保險。
        try {
            if (typeof InvincibleEffect !== 'undefined') {
                const effect = new InvincibleEffect(this, this.invulnerabilityDuration);
                if (typeof Game !== 'undefined' && Game.addProjectile) {
                    Game.addProjectile(effect);
                }
            }
        } catch (_) {}
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
         Game.gameOver();
     }
    
    // 獲得經驗
    gainExperience(amount) {
        const mul = (this.experienceGainMultiplier != null) ? this.experienceGainMultiplier : 1.0;
        const finalAmount = Math.max(0, Math.floor(amount * mul));
        this.experience += finalAmount;
        
        // 檢查是否升級
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
        this.experienceToNextLevel = Math.floor(CONFIG.EXPERIENCE.LEVEL_UP_BASE * Math.pow(CONFIG.EXPERIENCE.LEVEL_UP_MULTIPLIER, this.level - 1));
        
        // 更新UI
        UI.updateLevel(this.level);
        UI.updateExpBar(this.experience, this.experienceToNextLevel);
        
        // 顯示升級選單
        UI.showLevelUpMenu();

        // 播放升級音效
        if (typeof AudioManager !== 'undefined') {
            AudioManager.playSound('level_up');
        }
    }
    
    // 添加武器
    addWeapon(weaponType) {
        // 檢查是否已有此武器
        const existingWeapon = this.weapons.find(w => w.type === weaponType);
        
        if (existingWeapon) {
            // 如果已有此武器，則升級
            existingWeapon.levelUp();
        } else {
            // 否則添加新武器
            const newWeapon = new Weapon(this, weaponType);
            this.weapons.push(newWeapon);
        }
    }
    
    // 升級武器
    upgradeWeapon(weaponType) {
        const weapon = this.weapons.find(w => w.type === weaponType);
        if (weapon) {
            weapon.levelUp();
        }
    }

    // 嘗試啟動大招
    tryActivateUltimate() {
        if (this.isUltimateActive) return;
        if (Math.floor(this.energy) < this.maxEnergy) return; // 需要100能量
        this.activateUltimate();
    }

    // 啟動大招：變身、體型變大、四技能LV10、能量消耗
    activateUltimate() {
        // 保存必要的玩家狀態，不初始化玩家
        this._ultimateBackup = {
            width: this.width,
            height: this.height,
            collisionRadius: this.collisionRadius,
            weapons: this.weapons.map(w => ({ type: w.type, level: w.level }))
        };
        
        // 取得角色特定的大招配置（若存在）
        let characterId = null;
        try {
            if (typeof Game !== 'undefined' && Game.selectedCharacter) {
                characterId = Game.selectedCharacter.id;
            }
        } catch (_) {}
        
        const charUltimate = (characterId && CONFIG.CHARACTER_ULTIMATES && CONFIG.CHARACTER_ULTIMATES[characterId]) 
            ? CONFIG.CHARACTER_ULTIMATES[characterId] 
            : null;
        
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
        
        // 變身狀態
        this.isUltimateActive = true;
        this.ultimateEndTime = Date.now() + CONFIG.ULTIMATE.DURATION_MS;
        this._ultimateImageKey = ultimateImageKey; // 儲存角色特定圖片鍵
        this._ultimateExtraDefense = extraDefense; // 儲存額外防禦
        
        // 體型變大
        this.width = Math.floor(this.width * CONFIG.ULTIMATE.PLAYER_SIZE_MULTIPLIER);
        this.height = Math.floor(this.height * CONFIG.ULTIMATE.PLAYER_SIZE_MULTIPLIER);
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
        
        // 恢復尺寸與碰撞半徑
        this.width = this._ultimateBackup.width;
        this.height = this._ultimateBackup.height;
        this.collisionRadius = this._ultimateBackup.collisionRadius;
        
        // 恢復原本武器與等級
        this.weapons = this._ultimateBackup.weapons.map(info => {
            const w = new Weapon(this, info.type);
            w.level = info.level;
            w.projectileCount = w.config.LEVELS[w.level - 1].COUNT;
            return w;
        });

        // 大招結束後：移除玩家名下的所有「守護領域」常駐場域
        // 理由：守護領域為常駐效果，避免大招期間的臨時LV10場域在結束後殘留。
        try {
            if (typeof Game !== 'undefined' && Array.isArray(Game.projectiles)) {
                for (const p of Game.projectiles) {
                    if (p && p.weaponType === 'AURA_FIELD' && p.player === this && !p.markedForDeletion) {
                        if (typeof p.destroy === 'function') p.destroy(); else p.markedForDeletion = true;
                    }
                }
            }
        } catch (_) {}
        
        // 能量歸零
        this.energy = 0;
        UI.updateEnergyBar(this.energy, this.maxEnergy);
        
        // 清理備份與角色特定配置
        this._ultimateBackup = null;
        this.ultimateEndTime = 0;
        this._ultimateImageKey = null;
    }
}
