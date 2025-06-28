module.exports = {
  apps: [{
    name: 'keystone-seeder',
    script: './dist/standaloneApp.js',
    instances: 1,
    exec_mode: 'fork',
    
    // Configuración de memoria optimizada para DigitalOcean
    max_memory_restart: '1G',
    node_args: '--expose-gc --max-old-space-size=2048',
    
    // Variables de entorno
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Logging configuración
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Configuración de reinicio
    autorestart: true,
    watch: false,
    max_restarts: 5,
    min_uptime: '10s',
    
    // Configuración de recursos
    kill_timeout: 5000,
    listen_timeout: 8000,
    
    // Scripts de ciclo de vida
    post_update: ['npm install', 'npm run build']
  }]
}; 