export interface SendEmailJob {
  recipient: string;
  template: "order-confirmation" | "invoice-ready";
  variables: Record<string, string>;
}
