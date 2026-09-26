"use strict";
const { AsyncLocalStorage } = require("node:async_hooks");
const auditContext = new AsyncLocalStorage();
function withAuditAttribution(event) {
    const actor = auditContext.getStore()?.request?.actor;
    if (!actor?.impersonation) return event;
    return {
        ...event,
        metadata: {
            ...event.metadata,
            impersonation: {
                ...actor.impersonation,
                targetUserId: actor.id,
                sessionId: actor.sessionId,
            },
        },
    };
}
module.exports = { auditContext, withAuditAttribution };
