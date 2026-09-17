import { cancelAppointment } from "../rules/cancel.js";
import { appointments } from "../storage/appointments.js";

export function cancel(id: string, now: number): boolean {
  const appointment = appointments.get(id);
  return appointment ? cancelAppointment(appointment, now) : false;
}
