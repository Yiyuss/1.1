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
                const oldMaxHealth = player.maxHealth || baseMax;
                player.maxHealth = baseMax + healthBoost;
                // 只有在最大血量增加时才按比例增加当前血量，而不是直接满血
                // 如果最大血量减少，则保持当前血量但不超过新上限
                if (player.maxHealth > oldMaxHealth) {
                    // 最大血量增加：按比例增加当前血量
                    const healthRatio = player.health / oldMaxHealth;
                    player.health = Math.min(player.maxHealth, Math.floor(player.health + (player.maxHealth - oldMaxHealth) * healthRatio));
                } else {
                    // 最大血量减少或不变：保持当前血量但不超过新上限
                    player.health = Math.min(player.health, player.maxHealth);
                }
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
        // 新增：回血強化（階梯，加算速度）
        regen_speed_boost: {
            name: '回血強化',
            apply: function(player) {
                const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                    ? TalentSystem.getTalentLevel('regen_speed_boost') : 0;
                const mul = BuffSystem._getTierEffect('regen_speed_boost', lv, 'multiplier', 1.0) || 1.0;
                // 將倍率轉換為加成百分比（例如 2.30 → +130%）
                const talentBoost = mul - 1.0;
                // 與心意相通/腎上腺素技能疊加（加算，不是乘算）
                // 確保技能倍率存在且有效（如果沒有該技能，應該是 1.0）
                const skillMul = (player._heartConnectionRegenMultiplier != null && player._heartConnectionRegenMultiplier > 0)
                    ? player._heartConnectionRegenMultiplier 
                    : 1.0;
                const skillBoost = skillMul - 1.0;
                // 最終倍率 = 基礎(1.0) + 天賦加成 + 技能加成
                const oldMultiplier = player.healthRegenSpeedMultiplier || 1.0;
                player.healthRegenSpeedMultiplier = 1.0 + talentBoost + skillBoost;
                // 當回血速度倍率改變時，重置回血累積器，避免瞬間回滿血
                if (oldMultiplier !== player.healthRegenSpeedMultiplier && player.healthRegenAccumulator != null) {
                    player.healthRegenAccumulator = 0;
                }
            },
            remove: function(player) {
                // 移除時，如果還有心意相通/腎上腺素，保留技能倍率
                const skillMul = (player._heartConnectionRegenMultiplier != null && player._heartConnectionRegenMultiplier > 0)
                    ? player._heartConnectionRegenMultiplier 
                    : 1.0;
                player.healthRegenSpeedMultiplier = skillMul;
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
        // 初始化心意相通倍率為1.0（確保沒有殘留值）
        if (player._heartConnectionRegenMultiplier == null) player._heartConnectionRegenMultiplier = 1.0;
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
        
        // ✅ 修復：確保天賦傷害加成在升級時也正確應用
        // 如果玩家已經有 damageTalentBaseBonusPct，保持它（由 applyBuffsFromTalents 設置）
        // 如果沒有，確保初始化為 0（避免 undefined）
        if (player.damageTalentBaseBonusPct == null) {
            player.damageTalentBaseBonusPct = 0;
        }
        if (player.damageSpecializationFlat == null) {
            player.damageSpecializationFlat = 0;
        }

        // 新增：生命與防禦升級疊加（與天賦相加，單純加法）
        try {
            const hpTalentLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('hp_boost') : 0;
            const hpTalentFlat = BuffSystem._getTierEffect('hp_boost', hpTalentLv, 'hp', 0) || 0;
            const hpUpgradeFlat = 20 * hpLv; // 每級+20
            // ✅ 修復：組隊模式下生命值加乘卡住的BUG
            // 必須使用 player.baseMaxHealth 或 CONFIG.PLAYER.MAX_HEALTH 作為 baseMax
            // 不能使用 player.maxHealth 作為後備值，因為在組隊模式下它可能被伺服器同步的舊值覆蓋
            const baseMax = (player && typeof player.baseMaxHealth === 'number')
                ? player.baseMaxHealth
                : ((CONFIG && CONFIG.PLAYER && CONFIG.PLAYER.MAX_HEALTH) ? CONFIG.PLAYER.MAX_HEALTH : 200);
            const oldMaxHealth = player.maxHealth || baseMax;
            player.maxHealth = baseMax + hpTalentFlat + hpUpgradeFlat;
            // ✅ 修復：當 maxHealth 增加時，按比例調整當前血量，避免生命值加乘被取消
            if (player.maxHealth > oldMaxHealth) {
                // 最大血量增加：按比例增加当前血量
                const healthRatio = oldMaxHealth > 0 ? (player.health / oldMaxHealth) : 1.0;
                player.health = Math.min(player.maxHealth, Math.floor(player.health + (player.maxHealth - oldMaxHealth) * healthRatio));
            } else {
                // 最大血量减少或不变：保持当前血量但不超过新上限
                player.health = Math.min(player.health, player.maxHealth);
            }
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
    
    clearDerivedCombatStats: function(player) {
        if (!player) return;
        player.damageTalentBaseBonusPct = 0;
        player.damageSpecializationFlat = 0;
        player.damageAttributeBonusPct = 0;
        player.attackPowerUpgradeFlat = 0;
        player.critChanceUpgradeBonusPct = 0;
        player.critChanceBonusPct = 0;
        player.dodgeTalentRate = 0;
        player.healthRegenSpeedMultiplier = 1.0;
        player._heartConnectionRegenMultiplier = 1.0;
    },
    
    // 從天賦系統應用buff（使用本地天賦系統）
    applyBuffsFromTalents: function(player) {
        if (!player) return;
        try {
            this.clearDerivedCombatStats(player);
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
            // ✅ 修復：心意相通升級時生命值加乘被取消的BUG
            // 不要在 applyBuffsFromTalents 中調用 hp_boost.apply，因為它只考慮天賦加成，不考慮局內升級
            // 統一由 applyAttributeUpgrades 處理生命值（包括天賦和局內升級），避免生命值被重置兩次
            // 依序套用存在的階梯效果（跳過 hp_boost，由 applyAttributeUpgrades 統一處理）
            if (defLv > 0) this.applyBuff(player, 'defense_boost');
            if (spdLv > 0) this.applyBuff(player, 'speed_boost');
            if (prLv > 0) this.applyBuff(player, 'pickup_range_boost');
            if (regenLv > 0) this.applyBuff(player, 'regen_speed_boost');
            if (expLv > 0) this.applyBuff(player, 'experience_boost');
            
            // 應用傷害強化（damage_boost）
            // ✅ 修復：設置 damageTalentBaseBonusPct 而不是 damageMultiplier
            // _computeFinalDamage 使用 damageTalentBaseBonusPct，所以必須設置這個屬性
            if (dmgLv > 0) {
                const tier = (typeof TalentSystem !== 'undefined' && TalentSystem.tieredTalents && TalentSystem.tieredTalents.damage_boost && TalentSystem.tieredTalents.damage_boost.levels)
                    ? TalentSystem.tieredTalents.damage_boost.levels[dmgLv - 1] : null;
                if (tier && typeof tier.multiplier === 'number') {
                    // ✅ 修復：設置 damageTalentBaseBonusPct（百分比加成，例如 1.10 → 0.10 = +10%）
                    player.damageTalentBaseBonusPct = (tier.multiplier - 1.0) || 0;
                } else {
                    player.damageTalentBaseBonusPct = 0;
                }
            } else {
                player.damageTalentBaseBonusPct = 0;
            }
            
            // 應用傷害特化（damage_specialization）
            const specLv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? TalentSystem.getTalentLevel('damage_specialization') : 0;
            if (specLv > 0) {
                player.damageSpecializationFlat = this._getTierEffect('damage_specialization', specLv, 'flat', 0) || 0;
            } else {
                player.damageSpecializationFlat = 0;
            }
            
            // ✅ 修復：統一由 applyAttributeUpgrades 處理生命值（包括天賦和局內升級）
            // 這樣可以確保生命值只被計算一次，不會被重置
            this.applyAttributeUpgrades(player);
            
            // 處理心意相通/腎上腺素技能的回血速度提升
            // 先清除技能倍率（確保沒有殘留值）
            player._heartConnectionRegenMultiplier = 1.0;
            if (player.weapons && Array.isArray(player.weapons)) {
                const regenSkillWeapon = player.weapons.find(w => w && (w.type === 'HEART_CONNECTION' || w.type === 'ADRENALINE'));
                if (regenSkillWeapon) {
                    // 確保 config 存在（如果沒有，從 CONFIG.WEAPONS 獲取）
                    const config = regenSkillWeapon.config || (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS[regenSkillWeapon.type]) ? CONFIG.WEAPONS[regenSkillWeapon.type] : null;
                    if (config) {
                        const boostPerLevel = config.REGEN_SPEED_BOOST_PER_LEVEL || 0.30;
                        const level = regenSkillWeapon.level || 1;
                        // 計算技能倍率（例如 LV3: 1.0 + 0.30 * 3 = 1.90）
                        const totalBoost = 1.0 + (boostPerLevel * level);
                        player._heartConnectionRegenMultiplier = totalBoost;
                    }
                }
            }
            // 觸發回血強化buff更新（會自動與天賦和心意相通加算）
            const oldMultiplier = player.healthRegenSpeedMultiplier || 1.0;
            if (regenLv > 0) {
                // 回血強化已經在上面應用過了，這裡只需要確保心意相通疊加
                const heartConnectionMul = (player._heartConnectionRegenMultiplier != null && player._heartConnectionRegenMultiplier > 1.0) 
                    ? player._heartConnectionRegenMultiplier 
                    : 1.0;
                // 與天賦疊加（加算）
                player.healthRegenSpeedMultiplier = (player.healthRegenSpeedMultiplier || 1.0) + (heartConnectionMul - 1.0);
            } else {
                // 如果沒有天賦，檢查是否有心意相通
                const heartConnectionMul = (player._heartConnectionRegenMultiplier != null && player._heartConnectionRegenMultiplier > 1.0) 
                    ? player._heartConnectionRegenMultiplier 
                    : 1.0;
                player.healthRegenSpeedMultiplier = heartConnectionMul;
            }
            // 當回血速度倍率改變時，重置回血累積器，避免瞬間回滿血
            if (oldMultiplier !== player.healthRegenSpeedMultiplier && player.healthRegenAccumulator != null) {
                player.healthRegenAccumulator = 0;
            }
        } catch (e) {
            console.error('應用天賦buff失敗:', e);
        }
    },
    
    // 從指定的天賦等級對象應用buff（用於組隊模式的遠程玩家）
    applyBuffsFromTalentLevels: function(player, talentLevels) {
        if (!player || !talentLevels || typeof talentLevels !== 'object') return;
        try {
            this.clearDerivedCombatStats(player);
            const hpLv = parseInt(talentLevels.hp_boost || 0, 10) || 0;
            const defLv = parseInt(talentLevels.defense_boost || 0, 10) || 0;
            const spdLv = parseInt(talentLevels.speed_boost || 0, 10) || 0;
            const prLv = parseInt(talentLevels.pickup_range_boost || 0, 10) || 0;
            const dmgLv = parseInt(talentLevels.damage_boost || 0, 10) || 0;
            const regenLv = parseInt(talentLevels.regen_speed_boost || 0, 10) || 0;
            const expLv = parseInt(talentLevels.experience_boost || 0, 10) || 0;
            const specLv = parseInt(talentLevels.damage_specialization || 0, 10) || 0;
            const critLv = parseInt(talentLevels.crit_enhance || 0, 10) || 0;
            const dodgeLv = parseInt(talentLevels.dodge_enhance || 0, 10) || 0;
            
            // 臨時替換 TalentSystem.getTalentLevel 來使用指定的天賦等級
            const originalGetTalentLevel = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel) ? TalentSystem.getTalentLevel.bind(TalentSystem) : null;
            if (originalGetTalentLevel && typeof TalentSystem !== 'undefined') {
                TalentSystem.getTalentLevel = function(id) {
                    const level = (talentLevels && typeof talentLevels[id] === 'number') ? talentLevels[id] : 0;
                    const cfg = this.tieredTalents[id];
                    if (!cfg) return 0;
                    return Math.max(0, Math.min(level, cfg.levels.length));
                }.bind(TalentSystem);
            }
            
            // ✅ 修復：移除單獨的生命值處理，統一由 applyAttributeUpgrades 處理（包括天賦和局內升級）
            // 這樣可以確保心意相通升級時生命值加乘不會丟失
            // 生命值處理將在 applyAttributeUpgrades 中統一處理（Line 514）
            if (defLv > 0) {
                const reduction = this._getTierEffect('defense_boost', defLv, 'reduction', 0) || 0;
                player.damageReductionFlat = reduction;
            }
            if (spdLv > 0) {
                const mul = this._getTierEffect('speed_boost', spdLv, 'multiplier', 1.0) || 1.0;
                player.speed = CONFIG.PLAYER.SPEED * mul;
            }
            if (prLv > 0) {
                const mul = this._getTierEffect('pickup_range_boost', prLv, 'multiplier', 1.0) || 1.0;
                player.pickupRangeMultiplier = mul;
            }
            if (regenLv > 0) {
                const mul = this._getTierEffect('regen_speed_boost', regenLv, 'multiplier', 1.0) || 1.0;
                player.healthRegenSpeedMultiplier = mul;
            }
            if (expLv > 0) {
                const mul = this._getTierEffect('experience_boost', expLv, 'multiplier', 1.0) || 1.0;
                player.experienceMultiplier = mul;
            }
            
            // 應用傷害強化（damage_boost）
            if (dmgLv > 0) {
                const tier = this._getTierEffect('damage_boost', dmgLv, 'multiplier', 1.0);
                if (tier && typeof tier === 'number' && tier > 1.0) {
                    if (!player.damageMultiplier) player.damageMultiplier = 1.0;
                    player.damageMultiplier *= tier;
                }
                player.damageTalentBaseBonusPct = (tier - 1.0) || 0;
            }
            
            // 應用傷害特化（damage_specialization）
            if (specLv > 0) {
                player.damageSpecializationFlat = this._getTierEffect('damage_specialization', specLv, 'flat', 0) || 0;
            }
            
            // 應用爆擊強化
            if (critLv > 0) {
                const critTalentPct = this._getTierEffect('crit_enhance', critLv, 'chancePct', 0) || 0;
                const charBaseCritBonus = (player._characterBaseCritBonusPct != null) ? player._characterBaseCritBonusPct : 0;
                player.critChanceBonusPct = critTalentPct + charBaseCritBonus;
            }
            
            // 應用迴避強化
            if (dodgeLv > 0) {
                player.dodgeTalentRate = this._getTierEffect('dodge_enhance', dodgeLv, 'dodgeRate', 0) || 0;
            }
            
            // 心意相通/腎上腺素技能：檢查玩家是否擁有該技能並應用回血速度提升
            // 先清除技能倍率（確保沒有殘留值）
            player._heartConnectionRegenMultiplier = 1.0;
            if (player.weapons && Array.isArray(player.weapons)) {
                const regenSkillWeapon = player.weapons.find(w => w && (w.type === 'HEART_CONNECTION' || w.type === 'ADRENALINE'));
                if (regenSkillWeapon) {
                    // 確保 config 存在（如果沒有，從 CONFIG.WEAPONS 獲取）
                    const config = regenSkillWeapon.config || (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS[regenSkillWeapon.type]) ? CONFIG.WEAPONS[regenSkillWeapon.type] : null;
                    if (config) {
                        const boostPerLevel = config.REGEN_SPEED_BOOST_PER_LEVEL || 0.20;
                        const level = regenSkillWeapon.level || 1;
                        // 計算技能倍率（例如 LV10: 1.0 + 0.20 * 10 = 3.0）
                        const totalBoost = 1.0 + (boostPerLevel * level);
                        player._heartConnectionRegenMultiplier = totalBoost;
                    }
                }
            }
            // 觸發回血強化buff更新（會自動與天賦和心意相通加算）
            const oldMultiplier = player.healthRegenSpeedMultiplier || 1.0;
            if (regenLv > 0) {
                // 回血強化已經在上面應用過了，這裡只需要確保心意相通疊加
                const heartConnectionMul = (player._heartConnectionRegenMultiplier != null && player._heartConnectionRegenMultiplier > 1.0) 
                    ? player._heartConnectionRegenMultiplier 
                    : 1.0;
                // 與天賦疊加（加算）
                player.healthRegenSpeedMultiplier = (player.healthRegenSpeedMultiplier || 1.0) + (heartConnectionMul - 1.0);
            } else {
                // 如果沒有天賦，檢查是否有心意相通
                const heartConnectionMul = (player._heartConnectionRegenMultiplier != null && player._heartConnectionRegenMultiplier > 1.0) 
                    ? player._heartConnectionRegenMultiplier 
                    : 1.0;
                player.healthRegenSpeedMultiplier = heartConnectionMul;
            }
            // 當回血速度倍率改變時，重置回血累積器，避免瞬間回滿血
            if (oldMultiplier !== player.healthRegenSpeedMultiplier && player.healthRegenAccumulator != null) {
                player.healthRegenAccumulator = 0;
            }
            
            // 應用屬性升級（局內等級加成）
            this.applyAttributeUpgrades(player);
            const upgradeCritPct = player.critChanceUpgradeBonusPct || 0;
            // 角色基礎爆擊率加成（若角色配置中有設定，例如第四位角色洛可洛斯特+10%）
            const charBaseCritBonus = (player._characterBaseCritBonusPct != null) ? player._characterBaseCritBonusPct : 0;
            // 更新爆擊率（如果之前沒有設置，現在設置）
            if (critLv > 0) {
                const critTalentPct = this._getTierEffect('crit_enhance', critLv, 'chancePct', 0) || 0;
                player.critChanceBonusPct = critTalentPct + upgradeCritPct + charBaseCritBonus;
            } else {
                player.critChanceBonusPct = upgradeCritPct + charBaseCritBonus;
            }
            
            // 恢復原始函數
            if (originalGetTalentLevel && typeof TalentSystem !== 'undefined') {
                TalentSystem.getTalentLevel = originalGetTalentLevel;
            }
        } catch (e) {
            console.error('應用遠程玩家天賦buff失敗:', e);
        }
    }
};
