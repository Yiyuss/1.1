
// ✅ 权威服务器：处理服务器广播的游戏状态
function handleServerGameState(state, timestamp) {
    if (!state || !state.enemies) return;

    // 1. 同步敌人
    syncEnemies(state.enemies);

    // 2. 同步游戏时间/波次（可选，避免频繁跳变）
    if (state.wave && typeof WaveSystem !== 'undefined') {
        if (WaveSystem.currentWave !== state.wave) {
            console.log(`[SurvivalOnline] 同步波次: ${WaveSystem.currentWave} -> ${state.wave}`);
            WaveSystem.currentWave = state.wave;
            // 更新UI
            if (typeof UI !== 'undefined' && UI.updateWaveInfo) {
                UI.updateWaveInfo(WaveSystem.currentWave);
            }
        }
    }

    // 3. 同步投射物（僅視覺，或依需求開啟）
    // syncProjectiles(state.projectiles); 
    // 目前戰鬥改回客戶端權威計算傷害，投射物視覺可由各客戶端自行預測
}

// 同步敵人列表（核心邏輯）
function syncEnemies(serverEnemies) {
    if (!Game.enemies) Game.enemies = [];

    const serverIds = new Set();

    // A. 更新或創建敵人
    serverEnemies.forEach(sEnemy => {
        serverIds.add(sEnemy.id);

        // 查找本地是否存在
        const localEnemy = Game.enemies.find(e => e.id === sEnemy.id);

        if (localEnemy) {
            // --- 存在：更新狀態 (插值平滑) ---
            // 位置平滑插值 (Lerp)
            const t = 0.3; // 插值係數
            localEnemy.x = localEnemy.x + (sEnemy.x - localEnemy.x) * t;
            localEnemy.y = localEnemy.y + (sEnemy.y - localEnemy.y) * t;

            // 直接同步血量（避免血條跳動，可做緩動但直接同步最準）
            // 注意：如果本地預測了傷害，這裡會被服務器覆蓋，這是正確的（最終一致性）
            localEnemy.health = sEnemy.health;
            localEnemy.maxHealth = sEnemy.maxHealth;

            // 同步死亡狀態
            if (sEnemy.isDead && !localEnemy.isDead) {
                localEnemy.health = 0;
                localEnemy.isDead = true;
            }

        } else {
            // --- 不存在：創建新敵人 ---
            // 確保 Enemy 類可用
            if (typeof Enemy !== 'undefined') {
                // 創建實例 (位置 x,y, 類型 type)
                // 注意：Enemy 構造函數通常會生成隨機 ID，我們必須覆蓋它
                const newEnemy = new Enemy(sEnemy.x, sEnemy.y, sEnemy.type);

                // 🚨 關鍵：覆蓋 ID 為服務器 ID 🚨
                newEnemy.id = sEnemy.id;

                // 同步屬性
                newEnemy.health = sEnemy.health;
                newEnemy.maxHealth = sEnemy.maxHealth;
                newEnemy.speed = sEnemy.speed;

                // 加入遊戲循環
                Game.enemies.push(newEnemy);
                console.log(`[SurvivalOnline] 同步創建敵人: ${sEnemy.type} (ID: ${sEnemy.id})`);
            }
        }
    });

    // B. 移除本地多餘敵人（服務器已刪除，本地也該刪除）
    for (let i = Game.enemies.length - 1; i >= 0; i--) {
        const localEnemy = Game.enemies[i];
        // 如果本地敵人ID不在服務器列表中，且不是死亡動畫中（可選保留屍體），則移除
        // 簡單起見：嚴格同步，不在服務器列表就移除
        if (!serverIds.has(localEnemy.id)) {
            console.log(`[SurvivalOnline] 同步移除敵人: ${localEnemy.id}`);
            Game.enemies.splice(i, 1);
        }
    }
}
