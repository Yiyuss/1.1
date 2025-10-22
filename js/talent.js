// 天賦系統
const TalentSystem = {
    // 天賦配置（基礎描述；實際效果由 tieredTalents 與等級決定）
    talents: {
        hp_boost: {
            name: '生命強化',
            description: '升級可提升初始生命值（最高+100）。',
            cost: 500
        },
        defense_boost: {
            name: '防禦強化',
            description: '升級可減免所受傷害（最高-8）。',
            cost: 5000
        },
        speed_boost: {
            name: '移動加速',
            description: '升級可提升移動速度（最高+50%）。',
            cost: 1000
        },
        // 新增：拾取範圍增加
        pickup_range_boost: {
            name: '拾取範圍增加',
            description: '升級可增加拾取範圍（最高+100%）。',
            cost: 500
        },
        // 新增：傷害強化
        damage_boost: {
            name: '傷害強化',
            description: '升級可提升攻擊傷害（最高+15%）。',
            cost: 3000
        },
        // 新增：傷害特化（追加固定傷害）
        damage_specialization: {
            name: '傷害特化',
            description: '升級可追加固定傷害（最高+6）。',
            cost: 3000
        },
        // 新增：爆擊強化（提升爆擊率）
        crit_enhance: {
            name: '爆擊強化',
            description: '升級可提升爆擊率（最高+15%）。',
            cost: 3000
        },
        // 新增：回血強化（提升回血速度）
        regen_speed_boost: {
            name: '回血強化',
            description: '升級可提升回血速度（最高+100%）。',
            cost: 3000
        }
    },

    // 階梯天賦設定：每級效果與花費
    tieredTalents: {
        hp_boost: {
            levels: [
                { hp: 20, cost: 500 },
                { hp: 50, cost: 3000 },
                { hp: 100, cost: 20000 }
            ]
        },
        defense_boost: {
            levels: [
                { reduction: 2, cost: 5000 },
                { reduction: 5, cost: 10000 },
                { reduction: 8, cost: 30000 }
            ]
        },
        speed_boost: {
            levels: [
                { multiplier: 1.1, cost: 1000 },
                { multiplier: 1.3, cost: 3000 },
                { multiplier: 1.5, cost: 5000 }
            ]
        },
        // 新增：拾取範圍增加（30%、50%、100% 對應 1.3/1.5/2.0）
        pickup_range_boost: {
            levels: [
                { multiplier: 1.3, cost: 500 },
                { multiplier: 1.5, cost: 1500 },
                { multiplier: 2.0, cost: 3000 }
            ]
        },
        // 新增：傷害強化（5%、10%、15% 對應 1.05/1.10/1.15）
        damage_boost: {
            levels: [
                { multiplier: 1.05, cost: 3000 },
                { multiplier: 1.10, cost: 6000 },
                { multiplier: 1.15, cost: 20000 }
            ]
        },
        // 新增：傷害特化（每次攻擊追加固定傷害+2/+4/+6）
        damage_specialization: {
            levels: [
                { flat: 2, cost: 3000 },
                { flat: 4, cost: 6000 },
                { flat: 6, cost: 20000 }
            ]
        },
        // 新增：爆擊強化（爆擊率+5%/+10%/+15%）
        crit_enhance: {
            levels: [
                { chancePct: 0.05, cost: 3000 },
                { chancePct: 0.10, cost: 8000 },
                { chancePct: 0.15, cost: 25000 }
            ]
        },
        // 新增：回血強化（+30%/+60%/+100% 對應 1.3/1.6/2.0）
        regen_speed_boost: {
            levels: [
                { multiplier: 1.30, cost: 3000 },
                { multiplier: 1.60, cost: 6000 },
                { multiplier: 2.00, cost: 12000 }
            ]
        }
    },
    
    // 初始化天賦系統
    init: function() {
        // 先進行舊資料遷移（hp_boost_50 / hp_boost_100 轉換為等級）
        this.migrateLegacyTalentData();
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
        // 空白鍵確認已移至 KeyboardRouter 中央處理器
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
            alert('已達最高等級');
            return;
        }
        // 金幣檢查
        if (Game.coins < nextCost) {
            alert('金幣不足！');
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
        alert('天賦已解鎖！');
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
        const lv = this.getTalentLevel(talentId);
        const max = cfg.levels.length;

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
        // lv=0: 灰階；lv=1: 取消灰階；lv=2: 適度發光；lv>=3: 增強閃光（WAAPI）
        if (lv <= 0) {
            img.classList.add('grayscale');
        } else if (lv === 1) {
            // 僅恢復顏色，不更動文案與版面
        } else if (lv === 2) {
            img.style.filter = 'saturate(1.15)';
            img.style.boxShadow = '0 0 8px rgba(0,255,255,0.75), 0 0 16px rgba(0,128,255,0.6)';
        } else { // lv >= 3
            img.style.filter = 'saturate(1.25) brightness(1.05)';
            img.style.boxShadow = '0 0 10px rgba(255,0,255,0.85), 0 0 22px rgba(255,255,0,0.75), 0 0 34px rgba(255,255,255,0.65)';
            try {
                img._talentAnim = img.animate([
                    { 'box-shadow': '0 0 6px rgba(255,255,255,0.4), 0 0 14px rgba(0,255,255,0.4)', filter: 'saturate(1.25) brightness(1.0)' },
                    { 'box-shadow': '0 0 12px rgba(255,0,255,0.85), 0 0 24px rgba(255,255,0,0.8), 0 0 36px rgba(255,255,255,0.75)', filter: 'saturate(1.35) brightness(1.1)' },
                    { 'box-shadow': '0 0 6px rgba(255,255,255,0.4), 0 0 14px rgba(0,255,255,0.4)', filter: 'saturate(1.25) brightness(1.0)' }
                ], { duration: 1200, iterations: Infinity, easing: 'ease-in-out' });
            } catch (_) {
                // 若瀏覽器不支持 WAAPI，保留靜態強光效果即可
            }
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
    // >=3 最高級：加入同步閃爍
    card.classList.remove('locked');
    card.classList.add('selectable');
    if (img) {
      img.classList.remove('grayscale');
      TalentSystem._flickerSync.register(img);
    }
  }
}
