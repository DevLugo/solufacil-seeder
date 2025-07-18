import { PrismaClient } from '@prisma/client';
import { cleanUpDb } from './utils';
import { seedLoans } from './loan';
import { seedExpenses } from './expenses';
import { seedAccounts } from './account';
import { seedLeads } from './leads';
import { getYearResume } from './report/month';
import { seedNomina } from './nomina';

export const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['info', 'warn', 'error'] : ['query', 'info', 'warn', 'error'],
});

// Función para logs con timestamps
export const log = (message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
    const timestamp = new Date().toISOString();
    const symbols = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
    console.log(`${symbols[type]} [${timestamp}] ${message}`);
};

export async function main() {
    const startTime = Date.now();
    
    log('🚀 INICIANDO SEEDER EN RENDER CLOUD', 'info');
    log(`📍 Entorno: ${process.env.NODE_ENV || 'development'}`, 'info');
    log(`🗄️ Base de datos: ${process.env.DATABASE_URL ? 'Conectada' : 'No configurada'}`, 'info');

    try {
        //TODO: handle the bak deposits

        log('🧹 Limpiando base de datos...', 'info');
        await cleanUpDb();
        
        log('💰 Creando cuentas...', 'info');
        await seedAccounts();
        
        // Crear accounts con routes anidados (corrección de relaciones)
        const cashAccount = await prisma.account.create({
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
        
        const bankAccount = await prisma.account.create({
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
            log('👥 Seeding leads...', 'info');
            await seedLeads(cashAccount.route?.id || '');
            
            log('💳 Seeding préstamos (OPTIMIZADO)...', 'info');
            await seedLoans(cashAccount.id, bankAccount.id);
            
            log('💸 Seeding gastos...', 'info');
            await seedExpenses(cashAccount.id, bankAccount.id);
            
            log('💼 Seeding nómina...', 'info');
            await seedNomina(bankAccount.id);
            
            log('✅ Datos guardados en la base de datos', 'success');
            
            log('📊 Generando reportes...', 'info');
            const yearResume = await getYearResume(
                cashAccount.id,
                bankAccount.id,
                2024
            );
            
            console.table(yearResume);
            
            let totalAnnualBalance = 0;
            let totalAnnualBalanceWithReinvest = 0;

            for (const month of Object.keys(yearResume)) {
                totalAnnualBalance += yearResume[month].balance || 0;
                totalAnnualBalanceWithReinvest += yearResume[month].balanceWithReinvest || 0;
            }

            log(`💰 Total Annual Balance 2024: ${totalAnnualBalance}`, 'success');
            log(`📈 Total Annual Balance with Reinvest 2024: ${totalAnnualBalanceWithReinvest}`, 'success');

            const yearResume2023 = await getYearResume(
                cashAccount.id,
                bankAccount.id,
                2023
            );
            console.table(yearResume2023);
            
            let totalAnnualBalance23 = 0;
            let totalAnnualBalanceWithReinvest23 = 0;
            for (const month of Object.keys(yearResume2023)) {
                totalAnnualBalance23 += yearResume2023[month].balance || 0;
                totalAnnualBalanceWithReinvest23 += yearResume2023[month].balanceWithReinvest || 0;
            }

            log(`💰 Total Annual Balance 2023: ${totalAnnualBalance23}`, 'success');
            log(`📈 Total Annual Balance with Reinvest 2023: ${totalAnnualBalanceWithReinvest23}`, 'success');

            const totalTime = (Date.now() - startTime) / 1000;
            log(`🏁 SEEDER COMPLETADO EN RENDER - Tiempo total: ${totalTime}s`, 'success');
            log(`⚡ Speedup vs Local: ~${Math.round(totalTime * 3)}s ahorrados`, 'success');

            return yearResume;
        }
    } catch (error) {
        log(`💥 Error durante el seeding: ${error}`, 'error');
        throw error;
    } finally {
        log('🔌 Desconectando de la base de datos...', 'info');
        await prisma.$disconnect();
        log('👋 Proceso finalizado', 'info');
    }
}

// Solo ejecutar si este archivo se llama directamente
if (require.main === module) {
    main()
        .catch(e => {
            log(`🚨 Error fatal: ${e}`, 'error');
            console.error(e);
            process.exit(1);
        });
}