import { getLoanIdsMap } from "../leads";
import { ExcelRow } from "../loan/types";
import { prisma } from "../standaloneApp";
import { chunkArray, convertExcelDate } from "../utils";
import { ExcelPaymentRelationship, Payments } from "./types";

const xlsx = require('xlsx');

// Función utilitaria para ajustar fechas a la zona horaria de México (GMT-6)
const adjustDateForMexico = (date: Date | null | undefined): Date | null => {
    if (!date) return null;
    
    const adjustedDate = new Date(date);
    // Si la fecha tiene hora 00:00:00 UTC, ajustarla a 06:00:00 UTC (medianoche en México GMT-6)
    if (adjustedDate.getUTCHours() === 0 && adjustedDate.getUTCMinutes() === 0 && adjustedDate.getUTCSeconds() === 0) {
        return new Date(adjustedDate.getTime() + (6 * 60 * 60 * 1000));
    }
    return adjustedDate;
};

const excelColumnsRelationship: ExcelPaymentRelationship = {
    'A': 'oldId',
    'C': 'paymentDate',
    'D': 'amount',
    'E': 'type',
    'F': 'description',
};

export const extractPaymentData = (excelFileName: string) => {
    const excelFilePath = excelFileName;
    const tabName = 'ABONOS';

    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);

    // Obtener la hoja especificada
    const sheetPayments = workbook.Sheets[tabName];

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetPayments, { header: 1 });

    let loansData: Payments[] = data.slice(1)
        .map((row: ExcelRow) => {
            const obj: Partial<Payments> = {};
            for (const [col, key] of Object.entries(excelColumnsRelationship)) {
                const colIndex = xlsx.utils.decode_col(col);
                let value = row[colIndex];
                // Convertir fechas si es necesario
                if (key === 'paymentDate') {
                    value = adjustDateForMexico(convertExcelDate(value));
                }
                obj[key] = value;
            }
            return obj as Payments;
        })
        .filter((payment: Payments) => payment.amount > 0); // Filtrar pagos con monto 0
    
    
    return loansData;
};
