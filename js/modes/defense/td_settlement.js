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
            if ($(goldId)) $(goldId).textContent = `${stats.gold ?? 0} (${stats.totalGoldEarned ?? 0}/${stats.totalGoldSpent ?? 0})`;
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
            } catch (err) {
                console.error('返回主選單時發生錯誤:', err);
            }
        }
    };
    
    window.TDDefenseSettlement = TDDefenseSettlement;
})();


