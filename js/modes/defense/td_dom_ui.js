(function () {
  const $ = (sel) => document.querySelector(sel);

  const TDDefenseDomUI = {
    init(game) {
      this.game = game;
      this.root = document.getElementById('defense-ui');
      if (!this.root) return;

      // 建立容器
      this.container = document.createElement('div');
      this.container.id = 'td-dom-ui';
      this.container.style.position = 'absolute';
      this.container.style.top = '0';
      this.container.style.left = '0';
      this.container.style.width = '100%';
      this.container.style.height = '100%';
      this.container.style.pointerEvents = 'none';
      this.root.appendChild(this.container);

      this._injectStyles();
      this._buildTopHud();
      this._buildStartButton();
      this._buildTowerBar();
      this._buildTowerPanel();
    },

    _injectStyles() {
      if (document.getElementById('td-dom-ui-style')) return;
      const style = document.createElement('style');
      style.id = 'td-dom-ui-style';
      style.textContent = `
      #td-dom-ui { font-family: "Microsoft JhengHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .td-top-hud { position:absolute; top:6px; left:50%; transform:translateX(-50%); display:flex; gap:12px; pointer-events:none; }
      .td-hud-chip { min-width:130px; height:52px; padding:8px 12px 8px 12px; border-radius:12px; background:linear-gradient(180deg, rgba(28,32,42,0.95), rgba(22,26,36,0.9)); box-shadow:0 3px 6px rgba(0,0,0,0.5); display:flex; align-items:center; pointer-events:auto; }
      .td-hud-chip-icon { width:28px; height:28px; border-radius:50%; margin-right:10px; display:flex; align-items:center; justify-content:center; font-size:18px; }
      .td-hud-chip-label { font-size:12px; color:#9DB3DA; line-height:1.1; }
      .td-hud-chip-value { font-size:20px; color:#FFFFFF; font-weight:700; margin-top:2px; }

      .td-start-btn { position:absolute; top:10px; right:110px; padding:10px 32px; border-radius:8px; border:2px solid rgba(255,255,255,0.7); background:linear-gradient(180deg,#3ad46c,#1f9f47); color:#fff; font-weight:700; font-size:18px; text-shadow:0 0 4px rgba(0,0,0,0.6); box-shadow:0 3px 0 rgba(0,0,0,0.5); cursor:pointer; pointer-events:auto; }
      .td-start-btn.td-disabled { opacity:0.4; cursor:default; }

      .td-build-bar { position:absolute; bottom:18px; left:50%; transform:translateX(-50%); display:flex; gap:22px; pointer-events:none; }
      .td-build-card { width:250px; height:100px; border-radius:16px; background:linear-gradient(180deg,rgba(28,32,42,0.96),rgba(22,26,36,0.9)); box-shadow:0 6px 12px rgba(0,0,0,0.65); display:flex; align-items:center; padding:0 16px; pointer-events:auto; cursor:pointer; position:relative; overflow:hidden; }
      .td-build-card.disabled { filter:grayscale(0.7); opacity:0.5; cursor:default; }
      .td-build-icon-wrap { width:72px; height:72px; border-radius:14px; margin-right:18px; padding:4px; box-sizing:border-box; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.25); }
      .td-build-icon-wrap img { width:100%; height:100%; object-fit:cover; border-radius:8px; image-rendering:pixelated; }
      .td-build-main { flex:1; display:flex; flex-direction:column; justify-content:center; }
      .td-build-title { font-size:22px; font-weight:700; color:#FFFFFF; margin-bottom:4px; text-shadow:0 0 3px rgba(0,0,0,0.6); }
      .td-build-desc { font-size:14px; color:rgba(180,200,220,0.9); }
      .td-build-price { position:absolute; top:10px; right:14px; padding:4px 12px; border-radius:6px; font-size:14px; font-weight:700; color:#fff; background:linear-gradient(180deg,rgba(80,80,80,0.55),rgba(60,60,60,0.5)); box-shadow:0 2px 4px rgba(0,0,0,0.6); }
      .td-build-card.can-afford .td-build-price { background:linear-gradient(180deg,rgba(46,204,113,0.9),rgba(39,174,96,0.85)); }
      .td-build-card.disabled .td-build-price { background:linear-gradient(180deg,rgba(90,90,90,0.7),rgba(60,60,60,0.6)); }

      .td-tower-panel { position:absolute; top:120px; right:20px; width:390px; min-height:270px; border-radius:14px; background:linear-gradient(180deg,rgba(23,32,42,0.98),rgba(17,24,32,0.98)); box-shadow:0 10px 20px rgba(0,0,0,0.8); padding-bottom:20px; pointer-events:auto; color:#fff; }
      .td-tower-panel.hidden { display:none; }
      .td-tower-panel-header { height:52px; border-radius:14px 14px 0 0; background:linear-gradient(180deg,rgba(46,204,113,0.97),rgba(39,174,96,0.97)); display:flex; align-items:center; padding:0 18px; font-weight:700; font-size:19px; }
      .td-tower-panel-body { padding:18px 20px 14px; font-size:15px; }
      .td-tower-panel-row { display:flex; justify-content:space-between; margin-bottom:12px; color:rgba(200,220,240,0.95); }
      .td-tower-panel-row-label { color:rgba(200,220,240,0.8); }
      .td-tower-panel-row-value { color:#ffffff; }
      .td-tower-panel-footer { display:flex; justify-content:space-between; padding:14px 22px 10px; }
      .td-btn { min-width:165px; height:50px; border-radius:9px; border:2px solid rgba(255,255,255,0.5); font-weight:700; font-size:16px; cursor:pointer; box-shadow:0 3px 0 rgba(0,0,0,0.4); white-space:pre-line; }
      .td-btn-green { background:linear-gradient(180deg,#3ad46c,#1f9f47); color:#fff; }
      .td-btn-red { background:linear-gradient(180deg,#ff6b6b,#e84141); color:#fff; }
      .td-btn.disabled { opacity:0.4; cursor:default; }
      `;
      document.head.appendChild(style);
    },

    _buildTopHud() {
      const wrap = document.createElement('div');
      wrap.className = 'td-top-hud';
      this.container.appendChild(wrap);
      this.topHudEl = wrap;

      const chips = [
        { id: 'gold', icon: '💠', label: '消波塊' },
        { id: 'wave', icon: '🔵', label: '波次' },
        { id: 'timer', icon: '⏳', label: '準備' },
        { id: 'remain', icon: '👾', label: '剩餘敵人' },
        { id: 'kill', icon: '💥', label: '擊殺敵人' }
      ];

      this.chipEls = {};
      chips.forEach(ch => {
        const chip = document.createElement('div');
        chip.className = 'td-hud-chip';
        chip.innerHTML = `
          <div class="td-hud-chip-icon">${ch.icon}</div>
          <div>
            <div class="td-hud-chip-label">${ch.label}</div>
            <div class="td-hud-chip-value" data-field="${ch.id}">0</div>
          </div>
        `;
        wrap.appendChild(chip);
        this.chipEls[ch.id] = chip.querySelector('.td-hud-chip-value');
      });
    },

    _buildStartButton() {
      const btn = document.createElement('button');
      btn.id = 'td-start-btn';
      btn.className = 'td-start-btn';
      btn.textContent = '跳過準備';
      btn.onclick = () => {
        if (!this.game) return;
        const label = this._getStartLabel();
        if (label === '跳過準備') {
          if (this.game.skipPreparationPhase) this.game.skipPreparationPhase();
        } else if (label === '開始下一波') {
          if (this.game.startWave) this.game.startWave();
        }
      };
      this.container.appendChild(btn);
      this.startBtn = btn;
    },

    _buildTowerBar() {
      const bar = document.createElement('div');
      bar.className = 'td-build-bar';
      this.container.appendChild(bar);
      this.buildBar = bar;

      const cfg = this.game.config.TOWERS || {};
      const items = [
        { id:'buildArrow', type:'ARROW', iconKey:'sniper2', title:cfg.ARROW?.name || '狙擊塔', desc:'高射速單體輸出' },
        { id:'buildMagic', type:'MAGIC', iconKey:'element2', title:cfg.MAGIC?.name || '元素塔', desc:'元素爆炸範圍' },
        { id:'buildSlow',  type:'SLOW',  iconKey:'ICE2',    title:cfg.SLOW?.name  || '冰凍塔', desc:'範圍緩速控制' }
      ];
      this.buildCards = {};
      items.forEach(it => {
        const card = document.createElement('div');
        card.className = 'td-build-card';
        card.dataset.type = it.type;
        card.innerHTML = `
          <div class="td-build-icon-wrap">
            <img data-role="icon" alt="${it.title}" />
          </div>
          <div class="td-build-main">
            <div class="td-build-title">${it.title}</div>
            <div class="td-build-desc">${it.desc}</div>
          </div>
          <div class="td-build-price" data-role="price">0</div>
        `;
        card.addEventListener('click', () => {
          if (!this.game || this.game.isPaused || this.game.isGameOver || this.game.isGameWon) return;
          const price = this._getTowerCost(it.type);
          if (this.game.gameState && this.game.gameState.gold < price) return;
          if (this.game.enterBuildMode) this.game.enterBuildMode(it.type);
        });
        // 設定圖示
        const img = card.querySelector('[data-role="icon"]');
        if (img && this.game.resources && this.game.resources.getImage) {
          const res = this.game.resources.getImage(it.iconKey) || this.game.resources.getImage(it.iconKey + '.png');
          if (res) img.src = res.src;
        }
        bar.appendChild(card);
        this.buildCards[it.type] = card;
      });
    },

    _buildTowerPanel() {
      const panel = document.createElement('div');
      panel.className = 'td-tower-panel hidden';
      panel.innerHTML = `
        <div class="td-tower-panel-header" data-role="title"></div>
        <div class="td-tower-panel-body">
          <div class="td-tower-panel-row">
            <span class="td-tower-panel-row-label">傷害</span>
            <span class="td-tower-panel-row-value" data-role="dmg">0</span>
          </div>
          <div class="td-tower-panel-row">
            <span class="td-tower-panel-row-label">射程</span>
            <span class="td-tower-panel-row-value" data-role="range">0</span>
          </div>
          <div class="td-tower-panel-row">
            <span class="td-tower-panel-row-label">射速</span>
            <span class="td-tower-panel-row-value" data-role="rate">0/s</span>
          </div>
        </div>
        <div class="td-tower-panel-footer">
          <button class="td-btn td-btn-green" data-role="upgrade"></button>
          <button class="td-btn td-btn-red" data-role="sell"></button>
        </div>
      `;
      this.container.appendChild(panel);
      this.towerPanel = panel;
      this.towerEls = {
        title: panel.querySelector('[data-role="title"]'),
        dmg:   panel.querySelector('[data-role="dmg"]'),
        range: panel.querySelector('[data-role="range"]'),
        rate:  panel.querySelector('[data-role="rate"]'),
        upBtn: panel.querySelector('[data-role="upgrade"]'),
        sellBtn: panel.querySelector('[data-role="sell"]')
      };

      this.towerEls.upBtn.addEventListener('click', () => {
        if (!this.game || !this.game.selectedTower) return;
        const t = this.game.selectedTower;
        const cost = t.getUpgradeCost ? t.getUpgradeCost() : 0;
        if (cost <= 0) return;
        if (this.game.gameState && this.game.gameState.gold < cost) return;
        if (this.game.upgradeTower) this.game.upgradeTower(t);
      });

      this.towerEls.sellBtn.addEventListener('click', () => {
        if (!this.game || !this.game.selectedTower) return;
        const t = this.game.selectedTower;
        if (this.game.sellTower) this.game.sellTower(t);
      });
    },

    _getStartLabel() {
      if (!this.game || !this.game.gameState) return '開始下一波';
      const st = this.game.gameState;
      if (st.isGameOver) return '戰鬥結束';
      if (st.isGameWon) return '勝利完成';
      if (!st.isWaveActive) return '開始下一波';
      if (st.wavePrepTimer > 0) return '跳過準備';
      return '波次進行中';
    },

    _getTowerCost(type) {
      const cfg = this.game.config && this.game.config.TOWERS && this.game.config.TOWERS[type];
      return cfg ? (cfg.cost || 0) : 0;
    },

    update(game) {
      if (!this.game) this.game = game || this.game;
      if (!this.game || !this.game.gameState) return;
      const st = this.game.gameState;

      // 更新 HUD
      if (this.chipEls) {
        if (this.chipEls.gold)   this.chipEls.gold.textContent   = String(Math.max(0, Math.floor(st.gold || 0)));
        if (this.chipEls.wave)   this.chipEls.wave.textContent   = `${Math.min(this.game.config.GAME.MAX_WAVES, (st.wave || 0) + 1)}/${this.game.config.GAME.MAX_WAVES}`;
        const prepSeconds = Math.max(0, Math.ceil(st.wavePrepTimer || 0));
        const activeSeconds = Math.max(0, Math.floor(this.game.config.GAME.WAVE_TIME_LIMIT - (st.waveTimer || 0)));
        const countdownValue = st.isWaveActive
          ? (prepSeconds > 0 ? `${prepSeconds}s` : `${activeSeconds}s`)
          : '待命';
        if (this.chipEls.timer)  this.chipEls.timer.textContent  = countdownValue;
        const remain = this.game.enemyManager ? this.game.enemyManager.getEnemyCount() : 0;
        if (this.chipEls.remain) this.chipEls.remain.textContent = String(remain);
        if (this.chipEls.kill)   this.chipEls.kill.textContent   = String(st.enemiesKilled || 0);
      }

      // 更新開始/跳過按鈕
      if (this.startBtn) {
        const label = this._getStartLabel();
        this.startBtn.textContent = label;
        const disabled = this.game.isGameOver || this.game.isGameWon || label === '波次進行中';
        this.startBtn.classList.toggle('td-disabled', !!disabled);
      }

      // 更新建造卡片金額與可買狀態
      if (this.buildCards) {
        Object.keys(this.buildCards).forEach(type => {
          const card = this.buildCards[type];
          const priceEl = card.querySelector('[data-role="price"]');
          const cost = this._getTowerCost(type);
          if (priceEl) priceEl.textContent = String(cost);
          const canAfford = st.gold >= cost;
          card.classList.toggle('can-afford', canAfford);
          card.classList.toggle('disabled', !canAfford);
        });
      }

      // 更新防禦塔資訊面板
      this._updateTowerPanel();
    },

    _updateTowerPanel() {
      if (!this.towerPanel || !this.game) return;
      const t = this.game.selectedTower;
      if (!t) {
        this.towerPanel.classList.add('hidden');
        return;
      }
      const cfg = t.config || {};
      const lvl = t.level != null ? (t.level + 1) : 1;
      this.towerPanel.classList.remove('hidden');
      if (this.towerEls.title) this.towerEls.title.textContent = `${cfg.name || ''} (等級 ${lvl})`;
      if (this.towerEls.dmg)   this.towerEls.dmg.textContent   = String(t.damage || 0);
      if (this.towerEls.range) this.towerEls.range.textContent = String(t.range || 0);
      if (this.towerEls.rate)  this.towerEls.rate.textContent  = `${(1000 / (t.fireRate || 1)).toFixed(1)}/秒`;

      const upCost = t.getUpgradeCost ? t.getUpgradeCost() : 0;
      if (this.towerEls.upBtn) {
        if (upCost > 0) {
          this.towerEls.upBtn.textContent = `升級Z\n${upCost}${this.game.config.RESOURCES.RESOURCE_NAME}`;
          this.towerEls.upBtn.classList.toggle('disabled', this.game.gameState.gold < upCost);
        } else {
          this.towerEls.upBtn.textContent = '已達最高等級';
          this.towerEls.upBtn.classList.add('disabled');
        }
      }
      const sellPrice = t.getSellPrice ? t.getSellPrice() : 0;
      if (this.towerEls.sellBtn) {
        this.towerEls.sellBtn.textContent = `出售X\n${sellPrice}${this.game.config.RESOURCES.RESOURCE_NAME}`;
      }
    }
  };

  window.TDDefenseDomUI = TDDefenseDomUI;
})();


