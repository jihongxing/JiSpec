# JiSpec V1 最小接入样板

这份样板把“老仓库首次接入 JiSpec”固定成一个可重复的最小演示。

样板模板目录：

- [examples/v1-mainline-sample-repo](/D:/codeSpace/JiSpec/examples/v1-mainline-sample-repo)

一键重放脚本：

- [scripts/run-v1-sample-repo.ts](/D:/codeSpace/JiSpec/scripts/run-v1-sample-repo.ts)

## 这个样板证明什么

它固定演示下面 5 件事：

1. `bootstrap discover` 会扫出老仓库里的路由、schema、测试、文档和 manifest 信号。
2. `bootstrap draft` 会生成第一批可审草稿和 session manifest。
3. `adopt` 之后，部分资产进入 `.spec/contracts/`，部分历史问题进入 `.spec/spec-debt/`。
4. `verify` 会把“已接管契约缺失”视为阻断问题，把“暂缓接管的历史债务”视为 advisory。
5. `ci:verify` 会产出稳定的 CI artifacts，而不是只给一行命令行输出。

## 推荐跑法

从仓库根目录运行：

```bash
node --import tsx ./scripts/run-v1-sample-repo.ts --workspace ./.tmp/v1-sample-run
```

如果你想拿机器可读结果喂给别的脚本：

```bash
node --import tsx ./scripts/run-v1-sample-repo.ts --workspace ./.tmp/v1-sample-run --json
```

脚本会做这些事：

1. 把 `examples/v1-mainline-sample-repo` 复制到一个独立工作目录
2. 初始化一个临时 git 仓库并做首个 commit
3. 运行 `bootstrap discover`
4. 运行 `bootstrap draft`
5. 用固定决策完成第一次 takeover
6. 运行 `policy migrate`
7. 运行 `verify`
8. 运行 `ci:verify`

## 手动演示路径

如果你要录制交互式演示，先准备一个独立工作目录，再把下面的命令按顺序跑完：

```bash
npm run jispec-cli -- bootstrap discover --root <sample-workspace> --json
npm run jispec-cli -- bootstrap draft --root <sample-workspace> --json
npm run jispec-cli -- adopt --interactive --root <sample-workspace> --session <session-id>
npm run jispec-cli -- policy migrate --root <sample-workspace> --json
npm run jispec-cli -- verify --root <sample-workspace> --json --facts-out .spec/facts/verify/sample-facts.json
node --import tsx ./scripts/check-jispec.ts --root <sample-workspace>
```

建议在 `adopt --interactive` 里做这 3 个选择：

- `domain` -> `accept`
- `api` -> `skip_as_spec_debt`
- `feature` -> `reject`

这样演示结果最清楚：

- `.spec/contracts/domain.yaml` 会进入正式接管面
- `.spec/spec-debt/<session-id>/api.json` 会保留为历史债务
- `verify` 会返回 `WARN_ADVISORY`，因为历史 API 债务被记录但没有阻断首次接入
- 一旦删掉已接管的 `domain.yaml`，`verify` 会升级成 `FAIL_BLOCKING`

## 关键落盘文件

跑完后最值得看的文件是：

- `.spec/facts/bootstrap/evidence-graph.json`
- `.spec/sessions/<session-id>/manifest.json`
- `.spec/handoffs/bootstrap-takeover.json`
- `.spec/contracts/domain.yaml`
- `.spec/spec-debt/<session-id>/api.json`
- `.spec/policy.yaml`
- `.spec/facts/verify/sample-facts.json`
- `.jispec-ci/verify-report.json`
- `.jispec-ci/ci-summary.md`

## 你应该看到什么

一个成功的首次接入样板应该满足：

- `discover` 能看到至少 2 条高置信路由：`/health` 和 `/orders`
- `draft` 能产出 `domain / api / feature` 三类草稿
- `adopt` 会同时留下 `contracts` 和 `spec-debt`
- `verify` 会把 `BOOTSTRAP_SPEC_DEBT_PENDING` 作为 advisory 暴露出来
- `ci:verify` 会继续返回成功退出码，并写出 `.jispec-ci` 下的报告文件
