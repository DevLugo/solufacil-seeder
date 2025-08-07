"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const utils_1 = require("./utils");
const loan_1 = require("./loan");
const expenses_1 = require("./expenses");
const account_1 = require("./account");
const leads_1 = require("./leads");
const month_1 = require("./report/month");
const nomina_1 = require("./nomina");
const readline = __importStar(require("readline"));
exports.prisma = new client_1.PrismaClient();
// Función para leer input del usuario
function askQuestion(question) {
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
async function getOrCreateTokaAccount() {
    const existingTokaAccount = await exports.prisma.account.findFirst({
        where: {
            type: 'PREPAID_GAS',
            routeId: null // Cuenta bancaria compartida no está asociada a una ruta específica
        }
    });
    if (existingTokaAccount) {
        console.log('✅ Cuenta de gasolina encontrada y reutilizada:', existingTokaAccount.name);
        return existingTokaAccount;
    }
    const newTokaAccount = await exports.prisma.account.create({
        data: {
            name: 'Cuenta de gasolina',
            type: 'PREPAID_GAS',
            amount: "0",
            routeId: null // No asociada a una ruta específica
        }
    });
    console.log('✅ Nueva cuenta de gasolina creada:', newTokaAccount.name);
    return newTokaAccount;
}
// Función para obtener o crear la cuenta bancaria compartida
async function getOrCreateSharedBankAccount() {
    // Buscar si ya existe una cuenta bancaria compartida
    const existingBankAccount = await exports.prisma.account.findFirst({
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
    const newBankAccount = await exports.prisma.account.create({
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
async function getRouteSnapshotData(routeId) {
    const route = await exports.prisma.route.findUnique({
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
async function createLeadMapping(routeId, excelFileName, routeName) {
    // Extraer datos del Excel
    const leadsData = (0, leads_1.extractLeadsData)(excelFileName, routeName);
    console.log(`📊 Total de leads extraídos del Excel: ${leadsData.length}`);
    console.log(`📋 Primeros 5 leads del Excel:`, leadsData.slice(0, 5).map(l => ({ oldId: l.oldId, nombre: l.nombre, apellidos: l.apellidos })));
    // Obtener todos los empleados de la ruta
    const employees = await exports.prisma.employee.findMany({
        where: { routesId: routeId },
        include: { personalData: true }
    });
    console.log(`👥 Total de empleados en la ruta: ${employees.length}`);
    console.log(`📋 Primeros 5 empleados:`, employees.slice(0, 5).map(e => ({ id: e.id, oldId: e.oldId, fullName: e.personalData?.fullName })));
    // Crear mapeo de oldId a realId
    const leadMapping = {};
    for (const excelLead of leadsData) {
        const oldId = excelLead.oldId;
        // Buscar el empleado correspondiente en la base de datos
        const employee = employees.find(emp => emp.oldId === oldId ||
            emp.personalData?.fullName === `${excelLead.nombre} ${excelLead.apellidos}`);
        if (employee) {
            leadMapping[oldId] = employee.id;
            console.log(`✅ Mapeo creado: ${oldId} -> ${employee.id} (${employee.personalData?.fullName})`);
        }
        else {
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
        await (0, utils_1.cleanUpDb)();
        await (0, account_1.seedAccounts)();
        // Obtener o crear la cuenta bancaria compartida
        const sharedBankAccount = await getOrCreateSharedBankAccount();
        const tokaAccount = await getOrCreateTokaAccount();
        // Crear la ruta y su cuenta de efectivo específica
        const routeWithCashAccount = await exports.prisma.route.create({
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
        const routeId = routeWithCashAccount.id;
        if (routeWithCashAccount.accounts?.[0]?.id) {
            const cashAccountId = routeWithCashAccount.accounts[0].id;
            const bankAccountId = sharedBankAccount.id;
            const tokaAccountId = tokaAccount.id;
            console.log(`💰 Cuenta de efectivo: ${cashAccountId}`);
            console.log(`🏦 Cuenta bancaria compartida: ${bankAccountId}`);
            // Obtener los datos de snapshot de la ruta
            const snapshotData = await getRouteSnapshotData(routeWithCashAccount.id);
            await (0, leads_1.seedLeads)(routeWithCashAccount.id, routeName, excelFileName);
            // Crear mapeo de leads usando el Excel
            const leadMapping = await createLeadMapping(routeWithCashAccount.id, excelFileName, routeName);
            await (0, expenses_1.seedExpenses)(cashAccountId, bankAccountId, tokaAccountId, snapshotData, excelFileName, routeId, leadMapping);
            await (0, loan_1.seedLoans)(cashAccountId, bankAccountId, snapshotData, excelFileName, leadMapping);
            await (0, nomina_1.seedNomina)(bankAccountId, snapshotData, excelFileName, routeId, leadMapping);
            //await seedPayments(route2.id);
            //TODO: save comision and earned amount on payments
            console.log('✅ Datos guardados en la base de datos');
            const yearResume = await (0, month_1.getYearResume)(cashAccountId, bankAccountId, 2025);
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
            const yearResume2023 = await (0, month_1.getYearResume)(cashAccountId, bankAccountId, 2023);
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
        }
        else {
            console.error('❌ Error: No se pudo crear la cuenta de efectivo para la ruta');
        }
    }
    catch (error) {
        console.error('❌ Error durante la ejecución:', error);
    }
}
main()
    .catch(e => {
    console.error(e);
})
    .finally(async () => {
    await exports.prisma.$disconnect();
});
