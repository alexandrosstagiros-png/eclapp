"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelAuthError = void 0;
class ChannelAuthError extends Error {
    constructor() {
        super("Invalid channel credentials");
        this.name = "ChannelAuthError";
    }
}
exports.ChannelAuthError = ChannelAuthError;
//# sourceMappingURL=channel-auth.js.map