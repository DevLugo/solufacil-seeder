import { Request, Response } from 'express';
import { getClientHistory, searchClients, getPaymentPeriodStats } from './historialCliente';
import { generateClientHistoryHTML, PDFTemplates, generatePDFFromHTML } from './pdfGenerator';

/**
 * API endpoint para buscar clientes
 */
export const searchClientsAPI = async (req: Request, res: Response) => {
    try {
        const { q: searchTerm, limit = 10 } = req.query;

        if (!searchTerm || typeof searchTerm !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Parámetro de búsqueda requerido'
            });
        }

        const clients = await searchClients(searchTerm, Number(limit));

        res.json({
            success: true,
            data: clients
        });

    } catch (error) {
        console.error('Error en searchClientsAPI:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

/**
 * API endpoint para obtener el historial completo de un cliente
 */
export const getClientHistoryAPI = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.params;
        const { expanded = 'false' } = req.query;

        if (!clientId) {
            return res.status(400).json({
                success: false,
                message: 'ID de cliente requerido'
            });
        }

        const clientHistory = await getClientHistory(clientId);

        if (!clientHistory) {
            return res.status(404).json({
                success: false,
                message: 'Cliente no encontrado'
            });
        }

        // Si se solicita vista expandida, marcar todos los préstamos como expandidos
        if (expanded === 'true') {
            clientHistory.loans.forEach(loan => {
                loan.isExpanded = true;
            });
        }

        res.json({
            success: true,
            data: clientHistory
        });

    } catch (error) {
        console.error('Error en getClientHistoryAPI:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

/**
 * API endpoint para generar PDF del historial del cliente
 */
export const generateClientHistoryPDFAPI = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.params;
        const { 
            template = 'COMPLETE',
            format = 'A4',
            orientation = 'portrait'
        } = req.query;

        if (!clientId) {
            return res.status(400).json({
                success: false,
                message: 'ID de cliente requerido'
            });
        }

        const clientHistory = await getClientHistory(clientId);

        if (!clientHistory) {
            return res.status(404).json({
                success: false,
                message: 'Cliente no encontrado'
            });
        }

        // Seleccionar plantilla
        const templateConfig = PDFTemplates[template as keyof typeof PDFTemplates] || PDFTemplates.COMPLETE;

        // Generar HTML
        const html = generateClientHistoryHTML(clientHistory, templateConfig);

        // Generar PDF
        const pdfBuffer = await generatePDFFromHTML(html, {
            format: format as 'A4' | 'Letter',
            orientation: orientation as 'portrait' | 'landscape'
        });

        // Configurar headers para descarga del PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="historial-${clientHistory.client.fullName.replace(/\s+/g, '_')}-${new Date().toISOString().split('T')[0]}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        res.send(pdfBuffer);

    } catch (error) {
        console.error('Error en generateClientHistoryPDFAPI:', error);
        res.status(500).json({
            success: false,
            message: 'Error generando PDF'
        });
    }
};

/**
 * API endpoint para obtener estadísticas de períodos de pago
 */
export const getPaymentPeriodStatsAPI = async (req: Request, res: Response) => {
    try {
        const { routeId } = req.query;

        const stats = await getPaymentPeriodStats(routeId as string);

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Error en getPaymentPeriodStatsAPI:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo estadísticas'
        });
    }
};

/**
 * API endpoint para expandir/contraer detalles de un préstamo específico
 */
export const toggleLoanExpansionAPI = async (req: Request, res: Response) => {
    try {
        const { clientId, loanId } = req.params;
        const { expanded } = req.body;

        // Esta función podría guardar el estado de expansión en la sesión del usuario
        // o simplemente retornar el historial actualizado
        const clientHistory = await getClientHistory(clientId);

        if (!clientHistory) {
            return res.status(404).json({
                success: false,
                message: 'Cliente no encontrado'
            });
        }

        // Actualizar estado de expansión del préstamo específico
        const loan = clientHistory.loans.find(l => l.id === loanId);
        if (loan) {
            loan.isExpanded = expanded;
        }

        res.json({
            success: true,
            data: clientHistory
        });

    } catch (error) {
        console.error('Error en toggleLoanExpansionAPI:', error);
        res.status(500).json({
            success: false,
            message: 'Error actualizando expansión'
        });
    }
};

/**
 * Función para registrar las rutas de la API
 */
export const registerHistorialRoutes = (app: any) => {
    // Rutas para el historial de clientes
    app.get('/api/clients/search', searchClientsAPI);
    app.get('/api/clients/:clientId/history', getClientHistoryAPI);
    app.get('/api/clients/:clientId/history/pdf', generateClientHistoryPDFAPI);
    app.post('/api/clients/:clientId/loans/:loanId/toggle-expansion', toggleLoanExpansionAPI);
    app.get('/api/stats/payment-periods', getPaymentPeriodStatsAPI);
    
    console.log('✅ Rutas de historial de clientes registradas');
};