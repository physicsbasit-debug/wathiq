const KINDS = ["generic", "force_system", "moment_system", "electrostatic_system"];
const DIRECTIONS = ["left", "right", "up", "down", "toward", "away", "clockwise", "counterclockwise", "balanced", "none"];
const CHARGES = ["positive", "negative", "neutral", "unknown"];
const RELATIONSHIPS = ["attraction", "repulsion", "charge_transfer", "electrostatic_discharge", "resultant_force", "moment", "conduction", "insulation", "none"];
const QUANTITY_KINDS = ["applied_force", "friction_force", "weight", "normal_force", "moment_force", "lever_arm", "charge", "other"];
function asRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : null;
}
function cleanText(value, max = 220) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function enumValue(value, allowed, fallback) {
    return typeof value === "string" && allowed.includes(value)
        ? value
        : fallback;
}
function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function parseQuantity(value) {
    const record = asRecord(value);
    if (!record)
        return null;
    const label = cleanText(record.label, 100);
    const unit = cleanText(record.unit, 30);
    if (!label)
        return null;
    return {
        kind: enumValue(record.kind, QUANTITY_KINDS, "other"),
        label,
        value: finite(record.value),
        unit,
        direction: enumValue(record.direction, DIRECTIONS, "none"),
    };
}
export function parseScientificItemModel(value) {
    const record = asRecord(value);
    if (!record || record.version !== "scientific-item-v1")
        return undefined;
    const quantities = Array.isArray(record.quantities)
        ? record.quantities.map(parseQuantity).filter((item) => Boolean(item)).slice(0, 8)
        : [];
    const model = {
        version: "scientific-item-v1",
        kind: enumValue(record.kind, KINDS, "generic"),
        phenomenon: cleanText(record.phenomenon),
        primaryEntity: cleanText(record.primaryEntity, 120),
        secondaryEntity: cleanText(record.secondaryEntity, 120),
        visualObject: cleanText(record.visualObject, 120),
        relationship: enumValue(record.relationship, RELATIONSHIPS, "none"),
        primaryCharge: enumValue(record.primaryCharge, CHARGES, "unknown"),
        secondaryCharge: enumValue(record.secondaryCharge, CHARGES, "unknown"),
        transferredParticle: cleanText(record.transferredParticle, 80),
        quantities,
        resultValue: finite(record.resultValue),
        resultUnit: cleanText(record.resultUnit, 30),
        resultDirection: enumValue(record.resultDirection, DIRECTIONS, "none"),
        expectedResult: cleanText(record.expectedResult, 260),
    };
    if (!model.phenomenon || !model.primaryEntity || !model.visualObject || !model.expectedResult)
        return undefined;
    if ((model.kind === "force_system" || model.kind === "moment_system") && model.quantities.length < 2)
        return undefined;
    return model;
}
export function scientificItemSignature(model) {
    if (!model)
        return "";
    return JSON.stringify({
        kind: model.kind,
        relationship: model.relationship,
        primaryEntity: model.primaryEntity,
        secondaryEntity: model.secondaryEntity,
        visualObject: model.visualObject,
        primaryCharge: model.primaryCharge,
        secondaryCharge: model.secondaryCharge,
        quantities: model.quantities.map((quantity) => ({
            kind: quantity.kind,
            value: quantity.value,
            unit: quantity.unit,
            direction: quantity.direction,
        })),
        resultValue: model.resultValue,
        resultUnit: model.resultUnit,
        resultDirection: model.resultDirection,
    });
}
function scientificDirectionFromVector(dx, dy) {
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01)
        return "none";
    if (Math.abs(dx) >= Math.abs(dy))
        return dx > 0 ? "right" : "left";
    return dy < 0 ? "up" : "down";
}
function quantitiesHaveUniqueKinds(quantities) {
    return new Set(quantities.map((quantity) => quantity.kind)).size === quantities.length;
}
function forceResult(quantities) {
    let x = 0;
    let y = 0;
    for (const quantity of quantities) {
        if (quantity.direction === "right")
            x += quantity.value;
        if (quantity.direction === "left")
            x -= quantity.value;
        if (quantity.direction === "up")
            y += quantity.value;
        if (quantity.direction === "down")
            y -= quantity.value;
    }
    const value = Number(Math.hypot(x, y).toFixed(2));
    if (value < 0.01)
        return { value: 0, direction: "balanced" };
    if (Math.abs(x) >= Math.abs(y))
        return { value, direction: x > 0 ? "right" : "left" };
    return { value, direction: y > 0 ? "up" : "down" };
}
function momentResult(quantities) {
    const forces = quantities.filter((quantity) => quantity.kind === "moment_force");
    const arms = quantities.filter((quantity) => quantity.kind === "lever_arm");
    if (!forces.length || forces.length !== arms.length)
        return { value: -1, direction: "none" };
    let signed = 0;
    for (let index = 0; index < forces.length; index += 1) {
        const moment = forces[index].value * arms[index].value;
        signed += forces[index].direction === "clockwise" ? -moment : moment;
    }
    if (Math.abs(signed) < 0.01)
        return { value: 0, direction: "balanced" };
    return { value: Number(Math.abs(signed).toFixed(2)), direction: signed > 0 ? "counterclockwise" : "clockwise" };
}
export function scientificItemIsComplete(model) {
    if (!model)
        return false;
    if (model.kind === "force_system") {
        const applied = model.quantities.some((quantity) => quantity.kind === "applied_force" && quantity.value > 0 && quantity.unit === "N" && ["left", "right", "up", "down"].includes(quantity.direction));
        const friction = model.quantities.some((quantity) => quantity.kind === "friction_force" && quantity.value > 0 && quantity.unit === "N" && ["left", "right", "up", "down"].includes(quantity.direction));
        const result = forceResult(model.quantities);
        return applied && friction
            && quantitiesHaveUniqueKinds(model.quantities)
            && model.relationship === "resultant_force"
            && model.resultUnit === "N"
            && Math.abs(model.resultValue - result.value) < 0.01
            && model.resultDirection === result.direction;
    }
    if (model.kind === "moment_system") {
        const forces = model.quantities.filter((quantity) => quantity.kind === "moment_force" && quantity.value > 0 && quantity.unit === "N" && ["clockwise", "counterclockwise"].includes(quantity.direction));
        const arms = model.quantities.filter((quantity) => quantity.kind === "lever_arm" && quantity.value > 0 && quantity.unit === "m");
        const result = momentResult(model.quantities);
        return forces.length >= 1
            && forces.length === arms.length
            && model.relationship === "moment"
            && model.resultUnit === "N m"
            && Math.abs(model.resultValue - result.value) < 0.01
            && model.resultDirection === result.direction;
    }
    if (model.kind === "electrostatic_system") {
        if (model.relationship === "attraction" || model.relationship === "repulsion") {
            if (model.primaryCharge === "unknown" || model.secondaryCharge === "unknown")
                return false;
            const sameCharge = model.primaryCharge === model.secondaryCharge;
            return sameCharge ? model.relationship === "repulsion" : model.relationship === "attraction";
        }
        if (model.relationship === "charge_transfer") {
            return /electron|إلكترون|الكترون/iu.test(model.transferredParticle)
                && model.primaryCharge !== "unknown"
                && model.secondaryCharge !== "unknown"
                && model.primaryCharge !== model.secondaryCharge;
        }
        if (model.relationship === "electrostatic_discharge") {
            return Boolean(model.visualObject && model.expectedResult);
        }
        return false;
    }
    return model.relationship !== "none" || Boolean(model.expectedResult);
}
export function scientificItemMatchesVisual(model, visual) {
    if (!scientificItemIsComplete(model))
        return false;
    if (model.kind === "generic")
        return true;
    if (!visual || visual.type === "none")
        return false;
    if (model.kind === "force_system") {
        if (visual.type !== "force_diagram" || visual.variant !== "free_body")
            return false;
        if (visual.vectors.length !== model.quantities.length)
            return false;
        return model.quantities.every((quantity) => visual.vectors.some((vector) => vector.label.trim() === quantity.label.trim()
            && Math.abs(vector.magnitude - quantity.value) < 0.01
            && scientificDirectionFromVector(vector.dx, vector.dy) === quantity.direction));
    }
    if (model.kind === "moment_system") {
        if (visual.type !== "force_diagram" || visual.variant !== "moments")
            return false;
        const forces = model.quantities.filter((quantity) => quantity.kind === "moment_force");
        const arms = model.quantities.filter((quantity) => quantity.kind === "lever_arm");
        if (visual.vectors.length !== forces.length || visual.values.length < arms.length)
            return false;
        return forces.every((quantity, index) => Math.abs((visual.vectors[index]?.magnitude ?? -1) - quantity.value) < 0.01)
            && arms.every((quantity, index) => Math.abs((visual.values[index] ?? -1) - quantity.value) < 0.01);
    }
    if (model.kind === "electrostatic_system") {
        if (model.relationship === "attraction" || model.relationship === "repulsion") {
            const expectedAttractionFlag = model.relationship === "attraction" ? 1 : 0;
            return visual.type === "electrostatic_diagram"
                && visual.variant === "attraction_repulsion"
                && Math.abs((visual.values[0] ?? -1) - expectedAttractionFlag) < 0.01
                && visual.annotations[1] === model.primaryCharge
                && visual.annotations[2] === model.secondaryCharge;
        }
        if (model.relationship === "charge_transfer") {
            return visual.type === "electrostatic_diagram" && visual.variant === "charge_transfer";
        }
        if (model.relationship === "electrostatic_discharge") {
            return visual.type === "context_scene" && visual.variant === "road_safety";
        }
        return false;
    }
    return true;
}
//# sourceMappingURL=scientific-item.js.map