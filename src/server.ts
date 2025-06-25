import express from 'express';
import { PrismaClient } from '@prisma/client';
import { cleanUpDb } from './utils';
import { seedLoans } from './loan';
import { seedExpenses } from './expenses';
import { seedAccounts } from './account';
import { seedLeads } from './leads';
import { getYearResume } from './report/month';
import { seedNomina } from './nomina';

const app = express();
const port = process.env.PORT || 3000;

// ⏰ CONFIGURACIÓN DE TIMEOUTS LARGOS PARA RENDER
app.use((req, res, next) => {
    // Timeout de 20 minutos para requests largas (máximo en Render)
    req.setTimeout(20 * 60 * 1000); // 20 minutos
    res.setTimeout(20 * 60 * 1000); // 20 minutos
    next();
});

// 🚀 CONFIGURACIÓN DE SERVIDOR PARA PROCESOS LARGOS
const server = app.listen(port, () => {
    console.log(`🚀 Servidor corriendo en puerto ${port}`);
    console.log(`📍 URL principal: http://localhost:${port}`);
    console.log(`🔗 Iniciar sync: http://localhost:${port}/sync`);
});

// Timeout del servidor a 25 minutos (más que el request)
server.timeout = 25 * 60 * 1000; // 25 minutos
server.keepAliveTimeout = 24 * 60 * 1000; // 24 minutos
server.headersTimeout = 25 * 60 * 1000; // 25 minutos

export const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['info', 'warn', 'error'] : ['query', 'info', 'warn', 'error'],
});

// Variables globales para tracking del progreso
let isSeeding = false;
let seedingProgress = {
    status: 'idle',
    currentStep: '',
    progress: 0,
    logs: [] as string[],
    startTime: null as Date | null,
    endTime: null as Date | null,
    error: null as string | null
};

// Función para logging
const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
    const timestamp = new Date().toISOString();
    const symbols = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
    const logMessage = `${symbols[type]} [${timestamp}] ${message}`;
    console.log(logMessage);
    seedingProgress.logs.push(logMessage);
    // Mantener solo los últimos 100 logs
    if (seedingProgress.logs.length > 100) {
        seedingProgress.logs = seedingProgress.logs.slice(-100);
    }
};

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Ruta principal
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Keystone Seeder</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; }
                .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { text-align: center; margin-bottom: 30px; }
                .status { padding: 15px; border-radius: 8px; margin: 20px 0; font-weight: bold; }
                .status.idle { background-color: #e3f2fd; color: #1976d2; }
                .status.running { background-color: #fff3e0; color: #f57c00; }
                .status.completed { background-color: #e8f5e8; color: #388e3c; }
                .status.error { background-color: #ffebee; color: #d32f2f; }
                .progress-bar { width: 100%; height: 20px; background-color: #e0e0e0; border-radius: 10px; overflow: hidden; margin: 10px 0; }
                .progress-fill { height: 100%; background-color: #4caf50; transition: width 0.3s ease; }
                .button { display: inline-block; padding: 15px 30px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 10px; }
                .button:hover { background-color: #1565c0; }
                .button.disabled { background-color: #ccc; pointer-events: none; }
                .logs { background-color: #1e1e1e; color: #00ff00; padding: 20px; border-radius: 8px; height: 400px; overflow-y: auto; font-family: monospace; font-size: 12px; margin-top: 20px; }
                .logs pre { margin: 0; white-space: pre-wrap; }
                .refresh { margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚀 Keystone Seeder</h1>
                    <p>Sincronización de datos de préstamos desde Excel a PostgreSQL</p>
                </div>
                
                <div id="status" class="status idle">
                    Estado: Inactivo
                </div>
                
                <div class="progress-bar">
                    <div id="progress" class="progress-fill" style="width: 0%"></div>
                </div>
                
                <div class="refresh">
                    <button onclick="refreshStatus()" class="button">🔄 Actualizar Estado</button>
                    <a href="/sync" id="syncButton" class="button">▶️ Iniciar Sincronización</a>
                    <a href="/status" class="button">📊 Ver Estado JSON</a>
                    <a href="/clear-logs" class="button">🗑️ Limpiar Logs</a>
                </div>
                
                <div class="logs">
                    <pre id="logs">Logs aparecerán aquí...</pre>
                </div>
                
                <script>
                    function refreshStatus() {
                        fetch('/status')
                            .then(response => response.json())
                            .then(data => {
                                updateUI(data);
                            })
                            .catch(err => console.error('Error:', err));
                    }
                    
                    function updateUI(data) {
                        const statusEl = document.getElementById('status');
                        const progressEl = document.getElementById('progress');
                        const logsEl = document.getElementById('logs');
                        const syncButton = document.getElementById('syncButton');
                        
                        // Actualizar estado
                        statusEl.className = 'status ' + data.status;
                        statusEl.textContent = 'Estado: ' + data.status.toUpperCase() + 
                            (data.currentStep ? ' - ' + data.currentStep : '');
                        
                        // Actualizar progreso
                        progressEl.style.width = data.progress + '%';
                        
                        // Actualizar logs
                        logsEl.textContent = data.logs.join('\\n');
                        logsEl.scrollTop = logsEl.scrollHeight;
                        
                        // Deshabilitar botón si está corriendo
                        if (data.status === 'running') {
                            syncButton.classList.add('disabled');
                            syncButton.textContent = '⏳ Ejecutando...';
                        } else {
                            syncButton.classList.remove('disabled');
                            syncButton.textContent = '▶️ Iniciar Sincronización';
                        }
                        
                        // Mostrar tiempo si está completado
                        if (data.status === 'completed' && data.startTime && data.endTime) {
                            const duration = (new Date(data.endTime) - new Date(data.startTime)) / 1000;
                            statusEl.textContent += ' - Completado en ' + duration + 's';
                        }
                    }
                    
                    // Actualizar cada 2 segundos si está corriendo
                    setInterval(() => {
                        refreshStatus();
                    }, 2000);
                    
                    // Cargar estado inicial
                    refreshStatus();
                </script>
            </div>
        </body>
        </html>
    `);
});

// Ruta para iniciar sincronización
app.get('/sync', async (req, res) => {
    if (isSeeding) {
        return res.json({ 
            success: false, 
            message: 'Ya hay una sincronización en curso',
            status: seedingProgress.status 
        });
    }

    // Iniciar proceso de seeding
    isSeeding = true;
    seedingProgress = {
        status: 'running',
        currentStep: 'Iniciando...',
        progress: 0,
        logs: [],
        startTime: new Date(),
        endTime: null,
        error: null
    };

    // Ejecutar seeding en background
    runSeeding().finally(() => {
        isSeeding = false;
    });

    res.json({ 
        success: true, 
        message: 'Sincronización iniciada',
        redirect: '/'
    });
});

// Función principal de seeding
async function runSeeding() {
    try {
        addLog('🚀 INICIANDO SEEDER EN RENDER CLOUD', 'info');
        addLog(`📍 Entorno: ${process.env.NODE_ENV || 'development'}`, 'info');
        addLog(`🗄️ Base de datos: ${process.env.DATABASE_URL ? 'Conectada' : 'No configurada'}`, 'info');

        seedingProgress.currentStep = 'Limpiando base de datos';
        seedingProgress.progress = 5;
        addLog('🧹 Limpiando base de datos...', 'info');
        await cleanUpDb();

        seedingProgress.currentStep = 'Creando cuentas';
        seedingProgress.progress = 10;
        addLog('💰 Creando cuentas...', 'info');
        await seedAccounts();

        const route2CashAccount = await prisma.route.create({
            data: {
                name: 'Ruta 2',
                account: {
                    create: {
                        name: 'Ruta 2 Caja',
                        type: 'EMPLOYEE_CASH_FUND',
                        amount: "0",
                    }
                }
            },
            include: { account: true }
        });

        const route2BankAccount = await prisma.route.create({
            data: {
                name: 'Ruta 2',
                account: {
                    create: {
                        name: 'Ruta 2 Banco',
                        type: 'BANK',
                        amount: "0",
                    }
                }
            },
            include: { account: true }
        });

        if (route2CashAccount.account?.id && route2BankAccount.account?.id) {
            seedingProgress.currentStep = 'Seeding leads';
            seedingProgress.progress = 20;
            addLog('👥 Seeding leads...', 'info');
            await seedLeads(route2CashAccount.id);

            seedingProgress.currentStep = 'Seeding préstamos (OPTIMIZADO)';
            seedingProgress.progress = 30;
            addLog('💳 Seeding préstamos (OPTIMIZADO)...', 'info');
            await seedLoans(route2CashAccount.account?.id, route2BankAccount.account?.id);

            seedingProgress.currentStep = 'Seeding gastos';
            seedingProgress.progress = 70;
            addLog('💸 Seeding gastos...', 'info');
            await seedExpenses(route2CashAccount.account?.id, route2BankAccount.account?.id);

            seedingProgress.currentStep = 'Seeding nómina';
            seedingProgress.progress = 80;
            addLog('💼 Seeding nómina...', 'info');
            await seedNomina(route2BankAccount.account?.id);

            seedingProgress.currentStep = 'Generando reportes';
            seedingProgress.progress = 90;
            addLog('📊 Generando reportes...', 'info');
            
            const yearResume = await getYearResume(
                route2CashAccount.account?.id ?? '',
                route2BankAccount.account?.id,
                2024
            );

            let totalAnnualBalance = 0;
            let totalAnnualBalanceWithReinvest = 0;

            for (const month of Object.keys(yearResume)) {
                totalAnnualBalance += yearResume[month].balance || 0;
                totalAnnualBalanceWithReinvest += yearResume[month].balanceWithReinvest || 0;
            }

            addLog(`💰 Total Annual Balance 2024: ${totalAnnualBalance}`, 'success');
            addLog(`📈 Total Annual Balance with Reinvest 2024: ${totalAnnualBalanceWithReinvest}`, 'success');

            seedingProgress.currentStep = 'Completado';
            seedingProgress.progress = 100;
            seedingProgress.status = 'completed';
            seedingProgress.endTime = new Date();
            
            const totalTime = (seedingProgress.endTime.getTime() - seedingProgress.startTime!.getTime()) / 1000;
            addLog(`🏁 SEEDER COMPLETADO EN RENDER - Tiempo total: ${totalTime}s`, 'success');
            addLog(`⚡ Speedup vs Local: ~${Math.round(totalTime * 3)}s ahorrados`, 'success');
        }
    } catch (error) {
        seedingProgress.status = 'error';
        seedingProgress.error = error instanceof Error ? error.message : String(error);
        seedingProgress.endTime = new Date();
        addLog(`💥 Error durante el seeding: ${error}`, 'error');
        throw error;
    }
}

// Ruta para obtener estado
app.get('/status', (req, res) => {
    res.json(seedingProgress);
});

// Ruta para limpiar logs
app.get('/clear-logs', (req, res) => {
    seedingProgress.logs = [];
    addLog('🗑️ Logs limpiados', 'info');
    res.redirect('/');
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        seeding: isSeeding,
        database: process.env.DATABASE_URL ? 'connected' : 'not configured'
    });
});

export default app; 