// UI主系統 - 整合各UI組件（與舊版 UI 向後兼容）
(function() {
    // 若舊版 ui.js 已宣告了全域 UI，避免重複宣告造成 SyntaxError
    if (typeof window.UI !== 'undefined') {
        // 若舊版 UI 沒有對應方法，補上代理以使用新組件
        if (typeof window.UI.updateHealthBar !== 'function') {
            window.UI.updateHealthBar = function(current, max) { UIHealth.updateHealthBar(current, max); };
        }
        if (typeof window.UI.updateLevel !== 'function') {
            window.UI.updateLevel = function(level) { UIExp.updateLevel(level); };
        }
        if (typeof window.UI.updateExpBar !== 'function') {
            window.UI.updateExpBar = function(current, max) { UIExp.updateExpBar(current, max); };
        }
        if (typeof window.UI.showLevelUpMenu !== 'function') {
            window.UI.showLevelUpMenu = function(options, onSelect) { UIExp.showLevelUpMenu(options, onSelect); };
        }
        if (typeof window.UI.hideLevelUpMenu !== 'function') {
            window.UI.hideLevelUpMenu = function() { UIExp.hideLevelUpMenu(); };
        }
        if (typeof window.UI.updateEnergyBar !== 'function') {
            window.UI.updateEnergyBar = function(current, max) { UIEnergy.updateEnergyBar(current, max); };
        }
        if (typeof window.UI.updateTimer !== 'function') {
            window.UI.updateTimer = function(time) { UIGame.updateTimer(time); };
        }
        if (typeof window.UI.updateWaveInfo !== 'function') {
            window.UI.updateWaveInfo = function(wave) { UIGame.updateWaveInfo(wave); };
        }
        if (typeof window.UI.updateCoins !== 'function') {
            window.UI.updateCoins = function(coins) { UIGame.updateCoins(coins); };
        }
        if (typeof window.UI.showSkillsMenu !== 'function') {
            window.UI.showSkillsMenu = function() { UIMenu.showSkillsMenu(); };
        }
        if (typeof window.UI.hideSkillsMenu !== 'function') {
            window.UI.hideSkillsMenu = function() { UIMenu.hideSkillsMenu(); };
        }
        if (typeof window.UI.updateSkillsList !== 'function') {
            window.UI.updateSkillsList = function(skills) { UIMenu.updateSkillsList(skills); };
        }
        // 不覆蓋舊版 UI 的 init；若需要可於 Game.init 時自行呼叫各新組件 init
        return; // 保持舊版 UI 作為唯一全域 UI 物件
    }

    // 若尚未宣告 UI，建立以新組件為基礎的 UI 代理
    window.UI = {
        init: function() {
            UIHealth.init();
            UIExp.init();
            UIEnergy.init();
            UIGame.init();
            UIMenu.init();
            console.log('UI系統已初始化');
        },
        updateHealthBar: function(current, max) { UIHealth.updateHealthBar(current, max); },
        updateLevel: function(level) { UIExp.updateLevel(level); },
        updateExpBar: function(current, max) { UIExp.updateExpBar(current, max); },
        showLevelUpMenu: function(options, onSelect) { UIExp.showLevelUpMenu(options, onSelect); },
        hideLevelUpMenu: function() { UIExp.hideLevelUpMenu(); },
        updateEnergyBar: function(current, max) { UIEnergy.updateEnergyBar(current, max); },
        updateTimer: function(time) { UIGame.updateTimer(time); },
        updateWaveInfo: function(wave) { UIGame.updateWaveInfo(wave); },
        updateCoins: function(coins) { UIGame.updateCoins(coins); },
        showSkillsMenu: function() { UIMenu.showSkillsMenu(); },
        hideSkillsMenu: function() { UIMenu.hideSkillsMenu(); },
        updateSkillsList: function(skills) { UIMenu.updateSkillsList(skills); }
    };
})();