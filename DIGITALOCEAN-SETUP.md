# 🚀 Guía de Setup en DigitalOcean Droplet

## 📋 **Paso 1: Crear Droplet**

1. **Crear nuevo Droplet en DigitalOcean:**
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic ($12/mes) - 2GB RAM, 1 vCPU
   - **Region**: El más cercano a ti
   - **Authentication**: SSH Keys (recomendado)

2. **Obtener IP del Droplet** - Anotar la IP pública

## 📦 **Paso 2: Configuración inicial**

```bash
# 1. Conectar al Droplet
ssh root@TU_DROPLET_IP

# 2. Ejecutar script de setup
wget https://raw.githubusercontent.com/tu-usuario/tu-repo/main/setup-droplet.sh
chmod +x setup-droplet.sh
./setup-droplet.sh
```

## 🔧 **Paso 3: Configurar aplicación**

```bash
# 1. Ir al directorio de la app
cd /home/app

# 2. Clonar tu repositorio (reemplaza con tu URL)
git clone https://github.com/tu-usuario/solufacil-seeder.git .

# 3. Crear archivo .env
nano .env
```

**Contenido del archivo `.env`:**
```bash
DATABASE_URL="postgresql://usuario:password@host:5432/database?sslmode=require"
SHADOW_DATABASE_URL="postgresql://usuario:password@host:5432/database?sslmode=require"
NODE_ENV=production
PORT=3000
```

```bash
# 4. Instalar dependencias y compilar
npm install
npm run build

# 5. Crear directorio de logs
mkdir -p logs

# 6. Subir archivo Excel (copiar ruta2.xlsm al directorio)
# Usar scp desde tu máquina local:
# scp ruta2.xlsm root@TU_DROPLET_IP:/home/app/
```

## 🚀 **Paso 4: Iniciar aplicación**

```bash
# 1. Iniciar con PM2 usando configuración optimizada
pm2 start ecosystem.config.js

# 2. Verificar que esté corriendo
pm2 status

# 3. Ver logs en tiempo real
pm2 logs keystone-seeder

# 4. Configurar para que inicie automáticamente
pm2 startup
pm2 save
```

## ⚡ **Paso 5: Ejecutar Seeding**

```bash
# Dar permisos de ejecución al script
chmod +x run-seeding.sh

# Ejecutar el seeding completo
./run-seeding.sh
```

## 📊 **Monitoreo durante ejecución**

```bash
# Ver logs en tiempo real
tail -f logs/combined.log

# Ver progreso del seeding
tail -f seeding-*.log

# Monitorear memoria y CPU
htop

# Ver estado de PM2
pm2 monit
```

## 🔍 **Comandos útiles**

```bash
# Reiniciar aplicación
pm2 restart keystone-seeder

# Parar aplicación
pm2 stop keystone-seeder

# Ver logs de errores
pm2 logs keystone-seeder --err

# Limpiar logs
pm2 flush

# Ver métricas
pm2 show keystone-seeder
```

## 🌐 **Acceso Web**

Una vez configurado, puedes acceder a:

- **Health Check**: `http://TU_DROPLET_IP:3000/`
- **Status**: `http://TU_DROPLET_IP:3000/status`
- **Results**: `http://TU_DROPLET_IP:3000/results`

## 🎯 **Ejecución manual por pasos**

Si prefieres ejecutar paso a paso:

```bash
# Reset estado
curl -X POST http://localhost:3000/seed/reset

# Paso 1: Accounts y Leads (2-3 minutos)
curl -X POST http://localhost:3000/seed/accounts

# Paso 2: Loans (15-20 minutos)
curl -X POST http://localhost:3000/seed/loans

# Paso 3: Expenses (5-8 minutos)  
curl -X POST http://localhost:3000/seed/expenses

# Paso 4: Nomina (3-5 minutos)
curl -X POST http://localhost:3000/seed/nomina

# Paso 5: Reports (2-3 minutos)
curl -X POST http://localhost:3000/seed/reports

# Ver resultados finales
curl http://localhost:3000/results
```

## 🛠️ **Troubleshooting**

### Si el proceso se queda sin memoria:
```bash
# Aumentar swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Si hay errores de permisos:
```bash
sudo chown -R $USER:$USER /home/app
```

### Para debugging avanzado:
```bash
# Conectar a logs de base de datos
pm2 logs keystone-seeder | grep "ERROR"

# Ver uso de memoria en tiempo real
watch -n 1 'free -h && pm2 show keystone-seeder'
```

## ✅ **Verificación final**

Después de completar el seeding, verifica:

1. **Logs sin errores**: `pm2 logs keystone-seeder`
2. **Resultados disponibles**: `curl http://localhost:3000/results`
3. **Base de datos poblada**: Verificar en tu BD que los datos estén ahí

## 💰 **Costos estimados**

- **Droplet 2GB**: $12/mes
- **Base de datos Neon**: Gratis (Free tier)
- **Total**: **~$12/mes**

**¡Listo! Tu seeder estará funcionando de manera robusta en DigitalOcean sin timeouts.** 🎉 