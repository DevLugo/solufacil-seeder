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
