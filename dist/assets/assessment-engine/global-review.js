function normalizeArabic(value) {
    return value
        .normalize("NFKC")
        .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "")
        .replace(/[أإآٱ]/gu, "ا")
        .replace(/ى/gu, "ي")
        .replace(/ة/gu, "ه")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/gu, " ")
        .trim()
        .toLowerCase();
}
function tokenSet(value) {
    return new Set(normalizeArabic(value).split(" ").filter((token) => token.length >= 3));
}
function jaccard(left, right) {
    if (!left.size || !right.size)
        return 0;
    let intersection = 0;
    for (const token of left)
        if (right.has(token))
            intersection += 1;
    return intersection / (left.size + right.size - intersection);
}
export function reviewCompletedAssessment(results) {
    const conflicts = [];
    for (let leftIndex = 0; leftIndex < results.length; leftIndex += 1) {
        const left = results[leftIndex];
        if (!left)
            continue;
        const leftText = `${left.content.stimulus} ${left.content.text}`;
        const leftTokens = tokenSet(leftText);
        const leftNumbers = leftText.match(/[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?/gu) ?? [];
        for (let rightIndex = leftIndex + 1; rightIndex < results.length; rightIndex += 1) {
            const right = results[rightIndex];
            if (!right)
                continue;
            const rightText = `${right.content.stimulus} ${right.content.text}`;
            if (jaccard(leftTokens, tokenSet(rightText)) >= 0.78) {
                conflicts.push({
                    kind: "duplicate_wording",
                    planItemIds: [left.planItemId, right.planItemId],
                    message: "توجد مفردتان متشابهتان بدرجة عالية في الصياغة والمحتوى.",
                });
            }
            const rightNumbers = rightText.match(/[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?/gu) ?? [];
            if (leftNumbers.length >= 3 && leftNumbers.join("|") === rightNumbers.join("|")) {
                conflicts.push({
                    kind: "duplicate_numbers",
                    planItemIds: [left.planItemId, right.planItemId],
                    message: "تكررت مجموعة البيانات العددية نفسها في مفردتين.",
                });
            }
        }
    }
    const directRecall = results.filter((result) => /(ما المقصود|عرف|اكتب تعريف|اذكر وحده|حدد المصطلح)/u.test(normalizeArabic(`${result.content.stimulus} ${result.content.text}`)));
    if (results.length >= 5 && directRecall.length > 1) {
        conflicts.push({
            kind: "excessive_direct_recall",
            planItemIds: directRecall.map((result) => result.planItemId),
            message: "يعتمد الاختبار على الاستدعاء المباشر أكثر من الحد المخطط.",
        });
    }
    return conflicts;
}
//# sourceMappingURL=global-review.js.map