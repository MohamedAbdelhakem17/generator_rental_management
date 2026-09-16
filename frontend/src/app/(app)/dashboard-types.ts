export interface DashboardSummary {
  fleet: {
    total: number;
    available: number;
    rented: number;
    underMaintenance: number;
    stopped: number;
  };
  financial: {
    revenue: string;
    receipts: string;
    outstanding: string;
    expenses: string;
    netProfit: string;
  };
  operations: {
    operatingHours: string;
    fuelConsumption: string;
    maintenanceCost: string;
  };
  alerts: {
    expiringContracts: number;
    overdueCustomers: number;
    maintenance: number;
    stoppedGenerators: number;
    abnormalFuel: number;
  };
  charts: {
    revenueTrend: Array<{ month: string; revenue: string }>;
    extractStatus: Array<{ status: string; value: number }>;
    topGeneratorsUtilization: Array<{ generatorCode: string; utilization: number }>;
    topGeneratorsProfitability: Array<{ generatorCode: string; netProfit: string }>;
  };
}
