#!/bin/bash

# Script de configuración rápida sin actualizaciones del sistema
# Usar cuando el script principal se traba en configuraciones interactivas

# Configuración
REPO_URL="https://github.com/DevLugo/solufacil-seeder.git"
BRANCH="v1"
APP_DIR="/home/app"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

log "🚀 Configuración rápida de Keystone Seeder (sin actualizaciones del sistema)"

# Solo instalar Node.js si no existe
if ! command_exists node; then
    log "📦 Instalando Node.js 18 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    success "Node.js instalado: $(node --version)"
else
    success "Node.js ya está instalado: $(node --version)"
fi

# Instalar PM2 si no existe
if ! command_exists pm2; then
    log "📦 Instalando PM2..."
    npm install -g pm2
    success "PM2 instalado: $(pm2 --version)"
else
    success "PM2 ya está instalado: $(pm2 --version)"
fi

# Crear directorio de aplicación
log "📁 Preparando directorio de aplicación..."
mkdir -p $APP_DIR
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

# Instalar dependencias de Node.js
log "📦 Instalando dependencias de Node.js..."
npm install
success "Dependencias instaladas"

# Compilar TypeScript
log "🔨 Compilando TypeScript..."
npm run build
success "Compilación completada"

# Crear directorios necesarios
mkdir -p logs logs/pm2

# Dar permisos de ejecución a scripts
chmod +x run-seeding.sh 2>/dev/null || true
chmod +x *.sh 2>/dev/null || true

# Configurar firewall básico
log "🔥 Configurando firewall..."
if command_exists ufw; then
    ufw allow 22    # SSH
    ufw allow 3000  # Aplicación
    ufw --force enable
    success "Firewall configurado"
fi

# Crear archivo .env si no existe
if [ ! -f ".env" ]; then
    log "📝 Creando archivo .env de ejemplo..."
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
    warning "📝 ACCIÓN REQUERIDA: Edita el archivo .env con tus datos reales"
fi

# Crear script de inicio
cat > start-app.sh << 'EOF'
#!/bin/bash
cd /home/app

echo "🚀 Iniciando Keystone Seeder..."

if [ ! -f ".env" ]; then
    echo "❌ Error: Archivo .env no encontrado"
    exit 1
fi

if [ ! -f "ruta2.xlsm" ]; then
    echo "❌ Error: Archivo ruta2.xlsm no encontrado"
    exit 1
fi

pm2 start ecosystem.config.js

echo "✅ Aplicación iniciada"
echo "🌐 URL: http://24.199.125.119:3000"
EOF

chmod +x start-app.sh

log ""
success "🎉 ¡Configuración rápida completada!"
log ""
log "📋 PRÓXIMOS PASOS:"
log ""
warning "1. 📝 CONFIGURAR BASE DE DATOS:"
log "   nano $APP_DIR/.env"
log ""
warning "2. 📁 SUBIR ARCHIVO EXCEL:"
log "   scp ruta2.xlsm root@24.199.125.119:$APP_DIR/"
log ""
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
success "✅ Setup rápido completado en IP: 24.199.125.119" 