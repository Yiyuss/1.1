// 序號兌換系統（Redeem Code System）
// 職責：管理序號驗證、金幣獎勵、使用記錄追蹤
// 依賴：Game.addCoins、localStorage
// 維護備註：
// - 每個序號可以給不同的玩家使用，但每個玩家只能使用一次
// - 使用 localStorage 存儲每個玩家已使用的序號列表（鍵名：'redeem_codes_used'）
// - 序號配置在 REDEEM_CODES 對象中，格式：{ 序號: 金幣數量 }
// - 新增序號：在 REDEEM_CODES 對象中添加新條目即可，例如：'NEWCODE2025': 5000
// - 序號不區分大小寫（統一轉為大寫進行比較）
// - 序號驗證失敗時會顯示對應的錯誤提示
// 
// 與引繼碼系統的關係：
// - 序號系統使用獨立的 localStorage 鍵 'redeem_codes_used'，不會與引繼碼系統衝突
// - 引繼碼系統導出/導入的資料不包含序號使用記錄（每個玩家獨立記錄）
// - 這意味著：玩家A使用序號後導出引繼碼給玩家B，玩家B不會繼承玩家A的序號使用記錄
// - 這是合理的設計，因為每個玩家應該獨立管理自己的序號使用情況

const RedeemCodeSystem = {
    // ============================================================================
    // 序號配置區（維護備註：在此處新增序號）
    // ============================================================================
    // 格式1（永久有效）：'序號': 金幣數量
    // 格式2（有期限）：'序號': { coins: 金幣數量, expires: 過期時間戳 }
    // 
    // 範例：
    // - 'YIYUSS2025': 10000  // 永久有效，可兌換 10000 金幣
    // - 'LIMITED2025': { coins: 5000, expires: 1735689600000 }  // 有期限，2025-01-01 00:00:00 過期
    // 
    // 注意事項：
    // - 序號會自動轉為大寫進行比較，所以 'yiyuss2025' 和 'Yiyuss2025' 視為同一序號
    // - 過期時間使用時間戳（毫秒），可用 new Date('2025-01-01').getTime() 獲取
    // - 過期後系統會自動拒絕，但建議定期清理過期序號以保持代碼整潔
    // - 手動刪除過期序號：時間到了後直接刪除該行配置即可
    // ============================================================================
    REDEEM_CODES: {
        'YIYUSS2025': 30000,         // 永久有效 主線免費序號
        'VTUBER14553': 99999,        // 永久有效 VT體驗用序號
        'VTUBER2026': 50000,         // 永久有效 YT宣傳用序號
        'BUG14501': 30000,           // 永久有效 BUG回報序號
        'BUG57518': 20000,           // 永久有效 BUG回報序號
        'BUG26412': 10000,           // 永久有效 BUG回報序號
        'BUG18554': 10000,           // 永久有效 BUG回報序號
        'DADA2025': 10000,           // 永久有效 灰妲序號
        'LOCO2025': 10000,           // 永久有效 洛可序號
        'EARENDEL2026': 10000,       // 永久有效 蒂兒序號
        'MARGARETNORTH2025': 10000,  // 永久有效 瑪麗序號
        'LINGLAN2025': 10000,        // 永久有效 鈴蘭序號
        'PINEAPPLE2026': 10000,      // 永久有效 鳳梨序號
        'RABI2025': 10000            // 永久有效 艾比序號
        // 在此處新增更多序號：
        // 'NEWCODE2025': 5000,  // 永久有效
        // 'LIMITED2025': { coins: 5000, expires: new Date('2025-12-31').getTime() },  // 有期限
    },
    
    // localStorage 鍵名（存儲已使用的序號列表）
    STORAGE_KEY: 'redeem_codes_used',
    
    /**
     * 獲取當前玩家已使用的序號列表
     * @returns {Array<string>} 已使用的序號列表（大寫）
     */
    getUsedCodes: function() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) return [];
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('[RedeemCodeSystem] 讀取已使用序號失敗:', e);
            return [];
        }
    },
    
    /**
     * 將序號標記為已使用
     * @param {string} code - 序號（會自動轉為大寫）
     */
    markCodeAsUsed: function(code) {
        try {
            const used = this.getUsedCodes();
            const upperCode = code.toUpperCase().trim();
            if (!used.includes(upperCode)) {
                used.push(upperCode);
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(used));
            }
        } catch (e) {
            console.error('[RedeemCodeSystem] 標記序號為已使用失敗:', e);
        }
    },
    
    /**
     * 檢查序號是否已被當前玩家使用
     * @param {string} code - 序號（會自動轉為大寫）
     * @returns {boolean} 是否已使用
     */
    isCodeUsed: function(code) {
        const used = this.getUsedCodes();
        const upperCode = code.toUpperCase().trim();
        return used.includes(upperCode);
    },
    
    /**
     * 驗證並兌換序號
     * @param {string} code - 序號
     * @returns {Object} { success: boolean, message: string, coins?: number }
     */
    redeemCode: function(code) {
        if (!code || typeof code !== 'string') {
            return { success: false, message: '請輸入有效的序號' };
        }
        
        const trimmedCode = code.trim();
        if (trimmedCode.length === 0) {
            return { success: false, message: '序號不能為空' };
        }
        
        // 轉為大寫進行比較（序號不區分大小寫）
        const upperCode = trimmedCode.toUpperCase();
        
        // 調試：輸出序號配置和輸入的序號（僅開發時使用）
        if (typeof console !== 'undefined' && console.log) {
            console.log('[RedeemCodeSystem] 輸入序號:', trimmedCode, '轉換後:', upperCode);
            console.log('[RedeemCodeSystem] 可用序號列表:', Object.keys(this.REDEEM_CODES).map(k => k.toUpperCase()));
            console.log('[RedeemCodeSystem] 已使用序號列表:', this.getUsedCodes());
        }
        
        // 檢查序號是否存在（將配置中的鍵名也轉為大寫進行比較，確保大小寫不敏感）
        const codeKeys = Object.keys(this.REDEEM_CODES);
        const upperCodeKeys = codeKeys.map(k => k.toUpperCase());
        const codeIndex = upperCodeKeys.indexOf(upperCode);
        
        if (codeIndex === -1) {
            // 提供更詳細的錯誤信息，幫助調試
            const similarCodes = upperCodeKeys.filter(k => k.includes(upperCode) || upperCode.includes(k));
            let errorMsg = '序號不存在';
            if (similarCodes.length > 0) {
                errorMsg += `。相似的序號：${similarCodes.join(', ')}`;
            }
            console.warn('[RedeemCodeSystem] 序號不存在:', {
                input: trimmedCode,
                upper: upperCode,
                available: upperCodeKeys,
                similar: similarCodes
            });
            return { success: false, message: errorMsg };
        }
        
        // 使用原始鍵名獲取配置（因為配置中的鍵名可能不是大寫）
        const originalKey = codeKeys[codeIndex];
        const codeConfig = this.REDEEM_CODES[originalKey];
        
        // 解析配置：支援兩種格式
        // 格式1：直接是數字（永久有效）
        // 格式2：對象 { coins: 數字, expires: 時間戳 }
        let coins, expires;
        if (typeof codeConfig === 'number') {
            coins = codeConfig;
            expires = null; // 永久有效
        } else if (codeConfig && typeof codeConfig === 'object' && typeof codeConfig.coins === 'number') {
            coins = codeConfig.coins;
            expires = codeConfig.expires || null;
        } else {
            return { success: false, message: '序號配置錯誤' };
        }
        
        // 檢查是否過期
        if (expires !== null && typeof expires === 'number') {
            const now = Date.now();
            if (now > expires) {
                return { success: false, message: '此序號已過期' };
            }
        }
        
        // 檢查序號是否已被使用
        if (this.isCodeUsed(upperCode)) {
            console.warn('[RedeemCodeSystem] 序號已被使用:', upperCode);
            return { success: false, message: '此序號已使用過，每個序號只能使用一次' };
        }
        
        // 標記為已使用
        this.markCodeAsUsed(upperCode);
        
        // 發放金幣
        try {
            if (typeof Game !== 'undefined' && typeof Game.addCoins === 'function') {
                Game.addCoins(coins);
                console.log('[RedeemCodeSystem] 成功發放金幣:', coins);
            } else {
                console.error('[RedeemCodeSystem] 遊戲系統未初始化:', {
                    Game: typeof Game,
                    addCoins: typeof Game !== 'undefined' ? typeof Game.addCoins : 'undefined'
                });
                return { success: false, message: '遊戲系統未初始化，無法發放金幣。請先進入遊戲主界面。' };
            }
        } catch (e) {
            console.error('[RedeemCodeSystem] 發放金幣失敗:', e);
            return { success: false, message: '發放金幣時發生錯誤: ' + e.message };
        }
        
        return { 
            success: true, 
            message: `成功兌換序號！獲得 ${coins.toLocaleString()} 金幣`,
            coins: coins 
        };
    }
};

// 導出到全局（如果需要在其他地方使用）
if (typeof window !== 'undefined') {
    window.RedeemCodeSystem = RedeemCodeSystem;
    
    // 添加診斷函數（開發用）
    RedeemCodeSystem.diagnose = function(code) {
        if (!code) {
            console.log('[RedeemCodeSystem] 診斷：請提供序號');
            return;
        }
        const trimmed = code.trim();
        const upper = trimmed.toUpperCase();
        const used = this.getUsedCodes();
        const available = Object.keys(this.REDEEM_CODES).map(k => k.toUpperCase());
        const exists = available.includes(upper);
        const isUsed = used.includes(upper);
        
        console.log('[RedeemCodeSystem] 診斷結果:', {
            輸入序號: trimmed,
            轉換後: upper,
            序號長度: trimmed.length,
            是否存在: exists,
            是否已使用: isUsed,
            可用序號列表: available,
            已使用序號列表: used,
            遊戲系統狀態: {
                Game: typeof Game,
                addCoins: typeof Game !== 'undefined' ? typeof Game.addCoins : 'undefined'
            }
        });
        
        if (!exists) {
            console.warn('序號不存在於配置中');
        } else if (isUsed) {
            console.warn('序號已被使用過');
        } else {
            console.log('序號可以正常兌換');
        }
    };
}


