"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedAccounts = void 0;
const standaloneApp_1 = require("../standaloneApp");
const seedAccounts = async () => {
    const mainAccount = await standaloneApp_1.prisma.account.create({
        data: {
            name: 'Caja Merida',
            type: 'OFFICE_CASH_FUND',
            amount: "0",
        }
    });
};
exports.seedAccounts = seedAccounts;
