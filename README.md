# JOEYZYC Terminal Cards

为 JOEYZYC 本地维护的终端风格 GitHub Profile SVG 卡片服务。桌面卡片采用 900-unit SVG 画板；移动端采用独立的 360-unit SVG 构图，并由根目录 Profile README 在 `max-width: 600px` 时选择。两种布局均支持浅色与深色主题，且只使用仓库内生成的快照，不会请求第三方部署域名。

## 设计与内容边界

- [DESIGN.md](DESIGN.md) 是颜色、字体、间距、组件、动效、无障碍与设计债务的唯一视觉契约。
- 个人内容只使用已验证信息：JOEYCH、JOEYZYC、SuZhou、嵌入式系统，以及公开列出的技术和项目。
- 统计仅通过 GitHub REST API 获取 `JOEYZYC` 名下的非 fork 仓库；API 不可用时卡片会明确显示“不可用”，不会展示估算或伪造数值。
- `GITHUB_TOKEN` 是可选的唯一环境变量，可用于提升 GitHub API 请求额度；不要提交或输出其值。

## 路由

部署到兼容 Vercel Edge Function 的环境后，卡片路由如下：

| 路由 | 内容 |
|---|---|
| `/api/header?theme=dark` | 名称、位置与终端 typing prompt |
| `/api/profile?theme=light` | 中文简介和非 fork GitHub REST 统计 |
| `/api/skills?theme=dark` | 事实性的技术关注类别，不含能力百分比 |
| `/api/footer?theme=light` | GitHub、个人网站与原创项目链接 |
| `/api/banner?theme=dark` | 本地卡片服务说明入口 |

为任一路由附加 `layout=mobile` 可获得独立的 360-unit 移动端构图；省略该参数时返回 900-unit 桌面构图。省略 `theme` 或设置为非 `light` 的值时使用深色主题。`profile` 路由在生产模式会使用当前 UTC 年。仅用于本地快照的 `preview=1` 会生成确定性的“数据未获取”状态：不请求网络、不展示仓库数、Star 或语言统计，并明确标记为静态快照。

## 本地预览与测试

工程锁定 Node.js 24.19.0。先根据工作站规则校验工具锁，再通过 `devrun` 运行声明的脚本：

```powershell
pwsh -NoProfile -File D:/Dev/ProjectTools/verify.ps1 -Project . -Json
D:/Dev/Bin/devrun.cmd node-24 -- npm run preview
D:/Dev/Bin/devrun.cmd node-24 -- npm test
D:/Dev/Bin/devrun.cmd node-24 -- npm run preview:serve
```

`preview` 会在 `preview/svgs/` 生成下列确定性文件，并重建 `preview/index.html`：

```text
banner_dark.svg          banner_light.svg
banner_mobile_dark.svg   banner_mobile_light.svg
footer_dark.svg          footer_light.svg
footer_mobile_dark.svg   footer_mobile_light.svg
header_dark.svg          header_light.svg
header_mobile_dark.svg   header_mobile_light.svg
profile_dark.svg         profile_light.svg
profile_mobile_dark.svg  profile_mobile_light.svg
skills_dark.svg          skills_light.svg
skills_mobile_dark.svg   skills_mobile_light.svg
```

在浏览器中打开 `preview/index.html`，或运行 `preview:serve` 后访问本地预览地址，即可分别检查桌面和移动端的两个主题。生成器直接调用处理函数，`profile` 使用确定性的未获取数据状态，不需要网络或 token。`test` 使用 Node 内置测试框架检查处理函数、主题 SVG、几何回归、AA 对比度、身份清理、静态快照状态和预览服务器的 200/404 行为。

## Profile README 资源

GitHub Profile 仓库 [JOEYZYC/JOEYZYC](https://github.com/JOEYZYC/JOEYZYC) 通过 `raw.githubusercontent.com/JOEYZYC/joeych-readme-cards/main/` 引用桌面 `preview/svgs/*_{dark,light}.svg`、移动端 `preview/svgs/*_mobile_{dark,light}.svg` 和 `public/pixel_art_{dark,light}.gif`。保留的两个 canonical GIF 沿用上游来源，不在此派生项目中声明为原创作品。

## 归属与许可证

本项目是 [Hazy019/hazy-readme-cards](https://github.com/Hazy019/hazy-readme-cards) 的 MIT 许可派生版本，原作者为 Kyrell Santillan，基于修订 `970dce929d32b3e2dbe1991faf9ef37f86885b9a` 适配。原始 [LICENSE](LICENSE) 保持不变；完整归属与派生说明见 [NOTICE.md](NOTICE.md)。JOEYZYC 仅维护本派生版本的个人内容、生成快照和说明文档。
