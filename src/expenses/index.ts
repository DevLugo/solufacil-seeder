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

const extractExpensesData = (excelFileName: string) => {
    const excelFilePath = excelFileName;
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

const saveExpensesOnDB = async (data: Expense[], cashAcountId: string, bankAccountId: string, snapshotData: {
    routeId: string;
    routeName: string;
    locationId: string;
    locationName: string;
    leadId: string;
    leadName: string;
    leadAssignedAt: Date;
}, leadMapping?: { [oldId: string]: string }) => {
    const batches = chunkArray(data, 1000);
    
    // Usar leadMapping si está disponible, sino usar employeeIdsMap como fallback
    let employeeIdsMap: { [key: string]: string } = {};
    if (leadMapping) {
        employeeIdsMap = leadMapping;
    } else {
        employeeIdsMap = await getEmployeeIdsMap();
    }
    
    for (const batch of batches) {
        const transactionPromises = batch.map(item => {
            let accountId;
            if (item.accountType === 'GASTO BANCO' || item.accountType === 'CONNECT') {
                accountId = bankAccountId;
            } else if (item.accountType === 'GASTO') {
                accountId = cashAcountId;
            } else {
                accountId = cashAcountId;
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

                    // snapshotLeadId no existe en Transaction, se omite
                }
            })});
        const cleanedData = transactionPromises.filter(e => e !== undefined);
        /* console.log('Saving expenses', cleanedData.length, cleanedData[0]); */
        await prisma.$transaction(cleanedData);
    }
};

export const seedExpenses = async (accountId: string, bankAccountId: string, snapshotData: {
    routeId: string;
    routeName: string;
    locationId: string;
    locationName: string;
    leadId: string;
    leadName: string;
    leadAssignedAt: Date;
}, excelFileName: string, leadMapping?: { [oldId: string]: string }) => {
    const loanData = extractExpensesData(excelFileName);
    
    if(accountId){
        await saveExpensesOnDB(loanData, accountId, bankAccountId, snapshotData, leadMapping);
        console.log('Expenses seeded');
    }else{
        console.log('No se encontro la cuenta principal');
    }
};
