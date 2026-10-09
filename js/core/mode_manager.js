// 舊 ModeManager：只轉發 GameModeManager。不要在這裡實作進場／載資源。
// 新模式請 GameModeManager.register/start。此檔留下是為了舊呼叫點不會再開第二套引擎。
(function () {
  function gmm() {
    return (typeof window !== 'undefined') ? window.GameModeManager : null;
  }

  function register(id, mode) {
    var mgr = gmm();
    if (mgr && typeof mgr.register === 'function') {
      mgr.register(id, mode);
      return;
    }
    console.warn('[ModeManager] 已停用獨立註冊，請用 GameModeManager');
  }

  function start(id, params) {
    var mgr = gmm();
    if (mgr && typeof mgr.start === 'function') {
      return mgr.start(id, params);
    }
    console.warn('[ModeManager] 已停用獨立啟動，請用 GameModeManager');
    return false;
  }

  function update() {}
  function draw() {}

  function getActiveModeId() {
    var mgr = gmm();
    if (mgr && typeof mgr.getCurrent === 'function') return mgr.getCurrent();
    return null;
  }

  function getActiveMode() { return null; }

  window.ModeManager = { register: register, start: start, update: update, draw: draw, getActiveModeId: getActiveModeId, getActiveMode: getActiveMode };
})();
