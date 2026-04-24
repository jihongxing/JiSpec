import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { PipelineConfig } from "./pipeline-executor";

/**
 * 模板元数据
 */
export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

/**
 * 模板
 */
export interface PipelineTemplate {
  metadata: TemplateMetadata;
  pipeline: PipelineConfig;
}

/**
 * 模板管理器
 *
 * 功能：
 * 1. 创建自定义流水线模板
 * 2. 保存和加载模板
 * 3. 列出可用模板
 * 4. 从模板实例化流水线
 * 5. 模板验证
 */
export class TemplateManager {
  private root: string;
  private templatesDir: string;

  constructor(root: string) {
    this.root = root;
    this.templatesDir = path.join(root, "templates", "pipelines");

    // 确保模板目录存在
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
  }

  /**
   * 创建模板
   */
  createTemplate(
    id: string,
    name: string,
    description: string,
    pipeline: PipelineConfig,
    options?: {
      author?: string;
      tags?: string[];
    }
  ): PipelineTemplate {
    const template: PipelineTemplate = {
      metadata: {
        id,
        name,
        description,
        version: "1.0.0",
        author: options?.author,
        tags: options?.tags || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      pipeline,
    };

    return template;
  }

  /**
   * 保存模板
   */
  saveTemplate(template: PipelineTemplate): void {
    const templateFile = path.join(this.templatesDir, `${template.metadata.id}.yaml`);

    // 更新时间戳
    template.metadata.updated_at = new Date().toISOString();

    const content = yaml.dump(template);
    fs.writeFileSync(templateFile, content, "utf-8");

    console.log(`[Template] Saved template: ${template.metadata.id}`);
  }

  /**
   * 加载模板
   */
  loadTemplate(templateId: string): PipelineTemplate {
    const templateFile = path.join(this.templatesDir, `${templateId}.yaml`);

    if (!fs.existsSync(templateFile)) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const content = fs.readFileSync(templateFile, "utf-8");
    const template = yaml.load(content) as PipelineTemplate;

    return template;
  }

  /**
   * 列出所有模板
   */
  listTemplates(): TemplateMetadata[] {
    if (!fs.existsSync(this.templatesDir)) {
      return [];
    }

    const files = fs.readdirSync(this.templatesDir);
    const templates: TemplateMetadata[] = [];

    for (const file of files) {
      if (!file.endsWith(".yaml")) continue;

      const templateFile = path.join(this.templatesDir, file);
      const content = fs.readFileSync(templateFile, "utf-8");
      const template = yaml.load(content) as PipelineTemplate;

      templates.push(template.metadata);
    }

    return templates;
  }

  /**
   * 删除模板
   */
  deleteTemplate(templateId: string): void {
    const templateFile = path.join(this.templatesDir, `${templateId}.yaml`);

    if (!fs.existsSync(templateFile)) {
      throw new Error(`Template not found: ${templateId}`);
    }

    fs.unlinkSync(templateFile);
    console.log(`[Template] Deleted template: ${templateId}`);
  }

  /**
   * 从模板实例化流水线配置
   */
  instantiateFromTemplate(
    templateId: string,
    overrides?: Partial<PipelineConfig>
  ): PipelineConfig {
    const template = this.loadTemplate(templateId);

    // 深拷贝流水线配置
    const config: PipelineConfig = JSON.parse(JSON.stringify(template.pipeline));

    // 应用覆盖
    if (overrides) {
      Object.assign(config, overrides);
    }

    return config;
  }

  /**
   * 验证模板
   */
  validateTemplate(template: PipelineTemplate): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 1. 验证元数据
    if (!template.metadata.id) {
      errors.push("Template ID is required");
    }
    if (!template.metadata.name) {
      errors.push("Template name is required");
    }
    if (!template.metadata.description) {
      errors.push("Template description is required");
    }

    // 2. 验证流水线配置
    if (!template.pipeline.name) {
      errors.push("Pipeline name is required");
    }
    if (!template.pipeline.version) {
      errors.push("Pipeline version is required");
    }
    if (!template.pipeline.stages || template.pipeline.stages.length === 0) {
      errors.push("Pipeline must have at least one stage");
    }

    // 3. 验证阶段配置
    for (const stage of template.pipeline.stages || []) {
      if (!stage.id) {
        errors.push(`Stage is missing ID`);
      }
      if (!stage.name) {
        errors.push(`Stage ${stage.id} is missing name`);
      }
      if (!stage.agent) {
        errors.push(`Stage ${stage.id} is missing agent`);
      }
      if (!stage.lifecycle_state) {
        errors.push(`Stage ${stage.id} is missing lifecycle_state`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 导出模板为 JSON
   */
  exportTemplateAsJson(templateId: string): string {
    const template = this.loadTemplate(templateId);
    return JSON.stringify(template, null, 2);
  }

  /**
   * 从 JSON 导入模板
   */
  importTemplateFromJson(jsonContent: string): PipelineTemplate {
    const template = JSON.parse(jsonContent) as PipelineTemplate;

    // 验证模板
    const validation = this.validateTemplate(template);
    if (!validation.valid) {
      throw new Error(`Invalid template: ${validation.errors.join(", ")}`);
    }

    return template;
  }

  /**
   * 克隆模板
   */
  cloneTemplate(sourceId: string, newId: string, newName: string): PipelineTemplate {
    const source = this.loadTemplate(sourceId);

    const cloned: PipelineTemplate = {
      metadata: {
        ...source.metadata,
        id: newId,
        name: newName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      pipeline: JSON.parse(JSON.stringify(source.pipeline)),
    };

    return cloned;
  }

  /**
   * 搜索模板
   */
  searchTemplates(query: string): TemplateMetadata[] {
    const allTemplates = this.listTemplates();
    const lowerQuery = query.toLowerCase();

    return allTemplates.filter((template) => {
      return (
        template.id.toLowerCase().includes(lowerQuery) ||
        template.name.toLowerCase().includes(lowerQuery) ||
        template.description.toLowerCase().includes(lowerQuery) ||
        (template.tags && template.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)))
      );
    });
  }

  /**
   * 按标签过滤模板
   */
  filterByTags(tags: string[]): TemplateMetadata[] {
    const allTemplates = this.listTemplates();

    return allTemplates.filter((template) => {
      if (!template.tags) return false;
      return tags.some((tag) => template.tags!.includes(tag));
    });
  }

  /**
   * 格式化模板列表
   */
  formatTemplateList(templates: TemplateMetadata[]): string {
    const lines: string[] = [];

    lines.push("\n=== Available Pipeline Templates ===\n");

    if (templates.length === 0) {
      lines.push("No templates found.");
      return lines.join("\n");
    }

    for (const template of templates) {
      lines.push(`ID: ${template.id}`);
      lines.push(`Name: ${template.name}`);
      lines.push(`Description: ${template.description}`);
      lines.push(`Version: ${template.version}`);
      if (template.author) {
        lines.push(`Author: ${template.author}`);
      }
      if (template.tags && template.tags.length > 0) {
        lines.push(`Tags: ${template.tags.join(", ")}`);
      }
      lines.push(`Created: ${template.created_at}`);
      lines.push(`Updated: ${template.updated_at}`);
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * 创建默认模板
   */
  createDefaultTemplates(): void {
    // 1. 基础模板
    const basicTemplate = this.createTemplate(
      "basic",
      "Basic Pipeline",
      "A basic pipeline with sequential stages",
      {
        name: "Basic Pipeline",
        version: "1.0.0",
        stages: [
          {
            id: "requirements",
            name: "Requirements Analysis",
            agent: "domain" as any,
            lifecycle_state: "requirements-defined",
            inputs: { files: ["context.yaml"], required: true },
            outputs: { files: ["requirements.yaml"], required: true },
            gates: { required: ["context_exists"], optional: [] },
          },
          {
            id: "design",
            name: "Design",
            agent: "design" as any,
            lifecycle_state: "design-defined",
            inputs: { files: ["requirements.yaml"], required: true },
            outputs: { files: ["design.md"], required: true },
            gates: { required: ["requirements_ready"], optional: [] },
          },
          {
            id: "implement",
            name: "Implementation",
            agent: "implement" as any,
            lifecycle_state: "implementing",
            inputs: { files: ["design.md"], required: true },
            outputs: { files: ["implementation.md"], required: true },
            gates: { required: ["design_ready"], optional: [] },
          },
        ],
        failure_handling: {
          retry: {
            enabled: true,
            max_attempts: 3,
            backoff: "exponential",
            initial_delay: 1000,
            max_delay: 10000,
          },
          rollback: {
            enabled: true,
            strategy: "state_only",
          },
          human_intervention: {
            enabled: true,
            prompt_on_failure: true,
            allow_skip: true,
            allow_manual_fix: true,
          },
        },
        parallel: {
          enabled: false,
          max_concurrent: 1,
        },
        progress: {
          log_level: "info",
          log_file: ".jispec/logs/pipeline.log",
          report_format: "markdown",
        },
      },
      {
        author: "JiSpec",
        tags: ["basic", "sequential"],
      }
    );

    this.saveTemplate(basicTemplate);

    // 2. 并行模板
    const parallelTemplate = this.createTemplate(
      "parallel",
      "Parallel Pipeline",
      "A pipeline with parallel execution support",
      {
        ...basicTemplate.pipeline,
        name: "Parallel Pipeline",
        parallel: {
          enabled: true,
          max_concurrent: 3,
        },
      },
      {
        author: "JiSpec",
        tags: ["parallel", "fast"],
      }
    );

    this.saveTemplate(parallelTemplate);

    console.log("[Template] Created default templates");
  }
}
