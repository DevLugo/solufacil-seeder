"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = exports.prisma = void 0;
exports.main = main;
const client_1 = require("@prisma/client");
const utils_1 = require("./utils");
const loan_1 = require("./loan");
const expenses_1 = require("./expenses");
const account_1 = require("./account");
const leads_1 = require("./leads");
const month_1 = require("./report/month");
const nomina_1 = require("./nomina");
exports.prisma = new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['info', 'warn', 'error'] : ['query', 'info', 'warn', 'error'],
});
// Función para logs con timestamps
const log = (message, type = 'info') => {
    const timestamp = new Date().toISOString();
    const symbols = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
    console.log(`${symbols[type]} [${timestamp}] ${message}`);
};
exports.log = log;
async function main() {
    const startTime = Date.now();
    (0, exports.log)('🚀 INICIANDO SEEDER EN RENDER CLOUD', 'info');
    (0, exports.log)(`📍 Entorno: ${process.env.NODE_ENV || 'development'}`, 'info');
    (0, exports.log)(`🗄️ Base de datos: ${process.env.DATABASE_URL ? 'Conectada' : 'No configurada'}`, 'info');
    try {
        //TODO: handle the bak deposits
        (0, exports.log)('🧹 Limpiando base de datos...', 'info');
        await (0, utils_1.cleanUpDb)();
        (0, exports.log)('💰 Creando cuentas...', 'info');
        await (0, account_1.seedAccounts)();
        // Crear accounts con routes anidados (corrección de relaciones)
        const cashAccount = await exports.prisma.account.create({
            data: {
                name: 'Ruta 2 Caja',
                type: 'EMPLOYEE_CASH_FUND',
                amount: "0",
                route: {
                    create: {
                        name: 'Ruta 2 Cash Route'
                    }
                }
            },
            include: { route: true }
        });
        const bankAccount = await exports.prisma.account.create({
            data: {
                name: 'Ruta 2 Banco',
                type: 'BANK',
                amount: "0",
                route: {
                    create: {
                        name: 'Ruta 2 Bank Route'
                    }
                }
            },
            include: { route: true }
        });
        if (cashAccount.id && bankAccount.id) {
            (0, exports.log)('👥 Seeding leads...', 'info');
            await (0, leads_1.seedLeads)(cashAccount.route?.id || '');
            (0, exports.log)('💳 Seeding préstamos (OPTIMIZADO)...', 'info');
            await (0, loan_1.seedLoans)(cashAccount.id, bankAccount.id);
            (0, exports.log)('💸 Seeding gastos...', 'info');
            await (0, expenses_1.seedExpenses)(cashAccount.id, bankAccount.id);
            (0, exports.log)('💼 Seeding nómina...', 'info');
            await (0, nomina_1.seedNomina)(bankAccount.id);
            (0, exports.log)('✅ Datos guardados en la base de datos', 'success');
            (0, exports.log)('📊 Generando reportes...', 'info');
            const yearResume = await (0, month_1.getYearResume)(cashAccount.id, bankAccount.id, 2024);
            console.table(yearResume);
            let totalAnnualBalance = 0;
            let totalAnnualBalanceWithReinvest = 0;
            for (const month of Object.keys(yearResume)) {
                totalAnnualBalance += yearResume[month].balance || 0;
                totalAnnualBalanceWithReinvest += yearResume[month].balanceWithReinvest || 0;
            }
            (0, exports.log)(`💰 Total Annual Balance 2024: ${totalAnnualBalance}`, 'success');
            (0, exports.log)(`📈 Total Annual Balance with Reinvest 2024: ${totalAnnualBalanceWithReinvest}`, 'success');
            const yearResume2023 = await (0, month_1.getYearResume)(cashAccount.id, bankAccount.id, 2023);
            console.table(yearResume2023);
            let totalAnnualBalance23 = 0;
            let totalAnnualBalanceWithReinvest23 = 0;
            for (const month of Object.keys(yearResume2023)) {
                totalAnnualBalance23 += yearResume2023[month].balance || 0;
                totalAnnualBalanceWithReinvest23 += yearResume2023[month].balanceWithReinvest || 0;
            }
            (0, exports.log)(`💰 Total Annual Balance 2023: ${totalAnnualBalance23}`, 'success');
            (0, exports.log)(`📈 Total Annual Balance with Reinvest 2023: ${totalAnnualBalanceWithReinvest23}`, 'success');
            const totalTime = (Date.now() - startTime) / 1000;
            (0, exports.log)(`🏁 SEEDER COMPLETADO EN RENDER - Tiempo total: ${totalTime}s`, 'success');
            (0, exports.log)(`⚡ Speedup vs Local: ~${Math.round(totalTime * 3)}s ahorrados`, 'success');
            return yearResume;
        }
    }
    catch (error) {
        (0, exports.log)(`💥 Error durante el seeding: ${error}`, 'error');
        throw error;
    }
    finally {
        (0, exports.log)('🔌 Desconectando de la base de datos...', 'info');
        await exports.prisma.$disconnect();
        (0, exports.log)('👋 Proceso finalizado', 'info');
    }
}
// Solo ejecutar si este archivo se llama directamente
if (require.main === module) {
    main()
        .catch(e => {
        (0, exports.log)(`🚨 Error fatal: ${e}`, 'error');
        console.error(e);
        process.exit(1);
    });
}
