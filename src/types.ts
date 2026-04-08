export type UserRole = 'admin' | 'user';

export interface UserProfile {
  id: string;
  nomeCompleto: string;
  apelidoPDF: string; // Key for matching CSV data
  email: string;
  funcoesAptas: string[];
  nivelAcesso: UserRole;
  photoURL?: string;
}

export interface Evento {
  id: string;
  nomeEvento: string;
  dataHoraInicio: string; // ISO string
}

export interface EscalaAtribuicao {
  id: string;
  eventoId: string;
  funcao: string;
  apelidoVoluntarioPDF: string;
  usuarioId?: string; // Linked user ID if found
}

export interface EventoWithEscalas extends Evento {
  escalas: EscalaAtribuicao[];
}
