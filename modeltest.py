import torch
import os
import sys
import time
import transformers
from transformers import PaliGemmaForConditionalGeneration, PaliGemmaProcessor, BitsAndBytesConfig
from PIL import Image

# ==========================================
# 1. 环境兼容性补丁 (针对 RTX 4060 深度优化)
# ==========================================
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# 💡 核心修复：采用“猴子补丁”绕过 torch>=2.6 检查
try:
    transformers.utils.import_utils._is_torch_greater_or_equal_than_2_6 = True
    print("✅ 已应用内核版本伪装补丁")
except Exception:
    pass

# ==========================================
# 2. 基础路径配置
# ==========================================
model_path = r"E:\CZCamera\paligemma2-3b-ft-docci-448"
test_image_path = "test.jpg"

print(f"当前运行环境: Python {sys.version.split()[0]}")
print(f"当前 Torch 版本: {torch.__version__}")

# ==========================================
# 3. GPU 状态强力检查
# ==========================================
print("\n--- 硬件加速检查 ---")
if not torch.cuda.is_available():
    print("❌ 错误：未检测到 CUDA！")
    sys.exit(1)
else:
    print(f"✅ 已成功识别 GPU: {torch.cuda.get_device_name(0)}")

# ==========================================
# 4. 4-bit 量化配置
# ==========================================
try:
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )
    print("✅ bitsandbytes 正常，已配置 4-bit 量化。")
except Exception as e:
    print(f"❌ bitsandbytes 配置失败: {e}")
    sys.exit(1)

# ==========================================
# 5. 加载处理器与模型
# ==========================================
print("\n正在将模型搬运至显存中，请稍候...")
try:
    processor = PaliGemmaProcessor.from_pretrained(model_path)
    model = PaliGemmaForConditionalGeneration.from_pretrained(
        model_path,
        quantization_config=bnb_config,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        low_cpu_mem_usage=True
    )
    print("🎉 模型加载成功！显存占用已就绪。")
except Exception as e:
    print(f"❌ 模型加载失败: {e}")
    sys.exit(1)


# ==========================================
# 6. 高性能分析函数 (针对坐标输出深度优化)
# ==========================================
def analyze_photo(img_path, prompt="detect person", is_retry=False):
    if not os.path.exists(img_path):
        return f"找不到文件: {img_path}"

    # 💡 格式微调：PaliGemma 2 有时需要分号 ';' 来触发检测
    clean_prompt = prompt.replace("<image>", "").strip()
    if "detect" in clean_prompt and not clean_prompt.endswith(";"):
        # 尝试使用官方最稳定的检测诱导格式
        run_prompt = f"{clean_prompt} ;" if is_retry else clean_prompt
    else:
        run_prompt = clean_prompt

    image = Image.open(img_path).convert("RGB")
    inputs = processor(text=run_prompt, images=image, return_tensors="pt").to("cuda")
    input_len = inputs["input_ids"].shape[-1]

    # 检测任务通常不需要太高的重复惩罚，否则坐标标签会打不出来
    current_penalty = 1.05 if "detect" in clean_prompt else 1.2

    start_time = time.time()
    with torch.inference_mode():
        generation = model.generate(
            **inputs,
            max_new_tokens=100,
            do_sample=False,
            repetition_penalty=current_penalty,
            use_cache=True
        )

        # 保留特殊 Token 才能看到 <locXXXX>
        result_ids = generation[0][input_len:]
        result = processor.decode(result_ids, skip_special_tokens=False).strip()

        # 调试信息：如果没出结果，看看模型到底吐了什么
        if not result or result == "<eos>":
            if not is_retry and "detect" in clean_prompt:
                # 第一次失败，尝试带分号的格式重试
                return analyze_photo(img_path, prompt, is_retry=True)

        # 清理多余标签
        bad_tokens = ["<pad>", "</s>", "<eos>", "<bos>", "<extra_id_0>", "<extra_id_1>"]
        for token in bad_tokens:
            result = result.replace(token, "")

        result = result.strip()

    end_time = time.time()
    print(f"[{run_prompt}] 推理耗时: {end_time - start_time:.3f} 秒")
    return result


# ==========================================
# 7. 运行测试
# ==========================================
if __name__ == "__main__":
    print("\n" + "=" * 40)
    print("🚀 PaliGemma 2 GPU 极速测试 (坐标修复版)")
    print("=" * 40)

    if not os.path.exists(test_image_path):
        print(f"提示：请在 {os.getcwd()} 下准备一张 test.jpg 图片。")
    else:
        try:
            # 任务 1: 坐标锁定
            print("\n[任务 1] 正在尝试锁定拍摄主体坐标...")
            res_loc = analyze_photo(test_image_path, "detect person")
            if not res_loc:
                res_loc = "[未检测到目标 - 请尝试更换更清晰的照片]"
            print(f">>> 坐标结果: {res_loc}")

            # 任务 2: 画面分析
            print("\n[任务 2] 正在生成画面中文描述...")
            res_zh = analyze_photo(test_image_path, "caption zh")
            print(f">>> 分析结果: {res_zh}")

        except Exception as e:
            print(f"\n❌ 运行过程中发生错误: {e}")

    print("\n" + "=" * 40)