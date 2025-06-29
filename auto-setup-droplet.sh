#!/bin/bash

# Configuración
REPO_URL="https://github.com/DevLugo/solufacil-seeder.git"
BRANCH="v1"
APP_DIR="/home/app"
USER_NAME="appuser"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Función para verificar si un comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verificar si es root
if [[ $EUID -eq 0 ]]; then
    warning "Ejecutándose como root. Se creará un usuario no-root para la aplicación."
fi

log "🚀 Configurando Keystone Seeder en DigitalOcean Droplet"
log "📦 Repositorio: $REPO_URL"
log "🌿 Rama: $BRANCH"
log "📁 Directorio: $APP_DIR"
log "🌐 IP del servidor: 24.199.125.119"

# Configurar entorno no-interactivo ANTES de cualquier instalación
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1

# Actualizar sistema
log "📦 Actualizando sistema (modo no-interactivo)..."
apt update && apt upgrade -y \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  -o Dpkg::Options::="--force-confnew"
success "Sistema actualizado"

# Instalar dependencias básicas
log "📦 Instalando dependencias básicas..."
apt install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" curl wget git build-essential software-properties-common htop

# Instalar Node.js 18 LTS
log "📦 Instalando Node.js 18 LTS..."
if ! command_exists node; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" nodejs
    success "Node.js instalado: $(node --version)"
else
    success "Node.js ya está instalado: $(node --version)"
fi

# Verificar versión de npm
npm --version
success "NPM versión: $(npm --version)"

# Instalar PM2 globalmente
log "📦 Instalando PM2..."
if ! command_exists pm2; then
    npm install -g pm2
    success "PM2 instalado: $(pm2 --version)"
else
    success "PM2 ya está instalado: $(pm2 --version)"
fi

# Crear usuario no-root si no existe
if [[ $EUID -eq 0 ]]; then
    if ! id "$USER_NAME" &>/dev/null; then
        log "👤 Creando usuario $USER_NAME..."
        useradd -m -s /bin/bash $USER_NAME
        usermod -aG sudo $USER_NAME
        success "Usuario $USER_NAME creado"
    else
        success "Usuario $USER_NAME ya existe"
    fi
fi

# Crear directorio de aplicación
log "📁 Preparando directorio de aplicación..."
mkdir -p $APP_DIR
if [[ $EUID -eq 0 ]]; then
    chown -R $USER_NAME:$USER_NAME $APP_DIR
fi

# Cambiar al directorio de la aplicación
cd $APP_DIR

# Clonar repositorio
log "📥 Clonando repositorio..."
if [ -d ".git" ]; then
    warning "Repositorio ya existe, actualizando..."
    git fetch origin
    git checkout $BRANCH
    git pull origin $BRANCH
else
    git clone --branch $BRANCH $REPO_URL .
fi
success "Repositorio clonado/actualizado"

# Verificar que el archivo Excel existe o mostrar advertencia
if [ ! -f "ruta2.xlsm" ]; then
    warning "⚠️  Archivo ruta2.xlsm NO encontrado"
    log "📋 ACCIÓN REQUERIDA: Necesitas subir el archivo ruta2.xlsm al directorio $APP_DIR"
    log "💡 Comando desde tu máquina local:"
    log "   scp ruta2.xlsm root@24.199.125.119:$APP_DIR/"
else
    success "✅ Archivo ruta2.xlsm encontrado"
fi

# Instalar dependencias de Node.js
log "📦 Instalando dependencias de Node.js..."
npm install
success "Dependencias instaladas"

# Compilar TypeScript
log "🔨 Compilando TypeScript..."
npm run build
success "Compilación completada"

# Crear directorio de logs
log "📁 Creando directorio de logs..."
mkdir -p logs
mkdir -p logs/pm2

# Configurar permisos si es root
if [[ $EUID -eq 0 ]]; then
    chown -R $USER_NAME:$USER_NAME $APP_DIR
    log "🔐 Permisos configurados para $USER_NAME"
fi

# Dar permisos de ejecución a scripts
chmod +x run-seeding.sh 2>/dev/null || true
chmod +x setup-droplet.sh 2>/dev/null || true
chmod +x auto-setup-droplet.sh 2>/dev/null || true

# Configurar firewall
log "🔥 Configurando firewall..."
if command_exists ufw; then
    ufw allow 22    # SSH
    ufw allow 3000  # Aplicación
    ufw --force enable
    success "Firewall configurado"
fi

# Verificar archivo .env
if [ ! -f ".env" ]; then
    warning "⚠️  Archivo .env NO encontrado"
    log "📋 Creando archivo .env de ejemplo..."
    cat > .env << EOF
# Configuración de base de datos
DATABASE_URL="postgresql://usuario:password@host:5432/database?sslmode=require"
SHADOW_DATABASE_URL="postgresql://usuario:password@host:5432/database?sslmode=require"

# Configuración de aplicación
NODE_ENV=production
PORT=3000

# Configuración adicional
TZ=America/Mexico_City
EOF
    warning "📝 ACCIÓN REQUERIDA: Edita el archivo .env con tus datos reales de base de datos"
    log "💡 Comando: nano $APP_DIR/.env"
else
    success "✅ Archivo .env encontrado"
fi

# Configurar PM2 para arranque automático
log "⚙️ Configurando PM2 para arranque automático..."
if [[ $EUID -eq 0 ]]; then
    # Configurar para el usuario no-root
    sudo -u $USER_NAME pm2 startup systemd -u $USER_NAME --hp /home/$USER_NAME
else
    pm2 startup
fi

# Configurar swap si no existe (para evitar problemas de memoria)
log "💾 Verificando configuración de swap..."
if ! swapon --show | grep -q "/swapfile"; then
    log "💾 Creando archivo swap de 2GB..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    success "Swap de 2GB configurado"
else
    success "Swap ya está configurado"
fi

# Crear script de inicio rápido
log "📝 Creando script de inicio rápido..."
cat > start-app.sh << 'EOF'
#!/bin/bash
cd /home/app

echo "🚀 Iniciando Keystone Seeder..."

# Verificar que existe .env
if [ ! -f ".env" ]; then
    echo "❌ Error: Archivo .env no encontrado"
    echo "📝 Crear archivo .env con las variables de base de datos"
    exit 1
fi

# Verificar que existe ruta2.xlsm
if [ ! -f "ruta2.xlsm" ]; then
    echo "❌ Error: Archivo ruta2.xlsm no encontrado"
    echo "📁 Subir archivo Excel al directorio /home/app/"
    exit 1
fi

# Iniciar aplicación con PM2
pm2 start ecosystem.config.js

echo "✅ Aplicación iniciada"
echo "🌐 URL: http://24.199.125.119:3000"
echo "📊 Estado: pm2 status"
echo "📋 Logs: pm2 logs keystone-seeder"
echo ""
echo "🎯 Para ejecutar seeding:"
echo "   ./run-seeding.sh"
EOF

chmod +x start-app.sh

# Información final
log ""
success "🎉 ¡Configuración completada exitosamente!"
log ""
log "📋 PRÓXIMOS PASOS:"
log ""

if [ ! -f ".env" ] || ! grep -q "postgresql://" .env; then
    warning "1. 📝 CONFIGURAR BASE DE DATOS:"
    log "   nano $APP_DIR/.env"
    log "   (Reemplazar con tu URL real de base de datos)"
    log ""
fi

if [ ! -f "ruta2.xlsm" ]; then
    warning "2. 📁 SUBIR ARCHIVO EXCEL:"
    log "   scp ruta2.xlsm root@24.199.125.119:$APP_DIR/"
    log ""
fi

success "3. 🚀 INICIAR APLICACIÓN:"
log "   cd $APP_DIR"
log "   ./start-app.sh"
log ""

success "4. ⚡ EJECUTAR SEEDING:"
log "   ./run-seeding.sh"
log ""

log "🌐 ACCESO WEB:"
log "   Health Check: http://24.199.125.119:3000/"
log "   Status: http://24.199.125.119:3000/status"
log "   Results: http://24.199.125.119:3000/results"
log ""

log "🔍 COMANDOS ÚTILES:"
log "   pm2 status          # Ver estado de la aplicación"
log "   pm2 logs keystone-seeder  # Ver logs en tiempo real"
log "   pm2 monit           # Monitor de recursos"
log "   ./run-seeding.sh    # Ejecutar seeding completo"
log ""

success "✅ Setup completado en IP: 24.199.125.119"

if [[ $EUID -eq 0 ]]; then
    log ""
    warning "💡 Para mayor seguridad, considera cambiar a usuario no-root:"
    log "   su - $USER_NAME"
    log "   cd $APP_DIR"
fi

log ""
log "🎯 ¡Tu seeder está listo para usar!" 