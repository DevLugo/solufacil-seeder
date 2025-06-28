# 🚀 Setup Automatizado en DigitalOcean

## ⚡ **Instalación en 1 comando**

Tu droplet ya está creado con IP: **24.199.127.84**

### 1. **Ejecutar configuración automatizada**
```bash
# Conectar al droplet
ssh root@24.199.127.84

# Ejecutar configuración automatizada (todo en 1 comando)
curl -sSL https://raw.githubusercontent.com/DevLugo/solufacil-seeder/v1/auto-setup-droplet.sh | bash
```

¡Eso es todo! El script hace automáticamente:
- ✅ Instala Node.js, PM2, dependencias
- ✅ Clona el repositorio 
- ✅ Instala dependencias de npm
- ✅ Compila TypeScript
- ✅ Configura PM2 y firewall
- ✅ Crea archivos de configuración
- ✅ Configura swap para evitar problemas de memoria

### 2. **Configurar base de datos**
```bash
cd /home/app
nano .env
```

Editar con tus datos reales:
```bash
DATABASE_URL="postgresql://tu_usuario:tu_password@tu_host:5432/tu_database?sslmode=require"
SHADOW_DATABASE_URL="postgresql://tu_usuario:tu_password@tu_host:5432/tu_database?sslmode=require"
```

### 3. **Subir archivo Excel**
Desde tu máquina local:
```bash
scp ruta2.xlsm root@24.199.127.84:/home/app/
```

### 4. **Iniciar aplicación**
```bash
cd /home/app
./start-app.sh
```

### 5. **Ejecutar seeding** ⚡
```bash
./run-seeding.sh
```

## 🎯 **Eso es todo!**

Tu seeding se ejecutará paso a paso:
1. 👥 Accounts y Leads (2-3 min)
2. 💰 Loans (15-20 min) 
3. 💸 Expenses (5-8 min)
4. 💼 Nómina (3-5 min)
5. 📊 Reportes (2-3 min)

**Total: ~30-40 minutos SIN interrupciones**

## 🌐 **Acceso Web**
- Health Check: `http://24.199.127.84:3000/`
- Status: `http://24.199.127.84:3000/status` 
- Results: `http://24.199.127.84:3000/results`

## 🔍 **Comandos útiles**
```bash
pm2 status                    # Ver estado
pm2 logs keystone-seeder     # Ver logs en tiempo real
pm2 monit                    # Monitor de recursos
./run-seeding.sh             # Ejecutar seeding completo
```

## 💰 **Costo total: $12/mes**
- Droplet 2GB: $12/mes
- Base de datos Neon: Gratis

**¡Sin timeouts, sin problemas de memoria, sin complicaciones!** 🎉 