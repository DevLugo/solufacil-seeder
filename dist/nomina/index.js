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
    const batches = (0, utils_1.chunkArray)(data, 100);
    console.log(`Processing ${data.length} nomina entries in ${batches.length} batches`);
    const employeeIdsMap = await (0, leads_1.getEmployeeIdsMap)();
    let processedCount = 0;
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const transactionPromises = batch.map(item => {
            let accountId = bankAccountId;
            if (item.amount === undefined) {
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
        await standaloneApp_1.prisma.$transaction(cleanedData);
        processedCount += batch.length;
        console.log(`✅ Nomina batch ${i + 1}/${batches.length} completed (${processedCount}/${data.length})`);
        // Liberar memoria cada 10 batches
        if (i % 10 === 0) {
            global.gc && global.gc();
        }
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
