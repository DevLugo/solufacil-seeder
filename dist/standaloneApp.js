"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
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
const express_1 = __importDefault(require("express"));
// Configurar timeout más largo y garbage collection
if (global.gc) {
    console.log('✅ Garbage collection manual disponible');
}
else {
    console.log('⚠️ Garbage collection manual NO disponible');
}
exports.prisma = new client_1.PrismaClient({
    log: ['error', 'warn'], // Reducir logging de Prisma para mejorar performance
});
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 3000;
let isSeeding = false;
let lastSeedResult = null;
let lastSeedError = null;
async function runSeeding() {
    if (isSeeding) {
        throw new Error('El seeding ya está en progreso');
    }
    isSeeding = true;
    lastSeedError = null;
    try {
        console.log('Iniciando proceso de seeding...');
        await (0, utils_1.cleanUpDb)();
        await (0, account_1.seedAccounts)();
        const route2CashAccount = await exports.prisma.route.create({
            data: {
                name: 'Ruta 2',
                accounts: {
                    create: {
                        name: 'Ruta 2 Caja',
                        type: 'EMPLOYEE_CASH_FUND',
                        amount: "0",
                    }
                }
            },
            include: {
                accounts: true,
            }
        });
        const route2BankAccount = await exports.prisma.route.create({
            data: {
                name: 'Ruta 2',
                accounts: {
                    create: {
                        name: 'Ruta 2 Banco',
                        type: 'BANK',
                        amount: "0",
                    }
                }
            },
            include: {
                accounts: true,
            }
        });
        if (route2CashAccount.accounts?.[0]?.id && route2BankAccount.accounts?.[0]?.id) {
            await (0, leads_1.seedLeads)(route2CashAccount.id);
            await (0, loan_1.seedLoans)(route2CashAccount.accounts[0].id, route2BankAccount.accounts[0].id);
            await (0, expenses_1.seedExpenses)(route2CashAccount.accounts[0].id, route2BankAccount.accounts[0].id);
            await (0, nomina_1.seedNomina)(route2BankAccount.accounts[0].id);
            console.log('Datos guardados en la base de datos');
            const yearResume = await (0, month_1.getYearResume)(route2CashAccount.accounts[0].id ?? '', route2BankAccount.accounts[0].id, 2024);
            console.table(yearResume);
            let totalAnnualBalance = 0;
            let totalAnnualBalanceWithReinvest = 0;
            for (const month of Object.keys(yearResume)) {
                totalAnnualBalance += yearResume[month].balance || 0;
                totalAnnualBalanceWithReinvest += yearResume[month].balanceWithReinvest || 0;
            }
            console.log('Total Annual Balance 2024:', totalAnnualBalance);
            console.log('Total Annual Balance with Reinvest 2024:', totalAnnualBalanceWithReinvest);
            const yearResume2023 = await (0, month_1.getYearResume)(route2CashAccount.accounts[0].id ?? '', route2BankAccount.accounts[0].id, 2023);
            console.table(yearResume2023);
            let totalAnnualBalance23 = 0;
            let totalAnnualBalanceWithReinvest23 = 0;
            for (const month of Object.keys(yearResume2023)) {
                totalAnnualBalance23 += yearResume2023[month].balance || 0;
                totalAnnualBalanceWithReinvest23 += yearResume2023[month].balanceWithReinvest || 0;
            }
            console.log('Total Annual Balance 2023:', totalAnnualBalance23);
            console.log('Total Annual Balance with Reinvest 2023:', totalAnnualBalanceWithReinvest23);
            lastSeedResult = {
                success: true,
                message: 'Seeding completado exitosamente',
                data: {
                    yearResume2024: yearResume,
                    yearResume2023: yearResume2023,
                    totalAnnualBalance2024: totalAnnualBalance,
                    totalAnnualBalanceWithReinvest2024: totalAnnualBalanceWithReinvest,
                    totalAnnualBalance2023: totalAnnualBalance23,
                    totalAnnualBalanceWithReinvest2023: totalAnnualBalanceWithReinvest23
                },
                timestamp: new Date().toISOString()
            };
            return lastSeedResult;
        }
        else {
            throw new Error('No se pudieron crear las cuentas correctamente');
        }
    }
    catch (error) {
        console.error('Error durante el seeding:', error);
        lastSeedError = error instanceof Error ? error.message : 'Error desconocido';
        lastSeedResult = {
            success: false,
            message: 'Error durante el seeding',
            error: lastSeedError,
            timestamp: new Date().toISOString()
        };
        throw error;
    }
    finally {
        isSeeding = false;
    }
}
// Middlewares
app.use(express_1.default.json());
// Health check endpoint para Railway
app.get('/', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'keystone-seeder',
        timestamp: new Date().toISOString(),
        isSeeding,
        lastSeedResult: lastSeedResult ? lastSeedResult.timestamp : null,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid
    });
});
// Health check adicional más simple
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});
// Endpoint para ejecutar el seeding
app.post('/seed', async (req, res) => {
    try {
        if (isSeeding) {
            return res.status(409).json({
                success: false,
                message: 'El seeding ya está en progreso',
                isSeeding: true
            });
        }
        const result = await runSeeding();
        res.json(result);
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error ejecutando el seeding',
            error: error instanceof Error ? error.message : 'Error desconocido',
            timestamp: new Date().toISOString()
        });
    }
});
// Endpoint para obtener el estado del seeding
app.get('/status', (req, res) => {
    res.json({
        isSeeding,
        lastSeedResult,
        lastSeedError,
        timestamp: new Date().toISOString()
    });
});
// Endpoint para obtener los últimos resultados
app.get('/results', (req, res) => {
    if (!lastSeedResult) {
        return res.status(404).json({
            message: 'No hay resultados disponibles. Ejecuta el seeding primero.',
            timestamp: new Date().toISOString()
        });
    }
    res.json(lastSeedResult);
});
// Iniciar el servidor
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/`);
    console.log(`🌱 Ejecutar seeding: POST http://localhost:${PORT}/seed`);
    console.log(`📈 Ver estado: http://localhost:${PORT}/status`);
    console.log(`📋 Ver resultados: http://localhost:${PORT}/results`);
    console.log(`🌍 Server running on 0.0.0.0:${PORT}`);
});
// Manejo de errores del servidor
server.on('error', (error) => {
    console.error('❌ Error del servidor:', error);
});
// Manejo de cierre graceful
let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
    if (isShuttingDown) {
        console.log(`⚠️ Ya estamos cerrando el servidor, ignorando ${signal}`);
        return;
    }
    isShuttingDown = true;
    console.log(`📥 Señal ${signal} recibida, cerrando servidor gracefully...`);
    // Detener de aceptar nuevas conexiones
    server.close(async (err) => {
        if (err) {
            console.error('❌ Error cerrando el servidor:', err);
        }
        else {
            console.log('✅ Servidor HTTP cerrado correctamente');
        }
        try {
            console.log('🔌 Desconectando Prisma...');
            await exports.prisma.$disconnect();
            console.log('✅ Prisma desconectado correctamente');
        }
        catch (error) {
            console.error('❌ Error desconectando Prisma:', error);
        }
        console.log('👋 Proceso terminado');
        process.exit(0);
    });
    // Timeout de seguridad - forzar cierre después de 10 segundos
    setTimeout(() => {
        console.log('⏰ Timeout alcanzado, forzando cierre del proceso');
        process.exit(1);
    }, 10000);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚫 Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});
// Log de inicio exitoso
console.log('🎯 Aplicación iniciada correctamente');
console.log('🔗 Variables de entorno:');
console.log(`   PORT: ${PORT}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Configurada' : '❌ No configurada'}`);
