import type { Appointment } from "../storage/appointments.js";

export function cancelAppointment(appointment: Appointment, now: number): boolean {
  if (appointment.status !== "confirmed" || appointment.startsAt - now < 86_400_000) {
    return false;
  }
  appointment.status = "cancelled";
  return true;
}
