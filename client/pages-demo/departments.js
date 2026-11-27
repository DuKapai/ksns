import departments from "../../server/data/departments.json";
export async function readDepartments() { return structuredClone(departments); }
