// 狀態管理系統 - 統一管理玩家的buff、debuff和臨時效果
const BuffSystem = {
    // 所有可用的buff類型及其效果
    buffTypes: {
        // 生命強化 - 增加最大生命值（階梯）
        hp_boost: {
            name: '生命強化',
            apply: function(player) {
                const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                    ? TalentSystem.getTalentLevel('hp_boost') : 0;
                const amounts = [0, 20, 50, 100];
                const healthBoost = amounts[Math.min(lv, 3)] || 0;
                player.maxHealth = CONFIG.PLAYER.MAX_HEALTH + healthBoost;
                player.health = player.maxHealth;
                if (typeof UI !== 'undefined' && UI.updateHealthBar) {
                    UI.updateHealthBar(player.health, player.maxHealth);
                }
            },
            remove: function(player) {
                player.maxHealth = CONFIG.PLAYER.MAX_HEALTH;
                player.health = Math.min(player.health, player.maxHealth);
                if (typeof UI !== 'undefined' && UI.updateHealthBar) {
                    UI.updateHealthBar(player.health, player.maxHealth);
                }
            }
        },
        // 防禦強化 - 每次受到傷害減免（階梯）
        defense_boost: {
            name: '防禦強化',
            apply: function(player) {
                const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                    ? TalentSystem.getTalentLevel('defense_boost') : 0;
                const reductions = [0, 2, 5, 8];
                player.damageReductionFlat = reductions[Math.min(lv, 3)] || 0;
            },
            remove: function(player) {
                player.damageReductionFlat = 0;
            }
        },
        // 移動加速 - 乘算基礎移速（階梯）
        speed_boost: {
            name: '移動加速',
            apply: function(player) {
                const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                    ? TalentSystem.getTalentLevel('speed_boost') : 0;
                const multipliers = [1.0, 1.1, 1.3, 1.5];
                const mul = multipliers[Math.min(lv, 3)] || 1.0;
                player.speed = CONFIG.PLAYER.SPEED * mul;
            },
            remove: function(player) {
                player.speed = CONFIG.PLAYER.SPEED;
            }
        },
        // 新增：拾取範圍增加
        pickup_range_boost: {
            name: '拾取範圍增加',
            apply: function(player) {
                const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                    ? TalentSystem.getTalentLevel('pickup_range_boost') : 0;
                const multipliers = [1.0, 1.3, 1.5, 2.0];
                const mul = multipliers[Math.min(lv, 3)] || 1.0;
                player.pickupRangeMultiplier = mul;
            },
            remove: function(player) {
                player.pickupRangeMultiplier = 1.0;
            }
        },
        // 新增：回血強化（階梯，乘算速度）
        regen_speed_boost: {
            name: '回血強化',
            apply: function(player) {
                const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                    ? TalentSystem.getTalentLevel('regen_speed_boost') : 0;
                const multipliers = [1.0, 1.30, 1.60, 2.00];
                const mul = multipliers[Math.min(lv, 3)] || 1.0;
                player.healthRegenSpeedMultiplier = mul;
            },
            remove: function(player) {
                player.healthRegenSpeedMultiplier = 1.0;
            }
        },
        // 已移除 damage_boost：邏輯整合於統一傷害公式
        // 可以這裡添加更多buff類型
    },
    
    // 初始化玩家的buff系統
    initPlayerBuffs: function(player) {
        if (!player) return;
        if (!player.buffs) {
            player.buffs = {};
        }
        // 基礎屬性預設值（避免未套用buff時取值為undefined）
        if (player.pickupRangeMultiplier == null) player.pickupRangeMultiplier = 1.0;
        if (player.damageReductionFlat == null) player.damageReductionFlat = 0;
        if (player.healthRegenSpeedMultiplier == null) player.healthRegenSpeedMultiplier = 1.0;
        // 新增：傷害與爆擊相關屬性（不影響UI與數值，僅初始化）
        if (player.damageTalentBaseBonusPct == null) player.damageTalentBaseBonusPct = 0;
        if (player.damageSpecializationFlat == null) player.damageSpecializationFlat = 0;
        if (player.critChanceBonusPct == null) player.critChanceBonusPct = 0;
        
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
            const hpLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('hp_boost') : 0;
            const defLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('defense_boost') : 0;
            const spdLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('speed_boost') : 0;
            const prLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('pickup_range_boost') : 0;
            const dmgLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('damage_boost') : 0;
            const regenLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('regen_speed_boost') : 0;
            // 依序套用存在的階梯效果
            if (hpLv > 0) this.applyBuff(player, 'hp_boost');
            if (defLv > 0) this.applyBuff(player, 'defense_boost');
            if (spdLv > 0) this.applyBuff(player, 'speed_boost');
            if (prLv > 0) this.applyBuff(player, 'pickup_range_boost');
            if (regenLv > 0) this.applyBuff(player, 'regen_speed_boost');
            
            // 新增：根據天賦等級設定「基礎傷害加成（只加LV1基礎值）」、「傷害特化（+2/+4/+6）」、「爆擊加成（+5/10/15%）」
            // 不新增卡片與UI：若對應天賦未定義，getTalentLevel 回傳0，保持預設0/不加成
            const dmgTalentPctTable = [0, 0.05, 0.10, 0.15];
            player.damageTalentBaseBonusPct = dmgTalentPctTable[Math.min(dmgLv, 3)] || 0;
            const specLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('damage_specialization') : 0;
            const specFlatTable = [0, 2, 4, 6];
            player.damageSpecializationFlat = specFlatTable[Math.min(specLv, 3)] || 0;
            const critLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('crit_enhance') : 0;
            const critPctTable = [0, 0.05, 0.10, 0.15];
            player.critChanceBonusPct = critPctTable[Math.min(critLv, 3)] || 0;
        } catch (e) {
            console.error('從天賦系統應用buff失敗:', e);
        }
    }
};
