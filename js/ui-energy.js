// UI能量系統組件
const UIEnergy = {
    init: function() {
        // 獲取UI元素
        this.energyBar = document.getElementById('energy-fill');
        this.energyText = document.getElementById('energy-text');
    },
    
    // 更新能量條
    updateEnergyBar: function(current, max) {
        const percentage = Math.max(0, current / max * 100);
        this.energyBar.style.width = percentage + '%';
        this.energyText.textContent = `${Math.floor(current)}/${max}`;
        
        // 觸發能量更新事件
        if (typeof EventSystem !== 'undefined') {
            EventSystem.trigger(GameEvents.PLAYER_ENERGY_UPDATE, { current, max });
        }
    }
};