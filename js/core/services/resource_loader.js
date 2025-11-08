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

  function loadImage(key, src){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        cache.images.set(key, img);
        try { if (typeof Game !== 'undefined') { Game.images = Game.images || {}; if (!Game.images[key]) Game.images[key] = img; } } catch(_){ }
        resolve(img);
      };
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  }

  async function loadJSON(key, url){
    const res = await fetch(url);
    const data = await res.json();
    cache.json.set(key, data);
    return data;
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
      tasks.push(loadImage(item.key, item.src));
    });
    auds.forEach(item => {
      if (!item || !item.key || !item.src) return;
      tasks.push(loadAudio(item.key, item.src));
    });
    jsons.forEach(item => {
      if (!item || !item.key || !item.src) return;
      tasks.push(loadJSON(item.key, item.src));
    });
    try { await Promise.all(tasks); } catch(e){ console.warn('[ResourceLoader] 模式資源載入失敗', modeId, e); }
  }

  window.ResourceLoader = { loadForMode, cache };
})();