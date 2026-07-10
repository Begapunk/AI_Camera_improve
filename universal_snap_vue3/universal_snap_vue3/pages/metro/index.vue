<template>
  <view class="metro">
    <view class="safe-top"></view>

    <!-- 离线待补传横幅 -->
    <view v-if="offlineQueue.length" class="offline-bar">
      <text>离线留证 {{ offlineQueue.length }} 条待补传</text>
      <view class="offline-btn" @tap="syncOffline" :class="{ disabled: syncing }">
        {{ syncing ? '补传中...' : '立即补传' }}
      </view>
    </view>

    <scroll-view class="body" scroll-y enhanced :show-scrollbar="false">

      <!-- ① 选择/扫码 转辙机（可选，不再是检测的前置条件） -->
      <view class="card">
        <view class="card-title">① 选择转辙机（可选）</view>
        <view class="row">
          <input class="ipt" v-model="deviceCode" placeholder="输入或扫码转辙机编号（可跳过）" />
          <view class="mini-btn" @tap="scanDevice">扫码</view>
          <view class="mini-btn ghost" @tap="loadDevice">查询</view>
        </view>

        <view v-if="deviceInfo" class="dev-info">
          <text class="dev-line">型号：{{ deviceInfo.model }}（{{ deviceInfo.family }} 族）</text>
          <text class="dev-line">站点：{{ deviceInfo.station || '—' }}</text>
          <text class="dev-line" :class="deviceInfo.baseline_ready ? 'ok' : 'warn'">
            基准图：{{ deviceInfo.baseline_ready ? '已就绪 v' + deviceInfo.baseline_version : '未就绪（将降级人工复核）' }}
          </text>
        </view>
        <view v-else-if="deviceQueried" class="dev-info">
          <text class="dev-line warn">该编号未登记。可在下方登记后再检测。</text>
          <view class="link" @tap="showRegister = !showRegister">{{ showRegister ? '收起登记' : '去登记设备 ▸' }}</view>
        </view>
        <view v-else class="dev-info">
          <text class="dev-line warn">不填编号也能直接检测，但无法比对基准图，结果会自动按"需人工复核"处理。</text>
        </view>

        <!-- 设备登记面板（冷启动采集基准图） -->
        <view v-if="showRegister" class="register">
          <picker mode="selector" :range="modelList" @change="onModelPick">
            <view class="ipt picker">{{ regModel || '选择型号' }}</view>
          </picker>
          <input class="ipt" v-model="regStation" placeholder="站点/区间（可选）" />
          <view class="row">
            <view class="mini-btn" @tap="captureBaseline">采集基准图</view>
            <text class="hint" v-if="regBaselinePath">已选基准图 ✓</text>
          </view>
          <view class="primary-btn small" @tap="registerDevice">保存登记</view>
        </view>
      </view>

      <!-- ② 拍摄内部照片 -->
      <view class="card">
        <view class="card-title">② 拍摄转辙机内部</view>
        <view class="shot-area" @tap="capturePhoto">
          <image v-if="photoPath" :src="photoPath" mode="aspectFill" class="shot-img" />
          <view v-else class="shot-placeholder">
            <text class="shot-icon">📷</text>
            <text class="shot-tip">点击拍摄（请开启补光、正对内腔）</text>
          </view>
        </view>
        <view class="primary-btn" :class="{ disabled: !canDetect || detecting }" @tap="runDetect">
          {{ detecting ? '检测中...' : '开始检测' }}
        </view>
      </view>

      <!-- ③ 检测结果 -->
      <view v-if="result" class="card">
        <view class="card-title">③ 检测结果</view>
        <view class="result-banner" :class="resultClass">
          <text class="result-tag">{{ resultLabel }}</text>
          <text class="result-msg">{{ result.message }}</text>
        </view>

        <image v-if="result.annotated_url" :src="result.annotated_url" mode="widthFix" class="annotated" />

        <view class="meta-line">质量评分：{{ (result.quality_score * 100).toFixed(0) }} 分 ·
          基准版本：{{ result.baseline_version ? 'v' + result.baseline_version : '无' }}</view>

        <view v-if="result.detections && result.detections.length" class="det-list">
          <view v-for="(d, i) in result.detections" :key="i" class="det-item">
            <text class="det-src" :class="d.source">{{ d.source === 'yolo' ? '工器具' : '差分' }}</text>
            <text class="det-label">{{ d.label }}</text>
            <text class="det-conf">{{ (d.conf * 100).toFixed(0) }}%</text>
          </view>
        </view>

        <!-- 人工复核闭环 -->
        <view v-if="needConfirm && !confirmed" class="confirm-box">
          <view class="confirm-title">人工复核（合盖前必须确认）</view>
          <view class="confirm-actions">
            <view class="confirm-btn safe" @tap="doConfirm('确认安全，无遗留物')">确认安全</view>
            <view class="confirm-btn fix" @tap="doConfirm('已取出工具，需重拍复检')">已取出工具</view>
          </view>
        </view>
        <view v-if="confirmed" class="confirmed-tip">✓ 复核已记录</view>
      </view>

      <view class="footer-tip">
        本系统为安全辅助闸门：绿灯方可合盖；黄/红灯须人工复核。漏报零容忍。
      </view>
    </scroll-view>
  </view>
</template>

<script>
import {
  metroModelsApi, metroGetDeviceApi, metroRegisterDeviceApi,
  metroDetectApi, metroConfirmApi
} from '@/utils/request.js'

const OFFLINE_KEY = 'metro_offline_queue'

export default {
  data() {
    return {
      worker: '',
      deviceCode: '',
      deviceInfo: null,
      deviceQueried: false,
      // 登记
      showRegister: false,
      families: {},
      modelList: [],
      regModel: '',
      regStation: '',
      regBaselinePath: '',
      // 拍摄/检测
      photoPath: '',
      detecting: false,
      result: null,
      confirmed: false,
      // 离线
      offlineQueue: [],
      syncing: false
    }
  },
  computed: {
    // 设备编号不再是检测的硬性前置条件——允许未登记/未扫码时也能直接检测，
    // 代价由后端 fuse_decision 兜底：无 device_code → 基准差分(路B)不启用 →
    // 结果自动降级为"需人工复核"，不会静默放行，符合宁可误报不可漏报的安全前提。
    canDetect() {
      return !!this.photoPath
    },
    resultClass() {
      return ({ PASS: 'green', REVIEW: 'yellow', BLOCKED: 'red', RETAKE: 'gray' })[this.result.result] || 'gray'
    },
    resultLabel() {
      return ({ PASS: '✓ 通过 可合盖', REVIEW: '⚠ 需人工复核', BLOCKED: '✕ 禁止合盖', RETAKE: '↻ 请重拍' })[this.result.result] || this.result.result
    },
    needConfirm() {
      return this.result && (this.result.result === 'REVIEW' || this.result.result === 'BLOCKED')
    }
  },
  onLoad() {
    this.worker = uni.getStorageSync('username') || ''
    this.offlineQueue = uni.getStorageSync(OFFLINE_KEY) || []
    this.loadModels()
  },
  methods: {
    async loadModels() {
      try {
        const res = await metroModelsApi()
        this.families = (res.data && res.data.families) || {}
        this.modelList = Object.values(this.families).reduce((a, b) => a.concat(b), [])
      } catch (e) { /* 忽略, 不阻塞主流程 */ }
    },
    scanDevice() {
      uni.scanCode({
        success: (r) => { this.deviceCode = r.result; this.loadDevice() },
        fail: () => uni.showToast({ title: '扫码取消', icon: 'none' })
      })
    },
    async loadDevice() {
      if (!this.deviceCode) return uni.showToast({ title: '请输入编号', icon: 'none' })
      this.deviceQueried = true
      try {
        const res = await metroGetDeviceApi(this.deviceCode)
        if (res.statusCode === 200 && res.data.exists) {
          this.deviceInfo = res.data.device
          this.showRegister = false
        } else {
          this.deviceInfo = null
        }
      } catch (e) {
        this.deviceInfo = null
        uni.showToast({ title: '查询失败', icon: 'none' })
      }
    },
    onModelPick(e) { this.regModel = this.modelList[e.detail.value] },
    captureBaseline() {
      uni.chooseImage({
        count: 1, sourceType: ['camera'],
        success: (r) => { this.regBaselinePath = r.tempFilePaths[0] }
      })
    },
    async registerDevice() {
      if (!this.deviceCode || !this.regModel) return uni.showToast({ title: '编号与型号必填', icon: 'none' })
      if (!this.regBaselinePath) return uni.showToast({ title: '请采集基准图', icon: 'none' })
      uni.showLoading({ title: '登记中...', mask: true })
      try {
        await metroRegisterDeviceApi(this.regBaselinePath, {
          device_code: this.deviceCode, model: this.regModel, station: this.regStation
        })
        uni.hideLoading()
        uni.showToast({ title: '登记成功', icon: 'success' })
        this.showRegister = false
        this.loadDevice()
      } catch (e) {
        uni.hideLoading()
        uni.showToast({ title: '登记失败', icon: 'none' })
      }
    },
    capturePhoto() {
      uni.chooseImage({
        count: 1, sourceType: ['camera'],
        success: (r) => { this.photoPath = r.tempFilePaths[0]; this.result = null; this.confirmed = false }
      })
    },
    async runDetect() {
      if (!this.canDetect || this.detecting) return
      this.detecting = true
      this.result = null
      this.confirmed = false
      uni.showLoading({ title: '检测中...', mask: true })
      const formData = {
        device_code: this.deviceCode,
        worker_id: this.worker,
        captured_at: new Date().toISOString()
      }
      try {
        const data = await metroDetectApi(this.photoPath, formData)
        this.result = data
      } catch (e) {
        // 网络失败 → 离线留证入队（fail-safe：不显示通过）
        this.enqueueOffline(formData)
        uni.showModal({
          title: '网络不可用',
          content: '已离线留证，回到有信号处可补传。请勿据此判定安全。',
          showCancel: false
        })
      } finally {
        this.detecting = false
        uni.hideLoading()
      }
    },
    enqueueOffline(formData) {
      this.offlineQueue.push({ photoPath: this.photoPath, formData })
      uni.setStorageSync(OFFLINE_KEY, this.offlineQueue)
    },
    async syncOffline() {
      if (this.syncing || !this.offlineQueue.length) return
      this.syncing = true
      const remain = []
      for (const item of this.offlineQueue) {
        try {
          await metroDetectApi(item.photoPath, { ...item.formData, offline_flag: '1' })
        } catch (e) {
          remain.push(item)
        }
      }
      this.offlineQueue = remain
      uni.setStorageSync(OFFLINE_KEY, remain)
      this.syncing = false
      uni.showToast({ title: remain.length ? '部分补传失败' : '补传完成', icon: 'none' })
    },
    async doConfirm(action) {
      if (!this.result || !this.result.trace_id) return
      try {
        await metroConfirmApi(this.result.trace_id, { confirmed_by: this.worker, confirm_action: action })
        this.confirmed = true
        uni.showToast({ title: '已记录', icon: 'success' })
      } catch (e) {
        uni.showToast({ title: '记录失败', icon: 'none' })
      }
    }
  }
}
</script>

<style scoped>
.metro { min-height: 100vh; background: #f4f6f8; display: flex; flex-direction: column; }
.safe-top { height: env(safe-area-inset-top, 0); }
.body { flex: 1; padding: 20rpx 24rpx calc(40rpx + env(safe-area-inset-bottom, 0)); }

.offline-bar { display: flex; justify-content: space-between; align-items: center;
  background: #fff3cd; color: #8a6d3b; padding: 16rpx 24rpx; font-size: 26rpx; }
.offline-btn { background: #ff9500; color: #fff; padding: 8rpx 24rpx; border-radius: 30rpx; }
.offline-btn.disabled { opacity: 0.5; }

.card { background: #fff; border-radius: 20rpx; padding: 28rpx; margin-bottom: 24rpx;
  box-shadow: 0 6rpx 20rpx -10rpx rgba(0,0,0,0.1); }
.card-title { font-size: 30rpx; font-weight: 700; color: #2d3e50; margin-bottom: 20rpx; }

.row { display: flex; align-items: center; gap: 16rpx; }
.ipt { flex: 1; background: #f4f6f8; border-radius: 12rpx; padding: 18rpx 20rpx;
  font-size: 28rpx; color: #2d3e50; }
.ipt.picker { color: #2d3e50; }
.mini-btn { background: #2e7d32; color: #fff; padding: 18rpx 24rpx; border-radius: 12rpx;
  font-size: 26rpx; white-space: nowrap; }
.mini-btn.ghost { background: #e8f5e9; color: #2e7d32; }

.dev-info { margin-top: 20rpx; display: flex; flex-direction: column; gap: 8rpx; }
.dev-line { font-size: 26rpx; color: #5b6e8c; }
.dev-line.ok { color: #2e7d32; }
.dev-line.warn { color: #d9822b; }
.link { color: #2e7d32; font-size: 26rpx; margin-top: 8rpx; }

.register { margin-top: 20rpx; display: flex; flex-direction: column; gap: 16rpx;
  padding-top: 20rpx; border-top: 1px dashed #e0e0e0; }
.hint { font-size: 24rpx; color: #2e7d32; }

.shot-area { width: 100%; height: 360rpx; background: #f0f2f5; border-radius: 16rpx;
  overflow: hidden; display: flex; align-items: center; justify-content: center; }
.shot-img { width: 100%; height: 100%; }
.shot-placeholder { display: flex; flex-direction: column; align-items: center; }
.shot-icon { font-size: 64rpx; }
.shot-tip { font-size: 24rpx; color: #9ca8b8; margin-top: 12rpx; }

.primary-btn { margin-top: 20rpx; background: #2e7d32; color: #fff; text-align: center;
  padding: 22rpx; border-radius: 14rpx; font-size: 30rpx; font-weight: 600; }
.primary-btn.small { padding: 18rpx; font-size: 28rpx; }
.primary-btn.disabled { opacity: 0.45; }

.result-banner { border-radius: 14rpx; padding: 24rpx; display: flex; flex-direction: column; gap: 10rpx; }
.result-banner.green { background: #e8f5e9; }
.result-banner.yellow { background: #fff8e1; }
.result-banner.red { background: #ffebee; }
.result-banner.gray { background: #eceff1; }
.result-tag { font-size: 34rpx; font-weight: 800; }
.green .result-tag { color: #2e7d32; }
.yellow .result-tag { color: #d9822b; }
.red .result-tag { color: #c62828; }
.gray .result-tag { color: #607d8b; }
.result-msg { font-size: 26rpx; color: #5b6e8c; line-height: 1.5; }

.annotated { width: 100%; border-radius: 12rpx; margin-top: 20rpx; }
.meta-line { font-size: 24rpx; color: #9ca8b8; margin-top: 16rpx; }

.det-list { margin-top: 16rpx; display: flex; flex-direction: column; gap: 12rpx; }
.det-item { display: flex; align-items: center; gap: 16rpx; background: #f7f9fa;
  padding: 14rpx 18rpx; border-radius: 10rpx; }
.det-src { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 20rpx; color: #fff; }
.det-src.yolo { background: #c62828; }
.det-src.diff { background: #d9822b; }
.det-label { flex: 1; font-size: 26rpx; color: #2d3e50; }
.det-conf { font-size: 24rpx; color: #9ca8b8; }

.confirm-box { margin-top: 24rpx; padding-top: 20rpx; border-top: 1px solid #f0f0f0; }
.confirm-title { font-size: 26rpx; color: #5b6e8c; margin-bottom: 16rpx; }
.confirm-actions { display: flex; gap: 16rpx; }
.confirm-btn { flex: 1; text-align: center; padding: 18rpx; border-radius: 12rpx;
  font-size: 28rpx; font-weight: 600; }
.confirm-btn.safe { background: #e8f5e9; color: #2e7d32; }
.confirm-btn.fix { background: #fff3e0; color: #d9822b; }
.confirmed-tip { margin-top: 20rpx; text-align: center; color: #2e7d32; font-size: 26rpx; }

.footer-tip { font-size: 22rpx; color: #9ca8b8; text-align: center; line-height: 1.6;
  padding: 16rpx 20rpx; }
</style>
