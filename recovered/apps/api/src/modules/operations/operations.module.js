"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationsModule = void 0;
const common_1 = require("@nestjs/common");
const identity_access_module_1 = require("../identity-access/identity-access.module");
const trip_read_repository_1 = require("./application/trip-read.repository");
const trips_service_1 = require("./application/trips.service");
const pg_trip_read_repository_1 = require("./infra/pg-trip-read.repository");
const trips_controller_1 = require("./interface/trips.controller");
let OperationsModule = class OperationsModule {
};
exports.OperationsModule = OperationsModule;
exports.OperationsModule = OperationsModule = __decorate([
    (0, common_1.Module)({
        imports: [identity_access_module_1.IdentityAccessModule],
        controllers: [trips_controller_1.TripsController],
        providers: [
            trips_service_1.TripsService,
            { provide: trip_read_repository_1.TripReadRepository, useClass: pg_trip_read_repository_1.PgTripReadRepository },
        ],
    })
], OperationsModule);
//# sourceMappingURL=operations.module.js.map