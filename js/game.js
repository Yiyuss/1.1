// 遊戲主引擎
/**
 * Game（遊戲主引擎）
 * 職責：主迴圈、更新與繪製、資源管理、實體管理、遊戲狀態維護。
 * 依賴：Input、UI、WaveSystem、Player、Enemy、Projectile、BossProjectile、Obstacle、Chest、Experience、Utils、CONFIG、Audio。
 * 不變式與注意：
 * - 玩家與武器在每幀會更新兩次（歷史節奏設計）；請勿移除或更改順序。
 * - 相機夾限、世界邊界與格線、背景平鋪等尺寸與邏輯不可更動。
 * - 金幣儲存鍵 `game_coins` 與即時 UI 更新流程不可更動。
 * - 所有人眼可見文字與排版不可改（除非另行要求）。
 * 版本：維持現行遊戲數值與行為；作者：原始專案作者 + 維護。
 */
const Game = {
    canvas: null,
    ctx: null,
    player: null,
    enemies: [],
    projectiles: [],
    bossProjectiles: [],
    explosionParticles: [],
    heartTransmissionEffects: [], // 心意傳遞效果圖片列表
    experienceOrbs: [],
    chests: [],
    pineappleUltimatePickups: [],
    obstacles: [],
    decorations: [],
    lastUpdateTime: 0,
    gameTime: 0,
    isPaused: false,
    isGameOver: false,
    boss: null,
    exit: null, // 生存模式第20波BOSS死亡後生成的出口
    selectedCharacter: null,
    // 世界與鏡頭
    worldWidth: 0,
    worldHeight: 0,
    camera: { x: 0, y: 0 },
    coins: 0,
    // 花園地圖視頻播放相關
    gardenVideoTimer: 0, // 累積時間（毫秒）
    gardenVideoInterval: 30000, // 每30秒播放一次
    gardenVideoPlaying: false, // 是否正在播放視頻
    gardenVideoElement: null, // 視頻元素
    gardenVideoFadeOutTime: 0, // 淡出開始時間
    // 路口地圖：車輛危險物（每10秒生成3台）
    intersectionCarTimer: 0,
    intersectionCarInterval: 10000,
    // 統計數據
    enemiesKilled: 0,
    coinsCollected: 0,
    expCollected: 0,
    // M1：組隊模式資訊（僅在組隊模式下存在）
    multiplayer: null, // { roomId, role, uid, sessionId } 或 null
    // M4：遠程玩家列表（僅在組隊模式且為室長時存在）
    remotePlayers: [], // Array<Player>，遠程玩家的完整 Player 對象
    // 組隊HUD更新定時器
    _multiplayerHUDUpdateTimer: 0,

    init: function () {
        // 獲取畫布和上下文
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        // 設置畫布大小
        this.canvas.width = CONFIG.CANVAS_WIDTH;
        this.canvas.height = CONFIG.CANVAS_HEIGHT;

        // 計算世界大小：3x3畫面
        this.worldWidth = CONFIG.CANVAS_WIDTH * (CONFIG.WORLD?.GRID_X || 3);
        this.worldHeight = CONFIG.CANVAS_HEIGHT * (CONFIG.WORLD?.GRID_Y || 3);
        this.camera = { x: 0, y: 0 };

        // 初始化輸入系統
        Input.init();

        // 初始化UI
        UI.init();

        // 可選：初始化彈幕系統（預設停用，不影響現有行為）
        try {
            if (typeof BulletSystem !== 'undefined' && typeof BulletSystem.init === 'function') {
                BulletSystem.init();
            }
        } catch (e) {
            console.warn('BulletSystem.init 失敗：', e);
        }

        // 載入金幣並設定自動存檔
        try { this.loadCoins(); } catch (_) { }
        try {
            window.addEventListener('beforeunload', () => { try { this.saveCoins(); } catch (_) { } });
        } catch (_) { }

        // 創建玩家（世界中心）
        this.player = new Player(this.worldWidth / 2, this.worldHeight / 2);

        // 應用天賦效果 - 確保在玩家創建後立即應用
        try {
            console.log('玩家創建前血量:', this.player.health, '/', this.player.maxHealth);

            if (typeof TalentSystem !== 'undefined' && typeof TalentSystem.applyTalentEffects === 'function') {
                console.log('正在應用天賦效果到玩家身上...');
                TalentSystem.applyTalentEffects(this.player);
            } else if (typeof applyTalentEffects === 'function') {
                console.log('使用全局函數應用天賦效果...');
                applyTalentEffects(this.player);
            } else {
                console.warn('找不到天賦系統或應用函數');
            }

            console.log('玩家創建後血量:', this.player.health, '/', this.player.maxHealth);
        } catch (e) {
            console.error('應用天賦效果失敗:', e);
        }

        // 初始化波次系統
        WaveSystem.init();

        // 開始遊戲循環
        this.lastUpdateTime = Date.now();
        requestAnimationFrame(this.gameLoop.bind(this));
    },

    // 遊戲主循環
    gameLoop: function (timestamp) {
        // 計算時間差
        const currentTime = Date.now();
        let deltaTime = currentTime - this.lastUpdateTime;

        // 如果遊戲暫停，不更新lastUpdateTime，避免恢復時deltaTime過大（修復ESC暫停BUG）
        if (this.isPaused) {
            // 暫停時不更新lastUpdateTime，保持暫停前的時間點
            // 這樣恢復時deltaTime會很小，不會導致技能冷卻時間異常
            deltaTime = 0; // 暫停時deltaTime設為0
        } else {
            // 限制deltaTime的最大值，避免暫停後恢復時時間跳躍過大（修復ESC暫停BUG）
            // 最大允許100ms（約6幀），超過則視為異常時間跳躍，重置為正常值
            const MAX_DELTA_TIME = 100;
            if (deltaTime > MAX_DELTA_TIME) {
                deltaTime = MAX_DELTA_TIME;
            }
            this.lastUpdateTime = currentTime;
        }

        // 管理員測試快捷鍵已統一收斂到 Input（js/input.js），避免在 gameLoop 內重複輪詢造成污染/重入

        // 如果遊戲未暫停，更新遊戲狀態（加入防呆，避免單幀錯誤中斷迴圈）
        try {
            if (!this.isPaused && !this.isGameOver) {
                // 非生存模式（例如主線/挑戰）啟動時，暫停生存更新以避免互相污染
                let activeId = null;
                try {
                    activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                } catch (_) { }
                if (activeId === 'main' || activeId === 'challenge' || activeId === 'defense' || activeId === '3d') {
                    // 在主線/挑戰/防禦/3D模式下不執行生存邏輯更新
                } else {
                    this.update(deltaTime);
                }
            }
        } catch (e) {
            console.error('Game.update 發生錯誤，跳過本幀：', e);
        }

        // 繪製遊戲（加入防呆）
        try {
            // 檢查當前模式，如果是3D模式則不執行draw
            let activeId = null;
            try {
                activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
            } catch (_) { }
            if (activeId !== '3d') {
                this.draw();
            }
        } catch (e) {
            console.error('Game.draw 發生錯誤，跳過本幀：', e);
        }

        // 繼續循環
        requestAnimationFrame(this.gameLoop.bind(this));
    },

    // 更新遊戲狀態
    /**
     * 更新邏輯（每幀）
     * - 不變式：玩家與武器更新各執行兩次，順序不可更動。
     * - 依賴：Input（熱鍵）、UI（計時器）、WaveSystem（波次）、Utils（相機夾限）。
     * - 提醒：任何看似重複的更新皆為設計需要，請勿合併或刪除。
     */
    update: function (deltaTime) {
        // 管理員測試快捷鍵已統一收斂到 Input（js/input.js），避免在 update 內重複輪詢造成按住連發

        // 更新遊戲時間
        this.gameTime += deltaTime;
        // 正規化時間倍率，避免粒子/效果更新時發生未定義錯誤
        const deltaMul = deltaTime / 16.67;

        // 花園地圖：每30秒播放一次視頻
        if (this.selectedMap && this.selectedMap.id === 'garden' && !this.isPaused && !this.isGameOver) {
            this._updateGardenVideo(deltaTime);
        }

        // 路口地圖：每 10 秒生成 3 台車（直線穿越）
        // ✅ MMORPG 架構：在多人模式下，車輛由服務器端生成（服務器權威）
        // 在單機模式下，由客戶端生成
        if (this.selectedMap && this.selectedMap.id === 'intersection' && !this.isPaused && !this.isGameOver) {
            try {
                let isSurvivalMode = false;
                let isMultiplayer = false;
                try {
                    const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                    isSurvivalMode = (activeId === 'survival' || activeId === null);
                    // ✅ 隔離：只允許「組隊 survival（enabled）」走多人路徑
                    isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled === true);
                } catch (_) { }

                // ✅ MMORPG 架構：在多人模式下，車輛由服務器端生成，客戶端不生成
                // 在單機模式下，由客戶端生成
                if (!isSurvivalMode || !isMultiplayer) {
                    // 單機模式或其他模式：客戶端生成
                    this.intersectionCarTimer += deltaTime;
                    if (this.intersectionCarTimer >= this.intersectionCarInterval) {
                        // 扣回間隔（避免 lag 時累積爆發）
                        this.intersectionCarTimer = this.intersectionCarTimer % this.intersectionCarInterval;
                        this.spawnIntersectionCars(4);
                    }
                }
                // 多人模式：車輛由服務器端生成，通過 updateCarHazardsFromServer 同步
            } catch (e) {
                console.warn("[Game] 生成路口車輛失敗:", e);
            }
        }

        // 更新玩家與武器（第一次，保留歷史節奏）
        this._updatePlayer(deltaTime);
        this._updateWeapons(deltaTime);

        // 更新UI計時器
        UI.updateTimer(this.gameTime);

        // 更新波次系統
        WaveSystem.update(deltaTime);

        // 更新玩家（第二次，保留歷史節奏）
        this._updatePlayer(deltaTime);

        // 組隊模式：定期檢查是否所有玩家都死亡（僅隊長端）
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

            // ✅ MMORPG 架構：所有玩家都能檢查遊戲失敗，不依賴隊長端
            if (isSurvivalMode && this.multiplayer && this.player && typeof this.player._checkAllPlayersDead === 'function') {
                // 每500ms檢查一次（避免過於頻繁）
                if (!this._lastAllPlayersDeadCheck) this._lastAllPlayersDeadCheck = 0;
                const now = Date.now();
                if (now - this._lastAllPlayersDeadCheck >= 500) {
                    this._lastAllPlayersDeadCheck = now;
                    this.player._checkAllPlayersDead();
                }
            }
        } catch (_) { }

        // M2：更新遠程玩家（所有端都需要更新，不只是隊長）
        try {
            // 確保只在生存模式下執行組隊邏輯
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null); // null 表示舊版流程，預設為生存模式
            } catch (_) { }

            if (isSurvivalMode && this.multiplayer) {
                // ✅ MMORPG 架構：所有玩家都更新遠程玩家，不依賴角色
                // 這是MMORPG最基本的要求：所有玩家都能看到其他玩家的完整狀態
                if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.updateRemotePlayers === "function") {
                    window.SurvivalOnlineRuntime.updateRemotePlayers(deltaTime);
                }
            }
        } catch (_) { }

        // 更新鏡頭位置（跟隨玩家，並夾限在世界邊界）
        this.camera.x = Utils.clamp(this.player.x - this.canvas.width / 2, 0, Math.max(0, this.worldWidth - this.canvas.width));
        this.camera.y = Utils.clamp(this.player.y - this.canvas.height / 2, 0, Math.max(0, this.worldHeight - this.canvas.height));

        // 更新武器（第二次，保留歷史節奏）
        this._updateWeapons(deltaTime);

        // 更新敵人
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            // ✅ 修復：防止 enemy 為 null/undefined 或沒有 update 方法導致整個系統崩潰
            if (!enemy || typeof enemy.update !== 'function') {
                this.enemies.splice(i, 1);
                continue;
            }
            enemy.update(deltaTime);

            // 移除標記為刪除的敵人
            if (enemy.markedForDeletion) {
                this.enemies.splice(i, 1);

                // 如果是大BOSS，清除引用
                if (enemy === this.boss) {
                    this.boss = null;
                }
            }
        }

        // 更新投射物
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            // ✅ 修復：防止 projectile 為 null/undefined 或沒有 update 方法導致整個系統崩潰
            if (!projectile || typeof projectile.update !== 'function') {
                this.projectiles.splice(i, 1);
                continue;
            }
            projectile.update(deltaTime);

            // ✅ 權威伺服器模式：持續效果（tickDamage/tickIntervalMs）由伺服器結算傷害
            // 這裡用「通用」方式支援多個技能，不需要逐一改 30+ 技能檔案。
            try {
                if (this.multiplayer && this.multiplayer.enabled && this.player && projectile && projectile.player === this.player) {
                    // 只處理有 tickDamage 的持續效果（Aura/Orbit/Gravity/IceField 等）
                    if (typeof projectile.tickDamage === 'number' && typeof projectile.tickIntervalMs === 'number' && projectile.tickIntervalMs > 0) {
                        if (!projectile._netTickAcc) projectile._netTickAcc = 0;
                        projectile._netTickAcc += deltaTime;
                        // radius 優先用 projectile.radius，其次 maxRadius（震波/場），最後用 size/width 推一個保守值
                        const radius = (typeof projectile.radius === 'number' && projectile.radius > 0)
                            ? projectile.radius
                            : (typeof projectile.maxRadius === 'number' && projectile.maxRadius > 0)
                                ? projectile.maxRadius
                                : (typeof projectile.aoeRadius === 'number' && projectile.aoeRadius > 0)
                                    ? projectile.aoeRadius
                                    : 150;
                        const dmg = Math.max(0, Math.floor(projectile.tickDamage || 0));

                        // 避免爆量：單個效果最多每幀送 4 次（tickInterval 典型 120ms）
                        let loops = 0;
                        while (projectile._netTickAcc >= projectile.tickIntervalMs && loops++ < 4) {
                            projectile._netTickAcc -= projectile.tickIntervalMs;
                            // ✅ 確保只在生存模式且多人模式下發送
                            let isSurvivalMode = false;
                            try {
                                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                                    ? GameModeManager.getCurrent()
                                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                                        ? ModeManager.getActiveModeId()
                                        : null);
                                isSurvivalMode = (activeId === 'survival' || activeId === null);
                            } catch (_) { }
                            if (dmg > 0 && isSurvivalMode && this.multiplayer && this.multiplayer.enabled && typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function') {
                                window.SurvivalOnlineRuntime.sendToNet({
                                    type: 'aoe_tick',
                                    weaponType: projectile.weaponType || 'UNKNOWN',
                                    x: (typeof projectile.x === 'number') ? projectile.x : this.player.x,
                                    y: (typeof projectile.y === 'number') ? projectile.y : this.player.y,
                                    radius: Math.max(10, Math.floor(radius)),
                                    damage: dmg,
                                    // ✅ 與單機同源：AOE 也要帶爆擊加成（伺服器才會算出爆擊/浮動）
                                    allowCrit: true,
                                    critChanceBonusPct: (this.player && typeof this.player.critChanceBonusPct === 'number') ? this.player.critChanceBonusPct : 0,
                                    timestamp: Date.now()
                                });
                            }
                        }
                    }
                }
            } catch (_) { }

            // 移除標記為刪除的投射物（對於有 DOM 元素的特效，先調用 destroy 清理）
            if (projectile.markedForDeletion) {
                // 對於 JudgmentEffect 等使用 DOM 的特效，確保清理 DOM 元素
                if (projectile.weaponType === 'JUDGMENT' && typeof projectile.destroy === 'function') {
                    try {
                        projectile.destroy();
                    } catch (_) { }
                }
                this.projectiles.splice(i, 1);
            }
        }

        // 組隊模式：定期清理過期的視覺效果（防止內存泄漏）
        if (this.multiplayer && this.multiplayer.enabled) {
            const now = Date.now();
            const VISUAL_EFFECT_MAX_AGE = 30000; // 30 秒

            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const p = this.projectiles[i];
                if (p && p._isVisualOnly) {
                    // 如果視覺效果超過最大存活時間，強制清理
                    if (!p._createdAt) {
                        p._createdAt = now; // 記錄創建時間
                    } else if (now - p._createdAt > VISUAL_EFFECT_MAX_AGE) {
                        try {
                            if (typeof p.destroy === 'function') {
                                p.destroy();
                            }
                        } catch (_) { }
                        this.projectiles.splice(i, 1);
                    }
                }
            }
        }

        // 更新 BOSS 火彈投射物
        if (this.bossProjectiles) {
            for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
                const bossProjectile = this.bossProjectiles[i];
                bossProjectile.update(deltaTime);

                // 移除標記為刪除的 BOSS 投射物
                if (bossProjectile.markedForDeletion) {
                    this.bossProjectiles.splice(i, 1);
                }
            }
        }

        // 可選：更新彈幕系統（停用時不執行）
        // ✅ 多人元素（伺服器權威）：彈幕（ASURA）由伺服器更新與扣血；客戶端只渲染（避免本地移動/碰撞造成雙重扣血）
        try {
            if (this.multiplayer && this.multiplayer.enabled) {
                // 權威多人：不跑本地 BulletSystem.update
            } else if (typeof BulletSystem !== 'undefined' && typeof BulletSystem.update === 'function') {
                BulletSystem.update(deltaTime);
            }
        } catch (e) {
            console.warn('BulletSystem.update 失敗：', e);
        }

        // 更新爆炸粒子
        for (let i = this.explosionParticles.length - 1; i >= 0; i--) {
            const particle = this.explosionParticles[i];

            particle.x += particle.vx * deltaMul;
            particle.y += particle.vy * deltaMul;
            particle.life -= deltaTime;

            if (particle.life <= 0) {
                this.explosionParticles.splice(i, 1);
            }
        }

        // 組隊模式：廣播爆炸粒子（僅隊長端，批量發送以提高效率）
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

            // ✅ 隔離：只允許「組隊 survival（enabled）」送多人封包
            // 避免污染單機/其他模式/存檔引繼碼（那些模式不該送 WS vfx）。
            if (isSurvivalMode && this.multiplayer && this.multiplayer.enabled === true) {
                // 批量廣播爆炸粒子（每幀最多發送一次，包含所有新創建的粒子）
                if (this._pendingExplosionParticles && this._pendingExplosionParticles.length > 0) {
                    if (typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                        window.SurvivalOnlineBroadcastEvent("explosion_particles", {
                            particles: this._pendingExplosionParticles
                        });
                    }
                    this._pendingExplosionParticles = [];
                }
            }
        } catch (_) { }

        // 更新螢幕閃光效果
        if (this.screenFlash && this.screenFlash.active) {
            this.screenFlash.duration -= deltaTime;
            if (this.screenFlash.duration <= 0) {
                this.screenFlash.active = false;
                this.screenFlash.intensity = 0;
            } else {
                // 閃光強度隨時間衰減
                const progress = this.screenFlash.duration / 150; // 150ms 是初始持續時間
                this.screenFlash.intensity = 0.3 * progress;
            }
        }

        // 更新鏡頭震動效果
        if (this.cameraShake && this.cameraShake.active) {
            this.cameraShake.duration -= deltaTime;
            if (this.cameraShake.duration <= 0) {
                this.cameraShake.active = false;
                this.cameraShake.offsetX = 0;
                this.cameraShake.offsetY = 0;
            } else {
                // 隨機震動偏移
                const intensity = this.cameraShake.intensity * (this.cameraShake.duration / 200); // 200ms 是初始持續時間
                this.cameraShake.offsetX = (Math.random() - 0.5) * intensity;
                this.cameraShake.offsetY = (Math.random() - 0.5) * intensity;
            }
        }

        // 更新經驗寶石
        for (let i = this.experienceOrbs.length - 1; i >= 0; i--) {
            const orb = this.experienceOrbs[i];
            orb.update(deltaTime);

            // 移除標記為刪除的經驗寶石
            if (orb.markedForDeletion) {
                this.experienceOrbs.splice(i, 1);
            }
        }

        // 更新寶箱
        for (let i = this.chests.length - 1; i >= 0; i--) {
            const chest = this.chests[i];
            chest.update(deltaTime);
            if (chest.markedForDeletion) {
                this.chests.splice(i, 1);
            }
        }

        // 更新鳳梨大絕掉落物（只在生存模式使用，不影響其他模式）
        for (let i = this.pineappleUltimatePickups.length - 1; i >= 0; i--) {
            const p = this.pineappleUltimatePickups[i];
            try { p.update(deltaTime); } catch (_) { }
            if (p.markedForDeletion) {
                this.pineappleUltimatePickups.splice(i, 1);
            }
        }

        // 檢查玩家與出口的碰撞（第20波BOSS死亡後）
        // 組隊模式：檢查所有玩家（本地玩家 + 遠程玩家），任何一個玩家觸碰到出口都會觸發勝利
        if (this.exit && !this.isGameOver) {
            // ✅ 權威伺服器模式：多人進行中時，出口觸碰與勝利由伺服器判定（state.isVictory）
            // 這裡不做本地碰撞判定，避免不同步/重複勝利/事件循環。
            if (this.multiplayer && this.multiplayer.enabled) {
                // 僅保留繪製（draw）即可
            } else {
            const exitCenterX = this.exit.x;
            const exitCenterY = this.exit.y;
            const exitHalfWidth = this.exit.width / 2;
            const exitHalfHeight = this.exit.height / 2;

            // 收集所有需要檢查的玩家（本地玩家 + 遠程玩家）
            const allPlayers = [];
            if (this.player) allPlayers.push(this.player);

            // 組隊模式：添加遠程玩家（僅隊長端）
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

                // ✅ 修復：MMO 架構，所有玩家端都應該檢查所有玩家（本地+遠程），不依賴室長端
                if (isSurvivalMode && this.multiplayer) {
                    // 使用 RemotePlayerManager 獲取遠程玩家（所有端都可以）
                    try {
                        if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
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
                    } catch (_) { }
                }
            } catch (_) { }

            // ✅ 權威伺服器模式：多人進行中時，出口觸碰判定由伺服器 state.isVictory 統一權威
            // 避免客戶端廣播 game_victory 造成互打與循環
            const isServerAuthoritative = (this.multiplayer && this.multiplayer.enabled);
            if (!isServerAuthoritative) {
                // 單機模式：客戶端檢查出口觸碰
                for (const player of allPlayers) {
                    if (!player) continue;
                    const playerRadius = player.collisionRadius || 16;
                    const playerX = player.x;
                    const playerY = player.y;

                    // 計算玩家中心到出口矩形的最短距離
                    const closestX = Math.max(exitCenterX - exitHalfWidth, Math.min(playerX, exitCenterX + exitHalfWidth));
                    const closestY = Math.max(exitCenterY - exitHalfHeight, Math.min(playerY, exitCenterY + exitHalfHeight));
                    const distance = Utils.distance(playerX, playerY, closestX, closestY);

                    if (distance < playerRadius) {
                        // 任何一個玩家碰到出口，觸發勝利
                        this.victory();
                        break; // 觸發勝利後跳出循環
                    }
                }
            }
            }
        }

        // 優化：限制實體數量
        this.optimizeEntities();

        // 生存模式聯機（測試）：多人位置同步（僅在生存模式下執行）
        try {
            // 確保只在生存模式下執行組隊邏輯
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null); // null 表示舊版流程，預設為生存模式
            } catch (_) { }

            // ✅ 修復：不要因為存在 multiplayer/Runtime 就把「非生存模式」誤判為生存模式
            // 這會導致其他模式也開始跑多人 tick / 吃流量 / 狀態污染
            // 組隊只允許在 survival 模式啟用，且必須 multiplayer.enabled === true
            if (!isSurvivalMode) {
                // 非生存模式：完全不跑組隊 tick
            }

            if (isSurvivalMode && this.multiplayer && this.multiplayer.enabled &&
                typeof window !== 'undefined' && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.Runtime &&
                typeof window.SurvivalOnlineRuntime.Runtime.tick === 'function') {
                window.SurvivalOnlineRuntime.Runtime.tick(this, deltaTime);
            } else {
                // 添加日志以诊断（仅记录一次，避免日志过多）
                if (!this._tickDiagnosticLogged && typeof window !== 'undefined') {
                    this._tickDiagnosticLogged = true;
                    const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                    console.log(`[Game] tick 诊断: isSurvivalMode=${isSurvivalMode}, activeId=${activeId}, hasMultiplayer=${!!this.multiplayer}, multiplayerRoomId=${this.multiplayer ? this.multiplayer.roomId : 'null'}, multiplayerSessionId=${this.multiplayer ? this.multiplayer.sessionId : 'null'}, multiplayerRole=${this.multiplayer ? this.multiplayer.role : 'null'}, hasRuntime=${!!window.SurvivalOnlineRuntime}, hasRuntimeRuntime=${!!(window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.Runtime)}, hasTick=${!!(window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.Runtime && typeof window.SurvivalOnlineRuntime.Runtime.tick === 'function')}`);
                }
            }

            // ✅ 更新組隊HUD（每0.5秒更新一次，只在生存模式下執行，避免污染其他模式）
            // 確保只在生存模式下更新，其他模式（main/challenge/defense/stage/3d）不執行
            if (isSurvivalMode && this.multiplayer && this.multiplayer.sessionId) {
                this._multiplayerHUDUpdateTimer = (this._multiplayerHUDUpdateTimer || 0) + deltaTime;
                if (this._multiplayerHUDUpdateTimer >= 500) {
                    this._multiplayerHUDUpdateTimer = 0;
                    if (typeof this.updateMultiplayerHUD === 'function') {
                        this.updateMultiplayerHUD();
                    }
                }
            } else {
                // ✅ 非生存模式：清除組隊HUD更新計時器，避免污染
                this._multiplayerHUDUpdateTimer = 0;
            }
        } catch (_) { }
    },

    /** 私有：更新玩家（保留雙次更新的歷史節奏；請勿更改） */
    _updatePlayer: function (deltaTime) {
        if (this.player) {
            this.player.update(deltaTime);
        }
    },

    /** 私有：更新武器（保留雙次更新的歷史節奏；請勿更改） */
    _updateWeapons: function (deltaTime) {
        // 組隊模式：死亡時不更新武器
        if (this.player && this.player._isDead) {
            // 死亡時不更新本地玩家武器，但仍需更新遠程玩家武器（如果他們沒死）
            // 繼續執行遠程玩家武器更新邏輯
        } else if (this.player && this.player.weapons) {
            // ⚠️ 調試：檢查武器數量
            if (this.player.weapons.length === 0) {
                console.warn('[Game._updateWeapons] 玩家沒有武器！', {
                    hasPlayer: !!this.player,
                    weaponsLength: this.player.weapons ? this.player.weapons.length : 0,
                    isDead: this.player ? this.player._isDead : false
                });
            }
            for (const weapon of this.player.weapons) {
                weapon.update(deltaTime);
            }
        } else {
            // ⚠️ 調試：檢查為什麼沒有更新武器
            if (!this.player) {
                console.warn('[Game._updateWeapons] 玩家不存在！');
            } else if (!this.player.weapons) {
                console.warn('[Game._updateWeapons] 玩家武器數組不存在！', {
                    hasPlayer: !!this.player,
                    weaponsType: typeof this.player.weapons
                });
            }
        }
        // M4：更新遠程玩家的武器（所有端都需要更新，不只是隊長）
        try {
            // 確保只在生存模式下執行組隊邏輯
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null); // null 表示舊版流程，預設為生存模式
            } catch (_) { }

            // ✅ MMORPG 架構：遠程玩家的武器更新已經在 updateRemotePlayers 中處理
            // RemotePlayerManager.updateAll 會調用 player.update，而 player.update 會更新武器
            // 這裡不需要重複更新，避免衝突和性能浪費
        } catch (_) { }
    },

    // 繪製遊戲
    draw: function () {
        // 主線模式由其自身渲染迴圈管理（支援新舊管理器），避免互相覆蓋
        try {
            const activeId = (typeof GameModeManager !== 'undefined' && GameModeManager.getCurrent)
                ? GameModeManager.getCurrent()
                : ((typeof ModeManager !== 'undefined' && ModeManager.getActiveModeId) ? ModeManager.getActiveModeId() : null);
            if (activeId === 'main' || activeId === 'challenge' || activeId === 'defense') {
                return;
            }
        } catch (_) { }
        // 清空畫布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 應用鏡頭震動偏移
        let cameraOffsetX = this.camera.x;
        let cameraOffsetY = this.camera.y;

        if (this.cameraShake && this.cameraShake.active) {
            cameraOffsetX += this.cameraShake.offsetX;
            cameraOffsetY += this.cameraShake.offsetY;
        }

        // 平移座標系，將世界座標轉為畫面座標
        this.ctx.save();
        this.ctx.translate(-cameraOffsetX, -cameraOffsetY);

        // 繪製背景（平鋪）
        this.drawBackground();

        // 繪製所有實體（使用世界座標）
        this.drawEntities();

        // 可選：繪製彈幕（停用時無輸出）
        try {
            if (typeof BulletSystem !== 'undefined' && typeof BulletSystem.draw === 'function') {
                BulletSystem.draw(this.ctx);
            }
        } catch (e) {
            console.warn('BulletSystem.draw 失敗：', e);
        }

        // 邊界提示（可選）：在世界邊界畫微弱遮罩
        this.drawWorldBorders();

        // 還原座標系
        this.ctx.restore();

        // 繪製螢幕閃光效果（在最上層）
        if (this.screenFlash && this.screenFlash.active) {
            this.ctx.save();
            this.ctx.globalAlpha = this.screenFlash.intensity;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }
    },

    // 繪製所有實體
    drawEntities: function () {
        // 繪製地圖裝飾（非碰撞）
        if (this.decorations && this.decorations.length) {
            // 保存当前图像平滑设置
            const wasSmoothingEnabled = this.ctx.imageSmoothingEnabled;
            // 禁用图像平滑以获得更清晰的像素化效果（避免缩放模糊）
            try { this.ctx.imageSmoothingEnabled = false; } catch (_) { }

            for (const deco of this.decorations) {
                const img = (this.images || Game.images || {})[deco.imageKey];
                const drawX = deco.x - deco.width / 2;
                const drawY = deco.y - deco.height / 2;
                if (img && img.complete) {
                    // 获取图片的原始尺寸
                    const imgW = img.naturalWidth || img.width || deco.width;
                    const imgH = img.naturalHeight || img.height || deco.height;
                    // 调试：S15特殊处理，输出尺寸信息
                    if (deco.imageKey === 'S15') {
                        if (typeof window !== 'undefined' && window.SURVIVAL_ONLINE_DEBUG) {
                            console.log('[S15调试] 图片原始尺寸:', imgW, 'x', imgH, '配置尺寸:', deco.width, 'x', deco.height);
                        }
                    }
                    // 使用图片的完整原始尺寸作为源，缩放到配置的目标尺寸绘制
                    // 这样即使图片文件是原始尺寸，也会正确缩放到目标尺寸
                    this.ctx.drawImage(img, 0, 0, imgW, imgH, drawX, drawY, deco.width, deco.height);
                } else {
                    this.ctx.fillStyle = '#666';
                    this.ctx.fillRect(drawX, drawY, deco.width, deco.height);
                }
            }

            // 恢复图像平滑设置
            try { this.ctx.imageSmoothingEnabled = wasSmoothingEnabled; } catch (_) { }
        }

        // 繪製障礙物
        if (this.obstacles && this.obstacles.length) {
            for (const obs of this.obstacles) {
                obs.draw(this.ctx);
            }
        }

        // 繪製經驗寶石
        for (const orb of this.experienceOrbs) {
            orb.draw(this.ctx);
        }

        // 繪製寶箱
        for (const chest of this.chests) {
            chest.draw(this.ctx);
        }

        // 繪製鳳梨大絕掉落物（層級與寶箱一致）
        for (const p of this.pineappleUltimatePickups) {
            try { p.draw(this.ctx); } catch (_) { }
        }

        // 繪製出口（第20波BOSS死亡後）
        if (this.exit) {
            const exitImg = (this.images || Game.images || {})['exit'];
            const drawX = this.exit.x - this.exit.width / 2;
            const drawY = this.exit.y - this.exit.height / 2;
            if (exitImg && exitImg.complete) {
                this.ctx.drawImage(exitImg, drawX, drawY, this.exit.width, this.exit.height);
            } else {
                // 備用：繪製矩形
                this.ctx.fillStyle = '#00ff00';
                this.ctx.fillRect(drawX, drawY, this.exit.width, this.exit.height);
            }
        }

        // 繪製AI生命體（使用GifOverlay，在玩家圖層）
        if (this.player && this.player.aiCompanion) {
            try {
                this.player.aiCompanion.draw(this.ctx);
            } catch (e) {
                // ⚠️ 修复：如果 aiCompanion 已被清理，跳过绘制
                console.warn('[Game] drawEntities: aiCompanion.draw 失败:', e);
            }
        }

        // 繪製投射物（除連鎖閃電/狂熱雷擊/斬擊/裁決/神界裁決/路口車輛與幼妲光輝/幼妲天使聖光/死線戰士/死線超人，延後至敵人之上）
        for (const projectile of this.projectiles) {
            // ⚠️ 修复：添加 null 检查，防止在清理过程中尝试绘制已被清理的投射物
            if (!projectile || typeof projectile.draw !== 'function') {
                continue;
            }
            if (
                projectile.weaponType === 'CHAIN_LIGHTNING' ||
                projectile.weaponType === 'FRENZY_LIGHTNING' ||
                projectile.weaponType === 'SLASH' ||
                projectile.weaponType === 'YOUNG_DADA_GLORY' ||
                projectile.weaponType === 'FRENZY_YOUNG_DADA_GLORY' ||
                projectile.weaponType === 'DEATHLINE_WARRIOR' ||
                projectile.weaponType === 'DEATHLINE_SUPERMAN' ||
                projectile.weaponType === 'JUDGMENT' ||
                projectile.weaponType === 'DIVINE_JUDGMENT' ||
                projectile.weaponType === 'INTERSECTION_CAR'
            ) {
                // 延後到前景層（敵人之上）再繪製
                continue;
            }
            try {
                projectile.draw(this.ctx);
            } catch (e) {
                // ⚠️ 修复：如果投射物已被清理或 draw 方法失败，跳过绘制
                console.warn('[Game] drawEntities: projectile.draw 失败:', e);
            }
        }

        // （移至前景）BOSS 火彈投射物原本在敵人之前繪製，改為敵人之上

        // （移至前景）爆炸粒子原本在敵人之前繪製，改為敵人之上

        // 繪製敵人
        for (const enemy of this.enemies) {
            // ⚠️ 修复：添加 null 检查，防止在清理过程中尝试绘制已被清理的敌人
            if (enemy && typeof enemy.draw === 'function') {
                try {
                    enemy.draw(this.ctx);
                } catch (e) {
                    // ⚠️ 修复：如果敌人已被清理或 draw 方法失败，跳过绘制
                    console.warn('[Game] drawEntities: enemy.draw 失败:', e);
                }
            }
        }

        // 前景層：BOSS 火彈投射物（提高可見度，避免被怪物遮擋）
        if (this.bossProjectiles) {
            for (const bossProjectile of this.bossProjectiles) {
                // ⚠️ 修复：添加 null 检查，防止在清理过程中尝试绘制已被清理的 BOSS 投射物
                if (bossProjectile && typeof bossProjectile.draw === 'function') {
                    try {
                        bossProjectile.draw(this.ctx);
                    } catch (e) {
                        // ⚠️ 修复：如果 BOSS 投射物已被清理或 draw 方法失败，跳过绘制
                        console.warn('[Game] drawEntities: bossProjectile.draw 失败:', e);
                    }
                }
            }
        }

        // 前景層：爆炸粒子（例如追蹤綿羊命中效果）
        if (this.explosionParticles) {
            for (const particle of this.explosionParticles) {
                this.ctx.save();
                const baseAlpha = particle.life / particle.maxLife;
                const isLightning = particle && particle.source === 'LIGHTNING';
                const isBaguette = particle && particle.source === 'BAGUETTE_THROW';
                const isHeartTransmission = particle && particle.source === 'HEART_TRANSMISSION';
                // 追蹤綿羊/法棍投擲/心意傳遞命中粒子更不透明，且稍微放大
                const alpha = (isLightning || isBaguette || isHeartTransmission) ? Math.min(1, 0.5 + baseAlpha * 0.6) : baseAlpha;
                const drawSize = (isLightning || isBaguette || isHeartTransmission) ? particle.size * 1.3 : particle.size;
                this.ctx.globalAlpha = alpha;
                this.ctx.fillStyle = particle.color;
                this.ctx.beginPath();
                this.ctx.arc(particle.x, particle.y, drawSize, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            }
        }

        // 前景層：心意傳遞效果圖片（A36.png，310x290比例）
        if (this.heartTransmissionEffects) {
            for (let i = this.heartTransmissionEffects.length - 1; i >= 0; i--) {
                const effect = this.heartTransmissionEffects[i];
                effect.life -= 16.67; // 假設60fps，每幀約16.67ms
                if (effect.life <= 0) {
                    this.heartTransmissionEffects.splice(i, 1);
                    continue;
                }
                const alpha = effect.life / effect.maxLife;
                const img = (this.images || Game.images || {})['A36'];
                if (img && img.complete) {
                    this.ctx.save();
                    this.ctx.globalAlpha = alpha;
                    const drawX = effect.x - effect.width / 2;
                    const drawY = effect.y - effect.height / 2;
                    this.ctx.drawImage(img, drawX, drawY, effect.width, effect.height);
                    this.ctx.restore();
                }
            }
        }

        // 前景層：連鎖閃電/狂熱雷擊/斬擊效果（電弧與火花/GIF）以及幼妲光輝/幼妲天使聖光特效/死線戰士特效/死線超人特效/裁決/神界裁決特效/路口車輛
        for (const projectile of this.projectiles) {
            // ⚠️ 修复：添加 null 检查，防止在清理过程中尝试绘制已被清理的投射物
            if (!projectile || typeof projectile.draw !== 'function') {
                continue;
            }
            if (
                projectile.weaponType === 'CHAIN_LIGHTNING' ||
                projectile.weaponType === 'FRENZY_LIGHTNING' ||
                projectile.weaponType === 'SLASH' ||
                projectile.weaponType === 'YOUNG_DADA_GLORY' ||
                projectile.weaponType === 'FRENZY_YOUNG_DADA_GLORY' ||
                projectile.weaponType === 'DEATHLINE_WARRIOR' ||
                projectile.weaponType === 'DEATHLINE_SUPERMAN' ||
                projectile.weaponType === 'JUDGMENT' ||
                projectile.weaponType === 'DIVINE_JUDGMENT' ||
                projectile.weaponType === 'INTERSECTION_CAR'
            ) {
                try {
                    projectile.draw(this.ctx);
                } catch (e) {
                    // ⚠️ 修复：如果投射物已被清理或 draw 方法失败，跳过绘制
                    console.warn('[Game] drawEntities: foreground projectile.draw 失败:', e);
                }
            }
        }

        // 生存模式聯機（測試）：繪製其他玩家位置（僅視覺呈現，僅在生存模式下執行）
        try {
            // 確保只在生存模式下執行組隊邏輯
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null); // null 表示舊版流程，預設為生存模式
            } catch (_) { }

            if (isSurvivalMode) {
                // 繪製本地玩家血條（如果存在）
                if (this.player && typeof this.player._drawHealthBar === 'function') {
                    this.player._drawHealthBar(this.ctx);
                }

                // 使用 RemotePlayerManager 獲取完整的 Player 對象（包含所有屬性和方法）
                const remotePlayers = (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager && typeof window.SurvivalOnlineRuntime.RemotePlayerManager.getAllPlayers === 'function')
                    ? window.SurvivalOnlineRuntime.RemotePlayerManager.getAllPlayers()
                    : [];

                // 嘗試強制獲取（如果不為空但長度為0）
                if (remotePlayers.length === 0 && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.Runtime && window.SurvivalOnlineRuntime.Runtime.remotePlayers) {
                    // 二次檢查 Runtime 內部
                }

                for (const p of remotePlayers) {
                    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
                        console.warn(`[Game] drawEntities: 跳過無效遠程玩家`, p);
                        continue;
                    }

                    // 確保不是本地玩家（防止重複渲染）
                    if (p === this.player || (p._remoteUid && this.multiplayer && this.multiplayer.uid === p._remoteUid)) {
                        continue; // 跳過本地玩家
                    }

                    // 確保是遠程玩家標記
                    if (!p._isRemotePlayer || !p._remoteUid) {
                        console.warn(`[Game] drawEntities: 跳過非遠程玩家`, p);
                        continue;
                    }

                    // 繪製遠程玩家血條
                    this._drawRemotePlayerHealthBar(p);

                    // 使用 Player 對象的 draw 方法繪製角色（與本地玩家一致，包含武器和攻擊效果）
                    if (typeof p.draw === 'function') {
                        // 檢查角色圖片是否已加載
                        const spriteKey = p.spriteImageKey || 'player';
                        if (!Game.images || !Game.images[spriteKey]) {
                            console.warn(`[Game] drawEntities: 遠程玩家 ${p._remoteUid} 的角色圖片未加載: ${spriteKey}`);
                        }
                        p.draw(this.ctx);
                    } else {
                        console.warn(`[Game] drawEntities: 遠程玩家 ${p._remoteUid} 沒有 draw 方法`);
                    }

                    // 繪製遠程玩家名稱（在角色上方）
                    const remoteUid = (p._remoteUid) ? p._remoteUid : 'unknown';
                    // ✅ 修復：優先從遠程玩家對象獲取名字，其次從 _membersState 獲取
                    let playerName = '玩家';
                    if (p._remotePlayerName && typeof p._remotePlayerName === 'string' && p._remotePlayerName.trim()) {
                        playerName = p._remotePlayerName;
                    } else {
                        const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                        if (rt && typeof rt.getMembersState === 'function') {
                            const members = rt.getMembersState();
                            if (members && typeof members.get === 'function') {
                                const member = members.get(remoteUid);
                                if (member && typeof member.name === 'string' && member.name.trim()) {
                                    playerName = member.name;
                                } else {
                                    // 後備：使用 UID 前6位
                                    playerName = remoteUid.slice(0, 6);
                                }
                            } else {
                                // 後備：使用 UID 前6位
                                playerName = remoteUid.slice(0, 6);
                            }
                        } else {
                            // 後備：使用 UID 前6位
                            playerName = remoteUid.slice(0, 6);
                        }
                    }
                    this.ctx.save();
                    this.ctx.globalAlpha = 0.95;
                    this.ctx.font = '12px sans-serif';
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'bottom';
                    this.ctx.fillStyle = 'rgba(255,255,255,0.95)';
                    const baseSize = CONFIG && CONFIG.PLAYER && CONFIG.PLAYER.SIZE ? CONFIG.PLAYER.SIZE : 32;
                    const visualScale = (CONFIG && CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') ? CONFIG.PLAYER.VISUAL_SCALE : 1.0;
                    const nameY = p.y - (baseSize * visualScale / 2) - 8;
                    this.ctx.fillText(playerName, p.x, nameY);
                    this.ctx.restore();
                }
            }
        } catch (_) { }

        // 繪製玩家
        // ⚠️ 修复：添加 null 检查，防止在视频播放期间（玩家已被清理）尝试绘制
        if (this.player && typeof this.player.draw === 'function') {
            try {
                this.player.draw(this.ctx);
            } catch (e) {
                // ⚠️ 修复：如果玩家已被清理或 draw 方法失败，跳过绘制
                console.warn('[Game] drawEntities: player.draw 失败:', e);
            }
        }

        // ✅ 繪製本地玩家名稱（在角色上方，僅在組隊模式下顯示）
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

            if (isSurvivalMode && this.multiplayer && this.player) {
                const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                let playerName = '玩家';
                if (rt && typeof rt.getPlayerNickname === 'function') {
                    const nickname = rt.getPlayerNickname();
                    if (nickname && typeof nickname === 'string') {
                        playerName = nickname;
                    }
                }
                this.ctx.save();
                this.ctx.globalAlpha = 0.95;
                this.ctx.font = '12px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'bottom';
                this.ctx.fillStyle = 'rgba(255,255,255,0.95)';
                const baseSize = CONFIG && CONFIG.PLAYER && CONFIG.PLAYER.SIZE ? CONFIG.PLAYER.SIZE : 32;
                const visualScale = (CONFIG && CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') ? CONFIG.PLAYER.VISUAL_SCALE : 1.0;
                const nameY = this.player.y - (baseSize * visualScale / 2) - 8;
                this.ctx.fillText(playerName, this.player.x, nameY);
                this.ctx.restore();
            }
        } catch (_) { }
    },

    // 繪製背景
    drawBackground: function () {
        // 根據選定地圖的背景鍵選擇對應圖片
        const bgKey = (this.backgroundKey) || (this.selectedMap && this.selectedMap.backgroundKey) || 'background';
        const imgObj = (this.images || Game.images || {})[bgKey];
        if (imgObj && imgObj.complete) {
            // 第4張地圖（花園）與第5張地圖（路口）：直接使用3840x2160圖片，不使用九宮格
            if (this.selectedMap && (this.selectedMap.id === 'garden' || this.selectedMap.id === 'intersection')) {
                // 直接在世界座標(0,0)繪製完整圖片（座標系已平移）
                this.ctx.drawImage(imgObj, 0, 0);
            } else {
                // 其他地圖：平鋪背景圖片，覆蓋目前可視區域（已平移座標）
                const pattern = this.ctx.createPattern(imgObj, 'repeat');
                this.ctx.fillStyle = pattern || '#111';
                // 與既有設計保持一致：使用世界座標 camera.x/camera.y（座標系已平移）
                this.ctx.fillRect(this.camera.x, this.camera.y, this.canvas.width, this.canvas.height);
            }
        } else {
            // 備用：使用純色背景
            this.ctx.fillStyle = '#111';
            this.ctx.fillRect(this.camera.x, this.camera.y, this.canvas.width, this.canvas.height);
            // 可選：繪製網格以輔助定位
            this.drawGrid();
        }
    },

    // 繪製網格
    drawGrid: function () {
        this.ctx.strokeStyle = '#222';
        this.ctx.lineWidth = 1;
        const gridSize = 50;
        // 在可視區域繪製網格（已平移座標）
        for (let x = this.camera.x - (this.camera.x % gridSize); x <= this.camera.x + this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.camera.y);
            this.ctx.lineTo(x, this.camera.y + this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = this.camera.y - (this.camera.y % gridSize); y <= this.camera.y + this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.camera.x, y);
            this.ctx.lineTo(this.camera.x + this.canvas.width, y);
            this.ctx.stroke();
        }
    },

    // 世界邊界提示（不循環）：在靠近邊界時畫暗角
    drawWorldBorders: function () {
        const borderColor = CONFIG.WORLD?.BORDER_COLOR || '#000';
        const alpha = CONFIG.WORLD?.BORDER_ALPHA || 0.8;
        this.ctx.save();
        this.ctx.globalAlpha = 0.0;
        // 如需明顯邊界提示，可將 globalAlpha 改成 alpha 並繪製遮罩。
        // 預設不顯示，僅保留接口。
        this.ctx.restore();
    },

    // 添加敵人
    addEnemy: function (enemy) {
        // 確保敵人有唯一ID（用於組隊模式同步）
        if (!enemy.id) {
            enemy.id = `enemy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        }
        this.enemies.push(enemy);

        // M2：廣播敵人生成事件（僅生存模式組隊模式且為室長）
        try {
            // 確保只在生存模式下執行組隊邏輯
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null); // null 表示舊版流程，預設為生存模式
            } catch (_) { }

            // MMO 架構：敵人使用確定性生成，不需要廣播
            // ✅ 每個客戶端自己生成敵人（使用相同的隨機種子）
            // ⚠️ 舊架構殘留：敵人廣播已移除，改為確定性生成（待實現）
            // 注意：BOSS 和普通敵人都由確定性生成處理，不需要廣播
        } catch (_) { }
    },

    // 添加投射物
    addProjectile: function (projectile) {
        // ✅ 權威伺服器模式：多人進行中時
        // - 標準投射物：不在客戶端生成（避免與伺服器下發重複），但要「送 attack input 給伺服器」
        // - 持續效果/光束等：保留本地視覺（但傷害仍以伺服器權威為準）
        try {
            // ⚠️ 調試：確認 addProjectile 被調用
            if (!projectile) {
                console.warn('[Game.addProjectile] 投射物為 null 或 undefined');
                return;
            }
            
            // ✅ 防污染：只在生存模式下發送攻擊輸入
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null);
            } catch (_) { }
            
            // ⚠️ 調試：檢查模式狀態
            if (isSurvivalMode && this.multiplayer && this.multiplayer.enabled) {
                console.log('[Game.addProjectile] 組隊模式，處理投射物', {
                    weaponType: projectile.weaponType,
                    hasPlayer: !!projectile.player,
                    playerIsThisPlayer: projectile.player === this.player,
                    constructorName: projectile.constructor?.name
                });
            }
            
            if (isSurvivalMode && this.multiplayer && this.multiplayer.enabled) {
                const isLocalPlayerProjectile = (projectile && projectile.player && projectile.player === this.player);
                
                // ⚠️ 修復：在 enabled 模式下，只有本地玩家的投射物才需要處理
                // 遠程玩家的投射物應該由伺服器同步，不應該在這裡處理
                if (!isLocalPlayerProjectile) {
                    // 遠程玩家的投射物由伺服器同步，這裡不處理
                    return;
                }
                
                // ⚠️ 修復：檢查 sendToNet 是否可用
                if (typeof window === 'undefined' || !window.SurvivalOnlineRuntime || typeof window.SurvivalOnlineRuntime.sendToNet !== 'function') {
                    console.warn('[Game.addProjectile] SurvivalOnlineRuntime.sendToNet 不可用，無法發送攻擊', {
                        hasWindow: typeof window !== 'undefined',
                        hasRuntime: typeof window !== 'undefined' && !!window.SurvivalOnlineRuntime,
                        hasSendToNet: typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function'
                    });
                    // 如果 sendToNet 不可用，仍然將投射物添加到本地（降級處理）
                    this.projectiles.push(projectile);
                    return;
                }

                const isPersistentEffect = (
                    projectile.weaponType === 'AURA_FIELD' ||
                    projectile.weaponType === 'GRAVITY_WAVE' ||
                    projectile.weaponType === 'ORBIT' ||
                    projectile.weaponType === 'CHICKEN_BLESSING' ||
                    projectile.weaponType === 'ROTATING_MUFFIN' ||
                    projectile.weaponType === 'HEART_COMPANION' ||
                    projectile.weaponType === 'PINEAPPLE_ORBIT' ||
                    projectile.weaponType === 'LASER' ||
                    projectile.weaponType === 'RADIANT_GLORY' ||
                    projectile.weaponType === 'BIG_ICE_BALL' ||
                    projectile.weaponType === 'FRENZY_ICE_BALL' ||
                    projectile.weaponType === 'MIND_MAGIC' ||
                    // ✅ 修復：CHAIN_LIGHTNING、FRENZY_LIGHTNING、SLASH、INVINCIBLE 是特殊視覺效果，不應發送到伺服器作為標準投射物
                    projectile.weaponType === 'CHAIN_LIGHTNING' ||
                    projectile.weaponType === 'FRENZY_LIGHTNING' ||
                    projectile.weaponType === 'SLASH' ||
                    projectile.weaponType === 'FRENZY_SLASH' ||
                    projectile.weaponType === 'INVINCIBLE' ||
                    // ✅ 修復：YOUNG_DADA_GLORY、FRENZY_YOUNG_DADA_GLORY、DEATHLINE_WARRIOR、DEATHLINE_SUPERMAN、JUDGMENT、DIVINE_JUDGMENT、EXPLOSION 是特殊視覺效果
                    projectile.weaponType === 'YOUNG_DADA_GLORY' ||
                    projectile.weaponType === 'FRENZY_YOUNG_DADA_GLORY' ||
                    projectile.weaponType === 'DEATHLINE_WARRIOR' ||
                    projectile.weaponType === 'DEATHLINE_SUPERMAN' ||
                    projectile.weaponType === 'JUDGMENT' ||
                    projectile.weaponType === 'DIVINE_JUDGMENT' ||
                    projectile.weaponType === 'EXPLOSION' ||
                    (projectile.constructor && (
                        projectile.constructor.name === 'AuraField' ||
                        projectile.constructor.name === 'GravityWaveField' ||
                        projectile.constructor.name === 'OrbitBall' ||
                        projectile.constructor.name === 'LaserBeam' ||
                        projectile.constructor.name === 'RadiantGloryEffect' ||
                        projectile.constructor.name === 'IceFieldEffect' ||
                        projectile.constructor.name === 'ShockwaveEffect' ||
                        // ✅ 修復：ChainLightningEffect、FrenzyLightningEffect、SlashEffect、InvincibleEffect 是特殊視覺效果
                        projectile.constructor.name === 'ChainLightningEffect' ||
                        projectile.constructor.name === 'FrenzyLightningEffect' ||
                        projectile.constructor.name === 'SlashEffect' ||
                        projectile.constructor.name === 'InvincibleEffect' ||
                        // ✅ 修復：YoungDadaGloryEffect、FrenzyYoungDadaGloryEffect、DeathlineWarriorEffect、JudgmentEffect、DivineJudgmentEffect、ExplosionEffect 是特殊視覺效果
                        projectile.constructor.name === 'YoungDadaGloryEffect' ||
                        projectile.constructor.name === 'FrenzyYoungDadaGloryEffect' ||
                        projectile.constructor.name === 'DeathlineWarriorEffect' ||
                        projectile.constructor.name === 'JudgmentEffect' ||
                        projectile.constructor.name === 'DivineJudgmentEffect' ||
                        projectile.constructor.name === 'ExplosionEffect'
                    )) ||
                    (typeof projectile.tickDamage !== 'undefined' && typeof projectile.tickIntervalMs !== 'undefined')
                );

                // 標準投射物：送給伺服器生成/碰撞/扣血
                if (!isPersistentEffect) {
                    const attackInput = {
                        type: 'attack',
                        weaponType: projectile.weaponType || 'UNKNOWN',
                        x: projectile.x || this.player.x,
                        y: projectile.y || this.player.y,
                        angle: projectile.angle || 0,
                        damage: projectile.damage || 10,
                        speed: projectile.speed || 5,
                        size: projectile.size || 20,
                        homing: projectile.homing || false,
                        turnRatePerSec: projectile.turnRatePerSec || 0,
                        assignedTargetId: projectile.assignedTargetId || null,
                        maxDistance: projectile.maxDistance || 1000,
                        // ✅ 與單機同源：把玩家爆擊加成帶到伺服器，伺服器才能算出「真的有爆擊/傷害浮動」
                        allowCrit: true,
                        critChanceBonusPct: (this.player && typeof this.player.critChanceBonusPct === 'number') ? this.player.critChanceBonusPct : 0,
                        timestamp: Date.now()
                    };
                    try { 
                        window.SurvivalOnlineRuntime.sendToNet(attackInput);
                        // ⚠️ 關鍵調試：確認攻擊已發送
                        console.log('[Game.addProjectile] ✅ 已發送攻擊輸入到伺服器', {
                            weaponType: attackInput.weaponType,
                            x: attackInput.x,
                            y: attackInput.y,
                            damage: attackInput.damage
                        });
                    } catch (e) { 
                        console.error('[Game.addProjectile] ❌ 發送攻擊輸入失敗', e);
                    }
                    return; // 不本地生成標準投射物
                }

                // 持續效果/其他：保留本地視覺，並廣播給其他玩家（讓遠程玩家也能看到）
                this.projectiles.push(projectile);
                
                // ⚠️ 修復：持續效果也需要廣播給其他玩家，確保視覺效果與單機一致
                // 特別是 CHAIN_LIGHTNING、FRENZY_LIGHTNING、SLASH 等需要讓遠程玩家看到
                try {
                    if (isSurvivalMode && this.multiplayer && this.multiplayer.enabled && 
                        typeof window !== 'undefined' && window.SurvivalOnlineBroadcastEvent &&
                        projectile.player === this.player) {
                        // 構建投射物數據（與舊多人模式一致）
                        const projectileId = projectile.id || `projectile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                        if (!projectile.id) projectile.id = projectileId;
                        
                        const playerUid = (this.multiplayer && this.multiplayer.uid) ? this.multiplayer.uid : null;
                        const projectileData = {
                            id: projectileId,
                            x: projectile.x || 0,
                            y: projectile.y || 0,
                            angle: projectile.angle || 0,
                            weaponType: projectile.weaponType || "UNKNOWN",
                            playerUid: playerUid,
                            damage: projectile.damage || 0
                        };
                        
                        // 根據武器類型添加額外屬性（與舊多人模式一致）
                        if (projectile.radius !== undefined) {
                            projectileData.radius = projectile.radius;
                            projectileData.angularSpeed = projectile.angularSpeed || 0;
                            projectileData.duration = projectile.duration || 3000;
                            projectileData.size = projectile.size || 20;
                        }
                        
                        if (projectile.width !== undefined && projectile.weaponType === "LASER") {
                            projectileData.width = projectile.width;
                            // ⚠️ 修復：使用實際的 duration（從 CONFIG.DURATION 傳遞），確保與單機一致
                            // 單機模式：使用 this.config.DURATION（預設 2000ms）
                            projectileData.duration = projectile.duration || 2000;
                            // ⚠️ 修復：使用實際的 tickInterval（從 CONFIG.TICK_INTERVAL_MS 傳遞），確保與單機一致
                            // 單機模式：使用 this.config.TICK_INTERVAL_MS || 120
                            projectileData.tickInterval = projectile.tickIntervalMs || 120;
                        }
                        
                        if (projectile.maxRadius !== undefined && projectile.weaponType === "MIND_MAGIC") {
                            projectileData.maxRadius = projectile.maxRadius;
                            projectileData.ringWidth = projectile.ringWidth || 18;
                            projectileData.duration = projectile.durationMs || 1000;
                            projectileData.palette = projectile.palette || null;
                        }
                        
                        if (projectile.weaponType === "CHAIN_LIGHTNING") {
                            // ✅ 修復：使用與單機一致的默認值（CONFIG.CHAIN_LIGHTNING）
                            projectileData.damage = projectile.damage || 0;
                            projectileData.duration = projectile.durationMs || 1000; // ✅ 與單機一致：使用 CONFIG.CHAIN_LIGHTNING.DURATION（1000ms）
                            projectileData.maxChains = projectile.maxChains || 0;
                            projectileData.chainRadius = projectile.chainRadius || 220; // ✅ 與單機一致：使用 CONFIG.CHAIN_LIGHTNING.CHAIN_RADIUS（220）
                            projectileData.palette = projectile.palette || null;
                        } else if (projectile.weaponType === "FRENZY_LIGHTNING") {
                            // ✅ 修復：使用與單機一致的默認值（CONFIG.FRENZY_LIGHTNING）
                            projectileData.damage = projectile.damage || 0;
                            projectileData.duration = projectile.durationMs || 1000; // ✅ 與單機一致：使用 CONFIG.FRENZY_LIGHTNING.DURATION（1000ms）
                            projectileData.maxChains = projectile.maxChains || 0;
                            projectileData.chainRadius = projectile.chainRadius || 300; // ✅ 與單機一致：使用 CONFIG.FRENZY_LIGHTNING.CHAIN_RADIUS（300）
                            projectileData.palette = projectile.palette || null;
                            projectileData.branchCount = projectile.branchCount || 10;
                            projectileData.chainsPerBranch = projectile.chainsPerBranch || 10;
                        }
                        
                        if (projectile.weaponType === "SLASH") {
                            // ✅ 修復：使用與單機一致的默認值（CONFIG.SLASH）
                            projectileData.damage = projectile.damage || 0;
                            projectileData.angle = projectile.angle || 0;
                            projectileData.radius = projectile.radius || 252; // ✅ 與單機一致：使用 CONFIG.SLASH.RADIUS_BASE（252）
                            projectileData.arcDeg = (projectile.arcRad ? projectile.arcRad * 180 / Math.PI : (projectile.arcDeg || 365)); // ✅ 與單機一致：使用 CONFIG.SLASH.ARC_DEG_BASE（365）
                            projectileData.duration = projectile.durationMs || (projectile.duration || 1200); // ✅ 與單機一致：使用 CONFIG.SLASH.DURATION（1200ms）
                            projectileData.visualScale = projectile.visualScale || 1.8; // ✅ 與單機一致：使用 CONFIG.SLASH.VISUAL_SCALE（1.8）
                        } else if (projectile.weaponType === "FRENZY_SLASH") {
                            // ✅ 修復：使用與單機一致的默認值（CONFIG.FRENZY_SLASH）
                            projectileData.damage = projectile.damage || 0;
                            projectileData.angle = projectile.angle || 0;
                            projectileData.radius = projectile.radius || 280; // ✅ 與單機一致：使用 CONFIG.FRENZY_SLASH.RADIUS_BASE（280）
                            projectileData.arcDeg = (projectile.arcRad ? projectile.arcRad * 180 / Math.PI : (projectile.arcDeg || 365)); // ✅ 與單機一致：使用 CONFIG.FRENZY_SLASH.ARC_DEG_BASE（365）
                            projectileData.duration = projectile.durationMs || (projectile.duration || 1200); // ✅ 與單機一致：使用 CONFIG.FRENZY_SLASH.DURATION（1200ms）
                            projectileData.visualScale = projectile.visualScale || 2.0; // ✅ 與單機一致：使用 CONFIG.FRENZY_SLASH.VISUAL_SCALE（2.0）
                        }
                        
                        if (projectile.weaponType === "AURA_FIELD") {
                            projectileData.damage = projectile.tickDamage || projectile.damage || 0;
                            projectileData.radius = projectile.radius || 150;
                            projectileData.visualScale = projectile.visualScale || 1.95;
                            // ⚠️ 注意：AURA_FIELD 是常駐場域，沒有 duration（永久存在直到武器被移除）
                            // 但為了與單機一致，我們只在首次創建時廣播，之後的更新不廣播（避免重複創建）
                            // 這裡的廣播邏輯由去重機制處理（在 survival_online.js 中檢查是否已存在）
                        }
                        
                        if (projectile.weaponType === "GRAVITY_WAVE") {
                            projectileData.damage = projectile.tickDamage || projectile.damage || 0;
                            projectileData.radius = projectile.radius || 150;
                            projectileData.pushMultiplier = projectile.pushMultiplier || 0;
                            projectileData.visualScale = projectile.visualScale || 1.95;
                            // ⚠️ 注意：GRAVITY_WAVE 是常駐場域，沒有 duration（永久存在直到武器被移除）
                            // 但為了與單機一致，我們只在首次創建時廣播，之後的更新不廣播（避免重複創建）
                            // 這裡的廣播邏輯由去重機制處理（在 survival_online.js 中檢查是否已存在）
                        }
                        
                        if (projectile.weaponType === "RADIANT_GLORY") {
                            projectileData.damage = projectile.tickDamage || projectile.damage || 0;
                            projectileData.width = projectile.width || 8; // ✅ 與單機一致：使用 CONFIG.RADIANT_GLORY.BEAM_WIDTH_BASE（8）
                            projectileData.duration = projectile.duration || 2000; // ✅ 與單機一致：使用 CONFIG.RADIANT_GLORY.DURATION（2000ms）
                            projectileData.tickInterval = projectile.tickIntervalMs || 120; // ✅ 與單機一致：使用 CONFIG.RADIANT_GLORY.TICK_INTERVAL_MS（120ms）
                            projectileData.beamCount = projectile.beamCount || 10;
                            projectileData.rotationSpeed = projectile.rotationSpeed || 1.0; // ✅ 與單機一致：使用 CONFIG.RADIANT_GLORY.ROTATION_SPEED（1.0）
                        }
                        
                        // 廣播投射物生成事件（讓遠程玩家也能看到）
                        window.SurvivalOnlineBroadcastEvent("projectile_spawn", projectileData);
                    }
                } catch (e) {
                    console.warn('[Game.addProjectile] 廣播持續效果失敗:', e);
                }
                
                return;
            }
        } catch (_) { }

        // 單機 / 舊多人（非 enabled）維持原行為
        this.projectiles.push(projectile);

        // 組隊模式：隊長端廣播投射物給隊員端（僅視覺，不影響傷害計算）
        try {
            // 確保只在生存模式下執行組隊邏輯
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null);
            } catch (_) { }

            // ⚠️ 修復：第二處邏輯應該只在非 enabled 模式下執行（舊多人模式）
            // 在 enabled 模式下，第一處邏輯已經處理完畢並 return，不會執行到這裡
            // 這裡保留是為了向後兼容舊的多人模式（非 enabled）
            if (isSurvivalMode && this.multiplayer && !this.multiplayer.enabled) {
                // ✅ MMO 架構：每個玩家都廣播自己的投射物（攻擊、技能等）
                // 判斷投射物來源：
                // 1. 本地玩家的投射物：projectile.player === this.player
                // 2. 遠程玩家的投射物：projectile.player && projectile.player._isRemotePlayer（不廣播，由遠程玩家自己廣播）
                // 3. 環境物體（如 INTERSECTION_CAR）：需要廣播（但應由生成者廣播，這裡只處理本地生成的）
                // 4. 其他情況（如環境效果）：不廣播或根據需要廣播
                const isLocalPlayerProjectile = (projectile.player && projectile.player === this.player);
                const isRemotePlayerProjectile = (projectile.player && projectile.player._isRemotePlayer);

                // MMO 架構：只廣播本地玩家的投射物，不廣播遠程玩家的投射物（由遠程玩家自己廣播）
                if (isRemotePlayerProjectile) {
                    // 遠程玩家的投射物由遠程玩家自己廣播，這裡不處理
                    return;
                }

                // 檢查是否為 AICompanion（召喚AI）
                const isAICompanion = (projectile.constructor && projectile.constructor.name === 'AICompanion') ||
                    (typeof AICompanion !== 'undefined' && projectile instanceof AICompanion);

                // 檢查是否為環境物體（如路口車輛）
                const isEnvironmentHazard = (projectile.weaponType === "INTERSECTION_CAR") ||
                    (projectile.constructor && projectile.constructor.name === 'CarHazard');

                // ✅ 舊多人模式：廣播投射物給其他玩家（僅視覺，不影響傷害計算）
                // ⚠️ 注意：在 enabled 模式下，這個邏輯不應該執行（由第一處邏輯處理）
                if (isLocalPlayerProjectile && typeof window !== 'undefined' && window.SurvivalOnlineBroadcastEvent) {
                    // 檢查是否是持續效果類（這些效果需要每個客戶端獨立計算傷害）
                    // 持續傷害類技能列表（每個玩家的傷害獨立計算並疊加）：
                    // - 守護領域、引力波、環繞球類（綿羊護體、雞腿庇佑、旋轉鬆餅、心意相隨、鳳梨環繞）
                    // - 激光、光芒萬丈、大波球、狂熱大波、心靈震波
                    const isPersistentEffect = (
                        // 武器類型檢查
                        projectile.weaponType === 'AURA_FIELD' ||
                        projectile.weaponType === 'GRAVITY_WAVE' ||
                        projectile.weaponType === 'ORBIT' ||
                        projectile.weaponType === 'CHICKEN_BLESSING' ||
                        projectile.weaponType === 'ROTATING_MUFFIN' ||
                        projectile.weaponType === 'HEART_COMPANION' ||
                        projectile.weaponType === 'PINEAPPLE_ORBIT' ||
                        projectile.weaponType === 'LASER' ||
                        projectile.weaponType === 'RADIANT_GLORY' ||
                        projectile.weaponType === 'BIG_ICE_BALL' ||
                        projectile.weaponType === 'FRENZY_ICE_BALL' ||
                        projectile.weaponType === 'MIND_MAGIC' ||
                        // ✅ 修復：CHAIN_LIGHTNING、FRENZY_LIGHTNING、SLASH 是特殊視覺效果，不應發送到伺服器作為標準投射物
                        projectile.weaponType === 'CHAIN_LIGHTNING' ||
                        projectile.weaponType === 'FRENZY_LIGHTNING' ||
                        projectile.weaponType === 'SLASH' ||
                        projectile.weaponType === 'FRENZY_SLASH' ||
                        // ✅ 修復：YOUNG_DADA_GLORY、FRENZY_YOUNG_DADA_GLORY、DEATHLINE_WARRIOR、DEATHLINE_SUPERMAN、JUDGMENT、DIVINE_JUDGMENT、EXPLOSION 是特殊視覺效果
                        projectile.weaponType === 'YOUNG_DADA_GLORY' ||
                        projectile.weaponType === 'FRENZY_YOUNG_DADA_GLORY' ||
                        projectile.weaponType === 'DEATHLINE_WARRIOR' ||
                        projectile.weaponType === 'DEATHLINE_SUPERMAN' ||
                        projectile.weaponType === 'JUDGMENT' ||
                        projectile.weaponType === 'DIVINE_JUDGMENT' ||
                        projectile.weaponType === 'EXPLOSION' ||
                        // 構造函數名稱檢查（更可靠）
                        (projectile.constructor && (
                            projectile.constructor.name === 'AuraField' ||
                            projectile.constructor.name === 'GravityWaveField' ||
                            projectile.constructor.name === 'OrbitBall' ||
                            projectile.constructor.name === 'LaserBeam' ||
                            projectile.constructor.name === 'RadiantGloryEffect' ||
                            projectile.constructor.name === 'IceFieldEffect' ||
                            projectile.constructor.name === 'ShockwaveEffect' ||
                            // ✅ 修復：ChainLightningEffect、FrenzyLightningEffect、SlashEffect 是特殊視覺效果
                            projectile.constructor.name === 'ChainLightningEffect' ||
                            projectile.constructor.name === 'FrenzyLightningEffect' ||
                            projectile.constructor.name === 'SlashEffect' ||
                            // ✅ 修復：YoungDadaGloryEffect、FrenzyYoungDadaGloryEffect、DeathlineWarriorEffect、JudgmentEffect、DivineJudgmentEffect、ExplosionEffect 是特殊視覺效果
                            projectile.constructor.name === 'YoungDadaGloryEffect' ||
                            projectile.constructor.name === 'FrenzyYoungDadaGloryEffect' ||
                            projectile.constructor.name === 'DeathlineWarriorEffect' ||
                            projectile.constructor.name === 'JudgmentEffect' ||
                            projectile.constructor.name === 'DivineJudgmentEffect' ||
                            projectile.constructor.name === 'ExplosionEffect'
                        )) ||
                        // 檢查是否有持續傷害屬性（tickDamage、tickIntervalMs）
                        (typeof projectile.tickDamage !== 'undefined' && typeof projectile.tickIntervalMs !== 'undefined')
                    );

                    // 持續效果類和標準投射物都需要廣播（舊多人模式）
                    // 但標準投射物在 enabled 模式下已經由第一處邏輯處理
                }

                if (isLocalPlayerProjectile || isRemotePlayerProjectile || isAICompanion || isEnvironmentHazard) {
                    // 為投射物分配唯一ID（如果還沒有）
                    if (!projectile.id) {
                        projectile.id = `projectile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                    }

                    // 確定玩家UID
                    let playerUid = null;
                    if (isLocalPlayerProjectile || (isAICompanion && projectile.player === this.player)) {
                        playerUid = (this.multiplayer && this.multiplayer.uid) ? this.multiplayer.uid : null;
                    } else if (isRemotePlayerProjectile && projectile.player._remoteUid) {
                        playerUid = projectile.player._remoteUid;
                    } else if (isAICompanion && projectile.player && projectile.player._isRemotePlayer && projectile.player._remoteUid) {
                        playerUid = projectile.player._remoteUid;
                    } else if (isAICompanion && projectile._remotePlayerUid) {
                        // ✅ MMORPG架构：AICompanion有_remotePlayerUid属性（远程玩家的AI）
                        playerUid = projectile._remotePlayerUid;
                    } else if (projectile._remotePlayerUid) {
                        // ✅ MMORPG架构：技能效果有_remotePlayerUid属性（远程玩家的AI创建的技能）
                        playerUid = projectile._remotePlayerUid;
                    }

                    // 構建投射物數據
                    const projectileData = {
                        id: projectile.id,
                        x: projectile.x || 0,
                        y: projectile.y || 0,
                        angle: projectile.angle || 0,
                        weaponType: isAICompanion ? "SUMMON_AI" : (projectile.weaponType || "UNKNOWN"),
                        speed: projectile.speed || 0,
                        size: projectile.size || 0,
                        homing: projectile.homing || false,
                        turnRatePerSec: projectile.turnRatePerSec || 0,
                        playerUid: playerUid,
                        assignedTargetId: projectile.assignedTargetId || null,
                        // ✅ MMORPG架构：传递伤害值，让远程玩家也能计算伤害
                        damage: projectile.damage || 0
                    };

                    // 如果是 AICompanion，添加額外屬性
                    if (isAICompanion) {
                        projectileData.summonAILevel = (typeof projectile.summonAILevel === "number") ? projectile.summonAILevel : 1;
                        projectileData.width = projectile.width || CONFIG.PLAYER.SIZE;
                        projectileData.height = projectile.height || CONFIG.PLAYER.SIZE;
                    }

                    // 如果是環繞投射物（OrbitBall），添加額外屬性
                    if (projectile.radius !== undefined) {
                        projectileData.radius = projectile.radius;
                        projectileData.angularSpeed = projectile.angularSpeed || 0;
                        projectileData.duration = projectile.duration || 3000;
                    }

                    // 如果是雷射（LaserBeam），添加額外屬性
                    if (projectile.width !== undefined && projectile.weaponType === "LASER") {
                        // ✅ 修復：使用與單機一致的默認值（CONFIG.LASER）
                        projectileData.width = projectile.width || 8; // ✅ 與單機一致：使用 CONFIG.LASER.BEAM_WIDTH_BASE（8）
                        projectileData.duration = projectile.duration || 2000; // ✅ 與單機一致：使用 CONFIG.LASER.DURATION（2000ms）
                        projectileData.tickInterval = projectile.tickIntervalMs || 120; // ✅ 與單機一致：使用 CONFIG.LASER.TICK_INTERVAL_MS（120ms）
                    }

                    // 如果是震波（ShockwaveEffect），添加額外屬性
                    if (projectile.maxRadius !== undefined && projectile.weaponType === "MIND_MAGIC") {
                        // ✅ 修復：使用與單機一致的默認值（CONFIG.MIND_MAGIC）
                        projectileData.maxRadius = projectile.maxRadius || 220; // ✅ 與單機一致：使用 CONFIG.MIND_MAGIC.WAVE_MAX_RADIUS_BASE（220）
                        projectileData.ringWidth = projectile.ringWidth || 18; // ✅ 與單機一致：使用 CONFIG.MIND_MAGIC.WAVE_THICKNESS（18）
                        projectileData.duration = projectile.durationMs || 2000; // ✅ 與單機一致：使用 CONFIG.MIND_MAGIC.DURATION（2000ms）
                        projectileData.palette = projectile.palette || null;
                    }

                    // 如果是連鎖閃電（ChainLightningEffect），添加額外屬性
                    if (projectile.weaponType === "CHAIN_LIGHTNING") {
                        // ✅ 修復：使用與單機一致的默認值（CONFIG.CHAIN_LIGHTNING）
                        projectileData.damage = projectile.damage || 0; // ✅ 传递伤害值
                        projectileData.duration = projectile.durationMs || 1000; // ✅ 與單機一致：使用 CONFIG.CHAIN_LIGHTNING.DURATION（1000ms）
                        projectileData.maxChains = projectile.maxChains || 0;
                        projectileData.chainRadius = projectile.chainRadius || 220; // ✅ 與單機一致：使用 CONFIG.CHAIN_LIGHTNING.CHAIN_RADIUS（220）
                        projectileData.palette = projectile.palette || null;
                    } else if (projectile.weaponType === "FRENZY_LIGHTNING") {
                        // ✅ 修復：使用與單機一致的默認值（CONFIG.FRENZY_LIGHTNING）
                        projectileData.damage = projectile.damage || 0; // ✅ 传递伤害值
                        projectileData.duration = projectile.durationMs || 1000; // ✅ 與單機一致：使用 CONFIG.FRENZY_LIGHTNING.DURATION（1000ms）
                        projectileData.maxChains = projectile.maxChains || 0;
                        projectileData.chainRadius = projectile.chainRadius || 300; // ✅ 與單機一致：使用 CONFIG.FRENZY_LIGHTNING.CHAIN_RADIUS（300）
                        projectileData.palette = projectile.palette || null;
                        projectileData.branchCount = projectile.branchCount || 10;
                        projectileData.chainsPerBranch = projectile.chainsPerBranch || 10;
                    }

                    // 如果是斬擊（SlashEffect），添加額外屬性
                    if (projectile.weaponType === "SLASH") {
                        // ✅ 修復：使用與單機一致的默認值（CONFIG.SLASH）
                        projectileData.damage = projectile.damage || 0; // ✅ 传递伤害值
                        projectileData.angle = projectile.angle || 0;
                        projectileData.radius = projectile.radius || 252; // ✅ 與單機一致：使用 CONFIG.SLASH.RADIUS_BASE（252）
                        projectileData.arcDeg = (projectile.arcRad ? projectile.arcRad * 180 / Math.PI : 365); // ✅ 與單機一致：使用 CONFIG.SLASH.ARC_DEG_BASE（365）
                        projectileData.duration = projectile.durationMs || 1200; // ✅ 與單機一致：使用 CONFIG.SLASH.DURATION（1200ms）
                        projectileData.visualScale = projectile.visualScale || 1.8; // ✅ 與單機一致：使用 CONFIG.SLASH.VISUAL_SCALE（1.8）
                    }

                    // 如果是裁決（JudgmentEffect），添加額外屬性
                    if (projectile.weaponType === "JUDGMENT") {
                        projectileData.damage = projectile.damage || 0; // ✅ 传递伤害值
                        projectileData.swordCount = projectile.swordCount || 1;
                        projectileData.detectRadius = projectile.detectRadius || 400; // ✅ 與單機一致：使用 CONFIG.JUDGMENT.DETECT_RADIUS（400）
                        projectileData.aoeRadius = projectile.aoeRadius || 100; // ✅ 與單機一致：使用 CONFIG.JUDGMENT.BASE_AOE_RADIUS（100）
                        projectileData.swordImageWidth = projectile.swordImageWidth || 83; // ✅ 與單機一致：使用 CONFIG.JUDGMENT.SWORD_IMAGE_WIDTH（83）
                        projectileData.swordImageHeight = projectile.swordImageHeight || 200; // ✅ 與單機一致：使用 CONFIG.JUDGMENT.SWORD_IMAGE_HEIGHT（200）
                        projectileData.fallDurationMs = projectile.fallDurationMs || 250; // ✅ 與單機一致：使用 CONFIG.JUDGMENT.FALL_DURATION_MS（250ms）
                        projectileData.fadeOutDurationMs = projectile.fadeOutDurationMs || 300; // ✅ 與單機一致：使用 CONFIG.JUDGMENT.FADE_OUT_DURATION_MS（300ms）
                    }

                    // 如果是爆炸效果（ExplosionEffect），添加額外屬性
                    if (projectile.weaponType === "EXPLOSION") {
                        // ExplosionEffect 只需要位置，已在 projectileData 中
                    }

                    // 如果是死線戰士/死線超人（DeathlineWarriorEffect），添加額外屬性
                    if (projectile.weaponType === "DEATHLINE_WARRIOR" || projectile.weaponType === "DEATHLINE_SUPERMAN") {
                        // ✅ 修復：使用與單機一致的默認值（CONFIG.DEATHLINE_WARRIOR / DEATHLINE_SUPERMAN）
                        const isSuperman = (projectile.weaponType === "DEATHLINE_SUPERMAN");
                        projectileData.damage = projectile.damage || 0; // ✅ 传递伤害值
                        projectileData.detectRadius = projectile.detectRadius || 600; // ✅ 與單機一致：使用 CONFIG.DEATHLINE_WARRIOR.DETECT_RADIUS（600）
                        projectileData.totalHits = projectile.totalHits || (isSuperman ? 6 : 3); // ✅ 與單機一致：DEATHLINE_SUPERMAN 為 6，DEATHLINE_WARRIOR 為 3
                        projectileData.totalDurationMs = projectile.totalDurationMs || 1200; // ✅ 與單機一致：使用 CONFIG.DEATHLINE_WARRIOR.TOTAL_DURATION_MS（1200ms）
                        projectileData.minTeleportDistance = projectile.minTeleportDistance || 300; // ✅ 與單機一致：使用 CONFIG.DEATHLINE_WARRIOR.MIN_TELEPORT_DISTANCE（300）
                        projectileData.aoeRadius = projectile.aoeRadius !== undefined ? projectile.aoeRadius : (isSuperman ? 200 : 0); // ✅ 與單機一致：DEATHLINE_SUPERMAN 為 200，DEATHLINE_WARRIOR 為 0
                        projectileData.displayScale = projectile.displayScale !== undefined ? projectile.displayScale : (isSuperman ? 1.0 : 0.5); // ✅ 與單機一致：DEATHLINE_SUPERMAN 為 1.0，DEATHLINE_WARRIOR 為 0.5
                    }

                    // 如果是神裁（DivineJudgmentEffect），添加額外屬性
                    if (projectile.weaponType === "DIVINE_JUDGMENT") {
                        // ✅ 修復：使用與單機一致的默認值（CONFIG.DIVINE_JUDGMENT）
                        projectileData.damage = projectile.damage || 0; // ✅ 传递伤害值
                        projectileData.detectRadius = projectile.detectRadius || 400; // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.DETECT_RADIUS_BASE（400）
                        projectileData.aoeRadius = projectile.aoeRadius || 100; // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.AOE_RADIUS_BASE（100）
                        projectileData.fallDurationMs = projectile.fallDurationMs || 250; // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.FALL_DURATION_MS（250ms）
                        projectileData.moveDurationMs = projectile.moveDurationMs || 600; // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.MOVE_DURATION_MS（600ms）
                        projectileData.headWaitMs = projectile.headWaitMs || 100; // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.HEAD_WAIT_MS（100ms）
                        projectileData.holdOnEnemyMs = projectile.holdOnEnemyMs || 200; // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.HOLD_ON_ENEMY_MS（200ms）
                        projectileData.swordImageWidth = projectile.swordImageWidth || 83; // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.SWORD_IMAGE_WIDTH（83）
                        projectileData.swordImageHeight = projectile.swordImageHeight || 200; // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.SWORD_IMAGE_HEIGHT（200）
                        projectileData.visualScale = projectile.visualScale || 1.5;
                        projectileData.patrolSpeedFactor = projectile.patrolSpeedFactor || 0.35; // ✅ 與單機一致：使用 CONFIG.DIVINE_JUDGMENT.PATROL_SPEED_FACTOR（0.35）
                    }

                    // 如果是光環領域（AuraField），添加額外屬性
                    if (projectile.weaponType === "AURA_FIELD") {
                        // ✅ 修復：使用與單機一致的默認值（CONFIG.AURA_FIELD）
                        projectileData.damage = projectile.tickDamage || projectile.damage || 0; // ✅ 传递持续伤害值
                        projectileData.radius = projectile.radius || 60; // ✅ 與單機一致：使用 CONFIG.AURA_FIELD.FIELD_RADIUS（60）
                        projectileData.visualScale = projectile.visualScale || 1.95; // ✅ 與單機一致：使用 CONFIG.AURA_FIELD.VISUAL_SCALE（1.95）
                    }

                    // 如果是重力波（GravityWaveField），添加額外屬性
                    if (projectile.weaponType === "GRAVITY_WAVE") {
                        projectileData.damage = projectile.tickDamage || projectile.damage || 0; // ✅ 传递持续伤害值
                        projectileData.radius = projectile.radius || 150;
                        projectileData.pushMultiplier = projectile.pushMultiplier || 0;
                        projectileData.visualScale = projectile.visualScale || 1.95;
                    }

                    // 如果是大冰球（IceBallProjectile），添加額外屬性
                    if (projectile.weaponType === "BIG_ICE_BALL" || projectile.weaponType === "FRENZY_ICE_BALL") {
                        projectileData.targetX = projectile.targetX || projectile.x;
                        projectileData.targetY = projectile.targetY || projectile.y;
                        projectileData.flightTimeMs = projectile.flightTimeMs || 1000;
                        projectileData.weaponLevel = projectile.weaponLevel || 1;
                        projectileData.isFrenzyIceBall = (projectile.weaponType === "FRENZY_ICE_BALL");
                    }

                    // 如果是幼妲光輝（YoungDadaGloryEffect），添加額外屬性
                    if (projectile.weaponType === "YOUNG_DADA_GLORY") {
                        projectileData.duration = projectile.duration || 2000;
                    }

                    // 如果是幼妲天使（FrenzyYoungDadaGloryEffect），添加額外屬性
                    if (projectile.weaponType === "FRENZY_YOUNG_DADA_GLORY") {
                        projectileData.duration = projectile.duration || 3000;
                    }

                    // 如果是光芒萬丈（RadiantGloryEffect），添加額外屬性
                    if (projectile.weaponType === "RADIANT_GLORY") {
                        projectileData.damage = projectile.tickDamage || projectile.damage || 0; // ✅ 传递持续伤害值
                        projectileData.width = projectile.width || 8; // ✅ 與單機一致：使用 CONFIG.RADIANT_GLORY.BEAM_WIDTH_BASE（8）
                        projectileData.duration = projectile.duration || 2000; // ✅ 與單機一致：使用 CONFIG.RADIANT_GLORY.DURATION（2000ms）
                        projectileData.tickInterval = projectile.tickIntervalMs || 120; // ✅ 與單機一致：使用 CONFIG.RADIANT_GLORY.TICK_INTERVAL_MS（120ms）
                        projectileData.beamCount = projectile.beamCount || 10;
                        projectileData.rotationSpeed = projectile.rotationSpeed || 1.0; // ✅ 與單機一致：使用 CONFIG.RADIANT_GLORY.ROTATION_SPEED（1.0）
                    }

                    // 如果是狂熱斬擊（FRENZY_SLASH），使用FRENZY_SLASH的處理（因為它使用SlashEffect但參數不同）
                    if (projectile.weaponType === "FRENZY_SLASH") {
                        // ✅ 修復：使用與單機一致的默認值（CONFIG.FRENZY_SLASH）
                        projectileData.damage = projectile.damage || 0; // ✅ 传递伤害值
                        projectileData.angle = projectile.angle || 0;
                        projectileData.radius = projectile.radius || 280; // ✅ 與單機一致：使用 CONFIG.FRENZY_SLASH.RADIUS_BASE（280）
                        projectileData.arcDeg = (projectile.arcRad ? projectile.arcRad * 180 / Math.PI : 365); // ✅ 與單機一致：使用 CONFIG.FRENZY_SLASH.ARC_DEG_BASE（365）
                        projectileData.duration = projectile.durationMs || 1200; // ✅ 與單機一致：使用 CONFIG.FRENZY_SLASH.DURATION（1200ms）
                        projectileData.visualScale = projectile.visualScale || 2.0; // ✅ 與單機一致：使用 CONFIG.FRENZY_SLASH.VISUAL_SCALE（2.0）
                    }

                    // 如果是唱歌（SingEffect），添加額外屬性
                    if (projectile.weaponType === "SING") {
                        projectileData.duration = projectile.duration || 2000;
                        projectileData.size = projectile.size || 500;
                        projectileData.offsetY = projectile.offsetY || -250;
                    }

                    // 如果是無敵（InvincibleEffect），添加額外屬性
                    if (projectile.weaponType === "INVINCIBLE") {
                        projectileData.duration = projectile.duration || 2000;
                        projectileData.size = projectile.size || 200;
                        projectileData.offsetY = projectile.offsetY || 0;
                    }

                    // 如果是路口車輛（CarHazard），添加額外屬性
                    if (projectile.weaponType === "INTERSECTION_CAR" || (projectile.constructor && projectile.constructor.name === 'CarHazard')) {
                        projectileData.vx = projectile.vx || 0;
                        projectileData.vy = projectile.vy || 0;
                        projectileData.width = projectile.width || 0;
                        projectileData.height = projectile.height || 0;
                        projectileData.imageKey = projectile.imageKey || "car";
                        projectileData.damage = projectile.damage || 100;
                        projectileData.despawnPad = projectile.despawnPad || 400;
                    }

                    // ✅ 舊多人模式：廣播投射物給其他玩家（僅視覺，不影響傷害計算）
                    // ⚠️ 注意：這段代碼只在非 enabled 模式下執行（enabled 模式下由第一處邏輯處理）
                    if (typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                        console.log(`[Game] 廣播投射物生成事件: weaponType=${projectileData.weaponType}, id=${projectileData.id}, playerUid=${playerUid}`);
                        window.SurvivalOnlineBroadcastEvent("projectile_spawn", projectileData);
                    }
                }
            }
        } catch (e) {
            console.warn("[Game] 廣播投射物生成事件失敗:", e);
        }
    },

    // 添加障礙物
    addObstacle: function (obstacle) {
        this.obstacles.push(obstacle);
    },

    // 生成經驗寶石
    spawnExperienceOrb: function (x, y, value) {
        // ✅ 權威伺服器模式：多人進行中時，經驗球由伺服器 state.experienceOrbs 同步，避免本地生成/廣播互打
        if (this.multiplayer && this.multiplayer.enabled) {
            return;
        }

        // 檢查是否達到最大經驗寶石數量
        if (this.experienceOrbs.length >= CONFIG.OPTIMIZATION.MAX_EXPERIENCE_ORBS) {
            return;
        }

        const orb = new ExperienceOrb(x, y, value);
        this.experienceOrbs.push(orb);
    },

    /**
     * 路口地圖：生成車輛危險物
     * - 每批次生成 count 台（預設 3）
     * - 從隨機邊界直線衝向對側邊界後消失
     * - 生成點需打散（同批次不重疊）
     * - 播放 car 音效一次（不疊加）
     */
    spawnIntersectionCars: function (count = 4) {
        if (!(this.selectedMap && this.selectedMap.id === 'intersection')) return;
        if (typeof CarHazard === 'undefined') return;

        const worldW = this.worldWidth || (CONFIG && CONFIG.CANVAS_WIDTH) || 1920;
        const worldH = this.worldHeight || (CONFIG && CONFIG.CANVAS_HEIGHT) || 1080;

        // 速度：固定為 15（與 Enemy.speed 同尺度）
        const carSpeed = 15;

        const carKeys = ['car', 'car2', 'car3', 'car4', 'car5', 'car6', 'car7', 'car8', 'car9'];
        // 大小：先縮減 40%（0.6），再縮 20% → 0.48
        const scale = 0.48;
        const damage = 100;

        // 生成點打散：同批次車子的起點要分開
        // - 只允許左右兩側生成
        // - 同一側的 y 位置要打散（避免重疊）
        const used = []; // { side: 'left'|'right', y }
        const minSepY = 180;

        const pickSpawn = (side, w, h) => {
            let x, y, vx, vy;
            if (side === 'left') {
                x = -w / 2;
                y = Utils.randomInt(0, worldH);
                vx = carSpeed; vy = 0;
            } else {
                x = worldW + w / 2;
                y = Utils.randomInt(0, worldH);
                vx = -carSpeed; vy = 0;
            }
            return { x, y, vx, vy, side };
        };

        // 音效：一批只播一次
        try {
            if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                AudioManager.playSound('car');
            }
        } catch (_) { }

        // 生成側邊：保持完全隨機，但保證左右都有（不會全部同一邊）
        const n = Math.max(1, count);
        const sides = [];
        if (n === 1) {
            sides.push(Utils.randomInt(0, 1) === 0 ? 'left' : 'right');
        } else {
            sides.push('left');
            sides.push('right');
            for (let i = 2; i < n; i++) {
                sides.push(Utils.randomInt(0, 1) === 0 ? 'left' : 'right');
            }
            // Fisher–Yates shuffle
            for (let i = sides.length - 1; i > 0; i--) {
                const j = Utils.randomInt(0, i);
                const tmp = sides[i]; sides[i] = sides[j]; sides[j] = tmp;
            }
        }

        for (let i = 0; i < n; i++) {
            const baseKey = carKeys[Utils.randomInt(0, carKeys.length - 1)];
            const img = (this.images || Game.images || {})[baseKey];
            const srcW = (img && img.naturalWidth) ? img.naturalWidth : 385;
            const srcH = (img && img.naturalHeight) ? img.naturalHeight : 227;
            const w = Math.max(20, Math.floor(srcW * scale));
            const h = Math.max(20, Math.floor(srcH * scale));

            let spawn = null;
            const side = sides[i] || (Utils.randomInt(0, 1) === 0 ? 'left' : 'right');
            for (let tries = 0; tries < 60; tries++) {
                const cand = pickSpawn(side, w, h);
                let ok = true;
                for (const p of used) {
                    if (p.side === cand.side && Math.abs(cand.y - p.y) < minSepY) { ok = false; break; }
                }
                if (ok) { spawn = cand; break; }
            }
            if (!spawn) {
                spawn = pickSpawn(side, w, h);
            }
            used.push({ side: spawn.side, y: spawn.y });

            // 依左右移動方向選圖（以你提供的素材為準）：
            // 注意：你的 car*.png / car*-2.png 是「互為鏡像」，但「哪一張朝右」並不一致
            // （例如 car3.png 朝左、car3-2.png 才朝右），因此需要每種車指定 baseKey 的朝向。
            const baseFacing = {
                // 若你之後更換素材方向，只需要改這張表即可
                // 這三台（car / car2 / car4）依你目前素材實際朝向屬於例外：base 圖朝左
                car: 'left',
                car2: 'left',
                car3: 'left',
                car4: 'left',
                car5: 'left',
                car6: 'left',
                car7: 'left',
                car8: 'left',
                car9: 'left'
            };
            const desiredFacing = (spawn.vx >= 0) ? 'right' : 'left';
            const baseDir = baseFacing[baseKey] || 'right';
            const altKey = (baseKey === 'car') ? 'car-2' : (baseKey + '-2');

            // 若 base 本身就符合方向，用 base；否則用 -2（若 -2 不存在則回退 base）
            let imageKey = baseKey;
            if (baseDir !== desiredFacing) {
                const altImg = (this.images || Game.images || {})[altKey];
                imageKey = altImg ? altKey : baseKey;
            }

            const car = new CarHazard({
                x: spawn.x,
                y: spawn.y,
                vx: spawn.vx,
                vy: spawn.vy,
                width: w,
                height: h,
                imageKey: imageKey,
                damage,
                despawnPad: 400
            });
            this.addProjectile(car);
        }
    },

    // 生成寶箱（免費升級觸發）
    // 生成寶箱（免費升級觸發）
    // opts: { fromServer: boolean, id: string }
    spawnChest: function (x, y, opts = {}) {
        const isFromServer = opts && opts.fromServer;
        const id = (opts && opts.id) ? opts.id : (typeof Utils !== 'undefined' && Utils.generateUUID ? Utils.generateUUID() : `chest_${Date.now()}_${Math.random()}`);

        // ✅ 權威伺服器模式：多人進行中時，寶箱由伺服器 state.chests 同步，避免本地生成/廣播互打
        if (this.multiplayer && this.multiplayer.enabled && !isFromServer) {
            return;
        }

        const chest = new Chest(x, y, id);
        this.chests.push(chest);

        // ✅ MMORPG 架構：主機廣播生成事件
        try {
            // 確保只在生存模式下執行組隊邏輯
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null);
            } catch (_) { }

            // 如果我是 Host 且這不是來自服務器的消息，我需要廣播
            if (isSurvivalMode && this.multiplayer && this.multiplayer.enabled && this.multiplayer.isHost && !isFromServer) {
                if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function') {
                    window.SurvivalOnlineRuntime.sendToNet({
                        type: 'chest_spawn',
                        x: x || 0,
                        y: y || 0,
                        id: id,
                        chestType: 'NORMAL'
                    });
                }
            }
        } catch (_) { }
    },

    // 鳳梨大絕：生成可拾取的大鳳梨（不吸、需碰觸；特效與寶箱同款光束）
    // 鳳梨大絕：生成可拾取的大鳳梨
    spawnPineappleUltimatePickup: function (targetX, targetY, opts = {}) {
        try {
            if (typeof PineappleUltimatePickup === 'undefined') return;

            const isFromServer = opts && opts.fromServer;
            // ✅ 權威伺服器模式：多人進行中時，鳳梨掉落物由伺服器 state.chests(type=PINEAPPLE) 同步
            if (this.multiplayer && this.multiplayer.enabled && !isFromServer) {
                return;
            }
            // 如果沒有 ID，生成一個
            if (!opts.id) {
                opts.id = (typeof Utils !== 'undefined' && Utils.generateUUID ? Utils.generateUUID() : `pine_${Date.now()}_${Math.random()}`);
            }

            const o = new PineappleUltimatePickup(targetX, targetY, opts);
            this.pineappleUltimatePickups.push(o);

            // M2：廣播鳳梨大絕掉落事件
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

                // MMO 架構：每個玩家都廣播自己的鳳梨大絕掉落
                // 如果不是來自服務器，則廣播之
                // ✅ 防污染：添加 enabled 檢查，確保只在組隊模式下發送
                if (isSurvivalMode && this.multiplayer && this.multiplayer.enabled && !isFromServer) {
                    if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function') {
                        window.SurvivalOnlineRuntime.sendToNet({
                            type: 'chest_spawn', // 統一使用 chest_spawn 並指定 type
                            x: targetX,
                            y: targetY,
                            id: opts.id,
                            chestType: 'PINEAPPLE'
                        });
                    }
                }
            } catch (_) { }
        } catch (_) { }
    },

    // 生成出口（第20波BOSS死亡後）
    spawnExit: function () {
        // ✅ 權威伺服器模式：多人進行中時，出口由伺服器 state.exit 同步，避免本地生成/事件互打
        if (this.multiplayer && this.multiplayer.enabled) {
            return;
        }
        // 在地圖中心生成出口
        const exitX = (this.worldWidth || CONFIG.CANVAS_WIDTH) / 2;
        const exitY = (this.worldHeight || CONFIG.CANVAS_HEIGHT) / 2;
        this.exit = {
            x: exitX,
            y: exitY,
            width: 300,
            height: 242
        };
        console.log('出口已生成在地圖中心');

        // 組隊模式：廣播出口生成事件（隔離：只允許 survival+enabled）
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

            // ✅ 隔離：只允許「組隊 survival（enabled）」送多人封包
            if (isSurvivalMode && this.multiplayer && this.multiplayer.enabled === true) {
                if (typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                    window.SurvivalOnlineBroadcastEvent("exit_spawn", {
                        x: exitX,
                        y: exitY,
                        width: 300,
                        height: 242
                    });
                }
            }
        } catch (_) { }
    },

    // 優化實體數量
    optimizeEntities: function () {
        // 如果敵人數量超過限制，移除最遠的敵人
        const baseMax = CONFIG.OPTIMIZATION.MAX_ENEMIES;
        const bonus = (typeof this.maxEnemiesBonus === 'number') ? this.maxEnemiesBonus : 0;
        const effectiveMax = baseMax + Math.max(0, bonus);
        if (this.enemies.length > effectiveMax) {
            // 按照與玩家的距離排序
            this.enemies.sort((a, b) => {
                const distA = Utils.distance(a.x, a.y, this.player.x, this.player.y);
                const distB = Utils.distance(b.x, b.y, this.player.x, this.player.y);
                return distB - distA; // 降序排列，最遠的在前面
            });

            // 只移除非小BOSS/大BOSS，保留BOSS類型免受上限影響
            let toRemove = this.enemies.length - effectiveMax;
            for (let i = 0; i < this.enemies.length && toRemove > 0;) {
                const e = this.enemies[i];
                if (e && (e.type === 'BOSS' || e.type === 'ELF_BOSS' || e.type === 'HUMAN_BOSS' || e.type === 'MINI_BOSS' || e.type === 'ELF_MINI_BOSS' || e.type === 'HUMAN_MINI_BOSS')) {
                    i++; // 跳過BOSS類型
                } else {
                    this.enemies.splice(i, 1);
                    toRemove--;
                }
            }
        }

        // 如果投射物數量超過限制，移除最早的投射物
        if (this.projectiles.length > CONFIG.OPTIMIZATION.MAX_PROJECTILES) {
            this.projectiles.splice(0, this.projectiles.length - CONFIG.OPTIMIZATION.MAX_PROJECTILES);
        }

        // 如果經驗寶石數量超過限制，移除最早的經驗寶石
        if (this.experienceOrbs.length > CONFIG.OPTIMIZATION.MAX_EXPERIENCE_ORBS) {
            this.experienceOrbs.splice(0, this.experienceOrbs.length - CONFIG.OPTIMIZATION.MAX_EXPERIENCE_ORBS);
        }
    },

    // 暫停遊戲
    // 可選參數 muteAudio：是否同時靜音（預設true）；
    // 例如升級選單或技能頁暫停時，傳入false保留BGM與音效。
    pause: function (muteAudio = true) {
        this.isPaused = true;
        if (typeof AudioManager !== 'undefined' && AudioManager.setMuted) {
            if (muteAudio) AudioManager.setMuted(true);
        }
    },

    // 恢復遊戲
    resume: function () {
        this.isPaused = false;
        // 重置時間，避免大幅度時間跳躍（修復ESC暫停BUG）
        // 這樣恢復時第一次更新的deltaTime會很小，不會導致技能冷卻時間異常
        this.lastUpdateTime = Date.now();
        if (typeof AudioManager !== 'undefined' && AudioManager.setMuted) {
            // 若升級選單仍打開則保持靜音
            const levelMenu = document.getElementById('level-up-menu');
            const shouldUnmute = !levelMenu || levelMenu.classList.contains('hidden');
            if (shouldUnmute) AudioManager.setMuted(false);
        }
    },

    // 遊戲結束
    gameOver: function () {
        console.log('[Game] gameOver: 被调用');
        // ✅ 防重複觸發：如果已經處理過失敗事件，直接返回
        if (this._gameOverEventSent) {
            console.warn('[Game] gameOver: _gameOverEventSent 已为 true，跳过');
            return; // 已經處理過了，避免無限循環
        }
        console.log('[Game] gameOver: 设置 _gameOverEventSent = true');
        this._gameOverEventSent = true; // 標記為已處理
        this.isGameOver = true;
        
        // ⚠️ 修复：游戏结束时完全清理所有游戏数据，确保重新进入游戏时是全新状态
        // 与单机模式一致：完完全全清理掉游戏的任何资料，只保留大厅的资讯
        // 这样才不会污染到单机、其他模式，以及组队模式的下一局
        // ⚠️ 注意：不要在显示游戏结束画面之前调用 reset()，因为 reset() 可能会影响视频播放
        // 清理逻辑应该在游戏结束画面播放完成后，在 _returnToStartFrom 中调用
        try {
            // 停止所有音效（包括路口地图的车子音效）
            if (typeof AudioManager !== 'undefined') {
                try {
                    if (AudioManager.stopAllMusic) AudioManager.stopAllMusic();
                    if (AudioManager.stopAllSounds) AudioManager.stopAllSounds();
                } catch (_) { }
            }
            
            // ⚠️ 修复：延迟调用 reset()，等待游戏结束画面显示后再清理
            // 这样可以避免 reset() 影响视频播放
            // 完全重置游戏状态会在 _returnToStartFrom 中调用（通过 Game.init 或 startGame）
        } catch (e) {
            console.warn('[Game] gameOver: 清理游戏状态失败:', e);
        }
        
        // ⚠️ 修复：先显示游戏结束画面，然后再处理组队模式的房间大厅逻辑
        // 确保游戏结束画面一定会显示，不会被房间大厅覆盖
        console.log('[Game] gameOver: 调用 UI.showGameOverScreen()');
        if (typeof UI !== 'undefined' && typeof UI.showGameOverScreen === 'function') {
            UI.showGameOverScreen();
        } else {
            console.error('[Game] gameOver: UI 或 UI.showGameOverScreen 不存在！', typeof UI, typeof UI?.showGameOverScreen);
        }
        
        // ✅ 正常結束：組隊模式下回到房間，單機模式下正常返回開始畫面
        // ⚠️ 注意：房间大厅逻辑应该在游戏结束画面显示之后处理，或者延迟处理
        // 因为游戏结束画面需要先显示，然后用户看完后再回到房间大厅
        try {
            // 確保只在生存模式下執行組隊邏輯
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null); // null 表示舊版流程，預設為生存模式
            } catch (_) { }

            // ✅ 組隊模式：正常結束時回到房間，不離開房間（異常結束才會清理）
            // ⚠️ 修复：延迟处理房间大厅逻辑，确保游戏结束画面先显示
            // 游戏结束画面会在用户看完后自动返回开始画面，然后我们再显示房间大厅
            if (isSurvivalMode && this.multiplayer) {
                // 更新房間狀態為 lobby（回到大廳狀態）
                if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.updateRoomStatusToLobby === 'function') {
                    window.SurvivalOnlineUI.updateRoomStatusToLobby().catch(() => { });
                }
                // ⚠️ 修复：不在游戏结束时立即显示房间大厅，而是等待游戏结束画面播放完成
                // 游戏结束画面会在播放完成后自动返回开始画面，然后我们再显示房间大厅
                // 这样确保用户能看到完整的游戏结束画面
                // 房间大厅的显示逻辑已经在 UI.showGameOverScreen() 中处理（通过 _returnToStartFrom）
            }
        } catch (_) { }
    },

    // 遊戲勝利
    victory: function () {
        // ✅ 防重複觸發：如果已經處理過勝利事件，直接返回
        if (this._victoryEventSent) {
            return; // 已經處理過了，避免無限循環
        }
        this._victoryEventSent = true; // 標記為已處理
        this.isGameOver = true;
        
        // ⚠️ 修复：游戏结束时完全清理所有游戏数据，确保重新进入游戏时是全新状态
        // 与单机模式一致：完完全全清理掉游戏的任何资料，只保留大厅的资讯
        // 这样才不会污染到单机、其他模式，以及组队模式的下一局
        // ⚠️ 注意：不要在显示胜利画面之前调用 reset()，因为 reset() 可能会影响视频播放
        // 清理逻辑应该在胜利画面播放完成后，在 _returnToStartFrom 中调用
        try {
            // 停止所有音效（包括路口地图的车子音效）
            if (typeof AudioManager !== 'undefined') {
                try {
                    if (AudioManager.stopAllMusic) AudioManager.stopAllMusic();
                    if (AudioManager.stopAllSounds) AudioManager.stopAllSounds();
                } catch (_) { }
            }
            
            // ⚠️ 修复：延迟调用 reset()，等待胜利画面显示后再清理
            // 这样可以避免 reset() 影响视频播放
            // 完全重置游戏状态会在 _returnToStartFrom 中调用（通过 Game.init 或 startGame）
        } catch (e) {
            console.warn('[Game] victory: 清理游戏状态失败:', e);
        }
        
        // ✅ 正常結束：組隊模式下回到房間，單機模式下正常返回開始畫面
        try {
            // 確保只在生存模式下執行組隊邏輯
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null); // null 表示舊版流程，預設為生存模式
            } catch (_) { }

            // ✅ 權威伺服器模式：多人進行中時，勝利由伺服器 state.isVictory 觸發，不再走 client event 廣播
            // 只在舊模式（非 enabled）下才廣播，enabled 模式下由伺服器權威控制
            if (isSurvivalMode && this.multiplayer && !this.multiplayer.enabled) {
                if (typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                    window.SurvivalOnlineBroadcastEvent("game_victory", { reason: "exit_reached" });
                }
                // ✅ 正常結束：更新房間狀態為 lobby（回到大廳狀態），不離開房間
                if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.updateRoomStatusToLobby === 'function') {
                    window.SurvivalOnlineUI.updateRoomStatusToLobby().catch(() => { });
                }
                // 先顯示開始畫面（作為背景），然後顯示房間大廳覆蓋層
                try {
                    const startScreen = document.getElementById('start-screen');
                    if (startScreen) startScreen.classList.remove('hidden');
                } catch (_) { }
                // 回到房間大廳（覆蓋層）
                if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.openLobbyScreen === 'function') {
                    window.SurvivalOnlineUI.openLobbyScreen();
                }
            }
        } catch (_) { }
        try {
            if (typeof Achievements !== 'undefined' && Achievements.unlock) {
                Achievements.unlock('FIRST_CLEAR');
                // 困難模式首勝：解鎖心靈魔法成就
                const diffId = this.selectedDifficultyId || 'EASY';
                if (diffId === 'HARD') {
                    Achievements.unlock('HARD_CLEAR');
                }
                // 洛可洛斯特通關廁所：解鎖死線超人成就
                const charId = (this.selectedCharacter && this.selectedCharacter.id) ? this.selectedCharacter.id : null;
                const mapId = (this.selectedMap && this.selectedMap.id) ? this.selectedMap.id : null;
                if (charId === 'rokurost' && mapId === 'city') {
                    Achievements.unlock('ROKUROST_CITY_CLEAR');
                }
                // 灰妲通關廁所：解鎖狂熱大波成就
                if (charId === 'dada' && mapId === 'city') {
                    Achievements.unlock('DADA_CITY_CLEAR');
                }
                // 艾比通關廁所：解鎖神界裁決成就
                if (charId === 'rabi' && mapId === 'city') {
                    Achievements.unlock('RABI_CITY_CLEAR');
                }
                // 灰妲通關草原：解鎖幼妲天使成就
                if (charId === 'dada' && mapId === 'forest') {
                    Achievements.unlock('DADA_FOREST_CLEAR');
                }
            }
        } catch (_) { }
        UI.showVictoryScreen();
    },

    // 重置遊戲
    reset: function () {
        // 先清理所有投射物的 DOM 元素（避免視覺污染）
        try {
            // 清理守護領域和引力波等使用 DOM 的投射物
            if (Array.isArray(this.projectiles)) {
                for (const p of this.projectiles) {
                    if (p && typeof p.destroy === 'function') {
                        try {
                            p.destroy();
                        } catch (_) { }
                    }
                }
            }
            if (Array.isArray(this.bossProjectiles)) {
                for (const p of this.bossProjectiles) {
                    if (p && typeof p.destroy === 'function') {
                        try {
                            p.destroy();
                        } catch (_) { }
                    }
                }
            }
        } catch (_) { }

        // 重置遊戲狀態
        this.enemies = [];
        this.projectiles = [];
        this.bossProjectiles = [];
        this.explosionParticles = [];
        this.heartTransmissionEffects = [];
        this.experienceOrbs = [];
        this.chests = [];
        this.pineappleUltimatePickups = [];
        this.obstacles = [];
        this.decorations = [];
        // ✅ MMORPG 架構：重置障礙物和裝飾生成標記
        this._obstaclesAndDecorationsSpawned = false;
        // M4/M5：清理遠程玩家（確保重置時完全清理）
        if (Array.isArray(this.remotePlayers)) {
            for (const remotePlayer of this.remotePlayers) {
                try {
                    if (remotePlayer && remotePlayer.weapons && Array.isArray(remotePlayer.weapons)) {
                        for (const weapon of remotePlayer.weapons) {
                            if (weapon && typeof weapon.destroy === "function") {
                                try { weapon.destroy(); } catch (_) { }
                            }
                        }
                    }
                } catch (_) { }
            }
            this.remotePlayers = [];
        }
        // 清除AI生命體（如果存在）
        if (this.player && this.player.aiCompanion) {
            try {
                if (this.player.aiCompanion.cleanup) {
                    this.player.aiCompanion.cleanup();
                }
            } catch (_) { }
            this.player.aiCompanion = null;
        }
        this.gameTime = 0;
        this.isPaused = false;
        this.isGameOver = false;
        // ✅ 重置事件标志，確保新遊戲可以正常觸發勝利和失敗事件
        this._victoryEventSent = false;
        this._gameOverEventSent = false;
        this.boss = null;
        this.exit = null;

        // 重置花園視頻計時器
        this.gardenVideoTimer = 0;
        this.gardenVideoPlaying = false;
        this.gardenVideoFadeOutTime = 0;
        if (this.gardenVideoElement) {
            try {
                this.gardenVideoElement.pause();
                this.gardenVideoElement.currentTime = 0;
                if (this.gardenVideoElement.parentNode) {
                    this.gardenVideoElement.style.display = 'none';
                    this.gardenVideoElement.style.opacity = '0';
                }
            } catch (_) { }
        }

        // 清除技能視覺覆蓋層與樣式（例如 INVINCIBLE 護盾、守護領域、引力波等）
        try {
            // 清理 skill-effects-layer（用於 INVINCIBLE、SING、SLASH 等技能）
            const skillLayer = document.getElementById('skill-effects-layer');
            if (skillLayer && skillLayer.parentNode) {
                // 先清理層內所有子元素
                while (skillLayer.firstChild) {
                    skillLayer.removeChild(skillLayer.firstChild);
                }
                skillLayer.parentNode.removeChild(skillLayer);
            }
            // 清理 aura-effects-layer（用於 AURA_FIELD 守護領域）
            const auraLayer = document.getElementById('aura-effects-layer');
            if (auraLayer && auraLayer.parentNode) {
                // 先清理層內所有子元素
                while (auraLayer.firstChild) {
                    auraLayer.removeChild(auraLayer.firstChild);
                }
                auraLayer.parentNode.removeChild(auraLayer);
            }
            // 清理 gravity-wave-effects-layer（用於 GRAVITY_WAVE 引力波）
            const gravityLayer = document.getElementById('gravity-wave-effects-layer');
            if (gravityLayer && gravityLayer.parentNode) {
                // 先清理層內所有子元素
                while (gravityLayer.firstChild) {
                    gravityLayer.removeChild(gravityLayer.firstChild);
                }
                gravityLayer.parentNode.removeChild(gravityLayer);
            }
            // 清理 INVINCIBLE 樣式標籤
            const styleTag = document.getElementById('invincible-style');
            if (styleTag && styleTag.parentNode) styleTag.parentNode.removeChild(styleTag);
        } catch (_) { }

        // 清理舊玩家的大招備份狀態（避免武器數據殘留到新遊戲）
        if (this.player) {
            try {
                if (this.player.isUltimateActive && this.player._ultimateBackup) {
                    // 如果舊玩家還在大招狀態，先結束大招以清理狀態
                    if (typeof this.player.deactivateUltimate === 'function') {
                        this.player.deactivateUltimate();
                    }
                }
                // 確保清理所有大招相關狀態
                this.player._ultimateBackup = null;
                this.player.isUltimateActive = false;
            } catch (_) { }
        }

        // 根據地圖類型設定世界大小
        // 4K模式（花園、路口）：固定為 3840x2160
        // 720P九宮格模式（廁所、草原、宇宙）：根據 CONFIG 計算 (1280*3, 720*3)
        if (this.selectedMap && (this.selectedMap.id === 'garden' || this.selectedMap.id === 'intersection')) {
            this.worldWidth = 3840;
            this.worldHeight = 2160;
            console.log(`[Game] 重置世界大小 (4K模式): ${this.worldWidth}x${this.worldHeight}`);
        } else {
            this.worldWidth = CONFIG.CANVAS_WIDTH * (CONFIG.WORLD?.GRID_X || 3);
            this.worldHeight = CONFIG.CANVAS_HEIGHT * (CONFIG.WORLD?.GRID_Y || 3);
            console.log(`[Game] 重置世界大小 (九宮格模式): ${this.worldWidth}x${this.worldHeight}`);
        }

        // 重新置中玩家
        this.player = new Player(this.worldWidth / 2, this.worldHeight / 2);
        // 應用選角屬性（若有）
        if (this.selectedCharacter) {
            const sc = this.selectedCharacter;
            // 角色移動速度倍率（預設為 1.0）
            if (sc.speedMultiplier) {
                this.player.speed = CONFIG.PLAYER.SPEED * sc.speedMultiplier;
            }
            // 角色血量：以 baseMaxHealth 為基準，乘上倍率再加上固定加成
            const baseMax = CONFIG.PLAYER.MAX_HEALTH;
            const hpMul = sc.hpMultiplier != null ? sc.hpMultiplier : 1.0;
            const hpBonus = sc.hpBonus != null ? sc.hpBonus : 0;
            const charBaseMax = Math.max(1, Math.floor(baseMax * hpMul + hpBonus));
            this.player.baseMaxHealth = charBaseMax;
            this.player.maxHealth = charBaseMax;
            this.player.health = charBaseMax;
            // 是否允許使用大絕（Q）：預設 true，角色可明確關閉
            if (sc.canUseUltimate === false) {
                this.player.canUseUltimate = false;
            } else {
                this.player.canUseUltimate = true;
            }
            // 生存模式玩家主體圖像鍵（若未指定則回退到 'player'）
            this.player.spriteImageKey = sc.spriteImageKey || 'player';
            // 角色初始爆擊率加成（若角色配置中有設定）
            if (typeof sc.critChanceBonusPct === 'number' && sc.critChanceBonusPct > 0) {
                // 初始化玩家爆擊率屬性（如果尚未初始化）
                if (this.player.critChanceBonusPct == null) {
                    this.player.critChanceBonusPct = 0;
                }
                // 應用角色基礎爆擊率加成（此為角色固有屬性，不與天賦/升級疊加，而是作為基礎值）
                // 注意：此值會在 BuffSystem.applyBuffs 中與天賦/升級加成相加
                this.player._characterBaseCritBonusPct = sc.critChanceBonusPct;
            }
            // 角色初始迴避率加成（若角色配置中有設定）
            // 注意：此為角色固有屬性，並不寫入存檔；由玩家 takeDamage 判定時一併計算
            if (typeof sc.dodgeChanceBonusPct === 'number' && sc.dodgeChanceBonusPct > 0) {
                this.player._characterBaseDodgeRate = sc.dodgeChanceBonusPct;
            } else {
                this.player._characterBaseDodgeRate = 0;
            }
        }

        // 套用選定難度（若有），供敵人與波次使用
        const diffId = this.selectedDifficultyId || 'EASY';
        this.difficulty = (CONFIG.DIFFICULTY && CONFIG.DIFFICULTY[diffId]) ? CONFIG.DIFFICULTY[diffId] : (CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.EASY) || null;
        // 設定困難模式的敵人上限加成（50~100），簡單為0
        const d = this.difficulty || {};
        const minB = d.maxEnemiesBonusMin || 0;
        const maxB = d.maxEnemiesBonusMax || 0;
        this.maxEnemiesBonus = (maxB > 0) ? Utils.randomInt(minB, maxB) : 0;

        // 根據難度控制彈幕系統開關：僅在修羅（ASURA）開啟
        try {
            if (typeof BulletSystem !== 'undefined' && typeof BulletSystem.setEnabled === 'function') {
                BulletSystem.setEnabled(diffId === 'ASURA');
            }
        } catch (e) {
            console.warn('BulletSystem.setEnabled 失敗：', e);
        }

        // 套用選定地圖的背景鍵（若有）
        const mapCfg = this.selectedMap || null;
        this.backgroundKey = (mapCfg && mapCfg.backgroundKey) ? mapCfg.backgroundKey : 'background';

        // 重置鏡頭
        this.camera.x = Utils.clamp(this.player.x - this.canvas.width / 2, 0, Math.max(0, this.worldWidth - this.canvas.width));
        this.camera.y = Utils.clamp(this.player.y - this.canvas.height / 2, 0, Math.max(0, this.worldHeight - this.canvas.height));

        // 先重置彈幕系統緩存，避免之後初始化波次時掛載的發射器被清空
        try {
            if (typeof BulletSystem !== 'undefined' && typeof BulletSystem.reset === 'function') {
                BulletSystem.reset();
            }
        } catch (e) {
            console.warn('BulletSystem.reset 失敗：', e);
        }

        // MMO 架構：多人模式設置確定性隨機數種子，確保所有客戶端生成相同的敵人
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

            if (isSurvivalMode && this.multiplayer && this.multiplayer.sessionId) {
                // 多人模式：使用房間ID和sessionId作為種子，確保所有客戶端使用相同的種子
                const roomId = this.multiplayer.roomId || '';
                const sessionId = this.multiplayer.sessionId || '';
                const seed = `${roomId}_${sessionId}`;
                if (typeof DeterministicRandom !== "undefined" && typeof DeterministicRandom.init === "function") {
                    DeterministicRandom.init(seed);
                    console.log(`[Game] 多人模式：設置確定性隨機數種子: ${seed}`);
                }
            } else {
                // 單機模式：不使用種子
                if (typeof DeterministicRandom !== "undefined" && typeof DeterministicRandom.init === "function") {
                    DeterministicRandom.init(null);
                }
            }
        } catch (e) {
            console.warn("[Game] 設置確定性隨機數種子失敗:", e);
        }

        // 重置波次系統
        WaveSystem.init();

        // M2/M4：清理遠程玩家（僅在生存模式組隊模式且為室長時）
        try {
            // 確保只在生存模式下執行組隊邏輯
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null); // null 表示舊版流程，預設為生存模式
            } catch (_) { }

            // ✅ MMORPG 架構：所有玩家都清理遠程玩家對象，不依賴角色
            if (isSurvivalMode && this.multiplayer) {
                // 清理遠程玩家對象（通過 RemotePlayerManager）
                if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.clear === "function") {
                        rm.clear();
                    }
                }
                // 清理本地 remotePlayers 數組
                if (Array.isArray(this.remotePlayers)) {
                    this.remotePlayers = [];
                }
            }
        } catch (_) { }

        // 重置UI
        UI.init();

        // 應用天賦效果 - 確保在玩家創建後應用
        try {
            console.log('重置遊戲後應用天賦效果...');
            if (typeof TalentSystem !== 'undefined' && typeof TalentSystem.applyTalentEffects === 'function') {
                TalentSystem.applyTalentEffects(this.player);
            } else if (typeof applyTalentEffects === 'function') {
                applyTalentEffects(this.player);
            }
        } catch (e) {
            console.error('應用天賦效果失敗:', e);
        }

        // 設定左上角玩家頭像（依選角顯示），預設為 player.png
        const avatarEl = document.getElementById('player-avatar-img');
        if (avatarEl) {
            let key = 'player';
            if (this.selectedCharacter) {
                const sc = this.selectedCharacter;
                // 角色可提供獨立 HUD 頭像鍵；若無則回退到 avatarImageKey
                if (sc.hudImageKey) {
                    key = sc.hudImageKey;
                } else if (sc.avatarImageKey) {
                    key = sc.avatarImageKey;
                }
            }
            const imgObj = (this.images || Game.images || {})[key];
            if (imgObj && imgObj.src) {
                avatarEl.src = imgObj.src;
            } else {
                // 後備路徑（使用 player1-2.png 替代已移除的 player.png）
                avatarEl.src = 'assets/images/player1-2.png';
            }
            avatarEl.alt = this.selectedCharacter?.name || '玩家';
        }

        // ✅ MMORPG 架構：障礙物和地圖裝飾需要同步
        // 在多人模式下，只有第一個玩家（或使用確定性隨機數）生成，然後廣播給其他玩家
        // ✅ 隔離：只允許「組隊 survival（enabled）」走多人路徑（避免影響單機/其他模式）
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled === true);
        let isSurvivalMode = false;
        try {
            const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                ? GameModeManager.getCurrent()
                : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                    ? ModeManager.getActiveModeId()
                    : null);
            isSurvivalMode = (activeId === 'survival' || activeId === null);
        } catch (_) { }

        if (isSurvivalMode && isMultiplayer) {
            // 多人模式：使用確定性隨機數生成器，確保所有玩家生成相同的障礙物和裝飾
            // 注意：如果 DeterministicRandom 未初始化，則由第一個玩家生成並廣播
            const hasDeterministicRandom = (typeof DeterministicRandom !== 'undefined' && DeterministicRandom.getSeed() !== null);
            if (hasDeterministicRandom) {
                // 使用確定性隨機數生成器，所有玩家會生成相同的位置
                this.spawnObstacles();
                this.spawnDecorations();
            } else {
                // 如果沒有確定性隨機數，由第一個玩家生成並廣播
                // 這裡先不生成，等待收到同步事件
                // 注意：如果沒有收到同步事件，則本地生成（向後兼容）
                this._obstaclesAndDecorationsSpawned = false;
            }
        } else {
            // 單機模式：正常生成
            this.spawnObstacles();
            this.spawnDecorations();
        }

        // 重置時間
        this.lastUpdateTime = Date.now();
    },

    // 開始新遊戲
    startNewGame: function () {
        // 重置遊戲
        this.reset();

        // 載入金幣並更新顯示
        this.loadCoins();
        if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) {
            UI.updateCoinsDisplay(this.coins);
        }

        // M1：顯示/隱藏組隊模式 Session ID（僅在生存模式組隊模式下顯示）
        try {
            // 確保只在生存模式下執行組隊邏輯
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null); // null 表示舊版流程，預設為生存模式
            } catch (_) { }

            const sessionInfoEl = document.getElementById('multiplayer-session-info');
            const sessionIdEl = document.getElementById('multiplayer-session-id');
            if (sessionInfoEl && sessionIdEl) {
                if (isSurvivalMode && this.multiplayer && this.multiplayer.sessionId) {
                    sessionInfoEl.classList.remove('hidden');
                    sessionIdEl.textContent = this.multiplayer.sessionId;
                    // 初始化玩家列表
                    if (typeof this.updateMultiplayerHUD === 'function') {
                        this.updateMultiplayerHUD();
                    }

                    // ✅ MMORPG 架構：將世界大小同步給服務器（確保服務器邊界檢查與客戶端一致）
                    // ✅ 防污染：只在生存模式下同步世界大小
                    if (isSurvivalMode && typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function') {
                        console.log(`[Game] 同步世界大小至伺服器: ${this.worldWidth}x${this.worldHeight}`);
                        window.SurvivalOnlineRuntime.sendToNet({
                            // ✅ 與 server/websocket-server.js 的處理分支一致：'world-size'
                            type: 'world-size',
                            worldWidth: this.worldWidth,
                            worldHeight: this.worldHeight,
                            mapId: this.selectedMap ? this.selectedMap.id : 'unknown'
                        });
                    }
                } else {
                    sessionInfoEl.classList.add('hidden');
                    sessionIdEl.textContent = '-';
                    const playersListEl = document.getElementById('multiplayer-players-list');
                    if (playersListEl) playersListEl.innerHTML = '';
                }
            }
        } catch (_) { }

        // 顯示遊戲畫面
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
    },

    // 更新組隊HUD
    updateMultiplayerHUD: function () {
        try {
            // ✅ 防污染：只在生存模式下更新組隊HUD，其他模式（main/challenge/defense/stage/3d）不執行
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null);
            } catch (_) { }
            
            if (!isSurvivalMode) {
                // 非生存模式：清空列表，避免污染
                const playersListEl = document.getElementById('multiplayer-players-list');
                if (playersListEl) playersListEl.innerHTML = '';
                return;
            }
            
            const playersListEl = document.getElementById('multiplayer-players-list');
            if (!playersListEl) return;

            if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime) {
                // ✅ 多人元素：遊戲內 HUD（純顯示）
                const hud = (typeof window.SurvivalOnlineRuntime.getHudPlayers === 'function')
                    ? window.SurvivalOnlineRuntime.getHudPlayers()
                    : null;

                const members = (typeof window.SurvivalOnlineRuntime.getMembersState === 'function')
                    ? window.SurvivalOnlineRuntime.getMembersState()
                    : [];

                // 先建立 uid->role/name 映射（避免 game-state 還沒帶 nickname 時顯示空白）
                const memberMap = new Map();
                try {
                    for (const m of (members || [])) {
                        if (!m || !m.uid) continue;
                        memberMap.set(m.uid, m);
                    }
                } catch (_) { }

                const list = (hud && Array.isArray(hud) && hud.length) ? hud : [];
                if (list.length) {
                    playersListEl.innerHTML = '';
                    for (const p of list) {
                        if (!p || !p.uid) continue;
                        const m = memberMap.get(p.uid) || null;
                        const name = (p.nickname || (m && m.name) || (p.uid ? p.uid.slice(0, 6) : '未知'));
                        const role = (m && m.role) ? m.role : 'guest';
                        const hp = (typeof p.health === 'number') ? p.health : 0;
                        const maxHp = (typeof p.maxHealth === 'number' && p.maxHealth > 0) ? p.maxHealth : 1;
                        const pct = Math.max(0, Math.min(1, hp / maxHp));

                        const row = document.createElement('div');
                        row.style.display = 'flex';
                        row.style.flexDirection = 'column';
                        row.style.gap = '2px';
                        row.style.marginBottom = '6px';

                        const top = document.createElement('div');
                        top.style.display = 'flex';
                        top.style.alignItems = 'center';
                        top.style.justifyContent = 'space-between';
                        top.style.gap = '8px';

                        const left = document.createElement('div');
                        left.style.display = 'flex';
                        left.style.alignItems = 'center';
                        left.style.gap = '6px';

                        const roleIcon = document.createElement('span');
                        roleIcon.textContent = role === 'host' ? '👑' : '👤';
                        roleIcon.style.opacity = '0.8';

                        const nameSpan = document.createElement('span');
                        nameSpan.textContent = name;
                        nameSpan.style.opacity = (p.isDead ? '0.55' : '1');

                        const hpText = document.createElement('span');
                        hpText.textContent = p.isDead ? 'DEAD' : `${Math.max(0, Math.floor(hp))}/${Math.max(1, Math.floor(maxHp))}`;
                        hpText.style.opacity = '0.75';

                        left.appendChild(roleIcon);
                        left.appendChild(nameSpan);
                        top.appendChild(left);
                        top.appendChild(hpText);

                        const barWrap = document.createElement('div');
                        barWrap.style.width = '100%';
                        barWrap.style.height = '6px';
                        barWrap.style.background = 'rgba(255,255,255,0.18)';
                        barWrap.style.borderRadius = '6px';
                        barWrap.style.overflow = 'hidden';

                        const bar = document.createElement('div');
                        bar.style.height = '100%';
                        bar.style.width = `${Math.floor(pct * 100)}%`;
                        bar.style.background = (pct > 0.6) ? '#3ddc84' : (pct > 0.3 ? '#f1c40f' : '#e74c3c');
                        barWrap.appendChild(bar);

                        row.appendChild(top);
                        row.appendChild(barWrap);
                        playersListEl.appendChild(row);
                    }
                } else if (members && Array.isArray(members) && members.length > 0) {
                    // 後備：只顯示名單（避免空白）
                    playersListEl.innerHTML = '';
                    for (const m of members) {
                        if (!m || !m.name) continue;
                        const div = document.createElement('div');
                        div.style.display = 'flex';
                        div.style.alignItems = 'center';
                        div.style.gap = '6px';
                        div.style.marginBottom = '4px';
                        const roleIcon = document.createElement('span');
                        roleIcon.textContent = m.role === 'host' ? '👑' : '👤';
                        roleIcon.style.opacity = '0.8';
                        const nameSpan = document.createElement('span');
                        nameSpan.textContent = m.name;
                        div.appendChild(roleIcon);
                        div.appendChild(nameSpan);
                        playersListEl.appendChild(div);
                    }
                } else {
                    playersListEl.innerHTML = '<div style="opacity:0.6;">載入中...</div>';
                }
            }
        } catch (e) {
            console.warn('[Game] 更新玩家列表失敗:', e);
        }
    },

    // 更新組隊HUD
    // ⚠️ LEGACY：保留空殼避免舊 patch 斷裂；實作以上方 updateMultiplayerHUD 為準
    updateMultiplayerHUD: function () {
        try {
            // no-op
        } catch (_) { }
    }
    ,
    // 生成障礙物：3x3世界中隨機位置，不重疊也不卡住玩家
    /**
     * 生成障礙物
     * 依賴：Obstacle、Utils、圖片鍵 'S1','S2'。
     * 不變式：size=150、clearance=95、minPlayerDist=220、counts={S1:3,S2:3}；請勿更改。
     * 設計：避免與玩家過近、避免與既有障礙重疊。
     */
    spawnObstacles: function () {
        // ✅ 權威伺服器模式：多人進行中時，由 host 上傳 obstacles 到 server，所有端由 state.obstacles 同步
        try {
            if (this.multiplayer && this.multiplayer.enabled && !this.multiplayer.isHost) {
                return;
            }
        } catch (_) { }
        const size = 150;
        const half = size / 2;
        const types = ['S1', 'S2'];
        const counts = { S1: 3, S2: 3 };
        const minPlayerDist = 220;

        const tryPlace = (imageKey) => {
            let attempts = 0;
            while (attempts++ < 100) {
                const x = Utils.randomInt(half, this.worldWidth - half);
                const y = Utils.randomInt(half, this.worldHeight - half);
                if (Utils.distance(x, y, this.player.x, this.player.y) < minPlayerDist) continue;
                let overlap = false;
                for (const o of this.obstacles) {
                    const left = o.x - o.width / 2;
                    const right = o.x + o.width / 2;
                    const top = o.y - o.height / 2;
                    const bottom = o.y + o.height / 2;
                    const cx = Utils.clamp(x, left, right);
                    const cy = Utils.clamp(y, top, bottom);
                    const dx = x - cx;
                    const dy = y - cy;
                    const clearance = 95;
                    if ((dx * dx + dy * dy) <= clearance * clearance) { overlap = true; break; }
                }
                if (overlap) continue;
                this.addObstacle(new Obstacle(x, y, imageKey, size));
                break;
            }
        };

        for (const t of types) {
            for (let i = 0; i < counts[t]; i++) {
                tryPlace(t);
            }
        }

        // ✅ 權威伺服器模式：host 上傳到 server（節省流量、避免 event 通道互打）
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
            if (isSurvivalMode && this.multiplayer && this.multiplayer.enabled && this.multiplayer.isHost) {
                const obstaclesData = this.obstacles.map(obs => ({
                    x: obs.x,
                    y: obs.y,
                    imageKey: obs.imageKey,
                    size: obs.size || size
                }));
                if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function') {
                    window.SurvivalOnlineRuntime.sendToNet({ type: 'obstacles', obstacles: obstaclesData });
                }
                return;
            }
        } catch (_) { }

        // ✅ 舊模式：廣播障礙物生成事件
        try {
            let isSurvivalMode = false;
            let isMultiplayer = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null);
                // ✅ 隔離：只允許「組隊 survival（enabled）」送多人封包
                isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled === true);
            } catch (_) { }

            if (isSurvivalMode && isMultiplayer && typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                const obstaclesData = this.obstacles.map(obs => ({
                    x: obs.x,
                    y: obs.y,
                    imageKey: obs.imageKey,
                    size: obs.size || size
                }));
                window.SurvivalOnlineBroadcastEvent("obstacles_spawn", { obstacles: obstaclesData });
            }
        } catch (e) {
            console.warn("[Game] 廣播障礙物生成事件失敗:", e);
        }
    }
    ,
    // 生成地圖裝飾（各1個S3–S8，隨機不重疊）
    /**
     * 生成地圖裝飾（S3–S8各1）
     * 依賴：圖片鍵 'S3'..'S8' 尺寸規格（specs）、Utils。
     * 不變式：specs 尺寸、margin=12、types=['S3','S4','S5','S6','S7','S8']；請勿更改。
     * 設計：避免與障礙與既有裝飾矩形重疊；允許靠近玩家。
     */
    spawnDecorations: function () {
        // ✅ 權威伺服器模式：多人進行中時，由 host 上傳 decorations 到 server，所有端由 state.decorations 同步
        try {
            if (this.multiplayer && this.multiplayer.enabled && !this.multiplayer.isHost) {
                return;
            }
        } catch (_) { }
        // 第二、第三、第四、第五張地圖（forest、desert、garden、intersection）不生成裝飾物，僅保留 S1/S2 障礙物。
        // 注意：不更改任何顯示文字與其他地圖行為；維持第一張地圖邏輯。
        // 第四張地圖（garden）的 S10-S16 裝飾物邏輯保留在註釋中，供未來其他地圖使用。
        if (this.selectedMap && (this.selectedMap.id === 'forest' || this.selectedMap.id === 'desert' || this.selectedMap.id === 'garden' || this.selectedMap.id === 'intersection')) {
            return; // 跳過裝飾生成
        }

        // 第四張地圖（garden）使用 S10-S16 作為裝飾物（已禁用，保留供未來使用）
        // 注意：以下尺寸為縮小後的目標尺寸（圖片文件可能是原始尺寸，渲染時會縮放到這些尺寸）
        // S10: 原始尺寸縮小50% → 118×98
        // S11: 原始尺寸縮小50% → 116×88
        // S12: 原始尺寸縮小50% → 122×73
        // S13: 原始尺寸縮小30% → 128×91
        // S14: 原始尺寸縮小30% → 133×108
        // S15: 原始尺寸縮小60% → 183×151
        // S16: 原始尺寸縮小60% → 183×151
        // if (this.selectedMap && this.selectedMap.id === 'garden') {
        //     const specs = {
        //         S10: { w: 59, h: 49 },    // 縮小50%（原118×98的50%）
        //         S11: { w: 58, h: 44 },    // 縮小50%（原116×88的50%）
        //         S12: { w: 61, h: 37 },    // 縮小50%（原122×73的50%，四捨五入）
        //         S13: { w: 90, h: 64 },    // 縮小30%（原128×91的30%，128×0.7≈90，91×0.7≈64）
        //         S14: { w: 93, h: 76 },    // 縮小30%（原133×108的30%，133×0.7≈93，108×0.7≈76）
        //         S15: { w: 73, h: 60 },    // 縮小60%（原183×151的60%，183×0.4≈73，151×0.4≈60）
        //         S16: { w: 73, h: 60 }     // 縮小60%（原183×151的60%，183×0.4≈73，151×0.4≈60）
        //     };
        //     const types = ['S10','S11','S12','S13','S14','S15','S16'];
        //     const margin = 12;
        //     const minPlayerDist = 0;
        //     const rectOverlap = (ax, ay, aw, ah, bx, by, bw, bh, m = 0) => {
        //         const halfAw = aw / 2, halfAh = ah / 2, halfBw = bw / 2, halfBh = bh / 2;
        //         return Math.abs(ax - bx) < (halfAw + halfBw + m) && Math.abs(ay - by) < (halfAh + halfBh + m);
        //     };
        //     const tryPlace = (key) => {
        //         const spec = specs[key];
        //         const halfW = spec.w / 2;
        //         const halfH = spec.h / 2;
        //         let attempts = 0;
        //         while (attempts++ < 200) {
        //             const x = Utils.randomInt(halfW, this.worldWidth - halfW);
        //             const y = Utils.randomInt(halfH, this.worldHeight - halfH);
        //             if (minPlayerDist > 0 && Utils.distance(x, y, this.player.x, this.player.y) < minPlayerDist) continue;
        //             let overlap = false;
        //             for (const d of this.decorations) {
        //                 if (rectOverlap(x, y, spec.w, spec.h, d.x, d.y, d.width, d.height, margin)) { overlap = true; break; }
        //             }
        //             if (overlap) continue;
        //             for (const o of this.obstacles) {
        //                 if (rectOverlap(x, y, spec.w, spec.h, o.x, o.y, o.width, o.height, margin)) { overlap = true; break; }
        //             }
        //             if (overlap) continue;
        //             this.decorations.push({ x, y, width: spec.w, height: spec.h, imageKey: key });
        //             break;
        //         }
        //     };
        //     for (const t of types) {
        //         tryPlace(t);
        //     }
        //     return; // 花園地圖裝飾物生成完成，直接返回
        // }

        // 第一張地圖（city）使用 S3-S9 作為裝飾物
        const specs = {
            S3: { w: 228, h: 70 },
            S4: { w: 184, h: 80 },
            S5: { w: 102, h: 70 },
            S6: { w: 200, h: 156 },
            S7: { w: 100, h: 78 },
            S8: { w: 130, h: 101 },
            // 新增：S9（67x80），與 S3~S8 相同邏輯作為地圖背景裝飾
            S9: { w: 67, h: 80 }
        };
        const types = ['S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'];
        const margin = 12;
        const minPlayerDist = 0;
        const rectOverlap = (ax, ay, aw, ah, bx, by, bw, bh, m = 0) => {
            const halfAw = aw / 2, halfAh = ah / 2, halfBw = bw / 2, halfBh = bh / 2;
            return Math.abs(ax - bx) < (halfAw + halfBw + m) && Math.abs(ay - by) < (halfAh + halfBh + m);
        };
        const tryPlace = (key) => {
            const spec = specs[key];
            const halfW = spec.w / 2;
            const halfH = spec.h / 2;
            let attempts = 0;
            while (attempts++ < 200) {
                const x = Utils.randomInt(halfW, this.worldWidth - halfW);
                const y = Utils.randomInt(halfH, this.worldHeight - halfH);
                if (minPlayerDist > 0 && Utils.distance(x, y, this.player.x, this.player.y) < minPlayerDist) continue;
                let overlap = false;
                for (const d of this.decorations) {
                    if (rectOverlap(x, y, spec.w, spec.h, d.x, d.y, d.width, d.height, margin)) { overlap = true; break; }
                }
                if (overlap) continue;
                for (const o of this.obstacles) {
                    if (rectOverlap(x, y, spec.w, spec.h, o.x, o.y, o.width, o.height, margin)) { overlap = true; break; }
                }
                if (overlap) continue;
                this.decorations.push({ x, y, width: spec.w, height: spec.h, imageKey: key });
                break;
            }
        };
        for (const t of types) {
            const count = (t === 'S9') ? 3 : 1; // S9 單獨改為 3 個，其餘維持 1 個
            for (let i = 0; i < count; i++) {
                tryPlace(t);
            }
        }

        // ✅ 權威伺服器模式：host 上傳到 server（節省流量、避免 event 通道互打）
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
            if (isSurvivalMode && this.multiplayer && this.multiplayer.enabled && this.multiplayer.isHost) {
                const decorationsData = this.decorations.map(deco => ({
                    x: deco.x,
                    y: deco.y,
                    width: deco.width,
                    height: deco.height,
                    imageKey: deco.imageKey
                }));
                if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function') {
                    window.SurvivalOnlineRuntime.sendToNet({ type: 'decorations', decorations: decorationsData });
                }
                return;
            }
        } catch (_) { }

        // ✅ 舊模式：廣播地圖裝飾生成事件
        try {
            let isSurvivalMode = false;
            let isMultiplayer = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null);
                // ✅ 隔離：只允許「組隊 survival（enabled）」送多人封包
                isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled === true);
            } catch (_) { }

            if (isSurvivalMode && isMultiplayer && typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                const decorationsData = this.decorations.map(deco => ({
                    x: deco.x,
                    y: deco.y,
                    width: deco.width,
                    height: deco.height,
                    imageKey: deco.imageKey
                }));
                window.SurvivalOnlineBroadcastEvent("decorations_spawn", { decorations: decorationsData });
            }
        } catch (e) {
            console.warn("[Game] 廣播地圖裝飾生成事件失敗:", e);
        }
    }
    ,
    // 金幣：載入
    /**
     * 載入金幣
     * 依賴：localStorage 鍵 'game_coins'。
     * 不變式：鍵名與容錯策略不可更動（失敗時保留現值）。
     */
    loadCoins: function () {
        try {
            const key = 'game_coins';
            const stored = localStorage.getItem(key);
            const n = parseInt(stored, 10);
            if (Number.isFinite(n) && n >= 0) {
                this.coins = n;
            } else {
                // 若無紀錄則維持現值（預設0）
                this.coins = this.coins || 0;
            }
        } catch (_) {
            // 讀取失敗時不影響遊戲
            this.coins = this.coins || 0;
        }

        // 重置路口車輛計時器
        this.intersectionCarTimer = 0;
    },

    // 金幣：存檔
    /**
     * 存檔金幣
     * 依賴：localStorage 鍵 'game_coins'。
     * 不變式：鍵名、整數化與非負處理不可更動；忽略存檔錯誤。
     */
    saveCoins: function () {
        try {
            const key = 'game_coins';
            localStorage.setItem(key, String(Math.max(0, Math.floor(this.coins || 0))));
        } catch (_) {
            // 忽略存檔錯誤
        }
    },

    // 金幣：增加並即時存檔
    /**
     * 增加金幣並立即存檔
     * 不變式：僅接受非負整數增量；立即呼叫 saveCoins；更新 UI（若提供）。
     * 依賴：UI.updateCoinsDisplay（存在時）。
     * ✅ MMORPG 架構：多人模式下共享金幣，所有玩家都獲得相同數量的金幣
     * 注意：金幣通過狀態同步（tick 函數）同步給其他玩家，不需要直接給遠程玩家增加
     */
    addCoins: function (amount) {
        const inc = Math.max(0, Math.floor(amount || 0));
        // ✅ MMORPG 架構：多人模式下共享金幣，所有玩家都獲得相同數量的金幣
        // 金幣通過狀態同步（tick 函數）同步給其他玩家
        this.coins = (this.coins || 0) + inc;

        // 更新金幣收集統計
        this.coinsCollected += inc;
        // 立即存檔以符合自動存檔需求
        try { this.saveCoins(); } catch (_) { }
        // 成就：持有金幣達到 100000 時解鎖（當局記錄，勝利返回時彈窗）
        try {
            if (typeof Achievements !== 'undefined' && Achievements.unlock && Achievements.isUnlocked) {
                if (!Achievements.isUnlocked('COIN_100K') && (this.coins || 0) >= 100000) {
                    Achievements.unlock('COIN_100K');
                }
                // 成就：持有金幣達到 200000 時解鎖引力波（當局記錄，勝利/失敗返回時彈窗）
                if (!Achievements.isUnlocked('COIN_200K') && (this.coins || 0) >= 200000) {
                    Achievements.unlock('COIN_200K');
                }
            }
        } catch (_) { }
        // 觸發金幣變更事件
        try {
            if (typeof EventSystem !== 'undefined' && typeof GameEvents !== 'undefined' && EventSystem.trigger) {
                EventSystem.trigger(GameEvents.COINS_CHANGED, { coins: this.coins });
            }
        } catch (_) { }
        // 更新遊戲介面金幣顯示
        try {
            if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) {
                UI.updateCoinsDisplay(this.coins);
            }
        } catch (_) { }

    },

    // 花園地圖視頻播放邏輯
    _updateGardenVideo: function (deltaTime) {
        if (!this.gardenVideoElement) {
            // 創建視頻元素（如果不存在）
            this._createGardenVideoElement();
        }

        if (!this.gardenVideoElement) return;

        // 如果正在播放，處理淡出邏輯
        if (this.gardenVideoPlaying) {
            const currentTime = Date.now();
            if (this.gardenVideoFadeOutTime > 0 && currentTime >= this.gardenVideoFadeOutTime) {
                // 開始淡出（500ms淡出）
                const fadeOutDuration = 500;
                const elapsed = currentTime - this.gardenVideoFadeOutTime;
                if (elapsed < fadeOutDuration) {
                    const opacity = 1 - (elapsed / fadeOutDuration);
                    this.gardenVideoElement.style.opacity = String(Math.max(0, opacity));
                } else {
                    // 淡出完成，停止播放
                    try {
                        this.gardenVideoElement.pause();
                        this.gardenVideoElement.currentTime = 0;
                        this.gardenVideoElement.style.display = 'none';
                        this.gardenVideoElement.style.opacity = '0';
                    } catch (_) { }
                    this.gardenVideoPlaying = false;
                    this.gardenVideoFadeOutTime = 0;
                    this.gardenVideoTimer = 0; // 重置計時器
                }
            }
            return;
        }

        // 累積時間
        this.gardenVideoTimer += deltaTime;

        // 每30秒觸發一次
        if (this.gardenVideoTimer >= this.gardenVideoInterval) {
            this._playGardenVideo();
            this.gardenVideoTimer = 0;
        }
    },

    // 創建花園視頻元素
    _createGardenVideoElement: function () {
        try {
            const viewport = document.getElementById('viewport') || document.getElementById('game-screen');
            if (!viewport) return;

            // 檢查是否已存在
            let video = document.getElementById('garden-background-video');
            if (!video) {
                video = document.createElement('video');
                video.id = 'garden-background-video';
                video.src = 'assets/videos/background8-2.mp4';
                video.preload = 'auto';
                video.playsinline = true;
                video.loop = false;
                video.muted = false;
                video.style.position = 'absolute';
                video.style.left = '0';
                video.style.top = '0';
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.zIndex = '1000'; // 覆蓋整個遊戲畫面
                video.style.objectFit = 'cover';
                video.style.pointerEvents = 'none';
                video.style.display = 'none';
                video.style.opacity = '0';
                // 使用Screen混合模式去除純黑背景（類似Premiere效果）
                video.style.mixBlendMode = 'screen';
                viewport.appendChild(video);
            }
            this.gardenVideoElement = video;
        } catch (e) {
            console.warn('創建花園視頻元素失敗:', e);
        }
    },

    // 播放花園視頻
    _playGardenVideo: function () {
        if (!this.gardenVideoElement) return;

        try {
            // 重置視頻
            this.gardenVideoElement.currentTime = 0;
            this.gardenVideoElement.style.display = 'block';
            this.gardenVideoElement.style.opacity = '0';

            // 淡入（300ms）
            const fadeInDuration = 300;
            requestAnimationFrame(() => {
                this.gardenVideoElement.style.transition = `opacity ${fadeInDuration}ms ease-in-out`;
                this.gardenVideoElement.style.opacity = '1';
            });

            // 播放視頻
            const playPromise = this.gardenVideoElement.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch((error) => {
                    console.warn('播放花園視頻失敗:', error);
                    // 如果播放失敗，重置狀態
                    this.gardenVideoElement.style.display = 'none';
                    this.gardenVideoElement.style.opacity = '0';
                    this.gardenVideoPlaying = false;
                });
            }

            this.gardenVideoPlaying = true;
            // 5秒後開始淡出
            this.gardenVideoFadeOutTime = Date.now() + 5000;
        } catch (e) {
            console.warn('播放花園視頻時出錯:', e);
            this.gardenVideoPlaying = false;
        }
    },

    // 繪製遠程玩家血條
    _drawRemotePlayerHealthBar: function (p) {
        if (!this.ctx || !p) return;

        // 注意：畫布已經被 translate(-cameraOffsetX, -cameraOffsetY) 平移了
        // 所以這裡直接使用世界座標即可，不需要再減去相機位置
        // 血條位置：角色上方
        const barWidth = 40;
        const barHeight = 4;
        // 使用視覺尺寸計算位置（考慮 VISUAL_SCALE）
        const visualScale = (CONFIG && CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') ? CONFIG.PLAYER.VISUAL_SCALE : 1.0;
        const baseSize = Math.max(p.width || 32, p.height || 32);
        const visualSize = baseSize * visualScale;
        const barOffsetY = -visualSize / 2 - 8; // 角色上方8像素
        const barX = p.x - barWidth / 2;
        const barY = p.y + barOffsetY;

        // 獲取血量（從快照或狀態消息中）
        const isDead = (typeof p._isDead === "boolean") ? p._isDead : false;
        const health = (typeof p.health === "number") ? p.health : 100;
        const maxHealth = (typeof p.maxHealth === "number") ? p.maxHealth : 100;
        const healthPercent = isDead ? 0 : (health / maxHealth);
        const resurrectionProgress = (typeof p._resurrectionProgress === "number") ? p._resurrectionProgress : 0;

        // 繪製血條背景（深紅色）
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

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
            this.ctx.fillStyle = healthColor;
            this.ctx.fillRect(barX, barY, healthWidth, barHeight);
        }

        // 如果正在復活，繪製復活進度條（在血條下方）
        if (isDead && resurrectionProgress > 0) {
            const resBarHeight = 3;
            const resBarY = barY + barHeight + 1;
            const resBarWidth = barWidth * (resurrectionProgress / 100);

            // 復活進度條背景
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            this.ctx.fillRect(barX - 1, resBarY - 1, barWidth + 2, resBarHeight + 2);

            // 復活進度條（藍色）
            this.ctx.fillStyle = '#00aaff';
            this.ctx.fillRect(barX, resBarY, resBarWidth, resBarHeight);
        }
    }
};
