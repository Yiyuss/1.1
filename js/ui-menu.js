// UI選單系統組件
const UIMenu = {
    init: function() {
        // 獲取UI元素
        this.skillsMenu = document.getElementById('skills-menu');
        this.skillsList = document.getElementById('skills-list');
        this.skillsMusicSlider = document.getElementById('skills-music-volume');
        this.skillsSoundSlider = document.getElementById('skills-sound-volume');
        this.skillsMusicText = document.getElementById('skills-music-volume-text');
        this.skillsSoundText = document.getElementById('skills-sound-volume-text');
        this.skillsCoinsEl = document.getElementById('skills-coins');
        
        // 綁定技能頁音量滑桿事件
        this.bindVolumeControls();
    },
    
    // 綁定音量控制
    bindVolumeControls: function() {
        if (this.skillsMusicSlider && this.skillsMusicText) {
            this.skillsMusicSlider.addEventListener('input', () => {
                if (typeof AudioManager !== 'undefined' && AudioManager.setMusicVolume) {
                    AudioManager.setMusicVolume(parseFloat(this.skillsMusicSlider.value));
                }
                this.skillsMusicText.textContent = Math.round(this.skillsMusicSlider.value * 100) + '%';
            });
        }
        
        if (this.skillsSoundSlider && this.skillsSoundText) {
            this.skillsSoundSlider.addEventListener('input', () => {
                if (typeof AudioManager !== 'undefined' && AudioManager.setSoundVolume) {
                    AudioManager.setSoundVolume(parseFloat(this.skillsSoundSlider.value));
                }
                this.skillsSoundText.textContent = Math.round(this.skillsSoundSlider.value * 100) + '%';
            });
        }
    },
    
    // 顯示技能選單
    showSkillsMenu: function() {
        if (this.skillsMenu) {
            this.skillsMenu.style.display = 'flex';
            
            // 暫停遊戲
            if (typeof Game !== 'undefined' && Game.pause) {
                Game.pause();
            }
            
            // 觸發技能選單顯示事件
            if (typeof EventSystem !== 'undefined') {
                EventSystem.trigger(GameEvents.SKILLS_MENU_SHOW);
            }
        }
    },
    
    // 隱藏技能選單
    hideSkillsMenu: function() {
        if (this.skillsMenu) {
            this.skillsMenu.style.display = 'none';
            
            // 恢復遊戲
            if (typeof Game !== 'undefined' && Game.resume) {
                Game.resume();
            }
            
            // 觸發技能選單隱藏事件
            if (typeof EventSystem !== 'undefined') {
                EventSystem.trigger(GameEvents.SKILLS_MENU_HIDE);
            }
        }
    },
    
    // 更新技能列表
    updateSkillsList: function(skills) {
        if (!this.skillsList) return;
        
        // 清空技能列表
        this.skillsList.innerHTML = '';
        
        // 添加技能
        skills.forEach(skill => {
            const skillElement = document.createElement('div');
            skillElement.className = 'skill-item';
            skillElement.innerHTML = `
                <h3>${skill.name}</h3>
                <p>${skill.description}</p>
                <div class="skill-level">等級: ${skill.level}/${skill.maxLevel}</div>
                <div class="skill-cost">升級費用: ${skill.cost}</div>
            `;
            
            // 添加升級按鈕
            const upgradeButton = document.createElement('button');
            upgradeButton.textContent = '升級';
            upgradeButton.disabled = !skill.canUpgrade;
            upgradeButton.addEventListener('click', () => {
                if (typeof skill.upgrade === 'function') {
                    skill.upgrade();
                    this.updateSkillsList(skills);
                }
            });
            
            skillElement.appendChild(upgradeButton);
            this.skillsList.appendChild(skillElement);
        });
    }
};