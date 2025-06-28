#!/bin/bash

echo "🚀 Configurando DigitalOcean Droplet para Keystone Seeder..."

# Actualizar sistema
echo "📦 Actualizando sistema..."
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 18 LTS
echo "📦 Instalando Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 globalmente
echo "📦 Instalando PM2..."
sudo npm install -g pm2

# Instalar Git si no está instalado
echo "📦 Instalando Git..."
sudo apt install -y git

# Crear directorio para la aplicación
echo "📁 Creando directorio de aplicación..."
mkdir -p /home/app
cd /home/app

# Clonar el repositorio (reemplazar con tu repo)
echo "📥 Clonando repositorio..."
# git clone https://github.com/tu-usuario/solufacil-seeder.git .

echo "📋 Configurar variables de entorno:"
echo "1. Crear archivo .env con:"
echo "   DATABASE_URL=postgresql://..."
echo "   SHADOW_DATABASE_URL=postgresql://..."
echo "   NODE_ENV=production"
echo ""
echo "2. Ejecutar: npm install"
echo "3. Ejecutar: npm run build"
echo "4. Ejecutar: ./run-seeding.sh"
echo ""
echo "✅ Setup base completado!"
echo "📍 Directorio: /home/app"

# Configurar PM2 para arranque automático
sudo pm2 startup
sudo pm2 save

# Configurar firewall básico
echo "🔥 Configurando firewall..."
sudo ufw allow 22    # SSH
sudo ufw allow 3000  # Aplicación
sudo ufw --force enable

echo "🎉 ¡Droplet configurado exitosamente!"
echo "🔗 Tu aplicación correrá en: http://tu-droplet-ip:3000" 