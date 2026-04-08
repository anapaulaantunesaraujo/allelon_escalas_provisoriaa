import Papa from 'papaparse';
import { EscalaAtribuicao, UserProfile } from './types';

export const parseUsersCSV = (file: File): Promise<Partial<UserProfile>[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const users = results.data.map((row: any) => ({
          nomeCompleto: row.Nome_Completo,
          apelidoPDF: row.Apelido_PDF,
          email: row.Email,
          funcoesAptas: row.Funcoes_Aptas ? row.Funcoes_Aptas.split(',').map((f: string) => f.trim()) : [],
          nivelAcesso: (row.Nivel_Acesso?.toLowerCase() === 'admin' ? 'admin' : 'user') as any,
        }));
        resolve(users);
      },
      error: (error) => reject(error),
    });
  });
};

export const parseEscalasCSV = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error),
    });
  });
};

export const mapVolunteersToUsers = (
  escalas: Partial<EscalaAtribuicao>[],
  users: UserProfile[]
): EscalaAtribuicao[] => {
  return escalas.map((escala) => {
    const user = users.find((u) => u.apelidoPDF === escala.apelidoVoluntarioPDF);
    return {
      ...escala,
      id: escala.id || Math.random().toString(36).substr(2, 9),
      usuarioId: user?.id,
    } as EscalaAtribuicao;
  });
};
