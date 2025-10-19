// 遊戲核心配置
const CONFIG_GAME = {
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
    
    // 遊戲難度設置
    DIFFICULTY: {
        EASY: {
            ENEMY_HEALTH_MULTIPLIER: 0.8,
            ENEMY_DAMAGE_MULTIPLIER: 0.8,
            ENEMY_SPEED_MULTIPLIER: 0.8,
            ENEMY_SPAWN_MULTIPLIER: 1.2
        },
        NORMAL: {
            ENEMY_HEALTH_MULTIPLIER: 1.0,
            ENEMY_DAMAGE_MULTIPLIER: 1.0,
            ENEMY_SPEED_MULTIPLIER: 1.0,
            ENEMY_SPAWN_MULTIPLIER: 1.0
        },
        HARD: {
            ENEMY_HEALTH_MULTIPLIER: 1.2,
            ENEMY_DAMAGE_MULTIPLIER: 1.2,
            ENEMY_SPEED_MULTIPLIER: 1.2,
            ENEMY_SPAWN_MULTIPLIER: 0.8
        }
    },
    
    // 波次設置
    WAVE: {
        DURATION: 60000, // 每波次持續時間（毫秒）
        BOSS_WAVES: [5, 10, 15, 20, 25, 30] // Boss出現的波次
    },
    
    // 遊戲時間設置
    TIME: {
        VICTORY_TIME: 1800000 // 勝利時間（30分鐘）
    }
};