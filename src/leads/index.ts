import { prisma } from "../standaloneApp";
import { convertExcelDate } from "../utils";
const xlsx = require('xlsx');

// ========== SISTEMA DE MAPEO GLOBAL DE LEADID ==========
// Cache global para mantener el mapeo de oldId -> newId de leads
// Esto evita conflictos cuando los mismos IDs aparecen en diferentes archivos Excel
interface LeadMappingEntry {
    oldId: string;
    newId: string;
    fullName: string;
    routeName: string;
    createdAt: Date;
}

// Cache global en memoria
let globalLeadMapping: { [key: string]: LeadMappingEntry } = {};

// Función para generar un ID único para el mapeo
const generateUniqueMappingKey = (oldId: string, routeName: string): string => {
    return `${routeName}-${oldId}`;
};

// Función para obtener o crear el mapeo de un lead
export const getOrCreateLeadMapping = async (oldId: string, fullName: string, routeName: string): Promise<string> => {
    const mappingKey = generateUniqueMappingKey(oldId, routeName);
    
    // Si ya existe en el cache, devolverlo
    if (globalLeadMapping[mappingKey]) {
        console.log(`🔄 Reutilizando mapeo existente: ${oldId} -> ${globalLeadMapping[mappingKey].newId} (${fullName})`);
        return globalLeadMapping[mappingKey].newId;
    }
    
    // Buscar si ya existe un lead con este oldId en la base de datos
    const existingLead = await prisma.employee.findFirst({
        where: {
            oldId: oldId,
            type: 'ROUTE_LEAD'
        },
        include: {
            personalData: true
        }
    });
    
    if (existingLead) {
        // Si existe, agregarlo al cache y devolverlo
        globalLeadMapping[mappingKey] = {
            oldId: oldId,
            newId: existingLead.id,
            fullName: existingLead.personalData?.fullName || fullName,
            routeName: routeName,
            createdAt: new Date()
        };
        console.log(`✅ Lead existente encontrado: ${oldId} -> ${existingLead.id} (${existingLead.personalData?.fullName})`);
        return existingLead.id;
    }
    
    // Si no existe, crear uno nuevo (esto se hará en la función seedLeads)
    // Por ahora, generar un ID temporal que se reemplazará cuando se cree el lead
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    globalLeadMapping[mappingKey] = {
        oldId: oldId,
        newId: tempId,
        fullName: fullName,
        routeName: routeName,
        createdAt: new Date()
    };
    console.log(`🆕 Nuevo mapeo temporal creado: ${oldId} -> ${tempId} (${fullName})`);
    return tempId;
};

// Función para actualizar el mapeo cuando se crea un lead real
export const updateLeadMapping = (oldId: string, routeName: string, realNewId: string): void => {
    const mappingKey = generateUniqueMappingKey(oldId, routeName);
    if (globalLeadMapping[mappingKey]) {
        globalLeadMapping[mappingKey].newId = realNewId;
        console.log(`🔄 Mapeo actualizado: ${oldId} -> ${realNewId} (${globalLeadMapping[mappingKey].fullName})`);
    }
};

// Función para obtener el mapeo completo de leads
export const getGlobalLeadMapping = (): { [key: string]: string } => {
    const result: { [key: string]: string } = {};
    Object.values(globalLeadMapping).forEach(entry => {
        result[entry.oldId] = entry.newId;
    });
    return result;
};

// Función para limpiar el cache de mapeo
export const clearLeadMapping = (): void => {
    globalLeadMapping = {};
    console.log('🧹 Cache de mapeo de leads limpiado');
};

// Función para obtener estadísticas del mapeo
export const getLeadMappingStats = (): { totalMappings: number, routes: string[], details: LeadMappingEntry[] } => {
    const routes = [...new Set(Object.values(globalLeadMapping).map(entry => entry.routeName))];
    return {
        totalMappings: Object.keys(globalLeadMapping).length,
        routes: routes,
        details: Object.values(globalLeadMapping)
    };
};

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

    console.log(`📁 Leyendo archivo: ${excelFilePath}`);
    console.log(`📋 Buscando hoja: ${tabName}`);

    // Leer el archivo Excel
    const workbook = xlsx.readFile(excelFilePath);

    // Obtener la hoja especificada
    const sheetLeads = workbook.Sheets[tabName];
    
    if (!sheetLeads) {
        console.log(`❌ No se encontró la hoja "${tabName}"`);
        console.log(`📋 Hojas disponibles:`, Object.keys(workbook.Sheets));
        return [];
    }

    console.log(`✅ Hoja "${tabName}" encontrada`);

    // Convertir la hoja a formato JSON
    const data = xlsx.utils.sheet_to_json(sheetLeads, { header: 1 });
    
    console.log(`📊 Filas extraídas: ${data.length}`);
    console.log(`🔍 Primera fila (headers):`, data[0]);

           let leadsData: ExcelLead[] = [];
       
       for (let i = 1; i < data.length; i++) {
           const row = data[i];
           console.log(`📝 Procesando fila ${i}:`, row);
           
           // Si la fila está vacía o solo tiene valores vacíos, detener el procesamiento
           if (!row || row.every((cell: any) => !cell || cell === '')) {
               console.log(`🛑 Fila ${i} está vacía, deteniendo extracción`);
               break;
           }
           
           // Solo agregar si el líder está activo (columna 16 = "SI")
           console.log(`🔍 Fila ${i}: activo = "${row[17]}" ruta = "${row[21]}"`);
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
               console.log(`✅ Agregado líder: ${row[1]} ${row[2]}`);
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
        console.log(`✅ Estado creado: ${estado}`);
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
        console.log(`✅ Municipio creado: ${municipality.name} en ${estado}`);
    }

    // Buscar si ya existe la localidad
    let location = await prisma.location.findFirst({
        where: { 
            name: localidad,
            municipalityId: municipality.id
        }
    });

    if (!location) {
        console.log(`⚠️ Localidad no encontrada: ${localidad} en ${municipality.name}. Creando nueva localidad.`);
        try {
            location = await prisma.location.create({
                data: { 
                    name: localidad,
                    municipalityId: municipality.id,
                    routeId: routeId
                }
            });
            console.log(`✅ Localidad creada: ${localidad} en ${municipality.name}`);
        } catch (error) {
            console.log(`⚠️ Error al crear localidad: ${error}. Buscando localidad existente.`);
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
        console.log(`✅ Localidad encontrada: ${localidad} en ${municipality.name}`);
    }

    return location;
}

export const seedLeads = async (routeId: string, routeName: string, excelFileName: string) => {
    console.log(`🔍 Extrayendo líderes del Excel para la ruta: ${routeName}`);
    
    const leadsData = extractLeadsData(excelFileName, routeName);
    
    console.log(`📊 Total de líderes extraídos del Excel: ${leadsData.length}`);
    
    // Tomar todos los líderes extraídos del Excel (sin filtrar por ruta)
    const routeLeads = leadsData;

    console.log(`📊 Encontrados ${routeLeads.length} líderes del Excel (todos para la ruta "${routeName}")`);
    console.log(`📋 Total de líderes activos extraídos: ${routeLeads.length}`);
    
    // ========== SISTEMA DE MAPEO DE LEADS ==========
    
    // Pre-crear todos los mapeos para evitar conflictos
    const leadMappings: { [oldId: string]: string } = {};
    
    for (const lead of routeLeads) {
        const fullName = `${lead.nombre} ${lead.apellidos}`;
        const mappingId = await getOrCreateLeadMapping(lead.oldId, fullName, routeName);
        leadMappings[lead.oldId] = mappingId;
        console.log(`🗺️ Mapeo pre-creado: ${lead.oldId} -> ${mappingId} (${fullName})`);
    }
    
    // Continuar con el proceso completo
    for (const lead of routeLeads) {
        console.log(`📝 Procesando líder: ${JSON.stringify(lead)}`);
        
        // Verificar si el lead ya existe usando el mapeo
        const mappingId = leadMappings[lead.oldId];
        if (mappingId && mappingId.startsWith('temp-')) {
            // Es un lead nuevo, crear en la base de datos
            
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
                type: 'ROUTE_LEAD',
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

            // Actualizar el mapeo con el ID real
            updateLeadMapping(lead.oldId, routeName, createdEmployee.id);
            leadMappings[lead.oldId] = createdEmployee.id;

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

            console.log(`✅ Líder creado: ${createdEmployee.personalData?.fullName} con ${createdEmployee.personalData?.addresses?.length || 0} direcciones`);
            console.log(`📍 Dirección: ${lead.calle} ${lead.numero}, ${lead.localidad}, ${lead.municipio}, ${lead.estado}`);
        } else {
            // El lead ya existe, solo mostrar información
            console.log(`✅ Líder ya existe: ${lead.nombre} ${lead.apellidos} (ID: ${mappingId})`);
        }
    }
    
    // Mostrar estadísticas finales del mapeo
    const stats = getLeadMappingStats();
    console.log('\n📊 ========== ESTADÍSTICAS FINALES DEL MAPEO ==========');
    console.log(`📈 Total de mapeos: ${stats.totalMappings}`);
    console.log(`🗺️ Rutas procesadas: ${stats.routes.join(', ')}`);
    console.log('📊 ================================================\n');
}

export const getEmployeeIdsMap = async (): Promise<{ [key: string]: string }> => {
    // Usar el mapeo global si está disponible, sino buscar en la base de datos
    const globalMapping = getGlobalLeadMapping();
    if (Object.keys(globalMapping).length > 0) {
        console.log(`🗺️ Usando mapeo global de leads: ${Object.keys(globalMapping).length} mapeos`);
        return globalMapping;
    }
    
    // Fallback: buscar en la base de datos
    console.log('🔍 Mapeo global vacío, buscando en base de datos...');
    const employeeIdsMap: { [key: string]: string } = {};
    const employeesFromDb = await prisma.employee.findMany({
        where: { type: 'ROUTE_LEAD' }
    });
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