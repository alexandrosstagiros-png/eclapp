"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantContains = grantContains;
exports.mayManageAccess = mayManageAccess;
/** Grants are tuples. Matching dimensions from different rows grants no access. */
function grantContains(allowed, target) {
    return (allowed.legalEntityId === target.legalEntityId &&
        allowed.regionId === target.regionId &&
        allowed.projectId === target.projectId &&
        allowed.responsibilityScopeId === target.responsibilityScopeId &&
        (!target.financeVisible || allowed.financeVisible) &&
        (!target.personalDataVisible || allowed.personalDataVisible));
}
function mayManageAccess(actor, targetGrants) {
    return (actor.role === "access_admin" && !actor.impersonation &&
        targetGrants.length > 0 &&
        targetGrants.every((target) => actor.grants.some((allowed) => grantContains(allowed, target))));
}
//# sourceMappingURL=access-policy.js.map
