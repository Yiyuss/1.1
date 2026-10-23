// 防禦塔TD增強UI系統
// 提供完整的遊戲界面，包括建造選單、波次資訊、資源顯示等

class TDEnhancedUI {
    constructor(game, ctx) {
        this.game = game;
        this.ctx = ctx;
        this.canvas = ctx.canvas;
        
        // UI狀態
        this.showTowerPanel = false;
        this.showUpgradePanel = false;
        this.selectedTower = null;
        this.hoveredCell = null;
        
        // 面板位置（已移至renderMainPanel中定义，这里保留用于兼容）
        this.panelX = 10;
        this.panelY = Math.max(10, this.canvas.height - 200 - 10);
        this.panelWidth = 300;
        this.panelHeight = 200;
        
        // 按鈕狀態
        this.buttons = [];
        this.hoveredButton = null;
        
        // 顏色主題
        this.colors = {
            primary: '#2C3E50',
            secondary: '#34495E',
            accent: '#3498DB',
            success: '#27AE60',
            warning: '#F39C12',
            danger: '#E74C3C',
            text: '#ECF0F1',
            textSecondary: '#BDC3C7'
        };
        
        this.initButtons();
    }
    
    // 初始化按鈕
    initButtons() {
        // 主要面板與建造按鈕已移交給 DOM 版本 UI，這裡不再建立任何 Canvas 按鈕
        this.buttons = [];
    }
    
    // 更新UI
    update(mouseX, mouseY) {
        // 更新滑鼠位置
        this.mouseX = mouseX;
        this.mouseY = mouseY;
        
        // 更新懸停的格子
        this.updateHoveredCell(mouseX, mouseY);
        
        // 更新懸停的按鈕
        this.updateHoveredButton(mouseX, mouseY);
        
        // 更新選中的防禦塔
        this.updateSelectedTower();
    }
    
    // 更新懸停的格子
    updateHoveredCell(x, y) {
        const worldX = x + Math.round(this.game.camera.x);
        const worldY = y + Math.round(this.game.camera.y);
        const cell = this.game.map.getNearestCell(worldX, worldY);
        this.hoveredCell = cell;
    }
    
    // 更新懸停的按鈕
    updateHoveredButton(x, y) {
        this.hoveredButton = null;
        
        for (const button of this.buttons) {
            if (x >= button.x && x <= button.x + button.width &&
                y >= button.y && y <= button.y + button.height) {
                this.hoveredButton = button;
                break;
            }
        }
    }
    
    // 更新選中的防禦塔
    updateSelectedTower() {
        if (this.game.selectedTower) {
            this.selectedTower = this.game.selectedTower;
            this.showUpgradePanel = true;
        } else if (this.selectedTower) {
            // 當遊戲層級取消選取、防止資訊持續顯示
            this.selectedTower = null;
            this.showUpgradePanel = false;
        }
    }
    
    // 處理點擊（舊版面板已由 DOM 取代，這裡僅保留返回 false）
    handleClick(x, y) {
        return false;
    }
    
    // 檢查是否在升級面板內
    isInUpgradePanel(x, y) {
        if (!this.showUpgradePanel || !this.selectedTower) return false;
        
        const panelX = this.canvas.width - 320;
        const panelY = 150;
        const panelWidth = 300;
        const panelHeight = 200;
        
        return x >= panelX && x <= panelX + panelWidth &&
               y >= panelY && y <= panelY + panelHeight;
    }
    
    // 處理升級面板點擊
    handleUpgradePanelClick(x, y) {
        const panelX = this.canvas.width - 320;
        const panelY = 150;
        
        // 升級按鈕
        const upgradeButton = {
            x: panelX + 20,
            y: panelY + 120,
            width: 120,
            height: 40
        };
        
        // 出售按鈕
        const sellButton = {
            x: panelX + 160,
            y: panelY + 120,
            width: 120,
            height: 40
        };
        
        if (x >= upgradeButton.x && x <= upgradeButton.x + upgradeButton.width &&
            y >= upgradeButton.y && y <= upgradeButton.y + upgradeButton.height) {
            this.game.upgradeTower(this.selectedTower);
        } else if (x >= sellButton.x && x <= sellButton.x + sellButton.width &&
                   y >= sellButton.y && y <= sellButton.y + sellButton.height) {
            this.game.sellTower(this.selectedTower);
            this.showUpgradePanel = false;
            this.selectedTower = null;
        }
    }
    
    // 渲染UI（舊版主面板與按鈕已移交給 DOM，這裡只保留建造預覽）
    render() {
        this.renderBuildPreview();
    }
    
    // 渲染主要資訊條（上方徽章布局）
    renderMainPanel() {
        const gameState = this.game.getGameState();
        const ctx = this.ctx;
        const chipWidth = 110;
        const chipHeight = 40;
        const chipSpacing = 10;
        const remainingEnemies = this.game.enemyManager ? this.game.enemyManager.getEnemyCount() : 0;
        const prepSeconds = Math.max(0, Math.ceil(gameState.wavePrepTimer || 0));
        const activeSeconds = Math.max(0, Math.floor(this.game.config.GAME.WAVE_TIME_LIMIT - (gameState.waveTimer || 0)));
        const countdownValue = gameState.isWaveActive
            ? (prepSeconds > 0 ? `${prepSeconds}s` : `${activeSeconds}s`)
            : '待命';
        const waveDisplay = Math.min(this.game.config.GAME.MAX_WAVES, (gameState.wave || 0) + 1);
        const chips = [
            { icon: '💠', label: this.game.config.RESOURCES.RESOURCE_NAME, value: `${gameState.gold}`, accent: '#F5D76E' },
            { icon: '🌀', label: '波次', value: `${waveDisplay}/${this.game.config.GAME.MAX_WAVES}`, accent: '#7EC9FF' },
            { icon: '⏳', label: gameState.wavePrepTimer > 0 ? '準備' : '倒數', value: countdownValue, accent: '#FBC252' },
            { icon: '👾', label: '剩餘敵人', value: `${remainingEnemies}`, accent: '#5CC8FF' },
            { icon: '💥', label: '擊殺', value: `${gameState.enemiesKilled}`, accent: '#FF7F7F' }
        ];
        const totalWidth = chipWidth * chips.length + chipSpacing * (chips.length - 1);
        const startX = (this.canvas.width - totalWidth) / 2;
        const startY = 14;
        
        chips.forEach((chip, index) => {
            const x = startX + index * (chipWidth + chipSpacing);
            this.renderHudChip(x, startY, chipWidth, chipHeight, chip);
        });
    }
    
    renderHudChip(x, y, width, height, data) {
        const ctx = this.ctx;
        ctx.save();
        const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
        gradient.addColorStop(0, 'rgba(12, 18, 32, 0.92)');
        gradient.addColorStop(1, 'rgba(15, 24, 38, 0.88)');
        this.drawRoundedRectPath(x, y, width, height, 10);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = this.hexToRgba(data.accent, 0.4);
        ctx.lineWidth = 1;
        this.drawRoundedRectPath(x, y, width, height, 10);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(x + 18, y + height / 2, 12, 0, Math.PI * 2);
        ctx.fillStyle = this.hexToRgba(data.accent, 0.2);
        ctx.fill();
        ctx.font = '14px "Microsoft JhengHei", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(data.icon || '', x + 18, y + height / 2 + 1);
        
        ctx.textAlign = 'left';
        ctx.fillStyle = '#9DB3DA';
        ctx.font = '11px "Microsoft JhengHei", Arial';
        ctx.fillText(data.label, x + 36, y + 16);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px "Microsoft JhengHei", Arial';
        ctx.fillText(data.value, x + 36, y + 32);
        ctx.restore();
    }
    
    
    getHealthTagColor(gameState) {
        const percent = gameState.baseHealth / gameState.maxBaseHealth;
        if (percent > 0.6) return '#64D47A';
        if (percent > 0.3) return '#FFB347';
        return '#FF5C5C';
    }
    
    hexToRgba(hex, alpha) {
        const normalized = hex.replace('#', '');
        const bigint = parseInt(normalized, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    drawRoundedRectPath(x, y, width, height, radius) {
        this.ctx.beginPath();
        if (typeof this.ctx.roundRect === 'function') {
            this.ctx.roundRect(x, y, width, height, radius);
        } else {
            this.drawLegacyRoundedRect(x, y, width, height, radius);
        }
        this.ctx.closePath();
    }
    
    drawLegacyRoundedRect(x, y, width, height, radius) {
        const ctx = this.ctx;
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
    }
    
    // 渲染按鈕
    renderButtons() {
        for (const button of this.buttons) {
            if (button.id === 'startWave') {
                button.text = this.getStartWaveButtonLabel();
            }
            this.renderButton(button);
        }
    }
    
    // 渲染單個按鈕（根據類型）
    renderButton(button) {
        if (button.style === 'tower') {
            this.renderTowerCard(button);
        } else {
            this.renderPrimaryButton(button);
        }
    }
    
    renderPrimaryButton(button) {
        const isHovered = this.hoveredButton === button;
        const isDisabled = this.isButtonDisabled(button);
        
        if (!isDisabled) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            this.ctx.fillRect(button.x + 3, button.y + 3, button.width, button.height);
        }
        
        if (isDisabled) {
            this.ctx.fillStyle = 'rgba(100, 100, 100, 0.45)';
        } else {
            const gradient = this.ctx.createLinearGradient(button.x, button.y, button.x, button.y + button.height);
            const r = parseInt(button.color.slice(1, 3), 16);
            const g = parseInt(button.color.slice(3, 5), 16);
            const b = parseInt(button.color.slice(5, 7), 16);
            const lightR = Math.min(255, r + 30);
            const lightG = Math.min(255, g + 30);
            const lightB = Math.min(255, b + 30);
            gradient.addColorStop(0, `rgba(${lightR}, ${lightG}, ${lightB}, ${isHovered ? 0.95 : 0.85})`);
            gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${isHovered ? 0.9 : 0.8})`);
            this.ctx.fillStyle = gradient;
        }
        this.ctx.fillRect(button.x, button.y, button.width, button.height);
        
        this.ctx.strokeStyle = isHovered ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = isHovered ? 3 : 2;
        this.ctx.strokeRect(button.x, button.y, button.width, button.height);
        
        if (!isDisabled) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(button.x + 2, button.y + 2, button.width - 4, button.height - 4);
        }
        
        this.ctx.fillStyle = isDisabled ? 'rgba(150, 150, 150, 0.7)' : '#FFFFFF';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(button.text, button.x + button.width / 2, button.y + button.height / 2);
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'alphabetic';
    }
    
    renderTowerCard(button) {
        const ctx = this.ctx;
        const isHovered = this.hoveredButton === button;
        const isDisabled = this.isButtonDisabled(button);
        const gameState = this.game.getGameState();
        const canAfford = !isDisabled && gameState.gold >= button.price;
        ctx.save();
        
        // 現代化設計：橫向卡片式布局，參考業界塔防遊戲
        // 整體尺寸調整：更寬更扁的卡片
        const cardPadding = 12;
        const iconSize = 56;
        const iconMargin = 14;
        
        // 卡片背景（扁平化設計，帶微妙的漸變）
        const bgGradient = ctx.createLinearGradient(
            button.x, button.y,
            button.x, button.y + button.height
        );
        
        if (isDisabled) {
            bgGradient.addColorStop(0, 'rgba(25, 25, 30, 0.85)');
            bgGradient.addColorStop(1, 'rgba(18, 18, 22, 0.8)');
        } else if (isHovered) {
            bgGradient.addColorStop(0, 'rgba(30, 35, 45, 0.95)');
            bgGradient.addColorStop(1, 'rgba(20, 25, 35, 0.9)');
        } else {
            bgGradient.addColorStop(0, 'rgba(28, 32, 42, 0.9)');
            bgGradient.addColorStop(1, 'rgba(22, 26, 36, 0.85)');
        }
        
        // 圓角矩形背景
        this.drawRoundedRectPath(button.x, button.y, button.width, button.height, 12);
        ctx.fillStyle = bgGradient;
        ctx.fill();
        
        // 左側彩色邊框條（業界常見設計）
        const borderWidth = 4;
        ctx.fillStyle = isDisabled 
            ? this.hexToRgba(button.color, 0.3)
            : (isHovered ? this.hexToRgba(button.color, 0.9) : this.hexToRgba(button.color, 0.7));
        ctx.fillRect(button.x, button.y, borderWidth, button.height);
        
        // 右側邊框（細線）
        ctx.strokeStyle = isDisabled 
            ? 'rgba(100, 100, 100, 0.3)'
            : (isHovered ? this.hexToRgba(button.color, 0.4) : 'rgba(150, 150, 150, 0.2)');
        ctx.lineWidth = 1;
        this.drawRoundedRectPath(button.x, button.y, button.width, button.height, 12);
        ctx.stroke();
        
        // Icon 區域（左側，方形設計）
        const iconX = button.x + iconMargin;
        const iconY = button.y + (button.height - iconSize) / 2;
        
        // Icon 背景（方形，帶圓角）
        const iconBgGradient = ctx.createLinearGradient(iconX, iconY, iconX + iconSize, iconY + iconSize);
        iconBgGradient.addColorStop(0, this.hexToRgba(button.color, isDisabled ? 0.15 : 0.25));
        iconBgGradient.addColorStop(1, this.hexToRgba(button.color, isDisabled ? 0.08 : 0.15));
        
        this.drawRoundedRectPath(iconX, iconY, iconSize, iconSize, 10);
        ctx.fillStyle = iconBgGradient;
        ctx.fill();
        
        // Icon 邊框
        ctx.strokeStyle = this.hexToRgba(button.color, isDisabled ? 0.3 : (isHovered ? 0.8 : 0.5));
        ctx.lineWidth = isHovered ? 2.5 : 2;
        this.drawRoundedRectPath(iconX, iconY, iconSize, iconSize, 10);
        ctx.stroke();
        
        // Icon 區：一般情況顯示文字；
        // - 洛可洛斯特使用 sniper2.png 填滿方形
        // - 瑪格麗特使用 ICE2.png 填滿方形
        // - 森森鈴蘭使用 element2.png 填滿方形
        const isSniper = button.id === 'buildArrow';
        const isMargaret = button.id === 'buildSlow';
        const isLily = button.id === 'buildMagic';
        let iconImage = null;
        if (this.game && this.game.resources && typeof this.game.resources.getImage === 'function') {
            if (isSniper) {
                iconImage = this.game.resources.getImage('sniper2') || this.game.resources.getImage('sniper2.png');
            } else if (isMargaret) {
                iconImage = this.game.resources.getImage('ICE2') || this.game.resources.getImage('ICE2.png');
            } else if (isLily) {
                iconImage = this.game.resources.getImage('element2') || this.game.resources.getImage('element2.png');
            }
        }
        if (iconImage) {
            // 使用對應圖片填滿圖示方塊，保持一點內縮避免貼邊
            const inset = 4;
            ctx.save();
            this.drawRoundedRectPath(iconX + inset, iconY + inset, iconSize - inset * 2, iconSize - inset * 2, 8);
            ctx.clip();
            ctx.drawImage(
                iconImage,
                iconX + inset,
                iconY + inset,
                iconSize - inset * 2,
                iconSize - inset * 2
            );
            ctx.restore();
        } else {
            // 其他塔維持 emoji 圖示
            ctx.font = '32px "Microsoft JhengHei", Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isDisabled ? 'rgba(150, 150, 150, 0.5)' : '#FFFFFF';
            ctx.fillText(button.icon || '', iconX + iconSize / 2, iconY + iconSize / 2);
        }
        
        // 文字區域（中間）- 修正排版，價格標籤放在右上角
        const textX = iconX + iconSize + 14;
        const textY = button.y + 14;
        const textMaxWidth = button.width - (textX - button.x) - cardPadding - 50; // 預留右上角價格空間
        
        // 標題（塔名稱）- 上方
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isDisabled ? 'rgba(150, 150, 150, 0.7)' : '#FFFFFF';
        ctx.font = 'bold 17px "Microsoft JhengHei", Arial';
        ctx.fillText(button.text, textX, textY);
        
        // 描述文字（更小更淡）- 標題下方，可以完整顯示
        ctx.fillStyle = isDisabled ? 'rgba(120, 120, 120, 0.5)' : 'rgba(180, 200, 220, 0.8)';
        ctx.font = '11px "Microsoft JhengHei", Arial';
        const descY = textY + 22;
        const descText = button.description || '塔防建議配置';
        ctx.fillText(descText, textX, descY);
        
        // 價格區域（右上角，非常小的標籤）- 不擋到文字
        const priceX = button.x + button.width - cardPadding;
        const priceY = button.y + cardPadding;
        
        // 價格文字（先測量大小）
        const priceText = `${button.price}`;
        ctx.font = 'bold 11px "Microsoft JhengHei", Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        const priceMetrics = ctx.measureText(priceText);
        const priceWidth = priceMetrics.width + 8; // 非常小的標籤
        const priceHeight = 18;
        const priceBgX = priceX - priceWidth;
        const priceBgY = priceY;
        
        // 價格標籤背景（非常小的漸變標籤）
        const priceGradient = ctx.createLinearGradient(priceBgX, priceBgY, priceBgX, priceBgY + priceHeight);
        if (isDisabled) {
            priceGradient.addColorStop(0, 'rgba(80, 80, 80, 0.5)');
            priceGradient.addColorStop(1, 'rgba(60, 60, 60, 0.4)');
        } else if (!canAfford) {
            priceGradient.addColorStop(0, 'rgba(200, 60, 60, 0.8)');
            priceGradient.addColorStop(1, 'rgba(160, 40, 40, 0.7)');
        } else {
            priceGradient.addColorStop(0, this.hexToRgba(button.color, 0.9));
            priceGradient.addColorStop(1, this.hexToRgba(button.color, 0.75));
        }
        
        this.drawRoundedRectPath(priceBgX, priceBgY, priceWidth, priceHeight, 4);
        ctx.fillStyle = priceGradient;
        ctx.fill();
        
        // 價格標籤邊框（細線）
        ctx.strokeStyle = isDisabled 
            ? 'rgba(100, 100, 100, 0.4)'
            : (!canAfford ? 'rgba(255, 100, 100, 0.9)' : this.hexToRgba(button.color, 1.0));
        ctx.lineWidth = 1;
        this.drawRoundedRectPath(priceBgX, priceBgY, priceWidth, priceHeight, 4);
        ctx.stroke();
        
        // 價格文字（非常小的字體，右上角）
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px "Microsoft JhengHei", Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(priceText, priceX - 4, priceBgY + priceHeight / 2);
        
        // 懸停效果：輕微放大和發光
        if (isHovered && !isDisabled) {
            ctx.shadowColor = this.hexToRgba(button.color, 0.4);
            ctx.shadowBlur = 20;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.strokeStyle = this.hexToRgba(button.color, 0.3);
            ctx.lineWidth = 2;
            this.drawRoundedRectPath(button.x - 3, button.y - 3, button.width + 6, button.height + 6, 14);
            ctx.stroke();
            ctx.shadowColor = 'transparent';
        }
        
        // 資金不足時的警告效果
        if (!isDisabled && !canAfford) {
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            this.drawRoundedRectPath(button.x + 2, button.y + 2, button.width - 4, button.height - 4, 10);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        ctx.restore();
    }
    
    // 檢查按鈕是否禁用
    isButtonDisabled(button) {
        const gameState = this.game.getGameState();
        
        switch (button.id) {
            case 'startWave':
                if (gameState.isGameOver || gameState.isGameWon) return true;
                if (gameState.wave >= this.game.config.GAME.MAX_WAVES) return true;
                if (!gameState.isWaveActive) return false;
                return gameState.wavePrepTimer <= 0;
            case 'buildArrow':
                return gameState.gold < this.game.config.TOWERS.ARROW.cost || gameState.isGameOver || gameState.isGameWon;
            case 'buildMagic':
                return gameState.gold < this.game.config.TOWERS.MAGIC.cost || gameState.isGameOver || gameState.isGameWon;
            case 'buildSlow':
                return gameState.gold < this.game.config.TOWERS.SLOW.cost || gameState.isGameOver || gameState.isGameWon;
            default:
                return false;
        }
    }
    
    getStartWaveButtonLabel() {
        const gameState = this.game.getGameState();
        if (gameState.isGameOver) return '戰鬥結束';
        if (gameState.isGameWon) return '勝利完成';
        if (!gameState.isWaveActive) return '開始下一波';
        if (gameState.wavePrepTimer > 0) return '跳過準備';
        return '波次進行中';
    }
    
    // 渲染建造預覽
    renderBuildPreview() {
        if (!this.game.buildMode || !this.game.selectedTowerType || !this.hoveredCell) return;
        
        const cell = this.hoveredCell;
        const canBuild = this.game.map.canBuildAt(cell.centerX, cell.centerY);
        const camX = Math.round(this.game.camera.x);
        const camY = Math.round(this.game.camera.y);
        const screenX = cell.x - camX;
        const screenY = cell.y - camY;
        const screenCenterX = cell.centerX - camX;
        const screenCenterY = cell.centerY - camY;
        
        // 格子預覽
        this.ctx.strokeStyle = canBuild ? '#00FF00' : '#FF0000';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(screenX, screenY, this.game.config.MAP.GRID_SIZE, this.game.config.MAP.GRID_SIZE);
        this.ctx.setLineDash([]);
        
        // 射程預覽
        const towerConfig = this.game.config.TOWERS[this.game.selectedTowerType];
        if (towerConfig) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.beginPath();
            this.ctx.arc(screenCenterX, screenCenterY, towerConfig.range, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }
    
    // 渲染升級面板
    renderUpgradePanel() {
        if (!this.selectedTower) return;
        
        const panelX = this.canvas.width - 340;
        const panelY = 130;
        const panelWidth = 320;
        const panelHeight = 220;
        
        // 面板背景（帶圓角與輕微陰影）
        const ctx = this.ctx;
        ctx.save();
        const radius = 10;
        ctx.beginPath();
        ctx.moveTo(panelX + radius, panelY);
        ctx.lineTo(panelX + panelWidth - radius, panelY);
        ctx.quadraticCurveTo(panelX + panelWidth, panelY, panelX + panelWidth, panelY + radius);
        ctx.lineTo(panelX + panelWidth, panelY + panelHeight - radius);
        ctx.quadraticCurveTo(panelX + panelWidth, panelY + panelHeight, panelX + panelWidth - radius, panelY + panelHeight);
        ctx.lineTo(panelX + radius, panelY + panelHeight);
        ctx.quadraticCurveTo(panelX, panelY + panelHeight, panelX, panelY + panelHeight - radius);
        ctx.lineTo(panelX, panelY + radius);
        ctx.quadraticCurveTo(panelX, panelY, panelX + radius, panelY);
        ctx.closePath();
        
        // 卡片漸層背景
        const bgGradient = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight);
        bgGradient.addColorStop(0, 'rgba(23, 32, 42, 0.98)');
        bgGradient.addColorStop(1, 'rgba(17, 24, 32, 0.98)');
        ctx.fillStyle = bgGradient;
        ctx.fill();
        
        // 外框
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 頂部標題條
        const headerHeight = 40;
        const headerGradient = ctx.createLinearGradient(panelX, panelY, panelX, panelY + headerHeight);
        headerGradient.addColorStop(0, 'rgba(46, 204, 113, 0.95)');
        headerGradient.addColorStop(1, 'rgba(39, 174, 96, 0.95)');
        ctx.fillStyle = headerGradient;
        ctx.beginPath();
        ctx.moveTo(panelX + radius, panelY);
        ctx.lineTo(panelX + panelWidth - radius, panelY);
        ctx.quadraticCurveTo(panelX + panelWidth, panelY, panelX + panelWidth, panelY + radius);
        ctx.lineTo(panelX + panelWidth, panelY + headerHeight);
        ctx.lineTo(panelX, panelY + headerHeight);
        ctx.lineTo(panelX, panelY + radius);
        ctx.quadraticCurveTo(panelX, panelY, panelX + radius, panelY);
        ctx.closePath();
        ctx.fill();
        
        // 標題文字
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px "Microsoft JhengHei", Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${this.selectedTower.config.name} (等級 ${this.selectedTower.level + 1})`, panelX + 14, panelY + headerHeight / 2);
        
        // 內容區（屬性）
        const contentX = panelX + 16;
        let contentY = panelY + headerHeight + 16;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = '13px "Microsoft JhengHei", Arial';
        
        // 標籤與數值分兩列，提升可讀性
        ctx.fillStyle = 'rgba(200, 220, 240, 0.9)';
        ctx.fillText('傷害', contentX, contentY);
        ctx.fillText('射程', contentX, contentY + 20);
        ctx.fillText('射速', contentX, contentY + 40);
        
        const valueX = contentX + 60;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(this.selectedTower.damage), valueX, contentY);
        ctx.fillText(String(this.selectedTower.range), valueX, contentY + 20);
        ctx.fillText(`${(1000 / this.selectedTower.fireRate).toFixed(1)}/秒`, valueX, contentY + 40);
        
        // 分隔線
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(panelX + 10, contentY + 64);
        ctx.lineTo(panelX + panelWidth - 10, contentY + 64);
        ctx.stroke();
        
        // 升級與出售按鈕區
        const upgradeCost = this.selectedTower.getUpgradeCost();
        if (upgradeCost > 0) {
            const canUpgrade = this.game.gameState.gold >= upgradeCost;
            this.renderButton({
                x: panelX + 24,
                y: panelY + panelHeight - 70,
                width: 130,
                height: 42,
                text: `升級\n${upgradeCost}${this.game.config.RESOURCES.RESOURCE_NAME}`,
                color: canUpgrade ? this.colors.success : '#666666'
            });
        } else {
            ctx.fillStyle = this.colors.textSecondary;
            ctx.font = '13px "Microsoft JhengHei", Arial';
            ctx.fillText('已達最高等級', panelX + 24, panelY + panelHeight - 60);
        }
        
        // 出售按鈕
        const sellPrice = this.selectedTower.getSellPrice();
        this.renderButton({
            x: panelX + panelWidth - 154,
            y: panelY + panelHeight - 70,
            width: 130,
            height: 42,
            text: `出售\n${sellPrice}金`,
            color: this.colors.danger
        });

        ctx.restore();
    }
    
    // 渲染提示資訊
    renderTooltips() {
        if (this.hoveredButton && this.hoveredButton.text) {
            const tooltipText = this.getTooltipText(this.hoveredButton);
            if (tooltipText) {
                this.renderTooltip(this.mouseX + 10, this.mouseY + 10, tooltipText);
            }
        }
    }
    
    // 獲取提示文字
    getTooltipText(button) {
        switch (button.id) {
            case 'startWave': {
                const label = this.getStartWaveButtonLabel();
                if (label === '跳過準備') {
                    return '跳過剩餘的準備時間並立即開戰';
                }
                if (label === '開始下一波') {
                    return '提早開啟下一波攻勢';
                }
                return null;
            }
            case 'buildArrow':
                return '基礎箭塔：中等傷害，中等射程';
            case 'buildMagic':
                return '魔法塔：高傷害，濺射攻擊';
            case 'buildSlow':
                return '冰塔：減速敵人，輔助防禦';
            default:
                return null;
        }
    }
    
    // 渲染提示框
    renderTooltip(x, y, text) {
        this.ctx.font = '12px Arial';
        const textWidth = this.ctx.measureText(text).width;
        const padding = 5;
        
        // 提示背景
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(x - padding, y - 15, textWidth + padding * 2, 20);
        
        // 提示文字
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillText(text, x, y - 2);
    }
    
    // 工具函數：顏色變亮
    lightenColor(color) {
        const colors = {
            '#2C3E50': '#34495E',
            '#34495E': '#4A5F7A',
            '#3498DB': '#5DADE2',
            '#27AE60': '#58D68D',
            '#F39C12': '#F7DC6F',
            '#E74C3C': '#EC7063'
        };
        return colors[color] || color;
    }
    
    // 獲取遊戲狀態資訊
    getGameInfo() {
        const gameState = this.game.getGameState();
        return {
            gold: gameState.gold,
            wave: gameState.wave,
            maxWaves: gameState.maxWaves,
            baseHealth: gameState.baseHealth,
            maxBaseHealth: gameState.maxBaseHealth,
            enemiesKilled: gameState.enemiesKilled,
            towersBuilt: gameState.towersBuilt,
            score: gameState.score,
            isWaveActive: gameState.isWaveActive,
            isPaused: gameState.isPaused,
            isGameOver: gameState.isGameOver,
            isGameWon: gameState.isGameWon,
            buildMode: gameState.buildMode,
            selectedTowerType: gameState.selectedTowerType
        };
    }
}

// 導出類別
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TDEnhancedUI;
} else {
    window.TDEnhancedUI = TDEnhancedUI;
}