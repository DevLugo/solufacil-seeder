import { prisma } from "../standaloneApp";
import { convertExcelDate } from "../utils";
const xlsx = require('xlsx');

interface ExcelLead {
    oldId: string;
    nombre: string;
    apellidos: string;
    estado: string;
    municipio: string;
    localidad: string;
    calle: string;
    numero: string;
    codigoPostal: string;
    fechaContrato: Date | null;
    fechaNacimiento: Date | null;
    celular: string;
    curp: string;
    creditosOtorgados: number;
    clientasActivas: number;
    totalComisiones: number;
    activo: string;
    ruta: string;
}

export const extractLeadsData = (excelFileName: string, routeName: string) => {
    const excelFilePath = excelFileName;
    const tabName = 'LIDERES';
    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);

    // Obtener la hoja especificada
    const sheetLeads = workbook.Sheets[tabName];
    
    if (!sheetLeads) {
        return [];
    }

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetLeads, { header: 1 });
    
           let leadsData: ExcelLead[] = [];
       
       for (let i = 1; i < data.length; i++) {
           const row = data[i];
           
           // Si la fila está vacía o solo tiene valores vacíos, detener el procesamiento
           if (!row || row.every((cell: any) => !cell || cell === '')) {
               break;
           }
           
           // Solo agregar si el líder está activo (columna 16 = "SI")
           
           if (row[17] === 'SI' && row[21] === routeName) {
               leadsData.push({
                   oldId: String(row[0]),
                   nombre: row[1] || '', // NOMBRE
                   apellidos: row[2] || '', // APELLIDOS
                   estado: row[4] || '', // ESTADO
                   municipio: row[5] || '', // MUNICIPIO
                   localidad: row[6] || '', // LOCALIDAD
                   calle: row[7] || '', // CALLE
                   numero: row[8] || '', // NO
                   codigoPostal: String(row[9]) || '', // CP
                   fechaContrato: row[10] ? convertExcelDate(row[10]) : null, // FECHA CONTRATO
                   fechaNacimiento: row[11] ? convertExcelDate(row[11]) : null, // FECHA NACIMIENTO
                   celular: row[12] || '', // CELULAR
                   curp: row[13] || '', // CURP
                   creditosOtorgados: row[14] || 0, // CREDITOS OTORGADOS
                   clientasActivas: row[15] || 0, // CLIENTAS ACTIVAS
                   totalComisiones: row[16] || 0, // TOTAL COMISIONES
                   activo: row[17] || '', // ACTIVO
                   ruta: row[18] || '' // RUTA
               });
           }
       }

    return leadsData;
};

// Función para obtener o crear estado, municipio y localidad
async function getOrCreateLocation(estado: string, municipio: string, localidad: string, routeId: string) {
    // Buscar si ya existe el estado
    let state = await prisma.state.findFirst({
        where: { name: estado }
    });

    if (!state) {
        state = await prisma.state.create({
            data: { name: estado }
        });
    }

    // Buscar si ya existe el municipio
    let municipality = await prisma.municipality.findFirst({
        where: { 
            name: municipio,
            stateId: state.id
        }
    });

    if (!municipality) {
        municipality = await prisma.municipality.create({
            data: { 
                name: municipio,
                stateId: state.id
            }
        });
    }

    // Buscar si ya existe la localidad
    let location = await prisma.location.findFirst({
        where: { 
            name: localidad,
            municipalityId: municipality.id
        }
    });

    if (!location) {
        try {
            location = await prisma.location.create({
                data: { 
                    name: localidad,
                    municipalityId: municipality.id,
                    routeId: routeId
                }
            });
        } catch (error) {
            // Si falla la creación, buscar la localidad que ya existe
            location = await prisma.location.findFirst({
                where: { 
                    name: localidad,
                    municipalityId: municipality.id
                }
            });
            
            if (!location) {
                throw new Error(`No se pudo encontrar o crear una localidad para ${localidad} en ${municipality.name}`);
            }
        }
    } else {
    }

    return location;
}

export const seedLeads = async (routeId: string, routeName: string, excelFileName: string) => {
    
    const leadsData = extractLeadsData(excelFileName, routeName);
    
    
    
           // Tomar todos los líderes extraídos del Excel (sin filtrar por ruta)
       const routeLeads = leadsData;

       
       /* routeLeads.forEach((lead, index) => {
           console.log(`  ${index + 1}. ${lead.nombre} ${lead.apellidos} - Estado: ${lead.activo}`);
       }); */
    
           // Continuar con el proceso completo
    
    for (const lead of routeLeads) {
        
        // Obtener o crear la localidad para este líder
        const location = await getOrCreateLocation(
            lead.estado, 
            lead.municipio, 
            lead.localidad, 
            routeId
        );

        // Crear el empleado con datos personales y dirección
        const employeeData = {
            routes: {
                connect: {
                    id: routeId,
                }
            },
            oldId: lead.oldId,
            personalData: {
                create: {
                    fullName: `${lead.nombre} ${lead.apellidos}`,
                    birthDate: lead.fechaNacimiento,
                    addresses: {
                        create: {
                            street: lead.calle || "Sin especificar",
                            exteriorNumber: String(lead.numero) || "S/N",
                            interiorNumber: "",
                            postalCode: lead.codigoPostal || "00000",
                            references: `Líder ${lead.nombre} ${lead.apellidos}`,
                            location: {
                                connect: {
                                    id: location.id
                                }
                            }
                        }
                    },
                    phones: lead.celular ? {
                        create: {
                            number: String(lead.celular)
                        }
                    } : undefined
                }
            },
            type: 'LEAD',
        };

        
        const createdEmployee = await prisma.employee.create({
            data: employeeData,
            include: {
                personalData: {
                    include: {
                        addresses: {
                            include: {
                                location: {
                                    include: {
                                        municipality: {
                                            include: {
                                                state: true
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        phones: true
                    }
                }
            }
        });

        // Generar clientCode único para PersonalData
        if (createdEmployee.personalData?.id) {
            const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            const length = 6;
            const generate = () => Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
            let attempts = 0;
            let code = generate();
            try {
                while (attempts < 5) {
                    const existing = await prisma.personalData.findUnique({ where: { clientCode: code } as any });
                    if (!existing) break;
                    code = generate();
                    attempts++;
                }
                await prisma.personalData.update({ where: { id: createdEmployee.personalData.id }, data: { clientCode: code } as any });
            } catch (e) {
                console.error('Error generating clientCode:', e);
            }
        }

    };
}

export const getEmployeeIdsMap = async (): Promise<{ [key: string]: string }> => {
    const employeeIdsMap: { [key: string]: string } = {};
    const employeesFromDb = await prisma.employee.findMany({});
    employeesFromDb.forEach((e) => {
        if (e.oldId) {
            employeeIdsMap[e.oldId] = e.id;
        }
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