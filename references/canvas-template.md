# 已确认画布模板

默认版本：`2026-10-21.1`。模板来自用户确认的整图模块页面，包含最后一次取消最外层边框的设计。用户没有明确要求改版时，复用 `assets/canvas/` 和 `scripts/build_canvas.py`，只更换电路数据与模型适配器。

## 固定的界面与交互

| 部位 | 默认行为 |
|---|---|
| 最外层 | 无大边框、无圆角、无阴影；独立页面留白 4 px，工作区 padding/gap 均为 6 px |
| 桌面布局 | 页面限定在浏览器可视高度内；标题与工具栏常驻；画布与右侧详情上下对齐 |
| 功能边界 | 画布和详情各有 1.5 px 边界、8 px 圆角；底部状态栏有分隔线、5 px 上下内边距 |
| 顶部工具栏 | 全屏、适应整图、缩小/百分比/放大、模块虚线框、节点/支路探针、完整模块选择；对齐排列 |
| 缩放与拖动 | 100% 为适应整图，最大 800%；按钮倍率 1.25；滚轮围绕指针缩放，拖动平移，适应整图复位 |
| 原图 | 保留完整原图、原坐标和跨模块连线；选择模块不裁图、不重排、不复位参数 |
| 虚线模块 | 中性线宽 1.8 px、选中 2.6 px，虚线 7/5；选中轻背景；点击区域或标题打开详情 |
| 模块标题 | 固定字号，全名优先，宽度不受模块限制；边框中点锚定，必要时短引线；按适应整图尺寸确定行位，平移和缩放不跳行或改名 |
| 标题避让 | 放在所有电路区域之外；可用三个固定行位，间隔 8 px，距边框至少 6 px。极窄视图确实放不下才显示编号或隐藏，模块下拉仍有完整名称 |
| 详情面板 | 标题与收起按钮固定；探针调试区固定在上方；说明、参数、结果正文单独滚动。探针端点多时仅端点区滚动 |
| 节点探针 | 每个非接地电气网络一个选项/代表测点；候选红色空心圆半径 3.3 px，选中实心圆半径 5 px、淡外环半径 8 px；命中半径 10 px。圆点大小不随图缩放 |
| 调试读数 | 位号/引脚、相对参考地电压、同网引脚；支路电流标方向及两端电压。GND 等接地网无节点红点/选项 |
| 参数和反求 | 滑块与数值框同步，电阻改值、校准和目标反求由当前模块提供，结果同源更新；模块切换保留输入 |
| 状态 | 区分解析/仿真/示意；未知显示待建模，越界撤下数值，输入无效标记旧结果；恢复保存状态后重算 |
| 窄屏/宿主 | 小于 900 px 时详情放到图下方；内联大画布高 820 px，可切换 600 px；独立页面填满视口。全屏检测许可，不支持时保留独立大视图 |

标题定位、坐标变换、命中测试和探针去重直接复用代码，不另写近似实现。不同电路的模块数量、名称、参数和求解结果随原图变化，不能照搬 Meanwell 的八个模块或其模型。

## 生成入口

从当前技能目录运行（路径使用本次实际位置，不依赖原项目目录）：

```powershell
python scripts/build_canvas.py --data <circuit-data.json> --model <circuit-model.js> --destination <inline-fragment.html>
```

需要独立页面时增加 `--standalone <module-viewer.html> --visualize-skill <当前 visualize 技能目录>`。生成器复用当前宿主主题与 sandbox，不改共享渲染器；导出封套负责限制 iframe 高度。内联文件按 visualize 协议交付，原图及数据保存在当前工程约定目录。

技能自带可直接运行的合成例子：`assets/canvas/example-data.json` 与 `assets/canvas/example-model.js`。两电阻分压器用于演示接口和测试，数值不是其他电路的默认事实。先根据真实原图准备数据，再由生成器构建，不把例子改几个标题冒充新原图。

## 数据接口

`circuit-data.json` 的顶层包含：

- `circuit`：跨迭代稳定的电路 ID，用于隔离持久状态。
- `viewer`：`title`、`basis`（原图/原坐标重绘等）、`method`；可选 `labels`（网络 ID 到短名称）、`controls`、`groundNets`（默认 `["GND"]`）、`referenceLabel`、`defaultProbe`。旧页面可设置 `stateSchema` 与 `compatibleSchemas`，新电路沿用默认状态版本。
- `topology.components`：`id`、`value`、`pins`；每个 pin 含 `pin`、`name`、`net`、原坐标 `body:[x,y]` 和 `end:[x,y]`。`topology.nets` 按电气连通性映射到 `元件.引脚` 数组；不要根据电压相同合并网络。
- `topology.wires`：`id`、`net` 和可选 `points:[[x,y],...]`。图像底图模式必须提供 points，便于同网高亮和导线点击。
- `modules.full_bounds` 和每个模块的 `bounds`：统一 `[左,下,右,上]`，Y 向上。先规范化一次所有图像、符号、端点和区域，运行时只做同一个缩放/平移变换。
- `modules.modules`：沿用 [模块字段](module-canvas.md#从整图建立模块)，另有 `number`、`resistors`、`default_probe`（`n:网络ID` 或 `c:元件ID`）、可选 `label_side:"bottom"`。
- 绘图二选一：`records` 是已核对的原坐标 Altium 图形记录（支持当前模板的 1/6/8/10/12/13/14/17/27/29/34/41 类型）；或 `drawing:{bounds,dataUri}`，dataUri 为本地 PNG/JPEG/WebP/SVG 的 base64 原图。PDF 先渲染。模型数据、端点和模块框必须与底图同坐标。图像上原有文字保留原样，当前改值在详情中显示。

`viewer.controls[key]` 使用 `{label,step,scale?,slider?:[min,max]}`；scale 只换显示单位，模型保持 SI。控件范围由模型 `ranges[key]` 提供。`module.resistors` 指向可编辑电阻的参数名（与元件位号一致）。没有模型的模块 controls/resistors 为空，保留说明与未知状态。

可选模块操作：

- `calibration:{action,label}`：一个直接校准按钮。
- `inverse:{action,targetKey,label,title?,targetLabel?}`：折叠反求区，目标字段引用已有 control/range。

## 模型适配器

由 AI 在当前工程编写可信的 `circuit-model.js`，定义 `window.SchematicModel`；不执行原图、附件或网表中携带的脚本。必要接口：

| 接口 | 返回/用途 |
|---|---|
| `defaults` / `ranges` | 默认数值及每个参数 `[min,max]`；只含本电路有依据或已标注的假设 |
| `normalize(raw={})` | 校验、恢复允许输入，拒绝非法值 |
| `compute(state)` | `{valid,warnings,displayNodes,...}`；有限电压为有效值，缺键为未知，null 为越界撤下。没有数值模型也返回明确的未知集合 |
| `status(result,state,fmt)`（可选） | 底部简短状态；默认 method，禁止假造正常结果 |
| `runAction(action,state)`（有操作时） | `{ok,patch?,message}`；成功 patch 经 normalize 后应用、重算，失败保留输入并说明原因 |
| `branchDetail(id,context)`（可选） | 本器件的电流/模型说明；context 含 state/result/pins/delta/fmt/ohm。缺失时显示待建模；普通已知电阻使用 1→2 的欧姆定律 |
| `valueLabel(component,state,ohm)`（可选） | 原坐标重绘模式下的可变元件值短标签 |
| `hitBounds(component)`（可选） | 对引脚不能覆盖的特殊符号补充 `[左,下,右,上]` 命中区域 |

校准/反求是电路逻辑，不写入画布源码。需要新增分析类型时添加电路适配器能力；不为了模板有按钮就填假模型。模板不是任意 EDA 格式解析器或 SPICE 求解器。

## 复用后的验收

按相关风险实际查看生成页面：无外层大框；桌面无文档滚动/溢出；详情正文滚动不带走工具栏与顶部读数；模块切换/收起正常；当前参数和数据保留；缩放至 800% 后标题固定、与原图同变换；适应整图可恢复；每个非接地网只显示一个节点；红点精确落在实际端点；未知/越界/无效输入状态可辨认。

独立核对默认工况、一个改值、反求回代和相关边界。模板 UI 的历史验证不替代新电路的电气验证。更新模板时同时重建当前页面和合成示例，校验本地资源引用、脚本运行及技能备份包；将验证证据保存在工程 work/outputs，不把用户原图或私有电路模型打包进技能。
