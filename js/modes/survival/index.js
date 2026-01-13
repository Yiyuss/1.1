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
          { name: 'game_music2', src: 'assets/audio/game_music2.mp3' }, // 第4張地圖（花園）專用 BGM
          { name: 'intersection_music', src: 'assets/audio/intersection.mp3' }, // 第5張地圖（路口）專用 BGM
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
        // 第4張地圖（花園）使用 game_music2（優先於修羅模式）
        if (Game.selectedMap && Game.selectedMap.id === 'garden') {
          track = 'game_music2';
        } else if (Game.selectedMap && Game.selectedMap.id === 'intersection') {
          track = 'intersection_music';
        } else {
          const useId = Game.selectedDifficultyId || 'EASY';
          track = (useId === 'ASURA') ? 'shura_music' : 'game_music';
        }
        // 解除靜音並播放；同時同步音訊場景到遊戲
        if (ctx && ctx.audio && typeof ctx.audio.unmuteAndPlay === 'function') {
          ctx.audio.unmuteAndPlay(track);
        } else if (typeof AudioManager !== 'undefined' && AudioManager.setMuted) {
          try { AudioManager.setMuted(false); } catch(_){}
          if (AudioManager.playMusic) AudioManager.playMusic(track);
        }
        // 進入生存模式時，同步當前場景音樂（若已有BOSS則使用BOSS音樂）
        try { if (typeof AudioScene !== 'undefined' && AudioScene.sync) AudioScene.sync(); } catch(_){}
      } catch(_){ }
    },
    enter(params, ctx){
      // 先清理可能殘留的全域玩家 GIF 覆蓋層，避免其他模式的圖像污染
      try { if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.clearAll === 'function') window.GifOverlay.clearAll(); } catch(_){}
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
        // M1：儲存組隊模式資訊（包含 sessionId）
        if (params && params.multiplayer) {
          Game.multiplayer = params.multiplayer;
        } else {
          Game.multiplayer = null;
        }
      } catch(_){}

      // 啟動現有遊戲流程
      try { Game.startNewGame(); } catch(e){ console.error('[SurvivalMode] startNewGame 錯誤', e); }

      // 音樂：進入後強制同步到遊戲場景，避免被選單音樂覆蓋
      let track = 'game_music';
      try {
        // 第4張地圖（花園）使用 game_music2
        if (Game.selectedMap && Game.selectedMap.id === 'garden') {
          track = 'game_music2';
          console.log('[SurvivalMode] 花園地圖，使用 game_music2');
        } else if (Game.selectedMap && Game.selectedMap.id === 'intersection') {
          track = 'intersection_music';
          console.log('[SurvivalMode] 路口地圖，使用 intersection_music');
        } else {
          const useId = Game.selectedDifficultyId || 'EASY';
          track = (useId === 'ASURA') ? 'shura_music' : 'game_music';
        }
      } catch(_){ }
      try {
        // 直接播放音樂，不通過 AudioScene.enterGame()，因為它會重新判斷
        if (ctx && ctx.audio && typeof ctx.audio.playMusic === 'function') {
          ctx.audio.playMusic(track);
        } else if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
          AudioManager.playMusic(track);
        } else if (typeof AudioScene !== 'undefined' && AudioScene.sync) {
          // 若外部尚未初始化 AudioManager，退回場景同步邏輯
          AudioScene.sync();
        }
      } catch(_){}

      // 事件：在回到前景或重新取得焦點時恢復並同步到遊戲場景
      try {
        if (ctx && ctx.events) {
          ctx.events.on(document, 'visibilitychange', function(){
            try {
              if (!document.hidden) {
                // 檢查是否在勝利/失敗畫面（不應恢復遊戲音樂）
                const victoryVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('victory-screen') : !document.getElementById('victory-screen').classList.contains('hidden'));
                const gameOverVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('game-over-screen') : !document.getElementById('game-over-screen').classList.contains('hidden'));
                if (victoryVisible || gameOverVisible) {
                  // 勝利/失敗畫面：不恢復遊戲音樂，避免修羅音樂污染
                  return;
                }
                try { if (typeof AudioManager !== 'undefined' && AudioManager.setMuted) AudioManager.setMuted(false); } catch(_){}
                if (typeof AudioScene !== 'undefined' && AudioScene.sync) {
                  // 使用場景同步：有BOSS時維持BOSS音樂，否則回到對應地圖/難度的BGM
                  AudioScene.sync();
                } else if (ctx.audio && typeof ctx.audio.unmuteAndPlay === 'function') {
                  ctx.audio.unmuteAndPlay(track);
                }
              }
            } catch(_){}
          });
          ctx.events.on(window, 'focus', function(){
            try {
              // 檢查是否在勝利/失敗畫面（不應恢復遊戲音樂）
              const victoryVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('victory-screen') : !document.getElementById('victory-screen').classList.contains('hidden'));
              const gameOverVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('game-over-screen') : !document.getElementById('game-over-screen').classList.contains('hidden'));
              if (victoryVisible || gameOverVisible) {
                // 勝利/失敗畫面：不恢復遊戲音樂，避免修羅音樂污染
                return;
              }
              try { if (typeof AudioManager !== 'undefined' && AudioManager.setMuted) AudioManager.setMuted(false); } catch(_){}
              if (typeof AudioScene !== 'undefined' && AudioScene.sync) {
                // 使用場景同步：有BOSS時維持BOSS音樂，否則回到對應地圖/難度的BGM
                AudioScene.sync();
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
      // 離開生存模式時同樣清除全域 GIF 覆蓋層，避免殘留到其他模式
      try { if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.clearAll === 'function') window.GifOverlay.clearAll(); } catch(_){}
      // 確保清理其他模式的殘留（防禦、挑戰模式）
      try { if (typeof window.TDGifOverlay !== 'undefined' && typeof window.TDGifOverlay.clearAll === 'function') window.TDGifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.ChallengeGifOverlay !== 'undefined' && typeof window.ChallengeGifOverlay.clearAll === 'function') window.ChallengeGifOverlay.clearAll(); } catch(_){}
      // 清理挑戰模式HUD和DOM元素（確保沒有殘留）
      try { const cHUD = document.getElementById('challenge-ui'); if (cHUD) cHUD.style.display = 'none'; } catch(_){}
      try { const actor = document.getElementById('challenge-player-actor'); if (actor && actor.parentNode) actor.parentNode.removeChild(actor); } catch(_){}
      try {
        const ceo = document.getElementById('challenge-end-overlay');
        if (ceo && ceo.parentNode) ceo.parentNode.removeChild(ceo);
      } catch(_){}
      // 清理防禦模式HUD
      try { const dHUD = document.getElementById('defense-ui'); if (dHUD) dHUD.style.display = 'none'; } catch(_){}
      
      // 組隊模式：離開生存模式時清理組隊狀態（防止跨模式污染）
      try {
        if (typeof Game !== "undefined" && Game.multiplayer) {
          // ✅ MMORPG 架構：使用 RemotePlayerManager 清理遠程玩家
          if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
            const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
            if (typeof rm.clear === "function") {
              rm.clear();
            }
          }
          // 向後兼容：也清理 Game.remotePlayers（如果存在）
          if (Array.isArray(Game.remotePlayers)) {
            Game.remotePlayers = [];
          }
          // 清理組隊系統
          if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.clearRemotePlayers === "function") {
            window.SurvivalOnlineRuntime.clearRemotePlayers();
          }
          // 重置組隊狀態（但不離開房間，因為可能只是切換模式）
          // Game.multiplayer = null; // 不重置，因為可能只是暫時離開
        }
      } catch (_) {}
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
