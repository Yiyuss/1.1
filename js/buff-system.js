// 狀態管理系統 - 統一管理玩家的buff、debuff和臨時效果
const BuffSystem = {
    // 工具：從天賦表讀取對應等級的效果鍵值
    _getTierEffect(talentId, level, key, fallback) {
        try {
            if (!TalentSystem || !TalentSystem.tieredTalents) return fallback;
            if (level <= 0) return fallback;
            const conf = TalentSystem.tieredTalents[talentId];
            if (!conf || !Array.isArray(conf.levels) || conf.levels.length === 0) return fallback;
            const idx = Math.min(level - 1, conf.levels.length - 1);
            const eff = conf.levels[idx] || {};
            return key in eff ? eff[key] : fallback;
        } catch (_) {
            return fallback;
        }
    },
    // 所有可用的buff類型及其效果
    buffTypes: {
        // 生命強化 - 增加最大生命值（階梯）
        hp_boost: {
            name: '生命強化',
            apply: function(player) {
                const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                    ? TalentSystem.getTalentLevel('hp_boost') : 0;
                const healthBoost = BuffSystem._getTierEffect('hp_boost', lv, 'hp', 0) || 0;
                const baseMax = (player && typeof player.baseMaxHealth === 'number')
                    ? player.baseMaxHealth
                    : CONFIG.PLAYER.MAX_HEALTH;
                player.maxHealth = baseMax + healthBoost;
                player.health = player.maxHealth;
                if (typeof UI !== 'undefined' && UI.updateHealthBar) {
                    UI.updateHealthBar(player.health, player.maxHealth);
                }
            },
            remove: function(player) {
                const baseMax = (player && typeof player.baseMaxHealth === 'number')
                    ? player.baseMaxHealth
                    : CONFIG.PLAYER.MAX_HEALTH;
                player.maxHealth = baseMax;
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
                const reduction = BuffSystem._getTierEffect('defense_boost', lv, 'reduction', 0) || 0;
                player.damageReductionFlat = reduction;
            },
            remove: function(player) {
                player.damageReductionFlat = 0;
            }
        },
        // 移動速度提升（階梯）
        speed_boost: {
            name: '移動加速',
            apply: function(player) {
                const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                    ? TalentSystem.getTalentLevel('speed_boost') : 0;
                const mul = BuffSystem._getTierEffect('speed_boost', lv, 'multiplier', 1.0) || 1.0;
                player.speed = CONFIG.PLAYER.SPEED * mul;
            },
            remove: function(player) {
                player.speed = CONFIG.PLAYER.SPEED;
            }
        },
        // 拾取範圍提升（階梯）
        pickup_range_boost: {
            name: '拾取範圍增加',
            apply: function(player) {
                const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                    ? TalentSystem.getTalentLevel('pickup_range_boost') : 0;
                const mul = BuffSystem._getTierEffect('pickup_range_boost', lv, 'multiplier', 1.0) || 1.0;
                player.pickupRangeMultiplier = mul;
            },
            remove: function(player) {
                player.pickupRangeMultiplier = 1.0;
            }
        },
        // 經驗值強化（階梯，乘算經驗獲得）
        experience_boost: {
            name: '經驗值強化',
            apply: function(player) {
                const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                    ? TalentSystem.getTalentLevel('experience_boost') : 0;
                const mul = BuffSystem._getTierEffect('experience_boost', lv, 'multiplier', 1.0) || 1.0;
                player.experienceGainMultiplier = mul;
            },
            remove: function(player) {
                player.experienceGainMultiplier = 1.0;
            }
        },
        // 新增：回血強化（階梯，乘算速度）
        regen_speed_boost: {
            name: '回血強化',
            apply: function(player) {
                const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                    ? TalentSystem.getTalentLevel('regen_speed_boost') : 0;
                const mul = BuffSystem._getTierEffect('regen_speed_boost', lv, 'multiplier', 1.0) || 1.0;
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
        if (player.experienceGainMultiplier == null) player.experienceGainMultiplier = 1.0;
        // 新增：傷害與爆擊相關屬性（不影響UI與數值，僅初始化）
        if (player.damageTalentBaseBonusPct == null) player.damageTalentBaseBonusPct = 0;
        if (player.damageSpecializationFlat == null) player.damageSpecializationFlat = 0;
        if (player.critChanceBonusPct == null) player.critChanceBonusPct = 0;
        // 新增：等級升級屬性（會在每局內累加，不寫入 localStorage）
        if (player.attackUpgradeLevel == null) player.attackUpgradeLevel = 0;
        if (player.critUpgradeLevel == null) player.critUpgradeLevel = 0;
        if (player.healthUpgradeLevel == null) player.healthUpgradeLevel = 0;
        if (player.defenseUpgradeLevel == null) player.defenseUpgradeLevel = 0;
        if (player.damageAttributeBonusPct == null) player.damageAttributeBonusPct = 0; // 由升級：每級+10%
        if (player.critChanceUpgradeBonusPct == null) player.critChanceUpgradeBonusPct = 0; // 由升級：每級+2%
        // 新增：基礎攻擊力上升（每級+2，單純加法，不影響公式百分比）
        if (player.attackPowerUpgradeLevel == null) player.attackPowerUpgradeLevel = 0;
        if (player.attackPowerUpgradeFlat == null) player.attackPowerUpgradeFlat = 0;
        
        // 初始化所有buff為未激活狀態
        for (const buffId in this.buffTypes) {
            player.buffs[buffId] = false;
        }
    },

    // 根據局內屬性等級，計算對應的加成值（不寫入 localStorage）
    // 維護備註：
    // - attackUpgradeLevel: 0..10 -> damageAttributeBonusPct = 0.10 * 等級
    // - critUpgradeLevel:   0..10 -> critChanceUpgradeBonusPct = 0.02 * 等級
    // - 與天賦相加：player.critChanceBonusPct = 天賦爆擊率% + 升級爆擊率%
    applyAttributeUpgrades: function(player) {
        if (!player) return;
        const atkLv = Math.max(0, Math.min(10, player.attackUpgradeLevel || 0));
        const crtLv = Math.max(0, Math.min(10, player.critUpgradeLevel || 0));
        const hpLv = Math.max(0, Math.min(10, player.healthUpgradeLevel || 0));
        const defLv = Math.max(0, Math.min(10, player.defenseUpgradeLevel || 0));
        const atkFlatLv = Math.max(0, Math.min(10, player.attackPowerUpgradeLevel || 0));
        player.damageAttributeBonusPct = 0.10 * atkLv;
        player.critChanceUpgradeBonusPct = 0.02 * crtLv;
        player.attackPowerUpgradeFlat = 2 * atkFlatLv; // 單純加法：每級+2
        // 與天賦相加（若天賦稍後重算，也會覆寫為一致的值）
        const critLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
            ? TalentSystem.getTalentLevel('crit_enhance') : 0;
        const critTalentPct = BuffSystem._getTierEffect('crit_enhance', critLv, 'chancePct', 0) || 0;
        // 角色基礎爆擊率加成（若角色配置中有設定，例如第四位角色洛可洛斯特+10%）
        const charBaseCritBonus = (player._characterBaseCritBonusPct != null) ? player._characterBaseCritBonusPct : 0;
        player.critChanceBonusPct = critTalentPct + player.critChanceUpgradeBonusPct + charBaseCritBonus;

        // 新增：生命與防禦升級疊加（與天賦相加，單純加法）
        try {
            const hpTalentLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('hp_boost') : 0;
            const hpTalentFlat = BuffSystem._getTierEffect('hp_boost', hpTalentLv, 'hp', 0) || 0;
            const hpUpgradeFlat = 20 * hpLv; // 每級+20
            const baseMax = (player && typeof player.baseMaxHealth === 'number')
                ? player.baseMaxHealth
                : ((CONFIG && CONFIG.PLAYER ? CONFIG.PLAYER.MAX_HEALTH : (player.maxHealth || 100)));
            player.maxHealth = baseMax + hpTalentFlat + hpUpgradeFlat;
            player.health = Math.min(player.health, player.maxHealth);
            if (typeof UI !== 'undefined' && UI.updateHealthBar) {
                UI.updateHealthBar(player.health, player.maxHealth);
            }
        } catch (_) {}

        // 基礎防禦：1 + 升級等級；與天賦平減相加在 takeDamage 中生效
        player.baseDefense = 1 + defLv;
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
            const expLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('experience_boost') : 0;
            // 依序套用存在的階梯效果
            if (hpLv > 0) this.applyBuff(player, 'hp_boost');
            if (defLv > 0) this.applyBuff(player, 'defense_boost');
            if (spdLv > 0) this.applyBuff(player, 'speed_boost');
            if (prLv > 0) this.applyBuff(player, 'pickup_range_boost');
            if (regenLv > 0) this.applyBuff(player, 'regen_speed_boost');
            if (expLv > 0) this.applyBuff(player, 'experience_boost');
            
            // 統一讀取六階：基礎傷害%、傷害特化平值、爆擊率%
            player.damageTalentBaseBonusPct = BuffSystem._getTierEffect('damage_boost', dmgLv, 'multiplier', 1.0) - 1.0 || 0;
            const specLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('damage_specialization') : 0;
            player.damageSpecializationFlat = BuffSystem._getTierEffect('damage_specialization', specLv, 'flat', 0) || 0;
            const critLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('crit_enhance') : 0;
            const critTalentPct = BuffSystem._getTierEffect('crit_enhance', critLv, 'chancePct', 0) || 0;
            // 先依當前局內等級重算升級加成，再合併
            this.applyAttributeUpgrades(player);
            const upgradeCritPct = player.critChanceUpgradeBonusPct || 0;
            // 角色基礎爆擊率加成（若角色配置中有設定，例如第四位角色洛可洛斯特+10%）
            const charBaseCritBonus = (player._characterBaseCritBonusPct != null) ? player._characterBaseCritBonusPct : 0;
            player.critChanceBonusPct = critTalentPct + upgradeCritPct + charBaseCritBonus;
            
            // 迴避強化天賦
            const dodgeLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('dodge_enhance') : 0;
            player.dodgeTalentRate = BuffSystem._getTierEffect('dodge_enhance', dodgeLv, 'dodgeRate', 0) || 0;
        } catch (e) {
            console.error('從天賦系統應用buff失敗:', e);
        }
    }
};
