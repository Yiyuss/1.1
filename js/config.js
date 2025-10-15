// 遊戲配置
const CONFIG = {
    // 遊戲畫布設置
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 600,
    
    // 玩家設置
    PLAYER: {
        SPEED: 5,
        MAX_HEALTH: 100,
        SIZE: 32,
        COLLISION_RADIUS: 16
    },
    
    // 武器設置
    WEAPONS: {
        DAGGER: {
            NAME: "飛鏢",
            DAMAGE: 10,
            COOLDOWN: 1000, // 毫秒
            PROJECTILE_SPEED: 8,
            PROJECTILE_SIZE: 16,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每秒發射1顆飛鏢" },
                { COUNT: 2, DESCRIPTION: "每秒發射2顆飛鏢" },
                { COUNT: 3, DESCRIPTION: "每秒發射3顆飛鏢" }
            ]
        },
        FIREBALL: {
            NAME: "火球",
            DAMAGE: 20,
            COOLDOWN: 2000,
            PROJECTILE_SPEED: 6,
            PROJECTILE_SIZE: 24,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每2秒發射1顆火球" },
                { COUNT: 2, DESCRIPTION: "每2秒發射2顆火球" },
                { COUNT: 3, DESCRIPTION: "每2秒發射3顆火球" }
            ]
        },
        LIGHTNING: {
            NAME: "閃電",
            DAMAGE: 15,
            COOLDOWN: 1500,
            PROJECTILE_SPEED: 10,
            PROJECTILE_SIZE: 20,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每1.5秒發射1道閃電" },
                { COUNT: 2, DESCRIPTION: "每1.5秒發射2道閃電" },
                { COUNT: 3, DESCRIPTION: "每1.5秒發射3道閃電" }
            ]
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
            COLLISION_RADIUS: 32
        },
        BOSS: {
            NAME: "大BOSS",
            HEALTH: 1000,
            DAMAGE: 40,
            SPEED: 0.5,
            SIZE: 128,
            EXPERIENCE: 500,
            COLLISION_RADIUS: 64
        }
    },
    
    // 經驗值設置
    EXPERIENCE: {
        SIZE: 16,
        VALUE: 5,
        LEVEL_UP_BASE: 100,
        LEVEL_UP_MULTIPLIER: 1.2
    },
    
    // 波次設置
    WAVES: {
        DURATION: 60000, // 每波持續60秒
        MINI_BOSS_INTERVAL: 180000, // 每3分鐘出現小BOSS
        BOSS_WAVE: 30, // 第30波出現大BOSS
        ENEMY_SPAWN_RATE: {
            INITIAL: 2000, // 初始每2秒生成一個敵人
            DECREASE_PER_WAVE: 100, // 每波減少100毫秒
            MINIMUM: 500 // 最低500毫秒
        },
        ENEMY_TYPES: [
            { WAVE: 1, TYPE: "ZOMBIE" },
            { WAVE: 2, TYPE: "SKELETON" },
            { WAVE: 4, TYPE: "GHOST" }
        ]
    },
    
    // 優化設置
    OPTIMIZATION: {
        MAX_ENEMIES: 100, // 最大敵人數量
        MAX_PROJECTILES: 200, // 最大投射物數量
        MAX_EXPERIENCE_ORBS: 100, // 最大經驗球數量
        CLEANUP_INTERVAL: 1000 // 清理間隔（毫秒）
    }
};