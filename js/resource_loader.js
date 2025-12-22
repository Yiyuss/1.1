// 資源預加載系統
// 在加載頁面中預加載所有圖片、音效、BGM，避免進入遊戲時延遲
const ResourceLoader = {
    totalResources: 0,
    loadedResources: 0,
    images: [],
    sounds: [],
    music: [],
    
    // 更新加載進度
    updateProgress(status, details) {
        const progressBar = document.getElementById('loading-progress-fill');
        const statusText = document.getElementById('loading-status');
        const detailsText = document.getElementById('loading-details');
        
        if (progressBar && this.totalResources > 0) {
            const percent = Math.min(100, Math.round((this.loadedResources / this.totalResources) * 100));
            progressBar.style.width = percent + '%';
        }
        
        if (statusText) {
            statusText.textContent = status || '載入中...';
        }
        
        if (detailsText && details) {
            detailsText.textContent = details;
        }
    },
    
    // 預加載所有資源
    async preloadAll() {
        this.loadedResources = 0;
        this.images = [];
        this.sounds = [];
        this.music = [];
        
        // 收集所有需要加載的資源
        const imageList = this.getImageList();
        const soundList = this.getSoundList();
        const musicList = this.getMusicList();
        
        this.totalResources = imageList.length + soundList.length + musicList.length;
        this.updateProgress('準備載入資源...', `共 ${this.totalResources} 個資源`);
        
        const TIMEOUT_MS = 10000; // 10秒超時
        
        // 超時包裝函數：為 Promise 添加超時機制
        const withTimeout = (promise, timeoutMs, resourceName, resourceType) => {
            return Promise.race([
                promise,
                new Promise((resolve) => {
                    setTimeout(() => {
                        console.warn(`[ResourceLoader] 資源載入超時 (${timeoutMs}ms): ${resourceType} "${resourceName}"`);
                        resolve(); // 超時後 resolve，不阻塞其他資源
                    }, timeoutMs);
                })
            ]);
        };
        
        // 並行加載所有資源
        const allPromises = [];
        
        // 加載圖片
        this.updateProgress('載入圖片資源...', `0 / ${imageList.length} 圖片`);
        imageList.forEach((img, index) => {
            const promise = this.loadImage(img.name, img.src)
                .then(() => {
                    this.loadedResources++;
                    this.updateProgress('載入圖片資源...', `${index + 1} / ${imageList.length} 圖片`);
                })
                .catch((err) => {
                    console.warn(`[ResourceLoader] 圖片載入錯誤: ${img.name}`, err);
                    this.loadedResources++;
                    this.updateProgress('載入圖片資源...', `${index + 1} / ${imageList.length} 圖片`);
                });
            // 添加超時機制
            allPromises.push(withTimeout(promise, TIMEOUT_MS, img.name, '圖片'));
        });
        
        // 加載音效
        this.updateProgress('載入音效資源...', `0 / ${soundList.length} 音效`);
        soundList.forEach((sound, index) => {
            const promise = this.loadSound(sound.name, sound.src)
                .then(() => {
                    this.loadedResources++;
                    this.updateProgress('載入音效資源...', `${index + 1} / ${soundList.length} 音效`);
                })
                .catch((err) => {
                    console.warn(`[ResourceLoader] 音效載入錯誤: ${sound.name}`, err);
                    this.loadedResources++;
                    this.updateProgress('載入音效資源...', `${index + 1} / ${soundList.length} 音效`);
                });
            // 添加超時機制
            allPromises.push(withTimeout(promise, TIMEOUT_MS, sound.name, '音效'));
        });
        
        // 加載BGM
        this.updateProgress('載入背景音樂...', `0 / ${musicList.length} 音樂`);
        musicList.forEach((music, index) => {
            const promise = this.loadMusic(music.name, music.src)
                .then(() => {
                    this.loadedResources++;
                    this.updateProgress('載入背景音樂...', `${index + 1} / ${musicList.length} 音樂`);
                })
                .catch((err) => {
                    console.warn(`[ResourceLoader] BGM載入錯誤: ${music.name}`, err);
                    this.loadedResources++;
                    this.updateProgress('載入背景音樂...', `${index + 1} / ${musicList.length} 音樂`);
                });
            // 添加超時機制
            allPromises.push(withTimeout(promise, TIMEOUT_MS, music.name, 'BGM'));
        });
        
        // 使用 Promise.allSettled 而不是 Promise.all，避免單個資源失敗阻塞整個載入
        const results = await Promise.allSettled(allPromises);
        
        // 統計成功和失敗的資源數量
        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0 || succeeded < allPromises.length) {
            console.warn(`[ResourceLoader] 資源預加載完成: ${succeeded} 成功, ${failed} 失敗, ${allPromises.length - succeeded - failed} 超時/跳過`);
        }
        
        this.updateProgress('載入完成！', '所有資源已準備就緒');
        
        // 延遲一小段時間讓用戶看到100%進度
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return true;
    },
    
    // 加載圖片
    loadImage(name, src) {
        return new Promise((resolve) => {
            // 檢查是否已加載
            if (Game.images && Game.images[name]) {
                resolve();
                return;
            }
            
            const image = new Image();
            image.onload = () => {
                if (!Game.images) Game.images = {};
                Game.images[name] = image;
                this.images.push({ name, image });
                resolve();
            };
            image.onerror = () => {
                console.warn(`無法加載圖片: ${name} (${src})`);
                if (!Game.images) Game.images = {};
                Game.images[name] = image; // 即使失敗也存入，避免重複嘗試
                resolve();
            };
            image.src = src;
        });
    },
    
    // 加載音效
    loadSound(name, src) {
        return new Promise((resolve) => {
            // 檢查是否已加載且已準備就緒
            if (AudioManager.sounds && AudioManager.sounds[name]) {
                const existingAudio = AudioManager.sounds[name];
                // 如果已經是可以播放的Audio對象，檢查是否已加載
                if (existingAudio.readyState >= 2) { // HAVE_CURRENT_DATA
                    resolve();
                    return;
                }
                // 如果Audio對象存在但未加載完成，等待加載完成
                if (existingAudio.addEventListener) {
                    existingAudio.addEventListener('canplaythrough', () => resolve(), { once: true });
                    existingAudio.addEventListener('error', () => resolve(), { once: true });
                    return;
                }
            }
            
            const audio = new Audio();
            audio.src = src;
            audio.volume = AudioManager.soundVolume || 0.7;
            
            // 音效加載完成
            audio.addEventListener('canplaythrough', () => {
                if (!AudioManager.sounds) AudioManager.sounds = {};
                AudioManager.sounds[name] = audio;
                this.sounds.push({ name, audio });
                resolve();
            }, { once: true });
            
            // 音效加載失敗
            audio.onerror = () => {
                console.warn(`無法加載音效: ${name}`);
                if (!AudioManager.sounds) AudioManager.sounds = {};
                AudioManager.sounds[name] = {
                    play: function() {},
                    pause: function() {},
                    cloneNode: function() { return this; }
                };
                resolve();
            };
            
            // 開始加載
            audio.load();
        });
    },
    
    // 加載BGM
    loadMusic(name, src) {
        return new Promise((resolve) => {
            // 檢查是否已加載且已準備就緒
            if (AudioManager.music && AudioManager.music[name]) {
                const existingAudio = AudioManager.music[name];
                // 如果已經是可以播放的Audio對象，檢查是否已加載
                if (existingAudio.readyState >= 2) { // HAVE_CURRENT_DATA
                    resolve();
                    return;
                }
                // 如果Audio對象存在但未加載完成，等待加載完成
                if (existingAudio.addEventListener) {
                    existingAudio.addEventListener('canplaythrough', () => resolve(), { once: true });
                    existingAudio.addEventListener('error', () => resolve(), { once: true });
                    return;
                }
            }
            
            const audio = new Audio();
            audio.src = src;
            audio.volume = AudioManager.musicVolume || 0.5;
            audio.loop = true;
            
            // BGM加載完成
            audio.addEventListener('canplaythrough', () => {
                if (!AudioManager.music) AudioManager.music = {};
                AudioManager.music[name] = audio;
                this.music.push({ name, audio });
                resolve();
            }, { once: true });
            
            // BGM加載失敗
            audio.onerror = () => {
                console.warn(`無法加載音樂: ${name}`);
                if (!AudioManager.music) AudioManager.music = {};
                AudioManager.music[name] = {
                    play: function() {},
                    pause: function() {},
                    currentTime: 0,
                    loop: true
                };
                resolve();
            };
            
            // 開始加載
            audio.load();
        });
    },
    
    // 獲取圖片列表
    getImageList() {
        return [
            { name: 'player', src: 'assets/images/player.gif' },
            { name: 'player1-2', src: 'assets/images/player1-2.png' },
            { name: 'player2', src: 'assets/images/player2.png' },
            { name: 'player2-1', src: 'assets/images/player2-1.png' },
            { name: 'player2-2', src: 'assets/images/player2-2.png' },
            { name: 'player2-3', src: 'assets/images/player2-3.png' },
            { name: 'player3', src: 'assets/images/player3.gif' },
            { name: 'player3-2', src: 'assets/images/player3-2.png' },
            { name: 'player3-3', src: 'assets/images/player3-3.png' },
            { name: 'player4', src: 'assets/images/player4.png' },
            { name: 'player4-2', src: 'assets/images/player4-2.png' },
            { name: 'player4-3', src: 'assets/images/player4-3.png' },
            { name: 'player5', src: 'assets/images/player5.png' },
            { name: 'player5-2', src: 'assets/images/player5-2.png' },
            { name: 'player5-3', src: 'assets/images/player5-3.png' },
            { name: 'playerN', src: 'assets/images/playerN.png' },
            { name: 'playerN2', src: 'assets/images/playerN2.gif' },
            { name: 'playerN3', src: 'assets/images/playerN3.png' },
            { name: 'zombie', src: 'assets/images/zombie.png' },
            { name: 'zombie2', src: 'assets/images/zombie2.png' },
            { name: 'zombie3', src: 'assets/images/zombie3.png' },
            { name: 'skeleton', src: 'assets/images/skeleton.png' },
            { name: 'skeleton2', src: 'assets/images/skeleton2.png' },
            { name: 'skeleton3', src: 'assets/images/skeleton3.png' },
            { name: 'ghost', src: 'assets/images/ghost.png' },
            { name: 'ghost2', src: 'assets/images/ghost2.png' },
            { name: 'ghost3', src: 'assets/images/ghost3.png' },
            { name: 'mini_boss', src: 'assets/images/mini_boss.png' },
            { name: 'boss', src: 'assets/images/boss.png' },
            { name: 'elf', src: 'assets/images/Elf.png' },
            { name: 'elf2', src: 'assets/images/Elf2.png' },
            { name: 'elf3', src: 'assets/images/Elf3.png' },
            { name: 'elf_mini_boss', src: 'assets/images/Elf_mini_boss.png' },
            { name: 'elfboss', src: 'assets/images/Elfboss.png' },
            { name: 'dagger', src: 'assets/images/dagger.png' },
            { name: 'fireball', src: 'assets/images/fireball.png' },
            { name: 'lightning', src: 'assets/images/lightning.png' },
            { name: 'chicken', src: 'assets/images/chicken.png' },
            { name: 'A21', src: 'assets/images/A21.png' },
            { name: 'A22', src: 'assets/images/A22.png' },
            { name: 'A23', src: 'assets/images/A23.png' },
            { name: 'A24', src: 'assets/images/A24.png' },
            { name: 'A25', src: 'assets/images/A25.png' },
            { name: 'A26', src: 'assets/images/A26.png' },
            { name: 'A27', src: 'assets/images/A27.png' },
            { name: 'A31', src: 'assets/images/A31.png' },
            { name: 'A28', src: 'assets/images/A28.png' },
            { name: 'A29', src: 'assets/images/A29.png' },
            { name: 'A32', src: 'assets/images/A32.png' },
            { name: 'A30', src: 'assets/images/A30.png' },
            { name: 'A33', src: 'assets/images/A33.png' },
            { name: 'AI', src: 'assets/images/AI.png' },
            { name: 'AI2', src: 'assets/images/AI2.png' },
            { name: 'AI3', src: 'assets/images/AI3.png' },
            { name: 'muffin', src: 'assets/images/muffin.png' },
            { name: 'muffin2', src: 'assets/images/muffin2.png' },
            { name: 'die', src: 'assets/images/die.png' },
            { name: 'ICE3', src: 'assets/images/ICE3.png' },
            { name: 'knife', src: 'assets/images/knife.gif' },
            { name: 'knife2', src: 'assets/images/knife2.gif' },
            { name: 'Explosion', src: 'assets/images/Explosion.png' },
            { name: 'exp_orb', src: 'assets/images/exp_orb.png' },
            { name: 'field', src: 'assets/images/field.png' },
            { name: 'field2', src: 'assets/images/field2.png' },
            { name: 'box', src: 'assets/images/BOX.png' },
            { name: 'LA', src: 'assets/images/LA.png' },
            { name: 'S1', src: 'assets/images/S1.png' },
            { name: 'S2', src: 'assets/images/S2.png' },
            { name: 'S3', src: 'assets/images/S3.png' },
            { name: 'S4', src: 'assets/images/S4.png' },
            { name: 'S5', src: 'assets/images/S5.png' },
            { name: 'S6', src: 'assets/images/S6.png' },
            { name: 'S7', src: 'assets/images/S7.png' },
            { name: 'S8', src: 'assets/images/S8.png' },
            { name: 'S9', src: 'assets/images/S9.png' },
            { name: 'S10', src: 'assets/images/S10.png' },
            { name: 'S11', src: 'assets/images/S11.png' },
            { name: 'S12', src: 'assets/images/S12.png' },
            { name: 'S13', src: 'assets/images/S13.png' },
            { name: 'S14', src: 'assets/images/S14.png' },
            { name: 'S15', src: 'assets/images/S15.png' },
            { name: 'S16', src: 'assets/images/S16.png' },
            { name: 'background', src: 'assets/images/background.jpg' },
            { name: 'background2', src: 'assets/images/background2.jpg' },
            { name: 'background3', src: 'assets/images/background3.jpg' },
            { name: 'background4', src: 'assets/images/background4.png' },
            { name: 'background1-2', src: 'assets/images/background1-2.png' },
            { name: 'background1-3', src: 'assets/images/background1-3.png' },
            { name: 'background8', src: 'assets/images/background8.png' },
            { name: 'exit', src: 'assets/images/exit.png' }
        ];
    },
    
    // 獲取音效列表
    getSoundList() {
        return [
            { name: 'enemy_death', src: 'assets/audio/enemy_death.mp3' },
            { name: 'level_up', src: 'assets/audio/level_up.mp3' },
            { name: 'collect_exp', src: 'assets/audio/collect_exp.mp3' },
            { name: 'dagger_shoot', src: 'assets/audio/dagger_shoot.mp3' },
            { name: 'knife', src: 'assets/audio/knife.mp3' },
            { name: 'fireball_shoot', src: 'assets/audio/fireball_shoot.mp3' },
            { name: 'lightning_shoot', src: 'assets/audio/lightning_shoot.mp3' },
            { name: 'laser_shoot', src: 'assets/audio/laser_shoot.mp3' },
            { name: 'zaps', src: 'assets/audio/zaps.mp3' },
            { name: 'ICE', src: 'assets/audio/ICE.mp3' },
            { name: 'ice2', src: 'assets/audio/ICE2.mp3' },
            { name: 'invincible_activate', src: 'assets/audio/Invincible.mp3' },
            { name: 'sing_cast', src: 'assets/audio/LA.mp3' },
            { name: 'button_click', src: 'assets/audio/button_click.mp3' },
            { name: 'button_click2', src: 'assets/audio/button_click2.mp3' },
            { name: 'level_up2', src: 'assets/audio/level_up2.mp3' },
            { name: 'money', src: 'assets/audio/money.mp3' },
            { name: 'achievements', src: 'assets/audio/achievements.mp3' },
            { name: 'Explosion', src: 'assets/audio/Explosion.mp3' },
            { name: 'bo', src: 'assets/audio/bo.mp3' },
            { name: 'boss_cooldown', src: 'assets/audio/BOSS.mp3' },
            { name: 'playerN2', src: 'assets/audio/playerN2.mp3' }
        ];
    },
    
    // 獲取BGM列表
    getMusicList() {
        return [
            { name: 'menu_music', src: 'assets/audio/menu_music.mp3' },
            { name: 'game_music', src: 'assets/audio/game_music.mp3' },
            { name: 'game_music2', src: 'assets/audio/game_music2.mp3' },
            { name: 'boss_music', src: 'assets/audio/boss_music.mp3' },
            { name: 'shura_music', src: 'assets/audio/Shura.mp3' },
            { name: 'boss2_music', src: 'assets/audio/BOSS2.mp3' },
            { name: 'boss3_music', src: 'assets/audio/BOSS3.mp3' },
            { name: 'boss4_music', src: 'assets/audio/BOSS4.mp3' }
        ];
    }
};

// 預加載所有資源並進入選角介面
async function preloadAllResources() {
    try {
        // 初始化Game.images和AudioManager（如果尚未初始化）
        if (!Game.images) Game.images = {};
        if (!AudioManager.sounds) AudioManager.sounds = {};
        if (!AudioManager.music) AudioManager.music = {};
        
        // 關鍵：先停止所有BGM，避免主選單切換分頁恢復的BGM殘留
        try {
            if (typeof AudioManager !== 'undefined' && typeof AudioManager.stopAllMusic === 'function') {
                AudioManager.stopAllMusic();
            }
        } catch (_) {}
        
        // 注意：不要重複調用 AudioManager.init()，因為它會在 main.js 中已經初始化過
        // 重複調用會重新創建所有BGM實例，導致舊實例殘留造成污染
        // 只在 AudioManager 完全未初始化時才調用
        if (typeof AudioManager.init === 'function' && (!AudioManager.music || Object.keys(AudioManager.music).length === 0)) {
            AudioManager.init();
        }
        
        // 開始預加載
        await ResourceLoader.preloadAll();
        
        // 加載完成，進入選角介面
        hide(DOMCache.get('loading-screen'));
        show(DOMCache.get('character-select-screen'));
        
        // 播放選單音樂（確保使用統一的BGM實例）
        if (AudioManager.playMusic) {
            AudioManager.isMuted = false;
            try {
                if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                    AudioScene.enterMenu();
                } else {
                    AudioManager.playMusic('menu_music');
                }
            } catch (_) {}
        }
    } catch (error) {
        console.error('資源預加載失敗:', error);
        // 即使加載失敗，也進入選角介面
        hide(DOMCache.get('loading-screen'));
        show(DOMCache.get('character-select-screen'));
        
        // 關鍵：先停止所有BGM，避免殘留
        try {
            if (typeof AudioManager !== 'undefined' && typeof AudioManager.stopAllMusic === 'function') {
                AudioManager.stopAllMusic();
            }
        } catch (_) {}
        
        // 嘗試播放選單音樂（即使加載失敗）
        try {
            if (AudioManager.playMusic) {
                AudioManager.isMuted = false;
                if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                    AudioScene.enterMenu();
                } else {
                    AudioManager.playMusic('menu_music');
                }
            }
        } catch (_) {}
    }
}

