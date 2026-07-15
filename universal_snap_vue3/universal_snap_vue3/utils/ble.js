/**
 * 跨端低功耗蓝牙 (BLE) 通信模块。
 *
 * uni.* 的 BLE API（openBluetoothAdapter / createBLEConnection / writeBLECharacteristicValue...）
 * 本身就是小程序和 App-Plus 通用的一套接口，不需要 #ifdef 区分——这是好消息。
 * 但真正决定"能不能稳定连上 51 单片机这类自制硬件"的坑都在时序和 MTU 上：
 *
 *   1. iOS 的 CoreBluetooth 是异步队列模型，同一个设备上连续发起多个 BLE 操作
 *      （连接/发现服务/发现特征值/开 notify）必须等上一步真正回调完成才能发起下一步，
 *      并发调用会拿到 10000番段 的系统错误。这里内部用一条串行 Promise 链保证顺序。
 *   2. 不设置 MTU 的情况下，单次 write 的安全上限是 20 字节（ATT_MTU 默认 23，刨去 3 字节头部）。
 *      51 单片机这类低配硬件通常也就按 20 字节包处理，所以默认按 20 字节分包写，
 *      不依赖 uni.setBLEMTU——iOS 根本没有这个 API（会直接 fail），Android 有但也不强求。
 *
 * 用法：
 *   const ble = new BleManager()
 *   await ble.init()
 *   ble.onDeviceFound(list => {...})
 *   await ble.startDiscovery({ services: ['0000FFE0-0000-1000-8000-00805F9B34FB'] })
 *   await ble.connect(deviceId) // 自动发现 services/characteristics，找可写/可notify的特征值
 *   ble.onNotify(hexString => {...})
 *   await ble.write('AA0155')   // 十六进制字符串，内部转 ArrayBuffer 并按需分包
 *   await ble.destroy()
 */

const DEFAULT_WRITE_CHUNK_SIZE = 20;

// 常见 BLE 错误码 -> 人类可读文案（微信小程序与 App-Plus 共用同一套错误码表）
const ERROR_CODE_MAP = {
  10000: '蓝牙功能尚未初始化',
  10001: '当前蓝牙适配器不可用（请检查系统蓝牙开关/权限是否开启）',
  10002: '没有找到指定设备',
  10003: '连接设备失败',
  10004: '没有找到指定服务',
  10005: '没有找到指定特征值',
  10006: '当前连接已断开',
  10007: '当前特征值不支持此操作（write/notify 属性不匹配）',
  10008: '系统上报异常',
  10009: '系统版本过低，不支持此操作',
  10012: '连接超时',
  10013: '连接失败，禁止连接',
};

function friendlyError(err) {
  const code = err && err.errCode;
  const msg = (code && ERROR_CODE_MAP[code]) || (err && err.errMsg) || '蓝牙操作失败';
  const e = new Error(msg);
  e.errCode = code;
  e.raw = err;
  return e;
}

function ab2hex(buffer) {
  return Array.prototype.map
    .call(new Uint8Array(buffer), (bit) => ('00' + bit.toString(16)).slice(-2))
    .join('');
}

function hex2ab(hex) {
  const matched = hex.match(/[\da-f]{2}/gi);
  if (!matched) return new ArrayBuffer(0);
  return new Uint8Array(matched.map((h) => parseInt(h, 16))).buffer;
}

export class BleManager {
  constructor() {
    this.deviceId = null;
    this.serviceId = null;
    this.writeCharacteristicId = null;
    this.notifyCharacteristicId = null;
    this.writeChunkSize = DEFAULT_WRITE_CHUNK_SIZE;

    this._deviceFoundCallback = null;
    this._notifyCallback = null;
    this._disconnectCallback = null;
    // 串行操作队列：每一步都排在上一步完成之后再执行，规避 iOS CoreBluetooth 并发报错
    this._opQueue = Promise.resolve();
  }

  _enqueue(fn) {
    this._opQueue = this._opQueue.then(fn, fn);
    return this._opQueue;
  }

  /** 打开蓝牙适配器，App 冷启动/页面进入时调用一次 */
  init() {
    return this._enqueue(
      () =>
        new Promise((resolve, reject) => {
          uni.openBluetoothAdapter({
            success: () => resolve(),
            fail: (err) => reject(friendlyError(err)),
          });
        })
    );
  }

  /** 查询蓝牙适配器当前状态（是否可用、是否正在搜索） */
  getAdapterState() {
    return new Promise((resolve, reject) => {
      uni.getBluetoothAdapterState({
        success: (res) => resolve(res),
        fail: (err) => reject(friendlyError(err)),
      });
    });
  }

  /**
   * 开始搜索设备。
   * @param {{ services?: string[], name?: string, timeoutMs?: number }} options
   *   services  按服务 UUID 过滤（推荐——硬件方案确定后 UUID 是固定的，过滤效率最高）
   *   name      按设备名精确/包含匹配过滤（配合 onDeviceFound 里自行判断，比如做前缀匹配）
   *   timeoutMs 不传则不自动停止，需要调用方自己在合适时机调用 stopDiscovery()
   */
  startDiscovery(options = {}) {
    const { services, timeoutMs } = options;
    return this._enqueue(
      () =>
        new Promise((resolve, reject) => {
          uni.startBluetoothDevicesDiscovery({
            services: services || [],
            allowDuplicatesKey: false,
            success: () => {
              uni.onBluetoothDeviceFound((res) => {
                const devices = options.name
                  ? res.devices.filter((d) => d.name && d.name.includes(options.name))
                  : res.devices;
                if (devices.length && this._deviceFoundCallback) {
                  this._deviceFoundCallback(devices);
                }
              });
              if (timeoutMs) {
                setTimeout(() => this.stopDiscovery(), timeoutMs);
              }
              resolve();
            },
            fail: (err) => reject(friendlyError(err)),
          });
        })
    );
  }

  /** 注册设备发现回调，每次发现新设备（或匹配到 name 过滤条件）时触发 */
  onDeviceFound(callback) {
    this._deviceFoundCallback = callback;
  }

  stopDiscovery() {
    return new Promise((resolve) => {
      uni.stopBluetoothDevicesDiscovery({
        complete: () => resolve(),
      });
    });
  }

  /**
   * 连接设备并自动发现 服务/特征值。
   * @param {string} deviceId
   * @param {{ serviceId?: string, writeCharacteristicId?: string, notifyCharacteristicId?: string }} [known]
   *   如果硬件文档已经明确给出 service/characteristic UUID，直接传入可跳过自动探测，
   *   连接速度更快也更不容易因为设备暴露了多个无关服务而误选。
   */
  connect(deviceId, known = {}) {
    this.deviceId = deviceId;

    return this._enqueue(async () => {
      await this._createConnection(deviceId);
      this._listenDisconnect(deviceId);

      if (known.serviceId && known.writeCharacteristicId) {
        this.serviceId = known.serviceId;
        this.writeCharacteristicId = known.writeCharacteristicId;
        this.notifyCharacteristicId = known.notifyCharacteristicId || known.writeCharacteristicId;
        return;
      }

      const services = await this._getServices(deviceId);
      // 优先选带 FFE0/FFF0 这类常见透传服务特征的，找不到就退而求其次选第一个非系统服务
      const service = services.find((s) => s.isPrimary) || services[0];
      if (!service) throw new Error('设备未暴露任何可用服务');
      this.serviceId = service.uuid;

      const characteristics = await this._getCharacteristics(deviceId, this.serviceId);
      const writeChar = characteristics.find((c) => c.properties && c.properties.write);
      const notifyChar = characteristics.find(
        (c) => c.properties && (c.properties.notify || c.properties.indicate)
      );
      if (!writeChar) throw new Error('未找到可写入的特征值，请显式传入 writeCharacteristicId');
      this.writeCharacteristicId = writeChar.uuid;
      this.notifyCharacteristicId = (notifyChar || writeChar).uuid;
    });
  }

  _createConnection(deviceId) {
    return new Promise((resolve, reject) => {
      uni.createBLEConnection({
        deviceId,
        success: () => resolve(),
        fail: (err) => reject(friendlyError(err)),
      });
    });
  }

  _getServices(deviceId) {
    return new Promise((resolve, reject) => {
      uni.getBLEDeviceServices({
        deviceId,
        success: (res) => resolve(res.services),
        fail: (err) => reject(friendlyError(err)),
      });
    });
  }

  _getCharacteristics(deviceId, serviceId) {
    return new Promise((resolve, reject) => {
      uni.getBLEDeviceCharacteristics({
        deviceId,
        serviceId,
        success: (res) => resolve(res.characteristics),
        fail: (err) => reject(friendlyError(err)),
      });
    });
  }

  _listenDisconnect(deviceId) {
    uni.onBLEConnectionStateChange((res) => {
      if (res.deviceId === deviceId && !res.connected && this._disconnectCallback) {
        this._disconnectCallback(res);
      }
    });
  }

  /** 断开时的回调（包括异常断连，比如硬件掉电） */
  onDisconnect(callback) {
    this._disconnectCallback = callback;
  }

  /**
   * 开启 notify 监听并注册回调。回调拿到的是十六进制字符串（已内部做 ArrayBuffer -> hex 转换）。
   */
  onNotify(callback) {
    this._notifyCallback = callback;
    return this._enqueue(
      () =>
        new Promise((resolve, reject) => {
          uni.notifyBLECharacteristicValueChange({
            deviceId: this.deviceId,
            serviceId: this.serviceId,
            characteristicId: this.notifyCharacteristicId,
            state: true,
            success: () => {
              uni.onBLECharacteristicValueChange((res) => {
                if (res.deviceId !== this.deviceId) return;
                const hex = ab2hex(res.value);
                if (this._notifyCallback) this._notifyCallback(hex, res.value);
              });
              resolve();
            },
            fail: (err) => reject(friendlyError(err)),
          });
        })
    );
  }

  /**
   * 写入数据，自动按 writeChunkSize 分包顺序发送（每包等上一包 success 回调后再发下一包）。
   * @param {string|ArrayBuffer} data 十六进制字符串（如 'AA0155'）或已经是 ArrayBuffer
   */
  write(data) {
    const buffer = typeof data === 'string' ? hex2ab(data) : data;
    const bytes = new Uint8Array(buffer);
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += this.writeChunkSize) {
      chunks.push(bytes.slice(offset, offset + this.writeChunkSize).buffer);
    }
    if (chunks.length === 0) chunks.push(buffer);

    return this._enqueue(async () => {
      for (const chunk of chunks) {
        await this._writeOnce(chunk);
      }
    });
  }

  _writeOnce(buffer) {
    return new Promise((resolve, reject) => {
      uni.writeBLECharacteristicValue({
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.writeCharacteristicId,
        value: buffer,
        success: () => resolve(),
        fail: (err) => reject(friendlyError(err)),
      });
    });
  }

  disconnect() {
    if (!this.deviceId) return Promise.resolve();
    return new Promise((resolve) => {
      uni.closeBLEConnection({
        deviceId: this.deviceId,
        complete: () => resolve(),
      });
    });
  }

  /** 断开连接 + 关闭蓝牙适配器，页面卸载时调用，避免占用系统蓝牙资源 */
  async destroy() {
    await this.disconnect();
    await new Promise((resolve) => uni.closeBluetoothAdapter({ complete: () => resolve() }));
    this.deviceId = null;
    this.serviceId = null;
    this.writeCharacteristicId = null;
    this.notifyCharacteristicId = null;
  }
}

export { ab2hex, hex2ab };
export default BleManager;
