import { PrismaClient } from '@prisma/client';
import { cleanUpDb } from './utils';
import { seedLoans } from './loan';
import { seedExpenses } from './expenses';
import { seedAccounts } from './account';
import { seedLeads } from './leads';
import { seedPayments } from './payments';

export const prisma = new PrismaClient();


async function main() {
    await cleanUpDb();
    await seedAccounts();
    const route2 = await prisma.route.create({
            data: {
                name: 'Ruta 2',
                account: {
                    create: {
                        name: 'Ruta 2',
                        type: 'EMPLOYEE_CASH_FUND',
                        amount: "0",
                    }
                }
            }
        });
    await seedLeads(route2.id);
    await seedLoans();
    await seedExpenses();
    //await seedPayments(route2.id);
    //TODO: save comision and earned amount on payments
    console.log('Datos guardados en la base de datos');
    return;
}

main()
    .catch(e => {
        console.error(e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });