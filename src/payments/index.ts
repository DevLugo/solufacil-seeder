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

const extractLoanData = () => {
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

    /* console.log('loanIdsMap', loanIdsMap); */
    console.log("finalizado", Object.keys(loanIdsMap).length);
    // Dividir los datos en lotes de 100 elementos
    const batches = chunkArray(payments, 1000);
    //TODO: HANDLE FALCOS
    for (const batch of batches) {
        const transactionPromises = batch.map(item => {
            if(!loanIdsMap[item.oldId]){
                console.log('No se encontro el prestamo', item, item.oldId, loanIdsMap[item.oldId]);  
                return;
            }
            return prisma.loanPayment.create({
                data: {
                    loan: {
                        connect: {
                            id: loanIdsMap[item.oldId].toString(),
                        }
                    },
                    createdAt: item.paymentDate,
                    amount: item.amount,
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
                            type: 'PAYMENT',
                        }
                    }
                }
            });
        });
        const cleanedData = transactionPromises.filter(item => item !== undefined);
        await prisma.$transaction(cleanedData);
    }
};


export const seedPayments = async (routeId: string) => {
    const payments = extractLoanData();
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
