export interface ExportJob {
  accountId: string;
  format: "csv" | "json";
  requestedBy: string;
}
