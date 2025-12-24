// 3D模式（3D Mode）
// 目的：
// - 使用Three.js加载3D模型（地图和角色）
// - 实现WASD/方向键移动、SHIFT跑步、空白键跳跃
// - 使用JUMP邏輯.txt中的参数控制跳跃动画
// - 确保模式独立，不污染其他模式
(function(){
  const MODE_ID = '3d';

  // 跳跃配置（来自JUMP邏輯.txt）
  const JUMP_CONFIG = {
    controlStart: 0.3,   // 30% 开始动
    landPoint: 0.7,      // 70% 停下来
    airSpeedBase: 3.0,   // 走路跳速度
    sprintBonus: 1.5     // 跑步跳加成
  };

  const Mode3D = {
    id: MODE_ID,
    
    // 资源清单（3D模式不需要图片资源，但需要Three.js库）
    getManifest(){
      return {
        images: [],
        audio: [],
        json: []
      };
    },

    async enter(params, ctx){
      // ========== 完全停止其他模式，确保3D模式独立运行 ==========
      
      // 1. 停止Game的主循环（生存模式）
      try {
        if (typeof Game !== 'undefined') {
          // 暂停游戏
          if (Game.pause) Game.pause(true);
          // 停止游戏循环
          if (Game.isPaused !== undefined) Game.isPaused = true;
          if (Game.isGameOver !== undefined) Game.isGameOver = true;
          // 清除Game的canvas引用，避免冲突
          if (Game.canvas) {
            try {
              // 尝试释放2D上下文
              const oldCtx = Game.ctx;
              if (oldCtx) {
                // 清除canvas内容
                oldCtx.clearRect(0, 0, Game.canvas.width, Game.canvas.height);
              }
            } catch(_){}
            Game.canvas = null;
            Game.ctx = null;
          }
        }
      } catch(e) {
        console.warn('[3D Mode] Error stopping Game:', e);
      }
      
      // 2. 停止所有音乐
      try { if (typeof AudioManager !== 'undefined' && AudioManager.stopAllMusic) AudioManager.stopAllMusic(); } catch(_){}
      
      // 3. 隐藏所有覆盖窗口
      const diffScreen = document.getElementById('difficulty-select-screen');
      const desertDiffScreen = document.getElementById('desert-difficulty-select-screen');
      const mapScreen = document.getElementById('map-select-screen');
      const charScreen = document.getElementById('character-select-screen');
      if (diffScreen) diffScreen.classList.add('hidden');
      if (desertDiffScreen) desertDiffScreen.classList.add('hidden');
      if (mapScreen) mapScreen.classList.add('hidden');
      if (charScreen) charScreen.classList.add('hidden');

      // 4. 显示游戏画面，隐藏所有其他UI
      const gameScreen = document.getElementById('game-screen');
      const gameUI = document.getElementById('game-ui');
      if (gameScreen) gameScreen.classList.remove('hidden');
      if (gameUI) gameUI.style.display = 'none';
      
      // 隐藏其他模式的UI
      try {
        const stageUI = document.getElementById('stage-ui');
        if (stageUI) stageUI.style.display = 'none';
      } catch(_){}
      try {
        const challengeUI = document.getElementById('challenge-ui');
        if (challengeUI) challengeUI.style.display = 'none';
      } catch(_){}

      // 5. 清除其他模式的GIF图层残留
      try { if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.clearAll === 'function') window.GifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.TDGifOverlay !== 'undefined' && typeof window.TDGifOverlay.clearAll === 'function') window.TDGifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.ChallengeGifOverlay !== 'undefined' && typeof window.ChallengeGifOverlay.clearAll === 'function') window.ChallengeGifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.MainGifOverlay !== 'undefined' && typeof window.MainGifOverlay.clearAll === 'function') window.MainGifOverlay.clearAll(); } catch(_){}

      // 6. 获取canvas元素并清理2D上下文
      const canvas = ctx.dom.canvas;
      if (!canvas) {
        console.error('[3D Mode] Canvas not found');
        return;
      }
      
      // 关键：canvas可能已经有2D上下文，需要重新创建canvas或使用新的canvas
      // 方案：创建一个新的canvas元素替换旧的
      let webglCanvas = canvas;
      const existingContext = canvas.getContext('2d') || canvas.getContext('webgl') || canvas.getContext('webgl2');
      
      if (existingContext) {
        console.log('[3D Mode] Canvas has existing context, creating new canvas for WebGL');
        // 创建新的canvas元素用于WebGL
        webglCanvas = document.createElement('canvas');
        webglCanvas.id = 'game-canvas-3d';
        // 设置3D画布为1920x1080
        webglCanvas.width = 1920;
        webglCanvas.height = 1080;
        webglCanvas.style.width = '100%';
        webglCanvas.style.height = '100%';
        webglCanvas.style.display = 'block';
        webglCanvas.style.position = 'absolute';
        webglCanvas.style.top = '50%';
        webglCanvas.style.left = '50%';
        webglCanvas.style.transform = 'translate(-50%, -50%)';
        webglCanvas.style.objectFit = 'contain';
        
        // 替换原canvas
        const viewport = document.getElementById('viewport');
        if (viewport) {
          // 隐藏原canvas
          canvas.style.display = 'none';
          // 添加新canvas
          viewport.appendChild(webglCanvas);
        } else {
          // 如果没有viewport，直接替换
          canvas.parentNode.replaceChild(webglCanvas, canvas);
        }
        
        console.log('[3D Mode] Created new WebGL canvas');
      }

      // 检查Three.js是否已加载（通过importmap加载的ES6模块版本）
      if (typeof window.THREE === 'undefined' && typeof THREE === 'undefined') {
        console.error('[3D Mode] Three.js is not loaded. Please include Three.js library.');
        alert('3D模式需要Three.js库，请确保已加载Three.js');
        return;
      }
      
      // 使用全局THREE（通过importmap加载的ES6模块版本）
      const THREE_NS = window.THREE || THREE;

      // 等待GLTFLoader加载
      let GLTFLoader = null;
      const maxWaitTime = 5000; // 最多等待5秒
      const startTime = Date.now();
      
      // 首先检查全局是否已有GLTFLoader（HTML中的script可能已经加载）
      if (typeof window.GLTFLoader !== 'undefined') {
        GLTFLoader = window.GLTFLoader;
        console.log('[3D Mode] Using global GLTFLoader');
      } else {
        // 如果全局没有，等待HTML中的script加载
        console.log('[3D Mode] GLTFLoader not found in global, waiting for HTML script...');
        
        // 等待HTML中的script加载（最多等待3秒）
        while (typeof window.GLTFLoader === 'undefined' && (Date.now() - startTime) < 3000) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (typeof window.GLTFLoader !== 'undefined') {
          GLTFLoader = window.GLTFLoader;
          console.log('[3D Mode] GLTFLoader found after waiting for HTML script');
        } else {
          // 如果HTML中的script还没加载，尝试动态导入
          console.log('[3D Mode] Importing GLTFLoader dynamically...');
          try {
            const loaderModule = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js');
            GLTFLoader = loaderModule.GLTFLoader;
            window.GLTFLoader = GLTFLoader; // 缓存到全局
            console.log('[3D Mode] GLTFLoader imported and cached');
          } catch(e) {
            console.error('[3D Mode] Failed to import GLTFLoader:', e);
            // 再等待一下
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (typeof window.GLTFLoader !== 'undefined') {
              GLTFLoader = window.GLTFLoader;
              console.log('[3D Mode] GLTFLoader found after final wait');
            } else {
              console.error('[3D Mode] GLTFLoader failed to load after all attempts');
              alert('3D模式需要GLTFLoader，但加载失败。\n\n可能的原因：\n1. 网络连接问题\n2. CDN访问受限\n3. 浏览器不支持ES6模块\n\n请检查浏览器控制台获取详细错误信息。');
              throw new Error('GLTFLoader failed to load');
            }
          }
        }
      }
      
      if (!GLTFLoader) {
        console.error('[3D Mode] GLTFLoader is still not available');
        alert('3D模式需要GLTFLoader，请刷新页面重试。');
        throw new Error('GLTFLoader not available');
      }
      
      console.log('[3D Mode] GLTFLoader ready, initializing 3D scene...');

      // 使用全局THREE（通过importmap加载的ES6模块版本）
      const THREE = THREE_NS;

      // 初始化3D场景
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x87CEEB); // 天蓝色背景

      // 相机设置
      const camera = new THREE.PerspectiveCamera(
        75,
        webglCanvas.width / webglCanvas.height,
        0.1,
        1000
      );
      
      // 相机控制变量
      let cameraDistance = 10;
      let cameraHeight = 2; // 降低摄影机高度（从5改为2）
      let cameraAngleX = 0; // 水平旋转角度
      let cameraAngleY = Math.PI / 6; // 垂直角度（俯视角度）
      let isRightMouseDown = false;
      let lastMouseX = 0;
      let lastMouseY = 0;
      
      camera.position.set(0, cameraHeight, cameraDistance);
      camera.lookAt(0, 0, 0);

      // 渲染器设置（使用新的WebGL canvas）
      const renderer = new THREE.WebGLRenderer({
        canvas: webglCanvas,
        antialias: true,
        alpha: false
      });
      // 设置渲染器大小（使用实际显示大小，而不是canvas分辨率）
      const updateRendererSize = () => {
        const container = webglCanvas.parentElement;
        if (container) {
          const containerWidth = container.clientWidth;
          const containerHeight = container.clientHeight;
          const aspect = webglCanvas.width / webglCanvas.height;
          
          let displayWidth, displayHeight;
          if (containerWidth / containerHeight > aspect) {
            displayHeight = containerHeight;
            displayWidth = displayHeight * aspect;
          } else {
            displayWidth = containerWidth;
            displayHeight = displayWidth / aspect;
          }
          
          renderer.setSize(displayWidth, displayHeight);
          camera.aspect = displayWidth / displayHeight;
          camera.updateProjectionMatrix();
        } else {
          renderer.setSize(webglCanvas.width, webglCanvas.height);
        }
        renderer.setPixelRatio(1); // 固定像素比为1，大幅优化性能
      };
      
      updateRendererSize();
      
      // 监听窗口大小变化
      const handleResize = () => {
        updateRendererSize();
      };
      ctx.events.on(window, 'resize', handleResize);
      // 禁用阴影以优化性能（3D探索模式不需要阴影）
      renderer.shadowMap.enabled = false;

      // 添加光源
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 10, 5);
      directionalLight.castShadow = false; // 禁用阴影以优化性能
      scene.add(directionalLight);

      // 玩家状态
      let playerModel = null;
      let playerMixer = null;
      let playerActions = {};
      let currentAction = null;
      let isJumping = false;
      let wasRunningWhenJumped = false;
      let jumpStartTime = 0;
      let playerVelocity = new THREE.Vector3(0, 0, 0);
      let playerPosition = new THREE.Vector3(0, 0, 0);
      let playerRotation = 0;
      // 身体朝向修正（模型轴向 vs 代码朝向）
      // 说明：
      // - 我们的 playerRotation 是「面向移动方向」的世界 yaw（atan2(moveDir.x, moveDir.z)）
      // - 但 GLB 模型自身的“正前方”轴可能不是 +Z（常见：朝 -Z 或朝 +X）
      // 现象：
      // - 往左走但身体朝右、或走向与身体偏 90°，都属于这个问题
      // 用法：
      // - 180° 相反：Math.PI
      // - 90° 偏移：Math.PI / 2 或 -Math.PI / 2
      const MODEL_FACING_YAW_OFFSET = Math.PI;
      let lastSpaceKeyState = false; // 记录上一次空格键的状态，用于检测按键按下事件
      let justFinishedJump = false; // 标记刚刚完成跳跃，用于防止落地瞬间错误更新旋转

      // 输入状态
      const keys = {
        w: false,
        a: false,
        s: false,
        d: false,
        arrowUp: false,
        arrowDown: false,
        arrowLeft: false,
        arrowRight: false,
        shift: false,
        space: false
      };

      // 加载地图模型
      const mapLoader = new GLTFLoader();
      let mapLoaded = false;
      mapLoader.load(
        'js/modes/3d/map/invasion_map_-_miniroyale.io.glb',
        (gltf) => {
          const mapModel = gltf.scene;
          mapModel.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          scene.add(mapModel);
          mapLoaded = true;
          console.log('[3D Mode] Map loaded successfully');
        },
        (progress) => {
          if (progress.total > 0) {
            const percent = (progress.loaded / progress.total * 100).toFixed(1);
            console.log('[3D Mode] Map loading progress:', percent + '%');
          }
        },
        (error) => {
          console.error('[3D Mode] Map loading error:', error);
          // 即使地图加载失败，也创建一个基本的地面
          const groundGeometry = new THREE.PlaneGeometry(100, 100);
          const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
          const ground = new THREE.Mesh(groundGeometry, groundMaterial);
          ground.rotation.x = -Math.PI / 2;
          ground.position.y = 0;
          ground.receiveShadow = true;
          scene.add(ground);
          console.log('[3D Mode] Created fallback ground plane');
        }
      );

      // 加载角色模型（MargaretNorth.glb）
      const playerLoader = new GLTFLoader();
      let playerLoaded = false;
      playerLoader.load(
        'js/modes/3d/MargaretNorth.glb',
        (gltf) => {
          playerModel = gltf.scene;
          playerModel.scale.set(1, 1, 1);
          playerModel.position.set(0, 0, 0);
          playerModel.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = false; // 禁用阴影以优化性能
              child.receiveShadow = false;
            }
          });

          // 设置动画混合器
          if (gltf.animations && gltf.animations.length > 0) {
            // ===== 香蕉皮（請勿移除）=====
            // 問題本質：
            // - 很多 GLB 動畫（尤其 Jump）會夾帶「根節點/非骨骼」的 position/quaternion/rotation 軌道
            // - 這會污染我們用程式控制的移動/轉向，造成落地後轉圈、位移飄移等「看似物理錯誤」的現象
            // 正確做法（本模式設計）：
            // - 角色的「位移/轉向」永遠由程式控制（符合現實物理/操作手感）
            // - 動畫只負責骨架姿勢（Bone tracks），不要動根節點 transform
            // 因此：建立 action 前，先把非骨骼節點的 transform tracks 剔除（把香蕉皮剝掉）
            const collectBoneNames = (root) => {
              const set = new Set();
              root.traverse((obj) => {
                if (obj && obj.isBone && typeof obj.name === 'string') {
                  set.add(obj.name);
                }
              });
              return set;
            };

            const sanitizeClip = (clip, boneNames) => {
              const keptTracks = clip.tracks.filter((track) => {
                const name = track && track.name ? String(track.name) : '';
                const dot = name.indexOf('.');
                if (dot <= 0) return true;
                const nodeName = name.slice(0, dot);
                const prop = name.slice(dot + 1);

                const isTransform = (prop === 'position' || prop === 'quaternion' || prop === 'rotation');
                // 非骨骼節點的 transform 一律剔除（由程式控制）
                if (isTransform && nodeName && !boneNames.has(nodeName)) {
                  return false;
                }
                return true;
              });

              // 用新 clip 取代原 clip（名稱維持不變，方便既有 switchAction 模糊匹配）
              return new THREE.AnimationClip(clip.name, clip.duration, keptTracks);
            };

            const boneNames = collectBoneNames(playerModel);
            playerMixer = new THREE.AnimationMixer(playerModel);
            gltf.animations.forEach((clip) => {
              const safeClip = sanitizeClip(clip, boneNames);
              const action = playerMixer.clipAction(safeClip);
              playerActions[clip.name] = action;
              console.log('[3D Mode] Found animation:', clip.name);
            });

            // 输出所有可用的动画名称，方便调试
            console.log('[3D Mode] Available animations:', Object.keys(playerActions));

            // 默认播放Idle动画（尝试多种可能的名称）
            const idleNames = ['Idle', 'idle', 'IDLE', 'Idle_1', 'idle_1'];
            let idleFound = false;
            for (const name of idleNames) {
              if (playerActions[name]) {
                currentAction = playerActions[name];
                currentAction.setLoop(THREE.LoopRepeat);
                currentAction.play();
                idleFound = true;
                console.log('[3D Mode] Playing idle animation:', name);
                break;
              }
            }
            
            if (!idleFound && Object.keys(playerActions).length > 0) {
              // 如果没有Idle，播放第一个动画
              const firstActionName = Object.keys(playerActions)[0];
              currentAction = playerActions[firstActionName];
              currentAction.setLoop(THREE.LoopRepeat);
              currentAction.play();
              console.log('[3D Mode] Playing first available animation:', firstActionName);
            }
          }

          scene.add(playerModel);
          playerLoaded = true;
          console.log('[3D Mode] Player model loaded successfully');
        },
        (progress) => {
          if (progress.total > 0) {
            const percent = (progress.loaded / progress.total * 100).toFixed(1);
            console.log('[3D Mode] Player loading progress:', percent + '%');
          }
        },
        (error) => {
          console.error('[3D Mode] Player loading error:', error);
          // 即使角色加载失败，也创建一个基本的立方体作为玩家
          const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
          const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
          playerModel = new THREE.Mesh(playerGeometry, playerMaterial);
          playerModel.position.set(0, 1, 0);
          playerModel.castShadow = true;
          scene.add(playerModel);
          console.log('[3D Mode] Created fallback player cube');
        }
      );

      // 键盘事件处理
      const handleKeyDown = (e) => {
        // 如果焦点在输入框等元素上，不处理移动键
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
          return;
        }
        
        const key = e.key.toLowerCase();
        const code = e.code.toLowerCase();
        
        // WASD键
        if (key === 'w' || code === 'keyw') { keys.w = true; e.preventDefault(); e.stopPropagation(); }
        if (key === 'a' || code === 'keya') { keys.a = true; e.preventDefault(); e.stopPropagation(); }
        if (key === 's' || code === 'keys') { keys.s = true; e.preventDefault(); e.stopPropagation(); }
        if (key === 'd' || code === 'keyd') { keys.d = true; e.preventDefault(); e.stopPropagation(); }
        
        // Shift键
        if (key === 'shift' || code === 'shiftleft' || code === 'shiftright') { keys.shift = true; }
        
        // 空格键
        if (key === ' ' || key === 'space' || code === 'space') { keys.space = true; e.preventDefault(); e.stopPropagation(); }
        
        // 方向键
        if (e.key === 'ArrowUp' || code === 'arrowup') { keys.arrowUp = true; e.preventDefault(); e.stopPropagation(); }
        if (e.key === 'ArrowDown' || code === 'arrowdown') { keys.arrowDown = true; e.preventDefault(); e.stopPropagation(); }
        if (e.key === 'ArrowLeft' || code === 'arrowleft') { keys.arrowLeft = true; e.preventDefault(); e.stopPropagation(); }
        if (e.key === 'ArrowRight' || code === 'arrowright') { keys.arrowRight = true; e.preventDefault(); e.stopPropagation(); }
      };

      const handleKeyUp = (e) => {
        const key = e.key.toLowerCase();
        const code = e.code.toLowerCase();
        
        // WASD键
        if (key === 'w' || code === 'keyw') { keys.w = false; }
        if (key === 'a' || code === 'keya') { keys.a = false; }
        if (key === 's' || code === 'keys') { keys.s = false; }
        if (key === 'd' || code === 'keyd') { keys.d = false; }
        
        // Shift键
        if (key === 'shift' || code === 'shiftleft' || code === 'shiftright') { keys.shift = false; }
        
        // 空格键
        if (key === ' ' || key === 'space' || code === 'space') { keys.space = false; }
        
        // 方向键
        if (e.key === 'ArrowUp' || code === 'arrowup') { keys.arrowUp = false; }
        if (e.key === 'ArrowDown' || code === 'arrowdown') { keys.arrowDown = false; }
        if (e.key === 'ArrowLeft' || code === 'arrowleft') { keys.arrowLeft = false; }
        if (e.key === 'ArrowRight' || code === 'arrowright') { keys.arrowRight = false; }
      };

      // 绑定键盘事件（使用capture确保能捕获，并直接绑定到document）
      document.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('keyup', handleKeyUp, true);
      
      // 存储清理函数
      Mode3D._keyboardCleanup = () => {
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keyup', handleKeyUp, true);
      };
      
      // 鼠标控制：滚轮缩放，右键旋转视角
      const handleMouseWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 1.1 : 0.9;
        cameraDistance = Math.max(3, Math.min(50, cameraDistance * delta));
      };
      
      const handleMouseDown = (e) => {
        if (e.button === 2) { // 右键
          e.preventDefault();
          isRightMouseDown = true;
          lastMouseX = e.clientX;
          lastMouseY = e.clientY;
        }
      };
      
      const handleMouseMove = (e) => {
        if (isRightMouseDown) {
          const deltaX = e.clientX - lastMouseX;
          const deltaY = e.clientY - lastMouseY;
          
          // 水平旋转
          cameraAngleX -= deltaX * 0.01;
          // 垂直角度限制（上下角度反过来）
          cameraAngleY = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, cameraAngleY + deltaY * 0.01));
          
          lastMouseX = e.clientX;
          lastMouseY = e.clientY;
        }
      };
      
      const handleMouseUp = (e) => {
        if (e.button === 2) {
          isRightMouseDown = false;
        }
      };
      
      ctx.events.on(webglCanvas, 'wheel', handleMouseWheel);
      ctx.events.on(webglCanvas, 'mousedown', handleMouseDown);
      ctx.events.on(window, 'mousemove', handleMouseMove);
      ctx.events.on(window, 'mouseup', handleMouseUp);
      // 禁用右键菜单
      ctx.events.on(webglCanvas, 'contextmenu', (e) => e.preventDefault());

      // 切换动画（支持模糊匹配，因为用户说每个动作都有命名，很好辨认）
      const switchAction = (actionName) => {
        if (!playerMixer) {
          console.warn('[3D Mode] switchAction: playerMixer not available');
          return;
        }
        
        // 首先尝试精确匹配
        let newAction = playerActions[actionName];
        
        // 如果精确匹配失败，尝试模糊匹配（支持常见的命名变体）
        if (!newAction) {
          const nameLower = actionName.toLowerCase();
          
          // 映射常见的动作名称变体
          const nameMappings = {
            'walk': ['walking', 'walk'],
            'run': ['running', 'run'],
            'idle': ['idle'],
            'jump': ['jump']
          };
          
          // 查找匹配的动画名称
          for (const key in playerActions) {
            const keyLower = key.toLowerCase();
            
            // 精确匹配或包含匹配
            if (keyLower === nameLower || keyLower.includes(nameLower) || nameLower.includes(keyLower)) {
              newAction = playerActions[key];
              console.log(`[3D Mode] Matched animation: "${key}" for requested "${actionName}"`);
              break;
            }
          }
          
          // 如果还是没找到，尝试通过映射查找
          if (!newAction) {
            for (const [baseName, variants] of Object.entries(nameMappings)) {
              if (variants.includes(nameLower)) {
                for (const variant of variants) {
                  for (const key in playerActions) {
                    if (key.toLowerCase().includes(variant)) {
                      newAction = playerActions[key];
                      console.log(`[3D Mode] Matched animation via mapping: "${key}" for "${actionName}"`);
                      break;
                    }
                  }
                  if (newAction) break;
                }
                if (newAction) break;
              }
            }
          }
        }
        
        if (!newAction) {
          console.warn(`[3D Mode] Animation not found: "${actionName}". Available:`, Object.keys(playerActions));
          return;
        }
        
        // 如果是同一个动作，不切换（但如果是跳跃动画，必须强制停止）
        if (currentAction === newAction) {
          // 如果当前是跳跃动画，必须强制停止并切换
          const currentClipName = currentAction ? currentAction.getClip().name.toLowerCase() : '';
          if (currentClipName.includes('jump')) {
            console.log('[3D Mode] Force stopping jump animation and switching to:', actionName);
            if (currentAction) {
              currentAction.stop();
              currentAction.reset();
            }
            // 继续执行切换逻辑，不return
          } else {
            return; // 非跳跃动画，如果相同就不切换
          }
        }

        // 停止当前动画
        if (currentAction) {
          // 如果当前是跳跃动画，立即停止，不淡出
          const currentClipName = currentAction.getClip().name.toLowerCase();
          if (currentClipName.includes('jump')) {
            currentAction.stop();
            currentAction.reset();
          } else {
            currentAction.fadeOut(0.1); // 非跳跃动画，淡出切换
          }
        }
        
        // 播放新动画（跳跃动画设置为LoopOnce，其他设置为LoopRepeat）
        const isJumpAnimation = actionName.toLowerCase().includes('jump');
        newAction.reset().fadeIn(0.1);
        if (isJumpAnimation) {
          newAction.setLoop(THREE.LoopOnce); // 跳跃动画不循环
        } else {
          newAction.setLoop(THREE.LoopRepeat); // 其他动画循环
        }
        newAction.play();
        currentAction = newAction;
      };

      // 更新玩家逻辑
      const updatePlayer = (deltaTime) => {
        if (!playerModel) return;

        // 计算移动方向
        let moveX = 0;
        let moveZ = 0;

        if (keys.w || keys.arrowUp) moveZ -= 1;
        if (keys.s || keys.arrowDown) moveZ += 1;
        if (keys.a || keys.arrowLeft) moveX -= 1;
        if (keys.d || keys.arrowRight) moveX += 1;

        // 调试：输出按键状态（只在第一次检测到移动时输出，避免日志过多）
        if ((moveX !== 0 || moveZ !== 0) && !updatePlayer._lastMoveState) {
          console.log('[3D Mode] Movement input detected:', { moveX, moveZ, keys: { w: keys.w, a: keys.a, s: keys.s, d: keys.d, arrowUp: keys.arrowUp, arrowDown: keys.arrowDown, arrowLeft: keys.arrowLeft, arrowRight: keys.arrowRight } });
          updatePlayer._lastMoveState = true;
        } else if (moveX === 0 && moveZ === 0) {
          updatePlayer._lastMoveState = false;
        }

        const moveDir = new THREE.Vector3(moveX, 0, moveZ);
        const moveLength = moveDir.length();
        const isMoving = moveLength > 0;
        const isRunning = keys.shift && isMoving;
        
        // 归一化移动方向
        if (isMoving) {
          moveDir.normalize();
        }

        // 跳跃处理（严格按照JUMP邏輯.txt的逻辑D：防止空中重复触发）
        // 现实物理：只有在完全落地（isJumping=false）时，才能响应新的跳跃按键
        // 关键：检测按键"按下"事件（从false变为true），而不是持续状态
        const spaceKeyPressed = keys.space && !lastSpaceKeyState; // 检测按键按下事件
        lastSpaceKeyState = keys.space; // 更新上一次的状态
        
        if (spaceKeyPressed && !isJumping) {
          // 尝试查找跳跃动画（不区分大小写）
          let jumpActionName = null;
          for (const name in playerActions) {
            if (name.toLowerCase().includes('jump')) {
              jumpActionName = name;
              break;
            }
          }
          
          if (jumpActionName) {
            // 现实物理：按下跳跃键 → 起跳
            isJumping = true;
            wasRunningWhenJumped = isRunning;
            jumpStartTime = Date.now();
            
            // 设置跳跃动画为不循环，播放一次后停止（按照JUMP邏輯.txt）
            const jumpAction = playerActions[jumpActionName];
            if (jumpAction) {
              jumpAction.setLoop(THREE.LoopOnce);
              jumpAction.clampWhenFinished = false; // 不停留在最后一帧，让动画自然结束
            }
            switchAction(jumpActionName);
            console.log('[3D Mode] Starting jump animation:', jumpActionName);
          } else {
            // 如果没有Jump动画，使用简单的跳跃（仅用于fallback立方体）
            console.log('[3D Mode] No Jump animation found, available:', Object.keys(playerActions));
          }
        }

        // 跳跃动画控制（严格按照JUMP邏輯.txt实现）
        if (isJumping && currentAction) {
          const jumpClipName = currentAction.getClip().name.toLowerCase();
          const isJumpAnimation = jumpClipName.includes('jump');
          
          if (isJumpAnimation && currentAction.isRunning()) {
            const jumpProgress = currentAction.time / currentAction.getClip().duration;

            // 逻辑A：起跳锁定 (0% ~ 30%) - 绝对不执行位移
            if (jumpProgress < JUMP_CONFIG.controlStart) {
              // 什么都不做，位移自然停止
              playerVelocity.x = 0;
              playerVelocity.z = 0;
            }
            // 逻辑B：空中控制 (30% ~ 70%) - 可以控制移动
            else if (jumpProgress >= JUMP_CONFIG.controlStart && jumpProgress < JUMP_CONFIG.landPoint) {
              if (isMoving) {
                const finalSpeed = wasRunningWhenJumped
                  ? (JUMP_CONFIG.airSpeedBase + JUMP_CONFIG.sprintBonus)
                  : JUMP_CONFIG.airSpeedBase;
                
                playerVelocity.x = moveDir.x * finalSpeed;
                playerVelocity.z = moveDir.z * finalSpeed;
                
                // 转向
                if (moveDir.length() > 0) {
                  playerRotation = Math.atan2(moveDir.x, moveDir.z);
                }
              } else {
                // 如果没有输入，保持当前速度（不强制停止）
                // 这样可以实现惯性效果
              }
            }
            // 逻辑C：落地即停 (70% ~ 100%) - 位移自然停止
            else if (jumpProgress >= JUMP_CONFIG.landPoint) {
              // 位移自然停止（什么都不写，速度会自然衰减）
              playerVelocity.x *= 0.9; // 逐渐减速
              playerVelocity.z *= 0.9;
              if (Math.abs(playerVelocity.x) < 0.1) playerVelocity.x = 0;
              if (Math.abs(playerVelocity.z) < 0.1) playerVelocity.z = 0;
            }

            // 现实物理：检查跳跃是否完全结束（动画播放完成 = 落地完成）
            // 关键：动画进度 >= 100% 表示动画播放完成，此时应该落地
            const jumpAnimationFinished = jumpProgress >= 1.0;
            
            if (jumpAnimationFinished) {
              // 现实物理：跳跃动画完全结束 = 落地完成 → 重置状态，允许下一次跳跃
              console.log('[3D Mode] Jump animation finished. Progress:', jumpProgress.toFixed(2), 'Running:', currentAction.isRunning());
              
              // 现实物理：落地后，立即重置跳跃状态（关键：必须在停止动画和切换动画之前重置）
              // 这样即使后续逻辑有问题，状态也已经重置，不会导致循环跳跃
              isJumping = false;
              wasRunningWhenJumped = false;
              justFinishedJump = true; // 标记刚刚完成跳跃，防止落地瞬间错误更新旋转
              
              // 停止跳跃动画（确保动画完全停止）
              if (currentAction) {
                currentAction.stop();
                currentAction.reset(); // 重置动画到开始状态，确保完全停止
              }
              
              // 现实物理：落地后，根据当前状态切换回Idle或Walking/Running
              // 玩家落地后，如果还在移动，就切换到Walking/Running；如果静止，就切换到Idle
              // 关键：必须强制切换动画，确保跳跃动画完全停止
              // 重要：不在这里改变playerRotation，保持跳跃前的方向（现实物理：落地后方向不变）
              if (isMoving) {
                switchAction(isRunning ? 'Running' : 'Walking');
              } else {
                switchAction('Idle');
              }
              
              console.log('[3D Mode] Jump ended, isJumping reset to false, switched to:', isMoving ? (isRunning ? 'Running' : 'Walking') : 'Idle');
            }
          } else if (!isJumpAnimation) {
            // 现实物理：如果isJumping=true但当前动画不是跳跃动画，说明跳跃已经结束但状态未重置
            // 强制重置状态，允许下一次跳跃
            console.warn('[3D Mode] Jump state mismatch: isJumping=true but current animation is not jump, resetting state');
            isJumping = false;
            wasRunningWhenJumped = false;
            // 不切换动画，因为当前动画已经是正确的了
          } else if (!currentAction.isRunning()) {
            // 现实物理：如果跳跃动画已经停止但isJumping还是true，说明状态未重置
            // 强制重置状态，允许下一次跳跃
            console.warn('[3D Mode] Jump animation stopped but isJumping=true, resetting state');
            isJumping = false;
            wasRunningWhenJumped = false;
            // 强制切换回Idle或Walking/Running
            if (isMoving) {
              switchAction(isRunning ? 'Running' : 'Walking');
            } else {
              switchAction('Idle');
            }
          }
        } else if (isJumping && !currentAction) {
          // 现实物理：如果isJumping=true但没有当前动画，说明状态异常
          // 强制重置状态，允许下一次跳跃
          console.warn('[3D Mode] Jump state mismatch: isJumping=true but no current action, resetting state');
          isJumping = false;
          wasRunningWhenJumped = false;
          if (isMoving) {
            switchAction(isRunning ? 'Running' : 'Walking');
          } else {
            switchAction('Idle');
          }
        }
        
        // 现实物理：防止状态不一致
        // 如果isJumping=false但还在播放跳跃动画，说明状态异常，强制同步
        if (!isJumping && currentAction) {
          const clipName = currentAction.getClip().name.toLowerCase();
          if (clipName.includes('jump') && currentAction.isRunning()) {
            console.warn('[3D Mode] State inconsistency: isJumping=false but jump animation is running, stopping animation');
            currentAction.stop();
            if (isMoving) {
              switchAction(isRunning ? 'Running' : 'Walking');
            } else {
              switchAction('Idle');
            }
          }
        }
        
        // 正常移动（严格按照JUMP邏輯.txt的逻辑D：防止空中重复触发）
        // 如果正在跳跃，不执行正常移动逻辑
        if (!isJumping) {
          // 现实物理：如果刚刚完成跳跃，在落地后的第一帧，不更新旋转方向
          // 这样可以防止落地瞬间因为moveDir计算错误导致的方向重置（转一圈的问题）
          if (justFinishedJump) {
            justFinishedJump = false; // 重置标记，下一帧可以正常更新旋转
            // 落地后的第一帧，只处理移动和动画切换，不更新旋转方向
            if (isMoving) {
              const speed = isRunning ? 5.0 : 2.5;
              playerVelocity.x = moveDir.x * speed;
              playerVelocity.z = moveDir.z * speed;
              // 不更新 playerRotation，保持跳跃前的方向
              switchAction(isRunning ? 'Running' : 'Walking');
            } else {
              playerVelocity.x = 0;
              playerVelocity.z = 0;
              // 不更新 playerRotation，保持跳跃前的方向
              switchAction('Idle');
            }
          } else {
            // 正常移动逻辑（落地后的第二帧开始）
            if (isMoving) {
              const speed = isRunning ? 5.0 : 2.5; // 跑步速度是走路的两倍
              playerVelocity.x = moveDir.x * speed;
              playerVelocity.z = moveDir.z * speed;
              
              // 现实物理：只有在有移动输入时才更新旋转方向
              // 这样落地后如果没有移动输入，方向保持不变（不会转一圈）
              if (moveDir.length() > 0) {
                playerRotation = Math.atan2(moveDir.x, moveDir.z);
              }
              
              // 切换动画（使用模糊匹配，支持Walking和Running）
              switchAction(isRunning ? 'Running' : 'Walking');
            } else {
              // 停止移动
              playerVelocity.x = 0;
              playerVelocity.z = 0;
              // 现实物理：停止移动时，方向保持不变（不会转一圈）
              // 不改变 playerRotation
              switchAction('Idle');
            }
          }
        }

        // 应用移动
        playerModel.position.x += playerVelocity.x * deltaTime;
        playerModel.position.z += playerVelocity.z * deltaTime;
        playerModel.rotation.y = playerRotation + MODEL_FACING_YAW_OFFSET;

        // 更新相机跟随（第三人称视角，支持鼠标控制）
        const playerX = playerModel.position.x;
        const playerY = playerModel.position.y;
        const playerZ = playerModel.position.z;
        
        // 根据角度计算相机位置
        const horizontalDistance = cameraDistance * Math.cos(cameraAngleY);
        const verticalDistance = cameraDistance * Math.sin(cameraAngleY);
        
        camera.position.x = playerX + horizontalDistance * Math.sin(cameraAngleX);
        camera.position.y = playerY + cameraHeight + verticalDistance;
        camera.position.z = playerZ + horizontalDistance * Math.cos(cameraAngleX);
        
        camera.lookAt(playerX, playerY + cameraHeight, playerZ);
      };

      // 动画循环（优化：限制帧率，避免CPU过载）
      let lastTime = 0;
      let frameCount = 0;
      let lastFpsTime = 0;
      const targetFPS = 60;
      const frameInterval = 1000 / targetFPS;
      let accumulatedTime = 0;
      let lastRenderTime = 0;
      
      const animate = (currentTime) => {
        if (lastTime === 0) {
          lastTime = currentTime;
          lastFpsTime = currentTime;
          lastRenderTime = currentTime;
        }
        
        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;
        accumulatedTime += deltaTime;
        
        // 限制更新频率，避免CPU过载
        if (accumulatedTime >= frameInterval) {
          const deltaTimeSeconds = accumulatedTime / 1000;
          accumulatedTime = 0;
          
          // 更新动画混合器
          if (playerMixer) {
            playerMixer.update(deltaTimeSeconds);
          }

          // 更新玩家逻辑（只有在玩家模型存在时才更新）
          if (playerModel) {
            updatePlayer(deltaTimeSeconds);
          }
        }
        
        // 限制渲染频率（最多60fps）
        const timeSinceLastRender = currentTime - lastRenderTime;
        if (timeSinceLastRender >= frameInterval) {
          renderer.render(scene, camera);
          lastRenderTime = currentTime;
        }
        
        // FPS统计（每5秒钟输出一次，减少日志）
        frameCount++;
        if (currentTime - lastFpsTime >= 5000) {
          const fps = Math.round(frameCount / 5);
          console.log('[3D Mode] Average FPS (last 5s):', fps);
          frameCount = 0;
          lastFpsTime = currentTime;
        }

        // 继续动画循环
        const rafId = ctx.timers.requestAnimationFrame(animate);
      };

      // 启动动画循环
      animate(0);

      // 创建ESC菜单
      let menuOpen = false;
      const escMenu = document.createElement('div');
      escMenu.id = '3d-mode-menu';
      escMenu.style.position = 'fixed';
      escMenu.style.top = '0';
      escMenu.style.left = '0';
      escMenu.style.width = '100%';
      escMenu.style.height = '100%';
      escMenu.style.background = 'rgba(0, 0, 0, 0.8)';
      escMenu.style.display = 'none';
      escMenu.style.justifyContent = 'center';
      escMenu.style.alignItems = 'center';
      escMenu.style.zIndex = '10000';
      escMenu.innerHTML = `
        <div style="background: rgba(0, 0, 0, 0.9); padding: 40px; border-radius: 12px; text-align: center; color: #fff;">
          <h2 style="margin-bottom: 20px;">3D模式選單</h2>
          <button id="3d-menu-return" style="padding: 12px 24px; margin: 10px; background: #4a90e2; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;">返回主選單</button>
        </div>
      `;
      document.body.appendChild(escMenu);

      const returnBtn = document.getElementById('3d-menu-return');
      if (returnBtn) {
        ctx.events.on(returnBtn, 'click', () => {
          try {
            if (window.GameModeManager && typeof window.GameModeManager.stop === 'function') {
              window.GameModeManager.stop();
            }
          } catch(_){}
        });
      }

      // ESC键处理
      const handleESC = (e) => {
        if (e.key === 'Escape') {
          menuOpen = !menuOpen;
          escMenu.style.display = menuOpen ? 'flex' : 'none';
        }
      };
      ctx.events.on(window, 'keydown', handleESC);

      // 存储清理函数
      Mode3D._cleanup = () => {
        // 清理Three.js资源
        if (renderer) {
          renderer.dispose();
          renderer.forceContextLoss();
        }
        if (scene) {
          scene.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach(m => m.dispose());
              } else {
                object.material.dispose();
              }
            }
          });
        }
        // 移除3D canvas（如果创建了新的）
        if (webglCanvas && webglCanvas.id === 'game-canvas-3d' && webglCanvas.parentNode) {
          webglCanvas.parentNode.removeChild(webglCanvas);
          // 恢复原canvas显示
          if (canvas && canvas.style) {
            canvas.style.display = '';
          }
        }
        // 移除ESC菜单
        if (escMenu && escMenu.parentNode) {
          escMenu.parentNode.removeChild(escMenu);
        }
        // 恢复Game的canvas引用（如果需要）
        try {
          if (typeof Game !== 'undefined' && canvas) {
            Game.canvas = canvas;
            Game.ctx = canvas.getContext('2d');
          }
        } catch(_){}
        
        // 清理键盘事件监听器
        if (Mode3D._keyboardCleanup) {
          Mode3D._keyboardCleanup();
          Mode3D._keyboardCleanup = null;
        }
      };
    },

    exit(ctx){
      // 清理资源
      if (typeof Mode3D._cleanup === 'function') {
        Mode3D._cleanup();
      }
    }
  };

  // 注册模式
  if (typeof window !== 'undefined' && window.GameModeManager) {
    window.GameModeManager.register(MODE_ID, Mode3D);
  }
})();

