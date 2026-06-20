# 万能拍 · 地铁模式（转辙机遗留物 FOD 检测）

轨交信号工合上转辙机盖板前，拍摄内部照片，后端 AI 检测是否遗留扳手、导线等工器具。

## 定性：安全辅助闸门，不是目标检测玩具
开集问题（遗留物可能是任何东西）+ 错误代价极度不对称（漏报=卡阻=可能脱轨）。三条不可妥协原则：
1. **Fail-safe**：网络断/模型挂/图糊/置信低 → 一律「需人工复核」，绝不静默放行。
2. **宁可误报，不可漏报**：阈值偏召回，开集兜底；唯一红线指标是漏报率。
3. **全链路可追溯**：每次检测 = 一条不可篡改证据（人/时/设备/原图/结论）。

## 三路并联检测（任一路命中即拦截）
- **路A 闭集 YOLO**（`metro/detector.py: detect_known_tools`）：高精度命中已知工器具。权重可插拔，环境变量 `METRO_YOLO_MODEL` 指定；未训练专用权重时优雅返回空，由路B 兜底。
- **路B 基准差分**（`baseline_diff`）⭐ 灵魂：与该型号「标准空腔基准图」做 ORB+RANSAC 配准 → CLAHE 光照归一 → 差分 → 形态学 → 连通域。**天然开集**，能抓 YOLO 没见过的东西。
- **路C 异常兜底**：二期（PatchCore 等），当前未启用。

## 融合决策（`fuse_decision`）
```
质量不达标                         → RETAKE（重拍）
任一路命中且达拦截阈值             → BLOCKED（红，禁止合盖）
任一路灰区命中                     → REVIEW（黄，人工复核）
无基准 / 配准失败（路B 未生效）    → REVIEW（fail-safe，不敢判 PASS）
三路无命中 且 质量达标 且 基准对齐 → PASS（绿，可合盖）
```

## 型号库（25 型号聚为 4 族，`METRO_MODELS`）
ZD6(7) / ZD9(4) / ZDJ9(3) / 其它(11)。路A 与型号无关（扳手就是扳手，全型号共用一套权重）；型号仅用于路B 选基准图。
**冷启动降级**：某型号缺基准图时路B 自动跳过，结果强制 REVIEW，绝不因「没基准=没差分」误判 PASS。

## 接口
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/metro/models` | 型号族映射（前端选择器） |
| GET | `/metro/device/<code>` | 扫码拉设备 + 基准就绪状态 |
| POST | `/metro/devices/register` | 登记/更新设备，可上传基准图(`baseline`) |
| POST | `/metro/detect` | 核心检测（`file`+`device_code`+`worker_id`+`captured_at`+`offline_flag`） |
| POST | `/metro/inspection/<trace_id>/confirm` | 人工复核回写 |
| GET | `/metro/inspections` | 审计查询（device_code/worker_id/result 过滤） |
| GET | `/metro-file/<filename>` | 证据图/标注图 |

## 数据表
- `metro_device`：设备登记，`baseline_version=0` 表示基准未就绪。
- `metro_inspection`：检测证据链，写后不可改，仅 `confirm_*` 允许复核补写；预留 `work_order_id`（二期工单对接）。

## 弱网策略（开发期：在线优先 + 离线备用）
推理放云端。前端 `metro/index.vue` 网络失败时把照片入本地队列 `metro_offline_queue`，显示「待补传」且**不显示通过**；回到有信号处经 `/metro/detect?offline_flag=1` 批量补传。

## 部署 / 运行
```bash
# 建表
python migrate_metro_tables.py
# 训练好工器具权重后指定（可选；缺省 yolov8n.pt 仅作占位，检不出专业工具）
set METRO_YOLO_MODEL=path/to/metro_tools.pt   # Windows
python app.py
```
前端：`pages/metro/index.vue` 已注册进 `pages.json`，主页「🚇 地铁模式」入口进入。

## 现状与路线
- ✅ 已落地：质量闸门、路B 基准差分、融合决策、证据落库、设备登记/基准上传、审计查询、人工复核闭环、离线留证补传、前端全流程。
- 🔌 可插拔：路A YOLO（指向训练权重即生效）。
- ⏭ 二期：路C 异常兜底、端侧轻量推理、工单系统对接、Qwen-VL 对疑似区域语义复核。
