"use strict";
const { randomBytes, randomUUID } = require("node:crypto");
const common = require("@nestjs/common");
const validator = require("class-validator");
const { IdentityAccessModule } = require("../identity-access/identity-access.module");
const { AuthGuard } = require("../identity-access/interface/auth.guard");
const { AuthService } = require("../identity-access/application/auth.service");
const { DatabaseService } = require("../../platform/database.service");
const { ConfigService } = require("../../platform/config");
const { InspectionsModule } = require("../inspections/inspections.module");
const { InspectionsService } = require("../inspections/application/inspections.service");

const MAX_FILE = 8 * 1024 * 1024;
const MAX_TOTAL = 32 * 1024 * 1024;
const TTL = 60_000;
class DownloadDto {}
validator.IsOptional()(DownloadDto.prototype, "inspectionPhotoId");
validator.IsUUID()(DownloadDto.prototype, "inspectionPhotoId");
for (const [key, limit] of [["filename", 180], ["contentType", 120], ["contentBase64", Math.ceil(MAX_FILE / 3) * 4]]) {
  validator.IsString()(DownloadDto.prototype, key);
  validator.MaxLength(limit)(DownloadDto.prototype, key);
}

class MaxDownloadsService {
  constructor(auth, database, config, inspections) {
    this.auth = auth; this.database = database; this.config = config; this.inspections = inspections;
    this.files = new Map(); this.bytes = 0;
    this.timer = setInterval(() => this.prune(), 10_000); this.timer.unref();
  }
  onModuleDestroy() { clearInterval(this.timer); this.files.clear(); this.bytes = 0; }
  remove(token) {
    const file = this.files.get(token);
    if (file) { this.bytes -= file.byteSize; this.files.delete(token); }
    return file;
  }
  prune() {
    for (const [token, file] of this.files) if (file.expiresAt <= Date.now()) this.remove(token);
  }
  create(body, actor) {
    if (!["max", "web"].includes(actor.channel)) throw new common.ForbiddenException();
    if (typeof body.contentBase64 !== "string") throw new common.BadRequestException();
    if (body.contentBase64.length > Math.ceil(MAX_FILE / 3) * 4) throw new common.PayloadTooLargeException();
    if (!body.filename || /[\\/\x00-\x1f\x7f]/.test(body.filename) ||
        !/^[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;\s*charset=[a-z0-9-]+)?$/i.test(body.contentType) ||
        body.contentBase64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(body.contentBase64)) {
      throw new common.BadRequestException();
    }
    const data = Buffer.from(body.contentBase64, "base64");
    if (!data.length || data.length > MAX_FILE || data.toString("base64") !== body.contentBase64) throw new common.BadRequestException();
    if (body.inspectionPhotoId !== undefined) {
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.inspectionPhotoId) || !this.inspections)
        throw new common.BadRequestException();
      // A token refers to the protected photo, rather than retaining another copy
      // that could outlive deletion or contain the pre-compression representation.
      return this.inspections.download(actor, body.inspectionPhotoId, randomUUID()).then(photo =>
        this.stage({ filename: photo.filename, contentType: photo.mimeType }, null, actor, photo.bytes.length, body.inspectionPhotoId));
    }
    return this.stage(body, data, actor, data.length);
  }
  stage(body, data, actor, byteSize, inspectionPhotoId) {
    this.prune();
    const own = [...this.files.values()].filter(file => file.actor.id === actor.id).length;
    if (own >= 2 || this.bytes + byteSize > MAX_TOTAL) throw new common.HttpException("Download capacity reached", 429);
    const origin = this.config.value.allowedOrigins.find(value => value.startsWith("https://")) ??
      (this.config.value.nodeEnv === "test" ? this.config.value.allowedOrigins[0] : undefined);
    if (!origin) throw new common.ServiceUnavailableException();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + TTL;
    this.files.set(token, { body: data, byteSize, inspectionPhotoId, filename: body.filename, contentType: body.contentType, actor, expiresAt });
    this.bytes += byteSize;
    return { url: new URL(`/api/v1/max/downloads/${token}`, origin).href, expiresAt: new Date(expiresAt).toISOString(), filename: body.filename };
  }
  async read(token, headOnly) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new common.NotFoundException();
    this.prune();
    const file = headOnly ? this.files.get(token) : this.remove(token);
    if (!file) throw new common.NotFoundException();
    try { await this.auth.requireCurrentActor(this.database.pool, file.actor); }
    catch { this.remove(token); throw new common.NotFoundException(); }
    if (file.expiresAt <= Date.now()) { this.remove(token); throw new common.NotFoundException(); }
    if (file.inspectionPhotoId) {
      let photo;
      try { photo = await this.inspections.download(file.actor, file.inspectionPhotoId, randomUUID()); }
      catch { this.remove(token); throw new common.NotFoundException(); }
      if (file.expiresAt <= Date.now()) { this.remove(token); throw new common.NotFoundException(); }
      return { ...file, body: photo.bytes, contentType: photo.mimeType, filename: photo.filename, sha256: photo.sha256 };
    }
    return file;
  }
}
common.Injectable()(MaxDownloadsService);
for (const [i, dep] of [AuthService, DatabaseService, ConfigService, InspectionsService].entries()) common.Inject(dep)(MaxDownloadsService, undefined, i);

class MaxDownloadsController {
  constructor(service) { this.service = service; }
  create(body, request) { return this.service.create(body, request.actor); }
  async read(token, request, response) {
    const headOnly = request.method === "HEAD";
    const file = await this.service.read(token, headOnly);
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Content-Length", String(file.body.length));
    if (file.sha256) response.setHeader("ETag", `"${file.sha256}"`);
    response.setHeader("Content-Disposition", `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`);
    response.setHeader("Cache-Control", "no-store, private");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.end(headOnly ? undefined : file.body);
  }
}
common.Controller("max/downloads")(MaxDownloadsController);
common.Inject(MaxDownloadsService)(MaxDownloadsController, undefined, 0);
const proto = MaxDownloadsController.prototype;
common.Post()(proto, "create", Object.getOwnPropertyDescriptor(proto, "create"));
common.UseGuards(AuthGuard)(proto, "create", Object.getOwnPropertyDescriptor(proto, "create"));
common.Body()(proto, "create", 0); common.Req()(proto, "create", 1);
Reflect.defineMetadata("design:paramtypes", [DownloadDto, Object], proto, "create");
common.Get(":token")(proto, "read", Object.getOwnPropertyDescriptor(proto, "read"));
common.Param("token")(proto, "read", 0); common.Req()(proto, "read", 1); common.Res()(proto, "read", 2);
class MaxDownloadsModule {}
common.Module({ imports: [IdentityAccessModule, InspectionsModule], controllers: [MaxDownloadsController], providers: [MaxDownloadsService] })(MaxDownloadsModule);
module.exports = { MaxDownloadsModule, MaxDownloadsService };
