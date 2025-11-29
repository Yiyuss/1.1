// 防禦模式專用結算模組（獨立於挑戰模式）
(function () {
    const $ = (id) => document.getElementById(id);
    
    function formatTime(sec) {
        const total = Math.max(0, Math.floor(sec || 0));
        const m = String(Math.floor(total / 60)).padStart(2, '0');
        const s = String(total % 60).padStart(2, '0');
        return `${m}:${s}`;
    }
    
    const TDDefenseSettlement = {
        isVisible: false,
        currentType: null,
        
        show(type, stats = {}) {
            try {
                if (this.isVisible) return;
                this.isVisible = true;
                this.currentType = type === 'victory' ? 'victory' : 'failure';
                
                // 勝利時檢查是否通關LV1地圖並解鎖成就
                if (type === 'victory') {
                    this.checkDefenseLv1Clear();
                }
                
                this.stopAllAudio();
                
                const gameScreen = $('game-screen');
                if (gameScreen) gameScreen.classList.add('hidden');
                
                this.toggleScreens(this.currentType);
                this.updateSummary(this.currentType, stats);
                this.playVideo(this.currentType);
            } catch (err) {
                console.error('顯示防禦模式結算時發生錯誤:', err);
                this.returnToMenu();
            }
        },
        
        checkDefenseLv1Clear() {
            try {
                // 檢查當前選中的地圖是否為LV1（defense-1）
                let selectedMap = null;
                try {
                    if (typeof window !== 'undefined' && window.Game && window.Game.selectedMap) {
                        selectedMap = window.Game.selectedMap;
                    }
                } catch (_) {}
                
                // 如果無法從Game獲取，嘗試從tdGame獲取
                if (!selectedMap && typeof window !== 'undefined' && window.debugTDGame) {
                    try {
                        selectedMap = window.debugTDGame.selectedMap;
                    } catch (_) {}
                }
                
                // 檢查是否為defense-1地圖
                let isLv1Map = false;
                if (selectedMap) {
                    if (typeof selectedMap === 'object') {
                        isLv1Map = (
                            selectedMap.id === 'defense-1' ||
                            (selectedMap.name && selectedMap.name.indexOf('LV1') >= 0) ||
                            (selectedMap.name && selectedMap.name.indexOf('魔法糖果煉金坊') >= 0)
                        );
                    } else if (typeof selectedMap === 'string') {
                        isLv1Map = selectedMap === 'defense-1';
                    }
                }
                
                // 如果無法從selectedMap判斷，檢查CONFIG.MAPS中的地圖配置
                if (!isLv1Map && typeof CONFIG !== 'undefined' && CONFIG.MAPS) {
                    try {
                        const mapConfig = CONFIG.MAPS.find(m => m.id === 'defense-1');
                        if (mapConfig) {
                            // 如果當前選中的地圖配置匹配defense-1，則認為是LV1
                            if (selectedMap && typeof selectedMap === 'object') {
                                isLv1Map = (
                                    selectedMap.id === mapConfig.id ||
                                    (selectedMap.name && selectedMap.name === mapConfig.name)
                                );
                            }
                        }
                    } catch (_) {}
                }
                
                // 如果仍然無法判斷，但當前是防禦模式，且沒有其他地圖解鎖，默認認為是LV1
                if (!isLv1Map) {
                    try {
                        // 檢查是否有其他防禦地圖已解鎖（簡單判斷：如果只有defense-1可選，則認為是LV1）
                        const defenseMaps = typeof CONFIG !== 'undefined' && CONFIG.MAPS 
                            ? CONFIG.MAPS.filter(m => m.id && m.id.indexOf('defense') === 0)
                            : [];
                        if (defenseMaps.length === 1 && defenseMaps[0].id === 'defense-1') {
                            isLv1Map = true;
                        }
                    } catch (_) {}
                }
                
                if (isLv1Map) {
                    // 解鎖成就
                    if (typeof Achievements !== 'undefined' && Achievements.unlock) {
                        Achievements.unlock('DEFENSE_LV1_CLEAR');
                    }
                }
            } catch (err) {
                console.warn('檢查防禦模式LV1通關成就時發生錯誤:', err);
            }
        },
        
        toggleScreens(type) {
            const victoryScreen = $('defense-victory-screen');
            const failureScreen = $('defense-gameover-screen');
            if (victoryScreen) victoryScreen.classList[type === 'victory' ? 'remove' : 'add']('hidden');
            if (failureScreen) failureScreen.classList[type === 'failure' ? 'remove' : 'add']('hidden');
        },
        
        updateSummary(type, stats) {
            const timeId = type === 'victory' ? 'defense-victory-time' : 'defense-failure-time';
            const waveId = type === 'victory' ? 'defense-victory-wave' : 'defense-failure-wave';
            const goldId = type === 'victory' ? 'defense-victory-gold' : 'defense-failure-gold';
            const killId = type === 'victory' ? 'defense-victory-kill' : 'defense-failure-kill';
            const towerId = type === 'victory' ? 'defense-victory-tower' : 'defense-failure-tower';
            const baseId = type === 'victory' ? 'defense-victory-base' : 'defense-failure-base';
            
            if ($(timeId)) $(timeId).textContent = formatTime(stats.timeSec);
            if ($(waveId)) $(waveId).textContent = `${Math.max(1, stats.wave || 1)}/${stats.maxWave || 30}`;
            if ($(goldId)) $(goldId).textContent = stats.enemyGoldEarned ?? 0;
            if ($(killId)) $(killId).textContent = stats.enemiesKilled ?? 0;
            if ($(towerId)) $(towerId).textContent = stats.towersBuilt ?? 0;
            if ($(baseId)) $(baseId).textContent = `${stats.baseHealth ?? 0}/${stats.maxBaseHealth ?? 0}`;
        },
        
        playVideo(type) {
            const videoId = type === 'victory' ? 'defense-victory-video' : 'defense-gameover-video';
            const videoEl = $(videoId);
            if (!videoEl) {
                this.returnToMenu();
                return;
            }
            
            try { videoEl.pause(); } catch (_) {}
            videoEl.loop = false;
            videoEl.currentTime = 0;
            videoEl.muted = false;
            
            const onEnded = () => {
                videoEl.removeEventListener('ended', onEnded);
                this.returnToMenu();
            };
            videoEl.addEventListener('ended', onEnded);
            
            const playPromise = videoEl.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                    const clickPlay = () => {
                        videoEl.play().catch(() => {});
                        document.removeEventListener('click', clickPlay);
                    };
                    document.addEventListener('click', clickPlay, { once: true });
                });
            }
        },
        
        stopAllAudio() {
            try {
                if (typeof AudioManager !== 'undefined' && AudioManager.stopAllMusic) {
                    AudioManager.stopAllMusic();
                }
            } catch (_) {}
            try {
                if (typeof AudioManager !== 'undefined' && AudioManager.stopAllSounds) {
                    AudioManager.stopAllSounds();
                }
            } catch (_) {}
        },
        
        returnToMenu() {
            try {
                const wasVictory = this.currentType === 'victory';
                this.isVisible = false;
                this.currentType = null;
                
                ['defense-victory-screen', 'defense-gameover-screen'].forEach(id => {
                    const el = $(id);
                    if (el) el.classList.add('hidden');
                });
                ['defense-victory-video', 'defense-gameover-video'].forEach(id => {
                    const video = $(id);
                    if (video) {
                        try { video.pause(); } catch (_) {}
                        video.currentTime = 0;
                    }
                });
                
                const startScreen = $('start-screen');
                const gameScreen = $('game-screen');
                if (gameScreen) gameScreen.classList.add('hidden');
                if (startScreen) startScreen.classList.remove('hidden');
                
                // 防禦模式結束時，確保清除所有防禦專用 GIF 疊加，避免汙染其他模式的圖層
                try {
                    if (typeof window !== 'undefined' && window.TDGifOverlay && typeof window.TDGifOverlay.clearAll === 'function') {
                        window.TDGifOverlay.clearAll();
                    }
                } catch (_) {}
                
                if (window.GameModeManager && typeof window.GameModeManager.stop === 'function') {
                    window.GameModeManager.stop();
                }
                
                // 確保選單音樂
                try {
                    if (typeof AudioScene !== 'undefined' && typeof AudioScene.enterMenu === 'function') {
                        AudioScene.enterMenu();
                    } else if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                        AudioManager.playMusic('menu_music');
                    }
                } catch (_) {}
                
                // 回到主選單後（僅勝利流程）顯示成就彈窗與音效，與挑戰模式相同
                if (wasVictory) {
                    try {
                        if (typeof Achievements !== 'undefined') {
                            const ids = (typeof Achievements.consumeSessionUnlocked === 'function')
                                ? Achievements.consumeSessionUnlocked()
                                : (typeof Achievements.getSessionUnlocked === 'function' ? Achievements.getSessionUnlocked() : []);
                            if (ids && ids.length) {
                                // 使用與生存模式相同的成就彈窗顯示邏輯
                                if (typeof UI !== 'undefined' && typeof UI.showAchievementsUnlockModal === 'function') {
                                    UI.showAchievementsUnlockModal(ids);
                                }
                                // 播放成就解鎖音效（與生存模式相同）- 確保音效播放
                                try { 
                                    if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                                        // 確保音效系統未靜音
                                        const wasMuted = AudioManager.isMuted;
                                        if (wasMuted) {
                                            AudioManager.isMuted = false;
                                        }
                                        AudioManager.playSound('achievements');
                                        // 恢復靜音狀態（如果之前是靜音的）
                                        if (wasMuted) {
                                            AudioManager.isMuted = true;
                                        }
                                    }
                                } catch (err) {
                                    console.warn('播放成就音效失敗:', err);
                                }
                            }
                        }
                    } catch (err) {
                        console.warn('檢查成就解鎖時出錯:', err);
                    }
                }
            } catch (err) {
                console.error('返回主選單時發生錯誤:', err);
            }
        }
    };
    
    window.TDDefenseSettlement = TDDefenseSettlement;
})();


