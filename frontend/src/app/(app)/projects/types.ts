export type ProjectStatus = 'Active' | 'Closed';

export interface ProjectCustomerRef {
  id: string;
  code: string;
  companyName: string;
}

export interface AssignedGeneratorSummary {
  generatorId: string;
  code: string;
  status: string;
}

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  customer: ProjectCustomerRef;
  location: string;
  siteManager: string;
  startDate: string;
  endDate: string | null;
  status: ProjectStatus;
  createdAt: string;
}

/** Only present on the detail (`GET /api/projects/:id`) response, never on list rows. */
export interface ProjectDetail extends ProjectRow {
  assignedGenerators: AssignedGeneratorSummary[];
}
