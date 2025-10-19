// UI遊戲狀態組件
const UIGame = {
    init: function() {
        // 獲取UI元素
        this.timer = document.getElementById('timer');
        this.waveInfo = document.getElementById('wave-info');
        this.coinsText = document.getElementById('coins-text');
    },
    
    // 更新計時器
    updateTimer: function(time) {
        this.timer.textContent = Utils.formatTime(time);
    },
    
    // 更新波次信息
    updateWaveInfo: function(wave) {
        this.waveInfo.textContent = `波次: ${wave}`;
    },
    
    // 更新金幣顯示
    updateCoins: function(coins) {
        if (this.coinsText) {
            this.coinsText.textContent = coins;
        }
        
        // 更新技能頁面的金幣顯示
        const skillsCoinsEl = document.getElementById('skills-coins');
        if (skillsCoinsEl) {
            skillsCoinsEl.textContent = coins;
        }
    }
};