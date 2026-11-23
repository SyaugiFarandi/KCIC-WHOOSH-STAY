export interface ExternalEmployeeRecord {
  sourceSystem: string;
  externalEmployeeId: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  positionCode: string | null;
  positionName: string | null;
  homeStationCode: string | null;
  employmentStatus: string;
  eligibilityStatus: string;
  sourceUpdatedAt: Date | null;
}

export interface EmployeeProvider {
  readonly sourceSystem: string;
  fetchEmployees(): Promise<ExternalEmployeeRecord[]>;
}

const DEPARTMENT_DEMO = 'Crew Operations';
const DEMO_DOMAIN = 'demo.whoosh-stay.local';

const MOCK_EMPLOYEES: ExternalEmployeeRecord[] = [
  {
    sourceSystem: 'DEMO',
    externalEmployeeId: 'DEMO-EXT-001',
    employeeCode: 'DEMO-EMP-0001',
    fullName: 'Demo Crew Satu',
    workEmail: `demo-emp-0001@${DEMO_DOMAIN}`,
    departmentCode: 'DEMO-DEPT',
    departmentName: DEPARTMENT_DEMO,
    positionCode: 'DEMO-POS',
    positionName: 'DEMO Posisi',
    homeStationCode: 'DEMO-STATION',
    employmentStatus: 'ACTIVE',
    eligibilityStatus: 'ELIGIBLE',
    sourceUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  {
    sourceSystem: 'DEMO',
    externalEmployeeId: 'DEMO-EXT-002',
    employeeCode: 'DEMO-EMP-0002',
    fullName: 'Demo Crew Dua',
    workEmail: `demo-emp-0002@${DEMO_DOMAIN}`,
    departmentCode: 'DEMO-DEPT',
    departmentName: DEPARTMENT_DEMO,
    positionCode: 'DEMO-POS',
    positionName: 'DEMO Posisi',
    homeStationCode: 'DEMO-STATION',
    employmentStatus: 'ACTIVE',
    eligibilityStatus: 'ELIGIBLE',
    sourceUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
];

export class MockEmployeeProvider implements EmployeeProvider {
  readonly sourceSystem = 'DEMO';

  async fetchEmployees(): Promise<ExternalEmployeeRecord[]> {
    return MOCK_EMPLOYEES.map((employee) => ({ ...employee }));
  }
}
