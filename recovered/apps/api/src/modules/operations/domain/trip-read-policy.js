"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tripScopeMatches = tripScopeMatches;
exports.getTripReadAccess = getTripReadAccess;
function tripScopeMatches(left, right) {
    return (left.legalEntityId === right.legalEntityId &&
        left.regionId === right.regionId &&
        left.projectId === right.projectId &&
        left.responsibilityScopeId === right.responsibilityScopeId);
}
/** Financial and personal-data visibility confer no additional trip access. */
function getTripReadAccess(actor) {
    if (!["driver", "dispatcher", "document_specialist"].includes(actor.role))
        return null;
    const scopeTuples = [];
    for (const grant of actor.grants) {
        const scope = Object.freeze({
            legalEntityId: grant.legalEntityId,
            regionId: grant.regionId,
            projectId: grant.projectId,
            responsibilityScopeId: grant.responsibilityScopeId,
        });
        if (!scopeTuples.some((existing) => tripScopeMatches(existing, scope)))
            scopeTuples.push(scope);
    }
    if (scopeTuples.length === 0)
        return null;
    return Object.freeze({
        principal: Object.freeze({
            id: actor.id,
            sessionId: actor.sessionId,
            authVersion: actor.authVersion,
            role: actor.role,
        }),
        scopeTuples: Object.freeze(scopeTuples),
        assignmentUserId: actor.role === "driver" ? actor.id : null,
    });
}
//# sourceMappingURL=trip-read-policy.js.map