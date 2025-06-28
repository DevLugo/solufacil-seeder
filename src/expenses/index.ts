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
    const sheetExpenses = workbook.Sheets[tabName];

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetExpenses, { header: 1 });
    


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

const saveExpensesOnDB = async (data: Expense[], cashAcountId: string, bankAccountId: string) => {
    const batches = chunkArray(data, 100);
    console.log(`Processing ${data.length} expenses in ${batches.length} batches`);
    
    const employeeIdsMap = await getEmployeeIdsMap();
    
    let processedCount = 0;
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const transactionPromises = batch.map(item => {
            let accountId;
            if (item.accountType === 'GASTO BANCO' || item.accountType === 'CONNECT') {
                accountId = bankAccountId;
            } else if (item.accountType === 'GASTO') {
                accountId = cashAcountId;
            } else {
                accountId = cashAcountId;
            }

            if(item.amount === undefined){
                return;
            }
            
            return prisma.transaction.create({
                data: {
                    amount: item.amount.toString(),
                    date: item.date,
                    sourceAccount: {
                        connect: {
                            id: accountId,
                        }
                    },
                    description: String(item.description),
                    lead: item.leadId && employeeIdsMap[item.leadId] ? {
                        connect: {
                            id: employeeIdsMap[item.leadId],
                        }
                    } : undefined,
                    type: 'EXPENSE',
                    expenseSource: item.description === "VIATICOS"? "VIATIC": item.description === "SUELDO" ? "EXTERNAL_SALARY" : null,
                }
            })});
        const cleanedData = transactionPromises.filter(e => e !== undefined);
        await prisma.$transaction(cleanedData);
        
        processedCount += batch.length;
        console.log(`✅ Expenses batch ${i + 1}/${batches.length} completed (${processedCount}/${data.length})`);
        
        // Liberar memoria cada 10 batches
        if (i % 10 === 0) {
            global.gc && global.gc();
        }
    }
};

export const seedExpenses = async (accountId: string, bankAccountId: string) => {
    const loanData = extractExpensesData();
    
    if(accountId){
        await saveExpensesOnDB(loanData, accountId, bankAccountId);
        console.log('Expenses seeded');
    }else{
        console.log('No se encontro la cuenta principal');
    }
};
