"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLoanIdsMap = exports.getEmployeeIdsMap = exports.seedLeads = exports.extractLeadsData = void 0;
const standaloneApp_1 = require("../standaloneApp");
const utils_1 = require("../utils");
const xlsx = require('xlsx');
const extractLeadsData = (excelFileName, routeName) => {
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
    let leadsData = [];
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        console.log(`📝 Procesando fila ${i}:`, row);
        // Si la fila está vacía o solo tiene valores vacíos, detener el procesamiento
        if (!row || row.every((cell) => !cell || cell === '')) {
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
                fechaContrato: row[10] ? (0, utils_1.convertExcelDate)(row[10]) : null, // FECHA CONTRATO
                fechaNacimiento: row[11] ? (0, utils_1.convertExcelDate)(row[11]) : null, // FECHA NACIMIENTO
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
exports.extractLeadsData = extractLeadsData;
// Función para obtener o crear estado, municipio y localidad
async function getOrCreateLocation(estado, municipio, localidad, routeId) {
    // Buscar si ya existe el estado
    let state = await standaloneApp_1.prisma.state.findFirst({
        where: { name: estado }
    });
    if (!state) {
        state = await standaloneApp_1.prisma.state.create({
            data: { name: estado }
        });
        console.log(`✅ Estado creado: ${estado}`);
    }
    // Buscar si ya existe el municipio
    let municipality = await standaloneApp_1.prisma.municipality.findFirst({
        where: {
            name: municipio,
            stateId: state.id
        }
    });
    if (!municipality) {
        municipality = await standaloneApp_1.prisma.municipality.create({
            data: {
                name: municipio,
                stateId: state.id
            }
        });
        console.log(`✅ Municipio creado: ${municipality.name} en ${estado}`);
    }
    // Buscar si ya existe la localidad
    let location = await standaloneApp_1.prisma.location.findFirst({
        where: {
            name: localidad,
            municipalityId: municipality.id
        }
    });
    if (!location) {
        console.log(`⚠️ Localidad no encontrada: ${localidad} en ${municipality.name}. Creando nueva localidad.`);
        try {
            location = await standaloneApp_1.prisma.location.create({
                data: {
                    name: localidad,
                    municipalityId: municipality.id,
                    routeId: routeId
                }
            });
            console.log(`✅ Localidad creada: ${localidad} en ${municipality.name}`);
        }
        catch (error) {
            console.log(`⚠️ Error al crear localidad: ${error}. Buscando localidad existente.`);
            // Si falla la creación, buscar la localidad que ya existe
            location = await standaloneApp_1.prisma.location.findFirst({
                where: {
                    name: localidad,
                    municipalityId: municipality.id
                }
            });
            if (!location) {
                throw new Error(`No se pudo encontrar o crear una localidad para ${localidad} en ${municipality.name}`);
            }
        }
    }
    else {
        console.log(`✅ Localidad encontrada: ${localidad} en ${municipality.name}`);
    }
    return location;
}
const seedLeads = async (routeId, routeName, excelFileName) => {
    console.log(`🔍 Extrayendo líderes del Excel para la ruta: ${routeName}`);
    const leadsData = (0, exports.extractLeadsData)(excelFileName, routeName);
    console.log(`📊 Total de líderes extraídos del Excel: ${leadsData.length}`);
    // Tomar todos los líderes extraídos del Excel (sin filtrar por ruta)
    const routeLeads = leadsData;
    console.log(`📊 Encontrados ${routeLeads.length} líderes del Excel (todos para la ruta "${routeName}")`);
    console.log(`📋 Total de líderes activos extraídos: ${routeLeads.length}`);
    console.log(`🔍 Lista de líderes activos:`);
    routeLeads.forEach((lead, index) => {
        console.log(`  ${index + 1}. ${lead.nombre} ${lead.apellidos} - Estado: ${lead.activo}`);
    });
    // Continuar con el proceso completo
    for (const lead of routeLeads) {
        console.log(`📝 Procesando líder: ${JSON.stringify(lead)}`);
        // Obtener o crear la localidad para este líder
        const location = await getOrCreateLocation(lead.estado, lead.municipio, lead.localidad, routeId);
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
        console.log(`📝 Creando líder: ${lead.nombre} ${lead.apellidos} con dirección en ${lead.localidad}`);
        const createdEmployee = await standaloneApp_1.prisma.employee.create({
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
        console.log(`✅ Líder creado: ${createdEmployee.personalData?.fullName} con ${createdEmployee.personalData?.addresses?.length || 0} direcciones`);
        console.log(`📍 Dirección: ${lead.calle} ${lead.numero}, ${lead.localidad}, ${lead.municipio}, ${lead.estado}`);
    }
    ;
};
exports.seedLeads = seedLeads;
const getEmployeeIdsMap = async () => {
    const employeeIdsMap = {};
    const employeesFromDb = await standaloneApp_1.prisma.employee.findMany({});
    employeesFromDb.forEach((e) => {
        if (e.oldId) {
            employeeIdsMap[e.oldId] = e.id;
        }
    });
    return employeeIdsMap;
};
exports.getEmployeeIdsMap = getEmployeeIdsMap;
const getLoanIdsMap = async (routeId) => {
    const loanIdsMap = {};
    const loansFromDb = await standaloneApp_1.prisma.loan.findMany({
        include: {
            loantype: true,
        }
    });
    loansFromDb.forEach((l) => {
        if (l.oldId) {
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
};
exports.getLoanIdsMap = getLoanIdsMap;
