# Phase 4: 跨切片依赖管理 - 实现文档

## 概述

Phase 4 实现了跨切片依赖管理功能，包括依赖图构建、冲突检测与解决、变更影响分析和版本管理。

## 已实现功能

### 1. 依赖图构建器 (Dependency Graph Builder)

**文件**: `tools/jispec/dependency-graph-builder.ts`

#### 核心功能
- ✅ 自动依赖发现（基于代码分析）
- ✅ 显式依赖声明支持
- ✅ 依赖类型分类（hard、soft、conflict、optional）
- ✅ 循环依赖检测
- ✅ 拓扑排序
- ✅ 关键路径识别
- ✅ 依赖层级计算
- ✅ DOT 格式导出（用于 Graphviz 可视化）

#### 数据结构
```typescript
interface SliceDependency {
  sourceSliceId: string;
  targetSliceId: string;
  type: 'hard' | 'soft' | 'conflict' | 'optional';
  reason: string;
  version?: string;
  metadata?: Record<string, any>;
}

interface DependencyGraph {
  nodes: Map<string, SliceNode>;
  edges: Map<string, SliceDependency[]>;
  cycles: string[][];
  criticalPath: string[];
  maxDepth: number;
}
```

#### 使用示例
```bash
# 分析依赖关系
npm run jispec -- dependency analyze --root . --output .jispec/dependencies

# 生成的文件
# - .jispec/dependencies/dependency-graph.json
# - .jispec/dependencies/dependency-graph.dot
```

### 2. 冲突检测器 (Conflict Detector)

**文件**: `tools/jispec/conflict-detector.ts`

#### 冲突类型
- ✅ **资源冲突**: 多个切片访问同一文件/模块
  - read-write 冲突
  - write-write 冲突
  - delete-write 冲突
- ✅ **版本冲突**: 依赖不同版本的同一库
- ✅ **逻辑冲突**: 业务逻辑互斥
- ✅ **时序冲突**: 执行顺序要求冲突、循环依赖

#### 冲突严重程度
- `low`: 低风险，可以忽略
- `medium`: 中等风险，建议处理
- `high`: 高风险，需要处理
- `critical`: 严重风险，必须处理

#### 使用示例
```bash
# 检测冲突
npm run jispec -- dependency detect-conflicts --root . --output .jispec/conflicts.json

# 查看冲突报告
cat .jispec/conflicts.json
```

### 3. 冲突解决器 (Conflict Resolver)

**文件**: `tools/jispec/conflict-resolver.ts`

#### 解决策略

##### 资源冲突解决
1. **资源隔离**: 创建独立的资源副本或命名空间
2. **执行顺序调整**: 顺序执行避免冲突
3. **切片拆分**: 将冲突操作拆分到不同阶段

##### 版本冲突解决
1. **选择最新兼容版本**: 升级到最新版本
2. **选择最稳定版本**: 使用最常用的版本
3. **使用版本范围**: 允许版本范围约束

##### 逻辑冲突解决
1. **手动干预**: 标记需要人工审查
2. **切片合并**: 合并互斥的切片
3. **添加互斥约束**: 标记为互斥执行

##### 时序冲突解决
1. **打破循环依赖**: 移除最弱的依赖链接
2. **调整执行顺序**: 重新排序满足约束
3. **添加显式依赖**: 强制执行顺序

#### 解决方案评估
每个解决方案包含：
- **置信度** (0-1): 解决方案的可靠性
- **工作量估算**: low/medium/high
- **风险**: 潜在风险列表
- **收益**: 预期收益列表
- **自动应用**: 是否可以自动应用

### 4. 影响分析器 (Impact Analyzer)

**文件**: `tools/jispec/impact-analyzer.ts`

#### 分析维度
- ✅ **直接影响**: 直接依赖的切片
- ✅ **间接影响**: 传递依赖的切片
- ✅ **级联影响**: 关键路径上的影响
- ✅ **受影响文件**: 需要修改的文件列表
- ✅ **受影响测试**: 需要运行的测试列表
- ✅ **风险评估**: 变更风险等级
- ✅ **工作量估算**: 测试、文档、沟通工作量

#### 影响报告
```typescript
interface ImpactReport {
  changedSlice: string;
  changeType: 'add' | 'modify' | 'delete' | 'refactor';
  directImpact: ImpactedSlice[];
  indirectImpact: ImpactedSlice[];
  cascadingImpact: ImpactedSlice[];
  affectedFiles: string[];
  affectedTests: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: RiskFactor[];
  recommendations: Recommendation[];
  estimatedEffort: {
    testing: string;
    documentation: string;
    communication: string;
  };
  impactScore: number; // 0-100
}
```

#### 使用示例
```bash
# 分析变更影响
npm run jispec -- dependency impact <sliceId> \
  --change-type modify \
  --output .jispec/impact-report.json

# 生成 Markdown 报告
npm run jispec -- dependency impact <sliceId> \
  --change-type modify \
  > impact-report.md
```

### 5. 版本解析器 (Version Resolver)

**文件**: `tools/jispec/version-resolver.ts`

#### 核心功能
- ✅ 版本约束解析（支持 SemVer）
- ✅ 版本冲突检测
- ✅ 版本协商和解析
- ✅ 版本兼容性检查
- ✅ 版本升级建议
- ✅ 锁文件生成和加载

#### 支持的版本格式
- 精确版本: `1.2.3`
- Caret 范围: `^1.2.3` (>=1.2.3 <2.0.0)
- Tilde 范围: `~1.2.3` (>=1.2.3 <1.3.0)
- 范围表达式: `>=1.0.0 <2.0.0`

#### 使用示例
```bash
# 解析版本冲突
npm run jispec -- dependency resolve-versions \
  --root . \
  --output .jispec/version-lock.json \
  --report .jispec/version-report.md
```

## CLI 命令

### 依赖分析
```bash
npm run jispec -- dependency analyze [options]

Options:
  --root <path>      Repository root (default: ".")
  --output <path>    Output directory (default: ".jispec/dependencies")
  --json             Emit JSON output
```

### 冲突检测
```bash
npm run jispec -- dependency detect-conflicts [options]

Options:
  --root <path>      Repository root (default: ".")
  --output <path>    Output file (default: ".jispec/conflicts.json")
  --json             Emit JSON output
```

### 影响分析
```bash
npm run jispec -- dependency impact <sliceId> [options]

Arguments:
  sliceId            Slice ID to analyze

Options:
  --root <path>      Repository root (default: ".")
  --change-type <type>  Change type: add, modify, delete, refactor (default: "modify")
  --output <path>    Output file for report
  --json             Emit JSON output
```

### 版本解析
```bash
npm run jispec -- dependency resolve-versions [options]

Options:
  --root <path>      Repository root (default: ".")
  --output <path>    Lock file path (default: ".jispec/version-lock.json")
  --report <path>    Report file path (default: ".jispec/version-report.md")
```

## 工作流示例

### 场景 1: 添加新切片前的依赖分析

```bash
# 1. 分析现有依赖关系
npm run jispec -- dependency analyze --root .

# 2. 检测潜在冲突
npm run jispec -- dependency detect-conflicts --root .

# 3. 查看依赖图
# 使用 Graphviz 可视化
dot -Tpng .jispec/dependencies/dependency-graph.dot -o dependency-graph.png
```

### 场景 2: 修改切片前的影响评估

```bash
# 1. 分析变更影响
npm run jispec -- dependency impact user-auth-slice \
  --change-type modify \
  --output impact-report.json

# 2. 查看影响报告
cat impact-report.json

# 3. 根据建议执行测试
# - 运行受影响的测试
# - 更新相关文档
# - 通知相关团队成员
```

### 场景 3: 解决版本冲突

```bash
# 1. 检测版本冲突
npm run jispec -- dependency detect-conflicts --root .

# 2. 解析版本
npm run jispec -- dependency resolve-versions \
  --output version-lock.json \
  --report version-report.md

# 3. 查看解析报告
cat version-report.md

# 4. 应用锁定版本
# 根据 version-lock.json 更新依赖
```

## 数据存储

### 目录结构
```
.jispec/
├── dependencies/
│   ├── dependency-graph.json    # 依赖图数据
│   └── dependency-graph.dot     # Graphviz 格式
├── conflicts.json               # 冲突检测报告
├── impact-reports/              # 影响分析报告
│   └── <sliceId>-<timestamp>.json
├── version-lock.json            # 版本锁文件
└── version-report.md            # 版本解析报告
```

## 扩展点

### 1. 自定义依赖发现规则

可以扩展 `DependencyGraphBuilder` 的依赖发现逻辑：

```typescript
class CustomDependencyGraphBuilder extends DependencyGraphBuilder {
  protected checkFileDependency(source: Slice, target: Slice): boolean {
    // 自定义文件依赖检测逻辑
    return super.checkFileDependency(source, target);
  }
}
```

### 2. 自定义冲突解决策略

可以添加新的冲突解决策略：

```typescript
class CustomConflictResolver extends ConflictResolver {
  suggestResolutions(conflict: Conflict): Resolution[] {
    const resolutions = super.suggestResolutions(conflict);

    // 添加自定义解决方案
    resolutions.push({
      id: 'custom-resolution',
      type: 'custom',
      // ...
    });

    return resolutions;
  }
}
```

### 3. 自定义影响分析规则

可以扩展影响分析的评估逻辑：

```typescript
class CustomImpactAnalyzer extends ImpactAnalyzer {
  protected assessRiskLevel(
    changeType: ChangeType,
    directImpact: ImpactedSlice[],
    indirectImpact: ImpactedSlice[],
    cascadingImpact: ImpactedSlice[]
  ): RiskLevel {
    // 自定义风险评估逻辑
    return super.assessRiskLevel(changeType, directImpact, indirectImpact, cascadingImpact);
  }
}
```

## 性能考虑

### 依赖图构建
- 对于大型项目（1000+ 切片），依赖图构建可能需要几秒钟
- 建议使用缓存机制，只在切片变更时重新构建

### 冲突检测
- 冲突检测的复杂度为 O(n²)，n 为切片数量
- 对于大型项目，建议增量检测（只检测变更的切片）

### 影响分析
- 影响分析需要遍历依赖图，复杂度为 O(n + e)，n 为节点数，e 为边数
- 使用 BFS 算法确保高效遍历

## 已知限制

1. **依赖发现准确性**: 当前的自动依赖发现基于简单的文本匹配，可能存在误报或漏报
2. **版本解析**: 仅支持基本的 SemVer 格式，不支持复杂的版本约束
3. **冲突解决**: 自动解决策略可能不适用于所有场景，复杂冲突仍需人工介入

## 下一步计划

### 短期（1-2 周）
- [ ] 集成到现有的流水线执行器
- [ ] 添加更多的测试用例
- [ ] 优化依赖发现算法

### 中期（1-2 个月）
- [ ] 实现依赖图可视化 Web UI
- [ ] 添加依赖变更历史追踪
- [ ] 支持更复杂的版本约束

### 长期（3-6 个月）
- [ ] 实现 Phase 5: 分布式执行和缓存
- [ ] 实现 Phase 6: 实时协作和冲突解决

## 参考资料

- [SemVer 规范](https://semver.org/)
- [Graphviz DOT 语言](https://graphviz.org/doc/info/lang.html)
- [拓扑排序算法](https://en.wikipedia.org/wiki/Topological_sorting)
- [依赖管理最佳实践](https://12factor.net/dependencies)

## 贡献指南

欢迎贡献代码和建议！请遵循以下步骤：

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

本项目采用 MIT 许可证。详见 LICENSE 文件。
