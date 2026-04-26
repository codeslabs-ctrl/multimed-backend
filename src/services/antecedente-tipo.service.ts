import {
  AntecedenteTipoRepository,
  AntecedenteMedicoTipoData,
  MedicoFiltroAntecedente
} from '../repositories/antecedente-tipo.repository.js';
import { AntecedentesTipoLabelRepository, AntecedenteTipoLabelRow } from '../repositories/antecedentes-tipo-label.repository.js';

export class AntecedenteTipoService {
  private repository: AntecedenteTipoRepository;
  private labelRepository: AntecedentesTipoLabelRepository;

  constructor() {
    this.repository = new AntecedenteTipoRepository();
    this.labelRepository = new AntecedentesTipoLabelRepository();
  }

  async getCategoriaLabels(): Promise<AntecedenteTipoLabelRow[]> {
    return this.labelRepository.findActivosOrdenados();
  }

  async getAllTipoLabels(): Promise<AntecedenteTipoLabelRow[]> {
    return this.labelRepository.findAllOrdenados();
  }

  async createTipoLabel(data: { codigo: string; etiqueta: string; orden: number; activo: boolean }): Promise<AntecedenteTipoLabelRow> {
    return this.labelRepository.create(data);
  }

  async updateTipoLabel(
    id: number,
    data: { etiqueta?: string; orden?: number; activo?: boolean }
  ): Promise<AntecedenteTipoLabelRow> {
    return this.labelRepository.update(id, data);
  }

  async deleteTipoLabel(id: number): Promise<'deleted' | 'not_found'> {
    return this.labelRepository.deleteById(id);
  }

  async getAll(): Promise<AntecedenteMedicoTipoData[]> {
    const { data } = await this.repository.findAll({}, { page: 1, limit: 1000 });
    return data;
  }

  async getByTipo(
    tipo: string,
    soloActivos = true,
    filtro: MedicoFiltroAntecedente = 'solo_global'
  ): Promise<AntecedenteMedicoTipoData[]> {
    return this.repository.findByTipo(tipo, soloActivos, filtro);
  }

  async getById(id: number): Promise<AntecedenteMedicoTipoData | null> {
    return this.repository.findById(id);
  }

  async create(data: Omit<AntecedenteMedicoTipoData, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>): Promise<AntecedenteMedicoTipoData> {
    return this.repository.create(data);
  }

  async update(id: number, data: Partial<AntecedenteMedicoTipoData>): Promise<AntecedenteMedicoTipoData> {
    return this.repository.update(id, data);
  }

  async delete(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }
}
