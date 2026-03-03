// 天賦系統
const TalentSystem = {
    // 天賦配置（基礎描述；實際效果由 tieredTalents 與等級決定）
    talents: {
        hp_boost: {
            name: '生命強化',
            description: '升級可提升初始生命值。',
            cost: 500
        },
        defense_boost: {
            name: '防禦強化',
            description: '升級可減免所受傷害。',
            cost: 5000
        },
        speed_boost: {
            name: '移動加速',
            description: '升級可提升移動速度。',
            cost: 1000
        },
        // 新增：拾取範圍增加
        pickup_range_boost: {
            name: '拾取範圍增加',
            description: '升級可增加拾取範圍。',
            cost: 500
        },
        // 新增：傷害強化
        damage_boost: {
            name: '傷害強化',
            description: '升級可提升攻擊傷害。',
            cost: 3000
        },
        // 新增：傷害特化（追加固定傷害）
        damage_specialization: {
            name: '傷害特化',
            description: '升級可追加固定傷害。',
            cost: 3000
        },
        // 新增：爆擊強化（提升爆擊率）
        crit_enhance: {
            name: '爆擊強化',
            description: '升級可提升爆擊率。',
            cost: 3000
        },
        // 新增：回血強化（提升回血速度）
        regen_speed_boost: {
            name: '回血強化',
            description: '升級可提升回血速度。',
            cost: 3000
        },
        experience_boost: {
            name: '經驗值強化',
            description: '升級可提升獲得的經驗值。',
            cost: 3000
        },
        // 新增：升級操作次數強化（提升重抽/換一個/保留次數）
        levelup_action_charges: {
            name: '選項次數強化',
            description: '升級可增加重抽/換一個/保留的次數。',
            cost: 3000
        },
        // 新增：消波塊增加（僅套用在防禦模式）
        defense_gold_boost: {
            name: '消波塊增加',
            description: '升級可提升防禦模式的初始消波塊。',
            cost: 3000
        },
        // 新增：迴避強化
        dodge_enhance: {
            name: '迴避強化',
            description: '升級可提升迴避傷害的機率。',
            cost: 3000
        },
        // 新增：雞腿強化（強化雞腿庇佑的基礎攻擊）
        chicken_blessing_boost: {
            name: '雞腿強化',
            description: '升級可強化雞腿庇佑的基礎攻擊。',
            cost: 10000
        },
        // 新增：綿羊護體強化（強化綿羊護體的基礎攻擊）
        sheep_guard_boost: {
            name: '綿羊護體強化',
            description: '升級可強化綿羊護體的基礎攻擊。',
            cost: 10000
        },
        // 新增：心意相隨強化（強化心意相隨的基礎攻擊）
        heart_companion_boost: {
            name: '心意相隨強化',
            description: '升級可強化心意相隨的基礎攻擊。',
            cost: 10000
        },
        // 新增：旋轉鬆餅強化（強化旋轉鬆餅的基礎攻擊）
        rotating_muffin_boost: {
            name: '旋轉鬆餅強化',
            description: '升級可強化旋轉鬆餅的基礎攻擊。',
            cost: 10000
        },
        pineapple_orbit_boost: {
            name: '鳳梨環繞強化',
            description: '升級可強化鳳梨環繞的基礎攻擊。',
            cost: 10000
        },
        // 新增：引力強化（增加引力波的推力）
        gravity_wave_boost: {
            name: '引力強化',
            description: '升級可增加引力波的推力。',
            cost: 3000
        },
        // 新增：AI強化（提升召喚AI的傷害）
        ai_boost: {
            name: 'AI強化',
            description: '升級可提升召喚AI的傷害。',
            cost: 3000
        },
        // 新增：星體軌跡強化
        stellar_orbit_boost: {
            name: '星體軌跡強化',
            description: '升級可強化星體軌跡的基礎攻擊。',
            cost: 10000
        },
        // 新增：加百列強化（強化加百列的基礎攻擊）
        gabriel_orbit_boost: {
            name: '加百列強化',
            description: '升級可強化加百列的基礎攻擊。',
            cost: 10000
        },
        // 覺醒強化（獨特性天賦，需要覺醒之路成就解鎖）
        awakening_enhance: {
            name: '覺醒強化',
            description: '解鎖覺醒系統，獲得強大的覺醒能力。',
            cost: 0,
            isAwakening: true
        }
    },

    // 階梯天賦設定：每級效果與花費
    tieredTalents: {
        hp_boost: {
            levels: [
                { hp: 20, cost: 500 },
                { hp: 50, cost: 3000 },
                { hp: 100, cost: 20000 },
                { hp: 150, cost: 30000 },
                { hp: 200, cost: 40000 },
                { hp: 250, cost: 50000 }
            ]
        },
        defense_boost: {
            levels: [
                { reduction: 2, cost: 5000 },
                { reduction: 5, cost: 10000 },
                { reduction: 8, cost: 30000 },
                { reduction: 11, cost: 40000 },
                { reduction: 14, cost: 50000 },
                { reduction: 17, cost: 60000 }
            ]
        },
        speed_boost: {
            levels: [
                { multiplier: 1.10, cost: 1000 },
                { multiplier: 1.20, cost: 2000 },
                { multiplier: 1.30, cost: 3000 },
                { multiplier: 1.40, cost: 4000 },
                { multiplier: 1.50, cost: 5000 },
                { multiplier: 1.60, cost: 6000 }
            ]
        },
        // 新增：拾取範圍增加（30%、50%、100% 對應 1.3/1.5/2.0）
        pickup_range_boost: {
            levels: [
                { multiplier: 1.30, cost: 500 },
                { multiplier: 1.50, cost: 1500 },
                { multiplier: 2.00, cost: 3000 },
                { multiplier: 3.00, cost: 6000 },
                { multiplier: 4.00, cost: 12000 },
                { multiplier: 5.00, cost: 24000 }
            ]
        },
        // 新增：傷害強化（10%、20%、30%、50%、70%、100% 對應 1.10/1.20/1.30/1.50/1.70/2.00）
        damage_boost: {
            levels: [
                { multiplier: 1.10, cost: 3000 },
                { multiplier: 1.20, cost: 6000 },
                { multiplier: 1.30, cost: 12000 },
                { multiplier: 1.50, cost: 24000 },
                { multiplier: 1.70, cost: 35000 },
                { multiplier: 2.00, cost: 45000 }
            ]
        },
        // 新增：傷害特化（每次攻擊追加固定傷害+2/+4/+6）
        damage_specialization: {
            levels: [
                { flat: 2, cost: 3000 },
                { flat: 5, cost: 6000 },
                { flat: 8, cost: 12000 },
                { flat: 13, cost: 24000 },
                { flat: 18, cost: 35000 },
                { flat: 23, cost: 45000 }
            ]
        },
        // 新增：爆擊強化（爆擊率+5%/+10%/+15%）
        crit_enhance: {
            levels: [
                { chancePct: 0.05, cost: 3000 },
                { chancePct: 0.10, cost: 6000 },
                { chancePct: 0.15, cost: 12000 },
                { chancePct: 0.20, cost: 24000 },
                { chancePct: 0.25, cost: 35000 },
                { chancePct: 0.30, cost: 45000 }
            ]
        },
        // 新增：回血強化（+30%/+60%/+100% 對應 1.3/1.6/2.0）
        regen_speed_boost: {
            levels: [
                { multiplier: 1.30, cost: 3000 },
                { multiplier: 1.50, cost: 6000 },
                { multiplier: 1.70, cost: 12000 },
                { multiplier: 1.90, cost: 24000 },
                { multiplier: 2.10, cost: 35000 },
                { multiplier: 2.30, cost: 45000 }
            ]
        },
        experience_boost: {
            levels: [
                { multiplier: 1.10, cost: 3000 },
                { multiplier: 1.20, cost: 6000 },
                { multiplier: 1.30, cost: 12000 },
                { multiplier: 1.40, cost: 24000 },
                { multiplier: 1.50, cost: 35000 },
                { multiplier: 1.60, cost: 45000 }
            ]
        },
        // 新增：升級操作次數強化（各+1 ~ 各+6）
        levelup_action_charges: {
            levels: [
                { reroll: 1, replace: 1, hold: 1, cost: 3000 },
                { reroll: 2, replace: 2, hold: 2, cost: 5000 },
                { reroll: 3, replace: 3, hold: 3, cost: 7000 },
                { reroll: 5, replace: 5, hold: 5, cost: 9000 },
                { reroll: 7, replace: 7, hold: 7, cost: 11000 },
                { reroll: 9, replace: 9, hold: 9, cost: 13000 }
            ]
        },
        // 新增：消波塊增加（僅套用在防禦模式，+200/+400/+600/+800/+1000/+1500）
        defense_gold_boost: {
            levels: [
                { bonus: 200, cost: 3000 },
                { bonus: 400, cost: 6000 },
                { bonus: 600, cost: 12000 },
                { bonus: 800, cost: 24000 },
                { bonus: 1000, cost: 35000 },
                { bonus: 1500, cost: 45000 }
            ]
        },
        // 新增：迴避強化（3%/5%/7%/9%/11%/15%）
        dodge_enhance: {
            levels: [
                { dodgeRate: 0.03, cost: 3000 },
                { dodgeRate: 0.05, cost: 6000 },
                { dodgeRate: 0.07, cost: 12000 },
                { dodgeRate: 0.09, cost: 24000 },
                { dodgeRate: 0.11, cost: 35000 },
                { dodgeRate: 0.15, cost: 45000 }
            ]
        },
        // 新增：雞腿強化（強化雞腿庇佑的基礎攻擊：+5/+10/+15/+20/+25/+30）
        chicken_blessing_boost: {
            levels: [
                { flat: 5, cost: 10000 },
                { flat: 10, cost: 20000 },
                { flat: 15, cost: 30000 },
                { flat: 20, cost: 40000 },
                { flat: 25, cost: 50000 },
                { flat: 30, cost: 60000 }
            ]
        },
        // 新增：綿羊護體強化（強化綿羊護體的基礎攻擊：+5/+10/+15/+20/+25/+30）
        sheep_guard_boost: {
            levels: [
                { flat: 5, cost: 10000 },
                { flat: 10, cost: 20000 },
                { flat: 15, cost: 30000 },
                { flat: 20, cost: 40000 },
                { flat: 25, cost: 50000 },
                { flat: 30, cost: 60000 }
            ]
        },
        // 新增：心意相隨強化（強化心意相隨的基礎攻擊：+5/+10/+15/+20/+25/+30）
        heart_companion_boost: {
            levels: [
                { flat: 5, cost: 10000 },
                { flat: 10, cost: 20000 },
                { flat: 15, cost: 30000 },
                { flat: 20, cost: 40000 },
                { flat: 25, cost: 50000 },
                { flat: 30, cost: 60000 }
            ]
        },
        // 新增：旋轉鬆餅強化（強化旋轉鬆餅的基礎攻擊：+5/+10/+15/+20/+25/+30）
        rotating_muffin_boost: {
            levels: [
                { flat: 5, cost: 10000 },
                { flat: 10, cost: 20000 },
                { flat: 15, cost: 30000 },
                { flat: 20, cost: 40000 },
                { flat: 25, cost: 50000 },
                { flat: 30, cost: 60000 }
            ]
        },
        pineapple_orbit_boost: {
            levels: [
                { flat: 5, cost: 10000 },
                { flat: 10, cost: 20000 },
                { flat: 15, cost: 30000 },
                { flat: 20, cost: 40000 },
                { flat: 25, cost: 50000 },
                { flat: 30, cost: 60000 }
            ]
        },
        // 新增：引力強化（增加引力波的推力：15%/30%/45%/60%/75%/90%）
        gravity_wave_boost: {
            levels: [
                { pushMultiplier: 0.15, cost: 3000 },
                { pushMultiplier: 0.30, cost: 6000 },
                { pushMultiplier: 0.45, cost: 12000 },
                { pushMultiplier: 0.60, cost: 24000 },
                { pushMultiplier: 0.75, cost: 35000 },
                { pushMultiplier: 0.90, cost: 45000 }
            ]
        },
        // 新增：AI強化（提升召喚AI的傷害：10%/20%/30%/50%/70%/100%）
        ai_boost: {
            levels: [
                { multiplier: 1.10, cost: 3000 },
                { multiplier: 1.20, cost: 6000 },
                { multiplier: 1.30, cost: 12000 },
                { multiplier: 1.50, cost: 24000 },
                { multiplier: 1.70, cost: 35000 },
                { multiplier: 2.00, cost: 45000 }
            ]
        },
        // 新增：星體軌跡強化（+5/+10/+15/+20/+25/+30）
        stellar_orbit_boost: {
            levels: [
                { flat: 5, cost: 10000 },
                { flat: 10, cost: 20000 },
                { flat: 15, cost: 30000 },
                { flat: 20, cost: 40000 },
                { flat: 25, cost: 50000 },
                { flat: 30, cost: 60000 }
            ]
        },
        // 新增：加百列強化（+5/+10/+15/+20/+25/+30）
        gabriel_orbit_boost: {
            levels: [
                { flat: 5, cost: 10000 },
                { flat: 10, cost: 20000 },
                { flat: 15, cost: 30000 },
                { flat: 20, cost: 40000 },
                { flat: 25, cost: 50000 },
                { flat: 30, cost: 60000 }
            ]
        },
        // 覺醒強化（獨特性，單級，解鎖後開啟覺醒系統）
        awakening_enhance: {
            levels: [{ cost: 0 }],
            isAwakening: true
        },
        // 覺醒子系統（隱藏天賦，由覺醒視窗管理，僅生存模式生效）
        awakening_hp: {
            levels: [{ cost: 200000, hp: 3000 }],
            isAwakening: true, hidden: true
        },
        awakening_regen: {
            levels: [{ cost: 150000, regenBoost: 10.0 }],
            isAwakening: true, hidden: true
        },
        awakening_attack: {
            levels: [{ cost: 100000, attackFlat: 300 }],
            isAwakening: true, hidden: true
        }
    },
    
    // 初始化天賦系統
    init: function() {
        // 先進行舊資料遷移（hp_boost_50 / hp_boost_100 轉換為等級）
        this.migrateLegacyTalentData();
        this.loadUnlockedTalents();
        this.bindEvents();
        // 載入等級後同步 UI：更新天賦清單與升級操作次數（本局）
        try {
            if (typeof UI !== 'undefined') {
                if (UI.updateTalentsList) UI.updateTalentsList();
                if (UI.applyLevelUpActionChargesFromTalents) UI.applyLevelUpActionChargesFromTalents();
            }
        } catch (_) {}
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
        // 空白鍵確認已移至 KeyboardRouter 中央處理器
    },
    
    // 處理天賦卡點擊
    handleTalentCardClick: function(e) {
        const card = e.currentTarget;
        const talentId = card.dataset.talentId;

        // 覺醒強化特殊處理：已解鎖時直接開啟覺醒視窗
        if (talentId === 'awakening_enhance') {
            const lv = TalentSystem.getTalentLevel('awakening_enhance');
            if (lv > 0) {
                try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('button_click'); } catch(_){}
                TalentSystem.showAwakeningWindow();
                return;
            }
        }
        
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
        const talentId = card.dataset.talentId;

        // 覺醒強化特殊處理
        if (talentId === 'awakening_enhance') {
            const lv = TalentSystem.getTalentLevel('awakening_enhance');
            if (lv > 0) {
                try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('button_click'); } catch(_){}
                TalentSystem.showAwakeningWindow();
                return;
            }
            // 未解鎖：檢查成就
            if (typeof Achievements === 'undefined' || !Achievements.isUnlocked || !Achievements.isUnlocked('INTERSECTION_CLEAR')) {
                try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('button_click'); } catch(_){}
                const descEl = document.getElementById('talent-preview-desc');
                if (descEl) descEl.textContent = '需要先達成「覺醒之路」成就才能解鎖。';
                return;
            }
            // 有成就：解鎖覺醒強化（免費）
            TalentSystem.setTalentLevel('awakening_enhance', 1);
            TalentSystem.updateTalentCardAppearance('awakening_enhance');
            try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('button_click'); } catch(_){}
            TalentSystem.showAwakeningWindow();
            return;
        }

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
            descEl.textContent = this.getHighestTierDescription(talentId);
        }
        if (imgEl) {
            imgEl.src = 'assets/images/GM.png';
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
        document.querySelectorAll('#talent-select-screen .char-card.active').forEach(el => { el.classList.remove('active'); });
        card.classList.add('active');
        if (titleEl && card.querySelector('.char-name')) {
            titleEl.textContent = `解鎖 ${card.querySelector('.char-name').textContent}`;
        }
        const talentId = card.dataset.talentId;
        const nextCost = this.getNextLevelCost(talentId);
        if (descEl) {
            descEl.textContent = nextCost ? `使用${nextCost}金幣解鎖天賦？` : '已達最高等級';
        }
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
        const nextCost = this.getNextLevelCost(talentId);
        if (!nextCost) {
            AudioManager.playSound('button_click');
            return;
        }
        // 金幣檢查
        if (Game.coins < nextCost) {
            AudioManager.playSound('button_click');
            return;
        }
        // 扣款
        Game.coins -= nextCost;
        Game.saveCoins();
        AudioManager.playSound('button_click');
        if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) {
            UI.updateCoinsDisplay(Game.coins);
        }
        // 提升等級
        const current = this.getTalentLevel(talentId);
        this.setTalentLevel(talentId, current + 1);
        // 更新卡片外觀（未達上限保持 locked 以便繼續升級）
        this.updateTalentCardAppearance(talentId);
        // 應用效果
        if (Game.player) {
            this.applyTalentEffects(Game.player);
        }
        // 更新預覽與ESC清單
        const card = document.querySelector(`#talent-select-screen .char-card[data-talent-id="${talentId}"]`);
        if (card) this.updateTalentPreview(card);
        if (typeof UI !== 'undefined' && UI.updateTalentsList) {
            UI.updateTalentsList();
        }
        // 若為操作次數強化，立刻刷新升級操作次數（本局有效）
        try { if (typeof UI !== 'undefined' && UI.applyLevelUpActionChargesFromTalents) UI.applyLevelUpActionChargesFromTalents(); } catch (_) {}
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
            // 確保遷移完成後，再根據等級更新外觀
            const ids = (this.tieredTalents && typeof this.tieredTalents === 'object')
                ? Object.keys(this.tieredTalents)
                : ['hp_boost','defense_boost','speed_boost'];
            ids.forEach(id => {
                this.updateTalentCardAppearance(id);
            });
        } catch (e) {
            console.error('載入天賦失敗:', e);
        }
    },
    
    // 更新天賦卡片外觀
    updateTalentCardAppearance: function(talentId) {
        const card = document.querySelector(`#talent-select-screen .char-card[data-talent-id="${talentId}"]`);
        const cfg = this.tieredTalents[talentId];
        if (!card || !cfg) return;
        // 隱藏型天賦（覺醒子系統）不顯示在天賦格
        if (cfg.hidden) return;
        const lv = this.getTalentLevel(talentId);
        const max = cfg.levels.length;

        // 覺醒強化特殊處理：只有 未解鎖/已解鎖 兩種狀態
        if (talentId === 'awakening_enhance') {
            this._updateAwakeningBadge(card, lv);
            const img = card.querySelector('img');
            if (!img) return;
            img.classList.remove('grayscale');
            img.style.filter = '';
            img.style.boxShadow = '';
            img.style.transition = 'box-shadow 240ms ease, filter 240ms ease';
            if (img._talentAnim) { try { img._talentAnim.cancel(); } catch(_){} img._talentAnim = null; }
            if (lv <= 0) {
                img.classList.add('grayscale');
                card.classList.add('locked');
            } else {
                card.classList.remove('locked');
                img.style.filter = 'saturate(1.25) brightness(1.05)';
                img.style.boxShadow = '0 0 10px rgba(255,0,255,0.85), 0 0 22px rgba(255,255,0,0.75), 0 0 34px rgba(255,255,255,0.65)';
                try {
                    img._talentAnim = img.animate([
                        { boxShadow: '0 0 6px rgba(255,255,255,0.4), 0 0 14px rgba(0,255,255,0.4)', filter: 'saturate(1.25) brightness(1.0)' },
                        { boxShadow: '0 0 12px rgba(255,0,255,0.85), 0 0 24px rgba(255,255,0,0.8), 0 0 36px rgba(255,255,255,0.75)', filter: 'saturate(1.35) brightness(1.1)' },
                        { boxShadow: '0 0 6px rgba(255,255,255,0.4), 0 0 14px rgba(0,255,255,0.4)', filter: 'saturate(1.25) brightness(1.0)' }
                    ], { duration: 1200, iterations: Infinity, easing: 'ease-in-out' });
                } catch(_){}
            }
            return;
        }

        // 注入LV徽章（僅UI，不更動數據）
        if (TalentSystem._updateLevelBadge) {
          TalentSystem._updateLevelBadge(card, lv, max);
        }
        
        // 升級邏輯：lv < max 保持 locked 以允許繼續升級；不再用 locked 控制灰階
        if (lv >= max) {
            card.classList.remove('locked');
        } else {
            card.classList.add('locked');
        }

        // 視覺效果：依等級切換
        const img = card.querySelector('img');
        if (!img) return;

        // 重置樣式與先前動畫，避免累加造成樣式腐敗
        img.classList.remove('grayscale');
        img.style.filter = '';
        img.style.boxShadow = '';
        img.style.transition = 'box-shadow 240ms ease, filter 240ms ease';
        if (img._talentAnim) {
            try { img._talentAnim.cancel(); } catch (_) {}
            img._talentAnim = null;
        }

        // 等級對應效果：
        // lv=0: 灰階；lv=1: 取消灰階；lv=2: 適度發光；lv>=3: 單純發光（不閃爍，減輕效能）
        if (lv <= 0) {
            img.classList.add('grayscale');
        } else if (lv === 1) {
            // 僅恢復顏色，不更動文案與版面
        } else if (lv === 2) {
            img.style.filter = 'saturate(1.15)';
            img.style.boxShadow = '0 0 8px rgba(0,255,255,0.75), 0 0 16px rgba(0,128,255,0.6)';
        } else { // lv >= 3（LV6）：單純發光，無閃爍動畫
            img.style.filter = 'saturate(1.25) brightness(1.05)';
            img.style.boxShadow = '0 0 12px rgba(255, 215, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.35)';
        }
    },
    
    // 將單個天賦應用到玩家身上（作為持續性道具）
    applyTalentToPlayer: function(talentId, player) {
        // 階梯版改為統一由 BuffSystem 計算，不在此直接改屬性
        return;
    },
    
    // 應用所有已解鎖天賦效果到玩家身上
    applyTalentEffects: function(player) {
        if (!player) return;
        try {
            // 重置並由 BuffSystem 依天賦等級套用最高效果
            if (player.buffs) {
                for (const k in player.buffs) player.buffs[k] = false;
            }
            if (typeof BuffSystem !== 'undefined' && BuffSystem.applyBuffsFromTalents) {
                BuffSystem.resetAllBuffs(player);
                BuffSystem.applyBuffsFromTalents(player);
            }
        } catch (e) {
            console.error('應用天賦效果失敗:', e);
        }
    },
    
    // 獲取已解鎖的天賦列表
    getUnlockedTalents: function() {
        // 以等級為主；同時兼容舊 unlocked_talents
        const result = [];
        try {
            const levels = this.getTalentLevels();
            Object.keys(levels).forEach(id => { if (levels[id] > 0) result.push(id); });
            const legacy = JSON.parse(localStorage.getItem('unlocked_talents') || '[]');
            legacy.forEach(id => { if (!result.includes(id)) result.push(id); });
        } catch(e) {}
        return result;
    },

    // ===== 覺醒系統 =====
    _awakeningSlots: [
        { id: 'awakening_hp', name: '生命覺醒', icon: 'assets/images/A68.png', cost: 200000,
          desc: '生存模式增加 3000 HP（平加在公式上）。', effectDesc: 'HP +3000' },
        { id: 'awakening_regen', name: '回復覺醒', icon: 'assets/images/A67.png', cost: 150000,
          desc: '生存模式增加 1000% 回血速度（平加在公式上）。', effectDesc: '回血速度 +1000%' },
        { id: 'awakening_attack', name: '力量覺醒', icon: 'assets/images/A66.jpg', cost: 100000,
          desc: '生存模式增加 300 基礎攻擊（平加在公式上）。', effectDesc: '基礎攻擊 +300' }
    ],
    _awakeningWindowOpen: false,

    showAwakeningWindow: function() {
        const overlay = document.getElementById('awakening-overlay');
        if (!overlay) return;
        this._awakeningWindowOpen = true;
        this._refreshAwakeningSlots();
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
    },

    hideAwakeningWindow: function() {
        const overlay = document.getElementById('awakening-overlay');
        if (!overlay) return;
        this._awakeningWindowOpen = false;
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
        // 清除覺醒描述
        const descEl = document.getElementById('awakening-desc-text');
        if (descEl) descEl.textContent = '點選覺醒格子查看詳細說明。';
    },

    _refreshAwakeningSlots: function() {
        this._awakeningSlots.forEach(slot => {
            const btn = document.querySelector('#awakening-overlay .awakening-slot[data-awakening-id="' + slot.id + '"]');
            if (!btn) return;
            const lv = this.getTalentLevel(slot.id);
            const img = btn.querySelector('img');
            const statusEl = btn.querySelector('.awakening-slot-status');
            if (lv > 0) {
                if (img) { img.classList.remove('grayscale'); img.style.filter = ''; }
                if (statusEl) { statusEl.textContent = '已解鎖'; statusEl.style.color = '#4cff4c'; }
                btn.classList.remove('locked');
                btn.classList.add('awakened');
                // 已解鎖：單純發光（無閃爍動畫）
                if (img) {
                    try { if (img._awakeningAnim) img._awakeningAnim.cancel(); img._awakeningAnim = null; } catch(_){}
                    img.style.filter = 'saturate(1.2) brightness(1.05)';
                    img.style.boxShadow = '0 0 12px rgba(255, 215, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.35)';
                }
            } else {
                if (img) { img.classList.add('grayscale'); img.style.filter = ''; img.style.boxShadow = ''; }
                if (statusEl) { statusEl.textContent = '未解鎖'; statusEl.style.color = '#aaa'; }
                btn.classList.add('locked');
                btn.classList.remove('awakened');
            }
        });
    },

    _handleAwakeningSlotClick: function(slotId) {
        const slot = this._awakeningSlots.find(s => s.id === slotId);
        if (!slot) return;
        try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('button_click2'); } catch(_){}
        const lv = this.getTalentLevel(slotId);
        const descEl = document.getElementById('awakening-desc-text');
        if (!descEl) return;
        if (lv > 0) {
            descEl.innerHTML = '<strong>' + slot.name + '</strong>（已解鎖）<br>' + slot.desc;
        } else {
            descEl.innerHTML = '<strong>' + slot.name + '</strong><br>' + slot.desc + '<br>解鎖費用：<span style="color:#ffd700;">' + slot.cost.toLocaleString() + ' 金幣</span>';
        }
        // 標記選中
        document.querySelectorAll('#awakening-overlay .awakening-slot.active').forEach(el => el.classList.remove('active'));
        const btn = document.querySelector('#awakening-overlay .awakening-slot[data-awakening-id="' + slotId + '"]');
        if (btn) btn.classList.add('active');
    },

    _handleAwakeningSlotDblClick: function(slotId) {
        const slot = this._awakeningSlots.find(s => s.id === slotId);
        if (!slot) return;
        const lv = this.getTalentLevel(slotId);
        if (lv > 0) return; // 已解鎖
        // 金幣檢查
        if (typeof Game === 'undefined' || Game.coins < slot.cost) {
            try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('button_click'); } catch(_){}
            const descEl = document.getElementById('awakening-desc-text');
            if (descEl) descEl.innerHTML = '<strong>' + slot.name + '</strong><br><span style="color:#ff6b6b;">金幣不足！需要 ' + slot.cost.toLocaleString() + ' 金幣。</span>';
            return;
        }
        // 扣款
        Game.coins -= slot.cost;
        Game.saveCoins();
        try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('button_click'); } catch(_){}
        if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) UI.updateCoinsDisplay(Game.coins);
        // 解鎖
        this.setTalentLevel(slotId, 1);
        this._refreshAwakeningSlots();
        // 更新描述
        const descEl = document.getElementById('awakening-desc-text');
        if (descEl) descEl.innerHTML = '<strong>' + slot.name + '</strong>（已解鎖）<br>' + slot.desc;
        // 應用效果
        if (Game.player) this.applyTalentEffects(Game.player);
        if (typeof UI !== 'undefined' && UI.updateTalentsList) UI.updateTalentsList();
    },

    initAwakeningWindow: function() {
        const overlay = document.getElementById('awakening-overlay');
        if (!overlay) return;
        // 返回按鈕
        const closeBtn = document.getElementById('awakening-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('button_click'); } catch(_){}
                this.hideAwakeningWindow();
            });
        }
        // 覺醒格子事件
        this._awakeningSlots.forEach(slot => {
            const btn = overlay.querySelector('.awakening-slot[data-awakening-id="' + slot.id + '"]');
            if (!btn) return;
            btn.addEventListener('click', () => this._handleAwakeningSlotClick(slot.id));
            btn.addEventListener('dblclick', () => this._handleAwakeningSlotDblClick(slot.id));
        });
        // 點擊外側關閉
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('button_click'); } catch(_){}
                this.hideAwakeningWindow();
            }
        });
    }
};

// 全局函數，用於在其他文件中調用
function applyTalentEffects(player) {
    TalentSystem.applyTalentEffects(player);
}

// 添加一個全局函數用於清除天賦數據（測試用）
function clearTalentData() {
    try {
        // 同時清除舊制與新制儲存：unlocked_talents 與 talent_levels
        localStorage.removeItem('unlocked_talents');
        localStorage.removeItem('talent_levels');
        console.log('已清除天賦數據');
        
        // 立即重置卡片外觀與 ESC 清單（不改任何文字）
        try {
            if (typeof TalentSystem !== 'undefined') {
                if (TalentSystem.tieredTalents) {
                    Object.keys(TalentSystem.tieredTalents).forEach(id => {
                        TalentSystem.updateTalentCardAppearance(id);
                    });
                }
                // 清除玩家身上 Buff 並重新套用（回到0級）
                if (typeof Game !== 'undefined' && Game.player && typeof BuffSystem !== 'undefined') {
                    BuffSystem.resetAllBuffs(Game.player);
                    TalentSystem.applyTalentEffects(Game.player);
                }
            }
            if (typeof UI !== 'undefined' && UI.updateTalentsList) {
                UI.updateTalentsList();
            }
        } catch (_) {}
        
        alert('天賦數據已清除，請重新啟動遊戲以應用更改');
        return true;
    } catch (e) {
        console.error('清除天賦數據失敗:', e);
        return false;
    }
}

// 階梯天賦輔助方法（若缺則掛載到 TalentSystem）
if (!TalentSystem.getTalentLevels) {
    TalentSystem.getTalentLevels = function() {
        try {
            const raw = localStorage.getItem('talent_levels');
            const obj = raw ? JSON.parse(raw) : {};
            return (obj && typeof obj === 'object') ? obj : {};
        } catch (e) {
            return {};
        }
    };
}
if (!TalentSystem.getTalentLevel) {
    TalentSystem.getTalentLevel = function(id) {
        const levels = this.getTalentLevels();
        const cfg = this.tieredTalents[id];
        const val = parseInt(levels[id] || 0, 10) || 0;
        if (!cfg) return 0;
        return Math.max(0, Math.min(val, cfg.levels.length));
    };
}
if (!TalentSystem.setTalentLevel) {
    TalentSystem.setTalentLevel = function(id, newLevel) {
        const cfg = this.tieredTalents[id];
        if (!cfg) return;
        const clamped = Math.max(0, Math.min(parseInt(newLevel || 0, 10), cfg.levels.length));
        const levels = this.getTalentLevels();
        levels[id] = clamped;
        try { localStorage.setItem('talent_levels', JSON.stringify(levels)); } catch (_) {}
        // 兼容舊制：確保 unlocked_talents 內有此鍵（僅作展示用途）
        if (clamped > 0) {
            try {
                const key = 'unlocked_talents';
                const arr = JSON.parse(localStorage.getItem(key) || '[]');
                if (!arr.includes(id)) {
                    arr.push(id);
                    localStorage.setItem(key, JSON.stringify(arr));
                }
            } catch (_) {}
        }
    };
}
if (!TalentSystem.getNextLevelCost) {
    TalentSystem.getNextLevelCost = function(id) {
        const cfg = this.tieredTalents[id];
        if (!cfg) return null;
        const lv = this.getTalentLevel(id);
        if (lv >= cfg.levels.length) return null;
        return cfg.levels[lv].cost;
    };
}
if (!TalentSystem.getHighestTierDescription) {
    TalentSystem.getHighestTierDescription = function(id) {
        const lv = this.getTalentLevel(id);
        const base = (this.talents[id] && this.talents[id].description) || '';
        const cfg = this.tieredTalents[id];
        if (!cfg || lv <= 0) return base;
        const eff = cfg.levels[lv - 1];
        if (id === 'hp_boost') {
            return `增加初始生命值${eff.hp}點`;
        } else if (id === 'defense_boost') {
            return `每次受傷減免${eff.reduction}點`;
        } else if (id === 'speed_boost') {
            const pct = Math.round((eff.multiplier - 1) * 100);
            return `移動速度+${pct}%`;
        } else if (id === 'pickup_range_boost') {
            const pct = Math.round((eff.multiplier - 1) * 100);
            return `拾取範圍+${pct}%`;
        } else if (id === 'damage_boost') {
            const pct = Math.round((eff.multiplier - 1) * 100);
            return `攻擊傷害+${pct}%`;
        } else if (id === 'damage_specialization') {
            const flat = eff.flat || 0;
            return `每次攻擊追加傷害+${flat}`;
        } else if (id === 'crit_enhance') {
            const pct = Math.round((eff.chancePct || 0) * 100);
            return `爆擊率+${pct}%`;
        } else if (id === 'regen_speed_boost') {
            const pct = Math.round((eff.multiplier - 1) * 100);
            return `回血速度+${pct}%`;
        } else if (id === 'experience_boost') {
            const pct = Math.round((eff.multiplier - 1) * 100);
            return `經驗值+${pct}%`;
        } else if (id === 'levelup_action_charges') {
            const add = eff.reroll || 0;
            return `重抽/換一個/保留次數各+${add}`;
        } else if (id === 'defense_gold_boost') {
            const bonus = eff.bonus || 0;
            return `防禦模式初始消波塊+${bonus}`;
        } else if (id === 'dodge_enhance') {
            const pct = Math.round((eff.dodgeRate || 0) * 100);
            return `迴避傷害的機率+${pct}%`;
        } else if (id === 'chicken_blessing_boost') {
            const flat = eff.flat || 0;
            return `雞腿庇佑基礎攻擊+${flat}`;
        } else if (id === 'sheep_guard_boost') {
            const flat = eff.flat || 0;
            return `綿羊護體基礎攻擊+${flat}`;
        } else if (id === 'heart_companion_boost') {
            const flat = eff.flat || 0;
            return `心意相隨基礎攻擊+${flat}`;
        } else if (id === 'rotating_muffin_boost') {
            const flat = eff.flat || 0;
            return `旋轉鬆餅基礎攻擊+${flat}`;
        } else if (id === 'pineapple_orbit_boost') {
            const flat = eff.flat || 0;
            return `鳳梨環繞基礎攻擊+${flat}`;
        } else if (id === 'gravity_wave_boost') {
            const multiplier = eff.pushMultiplier || 0;
            const percent = Math.round(multiplier * 100);
            return `引力波推力+${percent}%`;
        } else if (id === 'ai_boost') {
            const pct = Math.round((eff.multiplier - 1) * 100);
            return `召喚AI傷害+${pct}%`;
        } else if (id === 'stellar_orbit_boost') {
            const flat = eff.flat || 0;
            return `星體軌跡基礎攻擊+${flat}`;
        } else if (id === 'gabriel_orbit_boost') {
            const flat = eff.flat || 0;
            return `加百列基礎攻擊+${flat}`;
        } else if (id === 'awakening_enhance') {
            return lv > 0 ? '覺醒系統已解鎖，點擊進入覺醒強化。' : '需要「覺醒之路」成就來解鎖覺醒系統。';
        } else if (id === 'awakening_hp') {
            return lv > 0 ? '生存模式 HP+3000（已解鎖）' : '生存模式 HP+3000';
        } else if (id === 'awakening_regen') {
            return lv > 0 ? '生存模式回血速度+1000%（已解鎖）' : '生存模式回血速度+1000%';
        } else if (id === 'awakening_attack') {
            return lv > 0 ? '生存模式基礎攻擊+300（已解鎖）' : '生存模式基礎攻擊+300';
        }
        return base;
    };
}
if (!TalentSystem.migrateLegacyTalentData) {
    TalentSystem.migrateLegacyTalentData = function() {
        try {
            const levels = this.getTalentLevels();
            const legacy = JSON.parse(localStorage.getItem('unlocked_talents') || '[]');
            // 生命：取最高一個
            let hpLv = levels.hp_boost || 0;
            if (Array.isArray(legacy)) {
                if (legacy.includes('hp_boost_100')) hpLv = Math.max(hpLv, 3);
                if (legacy.includes('hp_boost_50')) hpLv = Math.max(hpLv, 2);
                if (legacy.includes('hp_boost')) hpLv = Math.max(hpLv, 1);
                // 速度：舊制只有一級
                if ((levels.speed_boost || 0) < 1 && legacy.includes('speed_boost')) {
                    levels.speed_boost = 1;
                }
            }
            if ((levels.hp_boost || 0) < hpLv) levels.hp_boost = hpLv;
            localStorage.setItem('talent_levels', JSON.stringify(levels));
        } catch (e) {
            console.warn('遷移舊版天賦資料失敗', e);
        }
    };
}

// 全局同步閃爍控制器：僅用於最高級(>=3)天賦卡的圖片閃爍
if (!TalentSystem._flickerSync) {
  TalentSystem._flickerSync = (function(){
    const targets = new Set();
    let rafId = null;
    let periodMs = 1200; // 同步節奏：1.2秒一輪
    let lastPhaseHigh = false;

    function applyStyle(img, high){
      // 高光/常態兩種樣式，避免修改既有版面
      if (high) {
        img.style.filter = 'saturate(1.25) brightness(1.05)';
        img.style.boxShadow = '0 0 12px 4px rgba(255, 215, 0, 0.8)';
      } else {
        img.style.filter = 'saturate(1.1) brightness(1.0)';
        img.style.boxShadow = '0 0 8px 2px rgba(255, 215, 0, 0.5)';
      }
    }

    function tick(){
      const now = performance.now();
      const phase = (now % periodMs) / periodMs; // 0..1
      const high = phase < 0.5; // 前半段高光，後半段常態
      if (high !== lastPhaseHigh) {
        lastPhaseHigh = high;
        targets.forEach(img => applyStyle(img, high));
      }
      rafId = requestAnimationFrame(tick);
    }

    function start(){
      if (rafId == null) rafId = requestAnimationFrame(tick);
    }
    function stop(){
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = null;
    }

    return {
      register(img){
        if (!targets.has(img)) {
          // 清除可能存在的舊動畫，統一由同步器管理
          if (img._talentAnim && typeof img._talentAnim.cancel === 'function') {
            try { img._talentAnim.cancel(); } catch(e) {}
          }
          targets.add(img);
          applyStyle(img, true);
          start();
        }
      },
      unregister(img){
        if (targets.has(img)) {
          targets.delete(img);
          // 回到非最高級的基本樣式，由 updateTalentCardAppearance 再設置
          img.style.boxShadow = '';
          img.style.filter = '';
          if (targets.size === 0) stop();
        }
      },
      setPeriod(ms){
        periodMs = Math.max(600, ms|0);
      }
    };
  })();
}

// 最小依賴：LV徽章注入器（僅UI覆蓋，不動存檔與文案）
if (!TalentSystem._updateLevelBadge) {
  TalentSystem._updateLevelBadge = function(card, lv, max) {
    try {
      const clamped = Math.max(0, Math.min(lv|0, max|0));
      let badge = card.querySelector('.talent-level-badge');
      if (clamped <= 0) {
        if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
        if (card._hadPositionInjected) {
          card.style.position = '';
          delete card._hadPositionInjected;
        }
        card.classList.remove('lv-max');
        return;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'talent-level-badge';
        card.appendChild(badge);
      }
      const lvText = clamped;
      badge.textContent = 'LV' + lvText;
      badge.className = 'talent-level-badge lv' + lvText;
      const style = badge.style;
      style.position = 'absolute';
      style.top = '8px';
      style.left = '8px';
      style.padding = '2px 6px';
      style.border = '2px solid #fff';
      style.borderRadius = '6px';
      style.color = '#fff';
      style.background = 'rgba(0,0,0,0.35)';
      style.fontWeight = '800';
      style.fontSize = '12px';
      style.lineHeight = '1';
      style.zIndex = '99';
      style.pointerEvents = 'none';
      style.textShadow = '0 1px 2px rgba(0,0,0,0.9)';
      // 手機視窗：改用字級與間距避免 transform 模糊，並提高對比
      try {
        const isMobile = (typeof window !== 'undefined') && (
          (window.matchMedia && (window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches))
        );
        if (isMobile) {
          style.fontSize = '14px';
          style.padding = '3px 8px';
          style.top = '6px';
          style.left = '6px';
          style.background = 'rgba(0,0,0,0.55)';
          style.transform = '';
          style.transformOrigin = '';
        }
      } catch(_) {}
      if (lvText === 1) {
        style.boxShadow = 'none';
      } else if (lvText === 2) {
        style.boxShadow = '0 0 8px rgba(0, 255, 255, 0.6)';
      } else {
        style.boxShadow = '0 0 10px rgba(255, 215, 0, 0.8)';
      }
      const compPos = getComputedStyle(card).position;
      if (compPos === 'static') {
        card.style.position = 'relative';
        card._hadPositionInjected = true;
      }

      // 滿級標記：加上金色背景class（供CSS動畫使用）
      if (clamped >= max) {
        card.classList.add('lv-max');
      } else {
        card.classList.remove('lv-max');
      }
    } catch(_) {}
  };
}

// 覺醒強化專用徽章：顯示「未解鎖」/「已解鎖」+ 獨特性標籤
if (!TalentSystem._updateAwakeningBadge) {
  TalentSystem._updateAwakeningBadge = function(card, lv) {
    try {
      // 狀態徽章（左上角）
      let badge = card.querySelector('.talent-level-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'talent-level-badge';
        card.appendChild(badge);
      }
      badge.textContent = lv > 0 ? '已解鎖' : '未解鎖';
      badge.className = 'talent-level-badge';
      const bs = badge.style;
      bs.position = 'absolute'; bs.top = '8px'; bs.left = '8px';
      bs.padding = '2px 6px'; bs.border = '2px solid #fff'; bs.borderRadius = '6px';
      bs.color = '#fff'; bs.background = lv > 0 ? 'rgba(76,255,76,0.4)' : 'rgba(0,0,0,0.35)';
      bs.fontWeight = '800'; bs.fontSize = '11px'; bs.lineHeight = '1';
      bs.zIndex = '99'; bs.pointerEvents = 'none';
      bs.textShadow = '0 1px 2px rgba(0,0,0,0.9)';
      bs.boxShadow = lv > 0 ? '0 0 10px rgba(255,215,0,0.8)' : 'none';
      // 獨特性標籤（右下角）
      let uniqueTag = card.querySelector('.talent-unique-tag');
      if (!uniqueTag) {
        uniqueTag = document.createElement('span');
        uniqueTag.className = 'talent-unique-tag';
        uniqueTag.textContent = '獨特性';
        card.appendChild(uniqueTag);
      }
      const us = uniqueTag.style;
      us.position = 'absolute'; us.bottom = '8px'; us.right = '8px';
      us.padding = '2px 6px'; us.border = '1px solid rgba(255,215,0,0.7)';
      us.borderRadius = '4px'; us.color = '#ffd700';
      us.background = 'rgba(0,0,0,0.5)'; us.fontWeight = '700';
      us.fontSize = '10px'; us.lineHeight = '1'; us.zIndex = '99';
      us.pointerEvents = 'none'; us.textShadow = '0 0 4px rgba(255,215,0,0.5)';
      const compPos = getComputedStyle(card).position;
      if (compPos === 'static') { card.style.position = 'relative'; card._hadPositionInjected = true; }
      if (lv > 0) { card.classList.add('lv-max'); } else { card.classList.remove('lv-max'); }
    } catch(_){}
  };
}

function updateTalentCardAppearance(card, level){
  const img = card.querySelector('img');
  // 先清除舊動畫引用，避免重複
  if (img && img._talentAnim && typeof img._talentAnim.cancel === 'function') {
    try { img._talentAnim.cancel(); } catch(e) {}
    img._talentAnim = null;
  }

  if (level <= 0) {
    if (img) {
      TalentSystem._flickerSync.unregister(img);
      img.classList.add('grayscale');
      img.style.filter = 'grayscale(100%)';
      img.style.boxShadow = '';
    }
    card.classList.add('locked');
    card.classList.remove('selectable');
  } else if (level === 1) {
    if (img) {
      TalentSystem._flickerSync.unregister(img);
      img.classList.remove('grayscale');
      img.style.filter = 'none';
      img.style.boxShadow = '';
    }
    card.classList.remove('locked');
    card.classList.add('selectable');
  } else if (level === 2) {
    if (img) {
      TalentSystem._flickerSync.unregister(img);
      img.classList.remove('grayscale');
      img.style.filter = 'saturate(1.1)';
      img.style.boxShadow = '0 0 8px 2px rgba(255, 215, 0, 0.4)';
    }
    card.classList.remove('locked');
    card.classList.add('selectable');
  } else {
    // >=3 最高級：單純發光（不閃爍，減輕效能）；唯獨覺醒強化在 TalentSystem.updateTalentCardAppearance 內維持閃爍
    card.classList.remove('locked');
    card.classList.add('selectable');
    if (img) {
      TalentSystem._flickerSync.unregister(img);
      img.classList.remove('grayscale');
      img.style.filter = 'saturate(1.25) brightness(1.05)';
      img.style.boxShadow = '0 0 12px rgba(255, 215, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.35)';
    }
  }
  // 注入LV徽章（共用，僅UI，最大值動態）
  if (typeof TalentSystem !== 'undefined' && TalentSystem._updateLevelBadge) {
    try {
      const id = card && card.getAttribute('data-talent-id');
      const cfg = id && TalentSystem.tieredTalents ? TalentSystem.tieredTalents[id] : null;
      const max = (cfg && Array.isArray(cfg.levels)) ? cfg.levels.length : 3;
      TalentSystem._updateLevelBadge(card, level, max);
    } catch(_) {
      TalentSystem._updateLevelBadge(card, level, 3);
    }
  }
}
