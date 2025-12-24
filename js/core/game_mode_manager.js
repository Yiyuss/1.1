// 高階模式管理層（GameModeManager）
// 目的：將每個遊戲模式的事件、計時器、音樂、資源、DOM 操作包裝在「模式上下文」中，
//       模式退出時一次性釋放，避免與其他模式（如生存模式）互相污染、造成記憶體殘留。
// 設計目標：
// - 不改動既有程式碼（生存模式與主流程維持原樣）。
// - 只管理透過 GameModeManager 啟動的模式，彼此隔離且可預測的生命週期。
// - 明確文件化，為未來新增模式提供一致模板。
(function(global){
  'use strict';

  // ————————————————————————————————————————————————————————————————
  // 事件管理（模式內掛載、模式退出自動清理）
  function createEventBus(){
    const registry = [];
    return {
      on(target, type, handler, options){
        if (!target || !type || !handler) return;
        try { target.addEventListener(type, handler, options); } catch(_){}
        registry.push({ target, type, handler, options });
        return handler;
      },
      off(target, type, handler, options){
        try { target.removeEventListener(type, handler, options); } catch(_){}
        for (let i=registry.length-1; i>=0; i--) {
          const r = registry[i];
          if (r.target === target && r.type === type && r.handler === handler) {
            registry.splice(i,1);
            break;
          }
        }
      },
      removeAll(){
        for (let i=registry.length-1; i>=0; i--) {
          const { target, type, handler, options } = registry[i];
          try { target.removeEventListener(type, handler, options); } catch(_){}
        }
        registry.length = 0;
      }
    };
  }

  // ————————————————————————————————————————————————————————————————
  // 計時器管理（raf/interval/timeout 皆記錄，模式退出自動清除）
  function createTimerBucket(){
    const intervals = new Set();
    const timeouts = new Set();
    const rafs = new Set();
    return {
      setInterval(fn, ms){ const id = global.setInterval(fn, ms); intervals.add(id); return id; },
      clearInterval(id){ try { global.clearInterval(id); } catch(_){} intervals.delete(id); },
      setTimeout(fn, ms){ const id = global.setTimeout(fn, ms); timeouts.add(id); return id; },
      clearTimeout(id){ try { global.clearTimeout(id); } catch(_){} timeouts.delete(id); },
      requestAnimationFrame(fn){ const id = global.requestAnimationFrame(fn); rafs.add(id); return id; },
      cancelAnimationFrame(id){ try { global.cancelAnimationFrame(id); } catch(_){} rafs.delete(id); },
      clearAll(){
        for (const id of intervals) { try { global.clearInterval(id); } catch(_){} }
        for (const id of timeouts) { try { global.clearTimeout(id); } catch(_){} }
        for (const id of rafs) { try { global.cancelAnimationFrame(id); } catch(_){} }
        intervals.clear(); timeouts.clear(); rafs.clear();
      }
    };
  }

  // ————————————————————————————————————————————————————————————————
  // 資源管理（模式私有載入與查詢；僅在該模式使用）
  function createResourceBucket(){
    const images = new Map();
    const audio = new Map();
    const json = new Map();

    async function loadManifest(manifest){
      if (!manifest) return;
      const tasks = [];
      const TIMEOUT_MS = 10000; // 10秒超時
      
      // 超時包裝函數：為 Promise 添加超時機制
      function withTimeout(promise, timeoutMs, resourceName, resourceType){
        return Promise.race([
          promise,
          new Promise((resolve) => {
            setTimeout(() => {

              resolve(); // 超時後 resolve，不阻塞其他資源
            }, timeoutMs);
          })
        ]);
      }
      
      // 圖片：以 <img> 載入並快取在 Bucket，避免影響全域資源表
      if (Array.isArray(manifest.images)) {
        for (const it of manifest.images) {
          if (!it || !it.key || !it.src) continue;
          const imgPromise = new Promise((resolve) => {
            const img = new Image();
            img.onload = () => { 
              images.set(it.key, img); 
              resolve(); 
            };
            img.onerror = () => { 
              console.warn(`[ResourceLoader] 圖片載入失敗: ${it.key} (${it.src})`);
              resolve(); 
            };
            img.src = it.src;
          });
          // 添加超時機制
          tasks.push(withTimeout(imgPromise, TIMEOUT_MS, it.key, '圖片'));
        }
      }
      // 音訊：保留路徑映射於 Bucket；具體播放由 audioAdapter 決定
      if (Array.isArray(manifest.audio)) {
        for (const it of manifest.audio) {
          if (!it || !it.name || !it.src) continue;
          audio.set(it.name, it.src);
        }
      }
      // JSON：如需模式配置，可於此載入
      if (Array.isArray(manifest.json)) {
        for (const it of manifest.json) {
          if (!it || !it.key || !it.src) continue;
          const jsonPromise = fetch(it.src)
            .then(r=>r.ok?r.json():null)
            .catch(()=>null)
            .then(data=>{ if (data) json.set(it.key, data); });
          // 添加超時機制
          tasks.push(withTimeout(jsonPromise, TIMEOUT_MS, it.key, 'JSON'));
        }
      }
      // 使用 Promise.allSettled 而不是 Promise.all，避免單個資源失敗阻塞整個載入
      await Promise.allSettled(tasks);
    }

    return {
      loadManifest,
      getImage(key){ return images.get(key) || null; },
      getAudioSrc(name){ return audio.get(name) || null; },
      getJson(key){ return json.get(key) || null; },
      releaseAll(){ images.clear(); audio.clear(); json.clear(); }
    };
  }

  // ————————————————————————————————————————————————————————————————
  // 音樂/音效管理（全域 AudioManager 的薄包裝，無則以 <audio> 降級）
  function createAudioAdapter(resources){
    // 橋接全域 AudioManager：部分環境下以 const 宣告不掛在 window
    const globalAudio = (typeof AudioManager !== 'undefined' ? AudioManager : (global.audio || global.AudioManager || null));
    const locals = [];
    let localCurrent = null; // 追蹤降級播放的單一音軌
    function _file(u){
      try { return (u||'').split('?')[0].split('#')[0].split('/').pop().toLowerCase(); } catch(_) { return (u||''); }
    }
    // 維護備註：全域 AudioManager 僅以「名稱鍵」控制音樂（例如 'menu_music'、'shura_music'）。
    // 請勿傳入檔案 src 給 globalAudio.playMusic，否則可能造成重疊或無法正確切換。
    return {
      playMusic(name, options){
        try {
          if (globalAudio && typeof globalAudio.playMusic === 'function') {
            // 先檢查 AudioManager 中是否有該音樂
            if (globalAudio.music && globalAudio.music[name]) {
              // 以名稱鍵播放，交由全域 AudioManager 處理 stopAll 與 loop 等邏輯
              // 先停止本地音軌，避免與 AudioManager 重疊
              try {
                for (const el of locals) { el.pause(); el.src = ''; }
                locals.length = 0;
                if (localCurrent) { localCurrent.pause(); localCurrent.src = ''; localCurrent = null; }
              } catch(_){}
              globalAudio.playMusic(name, options);
              return;
            }
          }
        } catch(_){}
        // 降級：以 <audio> 單軌播放（僅限該模式），避免每次呼叫疊加音軌
        // 先停止 AudioManager 的音樂（如果正在播放），避免重疊
        try {
          if (globalAudio && typeof globalAudio.stopAllMusic === 'function') {
            globalAudio.stopAllMusic();
          }
        } catch(_){}
        const src = resources.getAudioSrc(name);
        if (!src) return;
        try {
          // 若同曲已在播放，直接略過避免重疊（相對/絕對路徑皆判定）
          const curSrc = localCurrent ? (localCurrent.currentSrc || localCurrent.src || '') : '';
          const same = curSrc === src || curSrc.endsWith(src) || _file(curSrc) === _file(src);
          if (localCurrent && localCurrent.paused === false && same) {
            return;
          }
          // 清理既有本地音軌
          for (const el of locals) { try { el.pause(); el.src = ''; } catch(_){} }
          locals.length = 0;
          if (localCurrent) { try { localCurrent.pause(); localCurrent.src = ''; } catch(_){} }
          localCurrent = null;

          const el = new Audio(src);
          el.loop = !!(options && options.loop);
          // 優先使用 options.volume，否則使用 AudioManager 的音樂音量，最後降級為 1
          const vol = (options && typeof options.volume === 'number') 
            ? options.volume 
            : (globalAudio && typeof globalAudio.musicVolume === 'number' ? globalAudio.musicVolume : 1);
          el.volume = vol;
          el.play().catch(()=>{});
          locals.push(el);
          localCurrent = el;
        } catch(_){}
      },
      unmuteAndPlay(name, options){
        try { if (globalAudio && typeof globalAudio.setMuted === 'function') globalAudio.setMuted(false); } catch(_){}
        try { if (globalAudio && typeof globalAudio.resumeAudio === 'function') globalAudio.resumeAudio(); } catch(_){}
        this.playMusic(name, options);
      },
      stopAllMusic(){
        try { if (globalAudio && typeof globalAudio.stopAllMusic === 'function') globalAudio.stopAllMusic(); } catch(_){}
        try {
          for (const el of locals) { el.pause(); el.src = ''; }
          locals.length = 0;
          if (localCurrent) { try { localCurrent.pause(); localCurrent.src = ''; } catch(_){}; localCurrent = null; }
        } catch(_){}
      },
      isMuted(){
        try { return !!(globalAudio && typeof globalAudio.isMuted === 'function' ? globalAudio.isMuted() : false); } catch(_){}
        return false;
      },
      setMuted(v){ try { if (globalAudio && typeof globalAudio.setMuted === 'function') globalAudio.setMuted(!!v); } catch(_){} },
      setMusicVolume(volume){
        // 同步更新本地音軌的音量
        try {
          for (const el of locals) {
            if (el && typeof el.volume !== 'undefined') el.volume = volume;
          }
          if (localCurrent && typeof localCurrent.volume !== 'undefined') {
            localCurrent.volume = volume;
          }
        } catch(_){}
        // 同時更新 AudioManager 的音量（如果存在）
        try {
          if (globalAudio && typeof globalAudio.setMusicVolume === 'function') {
            globalAudio.setMusicVolume(volume);
          }
        } catch(_){}
      },
    };
  }

  // ————————————————————————————————————————————————————————————————
  // DOM 工具（輕量、只提供模式常用操作；不改動既有 UI 架構）
  function createDomTools(){
    const canvas = document.querySelector('canvas') || document.getElementById('game-canvas') || null;
    return {
      canvas,
      get(id){ return document.getElementById(id); },
      show(id){ const el = this.get(id); if (el) { try { el.classList.remove('hidden'); } catch(_) { el.style.display = ''; } } },
      hide(id){ const el = this.get(id); if (el) { try { el.classList.add('hidden'); } catch(_) { el.style.display = 'none'; } } },
      addClass(id, cls){ const el = this.get(id); if (el) el.classList.add(cls); },
      removeClass(id, cls){ const el = this.get(id); if (el) el.classList.remove(cls); }
    };
  }

  // ————————————————————————————————————————————————————————————————
  // 模式上下文（事件、計時器、音樂、資源、DOM、dispose）
  function createModeContext(){
    const events = createEventBus();
    const timers = createTimerBucket();
    const resources = createResourceBucket();
    const audio = createAudioAdapter(resources);
    const dom = createDomTools();
    const services = { save: (typeof global !== 'undefined' && global.SaveService) ? global.SaveService : null };
    function dispose(){
      try { events.removeAll(); } catch(_){}
      try { timers.clearAll(); } catch(_){}
      try { audio.stopAllMusic(); } catch(_){}
      try { resources.releaseAll(); } catch(_){}
    }
    return { events, timers, audio, resources, dom, services, dispose };
  }

  // ————————————————————————————————————————————————————————————————
  // 獨立的過渡層管理器（不屬於任何模式，避免黑屏）
  // 統一載入畫面：播放 LOAD.mp4
  const TransitionLayer = {
    show(){
      try {
        const el = document.getElementById('transition-layer');
        if (!el) return;
        
        // 如果過渡層已經顯示，跳過（避免重複調用導致視頻播放衝突）
        if (!el.classList.contains('hidden')) return;
        
        const video = document.getElementById('transition-video');
        if (video) {
          // 先暫停視頻（如果正在播放），避免播放衝突
          if (!video.paused) video.pause();
          // 重置視頻到開始
          video.currentTime = 0;
          // 顯示過渡層
          el.classList.remove('hidden');
          el.style.display = 'flex';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
          // 強制同步樣式更新，確保過渡層已渲染
          el.offsetHeight;
          // 等待一幀後再播放視頻，確保過渡層已完全顯示
          requestAnimationFrame(() => {
            // 再次檢查過渡層是否還顯示（避免在等待期間被隱藏）
            if (!el.classList.contains('hidden')) {
              const playPromise = video.play();
              if (playPromise !== undefined) {
                playPromise.catch(() => {});
              }
            }
          });
        } else {
          // 如果沒有視頻元素，至少顯示過渡層
          el.classList.remove('hidden');
          el.style.display = 'flex';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
        }
        // 強制同步樣式更新
        el.offsetHeight;
      } catch(e) {}
    },
    hide(){
      try {
        const el = document.getElementById('transition-layer');
        if (!el) return;
        
        const video = document.getElementById('transition-video');
        if (video) {
          // 停止並重置視頻
          video.pause();
          video.currentTime = 0;
          // 清空視頻緩衝區，釋放內存（保留 src，下次播放時會重新加載）
          try {
            video.load();
          } catch(e) {}
        }
        
        // 隱藏過渡層
        el.classList.add('hidden');
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
      } catch(e) {}
    }
  };

  // ————————————————————————————————————————————————————————————————
  // GameModeManager 主體
  const _modes = new Map();
  let _current = null; // { id, mode, ctx }

  const GameModeManager = {
    register(id, mode){
      if (!id || !mode) return;
      _modes.set(id, mode);
    },
    has(id){ return _modes.has(id); },
    list(){ return Array.from(_modes.keys()); },
    getCurrent(){ return _current ? _current.id : null; },
    async start(id, params){
      const mode = _modes.get(id);
      if (!mode) throw new Error(`Mode '${id}' not registered`);
      
      // ========== 過渡層方案（正確的執行順序）==========
      // 關鍵原則：過渡層必須在舊模式還活著時顯示，至少撐過一幀
      // 流程：
      // 1. Mode A（仍在顯示）
      // 2. 顯示「過渡層」並播放 LOAD.mp4（舊模式還活著）← 關鍵：先出現
      // 3. 等待一幀（requestAnimationFrame）← 關鍵：確保過渡層被渲染
      // 4. 開始背景卸載 Mode A（此時過渡層已穩定，不會黑屏）
      // 5. 建立新 ctx
      // 6. 新模式 willEnter（只做準備，不顯示 UI）
      // 7. 背景載入 Mode B
      // 8. Mode B 就緒，切顯示到 Mode B
      // 9. 移除過渡層並清理視頻
      
      // 🔴 Step 1-2：無論是否有舊模式，都先顯示過渡層並播放 LOAD.mp4
      TransitionLayer.show();
      
      // 🔑 Step 3：關鍵一幀 - 確保過渡層被渲染穩定
      await new Promise(r => requestAnimationFrame(r));
      
      // 🔴 Step 4：現在才安全停止舊模式（過渡層已穩定，不會黑屏）
      if (_current) {
        try { await this.stop(); } catch(_){}
      }
      
      // 🔴 Step 5：建立新 ctx
      const ctx = createModeContext();
      
      // 存檔相容升級：保持 SaveCode 向下相容，不改鍵名或簽章；僅補齊缺失欄位
      try {
        if (ctx.services && ctx.services.save && typeof ctx.services.save.upgradeSchemaIfNeeded === 'function') {
          ctx.services.save.upgradeSchemaIfNeeded();
        }
      } catch(_){}
      
      // 🔴 Step 6：新模式 willEnter（只做準備，不顯示 UI）
      try {
        if (typeof mode.willEnter === 'function') {
          mode.willEnter(params, ctx);
        }
      } catch(e){}
      
      // 🔴 Step 7：背景載入 Mode B
      const manifest = (typeof mode.getManifest === 'function') ? mode.getManifest(params, ctx) : null;
      try { 
        await ctx.resources.loadManifest(manifest);
      } catch(e){}
      
      // 🔴 Step 8：Mode B 就緒，切顯示到 Mode B
      _current = { id, mode, ctx };
      if (typeof mode.enter === 'function') {
        try { 
          mode.enter(params, ctx);
        } catch(e){}
      }
      
      // 🔴 Step 9：enter 結束後延遲關掉過渡層並清理視頻（默認行為）
      // 如果模式需要更晚隱藏（如主線模式在主循環啟動後），可以在 enter() 中自己處理
      setTimeout(() => {
        // 檢查模式是否已經自己隱藏了過渡層（通過檢查 hidden 類）
        const transitionEl = document.getElementById('transition-layer');
        // 若模式鎖定過渡層（例如 3D 模式等待地圖/角色載入），則不要在這裡提前關掉，避免出現「藍色畫面」閃爍
        const locked = !!(transitionEl && transitionEl.dataset && transitionEl.dataset.lock === '1');
        if (transitionEl && !transitionEl.classList.contains('hidden') && !locked) {
          // 如果過渡層還在顯示，則隱藏它並清理視頻（默認行為）
          TransitionLayer.hide();
        }
      }, 200); // 給模式 200ms 的時間來自己處理
    },
    async stop(){
      if (!_current) return;
      const { mode, ctx } = _current;
      try { if (typeof mode.exit === 'function') mode.exit(ctx); } catch(e){ console.warn('[GameModeManager] exit warn:', e); }
      try { ctx.dispose(); } catch(e){ console.warn('[GameModeManager] dispose warn:', e); }
      _current = null;
    }
  };

  // 導出至全域（不覆蓋既有 ModeManager）
  if (!global.GameModeManager) global.GameModeManager = GameModeManager;
  // 導出 TransitionLayer 到全域，允許外部提前顯示（如從選角界面進入時）
  if (!global.TransitionLayer) global.TransitionLayer = TransitionLayer;
})(typeof window !== 'undefined' ? window : globalThis);
