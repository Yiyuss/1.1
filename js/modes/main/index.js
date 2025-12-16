// 主線模式（Main Story Mode）- 冒險村莊
// 玩法骨架：
// - 不分難度，從地圖進入後可探索並與 NPC 互動。
// - 點擊地面移動，走到門口進入建築物。
// - 地圖資源：使用程序生成的地圖系統，不再依賴 map.json。
(function(){
  const MODE_ID = 'main';

  const MainMode = {
    id: MODE_ID,
    // 宣告模式資源（冒險村莊地圖所需圖片）
    getManifest(){
      return {
        images: [
          { key: 'main_bg', src: 'js/modes/main/03.png' },
          { key: 'main_tree', src: 'js/modes/main/02.png' },
          { key: 'main_home', src: 'js/modes/main/HOME.png' },
          { key: 'main_house1', src: 'js/modes/main/04.png' },
          { key: 'main_house2', src: 'js/modes/main/05.png' },
          { key: 'main_house3', src: 'js/modes/main/06.png' },
          { key: 'main_house4', src: 'js/modes/main/07.png' },
          { key: 'npc_gif', src: 'assets/images/NPC.gif' },
          { key: 'npc_sprite', src: 'assets/images/001.png' },
          // 主屋室內家具（JSON 中使用的所有家具）
          { key: 'f_bed_front', src: 'js/modes/main/bed-front-273x289.png' },
          { key: 'f_big_bookcase', src: 'js/modes/main/big bookcase-245x289.png' },
          { key: 'f_big_lamp', src: 'js/modes/main/Big lamp-244x362.png' },
          { key: 'f_bookcase', src: 'js/modes/main/bookcase-303x354.png' },
          { key: 'f_chair_front', src: 'js/modes/main/Chair-front-123x226.png' },
          { key: 'f_chair_side', src: 'js/modes/main/Chair-side-299x465.png' },
          { key: 'f_counter', src: 'js/modes/main/counter-833x351.png' },
          { key: 'f_lamp_small', src: 'js/modes/main/lamp-106x176.png' },
          { key: 'f_loveseat_front', src: 'js/modes/main/loveseat-front-263x196.png' },
          { key: 'f_potted_plant', src: 'js/modes/main/potted plant-119x166.png' },
          { key: 'f_small_chair', src: 'js/modes/main/small chair-182x160.png' },
          { key: 'f_round_table1', src: 'js/modes/main/small round table-122x142.png' },
          { key: 'f_round_table2', src: 'js/modes/main/small round table-149x152.png' },
          { key: 'f_round_table3', src: 'js/modes/main/small round table-154x155.png' },
          { key: 'f_sofa_front', src: 'js/modes/main/sofa-front-154x185.png' },
          { key: 'f_sofa_side', src: 'js/modes/main/sofa-side-145x176.png' },
          { key: 'f_storage_cabinet2', src: 'js/modes/main/storage cabinet-225x264.png' },
          { key: 'f_tv_table', src: 'js/modes/main/TV table-336x276.png' },
          { key: 'f_wardrobe1', src: 'js/modes/main/Wardrobe-206x347.png' },
          // 新增的家具
          { key: 'f_big_sofa', src: 'js/modes/main/Bigsofa-286x301.png' },
          { key: 'f_toilet', src: 'js/modes/main/toilet-60x60.png' }
        ],
        audio: [
          { name: 'main', src: 'assets/audio/main.mp3' }
        ],
        json: []
      };
    },
    enter(params, ctx){
      try {
        // 隱藏所有覆蓋視窗與前置畫面
        const diffScreen = document.getElementById('difficulty-select-screen');
        const desertDiffScreen = document.getElementById('desert-difficulty-select-screen');
        const mapScreen = document.getElementById('map-select-screen');
        const charScreen = document.getElementById('character-select-screen');
        if (diffScreen) diffScreen.classList.add('hidden');
        if (desertDiffScreen) desertDiffScreen.classList.add('hidden');
        if (mapScreen) mapScreen.classList.add('hidden');
        if (charScreen) charScreen.classList.add('hidden');

        // 顯示遊戲畫面並隱藏生存模式的 HUD（主線僅保留畫布與簡易對話）
        const gameScreen = document.getElementById('game-screen');
        const gameUI = document.getElementById('game-ui');
        if (gameScreen) gameScreen.classList.remove('hidden');
        if (gameUI) gameUI.style.display = 'none';
      } catch(_){}

      // 進入主線模式時，確保生存迴圈不更新
      try { if (typeof Game !== 'undefined' && Game.pause) Game.pause(true); } catch(_){}
      
      // 播放主線模式 BGM
      // 註記：mainBgmSuspendedByYouTube 用來標記是否因為「進入頻道」而暫停 BGM
      // 只要這個旗標為 true，就不要因為切換分頁 / 視窗聚焦而自動恢復 BGM
      let mainBgmSuspendedByYouTube = false;
      try {
        if (ctx && ctx.audio && typeof ctx.audio.unmuteAndPlay === 'function') {
          ctx.audio.unmuteAndPlay('main', { loop: true });
        }
      } catch(_){}

      // 標籤頁切換時恢復 BGM
      try {
        if (ctx && ctx.events) {
          ctx.events.on(document, 'visibilitychange', function(){
            try {
              // 只有在「沒有被 YouTube 視窗暫停」的情況下，才自動恢復 BGM
              if (!document.hidden && !mainBgmSuspendedByYouTube && ctx && ctx.audio && typeof ctx.audio.unmuteAndPlay === 'function') {
                ctx.audio.unmuteAndPlay('main', { loop: true });
              }
            } catch(_){}
          });
          ctx.events.on(window, 'focus', function(){
            try {
              // 同樣尊重 mainBgmSuspendedByYouTube 旗標
              if (!mainBgmSuspendedByYouTube && ctx && ctx.audio && typeof ctx.audio.unmuteAndPlay === 'function') {
                ctx.audio.unmuteAndPlay('main', { loop: true });
              }
            } catch(_){}
          });
        }
      } catch(_){}

      // 清除其他模式的 GIF 圖層殘留，避免污染
      try { if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.clearAll === 'function') window.GifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.TDGifOverlay !== 'undefined' && typeof window.TDGifOverlay.clearAll === 'function') window.TDGifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.ChallengeGifOverlay !== 'undefined' && typeof window.ChallengeGifOverlay.clearAll === 'function') window.ChallengeGifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.MainGifOverlay !== 'undefined' && typeof window.MainGifOverlay.clearAll === 'function') window.MainGifOverlay.clearAll(); } catch(_){}

      // 創建右上角 UI 介紹框（固定在 viewport 內，720P 畫布中）
      let mainUIEl = null;
      function createMainUI() {
        try {
          const viewport = document.getElementById('viewport');
          if (!viewport) return;
          mainUIEl = document.createElement('div');
          mainUIEl.id = 'main-mode-ui';
          mainUIEl.style.position = 'absolute';
          mainUIEl.style.top = '20px';
          mainUIEl.style.right = '20px';
          mainUIEl.style.color = '#fff';
          mainUIEl.style.background = 'rgba(0, 0, 0, 0.75)';
          mainUIEl.style.padding = '20px';
          mainUIEl.style.borderRadius = '12px';
          mainUIEl.style.pointerEvents = 'none';
          mainUIEl.style.fontFamily = '"Microsoft JhengHei", sans-serif';
          mainUIEl.style.border = '2px solid #aaa';
          mainUIEl.style.fontSize = '18px';
          mainUIEl.style.zIndex = '10000'; // 確保在最前面，高於所有遊戲物件（遊戲物件最大 z-index 約 100 + 列表長度）
          mainUIEl.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
          mainUIEl.style.width = '250px';
          mainUIEl.innerHTML = `
            <div style="font-size: 22px; margin-bottom: 10px; border-bottom:1px solid #777; padding-bottom:5px;">冒險村莊</div>
            <div>移動: <span style="color: #ffd700; font-weight: bold;">WASD</span> 或 <span style="color: #ffd700; font-weight: bold;">滑鼠左鍵</span></div>
            <div style="font-size: 14px; color: #ccc; margin-top: 5px;">點擊地面移動 / 走到門口進入</div>
            <div style="margin-top: 10px;">位置: <span id="main-location" style="color:#4f4">中央廣場</span></div>
          `;
          viewport.appendChild(mainUIEl);
        } catch(_) {}
      }
      createMainUI();

      // 更新位置顯示
      function updateLocationText(text) {
        try {
          const locationEl = document.getElementById('main-location');
          if (locationEl) locationEl.innerText = text || '中央廣場';
        } catch(_) {}
      }

      // 創建 ESC 菜單
      let mainMenuEl = null;
      let isMenuOpen = false;
      function createMainMenu() {
        try {
          const viewport = document.getElementById('viewport');
          if (!viewport) return;
          
          mainMenuEl = document.createElement('div');
          mainMenuEl.id = 'main-mode-menu';
          mainMenuEl.className = 'main-mode-menu hidden';
          mainMenuEl.innerHTML = `
            <div class="main-menu-overlay"></div>
            <div class="main-menu-card">
              <h2 class="main-menu-title">遊戲選單</h2>
              <div class="main-menu-content">
                <div class="main-menu-section">
                  <label class="main-menu-label">音樂音量</label>
                  <div class="main-menu-slider-container">
                    <input type="range" id="main-music-volume" class="main-menu-slider" min="0" max="100" value="50">
                    <span id="main-music-volume-text" class="main-menu-volume-text">50%</span>
                  </div>
                </div>
                <div class="main-menu-section">
                  <label class="main-menu-label">音效音量</label>
                  <div class="main-menu-slider-container">
                    <input type="range" id="main-sound-volume" class="main-menu-slider" min="0" max="100" value="70">
                    <span id="main-sound-volume-text" class="main-menu-volume-text">70%</span>
                  </div>
                </div>
                <div class="main-menu-buttons">
                  <button id="main-menu-return" class="main-menu-btn primary">返回主選單</button>
                  <button id="main-menu-resume" class="main-menu-btn">繼續遊戲</button>
                </div>
              </div>
            </div>
          `;
          viewport.appendChild(mainMenuEl);

          // 初始化音量滑塊
          const musicSlider = document.getElementById('main-music-volume');
          const musicText = document.getElementById('main-music-volume-text');
          const soundSlider = document.getElementById('main-sound-volume');
          const soundText = document.getElementById('main-sound-volume-text');

          if (musicSlider && musicText) {
            try {
              const initMusicVol = (typeof AudioManager !== 'undefined' && AudioManager.musicVolume !== undefined) 
                ? Math.round(AudioManager.musicVolume * 100) 
                : 50;
              musicSlider.value = initMusicVol;
              musicText.textContent = initMusicVol + '%';
            } catch(_) {}
            
            musicSlider.addEventListener('input', function() {
              const v = parseFloat(musicSlider.value) || 0;
              musicText.textContent = Math.round(v) + '%';
              try {
                // 同時更新 AudioManager 和 ctx.audio 的音量
                if (typeof AudioManager !== 'undefined' && AudioManager.setMusicVolume) {
                  AudioManager.setMusicVolume(v / 100);
                }
                // 同步更新本地音軌的音量（如果使用降級播放）
                if (ctx && ctx.audio && typeof ctx.audio.setMusicVolume === 'function') {
                  ctx.audio.setMusicVolume(v / 100);
                }
              } catch(_) {}
            });
          }

          if (soundSlider && soundText) {
            try {
              const initSoundVol = (typeof AudioManager !== 'undefined' && AudioManager.soundVolume !== undefined) 
                ? Math.round(AudioManager.soundVolume * 100) 
                : 70;
              soundSlider.value = initSoundVol;
              soundText.textContent = initSoundVol + '%';
            } catch(_) {}
            
            soundSlider.addEventListener('input', function() {
              const v = parseFloat(soundSlider.value) || 0;
              soundText.textContent = Math.round(v) + '%';
              try {
                if (typeof AudioManager !== 'undefined' && AudioManager.setSoundVolume) {
                  AudioManager.setSoundVolume(v / 100);
                }
              } catch(_) {}
            });
          }

          // 返回主選單按鈕
          const returnBtn = document.getElementById('main-menu-return');
          if (returnBtn) {
            returnBtn.addEventListener('click', function() {
              try {
                // 播放按鈕點擊音效
                if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                  AudioManager.playSound('button_click2');
                }
                // 先關閉菜單（跳過 ESC 音效，因為已經播放了按鈕音效）
                toggleMainMenu(true);
                // 使用 setTimeout 確保菜單關閉動畫完成後再清理
                setTimeout(() => {
                  try {
                    // 使用 GameModeManager 正確清理資源（會自動調用 exit 和 dispose）
                    if (typeof window.GameModeManager !== 'undefined' && typeof window.GameModeManager.stop === 'function') {
                      window.GameModeManager.stop();
                    }
                    // 隱藏遊戲畫面
                    const gameScreen = document.getElementById('game-screen');
                    if (gameScreen) gameScreen.classList.add('hidden');
                    // 顯示開始畫面
                    const startScreen = document.getElementById('start-screen');
                    if (startScreen) startScreen.classList.remove('hidden');
                    // 播放選單音樂
                    try {
                      if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                        AudioScene.enterMenu();
                      } else if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                        AudioManager.playMusic('menu_music');
                      }
                    } catch(_) {}
                  } catch(e) {
                  }
                }, 100);
              } catch(e) {
                console.error('[MainMode] 返回主選單時出錯:', e);
              }
            });
          }

          // 繼續遊戲按鈕
          const resumeBtn = document.getElementById('main-menu-resume');
          if (resumeBtn) {
            resumeBtn.addEventListener('click', function() {
              try {
                // 播放按鈕點擊音效
                if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                  AudioManager.playSound('button_click2');
                }
              } catch(_) {}
              // 關閉菜單（跳過 ESC 音效，因為已經播放了按鈕音效）
              toggleMainMenu(true);
            });
          }

          // 點擊遮罩關閉菜單
          const overlay = mainMenuEl.querySelector('.main-menu-overlay');
          if (overlay) {
            overlay.addEventListener('click', function() {
              toggleMainMenu();
            });
          }
        } catch(_) {}
      }

      // 對話系統
      let dialogueEl = null;
      let dialogueState = 0;
      let youtubeWindowEl = null;
      
      // 輔助函數：播放按鈕音效
      function playButtonSound() {
        try {
          if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound('button_click2');
          }
        } catch(_) {}
      }
      
      function showDialogue(npc) {
        if (player.inDialogue) return;
        
        // 進入對話：先關閉 NPC 雪碧圖滑鼠游標，恢復正常游標
        try {
          if (typeof npcHovering !== 'undefined') {
            npcHovering = false;
          }
          const tmpCursorEl = document.getElementById('main-cursor-sprite');
          if (tmpCursorEl) {
            tmpCursorEl.style.display = 'none';
          }
          canvas.style.cursor = '';
        } catch(_) {}

        player.inDialogue = true;
        player.targetX = null;
        player.movingToNPC = false;
        player.npcTarget = null;
        dialogueState = 1;
        
        const viewport = document.getElementById('viewport');
        if (!viewport) return;
        
        // 如果已有對話框，先移除
        if (dialogueEl && dialogueEl.parentNode) {
          dialogueEl.parentNode.removeChild(dialogueEl);
        }
        
        // 創建人物立繪（在畫布左側，對話框後面）
        let portraitEl = document.getElementById('main-dialogue-portrait');
        if (!portraitEl) {
          portraitEl = document.createElement('div');
          portraitEl.id = 'main-dialogue-portrait';
          portraitEl.className = 'dialogue-portrait';
          portraitEl.innerHTML = `<img src="assets/images/NPC.png" alt="森森鈴蘭" class="dialogue-portrait-img">`;
          viewport.appendChild(portraitEl);
        }
        portraitEl.style.display = 'block';
        
        // 創建對話框
        dialogueEl = document.createElement('div');
        dialogueEl.id = 'main-dialogue-box';
        dialogueEl.className = 'main-dialogue-box';
        dialogueEl.innerHTML = `
          <div class="dialogue-overlay"></div>
          <div class="dialogue-container">
            <div class="dialogue-content">
              <div class="dialogue-text" id="main-dialogue-text">玩家？我是森森鈴蘭，來自山谷的狼，是個魔女哦！</div>
              <div class="dialogue-buttons" id="main-dialogue-buttons">
                <button id="main-dialogue-continue" class="dialogue-btn">繼續對話</button>
                <button id="main-dialogue-exit" class="dialogue-btn">離開</button>
              </div>
            </div>
          </div>
        `;
        viewport.appendChild(dialogueEl);
        
        dialogueEl.style.display = 'flex';
        
        // 使用事件委托處理按鈕點擊
        dialogueEl.addEventListener('click', function(e) {
          const id = e.target.id;
          if (id === 'main-dialogue-continue') {
            playButtonSound();
            nextDialogue();
          } else if (id === 'main-dialogue-exit') {
            playButtonSound();
            closeDialogue();
          } else if (id === 'main-dialogue-youtube') {
            playButtonSound();
            showYouTubeWindow();
          } else if (id === 'main-dialogue-code') {
            playButtonSound();
            showCode();
          }
        });
        
        // 滑鼠移動檢測（對話框內正常，框外禁止）
        const dialogueContainer = dialogueEl.querySelector('.dialogue-container');
        if (dialogueContainer) {
          dialogueContainer.addEventListener('mousemove', function(e) {
            canvas.style.cursor = '';
          });
        }
        
        // 對話框外滑鼠移動
        const dialogueOverlay = dialogueEl.querySelector('.dialogue-overlay');
        if (dialogueOverlay) {
          dialogueOverlay.addEventListener('mousemove', function(e) {
            canvas.style.cursor = 'not-allowed';
          });
        }
      }
      
      function nextDialogue() {
        dialogueState++;
        const textEl = document.getElementById('main-dialogue-text');
        const buttonsEl = document.getElementById('main-dialogue-buttons');
        
        if (!textEl || !buttonsEl) return;
        
        if (dialogueState === 2) {
          textEl.textContent = '你有聽過我的歌聲嗎？若還沒有記得去聽聽看最新的原創曲！';
        } else if (dialogueState === 3) {
          textEl.textContent = '訂閱我的YouTube頻道，作為感謝會給您一些序號獎勵，是完全免費的！';
        } else if (dialogueState === 4) {
          textEl.textContent = '除此之外若參加遊戲內的限時活動，也可以獲得相同的序號獎勵！';
        } else if (dialogueState === 5) {
          buttonsEl.innerHTML = `
            <button id="main-dialogue-youtube" class="dialogue-btn">進入頻道</button>
            <button id="main-dialogue-code" class="dialogue-btn disabled">領取序號</button>
            <button id="main-dialogue-exit" class="dialogue-btn">離開</button>
          `;
          checkYouTubeSubscription();
        }
      }
      
      function showYouTubeWindow() {
        // 暫停BGM，避免與YouTube影片聲音衝突，並標記為被 YouTube 視窗暫停
        try {
          mainBgmSuspendedByYouTube = true;
          if (ctx && ctx.audio && typeof ctx.audio.stopAllMusic === 'function') {
            ctx.audio.stopAllMusic();
          }
        } catch(_) {}
        
        const viewport = document.getElementById('viewport');
        if (!viewport) return;
        
        youtubeWindowEl = document.createElement('div');
        youtubeWindowEl.id = 'main-youtube-window';
        youtubeWindowEl.className = 'main-youtube-window';
        youtubeWindowEl.innerHTML = `
          <div class="youtube-window-overlay"></div>
          <div class="youtube-window-content">
            <div class="youtube-window-header">
              <h2>森森鈴蘭 YouTube 頻道</h2>
              <div class="youtube-header-right">
                <a href="https://www.youtube.com/@%E6%A3%AE%E6%A3%AE%E9%88%B4%E8%98%ADLilyLinglan" target="_blank" class="youtube-channel-link">前往頻道首頁</a>
                <button id="main-youtube-close" class="youtube-close-btn">×</button>
              </div>
            </div>
            <div class="youtube-window-body">
              <div class="youtube-video-container">
                <iframe 
                  width="100%" 
                  height="100%" 
                  src="https://www.youtube.com/embed/6wTHWUkIBns?si=77DPsSb-F_EeBee-&autoplay=0" 
                  title="YouTube video player" 
                  frameborder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                  referrerpolicy="strict-origin-when-cross-origin" 
                  allowfullscreen
                  class="youtube-video-iframe">
                </iframe>
              </div>
              <div class="youtube-subscribe-section">
                <div class="youtube-subscribe-button-container">
                  <div class="g-ytsubscribe" data-channelid="UC3ZTQ8VZVCpwLHjFKSFe5Uw" data-layout="default" data-count="default"></div>
                  <button id="youtube-auth-hint" class="youtube-auth-hint-btn" title="點擊查看授權說明">?</button>
                </div>
              </div>
            </div>
          </div>
        `;
        viewport.appendChild(youtubeWindowEl);
        
        const closeBtn = document.getElementById('main-youtube-close');
        const overlay = youtubeWindowEl.querySelector('.youtube-window-overlay');
        if (closeBtn) {
          closeBtn.addEventListener('click', function() {
            playButtonSound();
            closeYouTubeWindow();
          });
        }
        if (overlay) {
          overlay.addEventListener('click', closeYouTubeWindow);
        }
        
        // 載入YouTube訂閱按鈕API
        function loadYouTubeSubscribeButton() {
          const container = youtubeWindowEl.querySelector('.youtube-subscribe-button-container .g-ytsubscribe');
          if (!container) return;
          
          let existingScript = document.querySelector('script[src="https://apis.google.com/js/platform.js"]');
          if (!existingScript) {
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/platform.js';
            script.async = true;
            script.defer = true;
            script.onload = function() {
              let retries = 0;
              const maxRetries = 20;
              const checkGapi = setInterval(function() {
                if (window.gapi && typeof window.gapi.ytsubscribe === 'object' && typeof window.gapi.ytsubscribe.go === 'function') {
                  clearInterval(checkGapi);
                  try {
                    window.gapi.ytsubscribe.go();
                  } catch(e) {}
                } else if (retries++ >= maxRetries) {
                  clearInterval(checkGapi);
                }
              }, 200);
            };
            document.head.appendChild(script);
          } else {
            if (window.gapi && typeof window.gapi.ytsubscribe === 'object' && typeof window.gapi.ytsubscribe.go === 'function') {
              try {
                window.gapi.ytsubscribe.go();
              } catch(e) {
                setTimeout(loadYouTubeSubscribeButton, 500);
              }
            } else {
              setTimeout(loadYouTubeSubscribeButton, 500);
            }
          }
        }
        setTimeout(loadYouTubeSubscribeButton, 300);
        
        // 授權按鈕
        const authHintBtn = document.getElementById('youtube-auth-hint');
        if (authHintBtn) {
          authHintBtn.addEventListener('click', function(e) {
            e.stopPropagation(); // 防止事件冒泡
            showAuthHint();
          });
        }
      }
      
      function showAuthHint() {
        const hintWindow = document.createElement('div');
        hintWindow.id = 'youtube-auth-hint-window';
        hintWindow.className = 'youtube-auth-hint-window';
        hintWindow.innerHTML = `
          <div class="auth-hint-overlay"></div>
          <div class="auth-hint-content">
            <div class="auth-hint-header">
              <h3>授權說明</h3>
              <button id="auth-hint-close" class="auth-hint-close-btn">×</button>
            </div>
            <div class="auth-hint-body">
              <p>為了自動檢測您是否已訂閱頻道，我們需要您的授權。</p>
              <p><strong>授權內容：</strong></p>
              <ul>
                <li>僅查看您是否訂閱了「森森鈴蘭」頻道</li>
                <li>不會收集您的任何個人資訊</li>
                <li>不會查看您的其他訂閱或觀看記錄</li>
                <li>授權僅在您的瀏覽器中生效</li>
                <li>您可以隨時在Google帳號設定中撤銷授權</li>
              </ul>
              <p><strong>安全性：</strong></p>
              <p>此授權過程由Google官方提供，完全安全，不會影響您的帳號安全或隱私。</p>
              <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 8px; padding: 12px; margin: 16px 0;">
                <p style="margin: 0 0 8px 0; font-weight: bold; color: #ffc107;">⚠️ 重要提示：</p>
                <p style="margin: 0 0 8px 0; font-size: 14px;">點擊「開始授權」後，可能會看到「未經驗證的應用程式」警告。</p>
                <p style="margin: 0; font-size: 14px; font-weight: bold; color: #4CAF50;">✅ 這是正常的！請按照以下步驟操作：</p>
                <ol style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px;">
                  <li>點擊警告頁面上的「<strong>進階</strong>」按鈕</li>
                  <li>然後點擊「<strong>繼續前往 [應用程式名稱]（不安全）</strong>」</li>
                  <li>即可完成授權</li>
                </ol>
                <p style="margin: 8px 0 0 0; font-size: 13px; color: rgba(255, 255, 255, 0.7);">這是Google的安全機制，不會影響功能使用，您可以放心繼續。</p>
              </div>
              <p style="margin: 8px 0 0 0; font-size: 13px;">
                詳細隱私權政策請參考：
                <a href="https://sites.google.com/view/privacy-policy-yi/" target="_blank" rel="noopener noreferrer" style="color: #4FC3F7; text-decoration: underline;">
                  隱私權政策
                </a>
              </p>
              <button id="auth-hint-authorize" class="dialogue-btn">開始授權</button>
            </div>
          </div>
        `;
        const viewport = document.getElementById('viewport');
        if (viewport) {
          viewport.appendChild(hintWindow);
          
          const closeBtn = document.getElementById('auth-hint-close');
          const overlay = hintWindow.querySelector('.auth-hint-overlay');
          const authorizeBtn = document.getElementById('auth-hint-authorize');
          
          function closeHint(e) {
            if (e) e.stopPropagation();
            if (hintWindow.parentNode) {
              hintWindow.parentNode.removeChild(hintWindow);
            }
          }
          
          // 阻止事件冒泡，避免触发其他点击事件
          if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
              e.stopPropagation();
              closeHint(e);
            });
          }
          if (overlay) {
            overlay.addEventListener('click', function(e) {
              e.stopPropagation();
              closeHint(e);
            });
          }
          
          if (authorizeBtn) {
            authorizeBtn.addEventListener('click', function(e) {
              e.stopPropagation();
              playButtonSound();
              
              const config = window.YouTubeAPIConfig || {};
              if (!config.clientId || config.clientId === 'YOUR_CLIENT_ID') {
                alert('Client ID 未配置，請檢查 youtube_config.js');
                return;
              }
              
              // 使用新的 Google Identity Services (GIS) 進行授權
              loadGoogleIdentityServices().then(function() {
                if (!window.google || !window.google.accounts) {
                  alert('無法載入 Google Identity Services');
                  return;
                }
                
                console.log('開始授權流程（使用 GIS）...');
                
                window.google.accounts.oauth2.initTokenClient({
                  client_id: config.clientId,
                  scope: 'https://www.googleapis.com/auth/youtube.readonly',
                  callback: function(response) {
                    if (response.error) {
                      console.error('授權失敗:', response);
                      alert('授權失敗: ' + (response.error_description || response.error) + '\n\n請檢查：\n1. Client ID 是否正確\n2. 已授權的 JavaScript 來源是否包含當前網址');
                      closeHint();
                      return;
                    }
                    
                    console.log('授權成功，獲取 access token');
                    // 使用 access token 設置 gapi client
                    if (window.gapi && window.gapi.client) {
                      window.gapi.client.setToken({
                        access_token: response.access_token
                      });
                      checkYouTubeSubscription();
                      closeHint();
                    } else {
                      alert('YouTube API 尚未載入，請稍候再試');
                    }
                  }
                }).requestAccessToken();
              }).catch(function(error) {
                console.error('載入 GIS 失敗:', error);
                alert('無法載入授權系統，請刷新頁面後再試');
              });
            });
          }
        }
      }
      
      // 載入Google Identity Services (GIS) - 新的授權系統
      function loadGoogleIdentityServices() {
        return new Promise(function(resolve, reject) {
          if (window.google && window.google.accounts) {
            resolve();
            return;
          }
          
          let existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
          if (!existingScript) {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = function() {
              resolve();
            };
            script.onerror = function() {
              reject(new Error('無法載入 Google Identity Services'));
            };
            document.head.appendChild(script);
          } else {
            resolve();
          }
        });
      }
      
      // 載入YouTube Data API v3（用於檢測訂閱狀態）
      function loadYouTubeDataAPI() {
        if (window.gapi && window.gapi.client && window.gapi.client.youtube) {
          checkYouTubeSubscription();
          return;
        }
        
        let existingScript = document.querySelector('script[src="https://apis.google.com/js/api.js"]');
        if (!existingScript) {
          const script = document.createElement('script');
          script.src = 'https://apis.google.com/js/api.js';
          script.onload = function() {
            window.gapi.load('client', function() {
              const config = window.YouTubeAPIConfig || {};
              if (!config.apiKey || config.apiKey === 'YOUR_API_KEY') {
                console.error('YouTube API 配置未完成，請檢查 youtube_config.js');
                console.error('當前配置:', config);
                return;
              }
              
              console.log('初始化 YouTube API...');
              window.gapi.client.init({
                apiKey: config.apiKey,
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
              }).then(function() {
                console.log('YouTube API 初始化成功');
                checkYouTubeSubscription();
              }).catch(function(error) {
                console.error('YouTube API 初始化失敗:', error);
                if (error.details) {
                  console.error('錯誤詳情:', error.details);
                }
              });
            });
          };
          document.head.appendChild(script);
        } else {
          setTimeout(function() {
            if (window.gapi && window.gapi.client && window.gapi.client.youtube) {
              checkYouTubeSubscription();
            }
          }, 500);
        }
      }
      
      // 延遲載入YouTube Data API
      setTimeout(loadYouTubeDataAPI, 1000);
      
      function closeYouTubeWindow() {
        if (youtubeWindowEl && youtubeWindowEl.parentNode) {
          youtubeWindowEl.parentNode.removeChild(youtubeWindowEl);
          youtubeWindowEl = null;
        }

        // 解除 YouTube 暫停標記，並恢復 BGM 播放
        try {
          mainBgmSuspendedByYouTube = false;
          if (ctx && ctx.audio && typeof ctx.audio.unmuteAndPlay === 'function') {
            ctx.audio.unmuteAndPlay('main', { loop: true });
          }
        } catch(_) {}
      }
      
      function checkYouTubeSubscription() {
        const codeBtn = document.getElementById('main-dialogue-code');
        if (!codeBtn) return;
        
        // 使用YouTube Data API檢測訂閱狀態
        if (window.gapi && window.gapi.client && window.gapi.client.youtube) {
          // 檢查是否有有效的 access token
          const token = window.gapi.client.getToken();
          if (!token || !token.access_token) {
            codeBtn.classList.add('disabled');
            codeBtn.disabled = true;
            return;
          }
          
          // 已授權，檢查訂閱狀態
          window.gapi.client.youtube.subscriptions.list({
            part: 'snippet',
            mine: true,
            forChannelId: 'UC3ZTQ8VZVCpwLHjFKSFe5Uw'
          }).then(function(response) {
            const items = response.result.items || [];
            if (items.length > 0) {
              codeBtn.classList.remove('disabled');
              codeBtn.disabled = false;
            } else {
              codeBtn.classList.add('disabled');
              codeBtn.disabled = true;
            }
          }).catch(function(error) {
            console.error('檢查訂閱狀態失敗:', error);
            codeBtn.classList.add('disabled');
            codeBtn.disabled = true;
            
            // 檢查是否為配額用盡錯誤
            const errorMessage = error.message || error.error?.message || '';
            const errorCode = error.code || error.error?.code;
            
            if (errorCode === 403 || errorMessage.includes('quotaExceeded') || errorMessage.includes('quota') || errorMessage.includes('配額')) {
              // 配額用盡，顯示提示
              console.warn('YouTube API 配額已用盡，請稍後再試');
              // 可以在這裡添加用戶提示，例如：
              // alert('今日檢測次數已達上限，請明天再試');
            }
          });
        } else {
          // API未載入
          codeBtn.classList.add('disabled');
          codeBtn.disabled = true;
        }
      }
      
      function showCode() {
        // 顯示序號彈窗
        const codeWindow = document.createElement('div');
        codeWindow.id = 'main-code-window';
        codeWindow.className = 'main-code-window';
        codeWindow.innerHTML = `
          <div class="code-window-overlay"></div>
          <div class="code-window-content">
            <div class="code-window-header">
              <h2>活動序號</h2>
              <button id="main-code-close" class="code-close-btn">×</button>
            </div>
            <div class="code-window-body">
              <div class="code-display">LINGLAN2025</div>
            </div>
          </div>
        `;
        const viewport = document.getElementById('viewport');
        if (viewport) {
          viewport.appendChild(codeWindow);
          
          const closeBtn = document.getElementById('main-code-close');
          const overlay = codeWindow.querySelector('.code-window-overlay');
          
          if (closeBtn) {
            closeBtn.addEventListener('click', function() {
              if (codeWindow.parentNode) {
                codeWindow.parentNode.removeChild(codeWindow);
              }
            });
          }
          
          if (overlay) {
            overlay.addEventListener('click', function() {
              if (codeWindow.parentNode) {
                codeWindow.parentNode.removeChild(codeWindow);
              }
            });
          }
        }
      }
      
      function closeDialogue() {
        if (dialogueEl && dialogueEl.parentNode) {
          dialogueEl.parentNode.removeChild(dialogueEl);
          dialogueEl = null;
        }
        
        // 隱藏人物立繪
        const portraitEl = document.getElementById('main-dialogue-portrait');
        if (portraitEl) {
          portraitEl.style.display = 'none';
        }
        
        player.inDialogue = false;
        dialogueState = 0;
        canvas.style.cursor = '';
        
        // 關閉對話框後，強制將玩家移出NPC範圍，避免立即再次觸發
        let npc = MapSystem.entities.find(e => e.type === 'npc');
        if (npc) {
          const npcCenterX = npc.x + npc.width / 2;
          const npcCenterY = npc.y + npc.height / 2;
          const playerCenterX = player.x + player.width / 2;
          const playerCenterY = player.y + player.height / 2;
          const dx = playerCenterX - npcCenterX;
          const dy = playerCenterY - npcCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= 55) {
            const angle = Math.atan2(dy, dx);
            player.x = npcCenterX + Math.cos(angle) * 65 - player.width / 2;
            player.y = npcCenterY + Math.sin(angle) * 65 - player.height / 2;
            player.targetX = null;
            player.movingToNPC = false;
            player.npcTarget = null;
          }
        }
        
        // 關閉YouTube窗口（如果打開）
        if (youtubeWindowEl && youtubeWindowEl.parentNode) {
          youtubeWindowEl.parentNode.removeChild(youtubeWindowEl);
          youtubeWindowEl = null;
        }
      }

      function toggleMainMenu(skipSound) {
        try {
          if (!mainMenuEl) return;
          // 播放 ESC 音效（僅當不是由按鈕觸發時）
          if (!skipSound) {
            try {
              if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                AudioManager.playSound('button_click');
              }
            } catch(_) {}
          }
          isMenuOpen = !isMenuOpen;
          if (isMenuOpen) {
            mainMenuEl.classList.remove('hidden');
          } else {
            mainMenuEl.classList.add('hidden');
          }
        } catch(_) {}
      }

      createMainMenu();

      // ESC 鍵切換菜單
      try {
        if (ctx && ctx.events && typeof ctx.events.on === 'function') {
          ctx.events.on(document, 'keydown', (e) => {
            try {
              const key = e.key || e.code;
              if (key === 'Escape' || key === 'Esc') {
                const gameScreen = document.getElementById('game-screen');
                if (gameScreen && !gameScreen.classList.contains('hidden')) {
                  toggleMainMenu();
                  e.preventDefault();
                  try { e.stopPropagation(); } catch(_) {}
                  try { e.stopImmediatePropagation(); } catch(_) {}
                }
              }
            } catch(_) {}
          }, { capture: true });
        }
      } catch(_) {}

      const canvas = document.getElementById('game-canvas');
      const ctx2d = canvas ? canvas.getContext('2d') : null;
      if (!canvas || !ctx2d) return;
      // 減少圖塊邊緣縫隙與模糊
      try { ctx2d.imageSmoothingEnabled = false; } catch(_){}

      // 設定畫布尺寸（沿用既有 CONFIG）
      try {
        if (typeof CONFIG !== 'undefined') {
          canvas.width = CONFIG.CANVAS_WIDTH || 1280;
          canvas.height = CONFIG.CANVAS_HEIGHT || 720;
        } else {
          canvas.width = 1280;
          canvas.height = 720;
        }
      } catch(_) {
        canvas.width = 1280; canvas.height = 720;
      }

      // 資源存取函數
      function getImage(key){
        try {
          if (ctx && ctx.resources) {
            return ctx.resources.getImage(key);
          }
        } catch(_) {}
        // 回退到全域 Game.images（如果可用）
        try {
          if (typeof Game !== 'undefined' && Game.images && Game.images[key]) {
            return Game.images[key];
          }
        } catch(_) {}
        return null;
      }

      // 世界參數
      const TILE = 48; 
      const MAP_W = 3840;
      const MAP_H = 2160;
      const MAP_COLS = MAP_W / TILE; 
      const MAP_ROWS = MAP_H / TILE; 
      
      const CENTER_X = MAP_W / 2;
      const CENTER_Y = MAP_H / 2;

      const PLAYER_W = 48, PLAYER_H = 60;
      const TREE_W = 120, TREE_H = 140; 
      const HOME_W = 500, HOME_H = 403;

      const T_PASSABLE = 0;
      const T_PATH = 1; 
      const T_WALL = 2; 
      const T_FLOOR = 3; 
      const T_EXIT = 4;

      // 固定樹木座標
      const TREE_OFFSETS = [
        {x: -300, y: -400}, {x: -800, y: -200}, {x: -550, y: -650}, {x: -250, y: -600},
        {x: 400, y: -300}, {x: 750, y: -250}, {x: 500, y: -550}, {x: 900, y: -400},
        {x: -450, y: 350}, {x: -800, y: 250}, {x: -600, y: 600}, {x: -300, y: 700}, {x: -900, y: 500},
        {x: 450, y: 350}, {x: 800, y: 100}, {x: 850, y: 700}, {x: 350, y: 700}, {x: 950, y: 550}
      ];

      // 實體類別
      class Entity {
        constructor(type, x, y, w, h) {
          this.type = type; 
          this.x = x;
          this.y = y;
          this.width = w;
          this.height = h;
          this.solid = true;
          this.col = { x: 0, y: h - 20, w: w, h: 20 }; 
          this.door = null; 
        }
        getBounds() {
          return { x: this.x + this.col.x, y: this.y + this.col.y, w: this.col.w, h: this.col.h };
        }
      }

      // 地圖系統
      const MapSystem = {
        current: 'outdoor',
        width: MAP_COLS, height: MAP_ROWS,
        data: [],     
        entities: [],
        materialData: [], // 儲存原始建材 ID（用於繪製不同顏色） 
        
        load(targetMap) {
          this.current = targetMap;
          this.entities = []; 
          this.data = [];
          
          // 清除所有 DOM 元素（切換地圖時）
          if (typeof window.MainGifOverlay !== 'undefined') {
            window.MainGifOverlay.clearAll();
          } 

          if (targetMap === 'outdoor') {
            this.generateOutdoor();
            updateLocationText('中央廣場');
          } else {
            this.generateIndoor(targetMap);
            updateLocationText((targetMap === 'indoor_home') ? '主屋大廳' : '小屋內部');
          }
        },

        generateOutdoor() {
          this.width = MAP_COLS; this.height = MAP_ROWS; 
          
          for(let y=0; y<this.height; y++) {
            this.data[y] = [];
            for(let x=0; x<this.width; x++) this.data[y][x] = T_PASSABLE;
          }

          // 道路
          const cx = MAP_COLS / 2;
          const cy = MAP_ROWS / 2; 
          const r = 8; 

          for(let y=0; y<this.height; y++) {
            for(let x=0; x<this.width; x++) {
              let dist = Math.sqrt((x-cx)**2 + (y-cy)**2);
              if (dist < r || Math.abs(x-cx) < 1.5 || Math.abs(y-cy) < 1.5) {
                this.data[y][x] = T_PATH;
              }
            }
          }

          // [主屋] HOME.png
          let hx = CENTER_X - (HOME_W / 2);
          let hy = CENTER_Y - 300; 
          let home = new Entity('home', hx, hy, HOME_W, HOME_H);
          
          home.col = { x: 150, y: 220, w: 330, h: 175 }; 
          home.layerId = 'home-main'; // 獨立圖層 ID
          
          home.door = { 
            x: hx + 270, 
            y: hy + 350, 
            w: 60, 
            h: 60,
            target: 'indoor_home',
            returnX: hx + 300, // 門的中心 X
            returnY: hy + 370  // 門的底部稍微前面一點（原本是 420，太遠了）
          };
          this.entities.push(home);

          // [NPC] 放在中間建築物外部右下角（位置上的右下，不是建築物內部）
          // NPC 原始比例 279x320，縮放到接近玩家大小（48x60）
          // 縮放比例 = 60/320 ≈ 0.1875
          const NPC_SCALE = 60 / 320; // 以高度為基準縮放
          const NPC_W = Math.round(279 * NPC_SCALE); // ≈ 52
          const NPC_H = 60; // 與玩家高度一致
          // 建築物外部右下角：建築物右邊界 + 偏移，建築物下邊界 + 偏移
          const npcX = hx + HOME_W + 20; // 建築物右邊界外側，稍微偏移
          const npcY = hy + HOME_H + 10; // 建築物下邊界外側，稍微偏移
          let npc = new Entity('npc', npcX, npcY, NPC_W, NPC_H);
          npc.solid = false; // NPC 不阻擋玩家
          npc.domId = 'main-npc';
          npc.layerId = 'npc';
          npc.spriteSheet = null; // 雪碧圖（001.png），用於滑鼠游標
          npc.spriteFrame = 0; // 當前雪碧圖幀（0-7）
          this.entities.push(npc);

          // [NPC 房子]
          const h1Img = getImage('main_house1');
          const h2Img = getImage('main_house2');
          const h3Img = getImage('main_house3');
          const h4Img = getImage('main_house4');
          if (h1Img) this.addImageHouse(CENTER_X - 750, CENTER_Y - 350, h1Img, 268, 300, 'indoor_A', 'house-A');
          if (h2Img) this.addImageHouse(CENTER_X + 1000, CENTER_Y - 500, h2Img, 266, 300, 'indoor_B', 'house-B');
          if (h3Img) this.addImageHouse(CENTER_X - 600, CENTER_Y + 500, h3Img, 300, 190, 'indoor_C', 'house-C');
          if (h4Img) this.addImageHouse(CENTER_X + 600, CENTER_Y + 500, h4Img, 284, 400, 'indoor_A', 'house-D');

          // 樹木（每棵樹獨立圖層）
          const treeImg = getImage('main_tree');
          const TREE_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
          for (let idx = 0; idx < TREE_OFFSETS.length; idx++) {
            let pos = TREE_OFFSETS[idx];
            let tx = CENTER_X + pos.x;
            let ty = CENTER_Y + pos.y;
            let tree = new Entity('tree', tx, ty, TREE_W, TREE_H);
            tree.col = { x: 45, y: 110, w: 30, h: 20 };
            tree.img = treeImg;
            tree.domId = 'main-tree-' + idx; // DOM ID
            tree.layerId = 'tree-' + (TREE_NAMES[idx] || idx); // 獨立圖層 ID（tree-A, tree-B, ...）
            this.entities.push(tree);
          }
        },

        addImageHouse(x, y, imgAsset, w, h, mapId, layerId) {
          let house = new Entity('img_house', x, y, w, h);
          house.img = imgAsset; 
          
          house.col = { x: 20, y: h - 150, w: w - 40, h: 150 };
          house.layerId = layerId; // 獨立圖層 ID
          
          let doorW = 50;
          let doorX = x + (w / 2) - (doorW / 2);
          let doorY = y + h - 20;

          house.door = {
            x: doorX, y: doorY, w: doorW, h: 40,
            target: mapId,
            returnX: doorX + doorW/2, // 門的中心 X
            returnY: doorY + 10  // 門的底部稍微前面一點（原本是 y + h + 20，太遠了）
          };
          // 為每個房子分配唯一的 DOM ID
          house.domId = 'main-house-' + this.entities.length;
          this.entities.push(house);
        },

        generateIndoor(mapId) {
          let cols, rows;
          if (mapId === 'indoor_home') { cols = 30; rows = 20; } 
          else { cols = 20; rows = 15; }

          this.width = cols; this.height = rows;

          // 僅在主屋大廳：從 JSON 載入 mapData
          if (mapId === 'indoor_home') {
            // 載入布局 JSON 資料（與 addIndoorFurniture 使用相同的資料）
            const layoutData = this.getLayoutData();
            
            // 儲存原始建材 ID（用於繪製不同顏色）
            this.materialData = [];
            
            if (layoutData && layoutData.mapData) {
              // 使用 JSON 中的 mapData 來建立地圖
              for (let y = 0; y < rows && y < layoutData.mapData.length; y++) {
                this.data[y] = [];
                this.materialData[y] = [];
                for (let x = 0; x < cols && x < layoutData.mapData[y].length; x++) {
                  const materialId = layoutData.mapData[y][x];
                  this.materialData[y][x] = materialId; // 儲存原始建材 ID
                  
                  // 轉換建材 ID 為地圖類型（用於碰撞檢測）
                  if (materialId === 'wall_gray' || materialId === 'wall_wood' || materialId === 'wall_brick' || 
                      materialId === 'wall_stone' || materialId === 'wall_white' || materialId === 'wall_blue' || 
                      materialId === 'wall_red') {
                    // 外牆或隔間牆
                    if (x === 0 || x === cols - 1 || y === 0 || y === rows - 1) {
                      // 出口處理
                      const centerX = cols / 2;
                      if (y === rows - 1 && (x <= centerX + 1 && x >= centerX - 2)) {
                        this.data[y][x] = T_EXIT;
                      } else {
                        this.data[y][x] = T_WALL;
                      }
                    } else {
                      // 內部隔間牆
                      this.data[y][x] = T_WALL;
                    }
                  } else {
                    // 地板（包括所有地板類型）
                    if (x === 0 || x === cols - 1 || y === 0 || y === rows - 1) {
                      // 外牆處理
                      const centerX = cols / 2;
                      if (y === rows - 1 && (x <= centerX + 1 && x >= centerX - 2)) {
                        this.data[y][x] = T_EXIT;
                      } else {
                        this.data[y][x] = T_WALL;
                      }
                    } else {
                      this.data[y][x] = T_FLOOR;
                    }
                  }
                }
              }
            } else {
              // 如果沒有 mapData，使用預設（外牆+地板）
              for(let y=0; y<this.height; y++) {
                this.data[y] = [];
                this.materialData[y] = [];
                for(let x=0; x<this.width; x++) {
                  if (x===0 || x===cols-1 || y===0 || y===rows-1) {
                    const centerX = cols / 2;
                    if (y===rows-1 && (x <= centerX + 1 && x >= centerX - 2)) {
                      this.data[y][x] = T_EXIT;
                      this.materialData[y][x] = 'floor_brown';
                    } else {
                      this.data[y][x] = T_WALL;
                      this.materialData[y][x] = 'wall_gray';
                    }
                  } else {
                    this.data[y][x] = T_FLOOR;
                    this.materialData[y][x] = 'floor_brown';
                  }
                }
              }
            }
            
            this.addIndoorFurniture();
          } else {
            // 其他室內地圖：使用預設
            this.materialData = [];
            for(let y=0; y<this.height; y++) {
              this.data[y] = [];
              this.materialData[y] = [];
              for(let x=0; x<this.width; x++) {
                if (x===0 || x===cols-1 || y===0 || y===rows-1) {
                  const centerX = cols / 2;
                  if (y===rows-1 && (x <= centerX + 1 && x >= centerX - 2)) {
                    this.data[y][x] = T_EXIT;
                    this.materialData[y][x] = 'floor_brown';
                  } else {
                    this.data[y][x] = T_WALL;
                    this.materialData[y][x] = 'wall_gray';
                  }
                } else {
                  this.data[y][x] = T_FLOOR;
                  this.materialData[y][x] = 'floor_brown';
                }
              }
            }
          }
        },
        
        // 取得布局資料（共用函數）- 從完整的 JSON 檔案讀取
        getLayoutData() {
          // 完整的 mapData（從 indoor_layout.json 複製）
          const fullMapData = [
            ["wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray"],
            ["wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","wall_wood","wall_wood","floor_brown","floor_brown","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","wall_wood","wall_wood","wall_wood","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","tile_white","tile_white","tile_white","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","tile_white","tile_white","tile_white","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","tile_white","tile_white","tile_white","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","wall_wood","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray"],
            ["wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","floor_brown","floor_brown","floor_brown","floor_brown","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray","wall_gray"]
          ];
          
          return {
            "mapWidth": 30,
            "mapHeight": 20,
            "tileSize": 48,
            "mapData": fullMapData,
            "furniture": [
              {"key": "counter-833x351", "name": "counter-833x351", "x": 604, "y": 563, "w": 226, "h": 95},
              {"key": "bigbookcase-245x289", "name": "big bookcase-245x289", "x": 823, "y": -10, "w": 125, "h": 147},
              {"key": "TVtable-336x276", "name": "TV table-336x276", "x": 1285, "y": 57, "w": 94, "h": 77},
              {"key": "Wardrobe-206x347", "name": "Wardrobe-206x347", "x": 550, "y": -2, "w": 64, "h": 108},
              {"key": "bookcase-303x354", "name": "bookcase-303x354", "x": 1270, "y": 770, "w": 123, "h": 144},
              {"key": "storagecabinet-225x264", "name": "storage cabinet-225x264", "x": 44, "y": 26, "w": 56, "h": 66},
              {"key": "bed-front-273x289", "name": "bed-front-273x289", "x": 433, "y": 48, "w": 112, "h": 119},
              {"key": "loveseat-front-263x196", "name": "loveseat-front-263x196", "x": 727, "y": 72, "w": 86, "h": 64},
              {"key": "Biglamp-244x362", "name": "Big lamp-244x362", "x": 996, "y": 48, "w": 55, "h": 82},
              {"key": "Chair-side-299x465", "name": "Chair-side-299x465", "x": 94, "y": 797, "w": 40, "h": 62},
              {"key": "sofa-side-145x176", "name": "sofa-side-145x176", "x": 287, "y": 109, "w": 44, "h": 53},
              {"key": "pottedplant-119x166", "name": "potted plant-119x166", "x": 477, "y": 646, "w": 49, "h": 68},
              {"key": "sofa-front-154x185", "name": "sofa-front-154x185", "x": 955, "y": 69, "w": 56, "h": 67},
              {"key": "smallroundtable-149x152", "name": "small round table-149x152", "x": 960, "y": 171, "w": 46, "h": 47},
              {"key": "smallroundtable-154x155", "name": "small round table-154x155", "x": 747, "y": 172, "w": 45, "h": 45},
              {"key": "smallchair-182x160", "name": "small chair-182x160", "x": 587, "y": 732, "w": 62, "h": 55},
              {"key": "lamp-106x176", "name": "lamp-106x176", "x": 386, "y": 26, "w": 45, "h": 75},
              {"key": "Chair-front-123x226", "name": "Chair-front-123x226", "x": 150, "y": 724, "w": 34, "h": 62},
              {"key": "smallchair-182x160", "name": "small chair-182x160", "x": 637, "y": 732, "w": 62, "h": 55},
              {"key": "smallchair-182x160", "name": "small chair-182x160", "x": 687, "y": 732, "w": 62, "h": 55},
              {"key": "smallchair-182x160", "name": "small chair-182x160", "x": 737, "y": 732, "w": 62, "h": 55},
              {"key": "smallchair-182x160", "name": "small chair-182x160", "x": 786, "y": 732, "w": 62, "h": 55},
              {"key": "pottedplant-119x166", "name": "potted plant-119x166", "x": 381, "y": 646, "w": 49, "h": 68},
              {"key": "pottedplant-119x166", "name": "potted plant-119x166", "x": 912, "y": 646, "w": 49, "h": 68},
              {"key": "pottedplant-119x166", "name": "potted plant-119x166", "x": 290, "y": 646, "w": 49, "h": 68},
              {"key": "pottedplant-119x166", "name": "potted plant-119x166", "x": 1007, "y": 646, "w": 49, "h": 68},
              {"key": "pottedplant-119x166", "name": "potted plant-119x166", "x": 1105, "y": 646, "w": 49, "h": 68},
              {"key": "Bigsofa-286x301", "name": "Bigsofa-286x301", "x": 200, "y": 76, "w": 82, "h": 86},
              {"key": "smallroundtable-122x142", "name": "small round table-122x142", "x": 137, "y": 795, "w": 60, "h": 70},
              {"key": "bigbookcase-245x289", "name": "big bookcase-245x289", "x": 1055, "y": -8, "w": 124, "h": 146},
              {"key": "loveseat-front-263x196", "name": "loveseat-front-263x196", "x": 1188, "y": 73, "w": 86, "h": 64},
              {"key": "smallroundtable-122x142", "name": "small round table-122x142", "x": 271, "y": 797, "w": 60, "h": 70},
              {"key": "smallroundtable-122x142", "name": "small round table-122x142", "x": 412, "y": 797, "w": 60, "h": 70},
              {"key": "pottedplant-119x166", "name": "potted plant-119x166", "x": 94, "y": 646, "w": 49, "h": 68},
              {"key": "pottedplant-119x166", "name": "potted plant-119x166", "x": 197, "y": 646, "w": 49, "h": 68},
              {"key": "toilet-60x60", "name": "toilet-60x60", "x": 42, "y": 513, "w": 60, "h": 60},
              {"key": "smallroundtable-154x155", "name": "small round table-154x155", "x": 1209, "y": 171, "w": 44, "h": 44},
              {"key": "bookcase-303x354", "name": "bookcase-303x354", "x": 1268, "y": 348, "w": 125, "h": 146}
            ]
          };
        },

        /**
         * 主屋大廳家具佈局（從 indoor_layout.json 載入）
         * 碰撞規則：
         * - 床、椅子、沙發、小圓桌、盆栽、小檯燈、TV櫃等：整張圖「全碰撞」
         * - 大型家具（大書櫃、大檯燈、櫃台、儲物櫃、衣櫃）：下半部碰撞，上半部無碰撞
         */
        addIndoorFurniture() {
          // 直接使用嵌入的布局 JSON 資料（避免 CORS 問題）
          const layoutData = this.getLayoutData();
          
          if (!layoutData || !layoutData.furniture) {
            console.warn('布局資料格式錯誤');
            return;
          }

          // Key 映射：將 JSON key 轉換為 imageKey（完全對應 JSON 中的所有家具）
          const keyMap = {
            'counter-833x351': 'f_counter',
            'bigbookcase-245x289': 'f_big_bookcase',
            'TVtable-336x276': 'f_tv_table',
            'Wardrobe-206x347': 'f_wardrobe1',
            'bookcase-303x354': 'f_bookcase',
            'storagecabinet-225x264': 'f_storage_cabinet2',
            'bed-front-273x289': 'f_bed_front',
            'loveseat-front-263x196': 'f_loveseat_front',
            'Biglamp-244x362': 'f_big_lamp',
            'Chair-side-299x465': 'f_chair_side',
            'sofa-side-145x176': 'f_sofa_side',
            'pottedplant-119x166': 'f_potted_plant',
            'sofa-front-154x185': 'f_sofa_front',
            'smallroundtable-149x152': 'f_round_table2',
            'smallroundtable-154x155': 'f_round_table3',
            'smallchair-182x160': 'f_small_chair',
            'lamp-106x176': 'f_lamp_small',
            'Chair-front-123x226': 'f_chair_front',
            'smallroundtable-122x142': 'f_round_table1',
            'Bigsofa-286x301': 'f_big_sofa', // 使用實際的 Bigsofa 圖片
            'toilet-60x60': 'f_toilet' // 使用實際的 toilet 圖片
          };

          // 判斷碰撞類型：大型家具用 halfBottom，其他用 full
          const getCollisionType = (imageKey, w, h) => {
            const largeFurniture = ['f_big_bookcase', 'f_big_lamp', 'f_counter', 'f_storage_cabinet2', 'f_wardrobe1', 'f_bookcase'];
            if (largeFurniture.includes(imageKey)) {
              return 'halfBottom';
            }
            return 'full';
          };

          // 小工具：建立家具實體
          const addFurniture = (opts) => {
            const ent = new Entity('furniture', opts.x, opts.y, opts.w, opts.h);
            ent.imageKey = opts.imageKey;
            ent.solid = true;
            // fullCollision: 整張圖碰撞；halfBottom: 下半部碰撞
            if (opts.collision === 'full') {
              ent.col = { x: 0, y: 0, w: opts.w, h: opts.h };
            } else if (opts.collision === 'halfBottom') {
              const ch = Math.floor(opts.h / 2);
              ent.col = { x: 0, y: opts.h - ch, w: opts.w, h: ch };
            }
            ent.layerId = opts.layerId || 'furniture';
            this.entities.push(ent);
            return ent;
          };

          // 從 JSON 載入並放置所有家具
          let loadedCount = 0;
          let skippedCount = 0;
          
          layoutData.furniture.forEach((item, index) => {
            const imageKey = keyMap[item.key];
            if (!imageKey) {
              console.warn(`[家具載入] 未找到映射: ${item.key} -> 跳過`);
              skippedCount++;
              return;
            }

            // 檢查圖片是否存在
            const img = getImage(imageKey);
            if (!img) {
              console.warn(`[家具載入] 圖片不存在: ${imageKey} (key: ${item.key}) -> 跳過`);
              skippedCount++;
              return;
            }

            // 判斷碰撞類型
            const collision = getCollisionType(imageKey, item.w, item.h);

            // 建立家具實體
            addFurniture({
              imageKey: imageKey,
              x: item.x,
              y: item.y,
              w: item.w,
              h: item.h,
              collision: collision,
              layerId: `f-${item.key}-${index}`
            });
            
            loadedCount++;
            console.log(`[家具載入] ${index + 1}/${layoutData.furniture.length}: ${item.key} -> ${imageKey} (${item.x}, ${item.y}, ${item.w}x${item.h}, ${collision})`);
          });
          
          console.log(`[家具載入完成] 成功: ${loadedCount}, 跳過: ${skippedCount}, 總計: ${layoutData.furniture.length}`);
        }
      };

      // 玩家與控制
      const player = {
        x: CENTER_X, y: CENTER_Y + 200,
        width: PLAYER_W, height: PLAYER_H,
        speed: 4, // 降低移動速度（原本是8）
        lastDoor: null,
        canExit: true,
        targetX: null, 
        targetY: null,
        facingRight: true, // 面向右側（用於 player2 方向切換）
        inDialogue: false, // 是否在對話中
        movingToNPC: false, // 是否正在移動到NPC
        npcTarget: null // 目標NPC（用於自動移動）
      };

      // 根據選角角色決定玩家圖片（支援 player2 方向切換）
      function getPlayerImage() {
      const sc = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
        let imgKey = 'player'; // 預設瑪格麗特
      if (sc && sc.spriteImageKey) {
        imgKey = sc.spriteImageKey;
      } else if (sc && sc.id === 'dada') {
        imgKey = 'player2';
        } else if (sc && sc.id === 'lilylinglan') {
          imgKey = 'player3';
      } else if (sc && sc.id === 'rokurost') {
        imgKey = 'player4';
      }
        
        // 特殊處理：player2根據移動方向切換圖片（左邊player2.png，右邊player2-1.png）
        if (imgKey === 'player2') {
          imgKey = player.facingRight ? 'player2-1' : 'player2';
        }
        
        // 優先從 Game.images 取得
        if (typeof Game !== 'undefined' && Game.images && Game.images[imgKey]) {
          return Game.images[imgKey];
        }
        return null;
      }

      // 鍵盤控制
      const keys = {};
      const keyHandler = (e, val) => {
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 'arrowup') keys['w'] = val;
        if (k === 's' || k === 'arrowdown') keys['s'] = val;
        if (k === 'a' || k === 'arrowleft') keys['a'] = val;
        if (k === 'd' || k === 'arrowright') keys['d'] = val;
        if (val) player.targetX = null; // 鍵盤移動時取消點擊目標
      };
      ctx.events.on(document, 'keydown', (e) => keyHandler(e, true), { capture: true });
      ctx.events.on(document, 'keyup', (e) => keyHandler(e, false), { capture: true });

      // 點擊移動（包含NPC點擊檢測）
      const onCanvasClick = (e) => {
        try {
          // 如果正在對話中，不處理點擊
          if (player.inDialogue) {
            try { e.preventDefault(); e.stopPropagation(); } catch(_) {}
            return;
          }
          
        const rect = canvas.getBoundingClientRect();
        const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
          let x, y;
        if (rotatedPortrait) {
            const u = ((e.clientX != null ? e.clientX : e.pageX) - rect.left) / rect.width;
            const v = ((e.clientY != null ? e.clientY : e.pageY) - rect.top) / rect.height;
            x = v * canvas.width;
            y = (1 - u) * canvas.height;
        } else {
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
            x = (((e.clientX != null ? e.clientX : e.pageX) - rect.left) * scaleX);
            y = (((e.clientY != null ? e.clientY : e.pageY) - rect.top) * scaleY);
          }
          const cam = getCameraOffset();
          const worldX = x + cam.x;
          const worldY = y + cam.y;
          
          // 檢查是否點擊了NPC
          let npc = MapSystem.entities.find(e => e.type === 'npc');
          if (npc) {
            const npcCenterX = npc.x + npc.width / 2;
            const npcCenterY = npc.y + npc.height / 2;
            const playerCenterX = player.x + player.width / 2;
            const playerCenterY = player.y + player.height / 2;
            const distToNPC = Math.sqrt((playerCenterX - npcCenterX) ** 2 + (playerCenterY - npcCenterY) ** 2);
            
            // 檢查點擊是否在NPC範圍內（擴大檢測範圍，確保點擊檢測可靠）
            // 使用NPC的完整碰撞區域進行檢測
            const clickOnNPC = worldX >= npc.x && worldX <= npc.x + npc.width &&
                              worldY >= npc.y && worldY <= npc.y + npc.height;
            
            if (clickOnNPC) {
              player.npcTarget = npc;
              if (distToNPC <= 55) {
                showDialogue(npc);
                player.movingToNPC = false;
                player.targetX = null;
                player.npcTarget = null;
              } else {
                player.movingToNPC = true;
                // 計算目標位置（距離NPC 45，確保到達後一定在50以內）
                const dx = npcCenterX - playerCenterX;
                const dy = npcCenterY - playerCenterY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const targetDist = 45; // 改為45，確保到達後一定在50以內
                const targetX = npcCenterX - (dx / dist) * targetDist - PLAYER_W / 2;
                const targetY = npcCenterY - (dy / dist) * targetDist - PLAYER_H / 2;
                player.targetX = targetX;
                player.targetY = targetY;
              }
              try { e.preventDefault(); e.stopPropagation(); } catch(_) {}
              return;
            }
          }
          
          // 普通點擊移動（不清除npcTarget，讓持續檢查邏輯可以工作）
          player.targetX = worldX - PLAYER_W / 2;
          player.targetY = worldY - PLAYER_H / 2;
          player.movingToNPC = false;
          // 不清除 player.npcTarget，讓持續檢查邏輯可以工作
          try { e.preventDefault(); e.stopPropagation(); } catch(_) {}
        } catch(_){}
      };
      ctx.events.on(canvas, 'click', onCanvasClick, { capture: true });
      this._onCanvasClick = onCanvasClick;

      // 滑鼠移動檢測（用於 NPC 懸停效果，將滑鼠變成雪碧圖）
      let cursorSpriteEl = null;
      let npcHovering = false; // 追蹤是否在NPC上
      const onCanvasMouseMove = (e) => {
        try {
          // 對話期間不顯示雪碧圖游標，維持正常 / 禁止游標邏輯
          if (player.inDialogue) {
            npcHovering = false;
            if (cursorSpriteEl) {
              cursorSpriteEl.style.display = 'none';
            }
            canvas.style.cursor = '';
            return;
          }

          if (MapSystem.current !== 'outdoor') {
            // 不在戶外地圖時，隱藏滑鼠雪碧圖
            if (cursorSpriteEl) {
              cursorSpriteEl.style.display = 'none';
            }
            return;
          }
          
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const x = ((e.clientX != null ? e.clientX : e.pageX) - rect.left) * scaleX;
          const y = ((e.clientY != null ? e.clientY : e.pageY) - rect.top) * scaleY;
          const cam = getCameraOffset();
          const worldX = x + cam.x;
          const worldY = y + cam.y;
          
          // 檢查滑鼠是否在 NPC 上（使用整個 NPC 區域，不是碰撞區域）
          let npc = MapSystem.entities.find(e => e.type === 'npc');
          if (npc) {
            // 使用整個 NPC 的邊界進行檢測，而不是碰撞區域
            const isHovering = worldX >= npc.x && worldX <= npc.x + npc.width &&
                              worldY >= npc.y && worldY <= npc.y + npc.height;
            
            if (isHovering) {
              npcHovering = true;
              // 載入雪碧圖（如果還沒載入）
              if (!npc.spriteSheet) {
                const spriteImg = getImage('npc_sprite');
                if (spriteImg) {
                  npc.spriteSheet = spriteImg;
                }
              }
              
              // 創建或獲取跟隨滑鼠的雪碧圖元素
              if (!cursorSpriteEl) {
                const viewport = document.getElementById('viewport');
                if (viewport) {
                  cursorSpriteEl = document.createElement('div');
                  cursorSpriteEl.id = 'main-cursor-sprite';
                  cursorSpriteEl.style.position = 'fixed';
                  cursorSpriteEl.style.pointerEvents = 'none';
                  cursorSpriteEl.style.imageRendering = 'pixelated';
                  cursorSpriteEl.style.zIndex = '99999'; // 確保在最上層
                  viewport.appendChild(cursorSpriteEl);
                }
              }
              
              // 如果雪碧圖已載入，顯示在滑鼠位置（使用當前動畫幀）
              if (cursorSpriteEl && npc.spriteSheet && npc.spriteSheet.complete) {
                const spriteW = 32;
                const spriteH = 32;
                const spriteCol = npc.spriteFrame % 8; // 0-7（循環）
                const spriteSrcX = spriteCol * 32; // 每幀32像素寬
                const spriteSrcY = 0; // 只有1行，所以Y始終為0
                
                // 使用滑鼠的螢幕座標（clientX, clientY）
                cursorSpriteEl.style.backgroundImage = `url(${npc.spriteSheet.src})`;
                cursorSpriteEl.style.backgroundPosition = `-${spriteSrcX}px -${spriteSrcY}px`;
                cursorSpriteEl.style.backgroundSize = '256px 32px'; // 總大小：8列*32 = 256，高度32
                cursorSpriteEl.style.left = (e.clientX || e.pageX) + 'px';
                cursorSpriteEl.style.top = (e.clientY || e.pageY) + 'px';
                cursorSpriteEl.style.width = spriteW + 'px';
                cursorSpriteEl.style.height = spriteH + 'px';
                cursorSpriteEl.style.display = '';
                
                // 隱藏原始滑鼠游標
                canvas.style.cursor = 'none';
              }
            } else {
              npcHovering = false;
              // 不在 NPC 上，隱藏雪碧圖並恢復滑鼠游標
              if (cursorSpriteEl) {
                cursorSpriteEl.style.display = 'none';
              }
              canvas.style.cursor = '';
            }
          }
        } catch(_) {}
      };
      ctx.events.on(canvas, 'mousemove', onCanvasMouseMove, { capture: true });
      this._onCanvasMouseMove = onCanvasMouseMove;

      // 鏡頭系統
      function getCameraOffset() {
        let camX, camY;
        if (MapSystem.current === 'outdoor' || MapSystem.current === 'indoor_home') {
          camX = player.x - 1280/2 + PLAYER_W/2;
          camY = player.y - 720/2 + PLAYER_H/2;
          let limitW = (MapSystem.current === 'outdoor') ? MAP_W : MapSystem.width * TILE;
          let limitH = (MapSystem.current === 'outdoor') ? MAP_H : MapSystem.height * TILE;
          camX = Math.max(0, Math.min(camX, limitW - 1280));
          camY = Math.max(0, Math.min(camY, limitH - 720));
        } else {
          camX = - (1280 - MapSystem.width*TILE) / 2;
          camY = - (720 - MapSystem.height*TILE) / 2;
        }
        return {x: camX, y: camY};
      }

      // 碰撞檢測
      function rectIntersect(r1, r2) {
        return !(r2.x > r1.x + r1.w || r2.x + r2.w < r1.x || r2.y > r1.y + r1.h || r2.y + r2.h < r1.y);
      }

      // 更新循環
      let lastFrameTime = 0;
      const SPRITE_FRAME_INTERVAL = 100; // 每100毫秒切換一幀
      function update() {
        // 更新雪碧圖動畫幀（如果NPC存在且滑鼠在NPC上）
        let npc = MapSystem.entities.find(e => e.type === 'npc');
        if (npc && npc.spriteSheet && npc.spriteSheet.complete) {
          const now = Date.now();
          if (now - lastFrameTime >= SPRITE_FRAME_INTERVAL) {
            npc.spriteFrame = (npc.spriteFrame + 1) % 8; // 循環播放 0-7
            lastFrameTime = now;
            
            // 如果滑鼠在NPC上，更新滑鼠雪碧圖的顯示
            if (npcHovering) {
              const cursorSpriteEl = document.getElementById('main-cursor-sprite');
              if (cursorSpriteEl && cursorSpriteEl.style.display !== 'none') {
                const spriteCol = npc.spriteFrame % 8; // 0-7（循環）
                const spriteSrcX = spriteCol * 32; // 每幀32像素寬
                cursorSpriteEl.style.backgroundPosition = `-${spriteSrcX}px 0px`;
              }
            }
          }
        }
        
        let nx = player.x;
        let ny = player.y;
        let moving = false;
        let moveX = 0;
        let moveY = 0;

        // 計算移動方向（參考生存模式）
        if (keys['a'] || keys['ArrowLeft']) { moveX -= 1; }
        if (keys['d'] || keys['ArrowRight']) { moveX += 1; }
        if (keys['w'] || keys['ArrowUp']) { moveY -= 1; }
        if (keys['s'] || keys['ArrowDown']) { moveY += 1; }

        // 正規化移動方向
        if (moveX !== 0 || moveY !== 0) {
          const len = Math.sqrt(moveX * moveX + moveY * moveY) || 1;
          moveX /= len;
          moveY /= len;
          nx += moveX * player.speed;
          ny += moveY * player.speed;
          moving = true;
          
          // 根據鍵盤移動方向更新面向（參考生存模式：優先水平方向）
          if (Math.abs(moveX) > 0.1) {
            player.facingRight = moveX > 0;
          }
        }

        if (!moving && player.targetX !== null) {
          const dx = player.targetX - player.x;
          const dy = player.targetY - player.y;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (dist <= player.speed) {
            nx = player.targetX;
            ny = player.targetY;
            player.targetX = null;
            
            // 如果正在移動到NPC，檢查距離並顯示對話框
            if (player.movingToNPC && player.npcTarget) {
              const npc = player.npcTarget;
              const npcCenterX = npc.x + npc.width / 2;
              const npcCenterY = npc.y + npc.height / 2;
              const playerCenterX = nx + player.width / 2;
              const playerCenterY = ny + player.height / 2;
              const distToNPC = Math.sqrt((playerCenterX - npcCenterX) ** 2 + (playerCenterY - npcCenterY) ** 2);
              
              // 使用55作為容錯範圍，避免邊界問題（例如50.79這種情況）
              if (distToNPC <= 55) {
                showDialogue(npc);
                player.movingToNPC = false;
                player.npcTarget = null;
              }
            } else {
              player.movingToNPC = false;
              player.npcTarget = null;
            }
          } else {
            // 移動過程中持續檢查距離（修復某些角度無法觸發的問題）
            if (player.movingToNPC && player.npcTarget) {
              const npc = player.npcTarget;
              const npcCenterX = npc.x + npc.width / 2;
              const npcCenterY = npc.y + npc.height / 2;
              const playerCenterX = nx + player.width / 2;
              const playerCenterY = ny + player.height / 2;
              const distToNPC = Math.sqrt((playerCenterX - npcCenterX) ** 2 + (playerCenterY - npcCenterY) ** 2);
              
              // 使用55作為容錯範圍，避免邊界問題
              if (distToNPC <= 55) {
                player.targetX = null;
                player.movingToNPC = false;
                player.npcTarget = null;
                showDialogue(npc);
                return; // 不更新位置，直接顯示對話框
              }
            }
            
            nx += (dx / dist) * player.speed;
            ny += (dy / dist) * player.speed;
            moving = true;
            // 根據點擊移動方向更新面向（參考生存模式）
            if (Math.abs(dx) > 0.1) {
              player.facingRight = dx > 0;
            }
          }
        }

        // 如果正在對話中，不允許移動
        if (player.inDialogue) {
          return;
        }
        
        // 移除自動觸發邏輯，改為只在點擊NPC或移動到NPC目標時才觸發對話
        // 這樣可以避免邏輯衝突和重複觸發問題（特別是關閉對話框後立即再次觸發）
        // 對話觸發現在只在以下情況發生：
        // 1. 點擊NPC時（onCanvasClick）
        // 2. 移動到NPC目標位置時（update中的movingToNPC檢查）
        // 不再有持續的自動檢查，避免邏輯衝突
        
        if (!moving && player.targetX === null) return;

        // 碰撞矩形（參考 rpg_map.html）
        // 使用固定的碰撞矩形，不因角色或方向改變
        // 注意：player.x 是角色的左上角參考點，碰撞矩形相對於此點計算
        let pRect = { x: nx + 10, y: ny + 40, w: 28, h: 20 }; 
        let hit = false;

        // 檢查物件
        for (let obj of MapSystem.entities) {
          // 優先檢查門 (互動)
          if (obj.door && rectIntersect(pRect, obj.door)) {
            player.lastDoor = obj.door;
            MapSystem.load(obj.door.target);
            
            // 進入室內時，玩家位置更接近門（縮短距離）
            // 原本是 (MapSystem.height - 3) * TILE，現在改為 (MapSystem.height - 2.5) * TILE，讓玩家更接近門
            player.x = (MapSystem.width * TILE) / 2 - PLAYER_W / 2;
            player.y = (MapSystem.height - 2.5) * TILE; 
            player.targetX = null;
            
            player.canExit = false;
            setTimeout(() => player.canExit = true, 500);
            return;
          }
          // 檢查實體碰撞
          if (obj.solid && rectIntersect(pRect, obj.getBounds())) hit = true;
        }

        // 檢查網格
        let gx = Math.floor((nx + PLAYER_W/2) / TILE);
        let gy = Math.floor((ny + PLAYER_H) / TILE);
        
        if (gx>=0 && gx<MapSystem.width && gy>=0 && gy<MapSystem.height) {
          let tile = MapSystem.data[gy][gx];
          if (tile === T_WALL) hit = true;
          
          // 檢查橫向間隔牆的下半部碰撞延伸
          // 如果玩家腳下是地板，檢查上方是否有橫向牆，且玩家腳下位置在牆的下半部範圍內
          if (!hit && tile === T_FLOOR && gy >= 1) {
            const checkY = gy - 1; // 檢查上方格子
            const checkTile = MapSystem.data[checkY][gx];
            const checkMaterial = MapSystem.materialData && MapSystem.materialData[checkY] && MapSystem.materialData[checkY][gx] 
              ? MapSystem.materialData[checkY][gx] 
              : null;
            
            // 檢查是否是牆（wall_gray 或 wall_wood）
            if (checkTile === T_WALL && (checkMaterial === 'wall_gray' || checkMaterial === 'wall_wood')) {
              // 檢查是否為橫向牆：左右是牆或地板
              const leftTile = gx > 0 ? MapSystem.data[checkY][gx - 1] : T_WALL;
              const rightTile = gx < MapSystem.width - 1 ? MapSystem.data[checkY][gx + 1] : T_WALL;
              const isHorizontal = (leftTile === T_WALL || leftTile === T_FLOOR) && 
                                   (rightTile === T_WALL || rightTile === T_FLOOR);
              
              if (isHorizontal) {
                // 計算玩家腳下位置和牆的下半部範圍
                const playerBottomY = ny + PLAYER_H;
                const wallTopY = checkY * TILE;
                const wallBottomY = wallTopY + TILE;
                const wallLowerHalfStart = wallTopY + TILE * 0.5; // 牆的下半部開始位置（牆的中間）
                const wallLowerHalfEnd = wallBottomY + TILE * 0.3; // 牆的下半部延伸範圍（稍微超出牆底部）
                
                // 如果玩家腳下位置在牆的下半部延伸範圍內，觸發碰撞
                // 這樣可以防止玩家從下方穿過，但留一點自然空間
                if (playerBottomY >= wallLowerHalfStart && playerBottomY <= wallLowerHalfEnd) {
                  hit = true;
                }
              }
            }
          }
          
          if (tile === T_EXIT && player.canExit) {
            if (player.lastDoor) {
              MapSystem.load('outdoor');
              player.x = player.lastDoor.returnX;
              player.y = player.lastDoor.returnY;
            } else {
              MapSystem.load('outdoor');
              player.x = CENTER_X; player.y = CENTER_Y;
            }
            player.targetX = null;
            return;
          }
        } else {
          hit = true;
        }

        if (!hit) { 
          player.x = nx; 
          player.y = ny; 
        } else {
          player.targetX = null;
        }
      }

      // ========== 建材紋路繪製函數（僅實現 JSON 中使用的建材）==========
      // JSON 中實際使用的建材：wall_gray, floor_brown, wall_wood, tile_white
      
      // 繪製地板建材
      function drawMaterialTile(ctx, materialId, x, y, size) {
        if (materialId === 'tile_white') {
          // 白色磁磚（帶磁磚線條）- 完全按照工具的 drawTilePattern
          const tileSize = size / 2;
          const colors = {
            white: { main: '#FFFFFF', line: '#E0E0E0' }
          };
          const c = colors.white;
          
          // 單色磁磚帶線條
          ctx.fillStyle = c.main;
          ctx.fillRect(x, y, size, size);
          ctx.strokeStyle = c.line;
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, size, size);
          // 內部線條
          ctx.beginPath();
          ctx.moveTo(x + tileSize, y);
          ctx.lineTo(x + tileSize, y + size);
          ctx.moveTo(x, y + tileSize);
          ctx.lineTo(x + size, y + tileSize);
          ctx.stroke();
        } else {
          // 預設：floor_brown（咖啡色地板）
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(x, y, size, size);
          ctx.strokeStyle = '#6a4015';
          ctx.strokeRect(x, y, size, size);
        }
      }
      
      // 繪製牆面建材
      function drawMaterialWall(ctx, materialId, x, y, size) {
        if (materialId === 'wall_wood') {
          // 木牆（使用 drawWoodPattern，但沒有 variant，所以用 oak）
          // 工具中 wall_wood 的 type 是 'wood'，會調用 drawWoodPattern
          const colors = {
            oak: { base: '#D2B48C', line: '#8B7355', highlight: '#E6D3B3' }
          };
          const c = colors.oak;
          
          // 基礎色
          ctx.fillStyle = c.base;
          ctx.fillRect(x, y, size, size);
          
          // 木紋線條（使用基於座標的偽隨機數，避免抖動）
          ctx.strokeStyle = c.line;
          ctx.lineWidth = 1;
          for (let i = 0; i < 3; i++) {
            const offset = (i - 1) * (size / 3);
            // 使用基於座標的偽隨機數生成器，確保每個格子的木紋位置固定
            const seed = (x * 73856093) ^ (y * 19349663) ^ (i * 83492791);
            const random = ((seed & 0x7FFFFFFF) / 0x7FFFFFFF) * 2 - 1; // -1 到 1
            ctx.beginPath();
            ctx.moveTo(x, y + size/2 + offset);
            ctx.quadraticCurveTo(x + size/2, y + size/2 + offset + random, x + size, y + size/2 + offset);
            ctx.stroke();
          }
          
          // 高光
          ctx.fillStyle = c.highlight;
          ctx.fillRect(x, y, size, size * 0.1);
        } else {
          // 預設：wall_gray（灰色牆）
          ctx.fillStyle = '#555';
          ctx.fillRect(x, y, size, size);
        }
      }
      
      // 繪製循環
      function draw() {
        ctx2d.fillStyle = "#000"; 
        ctx2d.fillRect(0,0,canvas.width, canvas.height);

        const cam = getCameraOffset();
        const camX = cam.x;
        const camY = cam.y;

        // Layer 0: 背景
        if (MapSystem.current === 'outdoor') {
          const bgImg = getImage('main_bg');
          if (bgImg && bgImg.complete && bgImg.naturalWidth !== 0) {
            for(let r=0; r<3; r++) {
              for(let c=0; c<3; c++) {
                let bgX = c * 1280 - camX;
                let bgY = r * 720 - camY;
                if (bgX + 1280 > 0 && bgX < 1280 && bgY + 720 > 0 && bgY < 720) {
                  ctx2d.drawImage(bgImg, bgX, bgY, 1280, 720);
                }
              }
            }
          } else {
            ctx2d.fillStyle = '#2d5a27'; 
            ctx2d.fillRect(0,0,1280, 720);
          }
        } else {
          ctx2d.fillStyle = '#111'; 
          ctx2d.fillRect(0,0,1280, 720);
        }

        // Layer 1: 地形
        let startCol = Math.floor(camX / TILE);
        let startRow = Math.floor(camY / TILE);
        let cDraw = Math.ceil(1280 / TILE) + 1;
        let rDraw = Math.ceil(720 / TILE) + 1;

        for (let y = startRow; y < startRow + rDraw; y++) {
          for (let x = startCol; x < startCol + cDraw; x++) {
            if (y>=0 && y<MapSystem.height && x>=0 && x<MapSystem.width) {
              let t = MapSystem.data[y][x];
              let px = Math.floor(x*TILE - camX);
              let py = Math.floor(y*TILE - camY);

              // 取得原始建材 ID（如果有的話）
              const materialId = MapSystem.materialData && MapSystem.materialData[y] && MapSystem.materialData[y][x] 
                ? MapSystem.materialData[y][x] 
                : null;
              
              if (t === T_PATH) {
                ctx2d.fillStyle = '#eecfa1'; 
                ctx2d.fillRect(px,py,TILE+1,TILE+1);
              } else if (t === T_FLOOR) {
                // 使用高品質建材紋路繪製
                drawMaterialTile(ctx2d, materialId, px, py, TILE);
              } else if (t === T_WALL) {
                // 使用高品質建材紋路繪製
                drawMaterialWall(ctx2d, materialId, px, py, TILE);
              } else if (t === T_EXIT) {
                ctx2d.fillStyle = '#5d3a1a'; 
                ctx2d.fillRect(px,py,TILE+1,TILE+1);
              }
            }
          }
        }

        // 目標點提示
        if (player.targetX !== null) {
          ctx2d.strokeStyle = "rgba(255, 255, 255, 0.5)";
          ctx2d.lineWidth = 2;
          ctx2d.beginPath();
          let tx = player.targetX + PLAYER_W/2 - camX;
          let ty = player.targetY + PLAYER_H/2 - camY;
          ctx2d.arc(tx, ty, 10, 0, Math.PI*2);
          ctx2d.stroke();
        }

        // Layer 2: 物件 (排序，完全按照 rpg_map.html 的邏輯：按 y + height 排序)
        // 注意：必須使用實際渲染高度，而不是固定的 PLAYER_H
        // 計算玩家的實際渲染高度（考慮角色縮放）
        const sc = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
        let playerActualHeight = PLAYER_H;
        if (sc && (sc.id === 'dada' || sc.spriteImageKey === 'player2')) {
          // player2 縮小到 85%
          playerActualHeight = Math.floor(PLAYER_H * 0.85);
        }
        
        // 完全按照 rpg_map.html 的簡單排序邏輯
        let list = [...MapSystem.entities, { type:'player', x:player.x, y:player.y, width:PLAYER_W, height:playerActualHeight }];
        list.sort((a,b) => (a.y + a.height) - (b.y + b.height));
        let playerLayerIndex = 0;
        for (let i = 0; i < list.length; i++) {
          if (list[i].type === 'player') {
            playerLayerIndex = i;
            break;
          }
        }

        // 繪製玩家函數（使用 MainGifOverlay）
        function drawPlayer() {
          const px = Math.round(player.x - camX);
          const py = Math.round(player.y - camY);
          
          if (px+PLAYER_W<0 || px>1280 || py+PLAYER_H<0 || py>720) return;

          // 動態獲取玩家圖片（支援 player2 方向切換）
          const currentPlayerImg = getPlayerImage();
          
          if (currentPlayerImg && currentPlayerImg.complete) {
            const sc = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
            let renderWidth = PLAYER_W;
            let renderHeight = PLAYER_H;
            
            // 特殊處理不同角色的寬高比
            if (sc && (sc.id === 'rokurost' || sc.spriteImageKey === 'player4')) {
              // player4.png 保持寬高比 (500:627)
              const imgWidth = currentPlayerImg.naturalWidth || currentPlayerImg.width || 500;
              const imgHeight = currentPlayerImg.naturalHeight || currentPlayerImg.height || 627;
              const aspectRatio = imgWidth / imgHeight;
              renderHeight = PLAYER_H;
              renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
            } else if (sc && (sc.id === 'lilylinglan' || sc.spriteImageKey === 'player3')) {
              // player3.gif 保持原比例 (1:1)
              const imgWidth = currentPlayerImg.naturalWidth || currentPlayerImg.width || 320;
              const imgHeight = currentPlayerImg.naturalHeight || currentPlayerImg.height || 320;
              const aspectRatio = imgWidth / imgHeight;
              renderHeight = PLAYER_H;
              renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
            } else if ((sc && (sc.id === 'margaret' || sc.spriteImageKey === 'player')) || (!sc || /player\.gif$/i.test(currentPlayerImg.src || ''))) {
              // player.gif 保持原比例 (1:1)
              const imgWidth = currentPlayerImg.naturalWidth || currentPlayerImg.width || 320;
              const imgHeight = currentPlayerImg.naturalHeight || currentPlayerImg.height || 320;
              const aspectRatio = imgWidth / imgHeight;
              renderHeight = PLAYER_H;
              renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
            } else if (sc && (sc.id === 'dada' || sc.spriteImageKey === 'player2')) {
              // player2.png / player2-1.png 保持原比例（參考生存模式：290x242）
              // 主線模式：縮小一點體型（約 85%）
              const imgWidth = currentPlayerImg.naturalWidth || currentPlayerImg.width || 290;
              const imgHeight = currentPlayerImg.naturalHeight || currentPlayerImg.height || 242;
              const aspectRatio = imgWidth / imgHeight;
              renderHeight = Math.floor(PLAYER_H * 0.85); // 縮小到 85%
              renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
            }
            
            // 使用 MainGifOverlay 顯示（支援 GIF 動畫）
            // 注意：player.x 是角色的左上角參考點
            // 為了確保碰撞檢測一致，player2 需要根據實際渲染寬度調整位置
            let renderX = player.x - camX;
            let renderY = player.y - camY;
            
            // player2 特殊處理：如果渲染寬度與 PLAYER_W 不同，需要調整位置以保持碰撞檢測一致
            if (sc && (sc.id === 'dada' || sc.spriteImageKey === 'player2')) {
              // player2 縮小後，渲染寬度可能與 PLAYER_W 不同
              // 為了保持碰撞檢測一致，需要調整渲染位置
              // 確保角色的視覺中心對齊 player.x + PLAYER_W/2
              const centerOffset = (PLAYER_W - renderWidth) / 2;
              renderX = player.x - camX + centerOffset;
            }
            
            if (typeof window.MainGifOverlay !== 'undefined' && typeof window.MainGifOverlay.showOrUpdate === 'function') {
              // 動態計算玩家的 z-index：在碰撞區前方
              // 使用玩家的完整碰撞矩形進行檢測，而不是只檢查中心點
              const playerColRect = { x: player.x + 10, y: player.y + 40, w: 28, h: 20 };
              let playerZIndex = 6; // 預設在碰撞區前方
              
              // 檢查玩家碰撞矩形是否與任何樹的碰撞區重疊
              for (let tree of MapSystem.entities) {
                if (tree.type === 'tree' && tree.col) {
                  const treeColRect = {
                    x: tree.x + tree.col.x,
                    y: tree.y + tree.col.y,
                    w: tree.col.w,
                    h: tree.col.h
                  };
                  // 使用矩形相交檢測
                  if (rectIntersect(playerColRect, treeColRect)) {
                    playerZIndex = 7; // 玩家在樹的碰撞區前方
                    break;
                  }
                }
              }
              
              // 檢查玩家碰撞矩形是否與任何房子的碰撞區重疊
              for (let house of MapSystem.entities) {
                if ((house.type === 'home' || house.type === 'img_house') && house.col) {
                  const houseColRect = {
                    x: house.x + house.col.x,
                    y: house.y + house.col.y,
                    w: house.col.w,
                    h: house.col.h
                  };
                  // 使用矩形相交檢測
                  if (rectIntersect(playerColRect, houseColRect)) {
                    playerZIndex = 7; // 玩家在房子的碰撞區前方
                    break;
                  }
                }
              }
              
              // 使用動態 z-index
              window.MainGifOverlay.showOrUpdate('main-player', currentPlayerImg.src, renderX, renderY, { width: renderWidth, height: renderHeight }, { layerId: 'player', dynamicZIndex: playerZIndex });
              } else {
              // 後備：Canvas 繪製（GIF 不會動）
              const adjustedPx = sc && (sc.id === 'dada' || sc.spriteImageKey === 'player2') 
                ? Math.round(px + (PLAYER_W - renderWidth) / 2)
                : px;
              ctx2d.drawImage(currentPlayerImg, adjustedPx, py, renderWidth, renderHeight);
              }
            } else {
            // 後備方塊人
            ctx2d.fillStyle = '#3498db'; 
            ctx2d.fillRect(px, py, PLAYER_W, PLAYER_H);
            ctx2d.fillStyle = '#f1c40f'; 
            ctx2d.fillRect(px + 4, py + 4, PLAYER_W - 8, 20);
          ctx2d.fillStyle = '#000';
            ctx2d.fillRect(px + 10, py + 10, 4, 4);
            ctx2d.fillRect(px + PLAYER_W - 14, py + 10, 4, 4);
          }
        }

        // 完全按照 rpg_map.html 的 canvas 繪製邏輯：
        // 1. 按 y + height 排序（已完成）
        // 2. 按順序分配 z-index，後繪製的（y + height 更大的）z-index 更高
        // 3. 不再使用碰撞檢測來動態調整 z-index，完全依賴排序順序
        
        // 計算玩家的碰撞矩形（僅用於精確的碰撞檢測，不用於圖層）
        const playerColRect = { x: player.x + 10, y: player.y + 40, w: 28, h: 20 };
        
        // 使用 DOM 元素渲染所有實體（包括玩家、樹木、房子），完全按照排序順序
        // z-index 基於排序順序：排序越後面的（y + height 越大），z-index 越高
        for (let i = 0; i < list.length; i++) {
          let obj = list[i];
          let px = Math.round(obj.x - camX);
          let py = Math.round(obj.y - camY);
          
          if (px+obj.width<0 || px>1280 || py+obj.height<0 || py>720) {
            // 不在視野內，隱藏對應的 DOM 元素
            if (obj.type === 'player') {
              if (typeof window.MainGifOverlay !== 'undefined') {
                window.MainGifOverlay.hide('main-player');
              }
            } else if (obj.type === 'tree') {
              if (typeof window.MainGifOverlay !== 'undefined' && obj.domId) {
                window.MainGifOverlay.hide(obj.domId);
              }
            } else if (obj.type === 'home') {
              if (typeof window.MainGifOverlay !== 'undefined') {
                window.MainGifOverlay.hide('main-home');
              }
            } else if (obj.type === 'img_house') {
              if (typeof window.MainGifOverlay !== 'undefined' && obj.domId) {
                window.MainGifOverlay.hide(obj.domId);
              }
            }
            continue;
          }

          // 根據排序順序分配 z-index（完全模擬 canvas 的繪製順序）
          // 排序越後面的（i 越大），z-index 越高
          // 使用 100 + i 確保有足夠的間隔，且不會與 UI（z-index 10）衝突
          const baseZIndex = 100 + i;

          if (obj.type === 'player') {
            // 玩家使用 MainGifOverlay 顯示（支援 GIF 動畫）
            drawPlayer();
            // 確保玩家的 z-index 正確（完全按照排序順序）
            if (typeof window.MainGifOverlay !== 'undefined') {
              const playerEl = document.getElementById('main-gif-overlay-main-player');
              if (playerEl) {
                playerEl.style.zIndex = String(baseZIndex);
              }
            }
          } else if (obj.type === 'home') {
            // 主屋使用 DOM 元素顯示
            const homeImg = getImage('main_home');
            if (homeImg && homeImg.complete && typeof window.MainGifOverlay !== 'undefined') {
              window.MainGifOverlay.showOrUpdate('main-home', homeImg, px, py, { width: obj.width, height: obj.height }, { layerId: obj.layerId || 'home-main', dynamicZIndex: baseZIndex });
            }
          } else if (obj.type === 'tree') {
            // 樹木使用 DOM 元素顯示
            if (obj.img && obj.img.complete && typeof window.MainGifOverlay !== 'undefined') {
              // 為每棵樹生成唯一的 domId（如果還沒有）
              if (!obj.domId) {
                obj.domId = 'main-tree-' + MapSystem.entities.indexOf(obj);
              }
              window.MainGifOverlay.showOrUpdate(obj.domId, obj.img, px, py, { width: TREE_W, height: TREE_H }, { layerId: obj.layerId || 'default', dynamicZIndex: baseZIndex });
            }
          } else if (obj.type === 'img_house') {
            // NPC 房子使用 DOM 元素顯示
            if (obj.img && obj.img.complete && typeof window.MainGifOverlay !== 'undefined') {
              // 為每個房子生成唯一的 domId（如果還沒有）
              if (!obj.domId) {
                obj.domId = 'main-house-' + MapSystem.entities.indexOf(obj);
              }
              window.MainGifOverlay.showOrUpdate(obj.domId, obj.img, px, py, { width: obj.width, height: obj.height }, { layerId: obj.layerId || 'default', dynamicZIndex: baseZIndex });
            }
          } else if (obj.type === 'npc') {
            // NPC 使用 GIF 動態圖顯示（通過 MainGifOverlay 處理）
            if (typeof window.MainGifOverlay !== 'undefined') {
              // 使用 getImage 載入 NPC.gif，然後傳給 MainGifOverlay
              const npcGifImg = getImage('npc_gif');
              if (npcGifImg) {
                window.MainGifOverlay.showOrUpdate(obj.domId, npcGifImg, px, py, { width: obj.width, height: obj.height }, { layerId: obj.layerId || 'npc', dynamicZIndex: baseZIndex });
              }
            }
          } else if (obj.type === 'furniture') {
            // 主屋室內家具：使用 DOM 疊加與 z-index（與戶外樹木 / 房子類似的圖層邏輯）
            const img = getImage(obj.imageKey);
            if (img && img.complete && typeof window.MainGifOverlay !== 'undefined') {
              if (!obj.domId) {
                obj.domId = 'main-furniture-' + MapSystem.entities.indexOf(obj);
              }
              window.MainGifOverlay.showOrUpdate(
                obj.domId,
                img,
                px,
                py,
                { width: obj.width, height: obj.height },
                { layerId: obj.layerId || 'furniture', dynamicZIndex: baseZIndex }
              );
            }
          }
        }
      }

      // 初始化地圖
      MapSystem.load('outdoor');

      // 主循環
      let rafId = null;
      function loop(){ 
        update(); 
        draw(); 
        rafId = requestAnimationFrame(loop); 
      }
      loop();

      // 儲存 cleanup 入口
      this._cleanup = () => {
        if (rafId) cancelAnimationFrame(rafId); rafId = null;
        try { if (window.MainGifOverlay && typeof window.MainGifOverlay.hide === 'function') window.MainGifOverlay.hide('main-player'); } catch(_) {}
        try { if (window.MainGifOverlay && typeof window.MainGifOverlay.clearAll === 'function') window.MainGifOverlay.clearAll(); } catch(_) {}
        try { if (mainUIEl && mainUIEl.parentNode) mainUIEl.parentNode.removeChild(mainUIEl); } catch(_) {}
        try { if (mainMenuEl && mainMenuEl.parentNode) mainMenuEl.parentNode.removeChild(mainMenuEl); } catch(_) {}
        // 清理滑鼠雪碧圖元素
        try {
          const cursorSpriteEl = document.getElementById('main-cursor-sprite');
          if (cursorSpriteEl && cursorSpriteEl.parentNode) {
            cursorSpriteEl.parentNode.removeChild(cursorSpriteEl);
          }
          // 恢復滑鼠游標
          const canvas = document.getElementById('game-canvas');
          if (canvas) {
            canvas.style.cursor = '';
          }
        } catch(_) {}
        mainUIEl = null;
        mainMenuEl = null;
      };
    },
    exit(ctx){
      try { if (typeof this._cleanup === 'function') this._cleanup(); } catch(_){}
      // 恢復 HUD 顯示（若離開主線模式返回生存）
      try { const gameUI = document.getElementById('game-ui'); if (gameUI) gameUI.style.display = ''; } catch(_){}
      // 解除主線模式的 canvas 點擊捕獲，避免影響生存模式輸入
      try {
        const canvas = document.getElementById('game-canvas');
        if (canvas && typeof this._onCanvasClick === 'function') {
          canvas.removeEventListener('click', this._onCanvasClick, { capture: true });
          this._onCanvasClick = null;
        }
        if (canvas && typeof this._onCanvasMouseMove === 'function') {
          canvas.removeEventListener('mousemove', this._onCanvasMouseMove, { capture: true });
          this._onCanvasMouseMove = null;
        }
        // 清理滑鼠雪碧圖元素
        const cursorSpriteEl = document.getElementById('main-cursor-sprite');
        if (cursorSpriteEl && cursorSpriteEl.parentNode) {
          cursorSpriteEl.parentNode.removeChild(cursorSpriteEl);
        }
        // 恢復滑鼠游標
        if (canvas) {
          canvas.style.cursor = '';
        }
      } catch(_){}
    }
  };

  // 優先註冊到隔離化 GameModeManager；若不可用則回退到舊 ModeManager
  if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.register === 'function') {
    window.GameModeManager.register(MODE_ID, MainMode);
  } else if (typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.register === 'function') {
    window.ModeManager.register(MODE_ID, MainMode);
  } else {
    console.warn('[MainMode] 找不到可用的模式管理器，無法註冊主線模式');
  }
})();
