// 防禦塔TD玩家角色系統
// 管理玩家的移動、攻擊、建造等行為

class TDPlayer {
    constructor(x, y, config) {
        console.log('TDPlayer構造函數開始，位置:', x, y);
        this.x = x;
        this.y = y;
        this.fullConfig = config;
        this.config = config.PLAYER;
        
        console.log('玩家配置:', this.config);
        
        // 基礎屬性
        this.size = this.config.SIZE;
        this.speed = this.config.SPEED;
        this.damage = this.config.DAMAGE;
        this.attackRange = this.config.ATTACK_RANGE;
        this.attackCooldown = this.config.ATTACK_COOLDOWN;
        this.buildRange = this.config.BUILD_RANGE;
        
        // 狀態
        this.isMoving = false;
        this.moveTarget = null;
        this.lastAttackTime = 0;
        this.isAttacking = false;
        this.attackTarget = null;
        
        // 建造相關
        this.isBuilding = false;
        this.buildTarget = null;
        this.buildStartTime = 0;
        this.buildDuration = 0;
        
        // 視覺效果
        this.sprite = null;
        this.animationTime = 0;
        this.direction = 0; // 0: 右, 1: 下, 2: 左, 3: 上
        this.facingRight = true; // 面向右側（用於 player2 方向切換）
        
        // 音效
        this.attackSound = TD_CONFIG.SOUNDS.PLAYER_ATTACK;

        // 鍵盤移動輸入狀態（WASD + 方向鍵）
        this.keyboardInput = {
            up: false,
            down: false,
            left: false,
            right: false
        };
        this.keyboardMoving = false;
        const mapCfg = this.fullConfig.MAP || { WIDTH: 3840, HEIGHT: 2160 };
        this.mapBounds = {
            minX: this.size / 2,
            maxX: mapCfg.WIDTH - this.size / 2,
            minY: this.size / 2,
            maxY: mapCfg.HEIGHT - this.size / 2
        };
        
        // 攻擊視覺：匕首彈道（dagger.png）
        this.attackProjectiles = [];
        
        this.loadSprite();
    }
    
    // 載入精靈圖（依選角角色決定玩家外觀，但保持 TD 模式獨立）
    loadSprite() {
        // 預設：沿用原本防禦模式玩家圖
        let src = 'assets/images/player.gif';
        try {
            const sc = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
            // 依選角角色決定圖片：灰妲DaDa使用player2.png，森森鈴蘭使用player3.gif，洛可洛斯特使用player4.png，艾比Rabi使用player5.png，其餘角色維持player.gif
            if (sc && sc.spriteImageKey) {
                // 根据spriteImageKey判断是gif还是png
                if (sc.spriteImageKey === 'player3') {
                    src = 'assets/images/player3.gif';
                } else if (sc.spriteImageKey === 'player2') {
                    src = 'assets/images/player2.png';
                } else if (sc.spriteImageKey === 'player4') {
                    src = 'assets/images/player4.png';
                } else if (sc.spriteImageKey === 'player5') {
                    src = 'assets/images/player5.png';
                } else {
                    src = `assets/images/${sc.spriteImageKey}.gif`;
                }
            } else if (sc && (sc.id === 'dada' || sc.spriteImageKey === 'player2')) {
                src = 'assets/images/player2.png';
            } else if (sc && sc.id === 'lilylinglan') {
                src = 'assets/images/player3.gif';
            } else if (sc && (sc.id === 'rokurost' || sc.spriteImageKey === 'player4')) {
                src = 'assets/images/player4.png';
            } else if (sc && (sc.id === 'rabi' || sc.spriteImageKey === 'player5')) {
                src = 'assets/images/player5.png';
            }
        } catch(_) {}
        this.sprite = {
            src,
            width: this.size,
            height: this.size
        };
    }
    
    /**
     * 更新玩家狀態
     * 
     * 維護說明：
     * - 此方法在每幀被 TDGame.update() 調用
     * - 鍵盤移動優先於點擊移動（updateKeyboardMovement 先執行）
     * - 如果鍵盤輸入存在，會取消點擊移動目標
     * 
     * 重要：此方法必須調用 updateKeyboardMovement() 才能響應鍵盤輸入
     * 之前存在重複的 update() 方法定義（380行），已刪除，只保留此版本
     * 
     * 依賴：
     * - this.keyboardInput - 由 TDGame.handleKeyDown() -> handleMovementInput() 更新
     * - Input.keys (input.js) - 作為備用鍵盤狀態來源（getExternalKeyboardAxis）
     * 
     * 注意：避免代碼膨脹，不要重複定義此方法
     */
    update(deltaTime, currentTime, enemyManager, towerManager, gameState) {
        // 更新動畫時間
        this.animationTime += deltaTime;

        // 鍵盤移動優先於點擊移動
        this.updateKeyboardMovement(deltaTime);
        
        // 處理移動
        if (this.isMoving && this.moveTarget) {
            this.updateMovement(deltaTime, towerManager);
        }
        
        // 處理建造
        if (this.isBuilding && this.buildTarget) {
            this.updateBuilding(currentTime, towerManager, gameState);
        }
        
        // 處理攻擊
        if (!this.isBuilding && currentTime >= this.lastAttackTime + this.attackCooldown) {
            this.findAndAttackEnemy(currentTime, enemyManager);
        }

        // 更新攻擊彈道
        this.updateAttackProjectiles(currentTime);
    }

    // 鍵盤移動處理
    updateKeyboardMovement(deltaTime) {
        let horizontal = (this.keyboardInput.right ? 1 : 0) - (this.keyboardInput.left ? 1 : 0);
        let vertical = (this.keyboardInput.down ? 1 : 0) - (this.keyboardInput.up ? 1 : 0);
        const externalAxis = this.getExternalKeyboardAxis();
        if (externalAxis) {
            horizontal = externalAxis.horizontal;
            vertical = externalAxis.vertical;
        }
        
        if (horizontal === 0 && vertical === 0) {
            this.keyboardMoving = false;
            return;
        }
        
        this.keyboardMoving = true;
        this.isMoving = false; // 取消點擊移動
        this.moveTarget = null;
        
        const length = Math.sqrt(horizontal * horizontal + vertical * vertical) || 1;
        const moveDistance = this.speed * (deltaTime / 1000);
        const vx = (horizontal / length) * moveDistance;
        const vy = (vertical / length) * moveDistance;
        
        let nextX = this.x + vx;
        let nextY = this.y + vy;
        
        // 邊界檢查
        nextX = Math.max(this.mapBounds.minX, Math.min(this.mapBounds.maxX, nextX));
        nextY = Math.max(this.mapBounds.minY, Math.min(this.mapBounds.maxY, nextY));
        
        // 更新方向
        if (Math.abs(vx) > Math.abs(vy)) {
            this.direction = vx > 0 ? 0 : 2;
        } else {
            this.direction = vy > 0 ? 1 : 3;
        }
        
        // 根據水平移動方向更新面向（參考生存模式：優先水平方向）
        if (Math.abs(vx) > 0.1) {
            this.facingRight = vx > 0;
        }
        
        this.x = nextX;
        this.y = nextY;
    }

    getExternalKeyboardAxis() {
        if (typeof Input === 'undefined' || !Input.keys) return null;
        const isDown = (k) => Input.keys[k] === true;
        const horizontal = (isDown('ArrowRight') || isDown('d') || isDown('D') ? 1 : 0) -
            (isDown('ArrowLeft') || isDown('a') || isDown('A') ? 1 : 0);
        const vertical = (isDown('ArrowDown') || isDown('s') || isDown('S') ? 1 : 0) -
            (isDown('ArrowUp') || isDown('w') || isDown('W') ? 1 : 0);
        if (horizontal === 0 && vertical === 0) return null;
        return { horizontal, vertical };
    }

    // 設定鍵盤輸入
    handleMovementInput(direction, isPressed) {
        if (!this.keyboardInput.hasOwnProperty(direction)) return;
        this.keyboardInput[direction] = isPressed;
        if (!isPressed) {
            // 若所有鍵已釋放，標記鍵盤移動結束
            const anyPressed = Object.values(this.keyboardInput).some(Boolean);
            if (!anyPressed) {
                this.keyboardMoving = false;
            }
        }
    }
    
    // 更新移動
    updateMovement(deltaTime, towerManager) {
        if (!this.moveTarget) return;
        
        const dx = this.moveTarget.x - this.x;
        const dy = this.moveTarget.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 更新方向
        if (Math.abs(dx) > Math.abs(dy)) {
            this.direction = dx > 0 ? 0 : 2; // 右或左
        } else {
            this.direction = dy > 0 ? 1 : 3; // 下或上
        }
        
        // 根據點擊移動方向更新面向（參考生存模式）
        if (Math.abs(dx) > 0.1) {
            this.facingRight = dx > 0;
        }
        
        if (distance < 5) {
            // 到達目標
            this.x = this.moveTarget.x;
            this.y = this.moveTarget.y;
            this.isMoving = false;
            this.moveTarget = null;
            
            // 如果目標是建造點，開始建造
            if (this.buildTarget && this.isInBuildRange(this.buildTarget.x, this.buildTarget.y)) {
                this.startBuilding(towerManager);
            }
        } else {
            // 繼續移動
            const moveDistance = this.speed * (deltaTime / 1000);
            
            if (distance <= moveDistance) {
                this.x = this.moveTarget.x;
                this.y = this.moveTarget.y;
                this.isMoving = false;
                this.moveTarget = null;
                
                if (this.buildTarget && this.isInBuildRange(this.buildTarget.x, this.buildTarget.y)) {
                    this.startBuilding(towerManager);
                }
            } else {
                this.x += (dx / distance) * moveDistance;
                this.y += (dy / distance) * moveDistance;
            }
        }
    }
    
    // 更新建造
    updateBuilding(currentTime, towerManager, gameState) {
        if (currentTime >= this.buildStartTime + this.buildDuration) {
            this.isBuilding = false;
            this.buildTarget = null;
        }
    }
    
    // 開始建造
    startBuilding(towerManager) {
        if (!this.buildTarget) return;

        const tower = towerManager.buildTower(
            this.buildTarget.towerType,
            this.buildTarget.x,
            this.buildTarget.y
        );
        if (!tower) {
            this.isBuilding = false;
            this.buildTarget = null;
            return;
        }

        this.isBuilding = true;
        this.buildStartTime = Date.now();
        this.buildDuration = this.buildTarget.buildTime * 1000;
        this.isMoving = false;
        this.moveTarget = null;
    }
    
    // 完成建造 - 創建防禦塔
    completeBuilding(towerManager, gameState) {
        this.isBuilding = false;
        this.buildTarget = null;
    }
    
    // 尋找並攻擊敵人
    findAndAttackEnemy(currentTime, enemyManager) {
        const nearestEnemy = enemyManager.getNearestEnemy(this.x, this.y, this.attackRange);
        
        if (nearestEnemy) {
            this.attack(nearestEnemy, currentTime);
        }
    }
    
    // 攻擊（應用天賦系統加成）
    attack(target, currentTime) {
        if (!target.isAlive) return;
        
        this.isAttacking = true;
        this.attackTarget = target;
        this.lastAttackTime = currentTime;
        
        // 計算基礎傷害（應用天賦系統）
        let finalDamage = this.damage;
        let critBonusPct = 0;
        
        // 應用天賦系統的傷害加成
        try {
            if (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel) {
                // 傷害強化（百分比加成）
                // 改為加算：將倍率轉換為加成百分比，以便未來多個來源可以相加
                const damageBoostLevel = TalentSystem.getTalentLevel('damage_boost') || 0;
                if (damageBoostLevel > 0 && TalentSystem.tieredTalents && TalentSystem.tieredTalents.damage_boost) {
                    const effect = TalentSystem.tieredTalents.damage_boost.levels[damageBoostLevel - 1];
                    if (effect && effect.multiplier) {
                        // 將倍率轉換為加成百分比（例如 2.0 → +100%）
                        const damageBoost = effect.multiplier - 1.0;
                        finalDamage = finalDamage * (1.0 + damageBoost);
                    }
                }
                
                // 傷害特化（固定加成）
                const damageSpecLevel = TalentSystem.getTalentLevel('damage_specialization') || 0;
                if (damageSpecLevel > 0 && TalentSystem.tieredTalents && TalentSystem.tieredTalents.damage_specialization) {
                    const effect = TalentSystem.tieredTalents.damage_specialization.levels[damageSpecLevel - 1];
                    if (effect && effect.flat) {
                        finalDamage += effect.flat;
                    }
                }
                
                // 爆擊率加成
                const critLv = TalentSystem.getTalentLevel('crit_enhance') || 0;
                if (critLv > 0 && TalentSystem.tieredTalents && TalentSystem.tieredTalents.crit_enhance) {
                    const effect = TalentSystem.tieredTalents.crit_enhance.levels[critLv - 1];
                    if (effect && effect.chancePct) {
                        critBonusPct = effect.chancePct;
                    }
                }
            }
        } catch (error) {
            console.warn('應用天賦系統傷害加成時出錯:', error);
        }
        
        // 使用 DamageSystem 計算最終傷害和爆擊（如果可用）
        let isCrit = false;
        try {
            if (typeof DamageSystem !== 'undefined' && DamageSystem.computeHit) {
                const result = DamageSystem.computeHit(finalDamage, target, {
                    weaponType: 'PLAYER_ATTACK',
                    critChanceBonusPct: critBonusPct
                });
                finalDamage = result.amount;
                isCrit = result.isCrit;
            }
        } catch (_) {}
        
        // 計算攻擊方向（從玩家位置指向目標）
        const dirX = target.x - this.x;
        const dirY = target.y - this.y;
        
        // 獲取相機對象（用於傷害數字座標轉換）
        let camera = null;
        try {
            if (typeof window !== 'undefined' && window.debugTDGame) {
                camera = window.debugTDGame.camera;
            }
        } catch (_) {}
        
        // 對目標造成傷害（傳遞傷害來源信息，包含攻擊方向和爆擊信息）
        const died = target.takeDamage(finalDamage, {
            weaponType: 'PLAYER_ATTACK',
            dirX,
            dirY,
            camera,
            isCrit,
            finalDamage: finalDamage  // 傳遞已計算的傷害值
        });
        
        // 播放音效
        if (this.onPlaySound) {
            this.onPlaySound(this.attackSound);
        }

        // 產生匕首彈道視覺（純視覺，不影響命中判定與傷害）
        this.spawnDaggerProjectile(target, currentTime);
        
        // 重置攻擊狀態
        setTimeout(() => {
            this.isAttacking = false;
            this.attackTarget = null;
        }, 200);
        
        return died;
    }
    
    // 移動到指定位置
    moveTo(x, y) {
        this.moveTarget = { x, y };
        this.isMoving = true;
        this.isBuilding = false; // 取消當前建造
        this.buildTarget = null;
    }
    
    // 設定建造目標 - 新的建造系統
    setBuildTarget(buildTarget) {
        this.buildTarget = buildTarget;
        // 直接設定移動目標但不清除建造目標
        this.moveTarget = { x: buildTarget.x, y: buildTarget.y };
        this.isMoving = true;
    }
    
    // 檢查是否在建造範圍內
    isInBuildRange(x, y) {
        const distance = Math.sqrt(
            Math.pow(x - this.x, 2) + Math.pow(y - this.y, 2)
        );
        return distance <= this.buildRange;
    }
    
    // 檢查是否在攻擊範圍內
    isInAttackRange(x, y) {
        const distance = Math.sqrt(
            Math.pow(x - this.x, 2) + Math.pow(y - this.y, 2)
        );
        return distance <= this.attackRange;
    }
    
    // 停止移動
    stopMoving() {
        this.isMoving = false;
        this.moveTarget = null;
        this.buildTarget = null;
    }
    
    // 取消建造
    cancelBuilding() {
        this.isBuilding = false;
        this.buildTarget = null;
    }
    
    
    // 渲染玩家（GIF、player4、player5和player2由TDGifOverlay在td_game.js中統一處理，這裡只繪製其他元素）
    render(ctx, resources) {
        ctx.save();
        
        // 如果是GIF、player4、player5或player2，跳過Canvas繪製（由TDGifOverlay處理，避免畫質降低）
        const isGif = this.sprite && this.sprite.src && /\.gif$/i.test(this.sprite.src);
        const sc = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
        const isPlayer4 = sc && (sc.id === 'rokurost' || sc.spriteImageKey === 'player4');
        const isPlayer5 = sc && (sc.id === 'rabi' || sc.spriteImageKey === 'player5');
        const isPlayer2 = sc && (sc.id === 'dada' || sc.spriteImageKey === 'player2');
        
        if (!isGif && !isPlayer4 && !isPlayer5 && !isPlayer2) {
            // 載入圖片：依 this.sprite.src 推導資源鍵（支援 player / player2）
            let image = null;
            if (this.sprite && this.sprite.src) {
                try {
                    const baseName = this.sprite.src
                        .replace('assets/images/', '')
                        .replace(/\.(png|gif)$/i, '');
                    image = resources.getImage(baseName);
                } catch(_) {}
            }
            if (!image) {
                image = resources.getImage('player');
            }
            if (image) {
                // 後備方案：僅在 TDGifOverlay 不可用時才使用 Canvas 繪製（會導致畫質降低，應避免）
                // 正常情況下應使用 TDGifOverlay 以保持最佳畫質
                // 特殊處理：player4.png 需要保持 500:627 的寬高比，並放大顯示以與其他角色接近
                // 特殊處理：player5.png 需要保持 500:467 的寬高比，並放大顯示以與其他角色接近
                if (this.sprite && this.sprite.src && /player4\.png$/i.test(this.sprite.src)) {
                    const imgWidth = image.naturalWidth || image.width || 500;
                    const imgHeight = image.naturalHeight || image.height || 627;
                    const aspectRatio = imgWidth / imgHeight; // 500/627 ≈ 0.798
                    // 防禦模式中放大 1.3 倍以與其他角色接近
                    const renderHeight = Math.max(1, Math.floor(this.size * 1.3));
                    const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                    ctx.drawImage(
                        image,
                        this.x - renderWidth / 2,
                        this.y - renderHeight / 2,
                        renderWidth,
                        renderHeight
                    );
                } else if (this.sprite && this.sprite.src && /player5\.png$/i.test(this.sprite.src)) {
                    const imgWidth = image.naturalWidth || image.width || 500;
                    const imgHeight = image.naturalHeight || image.height || 467;
                    const aspectRatio = imgWidth / imgHeight; // 500/467 ≈ 1.071
                    // 防禦模式中放大 1.3 倍以與其他角色接近
                    const renderHeight = Math.max(1, Math.floor(this.size * 1.3));
                    const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                    ctx.drawImage(
                        image,
                        this.x - renderWidth / 2,
                        this.y - renderHeight / 2,
                        renderWidth,
                        renderHeight
                    );
                } else {
                    // 其他角色使用正方形顯示（保持原有行為）
                    ctx.drawImage(
                        image,
                        this.x - this.size / 2,
                        this.y - this.size / 2,
                        this.size,
                        this.size
                    );
                }
            } else {
                // 最終後備繪製（純色方塊，僅在圖片載入失敗時使用）
                ctx.fillStyle = this.isBuilding ? '#FFD700' : '#00FF00';
                ctx.fillRect(
                    this.x - this.size / 2,
                    this.y - this.size / 2,
                    this.size,
                    this.size
                );
            }
        }
        
        // 繪建造範圍（建造模式時）
        if (this.isBuilding) {
            this.renderBuildRange(ctx);
        }
        
        // 繪製建造進度
        if (this.isBuilding && this.buildTarget) {
            this.renderBuildProgress(ctx);
        }
        
        // 繪製移動目標
        if (this.isMoving && this.moveTarget) {
            this.renderMoveTarget(ctx);
        }

        // 繪製匕首彈道
        this.renderAttackProjectiles(ctx, resources);
        
        ctx.restore();
    }
    
    // （已停用）渲染攻擊範圍：防禦模式改用匕首彈道取代紅圈
    renderAttackRange(ctx) {}

    // 更新匕首彈道
    updateAttackProjectiles(currentTime) {
        const life = 200; // 每發匕首存活 200ms
        this.attackProjectiles = this.attackProjectiles.filter(p => {
            const t = (currentTime - p.startTime) / life;
            if (t >= 1) return false;
            p.t = t;
            return true;
        });
    }

    // 產生一發匕首彈道
    spawnDaggerProjectile(target, currentTime) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const angle = Math.atan2(dy, dx);
        this.attackProjectiles.push({
            startX: this.x,
            startY: this.y,
            targetX: target.x,
            targetY: target.y,
            angle,
            startTime: currentTime,
            t: 0
        });
    }

    // 繪製匕首彈道
    renderAttackProjectiles(ctx, resources) {
        if (!this.attackProjectiles.length) return;
        const image = resources.getImage('dagger');
        const size = 24;
        this.attackProjectiles.forEach(p => {
            const x = p.startX + (p.targetX - p.startX) * p.t;
            const y = p.startY + (p.targetY - p.startY) * p.t;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(p.angle);
            if (image) {
                ctx.drawImage(image, -size / 2, -size / 2, size, size);
            } else {
                // 後備：使用簡單的白色匕首形狀
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(-size / 2, -2, size, 4);
            }
            ctx.restore();
        });
    }
    
    // 渲染建造範圍
    renderBuildRange(ctx) {
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.buildRange, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // 渲染建造進度
    renderBuildProgress(ctx) {
        const buildProgress = (Date.now() - this.buildStartTime) / this.buildDuration;
        const barWidth = 40;
        const barHeight = 6;
        const barY = this.y - this.size / 2 - 15;
        
        // 背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth, barHeight);
        
        // 進度
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth * buildProgress, barHeight);
        
        // 邊框
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x - barWidth / 2, barY, barWidth, barHeight);
    }
    
    // 渲染移動目標
    renderMoveTarget(ctx) {
        if (!this.moveTarget) return;
        
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.moveTarget.x, this.moveTarget.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // 目標標記
        ctx.fillStyle = '#00FF00';
        ctx.beginPath();
        ctx.arc(this.moveTarget.x, this.moveTarget.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 導出類別
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TDPlayer;
} else {
    window.TDPlayer = TDPlayer;
}
