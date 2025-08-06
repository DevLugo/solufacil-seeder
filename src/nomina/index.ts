import { getEmployeeIdsMap } from "../leads";
import { ExcelRow } from "../loan/types";
import { prisma } from "../standaloneApp";
import { chunkArray, convertExcelDate } from "../utils";
import { ExcelExpensesRow, Expense } from "../expenses/types";
const xlsx = require('xlsx');

const expensesColumnsRelationship: ExcelExpensesRow = {
    'A': 'fullName',
    'B': 'date',
    'C': 'amount',
};

const extractNominaData = (excelFileName: string) => {
    const excelFilePath = excelFileName;
    const tabName = 'NOMINA';

    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);

    // Obtener la hoja especificada
    const sheetNomina = workbook.Sheets[tabName];

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetNomina, { header: 1 });
    


    let expensesData: Expense[] = data.slice(1).map((row: ExcelRow) => {
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
    return expensesData;
};

const saveExpensesOnDB = async (data: Expense[], bankAccountId: string, snapshotData: {
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
                    // snapshotLeadId no existe en Transaction, se omite
                }
            })});
        const cleanedData = transactionPromises.filter(e => e !== undefined);
        console.log('Saving expenses', cleanedData.length, cleanedData[0]);
        await prisma.$transaction(cleanedData);
    }
};

export const seedNomina = async (bankAccountId: string, snapshotData: {
    routeId: string;
    routeName: string;
    locationId: string;
    locationName: string;
    leadId: string;
    leadName: string;
    leadAssignedAt: Date;
}, excelFileName: string, leadMapping?: { [oldId: string]: string }) => {
    const loanData = extractNominaData(excelFileName);
    
    if(bankAccountId){
        await saveExpensesOnDB(loanData, bankAccountId, snapshotData, leadMapping);
        console.log('Expenses seeded');
    }else{
        console.log('No se encontro la cuenta principal');
    }
};
