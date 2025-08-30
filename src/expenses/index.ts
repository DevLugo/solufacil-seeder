import { getEmployeeIdsMap } from "../leads";
import { ExcelRow } from "../loan/types";
import { prisma } from "../standaloneApp";
import { chunkArray, convertExcelDate } from "../utils";
import { ExcelExpensesRow, Expense } from "./types";
const xlsx = require('xlsx');

const expensesColumnsRelationship: ExcelExpensesRow = {
    'B': 'fullName',
    'C': 'date',
    'D': 'amount',
    'K': 'leadId',
    'E': 'accountType',
    'M': 'description',
};

const extractExpensesData = (excelFileName: string) => {
    const excelFilePath = excelFileName;
    const tabName = 'GASTOS';

    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);

    // Obtener la hoja especificada
    const sheetExpenses = workbook.Sheets[tabName];

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetExpenses, { header: 1 });
    


    let loansData: Expense[] = data.slice(1).map((row: ExcelRow) => {
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
    return loansData;
};

const saveExpensesOnDB = async (data: Expense[], cashAcountId: string, bankAccountId: string, tokaAccountId: string, connectAccountId: string, snapshotData: {
    routeId: string;
    routeName: string;
    locationId: string;
    locationName: string;
    leadId: string;
    leadName: string;
    leadAssignedAt: Date;
}, routeId: string, leadMapping?: { [oldId: string]: string }) => {
    const batches = chunkArray(data, 1000);
    console.log('====TOKA ACCOUNT====saveExpensesOnDB', tokaAccountId);
    console.log('====CONNECT ACCOUNT====saveExpensesOnDB', connectAccountId);
    
    // Usar leadMapping si está disponible, sino usar employeeIdsMap como fallback
    let employeeIdsMap: { [key: string]: string } = {};
    if (leadMapping) {
        employeeIdsMap = leadMapping;
    } else {
        employeeIdsMap = await getEmployeeIdsMap();
    }
    
    for (const batch of batches) {
        const transactionPromises = batch.map(item => {
            let accountId;
            if(
                (item.accountType === "GASTO BANCO" && item.description === "TOKA") 
                || (item.accountType === "TOKA" && item.description === "GASOLINA")){
                console.log('====TOKA====', item.description, tokaAccountId);
                accountId = tokaAccountId;
            }else if(item.accountType === "GASTO BANCO" && item.description === "CONNECT" || item.description === "CONNECT CONEXION"){
                console.log('====GASOLINA====', item.description, connectAccountId);
                accountId = connectAccountId;
            }
            else if (item.accountType === 'GASTO BANCO') {
                accountId = bankAccountId;
            } else if (item.accountType === 'GASTO') {
                accountId = cashAcountId;
            } else {
                accountId = cashAcountId;
            }

            if (!accountId)
                console.log('NO HAY ACCOUNT ID', item);

            if(item.amount === undefined){
                //console.log("NO HAY AMOUNT", item);
                return;
            }
            //console.log('ROUTE ID', routeId);
            return prisma.transaction.create({
                data: {
                    amount: item.amount.toString(),
                    date: item.date,
                    sourceAccount: {
                        connect: {
                            id: accountId,
                        }
                    },
                    description: String(item.description),
                    lead: item.leadId && employeeIdsMap[item.leadId] ? {
                        connect: {
                            id: employeeIdsMap[item.leadId],
                        }
                    } : undefined,
                    type: 'EXPENSE',
                    route: {
                        connect: {
                            id: routeId,
                        }
                    },
                    expenseSource: (() => {
                        if (item.description === "GASOLINA" || item.description === "TOKA") {
                            return "GASOLINE";
                        }
                        if (item.description === "CONNECT") return "TRAVEL_EXPENSES";
                        if (item.accountType === "COMISION") return "LOAN_PAYMENT_COMISSION";
                        if (item.accountType === "GASTO BANCO") return "BANK_EXPENSE";
                        if (item.accountType === "GASTO SOCIO") return "EMPLOYEE_EXPENSE";
                        
                        /* if (item.description === "VIATICOS") return "VIATIC"; */
                        /* if (item.description === "SUELDO") return "EXTERNAL_SALARY"; */
                        return "GENERAL_EXPENSE";
                    })(),

                    // snapshotLeadId no existe en Transaction, se omite
                }
            })});
        const cleanedData = transactionPromises.filter(e => e !== undefined);

        await prisma.$transaction(cleanedData);
    }
};

export const seedExpenses = async (accountId: string, bankAccountId: string, tokaAccountId: string, connectAccountId: string, snapshotData: {
    routeId: string;
    routeName: string;
    locationId: string;
    locationName: string;
    leadId: string;
    leadName: string;
    leadAssignedAt: Date;
}, excelFileName: string, routeId: string, leadMapping?: { [oldId: string]: string }) => {
    console.log("SEEDING EXPENSES--------");
    const loanData = extractExpensesData(excelFileName);
    
    if(accountId){
        console.log('====TOKA ACCOUNT====seedExpenses', tokaAccountId);
        console.log('====CONNECT ACCOUNT====seedExpenses', connectAccountId);
        await saveExpensesOnDB(loanData, accountId, bankAccountId, tokaAccountId, connectAccountId, snapshotData, routeId, leadMapping);
        console.log('Expenses seeded');
        //PRINT TOTAL EXPENSES AND TOTAL SUM OF EXPENSES FROM DB
        const totalExpenses = await prisma.transaction.count({
            where: {
                type: 'EXPENSE',
            }
        });
        console.log('Total expenses', totalExpenses);

        const totalSumOfExpenses = await prisma.transaction.aggregate({
            _sum: {
                amount: true,
            }
        });
        console.log('Total sum of expenses', totalSumOfExpenses);
    }else{
        console.log('No se encontro la cuenta principal');
    }
};
