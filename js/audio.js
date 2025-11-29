// 音效系統
const AudioManager = {
    sounds: {},
    music: {},
    isMuted: false,
    musicVolume: 0.5,
    soundVolume: 0.7,
    // 新增：經驗音效開關（預設開）
    expSoundEnabled: true,
    // 新增：死亡音效開關（預設開）
    deathSoundEnabled: true,
    // 新增：死亡音效同時播放上限與目前並發計數
    maxConcurrentDeathSounds: 3,
    _deathConcurrency: 0,
    
    init: function() {
        // 初始化音效
        this.loadSounds();
        
        console.log('音效系統已初始化');
    },
    
    // 加載所有音效
    loadSounds: function() {
        // 音效列表
        const soundsToLoad = [
            { name: 'enemy_death', src: 'assets/audio/enemy_death.mp3' },
            { name: 'level_up', src: 'assets/audio/level_up.mp3' },
            { name: 'collect_exp', src: 'assets/audio/collect_exp.mp3' },
            { name: 'dagger_shoot', src: 'assets/audio/dagger_shoot.mp3' },
            { name: 'knife', src: 'assets/audio/knife.mp3' },
            { name: 'fireball_shoot', src: 'assets/audio/fireball_shoot.mp3' },
            { name: 'lightning_shoot', src: 'assets/audio/lightning_shoot.mp3' },
            { name: 'laser_shoot', src: 'assets/audio/laser_shoot.mp3' },
            { name: 'zaps', src: 'assets/audio/zaps.mp3' },
            // 防禦模式冰凍塔專用音效（不更動既有鍵名與 SaveCode 結構）
            { name: 'ICE', src: 'assets/audio/ICE.mp3' },
            { name: 'ice2', src: 'assets/audio/ICE2.mp3' }, // 大波球地面特效音效
            { name: 'invincible_activate', src: 'assets/audio/Invincible.mp3' },
            { name: 'sing_cast', src: 'assets/audio/LA.mp3' },
            { name: 'button_click', src: 'assets/audio/button_click.mp3' },
            { name: 'button_click2', src: 'assets/audio/button_click2.mp3' },
            { name: 'level_up2', src: 'assets/audio/level_up2.mp3' },
            { name: 'money', src: 'assets/audio/money.mp3' },
            { name: 'achievements', src: 'assets/audio/achievements.mp3' },
            { name: 'bo', src: 'assets/audio/bo.mp3' },
            { name: 'boss_cooldown', src: 'assets/audio/BOSS.mp3' },
            { name: 'playerN2', src: 'assets/audio/playerN2.mp3' } // 第二位角色大絕專用音效
        ];
        
        // 音樂列表
        const musicToLoad = [
            { name: 'menu_music', src: 'assets/audio/menu_music.mp3' },
            { name: 'game_music', src: 'assets/audio/game_music.mp3' },
            { name: 'game_music2', src: 'assets/audio/game_music2.mp3' }, // 第4張地圖（花園）專用 BGM
            { name: 'boss_music', src: 'assets/audio/boss_music.mp3' },
            // 修羅模式專用 BGM
            { name: 'shura_music', src: 'assets/audio/Shura.mp3' },
            // 第二張挑戰地圖專用 BGM
            { name: 'boss2_music', src: 'assets/audio/BOSS2.mp3' },
            // 第三張挑戰地圖專用 BGM
            { name: 'boss3_music', src: 'assets/audio/BOSS3.mp3' },
            // 第四張挑戰地圖專用 BGM
            { name: 'boss4_music', src: 'assets/audio/BOSS4.mp3' }
        ];
        
        // 加載音效
        soundsToLoad.forEach(sound => {
            this.sounds[sound.name] = new Audio();
            this.sounds[sound.name].src = sound.src;
            this.sounds[sound.name].volume = this.soundVolume;
            
            // 音效加載失敗處理
            this.sounds[sound.name].onerror = () => {
                console.warn(`無法加載音效: ${sound.name}`);
                // 創建一個空的音頻上下文作為替代
                this.sounds[sound.name] = {
                    play: function() {},
                    pause: function() {}
                };
            };
        });
        
        // 加載音樂
        musicToLoad.forEach(music => {
            this.music[music.name] = new Audio();
            this.music[music.name].src = music.src;
            this.music[music.name].volume = this.musicVolume;
            this.music[music.name].loop = true;
            
            // 音樂加載失敗處理
            this.music[music.name].onerror = () => {
                console.warn(`無法加載音樂: ${music.name}`);
                // 創建一個空的音頻上下文作為替代
                this.music[music.name] = {
                    play: function() {},
                    pause: function() {}
                };
            };
        });
    },
    
    // 播放音效
    playSound: function(name) {
        if (this.isMuted || !this.sounds[name]) return;
        // 關閉 EXP 音效時略過 collect_exp
        if (name === 'collect_exp' && this.expSoundEnabled === false) return;
        // 關閉死亡音效時略過 enemy_death
        if (name === 'enemy_death' && this.deathSoundEnabled === false) return;
        // 限制死亡音效同時播放數量
        if (name === 'enemy_death' && this._deathConcurrency >= this.maxConcurrentDeathSounds) return;
        
        try {
            // 克隆音效以允許重疊播放
            const sound = this.sounds[name].cloneNode();
            sound.volume = this.soundVolume;
            // 針對死亡音效：計數與回收
            if (name === 'enemy_death') {
                this._deathConcurrency++;
                const dec = () => { this._deathConcurrency = Math.max(0, this._deathConcurrency - 1); };
                sound.addEventListener('ended', dec, { once: true });
                sound.addEventListener('error', dec, { once: true });
            }
            sound.play();
        } catch (e) {
            console.error(`播放音效 ${name} 時出錯:`, e);
        }
    },
    
    // 播放音樂
    playMusic: function(name) {
        if (this.isMuted || !this.music[name]) return;
        const track = this.music[name];

        // 若目標曲已在播放中，避免重複觸發造成瀏覽器音軌堆疊或閃斷
        try {
            if (track && track.paused === false) {
                // 守護：同曲連續呼叫直接略過
                return;
            }
        } catch(_){}

        // 停止所有其他音樂（確保只保留一條 BGM）
        this.stopAllMusic();

        try {
            track.currentTime = 0;
            track.loop = true; // 防止被外部誤改
            track.volume = this.musicVolume; // 同步最新音量
            track.play();
        } catch (e) {
            console.error(`播放音樂 ${name} 時出錯:`, e);
        }
    },
    
    // 停止所有音樂
    stopAllMusic: function() {
        for (const key in this.music) {
            if (this.music.hasOwnProperty(key)) {
                try {
                    this.music[key].pause();
                    this.music[key].currentTime = 0;
                } catch (e) {
                    console.error(`停止音樂 ${key} 時出錯:`, e);
                }
            }
        }
        // 額外守護：清理可能由其它模組誤建的 <audio> 實例，避免殘留造成重疊
        try {
            const known = [
              'assets/audio/menu_music.mp3',
              'assets/audio/game_music.mp3',
              'assets/audio/game_music2.mp3',
              'assets/audio/boss_music.mp3',
              'assets/audio/Shura.mp3',
              'assets/audio/BOSS2.mp3',
              'assets/audio/BOSS3.mp3',
              'assets/audio/BOSS4.mp3'
            ];
            const medias = document.querySelectorAll('audio');
            medias.forEach((m) => {
              try {
                const src = (m.currentSrc || m.src || '').toLowerCase();
                if (src && known.some(k => src.endsWith(k.toLowerCase()))) {
                  m.pause(); m.currentTime = 0;
                }
              } catch(_){}
            });
        } catch(_){}
    },
    
    // 靜音/取消靜音
    toggleMute: function() {
        this.isMuted = !this.isMuted;
        
        if (this.isMuted) {
            this.stopAllMusic();
        } else {
            // 恢復遊戲中的音樂
            if (Game.isGameOver) {
                // 不播放音樂
            } else if (Game.boss) {
                this.playMusic('boss_music');
            } else {
                let bgmName = 'game_music';
                // 第4張地圖（花園）使用 game_music2（優先於修羅模式）
                if (typeof Game !== 'undefined' && Game.selectedMap && Game.selectedMap.id === 'garden') {
                    bgmName = 'game_music2';
                } else if (typeof Game !== 'undefined' && Game.selectedDifficultyId === 'ASURA') {
                    bgmName = 'shura_music';
                }
                this.playMusic(bgmName);
            }
        }
        // 觸發靜音狀態變更事件
        try {
            if (typeof EventSystem !== 'undefined' && typeof GameEvents !== 'undefined' && EventSystem.trigger) {
                EventSystem.trigger(GameEvents.AUDIO_MUTED_CHANGED, { isMuted: this.isMuted });
            }
        } catch (_) {}
        
        return this.isMuted;
    },

    // 顯式設置靜音狀態（供自動暫停使用）
    setMuted: function(flag) {
        const prev = this.isMuted;
        this.isMuted = !!flag;
        if (this.isMuted) {
            this.stopAllMusic();
        } else if (prev !== this.isMuted) {
            // 解除靜音時恢復當前場景音樂
            if (Game.isGameOver) {
                // 不播放音樂
            } else if (Game.boss) {
                this.playMusic('boss_music');
            } else {
                let bgmName = 'game_music';
                // 第4張地圖（花園）使用 game_music2（優先於修羅模式）
                if (typeof Game !== 'undefined' && Game.selectedMap && Game.selectedMap.id === 'garden') {
                    bgmName = 'game_music2';
                } else if (typeof Game !== 'undefined' && Game.selectedDifficultyId === 'ASURA') {
                    bgmName = 'shura_music';
                }
                this.playMusic(bgmName);
            }
        }
        // 觸發靜音狀態變更事件
        try {
            if (typeof EventSystem !== 'undefined' && typeof GameEvents !== 'undefined' && EventSystem.trigger) {
                EventSystem.trigger(GameEvents.AUDIO_MUTED_CHANGED, { isMuted: this.isMuted });
            }
        } catch (_) {}
        return this.isMuted;
    },
    
    // 設置音效音量
    setSoundVolume: function(volume) {
        this.soundVolume = volume;
        
        // 更新所有已加載音效的音量
        for (const key in this.sounds) {
            if (this.sounds.hasOwnProperty(key) && this.sounds[key].volume !== undefined) {
                this.sounds[key].volume = volume;
            }
        }
    },
    
    // 設置音樂音量
    setMusicVolume: function(volume) {
        this.musicVolume = volume;
        
        // 更新所有已加載音樂的音量
        for (const key in this.music) {
            if (this.music.hasOwnProperty(key) && this.music[key].volume !== undefined) {
                this.music[key].volume = volume;
            }
        }
    }
};

// 新增：音訊場景管理器（集中切換與同步）
const AudioScene = {
    current: null, // 'menu' | 'game' | 'boss' | null
    enterMenu: function() {
        if (AudioManager.isMuted) return;
        const track = AudioManager.music && AudioManager.music['menu_music'];
        const isPlaying = track && track.paused === false;
        if (this.current === 'menu' && isPlaying) return;
        this.current = 'menu';
        try {
            if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                AudioManager.playMusic('menu_music');
            }
        } catch (_) {}
    },
    enterGame: function() {
        if (AudioManager.isMuted) return;
        // 若目前場景中已存在 BOSS，改為進入 BOSS 場景，避免誤切回一般 BGM
        try {
            if (typeof Game !== 'undefined' && Game.boss) {
                this.enterBoss();
                return;
            }
        } catch (_) {}
        
        // 一般遊戲場景 BGM
        this.current = 'game';
        try {
            if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                let bgmName = 'game_music';
                // 第4張地圖（花園）使用 game_music2（優先於修羅模式）
                if (typeof Game !== 'undefined' && Game.selectedMap && Game.selectedMap.id === 'garden') {
                    bgmName = 'game_music2';
                } else if (typeof Game !== 'undefined' && Game.selectedDifficultyId === 'ASURA') {
                    bgmName = 'shura_music';
                }
                AudioManager.playMusic(bgmName);
            }
        } catch (_) {}
    },
    enterBoss: function() {
        if (AudioManager.isMuted) return;
        if (this.current === 'boss') return;
        this.current = 'boss';
        try {
            if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                AudioManager.playMusic('boss_music');
            }
        } catch (_) {}
    },
    // 根據遊戲狀態同步場景音樂
    sync: function() {
        try {
            if (typeof Game === 'undefined') return;
            if (AudioManager.isMuted) return;
            if (Game.isGameOver) {
                this.current = null; // 不播放任何音樂
                return;
            }
            if (Game.boss) {
                this.enterBoss();
            } else {
                // 有選單開啟時也可能需要選單音樂，由外部明確呼叫 enterMenu
                this.enterGame();
            }
        } catch (_) {}
    }
};
