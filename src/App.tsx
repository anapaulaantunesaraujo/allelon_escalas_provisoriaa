import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useAuth, AuthProvider } from './AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { signInWithPopup, signOut } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, setDoc, doc, addDoc, updateDoc, where, getDocs, deleteDoc } from 'firebase/firestore';
import { Evento, EventoWithEscalas, EscalaAtribuicao, UserProfile } from './types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, LogIn, LogOut, Upload, User, Users, CalendarDays, CheckCircle2, AlertTriangle, Plus, Download } from 'lucide-react';
import { format, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseUsersCSV, parseEscalasCSV, mapVolunteersToUsers } from './lib/csv-utils';
import { generateGoogleCalendarUrl, downloadICS } from './lib/calendar-utils';
import { Toaster, toast } from 'sonner';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signInWithEmail, resetPassword } = useAuth();

  const handleEmailLogin = async () => {
    try {
      await signInWithEmail(email, password);
    } catch (error) {
      console.error("Email login failed", error);
      toast.error("Falha ao entrar com e-mail.");
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      toast.error("Por favor, insira seu e-mail.");
      return;
    }
    try {
      await resetPassword(email);
      toast.success("E-mail de redefinição enviado!");
    } catch (error) {
      console.error("Reset password failed", error);
      toast.error("Falha ao enviar e-mail de redefinição.");
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
      toast.error("Falha ao entrar com Google.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-linear-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Allelon</h1>
          <p className="text-slate-500">Gestão de Escalas para Voluntários</p>
        </div>
        <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md">
          <CardHeader>
            <CardTitle>Bem-vindo</CardTitle>
            <CardDescription>Acesse sua conta para visualizar suas escalas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleLogin} className="w-full h-12 text-lg gap-2" size="lg" variant="outline">
              <LogIn className="h-5 w-5" />
              Entrar com Google
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-500">Ou</span>
              </div>
            </div>
            <div className="space-y-2">
              <Input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
              <Input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} />
              <Button onClick={handleEmailLogin} className="w-full">Entrar com e-mail</Button>
              <Button variant="link" onClick={handleResetPassword} className="w-full text-xs">Esqueci minha senha / Primeiro acesso</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Dashboard() {
  const { user, profile, isAdmin } = useAuth();
  const [eventos, setEventos] = useState<EventoWithEscalas[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isImporting, setIsImporting] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editingEvento, setEditingEvento] = useState<EventoWithEscalas | null>(null);
  const [selectedEventos, setSelectedEventos] = useState<Set<string>>(new Set());
  const [nameFilter, setNameFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('');
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkTime, setBulkTime] = useState('');

  const handleToggleEvento = (eventoId: string) => {
    const next = new Set(selectedEventos);
    if (next.has(eventoId)) next.delete(eventoId);
    else next.add(eventoId);
    setSelectedEventos(next);
  };

  const handleDeleteSelected = async () => {
    try {
      for (const eventoId of selectedEventos) {
        await handleDeleteEvento(eventoId);
      }
      setSelectedEventos(new Set());
      toast.success("Eventos selecionados excluídos com sucesso!");
    } catch (err) {
      toast.error("Erro ao excluir eventos selecionados");
    }
  };

  const linkVoluntarios = async () => {
    try {
      const escalasSnap = await getDocs(collection(db, 'escalas'));
      const usersSnap = await getDocs(collection(db, 'users'));
      const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));
      
      let updatedCount = 0;
      for (const escDoc of escalasSnap.docs) {
        const esc = escDoc.data() as EscalaAtribuicao;
        const user = users.find(u => 
          u.apelidoPDF.trim().toLowerCase() === esc.apelidoVoluntarioPDF.trim().toLowerCase()
        );
        if (user && esc.usuarioId !== user.id) {
          await updateDoc(escDoc.ref, { usuarioId: user.id });
          updatedCount++;
        } else if (!user) {
          console.log(`No user found for: ${esc.apelidoVoluntarioPDF}`);
        }
      }
      toast.success(`${updatedCount} voluntários vinculados com sucesso!`);
    } catch (err) {
      console.error("Error linking volunteers:", err);
      toast.error("Erro ao vincular voluntários");
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      const userRef = doc(db, 'users', editingUser.id);
      try {
        await updateDoc(userRef, {
          nomeCompleto: editingUser.nomeCompleto,
          nivelAcesso: editingUser.nivelAcesso
        });
      } catch (err: any) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (err.code === 'not-found' || errorMessage.includes('not found') || errorMessage.includes('404')) {
          console.log(`User ${editingUser.id} not found, creating it instead.`);
          await setDoc(userRef, {
            nomeCompleto: editingUser.nomeCompleto,
            nivelAcesso: editingUser.nivelAcesso
          });
        } else {
          throw err;
        }
      }
      toast.success("Usuário atualizado com sucesso!");
      setEditingUser(null);
    } catch (err) {
      console.error("Error updating user:", err);
      toast.error("Erro ao atualizar usuário");
    }
  };

  const handleUpdateEvento = async () => {
    if (!editingEvento) return;
    if (!editingEvento.id) {
      console.error("Editing event has no ID:", editingEvento);
      toast.error("Erro: Evento sem ID");
      return;
    }
    console.log("Updating event:", editingEvento);
    try {
      const eventRef = doc(db, 'eventos', editingEvento.id);
      try {
        await updateDoc(eventRef, {
          nomeEvento: editingEvento.nomeEvento,
          dataHoraInicio: editingEvento.dataHoraInicio
        });
      } catch (eventErr: any) {
        const errorMessage = eventErr instanceof Error ? eventErr.message : String(eventErr);
        if (eventErr.code === 'not-found' || errorMessage.includes('not found') || errorMessage.includes('404')) {
          console.log(`Event ${editingEvento.id} not found, creating it instead.`);
          await setDoc(eventRef, {
            nomeEvento: editingEvento.nomeEvento,
            dataHoraInicio: editingEvento.dataHoraInicio,
            isEventoEspecial: false
          });
        } else {
          throw eventErr;
        }
      }
      for (const esc of editingEvento.escalas) {
        if (!esc.id) {
          console.error("Escala has no ID:", esc);
          continue;
        }
        console.log("Updating escala:", esc);
        const escRef = doc(db, 'escalas', esc.id);
        try {
          await updateDoc(escRef, {
            apelidoVoluntarioPDF: esc.apelidoVoluntarioPDF,
            funcao: esc.funcao,
            isLider: esc.isLider,
            isBriefing: esc.isBriefing
          });
        } catch (escErr: any) {
          const errorMessage = escErr instanceof Error ? escErr.message : String(escErr);
          if (escErr.code === 'not-found' || errorMessage.includes('not found') || errorMessage.includes('404')) {
            console.log(`Escala ${esc.id} not found, creating it instead.`);
            await setDoc(escRef, {
              eventoId: editingEvento.id,
              apelidoVoluntarioPDF: esc.apelidoVoluntarioPDF,
              funcao: esc.funcao,
              isLider: esc.isLider,
              isBriefing: esc.isBriefing
            });
          } else {
            throw escErr;
          }
        }
      }
      toast.success("Evento e escalas atualizados com sucesso!");
      setEditingEvento(null);
    } catch (err) {
      console.error("Error updating event:", err);
      toast.error("Erro ao atualizar evento");
    }
  };

  const handleDeleteEvento = async (eventoId: string) => {
    try {
      console.log(`Attempting to delete event: ${eventoId}`);
      // Delete all escalas for this event
      const escalasQ = query(collection(db, 'escalas'), where('eventoId', '==', eventoId));
      const escalasSnap = await getDocs(escalasQ);
      console.log(`Found ${escalasSnap.size} escalas to delete.`);
      for (const escDoc of escalasSnap.docs) {
        await deleteDoc(escDoc.ref);
      }
      // Delete event
      const eventRef = doc(db, 'eventos', eventoId);
      try {
        await deleteDoc(eventRef);
      } catch (err: any) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (err.code === 'not-found' || errorMessage.includes('not found') || errorMessage.includes('404')) {
          console.log(`Event ${eventoId} not found, skipping delete.`);
        } else {
          throw err;
        }
      }
      toast.success("Evento e escalas excluídos com sucesso!");
    } catch (err) {
      console.error("Delete error:", err);
      toast.error(`Erro ao excluir evento: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    }
  };

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    
    const q = query(collection(db, 'eventos'), orderBy('dataHoraInicio', 'asc'));
    const unsubEventos = onSnapshot(q, (snapshot) => {
      setEventos(snapshot.docs.map(d => ({ id: d.id, ...d.data(), escalas: [] } as EventoWithEscalas)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'eventos'));

    const unsubEscalas = onSnapshot(collection(db, 'escalas'), (escalaSnap) => {
      const allEscalas = escalaSnap.docs.map(d => ({ id: d.id, ...d.data() } as EscalaAtribuicao));
      console.log("All escalas loaded:", allEscalas);
      
      setEventos(prevEventos => {
        console.log("Updating eventos with escalas. Current eventos:", prevEventos);
        return prevEventos.map(ev => {
          const matchingEscalas = allEscalas.filter(esc => esc.eventoId === ev.id);
          console.log(`Event ${ev.nomeEvento} (ID: ${ev.id}) matched with ${matchingEscalas.length} escalas.`);
          return {
            ...ev,
            escalas: matchingEscalas
          };
        });
      });
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'escalas'));

    return () => {
      unsubUsers();
      unsubEventos();
      unsubEscalas();
    };
  }, []);

  const filteredEventos = eventos.filter(ev => 
    ev.nomeEvento.toLowerCase().includes(nameFilter.toLowerCase()) &&
    format(new Date(ev.dataHoraInicio || new Date().toISOString()), 'HH:mm').includes(timeFilter)
  );

  const myEscalas = eventos.flatMap(ev => 
    ev.escalas
      .filter(esc => esc.usuarioId === user?.uid)
      .map(esc => ({ ...esc, evento: ev }))
  ).filter(item => new Date(item.evento.dataHoraInicio || new Date().toISOString()) >= new Date());

  const handleBulkEditTime = async () => {
    if (!bulkTime) return;
    try {
      for (const eventoId of selectedEventos) {
        const ev = eventos.find(e => e.id === eventoId);
        if (ev) {
          const date = new Date(ev.dataHoraInicio || new Date().toISOString());
          const [hours, minutes] = bulkTime.split(':');
          date.setHours(parseInt(hours), parseInt(minutes));
          
          const eventRef = doc(db, 'eventos', eventoId);
          try {
            await updateDoc(eventRef, {
              dataHoraInicio: date.toISOString()
            });
          } catch (err: any) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (err.code === 'not-found' || errorMessage.includes('not found') || errorMessage.includes('404')) {
              console.log(`Event ${eventoId} not found, skipping.`);
            } else {
              throw err;
            }
          }
        }
      }
      toast.success("Horários atualizados com sucesso!");
      setBulkEditOpen(false);
      setSelectedEventos(new Set());
    } catch (err) {
      console.error("Error updating bulk times:", err);
      toast.error("Erro ao atualizar horários");
    }
  };

  const handleManualImport = async (csvContent: string) => {
    setIsImporting(true);
    try {
      const Papa = await import('papaparse');
      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        delimiter: ';',
        complete: async (results) => {
          for (const row of results.data as any[]) {
            if (row.Email) {
              await setDoc(doc(db, 'users', row.Email), {
                nomeCompleto: row.Nome_Completo,
                apelidoPDF: row.Apelido_PDF,
                email: row.Email,
                funcoesAptas: row.Funcoes_Aptas ? row.Funcoes_Aptas.split(',').map((f: string) => f.trim()) : [],
                nivelAcesso: row.Nivel_Acessos?.toLowerCase().includes('admin') ? 'admin' : 'user'
              });
            }
          }
        }
      });
    } catch (err) {
      toast.error("Erro ao importar usuários");
    } finally {
      setIsImporting(false);
    }
  };

  useEffect(() => {
    // Auto-import the provided data for the user
    const csvData = `Nome_Completo;Apelido_PDF;Email;Funcoes_Aptas;Nivel_Acessos
Adriele Reis;Adriele;adrielemreis16@gmail.com;Projeção;Usuário
Ana Paula Antunes Araujo;Ana Paula;anapaula.antunesaraujo@gmail.com;Projeção,Som,Vocal;Administrador
Isabela Lenzi;Isabela P.;isabelapereira2503@gmail.com;Projeção;Administrador
Bruno Lenzi;Bruno Lenzi;brunolenziproducoes@gmail.com;Som,Iluminação,Projeção;Administrador
Nícolas Jesus;Nicolas;nicolasajesus27@gmail.com;Projeção;Usuário
Nicoly Alexandra;Nicolly;nicolyalexandraitj@gmail.com;Projeção;Usuário
Anny Sousa;Anny;williane.sousa@gmail.com;Projeção;Usuário
Gabie Felisberto;Gabriela F.;gabriela.vitoria.felisberto@outlook.com;Projeção,vocal;Usuário
Taís Araujo;Taís;araujotais264@gmail.com;Projeção;Usuário
Ana Carla;Ana Carla;anacarlapequena54@gmail.com;Projeção;Usuário
Jeniffer Borges;Jeni;jenifferborges94@gmail.com;Projeção;Usuário`;
    
    // Only import if users list is empty to avoid overwriting
    if (users.length === 0) {
      handleManualImport(csvData);
    }
  }, []);

  const handleUserImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      await handleManualImport(text);
    };
    reader.readAsText(file);
  };

  const handlePDFImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("PDF Import started");
    if (!e.target.files?.[0]) return;
    setIsImporting(true);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;
      
      const file = e.target.files[0];
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(" ");
      }
      const pdfData = { text: fullText };
      
      const prompt = `
        Você é um assistente especialista em extração de dados. Vou te enviar o conteúdo extraído de um PDF de escalas de voluntários de uma igreja. A formatação original foi perdida, então você precisa aplicar lógica para agrupar os dados.

        Regras de Extração:
        1. Identifique os blocos de eventos: Procure por datas seguidas de horários (Ex: '06 de Abril Segunda 20h' ou '12 de Abril Domingo 9h30' ).
        2. Identifique o Evento: Logo após ou próximo à data, procure o nome do culto/evento (Ex: 'CULTO DA CIDADE' , 'TAMO JUNTO-2026' , 'ALMOÇO SOLIDÁRIO' ). Se não houver nome claro, chame de 'Culto Regular'.
        3. Mapeie as Funções: Para cada bloco de data, procure as seguintes funções padrão: Vocal, Violão, Guitarra, Baixo, Bateria, Teclado, Som, Iluminação e Projeção.
        4. Associe os Nomes: O nome do voluntário geralmente aparece nas linhas imediatamente após a função. Atenção: Pode haver mais de uma pessoa para a mesma função (Ex: 'Vocal', e na sequência 'Isabely', 'Pedro' ). Se isso acontecer, crie uma linha separada para cada pessoa. Se não houver nome após a função, ignore-a.
        
        CRÍTICO - ALINHAMENTO DE LINHAS (Row-based parsing):
        A extração está sofrendo de desalinhamento horizontal. Você DEVE aplicar um método de extração estrito 'linha por linha':
        - A data que está na primeira coluna à esquerda deve ser vinculada ÚNICA e EXCLUSIVAMENTE às funções e nomes que compartilham a exata mesma faixa horizontal (coordenada Y).
        - Se houver um espaço em branco entre a data e os voluntários, NÃO pule para a próxima linha; mantenha a leitura na mesma altura horizontal até o fim da página.
        - Não misture voluntários de uma linha superior com a data da linha inferior.
        
        5. Formato de Saída (Obrigatório): Não me responda com texto comum. Retorne APENAS um formato de tabela CSV, usando ponto e vírgula (;) como separador, com o seguinte cabeçalho exato: Data;Horario;Nome_Evento;Funcao;Voluntario.
        
        Regras de Formatação de Dados:
        - Data: Deve estar no formato YYYY-MM-DD (ex: 2026-04-06).
        - Horario: Deve estar no formato HH:mm (ex: 20:00, 09:30).
        
        Não use blocos de código markdown na resposta, apenas o texto bruto do CSV.
        
        Texto: "${pdfData.text.substring(0, 20000)}"
      `;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      const csvStr = (response.text || '').replace(/```csv/g, '').replace(/```/g, '').trim();
      console.log("PDF Parsing CSV:", csvStr);
      
      const Papa = await import('papaparse');
      const results = Papa.parse(csvStr, { header: true, delimiter: ';' });
      const escalas = results.data as any[];
      
      for (const item of escalas) {
        if (!item.Data || !item.Nome_Evento) continue;

        // Parse date and time
        const [year, month, day] = item.Data.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        
        const [hours, minutes] = item.Horario.split(':').map(Number);
        dateObj.setHours(hours, minutes);
        const isoDate = dateObj.toISOString();

        // Check if event already exists
        const q = query(collection(db, 'eventos'), where('nomeEvento', '==', item.Nome_Evento));
        const querySnapshot = await getDocs(q);
        
        let eventRef = querySnapshot.docs.find(doc => doc.data().dataHoraInicio.startsWith(item.Data))?.ref;

        if (!eventRef) {
          eventRef = await addDoc(collection(db, 'eventos'), {
            nomeEvento: item.Nome_Evento,
            dataHoraInicio: isoDate,
            isEventoEspecial: false
          });
        }
        
        if (item.Voluntario && item.Funcao) {
          const escQ = query(collection(db, 'escalas'), where('eventoId', '==', eventRef.id), where('funcao', '==', item.Funcao), where('apelidoVoluntarioPDF', '==', item.Voluntario));
          const escSnap = await getDocs(escQ);
          if (escSnap.empty) {
            await addDoc(collection(db, 'escalas'), {
              eventoId: eventRef.id,
              funcao: item.Funcao,
              apelidoVoluntarioPDF: item.Voluntario,
              isLider: false,
              isBriefing: false
            });
          }
        }
      }
      toast.success("Escalas importadas via PDF com sucesso!");
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao importar escalas via PDF: ${err.message || err}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-1.5 rounded-lg">
              <Users className="text-white h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Allelon</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium">{user?.displayName || profile?.nomeCompleto}</p>
              <p className="text-xs text-slate-500 capitalize">{isAdmin ? 'Administrador' : 'Usuário'}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut(auth)}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Usuário</DialogTitle>
            </DialogHeader>
            {editingUser && (
              <div className="space-y-4">
                <Input 
                  value={editingUser.nomeCompleto} 
                  onChange={e => setEditingUser({...editingUser, nomeCompleto: e.target.value})}
                  placeholder="Nome Completo"
                />
                <Select 
                  value={editingUser.nivelAcesso} 
                  onValueChange={v => setEditingUser({...editingUser, nivelAcesso: v as 'admin' | 'user'})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="user">Usuário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
              <Button onClick={handleUpdateUser}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editingEvento} onOpenChange={() => setEditingEvento(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Evento</DialogTitle>
            </DialogHeader>
            {editingEvento && (
              <div className="space-y-4">
                <Input 
                  value={editingEvento.nomeEvento} 
                  onChange={e => setEditingEvento({...editingEvento, nomeEvento: e.target.value})}
                  placeholder="Nome do Evento"
                />
                <Input 
                  type="datetime-local"
                  value={
                    editingEvento.dataHoraInicio && !isNaN(new Date(editingEvento.dataHoraInicio).getTime()) 
                      ? new Date(new Date(editingEvento.dataHoraInicio).getTime() - new Date(editingEvento.dataHoraInicio).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                      : ''
                  }
                  onChange={e => {
                    if (e.target.value) {
                      const localDate = new Date(e.target.value);
                      if (!isNaN(localDate.getTime())) {
                        setEditingEvento({...editingEvento, dataHoraInicio: localDate.toISOString()});
                      }
                    } else {
                      setEditingEvento({...editingEvento, dataHoraInicio: ''});
                    }
                  }}
                />
                <div className="space-y-2">
                  <h4 className="font-semibold">Voluntários</h4>
                  {editingEvento.escalas.map((esc, index) => (
                    <div key={esc.id} className="flex gap-2 items-center">
                      <Input value={esc.funcao} disabled className="w-1/3" />
                      <Input 
                        value={esc.apelidoVoluntarioPDF} 
                        onChange={e => {
                          const newEscalas = [...editingEvento.escalas];
                          newEscalas[index].apelidoVoluntarioPDF = e.target.value;
                          setEditingEvento({...editingEvento, escalas: newEscalas});
                        }}
                      />
                      <div className="flex items-center gap-2 text-xs">
                        <label className="flex items-center gap-1">
                          <input 
                            type="checkbox" 
                            checked={esc.isLider || false}
                            onChange={e => {
                              const newEscalas = [...editingEvento.escalas];
                              newEscalas[index].isLider = e.target.checked;
                              setEditingEvento({...editingEvento, escalas: newEscalas});
                            }}
                          /> Lider
                        </label>
                        <label className="flex items-center gap-1">
                          <input 
                            type="checkbox" 
                            checked={esc.isBriefing || false}
                            onChange={e => {
                              const newEscalas = [...editingEvento.escalas];
                              newEscalas[index].isBriefing = e.target.checked;
                              setEditingEvento({...editingEvento, escalas: newEscalas});
                            }}
                          /> Briefing
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingEvento(null)}>Cancelar</Button>
              <Button onClick={handleUpdateEvento}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Horário em Lote</DialogTitle>
            </DialogHeader>
            <Input 
              type="time"
              value={bulkTime}
              onChange={e => setBulkTime(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkEditOpen(false)}>Cancelar</Button>
              <Button onClick={handleBulkEditTime}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="dashboard" className="space-y-8">
          <div className="flex items-center justify-between overflow-x-auto pb-2">
            <TabsList className="bg-white border shadow-xs">
              <TabsTrigger value="dashboard" className="gap-2">
                <User className="h-4 w-4" /> Tela inicial
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-2">
                <CalendarDays className="h-4 w-4" /> Calendário
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="admin" className="gap-2">
                  <Upload className="h-4 w-4" /> Admin
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-4">Minhas Próximas Escalas</h2>
              {myEscalas.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myEscalas.map((item) => (
                    <Card key={item.id} className="overflow-hidden hover:shadow-md transition-shadow">
                      <div className="h-2 bg-primary" />
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <Badge variant="secondary" className="mb-2">{item.funcao}</Badge>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadICS(item.evento)}>
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a href={generateGoogleCalendarUrl(item.evento)} target="_blank" rel="noreferrer">
                                <CalendarIcon className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        </div>
                        <CardTitle className="text-lg">{item.evento.nomeEvento}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 text-slate-600">
                          <CalendarIcon className="h-4 w-4" />
                          <span className="text-sm">
                            {format(new Date(item.evento.dataHoraInicio || new Date().toISOString()), "PPPP 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="bg-slate-100 border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-slate-500">
                    <CheckCircle2 className="h-12 w-12 mb-4 opacity-20" />
                    <p>Você não tem escalas confirmadas no momento.</p>
                  </CardContent>
                </Card>
              )}
            </section>
          </TabsContent>

          <TabsContent value="calendar" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Selecione uma Data</CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    className="rounded-md border"
                    locale={ptBR}
                  />
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>
                    {selectedDate ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR }) : 'Eventos'}
                  </CardTitle>
                  <CardDescription>Voluntários escalados para este dia</CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedDate && (
                    <div className="space-y-6">
                      {eventos
                        .filter(ev => isSameDay(new Date(ev.dataHoraInicio || new Date().toISOString()), selectedDate))
                        .map(ev => (
                          <div key={ev.id} className="space-y-4">
                            <div className="flex items-center justify-between border-b pb-2">
                              <h3 className="font-bold text-lg text-primary">{ev.nomeEvento}</h3>
                              <span className="text-sm text-slate-500">{format(new Date(ev.dataHoraInicio || new Date().toISOString()), 'HH:mm')}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {ev.escalas.length > 0 ? (
                                ev.escalas.map(esc => (
                                  <div key={esc.id} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-xs">
                                    <div>
                                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{esc.funcao}</p>
                                      <p className="font-medium">{esc.apelidoVoluntarioPDF}</p>
                                    </div>
                                    {!esc.usuarioId && (
                                      <Popover>
                                        <PopoverTrigger>
                                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                                        </PopoverTrigger>
                                        <PopoverContent className="text-xs">
                                          Voluntário não identificado no sistema.
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <p className="text-sm text-slate-400 italic">Nenhuma escala definida para este evento.</p>
                              )}
                            </div>
                          </div>
                        ))}
                      {eventos.filter(ev => isSameDay(new Date(ev.dataHoraInicio || new Date().toISOString()), selectedDate)).length === 0 && (
                        <p className="text-center py-8 text-slate-400">Nenhum evento programado para este dia.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="admin" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" /> Importar Usuários
                    </CardTitle>
                    <CardDescription>Upload do CSV com a base de voluntários</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
                        <Input 
                          type="file" 
                          accept=".csv" 
                          className="absolute inset-0 opacity-0 cursor-pointer" 
                          onChange={handleUserImport}
                          disabled={isImporting}
                        />
                        <Upload className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                        <p className="text-sm font-medium">Clique ou arraste o arquivo CSV</p>
                        <p className="text-xs text-slate-400 mt-1">Colunas: Nome_Completo, Apelido_PDF, Email, Funcoes_Aptas, Nivel_Acesso</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" /> Gestão de Voluntários
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={linkVoluntarios} className="w-full">Vincular Voluntários Automaticamente</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5" /> Importar Escalas
                    </CardTitle>
                    <CardDescription>Upload do PDF com as escalas mensais</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <label className="block border-2 border-dashed rounded-lg p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
                        <Input 
                          type="file" 
                          accept=".pdf" 
                          className="hidden" 
                          onChange={handlePDFImport}
                          disabled={isImporting}
                        />
                        {isImporting ? (
                          <div className="flex flex-col items-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                            <p className="text-sm font-medium text-primary">Processando PDF...</p>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                            <p className="text-sm font-medium">Clique ou arraste o arquivo PDF</p>
                            <p className="text-xs text-slate-400 mt-1">O sistema extrairá os dados automaticamente</p>
                          </>
                        )}
                      </label>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Gestão de Usuários</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Nível</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.nomeCompleto}</TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell>
                            <Badge variant={u.nivelAcesso === 'admin' ? 'default' : 'outline'}>
                              {u.nivelAcesso}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => setEditingUser(u)}>Editar</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Gestão de Eventos</CardTitle>
                  <div className="flex gap-2">
                    {selectedEventos.size > 0 && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setBulkEditOpen(true)}>
                          Editar Horário em Lote
                        </Button>
                        <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
                          Excluir {selectedEventos.size} selecionados
                        </Button>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 mb-4">
                    <Input 
                      placeholder="Filtrar por nome..." 
                      value={nameFilter} 
                      onChange={e => setNameFilter(e.target.value)} 
                    />
                    <Input 
                      placeholder="Filtrar por horário (ex: 20:00)..." 
                      value={timeFilter} 
                      onChange={e => setTimeFilter(e.target.value)} 
                    />
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <input 
                            type="checkbox" 
                            checked={filteredEventos.length > 0 && selectedEventos.size === filteredEventos.length}
                            onChange={() => {
                              if (selectedEventos.size === filteredEventos.length) {
                                setSelectedEventos(new Set());
                              } else {
                                setSelectedEventos(new Set(filteredEventos.map(e => e.id)));
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Voluntários</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEventos.map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell>
                            <input 
                              type="checkbox" 
                              checked={selectedEventos.has(ev.id)}
                              onChange={() => handleToggleEvento(ev.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{ev.nomeEvento}</TableCell>
                          <TableCell>{format(new Date(ev.dataHoraInicio || new Date().toISOString()), 'dd/MM/yyyy HH:mm')}</TableCell>
                          <TableCell>
                            <div className="flex -space-x-2">
                              {ev.escalas.slice(0, 3).map((esc, i) => (
                                <div key={i} className="h-8 w-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold">
                                  {esc.apelidoVoluntarioPDF.substring(0, 2).toUpperCase()}
                                </div>
                              ))}
                              {ev.escalas.length > 3 && (
                                <div className="h-8 w-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500">
                                  +{ev.escalas.length - 3}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setEditingEvento(ev)}>Editar</Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteEvento(ev.id)} className="text-red-500 hover:text-red-700">Excluir</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </main>
      <Toaster position="top-center" />
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return user ? <Dashboard /> : <LoginScreen />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
