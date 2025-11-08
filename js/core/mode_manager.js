// 模式管理器（ModeManager）
// 職責：註冊/切換遊戲模式、在進入模式前載入其宣告的資源，提供往後拓展的 update/draw 轉發點。
// 維護備註：
// - 僅作為薄殼，避免干擾現有 Game 生命週期；目前不接管主循環。
// - 所有模式需實作介面：id、getManifest(params?)、enter(params, ctx)、exit(ctx?)、update(dt, ctx?)（可選）、draw(ctx2d, ctx?)（可選）。
// - 資源載入僅依模式宣告的 manifest 進行（避免全域吃資源）；不更動 createDefaultImages 既有行為。
// - SaveCode 相容：此檔不更動 SaveCode 模組；如需升級流程，交由 SaveService 處理（仍保持向下相容）。
(function(){
  const modes = new Map();
  let activeId = null;
  let activeMode = null;

  // 共用上下文（未來可注入更多服務，維持穩定介面）
  const ctx = {
    services: {
      save: (typeof window !== 'undefined' ? window.SaveService : null),
      resource: (typeof window !== 'undefined' ? window.ResourceLoader : null)
    }
  };

  function register(id, mode){
    if (!id || typeof id !== 'string') {
      console.warn('[ModeManager] 無效的模式 id');
      return;
    }
    if (modes.has(id)) {
      console.warn('[ModeManager] 重複註冊模式：', id);
      return;
    }
    modes.set(id, mode);
  }

  function start(id, params = {}){
    if (!modes.has(id)) {
      console.warn('[ModeManager] 找不到模式：', id);
      return false;
    }
    // 退出現有模式
    try { if (activeMode && typeof activeMode.exit === 'function') activeMode.exit(ctx); } catch(e){ console.warn('[ModeManager] 退出模式錯誤', e); }

    activeId = id;
    activeMode = modes.get(id);

    // 1) 模式資源載入（僅載入該模式宣告的資源）
    try {
      if (activeMode && typeof activeMode.getManifest === 'function' && ctx.services.resource) {
        const manifest = activeMode.getManifest(params) || {};
        ctx.services.resource.loadForMode(id, manifest);
      }
    } catch(e){ console.warn('[ModeManager] 資源載入失敗', e); }

    // 2) 存檔相容升級（不更動 SaveCode 模組與鍵名）
    try { if (ctx.services.save && typeof ctx.services.save.upgradeSchemaIfNeeded === 'function') ctx.services.save.upgradeSchemaIfNeeded(); } catch(_){ }

    // 3) 進入模式
    try { if (typeof activeMode.enter === 'function') activeMode.enter(params, ctx); } catch(e){ console.error('[ModeManager] 進入模式失敗', e); }
    return true;
  }

  function update(dt){
    try { if (activeMode && typeof activeMode.update === 'function') activeMode.update(dt, ctx); } catch(e){ console.warn('[ModeManager] update 轉發錯誤', e); }
  }

  function draw(canvasCtx){
    try { if (activeMode && typeof activeMode.draw === 'function') activeMode.draw(canvasCtx, ctx); } catch(e){ console.warn('[ModeManager] draw 轉發錯誤', e); }
  }

  function getActiveModeId(){ return activeId; }
  function getActiveMode(){ return activeMode; }

  // 對外公開
  window.ModeManager = { register, start, update, draw, getActiveModeId, getActiveMode };
})();