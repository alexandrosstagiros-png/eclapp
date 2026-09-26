"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../../identity-access/interface/auth.guard");
const current_actor_decorator_1 = require("../../identity-access/interface/current-actor.decorator");
const trip_pagination_1 = require("../application/trip-pagination");
const trips_service_1 = require("../application/trips.service");
const trip_response_dto_1 = require("./trip-response.dto");
let TripsController = class TripsController {
    trips;
    constructor(trips) {
        this.trips = trips;
    }
    list(actor, limit, cursor) {
        return this.trips.list(actor, (0, trip_pagination_1.parseTripPageQuery)(limit, cursor));
    }
    detail(actor, id) {
        return this.trips.detail(actor, (0, trip_pagination_1.parseTripId)(id));
    }
};
exports.TripsController = TripsController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOperation)({
        summary: "Рейсы в текущей области доступа; водителю — только активно назначенные.",
    }),
    (0, swagger_1.ApiResponse)({ status: 200, type: trip_response_dto_1.TripListResponseDto }),
    (0, swagger_1.ApiQuery)({
        name: "limit",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    }),
    (0, swagger_1.ApiQuery)({
        name: "cursor",
        required: false,
        type: String,
        description: "Непрозрачный nextCursor предыдущей страницы.",
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: "Некорректный limit или cursor." }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Query)("limit")),
    __param(2, (0, common_1.Query)("cursor")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(":id"),
    (0, common_1.Header)("Cache-Control", "no-store"),
    (0, swagger_1.ApiOperation)({
        summary: "Карточка доступного рейса без финансовых сумм и персональных контактов.",
    }),
    (0, swagger_1.ApiResponse)({ status: 200, type: trip_response_dto_1.TripDetailDto }),
    (0, swagger_1.ApiParam)({ name: "id", type: String, format: "uuid" }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: "Некорректный идентификатор рейса.",
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: "Рейс отсутствует или недоступен." }),
    __param(0, (0, current_actor_decorator_1.CurrentActor)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "detail", null);
exports.TripsController = TripsController = __decorate([
    (0, swagger_1.ApiTags)("trips"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: "Отсутствующая, истёкшая или отозванная сессия.",
    }),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)("trips"),
    __metadata("design:paramtypes", [trips_service_1.TripsService])
], TripsController);
//# sourceMappingURL=trips.controller.js.map