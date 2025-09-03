/**
 * Componentes de UI y estilos para mejorar la experiencia de usuario
 * en las tablas expandibles del historial de clientes
 */

/**
 * CSS para mejorar la UI de tablas expandibles
 */
export const expandableTableCSS = `
<style>
/* Estilos base para tablas expandibles */
.expandable-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    overflow: hidden;
    margin: 20px 0;
}

/* Header de la tabla */
.expandable-table thead {
    background: linear-gradient(135deg, #007bff, #0056b3);
    color: white;
}

.expandable-table th {
    padding: 15px 12px;
    text-align: left;
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
}

/* Filas principales (préstamos) */
.loan-row {
    background-color: #ffffff;
    border-bottom: 2px solid #e9ecef;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
}

.loan-row:hover {
    background-color: #f8f9fa;
    box-shadow: inset 0 0 0 2px #007bff;
}

.loan-row.expanded {
    background-color: #e3f2fd;
    border-bottom-color: #007bff;
}

.loan-row td {
    padding: 15px 12px;
    vertical-align: middle;
    font-size: 14px;
}

/* Indicador de expansión */
.expansion-indicator {
    position: relative;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background-color: #007bff;
    color: white;
    border-radius: 50%;
    font-size: 12px;
    font-weight: bold;
    transition: all 0.3s ease;
    cursor: pointer;
    margin-right: 10px;
}

.expansion-indicator:hover {
    background-color: #0056b3;
    transform: scale(1.1);
}

.expansion-indicator.expanded {
    background-color: #28a745;
    transform: rotate(180deg);
}

.expansion-indicator::after {
    content: '▼';
    transition: transform 0.3s ease;
}

.expansion-indicator.expanded::after {
    transform: rotate(180deg);
}

/* Tooltip para indicar funcionalidad */
.expansion-tooltip {
    position: relative;
    display: inline-block;
}

.expansion-tooltip .tooltip-text {
    visibility: hidden;
    width: 200px;
    background-color: #333;
    color: #fff;
    text-align: center;
    border-radius: 6px;
    padding: 8px;
    position: absolute;
    z-index: 1000;
    bottom: 125%;
    left: 50%;
    margin-left: -100px;
    opacity: 0;
    transition: opacity 0.3s;
    font-size: 12px;
    font-weight: normal;
    text-transform: none;
    letter-spacing: normal;
}

.expansion-tooltip .tooltip-text::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -5px;
    border-width: 5px;
    border-style: solid;
    border-color: #333 transparent transparent transparent;
}

.expansion-tooltip:hover .tooltip-text {
    visibility: visible;
    opacity: 1;
}

/* Filas de detalles expandidas */
.detail-row {
    background-color: #f8f9fa;
    border-bottom: 1px solid #dee2e6;
    display: none;
    animation: slideDown 0.3s ease-out;
}

.detail-row.show {
    display: table-row;
}

.detail-row td {
    padding: 10px 12px 10px 50px;
    font-size: 13px;
    border-left: 4px solid #007bff;
}

/* Animación para mostrar detalles */
@keyframes slideDown {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Tabla de detalles de pagos dentro de la fila expandida */
.payment-details-table {
    width: 100%;
    margin: 15px 0;
    border-collapse: collapse;
    background-color: white;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.payment-details-table th {
    background-color: #6c757d;
    color: white;
    padding: 10px 8px;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
}

.payment-details-table td {
    padding: 8px;
    text-align: center;
    font-size: 12px;
    border-bottom: 1px solid #eee;
}

/* Estilos específicos para períodos sin pago */
.period-sin-pago {
    background-color: #fff5f5;
    border-left: 4px solid #dc3545;
}

.period-sin-pago .status-cell {
    color: #dc3545;
    font-weight: bold;
}

.period-sin-pago .amount-cell {
    color: #dc3545;
}

.overdue-indicator {
    background-color: #dc3545;
    color: white;
    padding: 2px 6px;
    border-radius: 12px;
    font-size: 10px;
    font-weight: bold;
}

/* Estilos específicos para períodos con pago */
.period-con-pago {
    background-color: #f0fff4;
    border-left: 4px solid #28a745;
}

.period-con-pago .status-cell {
    color: #28a745;
    font-weight: bold;
}

.positive-difference {
    color: #28a745;
    font-weight: bold;
}

.negative-difference {
    color: #dc3545;
    font-weight: bold;
}

/* Estadísticas en la fila expandida */
.payment-stats {
    display: flex;
    gap: 15px;
    margin: 10px 0;
    flex-wrap: wrap;
}

.stat-badge {
    background-color: white;
    border: 1px solid #dee2e6;
    border-radius: 20px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 5px;
}

.stat-badge.with-payments {
    border-color: #28a745;
    color: #28a745;
}

.stat-badge.without-payments {
    border-color: #dc3545;
    color: #dc3545;
}

.stat-badge.total-periods {
    border-color: #007bff;
    color: #007bff;
}

/* Estados de carga */
.loading-row {
    text-align: center;
    padding: 20px;
    color: #6c757d;
    font-style: italic;
}

.loading-spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 3px solid #f3f3f3;
    border-top: 3px solid #007bff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 10px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

/* Botones de acción */
.action-buttons {
    display: flex;
    gap: 8px;
    align-items: center;
}

.btn-expand-all, .btn-collapse-all, .btn-export-pdf {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.btn-expand-all:hover, .btn-collapse-all:hover, .btn-export-pdf:hover {
    background-color: #0056b3;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 123, 255, 0.3);
}

.btn-export-pdf {
    background-color: #dc3545;
}

.btn-export-pdf:hover {
    background-color: #c82333;
    box-shadow: 0 4px 8px rgba(220, 53, 69, 0.3);
}

/* Responsivo */
@media (max-width: 768px) {
    .expandable-table {
        font-size: 12px;
    }
    
    .expandable-table th,
    .expandable-table td {
        padding: 10px 8px;
    }
    
    .payment-stats {
        flex-direction: column;
        gap: 8px;
    }
    
    .action-buttons {
        flex-direction: column;
        align-items: stretch;
    }
    
    .expansion-tooltip .tooltip-text {
        width: 150px;
        margin-left: -75px;
    }
}

/* Modo oscuro (opcional) */
@media (prefers-color-scheme: dark) {
    .expandable-table {
        background-color: #2d3748;
        color: #e2e8f0;
    }
    
    .loan-row {
        background-color: #2d3748;
        border-bottom-color: #4a5568;
    }
    
    .loan-row:hover {
        background-color: #4a5568;
    }
    
    .detail-row {
        background-color: #1a202c;
        border-bottom-color: #4a5568;
    }
    
    .payment-details-table {
        background-color: #2d3748;
        color: #e2e8f0;
    }
    
    .stat-badge {
        background-color: #2d3748;
        border-color: #4a5568;
        color: #e2e8f0;
    }
}
</style>
`;

/**
 * JavaScript para manejar la funcionalidad de expansión
 */
export const expandableTableJS = `
<script>
class ExpandableTable {
    constructor(tableSelector) {
        this.table = document.querySelector(tableSelector);
        this.expandedRows = new Set();
        this.init();
    }

    init() {
        if (!this.table) return;
        
        // Agregar event listeners a las filas de préstamos
        this.table.addEventListener('click', (e) => {
            const loanRow = e.target.closest('.loan-row');
            if (loanRow) {
                this.toggleLoanExpansion(loanRow);
            }
        });

        // Agregar botones de control
        this.addControlButtons();
        
        // Agregar tooltips informativos
        this.addTooltips();
    }

    toggleLoanExpansion(loanRow) {
        const loanId = loanRow.dataset.loanId;
        const detailRows = this.table.querySelectorAll(\`[data-parent-loan="\${loanId}"]\`);
        const indicator = loanRow.querySelector('.expansion-indicator');
        
        if (this.expandedRows.has(loanId)) {
            // Contraer
            this.expandedRows.delete(loanId);
            loanRow.classList.remove('expanded');
            indicator.classList.remove('expanded');
            
            detailRows.forEach(row => {
                row.classList.remove('show');
                setTimeout(() => {
                    row.style.display = 'none';
                }, 300);
            });
            
            // Llamar API para actualizar estado
            this.updateExpansionState(loanId, false);
            
        } else {
            // Expandir
            this.expandedRows.add(loanId);
            loanRow.classList.add('expanded');
            indicator.classList.add('expanded');
            
            // Mostrar loading si los detalles no están cargados
            if (detailRows.length === 0) {
                this.loadPaymentDetails(loanId);
            } else {
                detailRows.forEach(row => {
                    row.style.display = 'table-row';
                    setTimeout(() => {
                        row.classList.add('show');
                    }, 10);
                });
            }
            
            // Llamar API para actualizar estado
            this.updateExpansionState(loanId, true);
        }
    }

    async loadPaymentDetails(loanId) {
        const loanRow = this.table.querySelector(\`[data-loan-id="\${loanId}"]\`);
        const clientId = this.table.dataset.clientId;
        
        try {
            // Mostrar loading
            this.showLoadingRow(loanRow, loanId);
            
            // Cargar detalles desde API
            const response = await fetch(\`/api/clients/\${clientId}/loans/\${loanId}/details\`);
            const data = await response.json();
            
            if (data.success) {
                this.renderPaymentDetails(loanRow, loanId, data.data);
            } else {
                this.showErrorRow(loanRow, loanId, 'Error cargando detalles');
            }
            
        } catch (error) {
            console.error('Error loading payment details:', error);
            this.showErrorRow(loanRow, loanId, 'Error de conexión');
        }
    }

    showLoadingRow(loanRow, loanId) {
        const loadingRow = document.createElement('tr');
        loadingRow.className = 'detail-row loading-row show';
        loadingRow.dataset.parentLoan = loanId;
        loadingRow.innerHTML = \`
            <td colspan="100%">
                <div class="loading-spinner"></div>
                Cargando detalles de pagos...
            </td>
        \`;
        
        loanRow.insertAdjacentElement('afterend', loadingRow);
    }

    showErrorRow(loanRow, loanId, message) {
        const existingRows = this.table.querySelectorAll(\`[data-parent-loan="\${loanId}"]\`);
        existingRows.forEach(row => row.remove());
        
        const errorRow = document.createElement('tr');
        errorRow.className = 'detail-row show';
        errorRow.dataset.parentLoan = loanId;
        errorRow.innerHTML = \`
            <td colspan="100%" style="color: #dc3545; text-align: center; padding: 20px;">
                ❌ \${message}
                <button onclick="this.closest('.expandable-table').expandableTableInstance.loadPaymentDetails('\${loanId}')" 
                        style="margin-left: 10px; padding: 4px 8px; font-size: 11px;">
                    Reintentar
                </button>
            </td>
        \`;
        
        loanRow.insertAdjacentElement('afterend', errorRow);
    }

    renderPaymentDetails(loanRow, loanId, paymentData) {
        // Remover filas de loading/error existentes
        const existingRows = this.table.querySelectorAll(\`[data-parent-loan="\${loanId}"]\`);
        existingRows.forEach(row => row.remove());
        
        // Crear fila de detalles
        const detailRow = document.createElement('tr');
        detailRow.className = 'detail-row show';
        detailRow.dataset.parentLoan = loanId;
        
        const detailsHTML = this.generatePaymentDetailsHTML(paymentData);
        detailRow.innerHTML = \`<td colspan="100%">\${detailsHTML}</td>\`;
        
        loanRow.insertAdjacentElement('afterend', detailRow);
    }

    generatePaymentDetailsHTML(paymentData) {
        const { periods, stats } = paymentData;
        
        const statsHTML = \`
            <div class="payment-stats">
                <div class="stat-badge total-periods">
                    📊 Total Períodos: \${stats.totalPeriods}
                </div>
                <div class="stat-badge with-payments">
                    ✅ Con Pago: \${stats.periodsWithPayment}
                </div>
                <div class="stat-badge without-payments">
                    ❌ Sin Pago: \${stats.periodsWithoutPayment}
                </div>
            </div>
        \`;
        
        const tableRows = periods.map(period => {
            if (period.tipo === 'SIN_PAGO') {
                return \`
                    <tr class="period-sin-pago">
                        <td>\${period.periodo}</td>
                        <td>\${this.formatDate(period.fechaEsperada)}</td>
                        <td class="status-cell">SIN PAGO</td>
                        <td>\${this.formatCurrency(period.montoEsperado)}</td>
                        <td class="amount-cell">-\${this.formatCurrency(period.montoEsperado)}</td>
                        <td>
                            \${period.diasVencido > 0 ? 
                                \`<span class="overdue-indicator">\${period.diasVencido} días</span>\` : 
                                'Pendiente'
                            }
                        </td>
                    </tr>
                \`;
            } else {
                const diferencia = period.diferencia;
                const diferenciaClass = diferencia >= 0 ? 'positive-difference' : 'negative-difference';
                
                return \`
                    <tr class="period-con-pago">
                        <td>\${period.periodo}</td>
                        <td>\${this.formatDate(period.fechaEsperada)}</td>
                        <td class="status-cell">\${this.formatDate(period.fechaPago)}</td>
                        <td>\${this.formatCurrency(period.montoEsperado)}</td>
                        <td>\${this.formatCurrency(period.montoPagado)}</td>
                        <td class="\${diferenciaClass}">
                            \${diferencia >= 0 ? '+' : ''}\${this.formatCurrency(diferencia)}
                        </td>
                    </tr>
                \`;
            }
        }).join('');
        
        return \`
            \${statsHTML}
            <table class="payment-details-table">
                <thead>
                    <tr>
                        <th>Período</th>
                        <th>Fecha Esperada</th>
                        <th>Fecha de Pago</th>
                        <th>Monto Esperado</th>
                        <th>Monto Pagado</th>
                        <th>Diferencia/Estado</th>
                    </tr>
                </thead>
                <tbody>
                    \${tableRows}
                </tbody>
            </table>
        \`;
    }

    addControlButtons() {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'table-controls';
        controlsDiv.style.cssText = 'margin-bottom: 15px; display: flex; gap: 10px; align-items: center;';
        
        controlsDiv.innerHTML = \`
            <div class="action-buttons">
                <button class="btn-expand-all">Expandir Todo</button>
                <button class="btn-collapse-all">Contraer Todo</button>
                <button class="btn-export-pdf">Exportar PDF</button>
            </div>
            <div style="margin-left: auto; color: #6c757d; font-size: 12px;">
                💡 Haz clic en cualquier préstamo para ver los detalles de pagos
            </div>
        \`;
        
        this.table.parentElement.insertBefore(controlsDiv, this.table);
        
        // Event listeners para botones
        controlsDiv.querySelector('.btn-expand-all').addEventListener('click', () => {
            this.expandAll();
        });
        
        controlsDiv.querySelector('.btn-collapse-all').addEventListener('click', () => {
            this.collapseAll();
        });
        
        controlsDiv.querySelector('.btn-export-pdf').addEventListener('click', () => {
            this.exportToPDF();
        });
    }

    expandAll() {
        const loanRows = this.table.querySelectorAll('.loan-row');
        loanRows.forEach(row => {
            if (!this.expandedRows.has(row.dataset.loanId)) {
                this.toggleLoanExpansion(row);
            }
        });
    }

    collapseAll() {
        const loanRows = this.table.querySelectorAll('.loan-row');
        loanRows.forEach(row => {
            if (this.expandedRows.has(row.dataset.loanId)) {
                this.toggleLoanExpansion(row);
            }
        });
    }

    async exportToPDF() {
        const clientId = this.table.dataset.clientId;
        try {
            const response = await fetch(\`/api/clients/\${clientId}/history/pdf?template=COMPLETE\`);
            const blob = await response.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`historial-cliente-\${new Date().toISOString().split('T')[0]}.pdf\`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
        } catch (error) {
            console.error('Error exporting PDF:', error);
            alert('Error exportando PDF. Inténtalo de nuevo.');
        }
    }

    addTooltips() {
        const loanRows = this.table.querySelectorAll('.loan-row');
        loanRows.forEach(row => {
            const indicator = row.querySelector('.expansion-indicator');
            if (indicator) {
                indicator.classList.add('expansion-tooltip');
                indicator.innerHTML += \`
                    <span class="tooltip-text">
                        Haz clic para ver los detalles de pagos y períodos sin pago
                    </span>
                \`;
            }
        });
    }

    async updateExpansionState(loanId, expanded) {
        const clientId = this.table.dataset.clientId;
        try {
            await fetch(\`/api/clients/\${clientId}/loans/\${loanId}/toggle-expansion\`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ expanded })
            });
        } catch (error) {
            console.error('Error updating expansion state:', error);
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(amount);
    }

    formatDate(date) {
        return new Intl.DateTimeFormat('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date(date));
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    const table = document.querySelector('.expandable-table');
    if (table) {
        table.expandableTableInstance = new ExpandableTable('.expandable-table');
    }
});
</script>
`;

/**
 * Función para generar el HTML completo de la tabla expandible
 */
export const generateExpandableTableHTML = (clientHistory: any): string => {
    const formatCurrency = (amount: number): string => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(amount);
    };

    const formatDate = (date: Date): string => {
        return new Intl.DateTimeFormat('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(date);
    };

    const loanRows = clientHistory.loans.map((loan: any) => `
        <tr class="loan-row" data-loan-id="${loan.id}">
            <td>
                <div class="expansion-tooltip">
                    <span class="expansion-indicator" title="Clic para expandir detalles">
                        ▼
                    </span>
                    <span class="tooltip-text">
                        Haz clic para ver los detalles de pagos y períodos sin pago
                    </span>
                </div>
                ${loan.oldId || loan.id}
            </td>
            <td>${formatDate(loan.signDate)}</td>
            <td>${formatCurrency(Number(loan.amountGived))}</td>
            <td>${formatCurrency(loan.weeklyPayment)}</td>
            <td>${formatCurrency(loan.totalDebt)}</td>
            <td>${formatCurrency(loan.totalPaid)}</td>
            <td>${formatCurrency(loan.totalPending)}</td>
            <td>
                <span class="stat-badge ${loan.status?.toLowerCase() === 'active' ? 'without-payments' : 'with-payments'}">
                    ${loan.status}
                </span>
            </td>
            <td>
                ${loan.periodsWithoutPayment > 0 ? 
                    `<span class="stat-badge without-payments">${loan.periodsWithoutPayment}</span>` : 
                    '<span class="stat-badge with-payments">0</span>'
                }
            </td>
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Historial de Cliente - ${clientHistory.client.fullName}</title>
            ${expandableTableCSS}
        </head>
        <body>
            <div class="container" style="max-width: 1200px; margin: 0 auto; padding: 20px;">
                <header style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #007bff; margin-bottom: 10px;">
                        Historial de Cliente
                    </h1>
                    <h2 style="color: #6c757d; font-weight: normal; margin-bottom: 20px;">
                        ${clientHistory.client.fullName}
                    </h2>
                </header>

                <div class="table-container">
                    <table class="expandable-table" data-client-id="${clientHistory.client.id}">
                        <thead>
                            <tr>
                                <th>Préstamo</th>
                                <th>Fecha</th>
                                <th>Monto</th>
                                <th>Pago Semanal</th>
                                <th>Deuda Total</th>
                                <th>Total Pagado</th>
                                <th>Pendiente</th>
                                <th>Estado</th>
                                <th>Períodos Sin Pago</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${loanRows}
                        </tbody>
                    </table>
                </div>
            </div>

            ${expandableTableJS}
        </body>
        </html>
    `;
};