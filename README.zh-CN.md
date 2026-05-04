# JiSpec

中文 | [English](./README.md)

JiSpec 是面向 AI 原生软件交付的契约驱动控制层。

它把主线收拢在本地、确定性、可审计的流程里：
`discover -> draft -> adopt -> verify -> change -> implement`。

详见：[docs/north-star.md](docs/north-star.md)

## 当前面

JiSpec 当前主要围绕这些入口：

- `bootstrap init-project`、`bootstrap discover`、`bootstrap draft`、`adopt`
- `verify` 和 `ci:verify`
- `change` 和 `implement`
- `doctor v1`、`doctor runtime`、`doctor pilot`
- `release snapshot`、`release compare`
- `pilot package`、`console export-governance`

legacy `slice/context` 仍然保留用于兼容，但不再是主入口。

当前发布说明：[docs/releases/v0.1.0.md](docs/releases/v0.1.0.md)

当前重点：继续补足能力覆盖，把主线缝成一条能稳定跑通、能发版的线。
当前发版门禁状态：仓库基线上的 `post-release:gate` 已可跑通，回归矩阵当前基线为 `143 suites / 648 tests`。

## 当前能做什么

- `bootstrap discover` 会写出 bootstrap evidence graph、full inventory、adoption-ranked evidence 和 `bootstrap-summary.md`。
- `bootstrap draft` 会把 ranked evidence 转成 session bundle。
- `adopt --interactive` 会把草稿认领成 adopted contracts，或者登记成 spec debt。
- `verify` 在存在 `.spec/policy.yaml` 时会自动读取它，并输出确定性的 gate 结果。
- `change` 和 `implement` 负责受控的实现中介，不负责自动生成业务代码。
- `doctor v1` 检查 V1 主线，`doctor runtime` 和 `doctor pilot` 覆盖更广的 runtime 与试点就绪度。

## 快速开始

```bash
npm install
npm run jispec -- doctor v1
npm run jispec -- bootstrap discover --root examples/minimal-legacy-takeover --init-project
```

如果你是从文档而不是现有仓库开始，可以看 [docs/greenfield-walkthrough.md](docs/greenfield-walkthrough.md)。

## 主要文档

- [docs/north-star.md](docs/north-star.md)
- [docs/v1-mainline-stable-contract.md](docs/v1-mainline-stable-contract.md)
- [docs/quickstart.md](docs/quickstart.md)
- [docs/takeover-guide.md](docs/takeover-guide.md)
- [docs/greenfield-input-contract.md](docs/greenfield-input-contract.md)
- [docs/install.md](docs/install.md)
- [docs/execute-default-guide.md](docs/execute-default-guide.md)
- [docs/pilot-product-package.md](docs/pilot-product-package.md)
- [docs/ci-templates.md](docs/ci-templates.md)
- [docs/policy-waiver-spec-debt-cookbook.md](docs/policy-waiver-spec-debt-cookbook.md)
- [docs/north-star-acceptance.md](docs/north-star-acceptance.md)
- [docs/console-read-model-contract.md](docs/console-read-model-contract.md)
- [docs/collaboration-surface-freeze.md](docs/collaboration-surface-freeze.md)

Console read model contract.
Collaboration surface freeze.

## 更多

- [CHANGELOG.md](CHANGELOG.md)
- `npm run jispec-cli -- --help`
- `npm run jispec-cli -- verify --json`
- `npm run ci:verify`
