/**
 * 單人 Enemy 與組隊 server/game-state 共用的基礎血量（未乘組隊人數）。
 * 組隊人數倍率只在伺服器 computePartyMaxHealth。
 */
(function (root) {
    'use strict';

    function isMiniBoss(type) {
        return type === 'MINI_BOSS' || type === 'ELF_MINI_BOSS' || type === 'HUMAN_MINI_BOSS' || type === 'UNKNOWN_MINI_BOSS';
    }

    function isBoss(type) {
        return type === 'BOSS' || type === 'ELF_BOSS' || type === 'HUMAN_BOSS' || type === 'UNKNOWN_BOSS';
    }

    function computeBaseMaxHealth(type, enemyHealth, wave, mapId, diffId, config) {
        const tuning = (config && config.TUNING) ? config.TUNING : null;
        const totalWaves = (config && config.WAVES && typeof config.WAVES.TOTAL_WAVES === 'number') ? config.WAVES.TOTAL_WAVES : 30;
        const w = Math.max(1, wave || 1);
        const map = mapId || 'city';
        const diff = diffId || 'EASY';
        const baseHealthCfg = (typeof enemyHealth === 'number') ? enemyHealth : 100;
        const mini = isMiniBoss(type);
        const boss = isBoss(type);

        try {
            if (tuning && !mini && !boss) {
                const enemyHealthConfig = (((tuning.ENEMY_HEALTH || {})[map] || {})[diff]) || null;
                if (enemyHealthConfig) {
                    const baseHealth = baseHealthCfg + (enemyHealthConfig.baseHealth || 0);
                    const maxHealthWave30 = enemyHealthConfig.maxHealthWave30 || baseHealth;
                    if (w === 1) return Math.floor(baseHealth);
                    if (w >= totalWaves) {
                        return Math.floor(maxHealthWave30 * Math.pow(1.3, w - totalWaves));
                    }
                    const progress = (w - 1) / Math.max(1, (totalWaves - 1));
                    return Math.floor(baseHealth + (maxHealthWave30 - baseHealth) * progress);
                }
            }
            if (tuning && mini) {
                const miniBossConfig = (((tuning.MINI_BOSS || {})[map] || {})[diff]) || null;
                if (miniBossConfig && miniBossConfig.startWave1 && miniBossConfig.endWave30) {
                    const start = miniBossConfig.startWave1;
                    const end = miniBossConfig.endWave30;
                    if (w === 1) return Math.floor(start);
                    if (w >= totalWaves) {
                        return Math.floor(end * Math.pow(1.3, w - totalWaves));
                    }
                    const perWave = Math.pow(end / start, 1 / Math.max(1, (totalWaves - 1)));
                    return Math.floor(start * Math.pow(perWave, Math.max(0, w - 1)));
                }
            }
            if (tuning && boss) {
                const bossConfig = (((tuning.BOSS || {})[map] || {})[diff]) || null;
                const bossWave = (config && config.WAVES && typeof config.WAVES.BOSS_WAVE === 'number') ? config.WAVES.BOSS_WAVE : 20;
                if (bossConfig && (bossConfig.wave20 || bossConfig.wave30) && w === bossWave) {
                    return Math.floor(bossConfig.wave20 || bossConfig.wave30);
                }
            }
        } catch (_) { }

        try {
            const hm = (config && config.WAVES) ? config.WAVES.HEALTH_MULTIPLIER_PER_WAVE : null;
            const mul = (typeof hm === 'number') ? hm : 1.05;
            return Math.floor(baseHealthCfg * Math.pow(mul, Math.max(0, w - 1)));
        } catch (_) { }
        return Math.floor(baseHealthCfg);
    }

    function computePartyMaxHealth(base, playerCount) {
        const extra = Math.max(0, (playerCount || 1) - 1);
        return Math.max(1, Math.floor(base * (1 + 0.3 * extra)));
    }

    const EnemyHp = {
        isMiniBoss: isMiniBoss,
        isBoss: isBoss,
        computeBaseMaxHealth: computeBaseMaxHealth,
        computePartyMaxHealth: computePartyMaxHealth
    };
    root.EnemyHp = EnemyHp;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = EnemyHp;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
