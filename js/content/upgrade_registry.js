/**
 * 升級選單資料正本（體感凍結）
 *
 * - LEVELUP_POOL 順序 = 舊 ui.js availableWeapons。shuffle 前順序會改變抽到的 4 張。
 * - FUSION_OFFER_SEQUENCE 每張融合只進池一次（含光芒萬丈）。
 * - 召喚 AI LV2 只由合成格出，不從「現有武器升級」再出一次。
 * - 新技能：加 CONFIG.WEAPONS 之後還要進 LEVELUP_POOL（或融合表）。只改 CONFIG 不會出現。
 */
(function (root) {
    'use strict';

    const LEVELUP_POOL = Object.freeze([
        'DAGGER', 'FIREBALL', 'LIGHTNING', 'ORBIT', 'STELLAR_ORBIT', 'LASER', 'SING',
        'CHAIN_LIGHTNING', 'AURA_FIELD', 'STELLAR_FIELD', 'INVINCIBLE', 'SLASH',
        'CHICKEN_BLESSING', 'YOUNG_DADA_GLORY', 'BIG_ICE_BALL', 'ABSTRACTION',
        'SIXTH_SENSE', 'PON', 'STARFALL', 'BAGUETTE_THROW', 'PINEAPPLE_ORBIT',
        'GABRIEL_ORBIT', 'WEDDING_CALL_ORBIT', 'ADRENALINE', 'RAINBOW_RESONANCE',
        'DARK_MATTER', 'BLACK_HOLE_PARTICLE', 'DEVOURING_POWER', 'FBI',
        'WHITE_NIGHT_BEAM', 'ROTATING_MUFFIN', 'MUFFIN_THROW', 'DEATHLINE_WARRIOR',
        'UNCONTROLLABLE_BEAST', 'HEART_COMPANION', 'HEART_CONNECTION',
        'HEART_TRANSMISSION', 'JUDGMENT', 'SUMMON_AI'
    ]);

    const LILY_CHEAT_FUSIONS = Object.freeze([
        'MIND_MAGIC', 'GRAVITY_WAVE', 'FRENZY_LIGHTNING', 'FRENZY_SLASH', 'RADIANT_GLORY'
    ]);

    function fusion(result, sources, extra) {
        extra = extra || {};
        return Object.freeze({
            kind: 'fusion',
            result: result,
            sources: Object.freeze(sources.map(function (s) { return Object.freeze({ type: s.type, min: s.min }); })),
            requireFusionUnlock: extra.requireFusionUnlock !== false,
            select: extra.select || 'standard',
            unlockOnSelect: extra.unlockOnSelect || null
        });
    }

    function src(type, min) {
        return { type: type, min: min };
    }

    const FUSION_OFFER_SEQUENCE = Object.freeze([
        fusion('FRENZY_LIGHTNING', [src('DAGGER', 10), src('CHAIN_LIGHTNING', 10)]),
        fusion('PINEAPPLE_SUPPLEMENT', [src('DAGGER', 10), src('ADRENALINE', 10)]),
        fusion('FRENZY_SLASH', [src('DAGGER', 10), src('SLASH', 10)]),
        fusion('DIVINE_JUDGMENT', [src('JUDGMENT', 10), src('SLASH', 10)]),
        fusion('MIND_MAGIC', [src('DAGGER', 10), src('SING', 10)]),
        fusion('FRENZY_ICE_BALL', [src('DAGGER', 10), src('BIG_ICE_BALL', 10)]),
        fusion('GRAVITY_WAVE', [src('AURA_FIELD', 10), src('INVINCIBLE', 10)], { select: 'special' }),
        fusion('INNATE_TEMPERAMENT', [src('AURA_FIELD', 10), src('STELLAR_FIELD', 10)], { select: 'special' }),
        fusion('RADIANT_GLORY', [src('CHAIN_LIGHTNING', 10), src('LASER', 10)], { select: 'special' }),
        Object.freeze({ kind: 'summon_ai_lv2' }),
        fusion('FRENZY_YOUNG_DADA_GLORY', [src('DAGGER', 10), src('YOUNG_DADA_GLORY', 10)]),
        fusion('DEATHLINE_SUPERMAN', [src('DAGGER', 10), src('DEATHLINE_WARRIOR', 10)]),
        fusion('WHITE_RAINBOW_BEAM', [src('LASER', 10), src('WHITE_NIGHT_BEAM', 10)], { select: 'special' }),
        fusion('GRAVITY_COLLAPSE', [src('SLASH', 10), src('BLACK_HOLE_PARTICLE', 10)])
    ]);

    function numericLevel(w) {
        return (w && typeof w.level === 'number') ? w.level : 0;
    }

    function defaultFusionUnlocked(id) {
        try {
            return !!(typeof Achievements !== 'undefined' && Achievements.isFusionUnlocked && Achievements.isFusionUnlocked(id));
        } catch (_) {
            return false;
        }
    }

    function defaultAchievementUnlocked(id) {
        try {
            return !!(typeof Achievements !== 'undefined' && Achievements.isUnlocked && Achievements.isUnlocked(id));
        } catch (_) {
            return false;
        }
    }

    function hiddenSourceTypes(sourceWeaponsInfo) {
        const list = sourceWeaponsInfo || [];
        const owned = new Set(list.map(function (w) { return w.type; }));
        const hidden = new Set();
        const seenResults = new Set();
        for (let i = 0; i < FUSION_OFFER_SEQUENCE.length; i++) {
            const rec = FUSION_OFFER_SEQUENCE[i];
            if (rec.kind !== 'fusion') continue;
            if (seenResults.has(rec.result)) continue;
            seenResults.add(rec.result);
            if (owned.has(rec.result)) {
                rec.sources.forEach(function (s) { hidden.add(s.type); });
            }
        }
        if (list.some(function (w) { return w.type === 'SUMMON_AI' && typeof w.level === 'number' && w.level >= 2; })) {
            hidden.add('CHAIN_LIGHTNING');
        }
        return hidden;
    }

    function getStandardSelect(weaponType) {
        for (let i = 0; i < FUSION_OFFER_SEQUENCE.length; i++) {
            const rec = FUSION_OFFER_SEQUENCE[i];
            if (rec.kind === 'fusion' && rec.result === weaponType && rec.select === 'standard') {
                return {
                    result: rec.result,
                    sourceTypes: rec.sources.map(function (s) { return s.type; }),
                    unlockOnSelect: rec.unlockOnSelect || null
                };
            }
        }
        return null;
    }

    function collectCandidates(ctx) {
        ctx = ctx || {};
        const sourceWeaponsInfo = Array.isArray(ctx.sourceWeaponsInfo) ? ctx.sourceWeaponsInfo : [];
        const ch = ctx.character || null;
        const characters = Array.isArray(ctx.characters) ? ctx.characters : [];
        const player = ctx.player || {};
        const weaponsConfig = ctx.weaponsConfig || ((typeof CONFIG !== 'undefined' && CONFIG.WEAPONS) ? CONFIG.WEAPONS : {});
        const isFusionUnlocked = ctx.isFusionUnlocked || defaultFusionUnlocked;
        const isAchievementUnlocked = ctx.isAchievementUnlocked || defaultAchievementUnlocked;

        const options = [];
        const disabledWeapons = (ch && Array.isArray(ch.disabledWeapons)) ? new Set(ch.disabledWeapons) : new Set();
        const exclusiveWeapons = (ch && Array.isArray(ch.exclusiveWeapons)) ? new Set(ch.exclusiveWeapons) : new Set();
        const allExclusiveWeapons = new Set();
        characters.forEach(function (char) {
            if (char.exclusiveWeapons && Array.isArray(char.exclusiveWeapons)) {
                char.exclusiveWeapons.forEach(function (weapon) { allExclusiveWeapons.add(weapon); });
            }
        });

        const hiddenSources = hiddenSourceTypes(sourceWeaponsInfo);

        for (let i = 0; i < sourceWeaponsInfo.length; i++) {
            const info = sourceWeaponsInfo[i];
            const cfg = weaponsConfig[info.type];
            if (!cfg) continue;
            if (disabledWeapons.has(info.type)) continue;
            if (allExclusiveWeapons.has(info.type) && !exclusiveWeapons.has(info.type)) continue;
            if (hiddenSources.has(info.type)) continue;
            // 召喚 AI LV2 只走融合序列，避免與現有武器升級重複進池
            if (info.type === 'SUMMON_AI') continue;
            if (info.level < cfg.LEVELS.length) {
                options.push({
                    type: info.type,
                    name: cfg.NAME,
                    level: info.level + 1,
                    description: cfg.LEVELS[info.level].DESCRIPTION
                });
            }
        }

        const playerWeaponTypes = sourceWeaponsInfo.map(function (w) { return w.type; });
        for (let j = 0; j < LEVELUP_POOL.length; j++) {
            const weaponType = LEVELUP_POOL[j];
            if (disabledWeapons.has(weaponType)) continue;
            if (allExclusiveWeapons.has(weaponType) && !exclusiveWeapons.has(weaponType)) continue;
            if (hiddenSources.has(weaponType)) continue;
            if (weaponType === 'SUMMON_AI') {
                if (!isAchievementUnlocked('CHALLENGE_NEBULA_CLEAR')) continue;
                if (playerWeaponTypes.indexOf('SUMMON_AI') !== -1) continue;
            }
            if (playerWeaponTypes.indexOf(weaponType) === -1) {
                const weaponConfig = weaponsConfig[weaponType];
                options.push({
                    type: weaponType,
                    name: weaponConfig.NAME,
                    level: 1,
                    description: weaponConfig.LEVELS[0].DESCRIPTION
                });
            }
        }

        for (let k = 0; k < FUSION_OFFER_SEQUENCE.length; k++) {
            try {
                const rec = FUSION_OFFER_SEQUENCE[k];
                if (rec.kind === 'summon_ai_lv2') {
                    const summonAI = sourceWeaponsInfo.find(function (w) { return w.type === 'SUMMON_AI'; });
                    const chainLightningForAI = sourceWeaponsInfo.find(function (w) { return w.type === 'CHAIN_LIGHTNING'; });
                    const hasSummonAILv2 = (summonAI && typeof summonAI.level === 'number' && summonAI.level >= 2);
                    const fusionReadyAI = (!!summonAI && !!chainLightningForAI && numericLevel(summonAI) === 1 && numericLevel(chainLightningForAI) >= 10);
                    if (!hasSummonAILv2 && fusionReadyAI) {
                        const cfgAI = weaponsConfig['SUMMON_AI'];
                        if (cfgAI && Array.isArray(cfgAI.LEVELS) && cfgAI.LEVELS.length > 1) {
                            options.push({
                                type: 'SUMMON_AI',
                                name: cfgAI.NAME,
                                level: 2,
                                description: cfgAI.LEVELS[1].DESCRIPTION
                            });
                        }
                    }
                    continue;
                }
                if (rec.kind !== 'fusion') continue;
                const hasResult = playerWeaponTypes.indexOf(rec.result) !== -1;
                let ready = true;
                for (let s = 0; s < rec.sources.length; s++) {
                    const srcDef = rec.sources[s];
                    const found = sourceWeaponsInfo.find(function (w) { return w.type === srcDef.type; });
                    if (!found || numericLevel(found) < srcDef.min) {
                        ready = false;
                        break;
                    }
                }
                const unlocked = rec.requireFusionUnlock ? !!isFusionUnlocked(rec.result) : true;
                if (!hasResult && ready && unlocked) {
                    const cfgF = weaponsConfig[rec.result];
                    if (cfgF && Array.isArray(cfgF.LEVELS) && cfgF.LEVELS.length > 0) {
                        options.push({
                            type: rec.result,
                            name: cfgF.NAME,
                            level: 1,
                            description: cfgF.LEVELS[0].DESCRIPTION
                        });
                    }
                }
            } catch (_) {}
        }

        try {
            const atkLv = Math.max(0, Math.min(10, player.attackUpgradeLevel || 0));
            if (atkLv < 10) {
                options.push({ type: 'ATTR_ATTACK', name: '攻擊力強化', level: atkLv + 1, description: '每級+10%傷害' });
            }
            const atkFlatLv = Math.max(0, Math.min(10, player.attackPowerUpgradeLevel || 0));
            if (atkFlatLv < 10) {
                options.push({ type: 'ATTR_ATTACK_POWER', name: '攻擊力上升', level: atkFlatLv + 1, description: '每級+2基礎攻擊力' });
            }
            const crtLv = Math.max(0, Math.min(10, player.critUpgradeLevel || 0));
            if (crtLv < 10) {
                options.push({ type: 'ATTR_CRIT', name: '爆擊率強化', level: crtLv + 1, description: '每級+2%爆擊率' });
            }
            const hpLv = Math.max(0, Math.min(10, player.healthUpgradeLevel || 0));
            if (hpLv < 10) {
                options.push({ type: 'ATTR_HEALTH', name: '生命加成', level: hpLv + 1, description: '每級+20基礎血量' });
            }
            const defLv = Math.max(0, Math.min(10, player.defenseUpgradeLevel || 0));
            if (defLv < 10) {
                options.push({ type: 'ATTR_DEFENSE', name: '防禦加成', level: defLv + 1, description: '每級+1基礎防禦' });
            }
        } catch (_) {}

        if (ch && ch.id === 'lilylinglan' && Array.isArray(ch.allowedUpgradeTypes)) {
            for (let c = 0; c < LILY_CHEAT_FUSIONS.length; c++) {
                const type = LILY_CHEAT_FUSIONS[c];
                const cfg = weaponsConfig[type];
                const alreadyInOptions = options.some(function (o) { return o.type === type; });
                if (playerWeaponTypes.indexOf(type) === -1 && !alreadyInOptions && cfg && Array.isArray(cfg.LEVELS) && cfg.LEVELS.length > 0) {
                    options.push({ type: type, name: cfg.NAME, level: 1, description: cfg.LEVELS[0].DESCRIPTION });
                }
            }
            const allowedSet = new Set(ch.allowedUpgradeTypes);
            for (let i = options.length - 1; i >= 0; i--) {
                if (!allowedSet.has(options[i].type)) options.splice(i, 1);
            }
        }

        return options;
    }

    const UpgradeRegistry = {
        LEVELUP_POOL: LEVELUP_POOL,
        LILY_CHEAT_FUSIONS: LILY_CHEAT_FUSIONS,
        FUSION_OFFER_SEQUENCE: FUSION_OFFER_SEQUENCE,
        hiddenSourceTypes: hiddenSourceTypes,
        collectCandidates: collectCandidates,
        getStandardSelect: getStandardSelect
    };

    root.UpgradeRegistry = UpgradeRegistry;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = UpgradeRegistry;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
