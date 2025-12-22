// ResourceLoader（模式資源載入器）
// 職責：依模式提供的 manifest 載入其專屬資源，避免跨模式資源互吃；僅附加到既有 Game.images，不移除或覆蓋舊資源。
// 維護備註：
// - 目前僅支援 image/audio/json 的最小載入；音訊仍建議透過 AudioManager 管理。
// - 與 createDefaultImages 並存：此載入器只在 ModeManager.start() 時載入宣告資源，不改變原本預載。
(function(){
  const cache = {
    images: new Map(),
    audio: new Map(),
    json: new Map()
  };

  const TIMEOUT_MS = 10000; // 10秒超時
  
  // 超時包裝函數：為 Promise 添加超時機制
  function withTimeout(promise, timeoutMs, resourceName, resourceType){
    return Promise.race([
      promise,
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(null); // 超時後 resolve，不阻塞其他資源
        }, timeoutMs);
      })
    ]);
  }

  function loadImage(key, src){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        cache.images.set(key, img);
        try { if (typeof Game !== 'undefined') { Game.images = Game.images || {}; if (!Game.images[key]) Game.images[key] = img; } } catch(_){ }
        resolve(img);
      };
      img.onerror = (e) => {
        console.warn(`[ResourceLoader] 圖片載入失敗: ${key} (${src})`);
        resolve(null); // 改為 resolve，不阻塞其他資源
      };
      img.src = src;
    });
  }

  async function loadJSON(key, url){
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[ResourceLoader] JSON 載入失敗: ${key} (${url}) - HTTP ${res.status}`);
        return null;
      }
      const data = await res.json();
      cache.json.set(key, data);
      return data;
    } catch(e) {
      console.warn(`[ResourceLoader] JSON 載入失敗: ${key} (${url})`, e);
      return null;
    }
  }

  // 音訊載入可由 AudioManager 代理；此處僅保留占位
  async function loadAudio(key, url){
    cache.audio.set(key, url);
    return url;
  }

  async function loadForMode(modeId, manifest){
    if (!manifest) return;
    const tasks = [];
    const imgs = manifest.images || [];
    const auds = manifest.audio || [];
    const jsons = manifest.json || [];
    imgs.forEach(item => {
      if (!item || !item.key || !item.src) return;
      tasks.push(withTimeout(loadImage(item.key, item.src), TIMEOUT_MS, item.key, '圖片'));
    });
    auds.forEach(item => {
      if (!item || !item.key || !item.src) return;
      tasks.push(loadAudio(item.key, item.src));
    });
    jsons.forEach(item => {
      if (!item || !item.key || !item.src) return;
      tasks.push(withTimeout(loadJSON(item.key, item.src), TIMEOUT_MS, item.key, 'JSON'));
    });
    // 使用 Promise.allSettled 而不是 Promise.all，避免單個資源失敗阻塞整個載入
    await Promise.allSettled(tasks);
  }

  window.ResourceLoader = { loadForMode, cache };
})();
