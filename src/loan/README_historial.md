# Sistema de Historial de Clientes Mejorado

Este módulo implementa un sistema completo de historial de clientes con períodos sin pagos integrados y UI mejorada para tablas expandibles.

## 🚀 Características Implementadas

### ✅ 1. Períodos Sin Pagos en la Misma Tabla
- Los períodos sin pagos ahora se muestran integrados en la tabla de Detalle de Pagos
- Cada período faltante se marca claramente con estado "SIN PAGO"
- Se calcula automáticamente los días de vencimiento
- Diferenciación visual entre períodos con y sin pagos

### ✅ 2. UI Mejorada para Tablas Expandibles
- Indicadores visuales claros (▼) para mostrar que las filas son expandibles
- Efectos hover y transiciones suaves
- Tooltips informativos que explican la funcionalidad
- Botones de "Expandir Todo" / "Contraer Todo"
- Estados de carga y error para mejor UX

### ✅ 3. Cálculo Corregido de Períodos Sin Pagos
- Algoritmo mejorado que considera la duración real del préstamo
- Tolerancia de ±3 días para matching de pagos con períodos esperados
- Manejo correcto de pagos adicionales fuera de períodos esperados
- Cálculo preciso de días de vencimiento

### ✅ 4. Generación de PDF Mejorada
- PDFs que incluyen períodos sin pagos integrados
- Múltiples plantillas (Completo, Resumen, Solo Detalles)
- Estilos mejorados con diferenciación visual
- Exportación directa desde la interfaz

## 📁 Estructura de Archivos

```
src/loan/
├── historialCliente.ts     # Lógica principal y cálculo de períodos
├── pdfGenerator.ts         # Generación de PDFs con nueva estructura
├── historialAPI.ts         # Endpoints de API REST
├── uiComponents.ts         # Componentes y estilos de UI
└── README_historial.md     # Esta documentación
```

## 🔧 Instalación y Uso

### 1. Instalación de Dependencias

```bash
# Para generación de PDFs (opcional)
npm install puppeteer

# Para servidor Express (si no está instalado)
npm install express @types/express
```

### 2. Registro de Rutas API

En tu archivo principal de servidor (ej: `app.ts`):

```typescript
import { registerHistorialRoutes } from './loan/historialAPI';

// Registrar rutas
registerHistorialRoutes(app);
```

### 3. Uso de la API

#### Buscar Clientes
```http
GET /api/clients/search?q=nombre&limit=10
```

#### Obtener Historial Completo
```http
GET /api/clients/:clientId/history?expanded=true
```

#### Generar PDF
```http
GET /api/clients/:clientId/history/pdf?template=COMPLETE&format=A4
```

#### Estadísticas de Períodos
```http
GET /api/stats/payment-periods?routeId=route123
```

## 💻 Integración con Frontend

### HTML Básico
```html
<!DOCTYPE html>
<html>
<head>
    <title>Historial Cliente</title>
    <!-- Incluir CSS desde uiComponents.ts -->
</head>
<body>
    <table class="expandable-table" data-client-id="client123">
        <!-- Contenido generado por generateExpandableTableHTML -->
    </table>
    
    <!-- Incluir JavaScript desde uiComponents.ts -->
</body>
</html>
```

### React/Vue/Angular
```typescript
// Ejemplo para React
import { useEffect, useState } from 'react';

function ClientHistory({ clientId }) {
    const [history, setHistory] = useState(null);
    
    useEffect(() => {
        fetch(`/api/clients/${clientId}/history`)
            .then(res => res.json())
            .then(data => setHistory(data.data));
    }, [clientId]);
    
    return (
        <div>
            {/* Renderizar usando los datos de history */}
        </div>
    );
}
```

## 📊 Estructura de Datos

### PeriodoPago
```typescript
interface PeriodoSinPago {
    periodo: number;
    fechaEsperada: Date;
    montoEsperado: number;
    tipo: 'SIN_PAGO';
    diasVencido: number;
}

interface PeriodoConPago {
    periodo: number;
    fechaEsperada: Date;
    fechaPago: Date;
    montoEsperado: number;
    montoPagado: number;
    tipo: 'CON_PAGO';
    diferencia: number;
}
```

### ClientHistoryResponse
```typescript
interface ClientHistoryResponse {
    client: {
        id: string;
        fullName: string;
        clientCode: string | null;
        phones: string[];
        addresses: string[];
    };
    loans: LoanWithPaymentDetails[];
    summary: {
        totalLoans: number;
        activeLoans: number;
        finishedLoans: number;
        totalAmountBorrowed: number;
        totalAmountPaid: number;
        totalPending: number;
    };
}
```

## 🎨 Personalización de UI

### CSS Variables
```css
:root {
    --primary-color: #007bff;
    --success-color: #28a745;
    --danger-color: #dc3545;
    --warning-color: #ffc107;
    --light-bg: #f8f9fa;
    --border-color: #dee2e6;
}
```

### Temas Personalizados
El CSS incluye soporte para modo oscuro automático:
```css
@media (prefers-color-scheme: dark) {
    /* Estilos para tema oscuro */
}
```

## 📈 Características Destacadas

### 1. Cálculo Inteligente de Períodos
- **Tolerancia de fechas**: ±3 días para matching
- **Manejo de pagos adelantados/atrasados**
- **Períodos adicionales** para pagos extra
- **Días de vencimiento** calculados automáticamente

### 2. UI Expandible Mejorada
- **Indicadores visuales claros**
- **Animaciones suaves**
- **Estados de carga**
- **Tooltips informativos**
- **Controles de expansión masiva**

### 3. Exportación PDF Avanzada
- **Múltiples plantillas**
- **Estilos consistentes**
- **Optimizado para impresión**
- **Datos completos incluidos**

### 4. API REST Completa
- **Endpoints RESTful**
- **Manejo de errores robusto**
- **Paginación y filtros**
- **Respuestas estructuradas**

## 🔍 Ejemplos de Uso

### Ejemplo 1: Obtener Historial con Períodos Faltantes
```typescript
import { getClientHistory } from './historialCliente';

const clientHistory = await getClientHistory('client123');

// Verificar préstamos con períodos sin pago
const loansWithMissedPayments = clientHistory.loans.filter(
    loan => loan.periodsWithoutPayment > 0
);

console.log(`Cliente tiene ${loansWithMissedPayments.length} préstamos con pagos faltantes`);
```

### Ejemplo 2: Generar PDF Personalizado
```typescript
import { generateClientHistoryHTML, PDFTemplates } from './pdfGenerator';

const customTemplate = {
    ...PDFTemplates.COMPLETE,
    title: 'Reporte Personalizado',
    footerText: 'Mi Empresa - Confidencial'
};

const html = generateClientHistoryHTML(clientHistory, customTemplate);
```

### Ejemplo 3: Estadísticas de Ruta
```typescript
import { getPaymentPeriodStats } from './historialCliente';

const stats = await getPaymentPeriodStats('route123');

console.log(`Ruta tiene ${stats.loansWithMissedPayments} préstamos con pagos faltantes`);
console.log(`Promedio de períodos sin pago: ${stats.averagePeriodsWithoutPayment.toFixed(2)}`);
```

## 🐛 Solución de Problemas

### Problema: Los períodos sin pago no se calculan correctamente
**Solución**: Verificar que:
- El préstamo tenga `loantype.weekDuration` definido
- Las fechas de pago estén en formato correcto
- El `expectedWeeklyPayment` esté calculado

### Problema: La tabla no se expande
**Solución**: Verificar que:
- El JavaScript esté cargado correctamente
- Los `data-loan-id` estén presentes en las filas
- No hay errores de consola JavaScript

### Problema: El PDF no se genera
**Solución**: 
- Instalar puppeteer: `npm install puppeteer`
- Verificar permisos de escritura
- Revisar logs de error en servidor

## 🚀 Próximas Mejoras

- [ ] Notificaciones push para períodos vencidos
- [ ] Exportación a Excel
- [ ] Gráficos de tendencias de pago
- [ ] Filtros avanzados por fecha/estado
- [ ] Integración con sistema de cobranza
- [ ] Reportes automatizados por email

## 📞 Soporte

Para dudas o problemas con la implementación, revisar:
1. Los logs de la consola del navegador
2. Los logs del servidor
3. La documentación de la API
4. Los tipos TypeScript para referencia

---

**Nota**: Este sistema está diseñado para ser modular y extensible. Puedes adaptar los componentes según las necesidades específicas de tu aplicación.