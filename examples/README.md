# 主题包与配色包示例

Tau Editor 使用 `schemaVersion: 2` 的 JSON 文件分享主题。

- [`themes/theme.example.json`](./themes/theme.example.json)：完整主题包，可同时定义浅色和深色背景、面板、文字、强调色及 Monaco 配置。
- [`palettes/palette.example.json`](./palettes/palette.example.json)：快速配色包，只定义文字、强调色和状态色，不允许覆盖 `bgApp`、`panelBase`。
- [`schemas/theme-v2.schema.json`](./schemas/theme-v2.schema.json)：完整主题包 JSON Schema。
- [`schemas/palette-v2.schema.json`](./schemas/palette-v2.schema.json)：快速配色包 JSON Schema。

字段说明：

| 字段 | 说明 |
| --- | --- |
| `schemaVersion` | 当前必须为 `2`。 |
| `type` | `theme` 或 `palette`。 |
| `id` | 小写字母、数字和连字符组成，最长 64 字符。 |
| `modes.light` / `modes.dark` | 至少提供一个模式；建议同时提供两个模式。 |
| `colors` | 6 位十六进制颜色，例如 `#2563eb`。 |
| `monaco` | 仅完整主题包可选，用于编辑器基础主题与语法颜色。 |

普通用户可以复制示例，替换名称、作者、许可证和颜色后，在 Tau Editor 设置中导入。应用只解析静态 JSON，不执行主题包内的 JavaScript 或 CSS。
