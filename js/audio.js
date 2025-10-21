// 音效系統
const AudioManager = {
    sounds: {},
    music: {},
    isMuted: false,
    musicVolume: 0.5,
    soundVolume: 0.7,
    
    init: function() {
        // 初始化音效
        this.loadSounds();
        
        console.log('音效系統已初始化');
    },
    
    // 加載所有音效
    loadSounds: function() {
        // 音效列表
        const soundsToLoad = [
            { name: 'player_hurt', src: 'assets/audio/player_hurt.mp3' },
            { name: 'enemy_hurt', src: 'assets/audio/enemy_hurt.mp3' },
            { name: 'enemy_death', src: 'assets/audio/enemy_death.mp3' },
            { name: 'level_up', src: 'assets/audio/level_up.mp3' },
            { name: 'collect_exp', src: 'assets/audio/collect_exp.mp3' },
            { name: 'dagger_shoot', src: 'assets/audio/dagger_shoot.mp3' },
            { name: 'fireball_shoot', src: 'assets/audio/fireball_shoot.mp3' },
            { name: 'lightning_shoot', src: 'assets/audio/lightning_shoot.mp3' },
            { name: 'laser_shoot', src: 'assets/audio/laser_shoot.mp3' },
            { name: 'zaps', src: 'assets/audio/zaps.mp3' },
            { name: 'sing_cast', src: 'assets/audio/LA.mp3' },
            { name: 'game_over', src: 'assets/audio/game_over.mp3' },
            { name: 'victory', src: 'assets/audio/victory.mp3' },
            { name: 'button_click', src: 'assets/audio/button_click.mp3' },
            { name: 'button_click2', src: 'assets/audio/button_click2.mp3' },
            // 新增：Boss火彈命中玩家音效
            { name: 'bo', src: 'assets/audio/bo.mp3' }
        ];
        
        // 音樂列表
        const musicToLoad = [
            { name: 'menu_music', src: 'assets/audio/menu_music.mp3' },
            { name: 'game_music', src: 'assets/audio/game_music.mp3' },
            { name: 'boss_music', src: 'assets/audio/boss_music.mp3' }
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
        
        try {
            // 克隆音效以允許重疊播放
            const sound = this.sounds[name].cloneNode();
            sound.volume = this.soundVolume;
            sound.play();
        } catch (e) {
            console.error(`播放音效 ${name} 時出錯:`, e);
        }
    },
    
    // 播放音樂
    playMusic: function(name) {
        if (this.isMuted || !this.music[name]) return;
        
        // 停止所有其他音樂
        this.stopAllMusic();
        
        try {
            this.music[name].currentTime = 0;
            this.music[name].play();
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
                this.playMusic('game_music');
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
                this.playMusic('game_music');
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
        if (this.current === 'menu') return;
        this.current = 'menu';
        try {
            if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                AudioManager.playMusic('menu_music');
            }
        } catch (_) {}
    },
    enterGame: function() {
        if (AudioManager.isMuted) return;
        if (this.current === 'game') return;
        this.current = 'game';
        try {
            if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                AudioManager.playMusic('game_music');
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
