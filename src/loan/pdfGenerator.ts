import { ClientHistoryResponse, LoanWithPaymentDetails, PeriodoPago } from './historialCliente';

/**
 * Interfaz para configuración del PDF
 */
export interface PDFConfig {
    title: string;
    subtitle?: string;
    includeClientInfo: boolean;
    includeSummary: boolean;
    includeExpandedDetails: boolean;
    logoUrl?: string;
    footerText?: string;
}

/**
 * Genera el HTML para el PDF del historial del cliente
 * Incluye períodos sin pagos integrados en la tabla de detalles
 */
export const generateClientHistoryHTML = (
    clientHistory: ClientHistoryResponse,
    config: PDFConfig = {
        title: 'Historial de Cliente',
        includeClientInfo: true,
        includeSummary: true,
        includeExpandedDetails: true
    }
): string => {
    
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

    const generateLoanPaymentDetailsHTML = (loan: LoanWithPaymentDetails): string => {
        if (!config.includeExpandedDetails || loan.paymentDetails.length === 0) {
            return '';
        }

        const rows = loan.paymentDetails.map(period => {
            if (period.tipo === 'SIN_PAGO') {
                return `
                    <tr class="sin-pago">
                        <td>${period.periodo}</td>
                        <td>${formatDate(period.fechaEsperada)}</td>
                        <td class="no-pago">SIN PAGO</td>
                        <td>${formatCurrency(period.montoEsperado)}</td>
                        <td class="monto-faltante">-${formatCurrency(period.montoEsperado)}</td>
                        <td class="dias-vencido">${period.diasVencido > 0 ? `${period.diasVencido} días` : 'Pendiente'}</td>
                    </tr>
                `;
            } else {
                const diferencia = period.diferencia;
                const diferenciaClass = diferencia >= 0 ? 'diferencia-positiva' : 'diferencia-negativa';
                
                return `
                    <tr class="con-pago">
                        <td>${period.periodo}</td>
                        <td>${formatDate(period.fechaEsperada)}</td>
                        <td>${formatDate(period.fechaPago)}</td>
                        <td>${formatCurrency(period.montoEsperado)}</td>
                        <td>${formatCurrency(period.montoPagado)}</td>
                        <td class="${diferenciaClass}">${diferencia >= 0 ? '+' : ''}${formatCurrency(diferencia)}</td>
                    </tr>
                `;
            }
        }).join('');

        return `
            <div class="loan-details">
                <h4>Detalle de Pagos - Préstamo ${loan.oldId}</h4>
                <div class="payment-summary">
                    <span class="stat">Total Períodos: ${loan.paymentDetails.length}</span>
                    <span class="stat">Con Pago: <span class="con-pago-count">${loan.periodsWithPayment}</span></span>
                    <span class="stat">Sin Pago: <span class="sin-pago-count">${loan.periodsWithoutPayment}</span></span>
                </div>
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
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    };

    const clientInfoHTML = config.includeClientInfo ? `
        <div class="client-info">
            <h2>Información del Cliente</h2>
            <div class="client-details">
                <div class="detail-item">
                    <strong>Nombre:</strong> ${clientHistory.client.fullName}
                </div>
                ${clientHistory.client.clientCode ? `
                    <div class="detail-item">
                        <strong>Código de Cliente:</strong> ${clientHistory.client.clientCode}
                    </div>
                ` : ''}
                ${clientHistory.client.phones.length > 0 ? `
                    <div class="detail-item">
                        <strong>Teléfonos:</strong> ${clientHistory.client.phones.join(', ')}
                    </div>
                ` : ''}
                ${clientHistory.client.addresses.length > 0 ? `
                    <div class="detail-item">
                        <strong>Direcciones:</strong> ${clientHistory.client.addresses.join('; ')}
                    </div>
                ` : ''}
            </div>
        </div>
    ` : '';

    const summaryHTML = config.includeSummary ? `
        <div class="summary">
            <h2>Resumen</h2>
            <div class="summary-grid">
                <div class="summary-item">
                    <strong>Total de Préstamos:</strong> ${clientHistory.summary.totalLoans}
                </div>
                <div class="summary-item">
                    <strong>Préstamos Activos:</strong> ${clientHistory.summary.activeLoans}
                </div>
                <div class="summary-item">
                    <strong>Préstamos Finalizados:</strong> ${clientHistory.summary.finishedLoans}
                </div>
                <div class="summary-item">
                    <strong>Total Prestado:</strong> ${formatCurrency(clientHistory.summary.totalAmountBorrowed)}
                </div>
                <div class="summary-item">
                    <strong>Total Pagado:</strong> ${formatCurrency(clientHistory.summary.totalAmountPaid)}
                </div>
                <div class="summary-item">
                    <strong>Total Pendiente:</strong> ${formatCurrency(clientHistory.summary.totalPending)}
                </div>
            </div>
        </div>
    ` : '';

    const loansHTML = clientHistory.loans.map(loan => `
        <div class="loan-section">
            <div class="loan-header">
                <h3>Préstamo ${loan.oldId || loan.id}</h3>
                <span class="loan-status status-${loan.status?.toLowerCase()}">${loan.status}</span>
            </div>
            <div class="loan-info">
                <div class="loan-info-grid">
                    <div class="info-item">
                        <strong>Fecha de Firma:</strong> ${formatDate(loan.signDate)}
                    </div>
                    <div class="info-item">
                        <strong>Monto Otorgado:</strong> ${formatCurrency(Number(loan.amountGived))}
                    </div>
                    <div class="info-item">
                        <strong>Monto Solicitado:</strong> ${formatCurrency(Number(loan.requestedAmount))}
                    </div>
                    <div class="info-item">
                        <strong>Pago Semanal:</strong> ${formatCurrency(loan.weeklyPayment)}
                    </div>
                    <div class="info-item">
                        <strong>Deuda Total:</strong> ${formatCurrency(loan.totalDebt)}
                    </div>
                    <div class="info-item">
                        <strong>Total Pagado:</strong> ${formatCurrency(loan.totalPaid)}
                    </div>
                    <div class="info-item">
                        <strong>Pendiente:</strong> ${formatCurrency(loan.totalPending)}
                    </div>
                    <div class="info-item">
                        <strong>Tipo de Préstamo:</strong> ${loan.loanType.name}
                    </div>
                    ${loan.finishedDate ? `
                        <div class="info-item">
                            <strong>Fecha de Finalización:</strong> ${formatDate(loan.finishedDate)}
                        </div>
                    ` : ''}
                </div>
            </div>
            ${generateLoanPaymentDetailsHTML(loan)}
        </div>
    `).join('');

    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${config.title}</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background-color: #fff;
                }

                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding: 20px;
                    border-bottom: 2px solid #007bff;
                }

                .header h1 {
                    color: #007bff;
                    font-size: 28px;
                    margin-bottom: 5px;
                }

                .header p {
                    color: #666;
                    font-size: 16px;
                }

                .client-info, .summary {
                    margin-bottom: 30px;
                    padding: 20px;
                    background-color: #f8f9fa;
                    border-radius: 8px;
                    border: 1px solid #dee2e6;
                }

                .client-info h2, .summary h2 {
                    color: #007bff;
                    margin-bottom: 15px;
                    font-size: 22px;
                }

                .client-details .detail-item, .summary-grid .summary-item {
                    margin-bottom: 10px;
                    padding: 8px 0;
                }

                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 15px;
                }

                .loan-section {
                    margin-bottom: 40px;
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                    overflow: hidden;
                }

                .loan-header {
                    background-color: #007bff;
                    color: white;
                    padding: 15px 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .loan-header h3 {
                    margin: 0;
                    font-size: 20px;
                }

                .loan-status {
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: bold;
                    text-transform: uppercase;
                }

                .status-active {
                    background-color: #28a745;
                }

                .status-finished {
                    background-color: #6c757d;
                }

                .loan-info {
                    padding: 20px;
                    background-color: #fff;
                }

                .loan-info-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 15px;
                }

                .info-item {
                    padding: 8px 0;
                    border-bottom: 1px solid #eee;
                }

                .loan-details {
                    padding: 20px;
                    background-color: #f8f9fa;
                    border-top: 1px solid #dee2e6;
                }

                .loan-details h4 {
                    color: #007bff;
                    margin-bottom: 15px;
                    font-size: 18px;
                }

                .payment-summary {
                    margin-bottom: 20px;
                    display: flex;
                    gap: 20px;
                    flex-wrap: wrap;
                }

                .payment-summary .stat {
                    background-color: white;
                    padding: 8px 15px;
                    border-radius: 20px;
                    border: 1px solid #dee2e6;
                    font-size: 14px;
                }

                .con-pago-count {
                    color: #28a745;
                    font-weight: bold;
                }

                .sin-pago-count {
                    color: #dc3545;
                    font-weight: bold;
                }

                .payment-details-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 15px;
                    background-color: white;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .payment-details-table th {
                    background-color: #007bff;
                    color: white;
                    padding: 12px 10px;
                    text-align: left;
                    font-weight: 600;
                    font-size: 14px;
                }

                .payment-details-table td {
                    padding: 10px;
                    border-bottom: 1px solid #eee;
                    font-size: 13px;
                }

                .payment-details-table tr:hover {
                    background-color: #f8f9fa;
                }

                /* Estilos específicos para períodos sin pago */
                .sin-pago {
                    background-color: #fff5f5;
                }

                .sin-pago td {
                    border-left: 4px solid #dc3545;
                }

                .no-pago {
                    color: #dc3545;
                    font-weight: bold;
                    text-align: center;
                }

                .monto-faltante {
                    color: #dc3545;
                    font-weight: bold;
                }

                .dias-vencido {
                    color: #dc3545;
                    font-size: 12px;
                    font-weight: bold;
                }

                /* Estilos específicos para períodos con pago */
                .con-pago {
                    background-color: #f0fff4;
                }

                .con-pago td {
                    border-left: 4px solid #28a745;
                }

                .diferencia-positiva {
                    color: #28a745;
                    font-weight: bold;
                }

                .diferencia-negativa {
                    color: #dc3545;
                    font-weight: bold;
                }

                .footer {
                    text-align: center;
                    margin-top: 40px;
                    padding: 20px;
                    border-top: 1px solid #dee2e6;
                    color: #666;
                    font-size: 12px;
                }

                /* Estilos para impresión */
                @media print {
                    body {
                        font-size: 12px;
                    }
                    
                    .loan-section {
                        page-break-inside: avoid;
                        margin-bottom: 30px;
                    }
                    
                    .payment-details-table {
                        font-size: 11px;
                    }
                    
                    .payment-details-table th,
                    .payment-details-table td {
                        padding: 6px 8px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${config.title}</h1>
                ${config.subtitle ? `<p>${config.subtitle}</p>` : ''}
                <p>Generado el ${formatDate(new Date())}</p>
            </div>

            ${clientInfoHTML}
            ${summaryHTML}

            <div class="loans-section">
                <h2 style="color: #007bff; margin-bottom: 20px; font-size: 24px;">Historial de Préstamos</h2>
                ${loansHTML}
            </div>

            ${config.footerText ? `
                <div class="footer">
                    ${config.footerText}
                </div>
            ` : ''}
        </body>
        </html>
    `;
};

/**
 * Configuración predeterminada para diferentes tipos de reportes
 */
export const PDFTemplates = {
    COMPLETE: {
        title: 'Historial Completo del Cliente',
        subtitle: 'Incluye todos los préstamos y detalles de pagos',
        includeClientInfo: true,
        includeSummary: true,
        includeExpandedDetails: true,
        footerText: 'Documento generado automáticamente - Sistema de Gestión de Préstamos'
    },
    SUMMARY: {
        title: 'Resumen del Cliente',
        subtitle: 'Vista general de préstamos y pagos',
        includeClientInfo: true,
        includeSummary: true,
        includeExpandedDetails: false,
        footerText: 'Resumen ejecutivo - Sistema de Gestión de Préstamos'
    },
    PAYMENT_DETAILS: {
        title: 'Detalle de Pagos del Cliente',
        subtitle: 'Análisis detallado de períodos de pago',
        includeClientInfo: false,
        includeSummary: false,
        includeExpandedDetails: true,
        footerText: 'Análisis de pagos - Sistema de Gestión de Préstamos'
    }
};

/**
 * Función auxiliar para generar PDF usando una librería como puppeteer o similar
 * Esta función debe ser implementada según la librería de PDF que se use
 */
export const generatePDFFromHTML = async (
    html: string,
    options: {
        format?: 'A4' | 'Letter';
        orientation?: 'portrait' | 'landscape';
        margin?: {
            top?: string;
            right?: string;
            bottom?: string;
            left?: string;
        };
    } = {}
): Promise<Buffer> => {
    // Aquí se implementaría la generación real del PDF
    // Por ejemplo, usando puppeteer:
    /*
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html);
    const pdf = await page.pdf({
        format: options.format || 'A4',
        landscape: options.orientation === 'landscape',
        margin: options.margin || {
            top: '1cm',
            right: '1cm',
            bottom: '1cm',
            left: '1cm'
        },
        printBackground: true
    });
    await browser.close();
    return pdf;
    */
    
    // Por ahora, retornamos un buffer vacío como placeholder
    console.warn('generatePDFFromHTML: Implementación pendiente - instalar puppeteer o librería similar');
    return Buffer.from(html, 'utf8');
};