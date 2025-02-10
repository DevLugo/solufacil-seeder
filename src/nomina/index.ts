import { getEmployeeIdsMap } from "../leads";
import { ExcelRow } from "../loan/types";
import { prisma } from "../standaloneApp";
import { chunkArray, convertExcelDate } from "../utils";
import { ExcelExpensesRow, Expense } from "../expenses/types";
const xlsx = require('xlsx');

const expensesColumnsRelationship: ExcelExpensesRow = {
    'B': 'fullName',
    'C': 'date',
    'D': 'amount',
};

const extractNominaData = () => {
    const excelFilePath = './ruta2.xlsm';
    const tabName = 'NOMINA';

    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);

    // Obtener la hoja especificada
    const sheetNomina = workbook.Sheets[tabName];

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetNomina, { header: 1 });
    


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

const saveExpensesOnDB = async (data: Expense[], bankAccountId: string) => {
    const batches = chunkArray(data, 1000);
    
    const employeeIdsMap = await getEmployeeIdsMap();
    
    for (const batch of batches) {
        const transactionPromises = batch.map(item => {
            let accountId = bankAccountId;
            
            if (!accountId){
                /* console.log('NO HAY ACCOUNT ID', item); */
            }
            if(item.amount === undefined){
                /* console.log("NO HAY AMOUNT", item); */
                return;
            }

            return prisma.transaction.create({
                data: {
                    amount: item.amount.toString(),
                    date: item.date,
                    sourceAccountId: accountId,
                    description: String(item.description),
                    leadId: item.leadId ? employeeIdsMap[item.leadId] : undefined,
                    type: 'EXPENSE',
                    expenseSource: 'NOMINA_SALARY',
                }
            })});
        const cleanedData = transactionPromises.filter(e => e !== undefined);
        console.log('Saving expenses', cleanedData.length, cleanedData[0]);
        await prisma.$transaction(cleanedData);
    }
};

export const seedNomina = async (bankAccountId: string) => {
    const loanData = extractNominaData();
    
    if(bankAccountId){
        await saveExpensesOnDB(loanData, bankAccountId);
        console.log('Expenses seeded');
    }else{
        console.log('No se encontro la cuenta principal');
    }
};
