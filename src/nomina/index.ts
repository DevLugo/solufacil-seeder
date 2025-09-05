import { getEmployeeIdsMap } from "../leads";
import { ExcelRow } from "../loan/types";
import { prisma } from "../standaloneApp";
import { chunkArray, convertExcelDate } from "../utils";
import { ExcelExpensesRow, Expense } from "../expenses/types";
const xlsx = require('xlsx');

// Función para validar si un gasto de nómina ya existe en la base de datos
const checkNominaDuplicate = async (expense: Expense): Promise<boolean> => {
    try {
        // Validar que los datos sean válidos antes de proceder
        if (!expense.description || !expense.date || expense.amount === undefined) {
            return false; // No validar duplicados para datos incompletos
        }

        // Solo validar duplicados para nóminas de junio de 2024 hacia atrás
        const june2024 = new Date('2024-01-01');
        if (expense.date >= june2024) {
            return false; // No validar duplicados para nóminas recientes
        }

        // Buscar gastos de nómina existentes con la misma descripción, fecha y monto
        const existingExpense = await prisma.transaction.findFirst({
            where: {
                description: String(expense.description),
                date: expense.date,
                amount: expense.amount.toString(),
                type: 'EXPENSE',
                expenseSource: 'NOMINA_SALARY'
            }
        });

        if (existingExpense) {
            console.log(`⚠️ DUPLICADO ENCONTRADO: Nómina "${expense.description}" con fecha ${expense.date} y monto ${expense.amount} ya existe`);
            console.log(`   Nómina existente ID: ${existingExpense.id}, Ruta: ${existingExpense.routeId}`);
            console.log(`   Esta nómina se OMITIRÁ para evitar duplicados`);
            return true;
        }

        return false;
    } catch (error) {
        return false; // En caso de error, permitir la inserción
    }
};

const expensesColumnsRelationship: ExcelExpensesRow = {
    'A': 'fullName',
    'B': 'date',
    'C': 'amount',
    'D': 'description',
    'E': 'leadId',
    'F': 'accountType',
};

const extractNominaData = (excelFileName: string) => {
    const excelFilePath = excelFileName;
    const tabName = 'NOMINA';

    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);

    // Obtener la hoja especificada
    const sheetNomina = workbook.Sheets[tabName];

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetNomina, { header: 1 });
    
    console.log('DATA', data.slice(0, 5));

    // Encontrar la fila de encabezados (primera fila con datos)
    let headerRowIndex = 0;
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (row && row.some((cell: any) => cell && typeof cell === 'string' && cell.includes('NOMBRE'))) {
            headerRowIndex = i;
            break;
        }
    }

    console.log('Header row index:', headerRowIndex);
    console.log('Header row:', data[headerRowIndex]);

    // Encontrar los índices de las columnas basándose en los encabezados
    const headerRow = data[headerRowIndex];
    const columnIndexes = {
        fullName: -1,
        date: -1,
        amount: -1,
        description: -1,
        leadId: -1,
        accountType: -1
    };

    for (let i = 0; i < headerRow.length; i++) {
        const cell: any = headerRow[i];
        if (cell) {
            const cellStr = String(cell).toLowerCase();
            if (cellStr.includes('nombre')) columnIndexes.fullName = i;
            else if (cellStr.includes('fecha') || cellStr.includes('pago')) columnIndexes.date = i;
            else if (cellStr.includes('cantidad')) columnIndexes.amount = i;
            else if (cellStr.includes('origen') || cellStr.includes('infonavit') || cellStr.includes('imss')) columnIndexes.description = i;
            else if (cellStr.includes('cuenta') || cellStr.includes('bbva')) columnIndexes.accountType = i;
        }
    }

    console.log('Column indexes found:', columnIndexes);

    // Verificar que encontramos las columnas necesarias
    if (columnIndexes.fullName === -1 || columnIndexes.date === -1 || columnIndexes.amount === -1) {
        console.error('❌ No se pudieron encontrar las columnas necesarias:', columnIndexes);
        throw new Error('Estructura del Excel no válida');
    }

    let expensesData: Expense[] = data.slice(headerRowIndex + 1).map((row: ExcelRow) => {
        const obj: Partial<Expense> = {};
        
        if (columnIndexes.fullName !== -1) obj.fullName = row[columnIndexes.fullName];
        if (columnIndexes.date !== -1) {
            const dateValue = convertExcelDate(row[columnIndexes.date]);
            if (dateValue) obj.date = dateValue;
        }
        if (columnIndexes.amount !== -1) obj.amount = row[columnIndexes.amount];
        if (columnIndexes.description !== -1) obj.description = row[columnIndexes.description];
        if (columnIndexes.leadId !== -1) obj.leadId = row[columnIndexes.leadId];
        if (columnIndexes.accountType !== -1) obj.accountType = row[columnIndexes.accountType];
        
        return obj as Expense;
    });

    // Filtrar filas vacías
    expensesData = expensesData.filter(row => row.fullName && row.amount);
    
    return expensesData;
};

const saveExpensesOnDB = async (data: Expense[], bankAccountId: string, snapshotData: {
    routeId: string;
    routeName: string;
    locationId: string;
    locationName: string;
    leadId: string;
    leadName: string;
    leadAssignedAt: Date;
}, routeId: string, leadMapping?: { [oldId: string]: string }) => {
    const batches = chunkArray(data, 1000);
    
    // LOG DE VALIDACIÓN DE DUPLICADOS
    console.log('\n🔍 ========== VALIDACIÓN DE DUPLICADOS DE NÓMINA ==========');
    console.log(`🔍 Implementando validación de duplicados para la ruta: "${snapshotData.routeName}"`);
    console.log(`🔍 Criterios de validación: descripción + fecha + monto`);
    console.log(`🔍 ⚠️ NO se valida la ruta porque la misma nómina puede existir en diferentes rutas (error en Excel)`);
    console.log(`🔍 📅 SOLO se validan duplicados para nóminas de junio 2024 hacia atrás`);
    console.log(`🔍 📅 Nóminas posteriores a junio 2024 NO se validan por duplicados`);
    console.log('🔍 =========================================================\n');
    
    // Usar leadMapping si está disponible, sino usar employeeIdsMap como fallback
    let employeeIdsMap: { [key: string]: string } = {};
    if (leadMapping) {
        employeeIdsMap = leadMapping;
    } else {
        employeeIdsMap = await getEmployeeIdsMap();
    }
    
    let nominaProcessed = 0;
    let nominaSkippedDuplicates = 0;
    
    for (const [batchIndex, batch] of batches.entries()) {
        console.log(`\n🔄 ========== PROCESANDO BATCH DE NÓMINA ${batchIndex + 1}/${batches.length} ==========`);
        console.log(`📋 Elementos en este batch: ${batch.length}`);
        const transactionPromises: any[] = [];
        
        for (const item of batch) {
            // VALIDACIÓN DE DUPLICADOS: Solo verificar si los datos son válidos
            if (!item.description || !item.date || item.amount === undefined) {
                /* console.log(`⚠️ DATOS INCOMPLETOS: description=${item.description}, date=${item.date}, amount=${item.amount} - Omitiendo validación de duplicados`); */
                // Continuar con el procesamiento normal sin validar duplicados
            } else {
                const isDuplicate = await checkNominaDuplicate(item);
                if (isDuplicate) {
                    /* console.log(`⏭️ OMITIENDO NÓMINA DUPLICADA: ${item.description} - ${item.date} - ${item.amount}`); */
                    continue; // Omitir esta nómina
                } else {
                    // Verificar si es una nómina reciente que no se valida por duplicados
                    const june2024 = new Date('2024-01-01');
                    if (item.date >= june2024) {
                        /* console.log(`✅ NÓMINA RECIENTE: ${item.date} - ${item.amount} (procesando sin validación de duplicados)`); */
                    } else {
                        /* console.log(`✅ NÓMINA ÚNICA: ${item.description} - ${item.date} - ${item.amount} (procesando...)`); */
                    }
                }
            }

            let accountId = bankAccountId;
            
            if (!accountId){
                /* console.log('NO HAY ACCOUNT ID', item); */
            }
            if(item.amount === undefined){
                /* console.log("NO HAY AMOUNT", item); */
                continue;
            }

            transactionPromises.push(prisma.transaction.create({
                data: {
                    amount: item.amount.toString(),
                    date: item.date,
                    sourceAccountId: accountId,
                    description: String(item.description),
                    leadId: item.leadId ? employeeIdsMap[item.leadId] : undefined,
                    type: 'EXPENSE',
                    expenseSource: 'NOMINA_SALARY',
                    routeId: routeId,
                    // snapshotLeadId no existe en Transaction, se omite
                }
            }));
        }
        if (transactionPromises.length > 0) {
            console.log('Saving expenses', transactionPromises.length);
            await prisma.$transaction(transactionPromises);
            nominaProcessed += transactionPromises.length;
        } else {
            console.log(`⚠️ BATCH SIN NÓMINAS VÁLIDAS: Todas las nóminas fueron duplicadas`);
        }
        
        // Actualizar contadores
        const batchSkipped = batch.length - transactionPromises.length;
        
        // RESUMEN DEL BATCH
        if (batchSkipped > 0) {
            console.log(`📊 RESUMEN DEL BATCH: ${batch.length} total, ${transactionPromises.length} procesados, ${batchSkipped} omitidos (duplicados)`);
        }
        console.log(`✅ BATCH DE NÓMINA ${batchIndex + 1}/${batches.length} COMPLETADO`);
        console.log('🔄 ================================================\n');
    }
    
    // RESUMEN FINAL DEL PROCESAMIENTO DE NÓMINA
    console.log('\n📊 ========== RESUMEN FINAL DEL PROCESAMIENTO DE NÓMINA ==========');
    console.log(`✅ Total de nóminas procesadas exitosamente: ${nominaProcessed}`);
    console.log(`⏭️ Total de nóminas omitidas por duplicados: ${nominaSkippedDuplicates}`);
    console.log(`📈 Total de nóminas únicas creadas: ${nominaProcessed}`);
    console.log('📊 ============================================================\n');
};

export const seedNomina = async (bankAccountId: string, snapshotData: {
    routeId: string;
    routeName: string;
    locationId: string;
    locationName: string;
    leadId: string;
    leadName: string;
    leadAssignedAt: Date;
}, excelFileName: string, routeId: string, leadMapping?: { [oldId: string]: string },) => {
    const nominaData = extractNominaData(excelFileName);
    console.log('NOMINA DATA', nominaData.length);
    console.log('NOMINA DATA', nominaData.slice(0, 5));
    
    // LOG DE PROCESAMIENTO DE NÓMINA
    console.log('\n🔄 ========== PROCESAMIENTO DE NÓMINA ==========');
    console.log(`🔄 Total de nóminas a procesar: ${nominaData.length}`);
    console.log(`🔄 Tamaño de batch: 1000 nóminas por lote`);
    console.log('🔄 ===========================================\n');
    
    if(bankAccountId){
        await saveExpensesOnDB(nominaData, bankAccountId, snapshotData, routeId, leadMapping);
        const totalExpenses = await prisma.transaction.count({
            where: {
                type: 'EXPENSE',
            }
        });
        console.log('Total NOMINA', totalExpenses);

        const totalSumOfExpenses = await prisma.transaction.aggregate({
            _sum: {
                amount: true,
            }
        });
        console.log('Total sum of NOMINA', totalSumOfExpenses);
        console.log('NOMINA seeded');
    }else{
        console.log('No se encontro la cuenta principal');
    }
};
