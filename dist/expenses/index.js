"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedExpenses = void 0;
const leads_1 = require("../leads");
const standaloneApp_1 = require("../standaloneApp");
const utils_1 = require("../utils");
const xlsx = require('xlsx');
const expensesColumnsRelationship = {
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
const saveExpensesOnDB = async (data, cashAcountId, bankAccountId) => {
    const batches = (0, utils_1.chunkArray)(data, 1000);
    const employeeIdsMap = await (0, leads_1.getEmployeeIdsMap)();
    for (const batch of batches) {
        const transactionPromises = batch.map(item => {
            let accountId;
            if (item.accountType === 'GASTO BANCO' || item.accountType === 'CONNECT') {
                accountId = bankAccountId;
            }
            else if (item.accountType === 'GASTO') {
                accountId = cashAcountId;
            }
            else {
                accountId = cashAcountId;
            }
            if (!accountId)
                console.log('NO HAY ACCOUNT ID', item);
            if (item.amount === undefined) {
                console.log("NO HAY AMOUNT", item);
                return;
            }
            return standaloneApp_1.prisma.transaction.create({
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
                    expenseSource: item.description === "VIATICOS" ? "VIATIC" : item.description === "SUELDO" ? "EXTERNAL_SALARY" : null,
                }
            });
        });
        const cleanedData = transactionPromises.filter(e => e !== undefined);
        /* console.log('Saving expenses', cleanedData.length, cleanedData[0]); */
        await standaloneApp_1.prisma.$transaction(cleanedData);
    }
};
const seedExpenses = async (accountId, bankAccountId) => {
    const loanData = extractExpensesData();
    if (accountId) {
        await saveExpensesOnDB(loanData, accountId, bankAccountId);
        console.log('Expenses seeded');
    }
    else {
        console.log('No se encontro la cuenta principal');
    }
};
exports.seedExpenses = seedExpenses;
