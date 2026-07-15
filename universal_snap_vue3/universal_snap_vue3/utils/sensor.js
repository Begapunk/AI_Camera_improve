/**
 * 双端通用的陀螺仪 / 加速度计封装。
 *
 * uni.onAccelerometerChange / uni.onGyroscopeChange 在小程序和 App-Plus 下是同一套 API，
 * 不需要 #ifdef；项目里 camera/index.vue 的水平仪功能已经在用同款加速度计 API 做过
 * 低通滤波 + 万向节死锁防抖，这里只封装最基础的启停 + 监听，不重复那套业务相关的滤波逻辑——
 * 具体页面按需自己做平滑/去噪（水平仪要的平滑策略和姿态引导要的不一定一样）。
 */

const DEFAULT_INTERVAL = 'game'; // 'game'(约20ms) | 'ui'(约60ms) | 'normal'(约200ms)

export class SensorManager {
  constructor() {
    this._accelCallback = null;
    this._gyroCallback = null;
    this._accelStarted = false;
    this._gyroStarted = false;
  }

  /** @param {(res: {x:number,y:number,z:number}) => void} callback */
  startAccelerometer(callback, interval = DEFAULT_INTERVAL) {
    this._accelCallback = callback;
    return new Promise((resolve, reject) => {
      uni.startAccelerometer({
        interval,
        success: () => {
          this._accelStarted = true;
          uni.onAccelerometerChange((res) => {
            if (this._accelCallback) this._accelCallback(res);
          });
          resolve();
        },
        fail: (err) => reject(new Error(err.errMsg || '加速度计启动失败')),
      });
    });
  }

  stopAccelerometer() {
    if (!this._accelStarted) return Promise.resolve();
    this._accelStarted = false;
    return new Promise((resolve) => {
      uni.offAccelerometerChange(this._accelCallback);
      uni.stopAccelerometer({ complete: () => resolve() });
    });
  }

  /** @param {(res: {x:number,y:number,z:number}) => void} callback 单位 rad/s */
  startGyroscope(callback, interval = DEFAULT_INTERVAL) {
    this._gyroCallback = callback;
    return new Promise((resolve, reject) => {
      uni.startGyroscope({
        interval,
        success: () => {
          this._gyroStarted = true;
          uni.onGyroscopeChange((res) => {
            if (this._gyroCallback) this._gyroCallback(res);
          });
          resolve();
        },
        // 部分机型/基座版本没有陀螺仪硬件或不支持该 API，fail 时调用方应回退到纯加速度计方案
        fail: (err) => reject(new Error(err.errMsg || '陀螺仪启动失败或设备不支持')),
      });
    });
  }

  stopGyroscope() {
    if (!this._gyroStarted) return Promise.resolve();
    this._gyroStarted = false;
    return new Promise((resolve) => {
      uni.offGyroscopeChange(this._gyroCallback);
      uni.stopGyroscope({ complete: () => resolve() });
    });
  }

  /** 页面 onHide/onUnload 里调用，避免传感器占用后台电量 */
  stopAll() {
    return Promise.all([this.stopAccelerometer(), this.stopGyroscope()]);
  }
}

export default SensorManager;
