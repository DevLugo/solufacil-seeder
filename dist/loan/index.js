"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedLoans = void 0;
const leads_1 = require("../leads");
const standaloneApp_1 = require("../standaloneApp");
const utils_1 = require("../utils");
const payments_1 = require("../payments");
const xlsx = require('xlsx');
const excelColumnsRelationship = {
    'A': 'id',
    'B': 'fullName',
    'C': 'givedDate',
    'D': 'status',
    'E': 'givedAmount',
    'F': 'requestedAmount',
    'G': 'noWeeks',
    'H': 'interestRate',
    'R': 'finished',
    'AA': 'finishedDate',
    'S': 'leadId',
    'AE': 'previousLoanId',
    'J': 'weeklyPaymentAmount',
    'I': 'amountToPay',
    'AB': 'avalName',
    'AC': 'avalPhone',
    'AD': 'titularPhone',
    'AP': 'badDebtDate',
};
const extractLoanData = () => {
    const excelFilePath = './ruta2.xlsm';
    const tabName = 'CREDITOS_OTORGADOS';
    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);
    // Obtener la hoja especificada
    const sheetLoans = workbook.Sheets[tabName];
    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetLoans, { header: 1 });
    let loansData = data.slice(1).map((row) => {
        const obj = {};
        for (const [col, key] of Object.entries(excelColumnsRelationship)) {
            const colIndex = xlsx.utils.decode_col(col);
            let value = row[colIndex];
            // Convertir fechas si es necesario
            if (key === 'givedDate' || key === 'finishedDate' || key === 'badDebtDate') {
                value = (0, utils_1.convertExcelDate)(value);
            }
            obj[key] = value;
        }
        return obj;
    });
    return loansData;
};
const saveDataToDB = async (loans, cashAccountId, bankAccount, payments) => {
    const renovatedLoans = loans.filter(item => item && item.previousLoanId !== undefined);
    const notRenovatedLoans = loans.filter(item => item && item.previousLoanId === undefined);
    console.log('renovatedLoans', renovatedLoans.length);
    console.log('notRenovatedLoans', notRenovatedLoans.length);
    //Create the loanTypes
    const fourteenWeeksId = await standaloneApp_1.prisma.loantype.create({
        data: {
            name: '14 semanas/40%',
            weekDuration: 14,
            rate: '0.4',
        }
    });
    const teennWeeksId = await standaloneApp_1.prisma.loantype.create({
        data: {
            name: '10 semanas/0%',
            weekDuration: 10,
            rate: '0',
        }
    });
    const groupedPayments = (0, utils_1.groupPaymentsByOldLoanId)(payments);
    const employeeIdsMap = await (0, leads_1.getEmployeeIdsMap)();
    if (!employeeIdsMap) {
        /*         console.log('NO EMPLOYEE IDS MAP'); */
        return;
    }
    // Batches razonables - optimizado para velocidad
    const batches = (0, utils_1.chunkArray)(notRenovatedLoans, 50);
    console.log(`Procesando ${notRenovatedLoans.length} préstamos NO renovados en ${batches.length} batches de 50`);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`Procesando batch de préstamos NO renovados ${batchIndex + 1}/${batches.length} (${batch.length} préstamos)`);
        const transactionPromises = batch.map(item => {
            if (!groupedPayments[item.id]) {
                console.log('No payments for loan', item.id);
                return;
            }
            return standaloneApp_1.prisma.loan.create({
                data: {
                    borrower: {
                        create: {
                            personalData: {
                                create: {
                                    fullName: String(item.fullName),
                                    phones: item.titularPhone && !["NA", "N/A", "N", undefined, "undefined", "PENDIENTE", ""].includes(item.titularPhone) ? {
                                        create: {
                                            number: item.titularPhone ? String(item.titularPhone) : ""
                                        }
                                    } : undefined,
                                }
                            },
                        },
                    },
                    loantype: {
                        connect: {
                            id: item.noWeeks === 14 ? fourteenWeeksId.id : teennWeeksId.id,
                        }
                    },
                    lead: {
                        connect: {
                            id: employeeIdsMap[item.leadId],
                        }
                    },
                    oldId: item.id.toString(),
                    badDebtDate: item.badDebtDate,
                    payments: {
                        create: groupedPayments[item.id].map(payment => {
                            const loanType = item.noWeeks === 14 ? fourteenWeeksId : teennWeeksId;
                            const baseProfit = Number(item.requestedAmount) * (loanType.rate ? Number(loanType.rate) : 0);
                            const rate = loanType.rate ? Number(loanType.rate) : 0;
                            const totalAmountToPay = Number(item.requestedAmount) + baseProfit;
                            const profitAmount = payment.amount * baseProfit / (totalAmountToPay);
                            if (["1873"].includes(item.id.toString())) {
                                /* console.log('================INICIANDO=================', item.id);
                                console.log("previousLoan", item.previousLoanId);
                                console.log("RATE", rate);
                                console.log('PROFIT BASE', baseProfit);
                                console.log('Payment PROFIT', profitAmount);
                                
                                console.log("PAYMENT AMOUNT", payment.amount);
                                console.log("payment  capital", payment.amount - profitAmount);
                                console.log('====FINALIZADO===', item.requestedAmount); */
                            }
                            return {
                                oldLoanId: String(item.id),
                                receivedAt: payment.paymentDate,
                                amount: payment.amount,
                                //profitAmounst: item.badDebtDate && payment.paymentDate > item.badDebtDate? payment.amount: profitAmount,
                                //returnToCapital: item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0:payment.amount - profitAmount,
                                type: payment.type,
                                transactions: {
                                    create: [{
                                            profitAmount: item.badDebtDate && payment.paymentDate > item.badDebtDate ? payment.amount : profitAmount,
                                            returnToCapital: item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0 : payment.amount - profitAmount,
                                            amount: payment.amount,
                                            date: payment.paymentDate,
                                            destinationAccountId: payment.description === 'DEPOSITO' ? bankAccount : cashAccountId,
                                            type: 'INCOME',
                                            incomeSource: payment.description === 'DEPOSITO' ? 'BANK_LOAN_PAYMENT' : 'CASH_LOAN_PAYMENT',
                                        }]
                                }
                            };
                        })
                    },
                    signDate: item.givedDate,
                    amountGived: item.givedAmount.toString(),
                    requestedAmount: item.requestedAmount.toString(),
                    avalName: item.avalName,
                    avalPhone: item.avalPhone && ["NA", "N/A", undefined, "undefined"].includes(item.avalPhone) ? "" : (item.avalPhone ? item.avalPhone.toString() : ""),
                    finishedDate: item.finishedDate,
                    profitAmount: item.noWeeks === 14 ? (item.requestedAmount * 0.4).toString() : '0',
                    transactions: {
                        create: [{
                                amount: item.givedAmount,
                                date: item.givedDate,
                                sourceAccountId: cashAccountId,
                                type: 'EXPENSE',
                                expenseSource: 'LOAN_GRANTED',
                            }]
                    }
                }
            });
        });
        const validPromises = transactionPromises.filter(item => item !== undefined);
        await standaloneApp_1.prisma.$transaction(validPromises);
        console.log(`Batch ${batchIndex + 1} de préstamos NO renovados completado: ${validPromises.length} préstamos creados`);
    }
    // Obtener los préstamos insertados y crear el mapa oldId => dbID
    console.log('Creando mapa de relaciones de forma eficiente...');
    // OPTIMIZACIÓN: En lugar de cargar toda la DB, usar solo los IDs necesarios
    const loanIdsMap = {};
    // Solo obtener los datos mínimos necesarios sin relaciones pesadas
    const basicLoans = await standaloneApp_1.prisma.loan.findMany({
        select: {
            id: true,
            oldId: true,
            borrowerId: true,
            profitAmount: true
        }
    });
    basicLoans.forEach((item) => {
        loanIdsMap[String(item?.oldId)] = {
            id: item.id,
            borrowerId: item.borrowerId ?? '',
            profitAmount: item.profitAmount?.toString() ?? '0',
            totalProfitPayed: 0, // Calculado después si es necesario
            pendingProfitToPay: Number(item.profitAmount) || 0,
        };
    });
    console.log("=====================renovatedLoans insert =====================");
    // OPTIMIZACIÓN 1: Precarga de todos los préstamos anteriores necesarios
    console.log('Precargando préstamos anteriores de forma eficiente...');
    const previousLoanIds = renovatedLoans
        .filter(item => item.previousLoanId !== undefined)
        .map(item => String(item.previousLoanId));
    // OPTIMIZACIÓN: Solo cargar datos esenciales, no todas las relaciones
    const previousLoansMap = await standaloneApp_1.prisma.loan.findMany({
        where: {
            oldId: { in: previousLoanIds }
        },
        select: {
            id: true,
            oldId: true,
            borrowerId: true,
            profitAmount: true
        }
    }).then(loans => loans.reduce((map, loan) => {
        map[loan.oldId] = loan;
        return map;
    }, {}));
    console.log(`Préstamos anteriores cargados: ${Object.keys(previousLoansMap).length}`);
    // OPTIMIZACIÓN 2: Procesar en batches con Promise.all
    const renovatedBatches = (0, utils_1.chunkArray)(renovatedLoans, 100); // Batches razonables para velocidad
    console.log(`Procesando ${renovatedLoans.length} préstamos renovados en ${renovatedBatches.length} batches`);
    for (let batchIndex = 0; batchIndex < renovatedBatches.length; batchIndex++) {
        const batch = renovatedBatches[batchIndex];
        console.log(`Procesando batch ${batchIndex + 1}/${renovatedBatches.length} (${batch.length} préstamos)`);
        const batchPromises = batch.map(async (item) => {
            if (!item.previousLoanId) {
                return null;
            }
            const previousLoan = previousLoansMap[String(item.previousLoanId)];
            if (!previousLoan) {
                console.log(`Préstamo anterior no encontrado para ID: ${item.previousLoanId}`);
                return null;
            }
            const loanType = item.noWeeks === 14 ? fourteenWeeksId : teennWeeksId;
            const rate = loanType.rate ? Number(loanType.rate) : 0;
            const previousLoanProfitAmount = previousLoan?.profitAmount ? Number(previousLoan.profitAmount) : 0;
            // OPTIMIZACIÓN: Simplificar cálculo de profit para evitar consultas complejas
            // En lugar de calcular profit pagado, usar el profit total pendiente
            const profitPendingFromPreviousLoan = previousLoanProfitAmount; // Simplificado
            const baseProfit = Number(item.requestedAmount) * rate;
            const profitAmount = baseProfit + Number(profitPendingFromPreviousLoan);
            if (["1338"].includes(item.id.toString())) {
                /* console.log('================INICIANDO=================', item.id);
                console.log("previousLoan", item.previousLoanId);
                
                console.log('====GANANCIA PAGADA DEL PRESTAMO PREVIO', 0); // Simplificado
                console.log('GANANCIA DE RENOVACION:', profitPendingFromPreviousLoan);
                console.log('PROFIT BASE', baseProfit);
                console.log('TOTAL PROFIT', profitAmount);
                console.log('====FINALIZADO===', item.requestedAmount); */
            }
            return standaloneApp_1.prisma.loan.create({
                data: {
                    oldId: item.id.toString(),
                    signDate: item.givedDate,
                    amountGived: item.givedAmount.toString(),
                    requestedAmount: item.requestedAmount.toString(),
                    badDebtDate: item.badDebtDate,
                    loantype: {
                        connect: {
                            id: item.noWeeks === 14 ? fourteenWeeksId.id : teennWeeksId.id,
                        },
                    },
                    lead: {
                        connect: {
                            id: employeeIdsMap[item.leadId],
                        }
                    },
                    avalName: item.avalName,
                    avalPhone: item.avalPhone && ["NA", "N/A", undefined, "undefined"].includes(item.avalPhone) ? "" : (item.avalPhone ? item.avalPhone.toString() : ""),
                    finishedDate: item.finishedDate,
                    borrower: previousLoan?.borrowerId ? {
                        connect: {
                            id: previousLoan.borrowerId,
                        }
                    } : undefined,
                    previousLoan: previousLoan ? {
                        connect: {
                            id: previousLoan.id,
                        }
                    } : undefined,
                    profitAmount: profitAmount.toString(),
                    payments: groupedPayments[item.id] ? {
                        create: groupedPayments[item.id].map(payment => {
                            const baseProfit = Number(item.requestedAmount) * rate;
                            const loanTotalProfit = baseProfit + profitPendingFromPreviousLoan;
                            const totalAmountToPay = Number(item.requestedAmount) + baseProfit;
                            const profitAmount = (payment.amount * loanTotalProfit) / Number(totalAmountToPay);
                            if (["3292"].includes(item.id.toString())) {
                                /* console.log('================INICIANDO=================', item.id);
                                console.log("previousLoan", item.previousLoanId);
                                console.log("profitPendingFromPreviousLoan", profitPendingFromPreviousLoan);
                                console.log('====loanTotalProfit', loanTotalProfit);
                                console.log('====totalAmountToPay', totalAmountToPay);
                                console.log('====profitAmount', profitAmount); */
                            }
                            return {
                                oldLoanId: String(item.id),
                                receivedAt: payment.paymentDate,
                                amount: payment.amount,
                                type: payment.type,
                                transactions: {
                                    create: [{
                                            profitAmount: item.badDebtDate && payment.paymentDate > item.badDebtDate ? payment.amount : profitAmount,
                                            returnToCapital: item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0 : payment.amount - profitAmount,
                                            amount: payment.amount,
                                            date: payment.paymentDate,
                                            destinationAccountId: payment.description === 'DEPOSITO' ? bankAccount : cashAccountId,
                                            type: 'INCOME',
                                            incomeSource: payment.description === 'DEPOSITO' ? 'BANK_LOAN_PAYMENT' : 'CASH_LOAN_PAYMENT',
                                        }]
                                }
                            };
                        })
                    } : undefined,
                    transactions: {
                        create: {
                            amount: item.givedAmount,
                            date: item.givedDate,
                            sourceAccountId: cashAccountId,
                            type: 'EXPENSE',
                            expenseSource: 'LOAN_GRANTED',
                        }
                    }
                }
            });
        });
        // Ejecutar el batch en paralelo y filtrar resultados nulos
        const batchResults = await Promise.all(batchPromises);
        const successfulCreations = batchResults.filter(result => result !== null);
        console.log(`Batch ${batchIndex + 1} completado: ${successfulCreations.length}/${batch.length} préstamos creados exitosamente`);
    }
    console.log("=====================");
    console.log("=====================");
    const totalGivedAmount = await standaloneApp_1.prisma.loan.aggregate({
        _sum: {
            amountGived: true,
        }
    });
    console.log('Total gived amount', totalGivedAmount);
    if (totalGivedAmount) {
        /* await prisma.transaction.create({
            data: {
                amount: totalGivedAmount?._sum.amountGived ? totalGivedAmount._sum.amountGived.toString() : "0",
                date: new Date(),
                sourceAccountId: accountId,
                type: 'LOAN',
            }
        }); */
    }
};
const seedLoans = async (cashAccountId, bankAccountId) => {
    const loanData = extractLoanData();
    const payments = (0, payments_1.extractPaymentData)();
    if (cashAccountId) {
        await saveDataToDB(loanData, cashAccountId, bankAccountId, payments);
        console.log('Loans seeded');
    }
    else {
        console.log('No se encontro la cuenta principal');
    }
};
exports.seedLoans = seedLoans;
