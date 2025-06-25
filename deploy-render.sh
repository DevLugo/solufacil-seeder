#!/bin/bash

# Script de deployment para Render
echo "🚀 Preparando deployment en Render..."

# Verificar que los archivos necesarios existen
if [ ! -f "ruta2.xlsm" ]; then
  echo "❌ Error: Archivo ruta2.xlsm no encontrado"
  exit 1
fi

if [ ! -f "render.yaml" ]; then
  echo "❌ Error: Archivo render.yaml no encontrado"
  exit 1
fi

# Verificar variables de entorno
if [ -z "$DATABASE_URL" ]; then
  echo "⚠️  Advertencia: DATABASE_URL no configurada"
  echo "   Configúrala en el dashboard de Render"
fi

echo "✅ Verificaciones completadas"
echo ""
echo "📋 Próximos pasos:"
echo "1. Sube el código a GitHub"
echo "2. Conecta tu repo en Render.com"
echo "3. Configura las variables de entorno en Render:"
echo "   - DATABASE_URL (tu connection string de Neon)"
echo "   - SHADOW_DATABASE_URL (mismo que DATABASE_URL)"
echo "4. Deploy manual desde Render dashboard"
echo ""
echo "🎯 El seeder se ejecutará automáticamente al hacer deploy"
echo "⚡ Tiempo estimado desde Render: 2-4 minutos vs 10-20 desde local" 