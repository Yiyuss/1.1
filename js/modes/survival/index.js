// 生存模式適配層（Minimal）
// 職責：將現有生存模式的啟動流程封裝為 Mode 介面，避免改動既有機制。
// 維護備註：
// - 不改 SaveCode 與 localStorage 鍵名；僅在進入模式前後做必要顯示與音樂。
// - 目前不接管 update/draw，由現有 Game 主循環負責；日後如需接管，請以 ModeManager.update/draw 轉發。
(function(){
  const SurvivalMode = {
    id: 'survival',
    // 模式資源宣告：目前留空，避免重複載入既有資源。
    getManifest(){
      return { images: [], audio: [], json: [] };
    },
    enter(params){
      try {
        if (params && params.selectedDifficultyId) {
          Game.selectedDifficultyId = params.selectedDifficultyId;
        }
        if (params && params.selectedCharacter) {
          Game.selectedCharacter = params.selectedCharacter;
        }
        if (params && params.selectedMap) {
          Game.selectedMap = params.selectedMap;
        }
      } catch(_){}

      // 啟動現有遊戲流程
      try { Game.startNewGame(); } catch(e){ console.error('[SurvivalMode] startNewGame 錯誤', e); }

      // 音樂：維持原邏輯（難度為 ASURA 播 shura_music）
      try {
        if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
          const useId = Game.selectedDifficultyId || 'EASY';
          const track = (useId === 'ASURA') ? 'shura_music' : 'game_music';
          AudioManager.playMusic(track);
        }
      } catch(_){ }

      // 顯示遊戲畫面
      try {
        const gameScreen = document.getElementById('game-screen');
        if (gameScreen) gameScreen.classList.remove('hidden');
      } catch(_){ }
    },
    exit(){
      // 可選：清理資源或停止音樂（目前沿用全域 AudioManager 控制）
    },
    update(){ /* 交由 Game.update */ },
    draw(){ /* 交由 Game.draw */ }
  };

  if (typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.register === 'function') {
    window.ModeManager.register(SurvivalMode.id, SurvivalMode);
  }
})();