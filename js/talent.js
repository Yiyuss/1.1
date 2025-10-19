// 天賦系統
const TalentSystem = {
    // 天賦配置
    talents: {
        hp_boost: {
            name: '生命強化',
            description: '增加初始生命值20點，讓你在遊戲中更加耐久。',
            cost: 500,
            effect: function(player) {
                if (!player) return;
                const healthBoost = 20;
                
                // 強制設置最大生命值和當前生命值
                player.maxHealth = CONFIG.PLAYER.MAX_HEALTH + healthBoost;
                player.health = player.maxHealth;
                
                console.log(`已應用生命強化天賦，當前血量: ${player.health}/${player.maxHealth}`);
                
                // 更新UI
                if (typeof UI !== 'undefined' && UI.updateHealthBar) {
                    UI.updateHealthBar(player.health, player.maxHealth);
                }
            }
        }
        // 未來可以在這裡添加更多天賦
    },
    
    // 初始化天賦系統
    init: function() {
        this.loadUnlockedTalents();
        this.bindEvents();
    },
    
    // 綁定事件
    bindEvents: function() {
        // 綁定天賦卡點擊事件
        document.querySelectorAll('#talent-select-screen .char-card').forEach(card => {
            card.addEventListener('click', this.handleTalentCardClick);
            card.addEventListener('dblclick', this.handleTalentCardDblClick);
        });
        
        // 綁定確認按鈕
        const confirmBtn = document.getElementById('talent-confirm-ok');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                const activeCard = document.querySelector('#talent-select-screen .char-card.active');
                if (activeCard) {
                    this.unlockTalent(activeCard.dataset.talentId);
                }
                this.hideTalentConfirm();
            });
        }
        
        // 綁定取消按鈕
        const cancelBtn = document.getElementById('talent-confirm-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hideTalentConfirm();
            });
        }
        
        // 空白鍵確認
        document.addEventListener('keydown', (e) => {
            if (e.key === ' ' && !document.getElementById('talent-confirm').classList.contains('hidden')) {
                const activeCard = document.querySelector('#talent-select-screen .char-card.active');
                if (activeCard) {
                    this.unlockTalent(activeCard.dataset.talentId);
                }
                this.hideTalentConfirm();
            }
        });
    },
    
    // 處理天賦卡點擊
    handleTalentCardClick: function(e) {
        const card = e.currentTarget;
        
        // 移除其他卡片的active狀態
        document.querySelectorAll('#talent-select-screen .char-card.active').forEach(el => {
            if (el !== card) el.classList.remove('active');
        });
        
        // 切換當前卡片的active狀態
        card.classList.toggle('active');
        
        // 更新預覽區
        if (card.classList.contains('active')) {
            TalentSystem.updateTalentPreview(card);
        }
    },
    
    // 處理天賦卡雙擊
    handleTalentCardDblClick: function(e) {
        const card = e.currentTarget;
        
        // 如果已解鎖，不需要確認
        if (!card.classList.contains('locked')) return;
        
        // 顯示確認對話框
        TalentSystem.showTalentConfirm(card);
    },
    
    // 更新天賦預覽區
    updateTalentPreview: function(card) {
        const nameEl = document.getElementById('talent-preview-name');
        const descEl = document.getElementById('talent-preview-desc');
        const imgEl = document.getElementById('talent-preview-img');
        
        if (nameEl && card.querySelector('.char-name')) {
            nameEl.textContent = card.querySelector('.char-name').textContent;
        }
        
        if (descEl) {
            const talentId = card.dataset.talentId;
            if (this.talents[talentId]) {
                descEl.textContent = this.talents[talentId].description;
            } else {
                descEl.textContent = '這是一個天賦描述。';
            }
        }
        
        if (imgEl) {
            // 固定使用 GM.png 作為天賦預覽圖
            imgEl.src = 'assets/images/GM.png';
            // 若卡片為鎖定狀態，預覽圖維持灰階；否則恢復
            if (card.classList.contains('locked')) {
                imgEl.classList.add('grayscale');
            } else {
                imgEl.classList.remove('grayscale');
            }
        }
    },
    
    // 顯示天賦確認對話框
    showTalentConfirm: function(card) {
        const confirmEl = document.getElementById('talent-confirm');
        const titleEl = document.getElementById('talent-confirm-title');
        const descEl = document.getElementById('talent-confirm-desc');
        
        if (!confirmEl) return;
        
        // 設置當前選中的卡片為active
        document.querySelectorAll('#talent-select-screen .char-card.active').forEach(el => {
            el.classList.remove('active');
        });
        card.classList.add('active');
        
        // 更新對話框內容
        if (titleEl && card.querySelector('.char-name')) {
            titleEl.textContent = `解鎖 ${card.querySelector('.char-name').textContent}`;
        }
        
        const talentId = card.dataset.talentId;
        const talent = this.talents[talentId];
        
        if (descEl) {
            descEl.textContent = `使用${talent ? talent.cost : 500}金幣解鎖天賦？`;
        }
        
        // 顯示對話框
        confirmEl.classList.remove('hidden');
    },
    
    // 隱藏天賦確認對話框
    hideTalentConfirm: function() {
        const confirmEl = document.getElementById('talent-confirm');
        if (confirmEl) {
            confirmEl.classList.add('hidden');
        }
    },
    
    // 解鎖天賦
    unlockTalent: function(talentId) {
        const talent = this.talents[talentId];
        const cost = talent ? talent.cost : 500;
        
        // 檢查金幣是否足夠
        if (Game.coins < cost) {
            alert('金幣不足！');
            AudioManager.playSound('button_click');
            return;
        }
        
        // 扣除金幣
        Game.coins -= cost;
        Game.saveCoins();
        
        // 播放音效
        AudioManager.playSound('button_click');
        
        // 更新UI
        if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) {
            UI.updateCoinsDisplay(Game.coins);
        }
        
        // 保存已解鎖的天賦
        this.saveUnlockedTalent(talentId);
        
        // 更新天賦卡片外觀
        this.updateTalentCardAppearance(talentId);
        
        // 如果玩家存在，立即應用天賦效果
        if (Game.player) {
            this.applyTalentToPlayer(talentId, Game.player);
        }
        
        // 更新預覽區
        const card = document.querySelector(`#talent-select-screen .char-card[data-talent-id="${talentId}"]`);
        if (card) {
            this.updateTalentPreview(card);
        }
        
        // 更新ESC選單中的天賦列表
        if (typeof UI !== 'undefined' && UI.updateTalentsList) {
            UI.updateTalentsList();
        }
        
        // 應用天賦效果到玩家身上
        if (Game.player && talent && typeof talent.effect === 'function') {
            talent.effect(Game.player);
        }
        
        // 提示玩家天賦已解鎖
        const talentName = talent ? talent.name : talentId;
        alert(`天賦已解鎖！${talentId === 'hp_boost' ? '初始生命值+20' : ''}`);
    },
    
    // 保存已解鎖的天賦
    saveUnlockedTalent: function(talentId) {
        try {
            const key = 'unlocked_talents';
            let unlockedTalents = [];
            
            // 讀取已有的解鎖天賦
            const stored = localStorage.getItem(key);
            if (stored) {
                try {
                    unlockedTalents = JSON.parse(stored);
                } catch (e) {
                    unlockedTalents = [];
                }
            }
            
            // 添加新解鎖的天賦
            if (!unlockedTalents.includes(talentId)) {
                unlockedTalents.push(talentId);
            }
            
            // 保存到本地存儲
            localStorage.setItem(key, JSON.stringify(unlockedTalents));
            console.log('已保存天賦:', unlockedTalents);
        } catch (e) {
            console.error('保存天賦失敗:', e);
        }
    },
    
    // 載入已解鎖的天賦
    loadUnlockedTalents: function() {
        try {
            const key = 'unlocked_talents';
            const stored = localStorage.getItem(key);
            
            if (stored) {
                try {
                    const unlockedTalents = JSON.parse(stored);
                    console.log('載入已解鎖天賦:', unlockedTalents);
                    
                    // 更新每個已解鎖天賦的外觀
                    unlockedTalents.forEach(talentId => {
                        this.updateTalentCardAppearance(talentId);
                    });
                } catch (e) {
                    console.error('解析已解鎖天賦失敗:', e);
                }
            } else {
                console.log('未找到已解鎖天賦數據');
            }
        } catch (e) {
            console.error('載入天賦失敗:', e);
        }
    },
    
    // 更新天賦卡片外觀
    updateTalentCardAppearance: function(talentId) {
        const card = document.querySelector(`#talent-select-screen .char-card[data-talent-id="${talentId}"]`);
        if (card) {
            card.classList.remove('locked');
            const img = card.querySelector('img');
            if (img) {
                img.classList.remove('grayscale');
            }
        }
    },
    
    // 將單個天賦應用到玩家身上（作為持續性道具）
    applyTalentToPlayer: function(talentId, player) {
        if (!player) return;
        
        console.log(`將天賦 ${talentId} 作為道具應用到玩家身上`);
        
        // 特殊處理生命強化天賦
        if (talentId === 'hp_boost') {
            // 標記玩家已擁有此增益
            player.buffs.hp_boost = true;
            
            // 直接應用效果
            const healthBoost = 20;
            player.maxHealth = CONFIG.PLAYER.MAX_HEALTH + healthBoost;
            player.health = player.maxHealth;
            
            console.log(`已應用生命強化天賦，當前血量: ${player.health}/${player.maxHealth}`);
            
            // 立即更新UI
            if (typeof UI !== 'undefined' && UI.updateHealthBar) {
                UI.updateHealthBar(player.health, player.maxHealth);
            }
        } else {
            // 處理其他天賦
            const talent = this.talents[talentId];
            if (talent && typeof talent.effect === 'function') {
                talent.effect(player);
            }
        }
    },
    
    // 應用所有已解鎖天賦效果到玩家身上
    applyTalentEffects: function(player) {
        if (!player) return;
        
        try {
            const unlockedTalents = JSON.parse(localStorage.getItem('unlocked_talents') || '[]');
            console.log('應用天賦效果:', unlockedTalents);
            
            // 重置所有增益狀態
            for (const buff in player.buffs) {
                player.buffs[buff] = false;
            }
            
            // 應用所有已解鎖天賦
            unlockedTalents.forEach(talentId => {
                this.applyTalentToPlayer(talentId, player);
            });
            
            console.log('玩家當前增益狀態:', player.buffs);
        } catch (e) {
            console.error('應用天賦效果失敗:', e);
        }
    },
    
    // 獲取已解鎖的天賦列表
    getUnlockedTalents: function() {
        try {
            const stored = localStorage.getItem('unlocked_talents');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error('獲取已解鎖天賦失敗:', e);
        }
        return [];
    }
};

// 全局函數，用於在其他文件中調用
function applyTalentEffects(player) {
    TalentSystem.applyTalentEffects(player);
}

// 添加一個全局函數用於清除天賦數據（測試用）
function clearTalentData() {
    try {
        localStorage.removeItem('unlocked_talents');
        console.log('已清除天賦數據');
        alert('天賦數據已清除，請重新啟動遊戲以應用更改');
        return true;
    } catch (e) {
        console.error('清除天賦數據失敗:', e);
        return false;
    }
}
