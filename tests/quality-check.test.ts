import { describe, it, expect } from "vitest";
import { runQualityChecks } from "@/services/quality-checker";
import { createEmptyCharacterData } from "@/domain/character-card";

// ============================================
// 质量检查服务测试
// ============================================

describe("runQualityChecks", () => {
  it("应对空数据报告字段缺失错误", () => {
    const data = createEmptyCharacterData();
    const report = runQualityChecks(data);

    const missingIssue = report.issues.find((i) => i.name === "必填字段缺失");
    expect(missingIssue).toBeDefined();
    expect(missingIssue!.severity).toBe("error");
    expect(missingIssue!.fields).toContain("名称");
    expect(missingIssue!.fields).toContain("角色描述");
    expect(missingIssue!.fields).toContain("性格");
    expect(missingIssue!.fields).toContain("第一条消息");
  });

  it("应对完整数据不报告字段缺失错误", () => {
    const data = createEmptyCharacterData();
    data.name = "测试角色";
    data.description = "测试描述，足够长的内容来通过长度检查";
    data.personality = "测试性格，足够长的内容";
    data.first_mes = "你好，你想去哪里？";

    const report = runQualityChecks(data);

    const missingIssue = report.issues.find((i) => i.name === "必填字段缺失");
    expect(missingIssue).toBeUndefined();
  });

  it("应检测示例对话格式问题", () => {
    const data = createEmptyCharacterData();
    data.name = "测试";
    data.description = "测试描述，有足够的内容来进行检查";
    data.personality = "测试性格，足够的内容";
    data.first_mes = "你好！我们可以聊聊吗？";
    // 错误的示例对话格式（缺少 <START> 标记）
    data.mes_example = "用户: 你好\n角色: 你好呀";

    const report = runQualityChecks(data);

    const formatIssue = report.issues.find((i) => i.name === "示例对话格式问题");
    expect(formatIssue).toBeDefined();
    expect(formatIssue!.severity).toBe("warning");
  });

  it("应检测第一条消息缺少互动空间", () => {
    const data = createEmptyCharacterData();
    data.name = "测试";
    data.description = "测试描述，有足够的内容来进行检查，至少要有几十个字吧";
    data.personality = "测试性格，足够的内容";
    // 纯陈述，没有问题或邀请
    data.first_mes = "今天天气真好。阳光洒在窗台上，微风轻轻吹过。";

    const report = runQualityChecks(data);

    const firstMesIssue = report.issues.find((i) =>
      i.name === "第一条消息缺少互动空间"
    );
    expect(firstMesIssue).toBeDefined();
  });

  it("应通过有效的第一条消息", () => {
    const data = createEmptyCharacterData();
    data.name = "测试";
    data.description = "测试描述，有足够的内容来进行检查，至少要有几十个字吧";
    data.personality = "测试性格，足够的内容";
    data.first_mes = "你好！你今天看起来心情不错，发生什么好事了吗？";

    const report = runQualityChecks(data);

    const firstMesIssue = report.issues.find((i) =>
      i.name === "第一条消息缺少互动空间"
    );
    expect(firstMesIssue).toBeUndefined();
  });

  it("应按严重程度排序结果", () => {
    const data = createEmptyCharacterData();
    const report = runQualityChecks(data);

    let lastSeverity = -1;
    const severityOrder = { error: 0, warning: 1, info: 2 };

    for (const issue of report.issues) {
      const current = severityOrder[issue.severity];
      expect(current).toBeGreaterThanOrEqual(lastSeverity);
      lastSeverity = current;
    }
  });

  it("每个报告应有时间戳", () => {
    const data = createEmptyCharacterData();
    const report = runQualityChecks(data);

    expect(report.checkedAt).toBeTruthy();
    expect(() => new Date(report.checkedAt)).not.toThrow();
  });
});
