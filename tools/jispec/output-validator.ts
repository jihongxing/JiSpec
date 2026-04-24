import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import yaml from "js-yaml";
import { validateSlice } from "./validator";

/**
 * 输出约束配置
 */
export interface OutputConstraint {
  files: string[];           // 输出文件路径
  schemas?: string[];        // 对应的 Schema 文件
  traceRequired: boolean;    // 是否需要追溯链
}

/**
 * 验证结果
 */
export interface ValidationResult {
  passed: boolean;
  errors: ValidationError[];
}

/**
 * 验证错误
 */
export interface ValidationError {
  file: string;
  type: "missing" | "schema" | "semantic" | "trace";
  message: string;
  details?: unknown;
}

/**
 * 输出验证器
 *
 * 功能：
 * 1. 验证输出文件存在
 * 2. 验证输出文件格式（Schema）
 * 3. 验证输出文件语义（跨文件引用）
 * 4. 验证追溯链完整性
 */
export class OutputValidator {
  private constraint: OutputConstraint;
  private ajv: Ajv;

  private constructor(constraint: OutputConstraint) {
    this.constraint = constraint;
    this.ajv = new Ajv({ allErrors: true });
  }

  /**
   * 创建验证器
   */
  static create(constraint: OutputConstraint): OutputValidator {
    return new OutputValidator(constraint);
  }

  /**
   * 验证输出
   */
  async validate(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // 1. 验证文件存在
    for (const filePath of this.constraint.files) {
      if (!fs.existsSync(filePath)) {
        errors.push({
          file: filePath,
          type: "missing",
          message: `Output file does not exist: ${filePath}`,
        });
      }
    }

    // 如果文件不存在，直接返回
    if (errors.length > 0) {
      return { passed: false, errors };
    }

    // 2. 验证 Schema（如果提供）
    if (this.constraint.schemas && this.constraint.schemas.length > 0) {
      for (let i = 0; i < this.constraint.files.length; i++) {
        const filePath = this.constraint.files[i];
        const schemaPath = this.constraint.schemas[i];

        if (schemaPath) {
          const schemaErrors = await this.validateSchema(filePath, schemaPath);
          errors.push(...schemaErrors);
        }
      }
    }

    // 3. 验证语义（使用现有的 validator）
    for (const filePath of this.constraint.files) {
      const semanticErrors = await this.validateSemantics(filePath);
      errors.push(...semanticErrors);
    }

    // 4. 验证追溯链（如果需要）
    if (this.constraint.traceRequired) {
      const traceErrors = await this.validateTrace();
      errors.push(...traceErrors);
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证 Schema
   */
  private async validateSchema(
    filePath: string,
    schemaPath: string
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    try {
      // 读取 Schema
      if (!fs.existsSync(schemaPath)) {
        errors.push({
          file: filePath,
          type: "schema",
          message: `Schema file not found: ${schemaPath}`,
        });
        return errors;
      }

      const schemaContent = fs.readFileSync(schemaPath, "utf-8");
      const schema = JSON.parse(schemaContent);

      // 读取输出文件
      const content = fs.readFileSync(filePath, "utf-8");
      let data: unknown;

      // 根据文件扩展名解析
      const ext = path.extname(filePath);
      if (ext === ".yaml" || ext === ".yml") {
        data = yaml.load(content) as unknown;
      } else if (ext === ".json") {
        data = JSON.parse(content);
      } else {
        // 对于 .md 等文件，跳过 Schema 验证
        return errors;
      }

      // 验证
      const validate = this.ajv.compile(schema);
      const valid = validate(data);

      if (!valid && validate.errors) {
        for (const error of validate.errors) {
          errors.push({
            file: filePath,
            type: "schema",
            message: `Schema validation failed: ${error.instancePath} ${error.message}`,
            details: error,
          });
        }
      }
    } catch (error) {
      errors.push({
        file: filePath,
        type: "schema",
        message: `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
      });
    }

    return errors;
  }

  /**
   * 验证语义
   */
  private async validateSemantics(filePath: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    try {
      // 对于 slice.yaml，使用现有的验证器
      if (path.basename(filePath) === "slice.yaml") {
        // TODO: Fix validateSlice call - needs root and sliceId parameters
        // const sliceDir = path.dirname(filePath);
        // const result = validateSlice(root, sliceId);
        // if (!result.hasErrors()) {
        //   for (const issue of result.issues) {
        //     errors.push({
        //       file: filePath,
        //       type: "semantic",
        //       message: issue.message,
        //       details: issue,
        //     });
        //   }
        // }
      }

      // 对于其他文件，可以添加自定义的语义验证
      // 例如：验证 requirements.md 中的 ID 是否唯一
      // 例如：验证 behaviors.feature 中的场景是否引用了有效的需求

    } catch (error) {
      errors.push({
        file: filePath,
        type: "semantic",
        message: `Semantic validation error: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
      });
    }

    return errors;
  }

  /**
   * 验证追溯链
   */
  private async validateTrace(): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // 查找 trace.yaml 文件
    // 假设 trace.yaml 在 slice 目录下
    for (const filePath of this.constraint.files) {
      const sliceDir = path.dirname(filePath);
      const traceFile = path.join(sliceDir, "trace.yaml");

      if (!fs.existsSync(traceFile)) {
        errors.push({
          file: filePath,
          type: "trace",
          message: `Trace file not found: ${traceFile}`,
        });
        continue;
      }

      try {
        const content = fs.readFileSync(traceFile, "utf-8");
        const trace = yaml.load(content) as any;

        // 验证追溯链格式
        if (!trace.traces || !Array.isArray(trace.traces)) {
          errors.push({
            file: traceFile,
            type: "trace",
            message: "Trace file must contain a 'traces' array",
          });
          continue;
        }

        // 验证每个追溯条目
        for (const entry of trace.traces) {
          if (!entry.from || !entry.to || !entry.type) {
            errors.push({
              file: traceFile,
              type: "trace",
              message: "Trace entry must have 'from', 'to', and 'type' fields",
              details: entry,
            });
          }
        }

        // 验证追溯链是否覆盖了输出文件
        const outputFileName = path.basename(filePath);
        const hasTrace = trace.traces.some((entry: { from: string }) =>
          entry.from.includes(outputFileName)
        );

        if (!hasTrace) {
          errors.push({
            file: filePath,
            type: "trace",
            message: `Output file ${outputFileName} is not traced in trace.yaml`,
          });
        }
      } catch (error) {
        errors.push({
          file: traceFile,
          type: "trace",
          message: `Trace validation error: ${error instanceof Error ? error.message : String(error)}`,
          details: error,
        });
      }
    }

    return errors;
  }

  /**
   * 格式化错误信息
   */
  static formatErrors(errors: ValidationError[]): string {
    if (errors.length === 0) {
      return "No errors";
    }

    const lines = ["Output validation errors:"];
    for (const error of errors) {
      lines.push(`  - [${error.type}] ${error.message}`);
      if (error.details) {
        lines.push(`    Details: ${JSON.stringify(error.details, null, 2)}`);
      }
    }

    return lines.join("\n");
  }
}
