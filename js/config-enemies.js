// 敵人相關配置
const CONFIG_ENEMIES = {
    BASIC: {
        HEALTH: 30,
        DAMAGE: 10,
        SPEED: 1.5,
        SIZE: 32,
        EXPERIENCE: 5,
        COIN_VALUE: 1
    },
    FAST: {
        HEALTH: 20,
        DAMAGE: 5,
        SPEED: 3,
        SIZE: 24,
        EXPERIENCE: 3,
        COIN_VALUE: 1
    },
    TANK: {
        HEALTH: 100,
        DAMAGE: 20,
        SPEED: 0.8,
        SIZE: 48,
        EXPERIENCE: 10,
        COIN_VALUE: 3
    },
    BOSS: {
        HEALTH: 500,
        DAMAGE: 30,
        SPEED: 1,
        SIZE: 64,
        EXPERIENCE: 50,
        COIN_VALUE: 10
    },
    SPAWN_RATE: {
        INITIAL: 1000, // 初始生成間隔（毫秒）
        MINIMUM: 200,  // 最小生成間隔
        DECREASE_RATE: 10 // 每波次減少的間隔
    }
};