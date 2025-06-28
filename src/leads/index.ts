import { prisma } from "../standaloneApp";
import { leads } from "../utils";

export const seedLeads = async (routeId: string) => {
    console.log(`👥 Iniciando creación de ${leads.length} leads...`);
    const startTime = Date.now();
    
    for (const e of leads) {
        await prisma.employee.create({
            data: {
                routes: {
                    connect: {
                        id: routeId,
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
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ ${leads.length} leads creados exitosamente en ${duration}s`);
};

export const getEmployeeIdsMap = async (): Promise<{ [key: string]: string }> => {
    const employeeIdsMap: { [key: string]: string } = {};
    const employeesFromDb = await prisma.employee.findMany({});
    employeesFromDb.forEach((e, idx) => {
        employeeIdsMap[leads[idx][1]] = e.id;
    });
    return employeeIdsMap;
};

export const getLoanIdsMap = async (routeId: string): Promise<{ [key: string]: {
    id: string,
    weeks: number|undefined,
    totalProfit: number|undefined,
    rate: number|undefined,
    totalAmountToPay: number|undefined,
} }> => {
    const loanIdsMap: { [key: string]: { id: string, weeks: number | undefined, rate: number | undefined, totalProfit: number | undefined, totalAmountToPay: number | undefined } } = {};
    const loansFromDb = await prisma.loan.findMany({
        include:{
            loantype: true,
        }
    });
    loansFromDb.forEach((l) => {
        if(l.oldId){
            loanIdsMap[l.oldId] = {
                totalProfit: l.loantype ? Number(l.requestedAmount) * Number(l.loantype.rate) : undefined,
                id: l.id,
                weeks: l.loantype?.weekDuration ?? undefined,
                rate: l.loantype ? (l.loantype.rate !== null ? Number(l.loantype.rate) : undefined) : undefined,
                totalAmountToPay: Number(l.requestedAmount) + (l.profitAmount !== null ? Number(l.profitAmount) : 0)
            };
        }
    });
    return loanIdsMap;
}