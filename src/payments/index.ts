import { create } from "domain";
import { ExcelExpensesRow } from "../expenses/types";
import { getLoanIdsMap } from "../leads";
import { ExcelRow } from "../loan/types";
import { prisma } from "../standaloneApp";
import { chunkArray, convertExcelDate } from "../utils";
import { ExcelPaymentRelationship, Payments } from "./types";

const xlsx = require('xlsx');

const excelColumnsRelationship: ExcelPaymentRelationship = {
    'A': 'oldId',
    'C': 'paymentDate',
    'D': 'amount',
    'E': 'type',
};

export const extractPaymentData = () => {
    const excelFilePath = './ruta2.xlsm';
    const tabName = 'ABONOS';

    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);

    // Obtener la hoja especificada
    const sheetPayments = workbook.Sheets[tabName];

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetPayments, { header: 1 });

    let loansData: Payments[] = data.slice(1).map((row: ExcelRow) => {
        const obj: Partial<Payments> = {};
        for (const [col, key] of Object.entries(excelColumnsRelationship)) {
            const colIndex = xlsx.utils.decode_col(col);
            let value = row[colIndex];
            // Convertir fechas si es necesario
            if (key === 'paymentDate') {
                value = convertExcelDate(value);
            }
            obj[key] = value;
        }
        return obj as Payments;
    });
    return loansData;
};

const saveDataToDB = async (payments: Payments[], routeId: string) => {
    const loanIdsMap = await getLoanIdsMap(routeId);
    const destinationAccount = await prisma.account.findFirst({
        where: {
            routeId: {
                equals: routeId,
            }
        }
    });

    // Dividir los datos en lotes de 100 elementos
    const batches = chunkArray(payments, 5000);
    //TODO: HANDLE FALCOS
    for (const batch of batches) {
        const transactionPromises = batch.map(item => {
            if(!loanIdsMap[item.oldId]){
                //console.log('No se encontro el prestamo', item, item.oldId, loanIdsMap[item.oldId]);  
                return;
            }
            const profitAmount = (item.amount * (loanIdsMap[item.oldId]?.totalProfit ?? 0)) / (loanIdsMap[item.oldId]?.totalAmountToPay ?? 1);
            return prisma.loanPayment.create({
                data: {
                    oldLoanId: item.oldId ? String(item.oldId): undefined,
                    loan: {
                        connect: {
                            id: loanIdsMap[item.oldId].id,
                        }
                    },
                    receivedAt: item.paymentDate,
                    amount: item.amount,
                    //(parseFloat(item.amount) * totalProfit) / totalAmountToPay;
                    profitAmount: profitAmount,
                    returnToCapital: item.amount - profitAmount,
                    type: item.type,
                    transaction: {
                        create: {
                            amount: item.amount,
                            date: item.paymentDate,
                            destinationAccount:{
                                connect: {
                                    id: destinationAccount?.id,
                                }
                            },
                            type: 'INCOME',
                            incomeSource: 'LOAN_PAYMENT',
                        }
                    }
                }
            });
        });
        const cleanedData = transactionPromises.filter(item => item !== undefined);
        await prisma.$transaction(cleanedData);
    }

    console.log('Payments saved');
    const loansFromDb = await prisma.loan.findMany({
        include: {
            payments: true,
            loantype: true,
            previousLoan: {
                include: {
                    payments: true,
                }
            }
        }
    });

    
    console.log("STARTING LOAN PROFIT UPDATE...");
    const profitUpdateQueries = [];
    for (const l of loansFromDb) {
        if(!loanIdsMap[l.oldId ?? '']){
            //console.log('No se encontro el prestamo', item, item.oldId, loanIdsMap[item.oldId]);  
            return;
        }
        if(!l.oldId){
            return;
        }
        
        const previousLoan = l.previousLoan;
        const previosLoanPayedProfit = previousLoan?.payments.reduce((acc, item) => {
            return acc + (item.profitAmount ? item.profitAmount.toNumber() : 0);
        }, 0);
        const previousLoanProfitPendingToPay = (Number(previousLoan?.profitAmount) ?? 0) - (Number(previosLoanPayedProfit) ?? 0);
        
        
        const profitOfRenovatedLoan = (l.profitAmount?.toNumber() ?? 0) + previousLoanProfitPendingToPay;
        if(l.oldId === '5805' || l.oldId === '6197'){
            console.log("&&&&&&&&&&&&&&& current loan", l)
            console.log("&&&&&&&&&&&&&&& previous loan", previousLoan)
            console.log("&&&&&&&&&&&&&&& previousLoanId", l.previousLoanId)
            console.log("&&&&&&&&&&&&&&& previosLoanPayedProfit", previosLoanPayedProfit)
            console.log("&&&&&&&&&&&&&&& previousLoanProfitPendingToPay", previousLoanProfitPendingToPay)
        }
        if(profitOfRenovatedLoan){
            profitUpdateQueries.push(
                prisma.loan.update({
                    where: {
                        oldId: l.oldId,
                    },
                    data: {
                        profitAmount: profitOfRenovatedLoan,
                    }
                })
            );
        }
    }
    await prisma.$transaction(profitUpdateQueries);
    console.log("FINISHED LOAN PROFIT UPDATE");

    //TODO: save  earned amount on payments
    const paymentProfitUpdateQueries = [];
    console.log("STARTING PAYMENT PROFIT UPDATE...");
    for(const l of loansFromDb){
        const payments = l.payments;
        
        for(const p of payments){
            //const profitAmount = (item.amount * (loanIdsMap[item.oldId]?.totalProfit ?? 0)) / (loanIdsMap[item.oldId]?.totalAmountToPay ?? 1);
            const newProfit = Number(p.amount ?? 0) * (l.profitAmount?.toNumber() ?? 0) / ((l.requestedAmount?.toNumber() ?? 1) * (1 + (l.loantype?.rate?.toNumber() ?? 0)));
            if(newProfit){
                paymentProfitUpdateQueries.push(
                    prisma.loanPayment.update({
                        where: {
                            id: p.id,
                        },
                        data: {
                            profitAmount: newProfit,
                        }
                    })
                );
            }
        };
    }
    await prisma.$transaction(paymentProfitUpdateQueries);
    console.log("FINISHED PAYMENT PROFIT UPDATE");
};

export const seedPayments = async (routeId: string) => {
    const payments = extractPaymentData();
        const mainAccount = await prisma.account.findFirst({
            where: {
                name: 'Caja Merida',
            }
        });
        if (mainAccount) {
            await saveDataToDB(payments, routeId);
            console.log('Payments seeded');
        } else {
            console.log('No se encontro la cuenta principal');
        }
};
