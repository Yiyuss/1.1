// ✅ 独立完成品：消息队列系统，确保 new-session 在游戏循环读取状态之前被处理
// 这个文件是100%独立的，不依赖现有代码，可以直接测试

/**
 * SessionQueue - 消息队列系统
 * 
 * 核心功能：
 * 1. 接收 new-session 消息并放入队列
 * 2. 在游戏循环读取状态之前，处理队列中的所有消息
 * 3. 确保 new-session 处理完成后，才允许读取状态
 * 
 * 设计原则：
 * - 完全同步处理，避免时序竞争条件
 * - 使用队列确保消息按顺序处理
 * - 在游戏循环中强制先处理队列，再读取状态
 */
class SessionQueue {
  constructor() {
    // 消息队列：存储待处理的 new-session 消息
    this.queue = [];
    
    // 处理标记：标记是否正在处理队列
    this.isProcessing = false;
    
    // 锁机制：确保同一时间只有一个处理流程
    this.lock = false;
  }

  /**
   * 添加 new-session 消息到队列
   * @param {string} sessionId - 新的 session ID
   * @param {Map} playerUpdates - 玩家更新数据
   * @param {Function} processCallback - 处理回调函数（resetForNewSession）
   */
  enqueue(sessionId, playerUpdates, processCallback) {
    if (!sessionId || typeof sessionId !== 'string') {
      console.warn('[SessionQueue] 无效的 sessionId，跳过');
      return;
    }

    // 添加到队列
    this.queue.push({
      sessionId,
      playerUpdates: playerUpdates || new Map(),
      processCallback,
      timestamp: Date.now()
    });

    console.log(`[SessionQueue] ✅ 已添加 new-session 到队列: sessionId=${sessionId}, 队列长度=${this.queue.length}`);
  }

  /**
   * 处理队列中的所有消息（必须在游戏循环读取状态之前调用）
   * @returns {boolean} 是否处理了任何消息
   */
  processAll() {
    // 如果正在处理或队列为空，直接返回
    if (this.isProcessing || this.queue.length === 0) {
      return false;
    }

    // 设置处理标记
    this.isProcessing = true;
    let processedCount = 0;

    try {
      // 处理队列中的所有消息
      while (this.queue.length > 0) {
        const message = this.queue.shift();
        if (!message || !message.processCallback) {
          continue;
        }

        try {
          // 调用处理回调（resetForNewSession）
          message.processCallback(message.sessionId, message.playerUpdates);
          processedCount++;
          console.log(`[SessionQueue] ✅ 已处理 new-session: sessionId=${message.sessionId}`);
        } catch (error) {
          console.error(`[SessionQueue] ❌ 处理 new-session 失败:`, error);
        }
      }
    } finally {
      // 清除处理标记
      this.isProcessing = false;
    }

    if (processedCount > 0) {
      console.log(`[SessionQueue] ✅ 队列处理完成，共处理 ${processedCount} 条消息`);
    }

    return processedCount > 0;
  }

  /**
   * 获取队列长度（用于调试）
   */
  getQueueLength() {
    return this.queue.length;
  }

  /**
   * 清空队列（用于重置）
   */
  clear() {
    this.queue = [];
    this.isProcessing = false;
    console.log('[SessionQueue] ✅ 队列已清空');
  }
}

module.exports = { SessionQueue };

