import { ASSESSMENT_BLUEPRINT_VERSION, ASSESSMENT_CONTRACT_VERSION, ASSESSMENT_ENGINE_SCHEMA_VERSION, } from "./contracts.js";
import { AssessmentEngineError } from "./errors.js";
import { deterministicNumericSeed, sha256Hex } from "./hashing.js";
import { assertBlueprintIntegrity, assertItemContractIntegrity } from "./invariants.js";
function blueprintItemFromSeed(item, order, sourcesByReferenceId) {
    const source = sourcesByReferenceId.get(item.sourceReferenceId);
    if (!source) {
        throw new AssessmentEngineError("SOURCE_NOT_FOUND", `لا توجد لقطة مصدر صريحة للمفردة ${item.planItemId}.`, { planItemId: item.planItemId, sourceReferenceId: item.sourceReferenceId });
    }
    return {
        order,
        planItemId: item.planItemId,
        lessonId: item.lessonId,
        lessonLabel: item.lessonLabel,
        outcomeId: item.outcomeId,
        outcomeLabel: item.outcomeLabel,
        questionType: item.questionType,
        cognitiveLevel: item.cognitiveLevel,
        ...(item.difficultyLevel ? { difficultyLevel: item.difficultyLevel } : {}),
        marks: item.marks,
        styleTarget: item.styleTarget,
        visualTarget: item.visualTarget,
        scenarioTarget: item.scenarioTarget,
        stimulusTarget: item.stimulusTarget,
        skillTarget: item.skillTarget,
        diversityKey: item.diversityKey,
        numericSeed: deterministicNumericSeed({ planItemId: item.planItemId, diversityKey: item.diversityKey }),
        scientificContractKey: item.scientificContractKey,
        scientificRequirements: [...item.scientificRequirements],
        source,
    };
}
export async function buildAssessmentBlueprint(input) {
    if (!input.draftId.trim() || !Number.isInteger(input.generationEpoch) || input.generationEpoch < 1) {
        throw new AssessmentEngineError("INVALID_BLUEPRINT", "معرف المسودة أو رقم دورة التوليد غير صالح.");
    }
    if (input.items.length < 1 || input.items.length > 40) {
        throw new AssessmentEngineError("INVALID_BLUEPRINT", "عدد مفردات التوليد يجب أن يكون بين 1 و40.");
    }
    const items = input.items.map((item, index) => blueprintItemFromSeed(item, index + 1, input.sourcesByReferenceId));
    const planHash = await sha256Hex(items.map(({ source: _source, ...item }) => item));
    const sourceSnapshotHash = await sha256Hex(items.map((item) => item.source));
    const blueprint = {
        engineSchemaVersion: ASSESSMENT_ENGINE_SCHEMA_VERSION,
        blueprintVersion: ASSESSMENT_BLUEPRINT_VERSION,
        draftId: input.draftId,
        generationEpoch: input.generationEpoch,
        assessmentType: input.assessmentType,
        assessmentPolicyId: input.assessmentPolicyId,
        grade: input.grade,
        subject: input.subject,
        topic: input.topic,
        difficulty: input.difficulty,
        totalMarks: items.reduce((sum, item) => sum + item.marks, 0),
        itemCount: items.length,
        planHash,
        sourceSnapshotHash,
        items,
    };
    assertBlueprintIntegrity(blueprint);
    return blueprint;
}
export async function buildAssessmentItemContracts(blueprint) {
    assertBlueprintIntegrity(blueprint);
    return Promise.all(blueprint.items.map(async (item) => {
        const base = {
            engineSchemaVersion: ASSESSMENT_ENGINE_SCHEMA_VERSION,
            contractVersion: ASSESSMENT_CONTRACT_VERSION,
            draftId: blueprint.draftId,
            generationEpoch: blueprint.generationEpoch,
            planHash: blueprint.planHash,
            assessmentType: blueprint.assessmentType,
            assessmentPolicyId: blueprint.assessmentPolicyId,
            planItemId: item.planItemId,
            order: item.order,
            grade: blueprint.grade,
            subject: blueprint.subject,
            topic: blueprint.topic,
            difficulty: blueprint.difficulty,
            lessonId: item.lessonId,
            lessonLabel: item.lessonLabel,
            outcomeId: item.outcomeId,
            outcomeLabel: item.outcomeLabel,
            questionType: item.questionType,
            cognitiveLevel: item.cognitiveLevel,
            ...(item.difficultyLevel ? { difficultyLevel: item.difficultyLevel } : {}),
            marks: item.marks,
            styleTarget: item.styleTarget,
            visualTarget: item.visualTarget,
            scenarioTarget: item.scenarioTarget,
            stimulusTarget: item.stimulusTarget,
            skillTarget: item.skillTarget,
            diversityKey: item.diversityKey,
            numericSeed: item.numericSeed,
            scientificContractKey: item.scientificContractKey,
            scientificRequirements: [...item.scientificRequirements],
            source: item.source,
        };
        const contract = {
            ...base,
            contractHash: await sha256Hex(base),
        };
        assertItemContractIntegrity(contract);
        return contract;
    }));
}
//# sourceMappingURL=blueprint.js.map