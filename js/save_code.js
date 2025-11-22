// 引繼碼系統
/**
 * SaveCode（引繼碼系統）
 * 職責：生成、驗證與套用跨裝置引繼碼，保留既有自動存檔（localStorage）。
 * 依賴：localStorage（鍵：'game_coins'、'talent_levels'、'unlocked_talents'）、Game、UI、TalentSystem、Crypto API（可選）。
 * 不變式：
 * - 不改任何玩家可見文字與既有畫面；僅新增介面與功能。
 * - 不改動既有鍵名與資料格式（僅在本模組做讀寫匯出/匯入）。
 * - 生成/套用過程不影響遊戲機制與事件順序；僅更新localStorage並在必要時刷新顯示。
 * 維護備註（風險與版本）：
 * - SaveSchema V1 欄位：v(版本)、ts(時間戳)、c(金幣)、tl(天賦等級物件)、ut(舊制已解鎖天賦陣列)。
 * - SaveSchema V2 新增欄位：ac(已解鎖成就ID陣列)。
 * - SaveSchema V3 新增欄位：uc(已解鎖角色ID陣列，對應 localStorage 'unlocked_characters')。
 * - 未來若新增資料（例如關卡進度/音量等）請：
 *   1) 提升 v 版本號，新增最小相容邏輯（舊欄位保留且有預設值）。
 *   2) 維持鍵名穩定（避免破壞舊碼）。
 *   3) 在此檔案頂部更新「版本維護註記」。
 * - 加密/驗證：採用簡易對稱 XOR（key 來源為 SHA-256(salt) 或 FNV32 fallback），並以簽章（payload+salt 的雜湊前12位）驗證。
 *   這是防篡改、非安全強度保密（無伺服器條件下的折衷），請勿用於敏感資料。
 */
const SaveCode = (function(){
  const SCHEMA_VERSION = 3;
  const SALT = 'MC_SAVE_SALT_V1::固定常量::僅用於防篡改';

  // 取得現有存檔資料（最小集合）
  function collect(){
    // coins
    let coins = 0;
    try {
      const s = localStorage.getItem('game_coins');
      const n = parseInt(s, 10);
      coins = Number.isFinite(n) && n >= 0 ? n : 0;
    } catch(_) {}
    // talent levels
    let levels = {};
    try {
      const raw = localStorage.getItem('talent_levels');
      const obj = raw ? JSON.parse(raw) : {};
      levels = (obj && typeof obj === 'object') ? obj : {};
    } catch(_) {}
    // legacy unlocked talents
    let legacy = [];
    try {
      const arr = JSON.parse(localStorage.getItem('unlocked_talents') || '[]');
      legacy = Array.isArray(arr) ? arr : [];
    } catch(_) {}
    // achievements（若存在）
    let achievements = [];
    try {
      if (typeof Achievements !== 'undefined' && Achievements.getUnlockedIds) {
        achievements = Achievements.getUnlockedIds();
      } else {
        const raw = localStorage.getItem('achievements');
        const map = raw ? JSON.parse(raw) : {};
        achievements = Object.keys(map || {}).filter(k => map[k] && map[k].unlocked);
      }
    } catch(_) {}
    // unlocked characters（角色解鎖狀態，對應選角介面的購買解鎖）
    let unlockedChars = [];
    try {
      const raw = localStorage.getItem('unlocked_characters');
      const arr = raw ? JSON.parse(raw) : [];
      unlockedChars = Array.isArray(arr) ? arr : [];
    } catch(_) {}
    // 確保預設角色永遠解鎖
    if (!unlockedChars.includes('margaret')) unlockedChars.push('margaret');

    return {
      v: SCHEMA_VERSION,
      ts: Date.now(),
      c: Math.max(0, Math.floor(coins||0)),
      tl: levels,
      ut: legacy,
      ac: achievements,
      uc: unlockedChars
    };
  }

  // --- Base64URL 工具 ---
  function toUint8(str){
    return new TextEncoder().encode(str);
  }
  function fromUint8(buf){
    return new TextDecoder().decode(buf);
  }
  function b64urlFromBytes(bytes){
    let bin = '';
    for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return b64;
  }
  function bytesFromB64url(b64){
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const b64std = b64.replace(/-/g,'+').replace(/_/g,'/') + pad;
    const bin = atob(b64std);
    const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // --- 簡易雜湊（優先使用 SHA-256；fallback FNV32） ---
  async function hash256Bytes(dataBytes){
    try {
      if (crypto && crypto.subtle && crypto.subtle.digest) {
        const digest = await crypto.subtle.digest('SHA-256', dataBytes);
        return new Uint8Array(digest);
      }
    } catch(_) {}
    // Fallback: FNV-1a 32-bit，重複填充至32位元組
    let h = 0x811c9dc5 >>> 0;
    for (let i=0;i<dataBytes.length;i++){
      h ^= dataBytes[i];
      h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0; // * FNV prime
    }
    const out = new Uint8Array(32);
    for (let i=0;i<32;i++){
      out[i] = (h >>> ((i%4)*8)) & 0xff;
    }
    return out;
  }

  // 以 SALT 的雜湊作為 XOR key（對稱）
  async function getKeyStream(){
    const saltBytes = toUint8(SALT);
    return await hash256Bytes(saltBytes);
  }

  // 產生簽章（驗證用，前12位）
  async function signPayloadStr(payloadStr){
    const bytes = toUint8(payloadStr + SALT);
    const digest = await hash256Bytes(bytes);
    return digest.slice(0, 12);
  }

  function xorBytes(data, key){
    const out = new Uint8Array(data.length);
    for (let i=0;i<data.length;i++){
      out[i] = data[i] ^ key[i % key.length];
    }
    return out;
  }

  // 生成引繼碼
  async function generate(){
    const payload = collect();
    const payloadStr = JSON.stringify(payload);
    const payloadBytes = toUint8(payloadStr);
    const key = await getKeyStream();
    const cipher = xorBytes(payloadBytes, key);
    const sig = await signPayloadStr(payloadStr);
    const code = `MC${SCHEMA_VERSION}-` + b64urlFromBytes(cipher) + '.' + b64urlFromBytes(sig);
    return code;
  }

  // 套用引繼碼（驗證簽章後寫入localStorage）
  async function apply(code){
    try {
      if (typeof code !== 'string' || !code.includes('-') || !code.includes('.')) {
        alert('引繼碼格式錯誤');
        return false;
      }
      // 只切第一個連字號，避免 Base64URL 內容中的 '-' 造成解析錯誤
      const dashIndex = code.indexOf('-');
      const prefix = dashIndex >= 0 ? code.slice(0, dashIndex) : '';
      const rest = dashIndex >= 0 ? code.slice(dashIndex + 1) : '';
      if (!prefix || !prefix.startsWith('MC')) {
        alert('引繼碼版本不相容');
        return false;
      }
      const version = parseInt(prefix.slice(2), 10);
      if (!Number.isFinite(version) || version < 1) {
        alert('引繼碼版本不相容');
        return false;
      }
      const parts = rest.split('.');
      const encB64 = parts[0];
      const sigB64 = parts.length > 1 ? parts[1] : '';
      if (!encB64 || !sigB64) {
        alert('引繼碼內容缺失');
        return false;
      }
      const encBytes = bytesFromB64url(encB64);
      const key = await getKeyStream();
      const plainBytes = xorBytes(encBytes, key);
      const payloadStr = fromUint8(plainBytes);
      // 驗簽
      const expectedSig = await signPayloadStr(payloadStr);
      const gotSig = bytesFromB64url(sigB64);
      if (gotSig.length !== expectedSig.length) {
        alert('引繼碼驗證失敗');
        return false;
      }
      for (let i=0;i<expectedSig.length;i++){
        if (gotSig[i] !== expectedSig[i]){
          alert('引繼碼驗證失敗');
          return false;
        }
      }
      // 解析
      let payload;
      try { payload = JSON.parse(payloadStr); } catch(_) {
        alert('引繼碼內容損毀');
        return false;
      }
      // 版本相容（最小保護）：允許較新版本但只套用已知欄位
      const coins = Math.max(0, Math.floor(parseInt(payload.c, 10) || 0));
      const levels = (payload.tl && typeof payload.tl === 'object') ? payload.tl : {};
      const legacy = Array.isArray(payload.ut) ? payload.ut : [];
      const achievements = Array.isArray(payload.ac) ? payload.ac : [];
      const unlockedChars = Array.isArray(payload.uc) ? payload.uc : null;
      // 寫入 localStorage（不更動鍵名）
      try { localStorage.setItem('game_coins', String(coins)); } catch(_) {}
      try { localStorage.setItem('talent_levels', JSON.stringify(levels)); } catch(_) {}
      try { localStorage.setItem('unlocked_talents', JSON.stringify(legacy)); } catch(_) {}
      // 寫入角色解鎖狀態（若有）
      try {
        if (unlockedChars && unlockedChars.length) {
          // 確保預設角色永遠存在
          if (!unlockedChars.includes('margaret')) unlockedChars.push('margaret');
          localStorage.setItem('unlocked_characters', JSON.stringify(unlockedChars));
        }
      } catch(_) {}
      // 寫入成就（若有）
      try {
        if (achievements && achievements.length) {
          const map = {};
          achievements.forEach(id => { map[id] = { unlocked: true, ts: Date.now() }; });
          localStorage.setItem('achievements', JSON.stringify(map));
        }
      } catch(_) {}
      // 更新記憶體與UI（不改事件順序，僅在可用時刷新顯示）
      try { if (typeof Game !== 'undefined' && Game.loadCoins) Game.loadCoins(); } catch(_) {}
      try { if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) UI.updateCoinsDisplay(coins); } catch(_) {}
      try {
        if (typeof TalentSystem !== 'undefined' && TalentSystem.tieredTalents) {
          Object.keys(TalentSystem.tieredTalents).forEach(id => {
            TalentSystem.updateTalentCardAppearance(id);
          });
        }
      } catch(_) {}
      alert('引繼碼套用成功！');
      return true;
    } catch(e){
      console.error('套用引繼碼錯誤', e);
      alert('引繼碼處理失敗');
      return false;
    }
  }

  return { collect, generate, apply };
})();

// 維護附註（掃描點）：
// - main.js：綁定 backup-screen 的按鈕事件（開啟/返回/生成/套用）
// - index.html：新增 #backup-screen、#backup-button，不改既有文字與結構；沿用既有類別（screen/select-card 等）
// - 若未來新增存檔鍵，請：
//   1) 在 collect() 中加入欄位；
//   2) 在 apply() 中以「保守相容」方式寫入（保留舊鍵）。
//   3) 升級 SCHEMA_VERSION，並在教學區文字補充相容性說明（此為新增文字，不更動既有文字）。
