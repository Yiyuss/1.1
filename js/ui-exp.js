// UI經驗值系統組件
const UIExp = {
    init: function() {
        // 獲取UI元素
        this.levelText = document.getElementById('level-text');
        this.expBar = document.getElementById('exp-fill');
        this.expText = document.getElementById('exp-text');
        this.levelUpMenu = document.getElementById('level-up-menu');
        this.upgradeOptions = document.getElementById('upgrade-options');
    },
    
    // 更新等級
    updateLevel: function(level) {
        this.levelText.textContent = level;
        
        // 觸發等級更新事件
        if (typeof EventSystem !== 'undefined') {
            EventSystem.trigger(GameEvents.PLAYER_LEVEL_UPDATE, { level });
        }
    },
    
    // 更新經驗條
    updateExpBar: function(current, max) {
        const percentage = Math.max(0, current / max * 100);
        this.expBar.style.width = percentage + '%';
        this.expText.textContent = `${Math.floor(current)}/${max}`;
        
        // 觸發經驗值更新事件
        if (typeof EventSystem !== 'undefined') {
            EventSystem.trigger(GameEvents.PLAYER_EXP_UPDATE, { current, max });
        }
    },
    
    // 顯示升級選單
    showLevelUpMenu: function(options, onSelect) {
        // 暫停遊戲，但不靜音，避免升級音效與BGM被切斷
        if (typeof Game !== 'undefined' && Game.pause) {
            Game.pause(false);
        }
        
        // 清空升級選項
        this.upgradeOptions.innerHTML = '';
        
        // 添加升級選項
        options.forEach((option, index) => {
            const optionElement = document.createElement('div');
            optionElement.className = 'upgrade-option';
            optionElement.innerHTML = `
                <h3>${option.name}</h3>
                <p>${option.description}</p>
            `;
            
            // 添加點擊事件
            optionElement.addEventListener('click', () => {
                if (typeof onSelect === 'function') {
                    onSelect(index);
                }
                this.hideLevelUpMenu();
            });
            
            this.upgradeOptions.appendChild(optionElement);
        });
        
        // 顯示升級選單
        this.levelUpMenu.style.display = 'flex';
        
        // 觸發升級選單顯示事件
        if (typeof EventSystem !== 'undefined') {
            EventSystem.trigger(GameEvents.LEVEL_UP_MENU_SHOW, { options });
        }
    },
    
    // 隱藏升級選單
    hideLevelUpMenu: function() {
        this.levelUpMenu.style.display = 'none';
        
        // 恢復遊戲
        if (typeof Game !== 'undefined' && Game.resume) {
            Game.resume();
        }
        
        // 觸發升級選單隱藏事件
        if (typeof EventSystem !== 'undefined') {
            EventSystem.trigger(GameEvents.LEVEL_UP_MENU_HIDE);
        }
    }
};