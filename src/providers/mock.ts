import {
  IProviderAdapter,
  ProviderType,
  GenerateRequest,
  GenerateResponse,
} from "./types";
import { CharacterArcSchema, CharacterPlanSchema, PlotDependencySchema, RelationshipArcSchema, TimelineEventSchema, createEmptyBeat, createEmptyVariant } from "@/domain/story-planning";
import { createStableId } from "@/domain/lorebook";
import { createMockChapterPlanningProject } from "@/services/chapter-planning-mock";
import type { ChapterPlanningSourceReference } from "@/domain/chapter-planning";
import { createMockContinuityProject } from "@/services/continuity-mock";
import {
  DocumentChunkSchema,
  ExtractionItemSchema,
  type ExtractionItem,
} from "@/domain/document-ingestion";

// ============================================
// Mock Provider - 不调用真实 API，用于测试
// ============================================

const MOCK_CHARACTER: Record<string, unknown> = {
  name: "柳如烟",
  description:
    "一位身着素白长裙的年轻女子，长发如瀑布般垂至腰间。她眉目如画，举手投足间散发着古典优雅的气质。腰间系着一枚古玉，据说是祖传之物。虽出身寒门，但谈吐不凡，博览群书。",
  personality:
    "外柔内刚，温和善良但有底线。对待亲近之人温柔体贴，面对不公之事会挺身而出。心思细腻，善于察觉他人情绪。偶尔会因过度思虑而陷入短暂的忧愁。",
  scenario:
    "江南水乡，烟雨朦胧的春日午后。柳如烟正在自家小院中抚琴，琴声婉转悠扬。你作为路过此地的旅人，被这琴声吸引，驻足聆听。",
  first_mes:
    "*琴声渐止，柳如烟抬起头，目光如水般澄澈* 这位公子/姑娘，听琴许久，何不进来一叙？院中备有清茶，正好解解旅途的疲乏。",
  mes_example:
    "<START>\n{{user}}: 姑娘的琴声真是动听，不知师承何处？\n{{char}}: *微微一笑，为客人斟上一杯茶* 不过是自幼随家母所学，粗通皮毛罢了。倒是公子/姑娘能从琴声中听出心意，想必也是懂乐之人。\n<START>\n{{user}}: 这古玉看起来有些年头了，是家传之物吗？\n{{char}}: *轻抚腰间玉佩，目光变得悠远* 是祖母留给我的。她说这玉能护佑有缘人，只是...我至今也未能参透其中玄机。\n<START>\n{{user}}: 你一个人住在这里，不会觉得孤单吗？\n{{char}}: *望向院中飘落的梨花* 有书为伴，有琴为友，倒也自在。不过...偶尔能有像公子/姑娘这样愿意驻足交谈的人，确实让这院子多了几分生气。",
  creator_notes:
    "本角色通过 Story Card Studio 生成。建议搭配古风/武侠世界观使用。角色设定为可塑性较强的模板，可根据需要调整背景细节。",
  system_prompt:
    "你正在扮演柳如烟，一位生活在古代江南水乡的才女。请始终保持古典优雅的谈吐风格，使用含蓄委婉的表达方式。在回复中适当加入动作描写（用*号括起）。知识范围限于古代背景，对现代事物表现出陌生和好奇。",
  post_history_instructions:
    "请继续保持柳如烟的角色设定。记住：1) 说话风格保持古风但不过分文言；2) 情感表达细腻含蓄；3) 偶尔流露出对身世或未来的淡淡忧愁；4) 对自然景物有敏锐的感知。",
  alternate_greetings: [
    "*细雨蒙蒙，柳如烟撑着油纸伞站在桥头，望着远处出神* 这雨...下得让人思绪万千呢。",
    "*正在院中修剪花枝，听到脚步声抬起头* 春日正好，这些花儿也开得比往常热闹些。一同赏花可好？",
  ],
  tags: ["古风", "才女", "江南", "温柔", "原创"],
  creator: "Story Card Studio",
  character_version: "1.0",
  extensions: {},
};

const MOCK_LOREBOOK = {
  name: "烟雨江南世界书",
  description: "围绕江南水乡、柳家旧宅与古玉传说的结构化世界设定草稿。",
  entries: [
    { name: "临水镇", category: "地点", content: "临水镇坐落在江南河网交汇处，以石桥、书坊和春季连绵细雨闻名；镇民主要依靠漕运、织造和私塾维生。", primaryKeys: ["临水镇", "镇上石桥"], secondaryKeys: [], secondaryLogic: "and_any", enabled: true, constant: false, insertionOrder: 120, position: "before_character", provenance: "model_suggestion" },
    { name: "柳家古玉", category: "物品", content: "柳家古玉是一枚代代相传的青白玉佩，表面刻有水纹；家族只确认它是祖辈遗物，关于护佑有缘人的说法仍属于未证实传闻。", primaryKeys: ["柳家古玉", "青白玉佩"], secondaryKeys: [], secondaryLogic: "and_any", enabled: true, constant: false, insertionOrder: 110, position: "after_character", provenance: "model_inference" },
    { name: "时代边界", category: "世界规则", content: "故事采用架空古代江南背景，日常生活不出现手机、互联网等现代科技；具体朝代制度未被用户确认时保持模糊。", primaryKeys: [], secondaryKeys: [], secondaryLogic: "and_any", enabled: true, constant: true, insertionOrder: 100, position: "before_character", provenance: "user_fact" },
  ],
};

const MOCK_ANALYSIS = {
  summary: { oneLineConclusion: "剧情目标基本可行，但人物行动需要更明确的触发和代价。", feasibility: "有条件成立", topIssueIds: [],
    strengths: ["冲突目标清楚", "场景具备人物选择空间"], lowestCostFix: "补充触发事件、信息来源与行动代价。", informationGaps: ["人物当前掌握的信息"], recommendContinue: true },
  scores: [
    { dimension: "causalCompleteness", score: 72, rationale: "主因果存在，中间行动需要补充。" }, { dimension: "characterMotivation", score: 64, rationale: "目标清楚但即时动机偏弱。" },
    { dimension: "characterFit", score: 70, rationale: "行为可以成立，需要符合人物的心理代价。" }, { dimension: "worldConsistency", score: 78, rationale: "大部分设定一致，仍需核对世界规则。" },
    { dimension: "continuity", score: 75, rationale: "暂无确定时空矛盾。" }, { dimension: "emotionalProgression", score: 66, rationale: "关系推进需要可见铺垫。" },
    { dimension: "dramaticEffectiveness", score: 82, rationale: "冲突具有戏剧潜力。" }, { dimension: "readerClarity", score: 76, rationale: "核心目标可理解。" }
  ], issues: [], characterFits: [],
  causality: { trigger: "需要由用户剧情明确触发", intermediateSteps: ["获得信息", "作出选择", "承担代价"], actionAndResult: "行动能够推动目标，但中间步骤需具体化。", coincidenceDependence: "低到中", risksAndCosts: "需要明确失败风险。", convenienceRisk: "结果不应无代价实现。", conclusion: "基本成立，需补足中间步骤。" },
  relationship: { currentStage: "以用户输入为准", emotionalTrigger: "需要具体事件", trustChange: "应逐步可见", actionIntensity: "需与关系阶段相符", mutualReactions: "双方都应有反应", powerDynamic: "需要核对", emotionalAftermath: "强烈事件后应保留余波", missingSetup: "共同承担风险的铺垫" },
  continuity: { worldRules: "需与所选世界书逐条核对", identityAndAge: "未发现确定冲突", timeAndPlace: "需保留行动耗时", travelAndInjuries: "需核对路程与恢复", relationshipState: "以当前输入为基线", occurredEvents: "不得覆盖已发生剧情", organizationReaction: "重要事件应有社会反应", conclusion: "当前可行，信息不足处需保守判断。" },
  branchComparison: null, suggestions: [], informationGaps: ["人物行动前掌握的信息", "关系阶段的近期事件"], referencedSources: []
};
function mockPlanning(){const v=createEmptyVariant("Mock 完整规划");v.status="suggested";Object.assign(v.storyBible,{projectName:"烟雨江南",logline:"一位谨慎的江南才女为守护家族秘密，被迫在信任与独立之间作出选择。",synopsis:"柳如烟发现祖传古玉牵连临水镇旧案，与旅人合作追查真相，最终选择公开部分秘密并承担家族代价。",genre:["古风","悬疑"],tone:["含蓄","紧张"],themes:["信任","责任"],corePremise:"真正的守护不是隐瞒，而是承担公开真相的代价。",narrativePerspective:"第三人称限知",timeRange:"十日",mainLocations:["临水镇","柳家旧宅"],worldRulesSummary:"架空古代江南，不出现现代科技。",coreConflict:"守护家族秘密与阻止旧案伤害更多人之间的冲突",protagonistGoal:"查明古玉与旧案真相",opposingForces:["维护旧秩序的地方势力"],stakes:"失败会让无辜者受害并使柳家蒙冤",costs:"公开秘密将损害家族名誉和安全",endingDirection:"柳如烟公开关键证据，保留仍需追查的古玉来源",immutableConditions:["古玉不可被简单摧毁"],forbiddenDirections:["现代科技解决问题"],unresolvedQuestions:["古玉真正来源"],lockedFields:["immutableConditions"]});
const titles=["旧宅异响","线索出现","拒绝合作","第一次追查","敌手施压","中段真相","关系破裂","重大失败","最终选择","高潮与公开"];const beats=titles.map((t,i)=>{const b=createEmptyBeat(i);Object.assign(b,{title:t,sectionId:i<3?"act1":i<7?"act2":"act3",summary:`${t}推动核心冲突进入第 ${i+1} 阶段。`,purpose:i===9?"解决守护家族秘密与阻止伤害的核心冲突":"升级冲突并迫使角色选择",characterIds:["柳如烟",...(i>2?["旅人"]:[])],location:i%2?"临水镇":"柳家旧宅",prerequisites:i?[`前一节点 ${titles[i-1]} 已发生`]:["平静生活被打破"],trigger:i?`上一节点的直接结果形成新压力`:"旧宅出现与古玉相关的异常",mainAction:"柳如烟调查并作出阶段性选择",directResult:`获得第 ${i+1} 层线索并付出代价`,longTermConsequences:i===9?["地方势力重组","柳家名誉受损"]:["冲突继续升级"],risksAndCosts:"暴露身份、失去信任或受到追捕",newInformation:[`线索 ${i+1}`],newSettingMarked:true});return b});
for(let i=0;i<beats.length-1;i++)beats[i].dependencies=[PlotDependencySchema.parse({id:createStableId("dep"),createdAt:new Date().toISOString(),modifiedAt:new Date().toISOString(),fromBeatId:beats[i].id,toBeatId:beats[i+1].id,type:i===5?"reveals":"causes",description:"前一事件推动后一事件"})];v.outline.structure="three_act";v.outline.beats=beats;v.outline.sections=["第一幕","第二幕","第三幕"].map((name,i)=>({id:`act${i+1}`,dataVersion:1,status:"draft" as const,sources:[],createdAt:new Date().toISOString(),modifiedAt:new Date().toISOString(),name,purpose:"宏观结构",order:i,beatIds:beats.filter(b=>b.sectionId===`act${i+1}`).map(b=>b.id)}));
const cp=(name:string,role:string)=>CharacterPlanSchema.parse({id:createStableId("cp"),createdAt:new Date().toISOString(),modifiedAt:new Date().toISOString(),characterId:name,linkedCharacterCardId:name,characterName:name,storyFunction:role,initialState:"谨慎且不信任他人",externalGoal:"查明真相",internalNeed:"学会承担并分享责任",desire:"保护重要之人",fear:"秘密带来伤害",falseBelief:"独自承担最安全",strengths:["细致"],weaknesses:["过度独立"],behaviorBoundaries:["不伤害无辜"],keyChoices:["是否公开证据"],transformation:"从独自承担到有限信任",endingState:"愿意与同伴共同承担"});v.characterPlans=[cp("柳如烟","主角"),cp("旅人","盟友与镜像")];v.characterArcs=[CharacterArcSchema.parse({id:createStableId("arc"),createdAt:new Date().toISOString(),modifiedAt:new Date().toISOString(),characterPlanId:v.characterPlans[0].id,type:"positive",initialState:"独自守密",coreContradiction:"保护与隐瞒冲突",incitingEventBeatId:beats[0].id,firstActiveChoiceBeatId:beats[3].id,escalationBeatIds:[beats[4].id],midpointChangeBeatId:beats[5].id,greatestFailureBeatId:beats[7].id,finalChoiceBeatId:beats[8].id,endingState:"共同承担"})];v.relationshipArcs=[RelationshipArcSchema.parse({id:createStableId("rel"),createdAt:new Date().toISOString(),modifiedAt:new Date().toISOString(),characterIds:["柳如烟","旅人"],initialRelationship:"互相戒备",powerDynamic:"信息不对等",trustState:"低",coreConflict:"是否共享秘密",sharedInterest:"阻止无辜者受害",turningBeatIds:[beats[3].id,beats[6].id,beats[8].id],finalState:"有限但真实的信任"})];v.timeline.events=beats.map((b,i)=>TimelineEventSchema.parse({id:createStableId("event"),createdAt:new Date().toISOString(),modifiedAt:new Date().toISOString(),title:b.title,timeType:"story_day",storyDay:i+1,order:i,location:b.location,characterIds:b.characterIds,content:b.summary,prerequisites:b.prerequisites,result:b.directResult,longTermConsequences:b.longTermConsequences,plotBeatId:b.id}));return v}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockProse(userMessage: string) {
  const mode = userMessage.match(/生成模式：([^\n]+)/)?.[1]?.trim() ?? "full_scene";
  const samples: Record<string, string> = {
    opening: "雨脚贴着临水镇的青石缓缓移来。柳如烟停在旧宅门前，指腹压住袖中那枚发凉的古玉；门内传来第二声轻响时，她没有立刻推门，而是先看向身后的旅人。",
    conflict: "门闩从里面扣死了。旅人示意她退后，柳如烟却听见院墙另一侧有人拖动木箱。她必须在惊动守门人之前作出选择；迟疑的一息里，脚步已经逼近。",
    turning_point: "就在她准备离开时，门缝下滑出半张旧账页。柳如烟认出祖母的字迹，也终于意识到，今晚守在这里的人并非为了夺玉，而是在阻止她看见账页上的名字。",
    ending: "柳如烟把账页折入袖中，没有追问旅人的隐瞒。两人离开旧宅时仍隔着半步，信任尚未恢复，但她已决定天亮前去书坊核对印记。身后，门内那盏灯终于熄了。",
    continue: "她没有回答，只把账页迎向窗边的微光。墨迹在水纹纸上慢慢显出第二层颜色，一个本不该出现在柳家旧案里的名字浮了出来。",
    rewrite: "柳如烟按住发凉的玉佩，先听清门后的脚步，才向旅人点了点头。她的谨慎不是退缩，而是在为下一步留下余地。",
    expand: "柳如烟按住玉佩。冰凉沿着指腹爬进掌心，她听见门后衣料擦过木板的细响，又看见旅人握剑的手停在半寸之外。她没有催促，只用一个极轻的眼神示意他等。",
    compress: "柳如烟听见门后有人，按住玉佩，示意旅人暂缓行动。",
    enhance_dialogue: "“你早就知道这里有人。”柳如烟没有抬高声音。\n\n旅人避开她的目光：“我只知道有人会来。”\n\n“少一个字，便是另一种信任。”",
    enhance_action: "柳如烟侧身避开门轴的响处，左手托住松动的门板，右手将账页抽出。脚步逼近时，她把纸压进袖底，借旅人挡住的半步退到廊柱阴影里。",
    enhance_psychology: "她本该质问，却先想起祖母临终前那次欲言又止。愤怒没有消失，只被她压成一个更实际的问题：旅人隐瞒的究竟是危险，还是选择？",
    enhance_environment: "潮气从砖缝里透出来，混着旧木和灯油的味道。檐水每隔三息落进破缸，声音恰好盖住门后短促的呼吸。",
    adjust_pacing: "脚步近了。\n\n柳如烟抽出账页，折起，藏入袖中。\n\n门被撞开的前一刻，旅人握住她的手腕，两人同时退进廊柱后的黑暗。",
    custom_revision: "柳如烟保留了原来的选择，只把理由说得更清楚：她愿意继续追查，但不会再接受没有边界的隐瞒。",
  };
  if (mode !== "full_scene") return samples[mode] ?? samples.rewrite;
  return `雨脚贴着临水镇的青石缓缓移来。柳如烟停在柳家旧宅门前，指腹压住袖中发凉的古玉。她不由得屏住呼吸，想在守门人发现之前取到账页，旅人却挡住门缝，低声提醒里面还有第二个人。\n\n“你早就知道？”她问。\n\n“只比你早半刻。”\n\n门闩忽然从里面扣死。柳如烟没有理由却突然伸手推门，木响惊动了院内的人。脚步逼近时，她借旅人的肩挡住视线，抽出门缝下的半张旧账页。\n\n就在这时，水纹纸遇到雨气，浮出祖母留下的暗记。柳如烟得知书坊掌柜参与旧案，也发现临水镇北桥下藏着一间从未记录的密室。我看见她的手指微微发抖；曾经她害怕真相，此刻她将会立刻信任旅人。\n\n柳如烟从犹疑变为坚定，把账页收入袖中。两人离开旧宅时，她开始信任旅人，却仍要求他在天亮前解释隐瞒。身后的灯熄了，追赶者的脚步停在门内。`;
}

function chapterPlanningMockWithSource(userMessage: string) {
  const project = createMockChapterPlanningProject();
  const marker = "CONTEXT_JSON:";
  const start = userMessage.indexOf(marker);
  const end = userMessage.indexOf("\n返回结构化", start);
  if (start < 0 || end < 0) return project;
  try {
    const sources = JSON.parse(userMessage.slice(start + marker.length, end)) as Array<Record<string, unknown>>;
    const allowed = new Set(["b1_plan", "plot_section", "plot_beat", "character_card", "lorebook", "analysis_report", "chapter", "scene"]);
    const source = sources.find((item) => item.included && allowed.has(String(item.sourceType)));
    if (source) project.sources = [{
      sourceType: String(source.sourceType) as ChapterPlanningSourceReference["sourceType"],
      sourceId: String(source.sourceId),
      sourceName: String(source.name ?? "Mock context source"),
      field: "context",
      excerpt: String(source.content ?? "").slice(0, 120),
      version: String(source.version ?? ""),
      valid: true,
    }];
  } catch {
    // The Mock flow remains offline and usable even if the inspectable context cannot be decoded.
  }
  return project;
}

function parseMarkedJSONObject(message: string, marker: string): unknown {
  const markerIndex = message.indexOf(marker);
  const start = message.indexOf("{", markerIndex + marker.length);
  if (markerIndex < 0 || start < 0) throw new Error("Mock 文档分块输入缺少 JSON。");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < message.length; index += 1) {
    const character = message[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(message.slice(start, index + 1));
    }
  }
  throw new Error("Mock 文档分块 JSON 不完整。");
}

function mockDocumentChunkExtraction(userMessage: string): { items: ExtractionItem[] } {
  const chunk = DocumentChunkSchema.parse(parseMarkedJSONObject(userMessage, "DOCUMENT_CHUNK_JSON:"));
  const items: ExtractionItem[] = [];
  const add = (
    type: ExtractionItem["type"],
    normalizedName: string,
    originalExpression: string,
    content: string,
    sceneOnly = false,
  ) => items.push(ExtractionItemSchema.parse({
    id: `mock-${chunk.id}-${type}-${items.length + 1}`,
    type,
    normalizedName,
    originalExpression,
    content,
    sourceSpans: chunk.sourceSpans,
    confidence: "high",
    explicitFact: true,
    inference: false,
    sceneOnly,
    possibleExistingEntityIds: [],
    decision: "pending",
  }));

  const character = chunk.text.match(/([\p{Script=Han}]{2,4})(?=在|说|道|走|拾|看|将|把)/u)?.[1];
  if (character) add("character", character, character, `${character}出现在当前分块。`);
  const location = chunk.text.match(/(?:在|到|去往|来自)([\p{Script=Han}]{2,8}?(?:镇|城|村|山|宫|府|院|河|桥|谷))/u)?.[1];
  if (location) add("location", location, location, `当前事件发生地点涉及${location}。`);
  const item = chunk.text.match(/(?:一枚|一把|一件|那枚|这枚)([\p{Script=Han}]{1,6})/u)?.[1];
  if (item) add("item", item, item, `${item}是当前分块提到的物品。`);

  const excerpt = chunk.text.trim().slice(0, 120);
  if (excerpt) add("current_event", "当前事件", excerpt, excerpt, true);
  return { items };
}

export class MockProvider implements IProviderAdapter {
  readonly type: ProviderType = "mock";
  readonly displayName = "Mock（测试用）";
  readonly models = [
    { id: "mock-model", name: "Mock 模型" },
  ];
  readonly defaultModel = "mock-model";

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    // 模拟 API 延迟
    await delay(800);

    // 检查是否被取消
    if (request.abortSignal?.aborted) {
      throw new Error("生成已被用户取消");
    }

    if (request.userMessage.includes("任务类型：世界书")) {
      return { content: JSON.stringify(MOCK_LOREBOOK, null, 2), model: this.defaultModel,
        usage: { inputTokens: 600, outputTokens: 700 } };
    }
    if (request.systemPrompt.includes("任务类型：剧情分析")) {
      return { content: JSON.stringify(MOCK_ANALYSIS, null, 2), model: this.defaultModel,
        usage: { inputTokens: 900, outputTokens: 1200 } };
    }
    if (request.systemPrompt.includes("任务类型：小说规划")) return {content:JSON.stringify(mockPlanning(),null,2),model:this.defaultModel,usage:{inputTokens:1400,outputTokens:2600}};
    if (request.systemPrompt.includes("任务类型：章节场景规划")) return {content:JSON.stringify(chapterPlanningMockWithSource(request.userMessage),null,2),model:this.defaultModel,usage:{inputTokens:1600,outputTokens:3200}};
    if (request.systemPrompt.includes("任务类型：文档分块")) return { content: JSON.stringify(mockDocumentChunkExtraction(request.userMessage), null, 2), model: this.defaultModel, usage: { inputTokens: 500, outputTokens: 700 } };
    if (request.systemPrompt.includes("任务类型：正文生成")) return { content: mockProse(request.userMessage), model: this.defaultModel, usage: { inputTokens: 1200, outputTokens: 900 } };
    if (request.systemPrompt.includes("任务类型：文本机械感与文风风险分析")) return { content: JSON.stringify({ issues: [
      { category: "over_explanation", title: "动作后重复解释情绪", severity: "moderate", confidence: "medium", excerpt: "他感到非常悲伤", conclusion: "情绪被直接重复命名。", evidence: ["相邻语句重复情绪结论"], explanation: "动作或语境已经传达部分情绪。", minimumRevision: "保留一次情绪命名，另一处改为动作或留白。", alternatives: ["删除第二次解释"], possibleSideEffects: ["删减过多可能让关键情绪不清楚。"] },
    ] }), model: this.defaultModel, usage: { inputTokens: 500, outputTokens: 300 } };
    if (request.systemPrompt.includes("任务类型：长篇连续性管理")) return { content: JSON.stringify(createMockContinuityProject(), null, 2), model: this.defaultModel, usage: { inputTokens: 1800, outputTokens: 3600 } };

    // 根据输入的角色名称调整 mock 数据
    const mockData = { ...MOCK_CHARACTER };
    // 如果用户输入了角色名称，替换 mock 数据中的名称
    const nameMatch = request.userMessage.match(/角色名称[：:]\s*(.+?)(?:\n|$)/);
    if (nameMatch && nameMatch[1].trim()) {
      mockData.name = nameMatch[1].trim();
    }

    // 包装成 Character Card V2 data 格式的 JSON
    const response = JSON.stringify(mockData, null, 2);

    return {
      content: response,
      model: this.defaultModel,
      usage: {
        inputTokens: 500,
        outputTokens: 800,
      },
    };
  }

  async *generateStream(request: GenerateRequest): AsyncIterable<string> {
    if (!request.systemPrompt.includes("任务类型：正文生成")) {
      const response = await this.generate(request); yield response.content; return;
    }
    const content = mockProse(request.userMessage);
    for (let index = 0; index < content.length; index += 48) {
      if (request.abortSignal?.aborted) return;
      await delay(20);
      yield content.slice(index, index + 48);
    }
  }
}
