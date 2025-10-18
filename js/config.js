// 遊戲配置
const CONFIG = {
    // 遊戲畫布設置
    CANVAS_WIDTH: 1280,
    CANVAS_HEIGHT: 720,

    // 世界與背景配置（用於滾動背景與邊界）
    WORLD: {
        GRID_X: 3, // 水平方向3格（共9格）
        GRID_Y: 3, // 垂直方向3格
        BORDER_COLOR: '#000',
        BORDER_ALPHA: 0.8
    },
    
    // 玩家設置
    PLAYER: {
        SPEED: 3, // 降低移動速度
        MAX_HEALTH: 200,
        SIZE: 32,
        COLLISION_RADIUS: 16
    },
    
    // 武器設置
    WEAPONS: {
        SING: {
            NAME: "唱歌",
            DAMAGE: 0,
            COOLDOWN: 5000,
            PROJECTILE_SPEED: 0,
            PROJECTILE_SIZE: 0,
            DURATION: 1000,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復1HP並展示音符特效1秒" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復2HP並展示音符特效1秒" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復3HP並展示音符特效1秒" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復4HP並展示音符特效1秒" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復5HP並展示音符特效1秒" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復6HP並展示音符特效1秒" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復7HP並展示音符特效1秒" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復8HP並展示音符特效1秒" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復9HP並展示音符特效1秒" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復10HP並展示音符特效1秒" }
            ]
        },
        DAGGER: {
            NAME: "應援棒",
            DAMAGE: 10,
            COOLDOWN: 1000, // 毫秒
            PROJECTILE_SPEED: 8,
            PROJECTILE_SIZE: 20,
            PROJECTILE_SIZE_PER_LEVEL: 3,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每秒發射1支應援棒" },
                { COUNT: 2, DESCRIPTION: "每秒發射2支應援棒" },
                { COUNT: 3, DESCRIPTION: "每秒發射3支應援棒" },
                { COUNT: 4, DESCRIPTION: "每秒發射4支應援棒" },
                { COUNT: 5, DESCRIPTION: "每秒發射5支應援棒" },
                { COUNT: 6, DESCRIPTION: "每秒發射6支應援棒" },
                { COUNT: 7, DESCRIPTION: "每秒發射7支應援棒" },
                { COUNT: 8, DESCRIPTION: "每秒發射8支應援棒" },
                { COUNT: 9, DESCRIPTION: "每秒發射9支應援棒" },
                { COUNT: 10, DESCRIPTION: "每秒發射10支應援棒" }
            ]
        },
        FIREBALL: {
            NAME: "紳士綿羊",
            DAMAGE: 20,
            COOLDOWN: 2000,
            PROJECTILE_SPEED: 6,
            PROJECTILE_SIZE: 28,
            PROJECTILE_SIZE_PER_LEVEL: 4,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每2秒發射1隻紳士綿羊" },
                { COUNT: 2, DESCRIPTION: "每2秒發射2隻紳士綿羊" },
                { COUNT: 3, DESCRIPTION: "每2秒發射3隻紳士綿羊" },
                { COUNT: 4, DESCRIPTION: "每2秒發射4隻紳士綿羊" },
                { COUNT: 5, DESCRIPTION: "每2秒發射5隻紳士綿羊" },
                { COUNT: 6, DESCRIPTION: "每2秒發射6隻紳士綿羊" },
                { COUNT: 7, DESCRIPTION: "每2秒發射7隻紳士綿羊" },
                { COUNT: 8, DESCRIPTION: "每2秒發射8隻紳士綿羊" },
                { COUNT: 9, DESCRIPTION: "每2秒發射9隻紳士綿羊" },
                { COUNT: 10, DESCRIPTION: "每2秒發射10隻紳士綿羊" }
            ]
        },
        LIGHTNING: {
            NAME: "追蹤綿羊",
            DAMAGE: 15,
            COOLDOWN: 1500,
            PROJECTILE_SPEED: 10,
            PROJECTILE_SIZE: 24,
            PROJECTILE_SIZE_PER_LEVEL: 3,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每1.5秒發射1道追蹤綿羊" },
                { COUNT: 2, DESCRIPTION: "每1.5秒發射2道追蹤綿羊" },
                { COUNT: 3, DESCRIPTION: "每1.5秒發射3道追蹤綿羊" },
                { COUNT: 4, DESCRIPTION: "每1.5秒發射4道追蹤綿羊" },
                { COUNT: 5, DESCRIPTION: "每1.5秒發射5道追蹤綿羊" },
                { COUNT: 6, DESCRIPTION: "每1.5秒發射6道追蹤綿羊" },
                { COUNT: 7, DESCRIPTION: "每1.5秒發射7道追蹤綿羊" },
                { COUNT: 8, DESCRIPTION: "每1.5秒發射8道追蹤綿羊" },
                { COUNT: 9, DESCRIPTION: "每1.5秒發射9道追蹤綿羊" },
                { COUNT: 10, DESCRIPTION: "每1.5秒發射10道追蹤綿羊" }
            ]
        },
        ORBIT: {
            NAME: "綿羊護體",
            DAMAGE: 10,
            COOLDOWN: 4000,
            PROJECTILE_SPEED: 0,
            PROJECTILE_SIZE: 20,
            PROJECTILE_SIZE_PER_LEVEL: 2,
            ORBIT_RADIUS: 60,
            ORBIT_RADIUS_PER_LEVEL: 10,
            DURATION: 3000, // 3秒持續
            ANGULAR_SPEED: 6.283, // 約1圈/秒
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "生成1個綿羊護體環繞3秒" },
                { COUNT: 2, DESCRIPTION: "生成2個綿羊護體環繞3秒" },
                { COUNT: 3, DESCRIPTION: "生成3個綿羊護體環繞3秒" },
                { COUNT: 4, DESCRIPTION: "生成4個綿羊護體環繞3秒" },
                { COUNT: 5, DESCRIPTION: "生成5個綿羊護體環繞3秒" },
                { COUNT: 6, DESCRIPTION: "生成6個綿羊護體環繞3秒" },
                { COUNT: 7, DESCRIPTION: "生成7個綿羊護體環繞3秒" },
                { COUNT: 8, DESCRIPTION: "生成8個綿羊護體環繞3秒" },
                { COUNT: 9, DESCRIPTION: "生成9個綿羊護體環繞3秒" },
                { COUNT: 10, DESCRIPTION: "生成10個綿羊護體環繞3秒" }
            ]
        },
        LASER: {
            NAME: "雷射",
            DAMAGE: 12,
            COOLDOWN: 5000, // 5秒一次（持續2秒，空檔3秒）
            DURATION: 2000,
            BEAM_WIDTH_BASE: 8,
            BEAM_WIDTH_PER_LEVEL: 2,
            TICK_INTERVAL_MS: 120, // 參考旋球的持續傷害間隔
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每5秒釋放雷射，持續2秒（粗度+0px）" },
                { COUNT: 1, DESCRIPTION: "雷射粗度提升（+2px）" },
                { COUNT: 1, DESCRIPTION: "雷射粗度提升（+4px）" },
                { COUNT: 1, DESCRIPTION: "雷射粗度提升（+6px）" },
                { COUNT: 1, DESCRIPTION: "雷射粗度提升（+8px）" },
                { COUNT: 1, DESCRIPTION: "雷射粗度提升（+10px）" },
                { COUNT: 1, DESCRIPTION: "雷射粗度提升（+12px）" },
                { COUNT: 1, DESCRIPTION: "雷射粗度提升（+14px）" },
                { COUNT: 1, DESCRIPTION: "雷射粗度提升（+16px）" },
                { COUNT: 1, DESCRIPTION: "雷射粗度提升（+18px）" }
            ]
        }
    },

    // 能量與大招設置
    ENERGY: {
        MAX: 100,
        REGEN_PER_SEC: 1
    },
        ULTIMATE: {
            DURATION_MS: 15000,
            PLAYER_SIZE_MULTIPLIER: 2.5, // 變身體型再放大一些
            IMAGE_KEY: 'playerN',
            ULTIMATE_WEAPONS: ['DAGGER', 'FIREBALL', 'LIGHTNING', 'ORBIT', 'LASER', 'SING'],
            ULTIMATE_LEVEL: 10
        },

    // 選角列表（目前僅1名角色）
    CHARACTERS: [
        { id: 'margaret', name: '瑪格麗特·諾爾絲', hpMultiplier: 1.0, speedMultiplier: 1.0, description: '角色介紹：全方面平均，穩健新手選擇。', avatarImageKey: 'player1-2' }
    ],
    
    // 新增：地圖列表（背景鍵）
    MAPS: [
        { id: 'city', name: '廁所', backgroundKey: 'background' },
        { id: 'forest', name: '尚未開放', backgroundKey: 'background2' },
        { id: 'desert', name: '尚未開放', backgroundKey: 'background2' }
    ],

    // 新增：難度模式倍率（影響血量、生成速度、生成數量）
    DIFFICULTY: {
        EASY: {
            NAME: '簡單',
            enemyHealthMultiplier: 0.85,
            spawnIntervalMultiplier: 1.15,
            spawnCountMultiplier: 0.9,
            enemySpeedMultiplier: 1.0,
            bossRangedEnabled: false,
            enemyHealthGrowthRateMultiplier: 1.0,
            maxEnemiesBonusMin: 0,
            maxEnemiesBonusMax: 0
        },
        HARD: {
            NAME: '困難',
            enemyHealthMultiplier: 1.0,
            spawnIntervalMultiplier: 0.85,
            spawnCountMultiplier: 1.2,
            enemySpeedMultiplier: 1.2,
            bossRangedEnabled: true,
            enemyHealthGrowthRateMultiplier: 2.0, // 成長幅度+100%
            maxEnemiesBonusMin: 50,   // 比簡單上限多50~100
            maxEnemiesBonusMax: 100
        }
    },

    // 敵人設置
    ENEMIES: {
        ZOMBIE: {
            NAME: "殭屍",
            HEALTH: 30,
            DAMAGE: 10,
            SPEED: 1,
            SIZE: 32,
            EXPERIENCE: 5,
            COLLISION_RADIUS: 16
        },
        SKELETON: {
            NAME: "骷髏",
            HEALTH: 20,
            DAMAGE: 15,
            SPEED: 1.5,
            SIZE: 32,
            EXPERIENCE: 8,
            COLLISION_RADIUS: 16
        },
        GHOST: {
            NAME: "幽靈",
            HEALTH: 15,
            DAMAGE: 20,
            SPEED: 2,
            SIZE: 32,
            EXPERIENCE: 10,
            COLLISION_RADIUS: 16
        },
        MINI_BOSS: {
            NAME: "小BOSS",
            HEALTH: 200,
            DAMAGE: 25,
            SPEED: 0.8,
            SIZE: 64,
            EXPERIENCE: 50,
            COLLISION_RADIUS: 32,
            // 新增：遠程攻擊參數（小BOSS技能）
            RANGED_ATTACK: {
                ENABLED: true,
                RANGE: 250,
                COOLDOWN: 3500,
                PROJECTILE_DAMAGE: 40,
                PROJECTILE_SPEED: 5,
                PROJECTILE_SIZE: 18,
                HOMING: true,
                TURN_RATE: 2.0
            }
        },
        BOSS: {
            NAME: "大BOSS",
            HEALTH: 1000,
            DAMAGE: 40,
            SPEED: 0.7,
            SIZE: 128,
            EXPERIENCE: 500,
            COLLISION_RADIUS: 64,
            // 新增：遠程攻擊參數
            RANGED_ATTACK: {
                ENABLED: true,
                RANGE: 300, // 攻擊範圍
                COOLDOWN: 2500, // 火彈冷卻時間（毫秒）
                PROJECTILE_DAMAGE: 60, // 火彈傷害
                PROJECTILE_SPEED: 6, // 火彈速度
                PROJECTILE_SIZE: 24, // 火彈大小
                HOMING: true, // 是否追蹤玩家
                TURN_RATE: 2.5 // 追蹤轉向速率（弧度/秒）
            }
        }
    },
    
    // 經驗值設置
    EXPERIENCE: {
        SIZE: 16,
        VALUE: 5,
        LEVEL_UP_BASE: 80,
        LEVEL_UP_MULTIPLIER: 1.12
    },
    
    // 波次設置
    WAVES: {
        DURATION: 60000, // 每波持續60秒
        MINI_BOSS_INTERVAL: 180000, // 每3分鐘出現小BOSS
        BOSS_WAVE: 30, // 第30波出現大BOSS
        TOTAL_WAVES: 30,
        ENEMY_SPAWN_RATE: {
            INITIAL: 2000, // 初始每2秒生成一個敵人
            DECREASE_PER_WAVE: 100, // 每波減少100毫秒
            MINIMUM: 300 // 最低300毫秒，提升整體密度
        },
        // 每次生成的敵人數量隨波次增加
        SPAWN_COUNT: {
            // 敵人數量翻倍（基於原規則），單次生成量提高
            INITIAL: 3,
            INCREASE_PER_WAVE: 0.9, // 前期增幅加大
            MAXIMUM: 12,
            // 第5波後提升增幅與上限（5~30波）
            INCREASE_PER_WAVE_LATE: 1.5,
            MAXIMUM_LATE: 28
        },
        // 敵人血量隨波次的倍率（每波在基礎上乘以此倍率）
        HEALTH_MULTIPLIER_PER_WAVE: 1.05,
        HEALTH_MULTIPLIER_PER_WAVE_LATE: 1.1,
        ENEMY_TYPES: [
            { WAVE: 1, TYPE: "ZOMBIE" },
            { WAVE: 2, TYPE: "SKELETON" },
            { WAVE: 4, TYPE: "GHOST" }
        ]
    },
    
    // 優化設置
    OPTIMIZATION: {
        MAX_ENEMIES: 250, // 最大敵人數量，提高密度
        MAX_PROJECTILES: 300, // 最大投射物數量
        MAX_EXPERIENCE_ORBS: 250, // 最大經驗球數量
        CLEANUP_INTERVAL: 1000 // 清理間隔（毫秒）
    }
};
