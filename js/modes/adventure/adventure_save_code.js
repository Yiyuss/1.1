// AdventureSaveCode（冒險模式專用引繼碼）
// 職責：
// - 只備份 / 還原冒險模式的自動存檔：localStorage['terraria_save']
// - 不改動主體遊戲的 SaveCode、SCHEMA_VERSION、SALT 與資料結構
// - 提供簡易防篡改簽章（非安全級加密），避免貼錯或內容損毀時誤覆蓋
//
// 格式說明：
// - 字串前綴：ADV1-<ENC>.<SIG>
//   - ADV  : 表示 Adventure（冒險模式）
//   - 1    : schema 版本（未來若有需要可升級為 2、3…，仍保持向下相容）
//   - ENC  : 以 XOR+Base64URL 編碼的 payload
//   - SIG  : 對 payloadStr+SALT 計算的雜湊前 12 bytes，Base64URL 表示
(function(global){
  'use strict';

  const ADV_SCHEMA_VERSION = 1;
  const ADV_SALT = 'ADVENTURE_SAVE_SALT_V1::terraria_world_only';

  // 讀取冒險模式原始存檔（若不存在則回傳 null）
  function readTerrariaSaveRaw(){
    try {
      const raw = localStorage.getItem('terraria_save');
      if (!raw) return null;
      // 簡單驗證：確保是 JSON 格式（若 parse 失敗則視為損毀）
      JSON.parse(raw);
      return raw;
    } catch(_){
      return null;
    }
  }

  // 寫入冒險模式存檔（完全覆蓋 terraria_save；其結構由冒險模式自行維護）
  function writeTerrariaSaveRaw(raw){
    try {
      if (typeof raw !== 'string' || !raw.trim()) {
        throw new Error('empty payload');
      }
      // 安全起見再次驗證 JSON 結構，避免寫入非 JSON 字串
      JSON.parse(raw);
    } catch(e){
      throw new Error('冒險模式存檔內容不是有效的 JSON，無法套用');
    }
    try {
      localStorage.setItem('terraria_save', raw);
    } catch(e){
      throw new Error('寫入瀏覽器存檔失敗，可能儲存空間不足');
    }
  }

  // --- Base64URL 工具（與主體 SaveCode 類似，但獨立實作） ---
  function toUint8(str){ return new TextEncoder().encode(str); }
  function fromUint8(buf){ return new TextDecoder().decode(buf); }

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

  // --- 簡易雜湊：優先使用 SHA-256，其次 FNV32 展開為 32 bytes ---
  async function hash256Bytes(dataBytes){
    try {
      if (global.crypto && global.crypto.subtle && global.crypto.subtle.digest) {
        const digest = await global.crypto.subtle.digest('SHA-256', dataBytes);
        return new Uint8Array(digest);
      }
    } catch(_){}
    // Fallback: FNV-1a 32-bit，重複填充至32位元組
    let h = 0x811c9dc5 >>> 0;
    for (let i=0;i<dataBytes.length;i++){
      h ^= dataBytes[i];
      h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0;
    }
    const out = new Uint8Array(32);
    for (let i=0;i<32;i++){
      out[i] = (h >>> ((i%4)*8)) & 0xff;
    }
    return out;
  }

  async function getKeyStream(){
    const saltBytes = toUint8(ADV_SALT);
    return await hash256Bytes(saltBytes);
  }

  async function signPayloadStr(payloadStr){
    const bytes = toUint8(payloadStr + ADV_SALT);
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

  // 生成冒險模式引繼碼（只包含 terraria_save）
  async function generate(){
    const raw = readTerrariaSaveRaw();
    if (!raw) {
      throw new Error('目前尚未找到冒險模式存檔（terraria_save），請先進入冒險模式遊玩一次再試。');
    }
    const payload = {
      v: ADV_SCHEMA_VERSION,
      ts: Date.now(),
      data: raw
    };
    const payloadStr = JSON.stringify(payload);
    const payloadBytes = toUint8(payloadStr);
    const key = await getKeyStream();
    const cipher = xorBytes(payloadBytes, key);
    const sig = await signPayloadStr(payloadStr);
    const code = `ADV${ADV_SCHEMA_VERSION}-` + b64urlFromBytes(cipher) + '.' + b64urlFromBytes(sig);
    return code;
  }

  // 套用冒險模式引繼碼：只覆蓋 terraria_save，不動主體遊戲任何鍵
  async function apply(code){
    try {
      if (typeof code !== 'string' || !code.includes('-') || !code.includes('.')) {
        alert('冒險模式引繼碼格式錯誤');
        return false;
      }
      const dashIndex = code.indexOf('-');
      const prefix = dashIndex >= 0 ? code.slice(0, dashIndex) : '';
      const rest = dashIndex >= 0 ? code.slice(dashIndex + 1) : '';
      if (!prefix || !prefix.startsWith('ADV')) {
        alert('這不是冒險模式專用的引繼碼');
        return false;
      }
      const version = parseInt(prefix.slice(3), 10);
      if (!Number.isFinite(version) || version < 1) {
        alert('冒險模式引繼碼版本不相容');
        return false;
      }
      const parts = rest.split('.');
      const encB64 = parts[0];
      const sigB64 = parts.length > 1 ? parts[1] : '';
      if (!encB64 || !sigB64) {
        alert('冒險模式引繼碼內容缺失');
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
        alert('冒險模式引繼碼驗證失敗');
        return false;
      }
      for (let i=0;i<expectedSig.length;i++){
        if (gotSig[i] !== expectedSig[i]) {
          alert('冒險模式引繼碼驗證失敗');
          return false;
        }
      }

      // 解析 payload，僅取 data 欄位
      let payload;
      try {
        payload = JSON.parse(payloadStr);
      } catch(_){
        alert('冒險模式引繼碼內容損毀');
        return false;
      }
      const raw = (payload && typeof payload.data === 'string') ? payload.data : null;
      if (!raw) {
        alert('冒險模式引繼碼內容缺少存檔資料');
        return false;
      }

      // 寫入 terraria_save（這一步會再次驗證 JSON 結構）
      writeTerrariaSaveRaw(raw);

      alert('冒險模式引繼碼套用成功！\n提示：請重新進入「冒險模式 → 異世界」，以載入新的世界存檔。');
      return true;
    } catch(e){
      console.error('套用冒險模式引繼碼錯誤', e);
      alert('冒險模式引繼碼處理失敗');
      return false;
    }
  }

  global.AdventureSaveCode = { generate, apply };
})(typeof window !== 'undefined' ? window : globalThis);


