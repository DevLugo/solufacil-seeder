import { PrismaClient } from '@prisma/client';
import { cleanUpDb } from './utils';
import { seedLoans } from './loan';
import { seedExpenses } from './expenses';
import { seedAccounts } from './account';
import { seedLeads } from './leads';
import { getYearResume } from './report/month';
import { seedNomina } from './nomina';
import express from 'express';

export const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

let isSeeding = false;
let lastSeedResult: any = null;
let lastSeedError: string | null = null;

async function runSeeding() {
    if (isSeeding) {
        throw new Error('El seeding ya está en progreso');
    }

    isSeeding = true;
    lastSeedError = null;
    
    try {
        console.log('Iniciando proceso de seeding...');

        await cleanUpDb();
        await seedAccounts();
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
        
        if (route2CashAccount.accounts?.[0]?.id && route2BankAccount.accounts?.[0]?.id) {
            await seedLeads(route2CashAccount.id);
            await seedLoans(route2CashAccount.accounts[0].id, route2BankAccount.accounts[0].id);
            await seedExpenses(route2CashAccount.accounts[0].id, route2BankAccount.accounts[0].id);
            await seedNomina(route2BankAccount.accounts[0].id);
            
            console.log('Datos guardados en la base de datos');
            const yearResume = await getYearResume(
                route2CashAccount.accounts[0].id ?? '',
                route2BankAccount.accounts[0].id,
                2024
            );
            
            console.table(yearResume);
            let totalAnnualBalance = 0;
            let totalAnnualBalanceWithReinvest = 0;

            for (const month of Object.keys(yearResume)) {
                totalAnnualBalance += yearResume[month].balance || 0;
                totalAnnualBalanceWithReinvest += yearResume[month].balanceWithReinvest || 0;
            }

            console.log('Total Annual Balance 2024:', totalAnnualBalance);
            console.log('Total Annual Balance with Reinvest 2024:', totalAnnualBalanceWithReinvest);

            const yearResume2023 = await getYearResume(
                route2CashAccount.accounts[0].id ?? '',
                route2BankAccount.accounts[0].id,
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
        } else {
            throw new Error('No se pudieron crear las cuentas correctamente');
        }
    } catch (error) {
        console.error('Error durante el seeding:', error);
        lastSeedError = error instanceof Error ? error.message : 'Error desconocido';
        lastSeedResult = {
            success: false,
            message: 'Error durante el seeding',
            error: lastSeedError,
            timestamp: new Date().toISOString()
        };
        throw error;
    } finally {
        isSeeding = false;
    }
}

// Middlewares
app.use(express.json());

// Health check endpoint para Railway
app.get('/', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'keystone-seeder',
        timestamp: new Date().toISOString(),
        isSeeding,
        lastSeedResult: lastSeedResult ? lastSeedResult.timestamp : null
    });
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
    } catch (error) {
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
app.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/`);
    console.log(`🌱 Ejecutar seeding: POST http://localhost:${PORT}/seed`);
    console.log(`📈 Ver estado: http://localhost:${PORT}/status`);
    console.log(`📋 Ver resultados: http://localhost:${PORT}/results`);
});

// Manejo de cierre graceful
process.on('SIGTERM', async () => {
    console.log('Cerrando servidor...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Cerrando servidor...');
    await prisma.$disconnect();
    process.exit(0);
});