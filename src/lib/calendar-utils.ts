import { format } from 'date-fns';
import { Evento } from './types';

export const generateGoogleCalendarUrl = (evento: Evento) => {
  const start = format(new Date(evento.dataHoraInicio), "yyyyMMdd'T'HHmmss'Z'");
  const end = format(new Date(new Date(evento.dataHoraInicio).getTime() + 60 * 60 * 1000), "yyyyMMdd'T'HHmmss'Z'");
  const details = `Escala para o evento: ${evento.nomeEvento}`;
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(evento.nomeEvento)}&dates=${start}/${end}&details=${encodeURIComponent(details)}&sf=true&output=xml`;
};

export const downloadICS = (evento: Evento) => {
  const start = format(new Date(evento.dataHoraInicio), "yyyyMMdd'T'HHmmss'Z'");
  const end = format(new Date(new Date(evento.dataHoraInicio).getTime() + 60 * 60 * 1000), "yyyyMMdd'T'HHmmss'Z'");
  
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${evento.nomeEvento}`,
    `DESCRIPTION:Escala para o evento: ${evento.nomeEvento}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${evento.nomeEvento}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
