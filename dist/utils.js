"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanUpDb = exports.leads = exports.convertExcelDate = exports.groupPaymentsByOldLoanId = exports.chunkArray = void 0;
const standaloneApp_1 = require("./standaloneApp");
const xlsx = require('xlsx');
const chunkArray = (array, size) => {
    const chunkedArr = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
};
exports.chunkArray = chunkArray;
const groupPaymentsByOldLoanId = (payments) => {
    return payments.reduce((acc, payment) => {
        if (!acc[payment.oldId]) {
            acc[payment.oldId] = [];
        }
        acc[payment.oldId].push(payment);
        return acc;
    }, {});
};
exports.groupPaymentsByOldLoanId = groupPaymentsByOldLoanId;
// Función para convertir números de serie de Excel a fechas
const convertExcelDate = (serial) => {
    const date = xlsx.SSF.parse_date_code(serial);
    if (!date || !date.y || !date.m || !date.d) {
        return null;
    }
    return new Date(date.y, date.m - 1, date.d);
};
exports.convertExcelDate = convertExcelDate;
exports.leads = [
    ['LAURA DIAZ RAMIREZ', '1'],
    ['ANDREA JAQUELINE	LEON UC', '2'],
    ['RAFAELA BAEZA CARRILLO', '3'],
    ['MAYRA ZETINA KE', '4'],
    ['MAGALY	YAM AUDELO', '5'],
    ['PAULA VIDAL HERNANDEZ', '6'],
    ['MINERVA CORTES GARCIA', '9'],
    ['RAQUEL CORTES PEREZ', '10'],
    ['YAZMIN	JUAREZ NOLASCO', '11'],
    ['TANIA DEL ROCIO DURAN OJEDA', '12'],
    ['MARIA ELIZABETH GONGORA VALENZUELA', '14'],
    ['VIRGINIA VIVEROS CHI', '15'],
    ['MARIA DEL CARMEN	MENDEZ NARVAEZ', '17'],
    ['MARIA ALICIA SANCHEZ CHABLE', '18'],
    ['SILBAN	SOCORRO CRUZ', '19'],
    ['LILIA MARIA CASTILLO CIAU', '20'],
    ['KIMBERLY DOMINGUEZ LINARES', '21'],
    ['MARIA ESTHER	AGUILAR KU', '22'],
    ['ADILETH HERNANDEZ GARCIA', '23'],
    ['ALEJANDRINA HERNANDEZ GARCIA', '26'],
    ['NOEMI CARRANZA RIVAS', '32'],
    ['IRMA MARIA DZIB ARJONA', '33'],
    ['MARIA MIREYA	CHEL UICAB', '37'],
    ['CECILIA SALDIVAR HERNANDEZ', '38'],
    ['NILDA RAQUEL	POOT EK', '39'],
    ['ARACELY GONGORA FERNANDEZ', '40'],
    ['SANDRA PAOLA TUN POOT', '41'],
    ['YECENIA LLANURI BE CIMA', '43'],
    ['TAHIRIH ANAHI DZUL TUN', '44'],
    ['ROSALIA AMEZCUA HERNANDEZ', '50'],
];
const cleanUpDb = async () => {
    await standaloneApp_1.prisma.route.deleteMany({});
    await standaloneApp_1.prisma.loantype.deleteMany({});
    await standaloneApp_1.prisma.personalData.deleteMany({});
    await standaloneApp_1.prisma.employee.deleteMany({});
    await standaloneApp_1.prisma.borrower.deleteMany({});
    await standaloneApp_1.prisma.loan.deleteMany({});
    await standaloneApp_1.prisma.account.deleteMany({});
    await standaloneApp_1.prisma.transaction.deleteMany({});
    await standaloneApp_1.prisma.loanPayment.deleteMany({});
    await standaloneApp_1.prisma.phone.deleteMany({});
    console.log('Datos eliminados de la base de datos');
};
exports.cleanUpDb = cleanUpDb;
