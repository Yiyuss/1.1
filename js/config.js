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
        COLLISION_RADIUS: 16,
        BORDER_MARGIN: 120, // 玩家與世界邊界的透明牆距離（像素）
        // 視覺放大倍率（不影響碰撞與邏輯尺寸）
        VISUAL_SCALE: 1.25
    },
    
    // 武器設置
    WEAPONS: {
        INVINCIBLE: {
            NAME: "無敵",
            DAMAGE: 0,
            COOLDOWN: 10000,
            PROJECTILE_SPEED: 0,
            PROJECTILE_SIZE: 0,
            // 無敵持續時間：LV1 2.0s，之後每級+0.2s，LV10 3.8s
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "冷卻10秒：無敵2.0秒" },
                { COUNT: 1, DESCRIPTION: "冷卻10秒：無敵2.2秒" },
                { COUNT: 1, DESCRIPTION: "冷卻10秒：無敵2.4秒" },
                { COUNT: 1, DESCRIPTION: "冷卻10秒：無敵2.6秒" },
                { COUNT: 1, DESCRIPTION: "冷卻10秒：無敵2.8秒" },
                { COUNT: 1, DESCRIPTION: "冷卻10秒：無敵3.0秒" },
                { COUNT: 1, DESCRIPTION: "冷卻10秒：無敵3.2秒" },
                { COUNT: 1, DESCRIPTION: "冷卻10秒：無敵3.4秒" },
                { COUNT: 1, DESCRIPTION: "冷卻10秒：無敵3.6秒" },
                { COUNT: 1, DESCRIPTION: "冷卻10秒：無敵3.8秒" }
            ]
        },
        AURA_FIELD: {
            NAME: "守護領域",
            DAMAGE: 5,
            COOLDOWN: 1000,
            PROJECTILE_SPEED: 0,
            // 場域半徑（以像素計算），升級逐步擴大
            FIELD_RADIUS: 60,
            FIELD_RADIUS_PER_LEVEL: 10,
            // 備註：此武器為常駐型，不依賴 DURATION，到達 LV10 僅提升範圍
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "在腳底生成持續傷害場域（範圍+0px）" },
                { COUNT: 1, DESCRIPTION: "場域範圍提升（+10px）" },
                { COUNT: 1, DESCRIPTION: "場域範圍提升（+20px）" },
                { COUNT: 1, DESCRIPTION: "場域範圍提升（+30px）" },
                { COUNT: 1, DESCRIPTION: "場域範圍提升（+40px）" },
                { COUNT: 1, DESCRIPTION: "場域範圍提升（+50px）" },
                { COUNT: 1, DESCRIPTION: "場域範圍提升（+60px）" },
                { COUNT: 1, DESCRIPTION: "場域範圍提升（+70px）" },
                { COUNT: 1, DESCRIPTION: "場域範圍提升（+80px）" },
                { COUNT: 1, DESCRIPTION: "場域範圍提升（+90px）" }
            ]
        },
        SING: {
            NAME: "唱歌",
            DAMAGE: 0,
            COOLDOWN: 5000,
            PROJECTILE_SPEED: 0,
            PROJECTILE_SIZE: 0,
            DURATION: 2000,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復1HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復2HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復3HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復4HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復5HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復6HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復7HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復8HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復9HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次唱歌，恢復10HP" }
            ]
        },
        YOUNG_DADA_GLORY: {
            NAME: "幼妲光輝",
            DAMAGE: 0,
            COOLDOWN: 5000,
            PROJECTILE_SPEED: 0,
            PROJECTILE_SIZE: 0,
            DURATION: 2000,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每5秒施放一次幼妲光輝，恢復1HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次幼妲光輝，恢復2HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次幼妲光輝，恢復3HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次幼妲光輝，恢復4HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次幼妲光輝，恢復5HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次幼妲光輝，恢復6HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次幼妲光輝，恢復7HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次幼妲光輝，恢復8HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次幼妲光輝，恢復9HP" },
                { COUNT: 1, DESCRIPTION: "每5秒施放一次幼妲光輝，恢復10HP" }
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
            // 新增：命中擴散與緩速效果設定（可自行調整）
            SPLASH_RADIUS_MULTIPLIER: 3.8,   // 擴散半徑倍率（基於投射物半徑）
            SPLASH_MIN_RADIUS: 52,           // 擴散半徑下限（像素）
            SLOW_DURATION_MS: 1000,          // 緩速持續時間（毫秒）
            SLOW_FACTOR: 0.5,                // 緩速係數（0.5 = 50% 速度）
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
        CHICKEN_BLESSING: {
            NAME: "雞腿庇佑",
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
                { COUNT: 1, DESCRIPTION: "生成1個雞腿庇佑環繞3秒" },
                { COUNT: 2, DESCRIPTION: "生成2個雞腿庇佑環繞3秒" },
                { COUNT: 3, DESCRIPTION: "生成3個雞腿庇佑環繞3秒" },
                { COUNT: 4, DESCRIPTION: "生成4個雞腿庇佑環繞3秒" },
                { COUNT: 5, DESCRIPTION: "生成5個雞腿庇佑環繞3秒" },
                { COUNT: 6, DESCRIPTION: "生成6個雞腿庇佑環繞3秒" },
                { COUNT: 7, DESCRIPTION: "生成7個雞腿庇佑環繞3秒" },
                { COUNT: 8, DESCRIPTION: "生成8個雞腿庇佑環繞3秒" },
                { COUNT: 9, DESCRIPTION: "生成9個雞腿庇佑環繞3秒" },
                { COUNT: 10, DESCRIPTION: "生成10個雞腿庇佑環繞3秒" }
            ]
        },
        LASER: {
            NAME: "雷射",
            DAMAGE: 10,
            COOLDOWN: 5000, // 5秒一次（持續2秒，空檔3秒）
            DURATION: 2000,
            BEAM_WIDTH_BASE: 8,
            BEAM_WIDTH_PER_LEVEL: 2,
            TICK_INTERVAL_MS: 120, // 參考旋球的持續傷害間隔
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每5秒釋放雷射，持續2秒（範圍+0px）" },
                { COUNT: 1, DESCRIPTION: "雷射範圍提升（+2px）" },
                { COUNT: 1, DESCRIPTION: "雷射範圍提升（+4px）" },
                { COUNT: 1, DESCRIPTION: "雷射範圍提升（+6px）" },
                { COUNT: 1, DESCRIPTION: "雷射範圍提升（+8px）" },
                { COUNT: 1, DESCRIPTION: "雷射範圍提升（+10px）" },
                { COUNT: 1, DESCRIPTION: "雷射範圍提升（+12px）" },
                { COUNT: 1, DESCRIPTION: "雷射範圍提升（+14px）" },
                { COUNT: 1, DESCRIPTION: "雷射範圍提升（+16px）" },
                { COUNT: 1, DESCRIPTION: "雷射範圍提升（+18px）" }
            ]
        },
        // 近戰斬擊（扇形範圍瞬時傷害）
        SLASH: {
            NAME: "斬擊",
            DAMAGE: 15,
            COOLDOWN: 1200,
            DURATION: 1200, // 斬擊視覺持續（毫秒）
            ARC_DEG_BASE: 365, // 扇形角度（度）
            ARC_DEG_PER_LEVEL: 0, // 角度不隨等級變化
            RADIUS_BASE: 252, // 視覺用半徑
            RADIUS_PER_LEVEL: 12,
            // 新增：視覺縮放倍率（僅影響 GIF 尺寸，不影響傷害邏輯）
            VISUAL_SCALE: 1.8,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每1.2秒施放斬擊（範圍+0px）" },
                { COUNT: 1, DESCRIPTION: "斬擊範圍提升（+12px）" },
                { COUNT: 1, DESCRIPTION: "斬擊範圍提升（+24px）" },
                { COUNT: 1, DESCRIPTION: "斬擊範圍提升（+36px）" },
                { COUNT: 1, DESCRIPTION: "斬擊範圍提升（+48px）" },
                { COUNT: 1, DESCRIPTION: "斬擊範圍提升（+60px）" },
                { COUNT: 1, DESCRIPTION: "斬擊範圍提升（+72px）" },
                { COUNT: 1, DESCRIPTION: "斬擊範圍提升（+84px）" },
                { COUNT: 1, DESCRIPTION: "斬擊範圍提升（+96px）" },
                { COUNT: 1, DESCRIPTION: "斬擊範圍提升（+108px）" }
            ]
        },
        // 融合斬擊：持有並滿級 應援棒(DAGGER) 與 斬擊(SLASH) 後可獲得
        FRENZY_SLASH: {
            NAME: "狂熱斬擊",
            DAMAGE: 15,
            COOLDOWN: 1200,
            DURATION: 1200,
            ARC_DEG_BASE: 365,
            ARC_DEG_PER_LEVEL: 0,
            RADIUS_BASE: 280,
            RADIUS_PER_LEVEL: 0,
            VISUAL_SCALE: 2.0,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每1.2秒瞬間施放雙段斬擊，基礎傷害+3" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+3" }
            ]
        },
        CHAIN_LIGHTNING: {
            NAME: "連鎖閃電",
            DAMAGE: 15, // 與追蹤綿羊相同
            COOLDOWN: 1500, // 與追蹤綿羊相同
            DURATION: 1000, // 攻擊時間1秒
            CHAIN_RADIUS: 220, // 連鎖搜尋半徑（像素）
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每1.5秒施放連鎖閃電，連鎖1次（1秒）" },
                { COUNT: 2, DESCRIPTION: "每1.5秒施放連鎖閃電，連鎖2次（1秒）" },
                { COUNT: 3, DESCRIPTION: "每1.5秒施放連鎖閃電，連鎖3次（1秒）" },
                { COUNT: 4, DESCRIPTION: "每1.5秒施放連鎖閃電，連鎖4次（1秒）" },
                { COUNT: 5, DESCRIPTION: "每1.5秒施放連鎖閃電，連鎖5次（1秒）" },
                { COUNT: 6, DESCRIPTION: "每1.5秒施放連鎖閃電，連鎖6次（1秒）" },
                { COUNT: 7, DESCRIPTION: "每1.5秒施放連鎖閃電，連鎖7次（1秒）" },
                { COUNT: 8, DESCRIPTION: "每1.5秒施放連鎖閃電，連鎖8次（1秒）" },
                { COUNT: 9, DESCRIPTION: "每1.5秒施放連鎖閃電，連鎖9次（1秒）" },
                { COUNT: 10, DESCRIPTION: "每1.5秒施放連鎖閃電，連鎖10次（1秒）" }
            ]
        },
        FRENZY_LIGHTNING: {
            NAME: "狂熱雷擊",
            DAMAGE: 12,
            COOLDOWN: 1500,
            DURATION: 1000,
            CHAIN_RADIUS: 300,
            LEVELS: [
                { COUNT: 10, DESCRIPTION: "每1.5秒同時釋放10條連鎖閃電，基礎傷害+3" },
                { COUNT: 10, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 10, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 10, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 10, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 10, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 10, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 10, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 10, DESCRIPTION: "基礎傷害+3" },
                { COUNT: 10, DESCRIPTION: "基礎傷害+3" }
            ]
        },
        // 新武器：心靈魔法（擴散震波環狀傷害）
        MIND_MAGIC: {
            NAME: "心靈魔法",
            DAMAGE: 14,
            COOLDOWN: 5000,
            DURATION: 2000, // 與唱歌相同的演出持續（毫秒）
            WAVE_MAX_RADIUS_BASE: 220,
            WAVE_RADIUS_PER_LEVEL: 20,
            WAVE_THICKNESS: 18,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每5秒補血+12，並施放心靈震波（範圍+0px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+14，震波範圍提升（+20px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+16，震波範圍提升（+40px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+18，震波範圍提升（+60px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+20，震波範圍提升（+80px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+22，震波範圍提升（+100px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+24，震波範圍提升（+120px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+26，震波範圍提升（+140px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+28，震波範圍提升（+160px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+30，震波範圍提升（+180px）" }
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
            ULTIMATE_WEAPONS: ['DAGGER', 'FIREBALL', 'LIGHTNING', 'ORBIT', 'LASER', 'SING', 'CHAIN_LIGHTNING', 'AURA_FIELD', 'SLASH'],
            ULTIMATE_LEVEL: 10
        },
        // 角色特定的大招配置（覆蓋 ULTIMATE 預設值）
        CHARACTER_ULTIMATES: {
            'margaret': {
                // 使用預設 ULTIMATE 配置
            },
            'dada': {
                IMAGE_KEY: 'playerN2', // 使用 playerN2.gif 動態圖片
                ULTIMATE_WEAPONS: ['AURA_FIELD'], // 只裝上LV10的守護領域
                EXTRA_DEFENSE: 10, // 大絕期間額外防禦+10
                AUDIO_KEY: 'playerN2', // 大絕期間播放 playerN2.mp3
                PLAYER_SIZE_MULTIPLIER: 3.5 // 大絕期間體型放大倍率（比預設2.5更大）
            }
        },

    // 選角列表（目前 2 名角色）
    // 維護備註：
    // - avatarImageKey   ：角色預覽用圖片鍵（選角右側大圖）
    // - hudImageKey      ：遊戲中 HUD 左上角頭像用圖片鍵
    // - spriteImageKey   ：生存模式中玩家主體使用的圖片鍵（對應 Game.images[key]）
    // - levelUpBgKey     ：生存模式升級介面左側背景用圖片鍵
    // - hpBonus          ：在基礎血量 CONFIG.PLAYER.MAX_HEALTH 之上額外增加的固定血量
    // - canUseUltimate   ：是否允許使用 Q 鍵大絕（預設 true）
    // - disabledWeapons  ：此角色在生存模式升級時不可見/不可選的武器 type 陣列（通用禁用）
    // - exclusiveWeapons ：此角色的專屬技能，只有該角色可以看到和選擇
    CHARACTERS: [
        {
            id: 'margaret',
            name: '瑪格麗特·諾爾絲',
            hpMultiplier: 1.0,
            hpBonus: 0,
            speedMultiplier: 1.0,
            description: `角色介紹：全方面平均，可變身成三角形，穩健新手選擇。\n專屬技能：綿羊護體、紳士綿羊、追蹤綿羊、唱歌。`,
            avatarImageKey: 'player1-2',
            hudImageKey: 'player1-2',
            spriteImageKey: 'player',
            levelUpBgKey: 'player1-2',
            canUseUltimate: true,
            disabledWeapons: [],
            // 專屬技能：只有瑪格麗特角色可以看到
            exclusiveWeapons: ['ORBIT', 'FIREBALL', 'LIGHTNING', 'SING']
        },
        {
            id: 'dada',
            name: '灰妲DaDa',
            // 第二位角色：初始血量比第一位角色多 100，其餘基礎數值相同
            hpMultiplier: 1.0,
            hpBonus: 100,
            speedMultiplier: 1.0,
            description: `角色介紹：元氣灰鸚鵡，有著卓越體質，特別耐扛！\n專屬技能：雞腿庇佑、幼妲光輝`,
            // 選角預覽圖（下方角色介紹用）：使用 player2-2.png
            avatarImageKey: 'player2-2',
            // 所有模式的 HUD 左上角頭像：使用 player2-2.png
            hudImageKey: 'player2-2',
            // 所有模式進入時的玩家主體形象：使用 player2.png
            spriteImageKey: 'player2',
            // 生存模式升級介面左側底圖：使用 player2-2.png
            levelUpBgKey: 'player2-2',
            // 第二位角色可以使用大絕（Q），使用專屬配置
            canUseUltimate: true,
            // 注意：不再需要在此處禁用 ORBIT、FIREBALL、LIGHTNING、SING
            // 因為這些技能已通過第一位角色的 exclusiveWeapons 機制自動隱藏
            disabledWeapons: [],
            // 專屬技能：只有灰妲角色可以看到雞腿庇佑、幼妲光輝
            exclusiveWeapons: ['CHICKEN_BLESSING', 'YOUNG_DADA_GLORY'],
            // 解鎖價格（遊戲金幣）；若 <=0 則視為預設解鎖
            unlockCost: 10000
        }
    ],
    
    // 新增：地圖列表（背景鍵）
    MAPS: [
        { id: 'city', name: '廁所', backgroundKey: 'background' },
        { id: 'forest', name: '草原', backgroundKey: 'background1-2' },
        { id: 'desert', name: '宇宙', backgroundKey: 'background1-3' },
        { id: 'challenge-1', name: 'LV1.銀河系', backgroundKey: 'background4' },
        { id: 'challenge-2', name: 'LV2.星雲', backgroundKey: 'background5' },
        { id: 'challenge-3', name: 'LV3.星軌', backgroundKey: 'background6' },
        { id: 'challenge-4', name: 'LV4.黑洞', backgroundKey: 'background7' },
        { id: 'defense-1', name: 'TD防禦戰場I', backgroundKey: 'background1-2' },
        // 主線模式地圖（不分難度）：測試用地圖
        { id: 'main-test', name: '測試用地圖', backgroundKey: 'background3' }
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
        },
        ASURA: {
            NAME: '修羅',
            // 小怪希望 1波約70、30波約10000（以第三張地圖基礎50為例）
            // 因此適度提升基礎倍率並降低成長倍率：50 * 1.4 ≈ 70；30波總倍率約142.8
            enemyHealthMultiplier: 1.4,
            spawnIntervalMultiplier: 0.85,
            spawnCountMultiplier: 1.2,
            enemySpeedMultiplier: 1.7,
            bossRangedEnabled: true,
            // 使 1.05^(4g) * 1.1^(25g) ≈ 142.8，解得 g ≈ 1.925
            enemyHealthGrowthRateMultiplier: 1.925,
            maxEnemiesBonusMin: 50,
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
        // 第二張地圖專用：殭屍2（僅初始血量+10、初始傷害+5，其餘相同）
        ZOMBIE2: {
            NAME: "殭屍",
            HEALTH: 40,
            DAMAGE: 15,
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
        // 第二張地圖專用：骷髏2（僅初始血量+10、初始傷害+5，其餘相同）
        SKELETON2: {
            NAME: "骷髏",
            HEALTH: 30,
            DAMAGE: 20,
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
        // 第二張地圖專用：幽靈2（僅初始血量+10、初始傷害+5，其餘相同）
        GHOST2: {
            NAME: "幽靈",
            HEALTH: 25,
            DAMAGE: 25,
            SPEED: 2,
            SIZE: 32,
            EXPERIENCE: 10,
            COLLISION_RADIUS: 16
        },
        // 第三張地圖專用：殭屍3（僅初始血量+20、初始傷害+10，其餘相同）
        ZOMBIE3: {
            NAME: "殭屍",
            HEALTH: 50,
            DAMAGE: 20,
            SPEED: 1,
            SIZE: 32,
            EXPERIENCE: 5,
            COLLISION_RADIUS: 16
        },
        // 第三張地圖專用：骷髏3（僅初始血量+20、初始傷害+10，其餘相同）
        SKELETON3: {
            NAME: "骷髏",
            HEALTH: 40,
            DAMAGE: 25,
            SPEED: 1.5,
            SIZE: 32,
            EXPERIENCE: 8,
            COLLISION_RADIUS: 16
        },
        // 第三張地圖專用：幽靈3（僅初始血量+20、初始傷害+10，其餘相同）
        GHOST3: {
            NAME: "幽靈",
            HEALTH: 35,
            DAMAGE: 30,
            SPEED: 2,
            SIZE: 32,
            EXPERIENCE: 10,
            COLLISION_RADIUS: 16
        },
        MINI_BOSS: {
            NAME: "小BOSS",
            HEALTH: 600, // 原先200 * 3 = 600
            DAMAGE: 25,
            SPEED: 0.8,
            SIZE: 160,
            EXPERIENCE: 50,
            COLLISION_RADIUS: 80,
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
            HEALTH: 5000, // 原先1000 * 5 = 5000
            DAMAGE: 40,
            SPEED: 0.7,
            SIZE: 300,
            EXPERIENCE: 500,
            COLLISION_RADIUS: 150,
            // 新增：遠程攻擊參數
            RANGED_ATTACK: {
                ENABLED: true,
                RANGE: 500, // 攻擊範圍
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

    // 迷你BOSS/大BOSS 血量微調（依地圖與難度）
    // 僅針對 MINI_BOSS / BOSS，不影響普通敵人。
    TUNING: {
        MINI_BOSS: {
            // 第一張地圖：廁所
            city: {
                // EASY 不調整（沿用既有數值）
                HARD: { startWave1: 1000, endWave30: 30000 }
            },
            // 第二張地圖：草原
            forest: {
                HARD: { startWave1: 2000, endWave30: 60000 }
            },
            // 第三張地圖：宇宙
            desert: {
                HARD: { startWave1: 3000, endWave30: 100000 },
                ASURA: { startWave1: 4000, endWave30: 200000 }
            }
        },
        BOSS: {
            city: {
                HARD: { wave30: 80000 }
            },
            forest: {
                HARD: { wave30: 100000 }
            },
            desert: {
                HARD: { wave30: 120000 },
                ASURA: { wave30: 300000 }
            }
        }
    },
    
    // 優化設置
    OPTIMIZATION: {
        MAX_ENEMIES: 700, // 最大敵人數量，提高密度
        MAX_PROJECTILES: 1200, // 最大投射物數量
        MAX_EXPERIENCE_ORBS: 600, // 最大經驗球數量
        ORB_PULSE_DISABLE_THRESHOLD: 100, // 經驗球超過此數量關閉呼吸閃爍
        CLEANUP_INTERVAL: 1000 // 清理間隔（毫秒）
    },
    
    // 彈幕系統（骨架開關）：預設關閉，不影響現有遊戲
    BULLET_SYSTEM: {
        ENABLED: true
    }
};
