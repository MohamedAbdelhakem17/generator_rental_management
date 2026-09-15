export interface FuelLogRef {
  id: string;
  code: string;
  normalFuelConsumption: number;
}

export interface FuelLogProjectRef {
  id: string;
  code: string;
  name: string;
}

export interface FuelLogRow {
  id: string;
  date: string;
  project: FuelLogProjectRef;
  generator: FuelLogRef;
  liters: number;
  pricePerLiter: string;
  totalCost: string;
  operatingHoursRef: number | null;
  consumptionRate: number | null;
  createdAt: string;
}

export interface FuelLogDetail extends FuelLogRow {
  contributingOperationLogIds: string[];
}
