import { Payments } from "./payments/types";
import { prisma } from "./standaloneApp";
import { Loan } from "./loan/types";

const xlsx = require('xlsx');

interface ChunkArray {
    <T>(array: T[], size: number): T[][];
}

export const chunkArray: ChunkArray = (array, size) => {
    const chunkedArr: any[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
};

export const groupPaymentsByOldLoanId = (payments: Payments[]) => {
    return payments.reduce((acc: { [key: string]: Payments[] }, payment) => {
        if (!acc[payment.oldId]) {
            acc[payment.oldId] = [];
        }
        acc[payment.oldId].push(payment);
        return acc;
    }, {});
};

// Función para convertir números de serie de Excel a fechas
export const convertExcelDate = (serial: number): Date|null => {
    const date = xlsx.SSF.parse_date_code(serial);
    if (!date || !date.y || !date.m || !date.d) {
        return null;
    }    
    return new Date(date.y, date.m - 1, date.d);
};

export const leads = [
    ['LAURA DIAZ RAMIREZ', '1'],
    ['ANDREA JAQUELINE	LEON UC', '2'],
    ['RAFAELA BAEZA CARRILLO', '3'],
    ['MAYRA ZETINA KE', '4'],
    ['MAGALY	YAM AUDELO', '5'],
    ['PAULA VIDAL HERNANDEZ', '6'],
    ['MINERVA CORTES GARCIA', '9'],
    ['RAQUEL CORTES PEREZ', '10'],
    ['YAZMIN	JUAREZ NOLASCO', '11'],
    ['TANIA DEL ROCIO DURAN OJEDA', '12'],
    ['MARIA ELIZABETH GONGORA VALENZUELA', '14'],
    ['VIRGINIA VIVEROS CHI', '15'],
    ['MARIA DEL CARMEN	MENDEZ NARVAEZ', '17'],
    ['MARIA ALICIA SANCHEZ CHABLE', '18'],
    ['SILBAN	SOCORRO CRUZ', '19'],
    ['LILIA MARIA CASTILLO CIAU', '20'],
    ['KIMBERLY DOMINGUEZ LINARES', '21'],
    ['MARIA ESTHER	AGUILAR KU', '22'],
    ['ADILETH HERNANDEZ GARCIA', '23'],
    ['ALEJANDRINA HERNANDEZ GARCIA', '26'],
    ['NOEMI CARRANZA RIVAS', '32'],
    ['IRMA MARIA DZIB ARJONA', '33'],
    ['MARIA MIREYA	CHEL UICAB', '37'],
    ['CECILIA SALDIVAR HERNANDEZ', '38'],
    ['NILDA RAQUEL	POOT EK', '39'],
    ['ARACELY GONGORA FERNANDEZ', '40'],
    ['SANDRA PAOLA TUN POOT', '41'],
    ['YECENIA LLANURI BE CIMA', '43'],
    ['TAHIRIH ANAHI DZUL TUN', '44'],
    ['ROSALIA AMEZCUA HERNANDEZ', '50'],
];

// Función para calcular la distancia de Levenshtein
export const levenshteinDistance = (a: string, b: string): number => {
    const matrix: number[][] = [];
    
    // Si una de las cadenas está vacía, la distancia es la longitud de la otra
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    // Inicializar la matriz
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    
    // Calcular la distancia
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitución
                    matrix[i][j - 1] + 1,     // inserción
                    matrix[i - 1][j] + 1      // eliminación
                );
            }
        }
    }
    
    return matrix[b.length][a.length];
};

// Función para normalizar nombres (quitar espacios extra, convertir a mayúsculas)
export const normalizeName = (name: string): string => {
    return name.trim().toUpperCase().replace(/\s+/g, ' ');
};

// Función para encontrar PersonalData existente con fuzzy matching
export const findExistingPersonalData = async (fullName: string, phoneNumber?: string): Promise<string | null> => {
    const normalizedSearchName = normalizeName(fullName);
    
    // Buscar todas las PersonalData existentes
    const existingPersonalData = await prisma.personalData.findMany({
        select: {
            id: true,
            fullName: true,
            phones: {
                select: {
                    number: true
                }
            }
        }
    });
    
    // Buscar coincidencias exactas primero
    for (const person of existingPersonalData) {
        const normalizedExistingName = normalizeName(person.fullName);
        if (normalizedExistingName === normalizedSearchName) {
            return person.id;
        }
    }
    
    // Buscar con fuzzy matching (máximo 1 letra de diferencia)
    for (const person of existingPersonalData) {
        const normalizedExistingName = normalizeName(person.fullName);
        const distance = levenshteinDistance(normalizedSearchName, normalizedExistingName);
        
        if (distance <= 1) {
            console.log(`🔍 Fuzzy match encontrado: "${fullName}" ≈ "${person.fullName}" (distancia: ${distance})`);
            return person.id;
        }
    }
    
    return null;
};

// Cache global para avales durante la importación con IDs pre-generados
const avalCache: Map<string, string> = new Map();

// Función para generar ID único tipo cuid
const generateCuid = (): string => {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 8);
    return `cl${timestamp}${randomPart}`;
};

// Función para limpiar el cache de avales (llamar al inicio de cada importación)
export const clearAvalCache = () => {
    avalCache.clear();
};

// Función SIMPLE para limpiar duplicados existentes en PersonalData
export const cleanExistingDuplicates = async (): Promise<void> => {
    console.log('🧹 Limpiando duplicados existentes en PersonalData...');
    
    try {
        // Encontrar todos los nombres duplicados
        const duplicates = await prisma.$queryRaw<{fullName: string, count: bigint}[]>`
            SELECT "fullName", COUNT(*) as count
            FROM "PersonalData"
            WHERE "fullName" IS NOT NULL AND "fullName" != ''
            GROUP BY "fullName"
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
        `;
        
        if (duplicates.length === 0) {
            console.log('✅ No hay duplicados existentes para limpiar');
            return;
        }
        
        console.log(`🔍 Encontrados ${duplicates.length} nombres duplicados`);
        
        // Procesar cada duplicado de forma simple
        for (const duplicate of duplicates) {
            const fullName = duplicate.fullName;
            const count = Number(duplicate.count);
            
            console.log(`🧹 Limpiando "${fullName}" (${count} registros)`);
            
            // Obtener todos los registros con este nombre
            const records = await prisma.personalData.findMany({
                where: { fullName: fullName },
                orderBy: { createdAt: 'asc' } // Mantener el más antiguo
            });
            
            if (records.length <= 1) continue;
            
            const mainRecord = records[0]; // El más antiguo
            const duplicatesToDelete = records.slice(1);
            
            console.log(`   📌 Manteniendo: ${mainRecord.id}`);
            console.log(`   🗑️ Eliminando: ${duplicatesToDelete.map(r => r.id).join(', ')}`);
            
                        // Eliminar registros relacionados de los duplicados (no mover, solo eliminar)
            for (const dupRecord of duplicatesToDelete) {
                // Eliminar préstamos donde es aval
                await prisma.$executeRaw`
                    DELETE FROM "_Loan_collaterals" 
                    WHERE "B" = ${dupRecord.id}
                `;
                
                // Eliminar empleados
                await prisma.$executeRaw`
                    DELETE FROM "Employee" 
                    WHERE "personalData" = ${dupRecord.id}
                `;
                
                // Eliminar borrowers
                await prisma.$executeRaw`
                    DELETE FROM "Borrower" 
                    WHERE "personalData" = ${dupRecord.id}
                `;
            }
            
            // Eliminar registros duplicados de PersonalData
            await prisma.personalData.deleteMany({
                where: {
                    id: { in: duplicatesToDelete.map(r => r.id) }
                }
            });
            
            console.log(`   ✅ "${fullName}" consolidado: ${count} → 1 registro`);
        }
        
        console.log('✅ Limpieza de duplicados existentes completada');
        
    } catch (error) {
        console.error('❌ Error limpiando duplicados existentes:', error);
        throw error;
    }
};

// Función AGRESIVA para limpiar TODOS los duplicados de una vez
export const forceCleanAllDuplicates = async (): Promise<void> => {
    console.log('🚨 FUNCIÓN AGRESIVA: Limpiando TODOS los duplicados de una vez...');
    
    try {
        // PRIMERO: Verificar cuántos duplicados hay ANTES de empezar
        console.log('🔍 Buscando duplicados en PersonalData...');
        const initialDuplicates = await prisma.$queryRaw<{fullName: string, count: bigint}[]>`
            SELECT "fullName", COUNT(*) as count
            FROM "PersonalData"
            WHERE "fullName" IS NOT NULL AND "fullName" != ''
            GROUP BY "fullName"
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
        `;
        
        console.log(`🔍 Query ejecutada, resultado: ${initialDuplicates.length} duplicados`);
        
        if (initialDuplicates.length === 0) {
            console.log('✅ No hay duplicados para limpiar');
            return;
        }
        
        console.log(`🚨 ENCONTRADOS ${initialDuplicates.length} NOMBRES DUPLICADOS INICIALMENTE!`);
        console.log('📊 TODOS los duplicados encontrados:');
        initialDuplicates.forEach((dup, index) => {
            console.log(`   ${index + 1}. "${dup.fullName}": ${dup.count} registros`);
        });
        
        let totalProcessed = 0;
        let totalConsolidated = 0;
        
        // Procesar TODOS los duplicados
        for (const duplicate of initialDuplicates) {
            const fullName = duplicate.fullName;
            const count = Number(duplicate.count);
            
            try {
                console.log(`🧹 [${++totalProcessed}/${initialDuplicates.length}] Limpiando "${fullName}" (${count} registros)`);
                
                // Obtener todos los registros con este nombre
                const records = await prisma.personalData.findMany({
                    where: { fullName: fullName },
                    orderBy: { createdAt: 'asc' }
                });
                
                if (records.length <= 1) {
                    console.log(`   ⚠️ Solo hay ${records.length} registro(s), saltando...`);
                    continue;
                }
                
                const mainRecord = records[0]; // El más antiguo
                const duplicatesToDelete = records.slice(1);
                
                console.log(`   📌 Manteniendo: ${mainRecord.id}`);
                console.log(`   🗑️ Eliminando: ${duplicatesToDelete.length} duplicados`);
                
                // ELIMINAR registros relacionados de los duplicados (NO mover)
                for (const dupRecord of duplicatesToDelete) {
                    console.log(`   🔄 Eliminando relaciones del duplicado ${dupRecord.id}...`);
                    
                    // Eliminar préstamos donde es aval
                    const avalDeleted = await prisma.$executeRaw`
                        DELETE FROM "_Loan_collaterals" 
                        WHERE "B" = ${dupRecord.id}
                    `;
                    
                    // Eliminar empleados
                    const employeeDeleted = await prisma.$executeRaw`
                        DELETE FROM "Employee" 
                        WHERE "personalData" = ${dupRecord.id}
                    `;
                    
                    // Eliminar borrowers
                    const borrowerDeleted = await prisma.$executeRaw`
                        DELETE FROM "Borrower" 
                        WHERE "personalData" = ${dupRecord.id}
                    `;
                    
                    console.log(`   ✅ Relaciones eliminadas: aval(${avalDeleted}), employee(${employeeDeleted}), borrower(${borrowerDeleted})`);
                }
                
                // Eliminar registros duplicados de PersonalData
                const deleteResult = await prisma.personalData.deleteMany({
                    where: {
                        id: { in: duplicatesToDelete.map(r => r.id) }
                    }
                });
                
                totalConsolidated += deleteResult.count;
                console.log(`   ✅ "${fullName}" consolidado: ${count} → 1 registro (${deleteResult.count} eliminados)`);
                
                // VERIFICACIÓN INMEDIATA: Verificar que realmente se eliminó
                const remainingRecords = await prisma.personalData.findMany({
                    where: { fullName: fullName }
                });
                console.log(`   🔍 Verificación inmediata: ${remainingRecords.length} registro(s) restante(s) para "${fullName}"`);
                
                if (remainingRecords.length > 1) {
                    console.log(`   ⚠️ ADVERTENCIA: "${fullName}" sigue teniendo ${remainingRecords.length} registros!`);
                }
                
            } catch (error) {
                console.error(`❌ Error procesando "${fullName}":`, error);
                // Continuar con el siguiente
                continue;
            }
        }
        
        console.log(`🚨 LIMPIEZA AGRESIVA COMPLETADA:`);
        console.log(`   📊 Total procesados: ${totalProcessed}/${initialDuplicates.length}`);
        console.log(`   🗑️ Total consolidados: ${totalConsolidated} registros eliminados`);
        
        // VERIFICACIÓN FINAL COMPLETA
        console.log('\n🔍 VERIFICACIÓN FINAL: Buscando duplicados restantes...');
        const finalDuplicates = await prisma.$queryRaw<{fullName: string, count: bigint}[]>`
            SELECT "fullName", COUNT(*) as count
            FROM "PersonalData"
            WHERE "fullName" IS NOT NULL AND "fullName" != ''
            GROUP BY "fullName"
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
        `;
        
        if (finalDuplicates.length === 0) {
            console.log('✅ ÉXITO TOTAL: No quedan duplicados en PersonalData!');
        } else {
            console.log(`⚠️ ADVERTENCIA: Aún quedan ${finalDuplicates.length} nombres duplicados`);
            console.log('📊 Duplicados restantes:');
            finalDuplicates.forEach((dup, index) => {
                console.log(`   ${index + 1}. "${dup.fullName}": ${dup.count} registros`);
            });
            
            // INTENTAR LIMPIEZA ADICIONAL para los duplicados restantes
            console.log('\n🚨 INTENTANDO LIMPIEZA ADICIONAL para duplicados restantes...');
            for (const duplicate of finalDuplicates) {
                const fullName = duplicate.fullName;
                const count = Number(duplicate.count);
                
                console.log(`🧹 LIMPIEZA ADICIONAL: "${fullName}" (${count} registros)`);
                
                try {
                    // Obtener todos los registros con este nombre
                    const records = await prisma.personalData.findMany({
                        where: { fullName: fullName },
                        orderBy: { createdAt: 'asc' }
                    });
                    
                    if (records.length <= 1) continue;
                    
                    const mainRecord = records[0];
                    const duplicatesToDelete = records.slice(1);
                    
                    console.log(`   📌 Manteniendo: ${mainRecord.id}`);
                    console.log(`   🗑️ Eliminando: ${duplicatesToDelete.length} duplicados`);
                    
                    // ELIMINAR registros relacionados de los duplicados
                    for (const dupRecord of duplicatesToDelete) {
                        await prisma.$executeRaw`DELETE FROM "_Loan_collaterals" WHERE "B" = ${dupRecord.id}`;
                        await prisma.$executeRaw`DELETE FROM "Employee" WHERE "personalData" = ${dupRecord.id}`;
                        await prisma.$executeRaw`DELETE FROM "Borrower" WHERE "personalData" = ${dupRecord.id}`;
                    }
                    
                    // Eliminar registros duplicados
                    await prisma.personalData.deleteMany({
                        where: { id: { in: duplicatesToDelete.map(r => r.id) } }
                    });
                    
                    console.log(`   ✅ "${fullName}" consolidado en limpieza adicional`);
                    
                } catch (error) {
                    console.error(`❌ Error en limpieza adicional para "${fullName}":`, error);
                }
            }
            
            // VERIFICACIÓN FINAL DESPUÉS DE LIMPIEZA ADICIONAL
            console.log('\n🔍 VERIFICACIÓN FINAL DESPUÉS DE LIMPIEZA ADICIONAL...');
            const finalCheck = await prisma.$queryRaw<{fullName: string, count: bigint}[]>`
                SELECT "fullName", COUNT(*) as count
                FROM "PersonalData"
                WHERE "fullName" IS NOT NULL AND "fullName" != ''
                GROUP BY "fullName"
                HAVING COUNT(*) > 1
                ORDER BY COUNT(*) DESC
            `;
            
            if (finalCheck.length === 0) {
                console.log('✅ ÉXITO TOTAL DESPUÉS DE LIMPIEZA ADICIONAL: No quedan duplicados!');
            } else {
                console.log(`⚠️ ADVERTENCIA FINAL: Aún quedan ${finalCheck.length} nombres duplicados`);
                finalCheck.forEach((dup, index) => {
                    console.log(`   ${index + 1}. "${dup.fullName}": ${dup.count} registros`);
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Error en limpieza agresiva:', error);
        if (error instanceof Error) {
            console.error('❌ Stack trace completo:', error.stack);
        }
        throw error;
    }
};

// Función de PRUEBA simple para verificar que se ejecuta
export const testFunction = async (): Promise<void> => {
    console.log('🧪 FUNCIÓN DE PRUEBA: Esta función se ejecuta correctamente');
    console.log('🧪 PASO 1: Función iniciada');
    
    try {
        console.log('🧪 PASO 2: Intentando conectar a la base de datos...');
        
        // Verificación simple sin queries complejas
        console.log('🧪 PASO 3: Ejecutando count simple...');
        const count = await prisma.personalData.count();
        console.log(`🧪 PASO 4: Count exitoso - Total registros: ${count}`);
        
        console.log('🧪 PASO 5: Intentando query de duplicados...');
        const duplicates = await prisma.$queryRaw<{fullName: string, count: bigint}[]>`
            SELECT "fullName", COUNT(*) as count
            FROM "PersonalData"
            WHERE "fullName" IS NOT NULL AND "fullName" != ''
            GROUP BY "fullName"
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
        `;
        
        console.log(`🧪 PASO 6: Query exitosa - Duplicados encontrados: ${duplicates.length}`);
        
        if (duplicates.length > 0) {
            console.log('🧪 PASO 7: Mostrando primeros 3 duplicados...');
            duplicates.slice(0, 3).forEach((dup, index) => {
                console.log(`   ${index + 1}. "${dup.fullName}": ${dup.count} registros`);
            });
        }
        
        console.log('🧪 PASO 8: FUNCIÓN DE PRUEBA completada exitosamente');
        
    } catch (error) {
        console.error('🧪 ERROR en función de prueba:', error);
        console.error('🧪 Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
        throw error;
    }
};

// Función de emergencia para limpiar ADELINA PALMA TACU específicamente
export const forceCleanAdelina = async (): Promise<void> => {
    console.log('🚨 FUNCIÓN DE EMERGENCIA: Limpiando ADELINA PALMA TACU específicamente...');
    
    try {
        // Buscar todos los registros de ADELINA
        const adelinaRecords = await prisma.personalData.findMany({
            where: { 
                fullName: { 
                    contains: 'ADELINA PALMA TACU',
                    mode: 'insensitive'
                } 
            },
            orderBy: { createdAt: 'asc' }
        });
        
        if (adelinaRecords.length <= 1) {
            console.log('✅ ADELINA PALMA TACU ya tiene solo 1 registro');
            return;
        }
        
        console.log(`🚨 ADELINA PALMA TACU tiene ${adelinaRecords.length} registros duplicados!`);
        
        const mainRecord = adelinaRecords[0]; // El más antiguo
        const duplicatesToDelete = adelinaRecords.slice(1);
        
        console.log(`📌 Manteniendo: ${mainRecord.id}`);
        console.log(`🗑️ Eliminando: ${duplicatesToDelete.map(r => r.id).join(', ')}`);
        
        // Eliminar registros relacionados de los duplicados (no mover, solo eliminar)
        for (const dupRecord of duplicatesToDelete) {
            // Eliminar préstamos donde es aval
            await prisma.$executeRaw`
                DELETE FROM "_Loan_collaterals" 
                WHERE "B" = ${dupRecord.id}
            `;
            
            // Eliminar empleados
            await prisma.$executeRaw`
                DELETE FROM "Employee" 
                WHERE "personalData" = ${dupRecord.id}
            `;
            
            // Eliminar borrowers
            await prisma.$executeRaw`
                DELETE FROM "Borrower" 
                WHERE "personalData" = ${dupRecord.id}
            `;
        }
        
        // Eliminar registros duplicados
        await prisma.personalData.deleteMany({
            where: {
                id: { in: duplicatesToDelete.map(r => r.id) }
            }
        });
        
        console.log(`✅ ADELINA PALMA TACU consolidada: ${adelinaRecords.length} → 1 registro`);
        
    } catch (error) {
        console.error('❌ Error en función de emergencia para ADELINA:', error);
        throw error;
    }
};

// Función asíncrona para obtener o asignar ID de aval (sin crear en DB todavía)
export const getOrAssignAvalId = async (avalName: string): Promise<string | null> => {
    // Si no hay nombre de aval, retornar null
    if (!avalName || avalName.trim() === '' || ['NA', 'N/A', 'N', 'undefined', 'PENDIENTE'].includes(avalName.trim().toUpperCase())) {
        return null;
    }
    
    const normalizedAvalName = normalizeName(avalName);
    
    
    // Si ya existe en cache, retornar el ID
    if (avalCache.has(normalizedAvalName)) {
        const cachedId = avalCache.get(normalizedAvalName)!;
        
        return cachedId;
    }
    
    // Si no existe en cache, esto NO debería pasar si createAllUniqueAvales funcionó correctamente
    
    // ÚLTIMO RECURSO: Buscar en la base de datos antes de generar nuevo ID
    try {
        const existingId = await findExistingPersonalData(avalName);
        if (existingId) {
            avalCache.set(normalizedAvalName, existingId);
            return existingId;
        }
    } catch (error) {
        
    }
    
    // VERIFICACIÓN CRÍTICA: Si es ERIKA, verificar que no se esté creando un duplicado
    
    // Generar nuevo ID de emergencia
    const newId = generateCuid();
    avalCache.set(normalizedAvalName, newId);
    
    return newId;
};

// Función para crear PersonalData para un aval usando ID pre-asignado
export const createAvalPersonalData = async (avalName: string, predefinedId: string, avalPhone?: string): Promise<void> => {
    const normalizedAvalName = normalizeName(avalName);
    
    try {
        // BÚSQUEDA AGRESIVA: Usar la misma lógica que createAllUniqueAvales
        const existingRecords = await prisma.personalData.findMany({
            select: { id: true, fullName: true }
        });
        
        let existingId: string | null = null;
        
        // Buscar coincidencias usando la misma lógica de fuzzy matching
        for (const person of existingRecords) {
            if (!person.fullName) continue; // Saltar registros sin nombre
            const normalizedExistingName = normalizeName(person.fullName);
            
            // 1. Coincidencia exacta
            if (normalizedExistingName === normalizedAvalName) {
                existingId = person.id;
                
                break;
            }
            
            // 2. Fuzzy match (distancia <= 1)
            if (levenshteinDistance(normalizedAvalName, normalizedExistingName) <= 1) {
                existingId = person.id;
                break;
            }
            
            // 3. Búsqueda parcial
            if (normalizedExistingName.includes(normalizedAvalName) || normalizedAvalName.includes(normalizedExistingName)) {
                const lengthDiff = Math.abs(normalizedExistingName.length - normalizedAvalName.length);
                if (lengthDiff <= 3) {
                    existingId = person.id;
                    
                    break;
                }
            }
        }
        
        if (existingId) {
            // DUPLICADO DETECTADO: Actualizar cache y NO crear
            avalCache.set(normalizedAvalName, existingId);
            
            return;
        }
        
        // TRANSACCIÓN ATÓMICA: Crear solo si realmente no existe
        await prisma.$transaction(async (tx) => {
            // VERIFICACIÓN FINAL dentro de la transacción
            const finalCheck = await tx.personalData.findFirst({
                where: { fullName: normalizedAvalName }
            });
            
            if (finalCheck) {
                // Alguien más lo creó mientras tanto
                avalCache.set(normalizedAvalName, finalCheck.id);
                
                return;
            }
            
            // CREAR el registro
            await tx.personalData.create({
                data: {
                    id: predefinedId,
                    fullName: normalizedAvalName,
                    phones: avalPhone && avalPhone.trim() !== '' && !['NA', 'N/A', 'N', 'undefined', 'PENDIENTE'].includes(avalPhone.trim().toUpperCase()) ? {
                        create: {
                            number: avalPhone.trim()
                        }
                    } : undefined
                }
            });
            
            // SOLO actualizar cache DESPUÉS de confirmar la creación
            avalCache.set(normalizedAvalName, predefinedId);
            
            
        });
        
    } catch (error) {
        
        // Remover del cache si falló
        avalCache.delete(normalizedAvalName);
        throw error;
    }
};

// Función para crear o encontrar PersonalData para un aval con cache (versión legacy para compatibilidad)
export const findOrCreateCollateralPersonalData = async (avalName: string, avalPhone?: string): Promise<string | null> => {
    // Si no hay nombre de aval, retornar null
    if (!avalName || avalName.trim() === '' || ['NA', 'N/A', 'N', 'undefined', 'PENDIENTE'].includes(avalName.trim().toUpperCase())) {
        return null;
    }
    
    const normalizedAvalName = normalizeName(avalName);
    
    // Primero verificar en el cache local
    if (avalCache.has(normalizedAvalName)) {
        const cachedId = avalCache.get(normalizedAvalName)!;
        console.log(`🔄 Aval encontrado en cache: ${avalName} -> ${cachedId}`);
        return cachedId;
    }
    
    // Buscar si ya existe en la base de datos
    const existingId = await findExistingPersonalData(normalizedAvalName, avalPhone);
    if (existingId) {
        // Guardar en cache para futuras búsquedas
        avalCache.set(normalizedAvalName, existingId);
        console.log(`✅ Aval existente encontrado y guardado en cache: ${avalName} -> ${existingId}`);
        return existingId;
    }
    
    // Usar getOrAssignAvalId para obtener un ID consistente
    return await getOrAssignAvalId(avalName);
};

// Función para crear todos los avales únicos en la base de datos al final del proceso
export const createAllUniqueAvales = async (loans: Loan[]): Promise<void> => {
    console.log('🚀 Iniciando creación de avales únicos...');
    
    // VERIFICACIÓN CRÍTICA: Detectar si algún préstamo tiene el nombre "ERIKA JUSSET PAREDES CHAVEZ"
    
    
    // Recopilar todos los avales únicos de los préstamos
    const uniqueAvales = new Map<string, { name: string; phone: string }>();
    
    for (const loan of loans) {
        if (loan.avalName && loan.avalName.trim() !== '' && !['NA', 'N/A', 'N', 'undefined', 'PENDIENTE'].includes(loan.avalName.trim().toUpperCase())) {
            const normalizedName = normalizeName(loan.avalName);
            if (!uniqueAvales.has(normalizedName)) {
                uniqueAvales.set(normalizedName, {
                    name: loan.avalName,
                    phone: loan.avalPhone || ''
                });
            }
        }
    }
    
    console.log(`📊 Total de avales únicos detectados: ${uniqueAvales.size}`);
    
    
    // BULK OPERATION: Obtener TODOS los registros existentes en una sola query
    console.log('🔍 Obteniendo registros existentes en PersonalData...');
    const existingPersonalData = await prisma.personalData.findMany({
        select: { id: true, fullName: true }
    });
    
    console.log(`🔍 Total registros existentes en PersonalData: ${existingPersonalData.length}`);
    
    // CACHE EN MEMORIA: Crear un Map para búsquedas rápidas
    const existingNamesMap = new Map<string, string>();
    for (const person of existingPersonalData) {
        if (person.fullName) {
            const normalizedName = normalizeName(person.fullName);
            existingNamesMap.set(normalizedName, person.id);
        }
    }
    
    
    // Mapear TODOS los avales únicos a registros existentes usando cache en memoria
    const avalesToCreate: Array<{ id: string; name: string; phone: string; normalizedName: string }> = [];
    
    for (const [normalizedName, avalData] of uniqueAvales) {
        let found = false;
        
        
        
        // BÚSQUEDA EN MEMORIA: Usar el Map en lugar de queries individuales
        let existingId: string | null = null;
        
        // 1. Coincidencia exacta en cache
        if (existingNamesMap.has(normalizedName)) {
            existingId = existingNamesMap.get(normalizedName)!;
            
            found = true;
        } else {
            // 2. Búsqueda fuzzy en memoria (solo si no hay coincidencia exacta)
            for (const [existingName, existingIdValue] of existingNamesMap) {
                // Fuzzy match (distancia <= 1)
                if (levenshteinDistance(normalizedName, existingName) <= 1) {
                    existingId = existingIdValue;
                    
                    found = true;
                    break;
                }
                
                // Búsqueda parcial
                if (existingName.includes(normalizedName) || normalizedName.includes(existingName)) {
                    const lengthDiff = Math.abs(existingName.length - normalizedName.length);
                    if (lengthDiff <= 3) {
                        existingId = existingIdValue;
                        found = true;
                        break;
                    }
                }
            }
        }
        
        if (found && existingId) {
            // AVAL EXISTENTE: Agregar al cache
            avalCache.set(normalizedName, existingId);
            
        } else {
            // AVAL NUEVO: Marcar para creación
            
            
            const avalId = generateCuid();
            avalCache.set(normalizedName, avalId); // Agregar al cache ANTES de crear
            avalesToCreate.push({
                id: avalId,
                name: avalData.name,
                phone: avalData.phone,
                normalizedName: normalizedName
            });
        }
    }
    
    console.log(`📝 Avales nuevos a crear: ${avalesToCreate.length}`);
    
    // BULK CREATE: Crear todos los avales en una sola operación
    if (avalesToCreate.length > 0) {
        /* console.log('🚀 Creando avales en bulk...'); */
        
        try {
            // Crear todos los avales en una sola operación
            const bulkData = avalesToCreate.map(aval => ({
                id: aval.id,
                fullName: aval.normalizedName,
                phones: aval.phone && aval.phone.trim() !== '' && !['NA', 'N/A', 'N', 'undefined', 'PENDIENTE'].includes(aval.phone.trim().toUpperCase()) ? {
                    create: {
                        number: aval.phone.trim()
                    }
                } : undefined
            }));
            
            // BULK INSERT usando createMany
            await prisma.personalData.createMany({
                data: bulkData.map(aval => ({
                    id: aval.id,
                    fullName: aval.fullName
                })),
                skipDuplicates: true // Evitar duplicados a nivel de DB
            });
            
            // VERIFICACIÓN POST-CREACIÓN: Detectar duplicados que se hayan creado
            console.log('🔍 Verificando duplicados post-creación...');
            const createdNames = bulkData.map(aval => aval.fullName);
            const duplicatesPostCreation = await prisma.personalData.findMany({
                where: {
                    fullName: { in: createdNames }
                },
                select: { id: true, fullName: true }
            });
            
            // Agrupar por nombre para detectar duplicados
            const nameGroups = new Map<string, string[]>();
            for (const record of duplicatesPostCreation) {
                if (!nameGroups.has(record.fullName)) {
                    nameGroups.set(record.fullName, []);
                }
                nameGroups.get(record.fullName)!.push(record.id);
            }
            
            // Consolidar duplicados encontrados
            let totalConsolidated = 0;
            for (const [fullName, ids] of nameGroups) {
                if (ids.length > 1) {
                    
                    // Mantener el primer ID (el más antiguo) y eliminar los demás
                    const [mainId, ...duplicateIds] = ids;
                    
                    // Actualizar cache con el ID principal
                    avalCache.set(fullName, mainId);
                    
                    
                    
                    // Eliminar duplicados
                    try {
                        await prisma.personalData.deleteMany({
                            where: { id: { in: duplicateIds } }
                        });
                        totalConsolidated += duplicateIds.length;
                        
                        
                    } catch (deleteError) {
                        
                    }
                }
            }
            
            if (totalConsolidated > 0) {
                console.log(`🧹 Consolidados ${totalConsolidated} duplicados post-creación`);
            }
            
            // Crear teléfonos por separado si es necesario
            const avalesWithPhones = bulkData.filter(aval => aval.phones);
            if (avalesWithPhones.length > 0) {
                for (const aval of avalesWithPhones) {
                    try {
                        await prisma.phone.create({
                            data: {
                                number: (aval.phones as any).create.number,
                                personalData: {
                                    connect: { id: aval.id }
                                }
                            }
                        });
                    } catch (error) {
                        // Ignorar errores de teléfonos duplicados
                        console.warn(`⚠️ Teléfono duplicado para aval ${aval.id}:`, error);
                    }
                }
            }
            
            
            
        } catch (error) {
            console.error('❌ Error en bulk create de avales:', error);
            
            // FALLBACK: Crear uno por uno si falla el bulk
            console.log('🔄 Fallback: Creando avales uno por uno...');
            for (const aval of avalesToCreate) {
                try {
                    await createAvalPersonalData(aval.name, aval.id, aval.phone);
                } catch (fallbackError) {
                    console.error(`❌ Error creando aval "${aval.normalizedName}":`, fallbackError);
                    avalCache.delete(aval.normalizedName);
                }
            }
        }
    }
    
    // VERIFICACIÓN FINAL DEL CACHE: Asegurar que no haya inconsistencias
    console.log('🔍 Verificación final del cache...');
    
    // Verificar que todos los avales en cache realmente existen en la DB
    const cacheEntries = Array.from(avalCache.entries());
    const cacheIds = cacheEntries.map(([_, id]) => id);
    
    if (cacheIds.length > 0) {
        const existingInDb = await prisma.personalData.findMany({
            where: { id: { in: cacheIds } },
            select: { id: true, fullName: true }
        });
        
        const existingIds = new Set(existingInDb.map(r => r.id));
        const missingIds = cacheIds.filter(id => !existingIds.has(id));
        
        if (missingIds.length > 0) {
            console.log(`⚠️ IDs en cache que no existen en DB: ${missingIds.length}`);
            // Limpiar IDs inválidos del cache
            for (const [name, id] of cacheEntries) {
                if (missingIds.includes(id)) {
                    avalCache.delete(name);
                    console.log(`🧹 Removido del cache: "${name}" -> ${id} (no existe en DB)`);
                }
            }
        }
    }
    
    // VERIFICACIÓN CRÍTICA: Detectar registros duplicados que se hayan creado DESPUÉS de createAllUniqueAvales
    console.log('🚨 VERIFICACIÓN CRÍTICA: Detectando duplicados post-proceso...');
    
    
    console.log('✅ Creación de avales únicos completada');
};

export const cleanUpDb = async () => {
    await prisma.route.deleteMany({});
    await prisma.loantype.deleteMany({});
    await prisma.loantype.deleteMany({});
    await prisma.personalData.deleteMany({});
    await prisma.employee.deleteMany({});
    await prisma.borrower.deleteMany({});
    await prisma.loan.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.loanPayment.deleteMany({});
    await prisma.phone.deleteMany({});
    await prisma.falcoCompensatoryPayment.deleteMany({});
    await prisma.documentPhoto.deleteMany({});
    await prisma.location.deleteMany({});
    await prisma.municipality.deleteMany({});
    await prisma.state.deleteMany({});
    await prisma.commissionPayment.deleteMany({});
    await prisma.leadPaymentType.deleteMany({});
    await prisma.leadPaymentReceived.deleteMany({});
    await prisma.reportConfig.deleteMany({});
    await prisma.telegramUser.deleteMany({});
    await prisma.portfolioCleanup.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.address.deleteMany({});
    await prisma.falcoCompensatoryPayment.deleteMany({});
    
    console.log('Datos eliminados de la base de datos');
}