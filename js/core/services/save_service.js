// SaveService（包裝 SaveCode，相容升級骨架）
// 職責：提供一致的存檔/引繼介面，保證不更動 SaveCode 模組邏輯與 localStorage 鍵名，並預留舊版自動升級流程。
// 維護備註：
// - 不改 SaveCode：不改動 SCHEMA_VERSION、SALT、簽章與編碼邏輯。
// - 不改鍵名：沿用 'game_coins'、'talent_levels'、'unlocked_talents'、'achievements'；若未來新增資料，請以「預設值」策略相容，不覆蓋舊鍵。
// - 升級策略：目前為 V2 最小集合；若新增欄位，請：
//   1) 在此檔實作 upgradeSchemaIfNeeded() 將缺失欄位補上預設值；
//   2) SaveCode.collect() 可維持只收集最小集合，或於未來提升版本時追加欄位（仍允許舊碼套用）。
(function(){
  function readJSON(key, fallback){
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch(_) { return fallback; }
  }
  function writeJSON(key, obj){
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch(_) {}
  }

  function readNumber(key, fallback){
    try { const s = localStorage.getItem(key); const n = parseInt(s, 10); return Number.isFinite(n) ? n : fallback; } catch(_) { return fallback; }
  }
  function writeNumber(key, n){
    try { localStorage.setItem(key, String(n)); } catch(_) {}
  }

  // 自動升級舊版本存檔（目前 V2，僅確保必需鍵存在）
  function upgradeSchemaIfNeeded(){
    // 1) 金幣
    const coins = readNumber('game_coins', 0);
    if (!Number.isFinite(coins) || coins < 0) writeNumber('game_coins', 0);

    // 2) 天賦等級物件
    const levels = readJSON('talent_levels', {});
    if (!levels || typeof levels !== 'object') writeJSON('talent_levels', {});

    // 3) 舊制已解鎖天賦陣列
    const legacy = readJSON('unlocked_talents', []);
    if (!Array.isArray(legacy)) writeJSON('unlocked_talents', []);

    // 4) 成就表（可選）
    const achievements = readJSON('achievements', null);
    if (achievements && typeof achievements !== 'object') writeJSON('achievements', {});
    // 注意：不增刪鍵名，不覆蓋有效資料。
  }

  async function exportSaveCode(){
    if (typeof SaveCode === 'undefined' || typeof SaveCode.generate !== 'function') {
      throw new Error('SaveCode 模組不可用');
    }
    return await SaveCode.generate();
  }

  async function applySaveCode(code){
    if (typeof SaveCode === 'undefined' || typeof SaveCode.apply !== 'function') {
      throw new Error('SaveCode 模組不可用');
    }
    return await SaveCode.apply(code);
  }

  function getCoins(){ return readNumber('game_coins', 0); }
  function setCoins(n){ writeNumber('game_coins', Math.max(0, Math.floor(n||0))); }

  window.SaveService = { upgradeSchemaIfNeeded, exportSaveCode, applySaveCode, getCoins, setCoins };
})();