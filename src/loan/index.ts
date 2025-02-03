import { create } from "domain";
import { getEmployeeIdsMap } from "../leads";
import { prisma } from "../standaloneApp";
import { chunkArray, convertExcelDate, leads } from "../utils";
import { ExcelLoanRelationship, ExcelRow, Loan } from "./types";
const xlsx = require('xlsx');

const excelColumnsRelationship: ExcelLoanRelationship = {
    'A': 'id',
    'B': 'fullName',
    'C': 'givedDate',
    'D': 'status',
    'E': 'givedAmount',
    'F': 'requestedAmount',
    'G': 'noWeeks',
    'H': 'interestRate',
    'R': 'finished',
    'AA': 'finishedDate',
    'S': 'leadId',
    'AE': 'previousLoanId',
    'J': 'weeklyPaymentAmount',
    'I': 'amountToPay',
    'AB': 'avalName',
    'AC': 'avalPhone',
    'AD': 'titularPhone',
};

const extractLoanData = () => {
    const excelFilePath = './ruta2.xlsm';
    const tabName = 'CREDITOS_OTORGADOS';

    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);

    // Obtener la hoja especificada
    const sheetLoans = workbook.Sheets[tabName];

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetLoans, { header: 1 });



    let loansData: Loan[] = data.slice(1).map((row: ExcelRow) => {
        const obj: Partial<Loan> = {};
        for (const [col, key] of Object.entries(excelColumnsRelationship)) {
            const colIndex = xlsx.utils.decode_col(col);
            let value = row[colIndex];
            // Convertir fechas si es necesario
            if (key === 'givedDate' || key === 'finishedDate') {
                value = convertExcelDate(value);
            }
            obj[key] = value;
        }
        return obj as Loan;
    });
    return loansData;
};

const saveDataToDB = async (loans: Loan[], accountId: string) => {
    const renovatedLoans = loans.filter(item => item && item.previousLoanId !== undefined);
    const notRenovatedLoans = loans.filter(item => item && item.previousLoanId === undefined);
    console.log('renovatedLoans', renovatedLoans.length);
    console.log('notRenovatedLoans', notRenovatedLoans.length);
    
    //Create the loanTypes
    const fourteenWeeksId = await prisma.loantype.create({
        data: {
            name: '14 semanas/40%',
            weekDuration: 14,
            rate: '0.4',
        }
    });
    const teennWeeksId = await prisma.loantype.create(
        {
            data: {
                name: '10 semanas/0%',
                weekDuration: 10,
                rate: '0',
            }
        },
    );

    /* const route2Account = await prisma.route.create({
        data: {
            name: 'Ruta 2',
            account: {
                create: {
                    name: 'Ruta 2',
                    type: 'EMPLOYEE_CASH_FUND',
                    amount: "0",
                }
            }
        }
    });
    */

    

    const employeeIdsMap = await getEmployeeIdsMap();
    if (!employeeIdsMap) {
        console.log('NO EMPLOYEE IDS MAP');
        return;
    }
    // Dividir los datos en lotes de 100 elementos
    const batches = chunkArray(notRenovatedLoans, 1000);
    console.log('batches', batches.length);
    for (const batch of batches) {
        const transactionPromises = batch.map(item => {
            return prisma.loan.create({
                data: {
                    borrower: {
                        create: {
                            personalData: {
                                create: {
                                    fullName: String(item.fullName),
                                    phones: {
                                        create: {
                                            number: String(item.titularPhone)
                                        }
                                    }
                                }
                            },
                        },
                    },
                    loantype: {
                        connect: {
                            id: item.noWeeks === 14 ? fourteenWeeksId.id : teennWeeksId.id,
                        }
                    },
                    lead: {
                        connect: {
                            id: employeeIdsMap[item.leadId],
                        }
                    },
                    oldId: item.id.toString(),
                    signDate: item.givedDate,
                    amountGived: item.givedAmount.toString(),
                    requestedAmount: item.requestedAmount.toString(),
                    avalName: item.avalName,
                    avalPhone: String(item.avalPhone),
                    finishedDate: item.finishedDate,

                }
            });
        });
        console.log('batch', batch.length);
        await prisma.$transaction(transactionPromises);
    };

    // Obtener los préstamos insertados y crear el mapa oldId => dbID
    const loansFromDb = await prisma.loan.findMany({});
    const loanIdsMap: {
        [key: string]: {
            id: string,
            borrowerId: string,
        }
    } = {};
    loansFromDb.forEach((item) => {
        loanIdsMap[item?.oldId!] = {
            id: item.id,
            borrowerId: item.borrowerId ?? '',
        };
    });

    // Insertar los préstamos renovados
    const batchesRenovated = chunkArray(renovatedLoans, 1000);
    console.log('batchesRenovated', batchesRenovated.length);
    for (const batch of batchesRenovated) {
        console.log('Renovatedbatch', batch.length);
        const transactionPromises = batch.map(item => {
            const previousLoan = item.previousLoanId && loanIdsMap[item.previousLoanId];
            if (!previousLoan) {
                //console.log('====NO PREVIOUS LOAN ID======');
            }
            return prisma.loan.create({
                data: {
                    oldId: item.id.toString(),
                    signDate: item.givedDate,
                    amountGived: item.givedAmount.toString(),
                    requestedAmount: item.requestedAmount.toString(),
                    loantype: {
                        connect: {
                            id: item.noWeeks === 14 ? fourteenWeeksId.id : teennWeeksId.id,
                        },
                    },
                    lead: {
                        connect: {
                            id: employeeIdsMap[item.leadId],
                        }
                    },
                    avalName: item.avalName,
                    avalPhone: String(item.avalPhone),
                    finishedDate: item.finishedDate,
                    borrower: previousLoan ? {
                        connect: {
                            id: previousLoan.borrowerId,
                        }
                    } : undefined,
                    previousLoan: previousLoan ? {
                        connect: {
                            id: previousLoan.id,
                        }
                    } : undefined,
                },
            })
        });
        await prisma.$transaction(transactionPromises);
    }
    const totalGivedAmount = await prisma.loan.aggregate({
        _sum: {
            amountGived: true,
        }
    });
    console.log('Total gived amount', totalGivedAmount);


    if (totalGivedAmount) {
        await prisma.transaction.create({
            data: {
                amount: totalGivedAmount?._sum.amountGived ? totalGivedAmount._sum.amountGived.toString() : "0",
                date: new Date(),
                sourceAccountId: accountId,
                type: 'LOAN',
            }
        });
    }
};

export const seedLoans = async () => {
    const loanData = extractLoanData();
    const mainAccount = await prisma.account.findFirst({
        where: {
            name: 'Caja Merida',
        }
    });
    if (mainAccount) {
        await saveDataToDB(loanData, mainAccount?.id);
        console.log('Loans seeded');
    } else {
        console.log('No se encontro la cuenta principal');
    }
}