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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripsService = void 0;
const common_1 = require("@nestjs/common");
const trip_read_policy_1 = require("../domain/trip-read-policy");
const trip_pagination_1 = require("./trip-pagination");
const trip_read_repository_1 = require("./trip-read.repository");
let TripsService = class TripsService {
    trips;
    constructor(trips) {
        this.trips = trips;
    }
    async list(actor, page) {
        const access = (0, trip_read_policy_1.getTripReadAccess)(actor);
        if (!access)
            return { items: [], nextCursor: null };
        const rows = await this.trips.findPage(access, page);
        const items = rows.slice(0, page.limit);
        const last = items.at(-1);
        return {
            items,
            nextCursor: rows.length > page.limit && last
                ? (0, trip_pagination_1.encodeTripCursor)({ businessDate: last.businessDate, id: last.id })
                : null,
        };
    }
    async detail(actor, id) {
        const access = (0, trip_read_policy_1.getTripReadAccess)(actor);
        const trip = access ? await this.trips.findById(access, id) : null;
        // A foreign trip is indistinguishable from a nonexistent trip.
        if (!trip)
            throw new common_1.NotFoundException({
                code: "TRIP_NOT_FOUND",
                message: "Рейс не найден.",
            });
        return trip;
    }
};
exports.TripsService = TripsService;
exports.TripsService = TripsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [trip_read_repository_1.TripReadRepository])
], TripsService);
//# sourceMappingURL=trips.service.js.map