import { getEmployeeIdsMap } from "../leads";
import { ExcelRow } from "../loan/types";
import { prisma } from "../standaloneApp";
import { chunkArray, convertExcelDate } from "../utils";
import { ExcelExpensesRow, Expense } from "./types";
const xlsx = require('xlsx');

// Función utilitaria para ajustar fechas a la zona horaria de México (GMT-6)
const adjustDateForMexico = (date: Date | null | undefined): Date | null => {
    if (!date) return null;
    
    const adjustedDate = new Date(date);
    // Si la fecha tiene hora 00:00:00 UTC, ajustarla a 06:00:00 UTC (medianoche en México GMT-6)
    if (adjustedDate.getUTCHours() === 0 && adjustedDate.getUTCMinutes() === 0 && adjustedDate.getUTCSeconds() === 0) {
        return new Date(adjustedDate.getTime() + (6 * 60 * 60 * 1000));
    }
    return adjustedDate;
};

// Función para validar si un gasto ya existe en la base de datos
const checkExpenseDuplicate = async (expense: Expense): Promise<boolean> => {
    try {
        // Validar que los datos sean válidos antes de proceder
        if (!expense.description || !expense.date || expense.amount === undefined) {
            return false; // No validar duplicados para datos incompletos
        }

        // Solo validar duplicados para gastos de junio de 2024 hacia atrás
        const june2024 = new Date('2024-06-01');
        if (expense.date >= june2024) {
            console.log(`✅ GASTO RECIENTE (${expense.date.toISOString().split('T')[0]}): No se valida duplicado para gastos posteriores a junio 2024`);
            return false; // No validar duplicados para gastos recientes
        }

        // Buscar gastos existentes con la misma descripción, fecha y monto
        const existingExpense = await prisma.transaction.findFirst({
            where: {
                description: String(expense.description),
                date: expense.date,
                amount: expense.amount.toString(),
                type: 'EXPENSE'
            }
        });

        if (existingExpense) {
            console.log(`⚠️ DUPLICADO ENCONTRADO: Gasto "${expense.description}" con fecha ${expense.date} y monto ${expense.amount} ya existe`);
            console.log(`   Gasto existente ID: ${existingExpense.id}, Ruta: ${existingExpense.routeId}`);
            console.log(`   Este gasto se OMITIRÁ para evitar duplicados`);
            return true;
        }

        return false;
    } catch (error) {
        console.error('❌ Error verificando duplicado de gasto:', error);
        return false; // En caso de error, permitir la inserción
    }
};

const expensesColumnsRelationship: ExcelExpensesRow = {
    'B': 'fullName',
    'C': 'date',
    'D': 'amount',
    'K': 'leadId',
    'E': 'accountType',
    'M': 'description',
};

const extractExpensesData = (excelFileName: string) => {
    const excelFilePath = excelFileName;
    const tabName = 'GASTOS';

    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);

    // Obtener la hoja especificada
    const sheetExpenses = workbook.Sheets[tabName];

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetExpenses, { header: 1 });
    


    let loansData: Expense[] = data.slice(1).map((row: ExcelRow) => {
        const obj: Partial<Expense> = {};
        for (const [col, key] of Object.entries(expensesColumnsRelationship)) {
            const colIndex = xlsx.utils.decode_col(col);
            let value = row[colIndex];
            // Convertir fechas si es necesario
            if (key === 'date') {
                value = convertExcelDate(value);
            }
            obj[key] = value;
        }
        return obj as Expense;
    });
    return loansData;
};

const saveExpensesOnDB = async (data: Expense[], cashAcountId: string, bankAccountId: string, tokaAccountId: string, connectAccountId: string, snapshotData: {
    routeId: string;
    routeName: string;
    locationId: string;
    locationName: string;
    leadId: string;
    leadName: string;
    leadAssignedAt: Date;
}, routeId: string, leadMapping?: { [oldId: string]: string }) => {
    const batches = chunkArray(data, 1000);
    console.log('====TOKA ACCOUNT====saveExpensesOnDB', tokaAccountId);
    console.log('====CONNECT ACCOUNT====saveExpensesOnDB', connectAccountId);
    
    // LOG DE VALIDACIÓN DE DUPLICADOS
    console.log('\n🔍 ========== VALIDACIÓN DE DUPLICADOS DE GASTOS ==========');
    console.log(`🔍 Implementando validación de duplicados para la ruta: "${snapshotData.routeName}"`);
    console.log(`🔍 Criterios de validación: descripción + fecha + monto`);
    console.log(`🔍 ⚠️ NO se valida la ruta porque el mismo gasto puede existir en diferentes rutas (error en Excel)`);
    console.log(`🔍 📅 SOLO se validan duplicados para gastos de junio 2024 hacia atrás`);
    console.log(`🔍 📅 Gastos posteriores a junio 2024 NO se validan por duplicados`);
    console.log('🔍 =========================================================\n');
    
    // Usar leadMapping si está disponible, sino usar employeeIdsMap como fallback
    let employeeIdsMap: { [key: string]: string } = {};
    if (leadMapping) {
        employeeIdsMap = leadMapping;
    } else {
        employeeIdsMap = await getEmployeeIdsMap();
    }
    
    let expensesProcessed = 0;
    let expensesSkippedDuplicates = 0;
    
    for (const [batchIndex, batch] of batches.entries()) {
        console.log(`\n🔄 ========== PROCESANDO BATCH DE GASTOS ${batchIndex + 1}/${batches.length} ==========`);
        console.log(`📋 Elementos en este batch: ${batch.length}`);
        const transactionPromises: any[] = [];
        
        for (const item of batch) {
            // VALIDACIÓN DE DUPLICADOS: Solo verificar si los datos son válidos
            if (!item.description || !item.date || item.amount === undefined) {
                console.log(`⚠️ DATOS INCOMPLETOS: description=${item.description}, date=${item.date}, amount=${item.amount} - Omitiendo validación de duplicados`);
                // Continuar con el procesamiento normal sin validar duplicados
            } else {
                console.log(`🔍 Verificando duplicado para gasto: ${item.description} - ${item.date} - ${item.amount}`);
                const isDuplicate = await checkExpenseDuplicate(item);
                if (isDuplicate) {
                    console.log(`⏭️ OMITIENDO GASTO DUPLICADO: ${item.description} - ${item.date} - ${item.amount}`);
                    continue; // Omitir este gasto
                } else {
                    // Verificar si es un gasto reciente que no se valida por duplicados
                    const june2024 = new Date('2024-06-01');
                    if (item.date >= june2024) {
                        console.log(`✅ GASTO RECIENTE: ${item.description} - ${item.date} - ${item.amount} (procesando sin validación de duplicados)`);
                    } else {
                        console.log(`✅ GASTO ÚNICO: ${item.description} - ${item.date} - ${item.amount} (procesando...)`);
                    }
                }
            }

            let accountId;
            if(
                (item.accountType === "GASTO BANCO" && item.description === "TOKA") 
                || (item.accountType === "TOKA" && item.description === "GASOLINA")){
                console.log('====TOKA====', item.description, tokaAccountId);
                accountId = tokaAccountId;
            }else if(item.accountType === "GASTO BANCO" && item.description === "CONNECT" || item.description === "CONNECT CONEXION"){
                console.log('====GASOLINA====', item.description, connectAccountId);
                accountId = connectAccountId;
            }
            else if (item.accountType === 'GASTO BANCO') {
                accountId = bankAccountId;
            } else if (item.accountType === 'GASTO') {
                accountId = cashAcountId;
            } else {
                accountId = cashAcountId;
            }

            if (!accountId)
                console.log('NO HAY ACCOUNT ID', item);

            if(item.amount === undefined){
                //console.log("NO HAY AMOUNT", item);
                continue;
            }
            //console.log('ROUTE ID', routeId);
            transactionPromises.push(prisma.transaction.create({
                data: {
                    amount: item.amount.toString(),
                    date: adjustDateForMexico(item.date),
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
                        if (item.description === "CONNECT") return "TRAVEL_EXPENSES";
                        if (item.accountType === "COMISION") return "LOAN_PAYMENT_COMISSION";
                        if (item.accountType === "GASTO BANCO") return "BANK_EXPENSE";
                        if (item.accountType === "GASTO SOCIO") return "EMPLOYEE_EXPENSE";
                        
                        /* if (item.description === "VIATICOS") return "VIATIC"; */
                        /* if (item.description === "SUELDO") return "EXTERNAL_SALARY"; */
                        return "GENERAL_EXPENSE";
                    })(),

                    // snapshotLeadId no existe en Transaction, se omite
                }
            }));
        }
        if (transactionPromises.length > 0) {
            await prisma.$transaction(transactionPromises);
            expensesProcessed += transactionPromises.length;
        } else {
            console.log(`⚠️ BATCH SIN GASTOS VÁLIDOS: Todos los gastos fueron duplicados`);
        }
        
        // Actualizar contadores
        const batchSkipped = batch.length - transactionPromises.length;
        expensesSkippedDuplicates += batchSkipped;
        
        // RESUMEN DEL BATCH
        if (batchSkipped > 0) {
            console.log(`📊 RESUMEN DEL BATCH: ${batch.length} total, ${transactionPromises.length} procesados, ${batchSkipped} omitidos (duplicados)`);
        }
        console.log(`✅ BATCH DE GASTOS ${batchIndex + 1}/${batches.length} COMPLETADO`);
        console.log('🔄 ================================================\n');
    }
    
    // RESUMEN FINAL DEL PROCESAMIENTO DE GASTOS
    console.log('\n📊 ========== RESUMEN FINAL DEL PROCESAMIENTO DE GASTOS ==========');
    console.log(`✅ Total de gastos procesados exitosamente: ${expensesProcessed}`);
    console.log(`⏭️ Total de gastos omitidos por duplicados: ${expensesSkippedDuplicates}`);
    console.log(`📈 Total de gastos únicos creados: ${expensesProcessed}`);
    console.log('📊 ============================================================\n');
};

export const seedExpenses = async (accountId: string, bankAccountId: string, tokaAccountId: string, connectAccountId: string, snapshotData: {
    routeId: string;
    routeName: string;
    locationId: string;
    locationName: string;
    leadId: string;
    leadName: string;
    leadAssignedAt: Date;
}, excelFileName: string, routeId: string, leadMapping?: { [oldId: string]: string }) => {
    console.log("SEEDING EXPENSES--------");
    const loanData = extractExpensesData(excelFileName);
    
    // LOG DE PROCESAMIENTO DE GASTOS
    console.log('\n🔄 ========== PROCESAMIENTO DE GASTOS ==========');
    console.log(`🔄 Total de gastos a procesar: ${loanData.length}`);
    console.log(`🔄 Tamaño de batch: 1000 gastos por lote`);
    console.log('🔄 ===========================================\n');
    
    if(accountId){
        console.log('====TOKA ACCOUNT====seedExpenses', tokaAccountId);
        console.log('====CONNECT ACCOUNT====seedExpenses', connectAccountId);
        await saveExpensesOnDB(loanData, accountId, bankAccountId, tokaAccountId, connectAccountId, snapshotData, routeId, leadMapping);
        console.log('Expenses seeded');
        //PRINT TOTAL EXPENSES AND TOTAL SUM OF EXPENSES FROM DB
        const totalExpenses = await prisma.transaction.count({
            where: {
                type: 'EXPENSE',
            }
        });
        console.log('Total expenses', totalExpenses);

        const totalSumOfExpenses = await prisma.transaction.aggregate({
            _sum: {
                amount: true,
            }
        });
        console.log('Total sum of expenses', totalSumOfExpenses);
    }else{
        console.log('No se encontro la cuenta principal');
    }
};
