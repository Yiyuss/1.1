// 冒險模式（Adventure）整合層
// 目的：
// - 以「模式」的方式掛到主體遊戲的 GameModeManager
// - 不改動現有的 Terraria 風格獨立遊戲（js/modes/adventure/index.html + game.js）
// - 透過 iframe 全畫面覆蓋載入該獨立遊戲，確保 DOM/CSS/事件互不污染
// - 不使用主體遊戲的 SaveService / SaveCode；僅保留各自獨立的 localStorage
(function(){
  const MODE_ID = 'adventure';

  const AdventureMode = {
    id: MODE_ID,
    _keydownHandler: null,
    _bgmAudio: null,

    // 本模式不依賴主體的 ResourceLoader；資源由子頁面自己管理
    getManifest(){
      return { images: [], audio: [], json: [] };
    },

    enter(params, ctx){
      // 停止主體遊戲邏輯與音樂，避免與子遊戲同時播放
      try { if (typeof Game !== 'undefined' && Game.pause) Game.pause(true); } catch(_){}
      try { if (typeof AudioManager !== 'undefined' && AudioManager.stopAllMusic) AudioManager.stopAllMusic(); } catch(_){}

      const host = document.getElementById('game-container') || document.body;
      if (!host) return;

      // 若先前已建立容器，直接顯示並重新載入 iframe 內容
      let wrapper = document.getElementById('adventure-mode-wrapper');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'adventure-mode-wrapper';
        wrapper.style.position = 'absolute';
        wrapper.style.inset = '0';
        wrapper.style.zIndex = '9999';
        wrapper.style.background = '#000';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';

        // 上方：返回按鈕列
        const bar = document.createElement('div');
        bar.style.flex = '0 0 auto';
        bar.style.display = 'flex';
        bar.style.justifyContent = 'space-between';
        bar.style.alignItems = 'center';
        bar.style.padding = '8px 12px';
        bar.style.background = 'rgba(0,0,0,0.85)';
        bar.style.color = '#fff';
        bar.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        bar.style.fontSize = '14px';

        const title = document.createElement('div');
        title.textContent = '冒險模式：異世界（請使用 F2 手動存檔）';
        title.style.flex = '1 1 auto';
        bar.appendChild(title);

        // 右側：BGM 音量控制 + 返回主選單按鈕
        const rightBox = document.createElement('div');
        rightBox.style.flex = '0 0 auto';
        rightBox.style.display = 'flex';
        rightBox.style.alignItems = 'center';
        rightBox.style.gap = '8px';

        const volLabel = document.createElement('span');
        volLabel.textContent = 'BGM';
        volLabel.style.fontSize = '12px';
        volLabel.style.opacity = '0.85';

        const volSlider = document.createElement('input');
        volSlider.type = 'range';
        volSlider.min = '0';
        volSlider.max = '100';
        volSlider.value = '50';
        volSlider.id = 'adventure-volume-slider';
        volSlider.style.width = '110px';
        volSlider.style.cursor = 'pointer';

        const backBtn = document.createElement('button');
        backBtn.textContent = '返回主選單';
        backBtn.style.padding = '6px 12px';
        backBtn.style.borderRadius = '4px';
        backBtn.style.border = '1px solid #fff';
        backBtn.style.background = 'rgba(0,0,0,0.3)';
        backBtn.style.color = '#fff';
        backBtn.style.cursor = 'pointer';
        backBtn.addEventListener('click', function(){
          try {
            if (window.GameModeManager && typeof window.GameModeManager.stop === 'function') {
              window.GameModeManager.stop();
            } else if (window.ModeManager && typeof window.ModeManager.start === 'function') {
              // 舊管理器無 stop 介面時，回退到生存模式
              window.ModeManager.start('survival', {
                selectedCharacter: (typeof Game !== 'undefined' ? Game.selectedCharacter : null),
                selectedMap: (typeof Game !== 'undefined' ? Game.selectedMap : null)
              });
            }
          } catch(_){}
        });

        rightBox.appendChild(volLabel);
        rightBox.appendChild(volSlider);
        rightBox.appendChild(backBtn);
        bar.appendChild(rightBox);

        // 下方：實際載入獨立遊戲的 iframe
        const frame = document.createElement('iframe');
        frame.id = 'adventure-mode-iframe';
        // 依主體遊戲當前選角，將角色 ID 透過查詢參數傳入冒險模式 iframe
        let charId = null;
        try {
          const ch = (params && params.selectedCharacter) || (typeof Game !== 'undefined' ? Game.selectedCharacter : null);
          if (ch && typeof ch.id === 'string') charId = ch.id;
        } catch(_){}
        const baseUrl = new URL('js/modes/adventure/index.html', window.location.href);
        if (charId) baseUrl.searchParams.set('char', charId);
        frame.src = baseUrl.toString();
        frame.style.border = 'none';
        frame.style.flex = '1 1 auto';
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.setAttribute('allowfullscreen', 'true');

        wrapper.appendChild(bar);
        wrapper.appendChild(frame);
        host.appendChild(wrapper);

        // BGM 音量控制：完全在主頁面管理，避免跨 iframe 的間接問題
        (function initAdventureBGMOnHost(){
          let initialVol = 0.5;
          try {
            const saved = localStorage.getItem('adventure_bgm_volume');
            if (saved !== null) {
              const parsed = parseFloat(saved);
              if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) initialVol = parsed;
            }
          } catch (_) {}

          // 設定 slider 初始值
          volSlider.value = String(Math.round(initialVol * 100));

          // 建立或更新主頁面的冒險 BGM
          try {
            if (!AdventureMode._bgmAudio) {
              AdventureMode._bgmAudio = new Audio('assets/audio/adventure.mp3');
              AdventureMode._bgmAudio.loop = true;
            }
            AdventureMode._bgmAudio.volume = initialVol;
            AdventureMode._bgmAudio.play().catch(() => {
              // 可能需要使用者互動才能播放，這裡忽略即可
            });
          } catch (_) {}

          // slider 調整時，直接修改主頁面的 BGM 音量並保存
          volSlider.addEventListener('input', function(e){
            const v = Math.max(0, Math.min(1, parseFloat(e.target.value) / 100));
            try {
              if (AdventureMode._bgmAudio) {
                AdventureMode._bgmAudio.volume = v;
              }
              localStorage.setItem('adventure_bgm_volume', String(v));
            } catch(_) {}
          });
        })();

        // 注意：E 鍵開啟合成介面由子遊戲自己處理（game.js 內部 keydown/keypress）
      } else {
        wrapper.style.display = 'flex';
        const frame = document.getElementById('adventure-mode-iframe');
        if (frame && frame.contentWindow) {
          try {
            // 嘗試讓子遊戲重新載入世界（視情況可在未來改成訊息通訊）
            frame.contentWindow.location.reload();
          } catch(_){}
        }
      }

      this._wrapper = wrapper;
    },

    exit(ctx){
      // 關閉冒險模式覆蓋層，回到主選單/選角流程
      try {
        if (this._wrapper) {
          this._wrapper.parentNode && this._wrapper.parentNode.removeChild(this._wrapper);
          this._wrapper = null;
        } else {
          const el = document.getElementById('adventure-mode-wrapper');
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }
      } catch(_){}

      // 停止並釋放冒險模式專用 BGM
      try {
        if (this._bgmAudio) {
          this._bgmAudio.pause();
          this._bgmAudio = null;
        }
      } catch (_) {}

      // 不再註冊全域鍵盤事件，因此這裡也不需要移除

      // 回復主選單音樂與畫面（與其他模式一致：返回開始畫面）
      try {
        const startScreen = document.getElementById('start-screen');
        const charScreen = document.getElementById('character-select-screen');
        const mapScreen = document.getElementById('map-select-screen');
        if (mapScreen) mapScreen.classList.add('hidden');
        if (charScreen) charScreen.classList.add('hidden');
        if (startScreen) startScreen.classList.remove('hidden');
      } catch(_){}
      try {
        if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
          AudioScene.enterMenu();
        } else if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
          AudioManager.playMusic('menu_music');
        }
      } catch(_){}
    }
  };

  if (typeof window !== 'undefined') {
    if (window.GameModeManager && typeof window.GameModeManager.register === 'function') {
      window.GameModeManager.register(MODE_ID, AdventureMode);
    } else if (window.ModeManager && typeof window.ModeManager.register === 'function') {
      // 回退：若新管理器不可用，暫掛到舊 ModeManager（仍使用 iframe，互不污染）
      window.ModeManager.register(MODE_ID, AdventureMode);
    } else {
      console.warn('[AdventureMode] 找不到可用的模式管理器，無法註冊冒險模式');
    }
  }
})();


