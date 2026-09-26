"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentActor = void 0;
const common_1 = require("@nestjs/common");
exports.CurrentActor = (0, common_1.createParamDecorator)((_data, context) => {
    const actor = context
        .switchToHttp()
        .getRequest().actor;
    if (!actor)
        throw new common_1.UnauthorizedException("Authentication required");
    return actor;
});
//# sourceMappingURL=current-actor.decorator.js.map