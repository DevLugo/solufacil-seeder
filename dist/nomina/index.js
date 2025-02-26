"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedNomina = void 0;
const leads_1 = require("../leads");
const standaloneApp_1 = require("../standaloneApp");
const utils_1 = require("../utils");
const xlsx = require('xlsx');
const expensesColumnsRelationship = {
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
    let loansData = data.slice(1).map((row) => {
        const obj = {};
        for (const [col, key] of Object.entries(expensesColumnsRelationship)) {
            const colIndex = xlsx.utils.decode_col(col);
            let value = row[colIndex];
            // Convertir fechas si es necesario
            if (key === 'date') {
                value = (0, utils_1.convertExcelDate)(value);
            }
            obj[key] = value;
        }
        return obj;
    });
    return loansData;
};
const saveExpensesOnDB = async (data, bankAccountId) => {
    const batches = (0, utils_1.chunkArray)(data, 1000);
    const employeeIdsMap = await (0, leads_1.getEmployeeIdsMap)();
    for (const batch of batches) {
        const transactionPromises = batch.map(item => {
            let accountId = bankAccountId;
            if (!accountId) {
                /* console.log('NO HAY ACCOUNT ID', item); */
            }
            if (item.amount === undefined) {
                /* console.log("NO HAY AMOUNT", item); */
                return;
            }
            return standaloneApp_1.prisma.transaction.create({
                data: {
                    amount: item.amount.toString(),
                    date: item.date,
                    sourceAccountId: accountId,
                    description: String(item.description),
                    leadId: item.leadId ? employeeIdsMap[item.leadId] : undefined,
                    type: 'EXPENSE',
                    expenseSource: 'NOMINA_SALARY',
                }
            });
        });
        const cleanedData = transactionPromises.filter(e => e !== undefined);
        console.log('Saving expenses', cleanedData.length, cleanedData[0]);
        await standaloneApp_1.prisma.$transaction(cleanedData);
    }
};
const seedNomina = async (bankAccountId) => {
    const loanData = extractNominaData();
    if (bankAccountId) {
        await saveExpensesOnDB(loanData, bankAccountId);
        console.log('Expenses seeded');
    }
    else {
        console.log('No se encontro la cuenta principal');
    }
};
exports.seedNomina = seedNomina;
