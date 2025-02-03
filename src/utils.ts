import { prisma } from "./standaloneApp";

const xlsx = require('xlsx');

interface ChunkArray {
    <T>(array: T[], size: number): T[][];
}

export const chunkArray: ChunkArray = (array, size) => {
    const chunkedArr: any[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
};

// Función para convertir números de serie de Excel a fechas
export const convertExcelDate = (serial: number): Date => {
    const date = xlsx.SSF.parse_date_code(serial);
    return new Date(date.y, date.m - 1, date.d);
};

export const leads = [
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

export const cleanUpDb = async () => {
    await prisma.route.deleteMany({});
    await prisma.loantype.deleteMany({});
    await prisma.personalData.deleteMany({});
    await prisma.employee.deleteMany({});
    await prisma.borrower.deleteMany({});
    await prisma.loan.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.transaction.deleteMany({});
    console.log('Datos eliminados de la base de datos');

}