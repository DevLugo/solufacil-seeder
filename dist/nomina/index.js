"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedNomina = void 0;
const leads_1 = require("../leads");
const standaloneApp_1 = require("../standaloneApp");
const utils_1 = require("../utils");
const xlsx = require('xlsx');
const expensesColumnsRelationship = {
    'A': 'fullName',
    'B': 'date',
    'C': 'amount',
};
const extractNominaData = (excelFileName) => {
    const excelFilePath = excelFileName;
    const tabName = 'NOMINA';
    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);
    // Obtener la hoja especificada
    const sheetNomina = workbook.Sheets[tabName];
    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetNomina, { header: 1 });
    let expensesData = data.slice(1).map((row) => {
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
    return expensesData;
};
const saveExpensesOnDB = async (data, bankAccountId, snapshotData, routeId, leadMapping) => {
    const batches = (0, utils_1.chunkArray)(data, 1000);
    // Usar leadMapping si está disponible, sino usar employeeIdsMap como fallback
    let employeeIdsMap = {};
    if (leadMapping) {
        employeeIdsMap = leadMapping;
    }
    else {
        employeeIdsMap = await (0, leads_1.getEmployeeIdsMap)();
    }
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
                    routeId: routeId,
                    // snapshotLeadId no existe en Transaction, se omite
                }
            });
        });
        const cleanedData = transactionPromises.filter(e => e !== undefined);
        console.log('Saving expenses', cleanedData.length, cleanedData[0]);
        await standaloneApp_1.prisma.$transaction(cleanedData);
    }
};
const seedNomina = async (bankAccountId, snapshotData, excelFileName, routeId, leadMapping) => {
    const loanData = extractNominaData(excelFileName);
    console.log('NOMINA DATA', loanData.length);
    if (bankAccountId) {
        await saveExpensesOnDB(loanData, bankAccountId, snapshotData, routeId, leadMapping);
        const totalExpenses = await standaloneApp_1.prisma.transaction.count({
            where: {
                type: 'EXPENSE',
            }
        });
        console.log('Total NOMINA', totalExpenses);
        const totalSumOfExpenses = await standaloneApp_1.prisma.transaction.aggregate({
            _sum: {
                amount: true,
            }
        });
        console.log('Total sum of NOMINA', totalSumOfExpenses);
        console.log('NOMINA seeded');
    }
    else {
        console.log('No se encontro la cuenta principal');
    }
};
exports.seedNomina = seedNomina;
