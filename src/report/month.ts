import { prisma } from "../standaloneApp"

export const  getTotalsByRoute = async (cashAccountId: string, bankAccountId: string, startDate: Date, endDate: Date) => {
    const accounts = [cashAccountId, bankAccountId].filter(Boolean);
    console.log(accounts);
    const expenses = await prisma.transaction.findMany({
        where: {
            //sourceAccountId: bankAccountId,
            sourceAccountId: {
                in: accounts
            },
            type: 'EXPENSE',
            expenseSource: { equals: null },
            date: {
                gte: startDate,
                lte: endDate,
            },
        },
        select: {
            amount: true
        }
    });

    console.log("Expenses", expenses);
    const nomina = await prisma.transaction.findMany({
        where: {
            sourceAccountId: {
                in: accounts
            },
            type: 'EXPENSE',
            expenseSource: 'NOMINA_SALARY',
            date: {
                gte: startDate,
                lte: endDate,
            },
        },
        select: {
            amount: true
        }
    });
    const incomes = await prisma.transaction.findMany({
        where: {
            destinationAccountId: {
                in: accounts
            },
            type: 'INCOME',
            incomeSource: 'LOAN_PAYMENT',
            date: {
                gte: startDate,
                lte: endDate,
            },
        },
        select: {
            amount: true,
            loanPayment: true
        }
    });
    console.log("Incomes", incomes);

    const totalExpenses = expenses.reduce((acc, { amount }) => acc + Number(amount), 0);
    const totalIncomes = incomes.reduce((acc, { loanPayment }) => acc + Number(loanPayment?.profitAmount), 0);
    const totalNomina = nomina.reduce((acc, { amount }) => acc + Number(amount), 0);
    const balance = totalIncomes - (totalExpenses + totalNomina);
    const totalExpensesAndNomina = totalExpenses + totalNomina;
    return {
        totalExpenses,
        totalIncomes,
        totalNomina,
        balance,
        totalExpensesAndNomina
    };

}


export const getYearResume = async (cashAccountId: string, bankAccountId: string, year: number) => {
    const accounts = [cashAccountId, bankAccountId].filter(Boolean);
    

    const transactions = await prisma.transaction.findMany({
        where: {
            OR: [
                { sourceAccountId: { in: accounts } },
                { destinationAccountId: { in: accounts } }
            ],
            date: {
                gte: new Date(`${year}-01-01`),
                lte: new Date(`${year}-12-31`),
            },
        },
        select: {
            amount: true,
            type: true,
            date: true,
            expenseSource: true,
            incomeSource: true,
            loanPayment: true
        }
    });

    // Agrupar los pagos por mes
    const totalsByMonth = transactions.reduce((acc, transaction) => {
        const month = transaction.date ? transaction.date.getMonth() + 1 : 0; // Obtener el mes (0-11) y ajustar a 1-12
        const year = transaction.date ? transaction.date.getFullYear() : 0;
        const key = `${year}-${month.toString().padStart(2, '0')}`; // Crear una clave de año-mes
        if (!acc[key]) {
            acc[key] = { totalExpenses: 0, totalIncomes: 0, totalNomina: 0, balance: 0, reInvertido: 0, balanceWithReinvest: 0, totalCash: 0 };
        }


        if (transaction.type === 'EXPENSE' && transaction.expenseSource === null) {
            acc[key].totalExpenses += Number(transaction.amount);
        } else if (transaction.type === 'EXPENSE' && transaction.expenseSource === 'NOMINA_SALARY') {
            acc[key].totalNomina += Number(transaction.amount);
        } else if (
            transaction.type === 'INCOME' && 
            transaction.incomeSource === 'CASH_LOAN_PAYMENT' ||
            transaction.incomeSource === 'BANK_LOAN_PAYMENT'
        ) {
            acc[key].totalIncomes += Number(transaction.loanPayment?.profitAmount);
        } else if(transaction.type === 'EXPENSE' && transaction.expenseSource === 'LOAN_GRANTED'){
            acc[key].reInvertido += Number(transaction.amount);
        }
        if(transaction.type === 'EXPENSE'){
            acc[key].totalCash -= Number(transaction.amount);
        } else if(transaction.type === 'INCOME'){
            acc[key].totalCash += Number(transaction.amount);
        }
        acc[key].balance = acc[key].totalIncomes - (acc[key].totalExpenses + acc[key].totalNomina);
        
        return acc;
    }, {} as { [key: string]: { totalExpenses: number, totalIncomes: number, totalNomina: number, balance: number, reInvertido: number, balanceWithReinvest: number, totalCash:number } });
    //calculate the balance with reinvested money and add it to each key
    
    for (const key in totalsByMonth) {
        const balanceWithReinvest = totalsByMonth[key].reInvertido;
        totalsByMonth[key].balanceWithReinvest = totalsByMonth[key].balance - balanceWithReinvest;
    }

    // Ordenar los resultados por mes
    const sortedTotalsByMonth = Object.keys(totalsByMonth)
        .sort()
        .reduce((acc, key) => {
            acc[key] = totalsByMonth[key];
            return acc;
        }, {} as { [key: string]: { totalExpenses: number, totalIncomes: number, totalNomina: number, balance: number, reInvertido: number, balanceWithReinvest: number, totalCash:number } });

    return sortedTotalsByMonth;
}