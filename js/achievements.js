// 成就系統（本地存檔 + 介面渲染）
// 職責：管理成就定義、解鎖狀態、渲染列表；提供與勝利事件、SaveCode 的整合點。
// 依賴：localStorage、UI（可選，用於顯示提示）、DOM（成就介面）

const Achievements = (function(){
  const STORAGE_KEY = 'achievements';

  // 成就定義（可擴充）
  const DEFINITIONS = {
    FIRST_CLEAR: {
      id: 'FIRST_CLEAR',
      name: '首次通關',
      desc: '完成一場任意難度遊戲並達到勝利。',
      icon: 'assets/images/A15.png',
      reward: '解鎖「狂熱雷擊」技能。'
    },
    HARD_CLEAR: {
      id: 'HARD_CLEAR',
      name: '首次通關困難',
      desc: '首次通關任一地圖的困難模式。',
      icon: 'assets/images/A16.png',
      reward: '解鎖「心靈魔法」技能。'
    },
    COIN_100K: {
      id: 'COIN_100K',
      name: '百萬富翁的起點',
      desc: '持有金幣達到 100000。',
      icon: 'assets/images/A18.png',
      reward: '解鎖「狂熱斬擊」技能。'
    },
    COIN_200K: {
      id: 'COIN_200K',
      name: '財富小康',
      desc: '持有金幣達到 200000。',
      icon: 'assets/images/A27.png',
      reward: '解鎖「引力波」技能。'
    },
    CHALLENGE_GALAXY_CLEAR: {
      id: 'CHALLENGE_GALAXY_CLEAR',
      name: '銀河系征服者',
      desc: '通關挑戰模式中的銀河系關卡。',
      icon: 'assets/images/A33.png',
      reward: '解鎖「光芒萬丈」技能。'
    },
    CHALLENGE_NEBULA_CLEAR: {
      id: 'CHALLENGE_NEBULA_CLEAR',
      name: '星雲征服者',
      desc: '通關挑戰模式中的星雲關卡。',
      icon: 'assets/images/AI.png',
      reward: '解鎖「召喚AI」技能。'
    },
    DADA_CITY_CLEAR: {
      id: 'DADA_CITY_CLEAR',
      name: '灰妲的勝利',
      desc: '使用灰妲角色通關廁所。',
      icon: 'assets/images/A24.png',
      reward: '解鎖「狂熱大波」技能。'
    },
    DADA_FOREST_CLEAR: {
      id: 'DADA_FOREST_CLEAR',
      name: '灰妲的大勝利',
      desc: '使用灰妲角色通關草原。',
      icon: 'assets/images/A26.png',
      reward: '解鎖「幼妲天使」技能。'
    },
    ROKUROST_CITY_CLEAR: {
      id: 'ROKUROST_CITY_CLEAR',
      name: '洛可的勝利',
      desc: '使用洛可洛斯特角色通關廁所。',
      icon: 'assets/images/A30.png',
      reward: '解鎖「死線超人」技能。'
    },
    DEFENSE_LV1_CLEAR: {
      id: 'DEFENSE_LV1_CLEAR',
      name: '煉金坊守護者',
      desc: '通關防禦模式的LV1地圖。',
      icon: 'assets/images/test11.png',
      reward: '解鎖主堡的2個自動化技能。'
    }
  };

  // 融合解鎖需求（可擴充）：各融合技能對應需先解鎖的成就 ID 陣列
  const FUSION_REQUIREMENTS = {
    FRENZY_LIGHTNING: ['FIRST_CLEAR'],
    MIND_MAGIC: ['HARD_CLEAR'],
    FRENZY_SLASH: ['COIN_100K'],
    FRENZY_ICE_BALL: ['DADA_CITY_CLEAR'],
    FRENZY_YOUNG_DADA_GLORY: ['DADA_FOREST_CLEAR'],
    SUMMON_AI: ['CHALLENGE_NEBULA_CLEAR'],
    GRAVITY_WAVE: ['COIN_200K'],
    DEATHLINE_SUPERMAN: ['ROKUROST_CITY_CLEAR'],
    RADIANT_GLORY: ['CHALLENGE_GALAXY_CLEAR']
    // 未來：在此加入新融合技能的成就解鎖需求，例如：
    // OTHER_FUSION_SKILL: ['SOME_ACHIEVEMENT', 'ANOTHER_ACHIEVEMENT']
  };

  // 當次遊戲解鎖清單（勝利提示用）
  let sessionUnlocked = [];
  
  // 緩存成就解鎖狀態，避免頻繁讀取 localStorage
  let _unlockedCache = null;
  let _cacheTimestamp = 0;
  const CACHE_DURATION = 1000; // 緩存1秒

  function _loadRaw(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch(_) { return {}; }
  }

  function _saveRaw(map){
    try { 
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map||{})); 
      // 清除緩存，強制下次重新讀取
      _unlockedCache = null;
      _cacheTimestamp = 0;
    } catch(_) {}
  }

  function getAll(){
    return { defs: DEFINITIONS, unlocked: _loadRaw() };
  }

  function isUnlocked(id){
    // 使用緩存減少 localStorage 讀取
    const now = Date.now();
    if (!_unlockedCache || (now - _cacheTimestamp) > CACHE_DURATION) {
      _unlockedCache = _loadRaw();
      _cacheTimestamp = now;
    }
    return !!(_unlockedCache && _unlockedCache[id] && _unlockedCache[id].unlocked === true);
  }

  function unlock(id){
    if (!id || !DEFINITIONS[id]) return false;
    const m = _loadRaw();
    if (m[id] && m[id].unlocked) return false; // 已解鎖
    m[id] = { unlocked: true, ts: Date.now() };
    _saveRaw(m);
    // 更新緩存
    if (!_unlockedCache) _unlockedCache = {};
    _unlockedCache[id] = { unlocked: true, ts: Date.now() };
    _cacheTimestamp = Date.now();
    // 記錄於當次遊戲
    if (!sessionUnlocked.includes(id)) sessionUnlocked.push(id);
    // 可選：提示音效/文字（不更動既有 UI 流程）
    try { if (typeof UI !== 'undefined' && UI._playClick) UI._playClick(); } catch(_) {}
    return true;
  }

  function getUnlockedIds(){
    const m = _loadRaw();
    return Object.keys(m).filter(k => m[k] && m[k].unlocked);
  }

  function getSessionUnlocked(){
    return sessionUnlocked.slice();
  }

  // 取得並清空當次解鎖列表（供勝利返回開始介面彈窗使用）
  function consumeSessionUnlocked(){
    const arr = sessionUnlocked.slice();
    sessionUnlocked = [];
    return arr;
  }

  // 通用：判斷指定成就 ID 陣列是否皆已解鎖
  function areUnlocked(ids){
    if (!Array.isArray(ids) || !ids.length) return false; // 空數組視為未解鎖（更安全）
    return ids.every(id => isUnlocked(id));
  }

  // 判斷融合技能是否可顯示（需求成就皆解鎖）
  function isFusionUnlocked(fusionId){
    const reqs = FUSION_REQUIREMENTS[fusionId];
    if (!reqs) return false; // 未定義視為尚未設計門檻：預設鎖定
    return areUnlocked(reqs);
  }

  // 在成就介面渲染清單（採用天賦風格的卡片 + 下方預覽）
  function renderList(container){
    if (!container) return;
    const map = _loadRaw();
    container.innerHTML = '';

    const cards = [];
    Object.keys(DEFINITIONS).forEach(id => {
      const def = DEFINITIONS[id];
      if (def && def.hidden) return;

      const unlocked = !!(map[id] && map[id].unlocked);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'char-card selectable ' + (unlocked ? '' : 'locked');
      btn.dataset.achievementId = id;

      const img = document.createElement('img');
      img.src = def.icon || 'assets/images/A1.png';
      img.alt = def.name;
      btn.appendChild(img);

      // 左上角狀態標籤（解鎖/未解鎖）
      const status = document.createElement('div');
      status.className = 'ach-status ' + (unlocked ? 'unlocked' : 'locked');
      status.textContent = unlocked ? '已解鎖' : '未解鎖';
      btn.appendChild(status);
      // 不在格子顯示名稱，避免文字溢出；名稱在下方預覽顯示。

      btn.addEventListener('click', (e) => {
        // 單選 active 狀態
        cards.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        updatePreview(def, unlocked);
        // 次要按鈕音效（button_click2）
        try {
          if (typeof playClick2 === 'function') {
            playClick2();
          } else if (window.AudioManager && typeof window.AudioManager.playSound === 'function') {
            window.AudioManager.playSound('button_click2');
          }
        } catch(_) {}
      });

      container.appendChild(btn);
      cards.push(btn);
    });

    // 補空格至兩行（6x2 = 12 格），未使用的保持空白
    const TOTAL_SLOTS = 12;
    const needEmpty = Math.max(0, TOTAL_SLOTS - cards.length);
    for (let i = 0; i < needEmpty; i++) {
      const empty = document.createElement('div');
      empty.className = 'char-slot empty';
      container.appendChild(empty);
    }

    // 初始不選中任何卡片，顯示系統介紹（與天賦介面一致）
    updatePreview();
  }

  // 更新下方預覽區（圖示、名稱、描述），僅視覺與文案
  function updatePreview(def, unlocked){
    try {
      const imgEl = document.getElementById('achievements-preview-img');
      const nameEl = document.getElementById('achievements-preview-name');
      const descEl = document.getElementById('achievements-preview-desc');
      const rewardEl = document.getElementById('achievements-preview-reward');
      if (!imgEl || !nameEl || !descEl || !rewardEl) return;

      if (!def) {
        imgEl.src = 'assets/images/GM.png';
        nameEl.textContent = '成就系統';
        descEl.textContent = '這裡會顯示成就介紹。';
        rewardEl.textContent = '提示：點選成就以查看詳細介紹；未解鎖會顯示灰階。';
        return;
      }
      // 預覽圖固定為 GM.png，保持與天賦介面一致
      imgEl.src = 'assets/images/GM.png';
      nameEl.textContent = def.name || '成就';
      descEl.textContent = def.desc || '';
      rewardEl.textContent = def.reward ? String(def.reward) : '';

      // 未解鎖視覺提示（底層圖片仍保持灰階於卡片上；預覽圖不做灰階處理，保持清晰）
      // 如需在預覽區顯示狀態，可追加一行：未解鎖/已解鎖
      // 這裡僅呈現文字描述，避免改動太多視覺元素。
    } catch(_) {}
  }

  // 測試用途：清除所有成就（同時清空當次解鎖緩存）
  function clearAll(){
    try { localStorage.removeItem(STORAGE_KEY); } catch(_) {}
    sessionUnlocked = [];
  }

  return { DEFINITIONS, getAll, isUnlocked, unlock, getUnlockedIds, getSessionUnlocked, consumeSessionUnlocked, renderList, areUnlocked, isFusionUnlocked, clearAll };
})();
