import type { PatientData } from '../repositories/patient.repository.js';

/** Cédula duplicada: el cliente debe confirmar vínculo (409 PATIENT_CEDULA_EXISTS). */
export class PatientCedulaExistsError extends Error {
  readonly code = 'PATIENT_CEDULA_EXISTS' as const;

  constructor(public readonly existingPatient: PatientData) {
    super(
      'Ya existe un paciente con esta cédula. Revise los datos registrados y confirme si desea vincularlo a su historial.'
    );
    this.name = 'PatientCedulaExistsError';
  }
}
