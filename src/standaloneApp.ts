import { PrismaClient } from '@prisma/client';
import { cleanUpDb } from './utils';
import { seedLoans } from './loan';
import { seedExpenses } from './expenses';
import { seedAccounts } from './account';
import { seedLeads } from './leads';
import { getYearResume } from './report/month';
import { seedNomina } from './nomina';
import express from 'express';

// Configurar timeout más largo y garbage collection
if (global.gc) {
    console.log('✅ Garbage collection manual disponible');
} else {
    console.log('⚠️ Garbage collection manual NO disponible');
}

export const prisma = new PrismaClient({
    log: ['error', 'warn'], // Reducir logging de Prisma para mejorar performance
});

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Estado del seeding por pasos
interface SeedingState {
    isActive: boolean;
    completedSteps: string[];
    accounts?: {
        cashAccountId?: string;
        bankAccountId?: string;
        routeId?: string;
    };
    lastResults?: any;
    errors?: string[];
}

let seedingState: SeedingState = {
    isActive: false,
    completedSteps: [],
    errors: []
};

// Funciones individuales para cada paso del seeding
async function seedAccountsStep() {
    if (seedingState.completedSteps.includes('accounts')) {
        throw new Error('Las cuentas ya han sido creadas');
    }

    console.log('🧹 Limpiando base de datos...');
    await cleanUpDb();
    
    console.log('👥 Creando accounts...');
    await seedAccounts();
    
    console.log('🏦 Creando rutas y cuentas...');
    const route2CashAccount = await prisma.route.create({
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
    
    const route2BankAccount = await prisma.route.create({
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

    if (!route2CashAccount.accounts?.[0]?.id || !route2BankAccount.accounts?.[0]?.id) {
        throw new Error('No se pudieron crear las cuentas correctamente');
    }

    // Guardar los IDs de las cuentas
    seedingState.accounts = {
        cashAccountId: route2CashAccount.accounts[0].id,
        bankAccountId: route2BankAccount.accounts[0].id,
        routeId: route2CashAccount.id
    };

    console.log('🎯 Creando leads...');
    await seedLeads(route2CashAccount.id);

    seedingState.completedSteps.push('accounts');
    return {
        success: true,
        message: 'Accounts y leads creados exitosamente',
        data: seedingState.accounts,
        timestamp: new Date().toISOString()
    };
}

async function seedLoansStep() {
    if (!seedingState.completedSteps.includes('accounts')) {
        throw new Error('Debes ejecutar /seed/accounts primero');
    }
    if (seedingState.completedSteps.includes('loans')) {
        throw new Error('Los loans ya han sido creados');
    }
    if (!seedingState.accounts?.cashAccountId || !seedingState.accounts?.bankAccountId) {
        throw new Error('No se encontraron las cuentas necesarias');
    }

    console.log('💰 Creando loans...');
    await seedLoans(seedingState.accounts.cashAccountId, seedingState.accounts.bankAccountId);

    seedingState.completedSteps.push('loans');
    return {
        success: true,
        message: 'Loans creados exitosamente',
        timestamp: new Date().toISOString()
    };
}

async function seedExpensesStep() {
    if (!seedingState.completedSteps.includes('accounts')) {
        throw new Error('Debes ejecutar /seed/accounts primero');
    }
    if (seedingState.completedSteps.includes('expenses')) {
        throw new Error('Los expenses ya han sido creados');
    }
    if (!seedingState.accounts?.cashAccountId || !seedingState.accounts?.bankAccountId) {
        throw new Error('No se encontraron las cuentas necesarias');
    }

    console.log('💸 Creando expenses...');
    await seedExpenses(seedingState.accounts.cashAccountId, seedingState.accounts.bankAccountId);

    seedingState.completedSteps.push('expenses');
    return {
        success: true,
        message: 'Expenses creados exitosamente',
        timestamp: new Date().toISOString()
    };
}

async function seedNominaStep() {
    if (!seedingState.completedSteps.includes('accounts')) {
        throw new Error('Debes ejecutar /seed/accounts primero');
    }
    if (seedingState.completedSteps.includes('nomina')) {
        throw new Error('La nomina ya ha sido creada');
    }
    if (!seedingState.accounts?.bankAccountId) {
        throw new Error('No se encontró la cuenta de banco necesaria');
    }

    console.log('💼 Creando nomina...');
    await seedNomina(seedingState.accounts.bankAccountId);

    seedingState.completedSteps.push('nomina');
    return {
        success: true,
        message: 'Nomina creada exitosamente',
        timestamp: new Date().toISOString()
    };
}

async function generateReportsStep() {
    if (!seedingState.accounts?.cashAccountId || !seedingState.accounts?.bankAccountId) {
        throw new Error('No se encontraron las cuentas necesarias. Ejecuta los pasos anteriores primero.');
    }

    console.log('📊 Generando reportes anuales...');
    
    const yearResume2024 = await getYearResume(
        seedingState.accounts.cashAccountId,
        seedingState.accounts.bankAccountId,
        2024
    );
    
    console.table(yearResume2024);
    let totalAnnualBalance2024 = 0;
    let totalAnnualBalanceWithReinvest2024 = 0;

    for (const month of Object.keys(yearResume2024)) {
        totalAnnualBalance2024 += yearResume2024[month].balance || 0;
        totalAnnualBalanceWithReinvest2024 += yearResume2024[month].balanceWithReinvest || 0;
    }

    const yearResume2023 = await getYearResume(
        seedingState.accounts.cashAccountId,
        seedingState.accounts.bankAccountId,
        2023
    );
    console.table(yearResume2023);
    let totalAnnualBalance2023 = 0;
    let totalAnnualBalanceWithReinvest2023 = 0;
    for (const month of Object.keys(yearResume2023)) {
        totalAnnualBalance2023 += yearResume2023[month].balance || 0;
        totalAnnualBalanceWithReinvest2023 += yearResume2023[month].balanceWithReinvest || 0;
    }

    console.log('Total Annual Balance 2024:', totalAnnualBalance2024);
    console.log('Total Annual Balance with Reinvest 2024:', totalAnnualBalanceWithReinvest2024);
    console.log('Total Annual Balance 2023:', totalAnnualBalance2023);
    console.log('Total Annual Balance with Reinvest 2023:', totalAnnualBalanceWithReinvest2023);

    const reportData = {
        yearResume2024,
        yearResume2023,
        totals: {
            totalAnnualBalance2024,
            totalAnnualBalanceWithReinvest2024,
            totalAnnualBalance2023,
            totalAnnualBalanceWithReinvest2023
        }
    };

    seedingState.lastResults = reportData;
    seedingState.completedSteps.push('reports');

    return {
        success: true,
        message: 'Reportes generados exitosamente',
        data: reportData,
        timestamp: new Date().toISOString()
    };
}

// Middlewares
app.use(express.json());

// Health check endpoint para Railway
app.get('/', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'keystone-seeder',
        timestamp: new Date().toISOString(),
        seedingState: {
            isActive: seedingState.isActive,
            completedSteps: seedingState.completedSteps,
            totalSteps: ['accounts', 'loans', 'expenses', 'nomina', 'reports']
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid
    });
});

// Health check adicional más simple
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Endpoint para resetear el estado del seeding
app.post('/seed/reset', (req, res) => {
    seedingState = {
        isActive: false,
        completedSteps: [],
        errors: []
    };
    res.json({
        success: true,
        message: 'Estado del seeding reseteado',
        timestamp: new Date().toISOString()
    });
});

// Endpoint para crear accounts y leads
app.post('/seed/accounts', async (req, res) => {
    try {
        if (seedingState.isActive) {
            return res.status(409).json({
                success: false,
                message: 'Otro proceso de seeding está en progreso'
            });
        }

        seedingState.isActive = true;
        const result = await seedAccountsStep();
        res.json(result);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        seedingState.errors?.push(errorMsg);
        res.status(500).json({
            success: false,
            message: 'Error creando accounts',
            error: errorMsg,
            timestamp: new Date().toISOString()
        });
    } finally {
        seedingState.isActive = false;
    }
});

// Endpoint para crear loans
app.post('/seed/loans', async (req, res) => {
    try {
        if (seedingState.isActive) {
            return res.status(409).json({
                success: false,
                message: 'Otro proceso de seeding está en progreso'
            });
        }

        seedingState.isActive = true;
        const result = await seedLoansStep();
        res.json(result);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        seedingState.errors?.push(errorMsg);
        res.status(500).json({
            success: false,
            message: 'Error creando loans',
            error: errorMsg,
            timestamp: new Date().toISOString()
        });
    } finally {
        seedingState.isActive = false;
    }
});

// Endpoint para crear expenses
app.post('/seed/expenses', async (req, res) => {
    try {
        if (seedingState.isActive) {
            return res.status(409).json({
                success: false,
                message: 'Otro proceso de seeding está en progreso'
            });
        }

        seedingState.isActive = true;
        const result = await seedExpensesStep();
        res.json(result);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        seedingState.errors?.push(errorMsg);
        res.status(500).json({
            success: false,
            message: 'Error creando expenses',
            error: errorMsg,
            timestamp: new Date().toISOString()
        });
    } finally {
        seedingState.isActive = false;
    }
});

// Endpoint para crear nomina
app.post('/seed/nomina', async (req, res) => {
    try {
        if (seedingState.isActive) {
            return res.status(409).json({
                success: false,
                message: 'Otro proceso de seeding está en progreso'
            });
        }

        seedingState.isActive = true;
        const result = await seedNominaStep();
        res.json(result);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        seedingState.errors?.push(errorMsg);
        res.status(500).json({
            success: false,
            message: 'Error creando nomina',
            error: errorMsg,
            timestamp: new Date().toISOString()
        });
    } finally {
        seedingState.isActive = false;
    }
});

// Endpoint para generar reportes anuales
app.post('/seed/reports', async (req, res) => {
    try {
        if (seedingState.isActive) {
            return res.status(409).json({
                success: false,
                message: 'Otro proceso de seeding está en progreso'
            });
        }

        seedingState.isActive = true;
        const result = await generateReportsStep();
        res.json(result);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        seedingState.errors?.push(errorMsg);
        res.status(500).json({
            success: false,
            message: 'Error generando reportes',
            error: errorMsg,
            timestamp: new Date().toISOString()
        });
    } finally {
        seedingState.isActive = false;
    }
});

// Endpoint para obtener el estado del seeding
app.get('/status', (req, res) => {
    res.json({
        seedingState: {
            isActive: seedingState.isActive,
            completedSteps: seedingState.completedSteps,
            accounts: seedingState.accounts,
            errors: seedingState.errors,
            totalSteps: ['accounts', 'loans', 'expenses', 'nomina', 'reports']
        },
        timestamp: new Date().toISOString()
    });
});

// Endpoint para obtener los últimos resultados
app.get('/results', (req, res) => {
    if (!seedingState.lastResults) {
        return res.status(404).json({
            message: 'No hay resultados disponibles. Ejecuta /seed/reports primero.',
            timestamp: new Date().toISOString()
        });
    }
    
    res.json({
        success: true,
        data: seedingState.lastResults,
        timestamp: new Date().toISOString()
    });
});

// Endpoint legacy para ejecutar todo el seeding (mantener compatibilidad)
app.post('/seed', async (req, res) => {
    res.json({
        success: false,
        message: 'El endpoint /seed ha sido depreciado. Usa los endpoints individuales:',
        steps: [
            'POST /seed/reset (opcional)',
            'POST /seed/accounts',
            'POST /seed/loans', 
            'POST /seed/expenses',
            'POST /seed/nomina',
            'POST /seed/reports'
        ],
        timestamp: new Date().toISOString()
    });
});

// Iniciar el servidor
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/`);
    console.log(`🔄 Reset seeding: POST http://localhost:${PORT}/seed/reset`);
    console.log(`👥 Crear accounts: POST http://localhost:${PORT}/seed/accounts`);
    console.log(`💰 Crear loans: POST http://localhost:${PORT}/seed/loans`);
    console.log(`💸 Crear expenses: POST http://localhost:${PORT}/seed/expenses`);
    console.log(`💼 Crear nomina: POST http://localhost:${PORT}/seed/nomina`);
    console.log(`📊 Generar reportes: POST http://localhost:${PORT}/seed/reports`);
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

const gracefulShutdown = async (signal: string) => {
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
        } else {
            console.log('✅ Servidor HTTP cerrado correctamente');
        }
        
        try {
            console.log('🔌 Desconectando Prisma...');
            await prisma.$disconnect();
            console.log('✅ Prisma desconectado correctamente');
        } catch (error) {
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