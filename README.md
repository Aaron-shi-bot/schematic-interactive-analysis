# 原理图交互分析

让 AI 保留完整原理图，标出功能模块，并生成可操作的电路分析页面。

技能名：`schematic-interactive-analysis` · 当前版本：`2026-10-21.1`

## 功能

- 在完整原图上用虚线框标识模块，保留原布局和跨模块连线。
- 点击模块查看用途、用法、参数和计算结果；详情正文独立滚动，顶部探针读数保持可见。
- 支持拖动、滚轮与按钮缩放、适应整图，以及宿主允许时的全屏。
- 模块标题优先显示完整名称，放在电路区域外，缩放时保持位置稳定。
- 用小红点选择节点，按电气网络去重；接地只作为电压参考，不设置节点探针。
- 由当前电路模型提供参数调整、支路电流、校准和目标反求；未知量明确标注。

画布模板已固定在技能内。后续分析复用同一套布局与交互，只替换原图数据、模块划分和经过验证的计算模型。

## 安装与调用

下载 [技能包](dist/schematic-interactive-analysis.skill)，按 ZIP 文件解压，将其中的 `schematic-interactive-analysis` 文件夹放入 Codex 的技能目录，通常为 `~/.codex/skills/`。

也可以直接克隆：

```sh
git clone https://github.com/Aaron-shi-bot/schematic-interactive-analysis.git ~/.codex/skills/schematic-interactive-analysis
```

如果该目录已有旧版，先备份再更新。若使用自定义技能目录，以本机 Codex 配置为准。

提供原理图后，可以这样调用：

> 使用 $schematic-interactive-analysis 分析这份原理图，保留整图并用虚线标出功能模块，点击模块查看参数、红色探针和计算结果，标明缺少的模型。

## 运行自带示例

需要 Python 3，以及支持交互页面的现代浏览器。生成器和 DC 检查器使用 Python 标准库；在 Codex 中展示或导出页面时，还需要当前环境可用的 `visualize` 技能及其渲染器。

以下命令从仓库根目录运行，生成用于内联展示的页面片段：

```sh
python scripts/build_canvas.py --data assets/canvas/example-data.json --model assets/canvas/example-model.js --destination build/example.fragment.html
```

要生成可以在浏览器直接打开的独立页面，增加独立页面路径和当前 `visualize` 技能目录：

```sh
python scripts/build_canvas.py --data assets/canvas/example-data.json --model assets/canvas/example-model.js --destination build/example.fragment.html --standalone build/example.html --visualize-skill "<当前 visualize 技能目录>"
```

将占位路径替换为本机实际目录，然后打开 `build/example.html`。示例是原创的两电阻分压电路，可调整输入电压、电阻和输出目标。

检查已计算出的 DC 网络是否满足 KCL、元件方程和功率平衡：

```sh
python scripts/check_dc.py assets/dc-divider.example.json
```

输入与模型接口见 [画布模板说明](references/canvas-template.md)，数值检查的输入格式见 [建模和验证](references/modeling-and-validation.md)。

## 分析范围

本项目提供 AI 分析流程、画布模板、生成工具和数值一致性检查器。每份电路都需要核对拓扑、元件参数和模型，并区分解析计算、实际仿真和定性说明。

它不是自动读取任意 EDA 工程的通用解析器，也不自带通用 SPICE 求解器。DC 检查通过只能说明输入数值满足所检查的方程，不能证明原图识别或器件模型正确。

仓库包含技能源码、可迁移技能包和原创示例。技能入口为 [SKILL.md](SKILL.md)，版本与文件校验信息见 [release-manifest.json](release-manifest.json)。
