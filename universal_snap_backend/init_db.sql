CREATE DATABASE IF NOT EXISTS snap_db DEFAULT CHARSET utf8mb4;
USE snap_db;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(50) NULL,
    avatar VARCHAR(255) NULL,
    face_registered TINYINT DEFAULT 0 COMMENT '是否已绑定人脸 0=否 1=是',
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS photo_analysis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255),
    advice TEXT,
    score FLOAT DEFAULT 0,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 地铁模式：转辙机设备登记 + 检测记录（FOD 遗留物检测）
-- =========================================================================

-- 转辙机设备：型号决定路B 取哪张基准图；baseline_version=0 表示基准未就绪
CREATE TABLE IF NOT EXISTS metro_device (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_code VARCHAR(64) NOT NULL UNIQUE COMMENT '转辙机编号(扫码)',
    family VARCHAR(32) NOT NULL COMMENT '型号族 ZD6/ZD9/ZDJ9/其它',
    model VARCHAR(64) NOT NULL COMMENT '具体型号 如 ZD6-A',
    station VARCHAR(128) COMMENT '站点/区间',
    location VARCHAR(255) COMMENT '位置描述',
    baseline_image VARCHAR(255) COMMENT '标准空腔基准图(uploads 文件名)',
    baseline_version INT DEFAULT 0 COMMENT '基准图版本, 0=未就绪',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) DEFAULT CHARSET=utf8mb4;

-- 检测记录：写后视为不可篡改证据；仅 confirm_* 允许人工复核补写
CREATE TABLE IF NOT EXISTS metro_inspection (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trace_id VARCHAR(40) NOT NULL UNIQUE COMMENT '唯一检测号',
    worker_id VARCHAR(64) COMMENT '信号工',
    device_code VARCHAR(64) COMMENT '转辙机编号',
    device_model VARCHAR(64) COMMENT '型号',
    station VARCHAR(128),
    image_file VARCHAR(255) COMMENT '原图(证据)',
    annotated_file VARCHAR(255) COMMENT '标注图',
    result VARCHAR(16) NOT NULL COMMENT 'PASS/REVIEW/BLOCKED/RETAKE',
    quality_score FLOAT,
    detections_json MEDIUMTEXT COMMENT '三路命中明细',
    baseline_version INT DEFAULT 0,
    offline_flag TINYINT DEFAULT 0 COMMENT '是否离线留证补传',
    work_order_id VARCHAR(64) COMMENT '预留: 二期工单对接',
    confirmed_by VARCHAR(64) COMMENT '复核人',
    confirm_action VARCHAR(255) COMMENT '处置: 确认安全/已取出工具',
    confirmed_at TIMESTAMP NULL,
    captured_at VARCHAR(40) COMMENT '拍摄时间(区分离线延迟)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device (device_code),
    INDEX idx_worker (worker_id),
    INDEX idx_result (result)
) DEFAULT CHARSET=utf8mb4;

