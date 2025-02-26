"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const utils_1 = require("./utils");
const loan_1 = require("./loan");
const expenses_1 = require("./expenses");
const account_1 = require("./account");
const leads_1 = require("./leads");
const month_1 = require("./report/month");
const nomina_1 = require("./nomina");
exports.prisma = new client_1.PrismaClient();
async function main() {
    //TODO: handle the bak deposits
    await (0, utils_1.cleanUpDb)();
    await (0, account_1.seedAccounts)();
    const route2CashAccount = await exports.prisma.route.create({
        data: {
            name: 'Ruta 2',
            account: {
                create: {
                    name: 'Ruta 2 Caja',
                    type: 'EMPLOYEE_CASH_FUND',
                    amount: "0",
                }
            }
        },
        include: {
            account: true,
        }
    });
    const route2BankAccount = await exports.prisma.route.create({
        data: {
            name: 'Ruta 2',
            account: {
                create: {
                    name: 'Ruta 2 Banco',
                    type: 'BANK',
                    amount: "0",
                }
            }
        },
        include: {
            account: true,
        }
    });
    if (route2CashAccount.account?.id && route2BankAccount.account?.id) {
        await (0, leads_1.seedLeads)(route2CashAccount.id);
        await (0, loan_1.seedLoans)(route2CashAccount.account?.id, route2BankAccount.account?.id);
        await (0, expenses_1.seedExpenses)(route2CashAccount.account?.id, route2BankAccount.account?.id);
        await (0, nomina_1.seedNomina)(route2BankAccount.account?.id);
        //await seedPayments(route2.id);
        //TODO: save comision and earned amount on payments
        console.log('Datos guardados en la base de datos');
        const yearResume = await (0, month_1.getYearResume)(route2CashAccount.account?.id ?? '', route2BankAccount.account?.id, 2024);
        console.table(yearResume);
        //console.table(monthResume);
        let totalAnnualBalance = 0;
        let totalAnnualBalanceWithReinvest = 0;
        for (const month of Object.keys(yearResume)) {
            totalAnnualBalance += yearResume[month].balance || 0;
            totalAnnualBalanceWithReinvest += yearResume[month].balanceWithReinvest || 0;
        }
        console.log('Total Annual Balance 2024:', totalAnnualBalance);
        console.log('Total Annual Balance with Reinvest 2024:', totalAnnualBalanceWithReinvest);
        const yearResume2023 = await (0, month_1.getYearResume)(route2CashAccount.account?.id ?? '', route2BankAccount.account?.id, 2023);
        console.table(yearResume2023);
        let totalAnnualBalance23 = 0;
        let totalAnnualBalanceWithReinvest23 = 0;
        for (const month of Object.keys(yearResume2023)) {
            totalAnnualBalance23 += yearResume2023[month].balance || 0;
            totalAnnualBalanceWithReinvest23 += yearResume2023[month].balanceWithReinvest || 0;
        }
        console.log('Total Annual Balance 2023:', totalAnnualBalance23);
        console.log('Total Annual Balance with Reinvest 2023:', totalAnnualBalanceWithReinvest23);
        return yearResume;
        //return;
    }
}
main()
    .catch(e => {
    console.error(e);
})
    .finally(async () => {
    await exports.prisma.$disconnect();
});
