import { prisma } from "../standaloneApp";
import { Loan, LoanPayment, PersonalData, Loantype } from "@prisma/client";

// Tipos para el historial de cliente
export interface PeriodoSinPago {
    periodo: number;
    fechaEsperada: Date;
    montoEsperado: number;
    tipo: 'SIN_PAGO';
    diasVencido: number;
}

export interface PeriodoConPago {
    periodo: number;
    fechaEsperada: Date;
    fechaPago: Date;
    montoEsperado: number;
    montoPagado: number;
    tipo: 'CON_PAGO';
    diferencia: number;
}

export type PeriodoPago = PeriodoSinPago | PeriodoConPago;

export interface LoanWithPaymentDetails {
    id: string;
    oldId: string | null;
    borrowerName: string;
    signDate: Date;
    amountGived: string;
    requestedAmount: string;
    weeklyPayment: number;
    totalDebt: number;
    status: string | null;
    finishedDate: Date | null;
    loanType: {
        name: string;
        weekDuration: number | null;
        rate: string;
    };
    // Detalles de pagos combinados (con pagos y sin pagos)
    paymentDetails: PeriodoPago[];
    // Estadísticas del préstamo
    totalPaid: number;
    totalPending: number;
    periodsWithoutPayment: number;
    periodsWithPayment: number;
    isExpanded?: boolean; // Para la UI expandible
}

export interface ClientHistoryResponse {
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

/**
 * Calcula todos los períodos de pago esperados para un préstamo
 * incluyendo los períodos sin pagos
 */
export const calculatePaymentPeriods = (
    loan: Loan & { 
        loantype: Loantype | null; 
        payments: LoanPayment[] 
    }
): PeriodoPago[] => {
    const periods: PeriodoPago[] = [];
    
    if (!loan.loantype?.weekDuration) {
        console.warn(`Préstamo ${loan.oldId} no tiene duración de semanas definida`);
        return periods;
    }

    const weekDuration = loan.loantype.weekDuration;
    const weeklyPayment = Number(loan.expectedWeeklyPayment || 0);
    const signDate = new Date(loan.signDate);
    
    // Ordenar pagos por fecha
    const sortedPayments = loan.payments
        .filter(payment => payment.receivedAt && payment.amount)
        .sort((a, b) => new Date(a.receivedAt!).getTime() - new Date(b.receivedAt!).getTime());

    // Generar todos los períodos esperados
    for (let period = 1; period <= weekDuration; period++) {
        const expectedDate = new Date(signDate);
        expectedDate.setDate(signDate.getDate() + (period * 7)); // Cada semana
        
        // Buscar si hay un pago en esta semana (±3 días de tolerancia)
        const paymentInPeriod = sortedPayments.find(payment => {
            if (!payment.receivedAt) return false;
            
            const paymentDate = new Date(payment.receivedAt);
            const diffDays = Math.abs(paymentDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24);
            
            return diffDays <= 3; // Tolerancia de 3 días
        });

        if (paymentInPeriod && paymentInPeriod.receivedAt && paymentInPeriod.amount) {
            // Período con pago
            const montoPagado = Number(paymentInPeriod.amount);
            const diferencia = montoPagado - weeklyPayment;
            
            periods.push({
                periodo: period,
                fechaEsperada: expectedDate,
                fechaPago: new Date(paymentInPeriod.receivedAt),
                montoEsperado: weeklyPayment,
                montoPagado: montoPagado,
                tipo: 'CON_PAGO',
                diferencia: diferencia
            });
            
            // Remover el pago de la lista para evitar duplicados
            const index = sortedPayments.indexOf(paymentInPeriod);
            if (index > -1) {
                sortedPayments.splice(index, 1);
            }
        } else {
            // Período sin pago
            const today = new Date();
            const diasVencido = expectedDate < today 
                ? Math.floor((today.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24))
                : 0;
            
            periods.push({
                periodo: period,
                fechaEsperada: expectedDate,
                montoEsperado: weeklyPayment,
                tipo: 'SIN_PAGO',
                diasVencido: diasVencido
            });
        }
    }

    // Agregar pagos adicionales que no coinciden con ningún período esperado
    sortedPayments.forEach((payment, index) => {
        if (payment.receivedAt && payment.amount) {
            const montoPagado = Number(payment.amount);
            
            periods.push({
                periodo: weekDuration + index + 1,
                fechaEsperada: new Date(payment.receivedAt), // Usar la fecha del pago como esperada
                fechaPago: new Date(payment.receivedAt),
                montoEsperado: 0, // No había monto esperado para este período adicional
                montoPagado: montoPagado,
                tipo: 'CON_PAGO',
                diferencia: montoPagado
            });
        }
    });

    return periods;
};

/**
 * Obtiene el historial completo de un cliente incluyendo todos sus préstamos
 * con períodos de pago detallados (con y sin pagos)
 */
export const getClientHistory = async (clientId: string): Promise<ClientHistoryResponse | null> => {
    try {
        // Buscar el cliente
        const client = await prisma.personalData.findUnique({
            where: { id: clientId },
            include: {
                phones: true,
                addresses: {
                    include: {
                        location: true
                    }
                },
                borrower: {
                    include: {
                        loans: {
                            include: {
                                loantype: true,
                                payments: {
                                    orderBy: {
                                        receivedAt: 'asc'
                                    }
                                }
                            },
                            orderBy: {
                                signDate: 'desc'
                            }
                        }
                    }
                }
            }
        });

        if (!client || !client.borrower) {
            return null;
        }

        const loans: LoanWithPaymentDetails[] = [];
        let totalAmountBorrowed = 0;
        let totalAmountPaid = 0;
        let totalPending = 0;
        let activeLoans = 0;
        let finishedLoans = 0;

        // Procesar cada préstamo
        for (const loan of client.borrower.loans) {
            const paymentDetails = calculatePaymentPeriods(loan);
            
            const totalPaid = paymentDetails
                .filter(p => p.tipo === 'CON_PAGO')
                .reduce((sum, p) => sum + (p as PeriodoConPago).montoPagado, 0);
            
            const totalDebt = Number(loan.totalDebtAcquired || 0);
            const pending = Math.max(totalDebt - totalPaid, 0);
            
            const periodsWithoutPayment = paymentDetails.filter(p => p.tipo === 'SIN_PAGO').length;
            const periodsWithPayment = paymentDetails.filter(p => p.tipo === 'CON_PAGO').length;

            loans.push({
                id: loan.id,
                oldId: loan.oldId,
                borrowerName: client.fullName,
                signDate: loan.signDate,
                amountGived: loan.amountGived.toString(),
                requestedAmount: loan.requestedAmount.toString(),
                weeklyPayment: Number(loan.expectedWeeklyPayment || 0),
                totalDebt: totalDebt,
                status: loan.status,
                finishedDate: loan.finishedDate,
                loanType: {
                    name: loan.loantype?.name || 'No especificado',
                    weekDuration: loan.loantype?.weekDuration || 0,
                    rate: loan.loantype?.rate?.toString() || '0'
                },
                paymentDetails: paymentDetails,
                totalPaid: totalPaid,
                totalPending: pending,
                periodsWithoutPayment: periodsWithoutPayment,
                periodsWithPayment: periodsWithPayment,
                isExpanded: false // Por defecto contraído para la UI
            });

            // Acumular estadísticas
            totalAmountBorrowed += Number(loan.amountGived);
            totalAmountPaid += totalPaid;
            totalPending += pending;
            
            if (loan.status === 'ACTIVE') {
                activeLoans++;
            } else if (loan.status === 'FINISHED') {
                finishedLoans++;
            }
        }

        return {
            client: {
                id: client.id,
                fullName: client.fullName,
                clientCode: client.clientCode,
                phones: client.phones.map(p => p.number),
                addresses: client.addresses.map(a => 
                    `${a.street} ${a.exteriorNumber}, ${a.location?.name || ''}`
                )
            },
            loans: loans,
            summary: {
                totalLoans: loans.length,
                activeLoans: activeLoans,
                finishedLoans: finishedLoans,
                totalAmountBorrowed: totalAmountBorrowed,
                totalAmountPaid: totalAmountPaid,
                totalPending: totalPending
            }
        };

    } catch (error) {
        console.error('Error obteniendo historial del cliente:', error);
        throw error;
    }
};

/**
 * Busca clientes por nombre o código de cliente
 */
export const searchClients = async (searchTerm: string, limit: number = 10) => {
    try {
        const clients = await prisma.personalData.findMany({
            where: {
                OR: [
                    {
                        fullName: {
                            contains: searchTerm,
                            mode: 'insensitive'
                        }
                    },
                    {
                        clientCode: {
                            contains: searchTerm,
                            mode: 'insensitive'
                        }
                    }
                ]
            },
            include: {
                borrower: {
                    include: {
                        loans: {
                            select: {
                                id: true,
                                status: true,
                                signDate: true
                            }
                        }
                    }
                }
            },
            take: limit,
            orderBy: {
                fullName: 'asc'
            }
        });

        return clients.map(client => ({
            id: client.id,
            fullName: client.fullName,
            clientCode: client.clientCode,
            totalLoans: client.borrower?.loans.length || 0,
            activeLoans: client.borrower?.loans.filter(l => l.status === 'ACTIVE').length || 0,
            lastLoanDate: client.borrower?.loans[0]?.signDate || null
        }));

    } catch (error) {
        console.error('Error buscando clientes:', error);
        throw error;
    }
};

/**
 * Obtiene estadísticas generales de períodos sin pagos
 */
export const getPaymentPeriodStats = async (routeId?: string) => {
    try {
        const whereClause = routeId ? { snapshotRouteId: routeId } : {};
        
        const loans = await prisma.loan.findMany({
            where: {
                ...whereClause,
                status: 'ACTIVE' // Solo préstamos activos
            },
            include: {
                loantype: true,
                payments: true,
                borrower: {
                    include: {
                        personalData: true
                    }
                }
            }
        });

        let totalPeriodsWithoutPayment = 0;
        let totalPeriodsWithPayment = 0;
        let loansWithMissedPayments = 0;

        const loanStats = loans.map(loan => {
            const periods = calculatePaymentPeriods(loan);
            const periodsWithoutPayment = periods.filter(p => p.tipo === 'SIN_PAGO').length;
            const periodsWithPayment = periods.filter(p => p.tipo === 'CON_PAGO').length;
            
            totalPeriodsWithoutPayment += periodsWithoutPayment;
            totalPeriodsWithPayment += periodsWithPayment;
            
            if (periodsWithoutPayment > 0) {
                loansWithMissedPayments++;
            }

            return {
                loanId: loan.id,
                oldId: loan.oldId,
                borrowerName: loan.borrower?.personalData?.fullName || 'Sin nombre',
                periodsWithoutPayment: periodsWithoutPayment,
                periodsWithPayment: periodsWithPayment,
                totalPeriods: periods.length
            };
        });

        return {
            totalLoans: loans.length,
            loansWithMissedPayments: loansWithMissedPayments,
            totalPeriodsWithoutPayment: totalPeriodsWithoutPayment,
            totalPeriodsWithPayment: totalPeriodsWithPayment,
            averagePeriodsWithoutPayment: totalPeriodsWithoutPayment / loans.length,
            loanStats: loanStats.filter(stat => stat.periodsWithoutPayment > 0) // Solo préstamos con períodos faltantes
        };

    } catch (error) {
        console.error('Error obteniendo estadísticas de períodos de pago:', error);
        throw error;
    }
};