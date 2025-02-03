import { prisma } from "../standaloneApp";

export const seedAccounts = async () => {
    const mainAccount = await prisma.account.create({
        data: {
            name: 'Caja Merida',
            type: 'OFFICE_CASH_FUND',
            amount: "0",
        }
    });
};

