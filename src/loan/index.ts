import { getEmployeeIdsMap } from "../leads";
import { prisma } from "../standaloneApp";
import { chunkArray, convertExcelDate, groupPaymentsByOldLoanId, leads, clearAvalCache, createAllUniqueAvales, getOrAssignAvalId, cleanExistingDuplicates, forceCleanAdelina, forceCleanAllDuplicates, testFunction } from "../utils";
import { ExcelLoanRelationship, ExcelRow, Loan } from "./types";
import { Payments } from "../payments/types";
import { extractPaymentData } from "../payments";
const xlsx = require('xlsx');

// Cache en memoria para reutilizar borrowers
interface BorrowerCache {
    [fullName: string]: {
        borrowerId: string;
        personalDataId: string;
        fullName: string;
    };
}

// Cache global para mantener borrowers únicos
let borrowerCache: BorrowerCache = {};

// Función para obtener o crear borrower basándose en el fullName
const getOrCreateBorrower = async (fullName: string, titularPhone?: string): Promise<{ borrowerId: string; personalDataId: string }> => {
    const normalizedName = fullName.trim();
    
    // Verificar si ya existe en el cache
    if (borrowerCache[normalizedName]) {
        console.log(`🔄 Reutilizando borrower existente: "${normalizedName}" -> ID: ${borrowerCache[normalizedName].borrowerId}`);
        return {
            borrowerId: borrowerCache[normalizedName].borrowerId,
            personalDataId: borrowerCache[normalizedName].personalDataId
        };
    }
    
    // Buscar si ya existe en la base de datos
    const existingPersonalData = await prisma.personalData.findFirst({
        where: { fullName: normalizedName },
        include: {
            borrower: true
        }
    });
    
    if (existingPersonalData) {
        if (existingPersonalData.borrower) {
            // Ya existe un borrower con este personalData
            const result = {
                borrowerId: existingPersonalData.borrower.id,
                personalDataId: existingPersonalData.id
            };
            
            // Agregar al cache
            borrowerCache[normalizedName] = {
                borrowerId: result.borrowerId,
                personalDataId: result.personalDataId,
                fullName: normalizedName
            };
            
            console.log(`🔄 Reutilizando borrower existente en BD: "${normalizedName}" -> ID: ${result.borrowerId}`);
            return result;
        } else {
            // Existe personalData pero no borrower, crear borrower
            const newBorrower = await prisma.borrower.create({
                data: {
                    personalData: {
                        connect: { id: existingPersonalData.id }
                    }
                }
            });
            
            const result = {
                borrowerId: newBorrower.id,
                personalDataId: existingPersonalData.id
            };
            
            // Agregar al cache
            borrowerCache[normalizedName] = {
                borrowerId: result.borrowerId,
                personalDataId: result.personalDataId,
                fullName: normalizedName
            };
            
            console.log(`🆕 Creado nuevo borrower para personalData existente: "${normalizedName}" -> ID: ${result.borrowerId}`);
            return result;
        }
    }
    
    // No existe, crear todo desde cero
    const newPersonalData = await prisma.personalData.create({
        data: {
            fullName: normalizedName,
            phones: titularPhone && titularPhone.trim() !== "" && !["NA", "N/A", "N", "undefined", "PENDIENTE"].includes(titularPhone) ? {
                create: {
                    number: titularPhone ? String(titularPhone) : ""
                }
            } : undefined,
        }
    });
    
    const newBorrower = await prisma.borrower.create({
        data: {
            personalData: {
                connect: { id: newPersonalData.id }
            }
        }
    });
    
    const result = {
        borrowerId: newBorrower.id,
        personalDataId: newPersonalData.id
    };
    
    // Agregar al cache
    borrowerCache[normalizedName] = {
        borrowerId: result.borrowerId,
        personalDataId: result.personalDataId,
        fullName: normalizedName
    };
    
    console.log(`🆕 Creado nuevo borrower y personalData: "${normalizedName}" -> Borrower ID: ${result.borrowerId}, PersonalData ID: ${result.personalDataId}`);
    return result;
};

// Función para limpiar el cache de borrowers
const clearBorrowerCache = () => {
    borrowerCache = {};
    console.log('🧹 Cache de borrowers limpiado');
};

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
    // LOG INMEDIATO: Verificar que la función se ejecuta
    console.log('\n🚀 ========== INICIANDO FUNCIÓN saveDataToDB ==========');
    console.log('🚀 Esta línea debe aparecer ANTES de cualquier otra cosa');
    console.log('🚀 Verificando que no hay errores de sintaxis...');
    
    // LOG SIMPLE: Verificar que llegamos a esta línea
    console.log('🚀 LÍNEA 1: Función iniciada correctamente');
    console.log('🚀 LÍNEA 2: Antes de la función de prueba');
    
    // LOG DE PRUEBA: Verificar que no hay errores de importación
    console.log('🚀 LÍNEA 3: Verificando importaciones...');
    console.log('🚀 LÍNEA 4: testFunction disponible:', typeof testFunction);
    console.log('🚀 LÍNEA 5: forceCleanAllDuplicates disponible:', typeof forceCleanAllDuplicates);
    
    // LOG SIMPLE: Verificar que llegamos a esta línea
    console.log('🚀 LÍNEA 6: Antes de la función de prueba');
    console.log('🚀 LÍNEA 7: Verificando que no hay errores...');
    
    // FUNCIÓN DE PRUEBA SIMPLE: Verificar que se ejecuta
    console.log('\n🧪 ========== FUNCIÓN DE PRUEBA SIMPLE ==========');
    console.log('🧪 INICIANDO FUNCIÓN DE PRUEBA SIMPLE...');
    console.log('🧪 ESTA FUNCIÓN DEBE EJECUTARSE SIN ERRORES');
    
    try {
        console.log('🧪 PASO 1: Antes de llamar testFunction()...');
        console.log('🧪 PASO 2: EJECUTANDO testFunction()...');
        await testFunction();
        console.log('🧪 PASO 3: DESPUÉS de testFunction()...');
        console.log('✅ FUNCIÓN DE PRUEBA completada exitosamente');
        
        console.log('🧪 PASO 4: EJECUTANDO forceCleanAllDuplicates()...');
        await forceCleanAllDuplicates();
        console.log('✅ LIMPIEZA AGRESIVA completada exitosamente');
        
    } catch (error) {
        console.error('❌ ERROR CRÍTICO: Falló la función:', error);
        console.log('⚠️ Continuando con el proceso, pero pueden aparecer duplicados...');
    }
    console.log('🧪 ==========================================\n');
    
    // LOG DESPUÉS: Verificar que llegamos a esta línea
    console.log('🚀 LÍNEA 3: Después de la función de prueba');
    console.log('🚀 LÍNEA 4: Antes de limpiar cache de avales');
    
    // Limpiar cache de avales y borrowers al inicio del proceso
    clearAvalCache();
    clearBorrowerCache();
    console.log('🧹 Cache de avales y borrowers limpiado');
    
    // Pre-crear todos los avales únicos
    await createAllUniqueAvales(loans);
    
    const renovatedLoans = loans.filter(item => item && item.previousLoanId !== undefined);
    const notRenovatedLoans = loans.filter(item => item && item.previousLoanId === undefined);
    console.log('notRenovatedLoans', notRenovatedLoans.length);
    console.log('renovatedLoans', renovatedLoans.length);
    
    // LOG DESPUÉS DE VARIABLES: Verificar que llegamos a esta línea
    console.log('🚀 LÍNEA 6: Después de declarar variables de préstamos');
    console.log('🚀 LÍNEA 7: Antes de crear loanTypes');
    

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
    // Log removido para limpiar la consola

    
    let loansWithoutLead = 0;
    let loansProcessed = 0;
    for (const batch of batches) {
        let processedLoans = 0;
        const transactionPromises = batch.map(async (item) => {
            /* if (!groupedPayments[item.id]) {
                return;
            } */
            
            // Obtener el ID del lead específico para este préstamo
            const specificLeadId = employeeIdsMap[item.leadId.toString()];
            if(!specificLeadId){
                // Log removido para limpiar la consola
                loansWithoutLead++; 
                return null; // Retornar null para filtrar después
            }

            // Verificar que el lead existe en el mapeo (redundante, ya verificado arriba)
            // if (!specificLeadId) {
            //     loansWithoutLead++;
            //     return null;
            // }

            // Obtener los pagos para este préstamo
            const paymentsForLoan = groupedPayments[item.id] || [];
            
            // Obtener o crear borrower usando el cache (evita duplicados)
            const { borrowerId, personalDataId } = await getOrCreateBorrower(item.fullName, item.titularPhone);
            
            // Obtener ID del aval (ya pre-creado)
            const avalPersonalDataId = await getOrAssignAvalId(item.avalName);
            
            // VERIFICACIÓN EN TIEMPO REAL: Detectar si se está creando un duplicado de ERIKA
            if (item.avalName && item.avalName.includes('ERIKA JUSSET PAREDES CHAVEZ')) {
                console.log(`🔍 VERIFICACIÓN EN TIEMPO REAL: ERIKA en préstamo ${item.id} -> ID: ${avalPersonalDataId}`);
                
                // VERIFICACIÓN CRÍTICA: Si el fullName del préstamo es igual al avalName
                if (item.fullName === item.avalName) {
                    console.log(`🚨 PROBLEMA CRÍTICO: El préstamo ${item.id} tiene el mismo nombre que su aval: "${item.fullName}"`);
                    console.log(`🚨 Esto causará la creación de un registro duplicado en PersonalData!`);
                }
                
                // LOG DETALLADO: Mostrar información del préstamo
                console.log(`📋 DETALLES DEL PRÉSTAMO ${item.id}:`);
                console.log(`   - fullName: "${item.fullName}"`);
                console.log(`   - avalName: "${item.avalName}"`);
                console.log(`   - Son iguales: ${item.fullName === item.avalName ? 'SÍ' : 'NO'}`);
                
                // Verificar cuántos registros de ERIKA existen en este momento
                const erikaCount = await prisma.personalData.count({
                    where: { fullName: { contains: 'ERIKA JUSSET PAREDES CHAVEZ' } }
                });
                
                if (erikaCount > 1) {
                    console.log(`🚨 ALERTA CRÍTICA: ERIKA tiene ${erikaCount} registros durante la creación del préstamo ${item.id}!`);
                    
                    // Mostrar todos los registros de ERIKA
                    const erikaRecords = await prisma.personalData.findMany({
                        where: { fullName: { contains: 'ERIKA JUSSET PAREDES CHAVEZ' } },
                        select: { id: true, fullName: true, createdAt: true }
                    });
                    
                    console.log('📊 Registros de ERIKA encontrados:');
                    erikaRecords.forEach((record, index) => {
                        console.log(`   ${index + 1}. ID: ${record.id} | Creado: ${record.createdAt}`);
                    });
                }
            }
            
            // 🚨 LOG ESPECÍFICO PARA ALMA ROSA CANUL CHAN
            if (item.fullName && item.fullName.includes('ALMA ROSA CANUL CHAN')) {
                console.log(`🚨 ALMA ROSA CANUL CHAN como borrower: Usando PersonalData existente ${personalDataId} en lugar de crear duplicado`);
                console.log(`📋 DETALLES DEL PRÉSTAMO ${item.id}:`);
                console.log(`   - fullName: "${item.fullName}"`);
                console.log(`   - avalName: "${item.avalName}"`);
                console.log(`   - Son iguales: ${item.fullName === item.avalName ? 'SÍ' : 'NO'}`);
            }
            
            processedLoans++;
            
            // VERIFICACIÓN EN TIEMPO REAL: Detectar si se está creando un duplicado de ERIKA
            if (item.avalName && item.avalName.includes('ERIKA JUSSET PAREDES CHAVEZ')) {
                console.log(`🔍 VERIFICACIÓN EN TIEMPO REAL: ERIKA en préstamo ${item.id} -> ID: ${avalPersonalDataId}`);
                
                // VERIFICACIÓN CRÍTICA: Si el fullName del préstamo es igual al avalName
                if (item.fullName === item.avalName) {
                    console.log(`🚨 PROBLEMA CRÍTICO: El préstamo ${item.id} tiene el mismo nombre que su aval: "${item.fullName}"`);
                    console.log(`🚨 Esto causará la creación de un registro duplicado en PersonalData!`);
                }
                
                // LOG DETALLADO: Mostrar información del préstamo
                console.log(`📋 DETALLES DEL PRÉSTAMO ${item.id}:`);
                console.log(`   - fullName: "${item.fullName}"`);
                console.log(`   - avalName: "${item.avalName}"`);
                console.log(`   - Son iguales: ${item.fullName === item.avalName ? 'SÍ' : 'NO'}`);
                
                // Verificar cuántos registros de ERIKA existen en este momento
                const erikaCount = await prisma.personalData.count({
                    where: { fullName: { contains: 'ERIKA JUSSET PAREDES CHAVEZ' } }
                });
                
                if (erikaCount > 1) {
                    console.log(`🚨 ALERTA CRÍTICA: ERIKA tiene ${erikaCount} registros durante la creación del préstamo ${item.id}!`);
                    
                    // Mostrar todos los registros de ERIKA
                    const erikaRecords = await prisma.personalData.findMany({
                        where: { fullName: { contains: 'ERIKA JUSSET PAREDES CHAVEZ' } },
                        select: { id: true, fullName: true, createdAt: true }
                    });
                    
                    console.log('📊 Registros de ERIKA encontrados:');
                    erikaRecords.forEach((record, index) => {
                        console.log(`   ${index + 1}. ID: ${record.id} | Creado: ${record.createdAt}`);
                    });
                }
            }
            
            // 🚨 LOG ESPECÍFICO PARA ALMA ROSA CANUL CHAN
            if (item.fullName && item.fullName.includes('ALMA ROSA CANUL CHAN')) {
                console.log(`🚨 ALMA ROSA CANUL CHAN como borrower: Usando PersonalData existente ${personalDataId} en lugar de crear duplicado`);
                console.log(`📋 DETALLES DEL PRÉSTAMO ${item.id}:`);
                console.log(`   - fullName: "${item.fullName}"`);
                console.log(`   - avalName: "${item.avalName}"`);
                console.log(`   - Son iguales: ${item.fullName === item.avalName ? 'SÍ' : 'NO'}`);
            }
            
            const createdLoan = await prisma.loan.create({
                data: {
                    borrower: {
                        connect: { id: borrowerId }
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
                    avalName: item.avalName, // Mantener por compatibilidad temporal
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

            // Conectar aval como collateral después de crear el préstamo usando SQL directo
            if (avalPersonalDataId) {
                try {
                    await prisma.$executeRaw`
                        INSERT INTO "_Loan_collaterals" ("A", "B") 
                        VALUES (${createdLoan.id}, ${avalPersonalDataId})
                        ON CONFLICT DO NOTHING
                    `;
                    // Solo log para ERIKA
                    if (item.avalName?.includes('ERIKA JUSSET PAREDES CHAVEZ')) {
                        console.log(`✅ ERIKA conectada al préstamo: ${item.avalName} -> Loan ${item.id} -> ID: ${avalPersonalDataId}`);
                    }
                } catch (error) {
                    if (item.avalName?.includes('ERIKA JUSSET PAREDES CHAVEZ')) {
                        console.error(`❌ Error conectando ERIKA al préstamo ${item.id}:`, error);
                    }
                }
            }

            return createdLoan;
        });
        const cleanedData = (await Promise.all(transactionPromises)).filter(item => item !== undefined);
        
        if (cleanedData.length > 0) {
            try {
                await Promise.all(cleanedData);
                console.log(`✅ Batch procesado: ${processedLoans} préstamos. Cache de borrowers: ${Object.keys(borrowerCache).length} entradas`);
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
            // Log removido para limpiar la consola
            loansWithoutLead++;
            continue; // Usar continue en lugar de return para continuar con el siguiente préstamo
        }

        // Obtener ID del aval para préstamo renovado (ya pre-creado)
        const avalPersonalDataId = await getOrAssignAvalId(item.avalName);
        
        // VERIFICACIÓN EN TIEMPO REAL: Detectar si se está creando un duplicado de ERIKA en préstamo renovado
        if (item.avalName && item.avalName.includes('ERIKA JUSSET PAREDES CHAVEZ')) {
            console.log(`🔍 VERIFICACIÓN EN TIEMPO REAL (RENOVADO): ERIKA en préstamo renovado ${item.id} -> ID: ${avalPersonalDataId}`);
            
            // VERIFICACIÓN CRÍTICA: Si el fullName del préstamo es igual al avalName
            if (item.fullName === item.avalName) {
                console.log(`🚨 PROBLEMA CRÍTICO (RENOVADO): El préstamo renovado ${item.id} tiene el mismo nombre que su aval: "${item.fullName}"`);
                console.log(`🚨 Esto causará la creación de un registro duplicado en PersonalData!`);
            }
            
            // LOG DETALLADO: Mostrar información del préstamo renovado
            console.log(`📋 DETALLES DEL PRÉSTAMO RENOVADO ${item.id}:`);
            console.log(`   - fullName: "${item.fullName}"`);
            console.log(`   - avalName: "${item.avalName}"`);
            console.log(`   - Son iguales: ${item.fullName === item.avalName ? 'SÍ' : 'NO'}`);
            
            // Verificar cuántos registros de ERIKA existen en este momento
            const erikaCount = await prisma.personalData.count({
                where: { fullName: { contains: 'ERIKA JUSSET PAREDES CHAVEZ' } }
            });
            
            if (erikaCount > 1) {
                console.log(`🚨 ALERTA CRÍTICA (RENOVADO): ERIKA tiene ${erikaCount} registros durante la creación del préstamo renovado ${item.id}!`);
                
                // Mostrar todos los registros de ERIKA
                const erikaRecords = await prisma.personalData.findMany({
                    where: { fullName: { contains: 'ERIKA JUSSET PAREDES CHAVEZ' } },
                    select: { id: true, fullName: true, createdAt: true }
                });
                
                console.log('📊 Registros de ERIKA encontrados (RENOVADO):');
                erikaRecords.forEach((record, index) => {
                    console.log(`   ${index + 1}. ID: ${record.id} | Creado: ${record.createdAt}`);
                });
            }
        }
        
        // 🚨 LOG ESPECÍFICO PARA ALMA ROSA CANUL CHAN en préstamos renovados
        if (item.avalName && item.avalName.includes('ALMA ROSA CANUL CHAN')) {
            console.log(`🚨 ALMA ROSA CANUL CHAN como aval en préstamo renovado ${item.id}:`);
            console.log(`📋 DETALLES DEL PRÉSTAMO RENOVADO ${item.id}:`);
            console.log(`   - fullName: "${item.fullName}"`);
            console.log(`   - avalName: "${item.avalName}"`);
            console.log(`   - Son iguales: ${item.fullName === item.avalName ? 'SÍ' : 'NO'}`);
            console.log(`   - ID del aval: ${avalPersonalDataId}`);
            
            // Verificar cuántos registros de ALMA ROSA existen en este momento
            const almaRosaCount = await prisma.personalData.count({
                where: { fullName: { contains: 'ALMA ROSA CANUL CHAN' } }
            });
            
            if (almaRosaCount > 1) {
                console.log(`🚨 ALERTA CRÍTICA (RENOVADO): ALMA ROSA tiene ${almaRosaCount} registros durante la creación del préstamo renovado ${item.id}!`);
                
                // Mostrar todos los registros de ALMA ROSA
                const almaRosaRecords = await prisma.personalData.findMany({
                    where: { fullName: { contains: 'ALMA ROSA CANUL CHAN' } },
                    select: { id: true, fullName: true, createdAt: true }
                });
                
                console.log('📊 Registros de ALMA ROSA encontrados (RENOVADO):');
                almaRosaRecords.forEach((record, index) => {
                    console.log(`   ${index + 1}. ID: ${record.id} | Creado: ${record.createdAt}`);
                });
            }
        }

        const createdRenovatedLoan = await prisma.loan.create({
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
                avalName: item.avalName, // Mantener por compatibilidad temporal
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

        // Conectar aval como collateral después de crear el préstamo renovado usando SQL directo
        if (avalPersonalDataId) {
            try {
                await prisma.$executeRaw`
                    INSERT INTO "_Loan_collaterals" ("A", "B") 
                    VALUES (${createdRenovatedLoan.id}, ${avalPersonalDataId})
                    ON CONFLICT DO NOTHING
                `;
                // Solo log para ERIKA
                if (item.avalName?.includes('ERIKA JUSSET PAREDES CHAVEZ')) {
                    console.log(`✅ ERIKA conectada al préstamo renovado: ${item.avalName} -> Loan ${item.id} -> ID: ${avalPersonalDataId}`);
                }
            } catch (error) {
                if (item.avalName?.includes('ERIKA JUSSET PAREDES CHAVEZ')) {
                    console.error(`❌ Error conectando ERIKA al préstamo renovado ${item.id}:`, error);
                }
            }
        }
    };

    //OBTEN TODOS LOS LOANS QUE TIENEN UN PREVIOUS LOAN Y MARCA EL PREVIOUS LOAN COMO RENOVATED
    console.log('\n🔄 ========== PROCESANDO PRÉSTAMOS CON PREVIOUS LOAN ==========');
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
    console.log('\n🔄 ========== NORMALIZANDO FINISHED DATE ==========');
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
    // Y establecer renewedDate del préstamo previo igual al signDate del nuevo préstamo
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
                
                // Actualizar tanto finishedDate como renewedDate usando SQL directo para evitar problemas de tipos
                if (!prevFinished) {
                    if(["7150"].includes(l.oldId as string)){
                        console.log('====1338===', prevId, childSign);
                    }
                    return prisma.$executeRaw`
                        UPDATE "Loan" 
                        SET "finishedDate" = ${childSign}, "renewedDate" = ${childSign}
                        WHERE id = ${prevId}
                    `;
                }
                
                if (isSameWorkWeek(prevFinished, childSign) && prevFinished.getTime() !== childSign.getTime()) {
                    return prisma.$executeRaw`
                        UPDATE "Loan" 
                        SET "finishedDate" = ${childSign}, "renewedDate" = ${childSign}
                        WHERE id = ${prevId}
                    `;
                }
                
                return null;
            })
            .filter(u => Boolean(u));

        if (updates.length > 0) {
            const batches = chunkArray(updates, 200);
            for (const batch of batches) {
                await Promise.all(batch);
            }
            console.log(`✅ Sincronizados finishedDate y renewedDate de préstamos previos por renovaciones (>=1 semana): ${updates.length}`);
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

    // Actualizar balances de cuentas (amount = ingresos - egresos) para TODAS las cuentas
    {
        const accounts = await prisma.account.findMany({
            select: { id: true }
        });
        if (accounts.length > 0) {
            const updates = await Promise.all(accounts.map(async acc => {
                const incomes = await prisma.transaction.aggregate({
                    _sum: { amount: true },
                    where: { destinationAccountId: acc.id, type: 'INCOME' }
                });
                const expenses = await prisma.transaction.aggregate({
                    _sum: { amount: true },
                    where: { sourceAccountId: acc.id, type: 'EXPENSE' }
                });
                const incomeSum = Number(incomes._sum.amount ?? 0);
                const expenseSum = Number(expenses._sum.amount ?? 0);
                const balance = incomeSum - expenseSum;
                return prisma.account.update({ where: { id: acc.id }, data: { amount: balance.toFixed(4) } });
            }));
            if (updates.length) {
                console.log(`✅ Balances de cuentas actualizados (global): ${updates.length}`);
            }
        }
    }
    
    // 🚨 LIMPIEZA FINAL: Después de crear TODOS los préstamos, limpiar duplicados restantes
    console.log('\n🚨 ========== LIMPIEZA FINAL DE DUPLICADOS ==========');
    console.log('🔍 Buscando duplicados restantes después de crear préstamos...');
    
    try {
        const finalDuplicates = await prisma.$queryRaw<{fullName: string, count: bigint}[]>`
            SELECT "fullName", COUNT(*) as count
            FROM "PersonalData"
            WHERE "fullName" IS NOT NULL AND "fullName" != ''
            GROUP BY "fullName"
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
        `;
        
        if (finalDuplicates.length === 0) {
            console.log('✅ ÉXITO TOTAL: No quedan duplicados después de crear préstamos!');
        } else {
            console.log(`🚨 ENCONTRADOS ${finalDuplicates.length} NOMBRES DUPLICADOS FINALES!`);
            console.log('📊 TODOS los duplicados restantes:');
            finalDuplicates.forEach((dup, index) => {
                console.log(`   ${index + 1}. "${dup.fullName}": ${dup.count} registros`);
            });
            
            // LIMPIEZA AGRESIVA FINAL
            console.log('\n🧹 EJECUTANDO LIMPIEZA AGRESIVA FINAL...');
            await forceCleanAllDuplicates();
            
            // VERIFICACIÓN FINAL
            console.log('\n🔍 VERIFICACIÓN FINAL DESPUÉS DE LIMPIEZA AGRESIVA...');
            const finalCheck = await prisma.$queryRaw<{fullName: string, count: bigint}[]>`
                SELECT "fullName", COUNT(*) as count
                FROM "PersonalData"
                WHERE "fullName" IS NOT NULL AND "fullName" != ''
                GROUP BY "fullName"
                HAVING COUNT(*) > 1
                ORDER BY COUNT(*) DESC
            `;
            
            if (finalCheck.length === 0) {
                console.log('✅ ÉXITO TOTAL FINAL: No quedan duplicados!');
            } else {
                console.log(`⚠️ ADVERTENCIA FINAL: Aún quedan ${finalCheck.length} nombres duplicados`);
                finalCheck.forEach((dup, index) => {
                    console.log(`   ${index + 1}. "${dup.fullName}": ${dup.count} registros`);
                });
            }
        }
    } catch (error) {
        console.error('❌ Error en limpieza final:', error);
    }
    
    console.log('🚨 ================================================');

    // ========== LIMPIEZA Y REPORTE FINAL DE ERIKA JUSSET PAREDES CHAVEZ ==========
    console.log('\n🔍 ========== REPORTE FINAL: ERIKA JUSSET PAREDES CHAVEZ ==========');
    
    try {
        // Buscar registros de ERIKA en PersonalData
        const erikaPersonalData = await prisma.personalData.findMany({
            where: {
                fullName: {
                    contains: 'ERIKA JUSSET PAREDES CHAVEZ'
                }
            }
        });
        
        console.log(`📊 Total registros de ERIKA encontrados: ${erikaPersonalData.length}`);
        
        if (erikaPersonalData.length > 1) {
            console.log('🧹 LIMPIANDO: ERIKA tiene múltiples registros, consolidando...');
            
            // Consolidar TODOS los préstamos en el primer registro y eliminar duplicados
            const mainErika = erikaPersonalData[0]; // Usar el primer registro como principal
            const duplicatesToDelete: string[] = [];
            
            console.log(`📌 Registro principal: ${mainErika.id}`);
            
            for (let i = 1; i < erikaPersonalData.length; i++) {
                const duplicateErika = erikaPersonalData[i];
                
                // Verificar si tiene préstamos asociados
                const loanCount = await prisma.$queryRaw<{count: bigint}[]>`
                    SELECT COUNT(*) as count 
                    FROM "_Loan_collaterals" 
                    WHERE "B" = ${duplicateErika.id}
                `;
                const count = Number(loanCount[0]?.count || 0);
                console.log(`   Duplicado ${duplicateErika.id} | Préstamos: ${count}`);
                
                if (count > 0) {
                    // Mover TODOS los préstamos al registro principal
                    console.log(`🔄 Moviendo ${count} préstamos de ${duplicateErika.id} → ${mainErika.id}`);
                    await prisma.$executeRaw`
                        UPDATE "_Loan_collaterals" 
                        SET "B" = ${mainErika.id} 
                        WHERE "B" = ${duplicateErika.id}
                    `;
                    
                    // Verificar que se movieron correctamente
                    const remainingCount = await prisma.$queryRaw<{count: bigint}[]>`
                        SELECT COUNT(*) as count 
                        FROM "_Loan_collaterals" 
                        WHERE "B" = ${duplicateErika.id}
                    `;
                    const remaining = Number(remainingCount[0]?.count || 0);
                    
                    if (remaining === 0) {
                        console.log(`✅ Préstamos movidos exitosamente, marcando para eliminación`);
                        duplicatesToDelete.push(duplicateErika.id);
                    } else {
                        console.log(`⚠️ ADVERTENCIA: Aún quedan ${remaining} préstamos en ${duplicateErika.id}, NO eliminando`);
                    }
                } else {
                    console.log(`✅ Sin préstamos, marcando para eliminación`);
                    duplicatesToDelete.push(duplicateErika.id);
                }
            }
            
            // Eliminar duplicados sin préstamos
            if (duplicatesToDelete.length > 0) {
                console.log(`🗑️ Eliminando ${duplicatesToDelete.length} registros duplicados de ERIKA...`);
                await prisma.personalData.deleteMany({
                    where: {
                        id: { in: duplicatesToDelete }
                    }
                });
                console.log(`✅ Duplicados eliminados: ${duplicatesToDelete.join(', ')}`);
            }
            
            // Consultar estado final del registro principal
            const finalLoanResults = await prisma.$queryRaw<{oldId: string}[]>`
                SELECT l."oldId" 
                FROM "_Loan_collaterals" lc
                JOIN "Loan" l ON l.id = lc."A"
                WHERE lc."B" = ${mainErika.id}
            `;
            
            console.log(`✅ CONSOLIDADO: ERIKA ahora tiene un solo registro:`);
            console.log(`   ID: ${mainErika.id}`);
            console.log(`   Nombre: "${mainErika.fullName}"`);
            console.log(`   Préstamos como aval: ${finalLoanResults.length}`);
            if (finalLoanResults.length > 0) {
                console.log(`   IDs de préstamos: ${finalLoanResults.map(l => l.oldId).join(', ')}`);
            }
            
        } else if (erikaPersonalData.length === 1) {
            const erika = erikaPersonalData[0];
            console.log(`✅ ÉXITO: ERIKA tiene un solo registro:`);
            console.log(`   ID: ${erika.id}`);
            console.log(`   Nombre: "${erika.fullName}"`);
            
            // Consultar préstamos donde es aval usando SQL directo
            const loanResults = await prisma.$queryRaw<{oldId: string}[]>`
                SELECT l."oldId" 
                FROM "_Loan_collaterals" lc
                JOIN "Loan" l ON l.id = lc."A"
                WHERE lc."B" = ${erika.id}
            `;
            
            console.log(`   Préstamos como aval: ${loanResults.length}`);
            if (loanResults.length > 0) {
                console.log(`   IDs de préstamos: ${loanResults.map(l => l.oldId).join(', ')}`);
            }
        } else {
            console.log('⚠️ ADVERTENCIA: No se encontraron registros de ERIKA');
        }
        
    } catch (error) {
        console.error('❌ Error consultando/limpiando registros de ERIKA:', error);
    }
    
    console.log('🔍 ================================================================\n');
    
    // VERIFICACIÓN FINAL: ADELINA PALMA TACU
    console.log('\n🎯 ========== VERIFICACIÓN FINAL: ADELINA PALMA TACU ==========');
    try {
        const finalAdelinaCheck = await prisma.personalData.findMany({
            where: { 
                fullName: { 
                    contains: 'ADELINA PALMA TACU',
                    mode: 'insensitive'
                } 
            }
        });
        
        if (finalAdelinaCheck.length === 1) {
            console.log('✅ VERIFICACIÓN FINAL: ADELINA PALMA TACU tiene solo 1 registro');
            console.log(`   ID: ${finalAdelinaCheck[0].id}`);
        } else if (finalAdelinaCheck.length > 1) {
            console.log(`❌ VERIFICACIÓN FINAL: ADELINA PALMA TACU sigue teniendo ${finalAdelinaCheck.length} registros!`);
            console.log('🚨 Ejecutando limpieza de emergencia...');
            await forceCleanAdelina();
        } else {
            console.log('⚠️ VERIFICACIÓN FINAL: No se encontraron registros de ADELINA PALMA TACU');
        }
    } catch (error) {
        console.error('❌ Error en verificación final de ADELINA:', error);
    }
    console.log('🎯 ============================================================\n');
    
    // LOG FINAL: Verificar que la función se completó
    console.log('\n🚀 ========== FUNCIÓN saveDataToDB COMPLETADA ==========');
    console.log('🚀 Esta línea debe aparecer AL FINAL de todo el proceso');
    
    // REPORTE FINAL DEL CACHE DE BORROWERS
    console.log('\n📊 ========== REPORTE FINAL DEL CACHE DE BORROWERS ==========');
    console.log('🔍 Estado del cache antes del reporte final...');
    console.log(`📈 Total de borrowers únicos en cache: ${Object.keys(borrowerCache).length}`);
    if (Object.keys(borrowerCache).length > 0) {
        console.log('📋 Detalle de borrowers en cache:');
        Object.entries(borrowerCache).forEach(([fullName, data], index) => {
            console.log(`   ${index + 1}. "${fullName}" -> Borrower ID: ${data.borrowerId}, PersonalData ID: ${data.personalDataId}`);
        });
    }
    console.log('📊 ============================================================\n');

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