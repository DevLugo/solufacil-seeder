import { PrismaClient } from '@prisma/client';
import { cleanUpDb } from './utils';
import { seedLoans } from './loan';
import { seedExpenses } from './expenses';
import { seedAccounts } from './account';
import { seedLeads, extractLeadsData } from './leads';
import { getYearResume } from './report/month';
import { seedNomina } from './nomina';
import * as readline from 'readline';

export const prisma = new PrismaClient();

// Función para leer input del usuario
function askQuestion(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

async function getOrCreateConnectAccount() {
    const existingConnectAccount = await prisma.account.findFirst({
        where: {
            type: 'TRAVEL_EXPENSES'
            // No se especifica route, por lo que se busca una cuenta sin ruta asociada
        }
    });

    if (existingConnectAccount) {
        console.log('✅ Cuenta de gastos de viaje encontrada y reutilizada:', existingConnectAccount.name);
        return existingConnectAccount;
    }
    
    const newConnectAccount = await prisma.account.create({
        data: {
            name: 'Cuenta de gastos de viaje',
            type: 'TRAVEL_EXPENSES',
            amount: "0"
            // No se especifica routes, por lo que no se asocia a ninguna ruta
        }
    });

    console.log('✅ Nueva cuenta de gastos de viaje creada:', newConnectAccount.name);
    return newConnectAccount;
}

async function getOrCreateTokaAccount() {
    const existingTokaAccount = await prisma.account.findFirst({
        where: {
            type: 'PREPAID_GAS'
            // No se especifica route, por lo que se busca una cuenta sin ruta asociada
        }
    });

    if (existingTokaAccount) {
        console.log('✅ Cuenta de gasolina encontrada y reutilizada:', existingTokaAccount.name);
        return existingTokaAccount;
    }
    
    const newTokaAccount = await prisma.account.create({
        data: {
            name: 'Cuenta de gasolina',
            type: 'PREPAID_GAS',
            amount: "0"
            // No se especifica routes, por lo que no se asocia a ninguna ruta
        }
    });

    console.log('✅ Nueva cuenta de gasolina creada:', newTokaAccount.name);
    return newTokaAccount;
}

// Función para obtener o crear la cuenta bancaria compartida
async function getOrCreateSharedBankAccount() {
    // Buscar si ya existe una cuenta bancaria compartida
    const existingBankAccount = await prisma.account.findFirst({
        where: {
            type: 'BANK'
            // No se especifica route, por lo que se busca una cuenta sin ruta asociada
        }
    });

    if (existingBankAccount) {
        console.log('✅ Cuenta bancaria compartida encontrada y reutilizada:', existingBankAccount.name);
        return existingBankAccount;
    }

    // Si no existe, crear una nueva cuenta bancaria compartida
    const newBankAccount = await prisma.account.create({
        data: {
            name: 'Cuenta Bancaria Compartida',
            type: 'BANK',
            amount: "0"
            // No se especifica routes, por lo que no se asocia a ninguna ruta
        }
    });

    console.log('✅ Nueva cuenta bancaria compartida creada:', newBankAccount.name);
    return newBankAccount;
}

// Función para obtener o crear la cuenta de caja de oficina
async function getOrCreateOfficeCashAccount() {
    // Buscar si ya existe una cuenta de caja de oficina
    const existingOfficeAccount = await prisma.account.findFirst({
        where: {
            type: 'OFFICE_CASH_FUND'
            // No se especifica route, por lo que se busca una cuenta sin ruta asociada
        }
    });

    if (existingOfficeAccount) {
        console.log('✅ Cuenta de caja de oficina encontrada y reutilizada:', existingOfficeAccount.name);
        return existingOfficeAccount;
    }

    // Si no existe, crear una nueva cuenta de caja de oficina
    const newOfficeAccount = await prisma.account.create({
        data: {
            name: 'Caja Merida',
            type: 'OFFICE_CASH_FUND',
            amount: "0"
            // No se especifica routes, por lo que no se asocia a ninguna ruta
        }
    });

    console.log('✅ Nueva cuenta de caja de oficina creada:', newOfficeAccount.name);
    return newOfficeAccount;
}

// Función para obtener los datos de snapshot de la ruta
async function getRouteSnapshotData(routeId: string) {
    const route = await prisma.route.findUnique({
        where: { id: routeId },
        include: {
            localities: true,
            employees: {
                include: {
                    personalData: true
                }
            }
        }
    });

    if (!route) {
        throw new Error(`Ruta con ID ${routeId} no encontrada`);
    }

    // Obtener la primera localidad asociada a la ruta (si existe)
    const location = route.localities[0];
    
    // Obtener el primer empleado/lead asociado a la ruta (si existe)
    const lead = route.employees[0];

    return {
        routeId: route.id,
        routeName: route.name,
        locationId: location?.id || '',
        locationName: location?.name || '',
        leadId: lead?.id || '',
        leadName: lead?.personalData?.fullName || '',
        leadAssignedAt: new Date() // Usar la fecha actual como fecha de asignación
    };
}

// Función para crear mapeo de oldId a realId usando el Excel
async function createLeadMapping(routeId: string, excelFileName: string, routeName: string) {
    // Extraer datos del Excel
    const leadsData = extractLeadsData(excelFileName, routeName);
    console.log(`📊 Total de leads extraídos del Excel: ${leadsData.length}`);
    console.log(`📋 Primeros 5 leads del Excel:`, leadsData.slice(0, 5).map(l => ({ oldId: l.oldId, nombre: l.nombre, apellidos: l.apellidos })));
    
    // Obtener todos los empleados de la ruta
    const employees = await prisma.employee.findMany({
        where: { routesId: routeId },
        include: { personalData: true }
    });
    console.log(`👥 Total de empleados en la ruta: ${employees.length}`);
    console.log(`📋 Primeros 5 empleados:`, employees.slice(0, 5).map(e => ({ id: e.id, oldId: e.oldId, fullName: e.personalData?.fullName })));
    
    // Crear mapeo de oldId a realId
    const leadMapping: { [oldId: string]: string } = {};
    
    for (const excelLead of leadsData) {
        const oldId = excelLead.oldId;
        
        // Buscar el empleado correspondiente en la base de datos
        const employee = employees.find(emp => 
            emp.oldId === oldId || 
            emp.personalData?.fullName === `${excelLead.nombre} ${excelLead.apellidos}`
        );
        
        if (employee) {
            leadMapping[oldId] = employee.id;
            console.log(`✅ Mapeo creado: ${oldId} -> ${employee.id} (${employee.personalData?.fullName})`);
        } else {
            console.log(`⚠️ No se encontró empleado para: ${excelLead.nombre} ${excelLead.apellidos} con oldId: ${oldId}`);
        }
    }
    
    console.log(`📊 Total de mapeos creados: ${Object.keys(leadMapping).length}`);
    console.log(`📋 Claves del mapeo:`, Object.keys(leadMapping));
    
    return leadMapping;
}

// Función para portafolio cleanup
async function portfolioCleanup(cashAccountId: string, bankAccountId: string, routeId: string) {
    const startDate = new Date('2020-01-01');
    const endDate = new Date('2024-03-31');
    const applicationDate = new Date('2025-04-01');
    
    try {
        // 1. Obtener préstamos del período especificado
        console.log('🔍 Obteniendo préstamos del período...');
        const periodLoans = await prisma.loan.findMany({
            where: {
                signDate: {
                    gte: startDate,
                    lte: endDate
                },
                snapshotRouteId: routeId
            },
            include: {
                borrower: {
                    include: {
                        personalData: true
                    }
                },
                payments: {
                    include: {
                        transactions: true
                    }
                }
            },
            orderBy: {
                signDate: 'asc'
            }
        });
        
        console.log(`📊 Total de préstamos en el período: ${periodLoans.length}`);
        
        // 2. Procesar y agregar información de los préstamos
        console.log('📊 Procesando información de préstamos...');
        let totalAmountGived = 0;
        let totalRequestedAmount = 0;
        let totalProfitAmount = 0;
        let activeLoans = 0;
        let finishedLoans = 0;
        
        for (const loan of periodLoans) {
            // Calcular totales
            totalAmountGived += Number(loan.amountGived || 0);
            totalRequestedAmount += Number(loan.requestedAmount || 0);
            totalProfitAmount += Number(loan.profitAmount || 0);
            
            // Contar por estado
            if (loan.status === 'ACTIVE') {
                activeLoans++;
            } else if (loan.status === 'FINISHED') {
                finishedLoans++;
            }
            
            console.log(`📋 Préstamo: ${loan.oldId} - ${loan.borrower?.personalData?.fullName || 'Sin nombre'} - $${loan.amountGived} - ${loan.status}`);
        }
        
        // 3. Crear registro en la tabla portfolioCleanup
        console.log('📝 Creando registro en tabla portfolioCleanup...');
        await prisma.portfolioCleanup.create({
            data: {
                name: `Portfolio Cleanup - ${startDate.toISOString().split('T')[0]} a ${endDate.toISOString().split('T')[0]}`,
                description: `Análisis de ${periodLoans.length} préstamos del período histórico. Activos: ${activeLoans}, Terminados: ${finishedLoans}. Monto total: $${totalAmountGived.toFixed(2)}`,
                cleanupDate: applicationDate,
                fromDate: startDate,
                toDate: endDate,
                excludedLoansCount: periodLoans.length,
                excludedAmount: totalAmountGived,
                routeId: routeId
            }
        });
        
    } catch (error) {
        console.error('❌ Error durante el portafolio cleanup:', error);
        throw error;
    }
}

// Función para procesar una ruta específica
async function processRoute(routeName?: string) {
    // Si no se proporciona el nombre de la ruta, preguntarlo
    if (!routeName) {
        routeName = await askQuestion('¿Cuál es el nombre de la ruta? (ej: Ruta 2, Ruta 3, etc.): ');
        
        if (!routeName.trim()) {
            console.error('❌ El nombre de la ruta no puede estar vacío');
            return;
        }
    }

    // Generar automáticamente el nombre del archivo Excel basándose en el nombre de la ruta
    const excelFileName = `${routeName.toLowerCase().replace(/\s+/g, '')}.xlsm`;

    console.log(`🚀 Iniciando proceso para la ruta: ${routeName}`);
    console.log(`📊 Usando archivo Excel: ${excelFileName}`);

    // Obtener o crear las cuentas compartidas (solo si no existen o si se reseteó la DB)
    const sharedBankAccount = await getOrCreateSharedBankAccount();
    const tokaAccount = await getOrCreateTokaAccount();
    const connectAccount = await getOrCreateConnectAccount();
    const officeCashAccount = await getOrCreateOfficeCashAccount();
    console.log('====CONNECT ACCOUNT====', connectAccount);
    console.log('====TOKA ACCOUNT====', tokaAccount);
    console.log('====OFFICE CASH ACCOUNT====', officeCashAccount);

    // Crear la ruta y su cuenta de efectivo específica
    const routeWithCashAccount = await prisma.route.create({
        data: {
            name: routeName,
            accounts: {
                create: {
                    name: `${routeName} Caja`,
                    type: 'EMPLOYEE_CASH_FUND',
                    amount: "0",
                }
            }
        },
        include: {
            accounts: true,
        }
    });

    // Conectar la ruta a todas las cuentas compartidas existentes
    await prisma.route.update({
        where: { id: routeWithCashAccount.id },
        data: {
            accounts: {
                connect: [
                    { id: sharedBankAccount.id },
                    { id: tokaAccount.id },
                    { id: connectAccount.id },
                    { id: officeCashAccount.id }
                ]
            }
        }
    });

    console.log(`✅ Ruta "${routeName}" creada con cuenta de efectivo`);
    console.log(`🔗 Ruta conectada a cuentas compartidas:`);
    console.log(`   - Cuenta Bancaria: ${sharedBankAccount.name}`);
    console.log(`   - Cuenta Gasolina: ${tokaAccount.name}`);
    console.log(`   - Cuenta Gastos: ${connectAccount.name}`);
    console.log(`   - Caja Merida: ${officeCashAccount.name}`);
    const routeId = routeWithCashAccount.id;
    if (routeWithCashAccount.accounts?.[0]?.id) {
        const cashAccountId = routeWithCashAccount.accounts[0].id;
        const bankAccountId = sharedBankAccount.id;
        const tokaAccountId = tokaAccount.id;
        const connectAccountId = connectAccount.id;

        console.log(`💰 Cuenta de efectivo: ${cashAccountId}`);
        console.log(`🏦 Cuenta bancaria compartida: ${bankAccountId}`);

        // Obtener los datos de snapshot de la ruta
        const snapshotData = await getRouteSnapshotData(routeWithCashAccount.id);

        await seedLeads(routeWithCashAccount.id, routeName, excelFileName);
        
        // Crear mapeo de leads usando el Excel
        const leadMapping = await createLeadMapping(routeWithCashAccount.id, excelFileName, routeName);
        
        console.log('🔄 ========== INICIANDO SEED EXPENSES ==========');
        await seedExpenses(cashAccountId, bankAccountId, tokaAccountId, connectAccountId, snapshotData, excelFileName,routeId, leadMapping);
        console.log('✅ SEED EXPENSES COMPLETADO');
        
        console.log('🔄 ========== INICIANDO SEED LOANS ==========');
        await seedLoans(cashAccountId, bankAccountId, snapshotData, excelFileName, leadMapping);
        console.log('✅ SEED LOANS COMPLETADO');
        
        console.log('🔄 ========== INICIANDO SEED NOMINA ==========');
        await seedNomina(bankAccountId, snapshotData, excelFileName, routeId, leadMapping);
        console.log('✅ SEED NOMINA COMPLETADO');
        
        console.log('🔄 ========== INICIANDO PORTFOLIO CLEANUP ==========');
        await portfolioCleanup(cashAccountId, bankAccountId, routeId);
        console.log('✅ PORTFOLIO CLEANUP COMPLETADO');

        //
        //await seedPayments(route2.id);
        //TODO: save comision and earned amount on payments
        console.log('✅ Datos guardados en la base de datos');

        const yearResume = await getYearResume(
            cashAccountId,
            bankAccountId,
            2025
        );
        
        console.table(yearResume);
        //console.table(monthResume);
        let totalAnnualBalance = 0;
        let totalAnnualBalanceWithReinvest = 0;

        for (const month of Object.keys(yearResume)) {
            totalAnnualBalance += yearResume[month].balance || 0;
            totalAnnualBalanceWithReinvest += yearResume[month].balanceWithReinvest || 0;
        }

        console.log('Total Annual Balance 2024:', totalAnnualBalance);
        console.log('Total Annual Balance with Reinvest 2024:', totalAnnualBalanceWithReinvest);

        const yearResume2023 = await getYearResume(
            cashAccountId,
            bankAccountId,
            2023
        );
        console.table(yearResume2023);
        let totalAnnualBalance23 = 0;
        let totalAnnualBalanceWithReinvest23 = 0;
        for (const month of Object.keys(yearResume2023)) {
            totalAnnualBalance23 += yearResume2023[month].balance || 0;
            totalAnnualBalanceWithReinvest23 += yearResume2023[month].balanceWithReinvest || 0;
        }

        console.log('Total Annual Balance 2023:', totalAnnualBalance23);
        console.log('Total Annual Balance with Reinvest 2023:', totalAnnualBalanceWithReinvest23);

        console.log('✅ Proceso completado para la ruta:', routeName);
        
        // Preguntar si quiere procesar otra ruta
        const anotherRoute = await askQuestion('¿Quieres procesar otra ruta? (s/n): ');
        const shouldProcessAnother = anotherRoute.toLowerCase() === 's' || anotherRoute.toLowerCase() === 'si' || anotherRoute.toLowerCase() === 'y' || anotherRoute.toLowerCase() === 'yes';
        
        if (shouldProcessAnother) {
            console.log('\n🔄 ========== PROCESANDO NUEVA RUTA ==========\n');
            return await processRoute(); // Llamada recursiva para procesar otra ruta (sin parámetro)
        } else {
            console.log('🏁 Proceso finalizado. ¡Hasta luego!');
            return yearResume;
        }
    } else {
        console.error('❌ Error: No se pudo crear la cuenta de efectivo para la ruta');
    }
}

async function main() {
    try {
        // Preguntar al usuario si quiere reiniciar la base de datos
        const resetDb = await askQuestion('¿Quieres reiniciar la base de datos? (s/n): ');
        const shouldResetDb = resetDb.toLowerCase() === 's' || resetDb.toLowerCase() === 'si' || resetDb.toLowerCase() === 'y' || resetDb.toLowerCase() === 'yes';
        
        if (shouldResetDb) {
            console.log('🔄 Reiniciando base de datos...');
            await cleanUpDb();
            await seedAccounts();
            console.log('✅ Base de datos reiniciada');
        } else {
            console.log('⏭️ Continuando con la base de datos existente...');
        }

        // Preguntar al usuario cuál es la ruta
        const routeName = await askQuestion('¿Cuál es el nombre de la ruta? (ej: Ruta 2, Ruta 3, etc.): ');
        
        if (!routeName.trim()) {
            console.error('❌ El nombre de la ruta no puede estar vacío');
            return;
        }

        // Generar automáticamente el nombre del archivo Excel basándose en el nombre de la ruta
        const excelFileName = `${routeName.toLowerCase().replace(/\s+/g, '')}.xlsm`;

        console.log(`🚀 Iniciando proceso para la ruta: ${routeName}`);
        console.log(`📊 Usando archivo Excel: ${excelFileName}`);

        // Iniciar el procesamiento de rutas
        await processRoute(routeName);
        
    } catch (error) {
        console.error('❌ Error durante la ejecución:', error);
    }
}

main()
    .catch(e => {
        console.error('❌ Error en main():', e);
    })
    .finally(async () => {
        console.log('🔌 ========== CERRANDO CONEXIÓN PRISMA ==========');
        console.log('🔌 Ejecutando prisma.$disconnect()...');
        await prisma.$disconnect();
        console.log('🔌 Conexión Prisma cerrada');
    });