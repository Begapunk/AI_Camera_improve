"""地铁模式（转辙机遗留物 FOD 检测）模块。

设计要点见 docs/metro-mode-design.md：
  - 安全闸门定性：fail-safe + 宁可误报不可漏报 + 全链路可追溯
  - 三路并联检测：路A 闭集 YOLO / 路B 基准差分 / 路C 异常兜底(二期)
  - 任一路命中即拦截；质量不达标 / 无基准 / 服务异常一律降级为人工复核
"""

from .detector import (
    METRO_MODELS,
    resolve_family,
    quality_gate,
    detect_known_tools,
    baseline_diff,
    fuse_decision,
    annotate_image,
    run_detection,
    RESULT_PASS,
    RESULT_REVIEW,
    RESULT_BLOCKED,
    RESULT_RETAKE,
)

__all__ = [
    "METRO_MODELS",
    "resolve_family",
    "quality_gate",
    "detect_known_tools",
    "baseline_diff",
    "fuse_decision",
    "annotate_image",
    "run_detection",
    "RESULT_PASS",
    "RESULT_REVIEW",
    "RESULT_BLOCKED",
    "RESULT_RETAKE",
]
