# Phase 5.1 前置规范与改造清单

## 目的

本文件定义 JiSpec 进入 **Phase 5.1（缓存基础）** 之前必须满足的架构约束、实现边界、改造顺序与验收标准。

这份文档的目标不是补一个 Windows 文件名的点状修复，而是把 JiSpec 的执行内核收口为：

- **跨平台**：Windows / Linux / macOS 行为一致
- **跨技术语言**：TypeScript / Python / Java / Go / Rust 等产物模型一致
- **跨大模型**：不同 AI provider 只需遵守统一协议，不得泄漏 provider-specific 语义

本文件优先级高于当前仓库中偏“原型总结”性质的 Phase 5 文档；**Phase 5.1 的真实启动，以本文件的前置门禁通过为准。**

---

## 1. 核心原则

### 1.1 逻辑标识与物理存储分离

系统中的核心对象必须先有**逻辑身份（logical identity）**，再映射到文件、目录、缓存键、对象存储键。

禁止把下列物理信息直接当作真相源：

- 文件名
- 目录名
- 本机绝对路径
- 路径分隔符风格
- 某个模型生成的命名习惯

### 1.2 便携命名优先

任何会落到文件系统、缓存、对象存储、网络资源名中的字符串，必须经过统一的便携化处理。

**允许字符集**

- 小写字母：`a-z`
- 数字：`0-9`
- 分隔符：`.` `_` `-`

**禁止直接出现**

- Windows 非法字符：`< > : " / \ | ? *`
- 末尾空格或 `.` 
- 平台保留名：`con` `prn` `aux` `nul` `com1` `lpt1` 等
- 未规范化 Unicode 变体

### 1.3 平台差异只存在于 Adapter 层

Windows/Linux/macOS 的差异必须封装在存储或路径适配层，不能散落在领域逻辑中。

典型差异包括：

- 路径分隔符
- 文件名非法字符
- 大小写敏感性
- 原子写行为
- 行尾换行风格

### 1.4 模型差异只存在于 Provider 层

不同 AI provider 只能产出统一的结构化协议，不能把“文件名猜测”“provider 私有元数据”“特定模型输出风格”渗透到执行引擎。

系统内部唯一真相源是：

- `StageExecutionResult`
- 统一的 schema
- 统一的 artifact identity

### 1.5 缓存基于逻辑内容，不基于本机状态偶然值

缓存命中必须依赖稳定输入，而不是依赖某次运行的临时路径、本地时间戳文件名或 provider 偶发输出。

---

## 2. 术语与标准对象

### 2.1 Artifact Identity

每个产物必须由统一结构表示：

```ts
interface ArtifactIdentity {
  sliceId: string;
  stageId: string;
  artifactType: "requirements" | "design" | "behavior" | "test" | "code" | "evidence" | "trace" | "snapshot" | "report";
  artifactId: string;
  logicalName?: string;
}
```

约束：

- `artifactId` 是逻辑 ID，不等于文件名
- `artifactType=code` 时，允许一个 slice 产生多个代码文件
- trace 关系引用 `ArtifactIdentity` 或其可逆编码，不直接绑定本机路径

### 2.2 Portable Name

```ts
interface PortableNameService {
  toPortableSegment(input: string): string;
  toPortableTimestamp(date: Date): string; // 例如 20260425T022429Z
  buildSnapshotName(sliceId: string, stageId: string, timestamp: Date): string;
}
```

规则：

- 输出必须跨平台合法
- 同一输入在不同机器上结果一致
- 可用于文件名、缓存键片段、对象存储键片段

### 2.3 Storage Adapter

```ts
interface StorageAdapter {
  resolveArtifactPath(identity: ArtifactIdentity): string;
  writeFile(path: string, content: string | Buffer): Promise<void>;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  removeFile(path: string): Promise<void>;
  listFiles(path: string): Promise<string[]>;
}
```

说明：

- 当前 Phase 5.1 只需实现 `filesystem` adapter
- 后续 Phase 5.2+ 可以接对象存储、远程 worker、分布式缓存

### 2.4 Execution Transaction

阶段执行必须具备明确的事务边界：

```ts
interface StageTransaction {
  transactionId: string;
  sliceId: string;
  stageId: string;
  preparedSnapshotId?: string;
  appliedWrites: string[];
  appliedGateUpdates: string[];
  appliedTraceLinks: string[];
  committed: boolean;
}
```

原则：

- **先准备可回滚状态，再提交变更**
- 如果提交后任何一步失败，系统必须可以恢复到最近稳定点
- “阶段失败”不能留下“部分成功的 slice 状态”

---

## 3. 必须满足的架构约束

### 3.1 Snapshot 命名必须平台安全

禁止使用原始 ISO 时间戳直接组成文件名。

错误示例：

- `requirements-2026-04-25T02:24:26.179Z.json`

正确示例：

- `requirements-20260425T022426Z.json`
- `requirements-20260425T022426Z-179ms.json`

### 3.2 Rollback 必须具备真实持久化能力

快照不能只存在于内存 `Map` 中，必须保证：

- 可落盘
- 可枚举
- 可恢复
- 可删除新建文件
- 可恢复递归目录内容

### 3.3 Stage 提交必须原子

以下动作不能处于“半提交”状态：

- 写文件
- 更新 gates
- 更新 trace
- 推进 lifecycle
- 创建 snapshot / journal

推荐顺序：

1. 生成 execution result
2. 准备 snapshot / transaction journal
3. 应用 writes / trace / gates
4. 验证 outputs / gates / slice
5. 推进 lifecycle
6. 提交 transaction

若任一步骤失败：

- 回滚到准备前的稳定状态
- 标记本次 transaction failed
- 不允许留下推进后的 lifecycle

### 3.4 Trace 不能依赖文件名偶然值

`code`、`test`、`scenario`、`requirement` 的关联必须基于逻辑 ID，而不是：

- 文件名包含关系
- 目录名猜测
- provider 写死的示例名称

例如：

- `src/checkout-service` 不能作为 payment slice 的通用 code id

### 3.5 Semantic Validation 必须独立于 Schema Validation

Schema 只保证“结构合法”，Semantic Validation 负责“语义归属正确”。

必须检查：

- 当前 slice 生成的 scenario ID 是否属于当前 slice
- test ID 是否与 scenario ID 对齐
- code artifact ID 是否与当前 slice/service 对齐
- trace link 的 from/to 是否引用真实存在且归属当前 slice 的逻辑对象
- gate update 是否属于合法 gate 集

---

## 4. Phase 5.1 入口门禁

进入 Phase 5.1 之前，以下条件必须全部为真：

- `npm run build` 通过
- `npm run jispec -- validate` 通过
- 单 slice happy path 可重复执行
- terminal-state rerun 幂等成功
- 非 happy path 下 rollback 可恢复
- trace / test / code / scenario 的语义校验通过
- Windows 上 snapshot/report/evidence/cache 文件名均合法

建议新增显式门禁命令：

```bash
npm run jispec -- doctor phase5
```

其输出至少包含：

- baseline checks
- portability checks
- transaction checks
- semantic validation checks

---

## 5. 改造清单（按优先级）

### P0：必须先完成

### P0-1 Portable Naming 基础设施

**目标**

新增统一命名工具，收口所有需要落盘的命名逻辑。

**建议新增文件**

- `tools/jispec/portable-naming.ts`

**首批替换点**

- `tools/jispec/failure-handler.ts`
- `tools/jispec/pipeline-executor.ts`
- `tools/jispec/stage-runner.ts`
- 任何生成 `.jispec/reports/`、`.jispec/evidence/`、`.jispec/executions/`、`.jispec/snapshots/` 的代码

**验收标准**

- Windows 上无 `:` 等非法字符
- 同一逻辑对象在三平台生成一致命名
- 不再散落 `replace(/[:.]/g, "-")` 之类临时逻辑

### P0-2 Stage Transaction 原子化

**目标**

修复“apply 成功但 snapshot 失败导致阶段被判失败”的问题。

**建议改造点**

- `tools/jispec/stage-runner.ts`
- `tools/jispec/failure-handler.ts`

**实施建议**

- 引入 `prepareSnapshot()` / `beginTransaction()`
- snapshot 准备完成前，不推进 lifecycle
- `commitTransaction()` 成功后才算 stage 成功
- rollback 使用 transaction 记录，不只靠内存状态

**验收标准**

- 故意制造 snapshot 写入失败时，slice 仍保持原状态
- 故意制造 apply 后校验失败时，可恢复到稳定点

### P0-3 Rollback 持久化收口

**目标**

让 rollback 从“能跑”变成“可信”。

**建议改造点**

- `tools/jispec/failure-handler.ts`

**要求**

- 快照文件名安全
- 支持递归目录恢复
- 支持删除快照后新增文件
- 能从磁盘枚举最新 snapshot
- 进程重启后仍可恢复

**验收标准**

- 通过一条真实的失败回归测试
- snapshot 能在 `D:\\codeSpace\\JiSpec\\.jispec\\snapshots\\` 被枚举与读取

### P0-4 Semantic Validator

**目标**

补齐“结构绿但语义错”的防线。

**建议新增文件**

- `tools/jispec/semantic-validator.ts`

**建议接入点**

- `tools/jispec/stage-runner.ts`
- `tools/jispec/output-validator.ts`
- `tools/jispec/validator.ts`

**首批规则**

- slice-specific scenario ID 校验
- test-to-scenario 对齐校验
- code artifact ID 与当前 slice/service 对齐校验
- trace link 语义校验

**验收标准**

- 能捕获 `payment` slice 中出现 `checkout-service` 的 trace/code/test 语义错误

---

### P1：Phase 5.1 直接依赖

### P1-1 Artifact Identity 收口

**目标**

让 trace、cache、report、snapshot 都基于同一套 identity。

**建议改造点**

- `tools/jispec/trace-manager.ts`
- `tools/jispec/output-validator.ts`
- `tools/jispec/providers/mock-provider.ts`
- `tools/jispec/stage-execution-result.ts`

**验收标准**

- trace 不再直接依赖具体文件名
- code/test/scenario/requirement 都能映射到逻辑 identity

### P1-2 Storage Adapter 抽象

**目标**

为 Phase 5 的缓存和分布式执行打下统一 I/O 边界。

**建议新增文件**

- `tools/jispec/storage-adapter.ts`
- `tools/jispec/filesystem-storage.ts`

**首批接入点**

- `stage-runner`
- `failure-handler`
- `pipeline-executor`

**验收标准**

- 核心执行链路不再直接散写 `fs.writeFileSync` / `mkdirSync`
- 文件系统是一个 adapter，而不是默认真相源

### P1-3 Cache Key 规范

**目标**

先定义缓存键，再实现缓存。

**建议新增文件**

- `tools/jispec/cache-key.ts`

**缓存键必须包含**

- `sliceId`
- `stageId`
- `lifecycle.state`
- 输入文件内容哈希
- 上游依赖状态 / 依赖产物哈希
- provider 名称
- model 名称（若有）
- prompt/template 版本
- contract 版本
- schema 版本

**禁止包含**

- 绝对路径
- 本机用户名
- 原始本地时间字符串
- provider 返回的非结构化文本噪音

### P1-4 Cache Manifest 规范

**目标**

缓存不仅要存“结果”，还要存“为什么能信它”。

**建议缓存目录**

- `.jispec/cache/<sliceId>/<stageId>/<cacheKey>/`

**Manifest 至少包含**

- cacheKey
- schemaVersion
- artifact identities
- input hashes
- dependency hashes
- provider/model info
- execution result hash
- evidence hash
- createdAt（portable timestamp）

---

### P2：建议在 Phase 5.1 同步完成

### P2-1 回归测试矩阵

至少补以下测试：

- Windows-safe 命名测试
- terminal-state rerun 测试
- rollback 恢复测试
- semantic validation 负例测试
- cache key 稳定性测试
- 跨 slice invalidation 测试

### P2-2 CLI 门诊命令

建议新增：

- `jispec doctor phase5`
- `jispec cache key <slice> <stage>`
- `jispec rollback latest <slice>`

### P2-3 Provider 契约回归

对 `mock` provider 建立固定回归夹具，确保：

- 结构化输出 schema 合法
- ID 归属当前 slice
- trace link 合法
- code artifact id 不再写死

---

## 6. 推荐实施顺序

### Sprint A：执行内核收口

1. `P0-1 Portable Naming`
2. `P0-2 Stage Transaction 原子化`
3. `P0-3 Rollback 持久化收口`

### Sprint B：语义收口

4. `P0-4 Semantic Validator`
5. `P1-1 Artifact Identity 收口`

### Sprint C：Phase 5.1 真正启动

6. `P1-2 Storage Adapter`
7. `P1-3 Cache Key 规范`
8. `P1-4 Cache Manifest 规范`

### Sprint D：工程化兜底

9. `P2-1 回归测试矩阵`
10. `P2-2 CLI 门诊命令`
11. `P2-3 Provider 契约回归`

---

## 7. 完成定义（Definition of Done）

当且仅当以下条件全部满足，才可以宣布 **Phase 5.1 Ready**：

- 命名规则由统一组件负责
- 逻辑 identity 与文件路径彻底解耦
- snapshot / rollback 在 Windows 上可靠
- stage commit 具备事务语义
- semantic validator 已接入主执行链路
- cache key 和 manifest 已文档化并可程序生成
- 至少有一条失败回归测试证明 rollback 可信
- 至少有一条负例回归测试证明 semantic validator 能拦住“假绿”

---

## 8. 一句话结论

Phase 5.1 的前置工作，不是“先做缓存”，而是先把 JiSpec 的执行内核提升为：

**逻辑身份稳定、命名跨平台、事务可恢复、语义可验证、存储可抽象。**

只有这样，后续的缓存、分布式执行、跨模型编排，才不会把今天的隐性不一致放大成系统性复杂度。
