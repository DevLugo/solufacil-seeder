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

// Función para obtener o crear la cuenta bancaria compartida
async function getOrCreateSharedBankAccount() {
    // Buscar si ya existe una cuenta bancaria compartida
    const existingBankAccount = await prisma.account.findFirst({
        where: {
            type: 'BANK',
            routeId: null // Cuenta bancaria compartida no está asociada a una ruta específica
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
            amount: "0",
            routeId: null // No asociada a una ruta específica
        }
    });

    console.log('✅ Nueva cuenta bancaria compartida creada:', newBankAccount.name);
    return newBankAccount;
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

async function main() {
    try {
        // Preguntar al usuario cuál es la ruta
        const routeName = await askQuestion('¿Cuál es el nombre de la ruta? (ej: Ruta 2, Ruta 3, etc.): ');
        
        if (!routeName.trim()) {
            console.error('❌ El nombre de la ruta no puede estar vacío');
            return;
        }

        // Preguntar al usuario cuál es el nombre del archivo Excel
        const excelFileName = await askQuestion('¿Cuál es el nombre del archivo Excel? (ej: ruta2.xlsm): ');
        
        if (!excelFileName.trim()) {
            console.error('❌ El nombre del archivo Excel no puede estar vacío');
            return;
        }

        console.log(`🚀 Iniciando proceso para la ruta: ${routeName}`);
        console.log(`📊 Usando archivo Excel: ${excelFileName}`);

        //TODO: handle the bak deposits
        await cleanUpDb();
        await seedAccounts();

        // Obtener o crear la cuenta bancaria compartida
        const sharedBankAccount = await getOrCreateSharedBankAccount();

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

        console.log(`✅ Ruta "${routeName}" creada con cuenta de efectivo`);

        if (routeWithCashAccount.accounts?.[0]?.id) {
            const cashAccountId = routeWithCashAccount.accounts[0].id;
            const bankAccountId = sharedBankAccount.id;

            console.log(`💰 Cuenta de efectivo: ${cashAccountId}`);
            console.log(`🏦 Cuenta bancaria compartida: ${bankAccountId}`);

            // Obtener los datos de snapshot de la ruta
            const snapshotData = await getRouteSnapshotData(routeWithCashAccount.id);

            await seedLeads(routeWithCashAccount.id, routeName, excelFileName);
            
            // Crear mapeo de leads usando el Excel
            const leadMapping = await createLeadMapping(routeWithCashAccount.id, excelFileName, routeName);
            
            await seedExpenses(cashAccountId, bankAccountId, snapshotData, excelFileName, leadMapping);
            await seedLoans(cashAccountId, bankAccountId, snapshotData, excelFileName, leadMapping);
            await seedNomina(bankAccountId, snapshotData, excelFileName, leadMapping);
            //await seedPayments(route2.id);
            //TODO: save comision and earned amount on payments
            console.log('✅ Datos guardados en la base de datos');

            const yearResume = await getYearResume(
                cashAccountId,
                bankAccountId,
                2024
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

            return yearResume;
        } else {
            console.error('❌ Error: No se pudo crear la cuenta de efectivo para la ruta');
        }
        
    } catch (error) {
        console.error('❌ Error durante la ejecución:', error);
    }
}

main()
    .catch(e => {
        console.error(e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });