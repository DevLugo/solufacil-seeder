import { PrismaClient } from '@prisma/client';
import { cleanUpDb } from './utils';
import { seedLoans } from './loan';
import { seedExpenses } from './expenses';
import { seedAccounts } from './account';
import { seedLeads } from './leads';
import { getYearResume } from './report/month';
import { seedNomina } from './nomina';

export const prisma = new PrismaClient();


async function main() {

    //TODO: handle the bak deposits


    await cleanUpDb();
    await seedAccounts();
    const route2CashAccount = await prisma.route.create({
        data: {
            name: 'Ruta 2',
            accounts: {
                create: {
                    name: 'Ruta 2 Caja',
                    type: 'EMPLOYEE_CASH_FUND',
                    amount: "0",
                }
            }
        },
        include: {
            accounts: true,
        }
    });
    const route2BankAccount = await prisma.route.create({
        data: {
            name: 'Ruta 2',
            accounts: {
                create: {
                    name: 'Ruta 2 Banco',
                    type: 'BANK',
                    amount: "0",
                }
            }
        },
        include: {
            accounts: true,
        }
    });
    if (route2CashAccount.accounts?.[0]?.id && route2BankAccount.accounts?.[0]?.id) {
        await seedLeads(route2CashAccount.id);
        await seedLoans(route2CashAccount.accounts[0].id, route2BankAccount.accounts[0].id);
        await seedExpenses(route2CashAccount.accounts[0].id, route2BankAccount.accounts[0].id);
        await seedNomina(route2BankAccount.accounts[0].id);
        //await seedPayments(route2.id);
        //TODO: save comision and earned amount on payments
        console.log('Datos guardados en la base de datos');
        const yearResume = await getYearResume(
            route2CashAccount.accounts[0].id ?? '',
            route2BankAccount.accounts[0].id,
            2024
        );
        
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

        const yearResume2023 = await getYearResume(
            route2CashAccount.accounts[0].id ?? '',
            route2BankAccount.accounts[0].id,
            2023
        );
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
        await prisma.$disconnect();
    });