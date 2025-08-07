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

const extractLoanData = (routeName: string, excelFileName: string) => {
    const workbook = xlsx.readFile(excelFileName);
    const sheetName = 'CREDITOS_OTORGADOS';
    console.log('sheetName', sheetName);
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    console.log('data', data.length);
    
    const loansData = data.slice(1)
    .filter((row: any) => row && row[0] && row[0] !== undefined) // Filtrar filas vacías
    .map((row: any) => {
        const obj = {
            id: row[0],
            fullName: row[1],
            givedDate: row[2] ? convertExcelDate(row[2]) : null,
            status: row[3],
            givedAmount: row[4],
            requestedAmount: row[5],
            noWeeks: row[6],
            interestRate: row[7],
            finished: row[8],
            finishedDate: row[26] ? convertExcelDate(row[26]) : null,
            leadId: row[18],
            previousLoanId: row[30],
            weeklyPaymentAmount: row[9],
            amountToPay: row[8],
            avalName: row[28] ? String(row[28]) : '',
            avalPhone: row[29] ? String(row[29]) : '',
            titularPhone: row[30] ? String(row[30]) : '',
            badDebtDate: row[41] ? convertExcelDate(row[41]) : null
        }
        return obj as Loan;
    });
    console.log('loansData', loansData.length);
    // Filtrar solo los loans que tengan el routeName en la columna AQ
    /* const filteredLoans = loansData.filter((loan: Loan) => {
        const routeColumnIndex = xlsx.utils.decode_col('AQ'); // Columna AQ
        const rowIndex = data.findIndex((row: any) => row[0] === loan.id) + 1; // +1 porque empezamos desde slice(1)
        const routeValue = data[rowIndex]?.[routeColumnIndex];
        return routeValue === routeName;
    }); */
    const filteredLoans = loansData;
    return filteredLoans;
};

const saveDataToDB = async (loans: Loan[], cashAccountId: string, bankAccount: string, payments: Payments[], snapshotData: {
    routeId: string;
    routeName: string;
    locationId: string;
    locationName: string;
    leadId: string;
    leadName: string;
    leadAssignedAt: Date;
}, leadMapping?: { [oldId: string]: string }) => {
    const renovatedLoans = loans.filter(item => item && item.previousLoanId !== undefined);
    const notRenovatedLoans = loans.filter(item => item && item.previousLoanId === undefined);
    console.log('notRenovatedLoans', notRenovatedLoans.length);
    console.log('renovatedLoans', renovatedLoans.length);
    
    
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

    const twentyWeeksId = await prisma.loantype.create(
        {
            data: {
                name: '20 semanas/0%',
                weekDuration: 20,
                rate: '0.1',
            }
        },
    );


    const groupedPayments = groupPaymentsByOldLoanId(payments);

    // Usar leadMapping si está disponible, sino usar employeeIdsMap como fallback
    let employeeIdsMap: { [key: string]: string } = {};
    if (leadMapping) {
        employeeIdsMap = leadMapping;
    } else {
        employeeIdsMap = await getEmployeeIdsMap();
    }
    if (!employeeIdsMap || Object.keys(employeeIdsMap).length === 0) {
        console.log('⚠️ No hay mapeo de empleados disponible');
        return;
    }

    // Función para determinar el status del préstamo
    const determineLoanStatus = (item: Loan, allLoans: Loan[]) => {
        // Si tiene fecha de término
        if (item.finishedDate) {
            // Verificar si algún otro préstamo usa este ID como previousLoanId
            return 'FINISHED';
        }
        
        // Si no tiene fecha de término, es activo
        return 'ACTIVE';
    };

    // Dividir los datos en lotes
    const batches = chunkArray(notRenovatedLoans, 1000);
    console.log('📊 Total de batches:', batches.length);
    console.log('📋 Elementos en el primer batch:', batches[0]?.length);
    console.log('🔍 Último elemento del primer batch:', batches[0]?.[batches[0].length - 1]);
    console.log('📋 Elementos en el último batch:', batches[batches.length - 1]?.length);
    console.log('🔍 Último elemento del último batch:', batches[batches.length - 1]?.[batches[batches.length - 1].length - 1]);
    console.log('❌ Préstamos sin pagos:', notRenovatedLoans.filter(item => !groupedPayments[item.id]).map(item => item.id));
    console.log('❌ Préstamos sin lead:', notRenovatedLoans.filter(item => !employeeIdsMap[item.leadId.toString()]).map(item => ({ id: item.id, leadId: item.leadId })));

    
    let loansWithoutLead = 0;
    let loansProcessed = 0;
    for (const batch of batches) {
        let processedLoans = 0;
        const transactionPromises = batch.map(item => {
            /* if (!groupedPayments[item.id]) {
                return;
            } */
            
            // Obtener el ID del lead específico para este préstamo
            const specificLeadId = employeeIdsMap[item.leadId.toString()];
            if(!specificLeadId){
                console.log(`❌ No lead id found for loan ${item.id}, leadId: ${item.leadId}`);
                loansWithoutLead++; 
                return;
            }
            const paymentsForLoan = groupedPayments[item.id] || [];
            //console.log('item.id', item);
            if(item.id === 7709){
                console.log('AKA ANDAMOS2', item);
                console.log('----cleanedData-----', {
                    data: {
                        borrower: {
                            create: {
                                personalData: {
                                    create: {
                                        fullName: String(item.fullName),
                                        phones: item.titularPhone && item.titularPhone.trim() !== "" && !["NA", "N/A", "N", "undefined", "PENDIENTE"].includes(item.titularPhone) ? {
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
                                id: item.noWeeks === 14 ? fourteenWeeksId.id : item.noWeeks === 20 ? twentyWeeksId.id : teennWeeksId.id,
                            }
                        },
                        lead: {
                            connect: {
                                id: specificLeadId,
                            }
                        },
                        oldId: item.id.toString(),
                        status: determineLoanStatus(item, loans),
                        badDebtDate: item.badDebtDate,
                        snapshotRouteId: snapshotData.routeId,
                        snapshotRouteName: snapshotData.routeName,
                        snapshotLeadId: specificLeadId,
                        snapshotLeadAssignedAt: snapshotData.leadAssignedAt,
                        payments: {
                            create: groupedPayments[item.id]?.map(payment => {
                                const loanType = item.noWeeks === 14 ? fourteenWeeksId : teennWeeksId;
                                
                                const baseProfit = Number(item.requestedAmount) * (loanType.rate ? Number(loanType.rate) : 0);
                                const rate = loanType.rate ? Number(loanType.rate) : 0;
                                const totalAmountToPay = Number(item.requestedAmount) + baseProfit;
                                const profitAmount = payment.amount * baseProfit / (totalAmountToPay);
                                
                                if(["1873"].includes(item.id.toString())){
                                    // Logs comentados removidos
                                }
    
                                return {
                                    oldLoanId: String(item.id),
                                    receivedAt: payment.paymentDate,
                                    amount: payment.amount,
                                    
                                    //profitAmounst: item.badDebtDate && payment.paymentDate > item.badDebtDate? payment.amount: profitAmount,
                                    //returnToCapital: item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0:payment.amount - profitAmount,
                                    type: payment.type,
                                    transactions: {
                                        create: {
                                            profitAmount: item.badDebtDate && payment.paymentDate > item.badDebtDate? payment.amount: profitAmount,
                                            returnToCapital:item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0:payment.amount - profitAmount,
                                            amount: payment.amount,
                                            date: payment.paymentDate,
                                            destinationAccountId: payment.description === 'DEPOSITO' ? bankAccount: cashAccountId,
                                            type: 'INCOME',
                                            routeId: snapshotData.routeId,
                                            incomeSource: payment.description === 'DEPOSITO' ? 'BANK_LOAN_PAYMENT':'CASH_LOAN_PAYMENT',
                                            // Agregar solo el campo de snapshot que existe en Transaction
                                            snapshotLeadId: specificLeadId, // Usar el ID del lead específico
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
                                routeId: snapshotData.routeId,
                                // Agregar solo el campo de snapshot que existe en Transaction
                                /* snapshotLeadId: specificLeadId, // Usar el ID del lead específico */
                            }]
                        }
                    }
                }
                );
            }
            processedLoans++;
            

            return prisma.loan.create({
                data: {
                    borrower: {
                        create: {
                            personalData: {
                                create: {
                                    fullName: String(item.fullName),
                                    phones: item.titularPhone && item.titularPhone.trim() !== "" && !["NA", "N/A", "N", "undefined", "PENDIENTE"].includes(item.titularPhone) ? {
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
                            id: item.noWeeks === 14 ? fourteenWeeksId.id : item.noWeeks === 20 ? twentyWeeksId.id : teennWeeksId.id,
                        }
                    },
                    lead: {
                        connect: {
                            id: specificLeadId,
                        }
                    },
                    oldId: item.id.toString(),
                    status: determineLoanStatus(item, loans),
                    badDebtDate: item.badDebtDate,
                    snapshotRouteId: snapshotData.routeId,
                    snapshotRouteName: snapshotData.routeName,
                    snapshotLeadId: specificLeadId,
                    snapshotLeadAssignedAt: snapshotData.leadAssignedAt,
                    payments: {
                            create: paymentsForLoan.map(payment => {

                            const loanType = item.noWeeks === 14 ? fourteenWeeksId : teennWeeksId;
                            
                            const baseProfit = Number(item.requestedAmount) * (loanType.rate ? Number(loanType.rate) : 0);
                            const rate = loanType.rate ? Number(loanType.rate) : 0;
                            const totalAmountToPay = Number(item.requestedAmount) + baseProfit;
                            const profitAmount = payment.amount * baseProfit / (totalAmountToPay);
                            
                            if(["1873"].includes(item.id.toString())){
                                // Logs comentados removidos
                            }

                            return {
                                oldLoanId: String(item.id),
                                receivedAt: payment.paymentDate,
                                amount: payment.amount,
                                
                                //profitAmounst: item.badDebtDate && payment.paymentDate > item.badDebtDate? payment.amount: profitAmount,
                                //returnToCapital: item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0:payment.amount - profitAmount,
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
                                        // Agregar solo el campo de snapshot que existe en Transaction
                                        snapshotLeadId: specificLeadId, // Usar el ID del lead específico
                                        routeId: snapshotData.routeId,
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
                            routeId: snapshotData.routeId,
                            // Agregar solo el campo de snapshot que existe en Transaction
                            /* snapshotLeadId: specificLeadId, // Usar el ID del lead específico */
                        }]
                    }
                }
            });
        });
        const cleanedData = transactionPromises.filter(item => item !== undefined);
        
        if (cleanedData.length > 0) {
            try {
                await prisma.$transaction(cleanedData);
            } catch (error) {
                console.log('error saving loans 244', error);
            }
        }
    };

    // Obtener los préstamos insertados y crear el mapa oldId => dbID
    const loansFromDb = await prisma.loan.findMany({
        include: {
            borrower: {
                include: {
                    personalData: true,
                }
            },
            payments: {
                include: {
                    transactions: true,
                    
                }
            },
            previousLoan: true
        }
    });
    /* console.log('PRESTAMOS EN LA BASE DE DATOS', loansFromDb.length);
    console.log('PRESTAMOS EN LA BASE DE DATOS', loansFromDb[0]); */
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
    
    for (const item of renovatedLoans) {

        const existPreviousLoan = item.previousLoanId && loanIdsMap[item.previousLoanId];
        if (!item.previousLoanId) {
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
            // Logs comentados removidos
        }
        
        // Obtener el ID del lead específico para este préstamo renovado
        const specificLeadId = employeeIdsMap[item.leadId.toString()];
        if(!specificLeadId){
            console.log('No lead id found for loan', item);
            loansWithoutLead++;
            return;
        }
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
                        id: specificLeadId,
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
                // Agregar solo los campos de snapshot que existen en Loan
                snapshotRouteId: snapshotData.routeId,
                snapshotRouteName: snapshotData.routeName,
                snapshotLeadId: specificLeadId, // Usar el ID del lead específico
                snapshotLeadAssignedAt: snapshotData.leadAssignedAt,
                payments: groupedPayments[item.id] ? {
                    create: groupedPayments[item.id].map(payment => {
                        const baseProfit = Number(item.requestedAmount) * rate;
                        const loanTotalProfit = baseProfit + profitPendingFromPreviousLoan;
                        const totalAmountToPay = Number(item.requestedAmount) + baseProfit;
                        const profitAmount = (payment.amount * loanTotalProfit) / Number(totalAmountToPay);
                        

                        if(["3292"].includes(item.id.toString())){
                            // Logs comentados removidos
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
                                    // Agregar solo el campo de snapshot que existe en Transaction
                                    snapshotLeadId: specificLeadId, // Usar el ID del lead específico
                                    routeId: snapshotData.routeId,
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
                        routeId: snapshotData.routeId,
                        // Agregar solo el campo de snapshot que existe en Transaction
                        /* snapshotLeadId: specificLeadId, // Usar el ID del lead específico */
                    }
                }
            },
        });
    };

    //OBTEN TODOS LOS LOANS QUE TIENEN UN PREVIOUS LOAN Y MARCA EL PREVIOUS LOAN COMO RENOVATED
    const loansWithPreviousLoan = await prisma.loan.findMany({
        where: {
            previousLoanId: {
                not: null
            }
        },
        select: {
            id: true
        }
    });
    console.log('LOANS WITH PREVIOUS LOAN', loansWithPreviousLoan.length);
    
    if (loansWithPreviousLoan.length > 0) {
        // Actualizar en bulk usando updateMany
        await prisma.loan.updateMany({
            where: {
                id: {
                    in: loansWithPreviousLoan.map(loan => loan.id)
                }
            },
            data: { 
                status: 'RENOVATED' 
            }
        });
        console.log(`✅ Actualizados ${loansWithPreviousLoan.length} préstamos a status RENOVATED`);
    }
    


    const totalGivedAmount = await prisma.loan.aggregate({
        _sum: {
            amountGived: true,
        }
    });

    if (totalGivedAmount) {
        // Logs comentados removidos
    }
};

export const seedLoans = async (cashAccountId: string, bankAccountId: string, snapshotData: {
    routeId: string;
    routeName: string;
    locationId: string;
    locationName: string;
    leadId: string;
    leadName: string;
    leadAssignedAt: Date;
}, excelFileName: string, leadMapping?: { [oldId: string]: string }) => {
    const loanData = extractLoanData(snapshotData.routeName, excelFileName);
    const payments = extractPaymentData(excelFileName);
    if (cashAccountId) {
        await saveDataToDB(loanData, cashAccountId, bankAccountId, payments, snapshotData, leadMapping);
        console.log('Loans seeded');
    } else {
        console.log('No se encontro la cuenta principal');
    }
}