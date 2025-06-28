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
    const batches = chunkArray(data, 100);
    console.log(`Processing ${data.length} nomina entries in ${batches.length} batches`);
    
    const employeeIdsMap = await getEmployeeIdsMap();
    
    let processedCount = 0;
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const transactionPromises = batch.map(item => {
            let accountId = bankAccountId;
            
            if(item.amount === undefined){
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
        await prisma.$transaction(cleanedData);
        
        processedCount += batch.length;
        console.log(`✅ Nomina batch ${i + 1}/${batches.length} completed (${processedCount}/${data.length})`);
        
        // Liberar memoria cada 10 batches
        if (i % 10 === 0) {
            global.gc && global.gc();
        }
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
