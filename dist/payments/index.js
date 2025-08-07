"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPaymentData = void 0;
const utils_1 = require("../utils");
const xlsx = require('xlsx');
const excelColumnsRelationship = {
    'A': 'oldId',
    'C': 'paymentDate',
    'D': 'amount',
    'E': 'type',
    'F': 'description',
};
const extractPaymentData = (excelFileName) => {
    const excelFilePath = excelFileName;
    const tabName = 'ABONOS';
    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);
    // Obtener la hoja especificada
    const sheetPayments = workbook.Sheets[tabName];
    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetPayments, { header: 1 });
    let loansData = data.slice(1).map((row) => {
        const obj = {};
        for (const [col, key] of Object.entries(excelColumnsRelationship)) {
            const colIndex = xlsx.utils.decode_col(col);
            let value = row[colIndex];
            // Convertir fechas si es necesario
            if (key === 'paymentDate') {
                value = (0, utils_1.convertExcelDate)(value);
            }
            obj[key] = value;
        }
        return obj;
    });
    return loansData;
};
exports.extractPaymentData = extractPaymentData;
