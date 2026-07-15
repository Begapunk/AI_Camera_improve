class LivePusherManager {
  constructor() {
    this.pusherContext = null;
    this.isInitialized = false;
    this.onFrameCallback = null;
    this.frameListenerId = null;
  }

  _checkPlatformSupport() {
    if (typeof uni.createLivePusherContext !== 'function') {
      throw new Error('[LivePusher] 仅支持 APP-PLUS 平台');
    }
    return true;
  }

  init(pusherComponentId, options = {}, pageContext = null) {
    return new Promise((resolve, reject) => {
      try {
        this._checkPlatformSupport();
        
        this.pusherContext = uni.createLivePusherContext(pusherComponentId, pageContext);
        
        if (!this.pusherContext) {
          reject(new Error('[LivePusher] 创建推流上下文失败'));
          return;
        }

        const defaultOptions = {
          mode: 'FHD',
          autoFocus: true,
          beauty: 0,
          whiteness: 0,
          aspect: '9:16',
          minBitrate: 200,
          maxBitrate: 1000,
          gop: 5,
          ...options
        };

        this.pusherContext.startPreview({
          success: () => {
            this.isInitialized = true;
            console.log('[LivePusher] 预览启动成功');
            resolve(true);
          },
          fail: (err) => {
            console.error('[LivePusher] 预览启动失败:', err);
            reject(err);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  switchCamera(position = 'front') {
    return new Promise((resolve, reject) => {
      if (!this.pusherContext || !this.isInitialized) {
        reject(new Error('[LivePusher] 未初始化'));
        return;
      }

      try {
        this._checkPlatformSupport();

        this.pusherContext.switchCamera({
          success: () => {
            console.log('[LivePusher] 摄像头切换成功');
            resolve(true);
          },
          fail: (err) => {
            console.error('[LivePusher] 摄像头切换失败:', err);
            reject(err);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  takeSnapshot() {
    return new Promise((resolve, reject) => {
      if (!this.pusherContext || !this.isInitialized) {
        reject(new Error('[LivePusher] 未初始化'));
        return;
      }

      try {
        this._checkPlatformSupport();

        this.pusherContext.snapshot({
          success: (res) => {
            const tempImagePath = res.tempImagePath;
            console.log('[LivePusher] 快照成功:', tempImagePath);
            resolve(tempImagePath);
          },
          fail: (err) => {
            console.error('[LivePusher] 快照失败:', err);
            reject(err);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  destroy() {
    this.offCameraFrame();

    if (this.pusherContext && this.isInitialized) {
      try {
        this.pusherContext.stopPreview();
        console.log('[LivePusher] 预览已停止');
      } catch (e) {
        console.warn('[LivePusher] 停止预览异常:', e);
      }
    }

    this.pusherContext = null;
    this.isInitialized = false;
    console.log('[LivePusher] 实例已销毁');
  }

  getState() {
    return {
      isInitialized: this.isInitialized,
      hasFrameListener: !!this.frameListenerId,
      hasCallback: !!this.onFrameCallback
    };
  }
}

export default LivePusherManager;