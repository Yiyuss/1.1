// UI健康系統組件
const UIHealth = {
    init: function() {
        // 獲取UI元素
        this.healthBar = document.getElementById('health-fill');
        this.healthText = document.getElementById('health-text');
    },
    
    // 更新血量條
    updateHealthBar: function(current, max) {
        const percentage = Math.max(0, current / max * 100);
        this.healthBar.style.width = percentage + '%';
        this.healthText.textContent = `${Math.floor(current)}/${max}`;
        
        // 觸發健康狀態更新事件
        if (typeof EventSystem !== 'undefined') {
            EventSystem.trigger(GameEvents.PLAYER_HEALTH_UPDATE, { current, max });
        }
    }
};