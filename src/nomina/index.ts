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
    'D': 'description',
    'E': 'leadId',
    'F': 'accountType',
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
    
    console.log('DATA', data.slice(0, 5));

    // Encontrar la fila de encabezados (primera fila con datos)
    let headerRowIndex = 0;
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (row && row.some((cell: any) => cell && typeof cell === 'string' && cell.includes('NOMBRE'))) {
            headerRowIndex = i;
            break;
        }
    }

    console.log('Header row index:', headerRowIndex);
    console.log('Header row:', data[headerRowIndex]);

    // Encontrar los índices de las columnas basándose en los encabezados
    const headerRow = data[headerRowIndex];
    const columnIndexes = {
        fullName: -1,
        date: -1,
        amount: -1,
        description: -1,
        leadId: -1,
        accountType: -1
    };

    for (let i = 0; i < headerRow.length; i++) {
        const cell: any = headerRow[i];
        if (cell) {
            const cellStr = String(cell).toLowerCase();
            if (cellStr.includes('nombre')) columnIndexes.fullName = i;
            else if (cellStr.includes('fecha') || cellStr.includes('pago')) columnIndexes.date = i;
            else if (cellStr.includes('cantidad')) columnIndexes.amount = i;
            else if (cellStr.includes('origen') || cellStr.includes('infonavit') || cellStr.includes('imss')) columnIndexes.description = i;
            else if (cellStr.includes('cuenta') || cellStr.includes('bbva')) columnIndexes.accountType = i;
        }
    }

    console.log('Column indexes found:', columnIndexes);

    // Verificar que encontramos las columnas necesarias
    if (columnIndexes.fullName === -1 || columnIndexes.date === -1 || columnIndexes.amount === -1) {
        console.error('❌ No se pudieron encontrar las columnas necesarias:', columnIndexes);
        throw new Error('Estructura del Excel no válida');
    }

    let expensesData: Expense[] = data.slice(headerRowIndex + 1).map((row: ExcelRow) => {
        const obj: Partial<Expense> = {};
        
        if (columnIndexes.fullName !== -1) obj.fullName = row[columnIndexes.fullName];
        if (columnIndexes.date !== -1) {
            const dateValue = convertExcelDate(row[columnIndexes.date]);
            if (dateValue) obj.date = dateValue;
        }
        if (columnIndexes.amount !== -1) obj.amount = row[columnIndexes.amount];
        if (columnIndexes.description !== -1) obj.description = row[columnIndexes.description];
        if (columnIndexes.leadId !== -1) obj.leadId = row[columnIndexes.leadId];
        if (columnIndexes.accountType !== -1) obj.accountType = row[columnIndexes.accountType];
        
        return obj as Expense;
    });

    // Filtrar filas vacías
    expensesData = expensesData.filter(row => row.fullName && row.amount);
    
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
}, routeId: string, leadMapping?: { [oldId: string]: string }) => {
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
                    routeId: routeId,
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
}, excelFileName: string, routeId: string, leadMapping?: { [oldId: string]: string },) => {
    const nominaData = extractNominaData(excelFileName);
    console.log('NOMINA DATA', nominaData.length);
    console.log('NOMINA DATA', nominaData.slice(0, 5));
    if(bankAccountId){
        await saveExpensesOnDB(nominaData, bankAccountId, snapshotData, routeId, leadMapping);
        const totalExpenses = await prisma.transaction.count({
            where: {
                type: 'EXPENSE',
            }
        });
        console.log('Total NOMINA', totalExpenses);

        const totalSumOfExpenses = await prisma.transaction.aggregate({
            _sum: {
                amount: true,
            }
        });
        console.log('Total sum of NOMINA', totalSumOfExpenses);
        console.log('NOMINA seeded');
    }else{
        console.log('No se encontro la cuenta principal');
    }
};
