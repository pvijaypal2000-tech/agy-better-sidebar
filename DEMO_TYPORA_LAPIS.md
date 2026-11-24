---
title: Typora Lapis 沉浸排版预览示例
style: Lapis 青金石 / 学术三线表支持
mode: 纯只读安全伴读
---

# 系统综述与科研项目路线图（Typora Lapis 效果示例）

> 提示：你可以点击右上角 **「卡片表 / 三线表」** 一键切换表格风格，点击 **「青金石」** 切换四套经典 Typora 主题，或按 `Ctrl+/` 随时对照源码。在正文中直接用鼠标划选任意文字，右下角就会浮出 **「✨ 大白话解读」** 气泡。

## 1. 阶段推进与分工宽表（防挤碎横向平滑展示）

| 阶段 | 核心任务内容 | 依赖前置与工具 | 协作分工模式 | 预计周期 | 里程碑交付物 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **E 去重与初筛** | 跨库检索结果合并去重、纳排标准校准、双盲试点初筛与全文获取 | EndNote / Rayyan / PRISMA 清单 | 子代理预筛 + 课题组双人复核 | 3–5 周 | PRISMA 筛选流向图与纳入题录表 |
| **F 数据提取与偏倚评估** | 标准化提取表设计、L1/L2/L3 结局指标判定、JBI / RoB 2 偏倚风险评价 | 提取模板 CSV / R 校验脚本 | 双人独立提取 + 交叉核对 | 3–4 周 | 清洗后主数据集 `clean_data.csv` |
| **G 统计合成与敏感性分析** | 效应量合并、异质性检验、亚组分析与森林图/漏斗图绘制 | R (`meta`, `metafor`, `ggplot2`) | 代码脚本自动化生成 + 统计复核 | 2–3 周 | 统计汇总表与高分辨率矢量图 |
| **H 论文撰写与注册更新** | 正文撰写、PRISMA-S 检索附录定稿、PROSPERO 状态同步更新 | Typora Lapis 排版 / 参考文献库 | 初稿撰写 + 导师与团队审阅 | 3–4 周 | 投稿定稿全文与补充材料 |

## 2. 统计模型与公式渲染（KaTeX 离线排版）

在随机效应模型（Random-Effects Model）下，第 $i$ 项研究的观测效应量 $\hat{\theta}_i$ 满足：

$$
\hat{\theta}_i = \theta + u_i + \epsilon_i, \quad u_i \sim \mathcal{N}(0, \tau^2), \quad \epsilon_i \sim \mathcal{N}(0, \sigma_i^2)
$$

其中异质性指标 $I^2 = \max\left(0, \frac{Q - (k - 1)}{Q}\right) \times 100\%$，当 $I^2 > 50\%$ 时进一步结合临床亚组探索异质性来源。

## 3. 执行流程可视化（Mermaid 离线图表）

```mermaid
flowchart LR
    A["多库检索导出"] --> B["自动去重与初筛"]
    B --> C["全文精筛与双提取"]
    C --> D["R 统计合并与三线表输出"]
    D --> E["论文定稿"]
```

## 4. 分析代码卡片示例

```r
library(meta)
# 计算二分类结局合并风险比 (Risk Ratio)
m_bin <- metabin(event.e, n.e, event.c, n.c,
                 studlab = study_id,
                 data = clean_data,
                 sm = "RR", method = "MH", random = TRUE)
summary(m_bin)
```
