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
    console.log('=== INICIANDO SEEDER DE PRÉSTAMOS ===');
    console.log(`Préstamos renovados: ${renovatedLoans.length}`);
    console.log(`Préstamos NO renovados: ${notRenovatedLoans.length}`);
    console.log(`Total de préstamos: ${loans.length}`);

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
        console.log('❌ NO EMPLOYEE IDS MAP');
        return;
    }

    // OPTIMIZACIÓN: Batch size más eficiente
    const batches = chunkArray(notRenovatedLoans, 25); // Aumentado de 5 a 25
    console.log(`\n🔄 Procesando ${notRenovatedLoans.length} préstamos NO renovados en ${batches.length} batches de 25`);
    
    let processedCount = 0;
    let errorCount = 0;
    const startTime = Date.now();
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchStartTime = Date.now();
        console.log(`\n📦 Batch ${batchIndex + 1}/${batches.length} - Procesando ${batch.length} préstamos...`);
        
        // OPTIMIZACIÓN: Procesar batch con mejor manejo de errores
        const batchPromises = batch.map(async (item, itemIndex) => {
            if (!groupedPayments[item.id]) {
                console.log(`⚠️  Sin pagos para préstamo ${item.id}`);
                return null;
            }
            
            try {
                await prisma.loan.create({
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
                                const rate = loanType.rate ? Number(loanType.rate) : 0;
                                const totalAmountToPay = Number(item.requestedAmount) + baseProfit;
                                const profitAmount = payment.amount * baseProfit / (totalAmountToPay);

                                return {
                                    oldLoanId: String(item.id),
                                    receivedAt: payment.paymentDate,
                                    amount: payment.amount,
                                    type: payment.type,
                                    transactions: {
                                        create: [{
                                            profitAmount: item.badDebtDate && payment.paymentDate > item.badDebtDate? payment.amount: profitAmount,
                                            returnToCapital:item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0:payment.amount - profitAmount,
                                            amount: payment.amount,
                                            date: payment.paymentDate,
                                            destinationAccountId: payment.description === 'DEPOSITO' ? bankAccount: cashAccountId,
                                            type: 'INCOME',
                                            incomeSource: payment.description === 'DEPOSITO' ? 'BANK_LOAN_PAYMENT':'CASH_LOAN_PAYMENT',
                                            
                                        }]
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
                
                processedCount++;
                return item.id;
            } catch (error) {
                errorCount++;
                console.error(`❌ Error al crear préstamo ${item.id}:`, error);
                return null;
            }
        });

        // OPTIMIZACIÓN: Ejecutar batch en paralelo con límite
        const results = await Promise.allSettled(batchPromises);
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
        const failureCount = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === null)).length;
        
        const batchTime = Date.now() - batchStartTime;
        const avgTimePerLoan = batchTime / batch.length;
        const totalElapsed = Date.now() - startTime;
        const remainingBatches = batches.length - (batchIndex + 1);
        const estimatedTimeRemaining = (remainingBatches * batchTime) / 1000 / 60; // en minutos
        
        console.log(`✅ Batch ${batchIndex + 1} completado:`);
        console.log(`   • Exitosos: ${successCount}/${batch.length}`);
        console.log(`   • Fallidos: ${failureCount}/${batch.length}`);
        console.log(`   • Tiempo: ${(batchTime/1000).toFixed(1)}s (${avgTimePerLoan.toFixed(0)}ms/préstamo)`);
        console.log(`   • Progreso total: ${processedCount}/${notRenovatedLoans.length} (${((processedCount/notRenovatedLoans.length)*100).toFixed(1)}%)`);
        console.log(`   • Tiempo estimado restante: ${estimatedTimeRemaining.toFixed(1)} minutos`);
    }

    console.log(`\n🎉 PRÉSTAMOS NO RENOVADOS COMPLETADOS:`);
    console.log(`   • Total procesados: ${processedCount}/${notRenovatedLoans.length}`);
    console.log(`   • Errores: ${errorCount}`);
    console.log(`   • Tiempo total: ${((Date.now() - startTime)/1000/60).toFixed(1)} minutos`);

    // Obtener los préstamos insertados y crear el mapa oldId => dbID
    console.log('\n🔄 Creando mapa de relaciones de forma eficiente...');
    // OPTIMIZACIÓN: En lugar de cargar toda la DB, usar solo los IDs necesarios
    const loanIdsMap: {
        [key: string]: {
            id: string,
            borrowerId: string,
            profitAmount?: string,
            totalProfitPayed: number,
            pendingProfitToPay: number,
        }
    } = {};
    
    // Solo obtener los datos mínimos necesarios sin relaciones pesadas
    const basicLoans = await prisma.loan.findMany({
        select: {
            id: true,
            oldId: true,
            borrowerId: true,
            profitAmount: true
        }
    });
    
    basicLoans.forEach((item) => {
        loanIdsMap[String(item?.oldId!)] = {
            id: item.id,
            borrowerId: item.borrowerId ?? '',
            profitAmount: item.profitAmount?.toString() ?? '0',
            totalProfitPayed: 0, // Calculado después si es necesario
            pendingProfitToPay: Number(item.profitAmount) || 0,
        };
    });
    
    console.log(`✅ Mapa de préstamos creado: ${Object.keys(loanIdsMap).length} préstamos`);
    
    console.log("\n=== INICIANDO PRÉSTAMOS RENOVADOS ===");
    
    // OPTIMIZACIÓN 1: Precarga de todos los préstamos anteriores necesarios
    console.log('🔄 Precargando préstamos anteriores de forma eficiente...');
    const previousLoanIds = renovatedLoans
        .filter(item => item.previousLoanId !== undefined)
        .map(item => String(item.previousLoanId));
    
    // OPTIMIZACIÓN: Solo cargar datos esenciales, no todas las relaciones
    const previousLoansMap = await prisma.loan.findMany({
        where: {
            oldId: { in: previousLoanIds }
        },
        select: {
            id: true,
            oldId: true,
            borrowerId: true,
            profitAmount: true
        }
    }).then(loans => 
        loans.reduce((map, loan) => {
            map[loan.oldId!] = loan;
            return map;
        }, {} as Record<string, any>)
    );
    
    console.log(`✅ Préstamos anteriores cargados: ${Object.keys(previousLoansMap).length}`);

    // OPTIMIZACIÓN 2: Procesar en batches más grandes
    const renovatedBatches = chunkArray(renovatedLoans, 20); // Aumentado de 10 a 20
    console.log(`\n🔄 Procesando ${renovatedLoans.length} préstamos renovados en ${renovatedBatches.length} batches de 20`);

    processedCount = 0;
    errorCount = 0;
    const renovatedStartTime = Date.now();

    for (let batchIndex = 0; batchIndex < renovatedBatches.length; batchIndex++) {
        const batch = renovatedBatches[batchIndex];
        const batchStartTime = Date.now();
        console.log(`\n📦 Batch renovados ${batchIndex + 1}/${renovatedBatches.length} - Procesando ${batch.length} préstamos...`);

        // OPTIMIZACIÓN: Procesar en paralelo con mejor manejo de errores
        const batchPromises = batch.map(async (item) => {
            if (!item.previousLoanId) {
                return null;
            }

            const previousLoan = previousLoansMap[String(item.previousLoanId)];
            if (!previousLoan) {
                console.log(`⚠️  Préstamo anterior no encontrado para ID: ${item.previousLoanId}`);
                return null;
            }

            try {
                const loanType = item.noWeeks === 14 ? fourteenWeeksId : teennWeeksId;
                const rate = loanType.rate ? Number(loanType.rate) : 0;
                const previousLoanProfitAmount = previousLoan?.profitAmount ? Number(previousLoan.profitAmount) : 0;
                
                // OPTIMIZACIÓN: Simplificar cálculo de profit para evitar consultas complejas
                const profitPendingFromPreviousLoan = previousLoanProfitAmount;
                const baseProfit = Number(item.requestedAmount) * rate;
                const profitAmount = baseProfit + Number(profitPendingFromPreviousLoan);

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
                        profitAmount: profitAmount.toString(),
                        payments: groupedPayments[item.id] ? {
                            create: groupedPayments[item.id].map(payment => {
                                const baseProfit = Number(item.requestedAmount) * rate;
                                const loanTotalProfit = baseProfit + profitPendingFromPreviousLoan;
                                const totalAmountToPay = Number(item.requestedAmount) + baseProfit;
                                const profitAmount = (payment.amount * loanTotalProfit) / Number(totalAmountToPay);

                                return {
                                    oldLoanId: String(item.id),
                                    receivedAt: payment.paymentDate,
                                    amount: payment.amount,
                                    type: payment.type,
                                    transactions: {
                                        create: [{
                                            profitAmount: item.badDebtDate && payment.paymentDate > item.badDebtDate? payment.amount: profitAmount,
                                            returnToCapital: item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0:payment.amount - profitAmount,
                                            amount: payment.amount,
                                            date: payment.paymentDate,
                                            destinationAccountId: payment.description === 'DEPOSITO' ? bankAccount: cashAccountId,
                                            type: 'INCOME',
                                            incomeSource: payment.description === 'DEPOSITO' ? 'BANK_LOAN_PAYMENT': 'CASH_LOAN_PAYMENT',
                                        }]
                                    }
                                }
                            })
                        } : undefined,
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
                
                processedCount++;
                return item.id;
            } catch (error) {
                errorCount++;
                console.error(`❌ Error al crear préstamo renovado ${item.id}:`, error);
                return null;
            }
        });

        // Ejecutar batch en paralelo
        const results = await Promise.allSettled(batchPromises);
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
        const failureCount = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === null)).length;
        
        const batchTime = Date.now() - batchStartTime;
        const avgTimePerLoan = batchTime / batch.length;
        const totalElapsed = Date.now() - renovatedStartTime;
        const remainingBatches = renovatedBatches.length - (batchIndex + 1);
        const estimatedTimeRemaining = (remainingBatches * batchTime) / 1000 / 60;
        
        console.log(`✅ Batch renovados ${batchIndex + 1} completado:`);
        console.log(`   • Exitosos: ${successCount}/${batch.length}`);
        console.log(`   • Fallidos: ${failureCount}/${batch.length}`);
        console.log(`   • Tiempo: ${(batchTime/1000).toFixed(1)}s (${avgTimePerLoan.toFixed(0)}ms/préstamo)`);
        console.log(`   • Progreso total: ${processedCount}/${renovatedLoans.length} (${((processedCount/renovatedLoans.length)*100).toFixed(1)}%)`);
        console.log(`   • Tiempo estimado restante: ${estimatedTimeRemaining.toFixed(1)} minutos`);
    }
    
    console.log(`\n🎉 PRÉSTAMOS RENOVADOS COMPLETADOS:`);
    console.log(`   • Total procesados: ${processedCount}/${renovatedLoans.length}`);
    console.log(`   • Errores: ${errorCount}`);
    console.log(`   • Tiempo total: ${((Date.now() - renovatedStartTime)/1000/60).toFixed(1)} minutos`);

    // OPTIMIZACIÓN: Cálculo final más eficiente
    console.log('\n🔄 Calculando totales...');
    const totalGivedAmount = await prisma.loan.aggregate({
        _sum: {
            amountGived: true,
        }
    });
    
    const totalTime = (Date.now() - startTime) / 1000 / 60;
    console.log('\n🎉 SEEDER COMPLETADO:');
    console.log(`   • Tiempo total: ${totalTime.toFixed(1)} minutos`);
    console.log(`   • Total amount gived: ${totalGivedAmount._sum.amountGived || 0}`);
    console.log('=== FIN DEL SEEDER ===');
};

export const seedLoans = async (cashAccountId: string, bankAccountId: string) => {
    const loanData = extractLoanData();
    const payments = extractPaymentData();
    if (cashAccountId) {
        await saveDataToDB(loanData, cashAccountId, bankAccountId, payments);
        console.log('Loans seeded');
    } else {
        console.log('No se encontro la cuenta principal');
    }
}