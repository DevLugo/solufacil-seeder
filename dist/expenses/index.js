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
const extractExpensesData = (excelFileName) => {
    const excelFilePath = excelFileName;
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
const saveExpensesOnDB = async (data, cashAcountId, bankAccountId, tokaAccountId, connectAccountId, snapshotData, routeId, leadMapping) => {
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
            let accountId;
            if (item.accountType === "GASTO BANCO" && item.description === "TOKA") {
                accountId = tokaAccountId;
            }
            else if (item.accountType === "GASTO BANCO" && item.description === "CONNECT") {
                accountId = connectAccountId;
            }
            else if (item.accountType === 'GASTO BANCO') {
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
                return;
            }
            //console.log('ROUTE ID', routeId);
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
                    route: {
                        connect: {
                            id: routeId,
                        }
                    },
                    expenseSource: (() => {
                        if (item.description === "GASOLINA" || item.description === "TOKA") {
                            return "GASOLINE";
                        }
                        if (item.description === "CONNECT")
                            return "TRAVEL_EXPENSES";
                        if (item.accountType === "COMISION")
                            return "LOAN_PAYMENT_COMISSION";
                        if (item.accountType === "GASTO BANCO")
                            return "BANK_EXPENSE";
                        if (item.accountType === "GASTO SOCIO")
                            return "EMPLOYEE_EXPENSE";
                        /* if (item.description === "VIATICOS") return "VIATIC"; */
                        /* if (item.description === "SUELDO") return "EXTERNAL_SALARY"; */
                        return "GENERAL_EXPENSE";
                    })(),
                    // snapshotLeadId no existe en Transaction, se omite
                }
            });
        });
        const cleanedData = transactionPromises.filter(e => e !== undefined);
        await standaloneApp_1.prisma.$transaction(cleanedData);
    }
};
const seedExpenses = async (accountId, bankAccountId, tokaAccountId, connectAccountId, snapshotData, excelFileName, routeId, leadMapping) => {
    const loanData = extractExpensesData(excelFileName);
    if (accountId) {
        await saveExpensesOnDB(loanData, accountId, bankAccountId, tokaAccountId, connectAccountId, snapshotData, routeId, leadMapping);
        //PRINT TOTAL EXPENSES AND TOTAL SUM OF EXPENSES FROM DB
        const totalExpenses = await standaloneApp_1.prisma.transaction.count({
            where: {
                type: 'EXPENSE',
            }
        });
        const totalSumOfExpenses = await standaloneApp_1.prisma.transaction.aggregate({
            _sum: {
                amount: true,
            }
        });
        console.log('Total sum of expenses', totalSumOfExpenses);
    }
    else {
        console.log('No se encontro la cuenta principal');
    }
};
exports.seedExpenses = seedExpenses;
