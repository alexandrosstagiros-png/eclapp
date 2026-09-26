"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bootstrap_1 = require("./bootstrap");
const config_1 = require("./platform/config");
async function main() {
    const { app } = await (0, bootstrap_1.createApp)();
    const config = app.get(config_1.ConfigService).value;
    await app.listen(config.port, config.host);
    process.stdout.write(`Transport API listening on port ${config.port}\n`);
}
main().catch(() => {
    process.stderr.write("API startup failed. Verify configuration, database role and migrations.\n");
    process.exitCode = 1;
});
//# sourceMappingURL=main.js.map