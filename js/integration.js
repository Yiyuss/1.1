// 整合文件 - 確保新模塊與原有系統的兼容性
document.addEventListener('DOMContentLoaded', function() {
    // 若 Game 未定義（例如 game.js 載入失敗或語法錯誤），不執行依賴 Game 的邏輯，避免整頁崩潰
    if (typeof Game === 'undefined') {
        console.error('[integration.js] Game 未定義，請檢查 game.js 是否正確載入（或是否有語法錯誤）。');
        return;
    }
    // 初始化事件系統
    if (typeof EventSystem !== 'undefined') {
        EventSystem.init();
        console.log('事件系統已初始化');
    }
    
    // 修改Game.reset函數，確保在重置時應用天賦效果
    const originalGameReset = Game.reset;
    Game.reset = function() {
        // 調用原始reset函數
        originalGameReset.apply(this, arguments);
        
        // 應用buff系統
        if (typeof BuffSystem !== 'undefined' && this.player) {
            BuffSystem.initPlayerBuffs(this.player);
            BuffSystem.applyBuffsFromTalents(this.player);
        }
    };
    
    // 修改TalentSystem.applyTalentEffects函數，使用BuffSystem
    if (typeof TalentSystem !== 'undefined' && typeof BuffSystem !== 'undefined') {
        const originalApplyTalentEffects = TalentSystem.applyTalentEffects;
        TalentSystem.applyTalentEffects = function() {
            // 如果Game.player存在，使用BuffSystem
            if (Game.player) {
                BuffSystem.resetAllBuffs(Game.player);
                BuffSystem.applyBuffsFromTalents(Game.player);
            } else {
                // 否則使用原始方法
                originalApplyTalentEffects.apply(this, arguments);
            }
        };
    }
    
    console.log('整合系統已初始化');
});
