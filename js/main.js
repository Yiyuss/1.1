// 遊戲主入口
document.addEventListener('DOMContentLoaded', function() {
    // 開始按鈕
    const startButton = document.getElementById('start-button');
    startButton.addEventListener('click', function() {
        AudioManager.playSound && AudioManager.playSound('button_click');
        // 在選單/選角階段使用主選單音樂
        if (AudioManager.playMusic) {
            // 確保選單介面不靜音
            AudioManager.isMuted = false;
            AudioManager.playMusic('menu_music');
        }
        // 進入選角介面而非直接開始
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('character-select-screen').classList.remove('hidden');
    });

    // 音量設置
    const musicSlider = document.getElementById('music-volume');
    const soundSlider = document.getElementById('sound-volume');
    const musicText = document.getElementById('music-volume-text');
    const soundText = document.getElementById('sound-volume-text');
    const muteToggle = document.getElementById('mute-toggle');
    const muteStatus = document.getElementById('mute-status');

    if (musicSlider && soundSlider) {
        const updateLabels = () => {
            musicText.textContent = Math.round(musicSlider.value * 100) + '%';
            soundText.textContent = Math.round(soundSlider.value * 100) + '%';
        };
        updateLabels();
        musicSlider.addEventListener('input', () => {
            AudioManager.setMusicVolume && AudioManager.setMusicVolume(parseFloat(musicSlider.value));
            updateLabels();
        });
        soundSlider.addEventListener('input', () => {
            AudioManager.setSoundVolume && AudioManager.setSoundVolume(parseFloat(soundSlider.value));
            updateLabels();
        });
    }

    if (muteToggle) {
        muteToggle.addEventListener('click', () => {
            const muted = AudioManager.toggleMute ? AudioManager.toggleMute() : false;
            muteStatus.textContent = muted ? '開' : '關';
        });
    }
    
    // 影片結束事件改由 UI.showGameOverScreen / UI.showVictoryScreen 內管理，避免重複綁定與行為衝突
    
    // 創建預設的視頻文件
    createDefaultVideos();
    
    // 創建預設的圖片資源
    createDefaultImages();
    
    // 初始化音效系統
    AudioManager.init();
    
    // 初始化遊戲（但不開始）
    Game.init();
    // 預設暫停，但不靜音，以保留選單音樂與音效
    Game.pause(false);

    // 自動暫停與音效抑制（分頁切換/失焦）
    setupAutoPause();

    // 設定選角介面事件
    setupCharacterSelection();

    // 地圖與難度選擇事件
    setupMapAndDifficultySelection();

    // 設定視窗縮放（PC與手機皆可）
    setupResponsiveViewport();

    // 設定 ESC 技能頁面切換
    setupSkillsMenuToggle();

    // 新增：天賦介面切換事件
    setupTalentScreenToggle();

    // 天賦選取音效（點擊天賦卡片時）
    (function bindTalentClickSound(){
        const talentGrid = document.querySelector('#talent-select-screen .talent-grid');
        if (!talentGrid) return;
        const cards = talentGrid.querySelectorAll('.char-card.selectable');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                    AudioManager.playSound('button_click2');
                }
            });
        });
    })();
    
    // （如需主選單音樂，請於assets/audio添加menu_music.mp3後再啟用）
    // if (AudioManager.playMusic) AudioManager.playMusic('menu_music');
    
    console.log('遊戲已初始化，等待開始...');
});

// 創建預設視頻文件
function createDefaultVideos() {
    // 檢查視頻是否存在，如果不存在則使用預設視頻
    const gameOverVideo = document.getElementById('game-over-video');
    const victoryVideo = document.getElementById('victory-video');
    
    // 如果視頻源無效，使用預設視頻（這裡使用 base64 編碼的簡單視頻）
    gameOverVideo.onerror = function() {
        console.log('失敗視頻載入失敗，使用預設視頻');
        createDefaultVideo('game-over-video', '遊戲結束');
    };
    
    victoryVideo.onerror = function() {
        console.log('勝利視頻載入失敗，使用預設視頻');
        createDefaultVideo('victory-video', '勝利！');
    };
}

// 創建預設視頻
function createDefaultVideo(videoId, text) {
    const video = document.getElementById(videoId);
    
    // 創建一個 canvas 元素
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    
    // 繪製文字
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = videoId === 'game-over-video' ? '#f00' : '#0f0';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    // 將 canvas 轉換為 data URL
    const dataURL = canvas.toDataURL();
    
    // 創建一個 img 元素
    const img = document.createElement('img');
    img.src = dataURL;
    // 保留原有ID，讓UI可以找到此元素並綁定事件
    img.id = videoId;
    
    // 替換視頻元素
    video.parentNode.replaceChild(img, video);
    
    // 模擬視頻播放結束事件
    setTimeout(function() {
        const event = new Event('ended');
        img.dispatchEvent(event);
    }, 3000);
}

// 創建預設圖片資源
function createDefaultImages() {
    // 初始化遊戲圖片對象
    Game.images = {};
    
    // 定義需要加載的圖片
    const imagesToLoad = [
        { name: 'player', src: 'assets/images/player.png' },
        { name: 'player1-2', src: 'assets/images/player1-2.png' },
        { name: 'playerN', src: 'assets/images/playerN.png' },
        { name: 'zombie', src: 'assets/images/zombie.png' },
        { name: 'skeleton', src: 'assets/images/skeleton.png' },
        { name: 'ghost', src: 'assets/images/ghost.png' },
        { name: 'mini_boss', src: 'assets/images/mini_boss.png' },
        { name: 'boss', src: 'assets/images/boss.png' },
        { name: 'dagger', src: 'assets/images/dagger.png' },
        { name: 'fireball', src: 'assets/images/fireball.png' },
        { name: 'lightning', src: 'assets/images/lightning.png' },
        { name: 'exp_orb', src: 'assets/images/exp_orb.png' },
        { name: 'box', src: 'assets/images/BOX.png' },
        // 唱歌技能特效圖片（四張）
        { name: 'LA', src: 'assets/images/LA.png' },
        { name: 'LA2', src: 'assets/images/LA2.png' },
        { name: 'LA3', src: 'assets/images/LA3.png' },
        { name: 'LA4', src: 'assets/images/LA4.png' },
        // 障礙物素材
        { name: 'S1', src: 'assets/images/S1.png' },
        { name: 'S2', src: 'assets/images/S2.png' },
        { name: 'S3', src: 'assets/images/S3.png' },
        { name: 'S4', src: 'assets/images/S4.png' },
        { name: 'S5', src: 'assets/images/S5.png' },
        { name: 'S6', src: 'assets/images/S6.png' },
        { name: 'S7', src: 'assets/images/S7.png' },
        { name: 'S8', src: 'assets/images/S8.png' },
        // 背景素材（多地圖）
        { name: 'background', src: 'assets/images/background.jpg' },
        { name: 'background2', src: 'assets/images/background2.jpg' },
        { name: 'background3', src: 'assets/images/background3.jpg' }
    ];
    
    // 加載所有圖片
    let loadedCount = 0;
    
    imagesToLoad.forEach(img => {
        const image = new Image();
        image.src = img.src;
        
        // 圖片加載成功
        image.onload = function() {
            Game.images[img.name] = image;
            loadedCount++;
            console.log(`已加載圖片: ${img.name}`);
            
            // 所有圖片加載完成
            if (loadedCount === imagesToLoad.length) {
                console.log('所有圖片加載完成');
            }
        };
        
        // 圖片加載失敗
        image.onerror = function() {
            console.warn(`無法加載圖片: ${img.name}，使用預設圖形`);
            loadedCount++;
        };
    });
}

// 自動暫停與音效抑制（分頁切換/縮小/失焦）
function setupAutoPause() {
    const isAnyMenuOpen = () => {
        const levelEl = document.getElementById('level-up-menu');
        const skillsEl = document.getElementById('skills-menu');
        const levelOpen = levelEl && !levelEl.classList.contains('hidden');
        const skillsOpen = skillsEl && !skillsEl.classList.contains('hidden');
        return !!(levelOpen || skillsOpen);
    };

    const isMenuVisible = () => {
        const startVisible = !document.getElementById('start-screen').classList.contains('hidden');
        const charVisible = !document.getElementById('character-select-screen').classList.contains('hidden');
        const mapVisible = !document.getElementById('map-select-screen').classList.contains('hidden');
        const diffVisible = !document.getElementById('difficulty-select-screen').classList.contains('hidden');
        const talentVisible = Array.from(document.querySelectorAll('#talent-select-screen')).some(el => !el.classList.contains('hidden'));
        return startVisible || charVisible || mapVisible || diffVisible || talentVisible;
    };

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            Game.pause();
            AudioManager.setMuted && AudioManager.setMuted(true);
        } else {
            const gameVisible = !document.getElementById('game-screen').classList.contains('hidden');
            if (gameVisible && !Game.isGameOver && !isAnyMenuOpen()) {
                Game.resume();
                AudioManager.setMuted && AudioManager.setMuted(false);
            } else if (isMenuVisible()) {
                // 解除靜音並恢復選單音樂（不觸發遊戲音樂）
                AudioManager.isMuted = false;
                if (AudioManager.playMusic) AudioManager.playMusic('menu_music');
            }
        }
    });

    window.addEventListener('blur', () => {
        Game.pause();
        AudioManager.setMuted && AudioManager.setMuted(true);
    });

    window.addEventListener('focus', () => {
        const gameVisible = !document.getElementById('game-screen').classList.contains('hidden');
        if (gameVisible && !Game.isGameOver && !isAnyMenuOpen()) {
            Game.resume();
            AudioManager.setMuted && AudioManager.setMuted(false);
        } else if (isMenuVisible()) {
            // 解除靜音並恢復選單音樂（不觸發遊戲音樂）
            AudioManager.isMuted = false;
            if (AudioManager.playMusic) AudioManager.playMusic('menu_music');
        }
    });
}

// ESC 技能頁面切換
function setupSkillsMenuToggle() {
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const gameVisible = !document.getElementById('game-screen').classList.contains('hidden');
        const isGameOver = Game.isGameOver;
        const levelUpOpen = (() => { const el = document.getElementById('level-up-menu'); return el && !el.classList.contains('hidden'); })();
        if (!gameVisible || isGameOver || levelUpOpen) return;

        const skillsEl = document.getElementById('skills-menu');
        if (!skillsEl) return;
        const open = !skillsEl.classList.contains('hidden');
        if (open) {
            UI.hideSkillsMenu();
        } else {
            UI.showSkillsMenu();
        }
    });
}

// 選角介面事件與確認流程
function setupCharacterSelection() {
    const screen = document.getElementById('character-select-screen');
    if (!screen) return;
    const cards = screen.querySelectorAll('.char-card.selectable');
    const confirmBox = document.getElementById('char-confirm');
    const nameEl = document.getElementById('char-confirm-name');
    const descEl = document.getElementById('char-confirm-desc');
    const okBtn = document.getElementById('char-confirm-ok');
    const cancelBtn = document.getElementById('char-confirm-cancel');
    const previewBox = document.getElementById('char-preview');
    const previewImg = document.getElementById('char-preview-img');
    const previewName = document.getElementById('char-preview-name');
    const previewDesc = document.getElementById('char-preview-desc');
    let picked = null;
    let lastTapTime = 0;

    const showPreview = (ch) => {
        if (!ch) return;
        const key = ch.avatarImageKey || 'player';
        const imgObj = (Game.images && Game.images[key]) ? Game.images[key] : null;
        previewImg.src = imgObj ? imgObj.src : `assets/images/${key}.png`;
        previewName.textContent = ch.name || '角色';
        const fmt = (v) => (Math.abs(v % 1) < 1e-6) ? String(Math.round(v)) : String(Number(v.toFixed(2)));
        const hpText = fmt(ch.hpMultiplier || 1);
        const spText = fmt(ch.speedMultiplier || 1);
        previewDesc.textContent = `${ch.description || '角色介紹'}\nHP倍率：x${hpText}，速度倍率：x${spText}`;
        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound('button_click2');
        }
        picked = ch;
    };

    const openConfirm = () => {
        if (!picked) return;
        nameEl.textContent = picked.name;
        descEl.textContent = `${picked.description}\nHP倍率：x${picked.hpMultiplier}，速度倍率：x${picked.speedMultiplier}`;
        confirmBox.classList.remove('hidden');
    };

    cards.forEach(card => {
        const id = card.getAttribute('data-char-id');
        const ch = (CONFIG.CHARACTERS || []).find(c => c.id === id);
        // 單擊：僅更新預覽
        card.addEventListener('click', () => {
            showPreview(ch);
        });
        // 雙擊：直接跳到選地圖視窗，取消確認視窗
        card.addEventListener('dblclick', () => {
            showPreview(ch);
            Game.selectedCharacter = ch;
            confirmBox.classList.add('hidden');
            if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                AudioManager.playSound('button_click');
            }
            const mapEl = document.getElementById('map-select-screen');
            if (mapEl) mapEl.classList.remove('hidden');
        });
        // 觸控雙擊（兩次點擊間隔<=300ms）
        card.addEventListener('touchend', () => {
            const now = Date.now();
            if (now - lastTapTime <= 300) {
                showPreview(ch);
                Game.selectedCharacter = ch;
                confirmBox.classList.add('hidden');
                if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                    AudioManager.playSound('button_click');
                }
                const mapEl = document.getElementById('map-select-screen');
                if (mapEl) mapEl.classList.remove('hidden');
            }
            lastTapTime = now;
        }, { passive: true });
    });

    okBtn.addEventListener('click', () => {
        confirmBox.classList.add('hidden');
        // 套用選角，改為彈出的方式顯示地圖選擇（保持選角介面不隱藏）
        Game.selectedCharacter = picked;
        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound('button_click');
        }
        const mapEl = document.getElementById('map-select-screen');
        if (mapEl) mapEl.classList.remove('hidden');
    });

    cancelBtn.addEventListener('click', () => {
        confirmBox.classList.add('hidden');
        picked = null;
    });

    // 空白鍵：在選角頁面時直接跳到選地圖視窗
    document.addEventListener('keydown', (e) => {
        const selectVisible = !document.getElementById('character-select-screen').classList.contains('hidden');
        if (!selectVisible) return;
        if (e.code === 'Space') {
            e.preventDefault();
            if (picked) {
                Game.selectedCharacter = picked;
                confirmBox.classList.add('hidden');
                if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                    AudioManager.playSound('button_click');
                }
                const mapEl = document.getElementById('map-select-screen');
                if (mapEl) mapEl.classList.remove('hidden');
            }
        }
    });
}

// 地圖與難度選擇事件
function setupMapAndDifficultySelection() {
    const mapScreen = document.getElementById('map-select-screen');
    const diffScreen = document.getElementById('difficulty-select-screen');
    if (!mapScreen || !diffScreen) return;

    const mapCards = mapScreen.querySelectorAll('.map-card.selectable');
    const mapDescEl = document.getElementById('map-desc');
    const mapCancel = document.getElementById('map-cancel');
    let selectedMapCfg = null;
    let lastTapTime = 0;

    const showMapDesc = (cfg, card) => {
        Game.selectedMap = cfg || null;
        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound('button_click2');
        }
        if (mapDescEl) {
            mapDescEl.textContent = '光滑平面的廁所，可利用馬桶障礙物躲避敵人';
        }
    };
    const confirmMap = () => {
        if (!selectedMapCfg) return;
        mapScreen.classList.add('hidden');
        diffScreen.classList.remove('hidden');
        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound('button_click');
        }
    };

    mapCards.forEach(card => {
        const id = card.getAttribute('data-map-id');
        const cfg = (CONFIG.MAPS || []).find(m => m.id === id);
        const disabled = card.classList.contains('disabled');

        card.addEventListener('click', () => {
            if (disabled) {
                if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                    AudioManager.playSound('button_click');
                }
                return;
            }
            selectedMapCfg = cfg;
            showMapDesc(cfg, card);
        });
        card.addEventListener('dblclick', () => {
            if (disabled) return;
            selectedMapCfg = cfg;
            confirmMap();
        });
        card.addEventListener('touchend', () => {
            const now = Date.now();
            if (now - lastTapTime <= 300) {
                if (!disabled) {
                    selectedMapCfg = cfg;
                    confirmMap();
                }
            } else {
                if (!disabled) {
                    selectedMapCfg = cfg;
                    showMapDesc(cfg, card);
                }
            }
            lastTapTime = now;
        }, { passive: true });
    });

    // 空白鍵確認地圖（在地圖介面開啟時）
    document.addEventListener('keydown', (e) => {
        const mapVisible = !mapScreen.classList.contains('hidden');
        if (!mapVisible) return;
        if (e.code === 'Space') {
            e.preventDefault();
            confirmMap();
        }
    });

    if (mapCancel) {
        mapCancel.addEventListener('click', () => {
            mapScreen.classList.add('hidden');
            // 保持選角介面可見，無需切換
        });
    }

    const diffCards = diffScreen.querySelectorAll('.diff-card.selectable');
    const diffBack = document.getElementById('diff-back');

    diffCards.forEach(card => {
        card.addEventListener('click', () => {
            const id = card.getAttribute('data-diff-id') || 'EASY';
            Game.selectedDifficultyId = id;
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound && AudioManager.playSound('button_click');
            }
            diffScreen.classList.add('hidden');
            // 新增：開始遊戲時隱藏選角與選圖介面，切換到遊戲畫面
            const charSel = document.getElementById('character-select-screen');
            const mapSel = document.getElementById('map-select-screen');
            charSel && charSel.classList.add('hidden');
            mapSel && mapSel.classList.add('hidden');
            Game.startNewGame();
            // 切換遊戲BGM
            if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                AudioManager.playMusic('game_music');
            }
            document.getElementById('game-screen').classList.remove('hidden');
        });
    });

    if (diffBack) {
        diffBack.addEventListener('click', () => {
            diffScreen.classList.add('hidden');
            mapScreen.classList.remove('hidden');
        });
    }
}

// 等比縮放遊戲視窗，避免變形
function setupResponsiveViewport() {
    const resizeViewport = () => {
        const viewport = document.getElementById('viewport');
        if (!viewport) return;
        const targetW = CONFIG.CANVAS_WIDTH;
        const targetH = CONFIG.CANVAS_HEIGHT;
        const scale = Math.min(window.innerWidth / targetW, window.innerHeight / targetH);
        const displayW = Math.max(1, Math.floor(targetW * scale));
        const displayH = Math.max(1, Math.floor(targetH * scale));
        viewport.style.width = displayW + 'px';
        viewport.style.height = displayH + 'px';
        // 將縮放傳遞給CSS，便於UI元素（如玩家頭像）隨視窗縮放
        document.documentElement.style.setProperty('--ui-scale', String(scale));
    };
    window.addEventListener('resize', resizeViewport);
    window.addEventListener('orientationchange', resizeViewport);
    resizeViewport();
}

// 新增：天賦介面切換（選角 <-> 天賦）
function setupTalentScreenToggle() {
    const openBtn = document.getElementById('talent-open');
    const backBtn = document.getElementById('talent-back');
    const charScreen = document.getElementById('character-select-screen');
    const talentScreen = document.getElementById('talent-select-screen');
    if (!charScreen || !talentScreen) return;

    // 初始化天賦狀態
    TalentSystem.init();

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                AudioManager.playSound('button_click');
            }
            charScreen.classList.add('hidden');
            talentScreen.classList.remove('hidden');
        });
    }
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                AudioManager.playSound('button_click');
            }
            talentScreen.classList.add('hidden');
            charScreen.classList.remove('hidden');
        });
    }
}

// 天賦系統初始化
function initTalentSystem() {
    // 載入已解鎖的天賦
    loadUnlockedTalents();
    
    // 綁定天賦卡點擊事件
    const talentCards = document.querySelectorAll('#talent-select-screen .char-card.selectable');
    talentCards.forEach(card => {
        card.addEventListener('click', handleTalentCardClick);
        card.addEventListener('dblclick', handleTalentCardDblClick);
    });
    
    // 綁定天賦確認對話框按鈕
    const confirmBtn = document.getElementById('talent-confirm-ok');
    const cancelBtn = document.getElementById('talent-confirm-cancel');
    
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const activeCard = document.querySelector('#talent-select-screen .char-card.active');
            if (activeCard) {
                unlockTalent(activeCard.dataset.talentId);
            }
            hideTalentConfirm();
        });
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            hideTalentConfirm();
        });
    }
    
    // 空白鍵確認
    document.addEventListener('keydown', (e) => {
        if (e.key === ' ' && !document.getElementById('talent-confirm').classList.contains('hidden')) {
            const activeCard = document.querySelector('#talent-select-screen .char-card.active');
            if (activeCard) {
                unlockTalent(activeCard.dataset.talentId);
            }
            hideTalentConfirm();
        }
    });
}

// 處理天賦卡點擊
function handleTalentCardClick(e) {
    const card = e.currentTarget;
    
    // 移除其他卡片的active狀態
    document.querySelectorAll('#talent-select-screen .char-card.active').forEach(el => {
        if (el !== card) el.classList.remove('active');
    });
    
    // 切換當前卡片的active狀態
    card.classList.toggle('active');
    
    // 更新預覽區
    if (card.classList.contains('active')) {
        updateTalentPreview(card);
    }
}

// 處理天賦卡雙擊
function handleTalentCardDblClick(e) {
    const card = e.currentTarget;
    
    // 如果已解鎖，不需要確認
    if (!card.classList.contains('locked')) return;
    
    // 顯示確認對話框
    showTalentConfirm(card);
}

// 更新天賦預覽區
function updateTalentPreview(card) {
    const nameEl = document.getElementById('talent-preview-name');
    const descEl = document.getElementById('talent-preview-desc');
    const imgEl = document.getElementById('talent-preview-img');
    
    if (nameEl && card.querySelector('.char-name')) {
        nameEl.textContent = card.querySelector('.char-name').textContent;
    }
    
    if (descEl) {
        if (card.dataset.talentId === 'hp_boost') {
            descEl.textContent = '增加初始生命值20點，讓你在遊戲中更加耐久。';
        } else {
            descEl.textContent = '這是一個天賦描述。';
        }
    }
    
    if (imgEl && card.querySelector('img')) {
        imgEl.src = card.querySelector('img').src;
        // 如果卡片是鎖定狀態，預覽圖也應該是灰色
        if (card.classList.contains('locked')) {
            imgEl.classList.add('grayscale');
        } else {
            imgEl.classList.remove('grayscale');
        }
    }
}

// 顯示天賦確認對話框
function showTalentConfirm(card) {
    const confirmEl = document.getElementById('talent-confirm');
    const titleEl = document.getElementById('talent-confirm-title');
    const descEl = document.getElementById('talent-confirm-desc');
    
    if (!confirmEl) return;
    
    // 設置當前選中的卡片為active
    document.querySelectorAll('#talent-select-screen .char-card.active').forEach(el => {
        el.classList.remove('active');
    });
    card.classList.add('active');
    
    // 更新對話框內容
    if (titleEl && card.querySelector('.char-name')) {
        titleEl.textContent = `解鎖 ${card.querySelector('.char-name').textContent}`;
    }
    
    if (descEl) {
        descEl.textContent = '使用500金幣解鎖天賦？';
    }
    
    // 顯示對話框
    confirmEl.classList.remove('hidden');
}

// 隱藏天賦確認對話框
function hideTalentConfirm() {
    const confirmEl = document.getElementById('talent-confirm');
    if (confirmEl) {
        confirmEl.classList.add('hidden');
    }
}

// 解鎖天賦
function unlockTalent(talentId) {
    // 檢查金幣是否足夠
    if (Game.coins < 500) {
        alert('金幣不足！');
        AudioManager.playSound('button_click');
        return;
    }
    
    // 扣除金幣
    Game.coins -= 500;
    Game.saveCoins();
    
    // 播放音效
    AudioManager.playSound('button_click');
    
    // 更新UI
    if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) {
        UI.updateCoinsDisplay(Game.coins);
    }
    
    // 保存已解鎖的天賦
    saveUnlockedTalent(talentId);
    
    // 更新天賦卡片外觀
    updateTalentCardAppearance(talentId);
    
    // 更新預覽區
    const card = document.querySelector(`#talent-select-screen .char-card[data-talent-id="${talentId}"]`);
    if (card) {
        updateTalentPreview(card);
    }
    
    // 更新ESC選單中的天賦列表
    if (typeof UI !== 'undefined' && UI.updateTalentsList) {
        UI.updateTalentsList();
    }
    
    // 提示玩家天賦已解鎖
    alert(`天賦已解鎖！${talentId === 'hp_boost' ? '初始生命值+20' : ''}`);
}

// 保存已解鎖的天賦
function saveUnlockedTalent(talentId) {
    try {
        const key = 'unlocked_talents';
        let unlockedTalents = [];
        
        // 讀取已有的解鎖天賦
        const stored = localStorage.getItem(key);
        if (stored) {
            try {
                unlockedTalents = JSON.parse(stored);
            } catch (e) {
                unlockedTalents = [];
            }
        }
        
        // 添加新解鎖的天賦
        if (!unlockedTalents.includes(talentId)) {
            unlockedTalents.push(talentId);
        }
        
        // 保存到本地存儲
        localStorage.setItem(key, JSON.stringify(unlockedTalents));
    } catch (e) {
        console.error('保存天賦失敗:', e);
    }
}

// 載入已解鎖的天賦
function loadUnlockedTalents() {
    try {
        const key = 'unlocked_talents';
        const stored = localStorage.getItem(key);
        
        if (stored) {
            try {
                const unlockedTalents = JSON.parse(stored);
                console.log('載入已解鎖天賦:', unlockedTalents);
                
                // 更新每個已解鎖天賦的外觀
                unlockedTalents.forEach(talentId => {
                    updateTalentCardAppearance(talentId);
                });
                
                // 確保天賦效果在遊戲開始時立即生效
                if (typeof Game !== 'undefined' && Game.player) {
                    applyTalentEffects(Game.player);
                }
            } catch (e) {
                console.error('解析已解鎖天賦失敗:', e);
            }
        } else {
            console.log('未找到已解鎖天賦數據');
        }
    } catch (e) {
        console.error('載入天賦失敗:', e);
    }
}

// 應用天賦效果到玩家身上
function applyTalentEffects(player) {
    if (!player) return;
    
    try {
        const unlockedTalents = JSON.parse(localStorage.getItem('unlocked_talents') || '[]');
        console.log('應用天賦效果:', unlockedTalents);
        
        // 應用生命強化天賦
        if (unlockedTalents.includes('hp_boost')) {
            const healthBoost = 20;
            // 只有在玩家血量等於最大血量時才增加當前血量
            // 這樣可以避免在遊戲中途重複增加血量
            if (player.health === player.maxHealth) {
                player.health += healthBoost;
            }
            player.maxHealth += healthBoost;
            console.log(`已應用生命強化天賦，當前血量: ${player.health}/${player.maxHealth}`);
            
            // 更新UI
            if (typeof UI !== 'undefined' && UI.updateHealthBar) {
                UI.updateHealthBar(player.health, player.maxHealth);
            }
        }
        
        // 未來可以在這裡添加更多天賦效果
        
    } catch (e) {
        console.error('應用天賦效果失敗:', e);
    }
}

// 天賦卡片外觀更新功能已移至 TalentSystem 模塊
