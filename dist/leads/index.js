"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLoanIdsMap = exports.getEmployeeIdsMap = exports.seedLeads = void 0;
const standaloneApp_1 = require("../standaloneApp");
const utils_1 = require("../utils");
const seedLeads = async (routeId) => {
    for (const e of utils_1.leads) {
        await standaloneApp_1.prisma.employee.create({
            data: {
                routes: {
                    connect: {
                        id: routeId,
                    }
                },
                oldId: e[1].toString(),
                personalData: {
                    create: {
                        fullName: e[0]
                    }
                },
                type: 'LEAD',
            }
        });
    }
    ;
};
exports.seedLeads = seedLeads;
const getEmployeeIdsMap = async () => {
    const employeeIdsMap = {};
    const employeesFromDb = await standaloneApp_1.prisma.employee.findMany({});
    employeesFromDb.forEach((e, idx) => {
        employeeIdsMap[utils_1.leads[idx][1]] = e.id;
    });
    return employeeIdsMap;
};
exports.getEmployeeIdsMap = getEmployeeIdsMap;
const getLoanIdsMap = async (routeId) => {
    const loanIdsMap = {};
    const loansFromDb = await standaloneApp_1.prisma.loan.findMany({
        include: {
            loantype: true,
        }
    });
    loansFromDb.forEach((l) => {
        if (l.oldId) {
            loanIdsMap[l.oldId] = {
                totalProfit: l.loantype ? Number(l.requestedAmount) * Number(l.loantype.rate) : undefined,
                id: l.id,
                weeks: l.loantype?.weekDuration ?? undefined,
                rate: l.loantype ? (l.loantype.rate !== null ? Number(l.loantype.rate) : undefined) : undefined,
                totalAmountToPay: Number(l.requestedAmount) + (l.profitAmount !== null ? Number(l.profitAmount) : 0)
            };
        }
    });
    return loanIdsMap;
};
exports.getLoanIdsMap = getLoanIdsMap;
