import { PrismaClient } from '@prisma/client';
const xlsx = require('xlsx');

const prisma = new PrismaClient();

// Extraer los datos y crear el objeto
interface Loan {
    id: number;
    fullName: string;
    givedDate: Date;
    status: string;
    givedAmount: number;
    requestedAmount: number;
    noWeeks: number;
    interestRate: number;
    finished: boolean;
    finishedDate: Date;
    leadId: string;
    previousLoanId?: string;
    weeklyPaymentAmount: number;
    amountToPay: number;
    avalName: string;
    avalPhone: string;
    titularPhone: string;
}
interface Expense {
    fullName: string;
    date: Date;
    amount: number;
    leadId: string;
    description: string;
    accountType: string;
}

interface ExcelColumnsRelationship {
    [key: string]: keyof Loan;
}

interface ExcelExpensesRow {
    [key: string]: keyof Expense;
}

interface ExcelRow {
    [key: string]: any;
}

const excelColumnsRelationship: ExcelColumnsRelationship = {
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

const expensesColumnsRelationship: ExcelExpensesRow = {
    'B': 'fullName',
    'C': 'date',
    'D': 'amount',
    'K': 'leadId',
    'E': 'accountType',
};

interface ChunkArray {
    <T>(array: T[], size: number): T[][];
}

const chunkArray: ChunkArray = (array, size) => {
    const chunkedArr: any[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
};

async function main() {
    const excelFilePath = './ruta2.xlsm';
    const tab = 'CREDITOS_OTORGADOS';
    const tab2 = 'GASTOS';

    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);


    // Obtener la hoja especificada
    const sheetLoans = workbook.Sheets[tab];
    const sheetExpenses = workbook.Sheets[tab2];

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetLoans, { header: 1 });
    const dataExpenses = xlsx.utils.sheet_to_json(sheetExpenses, { header: 1 });

    // Función para convertir números de serie de Excel a fechas
    const convertExcelDate = (serial: number): Date => {
        const date = xlsx.SSF.parse_date_code(serial);
        return new Date(date.y, date.m - 1, date.d);
    };

    

    let loans: Loan[] = data.slice(1).map((row: ExcelRow) => {
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


    let expenses: Expense[] = dataExpenses.slice(1).map((row: ExcelRow) => {
        const obj: Partial<Expense> = {};
        for (const [col, key] of Object.entries(expensesColumnsRelationship)) {
            const colIndex = xlsx.utils.decode_col(col);
            let value = row[colIndex];
            // Convertir fechas si es necesario
            if (key === 'date') {
                value = convertExcelDate(value);
            }
            obj[key] = value;
        }
        return obj as Expense;
    });
    expenses = expenses.filter(item => item.amount !== undefined && item.amount !== null);
    console.log('expenses', expenses); 
    


    

    await prisma.route.deleteMany({});
    await prisma.loantype.deleteMany({});
    await prisma.personalData.deleteMany({});
    await prisma.employee.deleteMany({});
    await prisma.borrower.deleteMany({});
    await prisma.loan.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.transaction.deleteMany({});
    console.log('Datos eliminados de la base de datos');

    // Función para guardar los datos en la base de datos usando el contexto de Keystone en una transacción
    const saveDataToDB = async (data: Loan[]) => {
        const renovatedLoans = loans.filter(item => item && item.previousLoanId !== undefined);
        const notRenovatedLoans = loans.filter(item => item && item.previousLoanId === undefined);
        console.log('renovatedLoans', renovatedLoans.length);
        console.log('notRenovatedLoans', notRenovatedLoans);
        // Dividir los datos en lotes de 100 elementos
        const batches = chunkArray(notRenovatedLoans, 1000);
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

        const route2Account = await prisma.route.create({
            data: {
                name: 'Ruta 2',
                account: {
                    create: {
                        name: 'Ruta 2',
                        type: 'EMPLOYEE_CASH_FUND',
                        /* route: {
                          connect: {
                            id: route2.id,
                          }
                        }, */
                        amount: "0",
                    }
                }
            }
        });

        /* const accountId = await prisma.Account.createOne({
          data: 
            {
              name: 'Ruta 2',
              type: 'EMPLOYEE_CASH_FUND',
              route: {
                connect: {
                  id: route2.id,
                }
              },
              amount: "0",
            },
        }); */

        const employeeNames = [
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


        for (const e of employeeNames) {
            await prisma.employee.create({
                data: {
                    routes: {
                        connect: {
                            id: route2Account.id,
                        }
                    },
                    oldId: e[1].toString(),
                    personalData: {
                        create: {
                            fullName: e[0]
                        }
                    },
                    type: 'LEAD',
                }
            }
            );
        };

        const employeesFromDb = await prisma.employee.findMany({});
        const employeeIdsMap: { [key: string]: string } = {};
        employeesFromDb.forEach((e, idx) => {
            employeeIdsMap[employeeNames[idx][1]] = e.id;
        });

        for (const batch of batches) {
            const transactionPromises = batch.map(item => prisma.loan.create({
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
                    borrower: {
                        create: {
                            personalData: {
                                create: {
                                    fullName: item.fullName,
                                    phones: {
                                        create: {
                                            number: String(item.titularPhone),
                                        }
                                    }
                                }
                            },
                        },
                    },

                },
            }));
            await prisma.$transaction(transactionPromises);
        };

        // Obtener los préstamos insertados y crear el mapa oldId => dbID
        const loansFromDb = await prisma.loan.findMany({});
        const loanIdsMap: { [key: string]: {
            id: string,
            borrowerId: string,
        } } = {};
        loansFromDb.forEach((item) => {
            loanIdsMap[item?.oldId!] = {
                id: item.id,
                borrowerId: item.borrowerId ?? '',
            };
        });

        // Insertar los préstamos renovados
        const batchesRenovated = chunkArray(renovatedLoans, 1000);
        for (const batch of batchesRenovated) {
            
            const transactionPromises = batch.map(item => 
                {
                    const previousLoan = item.previousLoanId && loanIdsMap[item.previousLoanId];
                    if (!previousLoan) {
                        console.log('====NO PREVIOUS LOAN ID======', item, loanIdsMap);
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
            })});
            await prisma.$transaction(transactionPromises);
        }
        const totalGivedAmount = await prisma.loan.aggregate({
            _sum: {
                amountGived: true,
            }
        });
        console.log('Total gived amount', totalGivedAmount);
        const mainAccount = await prisma.account.create({
            data: {
                name: 'Caja Merida',
                type: 'OFFICE_CASH_FUND',
                amount: "0",
            }
        });
        if(totalGivedAmount){
            await prisma.transaction.create({
                data: {
                    amount: totalGivedAmount?._sum.amountGived ? totalGivedAmount._sum.amountGived.toString() : "0",
                    date: new Date(),
                    sourceAccountId: mainAccount?.id,/* {
                        connect: {
                            id: accountRoute2?.id,
                        }
                    }, */
                    type: 'LOAN',
                }
            });
        }
    };

    const saveExpensesOnDB = async (data: Expense[]) => {
        const batches = chunkArray(data, 1000);
        const route2Account = await prisma.route.findFirst({
            where: {
                name: 'Ruta 2',
            },
            include: {
                account: true,
            }
        });
        const route2AccountId = route2Account?.account?.id;
        const mainAccount = await prisma.account.findFirst({
            where: {
                name: 'Caja Merida',
            }
        });
        const bankAccount = await prisma.account.create({
            data: {
                name: 'Bank',
                type: 'BANK',
                amount: "0",
            },
        });
        for (const batch of batches) {
            const transactionPromises = batch.map(item => {
                console.log('item', item);
                let accountId;
                if (item.accountType === 'GASTO BANCO' || item.accountType === 'CONNECT') {
                    accountId = bankAccount.id;
                } else if (item.accountType === 'GASTO') {
                    accountId = mainAccount?.id;
                } else {
                    accountId = route2AccountId;
                }
                if (!accountId)
                    console.log('NO HAY ACCOUNT ID', item);

                return prisma.transaction.create({
                    data: {
                        amount: item.amount.toString(),
                        date: item.date,
                        sourceAccount: {
                            connect: {
                                id: accountId,
                            }
                        },
                        type: 'EXPENSE',
                    }
                })});
            await prisma.$transaction(transactionPromises);
        }
    };
    await saveDataToDB(loans);
    await saveExpensesOnDB(expenses);
    console.log('Datos guardados en la base de datos');
}

main()
    .catch(e => {
        console.error(e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });