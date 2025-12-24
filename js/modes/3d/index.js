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
      // 停止主體遊戲邏輯與音樂
      try { if (typeof Game !== 'undefined' && Game.pause) Game.pause(true); } catch(_){}
      try { if (typeof AudioManager !== 'undefined' && AudioManager.stopAllMusic) AudioManager.stopAllMusic(); } catch(_){}

      // 隐藏所有覆盖窗口
      const diffScreen = document.getElementById('difficulty-select-screen');
      const desertDiffScreen = document.getElementById('desert-difficulty-select-screen');
      const mapScreen = document.getElementById('map-select-screen');
      const charScreen = document.getElementById('character-select-screen');
      if (diffScreen) diffScreen.classList.add('hidden');
      if (desertDiffScreen) desertDiffScreen.classList.add('hidden');
      if (mapScreen) mapScreen.classList.add('hidden');
      if (charScreen) charScreen.classList.add('hidden');

      // 显示游戏画面
      const gameScreen = document.getElementById('game-screen');
      const gameUI = document.getElementById('game-ui');
      if (gameScreen) gameScreen.classList.remove('hidden');
      if (gameUI) gameUI.style.display = 'none';

      // 清除其他模式的GIF图层残留
      try { if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.clearAll === 'function') window.GifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.TDGifOverlay !== 'undefined' && typeof window.TDGifOverlay.clearAll === 'function') window.TDGifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.ChallengeGifOverlay !== 'undefined' && typeof window.ChallengeGifOverlay.clearAll === 'function') window.ChallengeGifOverlay.clearAll(); } catch(_){}
      try { if (typeof window.MainGifOverlay !== 'undefined' && typeof window.MainGifOverlay.clearAll === 'function') window.MainGifOverlay.clearAll(); } catch(_){}

      // 获取canvas元素
      const canvas = ctx.dom.canvas;
      if (!canvas) {
        console.error('[3D Mode] Canvas not found');
        return;
      }

      // 检查Three.js是否已加载
      if (typeof THREE === 'undefined') {
        console.error('[3D Mode] Three.js is not loaded. Please include Three.js library.');
        alert('3D模式需要Three.js库，请确保已加载Three.js');
        return;
      }

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

      // 初始化3D场景
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x87CEEB); // 天蓝色背景

      // 相机设置
      const camera = new THREE.PerspectiveCamera(
        75,
        canvas.width / canvas.height,
        0.1,
        1000
      );
      camera.position.set(0, 5, 10);
      camera.lookAt(0, 0, 0);

      // 渲染器设置
      const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true
      });
      renderer.setSize(canvas.width, canvas.height);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // 添加光源
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 10, 5);
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
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
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // 设置动画混合器
          if (gltf.animations && gltf.animations.length > 0) {
            playerMixer = new THREE.AnimationMixer(playerModel);
            gltf.animations.forEach((clip) => {
              const action = playerMixer.clipAction(clip);
              playerActions[clip.name] = action;
            });

            // 默认播放Idle动画
            if (playerActions['Idle']) {
              currentAction = playerActions['Idle'];
              currentAction.play();
            } else if (Object.keys(playerActions).length > 0) {
              // 如果没有Idle，播放第一个动画
              const firstActionName = Object.keys(playerActions)[0];
              currentAction = playerActions[firstActionName];
              currentAction.play();
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
        switch(e.key.toLowerCase()) {
          case 'w': keys.w = true; break;
          case 'a': keys.a = true; break;
          case 's': keys.s = true; break;
          case 'd': keys.d = true; break;
          case 'shift': keys.shift = true; break;
          case ' ': keys.space = true; break;
        }
        switch(e.key) {
          case 'ArrowUp': keys.arrowUp = true; break;
          case 'ArrowDown': keys.arrowDown = true; break;
          case 'ArrowLeft': keys.arrowLeft = true; break;
          case 'ArrowRight': keys.arrowRight = true; break;
        }
      };

      const handleKeyUp = (e) => {
        switch(e.key.toLowerCase()) {
          case 'w': keys.w = false; break;
          case 'a': keys.a = false; break;
          case 's': keys.s = false; break;
          case 'd': keys.d = false; break;
          case 'shift': keys.shift = false; break;
          case ' ': keys.space = false; break;
        }
        switch(e.key) {
          case 'ArrowUp': keys.arrowUp = false; break;
          case 'ArrowDown': keys.arrowDown = false; break;
          case 'ArrowLeft': keys.arrowLeft = false; break;
          case 'ArrowRight': keys.arrowRight = false; break;
        }
      };

      // 绑定键盘事件
      ctx.events.on(window, 'keydown', handleKeyDown);
      ctx.events.on(window, 'keyup', handleKeyUp);

      // 切换动画
      const switchAction = (actionName) => {
        if (!playerMixer || !playerActions[actionName]) return;
        
        const newAction = playerActions[actionName];
        if (currentAction === newAction) return;

        if (currentAction) {
          currentAction.fadeOut(0.2);
        }
        newAction.reset().fadeIn(0.2).play();
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

        const moveDir = new THREE.Vector3(moveX, 0, moveZ).normalize();
        const isMoving = moveDir.length() > 0;
        const isRunning = keys.shift && isMoving;

        // 跳跃处理（只有在有Jump动画时才处理）
        if (keys.space && !isJumping) {
          if (playerActions['Jump']) {
            isJumping = true;
            wasRunningWhenJumped = isRunning;
            jumpStartTime = Date.now();
            switchAction('Jump');
          } else {
            // 如果没有Jump动画，使用简单的跳跃（仅用于fallback立方体）
            console.log('[3D Mode] No Jump animation, using simple jump');
          }
        }

        // 跳跃动画控制（基于JUMP邏輯.txt）
        if (isJumping && currentAction && currentAction.getClip().name === 'Jump') {
          const jumpAction = currentAction;
          if (jumpAction.isRunning()) {
            const jumpProgress = jumpAction.time / jumpAction.getClip().duration;

            // 逻辑A：起跳锁定 (0% ~ 30%)
            if (jumpProgress < JUMP_CONFIG.controlStart) {
              // 绝对不执行位移
            }
            // 逻辑B：空中控制 (30% ~ 70%)
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
              }
            }
            // 逻辑C：落地即停 (70% ~ 100%)
            else if (jumpProgress >= JUMP_CONFIG.landPoint) {
              // 位移自然停止
              playerVelocity.x = 0;
              playerVelocity.z = 0;
            }

            // 检查跳跃是否结束
            if (jumpProgress >= 1.0) {
              isJumping = false;
              // 切换回Idle或Walk
              if (isMoving) {
                switchAction(isRunning ? 'Run' : 'Walk');
              } else {
                switchAction('Idle');
              }
            }
          }
        }
        // 正常移动（非跳跃状态）
        else if (!isJumping) {
          if (isMoving) {
            const speed = isRunning ? 5.0 : 2.5; // 跑步速度是走路的两倍
            playerVelocity.x = moveDir.x * speed;
            playerVelocity.z = moveDir.z * speed;
            
            // 转向
            playerRotation = Math.atan2(moveDir.x, moveDir.z);
            
            // 切换动画
            switchAction(isRunning ? 'Run' : 'Walk');
          } else {
            playerVelocity.x = 0;
            playerVelocity.z = 0;
            switchAction('Idle');
          }
        }

        // 应用移动
        playerModel.position.x += playerVelocity.x * deltaTime;
        playerModel.position.z += playerVelocity.z * deltaTime;
        playerModel.rotation.y = playerRotation;

        // 更新相机跟随
        camera.position.x = playerModel.position.x;
        camera.position.z = playerModel.position.z + 10;
        camera.lookAt(playerModel.position);
      };

      // 动画循环
      let lastTime = 0;
      const animate = (currentTime) => {
        const deltaTime = (currentTime - lastTime) / 1000; // 转换为秒
        lastTime = currentTime;

        // 更新动画混合器
        if (playerMixer) {
          playerMixer.update(deltaTime);
        }

        // 更新玩家逻辑（只有在玩家模型存在时才更新）
        if (playerModel) {
          updatePlayer(deltaTime);
        }

        // 渲染场景（无论模型是否加载完成都渲染）
        renderer.render(scene, camera);

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
        // 移除ESC菜单
        if (escMenu && escMenu.parentNode) {
          escMenu.parentNode.removeChild(escMenu);
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

