"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafeErrorFilter = void 0;
const common_1 = require("@nestjs/common");
let SafeErrorFilter = class SafeErrorFilter {
    catch(error, host) {
        const response = host.switchToHttp().getResponse();
        const request = host
            .switchToHttp()
            .getRequest();
        const parserError = error;
        const status = error instanceof common_1.HttpException
            ? error.getStatus()
            : parserError?.type === "entity.parse.failed"
                ? 400
                : parserError?.type === "entity.too.large"
                    ? 413
                    : 500;
        const codes = {
            400: "VALIDATION_ERROR",
            401: "UNAUTHENTICATED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            409: "CONFLICT",
            413: "PAYLOAD_TOO_LARGE",
            429: "RATE_LIMITED",
            503: "UNAVAILABLE",
        };
        const messages = {
            400: "Проверьте формат запроса",
            401: "Требуется вход",
            403: "Недостаточно прав",
            404: "Объект не найден",
            409: "Данные изменились или операция уже выполнена",
            413: "Превышен размер запроса",
            429: "Слишком много запросов. Повторите позже",
            503: "Сервис временно недоступен",
        };
        if (status >= 500)
            process.stderr.write(`Request failed: ${request.correlationId}\n`);
        // Finance and recruitment errors are deliberately authored, bounded business messages; never pass
        // arbitrary validation, database errors, request values or exception stacks through.
        const detail = error instanceof common_1.HttpException ? error.getResponse() : null;
        const inspectionDetail = status === 400 && detail && typeof detail === "object"
            && detail.code === "INSPECTION_PHOTOS_UNAVAILABLE"
            && typeof detail.message === "string" && detail.message.length <= 500
            && !/[\u0000-\u001f\u007f]/.test(detail.message)
            && Array.isArray(detail.unavailablePhotoIds) && detail.unavailablePhotoIds.length <= 200
            && detail.unavailablePhotoIds.every((id) => typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
            ? { code: detail.code, message: detail.message, unavailablePhotoIds: detail.unavailablePhotoIds } : null;
        const pricingDetail = detail && typeof detail === "object" && "code" in detail && "message" in detail
            && typeof detail.code === "string" && /^(FINANCE|PRICING|PAYROLL|RECRUITMENT|FLEET|TEAM|NEURAL|ONBOARDING_OCR)_[A-Z_]{1,80}$/.test(detail.code)
            && typeof detail.message === "string" && detail.message.length <= 500
            && !/[\u0000-\u001f\u007f]/.test(detail.message) && status >= 400 && (status < 500 || /^(NEURAL|ONBOARDING_OCR)_[A-Z_]{1,80}$/.test(detail.code))
            ? { code: detail.code, message: detail.message } : null;
        response
            .status(status)
            .json({
            code: inspectionDetail?.code ?? pricingDetail?.code ?? codes[status] ?? "INTERNAL_ERROR",
            message: inspectionDetail?.message ?? pricingDetail?.message ?? messages[status] ?? "Внутренняя ошибка",
            ...(inspectionDetail ? { unavailablePhotoIds: inspectionDetail.unavailablePhotoIds } : {}),
            fieldErrors: [],
            correlationId: request.correlationId,
        });
    }
};
exports.SafeErrorFilter = SafeErrorFilter;
exports.SafeErrorFilter = SafeErrorFilter = __decorate([
    (0, common_1.Catch)()
], SafeErrorFilter);
//# sourceMappingURL=error.filter.js.map
