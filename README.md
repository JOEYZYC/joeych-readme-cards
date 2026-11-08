# Terminal Cards

用于 GitHub 个人主页的终端风格 SVG 卡片，支持深浅主题和桌面、移动端布局。

Terminal-style SVG cards for GitHub profiles, with light/dark themes and desktop/mobile layouts.

## 快速开始 / Quick start

需要 Node.js 24，npm 版本见 `package.json`。

Requires Node.js 24. Use the npm version declared in `package.json`.

```sh
npm ci
npm run preview
npm run preview:serve
```

打开 <http://localhost:4173> 预览。生成的 SVG 位于 `preview/svgs/`，可直接用于 README，无需单独部署服务。

Open <http://localhost:4173> to preview. Generated SVGs in `preview/svgs/` can be used directly in a README without a separate service deployment.

## 更新与测试 / Update and test

```sh
npm run refresh
npm test
```

`preview` 使用本地快照离线生成；`refresh` 从 GitHub API 更新统计并重新生成卡片。`GITHUB_TOKEN` 可选，可提高 API 请求限额，请勿提交其值。

`preview` generates cards offline from the local snapshot. `refresh` fetches GitHub statistics and regenerates the cards. An optional `GITHUB_TOKEN` raises the API rate limit; never commit its value.

GitHub Actions 每周三、周日自动更新，也可手动触发。设计说明见 [DESIGN.md](DESIGN.md)。

GitHub Actions refreshes the assets on Wednesdays and Sundays, with manual runs also available. See [DESIGN.md](DESIGN.md) for design notes.

## 许可与致谢 / License and credits

本项目基于 [hazy-readme-cards](https://github.com/Hazy019/hazy-readme-cards)，采用 MIT 许可证。许可及来源说明见 [LICENSE](LICENSE) 和 [NOTICE.md](NOTICE.md)。

Based on [hazy-readme-cards](https://github.com/Hazy019/hazy-readme-cards), under the MIT license. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) for licensing and attribution.
