// 狀態管理系統 - 統一管理玩家的buff、debuff和臨時效果
const BuffSystem = {
    // 所有可用的buff類型及其效果
    buffTypes: {
        // 生命強化 - 增加最大生命值
        hp_boost: {
            name: '生命強化',
            apply: function(player) {
                const healthBoost = 20;
                player.maxHealth = CONFIG.PLAYER.MAX_HEALTH + healthBoost;
                player.health = player.maxHealth;
                console.log(`已應用生命強化buff，當前血量: ${player.health}/${player.maxHealth}`);
                
                // 更新UI
                if (typeof UI !== 'undefined' && UI.updateHealthBar) {
                    UI.updateHealthBar(player.health, player.maxHealth);
                }
            },
            remove: function(player) {
                player.maxHealth = CONFIG.PLAYER.MAX_HEALTH;
                player.health = Math.min(player.health, player.maxHealth);
                console.log(`已移除生命強化buff，當前血量: ${player.health}/${player.maxHealth}`);
                
                // 更新UI
                if (typeof UI !== 'undefined' && UI.updateHealthBar) {
                    UI.updateHealthBar(player.health, player.maxHealth);
                }
            }
        },
        // 可以在這裡添加更多buff類型
    },
    
    // 初始化玩家的buff系統
    initPlayerBuffs: function(player) {
        if (!player.buffs) {
            player.buffs = {};
        }
        
        // 初始化所有buff為未激活狀態
        for (const buffId in this.buffTypes) {
            player.buffs[buffId] = false;
        }
    },
    
    // 應用指定的buff到玩家身上
    applyBuff: function(player, buffId) {
        if (!player || !buffId || !this.buffTypes[buffId]) return;
        
        // 標記buff為激活狀態
        player.buffs[buffId] = true;
        
        // 應用buff效果
        const buff = this.buffTypes[buffId];
        if (buff && typeof buff.apply === 'function') {
            buff.apply(player);
        }
        
        // 觸發事件通知
        if (typeof EventSystem !== 'undefined') {
            EventSystem.trigger('buff_applied', { player, buffId });
        }
    },
    
    // 移除指定的buff
    removeBuff: function(player, buffId) {
        if (!player || !buffId || !this.buffTypes[buffId]) return;
        
        // 標記buff為未激活狀態
        player.buffs[buffId] = false;
        
        // 應用buff移除效果
        const buff = this.buffTypes[buffId];
        if (buff && typeof buff.remove === 'function') {
            buff.remove(player);
        }
        
        // 觸發事件通知
        if (typeof EventSystem !== 'undefined') {
            EventSystem.trigger('buff_removed', { player, buffId });
        }
    },
    
    // 重置所有buff
    resetAllBuffs: function(player) {
        if (!player || !player.buffs) return;
        
        // 移除所有激活的buff
        for (const buffId in player.buffs) {
            if (player.buffs[buffId]) {
                this.removeBuff(player, buffId);
            }
        }
    },
    
    // 從天賦系統應用buff
    applyBuffsFromTalents: function(player) {
        if (!player) return;
        
        try {
            // 獲取已解鎖的天賦
            const unlockedTalents = TalentSystem.getUnlockedTalents();
            
            // 應用對應的buff
            unlockedTalents.forEach(talentId => {
                if (this.buffTypes[talentId]) {
                    this.applyBuff(player, talentId);
                }
            });
        } catch (e) {
            console.error('從天賦系統應用buff失敗:', e);
        }
    }
};