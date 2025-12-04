/**
 * 修復：將所有壓縮的單行代碼展開，解決 fullLightUpdate 未定義的錯誤。
 * 包含：地獄、鑽石、弓箭、寶箱、網格合成、存檔系統、完整物理與光照。
 */

// 錯誤攔截
window.onerror = function(msg, url, line) {
    console.error("Error: " + msg + " at line " + line);
};

// ==========================================
// 1. 配置與定義
// ==========================================
const TILE_SIZE = 32;
const CHUNK_W = 2000;  // 增加5倍宽度：400 -> 2000 (容纳所有生态区)
const CHUNK_H = 300;  // 大幅增加高度：100 -> 300 (给更多探索空间) 
const GRAVITY = 0.4;
const MAX_FALL = 12;
const JUMP_FORCE = 7.5;
const ACCEL = 0.5;
const FRICTION = 0.8;
const MINING_RANGE = 5.5; 
const DAY_LEN = 72000; // 增加3倍时间（从24000改为72000）
const MAX_INVENTORY_SLOTS = 20; // 背包最大槽位數

const IDS = {
    AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, WOOD: 4, LEAVES: 5, 
    BEDROCK: 6, TORCH: 7, COAL_ORE: 8, IRON_ORE: 9, GOLD_ORE: 10,
    PLANKS: 11, BRICKS: 12, FLOWER: 13, WATER: 14, SAND: 15,
    FURNACE: 16, IRON_BAR: 17, GOLD_BAR: 18, GLASS: 19, 
    WOOD_PICK: 20, STONE_PICK: 21, IRON_PICK: 22, GOLD_PICK: 23,
    WOOD_SWORD: 30, STONE_SWORD: 31, IRON_SWORD: 32, GOLD_SWORD: 33,
    WOOD_WALL: 40, STONE_WALL: 41, SAPLING: 42, TABLE: 43, CHAIR: 44,
    LAVA: 45, BED: 46, SNOW: 47, ICE: 48, TNT: 49,
    ASH: 50, HELLSTONE: 51, HELL_BRICK: 52, DIAMOND_ORE: 53, DIAMOND: 54,
    DIAMOND_PICK: 55, DIAMOND_SWORD: 56,
    WOOD_PLATFORM: 57, GLASS_WALL: 58, BRICK_WALL: 59, BOOKSHELF: 60,
    CHEST: 61, WOOD_BOW: 62, ARROW: 63,
    LOOT_CHEST: 64, 
    DOOR_CLOSED: 65, 
    DOOR_OPEN: 66,
    // --- 新增 BOSS 召喚物 ID ---
    EYE_SUMMON: 70,
    // --- 天空生態系 ---
    CLOUD: 71, SUNPLATE: 72, SKYWARE_CHEST: 73,
    // --- 新武器與道具 ---
    MAGIC_STAFF: 80, HEALTH_POTION: 81, STARFURY: 82,
    // --- 腐化之地 ---
    EBONSTONE: 100, EATER_OF_SOULS: 101,
    // --- 道具 ---
    MANA_CRYSTAL: 102, // 增加魔力上限
    CLOUD_IN_BOTTLE: 103, // 二段跳飾品
    // --- 農耕與林業 ---
    HOE: 110, TILLED_DIRT: 111, SEEDS: 112, WHEAT_CROP: 113, WHEAT: 114, BREAD: 115,
    ACORN: 116, WHEAT_RIPE: 117,
    // --- 建築與裝飾 ---
    FENCE: 120, LANTERN: 121, CAMPFIRE: 122,
    // --- 經濟與裝備 ---
    COIN: 130, 
    HELMET_WOOD: 131, HELMET_IRON: 132, HELMET_MINER: 133, // 礦工頭盔(會發光)
    NPC_MERCHANT: 140, // 商人實體 ID
    // --- 工藝站與材料 ---
    WORKBENCH: 150, ANVIL: 151,
    CLAY: 152, RED_BRICK: 153, CLAY_POT: 154,
    // --- 環境物件 ---
    POT: 155, // 野外生成的罐子
    // --- 攀爬與材料 ---
    COBWEB: 160, SILK: 161, ROPE: 162, CHAIN: 163,
    // --- 裝修工具 ---
    HAMMER: 170, PAINT_BRUSH: 171,
    PAINT_RED: 172, PAINT_GREEN: 173, PAINT_BLUE: 174,
    // --- 家具 ---
    SIGN: 175,
    // --- 叢林生態 ---
    MUD: 180, JUNGLE_GRASS: 181, JUNGLE_SPORES: 182, VINE: 183,
    STINGER: 184, // 黃蜂掉落物
    // --- 武器與工具 ---
    GRAPPLING_HOOK: 190, 
    BOOMERANG: 191,
    BLADE_OF_GRASS: 192,
    // 怪物 ID (用於標記類型，不作為方塊)
    DEMON_EYE: 90, SKELETON: 91, HORNET: 195,
    // --- 高科技/魔法 ---
    TELEPORTER: 200,
    // --- 釣魚工具與漁獲 ---
    WOOD_FISHING_ROD: 210,
    RAW_FISH: 211, COOKED_FISH: 212,
    TRASH: 213, // 破鞋子之類的
    GOLDEN_CARP: 214, // 值錢的魚
    // --- 烹飪設施 ---
    COOKING_POT: 215,
    SOUP: 216, // 魚湯
    // --- 生物與捕捉 ---
    BUG_NET: 220,
    ITEM_BUNNY: 221, ITEM_FIREFLY: 222, // 物品狀態的生物
    CARROT: 223, // 寵物召喚物
    // --- 花草與藥水 ---
    DAYBLOOM: 230, MOONGLOW: 231,
    POTION_SWIFTNESS: 232, POTION_SHINE: 233,
    // --- 容器與燈具 ---
    BOTTLE: 250, FIREFLY_IN_A_BOTTLE: 251,
    // --- 寶石礦物 (鑽石已有，新增其他) ---
    RUBY_ORE: 252, SAPPHIRE_ORE: 253, EMERALD_ORE: 254,
    RUBY: 255, SAPPHIRE: 25, EMERALD: 26,  // 修正：256->25, 257->26 (Uint8Array只能存0-255)
    // --- 晶火磚 (發光建材) ---
    GEMSPARK_RED: 27, GEMSPARK_BLUE: 28, GEMSPARK_GREEN: 29,  // 修正：260->27, 261->28, 262->29 (Uint8Array只能存0-255)
    // --- 環境物件 ---
    TOMBSTONE: 24  // 使用24（空閒ID），因為Uint8Array只能存0-255，270會溢出成14
};

const BLOCKS = {
    [IDS.AIR]:   { name: "空氣", solid: false, transparent: true },
    [IDS.DIRT]:  { name: "泥土", solid: true, hardness: 15, color: "#5d4037" },
    [IDS.GRASS]: { name: "草地", solid: true, hardness: 18, color: "#388e3c" },
    [IDS.STONE]: { name: "石頭", solid: true, hardness: 40, color: "#9e9e9e" },
    [IDS.WOOD]:  { name: "原木", solid: true, hardness: 20, color: "#5d4037", scale: 0.8 },
    [IDS.LEAVES]:{ name: "樹葉", solid: true, hardness: 5, transparent: true, color: "#2e7d32" },
    [IDS.BEDROCK]:{ name: "基岩", solid: true, hardness: 99999, color: "#000" },
    [IDS.TORCH]: { name: "火把", solid: false, light: 15, transparent: true, hardness: 1, breakInstantly: true, color: "#ffeb3b" },
    [IDS.COAL_ORE]:{ name: "煤礦", solid: true, hardness: 50, color: "#212121" },
    [IDS.IRON_ORE]:{ name: "鐵礦", solid: true, hardness: 60, color: "#a1887f" },
    [IDS.GOLD_ORE]:{ name: "金礦", solid: true, hardness: 70, color: "#ffb300" },
    [IDS.PLANKS]: { name: "木板", solid: true, hardness: 25, color: "#8d6e63" },
    [IDS.BRICKS]: { name: "石磚", solid: true, hardness: 50, color: "#616161" },
    [IDS.FLOWER]: { name: "小花", solid: false, hardness: 1, breakInstantly: true, transparent: true },
    [IDS.WATER]: { name: "水", solid: false, transparent: true, liquid: true, color: "rgba(33, 150, 243, 0.6)" },
    [IDS.SAND]:  { name: "沙子", solid: true, hardness: 10, color: "#fdd835" },
    [IDS.FURNACE]:{ name: "熔爐", solid: true, hardness: 40, color: "#424242" },
    [IDS.IRON_BAR]:{ name: "鐵錠", solid: false, color: "#b0bec5" },
    [IDS.GOLD_BAR]:{ name: "金錠", solid: false, color: "#ffeb3b" },
    [IDS.GLASS]: { name: "玻璃", solid: true, transparent: true, hardness: 2, color: "#81d4fa" },
    [IDS.WOOD_WALL]: { name: "木牆", solid: false, isWall: true, color: "#3e2723" },
    [IDS.STONE_WALL]: { name: "石牆", solid: false, isWall: true, color: "#424242" },
    [IDS.SAPLING]: { name: "樹苗", solid: false, hardness: 1, breakInstantly: true, color: "#4caf50" },
    [IDS.TABLE]: { name: "桌子", solid: true, hardness: 15, transparent: true, color: "#8d6e63" },
    [IDS.CHAIR]: { name: "椅子", solid: false, hardness: 10, transparent: true, color: "#8d6e63" },
    [IDS.LAVA]: { name: "岩漿", solid: false, transparent: true, liquid: true, light: 15, color: "#ff5722" },
    [IDS.BED]: { name: "床", solid: false, hardness: 15, transparent: true, color: "#ef5350" },
    [IDS.SNOW]: { name: "雪塊", solid: true, hardness: 10, color: "#ffffff" },
    [IDS.ICE]: { name: "冰塊", solid: true, transparent: true, hardness: 20, color: "#b3e5fc" },
    [IDS.TNT]: { name: "炸藥", solid: true, hardness: 1, color: "#d32f2f" },
    [IDS.ASH]: { name: "灰燼塊", solid: true, hardness: 15, color: "#424242" },
    [IDS.HELLSTONE]: { name: "獄石", solid: true, hardness: 80, color: "#b71c1c" },
    [IDS.HELL_BRICK]: { name: "獄石磚", solid: true, hardness: 60, color: "#5d4037" },
    [IDS.DIAMOND_ORE]: { name: "鑽石礦", solid: true, hardness: 100, color: "#29b6f6" },
    [IDS.DIAMOND]: { name: "鑽石", solid: false, hardness: 1, breakInstantly: true, color: "#00bcd4" },
    [IDS.WOOD_PLATFORM]: { name: "木平台", solid: true, platform: true, hardness: 5, transparent: true, color: "#8d6e63" },
    [IDS.GLASS_WALL]: { name: "玻璃牆", solid: false, isWall: true, color: "#81d4fa" },
    [IDS.BRICK_WALL]: { name: "磚牆", solid: false, isWall: true, color: "#616161" },
    [IDS.BOOKSHELF]: { name: "書架", solid: true, hardness: 20, transparent: true, color: "#5d4037" },
    [IDS.ARROW]: { name: "箭矢", solid: false, color: "#fff" },
    [IDS.WOOD_BOW]: { name: "木弓", solid: false, range: 400, damage: 3, color: "#8d6e63", isBow: true, durability: 40 },
    [IDS.CHEST]: { name: "箱子", solid: false, hardness: 15, transparent: true, color: "#ffb300" },
    [IDS.LOOT_CHEST]: { name: "寶箱(未開)", solid: false, hardness: 99999, transparent: true, color: "#ff6f00" }, // 探索宝箱不能被挖掘
    [IDS.DOOR_CLOSED]: { name: "門(關)", solid: true, hardness: 15, transparent: true, color: "#5d4037" },
    [IDS.DOOR_OPEN]: { name: "門(開)", solid: false, hardness: 15, transparent: true, color: "#5d4037" },
    // --- 新增 BOSS 召喚物屬性 ---
    [IDS.EYE_SUMMON]: { name: "怪異眼球 (BOSS召喚道具)", solid: false, color: "#b71c1c", scale: 0.6 },
    // --- 天空生態系 ---
    [IDS.CLOUD]: { name: "雲塊", solid: false, hardness: 5, transparent: true, color: "#f5f5f5" }, // 云块不阻挡玩家
    [IDS.SUNPLATE]: { name: "天域磚", solid: true, hardness: 60, color: "#ffd54f" },
    [IDS.SKYWARE_CHEST]: { name: "天域寶箱", solid: false, hardness: 99999, transparent: true, color: "#0288d1" },
    // --- 新武器與道具 ---
    [IDS.MAGIC_STAFF]: { name: "魔法法杖", solid: false, damage: 6, color: "#e040fb", isMagic: true, durability: 60 },
    [IDS.STARFURY]: { name: "星怒", solid: false, damage: 15, range: 250, color: "#ff4081", isMagic: true, durability: 150 },
    [IDS.HEALTH_POTION]: { name: "治療藥水", solid: false, heal: 3, color: "#f44336", consumable: true },
    // --- 腐化之地 ---
    [IDS.EBONSTONE]: { name: "黑檀石", solid: true, hardness: 60, color: "#6a1b9a" },
    // --- 新道具 ---
    [IDS.MANA_CRYSTAL]: { name: "魔力水晶", solid: false, color: "#2979ff", consumable: true },
    [IDS.CLOUD_IN_BOTTLE]: { name: "瓶中雲", solid: false, color: "#e0f7fa", passive: true }, // passive 代表被動飾品
    // --- 農耕與林業 ---
    [IDS.HOE]: { name: "鋤頭", solid: false, toolSpeed: 5, color: "#8d6e63" },
    [IDS.TILLED_DIRT]: { name: "耕地", solid: true, hardness: 10, color: "#4e342e" },
    [IDS.SEEDS]: { name: "種子", solid: false, color: "#a5d6a7" },
    [IDS.WHEAT_CROP]: { name: "小麥作物", solid: false, transparent: true, breakInstantly: true, color: "#dcedc8" },
    [IDS.WHEAT_RIPE]: { name: "成熟小麥", solid: false, transparent: true, breakInstantly: true, color: "#fdd835" }, // 金黃色
    [IDS.WHEAT]: { name: "小麥", solid: false, color: "#ffeb3b" },
    [IDS.BREAD]: { name: "麵包", solid: false, heal: 2, consumable: true, color: "#d7ccc8" },
    [IDS.ACORN]: { name: "橡實", solid: false, hardness: 1, breakInstantly: true, color: "#8d6e63" },
    // --- 裝飾建材 ---
    [IDS.FENCE]: { name: "柵欄", solid: false, isWall: true, color: "#795548" }, // 柵欄視為背景牆的一種，不阻擋移動
    [IDS.LANTERN]: { name: "吊燈", solid: false, light: 15, transparent: true, hardness: 1, breakInstantly: true, color: "#ff9800" },
    [IDS.CAMPFIRE]: { name: "營火", solid: false, light: 14, transparent: true, hardness: 5, color: "#ff5722" },
    // --- 錢幣與裝備 ---
    [IDS.COIN]: { name: "銅幣", solid: false, color: "#ffcc80", scale: 0.6 },
    [IDS.HELMET_WOOD]: { name: "木頭盔", solid: false, defense: 1, color: "#8d6e63", isArmor: true },
    [IDS.HELMET_IRON]: { name: "鐵頭盔", solid: false, defense: 3, color: "#b0bec5", isArmor: true },
    [IDS.HELMET_MINER]: { name: "礦工頭盔", solid: false, defense: 2, light: 10, color: "#ffca28", isArmor: true }, // 自帶光照
    // --- 工藝站 ---
    [IDS.WORKBENCH]: { name: "工作台", solid: false, platform: true, hardness: 15, transparent: true, color: "#8d6e63" }, // 類似平台可跳上去
    [IDS.ANVIL]: { name: "鐵砧", solid: false, hardness: 50, transparent: true, color: "#78909c" },
    // --- 材料與裝飾 ---
    [IDS.CLAY]: { name: "黏土", solid: true, hardness: 10, color: "#bcaaa4" },
    [IDS.RED_BRICK]: { name: "紅磚", solid: true, hardness: 40, color: "#d32f2f" },
    [IDS.CLAY_POT]: { name: "花盆", solid: false, hardness: 5, transparent: true, color: "#d84315" },
    // --- 環境物件 ---
    [IDS.POT]: { name: "陶罐", solid: false, hardness: 1, breakInstantly: true, transparent: true, color: "#8d6e63" },
    // --- 攀爬與材料 ---
    [IDS.COBWEB]: { name: "蜘蛛網", solid: false, hardness: 1, breakInstantly: true, transparent: true, color: "#e0e0e0", slow: true },
    [IDS.SILK]: { name: "絲線", solid: false, color: "#fafafa" },
    [IDS.ROPE]: { name: "繩索", solid: false, climbable: true, transparent: true, hardness: 1, breakInstantly: true, color: "#8d6e63" },
    [IDS.CHAIN]: { name: "鐵鍊", solid: false, climbable: true, transparent: true, hardness: 2, color: "#bdbdbd" },
    // --- 裝修工具 ---
    [IDS.HAMMER]: { name: "錘子 (拆除用)", solid: false, toolSpeed: 4, color: "#795548", durability: 100 }, // 拆牆用
    [IDS.PAINT_BRUSH]: { name: "油漆刷", solid: false, color: "#fff", durability: 40 },
    // --- 油漆 (消耗品) ---
    [IDS.PAINT_RED]: { name: "紅漆", solid: false, color: "#f44336", isPaint: 1 },
    [IDS.PAINT_GREEN]: { name: "綠漆", solid: false, color: "#4caf50", isPaint: 2 },
    [IDS.PAINT_BLUE]: { name: "藍漆", solid: false, color: "#2196f3", isPaint: 3 },
    // --- 家具 ---
    [IDS.SIGN]: { name: "告示牌", solid: false, hardness: 2, transparent: true, color: "#8d6e63" },
    // --- 叢林方塊 ---
    [IDS.MUD]: { name: "泥土", solid: true, hardness: 15, color: "#5d4037" }, // 比土深色
    [IDS.JUNGLE_GRASS]: { name: "叢林草", solid: true, hardness: 20, color: "#2e7d32" }, // 鮮綠色
    [IDS.JUNGLE_SPORES]: { name: "叢林孢子", solid: false, light: 5, color: "#76ff03" }, // 發微光
    [IDS.VINE]: { name: "藤蔓", solid: false, transparent: true, breakInstantly: true, color: "#2e7d32" },
    [IDS.STINGER]: { name: "毒刺", solid: false, color: "#212121" },
    // --- 裝備 ---
    [IDS.GRAPPLING_HOOK]: { name: "鉤爪", solid: false, color: "#616161", isTool: true, durability: 200 },
    [IDS.BOOMERANG]: { name: "迴旋鏢", solid: false, damage: 8, range: 300, color: "#ffab91", durability: 50 },
    [IDS.BLADE_OF_GRASS]: { name: "草薙", solid: false, damage: 15, toolSpeed: 1, range: 120, color: "#76ff03", durability: 120 }, // 範圍大
    // --- 傳送門 ---
    [IDS.TELEPORTER]: { name: "傳送門", solid: false, hardness: 50, transparent: true, color: "#00e5ff" },
    // --- 釣魚工具與漁獲 ---
    [IDS.WOOD_FISHING_ROD]: { name: "木釣竿", solid: false, color: "#8d6e63", isFishingRod: true, durability: 60 },
    [IDS.RAW_FISH]: { name: "生魚", solid: false, heal: 1, consumable: true, color: "#90caf9" },
    [IDS.COOKED_FISH]: { name: "熟魚", solid: false, heal: 5, buffTime: 7200, color: "#ffab91", consumable: true }, // 2分鐘 buff
    [IDS.GOLDEN_CARP]: { name: "黃金鯉魚", solid: false, color: "#ffd700", value: 100 }, // 賣錢用
    [IDS.TRASH]: { name: "破鞋", solid: false, color: "#616161" },
    [IDS.SOUP]: { name: "鮮魚湯", solid: false, heal: 8, buffTime: 10800, color: "#ffe0b2", consumable: true },
    [IDS.COOKING_POT]: { name: "烹飪鍋", solid: false, hardness: 20, transparent: true, color: "#616161" },
    // --- 捕捉工具 ---
    [IDS.BUG_NET]: { name: "捕蟲網", solid: false, color: "#bdbdbd", isNet: true, durability: 80 },
    [IDS.CARROT]: { name: "胡蘿蔔", solid: false, color: "#ff9800", isPetItem: true },
    // --- 生物物品 ---
    [IDS.ITEM_BUNNY]: { name: "兔子", solid: false, color: "#fff" },
    [IDS.ITEM_FIREFLY]: { name: "螢火蟲", solid: false, color: "#76ff03", light: 5 }, // 拿在手上會發光
    // --- 藥草 (可種植，這裡簡化為直接採集) ---
    [IDS.DAYBLOOM]: { name: "太陽花", solid: false, transparent: true, breakInstantly: true, color: "#ffeb3b" },
    [IDS.MOONGLOW]: { name: "月光草", solid: false, transparent: true, breakInstantly: true, color: "#29b6f6", light: 5 },
    // --- 藥水 ---
    [IDS.POTION_SWIFTNESS]: { name: "敏捷藥水", solid: false, color: "#76ff03", consumable: true, buffTime: 3600 }, // 1分鐘加速
    [IDS.POTION_SHINE]: { name: "光芒藥水", solid: false, color: "#ffeb3b", consumable: true, buffTime: 3600 }, // 1分鐘發光
    // --- 容器與燈具 ---
    [IDS.BOTTLE]: { name: "空瓶", solid: false, transparent: true, breakInstantly: true, color: "#e0f7fa" },
    [IDS.FIREFLY_IN_A_BOTTLE]: { name: "螢火蟲瓶", solid: false, transparent: true, light: 12, breakInstantly: true, color: "#76ff03" }, // 提供綠色光照
    // --- 寶石礦 (硬度高) ---
    [IDS.RUBY_ORE]: { name: "紅寶石礦", solid: true, hardness: 80, color: "#ef5350" },
    [IDS.SAPPHIRE_ORE]: { name: "藍寶石礦", solid: true, hardness: 80, color: "#42a5f5" },
    [IDS.EMERALD_ORE]: { name: "翡翠礦", solid: true, hardness: 80, color: "#66bb6a" },
    // --- 寶石物品 ---
    [IDS.RUBY]: { name: "紅寶石", solid: false, hardness: 1, breakInstantly: true, color: "#d50000" },
    [IDS.SAPPHIRE]: { name: "藍寶石", solid: false, hardness: 1, breakInstantly: true, color: "#2962ff" },
    [IDS.EMERALD]: { name: "翡翠", solid: false, hardness: 1, breakInstantly: true, color: "#00c853" },
    // --- 晶火磚 (自體發光，適合蓋房子) ---
    [IDS.GEMSPARK_RED]: { name: "紅晶火磚", solid: true, hardness: 10, light: 15, color: "#ffcdd2" },
    [IDS.GEMSPARK_BLUE]: { name: "藍晶火磚", solid: true, hardness: 10, light: 15, color: "#bbdefb" },
    [IDS.GEMSPARK_GREEN]: { name: "綠晶火磚", solid: true, hardness: 10, light: 15, color: "#c8e6c9" },
    // --- 墓碑 ---
    [IDS.TOMBSTONE]: { name: "墓碑", solid: false, hardness: 10, transparent: true, color: "#bdbdbd" },

    // 工具（添加耐久度）
    [IDS.WOOD_PICK]: { name: "木鎬", solid: false, toolSpeed: 3, damage: 2, color: "#8d6e63", durability: 50 },
    [IDS.STONE_PICK]:{ name: "石鎬", solid: false, toolSpeed: 5, damage: 3, color: "#757575", durability: 80 },
    [IDS.IRON_PICK]: { name: "鐵鎬", solid: false, toolSpeed: 8, damage: 4, color: "#b0bec5", durability: 150 },
    [IDS.GOLD_PICK]: { name: "金鎬", solid: false, toolSpeed: 12, damage: 3, color: "#ffeb3b", durability: 120 },
    [IDS.DIAMOND_PICK]:{ name: "鑽石鎬", solid: false, toolSpeed: 20, damage: 5, color: "#00bcd4", durability: 300 },

    [IDS.WOOD_SWORD]:{ name: "木劍", solid: false, toolSpeed: 1, damage: 4, range: 80, color: "#8d6e63", durability: 30 },
    [IDS.STONE_SWORD]:{ name: "石劍", solid: false, toolSpeed: 1, damage: 5, range: 80, color: "#757575", durability: 50 },
    [IDS.IRON_SWORD]:{ name: "鐵劍", solid: false, toolSpeed: 1, damage: 7, range: 90, color: "#b0bec5", durability: 100 },
    [IDS.GOLD_SWORD]:{ name: "金劍", solid: false, toolSpeed: 1, damage: 6, range: 90, color: "#ffeb3b", durability: 80 },
    [IDS.DIAMOND_SWORD]:{ name: "鑽石劍", solid: false, toolSpeed: 1, damage: 10, range: 110, color: "#00bcd4", durability: 200 }
};

const RECIPES = [
    // 基礎
    { name: "鐵錠", type: "basic", out: { id: IDS.IRON_BAR, count: 1 }, cost: [{ id: IDS.IRON_ORE, count: 3 }], station: IDS.FURNACE },
    { name: "金錠", type: "basic", out: { id: IDS.GOLD_BAR, count: 1 }, cost: [{ id: IDS.GOLD_ORE, count: 3 }], station: IDS.FURNACE },
    { name: "鑽石", type: "basic", out: { id: IDS.DIAMOND, count: 1 }, cost: [{ id: IDS.DIAMOND_ORE, count: 1 }] },
    { name: "炸藥", type: "basic", out: { id: IDS.TNT, count: 1 }, cost: [{ id: IDS.SAND, count: 5 }, { id: IDS.COAL_ORE, count: 3 }] },
    { name: "熔爐", type: "basic", out: { id: IDS.FURNACE, count: 1 }, cost: [{ id: IDS.STONE, count: 20 }, { id: IDS.TORCH, count: 4 }] },
    { name: "床", type: "basic", out: { id: IDS.BED, count: 1 }, cost: [{ id: IDS.PLANKS, count: 5 }, { id: IDS.SILK, count: 5 }] },
    { name: "箱子", type: "basic", out: { id: IDS.CHEST, count: 1 }, cost: [{ id: IDS.PLANKS, count: 8 }, { id: IDS.IRON_BAR, count: 2 }], station: IDS.WORKBENCH },
    { name: "營火", type: "basic", out: { id: IDS.CAMPFIRE, count: 1 }, cost: [{ id: IDS.WOOD, count: 10 }, { id: IDS.TORCH, count: 3 }] },
    // --- 新增製作站配方 ---
    { name: "工作台", type: "basic", out: { id: IDS.WORKBENCH, count: 1 }, cost: [{ id: IDS.WOOD, count: 10 }] },
    { name: "鐵砧", type: "basic", out: { id: IDS.ANVIL, count: 1 }, cost: [{ id: IDS.IRON_BAR, count: 5 }], station: IDS.WORKBENCH },
    
    // --- 新增 BOSS 召喚配方 ---
    { name: "怪異眼球 (BOSS召喚道具)", type: "basic", out: { id: IDS.EYE_SUMMON, count: 1 }, cost: [{ id: IDS.GLASS, count: 5 }, { id: IDS.GOLD_ORE, count: 2 }] },
    
    // --- 新武器與道具配方 ---
    { name: "治療藥水", type: "tool", out: { id: IDS.HEALTH_POTION, count: 1 }, cost: [{ id: IDS.GLASS, count: 1 }, { id: IDS.FLOWER, count: 2 }] },
    { name: "魔法法杖", type: "tool", out: { id: IDS.MAGIC_STAFF, count: 1 }, cost: [{ id: IDS.DIAMOND, count: 2 }, { id: IDS.GOLD_BAR, count: 5 }] },
    { name: "魔力水晶", type: "tool", out: { id: IDS.MANA_CRYSTAL, count: 1 }, cost: [{ id: IDS.STARFURY, count: 1 }] }, // 暫時用星怒換
    { name: "瓶中雲", type: "tool", out: { id: IDS.CLOUD_IN_BOTTLE, count: 1 }, cost: [{ id: IDS.CLOUD, count: 10 }, { id: IDS.GLASS, count: 1 }] },
    // --- 材料 ---
    { name: "絲線", type: "basic", out: { id: IDS.SILK, count: 1 }, cost: [{ id: IDS.COBWEB, count: 7 }] },
    // --- 攀爬工具 ---
    { name: "繩索 (10)", type: "tool", out: { id: IDS.ROPE, count: 10 }, cost: [{ id: IDS.SILK, count: 1 }] },
    { name: "鐵鍊 (10)", type: "tool", out: { id: IDS.CHAIN, count: 10 }, cost: [{ id: IDS.IRON_BAR, count: 1 }], station: IDS.ANVIL },
    // --- 裝修工具 ---
    { name: "錘子", type: "tool", out: { id: IDS.HAMMER, count: 1 }, cost: [{ id: IDS.WOOD, count: 8 }, { id: IDS.STONE, count: 2 }] },
    { name: "油漆刷", type: "tool", out: { id: IDS.PAINT_BRUSH, count: 1 }, cost: [{ id: IDS.WOOD, count: 5 }, { id: IDS.SILK, count: 2 }] },
    { name: "告示牌", type: "build", out: { id: IDS.SIGN, count: 1 }, cost: [{ id: IDS.WOOD, count: 6 }] },
    // --- 叢林裝備 ---
    { name: "草薙", type: "tool", out: { id: IDS.BLADE_OF_GRASS, count: 1 }, cost: [{ id: IDS.JUNGLE_SPORES, count: 10 }, { id: IDS.STINGER, count: 10 }], station: IDS.ANVIL },
    { name: "鉤爪", type: "tool", out: { id: IDS.GRAPPLING_HOOK, count: 1 }, cost: [{ id: IDS.IRON_BAR, count: 3 }, { id: IDS.CHAIN, count: 3 }] },
    { name: "迴旋鏢", type: "tool", out: { id: IDS.BOOMERANG, count: 1 }, cost: [{ id: IDS.WOOD, count: 10 }, { id: IDS.COBWEB, count: 5 }], station: IDS.WORKBENCH },
    // --- 傳送門 ---
    { name: "傳送門", type: "build", out: { id: IDS.TELEPORTER, count: 1 }, cost: [{ id: IDS.IRON_BAR, count: 10 }, { id: IDS.GLASS, count: 5 }, { id: IDS.GOLD_BAR, count: 2 }, { id: IDS.DIAMOND, count: 1 }], station: IDS.ANVIL },
    // --- 油漆 ---
    { name: "紅漆 (5)", type: "basic", out: { id: IDS.PAINT_RED, count: 5 }, cost: [{ id: IDS.FLOWER, count: 1 }, { id: IDS.GLASS, count: 1 }] },
    { name: "綠漆 (5)", type: "basic", out: { id: IDS.PAINT_GREEN, count: 5 }, cost: [{ id: IDS.FLOWER, count: 1 }, { id: IDS.GLASS, count: 1 }] },
    { name: "藍漆 (5)", type: "basic", out: { id: IDS.PAINT_BLUE, count: 5 }, cost: [{ id: IDS.FLOWER, count: 1 }, { id: IDS.GLASS, count: 1 }] },
    // --- 農具 ---
    { name: "鋤頭", type: "tool", out: { id: IDS.HOE, count: 1 }, cost: [{ id: IDS.WOOD, count: 5 }, { id: IDS.STONE, count: 2 }] },
    { name: "麵包", type: "basic", out: { id: IDS.BREAD, count: 1 }, cost: [{ id: IDS.WHEAT, count: 3 }], station: IDS.FURNACE },
    // --- 釣魚工具 ---
    { name: "木釣竿", type: "tool", out: { id: IDS.WOOD_FISHING_ROD, count: 1 }, cost: [{ id: IDS.WOOD, count: 8 }, { id: IDS.COBWEB, count: 2 }], station: IDS.WORKBENCH },
    // --- 料理 ---
    { name: "熟魚", type: "basic", out: { id: IDS.COOKED_FISH, count: 1 }, cost: [{ id: IDS.RAW_FISH, count: 1 }], station: IDS.COOKING_POT },
    // --- 捕捉工具 ---
    { name: "捕蟲網", type: "tool", out: { id: IDS.BUG_NET, count: 1 }, cost: [{ id: IDS.WOOD, count: 10 }, { id: IDS.SILK, count: 5 }], station: IDS.WORKBENCH },
    // --- 煉金術 (需空瓶/玻璃 + 藥草) ---
    { name: "敏捷藥水", type: "basic", out: { id: IDS.POTION_SWIFTNESS, count: 1 }, cost: [{ id: IDS.GLASS, count: 1 }, { id: IDS.DAYBLOOM, count: 1 }], station: IDS.COOKING_POT },
    { name: "光芒藥水", type: "basic", out: { id: IDS.POTION_SHINE, count: 1 }, cost: [{ id: IDS.GLASS, count: 1 }, { id: IDS.MOONGLOW, count: 1 }], station: IDS.COOKING_POT },
    // --- 玻璃製品 ---
    { name: "空瓶 (2)", type: "basic", out: { id: IDS.BOTTLE, count: 2 }, cost: [{ id: IDS.GLASS, count: 1 }], station: IDS.FURNACE },
    // --- 吊燈 (空瓶+螢火蟲) ---
    { name: "螢火蟲瓶", type: "basic", out: { id: IDS.FIREFLY_IN_A_BOTTLE, count: 1 }, cost: [{ id: IDS.BOTTLE, count: 1 }, { id: IDS.ITEM_FIREFLY, count: 1 }] },
    // --- 寶石處理 ---
    { name: "紅寶石", type: "basic", out: { id: IDS.RUBY, count: 1 }, cost: [{ id: IDS.RUBY_ORE, count: 1 }] },
    { name: "藍寶石", type: "basic", out: { id: IDS.SAPPHIRE, count: 1 }, cost: [{ id: IDS.SAPPHIRE_ORE, count: 1 }] },
    { name: "翡翠", type: "basic", out: { id: IDS.EMERALD, count: 1 }, cost: [{ id: IDS.EMERALD_ORE, count: 1 }] },
    // --- 晶火磚 (玻璃+寶石 = 20塊磚) ---
    { name: "紅晶火磚 (20)", type: "build", out: { id: IDS.GEMSPARK_RED, count: 20 }, cost: [{ id: IDS.GLASS, count: 20 }, { id: IDS.RUBY, count: 1 }], station: IDS.WORKBENCH },
    { name: "藍晶火磚 (20)", type: "build", out: { id: IDS.GEMSPARK_BLUE, count: 20 }, cost: [{ id: IDS.GLASS, count: 20 }, { id: IDS.SAPPHIRE, count: 1 }], station: IDS.WORKBENCH },
    { name: "綠晶火磚 (20)", type: "build", out: { id: IDS.GEMSPARK_GREEN, count: 20 }, cost: [{ id: IDS.GLASS, count: 20 }, { id: IDS.EMERALD, count: 1 }], station: IDS.WORKBENCH },
    // --- 寵物召喚 ---
    { name: "胡蘿蔔", type: "basic", out: { id: IDS.CARROT, count: 1 }, cost: [{ id: IDS.ITEM_BUNNY, count: 1 }, { id: IDS.WOOD, count: 5 }] }, // 用抓到的兔子馴化
    { name: "鮮魚湯", type: "basic", out: { id: IDS.SOUP, count: 1 }, cost: [{ id: IDS.RAW_FISH, count: 1 }, { id: IDS.MUD, count: 1 }], station: IDS.COOKING_POT },

    // 工具
    { name: "火把 (4)", type: "basic", out: { id: IDS.TORCH, count: 4 }, cost: [{ id: IDS.COAL_ORE, count: 1 }, { id: IDS.WOOD, count: 1 }] },
    { name: "箭矢 (4)", type: "tool", out: { id: IDS.ARROW, count: 4 }, cost: [{ id: IDS.STONE, count: 1 }, { id: IDS.WOOD, count: 1 }] },
    { name: "木弓", type: "tool", out: { id: IDS.WOOD_BOW, count: 1 }, cost: [{ id: IDS.WOOD, count: 10 }] },
    { name: "木鎬", type: "tool", out: { id: IDS.WOOD_PICK, count: 1 }, cost: [{ id: IDS.WOOD, count: 5 }] },
    { name: "木劍", type: "tool", out: { id: IDS.WOOD_SWORD, count: 1 }, cost: [{ id: IDS.WOOD, count: 7 }] },
    { name: "石鎬", type: "tool", out: { id: IDS.STONE_PICK, count: 1 }, cost: [{ id: IDS.STONE, count: 5 }, { id: IDS.WOOD, count: 2 }] },
    { name: "石劍", type: "tool", out: { id: IDS.STONE_SWORD, count: 1 }, cost: [{ id: IDS.STONE, count: 7 }, { id: IDS.WOOD, count: 2 }] },
    { name: "鐵鎬", type: "tool", out: { id: IDS.IRON_PICK, count: 1 }, cost: [{ id: IDS.IRON_BAR, count: 5 }, { id: IDS.WOOD, count: 2 }], station: IDS.ANVIL },
    { name: "鐵劍", type: "tool", out: { id: IDS.IRON_SWORD, count: 1 }, cost: [{ id: IDS.IRON_BAR, count: 7 }, { id: IDS.WOOD, count: 2 }], station: IDS.ANVIL },
    { name: "金鎬", type: "tool", out: { id: IDS.GOLD_PICK, count: 1 }, cost: [{ id: IDS.GOLD_BAR, count: 5 }, { id: IDS.WOOD, count: 2 }], station: IDS.ANVIL },
    { name: "金劍", type: "tool", out: { id: IDS.GOLD_SWORD, count: 1 }, cost: [{ id: IDS.GOLD_BAR, count: 7 }, { id: IDS.WOOD, count: 2 }], station: IDS.ANVIL },
    { name: "鑽石鎬", type: "tool", out: { id: IDS.DIAMOND_PICK, count: 1 }, cost: [{ id: IDS.DIAMOND, count: 5 }, { id: IDS.WOOD, count: 2 }], station: IDS.ANVIL },
    { name: "鑽石劍", type: "tool", out: { id: IDS.DIAMOND_SWORD, count: 1 }, cost: [{ id: IDS.DIAMOND, count: 7 }, { id: IDS.WOOD, count: 2 }], station: IDS.ANVIL },
    // --- 防具配方 ---
    { name: "木頭盔", type: "tool", out: { id: IDS.HELMET_WOOD, count: 1 }, cost: [{ id: IDS.WOOD, count: 20 }], station: IDS.WORKBENCH },
    { name: "鐵頭盔", type: "tool", out: { id: IDS.HELMET_IRON, count: 1 }, cost: [{ id: IDS.IRON_BAR, count: 5 }], station: IDS.ANVIL },
    { name: "礦工頭盔", type: "tool", out: { id: IDS.HELMET_MINER, count: 1 }, cost: [{ id: IDS.GOLD_BAR, count: 5 }, { id: IDS.TORCH, count: 5 }], station: IDS.ANVIL },

    // 建築
    { name: "木板 (4)", type: "build", out: { id: IDS.PLANKS, count: 4 }, cost: [{ id: IDS.WOOD, count: 1 }] },
    { name: "玻璃", type: "build", out: { id: IDS.GLASS, count: 1 }, cost: [{ id: IDS.SAND, count: 2 }], station: IDS.FURNACE },
    { name: "石磚", type: "build", out: { id: IDS.BRICKS, count: 1 }, cost: [{ id: IDS.STONE, count: 1 }] },
    { name: "紅磚", type: "build", out: { id: IDS.RED_BRICK, count: 1 }, cost: [{ id: IDS.CLAY, count: 1 }], station: IDS.FURNACE },
    { name: "獄石磚", type: "build", out: { id: IDS.HELL_BRICK, count: 1 }, cost: [{ id: IDS.HELLSTONE, count: 1 }, { id: IDS.STONE, count: 1 }] },
    { name: "木平台 (4)", type: "build", out: { id: IDS.WOOD_PLATFORM, count: 4 }, cost: [{ id: IDS.WOOD, count: 1 }] },
    { name: "木牆 (4)", type: "build", out: { id: IDS.WOOD_WALL, count: 4 }, cost: [{ id: IDS.WOOD, count: 1 }] },
    { name: "石牆 (4)", type: "build", out: { id: IDS.STONE_WALL, count: 4 }, cost: [{ id: IDS.STONE, count: 1 }] },
    { name: "玻璃牆 (4)", type: "build", out: { id: IDS.GLASS_WALL, count: 4 }, cost: [{ id: IDS.GLASS, count: 1 }] },
    { name: "磚牆 (4)", type: "build", out: { id: IDS.BRICK_WALL, count: 4 }, cost: [{ id: IDS.BRICKS, count: 1 }] },
    { name: "桌子", type: "build", out: { id: IDS.TABLE, count: 1 }, cost: [{ id: IDS.PLANKS, count: 8 }] },
    { name: "椅子", type: "build", out: { id: IDS.CHAIR, count: 1 }, cost: [{ id: IDS.PLANKS, count: 4 }] },
    { name: "書架", type: "build", out: { id: IDS.BOOKSHELF, count: 1 }, cost: [{ id: IDS.WOOD, count: 10 }, { id: IDS.PLANKS, count: 5 }] },
    { name: "門", type: "build", out: { id: IDS.DOOR_CLOSED, count: 1 }, cost: [{ id: IDS.PLANKS, count: 6 }] },
    { name: "柵欄 (4)", type: "build", out: { id: IDS.FENCE, count: 4 }, cost: [{ id: IDS.WOOD, count: 1 }] },
    { name: "吊燈", type: "build", out: { id: IDS.LANTERN, count: 1 }, cost: [{ id: IDS.IRON_BAR, count: 1 }, { id: IDS.TORCH, count: 1 }] },
    { name: "花盆", type: "build", out: { id: IDS.CLAY_POT, count: 1 }, cost: [{ id: IDS.CLAY, count: 3 }], station: IDS.FURNACE },
    // --- 烹飪設施 ---
    { name: "烹飪鍋", type: "basic", out: { id: IDS.COOKING_POT, count: 1 }, cost: [{ id: IDS.IRON_BAR, count: 3 }, { id: IDS.WOOD, count: 2 }], station: IDS.ANVIL },
];

// ==========================================
// 2. 全域變數
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
let width, height;

let tiles = new Uint8Array(CHUNK_W * CHUNK_H);
let walls = new Uint8Array(CHUNK_W * CHUNK_H);
let lightMap = new Float32Array(CHUNK_W * CHUNK_H);
let tileColors = new Uint8Array(CHUNK_W * CHUNK_H); // 儲存顏色 ID (0:無, 1:紅, 2:綠, 3:藍)
let signData = {}; // 儲存告示牌文字: key="x_y", value="文字內容"

let camera = { x: 0, y: 0 };
let spawnPoint = { x: 0, y: 0 };
let gameTime = 27000; // 早上9点（72000 * 0.375 = 27000，6点=18000，18点=54000） 
let lightQueue = [];
let textures = {}; 
let clouds = [];
let particles = [];
let floatTexts = []; // 新增這行：用來存飄浮文字
let lastInventoryFullTime = 0; // 記錄最後一次顯示"背包已滿"的時間（幀數）
let stars = []; // 夜晚星星陣列（只在玩家視窗範圍內生成）
let mobs = []; 
let drops = [];
let projectiles = [];
let isCraftingOpen = false;
let currentCraftTab = 'basic';
let selectedRecipeIdx = -1;
let isMerchantOpen = false;
let currentMerchantItem = null;

let player = { 
    x: 0, y: 0, w: 20, h: 38, 
    vx: 0, vy: 0, lastVy: 0,
    grounded: false, facingRight: true, anim: 0,
    maxHp: 5, hp: 5, invincibleTimer: 0, regenTimer: 0,
    // --- 新增屬性 ---
    maxMana: 20, mana: 20, manaTimer: 0, // 魔力系統
    jumpCount: 0, maxJumps: 1, jumpKeyHeld: false, // 跳躍系統
    coins: 0,        // 持有的錢
    defense: 0,      // 當前防禦力
    equip: { head: 0 }, // 頭部裝備 ID (0代表沒裝備)
    hook: { active: false, x: 0, y: 0, vx: 0, vy: 0, state: 0 }, // state: 0=無, 1=射出, 2=拉回, 3=鉤住
    wKeyLocked: false, // 傳送門W鍵鎖定
    buffs: { wellFed: 0, swiftness: 0, shine: 0 }, // Buff 系統：剩餘時間
    pet: { active: false, x: 0, y: 0, type: null }, // 寵物系統
    fishing: { active: false, x: 0, y: 0, vx: 0, vy: 0, biteTimer: 0, inWater: false, catchWindow: 0 }, // 釣魚狀態
    inventory: Array(MAX_INVENTORY_SLOTS).fill(null).map((_, i) => 
        i === 0 ? {id: IDS.WOOD_PICK, count: 1} :
        i === 1 ? {id: IDS.TORCH, count: 10} :
        {id: IDS.AIR, count: 0}
    ),
    hotbarSlot: 0 
};

let keys = {};
let mouse = { x: 0, y: 0, left: false, right: false, worldX: 0, worldY: 0 };
let mining = { active: false, x: 0, y: 0, progress: 0 };

// ==========================================
// 玩家視覺資源（根據主體遊戲選角決定）
// ==========================================
//
// 維護備註：
// - 此處只負責「冒險模式中玩家的外觀」；不改變任何數值、碰撞盒或裝備邏輯。
// - 角色來源：
//   - 瑪格麗特：player.gif（320x320）
//   - 灰妲 DaDa：player2.png（290x242）
//   - 森森鈴蘭：player3.gif（320x320）
// - 主體遊戲在啟動冒險模式時，會在 iframe URL 上附帶 ?char=<id> 參數，
//   並在 js/modes/adventure/index.html 中設置 window.ADVENTURE_SELECTED_CHARACTER_ID。
// - 冒險模式只使用此 ID 來選擇對應圖片，沒有讀寫主體存檔或 SaveCode。
let playerSpriteImg = null;
let playerSpriteReady = false;
let playerSpriteOffsetX = 0;
let playerSpriteOffsetY = 0;
let playerSpriteScale = 0.16; // 預設縮放（之後依角色微調）

function initPlayerSprite() {
    try {
        let id = (typeof window !== 'undefined' && window.ADVENTURE_SELECTED_CHARACTER_ID) ? String(window.ADVENTURE_SELECTED_CHARACTER_ID) : 'margaret';
        // 優先從父視窗（主體遊戲）共用 Game.images 中取得圖片，避免路徑問題
        let key = 'player'; // 預設瑪格麗特
        if (id === 'dada') key = 'player2';
        else if (id === 'lilylinglan') key = 'player3';

        let parentImg = null;
        try {
            const parentWin = (window.parent && window.parent !== window) ? window.parent : null;
            if (parentWin && parentWin.Game && parentWin.Game.images && parentWin.Game.images[key]) {
                parentImg = parentWin.Game.images[key];
            }
        } catch(_){}

        // 預設縮放：維持與原小人高度接近（約 40~50px），各角色可微調
        if (id === 'dada') {
            playerSpriteScale = 0.18; // player2.png 高 242，0.18 ≈ 43px
        } else {
            playerSpriteScale = 0.16; // player.gif / player3.gif 高 320，0.16 ≈ 51px
        }

        if (parentImg && parentImg.complete) {
            playerSpriteImg = parentImg;
            playerSpriteReady = true;
            const w = parentImg.width * playerSpriteScale;
            const h = parentImg.height * playerSpriteScale;
            // 垂直：對齊原本小人腳底（原本角色矩形底部約在 player.y + 38）
            playerSpriteOffsetY = 38 - h;
            // 水平：以 player.x+10 為角色中心（原本矩形身體中心）
            playerSpriteOffsetX = 10 - w / 2;
            return;
        }

        // 後備：若父視窗沒有對應圖片，改用相對路徑載入
        // 資料夾層級：<root>/js/modes/adventure/index.html → ../../../assets/images/...
        var src = '../../../assets/images/player.gif';
        if (id === 'dada') {
            src = '../../../assets/images/player2.png';
        } else if (id === 'lilylinglan') {
            src = '../../../assets/images/player3.gif';
        }
        const img = new Image();
        img.onload = function(){
            playerSpriteImg = img;
            playerSpriteReady = true;
            const w = img.width * playerSpriteScale;
            const h = img.height * playerSpriteScale;
            playerSpriteOffsetY = 38 - h;
            playerSpriteOffsetX = 10 - w / 2;
        };
        img.onerror = function(){
            playerSpriteImg = null;
            playerSpriteReady = false;
        };
        img.src = src;
    } catch(_){}
}

const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

// ==========================================
// 3. 工具函數 (Noise & Audio)
// ==========================================
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (type === 'jump') { osc.type = 'square'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(300, now + 0.1); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.1); osc.start(now); osc.stop(now + 0.1); } 
    else if (type === 'mine') { osc.type = 'triangle'; osc.frequency.setValueAtTime(100 + Math.random()*50, now); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.05); osc.start(now); osc.stop(now + 0.05); } 
    else if (type === 'explode') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now); osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.5); gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5); osc.start(now); osc.stop(now + 0.5); } 
    else if (type === 'hit') { osc.type = 'square'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(100, now + 0.1); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.1); osc.start(now); osc.stop(now + 0.1); }
    else if (type === 'shoot') { osc.type = 'triangle'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.2); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.2); osc.start(now); osc.stop(now + 0.2); }
    else if (type === 'slime' || type === 'drink') { osc.type = 'sine'; osc.frequency.setValueAtTime(200, now); osc.frequency.linearRampToValueAtTime(150, now + 0.15); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.15); osc.start(now); osc.stop(now + 0.15); }
    else if (type === 'magic') { osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); osc.frequency.linearRampToValueAtTime(800, now + 0.2); gain.gain.setValueAtTime(0.08, now); gain.gain.linearRampToValueAtTime(0, now + 0.2); osc.start(now); osc.stop(now + 0.2); } // 傳送門音效
}

const Permutation = new Uint8Array(512); const p = new Uint8Array(256); for(let i=0; i<256; i++) p[i] = i; for(let i=255; i>0; i--) { let r = Math.floor(Math.random()*(i+1)); let t = p[i]; p[i] = p[r]; p[r] = t; } for(let i=0; i<512; i++) Permutation[i] = p[i & 255]; function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); } function lerp(t, a, b) { return a + t * (b - a); } function grad(hash, x, y, z) { let h = hash & 15; let u = h<8 ? x : y, v = h<4 ? y : h==12||h==14 ? x : z; return ((h&1) == 0 ? u : -u) + ((h&2) == 0 ? v : -v); } function noise(x, y, z) { let X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255; x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z); let u = fade(x), v = fade(y), w = fade(z); let A = Permutation[X]+Y, AA = Permutation[A]+Z, AB = Permutation[A+1]+Z; let B = Permutation[X+1]+Y, BA = Permutation[B]+Z, BB = Permutation[B+1]+Z; return lerp(w, lerp(v, lerp(u, grad(Permutation[AA], x, y, z), grad(Permutation[BA], x-1, y, z)), lerp(u, grad(Permutation[AB], x, y-1, z), grad(Permutation[BB], x-1, y-1, z))), lerp(v, lerp(u, grad(Permutation[AA+1], x, y, z-1), grad(Permutation[BA+1], x-1, y, z-1)), lerp(u, grad(Permutation[AB+1], x, y-1, z-1), grad(Permutation[BB+1], x-1, y-1, z-1)))); }

// ==========================================
// 4. 美術生成
// ==========================================
function createTexture(id, colorHex) {
    const cvs = document.createElement('canvas'); cvs.width = TILE_SIZE; cvs.height = TILE_SIZE;
    const c = cvs.getContext('2d');

// 箱子與寶箱
    if (id === IDS.CHEST || id === IDS.LOOT_CHEST) { 
        c.clearRect(0,0,32,32); 
        c.fillStyle = (id === IDS.LOOT_CHEST) ? '#ff6f00' : '#ffb300'; // 野生深橘色，玩家黃色
        c.fillRect(2,12,28,20); 
        c.fillStyle = '#3e2723'; 
        c.fillRect(2,12,28,4); // 蓋子陰影
        c.fillRect(14,18,4,6); // 鎖頭
        c.strokeStyle = '#3e2723'; c.lineWidth=2; c.strokeRect(2,12,28,20);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs; 
        return ctx.createPattern(cvs, 'repeat'); 
    }
    // 門 (關) - 繪製成兩格高（64像素）
    if (id === IDS.DOOR_CLOSED) { 
        c.clearRect(0,0,32,64); // 清除兩格高的區域
        c.fillStyle = '#5d4037'; c.fillRect(6,0,20,64); // 兩格高的門板
        c.strokeStyle = '#3e2723'; c.lineWidth=2; c.strokeRect(6,0,20,64); 
        // 門把手（在中間位置）
        c.fillStyle = '#ffca28'; c.beginPath(); c.arc(22,32,2,0,Math.PI*2); c.fill(); 
        // 門的橫向分隔線（視覺效果）
        c.strokeStyle = '#3e2723'; c.lineWidth=1;
        c.beginPath(); c.moveTo(6,32); c.lineTo(26,32); c.stroke();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs; 
        return ctx.createPattern(cvs, 'repeat'); 
    }
    // 門 (開) - 繪製成兩格高（64像素）
    if (id === IDS.DOOR_OPEN) { 
        c.clearRect(0,0,32,64); // 清除兩格高的區域
        c.fillStyle = 'rgba(93, 64, 55, 0.5)'; c.fillRect(2,0,10,64); // 兩格高的半透明門板
        c.strokeStyle = '#3e2723'; c.strokeRect(2,0,10,64); 
        // 門的橫向分隔線（視覺效果）
        c.strokeStyle = '#3e2723'; c.lineWidth=1;
        c.beginPath(); c.moveTo(2,32); c.lineTo(12,32); c.stroke();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs; 
        return ctx.createPattern(cvs, 'repeat'); 
    }
    // BOSS 召喚物 (怪異眼球)
    if (id === IDS.EYE_SUMMON) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(16, 16, 14, 0, Math.PI*2);
        c.fill();
        c.fillStyle = '#2196f3';
        c.beginPath();
        c.arc(20, 16, 8, 0, Math.PI*2);
        c.fill();
        c.fillStyle = '#000';
        c.beginPath();
        c.arc(22, 16, 4, 0, Math.PI*2);
        c.fill();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 腐化與新道具 ---
    if (id === IDS.EBONSTONE) {
        c.fillStyle = '#6a1b9a'; 
        c.fillRect(0,0,32,32); // 深紫
        c.fillStyle = '#4a148c'; 
        for(let i=0; i<5; i++) c.fillRect(Math.random()*28, Math.random()*28, 4, 10); // 垂直紋理
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.MANA_CRYSTAL) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#2979ff'; 
        c.beginPath(); // 畫五角星
        for(let k=0; k<5; k++) {
             c.lineTo(16 + Math.cos((18+k*72)/180*Math.PI)*12, 16 + Math.sin((18+k*72)/180*Math.PI)*12);
             c.lineTo(16 + Math.cos((54+k*72)/180*Math.PI)*5, 16 + Math.sin((54+k*72)/180*Math.PI)*5);
        }
        c.closePath();
        c.fill();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.CLOUD_IN_BOTTLE) {
        c.clearRect(0,0,32,32);
        c.fillStyle = 'rgba(255,255,255,0.5)'; 
        c.fillRect(10,8,12,16); // 瓶子
        c.strokeStyle = '#fff'; 
        c.strokeRect(10,8,12,16);
        c.fillStyle = '#e0f7fa'; 
        c.beginPath(); 
        c.arc(16,16,4,0,Math.PI*2); 
        c.fill(); // 雲
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 農耕與生活 ---
    if (id === IDS.HOE) {
        c.clearRect(0,0,32,32); 
        c.translate(16,16); 
        c.rotate(45*Math.PI/180); 
        c.translate(-16,-16);
        c.fillStyle = '#8d6e63'; 
        c.fillRect(14,2,4,22); // 把手
        c.fillStyle = '#b0bec5'; 
        c.fillRect(12,2,10,4); // 鋤頭頭部
        c.setTransform(1,0,0,1,0,0); // 重置变换
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.TILLED_DIRT) {
        c.fillStyle = '#4e342e'; 
        c.fillRect(0,0,32,32);
        c.fillStyle = '#3e2723'; // 畫出耕地的溝槽
        c.fillRect(0,4,32,2); 
        c.fillRect(0,12,32,2); 
        c.fillRect(0,20,32,2); 
        c.fillRect(0,28,32,2);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.WHEAT_CROP) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#8bc34a'; // 綠色幼苗
        c.fillRect(8, 20, 2, 12); 
        c.fillRect(16, 16, 2, 16); 
        c.fillRect(24, 22, 2, 10);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.WHEAT_RIPE) {
        c.clearRect(0,0,32,32); 
        c.fillStyle = '#fdd835'; 
        c.fillRect(8, 10, 4, 22); 
        c.fillRect(16, 6, 4, 26); 
        c.fillRect(24, 12, 4, 20); // 長得比較高且金黃
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.ACORN) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#5d4037'; 
        c.beginPath(); 
        c.arc(16,20,6,0,Math.PI*2); 
        c.fill(); // 果實
        c.fillStyle = '#8d6e63'; 
        c.fillRect(14,12,4,4); // 梗
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.BREAD) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#d7ccc8'; 
        c.beginPath(); 
        c.ellipse(16, 16, 10, 6, 0, 0, Math.PI*2); 
        c.fill();
        c.strokeStyle = '#8d6e63'; 
        c.lineWidth=2; 
        c.beginPath(); 
        c.moveTo(10,14); 
        c.lineTo(14,18); 
        c.moveTo(16,14); 
        c.lineTo(20,18); 
        c.stroke();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 建築裝飾 ---
    else if (id === IDS.FENCE) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#795548'; // 垂直木條
        c.fillRect(4,0,6,32); 
        c.fillRect(22,0,6,32);
        c.fillStyle = '#5d4037'; // 橫向木條
        c.fillRect(0,6,32,4); 
        c.fillRect(0,22,32,4);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.LANTERN) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#37474f'; 
        c.fillRect(14,0,4,4); // 掛鉤
        c.fillStyle = '#ff9800'; 
        c.fillRect(10,4,12,14); // 燈罩
        c.fillStyle = 'rgba(255, 235, 59, 0.8)'; 
        c.fillRect(12,6,8,10); // 亮光
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.CAMPFIRE) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#5d4037'; // 木柴
        c.save(); 
        c.translate(16,28); 
        c.rotate(0.2); 
        c.fillRect(-10,-2,20,4); 
        c.rotate(-0.4); 
        c.fillRect(-10,-2,20,4); 
        c.restore();
        c.fillStyle = '#ff5722'; // 火焰
        c.beginPath(); 
        c.moveTo(10,24); 
        c.lineTo(16,10); 
        c.lineTo(22,24); 
        c.fill();
        c.fillStyle = 'rgba(255, 152, 0, 0.5)'; 
        c.beginPath(); 
        c.arc(16,18,8,0,Math.PI*2); 
        c.fill();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 經濟與裝備 ---
    if (id === IDS.COIN) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#ff9800'; 
        c.beginPath(); 
        c.arc(16,16,8,0,Math.PI*2); 
        c.fill(); // 金屬圓
        c.fillStyle = '#ffe0b2'; 
        c.beginPath(); 
        c.arc(16,16,6,0,Math.PI*2); 
        c.fill(); // 反光
        c.fillStyle = '#e65100'; 
        c.font = "bold 10px sans-serif"; 
        c.fillText("$", 13, 19);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.HELMET_WOOD) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#8d6e63'; 
        c.fillRect(8,8,16,16); // 頭盔主體
        c.fillStyle = '#5d4037'; 
        c.fillRect(10,12,12,4); // 護目處
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.HELMET_IRON) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#b0bec5'; 
        c.beginPath(); 
        c.arc(16,16,10,Math.PI,0); 
        c.fill(); 
        c.fillRect(6,16,20,8);
        c.fillStyle = '#78909c'; 
        c.fillRect(14,10,4,14); // 鼻樑防護
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.HELMET_MINER) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#ffca28'; 
        c.beginPath(); 
        c.arc(16,16,10,Math.PI,0); 
        c.fill(); 
        c.fillRect(6,16,20,6);
        c.fillStyle = '#fff'; 
        c.beginPath(); 
        c.arc(16,10,4,0,Math.PI*2); 
        c.fill(); // 頭燈
        c.fillStyle = 'rgba(255,255,255,0.5)'; 
        c.beginPath(); 
        c.arc(16,10,6,0,Math.PI*2); 
        c.fill(); // 光暈
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 天空生態與寶箱 ---
    if (id === IDS.CLOUD) {
        c.fillStyle = '#f5f5f5'; 
        c.fillRect(0,0,32,32);
        c.fillStyle = '#e0e0e0'; 
        c.beginPath(); 
        c.arc(10,10,6,0,Math.PI*2); 
        c.fill(); 
        c.beginPath(); 
        c.arc(22,20,8,0,Math.PI*2); 
        c.fill();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.SUNPLATE) {
        c.fillStyle = '#ffd54f'; 
        c.fillRect(0,0,32,32);
        c.strokeStyle = '#fff9c4'; 
        c.lineWidth=2; 
        c.strokeRect(2,2,28,28); 
        c.fillStyle = '#ffca28'; 
        c.fillRect(6,6,20,20);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.SKYWARE_CHEST) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#0288d1'; 
        c.fillRect(2,12,28,20); // 藍身
        c.fillStyle = '#ffeb3b'; 
        c.fillRect(2,12,28,4);  // 金邊
        c.fillStyle = '#fff'; 
        c.fillRect(14,18,4,6);      // 鎖
        c.strokeStyle = '#01579b'; 
        c.lineWidth=2; 
        c.strokeRect(2,12,28,20);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs; 
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 新物品 ---
    else if (id === IDS.HEALTH_POTION) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#f44336'; 
        c.beginPath(); 
        c.arc(16,20,10,0,Math.PI*2); 
        c.fill(); // 瓶身
        c.fillStyle = '#fff'; 
        c.fillRect(14,6,4,6); // 瓶頸
        c.fillStyle = 'rgba(255,255,255,0.4)'; 
        c.beginPath(); 
        c.arc(14,18,3,0,Math.PI*2); 
        c.fill(); // 反光
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.MAGIC_STAFF) {
        c.clearRect(0,0,32,32); 
        c.translate(16,16); 
        c.rotate(45*Math.PI/180); 
        c.translate(-16,-16);
        c.fillStyle = '#8d6e63'; 
        c.fillRect(14,10,4,20); // 杖身
        c.fillStyle = '#e040fb'; 
        c.beginPath(); 
        c.arc(16,8,6,0,Math.PI*2); 
        c.fill(); // 寶石
        c.setTransform(1,0,0,1,0,0); // 重置变换
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.STARFURY) {
        c.clearRect(0,0,32,32); 
        c.translate(16,16); 
        c.rotate(45*Math.PI/180); 
        c.translate(-16,-16);
        c.fillStyle = '#ff4081'; 
        c.fillRect(14,2,4,22); // 粉紅劍身
        c.fillStyle = '#ffd54f'; 
        c.fillRect(10,24,12,4); // 護手
        c.fillStyle = '#ffff00'; 
        c.beginPath(); 
        c.arc(16,24,3,0,Math.PI*2); 
        c.fill(); // 星星裝飾
        c.setTransform(1,0,0,1,0,0); // 重置变换
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs; 
        return ctx.createPattern(cvs, 'repeat'); 
    }
    
    if (id === IDS.TORCH) { c.clearRect(0,0,32,32); c.fillStyle = '#5d4037'; c.fillRect(14, 12, 4, 14); c.fillStyle = '#ffeb3b'; c.fillRect(12, 6, 8, 8); c.fillStyle = 'rgba(255, 152, 0, 0.6)'; c.fillRect(10, 4, 12, 12); } 
    else if (id === IDS.SAND) { c.fillStyle = colorHex; c.fillRect(0,0,32,32); for(let i=0;i<50;i++){ c.fillStyle='rgba(0,0,0,0.1)'; c.fillRect(Math.random()*32, Math.random()*32, 2, 2); } }
    else if (id === IDS.SNOW) { c.fillStyle = '#fff'; c.fillRect(0,0,32,32); for(let i=0;i<20;i++){ c.fillStyle='rgba(200,200,255,0.3)'; c.fillRect(Math.random()*32, Math.random()*32, 2, 2); } }
    else if (id === IDS.ICE) { c.fillStyle = '#b3e5fc'; c.fillRect(0,0,32,32); c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.moveTo(0,32); c.lineTo(32,0); c.stroke(); }
    else if (id === IDS.TNT) { c.fillStyle = '#d32f2f'; c.fillRect(0,0,32,32); c.fillStyle = '#fff'; c.fillRect(0,10,32,12); c.fillStyle = '#000'; c.font='bold 10px sans-serif'; c.fillText("TNT", 6, 20); c.fillStyle = '#555'; c.fillRect(14, 0, 4, 4); }
    else if (id === IDS.GLASS) { c.fillStyle = 'rgba(129, 212, 250, 0.3)'; c.fillRect(0,0,32,32); c.fillStyle = 'rgba(255, 255, 255, 0.6)'; c.fillRect(4,4,8,4); c.fillRect(6,8,4,4); c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth=2; c.strokeRect(0,0,32,32); }
    else if (id === IDS.WOOD_WALL) { c.fillStyle = '#3e2723'; c.fillRect(0,0,32,32); c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0,0,32,2); c.fillRect(0,30,32,2); }
    else if (id === IDS.STONE_WALL) { c.fillStyle = '#424242'; c.fillRect(0,0,32,32); c.fillStyle = 'rgba(0,0,0,0.2)'; for(let i=0;i<5;i++) c.fillRect(Math.random()*28, Math.random()*28, 4, 4); }
    else if (id === IDS.STONE) { c.fillStyle = colorHex; c.fillRect(0,0,32,32); for(let i=0; i<10; i++) { c.fillStyle = Math.random()>0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.2)'; c.fillRect(Math.random()*28, Math.random()*28, 4, 4); } c.strokeStyle = "rgba(0,0,0,0.3)"; c.lineWidth = 2; c.strokeRect(0,0,32,32); }
    else if (id === IDS.SAPLING) { c.clearRect(0,0,32,32); c.fillStyle = '#4caf50'; c.fillRect(14, 10, 4, 10); c.beginPath(); c.arc(12, 10, 4, 0, Math.PI*2); c.fill(); c.beginPath(); c.arc(20, 14, 3, 0, Math.PI*2); c.fill(); }
    else if (id === IDS.TABLE) { c.clearRect(0,0,32,32); c.fillStyle = '#8d6e63'; c.fillRect(2, 8, 28, 6); c.fillRect(6, 14, 4, 18); c.fillRect(22, 14, 4, 18); }
    else if (id === IDS.CHAIR) { c.clearRect(0,0,32,32); c.fillStyle = '#8d6e63'; c.fillRect(10, 16, 12, 4); c.fillRect(10, 20, 4, 12); c.fillRect(18, 20, 4, 12); c.fillRect(10, 4, 4, 12); }
    else if (id === IDS.FURNACE) { c.fillStyle = '#424242'; c.fillRect(0,0,32,32); c.fillStyle = '#212121'; c.fillRect(4,4,24,10); c.fillStyle = '#ff5722'; c.fillRect(8,20,16,8); c.strokeStyle = '#000'; c.lineWidth = 2; c.strokeRect(0,0,32,32); }
    else if (id === IDS.IRON_BAR || id === IDS.GOLD_BAR) { c.clearRect(0,0,32,32); c.fillStyle = colorHex; c.fillRect(6, 12, 20, 10); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1; c.strokeRect(6,12,20,10); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(6,12,20,2); }
    else if (id === IDS.BED) { c.clearRect(0,0,32,32); c.fillStyle = '#8d6e63'; c.fillRect(2,16,28,8); c.fillRect(2,24,4,4); c.fillRect(26,24,4,4); c.fillStyle = '#ef5350'; c.fillRect(2,14,28,4); c.fillStyle = '#fff'; c.fillRect(4,12,8,4); }
    else if (id === IDS.CHEST) { c.clearRect(0,0,32,32); c.fillStyle = '#ffb300'; c.fillRect(2,12,28,20); c.fillStyle = '#ff6f00'; c.fillRect(2,12,28,4); c.fillRect(14,18,4,6); c.strokeStyle = '#3e2723'; c.lineWidth=2; c.strokeRect(2,12,28,20); }
    else if (id === IDS.WOOD_PLATFORM) { c.clearRect(0,0,32,32); c.fillStyle = '#8d6e63'; c.fillRect(0,0,32,8); c.fillStyle = '#5d4037'; c.fillRect(0,8,32,2); }
    else if (id === IDS.GLASS_WALL) { c.fillStyle = 'rgba(129, 212, 250, 0.2)'; c.fillRect(0,0,32,32); c.strokeStyle = 'rgba(255,255,255,0.1)'; c.strokeRect(0,0,32,32); }
    else if (id === IDS.BRICK_WALL) { c.fillStyle = '#424242'; c.fillRect(0,0,32,32); c.fillStyle = '#757575'; c.fillRect(0,0,30,14); c.fillRect(2,16,30,14); }
    else if (id === IDS.BOOKSHELF) { c.clearRect(0,0,32,32); c.fillStyle = '#5d4037'; c.fillRect(4,0,24,32); c.fillStyle = '#f44336'; c.fillRect(6,4,4,8); c.fillStyle = '#2196f3'; c.fillRect(12,4,4,8); c.fillStyle = '#4caf50'; c.fillRect(18,20,4,8); c.fillStyle = '#ffeb3b'; c.fillRect(6,20,4,8); }
    else if (id === IDS.WOOD_BOW) { c.clearRect(0,0,32,32); c.strokeStyle = '#8d6e63'; c.lineWidth = 3; c.beginPath(); c.arc(10, 16, 14, -Math.PI/2, Math.PI/2); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.moveTo(10, 2); c.lineTo(10, 30); c.stroke(); }
    else if (id === IDS.ARROW) { c.clearRect(0,0,32,32); c.strokeStyle = '#8d6e63'; c.lineWidth = 2; c.beginPath(); c.moveTo(4, 28); c.lineTo(28, 4); c.stroke(); c.fillStyle = '#9e9e9e'; c.beginPath(); c.moveTo(28, 4); c.lineTo(22, 4); c.lineTo(28, 10); c.fill(); }
    else if (id === IDS.ASH) { c.fillStyle = '#424242'; c.fillRect(0,0,32,32); for(let i=0;i<50;i++){ c.fillStyle='rgba(0,0,0,0.3)'; c.fillRect(Math.random()*32, Math.random()*32, 2, 2); } }
    else if (id === IDS.HELLSTONE) { c.fillStyle = '#b71c1c'; c.fillRect(0,0,32,32); for(let i=0;i<15;i++){ c.fillStyle='#212121'; c.fillRect(Math.random()*28, Math.random()*28, 4, 4); } }
    else if (id === IDS.HELL_BRICK) { c.fillStyle = '#5d4037'; c.fillRect(0,0,32,32); c.strokeStyle = '#3e2723'; c.strokeRect(0,0,32,32); }
    else if (id === IDS.DIAMOND_ORE) { c.fillStyle = '#5d4037'; c.fillRect(0,0,32,32); c.fillStyle = '#29b6f6'; c.fillRect(8,8,6,6); c.fillRect(20,20,6,6); }
    else if (id === IDS.DIAMOND) { c.clearRect(0,0,32,32); c.fillStyle = '#29b6f6'; c.beginPath(); c.moveTo(16,4); c.lineTo(24,12); c.lineTo(16,28); c.lineTo(8,12); c.fill(); }
    // --- 工藝與裝飾 ---
    else if (id === IDS.CLAY) {
        c.fillStyle = '#bcaaa4'; 
        c.fillRect(0,0,32,32); // 淺褐色
        c.fillStyle = '#a1887f'; 
        for(let i=0; i<10; i++) c.fillRect(Math.random()*28, Math.random()*28, 4, 4);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.RED_BRICK) {
        c.fillStyle = '#b71c1c'; 
        c.fillRect(0,0,32,32); // 深紅
        c.fillStyle = '#e57373'; // 磚紋
        c.fillRect(0,0,14,14); 
        c.fillRect(16,0,16,14);
        c.fillRect(0,16,6,16); 
        c.fillRect(8,16,14,16); 
        c.fillRect(24,16,8,16);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.WORKBENCH) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#8d6e63'; 
        c.fillRect(2,10,28,6); // 桌面
        c.fillRect(4,16,4,16); 
        c.fillRect(24,16,4,16); // 桌腳
        c.fillStyle = '#b0bec5'; 
        c.fillRect(6,6,6,4); // 槌子頭
        c.fillStyle = '#5d4037'; 
        c.fillRect(10,8,6,2); // 把手
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.ANVIL) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#546e7a'; // 鐵灰色
        c.beginPath(); 
        c.moveTo(2,14); 
        c.lineTo(30,14); 
        c.lineTo(26,20); 
        c.lineTo(24,20); 
        c.lineTo(22,28); 
        c.lineTo(26,32); 
        c.lineTo(6,32); 
        c.lineTo(10,28); 
        c.lineTo(8,20); 
        c.lineTo(6,20); 
        c.fill();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.POT || id === IDS.CLAY_POT) {
        c.clearRect(0,0,32,32);
        c.fillStyle = (id === IDS.CLAY_POT) ? '#d84315' : '#8d6e63'; // 花盆較紅，野外罐子較暗
        c.beginPath(); 
        c.moveTo(8,28); 
        c.lineTo(24,28); 
        c.lineTo(28,12); 
        c.lineTo(24,8); 
        c.lineTo(8,8); 
        c.lineTo(4,12); 
        c.fill();
        c.fillStyle = 'rgba(0,0,0,0.2)'; 
        c.fillRect(8,10,16,2); // 陰影裝飾
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 攀爬與材料 ---
    else if (id === IDS.COBWEB) {
        c.clearRect(0,0,32,32);
        c.strokeStyle = 'rgba(255,255,255,0.6)'; 
        c.lineWidth = 1;
        c.beginPath(); 
        c.moveTo(0,0); c.lineTo(32,32); 
        c.moveTo(32,0); c.lineTo(0,32);
        c.moveTo(16,0); c.lineTo(16,32); 
        c.moveTo(0,16); c.lineTo(32,16);
        c.stroke();
        c.beginPath(); 
        c.arc(16,16,8,0,Math.PI*2); 
        c.arc(16,16,14,0,Math.PI*2); 
        c.stroke();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.SILK) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#fafafa'; 
        c.beginPath(); 
        c.arc(16,16,10,0,Math.PI*2); 
        c.fill();
        c.strokeStyle = '#bdbdbd'; 
        c.lineWidth=1; 
        c.beginPath(); 
        c.arc(16,16,10,0,Math.PI*2); 
        c.stroke();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.ROPE) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#8d6e63'; // 棕色繩子
        c.fillRect(14, 0, 4, 32); 
        c.fillStyle = '#6d4c41'; // 繩結
        c.fillRect(13, 4, 6, 4); 
        c.fillRect(13, 20, 6, 4);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.CHAIN) {
        c.clearRect(0,0,32,32);
        c.strokeStyle = '#424242'; 
        c.lineWidth = 3;
        // 畫幾個環
        c.beginPath(); 
        c.ellipse(16, 6, 4, 6, 0, 0, Math.PI*2); 
        c.stroke();
        c.beginPath(); 
        c.ellipse(16, 18, 4, 6, 0, 0, Math.PI*2); 
        c.stroke();
        c.beginPath(); 
        c.ellipse(16, 30, 4, 6, 0, 0, Math.PI*2); 
        c.stroke();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 裝修與工具 ---
    else if (id === IDS.HAMMER) {
        c.clearRect(0,0,32,32); 
        c.translate(16,16); 
        c.rotate(45*Math.PI/180); 
        c.translate(-16,-16);
        c.fillStyle = '#5d4037'; 
        c.fillRect(14,4,4,24); // 把手
        c.fillStyle = '#8d6e63'; 
        c.fillRect(8,2,16,8); // 錘頭
        c.setTransform(1,0,0,1,0,0);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.PAINT_BRUSH) {
        c.clearRect(0,0,32,32); 
        c.translate(16,16); 
        c.rotate(45*Math.PI/180); 
        c.translate(-16,-16);
        c.fillStyle = '#e0e0e0'; 
        c.fillRect(14,14,4,14); // 把手
        c.fillStyle = '#8d6e63'; 
        c.fillRect(12,8,8,6); // 刷毛座
        c.fillStyle = '#fff'; 
        c.fillRect(12,2,8,6); // 刷毛 (白色)
        c.setTransform(1,0,0,1,0,0);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.PAINT_RED || id === IDS.PAINT_GREEN || id === IDS.PAINT_BLUE) {
        c.clearRect(0,0,32,32);
        c.fillStyle = BLOCKS[id].color; // 油漆顏色
        c.fillRect(10,10,12,14); 
        c.fillStyle = '#9e9e9e'; 
        c.fillRect(8,8,16,2); // 罐蓋
        c.fillRect(12,4,8,4); // 提把
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.SIGN) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#8d6e63'; 
        c.fillRect(4,4,24,16); // 牌面
        c.fillStyle = '#5d4037'; 
        c.fillRect(14,20,4,12); // 支柱
        c.fillStyle = '#4e342e'; // 假文字
        c.fillRect(6,8,20,2); 
        c.fillRect(6,12,16,2);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 缺失的繪製（已移至下方，避免重复定义） ---
    else if (id === IDS.SEEDS) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#a5d6a7'; // 淺綠色
        c.beginPath();
        c.arc(16, 16, 4, 0, Math.PI*2);
        c.fill();
        c.fillStyle = '#66bb6a'; // 深綠色點
        c.beginPath();
        c.arc(16, 16, 2, 0, Math.PI*2);
        c.fill();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.WHEAT) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#ffeb3b'; // 金黃色
        c.fillRect(14, 8, 4, 24); // 麥稈
        c.fillStyle = '#fdd835'; // 麥穗
        c.beginPath();
        c.arc(16, 8, 6, 0, Math.PI*2);
        c.fill();
        c.fillStyle = '#f9a825';
        c.beginPath();
        c.arc(16, 8, 4, 0, Math.PI*2);
        c.fill();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 叢林與新武器 ---
    else if (id === IDS.MUD) {
        c.fillStyle = '#4e342e'; 
        c.fillRect(0,0,32,32); // 深褐色
        c.fillStyle = '#3e2723'; 
        for(let i=0;i<8;i++) c.fillRect(Math.random()*28, Math.random()*28, 4, 4);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.JUNGLE_GRASS) {
        c.fillStyle = '#4e342e'; 
        c.fillRect(0,0,32,32); // 泥土基底
        c.fillStyle = '#2e7d32'; 
        c.fillRect(0,0,32,8); // 頂部草皮
        c.fillRect(4,8,4,4); 
        c.fillRect(12,8,4,6); 
        c.fillRect(24,8,4,5); // 垂下來的草
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.JUNGLE_SPORES) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#76ff03'; // 發光的綠色孢子
        c.beginPath(); 
        c.arc(16,16,6,0,Math.PI*2); 
        c.fill();
        c.fillStyle = 'rgba(118, 255, 3, 0.5)'; 
        c.beginPath(); 
        c.arc(16,16,10,0,Math.PI*2); 
        c.fill();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.VINE) {
        c.clearRect(0,0,32,32);
        c.strokeStyle = '#2e7d32'; 
        c.lineWidth = 2;
        c.beginPath(); 
        c.moveTo(16,0); 
        c.lineTo(16,32); 
        c.stroke();
        c.fillStyle = '#1b5e20'; 
        c.fillRect(14,4,4,4); 
        c.fillRect(14,12,4,4); 
        c.fillRect(14,20,4,4); // 葉子
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.STINGER) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#212121'; 
        c.beginPath(); 
        c.moveTo(16,8); 
        c.lineTo(20,24); 
        c.lineTo(12,24); 
        c.fill(); // 三角形毒刺
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.GRAPPLING_HOOK) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#616161'; // 爪子
        c.beginPath(); 
        c.moveTo(16,10); 
        c.lineTo(24,6); 
        c.lineTo(26,14); 
        c.lineTo(16,16); 
        c.lineTo(6,14); 
        c.lineTo(8,6); 
        c.fill();
        c.fillStyle = '#bdbdbd'; 
        c.fillRect(14,16,4,10); // 鎖鏈頭
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.BOOMERANG) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#ffab91'; 
        c.strokeStyle = '#d84315'; 
        c.lineWidth = 2;
        c.beginPath(); 
        c.moveTo(4,28); 
        c.quadraticCurveTo(16,4, 28,28); 
        c.quadraticCurveTo(16,16, 4,28); 
        c.fill(); 
        c.stroke();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.BLADE_OF_GRASS) {
        c.clearRect(0,0,32,32); 
        c.translate(16,16); 
        c.rotate(45*Math.PI/180); 
        c.translate(-16,-16);
        c.fillStyle = '#2e7d32'; 
        c.fillRect(14,2,6,24); // 寬劍身
        c.fillStyle = '#76ff03'; 
        c.beginPath(); 
        c.moveTo(14,2); 
        c.lineTo(20,2); 
        c.lineTo(17,26); 
        c.fill(); // 毒刃
        c.fillStyle = '#1b5e20'; 
        c.fillRect(12,26,10,4); // 護手
        c.setTransform(1,0,0,1,0,0);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 傳送門 ---
    else if (id === IDS.TELEPORTER) {
        c.clearRect(0,0,32,32);
        // 底座
        c.fillStyle = '#424242'; 
        c.fillRect(2, 28, 28, 4);
        // 邊框
        c.fillStyle = '#bdbdbd'; 
        c.fillRect(4, 4, 4, 24); 
        c.fillRect(24, 4, 4, 24);
        c.fillRect(8, 2, 16, 4);
        // 能量力場 (畫一些隨機線條或漸層)
        c.fillStyle = 'rgba(0, 229, 255, 0.3)'; 
        c.fillRect(8, 6, 16, 22);
        c.strokeStyle = '#00e5ff'; 
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(8, 10); 
        c.lineTo(24, 10);
        c.moveTo(8, 16); 
        c.lineTo(24, 16);
        c.moveTo(8, 22); 
        c.lineTo(24, 22);
        c.stroke();
        // 中心能量點
        c.fillStyle = '#00e5ff'; 
        c.beginPath();
        c.arc(16, 16, 3, 0, Math.PI*2);
        c.fill();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 釣魚與烹飪 ---
    else if (id === IDS.WOOD_FISHING_ROD) {
        c.clearRect(0,0,32,32); 
        c.translate(16,16); 
        c.rotate(45*Math.PI/180); 
        c.translate(-16,-16);
        c.strokeStyle = '#8d6e63'; 
        c.lineWidth = 3; 
        c.beginPath(); 
        c.moveTo(4,28); 
        c.lineTo(28,4); 
        c.stroke(); // 竿身
        c.strokeStyle = '#fff'; 
        c.lineWidth = 1;
        c.beginPath(); 
        c.moveTo(28,4); 
        c.lineTo(28,20); 
        c.stroke(); // 釣線(示意)
        c.setTransform(1,0,0,1,0,0);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.RAW_FISH) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#90caf9'; 
        c.beginPath(); 
        c.ellipse(16, 16, 10, 5, 0, 0, Math.PI*2); 
        c.fill();
        c.beginPath(); 
        c.moveTo(26,16); 
        c.lineTo(30,12); 
        c.lineTo(30,20); 
        c.fill(); // 尾巴
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.COOKED_FISH) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#ffab91'; 
        c.beginPath(); 
        c.ellipse(16, 16, 9, 4, 0, 0, Math.PI*2); 
        c.fill();
        c.fillStyle = '#d84315'; 
        c.fillRect(12,14,2,4); 
        c.fillRect(16,14,2,4); // 烤痕
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.GOLDEN_CARP) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#ffd700'; 
        c.beginPath(); 
        c.ellipse(16, 16, 10, 5, 0, 0, Math.PI*2); 
        c.fill();
        c.fillStyle = '#ffeb3b'; 
        c.beginPath(); 
        c.moveTo(26,16); 
        c.lineTo(30,12); 
        c.lineTo(30,20); 
        c.fill(); // 金色尾巴
        c.fillStyle = '#fff'; 
        c.beginPath(); 
        c.arc(12, 14, 2, 0, Math.PI*2); 
        c.fill(); // 眼睛
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.TRASH) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#616161'; 
        c.beginPath(); 
        c.moveTo(10,20); 
        c.lineTo(22,20); 
        c.lineTo(20,28); 
        c.lineTo(12,28); 
        c.fill(); // 破鞋形狀
        c.fillStyle = '#424242'; 
        c.fillRect(14,16,4,4); // 鞋帶
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.SOUP) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#ffe0b2'; 
        c.beginPath(); 
        c.ellipse(16, 20, 8, 6, 0, 0, Math.PI*2); 
        c.fill(); // 湯碗
        c.fillStyle = '#ffab91'; 
        c.fillRect(10,18,12,2); // 魚肉
        c.fillStyle = '#8bc34a'; 
        c.fillRect(12,16,2,2); // 蔬菜
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.COOKING_POT) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#424242'; 
        c.beginPath(); 
        c.arc(16, 20, 10, 0, Math.PI, false); 
        c.fill(); // 鍋底
        c.fillRect(6, 14, 20, 6); // 鍋身
        c.fillStyle = '#616161'; 
        c.fillRect(6, 12, 20, 2); // 鍋緣
        c.fillStyle = '#fff'; 
        c.globalAlpha = 0.5;
        c.fillRect(10, 10, 12, 8); // 蒸汽
        c.globalAlpha = 1.0;
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 自然與生物 ---
    else if (id === IDS.BUG_NET) {
        c.clearRect(0,0,32,32);
        c.translate(16,16);
        c.rotate(45*Math.PI/180);
        c.translate(-16,-16);
        c.fillStyle = '#8d6e63';
        c.fillRect(14,14,4,14); // 把手
        c.strokeStyle = '#bdbdbd';
        c.lineWidth = 2;
        c.strokeRect(10,4,12,10); // 網框
        c.fillStyle = 'rgba(255,255,255,0.3)';
        c.fillRect(10,4,12,10); // 網子
        c.setTransform(1,0,0,1,0,0);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.CARROT) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#ff9800';
        c.beginPath();
        c.moveTo(16,28);
        c.lineTo(24,8);
        c.lineTo(8,8);
        c.fill(); // 蘿蔔身
        c.fillStyle = '#4caf50';
        c.fillRect(12,4,8,4); // 葉子
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.ITEM_BUNNY) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(16,18,8,0,Math.PI*2);
        c.fill(); // 頭
        c.fillRect(12,4,2,8);
        c.fillRect(18,4,2,8); // 耳朵
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.ITEM_FIREFLY) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#76ff03';
        c.beginPath();
        c.arc(16,16,6,0,Math.PI*2);
        c.fill(); // 發光腹部
        c.fillStyle = '#212121';
        c.fillRect(14,10,4,4); // 頭
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.DAYBLOOM) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#ffeb3b';
        c.beginPath();
        c.arc(16,12,6,0,Math.PI*2);
        c.fill(); // 花
        c.fillStyle = '#4caf50';
        c.fillRect(14,18,4,14); // 莖
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.MOONGLOW) {
        c.clearRect(0,0,32,32);
        c.strokeStyle = '#4caf50';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(16,32);
        c.quadraticCurveTo(24,16, 12,8);
        c.stroke(); // 彎曲莖
        c.fillStyle = '#29b6f6';
        c.beginPath();
        c.arc(12,8,5,0,Math.PI*2);
        c.fill(); // 藍花
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.POTION_SWIFTNESS || id === IDS.POTION_SHINE) {
        c.clearRect(0,0,32,32);
        c.fillStyle = BLOCKS[id].color;
        c.beginPath();
        c.moveTo(16,8);
        c.lineTo(24,24);
        c.lineTo(8,24);
        c.fill(); // 三角瓶
        c.fillStyle = '#fff';
        c.fillRect(14,6,4,2); // 塞子
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 容器與燈具 ---
    else if (id === IDS.BOTTLE) {
        c.clearRect(0,0,32,32);
        c.fillStyle = 'rgba(224, 247, 250, 0.5)';
        c.fillRect(12,12,8,12); // 瓶身
        c.fillRect(14,8,4,4); // 瓶頸
        c.strokeStyle = 'rgba(255,255,255,0.8)';
        c.strokeRect(12,12,8,12);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (id === IDS.FIREFLY_IN_A_BOTTLE) {
        c.clearRect(0,0,32,32);
        c.strokeStyle = '#8d6e63';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(16,0);
        c.lineTo(16,8);
        c.stroke(); // 掛繩
        c.fillStyle = 'rgba(224, 247, 250, 0.3)';
        c.fillRect(10,8,12,16);
        c.strokeStyle = '#fff';
        c.lineWidth = 1;
        c.strokeRect(10,8,12,16);
        // 螢火蟲
        c.fillStyle = '#76ff03';
        c.beginPath();
        c.arc(16,16,4,0,Math.PI*2);
        c.fill();
        c.fillStyle = 'rgba(118, 255, 3, 0.5)';
        c.beginPath();
        c.arc(16,16,8,0,Math.PI*2);
        c.fill();
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 寶石礦 ---
    else if (id === IDS.RUBY_ORE || id === IDS.SAPPHIRE_ORE || id === IDS.EMERALD_ORE) {
        c.fillStyle = '#5d4037';
        c.fillRect(0,0,32,32); // 石頭底
        c.fillStyle = BLOCKS[id].color; // 寶石顏色
        c.fillRect(8,8,6,6);
        c.fillRect(20,16,4,4);
        c.fillRect(6,22,6,6);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 寶石物品 ---
    else if (id === IDS.RUBY || id === IDS.SAPPHIRE || id === IDS.EMERALD) {
        c.clearRect(0,0,32,32);
        c.fillStyle = BLOCKS[id].color;
        c.beginPath();
        c.moveTo(16,4);
        c.lineTo(26,14);
        c.lineTo(16,28);
        c.lineTo(6,14);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.4)';
        c.beginPath();
        c.moveTo(16,4);
        c.lineTo(22,14);
        c.lineTo(16,24);
        c.lineTo(10,14);
        c.fill(); // 反光
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 晶火磚 ---
    else if (id === IDS.GEMSPARK_RED || id === IDS.GEMSPARK_BLUE || id === IDS.GEMSPARK_GREEN) {
        c.fillStyle = BLOCKS[id].color;
        c.fillRect(0,0,32,32); // 底色
        c.strokeStyle = '#fff';
        c.lineWidth = 2;
        c.strokeRect(2,2,28,28); // 發光邊框感
        c.fillStyle = 'rgba(255,255,255,0.3)';
        c.fillRect(8,8,16,16); // 中心亮光
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    // --- 墓碑 ---
    else if (id === IDS.TOMBSTONE) {
        c.clearRect(0,0,32,32);
        c.fillStyle = '#bdbdbd';
        c.beginPath();
        c.arc(16,16,12,Math.PI,0);
        c.lineTo(28,32);
        c.lineTo(4,32);
        c.fill(); // 墓碑形狀
        c.fillStyle = '#757575';
        c.font = "bold 10px monospace";
        c.textAlign = "center";
        c.fillText("R.I.P", 16, 22);
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else if (BLOCKS[id].toolSpeed) { 
        let name = BLOCKS[id].name;
        c.clearRect(0,0,32,32); c.translate(16,16); c.rotate(45 * Math.PI/180); c.translate(-16,-16); 
        c.fillStyle = '#5d4037'; 
        if (name.includes("鎬")) { c.fillRect(14, 10, 4, 20); c.fillStyle = colorHex; c.beginPath(); c.arc(16, 10, 12, Math.PI, 0); c.lineTo(16,14); c.fill(); } 
        else { c.fillRect(14, 24, 4, 8); c.fillRect(10, 24, 12, 2); c.fillStyle = colorHex; c.fillRect(14, 2, 4, 22); c.beginPath(); c.moveTo(14,2); c.lineTo(16,0); c.lineTo(18,2); c.fill(); }
    }
    // --- 小花 ---
    else if (id === IDS.FLOWER) {
        c.clearRect(0,0,32,32);
        c.strokeStyle = '#4caf50';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(16,32);
        c.quadraticCurveTo(20,20, 16,12);
        c.stroke(); // 茎
        c.fillStyle = colorHex || '#ff69b4';
        c.beginPath();
        c.arc(16,12,6,0,Math.PI*2);
        c.fill(); // 花瓣
        c.fillStyle = '#ffd700';
        c.beginPath();
        c.arc(16,12,3,0,Math.PI*2);
        c.fill(); // 花心
        if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
        return ctx.createPattern(cvs, 'repeat');
    }
    else { 
        c.fillStyle = colorHex; c.fillRect(0,0,32,32);
        for(let i=0; i<15; i++) { c.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'; c.fillRect(Math.random()*32, Math.random()*32, 2, 2); }
        if (id === IDS.BRICKS || id === IDS.PLANKS || id === IDS.STONE) { c.strokeStyle = "rgba(0,0,0,0.15)"; c.lineWidth = 2; c.strokeRect(0,0,32,32); }
        if(id === IDS.COAL_ORE) { c.fillStyle='#111'; c.fillRect(8,8,10,10); c.fillRect(20,18,6,6); }
        if(id === IDS.IRON_ORE) { c.fillStyle='#d7ccc8'; c.fillRect(10,5,8,8); c.fillRect(5,20,10,6); }
        if(id === IDS.GOLD_ORE) { c.fillStyle='#ffecb3'; c.fillRect(12,12,8,8); c.fillRect(4,4,6,6); }
    }
    
    if(!BLOCKS[id].icon) BLOCKS[id].icon = cvs;
    return ctx.createPattern(cvs, 'repeat');
}

function initTextures() {
    for(let key in BLOCKS) {
        // 为所有有color或icon的方块创建纹理
        if(BLOCKS[key].color || BLOCKS[key].icon) {
            textures[key] = createTexture(parseInt(key), BLOCKS[key].color || '#fff');
        }
    }
    // 确保特殊方块（如FLOWER）的纹理和icon被创建，即使它们没有color或icon
    if (!textures[IDS.FLOWER]) {
        textures[IDS.FLOWER] = createTexture(IDS.FLOWER);
    }
    if (!textures[IDS.DAYBLOOM]) {
        textures[IDS.DAYBLOOM] = createTexture(IDS.DAYBLOOM);
    }
    if (!textures[IDS.MOONGLOW]) {
        textures[IDS.MOONGLOW] = createTexture(IDS.MOONGLOW);
    }
}

// ==========================================
// 5. 世界生成 & 怪物
// ==========================================
function spawnMob(x, y, type) {
    let mob = { x: x, y: y, w: 24, h: 24, vx: 0, vy: 0, hp: 3, type: type, grounded: false, maxHp: 3 };
    
    if (type === 'slime') { mob.h = 18; mob.color = '#76ff03'; mob.hp = 3; mob.dmg = 1; } 
    else if (type === 'zombie') { mob.w = 22; mob.h = 38; mob.color = '#388e3c'; mob.hp = 6; mob.dmg = 2; }
    // --- 新增 BOSS 數據 ---
    else if (type === 'boss') { 
        mob.w = 60; mob.h = 60; 
        mob.color = '#d32f2f'; 
        mob.hp = 100; mob.maxHp = 100;
        mob.dmg = 5; 
        mob.phase = 1; 
        spawnFloatText(x, y, "克蘇魯之眼 甦醒!", "#d32f2f");
        playSound('explode'); 
    }
    // --- 新增怪物類型 ---
    else if (type === 'demon_eye') {
        mob.w = 24; mob.h = 24; mob.color = '#b71c1c'; 
        mob.hp = 4; mob.maxHp = 4; mob.dmg = 2; mob.fly = true;
    }
    else if (type === 'skeleton') {
        mob.w = 20; mob.h = 36; mob.color = '#e0e0e0';
        mob.hp = 8; mob.maxHp = 8; mob.dmg = 3;
    }
    else if (type === 'eater') {
        mob.w = 28; mob.h = 20; mob.color = '#7b1fa2'; // 紫色
        mob.hp = 6; mob.maxHp = 6; mob.dmg = 4; mob.fly = true;
    }
    else if (type === 'merchant') {
        mob.w = 20; mob.h = 38; mob.color = '#795548'; 
        mob.hp = 20; mob.maxHp = 20; mob.friendly = true; // 友善標記
        mob.name = "商人";
        mob.dmg = 0; // 商人不造成伤害
    }
    else if (type === 'hornet') {
        mob.w = 24; mob.h = 24; mob.color = '#ffeb3b'; // 黃色
        mob.hp = 8; mob.maxHp = 8; mob.dmg = 3; mob.fly = true;
        mob.shootTimer = 0;
    }
    else if (type === 'bunny') {
        mob.w = 20; mob.h = 20; mob.color = '#fff';
        mob.hp = 5; mob.maxHp = 5; mob.passive = true; // 被動生物標記
        mob.dmg = 0; // 兔子不造成伤害
    }
    else if (type === 'firefly') {
        mob.w = 8; mob.h = 8; mob.color = '#76ff03'; // 缩小萤火虫（8x8，比原来10x10小但不会太小）
        mob.hp = 1; mob.maxHp = 1; mob.passive = true; mob.fly = true;
        mob.dmg = 0; // 萤火虫不造成伤害
    }
    
    // 确保所有基本属性都已设置
    if (mob.x === undefined || mob.y === undefined || mob.w === undefined || mob.h === undefined) {
        console.error("spawnMob: 怪物属性不完整", mob);
        return;
    }
    
    mob.maxHp = mob.hp; 
    mobs.push(mob);
}

// --- 生成天空島 ---
function generateSkyIslands() {
    let count = 3 + Math.floor(Math.random() * 2); // 3-4 个天空岛
    let existingIslands = []; // 记录已生成的天空岛位置，避免重叠
    
    for(let i=0; i<count; i++) {
        let cx, cy;
        let attempts = 0;
        let tooClose = false;
        
        // 确保天空岛不重叠（至少间隔30格）
        do {
            cx = Math.floor(Math.random() * (CHUNK_W - 40)) + 20;
            cy = Math.floor(Math.random() * 25) + 10; // 高空 (y: 10-35)
            tooClose = false;
            
            // 检查是否与已有天空岛太近
            for (let existing of existingIslands) {
                let dist = Math.sqrt(Math.pow(cx - existing.x, 2) + Math.pow(cy - existing.y, 2));
                if (dist < 30) {
                    tooClose = true;
                    break;
                }
            }
            attempts++;
        } while (tooClose && attempts < 20); // 最多尝试20次
        
        // 记录这个天空岛的位置
        existingIslands.push({ x: cx, y: cy });
        
        // 畫雲
        for(let x = cx - 12; x <= cx + 12; x++) {
            for(let y = cy; y <= cy + 6; y++) {
                if (x >= 0 && x < CHUNK_W && y >= 0 && y < CHUNK_H) {
                    let dist = Math.sqrt(Math.pow(x-cx, 2)*2 + Math.pow(y-cy, 2)*2);
                    if (dist < 10 + Math.random()*3) {
                        setTile(x, y, IDS.CLOUD); 
                        setWall(x, y, IDS.AIR);
                    }
                }
            }
        }
        
        // 畫屋子與寶箱
        for(let hx=-2; hx<=2; hx++) {
            for(let hy=-4; hy<=0; hy++) {
                if (cx+hx >= 0 && cx+hx < CHUNK_W && cy+hy-1 >= 0 && cy+hy-1 < CHUNK_H) {
                    if(hy===0 || hx===-2 || hx===2 || hy===-4) {
                        setTile(cx+hx, cy+hy-1, IDS.SUNPLATE);
                    }
                }
            }
        }
        // 放置天域寶箱
        if (cx >= 0 && cx < CHUNK_W && cy-2 >= 0 && cy-2 < CHUNK_H) {
            setTile(cx, cy-2, IDS.SKYWARE_CHEST);
        }
    }
}

// --- 生成腐化之地 ---
function generateCorruption() {
    // 避免与丛林重叠：丛林在左侧15%处，半径40，所以范围是 0.15*CHUNK_W-40 到 0.15*CHUNK_W+40
    // 腐化之地范围是 corruptionX-20 到 corruptionX+20
    // 确保腐化之地不在丛林范围内
    let jungleCenterX = Math.floor(CHUNK_W * 0.15);
    let jungleRadius = 40;
    let jungleLeft = jungleCenterX - jungleRadius;
    let jungleRight = jungleCenterX + jungleRadius;
    
    let corruptionX;
    let attempts = 0;
    do {
        corruptionX = Math.floor(Math.random() * (CHUNK_W - 100)) + 50; // 隨機位置
        attempts++;
        // 如果腐化之地与丛林重叠，重新生成（最多尝试10次）
    } while (attempts < 10 && corruptionX - 20 < jungleRight && corruptionX + 20 > jungleLeft);
    
        // 1. 地表腐化 (將草地變黑檀石，但避免覆盖丛林生态)
        for(let x = corruptionX - 20; x < corruptionX + 20; x++) {
            if (x < 0 || x >= CHUNK_W) continue;
            for(let y = 0; y < CHUNK_H; y++) {
                if (y < 0 || y >= CHUNK_H) continue;
                let idx = y * CHUNK_W + x;
                // 避免覆盖丛林生态（泥土、丛林草、藤蔓）
                let isJungle = (tiles[idx] === IDS.MUD || tiles[idx] === IDS.JUNGLE_GRASS || tiles[idx] === IDS.VINE);
                if (!isJungle && (tiles[idx] === IDS.GRASS || tiles[idx] === IDS.DIRT || tiles[idx] === IDS.STONE)) {
                    if (Math.random() < 0.8) tiles[idx] = IDS.EBONSTONE; // 80% 機率轉化
                }
            }
        }
    
    // 2. 垂直裂隙 (Chasm)
    let chasmW = 6;
    for(let y = 0; y < CHUNK_H - 20; y++) { // 從地表往下挖
        if (y < 0 || y >= CHUNK_H) continue;
        let groundY = 0;
        // 找地表高度
        while(groundY < CHUNK_H && tiles[groundY * CHUNK_W + corruptionX] === IDS.AIR) {
            groundY++;
        }
        if (y > groundY) {
            for(let w = -chasmW/2; w < chasmW/2; w++) {
                let wx = corruptionX + w;
                if (wx >= 0 && wx < CHUNK_W && y >= 0 && y < CHUNK_H) {
                    setTile(wx, y, IDS.AIR); // 挖空
                    setWall(wx, y, IDS.EBONSTONE); // 背景牆
                    // 裂隙邊緣長黑檀石
                    if (w === -chasmW/2 && wx - 1 >= 0) setTile(wx - 1, y, IDS.EBONSTONE);
                    if (w === Math.floor(chasmW/2)-1 && wx + 1 < CHUNK_W) setTile(wx + 1, y, IDS.EBONSTONE);
                }
            }
        }
    }
}

// --- 生成叢林 ---
function generateJungle() {
    // 叢林生成在世界左側或右側的地下 (避開雪地和沙漠，這裡簡單固定在左側 1/4 處)
    let centerX = Math.floor(CHUNK_W * 0.15);
    let radiusX = 40;
    for (let x = centerX - radiusX; x < centerX + radiusX; x++) {
        if (x < 0 || x >= CHUNK_W) continue;
        for (let y = 0; y < CHUNK_H; y++) {
            if (y < 0 || y >= CHUNK_H) continue;
            let idx = y * CHUNK_W + x;
            // 將範圍內的土和石頭變成泥土
            // 利用 noise 讓邊緣不規則
            // 避免覆盖腐化之地（黑檀石）
            let dist = Math.abs(x - centerX) / radiusX;
            if (Math.random() > dist * dist) {
                // 如果已经是腐化之地（黑檀石），不覆盖
                if (tiles[idx] !== IDS.EBONSTONE && (tiles[idx] === IDS.DIRT || tiles[idx] === IDS.STONE)) {
                    tiles[idx] = IDS.MUD; // 泥土長草 (如果有空位)
                    if (y > 0 && getTile(x, y-1) === IDS.AIR && Math.random() < 0.2) {
                        tiles[idx] = IDS.JUNGLE_GRASS;
                        // 長孢子 (稀有)
                        if (Math.random() < 0.05) {
                            setTile(x, y-1, IDS.JUNGLE_SPORES);
                        }
                    }
                }
            }
        }
    }
    // 生成藤蔓
    for (let x = centerX - radiusX; x < centerX + radiusX; x++) {
        if (x < 0 || x >= CHUNK_W) continue;
        for (let y = 5; y < CHUNK_H - 10; y++) {
            if (y < 0 || y >= CHUNK_H) continue;
            if (tiles[y * CHUNK_W + x] === IDS.AIR && 
                (getTile(x, y+1) === IDS.JUNGLE_GRASS || getTile(x, y+1) === IDS.MUD) &&
                Math.random() < 0.02) {
                setTile(x, y, IDS.VINE);
            }
        }
    }
}

function spawnDrop(x, y, id) { drops.push({ x: x, y: y, w: 12, h: 12, vx: (Math.random()-0.5)*4, vy: -3, id: id, life: 3000, spawnTime: frameCount }); }

function generateWorld() {
    try {
        if (loadGame()) return; 
    } catch(e) {
        console.warn("Save corrupted, forcing reset.");
        localStorage.removeItem('terraria_save');
    }

    let heights = [];
    for (let x = 0; x < CHUNK_W; x++) {
        let n = noise(x * 0.02, 0, 0) * 15 + noise(x * 0.1, 0, 0) * 5;
        heights[x] = Math.floor(CHUNK_H * 0.4 + n);
    }
    initClouds();
    generateSkyIslands(); // 生成天空岛
    generateJungle(); // 先生成叢林（避免腐化之地覆盖丛林）
    generateCorruption(); // 生成腐化之地（会检查并避免与丛林重叠）

    for (let x = 0; x < CHUNK_W; x++) {
        let h = heights[x];
        let isDesert = noise(x * 0.02, 99, 99) > 0; 
        let isSnow = x > CHUNK_W * 0.75; 

        for (let y = 0; y < CHUNK_H; y++) {
            let idx = y * CHUNK_W + x;
            if (y >= CHUNK_H - 2) { tiles[idx] = IDS.BEDROCK; walls[idx] = IDS.BEDROCK; continue; }
            
            // 地獄層 (调整到更深的位置，给玩家更多探索空间)
            if (y > CHUNK_H - 60) {  // 从 CHUNK_H - 40 改为 CHUNK_H - 60，地狱层更深
                walls[idx] = IDS.ASH;
                if (noise(x*0.05, y*0.05, 99) > 0.2) { 
                    tiles[idx] = IDS.AIR;
                    if (y > CHUNK_H - 30 && Math.random() > 0.5) tiles[idx] = IDS.LAVA; 
                } else {
                    tiles[idx] = IDS.ASH;
                    if (Math.random() < 0.05) tiles[idx] = IDS.HELLSTONE; 
                }
                continue;
            }

            if (y > h + 5) walls[idx] = IDS.DIRT; else walls[idx] = IDS.AIR;
            if (y < h) { tiles[idx] = IDS.AIR; walls[idx] = IDS.AIR; } 
            else {
                // --- 黏土生成 ---
                if (y < h + 10 && tiles[idx] === IDS.DIRT && Math.random() < 0.05) {
                    tiles[idx] = IDS.CLAY;
                }
                
                let caveN = noise(x * 0.05, y * 0.05, 0); 
                let waterN = noise(x * 0.08, y * 0.08, 123); 
                if (caveN > 0.4 && y > h + 5) { 
                    tiles[idx] = IDS.AIR; walls[idx] = IDS.STONE; 
                    // 增加水的生成区域，让玩家更容易找到水
                    if (waterN > 0.25 && y > h + 10 && y < CHUNK_H - 80) { 
                        tiles[idx] = IDS.WATER; 
                    }
                    // 深层洞穴可能有岩浆
                    if (y > CHUNK_H - 80 && Math.random() < 0.1) {
                        tiles[idx] = IDS.LAVA;
                    }
                } else {
                    if (y == h) {
                        if (isSnow) tiles[idx] = IDS.SNOW;
                        else tiles[idx] = isDesert ? IDS.SAND : IDS.GRASS;
                    }
                    else if (y < h + 10) {
                        if (isSnow) tiles[idx] = IDS.SNOW;
                        else tiles[idx] = isDesert ? IDS.SAND : IDS.DIRT;
                    }
                    else {
                        tiles[idx] = IDS.STONE; walls[idx] = IDS.STONE;
                        if (noise(x*0.1, y*0.1, 50) > 0.6) tiles[idx] = IDS.SAND;
                        if (isSnow && Math.random() < 0.1) tiles[idx] = IDS.ICE;

                        // 矿石和宝石生成（避免冲突：先检查宝石，再检查普通矿石）
                        // 宝石优先级更高（更稀有），如果生成宝石就不生成普通矿石
                        let hasGem = false;
                        if (y > CHUNK_H * 0.5) { // 深度 50% 以下
                            let gemRand = Math.random();
                            if (gemRand < 0.004) {
                                tiles[idx] = IDS.RUBY_ORE;
                                hasGem = true;
                            } else if (gemRand < 0.008) {
                                tiles[idx] = IDS.SAPPHIRE_ORE;
                                hasGem = true;
                            } else if (gemRand < 0.012) {
                                tiles[idx] = IDS.EMERALD_ORE;
                                hasGem = true;
                            }
                        }
                        
                        // 如果没有生成宝石，再检查钻石和普通矿石
                        if (!hasGem) {
                            if (y > CHUNK_H * 0.7 && Math.random() < 0.005) {
                                tiles[idx] = IDS.DIAMOND_ORE;
                            } else {
                        let oreN = Math.random();
                        if(oreN > 0.98) tiles[idx] = IDS.GOLD_ORE;
                        else if(oreN > 0.96) tiles[idx] = IDS.IRON_ORE;
                        else if(oreN > 0.94) tiles[idx] = IDS.COAL_ORE;
                            }
                        }
                    }
                }
            }
            
            // --- 生成地下陶罐 ---
            // 條件：當前是空氣，下面是石頭/泥土/磚塊，且在地表以下
            if (y > h + 15 && tiles[idx] === IDS.AIR) {
                let belowIdx = (y + 1) * CHUNK_W + x;
                if (belowIdx >= 0 && belowIdx < tiles.length) {
                    let below = tiles[belowIdx];
                    if ((below === IDS.STONE || below === IDS.DIRT || below === IDS.WOOD_PLATFORM) && Math.random() < 0.015) {
                        tiles[idx] = IDS.POT;
                    }
                }
            }
        }
    }
    
    mobs = []; drops = [];
    for (let x = 0; x < CHUNK_W; x++) {
        let isDesert = noise(x * 0.02, 99, 99) > 0;
        let isSnow = x > CHUNK_W * 0.75;
        let h = heights[x];
        let groundIdx = h * CHUNK_W + x;
        if (!isDesert && !isSnow && x > 5 && x < CHUNK_W - 5 && x % 5 === 0 && Math.random() < 0.5) {
            if(tiles[groundIdx] === IDS.GRASS) {
                let treeH = 4 + Math.floor(Math.random() * 4);
                for(let i=1; i<=treeH; i++) { let ti = (h-i)*CHUNK_W + x; tiles[ti] = IDS.WOOD; walls[ti] = IDS.AIR; }
                let topY = h - treeH;
                for(let ly = -3; ly <= 1; ly++) for(let lx = -3; lx <= 3; lx++) { 
                    if (lx*lx + ly*ly <= 7) { 
                        let worldX = x + lx, worldY = topY + ly;
                        if(worldX >= 0 && worldX < CHUNK_W && worldY >= 0 && worldY < CHUNK_H) {
                            let tidx = worldY * CHUNK_W + worldX;
                            if(tiles[tidx] === IDS.AIR) tiles[tidx] = IDS.LEAVES;
                        }
                    }
                }
            }
        }
        // 地表長花草（大幅增加密度：每3格检查一次，高概率生成，避免覆盖已有花朵）
        if (x % 3 === 0 && tiles[groundIdx] === IDS.GRASS && h > 0) {
            let aboveIdx = (h-1) * CHUNK_W + x;
            let aboveId = tiles[aboveIdx];
            // 检查上方是否是空气或已有花朵（避免覆盖）
            let isFlower = (aboveId === IDS.FLOWER || aboveId === IDS.DAYBLOOM || aboveId === IDS.MOONGLOW);
            if (aboveId === IDS.AIR && !isFlower && Math.random() < 0.8) {
                let rand = Math.random();
                if (rand < 0.15) setTile(x, h-1, IDS.DAYBLOOM); // 太陽花 15%
                else if (rand < 0.30) setTile(x, h-1, IDS.MOONGLOW); // 月光草 15%
                else if (rand < 0.50) setTile(x, h-1, IDS.FLOWER); // 普通花 20%
            }
        }
        
        if (x % 20 === 0 && Math.random() < 0.2 && tiles[groundIdx] === IDS.GRASS) { spawnMob(x * TILE_SIZE, (h - 2) * TILE_SIZE, 'slime'); } // 調低初始生成機率：50% -> 20%
        
        // 在地下的洞穴中随机生成探索宝箱
        if (x % 30 === 0 && Math.random() < 0.3) {
            for (let y = h + 10; y < CHUNK_H - 80; y++) {  // 调整宝箱生成范围
                let idx = y * CHUNK_W + x;
                let belowIdx = (y + 1) * CHUNK_W + x;
                // 在洞穴中，地面上生成宝箱
                if (tiles[idx] === IDS.AIR && tiles[belowIdx] === IDS.STONE && Math.random() < 0.1) {
                    tiles[idx] = IDS.LOOT_CHEST;
                    break;
                }
            }
        }
    }
    
    // --- 在洞穴中生成蜘蛛網 (在生成完地形後) ---
    for (let x = 0; x < CHUNK_W; x++) {
        for (let y = 0; y < CHUNK_H; y++) {
            let idx = y * CHUNK_W + x;
            if (tiles[idx] === IDS.AIR && walls[idx] === IDS.STONE) { // 背景是石牆的空地
                // 檢查周圍是否有方塊 (蜘蛛網喜歡黏在牆角)
                let hasSupport = false;
                if (getBlock(x-1, y).solid || getBlock(x+1, y).solid || getBlock(x, y-1).solid || getBlock(x, y+1).solid) {
                    hasSupport = true;
                }
                if (hasSupport && Math.random() < 0.05) {
                    tiles[idx] = IDS.COBWEB;
                }
            }
        }
    }
    
    player.x = (CHUNK_W/2) * TILE_SIZE;
    player.y = (heights[Math.floor(CHUNK_W/2)] - 5) * TILE_SIZE;
    spawnPoint.x = player.x; spawnPoint.y = player.y;
    
    startGame();
}

function initClouds() {
    clouds = [];
    let worldPixelWidth = CHUNK_W * TILE_SIZE; 
    for(let i=0; i<40; i++) { 
        clouds.push({ x: Math.random() * worldPixelWidth, y: Math.random() * (CHUNK_H * TILE_SIZE * 0.5), w: 80 + Math.random() * 100, s: 0.2 + Math.random() * 0.3 });
    }
}

function startGame() {
    initTextures();
    fullLightUpdate();
    
    updateUI();
    updateHealthUI();
    const craftTitle = document.querySelector('#crafting-menu h3');
    if(craftTitle) craftTitle.innerText = "合成製作";
    document.getElementById('loading').style.display = 'none';
    // 根據主體遊戲選角初始化玩家視覺圖片（GIF / PNG）
    initPlayerSprite();
    requestAnimationFrame(loop);
}

// ==========================================
// 冒險模式存檔版本管理（只針對 terraria_save）
// ==========================================
//
// 維護備註：
// - 此處的「存檔版本」僅用於冒險模式自己的世界存檔：localStorage['terraria_save']。
// - 不得與主體遊戲的 SaveCode / SCHEMA_VERSION / SALT 混用或共用欄位。
// - 原則：
//   1) 只在這裡與 loadGame / saveGame 中調整冒險模式的欄位結構。
//   2) 任何新欄位一律以「補預設值」方式相容舊存檔，不覆蓋已存在且有效的資料。
//   3) 不改動既有欄位名稱，不刪除玩家資料欄位（除非有嚴重 bug 且有明確遷移邏輯）。
//   4) 若未來需要提升版本，請：
//      - 將 ADVENTURE_SAVE_SCHEMA_VERSION 提升為下一個整數（例如 2）。
//      - 在 upgradeAdventureSaveIfNeeded 中加入「從舊版升級到新版」的補值邏輯。
//      - 保持舊版本存檔可讀：舊檔只會缺少新欄位，但不會無法載入。
//
// 與主體 SaveCode 的關係：
// - 主體遊戲的 SaveCode（js/save_code.js）並不會讀寫 'terraria_save'。
// - 冒險模式的 AdventureSaveCode（js/modes/adventure/adventure_save_code.js）只會封裝 terraria_save 的 JSON 字串。
// - 因此本處版本號與結構調整，只影響冒險模式本身，不會破壞主體遊戲的引繼碼系統。
var ADVENTURE_SAVE_SCHEMA_VERSION = 1;

function upgradeAdventureSaveIfNeeded(raw) {
    // 容錯：若 raw 為 null/非物件，直接原樣返回，後續 loadGame 會拋錯並要求重置世界
    if (!raw || typeof raw !== 'object') return raw;
    var v = (typeof raw.version === 'number') ? raw.version : 0;

    // v0 → v1：
    // - 早期存檔沒有 version 欄位，欄位結構由 loadGame 內的「確保新屬性存在」邏輯處理。
    // - 目前 v1 不新增強制欄位，只是標記 version，為未來擴充預留升級管線。
    if (v < 1) {
        // 未來若新增欄位，請在這裡針對 raw.* 補齊預設值，
        // 範例（僅示意）：
        //   if (!raw.someNewField) raw.someNewField = { ...預設值... };
        v = 1;
    }

    raw.version = ADVENTURE_SAVE_SCHEMA_VERSION;
    return raw;
}

function saveGame() {
    const data = { 
        // 冒險模式存檔版本（僅限 terraria_save）
        version: ADVENTURE_SAVE_SCHEMA_VERSION,
        player: player, 
        gameTime: gameTime, 
        spawnPoint: spawnPoint, 
        tiles: Array.from(tiles), 
        walls: Array.from(walls),
        chestData: chestData,  // 保存宝箱数据
        // --- 新增 ---
        tileColors: Array.from(tileColors),
        signData: signData,
        teleporters: teleporters, // 保存傳送門數據
        buffs: player.buffs, // 保存Buff狀態
        fishing: player.fishing, // 保存釣魚狀態
        pet: player.pet // 保存寵物狀態
    };
    try { 
        localStorage.setItem('terraria_save', JSON.stringify(data)); 
        const msg = document.getElementById('save-msg'); 
        msg.style.display = 'block'; 
        setTimeout(() => msg.style.display = 'none', 1500); 
    } catch(e) { 
        alert("存檔失敗"); 
    }
}
function loadGame() {
    const json = localStorage.getItem('terraria_save');
    if (!json) return false;
    try {
        let data = JSON.parse(json);
        // 冒險模式存檔版本升級：只在本地物件上補欄位與 version，維持向下相容
        data = upgradeAdventureSaveIfNeeded(data);
        if (!data.tiles || data.tiles.length !== CHUNK_W * CHUNK_H) throw new Error("Save corrupted");
        // 驗證玩家數據是否存在且為對象
        if (!data.player || typeof data.player !== 'object') {
            throw new Error("Player data corrupted");
        }
        player = data.player;
        
        // 確保新屬性存在（向後兼容）
        if (player.coins === undefined) player.coins = 0;
        if (player.defense === undefined) player.defense = 0;
        if (!player.equip) player.equip = { head: 0 };
        if (player.maxMana === undefined) player.maxMana = 20;
        if (player.mana === undefined) player.mana = player.maxMana;
        if (player.manaTimer === undefined) player.manaTimer = 0;
        if (player.jumpCount === undefined) player.jumpCount = 0;
        if (player.maxJumps === undefined) player.maxJumps = 1;
        if (player.jumpKeyHeld === undefined) player.jumpKeyHeld = false;
        if (player.hook === undefined) player.hook = { active: false, x: 0, y: 0, vx: 0, vy: 0, state: 0 };
        if (player.wKeyLocked === undefined) player.wKeyLocked = false;
        if (!player.buffs) player.buffs = { wellFed: 0, swiftness: 0, shine: 0 };
        if (!player.fishing) player.fishing = { active: false, x: 0, y: 0, vx: 0, vy: 0, biteTimer: 0, inWater: false, catchWindow: 0 };
        if (!player.pet) player.pet = { active: false, x: 0, y: 0, type: null };
        
        // 確保背包大小不超過20格（載入存檔時）
        if (player.inventory && Array.isArray(player.inventory)) {
            // 限制背包大小為20格
            if (player.inventory.length > MAX_INVENTORY_SLOTS) {
                player.inventory = player.inventory.slice(0, MAX_INVENTORY_SLOTS);
            } else if (player.inventory.length < MAX_INVENTORY_SLOTS) {
                // 如果少於20格，補齊到20格
                while (player.inventory.length < MAX_INVENTORY_SLOTS) {
                    player.inventory.push({id: IDS.AIR, count: 0});
                }
            }
            
            // 確保所有物品的耐久度正確初始化
            player.inventory.forEach(item => {
                if (!item || typeof item !== 'object') return;
                // 驗證物品ID是否有效
                if (item.id === undefined || item.id === null || !BLOCKS[item.id]) {
                    item.id = IDS.AIR;
                    item.count = 0;
                    item.durability = undefined;
                    return;
                }
                // 確保數量不會是負數
                if (item.count === undefined || item.count === null || item.count < 0) {
                    item.count = 0;
                }
                // 如果數量為0，清空物品
                if (item.count === 0 && item.id !== IDS.AIR) {
                    item.id = IDS.AIR;
                    item.durability = undefined;
                }
                if (item && item.id !== IDS.AIR && BLOCKS[item.id] && BLOCKS[item.id].durability) {
                    // 如果物品有耐久度定義但當前物品沒有耐久度值，初始化為最大值
                    if (item.durability === undefined || item.durability === null) {
                        item.durability = BLOCKS[item.id].durability;
                    }
                    // 確保耐久度不超過最大值
                    if (item.durability > BLOCKS[item.id].durability) {
                        item.durability = BLOCKS[item.id].durability;
                    }
                } else if (item && (!BLOCKS[item.id] || !BLOCKS[item.id].durability)) {
                    // 如果物品沒有耐久度定義，清除耐久度屬性
                    item.durability = undefined;
                }
            });
        } else {
            // 如果背包不存在或不是數組，初始化為20格
            player.inventory = Array(MAX_INVENTORY_SLOTS).fill(null).map(() => ({id: IDS.AIR, count: 0}));
        }
        
        // 驗證其他關鍵數據
        if (typeof data.gameTime !== 'number' || data.gameTime < 0) {
            data.gameTime = 0;
        }
        gameTime = data.gameTime; 
        
        if (!data.spawnPoint || typeof data.spawnPoint !== 'object' || 
            typeof data.spawnPoint.x !== 'number' || typeof data.spawnPoint.y !== 'number') {
            data.spawnPoint = { x: CHUNK_W * TILE_SIZE / 2, y: 50 };
        }
        spawnPoint = data.spawnPoint;
        
        if (!data.walls || !Array.isArray(data.walls) || data.walls.length !== CHUNK_W * CHUNK_H) {
            // 如果牆壁數據無效，創建空的牆壁數組
            data.walls = Array(CHUNK_W * CHUNK_H).fill(0);
        }
        tiles = new Uint8Array(data.tiles); 
        walls = new Uint8Array(data.walls);
        chestData = data.chestData || {};  // 加载宝箱数据，如果没有则初始化为空对象
        
        // --- 新增 ---
        if (data.tileColors) tileColors = new Uint8Array(data.tileColors);
        else tileColors = new Uint8Array(CHUNK_W * CHUNK_H); // 舊存檔兼容
        
        signData = data.signData || {};
        teleporters = data.teleporters || []; // 載入傳送門數據
        
        // 確保teleporters是數組且每個元素有必要的屬性
        if (!Array.isArray(teleporters)) teleporters = [];
        teleporters = teleporters.filter(t => t && t.x !== undefined && t.y !== undefined && t.name);
        
        if (data.buffs) {
            player.buffs = data.buffs;
            // 確保新Buff存在
            if (player.buffs.swiftness === undefined) player.buffs.swiftness = 0;
            if (player.buffs.shine === undefined) player.buffs.shine = 0;
        }
        if (data.fishing) {
            player.fishing = data.fishing;
            // 確保釣魚狀態屬性完整
            if (!player.fishing.biteTimer) player.fishing.biteTimer = 0;
            if (!player.fishing.catchWindow) player.fishing.catchWindow = 0;
            if (player.fishing.inWater === undefined) player.fishing.inWater = false;
        }
        if (data.pet) {
            player.pet = data.pet;
            // 確保寵物狀態屬性完整
            if (player.pet.active === undefined) player.pet.active = false;
            if (!player.pet.x) player.pet.x = 0;
            if (!player.pet.y) player.pet.y = 0;
        }
        
        // 確保chestData是對象且每個箱子數據格式正確
        if (typeof chestData !== 'object' || chestData === null) chestData = {};
        for (let key in chestData) {
            if (!Array.isArray(chestData[key])) {
                chestData[key] = Array(10).fill().map(() => ({ id: IDS.AIR, count: 0 }));
            } else {
                // 確保每個箱子槽位格式正確（包含耐久度處理）
                chestData[key] = chestData[key].map(item => {
                    if (!item || typeof item !== 'object') return { id: IDS.AIR, count: 0 };
                    if (item.id === undefined || item.id === null) item.id = IDS.AIR;
                    // 驗證物品ID是否有效
                    if (!BLOCKS[item.id]) {
                        item.id = IDS.AIR;
                        item.count = 0;
                        item.durability = undefined;
                        return item;
                    }
                    if (item.count === undefined || item.count === null || item.count < 0) {
                        item.count = 0;
                    }
                    // 如果數量為0，清空物品
                    if (item.count === 0 && item.id !== IDS.AIR) {
                        item.id = IDS.AIR;
                        item.durability = undefined;
                        return item;
                    }
                    // 確保耐久度正確初始化
                    if (item.id !== IDS.AIR && BLOCKS[item.id] && BLOCKS[item.id].durability) {
                        if (item.durability === undefined || item.durability === null) {
                            item.durability = BLOCKS[item.id].durability;
                        }
                        if (item.durability > BLOCKS[item.id].durability) {
                            item.durability = BLOCKS[item.id].durability;
                        }
                    } else {
                        item.durability = undefined;
                    }
                    return item;
                });
                // 確保箱子有10個槽位
                while (chestData[key].length < 10) {
                    chestData[key].push({ id: IDS.AIR, count: 0 });
                }
                if (chestData[key].length > 10) {
                    chestData[key] = chestData[key].slice(0, 10);
                }
            }
        }
        
        initClouds(); 
        startGame(); 
        return true;
    } catch(e) { 
        console.warn("Load failed", e);
        return false; 
    }
}
function resetGame() { if(confirm("確定要刪除存檔?")) { localStorage.removeItem('terraria_save'); location.reload(); } }

// ==========================================
// 6. 物理與邏輯
// ==========================================
function updatePhysics() {
    // 0. 傳送選單開啟時，禁止移動
    if (isTeleportMenuOpen) {
        player.vx = 0; 
        player.vy = 0;
        return; 
    }
    
    // --- 傳送門觸發檢查 (在鉤爪邏輯之前) ---
    // 檢查腳下是否有傳送門
    let centerTx = Math.floor((player.x + player.w/2) / TILE_SIZE);
    let centerTy = Math.floor((player.y + player.h/2) / TILE_SIZE);
    
    // 判定 W 鍵 (且單次觸發，避免長按)
    if (keys['KeyW'] && getTile(centerTx, centerTy) === IDS.TELEPORTER) {
        if (!player.wKeyLocked) { // 鎖定標記，防止連續觸發
            openTeleportUI(centerTx, centerTy);
            player.wKeyLocked = true;
            // 強制停止移動，避免 W 鍵同時觸發爬繩子
            player.vx = 0; 
            player.vy = 0; 
            return; // 直接 return 避免執行後面的爬梯子或跳躍
        }
    } else {
        player.wKeyLocked = false;
    }
    
    // --- 釣魚浮標物理 ---
    if (player.fishing.active) {
        // 確保釣魚狀態屬性已定義
        if (!player.fishing.vx) player.fishing.vx = 0;
        if (!player.fishing.vy) player.fishing.vy = 0;
        if (!player.fishing.biteTimer) player.fishing.biteTimer = 0;
        if (!player.fishing.catchWindow) player.fishing.catchWindow = 0;
        
        // 1. 移動與重力
        player.fishing.x += player.fishing.vx;
        player.fishing.y += player.fishing.vy;
        player.fishing.vy += 0.2; // 浮標重力較輕
        
        // 防止浮標位置溢出
        if (player.fishing.x < 0) player.fishing.x = 0;
        if (player.fishing.x > CHUNK_W*TILE_SIZE) player.fishing.x = CHUNK_W*TILE_SIZE;
        if (player.fishing.y < 0) player.fishing.y = 0;
        if (player.fishing.y > CHUNK_H*TILE_SIZE) {
            player.fishing.active = false; // 超出边界，停止钓鱼
            spawnFloatText(player.x, player.y, "線斷了!", "#999");
        }
        
        // 2. 檢測是否入水
        let fx = Math.floor(player.fishing.x / TILE_SIZE);
        let fy = Math.floor(player.fishing.y / TILE_SIZE);
        let tile = getTile(fx, fy);
        
        if (tile === IDS.WATER) {
            if (!player.fishing.inWater) {
                // 剛入水，濺起水花
                createParticle(player.fishing.x, player.fishing.y, "#2196f3", 0.5);
                playSound('slime');
            }
            player.fishing.inWater = true;
            player.fishing.vx *= 0.9; // 水中阻力
            player.fishing.vy *= 0.5;
            
            // 浮力：讓它浮在水面上
            if (player.fishing.vy > 1) player.fishing.vy = 0.5;
            
            // 3. 等待魚上鉤
            if (player.fishing.biteTimer > 0) {
                player.fishing.biteTimer--;
                
                // 魚咬鉤震動特效
                if (player.fishing.biteTimer < 60 && Math.random() < 0.1) {
                    player.fishing.y += 2; // 浮標下沉
                }
                
                // 咬鉤提示
                if (player.fishing.biteTimer === 0) {
                    spawnFloatText(player.fishing.x, player.fishing.y - 10, "!", "#ffeb3b");
                    playSound('mine'); // 提示音
                    // 給玩家一段時間反應 (60 幀)，錯過就跑了
                    player.fishing.catchWindow = 60; 
                }
            } else if (player.fishing.catchWindow > 0) {
                player.fishing.catchWindow--;
                if (player.fishing.catchWindow <= 0) {
                    // 魚跑了
                    spawnFloatText(player.fishing.x, player.fishing.y - 10, "跑了...", "#999");
                    player.fishing.inWater = false; // 重置狀態需重新拋竿
                    player.fishing.active = false;
                }
            }
        } else {
            // 不在水中
            player.fishing.inWater = false;
            // 碰到地面反彈或停止
            if (BLOCKS[tile] && BLOCKS[tile].solid) {
                player.fishing.vx = 0; 
                player.fishing.vy = 0;
            }
        }
        
        // 距離限制 (線太長會斷)
        let dist = Math.sqrt(Math.pow(player.fishing.x - player.x, 2) + Math.pow(player.fishing.y - player.y, 2));
        if (dist > 400) {
            player.fishing.active = false;
            spawnFloatText(player.x, player.y, "線斷了!", "#999");
        }
    }
    
    // --- Buff 邏輯 ---
    if (player.buffs.wellFed > 0) {
        player.buffs.wellFed--;
        // 防止buff时间变成负数
        if (player.buffs.wellFed < 0) player.buffs.wellFed = 0;
        // 屬性加成：回血變快，跑得變快
        if (player.buffs.wellFed > 0 && player.buffs.wellFed % 60 === 0 && player.hp < player.maxHp) {
            player.hp += 1; // 額外回血
            // 防止HP溢出
            if (player.hp > player.maxHp) player.hp = player.maxHp;
            updateHealthUI();
        }
    }
    
    // --- 鉤爪物理 ---
    if (player.hook.active) {
        // 確保鉤爪屬性已定義
        if (!player.hook.vx) player.hook.vx = 0;
        if (!player.hook.vy) player.hook.vy = 0;
        if (player.hook.state === undefined) player.hook.state = 0;
        
        if (player.hook.state === 1) { // 射出
            player.hook.x += player.hook.vx;
            player.hook.y += player.hook.vy;
            
            // 防止鉤爪位置溢出
            if (player.hook.x < 0 || player.hook.x > CHUNK_W*TILE_SIZE || 
                player.hook.y < 0 || player.hook.y > CHUNK_H*TILE_SIZE) {
                player.hook.state = 2; // 超出边界，拉回
            }
            // 碰撞檢測 (碰到方塊)
            let tx = Math.floor(player.hook.x/TILE_SIZE);
            let ty = Math.floor(player.hook.y/TILE_SIZE);
            if (tx >= 0 && tx < CHUNK_W && ty >= 0 && ty < CHUNK_H) {
                let block = BLOCKS[getTile(tx, ty)];
                if (block && block.solid) {
                    player.hook.state = 3; // 鉤住
                    playSound('hit');
                    player.grounded = true; 
                    player.jumpCount = 0; // 重置跳躍
                }
            }
            // 射程限制
            let dist = Math.sqrt(Math.pow(player.hook.x-player.x, 2) + Math.pow(player.hook.y-player.y, 2));
            if (dist > 300) player.hook.state = 2; // 太遠拉回
        }
        else if (player.hook.state === 2) { // 拉回 (沒鉤中)
            let angle = Math.atan2((player.y+20) - player.hook.y, (player.x+10) - player.hook.x);
            player.hook.x += Math.cos(angle) * 20;
            player.hook.y += Math.sin(angle) * 20;
            let dist = Math.sqrt(Math.pow(player.hook.x-(player.x+10), 2) + Math.pow(player.hook.y-(player.y+20), 2));
            if (dist < 20) player.hook.active = false;
        }
        else if (player.hook.state === 3) { // 鉤住 (拉玩家)
            // 跳躍取消鉤爪
            if (keys['Space'] && !player.jumpKeyHeld) {
                player.hook.active = false;
                player.vy = -JUMP_FORCE; // 跳開
                player.jumpKeyHeld = true;
            }
        }
    }
    
    // 檢查是否有二段跳飾品
    let hasCloud = player.inventory.some(i => i.id === IDS.CLOUD_IN_BOTTLE);
    player.maxJumps = hasCloud ? 2 : 1;
    
    // 1. 左右移動
    let move = 0;
    if (keys['KeyA'] || keys['ArrowLeft']) move = -1;
    if (keys['KeyD'] || keys['ArrowRight']) move = 1;
    player.vx += move * ACCEL; 
    player.vx *= FRICTION;
    // 防止速度溢出（设置最大水平速度）
    const MAX_HORIZONTAL_SPEED = 8;
    if (player.vx > MAX_HORIZONTAL_SPEED) player.vx = MAX_HORIZONTAL_SPEED;
    if (player.vx < -MAX_HORIZONTAL_SPEED) player.vx = -MAX_HORIZONTAL_SPEED;
    
    // 2. 檢測環境 (水、岩漿、梯子)
    let cx = Math.floor((player.x + player.w / 2) / TILE_SIZE);
    let cy = Math.floor((player.y + player.h / 2) / TILE_SIZE);
    let currentTile = getTile(cx, cy);
    let def = BLOCKS[currentTile];
    
    let inWater = currentTile === IDS.WATER;
    let inLava = currentTile === IDS.LAVA;
    let inWeb = (def && def.slow); // 蜘蛛網減速
    let onRope = (def && def.climbable); // 是否在繩索/鐵鍊上
    
    // --- 蜘蛛網效果 ---
    if (inWeb) { 
        player.vx *= 0.5; 
        player.vy *= 0.5; 
    }
    
    // --- 繩索攀爬邏輯 (新增) ---
    if (onRope) {
        player.grounded = true; // 視為著地，可以隨時跳躍離開
        player.jumpCount = 0;   // 重置跳躍次數
        player.vx *= 0.8;       // 在繩子上左右移動變慢
        player.vy = 0;          // **取消重力**
        
        // W/S 上下爬行 (如果按下 W 且沒按 Space，則往上爬)
        if ((keys['KeyW'] || keys['ArrowUp']) && !keys['Space']) {
            player.vy = -3;
        }
        if (keys['KeyS'] || keys['ArrowDown']) {
            player.vy = 3;
        }
    }
    
    // --- 液體物理 (保持不變) ---
    if (inWater || inLava) { 
        player.vx *= (inLava ? 0.4 : 0.6); 
        if (player.vy > 2) player.vy = 2; 
        if (inLava) takeDamage(1); 
    }

    // 3. 應用 X 軸移動
    player.x += player.vx; 
    handleCollisions(player, true);
    
    // 4. 重力應用 (如果不在繩子上且沒被鉤爪拉住)
    player.lastVy = player.vy; 
    if (!onRope && player.hook.state !== 3) { // <--- 只有不在繩子上且沒被鉤爪拉住才加重力
        player.vy += GRAVITY; 
        if (player.vy > MAX_FALL) player.vy = MAX_FALL;
    }
    
    // 鉤爪拉玩家 (在重力之後處理)
    if (player.hook.state === 3) {
        player.vx = 0; 
        player.vy = 0; // 停止重力
        player.jumpCount = 0; // 重置跳躍計數（鉤爪鉤住時視為著地）
        let angle = Math.atan2(player.hook.y - (player.y+20), player.hook.x - (player.x+10));
        // 將玩家拉向鉤子
        let speed = 8;
        let dist = Math.sqrt(Math.pow(player.hook.x-(player.x+10), 2) + Math.pow(player.hook.y-(player.y+20), 2));
        if (dist > 10) {
            player.x += Math.cos(angle) * speed;
            player.y += Math.sin(angle) * speed;
            // 防止位置溢出
            if (player.x < 0) player.x = 0;
            if (player.x > CHUNK_W*TILE_SIZE) player.x = CHUNK_W*TILE_SIZE;
            if (player.y < 0) player.y = 0;
            if (player.y > CHUNK_H*TILE_SIZE) {
                player.hook.active = false; // 超出边界，取消钩爪
                takeDamage(999);
            }
        }
    }
    
    // 5. 跳躍處理 (Space 鍵優先判定為跳躍)
    if (keys['Space']) { // 只用 Space 跳躍，W 留給爬梯子
        if (!player.jumpKeyHeld) { 
            if (player.grounded || onRope) { // 在繩子上也可以跳
                player.vy = -JUMP_FORCE; 
                player.grounded = false; 
                player.jumpCount = 1;
                playSound('jump');
            }
            else if (player.jumpCount < player.maxJumps) { // 二段跳
                player.vy = -JUMP_FORCE;
                player.jumpCount++;
                createParticle(player.x+10, player.y+30, "#fff", 0.5);
                playSound('jump');
            }
            else if (inWater || inLava) { 
                player.vy = -3; 
            }
            player.jumpKeyHeld = true;
        }
    } else {
        player.jumpKeyHeld = false;
    }
    
    // 6. 應用 Y 軸移動
    player.y += player.vy; 
    player.grounded = false; 
    handleCollisions(player, false);
    
    // 如果落地，重置跳躍計數
    if (player.grounded) {
        player.jumpCount = 0;
    }
    
    if (player.lastVy > 0 && player.vy === 0 && player.grounded && !onRope) { // 下繩子不扣血
        if (player.lastVy > 11) takeDamage(1); 
        if (player.lastVy > 16) takeDamage(2);
    }
    if (player.invincibleTimer > 0) player.invincibleTimer--;
    
    player.regenTimer++;
    if (player.regenTimer > 600 && player.hp < player.maxHp) { 
        player.hp++;
        // 防止HP溢出
        if (player.hp > player.maxHp) player.hp = player.maxHp;
        updateHealthUI(); 
        player.regenTimer = 0;
    }
    
    // 魔力回復
    player.manaTimer++;
    if (player.manaTimer > 60 && player.mana < player.maxMana) { // 每秒回魔
        player.mana += 1; // 回復速度
        // 防止魔力溢出
        if (player.mana > player.maxMana) player.mana = player.maxMana;
        player.manaTimer = 0;
        updateHealthUI(); // 更新介面顯示
    }
    
    // --- 寵物 AI ---
    if (player.pet && player.pet.active) {
        // 簡單跟隨：向玩家移動
        let speed = 2;
        if (player.pet.x < player.x - 30) player.pet.x += speed;
        if (player.pet.x > player.x + 30) player.pet.x -= speed;
        
        // 處理高度：簡單平滑移動
        player.pet.y += (player.y - player.pet.y) * 0.1;
        
        // 如果距離太遠，直接傳送
        let dist = Math.sqrt(Math.pow(player.pet.x-player.x, 2) + Math.pow(player.pet.y-player.y, 2));
        if (dist > 400) {
            player.pet.x = player.x;
            player.pet.y = player.y;
        }
    }
    
    // 敏捷藥水 (加速)
    if (player.buffs && player.buffs.swiftness > 0) {
        player.buffs.swiftness--;
        // 防止buff时间变成负数
        if (player.buffs.swiftness < 0) player.buffs.swiftness = 0;
        // 簡單增加移動速度：如果是跑步狀態，額外加一點位移
        if (player.buffs.swiftness > 0 && Math.abs(player.vx) > 0.5) {
            let extraMove = (player.vx > 0 ? 0.5 : -0.5);
            player.x += extraMove;
            // 防止位置溢出
            if (player.x < 0) player.x = 0;
            if (player.x > CHUNK_W*TILE_SIZE) player.x = CHUNK_W*TILE_SIZE;
        }
    }
    
    // 光芒藥水 (發光)
    if (player.buffs && player.buffs.shine > 0) {
        player.buffs.shine--;
        // 防止buff时间变成负数
        if (player.buffs.shine < 0) player.buffs.shine = 0;
        if (player.buffs.shine > 0 && frameCount % 5 === 0) {
            createParticle(player.x+10, player.y+20, "rgba(255,255,0,0.5)", 1.0);
        }
        // 實際光照邏輯需要修改 lightMap，這裡僅用粒子特效模擬視覺
    }
    
    // 檢查附近是否有營火
    let nearCampfire = false;
    let campfireCx = Math.floor(player.x / TILE_SIZE); 
    let campfireCy = Math.floor(player.y / TILE_SIZE);
    for(let ry=-5; ry<=5; ry++) {
        for(let rx=-5; rx<=5; rx++) {
            if(getTile(campfireCx+rx, campfireCy+ry) === IDS.CAMPFIRE) { 
                nearCampfire = true; 
                break; 
            }
        }
        if (nearCampfire) break;
    }
    
    if (nearCampfire) {
        if (player.hp < player.maxHp && frameCount % 60 === 0) { // 每秒回1血
            player.hp++;
            // 防止HP溢出
            if (player.hp > player.maxHp) player.hp = player.maxHp;
            updateHealthUI();
            spawnFloatText(player.x, player.y, "♥", "#ff5252"); // 飄愛心
        }
    }
    
    // 裝備屬性更新
    if (!player.defense) player.defense = 0;
    if (!player.equip) player.equip = { head: 0 };
    
    player.defense = 0;
    if (player.equip.head !== 0 && player.equip.head !== IDS.AIR) {
        let def = BLOCKS[player.equip.head];
        if (def && def.defense) {
            player.defense += def.defense;
            // 礦工頭盔光照
            if (def.light && frameCount % 10 === 0) {
                createParticle(player.x+10, player.y, "rgba(255, 235, 59, 0.3)", 0.5);
            }
        }
    }

    if(player.x < 0) player.x = 0;
    if(player.x > CHUNK_W*TILE_SIZE) player.x = CHUNK_W*TILE_SIZE;
    if(player.y > CHUNK_H*TILE_SIZE) takeDamage(999);
    if(Math.abs(player.vx) > 0.1) { player.facingRight = player.vx > 0; player.anim += 0.2; }

    updateMobs();
    updateDrops();
    updateProjectiles();
}

function updateDrops() {
    // 每5分鐘清除所有掉落物 (5分鐘 = 300秒 = 18000幀，假設60fps)
    if (frameCount % 18000 === 0 && frameCount > 0) {
        drops = [];
        return;
    }
    
    for (let i = drops.length - 1; i >= 0; i--) {
        let d = drops[i];
        
        // 記錄掉落時間（如果還沒有記錄）
        if (!d.spawnTime) d.spawnTime = frameCount;
        
        // 檢查是否超過5分鐘（18000幀）
        if (frameCount - d.spawnTime >= 18000) {
            drops.splice(i, 1);
            continue;
        }
        
        d.vx *= 0.9; d.vy += GRAVITY; d.x += d.vx; handleCollisions(d, true); d.y += d.vy; handleCollisions(d, false);
        let dist = Math.sqrt(Math.pow(player.x - d.x, 2) + Math.pow(player.y - d.y, 2));
        
        // 檢查背包是否有空槽位（用於判斷是否應該吸引掉落物）
        let hasEmptySlot = player.inventory.some(s => s.id === IDS.AIR || (s.id === IDS.AIR && s.count === 0));
        
        // 檢查是否為剛丟出的物品（60幀 = 約1秒內不吸引，讓它飛出去）
        let isJustThrown = d.justThrown && (frameCount - d.throwTime) < 60;
        
        // 只有背包有空槽位時才吸引掉落物，或者掉落物還沒有嘗試過撿取
        // 但如果是剛丟出的物品，暫時不吸引（讓它飛出去）
        if (dist < 100 && (hasEmptySlot || !d.inventoryFullNotified) && !isJustThrown) {
            d.vx += (player.x - d.x) * 0.05;
            d.vy += (player.y - d.y) * 0.05;
        }
        
        // 60幀後清除剛丟出標記，恢復正常吸引
        if (d.justThrown && (frameCount - d.throwTime) >= 60) {
            d.justThrown = false;
        }
        
        if (dist < 20) {
            if (d.id === IDS.COIN) { // 特殊撿取邏輯：直接加錢，不進背包
                if (!player.coins) player.coins = 0;
                player.coins++;
                updateUI(); // 更新UI顯示
                playSound('drink'); // 撿錢音效
                drops.splice(i, 1); continue;
            } else {
                // 嘗試添加到背包（如果有耐久度，傳入保存的耐久度值）
                if (addToInventory(d.id, 1, d.durability)) {
                    // 成功添加，移除掉落物
                    drops.splice(i, 1); continue;
                } else {
                    // 背包已滿，不移除掉落物，讓它繼續存在
                    // 使用標記來記錄是否已經顯示過提示，避免每幀觸發
                    if (!d.inventoryFullNotified) {
                        d.inventoryFullNotified = true; // 標記已通知
                        spawnFloatText(player.x, player.y, "背包已滿!", "#ff5252");
                    }
                    // 停止吸引效果：給掉落物一個反向速度，讓它遠離玩家
                    let angle = Math.atan2(d.y - player.y, d.x - player.x);
                    d.vx = Math.cos(angle) * 2; // 給一個遠離玩家的速度
                    d.vy = Math.sin(angle) * 2;
                    // 掉落物會繼續存在，玩家可以稍後再撿
                }
            }
        }
        d.life--; if(d.life <= 0) drops.splice(i, 1);
    }
}

function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        // 确保投射物属性已定义
        if (!p.damage) p.damage = 1; // 默认伤害
        if (!p.vx) p.vx = 0;
        if (!p.vy) p.vy = 0;
        
        p.vy += GRAVITY * 0.5;
        p.x += p.vx;
        p.y += p.vy;
        p.angle = Math.atan2(p.vy, p.vx);
        let tx = Math.floor(p.x / TILE_SIZE);
        let ty = Math.floor(p.y / TILE_SIZE);
        let hit = false;
        if (BLOCKS[getTile(tx, ty)] && BLOCKS[getTile(tx, ty)].solid) hit = true;

        if (!hit) {
            for (let j = mobs.length - 1; j >= 0; j--) {
                let m = mobs[j];
                if (p.x > m.x && p.x < m.x + m.w && p.y > m.y && p.y < m.y + m.h) {
                    // 确保伤害有效
                    if (p.damage && !isNaN(p.damage) && p.damage > 0) {
                        // 確保怪物HP屬性已定義
                        if (m.hp === undefined) m.hp = m.maxHp || 3;
                        if (m.maxHp === undefined) m.maxHp = m.hp || 3;
                        
                        m.hp -= p.damage;
                        // 防止HP變成負數
                        if (m.hp < 0) m.hp = 0;
                        // 防止HP超過maxHp（雖然不應該發生，但作為安全措施）
                        if (m.hp > m.maxHp) m.hp = m.maxHp;
                        
                        // --- 加入這行：弓箭傷害飄字 ---
                        spawnFloatText(m.x + m.w / 2, m.y, String(Math.floor(p.damage)), "#ffeb3b");
                    }

                    // 確保怪物速度屬性已定義
                    if (m.vx === undefined) m.vx = 0;
                    if (m.vy === undefined) m.vy = 0;
                    m.vx = (p.vx > 0 ? 3 : -3);
                    m.vy = -2;
                    createParticle(m.x + m.w / 2, m.y + m.h / 2, m.color, 0.5);
                    if (m.hp <= 0) {
                        // 掉落錢幣
                        let coins = 1 + Math.floor(Math.random() * 5);
                        if (m.type === 'boss') coins = 50;
                        for(let c=0; c<coins; c++) {
                            spawnDrop(m.x + Math.random()*10, m.y, IDS.COIN);
                        }
                        // 掉落其他物品
                        if(m.type === 'zombie') spawnDrop(m.x, m.y, IDS.IRON_ORE);
                        if(m.type === 'demon_eye') spawnDrop(m.x, m.y, IDS.TORCH);
                        if(m.type === 'skeleton') spawnDrop(m.x, m.y, IDS.IRON_ORE);
                        if(m.type === 'eater') spawnDrop(m.x, m.y, IDS.EBONSTONE);
                        if(m.type === 'hornet') {
                            if(Math.random() < 0.3) spawnDrop(m.x, m.y, IDS.STINGER); // 30% 機率掉毒刺
                        }
                        
                        mobs.splice(j, 1);
                        createParticle(m.x + m.w / 2, m.y + m.h / 2, m.color, 1.0);
                    }
                    hit = true;
                    playSound('hit');
                    break;
                }
            }
        }
        // 迴旋鏢邏輯
        if (p.type === 'boomerang') {
            if (!p.timer) p.timer = 0; // 初始化timer
            if (p.angle === undefined) p.angle = 0; // 初始化angle
            p.timer++;
            p.angle += 0.5; // 旋轉
            if (p.returnState === undefined) p.returnState = false; // 初始化returnState
            if (!p.returnState) {
                // 飛出階段
                if (p.timer > 30 || hit) { // 飛一段時間或撞牆後返回
                    p.returnState = true;
                    hit = false; // 迴旋鏢撞牆不消失，而是返回
                }
            } else {
                // 飛回階段
                let angleToPlayer = Math.atan2((player.y+20) - p.y, (player.x+10) - p.x);
                let speed = 12;
                p.vx = Math.cos(angleToPlayer) * speed;
                p.vy = Math.sin(angleToPlayer) * speed;
                
                // 接住
                let dist = Math.sqrt(Math.pow(player.x - p.x, 2) + Math.pow(player.y - p.y, 2));
                if (dist < 20) {
                    projectiles.splice(i, 1);
                    continue;
                }
            }
        }
        
        if (hit && p.type !== 'boomerang') {
            createParticle(p.x, p.y, "#fff", 0.3);
            projectiles.splice(i, 1);
        }
        if (p.x < 0 || p.x > CHUNK_W * TILE_SIZE || p.y > CHUNK_H * TILE_SIZE) {
            if (p.type !== 'boomerang') projectiles.splice(i, 1);
            else if (p.returnState) projectiles.splice(i, 1); // 迴旋鏢飛回時才消失
        }
    }
}

function updateMobs() {
    let time = gameTime / DAY_LEN;
    // 6点~18点是白天（time >= 0.25 && time < 0.75），其他时间是夜晚
    let isDay = time >= 0.25 && time < 0.75;
    for (let i = mobs.length - 1; i >= 0; i--) {
        let m = mobs[i];
        let dist = Math.sqrt(Math.pow(player.x - m.x, 2) + Math.pow(player.y - m.y, 2));
        
        // --- BOSS AI 邏輯 ---
        if (m.type === 'boss') {
            // 確保BOSS屬性已定義
            if (m.hp === undefined) m.hp = m.maxHp || 100;
            if (m.maxHp === undefined) m.maxHp = m.hp || 100;
            if (m.phase === undefined) m.phase = 1;
            if (m.dmg === undefined) m.dmg = 5;
            
            // 防止HP變成負數或超過maxHp
            if (m.hp < 0) m.hp = 0;
            if (m.hp > m.maxHp) m.hp = m.maxHp;
            
            // 階段轉換
            if (m.hp < m.maxHp / 2 && m.phase === 1) {
                m.phase = 2;
                spawnFloatText(m.x, m.y, "吼喔喔喔!", "#ff0000");
                for(let k=0; k<10; k++) createParticle(m.x+30, m.y+30, "red", 2.0);
            }
            // 飛行追蹤 (BOSS 無視地形)
            let speed = (m.phase === 1) ? 2 : 4.5; 
            let angle = Math.atan2((player.y - 40) - m.y, player.x - m.x);
            m.vx = Math.cos(angle) * speed;
            m.vy = Math.sin(angle) * speed;
            m.x += m.vx; 
            m.y += m.vy;
            // BOSS 碰撞傷害
            if (player.invincibleTimer <= 0 && rectIntersect(player, m)) {
                takeDamage(m.dmg);
                player.vx = (player.x < m.x ? -8 : 8); 
                player.vy = -5;
            }
            // BOSS 受傷飄字
            if (m.hp < m.maxHp) {
                // 傷害數字會在攻擊時顯示
            }
            // BOSS 死亡
            if (m.hp <= 0) {
                // 掉落錢幣
                let coins = 50; // BOSS 掉多點
                for(let c=0; c<coins; c++) {
                    spawnDrop(m.x + Math.random()*40, m.y + Math.random()*40, IDS.COIN);
                }
                spawnFloatText(m.x, m.y, "已擊敗!", "#ffd700");
                for(let k=0; k<5; k++) spawnDrop(m.x + Math.random()*40, m.y + Math.random()*40, IDS.DIAMOND); 
                spawnDrop(m.x + 20, m.y + 20, IDS.GOLD_BAR);
                mobs.splice(i, 1);
            }
            continue; // BOSS 處理完畢，跳過後面的重力邏輯
        }
        // --- 普通怪物邏輯 ---
        // 確保怪物基本屬性已定義
        if (m.hp === undefined) m.hp = m.maxHp || 3;
        if (m.maxHp === undefined) m.maxHp = m.hp || 3;
        if (m.vx === undefined) m.vx = 0;
        if (m.vy === undefined) m.vy = 0;
        if (m.grounded === undefined) m.grounded = false;
        
        // 防止HP變成負數或超過maxHp
        if (m.hp < 0) m.hp = 0;
        if (m.hp > m.maxHp) m.hp = m.maxHp;
        
        if (m.type === 'zombie' && isDay) {
            let tx = Math.floor((m.x + m.w/2) / TILE_SIZE); let ty = Math.floor(m.y / TILE_SIZE);
            let exposed = true;
            for(let y=ty-1; y>=0; y--) { if(tiles[y*CHUNK_W+tx] !== IDS.AIR) { exposed = false; break; } }
            if (exposed && Math.random()<0.01) { 
                m.hp--; 
                if (m.hp < 0) m.hp = 0; // 防止HP變成負數
                createParticle(m.x+Math.random()*m.w, m.y, "#ff5722", 0.5); 
            }
        }
        if (dist < 400) {
            // --- 惡魔眼 (飛行) ---
            if (m.type === 'demon_eye') {
                let angle = Math.atan2((player.y-20) - m.y, player.x - m.x);
                m.vx += Math.cos(angle) * 0.15; 
                m.vy += Math.sin(angle) * 0.15;
                if(m.vx > 3) m.vx = 3; if(m.vx < -3) m.vx = -3;
                if(m.vy > 3) m.vy = 3; if(m.vy < -3) m.vy = -3;
            }
            // --- 靈魂吞噬者 AI (類似惡魔眼，但衝刺速度更快) ---
            else if (m.type === 'eater') {
                let angle = Math.atan2((player.y) - m.y, player.x - m.x);
                m.vx += Math.cos(angle) * 0.25; // 加速度更快
                m.vy += Math.sin(angle) * 0.25;
                if(m.vx > 5) m.vx = 5; if(m.vx < -5) m.vx = -5;
                if(m.vy > 5) m.vy = 5; if(m.vy < -5) m.vy = -5;
            }
            // --- 黃蜂 AI (飛行，保持距離，射擊) ---
            else if (m.type === 'hornet') {
                // 保持距離
                let dist = Math.sqrt(Math.pow(player.x - m.x, 2) + Math.pow(player.y - m.y, 2));
                if (dist < 100) {
                    // 太近，後退
                    let angle = Math.atan2(m.y - player.y, m.x - player.x);
                    m.vx += Math.cos(angle) * 0.2;
                    m.vy += Math.sin(angle) * 0.2;
                } else if (dist > 200) {
                    // 太遠，靠近
                    let angle = Math.atan2((player.y) - m.y, player.x - m.x);
                    m.vx += Math.cos(angle) * 0.15;
                    m.vy += Math.sin(angle) * 0.15;
                }
                if(m.vx > 4) m.vx = 4; if(m.vx < -4) m.vx = -4;
                if(m.vy > 4) m.vy = 4; if(m.vy < -4) m.vy = -4;
                
                // 射擊邏輯
                if (!m.shootTimer) m.shootTimer = 0;
                m.shootTimer++;
                if (m.shootTimer > 60 && dist < 300) { // 每60幀射一次
                    let angle = Math.atan2((player.y+20) - (m.y+m.h/2), (player.x+10) - (m.x+m.w/2));
                    projectiles.push({
                        x: m.x + m.w/2, y: m.y + m.h/2,
                        vx: Math.cos(angle) * 8, vy: Math.sin(angle) * 8,
                        damage: 3, type: 'stinger', color: '#212121', angle: angle
                    });
                    m.shootTimer = 0;
                    playSound('shoot');
                }
            }
            // --- 兔子：隨機跳躍 ---
            else if (m.type === 'bunny') {
                if (Math.random() < 0.02 && m.grounded) {
                    m.vx = (Math.random() - 0.5) * 4;
                    m.vy = -4;
                }
            }
            // --- 螢火蟲：隨機飛行 ---
            else if (m.type === 'firefly') {
                if (Math.random() < 0.1) {
                    m.vx += (Math.random() - 0.5) * 0.5;
                    m.vy += (Math.random() - 0.5) * 0.5;
                    // 晚上發光效果
                    if (Math.random() < 0.1) createParticle(m.x, m.y, "#76ff03", 0.5);
                }
                // 限制範圍
                if(m.vx > 1) m.vx=1; if(m.vx < -1) m.vx=-1;
                if(m.vy > 1) m.vy=1; if(m.vy < -1) m.vy=-1;
            }
            // --- 地面怪物 (殭屍/史萊姆/骷髏) ---
            else {
                let speed = (m.type === 'skeleton') ? 0.25 : (m.type === 'zombie' ? 0.15 : 0.2);
            if (player.x > m.x + 10) m.vx += speed; else if (player.x < m.x - 10) m.vx -= speed;
                
                if (m.grounded) { // 跳躍邏輯
                    let frontX = m.x + (m.vx > 0 ? m.w + 5 : -5);
                    let tileFront = getTile(Math.floor(frontX/TILE_SIZE), Math.floor(m.y/TILE_SIZE));
                    if ((BLOCKS[tileFront] && BLOCKS[tileFront].solid) || (m.type === 'slime' && Math.random() < 0.02)) {
                        m.vy = -6;
                    }
                }
            }
        }
        // --- 商人行為 ---
        if (m.type === 'merchant') {
            m.vx = 0; // 暫時讓他站著不動，或者只在白天走動
            let time = gameTime / DAY_LEN;
            // 6点~18点是白天（time >= 0.25 && time < 0.75），其他时间是夜晚
            let isDay = time >= 0.25 && time < 0.75;
            if (isDay && Math.random() < 0.01) m.vx = (Math.random()-0.5)*2;
            m.vy += GRAVITY;
        m.x += m.vx; handleCollisions(m, true);
        m.y += m.vy; m.grounded = false; handleCollisions(m, false);
            continue; // 跳過攻擊邏輯
        }
        
        // 重力與阻力
        m.vx *= 0.9;
        if (!m.fly) m.vy += GRAVITY; else m.vy *= 0.95; // 飛行怪無重力
        
        // 防止怪物速度溢出（设置最大速度）
        const MAX_MOB_SPEED = 10;
        if (m.vx > MAX_MOB_SPEED) m.vx = MAX_MOB_SPEED;
        if (m.vx < -MAX_MOB_SPEED) m.vx = -MAX_MOB_SPEED;
        if (m.vy > MAX_FALL) m.vy = MAX_FALL;
        if (m.vy < -MAX_MOB_SPEED) m.vy = -MAX_MOB_SPEED;
        
        m.x += m.vx; 
        handleCollisions(m, true);
        m.y += m.vy; 
        m.grounded = false; 
        handleCollisions(m, false);
        
        // 防止怪物位置溢出
        if (m.x < 0) m.x = 0;
        if (m.x > CHUNK_W*TILE_SIZE) m.x = CHUNK_W*TILE_SIZE;
        if (m.y < 0) m.y = 0;
        if (m.y > CHUNK_H * TILE_SIZE) { mobs.splice(i, 1); continue; }
        // 被动生物（firefly, bunny）和友好NPC（merchant）不会造成伤害
        if (player.invincibleTimer <= 0 && !m.passive && !m.friendly && rectIntersect(player, m)) {
            // 確保怪物傷害屬性已定義
            let mobDamage = (m.dmg !== undefined && m.dmg > 0) ? m.dmg : 1;
            takeDamage(mobDamage); 
            player.vx = (player.x < m.x ? -5 : 5); 
            player.vy = -3;
        }
        if (m.hp <= 0) {
            // 掉落錢幣
            let coins = 1 + Math.floor(Math.random() * 5); // 1-5 銅幣
            if (m.type === 'boss') coins = 50; // BOSS 掉多點
            for(let c=0; c<coins; c++) {
                spawnDrop(m.x + Math.random()*10, m.y, IDS.COIN);
            }
            
            mobs.splice(i, 1);
            if(m.type === 'zombie') spawnDrop(m.x, m.y, IDS.IRON_ORE);
            if(m.type === 'demon_eye') spawnDrop(m.x, m.y, IDS.TORCH);
            if(m.type === 'skeleton') spawnDrop(m.x, m.y, IDS.IRON_ORE); // 暂时用铁矿代替骨头
            if(m.type === 'eater') spawnDrop(m.x, m.y, IDS.EBONSTONE); // 掉落黑檀石
            if(m.type === 'hornet') {
                if(Math.random() < 0.3) spawnDrop(m.x, m.y, IDS.STINGER); // 30% 機率掉毒刺
            }
        }
    }
}

function updateMobSpawning() {
    let playerTileX = Math.floor(player.x / TILE_SIZE);
    let playerTileY = Math.floor(player.y / TILE_SIZE);
    let viewRange = 40; // 视野范围（格数）- 使用圆形距离
    
    // 计算玩家视野范围内各类生物的数量（使用圆形距离）
    let nearbyHostileMobs = 0;
    let nearbyBunnies = 0;  // 兔子数量（独立统计）
    let nearbyFireflies = 0; // 萤火虫数量（独立统计）
    for (let m of mobs) {
        let mobTileX = Math.floor(m.x / TILE_SIZE);
        let mobTileY = Math.floor(m.y / TILE_SIZE);
        let distX = mobTileX - playerTileX;
        let distY = mobTileY - playerTileY;
        let dist = Math.sqrt(distX * distX + distY * distY); // 圆形距离
        if (dist <= viewRange) {
            if (!m.friendly && !m.passive) {
                nearbyHostileMobs++; // 敌对怪物
            } else if (m.passive) {
                // 分别统计兔子和萤火虫
                if (m.type === 'bunny') nearbyBunnies++;
                else if (m.type === 'firefly') nearbyFireflies++;
            }
        }
    }
    
    // 清理远处的怪物（无论数量多少都要清理）
    for (let i = mobs.length - 1; i >= 0; i--) {
        let m = mobs[i];
        // 商人不会被清理（应该一直存在）
        if (m.friendly && m.type === 'merchant') continue;
        let mobTileX = Math.floor(m.x / TILE_SIZE);
        let mobTileY = Math.floor(m.y / TILE_SIZE);
        let distX = mobTileX - playerTileX;
        let distY = mobTileY - playerTileY;
        let dist = Math.sqrt(distX * distX + distY * distY);
        // 被动生物和敌对怪物都会在距离太远时被清理
        if (dist > viewRange * 1.5) mobs.splice(i, 1);
    }
    
    // 生怪概率：調低至 8%（原本 15%）
    if (Math.random() > 0.08) return;
    
    // 生成位置：玩家左右10-20格
    let dist = 10 + Math.floor(Math.random() * 10); 
    let dir = Math.random() > 0.5 ? 1 : -1; 
    let spawnX = playerTileX + (dist * dir);

    if (spawnX < 0 || spawnX >= CHUNK_W) return;

    let time = gameTime / DAY_LEN;
    // 6点~18点是白天（time >= 0.25 && time < 0.75），其他时间是夜晚
    let isNight = time < 0.25 || time >= 0.75;

    // 修复：找到正确的地表高度（从玩家Y位置向上向下搜索）
    let surfaceY = playerTileY;
    for (let testY = Math.max(0, playerTileY - 50); testY < Math.min(CHUNK_H, playerTileY + 50); testY++) {
        let testIdx = testY * CHUNK_W + spawnX;
        let testBelowIdx = (testY + 1) * CHUNK_W + spawnX;
        if (testY < CHUNK_H - 1 && tiles[testIdx] === IDS.AIR && 
            tiles[testBelowIdx] !== IDS.AIR && tiles[testBelowIdx] !== IDS.WATER && tiles[testBelowIdx] !== IDS.LAVA) {
            surfaceY = testY;
            break;
        }
    }

    for (let y = 0; y < CHUNK_H - 1; y++) {
        let idx = y * CHUNK_W + spawnX;
        let belowIdx = (y + 1) * CHUNK_W + spawnX;

        if (tiles[idx] === IDS.AIR && tiles[belowIdx] !== IDS.AIR && tiles[belowIdx] !== IDS.WATER && tiles[belowIdx] !== IDS.LAVA) {
            // 檢查是否在腐化之地 (腳下是黑檀石)
            // 特殊地形怪物也受敌对怪物数量限制（因为它们也是敌对怪物）
            let groundId = tiles[belowIdx];
            if (groundId === IDS.EBONSTONE) {
                if (nearbyHostileMobs < 8 && Math.random() < 0.05) { // 調低：10% -> 5%
                    spawnMob(spawnX * TILE_SIZE, y * TILE_SIZE, 'eater');
                    createParticle(spawnX * TILE_SIZE, y * TILE_SIZE, "#fff", 1.0);
                    return;
                }
            }
            // 在泥土(叢林)上生成黃蜂
            if (groundId === IDS.MUD || groundId === IDS.JUNGLE_GRASS) {
                if (nearbyHostileMobs < 8 && Math.random() < 0.02) { // 調低：5% -> 2%
                    spawnMob(spawnX * TILE_SIZE, y * TILE_SIZE, 'hornet');
                    return;
                }
            }
            
            // 被動生物生成 (只在地表附近，使用找到的surfaceY)
            // 兔子和萤火虫有独立的数量限制，互不影响
            if (Math.abs(y - surfaceY) < 10) {
                let isDay = !isNight;
                // 兔子：白天，在草地或泥土上生成，独立限制最多5只
                if (isDay && nearbyBunnies < 5 && (tiles[belowIdx] === IDS.GRASS || tiles[belowIdx] === IDS.DIRT) && Math.random() < 0.01) { // 調低：10% -> 1%
                    spawnMob(spawnX * TILE_SIZE, y * TILE_SIZE, 'bunny');
                    return;
                }
                // 萤火虫：夜晚，在空中生成，独立限制最多5只
                if (isNight && nearbyFireflies < 5 && tiles[idx] === IDS.AIR && Math.random() < 0.01) { // 調低：10% -> 1%
                    spawnMob(spawnX * TILE_SIZE, y * TILE_SIZE, 'firefly');
                    return;
                }
            }
            
            // 敌对怪物生成：只有在敌对怪物数量未达上限时才生成
            if (nearbyHostileMobs >= 8) {
                return; // 敌对怪物已达上限，不生成
            }
            
            // 決定怪物類型
            let type = 'slime';
            if (isNight) {
                // 夜晚：浅层生成恶魔眼，深层生成僵尸（調低生成機率）
                if (y < CHUNK_H * 0.4) { 
                    if(Math.random() < 0.05) type = 'demon_eye'; // 調低：50% -> 5%
                    else return; // 95% 機率不生成
                } else if (Math.random() < 0.05) { // 調低：60% -> 5%
                    type = 'zombie';
                } else {
                    return; // 95% 機率不生成
                }
            } else {
                // 白天：只生成史莱姆（調低生成機率）
                if (Math.random() < 0.01) { // 調低：50% -> 1%
                    type = 'slime';
                } else {
                    return; // 99%概率不生成怪物（白天怪物较少）
                }
            }
            // 最深层：生成骷髅或史莱姆（調低生成機率）
            if (y > CHUNK_H - 100) {
                if (Math.random() < 0.05) { // 調低：40% -> 5%
                    type = 'skeleton';
                } else if (Math.random() < 0.05) { // 5% 機率生成史萊姆
                    type = 'slime';
                } else {
                    return; // 90% 機率不生成
                }
            }
            spawnMob(spawnX * TILE_SIZE, y * TILE_SIZE, type);
            createParticle(spawnX * TILE_SIZE, y * TILE_SIZE, "#fff", 1.0);
            return;
        }
    }
    
    // 清理玩家视野范围外的怪物（在生怪之后执行）
    for (let i = mobs.length - 1; i >= 0; i--) {
        let m = mobs[i];
        // 商人不会被清理（应该一直存在）
        if (m.friendly && m.type === 'merchant') continue;
        let mobTileX = Math.floor(m.x / TILE_SIZE);
        let mobTileY = Math.floor(m.y / TILE_SIZE);
        let distX = mobTileX - playerTileX;
        let distY = mobTileY - playerTileY;
        let dist = Math.sqrt(distX * distX + distY * distY);
        // 被动生物和敌对怪物都会在距离太远时被清理
        if (dist > viewRange * 1.5) mobs.splice(i, 1);
    }
}

function explode(tileX, tileY) {
    playSound('explode');
    let radius = 4;
    for(let y = tileY - radius; y <= tileY + radius; y++) {
        for(let x = tileX - radius; x <= tileX + radius; x++) {
            if (x >= 0 && x < CHUNK_W && y >= 0 && y < CHUNK_H) {
                let dist = Math.sqrt(Math.pow(x-tileX, 2) + Math.pow(y-tileY, 2));
                if (dist <= radius) {
                    let id = tiles[y*CHUNK_W+x];
                    if (id !== IDS.BEDROCK && id !== IDS.AIR) {
                        // --- 箱子破壞處理（必須在 setTile 之前）---
                        if (id === IDS.CHEST) {
                            // 檢查箱子內是否有物品
                            let chestKey = `${x}_${y}`;
                            let chestItems = chestData[chestKey];
                            if (chestItems && Array.isArray(chestItems)) {
                                // 掉落箱子內的所有物品
                                chestItems.forEach(item => {
                                    if (item && item.id !== IDS.AIR && item.count > 0) {
                                        // 根據數量掉落多個物品
                                        for (let i = 0; i < item.count; i++) {
                                            let offsetX = (Math.random() - 0.5) * 20;
                                            let offsetY = (Math.random() - 0.5) * 20;
                                            let drop = {
                                                x: x * TILE_SIZE + 10 + offsetX,
                                                y: y * TILE_SIZE + 10 + offsetY,
                                                w: 12,
                                                h: 12,
                                                vx: (Math.random() - 0.5) * 4,
                                                vy: -3,
                                                id: item.id,
                                                life: 3000,
                                                spawnTime: frameCount
                                            };
                                            // 如果有耐久度，複製耐久度
                                            if (item.durability !== undefined) {
                                                drop.durability = item.durability;
                                            }
                                            drops.push(drop);
                                        }
                                    }
                                });
                                // 清除箱子數據
                                delete chestData[chestKey];
                            }
                        }
                        
                        setTile(x, y, IDS.AIR);
                        createParticle(x*TILE_SIZE, y*TILE_SIZE, "#555", 1.0);
                        if (Math.random() < 0.3) spawnDrop(x*TILE_SIZE, y*TILE_SIZE, id);
                    }
                }
            }
        }
    }
    let worldX = tileX * TILE_SIZE; let worldY = tileY * TILE_SIZE;
    let expRadius = radius * TILE_SIZE;
    let distP = Math.sqrt(Math.pow(player.x - worldX, 2) + Math.pow(player.y - worldY, 2));
    if (distP < expRadius) takeDamage(3);
    for(let i=mobs.length-1; i>=0; i--) {
        let m = mobs[i];
        let distM = Math.sqrt(Math.pow(m.x - worldX, 2) + Math.pow(m.y - worldY, 2));
        if(distM < expRadius) { 
            m.hp -= 5; 
            spawnFloatText(m.x + m.w/2, m.y, String(5), "#ffeb3b");
            createParticle(m.x, m.y, m.color, 1.0); 
            if(m.hp <= 0) {
                // 掉落錢幣
                let coins = 1 + Math.floor(Math.random() * 5);
                if (m.type === 'boss') coins = 50;
                for(let c=0; c<coins; c++) {
                    spawnDrop(m.x + Math.random()*10, m.y, IDS.COIN);
                }
                // 掉落其他物品
                if(m.type === 'zombie') spawnDrop(m.x, m.y, IDS.IRON_ORE);
                if(m.type === 'demon_eye') spawnDrop(m.x, m.y, IDS.TORCH);
                if(m.type === 'skeleton') spawnDrop(m.x, m.y, IDS.IRON_ORE);
                if(m.type === 'eater') spawnDrop(m.x, m.y, IDS.EBONSTONE);
                mobs.splice(i, 1);
            } 
        }
    }
}

function updateWorldLogic() {
    // 召喚商人 (如果沒有商人 且 玩家有錢 > 50)
    // 或者商人離玩家太遠時，在玩家附近重新生成
    if (frameCount % 1200 === 0) { // 每20秒檢查一次，避免太頻繁
        let existingMerchant = mobs.find(m => m.type === 'merchant');
        const MERCHANT_MAX_DISTANCE_TILES = 300; // 商人最大距離（格數），超過此距離會重新生成
        const MERCHANT_MAX_DISTANCE = MERCHANT_MAX_DISTANCE_TILES * TILE_SIZE; // 轉換為像素
        
        // 檢查現有商人是否離玩家太遠
        if (existingMerchant) {
            let distX = existingMerchant.x - player.x;
            let distY = existingMerchant.y - player.y;
            let dist = Math.sqrt(distX * distX + distY * distY);
            
            // 如果商人離玩家太遠（超過500格），移除舊商人並在玩家附近重新生成
            if (dist > MERCHANT_MAX_DISTANCE && player.coins >= 50) {
                // 移除舊商人
                let merchantIndex = mobs.indexOf(existingMerchant);
                if (merchantIndex !== -1) {
                    mobs.splice(merchantIndex, 1);
                }
                existingMerchant = null; // 標記為沒有商人，讓下面的邏輯重新生成
            }
        }
        
        // 如果沒有商人（或剛被移除）且玩家有錢 >= 50，生成新商人
        if (!existingMerchant && player.coins >= 50) {
            // 在玩家附近寻找安全位置生成商人（左右200-400像素范围内）
            let spawnOffset = (Math.random() > 0.5 ? 1 : -1) * (200 + Math.random() * 200);
            let merchantX = player.x + spawnOffset;
            let merchantTileX = Math.floor(merchantX / TILE_SIZE);
            
            // 确保在地图范围内
            if (merchantTileX < 0) merchantTileX = 0;
            if (merchantTileX >= CHUNK_W) merchantTileX = CHUNK_W - 1;
            
            // 找到地面位置
            let groundY = null;
            for (let y = 0; y < CHUNK_H - 1; y++) {
                let idx = y * CHUNK_W + merchantTileX;
                let belowIdx = (y + 1) * CHUNK_W + merchantTileX;
                if (tiles[idx] === IDS.AIR && tiles[belowIdx] !== IDS.AIR && 
                    tiles[belowIdx] !== IDS.WATER && tiles[belowIdx] !== IDS.LAVA &&
                    BLOCKS[tiles[belowIdx]] && BLOCKS[tiles[belowIdx]].solid) {
                    groundY = y * TILE_SIZE;
                    break;
                }
            }
            
            // 如果找到地面，生成商人
            if (groundY !== null) {
                spawnMob(merchantTileX * TILE_SIZE, groundY, 'merchant');
                spawnFloatText(merchantTileX * TILE_SIZE, groundY, "商人到達!", "#ffd700");
            }
        }
    }
    
    // 從下往上掃描，讓水流更自然（只掃描玩家視野範圍內，性能優化）
    let playerTileX = Math.floor(player.x / TILE_SIZE);
    let playerTileY = Math.floor(player.y / TILE_SIZE);
    let viewRangeX = Math.floor(width / TILE_SIZE) + 10; // 視野範圍X
    let viewRangeY = Math.floor(height / TILE_SIZE) + 10; // 視野範圍Y
    let startX = Math.max(0, playerTileX - viewRangeX);
    let endX = Math.min(CHUNK_W, playerTileX + viewRangeX);
    let startY = Math.max(0, playerTileY - viewRangeY);
    let endY = Math.min(CHUNK_H, playerTileY + viewRangeY);
    
    for (let y = endY - 1; y >= startY; y--) {
        // 隨機掃描方向，避免水流偏一邊
        let scanStartX = Math.random() > 0.5 ? startX : endX - 1;
        let dir = scanStartX === startX ? 1 : -1;
        
        for (let i = 0; i < (endX - startX); i++) {
            let x = scanStartX + (i * dir);
            if (x < startX || x >= endX) continue;
            let idx = y * CHUNK_W + x;
            let id = tiles[idx];
            // 1. 小麥生長邏輯
            if (id === IDS.WHEAT_CROP && Math.random() < 0.005) { 
                setTile(x, y, IDS.WHEAT_RIPE); // 變成熟
            }
            
            // 2. 樹木生長
            if (id === IDS.SAPLING && Math.random() < 0.005) { 
                let treeH = 5 + Math.floor(Math.random() * 5);
                let canGrow = true;
                for(let h=1; h<=treeH+2; h++) {
                    if (y-h < 0 || tiles[(y-h)*CHUNK_W+x] !== IDS.AIR) canGrow = false;
                }
                if (canGrow) {
                    for(let h=0; h<treeH; h++) { 
                        setTile(x, y-h, IDS.WOOD); 
                        setWall(x, y-h, IDS.AIR);
                    }
                    let topY = y - treeH;
                    for(let ly=-3; ly<=1; ly++) for(let lx=-3; lx<=3; lx++) { 
                        if(lx*lx + ly*ly <= 8) { 
                            let wx = x+lx, wy = topY+ly;
                            if(wx>=0 && wx<CHUNK_W && wy>=0 && wy<CHUNK_H) {
                                let tidx = wy*CHUNK_W+wx;
                                if(tiles[tidx] === IDS.AIR) setTile(wx, wy, IDS.LEAVES);
                            }
                        }
                    }
                }
            }
            // 2. 簡易水流物理
            if (id === IDS.WATER) {
                let belowIdx = (y + 1) * CHUNK_W + x;
                if (y < CHUNK_H - 1) {
                    let belowId = tiles[belowIdx];
                    // 向下流
                    if (belowId === IDS.AIR) {
                        tiles[belowIdx] = IDS.WATER;
                        tiles[idx] = IDS.AIR;
                        continue;
                    }
                    // 遇岩漿變石頭
                    else if (belowId === IDS.LAVA) {
                        tiles[belowIdx] = IDS.STONE;
                        tiles[idx] = IDS.STONE;
                        createParticle(x*TILE_SIZE, y*TILE_SIZE, "#555", 1.0);
                        playSound('mine');
                        continue;
                    }
                }
                // 向左右流
                if (y < CHUNK_H - 1 && (BLOCKS[tiles[belowIdx]] && BLOCKS[tiles[belowIdx]].solid || tiles[belowIdx] === IDS.WATER)) {
                    let flowDir = Math.random() > 0.5 ? 1 : -1;
                    let targetX = x + flowDir;
                    if (targetX >= 0 && targetX < CHUNK_W) {
                        let targetIdx = y * CHUNK_W + targetX;
                        if (tiles[targetIdx] === IDS.AIR) {
                            tiles[targetIdx] = IDS.WATER;
                            tiles[idx] = IDS.AIR;
                        }
                    }
                }
            }
            // 2.5. 岩漿流動物理 (比照水流)
            if (id === IDS.LAVA) {
                let belowIdx = (y + 1) * CHUNK_W + x;
                if (y < CHUNK_H - 1) {
                    let belowId = tiles[belowIdx];
                    // 向下流
                    if (belowId === IDS.AIR) {
                        tiles[belowIdx] = IDS.LAVA;
                        tiles[idx] = IDS.AIR;
                        continue;
                    }
                    // 遇水變石頭
                    else if (belowId === IDS.WATER) {
                        tiles[belowIdx] = IDS.STONE;
                        tiles[idx] = IDS.STONE;
                        createParticle(x*TILE_SIZE, y*TILE_SIZE, "#555", 1.0);
                        playSound('mine');
                        continue;
                    }
                }
                // 向左右流 (岩浆流动速度稍慢，70%概率)
                if (y < CHUNK_H - 1 && Math.random() < 0.7 && (BLOCKS[tiles[belowIdx]] && BLOCKS[tiles[belowIdx]].solid || tiles[belowIdx] === IDS.LAVA)) {
                    let flowDir = Math.random() > 0.5 ? 1 : -1;
                    let targetX = x + flowDir;
                    if (targetX >= 0 && targetX < CHUNK_W) {
                        let targetIdx = y * CHUNK_W + targetX;
                        if (tiles[targetIdx] === IDS.AIR) {
                            tiles[targetIdx] = IDS.LAVA;
                            tiles[idx] = IDS.AIR;
                        }
                    }
                }
            }
            // 3. 沙子下落 (保留原有逻辑)
            if (id === IDS.SAND) { 
                let belowIdx = idx + CHUNK_W; 
                if (y < CHUNK_H - 1) { 
                    let belowId = tiles[belowIdx]; 
                    if (belowId === IDS.AIR || belowId === IDS.WATER || belowId === IDS.LAVA) { 
                        tiles[belowIdx] = IDS.SAND; 
                        tiles[idx] = (belowId === IDS.WATER || belowId === IDS.LAVA) ? belowId : IDS.AIR; 
                    } 
                } 
            }
        }
    }
    
    // ==========================================
    // 资源再生系统（在玩家视野外但不太远的地方再生，避免消耗大量资源）
    // ==========================================
    if (frameCount % 300 === 0) { // 每5秒检查一次再生
        let playerTileX = Math.floor(player.x / TILE_SIZE);
        let playerTileY = Math.floor(player.y / TILE_SIZE);
        let safeDistance = 30; // 距离玩家至少30格才再生
        let maxDistance = 100; // 距离玩家最多100格，避免在太远的地方消耗资源
        
        // 在玩家周围30-100格的范围内随机选择位置（使用圆形距离）
        for (let attempt = 0; attempt < 10; attempt++) {
            let angle = Math.random() * Math.PI * 2;
            let dist = safeDistance + Math.random() * (maxDistance - safeDistance);
            let rx = Math.floor(playerTileX + Math.cos(angle) * dist);
            let ry = Math.floor(playerTileY + Math.sin(angle) * dist);
            
            // 确保在地图范围内
            if (rx < 0 || rx >= CHUNK_W || ry < 0 || ry >= CHUNK_H) continue;
            
            let idx = ry * CHUNK_W + rx;
            let id = tiles[idx];
            
            // 1. 矿石再生（在石头中，避免覆盖已有矿石和玩家建筑）
            if (id === IDS.STONE && ry > CHUNK_H * 0.1 && ry < CHUNK_H * 0.9) {
                // 检查是否已经是矿石（避免重复生成）
                let isOre = false;
                let oreTypes = [IDS.COAL_ORE, IDS.IRON_ORE, IDS.GOLD_ORE, IDS.DIAMOND_ORE, 
                                IDS.RUBY_ORE, IDS.SAPPHIRE_ORE, IDS.EMERALD_ORE];
                for (let oreId of oreTypes) {
                    if (id === oreId) {
                        isOre = true;
                        break;
                    }
                }
                
                // 检查是否是玩家建筑（避免覆盖）
                let isPlayerStructure = (id === IDS.FURNACE || id === IDS.WORKBENCH || id === IDS.ANVIL || 
                                        id === IDS.CHEST || id === IDS.BED || id === IDS.CAMPFIRE || 
                                        id === IDS.TELEPORTER || id === IDS.TABLE || id === IDS.CHAIR || 
                                        id === IDS.BOOKSHELF || id === IDS.DOOR_CLOSED || id === IDS.DOOR_OPEN ||
                                        id === IDS.SIGN || id === IDS.LANTERN || id === IDS.FENCE ||
                                        id === IDS.COOKING_POT || id === IDS.CLAY_POT);
                
                if (!isOre && !isPlayerStructure && Math.random() < 0.001) { // 0.1%概率，且不是已有矿石或玩家建筑
                    // 宝石优先级更高（更稀有），如果生成宝石就不生成普通矿石
                    let hasGem = false;
                    if (ry > CHUNK_H * 0.5) {
                        let gemRand = Math.random();
                        if (gemRand < 0.33) {
                            tiles[idx] = IDS.RUBY_ORE;
                            hasGem = true;
                        } else if (gemRand < 0.66) {
                            tiles[idx] = IDS.SAPPHIRE_ORE;
                            hasGem = true;
                        } else if (gemRand < 0.99) {
                            tiles[idx] = IDS.EMERALD_ORE;
                            hasGem = true;
                        }
                    }
                    
                    // 如果没有生成宝石，再检查钻石和普通矿石
                    if (!hasGem) {
                        let oreRand = Math.random();
                        if (ry > CHUNK_H * 0.7 && oreRand < 0.05) {
                            tiles[idx] = IDS.DIAMOND_ORE;
                        } else {
                            if (oreRand < 0.4) tiles[idx] = IDS.COAL_ORE;
                            else if (oreRand < 0.7) tiles[idx] = IDS.IRON_ORE;
                            else tiles[idx] = IDS.GOLD_ORE;
                        }
                    }
                }
            }
            
            // 2. 花朵再生（在草地上，地表）- 大幅提高概率，避免覆盖已有花朵和玩家建筑
            if (id === IDS.GRASS && ry < CHUNK_H * 0.5) {
                if (ry > 0) {
                    let aboveIdx = (ry-1)*CHUNK_W+rx;
                    let aboveId = tiles[aboveIdx];
                    // 检查上方是否是空气或已有花朵（避免覆盖）
                    let isFlower = (aboveId === IDS.FLOWER || aboveId === IDS.DAYBLOOM || aboveId === IDS.MOONGLOW);
                    // 检查是否是玩家建筑（避免覆盖）
                    let isPlayerStructure = (aboveId === IDS.FURNACE || aboveId === IDS.WORKBENCH || aboveId === IDS.ANVIL || 
                                            aboveId === IDS.CHEST || aboveId === IDS.BED || aboveId === IDS.CAMPFIRE || 
                                            aboveId === IDS.TELEPORTER || aboveId === IDS.TABLE || aboveId === IDS.CHAIR || 
                                            aboveId === IDS.BOOKSHELF || aboveId === IDS.DOOR_CLOSED || aboveId === IDS.DOOR_OPEN ||
                                            aboveId === IDS.SIGN || aboveId === IDS.LANTERN || aboveId === IDS.FENCE ||
                                            aboveId === IDS.COOKING_POT || aboveId === IDS.CLAY_POT || aboveId === IDS.TORCH ||
                                            aboveId === IDS.SAPLING || aboveId === IDS.WHEAT_CROP || aboveId === IDS.WHEAT_RIPE);
                    if (aboveId === IDS.AIR && !isFlower && !isPlayerStructure && Math.random() < 0.01) {
                        let flowerRand = Math.random();
                        if (flowerRand < 0.3) setTile(rx, ry-1, IDS.FLOWER);
                        else if (flowerRand < 0.5) {
                            // 根据时间决定生成Daybloom或Moonglow
                            let time = gameTime / DAY_LEN;
                            // 6点~18点是白天（time >= 0.25 && time < 0.75），其他时间是夜晚
                            let isDay = time >= 0.25 && time < 0.75;
                            setTile(rx, ry-1, isDay ? IDS.DAYBLOOM : IDS.MOONGLOW);
                        }
                    }
                }
            }
            
            // 3. 蜘蛛网再生（在地下洞穴中，避免覆盖已有蜘蛛网和玩家建筑）
            if (id === IDS.AIR && ry > CHUNK_H * 0.3 && ry < CHUNK_H * 0.8) {
                // 检查是否已经是蜘蛛网（避免重复生成）
                if (id !== IDS.COBWEB) {
                    // 检查是否是玩家建筑（避免覆盖）
                    let isPlayerStructure = (id === IDS.FURNACE || id === IDS.WORKBENCH || id === IDS.ANVIL || 
                                            id === IDS.CHEST || id === IDS.BED || id === IDS.CAMPFIRE || 
                                            id === IDS.TELEPORTER || id === IDS.TABLE || id === IDS.CHAIR || 
                                            id === IDS.BOOKSHELF || id === IDS.DOOR_CLOSED || id === IDS.DOOR_OPEN ||
                                            id === IDS.SIGN || id === IDS.LANTERN || id === IDS.FENCE ||
                                            id === IDS.COOKING_POT || id === IDS.CLAY_POT || id === IDS.TORCH ||
                                            id === IDS.SAPLING || id === IDS.WHEAT_CROP || id === IDS.WHEAT_RIPE ||
                                            id === IDS.POT || id === IDS.VINE || id === IDS.JUNGLE_SPORES);
                    if (!isPlayerStructure) {
                    // 检查周围是否有石头（洞穴环境）
                    let hasStone = false;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (rx+dx >= 0 && rx+dx < CHUNK_W && ry+dy >= 0 && ry+dy < CHUNK_H) {
                                let checkId = tiles[(ry+dy)*CHUNK_W+(rx+dx)];
                                if (checkId === IDS.STONE || checkId === IDS.DIRT) {
                                    hasStone = true;
                                    break;
                                }
                            }
                        }
                        if (hasStone) break;
                    }
                        if (hasStone && Math.random() < 0.001) {
                            setTile(rx, ry, IDS.COBWEB);
                        }
                    }
                }
            }
            
            // 4. 陶罐再生（在地下，避免覆盖已有陶罐和玩家建筑）
            if (id === IDS.AIR && ry > CHUNK_H * 0.2 && ry < CHUNK_H * 0.7) {
                // 检查是否已经是陶罐（避免重复生成）
                if (id !== IDS.POT) {
                    // 检查是否是玩家建筑（避免覆盖）
                    let isPlayerStructure = (id === IDS.FURNACE || id === IDS.WORKBENCH || id === IDS.ANVIL || 
                                            id === IDS.CHEST || id === IDS.BED || id === IDS.CAMPFIRE || 
                                            id === IDS.TELEPORTER || id === IDS.TABLE || id === IDS.CHAIR || 
                                            id === IDS.BOOKSHELF || id === IDS.DOOR_CLOSED || id === IDS.DOOR_OPEN ||
                                            id === IDS.SIGN || id === IDS.LANTERN || id === IDS.FENCE ||
                                            id === IDS.COOKING_POT || id === IDS.CLAY_POT || id === IDS.TORCH ||
                                            id === IDS.SAPLING || id === IDS.WHEAT_CROP || id === IDS.WHEAT_RIPE ||
                                            id === IDS.VINE || id === IDS.JUNGLE_SPORES || id === IDS.COBWEB);
                    if (!isPlayerStructure) {
                        // 检查下方是否有固体方块
                        if (ry < CHUNK_H - 1) {
                            let belowId = tiles[(ry+1)*CHUNK_W+rx];
                            if ((belowId === IDS.STONE || belowId === IDS.DIRT || belowId === IDS.BRICKS) && 
                                Math.random() < 0.0005) {
                                setTile(rx, ry, IDS.POT);
                            }
                        }
                    }
                }
            }
        }
    }
}

function rectIntersect(r1, r2) { return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y; }
function handleCollisions(obj, isX) {
    let minX = Math.floor(obj.x / TILE_SIZE), maxX = Math.floor((obj.x + obj.w) / TILE_SIZE);
    let minY = Math.floor(obj.y / TILE_SIZE), maxY = Math.floor((obj.y + obj.h) / TILE_SIZE);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        let id = getTile(x, y);
        // 跳过打开的门（非实体）
        if (id === IDS.DOOR_OPEN) continue;
        // 檢查關閉的門：如果是門的下半部分，檢查上方是否也是關閉的門
        if (id === IDS.DOOR_CLOSED) {
            let aboveId = (y > 0) ? getTile(x, y - 1) : IDS.AIR;
            // 如果上方也是關閉的門，這是兩格高的門，需要碰撞檢測
            // 如果上方不是門，這是單獨的門（舊存檔兼容），也需要碰撞檢測
            // 所以繼續執行碰撞檢測
        }
        if (BLOCKS[id] && (BLOCKS[id].solid || BLOCKS[id].platform)) {
            let bx = x * TILE_SIZE, by = y * TILE_SIZE;
            // 平台逻辑（工作台和木平台）
            if(BLOCKS[id].platform) { 
                if(isX) continue; 
                if(obj.vy > 0 && obj.y + obj.h <= by + 8) { 
                    obj.y = by - obj.h; 
                    obj.grounded = true; 
                    obj.vy = 0; 
                } 
                continue; 
            }
            if (obj.x < bx + TILE_SIZE && obj.x + obj.w > bx && obj.y < by + TILE_SIZE && obj.y + obj.h > by) {
                if (isX) { if (obj.vx > 0) obj.x = bx - obj.w; else if (obj.vx < 0) obj.x = bx + TILE_SIZE; obj.vx = 0; }
                else { if (obj.vy > 0) { obj.y = by - obj.h; obj.grounded = true; obj.vy = 0; } else if (obj.vy < 0) { obj.y = by + TILE_SIZE; obj.vy = 0; } }
                return;
            }
        }
    }
}

// ==========================================
// 7. 光照 & 渲染
// ==========================================
function fullLightUpdate() {
    lightMap.fill(0); let sunLevel = getSunLevel();
    // 先扫描所有光源（包括火把），不受上方方块影响
    for(let x=0; x<CHUNK_W; x++) for(let y=0; y<CHUNK_H; y++) {
        let idx = y*CHUNK_W + x; let id = tiles[idx];
        if(BLOCKS[id] && BLOCKS[id].light) { lightMap[idx] = BLOCKS[id].light/15; lightQueue.push(idx); }
    }
    // 再处理阳光传播（从上到下，遇到固体方块停止）
    for(let x=0; x<CHUNK_W; x++) for(let y=0; y<CHUNK_H; y++) {
        let idx = y*CHUNK_W + x; let id = tiles[idx];
        if (BLOCKS[id] && BLOCKS[id].transparent) { lightMap[idx] = Math.max(lightMap[idx], sunLevel); lightQueue.push(idx); } 
        if (BLOCKS[id] && BLOCKS[id].solid) break; 
    }
    propagateLight();
}

function propagateLight() {
    let head = 0;
    // 說明：
    // - 以前的固定上限 10000 在地圖加寬到 2000x300（60 萬格）後，
    //   已經不足以覆蓋整個世界，導致只有左上角少量區域有陽光，其餘區域
    //   即使是白天也完全漆黑，只能靠火把照亮。
    // - 這裡改成依照地圖大小動態計算安全上限，理論上光照傳播次數
    //   上限約為「每個格子被更新數次」，仍然是有界的，不會無限循環。
    const maxIterations = tiles.length * 4; // 對 2000x300 來說約 240 萬步，僅在 fullLightUpdate 時偶爾執行
    let iterations = 0;

    while (head < lightQueue.length && iterations < maxIterations) {
        iterations++;
        let idx = lightQueue[head++];
        let val = lightMap[idx];
        if (val <= 0.05) continue;

        let x = idx % CHUNK_W;
        let dirs = [-1, 1, -CHUNK_W, CHUNK_W];
        for (let d of dirs) {
            let nIdx = idx + d;
            if (nIdx >= 0 && nIdx < tiles.length) {
                let nx = nIdx % CHUNK_W;
                // 橫向鄰居需在同一列，避免跨列錯位
                if (Math.abs(nx - x) > 1) continue;
                let nId = tiles[nIdx];
                if (!BLOCKS[nId]) continue; // 防止未定義方塊

                let decay = (BLOCKS[nId].solid) ? 0.2 : 0.05;
                let newVal = val - decay;
                if (newVal > lightMap[nIdx] && newVal > 0.05) {
                    lightMap[nIdx] = newVal;
                    // 限制 lightQueue 大小，避免極端情況記憶體爆掉
                    if (lightQueue.length < tiles.length * 2) {
                        lightQueue.push(nIdx);
                    }
                }
            }
        }
    }

    if (iterations >= maxIterations) {
        console.warn("[Adventure] Light propagation reached safety limit, result may be slightly truncated");
    }
    lightQueue = [];
}

function getSunLevel() { let time = gameTime / DAY_LEN; let val = Math.sin(time * Math.PI * 2 - Math.PI/2); return Math.max(0.3, Math.min(1.0, val + 0.4)); }

// 油漆顏色定義
const PAINT_COLORS = [null, "rgba(244, 67, 54, 0.5)", "rgba(76, 175, 80, 0.5)", "rgba(33, 150, 243, 0.5)"];

function draw() {
    camera.x += (player.x - width/2 - camera.x) * 0.1; camera.y += (player.y - height/2 - camera.y) * 0.1;
    camera.x = Math.max(0, Math.min(camera.x, CHUNK_W*TILE_SIZE - width)); camera.y = Math.max(0, Math.min(camera.y, CHUNK_H*TILE_SIZE - height));

    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    let time = gameTime / DAY_LEN;
    // 6点~18点显示早上（0.25~0.75），其他时间显示夜晚，但有平滑过渡
    let hour = time * 24;
    let r, g, b;
    
    // 计算过渡效果：6-7点从夜晚过渡到白天，17-18点从白天过渡到夜晚
    if (hour >= 6 && hour < 18) {
        // 白天：6-18点
        let transition = 1.0;
        if (hour < 7) {
            // 6-7点：从夜晚过渡到白天
            transition = (hour - 6) / 1.0; // 0到1
        } else if (hour >= 17) {
            // 17-18点：从白天过渡到夜晚
            transition = 1.0 - ((hour - 17) / 1.0); // 1到0
        }
        // 白天颜色（135, 206, 235）和夜晚颜色（10, 10, 30）之间插值
        r = Math.floor(10 + (135 - 10) * transition);
        g = Math.floor(10 + (206 - 10) * transition);
        b = Math.floor(30 + (235 - 30) * transition);
    } else {
        // 夜晚：18-6点（完全夜晚，无过渡）
        r = 10;
        g = 10;
        b = 30;
    }
    
    ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, 0, width, height);
    
    // --- 視差山脈背景 ---
    let mountY = height - 150 - (camera.y * 0.2); // 山脈上下移動較慢
    ctx.fillStyle = `rgba(${r*0.5},${g*0.5},${b*0.5}, 0.9)`; // 顏色比天空深一點
    ctx.beginPath(); 
    ctx.moveTo(0, height);
    // 產生起伏的山脈，x 軸移動速度是相機的一半 (0.5)
    for(let i=0; i<=width; i+=20) {
        let mx = (i + camera.x * 0.5); 
        let my = Math.sin(mx * 0.005) * 50 + Math.sin(mx * 0.02) * 20;
        ctx.lineTo(i, mountY - my);
    }
    ctx.lineTo(width, height); 
    ctx.fill();
    // ------------------

    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    let worldPixelWidth = CHUNK_W * TILE_SIZE;
    for(let c of clouds) {
        c.x += c.s * 0.5; if(c.x > worldPixelWidth) c.x = -c.w;
        let drawX = c.x - (camera.x * 0.5); if (drawX + c.w < 0) drawX += worldPixelWidth;
        ctx.beginPath(); ctx.roundRect(drawX, c.y, c.w, 30, 15); ctx.fill();
    }

    // --- 夜晚星星系統（只在夜晚顯示，且只在玩家視窗範圍內生成） ---
    // 維護備註：
    // - 星星只在夜晚時段顯示（time < 0.25 || time >= 0.75，即 18:00-6:00）
    // - 性能優化：只在相機視窗範圍內生成和繪製星星，避免地圖太大時產生過多物件
    // - 星星有閃爍動畫效果，使用簡單的 fillRect 繪製，不影響其他圖層
    // - 星星陣列會隨相機移動動態更新，只保留視窗內的星星
    let isNight = time < 0.25 || time >= 0.75;
    if (isNight) {
        // 計算視窗範圍（世界座標）
        let viewMinX = camera.x;
        let viewMaxX = camera.x + width;
        let viewMinY = camera.y;
        let viewMaxY = camera.y + height;
        
        // 移除視窗外的星星
        stars = stars.filter(s => 
            s.x >= viewMinX - 100 && s.x <= viewMaxX + 100 &&
            s.y >= viewMinY - 100 && s.y <= viewMaxY + 100
        );
        
        // 如果星星數量不足，在視窗範圍內生成新星星
        const TARGET_STAR_COUNT = 80; // 目標星星數量（視窗範圍內）
        if (stars.length < TARGET_STAR_COUNT) {
            const needed = TARGET_STAR_COUNT - stars.length;
            for (let i = 0; i < needed; i++) {
                // 在視窗範圍內隨機生成星星位置
                let starX = viewMinX + Math.random() * width;
                let starY = viewMinY + Math.random() * (height * 0.6); // 只在上方 60% 區域生成
                // 使用簡單的雜湊確保同一位置不會重複生成
                let seed = Math.floor(starX / 50) * 1000 + Math.floor(starY / 50);
                let rng = ((seed * 9301 + 49297) % 233280) / 233280;
                if (rng > 0.3) continue; // 30% 機率生成星星，避免太密集
                stars.push({
                    x: starX,
                    y: starY,
                    size: 2.5 + Math.random() * 2.5, // 星星大小 2.5-5px（加大避免被誤認為灰塵）
                    brightness: 0.3 + Math.random() * 0.7, // 初始亮度 0.3-1.0
                    twinkleSpeed: 0.02 + Math.random() * 0.03, // 閃爍速度
                    twinklePhase: Math.random() * Math.PI * 2 // 閃爍相位
                });
            }
        }
        
        // 繪製星星（使用簡單的 fillRect，性能較好）
        ctx.fillStyle = "rgba(255, 255, 255, 0)"; // 預設透明
        for (let star of stars) {
            // 更新閃爍動畫
            star.twinklePhase += star.twinkleSpeed;
            let twinkle = 0.5 + Math.sin(star.twinklePhase) * 0.5; // 0.0-1.0
            let alpha = star.brightness * twinkle;
            
            // 只繪製視窗內的星星
            let screenX = star.x - camera.x;
            let screenY = star.y - camera.y;
            if (screenX >= -5 && screenX <= width + 5 && screenY >= -5 && screenY <= height + 5) {
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fillRect(screenX - star.size/2, screenY - star.size/2, star.size, star.size);
                // 較亮的星星加一點光暈
                if (alpha > 0.7) {
                    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.3})`;
                    ctx.fillRect(screenX - star.size, screenY - star.size, star.size * 2, star.size * 2);
                }
            }
        }
    } else {
        // 白天時清空星星陣列（節省記憶體）
        stars = [];
    }

    ctx.fillStyle = `rgba(${r*0.6},${g*0.6},${b*0.6}, 0.8)`;
    ctx.beginPath(); ctx.moveTo(0, height);
    for(let i=0; i<=width; i+=10) ctx.lineTo(i, height - 250 - Math.sin((i+camera.x*0.2)*0.005)*80 + (camera.y * 0.5));
    ctx.lineTo(width, height); ctx.fill();

    ctx.save(); ctx.translate(-Math.floor(camera.x), -Math.floor(camera.y));
    let startX = Math.floor(camera.x/TILE_SIZE) - 5, endX = startX + Math.floor(width/TILE_SIZE) + 10;
    let startY = Math.floor(camera.y/TILE_SIZE) - 5, endY = startY + Math.floor(height/TILE_SIZE) + 10;
    if (startX < 0) startX = 0; if (endX > CHUNK_W) endX = CHUNK_W; if (startY < 0) startY = 0; if (endY > CHUNK_H) endY = CHUNK_H;

    for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) {
        let idx = y * CHUNK_W + x; let id = tiles[idx]; let px = x * TILE_SIZE, py = y * TILE_SIZE; let light = lightMap[idx];
        
        let wallId = walls[idx]; // 取得牆壁 ID
        let paint = tileColors[idx]; // 取得顏色 ID
        
        // 1. 繪製牆壁 (Wall)
        if (wallId !== IDS.AIR && (id === IDS.AIR || BLOCKS[id].transparent)) {
            if (textures[wallId]) {
                ctx.fillStyle = textures[wallId]; ctx.save(); ctx.translate(px,py); ctx.fillRect(0,0,TILE_SIZE,TILE_SIZE); ctx.restore();
                 } else {
                ctx.fillStyle = (wallId===IDS.STONE_WALL)?'#424242':'#3e2723'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
            
            // --- 插入：油漆渲染 (牆壁) ---
            if (paint > 0 && PAINT_COLORS[paint]) {
                ctx.fillStyle = PAINT_COLORS[paint];
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
            
                 ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); 
                 ctx.fillStyle = `rgba(0,0,0,${Math.min(0.8, 1-light)})`; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
        if (id !== IDS.AIR) {
            if (id === IDS.WATER) {
                ctx.fillStyle = BLOCKS[id].color; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(px, py, TILE_SIZE, 4); 
            } 
            else if (id === IDS.LAVA) {
                ctx.fillStyle = BLOCKS[id].color; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
            else if (id === IDS.GLASS) { 
                ctx.fillStyle = textures[id]; ctx.save(); ctx.translate(px, py); ctx.fillRect(0,0,TILE_SIZE,TILE_SIZE); ctx.restore();
            }
            else if(id === IDS.DOOR_CLOSED || id === IDS.DOOR_OPEN) {
                // 門的特殊繪製：檢查上下是否有門，繪製成兩格高
                let aboveId = (y > 0) ? getTile(x, y - 1) : IDS.AIR;
                let belowId = (y < CHUNK_H - 1) ? getTile(x, y + 1) : IDS.AIR;
                let isDoorAbove = (aboveId === IDS.DOOR_CLOSED || aboveId === IDS.DOOR_OPEN);
                let isDoorBelow = (belowId === IDS.DOOR_CLOSED || belowId === IDS.DOOR_OPEN);
                
                // 如果這是門的上半部分（下方有門），繪製完整的兩格高門
                if (isDoorBelow) {
                    ctx.save();
                    ctx.translate(px, py);
                    if (id === IDS.DOOR_CLOSED) {
                        ctx.fillStyle = '#5d4037';
                        ctx.fillRect(6, 0, 20, 64); // 兩格高
                        ctx.strokeStyle = '#3e2723';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(6, 0, 20, 64);
                        ctx.fillStyle = '#ffca28';
                        ctx.beginPath();
                        ctx.arc(22, 32, 2, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = '#3e2723';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(6, 32);
                        ctx.lineTo(26, 32);
                        ctx.stroke();
                    } else {
                        ctx.fillStyle = 'rgba(93, 64, 55, 0.5)';
                        ctx.fillRect(2, 0, 10, 64); // 兩格高
                        ctx.strokeStyle = '#3e2723';
                        ctx.strokeRect(2, 0, 10, 64);
                        ctx.strokeStyle = '#3e2723';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(2, 32);
                        ctx.lineTo(12, 32);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                // 如果這是門的下半部分（上方有門），不繪製（由上方繪製）
                else if (isDoorAbove) {
                    // 不繪製，由上方繪製完整的門
                }
                // 單獨的門（舊存檔兼容），繪製一格高
                else {
                    ctx.fillStyle = textures[id];
                    ctx.save();
                    ctx.translate(px, py);
                    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
                    ctx.restore();
                }
            }
            else if(textures[id]) {
                ctx.fillStyle = textures[id]; ctx.save(); ctx.translate(px, py);
                if(BLOCKS[id].scale) { let s = BLOCKS[id].scale; ctx.translate((1-s)*16, (1-s)*16); ctx.scale(s,s); }
                ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE); ctx.restore();
            } else if(id === IDS.TORCH) {
                if(BLOCKS[id].icon) ctx.drawImage(BLOCKS[id].icon, px, py); else { ctx.fillStyle = '#ffeb3b'; ctx.fillRect(px+12, py+10, 8, 22); }
            } else if(id === IDS.FLOWER || id === IDS.DAYBLOOM || id === IDS.MOONGLOW) {
                // 小花使用icon绘制
                if(BLOCKS[id].icon) ctx.drawImage(BLOCKS[id].icon, px, py);
            } else if(BLOCKS[id].icon) {
                ctx.drawImage(BLOCKS[id].icon, px, py);
            }
            
            // --- 插入：油漆渲染 (方塊) ---
            // 注意：不要染水或岩漿，會很怪
            // 門的特殊處理：如果是兩格高的門，需要處理兩格高的油漆
            if (id === IDS.DOOR_CLOSED || id === IDS.DOOR_OPEN) {
                let aboveId = (y > 0) ? getTile(x, y - 1) : IDS.AIR;
                let belowId = (y < CHUNK_H - 1) ? getTile(x, y + 1) : IDS.AIR;
                let isDoorAbove = (aboveId === IDS.DOOR_CLOSED || aboveId === IDS.DOOR_OPEN);
                let isDoorBelow = (belowId === IDS.DOOR_CLOSED || belowId === IDS.DOOR_OPEN);
                
                // 如果上方是門，這是門的下半部分，跳過油漆處理（由上方處理）
                if (isDoorAbove) {
                    // 跳過油漆處理
                }
                // 如果下方是門，這是門的上半部分，處理兩格高的油漆
                else if (isDoorBelow) {
                    let belowPaint = (y + 1 < CHUNK_H) ? tileColors[(y + 1) * CHUNK_W + x] : 0;
                    let doorPaint = paint || belowPaint; // 優先使用當前格的顏色
                    if (doorPaint > 0 && PAINT_COLORS[doorPaint]) {
                        ctx.fillStyle = PAINT_COLORS[doorPaint];
                        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE * 2); // 兩格高的油漆
                    }
                }
                // 單獨的門（舊存檔兼容），正常處理油漆
                else if (paint > 0 && PAINT_COLORS[paint]) {
                    ctx.fillStyle = PAINT_COLORS[paint];
                    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                }
            }
            // 非門方塊，正常處理油漆
            else if (paint > 0 && PAINT_COLORS[paint] && id !== IDS.WATER && id !== IDS.LAVA) {
                // 為了保留紋理，我們使用疊加半透明色
                ctx.fillStyle = PAINT_COLORS[paint];
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
        }
        // 光照處理：如果是門的下半部分（上方有門），跳過光照處理（由上方處理）
        if (id === IDS.DOOR_CLOSED || id === IDS.DOOR_OPEN) {
            let aboveId = (y > 0) ? getTile(x, y - 1) : IDS.AIR;
            let isDoorAbove = (aboveId === IDS.DOOR_CLOSED || aboveId === IDS.DOOR_OPEN);
            // 如果上方是門，這是門的下半部分，跳過光照處理（由上方處理兩格高的光照）
            if (isDoorAbove) {
                // 跳過光照處理
            } else {
                // 如果是門的上半部分（下方有門），需要處理兩格高的光照
                let belowId = (y < CHUNK_H - 1) ? getTile(x, y + 1) : IDS.AIR;
                let isDoorBelow = (belowId === IDS.DOOR_CLOSED || belowId === IDS.DOOR_OPEN);
                if (isDoorBelow) {
                    let belowLight = (y + 1 < CHUNK_H) ? lightMap[(y + 1) * CHUNK_W + x] : 0;
                    let doorLight = Math.min(light, belowLight); // 取兩格中較暗的光照
                    if (doorLight < 1.0) {
                        ctx.fillStyle = `rgba(0,0,0,${1 - doorLight})`;
                        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE * 2); // 兩格高的陰影
                    }
                } else {
                    // 單獨的門（舊存檔兼容），正常處理光照
                    if (light < 1.0) {
                        ctx.fillStyle = `rgba(0,0,0,${1 - light})`;
                        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        } else {
            // 非門方塊，正常處理光照
            if (light < 1.0) { ctx.fillStyle = `rgba(0,0,0,${1 - light})`; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); }
        }
        if (mining.active && mining.x === x && mining.y === y) {
            ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px+16, py+16);
            for(let i=0; i<(mining.progress/BLOCKS[id].hardness)*5; i++) ctx.lineTo(px+Math.random()*32, py+Math.random()*32);
            ctx.stroke();
        }
    }
    
    for (let d of drops) {
        ctx.save(); ctx.translate(d.x, d.y);
        ctx.translate(0, Math.sin(Date.now()*0.01)*2);
        if (BLOCKS[d.id].icon) ctx.drawImage(BLOCKS[d.id].icon, 0, 0, 16, 16);
        else { ctx.fillStyle = BLOCKS[d.id].color; ctx.fillRect(0,0,16,16); }
        ctx.restore();
    }

    for (let p of projectiles) {
        ctx.save(); 
        ctx.translate(p.x - camera.x, p.y - camera.y); 
        ctx.rotate(p.angle);
        if (p.type === 'star') {
            ctx.fillStyle = p.color || '#ff4081'; 
            ctx.beginPath(); 
            for(let k=0; k<5; k++) { 
                ctx.lineTo(Math.cos((18+k*72)/180*Math.PI)*10, Math.sin((18+k*72)/180*Math.PI)*10); 
                ctx.lineTo(Math.cos((54+k*72)/180*Math.PI)*4, Math.sin((54+k*72)/180*Math.PI)*4); 
            } 
            ctx.closePath();
            ctx.fill();
        } else if (p.type === 'magic') {
            ctx.fillStyle = p.color || '#e040fb'; 
            ctx.beginPath(); 
            ctx.arc(0,0,6,0,Math.PI*2); 
            ctx.fill();
            ctx.fillStyle = "#fff"; 
            ctx.beginPath(); 
            ctx.arc(0,0,3,0,Math.PI*2); 
            ctx.fill();
        } else if (p.type === 'boomerang') {
            ctx.fillStyle = p.color || '#ffab91'; 
            ctx.strokeStyle = '#d84315'; 
            ctx.lineWidth = 2;
            ctx.beginPath(); 
            ctx.moveTo(4,28); 
            ctx.quadraticCurveTo(16,4, 28,28); 
            ctx.quadraticCurveTo(16,16, 4,28); 
            ctx.fill(); 
            ctx.stroke();
        } else if (p.type === 'stinger') {
            ctx.fillStyle = "#212121"; 
            ctx.beginPath(); 
            ctx.moveTo(6,0); 
            ctx.lineTo(-6,3); 
            ctx.lineTo(-6,-3); 
            ctx.fill();
        } else {
            // 原本的箭矢繪製
            ctx.fillStyle = "#8d6e63"; 
            ctx.fillRect(-10,-2, 20, 4); // 箭桿
            ctx.fillStyle = "#9e9e9e"; 
            ctx.beginPath(); 
            ctx.moveTo(10,-3); 
            ctx.lineTo(14,0); 
            ctx.lineTo(10,3); 
            ctx.fill(); // 箭頭
        }
        ctx.restore();
    }

    // 繪製鉤爪
    if (player.hook.active) {
        ctx.strokeStyle = "#424242"; 
        ctx.lineWidth = 2;
        ctx.beginPath(); 
        ctx.moveTo(player.x+10 - camera.x, player.y+20 - camera.y); 
        ctx.lineTo(player.hook.x - camera.x, player.hook.y - camera.y); 
        ctx.stroke();
        // 畫爪頭
        ctx.fillStyle = "#616161"; 
        ctx.fillRect(player.hook.x - camera.x - 4, player.hook.y - camera.y - 4, 8, 8);
    }

    // 繪製怪物
    for (let m of mobs) {
        ctx.save();
        if (m.type === 'boss') {
            ctx.translate(m.x + m.w/2, m.y + m.h/2);
            let angle = Math.atan2(player.y - (m.y + m.h/2), player.x - (m.x + m.w/2));
            ctx.rotate(angle);
            // 繪製眼球
            ctx.fillStyle = "#fff";
            ctx.beginPath(); ctx.arc(0, 0, m.w/2, 0, Math.PI*2); ctx.fill(); 
            
            // 瞳孔 (二階段變黑)
            ctx.fillStyle = (m.phase === 2) ? "#000" : "#2196f3";
            let pupilSize = (m.phase === 2) ? 10 : 18;
            ctx.beginPath(); ctx.arc(15, 0, pupilSize, 0, Math.PI*2); ctx.fill(); 
            // 血絲 (二階段)
            if (m.phase === 2) {
                ctx.strokeStyle = "red"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(-20, -10); ctx.lineTo(0,0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-20, 10); ctx.lineTo(0,0); ctx.stroke();
            }
            ctx.restore();
            // 血條
            ctx.fillStyle = "red";
            ctx.fillRect(m.x - camera.x, m.y - camera.y - 10, m.w * (m.hp / m.maxHp), 6);
            ctx.strokeStyle = "black";
            ctx.strokeRect(m.x - camera.x, m.y - camera.y - 10, m.w, 6);
        } else if (m.type === 'demon_eye') {
            ctx.translate(m.x + m.w/2, m.y + m.h/2);
            ctx.rotate(Math.atan2(player.y - m.y, player.x - m.x));
            ctx.fillStyle="#fff"; 
            ctx.beginPath(); 
            ctx.arc(0,0,12,0,Math.PI*2); 
            ctx.fill();
            ctx.fillStyle="#b71c1c"; 
            ctx.beginPath(); 
            ctx.arc(6,0,6,0,Math.PI*2); 
            ctx.fill();
            ctx.restore(); 
            continue; 
        } else if (m.type === 'skeleton') {
            ctx.fillStyle = "#e0e0e0"; 
            ctx.fillRect(m.x - camera.x, m.y - camera.y, m.w, m.h);
            ctx.fillStyle = "#000"; 
            ctx.fillRect(m.x - camera.x + 4, m.y - camera.y + 6, 4, 4); 
            ctx.fillRect(m.x - camera.x + 12, m.y - camera.y + 6, 4, 4); // 眼睛
            // 簡單肋骨
            ctx.fillStyle = "#9e9e9e"; 
            ctx.fillRect(m.x - camera.x + 4, m.y - camera.y + 18, 12, 2); 
            ctx.fillRect(m.x - camera.x + 4, m.y - camera.y + 24, 12, 2);
            ctx.restore();
            continue; // 這樣就不會執行後面通用的繪製
        } else if (m.type === 'merchant') {
            // 修复：上下文已经平移了-camera，所以直接使用m.x和m.y，不要减去camera
            ctx.fillStyle = "#795548"; 
            ctx.fillRect(m.x, m.y, m.w, m.h); // 衣服
            ctx.fillStyle = "#ffe0b2"; 
            ctx.fillRect(m.x + 2, m.y + 2, 16, 10); // 臉
            ctx.fillStyle = "#fff"; 
            ctx.fillRect(m.x + 2, m.y + 12, 16, 8); // 白鬍子
            ctx.fillStyle = "#5d4037"; 
            ctx.fillRect(m.x - 2, m.y - 4, 24, 6); // 帽子緣
            ctx.fillRect(m.x + 2, m.y - 14, 16, 10); // 帽子頂
            ctx.restore();
            continue;
        } else if (m.type === 'hornet') {
            ctx.translate(m.x+m.w/2, m.y+m.h/2);
            ctx.rotate(Math.atan2(player.y - m.y, player.x - m.x));
            ctx.fillStyle = "#ffeb3b"; 
            ctx.fillRect(-10, -8, 20, 16); // 身體
            ctx.fillStyle = "#212121"; 
            ctx.fillRect(10, -2, 4, 4); // 刺
            ctx.fillStyle = "rgba(255,255,255,0.5)"; 
            ctx.beginPath(); 
            ctx.ellipse(-5, -10, 8, 4, 0, 0, Math.PI*2); 
            ctx.fill(); // 翅膀
            ctx.restore(); 
            continue;
        } else if (m.type === 'eater') {
            ctx.translate(m.x+m.w/2, m.y+m.h/2);
            ctx.rotate(Math.atan2(player.y - m.y, player.x - m.x));
            ctx.fillStyle="#4a148c"; 
            ctx.beginPath(); 
            ctx.arc(0,0,14,0,Math.PI*2); 
            ctx.fill(); // 頭
            ctx.fillStyle="#7b1fa2"; 
            ctx.beginPath(); 
            ctx.arc(-10,0,8,0,Math.PI*2); 
            ctx.fill(); // 身體
            ctx.restore(); 
            continue;
        } else if (m.type === 'bunny') {
            // 修复：上下文已经平移了-camera，所以直接使用m.x和m.y，不要减去camera
            ctx.fillStyle = "#fff";
            ctx.fillRect(m.x, m.y + 4, m.w, m.h - 4); // 身
            ctx.fillRect(m.x + 4, m.y, 4, 8);
            ctx.fillRect(m.x + 12, m.y, 4, 8); // 耳
            ctx.restore();
            continue;
        } else if (m.type === 'firefly') {
            // 修复：上下文已经平移了-camera，所以直接使用m.x和m.y，不要减去camera
            ctx.fillStyle = "#76ff03";
            ctx.fillRect(m.x, m.y, m.w, m.h);
            ctx.fillStyle = "rgba(118, 255, 3, 0.6)";
            ctx.fillRect(m.x - 2, m.y - 2, m.w + 4, m.h + 4); // 光暈（调整为8x8大小）
            ctx.restore();
            continue;
        } else {
            // 普通怪物繪製 (保持原樣)
        ctx.fillStyle = m.color;
        let stretch = 1 + Math.abs(m.vy) * 0.05; let squash = 1 / stretch;
        ctx.translate(m.x + m.w/2, m.y + m.h);
        ctx.scale(squash, stretch);
        ctx.fillRect(-m.w/2, -m.h, m.w, m.h);
        if(m.type==='zombie') { 
            ctx.fillStyle = '#2e7d32'; 
            let armAngle = Math.sin(Date.now()*0.01)*0.5;
            ctx.translate(0, -m.h+8); ctx.rotate(armAngle); ctx.fillRect(-2,0, 4, 12);
        }
        ctx.fillStyle = m.type==='zombie'?"#ff5252":"white"; 
        ctx.fillRect(-4, -m.h+6, 4, 4); ctx.fillRect(2, -m.h+6, 4, 4);
        ctx.restore();
        }
    }

    let tx = Math.floor(mouse.worldX / TILE_SIZE), ty = Math.floor(mouse.worldY / TILE_SIZE);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"; ctx.lineWidth = 2; ctx.strokeRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);

    // 繪製釣魚線
    if (player.fishing.active) {
        // 線：從釣竿尖端 (假設玩家手中) 到浮標
        let startX = player.x + 10;
        let startY = player.y + 15;
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        // 畫一條貝茲曲線，模擬垂墜感
        let midX = (startX + player.fishing.x) / 2;
        let midY = (startY + player.fishing.y) / 2 + 50; // 下垂
        ctx.quadraticCurveTo(midX, midY, player.fishing.x, player.fishing.y);
        
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
        // 浮標
        ctx.fillStyle = "#ff5252"; // 紅色
        ctx.fillRect(player.fishing.x - 3, player.fishing.y - 3, 6, 6);
        ctx.fillStyle = "#fff";
        ctx.fillRect(player.fishing.x - 3, player.fishing.y - 3, 6, 3);
    }
    
    // --- 繪製寵物 ---
    if (player.pet && player.pet.active) {
        // 畫一隻小兔子
        ctx.fillStyle = "#fff";
        ctx.fillRect(player.pet.x - camera.x, player.pet.y - camera.y + 10, 16, 12);
        ctx.fillRect(player.pet.x - camera.x + 2, player.pet.y - camera.y + 2, 4, 8);
        ctx.fillRect(player.pet.x - camera.x + 10, player.pet.y - camera.y + 2, 4, 8);
    }

    // 玩家本體（矩形 → 角色 GIF 立繪）
    // - 若 AdventureGifOverlay 可用且有角色圖，使用 GIF 疊加顯示。
    // - 否則回退為原本的矩形小人繪製（保持完全相容）。
    if (playerSpriteReady && playerSpriteImg && typeof AdventureGifOverlay !== 'undefined' && typeof AdventureGifOverlay.showOrUpdate === 'function') {
        const w = playerSpriteImg.width * playerSpriteScale;
        const h = playerSpriteImg.height * playerSpriteScale;
        const screenX = (player.x - camera.x) + playerSpriteOffsetX + w / 2;
        const screenY = (player.y - camera.y) + playerSpriteOffsetY + h / 2;
        if (player.invincibleTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) {
            // 無敵閃爍：簡單處理為暫時隱藏 GIF
            try { AdventureGifOverlay.hide('player'); } catch(_) {}
        } else {
            AdventureGifOverlay.showOrUpdate('player', playerSpriteImg.src, screenX, screenY, { width: w, height: h });
        }
    } else {
        if (player.invincibleTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) {
            // 無敵閃爍：暫時不畫玩家（沿用原本行為）
        } else {
            // 後備：維持原本的矩形人物繪製
            ctx.fillStyle = "#1565c0"; ctx.fillRect(player.x+4, player.y+20, 12, 18);
            ctx.fillStyle = "#ef5350"; ctx.fillRect(player.x+2, player.y+8, 16, 12);
            ctx.fillStyle = "#ffcc80"; ctx.fillRect(player.x+2, player.y-4, 16, 14);
        }
        // 繪製頭盔（僅在未使用角色視覺圖時才顯示，避免帽子覆蓋到角色立繪）
        if (!playerSpriteReady && player.equip.head !== 0) {
            let hId = player.equip.head;
            if (BLOCKS[hId] && BLOCKS[hId].icon) {
                ctx.drawImage(BLOCKS[hId].icon, player.x-6, player.y-10, 32, 32);
            }
        }
    }
    
    // 繪製手持物品（無論是否使用角色立繪都要顯示，但頭盔除外）
    let handX = player.x + (player.facingRight ? 14 : -2), handY = player.y + 14;
    
    let item = player.inventory[player.hotbarSlot];
    if (item && item.id !== IDS.AIR && item.id !== 0 && BLOCKS[item.id] && BLOCKS[item.id].icon) {
        if(item.id === IDS.WOOD_BOW) {
            ctx.save(); ctx.translate(handX, handY);
            let aimAngle = Math.atan2(mouse.worldY - (player.y+20), mouse.worldX - (player.x+10));
            ctx.rotate(aimAngle);
            ctx.drawImage(BLOCKS[item.id].icon, -12, -16);
            ctx.restore();
        } else if(item.id >= 20 && item.id < 40) { 
            // 工具類（鎬、劍等，ID 20-39）
            ctx.save(); ctx.translate(handX, handY);
            if (mouse.left) ctx.rotate(Math.sin(Date.now()*0.2)*1.5 - 0.5); else ctx.rotate(-0.5);
            ctx.drawImage(BLOCKS[item.id].icon, -8, -24, 24, 24); ctx.restore();
        } else {
            // 其他物品（僅在未使用角色立繪時顯示手部動作）
            if (!playerSpriteReady) {
                if (mouse.left) { handX += Math.sin(Date.now() * 0.05) * 5; handY += Math.cos(Date.now() * 0.05) * 5; }
                ctx.fillRect(handX, handY, 6, 6);
            }
        }
    } else {
        // 空手時（僅在未使用角色立繪時顯示手部動作）
        if (!playerSpriteReady) {
            if (mouse.left) { handX += Math.sin(Date.now() * 0.05) * 5; handY += Math.cos(Date.now() * 0.05) * 5; }
            ctx.fillRect(handX, handY, 6, 6);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i]; 
        p.x += p.vx; 
        p.y += p.vy; 
        p.vy += 0.2; 
        p.life -= 0.05;
        if (p.life <= 0) { 
            particles.splice(i, 1); 
            continue; 
        }
        ctx.fillStyle = p.color; 
        ctx.globalAlpha = p.life; 
        ctx.fillRect(p.x - camera.x, p.y - camera.y, p.size, p.size);
    }
    ctx.globalAlpha = 1.0;
    
    ctx.restore();
    
    // --- 繪製飄浮文字（在相機轉換外，使用屏幕坐標） ---
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    for (let i = floatTexts.length - 1; i >= 0; i--) {
        let t = floatTexts[i];
        t.life--; // 先減少生命值
        
        // 如果生命值歸零，立即移除，不繪製
        if (t.life <= 0) {
            floatTexts.splice(i, 1);
            continue;
        }
        
        t.y += t.vy; // 往上飄
        t.vy *= 0.9; // 減速
        
        // 計算屏幕坐標
        let screenX = t.x - camera.x;
        let screenY = t.y - camera.y;
        
        // 只繪製在屏幕範圍內的文字
        if (screenX > -50 && screenX < width + 50 && screenY > -50 && screenY < height + 50) {
            // 根據生命值計算透明度（接近消失時變透明）
            let alpha = Math.min(1, t.life / 20);
            ctx.globalAlpha = alpha;
            
            // 畫邊框 (黑色)
            ctx.fillStyle = "black";
            ctx.fillText(t.text, screenX + 2, screenY + 2);
            // 畫本體 (彩色)
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, screenX, screenY);
            
            ctx.globalAlpha = 1; // 恢復透明度
        }
    }
    
    // 繪製物品名稱（使用已宣告的 item 變數）
    item = player.inventory[player.hotbarSlot];
    if (item && item.id !== IDS.AIR && item.id !== 0 && BLOCKS[item.id]) {
        ctx.fillStyle = "white"; ctx.font = "bold 20px monospace"; ctx.textAlign = "center";
        ctx.fillStyle = "black"; ctx.fillText(BLOCKS[item.id].name, width/2 + 2, height - 90 + 2);
        ctx.fillStyle = "white"; ctx.fillText(BLOCKS[item.id].name, width/2, height - 90);
    }

    ctx.fillStyle = "white"; ctx.strokeStyle = "black"; ctx.lineWidth = 1; 
    ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(mouse.x+14, mouse.y+7); ctx.lineTo(mouse.x+7, mouse.y+14); ctx.fill(); ctx.stroke();
}

// ==========================================
// 8. 交互 (Interaction)
// ==========================================
function getTile(x, y) { if(x<0||x>=CHUNK_W||y<0||y>=CHUNK_H) return IDS.BEDROCK; return tiles[y*CHUNK_W+x]; }
function getBlock(x, y) { return BLOCKS[getTile(x, y)] || BLOCKS[IDS.AIR]; }
function setTile(x, y, id) { 
    if(x<0||x>=CHUNK_W||y<0||y>=CHUNK_H) return; 
    tiles[y*CHUNK_W+x] = id; 
    // 完全按照备份文件的方式：如果放置的是光源，设置lightMap为1.0
    if(BLOCKS[id] && BLOCKS[id].light > 0) lightMap[y*CHUNK_W+x] = 1.0; 
    // 无论放置什么方块，都将周围区域加入lightQueue并传播光照（参考备份）
    // 这样当移除方块时，周围的光照会自动重新传播，不会有黑色残留
    for(let i=-3; i<=3; i++) {
        for(let j=-3; j<=3; j++) {
            let nx = x + i;
            let ny = y + j;
            // 确保在边界内
            if (nx >= 0 && nx < CHUNK_W && ny >= 0 && ny < CHUNK_H) {
                let nIdx = ny * CHUNK_W + nx;
                // 限制lightQueue大小
                if (lightQueue.length < 50000) {
                    lightQueue.push(nIdx);
                }
            }
        }
    }
    propagateLight();
}
function setWall(x, y, id) {
    if(x<0||x>=CHUNK_W||y<0||y>=CHUNK_H) return; 
    walls[y*CHUNK_W+x] = id;
}

function isNearStation(stationID) {
    let px = Math.floor(player.x / TILE_SIZE); let py = Math.floor(player.y / TILE_SIZE);
    for(let y = py - 2; y <= py + 2; y++) for(let x = px - 2; x <= px + 2; x++) if(getTile(x, y) === stationID) return true;
    return false;
}

function updateInteraction() {
    mouse.worldX = camera.x + mouse.x;
    mouse.worldY = camera.y + mouse.y;
    let handItem = player.inventory[player.hotbarSlot];
    let handDef = handItem ? BLOCKS[handItem.id] : null;
    
    // 計算滑鼠指向的方塊座標（左右鍵都需要）
    let tx = Math.floor(mouse.worldX / TILE_SIZE);
    let ty = Math.floor(mouse.worldY / TILE_SIZE);
    let dx = (player.x + player.w / 2) - (tx * TILE_SIZE + TILE_SIZE / 2);
    let dy = (player.y + player.h / 2) - (ty * TILE_SIZE + TILE_SIZE / 2);
    let inRange = Math.sqrt(dx * dx + dy * dy) < MINING_RANGE * TILE_SIZE;
    
    // 左鍵：攻擊與挖掘（不處理任何互動 UI）
    if (mouse.left) {
        // --- 召喚 BOSS 邏輯 ---
        if (handItem && handItem.id === IDS.EYE_SUMMON) {
            if (mobs.find(m => m.type === 'boss')) {
                spawnFloatText(player.x, player.y - 20, "BOSS 已存在!", "#fff");
            } else {
                spawnMob(player.x, player.y - 300, 'boss'); // 在上方生成
                handItem.count--; 
                if (handItem.count <= 0) {
                    handItem.id = IDS.AIR;
                    handItem.count = 0;
                }
                updateUI();
                mouse.left = false;
                return;
            }
        }
        
        // 1. 星怒 (Starfury)
        if (handItem && handItem.id === IDS.STARFURY) {
            if (player.mana >= 8) { // 消耗 8
                if (frameCount % 30 === 0) { // 冷卻
                    player.mana -= 8;
                    if (player.mana < 0) player.mana = 0; // 防止魔力变成负数
                    updateHealthUI();
                    
                    // 消耗星怒耐久度
                    if (consumeDurability(handItem, 1)) {
                        updateUI();
                        mouse.left = false;
                        return; // 武器損壞
                    }
                    
                    let sx = mouse.worldX + (Math.random()-0.5)*150;
                    let sy = camera.y - 50; 
                    let angle = Math.atan2(mouse.worldY - sy, mouse.worldX - sx);
                    projectiles.push({ 
                        x:sx, y:sy, 
                        vx:Math.cos(angle)*14, vy:Math.sin(angle)*14, 
                        damage:15, type:'star', color:'#ff4081', angle:angle 
                    });
                    playSound('shoot');
                }
            }
        }
        // 2. 魔法法杖 (Magic Staff)
        else if (handItem && handItem.id === IDS.MAGIC_STAFF) {
            if (player.mana >= 5) { // 消耗 5
                if (frameCount % 20 === 0) {
                    player.mana -= 5; // 扣除魔力
                    if (player.mana < 0) player.mana = 0; // 防止魔力变成负数
                    updateHealthUI(); // 更新 UI
                    
                    // 消耗魔法法杖耐久度
                    if (consumeDurability(handItem, 1)) {
                        updateUI();
                        mouse.left = false;
                        return; // 武器損壞
                    }
                    
                    let angle = Math.atan2(mouse.worldY - (player.y+20), mouse.worldX - (player.x+10));
                    projectiles.push({ 
                        x:player.x+10, y:player.y+20, 
                        vx:Math.cos(angle)*8, vy:Math.sin(angle)*8, 
                        damage:6, type:'magic', color:'#e040fb', angle:angle 
                    });
                    playSound('shoot');
                }
            }
        }
        // 弓箭射擊
        else if (handItem && handItem.id === IDS.WOOD_BOW) {
            let arrowIdx = player.inventory.findIndex(i => i.id === IDS.ARROW && i.count > 0);
            if (arrowIdx !== -1) {
                // 消耗弓耐久度
                if (consumeDurability(handItem, 1)) {
                    updateUI();
                    mouse.left = false;
                    return; // 武器損壞
                }
                
                let angle = Math.atan2(mouse.worldY - (player.y + 20), mouse.worldX - (player.x + 10));
                projectiles.push({
                    x: player.x + 10,
                    y: player.y + 20,
                    vx: Math.cos(angle) * 12,
                    vy: Math.sin(angle) * 12,
                    damage: 3,
                    type: 'arrow',
                    angle: angle
                });
                player.inventory[arrowIdx].count--;
                // 如果箭矢数量为0，清空槽位
                if (player.inventory[arrowIdx].count <= 0) {
                    player.inventory[arrowIdx].id = IDS.AIR;
                    player.inventory[arrowIdx].count = 0;
                }
                playSound('shoot');
                updateUI();
                mouse.left = false;
                return;
            }
        }

        // 近戰攻擊 (修復了重複變數的問題)
        let range = (handDef && handDef.range) ? handDef.range : 60;
        for (let i = mobs.length - 1; i >= 0; i--) {
            let m = mobs[i];
            let dist = Math.sqrt(Math.pow(player.x - m.x, 2) + Math.pow(player.y - m.y, 2));
            if (dist < range && mouse.worldX > m.x - 20 && mouse.worldX < m.x + m.w + 20 && mouse.worldY > m.y - 20 && mouse.worldY < m.y + m.h + 20) {
                m.vx = (player.x < m.x ? 5 : -5);
                m.vy = -3;
                let dmg = (handDef && handDef.damage) ? handDef.damage : 1;
                m.hp -= dmg;
                
                // --- 加入這行：怪物受傷飄黃字 ---
                if (dmg && !isNaN(dmg)) {
                    spawnFloatText(m.x + m.w / 2, m.y, String(Math.floor(dmg)), "#ffeb3b");
                }

                // 消耗武器耐久度（如果是武器）
                if (handItem && ((handItem.id >= IDS.WOOD_SWORD && handItem.id <= IDS.DIAMOND_SWORD) || 
                    handItem.id === IDS.MAGIC_STAFF || handItem.id === IDS.STARFURY || 
                    handItem.id === IDS.BLADE_OF_GRASS || handItem.id === IDS.BOOMERANG)) {
                    if (consumeDurability(handItem, 1)) {
                        updateUI();
                        mouse.left = false;
                        return; // 武器損壞，停止攻擊
                    }
                }
                
                playSound('hit');
                createParticle(m.x + m.w / 2, m.y + m.h / 2, m.color, 0.5);
                if (m.hp <= 0) {
                    // 掉落錢幣
                    let coins = 1 + Math.floor(Math.random() * 5);
                    if (m.type === 'boss') coins = 50;
                    for(let c=0; c<coins; c++) {
                        spawnDrop(m.x + Math.random()*10, m.y, IDS.COIN);
                    }
                    // 掉落其他物品
                    if(m.type === 'zombie') spawnDrop(m.x, m.y, IDS.IRON_ORE);
                    if(m.type === 'demon_eye') spawnDrop(m.x, m.y, IDS.TORCH);
                    if(m.type === 'skeleton') spawnDrop(m.x, m.y, IDS.IRON_ORE);
                    if(m.type === 'eater') spawnDrop(m.x, m.y, IDS.EBONSTONE);
                    
                    mobs.splice(i, 1);
                    createParticle(m.x + m.w / 2, m.y + m.h / 2, m.color, 1.0);
                }
                mouse.left = false;
                return;
            }
        }
    }

    // 以下是原本的挖掘與放置邏輯 (tx, ty, dx, dy, inRange 已在函數開頭定義)

    if (mouse.left && inRange) {
        let id = getTile(tx, ty);
        
        // 使用捕蟲網
        if (handItem && BLOCKS[handItem.id] && BLOCKS[handItem.id].isNet) {
            // 檢測是否抓到生物
            for (let i = mobs.length - 1; i >= 0; i--) {
                let m = mobs[i];
                // 碰撞檢測 (簡單版：滑鼠點擊位置周圍)
                let dist = Math.sqrt(Math.pow(mouse.worldX - (m.x + m.w/2), 2) + Math.pow(mouse.worldY - (m.y + m.h/2), 2));
                
                if (dist < 40 && m.passive) {
                    mobs.splice(i, 1); // 移除生物
                    playSound('shoot'); // 揮網聲
                    
                    // 給予物品
                    if (m.type === 'bunny') {
                        if (!addToInventory(IDS.ITEM_BUNNY, 1)) {
                            spawnFloatText(player.x, player.y, "背包已滿!", "#ff5252");
                            spawnDrop(player.x, player.y, IDS.ITEM_BUNNY); // 掉落物品
                        }
                    }
                    if (m.type === 'firefly') {
                        if (!addToInventory(IDS.ITEM_FIREFLY, 1)) {
                            spawnFloatText(player.x, player.y, "背包已滿!", "#ff5252");
                            spawnDrop(player.x, player.y, IDS.ITEM_FIREFLY); // 掉落物品
                        }
                    }
                    
                    // 消耗捕蟲網耐久度
                    if (consumeDurability(handItem, 1)) {
                        updateUI();
                    }
                    
                    spawnFloatText(player.x, player.y, "抓到了!", "#4caf50");
                    mouse.left = false;
                    return;
                }
            }
        }
        
        // 1. 鉤爪 (Grappling Hook)
        if (handItem && handItem.id === IDS.GRAPPLING_HOOK) {
            // 只有當鉤爪未啟用時發射
            if (!player.hook.active) {
                // 消耗鉤爪耐久度（每次發射時）
                if (consumeDurability(handItem, 1)) {
                    updateUI();
                    mouse.left = false;
                    return; // 工具損壞
                }
                
                let angle = Math.atan2(mouse.worldY - (player.y+20), mouse.worldX - (player.x+10));
                player.hook.active = true;
                player.hook.state = 1; // 射出
                player.hook.x = player.x + 10;
                player.hook.y = player.y + 20;
                player.hook.vx = Math.cos(angle) * 15;
                player.hook.vy = Math.sin(angle) * 15;
                playSound('shoot');
            }
            mouse.left = false; 
            return;
        }
        
        // 2. 迴旋鏢 (Boomerang)
        // --- 釣魚 (左鍵使用釣竿) ---
        if (handItem && BLOCKS[handItem.id] && BLOCKS[handItem.id].isFishingRod) {
            if (!player.fishing.active) {
                // 1. 拋竿
                let angle = Math.atan2(mouse.worldY - (player.y+20), mouse.worldX - (player.x+10));
                player.fishing.active = true;
                player.fishing.x = player.x + 10;
                player.fishing.y = player.y + 20;
                player.fishing.vx = Math.cos(angle) * 8 + player.vx; // 繼承玩家速度
                player.fishing.vy = Math.sin(angle) * 8 - 2;
                player.fishing.inWater = false;
                player.fishing.biteTimer = 100 + Math.floor(Math.random() * 200); // 隨機等待時間
                player.fishing.catchWindow = 0;
                playSound('shoot');
            } else {
                // 2. 收竿
                if (player.fishing.inWater && player.fishing.catchWindow > 0) {
                    // 成功釣起！
                    let lootId = IDS.RAW_FISH;
                    let rand = Math.random();
                    if (rand < 0.1) lootId = IDS.GOLDEN_CARP; // 10% 黃金魚
                    else if (rand < 0.2) lootId = IDS.TRASH; // 10% 垃圾
                    else if (rand < 0.25) lootId = IDS.WOOD_PICK; // 5% 釣到裝備?
                    
                    spawnDrop(player.x, player.y - 10, lootId);
                    spawnFloatText(player.x, player.y, "釣到了!", "#4caf50");
                    playSound('drink');
                    
                    // 消耗釣竿耐久度（成功釣到時）
                    if (consumeDurability(handItem, 1)) {
                        updateUI();
                    }
                } else {
                    // 沒釣到或單純收回
                }
                player.fishing.active = false;
            }
            mouse.left = false; 
            return;
        }
        
        if (handItem && handItem.id === IDS.BOOMERANG) {
            // 限制一次只能丟一個
            if (!projectiles.some(p => p.type === 'boomerang')) {
                // 消耗迴旋鏢耐久度
                if (consumeDurability(handItem, 1)) {
                    updateUI();
                    mouse.left = false;
                    return; // 武器損壞
                }
                
                let angle = Math.atan2(mouse.worldY - (player.y+20), mouse.worldX - (player.x+10));
                projectiles.push({
                    x: player.x+10, y: player.y+20,
                    vx: Math.cos(angle)*12, vy: Math.sin(angle)*12,
                    damage: 8, type: 'boomerang', angle: angle,
                    returnState: false, // 是否正在飛回
                    timer: 0
                });
                playSound('shoot');
            }
            mouse.left = false;
            return;
        }
        
        // 錘子模式：拆除背景牆 (Wall) 和非放置類物品 - 放在最前面，優先處理
        if (handItem && handItem.id === IDS.HAMMER) {
            let idx = ty * CHUNK_W + tx;
            // 先處理背景牆
            if (walls[idx] !== IDS.AIR) {
                // 檢查是否有覆蓋方塊 (通常要先把前景挖掉才能拆牆，這裡簡化為直接拆)
                let wallId = walls[idx];
                setWall(tx, ty, IDS.AIR); // 拆除
                playSound('mine');
                createParticle(tx*TILE_SIZE, ty*TILE_SIZE, "#555", 0.5);
                
                // 消耗錘子耐久度
                if (consumeDurability(handItem, 1)) {
                    updateUI();
                    mouse.left = false;
                    return; // 工具損壞
                }
                
                // 簡單掉落判定
                if (wallId === IDS.WOOD_WALL) spawnDrop(tx*TILE_SIZE, ty*TILE_SIZE, IDS.WOOD_WALL);
                else if (wallId === IDS.STONE_WALL) spawnDrop(tx*TILE_SIZE, ty*TILE_SIZE, IDS.STONE_WALL);
                else if (wallId === IDS.GLASS_WALL) spawnDrop(tx*TILE_SIZE, ty*TILE_SIZE, IDS.GLASS_WALL);
                else if (wallId === IDS.BRICK_WALL) spawnDrop(tx*TILE_SIZE, ty*TILE_SIZE, IDS.BRICK_WALL);
                
                mouse.left = false;
                return;
            }
            // 處理非放置類物品（寶石、橡實、鑽石等）
            if (id !== IDS.AIR && id !== IDS.BEDROCK && id !== IDS.LAVA && id !== IDS.WATER) {
                let blockDef = BLOCKS[id];
                // 檢查是否為非放置類物品（沒有 solid 或 hardness 很低，且不是工具/武器）
                if (blockDef && !blockDef.solid && (blockDef.breakInstantly || (blockDef.hardness && blockDef.hardness <= 1))) {
                    // 排除工具、武器、裝備等不應該被錘子拆除的物品
                    if (!(id >= 20 && id < 40) && // 工具
                        id !== IDS.WOOD_BOW && id !== IDS.ARROW && // 武器
                        id !== IDS.HELMET_WOOD && id !== IDS.HELMET_IRON && id !== IDS.HELMET_MINER && // 裝備
                        id !== IDS.GRAPPLING_HOOK && id !== IDS.BOOMERANG && id !== IDS.BLADE_OF_GRASS && // 其他工具
                        id !== IDS.MAGIC_STAFF && id !== IDS.STARFURY && // 武器
                        id !== IDS.WOOD_FISHING_ROD && id !== IDS.BUG_NET && // 工具
                        id !== IDS.HAMMER && id !== IDS.PAINT_BRUSH) { // 工具本身
                        playSound('mine');
                        setTile(tx, ty, IDS.AIR);
                        spawnDrop(tx * TILE_SIZE + 10, ty * TILE_SIZE + 10, id);
                        createParticle(tx*TILE_SIZE, ty*TILE_SIZE, blockDef.color || "#555", 0.5);
                        
                        // 消耗錘子耐久度（拆除非放置類物品時）
                        if (consumeDurability(handItem, 1)) {
                            updateUI();
                        }
                        
                        mouse.left = false;
                        return;
                    }
                }
            }
        }
        
        if (id === IDS.TNT) {
            explode(tx, ty);
            mouse.left = false;
            return;
        }
        // 門的破壞：只有用錘子才能破壞門
        if ((id === IDS.DOOR_CLOSED || id === IDS.DOOR_OPEN) && (!handItem || handItem.id !== IDS.HAMMER)) {
            // 沒有用錘子，不能破壞門（只能右鍵開關）
            mouse.left = false;
            return;
        }
        // 如果有錘子，繼續到挖掘邏輯處理（會正常挖掘並掉落門）

        // LOOT_CHEST / SKYWARE_CHEST 不能被挖掘，只能右鍵互動（在右鍵區塊處理）
        if (id === IDS.LOOT_CHEST || id === IDS.SKYWARE_CHEST) {
            mouse.left = false;
            return;
        }
        
        // --- 砸罐子 (陶罐) ---
        if (id === IDS.POT) {
            playSound('hit'); // 破裂聲
            setTile(tx, ty, IDS.AIR);
            createParticle(tx*TILE_SIZE, ty*TILE_SIZE, "#8d6e63", 1.0);
            
            // 隨機掉落
            let rand = Math.random();
            if (rand < 0.4) spawnDrop(tx*TILE_SIZE, ty*TILE_SIZE, IDS.COIN); // 錢
            else if (rand < 0.7) spawnDrop(tx*TILE_SIZE, ty*TILE_SIZE, IDS.ARROW); // 箭矢
            else if (rand < 0.9) { 
                // 掉落治療藥水
                spawnDrop(tx*TILE_SIZE, ty*TILE_SIZE, IDS.HEALTH_POTION); 
            }
            else spawnDrop(tx*TILE_SIZE, ty*TILE_SIZE, IDS.TORCH);
            
            mouse.left = false;
            return;
        }
        
        // --- 拆除傳送門 ---
        if (id === IDS.TELEPORTER) {
            // 從陣列中移除
            let index = teleporters.findIndex(t => t.x === tx && t.y === ty);
            if (index !== -1) {
                let removedName = teleporters[index].name;
                teleporters.splice(index, 1); // 移除
                spawnFloatText(tx*TILE_SIZE, ty*TILE_SIZE, "移除: " + removedName, "#ff5252");
            }
            
            // 執行原本的挖掘掉落邏輯
            playSound('mine');
            setTile(tx, ty, IDS.AIR);
            spawnDrop(tx * TILE_SIZE, ty * TILE_SIZE, IDS.TELEPORTER);
            mouse.left = false;
            return;
        }
        
        // 砍蜘蛛網
        if (id === IDS.COBWEB) {
            playSound('mine'); // 其實應該是割斷的聲音
            setTile(tx, ty, IDS.AIR);
            createParticle(tx*TILE_SIZE, ty*TILE_SIZE, "#e0e0e0", 0.5);
            if (Math.random() < 0.5) spawnDrop(tx*TILE_SIZE, ty*TILE_SIZE, IDS.COBWEB); // 50% 機率掉落
            mouse.left = false;
            return;
        }

        if (id !== IDS.AIR && id !== IDS.BEDROCK && id !== IDS.LAVA && id !== IDS.WATER) {
            if (mining.x !== tx || mining.y !== ty) {
                mining.x = tx;
                mining.y = ty;
                mining.progress = 0;
                mining.active = true;
            }
            let speed = 1.0;
            if (handDef && handDef.toolSpeed) speed = handDef.toolSpeed;
            mining.progress += speed;
            if (Math.random() > 0.5 && BLOCKS[id] && BLOCKS[id].color) createParticle(mouse.worldX, mouse.worldY, BLOCKS[id].color);
            if (mining.progress >= (BLOCKS[id] ? BLOCKS[id].hardness : 10) || (BLOCKS[id] && BLOCKS[id].breakInstantly)) {
                playSound('mine');
                
                // 消耗稿子耐久度（如果是稿子類工具）
                if (handItem && handItem.id >= IDS.WOOD_PICK && handItem.id <= IDS.DIAMOND_PICK) {
                    if (consumeDurability(handItem, 1)) {
                        updateUI();
                        mouse.left = false;
                        return; // 工具損壞，停止挖掘
                    }
                }
                
                // 特殊掉落邏輯
                if (id === IDS.GRASS) {
                    // 挖草必掉草地方块（变成泥土）
                    spawnDrop(tx * TILE_SIZE + 10, ty * TILE_SIZE + 10, IDS.DIRT);
                    if (Math.random() < 0.2) { // 20% 掉種子
                        spawnDrop(tx * TILE_SIZE + 10, ty * TILE_SIZE + 10, IDS.SEEDS);
                    }
                }
                else if (id === IDS.LEAVES) { // 樹葉：必掉樹葉，15%機率額外掉橡實，10%機率額外掉樹苗
                    spawnDrop(tx * TILE_SIZE + 10, ty * TILE_SIZE + 10, IDS.LEAVES); // 必掉樹葉
                    if (Math.random() < 0.15) { // 15% 機率掉橡實
                        spawnDrop(tx * TILE_SIZE, ty * TILE_SIZE, IDS.ACORN);
                    }
                    if (Math.random() < 0.1) { // 10% 機率掉樹苗
                        spawnDrop(tx * TILE_SIZE, ty * TILE_SIZE, IDS.SAPLING);
                    }
                }
                else if (id === IDS.SAPLING) { // 樹苗：必掉樹苗
                    spawnDrop(tx * TILE_SIZE + 10, ty * TILE_SIZE + 10, IDS.SAPLING);
                }
                else if (id === IDS.WHEAT_CROP) { // 收割小麥
                    spawnDrop(tx * TILE_SIZE, ty * TILE_SIZE, IDS.WHEAT);
                    if(Math.random() < 0.5) spawnDrop(tx * TILE_SIZE, ty * TILE_SIZE, IDS.SEEDS); // 有機率回收種子
                }
                else if (id === IDS.WHEAT_RIPE) { 
                    spawnDrop(tx * TILE_SIZE, ty * TILE_SIZE, IDS.WHEAT); // 掉小麥
                    spawnDrop(tx * TILE_SIZE, ty * TILE_SIZE, IDS.SEEDS); // 必掉種子
                }
                else if (id === IDS.WOOD) { // 砍樹：必掉原木，30%機率額外掉橡實
                    spawnDrop(tx * TILE_SIZE + 10, ty * TILE_SIZE + 10, IDS.WOOD); // 必掉原木
                    if (Math.random() < 0.3) { // 30% 機率掉橡實
                        spawnDrop(tx * TILE_SIZE, ty * TILE_SIZE, IDS.ACORN);
                    }
                }
                // 寶石礦掉落寶石
                else if (id === IDS.RUBY_ORE) {
                    spawnDrop(tx * TILE_SIZE + 10, ty * TILE_SIZE + 10, IDS.RUBY);
                }
                else if (id === IDS.SAPPHIRE_ORE) {
                    spawnDrop(tx * TILE_SIZE + 10, ty * TILE_SIZE + 10, IDS.SAPPHIRE);
                }
                else if (id === IDS.EMERALD_ORE) {
                    spawnDrop(tx * TILE_SIZE + 10, ty * TILE_SIZE + 10, IDS.EMERALD);
                }
                // 門的掉落（破壞時掉落門本身）- 兩格高的門需要同時破壞
                else if (id === IDS.DOOR_CLOSED || id === IDS.DOOR_OPEN) {
                    // 檢查上方是否有門
                    let aboveId = (ty > 0) ? getTile(tx, ty - 1) : IDS.AIR;
                    let belowId = (ty < CHUNK_H - 1) ? getTile(tx, ty + 1) : IDS.AIR;
                    
                    // 如果上方是門，這是門的下半部分，同時破壞上方
                    if (aboveId === IDS.DOOR_CLOSED || aboveId === IDS.DOOR_OPEN) {
                        setTile(tx, ty - 1, IDS.AIR);
                    }
                    // 如果下方是門，這是門的上半部分，同時破壞下方
                    if (belowId === IDS.DOOR_CLOSED || belowId === IDS.DOOR_OPEN) {
                        setTile(tx, ty + 1, IDS.AIR);
                    }
                    
                    // 只掉落一個門（避免重複掉落）
                    spawnDrop(tx * TILE_SIZE + 10, ty * TILE_SIZE + 10, IDS.DOOR_CLOSED); // 掉落關閉的門
                }
                // --- 箱子破壞處理（必須在 setTile 之前）---
                else if (id === IDS.CHEST) {
                    // 檢查箱子內是否有物品
                    let chestKey = `${tx}_${ty}`;
                    let chestItems = chestData[chestKey];
                    if (chestItems && Array.isArray(chestItems)) {
                        // 掉落箱子內的所有物品
                        chestItems.forEach(item => {
                            if (item && item.id !== IDS.AIR && item.count > 0) {
                                // 根據數量掉落多個物品
                                for (let i = 0; i < item.count; i++) {
                                    let offsetX = (Math.random() - 0.5) * 20;
                                    let offsetY = (Math.random() - 0.5) * 20;
                                    let drop = {
                                        x: tx * TILE_SIZE + 10 + offsetX,
                                        y: ty * TILE_SIZE + 10 + offsetY,
                                        w: 12,
                                        h: 12,
                                        vx: (Math.random() - 0.5) * 4,
                                        vy: -3,
                                        id: item.id,
                                        life: 3000,
                                        spawnTime: frameCount
                                    };
                                    // 如果有耐久度，複製耐久度
                                    if (item.durability !== undefined) {
                                        drop.durability = item.durability;
                                    }
                                    drops.push(drop);
                                }
                            }
                        });
                        // 清除箱子數據
                        delete chestData[chestKey];
                    }
                    // 掉落箱子本身
                    spawnDrop(tx * TILE_SIZE + 10, ty * TILE_SIZE + 10, IDS.CHEST);
                }
                // 原本的掉落邏輯 (確保其他方塊還會掉東西)
                // 排除：
                // - GRASS(不是方块，只掉种子), LEAVES(已處理), SAPLING(已處理), WHEAT_CROP/WHEAT_RIPE(特殊掉落), WOOD(已處理)
                // - POT(已處理，提前return), TELEPORTER(已處理，提前return), COBWEB(已處理，提前return)
                // - DOOR_CLOSED/DOOR_OPEN(已處理，上面已處理), LOOT_CHEST(已處理，提前return), SKYWARE_CHEST(已處理，提前return)
                // - CHEST(已處理，上面已處理), SIGN(右鍵讀取，但左鍵挖掘應該掉落)
                // - AIR, BEDROCK, WATER, LAVA(不應該掉落)
                else if (id !== IDS.GRASS && id !== IDS.LEAVES && id !== IDS.SAPLING && id !== IDS.WHEAT_CROP && id !== IDS.WHEAT_RIPE && id !== IDS.WOOD && id !== IDS.POT && id !== IDS.TELEPORTER && id !== IDS.COBWEB && id !== IDS.DOOR_CLOSED && id !== IDS.DOOR_OPEN && id !== IDS.LOOT_CHEST && id !== IDS.SKYWARE_CHEST && id !== IDS.CHEST && id !== IDS.AIR && id !== IDS.BEDROCK && id !== IDS.WATER && id !== IDS.LAVA) {
                spawnDrop(tx * TILE_SIZE + 10, ty * TILE_SIZE + 10, id);
                }
                
                setTile(tx, ty, IDS.AIR);
                mining.active = false;
            }
        }
    } else mining.active = false;

    if (mouse.right && inRange) {
        // 先取得目標方塊ID（所有右鍵邏輯都需要）
        let id = getTile(tx, ty);

        // --- 商人互動（右鍵） ---
        // 說明：將原本在函式開頭處理商人的區塊搬到這裡，
        // 統一所有「互動元素」都由右鍵觸發。
        let clickedMerchant = null;
        for(let m of mobs) {
            if (m.type === 'merchant' && m.x !== undefined && m.y !== undefined && m.w !== undefined && m.h !== undefined) {
                // 檢查玩家與商人的距離（使用圓形距離）
                let merchantCenterX = m.x + m.w / 2;
                let merchantCenterY = m.y + m.h / 2;
                let playerCenterX = player.x + player.w / 2;
                let playerCenterY = player.y + player.h / 2;
                let distX = merchantCenterX - playerCenterX;
                let distY = merchantCenterY - playerCenterY;
                let distToMerchant = Math.sqrt(distX * distX + distY * distY);
                if (distToMerchant > MINING_RANGE * TILE_SIZE) continue;
                let clickRange = 10;
                if (mouse.worldX >= m.x - clickRange && mouse.worldX <= m.x + m.w + clickRange && 
                    mouse.worldY >= m.y - clickRange && mouse.worldY <= m.y + m.h + clickRange) {
                    clickedMerchant = m;
                    break;
                }
            }
        }
        if (clickedMerchant) {
            isMerchantOpen = !isMerchantOpen;
            updateMerchantUI();
            playSound('drink');
            mouse.right = false; 
            return;
        }

        // 互動：箱子 / 天域寶箱 / 野外寶箱（LOOT_CHEST / SKYWARE_CHEST）
        if (id === IDS.CHEST) {
            toggleChest(tx, ty);
            mouse.right = false;
            return;
        }
        if (id === IDS.LOOT_CHEST || id === IDS.SKYWARE_CHEST) {
            // 探索寶箱：只開一次，打開後直接掉落獎勵並清空方塊
            if (typeof openLootChest === 'function') {
                openLootChest(tx, ty, id);
            }
            mouse.right = false;
            return;
        }
        
        // 門開關 (右鍵切換) - 兩格高的門需要同時切換
        if (id === IDS.DOOR_CLOSED || id === IDS.DOOR_OPEN) {
            // 檢查上方是否有門（可能是門的上半部分）
            let aboveId = getTile(tx, ty - 1);
            let belowId = getTile(tx, ty + 1);
            
            // 如果上方是門，則這是門的下半部分，切換上方和當前
            if (aboveId === IDS.DOOR_CLOSED || aboveId === IDS.DOOR_OPEN) {
                if (aboveId === IDS.DOOR_CLOSED) {
                    setTile(tx, ty - 1, IDS.DOOR_OPEN);
                } else {
                    setTile(tx, ty - 1, IDS.DOOR_CLOSED);
                }
                if (id === IDS.DOOR_CLOSED) {
                    setTile(tx, ty, IDS.DOOR_OPEN);
                } else {
                    setTile(tx, ty, IDS.DOOR_CLOSED);
                }
            }
            // 如果下方是門，則這是門的上半部分，切換當前和下方
            else if (belowId === IDS.DOOR_CLOSED || belowId === IDS.DOOR_OPEN) {
                if (id === IDS.DOOR_CLOSED) {
                    setTile(tx, ty, IDS.DOOR_OPEN);
                } else {
                    setTile(tx, ty, IDS.DOOR_CLOSED);
                }
                if (belowId === IDS.DOOR_CLOSED) {
                    setTile(tx, ty + 1, IDS.DOOR_OPEN);
                } else {
                    setTile(tx, ty + 1, IDS.DOOR_CLOSED);
                }
            }
            // 單獨的門（舊存檔兼容），只切換當前
            else {
                if (id === IDS.DOOR_CLOSED) {
                    setTile(tx, ty, IDS.DOOR_OPEN);
                } else {
                    setTile(tx, ty, IDS.DOOR_CLOSED);
                }
            }
            playSound('mine');
            mouse.right = false;
            return;
        }
        
        // 使用魔力水晶
        if (handItem && handItem.id === IDS.MANA_CRYSTAL) {
            // 设置魔力上限最大值（例如200），避免无限叠加
            const MAX_MANA_LIMIT = 200;
            if (player.maxMana < MAX_MANA_LIMIT) {
                let oldMax = player.maxMana;
                player.maxMana = Math.min(player.maxMana + 20, MAX_MANA_LIMIT);
                player.mana = Math.min(player.mana + (player.maxMana - oldMax), player.maxMana);
                handItem.count--;
                if (handItem.count <= 0) {
                    handItem.id = IDS.AIR;
                    handItem.count = 0;
                }
                spawnFloatText(player.x, player.y, `魔力上限提升! (${player.maxMana}/${MAX_MANA_LIMIT})`, "#2979ff");
                updateHealthUI(); 
                updateUI();
            } else {
                spawnFloatText(player.x, player.y, "魔力上限已達最大值!", "#999");
            }
            mouse.right = false;
            return;
        }
        
        // 1. 吃食物 (生魚、麵包、熟魚、魚湯)
        if (handItem && (handItem.id === IDS.RAW_FISH || handItem.id === IDS.BREAD || handItem.id === IDS.COOKED_FISH || handItem.id === IDS.SOUP)) {
            let info = BLOCKS[handItem.id];
            let hasEffect = false;
            
            // 補血（只有未满血时才有效果）
            if (player.hp < player.maxHp && info.heal) {
                player.hp = Math.min(player.hp + info.heal, player.maxHp);
                updateHealthUI();
                hasEffect = true;
            }
            
            // 獲得 Buff (熟魚和魚湯) - 只在新buff时间更长时才更新，避免覆盖更长的buff
            if (info.buffTime) {
                // 如果新buff时间更长，才更新（避免用短buff覆盖长buff）
                if (!player.buffs.wellFed || info.buffTime > player.buffs.wellFed) {
                    player.buffs.wellFed = info.buffTime;
                    spawnFloatText(player.x, player.y, "美味!", "#ffcc80");
                    hasEffect = true;
                } else {
                    spawnFloatText(player.x, player.y, "已有更長的buff!", "#ffcc80");
                }
            } else if (hasEffect) {
                spawnFloatText(player.x, player.y, "+" + info.heal + " HP", "#4caf50");
            }
            
            // 只有有效果时才消耗物品（避免满血时浪费食物）
            if (hasEffect || info.buffTime) {
                playSound('drink');
                handItem.count--;
                if (handItem.count <= 0) {
                    handItem.id = IDS.AIR;
                    handItem.count = 0;
                }
                updateUI();
            } else {
                spawnFloatText(player.x, player.y, "生命值已滿!", "#999");
            }
            mouse.right = false;
            return;
        }
        
        // 1. 放置告示牌 (輸入文字，右鍵互動：視為互動元素的一種)
        if (handItem && handItem.id === IDS.SIGN) {
            if (id === IDS.AIR || id === IDS.GRASS) { // 允許插在草上
                let text = prompt("請輸入告示牌文字:", "這裡有寶藏");
                if (text) {
                    setTile(tx, ty, IDS.SIGN);
                    signData[`${tx}_${ty}`] = text; // 儲存文字
                    handItem.count--;
                    if (handItem.count <= 0) {
                        handItem.id = IDS.AIR;
                        handItem.count = 0;
                    }
                    updateUI();
                    mouse.right = false; 
                    return;
                }
            }
        }
        
        // 2. 閱讀告示牌 (右鍵互動，不消耗物品)
        if (id === IDS.SIGN) {
            let text = signData[`${tx}_${ty}`] || "空白";
            spawnFloatText(tx*TILE_SIZE, ty*TILE_SIZE, text, "#fff");
            mouse.right = false; 
            return;
        }
        
        // 3. 閱讀墓碑（右鍵互動，不消耗物品）
        if (id === IDS.TOMBSTONE) {
            spawnFloatText(tx*TILE_SIZE, ty*TILE_SIZE, "R.I.P.", "#bdbdbd");
            mouse.right = false;
            return;
        }
        
        // 4. 刷油漆 (Paint Brush，右鍵互動）
        if (handItem && handItem.id === IDS.PAINT_BRUSH) {
            // 檢查背包有沒有油漆
            let paintItem = player.inventory.find(i => BLOCKS[i.id] && BLOCKS[i.id].isPaint);
            if (paintItem) {
                let colorId = BLOCKS[paintItem.id].isPaint; // 1, 2, 3
                let idx = ty * CHUNK_W + tx;
                
                // 可以染方塊 或 染牆壁
                if (tiles[idx] !== IDS.AIR || walls[idx] !== IDS.AIR) {
                    if (tileColors[idx] !== colorId) { // 如果顏色不同才染
                        tileColors[idx] = colorId;
                        paintItem.count--; // 消耗油漆
                        if (paintItem.count <= 0) {
                            paintItem.id = IDS.AIR;
                            paintItem.count = 0;
                        }
                        
                        // 消耗油漆刷耐久度
                        if (consumeDurability(handItem, 1)) {
                            updateUI();
                            mouse.right = false;
                            return; // 工具損壞
                        }
                        
                        createParticle(mouse.worldX, mouse.worldY, BLOCKS[paintItem.id].color, 0.5);
                        playSound('slime'); // 濕濕的聲音
                        updateUI();
                    }
                }
            } else {
                spawnFloatText(player.x, player.y, "需要油漆!", "#fff");
            }
            mouse.right = false; 
            return;
        }
        
        // --- 在花盆上種花 ---
        if (handItem && handItem.id === IDS.FLOWER) {
            if (id === IDS.CLAY_POT) {
                spawnFloatText(tx*TILE_SIZE, ty*TILE_SIZE, "好香!", "#e91e63");
                handItem.count--;
                if (handItem.count <= 0) {
                    handItem.id = IDS.AIR;
                    handItem.count = 0;
                }
                updateUI();
                mouse.right = false; 
                return;
            }
        }
        
        // 2. 鋤頭 (將泥土/草地 變成 耕地)
        if (handItem && handItem.id === IDS.HOE) {
            if (id === IDS.DIRT || id === IDS.GRASS) {
                setTile(tx, ty, IDS.TILLED_DIRT);
                playSound('mine');
                createParticle(tx*TILE_SIZE, ty*TILE_SIZE, "#4e342e", 0.5);
                mouse.right = false; 
                return;
            }
        }
        
        // 3. 種種子 (只能種在耕地上)
        if (handItem && handItem.id === IDS.SEEDS) {
            if (id === IDS.TILLED_DIRT) {
                // 確保上方是空氣
                if (getTile(tx, ty-1) === IDS.AIR) {
                    setTile(tx, ty-1, IDS.WHEAT_CROP);
                    handItem.count--;
                    if (handItem.count <= 0) {
                        handItem.id = IDS.AIR;
                        handItem.count = 0;
                    }
                    updateUI();
                    mouse.right = false; 
                    return;
                }
            }
        }
        
        // 4. 種橡實 (種樹)
        if (handItem && handItem.id === IDS.ACORN) {
            if (id === IDS.GRASS || id === IDS.DIRT) {
                if (getTile(tx, ty-1) === IDS.AIR) {
                    setTile(tx, ty-1, IDS.SAPLING); // 變回原本的樹苗
                    handItem.count--;
                    if (handItem.count <= 0) {
                        handItem.id = IDS.AIR;
                        handItem.count = 0;
                    }
                    updateUI();
                    mouse.right = false; 
                    return;
                }
            }
        }
        
        // 釋放生物
        if (handItem && (handItem.id === IDS.ITEM_BUNNY || handItem.id === IDS.ITEM_FIREFLY)) {
            let type = (handItem.id === IDS.ITEM_BUNNY) ? 'bunny' : 'firefly';
            spawnMob(mouse.worldX, mouse.worldY, type);
            handItem.count--;
            if (handItem.count <= 0) {
                handItem.id = IDS.AIR;
                handItem.count = 0;
            }
            updateUI();
            mouse.right = false;
            return;
        }
        
        // 召喚寵物 (胡蘿蔔)
        if (handItem && handItem.id === IDS.CARROT) {
            player.pet.active = !player.pet.active; // 切換開關
            if (player.pet.active) {
                player.pet.x = player.x;
                player.pet.y = player.y;
                player.pet.type = 'bunny';
                spawnFloatText(player.x, player.y, "寵物出來了!", "#ff9800");
            } else {
                spawnFloatText(player.x, player.y, "寵物休息了", "#ccc");
            }
            mouse.right = false;
            return;
        }
        
        // 喝藥水 (敏捷藥水、光芒藥水)
        if (handItem && (handItem.id === IDS.POTION_SWIFTNESS || handItem.id === IDS.POTION_SHINE)) {
            let info = BLOCKS[handItem.id];
            let buffUpdated = false;
            
            // 只在新buff时间更长时才更新，避免覆盖更长的buff
            if (handItem.id === IDS.POTION_SWIFTNESS) {
                if (!player.buffs.swiftness || info.buffTime > player.buffs.swiftness) {
                    player.buffs.swiftness = info.buffTime;
                    buffUpdated = true;
                } else {
                    spawnFloatText(player.x, player.y, "已有更長的敏捷buff!", "#76ff03");
                }
            }
            if (handItem.id === IDS.POTION_SHINE) {
                if (!player.buffs.shine || info.buffTime > player.buffs.shine) {
                    player.buffs.shine = info.buffTime;
                    buffUpdated = true;
                } else {
                    spawnFloatText(player.x, player.y, "已有更長的光芒buff!", "#ffeb3b");
                }
            }
            
            // 只有buff更新时才消耗物品
            if (buffUpdated) {
                spawnFloatText(player.x, player.y, "藥水生效!", BLOCKS[handItem.id].color);
                playSound('drink');
                handItem.count--;
                if (handItem.count <= 0) {
                    handItem.id = IDS.AIR;
                    handItem.count = 0;
                }
                updateUI();
            }
            mouse.right = false;
            return;
        }
        
        // 1. 喝藥水 (治療藥水)
        if (handItem && handItem.id === IDS.HEALTH_POTION) {
            if (player.hp < player.maxHp) {
                player.hp = Math.min(player.hp + BLOCKS[IDS.HEALTH_POTION].heal, player.maxHp);
                handItem.count--;
                if (handItem.count <= 0) {
                    handItem.id = IDS.AIR;
                    handItem.count = 0;
                }
                updateHealthUI(); 
                updateUI();
                spawnFloatText(player.x, player.y, "+3 HP", "#4caf50");
                playSound('mine'); // 暫用音效
            }
            mouse.right = false; 
            return;
        }
        
        // 5. 裝備頭盔
        if (handItem && BLOCKS[handItem.id] && BLOCKS[handItem.id].isArmor) {
            // 檢查頭盔是否有耐久度且已損壞
            if (handItem.durability !== undefined && handItem.durability <= 0) {
                spawnFloatText(player.x, player.y, "頭盔已損壞!", "#ff5252");
                mouse.right = false;
                return;
            }
            
            // 原本的簡單交換邏輯：手中的頭盔 ↔ 裝備槽的頭盔
            let oldHead = player.equip.head;
            let oldHeadDefense = (oldHead !== 0 && oldHead !== IDS.AIR && BLOCKS[oldHead]) ? (BLOCKS[oldHead].defense || 0) : 0;
            let newHeadDefense = BLOCKS[handItem.id] ? (BLOCKS[handItem.id].defense || 0) : 0;
            
            // 如果已經裝備了頭盔，且新頭盔防禦力更低，提示但不阻止（讓玩家自己決定）
            if (oldHead !== 0 && oldHead !== IDS.AIR && newHeadDefense < oldHeadDefense) {
                spawnFloatText(player.x, player.y, "新頭盔防禦力較低", "#ff9800");
            }
            
            // 執行交換：手中的頭盔 → 裝備槽，裝備槽的頭盔 → 手中
            player.equip.head = handItem.id;
            handItem.id = (oldHead === 0 || oldHead === IDS.AIR) ? IDS.AIR : oldHead;
            if (handItem.id === IDS.AIR) {
                handItem.count = 0;
                handItem.durability = undefined;
            } else {
                // 如果交換回來的頭盔有耐久度定義，初始化耐久度（如果沒有設置）
                if (BLOCKS[handItem.id] && BLOCKS[handItem.id].durability && handItem.durability === undefined) {
                    handItem.durability = BLOCKS[handItem.id].durability;
                }
            }
            
            updateUI(); 
            playSound('mine');
            mouse.right = false; 
            return;
        }
        
        // 2. 開啟天域寶箱（id 已在函數開頭定義）
        if (id === IDS.SKYWARE_CHEST) {
            playSound('mine'); 
            setTile(tx, ty, IDS.AIR);
            createParticle(tx*TILE_SIZE, ty*TILE_SIZE, "#0288d1", 1.0);
            spawnDrop(tx*TILE_SIZE, ty*TILE_SIZE, IDS.STARFURY); // 必掉星怒
            spawnDrop(tx*TILE_SIZE, ty*TILE_SIZE, IDS.GOLD_BAR);
            mouse.right = false; 
            return;
        }
        
        if (id === IDS.BED) {
            spawnPoint.x = player.x;
            spawnPoint.y = player.y;
            alert("重生點已設置！");
            let time = gameTime / DAY_LEN;
            // 6点~18点是白天（time >= 0.25 && time < 0.75），其他时间是夜晚
            // 如果是夜晚，睡觉会跳到早上
            if (time < 0.25 || time >= 0.75) {
                gameTime = 18000; // 跳到早上6点（72000 * 0.25 = 18000）
                alert("你睡了一覺，天亮了。");
            }
            mouse.right = false;
            return;
        }
        // 玩家合成的箱子（仓库）- 打开存储界面
        if (id === IDS.CHEST) { 
            toggleChest(tx, ty); 
            mouse.right = false; 
            return; 
        }
        // 探索宝箱（LOOT_CHEST）- 打开后消失并掉落随机物品
        if (id === IDS.LOOT_CHEST) {
            playSound('mine'); // 播放打开音效
            setTile(tx, ty, IDS.AIR);
            createParticle(tx * TILE_SIZE, ty * TILE_SIZE, "#ff6f00", 1.0);
            // 掉落 2-4 个随机物品
            let loot = [IDS.TORCH, IDS.IRON_BAR, IDS.GOLD_BAR, IDS.DIAMOND, IDS.ARROW, IDS.TNT, IDS.COAL_ORE, IDS.IRON_ORE, IDS.GOLD_ORE];
            let dropCount = 2 + Math.floor(Math.random() * 3); // 2-4 个物品
            for (let i = 0; i < dropCount; i++) {
                let offsetX = (Math.random() - 0.5) * 20;
                let offsetY = (Math.random() - 0.5) * 20;
                spawnDrop(tx * TILE_SIZE + offsetX, ty * TILE_SIZE + offsetY, loot[Math.floor(Math.random() * loot.length)]);
            }
            mouse.right = false;
            return;
        }

        // --- 建造傳送門 ---
        if (handItem && handItem.id === IDS.TELEPORTER) {
            if (id === IDS.AIR || (BLOCKS[id] && BLOCKS[id].transparent)) {
                // 1. 檢查數量限制
                if (teleporters.length >= 5) {
                    spawnFloatText(player.x, player.y, "傳送門數量已達上限 (5個)！", "#ff5252");
                    mouse.right = false; 
                    return;
                }
                
                // 2. 強制命名
                let name = prompt("請為此傳送點命名 (例如: 家, 礦坑):");
                
                if (name && name.trim() !== "") {
                    name = name.trim();
                    // 檢查名字是否重複
                    if (teleporters.some(t => t.name === name)) {
                        spawnFloatText(player.x, player.y, "名稱已存在，請換一個。", "#ff5252");
                        mouse.right = false;
                        return;
                    }

                    setTile(tx, ty, IDS.TELEPORTER);
                    teleporters.push({ x: tx, y: ty, name: name });
                    handItem.count--;
                    if (handItem.count <= 0) {
                        handItem.id = IDS.AIR;
                        handItem.count = 0;
                    }
                    updateUI();
                    spawnFloatText(tx*TILE_SIZE, ty*TILE_SIZE, "傳送點建立: " + name, "#00e5ff");
                } else {
                    // 取消命名則不建造
                    spawnFloatText(player.x, player.y, "必須命名才能建造！", "#ff5252");
                }
                mouse.right = false; 
                return;
            }
        }

        if (handItem && handItem.count > 0) {
            let def = BLOCKS[handItem.id];
            if (!def) return;
            let targetBlock = BLOCKS[id];
            if (!targetBlock) targetBlock = BLOCKS[IDS.AIR]; // 安全檢查
            
            if (def.isWall) {
                if (id === IDS.AIR || (targetBlock && targetBlock.transparent)) {
                    setWall(tx, ty, handItem.id);
                    handItem.count--;
                    updateUI();
                    mouse.right = false;
                }
            } else {
                // 檢查是否可以放置方塊
                // 規則：1. 目標必須是空氣才能放置（基本規則）
                //       2. 例外：岩漿和水可以互相取代
                let canPlace = false;
                
                if (id === IDS.AIR) {
                    // 目標是空氣，可以放置
                    canPlace = true;
                } else if ((handItem.id === IDS.WATER || handItem.id === IDS.LAVA) && 
                           (id === IDS.WATER || id === IDS.LAVA)) {
                    // 例外：手持岩漿或水時，可以取代目標位置的岩漿或水
                    canPlace = true;
                }
                
                if (canPlace) {
                    let bx = tx * TILE_SIZE,
                        by = ty * TILE_SIZE;
                    let collides = false;
                    if (handItem.id === IDS.SAPLING) {
                        let belowId = getTile(tx, ty + 1);
                        if (belowId !== IDS.GRASS && belowId !== IDS.DIRT) return;
                    }
                    if ((handItem.id >= 20 && handItem.id < 40) || handItem.id === IDS.WOOD_BOW || handItem.id === IDS.ARROW) return;
                    if (def.solid) {
                        if (rectIntersect({ x: bx, y: by, w: TILE_SIZE, h: TILE_SIZE }, player)) collides = true;
                        for (let m of mobs)
                            if (rectIntersect({ x: bx, y: by, w: TILE_SIZE, h: TILE_SIZE }, m)) collides = true;
                    }
                    if (!collides) {
                        // 特殊處理：門需要兩格高
                        if (handItem.id === IDS.DOOR_CLOSED) {
                            // 檢查下方是否也是空氣，且可以放置
                            let belowId = getTile(tx, ty + 1);
                            if (belowId === IDS.AIR) {
                                // 檢查下方是否有碰撞
                                let belowCollides = false;
                                let belowBx = tx * TILE_SIZE;
                                let belowBy = (ty + 1) * TILE_SIZE;
                                if (rectIntersect({ x: belowBx, y: belowBy, w: TILE_SIZE, h: TILE_SIZE }, player)) belowCollides = true;
                                for (let m of mobs) {
                                    if (rectIntersect({ x: belowBx, y: belowBy, w: TILE_SIZE, h: TILE_SIZE }, m)) belowCollides = true;
                                }
                                
                                if (!belowCollides) {
                                    // 同時放置上下兩個門
                                    setTile(tx, ty, IDS.DOOR_CLOSED);
                                    setTile(tx, ty + 1, IDS.DOOR_CLOSED);
                                    handItem.count--;
                                    updateUI();
                                    mouse.right = false;
                                } else {
                                    spawnFloatText(player.x, player.y, "門下方有障礙物!", "#ff5252");
                                }
                            } else {
                                spawnFloatText(player.x, player.y, "門需要兩格高的空間!", "#ff5252");
                            }
                        } else {
                            // 其他方塊正常放置
                            setTile(tx, ty, handItem.id);
                            handItem.count--;
                            updateUI();
                            mouse.right = false;
                        }
                    }
                }
            }
        }
    }
}

// 消耗工具/武器耐久度
function consumeDurability(item, amount = 1) {
    if (!item || item.id === IDS.AIR || !BLOCKS[item.id]) return false;
    let def = BLOCKS[item.id];
    if (!def.durability) return false; // 沒有耐久度的物品不需要消耗
    
    // 初始化耐久度（如果還沒有設置）
    if (item.durability === undefined) {
        item.durability = def.durability;
    }
    
    // 消耗耐久度
    item.durability -= amount;
    
    // 如果耐久度歸零或以下，將物品設為空氣
    if (item.durability <= 0) {
        item.id = IDS.AIR;
        item.count = 0;
        item.durability = undefined;
        spawnFloatText(player.x, player.y - 20, "工具損壞!", "#ff5252");
        return true; // 返回 true 表示物品已損壞
    }
    
    return false; // 返回 false 表示物品還可以使用
}

function addToInventory(id, count, durability) {
    // 防止添加无效物品
    if (!id || id === IDS.AIR || count <= 0) return false; // 返回 false 表示添加失敗
    
    // 驗證物品ID是否有效
    if (!BLOCKS[id]) {
        console.warn(`[addToInventory] 無效的物品ID: ${id}`);
        return false;
    }
    
    // 檢查物品是否有耐久度
    let hasDurability = BLOCKS[id] && BLOCKS[id].durability;
    
    // 如果有耐久度，不能疊加，必須放在新槽位
    if (hasDurability) {
        // 查找空槽位
        let empty = player.inventory.find(s => s.id === IDS.AIR || (s.id === IDS.AIR && s.count === 0));
        if(empty) {
            empty.id = id;
            empty.count = Math.min(count, 999);
            // 如果傳入了耐久度參數，使用傳入的值；否則初始化為最大值
            if (durability !== undefined && durability !== null) {
                empty.durability = durability;
            } else {
                empty.durability = BLOCKS[id].durability;
            }
            updateUI();
            return true; // 成功添加
        } else {
            // 背包已满，返回 false，不顯示提示（由調用者決定是否顯示）
            return false;
        }
    }
    
    // 沒有耐久度的物品可以疊加
    let found = player.inventory.find(s => s.id === id && s.count > 0);
    if(found) {
        found.count += count;
        // 防止物品数量溢出（设置一个合理的上限，例如999）
        const MAX_STACK_SIZE = 999;
        if (found.count > MAX_STACK_SIZE) {
            found.count = MAX_STACK_SIZE;
        }
        updateUI();
        return true; // 成功添加
    } else {
        // 查找真正的空槽位（id 为 AIR 或 count 为 0）
        let empty = player.inventory.find(s => s.id === IDS.AIR || (s.id === IDS.AIR && s.count === 0));
        if(empty) {
            empty.id = id;
            empty.count = Math.min(count, 999); // 限制单次添加的最大数量
            // 如果是工具/武器，初始化耐久度
            if (BLOCKS[id] && BLOCKS[id].durability) {
                // 如果傳入了耐久度參數，使用傳入的值；否則初始化為最大值
                if (durability !== undefined && durability !== null) {
                    empty.durability = durability;
                } else {
                    empty.durability = BLOCKS[id].durability;
                }
            }
            updateUI();
            return true; // 成功添加
        } else {
            // 背包已满，返回 false，不顯示提示（由調用者決定是否顯示）
            return false;
        }
    }
}

// UI 
function toggleCrafting() { 
    isCraftingOpen = !isCraftingOpen; 
    let menu = document.getElementById('crafting-menu');
    if (menu) menu.style.display = isCraftingOpen ? 'flex' : 'none';
    if (isCraftingOpen) { 
        currentCraftTab = 'basic'; 
        switchTab('basic'); 
    } 
}
// 方便除錯：將函數掛到 window，方便在 Console 直接呼叫
try { if (typeof window !== 'undefined') window.toggleCrafting = toggleCrafting; } catch(_) {}
function switchTab(type) { 
    currentCraftTab = type; 
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active')); 
    const tabs = document.querySelectorAll('.tab'); 
    if(type === 'basic' && tabs[0]) tabs[0].classList.add('active'); 
    else if(type === 'tool' && tabs[1]) tabs[1].classList.add('active'); 
    else if(type === 'build' && tabs[2]) tabs[2].classList.add('active'); 
    updateRecipeGrid(); 
    let detailIcon = document.getElementById('detail-icon');
    if (detailIcon) detailIcon.innerHTML = '';
    let detailName = document.getElementById('detail-name');
    if (detailName) detailName.innerText = "選擇配方";
    let detailCost = document.getElementById('detail-cost');
    if (detailCost) detailCost.innerHTML = '';
    let craftBtn = document.getElementById('craft-btn');
    if (craftBtn) craftBtn.disabled = true;
    selectedRecipeIdx = -1; 
}
function updateRecipeGrid() { 
    const grid = document.getElementById('recipe-grid'); 
    if (!grid) return; // 防止元素不存在
    grid.innerHTML = ''; 
    let filteredRecipes = RECIPES.map((r, i) => ({...r, originalIdx: i})).filter(r => r.type === currentCraftTab); 
    filteredRecipes.forEach(r => { 
        if (!BLOCKS[r.out.id]) return; // 防止未定义的ID
        let div = document.createElement('div'); 
        div.className = 'recipe-slot'; 
        let cvs = document.createElement('canvas'); 
        cvs.width=32; 
        cvs.height=32; 
        let c = cvs.getContext('2d'); 
        if(BLOCKS[r.out.id] && BLOCKS[r.out.id].icon) c.drawImage(BLOCKS[r.out.id].icon, 0, 0); 
        else { 
            c.fillStyle = (BLOCKS[r.out.id] && BLOCKS[r.out.id].color) || '#fff'; 
            c.fillRect(0,0,32,32); 
        } 
        div.appendChild(cvs); 
        div.onclick = () => selectRecipe(r.originalIdx); 
        let canCraft = true; 
        if (r.station && !isNearStation(r.station)) canCraft = false; 
        r.cost.forEach(costItem => { 
            if (!BLOCKS[costItem.id]) {
                canCraft = false; // 如果材料ID未定义，标记为无法合成
                return;
            }
            // 檢查材料數量（考慮耐久度物品的特殊情況）
            let hasDurability = BLOCKS[costItem.id] && BLOCKS[costItem.id].durability;
            let has = 0;
            if (hasDurability) {
                // 有耐久度的物品不能疊加，每個都是獨立的
                has = player.inventory.filter(i => i.id === costItem.id && i.count > 0).length;
            } else {
                // 沒有耐久度的物品可以疊加，計算總數量
                let item = player.inventory.find(i => i.id === costItem.id);
                has = item ? item.count : 0;
            }
            if (has < costItem.count) canCraft = false; 
        }); 
        if(!canCraft) div.classList.add('cannot-craft'); 
        if(selectedRecipeIdx === r.originalIdx) div.classList.add('selected'); 
        grid.appendChild(div); 
    }); 
}
function selectRecipe(idx) { 
    selectedRecipeIdx = idx; 
    let r = RECIPES[idx]; 
    if (!r || !BLOCKS[r.out.id]) return; // 防止未定义的ID
    
    // 获取当前过滤后的配方列表（用于更新选中状态）
    let filteredRecipes = RECIPES.map((r, i) => ({...r, originalIdx: i})).filter(r => r.type === currentCraftTab);
    
    let iconBox = document.getElementById('detail-icon'); 
    iconBox.innerHTML = ''; 
    let cvs = document.createElement('canvas'); 
    cvs.width=48; 
    cvs.height=48; 
    let c = cvs.getContext('2d'); 
    c.imageSmoothingEnabled = false; 
    if(BLOCKS[r.out.id] && BLOCKS[r.out.id].icon) c.drawImage(BLOCKS[r.out.id].icon, 0, 0, 48, 48); 
    else { 
        c.fillStyle = (BLOCKS[r.out.id] && BLOCKS[r.out.id].color) || '#fff'; 
        c.fillRect(0,0,48,48); 
    } 
    iconBox.appendChild(cvs); 
    let note = ""; 
    if (r.station && BLOCKS[r.station] && !isNearStation(r.station)) note = ` (需${BLOCKS[r.station].name})`; 
    document.getElementById('detail-name').innerText = r.name + note; 
    let costHTML = ""; 
    let canCraft = true; 
    if (r.station && BLOCKS[r.station] && !isNearStation(r.station)) { 
        costHTML += `<div style="color:#ff5252">需在 ${BLOCKS[r.station].name} 旁</div>`; 
        canCraft = false; 
    } 
    r.cost.forEach(costItem => { 
        if (!BLOCKS[costItem.id]) {
            canCraft = false; // 如果材料ID未定义，标记为无法合成
            costHTML += `<div class="cost-item missing"><span>未知材料 (ID: ${costItem.id})</span> <span>0/${costItem.count}</span></div>`;
            return;
        }
        // 檢查材料數量（考慮耐久度物品的特殊情況）
        let hasDurability = BLOCKS[costItem.id] && BLOCKS[costItem.id].durability;
        let has = 0;
        if (hasDurability) {
            // 有耐久度的物品不能疊加，每個都是獨立的
            has = player.inventory.filter(i => i.id === costItem.id && i.count > 0).length;
        } else {
            // 沒有耐久度的物品可以疊加，計算總數量
            let item = player.inventory.find(i => i.id === costItem.id);
            has = item ? item.count : 0;
        }
        let missing = has < costItem.count ? "missing" : ""; 
        if (has < costItem.count) canCraft = false; 
        costHTML += `<div class="cost-item ${missing}"><span>${BLOCKS[costItem.id].name}</span> <span>${has}/${costItem.count}</span></div>`; 
    }); 
    document.getElementById('detail-cost').innerHTML = costHTML; 
    let btn = document.getElementById('craft-btn'); 
    btn.disabled = !canCraft; 
    btn.onclick = () => craftSelected(); 
    // 只更新选中状态，不需要重新渲染整个网格（性能优化）
    document.querySelectorAll('.recipe-slot').forEach((slot, i) => {
        let recipeIdx = filteredRecipes[i]?.originalIdx;
        if (recipeIdx === selectedRecipeIdx) {
            slot.classList.add('selected');
        } else {
            slot.classList.remove('selected');
        }
    });
}
function craftSelected() { 
    if (selectedRecipeIdx === -1) return; 
    let r = RECIPES[selectedRecipeIdx]; 
    if (r.station && !isNearStation(r.station)) return; 
    
    // 先汇总每种材料的总需求量（处理同一材料出现多次的情况）
    let costMap = {};
    r.cost.forEach(c => {
        if (!costMap[c.id]) costMap[c.id] = 0;
        costMap[c.id] += c.count;
    });
    
    // 检查是否有足够的材料（考慮耐久度物品的特殊情況）
    let can = true;
    for (let id in costMap) {
        let itemId = parseInt(id);
        let needed = costMap[id];
        let hasDurability = BLOCKS[itemId] && BLOCKS[itemId].durability;
        
        if (hasDurability) {
            // 有耐久度的物品不能疊加，每個都是獨立的，需要找到足夠數量的物品
            let foundItems = player.inventory.filter(i => i.id === itemId && i.count > 0);
            if (foundItems.length < needed) {
                can = false;
                break;
            }
        } else {
            // 沒有耐久度的物品可以疊加，檢查總數量
            let item = player.inventory.find(i => i.id === itemId);
            if (!item || item.count < needed) {
                can = false;
                break;
            }
        }
    }
    if (!can) return;
    
    // 先檢查背包是否有空槽位（在消耗材料之前檢查）
    let hasEmptySlot = false;
    let outHasDurability = BLOCKS[r.out.id] && BLOCKS[r.out.id].durability;
    if (outHasDurability) {
        // 有耐久度的物品需要空槽位
        hasEmptySlot = player.inventory.some(s => s.id === IDS.AIR || (s.id === IDS.AIR && s.count === 0));
    } else {
        // 沒有耐久度的物品可以疊加或找空槽位
        let found = player.inventory.find(s => s.id === r.out.id && s.count > 0);
        hasEmptySlot = found || player.inventory.some(s => s.id === IDS.AIR || (s.id === IDS.AIR && s.count === 0));
    }
    
    if (!hasEmptySlot) {
        // 背包已滿，只顯示提示訊息（不消耗材料，不掉落物品）
        spawnFloatText(player.x, player.y, "背包已滿!", "#ff5252");
        return; // 不執行合成，不消耗材料
    }
    
    // 背包有空槽位，開始消耗材料
    // 消耗材料，并清理空槽位（按汇总后的数量消耗）
    // 注意：有耐久度的物品不能疊加，數量固定為1，需要特殊處理
    for (let id in costMap) {
        let itemId = parseInt(id);
        let needed = costMap[id];
        let hasDurability = BLOCKS[itemId] && BLOCKS[itemId].durability;
        
        // 如果有耐久度，每個物品都是獨立的，需要找到多個物品
        if (hasDurability) {
            let foundItems = player.inventory.filter(i => i.id === itemId && i.count > 0);
            if (foundItems.length < needed) {
                // 材料不足（有耐久度的物品不能疊加，每個都是獨立的）
                return;
            }
            // 消耗指定數量的物品
            for (let i = 0; i < needed && i < foundItems.length; i++) {
                foundItems[i].id = IDS.AIR;
                foundItems[i].count = 0;
                foundItems[i].durability = undefined;
            }
        } else {
            // 沒有耐久度的物品可以疊加
            let item = player.inventory.find(i => i.id === itemId);
            if (item) {
                // 確保不會變成負數
                item.count = Math.max(0, item.count - needed);
                // 如果数量为0，清空槽位
                if (item.count <= 0) {
                    item.id = IDS.AIR;
                    item.count = 0;
                    item.durability = undefined;
                }
            }
        }
    }
    
    // 執行合成，添加新物品
    addToInventory(r.out.id, r.out.count);
    updateUI(); 
    selectRecipe(selectedRecipeIdx); 
}
function updateUI() { 
    const hb = document.getElementById('hotbar-container'); 
    if (!hb) return; // 防止元素不存在
    hb.innerHTML = ''; 
    player.inventory.forEach((item, idx) => { 
        let div = document.createElement('div'); 
        div.className = `slot ${idx === player.hotbarSlot ? 'active' : ''}`; 
        if (item.id !== IDS.AIR && item.count > 0) { 
            let iconCanvas = document.createElement('canvas'); 
            iconCanvas.width=32; 
            iconCanvas.height=32; 
            let iconCtx = iconCanvas.getContext('2d'); 
            if(BLOCKS[item.id] && BLOCKS[item.id].icon) iconCtx.drawImage(BLOCKS[item.id].icon, 0, 0); 
            else { 
                iconCtx.fillStyle = BLOCKS[item.id].color||'#fff'; 
                iconCtx.fillRect(0,0,32,32); 
            } 
            div.appendChild(iconCanvas); 
            
            // 如果有耐久度，顯示耐久度條（不顯示數字）
            if (BLOCKS[item.id] && BLOCKS[item.id].durability && item.durability !== undefined) {
                let maxDurability = BLOCKS[item.id].durability;
                let currentDurability = Math.max(0, item.durability); // 確保不小於0
                let durabilityPercent = currentDurability / maxDurability;
                
                // 創建耐久度條容器
                let durabilityBar = document.createElement('div');
                durabilityBar.style.position = 'absolute';
                durabilityBar.style.bottom = '0';
                durabilityBar.style.left = '0';
                durabilityBar.style.width = '100%';
                durabilityBar.style.height = '3px';
                durabilityBar.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                durabilityBar.style.borderRadius = '0 0 2px 2px';
                durabilityBar.style.overflow = 'hidden';
                
                // 耐久度填充條
                let durabilityFill = document.createElement('div');
                durabilityFill.style.width = (durabilityPercent * 100) + '%';
                durabilityFill.style.height = '100%';
                // 根據耐久度百分比設置顏色：綠色(>50%) -> 黃色(>25%) -> 紅色(<=25%)
                if (durabilityPercent > 0.5) {
                    durabilityFill.style.backgroundColor = '#4caf50'; // 綠色
                } else if (durabilityPercent > 0.25) {
                    durabilityFill.style.backgroundColor = '#ffeb3b'; // 黃色
                } else {
                    durabilityFill.style.backgroundColor = '#f44336'; // 紅色
                }
                durabilityFill.style.transition = 'width 0.2s';
                durabilityBar.appendChild(durabilityFill);
                div.appendChild(durabilityBar);
            }
            
            // 顯示數量（如果沒有耐久度或數量>1）
            if (!BLOCKS[item.id] || !BLOCKS[item.id].durability || item.count > 1) {
                let count = document.createElement('span'); 
                count.className = 'count'; 
                count.innerText = item.count; 
                div.appendChild(count);
            }
        } 
        div.onclick = () => { player.hotbarSlot = idx; updateUI(); }; 
        hb.appendChild(div); 
    }); 
    
    // 更新錢幣和防禦力顯示
    let info = document.getElementById('info-container');
    if (info) {
        let coins = player.coins || 0;
        let defense = player.defense || 0;
        info.innerHTML = `
            X: ${Math.floor(player.x/TILE_SIZE)} Y: ${Math.floor(player.y/TILE_SIZE)} <br>
            💰: ${coins} <br>
            🛡️: ${defense}
        `;
    }
}
// 魔力容器（使用HTML中的元素）
let manaContainer = document.getElementById('mana-container');
if (!manaContainer) {
    manaContainer = document.createElement('div');
    manaContainer.id = 'mana-container';
    document.getElementById('ui-layer').appendChild(manaContainer);
}

function updateHealthUI() { 
    const container = document.getElementById('hearts-container'); 
    if (!container) return; // 防止元素不存在
    container.innerHTML = ''; 
    for(let i=0; i<player.maxHp; i++) { 
        let div = document.createElement('div'); 
        div.className = `heart ${i < player.hp ? '' : 'lost'}`; 
        container.appendChild(div); 
    }
    
    // --- 新增：更新魔力星 ---
    if (manaContainer) {
        manaContainer.innerHTML = '';
        let stars = Math.ceil(player.maxMana / 20); // 每顆星代表 20 魔力
        let currentStars = Math.ceil(player.mana / 20);
        
        for(let i=0; i<stars; i++) {
            let div = document.createElement('div');
            div.style.width = '20px'; 
            div.style.height = '20px';
            div.style.marginLeft = '2px';
            div.style.backgroundColor = (i < currentStars) ? '#2979ff' : '#555'; // 藍色星星或灰色空星
            div.style.borderRadius = '50%'; // 圓形代表星星
            div.style.border = '2px solid #fff';
            manaContainer.appendChild(div);
        }
    }
    
    // --- 更新 Buff 顯示 (左上) ---
    let buffDiv = document.getElementById('buff-container');
    if (!buffDiv) {
        buffDiv = document.createElement('div');
        buffDiv.id = 'buff-container';
        document.getElementById('ui-layer').appendChild(buffDiv);
    }
    let buffTexts = [];
    if (player.buffs && player.buffs.wellFed > 0) {
        let sec = Math.ceil(player.buffs.wellFed / 60);
        let min = Math.floor(sec / 60);
        let secRemain = sec % 60;
        buffTexts.push(`🍱 吃飽 (${min}m ${secRemain}s)`);
    }
    if (player.buffs && player.buffs.swiftness > 0) {
        let sec = Math.ceil(player.buffs.swiftness / 60);
        let min = Math.floor(sec / 60);
        let secRemain = sec % 60;
        buffTexts.push(`⚡ 敏捷 (${min}m ${secRemain}s)`);
    }
    if (player.buffs && player.buffs.shine > 0) {
        let sec = Math.ceil(player.buffs.shine / 60);
        let min = Math.floor(sec / 60);
        let secRemain = sec % 60;
        buffTexts.push(`✨ 光芒 (${min}m ${secRemain}s)`);
    }
    
    if (buffTexts.length > 0) {
        buffDiv.innerHTML = buffTexts.join('<br>');
        buffDiv.style.display = 'block';
    } else {
        buffDiv.innerText = "";
        buffDiv.style.display = 'none';
    }
}
function createParticle(x, y, color, life=1.0) { 
    // 限制粒子数量，防止内存溢出
    const MAX_PARTICLES = 500;
    if (particles.length >= MAX_PARTICLES) {
        // 移除最旧的粒子
        particles.shift();
    }
    particles.push({ x: x, y: y, vx: (Math.random()-0.5)*6, vy: (Math.random()-0.5)*6, color: color, life: life, size: Math.random()*4+2 }); 
}
function takeDamage(amount) {
    if (player.invincibleTimer > 0) return;
    
    // --- 防禦力公式：每點防禦減少 0.5 傷害 ---
    if (!player.defense) player.defense = 0;
    let defenseReduction = Math.floor(player.defense / 2);
    let reducedDamage = Math.max(1, amount - defenseReduction);
    
    if (isNaN(reducedDamage) || reducedDamage <= 0) reducedDamage = 1;
    
    player.hp -= reducedDamage;
    if (player.hp < 0) player.hp = 0;
    updateHealthUI();
    playSound('hit');
    
    // --- 加入這行：玩家受傷飄紅字 ---
    spawnFloatText(player.x + 10, player.y, "-" + String(Math.floor(reducedDamage)), "#ff5252");

    player.vy = -4;
    player.invincibleTimer = 60;
    
    // 檢查死亡（必須在 hp 被扣減後立即檢查）
    if (player.hp <= 0) {
        // --- 墓碑生成邏輯 ---
        // 使用玩家腳下位置（player.y + player.h）而不是頭頂位置（player.y）
        let tx = Math.floor((player.x + player.w / 2) / TILE_SIZE);
        let ty = Math.floor((player.y + player.h) / TILE_SIZE);
        
        // 調試輸出：確認墓碑ID和生成位置
        console.log(`[墓碑生成] IDS.TOMBSTONE = ${IDS.TOMBSTONE}, 玩家位置: (${player.x}, ${player.y}), 計算位置: (${tx}, ${ty})`);
        console.log(`[墓碑生成] 當前方塊ID: ${getTile(tx, ty)}`);
        
        // 尋找最近的地面 (防止懸空)
        // 優先順序：腳下 → 腳下上方一格 → 左側 → 右側
        let placed = false;
        if (ty >= 0 && ty < CHUNK_H && getTile(tx, ty) === IDS.AIR) {
            tiles[ty * CHUNK_W + tx] = IDS.TOMBSTONE; // 直接設置，不使用 setTile 避免觸發光照更新
            console.log(`[墓碑生成] 直接設置在: (${tx}, ${ty}), 設置後方塊ID: ${tiles[ty * CHUNK_W + tx]}`);
            placed = true;
        } else if (ty > 0 && getTile(tx, ty-1) === IDS.AIR) {
            tiles[(ty-1) * CHUNK_W + tx] = IDS.TOMBSTONE;
            console.log(`[墓碑生成] 直接設置在: (${tx}, ${ty-1}), 設置後方塊ID: ${tiles[(ty-1) * CHUNK_W + tx]}`);
            placed = true;
        } else {
            // 如果上方也不行，嘗試左右
            if (tx+1 < CHUNK_W && getTile(tx+1, ty) === IDS.AIR) {
                tiles[ty * CHUNK_W + (tx+1)] = IDS.TOMBSTONE;
                console.log(`[墓碑生成] 直接設置在: (${tx+1}, ${ty}), 設置後方塊ID: ${tiles[ty * CHUNK_W + (tx+1)]}`);
                placed = true;
            } else if (tx > 0 && getTile(tx-1, ty) === IDS.AIR) {
                tiles[ty * CHUNK_W + (tx-1)] = IDS.TOMBSTONE;
                console.log(`[墓碑生成] 直接設置在: (${tx-1}, ${ty}), 設置後方塊ID: ${tiles[ty * CHUNK_W + (tx-1)]}`);
                placed = true;
            }
        }
        
        if (!placed) {
            console.warn(`[墓碑生成] 無法找到合適位置，強制放置在: (${tx}, ${ty})`);
            // 如果所有位置都不行，強制放在腳下（覆蓋現有方塊）
            if (ty >= 0 && ty < CHUNK_H) {
                tiles[ty * CHUNK_W + tx] = IDS.TOMBSTONE;
                console.log(`[墓碑生成] 強制設置後方塊ID: ${tiles[ty * CHUNK_W + tx]}`);
            }
        }
        
        alert("你死掉了！");
        player.x = spawnPoint.x;
        player.y = spawnPoint.y;
        player.hp = player.maxHp;
        player.vx = 0;
        player.vy = 0;
        player.grounded = false;
        player.jumpKeyHeld = false;
        player.invincibleTimer = 0;
        // 清除所有按键状态，防止复活后继续移动
        keys = {};
        // 重置钩子和钓鱼状态
        if (player.hook) player.hook.active = false;
        if (player.fishing) player.fishing.active = false;
        player.wKeyLocked = false;
        updateHealthUI();
    }
}

window.addEventListener('keydown', e => { 
    keys[e.code] = true; 

    // 極限保險版 E 鍵：
    // - 不只看 e.key / e.code，也一併檢查 keyCode / which
    // - 目標：只要這次按鍵在任何屬性上看起來像是 E，就一律當成「合成表開關」
    const isE =
        e.code === 'KeyE' ||
        e.key === 'e' || e.key === 'E' ||
        e.keyCode === 69 || e.which === 69  ||   // 'E'
        e.keyCode === 101 || e.which === 101;    // 'e'

    if (isE) {
        try {
            // 若有箱子開著，先關閉
            if (typeof currentChest !== 'undefined' && currentChest) {
                saveGame();
                const chest = document.getElementById('chest-menu');
                if (chest) chest.style.display = 'none';
                currentChest = null;
            }
            // 然後統一切換合成表開 / 關
            if (typeof toggleCrafting === 'function') {
                toggleCrafting();
            }
        } catch(_) {}
        // 避免後續邏輯或其他監聽再次處理這次按鍵導致狀態被反轉
        return;
    }

    if (e.code === 'Escape') {
        // ESC 键关闭商人界面（优先）
        if (isMerchantOpen) {
            isMerchantOpen = false;
            updateMerchantUI();
            return;
        }
        // ESC 键关闭传送菜单
        if (isTeleportMenuOpen) {
            closeTeleportMenu();
            return; // 阻止其他 ESC 邏輯
        }
        // ESC 键关闭宝箱菜单或合成菜单
        if (currentChest) {
            saveGame();
            document.getElementById('chest-menu').style.display = 'none';
            currentChest = null;
        }
        if (isCraftingOpen) {
            toggleCrafting();
        }
    }
    if (e.code === 'F2') saveGame(); 
    if (e.code === 'F4') resetGame(); 
    if(e.key >= '1' && e.key <= '9') { 
        let idx = parseInt(e.key)-1;
        if(idx < player.inventory.length) { 
            player.hotbarSlot = idx; 
            updateUI(); 
        } 
    } 
    if(e.key === '0') { 
        if (player.inventory.length >= 10) { 
            player.hotbarSlot = 9; 
            updateUI(); 
        } 
    }
    
    // Q鍵丟出選取到的物品（檢查Q鍵是否已被占用）
    // 目前Q鍵沒有其他功能，可以安全使用
    if (e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q' || e.keyCode === 81 || e.which === 81) {
        // 防止事件繼續傳播，確保 Q 鍵處理不會被其他邏輯影響
        e.preventDefault();
        e.stopPropagation();
        
        // 檢查是否有選取的物品
        let selectedItem = player.inventory[player.hotbarSlot];
        if (selectedItem && selectedItem.id !== IDS.AIR && selectedItem.count > 0) {
            // 丟出物品
            let dropCount = 1; // 每次丟出1個
            
            // 根據滑鼠位置決定丟出方向（如果滑鼠在左側，向左丟；否則向右丟）
            // 使用滑鼠屏幕座標判斷：如果滑鼠在屏幕左半邊，向左丟；在右半邊，向右丟
            // 這樣更簡單直接，不依賴 camera 和世界座標轉換
            let throwRight = player.facingRight; // 默認使用玩家面向
            if (mouse && mouse.x !== undefined) {
                // 獲取屏幕寬度（如果 width 未初始化，使用 window.innerWidth）
                let screenWidth = width || window.innerWidth || canvas.width || 800;
                // 滑鼠在屏幕左半邊，向左丟；在右半邊，向右丟
                throwRight = mouse.x > (screenWidth / 2);
            }
            
            // 創建掉落物（從玩家位置開始，通過物理系統形成拋物線動畫）
            // 從玩家手部位置開始（稍微向上和向前，確保不會立即碰撞）
            // 往右丟：從玩家右側更遠的位置開始；往左丟：從玩家左側更遠的位置開始
            let offsetX = throwRight ? 20 : -20; // 增加偏移距離，避免立即碰撞
            let dropX = player.x + player.w / 2 + offsetX;
            let dropY = player.y + player.h / 2 - 10; // 手部位置
            let drop = { 
                x: dropX, 
                y: dropY, 
                w: 12, 
                h: 12, 
                // 給一個較大的初始速度，讓物品飛出至少200像素
                // 水平速度：根據丟出方向，18-22像素/幀，確保能飛出至少200像素距離
                vx: (throwRight ? 18 : -18) + (Math.random() - 0.5) * 4,
                // 垂直速度：向上拋出，形成拋物線
                vy: -7 - Math.random() * 2, // -7 到 -9 像素/幀，形成明顯的拋物線
                id: selectedItem.id, 
                life: 3000, 
                spawnTime: frameCount,
                justThrown: true, // 標記為剛丟出的物品，防止立即被吸引
                throwTime: frameCount, // 記錄丟出時間
                durability: selectedItem.durability // 保存耐久度，避免撿回來時恢復滿
            };
            drops.push(drop);
            
            // 減少物品數量（確保不會變成負數）
            selectedItem.count = Math.max(0, selectedItem.count - dropCount);
            if (selectedItem.count <= 0) {
                // 如果數量歸零，清空槽位
                selectedItem.id = IDS.AIR;
                selectedItem.count = 0;
                selectedItem.durability = undefined;
            }
            
            updateUI();
            playSound('drink'); // 使用撿取音效
        }
        // 無論是否有物品，都返回，防止其他邏輯影響
        return;
    }
});
// 補強說明：
// - 原本這裡會再用 keypress 觸發一次合成介面，避免部分輸入法環境 keydown 失敗。
// - 但在目前整合主體遊戲的情境下，keydown 已經做了「極限保險」判斷，若再在 keypress
//   裡切換一次，容易造成「開了又關」看起來沒反應的狀況。
// - 因此這裡保留監聽（若未來需要可擴充），但不再對 E 做任何處理。
window.addEventListener('keypress', e => {
    // no-op for now
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('wheel', e => { 
    if (player.inventory.length === 0) return;
    if (e.deltaY > 0) {
        // 防止inventory为空时出错
        if (player.inventory.length > 0) {
            player.hotbarSlot = (player.hotbarSlot + 1) % player.inventory.length;
        } else {
            player.hotbarSlot = 0;
        }
    } else {
        // 防止inventory为空时出错
        if (player.inventory.length > 0) {
            player.hotbarSlot = (player.hotbarSlot - 1 + player.inventory.length) % player.inventory.length;
        } else {
            player.hotbarSlot = 0;
        }
    }
    updateUI(); 
}, { passive: true });
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', e => { if(e.button===0)mouse.left=true; if(e.button===2)mouse.right=true; });
window.addEventListener('mouseup', e => { if(e.button===0)mouse.left=false; if(e.button===2)mouse.right=false; });
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('resize', () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; ctx.imageSmoothingEnabled = false; });

let lastTime = 0;
let frameCount = 0;
function loop(ts) {
    try {
        let dt = ts - lastTime; lastTime = ts; frameCount++;
        // 時間更新：每幀增加，24000幀 = 1天（假設60fps，約400秒 = 6.67分鐘）
        gameTime = (gameTime + 1) % DAY_LEN;
        // 光照更新：每帧更新光照传播，但只在火把变化时完全重建
        if (gameTime % 200 === 0) fullLightUpdate(); // 每200幀完全重建光照（重新扫描所有光源）
        else if (frameCount % 5 === 0) {
            // 每5帧传播一次光照（不重建，只传播已有的光照）
            // 需要重新填充lightQueue，因为propagateLight会清空它
            let sunLevel = getSunLevel();
            lightQueue = [];
            // 只扫描玩家视野范围内的光源（性能优化）
            let startX = Math.max(0, Math.floor(camera.x/TILE_SIZE) - 20);
            let endX = Math.min(CHUNK_W, Math.floor(camera.x/TILE_SIZE) + Math.floor(width/TILE_SIZE) + 20);
            let startY = Math.max(0, Math.floor(camera.y/TILE_SIZE) - 20);
            let endY = Math.min(CHUNK_H, Math.floor(camera.y/TILE_SIZE) + Math.floor(height/TILE_SIZE) + 20);
            for(let y = startY; y < endY; y++) {
                for(let x = startX; x < endX; x++) {
                    let idx = y*CHUNK_W + x;
                    let id = tiles[idx];
                    if(BLOCKS[id] && BLOCKS[id].light && lightMap[idx] > 0.05) {
                        lightQueue.push(idx);
                    }
                }
            }
            propagateLight();
        }
        if (frameCount % 3 === 0) updateWorldLogic(); 
        updateMobSpawning(); 
        updatePhysics(); updateInteraction(); updateProjectiles(); draw();
        // 更新 FPS 顯示
        let fpsCounter = document.getElementById('fps-counter');
        if (fpsCounter) {
            fpsCounter.innerText = `FPS: ${Math.round(1000/dt)}`;
        }
        
        // 計算時間顯示（0-24000，轉換為小時和分鐘）
        let time = gameTime / DAY_LEN; // 0.0 - 1.0
        let hours = Math.floor(time * 24); // 0-23
        let minutes = Math.floor((time * 24 - hours) * 60); // 0-59
        let timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        // 6点~18点是白天（time >= 0.25 && time < 0.75），其他时间是夜晚
        let isDay = time >= 0.25 && time < 0.75;
        let dayNight = isDay ? "☀️ 白天" : "🌙 夜晚";
        // 更新中間最上方的白天/夜晚顯示
        let daynightEl = document.getElementById('daynight-display');
        if (daynightEl) {
            daynightEl.innerText = `${dayNight} ${timeStr}`;
        }
        requestAnimationFrame(loop);
    } catch(e) {
        console.error("Game Loop Error:", e);
        requestAnimationFrame(loop);
    }
}

// --- 新增：產生飄浮文字 ---
function spawnFloatText(x, y, text, color) {
    // 對於"背包已滿"相關提示，添加冷卻時間（120幀 = 約2秒）
    if (text.includes("背包已滿")) {
        const COOLDOWN_FRAMES = 120; // 冷卻時間：120幀（約2秒）
        if (frameCount - lastInventoryFullTime < COOLDOWN_FRAMES) {
            return; // 在冷卻期內，不顯示
        }
        lastInventoryFullTime = frameCount; // 更新最後觸發時間
    }
    
    // 限制浮字数量，防止内存溢出
    const MAX_FLOAT_TEXTS = 20; // 減少最大數量，避免殘影
    if (floatTexts.length >= MAX_FLOAT_TEXTS) {
        // 移除最旧的浮字
        floatTexts.shift();
    }
    
    // 檢查是否已有相同位置和文字的浮字（避免重複）
    let existing = floatTexts.find(t => 
        Math.abs(t.x - x) < 10 && 
        Math.abs(t.y - y) < 10 && 
        t.text === text
    );
    if (existing) {
        // 如果已有相同的浮字，重置它的生命值而不是創建新的
        existing.life = 60;
        existing.vy = -2;
        return;
    }
    
    floatTexts.push({
        x: x, y: y,
        text: text,
        color: color,
        life: 60, // 存在 60 幀 (約1秒)
        vy: -2 // 往上飄的速度
    });
}

// --- 倉庫系統邏輯 ---
let chestData = {}; 
let currentChest = null;
        // --- 傳送門系統 ---
// 格式: { x: tileX, y: tileY, name: "名稱" }
let teleporters = [];
let isTeleportMenuOpen = false; // 控制選單開關

// 建立傳送選單 DOM
const teleportMenu = document.createElement('div');
teleportMenu.id = 'teleport-menu';
teleportMenu.style.cssText = `
    display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.85); border: 2px solid #00e5ff; padding: 20px;
    border-radius: 10px; color: white; flex-direction: column; gap: 10px; min-width: 200px;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.5); z-index: 1000;
`;
document.body.appendChild(teleportMenu);

// 關閉選單的函數
function closeTeleportMenu() {
    teleportMenu.style.display = 'none';
    isTeleportMenuOpen = false;
}

// 建立或更新傳送門清單並開啟選單（右鍵點擊傳送門）
function openTeleportMenuAt(tileX, tileY) {
    if (!teleporters || teleporters.length === 0) {
        spawnFloatText(tileX * TILE_SIZE, tileY * TILE_SIZE, "尚未設定傳送門目的地", "#00e5ff");
        return;
    }
    // 重建按鈕列表
    teleportMenu.innerHTML = "";
    const title = document.createElement('div');
    title.textContent = "選擇傳送目的地";
    title.style.marginBottom = "10px";
    title.style.fontWeight = "bold";
    teleportMenu.appendChild(title);

    teleporters.forEach((t, idx) => {
        const btn = document.createElement('button');
        btn.textContent = t.name || `目的地 ${idx+1}`;
        btn.style.margin = "4px 0";
        btn.onclick = () => teleportTo(t.x, t.y);
        teleportMenu.appendChild(btn);
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = "取消";
    closeBtn.style.marginTop = "8px";
    closeBtn.onclick = () => closeTeleportMenu();
    teleportMenu.appendChild(closeBtn);

    teleportMenu.style.display = 'flex';
    isTeleportMenuOpen = true;
}

// 開啟選單函數
function openTeleportUI(currentX, currentY) {
    if (teleporters.length <= 1) {
        spawnFloatText(player.x, player.y, "沒有其他傳送點", "#999");
        return;
    }

    isTeleportMenuOpen = true;
    teleportMenu.innerHTML = '<h3 style="margin:0 0 10px 0; text-align:center; color:#00e5ff">選擇傳送點</h3>';
    
    // 列出所有傳送點 (排除當前位置)
    teleporters.forEach(t => {
        if (t.x === currentX && t.y === currentY) return; // 不顯示自己
        
        let btn = document.createElement('button');
        btn.innerText = t.name;
        btn.style.cssText = `
            background: #333; color: white; border: 1px solid #555; padding: 10px;
            cursor: pointer; font-size: 16px; width: 100%; text-align: left;
            transition: 0.2s;
        `;
        btn.onmouseover = () => { btn.style.background = '#00e5ff'; btn.style.color = '#000'; };
        btn.onmouseout = () => { btn.style.background = '#333'; btn.style.color = 'white'; };
        
        btn.onclick = () => {
            performTeleport(t.x, t.y);
        };
        teleportMenu.appendChild(btn);
    });
    
    // 關閉按鈕
    let closeBtn = document.createElement('button');
    closeBtn.innerText = "取消 (ESC)";
    closeBtn.style.cssText = "margin-top:10px; background:#444; color:#ccc; border:none; padding:8px; cursor:pointer; width:100%";
    closeBtn.onclick = closeTeleportMenu;
    teleportMenu.appendChild(closeBtn);

    teleportMenu.style.display = 'flex';
}

// 執行傳送
function performTeleport(targetX, targetY) {
    // 確保目標位置有效
    if (targetX < 0 || targetX >= CHUNK_W || targetY < 0 || targetY >= CHUNK_H) {
        spawnFloatText(player.x, player.y, "傳送失敗: 無效位置", "#ff5252");
        closeTeleportMenu();
        return;
    }
    
    // 傳送特效 (原地)
    for(let i=0; i<10; i++) createParticle(player.x, player.y, "#00e5ff", 1.0);
    playSound('magic'); // 播放音效
    
    // 移動玩家
    player.x = targetX * TILE_SIZE;
    player.y = targetY * TILE_SIZE;
    player.vx = 0; 
    player.vy = 0;
    // 重置跳躍計數和鉤爪狀態
    player.jumpCount = 0;
    if (player.hook) player.hook.active = false;
    
    // 防止位置溢出
    if (player.x < 0) player.x = 0;
    if (player.x > CHUNK_W*TILE_SIZE) player.x = CHUNK_W*TILE_SIZE;
    if (player.y < 0) player.y = 0;
    if (player.y > CHUNK_H*TILE_SIZE) {
        player.y = CHUNK_H*TILE_SIZE;
        takeDamage(999); // 傳送到地圖外會受傷
    }
    
    // 傳送特效 (目的地)
    for(let i=0; i<10; i++) createParticle(player.x, player.y, "#00e5ff", 1.0);
    
    closeTeleportMenu();
    // 稍微重置相機
    camera.x = player.x - width/2;
    camera.y = player.y - height/2;
    // 防止相機溢出
    camera.x = Math.max(0, Math.min(camera.x, CHUNK_W*TILE_SIZE - width));
    camera.y = Math.max(0, Math.min(camera.y, CHUNK_H*TILE_SIZE - height));
}

function toggleChest(tileX, tileY) {
    const menu = document.getElementById('chest-menu');
    if (currentChest && currentChest.x === tileX && currentChest.y === tileY) {
        // 关闭宝箱时自动保存
        saveGame();
        menu.style.display = 'none';
        currentChest = null;
        return;
    }
    let key = `${tileX}_${tileY}`;
    if (!chestData[key]) {
        chestData[key] = Array(10).fill().map(() => ({ id: IDS.AIR, count: 0 }));
    }
    currentChest = { x: tileX, y: tileY, data: chestData[key] };
    updateChestUI();
    menu.style.display = 'flex';
}

function updateChestUI() {
    if (!currentChest) return;
    const grid = document.getElementById('chest-grid');
    if (!grid) return; // 防止元素不存在
    grid.innerHTML = '';
    // 確保箱子數據是數組且長度正確
    if (!Array.isArray(currentChest.data)) {
        currentChest.data = Array(10).fill().map(() => ({ id: IDS.AIR, count: 0 }));
    }
    // 確保有10個槽位
    while (currentChest.data.length < 10) {
        currentChest.data.push({ id: IDS.AIR, count: 0 });
    }
    if (currentChest.data.length > 10) {
        currentChest.data = currentChest.data.slice(0, 10);
    }
    currentChest.data.forEach((item, idx) => {
        // 確保item格式正確
        if (!item || typeof item !== 'object') {
            item = { id: IDS.AIR, count: 0 };
            currentChest.data[idx] = item;
        }
        if (item.id === undefined) item.id = IDS.AIR;
        if (item.count === undefined) item.count = 0;
        let div = document.createElement('div');
        div.className = 'slot';
        // 繪製箱子內容
        if (item && item.id !== IDS.AIR && item.id !== 0 && item.count > 0) {
            let cvs = document.createElement('canvas'); cvs.width=32; cvs.height=32;
            let c = cvs.getContext('2d');
            if(BLOCKS[item.id] && BLOCKS[item.id].icon) c.drawImage(BLOCKS[item.id].icon, 0, 0);
            else if(BLOCKS[item.id]) { c.fillStyle = BLOCKS[item.id].color || '#fff'; c.fillRect(0,0,32,32); }
            div.appendChild(cvs);
            
            // 如果有耐久度，顯示耐久度條（與玩家背包相同）
            if (BLOCKS[item.id] && BLOCKS[item.id].durability && item.durability !== undefined) {
                let maxDurability = BLOCKS[item.id].durability;
                let currentDurability = Math.max(0, item.durability);
                let durabilityPercent = currentDurability / maxDurability;
                
                // 創建耐久度條容器
                let durabilityBar = document.createElement('div');
                durabilityBar.style.position = 'absolute';
                durabilityBar.style.bottom = '0';
                durabilityBar.style.left = '0';
                durabilityBar.style.width = '100%';
                durabilityBar.style.height = '3px';
                durabilityBar.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                durabilityBar.style.borderRadius = '0 0 2px 2px';
                durabilityBar.style.overflow = 'hidden';
                
                // 耐久度填充條
                let durabilityFill = document.createElement('div');
                durabilityFill.style.width = (durabilityPercent * 100) + '%';
                durabilityFill.style.height = '100%';
                if (durabilityPercent > 0.5) {
                    durabilityFill.style.backgroundColor = '#4caf50'; // 綠色
                } else if (durabilityPercent > 0.25) {
                    durabilityFill.style.backgroundColor = '#ffeb3b'; // 黃色
                } else {
                    durabilityFill.style.backgroundColor = '#f44336'; // 紅色
                }
                durabilityFill.style.transition = 'width 0.2s';
                durabilityBar.appendChild(durabilityFill);
                div.appendChild(durabilityBar);
            }
            
            // 顯示數量（如果沒有耐久度或數量>1）
            if (!BLOCKS[item.id] || !BLOCKS[item.id].durability || item.count > 1) {
                let count = document.createElement('span'); count.className = 'count'; count.innerText = item.count;
                div.appendChild(count);
            }
        }
        div.onclick = () => handleChestClick(idx);
        grid.appendChild(div);
    });
}

function handleChestClick(idx) {
    if (!currentChest) return;
    // 確保索引有效
    if (idx < 0 || idx >= 10) return;
    // 確保數據數組存在且長度正確
    if (!Array.isArray(currentChest.data)) {
        currentChest.data = Array(10).fill().map(() => ({ id: IDS.AIR, count: 0 }));
    }
    while (currentChest.data.length < 10) {
        currentChest.data.push({ id: IDS.AIR, count: 0 });
    }
    let cItem = currentChest.data[idx];
    // 確保item格式正確
    if (!cItem || typeof cItem !== 'object') {
        cItem = { id: IDS.AIR, count: 0 };
        currentChest.data[idx] = cItem;
    }
    if (cItem.id === undefined) cItem.id = IDS.AIR;
    if (cItem.count === undefined || cItem.count < 0) cItem.count = 0;
    // 驗證箱子物品ID是否有效
    if (!BLOCKS[cItem.id]) {
        cItem.id = IDS.AIR;
        cItem.count = 0;
        cItem.durability = undefined;
    }
    let pItem = player.inventory[player.hotbarSlot];
    
    // 確保玩家物品格式正確
    if (pItem && (pItem.id === undefined || !BLOCKS[pItem.id])) {
        pItem.id = IDS.AIR;
        pItem.count = 0;
        pItem.durability = undefined;
    }
    if (pItem && (pItem.count === undefined || pItem.count < 0)) {
        pItem.count = 0;
    }
    
    // 改进的物品交换逻辑（包含耐久度處理）
    if (pItem && pItem.id !== IDS.AIR && pItem.count > 0) {
        // 手上有物品：存入宝箱
        let pItemHasDurability = BLOCKS[pItem.id] && BLOCKS[pItem.id].durability;
        
        if (cItem.id === IDS.AIR || cItem.id === 0 || cItem.count === 0) {
            // 空槽：直接放入
            cItem.id = pItem.id;
            cItem.count = pItem.count;
            // 複製耐久度（如果有）
            if (pItemHasDurability && pItem.durability !== undefined) {
                cItem.durability = pItem.durability;
            } else if (pItemHasDurability) {
                cItem.durability = BLOCKS[pItem.id].durability;
            } else {
                cItem.durability = undefined;
            }
            pItem.id = IDS.AIR;
            pItem.count = 0;
            pItem.durability = undefined;
        } else if (cItem.id === pItem.id) {
            // 相同物品：合併（但如果有耐久度，不能合併，改為交換）
            let cItemHasDurability = BLOCKS[cItem.id] && BLOCKS[cItem.id].durability;
            if (pItemHasDurability || cItemHasDurability) {
                // 有耐久度的物品不能合併，改為交換
                let tempId = pItem.id;
                let tempCount = pItem.count;
                let tempDurability = pItem.durability;
                pItem.id = cItem.id;
                pItem.count = cItem.count;
                pItem.durability = cItem.durability;
                cItem.id = tempId;
                cItem.count = tempCount;
                cItem.durability = tempDurability;
            } else {
                // 沒有耐久度，可以合併
                const MAX_STACK_SIZE = 999;
                const newCount = cItem.count + pItem.count;
                if (newCount > MAX_STACK_SIZE) {
                    // 超過最大疊加數量，只合併到最大值，剩餘的留在手上
                    cItem.count = MAX_STACK_SIZE;
                    pItem.count = newCount - MAX_STACK_SIZE;
                    spawnFloatText(player.x, player.y, "箱子槽位已達最大疊加數量!", "#ff9800");
                } else {
                    cItem.count = newCount;
                    pItem.id = IDS.AIR;
                    pItem.count = 0;
                    pItem.durability = undefined;
                }
            }
        } else {
            // 不同物品：交换
            let tempId = pItem.id;
            let tempCount = pItem.count;
            let tempDurability = pItem.durability;
            pItem.id = cItem.id;
            pItem.count = cItem.count;
            pItem.durability = cItem.durability;
            cItem.id = tempId;
            cItem.count = tempCount;
            cItem.durability = tempDurability;
        }
    } else if (cItem && cItem.id !== IDS.AIR && cItem.id !== 0 && cItem.count > 0 && BLOCKS[cItem.id]) {
        // 手上无物品或空槽：从宝箱取出
        // 檢查背包是否有空槽位（在20格內）
        let hasEmptySlot = player.inventory.some(s => s.id === IDS.AIR || (s.id === cItem.id && s.count === 0 && !BLOCKS[cItem.id]?.durability));
        if (!hasEmptySlot) {
            // 背包已滿，無法取出
            spawnFloatText(player.x, player.y, "背包已滿，無法取出!", "#ff5252");
            return;
        }
        
        if (!pItem) {
            // 如果槽位不存在，確保它存在（但不超過20格）
            if (player.inventory.length <= player.hotbarSlot && player.inventory.length < MAX_INVENTORY_SLOTS) {
                player.inventory.push({id: IDS.AIR, count: 0});
            }
            if (player.inventory.length > player.hotbarSlot) {
                pItem = player.inventory[player.hotbarSlot];
            } else {
                // 如果熱鍵槽位不存在，找一個空槽位
                let emptySlot = player.inventory.find(s => s.id === IDS.AIR || (s.id === IDS.AIR && s.count === 0));
                if (emptySlot) {
                    pItem = emptySlot;
                } else {
                    spawnFloatText(player.x, player.y, "背包已滿，無法取出!", "#ff5252");
                    return;
                }
            }
        }
        let cItemHasDurability = BLOCKS[cItem.id] && BLOCKS[cItem.id].durability;
        pItem.id = cItem.id;
        pItem.count = cItem.count;
        // 複製耐久度（如果有）
        if (cItemHasDurability && cItem.durability !== undefined) {
            pItem.durability = cItem.durability;
        } else if (cItemHasDurability) {
            pItem.durability = BLOCKS[cItem.id].durability;
        } else {
            pItem.durability = undefined;
        }
        cItem.id = IDS.AIR;
        cItem.count = 0;
        cItem.durability = undefined;
    }
    
    updateChestUI(); 
    updateUI();
    // 自动保存宝箱数据
    saveGame();
}

// 商人商品列表
const MERCHANT_ITEMS = [
    { id: IDS.HELMET_MINER, name: "礦工頭盔", desc: "增加挖掘速度", price: 2000 },
    { id: IDS.HEALTH_POTION, name: "治療藥水", desc: "恢復生命值", price: 100 },
    { id: IDS.TNT, name: "炸藥", desc: "爆炸性武器", price: 100, count: 2 },
    { id: IDS.ARROW, name: "箭矢", desc: "弓箭彈藥", price: 100, count: 10 },
    { id: IDS.TORCH, name: "火把", desc: "提供光源", price: 50, count: 10 },
    { id: IDS.ROPE, name: "繩子", desc: "用於攀爬", price: 150, count: 20 },
];

function updateMerchantUI() {
    const menu = document.getElementById('merchant-menu');
    if (!menu) {
        console.error("merchant-menu element not found");
        return;
    }
    
    menu.style.display = isMerchantOpen ? 'flex' : 'none';
    if (!isMerchantOpen) {
        currentMerchantItem = null;
        return;
    }
    
    const grid = document.getElementById('merchant-grid');
    if (!grid) {
        console.error("merchant-grid element not found");
        return;
    }
    grid.innerHTML = '';
    
    MERCHANT_ITEMS.forEach((item, idx) => {
        let div = document.createElement('div');
        div.className = 'slot';
        if (currentMerchantItem === idx) div.classList.add('selected');
        
        let cvs = document.createElement('canvas');
        cvs.width = 32;
        cvs.height = 32;
        let c = cvs.getContext('2d');
        if (BLOCKS[item.id] && BLOCKS[item.id].icon) {
            c.drawImage(BLOCKS[item.id].icon, 0, 0);
        } else if (BLOCKS[item.id]) {
            c.fillStyle = BLOCKS[item.id].color || '#fff';
            c.fillRect(0, 0, 32, 32);
        }
        div.appendChild(cvs);
        
        let price = document.createElement('span');
        price.className = 'count';
        price.style.background = '#ffd700';
        price.style.color = '#000';
        price.innerText = item.price;
        div.appendChild(price);
        
        div.onclick = () => selectMerchantItem(idx);
        grid.appendChild(div);
    });
    
    if (currentMerchantItem !== null) {
        selectMerchantItem(currentMerchantItem);
    } else {
        document.getElementById('merchant-name').innerText = "選擇商品";
        document.getElementById('merchant-desc').innerText = "";
        document.getElementById('merchant-price').innerText = "";
        document.getElementById('merchant-buy-btn').disabled = true;
    }
}

function selectMerchantItem(idx) {
    currentMerchantItem = idx;
    let item = MERCHANT_ITEMS[idx];
    
    let iconBox = document.getElementById('merchant-icon');
    iconBox.innerHTML = '';
    let cvs = document.createElement('canvas');
    cvs.width = 48;
    cvs.height = 48;
    let c = cvs.getContext('2d');
    c.imageSmoothingEnabled = false;
    if (BLOCKS[item.id] && BLOCKS[item.id].icon) {
        c.drawImage(BLOCKS[item.id].icon, 0, 0, 48, 48);
    } else if (BLOCKS[item.id]) {
        c.fillStyle = BLOCKS[item.id].color || '#fff';
        c.fillRect(0, 0, 48, 48);
    }
    iconBox.appendChild(cvs);
    
    document.getElementById('merchant-name').innerText = item.name;
    document.getElementById('merchant-desc').innerText = item.desc;
    document.getElementById('merchant-price').innerText = `價格: ${item.price} 銅幣`;
    
    let btn = document.getElementById('merchant-buy-btn');
    btn.disabled = (player.coins || 0) < item.price;
    
    updateMerchantUI(); // 更新选中状态
}

function buyMerchantItem() {
    if (currentMerchantItem === null) return;
    let item = MERCHANT_ITEMS[currentMerchantItem];
    
    if ((player.coins || 0) < item.price) {
        spawnFloatText(player.x, player.y, "金錢不足", "#999");
        return;
    }
    
    // 先檢查背包是否有空槽位
    let hasEmptySlot = false;
    let itemHasDurability = BLOCKS[item.id] && BLOCKS[item.id].durability;
    if (itemHasDurability) {
        hasEmptySlot = player.inventory.some(s => s.id === IDS.AIR || (s.id === IDS.AIR && s.count === 0));
    } else {
        let found = player.inventory.find(s => s.id === item.id && s.count > 0);
        hasEmptySlot = found || player.inventory.some(s => s.id === IDS.AIR || (s.id === IDS.AIR && s.count === 0));
    }
    
    if (!hasEmptySlot) {
        spawnFloatText(player.x, player.y, "背包已滿!", "#ff5252");
        return; // 不扣錢，不購買
    }
    
    // 背包有空槽位，執行購買
    player.coins = (player.coins || 0) - item.price;
    if (!addToInventory(item.id, item.count || 1)) {
        // 如果添加失敗（理論上不應該發生，因為已經檢查過了），退還金錢
        player.coins = (player.coins || 0) + item.price;
        spawnFloatText(player.x, player.y, "背包已滿!", "#ff5252");
        return;
    }
    updateUI();
    updateMerchantUI();
    spawnFloatText(player.x, player.y, `購買: ${item.name}`, "#fff");
    playSound('drink');
}

// 啟動
width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; ctx.imageSmoothingEnabled = false;
generateWorld();
