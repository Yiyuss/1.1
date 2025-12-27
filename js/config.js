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

    // UI 顯示用（不要與 Game.images 預載混為一談）
    // - 這裡的 SKILL_ICONS 是給 UI <img src="..."> 使用的靜態路徑表
    // - 若是 Canvas/特效需要使用 Game.images[key]，請改走 ResourceLoader.getImageList() 預載
    UI: {
        SKILL_ICONS: {
            SING: 'assets/images/A1.png',
            DAGGER: 'assets/images/A2.png',
            SLASH: 'assets/images/A17.png',
            LASER: 'assets/images/A3.png',
            CHAIN_LIGHTNING: 'assets/images/A4.png',
            FRENZY_LIGHTNING: 'assets/images/A15.png',
            FRENZY_SLASH: 'assets/images/A18.png',
            FIREBALL: 'assets/images/A5.png',
            LIGHTNING: 'assets/images/A6.png',
            ORBIT: 'assets/images/A7.png',
            AURA_FIELD: 'assets/images/A13.png',
            INVINCIBLE: 'assets/images/A14.png',
            GRAVITY_WAVE: 'assets/images/A27.png',
            CHICKEN_BLESSING: 'assets/images/A19.png',
            YOUNG_DADA_GLORY: 'assets/images/A20.png',
            BIG_ICE_BALL: 'assets/images/A21.png',
            ABSTRACTION: 'assets/images/A22.png',
            FRENZY_ICE_BALL: 'assets/images/A23.png',
            FRENZY_YOUNG_DADA_GLORY: 'assets/images/A25.png',
            ROTATING_MUFFIN: 'assets/images/A31.png',
            MUFFIN_THROW: 'assets/images/A28.png',
            DEATHLINE_WARRIOR: 'assets/images/A29.png',
            UNCONTROLLABLE_BEAST: 'assets/images/A32.png',
            DEATHLINE_SUPERMAN: 'assets/images/A30.png',
            RADIANT_GLORY: 'assets/images/A33.png',
            HEART_COMPANION: 'assets/images/A34.png',
            HEART_CONNECTION: 'assets/images/A35.png',
            HEART_TRANSMISSION: 'assets/images/A37.png',
            JUDGMENT: 'assets/images/A38.png',
            DIVINE_JUDGMENT: 'assets/images/A40.png',
            SUMMON_AI: 'assets/images/AI.png',
            MIND_MAGIC: 'assets/images/A16.png',
            ATTR_ATTACK: 'assets/images/A8.png',
            ATTR_CRIT: 'assets/images/A9.png',
            ATTR_HEALTH: 'assets/images/A10.png',
            ATTR_DEFENSE: 'assets/images/A11.png',
            ATTR_ATTACK_POWER: 'assets/images/A12.png'
        }
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
            DAMAGE: 3,
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
            SPLASH_RADIUS_MULTIPLIER: 4.5,   // 擴散半徑倍率（基於投射物半徑）
            SPLASH_MIN_RADIUS: 70,           // 擴散半徑下限（像素）
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
            DAMAGE: 8,
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
        HEART_COMPANION: {
            NAME: "心意相隨",
            DAMAGE: 8,
            COOLDOWN: 4000,
            PROJECTILE_SPEED: 0,
            PROJECTILE_SIZE: 20,
            PROJECTILE_SIZE_PER_LEVEL: 2,
            ORBIT_RADIUS: 60,
            ORBIT_RADIUS_PER_LEVEL: 10,
            DURATION: 3000, // 3秒持續
            ANGULAR_SPEED: 6.283, // 約1圈/秒
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "生成1個心意相隨環繞3秒" },
                { COUNT: 2, DESCRIPTION: "生成2個心意相隨環繞3秒" },
                { COUNT: 3, DESCRIPTION: "生成3個心意相隨環繞3秒" },
                { COUNT: 4, DESCRIPTION: "生成4個心意相隨環繞3秒" },
                { COUNT: 5, DESCRIPTION: "生成5個心意相隨環繞3秒" },
                { COUNT: 6, DESCRIPTION: "生成6個心意相隨環繞3秒" },
                { COUNT: 7, DESCRIPTION: "生成7個心意相隨環繞3秒" },
                { COUNT: 8, DESCRIPTION: "生成8個心意相隨環繞3秒" },
                { COUNT: 9, DESCRIPTION: "生成9個心意相隨環繞3秒" },
                { COUNT: 10, DESCRIPTION: "生成10個心意相隨環繞3秒" }
            ]
        },
        HEART_CONNECTION: {
            NAME: "心意相通",
            DAMAGE: 0, // 被動技能，不造成傷害
            COOLDOWN: 0, // 被動技能，無冷卻
            REGEN_SPEED_BOOST_PER_LEVEL: 0.20, // 每級+20%回血速度
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "回血速度+20%" },
                { COUNT: 1, DESCRIPTION: "回血速度+40%" },
                { COUNT: 1, DESCRIPTION: "回血速度+60%" },
                { COUNT: 1, DESCRIPTION: "回血速度+80%" },
                { COUNT: 1, DESCRIPTION: "回血速度+100%" },
                { COUNT: 1, DESCRIPTION: "回血速度+120%" },
                { COUNT: 1, DESCRIPTION: "回血速度+140%" },
                { COUNT: 1, DESCRIPTION: "回血速度+160%" },
                { COUNT: 1, DESCRIPTION: "回血速度+180%" },
                { COUNT: 1, DESCRIPTION: "回血速度+200%" }
            ]
        },
        HEART_TRANSMISSION: {
            NAME: "心意傳遞",
            DAMAGE: 15, // 與追蹤綿羊相同
            COOLDOWN: 1500, // 與追蹤綿羊相同
            PROJECTILE_SPEED: 10, // 與追蹤綿羊相同
            PROJECTILE_SIZE: 24, // 與追蹤綿羊相同
            PROJECTILE_SIZE_PER_LEVEL: 3, // 與追蹤綿羊相同
            EFFECT_IMAGE_WIDTH: 310, // 效果圖片寬度
            EFFECT_IMAGE_HEIGHT: 290, // 效果圖片高度
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每1.5秒發射1道心意傳遞" },
                { COUNT: 2, DESCRIPTION: "每1.5秒發射2道心意傳遞" },
                { COUNT: 3, DESCRIPTION: "每1.5秒發射3道心意傳遞" },
                { COUNT: 4, DESCRIPTION: "每1.5秒發射4道心意傳遞" },
                { COUNT: 5, DESCRIPTION: "每1.5秒發射5道心意傳遞" },
                { COUNT: 6, DESCRIPTION: "每1.5秒發射6道心意傳遞" },
                { COUNT: 7, DESCRIPTION: "每1.5秒發射7道心意傳遞" },
                { COUNT: 8, DESCRIPTION: "每1.5秒發射8道心意傳遞" },
                { COUNT: 9, DESCRIPTION: "每1.5秒發射9道心意傳遞" },
                { COUNT: 10, DESCRIPTION: "每1.5秒發射10道心意傳遞" }
            ]
        },
        JUDGMENT: {
            NAME: "裁決",
            DAMAGE: 15, // 基礎傷害
            COOLDOWN: 2400, // 每2.4秒施放一次
            DETECT_RADIUS: 400, // 以玩家為中心向外400範圍
            BASE_AOE_RADIUS: 100, // 基礎傷害範圍100像素
            AOE_RADIUS_PER_LEVEL: 12, // 每一級+12範圍
            SWORD_IMAGE_WIDTH: 83, // 武器圖片寬度
            SWORD_IMAGE_HEIGHT: 200, // 武器圖片高度
            FALL_DURATION_MS: 250, // 劍下落時間（毫秒）
            FADE_OUT_DURATION_MS: 300, // 淡出時間（毫秒）
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每2.4秒在最近敵人上方生成1把劍下落" },
                { COUNT: 2, DESCRIPTION: "每2.4秒在最近敵人上方生成2把劍下落" },
                { COUNT: 3, DESCRIPTION: "每2.4秒在最近敵人上方生成3把劍下落" },
                { COUNT: 4, DESCRIPTION: "每2.4秒在最近敵人上方生成4把劍下落" },
                { COUNT: 5, DESCRIPTION: "每2.4秒在最近敵人上方生成5把劍下落" },
                { COUNT: 6, DESCRIPTION: "每2.4秒在最近敵人上方生成6把劍下落" },
                { COUNT: 7, DESCRIPTION: "每2.4秒在最近敵人上方生成7把劍下落" },
                { COUNT: 8, DESCRIPTION: "每2.4秒在最近敵人上方生成8把劍下落" },
                { COUNT: 9, DESCRIPTION: "每2.4秒在最近敵人上方生成9把劍下落" },
                { COUNT: 10, DESCRIPTION: "每2.4秒在最近敵人上方生成10把劍下落" }
            ]
        },
        // 合成技能：神界裁決（裁決LV10 + 斬擊LV10）
        // - 常駐 5 把劍；命中邏輯/特效與裁決相同，但不會消失
        // - 每級：基礎攻擊 +3、攻擊範圍 +20、傷害範圍 +20，最高10級
        DIVINE_JUDGMENT: {
            NAME: "神界裁決",
            DAMAGE: 20, // 基礎傷害
            DAMAGE_PER_LEVEL: 3, // 每級+3（LV10 累計 +27）
            COOLDOWN: 100, // 0.1秒：不停落下（移動/下落/停留/抬起才是主要節奏）
            // 攻擊範圍（偵測半徑）：LV1=400，每級+20
            DETECT_RADIUS_BASE: 400,
            DETECT_RADIUS_PER_LEVEL: 20,
            // 傷害範圍（AOE 半徑）：LV1=100，每級+20
            AOE_RADIUS_BASE: 100,
            AOE_RADIUS_PER_LEVEL: 20,
            SWORD_COUNT: 5,
            SWORD_IMAGE_WIDTH: 83,
            SWORD_IMAGE_HEIGHT: 200,
            FALL_DURATION_MS: 250, // 與裁決一致：下落時間
            HEAD_WAIT_MS: 100, // 單一目標不移動時：頭上等待0.1秒再落下（形成0.8秒循環）
            HOLD_ON_ENEMY_MS: 200, // 落地後停留 0.2 秒
            MOVE_DURATION_MS: 600, // 移動到下一個目標頭上的時間（加快一些）
            PATROL_SPEED_FACTOR: 0.35, // 無怪巡邏速度（相對於攻擊移動）
            LEVELS: [
                { COUNT: 5, DESCRIPTION: "常駐5把劍巡守，落下裁決（冷卻0.1秒）" },
                { COUNT: 5, DESCRIPTION: "基礎攻擊+3，攻擊範圍+20px，傷害範圍+20px" },
                { COUNT: 5, DESCRIPTION: "基礎攻擊+6，攻擊範圍+40px，傷害範圍+40px" },
                { COUNT: 5, DESCRIPTION: "基礎攻擊+9，攻擊範圍+60px，傷害範圍+60px" },
                { COUNT: 5, DESCRIPTION: "基礎攻擊+12，攻擊範圍+80px，傷害範圍+80px" },
                { COUNT: 5, DESCRIPTION: "基礎攻擊+15，攻擊範圍+100px，傷害範圍+100px" },
                { COUNT: 5, DESCRIPTION: "基礎攻擊+18，攻擊範圍+120px，傷害範圍+120px" },
                { COUNT: 5, DESCRIPTION: "基礎攻擊+21，攻擊範圍+140px，傷害範圍+140px" },
                { COUNT: 5, DESCRIPTION: "基礎攻擊+24，攻擊範圍+160px，傷害範圍+160px" },
                { COUNT: 5, DESCRIPTION: "基礎攻擊+27，攻擊範圍+180px，傷害範圍+180px" }
            ]
        },
        CHICKEN_BLESSING: {
            NAME: "雞腿庇佑",
            DAMAGE: 8,
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
        ROTATING_MUFFIN: {
            NAME: "旋轉鬆餅",
            DAMAGE: 8,
            COOLDOWN: 4000,
            PROJECTILE_SPEED: 0,
            PROJECTILE_SIZE: 20,
            PROJECTILE_SIZE_PER_LEVEL: 2,
            ORBIT_RADIUS: 60,
            ORBIT_RADIUS_PER_LEVEL: 10,
            DURATION: 3000, // 3秒持續
            ANGULAR_SPEED: 6.283, // 約1圈/秒
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "生成1個旋轉鬆餅環繞3秒" },
                { COUNT: 2, DESCRIPTION: "生成2個旋轉鬆餅環繞3秒" },
                { COUNT: 3, DESCRIPTION: "生成3個旋轉鬆餅環繞3秒" },
                { COUNT: 4, DESCRIPTION: "生成4個旋轉鬆餅環繞3秒" },
                { COUNT: 5, DESCRIPTION: "生成5個旋轉鬆餅環繞3秒" },
                { COUNT: 6, DESCRIPTION: "生成6個旋轉鬆餅環繞3秒" },
                { COUNT: 7, DESCRIPTION: "生成7個旋轉鬆餅環繞3秒" },
                { COUNT: 8, DESCRIPTION: "生成8個旋轉鬆餅環繞3秒" },
                { COUNT: 9, DESCRIPTION: "生成9個旋轉鬆餅環繞3秒" },
                { COUNT: 10, DESCRIPTION: "生成10個旋轉鬆餅環繞3秒" }
            ]
        },
        MUFFIN_THROW: {
            NAME: "鬆餅投擲",
            DAMAGE: 15,
            COOLDOWN: 1500,
            PROJECTILE_SPEED: 10,
            PROJECTILE_SIZE: 24,
            PROJECTILE_SIZE_PER_LEVEL: 3,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每1.5秒發射1個鬆餅投擲" },
                { COUNT: 2, DESCRIPTION: "每1.5秒發射2個鬆餅投擲" },
                { COUNT: 3, DESCRIPTION: "每1.5秒發射3個鬆餅投擲" },
                { COUNT: 4, DESCRIPTION: "每1.5秒發射4個鬆餅投擲" },
                { COUNT: 5, DESCRIPTION: "每1.5秒發射5個鬆餅投擲" },
                { COUNT: 6, DESCRIPTION: "每1.5秒發射6個鬆餅投擲" },
                { COUNT: 7, DESCRIPTION: "每1.5秒發射7個鬆餅投擲" },
                { COUNT: 8, DESCRIPTION: "每1.5秒發射8個鬆餅投擲" },
                { COUNT: 9, DESCRIPTION: "每1.5秒發射9個鬆餅投擲" },
                { COUNT: 10, DESCRIPTION: "每1.5秒發射10個鬆餅投擲" }
            ]
        },
        DEATHLINE_WARRIOR: {
            NAME: "死線戰士",
            DAMAGE: 5, // LV1基礎傷害為5
            DAMAGE_PER_LEVEL: 10, // 每級+10
            COOLDOWN: 3000, // 3秒冷卻
            DETECT_RADIUS: 600, // 偵測範圍600
            TOTAL_HITS: 3, // 總共3次傷害
            TOTAL_DURATION_MS: 1200, // 1.2秒內完成
            MIN_TELEPORT_DISTANCE: 300, // 優先選擇300以上距離的敵人
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊3次敵人" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊3次敵人（傷害提升10）" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊3次敵人（傷害提升10）" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊3次敵人（傷害提升10）" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊3次敵人（傷害提升10）" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊3次敵人（傷害提升10）" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊3次敵人（傷害提升10）" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊3次敵人（傷害提升10）" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊3次敵人（傷害提升10）" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊3次敵人（傷害提升10）" }
            ]
        },
        UNCONTROLLABLE_BEAST: {
            NAME: "不獸控制",
            DAMAGE: 0, // 被動技能，不造成直接傷害
            COOLDOWN: 0, // 無冷卻（被動觸發）
            LIFESTEAL_BASE_PCT: 0.001, // LV1 吸血 0.1%
            LIFESTEAL_PER_LEVEL: 0.001, // 每級+0.1%
            LIFESTEAL_COOLDOWN_MS: 200, // 吸血冷卻0.2秒
            MIN_HEAL: 1, // 最低回復1HP
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "傷害吸血0.1%，冷卻0.2秒，最低回復1HP" },
                { COUNT: 1, DESCRIPTION: "傷害吸血0.2%，冷卻0.2秒，最低回復1HP" },
                { COUNT: 1, DESCRIPTION: "傷害吸血0.3%，冷卻0.2秒，最低回復1HP" },
                { COUNT: 1, DESCRIPTION: "傷害吸血0.4%，冷卻0.2秒，最低回復1HP" },
                { COUNT: 1, DESCRIPTION: "傷害吸血0.5%，冷卻0.2秒，最低回復1HP" },
                { COUNT: 1, DESCRIPTION: "傷害吸血0.6%，冷卻0.2秒，最低回復1HP" },
                { COUNT: 1, DESCRIPTION: "傷害吸血0.7%，冷卻0.2秒，最低回復1HP" },
                { COUNT: 1, DESCRIPTION: "傷害吸血0.8%，冷卻0.2秒，最低回復1HP" },
                { COUNT: 1, DESCRIPTION: "傷害吸血0.9%，冷卻0.2秒，最低回復1HP" },
                { COUNT: 1, DESCRIPTION: "傷害吸血1.0%，冷卻0.2秒，最低回復1HP" }
            ]
        },
        DEATHLINE_SUPERMAN: {
            NAME: "死線超人",
            DAMAGE: 40, // LV1基礎傷害為40
            DAMAGE_PER_LEVEL: 10, // 每級+10
            COOLDOWN: 3000, // 3秒冷卻
            DETECT_RADIUS: 600, // 偵測範圍600
            TOTAL_HITS: 6, // 總共6次傷害（死線戰士是3次）
            TOTAL_DURATION_MS: 1200, // 1.2秒內完成
            MIN_TELEPORT_DISTANCE: 300, // 優先選擇300以上距離的敵人
            AOE_RADIUS: 200, // 範圍傷害半徑200
            DISPLAY_SCALE: 1.0, // 特效大小100%（死線戰士是50%）
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊6次敵人，範圍傷害" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊6次敵人，範圍傷害，傷害提升10" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊6次敵人，範圍傷害，傷害提升10" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊6次敵人，範圍傷害，傷害提升10" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊6次敵人，範圍傷害，傷害提升10" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊6次敵人，範圍傷害，傷害提升10" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊6次敵人，範圍傷害，傷害提升10" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊6次敵人，範圍傷害，傷害提升10" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊6次敵人，範圍傷害，傷害提升10" },
                { COUNT: 1, DESCRIPTION: "每3秒瞬移攻擊6次敵人，範圍傷害，傷害提升10" }
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
            DAMAGE: 30,
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
        // 融合技能：引力波（守護領域LV10 + 無敵LV10）
        GRAVITY_WAVE: {
            NAME: "引力波",
            DAMAGE: 5, 
            COOLDOWN: 1000,
            PROJECTILE_SPEED: 0,
            // 場域半徑：與守護領域LV10相同（60 + 10*9 = 150）
            FIELD_RADIUS: 150,
            FIELD_RADIUS_PER_LEVEL: 0, // 升級不增加範圍
            VISUAL_SCALE: 1.95, // 與守護領域相同
            // 備註：此武器為常駐型，傷害與範圍與守護領域LV10相同，LV1~LV10基礎攻擊+1~+10
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "在腳底生成持續傷害場域，基礎攻擊+1" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+2" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+3" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+4" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+5" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+6" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+7" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+8" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+9" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+10" }
            ]
        },
        // 融合技能：光芒萬丈（連鎖閃電LV10 + 雷射LV10）
        RADIANT_GLORY: {
            NAME: "光芒萬丈",
            DAMAGE: 15, // 
            COOLDOWN: 5000, // 與LV1雷射相同（5秒）
            DURATION: 2000, // 與LV1雷射相同（持續2秒）
            BEAM_WIDTH_BASE: 8, // 與LV1雷射相同
            TICK_INTERVAL_MS: 120, // 與LV1雷射相同
            BEAM_COUNT: 10, // 向四面八方射出10條雷射
            ROTATION_SPEED: 1.0, // 旋轉速度（弧度/秒）
            DAMAGE_PER_LEVEL: 1, // 每升一級+1基礎攻擊
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "向四面八方射出10條旋轉雷射，基礎攻擊+1" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+2" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+3" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+4" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+5" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+6" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+7" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+8" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+9" },
                { COUNT: 1, DESCRIPTION: "基礎攻擊+10" }
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
            DAMAGE: 15,
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
            DAMAGE: 200,
            COOLDOWN: 5000,
            DURATION: 2000, // 與唱歌相同的演出持續（毫秒）
            WAVE_MAX_RADIUS_BASE: 220,
            WAVE_RADIUS_PER_LEVEL: 25,
            WAVE_THICKNESS: 18,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每5秒補血+12，並施放心靈震波" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+14，震波範圍提升（+25px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+16，震波範圍提升（+50px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+18，震波範圍提升（+75px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+20，震波範圍提升（+100px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+22，震波範圍提升（+120px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+24，震波範圍提升（+150px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+26，震波範圍提升（+175px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+28，震波範圍提升（+200px）" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+30，震波範圍提升（+225px）" }
            ]
        },
        // 新武器：大波球（灰妲專屬技能）
        BIG_ICE_BALL: {
            NAME: "大波球",
            DAMAGE: 2, // 持續傷害為2（可吃到天賦加成）
            COOLDOWN: 5000, // 每5秒
            // 紳士綿羊的擴散半徑約52像素（SPLASH_MIN_RADIUS）
            // LV1範圍：52 * 1.5 = 78
            // LV10範圍：52 * 3 = 156
            // 線性增長：(156 - 78) / 9 = 8.67 每級
            FIELD_RADIUS_BASE: 78, // LV1範圍
            FIELD_RADIUS_PER_LEVEL: 8.67, // 每級增加約8.67，LV10達到156
            // 拋物線飛行時間固定1秒
            PROJECTILE_FLIGHT_TIME: 1000,
            // 地面特效持續時間3秒
            FIELD_DURATION: 3000,
            // 緩速效果（與紳士綿羊相同）
            SLOW_FACTOR: 0.5, // 50%速度
            SLOW_DURATION_MS: 1000, // 緩速持續時間（毫秒）
            // 傷害間隔（與守護領域相同）
            TICK_INTERVAL_MS: 120,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每5秒丟1顆冰彈，範圍78px" },
                { COUNT: 1, DESCRIPTION: "每5秒丟1顆冰彈，範圍87px" },
                { COUNT: 1, DESCRIPTION: "每5秒丟1顆冰彈，範圍96px" },
                { COUNT: 1, DESCRIPTION: "每5秒丟1顆冰彈，範圍104px" },
                { COUNT: 1, DESCRIPTION: "每5秒丟1顆冰彈，範圍113px" },
                { COUNT: 1, DESCRIPTION: "每5秒丟1顆冰彈，範圍122px" },
                { COUNT: 1, DESCRIPTION: "每5秒丟1顆冰彈，範圍130px" },
                { COUNT: 1, DESCRIPTION: "每5秒丟1顆冰彈，範圍139px" },
                { COUNT: 1, DESCRIPTION: "每5秒丟1顆冰彈，範圍148px" },
                { COUNT: 1, DESCRIPTION: "每5秒丟1顆冰彈，範圍156px" }
            ]
        },
        // 新武器：抽象化（灰妲專屬技能，被動回避）
        ABSTRACTION: {
            NAME: "抽象化",
            DAMAGE: 0, // 被動技能，不造成傷害
            COOLDOWN: 0, // 被動技能，無冷卻
            // 回避率配置（LV1~LV10）
            DODGE_RATES: [0.05, 0.07, 0.09, 0.11, 0.13, 0.15, 0.17, 0.19, 0.21, 0.25],
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "5%迴避傷害" },
                { COUNT: 1, DESCRIPTION: "7%迴避傷害" },
                { COUNT: 1, DESCRIPTION: "9%迴避傷害" },
                { COUNT: 1, DESCRIPTION: "11%迴避傷害" },
                { COUNT: 1, DESCRIPTION: "13%迴避傷害" },
                { COUNT: 1, DESCRIPTION: "15%迴避傷害" },
                { COUNT: 1, DESCRIPTION: "17%迴避傷害" },
                { COUNT: 1, DESCRIPTION: "19%迴避傷害" },
                { COUNT: 1, DESCRIPTION: "21%迴避傷害" },
                { COUNT: 1, DESCRIPTION: "25%迴避傷害" }
            ]
        },
        // 融合技能：狂熱大波（持有並滿級 應援棒(DAGGER) 與 大波球(BIG_ICE_BALL) 後可獲得）
        FRENZY_ICE_BALL: {
            NAME: "狂熱大波",
            DAMAGE: 2, // 基礎傷害為2
            COOLDOWN: 5000, // 每5秒
            // 範圍固定為大波球LV10的範圍（156px）
            FIELD_RADIUS: 156,
            // 拋物線飛行時間固定1秒
            PROJECTILE_FLIGHT_TIME: 1000,
            // 地面特效持續時間3秒
            FIELD_DURATION: 3000,
            // 緩速效果（與大波球相同）
            SLOW_FACTOR: 0.5, // 50%速度
            SLOW_DURATION_MS: 1000, // 緩速持續時間（毫秒）
            // 傷害間隔（與守護領域相同）
            TICK_INTERVAL_MS: 120,
            // 一次丟出5顆
            PROJECTILE_COUNT: 5,
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每5秒丟5顆冰彈，基礎傷害+1" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+1" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+1" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+1" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+1" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+1" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+1" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+1" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+1" },
                { COUNT: 1, DESCRIPTION: "基礎傷害+1" }
            ]
        },
        // 通用技能：召喚AI（一次性召喚，持續到遊戲結束）
        SUMMON_AI: {
            NAME: "召喚AI",
            DAMAGE: 0, // 召喚技能，不直接造成傷害（AI會使用連鎖閃電或狂熱雷擊）
            COOLDOWN: 0, // 一次性技能，無冷卻
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "召喚一個AI生命體跟隨玩家，使用LV10連鎖閃電" },
                { COUNT: 1, DESCRIPTION: "召喚一個AI生命體跟隨玩家，使用LV10狂熱雷擊" }
            ]
        },
        // 融合技能：幼妲天使（持有並滿級 應援棒(DAGGER) 與 幼妲光輝(YOUNG_DADA_GLORY) 後可獲得）
        FRENZY_YOUNG_DADA_GLORY: {
            NAME: "幼妲天使",
            DAMAGE: 0, // 補血技能，不造成傷害
            COOLDOWN: 5000, // 每5秒
            DURATION: 3000, // 聖光特效持續時間3秒（比幼妲光輝更長）
            // LV1~LV10 補血量：20, 25, 30, 35, 40, 45, 50, 55, 60, 65
            HEAL_AMOUNTS: [20, 25, 30, 35, 40, 45, 50, 55, 60, 65],
            LEVELS: [
                { COUNT: 1, DESCRIPTION: "每5秒補血+20" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+25" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+30" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+35" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+40" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+45" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+50" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+55" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+60" },
                { COUNT: 1, DESCRIPTION: "每5秒補血+65" }
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
            },
            'rokurost': {
                IMAGE_KEY: 'playerN3', // 使用 playerN3.png 變身圖片（267x300）
                ULTIMATE_WEAPONS: ['MUFFIN_THROW', 'ROTATING_MUFFIN', 'UNCONTROLLABLE_BEAST'], // LV10的鬆餅投擲、旋轉鬆餅、不獸控制
                EXTRA_HP: 600, // 大絕期間HP暫時+600
                PLAYER_SIZE_MULTIPLIER: 2.5 // 使用預設體型放大倍率
            },
            'rabi': {
                // 艾比大绝：不变身，直接施放全地图爆炸
                IS_EXPLOSION_ULTIMATE: true, // 标记为爆炸大绝
                AUDIO_KEY: 'Explosion' // 使用Explosion.mp3音效
            }
            // 'lilylinglan': 第三位角色大招暫未製作
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
            description: `角色介紹：全方面平均，可變身成三角形，穩健新手選擇。\n專屬技能：綿羊護體、紳士綿羊、追蹤綿羊、唱歌`,
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
            description: `角色介紹：元氣灰鸚鵡，有著卓越體質，特別耐扛！\n專屬技能：雞腿庇佑、幼妲光輝、大波球、抽象化`,
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
            // 專屬技能：只有灰妲角色可以看到雞腿庇佑、幼妲光輝、大波球、抽象化
            exclusiveWeapons: ['CHICKEN_BLESSING', 'YOUNG_DADA_GLORY', 'BIG_ICE_BALL', 'ABSTRACTION'],
            // 解鎖價格（遊戲金幣）；若 <=0 則視為預設解鎖
            unlockCost: 10000
        },
        {
            id: 'lilylinglan',
            name: '森森鈴蘭',
            // 第三位角色：初始血量比第一位角色多 2000，其餘基礎數值相同
            hpMultiplier: 1.0,
            hpBonus: 2000, 
            speedMultiplier: 1.0,
            description: `角色介紹：傳說中的未知信號，被她抓到，就會被馬桶坐坐！\n專屬技能：暫無`,
            // 選角預覽圖（下方角色介紹用）：使用 player3-2.png
            avatarImageKey: 'player3-2',
            // 所有模式的 HUD 左上角頭像：使用 player3-2.png
            hudImageKey: 'player3-2',
            // 所有模式進入時的玩家主體形象：使用 player3.gif
            spriteImageKey: 'player3',
            // 生存模式升級介面左側底圖：使用 player3-2.png
            levelUpBgKey: 'player3-2',
            // 第三位角色暫時不能使用大絕（Q），專屬技能還沒製作
            canUseUltimate: false,
            disabledWeapons: [],
            // 專屬技能：暫無
            exclusiveWeapons: [],
            // 解鎖價格（遊戲金幣）：100萬金幣
            unlockCost: 1000000
        },
        {
            id: 'rokurost',
            name: '洛可洛斯特',
            // 第四位角色：初始爆擊率比第一位角色多10%，其他基礎數值與第一位角色完全相同
            hpMultiplier: 1.0,
            hpBonus: 0,
            speedMultiplier: 1.0,
            critChanceBonusPct: 0.10, // 初始爆擊率+10%
            description: `角色介紹：氣質鍊金術師，許多人謠傳她的本體是個鬆餅，可變身成胖貓！\n專屬技能：旋轉鬆餅、鬆餅投擲、死線戰士、不獸控制`,
            // 選角預覽圖（下方角色介紹用）：使用 player4-3.png
            avatarImageKey: 'player4-2',
            // 所有模式的 HUD 左上角頭像：使用 player4-2.png
            hudImageKey: 'player4-2',
            // 所有模式進入時的玩家主體形象：使用 player4.png
            spriteImageKey: 'player4',
            // 生存模式升級介面左側底圖：使用 player4-2.png
            levelUpBgKey: 'player4-2',
            // 第四位角色可以使用大絕（Q）
            canUseUltimate: true,
            disabledWeapons: [],
            // 專屬技能：旋轉鬆餅、鬆餅投擲、死線戰士、不獸控制
            exclusiveWeapons: ['ROTATING_MUFFIN', 'MUFFIN_THROW', 'DEATHLINE_WARRIOR', 'UNCONTROLLABLE_BEAST'],
            // 解鎖價格（遊戲金幣）：1萬金幣
            unlockCost: 10000
        },
        {
            id: 'rabi',
            name: '艾比Rabi',
            // 第五位角色：初始血量比瑪格麗特多50，其他基礎數值與瑪格麗特完全相同
            hpMultiplier: 1.0,
            hpBonus: 50,
            speedMultiplier: 1.0,
            description: `角色介紹：常常迷路的神界教主，是隻小兔子，偶爾會星爆？\n專屬技能：心意相隨、心意相通、心意傳遞、裁決`,
            // 選角預覽圖（下方角色介紹用）：使用 player5-3.png
            avatarImageKey: 'player5-2',
            // 所有模式的 HUD 左上角頭像：使用 player5-2.png
            hudImageKey: 'player5-2',
            // 所有模式進入時的玩家主體形象：使用 player5.png (500X467)
            spriteImageKey: 'player5',
            // 生存模式升級介面左側底圖：使用 player5-2.png
            levelUpBgKey: 'player5-2',
            // 第五位角色可以使用大絕（Q），但這次先不更新專屬大絕
            canUseUltimate: true,
            disabledWeapons: [],
            // 專屬技能：心意相隨、心意相通、心意傳遞、裁決
            exclusiveWeapons: ['HEART_COMPANION', 'HEART_CONNECTION', 'HEART_TRANSMISSION', 'JUDGMENT'],
            // 解鎖價格（遊戲金幣）：1萬金幣
            unlockCost: 10000
        }
    ],
    
    // 新增：地圖列表（背景鍵）
    MAPS: [
        { id: 'city', name: '廁所', backgroundKey: 'background' },
        { id: 'forest', name: '草原', backgroundKey: 'background1-2' },
        { id: 'desert', name: '宇宙', backgroundKey: 'background1-3' },
        { id: 'garden', name: 'LV4.花園', backgroundKey: 'background8' },
        { id: 'intersection', name: 'LV5.路口', backgroundKey: 'background12' },
        { id: 'challenge-1', name: 'LV1.銀河系', backgroundKey: 'background4' },
        { id: 'challenge-2', name: 'LV2.星雲', backgroundKey: 'background5' },
        { id: 'challenge-3', name: 'LV3.星軌', backgroundKey: 'background6' },
        { id: 'challenge-4', name: 'LV4.黑洞', backgroundKey: 'background7' },
        { id: 'defense-1', name: 'LV1.魔法糖果煉金坊', backgroundKey: 'background1-2' },
        // 主線模式地圖（不分難度）：測試用地圖
        { id: 'main-test', name: '測試用地圖', backgroundKey: 'background3' },
        // 冒險模式地圖：異世界（獨立於主體遊戲的世界）
        { id: 'adventure-isekai', name: '異世界', backgroundKey: 'background9' },
        // 3D模式地圖：DEMO城市
        { id: '3d-demo-city', name: 'DEMO城市', backgroundKey: 'background11' }
    ],

    // 難度模式倍率（影響生成速度、生成數量、移動速度等）
    // 注意：血量調整已移至 CONFIG.TUNING，不再使用此處的血量倍率
    DIFFICULTY: {
        EASY: {
            NAME: '簡單',
            spawnIntervalMultiplier: 1.15,
            spawnCountMultiplier: 0.9,
            enemySpeedMultiplier: 1.0,
            bossRangedEnabled: false,
            maxEnemiesBonusMin: 0,
            maxEnemiesBonusMax: 0
        },
        HARD: {
            NAME: '困難',
            spawnIntervalMultiplier: 0.85,
            spawnCountMultiplier: 1.2,
            enemySpeedMultiplier: 1.2,
            bossRangedEnabled: true,
            maxEnemiesBonusMin: 50,   // 比簡單上限多50~100
            maxEnemiesBonusMax: 100
        },
        ASURA: {
            NAME: '修羅',
            spawnIntervalMultiplier: 0.85,
            spawnCountMultiplier: 1.2,
            enemySpeedMultiplier: 1.7,
            bossRangedEnabled: true,
            maxEnemiesBonusMin: 50,
            maxEnemiesBonusMax: 100
        }
    },

    // ============================================================================
    // 敵人基礎屬性配置
    // ============================================================================
    // 維護說明：
    // 1. 此處定義所有敵人的基礎屬性（血量、傷害、速度、尺寸等）
    // 2. 實際遊戲中的血量會根據地圖、難度、波次在 CONFIG.TUNING 中調整
    // 3. 敵人按地圖順序排列：第1張（廁所）→ 第2張（草原）→ 第3張（宇宙）→ BOSS類
    // 4. 每個敵人類型包含以下屬性：
    //    - NAME: 顯示名稱
    //    - HEALTH: 基礎血量（實際血量由 CONFIG.TUNING 控制）
    //    - DAMAGE: 攻擊傷害（對玩家造成的傷害）
    //    - SPEED: 移動速度（像素/幀）
    //    - SIZE: 敵人尺寸（像素，用於渲染）
    //    - EXPERIENCE: 擊殺後獲得的經驗值
    //    - COLLISION_RADIUS: 碰撞半徑（用於碰撞檢測）
    //    - RANGED_ATTACK: 遠程攻擊參數（僅BOSS類有）
    // ============================================================================
    ENEMIES: {
        // ========================================================================
        // 第1張地圖：廁所 (city) - 基礎敵人
        // ========================================================================
        ZOMBIE: {
            NAME: "殭屍",
            HEALTH: 30,              // 基礎血量（實際血量由 CONFIG.TUNING 控制）
            DAMAGE: 10,               // 攻擊傷害
            SPEED: 1,                 // 移動速度
            SIZE: 32,                 // 渲染尺寸
            EXPERIENCE: 5,            // 擊殺經驗值
            COLLISION_RADIUS: 16      // 碰撞半徑
        },
        SKELETON: {
            NAME: "骷髏",
            HEALTH: 20,               // 基礎血量
            DAMAGE: 15,               // 攻擊傷害
            SPEED: 1.5,               // 移動速度（比殭屍快）
            SIZE: 32,                 // 渲染尺寸
            EXPERIENCE: 8,            // 擊殺經驗值
            COLLISION_RADIUS: 16      // 碰撞半徑
        },
        GHOST: {
            NAME: "幽靈",
            HEALTH: 15,               // 基礎血量（血量最低但速度快）
            DAMAGE: 20,               // 攻擊傷害（傷害最高）
            SPEED: 2,                 // 移動速度（最快）
            SIZE: 32,                 // 渲染尺寸
            EXPERIENCE: 10,           // 擊殺經驗值（最高）
            COLLISION_RADIUS: 16      // 碰撞半徑
        },
        
        // ========================================================================
        // 第2張地圖：草原 (forest) - 強化敵人
        // ========================================================================
        ZOMBIE2: {
            NAME: "殭屍",
            HEALTH: 40,               // 基礎血量（比第1張地圖+10）
            DAMAGE: 15,                // 攻擊傷害（比第1張地圖+5）
            SPEED: 1,                  // 移動速度（與第1張相同）
            SIZE: 32,                  // 渲染尺寸
            EXPERIENCE: 5,            // 擊殺經驗值
            COLLISION_RADIUS: 16      // 碰撞半徑
        },
        SKELETON2: {
            NAME: "骷髏",
            HEALTH: 30,                // 基礎血量（比第1張地圖+10）
            DAMAGE: 20,                // 攻擊傷害（比第1張地圖+5）
            SPEED: 1.5,                // 移動速度（與第1張相同）
            SIZE: 32,                  // 渲染尺寸
            EXPERIENCE: 8,             // 擊殺經驗值
            COLLISION_RADIUS: 16      // 碰撞半徑
        },
        GHOST2: {
            NAME: "幽靈",
            HEALTH: 25,                // 基礎血量（比第1張地圖+10）
            DAMAGE: 25,                // 攻擊傷害（比第1張地圖+5）
            SPEED: 2,                  // 移動速度（與第1張相同）
            SIZE: 32,                  // 渲染尺寸
            EXPERIENCE: 10,            // 擊殺經驗值
            COLLISION_RADIUS: 16      // 碰撞半徑
        },
        
        // ========================================================================
        // 第3張地圖：宇宙 (desert) - 高級敵人
        // ========================================================================
        ZOMBIE3: {
            NAME: "殭屍",
            HEALTH: 50,               // 基礎血量（比第1張地圖+20）
            DAMAGE: 20,                // 攻擊傷害（比第1張地圖+10）
            SPEED: 1,                  // 移動速度（與第1張相同）
            SIZE: 32,                  // 渲染尺寸
            EXPERIENCE: 5,             // 擊殺經驗值
            COLLISION_RADIUS: 16      // 碰撞半徑
        },
        SKELETON3: {
            NAME: "骷髏",
            HEALTH: 40,                // 基礎血量（比第1張地圖+20）
            DAMAGE: 25,                // 攻擊傷害（比第1張地圖+10）
            SPEED: 1.5,                 // 移動速度（與第1張相同）
            SIZE: 32,                   // 渲染尺寸
            EXPERIENCE: 8,              // 擊殺經驗值
            COLLISION_RADIUS: 16       // 碰撞半徑
        },
        GHOST3: {
            NAME: "幽靈",
            HEALTH: 35,                // 基礎血量（比第1張地圖+20）
            DAMAGE: 30,                // 攻擊傷害（比第1張地圖+10）
            SPEED: 2,                   // 移動速度（與第1張相同）
            SIZE: 32,                   // 渲染尺寸
            EXPERIENCE: 10,             // 擊殺經驗值
            COLLISION_RADIUS: 16       // 碰撞半徑
        },
        
        // ========================================================================
        // 第4張地圖：花園 (garden) - 花精靈系列
        // ========================================================================
        ELF: {
            NAME: "花精靈",
            HEALTH: 60,                // 基礎血量（比第1張地圖+30）
            DAMAGE: 20,                // 攻擊傷害（比第1張地圖+10）
            SPEED: 1,                   // 移動速度
            SIZE: 50,                   // 渲染尺寸（實際圖片100x98，按比例縮放）
            EXPERIENCE: 5,              // 擊殺經驗值
            COLLISION_RADIUS: 16       // 碰撞半徑
        },
        ELF2: {
            NAME: "花精靈2",
            HEALTH: 50,                // 基礎血量（比第1張地圖+30）
            DAMAGE: 25,                // 攻擊傷害（比第1張地圖+10）
            SPEED: 1.5,                 // 移動速度
            SIZE: 50,                   // 渲染尺寸（實際圖片110x101，按比例縮放）
            EXPERIENCE: 8,              // 擊殺經驗值
            COLLISION_RADIUS: 16       // 碰撞半徑
        },
        ELF3: {
            NAME: "花精靈3",
            HEALTH: 45,                // 基礎血量（比第1張地圖+30）
            DAMAGE: 30,                // 攻擊傷害（比第1張地圖+10）
            SPEED: 2,                   // 移動速度
            SIZE: 50,                   // 渲染尺寸（實際圖片100x100，按比例縮放）
            EXPERIENCE: 10,             // 擊殺經驗值
            COLLISION_RADIUS: 16       // 碰撞半徑
        },
        // 第4張地圖專用：花園BOSS系列
        // 維護備註：基礎值與第3張地圖（宇宙）BOSS系列完全相同
        ELF_MINI_BOSS: {
            NAME: "花護衛",
            HEALTH: 600,               // 基礎血量（與MINI_BOSS相同）
            DAMAGE: 35,                // 攻擊傷害（+10）
            SPEED: 0.8,                // 移動速度（與MINI_BOSS相同）
            SIZE: 160,                  // 渲染尺寸（實際圖片200x194，按比例縮放）
            EXPERIENCE: 50,            // 擊殺經驗值（與MINI_BOSS相同）
            COLLISION_RADIUS: 80,      // 碰撞半徑（與MINI_BOSS相同）
            // 遠程攻擊參數（僅在困難模式及以上啟用）
            RANGED_ATTACK: {
                ENABLED: true,         // 是否啟用遠程攻擊
                RANGE: 250,            // 攻擊範圍（像素）
                COOLDOWN: 3500,        // 冷卻時間（毫秒）
                PROJECTILE_DAMAGE: 40, // 投射物傷害
                PROJECTILE_SPEED: 5,   // 投射物速度
                PROJECTILE_SIZE: 18,   // 投射物大小
                HOMING: true,          // 是否追蹤玩家
                TURN_RATE: 2.0         // 追蹤轉向速率（弧度/秒）
            }
        },
        ELF_BOSS: {
            NAME: "花女王",
            HEALTH: 5000,              // 基礎血量（與BOSS相同）
            DAMAGE: 50,                 // 攻擊傷害（+10）
            SPEED: 0.7,                 // 移動速度（與BOSS相同）
            SIZE: 300,                  // 渲染尺寸（實際圖片400x382，按比例縮放）
            EXPERIENCE: 500,            // 擊殺經驗值（與BOSS相同）
            COLLISION_RADIUS: 150,      // 碰撞半徑（與BOSS相同）
            // 遠程攻擊參數（僅在困難模式及以上啟用）
            RANGED_ATTACK: {
                ENABLED: true,          // 是否啟用遠程攻擊
                RANGE: 500,              // 攻擊範圍（像素）
                COOLDOWN: 2500,          // 冷卻時間（毫秒）
                PROJECTILE_DAMAGE: 60,   // 投射物傷害
                PROJECTILE_SPEED: 6,     // 投射物速度
                PROJECTILE_SIZE: 24,     // 投射物大小
                HOMING: true,            // 是否追蹤玩家
                TURN_RATE: 2.5           // 追蹤轉向速率（弧度/秒）
            }
        },

        // ========================================================================
        // 第5張地圖：路口 (intersection) - 人類系列
        // - 小怪基礎生命：相對第1張地圖 +40
        // - 小怪基礎傷害：相對第1張地圖 +15
        // - 小BOSS/大BOSS：基礎生命不變；基礎傷害 +20；投射物傷害 +10
        // - 圖片比例：human(69x100), human2(73x100), human3(64x100), human_mini_boss(169x200), humanboss(300x325)
        // ========================================================================
        // 小怪系列
        HUMAN1: {
            NAME: "人類1",
            HEALTH: 70,               // ZOMBIE(30) + 40
            DAMAGE: 25,               // ZOMBIE(10) + 15
            SPEED: 1,                 // 移動速度
            SIZE: 50,                 // 渲染高度（以高度為基準）
            WIDTH: 35,                // 50 * (69/100) ≈ 35
            HEIGHT: 50,
            EXPERIENCE: 5,            // 擊殺經驗值
            COLLISION_RADIUS: 16      // 碰撞半徑
        },
        HUMAN2: {
            NAME: "人類2",
            HEALTH: 60,               // SKELETON(20) + 40
            DAMAGE: 30,               // SKELETON(15) + 15
            SPEED: 1.5,               // 移動速度
            SIZE: 50,                 // 渲染高度（以高度為基準）
            WIDTH: 37,                // 50 * (73/100) ≈ 37
            HEIGHT: 50,
            EXPERIENCE: 8,            // 擊殺經驗值
            COLLISION_RADIUS: 16,     // 碰撞半徑
            // 遠程投擲（瓶子）：偵測範圍/冷卻時間與小BOSS火彈相同
            // 注意：實際投擲物為拋物線（BottleProjectile），不追蹤玩家
            RANGED_ATTACK: {
                ENABLED: true,
                RANGE: 250,            // 與 MINI_BOSS 相同
                COOLDOWN: 3500,        // 與 MINI_BOSS 相同
                PROJECTILE_DAMAGE: 15,
                PROJECTILE_SPEED: 5    // 與 MINI_BOSS 相同（用於估算飛行時間/彈道）
            }
        },
        HUMAN3: {
            NAME: "人類3",
            HEALTH: 55,               // GHOST(15) + 40
            DAMAGE: 35,               // GHOST(20) + 15
            SPEED: 2,                 // 移動速度
            SIZE: 50,                 // 渲染高度（以高度為基準）
            WIDTH: 32,                // 50 * (64/100) ≈ 32
            HEIGHT: 50,
            EXPERIENCE: 10,           // 擊殺經驗值
            COLLISION_RADIUS: 16      // 碰撞半徑
        },
        
        // BOSS系列
        HUMAN_MINI_BOSS: {
            NAME: "混混",
            HEALTH: 600,              // 基礎生命不變（同 MINI_BOSS）
            DAMAGE: 45,               // MINI_BOSS(25) + 20
            SPEED: 0.8,               // 移動速度
            SIZE: 160,                // 渲染高度（以高度為基準）
            WIDTH: 135,               // 160 * (169/200) ≈ 135
            HEIGHT: 160,
            EXPERIENCE: 50,           // 擊殺經驗值
            COLLISION_RADIUS: 80,     // 碰撞半徑
            RANGED_ATTACK: {
                ENABLED: true,          // 是否啟用遠程攻擊
                RANGE: 250,             // 攻擊範圍（像素）
                COOLDOWN: 3500,         // 冷卻時間（毫秒）
                PROJECTILE_DAMAGE: 50,  // MINI_BOSS(40) + 10
                PROJECTILE_SPEED: 5,    // 投射物速度
                PROJECTILE_SIZE: 18,    // 投射物大小
                HOMING: true,           // 是否追蹤玩家
                TURN_RATE: 2.0          // 追蹤轉向速率（弧度/秒）
            }
        },
        HUMAN_BOSS: {
            NAME: "資本家",
            HEALTH: 5000,             // 基礎生命不變（同 BOSS）
            DAMAGE: 60,               // BOSS(40) + 20
            SPEED: 0.7,               // 移動速度
            SIZE: 300,                // 渲染高度（以高度為基準）
            WIDTH: 277,               // 300 * (300/325) ≈ 277
            HEIGHT: 300,
            EXPERIENCE: 500,          // 擊殺經驗值
            COLLISION_RADIUS: 150,    // 碰撞半徑
            RANGED_ATTACK: {
                ENABLED: true,          // 是否啟用遠程攻擊
                RANGE: 500,             // 攻擊範圍（像素）
                COOLDOWN: 2500,         // 冷卻時間（毫秒）
                PROJECTILE_DAMAGE: 70,  // BOSS(60) + 10
                PROJECTILE_SPEED: 6,    // 投射物速度
                PROJECTILE_SIZE: 24,    // 投射物大小
                HOMING: true,           // 是否追蹤玩家
                TURN_RATE: 2.5          // 追蹤轉向速率（弧度/秒）
            }
        },
        
        // ========================================================================
        // BOSS類敵人（通用）
        // 放在所有地圖段落之後，讓 CONFIG.ENEMIES 可依地圖順序往下閱讀
        // ========================================================================
        MINI_BOSS: {
            NAME: "小BOSS",
            HEALTH: 600,               // 基礎血量（實際血量由 CONFIG.TUNING 控制）
            DAMAGE: 25,                // 攻擊傷害
            SPEED: 0.8,                // 移動速度（較慢）
            SIZE: 160,                 // 渲染尺寸（較大）
            EXPERIENCE: 50,            // 擊殺經驗值
            COLLISION_RADIUS: 80,     // 碰撞半徑
            // 遠程攻擊參數（僅在困難模式及以上啟用）
            RANGED_ATTACK: {
                ENABLED: true,         // 是否啟用遠程攻擊
                RANGE: 250,            // 攻擊範圍（像素）
                COOLDOWN: 3500,        // 冷卻時間（毫秒）
                PROJECTILE_DAMAGE: 40, // 投射物傷害
                PROJECTILE_SPEED: 5,   // 投射物速度
                PROJECTILE_SIZE: 18,   // 投射物大小
                HOMING: true,          // 是否追蹤玩家
                TURN_RATE: 2.0         // 追蹤轉向速率（弧度/秒）
            }
        },
        BOSS: {
            NAME: "大BOSS",
            HEALTH: 5000,              // 基礎血量（實際血量由 CONFIG.TUNING 控制）
            DAMAGE: 40,                 // 攻擊傷害
            SPEED: 0.7,                 // 移動速度（最慢）
            SIZE: 300,                  // 渲染尺寸（最大）
            EXPERIENCE: 500,            // 擊殺經驗值（最高）
            COLLISION_RADIUS: 150,      // 碰撞半徑
            // 遠程攻擊參數（僅在困難模式及以上啟用）
            RANGED_ATTACK: {
                ENABLED: true,          // 是否啟用遠程攻擊
                RANGE: 500,              // 攻擊範圍（像素）
                COOLDOWN: 2500,          // 冷卻時間（毫秒）
                PROJECTILE_DAMAGE: 60,   // 投射物傷害
                PROJECTILE_SPEED: 6,     // 投射物速度
                PROJECTILE_SIZE: 24,     // 投射物大小
                HOMING: true,            // 是否追蹤玩家
                TURN_RATE: 2.5           // 追蹤轉向速率（弧度/秒）
            }
        }
    },
    
    // 經驗值設置
    EXPERIENCE: {
        SIZE: 16,
        VALUE: 5,
        LEVEL_UP_BASE: 80,
        LEVEL_UP_MULTIPLIER: 1.12,
        // 升級經驗曲線調整（避免後期指數爆炸）
        // - Lv1~SOFTCAP_LEVEL：沿用舊公式 LEVEL_UP_BASE * LEVEL_UP_MULTIPLIER^(level-1)
        // - Lv(SOFTCAP_LEVEL+1)+：改用較緩的增長（小倍率 + 線性補償），讓後期不會跨太誇張
        SOFTCAP_LEVEL: 20,
        // 目標：20波左右等級由 ~55 拉近到 ~70（降低 20+ 後期成長斜率）
        LEVEL_UP_MULTIPLIER_LATE: 1.055,
        LEVEL_UP_LINEAR_LATE: 0
    },
    
    // 波次設置
    WAVES: {
        DURATION: 60000, // 每波持續60秒
        MINI_BOSS_INTERVAL: 180000, // 每3分鐘出現小BOSS
        BOSS_WAVE: 20, // 第20波出現大BOSS（玩家可在20波時擊敗大BOSS獲勝）
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

    // ============================================================================
    // 生存模式敵人血量配置（依地圖、難度、波次）
    // ============================================================================
    // 說明：
    // 1. 所有敵人的基礎屬性（傷害、速度、尺寸等）保持不變
    // 2. 僅調整血量部分，按照簡單(EASY)、困難(HARD)、修羅(ASURA)的方式
    // 3. 小怪血量：第1波使用基礎值，第30波達到最大值，中間按波次遞增
    // 4. 小BOSS血量：第1波使用起始值，第30波達到結束值，中間按波次遞增
    // 5. 大BOSS血量：僅在第30波出現，使用固定值
    // ============================================================================
    TUNING: {
        // 普通小怪血量配置（依地圖與難度）
        // 格式：{ baseHealth: 基礎血量, maxHealthWave30: 第30波最大血量 }
        // 注意：基礎血量會根據地圖自動調整（第1張+0，第2張+10，第3張+20）
        ENEMY_HEALTH: {
            // 第一張地圖：廁所 (city)
            city: {
                // 簡單模式：小怪基礎值~335（第1波基礎值，第30波335）
                EASY: {
                    baseHealth: 0,        // 基礎值加成（第1張地圖為0）
                    maxHealthWave30: 335  // 第30波最大血量
                },
                // 困難模式：小怪(基礎值+10)~5203（第1波基礎值+10，第30波5203）
                HARD: {
                    baseHealth: 10,        // 基礎值加成（基礎值+10）
                    maxHealthWave30: 5203 // 第30波最大血量
                }
            },
            // 第二張地圖：草原 (forest)
            forest: {
                // 簡單模式：小怪(基礎值+10)~1000（第1波基礎值+10，第30波1000）
                EASY: {
                    baseHealth: 10,        // 基礎值加成（基礎值+10）
                    maxHealthWave30: 1000 // 第30波最大血量
                },
                // 困難模式：小怪(基礎值+20)~8000（第1波基礎值+20，第30波8000）
                HARD: {
                    baseHealth: 20,        // 基礎值加成（基礎值+20）
                    maxHealthWave30: 8000 // 第30波最大血量
                }
            },
            // 第三張地圖：宇宙 (desert)
            desert: {
                // 困難模式：小怪(基礎值+15)~10000（第1波基礎值+15，第30波10000）
                HARD: {
                    baseHealth: 15,         // 基礎值加成（基礎值+15）
                    maxHealthWave30: 10000  // 第30波最大血量
                },
                // 修羅模式：小怪(基礎值+20)~12000（第1波基礎值+20，第30波12000）
                ASURA: {
                    baseHealth: 20,         // 基礎值加成（基礎值+20）
                    maxHealthWave30: 12000 // 第30波最大血量
                }
            },
            // 第四張地圖：花園 (garden)
            garden: {
                // 簡單模式：花精靈基礎值~10000（第1波基礎值，第30波10000）
                EASY: {
                    baseHealth: 15,          // 基礎值加成（基礎值+15）
                    maxHealthWave30: 10000  // 第30波最大血量
                },
                // 困難模式：花精靈(基礎值+50)~15000（第1波基礎值+50，第30波15000）
                HARD: {
                    baseHealth: 50,         // 基礎值加成（基礎值+50）
                    maxHealthWave30: 15000  // 第30波最大血量
                }
            }
            ,
            // 第五張地圖：路口 (intersection)
            intersection: {
                // 1~30波 EASY：小怪(基礎值+20)~12000
                EASY: {
                    baseHealth: 20,
                    maxHealthWave30: 12000
                },
                // 1~30波 HARD：小怪(基礎值+80)~18000
                HARD: {
                    baseHealth: 80,
                    maxHealthWave30: 18000
                }
            }
        },
        
        // 小BOSS血量配置（依地圖與難度）
        // 格式：{ startWave1: 第1波血量, endWave30: 第30波血量 }
        MINI_BOSS: {
            // 第一張地圖：廁所 (city)
            city: {
                // 簡單模式：小BOSS基礎值~6716（第1波基礎值，第30波6716）
                EASY: {
                    startWave1: 600,      // 第1波血量（使用基礎值600）
                    endWave30: 6716        // 第30波血量
                },
                // 困難模式：小BOSS 1000-20000（第1波1000，第30波20000）
                HARD: {
                    startWave1: 1000,      // 第1波血量
                    endWave30: 20000       // 第30波血量
                }
            },
            // 第二張地圖：草原 (forest)
            forest: {
                // 簡單模式：小BOSS 1000~10000（第1波1000，第30波10000）
                EASY: {
                    startWave1: 1000,      // 第1波血量
                    endWave30: 10000       // 第30波血量
                },
                // 困難模式：小BOSS 2000-40000（第1波2000，第30波40000）
                HARD: {
                    startWave1: 2000,      // 第1波血量
                    endWave30: 40000       // 第30波血量
                }
            },
            // 第三張地圖：宇宙 (desert)
            desert: {
                // 困難模式：小BOSS 3000~60000（第1波3000，第30波60000）
                HARD: {
                    startWave1: 3000,      // 第1波血量
                    endWave30: 60000       // 第30波血量
                },
                // 修羅模式：小BOSS 5000-100000（第1波5000，第30波100000）
                ASURA: {
                    startWave1: 5000,      // 第1波血量
                    endWave30: 100000       // 第30波血量
                }
            },
            // 第四張地圖：花園 (garden)
            garden: {
                // 簡單模式：花護衛小BOSS 3000-50000（第1波3000，第30波50000，提升以確保明顯高於普通小怪）
                EASY: {
                    startWave1: 3000,      // 第1波血量（提升起始值，確保前期就高於普通小怪）
                    endWave30: 50000       // 第30波血量（提升結束值，確保後期明顯高於普通小怪）
                },
                // 困難模式：花護衛小BOSS 5000-300000（第1波5000，第30波300000，提升以確保明顯高於普通小怪）
                HARD: {
                    startWave1: 5000,      // 第1波血量（提升起始值，確保前期就高於普通小怪）
                    endWave30: 300000      // 第30波血量（提升結束值，確保後期明顯高於普通小怪）
                }
            }
            ,
            // 第五張地圖：路口 (intersection)
            intersection: {
                // 1~30波 EASY：小BOSS 5000~100000
                EASY: {
                    startWave1: 5000,
                    endWave30: 100000
                },
                // 1~30波 HARD：小BOSS 5000~300000
                HARD: {
                    startWave1: 5000,
                    endWave30: 300000
                }
            }
        },
        
        // 大BOSS血量配置（依地圖與難度）
        // 格式：{ wave20: 第20波血量 }
        // 注意：大BOSS僅在第20波出現（原為第30波，已縮短為20波）
        BOSS: {
            // 第一張地圖：廁所 (city)
            city: {
                // 簡單模式：使用基礎值（不調整）
                // EASY: 不設置，使用基礎值5000
                // 困難模式：大BOSS 50000
                HARD: {
                    wave20: 50000         // 第20波血量
                }
            },
            // 第二張地圖：草原 (forest)
            forest: {
                // 簡單模式：大BOSS 35000
                EASY: {
                    wave20: 35000        // 第20波血量
                },
                // 困難模式：大BOSS 100000
                HARD: {
                    wave20: 100000         // 第20波血量
                }
            },
            // 第三張地圖：宇宙 (desert)
            desert: {
                // 困難模式：大BOSS 120000
                HARD: {
                    wave20: 120000         // 第20波血量
                },
                // 修羅模式：大BOSS 150000
                ASURA: {
                    wave20: 150000        // 第20波血量
                }
            },
            // 第四張地圖：花園 (garden)
            garden: {
                // 簡單模式：花女王大BOSS 150000
                EASY: {
                    wave20: 150000         // 第20波血量
                },
                // 困難模式：花女王大BOSS 600000
                HARD: {
                    wave20: 600000        // 第20波血量
                }
            }
            ,
            // 第五張地圖：路口 (intersection)
            intersection: {
                // 1~30波 EASY：大BOSS 200000（實際只在第20波生成）
                EASY: {
                    wave20: 200000
                },
                // 1~30波 HARD：大BOSS 800000（實際只在第20波生成）
                HARD: {
                    wave20: 800000
                }
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
