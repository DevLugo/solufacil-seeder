import { getEmployeeIdsMap } from "../leads";
import { prisma } from "../standaloneApp";
import { chunkArray, convertExcelDate, groupPaymentsByOldLoanId, leads } from "../utils";
import { ExcelLoanRelationship, ExcelRow, Loan } from "./types";
import { Payments } from "../payments/types";
import { extractPaymentData } from "../payments";
const xlsx = require('xlsx');

const excelColumnsRelationship: ExcelLoanRelationship = {
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



    let loansData: Loan[] = data.slice(1).map((row: ExcelRow) => {
        const obj: Partial<Loan> = {};
        for (const [col, key] of Object.entries(excelColumnsRelationship)) {
            const colIndex = xlsx.utils.decode_col(col);
            let value = row[colIndex];
            // Convertir fechas si es necesario
            if (key === 'givedDate' || key === 'finishedDate' || key === 'badDebtDate') {
                value = convertExcelDate(value);
            }
            obj[key] = value;
        }
        return obj as Loan;
    });
    return loansData;
};

const saveDataToDB = async (loans: Loan[], cashAccountId: string, bankAccount: string, payments: Payments[]) => {
    const renovatedLoans = loans.filter(item => item && item.previousLoanId !== undefined);
    const notRenovatedLoans = loans.filter(item => item && item.previousLoanId === undefined);
    console.log('renovatedLoans', renovatedLoans.length);
    console.log('notRenovatedLoans', notRenovatedLoans.length);

    //Create the loanTypes
    const fourteenWeeksId = await prisma.loantype.create({
        data: {
            name: '14 semanas/40%',
            weekDuration: 14,
            rate: '0.4',
        }
    });
    const teennWeeksId = await prisma.loantype.create(
        {
            data: {
                name: '10 semanas/0%',
                weekDuration: 10,
                rate: '0',
            }
        },
    );


    const groupedPayments = groupPaymentsByOldLoanId(payments);

    const employeeIdsMap = await getEmployeeIdsMap();
    if (!employeeIdsMap) {
/*         console.log('NO EMPLOYEE IDS MAP'); */
        return;
    }
    // Dividir los datos en lotes de 100 elementos (optimizado para DigitalOcean)
    const batches = chunkArray(notRenovatedLoans, 100);
    console.log(`🔢 Procesando ${notRenovatedLoans.length} loans nuevos en ${batches.length} batches de 100`);
    
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchStartTime = Date.now();
        
        const transactionPromises = batch.map(item => {
            if (!groupedPayments[item.id]) {
                return;
            }
            return prisma.loan.create({
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
                                    }: undefined,
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
                            const totalAmountToPay = Number(item.requestedAmount) + baseProfit;
                            const profitAmount = payment.amount * baseProfit / (totalAmountToPay);

                            return {
                                oldLoanId: String(item.id),
                                receivedAt: payment.paymentDate,
                                amount: payment.amount,
                                type: payment.type,
                                transactions: {
                                    create: {
                                        profitAmount: item.badDebtDate && payment.paymentDate > item.badDebtDate? payment.amount: profitAmount,
                                        returnToCapital:item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0:payment.amount - profitAmount,
                                        amount: payment.amount,
                                        date: payment.paymentDate,
                                        destinationAccountId: payment.description === 'DEPOSITO' ? bankAccount: cashAccountId,
                                        type: 'INCOME',
                                        incomeSource: payment.description === 'DEPOSITO' ? 'BANK_LOAN_PAYMENT':'CASH_LOAN_PAYMENT',
                                        
                                    }
                                }
                            }
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
        
        const cleanedPromises = transactionPromises.filter(item => item !== undefined);
        await prisma.$transaction(cleanedPromises);
        
        const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(2);
        const processed = (i + 1) * 100;
        const total = notRenovatedLoans.length;
        const percentage = ((processed / total) * 100).toFixed(1);
        
        console.log(`⏳ Batch ${i + 1}/${batches.length} completado en ${batchDuration}s (${percentage}% - ${Math.min(processed, total)}/${total})`);
        
        // Liberar memoria cada 10 batches
        if (i > 0 && i % 10 === 0) {
            console.log(`🧹 Limpieza de memoria (batch ${i + 1})`);
            global.gc && global.gc();
        }
    }

    // Obtener los préstamos insertados y crear el mapa oldId => dbID
    const loansFromDb = await prisma.loan.findMany({
        include: {
            payments: {
                include: {
                    transactions: true,
                }
            },
            previousLoan: true
        }
    });
    const loanIdsMap: {
        [key: string]: {
            id: string,
            borrowerId: string,
            profitAmount?: string,
            totalProfitPayed: number,
            pendingProfitToPay: number,
        }
    } = {};
    loansFromDb.forEach((item) => {
        const totalProfitPayed = item.payments.reduce((acc, payment) => acc + (payment.transactions.length && payment.transactions[0].profitAmount ? Number(payment.transactions[0].profitAmount) : 0), 0);
        loanIdsMap[String(item?.oldId!)] = {
            id: item.id,
            borrowerId: item.borrowerId ?? '',
            profitAmount: item.profitAmount?.toString() ?? '0',
            totalProfitPayed: totalProfitPayed,
            pendingProfitToPay: Number(item.profitAmount) - totalProfitPayed,
        };
    });
    
    console.log("=====================renovatedLoans insert =====================");
    for (const item of renovatedLoans) {

        const existPreviousLoan = item.previousLoanId && loanIdsMap[item.previousLoanId];
        if (!item.previousLoanId) {
            /* console.log('====NO PREVIOUS LOAN ID======', item); */
            continue;
        }
        const previousLoan = await prisma.loan.findUnique({
            where: {
                oldId: String(item.previousLoanId),
            },
            include: {
                payments: {
                    include: {
                        transactions: true,
                    }
                },
            }
        });
        if (item.previousLoanId === '5805') {
            /* console.log('====5805===', previousLoan, loanIdsMap); */
        }

        const loanType = item.noWeeks === 14 ? fourteenWeeksId : teennWeeksId;
        const rate = loanType.rate ? Number(loanType.rate) : 0;
        const previousLoanProfitAmount = previousLoan?.profitAmount ? Number(previousLoan.profitAmount) : 0;
        const payedProfitFromPreviousLoan = previousLoan?.payments.reduce((acc, payment) => {
            const transactionProfit = payment.transactions.reduce((transAcc, transaction) => transAcc + (transaction.profitAmount ? Number(transaction.profitAmount) : 0), 0);
            return acc + transactionProfit;
        }, 0) || 0;
        
        const profitPendingFromPreviousLoan = previousLoanProfitAmount - (payedProfitFromPreviousLoan ?? 0);
        const baseProfit = Number(item.requestedAmount) * rate;
        const profitAmount = baseProfit + Number(profitPendingFromPreviousLoan);
        //if(["1873", "2486","3292", "4196" ,"4977", "5401"].includes(item.id.toString())){
        if(["1338"].includes(item.id.toString())){

            /* console.log('================INICIANDO=================', item.id);
            console.log("previousLoan", item.previousLoanId);
            
            console.log('====GANANCIA PAGADA DEL PRESTAMO PREVIO', payedProfitFromPreviousLoan);
            console.log('GANANCIA DE RENOVACION:', profitPendingFromPreviousLoan);
            console.log('PROFIT BASE', baseProfit);
            console.log('TOTAL PROFIT', profitAmount);
            console.log('====FINALIZADO===', item.requestedAmount); */
        }
        /* if(groupedPayments[item.id]) {
            console.log("=====================INSERTING =====================");
            console.log("=====================INSERTING =====================");
            console.log("=====================INSERTING =====================");
            console.log("=====================INSERTING =====================");
            console.log("===================== ====================="); */
        
        await prisma.loan.create({
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
                //TODO: calculate the renovation profit amount
                profitAmount: profitAmount.toString(),
                payments: groupedPayments[item.id] ? {
                    create: groupedPayments[item.id].map(payment => {
                        const baseProfit = Number(item.requestedAmount) * rate;
                        const loanTotalProfit = baseProfit + profitPendingFromPreviousLoan;
                        const totalAmountToPay = Number(item.requestedAmount) + baseProfit;
                        const profitAmount = (payment.amount * loanTotalProfit) / Number(totalAmountToPay);
                        

                        if(["3292"].includes(item.id.toString())){
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
                            /* profitAmount: profitAmount,
                            returnToCapital: payment.amount - profitAmount, */
                            /* profitAmount: item.badDebtDate && payment.paymentDate > item.badDebtDate? payment.amount: profitAmount,
                            returnToCapital: item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0:payment.amount - profitAmount, */
                            type: payment.type,
                            transactions: {
                                create: {
                                    amount: payment.amount,
                                    date: payment.paymentDate,
                                    destinationAccountId: payment.description === 'DEPOSITO' ? bankAccount: cashAccountId,
                                    type: 'INCOME',
                                    incomeSource: payment.description === 'DEPOSITO' ? 'BANK_LOAN_PAYMENT': 'CASH_LOAN_PAYMENT',
                                    profitAmount: item.badDebtDate && payment.paymentDate > item.badDebtDate? payment.amount: profitAmount,
                                    returnToCapital: item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0:payment.amount - profitAmount,
                                    
                                }
                            }
                        }
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
            },
        });
        /* } */
    };
    console.log("=====================");
    console.log("=====================");


    const totalGivedAmount = await prisma.loan.aggregate({
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

export const seedLoans = async (cashAccountId: string, bankAccountId: string) => {
    console.log('💰 Iniciando creación de loans...');
    const startTime = Date.now();
    
    const loanData = extractLoanData();
    const payments = extractPaymentData();
    
    console.log(`📊 ${loanData.length} loans encontrados en Excel`);
    console.log(`💳 ${payments.length} payments encontrados en Excel`);
    
    const renovatedCount = loanData.filter(item => item && item.previousLoanId !== undefined).length;
    const newCount = loanData.filter(item => item && item.previousLoanId === undefined).length;
    
    console.log(`🔄 ${renovatedCount} loans renovados`);
    console.log(`🆕 ${newCount} loans nuevos`);
    
    if (cashAccountId) {
        await saveDataToDB(loanData, cashAccountId, bankAccountId, payments);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ Loans creados exitosamente en ${duration}s`);
        console.log(`📈 Total procesados: ${loanData.length} loans`);
        console.log(`🎯 Cuentas utilizadas: Cash(${cashAccountId.slice(-8)}) Bank(${bankAccountId.slice(-8)})`);
    } else {
        console.log('❌ No se encontró la cuenta principal');
        throw new Error('No se encontró la cuenta principal para loans');
    }
};