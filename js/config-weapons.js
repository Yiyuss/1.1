// 武器相關配置
const CONFIG_WEAPONS = {
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
        LEVELS: [
            { COUNT: 1, DESCRIPTION: "發射1個應援棒" },
            { COUNT: 2, DESCRIPTION: "發射2個應援棒" },
            { COUNT: 3, DESCRIPTION: "發射3個應援棒" },
            { COUNT: 4, DESCRIPTION: "發射4個應援棒" },
            { COUNT: 5, DESCRIPTION: "發射5個應援棒" },
            { COUNT: 6, DESCRIPTION: "發射6個應援棒" },
            { COUNT: 7, DESCRIPTION: "發射7個應援棒" },
            { COUNT: 8, DESCRIPTION: "發射8個應援棒" },
            { COUNT: 9, DESCRIPTION: "發射9個應援棒" },
            { COUNT: 10, DESCRIPTION: "發射10個應援棒" }
        ]
    },
    WHIP: {
        NAME: "麥克風線",
        DAMAGE: 15,
        COOLDOWN: 2000,
        RANGE: 150,
        ARC: 120, // 弧度範圍（度）
        LEVELS: [
            { COUNT: 1, DESCRIPTION: "揮舞麥克風線，攻擊前方120度範圍內的敵人" },
            { COUNT: 1, DESCRIPTION: "麥克風線傷害提升至20" },
            { COUNT: 1, DESCRIPTION: "麥克風線範圍提升至180度" },
            { COUNT: 1, DESCRIPTION: "麥克風線傷害提升至25" },
            { COUNT: 1, DESCRIPTION: "麥克風線冷卻時間降低至1.5秒" },
            { COUNT: 1, DESCRIPTION: "麥克風線傷害提升至30" },
            { COUNT: 1, DESCRIPTION: "麥克風線範圍提升至240度" },
            { COUNT: 1, DESCRIPTION: "麥克風線傷害提升至35" },
            { COUNT: 1, DESCRIPTION: "麥克風線冷卻時間降低至1秒" },
            { COUNT: 1, DESCRIPTION: "麥克風線傷害提升至40，範圍提升至300度" }
        ]
    },
    AREA: {
        NAME: "音波",
        DAMAGE: 5,
        COOLDOWN: 3000,
        RADIUS: 100,
        DURATION: 2000,
        LEVELS: [
            { COUNT: 1, DESCRIPTION: "釋放音波，持續2秒對周圍敵人造成傷害" },
            { COUNT: 1, DESCRIPTION: "音波傷害提升至8" },
            { COUNT: 1, DESCRIPTION: "音波範圍提升至120" },
            { COUNT: 1, DESCRIPTION: "音波傷害提升至12" },
            { COUNT: 1, DESCRIPTION: "音波持續時間提升至3秒" },
            { COUNT: 1, DESCRIPTION: "音波傷害提升至15" },
            { COUNT: 1, DESCRIPTION: "音波範圍提升至150" },
            { COUNT: 1, DESCRIPTION: "音波傷害提升至18" },
            { COUNT: 1, DESCRIPTION: "音波持續時間提升至4秒" },
            { COUNT: 1, DESCRIPTION: "音波傷害提升至20，範圍提升至180" }
        ]
    },
    ORBIT: {
        NAME: "旋轉CD",
        DAMAGE: 8,
        COOLDOWN: 500,
        ORBIT_RADIUS: 80,
        PROJECTILE_SIZE: 24,
        LEVELS: [
            { COUNT: 1, DESCRIPTION: "1張CD環繞在角色周圍" },
            { COUNT: 2, DESCRIPTION: "2張CD環繞在角色周圍" },
            { COUNT: 3, DESCRIPTION: "3張CD環繞在角色周圍" },
            { COUNT: 4, DESCRIPTION: "4張CD環繞在角色周圍" },
            { COUNT: 5, DESCRIPTION: "5張CD環繞在角色周圍" },
            { COUNT: 6, DESCRIPTION: "6張CD環繞在角色周圍" },
            { COUNT: 7, DESCRIPTION: "7張CD環繞在角色周圍" },
            { COUNT: 8, DESCRIPTION: "8張CD環繞在角色周圍" },
            { COUNT: 9, DESCRIPTION: "9張CD環繞在角色周圍" },
            { COUNT: 10, DESCRIPTION: "10張CD環繞在角色周圍" }
        ]
    }
};