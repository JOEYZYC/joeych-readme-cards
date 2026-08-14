# JOEYZYC Terminal Cards

A locally maintained terminal-style GitHub Profile SVG card service for JOEYZYC. Desktop cards use 900-unit SVG artboards; mobile cards use dedicated 360-unit compositions selected by the root Profile README at `max-width: 600px`. Both layouts support light and dark themes and use only repository-generated snapshots, never a third-party deployment domain.

## Design and Content Boundaries

- [DESIGN.md](DESIGN.md) is the sole visual contract for color, typography, spacing, components, motion, accessibility, and accepted design debt.
- Profile content uses only verified facts: JOEYCH, JOEYZYC, SuZhou, embedded systems, and publicly listed technologies and projects.
- Statistics come only from the GitHub REST API for non-fork repositories owned by `JOEYZYC`; when the API is unavailable, the cards explicitly show `Unavailable` and never estimated or fabricated values.
- `GITHUB_TOKEN` is the only optional environment variable and can increase the GitHub API request limit. Never commit or output its value.

## Routes

After deployment to an environment compatible with Vercel Edge Functions, the card routes are:

| Route | Content |
|---|---|
| `/api/header?theme=dark` | Name, location, and terminal typing prompt |
| `/api/profile?theme=light` | English profile and non-fork GitHub REST statistics |
| `/api/skills?theme=dark` | Factual technical focus categories without proficiency percentages |
| `/api/footer?theme=light` | GitHub, personal website, and original project links |
| `/api/banner?theme=dark` | Entry point for terminal card service documentation |

Append `layout=mobile` to any route for its dedicated 360-unit mobile composition; without it, the route returns its 900-unit desktop composition. Omit `theme`, or use a value other than `light`, for the dark theme. In production, the `profile` route uses the current UTC year. The snapshot-only `preview=1` produces a deterministic unavailable-data state: it performs no network request, shows no repository, star, or language values, and explicitly identifies itself as a static preview.

## Local Preview and Tests

The project locks Node.js 24.19.0. Validate the tool lock according to workstation policy, then run declared scripts through `devrun`:

```powershell
pwsh -NoProfile -File D:/Dev/ProjectTools/verify.ps1 -Project . -Json
D:/Dev/Bin/devrun.cmd node-24 -- npm run preview
D:/Dev/Bin/devrun.cmd node-24 -- npm test
D:/Dev/Bin/devrun.cmd node-24 -- npm run preview:serve
```

`preview` generates these deterministic files in `preview/svgs/` and rebuilds `preview/index.html`:

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

Open `preview/index.html` in a browser, or run `preview:serve` and visit the local preview address, to inspect both themes for desktop and mobile. The generator calls handlers directly, and `profile` uses deterministic unavailable data, requiring neither network access nor a token. `test` uses Node's built-in test framework to check handlers, theme SVGs, geometry regressions, AA contrast, identity cleanup, static preview states, and 200/404 preview-server behavior.

## Profile README Assets

The GitHub Profile repository [JOEYZYC/JOEYZYC](https://github.com/JOEYZYC/JOEYZYC) references desktop `preview/svgs/*_{dark,light}.svg`, mobile `preview/svgs/*_mobile_{dark,light}.svg`, and `public/pixel_art_{dark,light}.gif` through `raw.githubusercontent.com/JOEYZYC/joeych-readme-cards/main/`. The two retained canonical GIFs continue to use their upstream source and are not claimed as original work in this derived project.

## Attribution and License

This project is an MIT-licensed derivative of [Hazy019/hazy-readme-cards](https://github.com/Hazy019/hazy-readme-cards), originally authored by Kyrell Santillan and adapted from revision `970dce929d32b3e2dbe1991faf9ef37f86885b9a`. The original [LICENSE](LICENSE) remains unchanged; see [NOTICE.md](NOTICE.md) for complete attribution and derivation details. JOEYZYC maintains only this derivative's profile content, generated snapshots, and documentation.
