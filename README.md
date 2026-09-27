# DSH 插件包：记忆 + 浏览器

一组可被 DSH 插件包市场发现的插件分发清单，遵循
[DSH Plugin Pack Schema v1](https://github.com/baihejiangnan/dsh-plugin-pack)
（清单文件 `dsh-plugin-pack.json`，`schemaVersion: 1`）。

## 有什么

| 插件 | 管什么 | 装完你会得到 |
|---|---|---|
| [`@dsh-external/dsh-persona-memory`](https://github.com/hu568/dsh-plugin-persona-memory) | 记忆：角色设定 + 长期记忆 | `memory`、`persona` 两个工具；角色/记忆每轮自动注入；右侧栏管理面板 |
| [`@dsh-external/dsh-browser-use`](https://github.com/hu568/dsh-plugin-browser-use) | 浏览器控制：AI 直接操作浏览器 | `browser_*` 工具集（ARIA 快照优先的导航/点击/输入/截图/多标签）；右侧栏实时投屏面板 |

- 两个插件互相独立（清单内无 `requires`），装哪个、先装哪个都行。
- 安装会从 npm registry 拉取两个普通依赖：`playwright-core ^1.56.1`（浏览器插件）、
  `schemastery`（记忆插件）。除此之外无网络要求。
- 要求的 DSH 版本：peer 范围 `cordis >=4.0.0-rc <5`、`@deepseek-ai/dsh-tools >=0.0.1-rc <2`；
  实测于 DSH `0.1.5-rc.1` ~ `0.1.7-rc.2`。
- 许可证：两个插件与本清单均为 **MIT**。

## 怎么安装

### 用清单里的安装规格（推荐）

清单的 `spec` 是 `github:<owner>/<repo>` 形式，DSH 的插件管理器可以直接消费：

```text
plugin_manager  action=install_bundle  target="github:hu568/dsh-plugin-persona-memory"
plugin_manager  action=install_bundle  target="github:hu568/dsh-plugin-browser-use"
```

命令行等价形式（桌面端 Electron profile 由应用独占管理，请用插件管理器或「设置 → 插件」）：

```powershell
dsh plugin --profile <profile> add github:hu568/dsh-plugin-persona-memory
dsh plugin --profile <profile> add github:hu568/dsh-plugin-browser-use
```

### 用本包自带的 tarball（离线）

`plugins/` 下放着与上述仓库同版本的 `.tgz`，**不需要 GitHub、不需要源码树**，
每个 tarball 都能单独安装，也已随包分发 `lib/`，安装时**不需要授予任何构建脚本权限**：

```powershell
# 先取本包目录的绝对路径（相对路径会被 pnpm 按 profile 目录解析，指到错的位置）
dsh plugin --profile <profile> add "D:\path\to\dsh-plugin-pack-memory-browser\plugins\dsh-external-dsh-persona-memory-0.1.1.tgz"
dsh plugin --profile <profile> add "D:\path\to\dsh-plugin-pack-memory-browser\plugins\dsh-external-dsh-browser-use-0.1.1.tgz"
```

安装后这两个包会被追加进 profile 的 `dsh.profile.bundles`，各自的 `cordis.patch.yml`
作为组合包层生效；profile 在运行中通常即时生效，否则重启一次。

验证：

```powershell
dsh --profile <profile> --dump-config    # 应出现以包名为标题的层
```

卸载：

```powershell
dsh plugin --profile <profile> remove @dsh-external/dsh-persona-memory
dsh plugin --profile <profile> remove @dsh-external/dsh-browser-use
```

卸载不会删除插件写入的数据目录（`$DSH_HOME/memory`、`$DSH_HOME/personas`、
`$DSH_HOME/browser-use`），需要时手动清理。

> **更新时注意**：DSH 通过 profile 依赖差分识别「这次装的是哪个包」。若 tarball 内容变了但安装
> 规格字符串没变，会报 `ambiguous-install`；请先 `remove` 再 `add`，或让文件名/版本号变化。

## 遵循规范

- **Schema**：`dsh-plugin-pack.json` 的 `schemaVersion` 为 `1`，字段 `id` / `name` / `version` /
  `description` / `license` / `plugins[]`（每项含 `id`、`name`、`kind`、`spec`、`repository`）。
- **本包形态**：`spec` 为远程安装规格（`github:…`），随包 `plugins/*.tgz` 只是离线副本；
  两者版本一致，由下面的自检脚本核对。
- **规范的仓库 topic**：`dsh-plugin`、`dsh-plugin-pack`。
- 本地自检：

  ```powershell
  node scripts/validate.mjs
  ```

  它校验 Schema v1 字段、`id` 唯一性与格式、`spec` 形态及远端仓库命名、随包 tarball 的
  存在性，并解开每个 tarball 核对里面的 `name` / `version` / `license` 与清单是否一致。

## 协议

本插件包（清单、README、脚本、目录结构）采用 **MIT License**，全文见 [`LICENSE`](./LICENSE)，
版权人 `hu568`（https://github.com/hu568）。目录结构参照的规范仓库
[baihejiangnan/dsh-plugin-pack](https://github.com/baihejiangnan/dsh-plugin-pack) 同为 MIT。

两个插件本体同为 MIT，各自仓库内附 `LICENSE`；`dsh-browser-use` 另附 `NOTICE`，
标注其操作范式移植自 [zai-org/ZCode](https://github.com/zai-org/ZCode)（Apache-2.0）。
