import { getEmployeeIdsMap } from "../leads";
import { ExcelRow } from "../loan/types";
import { prisma } from "../standaloneApp";
import { chunkArray, convertExcelDate } from "../utils";
import { ExcelExpensesRow, Expense } from "./types";
const xlsx = require('xlsx');

const expensesColumnsRelationship: ExcelExpensesRow = {
    'B': 'fullName',
    'C': 'date',
    'D': 'amount',
    'K': 'leadId',
    'E': 'accountType',
    'M': 'description',
};

const extractExpensesData = () => {
    const excelFilePath = './ruta2.xlsm';
    const tabName = 'GASTOS';

    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);

    // Obtener la hoja especificada
    const sheetLoans = workbook.Sheets[tabName];
    const sheetExpenses = workbook.Sheets[tabName];

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetLoans, { header: 1 });
    


    let loansData: Expense[] = data.slice(1).map((row: ExcelRow) => {
        const obj: Partial<Expense> = {};
        for (const [col, key] of Object.entries(expensesColumnsRelationship)) {
            const colIndex = xlsx.utils.decode_col(col);
            let value = row[colIndex];
            // Convertir fechas si es necesario
            if (key === 'date') {
                value = convertExcelDate(value);
            }
            obj[key] = value;
        }
        return obj as Expense;
    });
    return loansData;
};

const saveExpensesOnDB = async (data: Expense[], accountId: string) => {
    const batches = chunkArray(data, 1000);
    const route2Account = await prisma.route.findFirst({
        where: {
            name: 'Ruta 2',
        },
        include: {
            account: true,
        }
    });
    const route2AccountId = route2Account?.account?.id;
    const mainAccount = await prisma.account.findFirst({
        where: {
            name: 'Caja Merida',
        }
    });
    const bankAccount = await prisma.account.create({
        data: {
            name: 'Bank',
            type: 'BANK',
            amount: "0",
        },
    });
    const employeeIdsMap = await getEmployeeIdsMap();
    
    for (const batch of batches) {
        const transactionPromises = batch.map(item => {
            let accountId;
            if (item.accountType === 'GASTO BANCO' || item.accountType === 'CONNECT') {
                accountId = bankAccount.id;
            } else if (item.accountType === 'GASTO') {
                accountId = mainAccount?.id;
            } else {
                accountId = mainAccount?.id;
            }
            if (!accountId)
                console.log('NO HAY ACCOUNT ID', item);

            if(item.amount === undefined){
                console.log("NO HAY AMOUNT", item);
                return;
            }

            return prisma.transaction.create({
                data: {
                    amount: item.amount.toString(),
                    date: item.date,
                    /* sourceAccount: {
                        connect: {
                            id: accountId,
                        }
                    }, */
                    sourceAccountId: accountId,
                    description: String(item.description),
                    /* lead: item.leadId ? {
                        connect: {
                            id: employeeIdsMap[item.leadId],
                        }
                    } : undefined, */
                     leadId: item.leadId ? employeeIdsMap[item.leadId] : undefined,
                    type: 'EXPENSE',
                }
            })});
        const cleanedData = transactionPromises.filter(e => e !== undefined);
        await prisma.$transaction(cleanedData);
    }
};

export const seedExpenses = async () => {
    const loanData = extractExpensesData();
    const mainAccount = await prisma.account.findFirst({
        where: {
            name: 'Caja Merida',
        }
    });
    if(mainAccount){
        await saveExpensesOnDB(loanData, mainAccount?.id);
        console.log('Expenses seeded');
    }else{
        console.log('No se encontro la cuenta principal');
    }
};
