import { prisma } from "../standaloneApp";
import { leads } from "../utils";

export const seedLeads = async (routeId: string) => {
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
    };
}

export const getEmployeeIdsMap = async (): Promise<{ [key: string]: string }> => {
    const employeeIdsMap: { [key: string]: string } = {};
    const employeesFromDb = await prisma.employee.findMany({});
    employeesFromDb.forEach((e, idx) => {
        employeeIdsMap[leads[idx][1]] = e.id;
    });
    return employeeIdsMap;
};

export const getLoanIdsMap = async (routeId: string): Promise<{ [key: string]: string }> => {
    const loanIdsMap: { [key: string]: string } = {};
    const loansFromDb = await prisma.loan.findMany({
        
    });
    console.log('loansFromDb', loansFromDb.length);
    /* console.log('loansFromDb', loansFromDb); */
    loansFromDb.forEach((l) => {
        if(l.oldId){
            loanIdsMap[l.oldId] = l.id;
        }
    });
    return loanIdsMap;
}