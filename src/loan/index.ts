import { getEmployeeIdsMap } from "../leads";
import { prisma } from "../standaloneApp";
import { chunkArray, convertExcelDate, groupPaymentsByOldLoanId, leads, clearAvalCache, createAllUniqueAvales, getOrAssignAvalId, cleanExistingDuplicates, forceCleanAdelina, forceCleanAllDuplicates, testFunction } from "../utils";
import { ExcelLoanRelationship, ExcelRow, Loan } from "./types";
import { Payments } from "../payments/types";
import { extractPaymentData } from "../payments";
const xlsx = require('xlsx');
// Cache global para mantener borrowers únicos
let borrowerCache: BorrowerCache = {};

const isPhoneValid = (phone?: string): boolean => {
    if (!phone) return false;
    const phoneTrimmed = phone.trim().toUpperCase();
    if (phoneTrimmed === "") return false;
    // Validar que no sea solo espacios, números inválidos, o valores vacíos
    if (phoneTrimmed === "0" || phoneTrimmed === "00" || phoneTrimmed === "000") return false;
    // Validar que contenga al menos algunos dígitos válidos
    const hasValidDigits = /[0-9]/.test(phoneTrimmed);
    if (!hasValidDigits) return false;
    return !["NA", "N/A", "N", "UNDEFINED", "PENDIENTE", "NULL", "NONE", "EMPTY", "VACIO", "SIN TELEFONO", "SIN TELEFONO", "NO TIENE", "NO APLICA"].includes(phoneTrimmed);
}


// Función para generar clientCode de 6 dígitos (misma lógica que en leads)
const generateClientCode = async (): Promise<string> => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const length = 6;
    const generate = () => Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    let attempts = 0;
    let code = generate();
    
    try {
        while (attempts < 5) {
            const existing = await prisma.personalData.findUnique({ where: { clientCode: code } as any });
            if (!existing) break;
            code = generate();
            attempts++;
        }
        return code;
    } catch (e) {
        console.error('Error generating clientCode:', e);
        return generate(); // Fallback si hay error
    }
};

// NUEVO: Locks para evitar race conditions
const borrowerLocks: Map<string, Promise<{ borrowerId: string; personalDataId: string }>> = new Map();
// Cache en memoria para reutilizar borrowers
interface BorrowerCache {
    [fullName: string]: {
        borrowerId: string;
        personalDataId: string;
        fullName: string;
    };
}

// Cache global para mantener borrowers únicos
const getOrCreateBorrower = async (fullName: string, titularPhone?: string): Promise<{ borrowerId: string; personalDataId: string }> => {
    if (!fullName || fullName.trim() === '') {
        throw new Error('❌ Nombre vacío, no se puede crear borrower');
    }

    const normalizedName = fullName.trim();

    // Lógica de cache y locks (sin cambios)
    if (borrowerLocks.has(normalizedName)) {
        return await borrowerLocks.get(normalizedName)!;
    }
    if (borrowerCache[normalizedName]) {
        return borrowerCache[normalizedName];
    }

    const lockPromise = (async () => {
        try {
            // Doble verificación (sin cambios)
            if (borrowerCache[normalizedName]) {
                return borrowerCache[normalizedName];
            }

            // Buscar en base de datos
            const existingPersonalData = await prisma.personalData.findFirst({
                where: { fullName: normalizedName },
                include: { borrower: true, phones: true } // Incluir teléfonos para comparar
            });

            if (existingPersonalData) {
                // ---- LÓGICA DE ACTUALIZACIÓN INTELIGENTE ----
                // Obtener el teléfono actual
                const currentPhone = existingPersonalData.phones.length > 0 ? existingPersonalData.phones[0].number : null;
                const newPhone = String(titularPhone || '');
                
                // Lógica mejorada: siempre actualizar si:
                // 1. El nuevo teléfono es válido Y diferente al actual, O
                // 2. El teléfono actual no es válido (vacío/inválido) Y el nuevo es válido, O
                // 3. El teléfono actual no existe y el nuevo es válido
                const shouldUpdate = (
                    (isPhoneValid(titularPhone) && currentPhone !== newPhone) ||
                    (!isPhoneValid(currentPhone || undefined) && isPhoneValid(titularPhone)) ||
                    (!currentPhone && isPhoneValid(titularPhone))
                );
                
                if (shouldUpdate) {
                    await prisma.personalData.update({
                        where: { id: existingPersonalData.id },
                        data: {
                            phones: {
                                deleteMany: {}, // Borra teléfonos antiguos
                                create: { number: newPhone }, // Crea el nuevo
                            },
                        },
                    });
                } else if (isPhoneValid(titularPhone) && currentPhone === newPhone) {
                } else if (!isPhoneValid(titularPhone)) {
                }
                // ---- FIN DE LA LÓGICA DE ACTUALIZACIÓN ----

                let borrowerId: string;
                if (existingPersonalData.borrower) {
                    borrowerId = existingPersonalData.borrower.id;
                } else {
                    const newBorrower = await prisma.borrower.create({
                        data: { personalData: { connect: { id: existingPersonalData.id } } }
                    });
                    borrowerId = newBorrower.id;
                }

                const result = { borrowerId, personalDataId: existingPersonalData.id, fullName: normalizedName };
                borrowerCache[normalizedName] = result;
                return { borrowerId, personalDataId: existingPersonalData.id };
            }

            // Crear nuevo personalData y borrower (solo si no existe)
            const newPersonalData = await prisma.personalData.create({
                data: {
                    fullName: normalizedName,
                    // Solo creamos el teléfono si es válido
                    phones: isPhoneValid(titularPhone) ? {
                        create: { number: String(titularPhone) }
                    } : undefined,
                }
            });

            const newBorrower = await prisma.borrower.create({
                data: { personalData: { connect: { id: newPersonalData.id } } }
            });

            const result = { borrowerId: newBorrower.id, personalDataId: newPersonalData.id, fullName: normalizedName };
            borrowerCache[normalizedName] = result;
            return { borrowerId: newBorrower.id, personalDataId: newPersonalData.id };

        } finally {
            borrowerLocks.delete(normalizedName);
        }
    })();

    borrowerLocks.set(normalizedName, lockPromise);
    return lockPromise;
};
// Función para obtener o crear borrower basándose en el fullName


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
            
            // Debug general para extracción de datos
            if (obj.titularPhone && obj.titularPhone.trim() !== "" && !["NA", "N/A", "N", "undefined", "PENDIENTE"].includes(obj.titularPhone)) {
            }
            
            // Debug específico para oldId 6620
            if (obj.id === 6620) {
                console.log(`🔍 DEBUG EXTRACCIÓN 6620:`, {
                    id: obj.id,
                    fullName: obj.fullName,
                    titularPhone: obj.titularPhone,
                    rawTitularPhone: row[29],
                    avalPhone: obj.avalPhone,
                    rawAvalPhone: row[28],
                    avalName: obj.avalName,
                    rawAvalName: row[27]
                });
            }
            
            return obj as Loan;
        });
    loansData.sort((a: Loan, b: Loan) => {
        if (a.givedDate && b.givedDate) {
            return a.givedDate.getTime() - b.givedDate.getTime();
        }
        return 0; // Mantener el orden si las fechas son nulas
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

// Función para validar si un préstamo ya existe en la base de datos
const checkLoanDuplicate = async (loan: Loan, routeName: string): Promise<boolean> => {
    try {
        // Buscar préstamos existentes con el mismo nombre de cliente, fecha de otorgado y cantidad otorgada
        // NO validamos la ruta porque el mismo crédito puede existir en diferentes rutas (error en Excel)
        const existingLoan = await prisma.loan.findFirst({
            where: {
                borrower: {
                    personalData: {
                        fullName: loan.fullName
                    }
                },
                signDate: loan.givedDate,
                amountGived: loan.givedAmount.toString()
                // Removido: snapshotRouteName: routeName
            },
            include: {
                borrower: {
                    include: {
                        personalData: true
                    }
                }
            }
        });

        if (existingLoan) {
            console.log(`⚠️ DUPLICADO ENCONTRADO: Cliente "${loan.fullName}" con fecha ${loan.givedDate} y monto ${loan.givedAmount} ya existe`);
            console.log(`   Préstamo existente ID: ${existingLoan.id}, oldId: ${existingLoan.oldId}, Ruta: ${existingLoan.snapshotRouteName}`);
            console.log(`   Ruta actual: "${routeName}" - Este préstamo se OMITIRÁ para evitar duplicados`);
            return true;
        }

        return false;
    } catch (error) {
        console.error('❌ Error verificando duplicado:', error);
        return false; // En caso de error, permitir la inserción
    }
};

// Función para generar oldId único con prefijo de ruta
const generateUniqueOldId = (routeName: string, originalId: string | number): string => {
    return `${routeName}-${originalId}`;
};

// Función para buscar un préstamo previo por su ID original (sin prefijo de ruta)
const findPreviousLoan = async (previousLoanId: string | number, routeName: string): Promise<any> => {
    try {
        // Primero intentar buscar por el oldId con prefijo de ruta
        const loanWithPrefix = await prisma.loan.findUnique({
            where: {
                oldId: generateUniqueOldId(routeName, previousLoanId),
            },
            include: {
                payments: {
                    include: {
                        transactions: true,
                    }
                },
            }
        });

        if (loanWithPrefix) {
            return loanWithPrefix;
        }

        // Si no se encuentra, buscar por el ID original sin prefijo (para compatibilidad con préstamos existentes)
        const loanWithoutPrefix = await prisma.loan.findFirst({
            where: {
                oldId: String(previousLoanId),
            },
            include: {
                payments: {
                    include: {
                        transactions: true,
                    }
                },
            }
        });

        if (loanWithoutPrefix) {
            console.log(`⚠️ PRÉSTAMO PREVIO ENCONTRADO SIN PREFIJO DE RUTA: ${previousLoanId} -> ${loanWithoutPrefix.id}`);
            return loanWithoutPrefix;
        }

        console.log(`❌ PRÉSTAMO PREVIO NO ENCONTRADO: ${previousLoanId}`);
        return null;
    } catch (error) {
        console.error('❌ Error buscando préstamo previo:', error);
        return null;
    }
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

    // CORRECCIÓN: Actualizar todos los PersonalData existentes que no tengan clientCode
    console.log('\n🔧 ========== CORRIGIENDO CLIENTCODES FALTANTES ==========');
    try {
        const personalDataWithoutClientCode = await prisma.personalData.findMany({
            where: {
                clientCode: null
            },
            select: {
                id: true,
                fullName: true
            }
        });
        
        if (personalDataWithoutClientCode.length > 0) {
            console.log(`🔧 Encontrados ${personalDataWithoutClientCode.length} PersonalData sin clientCode`);
            
            const batches = chunkArray(personalDataWithoutClientCode, 100);
            for (const batch of batches) {
                const updates = [];
                for (const pd of batch) {
                    const clientCode = await generateClientCode();
                    updates.push(prisma.personalData.update({
                        where: { id: pd.id },
                        data: { clientCode: clientCode }
                    }));
                }
                await prisma.$transaction(updates);
            }
            
            console.log(`✅ Corregidos ${personalDataWithoutClientCode.length} PersonalData con clientCode`);
        } else {
            console.log('✅ Todos los PersonalData ya tienen clientCode');
        }
    } catch (error) {
        console.error('❌ Error corrigiendo clientCodes:', error);
    }
    console.log('🔧 ================================================\n');

    // Pre-crear todos los avales únicos
    await createAllUniqueAvales(loans);

    const renovatedLoans = loans.filter(item => item && item.previousLoanId !== undefined);
    const notRenovatedLoans = loans.filter(item => item && item.previousLoanId === undefined);
    console.log('notRenovatedLoans', notRenovatedLoans.length);
    console.log('renovatedLoans', renovatedLoans.length);

    // LOG DE VALIDACIÓN DE DUPLICADOS
    console.log('\n🔍 ========== VALIDACIÓN DE DUPLICADOS ==========');
    console.log(`🔍 Implementando validación de duplicados para la ruta: "${snapshotData.routeName}"`);
    console.log(`🔍 Criterios de validación: nombre del cliente + fecha de otorgado + cantidad otorgada`);
    console.log(`🔍 ⚠️ NO se valida la ruta porque el mismo crédito puede existir en diferentes rutas (error en Excel)`);
    console.log(`🔍 Los oldId ahora incluyen prefijo de ruta: "${snapshotData.routeName}-{id}"`);
    console.log('🔍 ==============================================\n');



    //Create the loanTypes - Verificar si ya existen antes de crear
    let fourteenWeeksId = await prisma.loantype.findFirst({
        where: {
            name: '14 semanas/40%',
            weekDuration: 14,
            rate: '0.4',
        }
    });
    
    if (!fourteenWeeksId) {
        fourteenWeeksId = await prisma.loantype.create({
        data: {
            name: '14 semanas/40%',
            weekDuration: 14,
            rate: '0.4',
            loanGrantedComission: '80',
            loanPaymentComission: '8',
        }
    });
        console.log('✅ Creado loantype: 14 semanas/40%');
    } else {
        console.log('🔄 Reutilizando loantype existente: 14 semanas/40%');
    }

    let teennWeeksId = await prisma.loantype.findFirst({
        where: {
            name: '10 semanas/0%',
            weekDuration: 10,
            rate: '0',
        }
    });
    
    if (!teennWeeksId) {
        teennWeeksId = await prisma.loantype.create({
            data: {
                name: '10 semanas/0%',
                weekDuration: 10,
                rate: '0',
            }
        });
        console.log('✅ Creado loantype: 10 semanas/0%');
    } else {
        console.log('🔄 Reutilizando loantype existente: 10 semanas/0%');
    }

    let twentyWeeksId = await prisma.loantype.findFirst({
        where: {
            name: '20 semanas/0%',
            weekDuration: 20,
            rate: '0.1',
        }
    });
    
    if (!twentyWeeksId) {
        twentyWeeksId = await prisma.loantype.create({
            data: {
                name: '20 semanas/0%',
                weekDuration: 20,
                rate: '0.1',
            }
        });
        console.log('✅ Creado loantype: 20 semanas/0%');
    } else {
        console.log('🔄 Reutilizando loantype existente: 20 semanas/0%');
    }


    const groupedPayments = groupPaymentsByOldLoanId(payments);
    if (leadMapping && Object.keys(leadMapping).length > 0) {
        console.log('leadMapping', leadMapping);
        console.log('==========================');
        console.log('==========================');
        console.log('==========================');
        console.log('==========================');

    }
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
    const batches = chunkArray(notRenovatedLoans, 100);
    
    // Log removido para limpiar la consola


    let loansProcessed = 0;
    let loansSkippedDuplicates = 0;
    let renovatedLoansProcessed = 0;
    let loansWithoutLead = 0;
    let loansFinished = 0; // Contador para préstamos marcados como terminados
    let falcoLossTransactionsCreated = 0; // Contador para transacciones FALCO_LOSS
    
    // Mapa para mantener registro de clientes FALCO con su oldId
    const falcoClientsMap: { [oldId: string]: { 
        id: string, 
        fullName: string, 
        amount: number,
        transactionId: string,
        leadId: string
    } } = {};

    for (const [batchIndex, batch] of batches.entries()) {
        let processedLoans = 0;
        console.log(`\n🔄 ========== PROCESANDO BATCH ${batchIndex + 1}/${batches.length} ==========`);
        console.log(`📋 Elementos en este batch: ${batch.length}`);
        const transactionPromises = batch.map(async (item) => {
            /* if (!groupedPayments[item.id]) {
                return;
            } */

            // Obtener el ID del lead específico para este préstamo
            const specificLeadId = employeeIdsMap[item.leadId.toString()];
            if (!specificLeadId) {
                // Log removido para limpiar la consola
                loansWithoutLead++;
                return Promise.resolve(null); // Return resolved null to filter later
            }

            // Verificar que el lead existe en el mapeo (redundante, ya verificado arriba)
            // if (!specificLeadId) {
            //     loansWithoutLead++;
            //     return null;
            // }

            // VALIDACIÓN DE DUPLICADOS: Verificar si el préstamo ya existe
            /* console.log(`🔍 Verificando duplicado para préstamo: ${item.id} - ${item.fullName}`); */
            const isDuplicate = await checkLoanDuplicate(item, snapshotData.routeName);
            if (isDuplicate) {
                /* console.log(`⏭️ OMITIENDO PRÉSTAMO DUPLICADO: ${item.id} - ${item.fullName}`); */
                loansSkippedDuplicates++;
                return Promise.resolve(null); // Omitir este préstamo
            } else {
                /* console.log(`✅ PRÉSTAMO ÚNICO: ${item.id} - ${item.fullName} (procesando...)`); */
            }

            // DETECCIÓN DE CLIENTES FALCO: Si el nombre contiene "falco " (con espacio)
            if (item.fullName.toLowerCase().includes('falco ')) {
                console.log(`🚨 CLIENTE FALCO DETECTADO: ${item.id} - ${item.fullName}`);
                
                // Crear transacción FALCO_LOSS en lugar de préstamo
                const falcoTransaction = await prisma.transaction.create({
                    data: {
                        amount: item.givedAmount.toString(),
                        date: item.givedDate,
                        type: 'EXPENSE',
                        expenseSource: 'FALCO_LOSS',
                        description: `Pérdida FALCO - ${item.fullName}`,
                        routeId: snapshotData.routeId,
                        snapshotLeadId: specificLeadId,
                        sourceAccountId: cashAccountId,
                        // No destinationAccount para pérdidas
                    }
                });
                
                // Guardar en el mapa de Falcos usando item.id como clave (que debería ser igual a payment.oldId)
                falcoClientsMap[item.id.toString()] = {
                    id: item.id.toString(),
                    fullName: item.fullName,
                    amount: item.givedAmount,
                    transactionId: falcoTransaction.id,
                    leadId: specificLeadId // Agregar el leadId para usarlo en los abonos
                };
                
                falcoLossTransactionsCreated++;
                console.log(`✅ Transacción FALCO_LOSS creada: $${item.givedAmount} para ${item.fullName}`);
                console.log(`📊 Total de FALCO detectados hasta ahora: ${Object.keys(falcoClientsMap).length}`);
                console.log(`🔍 Transacción creada con ID: ${falcoTransaction.id}`);
                console.log(`🔍 Clave guardada en falcoClientsMap: ${item.id.toString()}`);
                
                // Retornar null para no procesar como préstamo
                return Promise.resolve(null);
            }

            // Obtener los pagos para este préstamo
            const paymentsForLoan = groupedPayments[item.id] || [];

            // Obtener o crear borrower usando el cache (evita duplicados)
            const { borrowerId, personalDataId } = await getOrCreateBorrower(item.fullName, item.titularPhone);

            // Obtener ID del aval (ya pre-creado)
            const avalPersonalDataId = await getOrAssignAvalId(item.avalName);

            processedLoans++;


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
                    oldId: generateUniqueOldId(snapshotData.routeName, item.id),
                    status: determineLoanStatus(item, loans),
                    badDebtDate: item.badDebtDate,
                    snapshotRouteId: snapshotData.routeId,
                    snapshotRouteName: snapshotData.routeName,
                    snapshotLeadId: specificLeadId,
                    snapshotLeadAssignedAt: snapshotData.leadAssignedAt,
                    payments: {
                        create: paymentsForLoan.map(payment => {

                            const loanType = item.noWeeks === 14 ? fourteenWeeksId : item.noWeeks === 20 ? twentyWeeksId : teennWeeksId;

                            const baseProfit = Number(item.requestedAmount) * (loanType.rate ? Number(loanType.rate) : 0);
                            const rate = loanType.rate ? Number(loanType.rate) : 0;
                            const totalAmountToPay = Number(item.requestedAmount) + baseProfit;
                            const profitAmount = payment.amount * baseProfit / (totalAmountToPay);

                            if (["1873"].includes(item.id.toString())) {
                                // Logs comentados removidos
                            }

                            return {
                                oldLoanId: generateUniqueOldId(snapshotData.routeName, item.id),
                                receivedAt: payment.paymentDate,
                                amount: payment.amount,

                                //profitAmounst: item.badDebtDate && payment.paymentDate > item.badDebtDate? payment.amount: profitAmount,
                                //returnToCapital: item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0:payment.amount - profitAmount,
                                type: payment.type,
                                transactions: {
                                    create: {
                                        profitAmount: item.badDebtDate && payment.paymentDate > item.badDebtDate ? payment.amount : profitAmount,
                                        returnToCapital: item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0 : payment.amount - profitAmount,
                                        amount: payment.amount,
                                        date: payment.paymentDate,
                                        destinationAccountId: payment.description === 'DEPOSITO' ? bankAccount : cashAccountId,
                                        type: 'INCOME',
                                        incomeSource: payment.description === 'DEPOSITO' ? 'BANK_LOAN_PAYMENT' : 'CASH_LOAN_PAYMENT',
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
                    
                } catch (error) {
                   
                }
            }

            return createdLoan;
        });
        const results = await Promise.all(transactionPromises);
        const validLoans = results.filter(item => item !== null && item !== undefined);

        // Línea 512 - Verificar si hay préstamos válidos
        if (validLoans.length > 0) {
            try {
                // Ya no necesitamos hacer Promise.all otra vez porque validLoans ya contiene los resultados
                loansProcessed += validLoans.length;
            } catch (error) {
                console.log('error saving loans 244', error);
            }
        } else {
            console.log(`⚠️ Batch sin préstamos válidos para procesar`);
        }

        // RESUMEN DEL BATCH
        const batchSkipped = batch.length - validLoans.length;
        if (batchSkipped > 0) {
            console.log(`📊 RESUMEN DEL BATCH: ${batch.length} total, ${validLoans.length} procesados, ${batchSkipped} omitidos (duplicados/sin lead)`);
        }
        console.log(`✅ BATCH ${batchIndex + 1}/${batches.length} COMPLETADO`);
        console.log('🔄 ================================================\n');
    };

    // RESUMEN FINAL DEL PROCESAMIENTO DE BATCHES
    console.log('\n📊 ========== RESUMEN FINAL DEL PROCESAMIENTO ==========');
    console.log(`✅ Total de préstamos normales procesados: ${loansProcessed}`);
    console.log(`🔄 Total de préstamos renovados procesados: ${renovatedLoansProcessed}`);
    console.log(`⏭️ Total de préstamos omitidos por duplicados: ${loansSkippedDuplicates}`);
    console.log(`⚠️ Total de préstamos sin lead: ${loansWithoutLead}`);
    console.log(`🚨 Total de transacciones FALCO_LOSS creadas: ${falcoLossTransactionsCreated}`);
    console.log(`📈 Total de préstamos únicos creados: ${loansProcessed + renovatedLoansProcessed}`);
    console.log('📊 ===================================================\n');

    // PROCESAR ABONOS DE CLIENTES FALCO
    if (Object.keys(falcoClientsMap).length > 0) {
        console.log('\n🚨 ========== PROCESANDO ABONOS DE CLIENTES FALCO ==========');
        console.log(`📊 Total de clientes FALCO detectados: ${Object.keys(falcoClientsMap).length}`);
        console.log(`🔍 Claves en falcoClientsMap:`, Object.keys(falcoClientsMap));
        console.log(`🔍 Claves en groupedPayments:`, Object.keys(groupedPayments));
        console.log(`🔍 Contenido de falcoClientsMap:`, JSON.stringify(falcoClientsMap, null, 2));
        console.log(`🔍 Primeros 5 pagos en groupedPayments:`, Object.entries(groupedPayments).slice(0, 5));
        console.log(`🔍 Verificando relación entre IDs: item.id vs payment.oldId`);
        
        // Verificar si hay coincidencias entre falcoClientsMap y groupedPayments
        const falcoIds = Object.keys(falcoClientsMap);
        const paymentIds = Object.keys(groupedPayments);
        const matchingIds = falcoIds.filter(id => paymentIds.includes(id));
        console.log(`🔍 IDs coincidentes entre FALCO y pagos:`, matchingIds);
        
        let falcoPaymentsProcessed = 0;
        
        // Buscar abonos que correspondan a clientes FALCO
        for (const [falcoOldId, falcoClient] of Object.entries(falcoClientsMap)) {
            console.log(`🔍 Buscando pagos para FALCO con ID: ${falcoOldId}`);
            console.log(`🔍 Cliente FALCO: ${falcoClient.fullName}, Monto: $${falcoClient.amount}`);
            const falcoPayments = groupedPayments[falcoOldId] || [];
            console.log(`💰 Pagos encontrados para FALCO ${falcoOldId}:`, falcoPayments.length);
            
            if (falcoPayments.length === 0) {
                console.log(`⚠️ NO se encontraron pagos para FALCO ${falcoOldId} - ${falcoClient.fullName}`);
                console.log(`🔍 Claves disponibles en groupedPayments:`, Object.keys(groupedPayments).slice(0, 10));
            }
            
            if (falcoPayments.length > 0) {
                console.log(`💰 Procesando ${falcoPayments.length} abonos para cliente FALCO: ${falcoClient.fullName}`);
                
                for (const payment of falcoPayments) {
                    console.log(`🔍 Procesando pago:`, payment);
                    if (payment.amount > 0) {
                        try {
                            console.log(`🔍 Intentando crear falcoCompensatoryPayment para pago: $${payment.amount}`);
                            
                            // Crear registro en falcoCompensatoryPayment
                            const falcoCompensatoryPayment = await prisma.falcoCompensatoryPayment.create({
                                data: {
                                    amount: payment.amount.toString(),
                                    leadPaymentReceived: {
                                        create: {
                                            expectedAmount: falcoClient.amount.toString(),
                                            paidAmount: payment.amount.toString(),
                                            cashPaidAmount: payment.description === 'DEPOSITO' ? '0' : payment.amount.toString(),
                                            bankPaidAmount: payment.description === 'DEPOSITO' ? payment.amount.toString() : '0',
                                            falcoAmount: payment.amount.toString(),
                                            paymentStatus: 'PAID',
                                            agentId: falcoClient.leadId, // Usar el leadId guardado en falcoClient
                                            leadId: falcoClient.leadId,  // Usar el leadId guardado en falcoClient
                                        }
                                    }
                                }
                            });
                            
                            console.log(`✅ falcoCompensatoryPayment creado con ID: ${falcoCompensatoryPayment.id}`);
                            
                            // Actualizar la transacción FALCO_LOSS restando la cantidad abonada
                            console.log(`🔍 Actualizando transacción FALCO con ID: ${falcoClient.transactionId}`);
                            const currentTransaction = await prisma.transaction.findUnique({
                                where: { id: falcoClient.transactionId },
                                select: { amount: true }
                            });
                            
                            if (currentTransaction) {
                                const currentAmount = Number(currentTransaction.amount);
                                const newAmount = Math.max(0, currentAmount - Number(payment.amount));
                                
                                console.log(`🔍 Monto actual: $${currentAmount}, Monto del pago: $${payment.amount}, Nuevo monto: $${newAmount}`);
                                
                                await prisma.transaction.update({
                                    where: { id: falcoClient.transactionId },
                                    data: { 
                                        amount: newAmount.toString(),
                                        description: `Pérdida FALCO - ${falcoClient.fullName} (Pendiente: $${newAmount.toFixed(2)})`
                                    }
                                });
                                
                                console.log(`✅ Transacción FALCO actualizada correctamente`);
                                falcoPaymentsProcessed++;
                                console.log(`✅ Abono FALCO procesado: $${payment.amount} para ${falcoClient.fullName} - Pendiente actualizado: $${newAmount.toFixed(2)}`);
                            } else {
                                console.error(`❌ No se encontró la transacción FALCO con ID: ${falcoClient.transactionId}`);
                            }
                        } catch (error) {
                            console.error(`❌ Error procesando abono FALCO para ${falcoClient.fullName}:`, error);
                        }
                    }
                }
            }
        }
        
        console.log(`📊 Total de abonos FALCO procesados: ${falcoPaymentsProcessed}`);
        console.log('🚨 ===================================================\n');
    } else {
        console.log('\n🚨 ========== NO SE DETECTARON CLIENTES FALCO ==========');
        console.log('📊 No se encontraron clientes con "falco " en el nombre');
        console.log('🚨 ===================================================\n');
    }

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
        /* console.log(`🔄 Procesando préstamo renovado: ${item.id} - ${item.fullName} (previousLoanId: ${item.previousLoanId})`); */

        const existPreviousLoan = item.previousLoanId && loanIdsMap[item.previousLoanId];
        if (!item.previousLoanId) {
            console.log(`⚠️ Préstamo renovado sin previousLoanId: ${item.id} - ${item.fullName}`);
            continue;
        }
        const previousLoan = await findPreviousLoan(item.previousLoanId, snapshotData.routeName);
        if (previousLoan) {
            /* console.log(`✅ Préstamo previo encontrado: ${item.previousLoanId} -> ${previousLoan.id} (${previousLoan.oldId})`); */
        } else {
            /* console.log(`❌ Préstamo previo NO encontrado: ${item.previousLoanId} - ${item.fullName}`); */
            continue; // Omitir este préstamo renovado si no se encuentra el previo
        }
        if (item.previousLoanId === '5805') {
            /* console.log('====5805===', previousLoan, loanIdsMap); */
        }

        const loanType = item.noWeeks === 14 ? fourteenWeeksId : item.noWeeks === 20 ? twentyWeeksId : teennWeeksId;
        const rate = loanType.rate ? Number(loanType.rate) : 0;
        const previousLoanProfitAmount = previousLoan?.profitAmount ? Number(previousLoan.profitAmount) : 0;
        const payedProfitFromPreviousLoan = previousLoan?.payments.reduce((acc: number, payment: any) => {
            const transactionProfit = payment.transactions.reduce((transAcc: number, transaction: any) => transAcc + (transaction.profitAmount ? Number(transaction.profitAmount) : 0), 0);
            return acc + transactionProfit;
        }, 0) || 0;

        const profitPendingFromPreviousLoan = previousLoanProfitAmount - (payedProfitFromPreviousLoan ?? 0);
        const baseProfit = Number(item.requestedAmount) * rate;
        const profitAmount = baseProfit + Number(profitPendingFromPreviousLoan);
        
        // Obtener el ID del lead específico para este préstamo renovado
        const specificLeadId = employeeIdsMap[item.leadId.toString()];
        if (!specificLeadId) {
            // Log removido para limpiar la consola
            loansWithoutLead++;
            continue; // Usar continue en lugar de return para continuar con el siguiente préstamo
        }

        // Obtener ID del aval para préstamo renovado (ya pre-creado)
        const avalPersonalDataId = await getOrAssignAvalId(item.avalName);

        // ACTUALIZAR TELÉFONO PARA PRÉSTAMOS RENOVADOS
        // Si hay un préstamo previo, actualizar el teléfono del borrower existente
        if (previousLoan?.borrowerId) {
            try {
                const borrower = await prisma.borrower.findUnique({
                    where: { id: previousLoan.borrowerId },
                    include: { personalData: { include: { phones: true } } }
                });
                
                if (borrower?.personalData) {
                    const currentPhone = borrower.personalData.phones.length > 0 ? borrower.personalData.phones[0].number : null;
                    const newPhone = String(item.titularPhone || '');
                    
                    // Aplicar la misma lógica de actualización que en getOrCreateBorrower
                    const shouldUpdate = (
                        (isPhoneValid(item.titularPhone) && currentPhone !== newPhone) ||
                        (!isPhoneValid(currentPhone || undefined) && isPhoneValid(item.titularPhone)) ||
                        (!currentPhone && isPhoneValid(item.titularPhone))
                    );
                    
                    if (shouldUpdate) {
                        await prisma.personalData.update({
                            where: { id: borrower.personalData.id },
                            data: {
                                phones: {
                                    deleteMany: {},
                                    create: { number: newPhone },
                                },
                            },
                        });
                        console.log(`📞 Teléfono actualizado para préstamo renovado "${item.fullName}": ${currentPhone || 'N/A'} -> ${newPhone}`);
                    } else if (isPhoneValid(item.titularPhone) && currentPhone === newPhone) {
                        console.log(`📞 Teléfono ya actualizado para préstamo renovado "${item.fullName}": ${newPhone}`);
                    } else if (!isPhoneValid(item.titularPhone)) {
                        console.log(`📞 Teléfono inválido para préstamo renovado "${item.fullName}": "${item.titularPhone}" - manteniendo teléfono anterior: ${currentPhone || 'N/A'}`);
                    }
                }
            } catch (error) {
                console.error(`❌ Error actualizando teléfono para préstamo renovado ${item.fullName}:`, error);
            }
        }

        const createdRenovatedLoan = await prisma.loan.create({
            data: {
                oldId: generateUniqueOldId(snapshotData.routeName, item.id),
                signDate: item.givedDate,
                amountGived: item.givedAmount.toString(),
                requestedAmount: item.requestedAmount.toString(),
                badDebtDate: item.badDebtDate,
                loantype: {
                    connect: {
                        id: item.noWeeks === 14 ? fourteenWeeksId.id : item.noWeeks === 20 ? twentyWeeksId.id : teennWeeksId.id,
                    },
                },
                lead: {
                    connect: {
                        id: specificLeadId,
                    }
                },
                status: determineLoanStatus(item, loans),
                finishedDate: item.finishedDate,
                borrower: previousLoan?.borrowerId ? {
                    connect: {
                        id: previousLoan.borrowerId,
                    }
                } : await (async () => {
                    // If no previous loan borrower, create/get one for this loan
                    const { borrowerId } = await getOrCreateBorrower(item.fullName, item.titularPhone);
                    return { connect: { id: borrowerId } };
                })(),
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


                        if (["3292"].includes(item.id.toString())) {
                            // Logs comentados removidos
                        }
                        return {
                            oldLoanId: generateUniqueOldId(snapshotData.routeName, item.id),
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
                                    destinationAccountId: payment.description === 'DEPOSITO' ? bankAccount : cashAccountId,
                                    type: 'INCOME',
                                    incomeSource: payment.description === 'DEPOSITO' ? 'BANK_LOAN_PAYMENT' : 'CASH_LOAN_PAYMENT',
                                    profitAmount: item.badDebtDate && payment.paymentDate > item.badDebtDate ? payment.amount : profitAmount,
                                    returnToCapital: item.badDebtDate && payment.paymentDate > item.badDebtDate ? 0 : payment.amount - profitAmount,
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
               
            } catch (error) {
                
            }
        }

        renovatedLoansProcessed++;
        /* console.log(`✅ Préstamo renovado creado exitosamente: ${item.id} - ${item.fullName}`); */
    };

    // RESUMEN DE PRÉSTAMOS RENOVADOS
    console.log('\n📊 ========== RESUMEN DE PRÉSTAMOS RENOVADOS ==========');
    console.log(`✅ Total de préstamos renovados procesados exitosamente: ${renovatedLoansProcessed}`);
    console.log(`📈 Total de préstamos renovados únicos creados: ${renovatedLoansProcessed}`);
    console.log('📊 ===================================================\n');

    //OBTEN TODOS LOS LOANS QUE TIENEN UN PREVIOUS LOAN Y MARCA EL PREVIOUS LOAN COMO RENOVATED
    /* console.log('\n🔄 ========== PROCESANDO PRÉSTAMOS CON PREVIOUS LOAN =========='); */
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
                    if (["7150"].includes(l.oldId as string)) {
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
    // NUEVO: Detectar y actualizar préstamos pagados al 100% sin finishedDate
{
    console.log('\n🔍 ========== DETECTANDO PRÉSTAMOS PAGADOS AL 100% ==========');
    
    // Buscar préstamos sin finishedDate pero con pendingAmountStored = 0 o muy cercano a 0
    const fullyPaidLoansWithoutFinish = await prisma.loan.findMany({
        where: {
            snapshotRouteId: snapshotData.routeId,
            finishedDate: null,
            OR: [
                { pendingAmountStored: "0" },
                { pendingAmountStored: "0.00" },
                // Considerar también valores muy pequeños (< 1) como pagados
                {
                    AND: [
                        { pendingAmountStored: { not: null } },
                        { pendingAmountStored: { lt: "1" } },
                        { pendingAmountStored: { gte: "0" } }
                    ]
                }
            ]
        },
        select: {
            id: true,
            oldId: true,
            pendingAmountStored: true,
            payments: {
                select: {
                    receivedAt: true
                },
                orderBy: {
                    receivedAt: 'desc'
                }
            }
        }
    });
    
    console.log(`📊 Préstamos pagados al 100% sin fecha de término: ${fullyPaidLoansWithoutFinish.length}`);
    
    if (fullyPaidLoansWithoutFinish.length > 0) {
        // Preparar actualizaciones
        const updatePromises = fullyPaidLoansWithoutFinish
            .filter(loan => loan.payments && loan.payments.length > 0)
            .map(loan => {
                // Obtener la fecha del último pago
                const lastPaymentDate = loan.payments[0].receivedAt; // Ya ordenado DESC
                
                
                return prisma.loan.update({
                    where: { id: loan.id },
                    data: {
                        finishedDate: lastPaymentDate,
                        status: 'FINISHED' // También actualizar el status
                    }
                });
            });
        
        // Ejecutar actualizaciones en batches para mejor performance
        if (updatePromises.length > 0) {
            const batches = chunkArray(updatePromises, 200);
            let totalUpdated = 0;
            
            for (const batch of batches) {
                await prisma.$transaction(batch);
                totalUpdated += batch.length;
            }
            
            console.log(`✅ Actualizados ${updatePromises.length} préstamos con finishedDate automático`);
            
            // Log de verificación
            const verificationSample = fullyPaidLoansWithoutFinish.slice(0, 5);
            if (verificationSample.length > 0) {
                console.log('📋 Muestra de préstamos actualizados:');
                for (const loan of verificationSample) {
                    const updated = await prisma.loan.findUnique({
                        where: { id: loan.id },
                        select: { oldId: true, finishedDate: true, status: true, pendingAmountStored: true }
                    });
                    console.log(`   - ${updated?.oldId}: finishedDate=${updated?.finishedDate}, status=${updated?.status}, pendiente=${updated?.pendingAmountStored}`);
                }
            }
        }
    } else {
        console.log('✅ No hay préstamos pagados al 100% sin fecha de término');
    }
    
    console.log('🔍 ================================================\n');
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
        const finalDuplicates = await prisma.$queryRaw<{ fullName: string, count: bigint }[]>`
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
            const finalCheck = await prisma.$queryRaw<{ fullName: string, count: bigint }[]>`
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

    // REPORTE FINAL DE PRÉSTAMOS PROCESADOS
    console.log('\n📊 ========== REPORTE FINAL DE PRÉSTAMOS PROCESADOS ==========');
    console.log(`✅ Total de préstamos normales procesados: ${loansProcessed}`);
    console.log(`🔄 Total de préstamos renovados procesados: ${renovatedLoansProcessed}`);
    console.log(`⏭️ Total de préstamos omitidos por duplicados: ${loansSkippedDuplicates}`);
    console.log(`⚠️ Total de préstamos sin lead: ${loansWithoutLead}`);
    console.log(`🚨 Total de transacciones FALCO_LOSS creadas: ${falcoLossTransactionsCreated}`);
    console.log(`📈 Total de préstamos únicos creados: ${loansProcessed + renovatedLoansProcessed}`);
    console.log('📊 ============================================================\n');

    // REPORTE FINAL DEL CACHE DE BORROWERS
    console.log('\n📊 ========== REPORTE FINAL DEL CACHE DE BORROWERS ==========');
    console.log('🔍 Estado del cache antes del reporte final...');
    console.log(`📈 Total de borrowers únicos en cache: ${Object.keys(borrowerCache).length}`);
    if (Object.keys(borrowerCache).length > 0) {
        console.log('📋 Detalle de borrowers en cache:');
        /* Object.entries(borrowerCache).forEach(([fullName, data], index) => {
            console.log(`   ${index + 1}. "${fullName}" -> Borrower ID: ${data.borrowerId}, PersonalData ID: ${data.personalDataId}`);
        }); */
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
    console.log('', leadMapping);
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