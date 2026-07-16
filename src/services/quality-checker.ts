import { CharacterData } from "@/domain/character-card";
import { QualityIssue, Severity, QualityReport } from "@/domain/quality-check";

// ============================================
// 质量检查服务
// ============================================

/** 检查规则接口 */
interface CheckRule {
  name: string;
  severity: Severity;
  check(data: CharacterData): QualityIssue | null;
}

/**
 * 检查 1: 必填字段缺失
 */
const checkMissingFields: CheckRule = {
  name: "必填字段缺失",
  severity: "error",
  check(data) {
    const requiredFields: Array<{ key: keyof CharacterData; label: string }> = [
      { key: "name", label: "名称" },
      { key: "description", label: "角色描述" },
      { key: "personality", label: "性格" },
      { key: "first_mes", label: "第一条消息" },
    ];

    const missing = requiredFields
      .filter((f) => !data[f.key] || (typeof data[f.key] === "string" && !(data[f.key] as string).trim()))
      .map((f) => f.label);

    if (missing.length > 0) {
      return {
        name: "必填字段缺失",
        severity: "error",
        fields: missing,
        rationale: `以下核心字段为空：${missing.join("、")}。这些字段是角色卡的基础信息，缺失会影响使用效果。`,
        suggestion: `请填写${missing.join("、")}字段。名称用于标识角色，角色描述和性格定义角色形象，第一条消息是对话的开场。`,
      };
    }
    return null;
  },
};

/**
 * 检查 2: 名称不一致
 */
const checkNameConsistency: CheckRule = {
  name: "名称不一致",
  severity: "error",
  check(data) {
    if (!data.name) return null;
    const name = data.name.trim();

    // 检查 description 和 first_mes 中是否使用了角色名称
    const references = [
      { field: "角色描述", text: data.description },
      { field: "第一条消息", text: data.first_mes },
    ];

    const issues: string[] = [];
    for (const ref of references) {
      if (ref.text && !ref.text.includes(name)) {
        issues.push(ref.field);
      }
    }

    if (issues.length > 0) {
      return {
        name: "名称不一致",
        severity: "warning",
        fields: issues,
        rationale: `角色名称 "${name}" 在以下字段中未被引用：${issues.join("、")}。可能导致角色身份混乱。`,
        suggestion: `请在${issues.join("、")}中确认角色名称的使用是否一致。如果角色使用自称或别称，请确认上下文能明确指向该角色。`,
      };
    }
    return null;
  },
};

/**
 * 检查 3: 内容重复
 */
const checkContentDuplication: CheckRule = {
  name: "内容重复",
  severity: "warning",
  check(data) {
    const pairs: Array<{ a: string; b: string; aLabel: string; bLabel: string }> = [
      { a: data.description, b: data.personality, aLabel: "角色描述", bLabel: "性格" },
      { a: data.description, b: data.scenario, aLabel: "角色描述", bLabel: "场景" },
      { a: data.personality, b: data.scenario, aLabel: "性格", bLabel: "场景" },
    ];

    const dups: string[] = [];
    for (const pair of pairs) {
      if (!pair.a || !pair.b) continue;
      // 简单的重叠检测：检查是否有超过50字的重叠
      const overlap = findLongestCommonSubstring(pair.a, pair.b);
      if (overlap.length >= 50) {
        dups.push(`${pair.aLabel} 与 ${pair.bLabel}`);
      }
    }

    if (dups.length > 0) {
      return {
        name: "内容重复",
        severity: "warning",
        fields: dups,
        rationale: `以下字段之间存在明显的内容重复（超过50字相同）：${dups.join("；")}。`,
        suggestion: "角色描述应侧重外貌、背景等客观描述；性格应侧重行为模式和内在特质；场景应侧重初始情境。请确保各字段内容各有侧重，避免简单复制。",
      };
    }
    return null;
  },
};

/**
 * 检查 4: 第一条消息缺少互动空间
 */
const checkFirstMessageInteractive: CheckRule = {
  name: "第一条消息缺少互动空间",
  severity: "warning",
  check(data) {
    if (!data.first_mes) return null;
    const msg = data.first_mes.trim();

    // 检查是否以问题结尾，或包含邀请互动的元素
    const hasQuestion = msg.includes("？") || msg.includes("?");
    const hasInvitation = /何不|不妨|不如|一起来|一起|可否|能否|是否愿意|欢迎|请进|请坐/.test(msg);
    const endsWithAction = /\*[^*]+\*$/.test(msg);

    // 如果消息完全是陈述/描写，没有任何互动邀请
    if (!hasQuestion && !hasInvitation) {
      return {
        name: "第一条消息缺少互动空间",
        severity: "warning",
        fields: ["first_mes"],
        rationale: "第一条消息主要是陈述/描写，缺少对用户的提问或邀请。用户可能不知道如何回应。",
        suggestion: "建议在第一条消息中加入一个明确的互动邀请：提问、邀请行动、或留下一个用户需要回应的情境。好的开场消息应该给用户一个自然的回应入口。",
      };
    }

    // 如果消息以动作描写结尾，用户可能无法自然介入
    if (endsWithAction && !hasQuestion && !hasInvitation) {
      return {
        name: "第一条消息缺少互动空间",
        severity: "warning",
        fields: ["first_mes"],
        rationale: "第一条消息以动作描写结尾，但没有明确的互动邀请。用户可能不清楚角色在等待什么回应。",
        suggestion: "建议在动作描写后加入一句台词或提问，给用户一个明确的回应方向。",
      };
    }

    return null;
  },
};

/**
 * 检查 5: 示例对话格式
 */
const checkExampleDialogueFormat: CheckRule = {
  name: "示例对话格式问题",
  severity: "warning",
  check(data) {
    if (!data.mes_example) return null;
    const example = data.mes_example.trim();

    const issues: string[] = [];

    // 检查是否有分隔标记
    if (!example.includes("<START>")) {
      issues.push("缺少 <START> 分隔标记");
    }

    // 检查是否包含 {{user}} 和 {{char}}
    if (!example.includes("{{user}}")) {
      issues.push("缺少 {{user}} 占位符");
    }
    if (!example.includes("{{char}}")) {
      issues.push("缺少 {{char}} 占位符");
    }

    // 检查是否有足够的对话组（至少2组）
    const groups = example.split("<START>").filter((g) => g.trim());
    if (groups.length < 2) {
      issues.push("示例对话组数不足（建议至少2组）");
    }

    if (issues.length > 0) {
      return {
        name: "示例对话格式问题",
        severity: "warning",
        fields: ["mes_example"],
        rationale: `示例对话存在以下格式问题：${issues.join("；")}。`,
        suggestion: `示例对话标准格式：
<START>
{{user}}: 用户的消息
{{char}}: 角色的回复
<START>
{{user}}: 用户的下一条消息
{{char}}: 角色的下一条回复
每组对话以 <START> 开头，使用 {{user}} 和 {{char}} 标记说话者。建议包含 2-5 组对话。`,
      };
    }
    return null;
  },
};

/**
 * 检查 6: 语言风格与设定不一致
 */
const checkLanguageStyleConsistency: CheckRule = {
  name: "语言风格与设定不一致",
  severity: "info",
  check(data) {
    if (!data.first_mes || !data.description) return null;

    // 检查是否是古风设定但使用现代用语
    const classicalKeywords = /古|仙|侠|江湖|宫廷|王爷|将军|公主|公子|姑娘|剑|武功|道|佛|仙术|灵气/;
    const modernKeywords = /手机|微信|互联网|电脑|上网|打卡|点赞|朋友圈|微博|抖音|外卖|地铁|飞机/;

    const isClassicalSetting = classicalKeywords.test(data.description + data.scenario + data.personality);
    const hasModernTerms = modernKeywords.test(data.first_mes + data.mes_example);

    if (isClassicalSetting && hasModernTerms) {
      return {
        name: "语言风格与设定不一致",
        severity: "info",
        fields: ["first_mes", "mes_example"],
        rationale: "角色设定包含古风/古代元素，但对话中出现了现代用语。可能导致角色扮演体验不协调。",
        suggestion: "请确认是否为故意混搭风格（如穿越题材）。如果希望保持纯古风，建议替换现代用语为古代对应表达。",
      };
    }
    return null;
  },
};

/**
 * 检查 7: 未说明的用户身份假设
 */
const checkUserIdentityAssumptions: CheckRule = {
  name: "未说明的用户身份假设",
  severity: "info",
  check(data) {
    if (!data.first_mes && !data.mes_example) return null;
    const texts = [data.first_mes, data.mes_example, data.scenario].filter(Boolean).join(" ");

    // 检查是否对用户身份做了假设
    const assumptionPatterns = [
      { pattern: /公子|姑娘|小姐|少爷|老爷|夫人/,
        desc: "对用户性别/身份做出了特定称呼假设" },
      { pattern: /徒弟|弟子|徒儿/,
        desc: "假设用户是角色的徒弟/弟子" },
      { pattern: /主人|master/i,
        desc: "假设用户是角色的主人" },
      { pattern: /同学|老师|学生/,
        desc: "假设了校园/师生关系" },
    ];

    const found: string[] = [];
    for (const ap of assumptionPatterns) {
      if (ap.pattern.test(texts)) {
        found.push(ap.desc);
      }
    }

    if (found.length > 0) {
      return {
        name: "未说明的用户身份假设",
        severity: "info",
        fields: ["first_mes", "mes_example"],
        rationale: `角色卡内容包含以下可能未说明的用户身份假设：${found.join("；")}。`,
        suggestion: "这些假设可能是合理的，但建议在角色描述或创作备注中说明预期的用户身份，帮助使用者理解角色卡的设计意图。",
      };
    }
    return null;
  },
};

/**
 * 检查 8: 字段长度异常
 */
const checkFieldLength: CheckRule = {
  name: "字段长度异常",
  severity: "info",
  check(data) {
    const checks: Array<{ field: keyof CharacterData; label: string; min: number; max: number }> = [
      { field: "name", label: "名称", min: 1, max: 50 },
      { field: "description", label: "角色描述", min: 20, max: 2000 },
      { field: "personality", label: "性格", min: 10, max: 1500 },
      { field: "scenario", label: "场景", min: 5, max: 500 },
      { field: "first_mes", label: "第一条消息", min: 10, max: 1000 },
    ];

    const anomalies: string[] = [];
    for (const check of checks) {
      const value = data[check.field];
      if (typeof value === "string") {
        if (value.length > check.max) {
          anomalies.push(`${check.label}过长（${value.length}字，建议不超过${check.max}字）`);
        } else if (value.length > 0 && value.length < check.min) {
          anomalies.push(`${check.label}过短（${value.length}字，建议不少于${check.min}字）`);
        }
      }
    }

    if (anomalies.length > 0) {
      return {
        name: "字段长度异常",
        severity: "info",
        fields: anomalies.map((a) => a.split("（")[0]),
        rationale: anomalies.join("；"),
        suggestion: "过长的字段可能影响模型处理效率，过短的字段可能信息不足。建议根据提示调整内容长度。",
      };
    }
    return null;
  },
};

/**
 * 检查 9: JSON 规范问题
 */
const checkJSONSpecCompliance: CheckRule = {
  name: "JSON 规范问题",
  severity: "error",
  check(data) {
    const issues: string[] = [];

    // 检查 spec 字段（这里我们检查 data 级别）
    if (data.alternate_greetings && !Array.isArray(data.alternate_greetings)) {
      issues.push("alternate_greetings 应为数组类型");
    }
    if (data.tags && !Array.isArray(data.tags)) {
      issues.push("tags 应为数组类型");
    }
    if (data.extensions && typeof data.extensions !== "object") {
      issues.push("extensions 应为对象类型");
    }

    // 检查是否有不应出现的字段
    const validKeys = Object.keys(data);
    const unexpectedKeys = validKeys.filter(
      (k) => !(k in {
        name: 1, description: 1, personality: 1, scenario: 1,
        first_mes: 1, mes_example: 1, creator_notes: 1, system_prompt: 1,
        post_history_instructions: 1, alternate_greetings: 1, tags: 1,
        creator: 1, character_version: 1, extensions: 1, character_book: 1,
      })
    );

    if (issues.length > 0) {
      return {
        name: "JSON 规范问题",
        severity: "error",
        fields: ["data"],
        rationale: issues.join("；"),
        suggestion: "请修正以上问题以符合 Character Card V2 规范。",
      };
    }
    return null;
  },
};

// ============================================
// 注册所有检查规则
// ============================================
const ALL_RULES: CheckRule[] = [
  checkMissingFields,
  checkNameConsistency,
  checkContentDuplication,
  checkFirstMessageInteractive,
  checkExampleDialogueFormat,
  checkLanguageStyleConsistency,
  checkUserIdentityAssumptions,
  checkFieldLength,
  checkJSONSpecCompliance,
];

/**
 * 运行所有质量检查
 */
export function runQualityChecks(data: CharacterData): QualityReport {
  const issues: QualityIssue[] = [];

  for (const rule of ALL_RULES) {
    const issue = rule.check(data);
    if (issue) {
      issues.push(issue);
    }
  }

  // 按严重程度排序: error > warning > info
  const severityOrder: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    issues,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * 获取所有检查规则的名称
 */
export function getCheckRuleNames(): string[] {
  return ALL_RULES.map((r) => r.name);
}

// ============================================
// 辅助函数
// ============================================

function findLongestCommonSubstring(a: string, b: string): string {
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let longest = "";

  for (let i = 0; i < shorter.length; i++) {
    for (let j = i + 1; j <= shorter.length; j++) {
      const sub = shorter.slice(i, j);
      if (longer.includes(sub) && sub.length > longest.length) {
        longest = sub;
      }
    }
  }

  return longest;
}
