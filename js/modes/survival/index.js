// 生存模式適配層（Minimal）
// 職責：將現有生存模式的啟動流程封裝為 Mode 介面，避免改動既有機制。
// 維護備註：
// - 不改 SaveCode 與 localStorage 鍵名；僅在進入模式前後做必要顯示與音樂。
// - 目前不接管 update/draw，由現有 Game 主循環負責；日後如需接管，請以 ModeManager.update/draw 轉發。
(function(){
  const SurvivalMode = {
    id: 'survival',
    getManifest(){
      return {
        images: [],
        audio: [
          { name: 'menu_music', src: 'assets/audio/menu_music.mp3' },
          { name: 'game_music', src: 'assets/audio/game_music.mp3' },
          { name: 'boss_music', src: 'assets/audio/boss_music.mp3' },
          { name: 'shura_music', src: 'assets/audio/Shura.mp3' }
        ],
        json: []
      };
    },
    // 新增：willEnter（同步）— 在使用者點擊事件鏈內立即觸發 BGM
    willEnter(params, ctx){
      try {
        if (params && params.selectedDifficultyId) {
          Game.selectedDifficultyId = params.selectedDifficultyId;
        }
      } catch(_){ }
      let track = 'game_music';
      try {
        const useId = Game.selectedDifficultyId || 'EASY';
        track = (useId === 'ASURA') ? 'shura_music' : 'game_music';
        // 解除靜音並播放；同時同步音訊場景到遊戲
        if (ctx && ctx.audio && typeof ctx.audio.unmuteAndPlay === 'function') {
          ctx.audio.unmuteAndPlay(track);
        } else if (typeof AudioManager !== 'undefined' && AudioManager.setMuted) {
          try { AudioManager.setMuted(false); } catch(_){}
          if (AudioManager.playMusic) AudioManager.playMusic(track);
        }
        try { if (typeof AudioScene !== 'undefined' && AudioScene.enterGame) AudioScene.enterGame(); } catch(_){}
      } catch(_){ }
    },
    enter(params, ctx){
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

      // 音樂：進入後強制同步到遊戲場景，避免被選單音樂覆蓋
      let track = 'game_music';
      try {
        const useId = Game.selectedDifficultyId || 'EASY';
        track = (useId === 'ASURA') ? 'shura_music' : 'game_music';
      } catch(_){ }
      try {
        if (typeof AudioScene !== 'undefined' && AudioScene.enterGame) {
          AudioScene.enterGame();
        } else if (ctx && ctx.audio && typeof ctx.audio.playMusic === 'function') {
          ctx.audio.playMusic(track);
        } else if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
          AudioManager.playMusic(track);
        }
      } catch(_){}

      // 事件：在回到前景或重新取得焦點時恢復並同步到遊戲場景
      try {
        if (ctx && ctx.events) {
          ctx.events.on(document, 'visibilitychange', function(){
            try {
              if (!document.hidden) {
                try { if (typeof AudioManager !== 'undefined' && AudioManager.setMuted) AudioManager.setMuted(false); } catch(_){}
                if (typeof AudioScene !== 'undefined' && AudioScene.enterGame) {
                  AudioScene.enterGame();
                } else if (ctx.audio && typeof ctx.audio.unmuteAndPlay === 'function') {
                  ctx.audio.unmuteAndPlay(track);
                }
              }
            } catch(_){}
          });
          ctx.events.on(window, 'focus', function(){
            try {
              try { if (typeof AudioManager !== 'undefined' && AudioManager.setMuted) AudioManager.setMuted(false); } catch(_){}
              if (typeof AudioScene !== 'undefined' && AudioScene.enterGame) {
                AudioScene.enterGame();
              } else if (ctx.audio && typeof ctx.audio.unmuteAndPlay === 'function') {
                ctx.audio.unmuteAndPlay(track);
              }
            } catch(_){}
          });
        }
      } catch(_){ }

      // 顯示遊戲畫面（使用 .hidden 類避免覆蓋 flex）
      try {
        if (ctx && ctx.dom && typeof ctx.dom.show === 'function') {
          ctx.dom.show('game-screen');
        } else {
          const gameScreen = document.getElementById('game-screen');
          if (gameScreen) gameScreen.classList.remove('hidden');
        }
      } catch(_){ }

      // （防汙染保險）確保挑戰模式 HUD 與覆蓋元素被隱藏/移除
      try { const cHUD = document.getElementById('challenge-ui'); if (cHUD) cHUD.style.display = 'none'; } catch(_){ }
      try { const actor = document.getElementById('challenge-player-actor'); if (actor && actor.parentNode) actor.parentNode.removeChild(actor); } catch(_){ }
    },
    exit(ctx){
      // 停止本模式音樂；其餘事件/計時器釋放由 GameModeManager 的 ctx.dispose 自動處理
      try {
        if (ctx && ctx.audio && typeof ctx.audio.stopAllMusic === 'function') {
          ctx.audio.stopAllMusic();
        } else if (typeof AudioManager !== 'undefined' && AudioManager.stopAllMusic) {
          AudioManager.stopAllMusic();
        }
      } catch(_){}
    },
    update(){ /* 交由 Game.update */ },
    draw(){ /* 交由 Game.draw */ }
  };
  // 優先註冊到隔離化 GameModeManager；若不可用則回退到舊 ModeManager
  if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.register === 'function') {
    window.GameModeManager.register(SurvivalMode.id, SurvivalMode);
  } else if (typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.register === 'function') {
    window.ModeManager.register(SurvivalMode.id, SurvivalMode);
  } else {
    console.warn('[SurvivalMode] 找不到可用的模式管理器，無法註冊生存模式');
  }
})();
