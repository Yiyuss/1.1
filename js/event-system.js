// 事件系統 - 集中管理遊戲中的事件，減少模塊間直接依賴
const EventSystem = {
    // 事件監聽器存儲
    listeners: {},
    
    // 初始化事件系統
    init: function() {
        this.listeners = {};
        console.log('事件系統已初始化');
    },
    
    // 添加事件監聽器
    on: function(eventName, callback) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(callback);
        return this; // 支持鏈式調用
    },
    
    // 移除事件監聽器
    off: function(eventName, callback) {
        if (!this.listeners[eventName]) return this;
        
        if (callback) {
            // 移除特定回調
            this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
        } else {
            // 移除所有該事件的監聽器
            delete this.listeners[eventName];
        }
        return this;
    },
    
    // 觸發事件
    trigger: function(eventName, data) {
        if (!this.listeners[eventName]) return;
        
        // 複製監聽器數組，避免在回調中修改數組導致問題
        const callbacks = [...this.listeners[eventName]];
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error(`事件 ${eventName} 處理器發生錯誤:`, e);
            }
        });
    },
    
    // 一次性事件監聽器
    once: function(eventName, callback) {
        const onceCallback = (data) => {
            callback(data);
            this.off(eventName, onceCallback);
        };
        return this.on(eventName, onceCallback);
    }
};

// 遊戲常用事件類型
const GameEvents = {
    // 玩家相關
    PLAYER_DAMAGE: 'player_damage',         // 玩家受傷
    PLAYER_HEAL: 'player_heal',             // 玩家治療
    PLAYER_LEVEL_UP: 'player_level_up',     // 玩家升級
    PLAYER_DEATH: 'player_death',           // 玩家死亡
    
    // 敵人相關
    ENEMY_SPAWN: 'enemy_spawn',             // 敵人生成
    ENEMY_DAMAGE: 'enemy_damage',           // 敵人受傷
    ENEMY_DEATH: 'enemy_death',             // 敵人死亡
    
    // 遊戲狀態
    GAME_START: 'game_start',               // 遊戲開始
    GAME_PAUSE: 'game_pause',               // 遊戲暫停
    GAME_RESUME: 'game_resume',             // 遊戲恢復
    GAME_OVER: 'game_over',                 // 遊戲結束
    GAME_VICTORY: 'game_victory',           // 遊戲勝利
    
    // 道具與效果
    ITEM_PICKUP: 'item_pickup',             // 拾取道具
    BUFF_APPLIED: 'buff_applied',           // 增益效果應用
    BUFF_REMOVED: 'buff_removed',           // 增益效果移除
    
    // 波次系統
    WAVE_START: 'wave_start',               // 波次開始
    WAVE_COMPLETE: 'wave_complete',         // 波次完成
    BOSS_SPAWN: 'boss_spawn',               // Boss生成
    BOSS_DEATH: 'boss_death'                // Boss死亡
};