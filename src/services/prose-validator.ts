import type { CandidateFact, LanguageConstraint, PlanCoverageItem, ProseIssue, SceneDraft } from "@/domain/prose";
import { ProseIssueSchema, proseBase } from "@/domain/prose";
import type { ScenePlanVersion } from "@/domain/chapter-planning";

function issue(sceneDraftId: string, versionId: string, type: string, severity: ProseIssue["severity"], confidence: ProseIssue["confidence"], rationale: string, minimumRevision: string, heuristic = true, match?: { start: number; end: number; excerpt: string }): ProseIssue {
  return ProseIssueSchema.parse({ ...proseBase("prose_issue"), status: "reviewed", sceneDraftId, versionId, type, severity, confidence, rationale, minimumRevision, heuristic, textRange: match ?? null });
}

function occurrence(text: string, value: string) { const start = text.indexOf(value); return start < 0 ? undefined : { start, end: start + value.length, excerpt: value }; }

export function validateProse(args: { sceneDraft: SceneDraft; versionId: string; text: string; plan: ScenePlanVersion; coverage: PlanCoverageItem[]; constraints?: LanguageConstraint[]; candidateFacts?: CandidateFact[] }): ProseIssue[] {
  const { sceneDraft, versionId, text, plan, coverage } = args;
  const result: ProseIssue[] = [];
  const missing = (element: PlanCoverageItem["element"]) => coverage.find((item) => item.element === element)?.status === "missing";
  if (missing("goal")) result.push(issue(sceneDraft.id, versionId, "scene_goal_missing", "major", "medium", "正文未充分体现 Scene Plan 的场景目标。", "在不改结局的前提下，让视角角色尽早形成可观察的行动目标。"));
  if (missing("conflict")) result.push(issue(sceneDraft.id, versionId, "core_conflict_missing", "major", "medium", "正文缺少足以阻碍目标的对抗力量。", "补入一个具体阻力及角色为此付出的即时成本。"));
  if (missing("turning_point")) result.push(issue(sceneDraft.id, versionId, "turning_point_missing", "moderate", "medium", "计划转折未在正文中形成方向变化。", "让新信息或选择改变场景后半段的行动方向。"));
  if (missing("result")) result.push(issue(sceneDraft.id, versionId, "scene_result_missing", "major", "medium", "场景结束时没有落实计划结果。", "在结尾明确本场行动造成的可观察变化。"));
  if (coverage.some((item) => item.status === "contradicted")) result.push(issue(sceneDraft.id, versionId, "scene_plan_contradiction", "critical", "high", "正文与 Scene Plan 存在明确冲突。", "保留原稿，建立修订副本并只修正冲突范围。", false));
  if (coverage.find((item) => item.element === "result")?.status === "contradicted") result.push(issue(sceneDraft.id, versionId, "scene_result_conflict", "critical", "high", "正文结果明确否定 Scene Plan 结果。", "只修正结果段，或先在 B2 创建并采用新的计划版本。", false));
  if (plan.exitState.location && /转眼(?:到了|来到)|忽然已在/.test(text)) result.push(issue(sceneDraft.id, versionId, "exit_state_conflict", "major", "medium", "正文可能无过渡改变地点，和 Exit State 不一致。", "补充移动过程，或保持计划离场地点。"));
  if (/提前发生|下一章的事件|后来才会发生的/.test(text)) result.push(issue(sceneDraft.id, versionId, "future_event_early", "major", "high", "正文明确提前使用后续事件。", "删除提前事件，只保留必要铺垫。", false));
  if ((args.candidateFacts ?? []).some((item) => item.importance === "high" && !item.alreadyExists)) result.push(issue(sceneDraft.id, versionId, "important_new_setting", "moderate", "medium", "正文新增了尚未确认的重要设定。", "保留为 Candidate Fact，用户确认前不要写回项目。"));
  if (/毫无理由|莫名其妙|没有理由.*(?:决定|冲|离开)/.test(text)) result.push(issue(sceneDraft.id, versionId, "character_motivation_gap", "major", "high", "人物行动被正文直接描述为缺少理由。", "在行动前补充触发、收益或压力。", false));
  if (/突然(?:相爱|信任|原谅)|立刻(?:相爱|信任|和解)/.test(text)) result.push(issue(sceneDraft.id, versionId, "relationship_change_too_fast", "major", "high", "关系变化强度缺少对应触发和余波。", "降低变化幅度，或补入共同风险和双方反应。", false));
  if (/突然(?:笑|哭|愤怒|释然)|莫名(?:悲伤|开心)/.test(text)) result.push(issue(sceneDraft.id, versionId, "emotion_change_without_trigger", "moderate", "medium", "情绪变化缺少可见触发。", "在变化前补充感知、判断或关系事件。"));
  if (/早已知道|莫名知道|作者才知道/.test(text)) result.push(issue(sceneDraft.id, versionId, "information_known_too_early", "major", "high", "角色获得信息的来源或时序不成立。", "删除越权信息，或补入可追溯来源。", false));
  if (Object.values(plan.entryState.bodyStates).some((item) => /受伤|虚弱|中毒/.test(item)) && /毫发无伤|行动完全不受影响/.test(text)) result.push(issue(sceneDraft.id, versionId, "body_state_conflict", "major", "high", "正文身体状态与入口状态冲突。", "让动作受伤势限制，或先补恢复过程。", false));
  if (plan.location && /同时身在|一瞬间到了另一座城/.test(text)) result.push(issue(sceneDraft.id, versionId, "location_conflict", "major", "high", "地点或路程出现明确冲突。", "补充合理路程或修正地点。", false));
  if (/叫错了名字|误称为|错误称呼/.test(text)) result.push(issue(sceneDraft.id, versionId, "character_appellation_error", "major", "medium", "人物称呼可能错误。", "依据角色卡和当前关系阶段修正称呼。"));
  const allowPersonSwitch = plan.pov.customRules.some((item) => /允许.*人称|allow_person_switch/i.test(item));
  if (!allowPersonSwitch && /我[们的]|我(?:看见|想|知道)/.test(text) && plan.pov.perspective === "third_limited") result.push(issue(sceneDraft.id, versionId, "person_drift", "major", "medium", "第三人称限知场景出现第一人称叙述信号。", "只修订叙述人称，保留对话中的“我”。", true, occurrence(text, text.match(/我(?:看见|想|知道)/)?.[0] ?? "")));
  if (plan.pov.perspective === "third_limited" && /(?:他|她)心里其实.*(?:而|但).*(?:他|她)并不知道/.test(text)) result.push(issue(sceneDraft.id, versionId, "pov_knowledge_violation", "major", "medium", "正文可能直接进入非视角角色内心。", "改为视角角色可观察的动作、语气或推测。"));
  if (plan.pov.perspective === "third_limited" && /切到|视角转向/.test(text) && !plan.pov.allowSwitch) result.push(issue(sceneDraft.id, versionId, "unmarked_pov_switch", "major", "high", "场景出现未允许或未标记的视角切换。", "保持单一视角，或在 B2 配置切换规则。", false));
  if (/昨天.*明天.*现在|曾经.*此刻.*将会/.test(text)) result.push(issue(sceneDraft.id, versionId, "tense_drift", "moderate", "low", "时间叙述标记可能发生不必要的时态漂移。", "统一叙述时间基准；对回忆和预期使用清楚的过渡。"));
  if (/(.{4,18})\1{2,}/.test(text)) result.push(issue(sceneDraft.id, versionId, "repeated_phrase", "minor", "high", "正文存在连续重复词句。", "删除重复部分，保留一次最准确的表达。", false));
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const openings = paragraphs.map((item) => item.trim().slice(0, 4)).filter((item) => item.length === 4);
  if (openings.some((item) => openings.filter((other) => other === item).length >= 3)) result.push(issue(sceneDraft.id, versionId, "repetitive_sentence_pattern", "minor", "medium", "多个段落使用相同句式起手。", "调整其中两段的主语、动作或感知顺序。"));
  const dialogueLines = text.split("\n").filter((item) => /^[“「『\"]/.test(item.trim()));
  if (dialogueLines.length >= 4 && new Set(dialogueLines.map((item) => item.replace(/[“”「」『』\"，。！？]/g, "").slice(0, 5))).size <= 2) result.push(issue(sceneDraft.id, versionId, "dialogue_voice_blending", "moderate", "low", "多名人物的对话节奏和措辞可能过于相似。", "依据人物目标、身份和关系为每人保留不同策略。"));
  if (/门内.*门外.*同时|左边.*右边.*同一只手/.test(text)) result.push(issue(sceneDraft.id, versionId, "unclear_action_space", "moderate", "medium", "动作位置关系不清或互相冲突。", "补充一个空间锚点并按发生顺序重写动作。"));
  if ((text.match(/[“「『][^”」』]+[”」』]/g) ?? []).length >= 3 && !/(?:说|问|答|道|低声|喊)/.test(text)) result.push(issue(sceneDraft.id, versionId, "unclear_speaker", "moderate", "medium", "连续对话缺少足够的说话人锚点。", "在关键轮次加入最少量动作或称谓。"));
  if (paragraphs.some((item) => item.length > 600)) result.push(issue(sceneDraft.id, versionId, "information_dump", "moderate", "medium", "单段信息密度异常，可能形成信息倾倒。", "拆分为行动、反应和必要信息三部分。"));
  if ((text.match(/仿佛|宛如|如同|好似/g) ?? []).length > Math.max(4, text.length / 250)) result.push(issue(sceneDraft.id, versionId, "figurative_overload", "minor", "medium", "修辞标记过密。", "每段保留最有效的一个比喻。"));
  if ((text.match(/也就是说|换句话说|这意味着|显然/g) ?? []).length >= 3) result.push(issue(sceneDraft.id, versionId, "over_explanation", "minor", "medium", "解释性连接词集中，可能削弱潜台词。", "删除已由动作和对话表达的重复解释。"));
  const averageSentence = text.length / Math.max(1, (text.match(/[。！？]/g) ?? []).length);
  if (averageSentence > 90 || (averageSentence < 8 && text.length > 300)) result.push(issue(sceneDraft.id, versionId, "pacing_imbalance", "minor", "low", "句长分布可能造成节奏失衡。", "在关键动作处缩短句子，在余波处恢复完整句。"));
  if (!/[。！？…][”」』]?\s*$/.test(text.trim())) result.push(issue(sceneDraft.id, versionId, "unclear_scene_ending", "minor", "medium", "场景结尾可能处于意外截断状态。", "补全当前句或将版本标记为 incomplete。"));
  if (plan.result && text.length > 500 && missing("exit_state")) result.push(issue(sceneDraft.id, versionId, "major_event_without_aftermath", "moderate", "low", "结果出现后缺少可见余波或离场状态。", "补一小段身体、情绪或关系反应。"));
  for (const rule of (args.constraints ?? []).filter((item) => item.enabled && item.strictness === "hard")) {
    for (const banned of rule.negativeExamples.filter(Boolean)) if (text.includes(banned)) result.push(issue(sceneDraft.id, versionId, "hard_language_constraint_violation", "major", "high", `违反 hard 语言规则“${rule.name}”：出现禁用表达“${banned}”。`, "仅替换该表达，不改变其余正文。", false, occurrence(text, banned)));
  }
  const selected = sceneDraft.versions.find((item) => item.id === versionId);
  if (selected?.blocks.some((block) => block.locked && !text.includes(block.text))) result.push(issue(sceneDraft.id, versionId, "locked_content_changed", "critical", "high", "锁定段落未原样保留。", "拒绝该建议并从原版本重新创建修订。", false));
  return result;
}
