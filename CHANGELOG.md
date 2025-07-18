# Changelog


## v0.0.15

[compare changes](https://github.com/zojize/nuxt-discord/compare/v0.0.14...v0.0.15)

### 🚀 Enhancements

- **hmr:** Add alias resolution to rollup configuration ([b317687](https://github.com/zojize/nuxt-discord/commit/b317687))
- **reply:** Add button support ([2990716](https://github.com/zojize/nuxt-discord/commit/2990716))
- **playground:** Add counter command as button example ([17aa950](https://github.com/zojize/nuxt-discord/commit/17aa950))

### 🩹 Fixes

- Update slash-commands page to avoid import issues ([841ade4](https://github.com/zojize/nuxt-discord/commit/841ade4))

### 🏡 Chore

- Update dependencies ([ec560bb](https://github.com/zojize/nuxt-discord/commit/ec560bb))
- Update dependencies ([d6c8a22](https://github.com/zojize/nuxt-discord/commit/d6c8a22))
- Remove redundant comments ([04cd953](https://github.com/zojize/nuxt-discord/commit/04cd953))

### ✅ Tests

- Use expect.poll ([eaa6f49](https://github.com/zojize/nuxt-discord/commit/eaa6f49))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>

## v0.0.14

[compare changes](https://github.com/zojize/nuxt-discord/compare/v0.0.13...v0.0.14)

### 🚀 Enhancements

- Autocomplete ([51724db](https://github.com/zojize/nuxt-discord/commit/51724db))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>

## v0.0.13

[compare changes](https://github.com/zojize/nuxt-discord/compare/v0.0.12...v0.0.13)

### 🚀 Enhancements

- Support option choice inference from union of literals ([ab81d28](https://github.com/zojize/nuxt-discord/commit/ab81d28))
- Enhance reply function to support reactive options ([86fed21](https://github.com/zojize/nuxt-discord/commit/86fed21))
- Implement effect scope management for slash command interactions ([9895ea8](https://github.com/zojize/nuxt-discord/commit/9895ea8))

### ✅ Tests

- Mocks for discord.js, nitropack/runtime; more reply test cases and added client test cases ([e920f48](https://github.com/zojize/nuxt-discord/commit/e920f48))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>

## v0.0.12

[compare changes](https://github.com/zojize/nuxt-discord/compare/v0.0.11...v0.0.12)

### 🚀 Enhancements

- Enhance reply function to support file handling ([a737849](https://github.com/zojize/nuxt-discord/commit/a737849))

### 🩹 Fixes

- Update interaction handling to include replied state ([317c20a](https://github.com/zojize/nuxt-discord/commit/317c20a))

### 💅 Refactors

- Update import paths to use relative paths ([b3a5a9c](https://github.com/zojize/nuxt-discord/commit/b3a5a9c))

### ✅ Tests

- Remove obsolete basic test file ([0740a25](https://github.com/zojize/nuxt-discord/commit/0740a25))
- Enhance reply tests to cover file handling and multiple files ([7ac3fb0](https://github.com/zojize/nuxt-discord/commit/7ac3fb0))

### 🤖 CI

- Add type tests to CI workflow ([f9c34fa](https://github.com/zojize/nuxt-discord/commit/f9c34fa))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>

## v0.0.11

[compare changes](https://github.com/zojize/nuxt-discord/compare/v0.0.10...v0.0.11)

### 🩹 Fixes

- Exclude .ts files from externals in dynamic command build ([5ea9bac](https://github.com/zojize/nuxt-discord/commit/5ea9bac))
- Handle deferred interactions in slash command return values ([a025196](https://github.com/zojize/nuxt-discord/commit/a025196))

### 💅 Refactors

- Adds edit support to reply utility function, and refactors implementation to use Object.defineProperties ([2dc57d3](https://github.com/zojize/nuxt-discord/commit/2dc57d3))

### ✅ Tests

- Add unit tests for reply utility function ([98a51d6](https://github.com/zojize/nuxt-discord/commit/98a51d6))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>

## v0.0.10

[compare changes](https://github.com/zojize/nuxt-discord/compare/v0.0.9...v0.0.10)

### 🩹 Fixes

- Move logger to runtime directory ([84abe0b](https://github.com/zojize/nuxt-discord/commit/84abe0b))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>

## v0.0.9

[compare changes](https://github.com/zojize/nuxt-discord/compare/v0.0.6...v0.0.9)

### 🚀 Enhancements

- Server HMR dynamic command loading ([f676a24](https://github.com/zojize/nuxt-discord/commit/f676a24))
- Changed module options and added auto-defer option ([9d89eac](https://github.com/zojize/nuxt-discord/commit/9d89eac))
- Enhance dynamic command loading ([20c43b6](https://github.com/zojize/nuxt-discord/commit/20c43b6))

### 🩹 Fixes

- Send websocket message after connected ([5e1db83](https://github.com/zojize/nuxt-discord/commit/5e1db83))
- Consistent dynamic command loading and websocket broadcasting ([78679a7](https://github.com/zojize/nuxt-discord/commit/78679a7))

### 🏡 Chore

- Shared internal logger for module server runtime ([c35d948](https://github.com/zojize/nuxt-discord/commit/c35d948))
- Add chokidar and rollup to dependencies ([ea1bf35](https://github.com/zojize/nuxt-discord/commit/ea1bf35))
- **release:** V0.0.7 ([02c6589](https://github.com/zojize/nuxt-discord/commit/02c6589))
- **release:** V0.0.8 ([6d72b58](https://github.com/zojize/nuxt-discord/commit/6d72b58))
- Use same custom logger in module context and server runtime ([007c959](https://github.com/zojize/nuxt-discord/commit/007c959))
- Request full-update after sync ([8478f15](https://github.com/zojize/nuxt-discord/commit/8478f15))

### 🎨 Styles

- Remove whitespaces ([248d360](https://github.com/zojize/nuxt-discord/commit/248d360))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>

## v0.0.8

[compare changes](https://github.com/zojize/nuxt-discord/compare/v0.0.7...v0.0.8)

### 🩹 Fixes

- Consistent dynamic command loading and websocket broadcasting ([f893c6e](https://github.com/zojize/nuxt-discord/commit/f893c6e))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>

## v0.0.7

[compare changes](https://github.com/zojize/nuxt-discord/compare/v0.0.6...v0.0.7)

### 🚀 Enhancements

- Server HMR dynamic command loading ([c2843dc](https://github.com/zojize/nuxt-discord/commit/c2843dc))

### 🩹 Fixes

- Send websocket message after connected ([5e1db83](https://github.com/zojize/nuxt-discord/commit/5e1db83))

### 🏡 Chore

- Shared internal logger for module server runtime ([c5d0f79](https://github.com/zojize/nuxt-discord/commit/c5d0f79))
- Add chokidar and rollup to dependencies ([53e63ba](https://github.com/zojize/nuxt-discord/commit/53e63ba))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>

## v0.0.6

[compare changes](https://github.com/zojize/nuxt-discord/compare/v0.0.4...v0.0.6)

### 🚀 Enhancements

- Infer command name from filename ([b44abbc](https://github.com/zojize/nuxt-discord/commit/b44abbc))

### 🩹 Fixes

- Correct boolean comparison for required option in optionEqual ([bae20f4](https://github.com/zojize/nuxt-discord/commit/bae20f4))
- Change postinstall script to prepare for simple-git-hooks ([5d6c23f](https://github.com/zojize/nuxt-discord/commit/5d6c23f))
- Revert 68e10f10e76b908ea9bce5b2a871ea488dc5dffc ([f07c97f](https://github.com/zojize/nuxt-discord/commit/f07c97f))

### 💅 Refactors

- Remove 'discord/slashCommands' serverTemplate usage ([68e10f1](https://github.com/zojize/nuxt-discord/commit/68e10f1))

### 📖 Documentation

- Add more description about command name inference ([d6a60ab](https://github.com/zojize/nuxt-discord/commit/d6a60ab))

### 🏡 Chore

- **release:** V0.0.5 ([c89e2ba](https://github.com/zojize/nuxt-discord/commit/c89e2ba))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>

## v0.0.5

[compare changes](https://github.com/zojize/nuxt-discord/compare/v0.0.4...v0.0.5)

### 🚀 Enhancements

- Infer command name from filename ([b44abbc](https://github.com/zojize/nuxt-discord/commit/b44abbc))

### 🩹 Fixes

- Correct boolean comparison for required option in optionEqual ([bae20f4](https://github.com/zojize/nuxt-discord/commit/bae20f4))
- Change postinstall script to prepare for simple-git-hooks ([5d6c23f](https://github.com/zojize/nuxt-discord/commit/5d6c23f))

### 💅 Refactors

- Remove 'discord/slashCommands' serverTemplate usage ([68e10f1](https://github.com/zojize/nuxt-discord/commit/68e10f1))

### 📖 Documentation

- Add more description about command name inference ([d6a60ab](https://github.com/zojize/nuxt-discord/commit/d6a60ab))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>

## v0.0.4

[compare changes](https://github.com/zojize/nuxt-discord/compare/v0.0.3...v0.0.4)

### 🩹 Fixes

- Server HMR full update immediately to ensure correct slash commands content ([16bed73](https://github.com/zojize/nuxt-discord/commit/16bed73))

### 📖 Documentation

- Updated Nuxt-UI ref link in README ([ec8df4a](https://github.com/zojize/nuxt-discord/commit/ec8df4a))
- Change npm to pnpm ([b60c88c](https://github.com/zojize/nuxt-discord/commit/b60c88c))

### 🏡 Chore

- Don't force publish on release ([a883797](https://github.com/zojize/nuxt-discord/commit/a883797))
- Remove unnecessary logging ([7624c8a](https://github.com/zojize/nuxt-discord/commit/7624c8a))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>
- Jeff Zou <jeffzo01@qq.com>
- OAHaegt ([@OAHaegt](https://github.com/OAHaegt))

## v0.0.3


### 🩹 Fixes

- License badge URL ([a2f2cd9](https://github.com/zojize/nuxt-discord/commit/a2f2cd9))

### 💅 Refactors

- Remove useToast ([fac9a4c](https://github.com/zojize/nuxt-discord/commit/fac9a4c))

### 🏡 Chore

- Init project ([c8584c6](https://github.com/zojize/nuxt-discord/commit/c8584c6))
- Update Node.js version to 22 in CI workflow ([aa543ac](https://github.com/zojize/nuxt-discord/commit/aa543ac))
- Setup lint on commit ([aeab028](https://github.com/zojize/nuxt-discord/commit/aeab028))

### ✅ Tests

- Removed irrelevant test and added a placeholder dummy test ([7e32179](https://github.com/zojize/nuxt-discord/commit/7e32179))

### ❤️ Contributors

- Zojize <jeffzo01@qq.com>

