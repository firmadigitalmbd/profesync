"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type PdfBulletin = {
  institution: string;
  courseLabel: string;
  year: number;
  periodLabel: string;
  teacherName: string;
  student: {
    name: string;
    document: string | null;
    rows: { subject: string; grade: number | null; performance: string; absences: number }[];
    average: number | null;
  };
  pass: number;
  /** Observación opcional del docente para este boletín. */
  observation?: string;
  /** URL firmada de la foto (opcional; si no carga se omite). */
  photoUrl?: string | null;
};

async function loadImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    // La foto se guarda en WebP; jsPDF no la lee, así que se pasa a JPEG con un canvas.
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

/** Genera el boletín como archivo PDF (en el navegador, sin servidor). */
export async function buildBulletinPdf(data: PdfBulletin): Promise<File> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = 56;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(data.institution || "Boletín de calificaciones", margin, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Boletín de calificaciones — ${data.periodLabel}`, margin, y);
  y += 16;
  doc.setTextColor(100);
  doc.text(`Año lectivo ${data.year}`, margin, y);
  doc.setTextColor(0);
  y += 22;

  // Ficha del estudiante (con foto si hay)
  const photo = data.photoUrl ? await loadImage(data.photoUrl) : null;
  const boxHeight = 64;
  doc.setDrawColor(210);
  doc.roundedRect(margin, y, width - margin * 2, boxHeight, 6, 6);
  let textX = margin + 14;
  if (photo) {
    try {
      doc.addImage(photo, "JPEG", margin + 10, y + 8, 48, 48);
      textX = margin + 72;
    } catch {
      // formato no soportado: se omite la foto
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(data.student.name, textX, y + 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(
    `Curso: ${data.courseLabel}${data.student.document ? `   ·   Documento: ${data.student.document}` : ""}`,
    textX,
    y + 44
  );
  doc.setTextColor(0);
  y += boxHeight + 20;

  autoTable(doc, {
    startY: y,
    head: [["Materia", "Nota", "Desempeño", "Faltas"]],
    body: data.student.rows.map((r) => [
      r.subject,
      r.grade === null ? "—" : r.grade.toFixed(1),
      r.performance,
      String(r.absences),
    ]),
    foot: [["Promedio general", data.student.average === null ? "—" : data.student.average.toFixed(1), "", ""]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [31, 41, 55] },
    footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold" },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" } },
    didParseCell: (hook) => {
      if (hook.section === "body" && hook.column.index === 1) {
        const value = Number(hook.cell.raw);
        if (Number.isFinite(value) && value < data.pass) hook.cell.styles.textColor = [192, 57, 43];
      }
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  if (data.observation?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Observaciones", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(data.observation.trim(), width - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 13 + 16;
  }

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Docente: ${data.teacherName}`, margin, y + 20);
  doc.setFontSize(8);
  doc.text("Generado con ProfeSync", margin, doc.internal.pageSize.getHeight() - 30);

  const safe = `${data.student.name}`.replace(/[^\p{L}\p{N} ]/gu, "").trim().replace(/\s+/g, "_");
  const blob = doc.output("blob");
  return new File([blob], `Boletin_${safe}_${data.periodLabel.replace(/\s+/g, "_")}.pdf`, { type: "application/pdf" });
}
