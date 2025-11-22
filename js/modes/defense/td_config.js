// 防禦塔TD遊戲配置
// 包含所有遊戲平衡性參數和設定

console.log('TD_CONFIG文件正在加載...');

const TD_CONFIG = {
    // 遊戲基本設定
    GAME: {
        MAX_WAVES: 30,                    // 最大波次
        WAVE_PREP_TIME: 60,               // 波次準備時間（秒，改為 1 分鐘）
        WAVE_TIME_LIMIT: 90,              // 波次時間限制（秒）
        BASE_REWARD: 100,                 // 基礎通關獎勵
        REWARD_MULTIPLIER: 1.2,           // 獎勵倍率（每波）
    },

    // 地圖設定 - 擴展到3x3屏幕大小以匹配生存模式
    MAP: {
        GRID_SIZE: 80,                     // 每個格子大小（像素）
        GRID_COLS: 48,                     // 地圖列數 (16 * 3)
        GRID_ROWS: 27,                     // 地圖行數 (9 * 3)
        WIDTH: 3840,                       // 地圖寬度 (1280 * 3)
        HEIGHT: 2160,                      // 地圖高度 (720 * 3)
        // 九宮格配置（3x3區域）
        ZONES: {
            rows: 3,
            cols: 3,
            width: 1280,  // 3840/3
            height: 720   // 2160/3
        }
    },

    // 玩家設定 - 大幅提升速度以改善遊戲體驗
    PLAYER: {
        SIZE: 32,
        SPEED: 240,                        // 大幅提升移動速度從8到240（每格0.33秒）
        DAMAGE: 25,                        // 玩家基礎攻擊力
        ATTACK_RANGE: 150,                 // 攻擊範圍（放大 1.5 倍）
        ATTACK_COOLDOWN: 500,              // 攻擊冷卻500毫秒
        BUILD_RANGE: 120,                  // 建造範圍120
        MOVE_TO_BUILD_RANGE: 30,           // 建造距離30
    },

    // 主堡設定 - 將主堡移至更明顯的位置
    BASE: {
        X: 1920,                           // 主堡X座標（中心）- 移至3x3地圖中心
        Y: 1080,                           // 主堡Y座標（中心）- 移至3x3地圖中心
        SIZE: 128,                         // 增加主堡尺寸從64到128以提高可見度
        MAX_HEALTH: 100,                   // 主堡最大生命值
        // 主堡外觀（使用更明顯的素材）
        SPRITE: 'assets/images/Nexus.png'
    },

    // 音效配置（僅映射既有 AudioManager 聲音名稱，不改動其載入邏輯）
    SOUNDS: {
        TOWER_BUILD: 'button_click2',
        TOWER_UPGRADE: 'level_up2',
        TOWER_SELL: 'money',
        ENEMY_DEATH: 'enemy_death',
        ENEMY_REACH_BASE: 'enemy_death',
        WAVE_START: 'achievements',
        WAVE_COMPLETE: null,
        GAME_WIN: null,
        GAME_LOSE: null,
        ARROW_SHOOT: 'dagger_shoot',
        // 元素塔使用匕首射擊音效（dagger_shoot.mp3）
        MAGIC_SHOOT: 'dagger_shoot',
        // 冰凍塔專用音效，對應 assets/audio/ICE.mp3（由 audio.js 載入名稱 'ICE'）
        ICE_SHOOT: 'ICE',
        PLAYER_ATTACK: 'knife'
    },

    // 資源設定 - 修正資源名稱以符合遊戲風格
    RESOURCES: {
        STARTING_GOLD: 800,                // 起始金幣（消波塊）
        GOLD_PER_WAVE: 150,                // 每波基礎獎勵
        GOLD_KILL_MULTIPLIER: 1.1,         // 擊殺獎勵倍率
        RESOURCE_NAME: '消波塊',            // 資源顯示名稱
    },

    // 防禦塔設定
    TOWERS: {
        // 基礎箭塔 - 專業命名
        ARROW: {
            // 名稱改為「洛可洛斯特」
            name: '洛可洛斯特',
            cost: 100,
            buildTime: 3,                   // 建造時間（秒）
            damage: 30,
            range: 240,
            fireRate: 1000,                // 射速（毫秒）
            projectileSpeed: 600,
            projectileType: 'arrow',
            // 使用 sniper.png 作為狙擊塔本體圖片
            sprite: 'assets/images/sniper.png',
            // 升級 5 次（共 6 個等級），傷害與射程逐步提升，射速略微加快
            upgrades: [
                { cost: 150, damage: 45, range: 280, fireRate: 800 },
                { cost: 250, damage: 70, range: 320, fireRate: 600 },
                { cost: 400, damage: 95, range: 360, fireRate: 500 },
                { cost: 600, damage: 120, range: 400, fireRate: 450 },
                { cost: 900, damage: 150, range: 450, fireRate: 400 }
            ]
        },
        // 魔法塔 - 專業命名
        MAGIC: {
            // 名稱改為「森森鈴蘭」
            name: '森森鈴蘭',
            cost: 200,
            buildTime: 5,
            damage: 50,
            range: 200,
            fireRate: 1500,
            projectileSpeed: 500,
            projectileType: 'magic',
            sprite: 'assets/images/fireball.png',
            splashRadius: 40,              // 濺射範圍
            upgrades: [
                { cost: 300, damage: 80, range: 240, fireRate: 1200, splashRadius: 50 },
                { cost: 500, damage: 120, range: 280, fireRate: 1000, splashRadius: 60 },
                { cost: 700, damage: 160, range: 320, fireRate: 900, splashRadius: 70 },
                { cost: 900, damage: 210, range: 360, fireRate: 800, splashRadius: 80 },
                { cost: 1200, damage: 270, range: 400, fireRate: 700, splashRadius: 90 }
            ]
        },
        // 減速塔 - 專業命名
        SLOW: {
            // 名稱改為「瑪格麗特」
            name: '瑪格麗特',
            cost: 150,
            buildTime: 4,
            damage: 20,
            range: 200,
            fireRate: 800,
            projectileSpeed: 450,
            projectileType: 'ice',
            // 塔本體仍使用靜態 PNG，冰凍特效交由 ICE.gif 疊加處理
            sprite: 'assets/images/lightning.png',
            slowEffect: 0.5,                // 減速效果（50%）
            slowDuration: 1000,             // 減速持續時間（1秒）
            upgrades: [
                { cost: 200, damage: 30, range: 240, fireRate: 700, slowEffect: 0.5, slowDuration: 1500 },
                { cost: 350, damage: 45, range: 280, fireRate: 600, slowEffect: 0.5, slowDuration: 2000 },
                { cost: 500, damage: 60, range: 320, fireRate: 550, slowEffect: 0.55, slowDuration: 2200 },
                { cost: 700, damage: 80, range: 360, fireRate: 500, slowEffect: 0.6, slowDuration: 2500 },
                { cost: 900, damage: 100, range: 400, fireRate: 450, slowEffect: 0.6, slowDuration: 3000 }
            ]
        }
    },

    // 敵人設定 - 提升移動速度
    ENEMIES: {
        // 普通殭屍（防禦模式統一尺寸 30）
        ZOMBIE: {
            name: '殭屍',
            hp: 100,
            speed: 200,
            reward: 10,
            size: 30,
            sprite: 'assets/images/zombie.png'
        },
        // 快速殭屍（防禦模式統一尺寸 30）
        FAST_ZOMBIE: {
            name: '快速殭屍',
            hp: 60,
            speed: 230,
            reward: 15,
            size: 30,
            sprite: 'assets/images/zombie2.png'
        },
        // 坦克殭屍（防禦模式統一尺寸 30）
        TANK_ZOMBIE: {
            name: '坦克殭屍',
            hp: 300,
            speed: 180,
            reward: 25,
            size: 30,
            sprite: 'assets/images/zombie3.png'
        },
        // BOSS殭屍
        BOSS_ZOMBIE: {
            name: 'BOSS殭屍',
            hp: 1000,
            speed: 190,
            reward: 100,
            size: 48,
            sprite: 'assets/images/mini_boss.png'
        }
    },

    // 波次設定
    // 設計原則：第1波50個敵人，第30波500個敵人（10倍），2-29波漸進增長
    // 使用平滑增長曲線：總數 = 50 + (wave - 1) * 15.52（約）
    WAVES: [
        // 第1-5波：簡單（總數：50, 66, 81, 97, 112）
        { enemies: [{ type: 'ZOMBIE', count: 50, interval: 1000 }], reward: 100 },
        { enemies: [
            { type: 'ZOMBIE', count: 45, interval: 900 },
            { type: 'FAST_ZOMBIE', count: 21, interval: 600 }
        ], reward: 120 },
        { enemies: [
            { type: 'ZOMBIE', count: 50, interval: 800 },
            { type: 'FAST_ZOMBIE', count: 31, interval: 500 }
        ], reward: 140 },
        { enemies: [
            { type: 'ZOMBIE', count: 60, interval: 800 },
            { type: 'FAST_ZOMBIE', count: 37, interval: 400 }
        ], reward: 160 },
        { enemies: [
            { type: 'ZOMBIE', count: 70, interval: 700 },
            { type: 'FAST_ZOMBIE', count: 42, interval: 350 }
        ], reward: 180 },
        
        // 第6-10波：中等（總數：128, 143, 159, 174, 190）
        { enemies: [
            { type: 'ZOMBIE', count: 80, interval: 600 },
            { type: 'FAST_ZOMBIE', count: 40, interval: 300 },
            { type: 'TANK_ZOMBIE', count: 8, interval: 2000 }
        ], reward: 200 },
        { enemies: [
            { type: 'ZOMBIE', count: 90, interval: 500 },
            { type: 'TANK_ZOMBIE', count: 15, interval: 1500 },
            { type: 'FAST_ZOMBIE', count: 38, interval: 250 }
        ], reward: 220 },
        { enemies: [
            { type: 'FAST_ZOMBIE', count: 80, interval: 400 },
            { type: 'TANK_ZOMBIE', count: 20, interval: 1200 },
            { type: 'ZOMBIE', count: 59, interval: 400 }
        ], reward: 240 },
        { enemies: [
            { type: 'ZOMBIE', count: 100, interval: 400 },
            { type: 'FAST_ZOMBIE', count: 60, interval: 250 },
            { type: 'TANK_ZOMBIE', count: 14, interval: 1000 }
        ], reward: 260 },
        { enemies: [
            { type: 'ZOMBIE', count: 110, interval: 350 },
            { type: 'FAST_ZOMBIE', count: 65, interval: 200 },
            { type: 'TANK_ZOMBIE', count: 15, interval: 800 }
        ], reward: 280 },
        
        // 第11-15波：困難（總數：205, 221, 236, 252, 267）
        { enemies: [
            { type: 'ZOMBIE', count: 120, interval: 300 },
            { type: 'FAST_ZOMBIE', count: 70, interval: 150 },
            { type: 'TANK_ZOMBIE', count: 15, interval: 600 }
        ], reward: 300 },
        { enemies: [
            { type: 'FAST_ZOMBIE', count: 120, interval: 180 },
            { type: 'TANK_ZOMBIE', count: 30, interval: 500 },
            { type: 'BOSS_ZOMBIE', count: 3, interval: 0 },
            { type: 'ZOMBIE', count: 68, interval: 250 }
        ], reward: 320 },
        { enemies: [
            { type: 'ZOMBIE', count: 130, interval: 250 },
            { type: 'TANK_ZOMBIE', count: 40, interval: 400 },
            { type: 'BOSS_ZOMBIE', count: 6, interval: 5000 },
            { type: 'FAST_ZOMBIE', count: 60, interval: 150 }
        ], reward: 340 },
        { enemies: [
            { type: 'FAST_ZOMBIE', count: 130, interval: 150 },
            { type: 'TANK_ZOMBIE', count: 50, interval: 350 },
            { type: 'BOSS_ZOMBIE', count: 6, interval: 4000 },
            { type: 'ZOMBIE', count: 66, interval: 200 }
        ], reward: 360 },
        { enemies: [
            { type: 'ZOMBIE', count: 140, interval: 200 },
            { type: 'FAST_ZOMBIE', count: 100, interval: 100 },
            { type: 'TANK_ZOMBIE', count: 20, interval: 300 },
            { type: 'BOSS_ZOMBIE', count: 7, interval: 3000 }
        ], reward: 380 },
        
        // 第16-20波：噩夢（總數：283, 298, 314, 329, 345）
        { enemies: [
            { type: 'FAST_ZOMBIE', count: 150, interval: 100 },
            { type: 'TANK_ZOMBIE', count: 70, interval: 250 },
            { type: 'BOSS_ZOMBIE', count: 10, interval: 2500 },
            { type: 'ZOMBIE', count: 53, interval: 120 }
        ], reward: 400 },
        { enemies: [
            { type: 'ZOMBIE', count: 160, interval: 150 },
            { type: 'TANK_ZOMBIE', count: 75, interval: 200 },
            { type: 'BOSS_ZOMBIE', count: 10, interval: 2000 },
            { type: 'FAST_ZOMBIE', count: 53, interval: 80 }
        ], reward: 420 },
        { enemies: [
            { type: 'FAST_ZOMBIE', count: 170, interval: 80 },
            { type: 'TANK_ZOMBIE', count: 85, interval: 180 },
            { type: 'BOSS_ZOMBIE', count: 12, interval: 1800 },
            { type: 'ZOMBIE', count: 47, interval: 100 }
        ], reward: 440 },
        { enemies: [
            { type: 'ZOMBIE', count: 180, interval: 120 },
            { type: 'FAST_ZOMBIE', count: 100, interval: 60 },
            { type: 'TANK_ZOMBIE', count: 30, interval: 150 },
            { type: 'BOSS_ZOMBIE', count: 19, interval: 1500 }
        ], reward: 460 },
        { enemies: [
            { type: 'ZOMBIE', count: 190, interval: 100 },
            { type: 'FAST_ZOMBIE', count: 110, interval: 50 },
            { type: 'TANK_ZOMBIE', count: 35, interval: 120 },
            { type: 'BOSS_ZOMBIE', count: 10, interval: 1200 }
        ], reward: 480 },
        
        // 第21-25波：地獄（總數：360, 376, 391, 407, 422）
        { enemies: [
            { type: 'FAST_ZOMBIE', count: 200, interval: 40 },
            { type: 'TANK_ZOMBIE', count: 100, interval: 100 },
            { type: 'BOSS_ZOMBIE', count: 20, interval: 1000 },
            { type: 'ZOMBIE', count: 40, interval: 60 }
        ], reward: 500 },
        { enemies: [
            { type: 'ZOMBIE', count: 200, interval: 80 },
            { type: 'TANK_ZOMBIE', count: 100, interval: 80 },
            { type: 'BOSS_ZOMBIE', count: 20, interval: 800 },
            { type: 'FAST_ZOMBIE', count: 56, interval: 35 }
        ], reward: 520 },
        { enemies: [
            { type: 'FAST_ZOMBIE', count: 210, interval: 35 },
            { type: 'TANK_ZOMBIE', count: 110, interval: 70 },
            { type: 'BOSS_ZOMBIE', count: 24, interval: 700 },
            { type: 'ZOMBIE', count: 47, interval: 50 }
        ], reward: 540 },
        { enemies: [
            { type: 'ZOMBIE', count: 220, interval: 60 },
            { type: 'FAST_ZOMBIE', count: 130, interval: 30 },
            { type: 'TANK_ZOMBIE', count: 40, interval: 60 },
            { type: 'BOSS_ZOMBIE', count: 17, interval: 600 }
        ], reward: 560 },
        { enemies: [
            { type: 'ZOMBIE', count: 230, interval: 50 },
            { type: 'FAST_ZOMBIE', count: 140, interval: 25 },
            { type: 'TANK_ZOMBIE', count: 45, interval: 55 },
            { type: 'BOSS_ZOMBIE', count: 7, interval: 500 }
        ], reward: 580 },
        
        // 第26-30波：末日（總數：438, 453, 469, 484, 500）
        { enemies: [
            { type: 'FAST_ZOMBIE', count: 250, interval: 30 },
            { type: 'TANK_ZOMBIE', count: 125, interval: 50 },
            { type: 'BOSS_ZOMBIE', count: 30, interval: 400 },
            { type: 'ZOMBIE', count: 33, interval: 35 }
        ], reward: 600 },
        { enemies: [
            { type: 'ZOMBIE', count: 250, interval: 40 },
            { type: 'TANK_ZOMBIE', count: 130, interval: 45 },
            { type: 'BOSS_ZOMBIE', count: 30, interval: 350 },
            { type: 'FAST_ZOMBIE', count: 43, interval: 25 }
        ], reward: 620 },
        { enemies: [
            { type: 'FAST_ZOMBIE', count: 260, interval: 25 },
            { type: 'TANK_ZOMBIE', count: 140, interval: 40 },
            { type: 'BOSS_ZOMBIE', count: 35, interval: 300 },
            { type: 'ZOMBIE', count: 34, interval: 30 }
        ], reward: 640 },
        { enemies: [
            { type: 'ZOMBIE', count: 270, interval: 30 },
            { type: 'FAST_ZOMBIE', count: 150, interval: 20 },
            { type: 'TANK_ZOMBIE', count: 50, interval: 35 },
            { type: 'BOSS_ZOMBIE', count: 14, interval: 250 }
        ], reward: 660 },
        { enemies: [
            { type: 'ZOMBIE', count: 280, interval: 25 },
            { type: 'FAST_ZOMBIE', count: 150, interval: 15 },
            { type: 'TANK_ZOMBIE', count: 55, interval: 30 },
            { type: 'BOSS_ZOMBIE', count: 15, interval: 200 }
        ], reward: 1000 }  // 最終波特殊獎勵（總數：500，第1波的10倍）
    ]
};

// 防禦塔TD遊戲狀態管理
class TDGameState {
    // 獲取防禦模式初始消波塊加成（從天賦系統）
    static getDefenseGoldBonus() {
        try {
            if (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel) {
                const level = TalentSystem.getTalentLevel('defense_gold_boost');
                if (level > 0 && TalentSystem.tieredTalents && TalentSystem.tieredTalents.defense_gold_boost) {
                    const cfg = TalentSystem.tieredTalents.defense_gold_boost;
                    if (cfg.levels && cfg.levels[level - 1]) {
                        return cfg.levels[level - 1].bonus || 0;
                    }
                }
            }
        } catch (e) {
            console.warn('讀取防禦模式消波塊加成失敗:', e);
        }
        return 0;
    }
    
    constructor() {
        const baseGold = TD_CONFIG.RESOURCES.STARTING_GOLD;
        const talentBonus = TDGameState.getDefenseGoldBonus();
        this.gold = baseGold + talentBonus;
        this.wave = 0;
        this.baseHealth = TD_CONFIG.BASE.MAX_HEALTH;
        this.maxBaseHealth = TD_CONFIG.BASE.MAX_HEALTH;
        this.score = 0;
        this.isWaveActive = false;
        this.waveTimer = 0;
        this.wavePrepTimer = 0;
        this.enemiesKilled = 0;
        this.towersBuilt = 0;
        this.isGameOver = false;
        this.isGameWon = false;
        this.isPaused = false;
        
        // 波次相關
        this.currentWaveEnemies = [];
        this.waveSpawnQueue = [];
        this.lastSpawnTime = 0;
        this.waveStartTime = 0; // 波次實際開始生成敵人的時間（準備時間結束後）
        this.waveSpawnElapsed = 0; // 自開始生成敵人以來經過的時間（毫秒，暫停時不累計）
        
        // 建造相關
        this.selectedTowerType = null;
        this.buildMode = false;
        this.buildPreviewPos = null;
        
        // 統計
        this.totalGoldEarned = 0;
        this.totalGoldSpent = 0;
        this.enemyGoldEarned = 0; // 消滅敵人獲得的金幣累積
        this.waveTimes = [];
    }
    
    // 金幣操作
    addGold(amount) {
        this.gold += amount;
        this.totalGoldEarned += amount;
    }
    
    // 消滅敵人獲得的金幣（用於結算統計）
    addEnemyGold(amount) {
        this.gold += amount;
        this.totalGoldEarned += amount;
        this.enemyGoldEarned += amount;
    }
    
    spendGold(amount) {
        if (this.gold >= amount) {
            this.gold -= amount;
            this.totalGoldSpent += amount;
            return true;
        }
        return false;
    }
    
    // 主堡傷害
    damageBase(amount) {
        this.baseHealth = Math.max(0, this.baseHealth - amount);
        if (this.baseHealth <= 0) {
            this.isGameOver = true;
        }
    }
    
    // 修復主堡
    repairBase(amount) {
        this.baseHealth = Math.min(this.maxBaseHealth, this.baseHealth + amount);
    }
    
    // 開始新波次
    startWave(waveIndex) {
        this.wave = waveIndex;
        this.isWaveActive = true;
        this.waveTimer = 0;
        this.wavePrepTimer = TD_CONFIG.GAME.WAVE_PREP_TIME;
        this.currentWaveEnemies = [];
        this.waveSpawnQueue = this.generateWaveSpawnQueue(waveIndex);
        this.lastSpawnTime = 0;
        this.waveStartTime = 0; // 將在準備時間結束時設置
        this.waveSpawnElapsed = 0; // 每一波從 0 開始累計生成時間，避免延續前一波的進度
    }
    
    // 生成波次生成隊列
    // 設計原則：
    // 1. 整個波次的所有敵人（不論幾種）必須在 10 秒內全部生成完畢
    // 2. 敵人平均分配到 4 條路徑（依照整體序號輪流分配 pathIndex）
    // 3. 多種怪物類型交錯出現，而不是先把某一種全部生成完再換下一種
    generateWaveSpawnQueue(waveIndex) {
        const waveConfig = TD_CONFIG.WAVES[waveIndex];
        const SPAWN_DURATION = 10000; // 10秒 = 10000毫秒
        const NUM_PATHS = 4; // 4條路徑
        
        // 計算總敵人數量
        let totalEnemies = 0;
        const enemyGroups = waveConfig.enemies || [];
        enemyGroups.forEach(group => {
            totalEnemies += group.count || 0;
        });
        if (totalEnemies <= 0) return [];
        
        // 每一個「全體序號」對應一個固定的生成時間
        const slotInterval = SPAWN_DURATION / totalEnemies; // 每隻敵人佔用的時間槽寬度（毫秒）
        
        // 逐一分配敵人：在所有敵人之間輪流取用各種類型，確保多種怪物交錯出現
        const remaining = enemyGroups.map(g => g.count || 0);
        let groupIndex = 0;
        const queue = [];
        
        for (let globalIndex = 0; globalIndex < totalEnemies; globalIndex++) {
            // 從目前 groupIndex 開始，尋找下一個還有剩餘的敵人類型
            let attempts = enemyGroups.length;
            while (attempts > 0 && remaining[groupIndex] <= 0) {
                groupIndex = (groupIndex + 1) % enemyGroups.length;
                attempts--;
            }
            if (attempts === 0) {
                break; // 安全守護：理論上不會發生
            }
            
            const group = enemyGroups[groupIndex];
            const enemyType = group.type;
            remaining[groupIndex]--;
            
            const pathIndex = globalIndex % NUM_PATHS;              // 4 條路輪流分配
            const spawnTime = globalIndex * slotInterval;           // 線性平均分佈在 0~10000ms 之間
            
            queue.push({
                type: enemyType,
                pathIndex,
                spawnTime,
                spawned: false
            });
            
            // 下一次從下一種怪開始輪詢，確保類型交錯
            groupIndex = (groupIndex + 1) % enemyGroups.length;
        }
        
        // 按生成時間排序（理論上已按時間順序加入，但保險再排一次）
        return queue.sort((a, b) => a.spawnTime - b.spawnTime);
    }
    
    // 波次完成
    completeWave() {
        this.isWaveActive = false;
        this.addGold(TD_CONFIG.WAVES[this.wave].reward);
        this.score += TD_CONFIG.WAVES[this.wave].reward;
        
        if (this.wave >= TD_CONFIG.GAME.MAX_WAVES - 1) {
            this.isGameWon = true;
        } else {
            this.wave += 1;
        }
    }
    
    // 重置遊戲
    reset() {
        const baseGold = TD_CONFIG.RESOURCES.STARTING_GOLD;
        const talentBonus = TDGameState.getDefenseGoldBonus();
        this.gold = baseGold + talentBonus;
        this.wave = 0;
        this.baseHealth = TD_CONFIG.BASE.MAX_HEALTH;
        this.maxBaseHealth = TD_CONFIG.BASE.MAX_HEALTH;
        this.score = 0;
        this.isWaveActive = false;
        this.waveTimer = 0;
        this.wavePrepTimer = 0;
        this.enemiesKilled = 0;
        this.towersBuilt = 0;
        this.isGameOver = false;
        this.isGameWon = false;
        this.currentWaveEnemies = [];
        this.waveSpawnQueue = [];
        this.lastSpawnTime = 0;
        this.waveStartTime = 0;
        this.waveSpawnElapsed = 0;
        this.selectedTowerType = null;
        this.buildMode = false;
        this.buildPreviewPos = null;
        this.totalGoldEarned = 0;
        this.totalGoldSpent = 0;
        this.enemyGoldEarned = 0;
        this.waveTimes = [];
    }
}

// 導出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TD_CONFIG, TDGameState };
} else {
    window.TD_CONFIG = TD_CONFIG;
    window.TDGameState = TDGameState;
}
