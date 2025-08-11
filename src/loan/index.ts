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
            avalName: row[27] ? String(row[27]) : '',
            avalPhone: row[28] ? String(row[28]) : '',
            titularPhone: row[29] ? String(row[29]) : '',
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
                status: determineLoanStatus(item, loans),
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
            previousLoanId: true
        }
    });
    console.log('LOANS WITH PREVIOUS LOAN', loansWithPreviousLoan.length);

    const previousLoanIds = Array.from(
        new Set(
            loansWithPreviousLoan
                .map(l => l.previousLoanId)
                .filter((id): id is string => Boolean(id))
        )
    );

    if (previousLoanIds.length > 0) {
        const previousIdsBatches = chunkArray(previousLoanIds, 1000);
        await prisma.$transaction(
            previousIdsBatches.map(batch =>
                prisma.loan.updateMany({
                    where: {
                        id: { in: batch },
                        finishedDate: { not: null }
                    },
                    data: {
                        status: 'FINISHED'
                    }
                })
            )
        );
        console.log(`✅ Actualizados ${previousLoanIds.length} préstamos PREVIOS a status RENOVATED`);
    }
    
    // Paso 0: Normalizar finishedDate con la fecha del último pago para todos los préstamos que ya tienen finishedDate
    {
        const loansWithFinish = await prisma.loan.findMany({
            where: {
                snapshotRouteId: snapshotData.routeId,
                finishedDate: { not: null }
            },
            select: {
                id: true,
                payments: { select: { receivedAt: true } }
            }
        });
        const updates = loansWithFinish.map(l => {
            if (!l.payments || l.payments.length === 0) return null;
            const lastPayment = l.payments.reduce((max: Date | null, p) => {
                const d = p.receivedAt as unknown as Date;
                return !max || d > max ? d : max;
            }, null);
            if (!lastPayment) return null;
            return prisma.loan.update({ where: { id: l.id }, data: { finishedDate: lastPayment } });
        }).filter((u): u is ReturnType<typeof prisma.loan.update> => Boolean(u));

        if (updates.length > 0) {
            const batches = chunkArray(updates, 200);
            for (const batch of batches) {
                await prisma.$transaction(batch);
            }
            console.log(`✅ Normalizados finishedDate con último pago: ${updates.length}`);
        }
    }

    // Establecer finishedDate del préstamo previo igual al signDate del nuevo préstamo (renovación)
    {
        const childrenWithPrevious = await prisma.loan.findMany({
            where: {
                snapshotRouteId: snapshotData.routeId,
                previousLoanId: { not: null }
            },
            select: {
                previousLoanId: true,
                signDate: true,
                oldId: true
            }
        });

        const prevIds = Array.from(new Set(
            childrenWithPrevious
                .map(l => l.previousLoanId as string)
                .filter(Boolean)
        ));

        let prevMap = new Map<string, Date | null>();
        if (prevIds.length > 0) {
            const prevLoans = await prisma.loan.findMany({
                where: { id: { in: prevIds } },
                select: { id: true, finishedDate: true }
            });
            prevLoans.forEach(p => prevMap.set(p.id, p.finishedDate ? new Date(p.finishedDate) : null));
        }

        
        const updates = childrenWithPrevious
            .filter(l => Boolean(l.previousLoanId) && Boolean(l.signDate))
            .map(l => {
                const prevId = l.previousLoanId as string;
                const childSign = l.signDate as Date;
                const prevFinished = prevMap.get(prevId) ?? null;
                if (!prevFinished) {
                    if(["7150"].includes(l.oldId as string)){
                        console.log('====1338===', prevId, childSign);
                    }
                    return prisma.loan.update({ where: { id: prevId }, data: { finishedDate: childSign } });
                }
                if (isSameWorkWeek(prevFinished, childSign) && prevFinished.getTime() !== childSign.getTime()) {
                    return prisma.loan.update({ where: { id: prevId }, data: { finishedDate: childSign } });
                }
                return null;
            })
            .filter((u): u is ReturnType<typeof prisma.loan.update> => Boolean(u));

        if (updates.length > 0) {
            const batches = chunkArray(updates, 200);
            for (const batch of batches) {
                await prisma.$transaction(batch);
            }
            console.log(`✅ Sincronizados finishedDate de préstamos previos por renovaciones (>=1 semana): ${updates.length}`);
        }
    }

    // Corrección: si el último pago es posterior a finishedDate, actualizar finishedDate,
    // a menos que exista una renovación con signDate a <= 7 días de la finishedDate (en cuyo caso se prioriza el signDate del crédito renovado)
    {
        // Traer loans de la ruta con pagos
        const loansForFix = await prisma.loan.findMany({
            where: { snapshotRouteId: snapshotData.routeId },
            select: {
                id: true,
                finishedDate: true,
                payments: { select: { receivedAt: true } },
                oldId: true
            }
        });

        const loanIds = loansForFix.map(l => l.id);
        // Traer hijos que referencian a estos loans
        const children = loanIds.length > 0
            ? await prisma.loan.findMany({
                where: { previousLoanId: { in: loanIds } },
                select: { previousLoanId: true, signDate: true, oldId: true }
            })
            : [];
        const prevIdToChildSign = new Map<string, Date>();
        for (const c of children) {
            if (!c.previousLoanId || !c.signDate) continue;
            const curr = prevIdToChildSign.get(c.previousLoanId);
            const sign = c.signDate as Date;
            if (!curr || sign < curr) prevIdToChildSign.set(c.previousLoanId, sign);
        }

        
        const updates = loansForFix.map(l => {
            const finished = l.finishedDate ? new Date(l.finishedDate) : null;
            const lastPayment = l.payments.reduce((max: Date | null, p) => {
                const d = p.receivedAt as unknown as Date;
                return !max || d > max ? d : max;
            }, null);

            if (!finished && !lastPayment) return null;

            const childSign = prevIdToChildSign.get(l.id) ?? null;
            // Prioridad: si existe childSign y finished y están en la misma semana laboral, usar childSign
            if (finished && childSign) {
                if (isSameWorkWeek(finished, childSign) && finished.getTime() !== childSign.getTime()) {
                    return prisma.loan.update({ where: { id: l.id }, data: { finishedDate: childSign } });
                }
            }

            // Si último pago es posterior a finishedDate, corregir a último pago
            if (lastPayment && finished && lastPayment > finished) {
                return prisma.loan.update({ where: { id: l.id }, data: { finishedDate: lastPayment } });
            }

            return null;
        }).filter((u): u is ReturnType<typeof prisma.loan.update> => Boolean(u));

        if (updates.length > 0) {
            const batches = chunkArray(updates, 200);
            for (const batch of batches) {
                await prisma.$transaction(batch);
            }
            console.log(`✅ Corregidos finishedDate por desfasaje con pagos/renovación: ${updates.length}`);
        }
    }

    await prisma.loan.updateMany({
        where: {},
        data: {
            status: 'ACTIVE'
        }
    });

    const totalGivedAmount = await prisma.loan.aggregate({
        _sum: {
            amountGived: true,
        }
    });

    if (totalGivedAmount) {
        // Logs comentados removidos
    }

    // Agrega el proceso aki: llenar campos denormalizados (deuda, pagos esperados, total pagado, pendiente)
    {
        const loansForDenorm = await prisma.loan.findMany({
            where: { snapshotRouteId: snapshotData.routeId },
            select: {
                id: true,
                requestedAmount: true,
                loantype: { select: { rate: true, weekDuration: true } },
                payments: { select: { amount: true } },
            }
        });

        const denormUpdates = loansForDenorm.map(loan => {
            const principal = Number(loan.requestedAmount ?? 0);
            const rate = Number(loan.loantype?.rate ?? 0);
            const weeks = Number(loan.loantype?.weekDuration ?? 0) || 1;
            const totalToPay = principal * (1 + rate);
            const expectedWeeklyPayment = totalToPay / weeks;
            const totalPaid = loan.payments.reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
            const pending = Math.max(totalToPay - totalPaid, 0);

            return prisma.loan.update({
                where: { id: loan.id },
            data: {
                    totalDebtAcquired: totalToPay.toFixed(2),
                    expectedWeeklyPayment: expectedWeeklyPayment.toFixed(2),
                    totalPaid: totalPaid.toFixed(2),
                    pendingAmountStored: pending.toFixed(2),
                }
            });
        });

        if (denormUpdates.length > 0) {
            const batches = chunkArray(denormUpdates, 200);
            for (const batch of batches) {
                await prisma.$transaction(batch);
            }
            console.log(`✅ Denormalizados préstamos: ${denormUpdates.length} (deuda, pago semanal, pagado, pendiente)`);
        }
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

    // Helper: determina si dos fechas están en la misma semana laboral (lunes-domingo)
    const isSameWorkWeek = (a: Date, b: Date): boolean => {
        const startOfWeek = (d: Date) => {
            const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const day = date.getDay(); // 0=Dom, 1=Lun, ...
            const diffToMonday = (day + 6) % 7; // Lunes=0, Domingo=6
            date.setDate(date.getDate() - diffToMonday);
            date.setHours(0, 0, 0, 0);
            return date;
        };
        const endOfWeek = (d: Date) => {
            const start = startOfWeek(d);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            end.setHours(23, 59, 59, 999);
            return end;
        };
        const aStart = startOfWeek(a);
        const aEnd = endOfWeek(a);
        return b >= aStart && b <= aEnd;
    };