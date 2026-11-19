export type ProjectCostVehicle = {
  vehicleId: string;
  plate: string;
  amount: string;
  count: number;
};

export type PartCostReport = {
  scope: "vehicle";
  vehicleId: string;
  month: string;
  totalAmount: string;
  monthAmount: string;
  months: { month: string; amount: string }[];
} | {
  scope: "project";
  projectId: string;
  month: string;
  totalAmount: string;
  vehicles: ProjectCostVehicle[];
};

export type VehicleCostRow = {
  id: string;
  plate: string;
  projectName: string | null;
  purchaseDate: string | null;
  purchasePrice: string | null;
  partsAmount: string;
  knownAmount: string;
};

export type VehicleCostReportData = {
  items: VehicleCostRow[];
  totalPurchasePrice: string;
  totalPartsAmount: string;
  totalKnownAmount: string;
  missingPurchasePriceCount: number;
};
