export interface Appointment {
  id: string;
  startsAt: number;
  status: "confirmed" | "cancelled";
}

export const appointments = new Map<string, Appointment>();
