#!/bin/bash

# Configuración
SERVER_URL="http://localhost:3000"
LOGFILE="seeding-$(date +%Y%m%d-%H%M%S).log"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "$1" | tee -a "$LOGFILE"
}

check_server() {
    log "${BLUE}🔍 Verificando que el servidor esté corriendo...${NC}"
    
    if ! curl -s "$SERVER_URL/health" > /dev/null; then
        log "${RED}❌ Servidor no está corriendo. Iniciando...${NC}"
        
        # Iniciar servidor con PM2
        pm2 start dist/standaloneApp.js --name seeder-app --log "$LOGFILE"
        
        # Esperar que el servidor inicie
        for i in {1..30}; do
            if curl -s "$SERVER_URL/health" > /dev/null; then
                log "${GREEN}✅ Servidor iniciado correctamente${NC}"
                break
            fi
            sleep 2
        done
        
        if ! curl -s "$SERVER_URL/health" > /dev/null; then
            log "${RED}❌ No se pudo iniciar el servidor${NC}"
            exit 1
        fi
    else
        log "${GREEN}✅ Servidor ya está corriendo${NC}"
    fi
}

execute_step() {
    local step_name="$1"
    local endpoint="$2"
    local description="$3"
    
    log "\n${YELLOW}🚀 Iniciando: $description${NC}"
    log "📡 Endpoint: $endpoint"
    log "⏰ Hora de inicio: $(date)"
    
    local start_time=$(date +%s)
    
    # Ejecutar el endpoint y capturar tanto stdout como stderr
    local response=$(curl -s -X POST "$SERVER_URL$endpoint" 2>&1)
    local curl_exit_code=$?
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "⏱️  Duración: ${duration}s"
    
    if [ $curl_exit_code -ne 0 ]; then
        log "${RED}❌ Error de conexión en $step_name${NC}"
        log "Error: $response"
        return 1
    fi
    
    # Verificar si la respuesta contiene "success": true
    if echo "$response" | grep -q '"success":true' || echo "$response" | grep -q '"success": true'; then
        log "${GREEN}✅ $description completado exitosamente${NC}"
        log "📄 Respuesta: $response"
        return 0
    else
        log "${RED}❌ Error en $step_name${NC}"
        log "📄 Respuesta de error: $response"
        return 1
    fi
}

main() {
    log "${BLUE}🎯 INICIANDO PROCESO COMPLETO DE SEEDING${NC}"
    log "📅 Fecha: $(date)"
    log "📂 Log file: $LOGFILE"
    log "🌐 URL del servidor: $SERVER_URL"
    
    # Verificar servidor
    check_server
    
    # Resetear estado (opcional)
    log "\n${YELLOW}🔄 Reseteando estado previo...${NC}"
    curl -s -X POST "$SERVER_URL/seed/reset" > /dev/null
    
    # Paso 1: Accounts y Leads
    if ! execute_step "accounts" "/seed/accounts" "Creación de cuentas y leads"; then
        log "${RED}💥 Falló en el paso de accounts. Abortando...${NC}"
        exit 1
    fi
    
    # Paso 2: Loans
    if ! execute_step "loans" "/seed/loans" "Creación de préstamos"; then
        log "${RED}💥 Falló en el paso de loans. Abortando...${NC}"
        exit 1
    fi
    
    # Paso 3: Expenses  
    if ! execute_step "expenses" "/seed/expenses" "Creación de gastos"; then
        log "${RED}💥 Falló en el paso de expenses. Abortando...${NC}"
        exit 1
    fi
    
    # Paso 4: Nomina
    if ! execute_step "nomina" "/seed/nomina" "Creación de nómina"; then
        log "${RED}💥 Falló en el paso de nomina. Abortando...${NC}"
        exit 1
    fi
    
    # Paso 5: Reports
    if ! execute_step "reports" "/seed/reports" "Generación de reportes anuales"; then
        log "${RED}💥 Falló en el paso de reports. Abortando...${NC}"
        exit 1
    fi
    
    # Obtener resultados finales
    log "\n${BLUE}📊 Obteniendo resultados finales...${NC}"
    final_results=$(curl -s "$SERVER_URL/results")
    log "📈 Resultados: $final_results"
    
    log "\n${GREEN}🎉 ¡PROCESO COMPLETO TERMINADO EXITOSAMENTE!${NC}"
    log "📁 Log completo guardado en: $LOGFILE"
    log "🌐 Ver resultados en: $SERVER_URL/results"
    log "⏰ Proceso finalizado: $(date)"
}

# Ejecutar función principal
main "$@" 