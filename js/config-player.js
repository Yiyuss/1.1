// 玩家相關配置
const CONFIG_PLAYER = {
    // 玩家設置
    SPEED: 3, // 移動速度
    MAX_HEALTH: 200, // 最大生命值
    SIZE: 32, // 玩家大小
    COLLISION_RADIUS: 16, // 碰撞半徑
    
    // 經驗值設置
    EXPERIENCE: {
        LEVEL_UP_BASE: 100, // 基礎升級經驗
        LEVEL_UP_INCREMENT: 20, // 每級增加的經驗需求
        PICKUP_RADIUS: 80 // 經驗值拾取半徑
    },
    
    // 能量設置
    ENERGY: {
        MAX: 100, // 最大能量值
        REGEN_RATE: 5, // 每秒恢復能量
        DASH_COST: 30 // 衝刺消耗能量
    }
};