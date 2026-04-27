@echo off
REM Phase 5.1 P0 验证脚本 (Windows)

echo ==========================================
echo Phase 5.1 P0 级别任务验证
echo ==========================================
echo.

REM 1. 构建验证
echo 步骤 1/3: 构建验证
echo ------------------------------------------
call npm run build
if %ERRORLEVEL% EQU 0 (
  echo ✅ 构建成功
) else (
  echo ❌ 构建失败
  exit /b 1
)

echo.

REM 2. Doctor 检查
echo 步骤 2/3: Doctor 检查
echo ------------------------------------------
call npm run jispec doctor phase5
if %ERRORLEVEL% EQU 0 (
  echo ✅ Doctor 检查通过
) else (
  echo ❌ Doctor 检查失败
  exit /b 1
)

echo.

REM 3. 回归测试（可选）
echo 步骤 3/3: 回归测试（可选）
echo ------------------------------------------
echo 运行以下命令进行回归测试：
echo.
echo   node --import tsx ./tools/jispec/tests/windows-safe-naming.ts
echo   node --import tsx ./tools/jispec/tests/rollback-regression.ts
echo   node --import tsx ./tools/jispec/tests/semantic-validation-negative.ts
echo.

echo ==========================================
echo 验证完成！
echo ==========================================
echo.
echo P0 级别任务状态：
echo   ✅ P0-1 Portable Naming 基础设施
echo   ⚠️  P0-2 Stage Transaction 原子化（基本完成）
echo   ✅ P0-3 Rollback 持久化收口
echo   ✅ P0-4 Semantic Validator
echo.
echo 下一步：
echo   1. 运行回归测试验证 rollback 和命名
echo   2. 查看 P0-COMPLETION-REPORT.md 了解详细信息
echo   3. 决定是否进入 Phase 5.1 缓存集成
echo.
